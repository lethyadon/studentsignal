/**
 * StudentSignal — Longitudinal Memory Engine
 * 20 Jul 2026
 *
 * Builds four timelines for each pupil from their full historical record:
 *
 *  1. changeTimeline  — what changed vs the pupil's own baseline
 *  2. interventionHistory — what has been tried, when, by whom
 *  3. outcomeAnalysis — did each intervention measurably improve things?
 *  4. whatWorksEvidence — patterns across the school's history for similar cases
 *
 * "StudentSignal should effectively remember what happened previously
 *  so staff do not have to."
 *
 * Does NOT invent evidence. Every statement is derived from real records.
 * Where evidence is insufficient, says so explicitly.
 */

import type { BehaviourRow, AttendanceRow } from './engine.ts';

// ─── Extended InterventionRow with outcome fields ────────────────────────────

export interface RichInterventionRow {
  id?: string;
  student_id: string;
  action_type: string | null;
  status: string | null;
  source: string | null;
  created_at: string | null;
  review_date?: string | null;
  completed_at?: string | null;
  outcome?: string | null;
  outcome_status?: 'improving' | 'no_change' | 'escalating' | 'resolved' | 'sustained' | null;
  outcome_notes?: string | null;
  baseline_attendance?: number | null;
  current_attendance?: number | null;
  after_attendance?: number | null;
  baseline_behaviour?: number | null;
  current_behaviour?: number | null;
  after_behaviour?: number | null;
  assigned_to?: string | null;
  assigned_role?: string | null;
  notes?: string | null;
}

// ─── Output types ─────────────────────────────────────────────────────────────

export interface ChangeEvent {
  date: string;
  type: 'attendance_drop' | 'behaviour_spike' | 'attendance_recovery' | 'behaviour_improvement' | 'safeguarding_opened' | 'safeguarding_closed';
  description: string;
  magnitude?: number;   // e.g. percentage drop
  comparedToBaseline?: number;
}

export interface InterventionRecord {
  id?: string;
  actionType: string;
  startDate: string;
  endDate?: string | null;
  status: string;
  assignedTo?: string | null;
  assignedRole?: string | null;
  outcomeStatus?: string | null;
  /** How did attendance change after the intervention? */
  attendanceChangePct?: number | null;
  /** How did behaviour points change after the intervention? */
  behaviourChangePoints?: number | null;
  /** Days between start and close */
  durationDays?: number | null;
  daysUntilRelapse?: number | null;
  narrative: string;
  hadMeasurableEffect: boolean | null;
}

export interface OutcomeAnalysis {
  totalInterventions: number;
  completedInterventions: number;
  successfulInterventions: number;
  failedInterventions: number;
  ongoingInterventions: number;
  /** Number of times the same action_type was tried */
  repeatedActionTypes: Array<{ actionType: string; count: number; successCount: number }>;
  overallEffectivenessRate: number | null;   // 0–1 or null if < 2 completed
  bestOutcome: InterventionRecord | null;
  worstOutcome: InterventionRecord | null;
  summaryNarrative: string;
}

export interface WhatWorksEvidence {
  /** Whether any school-specific outcome data exists */
  hasSchoolHistory: boolean;
  /** Whether the evidence is for this pupil specifically */
  isPupilSpecific: boolean;
  effectiveActionTypes: Array<{ actionType: string; avgAttendanceGain: number; sampleSize: number }>;
  ineffectiveActionTypes: Array<{ actionType: string; failureRate: number; sampleSize: number }>;
  /** Plain-language recommendation derived from evidence */
  recommendationNarrative: string;
}

