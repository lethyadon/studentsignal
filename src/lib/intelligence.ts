import type { Student, AnalysisResult, Communication, Intervention } from '../types';
import type { AppRole } from './permissions';

export type UrgencyLevel = 'critical' | 'high' | 'medium' | 'low';

export type NextAction = {
  id: string;
  roles: AppRole[];
  action: string;
  urgency: UrgencyLevel;
  sourceType: 'communication' | 'intervention' | 'attendance' | 'behaviour' | 'send' | 'pattern';
  detail?: string;
};

export type DataDriver = {
  type: string;
  label: string;
  value: string;
  severity: UrgencyLevel;
  date?: string;
};

export type StudentIntelligence = {
  nextActions: NextAction[];
  dataDrivers: DataDriver[];
  computedRiskLevel: 'red' | 'amber' | 'green';
  pendingRoutingCount: number;
  hasDSLFlag: boolean;
  hasEscalation: boolean;
  recentActivityCount: number;
};

const DAY_MS = 86_400_000;

export function computeStudentIntelligence(
  student: Student,
  comms: Communication[],
  interventions: Intervention[],
): StudentIntelligence {
  const now  = new Date();
  const today = now.toISOString().slice(0, 10);
  const cut14 = new Date(now.getTime() - 14 * DAY_MS);
  const cut30 = new Date(now.getTime() - 30 * DAY_MS);

  const nextActions: NextAction[] = [];
  const dataDrivers: DataDriver[] = [];

  // ── Communications ────────────────────────────────────────────────────────

  const recentComms  = comms.filter(c => new Date(c.date) >= cut30);
  const pendingComms = recentComms.filter(c => c.routing_status === 'pending_review');
  const last14Comms  = comms.filter(c => new Date(c.date) >= cut14);
  const urgentComms  = recentComms.filter(c => c.priority === 'urgent');
  const dslRoutedComms = recentComms.filter(c =>
    c.routing_status === 'routed' &&
    (c.suggested_assignee?.toLowerCase().includes('dsl') ||
     c.suggested_assignee?.toLowerCase().includes('ahmed'))
  );
  const externalComms = recentComms.filter(c => c.source === 'external_agency');

  if (pendingComms.length > 0) {
    nextActions.push({
      id: 'pending_routing',
      roles: ['admin', 'slt', 'pastoral_lead', 'head_of_year'],
      action: `${pendingComms.length} communication${pendingComms.length > 1 ? 's' : ''} awaiting routing — review on the Communications page`,
      urgency: 'high',
      sourceType: 'communication',
      detail: 'Logged by reception/staff — needs assigning to the right person',
    });
    dataDrivers.push({ type: 'pending_routing', label: 'Pending routing', value: `${pendingComms.length} unrouted`, severity: 'high' });
  }

  if (last14Comms.length >= 3) {
    nextActions.push({
      id: 'comm_escalation',
      roles: ['admin', 'slt', 'dsl', 'head_of_year', 'pastoral_lead'],
      action: `${last14Comms.length} contacts in the last 14 days — escalation pattern. Consider a pastoral case review or multi-agency referral`,
      urgency: 'high',
      sourceType: 'pattern',
      detail: 'Repeat contact is a key risk indicator',
    });
    dataDrivers.push({ type: 'comm_volume', label: 'Contact volume', value: `${last14Comms.length} in 14 days`, severity: 'high' });
  }

  if (urgentComms.length > 0) {
    nextActions.push({
      id: 'urgent_comm',
      roles: ['admin', 'slt', 'dsl', 'head_of_year', 'pastoral_lead'],
      action: `Urgent communication logged — verify a follow-up action has been created and assigned`,
      urgency: 'critical',
      sourceType: 'communication',
      detail: urgentComms[0].summary,
    });
    dataDrivers.push({
      type: 'urgent_comm',
      label: 'Urgent contact',
      value: urgentComms[0].summary.slice(0, 70) + (urgentComms[0].summary.length > 70 ? '…' : ''),
      severity: 'critical',
      date: urgentComms[0].date,
    });
  }

  if (dslRoutedComms.length > 0) {
    nextActions.push({
      id: 'dsl_referral',
      roles: ['dsl', 'admin', 'slt'],
      action: `Communication routed to DSL — review safeguarding concern and update CPOMS if required`,
      urgency: 'critical',
      sourceType: 'communication',
      detail: dslRoutedComms[0].summary,
    });
    dataDrivers.push({
      type: 'dsl_flag',
      label: 'DSL referral',
      value: 'Safeguarding concern',
      severity: 'critical',
      date: dslRoutedComms[0].date,
    });
  }

  if (externalComms.length > 0) {
    nextActions.push({
      id: 'external_agency',
      roles: ['dsl', 'admin', 'slt', 'head_of_year'],
      action: `External agency contact on record — ensure all agencies are co-ordinated and a lead professional is designated`,
      urgency: 'high',
      sourceType: 'communication',
      detail: `${externalComms.length} external contact(s) logged`,
    });
  }

  // ── Interventions ─────────────────────────────────────────────────────────

  const activeInts    = interventions.filter(i => !['completed', 'cancelled', 'closed'].includes(i.status));
  const overdueInts   = activeInts.filter(i => i.review_date && i.review_date < today);
  const escalatedInts = interventions.filter(i => i.status === 'escalated');
  const urgentInts    = activeInts.filter(i => i.priority === 'urgent' || i.priority === 'high');

  if (escalatedInts.length > 0) {
    nextActions.push({
      id: 'escalated',
      roles: ['admin', 'slt', 'dsl'],
      action: `${escalatedInts.length} escalated action${escalatedInts.length > 1 ? 's' : ''} — SLT or DSL sign-off required before progressing`,
      urgency: 'critical',
      sourceType: 'intervention',
      detail: escalatedInts[0].action_type,
    });
    dataDrivers.push({ type: 'escalation', label: 'Escalated action', value: escalatedInts[0].action_type, severity: 'critical' });
  }

  if (overdueInts.length > 0) {
    nextActions.push({
      id: 'overdue',
      roles: ['admin', 'slt', 'head_of_year', 'pastoral_lead', 'tutor'],
      action: `${overdueInts.length} intervention review${overdueInts.length > 1 ? 's' : ''} overdue — complete or reschedule`,
      urgency: 'high',
      sourceType: 'intervention',
      detail: `Review due: ${overdueInts[0].review_date}`,
    });
    dataDrivers.push({ type: 'overdue', label: 'Overdue review', value: `${overdueInts.length} overdue`, severity: 'high' });
  }

  if (urgentInts.length > 0 && !escalatedInts.length) {
    nextActions.push({
      id: 'urgent_action',
      roles: ['admin', 'slt', 'dsl', 'head_of_year', 'pastoral_lead'],
      action: `${urgentInts.length} high/urgent priority action${urgentInts.length > 1 ? 's' : ''} open — confirm these are actively being worked`,
      urgency: 'high',
      sourceType: 'intervention',
    });
  }

  if (activeInts.length === 0 && (student.risk_level === 'red' || student.risk_level === 'amber')) {
    nextActions.push({
      id: 'no_action',
      roles: ['admin', 'slt', 'head_of_year', 'pastoral_lead', 'tutor'],
      action: `Student flagged at ${student.risk_level === 'red' ? 'high' : 'medium'} risk with no active intervention — create a pastoral action`,
      urgency: student.risk_level === 'red' ? 'critical' : 'high',
      sourceType: 'intervention',
    });
  }

  // ── Attendance & behaviour ─────────────────────────────────────────────────

  const att = student.attendance_pct ?? 95;
  const beh = student.behaviour_score ?? 0;

  if (att < 80) {
    nextActions.push({
      id: 'pa_threshold',
      roles: ['admin', 'slt', 'head_of_year', 'pastoral_lead'],
      action: `Persistent absence: ${att}% — below 80% threshold. Attendance panel referral or formal notice required`,
      urgency: 'critical',
      sourceType: 'attendance',
    });
    dataDrivers.push({ type: 'attendance', label: 'Attendance', value: `${att}%`, severity: 'critical' });
  } else if (att < 90) {
    nextActions.push({
      id: 'low_attendance',
      roles: ['head_of_year', 'pastoral_lead', 'tutor'],
      action: `Attendance ${att}% — below 90% target. Parent contact and monitoring plan required`,
      urgency: 'high',
      sourceType: 'attendance',
    });
    dataDrivers.push({ type: 'attendance', label: 'Attendance', value: `${att}%`, severity: 'high' });
  }

  if (beh > 20) {
    nextActions.push({
      id: 'high_behaviour',
      roles: ['head_of_year', 'pastoral_lead', 'tutor'],
      action: `Behaviour score ${beh} — restorative conversation and review of current support plan recommended`,
      urgency: 'high',
      sourceType: 'behaviour',
    });
    dataDrivers.push({ type: 'behaviour', label: 'Behaviour score', value: `${beh} pts`, severity: 'high' });
  }

  // ── SEND ──────────────────────────────────────────────────────────────────

  if (student.send_status && att < 90) {
    nextActions.push({
      id: 'send_attendance',
      roles: ['sendco', 'head_of_year'],
      action: `SEND student with attendance below 90% — Early Help review required. Confirm provision is meeting need`,
      urgency: 'high',
      sourceType: 'send',
    });
  }

  // ── Computed risk ─────────────────────────────────────────────────────────

  const hasCritical = nextActions.some(a => a.urgency === 'critical');
  const hasHigh     = nextActions.some(a => a.urgency === 'high');
  const hasDSLFlag  = dslRoutedComms.length > 0 || escalatedInts.length > 0;

  const computedRiskLevel: 'red' | 'amber' | 'green' =
    hasCritical || hasDSLFlag ? 'red' : hasHigh ? 'amber' : 'green';

  return {
    nextActions,
    dataDrivers,
    computedRiskLevel,
    pendingRoutingCount: pendingComms.length,
    hasDSLFlag,
    hasEscalation: escalatedInts.length > 0,
    recentActivityCount: recentComms.length + activeInts.length,
  };
}

