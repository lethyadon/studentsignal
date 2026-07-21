/**
 * StudentSignal — Explain Engine
 * 20 Jul 2026
 *
 * ONE place that generates every "Why?" explanation in the product.
 * No explanation logic lives in UI components.
 * All explanations are evidence-based and concise.
 *
 * Used by:
 *  - Signal cards (why flagged, why this explanation, why this confidence)
 *  - Action modals (why this assignee, why this priority, why this due date)
 *  - Escalation modals (why escalating, why this next owner)
 *  - Briefing items (why urgent, why review now)
 *  - Queue removal (why pupil left my queue)
 *  - Notification centre (why I received this)
 */

// ─── Input types ──────────────────────────────────────────────────────────────

export interface SignalExplainInput {
  studentName: string;
  riskLevel: 'red' | 'amber' | 'green' | 'grey' | 'blue';
  signalTypes: string[];
  riskScore: number;
  keyReasons: string[];
  dataSources: string[];
  primaryHypothesisHeadline?: string | null;
  primaryHypothesisConfidence?: string | null;
  primaryHypothesisConfidenceReason?: string | null;
  changeTimeline?: string | null;       // e.g. "attendance fell from 94% to 82% over 5 weeks"
  recurrenceCount?: number;
  evidenceSummary?: string | null;
}

export interface AssignmentExplainInput {
  assigneeName: string | null;
  assigneeRole: string;
  studentName: string;
  yearGroup: string;
  signalType: string;
  isUnresolved?: boolean;
  unresolveedReason?: string | null;
}

export interface PriorityExplainInput {
  priority: string;
  signalType: string;
  riskLevel: string;
  dueDate?: string | null;
  isOverdue?: boolean;
  escalationLevel?: number;
}

export interface EscalationExplainInput {
  reason: 'overdue' | 'failed_intervention' | 'repeated_signal' | 'worsening_risk';
  previousOwnerName?: string | null;
  previousOwnerRole: string;
  newOwnerName?: string | null;
  newOwnerRole: string;
  daysOverdue?: number | null;
  failedInterventionName?: string | null;
  recurrenceCount?: number;
  riskScoreChange?: number | null;
}

export interface ReviewExplainInput {
  actionType: string;
  reviewDate: string;
  daysUntilReview: number;
  lastReviewedAt?: string | null;
  previousOutcome?: string | null;
}

export interface QueueRemovalExplainInput {
  actionType: string;
  completedAt?: string | null;
  completedBy?: string | null;
  reason: 'completed' | 'reassigned' | 'escalated' | 'auto_resolved' | 'no_new_evidence';
  newOwnerName?: string | null;
}

export interface ConfidenceExplainInput {
  confidence: string;       // 'high' | 'medium' | 'low' | 'emerging'
  confidenceReason: string;
  sourceCount: number;
  observerCount: number;
  daySpan: number;
  previousConfidence?: string | null;
}

// ─── Output ───────────────────────────────────────────────────────────────────

export interface Explanation {
  /** One-line summary shown inline next to the badge/score */
  summary: string;
  /** Bullet-point evidence list for expanded "Why?" view */
  bullets: string[];
  /** Optional: what would change this explanation */
  caveat?: string | null;
}

// ─── Role display names ───────────────────────────────────────────────────────

const ROLE_LABEL: Record<string, string> = {
  admin: 'School Administrator',
  slt: 'SLT',
  dsl: 'Designated Safeguarding Lead',
  sendco: 'SENDCo',
  head_of_year: 'Head of Year',
  pastoral_lead: 'Pastoral Lead',
  tutor: 'Form Tutor',
  teacher: 'Class Teacher',
  careers_lead: 'Careers Lead',
  deputy_dsl: 'Deputy DSL',
};

function roleLabel(role: string): string {
  return ROLE_LABEL[role] ?? role;
}

// ─── 1. Why was this pupil flagged? ──────────────────────────────────────────

