/**
 * Student Signal — Frontend analysis adapter (RE-AUTHORED 19 Jul 2026)
 *
 * This file contains NO scoring logic. All signal, hypothesis, risk and
 * action logic lives in the canonical shared engine
 * (supabase/functions/_shared/engine.ts), which is imported by both this
 * adapter and the run-analysis edge function. This adapter only:
 *   1. fetches the school's records (including the structured fields),
 *   2. calls runEngine(),
 *   3. persists the results,
 * mirroring the original runFullAnalysis persistence semantics exactly:
 * manual interventions are untouched; auto+suggested are regenerated;
 * auto actions that a member of staff has progressed are never duplicated.
 */

import { supabase } from './supabase';
import {
  runEngine,
  type EngineInput,
  type EngineOutput,
  type StudentRow,
  type BehaviourRow,
  type AttendanceRow,
  type SafeguardingRow,
  type PastoralRow,
  type CareerRow,
  type CommunicationRow,
  type AssessmentRow,
  type InterventionRow,
  type ProfileLite,
  type GeneratedAction,
  type LongitudinalMemory,
  type Signal,
} from '../../supabase/functions/_shared/engine.ts';

// Re-export shared types so existing imports of signalEngine keep working.
export type { Signal, GeneratedAction, EngineOutput };

export async function fetchEngineInput(schoolId: string): Promise<EngineInput | null> {
  const [
    { data: students },
    { data: bRecords },
    { data: aRecords },
    { data: safRecords },
    { data: pastRecords },
    { data: careerRecords },
    { data: commRecords },
    { data: assessRecords },
    { data: interventionRecords },
    { data: profileRows },
  ] = await Promise.all([
    supabase.from('students').select('id, name, year_group, form, send_status, pupil_premium, attendance_pct').eq('school_id', schoolId),
    supabase.from('behaviour_records').select('id, student_id, date, incident_type, behaviour_points, positive_points, lesson_period, subject, staff_member, comment, safeguarding_note, behaviour_class, category, source_system').eq('school_id', schoolId),
    supabase.from('attendance_records').select('student_id, record_date, attendance_percentage, late_marks, attendance_concern').eq('school_id', schoolId),
    supabase.from('safeguarding_records').select('student_id, incident_date, incident_type, summary, severity, category, subcategory, status, assigned_to').eq('school_id', schoolId),
    supabase.from('pastoral_notes').select('student_id, note_date, note, priority, status, entered_by').eq('school_id', schoolId),
    supabase.from('career_profiles').select('student_id, destination_risk, career_interests, barriers, strengths').eq('school_id', schoolId),
    supabase.from('communications').select('student_id, date, priority, summary, routing_status, suggested_assignee').eq('school_id', schoolId),
    supabase.from('assessment_records').select('student_id, assessment_date, assessment_cycle, subject, current_grade, target_grade, progress_gap, progress_status').eq('school_id', schoolId),
    supabase.from('interventions').select('student_id, action_type, status, source, created_at, review_date, completed_at, outcome, outcome_status, outcome_notes, baseline_attendance, current_attendance, after_attendance, baseline_behaviour, current_behaviour, after_behaviour, assigned_to, assigned_role, notes, id').eq('school_id', schoolId),
    supabase.from('profiles').select('id, full_name, role, year_groups, form_groups, department, is_active, can_view_safeguarding').eq('school_id', schoolId),
  ]);

  if (!students || students.length === 0) return null;

  return {
    schoolId,
    students: students as StudentRow[],
    behaviour: (bRecords ?? []) as BehaviourRow[],
    attendance: (aRecords ?? []) as AttendanceRow[],
    safeguarding: (safRecords ?? []) as SafeguardingRow[],
    pastoral: (pastRecords ?? []) as PastoralRow[],
    careers: (careerRecords ?? []) as CareerRow[],
    communications: (commRecords ?? []) as CommunicationRow[],
    assessments: (assessRecords ?? []) as AssessmentRow[],
    interventions: (interventionRecords ?? []) as InterventionRow[],
    richInterventions: (interventionRecords ?? []) as any[],
    profiles: (profileRows ?? []) as ProfileLite[],
  };
}

