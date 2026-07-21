# StudentSignal Product-Feature Matrix
Generated: 19 Jul 2026. Static-audit only (no runtime DB/UI in this environment).
Column definitions: LIVE = reads from Supabase with real school_id; DEMO = falls back to MOCK_* or demoData when schoolId is null.

---

## Feature 1: Signal Queue

- **UI location**: `src/pages/SignalQueue.tsx` (1,629 lines) — main `/signals` route. Cards show risk level, signal type, explanation, suggested owner, actions.
- **Data source**: `getStudents()` + `getAnalysisResults()` from `src/lib/data.ts`. Both functions branch: `if (!schoolId) return MOCK_*` for demo; live Supabase queries for real school.
- **Engine function**: `runEngine()` → `buildAnalysisRow()` produces `signal_explanation`, `signal_types[]`, `risk_level`, `suggested_next_steps`, `key_reasons`. `generateActions()` → `assignActions()` now resolves to real user IDs.
- **DB fields**: `analysis_results.signal_explanation`, `risk_level`, `signal_types`, `key_reasons`, `subjects_involved`, `data_sources`; `students.risk_level`, `signal_category`; `interventions.assigned_to_user_id`.
- **Live or demo**: PARTIALLY LIVE — data fetch is live; the Accept & Assign modal populates `suggested_owner` from `HOY_BY_YEAR` display strings (demo-mode string resolution). Real user-ID assignment now flows from the engine but the modal's staff-picker still uses `DEMO_STAFF` in the SignalQueue component itself.
- **Status**: PARTIALLY ENGINE-BACKED — signals and explanations are engine-generated and live when a school is connected; the assignment modal uses DEMO_STAFF for display but the engine now writes real `assigned_to_user_id` to the actions it auto-inserts.
- **Changes made**: Engine now assigns real user IDs via `routing.ts`; `suggested_next_steps` carries `{ role, action, priority }` objects fed directly from the engine's output. No UI file changed.
- **Acceptance-test result**: PASSED — engine generates correct signals (test 1, 2); actions route to real user IDs (test 28).

---

## Feature 2: Morning Briefings (DSL / HOY / Tutor / SENDCo / SLT)

- **UI location**: `src/pages/Dashboard.tsx` (1,890 lines) — role-scoped dashboard. Shows priority bar, briefing cards per role, quick actions.
- **Data source**: `getStudents()` + `getAnalysisResults()` + `getInterventions()` + `getDashboardStats()` — all in `data.ts`, all live/demo branched.
- **Engine function**: `runEngine()` outputs `riskLevel`, `signalCategory`, `suggestedNextSteps` which drive briefing priorities. `generateCohortIntelligence()` → `school.riskDistribution`.
- **DB fields**: `students.risk_level`, `signal_category`, `attendance_pct`, `behaviour_score`; `analysis_results.signal_types`, `risk_score`, `confidence_score`; `interventions.status`, `priority`.
- **Live or demo**: BOTH — same live/demo branch pattern.
- **Status**: PARTIALLY ENGINE-BACKED — the role-scoped filtering (`isStudentInScope`) is live; the briefing content (risk levels, signal types) is engine-generated. Notification loading from Supabase is NOT present in Dashboard; it reads notifications from a custom component (`NotificationCenter`).
- **Changes made**: Engine now generates assignment notifications written to the `notifications` table; `NotificationCenter` reads these live. No Dashboard file changed.
- **Acceptance-test result**: PARTIAL — engine output verified; UI runtime NOT VERIFIED.

---

## Feature 3: Pupil Timeline

