import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { AssignmentRationale, ExplainPanel } from '../components/ExplainPanel';
import ExplainButton from '../components/ExplainButton';
import { explainFlag, explainAssignment, explainPriority } from '../lib/explain';
import type { Explanation } from '../lib/explain';
import { usePersonalQueue } from '../hooks/usePersonalQueue';
import { getStudents, getAnalysisResults, getInterventions, getCommunications, getSchoolProfiles, DEMO_STAFF, MOCK_BEHAVIOUR, getAllDemoSignalStatuses, setDemoSignalStatus, addDemoIntervention, updateDemoIntervention, mapOwnerToStaffName, subscribeToSignalStatuses, subscribeToInterventions, getHOYYearGroup, ALL_YEAR_GROUPS, type SignalStatus } from '../lib/data';
import { canViewSafeguarding, isStudentInScope } from '../lib/permissions';
import type { Student, AnalysisResult, Intervention, Communication, SignalCategory } from '../types';
import type { SchoolProfile } from '../lib/data';
import { Toast, useToast } from '../components/Toast';
import GlobalPriorityBar from '../components/GlobalPriorityBar';
import {
  Layers, AlertTriangle, Eye, TrendingDown, TrendingUp, Star, User,
  ChevronRight, Search, SlidersHorizontal, X, Heart, Shield, Clock,
  Activity, CheckCircle, BookOpen, CalendarDays, Filter, ChevronDown,
  Zap, Flag, Lock, Plus, Archive, RotateCcw, ArrowRight, ChevronUp,
} from 'lucide-react';

// ─────────────────────────────────────────────────────────────────────────────
// Pattern derivation
// ─────────────────────────────────────────────────────────────────────────────

type PatternType =
  | 'escalation'
  | 'withdrawal'
  | 'subject'
  | 'attendance'
  | 'improvement'
  | 'exceptional'
  | 'safeguarding'
  | 'send_concern'
  | 'time_pattern'
  | 'communication_escalation';

interface DerivedPattern {
  type: PatternType;
  label: string;
  confidenceScore: number;
  confidenceLevel: 'high' | 'medium' | 'low';
  evidenceSummary: string[];
  sources: string[];
  suggestedAction: string;
}

const PATTERN_LABELS: Record<PatternType, string> = {
  escalation: 'Escalation Pattern',
  withdrawal: 'Withdrawal Pattern',
  subject: 'Subject Pattern',
  attendance: 'Attendance Concern',
  improvement: 'Improvement Pattern',
  exceptional: 'Exceptional Achievement',
  safeguarding: 'Safeguarding Concern',
  send_concern: 'SEND Support Gap',
  time_pattern: 'Time Pattern',
  communication_escalation: 'Communication Escalation',
};