export async function persistEngineOutput(output: EngineOutput): Promise<{ actionsGenerated: number }> {
  const schoolId = output.schoolId;

  await supabase.from('analysis_results').delete().eq('school_id', schoolId);
  if (output.analysisRows.length > 0) {
    const { error } = await supabase.from('analysis_results').insert(output.analysisRows);
    if (error) throw error;
  }

  await Promise.all(output.studentUpdates.map(({ id, patch }) =>
    supabase.from('students').update(patch).eq('id', id)
  ));

  // Manual interventions are never touched here: the delete filter is
  // source='auto' AND status='suggested' only.
  await supabase.from('interventions').delete()
    .eq('school_id', schoolId).eq('source', 'auto').eq('status', 'suggested');

  // Duplicate prevention: an auto action a member of staff has progressed
  // (status ≠ suggested) blocks regeneration of the same action type for the
  // same student.
  const { data: existingProgressed } = await supabase
    .from('interventions')
    .select('student_id, action_type')
    .eq('school_id', schoolId)
    .eq('source', 'auto')
    .neq('status', 'suggested');
  const progressedSet = new Set(
    (existingProgressed ?? []).map((r: { student_id: string; action_type: string }) => `${r.student_id}::${r.action_type}`)
  );
  const newActions = output.actions.filter(
    (a: GeneratedAction) => !progressedSet.has(`${(a as unknown as { student_id: string }).student_id}::${(a as unknown as { action_type: string }).action_type}`)
  );

  if (newActions.length > 0) {
    const { error } = await supabase.from('interventions').insert(newActions);
    if (error) console.error('Failed to insert auto-generated actions:', error.message);
  }

  // ── Assignment notifications (19 Jul 2026) ─────────────────────────────────
  // Only for actions actually inserted this run, and never repeated while an
  // unread notification for the same recipient+student+title exists — so an
  // unchanged signal does not re-notify on every reanalysis.
  if (output.notifications.length > 0 && newActions.length > 0) {
    const insertedStudents = new Set(newActions.map(a => (a as unknown as { student_id: string }).student_id));
    const candidate = output.notifications.filter(n => insertedStudents.has(n.student_id));
    if (candidate.length > 0) {
      const { data: unread } = await supabase.from('notifications')
        .select('recipient_id, student_id, title')
        .eq('school_id', schoolId).eq('is_read', false);
      const seen = new Set((unread ?? []).map((n: { recipient_id: string; student_id: string; title: string }) => `${n.recipient_id}|${n.student_id}|${n.title}`));
      const fresh = candidate.filter(n => !seen.has(`${n.recipient_id}|${n.student_id}|${n.title}`));
      if (fresh.length > 0) {
        const { error } = await supabase.from('notifications').insert(fresh);
        if (error) console.error('Failed to insert notifications:', error.message);
      }
    }
  }

  // ── Context intelligence persistence ─────────────────────────────────────────
  // Persist rewardFindings and staffBaselines so they are queryable historically
  // rather than only existing at analysis runtime.
  if (output.context) {
    const today = new Date().toISOString().slice(0, 10);

    // Reward findings: upsert one row per student per day
    const rewardRows = output.context.rewardFindings.map(f => ({
      school_id:      schoolId,
      student_id:     f.studentId,
      analysis_date:  today,
      classification: f.classification,
      narrative:      f.narrative,
      evidence:       f.evidence,
    }));
    if (rewardRows.length > 0) {
      const { error } = await supabase.from('reward_findings').upsert(rewardRows, {
        onConflict: 'school_id,student_id,analysis_date',
        ignoreDuplicates: false,
      });
      if (error) console.error('reward_findings persist error:', error.message);
    }

    // Staff baselines: upsert one row per staff member per day
    const baselineRows = output.context.staffBaselines.map(b => ({
      school_id:                schoolId,
      staff_member:             b.staffMember,
      analysis_date:            today,
      positive_events:          b.positiveEvents,
      positive_points:          b.positivePoints,
      negative_events:          b.negativeEvents,
      record_count:             b.recordCount,
      median_staff_positive:    b.medianStaffPositiveEvents,
      ratio_to_median:          b.ratioToMedian,
      outlier:                  b.outlier,
      explained_by_intervention: b.explainedByIntervention,
      narrative:                b.narrative,
    }));
    if (baselineRows.length > 0) {
      const { error } = await supabase.from('staff_baselines').upsert(baselineRows, {
        onConflict: 'school_id,staff_member,analysis_date',
        ignoreDuplicates: false,
      });
      if (error) console.error('staff_baselines persist error:', error.message);
    }
  }

  return { actionsGenerated: newActions.length };
}

/** Public API — signature preserved for analysistrigger.ts. */
export async function runFullAnalysis(
  schoolId: string,
): Promise<{ attendanceConcerns: number; actionsGenerated: number }> {
  const input = await fetchEngineInput(schoolId);
  if (!input) return { attendanceConcerns: 0, actionsGenerated: 0 };

  const output = runEngine(input);
  const { actionsGenerated } = await persistEngineOutput(output);

  const attendanceConcerns = output.students
    .filter(s => s.intelligence.norm.avgAttendance < 90).length;

  return { attendanceConcerns, actionsGenerated };
}
