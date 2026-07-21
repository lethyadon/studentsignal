import { useState, useEffect, useMemo, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getCommunications, createCommunication, getStudents, DEMO_STAFF, HOY_BY_YEAR, addDemoIntervention, setDemoSignalStatus, getHOYYearGroup, subscribeToComms, routeCommunication, dismissCommunication, updateDemoStudentRisk } from '../lib/data';
import type { Communication, CommunicationSource, CommunicationPriority, Student, Intervention } from '../types';
import { Toast, useToast } from '../components/Toast';
import GlobalPriorityBar from '../components/GlobalPriorityBar';
import { isStudentInScope } from '../lib/permissions';
import {
  Mail, Phone, Users, FileText, Building2, MessageCircle,
  Plus, X, Search, CheckCircle, Clock, AlertTriangle,
  Calendar, User, ChevronDown, ChevronUp, SlidersHorizontal,
  ArrowRight, Info, RefreshCw, ClipboardList, Save, Sparkles, Zap,
  Route, UserCheck, ChevronRight, Ban,
} from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────

const SOURCE_CONFIG: Record<CommunicationSource, { label: string; icon: React.FC<{ className?: string }>; bg: string; text: string; border: string }> = {
  email:                { label: 'Email',               icon: Mail,           bg: 'bg-blue-50',    text: 'text-blue-700',    border: 'border-blue-200' },
  phone:                { label: 'Phone call',          icon: Phone,          bg: 'bg-teal-50',    text: 'text-teal-700',    border: 'border-teal-200' },
  meeting:              { label: 'Meeting',             icon: Users,          bg: 'bg-slate-50',   text: 'text-slate-700',   border: 'border-slate-200' },
  letter:               { label: 'Letter',              icon: FileText,       bg: 'bg-amber-50',   text: 'text-amber-700',   border: 'border-amber-200' },
  external_agency:      { label: 'External agency',     icon: Building2,      bg: 'bg-red-50',     text: 'text-red-700',     border: 'border-red-200' },
  pastoral_conversation:{ label: 'Pastoral conversation', icon: MessageCircle, bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
};

const PRIORITY_CONFIG: Record<CommunicationPriority, { label: string; bg: string; text: string }> = {
  low:    { label: 'Low',    bg: 'bg-slate-100',   text: 'text-slate-600' },
  normal: { label: 'Normal', bg: 'bg-blue-100',    text: 'text-blue-700' },
  high:   { label: 'High',   bg: 'bg-amber-100',   text: 'text-amber-700' },
  urgent: { label: 'Urgent', bg: 'bg-red-100',     text: 'text-red-700' },
};

const BLANK_FORM = {
  student_id: '',
  date: new Date().toISOString().slice(0, 10),
  source: 'phone' as CommunicationSource,
  summary: '',
  priority: 'normal' as CommunicationPriority,
  staff_member: '',
  follow_up_required: false,
  follow_up_date: '',
  notes: '',
};

// ── Suggestion engine ─────────────────────────────────────────────────────────

function suggestAction(comm: Communication): { action_type: string; priority: 'low' | 'medium' | 'high' | 'urgent'; suggestion: string } {
  const text = (comm.summary || '').toLowerCase();
  const isSafeguarding = text.includes('safeguard') || text.includes('concern') || text.includes('welfare') || text.includes('disclosure') || text.includes('risk');
  const isAttendance = text.includes('attendance') || text.includes('absent') || text.includes('lateness');
  const isBehaviour = text.includes('behaviour') || text.includes('incident') || text.includes('exclusion');

  if (isSafeguarding || comm.source === 'external_agency') {
    return { action_type: comm.source === 'external_agency' ? 'Multi-agency meeting' : 'Safeguarding referral', priority: 'urgent', suggestion: 'Safeguarding language detected — DSL should be informed and a formal action logged.' };
  }
  if (comm.priority === 'urgent') {
    return { action_type: 'Welfare check', priority: 'urgent', suggestion: 'Urgent communication — a welfare check or immediate pastoral contact is recommended.' };
  }
  if (isAttendance) {
    return { action_type: 'Attendance meeting', priority: comm.priority === 'high' ? 'high' : 'medium', suggestion: 'Attendance concern — schedule a formal attendance meeting with parent/carer.' };
  }
  if (isBehaviour) {
    return { action_type: 'Behaviour review', priority: comm.priority === 'high' ? 'high' : 'medium', suggestion: 'Behaviour concern raised — a pastoral review or restorative conversation is recommended.' };
  }
  if (comm.source === 'pastoral_conversation') {
    return { action_type: 'Tutor check-in', priority: 'medium', suggestion: 'Follow up on this pastoral conversation with a structured check-in.' };
  }
  if (comm.source === 'phone' || comm.source === 'email' || comm.source === 'letter') {
    return { action_type: 'Parent/carer contact', priority: 'medium', suggestion: 'Log a follow-up contact to keep the family informed of next steps.' };
  }
  return { action_type: 'Pastoral meeting', priority: 'medium', suggestion: 'A pastoral meeting is recommended as the next step following this contact.' };
}

// ── Auto-assignment engine ─────────────────────────────────────────────────────

const PRIORITY_DAYS: Record<string, number> = { urgent: 1, high: 3, medium: 7, low: 14 };

function autoAssign(comm: Communication, student: Student | undefined): { assigned_to: string; due_date: string; is_auto: boolean } {
  const suggestion = suggestAction(comm);
  const days = PRIORITY_DAYS[suggestion.priority] ?? 7;
  const due = new Date();
  due.setDate(due.getDate() + days);
  const due_date = due.toISOString().split('T')[0];

  let assigned_to = '';
  const type = suggestion.action_type.toLowerCase();
  if (type.includes('safeguarding') || type.includes('multi-agency') || comm.source === 'external_agency') {
    assigned_to = 'Mr Ahmed (DSL)';
  } else if (type.includes('send')) {
    assigned_to = 'Ms Jones (SENDCo)';
  } else if (type.includes('attendance')) {
    assigned_to = 'Ms Williams (Attend)';
  } else if (type.includes('counsell')) {
    assigned_to = 'Ms Green (Counsellor)';
  } else if (student?.year_group && HOY_BY_YEAR[student.year_group]) {
    assigned_to = HOY_BY_YEAR[student.year_group];
  } else {
    assigned_to = comm.staff_member || '';
  }

  return { assigned_to, due_date, is_auto: !!assigned_to };
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Communications() {
  const { profile, demoMode } = useAuth();
  const { toasts, addToast, dismissToast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const schoolId = demoMode ? null : (profile as any)?.school_id;
  const currentUser = (profile as any)?.full_name || 'Demo User';
  const currentRole = (profile as any)?.role || '';
  const userYearGroup = currentRole === 'head_of_year' ? getHOYYearGroup(currentUser) : null;
  const userForm = currentRole === 'tutor' ? '10B' : null;

  const [comms, setComms]       = useState<Communication[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading]   = useState(true);
  const [showNew, setShowNew]   = useState(false);
  const [form, setForm]         = useState({ ...BLANK_FORM, staff_member: currentUser });
  const [search, setSearch]     = useState('');
  const [sourceFilter, setSourceFilter] = useState<CommunicationSource | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<CommunicationPriority | 'all'>('all');
  const [timeFilter, setTimeFilter] = useState<'all' | 'this_week' | 'follow_up'>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);
  const [createActionFor, setCreateActionFor] = useState<Communication | null>(null);
  const [actionForm, setActionForm] = useState({ action_type: 'Pastoral meeting', notes: '', assigned_to: '', due_date: '', priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent' });
  const [autoAssigned, setAutoAssigned] = useState<{ assigned_to: boolean; due_date: boolean }>({ assigned_to: false, due_date: false });
  const [actionedComms, setActionedComms] = useState<Set<string>>(new Set());

  // Routing queue state
  const [routingOverride, setRoutingOverride] = useState<Record<string, string>>({});
  const [routingActioned, setRoutingActioned] = useState<Set<string>>(new Set());

  const reloadComms = useCallback(async () => {
    const c = await getCommunications(schoolId);
    setComms(c);
  }, [schoolId]);

  const studentParam = searchParams.get('student');

  useEffect(() => {
    async function load() {
      const [c, s] = await Promise.all([
        getCommunications(schoolId),
        getStudents(schoolId),
      ]);
      setComms(c);
      setStudents(s);
      setLoading(false);
    }
    load();
    // Live-update when QuickLogModal adds a pending comm
    const unsub = subscribeToComms(() => { reloadComms(); });
    return unsub;
  }, [schoolId, reloadComms]);

  useEffect(() => {
    if (studentParam) {
      setForm(f => ({ ...f, student_id: studentParam }));
      setShowNew(true);
    }
  }, [studentParam]);

  const studentMap = useMemo(() => {
    const m = new Map<string, Student>();
    students.forEach(s => m.set(s.id, s));
    return m;
  }, [students]);

  // Students visible to this user
  const scopedStudents = useMemo(() =>
    students.filter(s => isStudentInScope(currentRole, s, userYearGroup, userForm)),
  [students, currentRole, userYearGroup, userForm]);

  const scopedStudentIds = useMemo(() => new Set(scopedStudents.map(s => s.id)), [scopedStudents]);

  // Pending routing queue — comms logged via QuickLogModal awaiting confirmation
  const pendingComms = useMemo(() =>
    comms.filter(c =>
      c.routing_status === 'pending_review' &&
      scopedStudentIds.has(c.student_id) &&
      !routingActioned.has(c.id)
    ).sort((a, b) => b.created_at.localeCompare(a.created_at)),
  [comms, scopedStudentIds, routingActioned]);

  function acceptRouting(comm: Communication) {
    const assignTo = routingOverride[comm.id] || comm.suggested_assignee || '';
    if (!assignTo) return;
    const student = studentMap.get(comm.student_id);
    const suggestion = suggestAction(comm);
    const days = PRIORITY_DAYS[suggestion.priority] ?? 7;
    const due = new Date(); due.setDate(due.getDate() + days);
    const action: Intervention = {
      id: 'routing_' + Math.random().toString(36).slice(2) + Date.now(),
      student_id: comm.student_id,
      assigned_to: assignTo,
      created_by: currentUser,
      action_type: suggestion.action_type,
      priority: suggestion.priority,
      status: 'open',
      due_date: due.toISOString().slice(0, 10),
      review_date: null,
      notes: `Routed from communication log (${SOURCE_CONFIG[comm.source].label}): ${comm.summary}\n\nLogged by ${comm.staff_member}.`,
      outcome: null,
      created_at: new Date().toISOString(),
    };
    if (demoMode) {
      addDemoIntervention(action);
      if (student) {
        setDemoSignalStatus(student.id, 'action_in_progress');
        // Propagate risk level based on routing destination
        const isDSL       = /dsl|ahmed/i.test(assignTo);
        const isEscalated = suggestion.priority === 'urgent' || comm.priority === 'urgent';
        if (isDSL) {
          // DSL routing → red safeguarding flag
          updateDemoStudentRisk(student.id, { risk_level: 'red', signal_category: 'red' });
        } else if (isEscalated && student.risk_level !== 'red') {
          // Urgent non-DSL routing → amber at minimum
          updateDemoStudentRisk(student.id, { risk_level: 'amber' });
        } else if (student.risk_level === 'green') {
          // Any routing of a currently-green student bumps to amber watch
          updateDemoStudentRisk(student.id, { risk_level: 'amber', signal_category: 'amber' });
        }
      }
    }
    routeCommunication(comm.id);
    setRoutingActioned(prev => new Set(prev).add(comm.id));
    addToast(`Action created for ${student?.name || 'student'} — assigned to ${assignTo}.`);
  }

  function dismissRouting(comm: Communication) {
    dismissCommunication(comm.id);
    setRoutingActioned(prev => new Set(prev).add(comm.id));
    addToast('Communication logged — no action needed.');
  }

  const filtered = useMemo(() => {
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    const today = now.toISOString().slice(0, 10);
    return comms.filter(c => {
      if (c.routing_status === 'pending_review') return false; // shown in routing queue instead
      if (!scopedStudentIds.has(c.student_id)) return false;
      if (studentParam && c.student_id !== studentParam) return false;
      if (sourceFilter !== 'all' && c.source !== sourceFilter) return false;
      if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;
      if (timeFilter === 'this_week' && new Date(c.date) < weekAgo) return false;
      if (timeFilter === 'follow_up' && !(c.follow_up_required && c.follow_up_date && c.follow_up_date <= today)) return false;
      if (search) {
        const term = search.toLowerCase();
        const student = studentMap.get(c.student_id);
        return (
          c.summary.toLowerCase().includes(term) ||
          (student?.name || '').toLowerCase().includes(term) ||
          c.staff_member.toLowerCase().includes(term) ||
          (c.notes || '').toLowerCase().includes(term)
        );
      }
      return true;
    });
  }, [comms, scopedStudentIds, studentParam, sourceFilter, priorityFilter, timeFilter, search, studentMap]);

  // Stats — scoped to visible students only
  const scopedComms = useMemo(() => comms.filter(c => scopedStudentIds.has(c.student_id)), [comms, scopedStudentIds]);
  const followUpDue   = scopedComms.filter(c => c.follow_up_required && c.follow_up_date && c.follow_up_date <= new Date().toISOString().slice(0, 10)).length;
  const urgentCount   = scopedComms.filter(c => c.priority === 'urgent').length;
  const thisWeek      = scopedComms.filter(c => {
    const d = new Date(c.date);
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    return d >= weekAgo;
  }).length;

  // Communication-escalation pattern: 3+ comms for same student in 14 days
  const escalationAlerts = useMemo(() => {
    const alerts: Array<{ student: Student; count: number; sources: string[] }> = [];
    const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 14);
    const byStudent = new Map<string, Communication[]>();
    comms.forEach(c => {
      if (new Date(c.date) >= cutoff) {
        if (!byStudent.has(c.student_id)) byStudent.set(c.student_id, []);
        byStudent.get(c.student_id)!.push(c);
      }
    });
    byStudent.forEach((cs, sid) => {
      if (cs.length >= 3) {
        const student = studentMap.get(sid);
        if (student) {
          alerts.push({ student, count: cs.length, sources: [...new Set(cs.map(c => SOURCE_CONFIG[c.source].label))] });
        }
      }
    });
    return alerts.sort((a, b) => b.count - a.count);
  }, [comms, studentMap]);

  async function save() {
    if (!form.student_id) { addToast('Please select a student.', 'error'); return; }
    if (!form.summary.trim()) { addToast('Please add a summary.', 'error'); return; }
    setSaving(true);
    try {
      const newComm = await createCommunication(schoolId, {
        student_id: form.student_id,
        date: form.date,
        source: form.source,
        summary: form.summary.trim(),
        priority: form.priority,
        staff_member: form.staff_member || currentUser,
        follow_up_required: form.follow_up_required,
        follow_up_date: form.follow_up_required && form.follow_up_date ? form.follow_up_date : null,
        linked_action_id: null,
        notes: form.notes.trim() || null,
      });
      setComms(prev => [newComm, ...prev]);
      setForm({ ...BLANK_FORM, staff_member: currentUser });
      setShowNew(false);
      addToast('Communication logged.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" /></div>;
  }

  return (
    <div className="space-y-8">
      <Toast toasts={toasts} onDismiss={dismissToast} />
      <GlobalPriorityBar />
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Communications</h1>
          <p className="text-sm text-slate-500 mt-1">Parent contacts, external agencies, and pastoral conversations — all in one place.</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="btn-primary">
          <Plus className="w-4 h-4" />
          Log communication
        </button>
      </div>

      {/* ── Needs Routing queue ───────────────────────────────────────────── */}
      {pendingComms.length > 0 && (
        <div className="rounded-2xl border-2 border-amber-200 bg-amber-50 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-amber-200 bg-amber-100/60">
            <div className="flex items-center gap-2">
              <Route className="w-4 h-4 text-amber-700" />
              <span className="font-bold text-amber-900 text-sm">Needs Routing</span>
              <span className="ml-1 text-xs font-bold bg-amber-600 text-white px-2 py-0.5 rounded-full">{pendingComms.length}</span>
            </div>
            <p className="text-xs text-amber-700 hidden sm:block">Review communications logged by reception — accept the auto-suggestion or reassign before actioning.</p>
          </div>
          <div className="divide-y divide-amber-100">
            {pendingComms.map(comm => {
              const student = studentMap.get(comm.student_id);
              const SrcIcon = SOURCE_CONFIG[comm.source]?.icon || MessageCircle;
              const suggested = comm.suggested_assignee;
              const override  = routingOverride[comm.id];
              const assignTo  = override || suggested || '';
              const pri = PRIORITY_CONFIG[comm.priority];
              return (
                <div key={comm.id} className="px-5 py-4">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-3">
                    {/* Source icon + student */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${SOURCE_CONFIG[comm.source]?.bg || 'bg-slate-100'}`}>
                        <SrcIcon className={`w-4 h-4 ${SOURCE_CONFIG[comm.source]?.text || 'text-slate-600'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {student ? (
                            <Link to={`/students/${student.id}`} className="font-semibold text-slate-900 text-sm hover:text-teal-700 transition-colors">
                              {student.name}
                            </Link>
                          ) : (
                            <span className="font-semibold text-slate-900 text-sm">Unknown student</span>
                          )}
                          {student && <span className="text-xs text-slate-500">{student.year_group} · {student.form}</span>}
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${pri.bg} ${pri.text}`}>{pri.label}</span>
                          <span className="text-xs text-slate-400">by {comm.staff_member}</span>
                        </div>
                        <p className="text-sm text-slate-700 mt-1 leading-relaxed line-clamp-2">{comm.summary}</p>
                        {/* Routing destination */}
                        <div className="mt-2 flex items-center gap-2 flex-wrap">
                          <div className="flex items-center gap-1.5">
                            {suggested && !override && (
                              <span className="text-[10px] font-bold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full uppercase tracking-wider">Auto-suggested</span>
                            )}
                            {override && (
                              <span className="text-[10px] font-bold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full uppercase tracking-wider">Overridden</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 flex-1">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <select
                              value={assignTo}
                              onChange={e => setRoutingOverride(prev => ({ ...prev, [comm.id]: e.target.value }))}
                              className="text-xs border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 focus:ring-1 focus:ring-teal-400 focus:border-teal-400 outline-none"
                            >
                              <option value="">Unassigned — select staff</option>
                              {DEMO_STAFF.map(s => (
                                <option key={s.name} value={s.name}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    </div>
                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                      <button
                        onClick={() => acceptRouting(comm)}
                        disabled={!assignTo}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        Accept & create action
                      </button>
                      <button
                        onClick={() => dismissRouting(comm)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-medium hover:bg-slate-50 transition-colors"
                        title="No action needed"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        No action
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'This week', value: thisWeek, icon: <Calendar className="w-5 h-5 text-teal-500" />, color: 'text-teal-600', active: timeFilter === 'this_week', onClick: () => setTimeFilter(t => t === 'this_week' ? 'all' : 'this_week') },
          { label: 'Follow-up due', value: followUpDue, icon: <Clock className="w-5 h-5 text-amber-500" />, color: 'text-amber-600', active: timeFilter === 'follow_up', onClick: () => setTimeFilter(t => t === 'follow_up' ? 'all' : 'follow_up') },
          { label: 'Urgent', value: urgentCount, icon: <AlertTriangle className="w-5 h-5 text-red-500" />, color: 'text-red-600', active: priorityFilter === 'urgent', onClick: () => setPriorityFilter(p => p === 'urgent' ? 'all' : 'urgent') },
          { label: 'Total logged', value: comms.length, icon: <MessageCircle className="w-5 h-5 text-slate-400" />, color: 'text-slate-700', active: timeFilter === 'all' && sourceFilter === 'all' && priorityFilter === 'all', onClick: () => { setTimeFilter('all'); setSourceFilter('all'); setPriorityFilter('all'); setSearch(''); } },
        ].map(item => (
          <button
            key={item.label}
            onClick={item.onClick}
            className={`card-premium p-5 text-left transition-all hover:ring-2 hover:ring-teal-200 ${item.active ? 'ring-2 ring-teal-400 bg-teal-50/30' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">{item.icon}<span className={`text-2xl font-bold ${item.color}`}>{item.value}</span></div>
            <p className="text-sm font-semibold text-slate-700">{item.label}</p>
          </button>
        ))}
      </div>

      {/* Communication escalation alert */}
      {escalationAlerts.length > 0 && (
        <div className="card-premium overflow-hidden border-l-4 border-l-amber-400">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <h2 className="font-semibold text-slate-900 text-sm">Communication escalation detected</h2>
            <span className="ml-auto text-xs text-slate-400">3+ contacts in 14 days</span>
          </div>
          <div className="divide-y divide-slate-50">
            {escalationAlerts.map(({ student, count, sources }) => (
              <div key={student.id} className="px-5 py-3 flex items-center gap-4 bg-amber-50/40">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Link to={`/students/${student.id}`} className="text-sm font-semibold text-slate-900 hover:text-teal-700">{student.name}</Link>
                    <span className="text-xs text-slate-400">{student.year_group}</span>
                  </div>
                  <p className="text-xs text-amber-700 mt-0.5">
                    <strong>{count} contacts</strong> in 14 days via {sources.join(', ')} — review student circumstances
                  </p>
                </div>
                <Link to={`/students/${student.id}`} className="btn-secondary text-xs px-3 py-1.5 shrink-0">
                  View profile
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active filters */}
      {(studentParam || timeFilter !== 'all' || sourceFilter !== 'all' || priorityFilter !== 'all') && (
        <div className="flex flex-wrap items-center gap-2 bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
          <SlidersHorizontal className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="text-xs font-semibold text-teal-700">Active filters:</span>
          {studentParam && (
            <span className="flex items-center gap-1 bg-white border border-teal-200 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">
              {studentMap.get(studentParam)?.name || studentParam}
              <button onClick={() => setSearchParams({})}><X className="w-3 h-3" /></button>
            </span>
          )}
          {timeFilter !== 'all' && (
            <span className="flex items-center gap-1 bg-white border border-teal-200 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">
              {timeFilter === 'this_week' ? 'This week' : 'Follow-up due'}
              <button onClick={() => setTimeFilter('all')}><X className="w-3 h-3" /></button>
            </span>
          )}
          {sourceFilter !== 'all' && (
            <span className="flex items-center gap-1 bg-white border border-teal-200 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">
              {SOURCE_CONFIG[sourceFilter]?.label}
              <button onClick={() => setSourceFilter('all')}><X className="w-3 h-3" /></button>
            </span>
          )}
          {priorityFilter !== 'all' && (
            <span className="flex items-center gap-1 bg-white border border-teal-200 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">
              Priority: {priorityFilter}
              <button onClick={() => setPriorityFilter('all')}><X className="w-3 h-3" /></button>
            </span>
          )}
          <button onClick={() => { setTimeFilter('all'); setSourceFilter('all'); setPriorityFilter('all'); setSearchParams({}); }} className="ml-auto text-xs text-teal-600 hover:underline">Clear all</button>
        </div>
      )}

      {/* Create form */}
      {showNew && (
        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Log communication</h3>
              <p className="text-xs text-slate-500 mt-0.5">Record a parent contact, agency communication, or pastoral conversation.</p>
            </div>
            <button onClick={() => setShowNew(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400"><X className="w-5 h-5" /></button>
          </div>

          {/* Source type buttons */}
          <div className="mb-5">
            <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">Communication type</label>
            <div className="flex flex-wrap gap-2">
              {(Object.entries(SOURCE_CONFIG) as [CommunicationSource, typeof SOURCE_CONFIG[CommunicationSource]][]).map(([key, cfg]) => {
                const Icon = cfg.icon;
                return (
                  <button
                    key={key}
                    onClick={() => setForm(f => ({ ...f, source: key }))}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm font-medium transition-all ${
                      form.source === key
                        ? `${cfg.bg} ${cfg.text} ${cfg.border} border-2`
                        : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {cfg.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Student <span className="text-red-500">*</span></label>
              <select value={form.student_id} onChange={e => setForm(f => ({ ...f, student_id: e.target.value }))} className="input-premium w-full">
                <option value="">Select student...</option>
                {scopedStudents.map(s => <option key={s.id} value={s.id}>{s.name} ({s.year_group})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Date</label>
              <input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className="input-premium w-full" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Staff member</label>
              <select value={form.staff_member} onChange={e => setForm(f => ({ ...f, staff_member: e.target.value }))} className="input-premium w-full">
                <option value="">Select staff...</option>
                {DEMO_STAFF.map(s => <option key={s.name} value={s.name}>{s.name} — {s.role}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Priority</label>
              <select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as CommunicationPriority }))} className="input-premium w-full">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Summary <span className="text-red-500">*</span></label>
              <textarea
                rows={3}
                value={form.summary}
                onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
                className="input-premium w-full resize-none"
                placeholder="Brief summary of the communication — who said what, what was agreed..."
                autoFocus
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Notes <span className="text-slate-400 font-normal normal-case">(optional)</span></label>
              <textarea
                rows={2}
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="input-premium w-full resize-none"
                placeholder="Internal notes — concerns, context, confidential observations..."
              />
            </div>
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.follow_up_required}
                  onChange={e => setForm(f => ({ ...f, follow_up_required: e.target.checked }))}
                  className="w-4 h-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                />
                <span className="text-sm font-medium text-slate-700">Follow-up required</span>
              </label>
            </div>
            {form.follow_up_required && (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Follow-up date</label>
                <input type="date" value={form.follow_up_date} onChange={e => setForm(f => ({ ...f, follow_up_date: e.target.value }))} className="input-premium w-full" />
              </div>
            )}
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
            <button
              onClick={save}
              disabled={saving || !form.student_id || !form.summary.trim()}
              className="btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              Save communication
            </button>
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search communications..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          <select
            value={sourceFilter}
            onChange={e => setSourceFilter(e.target.value as any)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-600"
          >
            <option value="all">All types</option>
            {(Object.entries(SOURCE_CONFIG) as [CommunicationSource, any][]).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
          <select
            value={priorityFilter}
            onChange={e => setPriorityFilter(e.target.value as any)}
            className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 text-slate-600"
          >
            <option value="all">All priorities</option>
            {(Object.entries(PRIORITY_CONFIG) as [CommunicationPriority, any][]).map(([key, cfg]) => (
              <option key={key} value={key}>{cfg.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Count */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">
          Showing <span className="font-semibold text-slate-800">{filtered.length}</span> of <span className="font-semibold text-slate-800">{comms.length}</span> communications
        </span>
        {(sourceFilter !== 'all' || priorityFilter !== 'all' || timeFilter !== 'all' || search || studentParam) && (
          <button
            onClick={() => { setSourceFilter('all'); setPriorityFilter('all'); setTimeFilter('all'); setSearch(''); setSearchParams({}); }}
            className="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1"
          >
            <X className="w-3.5 h-3.5" /> Clear filters
          </button>
        )}
      </div>

      {/* Communications feed */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="card-premium py-16 flex flex-col items-center gap-3 text-slate-400">
            <MessageCircle className="w-10 h-10 text-slate-300" />
            <p className="text-sm font-medium">No communications match your filters.</p>
            {(sourceFilter !== 'all' || priorityFilter !== 'all' || search) && (
              <button onClick={() => { setSourceFilter('all'); setPriorityFilter('all'); setSearch(''); }} className="text-xs text-teal-600 hover:underline">Clear filters</button>
            )}
          </div>
        )}
        {filtered.map(comm => {
          const cfg = SOURCE_CONFIG[comm.source];
          const pcfg = PRIORITY_CONFIG[comm.priority];
          const student = studentMap.get(comm.student_id);
          const Icon = cfg.icon;
          const isExpanded = expandedId === comm.id;
          const today = new Date().toISOString().slice(0, 10);
          const followUpOverdue = comm.follow_up_required && comm.follow_up_date && comm.follow_up_date < today;
          const followUpDueToday = comm.follow_up_required && comm.follow_up_date === today;
          const isActioned = actionedComms.has(comm.id);

          // Minimised actioned card
          if (isActioned) {
            return (
              <div key={comm.id} className="card-premium overflow-hidden opacity-60 hover:opacity-100 transition-opacity">
                <div className="px-5 py-3 flex items-center gap-3">
                  <div className={`w-7 h-7 rounded-lg ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0`}>
                    <Icon className={`w-3.5 h-3.5 ${cfg.text}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {student && <span className="text-xs font-semibold text-slate-700">{student.name}</span>}
                      <span className="text-xs text-slate-400">{new Date(comm.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      <span className="text-xs text-slate-500 truncate">{comm.summary}</span>
                    </div>
                  </div>
                  <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 shrink-0">
                    <CheckCircle className="w-3 h-3" /> Action created
                  </span>
                </div>
              </div>
            );
          }

          return (
            <div key={comm.id} className={`card-premium overflow-hidden transition-all ${comm.priority === 'urgent' ? 'border-l-4 border-l-red-400' : comm.priority === 'high' ? 'border-l-4 border-l-amber-400' : ''}`}>
              <div
                className="px-5 py-4 flex items-start gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : comm.id)}
              >
                {/* Source icon */}
                <div className={`w-9 h-9 rounded-xl ${cfg.bg} border ${cfg.border} flex items-center justify-center shrink-0 mt-0.5`}>
                  <Icon className={`w-4 h-4 ${cfg.text}`} />
                </div>

                {/* Main content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-3 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {student ? (
                          <Link
                            to={`/students/${student.id}`}
                            onClick={e => e.stopPropagation()}
                            className="text-sm font-bold text-slate-900 hover:text-teal-700 transition-colors"
                          >
                            {student.name}
                          </Link>
                        ) : (
                          <span className="text-sm font-bold text-slate-900">{comm.student_id}</span>
                        )}
                        {student && <span className="text-xs text-slate-400">{student.year_group}</span>}
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.label}</span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${pcfg.bg} ${pcfg.text}`}>{pcfg.label}</span>
                        {followUpOverdue && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">Follow-up overdue</span>
                        )}
                        {followUpDueToday && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">Follow-up today</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed line-clamp-2">{comm.summary}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-slate-500 whitespace-nowrap">{new Date(comm.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{comm.staff_member}</p>
                    </div>
                  </div>
                </div>

                <button className="shrink-0 p-1 rounded text-slate-300 hover:text-slate-500 transition-colors mt-1">
                  {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>
              </div>

              {/* Expanded detail */}
              {isExpanded && (() => {
                const suggestion = suggestAction(comm);
                const auto = autoAssign(comm, student);
                const dueDateFmt = new Date(auto.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                const isUrgent = suggestion.priority === 'urgent' || suggestion.priority === 'high';

                function quickCreate() {
                  if (demoMode) {
                    const reviewDate = new Date();
                    reviewDate.setDate(reviewDate.getDate() + 14);
                    const newAction: Intervention = {
                      id: `comm-${Date.now()}`,
                      student_id: comm.student_id,
                      assigned_to: auto.assigned_to,
                      created_by: currentUser,
                      action_type: suggestion.action_type,
                      priority: suggestion.priority,
                      status: 'open',
                      due_date: auto.due_date,
                      review_date: reviewDate.toISOString().split('T')[0],
                      notes: `Created from communication (${new Date(comm.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}): ${comm.summary}`,
                      outcome: null,
                      created_at: new Date().toISOString(),
                    };
                    addDemoIntervention(newAction);
                    setDemoSignalStatus(comm.student_id, 'action_in_progress');
                  }
                  setActionedComms(prev => new Set([...prev, comm.id]));
                  setExpandedId(null);
                  addToast(`Action created: ${suggestion.action_type} assigned to ${auto.assigned_to}.`, 'success');
                }

                return (
                  <div className="px-5 pb-4 pt-0 border-t border-slate-100 bg-slate-50/50">
                    <div className="pt-4 space-y-4">
                      {/* Top row: summary + notes */}
                      <div className="grid sm:grid-cols-2 gap-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Full summary</p>
                          <p className="text-sm text-slate-700 leading-relaxed">{comm.summary}</p>
                        </div>
                        {comm.notes ? (
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Internal notes</p>
                            <p className="text-sm text-slate-600 leading-relaxed italic">{comm.notes}</p>
                          </div>
                        ) : (
                          <div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Detail</p>
                            <div className="space-y-1 text-xs text-slate-600">
                              <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-slate-400" /><span>{new Date(comm.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
                              <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-slate-400" /><span>{comm.staff_member}</span></div>
                              {comm.follow_up_required && comm.follow_up_date && (
                                <div className={`flex items-center gap-2 ${followUpOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>Follow-up: {new Date(comm.follow_up_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>

                      {/* SS Recommendation card */}
                      <div className={`rounded-xl border overflow-hidden ${isUrgent ? 'border-red-200' : 'border-teal-200'}`}>
                        <div className={`px-4 py-2.5 flex items-center gap-2 ${isUrgent ? 'bg-red-600' : 'bg-teal-600'}`}>
                          <Sparkles className="w-3.5 h-3.5 text-white/80 shrink-0" />
                          <span className="text-xs font-bold text-white tracking-wide uppercase">Student Signal Recommendation</span>
                          <span className={`ml-auto text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${isUrgent ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'}`}>{suggestion.priority}</span>
                        </div>
                        <div className={`px-4 pt-3 pb-1 ${isUrgent ? 'bg-red-50' : 'bg-teal-50/60'}`}>
                          <p className={`text-xs leading-relaxed mb-3 ${isUrgent ? 'text-red-800' : 'text-teal-800'}`}>{suggestion.suggestion}</p>
                          <div className="grid grid-cols-2 gap-2 mb-3">
                            <div className={`rounded-lg px-3 py-2 ${isUrgent ? 'bg-red-100/60' : 'bg-teal-100/60'}`}>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Action type</p>
                              <p className={`text-xs font-semibold ${isUrgent ? 'text-red-800' : 'text-teal-800'}`}>{suggestion.action_type}</p>
                            </div>
                            <div className={`rounded-lg px-3 py-2 ${isUrgent ? 'bg-red-100/60' : 'bg-teal-100/60'}`}>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Assign to</p>
                              <p className={`text-xs font-semibold ${isUrgent ? 'text-red-800' : 'text-teal-800'}`}>{auto.assigned_to || 'Not determined'}</p>
                            </div>
                            <div className={`rounded-lg px-3 py-2 ${isUrgent ? 'bg-red-100/60' : 'bg-teal-100/60'}`}>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Due by</p>
                              <p className={`text-xs font-semibold ${isUrgent ? 'text-red-800' : 'text-teal-800'}`}>{dueDateFmt}</p>
                            </div>
                            <div className={`rounded-lg px-3 py-2 ${isUrgent ? 'bg-red-100/60' : 'bg-teal-100/60'}`}>
                              <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">Priority</p>
                              <p className={`text-xs font-semibold capitalize ${isUrgent ? 'text-red-800' : 'text-teal-800'}`}>{suggestion.priority}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 pb-3">
                            <button
                              onClick={e => { e.stopPropagation(); quickCreate(); }}
                              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-white transition-colors ${isUrgent ? 'bg-red-600 hover:bg-red-700' : 'bg-teal-600 hover:bg-teal-700'}`}
                            >
                              <Zap className="w-3.5 h-3.5" /> Quick create
                            </button>
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                setCreateActionFor(comm);
                                setActionForm({ action_type: suggestion.action_type, notes: comm.summary, assigned_to: auto.assigned_to, due_date: auto.due_date, priority: suggestion.priority });
                                setAutoAssigned({ assigned_to: auto.is_auto, due_date: true });
                              }}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 transition-colors"
                            >
                              <ClipboardList className="w-3.5 h-3.5" /> Review &amp; edit
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Bottom: detail + student link */}
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 text-xs text-slate-600">
                          <div className="flex items-center gap-2"><Calendar className="w-3.5 h-3.5 text-slate-400" /><span>{new Date(comm.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></div>
                          <div className="flex items-center gap-2"><User className="w-3.5 h-3.5 text-slate-400" /><span>{comm.staff_member}</span></div>
                          {comm.follow_up_required && comm.follow_up_date && (
                            <div className={`flex items-center gap-2 ${followUpOverdue ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
                              <Clock className="w-3.5 h-3.5" />
                              <span>Follow-up: {new Date(comm.follow_up_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                            </div>
                          )}
                        </div>
                        {student && (
                          <Link
                            to={`/students/${student.id}`}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 text-white text-xs font-semibold hover:bg-teal-700 transition-colors shrink-0"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            Student profile
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      {/* Architecture note */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl px-5 py-4 flex items-start gap-3">
        <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700 leading-relaxed">
          <span className="font-semibold">Future integration:</span> This module is architected to support inbound email processing via Resend, Mailgun, SendGrid, or Microsoft 365. Forwarded emails to pastoral@school, attendance@school, or safeguarding@school will automatically create communication records, match students, and trigger timeline events.
        </div>
      </div>

      {/* Create Action from Communication modal */}
      {createActionFor && (() => {
        const student = studentMap.get(createActionFor.student_id);
        const ACTION_TYPES = ['Pastoral meeting', 'Parent/carer contact', 'Tutor check-in', 'Welfare check', 'Attendance meeting', 'Behaviour review', 'SEND review', 'Multi-agency meeting', 'Safeguarding referral', 'Mentoring', 'Restorative conversation'];
        const canSave = actionForm.action_type && actionForm.assigned_to && actionForm.due_date;
        const suggestion = suggestAction(createActionFor);
        const isUrgentSuggestion = suggestion.priority === 'urgent';
        const fullyAutoFilled = autoAssigned.assigned_to && autoAssigned.due_date;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCreateActionFor(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    Create Action
                    {fullyAutoFilled && <span className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 font-semibold border border-teal-500/30"><Sparkles className="w-2.5 h-2.5" /> SS Auto-filled</span>}
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">{student?.name} · {SOURCE_CONFIG[createActionFor.source].label} · {new Date(createActionFor.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
                </div>
                <button onClick={() => setCreateActionFor(null)} className="p-2 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
              </div>
              <div className="px-6 py-5 space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs text-slate-600 leading-relaxed">
                  <span className="font-semibold text-slate-700">Communication:</span> {createActionFor.summary}
                </div>

                {/* Smart suggestion banner */}
                <div className={`flex items-start gap-2.5 rounded-xl p-3 border text-xs leading-snug ${isUrgentSuggestion ? 'bg-red-50 border-red-200 text-red-800' : 'bg-teal-50 border-teal-200 text-teal-800'}`}>
                  <AlertTriangle className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${isUrgentSuggestion ? 'text-red-500' : 'text-teal-500'}`} />
                  <div>
                    <span className="font-bold">Suggested: </span>{suggestion.action_type}
                    <span className={`ml-1.5 inline-flex px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wide ${isUrgentSuggestion ? 'bg-red-100 text-red-700' : 'bg-teal-100 text-teal-700'}`}>{suggestion.priority}</span>
                    <p className="mt-0.5 opacity-80">{suggestion.suggestion}</p>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Action type <span className="text-red-500">*</span></label>
                  <select value={actionForm.action_type} onChange={e => setActionForm(f => ({ ...f, action_type: e.target.value }))} className="input-premium w-full">
                    {ACTION_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Assign to <span className="text-red-500">*</span></label>
                    {autoAssigned.assigned_to && (
                      <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold">
                        <Zap className="w-2.5 h-2.5" /> SS assigned
                        <button onClick={() => setAutoAssigned(a => ({ ...a, assigned_to: false }))} className="ml-0.5 text-teal-400 hover:text-teal-600"><X className="w-2.5 h-2.5" /></button>
                      </span>
                    )}
                  </div>
                  <select
                    value={actionForm.assigned_to}
                    onChange={e => { setActionForm(f => ({ ...f, assigned_to: e.target.value })); setAutoAssigned(a => ({ ...a, assigned_to: false })); }}
                    className={`input-premium w-full ${autoAssigned.assigned_to ? 'border-teal-300 bg-teal-50/40' : ''}`}
                  >
                    <option value="">Select staff member...</option>
                    {DEMO_STAFF.map(s => <option key={s.name} value={s.name}>{s.name} — {s.role}</option>)}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-bold text-slate-600 uppercase tracking-wider">Due date <span className="text-red-500">*</span></label>
                      {autoAssigned.due_date && (
                        <span className="flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold">
                          <Zap className="w-2.5 h-2.5" /> SS set
                          <button onClick={() => setAutoAssigned(a => ({ ...a, due_date: false }))} className="ml-0.5 text-teal-400 hover:text-teal-600"><X className="w-2.5 h-2.5" /></button>
                        </span>
                      )}
                    </div>
                    <input
                      type="date"
                      value={actionForm.due_date}
                      onChange={e => { setActionForm(f => ({ ...f, due_date: e.target.value })); setAutoAssigned(a => ({ ...a, due_date: false })); }}
                      className={`input-premium w-full ${autoAssigned.due_date ? 'border-teal-300 bg-teal-50/40' : ''}`}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Priority</label>
                    <select value={actionForm.priority} onChange={e => setActionForm(f => ({ ...f, priority: e.target.value as any }))} className="input-premium w-full">
                      {['low','medium','high','urgent'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Notes</label>
                  <textarea rows={2} value={actionForm.notes} onChange={e => setActionForm(f => ({ ...f, notes: e.target.value }))} className="input-premium w-full resize-none text-sm" placeholder="Context from this communication..." />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
                <button onClick={() => setCreateActionFor(null)} className="btn-secondary flex-1">Cancel</button>
                <button
                  disabled={!canSave}
                  onClick={() => {
                    if (demoMode) {
                      const today = new Date();
                      const reviewDate = new Date(today);
                      reviewDate.setDate(today.getDate() + 14);
                      const newAction: Intervention = {
                        id: `comm-${Date.now()}`,
                        student_id: createActionFor.student_id,
                        assigned_to: actionForm.assigned_to,
                        created_by: currentUser,
                        action_type: actionForm.action_type,
                        priority: actionForm.priority,
                        status: 'open',
                        due_date: actionForm.due_date || today.toISOString().split('T')[0],
                        review_date: reviewDate.toISOString().split('T')[0],
                        notes: actionForm.notes
                          ? `${actionForm.notes}\n\nCreated from communication (${new Date(createActionFor.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}): ${createActionFor.summary}`
                          : `Created from communication (${new Date(createActionFor.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}): ${createActionFor.summary}`,
                        outcome: null,
                        created_at: new Date().toISOString(),
                      };
                      addDemoIntervention(newAction);
                      setDemoSignalStatus(createActionFor.student_id, 'action_in_progress');
                    }
                    setActionedComms(prev => new Set([...prev, createActionFor.id]));
                    addToast(`Action created: ${actionForm.action_type} for ${student?.name || 'student'} — assigned to ${actionForm.assigned_to}.`, 'success');
                    navigate(`/students/${createActionFor.student_id}?tab=actions`);
                    setCreateActionFor(null);
                  }}
                  className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {fullyAutoFilled ? <><Sparkles className="w-4 h-4" /> Confirm &amp; Create</> : <><Save className="w-4 h-4" /> Create action</>}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

