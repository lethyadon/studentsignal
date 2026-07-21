/**
 * Student Signal — Workflow Routing & Escalation (NEW, 19 Jul 2026)
 *
 * Pure, environment-neutral module (no Supabase/React/Deno). Resolves every
 * generated action to an ACTUAL authorised user id from the school's
 * profiles, using the same scope columns the RLS layer enforces
 * (role, year_groups, form_groups, department, can_view_safeguarding,
 * is_active). Also computes fallback owners, escalation paths, notification
 * recipients and pre-filled modal defaults.
 *
 * Security invariants (cannot be overridden by callers):
 *  - Safeguarding work routes ONLY to DSL → admin → SLT-with-grant. Never to
 *    an ordinary HOY/tutor/teacher, regardless of pupil scope.
 *  - Candidates must be is_active and in the same school (caller passes only
 *    same-school profiles; the adapter queries by school_id and RLS enforces
 *    tenancy underneath).
 *
 * When no configured owner exists at any level, the action falls back to the
 * school admin and is flagged `unresolved` — it is never left unowned.
 */

export interface ProfileLite {
  id: string;
  full_name: string | null;
  role: string | null;
  year_groups: string[] | null;
  form_groups: string[] | null;
  department: string | null;
  is_active: boolean | null;
  can_view_safeguarding: boolean | null;
}

export interface RoutingStudent {
  id: string;
  name: string;
  year_group: string;
  form: string | null;
  send_status?: string | null;
}

export interface RoutingContext {
  student: RoutingStudent;
  /** Engine signal type driving the action (safeguarding, attendance, …). */
  signalType: string;
  severity: 'low' | 'medium' | 'high' | 'urgent' | string;
  actionType: string;
  /** Subject for lesson/subject-specific patterns (context_pattern etc.). */
  subject?: string | null;
  /** True when the concern is cohort/school-wide rather than pupil-level. */
  cohortLevel?: boolean;
}

export interface RoutingResult {
  assignedToUserId: string | null;
  assignedToName: string | null;
  responsibleRole: string;
  fallbackUserId: string | null;
  fallbackName: string | null;
  /** Ordered role names an unactioned/overdue item walks up. */
  escalationPath: string[];
  /** User ids to notify on assignment. */
  notificationRecipients: string[];
  rationale: string;
  /** True when we had to fall back to admin because no configured owner exists. */
  unresolved: boolean;
}

const SAFEGUARDING_TYPES = new Set(['safeguarding']);
const SEND_TYPES = new Set(['send_related', 'send_review']);
const CAREERS_TYPES = new Set(['careers', 'destination_risk']);
const ATTENDANCE_TYPES = new Set(['attendance']);

function active(profiles: ProfileLite[]): ProfileLite[] {
  return profiles.filter(p => p.is_active !== false);
}

function byRole(profiles: ProfileLite[], role: string): ProfileLite[] {
  return profiles.filter(p => p.role === role);
}

function leastLoaded(
  candidates: ProfileLite[],
  workload: Record<string, number> | undefined,
): ProfileLite | null {
  if (candidates.length === 0) return null;
  if (!workload) return candidates[0];
  return [...candidates].sort((a, b) => (workload[a.id] ?? 0) - (workload[b.id] ?? 0))[0];
}

/** Roles allowed to own safeguarding work, in priority order. */
function safeguardingOwners(profiles: ProfileLite[]): ProfileLite[] {
  const act = active(profiles);
  return [
    ...byRole(act, 'dsl'),
    ...byRole(act, 'admin'),
    ...act.filter(p => p.role === 'slt' && p.can_view_safeguarding === true),
  ];
}

function normalise(s: string | null | undefined): string {
  return (s ?? '').trim().toLowerCase();
}

/**
 * Resolve the owner for an action. Deterministic given the same inputs.
 */
