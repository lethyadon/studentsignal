-- Add additional fields to profiles table
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS department text;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS year_groups text[] DEFAULT '{}';
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS last_sign_in_at timestamptz;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS invited_by uuid REFERENCES profiles(id);

-- Notifications table
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN (
    'assigned_action', 'new_escalation', 'review_due', 'review_overdue',
    'parent_communication', 'outcome_recorded', 'safeguarding_alert',
    'student_risk_change', 'intervention_due', 'general'
  )),
  title text NOT NULL,
  body text,
  student_id text,
  link_path text,
  is_read boolean DEFAULT false,
  urgent boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_notifications" ON notifications FOR SELECT
  TO authenticated USING (recipient_id = auth.uid());
CREATE POLICY "insert_notifications" ON notifications FOR INSERT
  TO authenticated WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "update_own_notifications" ON notifications FOR UPDATE
  TO authenticated USING (recipient_id = auth.uid()) WITH CHECK (recipient_id = auth.uid());
CREATE POLICY "delete_own_notifications" ON notifications FOR DELETE
  TO authenticated USING (recipient_id = auth.uid());

CREATE INDEX IF NOT EXISTS notifications_recipient_id_idx ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS notifications_school_id_idx ON notifications(school_id);
CREATE INDEX IF NOT EXISTS notifications_created_at_idx ON notifications(created_at DESC);

-- Audit log table (append-only, no delete/update policies)
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  user_id uuid REFERENCES profiles(id),
  user_name text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  student_id text,
  student_name text,
  old_value jsonb,
  new_value jsonb,
  notes text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_audit_log" ON audit_log FOR SELECT
  TO authenticated USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "insert_audit_log" ON audit_log FOR INSERT
  TO authenticated WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS audit_log_school_id_idx ON audit_log(school_id);
CREATE INDEX IF NOT EXISTS audit_log_student_id_idx ON audit_log(student_id);
CREATE INDEX IF NOT EXISTS audit_log_created_at_idx ON audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_id_idx ON audit_log(user_id);

-- Staff assignments (year groups and departments per staff member)
CREATE TABLE IF NOT EXISTS staff_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid REFERENCES schools(id) ON DELETE CASCADE,
  profile_id uuid REFERENCES profiles(id) ON DELETE CASCADE,
  year_groups text[] DEFAULT '{}',
  departments text[] DEFAULT '{}',
  assigned_students text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(school_id, profile_id)
);

ALTER TABLE staff_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_staff_assignments" ON staff_assignments FOR SELECT
  TO authenticated USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "insert_staff_assignments" ON staff_assignments FOR INSERT
  TO authenticated WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "update_staff_assignments" ON staff_assignments FOR UPDATE
  TO authenticated USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())) WITH CHECK (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));
CREATE POLICY "delete_staff_assignments" ON staff_assignments FOR DELETE
  TO authenticated USING (school_id = (SELECT school_id FROM profiles WHERE id = auth.uid()));

CREATE INDEX IF NOT EXISTS staff_assignments_school_id_idx ON staff_assignments(school_id);
CREATE INDEX IF NOT EXISTS staff_assignments_profile_id_idx ON staff_assignments(profile_id);