- **UI location**: `src/pages/StudentProfile.tsx` (7,636 lines) — timeline tab shows chronological evidence across all sources.
- **Data source**: `getAnalysisForStudent()` + `getBehaviourRecords()` + direct Supabase queries for safeguarding notes (RPC), pastoral notes, attendance records.
- **Engine function**: `normaliseStudents()` produces `dataSources[]`; `buildPeerLinks()` links related records. The timeline is assembled from structured DB fields (`behaviour_records.date`, `lesson_period`, `subject`, `staff_member`, `category`; `safeguarding_records.incident_date`, `category`, `subcategory`).
- **DB fields**: All structured columns added in migration `20260719110000_structured_intelligence_fields.sql` — `behaviour_class`, `behaviour_points`, `positive_points`, `category`, `location`, `time_of_day`, `lesson_period`, `subject`; `safeguarding_records.status`, `category`, `subcategory`; `attendance_records.late_marks`, `attendance_concern`.
- **Live or demo**: BOTH — demo fallback via `MOCK_BEHAVIOUR` etc.; live queries when school connected.
- **Status**: FULLY ENGINE-BACKED — structured fields feed the engine; the timeline renders from the same structured columns.
- **Changes made**: Structured columns added via migration; `data-sync` writes them; CSV ingest writes them. No page file changed.
- **Acceptance-test result**: PASSED — structured fields verified in ingest test 7.

---

## Feature 4: Narrative Explanations

- **UI location**: `StudentProfile.tsx` (signal explanation card) and `SignalQueue.tsx` (signal description column). Also in `intelligence.ts` (`composeExplanationFromAnalysis`).
- **Data source**: `analysis_results.signal_explanation` (DB column) populated by engine.
- **Engine function**: `composeSignalExplanation()` — canonical single copy in `_shared/engine.ts`, re-exported from `src/lib/intelligence.ts` (both copies were byte-identical; now one source).
- **DB fields**: `analysis_results.signal_explanation` (text); `hypotheses` (jsonb) — now also included on the row.
- **Live or demo**: LIVE when analysis has been run; DEMO_ANALYSIS contains pre-written mock explanations.
- **Status**: FULLY ENGINE-BACKED — `composeSignalExplanation` is canonical, deterministic, tested. The `hypotheses` jsonb now travels alongside the explanation giving a DSL the structured evidence chain.
- **Changes made**: Duplicate in `intelligence.ts` replaced with re-export of shared engine function. `hypotheses` jsonb added to `buildAnalysisRow` output.
- **Acceptance-test result**: PASSED — narrative body verified; hypotheses tested in engine test 1.

---

## Feature 5: Auto-Assigned Actions

- **UI location**: `Interventions.tsx` — shows auto-generated actions (source='auto', status='suggested'). `SignalQueue.tsx` Accept & Assign modal triggers confirmation.
- **Data source**: Written by `persistEngineOutput()` in `src/lib/signalEngine.ts` (frontend) and `run-analysis/index.ts` (edge). Read live from `interventions` table.
- **Engine function**: `generateActions()` → `assignActions()`. `assignActions()` now resolves to real `ProfileLite` user IDs via `routing.ts:resolveOwner()`.
- **DB fields**: `interventions.assigned_to_user_id` (now populated with real profile UUID), `assigned_to` (display name), `assigned_role`, `action_type`, `priority`, `due_date`, `source='auto'`, `status='suggested'`, `baseline_attendance`, `baseline_behaviour`.
- **Live or demo**: LIVE (Interventions.tsx reads `supabase.from('interventions')`).
- **Status**: FULLY ENGINE-BACKED — action generation is canonical; user-ID resolution is now real (routing.ts).
- **Changes made**: `assignActions()` upgraded from stub to real resolver; both adapters now pass `profiles` to the engine; engine emits `notifications[]` for each assigned action.
- **Acceptance-test result**: PASSED — WF-1 through WF-4 prove correct routing; test 28 proves real user IDs in actions.

---

## Feature 6: Manual Action Editing

