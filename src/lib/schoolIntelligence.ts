// Shared engine context intelligence
import { computeStaffBaselines } from '../../supabase/functions/_shared/context.ts';
import { supabase } from './supabase';

export interface IntelligenceInsight {
  id?: string;
  school_id: string;
  category: string;
  severity: string;
  headline: string;
  narrative: string;
  evidence: Record<string, any>;
  confidence: number;
  recommended_action: string | null;
  affected_student_ids: string[];
  affected_cohort: string | null;
  is_positive: boolean;
  import_batch_id: string | null;
  generated_at?: string;
}

interface StudentRow {
  id: string;
  name: string;
  year_group: string;
  form: string;
  send_status: string | null;
  pupil_premium: boolean;
  attendance_pct: number | null;
  behaviour_score: number | null;
  risk_level: string | null;
  signal_category: string | null;
  positive_points: number | null;
}

interface BehaviourRow {
  id: string;
  student_id: string;
  date: string;
  incident_type: string;
  behaviour_points: number;
  lesson_period: string | null;
  subject: string | null;
  staff_member: string | null;
  comment: string | null;
  safeguarding_note: string | null;
}

interface AttendanceRow {
  student_id: string;
  record_date: string;
  attendance_percentage: number | null;
  sessions_attended: number | null;
  sessions_possible: number | null;
}

interface SafeguardingRow {
  student_id: string;
  incident_date: string | null;
  incident_type: string | null;
  summary: string | null;
  severity: string | null;
}

interface InterventionRow {
  id: string;
  student_id: string;
  action_type: string;
  status: string;
  priority: string;
  baseline_behaviour: number | null;
  current_behaviour: number | null;
  after_behaviour: number | null;
  baseline_attendance: number | null;
  current_attendance: number | null;
  after_attendance: number | null;
  outcome_status: string | null;
  created_at: string;
}

