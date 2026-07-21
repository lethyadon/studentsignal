import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePriorityBar } from '../context/PriorityBarContext';
import {
  getDashboardStats, getStudents, getInterventions, getAnalysisResults,
  getAllDemoSignalStatuses, mapOwnerToStaffName, addDemoIntervention, setDemoSignalStatus,
  subscribeToSignalStatuses, subscribeToInterventions, getHOYYearGroup, ALL_YEAR_GROUPS, type SignalStatus,
} from '../lib/data';
import type { DashboardStats, Student, Intervention, AnalysisResult } from '../types';
import QuickNoteModal from '../components/QuickNoteModal';
import GlobalPriorityBar from '../components/GlobalPriorityBar';
import { Toast, useToast } from '../components/Toast';
import {
  AlertTriangle, TrendingDown, TrendingUp, ClipboardList, ChevronRight,
  ArrowRight, Plus, X, Brain, Activity, ShieldAlert, Lightbulb,
  Filter, Check, Eye, CheckCircle, Edit2,
  ArrowUp, Award, Layers, BookOpen, UserCheck, Users, ShieldCheck, ExternalLink, StickyNote,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type YearScope = string;

// ─── Constants ────────────────────────────────────────────────────────────────

const PRIORITY_BADGE: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high: 'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low: 'bg-slate-100 text-slate-600 border-slate-200',
};

