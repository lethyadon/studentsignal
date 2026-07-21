-- ══════════════════════════════════════════════════════════════════════════════
-- StudentSignal: Platform Super Admin
-- Migration: 20260720030000_platform_super_admin.sql
--
-- Platform Super Admin is the StudentSignal platform team — NOT a school role.
-- It is completely separate from school-level administration.
-- School admins can never gain platform-level access.
-- Platform Super Admins bypass school RLS only through audited service-role RPCs.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── Platform admins table ─────────────────────────────────────────────────────
-- Separate from profiles (which is school-level). No school_id column.

CREATE TABLE IF NOT EXISTS platform_admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  full_name     TEXT,
  email         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Platform admins cannot be created by school admins — only via service role or
-- direct DB insert by the platform team. No INSERT policy for authenticated role.
ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_read_self" ON platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- ── Platform audit log (immutable) ───────────────────────────────────────────
-- Every platform admin action is recorded here. Rows are never deleted.

CREATE TABLE IF NOT EXISTS platform_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_admin  UUID NOT NULL REFERENCES platform_admins(user_id) ON DELETE RESTRICT,
  tenant_id       UUID REFERENCES schools(id) ON DELETE SET NULL,
  action          TEXT NOT NULL,
  reason          TEXT,
  affected_data   JSONB,
  ip_address      INET,
  success         BOOLEAN NOT NULL DEFAULT TRUE,
  error_detail    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Platform admins can write to the audit log (via RPC only). Never delete.
ALTER TABLE platform_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_audit_read_own" ON platform_audit_log
  FOR SELECT TO authenticated
  USING (platform_admin = auth.uid());

CREATE POLICY "platform_audit_insert_own" ON platform_audit_log
  FOR INSERT TO authenticated
  WITH CHECK (platform_admin = auth.uid());

-- ── School archival ───────────────────────────────────────────────────────────

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS archived_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by        UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS archive_reason     TEXT,
  ADD COLUMN IF NOT EXISTS purge_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purge_requested_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS purge_reason       TEXT,
  ADD COLUMN IF NOT EXISTS purge_confirmed_name TEXT;   -- must match school.name before purge executes

-- ── Tenant health view (platform admin only, via service role) ────────────────

CREATE TABLE IF NOT EXISTS tenant_health (
  school_id           UUID PRIMARY KEY REFERENCES schools(id) ON DELETE CASCADE,
  last_analysis_at    TIMESTAMPTZ,
  last_ingestion_at   TIMESTAMPTZ,
  student_count       INTEGER DEFAULT 0,
  active_signal_count INTEGER DEFAULT 0,
  open_action_count   INTEGER DEFAULT 0,
  ingestion_errors    INTEGER DEFAULT 0,
  last_error_at       TIMESTAMPTZ,
  last_error_detail   TEXT,
  integration_status  JSONB DEFAULT '{}',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- School-level staff cannot see tenant health
ALTER TABLE tenant_health ENABLE ROW LEVEL SECURITY;
-- No SELECT policy for authenticated role — only accessible via service-role RPCs

-- ── Feature flags ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform_feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flag_key    TEXT NOT NULL UNIQUE,
  flag_value  JSONB NOT NULL DEFAULT 'true',
  applies_to  TEXT DEFAULT 'all',  -- 'all' | school_id
  description TEXT,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES auth.users(id)
);

-- dsl_can_manage_users flag (default: false — configurable per school)
INSERT INTO platform_feature_flags (flag_key, flag_value, applies_to, description)
VALUES ('dsl_can_manage_users', 'false', 'all', 'Allow DSL role to invite and edit user accounts. False by default — enable per school where the DSL is also the data manager.')
ON CONFLICT (flag_key) DO NOTHING;

ALTER TABLE platform_feature_flags ENABLE ROW LEVEL SECURITY;
-- School staff can read flags that apply to them (for feature gating)
CREATE POLICY "flags_select_applicable" ON platform_feature_flags
  FOR SELECT TO authenticated
  USING (applies_to = 'all' OR applies_to = private.current_user_school_id()::text);

-- ── Platform RPCs (service-role only — called by edge functions) ──────────────

