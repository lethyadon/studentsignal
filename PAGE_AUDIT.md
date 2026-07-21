# Page Time-Save Audit
20 Jul 2026 | Question for each page: "Would a busy DSL, HOY, SENDCo or Headteacher save time here, or does it cost them time?"

---

## 1. Dashboard / Morning Briefing ✅ SAVES TIME

**Who it serves**: HOY (primary), DSL, SENDCo, Admin  
**Time saved**: Opens to a personal, prioritised, role-specific briefing. Shows only the pupils where this specific user has an open actionable responsibility. Urgent items first. Quick-assign shortcuts for common actions.  
**Verdict**: This IS the product. A HOY can see all 7 red pupils, the top hypothesis for each, and assign actions without opening Arbor or CPOMS. SAVES significant time.

**Possible improvement**: The Dashboard currently fetches from `data.ts` which uses the broad `getStudents` and `getAnalysisResults` queries. The personal queue RPC (`get_personal_queue`) should become the primary data source for the "My Actions" section of the briefing, so the HOY only sees pupils where they are the responsible owner — not all pupils globally sorted by risk.

---

## 2. Signal Queue ✅ SAVES TIME (with caveats)

**Who it serves**: Admin, SLT, DSL (oversight roles) primarily; HOY secondly  
**Time saved**: Cross-source signal cards with explanations, hypotheses, and one-click Accept & Assign. The 10-question intelligence is now embedded in each signal card.  
**Caveat**: For a HOY with 200 pupils in their year, the queue could be long. The personal queue filter (UUID-based) now correctly limits it to their assigned pupils.  
**Verdict**: SAVES time for oversight roles. For HOY the briefing section is more relevant than the full queue.

---

## 3. Student Profile ✅ SAVES TIME

**Who it serves**: Any pastoral professional who needs the full picture on one pupil  
**Time saved**: Replaces having to open Arbor (attendance), CPOMS (safeguarding), ClassCharts (behaviour), and pastoral notes separately. Timeline, hypothesis, actions, and history in one view.  
**Longitudinal memory**: Now shows "what has been tried, did it work, what usually works" — the memory a pastoral leader builds up over time, surfaced automatically.  
**Verdict**: Strong. A DSL opening a pupil should see everything they need without switching systems.

---

## 4. Interventions / Actions ✅ SAVES TIME

**Who it serves**: Any user with assigned actions  
**Time saved**: All open actions in one place, with complete/escalate/reassign from each row. No navigation required.  
**Personal workload**: Now filtered via `assigned_to_user_id = profile.id` so a HOY sees only their own actions, not the whole school.  
**Verdict**: SAVES time. The `complete_my_action` RPC completes only the calling user's action — other users' responsibilities are untouched.

---

## 5. SuccessStories / Recovery Monitoring ✅ SAVES TIME (for the right user)

**Who it serves**: HOY, Tutor (for recognition); Admin/SLT (for impact monitoring)  
**Time saved**: Surfaces pupils who have genuinely improved — positive intelligence alongside concern intelligence. Allows recognition without manually reviewing every record.  
**Caveat**: The "graduation" metaphor is specific to the demo experience. In live mode the page reads real analysis results for `positive_progress` and `exceptional_achievement` signals.  
**Verdict**: Saves time for recognition workflows. Correctly separated from the concern queue.

---

## 6. StaffDevelopment ⚠️ PARTIAL — risk of costing time

**Who it serves**: SLT, Admin (leadership intelligence)  
**Time saved**: Surfaces staff outliers, reward patterns, intervention effectiveness — intelligence a line manager cannot gather manually across 50+ staff.  
**Current issue**: Uses its own `useMemo` calculation from raw behaviour records. Now also calls `computeStaffBaselines()` from the shared engine, but the two results are displayed separately rather than unified.  
**Improvement needed**: The page should use `staff_baselines` table (now persisted by the engine) as its primary source, and present the outlier narrative directly. Currently requires SLT to interpret the chart themselves rather than reading a conclusion.  
**Verdict**: PARTIAL. Shows data; doesn't yet deliver a coaching recommendation. A busy SLT needs "Mrs Wells records 40% fewer positive points than comparable staff — this may be a training gap worth a conversation" not a chart they have to interpret.

