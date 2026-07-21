/**
 * Student Signal — Canonical Analysis Engine (RE-AUTHORED 19 Jul 2026)
 *
 * SINGLE SOURCE OF TRUTH for all scoring, signal, hypothesis and action
 * logic. Environment-neutral: no React, no browser APIs, no Supabase client,
 * no Deno APIs. Plain typed input in, plain typed results out.
 *
 * Consumed by BOTH execution paths:
 *   - frontend:  src/lib/signalEngine.ts (fetch/write adapter, Vite)
 *   - edge:      supabase/functions/run-analysis/index.ts (fetch/write adapter, Deno)
 *
 * Neither adapter may implement scoring logic locally — enforced by
 * tests/parity.test.ts. Pure-function core derived from the 9 July
 * signalEngine.ts pipeline, extended with structured intelligence fields
 * (late marks, attendance concern, CPOMS category/subcategory/status,
 * behaviour class, assessment progress status) and integrated with the
 * hypothesis engine per the approved 17 July design.
 */

import { generateHypotheses } from './hypothesis.ts';
import type { EvidenceBundle, HypothesisInput } from './hypothesis.ts';
import { analyseContext } from './context.ts';
import { buildLongitudinalMemory } from './memory.ts';
import type { RichInterventionRow, LongitudinalMemory } from './memory.ts';
export type { LongitudinalMemory };
import type { ContextIntelligence, InterventionRow } from './context.ts';
import { resolveOwner as routeOwner, buildAssignmentNotifications as routeNotifications } from './routing.ts';
import type { ProfileLite, RoutingContext, NotificationPayload } from './routing.ts';

export type { ContextIntelligence, InterventionRow, ProfileLite, NotificationPayload };
export { resolveOwner, escalateAction, buildModalDefaults, buildAssignmentNotifications } from './routing.ts';

export const HOY_BY_YEAR: Record<string, string> = {
  'Reception': 'Ms Webb (HOY Reception)',
  'Year 1':   'Mr Bailey (HOY Y1)',
  'Year 2':   'Ms Taylor (HOY Y2)',
  'Year 3':   'Mrs Fox (HOY Y3)',
  'Year 4':   'Mr Cole (HOY Y4)',
  'Year 5':   'Ms Grant (HOY Y5)',
  'Year 6':   'Mrs Morton (HOY Y6)',
  'Year 7':   'Ms Clarke (HOY Y7)',
  'Year 8':   'Mr Singh (HOY Y8)',
  'Year 9':   'Mr Okafor (HOY Y9)',
  'Year 10':  'Ms Harris (HOY Y10)',
  'Year 11':  'Mrs Reeves (HOY Y11)',
};

export type ExplanationInput = {
  studentName?: string;
  riskLevel?: 'red' | 'amber' | 'green';
  signalCategory?: string;
  riskScore?: number;
  behaviourTrend?: string;
  attendanceTrend?: string;
  keyReasons?: string[];
  subjectsInvolved?: string[];
  periodsInvolved?: string[];
  suggestedPastoralAction?: string | null;
  suggestedParentContact?: string | null;
  suggestedStaffAction?: string | null;
  sendStatus?: string | null;
  pupilPremium?: boolean;
  incidentCount?: number;
  totalPoints?: number;
  avgAttendance?: number;
  safeguardingCount?: number;
  positivePoints?: number;
  // Cross-source intelligence fields — answer the 10 required questions (Jul 2026)
  primaryHypothesisHeadline?: string | null;
  primaryHypothesisNarrative?: string | null;
  primaryHypothesisConfidence?: string | null;
  primaryHypothesisConfidenceReason?: string | null;
  predictedEscalation?: string | null;
  hypothesisRecommendedAction?: string | null;
  hypothesisRecommendedRole?: string | null;
  evidenceSummary?: string | null;
};

export function composeSignalExplanation(input: ExplanationInput): string {
  const {
    studentName = 'This student',
    riskLevel = 'green',
    signalCategory,
    behaviourTrend,
    attendanceTrend,
    keyReasons = [],
    subjectsInvolved = [],
    periodsInvolved = [],
    suggestedPastoralAction,
    suggestedParentContact,
    suggestedStaffAction,
    sendStatus,
    pupilPremium,
    incidentCount = 0,
    totalPoints = 0,
    avgAttendance,
    safeguardingCount = 0,
    positivePoints = 0,
  } = input;

  const name = studentName.split(' ')[0]; // first name only for readability
  const sentences: string[] = [];

  // ── Opening sentence: what kind of signal is this ──────────────────────────

  if (riskLevel === 'green' && (signalCategory === 'blue' || positivePoints >= 30)) {
    sentences.push(
      `${name} is showing consistently positive progress across multiple data sources.`
    );
  } else if (signalCategory === 'purple') {
    sentences.push(
      `${name} appears to be performing adequately on surface metrics but shows signs of a hidden decline — a pattern that conventional behaviour systems typically miss.`
    );
  } else if (safeguardingCount > 0) {
    sentences.push(
      `${name} has been flagged due to a combination of safeguarding concerns and supporting welfare signals across multiple systems.`
    );
  } else if (riskLevel === 'red') {
    sentences.push(
      `${name} has been placed at high risk following a convergence of concerning signals from ${keyReasons.length > 1 ? 'multiple data sources' : 'recent records'}.`
    );
  } else if (riskLevel === 'amber') {
    sentences.push(
      `${name} has been flagged as a watchlist concern — the pattern of signals does not yet indicate crisis, but warrants early pastoral attention.`
    );
  } else {
    sentences.push(`${name} is currently tracking within expected ranges across all monitored data sources.`);
  }

  // ── Behaviour detail ───────────────────────────────────────────────────────

  if (incidentCount > 0 || totalPoints > 0) {
    let behSentence = '';

    if (incidentCount > 0 && totalPoints > 0) {
      behSentence = `${name} has accumulated ${totalPoints} behaviour point${totalPoints !== 1 ? 's' : ''} across ${incidentCount} incident${incidentCount !== 1 ? 's' : ''}`;
    } else if (incidentCount > 0) {
      behSentence = `${name} has had ${incidentCount} behaviour incident${incidentCount !== 1 ? 's' : ''} on record`;
    }

    if (subjectsInvolved.length > 0) {
      const topSubject = subjectsInvolved[0];
      const subjectConcentration = subjectsInvolved.length === 1 || subjectsInvolved.length <= 2;
      if (subjectConcentration) {
        behSentence += `, with incidents concentrated in ${subjectsInvolved.join(' and ')}`;
      } else {
        behSentence += `, spanning ${subjectsInvolved.slice(0, 3).join(', ')}`;
      }
    }

    if (periodsInvolved.length === 1) {
      behSentence += ` — predominantly during ${periodsInvolved[0]}`;
    } else if (periodsInvolved.length > 1) {
      behSentence += ` — most frequently during ${periodsInvolved[0]}`;
    }

    if (behSentence) {
      // Add interpretive conclusion for subject/period concentration
      if (subjectsInvolved.length <= 2 && subjectsInvolved.length > 0 && incidentCount >= 3) {
        sentences.push(behSentence + `. This concentration suggests the concern may be subject-specific rather than a general behaviour pattern.`);
      } else if (periodsInvolved.length === 1 && incidentCount >= 3) {
        sentences.push(behSentence + `. The time-of-day concentration suggests a timetable, resource or staffing trigger.`);
      } else {
        sentences.push(behSentence + '.');
      }
    }

    if (behaviourTrend === 'Escalating') {
      sentences.push(`The behaviour trend is escalating — this pattern requires active intervention rather than continued monitoring.`);
    }
  }

  // ── Positive signals ───────────────────────────────────────────────────────

  if (positivePoints > 0 && riskLevel === 'green') {
    sentences.push(`${name} has earned ${positivePoints} positive point${positivePoints !== 1 ? 's' : ''}, indicating strong engagement and consistent effort.`);
  } else if (positivePoints > 0 && riskLevel !== 'green' && signalCategory === 'purple') {
    sentences.push(`Despite ${positivePoints} positive point${positivePoints !== 1 ? 's' : ''} on record, the recent withdrawal pattern is inconsistent with prior behaviour — the change itself is the concern.`);
  }

  // ── Attendance detail ──────────────────────────────────────────────────────

  if (avgAttendance !== undefined && avgAttendance < 95) {
    let attSentence = '';
    if (avgAttendance < 80) {
      attSentence = `Attendance has fallen to ${avgAttendance}%, crossing the persistent absence threshold and triggering a statutory response requirement.`;
    } else if (avgAttendance < 85) {
      attSentence = `Attendance is at ${avgAttendance}%, well below the 90% target — a formal monitoring plan and parent contact are required.`;
    } else if (avgAttendance < 90) {
      attSentence = `Attendance is at ${avgAttendance}%, below the 90% school target — continued absence without intervention is likely to push this into persistent absence territory.`;
    } else if (attendanceTrend === 'Below target') {
      attSentence = `Attendance is at ${avgAttendance}%, slightly below target — early monitoring is recommended to prevent further decline.`;
    }
    if (attSentence) sentences.push(attSentence);
  }

  // ── Safeguarding note ──────────────────────────────────────────────────────

  if (safeguardingCount > 0) {
    sentences.push(
      `A safeguarding note is active on CPOMS — formal DSL acknowledgement is required and this concern must not be left at the monitoring stage.`
    );
  }

  // ── Contextual modifiers ───────────────────────────────────────────────────

  if (sendStatus && riskLevel !== 'green') {
    sentences.push(`${name} has an active SEN/EHCP record — any pastoral concern must be considered alongside existing provision and SEND review obligations.`);
  }

  if (pupilPremium && avgAttendance !== undefined && avgAttendance < 90) {
    sentences.push(`As a Pupil Premium student with attendance below target, ${name.toLowerCase()} should be prioritised in any cohort-wide attendance intervention.`);
  }

  // ── Recommended action ─────────────────────────────────────────────────────

  const actions: string[] = [];
  if (suggestedPastoralAction) actions.push(suggestedPastoralAction.toLowerCase());
  if (suggestedParentContact) actions.push(suggestedParentContact.toLowerCase());
  if (suggestedStaffAction) actions.push(suggestedStaffAction.toLowerCase());

  if (actions.length > 0) {
    const actionList = actions.length === 1
      ? actions[0]
      : actions.slice(0, -1).join(', ') + ' and ' + actions[actions.length - 1];
    sentences.push(`Recommended next steps: ${actionList}.`);
  }

  // ── 10-question intelligence epilogue ─────────────────────────────────────
  // When hypothesis data is present (from runEngine), append the why, confidence
  // and predicted escalation so the signal card answers all 10 required questions.
  if (input.primaryHypothesisHeadline) {
    // Q2: Why do we think this changed?
    sentences.push(`Most likely explanation: ${input.primaryHypothesisHeadline.replace(/^Most likely explanation: /i, '')}.`);
  }

  if (input.primaryHypothesisNarrative && input.primaryHypothesisNarrative.length > 20) {
    sentences.push(input.primaryHypothesisNarrative);
  }

  if (input.primaryHypothesisConfidence && input.primaryHypothesisConfidenceReason) {
    // Q3: How confident are we?
    const conf = input.primaryHypothesisConfidence;
    const confLabel = conf === 'high' ? 'High confidence'
      : conf === 'medium' ? 'Moderate confidence'
      : conf === 'low' ? 'Lower confidence'
      : 'Early indication';
    sentences.push(`${confLabel}: ${input.primaryHypothesisConfidenceReason}.`);
  }

  if (input.evidenceSummary) {
    // Q4: What evidence?
    sentences.push(`Evidence: ${input.evidenceSummary}.`);
  }

  // Q5 + Q6: Recommended next step with role
  if (input.hypothesisRecommendedAction && input.hypothesisRecommendedRole) {
    const roleDisplay: Record<string, string> = {
      dsl: 'DSL', sendco: 'SENDCo', head_of_year: 'Head of Year',
      pastoral_lead: 'Pastoral Lead', tutor: 'Form Tutor', slt: 'SLT',
      careers_lead: 'Careers Lead',
    };
    const role = roleDisplay[input.hypothesisRecommendedRole] ?? input.hypothesisRecommendedRole;
    sentences.push(`Recommended action (${role}): ${input.hypothesisRecommendedAction}`);
  } else if (input.hypothesisRecommendedAction) {
    sentences.push(`Recommended action: ${input.hypothesisRecommendedAction}`);
  }

  // Q10: If nothing happens, what is likely to happen next?
  if (input.predictedEscalation) {
    sentences.push(`If unaddressed: ${input.predictedEscalation}`);
  }

  return sentences.join(' ');
}

