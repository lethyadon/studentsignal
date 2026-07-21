ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS signal_types jsonb DEFAULT '[]'::jsonb;
