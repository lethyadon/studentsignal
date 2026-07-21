-- ══════════════════════════════════════════════════════════════════════════════
-- StudentSignal: Context Intelligence Persistence
-- Migration: 20260720010000_context_intelligence_tables.sql
--
-- Persists the ContextIntelligence output from runEngine() so that:
-- 1. rewardFindings are queryable historically (not just at analysis time)
-- 2. staffBaselines are available to StaffDevelopment.tsx without re-computing
-- 3. contextConflicts are surfaced in the pupil timeline
-- 4. intelligence_insights table is updated by runEngine (via schoolIntelligence.ts)
--    rather than being a completely separate codepath
-- ══════════════════════════════════════════════════════════════════════════════

-- ── reward_findings ───────────────────────────────────────────────────────────
-- Populated by persistEngineOutput() in signalEngine.ts after each analysis run.

CREATE TABLE IF NOT EXISTS reward_findings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id       UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  student_id      UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  analysis_date   DATE NOT NULL DEFAULT CURRENT_DATE,
  classification  TEXT NOT NULL,  -- sustained_improvement | reward_burst_short_term | etc.
  narrative       TEXT NOT NULL,
  evidence        JSONB NOT NULL DEFAULT '{}',
  generated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS reward_findings_student_date_uidx
  ON reward_findings(school_id, student_id, analysis_date);

-- RLS: same visibility as the student record
ALTER TABLE reward_findings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "reward_findings_select" ON reward_findings FOR SELECT TO authenticated
  USING (private.can_access_student(student_id));
CREATE POLICY "reward_findings_insert" ON reward_findings FOR INSERT TO authenticated
  WITH CHECK (school_id = private.current_user_school_id() AND private.can_access_student(student_id));

-- ── staff_baselines ───────────────────────────────────────────────────────────
-- Populated by persistEngineOutput() or generateSchoolIntelligence().

CREATE TABLE IF NOT EXISTS staff_baselines (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id               UUID NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  staff_member            TEXT NOT NULL,  -- staff_member name (display string until staff accounts linked)
  analysis_date           DATE NOT NULL DEFAULT CURRENT_DATE,
  positive_events         INTEGER NOT NULL DEFAULT 0,
  positive_points         INTEGER NOT NULL DEFAULT 0,
  negative_events         INTEGER NOT NULL DEFAULT 0,
  record_count            INTEGER NOT NULL DEFAULT 0,
  median_staff_positive   NUMERIC,
  ratio_to_median         NUMERIC,
  outlier                 TEXT,           -- 'high' | 'low' | null
  explained_by_intervention BOOLEAN NOT NULL DEFAULT FALSE,
  narrative               TEXT,
  generated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS staff_baselines_member_date_uidx
  ON staff_baselines(school_id, staff_member, analysis_date);

-- RLS: visible to admin/slt/dsl, and pastoral/HOY roles
ALTER TABLE staff_baselines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "staff_baselines_select" ON staff_baselines FOR SELECT TO authenticated
  USING (
    school_id = private.current_user_school_id()
    AND private.current_user_role() IN ('admin','slt','dsl','head_of_year','pastoral_lead','sendco')
  );
CREATE POLICY "staff_baselines_insert" ON staff_baselines FOR INSERT TO authenticated
  WITH CHECK (school_id = private.current_user_school_id());

-- ── analysis_results: add context_generated_at ────────────────────────────────
-- Tracks whether context intelligence has been generated for this analysis run.

ALTER TABLE analysis_results
  ADD COLUMN IF NOT EXISTS context_generated_at TIMESTAMPTZ;

-- ── Grant ─────────────────────────────────────────────────────────────────────
GRANT ALL ON reward_findings TO authenticated;
GRANT ALL ON staff_baselines TO authenticated;
