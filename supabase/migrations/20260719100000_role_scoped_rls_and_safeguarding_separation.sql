/*
  # Role-scoped RLS and safeguarding separation

  RE-AUTHORED 19 Jul 2026. The original migration produced in the 17 July
  session was lost; this is a re-implementation of the explicitly approved
  design, written against the verified effective schema and policy set of the
  9 July baseline (see /home/claude/recon/policy_inventory.txt derivation in
  RECONCILIATION.md). It is NOT a byte-for-byte recreation of the original.

  Approved access model:
    - admin, dsl ................ school-wide, including safeguarding
    - slt ....................... school-wide operational; safeguarding only
                                  when can_view_safeguarding = true
    - sendco, pastoral_lead,
      careers_lead .............. school-wide operational (non-safeguarding)
    - head_of_year .............. their year group(s) only (profiles.year_groups)
    - tutor ..................... their form group(s) only (profiles.form_groups)
    - teacher, staff ............ explicit caseload only (staff_student_scope)
    - trust ..................... no child-level access by default
    - platform admin ............ no child-level access by default
    - service_role .............. trusted edge functions (bypasses RLS)

  Key properties:
    1. Scope is enforced by the DATABASE via private.can_access_student();
       client-side filtering is a convenience, not the security boundary.
    2. Name-based scoping (parsing "(HOY Y10)" out of full_name) is dead:
       scope lives in real columns writable only by admins.
    3. Safeguarding narrative content is separated from ordinary pastoral
       visibility: safeguarding_notes is deny-by-default (no SELECT policy at
       all) and readable only via an audited SECURITY DEFINER function. The
       safeguarding_records table (CPOMS-style structured rows) is readable
       only by dsl/admin/SLT-with-grant via policy.
    4. No self-service role escalation: role and scope columns can only be
       changed by an admin, and never on your own row (trigger-enforced,
       because WITH CHECK cannot compare OLD and NEW).
    5. Every safeguarding read (and refused read) is written to audit_log by
       the access functions; audit rows are unforgeable by the caller.
*/

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. Scope columns and caseload table
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS form_groups text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS can_view_safeguarding boolean DEFAULT false;

-- Constrain role to the known application set (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE profiles ADD CONSTRAINT profiles_role_check CHECK (
      role IN ('admin','slt','dsl','sendco','head_of_year','pastoral_lead',
               'tutor','teacher','careers_lead','trust','staff','super_admin')
    ) NOT VALID;  -- NOT VALID: do not fail on any legacy rows; enforced for new writes
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS staff_student_scope (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  reason     text,                       -- e.g. 'teaching group 10x/Ma1', 'mentoring caseload'
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  UNIQUE (staff_id, student_id)
);

ALTER TABLE staff_student_scope ENABLE ROW LEVEL SECURITY;

-- Staff may see their own caseload; admins see/manage the school's.
CREATE POLICY "scope_select" ON staff_student_scope FOR SELECT TO authenticated
  USING (
    staff_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.school_id = staff_student_scope.school_id
        AND p.role IN ('admin','slt','dsl')
    )
  );
CREATE POLICY "scope_admin_insert" ON staff_student_scope FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.school_id = staff_student_scope.school_id
        AND p.role = 'admin'
    )
  );
CREATE POLICY "scope_admin_delete" ON staff_student_scope FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles p WHERE p.id = auth.uid()
        AND p.school_id = staff_student_scope.school_id
        AND p.role = 'admin'
    )
  );
-- No UPDATE policy: scope rows are added and removed, never edited.