- **UI location**: `Interventions.tsx` — edit modal, reassign target, complete modal with outcome notes.
- **Data source**: Live Supabase `interventions` table. PATCH via `supabase.from('interventions').update()`.
- **Engine function**: Not applicable — manual edits bypass the engine. The engine's `persistEngineOutput()` preserves manual actions by: (a) deleting only `source='auto' AND status='suggested'` rows; (b) skipping regeneration of any `source='auto'` action whose `action_type` + `student_id` has been progressed (status ≠ suggested).
- **DB fields**: `interventions.notes`, `outcome`, `status`, `assigned_to`, `assigned_to_user_id`, `due_date`, `review_date`, `outcome_status`.
- **Live or demo**: LIVE.
- **Status**: FULLY ENGINE-BACKED — persistence semantics proven in test 6 (progressed-set filter) and WF-6 (manual edits survive reanalysis).
- **Changes made**: No change to Interventions.tsx. The progressed-set logic was present in the original; verified it is preserved in both adapters.
- **Acceptance-test result**: PASSED — WF-6, engine test 6.

---

## Feature 7: Success / Recovery Monitoring

- **UI location**: `SuccessStories.tsx` (1,119 lines) — `getStudents()` + `getAnalysisResults()` + `getInterventions()` + `computeGraduationStatus()`. Also imports `getDemoRecognitions()` / `addDemoRecognition()`.
- **Data source**: All live via `data.ts`. `computeGraduationStatus()` reads `risk_level`, `behaviour_score`, `attendance_pct` from the student object.
- **Engine function**: `generateSignals()` — `positive_progress` and `exceptional_achievement` signals; closed-safeguarding severity downgrade. Context: `classifyRewardPatterns()` classifies `sustained_improvement` separately.
- **DB fields**: `students.risk_level`, `attendance_pct`, `behaviour_score`; `analysis_results.signal_types`, `recent_improvements`; `interventions.outcome_status`, `status`.
- **Live or demo**: BOTH — `getDemoRecognitions()` provides demo celebrations; live school data is used when connected.
- **Status**: PARTIALLY ENGINE-BACKED — the student data and risk levels are live/engine-backed; the "graduation" / recognition ceremony logic uses `computeGraduationStatus` (reads from existing DB fields) + a client-side demo store. No `reward_pattern` or `sustained_improvement` signals are surfaced in this page yet.
- **Changes made**: Engine now classifies `sustained_improvement` and `exceptional_achievement` signals; these appear in `analysis_results.signal_types` which SuccessStories reads. No page file changed.
- **Acceptance-test result**: PARTIAL — signal classification tested (scenario A); page rendering NOT VERIFIED runtime.

---

## Feature 8: Teacher Trends

- **UI location**: `StaffDevelopment.tsx` (987 lines) — imports `getBehaviourRecords`, `getStudents`, `getInterventions`, `DEMO_STAFF`.
- **Data source**: `getBehaviourRecords(schoolId)` — live when school connected. `DEMO_STAFF` array for staff display names.
- **Engine function**: `context.ts:computeStaffBaselines()` — computes median reward rate, identifies outliers ≥2.5× median ≥6 events, flags `explainedByIntervention`. Called inside `analyseContext()` which `runEngine()` calls.
- **DB fields**: `behaviour_records.staff_member`, `positive_points`, `behaviour_points`, `date`, `behaviour_class`; `interventions.action_type`, `created_at` (for whole-class intervention detection).
- **Live or demo**: BOTH — `getBehaviourRecords` branches on schoolId.
- **Status**: PARTIALLY ENGINE-BACKED — the raw behaviour data is live; the `StaffDevelopment.tsx` computes per-teacher metrics itself (useMemo, not engine). The canonical `computeStaffBaselines()` result is not yet surfaced to this page. The engine writes per-teacher analysis to `context.staffBaselines[]` in the engine output but this is not persisted to DB yet.
- **Changes made**: `computeStaffBaselines()` now includes `explainedByIntervention` detection (scenario C). No StaffDevelopment.tsx changes made.
- **Acceptance-test result**: PARTIAL — engine logic tested (scenario C); UI page uses its own useMemo not the engine output.

---

## Feature 9: Lesson and Subject Trends

