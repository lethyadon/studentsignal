
-- ── Step 1: helper function (no dependencies) ────────────────────────────────
CREATE OR REPLACE FUNCTION current_user_school_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT school_id FROM profiles WHERE id = auth.uid();
$$;

-- ── Step 2: invites table ─────────────────────────────────────────────────────
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

-- ── Step 3: trigger function ──────────────────────────────────────────────────
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
  IF NEW.id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot create a profile for another user';
  END IF;

  IF NEW.school_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO existing_profile_count
  FROM profiles WHERE school_id = NEW.school_id;

  IF existing_profile_count = 0 THEN
    NEW.role := 'admin';
    RETURN NEW;
  END IF;

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

-- ── Step 4: fix profiles policies ─────────────────────────────────────────────
-- Remove both INSERT policies (old open one + the one from previous migration)
DROP POLICY IF EXISTS "insert_profiles" ON profiles;
DROP POLICY IF EXISTS "insert_own_profile" ON profiles;
-- Remove the open SELECT policy
DROP POLICY IF EXISTS "select_profiles" ON profiles;
DROP POLICY IF EXISTS "update_own_profile" ON profiles;
DROP POLICY IF EXISTS "admin_update_school_profiles" ON profiles;

-- Correct SELECT: own row or same school
CREATE POLICY "select_profiles" ON profiles FOR SELECT
  TO authenticated USING (
    id = auth.uid() OR school_id = current_user_school_id()
  );

-- Correct INSERT: only your own row (trigger then validates school/invite)
CREATE POLICY "insert_profiles" ON profiles FOR INSERT
  TO authenticated WITH CHECK (id = auth.uid());

-- Self-update: can change own fields but not role or school_id
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM profiles WHERE id = auth.uid())
    AND school_id IS NOT DISTINCT FROM (SELECT school_id FROM profiles WHERE id = auth.uid())
  );

-- Admin update: can change others in own school
CREATE POLICY "admin_update_school_profiles" ON profiles FOR UPDATE
  TO authenticated
  USING (
    school_id = current_user_school_id()
    AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role IN ('admin', 'slt'))
  )
  WITH CHECK (school_id = current_user_school_id());

-- ── Step 5: touch_updated_at for students ────────────────────────────────────
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_students_updated_at ON students;
CREATE TRIGGER trg_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