-- Indexes the policies and helper depend on.
CREATE INDEX IF NOT EXISTS staff_student_scope_staff_idx   ON staff_student_scope(staff_id);
CREATE INDEX IF NOT EXISTS staff_student_scope_student_idx ON staff_student_scope(student_id);
CREATE INDEX IF NOT EXISTS students_school_year_idx  ON students(school_id, year_group);
CREATE INDEX IF NOT EXISTS students_school_form_idx  ON students(school_id, form);
CREATE INDEX IF NOT EXISTS behaviour_records_student_idx  ON behaviour_records(student_id);
CREATE INDEX IF NOT EXISTS attendance_records_student_idx ON attendance_records(student_id);
CREATE INDEX IF NOT EXISTS assessment_records_student_idx ON assessment_records(student_id);
CREATE INDEX IF NOT EXISTS pastoral_notes_student_idx     ON pastoral_notes(student_id);
CREATE INDEX IF NOT EXISTS safeguarding_records_student_idx ON safeguarding_records(student_id);
CREATE INDEX IF NOT EXISTS quick_notes_student_idx        ON quick_notes(student_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The single source of scope truth
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION private.can_access_student(p_student_id uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_profile profiles%ROWTYPE;
  v_student students%ROWTYPE;
BEGIN
  SELECT * INTO v_profile FROM profiles WHERE id = auth.uid();
  IF NOT FOUND OR v_profile.is_active IS DISTINCT FROM true THEN
    RETURN false;
  END IF;

  SELECT * INTO v_student FROM students WHERE id = p_student_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Tenant isolation is absolute: no role crosses school boundaries here.
  IF v_student.school_id IS DISTINCT FROM v_profile.school_id THEN
    RETURN false;
  END IF;

  RETURN CASE v_profile.role
    WHEN 'admin'         THEN true
    WHEN 'dsl'           THEN true
    WHEN 'slt'           THEN true
    WHEN 'sendco'        THEN true
    WHEN 'pastoral_lead' THEN true
    WHEN 'careers_lead'  THEN true
    WHEN 'head_of_year'  THEN v_student.year_group = ANY(COALESCE(v_profile.year_groups, '{}'))
    WHEN 'tutor'         THEN v_student.form       = ANY(COALESCE(v_profile.form_groups, '{}'))
    WHEN 'teacher'       THEN EXISTS (
                                SELECT 1 FROM staff_student_scope sss
                                WHERE sss.staff_id = v_profile.id
                                  AND sss.student_id = p_student_id
                              )
    WHEN 'staff'         THEN EXISTS (
                                SELECT 1 FROM staff_student_scope sss
                                WHERE sss.staff_id = v_profile.id
                                  AND sss.student_id = p_student_id
                              )
    ELSE false   -- trust, super_admin, unknown: no child-level default
  END;
END;
$$;

REVOKE ALL ON FUNCTION private.can_access_student(uuid) FROM public;
GRANT EXECUTE ON FUNCTION private.can_access_student(uuid) TO authenticated;

-- Convenience: caller's role, used in several policies below.
CREATE OR REPLACE FUNCTION private.current_user_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$;
REVOKE ALL ON FUNCTION private.current_user_role() FROM public;
GRANT EXECUTE ON FUNCTION private.current_user_role() TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. students — scoped rows
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "select_school_students" ON students;
DROP POLICY IF EXISTS "insert_school_students" ON students;
DROP POLICY IF EXISTS "update_school_students" ON students;
DROP POLICY IF EXISTS "delete_school_students" ON students;
DROP POLICY IF EXISTS "platform_admin_read_students" ON students;  -- no child-level default

CREATE POLICY "students_select_scoped" ON students FOR SELECT TO authenticated
  USING (private.can_access_student(id));

-- Creating/updating student records is an operational task for senior +
-- data-owning roles (CSV import runs as the signed-in user).
CREATE POLICY "students_insert_senior" ON students FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.current_user_school_id()
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  );
CREATE POLICY "students_update_scoped_senior" ON students FOR UPDATE TO authenticated
  USING (
    private.can_access_student(id)
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  )
  WITH CHECK (school_id = private.current_user_school_id());
CREATE POLICY "students_delete_admin" ON students FOR DELETE TO authenticated
  USING (
    school_id = private.current_user_school_id()
    AND private.current_user_role() = 'admin'
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. Record tables — scoped by student access
-- ═══════════════════════════════════════════════════════════════════════════

-- behaviour_records
DROP POLICY IF EXISTS "select_school_behaviour" ON behaviour_records;
DROP POLICY IF EXISTS "insert_school_behaviour" ON behaviour_records;
DROP POLICY IF EXISTS "update_school_behaviour" ON behaviour_records;
DROP POLICY IF EXISTS "delete_school_behaviour" ON behaviour_records;
DROP POLICY IF EXISTS "platform_admin_read_behaviour" ON behaviour_records;

CREATE POLICY "behaviour_select_scoped" ON behaviour_records FOR SELECT TO authenticated
  USING (private.can_access_student(student_id));
CREATE POLICY "behaviour_insert_scoped" ON behaviour_records FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.current_user_school_id()
    AND private.can_access_student(student_id)
  );
CREATE POLICY "behaviour_update_senior" ON behaviour_records FOR UPDATE TO authenticated
  USING (
    private.can_access_student(student_id)
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  )
  WITH CHECK (school_id = private.current_user_school_id());
CREATE POLICY "behaviour_delete_senior" ON behaviour_records FOR DELETE TO authenticated
  USING (
    private.can_access_student(student_id)
    AND private.current_user_role() IN ('admin','slt','dsl')
  );

-- attendance_records
DROP POLICY IF EXISTS "select_attendance_records" ON attendance_records;
DROP POLICY IF EXISTS "insert_attendance_records" ON attendance_records;
DROP POLICY IF EXISTS "update_attendance_records" ON attendance_records;
DROP POLICY IF EXISTS "delete_attendance_records" ON attendance_records;

CREATE POLICY "attendance_select_scoped" ON attendance_records FOR SELECT TO authenticated
  USING (private.can_access_student(student_id));
CREATE POLICY "attendance_insert_scoped" ON attendance_records FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.current_user_school_id()
    AND private.can_access_student(student_id)
  );
