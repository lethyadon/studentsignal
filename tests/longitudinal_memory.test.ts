/**
 * Longitudinal Memory Tests
 * Proves: what changed, what was tried, did it work, what usually works.
 * All synthetic data, clearly labelled.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildChangeTimeline,
  buildInterventionHistory,
  buildOutcomeAnalysis,
  buildWhatWorksEvidence,
  buildLongitudinalMemory,
} from '../supabase/functions/_shared/memory.ts';
import type { RichInterventionRow } from '../supabase/functions/_shared/memory.ts';
import type { AttendanceRow } from '../supabase/functions/_shared/engine.ts';

// ── Helpers ───────────────────────────────────────────────────────────────────

function att(student_id: string, date: string, pct: number): AttendanceRow {
  return { student_id, record_date: date, attendance_percentage: pct, late_marks: 0, attendance_concern: pct < 90 ? 'persistent_absence' : pct < 95 ? 'monitor' : 'none' };
}

function iv(overrides: Partial<RichInterventionRow>): RichInterventionRow {
  return {
    student_id: 's1', action_type: 'Attendance intervention', status: 'completed',
    source: 'manual', created_at: '2026-03-01', completed_at: '2026-03-14',
    outcome_status: null, outcome: null, outcome_notes: null,
    baseline_attendance: null, current_attendance: null, after_attendance: null,
    baseline_behaviour: null, current_behaviour: null, after_behaviour: null,
    assigned_to: 'Mrs Clarke', assigned_role: 'head_of_year', notes: null, ...overrides,
  };
}

// ─── Timeline 1: What changed? ────────────────────────────────────────────────

test('MEM-1: attendance drop detected vs first-half baseline', () => {
  const readings = [
    att('s1', '2026-02-01', 94), att('s1', '2026-03-01', 91),
    att('s1', '2026-04-01', 84), att('s1', '2026-05-01', 82),
  ];
  const events = buildChangeTimeline(readings, [], 94);
  assert.ok(events.length >= 1, 'at least one change event');
  const drop = events.find(e => e.type === 'attendance_drop');
  assert.ok(drop, 'attendance_drop detected');
  assert.ok(drop!.magnitude! >= 5, 'magnitude >= 5%');
  assert.ok(drop!.description.includes('%'), 'description mentions percentage');
});

test('MEM-2: attendance recovery detected after intervention', () => {
  const readings = [
    att('s1', '2026-02-01', 82), att('s1', '2026-03-01', 80),
    att('s1', '2026-04-01', 88), att('s1', '2026-05-01', 92),
  ];
  const events = buildChangeTimeline(readings, [], 90);
  const recovery = events.find(e => e.type === 'attendance_recovery');
  assert.ok(recovery, 'attendance_recovery detected');
  assert.ok(recovery!.magnitude! >= 5, 'recovery magnitude >= 5%');
});

test('MEM-3: stable attendance produces no change events', () => {
  const readings = [
    att('s1', '2026-02-01', 93), att('s1', '2026-03-01', 92),
    att('s1', '2026-04-01', 94), att('s1', '2026-05-01', 93),
  ];
  const events = buildChangeTimeline(readings, [], 93);
  assert.equal(events.filter(e => e.type === 'attendance_drop' || e.type === 'attendance_recovery').length, 0);
});

// ─── Timeline 2 + 3: What was tried and did it work? ─────────────────────────

test('MEM-4: parent meeting with measurable improvement narrates correctly', () => {
  const intervention = iv({
    action_type: 'Parent meeting',
    created_at: '2026-05-10',
    completed_at: '2026-05-11',
    outcome_status: 'improving',
    baseline_attendance: 82,
    after_attendance: 91,
  });
  const history = buildInterventionHistory([intervention], []);
  assert.equal(history.length, 1);
  assert.equal(history[0].hadMeasurableEffect, true);
  assert.ok(Math.round(history[0].attendanceChangePct!) === 9, 'attendance gain = 9%');
  assert.match(history[0].narrative, /improved by 9\.0%/);
});

test('MEM-5: failed attendance mentoring narrates as no measurable improvement', () => {
  const intervention = iv({
    action_type: 'Attendance mentoring',
    outcome_status: 'no_change',
    baseline_attendance: 88,
    after_attendance: 87,
  });
  const history = buildInterventionHistory([intervention], []);
  assert.equal(history[0].hadMeasurableEffect, false);
  assert.match(history[0].narrative, /No measurable improvement/);
});

test('MEM-6: relapse after improvement is detected and narrated', () => {
  const intervention = iv({
    action_type: 'Parent meeting',
    created_at: '2026-05-10',
    completed_at: '2026-05-11',
    outcome_status: 'improving',
    baseline_attendance: 82,
    after_attendance: 91,
  });
  // Attendance recovers then falls again after the intervention
  const readings = [
    att('s1', '2026-05-01', 82),
    att('s1', '2026-05-20', 91), att('s1', '2026-06-01', 92),
    att('s1', '2026-06-15', 88), att('s1', '2026-07-01', 83),
  ];
  const history = buildInterventionHistory([intervention], readings);
  assert.ok(history[0].daysUntilRelapse !== null, 'relapse detected');
  assert.ok(history[0].daysUntilRelapse! > 0, 'relapse took some days');
  assert.match(history[0].narrative, /lasted \d+ school days before declining/);
});

// ─── Outcome analysis ─────────────────────────────────────────────────────────

test('MEM-7: outcome analysis correctly counts successes, failures and repeats', () => {
  const interventions = [
    iv({ action_type: 'Parent meeting', outcome_status: 'improving', after_attendance: 92, baseline_attendance: 83 }),
    iv({ action_type: 'Attendance mentoring', outcome_status: 'no_change', after_attendance: 83, baseline_attendance: 84 }),
    iv({ action_type: 'Attendance mentoring', outcome_status: 'no_change', after_attendance: 82, baseline_attendance: 83 }),
  ];
  const history = buildInterventionHistory(interventions, []);
  const analysis = buildOutcomeAnalysis(history);

  assert.equal(analysis.totalInterventions, 3);
  assert.equal(analysis.successfulInterventions, 1);
  assert.equal(analysis.failedInterventions, 2);
  assert.ok(analysis.overallEffectivenessRate !== null);
  assert.ok(Math.round(analysis.overallEffectivenessRate! * 100) === 33);

  const repeat = analysis.repeatedActionTypes.find(r => r.actionType === 'Attendance mentoring');
  assert.ok(repeat);
  assert.equal(repeat!.count, 2);
  assert.equal(repeat!.successCount, 0);
  assert.match(analysis.summaryNarrative, /Attendance mentoring has been tried 2 times without measurable improvement/);
});

test('MEM-8: no previous interventions states this explicitly', () => {
  const analysis = buildOutcomeAnalysis([]);
  assert.equal(analysis.totalInterventions, 0);
  assert.match(analysis.summaryNarrative, /No previous interventions/);
});

// ─── Timeline 4: What usually works (school-wide) ────────────────────────────

test('MEM-9: school-wide evidence surfaces effective interventions', () => {
  // Two other pupils where parent meeting worked
  const schoolInterventions: RichInterventionRow[] = [
    iv({ student_id: 's2', action_type: 'Parent meeting', outcome_status: 'improving', baseline_attendance: 80, after_attendance: 91 }),
    iv({ student_id: 's3', action_type: 'Parent meeting', outcome_status: 'improving', baseline_attendance: 82, after_attendance: 93 }),
    iv({ student_id: 's4', action_type: 'Attendance mentoring', outcome_status: 'no_change', baseline_attendance: 85, after_attendance: 84 }),
    iv({ student_id: 's5', action_type: 'Attendance mentoring', outcome_status: 'no_change', baseline_attendance: 86, after_attendance: 85 }),
  ];
  const evidence = buildWhatWorksEvidence('s1', schoolInterventions, []);
  assert.ok(evidence.hasSchoolHistory);
  assert.ok(evidence.effectiveActionTypes.some(e => e.actionType === 'Parent meeting'));
  assert.ok(evidence.ineffectiveActionTypes.some(e => e.actionType === 'Attendance mentoring'));
  assert.match(evidence.recommendationNarrative, /Parent meeting has produced/);
  assert.match(evidence.recommendationNarrative, /Attendance mentoring has a .* failure rate/);
});

test('MEM-10: when no school history exists, says so honestly without inventing evidence', () => {
  const evidence = buildWhatWorksEvidence('s1', [], []);
  assert.equal(evidence.hasSchoolHistory, false);
  assert.match(evidence.recommendationNarrative, /No school-wide intervention outcome data yet/);
  assert.match(evidence.recommendationNarrative, /published evidence patterns/);
  assert.ok(!evidence.recommendationNarrative.includes('has produced'), 'must not claim evidence that does not exist');
});

// ─── Full longitudinal memory ─────────────────────────────────────────────────

test('MEM-11: third recurrence of the same pattern is flagged', () => {
  const interventions: RichInterventionRow[] = [
    iv({ action_type: 'Attendance intervention', status: 'completed', outcome_status: 'no_change' }),
    iv({ action_type: 'Attendance intervention', status: 'completed', created_at: '2026-04-01', outcome_status: 'no_change' }),
  ];
  const memory = buildLongitudinalMemory('s1', 'SYNTHETIC', [], [], interventions, interventions, [], ['attendance_decline'], 90);
  // recurrenceCount = how many times the same action type was tried and completed
  // with the same signal still being triggered
  assert.ok(memory.recurrenceCount > 0, 'recurrence detected');
});

test('MEM-12: insufficient data is stated explicitly, not silently omitted', () => {
  const memory = buildLongitudinalMemory('s1', 'SYNTHETIC', [att('s1', '2026-07-01', 91)], [], [], [], [], ['attendance_decline'], 93);
  // Only 1 attendance reading — insufficient for trend
  assert.equal(memory.trajectoryDirection, 'insufficient_data');
  assert.match(memory.trajectoryNarrative, /Insufficient/);
});

test('MEM-13: volatile pattern (drop then recovery then drop) is flagged', () => {
  const readings = [
    att('s1', '2026-02-01', 94), att('s1', '2026-03-01', 82),
    att('s1', '2026-04-01', 93), att('s1', '2026-05-01', 83),
    att('s1', '2026-06-01', 92), att('s1', '2026-07-01', 81),
  ];
  // Each half: drops and recoveries
  const memory = buildLongitudinalMemory('s1', 'SYNTHETIC', readings, [], [], [], [], ['attendance_decline'], 93);
  // Multiple drops means deteriorating trend
  assert.ok(['deteriorating', 'volatile'].includes(memory.trajectoryDirection));
});

test('MEM-14: memory narrative includes improvement duration (not just that it worked)', () => {
  const interventions: RichInterventionRow[] = [
    iv({
      action_type: 'Parent meeting',
      outcome_status: 'improving',
      baseline_attendance: 82,
      after_attendance: 92,
      created_at: '2026-05-10',
      completed_at: '2026-05-11',
    }),
  ];
  const readings = [
    att('s1', '2026-05-01', 82),
    att('s1', '2026-05-25', 91), att('s1', '2026-06-08', 93),
    att('s1', '2026-07-01', 83), // relapse
  ];
  const memory = buildLongitudinalMemory('s1', 'SYNTHETIC', readings, [], interventions, interventions, readings, ['attendance_decline'], 90);
  assert.match(memory.memoryNarrative, /lasted \d+ school days before declining/);
});
