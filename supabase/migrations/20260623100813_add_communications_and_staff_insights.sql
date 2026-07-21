-- Communications table
CREATE TABLE IF NOT EXISTS communications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  student_id text NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  source text NOT NULL CHECK (source IN ('email', 'phone', 'meeting', 'letter', 'external_agency', 'pastoral_conversation')),
  summary text NOT NULL,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  staff_member text NOT NULL,
  follow_up_required boolean DEFAULT false,
  follow_up_date date,
  linked_action_id text,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE communications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_communications" ON communications FOR SELECT
  TO authenticated USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "insert_communications" ON communications FOR INSERT
  TO authenticated WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "update_communications" ON communications FOR UPDATE
  TO authenticated USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())) WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "delete_communications" ON communications FOR DELETE
  TO authenticated USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS communications_school_id_idx ON communications(school_id);
CREATE INDEX IF NOT EXISTS communications_student_id_idx ON communications(student_id);
CREATE INDEX IF NOT EXISTS communications_date_idx ON communications(date DESC);