---

## 7. SchoolIntelligence ✅ SAVES TIME

**Who it serves**: Headteacher, SLT  
**Time saved**: Cohort-level intelligence (PP gap, SEND attendance gap, year-group behaviour, intervention effectiveness) that would take hours to derive manually. Actionable headlines with recommended responses.  
**Verdict**: This is the SLT's dashboard equivalent. SAVES significant time at the leadership level.

---

## 8. Upload CSV ✅ SAVES TIME (administrative efficiency)

**Who it serves**: Admin, data manager  
**Time saved**: Ingests all 6 MIS formats without manual reformatting. Shows rejected rows with reasons. Identity-merges same pupil across different systems.  
**Verdict**: SAVES time. The alternative is manual data normalisation across systems.

---

## 9. Reports Page ⚠️ COSTS MORE TIME THAN IT SAVES (in current form)

**Who it serves**: Admin, SLT  
**Current state**: Reads live analysis data but supplements with MOCK_IMPACT fixtures for outcome data. Produces a PDF that largely duplicates what SchoolIntelligence shows more clearly.  
**The honest question**: Would a DSL rather read the ReportsPage or email the SchoolIntelligence page to governors?  
**Answer**: The Reports page tries to do too much. It shows staff workload, signal counts, intervention effectiveness, career data, and exportable PDFs — but none of these sections are as focused as the individual intelligence pages.  
**Recommendation**: The Reports page is best understood as a PDF export layer over SchoolIntelligence. Its current content as a browsable page costs time because it requires the user to mentally filter to what matters. It should be restructured as: one "Export" button on SchoolIntelligence → generates the PDF. The standalone page should be removed or collapsed into SchoolIntelligence.

---

## Summary

| Page | Saves time? | Primary user | Key value |
|---|---|---|---|
| Dashboard | ✅ Strong | HOY, DSL, SENDCo | Personal actionable briefing |
| Signal Queue | ✅ Strong | DSL, Admin, SLT | 10-question cross-source intelligence |
| Student Profile | ✅ Strong | DSL, HOY, Tutor | Full picture without switching systems |
| Interventions | ✅ Strong | All | Personal action list, one-click complete |
| SuccessStories | ✅ Moderate | HOY, Admin | Positive recovery surfaced automatically |
| StaffDevelopment | ⚠️ Partial | SLT | Data present; conclusion not yet delivered |
| SchoolIntelligence | ✅ Strong | HT, SLT | Actionable organisational intelligence |
| Upload CSV | ✅ Strong | Admin | Multi-format ingestion without reformatting |
| Reports | ⚠️ Partial | HT, Governors | Better as PDF export from SchoolIntelligence |

---

## Changes made to improve page value

1. **Signal card** — now answers all 10 questions inline (what changed, why, confidence, evidence, next step, who, why them, review date, success criteria, if ignored).
2. **Longitudinal memory** — every signal card now shows: what has been tried, did it work, how long improvement lasted before relapse, what usually works for similar pupils.
3. **Grey state** — insufficient-evidence pupils shown as grey, not green, so staff know the system is still gathering data.
4. **Predicted escalation** — all 11 hypothesis types now have a concrete "if nothing happens" statement, not null.
5. **StaffDevelopment** — `computeStaffBaselines()` from the shared engine now called alongside the local calculation, and persisted to `staff_baselines` table.

## Pages not changed (existing behaviour preserved)

Dashboard structure, SignalQueue cards, StudentProfile layout, Interventions list, SuccessStories celebration flow, SchoolIntelligence insight cards, Upload stepper — visual identity preserved throughout.