// Convenience wrapper that maps an AnalysisResult + Student directly to the composer
// ─── Raw DB row types ─────────────────────────────────────────────────────────

export interface StudentRow {
  id: string;
  name: string;
  year_group: string;
  form: string;
  send_status: string | null;
  pupil_premium: boolean;
  attendance_pct: number | null;
}

export interface BehaviourRow {
  id: string;
  student_id: string;
  date: string;
  incident_type: string;
  behaviour_points: number;
  positive_points: number | null;
  lesson_period: string | null;
  subject: string | null;
  staff_member: string | null;
  comment: string | null;
  safeguarding_note: string | null;
  /** Structured fields (19 Jul 2026): canonical class + provenance */
  behaviour_class?: 'positive' | 'negative' | 'neutral' | null;
  category?: string | null;
  source_system?: string | null;
}

export interface AttendanceRow {
  student_id: string;
  record_date: string;
  attendance_percentage: number | null;
  /** Structured fields (19 Jul 2026) */
  late_marks?: number | null;
  attendance_concern?: 'none' | 'monitor' | 'persistent_absence' | null;
}

export interface SafeguardingRow {
  student_id: string;
  incident_date: string | null;
  incident_type: string | null;
  summary: string | null;
  severity: string | null;
  /** Structured, independently queryable CPOMS fields (19 Jul 2026) */
  category?: string | null;
  subcategory?: string | null;
  status?: 'open' | 'closed' | null;
  assigned_to?: string | null;
}

/** Bromcom-style assessment snapshot — structured Below Target evidence (19 Jul 2026). */
export interface AssessmentRow {
  student_id: string;
  assessment_date: string | null;
  assessment_cycle: string | null;
  subject: string | null;
  current_grade: string | null;
  target_grade: string | null;
  progress_gap: string | null;
  progress_status?: 'on_track' | 'below_target' | 'above_target' | null;
}

export interface PastoralRow {
  student_id: string;
  note_date: string | null;
  note: string | null;
  priority: string | null;
  status?: string | null;
  entered_by?: string | null;
}

export interface CareerRow {
  student_id: string;
  destination_risk: string | null;
  career_interests: unknown;
  barriers: string | null;
  strengths: string | null;
}

export interface CommunicationRow {
  student_id: string;
  date: string;
  priority: string | null;
  summary: string | null;
  routing_status: string | null;
  suggested_assignee: string | null;
}

// ─── Stage 1 output: Normalised per-student data ──────────────────────────────

export interface NormalisedStudent {
  student: StudentRow;
  // Behaviour
  totalBehaviourPoints: number;
  positivePoints: number;
  incidentCount: number;
  subjects: string[];
  periods: string[];
  topSubject: [string, number] | null;
  topPeriod: [string, number] | null;
  topStaff: [string, number] | null;
  subjectConcentration: number;
  punctualityIssues: number;
  safeguardingNoteCount: number; // from behaviour_records.safeguarding_note
  // Attendance
  avgAttendance: number;
  attendanceReadings: number; // how many data points
  // Safeguarding
  safeguardingRecordCount: number;
  hasCriticalSafeguarding: boolean;
  // Pastoral
  pastotalNoteCount: number;
  urgentPastoralCount: number;
  highPriorityPastoralCount: number;
  // Careers
  hasCareerRisk: boolean;
  missingCareerData: boolean;
  careerStrengths: string | null;
  careerBarriers: string | null;
  // Communications
  urgentCommsCount: number;
  recentCommsCount: number;
  // Peers
  linkedPeerIds: string[];
  // Combined evidence
  dataSources: string[];
  evidenceCount: number;
  // Structured intelligence metrics (19 Jul 2026)
  lateMarksTotal: number;
  attendanceConcernLevel: 'none' | 'monitor' | 'persistent_absence' | null;
  openSafeguardingCount: number;
  closedSafeguardingCount: number;
  belowTargetSubjects: string[];
  assessmentRecordCount: number;
  // Raw per-student records retained for the hypothesis engine
  rawBehaviour: BehaviourRow[];
  rawAttendance: AttendanceRow[];
  rawSafeguarding: SafeguardingRow[];
  rawPastoral: PastoralRow[];
  rawComms: CommunicationRow[];
}

// ─── Stage 3 output: Student intelligence ────────────────────────────────────

export interface CorroborationScore {
  sourceCount: number;       // how many independent sources agree on concern
  sourcesAgreeing: string[]; // which sources
  weight: number;            // 0–1 composite weight for confidence
}

export interface StudentIntelligenceRecord {
  norm: NormalisedStudent;
  // Corroboration per risk domain
  behaviourCorroboration: CorroborationScore;
  attendanceCorroboration: CorroborationScore;
  safeguardingCorroboration: CorroborationScore;
  wellbeingCorroboration: CorroborationScore;
  // Derived signal
  riskLevel: 'red' | 'amber' | 'green';
  signalCategory: 'red' | 'amber' | 'purple' | 'green' | 'blue' | 'grey';
  riskScore: number;
  confidenceScore: number;
  // Narrative
  keyReasons: string[];
  strengthsList: string[];
  barriersList: string[];
  improvements: string[];
  repeatedPatterns: Array<{ type: string; value: unknown; count: number }>;
  suggestedNextSteps: Array<{ role: string; action: string; priority: string }>;
}

// ─── Stage 4 output: Cohort intelligence ─────────────────────────────────────

export interface CohortIntelligence {
  yearGroup: string;
  redCount: number;
  amberCount: number;
  avgBehaviourPoints: number;
  avgAttendance: number;
  hotSubjects: Array<{ subject: string; count: number }>;
  hotPeriods: Array<{ period: string; count: number }>;
  peerClusters: string[][]; // groups of ≥3 co-involved students
}

// ─── Stage 5 output: School intelligence ─────────────────────────────────────

export interface SchoolIntelligence {
  schoolAvgBehaviourPoints: number;
  schoolAvgAttendance: number;
  totalRedStudents: number;
  totalAmberStudents: number;
  cohorts: CohortIntelligence[];
  globalHotSubjects: Array<{ subject: string; count: number }>;
  globalHotPeriods: Array<{ period: string; count: number }>;
}

// ─── Stage 6 output: Signal ───────────────────────────────────────────────────

export interface Signal {
  studentId: string;
  signalType: 'behaviour_escalation' | 'attendance_decline' | 'safeguarding' |
              'wellbeing_concern' | 'hidden_decline' | 'positive_progress' |
              'exceptional_achievement' | 'send_review' | 'careers_gap' |
              'peer_cluster' | 'attainment_decline' | 'reward_pattern' | 'context_pattern';
  severity: 'critical' | 'high' | 'medium' | 'low';
  corroboration: CorroborationScore;
  narrative: string;
  meta: Record<string, unknown>;
}

// ─── Stage 7 output: Generated action ────────────────────────────────────────

