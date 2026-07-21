/**
 * Student Signal — Contextual & Reward-Pattern Intelligence (NEW, 19 Jul 2026)
 *
 * Environment-neutral (no React / Supabase / Deno). Imported by the canonical
 * engine. Implements ONLY the intelligence verified as missing in
 * CONTEXT_INTELLIGENCE_AUDIT.md — cohort/form/subject/staff/period/day
 * insights already exist in src/lib/schoolIntelligence.ts and are not
 * duplicated here.
 *
 * Covers:
 *  - per-pupil reward-pattern classification (sustained improvement vs
 *    post-incident reward burst vs reward-without-improvement vs planned
 *    intervention vs cohort campaign context vs normal encouragement);
 *  - staff reward baselines vs comparable staff (median-based, volume-aware),
 *    with whole-class-intervention explanation;
 *  - cohort/school reward-inflation (campaign) detection;
 *  - per-pupil single-context conflict (sanctions + unusually frequent
 *    rewards in one lesson, normal elsewhere);
 *  - pupil-vs-own-baseline behaviour trend;
 *  - per-context intervention effectiveness (worked in some lessons, not others).
 *
 * All narratives use deliberately cautious language: patterns are surfaced
 * for professional review, never labelled as misconduct.
 */

import type { BehaviourRow, StudentRow } from './engine.ts';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InterventionRow {
  student_id: string;
  action_type: string | null;
  status: string | null;
  source: string | null;
  created_at: string | null;   // ISO date or timestamp
  review_date?: string | null;
}

export type RewardClassification =
  | 'sustained_improvement'        // rewards rise, incidents fall and stay low
  | 'reward_burst_short_term'      // burst after incidents; deterioration resumes after burst
  | 'reward_without_improvement'   // rewards rise; behaviour/attendance do not improve
  | 'planned_intervention'         // burst overlaps a recorded intervention
  | 'cohort_campaign_context'      // burst coincides with a school/cohort-wide spike
  | 'normal_encouragement';        // nothing unusual

export interface RewardFinding {
  studentId: string;
  studentName: string;
  classification: RewardClassification;
  narrative: string;
  evidence: {
    baselinePositivesPerWeek: number;
    burstWindow: { start: string; end: string } | null;
    burstPositives: number;
    negativesBeforeBurst: number;
    negativesDuringBurst: number;
    negativesAfterBurst: number;
    positivesFirstHalf: number;
    positivesSecondHalf: number;
    negativesFirstHalf: number;
    negativesSecondHalf: number;
    overlappingIntervention: string | null;
    cohortCampaign: string | null;
  };
}

export interface StaffBaseline {
  staffMember: string;
  positiveEvents: number;
  positivePoints: number;
  negativeEvents: number;
  recordCount: number;
  medianStaffPositiveEvents: number;
  ratioToMedian: number | null;   // null when median is 0
  outlier: 'high' | 'low' | null;
  explainedByIntervention: boolean;
  narrative: string | null;
}

export interface CohortRewardSpike {
  scope: 'school' | 'form' | 'year_group';
  cohort: string;                 // 'school' | form name | year group
  window: { start: string; end: string };
  studentsRewarded: number;
  cohortSize: number;
  positivesInWindow: number;
  positivesBaseline: number;
  narrative: string;
}

export interface ContextConflictFinding {
  studentId: string;
  studentName: string;
  context: string;                // subject (or subject+period)
  sanctionsInContext: number;
  rewardsInContext: number;
  sanctionsElsewhere: number;
  narrative: string;
}

export interface BaselineTrendFinding {
  studentId: string;
  direction: 'improving' | 'deteriorating' | 'stable';
  firstHalfNegPoints: number;
  secondHalfNegPoints: number;
  firstHalfPosPoints: number;
  secondHalfPosPoints: number;
}

export interface InterventionContextEffect {
  studentId: string;
  interventionType: string;
  interventionDate: string;
  improvedContexts: string[];     // subjects where incident rate fell after
  unimprovedContexts: string[];   // subjects where it did not
  narrative: string | null;
}