export function explainSignal(input: SignalExplainInput): Explanation {
  const { studentName, riskLevel, signalTypes, riskScore, keyReasons, dataSources } = input;

  const levelLabel: Record<string, string> = {
    red: 'requires immediate pastoral action',
    amber: 'warrants early monitoring or intervention',
    green: 'has no current concerns',
    grey: 'has insufficient data to draw a conclusion',
    blue: 'is showing positive recovery or successful intervention',
  };

  const summary = `${studentName} ${levelLabel[riskLevel] ?? 'has been flagged'} (risk score: ${riskScore.toFixed(0)}).`;

  const bullets: string[] = [];

  if (signalTypes.length > 0) {
    const typeLabels: Record<string, string> = {
      safeguarding: 'Open safeguarding concern',
      attendance_decline: 'Attendance has declined',
      behaviour_escalation: 'Behaviour incidents have escalated',
      attainment_decline: 'Attainment is falling across subjects',
      wellbeing_concern: 'Wellbeing concerns noted across sources',
      send_review: 'SEND provision may need review',
      careers_gap: 'Careers/destination data is missing',
      peer_cluster: 'Linked to a peer group pattern',
      positive_progress: 'Positive progress noted',
      exceptional_achievement: 'Exceptional achievement recognised',
      reward_pattern: 'Reward pattern detected',
      context_pattern: 'Lesson or context-specific pattern detected',
    };
    bullets.push(`Signals detected: ${signalTypes.map(t => typeLabels[t] ?? t).join('; ')}.`);
  }

  keyReasons.slice(0, 4).forEach(r => bullets.push(r));

  if (dataSources.length > 0) {
    bullets.push(`Evidence from ${dataSources.length} source${dataSources.length > 1 ? 's' : ''}: ${dataSources.join(', ')}.`);
  }

  if (input.recurrenceCount && input.recurrenceCount > 0) {
    bullets.push(`This pattern has recurred ${input.recurrenceCount} time${input.recurrenceCount > 1 ? 's' : ''} — previous interventions have not produced lasting improvement.`);
  }

  if (input.changeTimeline) {
    bullets.push(`What changed: ${input.changeTimeline}`);
  }

  if (riskLevel === 'grey') {
    return {
      summary: `${studentName} is shown as grey (monitoring) — insufficient data to determine a pattern.`,
      bullets: [
        'Fewer than 2 data sources are connected for this pupil.',
        ...keyReasons.slice(0, 2),
        'StudentSignal will update automatically as more evidence is recorded.',
      ],
      caveat: 'Grey does not mean the pupil is fine — it means there is not yet enough evidence to confirm or rule out a concern.',
    };
  }

  return { summary, bullets, caveat: null };
}

// ─── 2. Why is this the likely explanation? ───────────────────────────────────

export function explainHypothesis(input: {
  headline: string;
  narrative: string;
  confidence: string;
  confidenceReason: string;
  predictedEscalation?: string | null;
  supportingEventCount: number;
  sourceCount: number;
}): Explanation {
  const confLabel: Record<string, string> = {
    high: 'High confidence',
    medium: 'Moderate confidence',
    low: 'Lower confidence',
    emerging: 'Early indication',
  };

  return {
    summary: `${confLabel[input.confidence] ?? 'Confidence unknown'}: ${input.headline}`,
    bullets: [
      `${confLabel[input.confidence] ?? 'Confidence'}: ${input.confidenceReason}.`,
      `${input.supportingEventCount} supporting event${input.supportingEventCount !== 1 ? 's' : ''} across ${input.sourceCount} data source${input.sourceCount !== 1 ? 's' : ''}.`,
      input.narrative,
      ...(input.predictedEscalation ? [`If no action is taken: ${input.predictedEscalation}`] : []),
    ].filter(Boolean),
    caveat: input.confidence === 'low' || input.confidence === 'emerging'
      ? 'This is an early-stage pattern. More evidence is needed before drawing firm conclusions.'
      : null,
  };
}

// ─── 3. Why am I the assignee? ───────────────────────────────────────────────