export interface GeneratedAction {
  student_id: string;
  school_id: string;
  assigned_to: string | null;
  assigned_to_user_id: string | null; // resolved to a real profile id by assignActions when profiles are supplied
  assigned_role: string;
  action_type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'suggested';
  due_date: string;
  notes: string;
  reason: string;
  source: 'auto';
  baseline_attendance: number | null;
  baseline_behaviour: number | null;
  created_by: string;
  outcome: null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

export function resolveHOYName(yearGroup: string): string {
  return HOY_BY_YEAR[yearGroup] || 'Head of Year';
}

export function topEntry(map: Map<string, number>): [string, number] | null {
  let best: [string, number] | null = null;
  map.forEach((count, key) => {
    if (!best || count > best[1]) best = [key, count];
  });
  return best;
}

// ─── STAGE 1: Normalise data ──────────────────────────────────────────────────

export function normaliseStudents(
  students: StudentRow[],
  beh: BehaviourRow[],
  att: AttendanceRow[],
  saf: SafeguardingRow[],
  past: PastoralRow[],
  careers: CareerRow[],
  comms: CommunicationRow[],
  peerLinksMap: Map<string, string[]>,
  assessments: AssessmentRow[] = [],
): NormalisedStudent[] {
  const assByStudent = new Map<string, AssessmentRow[]>();
  assessments.forEach(a => {
    if (!assByStudent.has(a.student_id)) assByStudent.set(a.student_id, []);
    assByStudent.get(a.student_id)!.push(a);
  });
  const behByStudent = new Map<string, BehaviourRow[]>();
  beh.forEach(b => {
    if (!behByStudent.has(b.student_id)) behByStudent.set(b.student_id, []);
    behByStudent.get(b.student_id)!.push(b);
  });

  const attByStudent = new Map<string, number[]>();
  const attRowsByStudent = new Map<string, AttendanceRow[]>();
  att.forEach(a => {
    if (!attRowsByStudent.has(a.student_id)) attRowsByStudent.set(a.student_id, []);
    attRowsByStudent.get(a.student_id)!.push(a);
    const pct = parseFloat(String(a.attendance_percentage ?? ''));
    if (!isNaN(pct) && pct >= 0 && pct <= 100) {
      if (!attByStudent.has(a.student_id)) attByStudent.set(a.student_id, []);
      attByStudent.get(a.student_id)!.push(pct);
    }
  });

  const safByStudent = new Map<string, SafeguardingRow[]>();
  saf.forEach(s => {
    if (!safByStudent.has(s.student_id)) safByStudent.set(s.student_id, []);
    safByStudent.get(s.student_id)!.push(s);
  });

  const pastByStudent = new Map<string, PastoralRow[]>();
  past.forEach(p => {
    if (!pastByStudent.has(p.student_id)) pastByStudent.set(p.student_id, []);
    pastByStudent.get(p.student_id)!.push(p);
  });

  const careerByStudent = new Map<string, CareerRow>();
  careers.forEach(c => careerByStudent.set(c.student_id, c));

  const commsByStudent = new Map<string, CommunicationRow[]>();
  comms.forEach(c => {
    if (!commsByStudent.has(c.student_id)) commsByStudent.set(c.student_id, []);
    commsByStudent.get(c.student_id)!.push(c);
  });

  return students.map(student => {
    const sRecords = behByStudent.get(student.id) || [];
    const sSaf = safByStudent.get(student.id) || [];
    const sPast = pastByStudent.get(student.id) || [];
    const sCareer = careerByStudent.get(student.id);
    const sComms = commsByStudent.get(student.id) || [];
    const attReadings = attByStudent.get(student.id) ?? [];
    const sAttRows = attRowsByStudent.get(student.id) ?? [];
    const sAssessments = assByStudent.get(student.id) ?? [];

    // Structured attendance metrics (19 Jul 2026)
    const lateMarksTotal = sAttRows.reduce((t, a) => t + (a.late_marks ?? 0), 0);
    const concernRank = { none: 0, monitor: 1, persistent_absence: 2 } as const;
    let attendanceConcernLevel: 'none' | 'monitor' | 'persistent_absence' | null = null;
    for (const a of sAttRows) {
      if (a.attendance_concern &&
          (attendanceConcernLevel == null ||
           concernRank[a.attendance_concern] > concernRank[attendanceConcernLevel])) {
        attendanceConcernLevel = a.attendance_concern;
      }
    }

    // Structured safeguarding metrics: open vs closed are NOT the same thing
    const openSafeguardingCount = sSaf.filter(r => (r.status ?? 'open') !== 'closed').length;
    const closedSafeguardingCount = sSaf.length - openSafeguardingCount;

    // Structured assessment metrics
    const belowTargetSubjects = [...new Set(
      sAssessments
        .filter(a => a.progress_status === 'below_target')
        .map(a => a.subject)
        .filter((x): x is string => !!x)
    )];

    // Behaviour metrics.
    // Risk maths counts NEGATIVE canonical points only: rows carrying a
    // positive behaviour_class contribute nothing to totalBehaviourPoints
    // even if a legacy import put a value in behaviour_points.
    const totalBehaviourPoints = sRecords.reduce((s, r) =>
      s + (r.behaviour_class === 'positive' ? 0 : (r.behaviour_points || 0)), 0);
    const positivePoints = sRecords.reduce((s, r) => s + (r.positive_points || 0), 0);
    const incidentCount = sRecords.filter(r => (r.behaviour_points || 0) > 0).length;
    const subjects = [...new Set(sRecords.map(r => r.subject).filter(Boolean))] as string[];
    const periods = [...new Set(sRecords.map(r => r.lesson_period).filter(Boolean))] as string[];
    const punctualityIssues = sRecords.filter(r =>
      (r.incident_type || '').toLowerCase().includes('late')
    ).length;
    const safeguardingNoteCount = sRecords.filter(r => r.safeguarding_note?.trim()).length;

    const subjectCounts = new Map<string, number>();
    sRecords.filter(r => r.behaviour_points > 0 && r.subject).forEach(r => {
      subjectCounts.set(r.subject!, (subjectCounts.get(r.subject!) || 0) + 1);
    });
    const periodCounts = new Map<string, number>();
    sRecords.filter(r => r.behaviour_points > 0 && r.lesson_period).forEach(r => {
      periodCounts.set(r.lesson_period!, (periodCounts.get(r.lesson_period!) || 0) + 1);
    });
    const staffCounts = new Map<string, number>();
    sRecords.filter(r => r.behaviour_points > 0 && r.staff_member).forEach(r => {
      staffCounts.set(r.staff_member!, (staffCounts.get(r.staff_member!) || 0) + 1);
    });

    const topSubject = topEntry(subjectCounts);
    const topPeriod = topEntry(periodCounts);
    const topStaff = topEntry(staffCounts);
    const subjectConcentration = topSubject && incidentCount > 0 ? topSubject[1] / incidentCount : 0;

    // Attendance
    const avgAttendance = attReadings.length > 0
      ? Math.round((attReadings.reduce((a, b) => a + b, 0) / attReadings.length) * 10) / 10
      : (student.attendance_pct ?? 95);

    // Safeguarding — only OPEN records drive a critical escalation.
    // Closed records remain visible as historical context but do not
    // force red or critical severity (19 Jul 2026 clarification).
    const hasCriticalSafeguarding = sSaf.some(s =>
      ((s.status ?? 'open') !== 'closed') &&
      ((s.severity || '').toLowerCase() === 'high' || (s.severity || '').toLowerCase() === 'critical')
    );

    // Pastoral
    const urgentPastoralCount = sPast.filter(p =>
      (p.priority || '').toLowerCase() === 'urgent'
    ).length;
    const highPriorityPastoralCount = sPast.filter(p =>
      (p.priority || '').toLowerCase() === 'high' || (p.priority || '').toLowerCase() === 'urgent'
    ).length;

    // Careers
    const hasCareerRisk = sCareer?.destination_risk === 'high' || sCareer?.destination_risk === 'very_high';
    const missingCareerData = !sCareer &&
      (student.year_group === 'Year 10' || student.year_group === 'Year 11');

    // Communications
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const recentComms = sComms.filter(c => new Date(c.date) >= thirtyDaysAgo);
    const urgentCommsCount = recentComms.filter(c => c.priority === 'urgent').length;

    // Data sources
    const dataSources: string[] = [];
    if (sRecords.length > 0) dataSources.push('behaviour');
    if (attReadings.length > 0) dataSources.push('attendance');
    if (sSaf.length > 0) dataSources.push('safeguarding');
    if (sPast.length > 0) dataSources.push('pastoral_notes');
    if (sCareer) dataSources.push('careers');
    if (recentComms.length > 0) dataSources.push('communications');
    if (sAssessments.length > 0) dataSources.push('assessment');

    const evidenceCount = sRecords.length + attReadings.length + sSaf.length +
      sPast.length + (sCareer ? 1 : 0) + recentComms.length + sAssessments.length;

    return {
      student,
      totalBehaviourPoints,
      positivePoints,
      incidentCount,
      subjects,
      periods,
      topSubject,
      topPeriod,
      topStaff,
      subjectConcentration,
      punctualityIssues,
      safeguardingNoteCount,
      avgAttendance,
      attendanceReadings: attReadings.length,
      safeguardingRecordCount: sSaf.length,
      hasCriticalSafeguarding,
      pastotalNoteCount: sPast.length,
      urgentPastoralCount,
      highPriorityPastoralCount,
      hasCareerRisk,
      missingCareerData,
      careerStrengths: sCareer?.strengths ?? null,
      careerBarriers: sCareer?.barriers ?? null,
      urgentCommsCount,
      recentCommsCount: recentComms.length,
      linkedPeerIds: peerLinksMap.get(student.id) ?? [],
      dataSources,
      evidenceCount,
      lateMarksTotal,
      attendanceConcernLevel,
      openSafeguardingCount,
      closedSafeguardingCount,
      belowTargetSubjects,
      assessmentRecordCount: sAssessments.length,
      rawBehaviour: sRecords,
      rawAttendance: sAttRows,
      rawSafeguarding: sSaf,
      rawPastoral: sPast,
      rawComms: sComms,
    };
  });
}

// ─── STAGE 2: Build peer co-involvement map ───────────────────────────────────

export function buildPeerLinks(beh: BehaviourRow[]): Map<string, string[]> {
  const incidentsBySlot = new Map<string, string[]>();
  beh.filter(b => b.behaviour_points > 0).forEach(b => {
    const key = `${b.date}|${b.lesson_period || ''}|${b.subject || ''}`;
    if (!incidentsBySlot.has(key)) incidentsBySlot.set(key, []);
    incidentsBySlot.get(key)!.push(b.student_id);
  });

  const pairCounts = new Map<string, number>();
  incidentsBySlot.forEach(ids => {
    const unique = [...new Set(ids)];
    for (let i = 0; i < unique.length; i++) {
      for (let j = i + 1; j < unique.length; j++) {
        const pair = [unique[i], unique[j]].sort().join('|');
        pairCounts.set(pair, (pairCounts.get(pair) || 0) + 1);
      }
    }
  });

  const links = new Map<string, string[]>();
  pairCounts.forEach((count, pair) => {
    if (count >= 2) {
      const [a, b] = pair.split('|');
      if (!links.has(a)) links.set(a, []);
      if (!links.has(b)) links.set(b, []);
      links.get(a)!.push(b);
      links.get(b)!.push(a);
    }
  });
  return links;
}

// ─── STAGE 3: Generate student intelligence with corroboration ────────────────

export function corroborate(sourcesPresent: string[]): CorroborationScore {
  const sourceCount = sourcesPresent.length;
  // Weight: 1 source = 0.3 (note, not signal), 2 = 0.6, 3+ = 0.8+
  const weight = sourceCount === 0 ? 0
    : sourceCount === 1 ? 0.3
    : sourceCount === 2 ? 0.6
    : Math.min(0.95, 0.6 + (sourceCount - 2) * 0.1);
  return { sourceCount, sourcesAgreeing: sourcesPresent, weight };
}

export function generateStudentIntelligence(
  norm: NormalisedStudent,
  _school: SchoolIntelligence | null,
): StudentIntelligenceRecord {
  const { student } = norm;

  // ── Corroboration per domain ──────────────────────────────────────────────

  // Behaviour concern: behaviour_records, pastoral_notes, communications
  const behSources: string[] = [];
  if (norm.totalBehaviourPoints > 8) behSources.push('behaviour');
  if (norm.highPriorityPastoralCount > 0) behSources.push('pastoral_notes');
  if (norm.urgentCommsCount > 0) behSources.push('communications');
  const behaviourCorroboration = corroborate(behSources);

  // Attendance concern: attendance_records, behaviour_records (punctuality), pastoral_notes
  const attSources: string[] = [];
  if (norm.avgAttendance < 92 && norm.attendanceReadings > 0) attSources.push('attendance');
  if (norm.avgAttendance < 92 && norm.attendanceReadings === 0 && student.attendance_pct != null && student.attendance_pct < 92)
    attSources.push('student_record');
  if (norm.punctualityIssues >= 3) attSources.push('behaviour_punctuality');
  if (norm.highPriorityPastoralCount > 0 && norm.avgAttendance < 95) attSources.push('pastoral_notes');
  // Structured MIS evidence (19 Jul 2026): a persistent-absence flag or a
  // meaningful late-marks count are independent MIS assertions, queryable
  // directly rather than parsed from prose.
  if (norm.attendanceConcernLevel === 'persistent_absence') attSources.push('mis_attendance_flag');
  if (norm.lateMarksTotal >= 10) attSources.push('late_marks');
  const attendanceCorroboration = corroborate(attSources);

  // Safeguarding: safeguarding_records, behaviour_safeguarding_notes, communications
  const safSources: string[] = [];
  if (norm.safeguardingRecordCount > 0) safSources.push('safeguarding_records');
  if (norm.safeguardingNoteCount > 0) safSources.push('behaviour_safeguarding_notes');
  if (norm.urgentCommsCount > 0) safSources.push('communications');
  const safeguardingCorroboration = corroborate(safSources);

  // Wellbeing: pastoral_notes, careers, communications, attendance, assessment
  const wellSources: string[] = [];
  if (norm.highPriorityPastoralCount > 0) wellSources.push('pastoral_notes');
  if (norm.hasCareerRisk || norm.missingCareerData) wellSources.push('careers');
  if (norm.recentCommsCount >= 3) wellSources.push('communications');
  if (norm.avgAttendance < 90) wellSources.push('attendance');
  // Structured attainment evidence (19 Jul 2026): Below Target in 2+ subjects
  // is a queryable cross-curricular decline marker.
  if (norm.belowTargetSubjects.length >= 2) wellSources.push('assessment');
  const wellbeingCorroboration = corroborate(wellSources);

  // ── Risk level (requires corroboration of 2+ sources for amber/red) ───────

  let riskLevel: 'red' | 'amber' | 'green' = 'green';

  const isRedByBehaviour = behaviourCorroboration.sourceCount >= 2 &&
    (norm.totalBehaviourPoints > 25 || norm.incidentCount > 5);
  const isRedByAttendance = norm.avgAttendance < 80;
  // Open concerns drive red; a history of closed-only concerns is context
  // (amber), not live crisis — closed is not treated identically to open.
  const isRedBySafeguarding = safeguardingCorroboration.sourceCount >= 1 &&
    (norm.openSafeguardingCount > 0 || norm.hasCriticalSafeguarding);
  const isRedByMultiDomain = (behaviourCorroboration.weight >= 0.3 ? 1 : 0) +
    (attendanceCorroboration.weight >= 0.3 ? 1 : 0) +
    (safeguardingCorroboration.weight >= 0.3 ? 1 : 0) +
    (wellbeingCorroboration.weight >= 0.3 ? 1 : 0) >= 3;
  const isRedByPupilPremium = student.pupil_premium &&
    (norm.avgAttendance < 85 || norm.totalBehaviourPoints > 15) &&
    behaviourCorroboration.sourceCount + attendanceCorroboration.sourceCount >= 2;

  if (isRedByBehaviour || isRedByAttendance || isRedBySafeguarding ||
      isRedByMultiDomain || norm.urgentPastoralCount > 0 || isRedByPupilPremium) {
    riskLevel = 'red';
  } else {
    const isAmberByBehaviour = behaviourCorroboration.sourceCount >= 2 &&
      norm.totalBehaviourPoints > 8;
    const isAmberByAttendance = attendanceCorroboration.sourceCount >= 2 &&
      norm.avgAttendance < 92;
    const isAmberBySend = student.send_status &&
      student.send_status !== 'N - No SEN' && student.send_status !== 'None' &&
      (behaviourCorroboration.sourceCount >= 1 || attendanceCorroboration.sourceCount >= 1);
    const isAmberByPeers = norm.linkedPeerIds.length >= 2 &&
      behaviourCorroboration.sourceCount >= 1;
    const isAmberByWellbeing = wellbeingCorroboration.sourceCount >= 2;
    // Single-source amber is allowed only for explicit safeguarding records
    // (including closed-only history, which stays visible without implying live risk)
    const isAmberBySafeguarding = norm.safeguardingRecordCount > 0;

    if (isAmberByBehaviour || isAmberByAttendance || isAmberBySend ||
        isAmberByPeers || isAmberByWellbeing || isAmberBySafeguarding) {
      riskLevel = 'amber';
    }
  }

  // ── Signal category ───────────────────────────────────────────────────────

  let signalCategory: 'red' | 'amber' | 'purple' | 'green' | 'blue' | 'grey' = riskLevel;

  // Blue: exceptional, multi-source positive evidence
  if (riskLevel === 'green' && norm.positivePoints >= 20 &&
      norm.incidentCount === 0 && norm.avgAttendance >= 96) {
    signalCategory = 'blue';
  }
  // Grey: insufficient evidence — only one data source, no corroboration across systems.
  // Shows in the queue but signals clearly that there is not enough data to act with confidence.
  if (riskLevel === 'green' && norm.dataSources.length <= 1 && norm.evidenceCount <= 2) {
    signalCategory = 'grey';
  }
  // Purple: hidden decline — positive surface, but pastoral/wellbeing sources raise concern
  if (riskLevel === 'amber' && norm.positivePoints > 0 &&
      norm.avgAttendance >= 90 && norm.totalBehaviourPoints <= 15 &&
      wellbeingCorroboration.sourceCount >= 2) {
    signalCategory = 'purple';
  }

  // ── Risk score (0–100) ────────────────────────────────────────────────────

  const riskScore = Math.min(100,
    (norm.totalBehaviourPoints * 1.5) +
    Math.max(0, (90 - norm.avgAttendance) * 2) +
    // Open concerns carry full weight; closed concerns reduced weight (19 Jul 2026)
    (norm.openSafeguardingCount * 20) +
    (norm.closedSafeguardingCount * 6) +
    (norm.urgentPastoralCount * 10) +
    (norm.linkedPeerIds.length * 3) +
    // Structured MIS evidence
    (norm.attendanceConcernLevel === 'persistent_absence' ? 8 : 0) +
    Math.min(10, norm.lateMarksTotal * 0.5) +
    (norm.belowTargetSubjects.length * 4) +
    (student.pupil_premium ? 5 : 0)
  );

  // ── Confidence score ──────────────────────────────────────────────────────

  const sourceCount = norm.dataSources.length;
  const maxCorroboration = Math.max(
    behaviourCorroboration.weight,
    attendanceCorroboration.weight,
    safeguardingCorroboration.weight,
    wellbeingCorroboration.weight,
  );
  const confidenceScore = Math.min(98, Math.round(
    20 + // base
    sourceCount * 10 + // source diversity
    maxCorroboration * 40 + // corroboration quality
    (norm.evidenceCount > 10 ? 10 : norm.evidenceCount) // volume bonus
  ));

  // ── Key reasons ───────────────────────────────────────────────────────────

  const keyReasons: string[] = [];

  if (norm.totalBehaviourPoints > 8 && behaviourCorroboration.sourceCount >= 2)
    keyReasons.push(`Behaviour: ${norm.totalBehaviourPoints} pts across ${norm.incidentCount} incidents (corroborated by ${behaviourCorroboration.sourcesAgreeing.join(', ')})`);
  else if (norm.totalBehaviourPoints > 20)
    keyReasons.push(`Behaviour: ${norm.totalBehaviourPoints} pts across ${norm.incidentCount} incidents`);

  if (norm.avgAttendance < 92 && attendanceCorroboration.sourceCount >= 1)
    keyReasons.push(`Attendance: ${norm.avgAttendance}% — ${norm.avgAttendance < 80 ? 'persistent absence' : 'below 90% target'}`);

  if (norm.openSafeguardingCount > 0 || norm.safeguardingNoteCount > 0)
    keyReasons.push(`Safeguarding: ${norm.openSafeguardingCount + norm.safeguardingNoteCount} open concern(s) flagged`);

  if (student.send_status && student.send_status !== 'N - No SEN' && student.send_status !== 'None')
    keyReasons.push(`SEND status: ${student.send_status}`);

  if (student.pupil_premium) keyReasons.push('Pupil Premium eligible');

  if (norm.topSubject && norm.subjectConcentration > 0.5 && norm.topSubject[1] >= 3)
    keyReasons.push(`${Math.round(norm.subjectConcentration * 100)}% of incidents in ${norm.topSubject[0]}`);

  if (norm.topPeriod && norm.topPeriod[1] >= 3)
    keyReasons.push(`Repeated incidents in ${norm.topPeriod[0]}`);

  if (norm.linkedPeerIds.length > 0 && behaviourCorroboration.sourceCount >= 1)
    keyReasons.push(`Linked to ${norm.linkedPeerIds.length} peer(s) in repeated incidents`);

  if (norm.punctualityIssues >= 3)
    keyReasons.push(`${norm.punctualityIssues} punctuality issues`);

  if (norm.lateMarksTotal >= 5)
    keyReasons.push(`${norm.lateMarksTotal} late marks recorded by MIS`);

  if (norm.attendanceConcernLevel === 'persistent_absence')
    keyReasons.push('MIS attendance flag: Persistent Absence');

  if (norm.belowTargetSubjects.length >= 2)
    keyReasons.push(`Below target in ${norm.belowTargetSubjects.length} subjects (${norm.belowTargetSubjects.slice(0,3).join(', ')})`);

  if (norm.closedSafeguardingCount > 0 && norm.openSafeguardingCount === 0)
    keyReasons.push(`${norm.closedSafeguardingCount} closed safeguarding record(s) — historical context only`);

  if (norm.highPriorityPastoralCount > 0)
    keyReasons.push(`${norm.highPriorityPastoralCount} high-priority pastoral note(s)`);

  if (norm.hasCareerRisk) keyReasons.push('High careers/destination risk');
  if (norm.missingCareerData) keyReasons.push('No post-16 destination data (Y10/11)');

  if (norm.positivePoints > 20 && riskLevel === 'green')
    keyReasons.push(`${norm.positivePoints} positive points — recognition active`);

  // ── Strengths, barriers, improvements ────────────────────────────────────

  const strengthsList: string[] = [];
  if (norm.positivePoints > 10) strengthsList.push(`${norm.positivePoints} positive points from staff recognition`);
  if (norm.avgAttendance >= 96) strengthsList.push('Excellent attendance');
  else if (norm.avgAttendance >= 92) strengthsList.push('Good attendance record');
  if (norm.incidentCount === 0 && norm.totalBehaviourPoints === 0) strengthsList.push('No behaviour incidents recorded');
  if (norm.careerStrengths) strengthsList.push(norm.careerStrengths);

  const barriersList: string[] = [];
  if (norm.avgAttendance < 90) barriersList.push(`Low attendance (${norm.avgAttendance}%)`);
  if (norm.totalBehaviourPoints > 15) barriersList.push(`High behaviour points (${norm.totalBehaviourPoints})`);
  if (norm.openSafeguardingCount > 0) barriersList.push('Active safeguarding concerns');
  if (norm.belowTargetSubjects.length >= 2) barriersList.push(`Below target in ${norm.belowTargetSubjects.join(', ')}`);
  if (student.send_status && student.send_status !== 'N - No SEN' && student.send_status !== 'None')
    barriersList.push(`SEND: ${student.send_status}`);
  if (norm.careerBarriers) barriersList.push(norm.careerBarriers);
  if (norm.punctualityIssues >= 3) barriersList.push(`Persistent lateness (${norm.punctualityIssues} marks)`);
  if (norm.linkedPeerIds.length > 0) barriersList.push('Negative peer associations detected');

  const improvements: string[] = [];
  if (norm.positivePoints > norm.totalBehaviourPoints && norm.totalBehaviourPoints > 0)
    improvements.push('Positive recognition outweighing concerns');

  // ── Repeated patterns ─────────────────────────────────────────────────────

  const repeatedPatterns: Array<{ type: string; value: unknown; count: number }> = [];
  if (norm.topSubject && norm.topSubject[1] >= 3)
    repeatedPatterns.push({ type: 'subject', value: norm.topSubject[0], count: norm.topSubject[1] });
  if (norm.topPeriod && norm.topPeriod[1] >= 3)
    repeatedPatterns.push({ type: 'period', value: norm.topPeriod[0], count: norm.topPeriod[1] });
  if (norm.topStaff && norm.topStaff[1] >= 3)
    repeatedPatterns.push({ type: 'staff', value: norm.topStaff[0], count: norm.topStaff[1] });
  if (norm.linkedPeerIds.length > 0)
    repeatedPatterns.push({ type: 'peers', value: norm.linkedPeerIds, count: norm.linkedPeerIds.length });

  // ── Suggested next steps ──────────────────────────────────────────────────

  const suggestedNextSteps: Array<{ role: string; action: string; priority: string }> = [];
  if (norm.safeguardingRecordCount > 0 || norm.hasCriticalSafeguarding)
    suggestedNextSteps.push({ role: 'dsl', action: 'Review safeguarding concerns and confirm status', priority: 'urgent' });
  if (norm.avgAttendance < 90)
    suggestedNextSteps.push({ role: 'tutor', action: 'Attendance check-in with student', priority: 'high' });
  if (norm.totalBehaviourPoints > 15 && behaviourCorroboration.sourceCount >= 2)
    suggestedNextSteps.push({ role: 'head_of_year', action: 'Review behaviour pattern and consider intervention', priority: 'high' });
  if (student.send_status && student.send_status !== 'N - No SEN' && student.send_status !== 'None' && riskLevel !== 'green')
    suggestedNextSteps.push({ role: 'sendco', action: 'Review SEND support plan — is current provision meeting need?', priority: 'medium' });
  if (norm.missingCareerData || norm.hasCareerRisk)
    suggestedNextSteps.push({ role: 'careers_lead', action: 'Record destination data and conduct careers conversation', priority: 'medium' });
  if (norm.linkedPeerIds.length >= 2)
    suggestedNextSteps.push({ role: 'head_of_year', action: 'Investigate peer dynamics — consider restorative approach', priority: 'medium' });

  return {
    norm,
    behaviourCorroboration,
    attendanceCorroboration,
    safeguardingCorroboration,
    wellbeingCorroboration,
    riskLevel,
    signalCategory,
    riskScore,
    confidenceScore,
    keyReasons,
    strengthsList,
    barriersList,
    improvements,
    repeatedPatterns,
    suggestedNextSteps,
  };
}

// ─── STAGE 4: Generate cohort intelligence ────────────────────────────────────

export function generateCohortIntelligence(
  records: StudentIntelligenceRecord[],
  beh: BehaviourRow[],
): CohortIntelligence[] {
  const yearGroups = [...new Set(records.map(r => r.norm.student.year_group))];

  return yearGroups.map(yg => {
    const cohortRecords = records.filter(r => r.norm.student.year_group === yg);
    const cohortIds = new Set(cohortRecords.map(r => r.norm.student.id));
    const cohortBeh = beh.filter(b => cohortIds.has(b.student_id) && b.behaviour_points > 0);

    const subjectCounts = new Map<string, number>();
    cohortBeh.forEach(b => { if (b.subject) subjectCounts.set(b.subject, (subjectCounts.get(b.subject) || 0) + 1); });
    const periodCounts = new Map<string, number>();
    cohortBeh.forEach(b => { if (b.lesson_period) periodCounts.set(b.lesson_period, (periodCounts.get(b.lesson_period) || 0) + 1); });

    const hotSubjects = [...subjectCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([subject, count]) => ({ subject, count }));
    const hotPeriods = [...periodCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 3)
      .map(([period, count]) => ({ period, count }));

    const avgBeh = cohortRecords.length > 0
      ? cohortRecords.reduce((s, r) => s + r.norm.totalBehaviourPoints, 0) / cohortRecords.length
      : 0;
    const avgAtt = cohortRecords.length > 0
      ? cohortRecords.reduce((s, r) => s + r.norm.avgAttendance, 0) / cohortRecords.length
      : 95;

    // Peer clusters of ≥ 3 mutually linked students
    const peerClusters: string[][] = [];
    const visited = new Set<string>();
    cohortRecords.forEach(r => {
      if (!visited.has(r.norm.student.id) && r.norm.linkedPeerIds.length >= 2) {
        const cluster = [r.norm.student.id, ...r.norm.linkedPeerIds].slice(0, 6);
        if (cluster.length >= 3) {
          peerClusters.push(cluster);
          cluster.forEach(id => visited.add(id));
        }
      }
    });

    return {
      yearGroup: yg,
      redCount: cohortRecords.filter(r => r.riskLevel === 'red').length,
      amberCount: cohortRecords.filter(r => r.riskLevel === 'amber').length,
      avgBehaviourPoints: Math.round(avgBeh * 10) / 10,
      avgAttendance: Math.round(avgAtt * 10) / 10,
      hotSubjects,
      hotPeriods,
      peerClusters,
    };
  });
}

// ─── STAGE 5: Generate school intelligence ────────────────────────────────────

export function generateSchoolIntelligence(
  records: StudentIntelligenceRecord[],
  cohorts: CohortIntelligence[],
  beh: BehaviourRow[],
): SchoolIntelligence {
  const subjectCounts = new Map<string, number>();
  beh.filter(b => b.behaviour_points > 0 && b.subject).forEach(b => {
    subjectCounts.set(b.subject!, (subjectCounts.get(b.subject!) || 0) + 1);
  });
  const periodCounts = new Map<string, number>();
  beh.filter(b => b.behaviour_points > 0 && b.lesson_period).forEach(b => {
    periodCounts.set(b.lesson_period!, (periodCounts.get(b.lesson_period!) || 0) + 1);
  });

  return {
    schoolAvgBehaviourPoints: records.length > 0
      ? records.reduce((s, r) => s + r.norm.totalBehaviourPoints, 0) / records.length
      : 0,
    schoolAvgAttendance: records.length > 0
      ? records.reduce((s, r) => s + r.norm.avgAttendance, 0) / records.length
      : 95,
    totalRedStudents: records.filter(r => r.riskLevel === 'red').length,
    totalAmberStudents: records.filter(r => r.riskLevel === 'amber').length,
    cohorts,
    globalHotSubjects: [...subjectCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([subject, count]) => ({ subject, count })),
    globalHotPeriods: [...periodCounts.entries()]
      .sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([period, count]) => ({ period, count })),
  };
}

