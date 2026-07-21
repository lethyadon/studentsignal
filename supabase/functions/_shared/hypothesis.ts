/**
 * hypothesis.ts — Student Signal hypothesis engine
 *
 * This is what separates StudentSignal from a reporting dashboard.
 *
 * A reporting dashboard says: "Attendance is falling."
 * The hypothesis engine says: "Most likely explanation: attendance decline began
 * immediately after a friendship breakdown recorded in pastoral notes. Since then
 * behaviour has escalated in English and Maths only. Parent communications
 * reference anxiety before school. Confidence: High."
 *
 * APPROACH
 * 1. Build a unified chronological timeline from all sources for a student.
 * 2. Look for temporal correlations: did X happen before Y? Did Z follow?
 * 3. Generate candidate hypotheses — explanatory framings that fit the sequence.
 * 4. Score each hypothesis by how many independent sources support it.
 * 5. Return the most supported hypothesis with confidence level and evidence trail.
 *
 * The engine does not require AI. Pattern matching over a structured timeline
 * with explicit correlation logic is deterministic, auditable, and fast.
 * It can be enhanced with LLM synthesis later — but the intelligence structure
 * must exist first. This provides that structure.
 */

// ─── Unified timeline event ───────────────────────────────────────────────────

export type EventSource =
  | 'behaviour'
  | 'attendance'
  | 'pastoral_note'
  | 'quick_note'
  | 'communication'
  | 'safeguarding'
  | 'staff_observation';

export interface TimelineEvent {
  date: Date;
  source: EventSource;
  system: string;              // e.g. 'classcharts', 'cpoms', 'manual', 'arbor'
  category: string;            // incident type, note category, communication type
  text: string;                // the actual content — note, comment, summary
  severity: number;            // 1–5 scale normalised across sources
  staffMember: string | null;
  meta: Record<string, unknown>;
}

// ─── Hypothesis ───────────────────────────────────────────────────────────────

export type ConfidenceLevel = 'high' | 'medium' | 'low' | 'speculative';

export interface Hypothesis {
  id: string;
  type: HypothesisType;
  headline: string;            // "Most likely explanation: ..."
  narrative: string;           // full human-language paragraph
  confidence: ConfidenceLevel;
  confidenceReason: string;    // why this confidence level was assigned
  supportingEvents: TimelineEvent[];
  // What the hypothesis predicts will happen next if unaddressed
  predictedEscalation: string | null;
  // The recommended action that follows from THIS hypothesis specifically
  recommendedAction: string;
  recommendedRole: string;
  urgency: 'urgent' | 'high' | 'medium' | 'low';
}

export type HypothesisType =
  | 'social_trigger'           // pastoral/friendship event preceded decline
  | 'anxiety_presentation'     // pattern of anxiety markers across sources
  | 'safeguarding_concern'     // independent adults reporting similar changes
  | 'subject_specific_distress'// behaviour concentrated in specific subjects
  | 'home_circumstance'        // communications suggest home difficulties
  | 'peer_influence'           // co-incident pattern with named peers
  | 'send_unmet_need'          // SEND record + decline = provision gap
  | 'attendance_avoidance'     // attendance + anxiety markers = school avoidance
  | 'bereavement_or_loss'      // language across notes suggests loss
  | 'positive_trajectory'      // multi-source evidence of genuine improvement
  | 'multi_observer_concern';  // multiple independent adults flagging changes

// ─── Evidence bundle ──────────────────────────────────────────────────────────

export interface EvidenceBundle {
  studentId: string;
  studentName: string;
  yearGroup: string;
  sendStatus: string | null;
  pupilPremium: boolean;
  timeline: TimelineEvent[];
  hypotheses: Hypothesis[];
  primaryHypothesis: Hypothesis | null;
  // Raw evidence counts for the confidence calculation
  independentObservers: number;     // distinct staff members who flagged concern
  daySpan: number;                  // how many days the concern spans
  sourceCount: number;              // how many distinct systems contributed
}

// ─── Input types (what the engine receives from normaliseStudents) ─────────────

export interface HypothesisInput {
  studentId: string;
  studentName: string;
  yearGroup: string;
  sendStatus: string | null;
  pupilPremium: boolean;
  // Raw records — the engine needs the actual events, not aggregates
  behaviourRecords: Array<{
    date: string; incident_type: string; behaviour_points: number;
    subject: string | null; lesson_period: string | null;
    staff_member: string | null; comment: string | null; source?: string | null;
    /** RE-AUTHORED EXTENSION 19 Jul 2026: canonical positive/negative/neutral class */
    behaviour_class?: 'positive' | 'negative' | 'neutral' | null;
  }>;
  attendanceRecords: Array<{
    record_date: string; attendance_percentage: number | null;
    /** RE-AUTHORED EXTENSION 19 Jul 2026: structured Arbor fields */
    late_marks?: number | null;
    attendance_concern?: 'none' | 'monitor' | 'persistent_absence' | null;
  }>;
  pastoralNotes: Array<{
    note_date: string | null; note: string | null;
    priority: string | null; staff_member?: string | null; source?: string | null;
  }>;  // staff_member preserved for independent observer counting
  quickNotes: Array<{
    date: string; note: string; category: string; concern_level: number;
    staff_member?: string | null; source?: string | null;
  }>;
  communications: Array<{
    date: string; summary: string | null; priority: string | null;
    source?: string | null; staff_member?: string | null;
  }>;  // source: email|phone|meeting etc — preserved from CommunicationRow
  safeguardingRecords: Array<{
    incident_date: string | null; incident_type: string | null;
    summary: string | null; severity: string | null;
    /** RE-AUTHORED EXTENSION 19 Jul 2026: independently queryable CPOMS fields */
    category?: string | null;
    subcategory?: string | null;
    status?: 'open' | 'closed' | null;
    assigned_to?: string | null;
  }>;
}