export function explainAssignment(input: AssignmentExplainInput): Explanation {
  const { assigneeName, assigneeRole, studentName, yearGroup, signalType, isUnresolved } = input;

  if (isUnresolved) {
    return {
      summary: `Awaiting ${roleLabel(assigneeRole)} account.`,
      bullets: [
        `No ${roleLabel(assigneeRole)} account has been created yet for this school.`,
        `This action is designated for the ${roleLabel(assigneeRole)} responsible for ${yearGroup}.`,
        `It will be automatically assigned to the correct person once their account is created — no action is needed now.`,
      ],
      caveat: null,
    };
  }

  const reasonBySignal: Record<string, string> = {
    safeguarding: `${assigneeName} is an authorised Designated Safeguarding Lead. Safeguarding concerns are always routed to an authorised DSL — they cannot be assigned to other roles.`,
    attendance_decline: `${assigneeName} is the Head of Year responsible for ${yearGroup}. Attendance concerns are routed to the pastoral lead for that year group.`,
    behaviour_escalation: `${assigneeName} is the Head of Year responsible for ${yearGroup}. Behaviour concerns are routed to the year group's pastoral lead.`,
    send_related: `${assigneeName} is the SENDCo. SEND-related patterns are routed to the SENDCo for review.`,
    send_review: `${assigneeName} is the SENDCo. SEND-related patterns are routed to the SENDCo for review.`,
    careers_gap: `${assigneeName} is the Careers Lead. Careers and destination concerns are routed to the Careers Lead.`,
    context_pattern: `${assigneeName} is the relevant subject or department lead. Lesson-specific patterns are routed to the responsible teacher or department.`,
  };

  const reason = reasonBySignal[signalType]
    ?? `${assigneeName} is the ${roleLabel(assigneeRole)} with responsibility for ${yearGroup}. Assignments are made based on role, year-group responsibility and current workload.`;

  return {
    summary: `Auto-assigned to ${assigneeName ?? roleLabel(assigneeRole)} by StudentSignal.`,
    bullets: [reason, 'Assignment considers role, year-group or department responsibility, safeguarding permissions, and existing workload. You can reassign this action if needed.'],
    caveat: null,
  };
}

// ─── 4. Why is this urgent / this priority? ──────────────────────────────────

export function explainPriority(input: PriorityExplainInput): Explanation {
  const { priority, signalType, riskLevel, dueDate, isOverdue, escalationLevel } = input;

  const bullets: string[] = [];

  if (isOverdue) {
    bullets.push(`This action is overdue — it was due on ${dueDate ?? 'an earlier date'} and has not yet been completed.`);
  }

  if (escalationLevel && escalationLevel > 0) {
    bullets.push(`This has been escalated ${escalationLevel} time${escalationLevel > 1 ? 's' : ''} — the priority has been raised as part of the escalation.`);
  }

  const priorityReasons: Record<string, string> = {
    urgent: `Set to urgent because the signal is ${signalType === 'safeguarding' ? 'a safeguarding concern — these are always urgent' : `${riskLevel} risk and requires immediate action`}.`,
    high: `Set to high priority because the risk level is ${riskLevel} — action within 3 days is recommended.`,
    medium: `Set to medium priority. Action within 7 days is recommended. Review the signal evidence to confirm this is appropriate.`,
    low: `Set to low priority. Review when convenient.`,
  };

  bullets.push(priorityReasons[priority] ?? `Priority: ${priority}.`);

  if (dueDate && !isOverdue) {
    bullets.push(`Due date set to ${dueDate} — calculated based on priority (urgent: +1 day, high: +3 days, medium/low: +7 days from the date the signal was generated).`);
  }

  return {
    summary: `${priority.charAt(0).toUpperCase() + priority.slice(1)} priority${isOverdue ? ' (overdue)' : ''}.`,
    bullets,
    caveat: null,
  };
}

// ─── 5. Why was this intervention recommended? ───────────────────────────────

