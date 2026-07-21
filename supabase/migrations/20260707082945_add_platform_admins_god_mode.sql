-- ── Platform admins table ────────────────────────────────────────────────────
-- Grant god-mode access by inserting rows:
--   INSERT INTO platform_admins (user_id) VALUES ('<auth-user-id>');
-- Find your user_id: Supabase Dashboard → Authentication → Users

CREATE TABLE IF NOT EXISTS platform_admins (
  user_id    UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

ALTER TABLE platform_admins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_admins_select_own" ON platform_admins
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- ── Helper ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION private.is_platform_admin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.platform_admins WHERE user_id = auth.uid())
$$;

-- ── READ bypass for platform admins on all key tables ─────────────────────────
CREATE POLICY "platform_admin_read_schools"    ON schools              FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_profiles"   ON profiles             FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_students"   ON students             FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_behaviour"  ON behaviour_records    FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_analysis"   ON analysis_results     FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_interventions" ON interventions     FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_comms"      ON communications       FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_careers"    ON career_profiles      FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_notes"      ON quick_notes          FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_recognitions"  ON success_recognitions     FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_dismissals"    ON recommendation_dismissals FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_notifications" ON notifications     FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_uploads"    ON uploads              FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_subscriptions" ON subscriptions     FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_bulletins"  ON bulletins            FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_invites"    ON invites              FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_audit"      ON audit_log            FOR SELECT TO authenticated USING (private.is_platform_admin());
CREATE POLICY "platform_admin_read_integrations" ON integrations       FOR SELECT TO authenticated USING (private.is_platform_admin());