const PATTERN_COLORS: Record<PatternType, { bg: string; text: string; border: string; dot: string }> = {
  escalation:                { bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500' },
  withdrawal:                { bg: 'bg-purple-50',  text: 'text-purple-700', border: 'border-purple-200', dot: 'bg-purple-500' },
  subject:                   { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-400' },
  attendance:                { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500' },
  improvement:               { bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500' },
  exceptional:               { bg: 'bg-teal-50',    text: 'text-teal-700',   border: 'border-teal-200',   dot: 'bg-teal-500' },
  safeguarding:              { bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-600' },
  send_concern:              { bg: 'bg-violet-50',  text: 'text-violet-700', border: 'border-violet-200', dot: 'bg-violet-500' },
  time_pattern:              { bg: 'bg-slate-50',   text: 'text-slate-700',  border: 'border-slate-200',  dot: 'bg-slate-500' },
  communication_escalation:  { bg: 'bg-orange-50',  text: 'text-orange-700', border: 'border-orange-200', dot: 'bg-orange-500' },
};

function buildEvidenceSummary(analysis: AnalysisResult, student: Student, fallback: string[]): string[] {
  const reasons = analysis.key_reasons || [];
  const barriers = analysis.barriers ? [analysis.barriers] : [];
  const subjects = analysis.subjects_involved || [];
  const attendance = student.attendance_pct ?? 95;

  const evidence: string[] = [];
  // Primary driver: first key_reason specific to this student
  if (reasons[0]) evidence.push(reasons[0]);
  // Secondary drivers from remaining reasons
  if (reasons[1]) evidence.push(reasons[1]);
  // Add barriers as contextual driver if distinct from reasons
  if (barriers[0] && !reasons.some(r => r.includes(barriers[0]!))) {
    evidence.push(`Barrier: ${barriers[0]}`);
  }
  // Subject-specific data if present
  if (subjects.length > 0 && !evidence.some(e => subjects.some(s => e.includes(s)))) {
    evidence.push(`Subjects: ${subjects.slice(0, 3).join(', ')}`);
  }
  // Add quantitative context only if not already covered by reasons
  if (evidence.length < 2) {
    if (attendance < 92) evidence.push(`Attendance: ${attendance}%`);
    if ((student.behaviour_score || 0) > 10) evidence.push(`Behaviour: ${student.behaviour_score} pts`);
  }
  return evidence.length > 0 ? evidence.slice(0, 4) : fallback;
}

function derivePattern(analysis: AnalysisResult, student: Student): DerivedPattern {
  const cat = (analysis.signal_category || analysis.risk_level) as SignalCategory;
  const trend = analysis.behaviour_trend || '';
  const attendance = student.attendance_pct ?? 95;
  const dataSources = analysis.data_sources || [];
  const sources = dataSources.length > 0 ? dataSources : ['Behaviour', 'Attendance'];

  // Safeguarding first
  if (analysis.key_reasons.some((r) => r.toLowerCase().includes('safeguard'))) {
    return {
      type: 'safeguarding',
      label: PATTERN_LABELS.safeguarding,
      confidenceScore: 88,
      confidenceLevel: 'high',
      evidenceSummary: buildEvidenceSummary(analysis, student, ['Safeguarding note recorded', 'DSL review required']),
      sources,
      suggestedAction: analysis.suggested_staff_action || 'Consult DSL immediately',
    };
  }
  // Exceptional
  if (cat === 'blue') {
    return {
      type: 'exceptional',
      label: PATTERN_LABELS.exceptional,
      confidenceScore: 90,
      confidenceLevel: 'high',
      evidenceSummary: buildEvidenceSummary(analysis, student, [`Positive points: ${student.positive_points || 0}`, `Attendance: ${attendance}%`]),
      sources,
      suggestedAction: analysis.suggested_recognition || 'Recognise and celebrate',
    };
  }
  // Improvement
  if (cat === 'green') {
    return {
      type: 'improvement',
      label: PATTERN_LABELS.improvement,
      confidenceScore: 78,
      confidenceLevel: 'high',
      evidenceSummary: buildEvidenceSummary(analysis, student, [`Behaviour improving: ${student.behaviour_score || 0} pts`, `Attendance: ${attendance}%`]),
      sources,
      suggestedAction: analysis.suggested_recognition || 'Sustain positive momentum',
    };
  }
  // Hidden decline / withdrawal
  if (cat === 'purple' || trend.toLowerCase().includes('hidden') || trend.toLowerCase().includes('withdrawal')) {
    return {
      type: 'withdrawal',
      label: PATTERN_LABELS.withdrawal,
      confidenceScore: analysis.risk_score || 58,
      confidenceLevel: (analysis.risk_score || 0) >= 65 ? 'high' : 'medium',
      evidenceSummary: buildEvidenceSummary(analysis, student, [`Attendance: ${attendance}%`, 'Quiet decline detected']),
      sources,
      suggestedAction: analysis.suggested_pastoral_action || 'Discreet pastoral check-in',
    };
  }
  // Escalation
  if (cat === 'red' && (trend === 'Escalating' || (student.behaviour_score || 0) > 30)) {
    return {
      type: 'escalation',
      label: PATTERN_LABELS.escalation,
      confidenceScore: analysis.risk_score || 82,
      confidenceLevel: (analysis.risk_score || 0) >= 75 ? 'high' : 'medium',
      evidenceSummary: buildEvidenceSummary(analysis, student, [`Behaviour: ${student.behaviour_score || 0} pts`, `Attendance: ${attendance}%`]),
      sources,
      suggestedAction: analysis.suggested_pastoral_action || 'Immediate pastoral meeting',
    };
  }
  // SEND concern
  if (student.send_status && analysis.key_reasons.some((r) => r.toLowerCase().includes('ehcp') || r.toLowerCase().includes('send'))) {
    return {
      type: 'send_concern',
      label: PATTERN_LABELS.send_concern,
      confidenceScore: 65,
      confidenceLevel: 'medium',
      evidenceSummary: buildEvidenceSummary(analysis, student, [`SEND status: ${student.send_status}`, `Attendance: ${attendance}%`]),
      sources,
      suggestedAction: analysis.suggested_staff_action || 'Schedule SEND review',
    };
  }
  // Attendance concern
  if (attendance < 90) {
    return {
      type: 'attendance',
      label: PATTERN_LABELS.attendance,
      confidenceScore: attendance < 80 ? 82 : 62,
      confidenceLevel: attendance < 80 ? 'high' : 'medium',
      evidenceSummary: buildEvidenceSummary(analysis, student, [`Attendance: ${attendance}%`, `Punctuality issues: ${student.punctuality_issues || 0}`]),
      sources,
      suggestedAction: analysis.suggested_pastoral_action || 'Arrange attendance meeting',
    };
  }
  // Subject pattern fallback
  const subjects = analysis.subjects_involved || [];
  if (subjects.length > 0 && (student.behaviour_score || 0) > 10) {
    return {
      type: 'subject',
      label: PATTERN_LABELS.subject,
      confidenceScore: analysis.risk_score || 50,
      confidenceLevel: 'medium',
      evidenceSummary: buildEvidenceSummary(analysis, student, [`Subjects: ${subjects.slice(0, 2).join(', ')}`, `Behaviour: ${student.behaviour_score || 0} pts`]),
      sources,
      suggestedAction: analysis.suggested_staff_action || `Speak with ${subjects[0]} teacher`,
    };
  }
  // Generic watchlist
  return {
    type: 'escalation',
    label: 'Watchlist',
    confidenceScore: analysis.risk_score || 44,
    confidenceLevel: 'medium',
    evidenceSummary: buildEvidenceSummary(analysis, student, [`Behaviour: ${student.behaviour_score || 0} pts`, `Attendance: ${attendance}%`]),
    sources,
    suggestedAction: analysis.suggested_pastoral_action || 'Monitor and review',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface StudentWithSignal {
  student: Student;
  analysis: AnalysisResult;
  pattern: DerivedPattern;
  topIntervention: Intervention | null;
  activeInterventions: Intervention[];
  interventionCount: number;
  suggestedInterventions: Intervention[];
  recentCommsCount: number;
  recentlyActioned: boolean;
  signalStatus: SignalStatus;
}

const CONF_BADGE: Record<string, { label: string; bg: string }> = {
  high:   { label: 'High',   bg: 'bg-red-100 text-red-700 border-red-200' },
  medium: { label: 'Medium', bg: 'bg-amber-100 text-amber-700 border-amber-200' },
  low:    { label: 'Low',    bg: 'bg-slate-100 text-slate-600 border-slate-200' },
};

const PRIORITY_ORDER: Record<string, number> = { urgent: 4, high: 3, medium: 2, low: 1 };
const SIGNAL_ORDER: Record<string, number> = { safeguarding: 0, communication_escalation: 1, escalation: 2, withdrawal: 3, send_concern: 4, attendance: 5, subject: 6, improvement: 7, exceptional: 8, time_pattern: 9 };

// ─────────────────────────────────────────────────────────────────────────────
// Filter config
// ─────────────────────────────────────────────────────────────────────────────

const YEAR_GROUPS = ALL_YEAR_GROUPS;
const PATTERN_FILTER_OPTIONS: { value: PatternType | 'all'; label: string }[] = [
  { value: 'all', label: 'All patterns' },
  { value: 'escalation', label: 'Escalation' },
  { value: 'communication_escalation', label: 'Comms Escalation' },
  { value: 'withdrawal', label: 'Withdrawal' },
  { value: 'attendance', label: 'Attendance' },
  { value: 'subject', label: 'Subject' },
  { value: 'safeguarding', label: 'Safeguarding' },
  { value: 'send_concern', label: 'SEND' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'exceptional', label: 'Exceptional' },
];
const CONF_FILTER_OPTIONS = [
  { value: 'all', label: 'All confidence' },
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function SignalQueue() {
  const { profile, demoMode } = useAuth();
  const schoolId = (profile as any)?.school_id;
  const currentRole = (profile as any)?.role || '';
  const currentUserName = (profile as any)?.full_name || '';
  const userYearGroup = currentRole === 'head_of_year' ? getHOYYearGroup(currentUserName) : null;
  const userForm = currentRole === 'tutor' ? '10B' : null;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toasts, addToast, dismissToast } = useToast();

  const [items, setItems] = useState<StudentWithSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  // Live signal status map — updated by subscription whenever any page calls setDemoSignalStatus
  const [liveStatusMap, setLiveStatusMap] = useState<Map<string, SignalStatus>>(() => getAllDemoSignalStatuses());
  const [search, setSearch] = useState('');
  const [dismissed, setDismissed] = useState<Set<string>>(() => {
    // Restore dismissed signals from the module store so they survive navigation
    const s = getAllDemoSignalStatuses();
    const d = new Set<string>();
    s.forEach((status, id) => { if (status === 'dismissed') d.add(id); });
    return d;
  });
  const [dismissedReasons, setDismissedReasons] = useState<Record<string, { reason: string; by: string; at: string }>>({});
  const [dismissReasonModal, setDismissReasonModal] = useState<{ id: string; name: string } | null>(null);
  const [dismissReason, setDismissReason] = useState('');
  const [showDismissed, setShowDismissed] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);

  // Filters
  const [yearFilter, setYearFilter] = useState<string[]>([]);
  // DSL defaults to safeguarding on first load; other roles default to all
  const [patternFilter, setPatternFilter] = useState<PatternType | 'all'>(profile?.role === 'dsl' ? 'safeguarding' : 'all');
  const [confFilter, setConfFilter] = useState<string>('all');
  const [signalView, setSignalView] = useState<'all' | 'positives' | 'concerns'>('all');
  const positiveOnly = signalView === 'positives';
  const concernOnly  = signalView === 'concerns';
  const [hideActioned, setHideActioned] = useState(true);
  const [celebrateOpenId, setCelebrateOpenId] = useState<string | null>(null);
  // Accept & Assign modal
  const [acceptModalItem, setAcceptModalItem] = useState<StudentWithSignal | null>(null);
  const [schoolProfiles, setSchoolProfiles] = useState<SchoolProfile[]>([]);
  const [acceptForm, setAcceptForm] = useState({
    action_type: '',
    assigned_to: '',
    assigned_to_user_id: null as string | null | undefined,
    assigned_role: '',
    priority: '' as string,
    due_date: '',
    notes: '',
    reason: '',
  });
  // Signal category filter applied by global priority bar (matches PriorityBarContext logic)
  const [signalCategoryFilter, setSignalCategoryFilter] = useState<'red' | 'amber' | null>(null);

  // Sync ?priority= param from global priority bar → filter state
  const priorityParam = searchParams.get('priority');
  const yearParam = searchParams.get('year');
  useEffect(() => {
    if (priorityParam === 'red') {
      setSignalCategoryFilter('red');
      setSignalView('concerns');
      setPatternFilter('all');
    } else if (priorityParam === 'amber') {
      setSignalCategoryFilter('amber');
      setSignalView('concerns');
      setPatternFilter('all');
    } else {
      // No URL filter — reset to clean defaults (but preserve the user's manual pattern filter)
      setSignalCategoryFilter(null);
      setSignalView('all');
    }
  }, [priorityParam]);

  // Sync ?year= param from dashboard year group cards
  useEffect(() => {
    if (yearParam) setYearFilter([yearParam]);
    else setYearFilter([]);
  }, [yearParam]);

  // Keep liveStatusMap in sync with the shared store whenever any page updates signal statuses
  useEffect(() => {
    if (!demoMode) return;
    return subscribeToSignalStatuses(() => {
      setLiveStatusMap(new Map(getAllDemoSignalStatuses()));
    });
  }, [demoMode]);

  // Re-derive intervention counts when any intervention is updated (e.g. completed/dismissed in Actions page)
  useEffect(() => {
    if (!demoMode) return;
    return subscribeToInterventions(() => setTick(t => t + 1));
  }, [demoMode]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      const [students, analyses, interventions, communications, profileData] = await Promise.all([
        getStudents(demoMode ? null : schoolId),
        getAnalysisResults(demoMode ? null : schoolId),
        getInterventions(demoMode ? null : schoolId),
        getCommunications(demoMode ? null : schoolId),
        getSchoolProfiles(demoMode ? null : schoolId),
      ]);
      const analysisMap = new Map(analyses.map((a) => [a.student_id, a]));
      const intMap = new Map<string, Intervention[]>();
      interventions.forEach((i) => {
        if (!intMap.has(i.student_id)) intMap.set(i.student_id, []);
        intMap.get(i.student_id)!.push(i);
      });
      // Load signal statuses from demo store (or default 'new' for all)
      if (profileData) setSchoolProfiles(profileData);
      const signalStatusMap = demoMode ? getAllDemoSignalStatuses() : new Map<string, SignalStatus>();

      // Communications: count contacts per student in last 14 days
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const commsMap = new Map<string, Communication[]>();
      communications.forEach((c) => {
        if (!commsMap.has(c.student_id)) commsMap.set(c.student_id, []);
        commsMap.get(c.student_id)!.push(c);
      });

      const result: StudentWithSignal[] = students
        .filter((s) => analysisMap.has(s.id) && isStudentInScope(currentRole, s, userYearGroup, userForm))
        .map((s) => {
          const analysis = analysisMap.get(s.id)!;
          const studentInts = intMap.get(s.id) || [];
          const acceptedInts = studentInts.filter((i) => !['completed', 'closed', 'cancelled', 'suggested'].includes(i.status));
          const openInts = studentInts.filter((i) => !['completed', 'closed', 'cancelled'].includes(i.status));
          // Prefer the current user's own intervention as "top" so HOY sees their action, not SLT's
          const byPriority = [...acceptedInts].sort((a, b) => (PRIORITY_ORDER[b.priority] || 0) - (PRIORITY_ORDER[a.priority] || 0));
          const myInts = byPriority.filter(i => {
            const a = i.assigned_to || '';
            return a === currentUserName || a.startsWith(currentUserName + ' ');
          });
          const topInt = myInts[0] || byPriority[0] || null;
          const studentComms = commsMap.get(s.id) || [];
          const recentComms = studentComms.filter((c) => c.date >= cutoffStr);
          const recentCommsCount = recentComms.length;

          // Student is "recently actioned" if they have no open interventions but have
          // at least one completed/closed intervention in the last 4 weeks
          const fourWeeksAgo = new Date();
          fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
          const fourWeeksAgoStr = fourWeeksAgo.toISOString().slice(0, 10);
          const recentlyCompleted = studentInts.some((i) =>
            ['completed', 'closed'].includes(i.status) &&
            (i.completed_at || i.created_at || '').slice(0, 10) >= fourWeeksAgoStr
          );
          const recentlyActioned = acceptedInts.length === 0 && recentlyCompleted;

          let pattern = derivePattern(analysis, s);

          // Override with communication escalation if 3+ contacts in 14 days
          if (recentCommsCount >= 3) {
            const sources = [...new Set(recentComms.map((c) => c.source.replace('_', ' ')))];
            pattern = {
              type: 'communication_escalation',
              label: PATTERN_LABELS.communication_escalation,
              confidenceScore: Math.min(95, 60 + recentCommsCount * 8),
              confidenceLevel: recentCommsCount >= 5 ? 'high' : 'medium',
              evidenceSummary: [
                `${recentCommsCount} contacts in last 14 days`,
                `Types: ${sources.slice(0, 3).join(', ')}`,
                recentComms.some((c) => c.priority === 'urgent') ? 'Includes urgent contact' : '',
              ].filter(Boolean),
              sources: ['Communications'],
              suggestedAction: 'Review contact history and consider pastoral intervention',
            };
          }

          return {
            student: s,
            analysis,
            pattern,
            topIntervention: topInt,
            activeInterventions: acceptedInts,
            interventionCount: acceptedInts.length,
            suggestedInterventions: openInts.filter(i => i.status === 'suggested'),
            recentCommsCount,
            recentlyActioned,
            signalStatus: (signalStatusMap.get(s.id) || 'new') as SignalStatus,
          };
        });

      result.sort((a, b) => {
        // Urgent interventions surface immediately after safeguarding signals
        const aUrgent = a.topIntervention?.priority === 'urgent' ? 0 : 1;
        const bUrgent = b.topIntervention?.priority === 'urgent' ? 0 : 1;
        const aIsSafeguarding = a.pattern.type === 'safeguarding' ? 0 : 1;
        const bIsSafeguarding = b.pattern.type === 'safeguarding' ? 0 : 1;
        // Safeguarding always first; then urgent interventions; then pattern order
        const aSortKey = aIsSafeguarding * 10 + aUrgent * 5 + (SIGNAL_ORDER[a.pattern.type] ?? 9);
        const bSortKey = bIsSafeguarding * 10 + bUrgent * 5 + (SIGNAL_ORDER[b.pattern.type] ?? 9);
        if (aSortKey !== bSortKey) return aSortKey - bSortKey;
        return b.pattern.confidenceScore - a.pattern.confidenceScore;
      });

      setItems(result);
      setLoading(false);
    }
    load();
  }, [schoolId, demoMode, tick]);

  const filtered = useMemo(() => {
    // Oversight roles see the full picture; focused roles only see students they own
    const isOversightRole = ['admin', 'slt', 'dsl'].includes(currentRole);
    return items.filter((item) => {
      if (dismissed.has(item.student.id)) return false;
      if (search && !item.student.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (yearFilter.length > 0 && !yearFilter.includes(item.student.year_group)) return false;
      if (patternFilter !== 'all' && item.pattern.type !== patternFilter) return false;
      if (confFilter !== 'all' && item.pattern.confidenceLevel !== confFilter) return false;
      if (positiveOnly && !['improvement', 'exceptional'].includes(item.pattern.type)) return false;
      if (concernOnly && ['improvement', 'exceptional'].includes(item.pattern.type)) return false;
      // Hide signals that have been actioned — they belong in Actions/Reviews, not here
      const isPositivePattern = ['improvement', 'exceptional'].includes(item.pattern.type);
      // Use liveStatusMap so changes from Dashboard or other pages are immediately reflected
      const liveStatus = liveStatusMap.get(item.student.id) || item.signalStatus;
      const isActioned = ['action_in_progress', 'review_due', 'resolved', 'escalated', 'dismissed'].includes(liveStatus);
      if (hideActioned && !isPositivePattern && (isActioned || item.interventionCount > 0 || item.recentlyActioned)) return false;
      // Role-based scoping: HOY/tutor/teacher only see students where they have an active
      // intervention OR where no one has actioned the student yet (new signal for them to pick up).
      // Positive patterns are always visible so HOY can celebrate their year group's successes.
      if (!isOversightRole && !isPositivePattern) {
        // Personal queue filter: use resolved user ID, not display name string.
        // Falls back to name-matching for demo mode where user IDs are not set.
        const currentUserId = (profile as any)?.id;
        const hasMyAction = item.activeInterventions.some(i => {
          if (currentUserId && i.assigned_to_user_id) {
            return i.assigned_to_user_id === currentUserId
              || i.review_owner_id === currentUserId
              || i.escalation_owner_id === currentUserId;
          }
          // Demo fallback: name-string matching
          const a = i.assigned_to || '';
          return a === currentUserName || a.startsWith(currentUserName + ' ');
        });
        const isUntouched = item.activeInterventions.length === 0 && !item.recentlyActioned;
        if (!hasMyAction && !isUntouched) return false;
      }
      // Signal category filter from global priority bar — mirrors PriorityBarContext logic exactly
      if (signalCategoryFilter === 'red') {
        const cat = item.student.signal_category || item.analysis.signal_category;
        const risk = item.student.risk_level || item.analysis.risk_level;
        if (cat !== 'red' && risk !== 'red') return false;
      }
      if (signalCategoryFilter === 'amber') {
        const cat = item.student.signal_category || item.analysis.signal_category;
        const risk = item.student.risk_level || item.analysis.risk_level;
        const isAmber = cat === 'amber' || cat === 'purple' || risk === 'amber';
        if (!isAmber) return false;
      }
      return true;
    });
  }, [items, dismissed, search, yearFilter, patternFilter, confFilter, positiveOnly, concernOnly, hideActioned, signalCategoryFilter, currentRole, currentUserName]);

  const patternCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    items.forEach((item) => {
      counts[item.pattern.type] = (counts[item.pattern.type] || 0) + 1;
    });
    return counts;
  }, [items]);

  const activeFilterCount = [
    yearFilter.length > 0,
    patternFilter !== 'all',
    confFilter !== 'all',
    positiveOnly,
    concernOnly,
  ].filter(Boolean).length;

  function clearFilters() {
    setYearFilter([]);
    setPatternFilter('all');
    setConfFilter('all');
    setSignalView('all');
    setHideActioned(true);
    setSignalCategoryFilter(null);
    const next = new URLSearchParams(searchParams);
    next.delete('priority');
    setSearchParams(next);
  }

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkModalOpen, setBulkModalOpen] = useState(false);
  const [bulkForm, setBulkForm] = useState({ action_type: 'Tutor check-in', assigned_to: '', due_date: '', notes: '' });
  // Evidence drilldown
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function confirmDismiss() {
    if (dismissReasonModal) {
      const { id, name } = dismissReasonModal;
      const reason = dismissReason || 'No reason given';
      const at = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
      const by = (profile as any)?.full_name || 'Demo User';
      setDismissed((prev) => new Set([...prev, id]));
      setDismissedReasons(r => ({ ...r, [id]: { reason, by, at } }));
      // Persist to demo signal status store so dismissal survives navigation
      if (demoMode) setDemoSignalStatus(id, 'dismissed');
      setDismissReasonModal(null);
      setDismissReason('');
      addToast(`Pattern dismissed for ${name}.`, 'success', () => {
        setDismissed(prev => { const n = new Set(prev); n.delete(id); return n; });
      });
    }
  }

  function restorePattern(id: string) {
    setDismissed(prev => { const n = new Set(prev); n.delete(id); return n; });
    addToast('Pattern restored to queue.');
  }

  const concernCount = items.filter((i) => !['improvement', 'exceptional'].includes(i.pattern.type) && !dismissed.has(i.student.id)).length;
  const positiveCount = items.filter((i) => ['improvement', 'exceptional'].includes(i.pattern.type) && !dismissed.has(i.student.id)).length;

  return (
    <div className="space-y-6">
      <Toast toasts={toasts} onDismiss={dismissToast} />
      <GlobalPriorityBar />
      {/* Header */}
      <div className="card-premium p-5">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Layers className="w-5 h-5 text-teal-600" />
              <h1 className="text-xl font-bold text-slate-900">Signal Queue</h1>
            </div>
            <p className="text-sm text-slate-500">
              Patterns needing attention. Convert signals into actions or dismiss with reason.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="flex items-center gap-3">
              <div className="text-center">
                <div className="text-xl font-black text-red-600">{concernCount}</div>
                <div className="text-[10px] text-slate-500 font-medium">concerns</div>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div className="text-center">
                <div className="text-xl font-black text-emerald-600">{positiveCount}</div>
                <div className="text-[10px] text-slate-500 font-medium">positives</div>
              </div>
            </div>
          </div>
        </div>

        {/* Workflow explainer */}
        {(() => {
          const [open, setOpen] = useState(false);
          return (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
              <button
                onClick={() => setOpen(o => !o)}
                className="w-full flex items-center gap-2 px-5 py-3 text-left hover:bg-slate-100/60 transition-colors"
              >
                <Layers className="w-4 h-4 text-teal-600 shrink-0" />
                <span className="text-sm font-semibold text-slate-700 flex-1">How this queue works</span>
                <span className="text-xs text-slate-400 mr-2 hidden sm:block">Signal → Accept & Assign → Complete → Resolve</span>
                {open ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
              </button>
              {open && (
                <div className="px-5 pb-5 pt-1">
                  <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                    This queue shows every student with a detected pattern — from urgent concerns to emerging risks to positive achievements.
                    A student stays in the queue until all actions are completed and outcomes recorded.
                    The queue does not replace CPOMS or Arbor. It interprets patterns from that data and tells you what needs to happen next.
                  </p>
                  <div className="grid sm:grid-cols-4 gap-3">
                    {[
                      {
                        n: '1', label: 'Signal detected', color: 'bg-red-50 border-red-200', text: 'text-red-700', dot: 'bg-red-500',
                        desc: 'Student flagged automatically based on attendance, behaviour trends, SEND, or safeguarding patterns. No action assigned yet.',
                        action: 'Open the student profile and create an action.',
                      },
                      {
                        n: '2', label: 'Action assigned', color: 'bg-amber-50 border-amber-200', text: 'text-amber-700', dot: 'bg-amber-500',
                        desc: 'An intervention has been created and assigned to a staff member. Work is in progress.',
                        action: 'Staff update the action status as they work. Mark in progress when started.',
                      },
                      {
                        n: '3', label: 'Review due', color: 'bg-orange-50 border-orange-200', text: 'text-orange-700', dot: 'bg-orange-500',
                        desc: 'The review date has been reached. Did the action work? Record what happened and whether the student improved.',
                        action: 'Open the action, click "Review Now", and record the outcome.',
                      },
                      {
                        n: '4', label: 'Resolved', color: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700', dot: 'bg-emerald-500',
                        desc: 'Outcome recorded and action completed. Student is removed from the active queue and archived in the student\'s record.',
                        action: 'Complete the action. If the signal persists, a new cycle starts.',
                      },
                    ].map(s => (
                      <div key={s.n} className={`rounded-xl border p-3.5 ${s.color}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-5 h-5 rounded-full ${s.dot} flex items-center justify-center text-white text-[10px] font-black shrink-0`}>{s.n}</div>
                          <span className={`text-xs font-bold ${s.text}`}>{s.label}</span>
                        </div>
                        <p className="text-xs text-slate-600 mb-2 leading-relaxed">{s.desc}</p>
                        <div className="flex items-start gap-1.5">
                          <ArrowRight className={`w-3 h-3 mt-0.5 shrink-0 ${s.text}`} />
                          <p className={`text-[11px] font-semibold ${s.text} leading-relaxed`}>{s.action}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-200 grid sm:grid-cols-3 gap-3">
                    <div className="flex items-start gap-2">
                      <div className="w-3 h-3 rounded-full bg-red-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-600"><span className="font-semibold text-slate-700">Red</span> — urgent concern. Take action today. Involves behaviour escalation, attendance crisis, safeguarding, or EHCP overdue.</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-3 h-3 rounded-full bg-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-600"><span className="font-semibold text-slate-700">Amber</span> — watchlist. Pattern is emerging or specific. Act within the week before it escalates.</p>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="w-3 h-3 rounded-full bg-violet-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-slate-600"><span className="font-semibold text-slate-700">Purple</span> — hidden decline. No obvious incidents, but data shows a shift. Check in discreetly.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* Search + filter bar */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search students..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
            />
          </div>
          <button
            onClick={() => setFilterOpen(!filterOpen)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-colors ${filterOpen ? 'bg-teal-600 text-white border-teal-600' : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filters
            {activeFilterCount > 0 && (
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${filterOpen ? 'bg-white/20' : 'bg-red-500 text-white'}`}>{activeFilterCount}</span>
            )}
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${filterOpen ? 'rotate-180' : ''}`} />
          </button>
          <div className="flex items-center rounded-xl border border-slate-200 bg-white overflow-hidden text-xs font-medium">
            {([
              { v: 'all',       label: 'Show all',       icon: <Layers className="w-3.5 h-3.5" /> },
              { v: 'concerns',  label: 'Concerns',        icon: <AlertTriangle className="w-3.5 h-3.5" /> },
              { v: 'positives', label: 'Positives',       icon: <TrendingUp className="w-3.5 h-3.5" /> },
            ] as const).map(({ v, label, icon }) => (
              <button
                key={v}
                onClick={() => setSignalView(v)}
                className={`flex items-center gap-1.5 px-3 py-2 border-r last:border-r-0 border-slate-200 transition-colors ${
                  signalView === v
                    ? v === 'concerns'  ? 'bg-red-600 text-white'
                    : v === 'positives' ? 'bg-emerald-600 text-white'
                    : 'bg-slate-800 text-white'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => setHideActioned(!hideActioned)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${hideActioned ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'}`}
            title={hideActioned ? 'Showing unactioned only — click to include actioned students' : 'Click to hide students with active interventions'}
          >
            <CheckCircle className="w-3.5 h-3.5" /> {hideActioned ? 'Unactioned only' : 'Show all'}
          </button>
        </div>
      </div>

      {/* Active global filter banner */}
      {priorityParam && (
        <div className="flex items-center justify-between gap-3 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-teal-600 shrink-0" />
            <span className="text-sm font-semibold text-teal-800">
              Filtered by {priorityParam === 'red' ? 'Red Priority' : 'Amber Watchlist'} — showing {filtered.length} of {items.filter(i => !dismissed.has(i.student.id)).length} signals
            </span>
          </div>
          <button
            onClick={() => clearFilters()}
            className="flex items-center gap-1 text-xs text-teal-600 font-semibold hover:text-teal-800 shrink-0"
          >
            <X className="w-3.5 h-3.5" /> Clear filter
          </button>
        </div>
      )}

      {/* Expanded filter panel */}
      {filterOpen && (
        <div className="card-premium p-5">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Year group */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Year group</div>
              <div className="flex flex-wrap gap-1.5">
                {YEAR_GROUPS.map((yr) => (
                  <button
                    key={yr}
                    onClick={() => setYearFilter((prev) => prev.includes(yr) ? prev.filter((y) => y !== yr) : [...prev, yr])}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${yearFilter.includes(yr) ? 'bg-teal-600 text-white border-teal-600' : 'bg-white border-slate-200 text-slate-600 hover:border-teal-300'}`}
                  >
                    {yr.replace('Year ', 'Y')}
                  </button>
                ))}
              </div>
            </div>
            {/* Pattern type */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Pattern type</div>
              <select
                value={patternFilter}
                onChange={(e) => setPatternFilter(e.target.value as PatternType | 'all')}
                className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {PATTERN_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label} {o.value !== 'all' && patternCounts[o.value] ? `(${patternCounts[o.value]})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {/* Confidence */}
            <div>
              <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">Confidence</div>
              <select
                value={confFilter}
                onChange={(e) => setConfFilter(e.target.value)}
                className="w-full text-sm rounded-xl border border-slate-200 px-3 py-2 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
              >
                {CONF_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            {/* Clear */}
            <div className="flex items-end">
              {activeFilterCount > 0 && (
                <button onClick={clearFilters} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-red-600 transition-colors">
                  <X className="w-4 h-4" /> Clear all filters
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Active filter banner */}
      {activeFilterCount > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
          <SlidersHorizontal className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="text-xs font-semibold text-teal-700">Active filters:</span>
          {yearFilter.length > 0 && (
            <span className="flex items-center gap-1 bg-white border border-teal-200 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">
              {yearFilter.join(', ')}
              <button onClick={() => setYearFilter([])}><X className="w-3 h-3" /></button>
            </span>
          )}
          {patternFilter !== 'all' && (
            <span className="flex items-center gap-1 bg-white border border-teal-200 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">
              {PATTERN_LABELS[patternFilter as PatternType] || patternFilter}
              <button onClick={() => setPatternFilter('all')}><X className="w-3 h-3" /></button>
            </span>
          )}
          {confFilter !== 'all' && (
            <span className="flex items-center gap-1 bg-white border border-teal-200 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">
              {confFilter} confidence
              <button onClick={() => setConfFilter('all')}><X className="w-3 h-3" /></button>
            </span>
          )}
          {concernOnly && (
            <span className="flex items-center gap-1 bg-white border border-red-200 text-red-700 text-xs font-medium px-2.5 py-1 rounded-full">
              Concerns only <button onClick={() => setSignalView('all')}><X className="w-3 h-3" /></button>
            </span>
          )}
          {positiveOnly && (
            <span className="flex items-center gap-1 bg-white border border-emerald-200 text-emerald-700 text-xs font-medium px-2.5 py-1 rounded-full">
              Positives only <button onClick={() => setSignalView('all')}><X className="w-3 h-3" /></button>
            </span>
          )}
          {hideActioned && (
            <span className="flex items-center gap-1 bg-white border border-teal-200 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">
              Unactioned only <button onClick={() => setHideActioned(false)}><X className="w-3 h-3" /></button>
            </span>
          )}
          <span className="ml-auto text-xs text-teal-600 font-medium">
            Showing {filtered.length} of {items.length} students
          </span>
        </div>
      )}

      {/* Results header */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500 font-medium">
          {loading ? 'Loading...' : (
            <>
              Showing {filtered.length} of {items.length} student{items.length !== 1 ? 's' : ''}
              {filtered.length > 0 && (
                <span className="ml-2 text-xs text-slate-400 font-normal">
                  ({filtered.filter(i => i.interventionCount === 0 && !i.recentlyActioned).length} awaiting action
                  {filtered.filter(i => i.interventionCount > 0).length > 0 && <> &middot; {filtered.filter(i => i.interventionCount > 0).length} in progress</>}
                  {filtered.filter(i => i.suggestedInterventions.length > 0).length > 0 && <> &middot; {filtered.reduce((sum, i) => sum + i.suggestedInterventions.length, 0)} suggested</>}
                  {filtered.filter(i => i.recentlyActioned).length > 0 && <> &middot; {filtered.filter(i => i.recentlyActioned).length} recently resolved</>})
                </span>
              )}
            </>
          )}
        </p>
        <div className="flex items-center gap-3">
          {dismissed.size > 0 && (
            <button onClick={() => setDismissed(new Set())} className="text-xs text-slate-400 hover:text-slate-600 underline">
              Show {dismissed.size} dismissed
            </button>
          )}
          {filtered.length > 1 && (
            <button
              onClick={() => {
                if (selectedIds.size === filtered.length) {
                  setSelectedIds(new Set());
                } else {
                  setSelectedIds(new Set(filtered.map(f => f.student.id)));
                }
              }}
              className="text-xs text-teal-600 hover:text-teal-800 font-medium"
            >
              {selectedIds.size === filtered.length ? 'Deselect all' : 'Select all'}
            </button>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <div className="sticky top-4 z-30 bg-slate-900 text-white rounded-2xl px-5 py-3.5 flex items-center gap-4 shadow-2xl">
          <span className="text-sm font-semibold">{selectedIds.size} student{selectedIds.size !== 1 ? 's' : ''} selected</span>
          <button
            onClick={() => setBulkModalOpen(true)}
            className="ml-auto flex items-center gap-2 px-4 py-2 rounded-xl bg-teal-500 hover:bg-teal-400 text-white text-sm font-semibold transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create bulk action
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="p-2 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Intelligence list */}
      {loading ? (
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Analysing patterns...</div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-slate-400 gap-3">
          <Filter className="w-10 h-10 text-slate-300" />
          <p className="text-sm font-medium">No students match this filter.</p>
          {activeFilterCount > 0 && (
            <button onClick={clearFilters} className="text-xs text-teal-600 hover:underline">Clear filters</button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((item) => {
            const { student, analysis, pattern, topIntervention, interventionCount, recentCommsCount, suggestedInterventions } = item;
            const pc = PATTERN_COLORS[pattern.type];
            const cb = CONF_BADGE[pattern.confidenceLevel];
            const isPositive = ['improvement', 'exceptional'].includes(pattern.type);
            // Use live status map so this badge updates immediately when any page changes the status
            const itemSignalStatus = (liveStatusMap.get(student.id) || 'new') as SignalStatus;
            const hasActiveAction = interventionCount > 0;
            const intStatusRaw = topIntervention?.status;
            const intDue = topIntervention?.due_date;
            const intOwner = topIntervention?.assigned_to;
            const isOverdue = intDue && new Date(intDue) < new Date();

            const SIGNAL_STATUS_CFG: Record<SignalStatus, { label: string; bg: string; text: string; border: string; dot: string }> = {
              new:                { label: 'New signal',          bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-500' },
              action_in_progress: { label: 'Action in progress',  bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200',   dot: 'bg-blue-500' },
              review_due:         { label: 'Review due',          bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200',  dot: 'bg-amber-500' },
              resolved:           { label: 'Resolved',            bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500' },
              escalated:          { label: 'Escalated',           bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200',    dot: 'bg-red-600' },
              dismissed:          { label: 'Dismissed',           bg: 'bg-slate-50',   text: 'text-slate-600',  border: 'border-slate-200',  dot: 'bg-slate-400' },
            };
            const ssCfg = SIGNAL_STATUS_CFG[itemSignalStatus];

            return (
              <div
                key={student.id}
                className={`bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all overflow-hidden ${selectedIds.has(student.id) ? 'border-teal-400 ring-2 ring-teal-200' : 'border-slate-200'}`}
              >
                <div className="flex items-stretch">
                  {/* Select checkbox */}
                  <button
                    onClick={() => toggleSelect(student.id)}
                    className={`w-8 shrink-0 flex items-center justify-center transition-colors ${selectedIds.has(student.id) ? 'bg-teal-50' : 'hover:bg-slate-50'}`}
                    title="Select for bulk action"
                  >
                    <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-all ${selectedIds.has(student.id) ? 'bg-teal-500 border-teal-500' : 'border-slate-300'}`}>
                      {selectedIds.has(student.id) && <CheckCircle className="w-3 h-3 text-white" />}
                    </div>
                  </button>
                  {/* Signal indicator bar */}
                  <div className={`w-1 shrink-0 ${pc.dot}`} style={{ backgroundColor: pc.dot.replace('bg-', '') }} />
                  <div className={`w-1.5 shrink-0 rounded-l-none ${pc.dot}`} />

                  <div className="flex-1 min-w-0 p-4">
                    <div className="flex items-start gap-4">
                      {/* ── Student info ── */}
                      <div className="w-48 shrink-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className={`w-8 h-8 rounded-full ${pc.bg} border ${pc.border} flex items-center justify-center shrink-0`}>
                            <User className={`w-4 h-4 ${pc.text}`} />
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 truncate">{student.name}</div>
                            <div className="text-xs text-slate-500">{student.year_group} · {student.form}</div>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1 ml-10">
                          {student.send_status && (
                            <span className="text-[9px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded-full">{student.send_status}</span>
                          )}
                          {student.pupil_premium && (
                            <span className="text-[9px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full">PP</span>
                          )}
                          {interventionCount > 0 && (
                            <span className="text-[9px] font-semibold bg-teal-50 text-teal-700 border border-teal-200 px-1.5 py-0.5 rounded-full">{interventionCount} action{interventionCount > 1 ? 's' : ''}</span>
                          )}
                          {recentCommsCount >= 3 && (
                            <span className="text-[9px] font-semibold bg-orange-50 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full">{recentCommsCount} comms (14d)</span>
                          )}
                        </div>
                      </div>

                      {/* ── Pattern ── */}
                      <div className="w-44 shrink-0">
                        <div className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-1 rounded-full border ${pc.bg} ${pc.text} ${pc.border} mb-1`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${pc.dot}`} />
                          {pattern.label}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {pattern.sources.map((s) => (
                            <span key={s} className="text-[9px] font-medium bg-slate-100 text-slate-600 border border-slate-200 px-1.5 py-0.5 rounded-full">{s}</span>
                          ))}
                        </div>
                      </div>

                      {/* ── Confidence ── */}
                      <div className="w-20 shrink-0 flex flex-col items-center">
                        <div className={`text-xl font-black ${pattern.confidenceLevel === 'high' ? 'text-red-600' : pattern.confidenceLevel === 'medium' ? 'text-amber-600' : 'text-slate-500'}`}>
                          {pattern.confidenceScore}%
                        </div>
                        <span className={`text-[9px] px-2 py-0.5 rounded-full font-bold border ${cb.bg}`}>{cb.label}</span>
                      </div>

                      {/* ── Evidence ── */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Why this student appears</div>
                        {pattern.type === 'safeguarding' && !canViewSafeguarding((profile as any)?.role) && !demoMode ? (
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Lock className="w-3.5 h-3.5 text-slate-400" />
                            Restricted — contact DSL for details
                          </div>
                        ) : (
                          <>
                            {analysis.signal_explanation && (
                              <p className="text-xs text-slate-700 leading-relaxed mb-1.5">{analysis.signal_explanation}</p>
                            )}
                            <ExplainButton
                              explanation={explainFlag(analysis)}
                              label="Why this pupil?"
                              tone="slate"
                            />
                            <ul className="space-y-0.5">
                              {pattern.evidenceSummary.slice(0, analysis.signal_explanation ? 1 : 3).map((ev, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
                                  <span className={`w-1.5 h-1.5 rounded-full mt-1 shrink-0 ${pc.dot}`} />
                                  {ev}
                                </li>
                              ))}
                            </ul>
                          </>
                        )}
                      </div>

                      {/* ── Recommended action ── */}
                      <div className="w-44 shrink-0">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Suggested action</div>
                        <p className="text-xs text-slate-700 font-medium leading-relaxed">{pattern.suggestedAction}</p>
                        {item.activeInterventions?.[0] && (
                          <ExplainButton
                            explanation={explainAssignment(
                              item.activeInterventions[0].assigned_to,
                              item.activeInterventions[0].assigned_role,
                              null,
                              !item.activeInterventions[0].assigned_to_user_id,
                              null,
                            )}
                            label="Why this assignee?"
                            tone="slate"
                          />
                        )}
                      </div>

                      {/* ── Signal status + Owner ── */}
                      <div className="w-36 shrink-0">
                        <div className="mb-2">
                          <span className={`inline-flex items-center gap-1 text-[9px] font-bold px-2 py-1 rounded-full border ${ssCfg.bg} ${ssCfg.text} ${ssCfg.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${ssCfg.dot}`} />
                            {ssCfg.label}
                          </span>
                          {itemSignalStatus === 'action_in_progress' && (student.signal_category === 'red' || student.signal_category === 'amber') && (
                            <div className="mt-1.5 text-[9px] text-slate-500 leading-tight">
                              Plan active — concern stays until action is completed and resolved.
                            </div>
                          )}
                        </div>
                        {intOwner ? (
                          <div className="mb-1">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Assigned to</div>
                            <div className="text-xs font-medium text-slate-700 truncate">{intOwner}</div>
                          </div>
                        ) : item.suggestedInterventions.length > 0 ? (
                          <div className="mb-1">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Suggested owner</div>
                            <div className="text-xs font-medium text-slate-500 truncate">{item.suggestedInterventions[0].assigned_to}</div>
                          </div>
                        ) : (
                          <div className="mb-1">
                            <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">Awaiting triage</span>
                          </div>
                        )}
                        {intDue && (
                          <div className={`flex items-center gap-1 text-[10px] font-semibold ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                            <Clock className="w-3 h-3" />
                            {isOverdue ? 'Overdue: ' : 'Due: '}{intDue}
                          </div>
                        )}
                      </div>

                      {/* ── Actions ── */}
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <button
                          onClick={() => navigate(`/students/${student.id}?tab=patterns`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
                        >
                          <ChevronRight className="w-3 h-3" /> Open
                        </button>
                        {!isPositive ? (
                          <button
                            onClick={() => {
                              const PATTERN_ACTION: Record<string, string> = {
                                escalation: 'Pastoral meeting',
                                withdrawal: 'Pastoral check-in',
                                subject: 'Subject intervention',
                                attendance: 'Attendance meeting',
                                safeguarding: 'DSL welfare review',
                                send_concern: 'SEND review',
                                time_pattern: 'Pastoral check-in',
                                communication_escalation: 'Parent contact',
                                improvement: 'Pastoral recognition',
                                exceptional: 'Recognition',
                              };
                              const actionType = PATTERN_ACTION[pattern?.type || ''] || 'Pastoral meeting';
                              // Prefer the engine-resolved assignee from an existing suggested action.
                              // Falls back to demo display-name mapping when no real profile exists.
                              const existingAction = item.activeInterventions?.find(a => a.action_type === actionType);
                              const resolvedUserId = existingAction?.assigned_to_user_id ?? null;
                              const resolvedProfile = resolvedUserId
                                ? schoolProfiles.find(p => p.id === resolvedUserId)
                                : null;
                              const owner = resolvedProfile
                                ? resolvedProfile.full_name ?? resolvedProfile.id
                                : actionType === 'DSL welfare review'
                                  ? 'Mr Ahmed (DSL)'
                                  : actionType === 'SEND review'
                                  ? 'Ms Jones (SENDCo)'
                                  : mapOwnerToStaffName('head of year', student.year_group);
                              // Show a clear rationale:
                              // - If a real profile was found: name the person and explain why.
                              // - If no matching account exists yet: explain what role is needed
                              //   and that it will resolve automatically when the account is added.
                              const existingAssignedTo = existingAction?.assigned_to ?? null;
                              const isAwaitingAccount = !resolvedProfile && !resolvedUserId && !!existingAction && !existingAction.assigned_to_user_id;
                              const routingRationale = resolvedProfile
                                ? `Auto-assigned to ${owner} by StudentSignal based on role and year-group responsibility.`
                                : isAwaitingAccount
                                ? `Awaiting account: this action is designated for the ${existingAssignedTo ?? 'responsible role'}. It will be automatically assigned to the correct person once their StudentSignal account is created.`
                                : null;
                              const today = new Date();
                              const dueDate = new Date(today);
                              dueDate.setDate(today.getDate() + (student.risk_level === 'red' ? 2 : 5));

                              setAcceptForm({
                                action_type: actionType,
                                // When profile exists: store UUID. When awaiting account: store role-label.
                                assigned_to: resolvedProfile ? (resolvedProfile.id) : (existingAction?.assigned_to ?? owner),
                                assigned_to_user_id: resolvedUserId ?? undefined,
                                assigned_role: '',
                                priority: student.risk_level === 'red' ? 'urgent' : 'high',
                                due_date: dueDate.toISOString().split('T')[0],
                                notes: pattern?.suggestedAction || analysis?.signal_explanation || '',
                                reason: routingRationale ?? analysis?.barriers ?? (analysis?.key_reasons || []).join('; ') ?? '',
                              });
                              setAcceptModalItem(item);
                            }}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 border border-teal-200 text-xs font-semibold hover:bg-teal-100 transition-colors"
                          >
                            <Zap className="w-3 h-3" /> Accept & Assign
                          </button>
                        ) : (
                          <div className="relative">
                            <button
                              onClick={() => setCelebrateOpenId(prev => prev === student.id ? null : student.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                            >
                              <Star className="w-3 h-3" /> Celebrate
                            </button>
                            {celebrateOpenId === student.id && (
                              <div className="absolute right-0 top-8 z-20 w-52 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden">
                                <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100">
                                  <p className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider">Recognition options</p>
                                </div>
                                <button
                                  onClick={() => {
                                    navigate(`/success-stories`);
                                    setCelebrateOpenId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left"
                                >
                                  <Star className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                  <span><span className="font-semibold">View in Success Stories</span><br /><span className="text-slate-400">Review & award recognition</span></span>
                                </button>
                                <button
                                  onClick={() => {
                                    if (demoMode) {
                                      const today = new Date();
                                      addDemoIntervention({
                                        id: `rec-${student.id}-${Date.now()}`,
                                        student_id: student.id,
                                        assigned_to: 'Mrs Clarke',
                                        created_by: currentUserName,
                                        action_type: 'Student recognition — formal commendation',
                                        priority: 'low',
                                        status: 'suggested',
                                        due_date: today.toISOString().split('T')[0],
                                        review_date: today.toISOString().split('T')[0],
                                        notes: `${student.name} — positive progress flagged by ${currentUserName}. ${pattern.suggestedAction || ''}`,
                                        outcome: null,
                                        created_at: today.toISOString(),
                                      });
                                    }
                                    addToast(`Forwarded to admin — ${(student.name || '').split(' ')[0] || student.name} will be recognised at the next available opportunity`, 'success');
                                    setCelebrateOpenId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100"
                                >
                                  <CheckCircle className="w-3.5 h-3.5 text-teal-500 shrink-0" />
                                  <span><span className="font-semibold">Forward to admin</span><br /><span className="text-slate-400">Headteacher commendation request</span></span>
                                </button>
                                <button
                                  onClick={() => {
                                    if (demoMode) setDemoSignalStatus(student.id, 'resolved');
                                    setDismissed(prev => { const n = new Set(prev); n.add(student.id); return n; });
                                    addToast(`${(student.name || '').split(' ')[0] || student.name}'s positive progress marked as handled`, 'success');
                                    setCelebrateOpenId(null);
                                  }}
                                  className="w-full flex items-center gap-2 px-3 py-2.5 text-xs text-slate-700 hover:bg-slate-50 transition-colors text-left border-t border-slate-100"
                                >
                                  <CheckCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                  <span><span className="font-semibold">Mark as handled</span><br /><span className="text-slate-400">Remove from queue</span></span>
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                        <button
                          onClick={() => setDismissReasonModal({ id: student.id, name: student.name })}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xs transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" /> Dismiss
                        </button>
                        <button
                          onClick={() => setExpandedEvidence(prev => { const next = new Set(prev); if (next.has(student.id)) next.delete(student.id); else next.add(student.id); return next; })}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs transition-colors ${expandedEvidence.has(student.id) ? 'bg-slate-100 text-slate-700 font-medium' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                          title="View raw evidence"
                        >
                          <Eye className="w-3 h-3" /> Evidence
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                {/* Evidence drilldown panel */}
                {expandedEvidence.has(student.id) && (() => {
                  const records = MOCK_BEHAVIOUR[student.id] || [];
                  const dataSources = analysis?.data_sources || [];
                  const evidenceCount = analysis?.evidence_count || records.length;
                  const hasAnyEvidence = records.length > 0 || dataSources.length > 0 || pattern.evidenceSummary.length > 0;
                  return (
                    <div className="border-t border-slate-100 bg-slate-50 px-5 py-4 space-y-4">
                      {/* Evidence summary from analysis */}
                      {(dataSources.length > 0 || pattern.evidenceSummary.length > 0) && (
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Evidence summary — {evidenceCount} data points</div>
                          {dataSources.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mb-2">
                              {dataSources.map((src: string, i: number) => (
                                <span key={i} className="text-[10px] font-semibold bg-teal-50 border border-teal-200 text-teal-700 px-2 py-0.5 rounded-full">{src}</span>
                              ))}
                            </div>
                          )}
                          {pattern.evidenceSummary.length > 0 && (
                            <ul className="space-y-1">
                              {pattern.evidenceSummary.map((ev, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                                  <span className="w-1 h-1 rounded-full bg-slate-400 mt-1.5 shrink-0" />{ev}
                                </li>
                              ))}
                            </ul>
                          )}
                          {analysis?.barriers && (
                            <p className="text-xs text-slate-600 mt-2 border-t border-slate-200 pt-2">{analysis.barriers}</p>
                          )}
                          {analysis?.subjects_involved && analysis.subjects_involved.length > 0 && (
                            <div className="flex items-center gap-1.5 mt-2 text-xs text-slate-500">
                              <span className="font-semibold">Subjects:</span> {analysis.subjects_involved.join(', ')}
                            </div>
                          )}
                        </div>
                      )}
                      {/* Raw behaviour records */}
                      {records.length > 0 && (
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Behaviour records — {records.length} entries</div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                              <thead>
                                <tr className="text-left text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-200">
                                  <th className="pb-2 pr-4 font-semibold">Date</th>
                                  <th className="pb-2 pr-4 font-semibold">Subject</th>
                                  <th className="pb-2 pr-4 font-semibold">Type</th>
                                  <th className="pb-2 pr-4 font-semibold">Points</th>
                                  <th className="pb-2 font-semibold">Note</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {records.slice(0, 6).map((rec, ri) => (
                                  <tr key={ri} className="hover:bg-white transition-colors">
                                    <td className="py-1.5 pr-4 text-slate-500 whitespace-nowrap">{rec.date}</td>
                                    <td className="py-1.5 pr-4 text-slate-700 font-medium">{rec.subject || '—'}</td>
                                    <td className="py-1.5 pr-4">
                                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${rec.positive_points ? 'bg-emerald-100 text-emerald-700' : rec.safeguarding_note ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                                        {rec.incident_type || 'incident'}
                                      </span>
                                    </td>
                                    <td className="py-1.5 pr-4 font-semibold text-slate-700">{rec.behaviour_points || '—'}</td>
                                    <td className="py-1.5 text-slate-500 max-w-[200px] truncate">{rec.comment || '—'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {records.length > 6 && (
                              <p className="text-xs text-slate-400 mt-2 text-center">Showing 6 of {records.length} · <span className="text-teal-600 cursor-pointer hover:underline" onClick={() => navigate(`/students/${student.id}?tab=behaviour`)}>View all</span></p>
                            )}
                          </div>
                        </div>
                      )}
                      {!hasAnyEvidence && (
                        <p className="text-xs text-slate-400 py-4 text-center">No detailed evidence records available. View student profile for full history.</p>
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {/* Bulk action modal */}
      {bulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setBulkModalOpen(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Create bulk action</h3>
                <p className="text-xs text-slate-400 mt-0.5">{selectedIds.size} students selected</p>
              </div>
              <button onClick={() => setBulkModalOpen(false)} className="p-2 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Action type</label>
                <select value={bulkForm.action_type} onChange={e => setBulkForm(f => ({ ...f, action_type: e.target.value }))} className="input-premium w-full">
                  {['Tutor check-in', 'Parent/carer contact', 'Pastoral meeting', 'Attendance meeting', 'Attendance letter', 'SEND review', 'Mentoring', 'Subject teacher follow-up'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Assign to</label>
                <select value={bulkForm.assigned_to} onChange={e => setBulkForm(f => ({ ...f, assigned_to: e.target.value }))} className="input-premium w-full">
                  <option value="">Select staff member...</option>
                  {schoolProfiles.length > 0
                    ? schoolProfiles.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name} — {p.role}</option>
                      ))
                    : DEMO_STAFF.map(s => (
                        <option key={s.name} value={s.name}>{s.name} — {s.role}</option>
                      ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Due date</label>
                <input type="date" value={bulkForm.due_date} onChange={e => setBulkForm(f => ({ ...f, due_date: e.target.value }))} className="input-premium w-full" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea rows={2} value={bulkForm.notes} onChange={e => setBulkForm(f => ({ ...f, notes: e.target.value }))} className="input-premium w-full resize-none" placeholder="Applied to all selected students..." />
              </div>
              <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                <p className="text-xs font-semibold text-slate-600 mb-2">Creating individual actions for:</p>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                  {Array.from(selectedIds).map(id => {
                    const item = items.find(i => i.student.id === id);
                    return item ? (
                      <span key={id} className="text-xs bg-white border border-slate-200 px-2 py-0.5 rounded-full text-slate-700">{item.student.name}</span>
                    ) : null;
                  })}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3">
              <button onClick={() => setBulkModalOpen(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                disabled={!bulkForm.assigned_to}
                onClick={() => {
                  navigate(`/interventions?bulk=1&students=${Array.from(selectedIds).join(',')}&action_type=${encodeURIComponent(bulkForm.action_type)}&assigned_to=${encodeURIComponent(bulkForm.assigned_to)}&due_date=${bulkForm.due_date}&notes=${encodeURIComponent(bulkForm.notes)}`);
                  setBulkModalOpen(false);
                  setSelectedIds(new Set());
                }}
                className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                Create {selectedIds.size} actions
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dismiss with reason modal */}
      {dismissReasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDismissReasonModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-base font-bold text-slate-900 mb-1">Dismiss signal</h3>
            <p className="text-sm text-slate-500 mb-4">{dismissReasonModal.name} — please record the reason for dismissal.</p>
            <textarea
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              rows={3}
              placeholder="e.g. Already reviewed in pastoral meeting. Parent contacted. No further action needed at this time."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 resize-none"
              autoFocus
            />
            <div className="flex gap-3 mt-4">
              <button
                onClick={confirmDismiss}
                className="flex-1 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
              >
                Dismiss signal
              </button>
              <button
                onClick={() => { setDismissReasonModal(null); setDismissReason(''); }}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 text-xs text-slate-500 flex items-start gap-3">
        <Heart className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
        <span>
          Student Signal supports professional judgement — it does not replace it. All signals should be considered alongside direct knowledge of the student. Patterns are derived from available data and may not reflect the full picture. Refer to your school's safeguarding policy for any welfare concerns.
        </span>
        {dismissed.size > 0 && (
          <button
            onClick={() => setShowDismissed(!showDismissed)}
            className="ml-auto shrink-0 flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 transition-colors font-medium"
          >
            <Archive className="w-3.5 h-3.5" />
            {showDismissed ? 'Hide' : `View ${dismissed.size} dismissed`}
          </button>
        )}
      </div>

      {/* Dismissed patterns view */}
      {showDismissed && dismissed.size > 0 && (
        <div className="card-premium overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-3">
            <Archive className="w-5 h-5 text-slate-500" />
            <div>
              <h3 className="font-semibold text-slate-800">Dismissed patterns</h3>
              <p className="text-xs text-slate-500">Patterns dismissed from the queue. Restore to re-activate monitoring.</p>
            </div>
          </div>
          <div className="divide-y divide-slate-50">
            {items.filter(item => dismissed.has(item.student.id)).map(item => {
              const reason = dismissedReasons[item.student.id];
              const pc = PATTERN_COLORS[item.pattern.type];
              return (
                <div key={item.student.id} className="px-6 py-4 flex items-center gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-slate-800">{item.student.name}</span>
                      <span className="text-xs text-slate-400">{item.student.year_group}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${pc.bg} ${pc.text} ${pc.border}`}>
                        {item.pattern.label}
                      </span>
                    </div>
                    {reason && (
                      <p className="text-xs text-slate-500 mt-0.5">
                        Dismissed by <span className="font-medium">{reason.by}</span> · {reason.at}
                        {reason.reason !== 'No reason given' && <span> · "{reason.reason}"</span>}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => restorePattern(item.student.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors shrink-0"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Restore
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Accept & Assign Modal */}
      {acceptModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAcceptModalItem(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
              <div>
                <h3 className="font-bold text-slate-900">Accept & Assign</h3>
                <p className="text-xs text-slate-500 mt-0.5">{acceptModalItem.student.name} — {acceptModalItem.student.year_group}</p>
              </div>
              <button onClick={() => setAcceptModalItem(null)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-4 h-4" /></button>
            </div>
            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
              {/* Signal context */}
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full ${acceptModalItem.student.signal_category === 'red' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                    {acceptModalItem.pattern.label}
                  </span>
                  <span className="text-xs text-slate-500">Confidence: {acceptModalItem.pattern.confidenceScore}%</span>
                </div>
                {/* Why? — canonical ExplainPanel using explainEngine */}
                {acceptForm.reason && acceptModalItem && (() => {
                  const sig = acceptModalItem.student;
                  const assignExpl = explainAssignment(
                    schoolProfiles.find(p => p.id === acceptForm.assigned_to_user_id)?.full_name ?? acceptForm.assigned_to ?? null,
                    acceptForm.assigned_role ?? 'head_of_year',
                    null,
                    !acceptForm.assigned_to_user_id,
                    null,
                  );
                  return (
                    <AssignmentRationale
                      summary={assignExpl.summary}
                      bullets={[acceptForm.reason, ...(assignExpl.paragraphs ?? [])].filter(Boolean) as string[]}
                    />
                  );
                })()}
                {acceptModalItem.pattern.evidenceSummary.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Evidence</div>
                    {acceptModalItem.pattern.evidenceSummary.map((e, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <div className="w-1 h-1 rounded-full bg-slate-400 mt-1.5 shrink-0" />{e}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Action type</label>
                <select
                  value={acceptForm.action_type}
                  onChange={e => setAcceptForm(f => ({ ...f, action_type: e.target.value }))}
                  className="input-premium w-full"
                >
                  {['DSL welfare review', 'Pastoral meeting', 'Pastoral check-in', 'Attendance meeting', 'SEND review', 'Subject intervention', 'Parent contact', 'Tutor check-in', 'Mentoring', 'Safeguarding referral'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Assign to</label>
                <select
                  value={acceptForm.assigned_to}
                  onChange={e => setAcceptForm(f => ({ ...f, assigned_to: e.target.value }))}
                  className="input-premium w-full"
                >
                  <option value="">Select staff member...</option>
                  {schoolProfiles.length > 0
                    ? schoolProfiles.map(p => (
                        <option key={p.id} value={p.id}>{p.full_name} — {p.role}</option>
                      ))
                    : DEMO_STAFF.map(s => (
                        <option key={s.name} value={s.name}>{s.name} — {s.role}</option>
                      ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Priority</label>
                  <select
                    value={acceptForm.priority}
                    onChange={e => setAcceptForm(f => ({ ...f, priority: e.target.value }))}
                    className="input-premium w-full"
                  >
                    {['urgent', 'high', 'medium', 'low'].map(p => (
                      <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Due date</label>
                  <input
                    type="date"
                    value={acceptForm.due_date}
                    onChange={e => setAcceptForm(f => ({ ...f, due_date: e.target.value }))}
                    className="input-premium w-full"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea
                  rows={3}
                  value={acceptForm.notes}
                  onChange={e => setAcceptForm(f => ({ ...f, notes: e.target.value }))}
                  className="input-premium w-full resize-none"
                />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex gap-3 shrink-0">
              <button onClick={() => setAcceptModalItem(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                disabled={!acceptForm.assigned_to}
                onClick={() => {
                  const student = acceptModalItem.student;
                  const today = new Date();
                  const reviewDate = new Date(today);
                  reviewDate.setDate(today.getDate() + 7);
                  const newId = `sq-accept-${Date.now()}`;

                  // If there's an existing suggested intervention for this student+action_type, promote it to open
                  const existingSuggested = acceptModalItem.suggestedInterventions.find(
                    i => i.action_type === acceptForm.action_type
                  );

                  if (existingSuggested && demoMode) {
                    updateDemoIntervention(existingSuggested.id, {
                      status: 'open',
                      assigned_to: acceptForm.assigned_to,
                      priority: acceptForm.priority as any,
                      due_date: acceptForm.due_date,
                      notes: acceptForm.notes || existingSuggested.notes,
                      review_date: reviewDate.toISOString().split('T')[0],
                    });
                  } else if (demoMode) {
                    addDemoIntervention({
                      id: newId,
                      student_id: student.id,
                      assigned_to: acceptForm.assigned_to,
                      created_by: currentUserName,
                      action_type: acceptForm.action_type,
                      priority: acceptForm.priority as any,
                      status: 'open',
                      due_date: acceptForm.due_date,
                      review_date: reviewDate.toISOString().split('T')[0],
                      notes: acceptForm.notes || null,
                      outcome: null,
                      reason: acceptForm.reason,
                      created_at: today.toISOString(),
                    });
                  }

                  setDemoSignalStatus(student.id, 'action_in_progress');
                  setAcceptModalItem(null);
                  addToast(`Action assigned to ${acceptForm.assigned_to.split(' (')[0]}`, 'success');
                }}
                className="btn-primary flex-1 disabled:opacity-50"
              >
                Accept & Assign
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