// ─── Keyword matchers ─────────────────────────────────────────────────────────

const ANXIETY_TERMS = [
  'anxious', 'anxiety', 'worried', 'nervous', 'panic', 'scared', 'frightened',
  'before school', 'doesn\'t want to come', 'refuses to come', 'school refusal',
  'stomach ache', 'headache', 'feeling sick', 'not sleeping', 'sleep', 'awake',
  'overwhelmed', 'can\'t cope', 'stressed', 'pressure',
  // ClassCharts / MIS language
  'late to lesson', 'late to school', 'not in lesson', 'refuses to enter',
  'leaving lesson', 'walked out', 'corridor', 'outside room',
];

const SOCIAL_TERMS = [
  'friend', 'friendship', 'falling out', 'argument', 'isolated', 'alone',
  'sitting alone', 'no one to sit with', 'excluded', 'left out', 'bullying',
  'bully', 'group', 'peer', 'social', 'lonely', 'social media', 'online',
];

const HOME_TERMS = [
  'home', 'parent', 'mum', 'dad', 'family', 'parents split', 'separated',
  'divorce', 'sibling', 'bereavement', 'death', 'died', 'loss', 'funeral',
  'domestic', 'housing', 'moved', 'eviction', 'financial', 'money',
  // ClassCharts intelligence event language
  'uniform', 'equipment', 'no kit', 'wrong shoes', 'no tie',
  'hygiene', 'appearance', 'makeup', 'make up', 'excessive make',
  // Parent message language
  'struggling at home', 'problems at home', 'difficult at home', 'situation at home',
];

const WITHDRAWAL_TERMS = [
  'withdrawn', 'quiet', 'subdued', 'unlike', 'not themselves', 'change',
  'different', 'disengaged', 'flat', 'sad', 'tearful', 'crying', 'upset',
  'appearance', 'tired', 'exhausted', 'hungry', 'not eating',
  // ClassCharts-specific
  'late', 'punctuality', 'uniform issue', 'equipment issue',
  'not engaging', 'head down', 'refusing to work',
];

const BEREAVEMENT_TERMS = [
  'bereavement', 'death', 'died', 'passed away', 'funeral', 'loss', 'grief',
  'grieving', 'grandparent', 'grandmother', 'grandfather', 'parent died',
];

// Presentation/home signals — uniform, hygiene, equipment issues
// Multiple occurrences across a short window indicate possible home difficulty.
const PRESENTATION_TERMS = [
  'uniform', 'equipment', 'no kit', 'wrong shoes', 'no tie', 'no blazer',
  'makeup', 'make up', 'excessive make', 'jewellery', 'no pe kit',
  'hygiene', 'appearance', 'smell', 'dirty', 'unwashed',
  'no lunch', 'no food', 'hungry',
];

function matchesTerms(text: string, terms: string[]): boolean {
  const lower = text.toLowerCase();
  return terms.some(t => lower.includes(t));
}

function extractMatchedTerms(text: string, terms: string[]): string[] {
  const lower = text.toLowerCase();
  return terms.filter(t => lower.includes(t));
}

// ─── Severity normalisation ───────────────────────────────────────────────────

function normaliseSeverity(source: EventSource, meta: Record<string, unknown>): number {
  switch (source) {
    case 'behaviour': {
      const pts = Number(meta.points ?? 0);
      return pts >= 15 ? 5 : pts >= 10 ? 4 : pts >= 5 ? 3 : pts >= 2 ? 2 : 1;
    }
    case 'quick_note':
    case 'staff_observation':
      return Math.min(5, Math.max(1, Number(meta.concern_level ?? 2)));
    case 'safeguarding':
      return meta.severity === 'critical' || meta.severity === 'high' ? 5 : 4;
    case 'communication':
      return meta.priority === 'urgent' ? 4 : meta.priority === 'high' ? 3 : 2;
    case 'pastoral_note':
      return meta.priority === 'urgent' ? 4 : meta.priority === 'high' ? 3 : 2;
    case 'attendance':
      const pct = Number(meta.attendance_pct ?? 95);
      return pct < 80 ? 5 : pct < 85 ? 4 : pct < 90 ? 3 : pct < 95 ? 2 : 1;
    default:
      return 2;
  }
}

// ─── Build unified timeline ───────────────────────────────────────────────────