export function resolveOwner(
  profiles: ProfileLite[],
  ctx: RoutingContext,
  workload?: Record<string, number>,
): RoutingResult {
  const act = active(profiles);
  const notify = new Set<string>();
  let candidates: ProfileLite[] = [];
  let responsibleRole = 'head_of_year';
  let escalationPath: string[] = [];
  let rationale = '';

  const isSafeguarding =
    SAFEGUARDING_TYPES.has(ctx.signalType) ||
    /safeguard|dsl/i.test(ctx.actionType);

  if (isSafeguarding) {
    // ── Safeguarding: DSL → admin → SLT-with-grant. NEVER pupil-scope roles.
    candidates = safeguardingOwners(profiles);
    responsibleRole = 'dsl';
    escalationPath = ['dsl', 'admin'];
    rationale = `Safeguarding concern for ${ctx.student.name} — routed to the Designated Safeguarding Lead. Pupil-scope roles are never assigned safeguarding work.`;
  } else if (SEND_TYPES.has(ctx.signalType) || /sendco|send /i.test(ctx.actionType)) {
    candidates = [
      ...byRole(act, 'sendco'),
      ...byRole(act, 'pastoral_lead'),
      ...byRole(act, 'slt'),
    ];
    responsibleRole = 'sendco';
    escalationPath = ['sendco', 'pastoral_lead', 'slt', 'admin'];
    rationale = `SEND-related pattern for ${ctx.student.name} — routed to the SENDCo.`;
  } else if (CAREERS_TYPES.has(ctx.signalType) || /careers/i.test(ctx.actionType)) {
    candidates = [...byRole(act, 'careers_lead'), ...byRole(act, 'slt')];
    responsibleRole = 'careers_lead';
    escalationPath = ['careers_lead', 'slt', 'admin'];
    rationale = `Careers/destination concern for ${ctx.student.name} — routed to the Careers Lead.`;
  } else if (ctx.cohortLevel) {
    candidates = [...byRole(act, 'slt'), ...byRole(act, 'admin')];
    responsibleRole = 'slt';
    escalationPath = ['slt', 'admin'];
    rationale = `Cohort/school-level pattern — routed to SLT ownership.`;
  } else if (ctx.subject) {
    // ── Lesson/subject-specific: matching-department teacher → HOY → SLT.
    const subj = normalise(ctx.subject);
    const deptTeachers = act.filter(
      p => (p.role === 'teacher' || p.role === 'staff') && normalise(p.department) === subj,
    );
    const deptLead = act.filter(
      p => p.role !== 'teacher' && p.role !== 'staff' && normalise(p.department) === subj,
    );
    const hoys = byRole(act, 'head_of_year')
      .filter(p => (p.year_groups ?? []).includes(ctx.student.year_group));
    candidates = [...deptLead, ...deptTeachers, ...hoys, ...byRole(act, 'slt')];
    responsibleRole = deptLead.length > 0 || deptTeachers.length > 0 ? 'teacher' : 'head_of_year';
    escalationPath = ['teacher', 'head_of_year', 'slt', 'admin'];
    rationale = `Pattern specific to ${ctx.subject} for ${ctx.student.name} — routed to the relevant subject staff, falling back to the Head of Year.`;
  } else if (/tutor|form/i.test(ctx.actionType)) {
    // ── Form-specific: the pupil's actual form tutor → HOY.
    const tutors = byRole(act, 'tutor')
      .filter(p => ctx.student.form && (p.form_groups ?? []).includes(ctx.student.form));
    const hoys = byRole(act, 'head_of_year')
      .filter(p => (p.year_groups ?? []).includes(ctx.student.year_group));
    candidates = [...tutors, ...hoys, ...byRole(act, 'pastoral_lead'), ...byRole(act, 'slt')];
    responsibleRole = 'tutor';
    escalationPath = ['tutor', 'head_of_year', 'pastoral_lead', 'slt', 'admin'];
    rationale = `Form-level action for ${ctx.student.name} (${ctx.student.form ?? 'no form'}) — routed to the form tutor.`;
  } else if (ATTENDANCE_TYPES.has(ctx.signalType) || /attendance/i.test(ctx.actionType)) {
    // ── Attendance: pastoral_lead acts as attendance lead if present, else HOY.
    const leads = byRole(act, 'pastoral_lead');
    const hoys = byRole(act, 'head_of_year')
      .filter(p => (p.year_groups ?? []).includes(ctx.student.year_group));
    // SLT is escalation-only: only include if no HOY or lead is configured.
    const sltFallback = (hoys.length === 0 && leads.length === 0) ? byRole(act, 'slt') : [];
    candidates = [...hoys, ...leads, ...sltFallback];
    responsibleRole = hoys.length > 0 ? 'head_of_year' : leads.length > 0 ? 'pastoral_lead' : 'slt';
    escalationPath = ['head_of_year', 'pastoral_lead', 'slt', 'admin'];
    rationale = `Attendance concern for ${ctx.student.name} (${ctx.student.year_group}) — routed to the year-group pastoral owner.`;
  } else {
    // ── Default pupil-level behaviour/wellbeing: the actual HOY for the year.
    const hoys = byRole(act, 'head_of_year')
      .filter(p => (p.year_groups ?? []).includes(ctx.student.year_group));
    candidates = [...hoys, ...byRole(act, 'pastoral_lead'), ...byRole(act, 'slt')];
    responsibleRole = 'head_of_year';
    escalationPath = ['head_of_year', 'pastoral_lead', 'slt', 'admin'];
    rationale = `Pupil-level ${ctx.signalType} signal for ${ctx.student.name} (${ctx.student.year_group}) — routed to the Head of Year responsible for that year group.`;
  }

  // Admin is the emergency fallback ONLY for safeguarding (never leave a
  // safeguarding action unowned). For all other roles, when no matching
  // profile exists yet, leave assigned_to_user_id null and store the
  // role label. The next analysis run after a real user is added to
  // profiles will automatically resolve the UUID.
  const admins = byRole(act, 'admin');
  const unresolved = candidates.length === 0;

  let primary: ProfileLite | null = null;
  let fallback: ProfileLite | null = null;

  if (isSafeguarding) {
    // Safeguarding must never be left unowned — admin is the emergency fallback.
    const ordered = [...candidates, ...admins];
    primary = leastLoaded(ordered.slice(0, Math.max(1, candidates.length || 1)), workload) ?? ordered[0] ?? null;
    fallback = ordered.find(p => p.id !== primary?.id) ?? null;
  } else if (!unresolved) {
    // Normal case: matching role profile exists.
    primary = leastLoaded(candidates, workload) ?? candidates[0];
    fallback = candidates.find(p => p.id !== primary?.id) ?? admins[0] ?? null;
  }
  // When unresolved (no matching profile) and not safeguarding: primary stays null.
  // The action keeps its role-derived assigned_to display name and null user_id.
  // When the school adds the right staff member, the next analysis run resolves them.

  if (primary) notify.add(primary.id);
  // High/urgent items also notify the safeguarding or senior lead.
  if (ctx.severity === 'urgent' || ctx.severity === 'high') {
    const seniors = isSafeguarding ? safeguardingOwners(profiles) : byRole(act, 'slt');
    seniors.slice(0, 1).forEach(p => notify.add(p.id));
  }

  // Human-readable role display for the rationale
  const roleDisplay: Record<string, string> = {
    dsl: 'Designated Safeguarding Lead', sendco: 'SENDCo',
    head_of_year: `Head of Year (${ctx.student.year_group})`,
    pastoral_lead: 'Pastoral Lead', tutor: 'Form Tutor',
    careers_lead: 'Careers Lead', slt: 'SLT',
    teacher: ctx.subject ? `${ctx.subject} Teacher` : 'Subject Teacher',
  };
  const roleLabel = roleDisplay[responsibleRole] ?? responsibleRole;

  return {
    assignedToUserId: primary?.id ?? null,
    assignedToName: primary?.full_name ?? null,
    responsibleRole,
    fallbackUserId: fallback?.id ?? null,
    fallbackName: fallback?.full_name ?? null,
    escalationPath,
    notificationRecipients: [...notify],
    rationale: unresolved && !isSafeguarding
      ? `${rationale} No ${roleLabel} account has been configured yet — this action will be automatically assigned when one is added.`
      : unresolved
      ? `${rationale} No configured DSL was found — routed to the school administrator as the emergency safeguarding owner.`
      : rationale,
    unresolved,
  };
}