// ─── STAGE 6: Generate signals ────────────────────────────────────────────────

export function generateSignals(
  record: StudentIntelligenceRecord,
  school: SchoolIntelligence,
): Signal[] {
  const signals: Signal[] = [];
  const { norm } = record;
  const sid = norm.student.id;

  // Safeguarding signal — always raised when records exist (single-source allowed).
  // Open and closed concerns are distinguished: closed-only history produces a
  // lower-severity signal that does not demand urgent DSL review.
  if (norm.safeguardingRecordCount > 0 || (norm.safeguardingNoteCount > 0 && record.safeguardingCorroboration.sourceCount >= 2)) {
    const openOnly = norm.openSafeguardingCount > 0;
    signals.push({
      studentId: sid,
      signalType: 'safeguarding',
      severity: norm.hasCriticalSafeguarding ? 'critical' : openOnly ? 'high' : 'low',
      corroboration: record.safeguardingCorroboration,
      narrative: openOnly
        ? `${norm.openSafeguardingCount} open safeguarding concern(s) on record — DSL review required.`
        : `${norm.closedSafeguardingCount} closed safeguarding record(s) — historical context, no live concern flagged.`,
      meta: {
        count: norm.safeguardingRecordCount + norm.safeguardingNoteCount,
        open: norm.openSafeguardingCount,
        closed: norm.closedSafeguardingCount,
      },
    });
  }

  // Attainment decline — structured Below Target evidence in 2+ subjects (19 Jul 2026)
  if (norm.belowTargetSubjects.length >= 2) {
    signals.push({
      studentId: sid,
      signalType: 'attainment_decline',
      severity: norm.belowTargetSubjects.length >= 3 ? 'high' : 'medium',
      corroboration: corroborate(['assessment', ...norm.dataSources.filter(d => d !== 'assessment').slice(0, 2)]),
      narrative: `Below target in ${norm.belowTargetSubjects.length} subjects: ${norm.belowTargetSubjects.join(', ')}.`,
      meta: { subjects: norm.belowTargetSubjects },
    });
  }

  // Behaviour escalation — requires ≥2 sources
  if (record.behaviourCorroboration.sourceCount >= 2 &&
      norm.totalBehaviourPoints > 8) {
    const severity = norm.totalBehaviourPoints > 25 ? 'high' : 'medium';
    signals.push({
      studentId: sid,
      signalType: 'behaviour_escalation',
      severity,
      corroboration: record.behaviourCorroboration,
      narrative: `${norm.totalBehaviourPoints} behaviour points corroborated by ${record.behaviourCorroboration.sourcesAgreeing.join(' + ')}.`,
      meta: { points: norm.totalBehaviourPoints, incidents: norm.incidentCount, topSubject: norm.topSubject },
    });
  }

  // Attendance decline — requires ≥2 sources OR is clearly critical
  if (norm.avgAttendance < 80 || norm.attendanceConcernLevel === 'persistent_absence') {
    signals.push({
      studentId: sid,
      signalType: 'attendance_decline',
      severity: norm.avgAttendance < 80 ? 'critical' : 'high',
      corroboration: record.attendanceCorroboration,
      narrative: `Persistent absence: ${norm.avgAttendance}%`
        + (norm.attendanceConcernLevel === 'persistent_absence' ? ' (MIS flag: Persistent Absence)' : '')
        + (norm.lateMarksTotal > 0 ? `; ${norm.lateMarksTotal} late marks` : '') + '.',
      meta: { attendance: norm.avgAttendance, late_marks: norm.lateMarksTotal, attendance_concern: norm.attendanceConcernLevel },
    });
  } else if (record.attendanceCorroboration.sourceCount >= 2 && norm.avgAttendance < 92) {
    signals.push({
      studentId: sid,
      signalType: 'attendance_decline',
      severity: norm.avgAttendance < 88 ? 'high' : 'medium',
      corroboration: record.attendanceCorroboration,
      narrative: `Attendance ${norm.avgAttendance}% supported by ${record.attendanceCorroboration.sourcesAgreeing.join(' + ')}.`,
      meta: { attendance: norm.avgAttendance },
    });
  }

  // Wellbeing / hidden decline — requires ≥2 sources
  if (record.wellbeingCorroboration.sourceCount >= 2) {
    const isHidden = record.signalCategory === 'purple';
    signals.push({
      studentId: sid,
      signalType: isHidden ? 'hidden_decline' : 'wellbeing_concern',
      severity: isHidden ? 'high' : 'medium',
      corroboration: record.wellbeingCorroboration,
      narrative: isHidden
        ? 'Hidden decline pattern — surface metrics appear stable but pastoral/careers sources raise concern.'
        : `Wellbeing concern from ${record.wellbeingCorroboration.sourcesAgreeing.join(' + ')}.`,
      meta: {},
    });
  }

  // SEND review — requires SEND status + at least one concern source
  if (norm.student.send_status &&
      norm.student.send_status !== 'N - No SEN' &&
      norm.student.send_status !== 'None' &&
      (record.behaviourCorroboration.sourceCount >= 1 || record.attendanceCorroboration.sourceCount >= 1)) {
    signals.push({
      studentId: sid,
      signalType: 'send_review',
      severity: 'medium',
      corroboration: corroborate(['send_status', ...norm.dataSources.slice(0, 2)]),
      narrative: `SEND student (${norm.student.send_status}) with concurrent pastoral concerns — provision review needed.`,
      meta: { sendStatus: norm.student.send_status },
    });
  }

  // Careers gap — requires year group + missing/risk data + at least one other source
  if ((norm.missingCareerData || norm.hasCareerRisk) && norm.dataSources.length >= 2) {
    signals.push({
      studentId: sid,
      signalType: 'careers_gap',
      severity: 'low',
      corroboration: corroborate(['careers', ...norm.dataSources.filter(s => s !== 'careers').slice(0, 1)]),
      narrative: norm.missingCareerData
        ? 'No post-16 destination data for Y10/Y11 student.'
        : 'High destination risk flagged.',
      meta: { missingCareerData: norm.missingCareerData, hasCareerRisk: norm.hasCareerRisk },
    });
  }

  // Positive / exceptional signals — requires multi-source evidence of success
  if (record.signalCategory === 'blue') {
    signals.push({
      studentId: sid,
      signalType: 'exceptional_achievement',
      severity: 'low',
      corroboration: corroborate(['behaviour', 'attendance']),
      narrative: `Exceptional positive: ${norm.positivePoints} praise points, ${norm.avgAttendance}% attendance, zero incidents.`,
      meta: { positivePoints: norm.positivePoints, attendance: norm.avgAttendance },
    });
  } else if (record.riskLevel === 'green' && norm.positivePoints > 15) {
    signals.push({
      studentId: sid,
      signalType: 'positive_progress',
      severity: 'low',
      corroboration: corroborate(['behaviour']),
      narrative: `Positive progress: ${norm.positivePoints} praise points.`,
      meta: { positivePoints: norm.positivePoints },
    });
  }

  // Peer cluster — requires behaviour + ≥2 linked peers
  if (norm.linkedPeerIds.length >= 2 && record.behaviourCorroboration.sourceCount >= 1) {
    signals.push({
      studentId: sid,
      signalType: 'peer_cluster',
      severity: 'medium',
      corroboration: corroborate(['behaviour', 'peer_co_involvement']),
      narrative: `Repeatedly co-involved in incidents with ${norm.linkedPeerIds.length} other student(s).`,
      meta: { peerCount: norm.linkedPeerIds.length },
    });
  }

  // Override school average — single source OK if significantly above school mean
  const schoolAvg = school.schoolAvgBehaviourPoints;
  if (schoolAvg > 0 && norm.totalBehaviourPoints > schoolAvg * 3 &&
      record.behaviourCorroboration.sourceCount === 1 &&
      !signals.some(s => s.signalType === 'behaviour_escalation')) {
    signals.push({
      studentId: sid,
      signalType: 'behaviour_escalation',
      severity: 'medium',
      corroboration: corroborate(['behaviour']),
      narrative: `${norm.totalBehaviourPoints} pts is ${Math.round(norm.totalBehaviourPoints / schoolAvg)}x the school average (single source).`,
      meta: { points: norm.totalBehaviourPoints, schoolAvg },
    });
  }

  return signals;
}

