-- Move current_user_school_id() out of the public schema so PostgREST can no
-- longer reach it via /rest/v1/rpc/, while keeping it callable from RLS
-- policies (which run at the database level, not via the API).

-- ── 1. Private schema (PostgREST only exposes "public" by default) ───────────
CREATE SCHEMA IF NOT EXISTS private;

-- Authenticated users need USAGE on the schema so their RLS policy evaluations
-- can call the function.  They still cannot reach it via REST because PostgREST
-- does not expose the private schema.
GRANT USAGE ON SCHEMA private TO authenticated;

-- ── 2. Re-create the helper in private ───────────────────────────────────────
CREATE OR REPLACE FUNCTION private.current_user_school_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = ''
AS $$
  SELECT school_id FROM public.profiles WHERE id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION private.current_user_school_id() TO authenticated;

-- ── 3. Re-create all 5 live policies to call private.current_user_school_id() ─

-- invites
DROP POLICY IF EXISTS "select_school_invites" ON public.invites;
CREATE POLICY "select_school_invites" ON public.invites FOR SELECT
  TO authenticated USING (
    school_id = private.current_user_school_id()
    OR lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );

DROP POLICY IF EXISTS "insert_school_invites" ON public.invites;
CREATE POLICY "insert_school_invites" ON public.invites FOR INSERT
  TO authenticated WITH CHECK (
    school_id = private.current_user_school_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'slt')
    )
  );

DROP POLICY IF EXISTS "delete_school_invites" ON public.invites;
CREATE POLICY "delete_school_invites" ON public.invites FOR DELETE
  TO authenticated USING (
    school_id = private.current_user_school_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role IN ('admin', 'slt')
    )
  );

-- profiles
DROP POLICY IF EXISTS "select_profiles" ON public.profiles;
CREATE POLICY "select_profiles" ON public.profiles FOR SELECT
  TO authenticated USING (
    id = auth.uid() OR school_id = private.current_user_school_id()
  );

DROP POLICY IF EXISTS "admin_update_school_profiles" ON public.profiles;
CREATE POLICY "admin_update_school_profiles" ON public.profiles FOR UPDATE
  TO authenticated
  USING (
    school_id = private.current_user_school_id()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role IN ('admin', 'slt')
    )
  )
  WITH CHECK (school_id = private.current_user_school_id());

-- ── 4. Remove the public version ─────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.current_user_school_id();

-- ── 5. Revoke authenticated execute from the trigger function ─────────────────
-- enforce_profile_creation_rules() is fired only by its trigger — users never
-- need to call it directly. PostgreSQL fires triggers regardless of whether the
-- calling user has EXECUTE on the trigger function.
REVOKE EXECUTE ON FUNCTION public.enforce_profile_creation_rules() FROM authenticated;

