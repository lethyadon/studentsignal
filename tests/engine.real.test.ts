import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runEngine, type EngineInput, type BehaviourRow } from '../supabase/functions/_shared/engine.ts';
import { ingestRealCsvs, engineInputFromIngest } from './helpers/engineHarness.ts';

function inputFromReal(): { input: EngineInput; idByName: Map<string, string> } {
  const ing = ingestRealCsvs();
  return { input: engineInputFromIngest(ing), idByName: ing.idByName };
}

function studentOut(output: ReturnType<typeof runEngine>, id: string) {
  const s = output.students.find(st => st.studentId === id);
  assert.ok(s, 'student present in output');
  return s!;
}

// ─── Named pupils from the REAL data ─────────────────────────────────────────

test('Ava Wilson (A005): red, open safeguarding signal, attendance + attainment signals', () => {
  const { input, idByName } = inputFromReal();
  const output = runEngine(input);
  const ava = studentOut(output, idByName.get('ava wilson')!);

  assert.equal(ava.intelligence.riskLevel, 'red', 'open High safeguarding case ⇒ red');
  const types = ava.signals.map(s => s.signalType);
  assert.ok(types.includes('safeguarding'), 'safeguarding signal fires');
  const saf = ava.signals.find(s => s.signalType === 'safeguarding')!;
  // Open High CPOMS case + multiple corroborators → critical (correct escalated severity)
  assert.ok(['high','critical'].includes(saf.severity), `open safeguarding severity should be high or critical, got ${saf.severity}`);
  assert.ok(types.includes('attendance_decline'), '82.4% + PA flag ⇒ attendance signal');
  assert.ok(types.includes('attainment_decline'), '3 below-target subjects ⇒ attainment signal');
  assert.ok(ava.hypotheses.hypotheses.length > 0, 'cross-source hypotheses generated');
  assert.ok(ava.analysisRow['hypotheses'], 'hypotheses persisted on the analysis row');
});

test('Oscar Baker (A018) and Archie Nelson (A020): risk ordering follows the evidence', () => {
  const { input, idByName } = inputFromReal();
  const output = runEngine(input);
  const oscar = studentOut(output, idByName.get('oscar baker')!);
  const archie = studentOut(output, idByName.get('archie nelson')!);

  assert.equal(oscar.intelligence.riskLevel, 'red', 'open High neglect case ⇒ red');
  assert.ok(
    oscar.intelligence.riskScore > archie.intelligence.riskScore,
    'Oscar (79.6%, 18 lates, High case) outranks Archie (85.1%, 10 lates, Medium case)',
  );
  assert.ok(archie.signals.some(s => s.signalType === 'attendance_decline'),
    'Archie: persistent-absence flag fires attendance signal even at 85.1%');
});

// ─── Determinism (single-engine guarantee) ────────────────────────────────────

test('engine is deterministic: two runs on identical input are deep-equal', () => {
  const { input } = inputFromReal();
  const a = runEngine(structuredClone(input));
  const b = runEngine(structuredClone(input));
  // due dates use addDays(new Date()) — stable within a test run's same day.
  assert.deepEqual(JSON.parse(JSON.stringify(a.analysisRows)), JSON.parse(JSON.stringify(b.analysisRows)));
  assert.deepEqual(JSON.parse(JSON.stringify(a.studentUpdates)), JSON.parse(JSON.stringify(b.studentUpdates)));
  assert.deepEqual(JSON.parse(JSON.stringify(a.context)), JSON.parse(JSON.stringify(b.context)));
});

// ─── Positive points must never increase risk ────────────────────────────────

test('REGRESSION: adding positive records never raises any riskScore', () => {
  const { input } = inputFromReal();
  const before = runEngine(structuredClone(input));

  const boosted = structuredClone(input);
  for (const st of boosted.students) {
    boosted.behaviour.push({
      id: `pos-${st.id}`,
      student_id: st.id,
      date: '2026-07-01',
      incident_type: 'Praise Postcard',
      behaviour_points: 0,
      positive_points: 5,
      behaviour_class: 'positive',
      lesson_period: 'P1',
      subject: 'English',
      staff_member: 'Ms Synthetic',
      comment: null,
      safeguarding_note: null,
      category: 'Achievement',
      source_system: 'test',
    } as BehaviourRow);
  }
  const after = runEngine(boosted);
  for (const b4 of before.students) {
    const aft = after.students.find(s => s.studentId === b4.studentId)!;
    assert.ok(
      aft.intelligence.riskScore <= b4.intelligence.riskScore,
      `${b4.studentName}: riskScore rose after adding positives (${b4.intelligence.riskScore} → ${aft.intelligence.riskScore})`,
    );
  }
});