interface PastoralRow {
  student_id: string;
  note_date: string | null;
  note: string | null;
  priority: string | null;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function dayOfWeek(dateStr: string): string {
  const d = new Date(dateStr);
  return DAYS[d.getDay()] ?? 'Mon';
}

function pct(n: number, total: number): number {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

export async function generateSchoolIntelligence(schoolId: string, batchId?: string): Promise<void> {
  const [
    { data: students },
    { data: behaviour },
    { data: attendance },
    { data: safeguarding },
    { data: interventions },
    { data: pastoral },
  ] = await Promise.all([
    supabase.from('students').select('id, name, year_group, form, send_status, pupil_premium, attendance_pct, behaviour_score, risk_level, signal_category, positive_points').eq('school_id', schoolId),
    supabase.from('behaviour_records').select('id, student_id, date, incident_type, behaviour_points, lesson_period, subject, staff_member, comment, safeguarding_note').eq('school_id', schoolId),
    supabase.from('attendance_records').select('student_id, record_date, attendance_percentage, sessions_attended, sessions_possible').eq('school_id', schoolId),
    supabase.from('safeguarding_records').select('student_id, incident_date, incident_type, summary, severity').eq('school_id', schoolId),
    supabase.from('interventions').select('id, student_id, action_type, status, priority, baseline_behaviour, current_behaviour, after_behaviour, baseline_attendance, current_attendance, after_attendance, outcome_status, created_at').eq('school_id', schoolId),
    supabase.from('pastoral_notes').select('student_id, note_date, note, priority').eq('school_id', schoolId),
  ]);

  const sts = (students ?? []) as StudentRow[];
  const beh = (behaviour ?? []) as BehaviourRow[];
  const att = (attendance ?? []) as AttendanceRow[];
  const saf = (safeguarding ?? []) as SafeguardingRow[];
  const intv = (interventions ?? []) as InterventionRow[];
  const past = (pastoral ?? []) as PastoralRow[];

  if (sts.length === 0) return;

  const insights: Omit<IntelligenceInsight, 'id' | 'generated_at'>[] = [];
  const bid = batchId || new Date().toISOString();

  // Build lookup maps
  const studentById = new Map(sts.map(s => [s.id, s]));
  const behByStudent = new Map<string, BehaviourRow[]>();
  beh.forEach(b => {
    if (!behByStudent.has(b.student_id)) behByStudent.set(b.student_id, []);
    behByStudent.get(b.student_id)!.push(b);
  });
  const attByStudent = new Map<string, AttendanceRow[]>();
  att.forEach(a => {
    if (!attByStudent.has(a.student_id)) attByStudent.set(a.student_id, []);
    attByStudent.get(a.student_id)!.push(a);
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // COHORT INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════════════

  const yearGroups = [...new Set(sts.map(s => s.year_group))].filter(y => y && y !== 'Unknown');
  const schoolAvgAtt = sts.reduce((s, st) => s + (st.attendance_pct ?? 95), 0) / sts.length;
  const schoolAvgBeh = sts.reduce((s, st) => s + (st.behaviour_score ?? 0), 0) / sts.length;
  const negativeRecords = beh.filter(b => b.behaviour_points > 0);

  for (const year of yearGroups) {
    const cohort = sts.filter(s => s.year_group === year);
    const cohortIds = new Set(cohort.map(s => s.id));
    const cohortBeh = negativeRecords.filter(b => cohortIds.has(b.student_id));
    const cohortAtt = cohort.map(s => s.attendance_pct ?? 95);
    const cohortAvgAtt = cohortAtt.reduce((a, b) => a + b, 0) / cohort.length;
    const cohortAvgBeh = cohort.reduce((s, st) => s + (st.behaviour_score ?? 0), 0) / cohort.length;

    // Attendance concern
    if (cohortAvgAtt < schoolAvgAtt - 3 && cohortAvgAtt < 93) {
      insights.push({
        school_id: schoolId, category: 'cohort', severity: cohortAvgAtt < 88 ? 'high' : 'medium',
        headline: `${year} attendance is ${Math.round(schoolAvgAtt - cohortAvgAtt)}% below school average`,
        narrative: `${year} average attendance is ${cohortAvgAtt.toFixed(1)}% compared with the school average of ${schoolAvgAtt.toFixed(1)}%. ${cohort.filter(s => (s.attendance_pct ?? 100) < 90).length} students are below 90%. This gap warrants a year-group review to identify root causes and targeted interventions.`,
        evidence: { cohortAvg: cohortAvgAtt, schoolAvg: schoolAvgAtt, below90: cohort.filter(s => (s.attendance_pct ?? 100) < 90).length, cohortSize: cohort.length },
        confidence: Math.min(95, 60 + cohort.length),
        recommended_action: `Schedule ${year} attendance review with HOY. Identify top absentees for parent contact.`,
        affected_student_ids: cohort.filter(s => (s.attendance_pct ?? 100) < 90).map(s => s.id),
        affected_cohort: year, is_positive: false, import_batch_id: bid,
      });
    }

    // Behaviour escalation
    if (cohortAvgBeh > schoolAvgBeh * 1.3 && cohortBeh.length > 5) {
      insights.push({
        school_id: schoolId, category: 'cohort', severity: cohortAvgBeh > schoolAvgBeh * 2 ? 'high' : 'medium',
        headline: `${year} behaviour incidents are significantly above school average`,
        narrative: `${year} has ${cohortBeh.length} negative behaviour records with an average score of ${cohortAvgBeh.toFixed(0)} per student (school average: ${schoolAvgBeh.toFixed(0)}). ${pct(cohortBeh.length, negativeRecords.length)}% of all school incidents originate from this year group.`,
        evidence: { incidentCount: cohortBeh.length, cohortAvg: cohortAvgBeh, schoolAvg: schoolAvgBeh, shareOfAll: pct(cohortBeh.length, negativeRecords.length) },
        confidence: Math.min(90, 50 + cohortBeh.length * 2),
        recommended_action: `HOY to review behaviour data, identify repeat offenders, and consider year-group assembly or restorative approach.`,
        affected_student_ids: cohort.filter(s => (s.behaviour_score ?? 0) > schoolAvgBeh * 1.5).map(s => s.id),
        affected_cohort: year, is_positive: false, import_batch_id: bid,
      });
    }

    // Positive: year group doing well
    if (cohortAvgAtt >= schoolAvgAtt + 2 && cohortAvgBeh < schoolAvgBeh * 0.7 && cohort.length > 3) {
      insights.push({
        school_id: schoolId, category: 'positive', severity: 'positive',
        headline: `${year} is performing above school average on attendance and behaviour`,
        narrative: `${year} has ${cohortAvgAtt.toFixed(1)}% average attendance (school: ${schoolAvgAtt.toFixed(1)}%) and lower behaviour incidents than average. This cohort is thriving and may benefit from recognition.`,
        evidence: { cohortAvgAtt, cohortAvgBeh, schoolAvgAtt, schoolAvgBeh },
        confidence: 75,
        recommended_action: `Recognise ${year} achievements in assembly. Consider rewards or celebration event.`,
        affected_student_ids: cohort.map(s => s.id),
        affected_cohort: year, is_positive: true, import_batch_id: bid,
      });
    }
  }

  // PP vs non-PP gap
  const ppStudents = sts.filter(s => s.pupil_premium);
  const nonPpStudents = sts.filter(s => !s.pupil_premium);
  if (ppStudents.length >= 3 && nonPpStudents.length >= 3) {
    const ppAvgBeh = ppStudents.reduce((s, st) => s + (st.behaviour_score ?? 0), 0) / ppStudents.length;
    const nonPpAvgBeh = nonPpStudents.reduce((s, st) => s + (st.behaviour_score ?? 0), 0) / nonPpStudents.length;
    const ppAvgAtt = ppStudents.reduce((s, st) => s + (st.attendance_pct ?? 95), 0) / ppStudents.length;
    const nonPpAvgAtt = nonPpStudents.reduce((s, st) => s + (st.attendance_pct ?? 95), 0) / nonPpStudents.length;

    if (ppAvgBeh > nonPpAvgBeh * 1.4 && ppAvgBeh > 10) {
      insights.push({
        school_id: schoolId, category: 'cohort', severity: 'high',
        headline: `Pupil Premium students are receiving disproportionately more behaviour points`,
        narrative: `PP students average ${ppAvgBeh.toFixed(0)} behaviour points vs ${nonPpAvgBeh.toFixed(0)} for non-PP (${pct(Math.round(ppAvgBeh - nonPpAvgBeh), Math.round(nonPpAvgBeh))}% higher). This gap may indicate systemic disadvantage requiring a PP strategy review.`,
        evidence: { ppAvg: ppAvgBeh, nonPpAvg: nonPpAvgBeh, ppCount: ppStudents.length },
        confidence: Math.min(90, 55 + ppStudents.length * 2),
        recommended_action: `PP review meeting with SLT. Analyse whether sanctions are disproportionate or if underlying need is unmet.`,
        affected_student_ids: ppStudents.filter(s => (s.behaviour_score ?? 0) > nonPpAvgBeh * 1.5).map(s => s.id),
        affected_cohort: 'Pupil Premium', is_positive: false, import_batch_id: bid,
      });
    }

    if (ppAvgAtt < nonPpAvgAtt - 4 && ppAvgAtt < 92) {
      insights.push({
        school_id: schoolId, category: 'cohort', severity: 'medium',
        headline: `Pupil Premium attendance gap: ${(nonPpAvgAtt - ppAvgAtt).toFixed(1)}% below non-PP`,
        narrative: `PP students average ${ppAvgAtt.toFixed(1)}% attendance compared with ${nonPpAvgAtt.toFixed(1)}% for non-PP peers. ${ppStudents.filter(s => (s.attendance_pct ?? 100) < 90).length} PP students are below 90%.`,
        evidence: { ppAvgAtt, nonPpAvgAtt, ppBelow90: ppStudents.filter(s => (s.attendance_pct ?? 100) < 90).length },
        confidence: 70,
        recommended_action: `Target PP students with attendance interventions. Consider breakfast club, transport support, or family engagement.`,
        affected_student_ids: ppStudents.filter(s => (s.attendance_pct ?? 100) < 90).map(s => s.id),
        affected_cohort: 'Pupil Premium', is_positive: false, import_batch_id: bid,
      });
    }
  }

  // SEND gap
  const sendStudents = sts.filter(s => s.send_status && s.send_status !== 'N - No SEN' && s.send_status !== 'None');
  const nonSendStudents = sts.filter(s => !s.send_status || s.send_status === 'N - No SEN' || s.send_status === 'None');
  if (sendStudents.length >= 3 && nonSendStudents.length >= 3) {
    const sendAvgAtt = sendStudents.reduce((s, st) => s + (st.attendance_pct ?? 95), 0) / sendStudents.length;
    const nonSendAvgAtt = nonSendStudents.reduce((s, st) => s + (st.attendance_pct ?? 95), 0) / nonSendStudents.length;
    if (sendAvgAtt < nonSendAvgAtt - 4) {
      insights.push({
        school_id: schoolId, category: 'cohort', severity: 'medium',
        headline: `SEND students have ${(nonSendAvgAtt - sendAvgAtt).toFixed(1)}% lower attendance than school average`,
        narrative: `SEND students average ${sendAvgAtt.toFixed(1)}% attendance vs ${nonSendAvgAtt.toFixed(1)}% for non-SEND peers. Barriers may include anxiety, sensory overload, or lack of reasonable adjustments.`,
        evidence: { sendAvgAtt, nonSendAvgAtt, sendCount: sendStudents.length },
        confidence: 70,
        recommended_action: `SENDCo to review absence reasons for SEND cohort. Consider environment audits and flexible timetabling.`,
        affected_student_ids: sendStudents.filter(s => (s.attendance_pct ?? 100) < 90).map(s => s.id),
        affected_cohort: 'SEND', is_positive: false, import_batch_id: bid,
      });
    }
  }

  // Form group outlier
  const forms = [...new Set(sts.map(s => s.form))].filter(f => f && f !== 'Unknown');
  if (forms.length >= 3) {
    const formBeh = forms.map(f => {
      const formSts = sts.filter(s => s.form === f);
      const formIds = new Set(formSts.map(s => s.id));
      const incidents = negativeRecords.filter(b => formIds.has(b.student_id)).length;
      return { form: f, incidents, students: formSts, year: formSts[0]?.year_group };
    });
    const avgFormIncidents = formBeh.reduce((s, f) => s + f.incidents, 0) / formBeh.length;
    const outliers = formBeh.filter(f => f.incidents > avgFormIncidents * 2 && f.incidents > 5);
    for (const outlier of outliers) {
      insights.push({
        school_id: schoolId, category: 'cohort', severity: 'medium',
        headline: `${outlier.form} is producing significantly more behaviour incidents than other ${outlier.year} forms`,
        narrative: `Tutor group ${outlier.form} has ${outlier.incidents} incidents (average per form: ${avgFormIncidents.toFixed(0)}). This is ${(outlier.incidents / avgFormIncidents).toFixed(1)}x the norm and may indicate a group dynamic or environmental factor.`,
        evidence: { form: outlier.form, incidents: outlier.incidents, average: avgFormIncidents, year: outlier.year },
        confidence: Math.min(85, 55 + outlier.incidents),
        recommended_action: `HOY to investigate ${outlier.form} dynamics. Consider seating plans, pastoral sessions, or tutor support.`,
        affected_student_ids: outlier.students.map(s => s.id),
        affected_cohort: outlier.form, is_positive: false, import_batch_id: bid,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SUBJECT INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════════════

  const subjects = [...new Set(negativeRecords.map(b => b.subject).filter(Boolean))] as string[];
  if (subjects.length >= 2 && negativeRecords.length >= 5) {
    const subjectCounts = subjects.map(sub => ({
      subject: sub,
      count: negativeRecords.filter(b => b.subject === sub).length,
      students: [...new Set(negativeRecords.filter(b => b.subject === sub).map(b => b.student_id))],
    })).sort((a, b) => b.count - a.count);

    const topSubject = subjectCounts[0];
    const topPct = pct(topSubject.count, negativeRecords.length);
    if (topPct >= 20 && topSubject.count >= 5) {
      insights.push({
        school_id: schoolId, category: 'subject', severity: topPct >= 40 ? 'high' : 'medium',
        headline: `${topPct}% of all behaviour incidents occur in ${topSubject.subject}`,
        narrative: `${topSubject.subject} accounts for ${topSubject.count} of ${negativeRecords.length} total incidents, involving ${topSubject.students.length} different students. This concentration may reflect curriculum challenges, classroom management, or timetabling issues.`,
        evidence: { subject: topSubject.subject, count: topSubject.count, total: negativeRecords.length, students: topSubject.students.length },
        confidence: Math.min(90, 55 + topSubject.count),
        recommended_action: `Departmental review for ${topSubject.subject}. Observe lessons, review curriculum pace, and offer CPD if needed.`,
        affected_student_ids: topSubject.students,
        affected_cohort: topSubject.subject, is_positive: false, import_batch_id: bid,
      });
    }

    // Staff outlier within a subject
    const staffCounts: Record<string, Record<string, number>> = {};
    negativeRecords.forEach(b => {
      if (!b.subject || !b.staff_member) return;
      if (!staffCounts[b.subject]) staffCounts[b.subject] = {};
      staffCounts[b.subject][b.staff_member] = (staffCounts[b.subject][b.staff_member] || 0) + 1;
    });
    for (const [sub, staffMap] of Object.entries(staffCounts)) {
      const staffArr = Object.entries(staffMap);
      if (staffArr.length < 2) continue;
      const avgStaff = staffArr.reduce((s, [, v]) => s + v, 0) / staffArr.length;
      const outlierStaff = staffArr.filter(([, v]) => v > avgStaff * 2.5 && v >= 5);
      for (const [staff, count] of outlierStaff) {
        insights.push({
          school_id: schoolId, category: 'subject', severity: 'medium',
          headline: `One teacher's classes in ${sub} generate significantly more incidents`,
          narrative: `A staff member's lessons in ${sub} have produced ${count} incidents (department average: ${avgStaff.toFixed(0)} per teacher). This is flagged for supportive review, not attribution of blame — it may indicate a need for CPD, mentoring, or curriculum support.`,
          evidence: { subject: sub, staffMember: staff, count, departmentAvg: avgStaff },
          confidence: 65,
          recommended_action: `Line manager to offer supportive observation and coaching. Do not use punitively.`,
          affected_student_ids: [],
          affected_cohort: sub, is_positive: false, import_batch_id: bid,
        });
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // TIME INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════════════

  if (negativeRecords.length >= 10) {
    // By period
    const periodCounts: Record<string, number> = {};
    negativeRecords.forEach(b => {
      if (b.lesson_period) periodCounts[b.lesson_period] = (periodCounts[b.lesson_period] || 0) + 1;
    });
    const periods = Object.entries(periodCounts).sort((a, b) => b[1] - a[1]);
    if (periods.length >= 2) {
      const avgPeriod = periods.reduce((s, [, v]) => s + v, 0) / periods.length;
      const peakPeriod = periods[0];
      if (peakPeriod[1] > avgPeriod * 1.8 && peakPeriod[1] >= 5) {
        const peakPct = pct(peakPeriod[1], negativeRecords.length);
        insights.push({
          school_id: schoolId, category: 'time', severity: peakPct >= 35 ? 'high' : 'medium',
          headline: `Behaviour spikes in ${peakPeriod[0]} — ${peakPct}% of all incidents`,
          narrative: `${peakPeriod[0]} has ${peakPeriod[1]} incidents (average per period: ${avgPeriod.toFixed(0)}). This ${peakPeriod[0].includes('5') || peakPeriod[0].includes('6') ? 'may indicate afternoon fatigue or end-of-day disengagement' : 'temporal pattern warrants investigation for timetabling or transition issues'}.`,
          evidence: { period: peakPeriod[0], count: peakPeriod[1], average: avgPeriod, pct: peakPct },
          confidence: Math.min(85, 55 + peakPeriod[1]),
          recommended_action: `Review ${peakPeriod[0]} staffing and curriculum. Consider movement breaks or structured transitions.`,
          affected_student_ids: [...new Set(negativeRecords.filter(b => b.lesson_period === peakPeriod[0]).map(b => b.student_id))],
          affected_cohort: null, is_positive: false, import_batch_id: bid,
        });
      }
    }

    // By day of week
    const dayCounts: Record<string, number> = {};
    negativeRecords.forEach(b => {
      if (b.date) dayCounts[dayOfWeek(b.date)] = (dayCounts[dayOfWeek(b.date)] || 0) + 1;
    });
    const days = Object.entries(dayCounts).sort((a, b) => b[1] - a[1]);
    if (days.length >= 3) {
      const avgDay = days.reduce((s, [, v]) => s + v, 0) / days.length;
      const peakDayEntry = days[0];
      if (peakDayEntry[1] > avgDay * 1.6 && peakDayEntry[1] >= 5) {
        insights.push({
          school_id: schoolId, category: 'time', severity: 'medium',
          headline: `${peakDayEntry[0]} has the most behaviour incidents (${peakDayEntry[1]})`,
          narrative: `${peakDayEntry[0]} accounts for ${pct(peakDayEntry[1], negativeRecords.length)}% of weekly incidents (average per day: ${avgDay.toFixed(0)}). ${peakDayEntry[0] === 'Mon' ? 'Mondays often reflect weekend dysregulation.' : peakDayEntry[0] === 'Fri' ? 'Friday patterns often relate to fatigue and anticipation of the weekend.' : 'This day pattern may indicate timetable or routine issues.'}`,
          evidence: { day: peakDayEntry[0], count: peakDayEntry[1], average: avgDay },
          confidence: 70,
          recommended_action: `Investigate ${peakDayEntry[0]} timetable and staffing. Consider structured start-of-day or calming activities.`,
          affected_student_ids: [],
          affected_cohort: null, is_positive: false, import_batch_id: bid,
        });
      }
    }

    // Safeguarding day concentration
    if (saf.length >= 3) {
      const safDays: Record<string, number> = {};
      saf.forEach(s => {
        if (s.incident_date) safDays[dayOfWeek(s.incident_date)] = (safDays[dayOfWeek(s.incident_date)] || 0) + 1;
      });
      const safDayArr = Object.entries(safDays).sort((a, b) => b[1] - a[1]);
      if (safDayArr.length >= 2 && safDayArr[0][1] >= 3) {
        const avgSafDay = safDayArr.reduce((s, [, v]) => s + v, 0) / safDayArr.length;
        if (safDayArr[0][1] > avgSafDay * 2) {
          insights.push({
            school_id: schoolId, category: 'time', severity: 'high',
            headline: `Safeguarding disclosures concentrate on ${safDayArr[0][0]}s`,
            narrative: `${safDayArr[0][1]} of ${saf.length} safeguarding concerns were raised on ${safDayArr[0][0]}s. ${safDayArr[0][0] === 'Mon' ? 'Monday disclosures often relate to weekend harm. DSL should consider proactive Monday check-ins for vulnerable students.' : 'This pattern may indicate when students feel safe to disclose — ensure staff availability on this day.'}`,
            evidence: { day: safDayArr[0][0], count: safDayArr[0][1], total: saf.length },
            confidence: 65,
            recommended_action: `DSL to ensure availability on ${safDayArr[0][0]}s. Consider proactive welfare checks for known vulnerable students.`,
            affected_student_ids: [...new Set(saf.filter(s => s.incident_date && dayOfWeek(s.incident_date) === safDayArr[0][0]).map(s => s.student_id))],
            affected_cohort: null, is_positive: false, import_batch_id: bid,
          });
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EMERGING PATTERN DETECTION
  // ═══════════════════════════════════════════════════════════════════════════════

  // Attendance decline preceding behaviour
  const declineThenBehaviour: string[] = [];
  for (const s of sts) {
    const sAtt = attByStudent.get(s.id) ?? [];
    const sBeh = behByStudent.get(s.id) ?? [];
    if (sAtt.length >= 2 && sBeh.length >= 2) {
      const sortedAtt = [...sAtt].sort((a, b) => a.record_date.localeCompare(b.record_date));
      const latestAtt = sortedAtt[sortedAtt.length - 1]?.attendance_percentage ?? 95;
      const earliestAtt = sortedAtt[0]?.attendance_percentage ?? 95;
      if (latestAtt != null && earliestAtt != null && earliestAtt - latestAtt > 8) {
        const recentBeh = sBeh.filter(b => b.behaviour_points > 0).length;
        if (recentBeh >= 3) declineThenBehaviour.push(s.id);
      }
    }
  }
  if (declineThenBehaviour.length >= 2) {
    insights.push({
      school_id: schoolId, category: 'emerging', severity: 'high',
      headline: `${declineThenBehaviour.length} students show attendance decline followed by behaviour deterioration`,
      narrative: `A pattern of falling attendance followed by increasing behaviour incidents suggests disengagement. Early intervention before the behaviour stage is significantly more effective.`,
      evidence: { count: declineThenBehaviour.length },
      confidence: 72,
      recommended_action: `Prioritise these students for pastoral check-in. Address attendance barriers before behaviour escalates further.`,
      affected_student_ids: declineThenBehaviour,
      affected_cohort: null, is_positive: false, import_batch_id: bid,
    });
  }

  // Multiple incidents together (relationship intelligence)
  const pairCounts = new Map<string, number>();
  const incidentsByDate = new Map<string, string[]>();
  negativeRecords.forEach(b => {
    const key = `${b.date}|${b.lesson_period || ''}`;
    if (!incidentsByDate.has(key)) incidentsByDate.set(key, []);
    incidentsByDate.get(key)!.push(b.student_id);
  });
  incidentsByDate.forEach(studentIds => {
    const unique = [...new Set(studentIds)];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const pair = [unique[i], unique[j]].sort().join('|');
        pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
      }
    }
  });
  const frequentPairs = [...pairCounts.entries()].filter(([, count]) => count >= 3).sort((a, b) => b[1] - a[1]);
  if (frequentPairs.length > 0) {
    const topPairs = frequentPairs.slice(0, 3);
    const allInvolvedIds = [...new Set(topPairs.flatMap(([pair]) => pair.split('|')))];
    const names = allInvolvedIds.map(id => studentById.get(id)?.name || 'Unknown').slice(0, 6);
    insights.push({
      school_id: schoolId, category: 'relationship', severity: topPairs[0][1] >= 5 ? 'high' : 'medium',
      headline: `${frequentPairs.length} student pair${frequentPairs.length > 1 ? 's' : ''} repeatedly involved in the same incidents`,
      narrative: `Students appearing together in incidents ${topPairs[0][1]}+ times: ${names.join(', ')}. Repeated co-involvement may indicate peer influence, conflict, or shared triggers. This warrants pastoral exploration of the relationship dynamics.`,
      evidence: { pairs: topPairs.map(([p, c]) => ({ students: p.split('|'), count: c })), names },
      confidence: Math.min(85, 50 + topPairs[0][1] * 5),
      recommended_action: `Pastoral team to explore peer dynamics. Consider seating changes, restorative conversations, or mediation.`,
      affected_student_ids: allInvolvedIds,
      affected_cohort: null, is_positive: false, import_batch_id: bid,
    });
  }

  // Escalation despite intervention
  const escalatingDespite = intv.filter(i =>
    i.outcome_status === 'escalating' || (i.status === 'escalated') ||
    (i.baseline_behaviour != null && i.current_behaviour != null && i.current_behaviour > i.baseline_behaviour * 1.3)
  );
  if (escalatingDespite.length >= 2) {
    const affectedIds = [...new Set(escalatingDespite.map(i => i.student_id))];
    insights.push({
      school_id: schoolId, category: 'emerging', severity: 'high',
      headline: `${escalatingDespite.length} interventions showing no improvement or escalation`,
      narrative: `These interventions have not reduced behaviour or attendance concerns. The students may need a different approach, additional support, or escalation to external services.`,
      evidence: { count: escalatingDespite.length, interventions: escalatingDespite.map(i => i.action_type) },
      confidence: 75,
      recommended_action: `Review strategy for these students. Consider alternative interventions, multi-agency referral, or parental engagement.`,
      affected_student_ids: affectedIds,
      affected_cohort: null, is_positive: false, import_batch_id: bid,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // INTERVENTION INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════════════

  const completedIntv = intv.filter(i => i.status === 'completed');
  if (completedIntv.length >= 2) {
    const successful = completedIntv.filter(i =>
      i.outcome_status === 'resolved' || i.outcome_status === 'sustained' || i.outcome_status === 'improving' ||
      (i.baseline_behaviour != null && i.after_behaviour != null && i.after_behaviour < i.baseline_behaviour * 0.7)
    );
    const unsuccessful = completedIntv.filter(i =>
      i.outcome_status === 'no_change' || i.outcome_status === 'escalating' ||
      (i.baseline_behaviour != null && i.after_behaviour != null && i.after_behaviour >= i.baseline_behaviour)
    );

    if (successful.length > 0) {
      const actionTypes = [...new Set(successful.map(i => i.action_type))];
      insights.push({
        school_id: schoolId, category: 'intervention', severity: 'positive',
        headline: `${successful.length} intervention${successful.length > 1 ? 's' : ''} showing measurable success`,
        narrative: `Successful interventions include: ${actionTypes.join(', ')}. These approaches have reduced concerns and should be considered for similar cases.`,
        evidence: { count: successful.length, types: actionTypes },
        confidence: 80,
        recommended_action: `Document successful approaches. Share with pastoral team as evidence-based options for future cases.`,
        affected_student_ids: successful.map(i => i.student_id),
        affected_cohort: null, is_positive: true, import_batch_id: bid,
      });
    }

    if (unsuccessful.length >= 2) {
      const actionTypes = [...new Set(unsuccessful.map(i => i.action_type))];
      insights.push({
        school_id: schoolId, category: 'intervention', severity: 'medium',
        headline: `${unsuccessful.length} intervention${unsuccessful.length > 1 ? 's' : ''} produced no measurable improvement`,
        narrative: `Interventions (${actionTypes.join(', ')}) have not achieved the intended outcome. A strategy review is needed — continuing ineffective approaches wastes resource and delays progress for these students.`,
        evidence: { count: unsuccessful.length, types: actionTypes },
        confidence: 70,
        recommended_action: `Review each case. Consider whether the intervention addressed the root cause or only the symptoms.`,
        affected_student_ids: unsuccessful.map(i => i.student_id),
        affected_cohort: null, is_positive: false, import_batch_id: bid,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // POSITIVE INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════════════

  const improvedStudents = sts.filter(s => s.signal_category === 'green' || s.signal_category === 'blue');
  if (improvedStudents.length >= 3) {
    insights.push({
      school_id: schoolId, category: 'positive', severity: 'positive',
      headline: `${improvedStudents.length} students showing positive progress`,
      narrative: `${improvedStudents.length} students (${pct(improvedStudents.length, sts.length)}% of cohort) are in the green or blue signal category. This indicates strong pastoral support and effective school culture.`,
      evidence: { count: improvedStudents.length, pct: pct(improvedStudents.length, sts.length) },
      confidence: 85,
      recommended_action: `Celebrate these achievements. Consider peer mentoring roles for sustained improvers.`,
      affected_student_ids: improvedStudents.map(s => s.id),
      affected_cohort: null, is_positive: true, import_batch_id: bid,
    });
  }

  // High positive points
  const totalPositive = sts.reduce((s, st) => s + (st.positive_points ?? 0), 0);
  if (totalPositive > 50) {
    const topPraise = sts.filter(s => (s.positive_points ?? 0) > 10).sort((a, b) => (b.positive_points ?? 0) - (a.positive_points ?? 0)).slice(0, 10);
    insights.push({
      school_id: schoolId, category: 'positive', severity: 'positive',
      headline: `${totalPositive} positive points awarded across the school`,
      narrative: `Strong recognition culture visible in the data. ${topPraise.length} students have accumulated significant praise. Maintaining a high praise-to-sanction ratio supports school culture.`,
      evidence: { totalPositive, topCount: topPraise.length },
      confidence: 80,
      recommended_action: `Continue recognition programmes. Share praise data with parents during reports.`,
      affected_student_ids: topPraise.map(s => s.id),
      affected_cohort: null, is_positive: true, import_batch_id: bid,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // RISK ESCALATION
  // ═══════════════════════════════════════════════════════════════════════════════

  const redStudents = sts.filter(s => s.signal_category === 'red');
  if (redStudents.length > 0) {
    const withMultipleIssues = redStudents.filter(s => {
      const hasBeh = (s.behaviour_score ?? 0) > 20;
      const hasAtt = (s.attendance_pct ?? 100) < 85;
      const hasSaf = saf.some(sf => sf.student_id === s.id);
      return [hasBeh, hasAtt, hasSaf].filter(Boolean).length >= 2;
    });
    if (withMultipleIssues.length > 0) {
      insights.push({
        school_id: schoolId, category: 'risk_escalation', severity: 'critical',
        headline: `${withMultipleIssues.length} student${withMultipleIssues.length > 1 ? 's' : ''} showing deterioration across multiple systems`,
        narrative: `These students show concurrent concerns across behaviour, attendance, and/or safeguarding. Multi-system decline indicates deep-rooted issues requiring immediate multi-agency or senior leadership attention.`,
        evidence: { count: withMultipleIssues.length },
        confidence: 88,
        recommended_action: `Immediate DSL/SLT review. Consider multi-agency referral, TAF meeting, or emergency pastoral plan.`,
        affected_student_ids: withMultipleIssues.map(s => s.id),
        affected_cohort: null, is_positive: false, import_batch_id: bid,
      });
    }
  }

  // Persistent absence threshold
  const paStudents = sts.filter(s => (s.attendance_pct ?? 100) < 80);
  if (paStudents.length > 0) {
    insights.push({
      school_id: schoolId, category: 'risk_escalation', severity: 'critical',
      headline: `${paStudents.length} student${paStudents.length > 1 ? 's' : ''} at persistent absence (<80%)`,
      narrative: `These students have crossed the persistent absence threshold. Formal attendance procedures, parent meetings, and potentially social care referral are required by statutory guidance.`,
      evidence: { count: paStudents.length },
      confidence: 95,
      recommended_action: `Initiate formal attendance procedures. Schedule parent meetings this week.`,
      affected_student_ids: paStudents.map(s => s.id),
      affected_cohort: null, is_positive: false, import_batch_id: bid,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EXECUTIVE MORNING INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════════════

  const execRisks = insights.filter(i => !i.is_positive && (i.severity === 'critical' || i.severity === 'high')).slice(0, 5);
  const execImprovements = insights.filter(i => i.is_positive).slice(0, 5);
  if (execRisks.length > 0 || execImprovements.length > 0) {
    insights.push({
      school_id: schoolId, category: 'executive', severity: execRisks.length > 0 ? 'high' : 'positive',
      headline: `SLT Briefing: ${execRisks.length} emerging risks, ${execImprovements.length} improvements`,
      narrative: `Top risks: ${execRisks.map(r => r.headline).join('; ')}. Improvements: ${execImprovements.map(r => r.headline).join('; ')}.${redStudents.length > 0 ? ` ${redStudents.length} students require immediate attention.` : ''} ${saf.length > 0 ? `${saf.length} safeguarding records logged.` : ''}`,
      evidence: { riskCount: execRisks.length, improvementCount: execImprovements.length, redStudents: redStudents.length, safeguardingRecords: saf.length },
      confidence: 90,
      recommended_action: `Review critical signals in today's briefing. Delegate actions to HOY/DSL as appropriate.`,
      affected_student_ids: redStudents.map(s => s.id).slice(0, 10),
      affected_cohort: null, is_positive: false, import_batch_id: bid,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // SAFEGUARDING
  // ═══════════════════════════════════════════════════════════════════════════════

  if (saf.length > 0) {
    const safStudentIds = [...new Set(saf.map(s => s.student_id))];
    const safTypes = [...new Set(saf.map(s => s.incident_type).filter(Boolean))];
    insights.push({
      school_id: schoolId, category: 'emerging', severity: 'critical',
      headline: `${saf.length} safeguarding concern${saf.length > 1 ? 's' : ''} across ${safStudentIds.length} student${safStudentIds.length > 1 ? 's' : ''}`,
      narrative: `Safeguarding records include: ${safTypes.join(', ')}. DSL must review all open concerns and confirm appropriate actions are in place.${saf.filter(s => s.severity === 'high' || s.severity === 'critical').length > 0 ? ' Some records are flagged as high severity.' : ''}`,
      evidence: { totalRecords: saf.length, students: safStudentIds.length, types: safTypes },
      confidence: 95,
      recommended_action: `DSL to review all flagged students today. Confirm referral status and update CPOMS.`,
      affected_student_ids: safStudentIds,
      affected_cohort: null, is_positive: false, import_batch_id: bid,
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PASTORAL NOTE INTELLIGENCE
  // ═══════════════════════════════════════════════════════════════════════════════

  if (past.length >= 3) {
    const highPriority = past.filter(p => p.priority === 'high' || p.priority === 'urgent');
    if (highPriority.length >= 2) {
      const hpStudents = [...new Set(highPriority.map(p => p.student_id))];
      insights.push({
        school_id: schoolId, category: 'emerging', severity: 'medium',
        headline: `${highPriority.length} high-priority pastoral notes flagged`,
        narrative: `${highPriority.length} pastoral notes are marked as high priority or urgent across ${hpStudents.length} students. These require prompt follow-up from the pastoral team.`,
        evidence: { count: highPriority.length, students: hpStudents.length },
        confidence: 80,
        recommended_action: `Pastoral team to triage high-priority notes and assign follow-up actions.`,
        affected_student_ids: hpStudents,
        affected_cohort: null, is_positive: false, import_batch_id: bid,
      });
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PERSIST INSIGHTS
  // ═══════════════════════════════════════════════════════════════════════════════

  // Delete previous insights for this school, then insert fresh batch
  // Also generate and persist staff baselines using the canonical shared engine.
  // This ensures StaffDevelopment.tsx and SchoolIntelligence.tsx see consistent results.
  const staffBaselines = computeStaffBaselines(beh as any, sts as any, intv as any);
  if (staffBaselines.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const baselineRows = staffBaselines.map(b => ({
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
    await supabase.from('staff_baselines').upsert(baselineRows, {
      onConflict: 'school_id,staff_member,analysis_date',
      ignoreDuplicates: false,
    });
  }

  await supabase.from('intelligence_insights').delete().eq('school_id', schoolId);
  if (insights.length > 0) {
    const { error } = await supabase.from('intelligence_insights').insert(insights);
    if (error) throw error;
  }
}

export async function getIntelligenceInsights(schoolId: string | null): Promise<IntelligenceInsight[]> {
  if (!schoolId) return [];
  const { data, error } = await supabase
    .from('intelligence_insights')
    .select('*')
    .eq('school_id', schoolId)
    .order('severity', { ascending: true })
    .order('confidence', { ascending: false });
  if (error) throw error;
  return (data ?? []) as IntelligenceInsight[];
}

