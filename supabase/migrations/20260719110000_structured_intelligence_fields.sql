/*
  # Structured intelligence fields, provenance and dedupe identity

  19 Jul 2026. Adds every column the ingestion routes and the canonical
  engine now read/write, so values the engine must compare, count or filter
  are structured — never parsed out of prose comments.

  Also adds contextual-retention columns (location, time of day, event type,
  department) so those dimensions are kept and queryable WHEREVER a source
  system supplies them. The six current mock exports do not supply them;
  the columns are nullable and the presets carry aliases.

  Date columns on the import tables are text (baseline decision) — meaning
  Postgres does NOT reject malformed dates. Strict validation therefore lives
  in the ingestion layer (canonical.parseUkDate), which rejects impossible or
  ambiguous values per row with a reported reason.
*/

-- ── students ────────────────────────────────────────────────────────────────
ALTER TABLE students ADD COLUMN IF NOT EXISTS enrolment_status text;

-- ── attendance_records ──────────────────────────────────────────────────────
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS late_marks integer;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS attendance_concern text
  CHECK (attendance_concern IN ('none','monitor','persistent_absence') OR attendance_concern IS NULL);
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS external_record_id text;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS source_timestamp timestamptz;
ALTER TABLE attendance_records ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- ── behaviour_records ───────────────────────────────────────────────────────
ALTER TABLE behaviour_records ADD COLUMN IF NOT EXISTS behaviour_class text
  CHECK (behaviour_class IN ('positive','negative','neutral') OR behaviour_class IS NULL);
ALTER TABLE behaviour_records ADD COLUMN IF NOT EXISTS category text;       -- e.g. Achievement / Behaviour
ALTER TABLE behaviour_records ADD COLUMN IF NOT EXISTS location text;       -- retained when supplied
ALTER TABLE behaviour_records ADD COLUMN IF NOT EXISTS time_of_day text;    -- retained when supplied (HH:MM)
ALTER TABLE behaviour_records ADD COLUMN IF NOT EXISTS department text;     -- retained when supplied
ALTER TABLE behaviour_records ADD COLUMN IF NOT EXISTS event_type text;     -- reward/sanction/detention/etc when supplied
ALTER TABLE behaviour_records ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE behaviour_records ADD COLUMN IF NOT EXISTS external_record_id text;
ALTER TABLE behaviour_records ADD COLUMN IF NOT EXISTS source_timestamp timestamptz;
ALTER TABLE behaviour_records ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- ── safeguarding_records ────────────────────────────────────────────────────
ALTER TABLE safeguarding_records ADD COLUMN IF NOT EXISTS category text;
ALTER TABLE safeguarding_records ADD COLUMN IF NOT EXISTS subcategory text;
ALTER TABLE safeguarding_records ADD COLUMN IF NOT EXISTS status text
  CHECK (status IN ('open','closed') OR status IS NULL);
ALTER TABLE safeguarding_records ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE safeguarding_records ADD COLUMN IF NOT EXISTS external_record_id text;
ALTER TABLE safeguarding_records ADD COLUMN IF NOT EXISTS source_timestamp timestamptz;
ALTER TABLE safeguarding_records ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- ── assessment_records ──────────────────────────────────────────────────────
ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS assessment_cycle text;
ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS progress_status text
  CHECK (progress_status IN ('on_track','below_target','above_target') OR progress_status IS NULL);
ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS external_record_id text;
ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS source_timestamp timestamptz;
ALTER TABLE assessment_records ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- ── pastoral_notes ──────────────────────────────────────────────────────────
ALTER TABLE pastoral_notes ADD COLUMN IF NOT EXISTS source_system text;
ALTER TABLE pastoral_notes ADD COLUMN IF NOT EXISTS external_record_id text;
ALTER TABLE pastoral_notes ADD COLUMN IF NOT EXISTS source_timestamp timestamptz;
ALTER TABLE pastoral_notes ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- ── analysis_results ────────────────────────────────────────────────────────
-- Evidence traceability: hypotheses (with confidence + supporting events)
-- stored with the analysis row so every signal can show its working.
ALTER TABLE analysis_results ADD COLUMN IF NOT EXISTS hypotheses jsonb;

-- ── Dedupe identities ───────────────────────────────────────────────────────
-- attendance:  UNIQUE(school_id, student_id, record_date)      [exists, baseline]
-- behaviour:   UNIQUE(school_id, student_id, date, incident_type) [exists, baseline]
--   + external identity for sources that provide record IDs:
CREATE UNIQUE INDEX IF NOT EXISTS behaviour_external_identity_uidx
  ON behaviour_records (school_id, source_system, external_record_id)
  WHERE external_record_id IS NOT NULL;

-- safeguarding: external identity (CPOMS Incident ID) is the dedupe key.
CREATE UNIQUE INDEX IF NOT EXISTS safeguarding_external_identity_uidx
  ON safeguarding_records (school_id, source_system, external_record_id)
  WHERE external_record_id IS NOT NULL;

-- assessment: one row per pupil per cycle per subject. A plain multi-column
-- unique index (not a functional/COALESCE index) so PostgREST upserts can
-- target it via on_conflict. Rows with NULL cycle/subject never conflict
-- (SQL NULL semantics) — such rows have no usable identity and remain under
-- the delete-by-source-file idempotency path instead.
-- Deduplicate any pre-existing identified rows first (keep newest).
DELETE FROM assessment_records a
USING assessment_records b
WHERE a.school_id = b.school_id
  AND a.student_id = b.student_id
  AND a.assessment_cycle IS NOT DISTINCT FROM b.assessment_cycle
  AND a.subject IS NOT DISTINCT FROM b.subject
  AND a.assessment_cycle IS NOT NULL AND a.subject IS NOT NULL
  AND a.created_at < b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS assessment_identity_uidx
  ON assessment_records (school_id, student_id, assessment_cycle, subject);

CREATE UNIQUE INDEX IF NOT EXISTS pastoral_external_identity_uidx
  ON pastoral_notes (school_id, source_system, external_record_id)
  WHERE external_record_id IS NOT NULL;

-- Identities the data-sync API path upserts against. The 17 Jul patch already
-- targeted these column sets with onConflict, but the indexes never existed —
-- PostgREST would have rejected every such upsert. Note: btree-indexing the
-- note/summary text bounds those fields to btree limits (~2.7KB); school
-- notes are short and API payloads are trusted.
CREATE UNIQUE INDEX IF NOT EXISTS pastoral_dedupe_uidx
  ON pastoral_notes (school_id, student_id, note_date, note);
CREATE UNIQUE INDEX IF NOT EXISTS communications_dedupe_uidx
  ON communications (school_id, student_id, date, summary);
CREATE UNIQUE INDEX IF NOT EXISTS safeguarding_notes_dedupe_uidx
  ON safeguarding_notes (school_id, student_id, note, source);

-- ── Query-path indexes for the structured fields ────────────────────────────
CREATE INDEX IF NOT EXISTS safeguarding_status_idx
  ON safeguarding_records (school_id, status);
CREATE INDEX IF NOT EXISTS assessment_progress_idx
  ON assessment_records (school_id, progress_status);
CREATE INDEX IF NOT EXISTS behaviour_class_idx
  ON behaviour_records (school_id, behaviour_class);
CREATE INDEX IF NOT EXISTS behaviour_staff_idx
  ON behaviour_records (school_id, staff_member);
