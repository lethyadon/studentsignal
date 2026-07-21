
-- Add unique constraint on students(school_id, name) to support upsert on re-upload
ALTER TABLE students ADD CONSTRAINT students_school_id_name_unique UNIQUE (school_id, name);

