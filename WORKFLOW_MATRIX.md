# StudentSignal Workflow Matrix
19 Jul 2026 | Implementation: `supabase/functions/_shared/routing.ts`

## Core workflow
`signal detected → risk/context classified → appropriate workflow selected → actual authorised user resolved → modal pre-filled → staff confirms or adjusts → notification sent → action tracked → escalation/reassessment occurs automatically`

## Routing rules

| Signal type | Severity | Pupil context | Default owner | Fallback owner | Escalation path | Notification recipients | Modal pre-fill | Manual override |
|---|---|---|---|---|---|---|---|---|
| safeguarding | urgent/high | Any year | DSL (`role=dsl`) | Admin | dsl → admin | DSL only | pupil, signal=safeguarding review, urgent, due+1d, DSL evidence, safeguarding evidence | Restricted: assignee can only be DSL/admin/SLT-with-grant |
| attendance | high | Y10 pupil | Year 10 HOY | Pastoral lead | head_of_year → pastoral_lead → slt → admin | HOY + SLT (high) | pupil, attendance %, late marks, PA flag, action=Attendance intervention, due+3d | All fields except pupil/school |
| attendance | medium | Y10 pupil | Year 10 HOY | Pastoral lead | head_of_year → pastoral_lead → slt → admin | HOY | Same; due+7d | All fields except pupil/school |
| behaviour_escalation | high | Any year | HOY for year | Pastoral lead | head_of_year → pastoral_lead → slt → admin | HOY + SLT (high) | pupil, behaviour score, incident count, action=Behaviour review meeting, due+3d | All fields except pupil/school |
| send_related / send_review | medium | SEND pupil | SENDCo | Pastoral lead | sendco → pastoral_lead → slt → admin | SENDCo | pupil, SEND status, provision gaps, action=SEND support review, due+7d | All fields except pupil/school |
| context_pattern (subject) | medium | Y10/Science | Subject teacher (dept=Science) | HOY for year | teacher → head_of_year → slt → admin | Subject teacher | pupil, subject, sanctions+rewards in context, action=Behaviour review meeting | All fields |
| careers_gap | low/medium | Y10/Y11 no careers data | Careers lead | SLT | careers_lead → slt → admin | Careers lead | pupil, year group, missing destination data, action=Careers destination review | All fields |
| reward_pattern | low | Any | HOY | Pastoral lead | head_of_year → pastoral_lead → slt → admin | HOY | Cautious narrative, classification, evidence | All fields |
| peer_cluster | medium | Linked pupils | HOY for year | SLT | head_of_year → pastoral_lead → slt → admin | HOY | Linked peer IDs, shared incidents, action=Peer group investigation | All fields |
| attainment_decline | medium | Below-target subjects | HOY for year | Pastoral lead | head_of_year → pastoral_lead → slt → admin | HOY | Subject list, progress status per subject | All fields |
| cohort/school-wide | any | Multiple pupils | SLT | Admin | slt → admin | SLT | Cohort affected, percentage impacted, action=Review | All fields |
| *no owner configured* | any | Any | Admin (fallback) | — | admin only | Admin | Same as above + `unresolved: true` flag | All fields |

## Automatic escalation triggers

| Trigger | Condition | Action |
|---|---|---|
| Overdue | `due_date < today AND status IN ('suggested','in_progress')` | Walk one step up escalation path; bump priority (high→urgent); notify old and new assignee |
| Failed intervention | `status = 'completed' AND outcome_status = 'no_improvement'` | Walk one step up; reason = "Intervention completed without improvement" |
| Repeated signal | Same `signalType` fires on second consecutive analysis run while action still `suggested` | Walk one step up; reason = "Signal repeated without resolution" |
| Worsening risk | `riskScore` increases ≥10 points across two analyses while action open | Bump priority; notify current assignee + senior |
| Safeguarding escalation | `openSafeguardingCount > 0` on reanalysis while no DSL action exists | Generate new urgent Safeguarding review action to DSL |