function buildTimeline(input: HypothesisInput): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  for (const b of input.behaviourRecords) {
    // Positive behaviour must never enter the concern timeline. The canonical
    // behaviour_class is authoritative when present; the points guard remains
    // as defence in depth for legacy rows.
    if (b.behaviour_class === 'positive') continue;
    if (b.behaviour_points <= 0) continue;
    events.push({
      date: new Date(b.date),
      source: 'behaviour',
      system: b.source ?? 'unknown',
      category: b.incident_type ?? 'Incident',
      text: [b.comment, b.subject && `(${b.subject})`, b.lesson_period && `Period ${b.lesson_period}`]
        .filter(Boolean).join(' '),
      severity: normaliseSeverity('behaviour', { points: b.behaviour_points }),
      staffMember: b.staff_member,
      meta: { points: b.behaviour_points, subject: b.subject, period: b.lesson_period },
    });
  }

  for (const a of input.attendanceRecords) {
    const pct = Number(a.attendance_percentage ?? 100);
    const concern = a.attendance_concern ?? null;
    const lateMarks = a.late_marks ?? null;
    if (pct >= 97 && concern !== 'persistent_absence' && (lateMarks ?? 0) < 5) continue; // ignore noise
    const baseSeverity = normaliseSeverity('attendance', { attendance_pct: pct });
    events.push({
      date: new Date(a.record_date),
      source: 'attendance',
      system: 'mis',
      category: concern === 'persistent_absence'
        ? 'Persistent absence'
        : pct < 80 ? 'Persistent absence' : pct < 90 ? 'Low attendance' : 'Below target',
      text: `Attendance recorded at ${pct}%`
        + (lateMarks != null && lateMarks > 0 ? `; ${lateMarks} late marks` : '')
        + (concern && concern !== 'none' ? `; MIS flag: ${concern.replace('_', ' ')}` : ''),
      // A source-system persistent-absence flag is itself evidence: never below severity 3.
      severity: concern === 'persistent_absence' ? Math.max(baseSeverity, 3) : baseSeverity,
      staffMember: null,
      meta: { pct, late_marks: lateMarks, attendance_concern: concern },
    });
  }

  for (const p of input.pastoralNotes) {
    if (!p.note || !p.note_date) continue;
    events.push({
      date: new Date(p.note_date),
      source: 'pastoral_note',
      system: p.source ?? 'unknown',
      category: p.priority ?? 'pastoral',
      text: p.note,
      severity: normaliseSeverity('pastoral_note', { priority: p.priority }),
      staffMember: p.staff_member ?? null,  // real author, not cast
      meta: { priority: p.priority, system: p.source },
    });
  }

  for (const q of input.quickNotes) {
    if (!q.note) continue;
    events.push({
      date: new Date(q.date),
      source: q.category === 'Safeguarding review prompt' ? 'safeguarding' : 'quick_note',
      system: q.source ?? 'manual',
      category: q.category,
      text: q.note,
      severity: normaliseSeverity('quick_note', { concern_level: q.concern_level }),
      staffMember: q.staff_member ?? null,
      meta: { concern_level: q.concern_level, category: q.category },
    });
  }

  for (const c of input.communications) {
    if (!c.summary) continue;
    events.push({
      date: new Date(c.date),
      source: 'communication',
      system: c.source ?? 'phone',
      category: c.source ?? 'contact',
      text: c.summary,
      severity: normaliseSeverity('communication', { priority: c.priority }),
      staffMember: c.staff_member ?? null,  // who logged it
      meta: { priority: c.priority, channel: c.source },
    });
  }

  for (const s of input.safeguardingRecords) {
    if (!s.incident_date) continue;
    const isClosed = s.status === 'closed';
    const baseSeverity = normaliseSeverity('safeguarding', { severity: s.severity });
    events.push({
      date: new Date(s.incident_date),
      source: 'safeguarding',
      system: 'cpoms',
      category: [s.category ?? s.incident_type ?? 'Safeguarding', s.subcategory]
        .filter(Boolean).join(' — ') + (isClosed ? ' (closed)' : ''),
      text: s.summary ?? 'Safeguarding record',
      // Closed concerns stay on the timeline as history but carry reduced
      // weight: they are context, not live risk. Open concerns keep full weight.
      severity: isClosed ? Math.max(1, baseSeverity - 2) : baseSeverity,
      staffMember: s.assigned_to ?? null,
      meta: {
        severity: s.severity, type: s.incident_type,
        category: s.category ?? null, subcategory: s.subcategory ?? null,
        status: s.status ?? 'open',
      },
    });
  }

  return events.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ─── Confidence scoring ───────────────────────────────────────────────────────

function scoreConfidence(
  supportingEvents: TimelineEvent[],
  independentObservers: number,
  temporalCorrelation: boolean, // did events cluster in time?
  multiDomain: boolean,         // do multiple source types agree?
): { level: ConfidenceLevel; reason: string } {
  const sourceTypes = new Set(supportingEvents.map(e => e.source));
  const sourceDiversity = sourceTypes.size;

  if (independentObservers >= 3 && sourceDiversity >= 3 && temporalCorrelation) {
    return {
      level: 'high',
      reason: `${independentObservers} independent adults across ${sourceDiversity} systems reported consistent observations within a short timeframe`,
    };
  }
  if (independentObservers >= 2 && sourceDiversity >= 2) {
    return {
      level: multiDomain ? 'high' : 'medium',
      reason: `${independentObservers} independent observers across ${sourceDiversity} data sources`,
    };
  }
  if (independentObservers >= 2 || sourceDiversity >= 2) {
    return {
      level: 'medium',
      reason: sourceDiversity >= 2
        ? `${sourceDiversity} independent systems flagging the same concern`
        : `${independentObservers} staff members flagging independently`,
    };
  }
  if (supportingEvents.length >= 3) {
    return {
      level: 'low',
      reason: `Pattern visible across ${supportingEvents.length} events but from limited independent sources`,
    };
  }
  return {
    level: 'speculative',
    reason: 'Limited evidence — hypothesis based on single source or isolated observation',
  };
}

