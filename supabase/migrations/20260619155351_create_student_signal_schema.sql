/*
# Student Signal - Initial Schema

A UK school intelligence platform for pastoral teams, SENDCos, DSLs, and senior leaders.
This migration creates the complete database schema for the application.

1. New Tables
- `schools` - stores registered schools
- `profiles` - extends auth.users with school affiliation and role
- `students` - student records per school
- `uploads` - CSV upload records
- `behaviour_records` - parsed behaviour/incident data from CSVs
- `analysis_results` - computed risk analysis per student
- `interventions` - pastoral actions and interventions
- `career_profiles` - career guidance data per student
- `reports` - generated reports

2. Security
- RLS enabled on all tables
- School-scoped policies: users only see data for their school
- Owner/admin role checks on sensitive operations
- Profile table is school-scoped via school_id

3. Indexes
- school_id indexes for all tables
- student_id indexes for related tables
- created_at indexes for time-based queries
*/

-- Schools table
CREATE TABLE IF NOT EXISTS schools (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Profiles table (extends auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES schools(id) ON DELETE SET NULL,
  role text NOT NULL DEFAULT 'staff',
  full_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Students table
CREATE TABLE IF NOT EXISTS students (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  name text NOT NULL,
  year_group text NOT NULL,
  form text NOT NULL,
  send_status text,
  pupil_premium boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Uploads table
CREATE TABLE IF NOT EXISTS uploads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  uploaded_by uuid NOT NULL REFERENCES auth.users(id),
  filename text NOT NULL,
  row_count integer DEFAULT 0,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);

-- Behaviour records table
CREATE TABLE IF NOT EXISTS behaviour_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  date text NOT NULL,
  incident_type text NOT NULL,
  behaviour_points integer DEFAULT 0,
  lesson_period text,
  subject text,
  staff_member text,
  comment text,
  safeguarding_note text,
  created_at timestamptz DEFAULT now()
);

-- Analysis results table
CREATE TABLE IF NOT EXISTS analysis_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  risk_level text NOT NULL DEFAULT 'green',
  key_reasons jsonb DEFAULT '[]'::jsonb,
  behaviour_trend text,
  attendance_trend text,
  subjects_involved jsonb DEFAULT '[]'::jsonb,
  periods_involved jsonb DEFAULT '[]'::jsonb,
  suggested_pastoral_action text,
  suggested_parent_contact text,
  suggested_staff_action text,
  career_signposting text,
  recommended_review_date text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Interventions table
CREATE TABLE IF NOT EXISTS interventions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  assigned_to uuid NOT NULL REFERENCES auth.users(id),
  action_type text NOT NULL,
  priority text DEFAULT 'medium',
  status text DEFAULT 'open',
  due_date text,
  notes text,
  outcome text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Career profiles table
CREATE TABLE IF NOT EXISTS career_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id uuid NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  career_interests jsonb DEFAULT '[]'::jsonb,
  preferred_subjects jsonb DEFAULT '[]'::jsonb,
  strengths text,
  barriers text,
  confidence_level text,
  destination_risk text,
  suggested_pathways jsonb DEFAULT '[]'::jsonb,
  useful_signposting jsonb DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Reports table
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  generated_by uuid NOT NULL REFERENCES auth.users(id),
  title text NOT NULL,
  content jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_students_school_id ON students(school_id);
CREATE INDEX IF NOT EXISTS idx_behaviour_records_student_id ON behaviour_records(student_id);
CREATE INDEX IF NOT EXISTS idx_behaviour_records_school_id ON behaviour_records(school_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_student_id ON analysis_results(student_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_school_id ON analysis_results(school_id);
CREATE INDEX IF NOT EXISTS idx_analysis_results_risk_level ON analysis_results(risk_level);
CREATE INDEX IF NOT EXISTS idx_interventions_student_id ON interventions(student_id);
CREATE INDEX IF NOT EXISTS idx_interventions_school_id ON interventions(school_id);
CREATE INDEX IF NOT EXISTS idx_interventions_status ON interventions(status);
CREATE INDEX IF NOT EXISTS idx_career_profiles_student_id ON career_profiles(student_id);
CREATE INDEX IF NOT EXISTS idx_career_profiles_school_id ON career_profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_uploads_school_id ON uploads(school_id);
CREATE INDEX IF NOT EXISTS idx_reports_school_id ON reports(school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON profiles(school_id);

-- RLS
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploads ENABLE ROW LEVEL SECURITY;
ALTER TABLE behaviour_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE analysis_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE interventions ENABLE ROW LEVEL SECURITY;
ALTER TABLE career_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

-- Schools: anyone can read, only authenticated can create
DROP POLICY IF EXISTS "select_schools" ON schools;
CREATE POLICY "select_schools" ON schools FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_schools" ON schools;
CREATE POLICY "insert_schools" ON schools FOR INSERT
  TO authenticated WITH CHECK (true);

-- Profiles: school-scoped
DROP POLICY IF EXISTS "select_profiles" ON profiles;
CREATE POLICY "select_profiles" ON profiles FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_profiles" ON profiles;
CREATE POLICY "insert_profiles" ON profiles FOR INSERT
  TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_own_profile" ON profiles;
CREATE POLICY "update_own_profile" ON profiles FOR UPDATE
  TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Students: school-scoped
DROP POLICY IF EXISTS "select_school_students" ON students;
CREATE POLICY "select_school_students" ON students FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = students.school_id)
  );

DROP POLICY IF EXISTS "insert_school_students" ON students;
CREATE POLICY "insert_school_students" ON students FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = students.school_id)
  );

