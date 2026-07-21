/*
# Fix RLS security hole + add invite system

## Problem being fixed
The original "insert_profiles" / "select_profiles" policies used `WITH CHECK (true)` /
`USING (true)`, meaning ANY authenticated user could:
  - insert a profiles row with an arbitrary school_id and role='admin'
  - read every profile in every school
This is a full cross-tenant data breach vector, since every other table's RLS
policy trusts profiles.school_id to decide what a user can see.

## Fix
1. profiles SELECT is now scoped to "your own school only" via a SECURITY DEFINER
   helper function (avoids infinite RLS recursion on the profiles table itself).
2. profiles INSERT is locked down: you can only ever insert a row for your own
   auth.uid(). Beyond that, a BEFORE INSERT trigger enforces:
     - You may become the FIRST admin of a brand new school (signup flow) — this
       is only allowed when that school currently has zero profiles.
     - Otherwise, you must have a valid, unaccepted invite matching your email,
       the target school_id, and the target role. The invite is marked accepted
       and the role/school_id in the invite are enforced (a client can no longer
       just decide to be admin because the row insert says so).
3. New `invites` table so admins can invite staff by email with a specific role,
   instead of the previous flow which called supabase.auth.admin.createUser()
   directly from the browser (that requires a service-role key and will always
   fail with the anon key the app actually ships with).
*/

-- ── Helper: get current user's school without recursive RLS lookups ──────────
CREATE OR REPLACE FUNCTION current_user_school_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT school_id FROM profiles WHERE id = auth.uid();
$$;

-- ── invites table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  email text NOT NULL,
  role text NOT NULL DEFAULT 'staff',
  department text,
  year_groups text[] DEFAULT '{}',
  invited_by uuid REFERENCES profiles(id),
  token uuid NOT NULL DEFAULT gen_random_uuid(),
  accepted_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invites_email ON invites (lower(email));
CREATE INDEX IF NOT EXISTS idx_invites_school_id ON invites (school_id);

ALTER TABLE invites ENABLE ROW LEVEL SECURITY;

-- Admins/SLT of a school can see and create invites for their own school
DROP POLICY IF EXISTS "select_school_invites" ON invites;
CREATE POLICY "select_school_invites" ON invites FOR SELECT
  TO authenticated USING (
    school_id = current_user_school_id()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS "insert_school_invites" ON invites;
CREATE POLICY "insert_school_invites" ON invites FOR INSERT
  TO authenticated WITH CHECK (
    school_id = current_user_school_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'slt')
    )
  );

DROP POLICY IF EXISTS "delete_school_invites" ON invites;
CREATE POLICY "delete_school_invites" ON invites FOR DELETE
  TO authenticated USING (
    school_id = current_user_school_id()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'slt')
    )
  );

-- ── Trigger: enforce invite-or-first-admin rule on profile creation ─────────
CREATE OR REPLACE FUNCTION enforce_profile_creation_rules()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  existing_profile_count integer;
  matching_invite invites%ROWTYPE;
  caller_email text;
BEGIN
  -- Only ever allowed to insert your own row
  IF NEW.id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot create a profile for another user';
  END IF;

  -- No school assignment yet — fine, nothing further to check
  IF NEW.school_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO existing_profile_count
  FROM profiles WHERE school_id = NEW.school_id;

  IF existing_profile_count = 0 THEN
    -- First person to join a brand-new school becomes its admin
    NEW.role := 'admin';
    RETURN NEW;
  END IF;

  -- Otherwise: must have a valid unaccepted invite for this exact school + email
  caller_email := coalesce(auth.jwt() ->> 'email', '');

  SELECT * INTO matching_invite
  FROM invites
  WHERE school_id = NEW.school_id
    AND lower(email) = lower(caller_email)
    AND accepted_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1;

  IF matching_invite.id IS NULL THEN
    RAISE EXCEPTION 'No valid invite found for this school — ask an admin to invite you first';
  END IF;

  -- Role and metadata come from the invite, never from the client-submitted row
  NEW.role := matching_invite.role;
  NEW.department := matching_invite.department;
  NEW.year_groups := matching_invite.year_groups;

  UPDATE invites SET accepted_at = now() WHERE id = matching_invite.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_profile_creation_rules ON profiles;
CREATE TRIGGER trg_enforce_profile_creation_rules
  BEFORE INSERT ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION enforce_profile_creation_rules();

-- ── Lock down profiles SELECT/INSERT/UPDATE ──────────────────────────────────
DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT
  TO authenticated USING (
    id = auth.uid() OR school_id = current_user_school_id()
  );

DROP POLICY IF EXISTS "insert_profiles" ON profiles;
CREATE POLICY "insert_profiles" ON profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());

-- Prevent a user from later editing their own role/school_id to escalate privileges
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    AND school_id IS NOT DISTINCT FROM (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- Admins/SLT can update roles/departments of others in their own school
DROP POLICY IF EXISTS "admin_update_school_profiles" ON profiles;
CREATE POLICY "admin_update_school_profiles" ON profiles FOR UPDATE
  TO authenticated
  USING (
    school_id = current_user_school_id()
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'slt'))
  )
  WITH CHECK (school_id = current_user_school_id());

-- Also tighten schools INSERT: still open to any authenticated user (needed for
-- signup to create a new school) but this is safe now because profiles INSERT
-- is what actually grants access, and that path is locked down above.