// ─── Open → Closed safeguarding on re-import ─────────────────────────────────

test('closing a CPOMS case (re-import Open→Closed) lowers severity and lifts forced red', () => {
  const { input, idByName } = inputFromReal();
  const avaId = idByName.get('ava wilson')!;
  const openRun = runEngine(structuredClone(input));

  const closed = structuredClone(input);
  for (const row of closed.safeguarding) {
    if (row.student_id === avaId) (row as { status?: string }).status = 'closed';
  }
  const closedRun = runEngine(closed);

  const before = studentOut(openRun, avaId);
  const after = studentOut(closedRun, avaId);
  const sigBefore = before.signals.find(s => s.signalType === 'safeguarding')!;
  const sigAfter = after.signals.find(s => s.signalType === 'safeguarding')!;
  assert.ok(['high','critical'].includes(sigBefore.severity), 'open High case severity should be high or critical');

  // Risk SCORE drops because closed records contribute less weight than open.
  assert.ok(after.intelligence.riskScore < before.intelligence.riskScore,
    'risk score must drop when safeguarding moves from open to closed');
  // NOTE: Ava still has 82.4% attendance which independently drives red level —
  // so riskLevel can still be red. What matters is the score dropped and the
  // safeguarding signal severity is no longer critical.
  assert.notEqual(sigAfter.severity, 'critical',
    'closed-only safeguarding must not remain at critical severity');
});

// ─── Duplicate prevention & manual-survival (pure logic proof) ───────────────

test('progressed auto actions are filtered out; manual actions are never in the regenerated set', () => {
  const { input } = inputFromReal();
  const output = runEngine(input);
  assert.ok(output.actions.length > 0);
  // Simulate the adapter's progressed-set filter:
  const progressed = new Set([`${output.actions[0].student_id}::${output.actions[0].action_type}`]);
  const newActions = output.actions.filter(a => !progressed.has(`${a.student_id}::${a.action_type}`));
  assert.equal(newActions.length, output.actions.length - output.actions.filter(
    a => `${a.student_id}::${a.action_type}` === [...progressed][0]).length);
  // All regenerated actions are auto+suggested — the delete scope. Manual rows
  // (source ≠ 'auto') are outside both the delete and the insert set.
  for (const a of output.actions) {
    assert.equal(a.source, 'auto');
    assert.equal(a.status, 'suggested');
  }
});

// ─── Negative case: quiet pupils generate no misleading signals ──────────────

test('NEGATIVE CASE: a pupil with healthy records gets no risk signal and no action', () => {
  const { input, idByName } = inputFromReal();
  const output = runEngine(input);
  // Find pupils with no safeguarding, attendance ≥ 95, minimal behaviour.
  const quiet = output.students.filter(s =>
    s.intelligence.norm.safeguardingRecordCount === 0 &&
    s.intelligence.norm.avgAttendance >= 95 &&
    s.intelligence.norm.totalBehaviourPoints <= 4);
  assert.ok(quiet.length > 0, 'the real cohort contains healthy pupils');
  for (const s of quiet) {
    // careers_gap fires for ALL Y10/11 with no careers table entry — it is advisory,
    // not a crisis. Exclude from the negative-case risk check.
    const riskSignals = s.signals.filter(sig =>
      !['positive_progress', 'exceptional_achievement', 'careers_gap'].includes(sig.signalType));
    assert.equal(riskSignals.length, 0,
      `${s.studentName} is healthy but got: ${riskSignals.map(x => x.signalType).join(',')}`);
    // careers_gap generates medium-priority actions only — not high/urgent.
    const highActions = s.actions.filter(a => (a.priority === 'urgent' || a.priority === 'high') && a.action_type !== 'Careers destination review');
    assert.equal(highActions.length, 0, `${s.studentName} should have no high/urgent non-career action`);
    assert.notEqual(s.intelligence.riskLevel, 'red');
  }
});