// Returns only the actions relevant to the given role, highest urgency first
export function getActionsForRole(intelligence: StudentIntelligence, role: AppRole): NextAction[] {
  const order: Record<UrgencyLevel, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  return intelligence.nextActions
    .filter(a => a.roles.includes(role))
    .sort((a, b) => order[a.urgency] - order[b.urgency]);
}

// ─── Signal explanation composer ─────────────────────────────────────────────
//
// Produces a readable 2–4 sentence narrative from structured analysis fields.
// Used both server-side (written to analysis_results.signal_explanation after upload)
// and client-side as a fallback when the stored explanation is absent.
//
// Input mirrors the AnalysisResult type but all fields are optional so the
// function works even on partially-populated records.

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
};

// Re-export the canonical shared engine implementation — environment-neutral, used by
// both this frontend adapter and the edge function (supabase/functions/run-analysis).
import { composeSignalExplanation as _composeSignalExplanation } from '../../supabase/functions/_shared/engine';
export { _composeSignalExplanation as composeSignalExplanation };

// Convenience wrapper that maps an AnalysisResult + Student directly to the composer
export function composeExplanationFromAnalysis(
  analysis: Partial<AnalysisResult>,
  student?: Partial<Student>
): string {
  return _composeSignalExplanation({
    studentName: student?.name,
    riskLevel: analysis.risk_level,
    signalCategory: analysis.signal_category,
    riskScore: analysis.risk_score,
    behaviourTrend: analysis.behaviour_trend,
    attendanceTrend: analysis.attendance_trend,
    keyReasons: analysis.key_reasons,
    subjectsInvolved: analysis.subjects_involved,
    periodsInvolved: analysis.periods_involved,
    suggestedPastoralAction: analysis.suggested_pastoral_action,
    suggestedParentContact: analysis.suggested_parent_contact,
    suggestedStaffAction: analysis.suggested_staff_action,
    sendStatus: student?.send_status,
    pupilPremium: student?.pupil_premium,
    avgAttendance: student?.attendance_pct,
  });
}

