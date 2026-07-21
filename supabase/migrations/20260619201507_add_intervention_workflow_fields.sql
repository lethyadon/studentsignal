-- Add new workflow fields to interventions table
ALTER TABLE interventions
  ADD COLUMN IF NOT EXISTS review_date date,
  ADD COLUMN IF NOT EXISTS reason text,
  ADD COLUMN IF NOT EXISTS suggested_owner text,
  ADD COLUMN IF NOT EXISTS review_completed boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_action_taken boolean,
  ADD COLUMN IF NOT EXISTS review_student_improved text CHECK (review_student_improved IN ('improved', 'no_change', 'worsened')),
  ADD COLUMN IF NOT EXISTS review_notes text;

-- Extend status column to support new workflow statuses
ALTER TABLE interventions
  DROP CONSTRAINT IF EXISTS interventions_status_check;

ALTER TABLE interventions
  ADD CONSTRAINT interventions_status_check
  CHECK (status IN ('suggested', 'open', 'assigned', 'in_progress', 'review_due', 'completed', 'escalated', 'closed', 'cancelled'));

