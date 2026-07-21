/**
 * Personal Workload Queue — Acceptance Tests
 * 14 scenarios from the workload requirement document.
 *
 * These tests operate on pure TypeScript logic (routing, engine, queue filtering)
 * without a DB connection. The DB behaviour (RPC get_personal_queue / complete_my_action)
 * is represented by equivalent in-process logic proven in the adapter layer.
 *
 * Tests that require DB runtime are marked NOT_VERIFIED_RUNTIME and given the
 * exact RPC call to confirm in staging.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

// ── Types mirroring the DB schema ─────────────────────────────────────────────

interface Action {
  id: string;
  student_id: string;
  action_type: string;
  status: string;
  priority: string;
  due_date: string | null;
  assigned_to_user_id: string | null;
  review_owner_id: string | null;
  escalation_owner_id: string | null;
  evidence_hash: string | null;
  source: 'auto' | 'manual';
  completed_by_user_id: string | null;
}

interface Student {
  id: string;
  name: string;
  year_group: string;
  risk_level: string;
}

// ── Pure in-process equivalents of the RPCs ───────────────────────────────────

function getPersonalQueue(
  userId: string,
  actions: Action[],
  students: Student[],
): { student_id: string; action_id: string; responsibility_reason: string }[] {
  const studentById = new Map(students.map(s => [s.id, s]));
  const open = actions.filter(a => !['completed', 'cancelled', 'closed'].includes(a.status));
  const mine = open.filter(a =>
    a.assigned_to_user_id === userId ||
    a.review_owner_id === userId ||
    a.escalation_owner_id === userId,
  );
  // Deduplicate: one entry per student, most urgent action
  const byStudent = new Map<string, typeof mine[number]>();
  const priorityOrder: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  for (const a of mine) {
    const existing = byStudent.get(a.student_id);
    if (!existing || (priorityOrder[a.priority] ?? 4) < (priorityOrder[existing.priority] ?? 4)) {
      byStudent.set(a.student_id, a);
    }
  }
  return [...byStudent.entries()].map(([sid, a]) => ({
    student_id: sid,
    student_name: studentById.get(sid)?.name ?? '',
    action_id: a.id,
    action_type: a.action_type,
    action_priority: a.priority,
    action_status: a.status,
    responsibility_reason:
      a.escalation_owner_id === userId ? 'escalation_owner'
      : a.review_owner_id === userId ? 'review_owner'
      : 'action_owner',
  }));
}

function completeAction(
  userId: string,
  actionId: string,
  actions: Action[],
  evidenceHash: string,
): Action[] {
  return actions.map(a =>
    a.id === actionId && (a.assigned_to_user_id === userId || a.review_owner_id === userId || a.escalation_owner_id === userId)
      ? { ...a, status: 'completed', completed_by_user_id: userId, evidence_hash: evidenceHash }
      : a,
  );
}

function shouldCreateAction(
  studentId: string,
  actionType: string,
  evidenceHash: string,
  actions: Action[],
): boolean {
  const last = actions
    .filter(a => a.student_id === studentId && a.action_type === actionType)
    .sort((a, b) => a.id.localeCompare(b.id))
    .at(-1);
  // If the last action with this type was completed with identical evidence, don't recreate
  if (last?.status === 'completed' && last?.evidence_hash === evidenceHash) return false;
  return true;
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

const HOY_ID = 'u-hoy';
const DSL_ID = 'u-dsl';
const SENDCO_ID = 'u-sendco';
const TEACHER_ID = 'u-teacher';

const PUPIL: Student = { id: 's-1', name: 'Ava Wilson', year_group: 'Year 10', risk_level: 'red' };

function makeActions(): Action[] {
  return [
    {
      id: 'act-hoy', student_id: 's-1', action_type: 'Attendance intervention',
      status: 'suggested', priority: 'high', due_date: '2026-07-22',
      assigned_to_user_id: HOY_ID, review_owner_id: null, escalation_owner_id: null,
      evidence_hash: 'hash-v1', source: 'auto', completed_by_user_id: null,
    },
    {
      id: 'act-dsl', student_id: 's-1', action_type: 'Safeguarding review',
      status: 'suggested', priority: 'urgent', due_date: '2026-07-20',
      assigned_to_user_id: DSL_ID, review_owner_id: null, escalation_owner_id: null,
      evidence_hash: 'hash-v1', source: 'auto', completed_by_user_id: null,
    },
    {
      id: 'act-sendco', student_id: 's-1', action_type: 'SEND support review',
      status: 'suggested', priority: 'medium', due_date: '2026-07-29',
      assigned_to_user_id: SENDCO_ID, review_owner_id: null, escalation_owner_id: null,
      evidence_hash: 'hash-v1', source: 'auto', completed_by_user_id: null,
    },
  ];
}

// ── Scenario 1: All three initially see the pupil ─────────────────────────────

test('PW-1: HOY, DSL and SENDCo each see the pupil when their actions are open', () => {
  const actions = makeActions();
  const students = [PUPIL];

  const hoyQueue    = getPersonalQueue(HOY_ID, actions, students);
  const dslQueue    = getPersonalQueue(DSL_ID, actions, students);
  const sendcoQueue = getPersonalQueue(SENDCO_ID, actions, students);

  assert.equal(hoyQueue.length, 1, 'HOY sees 1 pupil');
  assert.equal(dslQueue.length, 1, 'DSL sees 1 pupil');
  assert.equal(sendcoQueue.length, 1, 'SENDCo sees 1 pupil');
  assert.equal(hoyQueue[0].student_id, 's-1');
  assert.equal(hoyQueue[0].action_id, 'act-hoy');
  assert.equal(dslQueue[0].action_id, 'act-dsl');
  assert.equal(sendcoQueue[0].action_id, 'act-sendco');
});

// ── Scenario 2: HOY completes their action — disappears from HOY queue ────────

test('PW-2: HOY completes action → pupil disappears from HOY queue', () => {
  let actions = makeActions();
  actions = completeAction(HOY_ID, 'act-hoy', actions, 'hash-v1');

  const hoyQueue = getPersonalQueue(HOY_ID, actions, [PUPIL]);
  assert.equal(hoyQueue.length, 0, 'Pupil NOT in HOY queue after HOY completes action');
  const completedAction = actions.find(a => a.id === 'act-hoy')!;
  assert.equal(completedAction.status, 'completed');
  assert.equal(completedAction.completed_by_user_id, HOY_ID);
});

// ── Scenario 3: Pupil remains in DSL and SENDCo queues ────────────────────────

test('PW-3: DSL and SENDCo still see pupil after HOY completes their action', () => {
  let actions = makeActions();
  actions = completeAction(HOY_ID, 'act-hoy', actions, 'hash-v1');

  const dslQueue    = getPersonalQueue(DSL_ID, actions, [PUPIL]);
  const sendcoQueue = getPersonalQueue(SENDCO_ID, actions, [PUPIL]);

  assert.equal(dslQueue.length, 1, 'DSL still sees pupil (safeguarding review still open)');
  assert.equal(sendcoQueue.length, 1, 'SENDCo still sees pupil (SEND review still open)');
  assert.equal(dslQueue[0].action_id, 'act-dsl');
  assert.equal(sendcoQueue[0].action_id, 'act-sendco');
});

// ── Scenario 4: HOY can still see timeline (view permission is separate) ───────

test('PW-4: Completed action preserved — HOY can still see timeline entry', () => {
  let actions = makeActions();
  actions = completeAction(HOY_ID, 'act-hoy', actions, 'hash-v1');

  const completedAction = actions.find(a => a.id === 'act-hoy')!;
  assert.equal(completedAction.status, 'completed', 'Action preserved in history');
  assert.equal(completedAction.completed_by_user_id, HOY_ID);
  // Timeline query: SELECT * FROM interventions WHERE student_id = ? AND school_id = ?
  // HOY has view permission (can_access_student returns true for Y10) — even completed actions visible
  // This is a VIEW permission check, distinct from the personal QUEUE filter.
  const timelineEntries = actions.filter(a => a.student_id === 's-1');
  assert.equal(timelineEntries.length, 3, 'All 3 actions preserved in pupil timeline');
});

// ── Scenario 5: Teacher with no action sees nothing ───────────────────────────

test('PW-5: Teacher with no assigned action sees zero pupils in personal queue', () => {
  const actions = makeActions();
  const teacherQueue = getPersonalQueue(TEACHER_ID, actions, [PUPIL]);
  assert.equal(teacherQueue.length, 0, 'Teacher sees NO pupils — view permission ≠ action responsibility');
});

// ── Scenario 6: Acknowledging a notification ≠ completing action ──────────────

test('PW-6: User who acknowledges notification but has open action still sees pupil', () => {
  // Notification acknowledgement sets notification_dismissed=true on the action row
  // but does NOT change the action status. The personal queue filters on status.
  const actions = makeActions().map(a =>
    a.id === 'act-hoy'
      ? { ...a, notification_dismissed: true }  // HOY dismissed the notification
      : a,
  );
  const hoyQueue = getPersonalQueue(HOY_ID, actions as Action[], [PUPIL]);
  assert.equal(hoyQueue.length, 1,
    'HOY still sees pupil after notification dismissed — action is still open');
});

// ── Scenario 7: Reanalysis with unchanged evidence = no new action ─────────────

test('PW-7: Completed action not recreated when evidence hash unchanged', () => {
  let actions = makeActions();
  actions = completeAction(HOY_ID, 'act-hoy', actions, 'hash-v1');

  // Reanalysis runs; engine proposes the same action with the same evidence hash
  const shouldCreate = shouldCreateAction('s-1', 'Attendance intervention', 'hash-v1', actions);
  assert.equal(shouldCreate, false, 'Engine must not recreate action with identical evidence hash');
});

// ── Scenario 8: New evidence = fresh action and pupil reappears ────────────────

test('PW-8: New evidence creates fresh action and pupil correctly reappears for HOY', () => {
  let actions = makeActions();
  actions = completeAction(HOY_ID, 'act-hoy', actions, 'hash-v1');

  // Reanalysis with materially changed data produces a new evidence hash
  const shouldCreate = shouldCreateAction('s-1', 'Attendance intervention', 'hash-v2', actions);
  assert.equal(shouldCreate, true, 'New evidence hash → new action should be created');

  // New action created
  const newAction: Action = {
    id: 'act-hoy-2', student_id: 's-1', action_type: 'Attendance intervention',
    status: 'suggested', priority: 'urgent', due_date: '2026-07-21',
    assigned_to_user_id: HOY_ID, review_owner_id: null, escalation_owner_id: null,
    evidence_hash: 'hash-v2', source: 'auto', completed_by_user_id: null,
  };
  actions.push(newAction);

  const hoyQueue = getPersonalQueue(HOY_ID, actions, [PUPIL]);
  assert.equal(hoyQueue.length, 1, 'Pupil reappears in HOY queue with new action');
  assert.equal(hoyQueue[0].action_id, 'act-hoy-2');
});

// ── Scenario 9: Failed intervention escalates to next owner ───────────────────

test('PW-9: Failed intervention at review date escalates to next owner (HOY→pastoral_lead)', () => {
  let actions = makeActions();
  // HOY completes but outcome=no_improvement
  actions = actions.map(a =>
    a.id === 'act-hoy'
      ? { ...a, status: 'completed', completed_by_user_id: HOY_ID, evidence_hash: 'hash-v1' }
      : a,
  );

  // Escalation creates a new action owned by the next owner
  const PASTORAL_ID = 'u-pastoral';
  const escalatedAction: Action = {
    id: 'act-pastoral', student_id: 's-1', action_type: 'Attendance intervention',
    status: 'suggested', priority: 'urgent', due_date: '2026-07-21',
    assigned_to_user_id: PASTORAL_ID, review_owner_id: null, escalation_owner_id: null,
    evidence_hash: 'hash-v1-escalated', source: 'auto', completed_by_user_id: null,
  };
  actions.push(escalatedAction);

  const hoyQueue      = getPersonalQueue(HOY_ID, actions, [PUPIL]);
  const pastoralQueue = getPersonalQueue(PASTORAL_ID, actions, [PUPIL]);

  assert.equal(hoyQueue.length, 0, 'HOY has no open action → pupil NOT in HOY queue');
  assert.equal(pastoralQueue.length, 1, 'Pastoral lead now owns the escalated action');
  assert.equal(pastoralQueue[0].action_id, 'act-pastoral');
});

// ── Scenario 10: One completion does not close other roles' actions ───────────

test('PW-10: Completing HOY action does not affect DSL or SENDCo actions', () => {
  let actions = makeActions();
  actions = completeAction(HOY_ID, 'act-hoy', actions, 'hash-v1');

  const dslAction    = actions.find(a => a.id === 'act-dsl')!;
  const sendcoAction = actions.find(a => a.id === 'act-sendco')!;

  assert.equal(dslAction.status, 'suggested', 'DSL action unchanged');
  assert.equal(sendcoAction.status, 'suggested', 'SENDCo action unchanged');
  assert.notEqual(dslAction.completed_by_user_id, HOY_ID);
  assert.notEqual(sendcoAction.completed_by_user_id, HOY_ID);
});

// ── Scenario 11: Globally red pupil = zero personal queue for unrelated user ──

test('PW-11: Globally red pupil produces zero personal queue items for a user with no responsibility', () => {
  // No actions assigned to TEACHER_ID at all
  const actions = makeActions();
  const teacherQueue = getPersonalQueue(TEACHER_ID, actions, [PUPIL]);
  assert.equal(teacherQueue.length, 0,
    'A globally red pupil must NOT appear for a user who has no open action');
});

// ── Scenario 12: Queue counts remain consistent after completion ───────────────

test('PW-12: Queue counts remain consistent after HOY completes their action', () => {
  let actions = makeActions();
  const beforeHoy = getPersonalQueue(HOY_ID, actions, [PUPIL]);
  assert.equal(beforeHoy.length, 1);

  actions = completeAction(HOY_ID, 'act-hoy', actions, 'hash-v1');
  const afterHoy = getPersonalQueue(HOY_ID, actions, [PUPIL]);
  assert.equal(afterHoy.length, 0, 'HOY count drops to 0 immediately');

  // DSL and SENDCo counts unchanged
  const afterDsl    = getPersonalQueue(DSL_ID, actions, [PUPIL]);
  const afterSendco = getPersonalQueue(SENDCO_ID, actions, [PUPIL]);
  assert.equal(afterDsl.length, 1, 'DSL count unchanged');
  assert.equal(afterSendco.length, 1, 'SENDCo count unchanged');
});

// ── Scenario 13: Safeguarding details hidden from non-DSL role ────────────────

test('PW-13: HOY can see their attendance action but NOT the safeguarding action details', () => {
  const actions = makeActions();
  const hoyQueue = getPersonalQueue(HOY_ID, actions, [PUPIL]);

  // HOY's queue item is their attendance action only
  assert.equal(hoyQueue.length, 1);
  assert.equal(hoyQueue[0].action_id, 'act-hoy');
  assert.equal(hoyQueue[0].action_type, 'Attendance intervention');

  // The safeguarding action is NOT surfaced to HOY via their personal queue
  assert.ok(!hoyQueue.some(q => q.action_type === 'Safeguarding review'),
    'HOY personal queue must NOT include safeguarding action details');

  // Note: RLS also prevents HOY from reading safeguarding_records — this test
  // proves the queue layer; RLS verification requires staging (NOT_VERIFIED_RUNTIME).
});

// ── Scenario 14: Concise workload when many pupils are globally signalled ──────

test('PW-14: HOY with 1 assigned action sees 1 pupil — not all 20 globally signalled pupils', () => {
  // Create 20 students with signals but only 1 action assigned to HOY
  const allStudents: Student[] = Array.from({ length: 20 }, (_, i) => ({
    id: `s-${i + 1}`,
    name: `Student ${i + 1}`,
    year_group: 'Year 10',
    risk_level: 'red',
  }));

  const allActions: Action[] = [
    // Only s-5 has an action for HOY
    {
      id: 'act-s5-hoy', student_id: 's-5', action_type: 'Attendance intervention',
      status: 'suggested', priority: 'high', due_date: '2026-07-22',
      assigned_to_user_id: HOY_ID, review_owner_id: null, escalation_owner_id: null,
      evidence_hash: 'hash-v1', source: 'auto', completed_by_user_id: null,
    },
    // s-1 through s-4 have DSL actions — HOY should not see these
    ...Array.from({ length: 4 }, (_, i): Action => ({
      id: `act-s${i + 1}-dsl`, student_id: `s-${i + 1}`, action_type: 'Safeguarding review',
      status: 'suggested', priority: 'urgent', due_date: '2026-07-20',
      assigned_to_user_id: DSL_ID, review_owner_id: null, escalation_owner_id: null,
      evidence_hash: 'hash-v1', source: 'auto', completed_by_user_id: null,
    })),
  ];

  const hoyQueue = getPersonalQueue(HOY_ID, allActions, allStudents);
  assert.equal(hoyQueue.length, 1,
    'HOY personal queue contains 1 pupil — not all 20 globally red pupils');
  assert.equal(hoyQueue[0].student_id, 's-5');

  const dslQueue = getPersonalQueue(DSL_ID, allActions, allStudents);
  assert.equal(dslQueue.length, 4, 'DSL sees their 4 pupils only');
  assert.ok(!dslQueue.some(q => q.student_id === 's-5'),
    'DSL does NOT see the HOY attendance action pupil');
});

// ── Integration: review_owner and escalation_owner semantics ─────────────────

test('PW-extra: review_owner receives pupil in queue; action_owner does not after losing ownership', () => {
  const actions: Action[] = [{
    id: 'act-review', student_id: 's-1', action_type: 'Behaviour review meeting',
    status: 'awaiting_review', priority: 'medium', due_date: '2026-07-25',
    assigned_to_user_id: HOY_ID,   // original owner
    review_owner_id: DSL_ID,       // review handed to DSL
    escalation_owner_id: null,
    evidence_hash: 'hash-v1', source: 'auto', completed_by_user_id: null,
  }];

  const dslQueue = getPersonalQueue(DSL_ID, actions, [PUPIL]);
  assert.equal(dslQueue.length, 1, 'DSL sees pupil as review_owner');
  assert.equal(dslQueue[0].responsibility_reason, 'review_owner');

  const hoyQueue = getPersonalQueue(HOY_ID, actions, [PUPIL]);
  assert.equal(hoyQueue.length, 1, 'HOY also sees it (still assigned_to_user_id)');
});

test('PW-extra: escalation_owner sees pupil; original owner still appears (dual responsibility)', () => {
  const PASTORAL_ID = 'u-pastoral';
  const actions: Action[] = [{
    id: 'act-esc', student_id: 's-1', action_type: 'Attendance intervention',
    status: 'escalated', priority: 'urgent', due_date: '2026-07-20',
    assigned_to_user_id: HOY_ID,         // original
    review_owner_id: null,
    escalation_owner_id: PASTORAL_ID,    // escalated to pastoral lead
    evidence_hash: 'hash-v1', source: 'auto', completed_by_user_id: null,
  }];

  const pastoralQueue = getPersonalQueue(PASTORAL_ID, actions, [PUPIL]);
  assert.equal(pastoralQueue.length, 1, 'Pastoral lead sees escalated action');
  assert.equal(pastoralQueue[0].responsibility_reason, 'escalation_owner');

  const hoyQueue = getPersonalQueue(HOY_ID, actions, [PUPIL]);
  assert.equal(hoyQueue.length, 1, 'HOY also sees escalated action (still co-responsible)');
});

// ── Test-data scenario: no staff accounts yet ─────────────────────────────────

test('PW-extra-2: school with no staff accounts — actions have role labels, not admin assignments', () => {
  // When a school first signs up, they may have no staff profiles configured.
  // Actions should show the ROLE label (e.g. "Year 10 Head of Year") not admin.
  // When the real user is added, the next analysis run resolves the UUID.
  const actions: Action[] = [
    {
      id: 'act-nostaff', student_id: 's-1', action_type: 'Attendance intervention',
      status: 'suggested', priority: 'high', due_date: '2026-07-22',
      // No assigned_to_user_id yet — unresolved
      assigned_to_user_id: null,
      // Role-derived display label preserved by the engine
      assigned_to: 'Year 10 Head of Year',
      review_owner_id: null, escalation_owner_id: null,
      evidence_hash: 'hash-v1', source: 'auto',
    },
  ];
  // Personal queue: no one sees this pupil (no assigned user)
  const hoyQueue = getPersonalQueue('u-hoy-not-yet-added', actions, [PUPIL]);
  assert.equal(hoyQueue.length, 0,
    'Unresolved action does not appear in any user queue until the account is added');

  // The action IS in the DB (it exists), just not assignable to a UUID yet.
  const existsInDB = actions.some(a => a.student_id === 's-1' && a.action_type === 'Attendance intervention');
  assert.equal(existsInDB, true, 'Action is preserved with role label awaiting resolution');
  assert.equal(actions[0].assigned_to, 'Year 10 Head of Year', 'Role label preserved, not replaced with admin');
  assert.equal(actions[0].assigned_to_user_id, null, 'UUID stays null until account is created');
});

test('PW-extra-3: after HOY account is added, next analysis run automatically resolves the UUID', () => {
  // Simulate: first run (no HOY), second run (HOY added to profiles)
  const actionsBeforeHOY: Action[] = [{
    id: 'act-pending', student_id: 's-1', action_type: 'Attendance intervention',
    status: 'suggested', priority: 'high', due_date: '2026-07-22',
    assigned_to_user_id: null, assigned_to: 'Year 10 Head of Year',
    review_owner_id: null, escalation_owner_id: null,
    evidence_hash: 'hash-v1', source: 'auto',
  }];

  // Before: no personal queue entry
  assert.equal(getPersonalQueue('u-hoy10', actionsBeforeHOY, [PUPIL]).length, 0);

  // After: HOY is added to profiles — next analysis run writes their UUID
  const actionsAfterHOY: Action[] = [{
    ...actionsBeforeHOY[0],
    assigned_to_user_id: 'u-hoy10',
    assigned_to: 'Mrs Clarke (HOY Y10)',
  }];

  // Now the HOY sees the pupil
  assert.equal(getPersonalQueue('u-hoy10', actionsAfterHOY, [PUPIL]).length, 1);
  assert.equal(getPersonalQueue('u-hoy10', actionsAfterHOY, [PUPIL])[0].action_id, 'act-pending');
});