## Deduplication rules

| Situation | Behaviour |
|---|---|
| Same `student_id + action_type` with `source='auto' AND status='suggested'` already exists | Skip regeneration (progressed-set) |
| `source='manual'` action with same type | Never deleted or regenerated; entirely outside engine scope |
| Notification with same `recipient_id + student_id + title` already `is_read=false` | Not re-inserted |
| Analysis rerun with identical data | Identical output due to deterministic engine; same actions, no new notifications |

## Modal default fields (pre-populated, no staff input required)

| Field | Source |
|---|---|
| pupil | `students.id`, `students.name` |
| signal_type | Engine `signalType` |
| action_type | Engine `generateActions()` |
| recommended_action | Engine `notes` field |
| assigned_to_user_id | `routing.ts:resolveOwner()` — actual profile UUID |
| assigned_to | `profiles.full_name` |
| responsible_role | `routing.ts:responsibleRole` |
| priority | Signal severity (urgent=+1d, high=+3d, medium/low=+7d) |
| due_date | Computed: today + offset by severity |
| review_date | due_date + 14 days |
| rationale | `routing.ts:rationale` (includes why this owner was selected) |
| evidence | Engine `key_reasons[]` + hypothesis `supportingEvents[]` |
| escalation_level | 0 (initial; increments on each escalation) |
| success_criteria | Signal-type-specific template (attendance=95%, safeguarding=DSL reviewed, behaviour=no incidents in window) |
| notification_recipients | `routing.ts:notificationRecipients[]` (resolver + senior lead for high/urgent) |

## Override rules

| Field | Overridable by staff | Notes |
|---|---|---|
| action_type | YES | |
| recommended_action | YES | |
| priority | YES | |
| due_date | YES | |
| review_date | YES | |
| success_criteria | YES | |
| rationale | YES | |
| assigned_to_user_id | YES (with restriction) | For safeguarding: candidate set is restricted by `resolveOwner` to DSL/admin/SLT-with-grant only |
| student_id | NO | Tenancy boundary |
| school_id | NO | Tenancy boundary |
| source | NO | Must remain 'auto' or 'manual' as set on creation |

## Acceptance scenario proof outputs (literal test results)

All 10 scenarios PASSED (12/12 routing tests, 34/34 total tests):

1. `WF-1 PASSED` — Y10 attendance → `u-hoy10` (HOY Helen Y10), not `u-hoy9`
2. `WF-2 PASSED` — Same pupil + safeguarding → `u-dsl` (DSL Dawn), escalationPath=['dsl','admin']
3. `WF-3 PASSED` — Science lesson pattern → `u-sci` (Science Lead Sofia, dept=Science)
4. `WF-4 PASSED` — SEND pattern → `u-sendco` (SENDCo Steph)
5. `WF-5 PASSED` — Modal: student_id='s1', assigned_to_user_id='u-hoy10', priority='high', due_date='2026-07-22', review_date='2026-08-05', evidence.length=3, success_criteria includes '95%'
6. `WF-6 PASSED` — Progressed action excluded from delete+regen; manual assignee and due date survive
7. `WF-7 PASSED` — Overdue HOY action → escalates to `u-pastoral` (pastoral_lead), priority='urgent', both parties notified
8. `WF-8 PASSED` — Improved data (96% attendance, closed case) → riskScore drops, attendance_decline signal disappears, safeguarding severity no longer critical
9. `WF-9 PASSED` — Completed with no improvement → escalates to `u-pastoral`, reason contains "without improvement"
10. `WF-10 PASSED` — No HOY configured → `u-admin` assigned, `unresolved=true`, rationale explains fallback

**WORKFLOW READY: YES (logic proven in 12/12 tests). Runtime delivery (notification email, UI modal rendering) NOT VERIFIED — requires staging environment.**
