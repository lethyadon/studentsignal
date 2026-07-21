ALTER TABLE communications ADD COLUMN IF NOT EXISTS routing_status text DEFAULT 'pending_review';
ALTER TABLE communications ADD COLUMN IF NOT EXISTS suggested_assignee text;
