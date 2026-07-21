ALTER TABLE invites DROP CONSTRAINT IF EXISTS invites_school_id_email_key;
ALTER TABLE invites ADD CONSTRAINT invites_school_id_email_key UNIQUE (school_id, email);
