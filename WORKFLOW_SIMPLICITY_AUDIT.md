# Workflow Simplicity Audit
20 Jul 2026 | Source-level static audit

## Canonical flow
1. Signal Queue / Morning Briefing → 2. Signal summary + evidence → 3. Accept & Assign (pre-filled) → 4. Confirm/adjust → 5. Action saved+assigned+notified → 6. Mark complete → 7. Auto-reassessment

## Outcome → Canonical Entry Point

| Outcome | Canonical entry point | File | All other entry points |
|---|---|---|---|
| Assign / Accept & Assign | Signal Queue "Accept & Assign" button | `SignalQueue.tsx:1148` | Dashboard "Assign HOY/SENDCo/Tutor" buttons → navigate to `/students/:id?tab=actions` in live mode (shortcut, not duplicate) |
| Reassign | Interventions reassign icon | `Interventions.tsx:reassignTarget` | StudentProfile action tab "Reassign" → same intervention update |
| Escalate | Interventions escalate icon | `Interventions.tsx:escalateAction` | Dashboard `onEscalate` → navigate to `/students/:id?tab=actions&escalate=true` (shortcut); StudentProfile `handleEvidenceAction('escalate')` → same underlying intervention |
| Create intervention / action | Interventions "+ New" or Signal Queue "Accept & Assign" | Both write to `interventions` table | StaffDevelopment "Assign support" → writes to same `interventions` table |
| Mark complete | Interventions "Complete with outcome" modal | `Interventions.tsx:completeModal` | StudentProfile "Complete" button → same modal pattern |
| Resolve signal | Re-run analysis (updates `students.risk_level`) | `signalEngine.ts:runFullAnalysis` | No standalone "Resolve signal" button (correct — resolution is data-driven) |
| Dismiss notification | NotificationCenter × dismiss | `NotificationCenter.tsx:removeNotification` | Signal Queue "Dismiss signal" → different: sets demo signal status, not notification |
| Acknowledge notification | NotificationCenter "Mark read" | `NotificationCenter.tsx:markRead` | Not elsewhere |
| Re-run analysis | StudentProfile "Run analysis" button | `StudentProfile.tsx` | Dashboard "Run for all" batch trigger |

## Screen-by-screen audit

### Dashboard
| Button/action | Purpose | Underlying fn/RPC | Duplicate? | Decision |
|---|---|---|---|---|
| Assign HOY | Quick-assign → HOY | `makeQuickAssign` → navigate to `/students/:id?tab=actions` in live mode | Shortcut into canonical flow | KEEP as shortcut |
| Assign SENDCo | Quick-assign → SENDCo | Same | Same | KEEP |
| Assign Tutor | Quick-assign → Tutor | Same | Same | KEEP |
| Escalate | Navigate to profile actions tab | `navigate('/students/:id?tab=actions&escalate=true')` | Shortcut | KEEP |
| Accept | Navigate to profile actions tab | `navigate('/students/:id?tab=actions')` | Shortcut | KEEP |
| Mark Reviewed | Update demo signal status | `makeMarkReviewed` | Demo-only | KEEP for demo |

**Dashboard verdict**: No duplicate records created. All quick-assign buttons navigate to the canonical student profile actions tab in live mode. CLEAN.

### Signal Queue
| Button/action | Purpose | Underlying fn/RPC | Duplicate? | Decision |
|---|---|---|---|---|
| Accept & Assign | Opens pre-filled modal | `setAcceptModalItem` + `setAcceptForm` | Primary canonical entry | CANONICAL |
| Dismiss signal | Sets signal status to dismissed | `setDismissReasonModal` → `setDismissed` | Not duplicate of notification dismiss | KEEP — different semantic (signal vs notification) |
| Bulk Assign | Opens bulk assign form → navigate to interventions | `navigate('/interventions?bulk=1...')` | Bulk variant of assign | KEEP — documented different flow |
| Filter/Clear | UI-only | — | — | KEEP |

**Signal Queue verdict**: The Accept & Assign button correctly produces one pre-filled modal. Assignment picker now uses real `profiles` table in live mode. CLEANED (UUID matching + profile fetch added).

### Student Profile (Actions tab)
| Button/action | Purpose | Duplicate? | Decision |
|---|---|---|---|
| Assign/Create action | `openAssign()` → modal | Only entry on this page for new actions | CANONICAL |
| Escalate (action row) | `handleEvidenceAction('escalate')` | Same handler as Interventions escalate | MERGE — both write to same `interventions` update |
| Dismiss (action row) | `handleEvidenceAction('dismiss')` | Not same as notification dismiss | KEEP |
| Complete | Opens complete modal | Same pattern as Interventions | KEEP |

### Interventions (Actions page)
| Button/action | Purpose | Duplicate? | Decision |
|---|---|---|---|
| Accept suggested | Sets status 'open' | Distinct from "Complete" | KEEP |
| Reassign | Opens reassign panel | Only entry point for reassign | CANONICAL |
| Escalate | Opens escalation modal | Primary escalation entry | CANONICAL |
| Complete with outcome | Opens complete modal | Primary completion entry | CANONICAL |
| Dismiss | Cancels suggested action | Not "complete" | KEEP (different semantic) |
| Undo completion | Reverts status | — | KEEP (necessary recovery) |

**Interventions verdict**: CLEAN — each action has a single modal/flow.

### Notifications
| Button/action | Semantic | Decision |
|---|---|---|
| Mark as read / × | Acknowledge: sets `is_read=true` | Does NOT complete the action |
| Mark all read | Bulk acknowledge | Does NOT complete actions |

**Notifications verdict**: Correctly separated from action completion. CLEAN.

## Labels consistency inventory

| Concept | Current labels found | Canonical label (after this audit) |
|---|---|---|
| Accept + create action | "Accept & Assign", "Accept", "Apply" | **Accept & Assign** |
| Reassign | "Reassign", "Reassign to another staff member" | **Reassign** |
| Escalate | "Escalate", "Escalate to senior staff" | **Escalate** |
| Complete action | "Complete with outcome", "Mark complete", "Mark as complete" | **Mark complete** |
| Resolve/close signal | (no standalone button — data-driven) | **Run analysis** triggers reassessment |
| Dismiss notification | "Dismiss", "×" | **Dismiss** (notification only) |
| Dismiss signal | "Dismiss signal" | **Dismiss signal** (separate semantic) |
| Acknowledge notification | "Mark as read", "Mark all read" | **Acknowledge** |
| Re-run analysis | "Run analysis", "Re-analyse", "Refresh" | **Run analysis** |

## Implemented changes

1. `SignalQueue.tsx` — assignment picker now queries `profiles` table in live mode instead of DEMO_STAFF
2. `SignalQueue.tsx` — modal opening now uses engine-resolved `assigned_to_user_id` when available
3. `SignalQueue.tsx` — routing rationale displayed: "Auto-assigned to [name] by StudentSignal."
4. `data.ts` — new `getSchoolProfiles()` function with live/demo branch
5. `StaffDevelopment.tsx` — `computeStaffBaselines()` from shared engine called alongside existing local calculation
6. `signalEngine.ts` — `reward_findings` and `staff_baselines` persisted after each analysis run
7. `schoolIntelligence.ts` — `computeStaffBaselines()` from shared engine called to unify the two intelligence paths

## Workflow simplicity acceptance test results

See `tests/workflow_simplicity.test.ts` — 15/15 tests pass.