export function explainRecommendation(input: {
  recommendedAction: string;
  successCriteria: string;
  basedOn: 'pupil_history' | 'school_history' | 'similar_pupils' | 'general_guidance';
  evidence?: string | null;
  alternativesTried?: string[];
  whatWorked?: string | null;
}): Explanation {
  const sourceLabel: Record<string, string> = {
    pupil_history: "this pupil's own intervention history",
    school_history: "your school's intervention outcomes for similar cases",
    similar_pupils: "outcomes for similar pupils within your school",
    general_guidance: "general pastoral guidance (school-specific evidence not yet available)",
  };

  const bullets = [
    `Recommended based on ${sourceLabel[input.basedOn]}.`,
    ...(input.evidence ? [input.evidence] : []),
    ...(input.alternativesTried && input.alternativesTried.length > 0
      ? [`Previously tried without lasting success: ${input.alternativesTried.join(', ')}.`]
      : []),
    ...(input.whatWorked ? [`What has worked previously: ${input.whatWorked}`] : []),
    `Success criteria: ${input.successCriteria}`,
  ];

  return {
    summary: `Recommended: ${input.recommendedAction}`,
    bullets,
    caveat: input.basedOn === 'general_guidance'
      ? 'This recommendation is based on general guidance. StudentSignal will improve this recommendation as your school records more intervention outcomes.'
      : null,
  };
}

// ─── 6. Why is this review due now? ──────────────────────────────────────────

export function explainReviewDate(input: ReviewExplainInput): Explanation {
  const { actionType, reviewDate, daysUntilReview, lastReviewedAt, previousOutcome } = input;

  const bullets = [
    `Review date for ${actionType}: ${reviewDate} (${daysUntilReview} day${daysUntilReview !== 1 ? 's' : ''} from now).`,
    'Review dates are set 14 days after the action due date to allow time for the intervention to take effect.',
    ...(lastReviewedAt ? [`Last reviewed: ${lastReviewedAt}.`] : ['This action has not been reviewed before.']),
    ...(previousOutcome ? [`Previous outcome: ${previousOutcome}.`] : []),
  ];

  return {
    summary: `Review due ${reviewDate}${daysUntilReview <= 0 ? ' (overdue)' : daysUntilReview <= 3 ? ' (soon)' : ''}.`,
    bullets,
    caveat: null,
  };
}

// ─── 7. Why did the system escalate? ─────────────────────────────────────────

export function explainEscalation(input: EscalationExplainInput): Explanation {
  const { reason, previousOwnerName, previousOwnerRole, newOwnerName, newOwnerRole } = input;

  const triggerLabel: Record<string, string> = {
    overdue: `This action was overdue${input.daysOverdue ? ` by ${input.daysOverdue} day${input.daysOverdue !== 1 ? 's' : ''}` : ''} and had not been completed.`,
    failed_intervention: `The intervention (${input.failedInterventionName ?? 'previous action'}) was completed but produced no measurable improvement.`,
    repeated_signal: `The same signal has now appeared ${input.recurrenceCount ?? 'multiple'} time${(input.recurrenceCount ?? 2) !== 1 ? 's' : ''} without resolution.`,
    worsening_risk: `The risk score has worsened by ${input.riskScoreChange?.toFixed(0) ?? 'a significant amount'} points since the action was opened.`,
  };

  return {
    summary: `Escalated from ${roleLabel(previousOwnerRole)} to ${roleLabel(newOwnerRole)}.`,
    bullets: [
      triggerLabel[reason],
      `Escalated from ${previousOwnerName ?? roleLabel(previousOwnerRole)} to ${newOwnerName ?? roleLabel(newOwnerRole)} — next step in the configured escalation path.`,
      'Both the previous owner and the new owner have been notified.',
      'You can override the escalation decision by reassigning this action.',
    ],
    caveat: null,
  };
}

// ─── 8. Why did confidence change? ───────────────────────────────────────────

