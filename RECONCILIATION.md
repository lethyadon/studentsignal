# Reconciliation Report — 19 July 2026

Baseline: full-source export dated 9 July 2026 (123 files, reconstructed from
`Student_Signal___Pastoral_Intelligence_20260709__1_.zip`, which contained the
project as a `## FILE:`-sectioned text export; markdown code fences stripped
during reconstruction).

Patches: two ZIPs dated 17 July 2026 (`csv_pipeline_fix.zip`,
`final_complete.zip`) containing three newer files.

## Per-file decisions

| File | Baseline | Patch | Chosen | Notes |
|---|---|---|---|---|
| `src/pages/UploadCsv.tsx` | 1,413 lines, no date normalisation, no structured CSV fields | 1,450 lines, adds `normaliseDate`, late-marks/concern/subcategory/status mappings | **Patch**, then further modified | Patch defects found and fixed (see below) |
| `supabase/functions/data-sync/index.ts` | Communications-only ingestion | Adds pastoral/communication/assessment ingestion paths with dedupe `onConflict` keys | **Patch**, then further modified | Aligned to structured fields + provenance |
| `src/lib/hypothesis.ts` | absent | 41,994 bytes, self-contained hypothesis engine, 8 detectors | **Patch**, relocated to `supabase/functions/_shared/hypothesis.ts` | Input types extended for structured fields (marked RE-AUTHORED EXTENSION) |
| All other 120 files | present | — | **Baseline** | |

## Diff summary (baseline → patch)

- `UploadCsv.tsx`: 8 hunks — preset alias additions (late_marks_count,
  attendance_concern, positive_negative, comment_detail, note_status,
  enrolment_status), `normaliseDate()`, positive/negative split into
  `behaviour_points`/`positive_points`, CPOMS subcategory merged into
  `incident_type` prose, attendance concern folded into `comment` prose.
- `data-sync/index.ts`: 1 large hunk (+178 lines) — new ingestion branches for
  pastoral notes, communications, assessments with `onConflict` dedupe keys.

## Defects found in the 17 July patch during reconciliation (fixed in this pass)

1. **Bromcom `Progress Status` mapping was dead code.** The Bromcom preset
   object defined `comment:` twice (lines 159 and 161); the second key
   silently overwrote the first, so `Progress Status` was never captured —
   not even as prose. JS object literals do not error on duplicate keys.
2. **CPOMS `Status` (Open/Closed) was mapped but never written.** The
   `note_status` alias existed in the CPOMS preset, but the
   `safeguardingRows` payload never included it. Open/Closed was lost.
3. **SIMS `Enrolment Status` was mapped but inactive pupils were not
   skipped.** No code read `enrolment_status` during student collection.
4. **`normaliseDate()` silently passed through invalid input.** `31/02/2026`
   became `2026-02-31`; unparseable strings were returned verbatim. Because
   the record tables use `text` date columns, Postgres would NOT reject these
   — they would be stored corrupted. (The 17 July session's claim that
   "Postgres will reject" bad dates was wrong for these tables.)
5. **Arbor `record_date` mapped to `Start Date` (term start, 01/09/2025), not
   the observation date.** Attendance snapshots were dated ~10 months before
   the data they describe, which distorts any recency-windowed analysis.
   Canonical event date is now the export period end (`End Date`), with the
   period start preserved in `metadata`.
6. **No provenance anywhere.** CPOMS `Incident ID` (a real external record
   ID) was discarded; no `source_system`, no source timestamps.

## Lost work re-authored (not recovered — clearly marked)

The following were delivered in the 17 July session but the artifacts are
lost; they are re-implemented from the approved design in the transcript and
marked `RE-AUTHORED` in file headers. They are NOT byte-for-byte recreations:

1. `supabase/migrations/20260719100000_role_scoped_rls_and_safeguarding_separation.sql`
2. Canonical shared engine (`supabase/functions/_shared/engine.ts`) replacing
   the duplicated `signalEngine.ts` / `run-analysis` scoring logic.
3. Structured-fields migration
   (`20260719110000_structured_intelligence_fields.sql`).
4. Test suite (`tests/`) — the baseline repo contained zero test files.

## Manual merges required

- `UploadCsv.tsx`: parsing/mapping/payload logic extracted to
  `src/lib/csvIngest.ts` (pure, testable); page file becomes UI + orchestration.
- `signalEngine.ts` reduced to a fetch/write adapter over the shared engine;
  its public API (`runFullAnalysis`) is preserved for `analysistrigger.ts`.
- `run-analysis/index.ts` reduced to the same adapter pattern for Deno.
- `intelligence.ts#composeSignalExplanation` moved into the shared engine
  (environment-neutral); `intelligence.ts` re-exports it for existing imports.