// ─── Days between events ─────────────────────────────────────────────────────

function daysBetween(a: Date, b: Date): number {
  return Math.abs(Math.round((b.getTime() - a.getTime()) / 86_400_000));
}

// ─── Hypothesis detectors ─────────────────────────────────────────────────────

function detectSocialTrigger(
  timeline: TimelineEvent[],
): Hypothesis | null {
  // Look for: pastoral/quick note about friendship/social, followed within 3 weeks
  // by attendance decline or behaviour change

  const socialEvents = timeline.filter(e =>
    (e.source === 'pastoral_note' || e.source === 'quick_note') &&
    matchesTerms(e.text, SOCIAL_TERMS)
  );
  if (socialEvents.length === 0) return null;

  const earliest = socialEvents[0];

  // Did attendance or behaviour worsen within 21 days after the social event?
  const threeDays = 21;
  const subsequentDecline = timeline.filter(e =>
    e.date > earliest.date &&
    daysBetween(earliest.date, e.date) <= threeDays &&
    (e.source === 'attendance' || e.source === 'behaviour') &&
    e.severity >= 3
  );

  if (subsequentDecline.length === 0) return null;

  const subjects = [...new Set(
    subsequentDecline
      .filter(e => e.source === 'behaviour' && e.meta.subject)
      .map(e => String(e.meta.subject))
  )];

  const socialTermsFound = extractMatchedTerms(
    socialEvents.map(e => e.text).join(' '), SOCIAL_TERMS
  ).slice(0, 3);

  const observers = new Set([
    ...socialEvents.map(e => e.staffMember),
    ...subsequentDecline.map(e => e.staffMember),
  ].filter(Boolean));

  const confidence = scoreConfidence(
    [...socialEvents, ...subsequentDecline],
    observers.size,
    true, // temporal correlation confirmed
    true
  );

  return {
    id: 'social_trigger',
    type: 'social_trigger',
    headline: `Most likely explanation: a social or relationship difficulty`,
    narrative:
      `A pastoral observation about ${socialTermsFound.length > 0 ? socialTermsFound.join(' / ') : 'social concerns'} ` +
      `was recorded on ${earliest.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. ` +
      `Within ${daysBetween(earliest.date, subsequentDecline[0].date)} days, ` +
      (subsequentDecline.some(e => e.source === 'attendance')
        ? `attendance began declining`
        : subjects.length > 0
          ? `behaviour incidents appeared — concentrated in ${subjects.join(' and ')}`
          : `behaviour concerns emerged`) +
      `. The timing suggests the social difficulty is the root cause, not the behaviours themselves.` +
      (socialEvents.length > 1 ? ` ${socialEvents.length} separate observations reference the same social pattern.` : ''),
    confidence: confidence.level,
    confidenceReason: confidence.reason,
    supportingEvents: [...socialEvents, ...subsequentDecline],
    predictedEscalation: 'Unaddressed friendship breakdown typically leads to sustained attendance avoidance within 4–6 weeks.',
    recommendedAction: 'Pastoral check-in focused on peer relationships, not the behaviour itself. Consider whether mediation or form-group review is appropriate.',
    recommendedRole: 'tutor',
    urgency: confidence.level === 'high' ? 'high' : 'medium',
  };
}

function detectAnxietyPresentation(
  timeline: TimelineEvent[],
  input: HypothesisInput,
): Hypothesis | null {
  // Look for: anxiety language across at least 2 independent sources

  const anxietyEvents = timeline.filter(e =>
    matchesTerms(e.text, ANXIETY_TERMS)
  );
  if (anxietyEvents.length < 2) return null;

  const sourcesWithAnxiety = new Set(anxietyEvents.map(e => e.source));
  if (sourcesWithAnxiety.size < 2 && anxietyEvents.length < 3) return null;

  const observers = new Set(anxietyEvents.map(e => e.staffMember).filter(Boolean));

  // Is attendance also affected?
  const attendanceEvents = timeline.filter(e => e.source === 'attendance' && e.severity >= 3);
  const attendanceAffected = attendanceEvents.length > 0;

  // Is there a pattern of before-school timing?
  const beforeSchoolRefs = anxietyEvents.filter(e =>
    matchesTerms(e.text, ['before school', 'morning', 'getting to school', "doesn't want"])
  );

  const confidence = scoreConfidence(
    anxietyEvents,
    observers.size,
    true,
    sourcesWithAnxiety.size >= 2
  );

  const sourceList = [...sourcesWithAnxiety].map(s =>
    s === 'quick_note' ? 'staff observation' :
    s === 'pastoral_note' ? 'pastoral record' :
    s === 'communication' ? 'parent contact' : s
  ).join(', ');

  return {
    id: 'anxiety_presentation',
    type: 'anxiety_presentation',
    headline: `Possible anxiety presentation`,
    narrative:
      `Anxiety-related language appears across ${anxietyEvents.length} records from ${sourcesWithAnxiety.size} different sources (${sourceList}). ` +
      (observers.size >= 2 ? `${observers.size} different staff members have independently noted the same presentation. ` : '') +
      (attendanceAffected ? `Attendance has also declined, consistent with anxiety-driven school avoidance. ` : '') +
      (beforeSchoolRefs.length > 0 ? `References to pre-school anxiety specifically suggest the trigger is related to the school environment or social situation on arrival. ` : '') +
      `This pattern is more consistent with anxiety than with deliberate non-compliance or low motivation.`,
    confidence: confidence.level,
    confidenceReason: confidence.reason,
    supportingEvents: [...anxietyEvents, ...attendanceEvents],
    predictedEscalation: attendanceAffected
      ? 'Anxiety-driven attendance issues typically worsen without early intervention. Risk of full school refusal within 4–8 weeks if unaddressed.'
      : null,
    recommendedAction: attendanceAffected
      ? 'Pastoral wellbeing conversation followed by referral to school counsellor or SEMH lead. Attendance should not be addressed punitively until welfare concern is resolved.'
      : 'Pastoral wellbeing check-in. Explore triggers with student in a low-pressure setting.',
    recommendedRole: 'pastoral_lead',
    urgency: attendanceAffected ? 'high' : 'medium',
  };
}

