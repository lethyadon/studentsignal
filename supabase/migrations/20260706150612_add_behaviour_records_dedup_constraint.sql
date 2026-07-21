-- Deduplicate existing behaviour_records before adding constraint.
DELETE FROM behaviour_records
WHERE id NOT IN (
  SELECT DISTINCT ON (school_id, student_id, date, incident_type) id
  FROM behaviour_records
  ORDER BY school_id, student_id, date, incident_type, created_at DESC
);

-- Add unique constraint so CSV re-uploads upsert cleanly.
ALTER TABLE behaviour_records
  ADD CONSTRAINT behaviour_records_school_student_date_type_key
  UNIQUE (school_id, student_id, date, incident_type);