// ─── STAGE 7: Generate actions from signals ───────────────────────────────────

export function generateActions(
  signals: Signal[],
  record: StudentIntelligenceRecord,
  schoolId: string,
): GeneratedAction[] {
  const actions: GeneratedAction[] = [];
  const { norm } = record;
  const sid = norm.student.id;
  const baseAtt = norm.avgAttendance;
  const baseBeh = norm.totalBehaviourPoints;
  const meta = { student_id: sid, school_id: schoolId, assigned_to_user_id: null as null,
    status: 'suggested' as const, source: 'auto' as const, outcome: null,
    created_by: 'Student Signal Intelligence',
    baseline_attendance: baseAtt, baseline_behaviour: baseBeh };

  for (const signal of signals) {
    switch (signal.signalType) {
      case 'safeguarding':
        actions.push({ ...meta,
          assigned_to: 'Mr Ahmed (DSL)', assigned_role: 'dsl',
          action_type: 'Safeguarding review',
          priority: signal.severity === 'critical' ? 'urgent' : 'urgent',
          due_date: addDays(1),
          notes: `${signal.narrative} Formal DSL acknowledgement and CPOMS record required.`,
          reason: signal.narrative,
        });
        break;

      case 'behaviour_escalation':
        if (norm.totalBehaviourPoints > 15) {
          actions.push({ ...meta,
            assigned_to: resolveHOYName(norm.student.year_group), assigned_role: 'head_of_year',
            action_type: 'Behaviour review meeting',
            priority: norm.totalBehaviourPoints > 30 ? 'urgent' : 'high',
            due_date: addDays(signal.severity === 'high' ? 3 : 5),
            notes: `${signal.narrative}${norm.topSubject ? ` Focus area: ${norm.topSubject[0]}.` : ''}${norm.topPeriod ? ` Peak period: ${norm.topPeriod[0]}.` : ''}`,
            reason: signal.narrative,
          });
        } else {
          actions.push({ ...meta,
            assigned_to: 'Mr Patel (Tutor)', assigned_role: 'tutor',
            action_type: 'Pastoral check-in',
            priority: 'medium',
            due_date: addDays(5),
            notes: `${signal.narrative} Tutor to explore any underlying issues before concerns escalate.`,
            reason: signal.narrative,
          });
        }
        break;

      case 'attendance_decline':
        actions.push({ ...meta,
          assigned_to: resolveHOYName(norm.student.year_group), assigned_role: 'head_of_year',
          action_type: 'Attendance intervention',
          priority: norm.avgAttendance < 80 ? 'urgent' : 'high',
          due_date: addDays(norm.avgAttendance < 80 ? 1 : 2),
          notes: `${signal.narrative}${norm.avgAttendance < 80 ? ' Persistent absence threshold breached — formal action and parent contact required.' : ' Monitoring plan and parent contact required.'}`,
          reason: signal.narrative,
        });
        break;

      case 'wellbeing_concern':
      case 'hidden_decline':
        actions.push({ ...meta,
          assigned_to: 'Mrs Thompson (Pastoral)', assigned_role: 'pastoral_lead',
          action_type: signal.signalType === 'hidden_decline' ? 'Pastoral wellbeing check' : 'Pastoral check-in',
          priority: signal.signalType === 'hidden_decline' ? 'high' : 'medium',
          due_date: addDays(signal.signalType === 'hidden_decline' ? 3 : 5),
          notes: `${signal.narrative} Sources flagging concern: ${signal.corroboration.sourcesAgreeing.join(', ')}.`,
          reason: signal.narrative,
        });
        break;

      case 'send_review':
        actions.push({ ...meta,
          assigned_to: 'Ms Jones (SENDCo)', assigned_role: 'sendco',
          action_type: 'SEND support review',
          priority: 'medium',
          due_date: addDays(5),
          notes: `${signal.narrative} Review whether current provision is meeting need given concurrent pastoral concerns.`,
          reason: signal.narrative,
        });
        break;

      case 'careers_gap':
        if (record.riskLevel !== 'green' || norm.dataSources.length >= 3) {
          actions.push({ ...meta,
            assigned_to: 'Ms Brown (Careers)', assigned_role: 'careers_lead',
            action_type: 'Careers destination review',
            priority: 'medium',
            due_date: addDays(7),
            notes: `${signal.narrative} Careers conversation needed to record destination intent and identify any support required.`,
            reason: signal.narrative,
          });
        }
        break;

      case 'peer_cluster':
        actions.push({ ...meta,
          assigned_to: resolveHOYName(norm.student.year_group), assigned_role: 'head_of_year',
          action_type: 'Peer group investigation',
          priority: 'medium',
          due_date: addDays(5),
          notes: `${signal.narrative} Investigate peer dynamics — consider seating changes, scheduling review, or restorative intervention.`,
          reason: signal.narrative,
        });
        break;

      case 'exceptional_achievement':
      case 'positive_progress':
        actions.push({ ...meta,
          assigned_to: resolveHOYName(norm.student.year_group), assigned_role: 'head_of_year',
          action_type: 'Recognition and celebration',
          priority: 'low',
          due_date: addDays(7),
          notes: `${signal.narrative} Consider assembly recognition, positive postcard home, or achievement award.`,
          reason: signal.narrative,
        });
        break;
    }
  }

  return actions;
}