function detectMultiObserverConcern(
  timeline: TimelineEvent[],
): Hypothesis | null {
  // Core of the "possible emerging safeguarding concern" pattern:
  // multiple independent adults reporting changes in mood, appearance, or behaviour
  // within a short window — individually sub-threshold, together significant.

  const concernEvents = timeline.filter(e =>
    e.severity >= 2 &&
    (e.source === 'quick_note' || e.source === 'pastoral_note' || e.source === 'staff_observation') &&
    matchesTerms(e.text, WITHDRAWAL_TERMS)
  );

  if (concernEvents.length < 2) return null;

  // Must be from independent observers (different staff)
  const observerSet = new Set(concernEvents.map(e => e.staffMember).filter(Boolean));
  if (observerSet.size < 2) return null;

  // Cluster within 14 days
  const sorted = [...concernEvents].sort((a, b) => a.date.getTime() - b.date.getTime());
  const windowEvents = [];
  for (let i = 0; i < sorted.length; i++) {
    const cluster = sorted.filter(e =>
      daysBetween(sorted[i].date, e.date) <= 14
    );
    if (cluster.length >= 2) {
      const clusterObservers = new Set(cluster.map(e => e.staffMember).filter(Boolean));
      if (clusterObservers.size >= 2) {
        windowEvents.push(...cluster);
        break;
      }
    }
  }

  if (windowEvents.length < 2) return null;

  const uniqueWindowEvents = [...new Map(windowEvents.map(e => [e.date.toISOString() + e.text, e])).values()];
  const uniqueObservers = new Set(uniqueWindowEvents.map(e => e.staffMember).filter(Boolean));

  // Extract what was specifically observed
  const observedChanges = uniqueWindowEvents.map(e => {
    const terms = extractMatchedTerms(e.text, WITHDRAWAL_TERMS);
    return terms.length > 0 ? terms[0] : null;
  }).filter(Boolean) as string[];

  const distinctChanges = [...new Set(observedChanges)].slice(0, 3);

  const dayWindow = daysBetween(uniqueWindowEvents[0].date, uniqueWindowEvents[uniqueWindowEvents.length - 1].date) || 1;

  const confidence = scoreConfidence(
    uniqueWindowEvents,
    uniqueObservers.size,
    true,
    false
  );

  return {
    id: 'multi_observer_concern',
    type: 'multi_observer_concern',
    headline: `Possible emerging concern: multiple independent observations of change`,
    narrative:
      `${uniqueObservers.size} independent adults have reported signs of change in this student within ${dayWindow} days — ` +
      (distinctChanges.length > 0
        ? `specifically: ${distinctChanges.join(', ')}.`
        : `changes in mood, behaviour, or presentation.`) +
      ` Individually, none of these observations reached threshold. Together, they form a pattern that warrants a wellbeing conversation. ` +
      `The observations came from separate members of staff with no apparent coordination, which strengthens their significance.`,
    confidence: confidence.level,
    confidenceReason: confidence.reason,
    supportingEvents: uniqueWindowEvents,
    predictedEscalation: 'Unaddressed multi-observer concern patterns are frequently identified retrospectively in serious case reviews. Early conversation costs little; delay can be significant.',
    recommendedAction: 'Arrange a low-key wellbeing conversation with a trusted adult. Do not alert the student that multiple reports have been made — keep the conversation exploratory.',
    recommendedRole: 'pastoral_lead',
    urgency: uniqueObservers.size >= 3 ? 'high' : 'medium',
  };
}

