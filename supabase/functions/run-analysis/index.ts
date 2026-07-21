/**
 * Student Signal — run-analysis edge function (RE-AUTHORED 19 Jul 2026)
 *
 * This function contains NO scoring logic. It imports the SAME canonical
 * engine module as the frontend (../_shared/engine.ts) — the two execution
 * paths cannot diverge because there is one implementation. This file only:
 * authenticates, fetches the school's records (including structured fields),
 * calls runEngine(), and persists results with the same semantics as the
 * frontend adapter: manual interventions untouched, auto+suggested
 * regenerated, progressed auto actions never duplicated.
 */

import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  runEngine,
  type EngineInput,
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
} from '../_shared/engine.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { school_id } = await req.json();
    if (!school_id) {
      return new Response(JSON.stringify({ error: 'school_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

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
      supabase.from('students').select('id, name, year_group, form, send_status, pupil_premium, attendance_pct').eq('school_id', school_id),
      supabase.from('behaviour_records').select('id, student_id, date, incident_type, behaviour_points, positive_points, lesson_period, subject, staff_member, comment, safeguarding_note, behaviour_class, category, source_system').eq('school_id', school_id),
      supabase.from('attendance_records').select('student_id, record_date, attendance_percentage, late_marks, attendance_concern').eq('school_id', school_id),
      supabase.from('safeguarding_records').select('student_id, incident_date, incident_type, summary, severity, category, subcategory, status, assigned_to').eq('school_id', school_id),
      supabase.from('pastoral_notes').select('student_id, note_date, note, priority, status, entered_by').eq('school_id', school_id),
      supabase.from('career_profiles').select('student_id, destination_risk, career_interests, barriers, strengths').eq('school_id', school_id),
      supabase.from('communications').select('student_id, date, priority, summary, routing_status, suggested_assignee').eq('school_id', school_id),
      supabase.from('assessment_records').select('student_id, assessment_date, assessment_cycle, subject, current_grade, target_grade, progress_gap, progress_status').eq('school_id', school_id),
      supabase.from('interventions').select('student_id, action_type, status, source, created_at, review_date, completed_at, outcome, outcome_status, outcome_notes, baseline_attendance, current_attendance, after_attendance, baseline_behaviour, current_behaviour, after_behaviour, assigned_to, assigned_role, notes, id').eq('school_id', school_id),
      supabase.from('profiles').select('id, full_name, role, year_groups, form_groups, department, is_active, can_view_safeguarding').eq('school_id', school_id),
    ]);

    if (!students || students.length === 0) {
      return new Response(JSON.stringify({ attendanceConcerns: 0, actionsGenerated: 0, students: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const input: EngineInput = {
      schoolId: school_id,
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

    const output = runEngine(input);

    // ── Persist — identical semantics to the frontend adapter ────────────────
    await supabase.from('analysis_results').delete().eq('school_id', school_id);
    if (output.analysisRows.length > 0) {
      const { error } = await supabase.from('analysis_results').insert(output.analysisRows);
      if (error) throw error;
    }

    await Promise.all(output.studentUpdates.map(({ id, patch }) =>
      supabase.from('students').update(patch).eq('id', id)
    ));

    await supabase.from('interventions').delete()
      .eq('school_id', school_id).eq('source', 'auto').eq('status', 'suggested');

    const { data: existingProgressed } = await supabase
      .from('interventions')
      .select('student_id, action_type')
      .eq('school_id', school_id)
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
      if (error) console.error('Failed to insert auto actions:', error.message);
    }

    // ── Assignment notifications (19 Jul 2026): only for freshly inserted
    // actions; never repeated while an unread twin exists.
    if (output.notifications.length > 0 && newActions.length > 0) {
      const insertedStudents = new Set(newActions.map(a => (a as unknown as { student_id: string }).student_id));
      const candidate = output.notifications.filter(n => insertedStudents.has(n.student_id));
      if (candidate.length > 0) {
        const { data: unread } = await supabase.from('notifications')
          .select('recipient_id, student_id, title')
          .eq('school_id', school_id).eq('is_read', false);
        const seen = new Set((unread ?? []).map((n: { recipient_id: string; student_id: string; title: string }) => `${n.recipient_id}|${n.student_id}|${n.title}`));
        const fresh = candidate.filter(n => !seen.has(`${n.recipient_id}|${n.student_id}|${n.title}`));
        if (fresh.length > 0) {
          const { error } = await supabase.from('notifications').insert(fresh);
          if (error) console.error('Failed to insert notifications:', error.message);
        }
      }
    }

    const attendanceConcerns = output.students
      .filter(s => s.intelligence.norm.avgAttendance < 90).length;

    return new Response(JSON.stringify({
      attendanceConcerns,
      actionsGenerated: newActions.length,
      students: output.students.length,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (err) {
    console.error('run-analysis error:', err);
    return new Response(JSON.stringify({ error: String(err instanceof Error ? err.message : err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