// ─── STAGE 8: Assign actions (resolve real user IDs when available) ───────────
// Currently a pass-through — when profiles table contains real staff linked to
// roles, this stage would query profiles to populate assigned_to_user_id.

/** Map an action's assigned_role to the routing signal family. */
export function routingContextForAction(
  action: GeneratedAction,
  student: StudentRow,
): RoutingContext {
  const role = action.assigned_role;
  const signalType =
    role === 'dsl' ? 'safeguarding'
    : role === 'sendco' ? 'send_related'
    : role === 'careers_lead' ? 'careers'
    : /attendance/i.test(action.action_type) ? 'attendance'
    : 'behaviour';
  // Subject-specific actions carry the subject in their reason text as
  // "in <Subject>" — extract when present so routing can hit department staff.
  const subjMatch = /\bin ([A-Z][A-Za-z ]{2,24})(?:\.|,|$)/.exec(action.reason || '');
  return {
    student: {
      id: student.id, name: student.name,
      year_group: student.year_group, form: student.form ?? null,
      send_status: student.send_status ?? null,
    },
    signalType,
    severity: action.priority,
    actionType: action.action_type,
    subject: subjMatch ? subjMatch[1].trim() : null,
    cohortLevel: false,
  };
}

/**
 * Resolve every action to an actual authorised user (19 Jul 2026).
 * Without profiles (demo mode / tests without staff), the legacy behaviour is
 * preserved: assigned_to keeps its role-derived display name and
 * assigned_to_user_id stays null.
 */