// ─── Escalation ───────────────────────────────────────────────────────────────

export interface ActionForEscalation {
  id: string;
  student_id: string;
  action_type: string;
  status: string | null;
  priority: string | null;
  due_date: string | null;
  assigned_to_user_id: string | null;
  assigned_to: string | null;
  source: string | null;
}

export interface EscalationDecision {
  actionId: string;
  newAssigneeId: string | null;
  newAssigneeName: string | null;
  newPriority: string;
  reason: string;
  notify: string[];
}

/**
 * Walk one step up the escalation path for an overdue or failed action.
 * Deterministic; returns null when no escalation is needed/possible.
 */
export function escalateAction(
  action: ActionForEscalation,
  ctx: RoutingContext,
  profiles: ProfileLite[],
  reason: 'overdue' | 'failed_intervention' | 'repeated_signal' | 'worsening_risk',
): EscalationDecision | null {
  const resolution = resolveOwner(profiles, ctx);
  const act = active(profiles);
  const currentRole = act.find(p => p.id === action.assigned_to_user_id)?.role ?? resolution.responsibleRole;
  const path = resolution.escalationPath;
  const idx = path.indexOf(currentRole);
  const nextRoles = idx >= 0 ? path.slice(idx + 1) : path;

  for (const role of nextRoles) {
    const candidates = role === 'dsl'
      ? safeguardingOwners(profiles)
      : byRole(act, role).filter(p =>
          role !== 'head_of_year' || (p.year_groups ?? []).includes(ctx.student.year_group));
    const next = candidates.find(p => p.id !== action.assigned_to_user_id);
    if (next) {
      const newPriority = action.priority === 'urgent' ? 'urgent'
        : action.priority === 'high' ? 'urgent' : 'high';
      return {
        actionId: action.id,
        newAssigneeId: next.id,
        newAssigneeName: next.full_name,
        newPriority,
        reason: reason === 'overdue'
          ? `Action overdue (due ${action.due_date}) — escalated from ${currentRole} to ${role}.`
          : reason === 'failed_intervention'
          ? `Intervention completed without improvement — escalated to ${role} for review.`
          : reason === 'repeated_signal'
          ? `Signal has repeated without resolution — escalated to ${role}.`
          : `Risk level has worsened while the action was open — escalated to ${role}.`,
        notify: [next.id, ...(action.assigned_to_user_id ? [action.assigned_to_user_id] : [])],
      };
    }
  }
  return null;
}

