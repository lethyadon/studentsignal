/**
 * StudentSignal — Canonical Explain Module
 * 20 Jul 2026
 *
 * Every AI recommendation, automatic assignment, confidence score, priority
 * and escalation must have an expandable explanation derivable from the same
 * canonical engine output. This module is the single source for all of those
 * explanations so the UI never duplicates logic.
 *
 * The nine questions a user should always be able to answer:
 *  1. Why was this pupil flagged?
 *  2. Why is this the likely explanation?
 *  3. Why am I the assignee?
 *  4. Why is this urgent / what priority was chosen?
 *  5. Why was this intervention recommended?
 *  6. Why is this review due now?
 *  7. Why did the system escalate?
 *  8. Why did the confidence change?
 *  9. Why is this pupil no longer in my queue?
 *
 * All functions take data already produced by the engine — nothing is
 * re-computed here. Do not duplicate engine logic in this file.
 */

import type { AnalysisResult } from '../types';

// ── Common output shape ───────────────────────────────────────────────────────

export interface Explanation {
  /** Short headline (≤12 words) for collapsed state */
  summary: string;
  /** Full explanation paragraphs for expanded state */
  paragraphs: string[];
  /** Specific evidence bullets (from engine key_reasons / supportingEvents) */
  evidence: string[];
  /** What happens if no action is taken (predictedEscalation) */
  ifUnaddressed?: string | null;
}

// ── Helper ────────────────────────────────────────────────────────────────────

function bullets(arr: string[] | null | undefined): string[] {
  return (arr ?? []).filter(Boolean).slice(0, 6);
}

const CONFIDENCE_LABEL: Record<string, string> = {
  high:    'High confidence',
  medium:  'Moderate confidence',
  low:     'Lower confidence',
  very_low:'Early indication only',
};

const RISK_LABEL: Record<string, string> = {
  red:   'Immediate pastoral action required',
  amber: 'Preventive action or monitoring recommended',
  green: 'No current action required',
  blue:  'Positive recovery or successful intervention',
  grey:  'Insufficient evidence — monitoring period',
};

const PRIORITY_DAYS: Record<string, number> = {
  urgent: 1, high: 3, medium: 7, low: 14,
};

// ── Q1: Why was this pupil flagged? ──────────────────────────────────────────

export function explainFlag(analysis: Partial<AnalysisResult>): Explanation {
  const riskLabel = RISK_LABEL[analysis.risk_level ?? 'green'] ?? 'No current action required';
  const types = (analysis.signal_types as string[] | null) ?? [];
  const sources = (analysis.data_sources as string[] | null) ?? [];
  const score = analysis.risk_score ?? 0;

  const typeList = types.map(t => t.replace(/_/g, ' ')).join(', ') || 'no active concerns';
  const sourceList = sources.map(s => s.replace(/_/g, ' ')).join(', ') || 'one system';

  return {
    summary: riskLabel,
    paragraphs: [
      `${riskLabel}. StudentSignal detected ${types.length > 0 ? `${types.length} signal${types.length > 1 ? 's' : ''}: ${typeList}` : 'no risk patterns'} across ${sources.length} data source${sources.length !== 1 ? 's' : ''}: ${sourceList}.`,
      score > 0
        ? `Risk score: ${score.toFixed(0)}/100. Scores above 60 trigger immediate-action status; 30–60 require monitoring.`
        : `No risk score — insufficient data to calculate.`,
    ],
    evidence: bullets(analysis.key_reasons as string[]),
    ifUnaddressed: null,
  };
}

// ── Q2: Why is this the likely explanation? ───────────────────────────────────

export function explainHypothesis(
  headline: string | null | undefined,
  narrative: string | null | undefined,
  confidence: string | null | undefined,
  confidenceReason: string | null | undefined,
  supportingEvents: Array<{ date: string | Date; source: string; text?: string }> | null | undefined,
  predictedEscalation: string | null | undefined,
  evidenceSummary: string | null | undefined,
): Explanation {
  if (!headline) {
    return {
      summary: 'Insufficient evidence for a confident explanation',
      paragraphs: ['StudentSignal has detected signals but does not yet have enough cross-source evidence to identify the most likely cause. More data will build a clearer picture.'],
      evidence: [],
    };
  }

  const confLabel = CONFIDENCE_LABEL[confidence ?? ''] ?? 'Confidence unknown';
  const events = (supportingEvents ?? []).slice(0, 4).map(e => {
    const d = e.date instanceof Date ? e.date.toISOString().slice(0, 10) : String(e.date).slice(0, 10);
    return `${d} — ${e.source.replace(/_/g, ' ')}: ${(e.text ?? '').slice(0, 80)}`;
  });

  return {
    summary: headline.replace(/^Most likely explanation: /i, ''),
    paragraphs: [
      narrative ?? headline,
      `${confLabel}${confidenceReason ? ': ' + confidenceReason : ''}.`,
      evidenceSummary ? `Evidence: ${evidenceSummary}.` : '',
    ].filter(Boolean),
    evidence: events,
    ifUnaddressed: predictedEscalation ?? null,
  };
}