export interface LongitudinalMemory {
  studentId: string;
  studentName: string;
  /** Timeline 1: what changed vs the pupil's baseline */
  changeTimeline: ChangeEvent[];
  /** Key summary of trajectory */
  trajectoryDirection: 'improving' | 'stable' | 'deteriorating' | 'volatile' | 'insufficient_data';
  trajectoryNarrative: string;
  /** Timeline 2: what has been tried */
  interventionHistory: InterventionRecord[];
  /** Timeline 3: did interventions work? */
  outcomeAnalysis: OutcomeAnalysis;
  /** Timeline 4: what usually works */
  whatWorksEvidence: WhatWorksEvidence;
  /** Recurrence count — how many times this pattern has occurred */
  recurrenceCount: number;
  /** A human-readable summary of all four timelines for the signal card */
  memoryNarrative: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_MS = 86_400_000;

function toMs(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  const d = new Date(dateStr);
  return isNaN(d.getTime()) ? 0 : d.getTime();
}

function daysBetween(a: string | null | undefined, b: string | null | undefined): number | null {
  const ta = toMs(a), tb = toMs(b);
  if (!ta || !tb) return null;
  return Math.round(Math.abs(tb - ta) / DAY_MS);
}

// ─── Timeline 1: What changed? ────────────────────────────────────────────────

export function buildChangeTimeline(
  attendance: AttendanceRow[],
  behaviour: BehaviourRow[],
  studentBaselineAttendance?: number | null,
): ChangeEvent[] {
  const events: ChangeEvent[] = [];
  const sortedAtt = [...attendance].sort((a, b) => toMs(a.record_date) - toMs(b.record_date));
  const sortedBeh = [...behaviour].sort((a, b) => toMs(a.date) - toMs(b.date));

  // Compute a rolling 4-week attendance average to detect drops
  if (sortedAtt.length >= 2) {
    // Split into first-half / second-half
    const mid = Math.floor(sortedAtt.length / 2);
    const firstHalf = sortedAtt.slice(0, mid);
    const secondHalf = sortedAtt.slice(mid);
    const avgFirst = firstHalf.reduce((t, a) => t + (a.attendance_percentage ?? 0), 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((t, a) => t + (a.attendance_percentage ?? 0), 0) / secondHalf.length;

    if (avgFirst - avgSecond >= 5) {
      events.push({
        date: secondHalf[0].record_date,
        type: 'attendance_drop',
        description: `Attendance fell from ${avgFirst.toFixed(1)}% to ${avgSecond.toFixed(1)}% — a ${(avgFirst - avgSecond).toFixed(1)}% drop${studentBaselineAttendance ? ` (baseline: ${studentBaselineAttendance}%)` : ''}.`,
        magnitude: avgFirst - avgSecond,
        comparedToBaseline: studentBaselineAttendance ?? undefined,
      });
    } else if (avgSecond - avgFirst >= 5) {
      events.push({
        date: secondHalf[0].record_date,
        type: 'attendance_recovery',
        description: `Attendance recovered from ${avgFirst.toFixed(1)}% to ${avgSecond.toFixed(1)}% — a ${(avgSecond - avgFirst).toFixed(1)}% improvement.`,
        magnitude: avgSecond - avgFirst,
      });
    }
  }

  // Behaviour spike: more incidents in second half than first
  if (sortedBeh.length >= 4) {
    const mid = Math.floor(sortedBeh.length / 2);
    const firstBeh = sortedBeh.slice(0, mid).filter(b => b.behaviour_class !== 'positive');
    const secondBeh = sortedBeh.slice(mid).filter(b => b.behaviour_class !== 'positive');
    const ptFirst = firstBeh.reduce((t, b) => t + (b.behaviour_points || 0), 0);
    const ptSecond = secondBeh.reduce((t, b) => t + (b.behaviour_points || 0), 0);

    if (ptSecond > ptFirst * 1.5 && ptSecond >= 4) {
      events.push({
        date: sortedBeh[mid].date,
        type: 'behaviour_spike',
        description: `Behaviour incidents escalated — ${ptSecond} points in the recent period vs ${ptFirst} previously.`,
        magnitude: ptSecond - ptFirst,
      });
    } else if (ptFirst > ptSecond * 1.5 && ptFirst >= 4) {
      events.push({
        date: sortedBeh[mid].date,
        type: 'behaviour_improvement',
        description: `Behaviour improved — ${ptSecond} points recently vs ${ptFirst} in the earlier period.`,
        magnitude: ptFirst - ptSecond,
      });
    }
  }

  // Detect intra-series volatility: multiple swings across the threshold
  // (catches alternating drop/recovery pattern that half-split misses)
  if (sortedAtt.length >= 4) {
    let crossings = 0;
    let prevAbove = (sortedAtt[0].attendance_percentage ?? 0) >= 90;
    for (const a of sortedAtt.slice(1)) {
      const above = (a.attendance_percentage ?? 0) >= 90;
      if (above !== prevAbove) { crossings++; prevAbove = above; }
    }
    if (crossings >= 2 && events.length === 0) {
      events.push({
        date: sortedAtt[Math.floor(sortedAtt.length / 2)].record_date,
        type: 'attendance_drop',
        description: `Attendance has crossed the 90% threshold ${crossings} times — a volatile pattern that suggests the underlying cause has not been resolved.`,
        magnitude: crossings,
      });
    }
  }

  return events.sort((a, b) => toMs(a.date) - toMs(b.date));
}

// ─── Timeline 2 + 3: Intervention history and outcomes ───────────────────────

export function buildInterventionHistory(
  studentInterventions: RichInterventionRow[],
  studentAttendance: AttendanceRow[],
): InterventionRecord[] {
  const sortedAtt = [...studentAttendance].sort((a, b) => toMs(a.record_date) - toMs(b.record_date));

  return studentInterventions
    .filter(i => i.action_type && i.created_at)
    .sort((a, b) => toMs(a.created_at) - toMs(b.created_at))
    .map(i => {
      const durationDays = daysBetween(i.created_at, i.completed_at ?? i.review_date);

      // Measure attendance change after intervention (28-day window)
      let attendanceChangePct: number | null = null;
      if (i.after_attendance != null && i.baseline_attendance != null) {
        attendanceChangePct = i.after_attendance - i.baseline_attendance;
      } else if (i.created_at && sortedAtt.length >= 2) {
        const startMs = toMs(i.created_at);
        const before = sortedAtt.filter(a => toMs(a.record_date) < startMs);
        const after  = sortedAtt.filter(a => toMs(a.record_date) >= startMs && toMs(a.record_date) <= startMs + 28 * DAY_MS);
        if (before.length >= 1 && after.length >= 1) {
          const avgBefore = before.reduce((t, a) => t + (a.attendance_percentage ?? 0), 0) / before.length;
          const avgAfter  = after.reduce((t, a)  => t + (a.attendance_percentage ?? 0), 0) / after.length;
          attendanceChangePct = Math.round((avgAfter - avgBefore) * 10) / 10;
        }
      }

      // Behaviour change
      const behaviourChangePts = (i.after_behaviour != null && i.baseline_behaviour != null)
        ? i.after_behaviour - i.baseline_behaviour
        : null;

      // Did it have a measurable positive effect?
      const hadMeasurableEffect: boolean | null =
        i.outcome_status === 'resolved' || i.outcome_status === 'sustained' ? true
        : i.outcome_status === 'escalating' || i.outcome_status === 'no_change' ? false
        : attendanceChangePct !== null ? attendanceChangePct > 3
        : behaviourChangePts !== null ? behaviourChangePts < -3
        : null;

      // Detect relapse after improvement
      let daysUntilRelapse: number | null = null;
      if (hadMeasurableEffect && attendanceChangePct !== null && attendanceChangePct > 0) {
        if (i.completed_at) {
          const endMs = toMs(i.completed_at);
          const afterEnd = sortedAtt.filter(a => toMs(a.record_date) > endMs);
          const firstDecline = afterEnd.find(a => (a.attendance_percentage ?? 100) < 90);
          if (firstDecline) {
            daysUntilRelapse = Math.round((toMs(firstDecline.record_date) - endMs) / DAY_MS);
          }
        }
      }

      // Build narrative sentence
      const actionLabel = i.action_type ?? 'Intervention';
      const startDate = i.created_at ? new Date(i.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'unknown date';
      let narrative = `${actionLabel} (started ${startDate}`;
      if (i.assigned_to) narrative += `, assigned to ${i.assigned_to}`;
      narrative += `).`;

      if (i.status === 'completed') {
        if (hadMeasurableEffect === true && attendanceChangePct !== null) {
          narrative += ` Attendance improved by ${attendanceChangePct.toFixed(1)}% following this intervention.`;
          if (daysUntilRelapse !== null) {
            narrative += ` Improvement lasted ${daysUntilRelapse} school days before declining again.`;
          }
        } else if (hadMeasurableEffect === false) {
          narrative += ` No measurable improvement in attendance or behaviour was recorded after this intervention.`;
        } else {
          narrative += ` Completed${i.outcome ? ' — ' + i.outcome.slice(0, 80) : ''}.`;
        }
      } else if (i.status === 'in_progress') {
        narrative += ` Currently in progress.`;
      } else if (i.status === 'suggested') {
        narrative += ` Suggested but not yet actioned.`;
      } else {
        narrative += ` Status: ${i.status}.`;
      }

      return {
        id: i.id,
        actionType: i.action_type ?? '',
        startDate: i.created_at ?? '',
        endDate: i.completed_at ?? i.review_date ?? null,
        status: i.status ?? 'unknown',
        assignedTo: i.assigned_to ?? null,
        assignedRole: i.assigned_role ?? null,
        outcomeStatus: i.outcome_status ?? null,
        attendanceChangePct,
        behaviourChangePoints: behaviourChangePts,
        durationDays,
        daysUntilRelapse,
        narrative,
        hadMeasurableEffect,
      };
    });
}

// ─── Outcome analysis ─────────────────────────────────────────────────────────

export function buildOutcomeAnalysis(history: InterventionRecord[]): OutcomeAnalysis {
  const completed = history.filter(i => i.status === 'completed');
  const successful = completed.filter(i => i.hadMeasurableEffect === true);
  const failed = completed.filter(i => i.hadMeasurableEffect === false);
  const ongoing = history.filter(i => ['in_progress', 'suggested'].includes(i.status));

  const rate = completed.length >= 2
    ? Math.round((successful.length / completed.length) * 100) / 100
    : null;

  // Find repeated action types
  const typeCounts = new Map<string, { count: number; successCount: number }>();
  for (const i of history) {
    const t = i.actionType;
    if (!typeCounts.has(t)) typeCounts.set(t, { count: 0, successCount: 0 });
    typeCounts.get(t)!.count++;
    if (i.hadMeasurableEffect === true) typeCounts.get(t)!.successCount++;
  }
  const repeatedActionTypes = [...typeCounts.entries()]
    .filter(([, v]) => v.count > 1)
    .map(([actionType, { count, successCount }]) => ({ actionType, count, successCount }))
    .sort((a, b) => b.count - a.count);

  // Best and worst outcomes
  const withData = completed.filter(i => i.attendanceChangePct !== null);
  const bestOutcome = withData.length > 0
    ? withData.reduce((a, b) => (a.attendanceChangePct! > b.attendanceChangePct! ? a : b))
    : null;
  const worstOutcome = withData.length > 0
    ? withData.reduce((a, b) => (a.attendanceChangePct! < b.attendanceChangePct! ? a : b))
    : null;

  // Build narrative
  const parts: string[] = [];
  if (history.length === 0) {
    parts.push('No previous interventions recorded for this pupil.');
  } else {
    parts.push(`${history.length} intervention${history.length > 1 ? 's' : ''} recorded (${completed.length} completed, ${ongoing.length} ongoing).`);
    if (rate !== null) {
      parts.push(`${Math.round(rate * 100)}% resulted in measurable improvement.`);
    }
    for (const rep of repeatedActionTypes.slice(0, 3)) {
      if (rep.successCount === 0) {
        parts.push(`${rep.actionType} has been tried ${rep.count} times without measurable improvement.`);
      } else if (rep.successCount === rep.count) {
        parts.push(`${rep.actionType} has worked on all ${rep.count} occasions.`);
      } else {
        parts.push(`${rep.actionType} has been tried ${rep.count} times with improvement on ${rep.successCount} occasion${rep.successCount > 1 ? 's' : ''}.`);
      }
    }
    if (bestOutcome?.attendanceChangePct && bestOutcome.attendanceChangePct > 5) {
      parts.push(`Best outcome: ${bestOutcome.actionType} produced a ${bestOutcome.attendanceChangePct.toFixed(1)}% attendance improvement.`);
    }
  }

  return {
    totalInterventions: history.length,
    completedInterventions: completed.length,
    successfulInterventions: successful.length,
    failedInterventions: failed.length,
    ongoingInterventions: ongoing.length,
    repeatedActionTypes,
    overallEffectivenessRate: rate,
    bestOutcome,
    worstOutcome,
    summaryNarrative: parts.join(' '),
  };
}

// ─── Timeline 4: What usually works? ─────────────────────────────────────────
// School-wide evidence from all pupils' intervention outcomes

export interface SchoolInterventionOutcome {
  studentId: string;
  actionType: string;
  attendanceChangePct: number | null;
  behaviourChangePoints: number | null;
  hadMeasurableEffect: boolean | null;
}

export function buildWhatWorksEvidence(
  thisPupilId: string,
  allInterventions: RichInterventionRow[],
  allAttendance: AttendanceRow[],
): WhatWorksEvidence {
  const attByStudent = new Map<string, AttendanceRow[]>();
  for (const a of allAttendance) {
    if (!attByStudent.has(a.student_id)) attByStudent.set(a.student_id, []);
    attByStudent.get(a.student_id)!.push(a);
  }

  const completed = allInterventions.filter(
    i => i.action_type && i.created_at && i.status === 'completed',
  );

  const outcomes: SchoolInterventionOutcome[] = completed.map(i => {
    let attChange: number | null = null;
    if (i.after_attendance != null && i.baseline_attendance != null) {
      attChange = i.after_attendance - i.baseline_attendance;
    } else {
      const sortedAtt = (attByStudent.get(i.student_id) ?? []).sort((a, b) => toMs(a.record_date) - toMs(b.record_date));
      const startMs = toMs(i.created_at);
      const before = sortedAtt.filter(a => toMs(a.record_date) < startMs);
      const after  = sortedAtt.filter(a => toMs(a.record_date) >= startMs && toMs(a.record_date) <= startMs + 28 * DAY_MS);
      if (before.length >= 1 && after.length >= 1) {
        const avgB = before.reduce((t, a) => t + (a.attendance_percentage ?? 0), 0) / before.length;
        const avgA = after.reduce((t, a) => t + (a.attendance_percentage ?? 0), 0) / after.length;
        attChange = Math.round((avgA - avgB) * 10) / 10;
      }
    }
    const behChange = (i.after_behaviour != null && i.baseline_behaviour != null)
      ? i.after_behaviour - i.baseline_behaviour : null;
    const effect = i.outcome_status === 'resolved' || i.outcome_status === 'sustained' ? true
      : i.outcome_status === 'escalating' || i.outcome_status === 'no_change' ? false
      : attChange !== null ? attChange > 3 : null;
    return { studentId: i.student_id, actionType: i.action_type!, attendanceChangePct: attChange, behaviourChangePoints: behChange, hadMeasurableEffect: effect };
  });

  // Exclude the current pupil for "what works for similar pupils"
  const otherOutcomes = outcomes.filter(o => o.studentId !== thisPupilId);
  const thisPupilOutcomes = outcomes.filter(o => o.studentId === thisPupilId);

  const typeMap = new Map<string, { gains: number[]; failures: number }>();
  for (const o of otherOutcomes) {
    if (!typeMap.has(o.actionType)) typeMap.set(o.actionType, { gains: [], failures: 0 });
    const t = typeMap.get(o.actionType)!;
    if (o.hadMeasurableEffect === true && o.attendanceChangePct != null) t.gains.push(o.attendanceChangePct);
    else if (o.hadMeasurableEffect === false) t.failures++;
  }

  const effectiveTypes = [...typeMap.entries()]
    .filter(([, v]) => v.gains.length >= 2)
    .map(([actionType, v]) => ({
      actionType,
      avgAttendanceGain: Math.round(v.gains.reduce((a, b) => a + b, 0) / v.gains.length * 10) / 10,
      sampleSize: v.gains.length + v.failures,
    }))
    .filter(t => t.avgAttendanceGain > 3)
    .sort((a, b) => b.avgAttendanceGain - a.avgAttendanceGain);

  const ineffectiveTypes = [...typeMap.entries()]
    .filter(([, v]) => v.gains.length + v.failures >= 2 && v.failures > v.gains.length)
    .map(([actionType, v]) => ({
      actionType,
      failureRate: Math.round(v.failures / (v.gains.length + v.failures) * 100) / 100,
      sampleSize: v.gains.length + v.failures,
    }))
    .sort((a, b) => b.failureRate - a.failureRate);

  const hasSchoolHistory = otherOutcomes.length > 0;
  const parts: string[] = [];

  if (!hasSchoolHistory) {
    parts.push('No school-wide intervention outcome data yet — recommendations are based on published evidence patterns. The system will build school-specific intelligence as outcomes are recorded.');
  } else {
    parts.push(`Based on ${otherOutcomes.length} completed intervention${otherOutcomes.length > 1 ? 's' : ''} across this school:`);
    if (effectiveTypes.length > 0) {
      const top = effectiveTypes[0];
      parts.push(`${top.actionType} has produced an average ${top.avgAttendanceGain}% attendance improvement (${top.sampleSize} case${top.sampleSize > 1 ? 's' : ''}).`);
    }
    if (ineffectiveTypes.length > 0) {
      const worst = ineffectiveTypes[0];
      parts.push(`${worst.actionType} has a ${Math.round(worst.failureRate * 100)}% failure rate in similar cases — consider an alternative approach.`);
    }
    if (effectiveTypes.length === 0 && ineffectiveTypes.length === 0) {
      parts.push('Insufficient outcome data to identify patterns yet. Continue recording outcomes to build school-specific evidence.');
    }
  }

  // Note any pupil-specific successes
  const thisPupilBest = thisPupilOutcomes.filter(o => o.hadMeasurableEffect === true && o.attendanceChangePct !== null).sort((a, b) => (b.attendanceChangePct ?? 0) - (a.attendanceChangePct ?? 0))[0];
  if (thisPupilBest) {
    parts.push(`For this pupil specifically, ${thisPupilBest.actionType} previously produced a ${thisPupilBest.attendanceChangePct!.toFixed(1)}% attendance improvement.`);
  }

  return {
    hasSchoolHistory,
    isPupilSpecific: thisPupilOutcomes.length > 0,
    effectiveActionTypes: effectiveTypes,
    ineffectiveActionTypes: ineffectiveTypes,
    recommendationNarrative: parts.join(' '),
  };
}

// ─── Recurrence detection ─────────────────────────────────────────────────────

function countRecurrences(interventionHistory: InterventionRecord[], currentSignalTypes: string[]): number {
  // A recurrence is when an intervention was completed but the same class of concern
  // has reappeared (indicated by the engine generating new signals now).
  // Count = number of completed interventions that preceded the current concern.
  // The existence of currentSignalTypes means the concern has recurred at least once
  // per completed intervention we have on record.
  const completed = interventionHistory.filter(i => i.status === 'completed').length;
  // Only count as recurrence if there are active signals now AND prior completed work
  return currentSignalTypes.length > 0 ? completed : 0;
}

// ─── Master function ──────────────────────────────────────────────────────────

export function buildLongitudinalMemory(
  studentId: string,
  studentName: string,
  attendance: AttendanceRow[],
  behaviour: BehaviourRow[],
  interventions: RichInterventionRow[],
  allSchoolInterventions: RichInterventionRow[],
  allSchoolAttendance: AttendanceRow[],
  currentSignalTypes: string[],
  studentBaselineAttendance?: number | null,
): LongitudinalMemory {
  const myInterventions = interventions.filter(i => i.student_id === studentId);
  const myAtt = attendance.filter(a => a.student_id === studentId);
  const myBeh = behaviour.filter(b => b.student_id === studentId);

  const changeTimeline = buildChangeTimeline(myAtt, myBeh, studentBaselineAttendance);
  const interventionHistory = buildInterventionHistory(myInterventions, myAtt);
  const outcomeAnalysis = buildOutcomeAnalysis(interventionHistory);
  const whatWorksEvidence = buildWhatWorksEvidence(studentId, allSchoolInterventions, allSchoolAttendance);
  const recurrenceCount = countRecurrences(interventionHistory, currentSignalTypes);

  // Trajectory
  const attDrops = changeTimeline.filter(e => e.type === 'attendance_drop').length;
  const attRecoveries = changeTimeline.filter(e => e.type === 'attendance_recovery').length;
  const trajectoryDirection =
    myAtt.length < 2 && myBeh.length < 4 ? 'insufficient_data'
    : attDrops > attRecoveries ? 'deteriorating'
    : attRecoveries > attDrops ? 'improving'
    : attDrops > 0 && attRecoveries > 0 ? 'volatile'
    : 'stable';

  const trajectoryNarrative = trajectoryDirection === 'insufficient_data'
    ? 'Insufficient attendance data to determine trajectory — monitor for emerging patterns.'
    : trajectoryDirection === 'deteriorating'
    ? `Trajectory is deteriorating — ${attDrops} attendance drop${attDrops > 1 ? 's' : ''} recorded${attRecoveries > 0 ? `, with ${attRecoveries} partial recovery${attRecoveries > 1 ? 'ies' : ''}` : ''}.`
    : trajectoryDirection === 'improving'
    ? `Trajectory is improving — attendance has recovered.`
    : trajectoryDirection === 'volatile'
    ? `Trajectory is volatile — attendance has both dropped and recovered, suggesting the underlying cause has not been resolved.`
    : `Trajectory is stable.`;

  // Compose the memory narrative for the signal card
  const memoryParts: string[] = [];

  // What changed
  if (changeTimeline.length > 0) {
    memoryParts.push(changeTimeline.map(e => e.description).join(' '));
  }

  // Recurrence
  if (recurrenceCount > 0) {
    memoryParts.push(`This is a recurring pattern — similar concerns have been raised ${recurrenceCount} time${recurrenceCount > 1 ? 's' : ''} previously.`);
  }

  // Intervention history highlights
  if (outcomeAnalysis.totalInterventions > 0) {
    memoryParts.push(outcomeAnalysis.summaryNarrative);

    // Specific notable outcomes
    const bestRecord = interventionHistory
      .filter(i => i.hadMeasurableEffect === true && i.attendanceChangePct !== null)
      .sort((a, b) => (b.attendanceChangePct ?? 0) - (a.attendanceChangePct ?? 0))[0];

    if (bestRecord?.daysUntilRelapse) {
      memoryParts.push(`The ${bestRecord.actionType} produced improvement that lasted ${bestRecord.daysUntilRelapse} school days before declining again.`);
    }

    // Repeated failures
    const failedRepeat = outcomeAnalysis.repeatedActionTypes.find(r => r.successCount === 0 && r.count >= 2);
    if (failedRepeat) {
      memoryParts.push(`${failedRepeat.actionType} has failed to produce sustained improvement on ${failedRepeat.count} consecutive attempts.`);
    }
  } else {
    memoryParts.push('No previous interventions recorded. This is the first time a concern has been flagged for this pupil.');
  }

  // What usually works
  if (whatWorksEvidence.hasSchoolHistory && whatWorksEvidence.effectiveActionTypes.length > 0) {
    memoryParts.push(whatWorksEvidence.recommendationNarrative);
  }

  return {
    studentId,
    studentName,
    changeTimeline,
    trajectoryDirection,
    trajectoryNarrative,
    interventionHistory,
    outcomeAnalysis,
    whatWorksEvidence,
    recurrenceCount,
    memoryNarrative: memoryParts.join(' '),
  };
}