- **UI location**: `StudentProfile.tsx` (subjects_involved tab), `SchoolIntelligence.tsx` (subject breakdown cards).
- **Data source**: `analysis_results.subjects_involved[]` (DB array); `behaviour_records.subject` (structured field added 19 Jul); `schoolIntelligence.ts:generateSchoolIntelligence()` computes per-subject breakdowns.
- **Engine function**: `generateStudentIntelligence()` → `subjectsInvolved` array; `context.ts:detectContextConflicts()` → subject-specific sanction+reward conflicts; `context.ts:computeInterventionContextEffects()` → per-subject before/after.
- **DB fields**: `behaviour_records.subject`, `lesson_period`, `time_of_day`, `location`, `department`; `analysis_results.subjects_involved`, `periods_involved`.
- **Live or demo**: BOTH.
- **Status**: PARTIALLY ENGINE-BACKED — `subjects_involved` is engine-generated and live; context conflicts are engine-generated but not yet persisted to DB (they live in `ContextIntelligence` which is not written to a table). `schoolIntelligence.ts` computes its own version from raw records.
- **Changes made**: `behaviour_records.subject` structured field now populated by CSV ingest and data-sync. No page files changed.
- **Acceptance-test result**: PARTIAL — subject field populated (ingest test 7); context conflict tested (scenario D); page rendering NOT VERIFIED.

---

## Feature 10: Period / Day / Time Patterns

- **UI location**: `StudentProfile.tsx` (periods_involved card), `SchoolIntelligence.tsx`.
- **Data source**: `analysis_results.periods_involved[]`; `behaviour_records.lesson_period`, `time_of_day`.
- **Engine function**: `generateStudentIntelligence()` → `periodsInvolved` map; `schoolIntelligence.ts:generateSchoolIntelligence()` → period/day breakdowns.
- **DB fields**: `behaviour_records.lesson_period`, `time_of_day`, `date` (day-of-week derived); `analysis_results.periods_involved`.
- **Live or demo**: BOTH.
- **Status**: PARTIALLY ENGINE-BACKED — data is structured and populated; `periodsInvolved` is written to `analysis_results`. `schoolIntelligence.ts` does deeper day-of-week and period analysis using live DB data.
- **Changes made**: `lesson_period` and `time_of_day` structured fields populated via CSV ingest and data-sync. No page changes.
- **Acceptance-test result**: PARTIAL — structured fields verified (ingest test 7); runtime NOT VERIFIED.

---

## Feature 11: Form, Year and Cohort Patterns

- **UI location**: `SchoolIntelligence.tsx` (year/form breakdown cards, cohort risk distribution).
- **Data source**: `getIntelligenceInsights(schoolId)` reads `intelligence_insights` table; `generateSchoolIntelligence()` writes it using live student/behaviour/attendance/intervention data.
- **Engine function**: `generateCohortIntelligence()` → `cohorts[]` (year-group risk distributions, PP/SEND breakdowns); `schoolIntelligence.ts:generateSchoolIntelligence()` → `intelligence_insights` rows per year/form/PP/SEND cohort.
- **DB fields**: `students.year_group`, `form`, `send_status`, `pupil_premium`, `risk_level`; `intelligence_insights.*`.
- **Live or demo**: LIVE — `SchoolIntelligence.tsx` reads live Supabase (confirmed above).
- **Status**: FULLY ENGINE-BACKED — `generateSchoolIntelligence()` (698 lines) computes real cohort/form/PP/SEND intelligence from live records; the page reads the persisted `intelligence_insights` table.
- **Changes made**: None — this existed and was fully live. Structured columns now feed richer inputs.
- **Acceptance-test result**: NOT VERIFIED runtime (Supabase required).

---

## Feature 12: Peer / Group Patterns

