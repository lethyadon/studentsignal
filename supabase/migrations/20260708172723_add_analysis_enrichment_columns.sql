/*
# Add enrichment columns to analysis_results for student intelligence

## Purpose
Adds columns to store richer per-student intelligence generated during post-import analysis:
strengths, barriers, peer patterns, linked data, and detailed next steps.

## Modified Tables

### analysis_results
- strengths (text) — comma-separated or narrative list of student strengths
- barriers (text) — comma-separated or narrative list of barriers to progress
- recent_improvements (text) — narrative of positive changes
- repeated_patterns (jsonb) — structured patterns detected (subjects, periods, peers, staff)
- linked_peers (jsonb) — student IDs repeatedly co-involved in incidents
- suggested_next_steps (jsonb) — array of structured next-step objects
- evidence_count (integer) — number of data points used to generate this analysis
- data_sources (jsonb) — which data sources contributed (behaviour, attendance, safeguarding, etc.)
- confidence_score (integer 0-100) — how confident the system is in this analysis
*/

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'strengths') THEN
    ALTER TABLE analysis_results ADD COLUMN strengths text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'barriers') THEN
    ALTER TABLE analysis_results ADD COLUMN barriers text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'recent_improvements') THEN
    ALTER TABLE analysis_results ADD COLUMN recent_improvements text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'repeated_patterns') THEN
    ALTER TABLE analysis_results ADD COLUMN repeated_patterns jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'linked_peers') THEN
    ALTER TABLE analysis_results ADD COLUMN linked_peers jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'suggested_next_steps') THEN
    ALTER TABLE analysis_results ADD COLUMN suggested_next_steps jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'evidence_count') THEN
    ALTER TABLE analysis_results ADD COLUMN evidence_count integer DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'data_sources') THEN
    ALTER TABLE analysis_results ADD COLUMN data_sources jsonb DEFAULT '[]'::jsonb;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'analysis_results' AND column_name = 'confidence_score') THEN
    ALTER TABLE analysis_results ADD COLUMN confidence_score integer DEFAULT 50;
  END IF;
END $$;

