/*
# Create specialised import record tables

## Purpose
Each MIS source system now routes to its own table instead of everything landing
in behaviour_records. This fixes the schema-cache error caused by inserting
attendance_percentage into behaviour_records (which never had that column).

## New Tables

### attendance_records
Stores per-student attendance data imported from Arbor exports.
- id, student_id, school_id
- record_date (text, e.g. "2025-10-01")
- attendance_percentage (numeric 0-100)
- sessions_attended / sessions_possible (integer)
- comment, source_file
- UNIQUE on (school_id, student_id, record_date)

### assessment_records
Stores subject-level assessment data imported from Bromcom exports.
- id, student_id, school_id
- assessment_date, subject
- current_grade, target_grade, progress_gap, staff_member, comment, source_file

### safeguarding_records
Stores CPOMS incident/concern entries.
- id, student_id, school_id
- incident_date, incident_type, summary, assigned_to, severity, source_file

### pastoral_notes
Stores manual pastoral notes (Other / Custom imports).
- id, student_id, school_id
- note_date, note, priority, status, entered_by, source_file

## Modified Tables

### behaviour_records
Adds a UNIQUE constraint on (school_id, student_id, date, incident_type) so that
upsert with ON CONFLICT works correctly and re-uploading the same ClassCharts file
is safely idempotent.

## Security
RLS enabled on all four new tables. Authenticated users may read/write rows
belonging to their own school (school_id matches profile.school_id).

## Notes
1. All CREATE TABLE statements are IF NOT EXISTS — safe to re-run.
2. The behaviour_records constraint addition is wrapped in a PL/pgSQL DO block
   so it is also idempotent.
3. NULL attendance_percentage is valid (row may have session counts instead).
*/

-- ── attendance_records ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS attendance_records (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id            uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id             uuid        NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  record_date           text        NOT NULL DEFAULT (CURRENT_DATE)::text,
  attendance_percentage numeric,
  sessions_attended     integer,
  sessions_possible     integer,
  comment               text,
  source_file           text,
  created_at            timestamptz DEFAULT now(),

  CONSTRAINT attendance_records_school_student_date_unique
    UNIQUE (school_id, student_id, record_date)
);

ALTER TABLE attendance_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_attendance_records" ON attendance_records;
CREATE POLICY "select_attendance_records" ON attendance_records FOR SELECT
  TO authenticated
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "insert_attendance_records" ON attendance_records;
CREATE POLICY "insert_attendance_records" ON attendance_records FOR INSERT
  TO authenticated
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "update_attendance_records" ON attendance_records;
CREATE POLICY "update_attendance_records" ON attendance_records FOR UPDATE
  TO authenticated
  USING  (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "delete_attendance_records" ON attendance_records;
CREATE POLICY "delete_attendance_records" ON attendance_records FOR DELETE
  TO authenticated
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));


-- ── assessment_records ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS assessment_records (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id      uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id       uuid        NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  assessment_date text        NOT NULL DEFAULT (CURRENT_DATE)::text,
  subject         text,
  current_grade   text,
  target_grade    text,
  progress_gap    text,
  staff_member    text,
  comment         text,
  source_file     text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE assessment_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_assessment_records" ON assessment_records;
CREATE POLICY "select_assessment_records" ON assessment_records FOR SELECT
  TO authenticated
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "insert_assessment_records" ON assessment_records;
CREATE POLICY "insert_assessment_records" ON assessment_records FOR INSERT
  TO authenticated
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "update_assessment_records" ON assessment_records;
CREATE POLICY "update_assessment_records" ON assessment_records FOR UPDATE
  TO authenticated
  USING  (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "delete_assessment_records" ON assessment_records;
CREATE POLICY "delete_assessment_records" ON assessment_records FOR DELETE
  TO authenticated
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));


-- ── safeguarding_records ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS safeguarding_records (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id    uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id     uuid        NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  incident_date text,
  incident_type text,
  summary       text,
  assigned_to   text,
  severity      text,
  source_file   text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE safeguarding_records ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_safeguarding_records" ON safeguarding_records;
CREATE POLICY "select_safeguarding_records" ON safeguarding_records FOR SELECT
  TO authenticated
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "insert_safeguarding_records" ON safeguarding_records;
CREATE POLICY "insert_safeguarding_records" ON safeguarding_records FOR INSERT
  TO authenticated
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "update_safeguarding_records" ON safeguarding_records;
CREATE POLICY "update_safeguarding_records" ON safeguarding_records FOR UPDATE
  TO authenticated
  USING  (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "delete_safeguarding_records" ON safeguarding_records;
CREATE POLICY "delete_safeguarding_records" ON safeguarding_records FOR DELETE
  TO authenticated
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));


-- ── pastoral_notes ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pastoral_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id  uuid        NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id   uuid        NOT NULL REFERENCES schools(id)  ON DELETE CASCADE,
  note_date   text        NOT NULL DEFAULT (CURRENT_DATE)::text,
  note        text,
  priority    text,
  status      text,
  entered_by  text,
  source_file text,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE pastoral_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_pastoral_notes" ON pastoral_notes;
CREATE POLICY "select_pastoral_notes" ON pastoral_notes FOR SELECT
  TO authenticated
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "insert_pastoral_notes" ON pastoral_notes;
CREATE POLICY "insert_pastoral_notes" ON pastoral_notes FOR INSERT
  TO authenticated
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "update_pastoral_notes" ON pastoral_notes;
CREATE POLICY "update_pastoral_notes" ON pastoral_notes FOR UPDATE
  TO authenticated
  USING  (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "delete_pastoral_notes" ON pastoral_notes;
CREATE POLICY "delete_pastoral_notes" ON pastoral_notes FOR DELETE
  TO authenticated
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));


-- ── behaviour_records: add missing UNIQUE constraint ────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'behaviour_records_school_student_date_type_unique'
      AND conrelid = 'behaviour_records'::regclass
  ) THEN
    ALTER TABLE behaviour_records
      ADD CONSTRAINT behaviour_records_school_student_date_type_unique
      UNIQUE (school_id, student_id, date, incident_type);
  END IF;
END $$;

