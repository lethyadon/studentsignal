
-- Success recognitions: persists when staff marks a recognition as done
CREATE TABLE IF NOT EXISTS success_recognitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  recognition_type TEXT NOT NULL,
  recognition_label TEXT NOT NULL,
  notes TEXT,
  completed_by TEXT,
  completed_at TIMESTAMPTZ DEFAULT now(),
  is_undone BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE success_recognitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_recognitions" ON success_recognitions
  FOR SELECT TO authenticated
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "insert_own_recognitions" ON success_recognitions
  FOR INSERT TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "update_own_recognitions" ON success_recognitions
  FOR UPDATE TO authenticated
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "delete_own_recognitions" ON success_recognitions
  FOR DELETE TO authenticated
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

-- Recommendation dismissals: persists when staff dismisses/marks-not-needed a recommendation
CREATE TABLE IF NOT EXISTS recommendation_dismissals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES schools(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL,
  recommendation_id TEXT NOT NULL,  -- e.g. 'rec_pastoral', 'rec_parent'
  reason TEXT,
  dismissed_by TEXT,
  dismissed_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT TRUE,   -- set false when undone
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE recommendation_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_dismissals" ON recommendation_dismissals
  FOR SELECT TO authenticated
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "insert_own_dismissals" ON recommendation_dismissals
  FOR INSERT TO authenticated
  WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "update_own_dismissals" ON recommendation_dismissals
  FOR UPDATE TO authenticated
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "delete_own_dismissals" ON recommendation_dismissals
  FOR DELETE TO authenticated
  USING (school_id IN (SELECT school_id FROM profiles WHERE id = auth.uid()));