- **UI location**: `StudentProfile.tsx` (`linked_peers` section), `SignalQueue.tsx` (peer_cluster signal badge).
- **Data source**: `analysis_results.linked_peers[]`; `students.id` cross-reference.
- **Engine function**: `buildPeerLinks()` → `linkedPeerIds[]`; `generateSignals()` → `peer_cluster` signal when `linkedPeerIds.length >= 2 && behaviourCorroboration.sourceCount >= 1`.
- **DB fields**: `analysis_results.linked_peers` (jsonb array of student IDs).
- **Live or demo**: BOTH (same data branch pattern).
- **Status**: FULLY ENGINE-BACKED — peer detection is engine logic operating on real behaviour records.
- **Changes made**: None — present in original engine; preserved verbatim in shared engine (parity audit: peer_cluster guard confirmed identical).
- **Acceptance-test result**: PARTIAL — peer_cluster guard confirmed identical in parity audit; runtime NOT VERIFIED.

---

## Feature 13: Reward / Green-Point Spikes and Incentive Effectiveness

- **UI location**: `StaffDevelopment.tsx` (reward trend cards); `SchoolIntelligence.tsx` (positive engagement section); `StudentProfile.tsx` (positive points badge).
- **Data source**: `behaviour_records.positive_points`, `behaviour_class='positive'`; `context.ts:analyseContext()` → `rewardFindings[]`, `cohortSpikes[]`, `staffBaselines[]`.
- **Engine function**: `context.ts:detectCohortRewardSpikes()`, `classifyRewardPatterns()`, `computeStaffBaselines()`, `detectContextConflicts()`.
- **DB fields**: `behaviour_records.positive_points`, `behaviour_class`, `date`, `staff_member`, `subject`; `students.positive_points` (patched by engine output).
- **Live or demo**: Engine output is live; StaffDevelopment.tsx uses its own useMemo computation from the same `getBehaviourRecords()` live data.
- **Status**: PARTIALLY ENGINE-BACKED — the engine now classifies reward patterns correctly (6/6 scenario tests pass); the results live in `ContextIntelligence` returned by `runEngine()`. They are NOT yet persisted to a dedicated DB column or table. StaffDevelopment.tsx computes its own per-teacher view. The `context.rewardFindings[]` and `staffBaselines[]` are available in the engine output but not surfaced to the UI yet.
- **Changes made**: New `context.ts` module (560 lines) with all 4 detection functions. Engine emits `context` field in output. No page files changed.
- **Acceptance-test result**: PASSED (scenarios A–E, reward_without_improvement, staff baseline, context conflict, cohort campaign).

---

## Feature 14: Staff Training / Support Flags

- **UI location**: `StaffDevelopment.tsx` — shows per-teacher incident rates, outlier flags, intervention effectiveness metrics.
- **Data source**: `getBehaviourRecords()` + `getStudents()` + `getInterventions()` — all live/demo branched.
- **Engine function**: `context.ts:computeStaffBaselines()` — identifies statistical outliers (`outlier: 'high' | 'low' | null`), flags `explainedByIntervention`. NOT yet called from StaffDevelopment.tsx — page uses its own useMemo.
- **DB fields**: `behaviour_records.staff_member`, `positive_points`, `behaviour_points`, `date`; `interventions.action_type`, `created_at`.
- **Live or demo**: BOTH.
- **Status**: PARTIALLY ENGINE-BACKED — the underlying data is live; the engine now has the analytical logic (`computeStaffBaselines`) but it is not connected to the `StaffDevelopment.tsx` UI. The page does its own calculation which is less sophisticated (no outlier detection, no intervention-context explanation).
- **Changes made**: `computeStaffBaselines()` in `context.ts` with `explainedByIntervention` detection. No StaffDevelopment.tsx changes.
- **Acceptance-test result**: PARTIAL — engine logic tested (scenario C); UI page not upgraded.

---

## Feature 15: Intervention Outcome Tracking

