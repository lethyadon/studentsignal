-- ══════════════════════════════════════════════════════════════════════════════
-- StudentSignal: Longitudinal Memory Fields on analysis_results
-- Migration: 20260720020000_longitudinal_memory_fields.sql
--
-- Adds four longitudinal memory columns to analysis_results so that every
-- signal card can answer: what changed, what was tried, did it work, what works.
-- These are populated by persistEngineOutput() in signalEngine.ts.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE analysis_results
  -- Timeline 1: trajectory vs baseline
  ADD COLUMN IF NOT EXISTS trajectory TEXT,          -- 'improving'|'stable'|'deteriorating'|'volatile'|'insufficient_data'
  ADD COLUMN IF NOT EXISTS trajectory_text TEXT,     -- human sentence: "Trajectory is deteriorating..."
  -- Timeline 2+3: intervention history summary
  ADD COLUMN IF NOT EXISTS memory_narrative TEXT,    -- "2 interventions tried. Parent meeting improved attendance for 40 days."
  ADD COLUMN IF NOT EXISTS intervention_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurrence_count INTEGER DEFAULT 0;

-- Index for querying pupils by trajectory (e.g. all deteriorating pupils in a year group)
CREATE INDEX IF NOT EXISTS idx_analysis_trajectory ON analysis_results(school_id, trajectory)
  WHERE trajectory IN ('deteriorating', 'volatile');