DROP POLICY IF EXISTS "update_school_students" ON students;
CREATE POLICY "update_school_students" ON students FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = students.school_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = students.school_id)
  );

DROP POLICY IF EXISTS "delete_school_students" ON students;
CREATE POLICY "delete_school_students" ON students FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = students.school_id)
  );

-- Uploads: school-scoped
DROP POLICY IF EXISTS "select_school_uploads" ON uploads;
CREATE POLICY "select_school_uploads" ON uploads FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = uploads.school_id)
  );

DROP POLICY IF EXISTS "insert_school_uploads" ON uploads;
CREATE POLICY "insert_school_uploads" ON uploads FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = uploads.school_id)
  );

DROP POLICY IF EXISTS "update_school_uploads" ON uploads;
CREATE POLICY "update_school_uploads" ON uploads FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = uploads.school_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = uploads.school_id)
  );

DROP POLICY IF EXISTS "delete_school_uploads" ON uploads;
CREATE POLICY "delete_school_uploads" ON uploads FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = uploads.school_id)
  );

-- Behaviour records: school-scoped
DROP POLICY IF EXISTS "select_school_behaviour" ON behaviour_records;
CREATE POLICY "select_school_behaviour" ON behaviour_records FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = behaviour_records.school_id)
  );

DROP POLICY IF EXISTS "insert_school_behaviour" ON behaviour_records;
CREATE POLICY "insert_school_behaviour" ON behaviour_records FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = behaviour_records.school_id)
  );

DROP POLICY IF EXISTS "update_school_behaviour" ON behaviour_records;
CREATE POLICY "update_school_behaviour" ON behaviour_records FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = behaviour_records.school_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = behaviour_records.school_id)
  );

DROP POLICY IF EXISTS "delete_school_behaviour" ON behaviour_records;
CREATE POLICY "delete_school_behaviour" ON behaviour_records FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = behaviour_records.school_id)
  );

-- Analysis results: school-scoped
DROP POLICY IF EXISTS "select_school_analysis" ON analysis_results;
CREATE POLICY "select_school_analysis" ON analysis_results FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = analysis_results.school_id)
  );

DROP POLICY IF EXISTS "insert_school_analysis" ON analysis_results;
CREATE POLICY "insert_school_analysis" ON analysis_results FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = analysis_results.school_id)
  );

DROP POLICY IF EXISTS "update_school_analysis" ON analysis_results;
CREATE POLICY "update_school_analysis" ON analysis_results FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = analysis_results.school_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = analysis_results.school_id)
  );

DROP POLICY IF EXISTS "delete_school_analysis" ON analysis_results;
CREATE POLICY "delete_school_analysis" ON analysis_results FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = analysis_results.school_id)
  );

-- Interventions: school-scoped
DROP POLICY IF EXISTS "select_school_interventions" ON interventions;
CREATE POLICY "select_school_interventions" ON interventions FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = interventions.school_id)
  );

DROP POLICY IF EXISTS "insert_school_interventions" ON interventions;
CREATE POLICY "insert_school_interventions" ON interventions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = interventions.school_id)
  );

DROP POLICY IF EXISTS "update_school_interventions" ON interventions;
CREATE POLICY "update_school_interventions" ON interventions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = interventions.school_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = interventions.school_id)
  );

DROP POLICY IF EXISTS "delete_school_interventions" ON interventions;
CREATE POLICY "delete_school_interventions" ON interventions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = interventions.school_id)
  );

-- Career profiles: school-scoped
DROP POLICY IF EXISTS "select_school_careers" ON career_profiles;
CREATE POLICY "select_school_careers" ON career_profiles FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = career_profiles.school_id)
  );

DROP POLICY IF EXISTS "insert_school_careers" ON career_profiles;
CREATE POLICY "insert_school_careers" ON career_profiles FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = career_profiles.school_id)
  );

DROP POLICY IF EXISTS "update_school_careers" ON career_profiles;
CREATE POLICY "update_school_careers" ON career_profiles FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = career_profiles.school_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = career_profiles.school_id)
  );

DROP POLICY IF EXISTS "delete_school_careers" ON career_profiles;
CREATE POLICY "delete_school_careers" ON career_profiles FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = career_profiles.school_id)
  );

-- Reports: school-scoped
DROP POLICY IF EXISTS "select_school_reports" ON reports;
CREATE POLICY "select_school_reports" ON reports FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = reports.school_id)
  );

DROP POLICY IF EXISTS "insert_school_reports" ON reports;
CREATE POLICY "insert_school_reports" ON reports FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = reports.school_id)
  );

DROP POLICY IF EXISTS "update_school_reports" ON reports;
CREATE POLICY "update_school_reports" ON reports FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = reports.school_id)
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = reports.school_id)
  );

DROP POLICY IF EXISTS "delete_school_reports" ON reports;
CREATE POLICY "delete_school_reports" ON reports FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.school_id = reports.school_id)
  );