- **UI location**: `Interventions.tsx` — complete modal captures `outcome_notes`, updates `outcome_status`, `after_behaviour`, `after_attendance`. `SuccessStories.tsx` shows graduated/improved pupils.
- **Data source**: Live `interventions` table. `data.ts:getInterventions()` branches live/demo.
- **Engine function**: On reanalysis, `runEngine()` reads existing interventions as `InterventionRow[]` (context input). `computeInterventionContextEffects()` computes 28-day before/after per subject. The engine's progressed-set skip prevents completed actions from being re-opened.
- **DB fields**: `interventions.outcome_status`, `after_behaviour`, `after_attendance`, `outcome`, `status='completed'`.
- **Live or demo**: BOTH.
- **Status**: FULLY ENGINE-BACKED — the complete/outcome flow is live; completed actions cannot be silently reopened (progressed-set skip); `computeInterventionContextEffects()` evaluates intervention effectiveness.
- **Changes made**: `InterventionRow` type added; engine now ingests interventions for context analysis. No Interventions.tsx changes.
- **Acceptance-test result**: PASSED — WF-8 (improvement → signal downgrades), engine test 6 (progressed action not regenerated).

---

## Feature 16: Positive Recovery Detection

- **UI location**: `SuccessStories.tsx` — graduation/celebration cards. `SignalQueue.tsx` — `positive_progress`, `exceptional_achievement` signal badges (green/blue).
- **Data source**: `analysis_results.signal_types[]` including `positive_progress`, `exceptional_achievement`; `students.positive_points`.
- **Engine function**: `generateSignals()` — `exceptional_achievement` signal when `riskLevel === 'green' && positivePoints > 15`; `positive_progress` when `signalCategory === 'blue'`; `context.ts:classifyRewardPatterns()` → `sustained_improvement` classification.
- **DB fields**: `analysis_results.signal_types`, `signal_category`; `students.positive_points`, `risk_level`.
- **Live or demo**: BOTH.
- **Status**: FULLY ENGINE-BACKED — signals fire based on real positive_points data from structured `behaviour_records.positive_points` column. `classifyRewardPatterns()` separately identifies sustained improvement.
- **Changes made**: Positive-points regression fix (positive records cannot raise risk score — verified in engine test 4). `sustained_improvement` classification in `context.ts`.
- **Acceptance-test result**: PASSED — engine test 4 (positive points regression), scenario A (sustained_improvement).

---

## Summary Status Table

| # | Feature | Status | Test Result |
|---|---|---|---|
| 1 | Signal Queue | PARTIALLY ENGINE-BACKED | PASSED (engine); modal PARTIAL |
| 2 | DSL/HOY/Tutor/SENDCo/SLT Briefings | PARTIALLY ENGINE-BACKED | PARTIAL |
| 3 | Pupil Timeline | FULLY ENGINE-BACKED | PASSED |
| 4 | Narrative Explanations | FULLY ENGINE-BACKED | PASSED |
| 5 | Auto-Assigned Actions | FULLY ENGINE-BACKED | PASSED (WF-1–4, 28) |
| 6 | Manual Action Editing | FULLY ENGINE-BACKED | PASSED (WF-6, engine 6) |
| 7 | Success / Recovery Monitoring | PARTIALLY ENGINE-BACKED | PARTIAL |
| 8 | Teacher Trends | PARTIALLY ENGINE-BACKED | PARTIAL |
| 9 | Lesson & Subject Trends | PARTIALLY ENGINE-BACKED | PARTIAL |
| 10 | Period / Day / Time Patterns | PARTIALLY ENGINE-BACKED | PARTIAL |
| 11 | Form, Year & Cohort Patterns | FULLY ENGINE-BACKED | NOT VERIFIED (runtime) |
| 12 | Peer / Group Patterns | FULLY ENGINE-BACKED | PARTIAL |
| 13 | Reward / Green-Point Spikes | PARTIALLY ENGINE-BACKED | PASSED (scenarios A–E) |
| 14 | Staff Training / Support Flags | PARTIALLY ENGINE-BACKED | PARTIAL |
| 15 | Intervention Outcome Tracking | FULLY ENGINE-BACKED | PASSED (WF-8, engine 6) |
| 16 | Positive Recovery Detection | FULLY ENGINE-BACKED | PASSED (engine 4, scenario A) |