function detectSubjectSpecificDistress(
  timeline: TimelineEvent[],
): Hypothesis | null {
  const behaviourEvents = timeline.filter(e => e.source === 'behaviour' && e.severity >= 2);
  if (behaviourEvents.length < 3) return null;

  // Count by subject
  const subjectCounts = new Map<string, TimelineEvent[]>();
  for (const e of behaviourEvents) {
    const subj = String(e.meta.subject ?? '');
    if (!subj) continue;
    if (!subjectCounts.has(subj)) subjectCounts.set(subj, []);
    subjectCounts.get(subj)!.push(e);
  }

  // Find dominant subject with >= 60% concentration
  const total = behaviourEvents.filter(e => e.meta.subject).length;
  if (total < 3) return null;

  const dominant = [...subjectCounts.entries()]
    .sort((a, b) => b[1].length - a[1].length)[0];
  if (!dominant) return null;

  const [subject, subjectEvents] = dominant;
  const concentration = subjectEvents.length / total;
  if (concentration < 0.55) return null; // not concentrated enough

  // Is there corroboration from pastoral/comms?
  const corroborating = timeline.filter(e =>
    (e.source === 'pastoral_note' || e.source === 'quick_note' || e.source === 'communication') &&
    (e.text.toLowerCase().includes(subject.toLowerCase()) ||
     matchesTerms(e.text, ANXIETY_TERMS))
  );

  const observers = new Set([
    ...subjectEvents.map(e => e.staffMember),
    ...corroborating.map(e => e.staffMember),
  ].filter(Boolean));

  const confidence = scoreConfidence(
    [...subjectEvents, ...corroborating],
    observers.size,
    false,
    corroborating.length > 0
  );

  return {
    id: 'subject_specific_distress',
    type: 'subject_specific_distress',
    headline: `Subject-specific difficulty — not a general behaviour pattern`,
    narrative:
      `${Math.round(concentration * 100)}% of behaviour incidents are concentrated in ${subject} ` +
      `(${subjectEvents.length} of ${total} logged incidents). ` +
      `This pattern is unlikely to reflect deliberate misbehaviour and more likely reflects a specific difficulty — ` +
      `curriculum content, classroom environment, teacher relationship, or an underlying learning need. ` +
      (corroborating.length > 0
        ? `This is corroborated by ${corroborating.length} pastoral or communication record${corroborating.length > 1 ? 's' : ''} referencing similar themes. `
        : '') +
      `Treating this as a general behaviour concern risks missing the actual cause.`,
    confidence: confidence.level,
    confidenceReason: confidence.reason,
    supportingEvents: [...subjectEvents, ...corroborating],
    predictedEscalation: `If the subject-specific trigger is not identified, incidents will likely escalate or the student will begin avoiding the subject entirely.`,
    recommendedAction: `Alert the ${subject} department. Request a brief conversation between the subject teacher and form tutor before any formal behaviour intervention. Consider whether a SEND or learning needs assessment is appropriate.`,
    recommendedRole: 'head_of_year',
    urgency: 'medium',
  };
}

function detectHomeCircumstance(
  timeline: TimelineEvent[],
): Hypothesis | null {
  const homeEvents = timeline.filter(e =>
    matchesTerms(e.text, HOME_TERMS) &&
    (e.source === 'communication' || e.source === 'pastoral_note' ||
     e.source === 'quick_note' || e.source === 'safeguarding')
  );

  if (homeEvents.length < 2) return null;

  const sources = new Set(homeEvents.map(e => e.source));
  if (sources.size < 2 && homeEvents.length < 3) return null;

  // Did behaviour or attendance worsen alongside home events?
  const declineAfterHome = timeline.filter(e =>
    (e.source === 'behaviour' || e.source === 'attendance') &&
    e.severity >= 3 &&
    homeEvents.some(h => h.date <= e.date)
  );

  const terms = extractMatchedTerms(homeEvents.map(e => e.text).join(' '), HOME_TERMS).slice(0, 4);
  const isBereavementRelated = matchesTerms(homeEvents.map(e => e.text).join(' '), BEREAVEMENT_TERMS);
  const observers = new Set(homeEvents.map(e => e.staffMember).filter(Boolean));

  const confidence = scoreConfidence(
    [...homeEvents, ...declineAfterHome],
    observers.size,
    declineAfterHome.length > 0,
    sources.size >= 2
  );

  return {
    id: 'home_circumstance',
    type: 'home_circumstance',
    headline: isBereavementRelated
      ? `Likely bereavement or significant loss`
      : `Home or family circumstances appear to be a contributing factor`,
    narrative:
      (isBereavementRelated
        ? `References to bereavement or loss appear across ${homeEvents.length} records. `
        : `References to home or family circumstances (${terms.join(', ')}) appear across ${homeEvents.length} records from ${sources.size} sources. `) +
      (declineAfterHome.length > 0
        ? `School performance has declined in the same period, suggesting the home situation is directly affecting the student's capacity to engage. `
        : '') +
      (isBereavementRelated
        ? `Bereavement responses vary significantly — some students present with withdrawal, others with challenging behaviour. Both should be understood in this context rather than addressed through standard behaviour management.`
        : `This pattern suggests the student may need pastoral support that addresses home circumstances, not just in-school interventions.`),
    confidence: confidence.level,
    confidenceReason: confidence.reason,
    supportingEvents: [...homeEvents, ...declineAfterHome],
    predictedEscalation: isBereavementRelated
      ? 'Unaddressed grief can present as school refusal, persistent absence, or emotional dysregulation months after the initial loss.'
      : 'Unaddressed home difficulties often manifest as escalating attendance problems or emotional outbursts within 4–6 weeks. Without pastoral contact, families in difficulty may disengage from school entirely.',
    recommendedAction: isBereavementRelated
      ? 'Sensitive pastoral conversation. Consider referral to school counsellor or bereavement support. Inform relevant staff that context may explain changes in engagement.'
      : 'Pastoral conversation to understand home situation. Consider Early Help referral if there are indicators of need. Ensure class teachers are briefed on context.',
    recommendedRole: 'pastoral_lead',
    urgency: isBereavementRelated ? 'high' : 'medium',
  };
}