const SIGNAL_DOT: Record<string, string> = {
  red: 'bg-red-400', amber: 'bg-amber-400', purple: 'bg-amber-400',
  green: 'bg-emerald-400', blue: 'bg-blue-400',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDataSources(student: Student, analysis?: AnalysisResult): string[] {
  const src: string[] = [];
  if (student.attendance_pct !== undefined && student.attendance_pct < 97) src.push('Arbor');
  if (student.behaviour_score !== undefined && student.behaviour_score > 3) src.push('ClassCharts');
  if (student.send_status) src.push('Bromcom');
  if (analysis?.key_reasons?.some((r) => /safeguard|cpoms/i.test(r))) src.push('CPOMS');
  if (analysis?.key_reasons?.some((r) => /staff|teacher|lsa|tutor|note|comment|observation/i.test(r))) src.push('Staff Feedback');
  if (!src.includes('Arbor')) src.unshift('Arbor');
  if (!src.includes('ClassCharts') && src.length < 3) src.push('ClassCharts');
  return src;
}

function getConfidence(analysis?: AnalysisResult, student?: Student): number {
  if (analysis?.confidence_score) return analysis.confidence_score;
  const reasons = (analysis?.key_reasons?.length || 0) * 4;
  const safeguarding = analysis?.key_reasons?.some((r) => /safeguard/i.test(r)) ? 12 : 0;
  const attendanceDrop = student?.attendance_pct !== undefined
    ? student.attendance_pct < 80 ? 18 : student.attendance_pct < 88 ? 10 : student.attendance_pct < 93 ? 5 : 0
    : 0;
  const behaviourHigh = student?.behaviour_score !== undefined && student.behaviour_score > 30 ? 8 : 0;
  return Math.min(97, 62 + reasons + safeguarding + attendanceDrop + behaviourHigh);
}

function getAISummary(analysis: AnalysisResult | undefined, student: Student): string {
  if (analysis?.signal_explanation && analysis.signal_explanation.length > 40) return analysis.signal_explanation;
  const cat = analysis?.signal_category || student.signal_category;
  const att = student.attendance_pct ?? 95;
  const beh = student.behaviour_score ?? 0;
  if (cat === 'red' && beh > 30) {
    return 'Behaviour has escalated consistently over four weeks, with incidents increasing in both frequency and severity. This pattern mirrors students who previously required pastoral intervention.';
  }
  if (cat === 'red' && att < 80) {
    return 'Attendance has dropped significantly below expected thresholds. Combined with welfare indicators from multiple staff, this warrants immediate pastoral review.';
  }
  if (cat === 'red') {
    return 'Multiple systems have flagged this student simultaneously, suggesting a developing situation rather than isolated incidents. Early intervention is recommended.';
  }
  if (cat === 'purple') {
    return 'This student is showing a gradual withdrawal pattern that rarely surfaces in behaviour systems alone. Falling engagement, quieter classroom presence, and increased lateness suggest something may be affecting their wellbeing.';
  }
  if (cat === 'amber') {
    return 'A consistent concern has emerged across multiple weeks. Without early intervention, this pattern is likely to continue developing. This is an opportunity for early action.';
  }
  return 'The intelligence engine has identified a pattern requiring staff attention, drawing on data from multiple connected systems.';
}

function timeAgo(iso?: string | null): string {
  if (!iso) return '';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function getRecommendedAction(analysis: AnalysisResult | undefined, student: Student): string {
  if (analysis?.suggested_pastoral_action) return analysis.suggested_pastoral_action;
  const cat = analysis?.signal_category || student.signal_category;
  const reasons = analysis?.key_reasons?.join(' ').toLowerCase() || '';
  if (/safeguard|cpoms/i.test(reasons)) return 'DSL welfare review';
  if (cat === 'red') return 'Pastoral meeting + parent/carer contact';
  if (cat === 'purple') return 'Discreet check-in with form tutor';
  if (cat === 'amber') return 'Review & monitor — assign to HOY';
  return 'Pastoral meeting';
}

function getSuggestedOwner(analysis: AnalysisResult | undefined, student: Student): string {
  if (analysis?.suggested_owner) return mapOwnerToStaffName(analysis.suggested_owner, student.year_group);
  const reasons = analysis?.key_reasons?.join(' ').toLowerCase() || '';
  if (/safeguard|cpoms|dsl/i.test(reasons)) return 'Mr Ahmed (DSL)';
  if (student.send_status) return 'Ms Jones (SENDCo)';
  return mapOwnerToStaffName('head of year', student.year_group) || 'Ms Harris (HOY Y10)';
}

function getActionRationale(analysis: AnalysisResult | undefined, student: Student): string {
  const reasons = (analysis?.key_reasons || []).join(' ').toLowerCase();
  const cat = analysis?.signal_category || student.signal_category;
  if (/safeguard|cpoms|dsl/i.test(reasons))
    return 'A safeguarding concern is flagged. DSL must be informed within 24 hours — this is a statutory duty regardless of outcome.';
  if (student.send_status?.toLowerCase().includes('ehcp') || /ehcp/i.test(reasons))
    return 'This student has an EHCP. A missed review or unmet provision is a legal obligation under the SEND Code of Practice.';
  if (student.attendance_pct !== undefined && student.attendance_pct < 80)
    return `At ${student.attendance_pct}%, this student has crossed the persistent absence threshold. A formal parent contact and attendance support plan are now legally required.`;
  if (/attendance/i.test(reasons) && student.attendance_pct !== undefined && student.attendance_pct < 92)
    return 'Attendance is declining toward the persistent absence threshold. Early HOY contact now prevents a formal intervention later.';
  if (/subject|class|lesson|maths|english|science/i.test(reasons))
    return 'Behaviour incidents concentrate in specific lessons — a subject-specific trigger, not general disengagement. Subject teacher contact alongside HOY support addresses the root cause.';
  if (cat === 'purple')
    return 'This student is performing on paper but internal data signals hidden distress. A discreet check-in from someone they trust is more effective than formal intervention at this stage.';
  if (cat === 'red')
    return 'Multiple risk factors are converging simultaneously. Delay increases the risk of serious disengagement or a crisis requiring a much heavier intervention.';
  return 'Cross-source analysis has identified a pattern that warrants pastoral attention before the situation escalates further.';
}

// ─── Priority Card ────────────────────────────────────────────────────────────

interface PriorityCardProps {
  student: Student;
  analysis?: AnalysisResult;
  existingActions?: Intervention[];
  suggestions?: string[];
  isUrgent?: boolean;
  role?: string;
  onAccept: () => void;
  onModify: () => void;
  onEscalate: () => void;
  onMarkReviewed?: () => void;
  // DSL-specific quick-assign handlers
  onAssignHOY?: () => void;
  onAssignSENDCO?: () => void;
  onAssignTutor?: () => void;
  onCreateSafeguarding?: () => void;
}

function PriorityCard({ student, analysis, existingActions = [], isUrgent, role, onAccept, onModify, onEscalate, onMarkReviewed, onAssignHOY, onAssignSENDCO, onAssignTutor, onCreateSafeguarding }: PriorityCardProps) {
  const cat = analysis?.signal_category || student.signal_category || 'amber';
  const sources = getDataSources(student, analysis);
  const confidence = getConfidence(analysis, student);
  const aiSummary = getAISummary(analysis, student);
  const recommendedAction = getRecommendedAction(analysis, student);
  const suggestedOwner = getSuggestedOwner(analysis, student);
  const actionRationale = getActionRationale(analysis, student);
  const reasons = analysis?.key_reasons?.slice(0, 4) || [];
  const initials = (student.name || '').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const hasExistingAction = existingActions.length > 0;

  // When actions are already in motion, downgrade stripe to amber — this is a review, not a first-response
  const urgencyConfig = hasExistingAction
    ? { stripe: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-500', label: 'Actions In Progress — Review', icon: Eye }
    : isUrgent || cat === 'red'
    ? { stripe: 'bg-red-600', badge: 'bg-red-50 text-red-700 border-red-200', dot: 'bg-red-500', label: 'Immediate Action Needed', icon: AlertTriangle }
    : cat === 'purple'
    ? { stripe: 'bg-orange-500', badge: 'bg-orange-50 text-orange-700 border-orange-200', dot: 'bg-orange-500', label: 'Emerging Concern', icon: TrendingDown }
    : { stripe: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200', dot: 'bg-amber-400', label: 'Review Required', icon: Eye };

  const UrgIcon = urgencyConfig.icon;

  const confColor = confidence >= 85 ? 'bg-red-500' : confidence >= 70 ? 'bg-amber-500' : 'bg-blue-500';

  return (
    <div className="rounded-2xl border border-slate-200 overflow-hidden shadow-sm hover:shadow-md transition-shadow">
      {/* Priority stripe */}
      <div className={`${urgencyConfig.stripe} px-5 py-3 flex items-center justify-between`}>
        <div className="flex items-center gap-2">
          <UrgIcon className="w-4 h-4 text-white" />
          <span className="text-white text-xs font-bold uppercase tracking-widest">{urgencyConfig.label}</span>
        </div>
        <div className="flex items-center gap-3">
          {hasExistingAction && (
            <span className="bg-white/25 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {existingActions.length} action{existingActions.length > 1 ? 's' : ''} in progress
            </span>
          )}
          {!hasExistingAction && (
            <span className="bg-white/20 text-white text-[10px] font-semibold px-2 py-0.5 rounded-full border border-white/30">No action assigned yet</span>
          )}
          <span className="text-white/80 text-xs font-medium">{confidence}% confidence</span>
        </div>
      </div>

      <div className="bg-white p-5">
        {/* Student identity */}
        <div className="flex items-start gap-3.5 mb-5">
          <div className="w-11 h-11 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-sm shrink-0">
            {initials}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-slate-900 text-base leading-tight">{student.name}</h3>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-xs text-slate-500">{student.year_group} · {student.form}</span>
              {student.send_status && (
                <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-semibold">{student.send_status}</span>
              )}
              {student.pupil_premium && (
                <span className="text-[10px] bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded font-semibold">PP</span>
              )}
            </div>
            {analysis?.created_at && (
              <p className="text-[10px] text-slate-400 mt-1">
                Signal detected: {new Date(analysis.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Attendance</div>
            <span className={`text-sm font-bold ${(student.attendance_pct ?? 100) < 85 ? 'text-red-600' : (student.attendance_pct ?? 100) < 92 ? 'text-amber-600' : 'text-slate-800'}`}>
              {student.attendance_pct !== undefined ? `${student.attendance_pct}%` : '—'}
            </span>
          </div>
        </div>

        {/* Why this student surfaced */}
        <div className="mb-4">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2.5">Why this student surfaced</div>
          {reasons.length > 0 ? (
            <div className="space-y-1.5">
              {reasons.map((r, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className={`w-1.5 h-1.5 rounded-full ${urgencyConfig.dot} mt-1.5 shrink-0`} />
                  <p className="text-sm text-slate-700 leading-snug">{r}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Pattern detected across connected data sources.</p>
          )}
        </div>

        {/* Sources */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Sources:</span>
          {sources.map((s) => (
            <span key={s} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{s}</span>
          ))}
        </div>

        {/* AI Summary */}
        <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 mb-4">
          <div className="flex items-start gap-2">
            <Brain className="w-3.5 h-3.5 text-teal-600 mt-0.5 shrink-0" />
            <p className="text-xs text-slate-600 leading-relaxed italic">"{aiSummary}"</p>
          </div>
        </div>

        {/* Active interventions — shown when action already exists */}
        {hasExistingAction && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3">
            <div className="text-[10px] font-bold text-amber-700 uppercase tracking-widest mb-2">
              Active interventions ({existingActions.length})
            </div>
            <div className="space-y-1.5">
              {existingActions.map((a) => (
                <div key={a.id} className="flex items-start gap-2">
                  <CheckCircle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <span className="text-xs font-semibold text-amber-900">{a.action_type}</span>
                    <span className="text-[10px] text-amber-700 ml-1.5">→ {a.assigned_to}</span>
                    {a.due_date && <span className="text-[10px] text-amber-600 ml-1.5">· Due {a.due_date}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* No action warning */}
        {!hasExistingAction && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
            <p className="text-xs font-semibold text-red-700">No intervention assigned — this student needs action now.</p>
          </div>
        )}

        {/* Recommendation + rationale */}
        <div className="rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-3 mb-4">
          <div className="grid grid-cols-2 gap-3 mb-2">
            <div>
              <div className="text-[10px] text-teal-600 font-bold uppercase tracking-widest mb-0.5">
                {hasExistingAction ? 'Consider adding' : 'Recommended action'}
              </div>
              <p className="text-xs font-bold text-teal-900 leading-tight">{recommendedAction}</p>
            </div>
            <div>
              <div className="text-[10px] text-teal-600 font-bold uppercase tracking-widest mb-0.5">Suggested owner</div>
              <p className="text-xs font-bold text-teal-900 leading-tight">{existingActions[0]?.assigned_to || suggestedOwner}</p>
            </div>
          </div>
          <div className="border-t border-teal-200 pt-2 mt-1">
            <div className="text-[10px] text-teal-600 font-bold uppercase tracking-widest mb-0.5">Why this action</div>
            <p className="text-[11px] text-teal-800 leading-relaxed">{actionRationale}</p>
          </div>
        </div>

        {/* Confidence bar */}
        <div className="mb-5">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Pattern confidence</span>
            <span className="text-xs font-bold text-slate-700">{confidence}%</span>
          </div>
          <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div className={`h-full rounded-full transition-all ${confColor}`} style={{ width: `${confidence}%` }} />
          </div>
        </div>

        {/* Action buttons — DSL-specific routing vs. standard */}
        {role === 'dsl' ? (
          <div className="space-y-2">
            <button
              onClick={onAccept}
              className="w-full flex items-center justify-center gap-2 px-3 py-3 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-all shadow-sm"
            >
              <CheckCircle className="w-4 h-4" />
              Review full details
            </button>
            {/* Internal assignment */}
            <div className="grid grid-cols-3 gap-1.5">
              <button onClick={onAssignHOY} className="flex flex-col items-center gap-1 px-2 py-2 rounded-xl bg-white text-slate-700 font-semibold text-[10px] border border-slate-200 hover:bg-teal-50 hover:border-teal-300 hover:text-teal-700 transition-all">
                <UserCheck className="w-3.5 h-3.5 text-teal-600" />
                Assign HOY
              </button>
              <button onClick={onAssignSENDCO} className="flex flex-col items-center gap-1 px-2 py-2 rounded-xl bg-white text-slate-700 font-semibold text-[10px] border border-slate-200 hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 transition-all">
                <Users className="w-3.5 h-3.5 text-violet-600" />
                SENDCo
              </button>
              <button onClick={onAssignTutor} className="flex flex-col items-center gap-1 px-2 py-2 rounded-xl bg-white text-slate-700 font-semibold text-[10px] border border-slate-200 hover:bg-blue-50 hover:border-blue-300 hover:text-blue-700 transition-all">
                <BookOpen className="w-3.5 h-3.5 text-blue-600" />
                Tutor
              </button>
            </div>
            {/* External referral options */}
            <div className="pt-1.5">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 px-1">External referral</div>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: 'Early Help', color: 'text-amber-700 border-amber-200 hover:bg-amber-50 hover:border-amber-400' },
                  { label: 'MASH', color: 'text-red-700 border-red-200 hover:bg-red-50 hover:border-red-400' },
                  { label: 'CAMHS', color: 'text-blue-700 border-blue-200 hover:bg-blue-50 hover:border-blue-400' },
                  { label: 'Police', color: 'text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-400' },
                  { label: 'Social Care', color: 'text-orange-700 border-orange-200 hover:bg-orange-50 hover:border-orange-400' },
                  { label: 'Contact Parent', color: 'text-emerald-700 border-emerald-200 hover:bg-emerald-50 hover:border-emerald-400' },
                ].map(({ label, color }) => (
                  <button
                    key={label}
                    onClick={() => onModify()}
                    className={`px-2 py-2 rounded-xl bg-white font-semibold text-[10px] border transition-all ${color}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={onMarkReviewed || onAccept}
              className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 font-semibold text-xs border border-emerald-200 hover:bg-emerald-100 transition-all"
            >
              <CheckCircle className="w-3.5 h-3.5" />
              Mark Reviewed
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2.5">
            <button
              onClick={onAccept}
              className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl bg-slate-900 text-white font-bold text-xs hover:bg-slate-800 transition-all shadow-sm hover:shadow-md"
            >
              <CheckCircle className="w-4 h-4" />
              {hasExistingAction ? 'Review' : 'Accept'}
            </button>
            <button
              onClick={onModify}
              className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl bg-white text-slate-700 font-bold text-xs border border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all"
            >
              <Edit2 className="w-4 h-4" />
              {hasExistingAction ? 'Add action' : 'Modify'}
            </button>
            <button
              onClick={onEscalate}
              className="flex flex-col items-center gap-1.5 px-3 py-3 rounded-xl bg-white text-red-600 font-bold text-xs border border-red-200 hover:bg-red-50 transition-all"
            >
              <ArrowUp className="w-4 h-4" />
              Escalate
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Source Badge ─────────────────────────────────────────────────────────────

function SourceBadge({ label }: { label: string }) {
  const colors: Record<string, string> = {
    Arbor: 'bg-blue-50 text-blue-700 border-blue-200',
    ClassCharts: 'bg-teal-50 text-teal-700 border-teal-200',
    CPOMS: 'bg-red-50 text-red-700 border-red-200',
    Bromcom: 'bg-violet-50 text-violet-700 border-violet-200',
    'Staff Feedback': 'bg-emerald-50 text-emerald-700 border-emerald-200',
  };
  return (
    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${colors[label] || 'bg-slate-50 text-slate-600 border-slate-200'}`}>
      {label}
    </span>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { profile, demoMode } = useAuth();
  const navigate = useNavigate();
  const effectiveSchoolId = demoMode ? null : profile?.school_id;
  const { toasts, addToast, dismissToast } = useToast();
  const { refresh: refreshPriorityBar } = usePriorityBar();

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [signalStatusMap, setSignalStatusMap] = useState<Map<string, string>>(new Map());
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [yearScope, setYearScope] = useState<YearScope>(() => {
    if (profile?.role === 'head_of_year') {
      const year = getHOYYearGroup(profile?.full_name || '');
      return (year as YearScope) || 'Year 10';
    }
    return 'all';
  });
  const [showFilterDrawer, setShowFilterDrawer] = useState(false);
  const [filterOwner, setFilterOwner] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [expandedTheme, setExpandedTheme] = useState<string | null>(null);

  // Reset year scope when role or name changes (e.g. switching demo personas)
  useEffect(() => {
    if (profile?.role === 'head_of_year') {
      const year = getHOYYearGroup(profile?.full_name || '') as YearScope | null;
      setYearScope(year || 'Year 10');
    }
  }, [profile?.role, profile?.full_name]);

  useEffect(() => {
    async function load() {
      const [s, st, int, an] = await Promise.all([
        getDashboardStats(effectiveSchoolId),
        getStudents(effectiveSchoolId),
        getInterventions(effectiveSchoolId),
        getAnalysisResults(effectiveSchoolId),
      ]);
      setStats(s);
      setStudents(st);
      setInterventions(int);
      setAnalyses(an);
      if (demoMode) setSignalStatusMap(new Map(getAllDemoSignalStatuses()));
      setLoading(false);
    }
    load();
  }, [effectiveSchoolId, demoMode, (profile as any)?.id]);

  // Subscribe to signal status store — any page that calls setDemoSignalStatus triggers this
  useEffect(() => {
    if (!demoMode) return;
    return subscribeToSignalStatuses(() => {
      setSignalStatusMap(new Map(getAllDemoSignalStatuses()));
    });
  }, [demoMode]);

  // Re-merge interventions when any component adds/updates a demo intervention
  useEffect(() => {
    if (!demoMode) return;
    return subscribeToInterventions(() => {
      getInterventions(null).then(int => setInterventions(int));
    });
  }, [demoMode]);

  // Quick-assign helper for DSL card buttons
  function makeQuickAssign(student: Student, assignedTo: string, actionType: string, priority: Intervention['priority']) {
    return () => {
      const newId = `q-${Date.now()}`;
      if (!demoMode) { navigate(`/students/${student.id}?tab=actions&autoopen=true`); return; }
      const today = new Date();
      const reviewDate = new Date(today);
      reviewDate.setDate(today.getDate() + 5);
      // Use proper role label so ActionRow "Raised by" shows e.g. "Mr Ahmed · DSL"
      const roleLabels: Record<string, string> = {
        admin: 'Admin', slt: 'SLT', dsl: 'DSL', sendco: 'SENDCo',
        head_of_year: 'HOY', pastoral_lead: 'Pastoral', tutor: 'Tutor', teacher: 'Teacher',
      };
      const name = (profile as any)?.full_name || '';
      const roleLabel = roleLabels[(profile as any)?.role] || ((profile as any)?.role || '').toUpperCase();
      const createdBy = name ? `${name}${roleLabel ? ` (${roleLabel})` : ''}` : 'Demo User';
      const newIntervention: Intervention = {
        id: newId,
        student_id: student.id,
        assigned_to: assignedTo,
        created_by: createdBy,
        action_type: actionType,
        priority,
        status: 'assigned',
        due_date: today.toISOString().split('T')[0],
        review_date: reviewDate.toISOString().split('T')[0],
        notes: null,
        outcome: null,
        created_at: today.toISOString(),
      };
      const stored = addDemoIntervention(newIntervention);
      if (stored) {
        setInterventions(prev => [newIntervention, ...prev]);
      }
      // Do NOT set signal status to action_in_progress — the student must remain
      // visible in the assignee's morning briefing and signal queue so they can act.
      refreshPriorityBar();
      const shortName = assignedTo.split(' (')[0];
      addToast(`Assigned to ${shortName} — they'll see this in their notification queue`, 'success');
      navigate(`/students/${student.id}?tab=actions&highlight=${newId}`);
    };
  }

  function makeMarkReviewed(student: Student) {
    return () => {
      if (demoMode) {
        setDemoSignalStatus(student.id, 'dismissed' as SignalStatus);
        refreshPriorityBar();
      }
      addToast(`${student.name} marked as reviewed — removed from queue`, 'success');
    };
  }

  if (loading || !stats) {
    return (
      <div className="flex flex-col items-center justify-center h-96 gap-3">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
        <p className="text-sm text-slate-400 font-medium">Analysing your school's data...</p>
      </div>
    );
  }

  const role = profile?.role || 'admin';
  const firstName = profile?.full_name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateStr = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const today = new Date().toISOString().slice(0, 10);

  // ─── Scoped data ──────────────────────────────────────────────────────────

  const scopedStudents = (() => {
    let base = yearScope === 'all' ? students : students.filter((s) => s.year_group === yearScope);
    if (role === 'tutor') base = base.filter((s) => s.form === '10B');
    if (role === 'sendco') base = base.filter((s) => s.send_status);
    return base;
  })();

  const analysisMap = new Map(analyses.map((a) => [a.student_id, a]));
  const studentMap  = new Map(students.map((s) => [s.id, s]));
  const scopedStudentIds  = new Set(scopedStudents.map((s) => s.id));
  const scopedInterventions = interventions.filter((i) => scopedStudentIds.has(i.student_id));

  const ACTIONED = new Set(['action_in_progress', 'review_due', 'resolved', 'escalated', 'dismissed']);

  const needsAction      = scopedStudents.filter((s) => (s.signal_category === 'red' || (!s.signal_category && s.risk_level === 'red')) && !ACTIONED.has(signalStatusMap.get(s.id) || ''));
  const emergingConcerns = scopedStudents.filter((s) => s.signal_category === 'purple' && !ACTIONED.has(signalStatusMap.get(s.id) || ''));
  const reviewsDue       = scopedInterventions.filter((i) => !['completed', 'closed', 'cancelled'].includes(i.status) && i.review_date && i.review_date <= today);
  const positiveProgress = scopedStudents.filter((s) => s.signal_category === 'green' || s.signal_category === 'blue');

  const openActions = (() => {
    const base = scopedInterventions.filter((i) => ['suggested', 'open', 'in_progress', 'assigned'].includes(i.status));
    if (role === 'dsl') {
      return interventions.filter((i) =>
        ['suggested', 'open', 'in_progress', 'assigned'].includes(i.status) &&
        (i.action_type?.toLowerCase().includes('safeguard') || i.action_type?.toLowerCase().includes('dsl') ||
         i.action_type?.toLowerCase().includes('welfare') || i.assigned_to?.toLowerCase().includes('dsl') ||
         i.assigned_to?.toLowerCase().includes('ahmed'))
      );
    }
    if (role === 'sendco') return interventions.filter((i) => ['suggested', 'open', 'in_progress', 'assigned'].includes(i.status) && (studentMap.get(i.student_id)?.send_status || i.action_type?.includes('SEND')));
    return base;
  })();

  const queueFiltered = openActions
    .filter((i) => {
      if (filterPriority && i.priority !== filterPriority) return false;
      if (filterOwner && !(i.assigned_to || '').toLowerCase().includes(filterOwner.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => { const o: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 }; return (o[a.priority] ?? 4) - (o[b.priority] ?? 4); })
    .slice(0, 12);

  const improving  = scopedInterventions.filter((i) => ['improving', 'resolved', 'sustained'].includes(i.outcome_status || ''));
  const escalating = scopedInterventions.filter((i) => i.outcome_status === 'escalating');

  const avgAttendance = scopedStudents.length > 0
    ? (scopedStudents.reduce((sum, s) => sum + (s.attendance_pct ?? 95), 0) / scopedStudents.length).toFixed(1)
    : '—';

  // Priority students = needsAction + emergingConcerns, sorted by urgency
  // Also include students with open interventions assigned to the current user
  // (they may have been actioned by DSL/another role and removed from needsAction)
  const currentUserName = profile?.full_name || '';
  function isAssignedToCurrentUser(assignedTo: string | null | undefined): boolean {
    if (!assignedTo || !currentUserName) return false;
    if (assignedTo === currentUserName) return true;
    if (assignedTo.startsWith(currentUserName + ' ')) return true;
    if (role === 'dsl') return assignedTo.toLowerCase().includes('(dsl)') || assignedTo.toLowerCase().includes('ahmed');
    return false;
  }
  const assignedStudentIds = new Set(
    openActions
      .filter(i => isAssignedToCurrentUser(i.assigned_to))
      .map(i => i.student_id)
  );
  const priorityStudentIds = new Set<string>();
  const priorityStudents = [
    ...needsAction.map((s) => { priorityStudentIds.add(s.id); return { student: s, urgent: true }; }),
    ...emergingConcerns.filter(s => !priorityStudentIds.has(s.id)).map((s) => { priorityStudentIds.add(s.id); return { student: s, urgent: false }; }),
    // Students assigned to me that aren't already in the list
    ...scopedStudents
      .filter(s => assignedStudentIds.has(s.id) && !priorityStudentIds.has(s.id))
      .map(s => { priorityStudentIds.add(s.id); return { student: s, urgent: false }; }),
  ];

  // ─── Role-based headers ────────────────────────────────────────────────────

  const hoyYear = role === 'head_of_year' ? (getHOYYearGroup(profile?.full_name || '') || 'Year Group') : 'Year Group';
  const ROLE_META: Partial<Record<string, { title: string; sub: string; sources: string[] }>> = {
    dsl:          { title: 'Safeguarding Intelligence', sub: `Cross-system patterns that need your review today, ${firstName}.`, sources: ['CPOMS', 'Arbor', 'ClassCharts', 'Staff Feedback'] },
    head_of_year: { title: `${hoyYear} Morning Briefing`,  sub: `Here is what needs your attention today, ${firstName}.`,          sources: ['Arbor', 'ClassCharts', 'Staff Feedback'] },
    tutor:        { title: 'Tutor Group — 10B',         sub: `Your morning briefing, ${firstName}.`,                             sources: ['Arbor', 'ClassCharts'] },
    sendco:       { title: 'SEND Support Overview',     sub: `SEND students requiring attention today, ${firstName}.`,           sources: ['Bromcom', 'Arbor', 'ClassCharts', 'CPOMS'] },
    teacher:      { title: 'Staff Observation Portal',  sub: `Log what you see in class today, ${firstName}. Every observation feeds the pastoral picture.`, sources: ['Staff Feedback'] },
    admin:        { title: 'School Intelligence',       sub: `${greeting}, ${firstName}. Here is your school overview.`,        sources: ['Arbor', 'ClassCharts', 'CPOMS', 'Bromcom', 'Staff Feedback'] },
  };
  const meta = ROLE_META[role] || ROLE_META.admin!;

  // ─────────────────────────────────────────────────────────────────────────
  // TEACHER VIEW — observation intake, scoped students, no safeguarding
  // ─────────────────────────────────────────────────────────────────────────

  if (role === 'teacher') {
    // Teachers see only the year group(s) they teach — in demo, Ms Okonkwo teaches Year 10
    const teacherStudents = students.filter(s => s.year_group === 'Year 10');
    // Students with active signals that the teacher should be aware of (no safeguarding details)
    const awarenessStudents = teacherStudents.filter(s =>
      (s.signal_category === 'red' || s.signal_category === 'amber' || s.signal_category === 'purple') &&
      !interventions.some(i => i.student_id === s.id && i.action_type?.toLowerCase().includes('safeguard'))
    ).slice(0, 8);
    // Actions assigned to this teacher — exact name match
    const myActions = interventions.filter(i =>
      ['open', 'in_progress', 'assigned'].includes(i.status) &&
      (i.assigned_to === currentUserName || (i.assigned_to || '').startsWith(currentUserName + ' '))
    ).slice(0, 5);

    return (
      <div className="space-y-6">
        <Toast toasts={toasts} onDismiss={dismissToast} />
        <div>
          <h1 className="text-xl font-bold text-slate-900">{meta.title}</h1>
          <p className="text-sm text-slate-500 mt-1">{meta.sub}</p>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          {/* Log observation CTA */}
          <div className="card-premium p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
              <Brain className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Log an observation</h3>
              <p className="text-sm text-slate-500 mt-1">
                Choose whether to save privately as a record, or raise a concern for pastoral review.
              </p>
            </div>
            <div className="flex gap-2 mt-auto">
              <button
                onClick={() => setShowQuickNote(true)}
                className="flex-1 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors text-center"
              >
                Log observation
              </button>
            </div>
          </div>

          {/* Students needing awareness — no safeguarding details */}
          <div className="card-premium p-6 flex flex-col gap-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center">
              <Activity className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900">Awareness — Year 10</h3>
              <p className="text-sm text-slate-500 mt-1">Students in your year group with active pastoral concerns. No safeguarding details are shown here.</p>
            </div>
            <div className="space-y-2 flex-1">
              {awarenessStudents.length === 0 ? (
                <p className="text-xs text-slate-400">No active concerns at this time.</p>
              ) : (
                awarenessStudents.map(s => (
                  <div key={s.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-slate-50">
                    <span className="text-sm font-medium text-slate-800">{s.name}</span>
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${
                        s.signal_category === 'red' ? 'bg-red-400' :
                        s.signal_category === 'purple' ? 'bg-orange-400' : 'bg-amber-400'
                      }`} />
                      <span className="text-xs text-slate-400">{s.form}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Actions assigned to me */}
        {myActions.length > 0 && (
          <div className="card-premium p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-slate-800 text-sm flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-teal-600" />
                Actions assigned to you ({myActions.length})
              </h3>
              <button
                onClick={() => navigate('/interventions?mine=true')}
                className="text-xs text-teal-600 font-semibold hover:text-teal-800 flex items-center gap-1"
              >
                View all <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="space-y-2">
              {myActions.map(i => {
                const s = students.find(st => st.id === i.student_id);
                return (
                  <button
                    key={i.id}
                    onClick={() => navigate(`/students/${i.student_id}?tab=actions&highlight=${i.id}`)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100 hover:border-slate-200 transition-colors text-left group"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{s?.name || '—'}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{i.action_type}</div>
                      {i.created_by && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          From: {i.created_by.replace(/\s*\([^)]*\)/, '')}
                          {(() => { const m = i.created_by.match(/\(([^)]+)\)/); return m ? <span className="ml-1 font-medium text-slate-500">· {m[1]}</span> : null; })()}
                        </div>
                      )}
                      {i.due_date && (
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Due: {new Date(i.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        i.priority === 'urgent' ? 'bg-red-50 text-red-700 border-red-200' :
                        i.priority === 'high' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                        'bg-slate-100 text-slate-600 border-slate-200'
                      }`}>{i.priority}</span>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-teal-500 transition-colors" />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* How observations are used */}
        <div className="card-premium p-5">
          <h3 className="font-semibold text-slate-800 text-sm mb-3">How your observations are used</h3>
          <div className="grid sm:grid-cols-3 gap-4">
            {[
              { icon: StickyNote, title: 'Observation only', desc: 'Saved to the student chronology. Not visible to the student. No signal raised.' },
              { icon: AlertTriangle, title: 'Raise concern', desc: 'Adds evidence to or creates a signal. Triggers pastoral team notification.' },
              { icon: ShieldAlert, title: 'Pastoral team acts', desc: 'HOY, SENDCo, or DSL reviews and decides the next step.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-3">
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0">
                  <Icon className="w-4 h-4 text-teal-600" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">{title}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {showQuickNote && (
          <QuickNoteModal
            students={teacherStudents}
            onClose={() => setShowQuickNote(false)}
            onSaved={() => { setShowQuickNote(false); addToast('Observation logged.', 'success'); }}
          />
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SCHOOL INTELLIGENCE VIEW (Principal / Admin)
  // ─────────────────────────────────────────────────────────────────────────

  if (role === 'admin' || role === 'slt' || role === 'principal') {
    const allNeedsAction      = students.filter((s) => s.signal_category === 'red' || s.risk_level === 'red');
    const allEmerging         = students.filter((s) => s.signal_category === 'purple');
    const allPositive         = students.filter((s) => s.signal_category === 'green' || s.signal_category === 'blue');
    const allOpenActions      = interventions.filter((i) => ['open', 'in_progress', 'assigned'].includes(i.status));
    const allSuggestedActions = interventions.filter((i) => i.status === 'suggested');
    const allSendStudents     = students.filter((s) => s.send_status);
    const allLowAttendance    = students.filter((s) => (s.attendance_pct ?? 100) < 90);
    const schoolAvgAtt        = (students.reduce((s, st) => s + (st.attendance_pct ?? 95), 0) / Math.max(1, students.length)).toFixed(1);

    const presentYearGroups = ALL_YEAR_GROUPS.filter(y => students.some(s => s.year_group === y));
    const yearGroups = presentYearGroups.length > 0 ? presentYearGroups.slice(-Math.min(5, presentYearGroups.length)) : ['Year 9', 'Year 10', 'Year 11'];
    const yearStats = yearGroups.map((y) => {
      const ys = students.filter((s) => s.year_group === y);
      const red = ys.filter((s) => s.signal_category === 'red' || s.risk_level === 'red').length;
      const purple = ys.filter((s) => s.signal_category === 'purple').length;
      const green = ys.filter((s) => s.signal_category === 'green' || s.signal_category === 'blue').length;
      const att = ys.length > 0 ? (ys.reduce((sum, s) => sum + (s.attendance_pct ?? 95), 0) / ys.length).toFixed(1) : '—';
      return { year: y, count: ys.length, red, purple, green, att };
    });

    const schoolThemes = [
      { label: 'Behaviour escalation', count: allNeedsAction.filter((s) => (s.behaviour_score ?? 0) > 20).length, color: 'bg-red-500', students: allNeedsAction.filter((s) => (s.behaviour_score ?? 0) > 20) },
      { label: 'Attendance concern', count: allLowAttendance.length, color: 'bg-amber-500', students: allLowAttendance },
      { label: 'Emerging withdrawal', count: allEmerging.length, color: 'bg-orange-500', students: allEmerging },
      { label: 'SEND support gap', count: allSendStudents.filter((s) => s.signal_category === 'red' || s.signal_category === 'amber').length, color: 'bg-violet-500', students: allSendStudents.filter((s) => s.signal_category === 'red' || s.signal_category === 'amber') },
    ];

    return (
      <div className="space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-1">Morning Briefing</p>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{meta.title}</h1>
              <p className="text-sm text-slate-500 mt-1">{dateStr}</p>
            </div>
            <button onClick={() => setShowQuickNote(true)} className="btn-primary shrink-0">
              <Plus className="w-4 h-4" /> Quick Note
            </button>
          </div>
          {/* Source attribution */}
          <div className="mt-4 flex items-center gap-2 flex-wrap">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Analysed from:</span>
            {meta.sources.map((s) => <SourceBadge key={s} label={s} />)}
            <span className="text-[10px] text-slate-400 ml-1">· Updated this morning</span>
          </div>
        </div>

        <GlobalPriorityBar />

        {/* School AI Summary */}
        <div className="bg-slate-900 rounded-2xl px-6 py-5">
          <div className="flex items-start gap-4">
            <div className="w-9 h-9 rounded-xl bg-teal-500/20 flex items-center justify-center shrink-0">
              <Brain className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-xs font-bold text-teal-400 uppercase tracking-widest">School AI Summary</span>
              </div>
              <p className="text-sm text-slate-200 leading-relaxed">
                {allNeedsAction.length > 0
                  ? `${allNeedsAction.length} student${allNeedsAction.length !== 1 ? 's' : ''} require immediate pastoral attention today. ${allSuggestedActions.length > 0 ? `${allSuggestedActions.length} suggested action${allSuggestedActions.length !== 1 ? 's' : ''} awaiting acceptance. ` : ''}Attendance is tracking at ${schoolAvgAtt}% across the school. ${allEmerging.length > 0 ? `${allEmerging.length} emerging concern${allEmerging.length !== 1 ? 's' : ''} warrant discreet monitoring.` : 'No emerging concerns flagged.'} ${improving.length > 0 ? `${improving.length} active intervention${improving.length !== 1 ? 's' : ''} showing positive outcomes.` : ''}`
                  : `No students currently require immediate intervention. ${allSuggestedActions.length > 0 ? `${allSuggestedActions.length} suggested actions awaiting review. ` : ''}Attendance is tracking at ${schoolAvgAtt}% — within expected range. ${allEmerging.length > 0 ? `${allEmerging.length} students are in the emerging concern category, worth monitoring this week.` : 'No safeguarding escalations in the last 48 hours.'}`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[
            { label: 'Needs action',       value: allNeedsAction.length,       sub: 'Priority students',   color: allNeedsAction.length > 0 ? 'text-red-600' : 'text-slate-800', icon: AlertTriangle, bg: 'bg-red-50', href: '/signal-queue' },
            { label: 'Awaiting triage',    value: allSuggestedActions.length,  sub: 'Suggested actions',   color: allSuggestedActions.length > 0 ? 'text-purple-600' : 'text-slate-800', icon: Lightbulb, bg: 'bg-purple-50', href: '/interventions' },
            { label: 'Active actions',     value: allOpenActions.length,       sub: 'Accepted & in progress', color: 'text-slate-800', icon: ClipboardList, bg: 'bg-slate-50', href: '/interventions' },
            { label: 'Emerging concerns',  value: allEmerging.length,          sub: 'Silent decline',      color: allEmerging.length > 0 ? 'text-orange-600' : 'text-slate-800', icon: TrendingDown, bg: 'bg-orange-50', href: '/signal-queue' },
            { label: 'School attendance',  value: `${schoolAvgAtt}%`,          sub: 'Average today',       color: parseFloat(schoolAvgAtt) < 92 ? 'text-red-600' : 'text-emerald-600', icon: Activity, bg: 'bg-emerald-50', href: '/analysis' },
          ].map(({ label, value, sub, color, icon: Icon, bg, href }) => (
            <button key={label} onClick={() => navigate(href)}
              className="bg-white rounded-2xl border border-slate-200 p-5 text-left hover:border-teal-300 hover:shadow-sm transition-all group"
            >
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                <Icon className="w-4.5 h-4.5 text-slate-600" />
              </div>
              <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
              <div className="text-sm font-semibold text-slate-700 mt-0.5">{label}</div>
              <div className="text-xs text-slate-400 mt-0.5">{sub}</div>
            </button>
          ))}
        </div>

        {/* Year group intelligence */}
        <div>
          <h2 className="text-base font-bold text-slate-900 mb-4">Year Group Intelligence</h2>
          <div className="grid gap-3">
            {yearStats.filter((y) => y.count > 0).map((y) => (
              <div key={y.year} className="bg-white rounded-2xl border border-slate-200 px-5 py-4 flex items-center gap-6">
                <div className="w-24 shrink-0">
                  <div className="font-bold text-slate-900 text-sm">{y.year}</div>
                  <div className="text-xs text-slate-400">{y.count} students</div>
                </div>
                <div className="flex items-center gap-5 flex-1 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-red-500" />
                    <span className="text-sm font-bold text-slate-800">{y.red}</span>
                    <span className="text-xs text-slate-500">priority</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-orange-500" />
                    <span className="text-sm font-bold text-slate-800">{y.purple}</span>
                    <span className="text-xs text-slate-500">emerging</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span className="text-sm font-bold text-slate-800">{y.green}</span>
                    <span className="text-xs text-slate-500">positive</span>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-xs text-slate-400 mb-0.5">Attendance</div>
                  <div className={`text-sm font-bold ${parseFloat(y.att) < 90 ? 'text-red-600' : 'text-slate-800'}`}>{y.att}%</div>
                </div>
                <button onClick={() => navigate(`/signal-queue?year=${encodeURIComponent(y.year)}`)} className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-teal-600 transition-colors">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Emerging themes + effectiveness */}
        <div className="grid lg:grid-cols-2 gap-6">
          {/* Top themes */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-900 text-sm mb-4">Emerging Themes</h3>
            <div className="space-y-1">
              {schoolThemes.map((t) => (
                <div key={t.label}>
                  <button
                    onClick={() => t.count > 0 ? setExpandedTheme(expandedTheme === t.label ? null : t.label) : undefined}
                    className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg transition-colors ${t.count > 0 ? 'hover:bg-slate-50 cursor-pointer' : 'cursor-default'}`}
                  >
                    <div className={`w-2 h-2 rounded-full ${t.color} shrink-0`} />
                    <span className="text-sm text-slate-700 flex-1 text-left">{t.label}</span>
                    <span className="text-sm font-bold text-slate-900">{t.count}</span>
                    {t.count === 0 && <span className="text-xs text-emerald-600 font-medium">None flagged</span>}
                    {t.count > 0 && (
                      <ChevronRight className={`w-3.5 h-3.5 text-slate-400 transition-transform ${expandedTheme === t.label ? 'rotate-90' : ''}`} />
                    )}
                  </button>
                  {expandedTheme === t.label && t.students.length > 0 && (
                    <div className="ml-5 mt-1 mb-2 border-l-2 border-slate-100 pl-3">
                      <div className="grid grid-cols-[1fr_auto_auto_auto] gap-x-3 gap-y-1 text-xs">
                        <span className="font-bold text-slate-400 uppercase tracking-wider">Student</span>
                        <span className="font-bold text-slate-400 uppercase tracking-wider">Year</span>
                        <span className="font-bold text-slate-400 uppercase tracking-wider">Risk</span>
                        <span className="font-bold text-slate-400 uppercase tracking-wider">Action</span>
                        {t.students.slice(0, 8).map(s => {
                          const hasAction = interventions.some(i => i.student_id === s.id && !['completed', 'cancelled', 'closed', 'suggested'].includes(i.status));
                          const riskColor = s.signal_category === 'red' || s.risk_level === 'red' ? 'text-red-600' : s.signal_category === 'amber' ? 'text-amber-600' : 'text-slate-600';
                          return (
                            <React.Fragment key={s.id}>
                              <Link to={`/students/${s.id}`} className="text-slate-700 font-medium hover:text-teal-600 truncate">{s.name}</Link>
                              <span className="text-slate-500">{s.year_group?.replace('Year ', 'Y')}{s.form ? ` ${s.form}` : ''}</span>
                              <span className={`font-semibold ${riskColor}`}>{(s.signal_category || s.risk_level || '—').toUpperCase()}</span>
                              <span className={hasAction ? 'text-teal-600 font-medium' : 'text-slate-400'}>{hasAction ? 'Active' : 'None'}</span>
                            </React.Fragment>
                          );
                        })}
                      </div>
                      {t.students.length > 8 && (
                        <button onClick={() => navigate('/signal-queue')} className="text-xs text-teal-600 font-medium mt-2 hover:text-teal-700">
                          + {t.students.length - 8} more in Signal Queue
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
          {/* Intervention effectiveness */}
          <div className="bg-white rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold text-slate-900 text-sm mb-4">Intervention Effectiveness</h3>
            <div className="space-y-3">
              {[
                { label: 'Improving after support', count: improving.length, color: 'text-emerald-600', icon: TrendingUp },
                { label: 'Escalating — needs review', count: escalating.length, color: 'text-red-600', icon: AlertTriangle },
                { label: 'Positive progress', count: allPositive.length, color: 'text-teal-600', icon: Award },
                { label: 'Open actions', count: allOpenActions.length, color: 'text-blue-600', icon: ClipboardList },
              ].map(({ label, count, color, icon: Icon }) => (
                <div key={label} className="flex items-center gap-3">
                  <Icon className={`w-4 h-4 ${color} shrink-0`} />
                  <span className="text-sm text-slate-700 flex-1">{label}</span>
                  <span className={`text-sm font-bold ${count > 0 ? color : 'text-slate-400'}`}>{count}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-4 border-t border-slate-100">
              <button onClick={() => navigate('/interventions')} className="text-sm text-teal-600 font-medium hover:text-teal-700 flex items-center gap-1">
                View all interventions <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Priority students compact */}
        {allNeedsAction.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-slate-900">Priority Students Today</h2>
              <button onClick={() => navigate('/signal-queue')} className="text-sm text-teal-600 font-medium hover:text-teal-700 flex items-center gap-1">
                View full queue <ArrowRight className="w-4 h-4" />
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-50">
              {allNeedsAction.slice(0, 5).map((s) => {
                const a = analysisMap.get(s.id);
                const initials = (s.name || '').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                return (
                  <div key={s.id} className="px-5 py-4 flex items-center gap-4 hover:bg-slate-50/60 transition-colors">
                    <div className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
                    <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600 text-xs shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900">{s.name}</p>
                      <p className="text-xs text-slate-500">{s.year_group} · {s.form} · {a?.key_reasons?.[0] || 'Pattern detected'}</p>
                    </div>
                    <button onClick={() => navigate(`/students/${s.id}`)} className="text-xs text-teal-600 font-semibold hover:text-teal-700 shrink-0">
                      Review
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

  {showQuickNote && <QuickNoteModal students={students} onClose={() => setShowQuickNote(false)} onSaved={() => setShowQuickNote(false)} />}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SAFEGUARDING INTELLIGENCE VIEW (DSL)
  // ─────────────────────────────────────────────────────────────────────────

  if (role === 'dsl') {
    // Students with active safeguarding patterns — exclude those fully actioned/resolved
    const isFullyActioned = (studentId: string): boolean => {
      const status = signalStatusMap.get(studentId);
      if (status && ['resolved', 'dismissed'].includes(status)) return true;
      // Also exclude if all interventions for this student are completed/cancelled/closed
      const studentInts = interventions.filter(i => i.student_id === studentId);
      if (studentInts.length === 0) return false;
      return studentInts.every(i => ['completed', 'closed', 'cancelled'].includes(i.status));
    };

    const safeguardingStudents = students.filter((s) => {
      if (isFullyActioned(s.id)) return false;
      const a = analysisMap.get(s.id);
      return a?.key_reasons?.some((r) => /safeguard|cpoms|welfare note|abuse|disclosure/i.test(r)) ||
             (s.signal_category === 'red' && (s.attendance_pct ?? 100) < 80);
    });
    const crossSystemStudents = students.filter((s) => {
      if (isFullyActioned(s.id)) return false;
      const a = analysisMap.get(s.id);
      const sourceCount = getDataSources(s, a).length;
      return sourceCount >= 3 && (s.signal_category === 'red' || s.signal_category === 'purple');
    });
    const referralQueue = interventions.filter((i) =>
      ['open', 'in_progress', 'assigned'].includes(i.status) &&
      (i.action_type?.toLowerCase().includes('safeguard') || i.action_type?.toLowerCase().includes('dsl') || i.action_type?.toLowerCase().includes('welfare'))
    );

    const dslPriority = [
      ...safeguardingStudents,
      ...crossSystemStudents.filter((s) => !safeguardingStudents.find((sf) => sf.id === s.id)),
    ].slice(0, 6);

    return (
      <div className="space-y-8">
        {/* Header */}
        <div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-bold text-red-600 uppercase tracking-widest mb-1">Safeguarding Intelligence</p>
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{greeting}, {firstName}.</h1>
              <p className="text-sm text-slate-500 mt-1">{dateStr}</p>
            </div>
            <button onClick={() => setShowQuickNote(true)} className="btn-primary shrink-0"><Plus className="w-4 h-4" /> Quick Note</button>
          </div>
        </div>

        {/* Intelligence Layer Banner */}
        <div className="bg-slate-900 rounded-2xl px-5 py-4 flex items-start gap-4">
          <div className="w-9 h-9 rounded-xl bg-red-500/20 flex items-center justify-center shrink-0 mt-0.5">
            <ShieldAlert className="w-5 h-5 text-red-400" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-xs font-bold text-red-400 uppercase tracking-widest">DSL Intelligence Layer</span>
            </div>
            <p className="text-sm text-slate-200 leading-relaxed">
              {dslPriority.length > 0
                ? `${dslPriority.length} student${dslPriority.length !== 1 ? 's' : ''} ${dslPriority.length === 1 ? 'has' : 'have'} been identified through cross-system pattern analysis. Staff continue logging in CPOMS as normal — you see the distilled picture.`
                : 'No new safeguarding patterns detected overnight. Staff continue logging in CPOMS as normal. All existing referrals are tracked below.'
              }
            </p>
            <div className="flex items-center gap-3 mt-2.5 flex-wrap">
              {['CPOMS', 'Arbor', 'ClassCharts', 'Staff Observations'].map((src) => (
                <span key={src} className="text-[10px] font-bold text-slate-400 uppercase tracking-wider bg-slate-800 px-2.5 py-1 rounded-full">{src}</span>
              ))}
              <span className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">→ Student Signal</span>
            </div>
          </div>
        </div>

        <GlobalPriorityBar />

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Safeguarding patterns', value: dslPriority.length, color: dslPriority.length > 0 ? 'text-red-600' : 'text-slate-800', bg: 'bg-red-50', icon: ShieldAlert },
            { label: 'Cross-system flags', value: crossSystemStudents.length, color: crossSystemStudents.length > 0 ? 'text-amber-600' : 'text-slate-800', bg: 'bg-amber-50', icon: Layers },
            { label: 'Referrals pending', value: referralQueue.length, color: referralQueue.length > 0 ? 'text-blue-600' : 'text-slate-800', bg: 'bg-blue-50', icon: ClipboardList },
            { label: 'Resolved this week', value: improving.length, color: 'text-emerald-600', bg: 'bg-emerald-50', icon: CheckCircle },
          ].map(({ label, value, color, bg, icon: Icon }) => (
            <div key={label} className="bg-white rounded-2xl border border-slate-200 p-5">
              <div className={`w-9 h-9 rounded-xl ${bg} flex items-center justify-center mb-3`}>
                <Icon className="w-4 h-4 text-slate-600" />
              </div>
              <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
              <div className="text-xs text-slate-500 mt-0.5 font-medium">{label}</div>
            </div>
          ))}
        </div>

        {/* Safeguarding priority students */}
        {dslPriority.length > 0 ? (
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">Patterns Requiring Investigation</h2>
            <p className="text-xs text-slate-500 mb-4">The system has identified these through cross-source analysis. Professional judgement always remains with you.</p>
            <div className="grid lg:grid-cols-2 gap-4">
              {dslPriority.map((student) => {
                const analysis = analysisMap.get(student.id);
                const existingActions = scopedInterventions.filter((i) => i.student_id === student.id && ['open', 'in_progress', 'assigned'].includes(i.status));
                const recAction = getRecommendedAction(analysis, student);
                return (
                  <PriorityCard
                    key={student.id}
                    student={student}
                    analysis={analysis}
                    existingActions={existingActions}
                    isUrgent
                    role={profile?.role}
                    onAccept={() => navigate(`/students/${student.id}?tab=actions`)}
                    onModify={() => navigate(`/students/${student.id}?tab=actions&autoopen=true`)}
                    onEscalate={() => navigate(`/students/${student.id}?tab=actions&escalate=true`)}
                    onMarkReviewed={makeMarkReviewed(student)}
                    onAssignHOY={makeQuickAssign(student, mapOwnerToStaffName('head of year', student.year_group), 'Pastoral meeting', 'urgent')}
                    onAssignSENDCO={makeQuickAssign(student, 'Ms Jones (SENDCo)', 'SEND review', 'high')}
                    onAssignTutor={makeQuickAssign(student, 'Mr Patel (Tutor)', 'Tutor check-in', 'high')}
                    onCreateSafeguarding={makeQuickAssign(student, 'Mr Ahmed (DSL)', 'Safeguarding referral', 'urgent')}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-5 flex items-center gap-4">
            <CheckCircle className="w-7 h-7 text-emerald-600 shrink-0" />
            <div>
              <p className="font-semibold text-emerald-800">No new safeguarding patterns identified overnight.</p>
              <p className="text-sm text-emerald-700 mt-0.5">All incoming CPOMS, Arbor, and ClassCharts data has been reviewed. Existing referrals are tracked below.</p>
            </div>
          </div>
        )}

        {/* Referral queue */}
        {referralQueue.length > 0 && (
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-3">Active Referrals & Welfare Reviews</h2>
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-50">
              {referralQueue.map((i) => {
                const s = studentMap.get(i.student_id);
                const isOverdue = i.due_date && i.due_date < today;
                return (
                  <div key={i.id} className={`px-5 py-4 flex items-center gap-4 hover:bg-slate-50/60 transition-colors ${i.priority === 'urgent' ? 'border-l-4 border-l-red-500' : ''}`}>
                    <div className={`w-2 h-2 rounded-full shrink-0 ${i.priority === 'urgent' ? 'bg-red-500' : 'bg-amber-400'}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">{s?.name || 'Unknown'}</span>
                        <span className="text-xs text-slate-400">{s?.year_group}</span>
                        {isOverdue && <span className="text-[10px] bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-semibold">Overdue</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{i.action_type} · Owner: {i.assigned_to || '—'}</p>
                      <div className="flex items-center gap-3 mt-1 flex-wrap">
                        {i.due_date && (
                          <span className={`text-[10px] font-semibold ${isOverdue ? 'text-red-600' : 'text-slate-500'}`}>
                            Due: {new Date(i.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                          </span>
                        )}
                        {i.review_date && (
                          <span className="text-[10px] text-slate-400">
                            Review: {new Date(i.review_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          </span>
                        )}
                        <span className="text-[10px] text-slate-400">
                          Opened: {new Date(i.created_at || Date.now()).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </div>
                    <button onClick={() => navigate(`/students/${i.student_id}?tab=actions&highlight=${i.id}`)}
                      className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-teal-600 transition-colors">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

  {showQuickNote && <QuickNoteModal students={students} onClose={() => setShowQuickNote(false)} onSaved={() => setShowQuickNote(false)} />}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MORNING BRIEFING VIEW (HOY, Tutor, SENDCO, and all other roles)
  // ─────────────────────────────────────────────────────────────────────────

  const roleLabel = role === 'head_of_year' ? 'Year 10 Morning Briefing'
    : role === 'tutor' ? 'Tutor Group Morning Briefing'
    : role === 'sendco' ? 'SEND Support Morning Briefing'
    : 'Morning Briefing';

  return (
    <div className="space-y-8">
      {/* ── Empty-school onboarding (real accounts with no uploaded data) ── */}
      {!demoMode && !loading && students.length === 0 && (
        <div className="min-h-[70vh] flex flex-col items-center justify-center py-12">
          <div className="w-full max-w-2xl">
            {/* Welcome header */}
            <div className="text-center mb-10">
              <div className="w-16 h-16 rounded-2xl bg-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-200">
                <Layers className="w-8 h-8 text-white" />
              </div>
              <h1 className="text-2xl font-bold text-slate-900 mb-2">Welcome to Student Signal</h1>
              <p className="text-slate-500 text-sm leading-relaxed max-w-md mx-auto">
                Your school account is set up. To start seeing pastoral intelligence, upload your student and behaviour data.
              </p>
            </div>

            {/* Step cards */}
            <div className="space-y-3 mb-8">
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
                <div className="w-9 h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center font-bold text-sm shrink-0">1</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 mb-0.5">Upload your MIS & pastoral data</div>
                  <p className="text-sm text-slate-500 mb-3">Import CSV exports from your data sources. Student Signal supports Arbor, CPOMS, ClassCharts, SIMS, and Bromcom.</p>
                  <div className="flex flex-wrap gap-1.5 mb-3">
                    {['Arbor', 'CPOMS', 'ClassCharts', 'SIMS', 'Bromcom'].map(src => (
                      <span key={src} className="text-[10px] font-bold px-2 py-1 rounded-full bg-slate-100 text-slate-600 border border-slate-200">{src}</span>
                    ))}
                  </div>
                  <button onClick={() => navigate('/upload')} className="btn-primary text-sm py-2 px-4">
                    Upload data <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-4 opacity-60">
                <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-sm shrink-0">2</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 mb-0.5">Run pattern analysis</div>
                  <p className="text-sm text-slate-500">Student Signal will cross-reference your data sources and surface students with emerging concerns, attendance risks, and pastoral needs.</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-4 opacity-60">
                <div className="w-9 h-9 rounded-xl bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-sm shrink-0">3</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-slate-900 mb-0.5">Invite your pastoral team</div>
                  <p className="text-sm text-slate-500 mb-3">Add Heads of Year, DSL, SENDCo, tutors — each role sees only what's relevant to them.</p>
                  <Link to="/settings" className="text-sm text-teal-600 hover:text-teal-700 font-semibold flex items-center gap-1 w-fit">
                    Go to User Management <ChevronRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Try demo link */}
            <div className="text-center">
              <p className="text-sm text-slate-500">
                Want to see what the system looks like with data?{' '}
                <Link to="/auth" className="text-teal-600 hover:text-teal-700 font-semibold">
                  Try the interactive demo
                </Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Regular dashboard (demo mode OR real school with data) ── */}
      {(demoMode || students.length > 0 || loading) && (<>
      <div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-teal-600 uppercase tracking-widest mb-1">{roleLabel}</p>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{greeting}, {firstName}.</h1>
            <p className="text-sm text-slate-500 mt-1">{dateStr}</p>
          </div>
          <button onClick={() => setShowQuickNote(true)} className="btn-primary shrink-0">
            <Plus className="w-4 h-4" /> Quick Note
          </button>
        </div>
        {/* Source strip */}
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Intelligence from:</span>
          {meta.sources.map((s) => <SourceBadge key={s} label={s} />)}
          <span className="text-[10px] text-slate-400 ml-1">· Refreshed this morning</span>
        </div>
      </div>

      <GlobalPriorityBar />

      {/* ── Morning Brief Intelligence Summary ── */}
      <div className="bg-slate-900 rounded-2xl px-5 py-4 flex items-start gap-4">
        <div className="w-9 h-9 rounded-xl bg-teal-500/20 flex items-center justify-center shrink-0 mt-0.5">
          <Brain className="w-5 h-5 text-teal-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <span className="text-xs font-bold text-teal-400 uppercase tracking-widest">Morning Brief</span>
            <span className="text-[10px] text-slate-400">·</span>
            <span className="text-[10px] text-slate-400 font-medium">{dateStr}</span>
          </div>
          <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2.5">
            <div className="flex items-start gap-2">
              <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 ${needsAction.length > 0 ? 'bg-red-500/30' : 'bg-emerald-500/20'}`}>
                <AlertTriangle className={`w-2.5 h-2.5 ${needsAction.length > 0 ? 'text-red-400' : 'text-emerald-400'}`} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Who needs attention?</p>
                <p className="text-sm font-semibold text-white mt-0.5">
                  {needsAction.length > 0
                    ? `${needsAction.length} student${needsAction.length !== 1 ? 's' : ''} require immediate action`
                    : 'No critical signals right now'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 ${emergingConcerns.length > 0 ? 'bg-orange-500/30' : 'bg-slate-700'}`}>
                <TrendingDown className={`w-2.5 h-2.5 ${emergingConcerns.length > 0 ? 'text-orange-400' : 'text-slate-500'}`} />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Why?</p>
                <p className="text-sm font-semibold text-white mt-0.5">
                  {emergingConcerns.length > 0
                    ? `${emergingConcerns.length} silent decline pattern${emergingConcerns.length !== 1 ? 's' : ''} detected`
                    : needsAction.length > 0
                    ? needsAction[0] ? (analysisMap.get(needsAction[0].id)?.key_reasons?.[0] || 'Cross-source pattern') : 'Cross-source pattern'
                    : 'All data sources stable'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 ${openActions.length > 0 ? 'bg-blue-500/30' : 'bg-slate-700'}`}>
                <ClipboardList className="w-2.5 h-2.5 text-blue-400" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">What action is needed?</p>
                <p className="text-sm font-semibold text-white mt-0.5">
                  {openActions.length > 0
                    ? `${openActions.length} open action${openActions.length !== 1 ? 's' : ''} in your queue`
                    : reviewsDue.length > 0
                    ? `${reviewsDue.length} review${reviewsDue.length !== 1 ? 's' : ''} due today`
                    : 'No actions currently due'}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-4 h-4 rounded flex items-center justify-center shrink-0 mt-0.5 bg-emerald-500/20">
                <TrendingUp className="w-2.5 h-2.5 text-emerald-400" />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">What patterns are emerging?</p>
                <p className="text-sm font-semibold text-white mt-0.5">
                  {improving.length > 0
                    ? `${improving.length} student${improving.length !== 1 ? 's' : ''} improving after support`
                    : positiveProgress.length > 0
                    ? `${positiveProgress.length} students showing positive progress`
                    : 'Monitoring all data sources'}
                </p>
              </div>
            </div>
          </div>
          {/* Expanded signal breakdown */}
          <div className="mt-3 pt-2.5 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
            {[
              { label: 'Safeguarding', count: scopedStudents.filter(s => analysisMap.get(s.id)?.key_reasons?.some(r => r.toLowerCase().includes('safeguard'))).length, color: 'text-red-400' },
              { label: 'Attendance <90%', count: scopedStudents.filter(s => (s.attendance_pct ?? 95) < 90).length, color: 'text-orange-400' },
              { label: 'SEND concerns', count: scopedStudents.filter(s => s.send_status && s.send_status !== 'N - No SEN' && s.send_status !== 'None' && (s.risk_level === 'red' || s.risk_level === 'amber')).length, color: 'text-violet-400' },
              { label: 'Careers gaps', count: scopedStudents.filter(s => analysisMap.get(s.id)?.career_signposting).length, color: 'text-sky-400' },
              { label: 'Overdue reviews', count: reviewsDue.length, color: 'text-amber-400' },
              { label: 'Positive progress', count: positiveProgress.length, color: 'text-emerald-400' },
            ].filter(i => i.count > 0).map(({ label, count, color }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-slate-500 font-medium truncate">{label}</span>
                <span className={`text-xs font-bold ${color}`}>{count}</span>
              </div>
            ))}
          </div>
          <div className="mt-3 pt-2.5 border-t border-slate-800 flex items-center gap-3">
            <button onClick={() => navigate('/intelligence')} className="text-[11px] text-teal-400 font-semibold hover:text-teal-300 flex items-center gap-1 transition-colors">
              School Intelligence <ArrowRight className="w-3 h-3" />
            </button>
            <span className="text-[10px] text-slate-600">·</span>
            <button onClick={() => navigate('/signal-queue')} className="text-[11px] text-slate-400 font-medium hover:text-slate-300 flex items-center gap-1 transition-colors">
              Full Signal Queue <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* ── Year scope (only broad-access roles get the full picker) ── */}
      {role !== 'tutor' && role !== 'sendco' && role !== 'head_of_year' && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider shrink-0">Year group:</span>
          <div className="flex items-center gap-1 flex-wrap">
            {(['all', ...ALL_YEAR_GROUPS.filter(y => scopedStudents.some(s => s.year_group === y))] as YearScope[]).map((y) => (
              <button key={y} onClick={() => setYearScope(y)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${yearScope === y ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                {y === 'all' ? 'All Students' : y}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Stats bar ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Need action', value: needsAction.length, sub: 'Immediate', color: needsAction.length > 0 ? 'text-red-600' : 'text-slate-800', dot: 'bg-red-500' },
          { label: 'Emerging', value: emergingConcerns.length, sub: 'Monitor closely', color: emergingConcerns.length > 0 ? 'text-orange-600' : 'text-slate-800', dot: 'bg-orange-500' },
          { label: 'Active actions', value: openActions.length, sub: 'In progress', color: 'text-slate-800', dot: 'bg-blue-500' },
          { label: 'Avg. attendance', value: `${avgAttendance}%`, sub: yearScope === 'all' ? 'All students' : yearScope, color: parseFloat(avgAttendance as string) < 92 ? 'text-amber-600' : 'text-emerald-600', dot: 'bg-emerald-500' },
        ].map(({ label, value, sub, color, dot }) => (
          <div key={label} className="bg-white rounded-2xl border border-slate-200 px-4 py-4">
            <div className="flex items-center gap-2 mb-2">
              <div className={`w-2 h-2 rounded-full ${dot}`} />
              <span className="text-xs text-slate-500 font-medium">{sub}</span>
            </div>
            <div className={`text-2xl font-extrabold ${color}`}>{value}</div>
            <div className="text-xs font-semibold text-slate-600 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* ── Today's Priorities ── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-bold text-slate-900">
            {priorityStudents.length > 0
              ? `Today's Priorities — ${priorityStudents.length} student${priorityStudents.length !== 1 ? 's' : ''} requiring attention`
              : "Today's Priorities"}
          </h2>
          {priorityStudents.length > 3 && (
            <button onClick={() => navigate('/signal-queue')} className="text-sm text-teal-600 font-medium hover:text-teal-700 flex items-center gap-1">
              View all <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
        <p className="text-xs text-slate-500 mb-5">
          {priorityStudents.length > 0
            ? `Each card shows why this student was surfaced and what is recommended. Students showing "Action in progress" already have an assigned intervention — review it or escalate if the situation has changed.`
            : 'The intelligence engine is monitoring your students continuously.'}
        </p>

        {priorityStudents.length === 0 ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-6 py-6 flex items-center gap-4">
            <CheckCircle className="w-8 h-8 text-emerald-600 shrink-0" />
            <div>
              <p className="font-bold text-emerald-800">No students currently require immediate action.</p>
              <p className="text-sm text-emerald-700 mt-0.5">
                {reviewsDue.length > 0 ? `${reviewsDue.length} review${reviewsDue.length !== 1 ? 's' : ''} are due — check your action queue below.` : 'All signals are stable. Continue monitoring through your action queue below.'}
              </p>
            </div>
          </div>
        ) : (
          <div className={`grid gap-4 ${priorityStudents.length === 1 ? 'max-w-xl' : 'lg:grid-cols-2'}`}>
            {priorityStudents.slice(0, 4).map(({ student, urgent }) => {
              const analysis = analysisMap.get(student.id);
              const existingActions = scopedInterventions.filter((i) => {
                if (i.student_id !== student.id) return false;
                if (!['open', 'in_progress', 'assigned'].includes(i.status)) return false;
                // Oversight roles see all active actions; focused roles only see their own
                if (['admin', 'slt', 'dsl'].includes(profile?.role || '')) return true;
                return isAssignedToCurrentUser(i.assigned_to);
              });
              const recAction = getRecommendedAction(analysis, student);
              return (
                <PriorityCard
                  key={student.id}
                  student={student}
                  analysis={analysis}
                  existingActions={existingActions}
                  isUrgent={urgent}
                  role={profile?.role}
                  onAccept={() => navigate(`/students/${student.id}?tab=actions`)}
                  onModify={() => navigate(`/students/${student.id}?tab=actions&autoopen=true`)}
                  onEscalate={() => navigate(`/students/${student.id}?tab=actions&escalate=true`)}
                  onMarkReviewed={makeMarkReviewed(student)}
                  onAssignHOY={makeQuickAssign(student, mapOwnerToStaffName('head of year', student.year_group), 'Pastoral meeting', 'high')}
                  onAssignSENDCO={makeQuickAssign(student, 'Ms Jones (SENDCo)', 'SEND review', 'high')}
                  onAssignTutor={makeQuickAssign(student, 'Mr Patel (Tutor)', 'Tutor check-in', 'medium')}
                  onCreateSafeguarding={makeQuickAssign(student, 'Mr Ahmed (DSL)', 'Safeguarding referral', 'urgent')}
                />
              );
            })}
          </div>
        )}

        {priorityStudents.length > 4 && (
          <div className="mt-4">
            <button onClick={() => navigate('/signal-queue')} className="w-full py-3 rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-2">
              <Layers className="w-4 h-4" />
              {priorityStudents.length - 4} more student{priorityStudents.length - 4 !== 1 ? 's' : ''} — view full signal queue
            </button>
          </div>
        )}
      </div>

      {/* ── Actions assigned to me ── */}
      {(() => {
        const myActions = interventions.filter(i =>
          isAssignedToCurrentUser(i.assigned_to) &&
          ['open', 'in_progress', 'assigned'].includes(i.status)
        ).sort((a, b) => {
          const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
          return (order[a.priority] ?? 4) - (order[b.priority] ?? 4);
        });
        if (myActions.length === 0) return null;
        return (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-base font-bold text-slate-900">
                Actions Assigned to Me
                <span className="ml-2 text-sm font-semibold text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full">{myActions.length}</span>
              </h2>
              <Link to="/interventions?mine=true" className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1">View in Actions <ArrowRight className="w-4 h-4" /></Link>
            </div>
            <p className="text-xs text-slate-500 mb-4">These actions have been assigned to you. Each one must be completed or escalated to remove it from your queue.</p>
            <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100">
              {myActions.slice(0, 6).map(i => {
                const s = studentMap.get(i.student_id);
                const isOverdue = i.due_date && i.due_date < today;
                const priorityColors: Record<string, string> = { urgent: 'bg-red-500', high: 'bg-orange-500', medium: 'bg-amber-400', low: 'bg-slate-300' };
                return (
                  <div
                    key={i.id}
                    className="px-5 py-4 hover:bg-slate-50/60 transition-colors cursor-pointer group"
                    onClick={() => navigate(`/students/${i.student_id}?tab=actions&highlight=${i.id}`)}
                  >
                    <div className="flex items-start gap-4">
                      <div className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${priorityColors[i.priority] || 'bg-slate-300'}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-slate-800 text-sm">{i.action_type}</span>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${i.status === 'assigned' ? 'bg-blue-100 text-blue-700' : i.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                            {i.status.replace('_', ' ')}
                          </span>
                          {isOverdue && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700">OVERDUE</span>}
                        </div>
                        {s && (
                          <p className="text-xs text-teal-700 font-medium">{s.name} · {s.year_group} · {s.form}</p>
                        )}
                        {i.notes && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{i.notes}</p>}
                        <p className="text-xs text-slate-400 mt-0.5">
                          Due {i.due_date || '—'}
                          {i.review_date && ` · Review ${i.review_date}`}
                          {i.created_by && ` · Assigned by ${i.created_by.replace(/\s*\([^)]*\)/, '')}`}
                        </p>
                      </div>
                      <div className="shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-xs text-teal-600 font-semibold">Open profile</span>
                        <ArrowRight className="w-3.5 h-3.5 text-teal-600" />
                      </div>
                    </div>
                    <div className="mt-2.5 ml-6 px-3 py-2 rounded-lg bg-blue-50 border border-blue-100">
                      <p className="text-xs text-blue-800">
                        <span className="font-bold">To complete: </span>
                        {i.status === 'assigned'
                          ? 'Open the student profile, go to Actions tab, click "Mark In Progress" then record an outcome and complete.'
                          : i.status === 'in_progress'
                          ? 'Record the outcome and click "Complete" to close this action and remove it from your queue.'
                          : 'Open the student profile, go to Actions tab and complete this action to remove from queue.'}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* ── Reviews due (compact) ── */}
      {reviewsDue.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-slate-900">Reviews Due</h2>
            <Link to="/reviews" className="text-sm text-teal-600 hover:text-teal-700 font-medium flex items-center gap-1">View all <ArrowRight className="w-4 h-4" /></Link>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-50">
            {reviewsDue.slice(0, 4).map((i) => {
              const s = studentMap.get(i.student_id);
              const isOverdue = i.review_date && i.review_date < today;
              return (
                <div key={i.id} className={`px-5 py-3.5 flex items-center gap-4 hover:bg-slate-50/60 transition-colors`}>
                  <div className={`w-2 h-2 rounded-full shrink-0 ${isOverdue ? 'bg-red-500' : 'bg-amber-400'}`} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-slate-900">{s?.name}</span>
                    <span className="text-xs text-slate-400 ml-2">{i.action_type}</span>
                    {isOverdue && <span className="ml-2 text-[10px] bg-red-50 text-red-700 border border-red-200 px-1.5 py-0.5 rounded font-semibold">Overdue</span>}
                  </div>
                  <button onClick={() => navigate(`/students/${i.student_id}?tab=reviews`)} className="text-xs text-teal-600 font-semibold hover:text-teal-700">Review</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Action Queue + Sidebar grid ── */}
      <div className="grid lg:grid-cols-5 gap-6">
        {/* Action Queue */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between gap-3">
              <div>
                <h2 className="font-bold text-slate-900">
                  {role === 'sendco' ? 'SEND Action Queue' : "Today's Action Queue"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {queueFiltered.length} action{queueFiltered.length !== 1 ? 's' : ''}
                  {openActions.filter((i) => i.priority === 'urgent').length > 0 && (
                    <span className="ml-1 text-red-600 font-semibold">· {openActions.filter((i) => i.priority === 'urgent').length} urgent</span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setShowFilterDrawer(true)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${filterPriority || filterOwner ? 'bg-teal-50 border-teal-300 text-teal-700' : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                  <Filter className="w-3.5 h-3.5" /> Filter
                </button>
                <Link to="/interventions" className="flex items-center gap-1 text-sm font-medium text-teal-600 hover:text-teal-700">
                  All <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {queueFiltered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-14 text-slate-400 gap-3">
                <ClipboardList className="w-10 h-10 text-slate-200" />
                <p className="text-sm font-medium">No open actions right now.</p>
                <p className="text-xs text-slate-300">Actions assigned to you will appear here.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {queueFiltered.map((i) => {
                  const student = studentMap.get(i.student_id);
                  if (!student) return null;
                  const cat = analysisMap.get(i.student_id)?.signal_category || 'amber';
                  const isOverdue = i.due_date && i.due_date < today;
                  const reasons = analysisMap.get(i.student_id)?.key_reasons?.slice(0, 2) || [];
                  return (
                    <div key={i.id} className={`px-5 py-4 hover:bg-slate-50/60 transition-colors ${i.priority === 'urgent' ? 'border-l-4 border-l-red-400' : ''}`}>
                      <div className="flex items-start gap-3">
                        <span className={`mt-2 w-2 h-2 rounded-full shrink-0 ${SIGNAL_DOT[cat] || 'bg-slate-300'}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1.5">
                            <div>
                              <button onClick={() => navigate(`/students/${student.id}`)} className="text-sm font-bold text-slate-900 hover:text-teal-700 transition-colors">
                                {student.name}
                              </button>
                              <span className="text-xs text-slate-400 ml-2">{student.year_group} · {student.form}</span>
                              {student.send_status && <span className="ml-2 text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded font-medium">{student.send_status}</span>}
                            </div>
                            <span className={`shrink-0 text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border ${PRIORITY_BADGE[i.priority] || PRIORITY_BADGE.medium}`}>
                              {i.priority}
                            </span>
                          </div>
                          {reasons.length > 0 && (
                            <div className="mb-2 space-y-0.5">
                              {reasons.map((r, idx) => <p key={idx} className="text-xs text-slate-500">{r}</p>)}
                            </div>
                          )}
                          <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
                            <span><span className="font-medium text-slate-600">{i.action_type}</span></span>
                            {i.assigned_to && <span>Owner: <span className="font-medium text-slate-600">{i.assigned_to}</span></span>}
                            {(i.review_date || i.due_date) && (
                              <span className={isOverdue ? 'text-red-600 font-semibold' : ''}>
                                {isOverdue ? 'Overdue: ' : 'Due: '}{i.review_date || i.due_date}
                              </span>
                            )}
                            {i.created_at && (
                              <span className="text-slate-300">Added {timeAgo(i.created_at)}</span>
                            )}
                          </div>
                        </div>
                        <button onClick={() => navigate(`/students/${i.student_id}?tab=actions&highlight=${i.id}`)}
                          className="shrink-0 p-1.5 rounded-lg hover:bg-slate-100 text-slate-300 hover:text-teal-600 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
              <button onClick={() => navigate('/interventions')} className="text-sm font-medium text-teal-600 hover:text-teal-700 flex items-center gap-1">
                <Plus className="w-3.5 h-3.5" /> Create new action
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="lg:col-span-2 space-y-4">
          {/* Actions summary */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Actions &amp; outcomes</div>
            <div className="space-y-1">
              {([
                { label: 'Open actions', count: openActions.length, Icon: ClipboardList, color: 'text-blue-500', href: '/interventions?status=open' },
                { label: 'Improving after support', count: improving.length, Icon: TrendingUp, color: 'text-emerald-500', href: '/interventions?outcome=improving' },
                { label: 'Escalating', count: escalating.length, Icon: AlertTriangle, color: 'text-red-500', href: '/interventions?outcome=escalating' },
              ]).map(({ label, count, Icon, color, href }) => (
                <button key={label} onClick={() => navigate(href)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all hover:bg-slate-50 group">
                  <div className="flex items-center gap-2.5"><Icon className={`w-4 h-4 ${color}`} /><span className="font-medium text-slate-700">{label}</span></div>
                  <div className="flex items-center gap-2"><span className={`text-base font-bold ${count > 0 ? 'text-slate-900' : 'text-slate-400'}`}>{count}</span><ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500" /></div>
                </button>
              ))}
            </div>
          </div>

          {/* Student context */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Student context</div>
            <div className="space-y-1">
              {([
                { label: 'Attendance below 90%', count: scopedStudents.filter((s) => (s.attendance_pct ?? 100) < 90).length, Icon: Activity, color: 'text-orange-500', href: '/analysis?filter=attendance' },
                { label: 'SEND support', count: scopedStudents.filter((s) => s.send_status).length, Icon: BookOpen, color: 'text-blue-500', href: '/analysis?filter=send' },
                { label: 'Positive progress', count: positiveProgress.length, Icon: Award, color: 'text-teal-500', href: '/success-stories' },
              ]).map(({ label, count, Icon, color, href }) => (
                <button key={label} onClick={() => navigate(href)} className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-sm transition-all hover:bg-slate-50 group">
                  <div className="flex items-center gap-2.5"><Icon className={`w-4 h-4 ${color}`} /><span className="font-medium text-slate-700">{label}</span></div>
                  <div className="flex items-center gap-2"><span className={`text-base font-bold ${count > 0 ? 'text-slate-900' : 'text-slate-400'}`}>{count}</span><ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-slate-500" /></div>
                </button>
              ))}
            </div>
          </div>

          {/* Positive progress */}
          {positiveProgress.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">Positive Progress</span>
              </div>
              <div className="space-y-2">
                {positiveProgress.slice(0, 3).map((s) => (
                  <button key={s.id} onClick={() => navigate(`/students/${s.id}`)} className="w-full text-left flex items-center gap-2.5 hover:opacity-80 transition-opacity">
                    <div className="w-7 h-7 rounded-full bg-emerald-200 flex items-center justify-center font-bold text-emerald-700 text-[10px] shrink-0">
                      {(s.name || '').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-emerald-800">{s.name}</p>
                      <p className="text-[10px] text-emerald-600">{s.year_group}</p>
                    </div>
                  </button>
                ))}
              </div>
              {positiveProgress.length > 3 && (
                <button onClick={() => navigate('/success-stories')} className="mt-3 text-xs text-emerald-700 font-semibold hover:text-emerald-900">
                  +{positiveProgress.length - 3} more →
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <Toast toasts={toasts} onDismiss={dismissToast} />

      {showQuickNote && (
        <QuickNoteModal students={students} onClose={() => setShowQuickNote(false)} onSaved={() => setShowQuickNote(false)} />
      )}

      {showFilterDrawer && (
        <FilterDrawer
          priority={filterPriority}
          owner={filterOwner}
          onChangePriority={setFilterPriority}
          onChangeOwner={setFilterOwner}
          onClose={() => setShowFilterDrawer(false)}
          onClear={() => { setFilterPriority(''); setFilterOwner(''); }}
        />
      )}
      </>)}
    </div>
  );
}

// ─── FilterDrawer ─────────────────────────────────────────────────────────────

function FilterDrawer({ priority, owner, onChangePriority, onChangeOwner, onClose, onClear }: {
  priority: string; owner: string;
  onChangePriority: (v: string) => void; onChangeOwner: (v: string) => void;
  onClose: () => void; onClear: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative ml-auto w-full max-w-sm bg-white shadow-2xl flex flex-col h-full">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3"><Filter className="w-5 h-5 text-slate-500" /><h2 className="font-bold text-slate-900">Filter Action Queue</h2></div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Priority</label>
            <div className="grid grid-cols-2 gap-2">
              {(['urgent', 'high', 'medium', 'low'] as const).map((p) => (
                <button key={p} onClick={() => onChangePriority(priority === p ? '' : p)}
                  className={`py-2 rounded-xl text-xs font-semibold border capitalize transition-all flex items-center justify-center gap-1.5 ${priority === p ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                  {priority === p && <Check className="w-3 h-3" />} {p}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Owner / Assigned staff</label>
            <input type="text" value={owner} onChange={(e) => onChangeOwner(e.target.value)} className="input-premium w-full" placeholder="Staff name..." />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
          <button onClick={() => { onClear(); onClose(); }} className="btn-secondary flex-1">Clear</button>
          <button onClick={onClose} className="btn-primary flex-1">Apply</button>
        </div>
      </div>
    </div>
  );
}