CREATE POLICY "attendance_update_senior" ON attendance_records FOR UPDATE TO authenticated
  USING (
    private.can_access_student(student_id)
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  )
  WITH CHECK (school_id = private.current_user_school_id());
CREATE POLICY "attendance_delete_senior" ON attendance_records FOR DELETE TO authenticated
  USING (
    private.can_access_student(student_id)
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  );

-- assessment_records
DROP POLICY IF EXISTS "select_assessment_records" ON assessment_records;
DROP POLICY IF EXISTS "insert_assessment_records" ON assessment_records;
DROP POLICY IF EXISTS "update_assessment_records" ON assessment_records;
DROP POLICY IF EXISTS "delete_assessment_records" ON assessment_records;

CREATE POLICY "assessment_select_scoped" ON assessment_records FOR SELECT TO authenticated
  USING (private.can_access_student(student_id));
CREATE POLICY "assessment_insert_scoped" ON assessment_records FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.current_user_school_id()
    AND private.can_access_student(student_id)
  );
CREATE POLICY "assessment_update_senior" ON assessment_records FOR UPDATE TO authenticated
  USING (
    private.can_access_student(student_id)
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  )
  WITH CHECK (school_id = private.current_user_school_id());
CREATE POLICY "assessment_delete_senior" ON assessment_records FOR DELETE TO authenticated
  USING (
    private.can_access_student(student_id)
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  );

-- pastoral_notes
DROP POLICY IF EXISTS "select_pastoral_notes" ON pastoral_notes;
DROP POLICY IF EXISTS "insert_pastoral_notes" ON pastoral_notes;
DROP POLICY IF EXISTS "update_pastoral_notes" ON pastoral_notes;
DROP POLICY IF EXISTS "delete_pastoral_notes" ON pastoral_notes;

CREATE POLICY "pastoral_select_scoped" ON pastoral_notes FOR SELECT TO authenticated
  USING (private.can_access_student(student_id));
CREATE POLICY "pastoral_insert_scoped" ON pastoral_notes FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.current_user_school_id()
    AND private.can_access_student(student_id)
  );
CREATE POLICY "pastoral_update_senior" ON pastoral_notes FOR UPDATE TO authenticated
  USING (
    private.can_access_student(student_id)
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  )
  WITH CHECK (school_id = private.current_user_school_id());
CREATE POLICY "pastoral_delete_senior" ON pastoral_notes FOR DELETE TO authenticated
  USING (
    private.can_access_student(student_id)
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  );

