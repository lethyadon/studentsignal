-- Add workflow tracking columns that the app expects but don't exist yet
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS outcome_status text;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS prev_status text;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS escalated_to text;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS escalation_reason text;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS escalated_by text;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS escalated_at timestamptz;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS escalation_notes text;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS completed_by text;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS completed_at timestamptz;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS next_step text;