function detectAttendanceAvoidance(
  timeline: TimelineEvent[],
  input: HypothesisInput,
): Hypothesis | null {
  const attendanceEvents = timeline.filter(e =>
    e.source === 'attendance' && e.severity >= 3
  );
  if (attendanceEvents.length < 2) return null;

  // Is it getting worse? Check trend
  const sorted = [...attendanceEvents].sort((a, b) => a.date.getTime() - b.date.getTime());
  const firstHalf = sorted.slice(0, Math.ceil(sorted.length / 2));
  const secondHalf = sorted.slice(Math.ceil(sorted.length / 2));
  const avgFirst = firstHalf.reduce((s, e) => s + Number(e.meta.pct ?? 0), 0) / (firstHalf.length || 1);
  const avgSecond = secondHalf.reduce((s, e) => s + Number(e.meta.pct ?? 0), 0) / (secondHalf.length || 1);
  const isTrending = avgSecond < avgFirst - 3;

  // Corroboration: anxiety or home language from any source
  const anxietyEvents = timeline.filter(e =>
    matchesTerms(e.text, ANXIETY_TERMS) || matchesTerms(e.text, HOME_TERMS)
  );

  if (anxietyEvents.length === 0 && !isTrending) return null;

  const parentComms = timeline.filter(e =>
    e.source === 'communication' &&
    matchesTerms(e.text, ['absence', 'won\'t come', 'refusing', 'can\'t get', 'unwell', 'sick'])
  );

  const observers = new Set([
    ...attendanceEvents.map(e => e.staffMember),
    ...anxietyEvents.map(e => e.staffMember),
  ].filter(Boolean));

  const confidence = scoreConfidence(
    [...attendanceEvents, ...anxietyEvents],
    observers.size,
    isTrending,
    anxietyEvents.length > 0
  );

  const latestPct = Number(sorted[sorted.length - 1].meta.pct ?? 0);

  return {
    id: 'attendance_avoidance',
    type: 'attendance_avoidance',
    headline: `Attendance decline consistent with anxiety-based avoidance`,
    narrative:
      `Attendance ${isTrending ? `has been declining` : `is below target`} — now at ${latestPct}% — ` +
      (isTrending ? `with a clear downward trend (${Math.round(avgFirst)}% to ${Math.round(avgSecond)}%). ` : '') +
      (anxietyEvents.length > 0
        ? `This is accompanied by ${anxietyEvents.length} record${anxietyEvents.length > 1 ? 's' : ''} referencing anxiety, avoidance, or home concerns — suggesting the absence is not straightforward illness or truancy. `
        : '') +
      (parentComms.length > 0
        ? `Parent communications reference difficulty getting the student to school, which is consistent with anxiety-based avoidance rather than deliberate non-attendance. `
        : '') +
      `Attendance-focused interventions alone (letters, penalties) are unlikely to be effective without addressing the underlying cause.`,
    confidence: confidence.level,
    confidenceReason: confidence.reason,
    supportingEvents: [...attendanceEvents, ...anxietyEvents, ...parentComms],
    predictedEscalation: `Without intervention, this pattern typically reaches the persistent absence threshold (below 90%) within 2–4 weeks.`,
    recommendedAction: latestPct < 85
      ? `Arrange an urgent pastoral conversation with student and parent/carer. Explore specific anxiety triggers. Consider referral to SEMH support. Do not send absence warning letter until welfare check is complete.`
      : `Pastoral check-in to explore reasons for absence before any formal attendance action. Early identification of the trigger is more effective than formal procedures at this stage.`,
    recommendedRole: 'head_of_year',
    urgency: latestPct < 85 ? 'urgent' : 'high',
  };
}

function detectSendUnmetNeed(
  timeline: TimelineEvent[],
  input: HypothesisInput,
): Hypothesis | null {
  if (!input.sendStatus || input.sendStatus === 'N - No SEN' || input.sendStatus === 'None') return null;

  const concernEvents = timeline.filter(e =>
    e.severity >= 2 && e.source !== 'attendance' // any concern
  );
  if (concernEvents.length < 3) return null;

  const sources = new Set(concernEvents.map(e => e.source));

  // Is there a pattern of subject-specific difficulty?
  const subjectEvents = timeline.filter(e =>
    e.source === 'behaviour' && e.meta.subject && e.severity >= 2
  );
  const subjectCounts = new Map<string, number>();
  subjectEvents.forEach(e => {
    const s = String(e.meta.subject);
    subjectCounts.set(s, (subjectCounts.get(s) ?? 0) + 1);
  });

  const confidence = scoreConfidence(concernEvents, new Set(concernEvents.map(e => e.staffMember).filter(Boolean)).size, false, sources.size >= 2);

  return {
    id: 'send_unmet_need',
    type: 'send_unmet_need',
    headline: `SEND record with concurrent concerns — possible provision gap`,
    narrative:
      `This student has an active SEND record (${input.sendStatus}) and ${concernEvents.length} concern indicators across ${sources.size} sources. ` +
      `When a student with identified needs shows escalating concerns, the first question should be whether current provision is adequate. ` +
      (subjectCounts.size > 0
        ? `The pattern of incidents concentrated in ${[...subjectCounts.entries()].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([s])=>s).join(' and ')} may indicate a specific unmet need rather than a general behaviour concern. `
        : '') +
      `Standard pastoral interventions may be insufficient without SEND-informed support.`,
    confidence: confidence.level,
    confidenceReason: confidence.reason,
    supportingEvents: concernEvents.slice(0, 6),
    predictedEscalation: `Unmet SEND needs typically result in escalating incidents or withdrawal. An EHCP review or provision change may be required if current support is insufficient.`,
    recommendedAction: `SENDCo review of current provision and strategies. Share concerns with relevant teachers. Consider whether an EHCP review is appropriate. Inform pastoral lead of SEND context.`,
    recommendedRole: 'sendco',
    urgency: 'medium',
  };
}