export function assignActions(
  actions: GeneratedAction[],
  _schoolId: string,
  students?: StudentRow[],
  profiles?: ProfileLite[],
  workload?: Record<string, number>,
): GeneratedAction[] {
  if (!profiles || profiles.length === 0 || !students) return actions;
  const studentById = new Map(students.map(st => [st.id, st]));
  return actions.map(action => {
    const student = studentById.get(action.student_id);
    if (!student) return action;
    const ctx = routingContextForAction(action, student);
    const resolution = routeOwner(profiles, ctx, workload);
    // If no matching profile exists yet (unresolved, non-safeguarding):
    // preserve the role-derived display name (e.g. "Year 10 Head of Year")
    // and leave user_id null. The UI will show "Awaiting: Year 10 Head of Year"
    // and the next analysis run after the user is added will resolve the UUID.
    if (resolution.unresolved && action.assigned_role !== 'dsl' && action.assigned_role !== 'admin') {
      return {
        ...action,
        // Keep the original role-derived name, don't replace with admin name
        assigned_to: action.assigned_to,
        assigned_to_user_id: null,
      };
    }
    return {
      ...action,
      assigned_to: resolution.assignedToName ?? action.assigned_to,
      assigned_to_user_id: resolution.assignedToUserId,
    };
  });
}

// ─── STAGE 9: Build analysis_result rows ─────────────────────────────────────

export function buildAnalysisRow(
  record: StudentIntelligenceRecord,
  signals: Signal[],
  schoolId: string,
): Record<string, unknown> {
  const { norm } = record;

  const behaviourTrend = norm.totalBehaviourPoints > 25 ? 'Escalating'
    : norm.totalBehaviourPoints > 12 ? 'Concerning'
    : norm.totalBehaviourPoints > 5 ? 'Emerging' : 'Stable';

  const attendanceTrend = norm.avgAttendance < 80 ? 'Critical decline'
    : norm.avgAttendance < 88 ? 'Declining'
    : norm.avgAttendance < 93 ? 'Below target' : 'On track';

  const suggestedPastoral = record.riskLevel === 'red'
    ? 'Immediate pastoral meeting required'
    : record.riskLevel === 'amber' ? 'Schedule pastoral check-in within 5 days'
    : 'Continue routine monitoring';

  const suggestedParent = record.riskLevel === 'red'
    ? 'Contact parent/carer today — share concerns and agree a support plan'
    : (record.riskLevel === 'amber' && norm.avgAttendance < 90) ? 'Parent contact recommended regarding attendance'
    : null;

  const suggestedStaff = norm.safeguardingRecordCount > 0
    ? 'DSL must review safeguarding concerns immediately'
    : record.riskLevel === 'red' ? 'Inform Head of Year, consider DSL referral'
    : (record.riskLevel === 'amber' && norm.topSubject) ? `Alert ${norm.topSubject[0]} department — review classroom strategies`
    : null;

  const careerSignposting = norm.missingCareerData
    ? 'Careers lead to record post-16 destination and aspirations urgently'
    : norm.hasCareerRisk ? 'Careers conversation needed — link attendance/behaviour to future goals'
    : null;

  const reviewDate = new Date();
  reviewDate.setDate(reviewDate.getDate() + (record.riskLevel === 'red' ? 3 : record.riskLevel === 'amber' ? 7 : 14));

  const signalExplanation = composeSignalExplanation({
    studentName: norm.student.name,
    riskLevel: record.riskLevel,
    signalCategory: record.signalCategory,
    behaviourTrend,
    attendanceTrend,
    keyReasons: record.keyReasons,
    subjectsInvolved: norm.subjects.slice(0, 5),
    periodsInvolved: norm.periods.slice(0, 5),
    suggestedPastoralAction: suggestedPastoral,
    suggestedParentContact: suggestedParent,
    suggestedStaffAction: suggestedStaff,
    sendStatus: norm.student.send_status,
    pupilPremium: norm.student.pupil_premium,
    incidentCount: norm.incidentCount,
    totalPoints: norm.totalBehaviourPoints,
    avgAttendance: norm.avgAttendance,
    safeguardingCount: norm.safeguardingRecordCount + norm.safeguardingNoteCount,
    positivePoints: norm.positivePoints,
  });

  return {
    student_id: norm.student.id,
    school_id: schoolId,
    risk_level: record.riskLevel,
    signal_category: record.signalCategory,  // 'red'|'amber'|'purple'|'green'|'blue'|'grey'
    risk_score: record.riskScore,
    key_reasons: record.keyReasons,
    behaviour_trend: behaviourTrend,
    attendance_trend: attendanceTrend,
    subjects_involved: norm.subjects.slice(0, 5),
    periods_involved: norm.periods.slice(0, 5),
    suggested_pastoral_action: suggestedPastoral,
    suggested_parent_contact: suggestedParent,
    suggested_staff_action: suggestedStaff,
    career_signposting: careerSignposting,
    recommended_review_date: reviewDate.toISOString().split('T')[0],
    signal_explanation: signalExplanation,
    strengths: record.strengthsList.join('; ') || null,
    barriers: record.barriersList.join('; ') || null,
    recent_improvements: record.improvements.join('; ') || null,
    repeated_patterns: record.repeatedPatterns,
    linked_peers: norm.linkedPeerIds,
    suggested_next_steps: record.suggestedNextSteps,
    evidence_count: norm.evidenceCount,
    data_sources: norm.dataSources,
    confidence_score: record.confidenceScore,
    // Store which signals fired and their corroboration for transparency
    signal_types: signals.map(s => s.signalType),
  };
}

// ─── HYPOTHESIS INTEGRATION (RE-AUTHORED 19 Jul 2026) ─────────────────────────

/**
 * Build the hypothesis engine input for one normalised student from the raw
 * records retained during normalisation. Positive behaviour is excluded
 * before it reaches the hypothesis timeline (defence in depth: the timeline
 * builder also guards).
 */
export function buildHypothesisInput(norm: NormalisedStudent): HypothesisInput {
  return {
    studentId: norm.student.id,
    studentName: norm.student.name,
    yearGroup: norm.student.year_group,
    sendStatus: norm.student.send_status,
    pupilPremium: norm.student.pupil_premium,
    behaviourRecords: norm.rawBehaviour
      .filter(b => b.behaviour_class !== 'positive')
      .map(b => ({
        date: b.date,
        incident_type: b.incident_type,
        behaviour_points: b.behaviour_points,
        subject: b.subject,
        lesson_period: b.lesson_period,
        staff_member: b.staff_member,
        comment: b.comment,
        source: b.source_system ?? null,
        behaviour_class: b.behaviour_class ?? null,
      })),
    attendanceRecords: norm.rawAttendance.map(a => ({
      record_date: a.record_date,
      attendance_percentage: a.attendance_percentage,
      late_marks: a.late_marks ?? null,
      attendance_concern: a.attendance_concern ?? null,
    })),
    pastoralNotes: norm.rawPastoral.map(p => ({
      note_date: p.note_date,
      note: p.note,
      priority: p.priority,
      staff_member: p.entered_by ?? null,
      source: null,
    })),
    quickNotes: [],
    communications: norm.rawComms.map(c => ({
      date: c.date,
      summary: c.summary,
      priority: c.priority,
      source: null,
      staff_member: null,
    })),
    safeguardingRecords: norm.rawSafeguarding.map(sg => ({
      incident_date: sg.incident_date,
      incident_type: sg.incident_type,
      summary: sg.summary,
      severity: sg.severity,
      category: sg.category ?? null,
      subcategory: sg.subcategory ?? null,
      status: sg.status ?? null,
      assigned_to: sg.assigned_to ?? null,
    })),
  };
}