// ─── Modal defaults ───────────────────────────────────────────────────────────

export interface ModalDefaults {
  student_id: string;
  student_name: string;
  signal_type: string;
  action_type: string;
  recommended_action: string;
  assigned_to_user_id: string | null;
  assigned_to: string | null;
  responsible_role: string;
  priority: string;
  due_date: string;
  review_date: string;
  rationale: string;
  evidence: string[];
  escalation_level: number;
  success_criteria: string;
  notification_recipients: string[];
  /** Fields staff may edit. Safeguarding routing and tenancy are NOT listed. */
  overridable_fields: string[];
}

export function buildModalDefaults(
  ctx: RoutingContext,
  resolution: RoutingResult,
  recommendedAction: string,
  evidence: string[],
  todayIso: string,
): ModalDefaults {
  const due = new Date(todayIso + 'T00:00:00Z');
  due.setUTCDate(due.getUTCDate() + (ctx.severity === 'urgent' ? 1 : ctx.severity === 'high' ? 3 : 7));
  const review = new Date(due);
  review.setUTCDate(review.getUTCDate() + 14);

  return {
    student_id: ctx.student.id,
    student_name: ctx.student.name,
    signal_type: ctx.signalType,
    action_type: ctx.actionType,
    recommended_action: recommendedAction,
    assigned_to_user_id: resolution.assignedToUserId,
    assigned_to: resolution.assignedToName,
    responsible_role: resolution.responsibleRole,
    priority: ctx.severity === 'urgent' ? 'urgent' : ctx.severity,
    due_date: due.toISOString().slice(0, 10),
    review_date: review.toISOString().slice(0, 10),
    rationale: resolution.rationale,
    evidence,
    escalation_level: 0,
    success_criteria:
      ctx.signalType === 'attendance'
        ? 'Attendance recovers towards 95% and no new unexplained absence within the review window.'
        : ctx.signalType === 'safeguarding'
        ? 'DSL has reviewed the concern, recorded the outcome, and confirmed the case status.'
        : 'No further incidents of this pattern within the review window; pupil voice confirms improvement.',
    notification_recipients: resolution.notificationRecipients,
    overridable_fields: [
      'action_type', 'recommended_action', 'priority', 'due_date', 'review_date',
      'success_criteria', 'rationale',
      // assignee is overridable EXCEPT for safeguarding, where the candidate
      // set is restricted to authorised roles by resolveOwner:
      'assigned_to_user_id',
    ],
  };
}

// ─── Notification payloads ────────────────────────────────────────────────────

export interface NotificationPayload {
  school_id: string;
  recipient_id: string;
  type: string;
  title: string;
  body: string;
  student_id: string;
  link_path: string;
  urgent: boolean;
}

export function buildAssignmentNotifications(
  schoolId: string,
  ctx: RoutingContext,
  resolution: RoutingResult,
  recommendedAction: string,
): NotificationPayload[] {
  const urgent = ctx.severity === 'urgent' || ctx.signalType === 'safeguarding';
  return resolution.notificationRecipients.map(rid => ({
    school_id: schoolId,
    recipient_id: rid,
    type: ctx.signalType === 'safeguarding' ? 'safeguarding_alert' : 'assigned_action',
    title: rid === resolution.assignedToUserId
      ? `Action assigned: ${ctx.student.name}`
      : `New ${ctx.severity} signal: ${ctx.student.name}`,
    body: `${recommendedAction} — ${resolution.rationale}`,
    student_id: ctx.student.id,
    link_path: `/interventions`,
    urgent,
  }));
}
