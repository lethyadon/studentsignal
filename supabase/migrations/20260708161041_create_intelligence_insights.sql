/*
# Create intelligence_insights table

## Purpose
Stores automatically generated whole-school intelligence insights produced
after each CSV import. Each insight is categorized by type and severity,
includes a confidence score, and links back to evidence data.

## New Tables

### intelligence_insights
- id (uuid, PK)
- school_id (uuid, FK to schools, required)
- category (text) — one of: cohort, subject, time, location, emerging, intervention, relationship, positive, risk_escalation, executive
- severity (text) — one of: critical, high, medium, low, positive
- headline (text) — short insight title
- narrative (text) — detailed explanation
- evidence (jsonb) — structured evidence data (student IDs, counts, metrics)
- confidence (integer, 0-100) — confidence score
- recommended_action (text) — what staff should do
- affected_student_ids (uuid[]) — array of student IDs for drill-down
- affected_cohort (text) — e.g. "Year 9", "PP Students", "SEND"
- generated_at (timestamptz) — when the insight was generated
- import_batch_id (text) — links to the import run that generated it
- is_positive (boolean) — whether this is a positive or concern insight

## Security
RLS enabled. Authenticated users can read/write rows for their own school.
Insights are deleted and regenerated on each import so INSERT/DELETE are needed.
*/

CREATE TABLE IF NOT EXISTS intelligence_insights (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id            uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  category             text        NOT NULL,
  severity             text        NOT NULL DEFAULT 'medium',
  headline             text        NOT NULL,
  narrative            text        NOT NULL,
  evidence             jsonb       DEFAULT '{}',
  confidence           integer     NOT NULL DEFAULT 50,
  recommended_action   text,
  affected_student_ids uuid[]      DEFAULT '{}',
  affected_cohort      text,
  generated_at         timestamptz DEFAULT now(),
  import_batch_id      text,
  is_positive          boolean     DEFAULT false
);

ALTER TABLE intelligence_insights ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_intelligence_insights" ON intelligence_insights;
CREATE POLICY "select_intelligence_insights" ON intelligence_insights FOR SELECT
  TO authenticated
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "insert_intelligence_insights" ON intelligence_insights;
CREATE POLICY "insert_intelligence_insights" ON intelligence_insights FOR INSERT
  TO authenticated
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "update_intelligence_insights" ON intelligence_insights;
CREATE POLICY "update_intelligence_insights" ON intelligence_insights FOR UPDATE
  TO authenticated
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS "delete_intelligence_insights" ON intelligence_insights;
CREATE POLICY "delete_intelligence_insights" ON intelligence_insights FOR DELETE
  TO authenticated
  USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_intelligence_insights_school
  ON intelligence_insights(school_id);
CREATE INDEX IF NOT EXISTS idx_intelligence_insights_category
  ON intelligence_insights(category);
CREATE INDEX IF NOT EXISTS idx_intelligence_insights_severity
  ON intelligence_insights(severity);