// ─── SINGLE CANONICAL ENTRY POINT ─────────────────────────────────────────────

export interface EngineInput {
  schoolId: string;
  students: StudentRow[];
  behaviour: BehaviourRow[];
  attendance: AttendanceRow[];
  safeguarding: SafeguardingRow[];
  pastoral: PastoralRow[];
  careers: CareerRow[];
  communications: CommunicationRow[];
  assessments: AssessmentRow[];
  /** Existing interventions (basic shape) — used by contextual/reward intelligence. */
  interventions?: InterventionRow[];
  /** Rich interventions with outcome fields — used by longitudinal memory. */
  richInterventions?: RichInterventionRow[];
  /** School staff profiles — enables routing of actions to real user ids (19 Jul 2026). */
  profiles?: ProfileLite[];
  /** Open-action counts by user id — lets routing prefer less-loaded owners. */
  openActionCounts?: Record<string, number>;
}

export interface StudentAnalysis {
  studentId: string;
  studentName: string;
  intelligence: StudentIntelligenceRecord;
  signals: Signal[];
  hypotheses: EvidenceBundle;
  analysisRow: Record<string, unknown>;
  actions: GeneratedAction[];
  memory: LongitudinalMemory;
}

export interface EngineOutput {
  schoolId: string;
  school: SchoolIntelligence;
  cohorts: CohortIntelligence[];
  students: StudentAnalysis[];
  analysisRows: Array<Record<string, unknown>>;
  actions: GeneratedAction[];
  studentUpdates: Array<{ id: string; patch: Record<string, unknown> }>;
  /** Contextual & reward-pattern intelligence (19 Jul 2026). */
  context: ContextIntelligence;
  /** Assignment notifications for newly generated actions (empty without profiles). */
  notifications: NotificationPayload[];
}

/**
 * The one and only analysis pipeline. Both the frontend adapter and the
 * run-analysis edge function call this — neither implements scoring locally.
 * Deterministic for a given input (no randomness, no wall-clock reads other
 * than relative review-date offsets computed from the run moment).
 */
export function runEngine(input: EngineInput): EngineOutput {
  // Staging mirrors the original 9 July pipeline exactly (two-pass student
  // intelligence so school context can inform above-average detection),
  // with assessments added as a structured input.
  const peerLinksMap = buildPeerLinks(input.behaviour);

  const normalised = normaliseStudents(
    input.students, input.behaviour, input.attendance, input.safeguarding,
    input.pastoral, input.careers, input.communications, peerLinksMap,
    input.assessments,
  );

  // Pass 1: no school context
  const firstPass = normalised.map(n => generateStudentIntelligence(n, null));
  const cohorts = generateCohortIntelligence(firstPass, input.behaviour);
  const school = generateSchoolIntelligence(firstPass, cohorts, input.behaviour);
  // Pass 2: with school context
  const finalRecords = normalised.map(n => generateStudentIntelligence(n, school));

  // Contextual & reward-pattern intelligence (19 Jul 2026)
  const context = analyseContext(input.students, input.behaviour, input.interventions ?? []);
  const rewardByStudent = new Map(context.rewardFindings.map(f => [f.studentId, f]));
  const conflictsByStudent = new Map<string, typeof context.contextConflicts>();
  for (const c of context.contextConflicts) {
    if (!conflictsByStudent.has(c.studentId)) conflictsByStudent.set(c.studentId, []);
    conflictsByStudent.get(c.studentId)!.push(c);
  }

  const students: StudentAnalysis[] = [];
  const analysisRows: Array<Record<string, unknown>> = [];
  const allActions: GeneratedAction[] = [];
  const studentUpdates: Array<{ id: string; patch: Record<string, unknown> }> = [];

  for (const intelligence of finalRecords) {
    const norm = intelligence.norm;
    const signals = generateSignals(intelligence, school);

    // Reward-pattern signal (cautious, review-oriented — never an accusation)
    const reward = rewardByStudent.get(norm.student.id);
    if (reward && reward.classification !== 'sustained_improvement') {
      signals.push({
        studentId: norm.student.id,
        signalType: 'reward_pattern',
        severity: reward.classification === 'reward_burst_short_term' ? 'medium' : 'low',
        corroboration: corroborate(['behaviour', 'reward_timing']),
        narrative: reward.narrative,
        meta: { classification: reward.classification, evidence: reward.evidence },
      });
    }
    // Single-context conflict signal
    for (const conflict of conflictsByStudent.get(norm.student.id) ?? []) {
      signals.push({
        studentId: norm.student.id,
        signalType: 'context_pattern',
        severity: 'medium',
        corroboration: corroborate(['behaviour', 'context_concentration']),
        narrative: conflict.narrative,
        meta: {
          context: conflict.context,
          sanctionsInContext: conflict.sanctionsInContext,
          rewardsInContext: conflict.rewardsInContext,
          sanctionsElsewhere: conflict.sanctionsElsewhere,
        },
      });
    }
    const hypotheses = generateHypotheses(buildHypothesisInput(norm));
    const actions = assignActions(
      generateActions(signals, intelligence, input.schoolId),
      input.schoolId,
      input.students,
      input.profiles,
      input.openActionCounts,
    );
    // Re-compose the signal explanation using hypothesis data to answer all 10 questions.
    const baseRow = buildAnalysisRow(intelligence, signals, input.schoolId);
    const ph = hypotheses.primaryHypothesis;
    const evidenceSourceList = norm.dataSources.slice(0, 4);
    const enhancedExplanation = composeSignalExplanation({
      studentName: norm.student.name,
      riskLevel: intelligence.riskLevel as 'red' | 'amber' | 'green',
      signalCategory: intelligence.signalCategory,
      behaviourTrend: baseRow['behaviour_trend'] as string | undefined,
      attendanceTrend: baseRow['attendance_trend'] as string | undefined,
      keyReasons: intelligence.keyReasons as string[],
      subjectsInvolved: norm.subjects.slice(0, 5),
      periodsInvolved: norm.periods.slice(0, 5),
      suggestedPastoralAction: baseRow['suggested_pastoral_action'] as string | null,
      suggestedParentContact: baseRow['suggested_parent_contact'] as string | null,
      suggestedStaffAction: baseRow['suggested_staff_action'] as string | null,
      sendStatus: norm.student.send_status,
      pupilPremium: norm.student.pupil_premium,
      incidentCount: norm.incidentCount,
      totalPoints: norm.totalBehaviourPoints,
      avgAttendance: norm.avgAttendance,
      safeguardingCount: norm.safeguardingRecordCount + norm.safeguardingNoteCount,
      positivePoints: norm.positivePoints,
      // 10-question intelligence fields
      primaryHypothesisHeadline: ph?.headline ?? null,
      primaryHypothesisNarrative: ph?.narrative ?? null,
      primaryHypothesisConfidence: ph?.confidence ?? null,
      primaryHypothesisConfidenceReason: ph?.confidenceReason ?? null,
      predictedEscalation: ph?.predictedEscalation ?? null,
      hypothesisRecommendedAction: ph?.recommendedAction ?? null,
      hypothesisRecommendedRole: ph?.recommendedRole ?? null,
      evidenceSummary: evidenceSourceList.length > 0
        ? `${evidenceSourceList.length} source${evidenceSourceList.length > 1 ? 's' : ''}: ${evidenceSourceList.map(s => s.replace(/_/g,' ')).join(', ')}`
        : null,
    });

    const analysisRow = {
      ...baseRow,
      signal_explanation: enhancedExplanation,
      // Evidence traceability: the hypotheses (with confidence + supporting
      // events) travel with the analysis row so a DSL can open a signal and
      // see exactly why it was generated.
      hypotheses: {
        primary: hypotheses.primaryHypothesis,
        all: hypotheses.hypotheses,
        independent_observers: hypotheses.independentObservers,
        day_span: hypotheses.daySpan,
        source_count: hypotheses.sourceCount,
      },
    };

    // Longitudinal memory: all four timelines
    const memory = buildLongitudinalMemory(
      norm.student.id,
      norm.student.name,
      input.attendance,
      input.behaviour,
      (input.richInterventions ?? []),
      (input.richInterventions ?? []),
      input.attendance,
      signals.map(s => s.signalType),
      norm.student.attendance_pct,
    );

    // Enhance the signal explanation with longitudinal memory
    if (memory.memoryNarrative) {
      (analysisRow as Record<string, unknown>)['memory_narrative']   = memory.memoryNarrative;
      (analysisRow as Record<string, unknown>)['trajectory']         = memory.trajectoryDirection;
      (analysisRow as Record<string, unknown>)['trajectory_text']    = memory.trajectoryNarrative;
      (analysisRow as Record<string, unknown>)['intervention_count'] = memory.outcomeAnalysis.totalInterventions;
      (analysisRow as Record<string, unknown>)['recurrence_count']   = memory.recurrenceCount;
      // Append memory to the signal_explanation so it shows up in the signal card
      if (memory.memoryNarrative.length > 20) {
        const existing = (analysisRow as Record<string, unknown>)['signal_explanation'] as string ?? '';
        (analysisRow as Record<string, unknown>)['signal_explanation'] = existing + ' ' + memory.memoryNarrative;
      }
    }

    students.push({
      studentId: norm.student.id,
      studentName: norm.student.name,
      intelligence, signals, hypotheses, analysisRow, actions, memory,
    });
    analysisRows.push(analysisRow);
    allActions.push(...actions);
    studentUpdates.push({
      id: norm.student.id,
      patch: {
        attendance_pct: norm.avgAttendance,
        behaviour_score: norm.totalBehaviourPoints,
        risk_level: intelligence.riskLevel,
        signal_category: intelligence.signalCategory,
        positive_points: norm.positivePoints,
        punctuality_issues: norm.punctualityIssues,
      },
    });
  }

  // Assignment notifications for routed actions (only when profiles supplied).
  const notifications: NotificationPayload[] = [];
  if (input.profiles && input.profiles.length > 0) {
    const studentById = new Map(input.students.map(st => [st.id, st]));
    for (const action of allActions) {
      if (!action.assigned_to_user_id) continue;
      const student = studentById.get(action.student_id);
      if (!student) continue;
      const ctx = routingContextForAction(action, student);
      const resolution = routeOwner(input.profiles, ctx, input.openActionCounts);
      notifications.push(...routeNotifications(input.schoolId, ctx, resolution, action.notes || action.action_type));
    }
  }

  return { schoolId: input.schoolId, school, cohorts, students, analysisRows, actions: allActions, studentUpdates, context, notifications };
}