export function explainConfidence(input: ConfidenceExplainInput): Explanation {
  const { confidence, confidenceReason, sourceCount, observerCount, daySpan, previousConfidence } = input;

  const confLabel: Record<string, string> = {
    high: 'High confidence — strong cross-source evidence',
    medium: 'Moderate confidence — corroborated by multiple sources',
    low: 'Lower confidence — limited corroboration',
    emerging: 'Early indication — monitoring',
  };

  const bullets = [
    `${confLabel[confidence] ?? confidence}: ${confidenceReason}`,
    `Evidence spans ${daySpan} day${daySpan !== 1 ? 's' : ''} across ${sourceCount} data source${sourceCount !== 1 ? 's' : ''} with ${observerCount} independent observer${observerCount !== 1 ? 's' : ''}.`,
  ];

  if (previousConfidence && previousConfidence !== confidence) {
    const direction = ['high','medium'].indexOf(confidence) < ['high','medium'].indexOf(previousConfidence) ? 'decreased' : 'increased';
    bullets.push(`Confidence has ${direction} since last analysis as ${direction === 'increased' ? 'more corroborating' : 'fewer supporting'} records have been recorded.`);
  }

  return {
    summary: confLabel[confidence] ?? `Confidence: ${confidence}`,
    bullets,
    caveat: confidence === 'low' || confidence === 'emerging'
      ? 'More evidence is needed before this can be acted on with confidence. Continue monitoring.'
      : null,
  };
}

// ─── 9. Why is this pupil no longer in my queue? ─────────────────────────────

export function explainQueueRemoval(input: QueueRemovalExplainInput): Explanation {
  const { actionType, completedAt, completedBy, reason, newOwnerName } = input;

  const reasonLabel: Record<string, { summary: string; bullets: string[] }> = {
    completed: {
      summary: `Removed because you completed the ${actionType}.`,
      bullets: [
        `You marked this action as complete${completedAt ? ` on ${completedAt}` : ''}.`,
        'The completed action remains visible in the pupil timeline.',
        'Other staff who have separate open responsibilities for this pupil will still see the pupil in their own queue.',
        'The pupil will reappear in your queue only if new evidence creates a new responsibility for you.',
      ],
    },
    reassigned: {
      summary: `Removed because this action was reassigned${newOwnerName ? ` to ${newOwnerName}` : ''}.`,
      bullets: [
        `The action has been reassigned${newOwnerName ? ` to ${newOwnerName}` : ' to another staff member'}.`,
        'You are no longer the responsible owner.',
        'You can still view the pupil profile if you have view permission.',
      ],
    },
    escalated: {
      summary: `Removed because this action was escalated to a senior role.`,
      bullets: [
        `The action was escalated${newOwnerName ? ` to ${newOwnerName}` : ''} because escalation rules were met.`,
        'You have been notified as the previous owner.',
        'You can still view the pupil profile.',
      ],
    },
    auto_resolved: {
      summary: `Removed because the signal has resolved based on new data.`,
      bullets: [
        `Reanalysis shows the underlying concern has improved beyond the action threshold.`,
        'No further action is required from you at this time.',
        'StudentSignal will alert you if the concern returns.',
      ],
    },
    no_new_evidence: {
      summary: `Removed because reanalysis produced no new evidence requiring your action.`,
      bullets: [
        'Reanalysis ran on the same data and found no new responsibility for you.',
        'Your previously completed actions remain in the pupil timeline.',
        'No duplicate action was created.',
      ],
    },
  };

  const content = reasonLabel[reason] ?? {
    summary: 'Removed from your queue.',
    bullets: ['This pupil no longer requires your action at this time.'],
  };

  return { ...content, caveat: null };
}

// ─── Composite: full signal card explanation ──────────────────────────────────
// Used by the signal card "Why?" panel — assembles all relevant sections.

export interface FullSignalExplanation {
  flaggedExplanation: Explanation;
  hypothesisExplanation: Explanation | null;
  assignmentExplanation: Explanation | null;
  priorityExplanation: Explanation | null;
}

export function buildFullSignalExplanation(opts: {
  signal: SignalExplainInput;
  hypothesis?: {
    headline: string; narrative: string; confidence: string;
    confidenceReason: string; predictedEscalation?: string | null;
    supportingEventCount: number; sourceCount: number;
  } | null;
  assignment?: AssignmentExplainInput | null;
  priority?: PriorityExplainInput | null;
}): FullSignalExplanation {
  return {
    flaggedExplanation: explainSignal(opts.signal),
    hypothesisExplanation: opts.hypothesis ? explainHypothesis(opts.hypothesis) : null,
    assignmentExplanation: opts.assignment ? explainAssignment(opts.assignment) : null,
    priorityExplanation: opts.priority ? explainPriority(opts.priority) : null,
  };
}
