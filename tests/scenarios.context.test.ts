/**
 * Reward-pattern acceptance scenarios A–E.
 *
 * FIXTURES ARE SYNTHETIC AND LABELLED AS SUCH: the six real sample exports
 * cannot express multi-week reward timelines, so each scenario constructs the
 * structured records its specification requires. Nothing here is claimed
 * about the real pupils.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyseContext, classifyRewardPatterns, detectCohortRewardSpikes,
  computeStaffBaselines, detectContextConflicts,
} from '../supabase/functions/_shared/context.ts';
import type { InterventionRow } from '../supabase/functions/_shared/context.ts';
import type { BehaviourRow, StudentRow } from '../supabase/functions/_shared/engine.ts';

let seq = 0;
function beh(
  student_id: string, date: string, cls: 'positive' | 'negative',
  points: number, extra: Partial<BehaviourRow> = {},
): BehaviourRow {
  return {
    id: `syn-${++seq}`,
    student_id, date,
    incident_type: cls === 'positive' ? 'Achievement point' : 'Disruption',
    behaviour_points: cls === 'negative' ? points : 0,
    positive_points: cls === 'positive' ? points : 0,
    behaviour_class: cls,
    lesson_period: extra.lesson_period ?? 'P3',
    subject: extra.subject ?? 'Maths',
    staff_member: extra.staff_member ?? 'Mr Synthetic',
    comment: null, safeguarding_note: null,
    category: cls === 'positive' ? 'Achievement' : 'Behaviour',
    source_system: 'synthetic',
    ...extra,
  } as BehaviourRow;
}

function pupil(id: string, name: string, form = '10A', year = 'Year 10'): StudentRow {
  return { id, name, year_group: year, form, send_status: null, pupil_premium: false, attendance_pct: 94 };
}

// ─── Scenario A: genuine sustained improvement ───────────────────────────────

test('SCENARIO A (synthetic): rewards concentrated in second half + negatives in first half only ⇒ sustained_improvement', () => {
  // Non-burst path: positives must be ≥2× heavier in second half + negatives only in first half.
  // Span: Jan–Jun 2026 (6 months). Midpoint ~late March.
  const s = pupil('A', 'Synthetic Pupil A');
  const rows: BehaviourRow[] = [
    // First half: incidents, very few rewards
    beh('A', '2026-01-10', 'negative', 2),
    beh('A', '2026-01-24', 'negative', 2),
    beh('A', '2026-02-07', 'negative', 1),
    beh('A', '2026-02-14', 'positive', 1), // only 1 in first half
    // Second half: incidents stop; 4 rewards (≥ 2× the first-half count)
    beh('A', '2026-04-10', 'positive', 2),
    beh('A', '2026-04-24', 'positive', 1),
    beh('A', '2026-05-08', 'positive', 2),
    beh('A', '2026-05-22', 'positive', 1),
  ];
  const findings = classifyRewardPatterns([s], rows, [], []);
  assert.ok(findings.length >= 1, 'should produce at least one finding');
  // Should be sustained_improvement: no negatives in second half, positives doubled.
  const top = findings[0];
  assert.equal(top.classification, 'sustained_improvement');
  assert.equal(top.evidence.negativesAfterBurst, 0);
});

// ─── Scenario B: burst after incidents, relapse after ────────────────────────

test('SCENARIO B (synthetic): reward burst after incidents, deterioration after ⇒ reward_burst_short_term', () => {
  const s = pupil('B', 'Synthetic Pupil B');
  const rows: BehaviourRow[] = [
    // Repeated incidents
    beh('B', '2026-03-02', 'negative', 2), beh('B', '2026-03-05', 'negative', 2),
    beh('B', '2026-03-09', 'negative', 3),
    // Sharp burst of green points immediately after
    beh('B', '2026-03-12', 'positive', 2), beh('B', '2026-03-14', 'positive', 2),
    beh('B', '2026-03-17', 'positive', 1), beh('B', '2026-03-20', 'positive', 2),
    // Rewards stop; behaviour worsens again
    beh('B', '2026-04-06', 'negative', 2), beh('B', '2026-04-09', 'negative', 3),
  ];
  const findings = classifyRewardPatterns([s], rows, [], []);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.classification, 'reward_burst_short_term');
  assert.ok(f.evidence.negativesBeforeBurst >= 2);
  assert.ok(f.evidence.negativesAfterBurst >= 2);
  assert.match(f.narrative, /sustained improvement or only short-term compliance/,
    'cautious mandated language, never an accusation');
  assert.doesNotMatch(f.narrative, /briber|dishonest|misconduct/i);
});

// ─── Scenario C: teacher outlier explained by whole-class intervention ───────

test('SCENARIO C (synthetic): high staff reward rate explained by recorded whole-class intervention', () => {
  // 6 pupils in 10A; Mr Campaign rewards 5 of them heavily inside 21 days of a
  // recorded intervention; two comparison teachers have normal rates.
  const students = ['C1','C2','C3','C4','C5','C6'].map((id, i) => pupil(id, `Synthetic ${id}`, '10A'));
  const rows: BehaviourRow[] = [];
  // Comparison staff baseline (3 rewards each, spread out)
  for (const [staff, ids] of [['Ms Baseline1', ['C1','C2','C3']], ['Ms Baseline2', ['C4','C5','C6']]] as const) {
    ids.forEach((id, i) => rows.push(
      beh(id, `2026-0${3 + i}-10`, 'positive', 1, { staff_member: staff }),
    ));
  }
  // Outlier staff: 9 rewards to 5 same-form pupils within the intervention window
  const ivStart = '2026-05-04';
  const days = ['04','05','06','08','11','12','14','18','20'];
  const ids =   ['C1','C2','C3','C4','C5','C1','C2','C3','C4'];
  days.forEach((d, i) => rows.push(
    beh(ids[i], `2026-05-${d}`, 'positive', 1, { staff_member: 'Mr Campaign' }),
  ));
  const interventions: InterventionRow[] = [{
    student_id: 'C1', action_type: 'Whole-class reset programme', status: 'in_progress',
    source: 'manual', created_at: ivStart, review_date: null,
  }];
  const baselines = computeStaffBaselines(rows, students, interventions);
  const campaign = baselines.find(b => b.staffMember === 'Mr Campaign')!;
  assert.equal(campaign.outlier, 'high', 'rate is a statistical outlier');
  assert.equal(campaign.explainedByIntervention, true, '…but explained by the recorded intervention');
  assert.match(campaign.narrative!, /planned rather than anomalous/);
  const baseline1 = baselines.find(b => b.staffMember === 'Ms Baseline1')!;
  assert.equal(baseline1.outlier, null);
});

// ─── Scenario D: sanctions + rewards in ONE lesson, normal elsewhere ─────────

test('SCENARIO D (synthetic): repeated sanctions AND frequent rewards in one lesson only ⇒ context conflict', () => {
  const s = pupil('D', 'Synthetic Pupil D');
  const rows: BehaviourRow[] = [
    // Science: 4 sanctions + 4 rewards
    beh('D', '2026-03-03', 'negative', 2, { subject: 'Science' }),
    beh('D', '2026-03-10', 'negative', 1, { subject: 'Science' }),
    beh('D', '2026-03-17', 'negative', 2, { subject: 'Science' }),
    beh('D', '2026-03-24', 'negative', 1, { subject: 'Science' }),
    beh('D', '2026-03-05', 'positive', 1, { subject: 'Science' }),
    beh('D', '2026-03-12', 'positive', 2, { subject: 'Science' }),
    beh('D', '2026-03-19', 'positive', 1, { subject: 'Science' }),
    beh('D', '2026-03-26', 'positive', 1, { subject: 'Science' }),
    // Elsewhere: one solitary incident + normal life
    beh('D', '2026-03-06', 'negative', 1, { subject: 'English' }),
    beh('D', '2026-03-13', 'positive', 1, { subject: 'History' }),
  ];
  const findings = detectContextConflicts([s], rows);
  assert.equal(findings.length, 1);
  const f = findings[0];
  assert.equal(f.context, 'Science');
  assert.equal(f.sanctionsInContext, 4);
  assert.equal(f.rewardsInContext, 4);
  assert.equal(f.sanctionsElsewhere, 1);
  assert.match(f.narrative, /specific to that lesson context/);
});

// ─── Scenario E: cohort campaign must not read as individual recovery ────────

test('SCENARIO E (synthetic): school reward campaign detected; individuals classified as campaign context', () => {
  // 8 pupils; sparse baseline rewards over spring, then a 10-day campaign in
  // June rewarding 7 of 8 pupils.
  const students = Array.from({ length: 8 }, (_, i) => pupil(`E${i + 1}`, `Synthetic E${i + 1}`, i < 4 ? '9A' : '9B', 'Year 9'));
  const rows: BehaviourRow[] = [];
  // baseline: one reward each in March/April (8 events over ~8 weeks)
  students.forEach((s, i) => rows.push(
    beh(s.id, `2026-0${3 + (i % 2)}-1${i}`, 'positive', 1, { staff_member: 'Various' }),
  ));
  // campaign: 14 events across 7 pupils between 01–10 June
  const campaignDays = ['01','02','03','04','05','06','08','09','10','02','04','06','08','10'];
  campaignDays.forEach((d, i) => rows.push(
    beh(`E${(i % 7) + 1}`, `2026-06-${d}`, 'positive', 1, { staff_member: 'Various' }),
  ));
  // Pupil E1 also had incidents before the campaign.
  rows.push(beh('E1', '2026-05-20', 'negative', 2), beh('E1', '2026-05-26', 'negative', 2));
  // Give E1 three burst-window rewards during the campaign so the burst detector fires:
  rows.push(beh('E1', '2026-06-03', 'positive', 1));
  rows.push(beh('E1', '2026-06-06', 'positive', 1));

  const spikes = detectCohortRewardSpikes(students, rows);
  assert.ok(spikes.some(sp => sp.scope === 'school'), 'school-wide spike detected');
  const school = spikes.find(sp => sp.scope === 'school')!;
  assert.ok(school.studentsRewarded >= 7);
  assert.match(school.narrative, /read in that context rather than as personal recovery/);

  const findings = classifyRewardPatterns(students, rows, [], spikes);
  // E1 should have a burst (campaign overlaps their post-incident period).
  const e1 = findings.find(f => f.studentId === 'E1');
  assert.ok(e1, 'E1 receives a finding');
  assert.equal(e1!.classification, 'cohort_campaign_context',
    'E1 must NOT be classified as individual recovery or burst — the campaign explains it');
});

// ─── Reward-without-improvement + full analyseContext integration ────────────

test('rewards rising with no behaviour improvement ⇒ reward_without_improvement (cautious language)', () => {
  // Non-burst path requirement: posSecond >= 3, posSecond >= 2*posFirst, 
  // negSecondPts >= negFirstPts, neg.length > 0.
  // Use a 6-month span: 1 positive in Jan-Mar, 4 positives in Apr-Jun,
  // negatives present in BOTH halves (so negSecond >= negFirst).
  const s = pupil('F', 'Synthetic Pupil F');
  const rows: BehaviourRow[] = [
    // First half: 1 positive, 1 negative (points=2)
    beh('F', '2026-01-15', 'negative', 2),
    beh('F', '2026-02-10', 'positive', 1),
    // Second half: 4 positives (>=2x first half), negatives NOT reduced (2 pts again)
    beh('F', '2026-04-05', 'positive', 1),
    beh('F', '2026-04-19', 'positive', 1),
    beh('F', '2026-05-03', 'positive', 1),
    beh('F', '2026-05-17', 'positive', 1),
    beh('F', '2026-06-07', 'negative', 2), // behaviour not improved
  ];
  const ctx = analyseContext([s], rows, []);
  const f = ctx.rewardFindings.find(x => x.studentId === 'F');
  assert.ok(f, 'a finding should be produced for this pattern');
  assert.equal(f!.classification, 'reward_without_improvement');
  assert.doesNotMatch(f!.narrative, /briber|dishonest|misconduct/i);
});