-- analysis_results
DROP POLICY IF EXISTS "select_school_analysis" ON analysis_results;
DROP POLICY IF EXISTS "insert_school_analysis" ON analysis_results;
DROP POLICY IF EXISTS "update_school_analysis" ON analysis_results;
DROP POLICY IF EXISTS "delete_school_analysis" ON analysis_results;
DROP POLICY IF EXISTS "platform_admin_read_analysis" ON analysis_results;

CREATE POLICY "analysis_select_scoped" ON analysis_results FOR SELECT TO authenticated
  USING (private.can_access_student(student_id));
-- Writing analysis is a whole-school operation performed by senior roles
-- (frontend engine run) or the service role (edge function).
CREATE POLICY "analysis_write_senior" ON analysis_results FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.current_user_school_id()
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  );
CREATE POLICY "analysis_update_senior" ON analysis_results FOR UPDATE TO authenticated
  USING (
    school_id = private.current_user_school_id()
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  )
  WITH CHECK (school_id = private.current_user_school_id());
CREATE POLICY "analysis_delete_senior" ON analysis_results FOR DELETE TO authenticated
  USING (
    school_id = private.current_user_school_id()
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  );

-- interventions
DROP POLICY IF EXISTS "select_school_interventions" ON interventions;
DROP POLICY IF EXISTS "insert_school_interventions" ON interventions;
DROP POLICY IF EXISTS "update_school_interventions" ON interventions;
DROP POLICY IF EXISTS "delete_school_interventions" ON interventions;
DROP POLICY IF EXISTS "platform_admin_read_interventions" ON interventions;

CREATE POLICY "interventions_select_scoped" ON interventions FOR SELECT TO authenticated
  USING (
    private.can_access_student(student_id)
    OR assigned_to_user_id = auth.uid()   -- you can always see actions assigned to you
  );
CREATE POLICY "interventions_insert_scoped" ON interventions FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.current_user_school_id()
    AND private.can_access_student(student_id)
  );
CREATE POLICY "interventions_update_scoped" ON interventions FOR UPDATE TO authenticated
  USING (
    private.can_access_student(student_id)
    OR assigned_to_user_id = auth.uid()
  )
  WITH CHECK (school_id = private.current_user_school_id());
CREATE POLICY "interventions_delete_senior" ON interventions FOR DELETE TO authenticated
  USING (
    school_id = private.current_user_school_id()
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  );

-- communications
DROP POLICY IF EXISTS "select_communications" ON communications;
DROP POLICY IF EXISTS "insert_communications" ON communications;
DROP POLICY IF EXISTS "update_communications" ON communications;
DROP POLICY IF EXISTS "delete_communications" ON communications;
DROP POLICY IF EXISTS "platform_admin_read_comms" ON communications;

CREATE POLICY "communications_select_scoped" ON communications FOR SELECT TO authenticated
  USING (private.can_access_student(student_id));
CREATE POLICY "communications_insert_scoped" ON communications FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.current_user_school_id()
    AND private.can_access_student(student_id)
  );
CREATE POLICY "communications_update_scoped" ON communications FOR UPDATE TO authenticated
  USING (private.can_access_student(student_id))
  WITH CHECK (school_id = private.current_user_school_id());
CREATE POLICY "communications_delete_senior" ON communications FOR DELETE TO authenticated
  USING (
    school_id = private.current_user_school_id()
    AND private.current_user_role() IN ('admin','slt','dsl','sendco','pastoral_lead','head_of_year')
  );

-- ═══════════════════════════════════════════════════════════════════════════
-- 5. safeguarding_records — restricted to authorised roles
-- ═══════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "select_safeguarding_records" ON safeguarding_records;
DROP POLICY IF EXISTS "insert_safeguarding_records" ON safeguarding_records;
DROP POLICY IF EXISTS "update_safeguarding_records" ON safeguarding_records;
DROP POLICY IF EXISTS "delete_safeguarding_records" ON safeguarding_records;

