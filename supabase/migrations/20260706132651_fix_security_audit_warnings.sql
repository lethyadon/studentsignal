-- Fix 1: touch_updated_at — pin search_path so it can't be exploited via
-- a search_path mutation attack
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Fix 2: insert_schools — was WITH CHECK (true), meaning any authenticated user
-- could create unlimited schools. Now restricted: only allowed when the calling
-- user does not already belong to a school (i.e. they're in the initial signup
-- flow creating their first school).
DROP POLICY IF EXISTS "insert_schools" ON public.schools;
CREATE POLICY "insert_schools" ON public.schools FOR INSERT
  TO authenticated
  WITH CHECK (
    NOT EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND school_id IS NOT NULL
    )
  );

-- Fix 3: enforce_profile_creation_rules is a TRIGGER function — it fires
-- automatically via the trigger and never needs to be called by users directly.
-- Revoke public + anon execute so it's not reachable via /rest/v1/rpc/.
REVOKE EXECUTE ON FUNCTION public.enforce_profile_creation_rules() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enforce_profile_creation_rules() FROM anon;

-- Fix 4: current_user_school_id is an RLS helper — authenticated users must
-- keep EXECUTE or the RLS policies that call it will error out for every query.
-- Revoke from anon only (they can't reach any RLS-protected table anyway, so
-- the "anon can call via RPC" surface is the real risk here).
REVOKE EXECUTE ON FUNCTION public.current_user_school_id() FROM anon;

-- Note: "Signed-In Users Can Execute current_user_school_id()" is a known
-- false positive for RLS helper functions. The function is harmless (returns
-- only the caller's own school_id) and MUST remain executable by authenticated
-- for RLS policy evaluation to work. No action needed.