-- Safe purge: requires confirmed name match, creates audit record, never immediate
CREATE OR REPLACE FUNCTION platform_request_purge(
  p_school_id   UUID,
  p_reason      TEXT,
  p_admin_id    UUID  -- platform admin user_id
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school_name TEXT;
BEGIN
  -- Verify caller is a platform admin
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = p_admin_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Caller is not an active platform administrator';
  END IF;

  SELECT name INTO v_school_name FROM schools WHERE id = p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;

  -- Mark purge as requested (NOT executed yet — requires separate confirmation step)
  UPDATE schools SET
    purge_requested_at = NOW(),
    purge_requested_by = p_admin_id,
    purge_reason       = p_reason
  WHERE id = p_school_id;

  -- Audit
  INSERT INTO platform_audit_log (platform_admin, tenant_id, action, reason, affected_data)
  VALUES (p_admin_id, p_school_id, 'purge_requested', p_reason,
          jsonb_build_object('school_name', v_school_name));

  RETURN jsonb_build_object(
    'status', 'purge_requested',
    'school_name', v_school_name,
    'message', 'Purge has been requested. To execute, confirm by providing the exact school name in platform_execute_purge().'
  );
END;
$$;

-- Execute purge only after name confirmation
CREATE OR REPLACE FUNCTION platform_execute_purge(
  p_school_id     UUID,
  p_confirmed_name TEXT,
  p_admin_id      UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_school   schools%ROWTYPE;
  v_counts   JSONB;
BEGIN
  -- Verify platform admin
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = p_admin_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Caller is not an active platform administrator';
  END IF;

  SELECT * INTO v_school FROM schools WHERE id = p_school_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'School not found'; END IF;

  -- Require matching name
  IF v_school.name != p_confirmed_name THEN
    RAISE EXCEPTION 'School name confirmation does not match. Provided: %, Actual: %', p_confirmed_name, v_school.name;
  END IF;

  -- Require prior purge request
  IF v_school.purge_requested_at IS NULL THEN
    RAISE EXCEPTION 'No purge has been requested for this school. Call platform_request_purge() first.';
  END IF;

  -- Collect counts for audit before deletion
  SELECT jsonb_build_object(
    'students', (SELECT COUNT(*) FROM students WHERE school_id = p_school_id),
    'behaviour_records', (SELECT COUNT(*) FROM behaviour_records WHERE school_id = p_school_id),
    'interventions', (SELECT COUNT(*) FROM interventions WHERE school_id = p_school_id),
    'analysis_results', (SELECT COUNT(*) FROM analysis_results WHERE school_id = p_school_id),
    'safeguarding_records', (SELECT COUNT(*) FROM safeguarding_records WHERE school_id = p_school_id)
  ) INTO v_counts;

  -- Soft-archive first (set archived_at)
  UPDATE schools SET archived_at = NOW(), archived_by = p_admin_id, archive_reason = v_school.purge_reason
  WHERE id = p_school_id;

  -- Cascade delete school data (RLS ensures only this school's data)
  -- Hard deletes in dependency order
  DELETE FROM analysis_results WHERE school_id = p_school_id;
  DELETE FROM interventions WHERE school_id = p_school_id;
  DELETE FROM behaviour_records WHERE school_id = p_school_id;
  DELETE FROM attendance_records WHERE school_id = p_school_id;
  DELETE FROM safeguarding_records WHERE school_id = p_school_id;
  DELETE FROM pastoral_notes WHERE school_id = p_school_id;
  DELETE FROM notifications WHERE school_id = p_school_id;
  DELETE FROM intelligence_insights WHERE school_id = p_school_id;
  DELETE FROM students WHERE school_id = p_school_id;
  DELETE FROM profiles WHERE school_id = p_school_id;

  -- Audit the purge
  INSERT INTO platform_audit_log (platform_admin, tenant_id, action, reason, affected_data)
  VALUES (p_admin_id, p_school_id, 'purge_executed', v_school.purge_reason,
          v_counts || jsonb_build_object('school_name', v_school.name, 'confirmed_name', p_confirmed_name));

  RETURN jsonb_build_object('status', 'purged', 'school_name', v_school.name, 'datasets_deleted', v_counts);
END;
$$;

-- Archive school (soft — data preserved, school hidden from normal use)
CREATE OR REPLACE FUNCTION platform_archive_school(
  p_school_id UUID, p_reason TEXT, p_admin_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM platform_admins WHERE user_id = p_admin_id AND is_active = TRUE) THEN
    RAISE EXCEPTION 'Not a platform administrator';
  END IF;
  UPDATE schools SET archived_at = NOW(), archived_by = p_admin_id, archive_reason = p_reason
  WHERE id = p_school_id;
  INSERT INTO platform_audit_log (platform_admin, tenant_id, action, reason)
  VALUES (p_admin_id, p_school_id, 'school_archived', p_reason);
  RETURN jsonb_build_object('status', 'archived');
END;
$$;

-- Grant (service role only — no authenticated grant)
-- These RPCs are called by edge functions authenticated as service role, not by school users.
