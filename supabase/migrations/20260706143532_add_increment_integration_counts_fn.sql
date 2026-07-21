-- Helper function used by the data-sync edge function to atomically
-- increment sync_count and records_synced on an integration row.
CREATE OR REPLACE FUNCTION public.increment_integration_counts(
  p_integration_id uuid,
  p_synced         integer
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  UPDATE public.integrations
  SET sync_count     = sync_count + 1,
      records_synced = records_synced + p_synced
  WHERE id = p_integration_id;
$$;

-- Grant to service_role only — called by the edge function, not end users.
REVOKE EXECUTE ON FUNCTION public.increment_integration_counts(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.increment_integration_counts(uuid, integer) TO service_role;