// ── Q3: Why am I the assignee? ────────────────────────────────────────────────

export function explainAssignment(
  assignedToName: string | null | undefined,
  responsibleRole: string | null | undefined,
  rationale: string | null | undefined,
  unresolved: boolean | null | undefined,
  escalationPath: string[] | null | undefined,
): Explanation {
  const roleDisplay: Record<string, string> = {
    dsl: 'Designated Safeguarding Lead', sendco: 'SENDCo',
    head_of_year: 'Head of Year', pastoral_lead: 'Pastoral Lead',
    tutor: 'Form Tutor', slt: 'Senior Leadership Team',
    careers_lead: 'Careers Lead', teacher: 'Subject Teacher', admin: 'School Admin',
  };
  const roleLabel = roleDisplay[responsibleRole ?? ''] ?? responsibleRole ?? 'Responsible staff';
  const path = (escalationPath ?? []).map(r => roleDisplay[r] ?? r).join(' → ');

  if (unresolved) {
    return {
      summary: `Awaiting ${roleLabel} account`,
      paragraphs: [
        `This action is designated for the ${roleLabel}. No account with that role has been configured yet.`,
        `It will be automatically reassigned when the ${roleLabel} account is created. In the meantime the action is held in the school's pending queue.`,
      ],
      evidence: [],
    };
  }

  return {
    summary: assignedToName ? `Assigned to ${assignedToName}` : `Assigned to ${roleLabel}`,
    paragraphs: [
      rationale ?? `Auto-assigned to the ${roleLabel} based on role, year group and signal type.`,
      path ? `Escalation path if unactioned: ${path}.` : '',
    ].filter(Boolean),
    evidence: [],
  };
}

// ── Q4: Why is this priority / urgent? ───────────────────────────────────────

export function explainPriority(
  priority: string,
  riskLevel: string | null | undefined,
  signalTypes: string[] | null | undefined,
  dueDate: string | null | undefined,
): Explanation {
  const days = PRIORITY_DAYS[priority] ?? 7;
  const types = (signalTypes ?? []).map(t => t.replace(/_/g, ' '));

  const reasons: Record<string, string> = {
    urgent: 'Immediate action required — risk level is red or a safeguarding concern is open.',
    high:   'Action required within 3 days — significant concern detected across multiple sources.',
    medium: 'Preventive action within 1 week — emerging concern that could escalate if unaddressed.',
    low:    'Monitoring — pattern noted but not yet requiring active intervention.',
  };

  return {
    summary: `${priority.charAt(0).toUpperCase() + priority.slice(1)} — ${days === 1 ? 'due tomorrow' : `due within ${days} days`}`,
    paragraphs: [
      reasons[priority] ?? `Priority set to ${priority}.`,
      riskLevel ? `Overall risk level: ${RISK_LABEL[riskLevel] ?? riskLevel}.` : '',
      types.length > 0 ? `Contributing signal types: ${types.join(', ')}.` : '',
    ].filter(Boolean),
    evidence: [],
  };
}

// ── Q5: Why was this intervention recommended? ────────────────────────────────

export function explainRecommendedAction(
  recommendedAction: string | null | undefined,
  hypothesisRecommendedAction: string | null | undefined,
  memoryNarrative: string | null | undefined,
  whatWorksNarrative: string | null | undefined,
  responsibleRole: string | null | undefined,
): Explanation {
  const action = recommendedAction ?? hypothesisRecommendedAction ?? 'Pastoral check-in';

  return {
    summary: action.slice(0, 60),
    paragraphs: [
      `Recommended because the detected pattern is most likely to respond to: ${action}.`,
      whatWorksNarrative ?? '',
      memoryNarrative ? `Previous interventions for this pupil: ${memoryNarrative.slice(0, 200)}` : 'No previous interventions recorded for this pupil.',
    ].filter(Boolean),
    evidence: [],
  };
}

// ── Q6: Why is this review due now? ──────────────────────────────────────────

export function explainReviewDate(
  reviewDate: string | null | undefined,
  priority: string | null | undefined,
  rationale?: string | null,
): Explanation {
  if (!reviewDate) {
    return { summary: 'No review date set', paragraphs: ['No review date has been assigned.'], evidence: [] };
  }
  const date = new Date(reviewDate);
  const formatted = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const days = PRIORITY_DAYS[priority ?? 'medium'] ?? 7;

  return {
    summary: `Review: ${formatted}`,
    paragraphs: [
      `Review date is set 14 days after the due date (due date = today + ${days} days for ${priority ?? 'medium'} priority).`,
      'At review, StudentSignal will reassess whether the concern has improved, stabilised or worsened based on new data.',
      rationale ? `Rationale: ${rationale}` : '',
    ].filter(Boolean),
    evidence: [],
  };
}

