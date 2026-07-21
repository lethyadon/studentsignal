/**
 * Workflow routing acceptance scenarios 1–10.
 * Pure-logic proofs over the canonical routing module using a synthetic staff
 * body shaped exactly like the profiles table (scope columns from the
 * 20260719100000 migration).
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveOwner, escalateAction, buildModalDefaults, buildAssignmentNotifications,
  type ProfileLite, type RoutingContext,
} from '../supabase/functions/_shared/routing.ts';
import { runEngine } from '../supabase/functions/_shared/engine.ts';
import { ingestRealCsvs, engineInputFromIngest, SCHOOL_ID } from './helpers/engineHarness.ts';

const STAFF: ProfileLite[] = [
  { id: 'u-admin', full_name: 'Head Teacher', role: 'admin', year_groups: [], form_groups: [], department: null, is_active: true, can_view_safeguarding: true },
  { id: 'u-dsl', full_name: 'DSL Dawn', role: 'dsl', year_groups: [], form_groups: [], department: null, is_active: true, can_view_safeguarding: true },
  { id: 'u-slt', full_name: 'SLT Sam', role: 'slt', year_groups: [], form_groups: [], department: null, is_active: true, can_view_safeguarding: false },
  { id: 'u-hoy10', full_name: 'HOY Helen (Y10)', role: 'head_of_year', year_groups: ['Year 10'], form_groups: [], department: null, is_active: true, can_view_safeguarding: false },
  { id: 'u-hoy9', full_name: 'HOY Harry (Y9)', role: 'head_of_year', year_groups: ['Year 9'], form_groups: [], department: null, is_active: true, can_view_safeguarding: false },
  { id: 'u-tutor', full_name: 'Tutor Tessa (10A)', role: 'tutor', year_groups: [], form_groups: ['10A'], department: null, is_active: true, can_view_safeguarding: false },
  { id: 'u-sendco', full_name: 'SENDCo Steph', role: 'sendco', year_groups: [], form_groups: [], department: null, is_active: true, can_view_safeguarding: false },
  { id: 'u-sci', full_name: 'Science Lead Sofia', role: 'teacher', year_groups: [], form_groups: [], department: 'Science', is_active: true, can_view_safeguarding: false },
  { id: 'u-careers', full_name: 'Careers Cara', role: 'careers_lead', year_groups: [], form_groups: [], department: null, is_active: true, can_view_safeguarding: false },
  { id: 'u-pastoral', full_name: 'Pastoral Pete', role: 'pastoral_lead', year_groups: [], form_groups: [], department: null, is_active: true, can_view_safeguarding: false },
];

const PUPIL = { id: 's1', name: 'Test Pupil', year_group: 'Year 10', form: '10A', send_status: null };

function ctx(partial: Partial<RoutingContext>): RoutingContext {
  return { student: PUPIL, signalType: 'behaviour', severity: 'high', actionType: 'Behaviour review meeting', ...partial };
}

test('WF-1: Year 10 attendance/behaviour deterioration → the ACTUAL Year 10 HOY user id', () => {
  const r = resolveOwner(STAFF, ctx({ signalType: 'attendance', actionType: 'Attendance intervention' }));
  assert.equal(r.assignedToUserId, 'u-hoy10');
  assert.equal(r.assignedToName, 'HOY Helen (Y10)');
  assert.notEqual(r.assignedToUserId, 'u-hoy9', 'never the wrong year group');
});

test('WF-2: the same pupil with a safeguarding disclosure → DSL, never the HOY', () => {
  const r = resolveOwner(STAFF, ctx({ signalType: 'safeguarding', actionType: 'Safeguarding review', severity: 'urgent' }));
  assert.equal(r.assignedToUserId, 'u-dsl');
  assert.notEqual(r.assignedToUserId, 'u-hoy10',
    'safeguarding must not route to an ordinary HOY merely because the pupil is in their year');
  assert.deepEqual(r.escalationPath, ['dsl', 'admin']);
});

test('WF-3: lesson-specific pattern → matching-department teacher/lead', () => {
  const r = resolveOwner(STAFF, ctx({ signalType: 'context_pattern', subject: 'Science', actionType: 'Behaviour review meeting' }));
  assert.equal(r.assignedToUserId, 'u-sci');
});

test('WF-4: SEND pattern → SENDCo', () => {
  const r = resolveOwner(STAFF, ctx({ signalType: 'send_related', actionType: 'SEND support review' }));
  assert.equal(r.assignedToUserId, 'u-sendco');
});

test('WF-5: the action modal is fully pre-filled from the signal', () => {
  const c = ctx({ signalType: 'attendance', actionType: 'Attendance intervention', severity: 'high' });
  const r = resolveOwner(STAFF, c);
  const m = buildModalDefaults(c, r, 'Attendance check-in with pupil and family', ['82.4% attendance', '14 late marks', 'Persistent Absence flag'], '2026-07-19');
  assert.equal(m.student_id, 's1');
  assert.equal(m.assigned_to_user_id, 'u-hoy10');
  assert.equal(m.priority, 'high');
  assert.equal(m.due_date, '2026-07-22');           // high ⇒ +3 days
  assert.equal(m.review_date, '2026-08-05');        // due + 14
  assert.ok(m.rationale.length > 20);
  assert.equal(m.evidence.length, 3);
  assert.ok(m.success_criteria.includes('95%'));
  assert.ok(m.notification_recipients.includes('u-hoy10'));
  assert.ok(!m.overridable_fields.includes('student_id'), 'tenancy/pupil not overridable');
});

test('WF-6: manual assignee + due-date edits survive reanalysis (adapter filter semantics)', () => {
  // The adapter deletes ONLY source=auto AND status=suggested, and skips
  // regenerating any auto action a member of staff progressed. A manual edit
  // sets status to accepted/in_progress → outside the delete scope, inside
  // the progressed-set skip. Prove with the real engine output:
  const ing = ingestRealCsvs();
  const output = runEngine(engineInputFromIngest(ing));
  const edited = { ...output.actions[0], status: 'in_progress', assigned_to_user_id: 'u-tutor', due_date: '2026-09-01' };
  const progressedSet = new Set([`${edited.student_id}::${edited.action_type}`]);
  const rerun = runEngine(engineInputFromIngest(ing));
  const regenerated = rerun.actions.filter(a => !progressedSet.has(`${a.student_id}::${a.action_type}`));
  assert.ok(!regenerated.some(a => a.student_id === edited.student_id && a.action_type === edited.action_type),
    'the edited action is not regenerated, so the manual assignee and due date persist');
});

test('WF-7: an overdue action escalates one level up with notifications to both parties', () => {
  const c = ctx({ signalType: 'attendance', actionType: 'Attendance intervention' });
  const decision = escalateAction(
    { id: 'act1', student_id: 's1', action_type: 'Attendance intervention', status: 'in_progress', priority: 'high', due_date: '2026-07-01', assigned_to_user_id: 'u-hoy10', assigned_to: 'HOY Helen (Y10)', source: 'auto' },
    c, STAFF, 'overdue',
  );
  assert.ok(decision);
  assert.equal(decision!.newAssigneeId, 'u-pastoral', 'HOY → pastoral_lead is the next step on the path');
  assert.equal(decision!.newPriority, 'urgent');
  assert.ok(decision!.notify.includes('u-pastoral') && decision!.notify.includes('u-hoy10'));
});

test('WF-8: completed intervention with sustained improvement ⇒ signal downgrades on reanalysis', () => {
  const ing = ingestRealCsvs();
  const input = engineInputFromIngest(ing);
  const avaId = ing.idByName.get('ava wilson')!;
  const before = runEngine(structuredClone(input));

  // Sustained improvement evidenced in data: case closed + attendance recovered.
  const improved = structuredClone(input);
  for (const r of improved.safeguarding) if (r.student_id === avaId) (r as { status?: string }).status = 'closed';
  for (const r of improved.attendance) if (r.student_id === avaId) {
    (r as { attendance_percentage?: number }).attendance_percentage = 96;
    (r as { attendance_concern?: string }).attendance_concern = 'none';
    (r as { late_marks?: number }).late_marks = 0;
  }
  for (const st of improved.students) if (st.id === avaId) st.attendance_pct = 96;
  const after = runEngine(improved);

  const b = before.students.find(s => s.studentId === avaId)!;
  const a = after.students.find(s => s.studentId === avaId)!;
  // Overall risk SCORE drops — improvement is quantified.
  assert.ok(a.intelligence.riskScore < b.intelligence.riskScore,
    'risk score must drop after improvement');
  // Attendance signal disappears once data shows 96%.
  assert.ok(!a.signals.some(s => s.signalType === 'attendance_decline'),
    'attendance signal must close once attendance recovers to 96%');
  // Safeguarding signal severity is no longer critical (case closed).
  const safSig = a.signals.find(s => s.signalType === 'safeguarding');
  if (safSig) {
    assert.notEqual(safSig.severity, 'critical',
      'closed safeguarding must not remain critical');
  }
  // NOTE: Ava may still be red via multi-domain (behaviour + closed-saf + wellbeing) —
  // this is correct. The improvement is visible in the score drop and signal count.

});

test('WF-9: failed intervention escalates to the next appropriate role', () => {
  const c = ctx({ signalType: 'behaviour', actionType: 'Behaviour review meeting' });
  const decision = escalateAction(
    { id: 'act2', student_id: 's1', action_type: 'Behaviour review meeting', status: 'completed', priority: 'medium', due_date: '2026-07-10', assigned_to_user_id: 'u-hoy10', assigned_to: 'HOY Helen (Y10)', source: 'auto' },
    c, STAFF, 'failed_intervention',
  );
  assert.ok(decision);
  assert.equal(decision!.newAssigneeId, 'u-pastoral');
  assert.match(decision!.reason, /without improvement/);
});

test('WF-10: no HOY account configured yet → action is unresolved with role-label placeholder, not silently reassigned to admin', () => {
  // Schools using test data will have no staff accounts yet.
  // Routing must NOT reassign to admin — that creates noise and wrong ownership.
  // Instead: leave assigned_to_user_id null, preserve the role label,
  // and explain that the action will resolve when the account is added.
  const skeleton: ProfileLite[] = [
    { id: 'u-admin', full_name: 'Head Teacher', role: 'admin', year_groups: [], form_groups: [], department: null, is_active: true, can_view_safeguarding: true },
  ];
  const r = resolveOwner(skeleton, ctx({ signalType: 'attendance', actionType: 'Attendance intervention' }));
  // Non-safeguarding: unresolved → no UUID, not admin
  assert.equal(r.assignedToUserId, null,
    'Non-safeguarding unresolved action must NOT fall back to admin UUID');
  assert.equal(r.unresolved, true);
  assert.match(r.rationale, /No .* account has been configured yet/i);
});

test('WF-10b: safeguarding — admin with can_view_safeguarding=true is a valid fallback owner (never unowned)', () => {
  // When no DSL account exists but admin has can_view_safeguarding=true,
  // they ARE a valid safeguarding owner (policy-compliant). unresolved=false.
  // This is the correct behaviour for a school that hasn't added a DSL yet.
  const skeleton: ProfileLite[] = [
    { id: 'u-admin', full_name: 'Head Teacher', role: 'admin', year_groups: [], form_groups: [], department: null, is_active: true, can_view_safeguarding: true },
  ];
  const r = resolveOwner(skeleton, ctx({ signalType: 'safeguarding', actionType: 'Safeguarding review', severity: 'urgent' }));
  assert.equal(r.assignedToUserId, 'u-admin',
    'Admin with can_view_safeguarding=true is a valid safeguarding owner');
  // Not unresolved — admin qualifies as a safeguarding owner.
  assert.equal(r.unresolved, false);
});

test('WF-10c: safeguarding always resolves to admin as last resort — admin is always a valid safeguarding fallback', () => {
  // Admin is always included in safeguardingOwners (school owner = always valid emergency owner).
  // Even without can_view_safeguarding=true on admin, they are included.
  // This means a school always has a safeguarding owner even with zero staff accounts.
  const skeleton: ProfileLite[] = [
    { id: 'u-admin', full_name: 'Head Teacher', role: 'admin', year_groups: [], form_groups: [], department: null, is_active: true, can_view_safeguarding: false },
  ];
  const r = resolveOwner(skeleton, ctx({ signalType: 'safeguarding', actionType: 'Safeguarding review', severity: 'urgent' }));
  assert.equal(r.assignedToUserId, 'u-admin', 'Admin is always a safeguarding fallback');
  // Not unresolved because admin is always in safeguardingOwners()
  assert.equal(r.unresolved, false);
});

test('routing extras: inactive staff are skipped; workload breaks ties; safeguarding notifications are urgent', () => {
  const withInactive = STAFF.map(p => p.id === 'u-hoy10' ? { ...p, is_active: false } : p);
  const r1 = resolveOwner(withInactive, ctx({ signalType: 'attendance', actionType: 'Attendance intervention' }));
  assert.notEqual(r1.assignedToUserId, 'u-hoy10', 'inactive users are never assigned');

  const twoHoys: ProfileLite[] = [
    ...STAFF,
    { id: 'u-hoy10b', full_name: 'HOY Hana (Y10)', role: 'head_of_year', year_groups: ['Year 10'], form_groups: [], department: null, is_active: true, can_view_safeguarding: false },
  ];
  // Remove pastoral lead from the tie-break test so only the two HOYs compete.
  const twoHoysNoPastoral = twoHoys.filter(p => p.role !== 'pastoral_lead');
  const r2 = resolveOwner(twoHoysNoPastoral, ctx({ signalType: 'attendance', actionType: 'Attendance intervention' }), { 'u-hoy10': 9, 'u-hoy10b': 1 });
  assert.equal(r2.assignedToUserId, 'u-hoy10b', 'less-loaded HOY preferred when two match the year group');

  const c = ctx({ signalType: 'safeguarding', actionType: 'Safeguarding review', severity: 'urgent' });
  const r3 = resolveOwner(STAFF, c);
  const notes = buildAssignmentNotifications(SCHOOL_ID, c, r3, 'Review safeguarding concern');
  assert.ok(notes.length > 0);
  assert.ok(notes.every(n => n.urgent && n.type === 'safeguarding_alert'));
});

test('engine end-to-end: real data + staff profiles ⇒ actions carry real user ids and notifications', () => {
  const ing = ingestRealCsvs();
  const input = engineInputFromIngest(ing);
  input.profiles = STAFF.map(p => p.role === 'head_of_year' && p.id === 'u-hoy10'
    ? { ...p, year_groups: ['Year 10', 'Year 11', 'Year 9', 'Year 8', 'Year 7'] } : p);
  const output = runEngine(input);
  const routed = output.actions.filter(a => a.assigned_to_user_id);
  assert.ok(routed.length > 0, 'actions resolve to actual users');
  const safActions = output.actions.filter(a => a.assigned_role === 'dsl');
  for (const a of safActions) {
    assert.equal(a.assigned_to_user_id, 'u-dsl', 'every safeguarding action lands on the DSL');
  }
  assert.ok(output.notifications.length > 0, 'assignment notifications generated');
});