function detectPresentationConcern(
  timeline: TimelineEvent[],
): Hypothesis | null {
  // Repeated uniform/equipment/hygiene flags across a short window suggest the
  // student may be experiencing home difficulties. One-off events are noise;
  // three or more within 21 days across different days is a pattern.
  const presentationEvents = timeline.filter(e =>
    matchesTerms(e.text, PRESENTATION_TERMS)
  );
  if (presentationEvents.length < 3) return null;

  // Cluster within 21 days
  const sorted = [...presentationEvents].sort((a, b) => a.date.getTime() - b.date.getTime());
  const windowStart = sorted[0].date;
  const windowEnd   = sorted[sorted.length - 1].date;
  const daySpan = daysBetween(windowStart, windowEnd);
  if (daySpan > 42) return null; // spread too thin to be a cluster

  // Are there also behaviour or attendance signals in the same window?
  const coincidentSignals = timeline.filter(e =>
    e.date >= windowStart && e.date <= windowEnd &&
    (e.source === 'behaviour' || e.source === 'attendance') &&
    e.severity >= 2
  );

  const distinctDays = new Set(presentationEvents.map(e => e.date.toDateString())).size;
  const observers    = new Set(presentationEvents.map(e => e.staffMember).filter(Boolean));

  const eventList = [...new Set(
    presentationEvents.map(e => {
      const terms = extractMatchedTerms(e.text, PRESENTATION_TERMS);
      return terms.length > 0 ? terms[0] : null;
    }).filter(Boolean)
  )].slice(0, 3) as string[];

  const confidence = scoreConfidence(
    presentationEvents,
    observers.size,
    true,
    coincidentSignals.length > 0
  );

  return {
    id: 'presentation_concern',
    type: 'home_circumstance',
    headline: `Possible home difficulty indicated by repeated presentation flags`,
    narrative:
      `${presentationEvents.length} presentation-related observations have been recorded over ${daySpan} days` +
      (eventList.length > 0 ? ` (${eventList.join(', ')})` : '') +
      `. Isolated uniform or equipment issues are common and low-significance; ` +
      `this frequency across ${distinctDays} separate days suggests the student may be experiencing ` +
      `difficulty at home that is affecting their ability to come to school prepared. ` +
      (coincidentSignals.length > 0
        ? `This coincides with ${coincidentSignals.length} behaviour or attendance signal${coincidentSignals.length > 1 ? 's' : ''} in the same period — the combination strengthens the concern. `
        : '') +
      `A sensitive pastoral conversation is more appropriate than a sanctions-based response.`,
    confidence: confidence.level,
    confidenceReason: confidence.reason,
    supportingEvents: [...presentationEvents, ...coincidentSignals.slice(0, 3)],
    predictedEscalation: 'Unaddressed home difficulties often manifest as escalating attendance problems or emotional outbursts within 4–6 weeks.',
    recommendedAction: 'Discreet pastoral conversation exploring home circumstances. Avoid public comments about uniform or hygiene. Consider Early Help referral if home situation appears unstable.',
    recommendedRole: 'tutor',
    urgency: coincidentSignals.length > 0 ? 'high' : 'medium',
  };
}

// ─── Main entry point ─────────────────────────────────────────────────────────

export function generateHypotheses(input: HypothesisInput): EvidenceBundle {
  const timeline = buildTimeline(input);

  // Run all detectors
  const candidates: Hypothesis[] = [];

  const social        = detectSocialTrigger(timeline);
  const anxiety       = detectAnxietyPresentation(timeline, input);
  const multi         = detectMultiObserverConcern(timeline);
  const subject       = detectSubjectSpecificDistress(timeline);
  const home          = detectHomeCircumstance(timeline);
  const avoidance     = detectAttendanceAvoidance(timeline, input);
  const send          = detectSendUnmetNeed(timeline, input);
  const presentation  = detectPresentationConcern(timeline);

  for (const h of [social, anxiety, multi, subject, home, avoidance, send, presentation]) {
    if (h) candidates.push(h);
  }

  // Sort by confidence then urgency
  const confidenceOrder = { high: 0, medium: 1, low: 2, speculative: 3 };
  const urgencyOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  candidates.sort((a, b) => {
    const c = confidenceOrder[a.confidence] - confidenceOrder[b.confidence];
    if (c !== 0) return c;
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });

  // Count independent observers across all concern events
  const allConcernEvents = timeline.filter(e => e.severity >= 2);
  const independentObservers = new Set(allConcernEvents.map(e => e.staffMember).filter(Boolean)).size;
  const daySpan = timeline.length >= 2
    ? daysBetween(timeline[0].date, timeline[timeline.length - 1].date)
    : 0;
  const sourceCount = new Set(timeline.map(e => e.source)).size;

  return {
    studentId: input.studentId,
    studentName: input.studentName,
    yearGroup: input.yearGroup,
    sendStatus: input.sendStatus,
    pupilPremium: input.pupilPremium,
    timeline,
    hypotheses: candidates,
    primaryHypothesis: candidates[0] ?? null,
    independentObservers,
    daySpan,
    sourceCount,
  };
}