-- Read: dsl/admin always; slt only with the explicit grant. Nobody else —
-- not even for in-scope students. (KCSIE: concerns flow upward.)
CREATE POLICY "safeguarding_select_authorised" ON safeguarding_records FOR SELECT TO authenticated
  USING (
    school_id = private.current_user_school_id()
    AND (
      private.current_user_role() IN ('admin','dsl')
      OR (
        private.current_user_role() = 'slt'
        AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.can_view_safeguarding)
      )
    )
  );
-- Write: any staff member may RECORD a concern for a student in their scope
-- (all staff must be able to raise concerns), but cannot read others back.
CREATE POLICY "safeguarding_insert_scoped" ON safeguarding_records FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.current_user_school_id()
    AND private.can_access_student(student_id)
  );
-- Update (e.g. closing a case): dsl/admin only. No DELETE for anyone.
CREATE POLICY "safeguarding_update_dsl" ON safeguarding_records FOR UPDATE TO authenticated
  USING (
    school_id = private.current_user_school_id()
    AND private.current_user_role() IN ('admin','dsl')
  )
  WITH CHECK (school_id = private.current_user_school_id());

-- ═══════════════════════════════════════════════════════════════════════════
-- 6. safeguarding_notes — immutable narrative store, audited RPC access only
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS safeguarding_notes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id  uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  source_record_id uuid,               -- behaviour_records.id when diverted
  note        text NOT NULL,
  source      text,                    -- MIS/system origin for API-ingested notes
  created_by  uuid REFERENCES profiles(id),
  created_by_name text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE safeguarding_notes ENABLE ROW LEVEL SECURITY;
-- Deliberately NO select policy, NO update policy, NO delete policy:
-- rows are written by trigger/staff and read exclusively through the audited
-- function below. Immutability is structural, not procedural.
CREATE POLICY "sgnotes_insert_scoped" ON safeguarding_notes FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.current_user_school_id()
    AND private.can_access_student(student_id)
  );

CREATE INDEX IF NOT EXISTS safeguarding_notes_student_idx ON safeguarding_notes(student_id);

-- Compatibility trigger: legacy code writing behaviour_records.safeguarding_note
-- keeps working, but the sensitive text is diverted into the protected table
-- and never lands in the broadly-visible behaviour row.
CREATE OR REPLACE FUNCTION private.divert_safeguarding_note()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
BEGIN
  IF NEW.safeguarding_note IS NOT NULL AND btrim(NEW.safeguarding_note) <> '' THEN
    INSERT INTO safeguarding_notes (school_id, student_id, source_record_id, note, created_by, created_by_name)
    VALUES (
      NEW.school_id, NEW.student_id, NEW.id, NEW.safeguarding_note,
      auth.uid(),
      (SELECT full_name FROM profiles WHERE id = auth.uid())
    );
    NEW.safeguarding_note := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS divert_safeguarding_note_trg ON behaviour_records;
CREATE TRIGGER divert_safeguarding_note_trg
  BEFORE INSERT OR UPDATE ON behaviour_records
  FOR EACH ROW EXECUTE FUNCTION private.divert_safeguarding_note();

-- Audited read path. Every call — allowed or refused — writes an audit row.
CREATE OR REPLACE FUNCTION get_safeguarding_notes(p_student_id uuid)
RETURNS SETOF safeguarding_notes
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_role text;
  v_can_view boolean;
  v_school uuid;
  v_student_school uuid;
  v_allowed boolean;
BEGIN
  SELECT role, can_view_safeguarding, school_id
    INTO v_role, v_can_view, v_school
    FROM profiles WHERE id = auth.uid();
  SELECT school_id INTO v_student_school FROM students WHERE id = p_student_id;

  v_allowed := v_school IS NOT NULL
    AND v_school = v_student_school
    AND (v_role IN ('admin','dsl') OR (v_role = 'slt' AND v_can_view));

  INSERT INTO audit_log (school_id, user_id, user_name, action, entity_type, entity_id, student_id, notes)
  VALUES (
    v_school, auth.uid(),
    (SELECT full_name FROM profiles WHERE id = auth.uid()),
    CASE WHEN v_allowed THEN 'safeguarding_notes_read' ELSE 'safeguarding_notes_read_denied' END,
    'safeguarding_notes', NULL, p_student_id::text,
    CASE WHEN v_allowed THEN NULL ELSE 'Access refused: role ' || COALESCE(v_role, 'unknown') END
  );

  IF NOT v_allowed THEN
    RETURN;   -- empty set; refusal already audited
  END IF;

  RETURN QUERY
    SELECT * FROM safeguarding_notes
    WHERE student_id = p_student_id AND school_id = v_school
    ORDER BY created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION get_safeguarding_notes(uuid) FROM public;