// ── Q7: Why did the system escalate? ─────────────────────────────────────────

export function explainEscalation(
  reason: string | null | undefined,
  previousOwner: string | null | undefined,
  newOwner: string | null | undefined,
  trigger: 'overdue' | 'failed_intervention' | 'repeated_signal' | 'worsening_risk' | string,
): Explanation {
  const triggerLabels: Record<string, string> = {
    overdue:              'Action was overdue',
    failed_intervention:  'Previous intervention did not produce measurable improvement',
    repeated_signal:      'Signal has recurred after a previous action was completed',
    worsening_risk:       'Risk level has worsened since the action was opened',
  };
  const triggerLabel = triggerLabels[trigger] ?? trigger;

  return {
    summary: `Escalated: ${triggerLabel}`,
    paragraphs: [
      reason ?? `Escalated because: ${triggerLabel}.`,
      previousOwner && newOwner ? `Responsibility has moved from ${previousOwner} to ${newOwner}.` : '',
      'Both parties have been notified. The previous owner\'s action is preserved in the pupil timeline.',
    ].filter(Boolean),
    evidence: [],
  };
}

// ── Q8: Why did the confidence change? ───────────────────────────────────────

export function explainConfidenceChange(
  currentConfidence: number | null | undefined,
  previousConfidence: number | null | undefined,
  dataSources: string[] | null | undefined,
  keyReasons: string[] | null | undefined,
): Explanation {
  const curr = currentConfidence ?? 0;
  const prev = previousConfidence ?? 0;
  const delta = curr - prev;
  const sources = (dataSources ?? []).map(s => s.replace(/_/g, ' '));

  let changeText: string;
  if (Math.abs(delta) < 5) changeText = 'Confidence is unchanged since the last analysis.';
  else if (delta > 0) changeText = `Confidence increased by ${delta.toFixed(0)} points — new corroborating evidence has been added.`;
  else changeText = `Confidence decreased by ${Math.abs(delta).toFixed(0)} points — some evidence has been resolved or aged out.`;

  return {
    summary: `${curr.toFixed(0)}% confidence${Math.abs(delta) >= 5 ? ` (${delta > 0 ? '+' : ''}${delta.toFixed(0)} from last run)` : ''}`,
    paragraphs: [
      changeText,
      sources.length > 0 ? `Currently active sources: ${sources.join(', ')}.` : 'Only one data source active.',
      sources.length < 2 ? 'Confidence would increase if more data sources were connected or recent records were added.' : '',
    ].filter(Boolean),
    evidence: bullets(keyReasons as string[]),
  };
}

// ── Q9: Why is this pupil no longer in my queue? ─────────────────────────────

export function explainRemoval(
  reason: 'completed' | 'escalated' | 'reassigned' | 'improved' | 'evidence_hash_unchanged',
  actionType: string | null | undefined,
  completedBy: string | null | undefined,
  newOwner: string | null | undefined,
): Explanation {
  const messages: Record<string, { summary: string; text: string }> = {
    completed: {
      summary: 'Action completed',
      text: `You marked the ${actionType ?? 'action'} as complete. The pupil has been removed from your personal workload. Any other open responsibilities (e.g. a separate safeguarding or SEND action) remain active for the relevant colleagues.`,
    },
    escalated: {
      summary: 'Escalated to next owner',
      text: `This action has been escalated${newOwner ? ` to ${newOwner}` : ''}. It has moved out of your personal queue. The completed intervention remains visible in the pupil timeline.`,
    },
    reassigned: {
      summary: 'Reassigned to another user',
      text: `The action was reassigned${newOwner ? ` to ${newOwner}` : ''}. You no longer have an active responsibility for this pupil unless a new action is assigned to you.`,
    },
    improved: {
      summary: 'Signal resolved — improvement confirmed',
      text: `Re-analysis detected measurable improvement. The concern no longer meets the threshold for action. The pupil will reappear if the situation changes.`,
    },
    evidence_hash_unchanged: {
      summary: 'Reanalysis — no new evidence',
      text: `Analysis ran again but found no new evidence. The previous action was completed, and no new action was generated because the evidence has not materially changed. This prevents duplicate actions on unchanged data.`,
    },
  };

  const msg = messages[reason] ?? { summary: 'Removed from queue', text: 'This pupil is no longer in your personal workload.' };

  return {
    summary: msg.summary,
    paragraphs: [msg.text],
    evidence: [],
  };
}
