-- School MIS integrations — one row per system per school.
-- The api_key is a shared secret the school configures in their MIS;
-- it is sent as a Bearer token on every data-sync POST.
CREATE TABLE IF NOT EXISTS public.integrations (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  system_name     text        NOT NULL,  -- 'classcharts', 'arbor', 'sims', 'bromcom', 'cpoms'
  api_key         text        NOT NULL UNIQUE,
  status          text        NOT NULL DEFAULT 'inactive', -- 'inactive', 'active', 'error'
  last_sync_at    timestamptz,
  sync_count      integer     NOT NULL DEFAULT 0,
  records_synced  integer     NOT NULL DEFAULT 0,
  error_message   text,
  enabled         boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (school_id, system_name)
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_integrations" ON public.integrations FOR SELECT
  TO authenticated USING (school_id = private.current_user_school_id());

CREATE POLICY "insert_own_integrations" ON public.integrations FOR INSERT
  TO authenticated WITH CHECK (school_id = private.current_user_school_id());

CREATE POLICY "update_own_integrations" ON public.integrations FOR UPDATE
  TO authenticated
  USING (school_id = private.current_user_school_id())
  WITH CHECK (school_id = private.current_user_school_id());

CREATE POLICY "delete_own_integrations" ON public.integrations FOR DELETE
  TO authenticated USING (school_id = private.current_user_school_id());

-- Sync log — one row per inbound data push, for the audit trail.
CREATE TABLE IF NOT EXISTS public.sync_logs (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id   uuid        NOT NULL REFERENCES public.integrations(id) ON DELETE CASCADE,
  school_id        uuid        NOT NULL,
  source           text        NOT NULL,
  payload_type     text        NOT NULL,  -- 'behaviour', 'attendance', 'students', 'safeguarding'
  records_received integer     NOT NULL DEFAULT 0,
  records_upserted integer     NOT NULL DEFAULT 0,
  status           text        NOT NULL DEFAULT 'success', -- 'success', 'partial', 'error'
  error_details    text,
  created_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_sync_logs" ON public.sync_logs FOR SELECT
  TO authenticated USING (school_id = private.current_user_school_id());

CREATE POLICY "insert_own_sync_logs" ON public.sync_logs FOR INSERT
  TO authenticated WITH CHECK (school_id = private.current_user_school_id());

-- service_role (used by Edge Functions) needs unrestricted insert on these tables
CREATE POLICY "service_insert_integrations" ON public.integrations FOR INSERT
  TO service_role WITH CHECK (true);

CREATE POLICY "service_update_integrations" ON public.integrations FOR UPDATE
  TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "service_insert_sync_logs" ON public.sync_logs FOR INSERT
  TO service_role WITH CHECK (true);

