
-- Add missing columns to students table
ALTER TABLE students ADD COLUMN IF NOT EXISTS behaviour_score INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS attendance_pct NUMERIC(5,2) DEFAULT 95.0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS risk_level TEXT DEFAULT 'green';
ALTER TABLE students ADD COLUMN IF NOT EXISTS signal_category TEXT DEFAULT 'green';
ALTER TABLE students ADD COLUMN IF NOT EXISTS positive_points INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS punctuality_issues INTEGER DEFAULT 0;
ALTER TABLE students ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE students ADD COLUMN IF NOT EXISTS graduation_status TEXT;

-- Add missing columns to analysis_results table
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS signal_category TEXT;
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS behaviour_score INTEGER;
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS attendance_pct NUMERIC(5,2);
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS positive_points INTEGER DEFAULT 0;
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS punctuality_issues INTEGER DEFAULT 0;

