# Engine Parity Audit — original copies vs canonical shared engine

19 Jul 2026. Verifies the consolidation did NOT remove or simplify any
intelligence that existed in the original frontend engine
(`src/lib/signalEngine.ts`, 1,269 lines, 9 Jul baseline) or the edge-function
copy (`supabase/functions/run-analysis/index.ts`, 423 lines, 9 Jul baseline).
Originals re-extracted from the untouched 9 Jul export to
`/home/claude/recon/originals/` and compared programmatically.

## 1. Function inventory

Every exported function of the original frontend engine exists in the shared
engine: addDays, assignActions, buildAnalysisRow, buildPeerLinks, corroborate,
generateActions, generateCohortIntelligence, generateSignals,
generateStudentIntelligence, normaliseStudents, resolveHOYName, topEntry.
`runFullAnalysis` (fetch/persist orchestration) lives in the two thin
adapters by design. `generateSchoolIntelligence` remains in
`src/lib/schoolIntelligence.ts` untouched (see CONTEXT_INTELLIGENCE_AUDIT.md).
The edge copy's `resolveHOY` is the shared `resolveHOYName`;
`composeSignalExplanation` was byte-identical in `src/lib/intelligence.ts`
and the shared engine (7,007 = 7,007 chars, `identical bodies: True`) — the
local copy is now a re-export of the shared one, so exactly one
implementation exists.

## 2. Signal detector guards (literal comparison output)

Original `generateSignals` contained 9 guards; the shared engine contains 10.
All 9 originals are present verbatim; the only changed guard was WIDENED
(additive), never narrowed:

| Original guard | Shared engine |
|---|---|
| `norm.safeguardingRecordCount > 0 \|\| (…noteCount > 0 && sourceCount >= 2)` | identical |
| `behaviourCorroboration.sourceCount >= 2 && totalBehaviourPoints > 8` | identical |
| `norm.avgAttendance < 80` | `norm.avgAttendance < 80 \|\| attendanceConcernLevel === 'persistent_absence'` (widened) |
| `attendanceCorroboration.sourceCount >= 2 && avgAttendance < 92` | identical |
| `wellbeingCorroboration.sourceCount >= 2` | identical |
| `missingCareerData \|\| hasCareerRisk …` | identical |
| `signalCategory === 'blue'` | identical |
| `riskLevel === 'green' && positivePoints > 15` | identical |
| `linkedPeerIds.length >= 2 && behaviourCorroboration.sourceCount >= 1` | identical |
| — | `belowTargetSubjects.length >= 2` (NEW: attainment_decline) |

## 3. Signal types

Original: attendance_decline, behaviour_escalation, careers_gap,
exceptional_achievement, peer_cluster, positive_progress, safeguarding,
send_review — ALL present. New additive: attainment_decline, reward_pattern,
context_pattern.

## 4. Action types

Identical 8/8: Attendance intervention, Behaviour review meeting, Careers
destination review, Pastoral check-in, Peer group investigation, Recognition
and celebration, SEND support review, Safeguarding review.

## 5. analysis_results row output

Programmatic key comparison of `buildAnalysisRow` return objects:
`removed: []  added: []` — the 26 original columns are produced identically.
The new `hypotheses` jsonb is added at the runEngine call site (spread), not
by altering buildAnalysisRow.

## 6. Edge-function copy

The original 423-line edge function was a condensed re-implementation of the
same pipeline (no distinct detectors; inline logic, subset of frontend
behaviour, and the two copies had drifted — see RECONCILIATION.md). Its
distinct responsibilities (fetch, persist, attendanceConcerns count,
progressed-action skip) are reproduced in the new 166-line adapter; its
scoring/staging is superseded by the canonical engine, which is a superset of
both copies per sections 1–5.

## 7. Intentional additive changes (documented, not silent)

- Positive-class behaviour excluded from negative totals (prevents rewards
  raising risk — regression-tested).
- Closed safeguarding cases cap at amber instead of forcing red (open cases
  unchanged) — tested with the open→closed CPOMS re-import fixture.
- Risk score gains structured-field terms (late marks, PA flag, open/closed
  weighting, below-target subjects) — all additive inputs.
- Reward/context/routing modules are new files; nothing was deleted to add
  them.

**Verdict: no detector, output column, action type or narrative path from
either original was removed or simplified. PASSED (static, programmatic).**
