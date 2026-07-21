import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getInterventions, getStudents, setDemoSignalStatus, updateDemoIntervention, getDemoInterventions } from '../lib/data';
import type { Intervention, Student } from '../types';
import GlobalPriorityBar from '../components/GlobalPriorityBar';
import {
  RotateCcw, CheckCircle, ChevronRight, AlertCircle,
  CalendarDays, User, TrendingUp, TrendingDown, Minus,
  Clock, X, Save, ArrowUpRight, ArrowDownRight, Activity, AlertTriangle,
} from 'lucide-react';

const STATUS_CONFIG: Record<string, { label: string; classes: string }> = {
  suggested:       { label: 'Suggested',    classes: 'bg-slate-100 text-slate-600' },
  open:            { label: 'Open',         classes: 'bg-blue-100 text-blue-700' },
  assigned:        { label: 'Assigned',     classes: 'bg-sky-100 text-sky-700' },
  in_progress:     { label: 'In Progress',  classes: 'bg-amber-100 text-amber-700' },
  awaiting_review: { label: 'Awaiting Review', classes: 'bg-orange-100 text-orange-700' },
  review_due:      { label: 'Review Due',   classes: 'bg-orange-100 text-orange-700' },
  completed:       { label: 'Completed',    classes: 'bg-emerald-100 text-emerald-700' },
  escalated:       { label: 'Escalated',    classes: 'bg-red-100 text-red-700' },
  closed:          { label: 'Closed',       classes: 'bg-slate-100 text-slate-500' },
  cancelled:       { label: 'Cancelled',    classes: 'bg-slate-100 text-slate-400' },
};

const PRIORITY_CONFIG: Record<string, string> = {
  urgent: 'bg-red-100 text-red-700 border-red-200',
  high:   'bg-orange-100 text-orange-700 border-orange-200',
  medium: 'bg-blue-100 text-blue-700 border-blue-200',
  low:    'bg-slate-100 text-slate-600 border-slate-200',
};

type ReviewState = {
  interventionId: string;
  actionTaken: '' | 'yes' | 'no';
  studentImproved: '' | 'improved' | 'no_change' | 'worsened';
  notes: string;
  nextStep: '' | 'close' | 'continue' | 'escalate' | 'followup';
  currentAttendance: string;
  currentBehaviour: string;
};

type TabKey = 'due' | 'upcoming' | 'completed';

