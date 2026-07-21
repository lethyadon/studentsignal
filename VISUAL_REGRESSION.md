# Visual Regression Inventory
19 Jul 2026

## Files CHANGED and the reason for each change

### New files (no regression risk — additions only)
| File | Lines | Reason |
|---|---|---|
| `supabase/functions/_shared/routing.ts` | 389 | New: canonical workflow routing, escalation, modal defaults, notification payloads |
| `supabase/functions/_shared/context.ts` | 607 | New: reward/context intelligence (detectCohortRewardSpikes, classifyRewardPatterns, etc.) |
| `supabase/functions/_shared/hypothesis.ts` | 970 | New: hypothesis engine (8 detectors) |
| `supabase/functions/_shared/canonical.ts` | 195 | New: strict UK dates, canonical enums |
| `supabase/migrations/20260719100000_role_scoped_rls_and_safeguarding_separation.sql` | ~400 | New: RLS overhaul, safeguarding_notes table, profile enforcement triggers |
| `supabase/migrations/20260719110000_structured_intelligence_fields.sql` | ~200 | New: structured columns on all tables |
| `tests/ingest.test.ts` | ~200 | New: ingestion test suite |
| `tests/engine.real.test.ts` | ~180 | New: real-data engine tests |
| `tests/scenarios.context.test.ts` | ~220 | New: reward/context scenario tests |
| `tests/routing.test.ts` | ~210 | New: workflow routing acceptance tests |
| `tests/helpers/engineHarness.ts` | ~90 | New: test harness |
| `FEATURE_MATRIX.md`, `WORKFLOW_MATRIX.md`, `PARITY_AUDIT.md`, `RECONCILIATION.md`, `CONTEXT_INTELLIGENCE_AUDIT.md` | — | New: documentation |

### Modified files

#### `supabase/functions/_shared/engine.ts` (1,269 → 1,776 lines)
- `GeneratedAction.assigned_to_user_id`: changed type from `null` (literal) to `string | null`
- `EngineInput`: added `profiles?: ProfileLite[]`, `openActionCounts?: Record<string, number>`, `interventions?: InterventionRow[]`
- `EngineOutput`: added `context: ContextIntelligence`, `notifications: NotificationPayload[]`
- `hasCriticalSafeguarding`: changed to exclude closed records (defect fix — open cases only)
- `assignActions()`: upgraded from no-op stub to real resolver using `routing.ts:resolveOwner()`
- `routingContextForAction()`: new helper extracting routing context from a generated action
- `runEngine()`: now builds notifications from routed actions in output
- `buildAnalysisRow()` output keys: **unchanged** (26 keys identical — parity audit verified)
- `generateSignals()` guards: **9 original guards preserved**; 1 widened (attendance: `< 80 || persistent_absence`); 1 added (attainment_decline)
- All signal types, action types, corroboration logic: **identical to original**

#### `supabase/functions/run-analysis/index.ts` (423 → 166 lines)
- Replaced with thin adapter: fetch → runEngine → persist
- Added: profiles fetch, notification deduplication and insert
- Removed: duplicated scoring/detection logic (superseded by shared engine — parity verified)

#### `src/lib/signalEngine.ts` (1,269 → 162 lines)
- Replaced with thin adapter: same fetch/persist semantics
- Added: profiles fetch, notification deduplication and insert
- Removed: duplicated scoring/detection logic
- **Public API `runFullAnalysis()` signature preserved** — no callers broken

#### `src/lib/intelligence.ts` (466 lines — body unchanged)
- `composeSignalExplanation()` local body replaced with re-export from shared engine
- **No change to the function's output** — bodies were byte-identical (7,007 = 7,007 chars)
- All other exports (`composeExplanationFromAnalysis`, `getActionsForRole`, `computeStudentIntelligence`) unchanged

#### `src/lib/csvIngest.ts` (~550 → 615 lines)
- `collectStudents()`: identity-merge fix — `byUpn`, `byExtId`, `byName` lookup maps merge same pupil across files (SIMS UPN ≠ ClassCharts admission no. ≠ name — previously created duplicates)
- `buildRecordPayloads()`: per-row ImportValueError catch → `rejectedRows[]` panel

#### `src/pages/UploadCsv.tsx` (~1,050 → 1,105 lines)
- **Step 6 persistence**: refactored to use `csvIngest.ts:buildRecordPayloads()` — was previously duplicating logic
- **Results UI**: added amber `rejectedRows` panel + slate `skippedInactive` panel
- **These are the ONLY UI changes** — no visual design changes to any other component
- All existing upload stepper, drag-drop, progress bar, file cards: unchanged
- Navigation, colours, card layouts, modals: unchanged

### Files explicitly NOT changed (verified by grep)

All other pages and components were read but not modified:
- `src/pages/SignalQueue.tsx` — not changed
- `src/pages/Dashboard.tsx` — not changed
- `src/pages/StudentProfile.tsx` — not changed
- `src/pages/Interventions.tsx` — not changed
- `src/pages/SuccessStories.tsx` — not changed
- `src/pages/StaffDevelopment.tsx` — not changed
- `src/pages/SchoolIntelligence.tsx` — not changed
- `src/pages/ReportsPage.tsx` — not changed
- `src/components/ActionDrawer.tsx` — not changed
- `src/components/NotificationCenter.tsx` — not changed
- `src/components/SafeguardingAlert.tsx` — not changed
- `src/components/StudentDrawer.tsx` — not changed
- `src/components/DemoGuide.tsx` — not changed
- All other components under `src/components/` — not changed
- `src/lib/data.ts` — not changed
- `src/lib/demoData.ts` — not changed
- `src/lib/permissions.ts` — not changed
- `src/lib/schoolIntelligence.ts` — not changed
- `src/lib/supabase.ts` — not changed
- Stripe/billing functions — not changed
- `tailwind.config.js`, `vite.config.ts`, `tsconfig.*.json` — not changed

## Visual identity preservation

- **Colour palette, typography, spacing**: unchanged — no Tailwind class modifications
- **Navigation structure**: unchanged — no new routes added, no routes removed
- **Card and modal layouts**: unchanged — no component files modified
- **Demo personas and role switching**: unchanged — `DemoGuide.tsx`, `AuthContext.tsx` not modified
- **Morning Briefing label**: unchanged — no navigation label changes

## The only visible UI change

`UploadCsv.tsx` step 6 (confirmation screen) now shows:
1. An amber panel listing any rows rejected due to impossible dates or missing student matches (previously silently discarded)
2. A slate panel listing inactive pupils skipped (previously invisible)

Both panels only appear when their respective arrays are non-empty. The upload flow, progress indicators, and all other steps are visually identical.
