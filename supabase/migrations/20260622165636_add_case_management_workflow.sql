-- Pattern workflow persistence
CREATE TABLE IF NOT EXISTS pattern_workflows (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  pattern_id text NOT NULL,
  status text NOT NULL DEFAULT 'not_actioned'
    CHECK (status IN ('not_actioned','assigned','in_progress','awaiting_review','completed','escalated','dismissed')),
  persistence text NOT NULL DEFAULT 'new'
    CHECK (persistence IN ('new','recurring','resolved','reappeared')),
  owner_name text,
  owner_role text,
  action_type text,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  due_date date,
  review_date date,
  notes text,
  outcome_notes text,
  dismissed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(student_id, pattern_id)
);

ALTER TABLE pattern_workflows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_pattern_workflows" ON pattern_workflows FOR SELECT
  TO authenticated USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "insert_own_pattern_workflows" ON pattern_workflows FOR INSERT
  TO authenticated WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "update_own_pattern_workflows" ON pattern_workflows FOR UPDATE
  TO authenticated USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "delete_own_pattern_workflows" ON pattern_workflows FOR DELETE
  TO authenticated USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- Intervention effectiveness tracking
ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS outcome_achieved text
    CHECK (outcome_achieved IN ('achieved','partially','not_achieved')),
  ADD COLUMN IF NOT EXISTS after_attendance numeric,
  ADD COLUMN IF NOT EXISTS after_behaviour integer,
  ADD COLUMN IF NOT EXISTS outcome_notes text;

-- Student graduation status
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS graduation_status text DEFAULT 'active'
    CHECK (graduation_status IN ('active','monitor','stable','success_story'));

-- Create index for fast pattern workflow lookups
CREATE INDEX IF NOT EXISTS idx_pattern_workflows_student ON pattern_workflows(student_id);
CREATE INDEX IF NOT EXISTS idx_pattern_workflows_school ON pattern_workflows(school_id);

