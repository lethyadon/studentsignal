
ALTER TABLE students
  ADD COLUMN IF NOT EXISTS upn TEXT,
  ADD COLUMN IF NOT EXISTS admission_number TEXT,
  ADD COLUMN IF NOT EXISTS preferred_name TEXT,
  ADD COLUMN IF NOT EXISTS eal BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS looked_after BOOLEAN DEFAULT FALSE;

-- Partial unique indexes so re-uploads by UPN or admission number don't create duplicates
-- NULL values are excluded so pupils without these IDs don't conflict
CREATE UNIQUE INDEX IF NOT EXISTS students_school_upn_idx
  ON students(school_id, upn) WHERE upn IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS students_school_admission_idx
  ON students(school_id, admission_number) WHERE admission_number IS NOT NULL;

