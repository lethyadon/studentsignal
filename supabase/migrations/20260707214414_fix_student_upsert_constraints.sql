
-- Drop the partial indexes from the previous migration — they do NOT work as ON CONFLICT targets
DROP INDEX IF EXISTS students_school_upn_idx;
DROP INDEX IF EXISTS students_school_admission_idx;

-- Add external_student_id (Admission No / Student ID from any MIS)
ALTER TABLE students ADD COLUMN IF NOT EXISTS external_student_id TEXT;

-- Proper UNIQUE constraints — PostgreSQL allows multiple NULLs in a UNIQUE column
-- so students without these IDs don't conflict with each other
ALTER TABLE students
  ADD CONSTRAINT students_school_upn_unique UNIQUE (school_id, upn);

ALTER TABLE students
  ADD CONSTRAINT students_school_external_id_unique UNIQUE (school_id, external_student_id);

