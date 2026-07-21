/*
# Add missing columns the application relies on

## Problem being fixed
The frontend (Dashboard, SignalQueue, StudentProfile, Reports, etc.) reads fields
like `student.attendance_pct`, `student.risk_level`, `student.signal_category`,
`analysis.signal_explanation`, `career.career_goal` and more — none of which
existed as real columns. In demo mode this was invisible because demo data is
generated entirely in-memory (src/lib/data.ts mock objects). Against a real
Supabase-backed school, every one of these fields silently fell back to a
hardcoded default (e.g. `student.attendance_pct ?? 95`), so the dashboard would
show fabricated numbers instead of real ones.

Because the data layer already does `select('*')` when reading these tables,
no frontend changes are required for these reads to start working — they just
needed the columns to exist.
*/

-- ── students ──────────────────────────────────────────────────────────────
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS attendance_pct numeric,
  ADD COLUMN IF NOT EXISTS behaviour_score integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS risk_level text CHECK (risk_level IN ('red', 'amber', 'green')),
  ADD COLUMN IF NOT EXISTS signal_category text CHECK (signal_category IN ('red', 'amber', 'purple', 'green', 'blue')),
  ADD COLUMN IF NOT EXISTS positive_points integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS punctuality_issues integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS photo_url text;

CREATE INDEX IF NOT EXISTS idx_students_risk_level ON students(risk_level);
CREATE INDEX IF NOT EXISTS idx_students_signal_category ON students(signal_category);

-- ── analysis_results ──────────────────────────────────────────────────────
ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS signal_category text CHECK (signal_category IN ('red', 'amber', 'purple', 'green', 'blue')),
  ADD COLUMN IF NOT EXISTS risk_score integer,
  ADD COLUMN IF NOT EXISTS signal_explanation text,
  ADD COLUMN IF NOT EXISTS previous_state text,
  ADD COLUMN IF NOT EXISTS current_state text,
  ADD COLUMN IF NOT EXISTS what_changed text,
  ADD COLUMN IF NOT EXISTS contributing_intervention uuid REFERENCES interventions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS suggested_recognition text,
  ADD COLUMN IF NOT EXISTS celebration_type text;

-- ── career_profiles ───────────────────────────────────────────────────────
ALTER TABLE career_profiles
  ADD COLUMN IF NOT EXISTS career_goal text,
  ADD COLUMN IF NOT EXISTS work_experience_status text;

-- ── behaviour_records ─────────────────────────────────────────────────────
-- The CSV mapping screen already lets staff map an "Attendance percentage"
-- column, but there was nowhere in the schema for that value to land, so it
-- was silently discarded on every upload. This column stores the per-row
-- attendance reading; runAnalysis() averages it per student.
ALTER TABLE behaviour_records
  ADD COLUMN IF NOT EXISTS attendance_percentage numeric;

-- ── students.updated_at should move whenever we recompute risk from CSV ────
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