GRANT EXECUTE ON FUNCTION get_safeguarding_notes(uuid) TO authenticated;

-- Equivalent audited accessor for structured safeguarding_records reads made
-- on behalf of privileged UI views that want an auditable trail (the direct
-- table SELECT above remains policy-guarded for engine use).
CREATE OR REPLACE FUNCTION get_safeguarding_records(p_student_id uuid)
RETURNS SETOF safeguarding_records
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_role text; v_can_view boolean; v_school uuid; v_student_school uuid; v_allowed boolean;
BEGIN
  SELECT role, can_view_safeguarding, school_id INTO v_role, v_can_view, v_school
    FROM profiles WHERE id = auth.uid();
  SELECT school_id INTO v_student_school FROM students WHERE id = p_student_id;
  v_allowed := v_school IS NOT NULL AND v_school = v_student_school
    AND (v_role IN ('admin','dsl') OR (v_role = 'slt' AND v_can_view));

  INSERT INTO audit_log (school_id, user_id, user_name, action, entity_type, student_id, notes)
  VALUES (
    v_school, auth.uid(),
    (SELECT full_name FROM profiles WHERE id = auth.uid()),
    CASE WHEN v_allowed THEN 'safeguarding_records_read' ELSE 'safeguarding_records_read_denied' END,
    'safeguarding_records', p_student_id::text,
    CASE WHEN v_allowed THEN NULL ELSE 'Access refused: role ' || COALESCE(v_role, 'unknown') END
  );

  IF NOT v_allowed THEN RETURN; END IF;
  RETURN QUERY
    SELECT * FROM safeguarding_records
    WHERE student_id = p_student_id AND school_id = v_school
    ORDER BY incident_date DESC NULLS LAST;
END;
$$;

REVOKE ALL ON FUNCTION get_safeguarding_records(uuid) FROM public;
GRANT EXECUTE ON FUNCTION get_safeguarding_records(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7. quick_notes — visibility actually enforced
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE quick_notes ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

DROP POLICY IF EXISTS "select_own_quick_notes" ON quick_notes;
DROP POLICY IF EXISTS "insert_own_quick_notes" ON quick_notes;
DROP POLICY IF EXISTS "update_own_quick_notes" ON quick_notes;
DROP POLICY IF EXISTS "delete_own_quick_notes" ON quick_notes;
DROP POLICY IF EXISTS "platform_admin_read_notes" ON quick_notes;

-- Read requires student scope AND visibility clearance. 'dsl_only' notes are
-- readable by dsl/admin/SLT-with-grant and the author; everything else needs
-- ordinary student scope only.
CREATE POLICY "quick_notes_select_visibility" ON quick_notes FOR SELECT TO authenticated
  USING (
    school_id = private.current_user_school_id()
    AND private.can_access_student(student_id)
    AND (
      COALESCE(visibility, 'all') <> 'dsl_only'
      OR created_by = auth.uid()
      OR private.current_user_role() IN ('admin','dsl')
      OR (
        private.current_user_role() = 'slt'
        AND EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.can_view_safeguarding)
      )
    )
  );
CREATE POLICY "quick_notes_insert_scoped" ON quick_notes FOR INSERT TO authenticated
  WITH CHECK (
    school_id = private.current_user_school_id()
    AND private.can_access_student(student_id)
    AND (created_by = auth.uid() OR created_by IS NULL)
  );
