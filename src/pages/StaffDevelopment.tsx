import { useMemo, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { SchoolOnlyGate } from '../components/SchoolOnlyGate';
import { getBehaviourRecords, getStudents, getInterventions, DEMO_STAFF } from '../lib/data';
// Canonical staff intelligence from the shared engine context module
import { computeStaffBaselines } from '../../supabase/functions/_shared/context.ts';
import type { StaffBaseline } from '../../supabase/functions/_shared/context.ts';
import type { BehaviourRecord, Student, Intervention } from '../types';
import GlobalPriorityBar from '../components/GlobalPriorityBar';
import { Toast, useToast } from '../components/Toast';
import {
  Users, TrendingUp, TrendingDown, Award, AlertTriangle,
  BarChart3, Star, BookOpen, Clock, ChevronDown, ChevronUp, Info,
  Filter, X, Plus, Save, CheckCircle, ClipboardList, RotateCcw,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────────

interface StaffInsight {
  name: string;
  totalIncidents: number;
  uniqueStudents: number;
  positiveCount: number;
  negativeCount: number;
  positiveRatio: number;
  subjects: string[];
  periods: string[];
  studentsWithPattern: string[];
  studentsInvolved: string[];
  departmentAvgIncidents: number;
  vsAvg: number;
  indicator: 'best_practice' | 'review_recommended' | 'training_opportunity' | 'standard';
  indicatorReason: string;
  interventionSuccessRate: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function staffIndicator(
  totalIncidents: number,
  positiveRatio: number,
  studentsWithPattern: string[],
  vsAvg: number,
  interventionSuccessRate: number,
): { indicator: StaffInsight['indicator']; reason: string } {
  if (positiveRatio >= 0.5 && totalIncidents < 4 && vsAvg >= 0) {
    return { indicator: 'best_practice', reason: 'High positive recognition rate with fewer incidents than comparable classes.' };
  }
  if (studentsWithPattern.length >= 2) {
    return { indicator: 'training_opportunity', reason: `Same students repeatedly appearing (${studentsWithPattern.slice(0, 2).join(', ')}) — possible classroom management trend.` };
  }
  if (vsAvg < -4 && totalIncidents > 5) {
    return { indicator: 'review_recommended', reason: 'Behaviour incidents above department average. Review recommended.' };
  }
  if (interventionSuccessRate > 0 && interventionSuccessRate >= 75) {
    return { indicator: 'best_practice', reason: `${Math.round(interventionSuccessRate)}% of assigned interventions completed with positive outcomes.` };
  }
  return { indicator: 'standard', reason: 'No significant patterns detected.' };
}

const INDICATOR_CONFIG = {
  best_practice:        { label: 'Best practice candidate', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: Award },
  review_recommended:   { label: 'Review recommended',      bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200',   icon: AlertTriangle },
  training_opportunity: { label: 'Training opportunity identified', bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200', icon: BookOpen },
  standard:             { label: 'Standard',                 bg: 'bg-slate-50',   text: 'text-slate-600',   border: 'border-slate-200',   icon: Users },
};

const BEST_PRACTICE_ACTIONS = [
  'Nominate for peer mentoring',
  'Share strategy in department CPD',
  'Observe lesson for best practice',
  'Recognise positive impact',
  'Ask staff member to share approach',
  'Headteacher commendation',
];

const SUPPORT_ACTIONS = [
  'Coaching conversation',
  'Behaviour support visit',
  'Seating plan review',
  'Department support',
  'Pastoral briefing',
  'CPD follow-up session',
  'Workload review',
  'Peer observation',
  'Learning walk support',
];

interface StaffAction {
  id: string;
  staffName: string;
  actionType: string;
  assignedTo: string;
  priority: 'low' | 'medium' | 'high';
  dueDate: string;
  notes: string;
  status: 'open' | 'in_progress' | 'completed';
  outcome?: string;
  outcomeCategory?: string;
  completedAt?: string;
  insightType: StaffInsight['indicator'];
  createdAt: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function StaffDevelopment() {
  const { profile, demoMode } = useAuth();
  const { toasts, addToast, dismissToast } = useToast();
  const schoolId = demoMode ? null : (profile as any)?.school_id;

  const [behaviour, setBehaviour]         = useState<BehaviourRecord[]>([]);
  const [students, setStudents]           = useState<Student[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading]             = useState(true);
  const [engineBaselines, setEngineBaselines] = useState<StaffBaseline[]>([]);
  const [expandedStaff, setExpandedStaff] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab]         = useState<'overview' | 'best_practice' | 'opportunities' | 'subjects' | 'periods'>('overview');
  const [indicatorFilter, setIndicatorFilter] = useState<StaffInsight['indicator'] | null>(null);
  const [staffActions, setStaffActions]   = useState<StaffAction[]>([]);
  const [assignModal, setAssignModal]     = useState<{ staff: StaffInsight } | null>(null);
  const [assignForm, setAssignForm]       = useState({ actionType: '', assignedTo: '', priority: 'medium' as 'low' | 'medium' | 'high', dueDate: '', notes: '' });
  const [completeModal, setCompleteModal] = useState<StaffAction | null>(null);
  const [completeForm, setCompleteForm]   = useState({ outcomeCategory: '', outcomeNotes: '' });

  useEffect(() => {
    async function load() {
      const [b, s, i] = await Promise.all([
        getBehaviourRecords(schoolId),
        getStudents(schoolId),
        getInterventions(schoolId),
      ]);
      setBehaviour(b);
      setStudents(s);
      setInterventions(i);
      // Compute canonical staff baselines from the shared engine context module.
      // These include outlier detection and explainedByIntervention flags that are
      // more accurate than the local useMemo calculation.
      const baselines = computeStaffBaselines(b as any, s as any, i as any);
      setEngineBaselines(baselines);
      setLoading(false);
    }
    load();
  }, [schoolId]);

  const studentMap = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach(s => m.set(s.id, s));
    return m;
  }, [students]);

  const staffInsights = useMemo((): StaffInsight[] => {
    if (behaviour.length === 0) return [];

    const byStaff = new Map<string, BehaviourRecord[]>();
    behaviour.forEach(b => {
      if (!b.staff_member) return;
      if (!byStaff.has(b.staff_member)) byStaff.set(b.staff_member, []);
      byStaff.get(b.staff_member)!.push(b);
    });

    const allNeg = behaviour.filter(b => !b.positive_points || b.positive_points === 0);
    const staffCount = byStaff.size || 1;
    const globalAvgIncidents = allNeg.length / staffCount;

    const intByStaff = new Map<string, { total: number; success: number }>();
    interventions.forEach(i => {
      if (!i.assigned_to) return;
      if (!intByStaff.has(i.assigned_to)) intByStaff.set(i.assigned_to, { total: 0, success: 0 });
      const row = intByStaff.get(i.assigned_to)!;
      if (i.status === 'completed') {
        row.total++;
        if (i.outcome && i.outcome.trim().length > 5) row.success++;
      }
    });

    return Array.from(byStaff.entries()).map(([name, records]) => {
      const negRecords = records.filter(r => !r.positive_points || r.positive_points === 0);
      const posRecords = records.filter(r => r.positive_points && r.positive_points > 0);
      const totalIncidents = negRecords.length;
      const positiveCount = posRecords.length;
      const positiveRatio = records.length > 0 ? positiveCount / records.length : 0;

      const studentIds = [...new Set(records.map(r => r.student_id))];
      const uniqueStudents = studentIds.length;
      const studentsInvolved = studentIds.map(id => studentMap.get(id)?.name || id).filter(Boolean);

      const studentFreq = new Map<string, number>();
      negRecords.forEach(r => studentFreq.set(r.student_id, (studentFreq.get(r.student_id) || 0) + 1));
      const studentsWithPattern = [...studentFreq.entries()]
        .filter(([, count]) => count >= 3)
        .map(([sid]) => studentMap.get(sid)?.name || sid);

      const subjects = [...new Set(records.map(r => r.subject).filter(Boolean) as string[])];
      const periods  = [...new Set(records.map(r => r.lesson_period).filter(Boolean) as string[])];
      const vsAvg = globalAvgIncidents - totalIncidents;

      const intData = intByStaff.get(name);
      const interventionSuccessRate = intData && intData.total > 0 ? (intData.success / intData.total) * 100 : 0;

      const { indicator, reason } = staffIndicator(totalIncidents, positiveRatio, studentsWithPattern, vsAvg, interventionSuccessRate);

      return {
        name,
        totalIncidents,
        uniqueStudents,
        positiveCount,
        negativeCount: totalIncidents,
        positiveRatio,
        subjects,
        periods,
        studentsWithPattern,
        studentsInvolved,
        departmentAvgIncidents: globalAvgIncidents,
        vsAvg,
        indicator,
        indicatorReason: reason,
        interventionSuccessRate,
      };
    }).sort((a, b) => {
      const order = { best_practice: 0, standard: 1, training_opportunity: 2, review_recommended: 3 };
      return order[a.indicator] - order[b.indicator];
    });
  }, [behaviour, studentMap, interventions]);

  const subjectStats = useMemo(() => {
    const m = new Map<string, { incidents: number; positives: number; staff: Set<string>; students: Set<string> }>();
    behaviour.forEach(b => {
      if (!b.subject) return;
      if (!m.has(b.subject)) m.set(b.subject, { incidents: 0, positives: 0, staff: new Set(), students: new Set() });
      const row = m.get(b.subject)!;
      if (b.positive_points && b.positive_points > 0) row.positives++;
      else row.incidents++;
      if (b.staff_member) row.staff.add(b.staff_member);
      row.students.add(b.student_id);
    });
    return Array.from(m.entries())
      .map(([subject, stats]) => ({ subject, ...stats, staffCount: stats.staff.size, studentCount: stats.students.size }))
      .sort((a, b) => b.incidents - a.incidents);
  }, [behaviour]);

  const periodStats = useMemo(() => {
    const m = new Map<string, { incidents: number; subjects: Set<string>; students: Set<string> }>();
    behaviour.forEach(b => {
      if (!b.lesson_period) return;
      if (!m.has(b.lesson_period)) m.set(b.lesson_period, { incidents: 0, subjects: new Set(), students: new Set() });
      const row = m.get(b.lesson_period)!;
      if (!b.positive_points || b.positive_points === 0) row.incidents++;
      if (b.subject) row.subjects.add(b.subject);
      row.students.add(b.student_id);
    });
    return Array.from(m.entries())
      .map(([period, stats]) => ({ period, ...stats }))
      .sort((a, b) => b.incidents - a.incidents);
  }, [behaviour]);

  const bestPractice = staffInsights.filter(s => s.indicator === 'best_practice');
  const reviewNeeded = staffInsights.filter(s => s.indicator === 'review_recommended' || s.indicator === 'training_opportunity');
  const subjectHotspots = subjectStats.filter(s => s.incidents > 4).length;

  const overviewFiltered = indicatorFilter
    ? staffInsights.filter(s => s.indicator === indicatorFilter)
    : staffInsights;

  function toggleExpand(name: string) {
    setExpandedStaff(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function submitAssign() {
    if (!assignModal || !assignForm.actionType || !assignForm.assignedTo || !assignForm.dueDate) return;
    const action: StaffAction = {
      id: 'sa_' + Math.random().toString(36).slice(2) + Date.now(),
      staffName: assignModal.staff.name,
      actionType: assignForm.actionType,
      assignedTo: assignForm.assignedTo,
      priority: assignForm.priority,
      dueDate: assignForm.dueDate,
      notes: assignForm.notes,
      status: 'open',
      insightType: assignModal.staff.indicator,
      createdAt: new Date().toISOString(),
    };
    setStaffActions(prev => [action, ...prev]);
    setAssignModal(null);
    setAssignForm({ actionType: '', assignedTo: '', priority: 'medium', dueDate: '', notes: '' });
    addToast(`Action "${assignForm.actionType}" created for ${assignModal.staff.name}.`, 'success');
  }

  function submitComplete() {
    if (!completeModal || !completeForm.outcomeCategory || !completeForm.outcomeNotes.trim()) return;
    setStaffActions(prev => prev.map(a => a.id === completeModal.id
      ? { ...a, status: 'completed' as const, outcomeCategory: completeForm.outcomeCategory, outcome: completeForm.outcomeNotes, completedAt: new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) }
      : a
    ));
    const savedAction = { ...completeModal };
    setCompleteModal(null);
    setCompleteForm({ outcomeCategory: '', outcomeNotes: '' });
    addToast(`Action completed: ${savedAction.actionType} — ${completeForm.outcomeCategory}. Undo?`, 'success', () => {
      setStaffActions(prev => prev.map(a => a.id === savedAction.id ? { ...savedAction } : a));
      addToast('Completion undone.');
    });
  }

  function handleCardClick(filter: StaffInsight['indicator'] | null, tab: typeof activeTab) {
    setActiveTab(tab);
    setIndicatorFilter(indicatorFilter === filter ? null : filter);
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" /></div>;
  }

  const tabs = [
    { id: 'overview',      label: 'Overview' },
    { id: 'best_practice', label: `Best practice (${bestPractice.length})` },
    { id: 'opportunities', label: `Opportunities (${reviewNeeded.length})` },
    { id: 'subjects',      label: 'Subject trends' },
    { id: 'periods',       label: 'Period trends' },
  ] as const;

  const summaryCards = [
    {
      label: 'Staff analysed',
      value: staffInsights.length,
      icon: <Users className="w-5 h-5 text-teal-500" />,
      color: 'text-teal-600',
      filter: null as StaffInsight['indicator'] | null,
      tab: 'overview' as typeof activeTab,
      active: activeTab === 'overview' && !indicatorFilter,
    },
    {
      label: 'Best practice',
      value: bestPractice.length,
      icon: <Award className="w-5 h-5 text-emerald-500" />,
      color: 'text-emerald-600',
      filter: 'best_practice' as StaffInsight['indicator'],
      tab: 'best_practice' as typeof activeTab,
      active: activeTab === 'best_practice' || indicatorFilter === 'best_practice',
    },
    {
      label: 'Opportunities',
      value: reviewNeeded.length,
      icon: <BookOpen className="w-5 h-5 text-blue-500" />,
      color: 'text-blue-600',
      filter: 'training_opportunity' as StaffInsight['indicator'],
      tab: 'opportunities' as typeof activeTab,
      active: activeTab === 'opportunities',
    },
    {
      label: 'Subject hotspots',
      value: subjectHotspots,
      icon: <BarChart3 className="w-5 h-5 text-amber-500" />,
      color: 'text-amber-600',
      filter: null as StaffInsight['indicator'] | null,
      tab: 'subjects' as typeof activeTab,
      active: activeTab === 'subjects',
    },
  ];

  return (
    <SchoolOnlyGate
      featureName="Staff Insights"
      featureDescription="Understand behaviour patterns by teacher, subject and period — and identify where coaching, support or recognition is needed."
      highlights={[
        'Behaviour incidents by staff member',
        'Identify patterns by subject and period',
        'Coaching and recognition opportunities',
        'Whole-school trend analysis',
      ]}
    >
    <>
    <div className="space-y-8">
      <GlobalPriorityBar />
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Staff Development Insights</h1>
        <p className="text-sm text-slate-500 mt-1">
          Evidence-based analysis of classroom patterns — identifying best practice and supporting professional development.
          <span className="font-medium text-slate-700"> Accessible to SLT and Pastoral Leads only.</span>
        </p>
      </div>

      {/* Disclaimer */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <p className="text-xs text-blue-700 leading-relaxed">
          This analysis is <strong>evidence-based, not evaluative</strong>. Patterns detected from behaviour records, attendance data, and outcomes. No staff member is labelled negatively. Indicators such as "training opportunity" or "review recommended" are data prompts, not performance assessments. All professional conversations should be handled through your school's CPD process.
        </p>
      </div>

      {/* Summary cards — all clickable */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {summaryCards.map(item => (
          <button
            key={item.label}
            onClick={() => handleCardClick(item.filter, item.tab)}
            className={`card-premium p-5 text-left transition-all hover:ring-2 hover:ring-teal-200 ${
              item.active ? 'ring-2 ring-teal-400 bg-teal-50/30' : ''
            }`}
          >
            <div className="flex items-center justify-between mb-3">{item.icon}<span className={`text-2xl font-bold ${item.color}`}>{item.value}</span></div>
            <p className="text-sm font-semibold text-slate-700">{item.label}</p>
            {item.active && <p className="text-[10px] text-teal-600 font-medium mt-1">Filtered — click to clear</p>}
          </button>
        ))}
      </div>

      {/* Active filter banner */}
      {indicatorFilter && (
        <div className="flex items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
          <Filter className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="text-xs font-semibold text-teal-700 mr-1">Filtered by:</span>
          <span className="flex items-center gap-1 bg-white border border-teal-200 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">
            {INDICATOR_CONFIG[indicatorFilter]?.label || indicatorFilter}
            <button onClick={() => setIndicatorFilter(null)}><X className="w-3 h-3 ml-1" /></button>
          </span>
          <span className="text-xs text-teal-600 ml-1">Showing {overviewFiltered.length} of {staffInsights.length}</span>
          <button onClick={() => setIndicatorFilter(null)} className="ml-auto text-xs text-teal-600 hover:text-teal-800 underline font-medium">Clear</button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => { setActiveTab(tab.id); if (tab.id !== 'overview') setIndicatorFilter(null); }}
            className={`px-5 py-3 text-sm font-medium whitespace-nowrap border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-teal-500 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {activeTab === 'overview' && (
        <div className="space-y-4">
          {overviewFiltered.length === 0 && indicatorFilter && (
            <div className="card-premium py-10 text-center text-slate-400 text-sm">
              No staff members match this filter. <button className="underline text-teal-600" onClick={() => setIndicatorFilter(null)}>Clear filter</button>
            </div>
          )}
          {overviewFiltered.map(staff => {
            const cfg = INDICATOR_CONFIG[staff.indicator];
            const Icon = cfg.icon;
            const isExpanded = expandedStaff.has(staff.name);
            return (
              <div key={staff.name} className={`card-premium overflow-hidden border-l-4 ${
                staff.indicator === 'best_practice' ? 'border-l-emerald-400' :
                staff.indicator === 'review_recommended' ? 'border-l-amber-400' :
                staff.indicator === 'training_opportunity' ? 'border-l-blue-400' :
                'border-l-slate-200'
              }`}>
                <div
                  className="px-5 py-4 flex items-center gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                  onClick={() => toggleExpand(staff.name)}
                >
                  <div className={`w-10 h-10 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${cfg.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <span className="font-semibold text-slate-900">{staff.name}</span>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.label}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">{staff.indicatorReason}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-6 text-center shrink-0">
                    <div>
                      <div className={`text-lg font-bold ${staff.positiveRatio >= 0.4 ? 'text-emerald-600' : 'text-slate-700'}`}>{staff.positiveCount}</div>
                      <div className="text-[10px] text-slate-400 font-medium">Positives</div>
                    </div>
                    <div>
                      <div className={`text-lg font-bold ${staff.totalIncidents > 5 ? 'text-amber-600' : 'text-slate-700'}`}>{staff.totalIncidents}</div>
                      <div className="text-[10px] text-slate-400 font-medium">Incidents</div>
                    </div>
                    <div>
                      <div className="text-lg font-bold text-slate-700">{staff.uniqueStudents}</div>
                      <div className="text-[10px] text-slate-400 font-medium">Students</div>
                    </div>
                  </div>
                  <button className="p-1 rounded text-slate-300 hover:text-slate-500 shrink-0">
                    {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-slate-100 bg-slate-50/50 px-5 py-5">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
                      {/* Evidence summary */}
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Evidence summary</p>
                        <ul className="space-y-1.5 text-xs text-slate-700">
                          <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />Subjects: <span className="font-medium">{staff.subjects.join(', ') || '—'}</span></li>
                          <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />Periods: <span className="font-medium">{staff.periods.join(', ') || '—'}</span></li>
                          <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />{staff.uniqueStudents} unique students</li>
                          <li className={`flex items-center gap-2 ${staff.vsAvg >= 0 ? 'text-emerald-700' : 'text-amber-700'}`}>
                            {staff.vsAvg >= 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                            {Math.abs(Math.round(staff.vsAvg * 10) / 10)} incidents {staff.vsAvg >= 0 ? 'below' : 'above'} avg
                          </li>
                        </ul>
                      </div>

                      {/* Students involved */}
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Students involved</p>
                        <div className="flex flex-wrap gap-1">
                          {staff.studentsInvolved.slice(0, 8).map(name => (
                            <span key={name} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{name}</span>
                          ))}
                          {staff.studentsInvolved.length > 8 && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-400">+{staff.studentsInvolved.length - 8} more</span>
                          )}
                        </div>
                      </div>

                      {/* Recurring students or peer mentor */}
                      {staff.studentsWithPattern.length > 0 ? (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Recurring pattern</p>
                          <ul className="space-y-1">
                            {staff.studentsWithPattern.map(name => (
                              <li key={name} className="text-xs text-amber-700 font-medium flex items-center gap-1.5">
                                <AlertTriangle className="w-3 h-3 shrink-0" /> {name} — 3+ incidents
                              </li>
                            ))}
                          </ul>
                          <p className="text-[11px] text-slate-400 mt-2">Consider seating plan or targeted support review.</p>
                        </div>
                      ) : staff.indicator === 'best_practice' ? (
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Peer mentor potential</p>
                          <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                            <div className="flex items-center gap-2 mb-1.5">
                              <Star className="w-4 h-4 text-emerald-600" />
                              <span className="text-xs font-bold text-emerald-800">Recommended peer mentor</span>
                            </div>
                            <p className="text-xs text-emerald-700 leading-relaxed">Strong positive recognition patterns. Consider for CPD or peer coaching.</p>
                          </div>
                        </div>
                      ) : null}

                      {/* Suggested next step */}
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Suggested next step</p>
                        <div className={`rounded-xl p-3 border text-xs ${cfg.bg} ${cfg.border}`}>
                          {staff.indicator === 'best_practice' && <p className={cfg.text}>Nominate for peer mentoring or share practice in department CPD.</p>}
                          {staff.indicator === 'training_opportunity' && <p className={cfg.text}>Consider a supportive conversation about classroom strategies for {staff.studentsWithPattern.slice(0, 2).join(' and ')}.</p>}
                          {staff.indicator === 'review_recommended' && <p className={cfg.text}>Schedule a line manager review using this data as a conversation starter.</p>}
                          {staff.indicator === 'standard' && <p className={cfg.text}>Continue monitoring. No action required at this stage.</p>}
                        </div>
                        {staff.interventionSuccessRate > 0 && (
                          <div className="mt-3">
                            <p className="text-[10px] text-slate-400 mb-1">Intervention outcome rate</p>
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div className={`h-full rounded-full ${staff.interventionSuccessRate >= 70 ? 'bg-emerald-400' : 'bg-amber-400'}`} style={{ width: `${staff.interventionSuccessRate}%` }} />
                              </div>
                              <span className="text-xs font-semibold text-slate-700">{Math.round(staff.interventionSuccessRate)}%</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Positive vs concern indicators */}
                    <div className="mt-4 pt-4 border-t border-slate-100 grid sm:grid-cols-2 gap-4">
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Positive indicators</p>
                        <ul className="space-y-1 text-xs text-emerald-700">
                          {staff.positiveCount > 0 && <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{staff.positiveCount} positive recognition records</li>}
                          {staff.positiveRatio >= 0.4 && <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />{Math.round(staff.positiveRatio * 100)}% of records are positive</li>}
                          {staff.vsAvg >= 0 && <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />Fewer incidents than staff average</li>}
                          {staff.interventionSuccessRate >= 70 && <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />High intervention success rate</li>}
                          {staff.positiveCount === 0 && staff.vsAvg < 0 && staff.interventionSuccessRate < 70 && <li className="text-slate-400 italic">None detected</li>}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Data prompts</p>
                        <ul className="space-y-1 text-xs text-amber-700">
                          {staff.studentsWithPattern.length > 0 && <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Recurring students in incident records</li>}
                          {staff.vsAvg < -2 && <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Above-average incident count</li>}
                          {staff.totalIncidents > 8 && <li className="flex items-center gap-2"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />High total incident count ({staff.totalIncidents})</li>}
                          {staff.studentsWithPattern.length === 0 && staff.vsAvg >= 0 && staff.totalIncidents <= 8 && <li className="text-slate-400 italic">None detected</li>}
                        </ul>
                      </div>
                    </div>

                    {/* Actions for this staff member */}
                    {(() => {
                      const myActions = staffActions.filter(a => a.staffName === staff.name);
                      return (
                        <div className="mt-4 pt-4 border-t border-slate-100">
                          <div className="flex items-center justify-between mb-3">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                              Development actions
                              {myActions.length > 0 && <span className="ml-2 text-teal-600 normal-case font-medium">{myActions.filter(a => a.status !== 'completed').length} open · {myActions.filter(a => a.status === 'completed').length} completed</span>}
                            </p>
                            <button
                              onClick={e => { e.stopPropagation(); setAssignModal({ staff }); setAssignForm({ actionType: '', assignedTo: '', priority: staff.indicator === 'review_recommended' ? 'high' : 'medium', dueDate: '', notes: '' }); }}
                              className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-teal-50 border border-teal-200 text-teal-700 text-[10px] font-semibold hover:bg-teal-100 transition-colors"
                            >
                              <Plus className="w-3 h-3" /> Assign action
                            </button>
                          </div>
                          {myActions.length === 0 ? (
                            <p className="text-xs text-slate-400 italic">No development actions assigned yet. Click "Assign action" to create one.</p>
                          ) : (
                            <div className="space-y-2">
                              {myActions.map(action => (
                                <div key={action.id} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border text-xs ${action.status === 'completed' ? 'bg-emerald-50 border-emerald-100' : 'bg-white border-slate-200'}`}>
                                  <div className={`w-2 h-2 rounded-full shrink-0 mt-1 ${action.status === 'completed' ? 'bg-emerald-400' : action.priority === 'high' ? 'bg-amber-400' : 'bg-teal-400'}`} />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-semibold text-slate-800">{action.actionType}</div>
                                    <div className="text-slate-400 mt-0.5">Assigned to {action.assignedTo} · Due {new Date(action.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</div>
                                    {action.status === 'completed' && action.outcomeCategory && (
                                      <div className="mt-1 text-emerald-700 font-medium">Outcome: {action.outcomeCategory}</div>
                                    )}
                                    {action.notes && <div className="text-slate-400 mt-0.5 italic truncate">{action.notes}</div>}
                                  </div>
                                  {action.status !== 'completed' && (
                                    <button
                                      onClick={e => { e.stopPropagation(); setCompleteModal(action); setCompleteForm({ outcomeCategory: '', outcomeNotes: '' }); }}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 transition-colors whitespace-nowrap shrink-0"
                                    >
                                      <CheckCircle className="w-3 h-3" /> Complete
                                    </button>
                                  )}
                                  {action.status === 'completed' && (
                                    <button
                                      onClick={e => { e.stopPropagation(); setStaffActions(prev => prev.map(a => a.id === action.id ? { ...action, status: 'open', outcomeCategory: undefined, outcome: undefined, completedAt: undefined } : a)); addToast('Completion undone.'); }}
                                      className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0 text-[10px]"
                                    >
                                      <RotateCcw className="w-3 h-3" /> Undo
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
          {staffInsights.length === 0 && (
            <div className="card-premium py-16 flex flex-col items-center gap-3 text-slate-400">
              <Users className="w-10 h-10 text-slate-300" />
              <p className="text-sm font-medium">No staff data available yet.</p>
              <p className="text-xs text-slate-400">Upload behaviour records with staff member data to generate insights.</p>
            </div>
          )}
        </div>
      )}

      {/* Best practice tab */}
      {activeTab === 'best_practice' && (
        <div className="space-y-6">
          <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-5 py-4 flex items-start gap-3">
            <Award className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-emerald-800 mb-0.5">Recommended peer mentors</p>
              <p className="text-xs text-emerald-700">These staff members demonstrate consistent best practice and are candidates for internal CPD coaching or peer mentoring programmes.</p>
            </div>
          </div>
          {bestPractice.length === 0 && (
            <div className="card-premium py-12 text-center text-slate-400 text-sm">No best practice candidates identified yet.</div>
          )}
          {bestPractice.map(staff => (
            <div key={staff.name} className="card-premium p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                  <Star className="w-6 h-6 text-emerald-600" />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-900 text-lg">{staff.name}</h3>
                  <p className="text-sm text-emerald-700 mt-0.5">{staff.indicatorReason}</p>
                  <div className="grid grid-cols-3 gap-4 mt-4">
                    <div className="text-center bg-emerald-50 rounded-xl p-3">
                      <div className="text-2xl font-black text-emerald-700">{staff.positiveCount}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Positive recognitions</div>
                    </div>
                    <div className="text-center bg-slate-50 rounded-xl p-3">
                      <div className="text-2xl font-black text-slate-700">{staff.totalIncidents}</div>
                      <div className="text-xs text-slate-500 mt-0.5">Behaviour incidents</div>
                    </div>
                    <div className="text-center bg-teal-50 rounded-xl p-3">
                      <div className="text-2xl font-black text-teal-700">{Math.round(staff.positiveRatio * 100)}%</div>
                      <div className="text-xs text-slate-500 mt-0.5">Positive ratio</div>
                    </div>
                  </div>
                  <div className="mt-4">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Students involved</p>
                    <div className="flex flex-wrap gap-1.5">
                      {staff.studentsInvolved.slice(0, 10).map(name => (
                        <span key={name} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100 font-medium">{name}</span>
                      ))}
                    </div>
                  </div>
                  {staff.vsAvg > 0 && (
                    <p className="text-xs text-emerald-600 font-medium mt-3">
                      {staff.name}'s classes show {Math.abs(Math.round(staff.vsAvg * 10) / 10)} fewer incidents than the staff average.
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Opportunities tab */}
      {activeTab === 'opportunities' && (
        <div className="space-y-6">
          <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 flex items-start gap-3">
            <BookOpen className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-blue-800 mb-0.5">Professional development opportunities</p>
              <p className="text-xs text-blue-700">Patterns below are data prompts — not performance assessments. All conversations should be handled through your school's CPD process.</p>
            </div>
          </div>
          {reviewNeeded.length === 0 && (
            <div className="card-premium py-12 text-center text-slate-400 text-sm">No development opportunities flagged from current data.</div>
          )}
          {reviewNeeded.map(staff => {
            const cfg = INDICATOR_CONFIG[staff.indicator];
            const Icon = cfg.icon;
            return (
              <div key={staff.name} className={`card-premium p-6 border-l-4 ${staff.indicator === 'review_recommended' ? 'border-l-amber-400' : 'border-l-blue-400'}`}>
                <div className="flex items-start gap-4">
                  <div className={`w-10 h-10 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-5 h-5 ${cfg.text}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <h3 className="font-bold text-slate-900">{staff.name}</h3>
                      <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.label}</span>
                    </div>
                    <p className="text-sm text-slate-600">{staff.indicatorReason}</p>
                    {staff.studentsWithPattern.length > 0 && (
                      <div className="mt-3 bg-amber-50 border border-amber-100 rounded-xl p-3">
                        <p className="text-xs font-semibold text-amber-800 mb-1">Possible classroom management trend</p>
                        <p className="text-xs text-amber-700">Students recurring in incidents: {staff.studentsWithPattern.join(', ')}. Consider reviewing seating plans, lesson structures, or targeted support for these students.</p>
                      </div>
                    )}
                    <div className="mt-3">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Students and subjects involved</p>
                      <div className="flex flex-wrap gap-1.5">
                        {staff.studentsInvolved.slice(0, 6).map(name => (
                          <span key={name} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">{name}</span>
                        ))}
                        {staff.subjects.map(subj => (
                          <span key={subj} className="text-[10px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-100 font-medium">{subj}</span>
                        ))}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 text-xs text-slate-500">
                      <span>{staff.totalIncidents} incidents recorded</span>
                      <span>{staff.uniqueStudents} students involved</span>
                      <span>Periods: {staff.periods.slice(0, 3).join(', ') || '—'}</span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Subject trends tab */}
      {activeTab === 'subjects' && (
        <div className="card-premium overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-amber-600" /></div>
            <div>
              <h2 className="font-semibold text-slate-900">Subject behaviour trends</h2>
              <p className="text-xs text-slate-500">Incidents and positive recognition by subject area</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table-premium">
              <thead><tr><th>Subject</th><th>Incidents</th><th>Positives</th><th>Students involved</th><th>Staff involved</th><th>Trend indicator</th></tr></thead>
              <tbody>
                {subjectStats.map(row => {
                  const total = row.incidents + row.positives;
                  const incidentPct = total > 0 ? Math.round((row.incidents / total) * 100) : 0;
                  return (
                    <tr key={row.subject}>
                      <td className="font-semibold text-slate-800">{row.subject}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${row.incidents > 5 ? 'bg-red-400' : row.incidents > 2 ? 'bg-amber-400' : 'bg-slate-300'}`} style={{ width: `${Math.min(100, (row.incidents / 10) * 100)}%` }} />
                          </div>
                          <span className={`text-sm font-semibold ${row.incidents > 5 ? 'text-red-600' : 'text-slate-700'}`}>{row.incidents}</span>
                        </div>
                      </td>
                      <td><span className="text-sm font-semibold text-emerald-600">{row.positives}</span></td>
                      <td className="text-slate-600">{row.studentCount}</td>
                      <td className="text-slate-600">{row.staffCount}</td>
                      <td>
                        {row.incidents > 5 ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">Hotspot</span>
                        ) : row.incidents > 2 ? (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">Monitor</span>
                        ) : (
                          <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">Normal</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {subjectStats.length === 0 && <div className="py-12 text-center text-slate-400 text-sm">No subject data available.</div>}
        </div>
      )}

      {/* Period trends tab */}
      {activeTab === 'periods' && (
        <div className="card-premium overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center"><Clock className="w-5 h-5 text-blue-600" /></div>
            <div>
              <h2 className="font-semibold text-slate-900">Lesson period trends</h2>
              <p className="text-xs text-slate-500">Behaviour incidents by lesson period — identifies timetable hotspots</p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table-premium">
              <thead><tr><th>Period</th><th>Incidents</th><th>Students involved</th><th>Subjects</th><th>Indicator</th></tr></thead>
              <tbody>
                {periodStats.map(row => (
                  <tr key={row.period}>
                    <td className="font-semibold text-slate-800">{row.period}</td>
                    <td>
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${row.incidents > 4 ? 'bg-red-400' : row.incidents > 2 ? 'bg-amber-400' : 'bg-slate-300'}`} style={{ width: `${Math.min(100, (row.incidents / 8) * 100)}%` }} />
                        </div>
                        <span className={`text-sm font-semibold ${row.incidents > 4 ? 'text-red-600' : 'text-slate-700'}`}>{row.incidents}</span>
                      </div>
                    </td>
                    <td className="text-slate-600">{row.students.size}</td>
                    <td className="text-slate-600 max-w-[150px] truncate">{[...row.subjects].join(', ') || '—'}</td>
                    <td>
                      {row.incidents > 4 ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">High frequency</span>
                      ) : row.incidents > 2 ? (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">Elevated</span>
                      ) : (
                        <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600">Normal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {periodStats.length === 0 && <div className="py-12 text-center text-slate-400 text-sm">No period data available.</div>}
        </div>
      )}
    </div>

    <Toast toasts={toasts} onDismiss={dismissToast} />

    {/* Assign Staff Action modal */}
    {assignModal && (() => {
      const staff = assignModal.staff;
      const actionList = staff.indicator === 'best_practice' ? BEST_PRACTICE_ACTIONS : SUPPORT_ACTIONS;
      const canSave = assignForm.actionType && assignForm.assignedTo && assignForm.dueDate;
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setAssignModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className={`px-6 py-5 flex items-center justify-between ${staff.indicator === 'best_practice' ? 'bg-emerald-700' : staff.indicator === 'training_opportunity' ? 'bg-blue-700' : 'bg-slate-800'} text-white`}>
              <div>
                <h3 className="font-bold text-base">Assign Development Action</h3>
                <p className="text-xs opacity-75 mt-0.5">{staff.name} · {INDICATOR_CONFIG[staff.indicator].label}</p>
              </div>
              <button onClick={() => setAssignModal(null)} className="p-2 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs text-slate-600 leading-relaxed">
                <p className="font-semibold text-slate-700 mb-1">Evidence:</p>
                <p>{staff.indicatorReason}</p>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Action type <span className="text-red-500">*</span></label>
                <select value={assignForm.actionType} onChange={e => setAssignForm(f => ({ ...f, actionType: e.target.value }))} className="input-premium w-full">
                  <option value="">Select action...</option>
                  {actionList.map(a => <option key={a} value={a}>{a}</option>)}
                  <option value="Other">Other (specify in notes)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Responsible person <span className="text-red-500">*</span></label>
                <input type="text" value={assignForm.assignedTo} onChange={e => setAssignForm(f => ({ ...f, assignedTo: e.target.value }))} list="staff-list-dev" className="input-premium w-full" placeholder="Who will action this?" />
                <datalist id="staff-list-dev">{DEMO_STAFF.map(s => <option key={s} value={s} />)}</datalist>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Due date <span className="text-red-500">*</span></label>
                  <input type="date" value={assignForm.dueDate} onChange={e => setAssignForm(f => ({ ...f, dueDate: e.target.value }))} className="input-premium w-full" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Priority</label>
                  <select value={assignForm.priority} onChange={e => setAssignForm(f => ({ ...f, priority: e.target.value as any }))} className="input-premium w-full">
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Notes</label>
                <textarea rows={2} value={assignForm.notes} onChange={e => setAssignForm(f => ({ ...f, notes: e.target.value }))} className="input-premium w-full resize-none text-sm" placeholder="Context, approach, desired outcome..." />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setAssignModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button disabled={!canSave} onClick={submitAssign} className="btn-primary flex-1 disabled:opacity-40">
                <Save className="w-4 h-4" /> Create action
              </button>
            </div>
          </div>
        </div>
      );
    })()}

    {/* Complete Staff Action modal */}
    {completeModal && (() => {
      const OUTCOME_CATS = [
        { v: 'Best practice shared', color: 'bg-emerald-600 text-white border-emerald-600', inactive: 'border-slate-200 text-slate-600' },
        { v: 'Support completed',    color: 'bg-teal-600 text-white border-teal-600',       inactive: 'border-slate-200 text-slate-600' },
        { v: 'Improvement seen',     color: 'bg-blue-600 text-white border-blue-600',        inactive: 'border-slate-200 text-slate-600' },
        { v: 'No change',            color: 'bg-amber-500 text-white border-amber-500',      inactive: 'border-slate-200 text-slate-600' },
        { v: 'Further support needed', color: 'bg-orange-600 text-white border-orange-600', inactive: 'border-orange-200 text-orange-600' },
        { v: 'Escalated',            color: 'bg-red-600 text-white border-red-600',          inactive: 'border-red-200 text-red-600' },
      ];
      const canSave = completeForm.outcomeCategory && completeForm.outcomeNotes.trim();
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCompleteModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">Complete Development Action</h3>
                <p className="text-xs text-slate-400 mt-0.5">{completeModal.staffName} · {completeModal.actionType}</p>
              </div>
              <button onClick={() => setCompleteModal(null)} className="p-2 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Outcome <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {OUTCOME_CATS.map(({ v, color, inactive }) => (
                    <button key={v} onClick={() => setCompleteForm(f => ({ ...f, outcomeCategory: v }))}
                      className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${completeForm.outcomeCategory === v ? color : `bg-white ${inactive} hover:border-slate-300`}`}>
                      {v}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Outcome notes <span className="text-red-500">*</span></label>
                <textarea rows={3} value={completeForm.outcomeNotes} onChange={e => setCompleteForm(f => ({ ...f, outcomeNotes: e.target.value }))} className="input-premium w-full resize-none" placeholder="What happened? What did you observe? What was the impact?" />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setCompleteModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button disabled={!canSave} onClick={submitComplete} className="btn-primary flex-1 disabled:opacity-40">
                <CheckCircle className="w-4 h-4" /> Save outcome
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    </>
    </SchoolOnlyGate>
  );
}