export interface ContextIntelligence {
  rewardFindings: RewardFinding[];
  staffBaselines: StaffBaseline[];
  cohortRewardSpikes: CohortRewardSpike[];
  contextConflicts: ContextConflictFinding[];
  baselineTrends: BaselineTrendFinding[];
  interventionContextEffects: InterventionContextEffect[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function toTime(d: string): number {
  // Dates are canonical ISO by the time they reach the engine.
  return new Date(d + (d.length === 10 ? 'T00:00:00Z' : '')).getTime();
}

function isPositive(b: BehaviourRow): boolean {
  if (b.behaviour_class === 'positive') return true;
  if (b.behaviour_class === 'negative' || b.behaviour_class === 'neutral') return false;
  return (b.positive_points ?? 0) > 0 && (b.behaviour_points ?? 0) === 0;
}

function isNegative(b: BehaviourRow): boolean {
  if (b.behaviour_class === 'negative') return true;
  if (b.behaviour_class === 'positive' || b.behaviour_class === 'neutral') return false;
  return (b.behaviour_points ?? 0) > 0;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ─── Cohort / school reward-spike (campaign) detection ────────────────────────

/**
 * A reward "campaign" is a 14-day window in which an unusually broad share of
 * a cohort receives positives at an unusually high rate vs the rest of the
 * observed period. Detected at school, form and year-group level. Individual
 * reward classifications occurring inside a campaign window are attributed to
 * the campaign, not to individual recovery.
 */
export function detectCohortRewardSpikes(
  students: StudentRow[],
  behaviour: BehaviourRow[],
): CohortRewardSpike[] {
  const spikes: CohortRewardSpike[] = [];
  const positives = behaviour.filter(isPositive).filter(b => b.date);
  if (positives.length < 6) return spikes;

  const times = positives.map(b => toTime(b.date)).sort((a, b) => a - b);
  const spanDays = Math.max(1, Math.round((times[times.length - 1] - times[0]) / DAY_MS));

  const groups: Array<{ scope: CohortRewardSpike['scope']; cohort: string; ids: Set<string> }> = [
    { scope: 'school', cohort: 'school', ids: new Set(students.map(s => s.id)) },
  ];
  const byForm = new Map<string, Set<string>>();
  const byYear = new Map<string, Set<string>>();
  for (const s of students) {
    if (s.form) { if (!byForm.has(s.form)) byForm.set(s.form, new Set()); byForm.get(s.form)!.add(s.id); }
    if (s.year_group) { if (!byYear.has(s.year_group)) byYear.set(s.year_group, new Set()); byYear.get(s.year_group)!.add(s.id); }
  }
  byForm.forEach((ids, form) => { if (ids.size >= 4) groups.push({ scope: 'form', cohort: form, ids }); });
  byYear.forEach((ids, yg) => { if (ids.size >= 4) groups.push({ scope: 'year_group', cohort: yg, ids }); });

  for (const g of groups) {
    const cohortPos = positives.filter(b => g.ids.has(b.student_id));
    if (cohortPos.length < 6) continue;

    // Slide a 14-day window across the span; find the densest window.
    let best: { start: number; count: number; students: Set<string> } | null = null;
    const sorted = [...cohortPos].sort((a, b) => toTime(a.date) - toTime(b.date));
    for (let i = 0; i < sorted.length; i++) {
      const start = toTime(sorted[i].date);
      const inWin = sorted.filter(b => toTime(b.date) >= start && toTime(b.date) < start + 14 * DAY_MS);
      if (!best || inWin.length > best.count) {
        best = { start, count: inWin.length, students: new Set(inWin.map(b => b.student_id)) };
      }
    }
    if (!best) continue;

    const outside = cohortPos.length - best.count;
    const outsideDays = Math.max(1, spanDays - 14);
    const baselineRate = outside / outsideDays;          // positives/day outside window
    const windowRate = best.count / 14;
    const shareRewarded = best.students.size / g.ids.size;

    if (windowRate >= 3 * Math.max(baselineRate, 0.05) && shareRewarded >= 0.5 && best.count >= 6) {
      const startIso = new Date(best.start).toISOString().slice(0, 10);
      const endIso = new Date(best.start + 14 * DAY_MS).toISOString().slice(0, 10);
      spikes.push({
        scope: g.scope,
        cohort: g.cohort,
        window: { start: startIso, end: endIso },
        studentsRewarded: best.students.size,
        cohortSize: g.ids.size,
        positivesInWindow: best.count,
        positivesBaseline: Math.round(baselineRate * 14 * 10) / 10,
        narrative:
          `Positive-point activity across ${g.scope === 'school' ? 'the school' : `${g.cohort}`} rose sharply between ${startIso} and ${endIso}: ` +
          `${best.count} awards touching ${best.students.size} of ${g.ids.size} pupils, versus an expected ${Math.round(baselineRate * 14 * 10) / 10} over a comparable period. ` +
          `This is consistent with a reward campaign or whole-cohort initiative. Individual improvements inside this window should be read in that context rather than as personal recovery.`,
      });
    }
  }
  return spikes;
}

// ─── Staff reward baselines ───────────────────────────────────────────────────

export function computeStaffBaselines(
  behaviour: BehaviourRow[],
  students: StudentRow[],
  interventions: InterventionRow[],
): StaffBaseline[] {
  const byStaff = new Map<string, BehaviourRow[]>();
  for (const b of behaviour) {
    if (!b.staff_member) continue;
    if (!byStaff.has(b.staff_member)) byStaff.set(b.staff_member, []);
    byStaff.get(b.staff_member)!.push(b);
  }
  const perStaffPosEvents = [...byStaff.values()].map(rows => rows.filter(isPositive).length);
  const med = median(perStaffPosEvents.filter((_, i) => [...byStaff.values()][i].length >= 3));

  const formOf = new Map(students.map(s => [s.id, s.form]));

  return [...byStaff.entries()].map(([staffMember, rows]) => {
    const pos = rows.filter(isPositive);
    const neg = rows.filter(isNegative);
    const positivePoints = pos.reduce((t, b) => t + (b.positive_points ?? 0), 0);
    const ratio = med > 0 ? pos.length / med : null;

    let outlier: 'high' | 'low' | null = null;
    if (rows.length >= 3 && med > 0) {
      if (pos.length >= 2.5 * med && pos.length >= 6) outlier = 'high';
      else if (pos.length <= med / 2.5 && neg.length >= 2 * med) outlier = 'low';
    }

    // Whole-class-intervention explanation: a high outlier is "explained" when
    // the majority of their rewards land inside 21 days of a recorded
    // intervention AND touch >= 4 pupils sharing a form.
    let explainedByIntervention = false;
    if (outlier === 'high' && interventions.length > 0) {
      for (const iv of interventions) {
        if (!iv.created_at) continue;
        const ivStart = toTime(iv.created_at.slice(0, 10));
        const inWindow = pos.filter(b => {
          const t = toTime(b.date);
          return t >= ivStart && t <= ivStart + 21 * DAY_MS;
        });
        const formsTouched = new Map<string, number>();
        inWindow.forEach(b => {
          const f = formOf.get(b.student_id);
          if (f) formsTouched.set(f, (formsTouched.get(f) ?? 0) + 1);
        });
        const sameFormPupils = new Set(inWindow
          .filter(b => formOf.get(b.student_id) &&
            (formsTouched.get(formOf.get(b.student_id)!) ?? 0) >= 4)
          .map(b => b.student_id));
        if (inWindow.length >= pos.length * 0.6 && sameFormPupils.size >= 4) {
          explainedByIntervention = true;
          break;
        }
      }
    }

    let narrative: string | null = null;
    if (outlier === 'high') {
      narrative = explainedByIntervention
        ? `${staffMember}'s positive-point rate is well above comparable staff, and the timing aligns with a recorded whole-class intervention — the elevated rate appears planned rather than anomalous.`
        : `${staffMember}'s positive-point rate is substantially above comparable staff (${pos.length} awards vs a staff median of ${med}). This may reflect an effective recognition style, differing recording habits, or reward inflation — worth a supportive professional conversation, not a conclusion.`;
    } else if (outlier === 'low') {
      narrative = `${staffMember} records notably fewer positive points than comparable staff while logging frequent incidents. This may reflect class composition or recording habits; consider reviewing recognition practice.`;
    }

    return {
      staffMember,
      positiveEvents: pos.length,
      positivePoints,
      negativeEvents: neg.length,
      recordCount: rows.length,
      medianStaffPositiveEvents: med,
      ratioToMedian: ratio,
      outlier,
      explainedByIntervention,
      narrative,
    };
  });
}

// ─── Per-pupil reward-pattern classification ──────────────────────────────────

export function classifyRewardPatterns(
  students: StudentRow[],
  behaviour: BehaviourRow[],
  interventions: InterventionRow[],
  cohortSpikes: CohortRewardSpike[],
): RewardFinding[] {
  const findings: RewardFinding[] = [];
  const byStudent = new Map<string, BehaviourRow[]>();
  for (const b of behaviour) {
    if (!byStudent.has(b.student_id)) byStudent.set(b.student_id, []);
    byStudent.get(b.student_id)!.push(b);
  }

  for (const student of students) {
    const rows = (byStudent.get(student.id) ?? []).filter(b => b.date)
      .sort((a, b) => toTime(a.date) - toTime(b.date));
    const pos = rows.filter(isPositive);
    const neg = rows.filter(isNegative);
    if (pos.length === 0) continue;

    const t0 = toTime(rows[0].date);
    const t1 = toTime(rows[rows.length - 1].date);
    const spanDays = Math.max(1, (t1 - t0) / DAY_MS);
    const midpoint = t0 + (t1 - t0) / 2;

    const posFirst = pos.filter(b => toTime(b.date) <= midpoint).length;
    const posSecond = pos.length - posFirst;
    const negFirstPts = neg.filter(b => toTime(b.date) <= midpoint)
      .reduce((t, b) => t + Math.abs(b.behaviour_points || 0), 0);
    const negSecondPts = neg.filter(b => toTime(b.date) > midpoint)
      .reduce((t, b) => t + Math.abs(b.behaviour_points || 0), 0);

    // Densest 14-day positive window = candidate burst
    let burst: { start: number; events: BehaviourRow[] } | null = null;
    for (const p of pos) {
      const start = toTime(p.date);
      const events = pos.filter(b => toTime(b.date) >= start && toTime(b.date) < start + 14 * DAY_MS);
      if (!burst || events.length > burst.events.length) burst = { start, events };
    }
    const baselinePerWeek = (pos.length - (burst?.events.length ?? 0)) /
      Math.max(1, (spanDays - 14) / 7);

    let classification: RewardClassification = 'normal_encouragement';
    let negBefore = 0, negDuring = 0, negAfter = 0;
    let burstWindow: { start: string; end: string } | null = null;
    let overlappingIntervention: string | null = null;
    let cohortCampaign: string | null = null;

    const isBurst = !!burst && burst.events.length >= 3 &&
      (burst.events.length / 2) >= Math.max(baselinePerWeek, 0.25) * 2;

    if (isBurst && burst) {
      const bStart = burst.start;
      const bEnd = burst.start + 14 * DAY_MS;
      burstWindow = {
        start: new Date(bStart).toISOString().slice(0, 10),
        end: new Date(bEnd).toISOString().slice(0, 10),
      };
      negBefore = neg.filter(b => toTime(b.date) >= bStart - 14 * DAY_MS && toTime(b.date) < bStart).length;
      negDuring = neg.filter(b => toTime(b.date) >= bStart && toTime(b.date) < bEnd).length;
      negAfter  = neg.filter(b => toTime(b.date) >= bEnd && toTime(b.date) <= bEnd + 21 * DAY_MS).length;

      // Priority 1: a cohort-wide campaign explains individual spikes.
      const spike = cohortSpikes.find(sp => {
        const spStart = toTime(sp.window.start);
        const spEnd = toTime(sp.window.end);
        return bStart < spEnd && bEnd > spStart &&
          (sp.scope === 'school' || sp.cohort === student.form || sp.cohort === student.year_group);
      });
      if (spike) {
        cohortCampaign = `${spike.scope}:${spike.cohort}`;
        classification = 'cohort_campaign_context';
      } else {
        // Priority 2: recorded intervention for this pupil overlapping the burst.
        const iv = interventions.find(iv2 => iv2.student_id === student.id && iv2.created_at &&
          toTime(iv2.created_at.slice(0, 10)) >= bStart - 7 * DAY_MS &&
          toTime(iv2.created_at.slice(0, 10)) <= bEnd);
        if (iv) {
          overlappingIntervention = iv.action_type ?? 'intervention';
          classification = 'planned_intervention';
        } else if (negBefore >= 2 && negAfter >= 2) {
          classification = 'reward_burst_short_term';
        } else if (negBefore >= 2 && negAfter === 0 && negDuring <= 1 && negSecondPts < negFirstPts) {
          classification = 'sustained_improvement';
        }
      }
    }

    if (classification === 'normal_encouragement') {
      // Rewards rising without improvement: positives up materially, negatives not down.
      if (posSecond >= 2 * Math.max(posFirst, 1) && posSecond >= 3 && negSecondPts >= negFirstPts && neg.length > 0) {
        classification = 'reward_without_improvement';
      } else if (posSecond > posFirst && negSecondPts < negFirstPts * 0.5 && neg.length >= 2 && negAfter === 0) {
        classification = 'sustained_improvement';
      }
    }

    const narratives: Record<RewardClassification, string> = {
      sustained_improvement:
        `${student.name}'s positive points have risen while incidents have fallen and stayed low — consistent with genuine, sustained improvement. Recognition appears to be working.`,
      reward_burst_short_term:
        `Positive-point activity for ${student.name} is unusually concentrated around a period of behavioural difficulty, and incidents resumed after the burst ended. Review whether the incentive strategy is producing sustained improvement or only short-term compliance.`,
      reward_without_improvement:
        `Positive points for ${student.name} have increased without a corresponding improvement in behaviour records. This may reflect encouragement strategy, recording habits, or rewards used to secure immediate compliance — worth reviewing alongside attendance and pastoral indicators.`,
      planned_intervention:
        `${student.name}'s reward spike coincides with a recorded intervention (${overlappingIntervention ?? 'intervention'}). The elevated positive-point rate appears to be a planned incentive phase; judge it by outcomes after the intervention window.`,
      cohort_campaign_context:
        `${student.name}'s positive-point rise falls inside a wider reward spike (${cohortCampaign ?? 'cohort'}). It should be read as part of that campaign rather than as individual recovery.`,
      normal_encouragement: '',
    };

    if (classification !== 'normal_encouragement') {
      findings.push({
        studentId: student.id,
        studentName: student.name,
        classification,
        narrative: narratives[classification],
        evidence: {
          baselinePositivesPerWeek: Math.round(baselinePerWeek * 100) / 100,
          burstWindow,
          burstPositives: burst?.events.length ?? 0,
          negativesBeforeBurst: negBefore,
          negativesDuringBurst: negDuring,
          negativesAfterBurst: negAfter,
          positivesFirstHalf: posFirst,
          positivesSecondHalf: posSecond,
          negativesFirstHalf: negFirstPts,
          negativesSecondHalf: negSecondPts,
          overlappingIntervention,
          cohortCampaign,
        },
      });
    }
  }
  return findings;
}

// ─── Single-context conflict (scenario D) ─────────────────────────────────────

export function detectContextConflicts(
  students: StudentRow[],
  behaviour: BehaviourRow[],
): ContextConflictFinding[] {
  const findings: ContextConflictFinding[] = [];
  const byStudent = new Map<string, BehaviourRow[]>();
  for (const b of behaviour) {
    if (!byStudent.has(b.student_id)) byStudent.set(b.student_id, []);
    byStudent.get(b.student_id)!.push(b);
  }

  for (const student of students) {
    const rows = byStudent.get(student.id) ?? [];
    const bySubject = new Map<string, BehaviourRow[]>();
    rows.forEach(b => {
      if (!b.subject) return;
      if (!bySubject.has(b.subject)) bySubject.set(b.subject, []);
      bySubject.get(b.subject)!.push(b);
    });

    for (const [subject, subjRows] of bySubject) {
      const sanctions = subjRows.filter(isNegative).length;
      const rewards = subjRows.filter(isPositive).length;
      const sanctionsElsewhere = rows.filter(b => b.subject !== subject && isNegative(b)).length;
      if (sanctions >= 3 && rewards >= 3 && sanctionsElsewhere <= 1) {
        findings.push({
          studentId: student.id,
          studentName: student.name,
          context: subject,
          sanctionsInContext: sanctions,
          rewardsInContext: rewards,
          sanctionsElsewhere,
          narrative:
            `${student.name} receives both repeated sanctions (${sanctions}) and unusually frequent positive points (${rewards}) in ${subject}, while behaving typically elsewhere (${sanctionsElsewhere} incidents in other lessons). ` +
            `The difficulty appears specific to that lesson context — teacher relationship, peer mix, subject demand or timetabling — rather than a whole-pupil change. A lesson-level review is likely to be more effective than pupil-level sanctions.`,
        });
      }
    }
  }
  return findings;
}

// ─── Pupil-vs-own-baseline trend ──────────────────────────────────────────────

export function computeBaselineTrends(
  students: StudentRow[],
  behaviour: BehaviourRow[],
): BaselineTrendFinding[] {
  const out: BaselineTrendFinding[] = [];
  const byStudent = new Map<string, BehaviourRow[]>();
  for (const b of behaviour) {
    if (!b.date) continue;
    if (!byStudent.has(b.student_id)) byStudent.set(b.student_id, []);
    byStudent.get(b.student_id)!.push(b);
  }
  for (const student of students) {
    const rows = (byStudent.get(student.id) ?? []).sort((a, b) => toTime(a.date) - toTime(b.date));
    if (rows.length < 4) continue;
    const t0 = toTime(rows[0].date);
    const t1 = toTime(rows[rows.length - 1].date);
    const midpoint = t0 + (t1 - t0) / 2;
    const first = rows.filter(b => toTime(b.date) <= midpoint);
    const second = rows.filter(b => toTime(b.date) > midpoint);
    const f = {
      neg: first.filter(isNegative).reduce((t, b) => t + Math.abs(b.behaviour_points || 0), 0),
      pos: first.filter(isPositive).reduce((t, b) => t + (b.positive_points ?? 0), 0),
    };
    const s = {
      neg: second.filter(isNegative).reduce((t, b) => t + Math.abs(b.behaviour_points || 0), 0),
      pos: second.filter(isPositive).reduce((t, b) => t + (b.positive_points ?? 0), 0),
    };
    const direction: BaselineTrendFinding['direction'] =
      s.neg >= f.neg * 1.5 && s.neg - f.neg >= 2 ? 'deteriorating'
      : f.neg >= s.neg * 1.5 && f.neg - s.neg >= 2 ? 'improving'
      : 'stable';
    out.push({
      studentId: student.id,
      direction,
      firstHalfNegPoints: f.neg,
      secondHalfNegPoints: s.neg,
      firstHalfPosPoints: f.pos,
      secondHalfPosPoints: s.pos,
    });
  }
  return out;
}

// ─── Per-context intervention effectiveness (pattern 9) ───────────────────────

export function computeInterventionContextEffects(
  students: StudentRow[],
  behaviour: BehaviourRow[],
  interventions: InterventionRow[],
): InterventionContextEffect[] {
  const out: InterventionContextEffect[] = [];
  const byStudent = new Map<string, BehaviourRow[]>();
  for (const b of behaviour) {
    if (!b.date) continue;
    if (!byStudent.has(b.student_id)) byStudent.set(b.student_id, []);
    byStudent.get(b.student_id)!.push(b);
  }
  for (const iv of interventions) {
    if (!iv.created_at || !iv.student_id) continue;
    const rows = byStudent.get(iv.student_id) ?? [];
    const ivT = toTime(iv.created_at.slice(0, 10));
    const before = rows.filter(b => isNegative(b) && toTime(b.date) < ivT && toTime(b.date) >= ivT - 28 * DAY_MS);
    const after  = rows.filter(b => isNegative(b) && toTime(b.date) >= ivT && toTime(b.date) <= ivT + 28 * DAY_MS);
    if (before.length < 2) continue;

    const subjects = [...new Set([...before, ...after].map(b => b.subject).filter((x): x is string => !!x))];
    if (subjects.length < 2) continue;
    const improved: string[] = [];
    const unimproved: string[] = [];
    for (const subj of subjects) {
      const b4 = before.filter(b => b.subject === subj).length;
      const aft = after.filter(b => b.subject === subj).length;
      if (b4 >= 1 && aft < b4) improved.push(subj);
      else if (aft >= b4 && aft > 0) unimproved.push(subj);
    }
    if (improved.length > 0 && unimproved.length > 0) {
      const student = students.find(s => s.id === iv.student_id);
      out.push({
        studentId: iv.student_id,
        interventionType: iv.action_type ?? 'intervention',
        interventionDate: iv.created_at.slice(0, 10),
        improvedContexts: improved,
        unimprovedContexts: unimproved,
        narrative:
          `${student?.name ?? 'This student'}'s ${iv.action_type ?? 'intervention'} is associated with fewer incidents in ${improved.join(', ')} but not in ${unimproved.join(', ')}. ` +
          `The intervention appears context-dependent — review what differs in the lessons where it has not landed.`,
      });
    }
  }
  return out;
}

// ─── Entry point ──────────────────────────────────────────────────────────────

export function analyseContext(
  students: StudentRow[],
  behaviour: BehaviourRow[],
  interventions: InterventionRow[],
): ContextIntelligence {
  const cohortRewardSpikes = detectCohortRewardSpikes(students, behaviour);
  return {
    cohortRewardSpikes,
    rewardFindings: classifyRewardPatterns(students, behaviour, interventions, cohortRewardSpikes),
    staffBaselines: computeStaffBaselines(behaviour, students, interventions),
    contextConflicts: detectContextConflicts(students, behaviour),
    baselineTrends: computeBaselineTrends(students, behaviour),
    interventionContextEffects: computeInterventionContextEffects(students, behaviour, interventions),
  };
}
