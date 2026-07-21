-- Add baseline tracking columns for intervention outcome measurement
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS baseline_attendance numeric;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS baseline_behaviour numeric;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS current_attendance numeric;
ALTER TABLE interventions ADD COLUMN IF NOT EXISTS current_behaviour numeric;