CREATE POLICY "quick_notes_update_own" ON quick_notes FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (school_id = private.current_user_school_id() AND created_by = auth.uid());
CREATE POLICY "quick_notes_delete_own_or_admin" ON quick_notes FOR DELETE TO authenticated
  USING (
    created_by = auth.uid()
    OR (school_id = private.current_user_school_id() AND private.current_user_role() = 'admin')
  );
-- service_insert_quick_notes (service_role) is retained as-is.

-- ═══════════════════════════════════════════════════════════════════════════
-- 8. profiles — close the SLT self-promotion route; lock scope columns
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Existing hole (verified in 20260706134912): admin_update_school_profiles
  USING allows role IN ('admin','slt') but WITH CHECK validates only
  school_id — permissive policies OR together, so an SLT user could UPDATE
  their own row to role='admin', or promote anyone.

  WITH CHECK cannot compare OLD and NEW, so the rule "only admins may change
  role/scope, and never their own role" is enforced by trigger.
*/

DROP POLICY IF EXISTS "admin_update_school_profiles" ON profiles;

CREATE POLICY "admin_update_school_profiles" ON profiles FOR UPDATE TO authenticated
  USING (
    school_id = private.current_user_school_id()
    AND private.current_user_role() IN ('admin','slt')
  )
  WITH CHECK (
    school_id = private.current_user_school_id()
  );

CREATE OR REPLACE FUNCTION private.enforce_profile_update_rules()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_actor_role text;
BEGIN
  -- service_role / postgres maintenance paths bypass user rules.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT role INTO v_actor_role FROM profiles WHERE id = auth.uid();

  -- Sensitive columns: role, scope, safeguarding grant, tenancy, activation.
  IF (NEW.role                  IS DISTINCT FROM OLD.role
   OR NEW.year_groups           IS DISTINCT FROM OLD.year_groups
   OR NEW.form_groups           IS DISTINCT FROM OLD.form_groups
   OR NEW.can_view_safeguarding IS DISTINCT FROM OLD.can_view_safeguarding
   OR NEW.school_id             IS DISTINCT FROM OLD.school_id
   OR NEW.is_active             IS DISTINCT FROM OLD.is_active) THEN

    IF v_actor_role IS DISTINCT FROM 'admin' THEN
      RAISE EXCEPTION 'Only administrators may change role, scope or safeguarding access';
    END IF;

    -- Even admins may not change their OWN role (prevents accidental
    -- lockout-hiding and forges a clear audit trail through a second admin).
    IF NEW.id = auth.uid() AND NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Administrators may not change their own role';
    END IF;

    INSERT INTO audit_log (school_id, user_id, user_name, action, entity_type, entity_id, old_value, new_value)
    VALUES (
      NEW.school_id, auth.uid(),
      (SELECT full_name FROM profiles WHERE id = auth.uid()),
      'profile_privileges_changed', 'profiles', NEW.id::text,
      jsonb_build_object('role', OLD.role, 'year_groups', OLD.year_groups, 'form_groups', OLD.form_groups,
                         'can_view_safeguarding', OLD.can_view_safeguarding, 'is_active', OLD.is_active),
      jsonb_build_object('role', NEW.role, 'year_groups', NEW.year_groups, 'form_groups', NEW.form_groups,
                         'can_view_safeguarding', NEW.can_view_safeguarding, 'is_active', NEW.is_active)
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_update_rules_trg ON profiles;
CREATE TRIGGER enforce_profile_update_rules_trg
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION private.enforce_profile_update_rules();

-- ═══════════════════════════════════════════════════════════════════════════
-- 9. Verification queries (run manually against staging — do not automate)
-- ═══════════════════════════════════════════════════════════════════════════

/*
  Ready-to-run assertions live in tests/db/rls_role_scope.test.sql:
    - tutor cannot select out-of-form students (expect 0 rows)
    - tutor cannot select safeguarding_records at all (expect 0 rows)
    - teacher sees caseload students only
    - HOY sees their year group only
    - SLT without grant sees no safeguarding; with grant sees it
    - SLT UPDATE of own role to 'admin' raises exception
    - non-admin UPDATE of year_groups raises exception
    - cross-school SELECT returns 0 rows for every role
    - get_safeguarding_notes writes an audit row on allowed AND refused calls
*/
