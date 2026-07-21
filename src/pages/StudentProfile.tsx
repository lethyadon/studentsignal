import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { triggerReanalysis } from '../lib/analysistrigger';
import { getStudent, getBehaviourRecords, getAnalysisForStudent, getCareerProfile, getInterventions, getStudents, getCommunications, DEMO_STAFF, mapOwnerToStaffName, HOY_BY_YEAR, getDemoRecognitions, addDemoIntervention, updateDemoIntervention, getDemoDismissals, addDemoDismissal, getDemoSignalStatus, setDemoSignalStatus, subscribeToInterventions, pushLiveNotification, addDemoBehaviourRecord, getHOYYearGroup } from '../lib/data';
import { computeStudentIntelligence, getActionsForRole, composeExplanationFromAnalysis } from '../lib/intelligence';
import type { Student, BehaviourRecord, AnalysisResult, CareerProfile, Intervention, QuickNote, Communication } from '../types';
import { Toast, useToast } from '../components/Toast';
import QuickNoteModal from '../components/QuickNoteModal';
import { detectSafeguarding } from '../lib/safeguarding';
import SafeguardingAlert from '../components/SafeguardingAlert';
import { getVisibleNoteTypes, hasPermission, isStudentInScope } from '../lib/permissions';
import {
  ArrowLeft, User, AlertTriangle, AlertCircle, TrendingDown, BookOpen, Clock,
  Phone, Briefcase, Calendar, CalendarDays, Brain, GraduationCap, ClipboardList,
  ShieldAlert, CheckCircle, Plus, Edit, Save, X, Activity,
  MessageSquare, Eye, RefreshCw, ChevronDown, ChevronUp, StickyNote,
  Target, Zap, ArrowRight, Flag, FileText, RotateCcw, ChevronRight,
  TrendingUp, Star, Layers, Route, Siren,
} from 'lucide-react';

const TABS = [
  { id: 'overview', label: 'Overview', icon: User },
  { id: 'patterns', label: 'Signals', icon: Layers },
  { id: 'actions', label: 'Actions', icon: ClipboardList },
  { id: 'timeline', label: 'Timeline', icon: Calendar },
  { id: 'notes', label: 'Notes', icon: StickyNote },
  { id: 'behaviour', label: 'Behaviour', icon: TrendingDown },
  { id: 'attendance', label: 'Attendance', icon: Clock },
  { id: 'send', label: 'SEND', icon: Brain },
  { id: 'careers', label: 'Careers', icon: GraduationCap },
];

const ACTION_TYPES = [
  'Pastoral meeting', 'Parent/carer contact', 'Tutor check-in', 'SEND review',
  'Attendance meeting', 'Behaviour report card', 'Careers guidance meeting',
  'Safeguarding referral', 'Mentoring', 'Restorative conversation', 'Subject teacher follow-up',
  'Multi-agency meeting', 'Discreet welfare check', 'Re-engagement strategy',
  'Bereavement support', 'Counselling referral', 'Welfare check',
];

interface TimelineEvent {
  date: string;
  type: 'behaviour' | 'attendance' | 'pastoral' | 'intervention' | 'outcome' | 'send' | 'signal' | 'review' | 'communication' | 'note' | 'success' | 'neet' | 'career' | 'escalation' | 'safeguarding';
  title: string;
  description: string;
  severity?: 'high' | 'medium' | 'low';
  category: string;
  staff?: string;
  meta?: string;
}

interface ActivityEntry {
  id: string;
  timestamp: string;
  text: string;
}

interface ReviewLogEntry {
  id: string;
  recId: string;
  recName: string;
  action: 'reviewed' | 'actioned' | 'escalated' | 'dismissed';
  reason?: string;
  owner?: string;
  timestamp: string;
  undone: boolean;
}

interface RecommendedAction {
  id: string;
  action_name: string;
  action_type: string;
  reason: string;
  suggested_owner: string;
  review_weeks: number;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  icon_type: 'pastoral' | 'parent' | 'staff' | 'careers';
  // Evidence link — drives the "Review source evidence" flow
  evidence_type?: 'safeguarding_note' | 'send_record' | 'behaviour' | 'attendance' | 'analysis' | 'staff_note';
  evidence_id?: string;
  evidence_label?: string;
  evidence_items?: Array<{ label: string; value: string; severity?: 'high' | 'medium' | 'low' }>;
  owner_role?: 'dsl' | 'sendco' | 'form_tutor' | 'subject_teacher' | 'hoy' | 'attendance';
}

interface AssignModalState {
  action_type: string;
  reason: string;
  suggested_owner: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  review_weeks: number;
  rec_id?: string; // recommendation that triggered this modal — dismissed on assign
}

function generateId() {
  return 'local_' + Math.random().toString(36).slice(2) + Date.now();
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getCreatorTitle(createdBy: string | null | undefined): string {
  if (!createdBy) return '';
  const m = createdBy.match(/\(([^)]+)\)/);
  if (m) return m[1];
  if (/system/i.test(createdBy)) return 'System';
  return '';
}

function addWeeks(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n * 7);
  return d.toISOString().split('T')[0];
}

function isReviewDue(i: Intervention): boolean {
  if (!i.review_date) return false;
  if (['completed', 'closed', 'cancelled'].includes(i.status)) return false;
  return new Date(i.review_date) <= new Date();
}

interface NeetRiskResult {
  level: 'Low' | 'Medium' | 'At Risk' | 'High Risk';
  score: number;
  indicators: Array<{ label: string; weight: 'high' | 'medium' | 'low'; detail: string }>;
  suggestedActions: string[];
}

function computeNeetRisk(
  student: Student | null,
  analysis: AnalysisResult | null,
  behaviour: BehaviourRecord[],
  interventions: Intervention[],
  career: CareerProfile | null,
): NeetRiskResult {
  let score = 0;
  const indicators: NeetRiskResult['indicators'] = [];

  if (!student) return { level: 'Low', score: 0, indicators: [], suggestedActions: [] };

  const att = student.attendance_pct ?? 95;
  if (att < 80) { score += 20; indicators.push({ label: 'Persistent absence', weight: 'high', detail: `Attendance ${att}% — well below 90% target` }); }
  else if (att < 90) { score += 12; indicators.push({ label: 'Below attendance target', weight: 'medium', detail: `Attendance ${att}% — below 90% target` }); }
  else if (att < 95) { score += 5; indicators.push({ label: 'Attendance concern', weight: 'low', detail: `Attendance ${att}% — below 95% national benchmark` }); }

  const recentBeh = behaviour.filter(b => {
    const d = new Date(b.date);
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 60);
    return d >= cutoff;
  });
  const behPts = recentBeh.reduce((s, b) => s + (b.behaviour_points || 0), 0);
  if (analysis?.behaviour_trend === 'Escalating') { score += 15; indicators.push({ label: 'Escalating behaviour', weight: 'high', detail: 'Behaviour trend is worsening over recent weeks' }); }
  else if (behPts >= 10) { score += 8; indicators.push({ label: 'Repeated behaviour concerns', weight: 'medium', detail: `${behPts} behaviour points in the last 60 days` }); }

  const subjectCounts = new Map<string, number>();
  recentBeh.forEach(b => { if (b.subject) subjectCounts.set(b.subject, (subjectCounts.get(b.subject) || 0) + 1); });
  const topSubject = Array.from(subjectCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  if (topSubject && topSubject[1] >= 3) {
    score += 8;
    indicators.push({ label: `Disengagement from ${topSubject[0]}`, weight: 'medium', detail: `${topSubject[1]} incidents linked to ${topSubject[0]}` });
  }

  if (student.send_status === 'EHCP') { score += 10; indicators.push({ label: 'EHCP recorded', weight: 'high', detail: 'Student has an Education, Health and Care Plan' }); }
  else if (student.send_status?.includes('Plan') || student.send_status) { score += 6; indicators.push({ label: 'SEND support', weight: 'medium', detail: `SEND status: ${student.send_status}` }); }

  if (student.pupil_premium) { score += 6; indicators.push({ label: 'Pupil Premium eligible', weight: 'medium', detail: 'Disadvantage gap risk factor' }); }

  if (!career?.career_interests?.length && !career?.career_goal) { score += 8; indicators.push({ label: 'No career interest recorded', weight: 'medium', detail: 'No career aspirations or interests on file' }); }
  if (!career?.destination_risk || career.destination_risk === 'At risk of NEET' || career.destination_risk === 'High risk of NEET') {
    if (!career?.destination_risk) { score += 6; indicators.push({ label: 'No post-16 destination recorded', weight: 'medium', detail: 'Destination not yet confirmed' }); }
  }
  if (career?.confidence_level === 'Low') { score += 5; indicators.push({ label: 'Low confidence noted', weight: 'low', detail: 'Staff have assessed confidence as low' }); }

  const failedInterventions = interventions.filter(i => i.status === 'completed' && (i.outcome_achieved === 'not_achieved' || i.outcome_notes?.includes('No Change') || i.outcome_notes?.includes('Deteriorated')));
  if (failedInterventions.length >= 2) { score += 10; indicators.push({ label: 'Repeated intervention failure', weight: 'high', detail: `${failedInterventions.length} interventions completed without improvement` }); }
  else if (failedInterventions.length === 1) { score += 4; indicators.push({ label: 'Previous intervention unsuccessful', weight: 'low', detail: '1 intervention completed without clear improvement' }); }

  const yearGroup = student.year_group || '';
  if (['Year 11', 'Year 10', '6th Form', 'Year 13', 'Year 12'].includes(yearGroup) && (!career?.destination_risk || career.destination_risk !== 'On track')) {
    score += 5; indicators.push({ label: `Senior year — destination not confirmed`, weight: 'medium', detail: `${yearGroup} student — transition planning needed` });
  }

  const level: NeetRiskResult['level'] =
    score >= 40 ? 'High Risk' :
    score >= 25 ? 'At Risk' :
    score >= 12 ? 'Medium' : 'Low';

  const suggestedActions: string[] = [];
  if (level === 'High Risk' || level === 'At Risk') {
    suggestedActions.push('Careers adviser meeting');
    suggestedActions.push('Parent/carer discussion');
  }
  if (indicators.some(i => i.label.includes('attendance') || i.label.includes('absence'))) suggestedActions.push('Attendance support meeting');
  if (indicators.some(i => i.label.includes('Disengagement') || i.label.includes('subject'))) suggestedActions.push('Subject teacher check-in');
  if (student.send_status) suggestedActions.push('SEND careers support');
  if (!career?.career_interests?.length) suggestedActions.push('College/apprenticeship signposting');
  if (indicators.some(i => i.label.includes('confidence'))) suggestedActions.push('Confidence/mentoring intervention');
  if (indicators.some(i => i.label.includes('destination'))) suggestedActions.push('Post-16 destination planning');
  if (level === 'High Risk') suggestedActions.push('Work experience support');

  return { level, score, indicators: indicators.sort((a, b) => (b.weight === 'high' ? 2 : b.weight === 'medium' ? 1 : 0) - (a.weight === 'high' ? 2 : a.weight === 'medium' ? 1 : 0)), suggestedActions: [...new Set(suggestedActions)] };
}

const TYPE_COLORS: Record<string, string> = {
  behaviour: 'bg-red-100 text-red-700',
  attendance: 'bg-blue-100 text-blue-700',
  pastoral: 'bg-purple-100 text-purple-700',
  intervention: 'bg-teal-100 text-teal-700',
  outcome: 'bg-emerald-100 text-emerald-700',
  send: 'bg-amber-100 text-amber-700',
  signal: 'bg-slate-100 text-slate-700',
  review: 'bg-orange-100 text-orange-700',
  communication: 'bg-blue-50 text-blue-700',
};

const TYPE_DOT: Record<string, string> = {
  behaviour: 'bg-red-400',
  attendance: 'bg-blue-400',
  pastoral: 'bg-purple-400',
  intervention: 'bg-teal-400',
  outcome: 'bg-emerald-400',
  send: 'bg-amber-400',
  signal: 'bg-slate-400',
  review: 'bg-orange-400',
  communication: 'bg-blue-300',
};

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  suggested:   { label: 'Suggested',   classes: 'bg-slate-100 text-slate-600 border-slate-200' },
  open:        { label: 'Open',        classes: 'bg-blue-100 text-blue-700 border-blue-200' },
  assigned:    { label: 'Assigned',    classes: 'bg-teal-100 text-teal-700 border-teal-200' },
  in_progress: { label: 'In Progress', classes: 'bg-amber-100 text-amber-700 border-amber-200' },
  review_due:  { label: 'Review Due',  classes: 'bg-orange-100 text-orange-700 border-orange-200' },
  completed:   { label: 'Completed',   classes: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  escalated:   { label: 'Escalated',   classes: 'bg-red-100 text-red-700 border-red-200' },
  closed:      { label: 'Closed',      classes: 'bg-slate-100 text-slate-500 border-slate-200' },
  cancelled:   { label: 'Cancelled',   classes: 'bg-slate-100 text-slate-400 border-slate-200' },
};

const IMPACT_CONFIG: Record<string, { label: string; classes: string }> = {
  improving:  { label: 'Improving',  classes: 'bg-emerald-100 text-emerald-700' },
  resolved:   { label: 'Resolved',   classes: 'bg-teal-100 text-teal-700' },
  sustained:  { label: 'Sustained',  classes: 'bg-blue-100 text-blue-700' },
  no_change:  { label: 'No Change',  classes: 'bg-slate-100 text-slate-600' },
  escalating: { label: 'Escalating', classes: 'bg-red-100 text-red-700' },
};

const ESCALATION_MAP: Record<string, string> = {
  'Tutor check-in': 'Pastoral meeting',
  'Discreet welfare check': 'Pastoral meeting',
  'Pastoral meeting': 'Parent/carer contact',
  'Re-engagement strategy': 'Pastoral meeting',
  'Parent/carer contact': 'Multi-agency meeting',
  'Behaviour report card': 'Parent/carer contact',
  'Mentoring': 'Pastoral meeting with parent',
  'SEND review': 'EHCP emergency review',
  'Attendance meeting': 'Parent/carer contact',
  'Restorative conversation': 'Pastoral meeting',
  'Subject teacher follow-up': 'Pastoral meeting',
};

const MOCK_AI_SUMMARIES: Record<string, { riskScore: number; reasons: string[]; actions: string[] }> = {
  s1: { riskScore: 82, reasons: ['Attendance: 88% (−12% over 3 weeks)', 'Behaviour: 8 incidents in 14 days (24 pts)', 'Science: 4 of 8 incidents (50%)', 'SEND status: EHC Plan recorded', '2 staff notes, concern level 4'], actions: ['Parent/carer contact', 'Tutor check-in', 'Attendance support meeting', 'Review in 2 weeks'] },
  s2: { riskScore: 76, reasons: ['Attendance: 74%', 'EHCP on record — last SEND review: none in 8 weeks', 'Science: 3 incidents recorded', 'No parent/carer contact on record'], actions: ['SEND review', 'Parent/carer contact', 'Science teacher liaison', 'Confidence-building referral'] },
  s3: { riskScore: 74, reasons: ['Attendance: 81%', 'PE: 2 of 4 incidents linked to PE', 'Pupil Premium: eligible', 'Year 11 — no destination recorded'], actions: ['Pastoral meeting', 'Parent/carer contact', 'Careers conversation', 'Consider mentoring'] },
  s4: { riskScore: 45, reasons: ['SEN Support on record', 'Attendance: 88%', 'Maths: 1 incident (2 pts)'], actions: ['Tutor check-in', 'Maths teacher follow-up', 'Consider parent contact'] },
  s5: { riskScore: 42, reasons: ['Attendance: 85%', 'Pupil Premium: eligible', 'Destination risk: not yet recorded'], actions: ['Attendance check-in', 'Careers conversation', 'Consider resource access support'] },
  s6: { riskScore: 28, reasons: ['Behaviour: 1 incident (1 pt, Maths)', 'Attendance: 96%'], actions: ['Monitor', 'Tutor check-in at next scheduled date'] },
};

const MOCK_QUICK_NOTES: QuickNote[] = [
  { id: 'qn1', student_id: 's1', category: 'Pastoral concern', concern_level: 4, visibility: 'general', note: 'Oliver seemed very withdrawn today. Avoided eye contact with staff and sat alone at lunch — out of character.', staff_member: 'Ms Harris', date: '2024-06-17', created_at: '2024-06-17T11:30:00Z' },
  { id: 'qn2', student_id: 's1', category: 'Attendance concern', concern_level: 4, visibility: 'general', note: 'Parent called in — Oliver not attending today. Third time this month with no medical note.', staff_member: 'Reception', date: '2024-06-14', created_at: '2024-06-14T09:00:00Z' },
  { id: 'qn3', student_id: 's2', category: 'Pastoral concern', concern_level: 5, visibility: 'dsl_only', note: 'Sophie disclosed feeling unsafe at home. Referred immediately to DSL. Sophie seemed relieved to have spoken.', staff_member: 'Mr James', date: '2024-06-16', created_at: '2024-06-16T14:00:00Z' },
  { id: 'qn4', student_id: 's5', category: 'Behaviour concern', concern_level: 3, visibility: 'general', note: 'Noah did not speak for the entire lesson — previously one of the most engaged students. Worth monitoring.', staff_member: 'Ms Jones', date: '2024-06-15', created_at: '2024-06-15T10:00:00Z' },
  { id: 'qn5', student_id: 's6', category: 'Positive observation', concern_level: 1, visibility: 'general', note: 'Isla led the group presentation today with confidence. Her peers clearly look up to her. A real transformation from last term.', staff_member: 'Mr Lee', date: '2024-06-15', created_at: '2024-06-15T13:00:00Z' },
  { id: 'qn6', student_id: 's9', category: 'Positive observation', concern_level: 1, visibility: 'general', note: 'Priya stayed after class to help two Year 9 students with their GCSE revision — completely unprompted. Exceptional character.', staff_member: 'Mr Smith', date: '2024-06-14', created_at: '2024-06-14T15:30:00Z' },
];

export default function StudentProfile() {
  const { id } = useParams<{ id: string }>();
  const { profile, demoMode } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toasts, addToast, dismissToast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [newTabs, setNewTabs] = useState<Set<string>>(new Set());
  const [highlightedId, setHighlightedId] = useState<string | null>(null);
  const fromQueue = !!highlightedId;
  const [student, setStudent] = useState<Student | null>(null);
  const [behaviour, setBehaviour] = useState<BehaviourRecord[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [career, setCareer] = useState<CareerProfile | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [communications, setCommunications] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCareer, setEditingCareer] = useState(false);
  const [careerForm, setCareerForm] = useState<Partial<CareerProfile>>({});
  const [lastCreated, setLastCreated] = useState<Intervention | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [outcomeModal, setOutcomeModal] = useState<{ id: string; current: string } | null>(null);
  const [outcomeText, setOutcomeText] = useState('');
  const [outcomeSgDismissed, setOutcomeSgDismissed] = useState(false);
  const [outcomeSgAccepted, setOutcomeSgAccepted] = useState(false);
  const [quickNotes, setQuickNotes] = useState<QuickNote[]>([]);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [dismissedActions, setDismissedActions] = useState<Set<string>>(new Set());
  const [reviewLog, setReviewLog] = useState<ReviewLogEntry[]>([]);
  const [successRecognitions, setSuccessRecognitions] = useState<Array<{ id: string; recognition_type: string; recognition_label: string; notes: string; completed_by: string; completed_at: string }>>([]);
  const [signalStatus, setSignalStatusState] = useState<import('../lib/data').SignalStatus>('new');

  // Evidence review modal — forces staff to see the source evidence before acting
  const [evidenceModal, setEvidenceModal] = useState<{
    rec: RecommendedAction;
    dismissReason: string;
    showDismissInput: boolean;
  } | null>(null);

  // Assign modal state
  const [assignModal, setAssignModal] = useState<AssignModalState | null>(null);
  const [assignForm, setAssignForm] = useState({
    action_type: '',
    assigned_to: '',
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    due_date: '',
    review_date: '',
    notes: '',
  });
  const [assignSgDismissed, setAssignSgDismissed] = useState(false);
  const [assignSgAccepted, setAssignSgAccepted] = useState(false);

  // Review modal state
  const [reviewModal, setReviewModal] = useState<Intervention | null>(null);
  const [reviewForm, setReviewForm] = useState({
    action_taken: null as boolean | null,
    student_improved: null as 'improved' | 'no_change' | 'worsened' | null,
    notes: '',
    current_attendance: '',
    current_behaviour: '',
  });

  // Escalation modal state
  const [escalationModal, setEscalationModal] = useState<Intervention | null>(null);
  const [reassignTarget, setReassignTarget] = useState<Intervention | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [escalationForm, setEscalationForm] = useState({
    escalateTo: '',
    reason: '',
    priority: 'high' as 'high' | 'urgent',
    notes: '',
    reviewDate: '',
  });
  const [escalationSuggestion, setEscalationSuggestion] = useState<{ target: string; staffName: string; reason: string } | null>(null);
  const [selectedExternalAgency, setSelectedExternalAgency] = useState<string | null>(null);

  const [completeModal, setCompleteModal] = useState<Intervention | null>(null);
  const [completeForm, setCompleteForm] = useState({
    outcomeText: '',
    outcomeAchieved: 'achieved' as 'achieved' | 'partially' | 'not_achieved',
    outcomeCategory: '',
    nextStep: '',
    overrideReason: '',
    showOverride: false,
  });
  const [completeSgDismissed, setCompleteSgDismissed] = useState(false);
  const [completeSgAccepted, setCompleteSgAccepted] = useState(false);

  const [actionPathModal, setActionPathModal] = useState<RecommendedAction | null>(null);

  const [neetOverrideModal, setNeetOverrideModal] = useState(false);
  const [neetOverrideForm, setNeetOverrideForm] = useState({ level: '', reason: '' });

  const effectiveSchoolId = demoMode ? null : profile?.school_id;

  useEffect(() => {
    async function load() {
      if (!id) { setLoading(false); return; }
      const [s, b, a, c, i, comms] = await Promise.all([
        getStudent(effectiveSchoolId, id),
        getBehaviourRecords(effectiveSchoolId, id),
        getAnalysisForStudent(effectiveSchoolId, id),
        getCareerProfile(effectiveSchoolId, id),
        getInterventions(effectiveSchoolId, id),
        getCommunications(effectiveSchoolId, id),
      ]);
      setStudent(s);
      setBehaviour(b);
      setAnalysis(a);
      setCareer(c);
      if (c) setCareerForm(c);
      setInterventions(i);
      setCommunications(comms);

      if (!effectiveSchoolId) {
        setQuickNotes(MOCK_QUICK_NOTES.filter((n) => n.student_id === id));
        // Load recognitions from demo store
        const demoRecs = getDemoRecognitions().filter(r => r.student_id === id && !r.is_undone && !r.is_dismissed);
        setSuccessRecognitions(demoRecs);
        // getInterventions already merges the demo store with mocks, so use it directly
        setInterventions(i);
        // Load dismissals from demo store
        setDismissedActions(getDemoDismissals(id));
        // Load signal status from demo store
        setSignalStatusState(getDemoSignalStatus(id));
      } else {
        const { data: notesData } = await supabase
          .from('quick_notes').select('*')
          .eq('school_id', effectiveSchoolId).eq('student_id', id)
          .order('created_at', { ascending: false });
        setQuickNotes((notesData as QuickNote[]) || []);

        // Load persisted recommendation dismissals
        const { data: dismissData } = await supabase
          .from('recommendation_dismissals')
          .select('recommendation_id')
          .eq('school_id', effectiveSchoolId)
          .eq('student_id', id)
          .eq('is_active', true);
        if (dismissData) {
          setDismissedActions(new Set(dismissData.map((r: { recommendation_id: string }) => r.recommendation_id)));
        }

        // Load success recognitions for timeline
        const { data: recData } = await supabase
          .from('success_recognitions')
          .select('id, recognition_type, recognition_label, notes, completed_by, completed_at')
          .eq('school_id', effectiveSchoolId)
          .eq('student_id', id)
          .eq('is_undone', false)
          .order('completed_at', { ascending: false });
        if (recData) setSuccessRecognitions(recData);
      }

      const allStudents = await getStudents(effectiveSchoolId);
      setStudents(allStudents);

      const seed: ActivityEntry[] = [];
      if (a) {
        seed.push({ id: 'signal_' + id, timestamp: i[0]?.created_at || new Date().toISOString(), text: `Signal generated: ${a.signal_category || a.risk_level} — ${a.key_reasons?.[0] || 'Analysis complete'}` });
      }
      i.forEach((iv) => {
        seed.push({ id: iv.id + '_created', timestamp: iv.created_at, text: `${iv.action_type} created — assigned to ${iv.assigned_to || 'staff'}` });
        if (iv.status === 'completed') {
          seed.push({ id: iv.id + '_completed', timestamp: iv.due_date || iv.created_at, text: `${iv.action_type} marked complete` });
        }
        if (iv.review_completed) {
          seed.push({ id: iv.id + '_reviewed', timestamp: iv.review_date || iv.created_at, text: `Review completed for ${iv.action_type} — ${iv.review_student_improved || 'outcome recorded'}` });
        }
      });
      comms.forEach((cm) => {
        seed.push({ id: 'comm_' + cm.id, timestamp: cm.date + 'T00:00:00Z', text: `Communication logged: ${cm.source.replace(/_/g, ' ')} — ${cm.summary.slice(0, 80)}${cm.summary.length > 80 ? '...' : ''}${cm.staff_member ? ` (${cm.staff_member})` : ''}` });
      });
      setActivityFeed(seed.sort((a, b) => b.timestamp.localeCompare(a.timestamp)));
      setLoading(false);

      // Apply URL params after load
      const tabParam = searchParams.get('tab');
      const tabAllowed = tabParam === 'send' ? hasPermission(profile?.role, 'view_send') : true;
      if (tabParam && tabAllowed && TABS.some(t => t.id === tabParam)) {
        setActiveTab(tabParam);
      } else {
        // Default to actions tab when there are open interventions — no notification click required
        const openCount = i.filter(iv => !['completed', 'closed', 'cancelled'].includes(iv.status)).length;
        if (openCount > 0) setActiveTab('actions');
      }
      const hlParam = searchParams.get('highlight');
      if (hlParam) {
        setHighlightedId(hlParam);
        // Scroll to the highlighted intervention after a short delay for render
        setTimeout(() => {
          const el = document.getElementById(`intervention-${hlParam}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 350);
      }
    }
    load();
  }, [id, effectiveSchoolId]);

  // Re-fetch behaviour records and interventions whenever demo data changes
  // (e.g. QuickNote raised by teacher adds a behaviour record + intervention)
  useEffect(() => {
    if (!demoMode || !id) return;
    return subscribeToInterventions(() => {
      Promise.all([
        getBehaviourRecords(null, id),
        getInterventions(null, id),
      ]).then(([b, i]) => {
        setBehaviour(b);
        setInterventions(i as Intervention[]);
        // Mark timeline and actions tabs as having new content if not currently viewing them
        setActiveTab(prev => {
          setNewTabs(tabs => {
            const next = new Set(tabs);
            if (prev !== 'timeline') next.add('timeline');
            if (prev !== 'actions') next.add('actions');
            if (prev !== 'notes') next.add('notes');
            return next;
          });
          return prev;
        });
      });
    });
  }, [demoMode, id]);

  // Auto-open the top recommended action when arriving from dashboard "Assign Action"
  useEffect(() => {
    if (!analysis || !student || !searchParams.get('autoopen')) return;
    const recs = buildRecommendedActions();
    if (recs.length > 0) {
      setActionPathModal(recs[0]);
    }
  }, [analysis, student]);

  function buildRecommendedActions(): RecommendedAction[] {
    if (!analysis || !student) return [];
    // Suppress recommendations if an intervention of the same type is still active
    // OR was completed/closed within the last 4 weeks (avoids immediate regeneration).
    // Older completions DO NOT suppress — allows new cycles when patterns re-emerge.
    const fourWeeksAgo = new Date();
    fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
    const cutoff = fourWeeksAgo.toISOString().slice(0, 10);
    const activeTypes = new Set(
      interventions
        .filter((i) => {
          if (i.status === 'cancelled') return false;
          if (['completed', 'closed'].includes(i.status)) {
            const doneDate = (i.completed_at || i.created_at || '').slice(0, 10);
            return doneDate >= cutoff;
          }
          return true;
        })
        .map((i) => i.action_type)
    );
    const isNegative = ['red', 'amber', 'purple'].includes(analysis.signal_category || analysis.risk_level);
    const recs: RecommendedAction[] = [];
    const staffText = (analysis.suggested_staff_action || '').toLowerCase();

    // ── Pastoral meeting ────────────────────────────────────────────────────
    if (isNegative && analysis.suggested_pastoral_action && !activeTypes.has('Pastoral meeting') && !activeTypes.has('Tutor check-in')) {
      recs.push({
        id: 'rec_pastoral', action_name: 'Pastoral Meeting', action_type: 'Pastoral meeting',
        reason: analysis.suggested_pastoral_action,
        suggested_owner: 'Head of Year',
        review_weeks: student.risk_level === 'red' ? 1 : 2,
        priority: student.risk_level === 'red' ? 'urgent' : 'high',
        icon_type: 'pastoral',
        evidence_type: 'analysis',
        owner_role: 'hoy',
        evidence_items: analysis.key_reasons.slice(0, 3).map(r => ({ label: 'Signal reason', value: r, severity: 'medium' as const })),
      });
    }

    // ── Parent/carer contact ────────────────────────────────────────────────
    if (isNegative && analysis.suggested_parent_contact && !activeTypes.has('Parent/carer contact')) {
      recs.push({
        id: 'rec_parent', action_name: 'Parent/Carer Contact', action_type: 'Parent/carer contact',
        reason: analysis.suggested_parent_contact,
        suggested_owner: 'Form Tutor',
        review_weeks: 2,
        priority: student.risk_level === 'red' ? 'high' : 'medium',
        icon_type: 'parent',
        evidence_type: 'analysis',
        owner_role: 'form_tutor',
        evidence_items: [
          { label: 'Attendance', value: `${student.attendance_pct ?? 95}%`, severity: (student.attendance_pct ?? 95) < 80 ? 'high' : 'medium' },
          { label: 'Behaviour incidents', value: `${behaviour.length}`, severity: behaviour.length > 5 ? 'high' : 'medium' },
        ],
      });
    }

    // ── Staff action — parse into specific evidence-linked recs ───────────────
    if (isNegative && analysis.suggested_staff_action) {
      const hasDSL = /dsl|safeguarding/i.test(staffText);
      const hasSEND = /ehcp|send emergency|ehc|send review/i.test(staffText) || (!!student.send_status && /send/i.test(staffText));
      const hasFormTutor = /form tutor/i.test(staffText);
      const hasAttendanceOfficer = /attendance officer|attendance lead/i.test(staffText);

      const safeguardingNote = quickNotes.find(n =>
        n.category === 'Safeguarding concern' || (n.concern_level >= 4 && n.category !== 'Positive observation')
      );
      const hasSafeguardingEvidence = !!safeguardingNote || analysis.key_reasons.some(r => /safeguarding/i.test(r));

      // DSL Review
      if (hasDSL && hasSafeguardingEvidence && !activeTypes.has('Safeguarding referral') && !activeTypes.has('DSL referral')) {
        const safeReason = analysis.key_reasons.find(r => /safeguarding/i.test(r)) || '';
        recs.push({
          id: 'rec_staff_dsl',
          action_name: 'DSL Review Required',
          action_type: 'Safeguarding referral',
          reason: safeguardingNote?.note || safeReason || analysis.suggested_staff_action,
          suggested_owner: 'DSL',
          review_weeks: 1,
          priority: 'urgent',
          icon_type: 'staff',
          evidence_type: safeguardingNote ? 'safeguarding_note' : 'analysis',
          evidence_id: safeguardingNote?.id,
          evidence_label: safeguardingNote
            ? `Safeguarding note — ${safeguardingNote.staff_member || 'staff'}, ${safeguardingNote.date}`
            : 'Safeguarding concern in analysis',
          owner_role: 'dsl',
          evidence_items: [
            safeguardingNote
              ? { label: 'Note', value: safeguardingNote.note, severity: 'high' as const }
              : { label: 'Analysis reason', value: safeReason, severity: 'high' as const },
            { label: 'Concern level', value: safeguardingNote ? `${safeguardingNote.concern_level}/5` : 'High', severity: 'high' as const },
            { label: 'Recorded by', value: safeguardingNote?.staff_member || 'Analysis engine', severity: 'medium' as const },
          ].filter(e => e.value),
        });
      }

      // SEND / EHCP Review
      if (hasSEND && student.send_status && !activeTypes.has('SEND review')) {
        const sendReason = analysis.key_reasons.find(r => /ehcp|send|ehc/i.test(r)) || '';
        const isEmergency = /emergency|urgent/i.test(staffText);
        recs.push({
          id: 'rec_staff_send',
          action_name: isEmergency ? 'EHCP Emergency Review' : 'SEND Review Required',
          action_type: 'SEND review',
          reason: sendReason || `${student.send_status} — review required based on current data`,
          suggested_owner: 'SENDCo',
          review_weeks: 1,
          priority: isEmergency ? 'urgent' : 'high',
          icon_type: 'staff',
          evidence_type: 'send_record',
          evidence_label: `${student.send_status} — current status`,
          owner_role: 'sendco',
          evidence_items: [
            { label: 'SEND status', value: student.send_status, severity: 'high' as const },
            { label: 'Attendance', value: `${student.attendance_pct ?? 95}%`, severity: (student.attendance_pct ?? 95) < 80 ? 'high' : 'medium' as const },
            sendReason ? { label: 'Analysis note', value: sendReason, severity: 'medium' as const } : null,
          ].filter(Boolean) as RecommendedAction['evidence_items'],
        });
      }

      // Form Tutor Alert
      if (hasFormTutor && !activeTypes.has('Tutor check-in')) {
        const tutorNote = quickNotes.find(n => n.concern_level >= 3 && n.category !== 'Safeguarding concern');
        recs.push({
          id: 'rec_staff_tutor',
          action_name: 'Form Tutor Alert',
          action_type: 'Tutor check-in',
          reason: tutorNote?.note || analysis.suggested_staff_action,
          suggested_owner: 'Form Tutor',
          review_weeks: 1,
          priority: 'high',
          icon_type: 'staff',
          evidence_type: tutorNote ? 'staff_note' : 'analysis',
          evidence_id: tutorNote?.id,
          evidence_label: tutorNote ? `Staff note — ${tutorNote.staff_member || 'staff'}, ${tutorNote.date}` : 'Pattern analysis',
          owner_role: 'form_tutor',
          evidence_items: tutorNote
            ? [
                { label: 'Note', value: tutorNote.note, severity: 'medium' as const },
                { label: 'Concern level', value: `${tutorNote.concern_level}/5`, severity: tutorNote.concern_level >= 4 ? 'high' : 'medium' as const },
                { label: 'Recorded by', value: tutorNote.staff_member || 'Staff', severity: 'low' as const },
              ]
            : analysis.key_reasons.slice(0, 2).map(r => ({ label: 'Signal reason', value: r, severity: 'medium' as const })),
        });
      }

      // Attendance Officer
      if (hasAttendanceOfficer && !activeTypes.has('Attendance meeting')) {
        recs.push({
          id: 'rec_staff_attendance',
          action_name: 'Attendance Officer Review',
          action_type: 'Attendance meeting',
          reason: analysis.suggested_staff_action,
          suggested_owner: 'Attendance Officer',
          review_weeks: 1,
          priority: (student.attendance_pct ?? 95) < 80 ? 'urgent' : 'high',
          icon_type: 'staff',
          evidence_type: 'attendance',
          evidence_label: `Attendance: ${student.attendance_pct ?? 95}%`,
          owner_role: 'attendance',
          evidence_items: [
            { label: 'Current attendance', value: `${student.attendance_pct ?? 95}%`, severity: (student.attendance_pct ?? 95) < 80 ? 'high' : 'medium' as const },
            { label: 'Punctuality issues', value: `${student.punctuality_issues ?? 0} late marks`, severity: (student.punctuality_issues ?? 0) > 3 ? 'medium' : 'low' as const },
          ],
        });
      }

      // Generic subject teacher follow-up (only if no specific ones above)
      if (!hasDSL && !hasSEND && !hasFormTutor && !hasAttendanceOfficer && !activeTypes.has('Subject teacher follow-up')) {
        const subjectCounts = new Map<string, number>();
        behaviour.forEach(b => { if (b.subject) subjectCounts.set(b.subject, (subjectCounts.get(b.subject) || 0) + 1); });
        const topSubjectEntry = [...subjectCounts.entries()].sort((a, b) => b[1] - a[1])[0];
        const topSubject = topSubjectEntry?.[0];
        recs.push({
          id: 'rec_staff_teacher',
          action_name: topSubject ? `${topSubject} Teacher Follow-up` : 'Subject Teacher Follow-up',
          action_type: 'Subject teacher follow-up',
          reason: analysis.suggested_staff_action,
          suggested_owner: topSubject ? `${topSubject} Teacher` : 'Subject Teacher',
          review_weeks: 2,
          priority: 'medium',
          icon_type: 'staff',
          evidence_type: 'behaviour',
          evidence_label: topSubject ? `${topSubjectEntry![1]} incident${topSubjectEntry![1] !== 1 ? 's' : ''} in ${topSubject}` : 'Behaviour pattern',
          owner_role: 'subject_teacher',
          evidence_items: topSubject
            ? [
                { label: 'Top subject', value: `${topSubject} — ${topSubjectEntry![1]} of ${behaviour.length} incidents`, severity: 'medium' as const },
                { label: 'Behaviour points', value: `${behaviour.reduce((s, b) => s + (b.behaviour_points || 0), 0)} total`, severity: 'medium' as const },
              ]
            : [{ label: 'Staff action needed', value: analysis.suggested_staff_action, severity: 'medium' as const }],
        });
      }
    }

    // ── Bereavement / grief support ──────────────────────────────────────────
    // Detected from key_reasons or signal_explanation containing grief keywords.
    // Adds a counselling referral recommendation as a distinct action from the pastoral meeting.
    const griefText = [...(analysis.key_reasons || []), analysis.signal_explanation || ''].join(' ');
    const hasGrief = /grief|bereave|bereavement|died|death|loss of/i.test(griefText);
    if (hasGrief && isNegative && !activeTypes.has('Bereavement support') && !activeTypes.has('Counselling referral')) {
      const griefEvidence = (analysis.key_reasons || [])
        .filter(r => /grief|bereave|died|death|loss|cry|personal circumstance/i.test(r))
        .map(r => ({ label: 'Grief indicator', value: r, severity: 'high' as const }));
      recs.push({
        id: 'rec_grief_counselling',
        action_name: 'Bereavement Support Plan',
        action_type: 'Bereavement support',
        reason: `${student.name} has experienced a significant bereavement. A formalised support plan is needed — form tutor check-ins should be structured, HOY should coordinate, and a referral to the school counsellor should be considered if the impact is prolonged beyond 4–6 weeks.`,
        suggested_owner: 'School Counsellor',
        review_weeks: 2,
        priority: 'high',
        icon_type: 'pastoral',
        evidence_type: 'analysis',
        owner_role: 'pastoral',
        evidence_items: griefEvidence.length > 0
          ? griefEvidence
          : [{ label: 'Signal', value: 'Grief / bereavement identified in pattern analysis', severity: 'high' as const }],
      });
    }

    // ── Careers ─────────────────────────────────────────────────────────────
    if (analysis.career_signposting && !activeTypes.has('Careers guidance meeting')) {
      recs.push({
        id: 'rec_careers', action_name: 'Careers Conversation', action_type: 'Careers guidance meeting',
        reason: analysis.career_signposting,
        suggested_owner: 'Careers Advisor',
        review_weeks: 3,
        priority: 'low',
        icon_type: 'careers',
        evidence_type: 'analysis',
        owner_role: undefined,
        evidence_items: [{ label: 'Career signal', value: analysis.career_signposting, severity: 'low' as const }],
      });
    }

    // Filter recs to only show those relevant to the current user's role.
    // DSL only sees DSL-owned recs; HOY sees HOY recs; etc.
    // Admin, SLT, and principal see everything.
    const roleOwnerMap: Record<string, string[]> = {
      dsl:          ['dsl'],
      sendco:       ['sendco'],
      head_of_year: ['hoy'],
      tutor:        ['form_tutor'],
      teacher:      ['subject_teacher'],
    };
    const allowedRoles = roleOwnerMap[profile?.role || ''];
    const filtered = allowedRoles
      ? recs.filter(r => !r.owner_role || allowedRoles.includes(r.owner_role))
      : recs;

    return filtered;
  }

  async function dismissRecommendation(recId: string, reason = 'not_needed') {
    setDismissedActions((prev) => new Set([...prev, recId]));
    if (demoMode && id) {
      addDemoDismissal(id, recId);
    } else if (!demoMode && profile?.school_id && id) {
      await supabase.from('recommendation_dismissals').insert({
        school_id: profile.school_id,
        student_id: id,
        recommendation_id: recId,
        reason,
        dismissed_by: profile.full_name || 'Staff',
        is_active: true,
      });
    }
  }

  async function undoDismissal(recId: string) {
    setDismissedActions((prev) => {
      const next = new Set(prev);
      next.delete(recId);
      return next;
    });
    setReviewLog(prev => prev.map(e => e.recId === recId ? { ...e, undone: true } : e));
    if (!demoMode && profile?.school_id && id) {
      await supabase
        .from('recommendation_dismissals')
        .update({ is_active: false })
        .eq('school_id', profile.school_id)
        .eq('student_id', id)
        .eq('recommendation_id', recId);
    }
  }

  async function handleEvidenceAction(
    action: 'reviewed' | 'create_action' | 'escalate' | 'dismiss',
    rec: RecommendedAction,
    dismissReason?: string,
  ) {
    const now = new Date().toISOString();
    const actor = profile?.full_name || 'Staff';
    const logAction: ReviewLogEntry['action'] =
      action === 'reviewed' ? 'reviewed'
      : action === 'create_action' ? 'actioned'
      : action === 'escalate' ? 'escalated'
      : 'dismissed';

    if (action === 'reviewed') {
      await dismissRecommendation(rec.id, 'reviewed');
      setActivityFeed(prev => [{
        id: `evidence_reviewed_${rec.id}_${Date.now()}`,
        timestamp: now,
        text: `${rec.action_name} reviewed by ${actor} — no further action required`,
      }, ...prev]);
      setReviewLog(prev => [{
        id: `log_${Date.now()}`, recId: rec.id, recName: rec.action_name,
        action: 'reviewed', owner: actor, timestamp: now, undone: false,
      }, ...prev]);
      updateSignalStatus('dismissed');
      addToast(`${rec.action_name} marked as reviewed.`, 'success', () => undoDismissal(rec.id));
    } else if (action === 'create_action') {
      setEvidenceModal(null);
      setActionPathModal(rec);
      return;
    } else if (action === 'escalate') {
      const escalatedRec = { ...rec, priority: 'urgent' as const, action_type: 'Safeguarding referral' };
      await dismissRecommendation(rec.id, 'escalated');
      setReviewLog(prev => [{
        id: `log_${Date.now()}`, recId: rec.id, recName: rec.action_name,
        action: 'escalated', owner: actor, timestamp: now, undone: false,
      }, ...prev]);
      updateSignalStatus('escalated');
      openAssignModal(escalatedRec);
    } else if (action === 'dismiss') {
      await dismissRecommendation(rec.id, dismissReason || 'not_needed');
      setActivityFeed(prev => [{
        id: `evidence_dismissed_${rec.id}_${Date.now()}`,
        timestamp: now,
        text: `${rec.action_name} dismissed — ${dismissReason || 'not needed'}`,
      }, ...prev]);
      setReviewLog(prev => [{
        id: `log_${Date.now()}`, recId: rec.id, recName: rec.action_name,
        action: 'dismissed', reason: dismissReason, owner: actor, timestamp: now, undone: false,
      }, ...prev]);
      updateSignalStatus('dismissed');
      addToast(`Recommendation dismissed.`, 'success', () => undoDismissal(rec.id));
    }

    setEvidenceModal(null);
  }

  function getRecommendedNextStep(): { action: string; reason: string; previous?: string; outcome?: string } | null {
    const completed = [...interventions.filter((i) => i.status === 'completed')]
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    if (completed.length === 0) return null;

    const latest = completed[0];
    const status = latest.outcome_status ||
      (latest.review_student_improved === 'improved' ? 'improving' :
       latest.review_student_improved === 'worsened' ? 'escalating' : 'no_change');

    if (status === 'escalating') {
      const next = ESCALATION_MAP[latest.action_type] || 'Escalation — involve senior leadership';
      return { action: next, reason: 'Situation is worsening despite intervention. Immediate escalation recommended.', previous: latest.action_type, outcome: 'Escalating' };
    }
    if (status === 'no_change') {
      const next = ESCALATION_MAP[latest.action_type] || 'Review with Head of Year';
      return { action: next, reason: `${latest.action_type} completed with no measurable change. A different approach is recommended.`, previous: latest.action_type, outcome: 'No Change' };
    }
    if (['improving', 'resolved', 'sustained'].includes(status)) {
      return { action: 'Monitoring check-in', reason: 'Previous intervention was effective. Continue to monitor and sustain progress made.', previous: latest.action_type, outcome: 'Improving' };
    }
    return null;
  }

  function computeImpactOutcome(
    actionTaken: boolean,
    studentImproved: 'improved' | 'no_change' | 'worsened',
    i: Intervention,
    currentAttendance?: number,
    currentBehaviour?: number,
  ): Intervention['outcome_status'] {
    if (!actionTaken) {
      const attendanceDrop = i.baseline_attendance && currentAttendance && currentAttendance < i.baseline_attendance - 3;
      const behaviourRise = i.baseline_behaviour && currentBehaviour && currentBehaviour > i.baseline_behaviour + 5;
      return (attendanceDrop || behaviourRise) ? 'escalating' : 'no_change';
    }
    if (studentImproved === 'improved') {
      const attendanceOk = !i.baseline_attendance || !currentAttendance || currentAttendance >= i.baseline_attendance;
      const behaviourOk = !i.baseline_behaviour || !currentBehaviour || currentBehaviour <= i.baseline_behaviour;
      return (attendanceOk && behaviourOk) ? 'resolved' : 'improving';
    }
    if (studentImproved === 'worsened') return 'escalating';
    return 'no_change';
  }

  function updateSignalStatus(status: import('../lib/data').SignalStatus) {
    if (!id) return;
    if (demoMode) setDemoSignalStatus(id, status);
    setSignalStatusState(status);
  }

  function openAssignModal(rec?: RecommendedAction) {
    setAssignModal({ action_type: rec?.action_type || '', reason: rec?.reason || '', suggested_owner: rec?.suggested_owner || '', priority: rec?.priority || 'medium', review_weeks: rec?.review_weeks || 2, rec_id: rec?.id });
    setAssignForm({
      action_type: rec?.action_type || '',
      assigned_to: mapOwnerToStaffName(rec?.suggested_owner || '', student?.year_group),
      priority: rec?.priority || 'medium',
      due_date: addWeeks(1),
      review_date: addWeeks(rec?.review_weeks || 2),
      notes: rec?.reason || '',
    });
  }

  async function handleActionPathChoice(rec: RecommendedAction, path: 'self' | 'assign') {
    const now = new Date().toISOString();
    const actor = profile?.full_name || 'Staff';
    await dismissRecommendation(rec.id, 'actioned');
    setReviewLog(prev => [{
      id: `log_${Date.now()}`, recId: rec.id, recName: rec.action_name,
      action: 'actioned', owner: actor, timestamp: now, undone: false,
    }, ...prev]);
    setActionPathModal(null);
    if (path === 'assign') {
      openAssignModal(rec);
    } else {
      // Create intervention assigned to current user in in_progress, then open complete modal
      const currentUser = actor;
      const newItem: Intervention = {
        id: generateId(), student_id: id!,
        assigned_to: currentUser,
        created_by: actor,
        action_type: rec.action_type, priority: rec.priority,
        status: 'in_progress', due_date: addWeeks(1),
        review_date: addWeeks(rec.review_weeks || 2), notes: null, outcome: null,
        reason: rec.reason || null, suggested_owner: rec.suggested_owner || null,
        baseline_attendance: student?.attendance_pct, baseline_behaviour: student?.behaviour_score,
        created_at: now,
      };
      if (!demoMode && profile?.school_id) {
        const { data, error } = await supabase.from('interventions').insert({
          school_id: profile.school_id, student_id: id,
          assigned_to: currentUser, created_by: actor,
          action_type: rec.action_type, priority: rec.priority,
          status: 'in_progress', due_date: addWeeks(1),
          review_date: addWeeks(rec.review_weeks || 2), notes: null,
          reason: rec.reason || null, suggested_owner: rec.suggested_owner || null,
          baseline_attendance: student?.attendance_pct, baseline_behaviour: student?.behaviour_score,
        }).select().single();
        if (!error && data) newItem.id = (data as Intervention).id;
      }
      if (demoMode) addDemoIntervention(newItem);
      setInterventions(prev => [newItem, ...prev]);
      setActivityFeed(prev => [{
        id: newItem.id + '_self',
        timestamp: now,
        text: `${rec.action_type} — actioned by ${currentUser}`,
      }, ...prev]);
      setCompleteModal(newItem);
      setCompleteForm({ outcomeText: '', outcomeAchieved: 'achieved', outcomeCategory: '', nextStep: '', overrideReason: '', showOverride: false });
      updateSignalStatus('action_in_progress');
    }
  }

  async function submitAssign() {
    if (!id) return;
    const newItem: Intervention = {
      id: generateId(), student_id: id,
      assigned_to: assignForm.assigned_to || profile?.full_name || 'Staff',
      created_by: profile?.full_name || 'Staff',
      action_type: assignForm.action_type, priority: assignForm.priority,
      status: 'assigned', due_date: assignForm.due_date || null,
      review_date: assignForm.review_date || null,
      notes: assignForm.notes || null, outcome: null,
      reason: assignModal?.reason || null,
      suggested_owner: assignModal?.suggested_owner || null,
      baseline_attendance: student?.attendance_pct,
      baseline_behaviour: student?.behaviour_score,
      created_at: new Date().toISOString(),
    };

    if (!demoMode && profile?.school_id) {
      const { data, error } = await supabase.from('interventions').insert({
        school_id: profile.school_id, student_id: id,
        assigned_to: assignForm.assigned_to || profile?.full_name,
        created_by: profile?.full_name || 'Staff',
        action_type: assignForm.action_type, priority: assignForm.priority,
        status: 'assigned', due_date: assignForm.due_date || null,
        review_date: assignForm.review_date || null,
        notes: assignForm.notes || null,
        reason: assignModal?.reason || null,
        suggested_owner: assignModal?.suggested_owner || null,
        baseline_attendance: student?.attendance_pct,
        baseline_behaviour: student?.behaviour_score,
      }).select().single();
      if (!error && data) newItem.id = (data as Intervention).id;
    }

    if (demoMode) {
      addDemoIntervention(newItem);
    }

    setInterventions((prev) => [newItem, ...prev]);
    setLastCreated(newItem);
    setActivityFeed((prev) => [{
      id: newItem.id + '_assigned',
      timestamp: newItem.created_at,
      text: `Action assigned: ${newItem.action_type} → ${newItem.assigned_to}`,
    }, ...prev]);
    // Dismiss the recommendation that triggered this assign so it leaves the list immediately
    if (assignModal?.rec_id) {
      dismissRecommendation(assignModal.rec_id);
    }
    setAssignModal(null);
    updateSignalStatus('action_in_progress');
    addToast('Action assigned and added to interventions.');
  }

  async function submitReview() {
    if (!reviewModal || reviewForm.action_taken === null || reviewForm.student_improved === null) return;
    const currentAtt = reviewForm.current_attendance ? parseFloat(reviewForm.current_attendance) : (student?.attendance_pct);
    const currentBeh = reviewForm.current_behaviour ? parseInt(reviewForm.current_behaviour) : (student?.behaviour_score);
    const outcomeStatus = computeImpactOutcome(reviewForm.action_taken, reviewForm.student_improved, reviewModal, currentAtt, currentBeh);

    const updates: Partial<Intervention> = {
      status: 'completed', outcome: reviewForm.notes || 'Review completed.',
      outcome_status: outcomeStatus,
      review_completed: true,
      review_action_taken: reviewForm.action_taken,
      review_student_improved: reviewForm.student_improved,
      review_notes: reviewForm.notes || null,
      current_attendance: currentAtt || null,
      current_behaviour: currentBeh || null,
    };

    setInterventions((prev) => prev.map((i) => i.id === reviewModal.id ? { ...i, ...updates } : i));
    if (demoMode) {
      updateDemoIntervention(reviewModal.id, updates);
    } else if (profile?.school_id) {
      await supabase.from('interventions').update(updates).eq('id', reviewModal.id);
    }
    setActivityFeed((prev) => [{
      id: reviewModal.id + '_review' + Date.now(),
      timestamp: new Date().toISOString(),
      text: `Review completed: ${reviewModal.action_type} — ${reviewForm.student_improved}, outcome: ${outcomeStatus}`,
    }, ...prev]);
    setReviewModal(null);
    setReviewForm({ action_taken: null, student_improved: null, notes: '', current_attendance: '', current_behaviour: '' });
    addToast('Review saved. Impact calculated.');
  }

  async function updateStatus(interventionId: string, status: Intervention['status']) {
    const prev = interventions.find(i => i.id === interventionId);
    if (demoMode) {
      updateDemoIntervention(interventionId, { status });
      // When accepting a suggested action, mark signal as actioned so student leaves Signal Queue
      if (prev && status === 'open' && prev.status === 'suggested' && student) {
        setDemoSignalStatus(student.id, 'action_in_progress');
      }
    } else if (profile?.school_id) {
      await supabase.from('interventions').update({ status }).eq('id', interventionId);
    }
    setInterventions((prev) => prev.map((i) => (i.id === interventionId ? { ...i, status } : i)));
    setActivityFeed((prev) => [{
      id: interventionId + '_' + status + Date.now(),
      timestamp: new Date().toISOString(),
      text: `Action marked ${STATUS_CONFIG[status]?.label || status}`,
    }, ...prev]);
    addToast('Action updated.');
  }

  async function reassignIntervention(intervention: Intervention, newAssignee: string) {
    const updates: Partial<Intervention> = { assigned_to: newAssignee, status: 'assigned' };
    if (demoMode) updateDemoIntervention(intervention.id, updates);
    else if (profile?.school_id) await supabase.from('interventions').update(updates).eq('id', intervention.id);
    setInterventions(prev => prev.map(i => i.id === intervention.id ? { ...i, ...updates } : i));
    setActivityFeed(prev => [{
      id: 'reassign_' + Date.now(),
      timestamp: new Date().toISOString(),
      text: `Reassigned to ${newAssignee} by ${profile?.full_name || 'staff'}`,
    }, ...prev]);
    setReassignTarget(null);
    setReassignTo('');
    addToast(`Reassigned to ${newAssignee}.`);
  }

  function undoCompletion(intervention: Intervention) {
    const prevStatus = (intervention.prev_status as Intervention['status']) || 'in_progress';
    const updates: Partial<Intervention> = {
      status: prevStatus,
      outcome: null,
      outcome_achieved: null,
      outcome_notes: null,
      completed_by: null,
      completed_at: null,
    };
    if (demoMode) updateDemoIntervention(intervention.id, updates);
    setInterventions(prev => prev.map(i => i.id === intervention.id ? { ...i, ...updates } : i));
    setActivityFeed(prev => [{
      id: intervention.id + '_undo' + Date.now(),
      timestamp: new Date().toISOString(),
      text: `Completion undone — returned to ${prevStatus.replace(/_/g, ' ')}`,
    }, ...prev]);
    addToast(`Completion undone — action returned to ${prevStatus.replace(/_/g, ' ')}.`);
  }

  function completeIntervention() {
    if (!completeModal || !completeForm.outcomeText.trim() || !completeForm.outcomeCategory || !completeForm.nextStep) return;
    if (completeForm.showOverride && !completeForm.overrideReason.trim()) return;
    const now = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
    const currentUser = (profile as any)?.full_name || 'Demo User';
    const categoryToAchieved: Record<string, 'achieved' | 'partially' | 'not_achieved'> = {
      'Significant Improvement': 'achieved',
      'Some Improvement': 'achieved',
      'Resolved': 'achieved',
      'No Change': 'not_achieved',
      'Deteriorated': 'not_achieved',
      'Escalation Required': 'not_achieved',
    };
    const outcomeAchieved = categoryToAchieved[completeForm.outcomeCategory] || completeForm.outcomeAchieved;
    const isEscalate = completeForm.nextStep === 'escalate';
    // When escalating, keep status as 'awaiting_review' until the escalation modal fills in the details
    const finalStatus: Intervention['status'] = isEscalate ? 'awaiting_review' : 'completed';
    const outcomeDisplay = `${completeForm.outcomeCategory}${completeForm.overrideReason ? ' (overridden)' : ''}`;
    const updates: Partial<Intervention> = {
      status: finalStatus,
      outcome: completeForm.outcomeText,
      outcome_achieved: outcomeAchieved,
      outcome_notes: completeForm.outcomeCategory,
      next_step: completeForm.nextStep,
      outcome_status: completeForm.outcomeCategory === 'Resolved' || completeForm.outcomeCategory === 'Significant Improvement' ? 'resolved'
        : completeForm.outcomeCategory === 'Some Improvement' ? 'improving'
        : completeForm.outcomeCategory === 'Deteriorated' || completeForm.outcomeCategory === 'Escalation Required' ? 'escalating'
        : 'no_change',
      completed_by: currentUser,
      completed_at: now,
      prev_status: completeModal.status,
      after_attendance: student?.attendance_pct ?? null,
      after_behaviour: student?.behaviour_score ?? null,
    };
    // Update local state first (synchronous) before updateDemoIntervention fires listeners
    // and the subscriber's async re-fetch can overwrite with potentially stale data.
    const savedModal = { ...completeModal };
    setInterventions(prev => prev.map(i => i.id === savedModal.id ? { ...i, ...updates } : i));
    if (demoMode) {
      updateDemoIntervention(completeModal.id, updates);
    } else if (profile?.school_id) {
      supabase.from('interventions').update(updates).eq('id', completeModal.id);
    }
    setActivityFeed(prev => [{
      id: savedModal.id + '_done' + Date.now(),
      timestamp: new Date().toISOString(),
      text: `Action completed — ${outcomeDisplay}. Next step: ${completeForm.nextStep.replace(/_/g, ' ')}. Notes: ${completeForm.outcomeText.slice(0, 100)}`,
    }, ...prev]);
    const savedForm = { ...completeForm };
    setCompleteModal(null);
    setCompleteForm({ outcomeText: '', outcomeAchieved: 'achieved', outcomeCategory: '', nextStep: '', overrideReason: '', showOverride: false });
    if (isEscalate) {
      // Open escalation modal with smart suggestion pre-filled
      openEscalationModal({ ...savedModal, ...updates });
      return;
    }

    // Check if there are remaining active interventions for this student AFTER this completion
    const updatedInterventions = interventions.map(i => i.id === savedModal.id ? { ...i, ...updates } : i);
    const remainingActive = updatedInterventions.filter(i =>
      !['completed', 'closed', 'cancelled', 'suggested'].includes(i.status)
    );
    const allDone = remainingActive.length === 0;

    if (allDone && (savedForm.nextStep === 'close' || savedForm.outcomeCategory === 'Resolved' || savedForm.outcomeCategory === 'Significant Improvement')) {
      updateSignalStatus('resolved');
    } else if (!allDone) {
      // Other interventions still active — don't resolve the signal, just note this one is done
      updateSignalStatus('action_in_progress');
    } else {
      updateSignalStatus('review_due');
    }

    // "Continue support" / "Keep monitoring" → auto-create a follow-up review action
    if (savedForm.nextStep === 'continue' || savedForm.nextStep === 'followup') {
      const followUpDays = savedForm.nextStep === 'continue' ? 14 : 7;
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + followUpDays);
      const followUpDue = followUpDate.toISOString().slice(0, 10);
      const currentUser = (profile as any)?.full_name || 'Staff';
      const followUp: Intervention = {
        id: generateId(),
        student_id: id!,
        assigned_to: currentUser,
        created_by: currentUser,
        action_type: `Review: ${savedModal.action_type}`,
        priority: savedModal.priority || 'medium',
        status: 'open',
        due_date: followUpDue,
        review_date: followUpDue,
        notes: `Auto-created follow-up. Previous outcome: ${savedForm.outcomeCategory}. ${savedForm.outcomeText.slice(0, 100)}`,
        outcome: null,
        reason: `Follow-up scheduled after completing "${savedModal.action_type}"`,
        suggested_owner: savedModal.suggested_owner || null,
        created_at: new Date().toISOString(),
      };
      if (demoMode) addDemoIntervention(followUp);
      else if (profile?.school_id) {
        supabase.from('interventions').insert({ ...followUp, school_id: profile.school_id });
      }
      setInterventions(prev => [followUp, ...prev]);
      setActivityFeed(prev => [{
        id: followUp.id + '_followup',
        timestamp: new Date().toISOString(),
        text: `Follow-up review scheduled for ${followUpDue} — auto-created after completing "${savedModal.action_type}"`,
      }, ...prev]);
      addToast(`Follow-up review created for ${followUpDue}.`, 'success');
      return;
    }
    addToast('Action completed. Undo?', 'success', () => {
      setInterventions(cur => cur.map(i => i.id === savedModal.id ? { ...savedModal } : i));
      if (demoMode) updateDemoIntervention(savedModal.id, savedModal);
      setActivityFeed(prev => [{
        id: savedModal.id + '_undo' + Date.now(),
        timestamp: new Date().toISOString(),
        text: `Completion undone — returned to ${savedModal.status.replace(/_/g, ' ')}`,
      }, ...prev]);
      addToast('Completion undone.');
    });
  }

  function openEscalationModal(intervention: Intervention) {
    const yearGroup = student?.year_group || '';
    const hasSend = !!student?.send_status;
    const att = student?.attendance_pct ?? 100;
    const beh = student?.behaviour_score ?? 0;
    const isSafeguarding = intervention.action_type === 'Safeguarding referral' ||
      intervention.reason?.toLowerCase().includes('safeguard') ||
      intervention.notes?.toLowerCase().includes('safeguard');

    const currentRole = profile?.role || '';

    let target = 'Head of Year';
    let staffName = HOY_BY_YEAR[yearGroup] || 'Ms Harris (HOY Y10)';
    let reason = `${yearGroup} student — escalating to their Head of Year for pastoral oversight.`;
    let priority: 'high' | 'urgent' = 'high';

    // Escalation chain: Tutor → HOY → DSL → SLT
    // SENDCO: SEND cases → DSL (for safeguarding/serious) or SLT (for additional resource)
    if (isSafeguarding) {
      if (currentRole === 'dsl') {
        target = 'SLT';
        staffName = 'Mr Lee (SLT)';
        reason = 'Safeguarding concern requires SLT oversight and possible external referral.';
        priority = 'urgent';
      } else {
        target = 'DSL';
        staffName = 'Mr Ahmed (DSL)';
        reason = 'Safeguarding concern identified — must be reviewed by the DSL. Log in CPOMS after this escalation.';
        priority = 'urgent';
      }
    } else if (hasSend && currentRole === 'sendco') {
      // SENDCo escalates upward to DSL or SLT, never back to SENDCo
      if (att < 80 || beh > 30) {
        target = 'DSL';
        staffName = 'Mr Ahmed (DSL)';
        reason = `SEND student with ${att < 80 ? 'persistent absence' : 'severe behaviour'} — DSL welfare review required.`;
        priority = 'urgent';
      } else {
        target = 'SLT';
        staffName = 'Mr Lee (SLT)';
        reason = `SEND case requires additional resource or specialist referral beyond current provision.`;
      }
    } else if (hasSend && intervention.action_type.toLowerCase().includes('send') && currentRole !== 'sendco') {
      target = 'SENDCo';
      staffName = 'Ms Jones (SENDCo)';
      reason = `SEND student (${student?.send_status}) — SENDCo oversight required for provision review.`;
    } else if (att < 80) {
      target = 'Attendance Officer';
      staffName = 'Ms Williams (Attend)';
      reason = `Attendance has fallen to ${att}% — attendance case management required.`;
    } else if (beh > 30) {
      target = 'SLT';
      staffName = 'Mr Lee (SLT)';
      reason = `Behaviour score ${beh} — SLT involvement required given severity.`;
      priority = 'urgent';
    } else if (currentRole === 'tutor') {
      // Tutor escalates to HOY
      target = 'Head of Year';
      staffName = HOY_BY_YEAR[yearGroup] || 'Ms Harris (HOY Y10)';
      reason = 'Concern not resolved at tutor level — escalating to Head of Year.';
    } else if (currentRole === 'head_of_year') {
      // HOY escalates to DSL
      target = 'DSL';
      staffName = 'Mr Ahmed (DSL)';
      reason = 'Pastoral concern not resolved at HOY level — DSL review required.';
    }

    const addWeeks2 = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n * 7);
      return d.toISOString().slice(0, 10);
    };

    setEscalationSuggestion({ target, staffName, reason });
    setEscalationModal(intervention);
    setEscalationForm({
      escalateTo: target,
      reason: isSafeguarding ? 'Safeguarding concern'
        : att < 80 ? 'Attendance collapse'
        : beh > 30 ? 'Worsening behaviour'
        : hasSend ? 'SEND concern'
        : 'No improvement',
      priority,
      notes: '',
      reviewDate: addWeeks2(1),
    });
  }

  function submitEscalation() {
    if (!escalationModal || !escalationForm.escalateTo || !escalationForm.reason || !escalationForm.notes.trim() || !escalationForm.reviewDate) return;
    const now = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
    const currentUser = (profile as any)?.full_name || 'Demo User';
    const updates: Partial<Intervention> = {
      status: 'escalated',
      priority: escalationForm.priority,
      assigned_to: escalationSuggestion?.staffName || escalationForm.escalateTo,
      review_date: escalationForm.reviewDate,
      escalated_to: escalationForm.escalateTo,
      escalation_reason: escalationForm.reason,
      escalated_by: currentUser,
      escalated_at: now,
      escalation_notes: escalationForm.notes,
      prev_status: escalationModal.status,
    };
    if (demoMode) {
      updateDemoIntervention(escalationModal.id, updates);
    } else if (profile?.school_id) {
      supabase.from('interventions').update(updates).eq('id', escalationModal.id);
    }
    setInterventions(prev => prev.map(i => i.id === escalationModal.id ? { ...i, ...updates } : i));
    setActivityFeed(prev => [{
      id: escalationModal.id + '_escalated' + Date.now(),
      timestamp: new Date().toISOString(),
      text: `Escalated to ${escalationForm.escalateTo} — ${escalationForm.reason}`,
    }, ...prev]);
    const undoIntervention = { ...escalationModal };
    setEscalationModal(null);
    updateSignalStatus('escalated');
    // Notify the escalation target
    if (demoMode && escalationSuggestion?.staffName) {
      pushLiveNotification({
        id: `esc-${escalationModal.id}-${Date.now()}`,
        type: 'new_escalation',
        title: `Action escalated to you: ${escalationModal.action_type}`,
        body: `${student?.name} — escalated by ${currentUser}. Reason: ${escalationForm.reason}.`,
        required_action: 'Review the escalated action and decide next steps.',
        student_id: escalationModal.student_id,
        link_path: `/students/${escalationModal.student_id}?tab=actions&highlight=${escalationModal.id}`,
        is_read: false,
        urgent: escalationForm.priority === 'urgent',
        created_at: new Date().toISOString(),
        target_user: escalationSuggestion.staffName,
      });
    }
    addToast(`Escalated to ${escalationForm.escalateTo}. Undo?`, 'success', () => {
      if (demoMode) updateDemoIntervention(undoIntervention.id, undoIntervention);
      else if (profile?.school_id) supabase.from('interventions').update(undoIntervention).eq('id', undoIntervention.id);
      setInterventions(cur => cur.map(i => i.id === undoIntervention.id ? { ...undoIntervention } : i));
      updateSignalStatus('action_in_progress');
      addToast('Escalation undone.');
    });
  }

  // One-click external referral log — no form, just records the event on the timeline
  function logExternalReferral(agency: string) {
    if (!escalationModal) return;
    const currentUser = (profile as any)?.full_name || 'Demo User';
    const agencyShort = agency.replace('External Agency (', '').replace(')', '');
    const today = new Date().toISOString().slice(0, 10);

    // Chronology entry
    if (demoMode) {
      addDemoBehaviourRecord({
        id: 'extref_' + Date.now(),
        student_id: id!,
        date: today,
        incident_type: `External referral — ${agencyShort}`,
        behaviour_points: 0,
        lesson_period: null,
        subject: null,
        staff_member: currentUser,
        comment: `Referral to ${agencyShort} logged by ${currentUser}.`,
        safeguarding_note: `External referral made to ${agencyShort}.`,
      } as BehaviourRecord);
    }

    // Standalone completed intervention so it's visible on the Actions tab and timeline
    const refRecord: Intervention = {
      id: generateId(),
      student_id: id!,
      assigned_to: currentUser,
      created_by: currentUser,
      action_type: `External referral — ${agencyShort}`,
      priority: 'urgent',
      status: 'completed',
      due_date: today,
      review_date: addWeeks(2),
      notes: `Referral to ${agencyShort} made on ${today}.`,
      outcome: `Referred to ${agencyShort}`,
      reason: `DSL external referral to ${agencyShort}`,
      suggested_owner: null,
      created_at: new Date().toISOString(),
    };
    if (demoMode) addDemoIntervention(refRecord);
    else if (profile?.school_id) {
      supabase.from('interventions').insert({ ...refRecord, school_id: profile.school_id });
    }
    setInterventions(prev => [refRecord, ...prev]);
    setActivityFeed(prev => [{
      id: 'extref_act_' + Date.now(),
      timestamp: new Date().toISOString(),
      text: `External referral logged — ${agencyShort} by ${currentUser}`,
    }, ...prev]);

    updateSignalStatus('escalated');
    setEscalationModal(null);

    const REMINDERS: Record<string, string> = {
      'Police':      'Police referral logged. Record the crime/incident reference in CPOMS.',
      'MASH':        'MASH referral logged. Document the MASH reference number in CPOMS.',
      'Social Care': 'Social Care referral logged. Record the case reference in CPOMS.',
      'CAMHS':       'CAMHS referral logged. Record the referral acknowledgement in CPOMS.',
    };
    const reminder = Object.entries(REMINDERS).find(([k]) => agency.includes(k))?.[1]
      ?? `${agencyShort} referral logged.`;
    addToast(reminder, 'success');
  }

  function undoEscalation(intervention: Intervention) {
    const prevStatus = (intervention.prev_status as Intervention['status']) || 'in_progress';
    const updates: Partial<Intervention> = {
      status: prevStatus,
      escalated_to: null,
      escalation_reason: null,
      escalated_by: null,
      escalated_at: null,
      escalation_notes: null,
      prev_status: null,
    };
    if (demoMode) {
      updateDemoIntervention(intervention.id, updates);
    } else if (profile?.school_id) {
      supabase.from('interventions').update(updates).eq('id', intervention.id);
    }
    setInterventions(prev => prev.map(i => i.id === intervention.id ? { ...i, ...updates } : i));
    setActivityFeed(prev => [{
      id: intervention.id + '_escalundo' + Date.now(),
      timestamp: new Date().toISOString(),
      text: `Escalation undone — returned to ${prevStatus.replace(/_/g, ' ')}`,
    }, ...prev]);
    updateSignalStatus('action_in_progress');
    addToast('Escalation undone — action returned to previous state.', 'success');
  }

  async function addOutcome(interventionId: string, outcome: string) {
    const updates = { outcome, status: 'completed' as Intervention['status'] };
    if (demoMode) {
      updateDemoIntervention(interventionId, updates);
    } else if (profile?.school_id) {
      await supabase.from('interventions').update(updates).eq('id', interventionId);
    }
    setInterventions((prev) => prev.map((i) => (i.id === interventionId ? { ...i, ...updates } : i)));
    setActivityFeed((prev) => [{
      id: interventionId + '_outcome' + Date.now(),
      timestamp: new Date().toISOString(),
      text: `Outcome recorded: ${outcome.slice(0, 80)}${outcome.length > 80 ? '...' : ''}`,
    }, ...prev]);
    setOutcomeModal(null);
    setOutcomeText('');
    addToast('Outcome added and action marked complete.');
  }

  async function saveCareer() {
    if (!profile?.school_id || !id || !career) return;
    const payload = {
      school_id: profile.school_id, student_id: id,
      career_interests: careerForm.career_interests || [],
      preferred_subjects: careerForm.preferred_subjects || [],
      strengths: careerForm.strengths || null, barriers: careerForm.barriers || null,
      confidence_level: careerForm.confidence_level || null,
      destination_risk: careerForm.destination_risk || null,
      suggested_pathways: careerForm.suggested_pathways || [],
      useful_signposting: careerForm.useful_signposting || [],
    };
    const { data, error } = await supabase.from('career_profiles').upsert(payload).select().single();
    if (!error && data) { setCareer(data as CareerProfile); setEditingCareer(false); triggerReanalysis(effectiveSchoolId); }
  }

  const totalPoints = behaviour.reduce((sum, r) => sum + (r.behaviour_points || 0), 0);
  const incidentCount = behaviour.length;
  const subjectCounts = new Map<string, number>();
  behaviour.forEach((b) => { if (b.subject) subjectCounts.set(b.subject, (subjectCounts.get(b.subject) || 0) + 1); });
  const topSubjects = Array.from(subjectCounts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 3);

  const activeInterventions = interventions.filter((i) => !['completed', 'closed', 'cancelled'].includes(i.status));
  const completedInterventions = interventions.filter((i) => ['completed', 'closed'].includes(i.status));
  const reviewDueList = activeInterventions.filter(isReviewDue);
  const allRecs = buildRecommendedActions();
  const recommendedActions = allRecs.filter(r => !dismissedActions.has(r.id));
  const dismissedRecActions = allRecs.filter(r => dismissedActions.has(r.id));
  const nextStep = getRecommendedNextStep();
  const neetRisk = computeNeetRisk(student, analysis, behaviour, interventions, career);

  const timeline: TimelineEvent[] = [
    ...(analysis ? [{
      date: interventions[0]?.created_at || new Date().toISOString(),
      type: 'signal' as TimelineEvent['type'],
      title: `Signal generated: ${analysis.signal_category || analysis.risk_level}`,
      description: analysis.key_reasons?.[0] || 'Analysis completed',
      severity: (analysis.risk_level === 'red' ? 'high' : analysis.risk_level === 'amber' ? 'medium' : 'low') as TimelineEvent['severity'],
      category: 'Signal',
    }] : []),
    ...interventions.map((i) => ({
      date: i.created_at,
      type: 'intervention' as TimelineEvent['type'],
      title: `${i.action_type} — ${STATUS_CONFIG[i.status]?.label || i.status}`,
      description: i.notes || `Assigned to ${i.assigned_to}`,
      severity: (i.priority === 'urgent' ? 'high' : i.priority === 'high' ? 'medium' : 'low') as TimelineEvent['severity'],
      category: 'Action',
      staff: i.created_by || i.assigned_to,
    })),
    ...interventions.filter((i) => i.review_completed).map((i) => ({
      date: i.review_date || i.created_at,
      type: 'review' as TimelineEvent['type'],
      title: `Review completed: ${i.action_type}`,
      description: i.review_notes || `Outcome: ${i.outcome_status || 'recorded'}`,
      severity: (i.outcome_status === 'escalating' ? 'high' : i.outcome_status === 'no_change' ? 'medium' : 'low') as TimelineEvent['severity'],
      category: 'Review',
    })),
    ...interventions.filter((i) => i.status === 'completed' && i.outcome).map((i) => ({
      date: i.due_date || i.created_at,
      type: 'outcome' as TimelineEvent['type'],
      title: `Outcome: ${i.action_type}`,
      description: i.outcome || '',
      severity: 'low' as TimelineEvent['severity'],
      category: 'Outcome',
    })),
    ...behaviour.map((b) => ({
      date: b.date,
      type: 'behaviour' as TimelineEvent['type'],
      title: `${b.incident_type}${b.subject ? ` — ${b.subject}` : ''}`,
      description: b.comment || `${b.behaviour_points} behaviour points`,
      severity: (b.behaviour_points >= 10 ? 'high' : b.behaviour_points >= 5 ? 'medium' : 'low') as TimelineEvent['severity'],
      category: 'Behaviour',
      staff: b.staff_member || undefined,
    })),
    ...communications.map((c) => ({
      date: c.date,
      type: 'communication' as TimelineEvent['type'],
      title: `${c.source === 'phone' ? 'Phone call' : c.source === 'email' ? 'Email' : c.source === 'meeting' ? 'Meeting' : c.source === 'external_agency' ? 'External agency' : c.source === 'pastoral_conversation' ? 'Pastoral conversation' : 'Letter'} — ${c.staff_member}`,
      description: c.summary,
      severity: (c.priority === 'urgent' ? 'high' : c.priority === 'high' ? 'medium' : 'low') as TimelineEvent['severity'],
      category: 'Communication',
      staff: c.staff_member,
      meta: c.follow_up_required ? 'Follow-up required' : undefined,
    })),
    ...quickNotes.map((n) => ({
      date: n.date,
      type: (n.category === 'Safeguarding review prompt' ? 'safeguarding' : n.category === 'Positive observation' ? 'success' : n.category === 'Career/destination concern' ? 'career' : n.category === 'SEND observation' ? 'send' : 'note') as TimelineEvent['type'],
      title: n.category,
      description: n.note,
      severity: (n.concern_level >= 4 ? 'high' : n.concern_level >= 3 ? 'medium' : 'low') as TimelineEvent['severity'],
      category: 'Note',
      staff: n.staff_member,
      meta: n.visibility && n.visibility !== 'general' ? n.visibility.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase()) : undefined,
    })),
    ...interventions.filter((i) => i.status === 'escalated' && i.escalated_at).map((i) => ({
      date: (i.escalated_at || i.created_at).slice(0, 10),
      type: 'escalation' as TimelineEvent['type'],
      title: `Escalated: ${i.action_type}`,
      description: i.escalation_reason || `Escalated to ${i.escalated_to}`,
      severity: 'high' as TimelineEvent['severity'],
      category: 'Escalation',
      staff: i.escalated_by || i.assigned_to,
    })),
    ...behaviour.filter((b) => b.safeguarding_note).map((b) => ({
      date: b.date,
      type: 'safeguarding' as TimelineEvent['type'],
      title: `Safeguarding note — ${b.incident_type}`,
      description: b.safeguarding_note || '',
      severity: 'high' as TimelineEvent['severity'],
      category: 'Safeguarding',
      staff: b.staff_member || undefined,
    })),
    ...activityFeed.filter((e) => e.text.toLowerCase().includes('neet') || e.text.toLowerCase().includes('destination')).map((e) => ({
      date: e.timestamp.slice(0, 10),
      type: 'neet' as TimelineEvent['type'],
      title: 'NEET risk update',
      description: e.text,
      severity: 'medium' as TimelineEvent['severity'],
      category: 'Careers',
    })),
    ...activityFeed
      .filter((e) => !e.text.toLowerCase().includes('neet') && !e.text.toLowerCase().includes('destination'))
      .map((e) => {
        const isReviewAction = e.id.startsWith('evidence_reviewed_') || e.id.startsWith('evidence_dismissed_');
        const recIdMatch = e.id.match(/^evidence_(?:reviewed|dismissed)_([^_]+(?:_[^_]+)*?)_\d+$/);
        const recId = recIdMatch ? recIdMatch[1] : undefined;
        return {
          date: e.timestamp.slice(0, 10),
          type: 'outcome' as TimelineEvent['type'],
          title: isReviewAction ? (e.id.startsWith('evidence_reviewed_') ? 'Recommendation reviewed' : 'Recommendation dismissed') : 'Outcome recorded',
          description: e.text,
          severity: 'low' as TimelineEvent['severity'],
          category: isReviewAction ? 'Actions' : 'Outcome',
          meta: recId,
        };
      }),
    ...successRecognitions.map((r) => ({
      date: r.completed_at.slice(0, 10),
      type: 'success' as TimelineEvent['type'],
      title: `Recognition: ${r.recognition_label}`,
      description: r.notes || `${r.recognition_type} completed`,
      severity: 'low' as TimelineEvent['severity'],
      category: 'Note',
      staff: r.completed_by,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const currentRole = profile?.role || '';
  const currentUserName = profile?.full_name || '';
  const userYearGroup = currentRole === 'head_of_year' ? getHOYYearGroup(currentUserName) : null;
  const userForm = currentRole === 'tutor' ? '10B' : null; // tutors are scoped to their form; real app would use profile field

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (!student) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-500">Student not found.</p>
        <button onClick={() => navigate(-1)} className="mt-4 text-teal-600 hover:text-teal-700 font-medium">Go back</button>
      </div>
    );
  }

  if (!isStudentInScope(currentRole, student, userYearGroup, userForm)) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center">
          <ShieldAlert className="w-8 h-8 text-slate-400" />
        </div>
        <h2 className="text-lg font-semibold text-slate-700">Access restricted</h2>
        <p className="text-sm text-slate-500 text-center max-w-xs">
          {student.name} is in {student.year_group}
          {userYearGroup ? ` — your remit covers ${userYearGroup} only` : ''}.
          Contact your DSL or headteacher if you believe this is incorrect.
        </p>
        <button onClick={() => navigate(-1)} className="mt-2 text-teal-600 hover:text-teal-700 font-medium text-sm">Go back</button>
      </div>
    );
  }

  const riskBadgeClass = student.risk_level === 'red' ? 'badge-red' : student.risk_level === 'amber' ? 'badge-amber' : 'badge-green';
  const avatarBgClass = student.risk_level === 'red' ? 'bg-red-500' : student.risk_level === 'amber' ? 'bg-amber-500' : 'bg-emerald-500';

  const REC_ICON = { pastoral: User, parent: Phone, staff: Briefcase, careers: GraduationCap };
  const REC_COLORS: Record<string, { bg: string; border: string; icon: string; badge: string }> = {
    pastoral: { bg: 'bg-red-50', border: 'border-red-200', icon: 'text-red-600 bg-red-100', badge: 'bg-red-100 text-red-700' },
    parent:   { bg: 'bg-amber-50', border: 'border-amber-200', icon: 'text-amber-600 bg-amber-100', badge: 'bg-amber-100 text-amber-700' },
    staff:    { bg: 'bg-blue-50', border: 'border-blue-200', icon: 'text-blue-600 bg-blue-100', badge: 'bg-blue-100 text-blue-700' },
    careers:  { bg: 'bg-emerald-50', border: 'border-emerald-200', icon: 'text-emerald-600 bg-emerald-100', badge: 'bg-emerald-100 text-emerald-700' },
  };

  function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.open;
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border ${cfg.classes}`}>{cfg.label}</span>;
  }

  function PriorityBadge({ priority }: { priority: string }) {
    const cls = priority === 'urgent' ? 'bg-red-100 text-red-700 border-red-200' : priority === 'high' ? 'bg-orange-100 text-orange-700 border-orange-200' : priority === 'medium' ? 'bg-blue-100 text-blue-700 border-blue-200' : 'bg-slate-100 text-slate-600 border-slate-200';
    return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border ${cls}`}>{priority}</span>;
  }

  // ─── Evidence / transparency micro-components ─────────────────────────────

  const SOURCE_CFG: Record<string, { label: string; color: string }> = {
    Attendance: { label: 'Attendance', color: 'bg-blue-50 text-blue-700 border-blue-200' },
    Behaviour: { label: 'Behaviour', color: 'bg-red-50 text-red-700 border-red-200' },
    'Teacher Notes': { label: 'Teacher Notes', color: 'bg-amber-50 text-amber-700 border-amber-200' },
    SEND: { label: 'SEND', color: 'bg-purple-50 text-purple-700 border-purple-200' },
    'Parent Contact': { label: 'Parent Contact', color: 'bg-teal-50 text-teal-700 border-teal-200' },
    'Intervention Outcomes': { label: 'Intervention Outcomes', color: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    Homework: { label: 'Homework', color: 'bg-sky-50 text-sky-700 border-sky-200' },
    Assessment: { label: 'Assessment', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  };

  function SourceBadge({ source }: { source: string }) {
    const cfg = SOURCE_CFG[source] || { label: source, color: 'bg-slate-100 text-slate-600 border-slate-200' };
    return (
      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${cfg.color}`}>{cfg.label}</span>
    );
  }

  function ConfidenceBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
    const cfg = {
      high: { label: 'High confidence', color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
      medium: { label: 'Medium confidence', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
      low: { label: 'Low confidence', color: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' },
    }[level];
    return (
      <span className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${cfg.color}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.label}
      </span>
    );
  }

  function EvidenceExpander({ title, evidence, sources }: { title: string; evidence: string[]; sources: string[] }) {
    const [open, setOpen] = useState(false);
    return (
      <div className="mt-2 border-t border-slate-100 pt-2">
        <button
          onClick={() => setOpen(!open)}
          className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 hover:text-teal-600 transition-colors"
        >
          <Eye className={`w-3 h-3 transition-transform ${open ? 'text-teal-500' : ''}`} />
          {open ? 'Hide' : 'Why was this generated?'}
          <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
        {open && (
          <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</div>
            <ul className="space-y-1">
              {evidence.map((e, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0" />
                  {e}
                </li>
              ))}
            </ul>
            {sources.length > 0 && (
              <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200">
                <span className="text-[10px] text-slate-400 font-medium mr-1">Sources:</span>
                {sources.map((s) => <SourceBadge key={s} source={s} />)}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toast toasts={toasts} onDismiss={dismissToast} />

      {/* Header */}
      <div className="card-premium p-6">
        <div className="flex items-start gap-4">
          <button onClick={() => navigate(-1)} className="mt-1 p-2 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-200">
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-4 flex-wrap">
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl shadow-sm ${avatarBgClass}`}>
                {(student.name || '').split(' ').filter(Boolean).map((n) => n[0]).join('')}
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{student.name}</h1>
                <div className="text-sm text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-slate-700">{student.year_group}</span>
                  <span className="text-slate-300">·</span>
                  <span>{student.form}</span>
                  {student.pupil_premium && <><span className="text-slate-300">·</span><span className="badge-purple">Pupil Premium</span></>}
                  {student.send_status && <><span className="text-slate-300">·</span><span className="badge-blue">{student.send_status}</span></>}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1">
                <span className={`${riskBadgeClass} text-sm px-4 py-1.5 uppercase tracking-wider font-bold`}>{student.risk_level} priority</span>
                {interventions.some(i => i.action_type === 'Safeguarding referral' && !['completed','closed','cancelled'].includes(i.status)) && (
                  <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-600 text-white uppercase tracking-wider">Escalated to DSL</span>
                )}
                <span className="text-xs text-slate-400 font-medium">{student.attendance_pct ?? 95}% attendance</span>
              </div>
            </div>
            {/* Live action summary strip */}
            <div className="flex items-center gap-2 flex-wrap mt-4 pt-4 border-t border-slate-100">
              {recommendedActions.length > 0 && (
                <button onClick={() => setActiveTab('actions')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-50 border border-red-200 text-red-700 text-xs font-semibold hover:bg-red-100 transition-colors">
                  <Target className="w-3 h-3" /> {recommendedActions.length} requires review
                </button>
              )}
              {reviewDueList.length > 0 && (
                <button onClick={() => setActiveTab('actions')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-orange-50 border border-orange-200 text-orange-700 text-xs font-semibold hover:bg-orange-100 transition-colors">
                  <Flag className="w-3 h-3" /> {reviewDueList.length} review due
                </button>
              )}
              {activeInterventions.length > 0 && (
                <button onClick={() => setActiveTab('actions')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-100 transition-colors">
                  <ClipboardList className="w-3 h-3" /> {activeInterventions.length} active action{activeInterventions.length !== 1 ? 's' : ''}
                </button>
              )}
              {completedInterventions.length > 0 && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium">
                  <CheckCircle className="w-3 h-3" /> {completedInterventions.length} completed
                </span>
              )}
              {reviewLog.filter(e => !e.undone).length > 0 && (
                <button onClick={() => setActiveTab('actions')} className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-100 transition-colors">
                  <RotateCcw className="w-3 h-3" /> {reviewLog.filter(e => !e.undone).length} logged
                </button>
              )}
              {recommendedActions.length === 0 && reviewDueList.length === 0 && activeInterventions.length === 0 && (
                <span className="text-xs text-slate-400">No pending actions</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Escalation alert — shown on all tabs when signal is escalated */}
      {signalStatus === 'escalated' && (() => {
        const escalatedInt = interventions.find(i => i.status === 'escalated');
        return (
          <div className="flex items-start gap-3 bg-red-50 border-2 border-red-300 rounded-2xl px-5 py-4">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5 shrink-0 animate-pulse" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold text-red-800 mb-1">This student has been escalated</div>
              {escalatedInt ? (
                <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-red-700">
                  <span><span className="font-semibold">Action:</span> {escalatedInt.action_type}</span>
                  {escalatedInt.escalated_to && <span><span className="font-semibold">Escalated to:</span> {escalatedInt.escalated_to}</span>}
                  {escalatedInt.escalation_reason && <span><span className="font-semibold">Reason:</span> {escalatedInt.escalation_reason}</span>}
                  {escalatedInt.escalated_at && <span><span className="font-semibold">At:</span> {escalatedInt.escalated_at}</span>}
                </div>
              ) : (
                <p className="text-xs text-red-700">Review the Actions tab for escalation details.</p>
              )}
            </div>
            <button
              onClick={() => setActiveTab('actions')}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-red-600 text-white text-xs font-semibold hover:bg-red-700 transition-colors"
            >
              View actions
            </button>
          </div>
        );
      })()}

      {/* Tabs */}
      <div className="border-b border-slate-200 overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {TABS.filter(tab => tab.id !== 'send' || hasPermission(currentRole, 'view_send')).map((tab) => {
            const Icon = tab.icon;
            const openActionCount = interventions.filter(iv => !['completed', 'closed', 'cancelled'].includes(iv.status)).length;
            const hasUrgentOpen = tab.id === 'actions' && interventions.some(
              iv => !['completed', 'closed', 'cancelled'].includes(iv.status) && iv.priority === 'urgent'
            );
            const badge = tab.id === 'actions'
              ? openActionCount + recommendedActions.length
              : 0;
            return (
              <button key={tab.id} onClick={() => { setActiveTab(tab.id); setNewTabs(prev => { const next = new Set(prev); next.delete(tab.id); return next; }); }}
                className={`relative flex items-center gap-2 px-4 py-3 text-sm font-semibold border-b-2 transition-all ${
                  activeTab === tab.id
                    ? hasUrgentOpen ? 'border-red-500 text-red-700' : 'border-teal-600 text-teal-700'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50/80 rounded-t-lg'
                } ${hasUrgentOpen && activeTab !== tab.id ? 'text-red-600' : ''}`}>
                {hasUrgentOpen && <span className="absolute -top-0.5 left-2 w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                {!hasUrgentOpen && newTabs.has(tab.id) && activeTab !== tab.id && (
                  <span className="absolute -top-0.5 left-2 w-1.5 h-1.5 rounded-full bg-teal-400 animate-pulse" />
                )}
                <Icon className="w-4 h-4" />
                {tab.label}
                {badge > 0 && (
                  <span className={`w-4 h-4 ${hasUrgentOpen ? 'bg-red-500 animate-pulse' : 'bg-red-500'} text-white text-[9px] font-bold rounded-full flex items-center justify-center`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="space-y-6">
        {/* ── OVERVIEW TAB ── */}
        {activeTab === 'overview' && (() => {
          const today = new Date().toISOString().slice(0, 10);
          const hasUrgentPattern = analysis?.risk_level === 'red';
          const hasOverdueAction = activeInterventions.some(i => i.review_date && i.review_date < today);
          const hasWorseningTrend = analysis?.behaviour_trend === 'Worsening' || analysis?.attendance_trend === 'Worsening';
          const isStable = !hasUrgentPattern && !hasOverdueAction && !hasWorseningTrend && interventions.some(i => i.status === 'completed');

          const SIGNAL_STATUS_CFG: Record<import('../lib/data').SignalStatus, { label: string; bg: string; text: string; dot: string }> = {
            new:                { label: 'New signal',          bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-500' },
            action_in_progress: { label: 'Action in progress',  bg: 'bg-blue-50',    text: 'text-blue-700',   dot: 'bg-blue-500' },
            review_due:         { label: 'Review due',          bg: 'bg-amber-50',   text: 'text-amber-700',  dot: 'bg-amber-500' },
            resolved:           { label: 'Resolved',            bg: 'bg-emerald-50', text: 'text-emerald-700',dot: 'bg-emerald-500' },
            escalated:          { label: 'Escalated',           bg: 'bg-red-50',     text: 'text-red-700',    dot: 'bg-red-600' },
            dismissed:          { label: 'Dismissed',           bg: 'bg-slate-50',   text: 'text-slate-600',  dot: 'bg-slate-400' },
          };
          const ssCfg = SIGNAL_STATUS_CFG[signalStatus];

          return (
          <div className="grid lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Signal status banner */}
              <div className={`flex items-center justify-between gap-3 ${ssCfg.bg} border border-current/10 rounded-2xl px-5 py-3`}>
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${ssCfg.dot} shrink-0`} />
                  <span className={`text-sm font-semibold ${ssCfg.text}`}>Signal status: {ssCfg.label}</span>
                </div>
                <span className="text-xs text-slate-500">SIGNAL → ACTION → REVIEW → OUTCOME</span>
              </div>

              {/* ── SIGNAL INTELLIGENCE FEED ─────────────────────────────── */}
              {(() => {
                const intel = computeStudentIntelligence(student, communications, interventions);
                const roleActions = getActionsForRole(intel, currentRole as import('../lib/permissions').AppRole);
                const urgencyBorder: Record<string, string> = { critical: 'border-l-red-500 bg-red-50/40', high: 'border-l-amber-400 bg-amber-50/30', medium: 'border-l-blue-300', low: 'border-l-slate-200' };
                const urgencyDot:    Record<string, string> = { critical: 'bg-red-500', high: 'bg-amber-500', medium: 'bg-blue-400', low: 'bg-slate-300' };
                const urgencyBadge:  Record<string, string> = { critical: 'bg-red-100 text-red-700', high: 'bg-amber-100 text-amber-700', medium: 'bg-blue-100 text-blue-700', low: 'bg-slate-100 text-slate-500' };
                const sourceIcon:    Record<string, React.ReactNode> = {
                  communication: <Route className="w-3 h-3" />,
                  intervention:  <ClipboardList className="w-3 h-3" />,
                  attendance:    <TrendingDown className="w-3 h-3" />,
                  behaviour:     <AlertTriangle className="w-3 h-3" />,
                  send:          <ShieldAlert className="w-3 h-3" />,
                  pattern:       <Activity className="w-3 h-3" />,
                };
                const riskBadgeColor = intel.computedRiskLevel === 'red' ? 'bg-red-100 text-red-700 border border-red-200' : intel.computedRiskLevel === 'amber' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200';

                if (roleActions.length === 0 && intel.dataDrivers.length === 0) return null;

                return (
                  <div className="card-premium overflow-hidden">
                    {/* Header */}
                    <div className="px-5 py-4 bg-slate-900 flex items-center gap-2.5">
                      <Siren className="w-4 h-4 text-teal-400 shrink-0" />
                      <h3 className="text-sm font-bold text-white">Signal Intelligence</h3>
                      <span className="ml-1 text-xs text-slate-400">What needs to happen next</span>
                      <div className="ml-auto flex items-center gap-2">
                        {intel.pendingRoutingCount > 0 && (
                          <span className="text-[10px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded-full">{intel.pendingRoutingCount} routing</span>
                        )}
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${riskBadgeColor}`}>
                          Live: {intel.computedRiskLevel === 'red' ? 'High risk' : intel.computedRiskLevel === 'amber' ? 'Watch' : 'Stable'}
                        </span>
                      </div>
                    </div>

                    {/* Role-specific next actions */}
                    {roleActions.length > 0 && (
                      <div className="divide-y divide-slate-100">
                        {roleActions.map(action => (
                          <div key={action.id} className={`px-5 py-3.5 border-l-4 ${urgencyBorder[action.urgency] || 'border-l-slate-200'}`}>
                            <div className="flex items-start gap-3">
                              <span className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${urgencyDot[action.urgency]}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-slate-800 leading-relaxed font-medium">{action.action}</p>
                                {action.detail && (
                                  <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{action.detail}</p>
                                )}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${urgencyBadge[action.urgency]}`}>
                                  {sourceIcon[action.sourceType]}
                                  {action.sourceType.replace('_', ' ')}
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Data drivers summary */}
                    {intel.dataDrivers.length > 0 && (
                      <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Contributing signals</div>
                        <div className="flex flex-wrap gap-2">
                          {intel.dataDrivers.map((d, i) => (
                            <span key={i} className={`flex items-center gap-1 text-[10px] font-semibold px-2.5 py-1 rounded-full border ${
                              d.severity === 'critical' ? 'bg-red-50 text-red-700 border-red-200'
                              : d.severity === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200'
                              : 'bg-blue-50 text-blue-700 border-blue-200'
                            }`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${d.severity === 'critical' ? 'bg-red-500' : d.severity === 'high' ? 'bg-amber-500' : 'bg-blue-400'}`} />
                              {d.label}: {d.value}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Stability banner */}
              {isStable && (
                <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-4">
                  <TrendingUp className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <div className="text-sm font-bold text-emerald-800 mb-0.5">This student appears to be stable</div>
                    <p className="text-xs text-emerald-700">No urgent patterns, no overdue actions, and no worsening trend. Consider moving to monitoring-only status or closing open actions.</p>
                  </div>
                </div>
              )}
              {/* WHY THIS STUDENT APPEARS HERE */}
              {(student.risk_level === 'red' || student.risk_level === 'amber' || student.signal_category === 'purple') && (
                <div className="card-premium overflow-hidden">
                  <div className={`px-5 pt-5 pb-4 border-l-4 ${student.risk_level === 'red' ? 'border-l-red-400' : student.signal_category === 'purple' ? 'border-l-amber-400' : 'border-l-blue-400'}`}>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Why this student appears here</div>
                    {analysis?.signal_explanation ? (
                      <p className="text-sm text-slate-800 leading-relaxed font-medium">{analysis.signal_explanation}</p>
                    ) : (
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {composeExplanationFromAnalysis(analysis ?? {}, student)}
                      </p>
                    )}
                  </div>
                  <div className="px-5 pb-5 border-t border-slate-100 pt-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Supporting evidence</div>
                    <div className="grid sm:grid-cols-2 gap-x-8 gap-y-1.5">
                      {[
                        { label: 'Attendance', value: `${student.attendance_pct ?? 95}%`, flagged: (student.attendance_pct ?? 95) < 85 },
                        { label: 'Behaviour incidents', value: `${incidentCount}`, flagged: incidentCount >= 4 },
                        { label: 'Behaviour points', value: `${totalPoints} pts`, flagged: totalPoints >= 15 },
                        ...(topSubjects.length > 0 ? [{ label: topSubjects[0][0], value: `${topSubjects[0][1]} of ${incidentCount} incidents`, flagged: topSubjects[0][1] >= 3 }] : []),
                        ...(student.punctuality_issues && student.punctuality_issues > 0 ? [{ label: 'Late marks', value: String(student.punctuality_issues), flagged: student.punctuality_issues >= 3 }] : []),
                        ...(student.send_status ? [{ label: 'SEND', value: student.send_status, flagged: false }] : []),
                        ...((analysis?.key_reasons || []).some((r) => r.toLowerCase().includes('safeguard')) ? [{ label: 'Safeguarding', value: '1 note on record', flagged: true }] : []),
                        ...((analysis?.key_reasons || []).some((r) => r.toLowerCase().includes('ehcp') || r.toLowerCase().includes('review overdue')) ? [{ label: 'EHCP review', value: 'Overdue', flagged: true }] : []),
                        ...(quickNotes.filter((n) => n.concern_level >= 4).length > 0 ? [{ label: 'Staff concern notes', value: `${quickNotes.filter((n) => n.concern_level >= 4).length} high-concern`, flagged: true }] : []),
                      ].map(({ label, value, flagged }) => (
                        <div key={label} className="flex items-center justify-between py-1.5 border-b border-slate-100 last:border-0">
                          <span className="text-sm text-slate-500">{label}</span>
                          <span className={`text-sm font-semibold ${flagged ? 'text-red-600' : 'text-slate-700'}`}>{value}</span>
                        </div>
                      ))}
                    </div>
                    {analysis?.key_reasons && analysis.key_reasons.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
                        {analysis.key_reasons.slice(0, 4).map((r, i) => (
                          <p key={i} className="text-xs text-slate-600">{r}</p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Strengths, Barriers & Patterns (from enriched analysis) */}
              {analysis && (analysis.strengths || analysis.barriers || (analysis.repeated_patterns && analysis.repeated_patterns.length > 0)) && (
                <div className="card-premium p-5 space-y-4">
                  {analysis.strengths && (
                    <div>
                      <div className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest mb-1.5">Strengths</div>
                      <p className="text-sm text-slate-700 leading-relaxed">{analysis.strengths}</p>
                    </div>
                  )}
                  {analysis.barriers && (
                    <div>
                      <div className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-1.5">Barriers to progress</div>
                      <p className="text-sm text-slate-700 leading-relaxed">{analysis.barriers}</p>
                    </div>
                  )}
                  {analysis.recent_improvements && (
                    <div>
                      <div className="text-[10px] font-bold text-teal-600 uppercase tracking-widest mb-1.5">Recent improvements</div>
                      <p className="text-sm text-slate-700 leading-relaxed">{analysis.recent_improvements}</p>
                    </div>
                  )}
                  {analysis.repeated_patterns && analysis.repeated_patterns.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-amber-600 uppercase tracking-widest mb-1.5">Repeated patterns</div>
                      <div className="flex flex-wrap gap-2">
                        {analysis.repeated_patterns.map((p, i) => (
                          <span key={i} className="inline-flex items-center gap-1 text-xs bg-amber-50 border border-amber-200 rounded-full px-2.5 py-1 text-amber-700 font-medium">
                            {p.type === 'subject' && `${p.value}: ${p.count} incidents`}
                            {p.type === 'period' && `${p.value}: ${p.count} incidents`}
                            {p.type === 'staff' && `Same staff: ${p.count}x`}
                            {p.type === 'peers' && `${p.count} linked peer${p.count > 1 ? 's' : ''}`}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysis.confidence_score != null && analysis.confidence_score > 0 && (
                    <div className="pt-2 border-t border-slate-100 flex items-center gap-3">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Confidence</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                        <div className="h-1.5 bg-teal-400 rounded-full" style={{ width: `${analysis.confidence_score}%` }} />
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500">{analysis.confidence_score}%</span>
                      <span className="text-[10px] text-slate-400">({analysis.evidence_count || 0} data points)</span>
                    </div>
                  )}
                  {analysis.data_sources && analysis.data_sources.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Evidence sources</div>
                      <div className="flex flex-wrap gap-1.5">
                        {analysis.data_sources.map((src: string, i: number) => (
                          <span key={i} className="inline-flex items-center text-[10px] bg-slate-100 rounded px-2 py-0.5 text-slate-600 font-medium capitalize">{src.replace('_', ' ')}</span>
                        ))}
                      </div>
                    </div>
                  )}
                  {analysis.suggested_next_steps && analysis.suggested_next_steps.length > 0 && (
                    <div className="pt-2 border-t border-slate-100">
                      <div className="text-[10px] font-bold text-teal-600 uppercase tracking-widest mb-1.5">Suggested next steps</div>
                      <div className="space-y-1.5">
                        {analysis.suggested_next_steps.map((step: { role: string; action: string; priority: string }, i: number) => (
                          <div key={i} className="flex items-start gap-2 text-xs">
                            <span className={`shrink-0 mt-0.5 w-1.5 h-1.5 rounded-full ${step.priority === 'urgent' ? 'bg-red-500' : step.priority === 'high' ? 'bg-amber-500' : 'bg-teal-400'}`} />
                            <span className="text-slate-700">{step.action}</span>
                            <span className="ml-auto text-[10px] text-slate-400 capitalize shrink-0">{step.role.replace('_', ' ')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Risk Summary */}
              <div className="card-premium p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-base font-bold text-slate-800">Risk Summary</h3>
                  <span className={`text-sm font-bold uppercase tracking-wider ${riskBadgeClass}`}>{student.risk_level} priority</span>
                </div>
                <div className="grid sm:grid-cols-2 gap-5">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-red-50"><TrendingDown className="w-5 h-5 text-red-600" /></div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">{analysis?.behaviour_trend || 'Unknown'}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{totalPoints} behaviour points from {incidentCount} incidents</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-blue-50"><Clock className="w-5 h-5 text-blue-600" /></div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">{analysis?.attendance_trend || 'Unknown'}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Current: {student.attendance_pct ?? 95}%</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-slate-50"><BookOpen className="w-5 h-5 text-slate-600" /></div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Top subjects</div>
                      <div className="text-xs text-slate-500 mt-0.5">{topSubjects.map(([s, c]) => `${s} (${c})`).join(', ') || 'None'}</div>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-slate-50"><Calendar className="w-5 h-5 text-slate-600" /></div>
                    <div>
                      <div className="text-sm font-bold text-slate-800">Review due</div>
                      <div className="text-xs text-slate-500 mt-0.5">{analysis?.recommended_review_date || 'Not set'}</div>
                    </div>
                  </div>
                </div>
                {analysis?.key_reasons && analysis.key_reasons.length > 0 && (
                  <div className="mt-5 pt-5 border-t border-slate-100">
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Evidence from records</div>
                    <div className="space-y-1">
                      {analysis.key_reasons.map((reason, i) => (
                        <p key={i} className="text-xs text-slate-600">{reason}</p>
                      ))}
                    </div>
                    <p className="text-[10px] text-slate-400 italic mt-2">Raw data metrics from uploaded records — not AI-generated conclusions.</p>
                  </div>
                )}
              </div>

              {/* Recommended Actions — evidence-first */}
              {recommendedActions.length > 0 && (
                <div className="card-premium overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Target className="w-4 h-4 text-teal-600" />
                      <h3 className="text-base font-bold text-slate-800">Requires Review</h3>
                    </div>
                    <span className="text-xs text-slate-500 font-medium">{recommendedActions.length} item{recommendedActions.length > 1 ? 's' : ''}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {recommendedActions.map((rec) => {
                      const Icon = REC_ICON[rec.icon_type];
                      const colors = REC_COLORS[rec.icon_type];
                      const ownerColors: Record<string, string> = {
                        dsl: 'bg-red-50 text-red-700 border-red-200',
                        sendco: 'bg-purple-50 text-purple-700 border-purple-200',
                        form_tutor: 'bg-blue-50 text-blue-700 border-blue-200',
                        subject_teacher: 'bg-amber-50 text-amber-700 border-amber-200',
                        hoy: 'bg-teal-50 text-teal-700 border-teal-200',
                        attendance: 'bg-orange-50 text-orange-700 border-orange-200',
                      };
                      const ownerBadge = rec.owner_role ? ownerColors[rec.owner_role] : 'bg-slate-50 text-slate-600 border-slate-200';
                      return (
                        <div key={rec.id} className={`p-5 ${colors.bg} transition-all duration-300 ${highlightedId === rec.id ? 'ring-2 ring-teal-400 ring-inset bg-teal-50 animate-flash-ring' : ''}`}>
                          <div className="flex items-start gap-4">
                            <div className={`p-2.5 rounded-xl ${colors.icon} shrink-0`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1 flex-wrap">
                                <span className="font-bold text-slate-900 text-sm">{rec.action_name}</span>
                                <PriorityBadge priority={rec.priority} />
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ownerBadge}`}>{rec.suggested_owner}</span>
                              </div>
                              {rec.evidence_label && (
                                <div className="flex items-center gap-1.5 mb-2 text-[11px] text-slate-500 font-medium">
                                  <Eye className="w-3 h-3 shrink-0" />
                                  <span>{rec.evidence_label}</span>
                                </div>
                              )}
                              <p className="text-sm text-slate-600 leading-relaxed mb-3 line-clamp-2">{rec.reason}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => setEvidenceModal({ rec, dismissReason: '', showDismissInput: false })}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
                                >
                                  <Eye className="w-3 h-3" /> Review evidence
                                </button>
                                <button
                                  onClick={() => setEvidenceModal({ rec, dismissReason: '', showDismissInput: true })}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 text-xs font-medium transition-colors"
                                >
                                  <X className="w-3 h-3" /> Dismiss
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── SMART BRIEFING ── */}
              {(() => {
                const role = profile?.role || '';
                const visibleTypes = getVisibleNoteTypes(role);
                const visibleNotes = quickNotes
                  .filter(qn => visibleTypes.includes(qn.visibility || 'general'))
                  .sort((a, b) => b.date.localeCompare(a.date));
                const recentComms = communications
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .slice(0, 3);
                const activeInts = interventions.filter(i => !['completed', 'closed', 'cancelled'].includes(i.status));

                // Role-specific action advice
                const att = student.attendance_pct ?? 95;
                const beh = student.behaviour_score ?? 0;
                const topSubject = analysis?.subjects_involved?.[0] ?? null;
                const adviceItems: { icon: string; text: string; priority: 'high' | 'medium' | 'low' }[] = [];

                if (role === 'teacher') {
                  if (topSubject) adviceItems.push({ icon: 'subject', text: `Recurring incidents in ${topSubject} — review seating plan and trigger times. The pattern suggests a specific context, not a general behaviour issue.`, priority: 'high' });
                  if (att < 85) adviceItems.push({ icon: 'attend', text: `Attendance is ${att}%. If the student is absent from your lesson, log it promptly — it feeds the signal.`, priority: 'high' });
                  if (beh > 20) adviceItems.push({ icon: 'behav', text: `Behaviour score is ${beh}. Use the Quick Note to log any further incidents — even small ones help build the picture.`, priority: 'medium' });
                  if (activeInts.length > 0) adviceItems.push({ icon: 'int', text: `${activeInts.length} intervention${activeInts.length > 1 ? 's' : ''} already open for this student. Don't duplicate — check the Actions tab before raising a concern.`, priority: 'low' });
                  adviceItems.push({ icon: 'note', text: 'If you have a new observation, tap "Add note" below. All observations go to the right staff member automatically.', priority: 'low' });
                } else if (role === 'head_of_year' || role === 'pastoral_lead') {
                  if (att < 80) adviceItems.push({ icon: 'attend', text: `Attendance at ${att}% — persistent absence threshold. Parent contact or attendance panel referral required.`, priority: 'high' });
                  if (recentComms.length === 0) adviceItems.push({ icon: 'comms', text: 'No parent/carer contact on record. First point of contact should be a pastoral phone call.', priority: 'high' });
                  if (activeInts.filter(i => i.action_type.toLowerCase().includes('pastoral')).length === 0) adviceItems.push({ icon: 'pastoral', text: 'No active pastoral meeting intervention. Consider scheduling one — use the Actions tab to create.', priority: 'medium' });
                } else if (role === 'dsl') {
                  const safeNote = visibleNotes.find(qn => qn.category === 'Safeguarding concern' || qn.concern_level >= 4);
                  if (safeNote) adviceItems.push({ icon: 'safe', text: `Safeguarding note logged by ${safeNote.staff_member} on ${safeNote.date}. Review below and consider CPOMS update.`, priority: 'high' });
                  const safeInt = activeInts.find(i => /safeguard|welfare/i.test(i.action_type));
                  if (safeInt) adviceItems.push({ icon: 'int', text: `Active safeguarding action: "${safeInt.action_type}" — due ${safeInt.due_date}. Update CPOMS and record outcome.`, priority: 'high' });
                  if (!safeInt && !safeNote) adviceItems.push({ icon: 'safe', text: 'No open safeguarding action. If a concern has been raised, create one on the Actions tab.', priority: 'medium' });
                } else if (role === 'sendco') {
                  if (student.send_status) adviceItems.push({ icon: 'send', text: `SEND status: ${student.send_status}. Review provision plan and check all subject accommodations are in place.`, priority: 'high' });
                  if (att < 85) adviceItems.push({ icon: 'attend', text: `Attendance at ${att}% — SEND students with low attendance need Early Help review.`, priority: 'medium' });
                }

                if (!visibleNotes.length && !recentComms.length && !adviceItems.length) return null;

                return (
                  <div className="space-y-4">
                    {/* Advice for this role */}
                    {adviceItems.length > 0 && (
                      <div className="card-premium overflow-hidden">
                        <div className="px-5 py-4 bg-slate-900 flex items-center gap-2.5">
                          <Brain className="w-4 h-4 text-teal-400 shrink-0" />
                          <h3 className="text-sm font-bold text-white">Advice for you</h3>
                          <span className="ml-auto text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{role.replace('_', ' ')}</span>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {adviceItems.map((item, idx) => (
                            <div key={idx} className={`px-5 py-3.5 flex items-start gap-3 ${item.priority === 'high' ? 'bg-red-50/40' : ''}`}>
                              <div className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 ${item.priority === 'high' ? 'bg-red-500' : item.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                              <p className="text-xs text-slate-700 leading-relaxed">{item.text}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Staff observations inline */}
                    {visibleNotes.length > 0 && (
                      <div className="card-premium overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <StickyNote className="w-4 h-4 text-amber-500" />
                            <h3 className="text-sm font-bold text-slate-800">Staff observations</h3>
                            <span className="text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{visibleNotes.length}</span>
                          </div>
                          <button onClick={() => setActiveTab('notes')} className="text-xs text-teal-600 hover:text-teal-800 font-semibold">View all</button>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {visibleNotes.slice(0, 4).map(qn => {
                            const lvl = qn.concern_level ?? 1;
                            const lvlColor = lvl >= 4 ? 'text-red-700 bg-red-100' : lvl === 3 ? 'text-amber-700 bg-amber-100' : 'text-slate-600 bg-slate-100';
                            return (
                              <div key={qn.id} className="px-5 py-3.5">
                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                  <span className="text-xs font-bold text-slate-700">{qn.staff_member}</span>
                                  <span className="text-[10px] text-slate-400">{qn.date}</span>
                                  <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full">{qn.category}</span>
                                  {lvl >= 3 && (
                                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${lvlColor}`}>Level {lvl}</span>
                                  )}
                                </div>
                                <p className="text-xs text-slate-600 leading-relaxed">{qn.note}</p>
                              </div>
                            );
                          })}
                          {visibleNotes.length > 4 && (
                            <div className="px-5 py-3 text-center">
                              <button onClick={() => setActiveTab('notes')} className="text-xs text-teal-600 hover:text-teal-800 font-semibold">
                                +{visibleNotes.length - 4} more observations
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Recent contact */}
                    {recentComms.length > 0 && (
                      <div className="card-premium overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4 text-sky-500" />
                            <h3 className="text-sm font-bold text-slate-800">Recent contact</h3>
                          </div>
                          <button onClick={() => setActiveTab('timeline')} className="text-xs text-teal-600 hover:text-teal-800 font-semibold">View all</button>
                        </div>
                        <div className="divide-y divide-slate-100">
                          {recentComms.map(c => (
                            <div key={c.id} className="px-5 py-3.5">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-xs font-bold text-slate-700 capitalize">{c.source.replace('_', ' ')}</span>
                                <span className="text-[10px] text-slate-400">{c.date}</span>
                                {c.outcome && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full capitalize">{c.outcome}</span>}
                              </div>
                              <p className="text-xs text-slate-600 leading-relaxed">{c.notes || c.summary || '—'}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            {/* Sidebar */}
            <div className="space-y-6">
              {/* Quick Info */}
              <div className="card-premium p-6">
                <h3 className="text-base font-bold text-slate-800 mb-5">Quick Info</h3>
                <div className="space-y-4 text-sm">
                  {[
                    { label: 'Year group', value: student.year_group },
                    { label: 'Form', value: student.form },
                    { label: 'Pupil Premium', value: student.pupil_premium ? 'Yes' : 'No' },
                    { label: 'SEND status', value: student.send_status || 'None' },
                    { label: 'Behaviour score', value: totalPoints, color: totalPoints > 20 ? 'text-red-600' : undefined },
                    { label: 'Attendance', value: `${student.attendance_pct ?? 95}%`, color: (student.attendance_pct || 0) < 80 ? 'text-red-600' : undefined },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="flex justify-between items-center pb-3 border-b border-slate-100 last:border-0">
                      <span className="text-slate-500 font-medium">{label}</span>
                      <span className={`font-bold ${color || 'text-slate-800'}`}>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Interventions */}
              <div className="card-premium overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-800">Active Interventions</h3>
                  <span className="text-xs text-slate-500">{activeInterventions.length} active</span>
                </div>
                {activeInterventions.length === 0 ? (
                  <div className="px-5 py-6 text-center text-slate-400 text-sm">No active interventions</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {activeInterventions.slice(0, 4).map((i) => (
                      <div key={i.id} className="px-5 py-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <span className="text-xs font-bold text-slate-800 leading-tight">{i.action_type}</span>
                          <StatusBadge status={isReviewDue(i) ? 'review_due' : i.status} />
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>{i.assigned_to}</span>
                          {i.review_date && <span className={isReviewDue(i) ? 'text-orange-600 font-semibold' : ''}>Review {formatDate(i.review_date)}</span>}
                        </div>
                        {i.created_by && (
                          <div className="text-[10px] text-slate-400 mt-0.5">
                            Raised by {i.created_by.replace(/\s*\([^)]*\)/, '')}
                            {getCreatorTitle(i.created_by) && <span className="ml-1 font-medium">· {getCreatorTitle(i.created_by)}</span>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                <div className="px-5 py-3 border-t border-slate-100">
                  <button onClick={() => setActiveTab('actions')} className="w-full text-xs font-semibold text-teal-600 hover:text-teal-700 flex items-center justify-center gap-1">
                    View all interventions <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Recognitions */}
              {successRecognitions.length > 0 && (
                <div className="overflow-hidden rounded-xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-yellow-50">
                  <div className="px-5 py-4 border-b border-amber-100 flex items-center justify-between bg-amber-400/10">
                    <div className="flex items-center gap-2">
                      <Star className="w-4 h-4 text-amber-500 fill-amber-400" />
                      <h3 className="text-sm font-bold text-amber-900">Recognitions</h3>
                    </div>
                    <span className="text-xs font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-200">{successRecognitions.length} awarded</span>
                  </div>
                  <div className="divide-y divide-amber-100">
                    {successRecognitions.slice(0, 3).map((r) => (
                      <div key={r.id} className="px-5 py-3 flex items-start gap-3">
                        <div className="w-6 h-6 rounded-lg bg-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                          <Star className="w-3 h-3 text-white fill-white" />
                        </div>
                        <div>
                          <div className="text-xs font-bold text-amber-900 leading-tight mb-0.5">{r.recognition_label}</div>
                          <div className="text-[11px] text-amber-600">{r.completed_at.slice(0, 10)}{r.completed_by ? ` · ${r.completed_by}` : ''}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  {successRecognitions.length > 3 && (
                    <div className="px-5 py-3 border-t border-amber-100">
                      <button onClick={() => setActiveTab('timeline')} className="w-full text-xs font-semibold text-amber-700 hover:text-amber-800 flex items-center justify-center gap-1">
                        View all in timeline <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Priority Score */}
              {(() => {
                const riskScore = analysis?.risk_score ?? (student.risk_level === 'red' ? 76 : student.risk_level === 'amber' ? 44 : 18);
                const scoreItems: { label: string; value: string; flagged: boolean }[] = [
                  { label: 'Attendance', value: `${student.attendance_pct ?? 95}%`, flagged: (student.attendance_pct ?? 95) < 85 },
                  { label: 'Behaviour incidents', value: String(incidentCount), flagged: incidentCount >= 4 },
                  { label: 'Behaviour points', value: String(totalPoints), flagged: totalPoints >= 15 },
                  { label: 'Late marks', value: String(student.punctuality_issues ?? 0), flagged: (student.punctuality_issues ?? 0) >= 3 },
                  ...(student.send_status ? [{ label: 'SEND status', value: student.send_status, flagged: false }] : []),
                  ...(student.pupil_premium ? [{ label: 'Pupil Premium', value: 'Eligible', flagged: false }] : []),
                  ...((analysis?.key_reasons || []).some((r) => r.toLowerCase().includes('safeguard')) ? [{ label: 'Safeguarding note', value: '1 recorded', flagged: true }] : []),
                  ...((analysis?.key_reasons || []).some((r) => r.toLowerCase().includes('ehcp') || r.toLowerCase().includes('review overdue')) ? [{ label: 'EHCP review', value: 'Overdue', flagged: true }] : []),
                ];
                const flaggedCount = scoreItems.filter((x) => x.flagged).length;
                return (
                  <div className="card-premium overflow-hidden">
                    <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Priority Score</span>
                      <span className="text-[10px] text-slate-400 italic">Based on uploaded records only</span>
                    </div>
                    <div className="p-4 space-y-3">
                      <div className="flex items-end gap-3">
                        <span className={`text-3xl font-extrabold leading-none ${riskScore >= 70 ? 'text-red-600' : riskScore >= 40 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {riskScore}
                        </span>
                        <span className="text-slate-400 text-sm mb-0.5">/ 100</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ml-auto ${student.risk_level === 'red' ? 'bg-red-100 text-red-700' : student.risk_level === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                          {student.risk_level}
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-1.5">
                        <div className={`h-1.5 rounded-full transition-all ${riskScore >= 70 ? 'bg-red-500' : riskScore >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${riskScore}%` }} />
                      </div>
                      <div className="text-[10px] text-slate-400 italic">
                        {flaggedCount > 0 ? `${flaggedCount} factor${flaggedCount !== 1 ? 's' : ''} contributed to this score.` : 'No significant risk factors detected.'}
                      </div>

                      <div className="pt-1 space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Generated from</div>
                        {scoreItems.map(({ label, value, flagged }) => (
                          <div key={label} className="flex items-center justify-between text-xs">
                            <span className="text-slate-500">{label}</span>
                            <span className={`font-semibold ${flagged ? 'text-red-600' : 'text-slate-700'}`}>{value}</span>
                          </div>
                        ))}
                      </div>

                      {nextStep && (
                        <div className="mt-2 pt-3 border-t border-slate-100">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Suggested next step</div>
                          <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2">
                            <div className="text-xs font-bold text-teal-800">{nextStep.action}</div>
                            {nextStep.reason && <div className="text-xs text-teal-700 mt-0.5 leading-relaxed">{nextStep.reason}</div>}
                          </div>
                        </div>
                      )}

                      <button onClick={() => setActiveTab('timeline')} className="text-xs font-semibold text-teal-600 hover:text-teal-700 transition-colors pt-1">
                        View full timeline →
                      </button>
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
          );
        })()}

        {/* ── ACTIONS TAB ── */}
        {activeTab === 'actions' && (() => {
          // awaitingReview has highest display priority — items appear here ONLY
          const awaitingReviewActions = interventions.filter(i => !['completed', 'closed', 'cancelled'].includes(i.status) && isReviewDue(i));
          const awaitingReviewIds = new Set(awaitingReviewActions.map(i => i.id));
          const openActions = interventions.filter(i => ['open', 'assigned', 'suggested'].includes(i.status) && !awaitingReviewIds.has(i.id));
          const inProgressActions = interventions.filter(i => i.status === 'in_progress' && !awaitingReviewIds.has(i.id));
          const escalatedActions = interventions.filter(i => i.status === 'escalated' && !awaitingReviewIds.has(i.id));
          const completedActions = interventions.filter(i => ['completed', 'closed'].includes(i.status));
          const cancelledActions = interventions.filter(i => i.status === 'cancelled');
          const totalActions = interventions.length;

          function ActionRow({ i, showReviewButton = false }: { i: Intervention; showReviewButton?: boolean }) {
            const reviewOverdue = isReviewDue(i);
            const currentUserName = profile?.full_name || '';
            const isAssignee = i.assigned_to === currentUserName || (i.assigned_to || '').startsWith(currentUserName + ' ');
            const isOversightRole = ['admin', 'slt', 'dsl', 'sendco'].includes(profile?.role || '');
            // Only the assigned user (or admin) can complete/review actions.
            // SLT/DSL/SENDCo who are not the assignee see a Reassign option instead.
            const canAct = isAssignee || profile?.role === 'admin';
            const canReassign = isOversightRole && !isAssignee;
            // Don't highlight an escalated action for someone who is no longer the responsible party
            const isHighlighted = highlightedId === i.id && !(i.status === 'escalated' && !canAct);
            const impact = i.outcome_status ? IMPACT_CONFIG[i.outcome_status] : null;

            // Check if this same action type was completed before (for suggested actions)
            const previouslyCompleted = i.status === 'suggested'
              ? interventions.find(other =>
                  other.id !== i.id &&
                  other.action_type === i.action_type &&
                  other.status === 'completed'
                )
              : null;

            // What the user must do to clear this from the queue
            const queueClearStep = reviewOverdue
              ? 'Review date has passed. Record the outcome now and complete this action to clear it from the queue.'
              : i.status === 'suggested'
              ? `Auto-suggested based on this student's signal pattern. ${i.notes ? `Recommendation: "${i.notes}". ` : ''}Use the "Accept & Assign" button below to confirm and assign to the right staff member.`
              : i.status === 'open'
              ? 'Assign this action to a staff member to start it. Once assigned, it moves to in progress.'
              : i.status === 'assigned'
              ? 'Click "Mark In Progress" to confirm work has started. Then record an outcome and complete it when done.'
              : i.status === 'in_progress'
              ? 'Record an outcome and click "Complete" to close this action and remove it from the queue.'
              : i.status === 'escalated'
              ? 'This has been escalated. Update the outcome and close when the escalation is resolved.'
              : null;

            return (
              <div
                id={`intervention-${i.id}`}
                className={`px-5 py-4 transition-all duration-300 ${
                  !canAct
                    ? 'opacity-50 bg-slate-50/60'
                    : isHighlighted
                    ? 'bg-teal-50 ring-2 ring-teal-400 ring-inset animate-flash-ring'
                    : i.status === 'suggested'
                    ? 'bg-amber-50/70 border-l-4 border-amber-400 animate-flash-ring'
                    : (i.status === 'open' || i.status === 'assigned') && i.priority === 'urgent'
                    ? 'bg-red-50/60 border-l-4 border-red-500'
                    : (i.status === 'open' || i.status === 'assigned')
                    ? 'bg-blue-50/40 border-l-4 border-blue-400'
                    : reviewOverdue ? 'bg-orange-50/50' : 'hover:bg-slate-50/40'
                }`}
              >
                {/* Not assigned to you — shown for non-assignees */}
                {!canAct && !canReassign && !['completed', 'closed', 'cancelled'].includes(i.status) && (
                  <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 border border-slate-200">
                    <Eye className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    <span className="text-[11px] text-slate-500 font-medium">
                      Assigned to {i.assigned_to || 'another staff member'} — view only
                    </span>
                  </div>
                )}
                {/* SLT/DSL/SENDCo viewing someone else's action — reassign banner */}
                {canReassign && !['completed', 'closed', 'cancelled', 'escalated'].includes(i.status) && (
                  <div className="mb-3 flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                    <div className="flex items-center gap-2">
                      <Eye className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                      <span className="text-[11px] text-amber-800 font-medium">
                        Assigned to {i.assigned_to || 'another staff member'} — only they can complete
                      </span>
                    </div>
                    <button
                      onClick={() => setReassignTarget(i)}
                      className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-100 border border-amber-300 text-amber-800 hover:bg-amber-200 transition-colors text-[10px] font-semibold shrink-0"
                    >
                      <RefreshCw className="w-3 h-3" /> Reassign
                    </button>
                  </div>
                )}
                {/* Previously completed warning for suggested actions */}
                {previouslyCompleted && (
                  <div className="mb-3 flex items-start gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                    <span className="text-[11px] text-amber-800 leading-snug">
                      This action type was already completed{previouslyCompleted.completed_at ? ` on ${new Date(previouslyCompleted.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}{previouslyCompleted.completed_by ? ` by ${previouslyCompleted.completed_by.replace(/\s*\([^)]*\)/, '')}` : ''}. Review the previous outcome before acting again.
                    </span>
                  </div>
                )}
                {/* "To clear from queue" guidance — only shown to the assignee or oversight roles */}
                {canAct && (isHighlighted || i.status === 'open' || i.status === 'assigned' || i.status === 'suggested') && queueClearStep && (
                  <div className={`mb-3 flex items-start gap-2.5 px-4 py-3 rounded-xl border ${
                    i.status === 'suggested'
                      ? 'bg-amber-100 border-amber-300'
                      : isHighlighted
                      ? 'bg-amber-100 border-amber-300'
                      : 'bg-blue-50 border-blue-200'
                  }`}>
                    <ArrowRight className={`w-4 h-4 shrink-0 mt-0.5 ${(isHighlighted || i.status === 'suggested') ? 'text-amber-700' : 'text-blue-600'}`} />
                    <div>
                      <span className={`text-xs font-bold block mb-0.5 ${(isHighlighted || i.status === 'suggested') ? 'text-amber-900' : 'text-blue-900'}`}>To clear from queue</span>
                      <span className={`text-xs leading-relaxed ${(isHighlighted || i.status === 'suggested') ? 'text-amber-800' : 'text-blue-700'}`}>{queueClearStep}</span>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-semibold text-slate-800 text-sm">{i.action_type}</span>
                      <StatusBadge status={reviewOverdue ? 'review_due' : i.status} />
                      <PriorityBadge priority={i.priority as any} />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs text-slate-500 mb-2">
                      <span><span className="font-medium text-slate-600">Owner:</span> {i.assigned_to || '—'}</span>
                      <span><span className="font-medium text-slate-600">Raised by:</span> {i.created_by ? <>{i.created_by.replace(/\s*\([^)]*\)/, '')}{getCreatorTitle(i.created_by) && <span className="text-slate-400"> · {getCreatorTitle(i.created_by)}</span>}</> : '—'}</span>
                      <span><span className="font-medium text-slate-600">Due:</span> {i.due_date ? formatDate(i.due_date) : '—'}</span>
                      <span><span className="font-medium text-slate-600">Review:</span> {i.review_date ? <span className={reviewOverdue ? 'text-orange-600 font-semibold' : ''}>{formatDate(i.review_date)}</span> : '—'}</span>
                    </div>
                    {i.reason && <p className="text-xs text-slate-500 mb-2 leading-relaxed">{i.reason}</p>}
                    {(i.outcome || i.review_notes) && (
                      <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 mb-2">
                        {i.outcome && <p className="text-xs text-slate-700 leading-relaxed">{i.outcome}</p>}
                        {i.review_notes && <p className="text-[10px] text-slate-400 mt-0.5 italic">{i.review_notes}</p>}
                        {impact && <span className={`mt-1.5 inline-block text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${impact.classes}`}>{impact.label}</span>}
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {canAct ? (
                        <>
                      {i.status === 'suggested' && (
                        <button onClick={() => updateStatus(i.id, 'open')} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 transition-colors text-[10px] font-bold">
                          <Zap className="w-3 h-3" /> Accept & Assign
                        </button>
                      )}
                      {showReviewButton && (
                        <button
                          onClick={() => { setReviewModal(i); setReviewForm({ action_taken: null, student_improved: null, notes: '', current_attendance: String(student.attendance_pct || ''), current_behaviour: String(student.behaviour_score || '') }); }}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-orange-500 text-white text-[10px] font-bold hover:bg-orange-600 transition-colors"
                        >
                          <RotateCcw className="w-3 h-3" /> Review Now
                        </button>
                      )}
                      {i.status === 'assigned' && (
                        <button onClick={() => updateStatus(i.id, 'in_progress')} className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors text-[10px] font-medium">
                          <RefreshCw className="w-3 h-3" /> Mark In Progress
                        </button>
                      )}
                      {i.status === 'completed' ? (
                        <button
                          onClick={() => undoCompletion(i)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors text-[10px] font-medium"
                          title="Undo completion — return to previous status"
                        >
                          <RotateCcw className="w-3 h-3" /> Undo
                        </button>
                      ) : (
                        !['closed', 'cancelled'].includes(i.status) && (
                          <button
                            onClick={() => {
                              setCompleteModal(i);
                              setCompleteForm({ outcomeText: '', outcomeAchieved: 'achieved', outcomeCategory: '', nextStep: '', overrideReason: '', showOverride: false });
                            }}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors text-[10px] font-medium"
                          >
                            <CheckCircle className="w-3 h-3" /> Complete
                          </button>
                        )
                      )}
                      {i.status === 'escalated' ? (
                        <button
                          onClick={() => undoEscalation(i)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors text-[10px] font-medium"
                          title="Undo escalation"
                        >
                          <RotateCcw className="w-3 h-3" /> Undo Escalation
                        </button>
                      ) : (
                        !['completed', 'closed', 'cancelled'].includes(i.status) && (
                          <button
                            onClick={() => openEscalationModal(i)}
                            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors text-[10px] font-medium"
                          >
                            <AlertTriangle className="w-3 h-3" /> Escalate
                          </button>
                        )
                      )}
                        </>
                      ) : (
                        !['completed', 'closed', 'cancelled'].includes(i.status) && (
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {showReviewButton && (
                              <button disabled className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 text-[10px] font-medium cursor-not-allowed opacity-60" title={`Assigned to ${i.assigned_to || 'staff'}`}>
                                <RotateCcw className="w-3 h-3" /> Review Now
                              </button>
                            )}
                            {i.status === 'assigned' && (
                              <button disabled className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 text-[10px] font-medium cursor-not-allowed opacity-60" title={`Assigned to ${i.assigned_to || 'staff'}`}>
                                <RefreshCw className="w-3 h-3" /> Mark In Progress
                              </button>
                            )}
                            {i.status !== 'escalated' && (
                              <button disabled className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 text-[10px] font-medium cursor-not-allowed opacity-60" title={`Assigned to ${i.assigned_to || 'staff'}`}>
                                <CheckCircle className="w-3 h-3" /> Complete
                              </button>
                            )}
                            <button disabled className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-400 text-[10px] font-medium cursor-not-allowed opacity-60" title={`Assigned to ${i.assigned_to || 'staff'}`}>
                              <AlertTriangle className="w-3 h-3" /> Escalate
                            </button>
                            <span className="text-[10px] text-slate-400 italic ml-1">Assigned to {i.assigned_to || 'staff'}</span>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          }

          function ActionSection({ title, icon: Icon, iconClass, count, badge, children, defaultOpen = true }: {
            title: string; icon: React.ElementType; iconClass: string; count: number;
            badge?: string; children: React.ReactNode; defaultOpen?: boolean;
          }) {
            const [open, setOpen] = useState(defaultOpen);
            if (count === 0) return null;
            return (
              <div className="card-premium overflow-hidden">
                <button
                  onClick={() => setOpen(!open)}
                  className="w-full px-5 py-4 border-b border-slate-100 flex items-center gap-2 hover:bg-slate-50/60 transition-colors"
                >
                  <Icon className={`w-4 h-4 shrink-0 ${iconClass}`} />
                  <span className="text-sm font-bold text-slate-800">{title}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge || 'bg-slate-100 text-slate-600'}`}>{count}</span>
                  {open ? <ChevronUp className="w-4 h-4 text-slate-400 ml-auto" /> : <ChevronDown className="w-4 h-4 text-slate-400 ml-auto" />}
                </button>
                {open && <div className="divide-y divide-slate-100">{children}</div>}
              </div>
            );
          }

          return (
            <div className="space-y-5">
              {/* From-queue banner */}
              {fromQueue && (() => {
                const focusedInt = interventions.find(i => i.id === highlightedId);
                if (!focusedInt) return null;
                const reviewOverdue = isReviewDue(focusedInt);
                const stepLabel = reviewOverdue
                  ? 'review overdue — record outcome'
                  : focusedInt.status === 'open' ? 'assign to a staff member'
                  : focusedInt.status === 'assigned' ? 'mark in progress, then complete'
                  : focusedInt.status === 'in_progress' ? 'record outcome and complete'
                  : 'update and close';
                return (
                  <div className="flex items-start gap-3 bg-amber-50 border-2 border-amber-400 rounded-2xl px-5 py-4">
                    <ArrowRight className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-bold text-amber-900 mb-0.5">Arrived from the queue</div>
                      <p className="text-xs text-amber-800 leading-relaxed">
                        <span className="font-semibold">{focusedInt.action_type}</span> is why {(student?.name || '').split(' ')[0] || student?.name} is in the queue. To remove them: <span className="font-semibold">{stepLabel}</span>. The highlighted item below shows exactly what to do.
                      </p>
                    </div>
                    <button onClick={() => setHighlightedId(null)} className="p-1 rounded hover:bg-amber-100 text-amber-400 hover:text-amber-600 shrink-0 transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                );
              })()}

              {/* Confirmation toast */}
              {lastCreated && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
                    <div>
                      <div className="font-semibold text-emerald-800 text-sm mb-1">Action created and assigned</div>
                      <div className="text-xs text-emerald-700">{lastCreated.action_type} · {lastCreated.assigned_to} · Due {lastCreated.due_date || 'TBC'}</div>
                    </div>
                  </div>
                  <button onClick={() => setLastCreated(null)} className="p-1 rounded hover:bg-emerald-100 text-emerald-500 transition-colors shrink-0"><X className="w-4 h-4" /></button>
                </div>
              )}

              {/* Summary strip */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-slate-500">
                  <span className="font-semibold text-slate-800">{totalActions}</span> action{totalActions !== 1 ? 's' : ''} on record for this student
                </p>
                <button onClick={() => openAssignModal()} className="flex items-center gap-1.5 btn-primary text-xs px-3 py-1.5">
                  <Plus className="w-3.5 h-3.5" /> New Action
                </button>
              </div>

              {/* Awaiting Review — top priority */}
              <ActionSection title="Awaiting Review" icon={Flag} iconClass="text-orange-500" count={awaitingReviewActions.length} badge="bg-orange-100 text-orange-700" defaultOpen={true}>
                {awaitingReviewActions.map(i => <ActionRow key={i.id} i={i} showReviewButton={true} />)}
              </ActionSection>

              {/* Recommended — evidence-first workflow */}
              {recommendedActions.length > 0 && (
                <div className="card-premium overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                    <Target className="w-4 h-4 text-teal-600 shrink-0" />
                    <span className="text-sm font-bold text-slate-800">Requires Review</span>
                    <span className="text-xs bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full font-semibold">{recommendedActions.length}</span>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {recommendedActions.map((rec) => {
                      const Icon = REC_ICON[rec.icon_type];
                      const colors = REC_COLORS[rec.icon_type];
                      const ownerColors: Record<string, string> = {
                        dsl: 'bg-red-50 text-red-700 border-red-200',
                        sendco: 'bg-purple-50 text-purple-700 border-purple-200',
                        form_tutor: 'bg-blue-50 text-blue-700 border-blue-200',
                        subject_teacher: 'bg-amber-50 text-amber-700 border-amber-200',
                        hoy: 'bg-teal-50 text-teal-700 border-teal-200',
                        attendance: 'bg-orange-50 text-orange-700 border-orange-200',
                      };
                      const ownerBadge = rec.owner_role ? ownerColors[rec.owner_role] : 'bg-slate-50 text-slate-600 border-slate-200';
                      return (
                        <div key={rec.id} className={`px-5 py-4 ${colors.bg} transition-all duration-300 ${highlightedId === rec.id ? 'ring-2 ring-teal-400 ring-inset' : ''}`}>
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-xl ${colors.icon} shrink-0`}><Icon className="w-4 h-4" /></div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="font-semibold text-slate-900 text-sm">{rec.action_name}</span>
                                <PriorityBadge priority={rec.priority} />
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${ownerBadge}`}>{rec.suggested_owner}</span>
                              </div>
                              {rec.evidence_label && (
                                <div className="flex items-center gap-1 mb-1.5">
                                  <Eye className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span className="text-[11px] text-slate-500 font-medium">{rec.evidence_label}</span>
                                </div>
                              )}
                              <p className="text-xs text-slate-600 leading-relaxed mb-3 line-clamp-2">{rec.reason}</p>
                              <div className="flex items-center gap-2 flex-wrap">
                                <button
                                  onClick={() => setEvidenceModal({ rec, dismissReason: '', showDismissInput: false })}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
                                >
                                  <Eye className="w-3 h-3" /> Review evidence
                                </button>
                                <button
                                  onClick={() => setEvidenceModal({ rec, dismissReason: '', showDismissInput: true })}
                                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-white/60 text-xs font-medium transition-colors"
                                >
                                  <X className="w-3 h-3" /> Dismiss
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Open */}
              <ActionSection title="Open Actions" icon={ClipboardList} iconClass="text-blue-500" count={openActions.length} badge="bg-blue-100 text-blue-700" defaultOpen={true}>
                {openActions.map(i => <ActionRow key={i.id} i={i} />)}
              </ActionSection>

              {/* In Progress */}
              <ActionSection title="In Progress" icon={RefreshCw} iconClass="text-amber-500" count={inProgressActions.length} badge="bg-amber-100 text-amber-700" defaultOpen={true}>
                {inProgressActions.map(i => <ActionRow key={i.id} i={i} />)}
              </ActionSection>

              {/* Escalated — re-routed to another staff member */}
              <ActionSection title="Escalated" icon={AlertTriangle} iconClass="text-red-500" count={escalatedActions.length} badge="bg-red-100 text-red-700" defaultOpen={true}>
                {escalatedActions.map(i => <ActionRow key={i.id} i={i} />)}
              </ActionSection>

              {/* Suggested Next Step */}
              {nextStep && (
                <div className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-2xl p-5">
                  <div className="flex items-center gap-2 mb-3">
                    <Brain className="w-4 h-4 text-teal-400" />
                    <span className="text-xs font-bold text-teal-400 uppercase tracking-wider">Suggested Next Step</span>
                  </div>
                  {nextStep.previous && (
                    <div className="text-xs text-slate-400 mb-2">
                      Based on: <span className="text-slate-300 font-medium">{nextStep.previous}</span>
                      {nextStep.outcome && (
                        <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${nextStep.outcome === 'Escalating' ? 'bg-red-900/60 text-red-300' : nextStep.outcome === 'No Change' ? 'bg-slate-700 text-slate-400' : 'bg-emerald-900/60 text-emerald-300'}`}>
                          Outcome: {nextStep.outcome}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="text-base font-bold text-white mb-1">{nextStep.action}</div>
                  <p className="text-sm text-slate-300 leading-relaxed">{nextStep.reason}</p>
                </div>
              )}

              {/* Completed */}
              <ActionSection title="Completed Actions" icon={CheckCircle} iconClass="text-emerald-500" count={completedActions.length} badge="bg-emerald-100 text-emerald-700" defaultOpen={false}>
                {completedActions.map(i => <ActionRow key={i.id} i={i} />)}
              </ActionSection>

              {/* Dismissed / Cancelled */}
              <ActionSection title="Dismissed / Cancelled" icon={X} iconClass="text-slate-400" count={cancelledActions.length} badge="bg-slate-100 text-slate-500" defaultOpen={false}>
                {cancelledActions.map(i => <ActionRow key={i.id} i={i} />)}
              </ActionSection>

              {/* Dismissed Recommendations — always computable, survives page refresh */}
              {dismissedRecActions.length > 0 && (
                <div className="card-premium overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                    <X className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm font-bold text-slate-800">Dismissed Recommendations</span>
                    <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">{dismissedRecActions.length}</span>
                    <span className="ml-auto text-xs text-slate-400">Click Restore to re-activate</span>
                  </div>
                  <div className="divide-y divide-slate-50">
                    {dismissedRecActions.map(rec => {
                      const logEntry = reviewLog.find(e => e.recId === rec.id && !e.undone);
                      return (
                        <div key={rec.id} className="px-5 py-3.5 flex items-center gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-semibold text-slate-700">{rec.action_name}</div>
                            <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                              <span className="capitalize">{rec.suggested_owner}</span>
                              {logEntry?.action && <span className="px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-semibold capitalize">{logEntry.action}</span>}
                              {logEntry?.reason && logEntry.reason !== 'not_needed' && <span>· {logEntry.reason}</span>}
                              {logEntry?.timestamp && <span>· {new Date(logEntry.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>}
                            </div>
                          </div>
                          <button
                            onClick={() => { undoDismissal(rec.id); addToast(`${rec.action_name} restored to recommendations.`); }}
                            className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition-colors"
                          >
                            <RotateCcw className="w-3 h-3" /> Restore
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Review Log — permanent audit trail */}
              {reviewLog.length > 0 && (() => {
                const actionLabels: Record<ReviewLogEntry['action'], { label: string; badge: string; icon: React.ReactNode }> = {
                  reviewed:  { label: 'Marked reviewed',    badge: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> },
                  actioned:  { label: 'Action created',     badge: 'bg-blue-100 text-blue-700 border-blue-200',           icon: <ClipboardList className="w-3.5 h-3.5 text-blue-600" /> },
                  escalated: { label: 'Escalated',          badge: 'bg-red-100 text-red-700 border-red-200',              icon: <AlertTriangle className="w-3.5 h-3.5 text-red-600" /> },
                  dismissed: { label: 'Dismissed',          badge: 'bg-slate-100 text-slate-600 border-slate-200',        icon: <X className="w-3.5 h-3.5 text-slate-500" /> },
                };
                return (
                  <div className="card-premium overflow-hidden">
                    <button
                      onClick={() => {}}
                      className="w-full px-5 py-4 border-b border-slate-100 flex items-center gap-2 cursor-default"
                    >
                      <RotateCcw className="w-4 h-4 text-slate-500 shrink-0" />
                      <span className="text-sm font-bold text-slate-800">Review Log</span>
                      <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">{reviewLog.length}</span>
                      <span className="ml-auto text-xs text-slate-400">All recommendation actions — permanent audit trail</span>
                    </button>
                    <div className="divide-y divide-slate-100">
                      {reviewLog.map((entry) => {
                        const cfg = actionLabels[entry.action];
                        const timeStr = new Date(entry.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                        return (
                          <div key={entry.id} className={`px-5 py-3 flex items-center gap-3 ${entry.undone ? 'opacity-50' : ''}`}>
                            <div className="shrink-0">{cfg.icon}</div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-semibold text-slate-800">{entry.recName}</span>
                                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${cfg.badge}`}>
                                  {entry.undone ? 'Undone' : cfg.label}
                                </span>
                              </div>
                              <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                                <span>{timeStr}</span>
                                {entry.owner && <span>· {entry.owner}</span>}
                                {entry.reason && <span>· {entry.reason}</span>}
                              </div>
                            </div>
                            {!entry.undone && (
                              <button
                                onClick={() => undoDismissal(entry.recId)}
                                className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition-colors"
                              >
                                <RotateCcw className="w-3 h-3" /> Undo
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Empty state */}
              {totalActions === 0 && recommendedActions.length === 0 && (
                <div className="card-premium flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                  <ClipboardList className="w-10 h-10 text-slate-200" />
                  <p className="text-sm font-medium">No actions on record yet</p>
                  <p className="text-xs text-slate-400 text-center max-w-xs">Assign an action from the Patterns tab, or use the button above to create one manually.</p>
                </div>
              )}

              {/* Outcome modal */}
              {outcomeModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOutcomeModal(null)} />
                  <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
                    <h3 className="text-lg font-semibold text-slate-900 mb-4">Add outcome</h3>
                    <textarea value={outcomeText} onChange={(e) => { setOutcomeText(e.target.value); setOutcomeSgDismissed(false); setOutcomeSgAccepted(false); }} className="input-premium w-full" rows={4} placeholder="What happened? What was agreed? Any next steps..." autoFocus />
                    {(() => {
                      const sgDetection = !outcomeSgDismissed && outcomeText.trim().length >= 8 ? detectSafeguarding(outcomeText) : null;
                      return sgDetection ? (
                        <div className="mt-2">
                          <SafeguardingAlert
                            detection={sgDetection}
                            accepted={outcomeSgAccepted}
                            onAccept={(_dslName, _actionType, _priority) => { setOutcomeSgAccepted(true); }}
                            onDismiss={!outcomeSgAccepted ? () => setOutcomeSgDismissed(true) : undefined}
                          />
                        </div>
                      ) : null;
                    })()}
                    <div className="flex gap-3 mt-4">
                      <button onClick={() => addOutcome(outcomeModal.id, outcomeText)} disabled={!outcomeText.trim()} className="btn-primary flex-1">Save outcome &amp; mark complete</button>
                      <button onClick={() => setOutcomeModal(null)} className="btn-secondary">Cancel</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── TIMELINE TAB ── */}
        {activeTab === 'timeline' && (() => {
          const FILTER_OPTIONS = [
            { id: 'all', label: 'All' },
            { id: 'Recognition', label: 'Recognitions' },
            { id: 'Actions', label: 'Actions' },
            { id: 'Communication', label: 'Communications' },
            { id: 'Behaviour', label: 'Behaviour' },
            { id: 'Note', label: 'Notes' },
            { id: 'Safeguarding', label: 'Safeguarding' },
            { id: 'Outcome', label: 'Outcomes' },
            { id: 'Careers', label: 'Careers' },
            { id: 'Escalation', label: 'Escalations' },
            { id: 'Signal', label: 'Signals' },
          ] as const;

          type FilterId = typeof FILTER_OPTIONS[number]['id'];

          const TYPE_TO_FILTER: Record<TimelineEvent['type'], FilterId> = {
            intervention: 'Actions',
            review: 'Actions',
            outcome: 'Outcome',
            behaviour: 'Behaviour',
            pastoral: 'Behaviour',
            attendance: 'Behaviour',
            communication: 'Communication',
            note: 'Note',
            safeguarding: 'Safeguarding',
            send: 'Note',
            signal: 'Signal',
            success: 'Recognition',
            neet: 'Careers',
            career: 'Careers',
            escalation: 'Escalation',
          };

          const TYPE_CONFIG: Record<TimelineEvent['type'], { dot: string; icon: React.ComponentType<{ className?: string }>; label: string }> = {
            signal:       { dot: 'bg-purple-500', icon: Brain,         label: 'Signal' },
            intervention: { dot: 'bg-blue-500',   icon: ClipboardList, label: 'Action' },
            review:       { dot: 'bg-sky-500',     icon: Eye,           label: 'Review' },
            outcome:      { dot: 'bg-emerald-500', icon: CheckCircle,   label: 'Outcome' },
            behaviour:    { dot: 'bg-red-500',     icon: AlertTriangle, label: 'Behaviour' },
            pastoral:     { dot: 'bg-orange-500',  icon: ShieldAlert,   label: 'Pastoral' },
            attendance:   { dot: 'bg-amber-500',   icon: Clock,         label: 'Attendance' },
            communication:{ dot: 'bg-teal-500',    icon: MessageSquare, label: 'Communication' },
            note:         { dot: 'bg-slate-500',   icon: StickyNote,    label: 'Note' },
            safeguarding: { dot: 'bg-red-700',     icon: ShieldAlert,   label: 'Safeguarding' },
            send:         { dot: 'bg-violet-500',  icon: Brain,         label: 'SEND' },
            success:      { dot: 'bg-amber-400',   icon: Star,          label: 'Recognition' },
            neet:         { dot: 'bg-amber-600',   icon: GraduationCap, label: 'NEET Update' },
            career:       { dot: 'bg-emerald-600', icon: GraduationCap, label: 'Career' },
            escalation:   { dot: 'bg-red-600',     icon: Flag,          label: 'Escalation' },
          };

          const SEVERITY_RING: Record<string, string> = {
            high:   'border-red-200 bg-red-50',
            medium: 'border-amber-200 bg-amber-50',
            low:    'border-slate-200 bg-white',
          };

          // deduplicate: safeguarding records already from behaviour — avoid double render
          const seen = new Set<string>();
          const deduped = timeline.filter((e) => {
            const key = `${e.type}:${e.date}:${e.title.slice(0, 30)}`;
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });

          return (
            <TimelineTab
              timeline={deduped}
              filterOptions={FILTER_OPTIONS}
              typeToFilter={TYPE_TO_FILTER}
              typeConfig={TYPE_CONFIG}
              severityRing={SEVERITY_RING}
              onAddNote={() => setShowQuickNote(true)}
            />
          );
        })()}

        {/* ── PATTERNS TAB ── */}
        {activeTab === 'patterns' && (
          <PatternEngine
            student={student}
            behaviour={behaviour}
            analysis={analysis}
            interventions={interventions}
            quickNotes={quickNotes}
            career={career}
            onActivity={(entry) => setActivityFeed(prev => [entry, ...prev])}
          />
        )}

        {/* ── NOTES TAB ── */}
        {activeTab === 'notes' && (() => {
          const visibleTypes = getVisibleNoteTypes(profile?.role);
          const visibleNotes = quickNotes.filter(qn => {
            const v = qn.visibility || 'general';
            return visibleTypes.includes(v);
          });
          return (
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-800">Staff notes</h3>
                <p className="text-xs text-slate-500 mt-0.5">Observations logged by staff — these inform the student's signal</p>
              </div>
              <button onClick={() => setShowQuickNote(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add note</button>
            </div>
            {visibleNotes.length === 0 ? (
              <div className="card-premium flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
                <StickyNote className="w-10 h-10 text-slate-200" />
                <p className="text-sm">No notes visible for your role.</p>
                <button onClick={() => setShowQuickNote(true)} className="text-sm text-teal-600 hover:text-teal-700 font-medium">Add the first note</button>
              </div>
            ) : (
              <div className="space-y-3">
                {visibleNotes.map((qn) => {
                  const levelColors: Record<number, string> = { 1: 'bg-slate-50 border-slate-200', 2: 'bg-blue-50 border-blue-200', 3: 'bg-amber-50 border-amber-200', 4: 'bg-orange-50 border-orange-200', 5: 'bg-red-50 border-red-200' };
                  const levelTextColor: Record<number, string> = { 1: 'text-slate-600', 2: 'text-blue-700', 3: 'text-amber-700', 4: 'text-orange-700', 5: 'text-red-700' };
                  const VISIBILITY_LABELS: Record<string, string> = { dsl_only: 'DSL Only', slt_only: 'SLT Only', send: 'SEND', pastoral: 'Pastoral' };
                  const visLabel = qn.visibility && qn.visibility !== 'general' ? VISIBILITY_LABELS[qn.visibility] : null;
                  return (
                    <div key={qn.id} className={`rounded-2xl border p-5 ${levelColors[qn.concern_level] || 'bg-slate-50 border-slate-200'}`}>
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 px-2 py-0.5 rounded-full">{qn.category}</span>
                          <span className={`text-xs font-bold ${levelTextColor[qn.concern_level]}`}>Concern: {qn.concern_level}/5</span>
                          {visLabel && (
                            <span className="text-[10px] font-semibold bg-slate-700 text-white px-2 py-0.5 rounded-full">{visLabel}</span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-xs font-medium text-slate-600">{qn.staff_member}</div>
                          <div className="text-xs text-slate-400">{new Date(qn.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                        </div>
                      </div>
                      <p className={`text-sm leading-relaxed ${levelTextColor[qn.concern_level]}`}>{qn.note}</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          );
        })()}

        {/* ── BEHAVIOUR TAB ── */}
        {activeTab === 'behaviour' && (
          <BehaviourIntelligence
            behaviour={behaviour}
            interventions={interventions}
            student={student}
          />
        )}

        {/* ── ATTENDANCE TAB ── */}
        {activeTab === 'attendance' && (
          <div className="card-premium p-6">
            <h3 className="text-base font-bold text-slate-800 mb-6">Attendance Overview</h3>
            <div className="grid sm:grid-cols-3 gap-4 mb-6">
              <div className="stat-card text-center">
                <div className={`text-3xl font-extrabold ${(student.attendance_pct || 0) < 80 ? 'text-red-600' : (student.attendance_pct || 0) < 90 ? 'text-amber-600' : 'text-emerald-600'}`}>{student.attendance_pct ?? 95}%</div>
                <div className="text-xs text-slate-500 mt-1 font-medium">Current attendance</div>
              </div>
              <div className="stat-card text-center">
                <div className="text-3xl font-extrabold text-slate-800">{behaviour.filter((b) => b.incident_type === 'Late').length}</div>
                <div className="text-xs text-slate-500 mt-1 font-medium">Lates this term</div>
              </div>
              <div className="stat-card text-center">
                <div className="text-3xl font-extrabold text-slate-800">{behaviour.filter((b) => b.incident_type === 'Isolation' || b.incident_type === 'Removal').length}</div>
                <div className="text-xs text-slate-500 mt-1 font-medium">Removals/isolations</div>
              </div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-5">
              <div className="flex items-start gap-3">
                <div className="p-1.5 rounded-lg bg-amber-100"><TrendingDown className="w-5 h-5 text-amber-600" /></div>
                <div>
                  <div className="text-sm font-bold text-amber-800">Attendance trend</div>
                  <div className="text-sm text-amber-700 mt-0.5">{analysis?.attendance_trend || 'Unknown'}</div>
                  <div className="text-xs text-amber-600 mt-1 font-medium">{student.attendance_pct && student.attendance_pct < 90 ? 'Below 90% target. Recommend attendance meeting and parent contact.' : 'Attendance is on target.'}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── SEND TAB ── */}
        {activeTab === 'send' && hasPermission(currentRole, 'view_send') && (
          <div className="card-premium p-6">
            <h3 className="text-base font-bold text-slate-800 mb-5">SEND and Context</h3>
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-xl bg-purple-50 border border-purple-100">
                <div className="p-1.5 rounded-lg bg-purple-100"><Brain className="w-5 h-5 text-purple-600" /></div>
                <div>
                  <div className="text-sm font-bold text-purple-800">SEND Status</div>
                  <div className="text-sm text-purple-700 mt-0.5">{student.send_status || 'No SEND status recorded'}</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl bg-slate-50 border border-slate-100">
                <div className="p-1.5 rounded-lg bg-slate-100"><User className="w-5 h-5 text-slate-600" /></div>
                <div>
                  <div className="text-sm font-bold text-slate-800">Pupil Premium</div>
                  <div className="text-sm text-slate-700 mt-0.5">{student.pupil_premium ? 'Yes' : 'No'}</div>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-100">
                <div className="p-1.5 rounded-lg bg-amber-100"><AlertTriangle className="w-5 h-5 text-amber-600" /></div>
                <div>
                  <div className="text-sm font-bold text-amber-800">Vulnerability Indicators</div>
                  <div className="text-sm text-amber-700 mt-0.5">
                    {student.pupil_premium && 'Pupil Premium · '}
                    {student.send_status && 'SEN support identified · '}
                    {analysis?.attendance_trend === 'Declining' && 'Attendance declining · '}
                    {analysis?.behaviour_trend === 'Escalating' && 'Behaviour escalating'}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── CAREERS TAB ── */}
        {activeTab === 'careers' && (
          <div className="space-y-5">
            {/* Detected NEET / Destination Risk */}
            {(() => {
              const LEVEL_CFG = {
                'Low':       { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-800', badge: 'bg-emerald-100 text-emerald-700', dot: 'bg-emerald-500' },
                'Medium':    { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-800',   badge: 'bg-amber-100 text-amber-700',   dot: 'bg-amber-500' },
                'At Risk':   { bg: 'bg-orange-50',  border: 'border-orange-200',  text: 'text-orange-800',  badge: 'bg-orange-100 text-orange-700',  dot: 'bg-orange-500' },
                'High Risk': { bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-800',     badge: 'bg-red-100 text-red-700',        dot: 'bg-red-500' },
              };
              const cfg = LEVEL_CFG[neetRisk.level];
              const WEIGHT_CFG = { high: 'text-red-600 bg-red-50 border-red-200', medium: 'text-amber-600 bg-amber-50 border-amber-200', low: 'text-slate-600 bg-slate-50 border-slate-200' };
              return (
                <div className={`card-premium p-5 ${cfg.bg} ${cfg.border}`}>
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">System-detected NEET / Destination Risk</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className={`text-2xl font-bold ${cfg.text}`}>{neetRisk.level}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold border ${cfg.badge}`}>Risk score: {neetRisk.score}/100</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Calculated from attendance, behaviour, SEND, career data and intervention history. Not manually assigned.</p>
                    </div>
                    <button
                      onClick={() => { setNeetOverrideModal(true); setNeetOverrideForm({ level: neetRisk.level, reason: '' }); }}
                      className="btn-secondary text-xs shrink-0"
                    >
                      <Edit className="w-3 h-3" /> Override
                    </button>
                  </div>

                  {neetRisk.indicators.length > 0 && (
                    <div className="space-y-1.5 mb-4">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Detected risk indicators</div>
                      {neetRisk.indicators.map((ind, i) => (
                        <div key={i} className={`flex items-start gap-2 px-3 py-2 rounded-lg border text-xs ${WEIGHT_CFG[ind.weight]}`}>
                          <span className="font-semibold shrink-0">{ind.label}</span>
                          <span className="text-slate-500">— {ind.detail}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {neetRisk.suggestedActions.length > 0 && (
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Suggested career actions</div>
                      <div className="flex flex-wrap gap-2">
                        {neetRisk.suggestedActions.map((action) => (
                          <button
                            key={action}
                            onClick={() => {
                              setAssignModal({ action_type: 'Careers guidance meeting', reason: action, suggested_owner: 'Careers Advisor', priority: neetRisk.level === 'High Risk' ? 'urgent' : neetRisk.level === 'At Risk' ? 'high' : 'medium', review_weeks: 4 });
                              setAssignForm({ action_type: 'Careers guidance meeting', assigned_to: 'Careers Advisor', assigned_role: 'Careers Advisor', notes: action, due_date: addWeeks(2), review_date: addWeeks(4), priority: neetRisk.level === 'High Risk' ? 'urgent' : neetRisk.level === 'At Risk' ? 'high' : 'medium' });
                            }}
                            className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs font-semibold text-slate-700 hover:border-teal-400 hover:text-teal-700 transition-colors flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> {action}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {neetRisk.indicators.length === 0 && (
                    <p className="text-sm text-emerald-700 font-medium">No NEET risk indicators detected from available data.</p>
                  )}
                </div>
              );
            })()}

            {/* Staff-entered career profile */}
            <div className="card-premium overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Staff-entered Career Profile</h3>
                  <p className="text-xs text-slate-400 mt-0.5">Notes and observations entered by staff — supplements the system-detected risk above</p>
                </div>
                <button onClick={() => setEditingCareer(!editingCareer)} className="btn-secondary text-xs">
                  {editingCareer ? <><X className="w-3 h-3" /> Cancel</> : <><Edit className="w-3 h-3" /> Edit</>}
                </button>
              </div>

              {editingCareer ? (
                <div className="p-5 space-y-4">
                  {[
                    { label: 'Career interests (comma-separated)', key: 'career_interests' as const, type: 'chips' },
                    { label: 'Preferred subjects', key: 'preferred_subjects' as const, type: 'chips' },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">{label}</label>
                      <input type="text" value={(careerForm[key] as string[] || []).join(', ')} onChange={(e) => setCareerForm({ ...careerForm, [key]: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className="input-premium" placeholder="e.g. Engineering, Art, Music" />
                    </div>
                  ))}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Strengths', key: 'strengths' as const },
                      { label: 'Barriers', key: 'barriers' as const },
                    ].map(({ label, key }) => (
                      <div key={key}>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">{label}</label>
                        <textarea value={careerForm[key] || ''} onChange={(e) => setCareerForm({ ...careerForm, [key]: e.target.value })} className="input-premium" rows={2} />
                      </div>
                    ))}
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Confidence level</label>
                      <select value={careerForm.confidence_level || ''} onChange={(e) => setCareerForm({ ...careerForm, confidence_level: e.target.value })} className="input-premium">
                        <option value="">Not assessed</option>
                        {['High', 'Medium', 'Low'].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Post-16 destination status</label>
                      <select value={careerForm.destination_risk || ''} onChange={(e) => setCareerForm({ ...careerForm, destination_risk: e.target.value })} className="input-premium">
                        <option value="">Not yet determined</option>
                        {['On track', 'Destination confirmed', 'Application in progress', 'Undecided', 'At risk of NEET', 'High risk of NEET'].map((v) => <option key={v} value={v}>{v}</option>)}
                      </select>
                    </div>
                  </div>
                  {[
                    { label: 'Suggested pathways (comma-separated)', key: 'suggested_pathways' as const },
                    { label: 'Useful signposting (comma-separated)', key: 'useful_signposting' as const },
                  ].map(({ label, key }) => (
                    <div key={key}>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">{label}</label>
                      <input type="text" value={(careerForm[key] as string[] || []).join(', ')} onChange={(e) => setCareerForm({ ...careerForm, [key]: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} className="input-premium" />
                    </div>
                  ))}
                  <button onClick={saveCareer} className="btn-primary"><Save className="w-4 h-4" /> Save career profile</button>
                </div>
              ) : career ? (
                <div className="p-5 space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    {[
                      { label: 'Career interests', value: career.career_interests?.join(', ') || '—' },
                      { label: 'Preferred subjects', value: career.preferred_subjects?.join(', ') || '—' },
                      { label: 'Confidence level', value: career.confidence_level || 'Not assessed' },
                      { label: 'Destination status', value: career.destination_risk || 'Not yet determined', color: career.destination_risk?.includes('risk') || career.destination_risk?.includes('NEET') ? 'text-red-600 font-bold' : career.destination_risk === 'On track' || career.destination_risk === 'Destination confirmed' ? 'text-emerald-700 font-bold' : undefined },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="bg-slate-50 rounded-xl p-3.5">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
                        <div className={`text-sm font-semibold ${color || 'text-slate-800'}`}>{value}</div>
                      </div>
                    ))}
                  </div>
                  {[
                    { label: 'Strengths', value: career.strengths },
                    { label: 'Barriers', value: career.barriers },
                  ].filter(r => r.value).map(({ label, value }) => (
                    <div key={label} className="bg-slate-50 rounded-xl p-3.5">
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{label}</div>
                      <div className="text-sm text-slate-700">{value}</div>
                    </div>
                  ))}
                  {(career.suggested_pathways?.length || career.useful_signposting?.length) ? (
                    <div className="grid sm:grid-cols-2 gap-4">
                      {[
                        { label: 'Suggested pathways', items: career.suggested_pathways },
                        { label: 'Signposting provided', items: career.useful_signposting },
                      ].map(({ label, items }) => items?.length ? (
                        <div key={label} className="bg-slate-50 rounded-xl p-3.5">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</div>
                          <div className="flex flex-wrap gap-1.5">
                            {items.map((p, i) => <span key={i} className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 font-medium">{p}</span>)}
                          </div>
                        </div>
                      ) : null)}
                    </div>
                  ) : null}
                  {!career.career_interests?.length && !career.strengths && !career.barriers && (
                    <p className="text-sm text-slate-400 text-center py-4">No staff notes recorded yet. Click Edit to add career profile details.</p>
                  )}
                </div>
              ) : (
                <div className="p-5 text-center py-8">
                  <GraduationCap className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No career profile yet.</p>
                  <button onClick={() => setEditingCareer(true)} className="btn-primary mt-3 text-sm"><Plus className="w-3.5 h-3.5" /> Create career profile</button>
                </div>
              )}
            </div>

            {/* Career actions linked to this student */}
            {(() => {
              const careerActions = interventions.filter(i => i.action_type?.toLowerCase().includes('career') || i.action_type?.toLowerCase().includes('destination') || i.action_type === 'Careers guidance meeting');
              if (careerActions.length === 0) return null;
              return (
                <div className="card-premium overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-100">
                    <h3 className="text-sm font-bold text-slate-800">Linked Career Actions</h3>
                    <p className="text-xs text-slate-400 mt-0.5">{careerActions.filter(i => !['completed','closed'].includes(i.status)).length} open · {careerActions.filter(i => ['completed','closed'].includes(i.status)).length} completed</p>
                  </div>
                  <div className="divide-y divide-slate-100">
                    {careerActions.map(i => (
                      <div key={i.id} className="px-5 py-3 flex items-center gap-3">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${['completed','closed'].includes(i.status) ? 'bg-emerald-400' : i.priority === 'urgent' ? 'bg-red-400' : 'bg-teal-400'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold text-slate-800 truncate">{i.action_type}</div>
                          <div className="text-[10px] text-slate-400">{i.assigned_to} · {i.status.replace(/_/g, ' ')}</div>
                        </div>
                        {i.outcome && <span className="text-[10px] text-emerald-600 font-medium shrink-0">Outcome recorded</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── EVIDENCE REVIEW MODAL ── */}
      {evidenceModal && (() => {
        const { rec, dismissReason, showDismissInput } = evidenceModal;
        const severityColors = { high: 'bg-red-50 border-red-200 text-red-800', medium: 'bg-amber-50 border-amber-200 text-amber-800', low: 'bg-slate-50 border-slate-200 text-slate-700' };
        const evidenceTypeIcon: Record<string, string> = {
          safeguarding_note: 'Safeguarding note',
          send_record: 'SEND record',
          behaviour: 'Behaviour data',
          attendance: 'Attendance data',
          analysis: 'Analysis output',
          staff_note: 'Staff note',
        };
        const ownerColors: Record<string, string> = {
          dsl: 'bg-red-50 text-red-700 border-red-200',
          sendco: 'bg-purple-50 text-purple-700 border-purple-200',
          form_tutor: 'bg-blue-50 text-blue-700 border-blue-200',
          subject_teacher: 'bg-amber-50 text-amber-700 border-amber-200',
          hoy: 'bg-teal-50 text-teal-700 border-teal-200',
          attendance: 'bg-orange-50 text-orange-700 border-orange-200',
        };
        const ownerBadge = rec.owner_role ? ownerColors[rec.owner_role] : 'bg-slate-50 text-slate-600 border-slate-200';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
            <div className="relative z-10 bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="text-lg font-bold text-slate-900">{rec.action_name}</h3>
                    <PriorityBadge priority={rec.priority} />
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-xs text-slate-500">
                    <span className={`px-2 py-0.5 rounded-full border font-semibold text-[11px] ${ownerBadge}`}>{rec.suggested_owner}</span>
                    {rec.evidence_type && (
                      <span className="flex items-center gap-1"><Eye className="w-3 h-3" />{evidenceTypeIcon[rec.evidence_type] || rec.evidence_type}</span>
                    )}
                  </div>
                </div>
                <button onClick={() => setEvidenceModal(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 shrink-0"><X className="w-5 h-5" /></button>
              </div>

              {/* Source evidence */}
              <div className="px-6 pt-5 pb-4">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Source evidence</div>
                {rec.evidence_items && rec.evidence_items.length > 0 ? (
                  <div className="space-y-2">
                    {rec.evidence_items.map((item, i) => (
                      <div key={i} className={`flex items-start justify-between gap-3 px-4 py-3 rounded-xl border text-sm ${severityColors[item.severity || 'low']}`}>
                        <span className="font-medium shrink-0">{item.label}</span>
                        <span className="text-right leading-snug">{item.value}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm text-slate-600">{rec.reason}</div>
                )}
              </div>

              {/* Dismiss reason input */}
              {showDismissInput && (
                <div className="px-6 pb-4">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Reason for dismissing</label>
                  <input
                    type="text"
                    value={dismissReason}
                    onChange={e => setEvidenceModal(m => m ? { ...m, dismissReason: e.target.value } : null)}
                    placeholder="e.g. already actioned, not applicable, discussed with student..."
                    className="input-premium w-full"
                    autoFocus
                  />
                </div>
              )}

              {/* Action buttons */}
              <div className="px-6 py-5 border-t border-slate-100 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleEvidenceAction('reviewed', rec)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 transition-colors"
                  >
                    <CheckCircle className="w-4 h-4" /> Mark reviewed
                  </button>
                  <button
                    onClick={() => handleEvidenceAction('create_action', rec)}
                    className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> Create action
                  </button>
                </div>
                {rec.owner_role === 'dsl' && (
                  <button
                    onClick={() => handleEvidenceAction('escalate', rec)}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors"
                  >
                    <AlertTriangle className="w-4 h-4" /> Escalate to DSL
                  </button>
                )}
                {!showDismissInput ? (
                  <button
                    onClick={() => setEvidenceModal(m => m ? { ...m, showDismissInput: true } : null)}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-50 text-sm font-medium transition-colors"
                  >
                    <X className="w-4 h-4" /> Dismiss with reason
                  </button>
                ) : (
                  <button
                    onClick={() => handleEvidenceAction('dismiss', rec, dismissReason)}
                    disabled={!dismissReason.trim()}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-semibold hover:bg-slate-200 transition-colors disabled:opacity-40"
                  >
                    <X className="w-4 h-4" /> Confirm dismiss
                  </button>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── ACTION PATH MODAL ── */}
      {actionPathModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setActionPathModal(null)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            {/* AI recommendation header */}
            <div className="bg-slate-900 rounded-t-2xl px-6 py-4 flex items-start gap-3">
              <div className="w-8 h-8 rounded-xl bg-teal-500/20 flex items-center justify-center shrink-0 mt-0.5">
                <Brain className="w-4 h-4 text-teal-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold text-teal-400 uppercase tracking-widest">AI Recommended Action</span>
                </div>
                <h3 className="text-base font-bold text-white leading-tight">{actionPathModal.action_type}</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Priority: <span className={`font-bold ${actionPathModal.priority === 'urgent' ? 'text-red-400' : actionPathModal.priority === 'high' ? 'text-orange-400' : 'text-slate-300'}`}>{actionPathModal.priority}</span>
                  {actionPathModal.suggested_owner && <> · Suggested owner: <span className="text-slate-300 font-semibold">{actionPathModal.suggested_owner}</span></>}
                </p>
              </div>
              <button onClick={() => setActionPathModal(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white shrink-0"><X className="w-4 h-4" /></button>
            </div>
            {actionPathModal.reason && (
              <div className="mx-6 mt-5 p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1">Why this action is needed</div>
                <p className="text-sm text-slate-700 leading-relaxed">{actionPathModal.reason}</p>
              </div>
            )}
            <div className="px-6 py-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Choose how to action this</p>
              <div className="space-y-3">
              <button
                onClick={() => handleActionPathChoice(actionPathModal, 'self')}
                className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-slate-900 bg-slate-900 text-white hover:bg-slate-800 transition-colors text-left"
              >
                <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
                  <CheckCircle className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-sm">I'll action this myself</div>
                  <div className="text-xs text-slate-400 mt-0.5">Record that you carried out this action and log the outcome — e.g. pastoral meeting held, parent called.</div>
                </div>
              </button>
              {profile?.role === 'dsl' ? (
                <button
                  onClick={() => { setActionPathModal(null); openEscalationModal(actionPathModal as unknown as Intervention); }}
                  className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-red-200 bg-red-50 text-red-800 hover:border-red-400 hover:bg-red-100 transition-colors text-left"
                >
                  <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                    <ArrowRight className="w-5 h-5 text-red-600" />
                  </div>
                  <div>
                    <div className="font-bold text-sm">Escalate to SLT or external agency</div>
                    <div className="text-xs text-red-600 mt-0.5">Refer upward — SLT, MASH, police, social care, or CAMHS.</div>
                  </div>
                </button>
              ) : (
              <button
                onClick={() => handleActionPathChoice(actionPathModal, 'assign')}
                className="w-full flex items-start gap-4 p-4 rounded-xl border-2 border-slate-200 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 transition-colors text-left"
              >
                <div className="mt-0.5 shrink-0 w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center">
                  <ArrowRight className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <div className="font-bold text-sm">Assign to a staff member</div>
                  <div className="text-xs text-slate-500 mt-0.5">Delegate this action to another member of staff with a due date and review date.</div>
                </div>
              </button>
              )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ASSIGN MODAL ── */}
      {assignModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setAssignModal(null)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Assign Action</h3>
                <p className="text-xs text-slate-500 mt-0.5">{assignModal.action_type}</p>
              </div>
              <button onClick={() => setAssignModal(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>

            {/* Smart recommendation banner */}
            {(() => {
              const owner = assignModal.suggested_owner;
              const mappedStaff = mapOwnerToStaffName(owner);
              const myRole = profile?.role || '';
              const myName = profile?.full_name || '';

              // Determine if current user IS the recommended owner
              const isSelf = (
                (owner === 'DSL' && myRole === 'dsl') ||
                (owner === 'SENCO' && myRole === 'sendco') ||
                (owner === 'Head of Year' && myRole === 'head_of_year') ||
                (owner === 'Form Tutor' && myRole === 'tutor') ||
                (owner === 'Careers Advisor' && myRole === 'careers_lead') ||
                (mappedStaff && myName && mappedStaff.toLowerCase().includes(myName.split(' ')[1]?.toLowerCase() || ''))
              );

              // Build context string based on student data
              const contextParts: string[] = [];
              if (student?.send_status) contextParts.push(`${student.name} has ${student.send_status}`);
              if ((student?.attendance_pct ?? 100) < 85) contextParts.push(`attendance is ${student?.attendance_pct}%`);
              if ((student?.behaviour_score ?? 0) > 20) contextParts.push(`${student?.behaviour_score} behaviour points`);
              if (assignModal.action_type === 'Safeguarding referral') contextParts.push('safeguarding concern flagged');
              if (assignModal.action_type === 'EHCP emergency review') contextParts.push('EHCP provision needs review');

              const contextStr = contextParts.length > 0 ? contextParts.join(', ') : assignModal.reason?.split('.')[0] || '';

              return (
                <div className={`mx-6 mt-5 p-4 rounded-xl border ${isSelf ? 'bg-teal-50 border-teal-200' : 'bg-blue-50 border-blue-200'}`}>
                  <div className={`text-[10px] font-bold uppercase tracking-widest mb-1 ${isSelf ? 'text-teal-600' : 'text-blue-500'}`}>
                    System Recommendation
                  </div>
                  {contextStr && (
                    <p className={`text-xs mb-1.5 ${isSelf ? 'text-teal-800' : 'text-blue-900'}`}>
                      {contextStr ? `Based on: ${contextStr}.` : ''}
                    </p>
                  )}
                  {isSelf ? (
                    <p className="text-sm font-bold text-teal-800">
                      You are the {owner} — you can handle this yourself rather than reassigning.
                    </p>
                  ) : mappedStaff ? (
                    <p className={`text-sm font-semibold ${isSelf ? 'text-teal-800' : 'text-blue-800'}`}>
                      Recommended owner: <span className="font-bold">{mappedStaff}</span> ({owner})
                    </p>
                  ) : null}
                </div>
              );
            })()}

            {assignModal.reason && (
              <div className="mx-6 mt-4 p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Signal evidence</div>
                <p className="text-sm text-slate-700">{assignModal.reason}</p>
              </div>
            )}
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Action type</label>
                <select value={assignForm.action_type} onChange={(e) => setAssignForm({ ...assignForm, action_type: e.target.value })} className="input-premium">
                  {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Assign to <span className="text-red-500">*</span></label>
                <select value={assignForm.assigned_to} onChange={(e) => setAssignForm({ ...assignForm, assigned_to: e.target.value })} className={`input-premium ${!assignForm.assigned_to ? 'border-red-200' : ''}`}>
                  <option value="">Select staff member...</option>
                  {DEMO_STAFF.map(s => (
                    <option key={s.name} value={s.name}>{s.name} — {s.role}</option>
                  ))}
                </select>
                {!assignForm.assigned_to && (
                  <p className="text-[10px] text-red-500 mt-1">Required — select who will own this action.</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Priority</label>
                  <select value={assignForm.priority} onChange={(e) => setAssignForm({ ...assignForm, priority: e.target.value as any })} className="input-premium">
                    {['low', 'medium', 'high', 'urgent'].map((p) => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Due date</label>
                  <input type="date" value={assignForm.due_date} onChange={(e) => setAssignForm({ ...assignForm, due_date: e.target.value })} className="input-premium" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Review date <span className="text-slate-400 normal-case font-normal">(suggested: {assignModal.review_weeks} week{assignModal.review_weeks > 1 ? 's' : ''})</span></label>
                <input type="date" value={assignForm.review_date} onChange={(e) => setAssignForm({ ...assignForm, review_date: e.target.value })} className="input-premium" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea value={assignForm.notes} onChange={(e) => { setAssignForm({ ...assignForm, notes: e.target.value }); setAssignSgDismissed(false); setAssignSgAccepted(false); }} className="input-premium" rows={3} placeholder="Context, agreed approach, or any concerns..." />
              </div>
              {(() => {
                const sgDetection = !assignSgDismissed && assignForm.notes.trim().length >= 8 ? detectSafeguarding(assignForm.notes) : null;
                return sgDetection ? (
                  <SafeguardingAlert
                    detection={sgDetection}
                    accepted={assignSgAccepted}
                    onAccept={(dslName, _actionType, _priority) => {
                      setAssignForm(f => ({ ...f, assigned_to: dslName, priority: 'urgent' }));
                      setAssignSgAccepted(true);
                    }}
                    onDismiss={!assignSgAccepted ? () => setAssignSgDismissed(true) : undefined}
                  />
                ) : null;
              })()}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Expected outcome <span className="text-slate-400 normal-case font-normal">(optional)</span></label>
                <select
                  value={(assignForm as any).expected_outcome || ''}
                  onChange={(e) => setAssignForm({ ...assignForm, ...{ expected_outcome: e.target.value } } as any)}
                  className="input-premium"
                >
                  <option value="">Select expected outcome...</option>
                  <option value="Improved attendance">Improved attendance</option>
                  <option value="Reduced behaviour incidents">Reduced behaviour incidents</option>
                  <option value="Improved engagement">Improved engagement</option>
                  <option value="Parental/carer engagement">Parental/carer engagement</option>
                  <option value="SEND needs addressed">SEND needs addressed</option>
                  <option value="Safeguarding concern resolved">Safeguarding concern resolved</option>
                  <option value="Student re-engaged">Student re-engaged</option>
                  <option value="Careers pathway identified">Careers pathway identified</option>
                  <option value="Escalation prevented">Escalation prevented</option>
                  <option value="Monitoring only">Monitoring only</option>
                </select>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={submitAssign} disabled={!assignForm.assigned_to.trim()} className="btn-primary flex-1">
                <CheckCircle className="w-4 h-4" /> Create &amp; Assign
              </button>
              <button onClick={() => setAssignModal(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── REVIEW MODAL ── */}
      {reviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setReviewModal(null)} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl max-w-md w-full" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Review Intervention</h3>
                <p className="text-xs text-slate-500 mt-0.5">{reviewModal.action_type} · {reviewModal.assigned_to}</p>
              </div>
              <button onClick={() => setReviewModal(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <div className="px-6 py-5 space-y-6">
              <div>
                <div className="text-sm font-bold text-slate-700 mb-3">Was the action completed?</div>
                <div className="grid grid-cols-2 gap-3">
                  {[{ val: true, label: 'Yes', cls: reviewForm.action_taken === true ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400' },
                    { val: false, label: 'No', cls: reviewForm.action_taken === false ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-300 hover:border-red-400' }
                  ].map(({ val, label, cls }) => (
                    <button key={label} onClick={() => setReviewForm({ ...reviewForm, action_taken: val })} className={`py-3 rounded-xl border-2 text-sm font-bold transition-all ${cls}`}>{label}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-sm font-bold text-slate-700 mb-3">Did the student improve?</div>
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { val: 'improved' as const, label: 'Improved', cls: reviewForm.student_improved === 'improved' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 border-slate-300 hover:border-emerald-400' },
                    { val: 'no_change' as const, label: 'No Change', cls: reviewForm.student_improved === 'no_change' ? 'bg-slate-600 text-white border-slate-600' : 'bg-white text-slate-700 border-slate-300 hover:border-slate-400' },
                    { val: 'worsened' as const, label: 'Worsened', cls: reviewForm.student_improved === 'worsened' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-700 border-slate-300 hover:border-red-400' },
                  ].map(({ val, label, cls }) => (
                    <button key={val} onClick={() => setReviewForm({ ...reviewForm, student_improved: val })} className={`py-3 rounded-xl border-2 text-xs font-bold transition-all ${cls}`}>{label}</button>
                  ))}
                </div>
              </div>

              {/* Before / After metrics */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Before / After Metrics <span className="normal-case font-normal text-slate-400">(optional)</span></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Attendance % (before)</label>
                    <input type="number" min="0" max="100"
                      value={reviewModal.baseline_attendance || reviewModal.baseline_attendance === 0 ? reviewModal.baseline_attendance : (student?.attendance_pct || '')}
                      readOnly
                      className="input-premium w-full text-sm py-1.5 bg-slate-100 text-slate-500 cursor-not-allowed"
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Attendance % (now)</label>
                    <input type="number" min="0" max="100" value={reviewForm.current_attendance} onChange={(e) => setReviewForm({ ...reviewForm, current_attendance: e.target.value })} className="input-premium w-full text-sm py-1.5" placeholder="Current %" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Behaviour pts (before)</label>
                    <input type="number" min="0"
                      value={reviewModal.baseline_behaviour || (student?.behaviour_score || '')}
                      readOnly
                      className="input-premium w-full text-sm py-1.5 bg-slate-100 text-slate-500 cursor-not-allowed"
                      placeholder="—"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Behaviour pts (now)</label>
                    <input type="number" min="0" value={reviewForm.current_behaviour} onChange={(e) => setReviewForm({ ...reviewForm, current_behaviour: e.target.value })} className="input-premium w-full text-sm py-1.5" placeholder="Current pts" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Review notes</label>
                <textarea value={reviewForm.notes} onChange={(e) => setReviewForm({ ...reviewForm, notes: e.target.value })} className="input-premium w-full" rows={3} placeholder="What happened? What was the outcome? Any next steps?" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button
                onClick={submitReview}
                disabled={reviewForm.action_taken === null || reviewForm.student_improved === null}
                className="btn-primary flex-1"
              >
                <Save className="w-4 h-4" /> Save Review
              </button>
              <button onClick={() => setReviewModal(null)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Escalation modal */}
      {escalationModal && (() => {
        const currentRole = profile?.role || '';
        const isDSL = currentRole === 'dsl';
        const EXTERNAL_AGENCIES = ['External Agency (MASH)', 'External Agency (Police)', 'Social Care', 'CAMHS'];
        const EXTERNAL_INFO: Record<string, { short: string; desc: string; cpoms: string }> = {
          'External Agency (MASH)': { short: 'MASH', desc: 'Multi-Agency Safeguarding Hub', cpoms: 'Document MASH reference number in CPOMS.' },
          'External Agency (Police)': { short: 'Police', desc: 'Police referral / crime report', cpoms: 'Record crime/incident reference in CPOMS.' },
          'Social Care':             { short: 'Social Care', desc: "Children's social care — S17/S47", cpoms: 'Record case reference in CPOMS.' },
          'CAMHS':                   { short: 'CAMHS', desc: 'Mental health services referral', cpoms: 'Record referral acknowledgement in CPOMS.' },
        };
        // DSL internal escalation is SLT only
        const ESCALATE_TO = isDSL ? ['SLT'] : ['Head of Year', 'Pastoral Lead', 'DSL', 'SENDCo', 'SLT', 'Attendance Officer'];
        const REASONS = ['Safeguarding concern', 'No improvement', 'Worsening behaviour', 'Attendance collapse', 'SEND concern', 'Parent/carer issue', 'Staff concern', 'Other'];
        const hoyName = HOY_BY_YEAR[student?.year_group || ''] || 'HOY';
        const DESTINATION_INFO: Record<string, string> = {
          'DSL': `Mr Ahmed (DSL) — safeguarding-restricted. Log in CPOMS after this escalation.`,
          'SENDCo': `Ms Jones (SENDCo) — will appear in SEND review queue and link to SEND profile.`,
          'SLT': `Mr Lee (SLT) — will appear in the SLT dashboard and reports.`,
          'Head of Year': `${hoyName} — routed to the ${student?.year_group || 'year group'} Head of Year queue.`,
          'Pastoral Lead': `Mrs Thompson (Pastoral) — added to pastoral queue with notification.`,
          'Attendance Officer': `Ms Williams (Attend) — will open an attendance case with review date.`,
        };
        const canSubmit = escalationForm.escalateTo && escalationForm.reason && escalationForm.notes.trim() && escalationForm.reviewDate;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setEscalationModal(null); setSelectedExternalAgency(null); }} />
            <div className="relative z-10 bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 bg-red-600 text-white flex items-center justify-between sticky top-0">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Escalate Action
                  </h3>
                  <p className="text-xs text-red-100 mt-0.5">
                    {escalationModal.action_type} · {student?.name}
                  </p>
                </div>
                <button onClick={() => { setEscalationModal(null); setSelectedExternalAgency(null); }} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* Smart suggestion banner */}
                {escalationSuggestion && (
                  <div className="bg-slate-900 rounded-xl px-4 py-3 flex items-start gap-3">
                    <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-bold text-amber-400 uppercase tracking-wider mb-0.5">Suggested escalation</div>
                      <div className="text-sm font-semibold text-white">{escalationSuggestion.staffName}</div>
                      <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">{escalationSuggestion.reason}</p>
                    </div>
                  </div>
                )}

                {/* ── DSL external referral tiles ── */}
                {isDSL && (
                  <div>
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Log external referral</div>
                    <p className="text-xs text-slate-500 mb-3 leading-relaxed">
                      Select the agency, then confirm. This will immediately log the referral on this student's timeline and remind you to record the reference number in CPOMS.
                    </p>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      {EXTERNAL_AGENCIES.map(agency => {
                        const info = EXTERNAL_INFO[agency];
                        const isSelected = selectedExternalAgency === agency;
                        return (
                          <button
                            key={agency}
                            onClick={() => setSelectedExternalAgency(isSelected ? null : agency)}
                            className={`flex flex-col items-start gap-1 px-4 py-3 rounded-xl border-2 transition-all text-left group ${
                              isSelected
                                ? 'border-red-600 bg-red-600 text-white'
                                : 'border-red-200 bg-red-50 hover:bg-red-100 hover:border-red-400'
                            }`}
                          >
                            <span className={`font-bold text-sm ${isSelected ? 'text-white' : 'text-red-800 group-hover:text-red-900'}`}>{info.short}</span>
                            <span className={`text-[10px] leading-tight ${isSelected ? 'text-red-100' : 'text-red-600'}`}>{info.desc}</span>
                            <span className={`text-[10px] mt-0.5 leading-tight ${isSelected ? 'text-red-200' : 'text-slate-500'}`}>{info.cpoms}</span>
                          </button>
                        );
                      })}
                    </div>
                    {selectedExternalAgency && (
                      <button
                        onClick={() => { logExternalReferral(selectedExternalAgency); setSelectedExternalAgency(null); }}
                        className="w-full flex items-center justify-center gap-2 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors"
                      >
                        <AlertTriangle className="w-4 h-4" />
                        Confirm referral to {EXTERNAL_INFO[selectedExternalAgency]?.short ?? selectedExternalAgency}
                      </button>
                    )}
                  </div>
                )}

                {/* ── Divider ── */}
                {isDSL && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t border-slate-200" />
                    <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">or escalate internally</span>
                    <div className="flex-1 border-t border-slate-200" />
                  </div>
                )}

                {/* ── Context for internal escalation ── */}
                {!isDSL && (
                  <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
                    The selected person/team will be assigned this action, added to their queue, and notified with a review date.
                  </div>
                )}

                {/* Escalate to */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Escalate to <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    {ESCALATE_TO.map(opt => (
                      <button
                        key={opt}
                        onClick={() => setEscalationForm(f => ({ ...f, escalateTo: opt }))}
                        className={`py-2.5 px-3 rounded-xl border text-sm font-medium text-left transition-all ${
                          escalationForm.escalateTo === opt
                            ? 'bg-red-600 text-white border-red-600'
                            : 'bg-white text-slate-700 border-slate-200 hover:border-red-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                  {escalationForm.escalateTo && DESTINATION_INFO[escalationForm.escalateTo] && (
                    <div className="mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-xs text-amber-700">
                      {DESTINATION_INFO[escalationForm.escalateTo]}
                    </div>
                  )}
                </div>

                {/* Reason */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Reason <span className="text-red-500">*</span></label>
                  <div className="grid grid-cols-2 gap-2">
                    {REASONS.map(opt => (
                      <button
                        key={opt}
                        onClick={() => setEscalationForm(f => ({ ...f, reason: opt }))}
                        className={`py-2 px-3 rounded-xl border text-xs font-medium text-left transition-all ${
                          escalationForm.reason === opt
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Priority</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['high', 'urgent'] as const).map(p => (
                      <button
                        key={p}
                        onClick={() => setEscalationForm(f => ({ ...f, priority: p }))}
                        className={`py-2.5 rounded-xl border text-sm font-semibold capitalize transition-all ${
                          escalationForm.priority === p
                            ? p === 'urgent' ? 'bg-red-600 text-white border-red-600' : 'bg-orange-500 text-white border-orange-500'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Review date */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Review date <span className="text-red-500">*</span></label>
                  <input
                    type="date"
                    value={escalationForm.reviewDate}
                    onChange={e => setEscalationForm(f => ({ ...f, reviewDate: e.target.value }))}
                    className="input-premium w-full"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Notes <span className="text-red-500">*</span></label>
                  <textarea
                    rows={3}
                    value={escalationForm.notes}
                    onChange={e => setEscalationForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Describe the concern and what you need from the recipient..."
                    className="input-premium w-full resize-none"
                  />
                </div>

                {/* What happens next */}
                {escalationForm.escalateTo && escalationForm.reason && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 space-y-1.5">
                    <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">What happens next</p>
                    <div className="text-xs text-slate-600 space-y-1">
                      <div className="flex items-start gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0 mt-1.5" /> Action status → <strong>Escalated</strong></div>
                      <div className="flex items-start gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0 mt-1.5" /> Assigned to <strong>{escalationForm.escalateTo}</strong></div>
                      <div className="flex items-start gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0 mt-1.5" /> Added to their <strong>My Queue</strong></div>
                      <div className="flex items-start gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0 mt-1.5" /> Appears on <strong>Reviews page</strong> with review date</div>
                      <div className="flex items-start gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0 mt-1.5" /> Recorded in <strong>student timeline</strong></div>
                    </div>
                  </div>
                )}
              </div>

              <div className="px-6 py-4 border-t border-slate-100 flex gap-3 sticky bottom-0 bg-white">
                <button onClick={() => { setEscalationModal(null); setSelectedExternalAgency(null); }} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={submitEscalation}
                  disabled={!canSubmit}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <AlertTriangle className="w-4 h-4" />
                  Escalate
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Complete action modal */}
      {completeModal && (() => {
        const baseAtt = completeModal.baseline_attendance ?? student?.attendance_pct ?? null;
        const baseBeh = completeModal.baseline_behaviour ?? student?.behaviour_score ?? null;
        // "After" values come from live student data — never editable by staff
        const afterAtt = student?.attendance_pct ?? null;
        const afterBeh = student?.behaviour_score ?? null;
        const attDiff = afterAtt !== null && baseAtt !== null ? +(afterAtt - baseAtt).toFixed(1) : null;
        const behDiff = afterBeh !== null && baseBeh !== null ? +(afterBeh - baseBeh).toFixed(1) : null;
        const attBetter = attDiff !== null && attDiff > 0;
        const attWorse  = attDiff !== null && attDiff < 0;
        const behBetter = behDiff !== null && behDiff < 0;
        const behWorse  = behDiff !== null && behDiff > 0;

        // Evidence mismatch: staff selected a positive outcome but data says otherwise
        const evidenceProblems: string[] = [];
        if (attWorse && attDiff !== null && baseAtt !== null) evidenceProblems.push(`Attendance declined (${baseAtt}% → ${afterAtt}%)`);
        if (behWorse && behDiff !== null && baseBeh !== null) evidenceProblems.push(`Behaviour points increased (${baseBeh} → ${afterBeh})`);
        const POSITIVE_OUTCOMES = ['Significant Improvement', 'Some Improvement', 'Resolved'];
        const selectedPositive = POSITIVE_OUTCOMES.includes(completeForm.outcomeCategory);
        const evidenceMismatch = selectedPositive && evidenceProblems.length > 0;

        const suggestedNextStep =
          completeForm.outcomeCategory === 'Significant Improvement' || completeForm.outcomeCategory === 'Resolved' ? 'close' :
          completeForm.outcomeCategory === 'Some Improvement' ? 'continue' :
          completeForm.outcomeCategory === 'No Change' ? 'followup' :
          completeForm.outcomeCategory === 'Deteriorated' || completeForm.outcomeCategory === 'Escalation Required' ? 'escalate' : '';

        const canSubmit = completeForm.outcomeText.trim() && completeForm.outcomeCategory && completeForm.nextStep &&
          (!evidenceMismatch || (completeForm.showOverride && completeForm.overrideReason.trim()));

        // Outcome-driven next recommendations
        const OUTCOME_RECOMMENDATIONS: Record<string, string[]> = {
          'Significant Improvement': ['Monitoring check-in', 'Positive call home', 'Success nomination', 'Recognition opportunity'],
          'Some Improvement':        ['Continue support', 'Follow-up review in 2 weeks', 'Monitor attendance trend'],
          'Resolved':                ['Monitoring check-in', 'Positive call home', 'Close case'],
          'No Change':               ['Alternative intervention', 'Parent contact', 'Staff meeting', 'Review approach'],
          'Deteriorated':            ['Escalate concern', 'Attendance meeting', 'SEND review', 'Consider referral'],
          'Escalation Required':     ['DSL review', 'Safeguarding meeting', 'Attendance panel', 'Pastoral panel'],
        };
        const nextRecs = completeForm.outcomeCategory ? OUTCOME_RECOMMENDATIONS[completeForm.outcomeCategory] || [] : [];

        // Check for repeated unsuccessful interventions
        const sameTypeCompleted = interventions.filter(i =>
          i.id !== completeModal.id &&
          i.action_type === completeModal.action_type &&
          i.status === 'completed' &&
          (i.outcome_status === 'no_change' || i.outcome_status === 'escalating')
        );
        const repeatedFailure = sameTypeCompleted.length >= 2;

        const OUTCOME_CATEGORIES = [
          { v: 'Significant Improvement', color: 'bg-emerald-600 text-white border-emerald-600', inactive: 'border-slate-200 text-slate-600' },
          { v: 'Some Improvement',        color: 'bg-teal-600 text-white border-teal-600',       inactive: 'border-slate-200 text-slate-600' },
          { v: 'No Change',               color: 'bg-amber-500 text-white border-amber-500',     inactive: 'border-slate-200 text-slate-600' },
          { v: 'Deteriorated',            color: 'bg-red-600 text-white border-red-600',         inactive: 'border-slate-200 text-slate-600' },
          { v: 'Escalation Required',     color: 'bg-red-700 text-white border-red-700',         inactive: 'border-red-200 text-red-600' },
          { v: 'Resolved',                color: 'bg-blue-600 text-white border-blue-600',       inactive: 'border-slate-200 text-slate-600' },
        ];
        const NEXT_STEPS = [
          { v: 'close',    label: 'Close case',             sub: 'Mark resolved, no further action' },
          { v: 'continue', label: 'Continue support',       sub: 'Keep monitoring and supporting' },
          { v: 'followup', label: 'Create follow-up action', sub: 'Assign a new action based on this outcome' },
          { v: 'escalate', label: 'Escalate concern',        sub: 'Refer upward — situation needs senior review' },
        ];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCompleteModal(null)} />
            <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between sticky top-0">
                <div>
                  <h3 className="font-bold text-base">Complete Action</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {student?.name} · {completeModal.action_type}
                    {completeModal.assigned_to && ` · ${completeModal.assigned_to}`}
                  </p>
                </div>
                <button onClick={() => setCompleteModal(null)} className="p-2 rounded-lg hover:bg-white/10 transition-colors"><X className="w-4 h-4" /></button>
              </div>
              <div className="px-6 py-5 space-y-6">
                {/* Read-only evidence panel */}
                {(baseAtt !== null || baseBeh !== null) && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Evidence — system generated, read-only</div>
                    <div className="grid grid-cols-2 gap-4">
                      {baseAtt !== null && (
                        <div>
                          <div className="text-xs font-semibold text-slate-500 mb-2">Attendance</div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">Before intervention</span>
                              <span className="font-bold text-slate-800">{baseAtt}%</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate_500">Current</span>
                              <span className="font-bold text-slate-800">{afterAtt}%</span>
                            </div>
                            {attDiff !== null && (
                              <div className={`flex justify-between text-xs font-bold pt-1 border-t border-slate-200 ${attBetter ? 'text-emerald-600' : attWorse ? 'text-red-600' : 'text-slate-500'}`}>
                                <span>Change</span>
                                <span>{attBetter ? '+' : ''}{attDiff}%</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                      {baseBeh !== null && (
                        <div>
                          <div className="text-xs font-semibold text-slate-500 mb-2">Behaviour Points</div>
                          <div className="space-y-1.5">
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">Before intervention</span>
                              <span className="font-bold text-slate-800">{baseBeh}</span>
                            </div>
                            <div className="flex justify-between text-xs">
                              <span className="text-slate-500">Current</span>
                              <span className="font-bold text-slate-800">{afterBeh}</span>
                            </div>
                            {behDiff !== null && (
                              <div className={`flex justify-between text-xs font-bold pt-1 border-t border-slate-200 ${behBetter ? 'text-emerald-600' : behWorse ? 'text-red-600' : 'text-slate-500'}`}>
                                <span>Change</span>
                                <span>{behDiff > 0 ? '+' : ''}{behDiff} pts</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {repeatedFailure && (
                  <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                    <p className="text-xs text-orange-800 font-medium">This is the 3rd or more {completeModal.action_type} with limited impact. Consider an alternative strategy or escalation.</p>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                    Outcome <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {OUTCOME_CATEGORIES.map(({ v, color, inactive }) => (
                      <button
                        key={v}
                        onClick={() => {
                          const suggestion = v === 'Significant Improvement' || v === 'Resolved' ? 'close' : v === 'Some Improvement' ? 'continue' : v === 'No Change' ? 'followup' : 'escalate';
                          setCompleteForm(f => ({ ...f, outcomeCategory: v, nextStep: f.nextStep || suggestion, showOverride: false, overrideReason: '' }));
                        }}
                        className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${completeForm.outcomeCategory === v ? color : `bg-white ${inactive} hover:border-slate-300`}`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {evidenceMismatch && !completeForm.showOverride && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800">Outcome does not match available evidence</p>
                        <div className="mt-1.5 space-y-0.5">
                          {evidenceProblems.map(p => (
                            <div key={p} className="text-xs text-amber-700 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" /> {p}</div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setCompleteForm(f => ({ ...f, outcomeCategory: '' }))} className="flex-1 py-2 rounded-xl border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors">Change Outcome</button>
                      <button onClick={() => setCompleteForm(f => ({ ...f, showOverride: true }))} className="flex-1 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors">Override With Reason</button>
                    </div>
                  </div>
                )}
                {completeForm.showOverride && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                      <p className="text-xs font-semibold text-blue-800">Staff override — reason required</p>
                    </div>
                    <textarea rows={2} value={completeForm.overrideReason} onChange={e => setCompleteForm(f => ({ ...f, overrideReason: e.target.value }))} placeholder="Why does this outcome differ from the evidence?" className="input-premium w-full text-xs resize-none" />
                    <p className="text-[10px] text-blue-600">This will be stored in the audit trail.</p>
                  </div>
                )}

                {nextRecs.length > 0 && (
                  <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                    <div className="text-[10px] font-bold text-teal-600 uppercase tracking-wider mb-2">Recommended next steps for this outcome</div>
                    <div className="space-y-1">
                      {nextRecs.map(r => (
                        <div key={r} className="flex items-center gap-2 text-xs text-teal-800">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-500 shrink-0" />{r}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Outcome notes <span className="text-red-500">*</span>
                  </label>
                  <textarea rows={3} placeholder="What happened? What evidence do you have? What was agreed?" value={completeForm.outcomeText} onChange={e => { setCompleteForm(f => ({ ...f, outcomeText: e.target.value })); setCompleteSgDismissed(false); setCompleteSgAccepted(false); }} className="input-premium w-full resize-none" />
                </div>
                {(() => {
                  const sgDetection = !completeSgDismissed && completeForm.outcomeText.trim().length >= 8 ? detectSafeguarding(completeForm.outcomeText) : null;
                  return sgDetection ? (
                    <SafeguardingAlert
                      detection={sgDetection}
                      accepted={completeSgAccepted}
                      onAccept={(dslName, _actionType, _priority) => {
                        setCompleteForm(f => ({ ...f, nextStep: 'escalate' }));
                        setCompleteSgAccepted(true);
                      }}
                      onDismiss={!completeSgAccepted ? () => setCompleteSgDismissed(true) : undefined}
                    />
                  ) : null;
                })()}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                    Next step <span className="text-red-500">*</span>
                    {suggestedNextStep && !completeForm.nextStep && (
                      <span className="ml-2 text-teal-600 normal-case font-normal">Suggested: {NEXT_STEPS.find(s => s.v === suggestedNextStep)?.label}</span>
                    )}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {NEXT_STEPS.map(({ v, label, sub }) => (
                      <button
                        key={v}
                        onClick={() => setCompleteForm(f => ({ ...f, nextStep: v }))}
                        className={`py-2.5 px-3 rounded-xl border text-left text-xs transition-all ${
                          completeForm.nextStep === v ? 'bg-teal-600 text-white border-teal-600'
                          : v === suggestedNextStep && !completeForm.nextStep ? 'border-teal-300 bg-teal-50 text-teal-700'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div className="font-semibold">{label}</div>
                        <div className={`text-[10px] mt-0.5 ${completeForm.nextStep === v ? 'text-white/80' : 'text-slate-400'}`}>{sub}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex gap-3 sticky bottom-0 bg-white">
                <button onClick={() => setCompleteModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button onClick={completeIntervention} disabled={!canSubmit} className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed">
                  <CheckCircle className="w-4 h-4" /> Save outcome
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Reassign modal */}
      {reassignTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setReassignTarget(null); setReassignTo(''); }} />
          <div className="relative z-10 bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-5 border-b border-slate-100 bg-amber-600 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Reassign Action</h3>
                <p className="text-xs text-amber-100 mt-0.5">{reassignTarget.action_type} · currently assigned to {reassignTarget.assigned_to || 'unassigned'}</p>
              </div>
              <button onClick={() => { setReassignTarget(null); setReassignTo(''); }} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
                <p className="font-medium mb-1">Oversight reassignment</p>
                <p className="text-xs text-amber-700">As {profile?.role?.toUpperCase()}, you can redirect this action to the appropriate staff member. The new assignee will be notified and will become responsible for completing it.</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-2">Assign to</label>
                <select
                  value={reassignTo}
                  onChange={e => setReassignTo(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 bg-white"
                >
                  <option value="">Select staff member…</option>
                  {DEMO_STAFF.map(s => (
                    <option key={s.name} value={s.name}>{s.name} — {s.role}</option>
                  ))}
                </select>
              </div>
              {reassignTo && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs text-slate-600">
                  This action will be reassigned to <strong className="text-slate-800">{reassignTo}</strong> and its status set to <span className="font-semibold text-teal-700">Assigned</span>.
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3 justify-end">
              <button
                onClick={() => { setReassignTarget(null); setReassignTo(''); }}
                className="px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => reassignTo && reassignIntervention(reassignTarget, reassignTo)}
                disabled={!reassignTo}
                className="px-5 py-2 rounded-xl bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Confirm Reassign
              </button>
            </div>
          </div>
        </div>
      )}

      {/* NEET override modal */}
      {neetOverrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setNeetOverrideModal(false)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base text-slate-900">Override NEET Risk Level</h3>
                <p className="text-xs text-slate-400 mt-0.5">System detected: <strong>{neetRisk.level}</strong> — override requires a reason and will be audit-logged</p>
              </div>
              <button onClick={() => setNeetOverrideModal(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Override level <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {['Low', 'Medium', 'At Risk', 'High Risk'].map(level => (
                    <button
                      key={level}
                      onClick={() => setNeetOverrideForm(f => ({ ...f, level }))}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                        neetOverrideForm.level === level ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-700 border-slate-200 hover:border-teal-300'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Override reason <span className="text-red-500">*</span></label>
                <textarea
                  rows={3}
                  value={neetOverrideForm.reason}
                  onChange={e => setNeetOverrideForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Why does the evidence-based level not reflect this student's actual situation?"
                  className="input-premium w-full resize-none text-sm"
                />
                <p className="text-[10px] text-slate-400 mt-1">This override will be recorded in the audit trail and will not affect the system evidence score.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setNeetOverrideModal(false)} className="btn-secondary flex-1">Cancel</button>
              <button
                disabled={!neetOverrideForm.level || !neetOverrideForm.reason.trim()}
                onClick={() => {
                  if (!career) return;
                  const overrideNote = `[Override: ${neetOverrideForm.level}] ${neetOverrideForm.reason}`;
                  const updatedCareer = { ...career, destination_risk: neetOverrideForm.level === 'Low' ? 'On track' : neetOverrideForm.level === 'High Risk' ? 'High risk of NEET' : neetOverrideForm.level === 'At Risk' ? 'At risk of NEET' : career.destination_risk, barriers: career.barriers ? career.barriers + '\n' + overrideNote : overrideNote };
                  setCareer(updatedCareer);
                  setActivityFeed(prev => [{ id: 'neet_override_' + Date.now(), timestamp: new Date().toISOString(), text: `NEET risk overridden to "${neetOverrideForm.level}" — reason: ${neetOverrideForm.reason}` }, ...prev]);
                  setNeetOverrideModal(false);
                  addToast(`NEET risk overridden to ${neetOverrideForm.level}.`, 'success');
                }}
                className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" /> Save override
              </button>
            </div>
          </div>
        </div>
      )}

      {showQuickNote && (
        <QuickNoteModal
          students={students}
          defaultStudentId={id}
          onClose={() => setShowQuickNote(false)}
          onSaved={(note) => {
            setQuickNotes((prev) => [note, ...prev]);
            setShowQuickNote(false);
            addToast('Note saved.');
          }}
        />
      )}
    </div>
  );
}

// ─── Behaviour Intelligence Component ───────────────────────────────────────

// Module-level source/confidence/evidence components reused by BehaviourIntelligence

const SOURCE_COLORS: Record<string, string> = {
  Attendance: 'bg-blue-50 text-blue-700 border-blue-200',
  Behaviour: 'bg-red-50 text-red-700 border-red-200',
  'Teacher Notes': 'bg-amber-50 text-amber-700 border-amber-200',
  SEND: 'bg-purple-50 text-purple-700 border-purple-200',
  'Intervention Outcomes': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};

function SrcBadge({ source }: { source: string }) {
  const color = SOURCE_COLORS[source] || 'bg-slate-100 text-slate-600 border-slate-200';
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${color}`}>{source}</span>;
}

function ConfBadge({ level }: { level: 'low' | 'medium' | 'high' }) {
  const cfg = {
    high: { label: 'High confidence', color: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500' },
    medium: { label: 'Medium confidence', color: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
    low: { label: 'Low confidence', color: 'bg-slate-100 text-slate-500 border-slate-200', dot: 'bg-slate-400' },
  }[level];
  return (
    <span className={`flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full font-semibold border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function EvidExpander({ title, evidence, sources }: { title: string; evidence: string[]; sources: string[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 border-t border-slate-100 pt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-[10px] font-semibold text-slate-400 hover:text-teal-600 transition-colors"
      >
        <Eye className="w-3 h-3" />
        {open ? 'Hide' : 'Why was this generated?'}
        <ChevronDown className={`w-3 h-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{title}</div>
          <ul className="space-y-1">
            {evidence.map((e, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0" />
                {e}
              </li>
            ))}
          </ul>
          {sources.length > 0 && (
            <div className="flex flex-wrap gap-1 pt-1 border-t border-slate-200">
              <span className="text-[10px] text-slate-400 font-medium mr-1">Sources:</span>
              {sources.map((s) => <SrcBadge key={s} source={s} />)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function topEntry<K>(map: Map<K, number>): [K, number] | null {
  let best: [K, number] | null = null;
  map.forEach((v, k) => { if (!best || v > best[1]) best = [k, v]; });
  return best;
}

function pct(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function BehaviourIntelligence({
  behaviour,
  interventions,
  student,
}: {
  behaviour: BehaviourRecord[];
  interventions: Intervention[];
  student: Student;
}) {
  const [rawExpanded, setRawExpanded] = useState(false);

  const incidents = behaviour.filter((b) => b.behaviour_points > 0);
  const totalPoints = incidents.reduce((sum, r) => sum + r.behaviour_points, 0);
  const incidentCount = incidents.length;

  // ── Frequency maps ───────────────────────────────────────────────────────
  const subjectMap = new Map<string, number>();
  const periodMap = new Map<string, number>();
  const staffMap = new Map<string, number>();
  const typeMap = new Map<string, number>();
  const dayMap = new Map<string, number>();

  incidents.forEach((b) => {
    if (b.subject) subjectMap.set(b.subject, (subjectMap.get(b.subject) || 0) + 1);
    if (b.lesson_period) periodMap.set(b.lesson_period, (periodMap.get(b.lesson_period) || 0) + 1);
    if (b.staff_member) staffMap.set(b.staff_member, (staffMap.get(b.staff_member) || 0) + 1);
    if (b.incident_type) typeMap.set(b.incident_type, (typeMap.get(b.incident_type) || 0) + 1);
    if (b.date) {
      const day = DAY_NAMES[new Date(b.date).getDay()];
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }
  });

  const topSubject = topEntry(subjectMap);
  const topPeriod = topEntry(periodMap);
  const topStaff = topEntry(staffMap);
  const topType = topEntry(typeMap);
  const topDay = topEntry(dayMap);

  // ── Trend detection ──────────────────────────────────────────────────────
  const sorted = [...incidents].sort((a, b) => a.date.localeCompare(b.date));
  const half = Math.ceil(sorted.length / 2);
  const firstHalf = sorted.slice(0, half);
  const secondHalf = sorted.slice(half);
  const firstPts = firstHalf.reduce((s, b) => s + b.behaviour_points, 0);
  const secondPts = secondHalf.reduce((s, b) => s + b.behaviour_points, 0);
  const escalating = secondPts > firstPts * 1.2 && firstPts > 0;
  const improving = secondPts < firstPts * 0.8 && firstPts > 0;

  // ── Pattern detection ────────────────────────────────────────────────────
  type Pattern = {
    text: string;
    confidence: 'low' | 'medium' | 'high';
    sources: string[];
    evidence: string[];
  };
  const patterns: Pattern[] = [];

  if (topSubject && pct(topSubject[1], incidentCount) >= 40) {
    patterns.push({
      text: `Possible pattern detected — ${pct(topSubject[1], incidentCount)}% of incidents occur in ${topSubject[0]}`,
      confidence: topSubject[1] >= 4 ? 'high' : 'medium',
      sources: ['Behaviour', 'Teacher Notes'],
      evidence: [
        `${topSubject[1]} out of ${incidentCount} incidents recorded in ${topSubject[0]}`,
        `All incidents from behaviour records logged between ${incidents[incidents.length - 1]?.date} and ${incidents[0]?.date}`,
      ],
    });
  }
  if (topPeriod && pct(topPeriod[1], incidentCount) >= 40) {
    patterns.push({
      text: `The data suggests a lesson period pattern — ${pct(topPeriod[1], incidentCount)}% of incidents occur in ${topPeriod[0]}`,
      confidence: topPeriod[1] >= 3 ? 'high' : 'medium',
      sources: ['Behaviour'],
      evidence: [
        `${topPeriod[1]} out of ${incidentCount} incidents logged in ${topPeriod[0]}`,
        'Period data taken directly from behaviour records',
      ],
    });
  }
  if (topDay && pct(topDay[1], incidentCount) >= 35) {
    patterns.push({
      text: `The data suggests a day-of-week pattern — ${pct(topDay[1], incidentCount)}% of incidents fall on ${topDay[0]}s`,
      confidence: topDay[1] >= 3 ? 'medium' : 'low',
      sources: ['Behaviour'],
      evidence: [
        `${topDay[1]} incidents fell on a ${topDay[0]} based on behaviour record dates`,
        `${incidentCount} total incidents analysed`,
      ],
    });
  }
  if (topStaff && pct(topStaff[1], incidentCount) >= 50) {
    patterns.push({
      text: `The data suggests a possible link — ${pct(topStaff[1], incidentCount)}% of incidents involve ${topStaff[0]}`,
      confidence: 'medium',
      sources: ['Behaviour', 'Teacher Notes'],
      evidence: [
        `${topStaff[1]} incidents where ${topStaff[0]} is recorded as the staff member`,
        `${pct(topStaff[1], incidentCount)}% of ${incidentCount} total incidents involve this staff member`,
      ],
    });
  }
  if (escalating) {
    patterns.push({
      text: 'The data suggests behaviour points are increasing in recent weeks',
      confidence: 'high',
      sources: ['Behaviour'],
      evidence: [
        `First half of records: ${firstPts} points across ${firstHalf.length} incidents`,
        `Recent half of records: ${secondPts} points across ${secondHalf.length} incidents`,
        'Recent points are more than 20% higher than earlier in the period',
      ],
    });
  }
  if (improving) {
    patterns.push({
      text: 'The data suggests behaviour points have reduced in recent weeks',
      confidence: 'high',
      sources: ['Behaviour'],
      evidence: [
        `First half of records: ${firstPts} points across ${firstHalf.length} incidents`,
        `Recent half of records: ${secondPts} points across ${secondHalf.length} incidents`,
        'Recent points are more than 20% lower — a positive indicator',
      ],
    });
  }
  if (incidentCount > 0 && (student.attendance_pct || 100) < 88) {
    patterns.push({
      text: 'Possible pattern — low attendance and behaviour concerns may be linked',
      confidence: 'medium',
      sources: ['Behaviour', 'Attendance'],
      evidence: [
        `Attendance recorded at ${student.attendance_pct}%`,
        `${incidentCount} behaviour incidents recorded in the same period`,
        'Correlation is possible but not confirmed — may require pastoral investigation',
      ],
    });
  }
  const lates = incidents.filter((b) => b.incident_type === 'Late');
  if (lates.length >= 2 && pct(lates.length, incidentCount) >= 25) {
    patterns.push({
      text: `Possible pattern detected — ${pct(lates.length, incidentCount)}% of incidents are punctuality-related`,
      confidence: 'medium',
      sources: ['Behaviour', 'Attendance'],
      evidence: [
        `${lates.length} incidents recorded as type "Late"`,
        `Dates: ${lates.map((l) => l.date).join(', ')}`,
      ],
    });
  }
  const highPoints = incidents.filter((b) => b.behaviour_points >= 10);
  if (highPoints.length >= 2) {
    patterns.push({
      text: `The data suggests ${highPoints.length} serious incidents (10+ points) — may require structured support`,
      confidence: 'high',
      sources: ['Behaviour'],
      evidence: [
        ...highPoints.map((h) => `${h.date}: ${h.incident_type} — ${h.behaviour_points} points (${h.subject || 'no subject'})`),
      ],
    });
  }

  // ── Risk confidence ──────────────────────────────────────────────────────
  const highPatterns = patterns.filter((p) => p.confidence === 'high').length;
  const riskConfidence: 'low' | 'medium' | 'high' =
    highPatterns >= 2 || incidentCount >= 6 ? 'high' :
    highPatterns >= 1 || incidentCount >= 3 ? 'medium' : 'low';

  const RISK_CFG = {
    low: { label: 'Low confidence', bar: 'bg-slate-400', width: 'w-1/4' },
    medium: { label: 'Medium confidence', bar: 'bg-amber-400', width: 'w-1/2' },
    high: { label: 'High confidence', bar: 'bg-red-500', width: 'w-3/4' },
  };

  // ── Pattern-based recommended actions ────────────────────────────────────
  type PatternAction = { action: string; reason: string; sources: string[]; evidence: string[]; confidence: 'low' | 'medium' | 'high' };
  const patternActions: PatternAction[] = [];

  if (topSubject && pct(topSubject[1], incidentCount) >= 40) {
    patternActions.push({
      action: `Observe ${topSubject[0]} lessons`,
      reason: `The data suggests ${topSubject[1]} of ${incidentCount} incidents occur in this subject — observation may clarify whether this is environment, peer, or subject-related`,
      sources: ['Behaviour', 'Teacher Notes'],
      evidence: [`${topSubject[1]} incidents recorded in ${topSubject[0]}`, `${pct(topSubject[1], incidentCount)}% concentration`],
      confidence: topSubject[1] >= 4 ? 'high' : 'medium',
    });
    patternActions.push({
      action: `Review seating plan in ${topSubject[0]}`,
      reason: 'Peer proximity may be a contributing factor — this is a possibility to explore, not a confirmed cause',
      sources: ['Behaviour', 'Teacher Notes'],
      evidence: [`${topSubject[1]} of ${incidentCount} incidents recorded in ${topSubject[0]} (${pct(topSubject[1], incidentCount)}%)`, `Subject: ${topSubject[0]}`],
      confidence: 'low',
    });
  }
  if (topPeriod && pct(topPeriod[1], incidentCount) >= 35) {
    patternActions.push({
      action: `Schedule tutor check-in before ${topPeriod[0]}`,
      reason: `The data suggests incidents cluster around this period — ${topPeriod[1]} of ${incidentCount} incidents in ${topPeriod[0]} (${pct(topPeriod[1], incidentCount)}%)`,
      sources: ['Behaviour'],
      evidence: [`${topPeriod[1]} incidents in ${topPeriod[0]}`, `${pct(topPeriod[1], incidentCount)}% of all incidents`],
      confidence: topPeriod[1] >= 3 ? 'medium' : 'low',
    });
  }
  if (topDay && pct(topDay[1], incidentCount) >= 35) {
    patternActions.push({
      action: `Monitor closely on ${topDay[0]}s`,
      reason: 'Possible day-of-week pattern detected — increased staff awareness recommended until confirmed',
      sources: ['Behaviour'],
      evidence: [`${topDay[1]} incidents on ${topDay[0]}s`, `${pct(topDay[1], incidentCount)}% of all incidents`],
      confidence: 'low',
    });
  }
  if ((student.attendance_pct || 100) < 88) {
    patternActions.push({
      action: 'Arrange parent/carer meeting',
      reason: 'The data suggests attendance and behaviour may be linked — parental context could clarify underlying causes',
      sources: ['Attendance', 'Behaviour'],
      evidence: [`Attendance at ${student.attendance_pct}%`, `${incidentCount} behaviour incidents in same period`],
      confidence: 'medium',
    });
  }
  if (highPoints.length >= 2) {
    patternActions.push({
      action: 'Implement behaviour support plan',
      reason: `The data suggests ${highPoints.length} serious incidents (10+ points) — structured support may be appropriate`,
      sources: ['Behaviour'],
      evidence: highPoints.map((h) => `${h.date}: ${h.incident_type} (${h.behaviour_points} pts)`),
      confidence: 'high',
    });
  }
  if (student.send_status) {
    patternActions.push({
      action: 'Review SEND needs and provision',
      reason: 'SEND status may relate to behaviour patterns — this is worth exploring with the SENDCo',
      sources: ['SEND', 'Behaviour'],
      evidence: [`SEND status recorded: ${student.send_status}`, `${incidentCount} behaviour incidents on file`],
      confidence: 'medium',
    });
  }
  if (improving) {
    patternActions.push({
      action: 'Recognise and reinforce positive progress',
      reason: 'The data suggests improvement — positive reinforcement may help sustain this trend',
      sources: ['Behaviour', 'Intervention Outcomes'],
      evidence: [`Earlier period: ${firstPts} pts across ${firstHalf.length} incidents`, `Recent period: ${secondPts} pts across ${secondHalf.length} incidents`],
      confidence: 'medium',
    });
  }
  if (patternActions.length === 0 && incidentCount > 0) {
    patternActions.push({
      action: 'Schedule pastoral check-in',
      reason: 'Low-level concerns detected — a proactive pastoral check-in is a proportionate response',
      sources: ['Behaviour'],
      evidence: [`${incidentCount} incident${incidentCount !== 1 ? 's' : ''} on record`, 'No dominant pattern identified — general monitoring recommended'],
      confidence: 'low',
    });
  }

  // ── What worked previously ───────────────────────────────────────────────
  const previousWork = interventions
    .filter((i) => i.review_completed && i.outcome_status)
    .map((i) => ({
      action: i.action_type,
      outcome: i.outcome_status!,
      notes: i.review_notes || i.outcome || '',
      reviewDate: i.review_date || i.created_at,
    }));

  const OUTCOME_CFG: Record<string, { label: string; color: string; icon: typeof TrendingUp }> = {
    resolved: { label: 'Outcome: resolved — intervention appeared effective', color: 'text-emerald-700', icon: TrendingUp },
    improving: { label: 'Outcome: improving — positive direction', color: 'text-teal-700', icon: TrendingUp },
    sustained: { label: 'Outcome: sustained improvement', color: 'text-emerald-700', icon: TrendingUp },
    no_change: { label: 'Outcome: no measurable change recorded', color: 'text-amber-700', icon: Activity },
    escalating: { label: 'Outcome: escalated after intervention', color: 'text-red-700', icon: TrendingDown },
  };

  // ── Executive summary ─────────────────────────────────────────────────────
  let summary = '';
  const summaryEvidence: string[] = [];
  if (incidentCount === 0) {
    summary = 'No behaviour incidents recorded for this student.';
  } else {
    const parts: string[] = [];
    if (topSubject && pct(topSubject[1], incidentCount) >= 40) {
      parts.push(`primarily in ${topSubject[0]}`);
      summaryEvidence.push(`${topSubject[1]}/${incidentCount} incidents in ${topSubject[0]}`);
    }
    if (topPeriod && pct(topPeriod[1], incidentCount) >= 35) {
      parts.push(`concentrated in ${topPeriod[0]}`);
      summaryEvidence.push(`${topPeriod[1]} incidents during ${topPeriod[0]}`);
    }
    if (topDay && pct(topDay[1], incidentCount) >= 35) {
      parts.push(`with a ${topDay[0]} pattern`);
      summaryEvidence.push(`${topDay[1]} incidents on ${topDay[0]}s`);
    }
    summaryEvidence.push(`${incidentCount} total incidents · ${totalPoints} behaviour points`);
    if (student.attendance_pct) summaryEvidence.push(`Attendance: ${student.attendance_pct}%`);
    const trend = escalating ? 'escalating' : improving ? 'improving' : 'stable';
    const effectiveInterv = previousWork.find((p) => p.outcome === 'resolved' || p.outcome === 'improving');
    const context = parts.length > 0 ? ` — the data suggests concerns are ${parts.join(', ')}` : '';
    const prevPart = effectiveInterv ? ` The data suggests previous ${effectiveInterv.action.toLowerCase()} was effective.` : '';
    summary = `The data suggests behaviour concerns are ${trend}${context}.${prevPart}`;
    if (student.send_status) summary += ` SEND context (${student.send_status}) should be considered alongside this analysis.`;
  }

  const confCfg = RISK_CFG[riskConfidence];

  return (
    <div className="space-y-5">
      {/* Executive Summary */}
      <div className="card-premium p-5">
        <div className="flex items-start gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-900 flex items-center justify-center shrink-0">
            <Brain className="w-4 h-4 text-white" />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Executive Summary</div>
              <ConfBadge level={riskConfidence} />
              {incidentCount > 0 && <SrcBadge source="Behaviour" />}
              {(student.attendance_pct || 100) < 92 && <SrcBadge source="Attendance" />}
              {student.send_status && <SrcBadge source="SEND" />}
            </div>
            <p className="text-sm font-medium text-slate-800 leading-relaxed">{summary}</p>
            {summaryEvidence.length > 0 && (
              <EvidExpander
                title="Data used to generate this summary"
                evidence={summaryEvidence}
                sources={['Behaviour', ...(student.send_status ? ['SEND'] : []), ...((student.attendance_pct || 100) < 92 ? ['Attendance'] : [])]}
              />
            )}
          </div>
        </div>
      </div>

      {incidentCount === 0 ? (
        <div className="card-premium flex flex-col items-center justify-center py-16 gap-3 text-slate-400">
          <CheckCircle className="w-10 h-10 text-emerald-300" />
          <p className="text-sm font-medium text-slate-600">No behaviour incidents recorded</p>
          <p className="text-xs">This student has a clean behaviour record.</p>
        </div>
      ) : (
        <>
          {/* Top stats bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Total incidents', value: incidentCount, sub: `${totalPoints} points`, color: incidentCount >= 5 ? 'text-red-600' : 'text-slate-800' },
              { label: 'Top subject', value: topSubject?.[0] || '—', sub: topSubject ? `${topSubject[1]} incident${topSubject[1] !== 1 ? 's' : ''}` : 'No data', color: 'text-slate-800' },
              { label: 'Top period', value: topPeriod?.[0] || '—', sub: topPeriod ? `${pct(topPeriod[1], incidentCount)}% of incidents` : 'No data', color: 'text-slate-800' },
              { label: 'Trend', value: escalating ? 'Escalating' : improving ? 'Improving' : 'Stable', sub: `Over ${incidentCount} incidents`, color: escalating ? 'text-red-600' : improving ? 'text-emerald-600' : 'text-slate-700' },
            ].map((s) => (
              <div key={s.label} className="card-premium p-4 text-center">
                <div className={`text-lg font-extrabold ${s.color}`}>{s.value}</div>
                <div className="text-xs font-semibold text-slate-500 mt-0.5">{s.label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Pattern Detection */}
          <div className="card-premium overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-teal-600" />
                <h3 className="font-bold text-slate-800 text-sm">Pattern Detection</h3>
              </div>
              <p className="text-[11px] text-slate-400 italic">Patterns are indicators only — not confirmed facts</p>
            </div>
            {patterns.length === 0 ? (
              <p className="px-5 py-4 text-sm text-slate-500">Not enough data to detect patterns yet.</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {patterns.map((p, i) => (
                  <div key={i} className="px-5 py-3.5">
                    <div className="flex items-start justify-between gap-4">
                      <span className="text-sm text-slate-700 leading-relaxed">{p.text}</span>
                      <ConfBadge level={p.confidence} />
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {p.sources.map((s) => <SrcBadge key={s} source={s} />)}
                    </div>
                    <EvidExpander
                      title="Exact data used to detect this pattern"
                      evidence={p.evidence}
                      sources={p.sources}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Risk insight + frequency breakdown side by side */}
          <div className="grid sm:grid-cols-2 gap-4">
            {/* Risk confidence */}
            <div className="card-premium p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Flag className="w-4 h-4 text-slate-500" />
                <h3 className="font-bold text-slate-800 text-sm">Risk Insight</h3>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <ConfBadge level={riskConfidence} />
                <span className="text-xs text-slate-500 italic">Based on {incidentCount} incidents</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-2">
                <div className={`h-2 rounded-full transition-all ${confCfg.bar} ${confCfg.width}`} />
              </div>
              <p className="text-[11px] text-slate-400 italic">
                Confidence reflects the strength of data evidence — not a clinical risk assessment.
              </p>
              <div className="space-y-1 pt-1">
                {topType && <p className="text-xs text-slate-600"><span className="font-medium">Most common type:</span> {topType[0]} ({topType[1]} incidents)</p>}
                {topSubject && <p className="text-xs text-slate-600"><span className="font-medium">Most common subject:</span> {topSubject[0]} ({topSubject[1]} incidents)</p>}
                {topPeriod && <p className="text-xs text-slate-600"><span className="font-medium">Most common period:</span> {topPeriod[0]} ({pct(topPeriod[1], incidentCount)}%)</p>}
                {topDay && <p className="text-xs text-slate-600"><span className="font-medium">Most common day:</span> {topDay[0]} ({topDay[1]} incidents)</p>}
                {topStaff && <p className="text-xs text-slate-600"><span className="font-medium">Most common staff:</span> {topStaff[0]} ({topStaff[1]} incidents)</p>}
              </div>
              <EvidExpander
                title="Data behind this risk insight"
                evidence={[
                  `${incidentCount} behaviour incidents analysed`,
                  `${totalPoints} total behaviour points`,
                  `${highPoints.length} serious incidents (10+ points)`,
                  escalating ? `Escalation detected: ${firstPts} pts → ${secondPts} pts` : improving ? `Improvement detected: ${firstPts} pts → ${secondPts} pts` : 'No significant trend change detected',
                ]}
                sources={['Behaviour']}
              />
            </div>

            {/* Frequency breakdown bars */}
            <div className="card-premium p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-slate-500" />
                <h3 className="font-bold text-slate-800 text-sm">Frequency Breakdown</h3>
              </div>
              {[
                { label: 'By subject', map: subjectMap },
                { label: 'By period', map: periodMap },
              ].map(({ label, map }) => {
                const entries = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4);
                if (entries.length === 0) return null;
                const max = entries[0][1];
                return (
                  <div key={label}>
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">{label}</div>
                    <div className="space-y-1.5">
                      {entries.map(([name, count]) => (
                        <div key={name} className="flex items-center gap-2">
                          <span className="text-xs text-slate-600 w-20 shrink-0 truncate">{name}</span>
                          <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                            <div className="bg-teal-500 h-1.5 rounded-full transition-all" style={{ width: `${pct(count, max)}%` }} />
                          </div>
                          <span className="text-[10px] text-slate-500 w-4 text-right">{count}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              <p className="text-[10px] text-slate-400 italic pt-1">Raw frequency counts from behaviour records</p>
            </div>
          </div>

          {/* Recommended actions from patterns */}
          {patternActions.length > 0 && (
            <div className="card-premium overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <Target className="w-4 h-4 text-teal-600" />
                  <h3 className="font-bold text-slate-800 text-sm">Possible Actions to Consider</h3>
                </div>
                <p className="text-[11px] text-slate-400 italic">Suggested by data patterns — professional judgement required</p>
              </div>
              <div className="divide-y divide-slate-100">
                {patternActions.map((a, i) => (
                  <div key={i} className="px-5 py-4">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-lg bg-teal-50 flex items-center justify-center shrink-0 mt-0.5">
                        <Zap className="w-3.5 h-3.5 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <div className="text-sm font-semibold text-slate-800">{a.action}</div>
                          <ConfBadge level={a.confidence} />
                        </div>
                        <p className="text-xs text-slate-500 leading-relaxed mb-1.5">{a.reason}</p>
                        <div className="flex flex-wrap gap-1">
                          {a.sources.map((s) => <SrcBadge key={s} source={s} />)}
                        </div>
                        <EvidExpander
                          title="Why was this action suggested?"
                          evidence={a.evidence}
                          sources={a.sources}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* What worked previously */}
          {previousWork.length > 0 && (
            <div className="card-premium overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-slate-500" />
                <h3 className="font-bold text-slate-800 text-sm">Previous Interventions and Outcomes</h3>
              </div>
              <div className="px-5 py-2 bg-slate-50 border-b border-slate-100">
                <p className="text-[11px] text-slate-400 italic">Outcome data is recorded by staff at review — results are self-reported, not independently verified</p>
              </div>
              <div className="divide-y divide-slate-100">
                {previousWork.map((p, i) => {
                  const cfg = OUTCOME_CFG[p.outcome] || { label: p.outcome, color: 'text-slate-600', icon: Activity };
                  const Icon = cfg.icon;
                  return (
                    <div key={i} className="px-5 py-3.5">
                      <div className="flex items-start gap-3">
                        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${cfg.color}`} />
                        <div className="flex-1">
                          <div className="text-sm font-semibold text-slate-800">{p.action}</div>
                          <div className={`text-xs font-medium mt-0.5 ${cfg.color}`}>{cfg.label}</div>
                          {p.notes && <div className="text-xs text-slate-500 mt-0.5 italic">"{p.notes}"</div>}
                          <SrcBadge source="Intervention Outcomes" />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </>
      )}

      {/* Raw records — collapsed by default */}
      <div className="card-premium overflow-hidden">
        <button
          onClick={() => setRawExpanded(!rawExpanded)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-600">Raw behaviour records</span>
            <span className="text-xs text-slate-400">({incidentCount} incidents · {totalPoints} points)</span>
          </div>
          {rawExpanded
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {rawExpanded && (
          <div className="overflow-x-auto border-t border-slate-100">
            <table className="table-premium">
              <thead>
                <tr>
                  <th>Date</th><th>Type</th><th>Points</th><th>Subject</th><th>Period</th><th>Staff</th><th>Comment</th>
                </tr>
              </thead>
              <tbody>
                {behaviour.map((record) => (
                  <tr key={record.id}>
                    <td className="font-medium">{record.date}</td>
                    <td>{record.incident_type}</td>
                    <td>
                      <span className={`font-bold ${record.behaviour_points > 5 ? 'text-red-600' : 'text-slate-700'}`}>
                        {record.behaviour_points}
                      </span>
                    </td>
                    <td>{record.subject || '—'}</td>
                    <td>{record.lesson_period || '—'}</td>
                    <td>{record.staff_member || '—'}</td>
                    <td className="max-w-xs truncate text-slate-600">{record.comment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Insights + Evidence Component ──────────────────────────────────────────

function InsightsAndEvidence({
  student,
  behaviour,
  analysis,
  interventions,
  quickNotes,
  timeline,
  onAddNote,
}: {
  student: Student;
  behaviour: BehaviourRecord[];
  analysis: AnalysisResult | null;
  interventions: Intervention[];
  quickNotes: QuickNote[];
  timeline: TimelineEvent[];
  onAddNote: () => void;
}) {
  const [rawExpanded, setRawExpanded] = useState(false);

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // ── Week buckets ─────────────────────────────────────────────────────────
  const oneWeekAgo = new Date(today); oneWeekAgo.setDate(today.getDate() - 7);
  const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(today.getDate() - 14);

  const recentIncidents = behaviour.filter((b) => b.behaviour_points > 0 && b.date >= oneWeekAgo.toISOString().slice(0, 10));
  const prevWeekIncidents = behaviour.filter((b) => b.behaviour_points > 0 && b.date >= twoWeeksAgo.toISOString().slice(0, 10) && b.date < oneWeekAgo.toISOString().slice(0, 10));
  const allIncidents = behaviour.filter((b) => b.behaviour_points > 0);

  const recentPts = recentIncidents.reduce((s, b) => s + b.behaviour_points, 0);
  const prevPts = prevWeekIncidents.reduce((s, b) => s + b.behaviour_points, 0);
  const totalPts = allIncidents.reduce((s, b) => s + b.behaviour_points, 0);

  // ── Behaviour pattern analysis ───────────────────────────────────────────
  const subjectMap = new Map<string, number>();
  const periodMap = new Map<string, number>();
  const staffMap = new Map<string, number>();
  const typeMap = new Map<string, number>();
  const dayMap = new Map<string, number>();
  allIncidents.forEach((b) => {
    if (b.subject) subjectMap.set(b.subject, (subjectMap.get(b.subject) || 0) + 1);
    if (b.lesson_period) periodMap.set(b.lesson_period, (periodMap.get(b.lesson_period) || 0) + 1);
    if (b.staff_member) staffMap.set(b.staff_member, (staffMap.get(b.staff_member) || 0) + 1);
    if (b.incident_type) typeMap.set(b.incident_type, (typeMap.get(b.incident_type) || 0) + 1);
    if (b.date) {
      const day = DAY_NAMES[new Date(b.date).getDay()];
      dayMap.set(day, (dayMap.get(day) || 0) + 1);
    }
  });
  const topSubject = topEntry(subjectMap);
  const topPeriod = topEntry(periodMap);
  const topDay = topEntry(dayMap);
  const topType = topEntry(typeMap);

  // Trend (split in halves)
  const sorted = [...allIncidents].sort((a, b) => a.date.localeCompare(b.date));
  const half = Math.ceil(sorted.length / 2);
  const firstPts = sorted.slice(0, half).reduce((s, b) => s + b.behaviour_points, 0);
  const secondPts = sorted.slice(half).reduce((s, b) => s + b.behaviour_points, 0);
  const behaviourEscalating = secondPts > firstPts * 1.2 && firstPts > 0;
  const behaviourImproving = secondPts < firstPts * 0.8 && firstPts > 0;
  const safeguardingNotes = behaviour.filter((b) => b.safeguarding_note);

  // ── Teacher observations ─────────────────────────────────────────────────
  const staffObservations = quickNotes.filter((n) => n.category !== 'Positive observation');
  const positiveNotes = quickNotes.filter((n) => n.category === 'Positive observation');
  const highConcernNotes = quickNotes.filter((n) => n.concern_level >= 4);
  const uniqueStaff = new Set(quickNotes.map((n) => n.staff_member));

  // ── Attendance patterns ──────────────────────────────────────────────────
  const lates = behaviour.filter((b) => b.incident_type === 'Late');
  const attendancePct = student.attendance_pct ?? 95;
  const attendanceConcern = attendancePct < 90;
  const attendanceSevere = attendancePct < 80;

  // ── Intervention history ─────────────────────────────────────────────────
  const activeInts = interventions.filter((i) => !['completed', 'closed', 'cancelled'].includes(i.status));
  const completedInts = interventions.filter((i) => ['completed', 'closed'].includes(i.status));
  const reviewedInts = interventions.filter((i) => i.review_completed);
  const effectiveInts = reviewedInts.filter((i) => i.outcome_status === 'resolved' || i.outcome_status === 'improving');
  const escalatingInts = reviewedInts.filter((i) => i.outcome_status === 'escalating');

  // ── Recommended next actions ─────────────────────────────────────────────
  type NextAction = { action: string; why: string; urgency: 'now' | 'this_week' | 'monitor'; sources: string[]; evidence: string[]; confidence: 'low' | 'medium' | 'high' };
  const nextActions: NextAction[] = [];

  if (safeguardingNotes.length > 0) {
    nextActions.push({
      action: 'Review safeguarding notes with DSL',
      why: 'Safeguarding concerns have been logged and require timely review',
      urgency: 'now',
      sources: ['Behaviour', 'Teacher Notes'],
      evidence: safeguardingNotes.map((n) => `${n.date}: "${n.safeguarding_note}"`),
      confidence: 'high',
    });
  }
  if (highConcernNotes.length > 0 && !activeInts.some((i) => i.action_type === 'Pastoral meeting')) {
    nextActions.push({
      action: 'Arrange a pastoral meeting',
      why: `${highConcernNotes.length} high-concern observation${highConcernNotes.length !== 1 ? 's have' : ' has'} been logged by staff`,
      urgency: 'now',
      sources: ['Teacher Notes'],
      evidence: highConcernNotes.map((n) => `${n.date} (${n.staff_member}): "${n.note.slice(0, 80)}${n.note.length > 80 ? '...' : ''}"`),
      confidence: 'high',
    });
  }
  if (behaviourEscalating && !activeInts.some((i) => i.action_type === 'Parent/carer contact')) {
    nextActions.push({
      action: 'Consider parent/carer contact',
      why: 'The data suggests behaviour points are increasing — parental awareness may be appropriate',
      urgency: 'this_week',
      sources: ['Behaviour'],
      evidence: [`First half: ${firstPts} pts, recent half: ${secondPts} pts`, `${allIncidents.length} total incidents`],
      confidence: 'medium',
    });
  }
  if (attendanceConcern && !activeInts.some((i) => i.action_type === 'Attendance meeting')) {
    nextActions.push({
      action: `${attendanceSevere ? 'Urgent: arrange' : 'Consider'} attendance meeting`,
      why: `Attendance at ${attendancePct}% — ${attendanceSevere ? 'significantly below' : 'below'} the 90% target`,
      urgency: attendanceSevere ? 'now' : 'this_week',
      sources: ['Attendance'],
      evidence: [`Current attendance: ${attendancePct}%`, `${lates.length} late incidents recorded`],
      confidence: attendanceSevere ? 'high' : 'medium',
    });
  }
  if (topSubject && pct(topSubject[1], allIncidents.length) >= 40) {
    nextActions.push({
      action: `Speak with ${topSubject[0]} teacher`,
      why: `The data suggests ${pct(topSubject[1], allIncidents.length)}% of incidents occur in ${topSubject[0]} — a conversation may clarify context`,
      urgency: 'this_week',
      sources: ['Behaviour', 'Teacher Notes'],
      evidence: [`${topSubject[1]} of ${allIncidents.length} incidents in ${topSubject[0]}`],
      confidence: topSubject[1] >= 4 ? 'high' : 'medium',
    });
  }
  if (student.send_status && !completedInts.some((i) => i.action_type === 'SEND review')) {
    nextActions.push({
      action: 'Schedule SEND review',
      why: 'SEND status on record — provision should be reviewed in light of current concerns',
      urgency: 'this_week',
      sources: ['SEND', 'Behaviour'],
      evidence: [`SEND status: ${student.send_status}`, `${allIncidents.length} behaviour incidents on file`],
      confidence: 'medium',
    });
  }
  const reviewDue = activeInts.filter((i) => i.review_date && i.review_date <= todayStr);
  if (reviewDue.length > 0) {
    nextActions.push({
      action: `Complete ${reviewDue.length} overdue review${reviewDue.length !== 1 ? 's' : ''}`,
      why: 'Review dates have passed — outcomes should be recorded to inform next steps',
      urgency: 'now',
      sources: ['Intervention Outcomes'],
      evidence: reviewDue.map((i) => `${i.action_type} — review was due ${i.review_date}`),
      confidence: 'high',
    });
  }
  if (behaviourImproving && effectiveInts.length > 0) {
    nextActions.push({
      action: 'Recognise and record improvement',
      why: 'The data suggests behaviour is improving — recording this outcome supports continuity of care',
      urgency: 'monitor',
      sources: ['Behaviour', 'Intervention Outcomes'],
      evidence: [`Recent points: ${secondPts} vs earlier: ${firstPts}`, `${effectiveInts.length} intervention${effectiveInts.length !== 1 ? 's' : ''} rated as effective`],
      confidence: 'medium',
    });
  }
  if (nextActions.length === 0) {
    nextActions.push({
      action: 'Continue routine monitoring',
      why: 'No immediate concerns detected in available data',
      urgency: 'monitor',
      sources: ['Behaviour', 'Attendance'],
      evidence: [`${allIncidents.length} incidents on record`, `Attendance: ${attendancePct}%`],
      confidence: 'low',
    });
  }

  // ── Weekly summary ───────────────────────────────────────────────────────
  const weekChanged = recentPts !== prevPts;
  const weekEscalated = recentPts > prevPts * 1.3 && prevPts > 0;
  const weekImproved = recentPts < prevPts * 0.7 && prevPts > 0;

  const URGENCY_CFG = {
    now: { label: 'Act now', classes: 'bg-red-100 text-red-700 border-red-200', dot: 'bg-red-500' },
    this_week: { label: 'This week', classes: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400' },
    monitor: { label: 'Monitor', classes: 'bg-slate-100 text-slate-600 border-slate-200', dot: 'bg-slate-400' },
  };

  const TYPE_DOT_LOCAL: Record<string, string> = {
    behaviour: 'bg-red-400', attendance: 'bg-blue-400', pastoral: 'bg-purple-400',
    intervention: 'bg-teal-400', outcome: 'bg-emerald-400', send: 'bg-amber-400',
    signal: 'bg-slate-400', review: 'bg-orange-400',
  };
  const TYPE_COLORS_LOCAL: Record<string, string> = {
    behaviour: 'bg-red-100 text-red-700', attendance: 'bg-blue-100 text-blue-700',
    pastoral: 'bg-purple-100 text-purple-700', intervention: 'bg-teal-100 text-teal-700',
    outcome: 'bg-emerald-100 text-emerald-700', send: 'bg-amber-100 text-amber-700',
    signal: 'bg-slate-100 text-slate-700', review: 'bg-orange-100 text-orange-700',
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-base font-bold text-slate-800">Insights + Evidence</h3>
          <p className="text-xs text-slate-500 mt-0.5">What changed · Why it matters · What to do next</p>
        </div>
        <button onClick={onAddNote} className="btn-secondary text-xs"><Plus className="w-3.5 h-3.5" /> Add note</button>
      </div>

      {/* ── 1. Weekly Summary ── */}
      <div className="card-premium overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <CalendarDays className="w-4 h-4 text-teal-600" />
          <h4 className="font-bold text-slate-800 text-sm">Weekly Summary</h4>
          <span className="text-[10px] text-slate-400 italic ml-auto">Last 7 days vs prior week</span>
        </div>
        <div className="p-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              {
                label: 'Incidents this week',
                value: recentIncidents.length,
                delta: recentIncidents.length - prevWeekIncidents.length,
                bad: recentIncidents.length > prevWeekIncidents.length,
                sub: `${recentPts} pts`,
              },
              {
                label: 'Behaviour points',
                value: recentPts,
                delta: recentPts - prevPts,
                bad: recentPts > prevPts,
                sub: prevPts > 0 ? `was ${prevPts} last week` : 'no prior data',
              },
              {
                label: 'Attendance',
                value: `${attendancePct}%`,
                delta: null,
                bad: attendanceConcern,
                sub: attendanceSevere ? 'Severely below target' : attendanceConcern ? 'Below 90% target' : 'On target',
              },
              {
                label: 'Open actions',
                value: activeInts.length,
                delta: null,
                bad: activeInts.length > 3,
                sub: `${reviewDue.length} review${reviewDue.length !== 1 ? 's' : ''} due`,
              },
            ].map((s, i) => (
              <div key={i} className={`rounded-xl border p-3.5 text-center ${s.bad ? 'bg-red-50 border-red-200' : 'bg-slate-50 border-slate-200'}`}>
                <div className={`text-xl font-extrabold ${s.bad ? 'text-red-700' : 'text-slate-800'}`}>{s.value}</div>
                <div className="text-[10px] font-semibold text-slate-500 mt-0.5 leading-tight">{s.label}</div>
                {s.delta !== null && s.delta !== 0 && (
                  <div className={`text-[10px] font-bold mt-0.5 ${s.delta > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {s.delta > 0 ? `+${s.delta}` : s.delta} vs last week
                  </div>
                )}
                <div className="text-[10px] text-slate-400 mt-0.5">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* What changed this week */}
          <div className={`rounded-xl border p-4 ${weekEscalated ? 'bg-red-50 border-red-200' : weekImproved ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
            <div className="flex items-start gap-2">
              {weekEscalated
                ? <TrendingDown className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                : weekImproved
                ? <TrendingUp className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                : <Activity className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" />}
              <div>
                <div className={`text-sm font-semibold ${weekEscalated ? 'text-red-800' : weekImproved ? 'text-emerald-800' : 'text-slate-700'}`}>
                  {weekEscalated
                    ? 'The data suggests behaviour has worsened this week'
                    : weekImproved
                    ? 'The data suggests improvement compared to last week'
                    : weekChanged
                    ? 'Behaviour this week is broadly similar to last week'
                    : 'No behaviour incidents recorded this week'}
                </div>
                <p className={`text-xs mt-0.5 ${weekEscalated ? 'text-red-700' : weekImproved ? 'text-emerald-700' : 'text-slate-500'}`}>
                  {recentIncidents.length > 0
                    ? `${recentIncidents.length} incident${recentIncidents.length !== 1 ? 's' : ''} · ${recentPts} pts this week`
                    : 'Clean week recorded in behaviour data'}
                  {prevWeekIncidents.length > 0 && ` · ${prevWeekIncidents.length} incident${prevWeekIncidents.length !== 1 ? 's' : ''} last week`}
                </p>
              </div>
            </div>
          </div>

          <EvidExpander
            title="Data used to generate this weekly summary"
            evidence={[
              `This week: ${recentIncidents.length} incidents, ${recentPts} pts`,
              `Last week: ${prevWeekIncidents.length} incidents, ${prevPts} pts`,
              `Overall: ${allIncidents.length} incidents, ${totalPts} pts`,
              `Attendance: ${attendancePct}%`,
              `Open interventions: ${activeInts.length}`,
            ]}
            sources={['Behaviour', 'Attendance', 'Intervention Outcomes']}
          />
        </div>
      </div>

      {/* ── 2. Behaviour Patterns ── */}
      {allIncidents.length > 0 && (
        <div className="card-premium overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-red-500" />
              <h4 className="font-bold text-slate-800 text-sm">Behaviour Patterns</h4>
            </div>
            <p className="text-[11px] text-slate-400 italic">Patterns are indicators — not conclusions</p>
          </div>
          <div className="p-5 space-y-4">
            {/* Key pattern pills */}
            <div className="grid sm:grid-cols-2 gap-3">
              {topSubject && (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <BookOpen className="w-4 h-4 text-slate-500 shrink-0" />
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Most common subject</div>
                    <div className="text-sm font-bold text-slate-800">{topSubject[0]}</div>
                    <div className="text-[10px] text-slate-500">{topSubject[1]} of {allIncidents.length} incidents ({pct(topSubject[1], allIncidents.length)}%)</div>
                  </div>
                  <SrcBadge source="Behaviour" />
                </div>
              )}
              {topPeriod && (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <Clock className="w-4 h-4 text-slate-500 shrink-0" />
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Most common period</div>
                    <div className="text-sm font-bold text-slate-800">{topPeriod[0]}</div>
                    <div className="text-[10px] text-slate-500">{topPeriod[1]} of {allIncidents.length} incidents ({pct(topPeriod[1], allIncidents.length)}%)</div>
                  </div>
                  <SrcBadge source="Behaviour" />
                </div>
              )}
              {topDay && (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <CalendarDays className="w-4 h-4 text-slate-500 shrink-0" />
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Most common day</div>
                    <div className="text-sm font-bold text-slate-800">{topDay[0]}s</div>
                    <div className="text-[10px] text-slate-500">{topDay[1]} of {allIncidents.length} incidents</div>
                  </div>
                  <SrcBadge source="Behaviour" />
                </div>
              )}
              {topType && (
                <div className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                  <div>
                    <div className="text-xs text-slate-400 font-medium">Most common type</div>
                    <div className="text-sm font-bold text-slate-800">{topType[0]}</div>
                    <div className="text-[10px] text-slate-500">{topType[1]} of {allIncidents.length} incidents</div>
                  </div>
                  <SrcBadge source="Behaviour" />
                </div>
              )}
            </div>

            {/* Trend statement */}
            <div className={`flex items-start gap-3 p-4 rounded-xl border ${behaviourEscalating ? 'bg-red-50 border-red-200' : behaviourImproving ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
              {behaviourEscalating
                ? <TrendingDown className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                : behaviourImproving
                ? <TrendingUp className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                : <Activity className="w-4 h-4 text-slate-400 mt-0.5 shrink-0" />}
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  {behaviourEscalating
                    ? 'The data suggests behaviour is escalating over this period'
                    : behaviourImproving
                    ? 'The data suggests behaviour has improved over this period'
                    : 'Behaviour trend appears stable over the recorded period'}
                </div>
                <p className="text-xs text-slate-500 mt-0.5">
                  Earlier period: {firstPts} pts · Recent period: {secondPts} pts · Total: {totalPts} pts across {allIncidents.length} incidents
                </p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <ConfBadge level={behaviourEscalating || behaviourImproving ? 'high' : 'low'} />
                  <SrcBadge source="Behaviour" />
                </div>
              </div>
            </div>

            {safeguardingNotes.length > 0 && (
              <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
                <ShieldAlert className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-red-800">{safeguardingNotes.length} safeguarding note{safeguardingNotes.length !== 1 ? 's' : ''} on record</div>
                  <div className="text-xs text-red-700 mt-0.5">Review with DSL — safeguarding notes require timely professional review</div>
                  <EvidExpander
                    title="Safeguarding notes"
                    evidence={safeguardingNotes.map((n) => `${n.date}: "${n.safeguarding_note}"`)}
                    sources={['Behaviour']}
                  />
                </div>
              </div>
            )}

            <EvidExpander
              title="Data used for behaviour pattern analysis"
              evidence={[
                `${allIncidents.length} incidents analysed`,
                topSubject ? `Top subject: ${topSubject[0]} (${topSubject[1]} incidents)` : 'No subject data',
                topPeriod ? `Top period: ${topPeriod[0]} (${topPeriod[1]} incidents)` : 'No period data',
                topDay ? `Top day: ${topDay[0]} (${topDay[1]} incidents)` : 'No day data',
                `Trend split: ${firstPts} pts (earlier) vs ${secondPts} pts (recent)`,
              ]}
              sources={['Behaviour']}
            />
          </div>
        </div>
      )}

      {/* ── 3. Attendance Patterns ── */}
      <div className="card-premium overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
          <Clock className="w-4 h-4 text-blue-500" />
          <h4 className="font-bold text-slate-800 text-sm">Attendance Patterns</h4>
          <SrcBadge source="Attendance" />
        </div>
        <div className="p-5 space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className={`rounded-xl border p-3.5 text-center ${attendanceSevere ? 'bg-red-50 border-red-200' : attendanceConcern ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
              <div className={`text-2xl font-extrabold ${attendanceSevere ? 'text-red-700' : attendanceConcern ? 'text-amber-700' : 'text-emerald-700'}`}>{attendancePct}%</div>
              <div className="text-[10px] font-semibold text-slate-500 mt-0.5">Attendance</div>
              <div className={`text-[10px] mt-0.5 font-medium ${attendanceSevere ? 'text-red-600' : attendanceConcern ? 'text-amber-600' : 'text-emerald-600'}`}>
                {attendanceSevere ? 'Severely below target' : attendanceConcern ? 'Below 90% target' : 'On target'}
              </div>
            </div>
            <div className="rounded-xl border bg-slate-50 border-slate-200 p-3.5 text-center">
              <div className="text-2xl font-extrabold text-slate-800">{lates.length}</div>
              <div className="text-[10px] font-semibold text-slate-500 mt-0.5">Late incidents</div>
            </div>
            <div className="rounded-xl border bg-slate-50 border-slate-200 p-3.5 text-center">
              <div className="text-2xl font-extrabold text-slate-800">{behaviour.filter((b) => b.incident_type === 'Isolation' || b.incident_type === 'Removal').length}</div>
              <div className="text-[10px] font-semibold text-slate-500 mt-0.5">Removals</div>
            </div>
          </div>

          <div className={`flex items-start gap-3 p-4 rounded-xl border ${attendanceSevere ? 'bg-red-50 border-red-200' : attendanceConcern ? 'bg-amber-50 border-amber-200' : 'bg-emerald-50 border-emerald-200'}`}>
            <Clock className={`w-4 h-4 mt-0.5 shrink-0 ${attendanceSevere ? 'text-red-600' : attendanceConcern ? 'text-amber-600' : 'text-emerald-600'}`} />
            <div>
              <div className="text-sm font-semibold text-slate-800">
                {attendanceSevere
                  ? 'The data suggests severely low attendance — immediate review warranted'
                  : attendanceConcern
                  ? 'The data suggests attendance is below target'
                  : 'Attendance is currently on target'}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                {attendanceConcern
                  ? `At ${attendancePct}%, this student is ${attendanceSevere ? `${80 - attendancePct}% below` : `${90 - attendancePct}% below`} target${lates.length > 0 ? ` · ${lates.length} late incidents may reflect a punctuality pattern` : ''}`
                  : `${attendancePct}% meets or exceeds the school target of 90%`}
              </p>
              <ConfBadge level={attendanceSevere ? 'high' : attendanceConcern ? 'medium' : 'low'} />
            </div>
          </div>

          {lates.length >= 2 && (
            <div className="text-xs text-slate-600 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5">
              <span className="font-semibold">Possible pattern detected: </span>
              {lates.length} late incidents recorded. Dates: {lates.slice(0, 5).map((l) => l.date).join(', ')}{lates.length > 5 ? '...' : ''}.
            </div>
          )}

          <EvidExpander
            title="Attendance data"
            evidence={[
              `Recorded attendance: ${attendancePct}%`,
              `Late incidents: ${lates.length}`,
              `Removal/isolation incidents: ${behaviour.filter((b) => b.incident_type === 'Isolation' || b.incident_type === 'Removal').length}`,
              'Target: 90%',
            ]}
            sources={['Attendance', 'Behaviour']}
          />
        </div>
      </div>

      {/* ── 4. Teacher Observation Summary ── */}
      {quickNotes.length > 0 && (
        <div className="card-premium overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-amber-500" />
              <h4 className="font-bold text-slate-800 text-sm">Teacher Observation Summary</h4>
            </div>
            <SrcBadge source="Teacher Notes" />
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: 'Total notes', value: quickNotes.length, color: 'text-slate-800' },
                { label: 'High concern', value: highConcernNotes.length, color: highConcernNotes.length > 0 ? 'text-red-700' : 'text-slate-800' },
                { label: 'Staff involved', value: uniqueStaff.size, color: 'text-slate-800' },
              ].map((s, i) => (
                <div key={i} className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
                  <div className={`text-xl font-extrabold ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-semibold">{s.label}</div>
                </div>
              ))}
            </div>

            {highConcernNotes.length > 0 && (
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">High-concern observations (level 4–5)</div>
                {highConcernNotes.slice(0, 3).map((n, i) => (
                  <div key={i} className="p-3.5 rounded-xl bg-orange-50 border border-orange-200">
                    <div className="flex items-center justify-between gap-2 mb-1 flex-wrap">
                      <span className="text-xs font-semibold text-orange-800">{n.category}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-slate-500">{n.staff_member} · {new Date(n.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                        <span className="text-[10px] bg-orange-100 text-orange-700 border border-orange-200 px-1.5 py-0.5 rounded-full font-bold">{n.concern_level}/5</span>
                      </div>
                    </div>
                    <p className="text-xs text-slate-700 leading-relaxed">"{n.note}"</p>
                  </div>
                ))}
                {highConcernNotes.length > 3 && (
                  <p className="text-xs text-slate-400 italic text-center">+{highConcernNotes.length - 3} more high-concern notes</p>
                )}
              </div>
            )}

            {positiveNotes.length > 0 && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200">
                <Star className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-emerald-800">{positiveNotes.length} positive observation{positiveNotes.length !== 1 ? 's' : ''} on record</div>
                  <p className="text-xs text-emerald-700 mt-0.5">{positiveNotes[0]?.note?.slice(0, 100)}{(positiveNotes[0]?.note?.length || 0) > 100 ? '...' : ''}</p>
                </div>
              </div>
            )}

            <EvidExpander
              title="Staff observation data"
              evidence={[
                `${quickNotes.length} notes recorded by ${uniqueStaff.size} staff member${uniqueStaff.size !== 1 ? 's' : ''}`,
                `${highConcernNotes.length} high-concern observations (level 4–5)`,
                `${positiveNotes.length} positive observations`,
                `Most recent: ${quickNotes[0]?.date || 'N/A'} by ${quickNotes[0]?.staff_member || 'Unknown'}`,
              ]}
              sources={['Teacher Notes']}
            />
          </div>
        </div>
      )}

      {/* ── 5. Intervention History ── */}
      {interventions.length > 0 && (
        <div className="card-premium overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-teal-600" />
            <h4 className="font-bold text-slate-800 text-sm">Intervention History</h4>
            <SrcBadge source="Intervention Outcomes" />
          </div>
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Total actions', value: interventions.length, color: 'text-slate-800' },
                { label: 'Active', value: activeInts.length, color: activeInts.length > 0 ? 'text-teal-700' : 'text-slate-800' },
                { label: 'Effective', value: effectiveInts.length, color: effectiveInts.length > 0 ? 'text-emerald-700' : 'text-slate-800' },
                { label: 'Escalated', value: escalatingInts.length, color: escalatingInts.length > 0 ? 'text-red-700' : 'text-slate-800' },
              ].map((s, i) => (
                <div key={i} className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-center">
                  <div className={`text-xl font-extrabold ${s.color}`}>{s.value}</div>
                  <div className="text-[10px] text-slate-500 mt-0.5 font-semibold">{s.label}</div>
                </div>
              ))}
            </div>

            {reviewDue.length > 0 && (
              <div className="flex items-start gap-3 p-3.5 rounded-xl bg-orange-50 border border-orange-200">
                <RotateCcw className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-orange-800">{reviewDue.length} review{reviewDue.length !== 1 ? 's' : ''} overdue</div>
                  <div className="text-xs text-orange-700 mt-0.5 space-y-0.5">
                    {reviewDue.map((i) => (
                      <div key={i.id}>{i.action_type} — due {i.review_date}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              {interventions.slice(0, 5).map((i) => {
                const outCfg = {
                  resolved: { color: 'text-emerald-700', label: 'Resolved' },
                  improving: { color: 'text-teal-700', label: 'Improving' },
                  sustained: { color: 'text-emerald-700', label: 'Sustained' },
                  no_change: { color: 'text-amber-700', label: 'No change' },
                  escalating: { color: 'text-red-700', label: 'Escalated' },
                }[i.outcome_status || ''] || null;
                return (
                  <div key={i.id} className="flex items-center gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${['completed', 'closed'].includes(i.status) ? 'bg-emerald-400' : i.status === 'escalated' ? 'bg-red-400' : 'bg-teal-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-slate-800 truncate">{i.action_type}</div>
                      <div className="text-[10px] text-slate-500">{i.assigned_to} · {i.created_at.slice(0, 10)}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="text-[10px] bg-white border border-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium capitalize">{i.status.replace('_', ' ')}</span>
                      {outCfg && <span className={`text-[10px] font-semibold ${outCfg.color}`}>{outCfg.label}</span>}
                    </div>
                  </div>
                );
              })}
            </div>

            <EvidExpander
              title="Intervention history data"
              evidence={[
                `${interventions.length} total interventions recorded`,
                `${effectiveInts.length} reviewed as effective`,
                `${escalatingInts.length} escalated after intervention`,
                `${reviewDue.length} reviews overdue`,
                `Most recent: ${interventions[0]?.action_type || 'N/A'} (${interventions[0]?.created_at?.slice(0, 10) || 'N/A'})`,
              ]}
              sources={['Intervention Outcomes']}
            />
          </div>
        </div>
      )}

      {/* ── 6. Recommended Next Actions ── */}
      <div className="card-premium overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-teal-600" />
            <h4 className="font-bold text-slate-800 text-sm">Recommended Next Actions</h4>
          </div>
          <p className="text-[11px] text-slate-400 italic">Suggested by data — professional judgement required</p>
        </div>
        <div className="divide-y divide-slate-100">
          {nextActions.map((a, i) => {
            const ucfg = URGENCY_CFG[a.urgency];
            return (
              <div key={i} className="px-5 py-4">
                <div className="flex items-start gap-3">
                  <span className={`w-2 h-2 rounded-full mt-2 shrink-0 ${ucfg.dot}`} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-bold text-slate-900">{a.action}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${ucfg.classes}`}>{ucfg.label}</span>
                      <ConfBadge level={a.confidence} />
                    </div>
                    <p className="text-xs text-slate-600 leading-relaxed mb-1.5">{a.why}</p>
                    <div className="flex flex-wrap gap-1">
                      {a.sources.map((s) => <SrcBadge key={s} source={s} />)}
                    </div>
                    <EvidExpander
                      title="Why was this action suggested?"
                      evidence={a.evidence}
                      sources={a.sources}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Raw events — collapsed ── */}
      <div className="card-premium overflow-hidden">
        <button
          onClick={() => setRawExpanded(!rawExpanded)}
          className="w-full px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-semibold text-slate-600">View raw events</span>
            <span className="text-xs text-slate-400">({timeline.length} events in chronological order)</span>
          </div>
          {rawExpanded
            ? <ChevronUp className="w-4 h-4 text-slate-400" />
            : <ChevronDown className="w-4 h-4 text-slate-400" />}
        </button>
        {rawExpanded && (
          <div className="border-t border-slate-100">
            {timeline.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-slate-500">No events recorded yet</div>
            ) : (
              <div className="relative ml-6 px-0 py-4">
                <div className="absolute left-0 top-0 bottom-0 w-0.5 bg-slate-200 ml-[-1px]" />
                <div className="space-y-0 ml-2">
                  {timeline.map((event, idx) => {
                    const dotColor = TYPE_DOT_LOCAL[event.type] || 'bg-slate-400';
                    const badgeColor = TYPE_COLORS_LOCAL[event.type] || 'bg-slate-100 text-slate-600';
                    return (
                      <div key={idx} className="relative pl-8 pb-4">
                        <div className={`absolute left-[-13px] top-1.5 w-3 h-3 rounded-full border-2 border-white shadow-sm ${dotColor}`} />
                        <div className="bg-white border border-slate-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
                          <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${badgeColor}`}>{event.category}</span>
                              {event.severity === 'high' && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase bg-red-100 text-red-700">High</span>}
                            </div>
                            <span className="text-[10px] text-slate-400 font-medium shrink-0">{new Date(event.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          </div>
                          <div className="font-semibold text-slate-800 text-xs mb-0.5">{event.title}</div>
                          <div className="text-xs text-slate-600 leading-relaxed">{event.description}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Pattern Engine — cross-source detection
// ─────────────────────────────────────────────────────────────────────────────

interface DetectedPattern {
  id: string;
  name: string;
  description: string;
  confidenceScore: number;
  confidenceLevel: 'low' | 'medium' | 'high';
  sources: string[];
  evidence: { source: string; metric: string; value: string; date?: string }[];
  timePeriod: string;
  whyGenerated: string[];
  suggestedAction: string;
  reviewWeeks: number;
  urgency: 'now' | 'this_week' | 'monitor';
  emergenceTimeline: { weekLabel: string; events: string[]; significance: 'normal' | 'warning' | 'critical' }[];
}

function buildSubjectTimeline(
  subjectRecs: BehaviourRecord[],
  otherRecs: BehaviourRecord[],
  subjectLabel: string,
): DetectedPattern['emergenceTimeline'] {
  const allRecs = [...subjectRecs, ...otherRecs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  if (allRecs.length === 0) return [];
  const firstDate = new Date(allRecs[0].date);
  const weeks = new Map<number, { subject: number; other: number }>();
  allRecs.forEach(r => {
    const wk = Math.floor((new Date(r.date).getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (!weeks.has(wk)) weeks.set(wk, { subject: 0, other: 0 });
    const w = weeks.get(wk)!;
    if (subjectRecs.includes(r)) w.subject++; else w.other++;
  });
  const result: DetectedPattern['emergenceTimeline'] = [];
  weeks.forEach((counts, wk) => {
    const events: string[] = [];
    if (counts.other > 0) events.push(`${counts.other} other incident${counts.other > 1 ? 's' : ''}`);
    if (counts.subject > 0) events.push(`${counts.subject} ${subjectLabel} incident${counts.subject > 1 ? 's' : ''}`);
    result.push({
      weekLabel: `Week ${wk + 1}`,
      events,
      significance: counts.subject > 1 ? 'critical' : counts.subject > 0 ? 'warning' : 'normal',
    });
  });
  return result;
}

function buildBehaviourTimeline(sorted: BehaviourRecord[]): DetectedPattern['emergenceTimeline'] {
  if (sorted.length < 2) return [];
  const firstDate = new Date(sorted[0].date);
  const weeks = new Map<number, BehaviourRecord[]>();
  sorted.forEach(r => {
    const wk = Math.floor((new Date(r.date).getTime() - firstDate.getTime()) / (7 * 24 * 60 * 60 * 1000));
    if (!weeks.has(wk)) weeks.set(wk, []);
    weeks.get(wk)!.push(r);
  });
  const result: DetectedPattern['emergenceTimeline'] = [];
  weeks.forEach((recs, wk) => {
    const pts = recs.reduce((s, r) => s + (r.behaviour_points || 1), 0);
    result.push({
      weekLabel: `Week ${wk + 1}`,
      events: [`${recs.length} incident${recs.length > 1 ? 's' : ''} · ${pts} point${pts !== 1 ? 's' : ''}`],
      significance: pts >= 4 ? 'critical' : pts >= 2 ? 'warning' : 'normal',
    });
  });
  return result;
}

function buildNotesEmergenceTimeline(notes: QuickNote[]): DetectedPattern['emergenceTimeline'] {
  return [...notes].reverse().slice(0, 6).map(n => ({
    weekLabel: formatDate(n.date),
    events: [`${n.category} (level ${n.concern_level}) — ${n.staff_member}: "${n.note.slice(0, 70)}${n.note.length > 70 ? '...' : ''}"`],
    significance: n.concern_level >= 5 ? 'critical' as const : n.concern_level >= 3 ? 'warning' as const : 'normal' as const,
  }));
}

function computePatterns(
  student: Student,
  behaviour: BehaviourRecord[],
  analysis: AnalysisResult | null,
  interventions: Intervention[],
  quickNotes: QuickNote[],
  career: CareerProfile | null,
): DetectedPattern[] {
  const patterns: DetectedPattern[] = [];
  const now = new Date();
  const attendance = student.attendance_pct ?? 95;
  const incidentCount = behaviour.length;
  const sorted = [...behaviour].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // ── 1. Subject concentration ────────────────────────────
  if (incidentCount >= 3) {
    const subjectMap = new Map<string, number>();
    behaviour.forEach(r => { if (r.subject) subjectMap.set(r.subject, (subjectMap.get(r.subject) || 0) + 1); });
    const top = topEntry(subjectMap);
    if (top && top[1] / incidentCount >= 0.35) {
      const subName = top[0] as string;
      const subPct = pct(top[1], incidentCount);
      const subNotes = quickNotes.filter(n => n.note.toLowerCase().includes(subName.toLowerCase()));
      const sources = ['Behaviour'];
      if (subNotes.length > 0) sources.push('Teacher Notes');
      const score = Math.min(95, (sources.length >= 2 ? 52 : 32) + Math.min(20, subPct - 35));
      patterns.push({
        id: 'subject_concentration',
        name: `Possible disengagement in ${subName}`,
        description: `The data suggests a concentration of incidents in ${subName} — ${top[1]} of ${incidentCount} behaviour records (${subPct}%) are linked to this subject. Possible engagement or environmental trigger.`,
        confidenceScore: score,
        confidenceLevel: sources.length >= 3 ? 'high' : sources.length === 2 ? 'medium' : 'low',
        sources,
        evidence: [
          { source: 'Behaviour', metric: `${subName} incidents`, value: `${top[1]} of ${incidentCount} (${subPct}%)`, date: sorted[0]?.date },
          ...subNotes.slice(0, 2).map(n => ({ source: 'Teacher Notes', metric: 'Staff note', value: `"${n.note.slice(0, 80)}${n.note.length > 80 ? '...' : ''}"`, date: n.date })),
        ],
        timePeriod: sorted.length > 0 ? `${formatDate(sorted[0].date)} – present` : 'Recent',
        whyGenerated: [
          `${subPct}% of all behaviour incidents recorded in ${subName} (threshold: 35%)`,
          `${top[1]} separate incidents linked to this subject`,
          sources.includes('Teacher Notes') ? `${subNotes.length} staff note(s) also reference ${subName}` : 'Based on behaviour data only — no supporting notes yet',
        ],
        suggestedAction: `Arrange a meeting with the ${subName} teacher to explore triggers, check seating/grouping, and agree a support plan`,
        reviewWeeks: 2,
        urgency: subPct >= 60 ? 'this_week' : 'monitor',
        emergenceTimeline: buildSubjectTimeline(
          behaviour.filter(r => r.subject === subName).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
          behaviour.filter(r => r.subject !== subName).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
          subName,
        ),
      });
    }
  }

  // ── 2. Attendance concern ───────────────────────────────
  if (attendance < 92) {
    const lates = student.punctuality_issues || 0;
    const attendNotes = quickNotes.filter(n => n.category === 'Attendance concern');
    const hasSend = !!student.send_status;
    const sources = ['Attendance'];
    if (attendNotes.length > 0) sources.push('Teacher Notes');
    if (hasSend) sources.push('SEND');
    const base = attendance < 80 ? 78 : attendance < 85 ? 65 : 52;
    const bonus = Math.min(15, attendNotes.length * 5 + (hasSend ? 5 : 0));
    patterns.push({
      id: 'attendance_concern',
      name: attendance < 80 ? 'Persistent absence — urgent review needed' : attendance < 85 ? 'Significant attendance concern' : 'Attendance below target',
      description: `The data indicates attendance is at ${attendance}%, which is below the 96% expected level.${lates > 0 ? ` ${lates} late mark${lates > 1 ? 's' : ''} also recorded.` : ''}`,
      confidenceScore: Math.min(95, base + bonus),
      confidenceLevel: sources.length >= 3 ? 'high' : sources.length === 2 ? 'medium' : 'low',
      sources,
      evidence: [
        { source: 'Attendance', metric: 'Current attendance', value: `${attendance}%` },
        { source: 'Attendance', metric: 'Punctuality issues', value: `${lates} late mark${lates !== 1 ? 's' : ''}` },
        ...attendNotes.slice(0, 2).map(n => ({ source: 'Teacher Notes', metric: 'Staff concern', value: `"${n.note.slice(0, 60)}${n.note.length > 60 ? '...' : ''}"`, date: n.date })),
        ...(hasSend ? [{ source: 'SEND', metric: 'SEND status', value: student.send_status || 'Recorded' }] : []),
      ],
      timePeriod: 'Current academic year',
      whyGenerated: [
        `Attendance of ${attendance}% is below the 96% expected threshold`,
        attendance < 80 ? 'Below 80% triggers persistent absence protocols' : attendance < 85 ? 'Below 85% warrants escalated pastoral support' : 'Between 85–92% warrants monitoring and early intervention',
        lates > 0 ? `${lates} late arrival${lates > 1 ? 's' : ''} recorded in addition to absences` : 'No late marks recorded',
        attendNotes.length > 0 ? `${attendNotes.length} staff note(s) specifically flag an attendance concern` : 'Attendance figure alone triggered this pattern',
      ],
      suggestedAction: attendance < 80
        ? 'Arrange attendance meeting with parent/carer urgently — consider referral to external support or Early Help'
        : attendance < 85
        ? 'Schedule attendance support meeting and contact parent/carer'
        : 'Monitor closely and arrange an informal check-in with the student',
      reviewWeeks: attendance < 80 ? 1 : attendance < 85 ? 2 : 4,
      urgency: attendance < 85 ? 'now' : 'this_week',
      emergenceTimeline: [
        { weekLabel: 'Baseline', events: ['Attendance monitoring begins'], significance: 'normal' },
        { weekLabel: 'Current', events: [`Attendance recorded at ${attendance}%`], significance: attendance < 85 ? 'critical' : 'warning' },
        ...(lates > 0 ? [{ weekLabel: 'Punctuality', events: [`${lates} late arrival${lates > 1 ? 's' : ''} recorded`], significance: 'warning' as const }] : []),
        ...attendNotes.slice(0, 2).map(n => ({ weekLabel: formatDate(n.date), events: [`Staff note: "${n.note.slice(0, 60)}..."`], significance: 'warning' as const })),
      ],
    });
  }

  // ── 3. Behaviour escalation ─────────────────────────────
  if (incidentCount >= 4) {
    const half = Math.floor(incidentCount / 2);
    const firstH = sorted.slice(0, half);
    const secondH = sorted.slice(half);
    const firstPts = firstH.reduce((s, r) => s + (r.behaviour_points || 1), 0);
    const secondPts = secondH.reduce((s, r) => s + (r.behaviour_points || 1), 0);
    if (secondPts > firstPts * 1.2) {
      const escalatingInterventions = interventions.filter(i => i.outcome_status === 'escalating');
      const sources = ['Behaviour'];
      if (escalatingInterventions.length > 0) sources.push('Intervention Outcomes');
      if (quickNotes.some(n => n.category === 'Behaviour concern')) sources.push('Teacher Notes');
      const changeRatio = Math.round((secondPts / Math.max(1, firstPts)) * 100) - 100;
      const base = sources.length >= 3 ? 72 : sources.length === 2 ? 58 : 42;
      patterns.push({
        id: 'behaviour_escalation',
        name: 'Behaviour escalation detected',
        description: `The data suggests behaviour is worsening — incident severity in the more recent period is approximately ${changeRatio}% higher than the earlier period.${escalatingInterventions.length > 0 ? ` ${escalatingInterventions.length} active intervention(s) have not reversed this trend.` : ''}`,
        confidenceScore: Math.min(92, base + Math.min(18, changeRatio / 3)),
        confidenceLevel: sources.length >= 3 ? 'high' : sources.length === 2 ? 'medium' : 'low',
        sources,
        evidence: [
          { source: 'Behaviour', metric: 'Earlier period', value: `${firstPts} pts across ${firstH.length} incidents`, date: firstH[0]?.date },
          { source: 'Behaviour', metric: 'Recent period', value: `${secondPts} pts across ${secondH.length} incidents`, date: secondH[secondH.length - 1]?.date },
          ...escalatingInterventions.map(i => ({ source: 'Intervention Outcomes', metric: 'Escalating outcome', value: i.action_type, date: i.review_date || undefined })),
        ],
        timePeriod: sorted.length > 0 ? `${formatDate(sorted[0].date)} – ${formatDate(sorted[sorted.length - 1].date)}` : 'Recent',
        whyGenerated: [
          `Recent period: ${secondPts} behaviour points vs ${firstPts} in earlier period (${changeRatio}% increase)`,
          'Escalation threshold: 20%+ increase in behaviour points across comparable periods',
          sources.includes('Intervention Outcomes') ? 'Existing interventions show escalating outcome status' : 'No intervention outcome data to confirm or challenge this trend',
          sources.includes('Teacher Notes') ? 'Staff notes also flag behaviour concern' : 'No supporting staff notes recorded',
        ],
        suggestedAction: 'Review current interventions urgently — consider escalating to parent/carer contact or a pastoral meeting',
        reviewWeeks: 1,
        urgency: 'now',
        emergenceTimeline: buildBehaviourTimeline(sorted),
      });
    }
  }

  // ── 4. Persistent pastoral concern ─────────────────────
  const highConcernNotes = quickNotes.filter(n => n.concern_level >= 3);
  if (highConcernNotes.length >= 2) {
    const maxLevel = Math.max(...highConcernNotes.map(n => n.concern_level));
    const categories = [...new Set(highConcernNotes.map(n => n.category))];
    const sources = ['Teacher Notes'];
    if (behaviour.length > 0) sources.push('Behaviour');
    const base = maxLevel >= 5 ? 72 : maxLevel >= 4 ? 60 : 45;
    patterns.push({
      id: 'pastoral_concern',
      name: maxLevel >= 5 ? 'Significant wellbeing concern' : 'Recurring pastoral concern',
      description: `${highConcernNotes.length} staff observation${highConcernNotes.length > 1 ? 's' : ''} have recorded concern levels of 3 or above. The data suggests a possible ongoing wellbeing need.`,
      confidenceScore: Math.min(90, base + Math.min(20, highConcernNotes.length * 5)),
      confidenceLevel: sources.length >= 3 ? 'high' : sources.length === 2 ? 'medium' : 'low',
      sources,
      evidence: [
        ...highConcernNotes.slice(0, 3).map(n => ({ source: 'Teacher Notes', metric: `${n.category} (level ${n.concern_level})`, value: `"${n.note.slice(0, 70)}${n.note.length > 70 ? '...' : ''}"`, date: n.date })),
        ...(behaviour.length > 0 ? [{ source: 'Behaviour', metric: 'Behaviour records on file', value: `${behaviour.length} incidents` }] : []),
      ],
      timePeriod: highConcernNotes.length > 0 ? `${formatDate(highConcernNotes[highConcernNotes.length - 1].date)} – ${formatDate(highConcernNotes[0].date)}` : 'Recent',
      whyGenerated: [
        `${highConcernNotes.length} staff notes recorded with concern level 3 or above (threshold: 2)`,
        `Highest concern level recorded: ${maxLevel}/5`,
        `Categories observed: ${categories.join(', ')}`,
        highConcernNotes.some(n => n.action_needed) ? 'One or more notes flagged as requiring follow-up action' : 'Notes logged without formal follow-up flagged yet',
      ],
      suggestedAction: maxLevel >= 5
        ? 'Arrange pastoral meeting urgently and consult DSL if a safeguarding concern is suspected'
        : 'Arrange a pastoral check-in and consider whether parent contact is appropriate',
      reviewWeeks: maxLevel >= 5 ? 1 : 2,
      urgency: maxLevel >= 5 ? 'now' : 'this_week',
      emergenceTimeline: buildNotesEmergenceTimeline(highConcernNotes),
    });
  }

  // ── 5. Safeguarding concern ─────────────────────────────
  const sfgBehaviour = behaviour.filter(r => r.safeguarding_note);
  const sfgNotes = quickNotes.filter(n => n.category === 'Safeguarding review prompt' || n.concern_level === 5);
  if (sfgBehaviour.length > 0 || sfgNotes.length > 0) {
    const sources: string[] = [];
    if (sfgBehaviour.length > 0) sources.push('Behaviour');
    if (sfgNotes.length > 0) sources.push('Teacher Notes');
    patterns.push({
      id: 'safeguarding',
      name: 'Safeguarding note recorded',
      description: `A safeguarding concern has been logged.${sfgBehaviour.length > 0 ? ` ${sfgBehaviour.length} behaviour record${sfgBehaviour.length > 1 ? 's' : ''} include a safeguarding note.` : ''}${sfgNotes.length > 0 ? ` ${sfgNotes.length} staff note${sfgNotes.length > 1 ? 's' : ''} flag a safeguarding or level-5 welfare concern.` : ''} DSL should be consulted immediately.`,
      confidenceScore: 88,
      confidenceLevel: 'high',
      sources,
      evidence: [
        ...sfgBehaviour.map(r => ({ source: 'Behaviour', metric: 'Safeguarding note', value: r.safeguarding_note || 'Recorded', date: r.date })),
        ...sfgNotes.map(n => ({ source: 'Teacher Notes', metric: `Level ${n.concern_level} concern`, value: `"${n.note.slice(0, 80)}${n.note.length > 80 ? '...' : ''}"`, date: n.date })),
      ],
      timePeriod: 'Active concern',
      whyGenerated: [
        ...(sfgBehaviour.length > 0 ? [`${sfgBehaviour.length} behaviour record(s) have a safeguarding note attached`] : []),
        ...(sfgNotes.length > 0 ? [`${sfgNotes.length} staff note(s) categorised as safeguarding concern or rated 5/5`] : []),
        'Any safeguarding flag is automatically assigned high confidence — do not delay action',
      ],
      suggestedAction: 'Consult DSL immediately. Do not act independently on any safeguarding disclosure.',
      reviewWeeks: 1,
      urgency: 'now',
      emergenceTimeline: [
        ...sfgBehaviour.map(r => ({ weekLabel: formatDate(r.date), events: [`Safeguarding note on behaviour record: "${r.safeguarding_note || 'Recorded'}"`], significance: 'critical' as const })),
        ...sfgNotes.map(n => ({ weekLabel: formatDate(n.date), events: [`Staff note level ${n.concern_level}: "${n.note.slice(0, 80)}..."`], significance: 'critical' as const })),
      ],
    });
  }

  // ── 6. SEND support gap ─────────────────────────────────
  if (student.send_status) {
    const sendActions = interventions.filter(i => i.action_type.toLowerCase().includes('send') || i.action_type.toLowerCase().includes('ehcp'));
    const recentReview = sendActions.find(i => {
      const weeksAgo = (now.getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24 * 7);
      return weeksAgo <= 8;
    });
    if (!recentReview) {
      const sources = ['SEND'];
      if (sendActions.length > 0) sources.push('Intervention Outcomes');
      patterns.push({
        id: 'send_gap',
        name: 'SEND review may be overdue',
        description: `The student has a recorded SEND status (${student.send_status}) but no SEND review has been logged in the last 8 weeks. Evidence suggests a review may be due.`,
        confidenceScore: sources.length >= 2 ? 68 : 52,
        confidenceLevel: sources.length >= 2 ? 'medium' : 'low',
        sources,
        evidence: [
          { source: 'SEND', metric: 'SEND status', value: student.send_status },
          { source: 'SEND', metric: 'Recent SEND review', value: 'None found in last 8 weeks' },
          ...sendActions.slice(0, 2).map(i => ({ source: 'Intervention Outcomes', metric: i.action_type, value: i.status, date: i.created_at })),
        ],
        timePeriod: 'Last 8 weeks',
        whyGenerated: [
          `Student has recorded SEND status: ${student.send_status}`,
          'No SEND review intervention found in the last 8 weeks',
          sendActions.length > 0 ? `${sendActions.length} SEND-related intervention(s) on record — most recent: ${sendActions[0]?.status}` : 'No SEND interventions on record at all',
        ],
        suggestedAction: 'Schedule a SEND review with SENDCo — ensure current provision is accurate and effective',
        reviewWeeks: 4,
        urgency: 'this_week',
        emergenceTimeline: [
          { weekLabel: 'Student record', events: [`SEND status: ${student.send_status}`], significance: 'normal' },
          ...sendActions.slice(0, 2).map(i => ({ weekLabel: formatDate(i.created_at), events: [`${i.action_type} — ${i.status}`], significance: 'warning' as const })),
          { weekLabel: 'Present', events: ['No recent SEND review on record'], significance: 'warning' },
        ],
      });
    }
  }

  // ── 7. Stale interventions ──────────────────────────────
  const stale = interventions.filter(i => {
    if (['completed', 'closed', 'cancelled'].includes(i.status)) return false;
    const daysOpen = (now.getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysOpen > 21;
  });
  if (stale.length >= 2) {
    const escalating = stale.filter(i => i.outcome_status === 'escalating');
    const sources = ['Intervention Outcomes'];
    if (escalating.length > 0 && behaviour.length > 0) sources.push('Behaviour');
    patterns.push({
      id: 'stale_interventions',
      name: 'Interventions not progressing',
      description: `${stale.length} intervention${stale.length > 1 ? 's have' : ' has'} been open for more than 3 weeks without resolution. The data suggests current support may not be having the desired effect.`,
      confidenceScore: sources.length >= 2 ? 62 : 48,
      confidenceLevel: sources.length >= 2 ? 'medium' : 'low',
      sources,
      evidence: stale.slice(0, 4).map(i => ({
        source: 'Intervention Outcomes',
        metric: i.action_type,
        value: `${i.status}${i.outcome_status ? ` · ${i.outcome_status}` : ''}`,
        date: i.created_at,
      })),
      timePeriod: 'Last 3+ weeks',
      whyGenerated: [
        `${stale.length} intervention(s) open for more than 21 days without completion`,
        escalating.length > 0 ? `${escalating.length} intervention(s) have an escalating outcome status` : 'No outcome status updates recorded',
        'Threshold: 2 or more stale open interventions triggers this pattern',
      ],
      suggestedAction: 'Review all open interventions — identify blockers, update status, and consider escalation where appropriate',
      reviewWeeks: 2,
      urgency: escalating.length > 0 ? 'now' : 'this_week',
      emergenceTimeline: stale.slice(0, 5).map(i => ({
        weekLabel: formatDate(i.created_at),
        events: [`${i.action_type} created — status: ${i.status}`],
        significance: (i.outcome_status === 'escalating' ? 'critical' : 'warning') as 'critical' | 'warning',
      })),
    });
  }

  // ── 8. Career / destination risk ───────────────────────
  if (career?.destination_risk?.toLowerCase().includes('high')) {
    const sources = ['Assessment'];
    if (attendance < 90) sources.push('Attendance');
    if (quickNotes.some(n => n.category === 'Career/destination concern')) sources.push('Teacher Notes');
    patterns.push({
      id: 'career_risk',
      name: 'Destination / career pathway concern',
      description: `The student's career profile indicates a high destination risk.${career.barriers ? ` Recorded barriers: "${career.barriers}".` : ''} Proactive careers support may be needed.`,
      confidenceScore: sources.length >= 3 ? 74 : sources.length === 2 ? 60 : 45,
      confidenceLevel: sources.length >= 3 ? 'high' : sources.length === 2 ? 'medium' : 'low',
      sources,
      evidence: [
        { source: 'Assessment', metric: 'Destination risk', value: career.destination_risk },
        ...(career.barriers ? [{ source: 'Assessment', metric: 'Recorded barriers', value: career.barriers }] : []),
        ...(attendance < 90 ? [{ source: 'Attendance', metric: 'Current attendance', value: `${attendance}%` }] : []),
      ],
      timePeriod: 'Current academic year',
      whyGenerated: [
        `Career profile destination risk flagged as: ${career.destination_risk}`,
        career.barriers ? `Barriers to progression recorded: "${career.barriers}"` : 'No specific barriers recorded',
        attendance < 90 ? `Attendance of ${attendance}% may further impact destination outcomes` : 'Attendance is not an additional concern',
      ],
      suggestedAction: 'Arrange a dedicated careers guidance meeting and review pathway options with the student',
      reviewWeeks: 4,
      urgency: 'this_week',
      emergenceTimeline: [
        { weekLabel: 'Career profile', events: [`Destination risk: ${career.destination_risk}`], significance: 'warning' },
        ...(career.barriers ? [{ weekLabel: 'Barriers recorded', events: [career.barriers], significance: 'warning' as const }] : []),
        ...(attendance < 90 ? [{ weekLabel: 'Attendance', events: [`Attendance at ${attendance}%`], significance: 'warning' as const }] : []),
      ],
    });
  }

  // ── 9. Lesson avoidance ─────────────────────────────────
  const refusalIncidents = behaviour.filter(r =>
    r.incident_type && /refus|avoi|lesson|walk.?out|leav|absent from/i.test(r.incident_type)
  );
  const lessonAbsenceNotes = quickNotes.filter(n =>
    /lesson|refus|avoi|walk.?out|absent from/i.test(n.note)
  );
  if (refusalIncidents.length >= 2 || (refusalIncidents.length >= 1 && lessonAbsenceNotes.length >= 1)) {
    const involvedSubjects = [...new Set(refusalIncidents.map(r => r.subject).filter(Boolean))] as string[];
    const sources: string[] = ['Behaviour'];
    if (lessonAbsenceNotes.length > 0) sources.push('Teacher Notes');
    if (attendance < 92) sources.push('Attendance');
    if (sources.length < 2) {
      // only push if we have ≥ 2 sources OR ≥ 3 refusal incidents
      if (refusalIncidents.length < 3) {
        // skip — not enough evidence
      } else {
        patterns.push({
          id: 'lesson_avoidance',
          name: 'Possible lesson avoidance',
          description: `${refusalIncidents.length} behaviour record${refusalIncidents.length > 1 ? 's suggest' : ' suggests'} the student may be avoiding specific lessons or subjects.${involvedSubjects.length > 0 ? ` Subjects involved: ${involvedSubjects.join(', ')}.` : ''}`,
          confidenceScore: Math.min(88, 38 + refusalIncidents.length * 8),
          confidenceLevel: 'low',
          sources,
          evidence: [
            ...refusalIncidents.slice(0, 3).map(r => ({ source: 'Behaviour', metric: r.incident_type, value: `${r.subject || 'Unknown subject'} — ${r.lesson_period || 'period unrecorded'}`, date: r.date })),
          ],
          timePeriod: refusalIncidents.length > 0 ? `${formatDate(refusalIncidents[0].date)} – present` : 'Recent',
          whyGenerated: [
            `${refusalIncidents.length} behaviour record(s) indicate lesson refusal or avoidance`,
            involvedSubjects.length > 0 ? `Subjects involved: ${involvedSubjects.join(', ')}` : 'Specific subjects not recorded',
            'Only behaviour data available — confidence is low until corroborated',
          ],
          suggestedAction: `Investigate whether there is a consistent trigger (subject, teacher, period, peer) and arrange a pastoral conversation to understand the student's perspective`,
          reviewWeeks: 2,
          urgency: 'this_week',
          emergenceTimeline: refusalIncidents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(r => ({
            weekLabel: formatDate(r.date),
            events: [`${r.incident_type}${r.subject ? ` in ${r.subject}` : ''}${r.lesson_period ? ` (${r.lesson_period})` : ''}`],
            significance: 'warning' as const,
          })),
        });
      }
    } else {
      patterns.push({
        id: 'lesson_avoidance',
        name: 'Possible lesson avoidance',
        description: `${refusalIncidents.length} behaviour record${refusalIncidents.length > 1 ? 's' : ''} and ${lessonAbsenceNotes.length > 0 ? `${lessonAbsenceNotes.length} staff note${lessonAbsenceNotes.length > 1 ? 's' : ''}` : 'attendance data'} suggest the student may be avoiding specific lessons or subjects.${involvedSubjects.length > 0 ? ` Subjects involved: ${involvedSubjects.join(', ')}.` : ''}`,
        confidenceScore: Math.min(90, 48 + sources.length * 8 + Math.min(12, refusalIncidents.length * 4)),
        confidenceLevel: sources.length >= 3 ? 'high' : 'medium',
        sources,
        evidence: [
          ...refusalIncidents.slice(0, 3).map(r => ({ source: 'Behaviour', metric: r.incident_type, value: `${r.subject || 'Unknown subject'} — ${r.lesson_period || 'period unrecorded'}`, date: r.date })),
          ...lessonAbsenceNotes.slice(0, 2).map(n => ({ source: 'Teacher Notes', metric: `${n.category} (level ${n.concern_level})`, value: `"${n.note.slice(0, 70)}${n.note.length > 70 ? '...' : ''}"`, date: n.date })),
          ...(attendance < 92 ? [{ source: 'Attendance', metric: 'Overall attendance', value: `${attendance}%` }] : []),
        ],
        timePeriod: refusalIncidents.length > 0 ? `${formatDate(refusalIncidents[0].date)} – present` : 'Recent',
        whyGenerated: [
          `${refusalIncidents.length} behaviour record(s) indicate lesson refusal or avoidance behaviour`,
          lessonAbsenceNotes.length > 0 ? `${lessonAbsenceNotes.length} staff note(s) independently corroborate this pattern` : '',
          involvedSubjects.length > 0 ? `Subjects involved: ${involvedSubjects.join(', ')}` : 'Specific subjects not recorded in all incidents',
          attendance < 92 ? `Attendance at ${attendance}% adds context to possible avoidance behaviour` : '',
        ].filter(Boolean),
        suggestedAction: `Investigate whether there is a consistent trigger (subject, teacher, period, peer) and arrange a pastoral conversation to understand the student's perspective`,
        reviewWeeks: 2,
        urgency: 'this_week',
        emergenceTimeline: refusalIncidents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(r => ({
          weekLabel: formatDate(r.date),
          events: [`${r.incident_type}${r.subject ? ` in ${r.subject}` : ''}${r.lesson_period ? ` (${r.lesson_period})` : ''}`],
          significance: 'warning' as const,
        })),
      });
    }
  }

  // ── 10. Withdrawal pattern ──────────────────────────────
  const positiveTotal = behaviour.reduce((s, r) => s + (r.positive_points || 0), 0);
  const recentQuarter = sorted.slice(-Math.max(1, Math.floor(sorted.length / 4)));
  const recentPositives = recentQuarter.reduce((s, r) => s + (r.positive_points || 0), 0);
  const earlyPositives = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 4))).reduce((s, r) => s + (r.positive_points || 0), 0);
  const positiveFalling = sorted.length >= 4 && earlyPositives > 0 && recentPositives < earlyPositives * 0.5;
  const lateMarksRising = (student.punctuality_issues || 0) >= 3;
  const pastoralNotes = quickNotes.filter(n => n.category === 'Pastoral concern' && n.concern_level >= 3);
  const withdrawalSourceCount = [positiveFalling, lateMarksRising, pastoralNotes.length >= 1].filter(Boolean).length;
  if (withdrawalSourceCount >= 2) {
    const sources: string[] = [];
    if (positiveFalling) sources.push('Behaviour');
    if (lateMarksRising) sources.push('Attendance');
    if (pastoralNotes.length >= 1) sources.push('Teacher Notes');
    patterns.push({
      id: 'withdrawal',
      name: 'Possible withdrawal or disengagement',
      description: `Multiple data sources indicate the student may be withdrawing socially or emotionally.${positiveFalling ? ` Positive points have fallen from ${earlyPositives} to ${recentPositives} in recent records.` : ''}${lateMarksRising ? ` ${student.punctuality_issues} late marks recorded.` : ''}${pastoralNotes.length > 0 ? ` ${pastoralNotes.length} pastoral staff note(s) raise concerns.` : ''}`,
      confidenceScore: Math.min(88, 42 + sources.length * 12 + (pastoralNotes.length > 1 ? 8 : 0)),
      confidenceLevel: sources.length >= 3 ? 'high' : 'medium',
      sources,
      evidence: [
        ...(positiveFalling ? [{ source: 'Behaviour', metric: 'Positive points (early vs recent)', value: `${earlyPositives} → ${recentPositives}` }] : []),
        ...(lateMarksRising ? [{ source: 'Attendance', metric: 'Late marks', value: `${student.punctuality_issues} recorded` }] : []),
        ...pastoralNotes.slice(0, 2).map(n => ({ source: 'Teacher Notes', metric: `Pastoral concern (level ${n.concern_level})`, value: `"${n.note.slice(0, 70)}${n.note.length > 70 ? '...' : ''}"`, date: n.date })),
        ...(positiveTotal > 0 ? [{ source: 'Behaviour', metric: 'Total positive points', value: `${positiveTotal}` }] : []),
      ],
      timePeriod: sorted.length > 0 ? `${formatDate(sorted[0].date)} – present` : 'Recent',
      whyGenerated: [
        positiveFalling ? `Positive points fell from ${earlyPositives} (early records) to ${recentPositives} (recent records) — a ${Math.round((1 - recentPositives / Math.max(1, earlyPositives)) * 100)}% drop` : '',
        lateMarksRising ? `${student.punctuality_issues} late marks — may indicate disengagement or home circumstances` : '',
        pastoralNotes.length > 0 ? `${pastoralNotes.length} pastoral concern note(s) recorded by staff (level 3+)` : '',
        'Withdrawal pattern requires 2+ corroborating sources — threshold met',
      ].filter(Boolean),
      suggestedAction: 'Arrange a discreet welfare check and pastoral conversation — explore whether there are home, social, or emotional factors behind the change',
      reviewWeeks: 2,
      urgency: sources.length >= 3 ? 'now' : 'this_week',
      emergenceTimeline: [
        ...(positiveFalling && sorted.length >= 2 ? [
          { weekLabel: formatDate(sorted[0].date), events: [`Early positive points: ${earlyPositives}`], significance: 'normal' as const },
          { weekLabel: formatDate(sorted[sorted.length - 1].date), events: [`Recent positive points: ${recentPositives} (↓ ${Math.round((1 - recentPositives / Math.max(1, earlyPositives)) * 100)}%)`], significance: 'warning' as const },
        ] : []),
        ...(lateMarksRising ? [{ weekLabel: 'Punctuality', events: [`${student.punctuality_issues} late marks recorded`], significance: 'warning' as const }] : []),
        ...pastoralNotes.slice(0, 2).map(n => ({ weekLabel: formatDate(n.date), events: [`Pastoral concern level ${n.concern_level}: "${n.note.slice(0, 60)}..."`], significance: 'warning' as const })),
      ],
    });
  }

  // ── 11. Intervention impact pattern ─────────────────────
  const closedWithBaseline = interventions.filter(i =>
    ['completed', 'closed'].includes(i.status) &&
    (i.baseline_attendance != null || i.baseline_behaviour != null)
  );
  if (closedWithBaseline.length > 0) {
    const improving: string[] = [];
    const noChange: string[] = [];
    const worsened: string[] = [];
    closedWithBaseline.forEach(i => {
      if (i.baseline_attendance != null && i.current_attendance != null) {
        const delta = i.current_attendance - i.baseline_attendance;
        if (delta >= 3) improving.push(`Attendance: ${i.baseline_attendance}% → ${i.current_attendance}% after "${i.action_type}"`);
        else if (delta <= -3) worsened.push(`Attendance: ${i.baseline_attendance}% → ${i.current_attendance}% after "${i.action_type}"`);
        else noChange.push(`Attendance unchanged: ${i.current_attendance}% (was ${i.baseline_attendance}%)`);
      }
      if (i.baseline_behaviour != null && i.current_behaviour != null) {
        const delta = i.current_behaviour - i.baseline_behaviour;
        if (delta <= -2) improving.push(`Behaviour incidents: ${i.baseline_behaviour} → ${i.current_behaviour} after "${i.action_type}"`);
        else if (delta >= 2) worsened.push(`Behaviour incidents: ${i.baseline_behaviour} → ${i.current_behaviour} after "${i.action_type}"`);
        else noChange.push(`Behaviour incidents unchanged: ${i.current_behaviour} (was ${i.baseline_behaviour})`);
      }
    });
    const hasImpact = improving.length > 0 || worsened.length > 0;
    if (hasImpact) {
      const isPositive = improving.length >= worsened.length;
      const sources = ['Intervention Outcomes'];
      if (behaviour.length > 0) sources.push('Behaviour');
      if (student.attendance_pct != null) sources.push('Attendance');
      patterns.push({
        id: 'intervention_impact',
        name: isPositive ? 'Interventions showing positive impact' : 'Interventions not achieving expected outcomes',
        description: isPositive
          ? `Before/after comparison across ${closedWithBaseline.length} closed intervention(s) shows measurable improvement in tracked metrics.`
          : `Before/after comparison across ${closedWithBaseline.length} closed intervention(s) shows limited or no measurable improvement.`,
        confidenceScore: Math.min(90, 55 + sources.length * 8 + improving.length * 5),
        confidenceLevel: sources.length >= 3 ? 'high' : 'medium',
        sources,
        evidence: [
          ...improving.slice(0, 3).map(s => ({ source: 'Intervention Outcomes', metric: 'Improvement', value: s })),
          ...worsened.slice(0, 2).map(s => ({ source: 'Intervention Outcomes', metric: 'Not improved', value: s })),
          ...noChange.slice(0, 2).map(s => ({ source: 'Intervention Outcomes', metric: 'No change', value: s })),
        ],
        timePeriod: `${closedWithBaseline.length} closed intervention${closedWithBaseline.length > 1 ? 's' : ''}`,
        whyGenerated: [
          `${closedWithBaseline.length} intervention(s) have baseline and current metric data available`,
          improving.length > 0 ? `${improving.length} metric(s) show measurable improvement` : 'No metrics showed improvement',
          worsened.length > 0 ? `${worsened.length} metric(s) showed no improvement or worsening` : '',
          'Before/after comparison is only generated when baseline data was recorded at intervention start',
        ].filter(Boolean),
        suggestedAction: isPositive
          ? 'Recognise progress — sustain current support and continue monitoring to consolidate gains'
          : 'Review intervention approach — consider different strategies, increased intensity, or external referral',
        reviewWeeks: isPositive ? 4 : 2,
        urgency: isPositive ? 'monitor' : 'this_week',
        emergenceTimeline: closedWithBaseline.slice(0, 4).map(i => ({
          weekLabel: formatDate(i.created_at),
          events: [
            `${i.action_type}`,
            ...(i.baseline_attendance != null && i.current_attendance != null ? [`Attendance: ${i.baseline_attendance}% → ${i.current_attendance}%`] : []),
            ...(i.baseline_behaviour != null && i.current_behaviour != null ? [`Behaviour incidents: ${i.baseline_behaviour} → ${i.current_behaviour}`] : []),
          ],
          significance: (i.outcome_status === 'resolved' || i.outcome_status === 'improving') ? 'normal' as const : 'warning' as const,
        })),
      });
    }
  }

  return patterns.sort((a, b) => b.confidenceScore - a.confidenceScore);
}

// ─── Pattern workflow types ──────────────────────────────────────────────────

type PatternStatus = 'not_actioned' | 'assigned' | 'in_progress' | 'awaiting_review' | 'completed' | 'escalated' | 'dismissed';
type PatternPersistenceLocal = 'new' | 'recurring' | 'resolved' | 'reappeared';

interface PatternWorkflow {
  status: PatternStatus;
  ownerName: string;
  ownerRole: string;
  reviewDate: string;
  notes: string;
  outcomeNotes: string;
  actionType: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  persistence: PatternPersistenceLocal;
  dismissReason?: string;
  dismissedBy?: string;
  dismissedAt?: string;
}

const EMPTY_WORKFLOW: PatternWorkflow = {
  status: 'not_actioned', ownerName: '', ownerRole: '', reviewDate: '',
  notes: '', outcomeNotes: '', actionType: '', dueDate: '', priority: 'medium', persistence: 'new',
};

const STATUS_CFG: Record<PatternStatus, { label: string; bg: string; text: string; border: string }> = {
  not_actioned:    { label: 'Not Actioned',    bg: 'bg-slate-100',    text: 'text-slate-600',  border: 'border-slate-200' },
  assigned:        { label: 'Assigned',        bg: 'bg-blue-100',     text: 'text-blue-700',   border: 'border-blue-200' },
  in_progress:     { label: 'In Progress',     bg: 'bg-amber-100',    text: 'text-amber-700',  border: 'border-amber-200' },
  awaiting_review: { label: 'Awaiting Review', bg: 'bg-orange-100',   text: 'text-orange-700', border: 'border-orange-200' },
  completed:       { label: 'Completed',       bg: 'bg-emerald-100',  text: 'text-emerald-700',border: 'border-emerald-200' },
  escalated:       { label: 'Escalated',       bg: 'bg-red-100',      text: 'text-red-700',    border: 'border-red-200' },
  dismissed:       { label: 'Dismissed',       bg: 'bg-slate-100',    text: 'text-slate-400',  border: 'border-slate-200' },
};

const PERSISTENCE_CFG: Record<PatternPersistenceLocal, { label: string; bg: string; text: string }> = {
  new:        { label: 'New',        bg: 'bg-sky-100',     text: 'text-sky-700' },
  recurring:  { label: 'Recurring',  bg: 'bg-amber-100',   text: 'text-amber-700' },
  resolved:   { label: 'Resolved',   bg: 'bg-emerald-100', text: 'text-emerald-700' },
  reappeared: { label: 'Reappeared', bg: 'bg-red-100',     text: 'text-red-700' },
};

function PatternEngine({
  student,
  behaviour,
  analysis,
  interventions,
  quickNotes,
  career,
  onActivity,
}: {
  student: Student;
  behaviour: BehaviourRecord[];
  analysis: AnalysisResult | null;
  interventions: Intervention[];
  quickNotes: QuickNote[];
  career: CareerProfile | null;
  onActivity?: (entry: { id: string; timestamp: string; text: string }) => void;
}) {
  const { profile, demoMode } = useAuth();
  const schoolId = (profile as any)?.school_id as string | undefined;

  const [expandedReason, setExpandedReason]     = useState<string | null>(null);
  const [expandedTimeline, setExpandedTimeline] = useState<string | null>(null);
  const [urgencyFilter, setUrgencyFilter]       = useState<'all' | 'now' | 'this_week' | 'monitor'>('all');
  const [showDismissed, setShowDismissed]       = useState(false);
  const [workflows, setWorkflows]               = useState<Record<string, PatternWorkflow>>({});
  const [assignModal, setAssignModal]           = useState<{ patternId: string; mode: 'assign' | 'intervention' | 'complete' } | null>(null);
  const [assignForm, setAssignForm]             = useState<PatternWorkflow>({ ...EMPTY_WORKFLOW });
  const [patternSgDismissed, setPatternSgDismissed] = useState(false);
  const [patternSgAccepted, setPatternSgAccepted] = useState(false);
  const [dismissModal, setDismissModal]         = useState<string | null>(null);
  const [dismissReasonInput, setDismissReasonInput] = useState('');
  const [saving, setSaving]                     = useState(false);

  const patterns = computePatterns(student, behaviour, analysis, interventions, quickNotes, career);

  // Load persisted workflows from Supabase
  useEffect(() => {
    if (demoMode || !schoolId) return;
    supabase
      .from('pattern_workflows')
      .select('*')
      .eq('student_id', student.id)
      .then(({ data }) => {
        if (!data) return;
        const map: Record<string, PatternWorkflow> = {};
        data.forEach((row: any) => {
          map[row.pattern_id] = {
            status: row.status,
            ownerName: row.owner_name,
            ownerRole: row.owner_role,
            reviewDate: row.review_date || '',
            notes: row.notes || '',
            outcomeNotes: row.outcome_notes || '',
            actionType: row.action_type || '',
            dueDate: row.due_date || '',
            priority: row.priority,
            persistence: row.persistence,
          };
        });
        setWorkflows(map);
      });
  }, [student.id, schoolId, demoMode]);

  const URGENCY_CFG = {
    now:       { label: 'Act Now',    bg: 'bg-red-50 border-red-200',     text: 'text-red-700',    dot: 'bg-red-500',    activeBg: 'bg-red-600 text-white border-red-600'    },
    this_week: { label: 'This Week',  bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700',  dot: 'bg-amber-400',  activeBg: 'bg-amber-500 text-white border-amber-500' },
    monitor:   { label: 'Monitor',    bg: 'bg-slate-100 border-slate-200',text: 'text-slate-600',  dot: 'bg-slate-400',  activeBg: 'bg-slate-700 text-white border-slate-700' },
  };
  const CONF_BORDER = { high: 'border-l-red-400', medium: 'border-l-amber-400', low: 'border-l-slate-300' };
  const CONF_RING = {
    high:   { ring: 'border-red-300 bg-red-50',     text: 'text-red-600' },
    medium: { ring: 'border-amber-300 bg-amber-50', text: 'text-amber-600' },
    low:    { ring: 'border-slate-200 bg-slate-50', text: 'text-slate-500' },
  };
  const TL_COLORS = {
    normal:   { dot: 'bg-slate-300',  card: 'border-slate-200',  text: 'text-slate-600' },
    warning:  { dot: 'bg-amber-400',  card: 'border-amber-200',  text: 'text-amber-800' },
    critical: { dot: 'bg-red-500',    card: 'border-red-200',    text: 'text-red-800' },
  };

  function getWorkflow(patternId: string): PatternWorkflow {
    return workflows[patternId] || { ...EMPTY_WORKFLOW };
  }

  async function persistWorkflow(patternId: string, wf: PatternWorkflow) {
    setWorkflows(prev => ({ ...prev, [patternId]: wf }));
    if (demoMode || !schoolId) return;
    await supabase.from('pattern_workflows').upsert({
      school_id: schoolId,
      student_id: student.id,
      pattern_id: patternId,
      status: wf.status,
      persistence: wf.persistence,
      owner_name: wf.ownerName,
      owner_role: wf.ownerRole,
      action_type: wf.actionType,
      priority: wf.priority,
      due_date: wf.dueDate || null,
      review_date: wf.reviewDate || null,
      notes: wf.notes,
      outcome_notes: wf.outcomeNotes,
      dismissed_at: wf.status === 'dismissed' ? new Date().toISOString() : null,
    }, { onConflict: 'student_id,pattern_id' });
  }

  function openAssign(patternId: string, mode: 'assign' | 'intervention' | 'complete') {
    const wf = getWorkflow(patternId);
    const pattern = patterns.find(p => p.id === patternId);
    setAssignForm({
      ...wf,
      status: mode === 'complete' ? 'completed' : mode === 'assign' ? 'assigned' : 'in_progress',
      actionType: wf.actionType || pattern?.suggestedAction?.slice(0, 60) || '',
    });
    setAssignModal({ patternId, mode });
  }

  async function saveAssign() {
    if (!assignModal) return;
    if (assignModal.mode === 'complete' && !assignForm.outcomeNotes.trim()) return;
    setSaving(true);
    await persistWorkflow(assignModal.patternId, assignForm);
    setSaving(false);
    setAssignModal(null);
  }

  async function dismissPattern(patternId: string) {
    const wf = getWorkflow(patternId);
    const reason = dismissReasonInput.trim();
    await persistWorkflow(patternId, {
      ...wf,
      status: 'dismissed',
      dismissReason: reason || 'No reason given',
      dismissedBy: profile?.full_name || 'Unknown',
      dismissedAt: new Date().toISOString(),
    });
    onActivity?.({ id: 'dismiss_' + patternId + '_' + Date.now(), timestamp: new Date().toISOString(), text: `Pattern dismissed${reason ? ` — ${reason}` : ''}` });
    setDismissModal(null);
    setDismissReasonInput('');
  }

  async function restorePattern(patternId: string) {
    const wf = getWorkflow(patternId);
    await persistWorkflow(patternId, { ...wf, status: 'not_actioned' });
    onActivity?.({ id: 'restore_' + patternId + '_' + Date.now(), timestamp: new Date().toISOString(), text: `Pattern restored — returned to action queue` });
  }

  function handleStaffSelect(name: string) {
    const staff = DEMO_STAFF.find(s => s.name === name);
    setAssignForm(f => ({ ...f, ownerName: name, ownerRole: staff?.role || '' }));
  }

  if (patterns.length === 0) {
    return (
      <div className="card-premium p-10 text-center">
        <div className="w-14 h-14 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-7 h-7 text-emerald-500" />
        </div>
        <h3 className="text-base font-bold text-slate-800 mb-2">No significant patterns detected</h3>
        <p className="text-sm text-slate-500 max-w-sm mx-auto leading-relaxed">The available data does not currently indicate any significant cross-source patterns. Continue routine monitoring.</p>
        <p className="text-xs text-slate-400 mt-3 italic">Pattern detection improves as more data is recorded across multiple sources.</p>
      </div>
    );
  }

  const urgencyCounts = { now: 0, this_week: 0, monitor: 0 };
  patterns.forEach(p => urgencyCounts[p.urgency]++);

  const activePatterns = patterns.filter(p => getWorkflow(p.id).status !== 'dismissed');
  const dismissedPatterns = patterns.filter(p => getWorkflow(p.id).status === 'dismissed');

  const visiblePatterns = urgencyFilter === 'all'
    ? activePatterns
    : activePatterns.filter(p => p.urgency === urgencyFilter);

  return (
    <div className="space-y-6">
      {/* Engine header */}
      <div className="card-premium p-5">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-xl bg-teal-50 shrink-0">
            <Layers className="w-5 h-5 text-teal-600" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <h2 className="text-lg font-bold text-slate-900">Pattern Engine</h2>
              <span className="px-2.5 py-0.5 bg-teal-50 text-teal-700 text-xs font-bold rounded-full border border-teal-200">
                {patterns.length} pattern{patterns.length > 1 ? 's' : ''} detected
              </span>
            </div>
            <p className="text-sm text-slate-500">
              Cross-source pattern analysis. Each pattern is identified by matching incidents across subjects, periods, peers, and data sources — not AI guesswork.
            </p>
          </div>
        </div>
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-xs text-amber-800 leading-relaxed">
            <span className="font-bold">How cohort patterns are identified:</span> When 50%+ of incidents share the same subject, lesson period, or peer group, a cohort-based pattern is flagged. This uses raw incident records — not assumptions. Confidence increases with multiple corroborating sources.
          </p>
        </div>
      </div>

      {/* Urgency filter cards — clickable */}
      <div className="grid grid-cols-4 gap-3">
        {/* All Patterns button */}
        <button
          onClick={() => setUrgencyFilter('all')}
          className={`rounded-2xl p-4 border text-left transition-all ${
            urgencyFilter === 'all'
              ? 'bg-slate-900 border-slate-900 text-white'
              : 'bg-white border-slate-200 hover:border-slate-300'
          }`}
        >
          <div className="flex items-center gap-1.5 mb-2">
            <span className={`w-2 h-2 rounded-full ${urgencyFilter === 'all' ? 'bg-white' : 'bg-slate-400'}`} />
            <span className={`text-[11px] font-bold uppercase tracking-wider ${urgencyFilter === 'all' ? 'text-white' : 'text-slate-600'}`}>All Patterns</span>
          </div>
          <div className={`text-3xl font-black ${urgencyFilter === 'all' ? 'text-white' : 'text-slate-900'}`}>{patterns.length}</div>
          <div className={`text-xs mt-0.5 ${urgencyFilter === 'all' ? 'text-slate-300' : 'text-slate-500'}`}>total</div>
        </button>

        {(Object.entries(urgencyCounts) as [keyof typeof URGENCY_CFG, number][]).map(([key, count]) => {
          const cfg = URGENCY_CFG[key];
          const isActive = urgencyFilter === key;
          return (
            <button
              key={key}
              onClick={() => setUrgencyFilter(isActive ? 'all' : key)}
              className={`rounded-2xl p-4 border text-left transition-all ${
                isActive ? cfg.activeBg : `${cfg.bg} hover:opacity-80`
              }`}
            >
              <div className="flex items-center gap-1.5 mb-2">
                <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white/80' : cfg.dot}`} />
                <span className={`text-[11px] font-bold uppercase tracking-wider ${isActive ? 'text-white' : cfg.text}`}>{cfg.label}</span>
              </div>
              <div className={`text-3xl font-black ${isActive ? 'text-white' : 'text-slate-900'}`}>{count}</div>
              <div className={`text-xs mt-0.5 ${isActive ? 'text-white/70' : 'text-slate-500'}`}>pattern{count !== 1 ? 's' : ''}</div>
            </button>
          );
        })}
      </div>

      {/* Pattern cards */}
      {visiblePatterns.length === 0 ? (
        <div className="card-premium p-8 text-center text-slate-400 text-sm">
          No patterns in this category.
        </div>
      ) : (
        <div className="space-y-5">
          {visiblePatterns.map(pattern => {
            const urg  = URGENCY_CFG[pattern.urgency];
            const conf = CONF_RING[pattern.confidenceLevel];
            const isReasonOpen   = expandedReason === pattern.id;
            const isTimelineOpen = expandedTimeline === pattern.id;
            const wf             = getWorkflow(pattern.id);
            const statusCfg      = STATUS_CFG[wf.status];

            return (
              <div key={pattern.id} className={`card-premium overflow-hidden border-l-4 ${CONF_BORDER[pattern.confidenceLevel]}`}>

                {/* ── Card header — always visible ── */}
                <div className="px-6 py-5">
                  {/* Title row */}
                  <div className="flex items-start gap-4 mb-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <h3 className="text-base font-bold text-slate-900">{pattern.name}</h3>
                        <span className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold border ${urg.bg} ${urg.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${urg.dot}`} />
                          {urg.label}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${statusCfg.bg} ${statusCfg.text} ${statusCfg.border}`}>
                          {statusCfg.label}
                        </span>
                      </div>
                      <p className="text-sm text-slate-600 leading-relaxed">{pattern.description}</p>
                    </div>
                    {/* Confidence ring */}
                    <div className="shrink-0 text-center">
                      <div className={`w-14 h-14 rounded-full flex items-center justify-center border-4 ${conf.ring}`}>
                        <span className={`text-sm font-black leading-none ${conf.text}`}>{pattern.confidenceScore}%</span>
                      </div>
                      <div className="text-[9px] text-slate-400 font-semibold uppercase tracking-wider mt-1">confidence</div>
                    </div>
                  </div>

                  {/* Meta row — owner / review / persistence if assigned */}
                  {wf.status !== 'not_actioned' && (
                    <div className="flex items-center gap-3 flex-wrap mb-3 text-xs text-slate-500 bg-slate-50 rounded-xl px-3 py-2 border border-slate-100">
                      {wf.ownerName && (
                        <span><span className="text-slate-400">Owner: </span><span className="font-semibold text-slate-700">{wf.ownerName}</span>{wf.ownerRole && <span className="text-slate-400"> ({wf.ownerRole})</span>}</span>
                      )}
                      {wf.reviewDate && (
                        <span><span className="text-slate-400">Review: </span><span className="font-semibold text-slate-700">{wf.reviewDate}</span></span>
                      )}
                      {wf.actionType && (
                        <span className="truncate"><span className="text-slate-400">Action: </span><span className="font-semibold text-slate-700">{wf.actionType}</span></span>
                      )}
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${PERSISTENCE_CFG[wf.persistence].bg} ${PERSISTENCE_CFG[wf.persistence].text}`}>
                        {PERSISTENCE_CFG[wf.persistence].label}
                      </span>
                    </div>
                  )}

                  {/* Sources + period */}
                  <div className="flex items-center gap-2 flex-wrap mb-4">
                    {pattern.sources.map(s => <SrcBadge key={s} source={s} />)}
                    <span className="text-[10px] text-slate-300">·</span>
                    <span className="text-[10px] text-slate-400">{pattern.timePeriod}</span>
                  </div>

                  {/* Evidence table */}
                  <div className="bg-slate-50 border border-slate-200 rounded-xl overflow-hidden mb-4">
                    <div className="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-2">
                      <BookOpen className="w-3 h-3 text-slate-400" />
                      <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Evidence</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {pattern.evidence.map((ev, i) => (
                        <div key={i} className="flex items-center gap-3 px-4 py-2.5">
                          <SrcBadge source={ev.source} />
                          <div className="flex-1 min-w-0">
                            <span className="text-xs text-slate-500">{ev.metric}:</span>
                            <span className="text-xs font-semibold text-slate-800 ml-1.5">{ev.value}</span>
                          </div>
                          {ev.date && <span className="text-[10px] text-slate-400 shrink-0">{formatDate(ev.date)}</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Suggested action */}
                  <div className="flex items-start gap-3 p-4 bg-teal-50 border border-teal-200 rounded-xl mb-4">
                    <Zap className="w-4 h-4 text-teal-600 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold text-teal-600 uppercase tracking-wider mb-0.5">Suggested action</div>
                      <p className="text-xs text-slate-700 font-medium leading-relaxed">{pattern.suggestedAction}</p>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] text-slate-400">Review in</div>
                      <div className="text-sm font-black text-slate-700">{pattern.reviewWeeks}w</div>
                    </div>
                  </div>

                  {/* Completed — outcome notes */}
                  {wf.status === 'completed' && wf.outcomeNotes && (
                    <div className="mb-4 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                      <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider mb-1">Outcome recorded</div>
                      <p className="text-xs text-emerald-800 leading-relaxed">{wf.outcomeNotes}</p>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    {wf.status !== 'completed' && (
                      <>
                        <button
                          onClick={() => openAssign(pattern.id, 'assign')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                          Assign Action
                        </button>
                        <button
                          onClick={() => openAssign(pattern.id, 'intervention')}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-200 bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Create Intervention
                        </button>
                        {wf.status !== 'not_actioned' && (
                          <button
                            onClick={() => openAssign(pattern.id, 'complete')}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                          >
                            <CheckCircle className="w-3.5 h-3.5" />
                            Mark Complete
                          </button>
                        )}
                        <button
                          onClick={() => { setDismissModal(pattern.id); setDismissReasonInput(''); }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-400 text-xs font-semibold hover:text-slate-600 hover:bg-slate-50 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                          Dismiss
                        </button>
                      </>
                    )}
                    {wf.status === 'completed' && (
                      <button
                        onClick={() => openAssign(pattern.id, 'assign')}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 text-xs font-semibold hover:bg-slate-50 transition-colors"
                      >
                        <Activity className="w-3.5 h-3.5" />
                        Re-open
                      </button>
                    )}
                  </div>

                  {/* Expand buttons */}
                  <div className="flex items-center gap-1 flex-wrap">
                    <button
                      onClick={() => setExpandedReason(isReasonOpen ? null : pattern.id)}
                      className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-teal-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-teal-50"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Why was this generated?
                      <ChevronDown className={`w-3 h-3 transition-transform ${isReasonOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {pattern.emergenceTimeline.length > 0 && (
                      <button
                        onClick={() => setExpandedTimeline(isTimelineOpen ? null : pattern.id)}
                        className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400 hover:text-teal-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-teal-50"
                      >
                        <Activity className="w-3.5 h-3.5" />
                        Pattern timeline
                        <ChevronDown className={`w-3 h-3 transition-transform ${isTimelineOpen ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                </div>

                {/* ── Why was this generated? ── */}
                {isReasonOpen && (
                  <div className="px-6 pb-5 pt-4 border-t border-slate-100 bg-slate-50/80">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-3">Reasoning</div>
                    <ul className="space-y-2 mb-4">
                      {pattern.whyGenerated.map((reason, i) => (
                        <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-1.5 shrink-0" />
                          {reason}
                        </li>
                      ))}
                    </ul>
                    <div className="grid grid-cols-2 gap-4 pt-3 border-t border-slate-200">
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Confidence</div>
                        <ConfBadge level={pattern.confidenceLevel} />
                        <p className="text-[10px] text-slate-400 italic mt-1.5 leading-relaxed">
                          {pattern.sources.length === 1 ? 'Single source — early indicator only.' : pattern.sources.length === 2 ? 'Two sources — moderate confidence.' : 'Three+ sources — strong corroboration.'}
                        </p>
                      </div>
                      <div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Data sources</div>
                        <div className="flex flex-wrap gap-1">{pattern.sources.map(s => <SrcBadge key={s} source={s} />)}</div>
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Pattern emergence timeline ── */}
                {isTimelineOpen && pattern.emergenceTimeline.length > 0 && (
                  <div className="px-6 pb-6 pt-4 border-t border-slate-100">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-4">Pattern emergence</div>
                    <div className="relative">
                      <div className="absolute left-2 top-0 bottom-0 w-px bg-slate-200" />
                      <div className="space-y-3 ml-7">
                        {pattern.emergenceTimeline.map((week, i) => {
                          const tc = TL_COLORS[week.significance];
                          return (
                            <div key={i} className="relative">
                              <div className={`absolute -left-[22px] top-2 w-3 h-3 rounded-full border-2 border-white shadow-sm ${tc.dot}`} />
                              <div className={`bg-white border rounded-xl px-4 py-3 shadow-sm ${tc.card}`}>
                                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">{week.weekLabel}</div>
                                {week.events.map((ev, j) => (
                                  <div key={j} className={`text-xs font-medium leading-relaxed ${tc.text}`}>{ev}</div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-4 text-[10px] text-slate-400">
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-slate-300" /> Normal</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Concern</span>
                      <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500" /> Critical</span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dismissed patterns */}
      {dismissedPatterns.length > 0 && (
        <div>
          <button
            onClick={() => setShowDismissed(v => !v)}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showDismissed ? 'rotate-180' : ''}`} />
            {dismissedPatterns.length} dismissed pattern{dismissedPatterns.length !== 1 ? 's' : ''} — {showDismissed ? 'hide' : 'show'}
          </button>
          {showDismissed && (
            <div className="mt-3 space-y-2">
              {dismissedPatterns.map(p => {
                const wf = getWorkflow(p.id);
                return (
                  <div key={p.id} className="card-premium px-5 py-3 border-l-4 border-l-slate-200">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-500">{p.name}</span>
                          <span className="text-xs text-slate-400">{p.timePeriod}</span>
                        </div>
                        {wf.dismissReason && (
                          <div className="mt-1 flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Reason:</span>
                            <span className="text-xs text-slate-500 italic">{wf.dismissReason}</span>
                          </div>
                        )}
                        {wf.dismissedBy && wf.dismissedAt && (
                          <div className="mt-0.5 text-[10px] text-slate-400">
                            Dismissed by {wf.dismissedBy} · {new Date(wf.dismissedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => restorePattern(p.id)}
                        className="shrink-0 flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-semibold transition-colors px-2 py-1 rounded hover:bg-blue-50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Restore
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Assign / Intervention / Complete Modal ── */}
      {assignModal && (() => {
        const pattern = patterns.find(p => p.id === assignModal.patternId);
        if (!pattern) return null;
        const isIntervention = assignModal.mode === 'intervention';
        const isComplete = assignModal.mode === 'complete';
        const canSave = isComplete
          ? assignForm.outcomeNotes.trim().length > 0
          : !!(assignForm.actionType && assignForm.ownerName);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAssignModal(null)} />
            <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden">
              {/* Modal header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-900 text-white">
                <div>
                  <h3 className="font-bold text-base">
                    {isComplete ? 'Mark Complete' : isIntervention ? 'Create Intervention' : 'Assign Action'}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 truncate max-w-xs">{pattern.name}</p>
                </div>
                <button onClick={() => setAssignModal(null)} className="p-2 rounded-lg hover:bg-white/10 transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Pattern context */}
              <div className="px-6 py-3 bg-slate-50 border-b border-slate-100">
                <p className="text-xs text-slate-500 leading-relaxed">{pattern.suggestedAction}</p>
              </div>

              {/* Form */}
              <div className="px-6 py-5 space-y-4 max-h-[60vh] overflow-y-auto">
                {isComplete ? (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Outcome Notes <span className="text-red-500">*</span>
                      </label>
                      <textarea
                        rows={4}
                        autoFocus
                        placeholder="Describe what happened and what changed as a result of this intervention..."
                        value={assignForm.outcomeNotes}
                        onChange={e => setAssignForm(f => ({ ...f, outcomeNotes: e.target.value }))}
                        className="input-premium w-full resize-none"
                      />
                      <p className="text-[11px] text-slate-400 mt-1">Required to mark as complete. This will be visible in the student's timeline.</p>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Persistence</label>
                      <select
                        value={assignForm.persistence}
                        onChange={e => setAssignForm(f => ({ ...f, persistence: e.target.value as PatternPersistenceLocal }))}
                        className="input-premium w-full"
                      >
                        <option value="resolved">Resolved — pattern no longer present</option>
                        <option value="recurring">Recurring — pattern continues</option>
                        <option value="new">New — first occurrence</option>
                        <option value="reappeared">Reappeared — was resolved, now back</option>
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        {isIntervention ? 'Intervention Type' : 'Action Type'} <span className="text-red-500">*</span>
                      </label>
                      <select
                        value={assignForm.actionType}
                        onChange={e => setAssignForm(f => ({ ...f, actionType: e.target.value }))}
                        className="input-premium w-full"
                      >
                        <option value="">Select type...</option>
                        {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Assigned To <span className="text-red-500">*</span></label>
                        <select
                          value={assignForm.ownerName}
                          onChange={e => handleStaffSelect(e.target.value)}
                          className="input-premium w-full"
                        >
                          <option value="">Select staff...</option>
                          {DEMO_STAFF.map(s => (
                            <option key={s.name} value={s.name}>{s.name} — {s.role}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Priority</label>
                        <select
                          value={assignForm.priority}
                          onChange={e => setAssignForm(f => ({ ...f, priority: e.target.value as PatternWorkflow['priority'] }))}
                          className="input-premium w-full"
                        >
                          <option value="low">Low</option>
                          <option value="medium">Medium</option>
                          <option value="high">High</option>
                          <option value="urgent">Urgent</option>
                        </select>
                      </div>
                    </div>

                    {assignForm.ownerRole && (
                      <div className="text-xs text-slate-500 -mt-2 px-1">
                        Role: <span className="font-semibold text-slate-700">{assignForm.ownerRole}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Due Date</label>
                        <input
                          type="date"
                          value={assignForm.dueDate}
                          onChange={e => setAssignForm(f => ({ ...f, dueDate: e.target.value }))}
                          className="input-premium w-full"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Review Date</label>
                        <input
                          type="date"
                          value={assignForm.reviewDate}
                          onChange={e => setAssignForm(f => ({ ...f, reviewDate: e.target.value }))}
                          className="input-premium w-full"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Persistence</label>
                      <select
                        value={assignForm.persistence}
                        onChange={e => setAssignForm(f => ({ ...f, persistence: e.target.value as PatternPersistenceLocal }))}
                        className="input-premium w-full"
                      >
                        <option value="new">New — first time this pattern has appeared</option>
                        <option value="recurring">Recurring — has appeared before</option>
                        <option value="reappeared">Reappeared — was resolved, now back</option>
                        <option value="resolved">Resolved — no longer active</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Notes</label>
                      <textarea
                        rows={3}
                        placeholder="Additional context or instructions..."
                        value={assignForm.notes}
                        onChange={e => { setAssignForm(f => ({ ...f, notes: e.target.value })); setPatternSgDismissed(false); setPatternSgAccepted(false); }}
                        className="input-premium w-full resize-none"
                      />
                    </div>
                    {(() => {
                      const sgDetection = !patternSgDismissed && (assignForm.notes || '').trim().length >= 8 ? detectSafeguarding(assignForm.notes || '') : null;
                      return sgDetection ? (
                        <SafeguardingAlert
                          detection={sgDetection}
                          accepted={patternSgAccepted}
                          onAccept={(dslName, _actionType, _priority) => {
                            setAssignForm(f => ({ ...f, ownerName: dslName, priority: 'urgent' }));
                            setPatternSgAccepted(true);
                          }}
                          onDismiss={!patternSgAccepted ? () => setPatternSgDismissed(true) : undefined}
                        />
                      ) : null;
                    })()}

                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                      <p className="text-xs text-blue-700 leading-relaxed">
                        <span className="font-bold">After saving:</span> This action will appear in the Interventions page. Status will update to <span className="font-semibold">{isIntervention ? 'In Progress' : 'Assigned'}</span>.
                      </p>
                    </div>
                  </>
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-slate-100 flex gap-3 bg-slate-50">
                <button onClick={() => setAssignModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={saveAssign}
                  disabled={!canSave || saving}
                  className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-4 h-4" />
                  {saving ? 'Saving...' : isComplete ? 'Mark Complete' : isIntervention ? 'Create Intervention' : 'Assign Action'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Dismiss reason modal ── */}
      {dismissModal && (() => {
        const pattern = patterns.find(p => p.id === dismissModal);
        if (!pattern) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDismissModal(null)} />
            <div className="relative w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <div className="font-semibold text-slate-900">Dismiss pattern</div>
                <button onClick={() => setDismissModal(null)} className="p-1 rounded hover:bg-slate-100 transition-colors">
                  <X className="w-4 h-4 text-slate-500" />
                </button>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-0.5">Pattern</div>
                  <div className="text-sm font-semibold text-slate-800">{pattern.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{pattern.timePeriod}</div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    Reason for dismissing
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {['False positive', 'Already handled', 'Known issue', 'Not enough evidence', 'Duplicate', 'Other'].map(reason => (
                      <button
                        key={reason}
                        type="button"
                        onClick={() => setDismissReasonInput(dismissReasonInput === reason ? '' : reason)}
                        className={`px-3 py-2 rounded-xl text-xs font-medium text-left transition-all border ${
                          dismissReasonInput === reason
                            ? 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        {reason}
                      </button>
                    ))}
                  </div>
                  {dismissReasonInput === 'Other' && (
                    <textarea
                      rows={2}
                      placeholder="Please describe the reason..."
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent resize-none"
                    />
                  )}
                  <p className="text-[10px] text-slate-400 mt-1.5">
                    Dismissed patterns are never permanently deleted. They can be restored at any time from the dismissed patterns section.
                  </p>
                </div>
              </div>
              <div className="px-5 py-4 border-t border-slate-100 flex gap-3 bg-slate-50">
                <button onClick={() => setDismissModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={() => dismissPattern(dismissModal)}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-700 text-white text-sm font-semibold hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Dismiss pattern
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ─── TimelineTab ─────────────────────────────────────────────────────────────

function TimelineTab({
  timeline,
  filterOptions,
  typeToFilter,
  typeConfig,
  severityRing,
  onAddNote,
}: {
  timeline: TimelineEvent[];
  filterOptions: readonly { id: string; label: string }[];
  typeToFilter: Record<TimelineEvent['type'], string>;
  typeConfig: Record<TimelineEvent['type'], { dot: string; icon: React.ComponentType<{ className?: string }>; label: string }>;
  severityRing: Record<string, string>;
  onAddNote: () => void;
}) {
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const filtered = activeFilter === 'all'
    ? timeline
    : timeline.filter((e) => typeToFilter[e.type] === activeFilter);

  // Group by month
  const groups: { monthKey: string; label: string; events: TimelineEvent[] }[] = [];
  filtered.forEach((e) => {
    const d = new Date(e.date);
    const mk = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    const existing = groups.find((g) => g.monthKey === mk);
    if (existing) {
      existing.events.push(e);
    } else {
      groups.push({ monthKey: mk, label, events: [e] });
    }
  });

  const filterCounts: Record<string, number> = { all: timeline.length };
  timeline.forEach((e) => {
    const f = typeToFilter[e.type];
    filterCounts[f] = (filterCounts[f] || 0) + 1;
  });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-base font-bold text-slate-800">Student Case File</h3>
          <p className="text-xs text-slate-500 mt-0.5">All events, newest first — {timeline.length} total entries</p>
        </div>
        <button onClick={onAddNote} className="btn-primary"><Plus className="w-4 h-4" /> Add note</button>
      </div>

      {/* Filter bar */}
      <div className="flex gap-2 flex-wrap">
        {filterOptions.map((f) => {
          const count = filterCounts[f.id] ?? 0;
          if (f.id !== 'all' && count === 0) return null;
          return (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                activeFilter === f.id && f.id === 'Recognition'
                  ? 'bg-amber-400 text-white border-amber-400 shadow-sm'
                  : activeFilter === f.id
                  ? 'bg-teal-600 text-white border-teal-600 shadow-sm'
                  : f.id === 'Recognition'
                  ? 'bg-amber-50 text-amber-700 border-amber-200 hover:border-amber-400 hover:bg-amber-100'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700'
              }`}
            >
              {f.label}
              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                activeFilter === f.id ? 'bg-white/20' : f.id === 'Recognition' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100'
              }`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 ? (
        <div className="card-premium flex flex-col items-center justify-center py-16 text-slate-400 gap-3">
          <Calendar className="w-10 h-10 text-slate-200" />
          <p className="text-sm">No events match this filter.</p>
          <button onClick={() => setActiveFilter('all')} className="text-sm text-teal-600 hover:text-teal-700 font-medium">Show all events</button>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.monthKey}>
              <div className="flex items-center gap-3 mb-4">
                <div className="h-px flex-1 bg-slate-100" />
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{group.label}</span>
                <div className="h-px flex-1 bg-slate-100" />
              </div>
              <div className="relative">
                <div className="absolute left-[18px] top-0 bottom-0 w-px bg-slate-100" />
                <div className="space-y-3 pl-10">
                  {group.events.map((event, idx) => {
                    const cfg = typeConfig[event.type] || typeConfig['note'];
                    const Icon = cfg.icon;
                    const ring = severityRing[event.severity || 'low'];
                    const d = new Date(event.date);
                    const dayLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                    const isRecognition = event.type === 'success';

                    if (isRecognition) {
                      return (
                        <div key={idx} className="relative rounded-xl border-2 border-amber-300 bg-gradient-to-r from-amber-50 to-yellow-50 p-4 shadow-sm hover:shadow-md transition-shadow">
                          {/* Gold shimmer accent bar */}
                          <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-xl bg-gradient-to-r from-amber-400 via-yellow-300 to-amber-400" />
                          {/* Timeline dot */}
                          <div className="absolute -left-[29px] top-4 w-3.5 h-3.5 rounded-full border-2 border-white bg-amber-400 shadow-sm ring-2 ring-amber-200" />
                          <div className="flex items-start justify-between gap-3 flex-wrap">
                            <div className="flex items-start gap-3 min-w-0">
                              <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 bg-amber-400 shadow-sm">
                                <Star className="w-4 h-4 text-white fill-white" />
                              </div>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                  <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-400 text-white">
                                    Recognition
                                  </span>
                                  {event.meta && (
                                    <span className="text-[10px] text-amber-700 border border-amber-200 bg-amber-50 px-2 py-0.5 rounded-full">{event.meta}</span>
                                  )}
                                </div>
                                <p className="text-sm font-bold text-amber-900 leading-tight">{event.title}</p>
                                <p className="text-xs text-amber-700 mt-1 leading-relaxed">{event.description}</p>
                                {event.staff && (
                                  <p className="text-[10px] text-amber-600 mt-1.5 font-medium flex items-center gap-1">
                                    <User className="w-3 h-3" />{event.staff}
                                  </p>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="text-xs font-semibold text-amber-600">{dayLabel}</span>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div key={idx} className={`relative rounded-xl border p-4 ${ring} transition-shadow hover:shadow-sm`}>
                        {/* Timeline dot */}
                        <div className={`absolute -left-[29px] top-4 w-3.5 h-3.5 rounded-full border-2 border-white ${cfg.dot} shadow-sm`} />
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cfg.dot} bg-opacity-15`}>
                              <Icon className={`w-3.5 h-3.5 ${cfg.dot.replace('bg-', 'text-')}`} />
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.dot} bg-opacity-10 ${cfg.dot.replace('bg-', 'text-')}`}>
                                  {cfg.label}
                                </span>
                                {event.severity === 'high' && (
                                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">High concern</span>
                                )}
                                {event.meta && event.category !== 'Actions' && (
                                  <span className="text-[10px] text-slate-500 border border-slate-200 px-2 py-0.5 rounded-full">{event.meta}</span>
                                )}
                              </div>
                              <p className="text-sm font-semibold text-slate-800 leading-tight">{event.title}</p>
                              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{event.description}</p>
                              {event.staff && (
                                <p className="text-[10px] text-slate-400 mt-1.5 font-medium flex items-center gap-1">
                                  <User className="w-3 h-3" />{event.staff}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <span className="text-xs font-semibold text-slate-500">{dayLabel}</span>
                            {event.category === 'Actions' && event.meta && dismissedActions.has(event.meta) && (
                              <button
                                onClick={() => undoDismissal(event.meta!)}
                                className="flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-600 text-[10px] font-semibold hover:bg-slate-100 transition-colors"
                              >
                                <RotateCcw className="w-2.5 h-2.5" /> Undo
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

