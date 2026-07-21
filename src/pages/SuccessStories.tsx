import { useEffect, useState, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SchoolOnlyGate } from '../components/SchoolOnlyGate';
import { supabase } from '../lib/supabase';
import { getStudents, getAnalysisResults, getInterventions, computeGraduationStatus, getDemoRecognitions, addDemoRecognition, updateDemoRecognition, getHOYYearGroup } from '../lib/data';
import type { Student, AnalysisResult, Intervention } from '../types';
import type { GraduationStatus } from '../types';
import GlobalPriorityBar from '../components/GlobalPriorityBar';
import { Toast, useToast } from '../components/Toast';
import { isStudentInScope } from '../lib/permissions';
import {
  Star, TrendingUp, Trophy, Heart, Award, Share2,
  ArrowUpRight, User, CheckCircle, Activity, Shield,
  Mail, Medal, Gift, MessageSquare, Sparkles, ChevronDown, ChevronRight,
  X, Filter, RotateCcw, FileText, Archive, Layers,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SuccessItem {
  student: Student;
  analysis: AnalysisResult;
  intervention?: Intervention;
  graduation: GraduationStatus;
  positiveTrends: PositiveTrend[];
  recognitionOptions: RecognitionOption[];
}

interface PositiveTrend {
  label: string;
  detail: string;
  icon: React.ReactNode;
  strength: 'strong' | 'moderate';
}

interface RecognitionOption {
  type: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  suitability: 'primary' | 'secondary';
}

// Rich recognition record — mirrors DB row
interface RecognitionRecord {
  id: string;        // UUID from DB, or client-generated for demo
  student_id: string;
  recognition_type: string;
  recognition_label: string;
  notes: string;
  completed_by: string;
  completed_at: string;
  is_undone: boolean;
  is_cleared: boolean;
  is_dismissed: boolean;
}

// ─── Static config ────────────────────────────────────────────────────────────

const GRADUATION_PIPELINE: { stage: GraduationStatus; label: string; desc: string; bg: string; border: string; text: string; icon: React.ReactNode }[] = [
  { stage: 'active',        label: 'Active Case',   desc: 'Requiring regular pastoral input',          bg: 'bg-red-50',     border: 'border-red-200',     text: 'text-red-700',     icon: <Shield className="w-4 h-4" /> },
  { stage: 'monitor',       label: 'Monitor',       desc: 'Improving — keeping a watching brief',      bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   icon: <Activity className="w-4 h-4" /> },
  { stage: 'stable',        label: 'Stable',        desc: 'Sustained improvement, low risk',           bg: 'bg-sky-50',     border: 'border-sky-200',     text: 'text-sky-700',     icon: <CheckCircle className="w-4 h-4" /> },
  { stage: 'success_story', label: 'Success Story', desc: 'Exceptional progress — ready to celebrate', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', icon: <Star className="w-4 h-4" /> },
];

const CATEGORY_BADGE: Record<string, { label: string; classes: string }> = {
  turnaround:  { label: 'Turnaround',  classes: 'bg-amber-100 text-amber-700' },
  growth:      { label: 'Growth',      classes: 'bg-emerald-100 text-emerald-700' },
  exceptional: { label: 'Outstanding', classes: 'bg-blue-100 text-blue-700' },
  resilience:  { label: 'Resilience',  classes: 'bg-sky-100 text-sky-700' },
};

const ALL_RECOGNITION: RecognitionOption[] = [
  { type: 'postcard',       label: 'Postcard home',             description: "A personal note sent to parents/carers celebrating their child's progress.",      icon: <Mail className="w-4 h-4" />,           suitability: 'primary' },
  { type: 'headteacher',    label: 'Headteacher commendation',  description: 'Formal recognition from the headteacher — suitable for exceptional turnarounds.',   icon: <Medal className="w-4 h-4" />,          suitability: 'primary' },
  { type: 'studentweek',    label: 'Student of the week',       description: 'Weekly form/year-group recognition visible to peers and staff.',                     icon: <Star className="w-4 h-4" />,           suitability: 'secondary' },
  { type: 'rewardtrip',     label: 'Reward trip / event',       description: 'Inclusion in a school reward trip or enrichment activity as recognition.',           icon: <Gift className="w-4 h-4" />,           suitability: 'secondary' },
  { type: 'pupilterm',      label: 'Pupil of the term',         description: 'End-of-term award celebrating sustained effort or improvement over time.',           icon: <Trophy className="w-4 h-4" />,         suitability: 'primary' },
  { type: 'positivecall',   label: 'Positive call home',        description: 'A call from the form tutor or HOY to share specific positive feedback with family.', icon: <MessageSquare className="w-4 h-4" />,  suitability: 'secondary' },
  { type: 'assembly',       label: 'Assembly shout-out',        description: 'Named recognition in form or year group assembly for visible achievement.',          icon: <Sparkles className="w-4 h-4" />,       suitability: 'secondary' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function detectPositiveTrends(student: Student, analysis: AnalysisResult | null, intervention?: Intervention): PositiveTrend[] {
  const trends: PositiveTrend[] = [];
  const att = student.attendance_pct ?? 95;
  const beh = student.behaviour_score ?? 0;
  const baseline_att = intervention?.baseline_attendance;
  const current_att = intervention?.current_attendance;
  const baseline_beh = intervention?.baseline_behaviour;
  const current_beh = intervention?.current_behaviour;

  if (baseline_att !== undefined && current_att !== undefined && current_att > baseline_att) {
    const delta = current_att - baseline_att;
    trends.push({ label: 'Attendance recovered', detail: `Up from ${baseline_att}% to ${current_att}% — a ${delta} percentage point improvement.`, icon: <TrendingUp className="w-3.5 h-3.5" />, strength: delta >= 10 ? 'strong' : 'moderate' });
  } else if (att >= 95) {
    trends.push({ label: 'Attendance above target', detail: `Current attendance ${att}% — above the 95% school target.`, icon: <TrendingUp className="w-3.5 h-3.5" />, strength: att >= 98 ? 'strong' : 'moderate' });
  }

  if (baseline_beh !== undefined && current_beh !== undefined && current_beh < baseline_beh) {
    const delta = baseline_beh - current_beh;
    trends.push({ label: 'Behaviour significantly improved', detail: `Behaviour points reduced from ${baseline_beh} to ${current_beh} — down by ${delta} points.`, icon: <CheckCircle className="w-3.5 h-3.5" />, strength: delta >= 5 ? 'strong' : 'moderate' });
  } else if (beh <= 3 && beh >= 0) {
    trends.push({ label: 'Very low behaviour concerns', detail: `Only ${beh} behaviour point${beh !== 1 ? 's' : ''} recorded — well within expected range.`, icon: <CheckCircle className="w-3.5 h-3.5" />, strength: 'strong' });
  }

  if (student.positive_points && student.positive_points >= 10) {
    trends.push({ label: 'Strong positive recognition record', detail: `${student.positive_points} positive recognition points accumulated.`, icon: <Star className="w-3.5 h-3.5" />, strength: student.positive_points >= 20 ? 'strong' : 'moderate' });
  }

  if (student.signal_category === 'blue') {
    trends.push({ label: 'Exceptional pastoral progress', detail: 'Student has reached the highest pastoral tier — exceptional progress across all tracked metrics.', icon: <Star className="w-3.5 h-3.5" />, strength: 'strong' });
  } else if (student.signal_category === 'green') {
    trends.push({ label: 'No active pastoral concerns', detail: 'All tracked metrics are within expected range with no outstanding concerns.', icon: <Shield className="w-3.5 h-3.5" />, strength: 'moderate' });
  }

  if (analysis?.previous_state && analysis?.current_state) {
    trends.push({ label: 'Documented turnaround', detail: `Moved from "${analysis.previous_state}" to "${analysis.current_state}".`, icon: <ArrowUpRight className="w-3.5 h-3.5" />, strength: 'strong' });
  }

  return trends;
}

function selectRecognition(student: Student, graduation: GraduationStatus, trends: PositiveTrend[]): RecognitionOption[] {
  const hasStrongTrend = trends.some(t => t.strength === 'strong');
  const hasTurnaround = trends.some(t => t.label.toLowerCase().includes('turnaround'));
  const isExceptional = student.signal_category === 'blue';
  const isSuccess = graduation === 'success_story';
  const isStable = graduation === 'stable';

  const options: RecognitionOption[] = [];

  if (isExceptional || (isSuccess && hasStrongTrend)) {
    options.push(ALL_RECOGNITION.find(r => r.type === 'headteacher')!);
    options.push(ALL_RECOGNITION.find(r => r.type === 'pupilterm')!);
    options.push(ALL_RECOGNITION.find(r => r.type === 'postcard')!);
  } else if (hasTurnaround || isSuccess) {
    options.push(ALL_RECOGNITION.find(r => r.type === 'postcard')!);
    options.push(ALL_RECOGNITION.find(r => r.type === 'studentweek')!);
    options.push(ALL_RECOGNITION.find(r => r.type === 'positivecall')!);
  } else if (isStable) {
    options.push(ALL_RECOGNITION.find(r => r.type === 'positivecall')!);
    options.push(ALL_RECOGNITION.find(r => r.type === 'assembly')!);
  } else {
    options.push(ALL_RECOGNITION.find(r => r.type === 'positivecall')!);
    options.push(ALL_RECOGNITION.find(r => r.type === 'studentweek')!);
  }

  if (isSuccess && !options.find(o => o.type === 'rewardtrip')) {
    options.push(ALL_RECOGNITION.find(r => r.type === 'rewardtrip')!);
  }

  return options.filter(Boolean).slice(0, 3);
}

function genId() {
  return 'demo_' + Math.random().toString(36).slice(2) + Date.now();
}

function EvidenceRow({ label, from, to, unit = '' }: { label: string; from: number; to: number; unit?: string }) {
  const better = label.toLowerCase().includes('attend') ? to > from : to < from;
  return (
    <div className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-sm text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-400 line-through">{from}{unit}</span>
        <ArrowUpRight className={`w-3.5 h-3.5 ${better ? 'text-emerald-500 rotate-0' : 'text-red-500 rotate-180'}`} />
        <span className={`text-sm font-bold ${better ? 'text-emerald-600' : 'text-red-600'}`}>{to}{unit}</span>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SuccessStories() {
  const { profile, demoMode } = useAuth();
  const schoolId = (profile as any)?.school_id;
  const currentRole = (profile as any)?.role || '';
  const currentUserName = (profile as any)?.full_name || '';
  const userYearGroup = currentRole === 'head_of_year' ? getHOYYearGroup(currentUserName) : null;
  const userForm = currentRole === 'tutor' ? '10B' : null;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toasts, addToast, dismissToast } = useToast();

  const [allItems, setAllItems]         = useState<SuccessItem[]>([]);
  const [stageFilter, setStageFilter]   = useState<GraduationStatus | 'all'>('all');
  const [loading, setLoading]           = useState(true);
  const [copied, setCopied]             = useState<string | null>(null);

  // Suggested / Completed / Dismissed tab
  const [queueTab, setQueueTab]         = useState<'suggested' | 'completed' | 'dismissed'>('suggested');

  // Rich recognition records (all loaded from DB / demo state)
  const [recognitions, setRecognitions] = useState<RecognitionRecord[]>([]);

  // Inline student drawer
  const [drawerStudentId, _setDrawerStudentId] = useState<string | null>(null);

  // Notes modal
  const [notesModal, setNotesModal]     = useState<{ studentId: string; studentName: string; recType: string; recLabel: string } | null>(null);
  const [notesText, setNotesText]       = useState('');

  const typeParam = searchParams.get('type');
  const positiveProgressFilter = typeParam === 'positive_progress';

  // ── Load ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function load() {
      const [students, analyses, interventions] = await Promise.all([
        getStudents(demoMode ? null : schoolId),
        getAnalysisResults(demoMode ? null : schoolId),
        getInterventions(demoMode ? null : schoolId),
      ]);

      const studentMap      = new Map(students.map(s => [s.id, s]));
      const interventionMap = new Map(interventions.map(i => [i.id, i]));
      const result: SuccessItem[] = [];

      analyses.forEach(a => {
        const student = studentMap.get(a.student_id);
        if (!student) return;
        if (!isStudentInScope(currentRole, student, userYearGroup, userForm)) return;
        const graduation = computeGraduationStatus(student);
        if (graduation === 'active') return;
        const intervention = a.contributing_intervention ? interventionMap.get(a.contributing_intervention) : undefined;
        const positiveTrends = detectPositiveTrends(student, a, intervention);
        const recognitionOptions = selectRecognition(student, graduation, positiveTrends);
        result.push({ student, analysis: a, intervention, graduation, positiveTrends, recognitionOptions });
      });

      const analysedIds = new Set(analyses.map(a => a.student_id));
      students.forEach(student => {
        if (analysedIds.has(student.id)) return;
        if (!isStudentInScope(currentRole, student, userYearGroup, userForm)) return;
        const graduation = computeGraduationStatus(student);
        if (graduation === 'active') return;
        const positiveTrends = detectPositiveTrends(student, null);
        const recognitionOptions = selectRecognition(student, graduation, positiveTrends);
        result.push({ student, analysis: {} as AnalysisResult, graduation, positiveTrends, recognitionOptions });
      });

      result.sort((a, b) => {
        const order: Record<GraduationStatus, number> = { success_story: 0, stable: 1, monitor: 2, active: 3 };
        return order[a.graduation] - order[b.graduation];
      });

      setAllItems(result);

      // Load recognitions — from DB in real mode, from demo store in demo mode
      if (demoMode) {
        setRecognitions([...getDemoRecognitions()]);
      } else if (schoolId) {
        const { data } = await supabase
          .from('success_recognitions')
          .select('*')
          .eq('school_id', schoolId)
          .order('completed_at', { ascending: false });
        if (data) setRecognitions(data as RecognitionRecord[]);
      }

      setLoading(false);
    }
    load();
  }, [schoolId, demoMode]);

  // ── Derived sets ─────────────────────────────────────────────────────────

  // Active = confirmed (is_undone=false, is_dismissed=false)
  const activeRecs = useMemo(() =>
    recognitions.filter(r => !r.is_undone && !r.is_dismissed),
  [recognitions]);

  // Map of studentId -> Set of confirmed recognition types
  const confirmedTypes = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    activeRecs.forEach(r => {
      if (!map[r.student_id]) map[r.student_id] = new Set();
      map[r.student_id].add(r.recognition_type);
    });
    return map;
  }, [activeRecs]);

  // Map of studentId -> Set of dismissed recognition types (active dismissals, not undone)
  const dismissedTypes = useMemo(() => {
    const map: Record<string, Set<string>> = {};
    recognitions.filter(r => r.is_dismissed && !r.is_undone).forEach(r => {
      if (!map[r.student_id]) map[r.student_id] = new Set();
      map[r.student_id].add(r.recognition_type);
    });
    return map;
  }, [recognitions]);

  // A student is "fully handled" when every recognition option is either confirmed OR dismissed
  // Only then do they leave the Suggested tab
  const recognisedStudentIds = useMemo(() => {
    const ids = new Set<string>();
    allItems.forEach(({ student, recognitionOptions }) => {
      if (recognitionOptions.length === 0) return;
      const confirmed  = confirmedTypes[student.id]  || new Set<string>();
      const dismissed  = dismissedTypes[student.id]  || new Set<string>();
      const allHandled = recognitionOptions.every(o => confirmed.has(o.type) || dismissed.has(o.type));
      if (allHandled) ids.add(student.id);
    });
    return ids;
  }, [allItems, confirmedTypes, dismissedTypes]);

  // Flash state: students whose card should show the "moving to Completed" overlay
  const [justCompletedStudents, setJustCompletedStudents] = useState<Set<string>>(new Set());
  const prevRecognisedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const newlyCompleted = [...recognisedStudentIds].filter(id => !prevRecognisedRef.current.has(id));
    prevRecognisedRef.current = new Set(recognisedStudentIds);
    if (newlyCompleted.length === 0) return;

    setJustCompletedStudents(prev => new Set([...prev, ...newlyCompleted]));

    const timer = setTimeout(() => {
      setJustCompletedStudents(prev => {
        const next = new Set(prev);
        newlyCompleted.forEach(id => next.delete(id));
        return next;
      });
      setQueueTab('completed');
    }, 1800);

    return () => clearTimeout(timer);
  }, [recognisedStudentIds]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  async function confirmRecognition() {
    if (!notesModal || !notesText.trim()) return;
    const { studentId, recType, recLabel } = notesModal;
    const now = new Date().toISOString();
    const completedBy = profile?.full_name || 'Staff';

    const newRec: RecognitionRecord = {
      id: genId(),
      student_id: studentId,
      recognition_type: recType,
      recognition_label: recLabel,
      notes: notesText.trim(),
      completed_by: completedBy,
      completed_at: now,
      is_undone: false,
      is_cleared: false,
      is_dismissed: false,
    };

    if (demoMode) {
      addDemoRecognition(newRec);
    } else if (schoolId) {
      const { data, error } = await supabase.from('success_recognitions').insert({
        school_id: schoolId,
        student_id: studentId,
        recognition_type: recType,
        recognition_label: recLabel,
        notes: notesText.trim(),
        completed_by: completedBy,
        is_undone: false,
        is_cleared: false,
        is_dismissed: false,
      }).select().single();
      if (!error && data) newRec.id = (data as RecognitionRecord).id;
    }

    setRecognitions(prev => [newRec, ...prev]);
    addToast(`Recognition confirmed: ${recLabel}.`, 'success');
    setNotesModal(null);
    setNotesText('');
  }

  async function undoRecognition(recId: string) {
    setRecognitions(prev => prev.map(r => r.id === recId ? { ...r, is_undone: true } : r));
    if (demoMode) {
      updateDemoRecognition(recId, { is_undone: true });
    } else if (schoolId) {
      await supabase.from('success_recognitions')
        .update({ is_undone: true })
        .eq('id', recId);
    }
    addToast('Recognition reverted to Suggested.', 'success');
  }

  async function dismissRecognition(studentId: string, recType: string) {
    const existing = recognitions.find(r => r.student_id === studentId && r.recognition_type === recType && !r.is_undone && !r.is_dismissed);
    if (existing) {
      setRecognitions(prev => prev.map(r => r.id === existing.id ? { ...r, is_dismissed: true } : r));
      if (demoMode) {
        updateDemoRecognition(existing.id, { is_dismissed: true });
      } else if (schoolId) {
        await supabase.from('success_recognitions').update({ is_dismissed: true }).eq('id', existing.id);
      }
    } else {
      const newRec: RecognitionRecord = {
        id: genId(), student_id: studentId, recognition_type: recType,
        recognition_label: recType, notes: '',
        completed_by: profile?.full_name || 'Staff', completed_at: new Date().toISOString(),
        is_undone: false, is_cleared: false, is_dismissed: true,
      };
      setRecognitions(prev => [newRec, ...prev]);
      if (demoMode) {
        addDemoRecognition(newRec);
      } else if (schoolId) {
        await supabase.from('success_recognitions').insert({
          school_id: schoolId, student_id: studentId, recognition_type: recType,
          recognition_label: recType, notes: '', completed_by: profile?.full_name || 'Staff',
          is_undone: false, is_cleared: false, is_dismissed: true,
        });
      }
    }
    addToast('Recognition dismissed.', 'success');
  }

  async function undoDismiss(recId: string) {
    setRecognitions(prev => prev.map(r => r.id === recId ? { ...r, is_dismissed: false } : r));
    if (demoMode) {
      updateDemoRecognition(recId, { is_dismissed: false });
    } else if (schoolId) {
      await supabase.from('success_recognitions').update({ is_dismissed: false }).eq('id', recId);
    }
    addToast('Recognition restored to Suggested.', 'success');
  }

  async function clearCompleted() {
    const toClear = activeRecs.filter(r => !r.is_cleared);
    if (toClear.length === 0) return;
    setRecognitions(prev => prev.map(r => toClear.find(c => c.id === r.id) ? { ...r, is_cleared: true } : r));
    if (demoMode) {
      toClear.forEach(r => updateDemoRecognition(r.id, { is_cleared: true }));
    } else if (schoolId) {
      await Promise.all(toClear.map(r =>
        supabase.from('success_recognitions').update({ is_cleared: true }).eq('id', r.id)
      ));
    }
    addToast(`${toClear.length} completed recognition${toClear.length !== 1 ? 's' : ''} cleared from queue.`, 'success');
  }

  function openNotesModal(studentId: string, studentName: string, recType: string, recLabel: string) {
    setNotesModal({ studentId, studentName, recType, recLabel });
    setNotesText('');
  }

  function copyForSLT(item: SuccessItem) {
    const { student, analysis, intervention } = item;
    const lines = [
      `Student: ${student.name} (${student.year_group})`,
      `Stage: ${GRADUATION_PIPELINE.find(p => p.stage === item.graduation)?.label}`,
      '',
      analysis?.signal_explanation || '',
      '',
    ];
    if (analysis?.previous_state && analysis?.current_state) {
      lines.push(`Before: ${analysis.previous_state}`);
      lines.push(`Now: ${analysis.current_state}`);
      lines.push('');
    }
    if (intervention?.baseline_attendance && intervention.current_attendance) {
      lines.push(`Attendance: ${intervention.baseline_attendance}% → ${intervention.current_attendance}%`);
    }
    if (analysis?.what_changed) lines.push(`What changed: ${analysis.what_changed}`);
    const primaryRec = item.recognitionOptions[0];
    if (primaryRec) {
      lines.push('');
      lines.push(`Suggested recognition: ${primaryRec.label} — ${primaryRec.description}`);
    }
    navigator.clipboard.writeText(lines.filter((l, i, arr) => !(l === '' && arr[i - 1] === '')).join('\n')).then(() => {
      setCopied(student.id);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  // ── Render guards ─────────────────────────────────────────────────────────

  if (loading) {
    return <div className="flex items-center justify-center py-24 text-slate-400 text-sm">Loading...</div>;
  }

  const stageCounts = Object.fromEntries(
    GRADUATION_PIPELINE.slice(1).map(s => [s.stage, allItems.filter(i => i.graduation === s.stage).length])
  ) as Record<GraduationStatus, number>;

  const positiveItems = allItems.filter(i => ['success_story', 'stable', 'monitor'].includes(i.graduation));
  const stageFiltered = stageFilter === 'all' ? allItems : allItems.filter(i => i.graduation === stageFilter);
  const baseItems     = positiveProgressFilter ? positiveItems : stageFiltered;
  // Hide students who already have a confirmed recognition — they belong in the Completed tab
  // Keep them briefly if they're in the flash animation
  const visibleItems  = baseItems.filter(i => !recognisedStudentIds.has(i.student.id) || justCompletedStudents.has(i.student.id));

  // Counts for tabs
  const dismissedRecords  = recognitions.filter(r => r.is_dismissed && !r.is_undone);
  const completedCount    = recognisedStudentIds.size;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <SchoolOnlyGate
      featureName="Success Monitoring"
      featureDescription="Track student progress through the graduation pipeline — from active concern to recognised success story."
      highlights={[
        'Graduation pipeline: active → monitor → stable → success',
        'Student recognition and positive record keeping',
        'Share success stories with SLT',
        'Linked to interventions and student profiles',
      ]}
    >
    <div className="space-y-8">
      <Toast toasts={toasts} onDismiss={dismissToast} />
      <GlobalPriorityBar />

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Success Stories</h1>
          <p className="text-slate-500 mt-1 text-sm">Student progress pipeline — from active case to celebrated success.</p>
        </div>
        {activeRecs.filter(r => !r.is_cleared).length > 0 && queueTab === 'completed' && (
          <button
            onClick={clearCompleted}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors"
          >
            <Archive className="w-4 h-4" />
            Clear completed ({activeRecs.filter(r => !r.is_cleared).length})
          </button>
        )}
      </div>

      {/* Active global filter banner */}
      {positiveProgressFilter && (
        <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="text-sm font-semibold text-emerald-800">
              Filtered by Positive Progress — showing {visibleItems.length} of {allItems.length} students
            </span>
          </div>
          <button
            onClick={() => { const next = new URLSearchParams(searchParams); next.delete('type'); setSearchParams(next); }}
            className="flex items-center gap-1 text-xs text-emerald-600 font-semibold hover:text-emerald-800 shrink-0"
          >
            <X className="w-3.5 h-3.5" /> Clear filter
          </button>
        </div>
      )}

      {/* Graduation pipeline */}
      <div>
        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Graduation pipeline</div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {GRADUATION_PIPELINE.slice(1).map((stage, idx) => {
            const count = stageCounts[stage.stage] || 0;
            const isActive = stageFilter === stage.stage;
            return (
              <button
                key={stage.stage}
                onClick={() => setStageFilter(isActive ? 'all' : stage.stage)}
                className={`rounded-2xl p-4 border-2 text-left transition-all ${isActive ? `${stage.bg} ${stage.border}` : 'bg-white border-slate-200 hover:border-slate-300'}`}
              >
                <div className="flex items-center gap-1.5 mb-3">
                  <div className={`${isActive ? stage.text : 'text-slate-400'} transition-colors`}>{stage.icon}</div>
                  {idx < 2 && <div className="ml-auto w-6 h-px bg-slate-200" />}
                </div>
                <div className={`text-2xl font-black mb-0.5 ${isActive ? stage.text : 'text-slate-900'}`}>{count}</div>
                <div className={`text-xs font-bold ${isActive ? stage.text : 'text-slate-700'}`}>{stage.label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{stage.desc}</div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400 mt-1.5 text-center">Students progress left → right as their situation improves.</p>
      </div>

      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 text-center">
          <Star className="w-5 h-5 text-blue-500 mx-auto mb-1" />
          <div className="text-2xl font-extrabold text-blue-700">{allItems.filter(i => i.analysis?.signal_category === 'blue').length}</div>
          <div className="text-xs text-slate-600 mt-0.5">Exceptional</div>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 text-center">
          <TrendingUp className="w-5 h-5 text-emerald-500 mx-auto mb-1" />
          <div className="text-2xl font-extrabold text-emerald-700">{allItems.filter(i => i.graduation === 'success_story').length}</div>
          <div className="text-xs text-slate-600 mt-0.5">Success Stories</div>
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-center">
          <Trophy className="w-5 h-5 text-amber-500 mx-auto mb-1" />
          <div className="text-2xl font-extrabold text-amber-700">{recognitions.filter(r => !r.is_undone && !r.is_dismissed).length}</div>
          <div className="text-xs text-slate-600 mt-0.5">Recognitions given</div>
        </div>
      </div>

      {/* Stage filter label */}
      {stageFilter !== 'all' && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-slate-600">Showing:</span>
          <span className={`text-sm font-bold ${GRADUATION_PIPELINE.find(p => p.stage === stageFilter)?.text}`}>
            {GRADUATION_PIPELINE.find(p => p.stage === stageFilter)?.label}
          </span>
          <button onClick={() => setStageFilter('all')} className="text-xs text-slate-400 hover:text-slate-600 underline">Show all</button>
        </div>
      )}

      {/* Queue tabs */}
      <div>
        <div className="flex items-center gap-1 border-b border-slate-200">
          {([
            { id: 'suggested',  label: 'Suggested',  count: visibleItems.length > 0 ? visibleItems.length : null },
            { id: 'completed',  label: 'Completed',  count: completedCount },
            { id: 'dismissed',  label: 'Dismissed',  count: dismissedRecords.length },
          ] as const).map(tab => (
            <button
              key={tab.id}
              onClick={() => setQueueTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                queueTab === tab.id
                  ? 'border-teal-600 text-teal-700'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {tab.label}
              {tab.count !== null && tab.count > 0 && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  queueTab === tab.id ? 'bg-teal-100 text-teal-700' : 'bg-slate-100 text-slate-500'
                }`}>{tab.count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Suggested tab ── */}
      {queueTab === 'suggested' && (
        visibleItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
            <Star className="w-12 h-12 text-slate-200" />
            {recognisedStudentIds.size > 0
              ? <p className="text-sm text-center max-w-sm">All students with positive trends have been recognised. They&apos;ll re-appear here if new positive signals emerge.</p>
              : <p className="text-sm">No students at this stage yet. As students improve, they will appear here.</p>
            }
          </div>
        ) : (
          <div className="space-y-5">
            {visibleItems.map(({ student, analysis, intervention, graduation, positiveTrends, recognitionOptions }) => {
              const stageCfg    = GRADUATION_PIPELINE.find(p => p.stage === graduation)!;
              const isBlue      = student.signal_category === 'blue' || analysis?.signal_category === 'blue';
              const borderColor = graduation === 'success_story' ? (isBlue ? 'border-blue-200' : 'border-emerald-200') : graduation === 'stable' ? 'border-sky-200' : 'border-amber-200';
              const headerBg    = graduation === 'success_story' ? (isBlue ? 'bg-blue-50' : 'bg-emerald-50') : graduation === 'stable' ? 'bg-sky-50' : 'bg-amber-50';
              const badge        = analysis?.celebration_type ? CATEGORY_BADGE[analysis.celebration_type] : undefined;
              const hasNarrative = analysis?.signal_explanation || analysis?.previous_state;
              const studentConfirmed = confirmedTypes[student.id] || new Set<string>();
              const studentDismissed = dismissedTypes[student.id] || new Set<string>();

              function RecognitionCard({ opt, isPrimary }: { opt: RecognitionOption; isPrimary: boolean }) {
                const isConfirmed = studentConfirmed.has(opt.type);
                const isDismissed = !isConfirmed && studentDismissed.has(opt.type);
                return (
                  <div className={`rounded-xl px-4 py-3 border transition-all ${
                    isConfirmed ? 'bg-emerald-50 border-emerald-200'
                    : isDismissed ? 'bg-slate-50 border-slate-200 opacity-60'
                    : isPrimary ? 'bg-amber-50 border-amber-200'
                    : 'bg-slate-50 border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={isConfirmed ? 'text-emerald-600' : isDismissed ? 'text-slate-400' : isPrimary ? 'text-amber-600' : 'text-slate-500'}>{opt.icon}</span>
                      <span className={`text-sm font-bold ${isConfirmed ? 'text-emerald-800' : isDismissed ? 'text-slate-400' : isPrimary ? 'text-amber-800' : 'text-slate-700'}`}>{opt.label}</span>
                      {isPrimary && !isConfirmed && !isDismissed && <span className="ml-auto text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">Recommended</span>}
                      {isConfirmed && (
                        <span className="ml-auto flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full border border-emerald-200">
                          <CheckCircle className="w-3 h-3" /> Done
                        </span>
                      )}
                      {isDismissed && (
                        <span className="ml-auto flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                          Dismissed
                        </span>
                      )}
                    </div>
                    <p className={`text-xs leading-relaxed mb-2.5 ${isConfirmed ? 'text-emerald-700' : isDismissed ? 'text-slate-400' : isPrimary ? 'text-amber-700' : 'text-slate-500'}`}>{opt.description}</p>
                    <div className="flex items-center gap-2">
                      {isConfirmed ? (
                        <button
                          onClick={() => {
                            const rec = activeRecs.find(r => r.student_id === student.id && r.recognition_type === opt.type);
                            if (rec) undoRecognition(rec.id);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-emerald-700 bg-emerald-100 hover:bg-emerald-200 transition-colors border border-emerald-200"
                        >
                          <RotateCcw className="w-3 h-3" /> Undo
                        </button>
                      ) : isDismissed ? (
                        <button
                          onClick={() => {
                            const rec = recognitions.find(r => r.student_id === student.id && r.recognition_type === opt.type && r.is_dismissed && !r.is_undone);
                            if (rec) undoDismiss(rec.id);
                          }}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors border border-slate-200"
                        >
                          <RotateCcw className="w-3 h-3" /> Restore
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => openNotesModal(student.id, student.name, opt.type, opt.label)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${isPrimary ? 'bg-amber-600 hover:bg-amber-700 text-white' : 'bg-slate-700 hover:bg-slate-800 text-white'}`}
                          >
                            <CheckCircle className="w-3 h-3" /> Mark as done
                          </button>
                          <button
                            onClick={() => dismissRecognition(student.id, opt.type)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 text-xs transition-colors"
                          >
                            <X className="w-3 h-3" /> Dismiss
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              }

              const isFlashing = justCompletedStudents.has(student.id);

              return (
                <div key={student.id} className={`relative bg-white border ${borderColor} rounded-2xl overflow-hidden shadow-sm transition-all duration-300 ${isFlashing ? 'scale-[1.01]' : ''}`}>
                  {/* Flash overlay — shown briefly when student moves to Completed */}
                  {isFlashing && (
                    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-emerald-50/95 rounded-2xl animate-pulse pointer-events-none">
                      <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                        <CheckCircle className="w-6 h-6 text-white" />
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-emerald-800 text-sm">All done — moving to Completed</div>
                        <div className="text-xs text-emerald-600 mt-0.5">{student.name}</div>
                      </div>
                    </div>
                  )}
                  {/* Student header */}
                  <div className={`${headerBg} px-6 py-4 flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full ${stageCfg.bg} border ${stageCfg.border} flex items-center justify-center font-bold text-sm ${stageCfg.text}`}>
                        {(student.name || '').split(' ').filter(Boolean).map(n => n[0]).join('')}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900">{student.name}</div>
                        <div className="text-xs text-slate-500">{student.year_group} · {student.form}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      <span className={`flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${stageCfg.bg} ${stageCfg.border} ${stageCfg.text}`}>
                        {stageCfg.icon} {stageCfg.label}
                      </span>
                      {badge && <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${badge.classes}`}>{badge.label}</span>}
                    </div>
                  </div>

                  <div className="px-6 py-5 space-y-5">
                    {/* Positive trends */}
                    {positiveTrends.length > 0 && (
                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Positive trends detected</div>
                        <div className="space-y-1.5">
                          {positiveTrends.map((trend, idx) => (
                            <div key={idx} className={`flex items-start gap-2.5 rounded-lg px-3 py-2 border ${trend.strength === 'strong' ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200'}`}>
                              <span className={`shrink-0 mt-0.5 ${trend.strength === 'strong' ? 'text-emerald-600' : 'text-slate-500'}`}>{trend.icon}</span>
                              <div>
                                <div className={`text-xs font-semibold ${trend.strength === 'strong' ? 'text-emerald-800' : 'text-slate-700'}`}>{trend.label}</div>
                                <div className="text-xs text-slate-500 mt-0.5 leading-snug">{trend.detail}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Narrative */}
                    {hasNarrative && (
                      <>
                        {analysis.signal_explanation && (
                          <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">What happened</div>
                            <p className="text-sm text-slate-700 leading-relaxed">{analysis.signal_explanation}</p>
                          </div>
                        )}
                        {(analysis.previous_state || intervention?.baseline_attendance || student.positive_points) && (
                          <div>
                            <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Evidence</div>
                            <div className="bg-slate-50 rounded-xl px-4 py-1">
                              {analysis.previous_state && analysis.current_state && (
                                <div className="py-2 border-b border-slate-100">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div>
                                      <div className="text-[10px] text-red-500 font-semibold uppercase tracking-wide mb-0.5">Before</div>
                                      <div className="text-xs text-slate-600">{analysis.previous_state}</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide mb-0.5">Now</div>
                                      <div className="text-xs text-slate-700 font-medium">{analysis.current_state}</div>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {intervention?.baseline_attendance !== undefined && intervention.current_attendance !== undefined && (
                                <EvidenceRow label="Attendance" from={intervention.baseline_attendance} to={intervention.current_attendance} unit="%" />
                              )}
                              {intervention?.baseline_behaviour !== undefined && intervention.current_behaviour !== undefined && (
                                <EvidenceRow label="Behaviour points" from={intervention.baseline_behaviour} to={intervention.current_behaviour} />
                              )}
                              {student.positive_points !== undefined && student.positive_points > 0 && !intervention && (
                                <div className="flex items-center justify-between py-2">
                                  <span className="text-sm text-slate-600">Recognition points</span>
                                  <span className="text-sm font-bold text-emerald-600">+{student.positive_points} pts</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </>
                    )}

                    {/* No narrative fallback */}
                    {!hasNarrative && positiveTrends.length === 0 && (
                      <div>
                        <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Current metrics</div>
                        <div className="bg-slate-50 rounded-xl px-4 py-1">
                          {student.attendance_pct !== undefined && (
                            <div className="flex items-center justify-between py-2 border-b border-slate-100">
                              <span className="text-sm text-slate-600">Attendance</span>
                              <span className="text-sm font-bold text-emerald-600">{student.attendance_pct}%</span>
                            </div>
                          )}
                          {student.behaviour_score !== undefined && (
                            <div className="flex items-center justify-between py-2">
                              <span className="text-sm text-slate-600">Behaviour points</span>
                              <span className={`text-sm font-bold ${student.behaviour_score <= 5 ? 'text-emerald-600' : 'text-amber-600'}`}>{student.behaviour_score}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Suggested recognition cards */}
                    {recognitionOptions.length > 0 && (
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">Suggested recognitions</div>
                          {recognitionOptions.length > 1 && (
                            <div className="flex items-center gap-1.5">
                              {recognitionOptions.map(opt => {
                                const done = studentConfirmed.has(opt.type);
                                const dis  = !done && studentDismissed.has(opt.type);
                                return (
                                  <span key={opt.type} className={`w-2 h-2 rounded-full ${done ? 'bg-emerald-500' : dis ? 'bg-slate-300' : 'bg-amber-300'}`} title={done ? 'Done' : dis ? 'Dismissed' : 'Pending'} />
                                );
                              })}
                              <span className="text-[10px] text-slate-400 ml-1">
                                {recognitionOptions.filter(o => studentConfirmed.has(o.type) || studentDismissed.has(o.type)).length}/{recognitionOptions.length} handled
                              </span>
                            </div>
                          )}
                        </div>
                        <div className="space-y-2">
                          {recognitionOptions.map((opt, idx) => (
                            <RecognitionCard key={opt.type} opt={opt} isPrimary={idx === 0} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Legacy suggested_recognition field */}
                    {analysis?.suggested_recognition && recognitionOptions.length === 0 && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mb-1">
                          <Award className="w-3.5 h-3.5" /> Suggested recognition
                        </div>
                        <p className="text-sm text-amber-800">{analysis.suggested_recognition}</p>
                      </div>
                    )}
                  </div>

                  {/* Card footer */}
                  <div className={`px-5 py-3 border-t ${borderColor} flex items-center gap-2`}>
                    <button
                      onClick={() => navigate(`/students/${student.id}`)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 transition-colors"
                    >
                      <User className="w-3 h-3" /> View profile
                    </button>
                    {hasNarrative && (
                      <button
                        onClick={() => copyForSLT({ student, analysis, intervention, graduation, positiveTrends, recognitionOptions })}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${graduation === 'success_story' && isBlue ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'}`}
                      >
                        <Share2 className="w-3 h-3" />
                        {copied === student.id ? 'Copied!' : 'Copy for SLT'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* ── Completed tab ── */}
      {queueTab === 'completed' && (() => {
        // Students who have been fully handled (all options confirmed or dismissed)
        const handledStudents = allItems.filter(i => recognisedStudentIds.has(i.student.id));
        const allCompleted = activeRecs.sort((a, b) => b.completed_at.localeCompare(a.completed_at));
        const notCleared   = allCompleted.filter(r => !r.is_cleared);
        const cleared      = allCompleted.filter(r => r.is_cleared);

        if (handledStudents.length === 0 && allCompleted.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <CheckCircle className="w-12 h-12 text-slate-200" />
              <p className="text-sm">No recognitions completed yet. Mark suggestions as done to track them here.</p>
            </div>
          );
        }

        // Find student name from allItems
        const studentNames = new Map(allItems.map(i => [i.student.id, i.student]));

        function CompletedRow({ rec, cleared: isCleared }: { rec: RecognitionRecord; cleared: boolean }) {
          const student = studentNames.get(rec.student_id);
          const initials = student ? (student.name || '').split(' ').filter(Boolean).map(n => n[0]).join('') : '?';
          return (
            <div className={`bg-white border rounded-2xl p-5 shadow-sm ${isCleared ? 'opacity-60 border-slate-100' : 'border-emerald-200'}`}>
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${isCleared ? 'bg-slate-100 text-slate-500' : 'bg-emerald-100 text-emerald-700'}`}>
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                    <span className="font-bold text-slate-900 text-sm">{student?.name || rec.student_id}</span>
                    <span className="text-xs text-slate-400">{student?.year_group}</span>
                    {isCleared && <span className="text-[10px] font-semibold bg-slate-100 text-slate-400 px-2 py-0.5 rounded-full">Cleared</span>}
                  </div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    <span className="text-sm font-semibold text-emerald-800">{rec.recognition_label}</span>
                  </div>
                  {rec.notes && <p className="text-xs text-slate-600 leading-relaxed mb-1.5 italic">"{rec.notes}"</p>}
                  <div className="text-[11px] text-slate-400">
                    Completed by {rec.completed_by} · {new Date(rec.completed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </div>
                </div>
                <div className="flex flex-col gap-1.5 shrink-0">
                  <button
                    onClick={() => navigate(`/students/${rec.student_id}`)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 transition-colors"
                  >
                    <User className="w-3 h-3" /> Profile
                  </button>
                  {!isCleared && (
                    <button
                      onClick={() => undoRecognition(rec.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs font-medium transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" /> Undo
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }

        return (
          <div className="space-y-4">
            {notCleared.length > 0 && (
              <div className="space-y-3">
                {notCleared.map(rec => <CompletedRow key={rec.id} rec={rec} cleared={false} />)}
              </div>
            )}
            {cleared.length > 0 && (
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                  Cleared ({cleared.length})
                </div>
                <div className="space-y-2">
                  {cleared.map(rec => <CompletedRow key={rec.id} rec={rec} cleared />)}
                </div>
              </div>
            )}
            {/* Students fully dismissed (no confirmed recs) */}
            {handledStudents.filter(i => !activeRecs.some(r => r.student_id === i.student.id)).length > 0 && (
              <div>
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">All options dismissed</div>
                <div className="space-y-2">
                  {handledStudents
                    .filter(i => !activeRecs.some(r => r.student_id === i.student.id))
                    .map(({ student }) => (
                      <div key={student.id} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm opacity-70 flex items-center gap-4">
                        <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center font-bold text-sm text-slate-500 shrink-0">
                          {(student.name || '').split(' ').filter(Boolean).map(n => n[0]).join('')}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-slate-700 text-sm">{student.name}</div>
                          <div className="text-xs text-slate-400">{student.year_group} · All suggestions dismissed</div>
                        </div>
                        <button
                          onClick={() => navigate(`/students/${student.id}`)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-medium hover:bg-slate-700 transition-colors shrink-0"
                        >
                          <User className="w-3 h-3" /> Profile
                        </button>
                      </div>
                    ))
                  }
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ── Dismissed tab ── */}
      {queueTab === 'dismissed' && (() => {
        if (dismissedRecords.length === 0) {
          return (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
              <Layers className="w-12 h-12 text-slate-200" />
              <p className="text-sm">No dismissed recognitions. Dismiss suggestions to move them here.</p>
            </div>
          );
        }
        const studentNames = new Map(allItems.map(i => [i.student.id, i.student]));
        return (
          <div className="space-y-3">
            {dismissedRecords.map(rec => {
              const student = studentNames.get(rec.student_id);
              const initials = student ? (student.name || '').split(' ').filter(Boolean).map(n => n[0]).join('') : '?';
              return (
                <div key={rec.id} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm opacity-70">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-sm text-slate-500 shrink-0">{initials}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-slate-700 text-sm">{student?.name || rec.student_id}</div>
                      <div className="text-xs text-slate-400">{rec.recognition_label || rec.recognition_type}</div>
                    </div>
                    <button
                      onClick={() => undoDismiss(rec.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs font-medium transition-colors shrink-0"
                    >
                      <RotateCcw className="w-3 h-3" /> Restore
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* Footer */}
      <div className="bg-slate-50 border border-slate-200 rounded-2xl px-6 py-4 flex items-start gap-3">
        <Heart className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
        <p className="text-xs text-slate-500 leading-relaxed">
          The graduation pipeline tracks each student's journey from active pastoral case to sustained success. Recognitions are logged permanently and appear in the student's timeline. Use "Copy for SLT" to share formatted summaries with senior leaders, parents, or award committees.
        </p>
      </div>

      {/* Recognition notes modal */}
      {notesModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                <FileText className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Log recognition</h3>
                <p className="text-xs text-slate-500">{notesModal.studentName} — {notesModal.recLabel}</p>
              </div>
              <button onClick={() => setNotesModal(null)} className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 text-slate-400">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Notes <span className="text-red-500">*</span></label>
              <textarea
                value={notesText}
                onChange={e => setNotesText(e.target.value)}
                placeholder={`Briefly describe what was done — e.g. '${notesModal.recLabel} given on ${new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. Celebrated attendance recovery from 78% to 96%.'`}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 resize-none focus:outline-none focus:ring-2 focus:ring-amber-400 min-h-[90px]"
                autoFocus
              />
              <p className="text-[11px] text-slate-400 mt-1">Required — will appear in the student's timeline.</p>
            </div>
            <div className="flex gap-3 pt-2">
              <button
                onClick={confirmRecognition}
                disabled={!notesText.trim()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors"
              >
                <CheckCircle className="w-4 h-4" /> Confirm recognition
              </button>
              <button onClick={() => setNotesModal(null)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
    </SchoolOnlyGate>
  );
}