export default function Reviews() {
  const { profile, demoMode } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const effectiveSchoolId = demoMode ? null : profile?.school_id;

  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);

  // Map ?filter=due → 'due', ?filter=upcoming → 'upcoming', ?filter=completed → 'completed'
  const [tab, setTab] = useState<TabKey>(() => {
    const f = searchParams.get('filter');
    if (f === 'upcoming') return 'upcoming';
    if (f === 'completed') return 'completed';
    return 'due';
  });

  useEffect(() => {
    const f = searchParams.get('filter');
    if (f === 'upcoming') setTab('upcoming');
    else if (f === 'completed') setTab('completed');
    else setTab('due');
  }, [searchParams]);

  const [reviewing, setReviewing] = useState<ReviewState | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  useEffect(() => {
    async function load() {
      const [int, stu] = await Promise.all([
        getInterventions(effectiveSchoolId),
        getStudents(effectiveSchoolId),
      ]);
      // Merge demo store so status changes from Actions/StudentProfile are visible here
      let merged = int;
      if (demoMode) {
        const demoInts = getDemoInterventions();
        const demoIds = new Set(demoInts.map(i => i.id));
        merged = [...demoInts, ...int.filter(i => !demoIds.has(i.id))];
      }
      setInterventions(merged);
      setStudents(stu);
      setLoading(false);
    }
    load();
  }, [effectiveSchoolId]);

  const studentMap = new Map(students.map((s) => [s.id, s]));

  const TERMINAL = ['completed', 'closed', 'cancelled'] as const;
  const isTerminal = (i: Intervention) => TERMINAL.includes(i.status as typeof TERMINAL[number]);

  // Due / Overdue: review_date is today or past, not yet reviewed, not terminal
  const dueItems = interventions.filter(
    (i) => !isTerminal(i) && !i.review_completed && i.review_date && i.review_date <= today
  );
  // Upcoming: review_date is in the next 14 days (future), not terminal
  const upcomingItems = interventions.filter(
    (i) => !isTerminal(i) && i.review_date && i.review_date > today && i.review_date <= in14
  );
  // Completed / reviewed
  const completedItems = interventions.filter(
    (i) => i.review_completed || i.status === 'completed' || i.status === 'closed'
  );

  const overdue = dueItems.filter((i) => i.review_date && i.review_date < today);

  const displayed = tab === 'due' ? dueItems : tab === 'upcoming' ? upcomingItems : completedItems;

  function openReview(i: Intervention) {
    const student = studentMap.get(i.student_id);
    setReviewing({
      interventionId: i.id,
      actionTaken: '',
      studentImproved: '',
      notes: '',
      nextStep: '',
      currentAttendance: String(student?.attendance_pct ?? ''),
      currentBehaviour: String(student?.behaviour_score ?? ''),
    });
  }

  function computeOutcome(
    actionTaken: 'yes' | 'no',
    studentImproved: 'improved' | 'no_change' | 'worsened'
  ) {
    if (actionTaken === 'yes' && studentImproved === 'improved') return 'resolved';
    if (actionTaken === 'yes' && studentImproved === 'no_change') return 'no_change';
    if (actionTaken === 'yes' && studentImproved === 'worsened') return 'escalating';
    if (actionTaken === 'no' && studentImproved === 'improved') return 'improving';
    if (actionTaken === 'no') return 'no_change';
    return 'no_change';
  }

  function submitReview() {
    if (!reviewing || !reviewing.actionTaken || !reviewing.studentImproved) return;
    const outcome = computeOutcome(
      reviewing.actionTaken as 'yes' | 'no',
      reviewing.studentImproved as 'improved' | 'no_change' | 'worsened'
    );

    const nextStep = reviewing.nextStep;
    const newStatus: Intervention['status'] =
      nextStep === 'close'    ? 'completed' :
      nextStep === 'escalate' ? 'escalated' :
      outcome === 'resolved'  ? 'completed' :
      outcome === 'escalating'? 'escalated' : 'in_progress';

    const intervention = interventions.find((i) => i.id === reviewing.interventionId);

    setInterventions((prev) =>
      prev.map((i) =>
        i.id === reviewing.interventionId
          ? {
              ...i,
              review_completed: true,
              review_action_taken: reviewing.actionTaken === 'yes',
              review_student_improved: reviewing.studentImproved as 'improved' | 'no_change' | 'worsened',
              review_notes: reviewing.notes || null,
              outcome_status: outcome as Intervention['outcome_status'],
              status: newStatus,
              outcome: reviewing.notes || null,
            }
          : i
      )
    );

    const savedId = reviewing.interventionId;
    setReviewing(null);

    // Update signal status in demo store based on review outcome
    if (demoMode && intervention) {
      updateDemoIntervention(savedId, {
        review_completed: true,
        review_action_taken: reviewing.actionTaken === 'yes',
        review_student_improved: reviewing.studentImproved as 'improved' | 'no_change' | 'worsened',
        review_notes: reviewing.notes || null,
        outcome_status: outcome as Intervention['outcome_status'],
        status: newStatus,
      });
      const signalSt = newStatus === 'escalated' ? 'escalated'
        : outcome === 'resolved' ? 'resolved'
        : outcome === 'improving' ? 'resolved'
        : 'action_in_progress';
      setDemoSignalStatus(intervention.student_id, signalSt);
    }

    if (nextStep === 'followup' && intervention) {
      navigate(`/students/${intervention.student_id}?tab=actions&followup=${savedId}`);
      return;
    }

    setSaved(savedId);
    setTimeout(() => setSaved(null), 3000);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  function switchTab(t: TabKey) {
    setTab(t);
    const next = new URLSearchParams(searchParams);
    next.set('filter', t);
    setSearchParams(next);
  }

  return (
    <div className="space-y-6">
      <GlobalPriorityBar />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <RotateCcw className="w-6 h-6 text-teal-600" />
            Reviews
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Check whether assigned actions worked, record outcomes, and decide next steps.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex rounded-xl border border-slate-200 overflow-hidden shrink-0">
          <button
            onClick={() => switchTab('due')}
            className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'due' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Due / Overdue
            {dueItems.length > 0 && (
              <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${tab === 'due' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-700'}`}>
                {dueItems.length}
              </span>
            )}
          </button>
          <button
            onClick={() => switchTab('upcoming')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${tab === 'upcoming' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Upcoming
            {upcomingItems.length > 0 && (
              <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${tab === 'upcoming' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>
                {upcomingItems.length}
              </span>
            )}
          </button>
          <button
            onClick={() => switchTab('completed')}
            className={`px-4 py-2 text-sm font-medium transition-colors border-l border-slate-200 ${tab === 'completed' ? 'bg-teal-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
          >
            Completed
            {completedItems.length > 0 && (
              <span className={`ml-1.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${tab === 'completed' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>
                {completedItems.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Overdue banner (Due tab only) */}
      {overdue.length > 0 && tab === 'due' && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-red-800 font-medium">
            {overdue.length} review{overdue.length !== 1 ? 's are' : ' is'} overdue — the review date has passed.
          </span>
        </div>
      )}

      {/* Upcoming notice */}
      {tab === 'upcoming' && upcomingItems.length > 0 && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 text-sm">
          <CalendarDays className="w-4 h-4 text-blue-500 shrink-0" />
          <span className="text-blue-800 font-medium">
            {upcomingItems.length} review{upcomingItems.length !== 1 ? 's' : ''} scheduled in the next 14 days.
          </span>
        </div>
      )}

      {/* Saved confirmation */}
      {saved && (
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm">
          <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
          <span className="text-emerald-800 font-medium">Review saved successfully.</span>
        </div>
      )}

      {/* Empty state */}
      {displayed.length === 0 && (
        <div className="card-premium flex flex-col items-center justify-center py-20 text-slate-400 gap-4">
          <CheckCircle className="w-12 h-12 text-emerald-300" />
          <div className="text-center">
            <p className="font-semibold text-slate-600">
              {tab === 'due'
                ? 'No reviews due right now'
                : tab === 'upcoming'
                ? 'No reviews scheduled in the next 14 days'
                : 'No completed reviews yet'}
            </p>
            <p className="text-sm mt-1 text-slate-500">
              {tab === 'due'
                ? 'All reviews are up to date.'
                : tab === 'upcoming'
                ? 'Reviews will appear here when a review date is set.'
                : 'Complete a review from the Due/Overdue tab.'}
            </p>
          </div>
          <Link to="/interventions" className="btn-secondary mt-2">View all actions</Link>
        </div>
      )}

      {/* Review cards */}
      {displayed.length > 0 && (
        <div className="space-y-4">
          <p className="text-sm text-slate-500">
            Showing <span className="font-semibold text-slate-800">{displayed.length}</span>
            {tab === 'due' && <span className="ml-1 text-red-600 font-medium">· reviews due or overdue</span>}
            {tab === 'upcoming' && <span className="ml-1 text-blue-600 font-medium">· upcoming reviews</span>}
            {tab === 'completed' && <span className="ml-1 text-emerald-600 font-medium">· completed reviews</span>}
          </p>
          <div className="grid gap-4">
            {displayed.map((intervention) => {
              const student = studentMap.get(intervention.student_id);
              if (!student) return null;
              const isOverdue = intervention.review_date && intervention.review_date < today;
              const isDue = !isTerminal(intervention) && !intervention.review_completed && intervention.review_date && intervention.review_date <= today;
              const cfg = STATUS_CONFIG[intervention.status] || STATUS_CONFIG.open;
              const initials = (student.name || '').split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();

              return (
                <div
                  key={intervention.id}
                  className={`card-premium overflow-hidden ${isOverdue && isDue ? 'border-red-200 ring-1 ring-red-200' : ''}`}
                >
                  <div className="p-5">
                    <div className="flex items-start gap-4">
                      {/* Avatar */}
                      <div className="w-10 h-10 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm shrink-0">
                        {student.photo_url
                          ? <img src={student.photo_url} alt={student.name} className="w-10 h-10 rounded-full object-cover" />
                          : initials}
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div>
                            <button
                              onClick={() => navigate(`/students/${student.id}`)}
                              className="font-bold text-slate-900 hover:text-teal-700 transition-colors"
                            >
                              {student.name}
                            </button>
                            <span className="text-xs text-slate-500 ml-2">{student.year_group} · {student.form}</span>
                            {student.send_status && (
                              <span className="ml-2 text-[10px] bg-purple-50 text-purple-700 border border-purple-200 px-1.5 py-0.5 rounded font-medium">
                                {student.send_status}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider border ${PRIORITY_CONFIG[intervention.priority] || PRIORITY_CONFIG.medium}`}>
                              {intervention.priority}
                            </span>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${cfg.classes}`}>
                              {cfg.label}
                            </span>
                          </div>
                        </div>

                        {/* Detail grid */}
                        <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs">
                          <div>
                            <span className="text-slate-400">Action</span>
                            <div className="font-medium text-slate-700 mt-0.5">{intervention.action_type}</div>
                          </div>
                          <div>
                            <span className="text-slate-400 flex items-center gap-1"><User className="w-3 h-3" /> Owner</span>
                            <div className="font-medium text-slate-700 mt-0.5">{intervention.assigned_to || '—'}</div>
                          </div>
                          <div>
                            <span className="text-slate-400 flex items-center gap-1"><CalendarDays className="w-3 h-3" /> Due date</span>
                            <div className="font-medium text-slate-700 mt-0.5">{intervention.due_date || '—'}</div>
                          </div>
                          <div>
                            <span className="text-slate-400 flex items-center gap-1">
                              <Clock className="w-3 h-3" /> Review date
                            </span>
                            <div className={`font-medium mt-0.5 ${isOverdue && isDue ? 'text-red-600 font-bold' : 'text-slate-700'}`}>
                              {intervention.review_date || '—'}
                              {isOverdue && isDue && ' (overdue)'}
                            </div>
                          </div>
                        </div>

                        {intervention.notes && (
                          <p className="mt-2 text-xs text-slate-500 italic line-clamp-2">{intervention.notes}</p>
                        )}

                        {/* Before/After impact metrics */}
                        {(intervention.baseline_attendance != null || intervention.baseline_behaviour != null) && (
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Evidence before / current</div>
                            <div className="grid grid-cols-2 gap-2">
                              {intervention.baseline_attendance != null && intervention.current_attendance != null && (
                                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
                                  intervention.current_attendance > intervention.baseline_attendance
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : intervention.current_attendance < intervention.baseline_attendance
                                    ? 'bg-red-50 border-red-200 text-red-700'
                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                                }`}>
                                  <Activity className="w-3.5 h-3.5 shrink-0" />
                                  <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70 mb-0.5">Attendance</div>
                                    <div className="font-bold flex items-center gap-1">
                                      <span className="opacity-70">{intervention.baseline_attendance}%</span>
                                      {intervention.current_attendance > intervention.baseline_attendance
                                        ? <ArrowUpRight className="w-3 h-3" />
                                        : intervention.current_attendance < intervention.baseline_attendance
                                        ? <ArrowDownRight className="w-3 h-3" />
                                        : <Minus className="w-3 h-3" />}
                                      <span>{intervention.current_attendance}%</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                              {intervention.baseline_behaviour != null && intervention.current_behaviour != null && (
                                <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs ${
                                  intervention.current_behaviour < intervention.baseline_behaviour
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                                    : intervention.current_behaviour > intervention.baseline_behaviour
                                    ? 'bg-red-50 border-red-200 text-red-700'
                                    : 'bg-slate-50 border-slate-200 text-slate-600'
                                }`}>
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                                  <div>
                                    <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70 mb-0.5">Incidents</div>
                                    <div className="font-bold flex items-center gap-1">
                                      <span className="opacity-70">{intervention.baseline_behaviour}</span>
                                      {intervention.current_behaviour < intervention.baseline_behaviour
                                        ? <ArrowDownRight className="w-3 h-3" />
                                        : intervention.current_behaviour > intervention.baseline_behaviour
                                        ? <ArrowUpRight className="w-3 h-3" />
                                        : <Minus className="w-3 h-3" />}
                                      <span>{intervention.current_behaviour}</span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            {intervention.outcome_status && (
                              <div className={`mt-2 text-[10px] font-semibold uppercase tracking-wider ${
                                intervention.outcome_status === 'resolved' || intervention.outcome_status === 'sustained' ? 'text-emerald-600' :
                                intervention.outcome_status === 'improving' ? 'text-teal-600' :
                                intervention.outcome_status === 'escalating' ? 'text-red-600' : 'text-slate-500'
                              }`}>
                                Outcome: {intervention.outcome_status}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Completed review summary */}
                        {intervention.review_completed && intervention.outcome && (
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Review notes</div>
                            <p className="text-xs text-slate-600">{intervention.outcome}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Card footer actions */}
                    <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
                      {isDue && (
                        <button
                          onClick={() => openReview(intervention)}
                          className="btn-primary text-sm py-2"
                        >
                          <RotateCcw className="w-3.5 h-3.5" />
                          Complete review
                        </button>
                      )}
                      <Link
                        to={`/students/${student.id}`}
                        className="btn-secondary text-sm py-2 flex items-center gap-1.5"
                      >
                        Student profile
                        <ChevronRight className="w-3.5 h-3.5" />
                      </Link>
                      {intervention.review_completed && (
                        <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 ml-auto">
                          <CheckCircle className="w-3.5 h-3.5" />
                          Reviewed
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Review modal */}
      {reviewing && (() => {
        const intervention = interventions.find((i) => i.id === reviewing.interventionId);
        const student = intervention ? studentMap.get(intervention.student_id) : undefined;
        if (!intervention || !student) return null;
        const canSubmit = reviewing.actionTaken && reviewing.studentImproved && reviewing.nextStep;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setReviewing(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between sticky top-0 bg-white z-10">
                <div>
                  <h2 className="font-bold text-slate-900">Complete Review</h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {intervention.action_type} · {student.name}
                  </p>
                </div>
                <button
                  onClick={() => setReviewing(null)}
                  className="p-2 rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="px-6 py-5 space-y-5">
                {/* Q1: Was action completed? */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">
                    Was the action completed?
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(['yes', 'no'] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => setReviewing((r) => r ? { ...r, actionTaken: v } : r)}
                        className={`py-3 rounded-xl border text-sm font-semibold transition-all ${
                          reviewing.actionTaken === v
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        {v === 'yes' ? 'Yes, completed' : 'No, not completed'}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Q2: Outcome */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">
                    Has the student improved?
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { v: 'improved',  label: 'Improved',  icon: TrendingUp,   color: 'text-emerald-600' },
                      { v: 'no_change', label: 'No change', icon: Minus,        color: 'text-slate-500' },
                      { v: 'worsened',  label: 'Worsened',  icon: TrendingDown, color: 'text-red-600' },
                    ] as const).map(({ v, label, icon: Icon, color }) => (
                      <button
                        key={v}
                        onClick={() => setReviewing((r) => r ? { ...r, studentImproved: v } : r)}
                        className={`py-3 rounded-xl border text-xs font-semibold transition-all flex flex-col items-center gap-1 ${
                          reviewing.studentImproved === v
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <Icon className={`w-4 h-4 ${reviewing.studentImproved === v ? 'text-white' : color}`} />
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Before / After Metrics */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Before / After Metrics <span className="normal-case font-normal text-slate-400">(optional)</span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Attendance % (before)</label>
                      <input
                        type="number" min="0" max="100"
                        value={intervention.baseline_attendance ?? student?.attendance_pct ?? ''}
                        readOnly
                        className="input-premium w-full text-sm py-1.5 bg-slate-100 text-slate-500 cursor-not-allowed"
                        placeholder="—"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Attendance % (now)</label>
                      <input
                        type="number" min="0" max="100"
                        value={reviewing.currentAttendance}
                        onChange={(e) => setReviewing((r) => r ? { ...r, currentAttendance: e.target.value } : r)}
                        className="input-premium w-full text-sm py-1.5"
                        placeholder="Current %"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Behaviour pts (before)</label>
                      <input
                        type="number" min="0"
                        value={intervention.baseline_behaviour ?? student?.behaviour_score ?? ''}
                        readOnly
                        className="input-premium w-full text-sm py-1.5 bg-slate-100 text-slate-500 cursor-not-allowed"
                        placeholder="—"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Behaviour pts (now)</label>
                      <input
                        type="number" min="0"
                        value={reviewing.currentBehaviour}
                        onChange={(e) => setReviewing((r) => r ? { ...r, currentBehaviour: e.target.value } : r)}
                        className="input-premium w-full text-sm py-1.5"
                        placeholder="Current pts"
                      />
                    </div>
                  </div>
                </div>

                {/* Outcome notes (required) */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Outcome notes <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    value={reviewing.notes}
                    onChange={(e) => setReviewing((r) => r ? { ...r, notes: e.target.value } : r)}
                    placeholder="What happened? What evidence supports this outcome?"
                    className="input-premium w-full"
                    rows={3}
                  />
                </div>

                {/* Next step (required) */}
                <div>
                  <label className="block text-sm font-semibold text-slate-800 mb-2">
                    Next step <span className="text-red-500 text-xs font-normal">required</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      { v: 'close',    label: 'Close — resolved',       color: 'hover:border-emerald-300' },
                      { v: 'continue', label: 'Continue support',        color: 'hover:border-blue-300' },
                      { v: 'escalate', label: 'Escalate',                color: 'hover:border-red-300' },
                      { v: 'followup', label: 'Create follow-up action', color: 'hover:border-teal-300' },
                    ] as const).map(({ v, label, color }) => (
                      <button
                        key={v}
                        onClick={() => setReviewing((r) => r ? { ...r, nextStep: v } : r)}
                        className={`py-2.5 rounded-xl border text-xs font-semibold transition-all ${
                          reviewing.nextStep === v
                            ? 'bg-teal-600 text-white border-teal-600'
                            : `bg-white text-slate-600 border-slate-200 ${color}`
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Outcome preview */}
                {reviewing.actionTaken && reviewing.studentImproved && (() => {
                  const outcome = computeOutcome(
                    reviewing.actionTaken as 'yes' | 'no',
                    reviewing.studentImproved as 'improved' | 'no_change' | 'worsened'
                  );
                  const OUTCOME_LABELS: Record<string, { label: string; color: string }> = {
                    resolved:   { label: 'Resolved — will mark as Completed',    color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                    improving:  { label: 'Improving — will remain In Progress',  color: 'text-teal-700 bg-teal-50 border-teal-200' },
                    no_change:  { label: 'No change — will remain In Progress',  color: 'text-amber-700 bg-amber-50 border-amber-200' },
                    escalating: { label: 'Escalating — will mark as Escalated',  color: 'text-red-700 bg-red-50 border-red-200' },
                  };
                  const cfg = OUTCOME_LABELS[outcome];
                  return (
                    <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-medium ${cfg.color}`}>
                      <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                      {cfg.label}
                    </div>
                  );
                })()}
              </div>

              <div className="px-6 py-4 border-t border-slate-100 flex gap-3 sticky bottom-0 bg-white">
                <button onClick={() => setReviewing(null)} className="btn-secondary flex-1">Cancel</button>
                <button
                  onClick={submitReview}
                  disabled={!canSubmit}
                  className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  Save review
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

