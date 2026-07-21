-- Add proper user ownership column alongside role-based routing
-- assigned_to: text staff display name (for display/legacy)
-- assigned_role: text role code (routing mechanism for auto-generated actions)
-- assigned_to_user_id: uuid FK to auth.users (real ownership when staff accounts exist)

ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS assigned_to_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS interventions_assigned_to_user_id_idx ON interventions(assigned_to_user_id);

