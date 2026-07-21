import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ExplainButton from '../components/ExplainButton';
import { explainAssignment, explainPriority } from '../lib/explain';
import { supabase } from '../lib/supabase';
import { getStudents, getInterventions, getAnalysisForStudent, DEMO_STAFF, addDemoIntervention, updateDemoIntervention, setDemoSignalStatus, subscribeToInterventions, dismissDemoIntervention, getDemoDismissedIds, getHOYYearGroup, mapOwnerToStaffName } from '../lib/data';
import type { Intervention, Student, AnalysisResult } from '../types';
import { Toast, useToast } from '../components/Toast';
import ActionDrawer from '../components/ActionDrawer';
import GlobalPriorityBar from '../components/GlobalPriorityBar';
import { isStudentInScope } from '../lib/permissions';
import { triggerReanalysis } from '../lib/analysistrigger';
import {
  Plus, Search, X, CheckCircle, Clock, TrendingDown, ArrowRight, Filter,
  ArrowUpRight, ArrowDownRight, Minus, BarChart3, ChevronDown, ChevronUp,
  AlertTriangle, RefreshCw, MessageSquare, Eye, SlidersHorizontal, User,
  AlertCircle, ExternalLink, Archive, RotateCcw, Activity, Lightbulb,
} from 'lucide-react';

const ACTION_TYPES = [
  'Pastoral meeting', 'Parent/carer contact', 'Tutor check-in', 'SEND review',
  'Attendance meeting', 'Behaviour report', 'Careers guidance meeting',
  'Safeguarding referral', 'Mentoring', 'Restorative conversation', 'Subject teacher follow-up',
];

function matchActionType(suggested: string, analysis: AnalysisResult): string {
  const lower = suggested.toLowerCase();
  if (lower.includes('safeguard')) return 'Safeguarding referral';
  if (lower.includes('send') || lower.includes('ehcp')) return 'SEND review';
  if (lower.includes('parent') || lower.includes('carer') || lower.includes('contact')) return 'Parent/carer contact';
  if (lower.includes('attendance')) return 'Attendance meeting';
  if (lower.includes('mentor')) return 'Mentoring';
  if (lower.includes('career')) return 'Careers guidance meeting';
  if (lower.includes('restorative')) return 'Restorative conversation';
  if (lower.includes('tutor') || lower.includes('check-in')) return 'Tutor check-in';
  if (lower.includes('subject')) return 'Subject teacher follow-up';
  if (lower.includes('behaviour') || lower.includes('report')) return 'Behaviour report';
  if (analysis.signal_category === 'red' || analysis.risk_level === 'red') return 'Pastoral meeting';
  return 'Pastoral meeting';
}

function derivePriority(analysis: AnalysisResult): 'low' | 'medium' | 'high' | 'urgent' {
  const score = analysis.risk_score || 0;
  const cat = analysis.signal_category || analysis.risk_level || '';
  if (cat === 'red' && score >= 80) return 'urgent';
  if (cat === 'red') return 'high';
  if (cat === 'amber' || score >= 50) return 'medium';
  return 'low';
}

function deriveDueDate(priority: string): string {
  const d = new Date();
  if (priority === 'urgent') d.setDate(d.getDate() + 2);
  else if (priority === 'high') d.setDate(d.getDate() + 5);
  else if (priority === 'medium') d.setDate(d.getDate() + 10);
  else d.setDate(d.getDate() + 14);
  return d.toISOString().split('T')[0];
}

type OutcomeAchieved = 'achieved' | 'partially' | 'not_achieved';

const OUTCOME_ACHIEVED_CFG: Record<OutcomeAchieved, { label: string; bg: string; text: string }> = {
  achieved:     { label: 'Achieved',          bg: 'bg-emerald-100', text: 'text-emerald-700' },
  partially:    { label: 'Partially achieved', bg: 'bg-amber-100',   text: 'text-amber-700' },
  not_achieved: { label: 'Not achieved',       bg: 'bg-red-100',     text: 'text-red-700' },
};

function getCreatorTitle(createdBy: string | null | undefined): string {
  if (!createdBy) return '';
  const m = createdBy.match(/\(([^)]+)\)/);
  if (m) return m[1];
  if (/system/i.test(createdBy)) return 'System';
  return '';
}

function PriorityBadge({ priority }: { priority: string }) {
  const cls =
    priority === 'urgent' ? 'bg-red-100 text-red-700 border border-red-200' :
    priority === 'high'   ? 'bg-orange-100 text-orange-700 border border-orange-200' :
    priority === 'medium' ? 'bg-blue-100 text-blue-700 border border-blue-200' :
    'bg-slate-100 text-slate-600 border border-slate-200';
  return <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${cls}`}>{priority}</span>;
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === 'completed'       ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' :
    status === 'in_progress'     ? 'bg-amber-100 text-amber-700 border border-amber-200' :
    status === 'awaiting_review' ? 'bg-orange-100 text-orange-700 border border-orange-200' :
    status === 'escalated'       ? 'bg-red-100 text-red-700 border border-red-200' :
    status === 'cancelled'       ? 'bg-slate-100 text-slate-500 border border-slate-200' :
    'bg-blue-100 text-blue-700 border border-blue-200';
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${cls}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function generateId() {
  return 'local_' + Math.random().toString(36).slice(2) + Date.now();
}

export default function Interventions() {
  const { profile, demoMode } = useAuth();
  const { toasts, addToast, dismissToast } = useToast();

  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [students, setStudents]           = useState<Student[]>([]);
  const [tab, setTab]                     = useState<'all' | 'mine' | 'dismissed'>('all');
  const [filter, setFilter]               = useState<'all' | 'suggested' | 'active' | 'open' | 'in_progress' | 'completed' | 'escalated'>('active');
  // Priority filter is independent of status filter
  const [priorityFilter, setPriorityFilter] = useState<'urgent' | 'high' | 'medium' | 'low' | null>(null);
  const [search, setSearch]               = useState('');
  const [showNew, setShowNew]             = useState(false);
  const [loading, setLoading]             = useState(true);
  const [expandedNotes, setExpandedNotes] = useState<Set<string>>(new Set());
  const [expandedAudit, setExpandedAudit] = useState<Set<string>>(new Set());
  const [completeModal, setCompleteModal] = useState<string | null>(null);
  const [reassignTarget, setReassignTarget] = useState<Intervention | null>(null);
  const [reassignTo, setReassignTo] = useState('');
  const [completeForm, setCompleteForm]   = useState<{
    outcomeText: string;
    outcomeAchieved: OutcomeAchieved;
    outcomeCategory: string;
    nextStep: string;
    afterAttendance: string;
    afterBehaviour: string;
    overrideReason: string;
    showOverride: boolean;
  }>({
    outcomeText: '', outcomeAchieved: 'achieved', outcomeCategory: '',
    nextStep: '', afterAttendance: '', afterBehaviour: '',
    overrideReason: '', showOverride: false,
  });
  const [lastCreated, setLastCreated]     = useState<Intervention | null>(null);
  const [duplicateWarning, setDuplicateWarning] = useState<{ existing: Intervention; student: Student | undefined } | null>(null);

  // Escalation modal
  const [escalationModal, setEscalationModal] = useState<string | null>(null);
  const [escalationForm, setEscalationForm] = useState({
    escalateTo: '',
    reason: '',
    priority: 'high' as 'high' | 'urgent',
    notes: '',
    reviewDate: '',
  });

  // Action drawer
  const [drawerActionId, setDrawerActionId] = useState<string | null>(null);
  const [drawerAnalysis, setDrawerAnalysis] = useState<AnalysisResult | null>(null);
  const [notificationBanner, setNotificationBanner] = useState<string | null>(null);

  // Dismissed tracking — initialized from module store so it survives navigation
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => getDemoDismissedIds());
  const [dismissedReasons, setDismissedReasons] = useState<Record<string, string>>({});

  // Highlight from notification deep link
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  type SortCol = 'name' | 'year' | 'action_type' | 'priority' | 'assigned_to' | 'status' | 'due';
  type SortDir = 'asc' | 'desc';
  const [sortCol, setSortCol] = useState<SortCol | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  function handleSort(col: SortCol) {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());

  const [newForm, setNewForm] = useState({
    student_id: '',
    action_type: ACTION_TYPES[0],
    priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent',
    due_date: '',
    notes: '',
    assigned_to: '',
    assigned_role: '',
  });

  const effectiveSchoolId = demoMode ? null : (profile as any)?.school_id;
  const currentUserName = (profile as any)?.full_name || 'Demo User';
  const currentRole = (profile as any)?.role || '';

  const userYearGroup = currentRole === 'head_of_year' ? getHOYYearGroup(currentUserName) : null;
  const userForm = currentRole === 'tutor' ? '10B' : null;
  const canSeeAllAssignments = ['admin', 'slt', 'dsl', 'sendco'].includes(currentRole);
  const isScopedRole = currentRole === 'head_of_year' || currentRole === 'tutor';

  // Match assigned_to against the current user — handles exact names and role-suffix variants
  // e.g. "Mr Ahmed" matches "Mr Ahmed (DSL)", "Ms Harris" matches "Ms Harris (HOY Y10)"
  function isAssignedToMe(assignedTo: string | null | undefined): boolean {
    if (!assignedTo) return false;
    if (assignedTo === currentUserName) return true;
    if (assignedTo.startsWith(currentUserName + ' ')) return true;
    // DSL: also own all safeguarding referrals and interventions assigned to any DSL name variant
    if (currentRole === 'dsl') {
      return assignedTo.toLowerCase().includes('(dsl)') ||
        assignedTo.toLowerCase().includes('ahmed');
    }
    return false;
  }

  const [auditLog, setAuditLog] = useState<Record<string, Array<{ action: string; by: string; at: string }>>>({});

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const statusParam = searchParams.get('status');
    // ?status=open from global bar means "all active" to match bar count definition
    if (statusParam === 'open') setFilter('active');
    else if (statusParam === 'in_progress') setFilter('in_progress');
    else if (statusParam === 'completed') setFilter('completed');
    else if (statusParam === 'escalated') setFilter('escalated');
    const studentParam = searchParams.get('student');
    if (studentParam) {
      setNewForm((prev) => ({ ...prev, student_id: studentParam }));
      setShowNew(true);
    }
    const highlightParam = searchParams.get('highlight');
    if (highlightParam) {
      setHighlightId(highlightParam);
      // Reset filters so the highlighted row is guaranteed to be visible
      setFilter('all');
      setTab('all');
      setPriorityFilter(null);
      // Don't auto-open the drawer — let the row flash first so it's visible.
      setNotificationBanner('Opened from notification');
    }
    const mineParam = searchParams.get('mine');
    if (mineParam === 'true') setTab('mine');
  }, [searchParams]);

  const activeFilterChips: { label: string; key: string }[] = [];
  const statusParam   = searchParams.get('status');
  const priorityParam = searchParams.get('priority');
  const studentParam  = searchParams.get('student');
  if (statusParam)   activeFilterChips.push({ label: statusParam.replace('_', ' '), key: 'status' });
  if (priorityParam) activeFilterChips.push({ label: priorityParam + ' priority', key: 'priority' });
  if (priorityFilter) activeFilterChips.push({ label: priorityFilter + ' priority', key: 'priorityFilter' });
  if (studentParam) {
    const sName = students.find((s) => s.id === studentParam)?.name;
    if (sName) activeFilterChips.push({ label: sName, key: 'student' });
  }

  function removeFilterParam(key: string) {
    if (key === 'priorityFilter') { setPriorityFilter(null); return; }
    const next = new URLSearchParams(searchParams);
    next.delete(key);
    setSearchParams(next);
    if (key === 'status') setFilter('all');
  }

  useEffect(() => {
    async function load() {
      const [int, st] = await Promise.all([
        getInterventions(effectiveSchoolId),
        getStudents(effectiveSchoolId),
      ]);
      setInterventions(int);
      setStudents(st);
      setLoading(false);
    }
    load();
  }, [effectiveSchoolId]);

  // Re-merge whenever another component adds or updates a demo intervention
  useEffect(() => {
    if (!demoMode) return;
    return subscribeToInterventions(() => {
      getInterventions(null).then(int => setInterventions(int));
    });
  }, [demoMode]);

  // Auto-scroll to highlighted row; wait one extra tick so the ref is attached after render
  useEffect(() => {
    if (!highlightId || loading) return;
    const raf = requestAnimationFrame(() => {
      if (highlightRef.current) {
        highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    });
    // Open the drawer after the flash has played for a moment
    const drawerTimer = setTimeout(() => {
      setDrawerActionId(highlightId);
    }, 800);
    const clearTimer = setTimeout(() => setHighlightId(null), 4000);
    return () => { cancelAnimationFrame(raf); clearTimeout(drawerTimer); clearTimeout(clearTimer); };
  }, [highlightId, loading]);

  // Load analysis when drawer opens so it can show evidence + suggestions
  useEffect(() => {
    if (!drawerActionId) { setDrawerAnalysis(null); return; }
    const action = interventions.find(i => i.id === drawerActionId);
    if (!action) return;
    getAnalysisForStudent(effectiveSchoolId, action.student_id).then(a => setDrawerAnalysis(a));
  }, [drawerActionId]);

  // Prefill create form when student is selected using intelligence
  useEffect(() => {
    if (!newForm.student_id || !showNew) return;
    getAnalysisForStudent(effectiveSchoolId, newForm.student_id).then(analysis => {
      if (!analysis) return;
      const student = students.find(s => s.id === newForm.student_id);
      const suggestedAction = analysis.suggested_pastoral_action || analysis.suggested_staff_action || '';
      const actionType = matchActionType(suggestedAction, analysis);
      const suggestedOwner = analysis.suggested_owner || '';
      const owner = canSeeAllAssignments ? mapOwnerToStaffName(suggestedOwner, student?.year_group) : '';
      const ownerStaff = DEMO_STAFF.find(s => s.name === owner);
      const priority = derivePriority(analysis);
      const dueDate = deriveDueDate(priority);
      const reasons = (analysis.key_reasons || []).slice(0, 2).join('. ');
      const notes = reasons ? `Intelligence: ${reasons}` : '';
      setNewForm(f => ({
        ...f,
        action_type: actionType || f.action_type,
        priority,
        due_date: dueDate,
        notes: notes || f.notes,
        assigned_to: owner || f.assigned_to,
        assigned_role: ownerStaff?.role || f.assigned_role,
      }));
    });
  }, [newForm.student_id, showNew]);

  function logAudit(id: string, action: string, by?: string) {
    const entry = { action, by: by || currentUserName, at: new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) };
    setAuditLog((prev) => ({ ...prev, [id]: [...(prev[id] || []), entry] }));
  }

  function handleStaffSelect(name: string) {
    const staff = DEMO_STAFF.find(s => s.name === name);
    setNewForm(f => ({ ...f, assigned_to: name, assigned_role: staff?.role || '' }));
  }

  function reassignAction(id: string, name: string, role: string) {
    const prev = interventions.find(i => i.id === id);
    const prevAssigned = prev?.assigned_to;
    const patch = { assigned_to: name, assigned_role: role };
    setInterventions(cur => cur.map(i => i.id === id ? { ...i, ...patch } : i));
    logAudit(id, `Reassigned to ${name}`);
    if (demoMode) updateDemoIntervention(id, patch);
    else if ((profile as any)?.school_id) supabase.from('interventions').update({ assigned_to: name }).eq('id', id);
    addToast(`Reassigned to ${name}.`, 'success', () => {
      setInterventions(cur => cur.map(i => i.id === id ? { ...i, assigned_to: prevAssigned || '' } : i));
      if (demoMode) updateDemoIntervention(id, { assigned_to: prevAssigned || '' });
      logAudit(id, `Reassignment undone — reverted to ${prevAssigned || '—'}`);
    });
  }

  function changeDueDate(id: string, date: string) {
    const prev = interventions.find(i => i.id === id)?.due_date;
    setInterventions(cur => cur.map(i => i.id === id ? { ...i, due_date: date } : i));
    logAudit(id, `Due date changed to ${date || 'cleared'}`);
    if (demoMode) updateDemoIntervention(id, { due_date: date || null });
    else if ((profile as any)?.school_id) supabase.from('interventions').update({ due_date: date || null }).eq('id', id);
    addToast('Due date updated.', 'success', () => {
      setInterventions(cur => cur.map(i => i.id === id ? { ...i, due_date: prev || null } : i));
      if (demoMode) updateDemoIntervention(id, { due_date: prev || null });
      logAudit(id, 'Due date change undone');
    });
  }

  function changeReviewDate(id: string, date: string) {
    const prev = interventions.find(i => i.id === id)?.review_date;
    setInterventions(cur => cur.map(i => i.id === id ? { ...i, review_date: date } : i));
    logAudit(id, `Review date changed to ${date || 'cleared'}`);
    if (demoMode) updateDemoIntervention(id, { review_date: date || null });
    else if ((profile as any)?.school_id) supabase.from('interventions').update({ review_date: date || null }).eq('id', id);
    addToast('Review date updated.', 'success', () => {
      setInterventions(cur => cur.map(i => i.id === id ? { ...i, review_date: prev || null } : i));
      if (demoMode) updateDemoIntervention(id, { review_date: prev || null });
      logAudit(id, 'Review date change undone');
    });
  }

  function escalateAction(id: string) {
    setEscalationModal(id);
    setEscalationForm({
      escalateTo: '',
      reason: '',
      priority: 'high',
      notes: '',
      reviewDate: '',
    });
  }

  function submitEscalation() {
    if (!escalationModal || !escalationForm.escalateTo || !escalationForm.reason || !escalationForm.notes.trim() || !escalationForm.reviewDate) return;
    const prev = interventions.find(i => i.id === escalationModal);
    const now = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
    const updates: Partial<Intervention> = {
      status: 'escalated',
      priority: escalationForm.priority as Intervention['priority'],
      assigned_to: escalationForm.escalateTo,
      review_date: escalationForm.reviewDate,
      escalated_to: escalationForm.escalateTo,
      escalation_reason: escalationForm.reason,
      escalated_by: currentUserName,
      escalated_at: now,
      escalation_notes: escalationForm.notes,
      prev_status: prev?.status || 'in_progress',
    };
    if (demoMode) updateDemoIntervention(escalationModal, updates);
    else if ((profile as any)?.school_id) supabase.from('interventions').update(updates).eq('id', escalationModal);
    const escalatedId = escalationModal;
    // Update signal status so queue/dashboard reflect escalation
    if (demoMode && prev) setDemoSignalStatus(prev.student_id, 'escalated');
    setInterventions(cur => cur.map(i => i.id === escalatedId ? { ...i, ...updates } : i));
    logAudit(escalatedId, `Escalated to ${escalationForm.escalateTo} — reason: ${escalationForm.reason}`);
    setEscalationModal(null);
    addToast(`Escalated to ${escalationForm.escalateTo}. Undo?`, 'success', () => {
      if (prev) {
        setInterventions(cur => cur.map(i => i.id === escalatedId ? { ...prev } : i));
        logAudit(escalatedId, `Escalation undone by ${currentUserName}`);
        addToast('Escalation undone — action returned to previous state.');
      }
    });
  }

  async function createIntervention(forceCreate = false) {
    if (!newForm.student_id) { addToast('Please select a student.', 'error'); return; }

    // Duplicate signal protection
    if (!forceCreate) {
      const existing = interventions.find(
        (i) => i.student_id === newForm.student_id &&
               i.action_type === newForm.action_type &&
               i.status !== 'completed' &&
               i.status !== 'cancelled'
      );
      if (existing) {
        setDuplicateWarning({ existing, student: studentNameMap.get(newForm.student_id) });
        return;
      }
    }

    const newItem: Intervention = {
      id: generateId(),
      student_id: newForm.student_id,
      assigned_to: newForm.assigned_to || currentUserName,
      assigned_role: newForm.assigned_role || null,
      action_type: newForm.action_type,
      priority: newForm.priority,
      status: 'open',
      due_date: newForm.due_date || null,
      notes: newForm.notes || null,
      outcome: null,
      created_at: new Date().toISOString(),
    };

    if (!demoMode && (profile as any)?.school_id) {
      const { data, error } = await supabase
        .from('interventions')
        .insert({
          school_id: (profile as any).school_id,
          student_id: newForm.student_id,
          assigned_to: newForm.assigned_to || currentUserName,
          assigned_role: newForm.assigned_role || null,
          action_type: newForm.action_type,
          priority: newForm.priority,
          status: 'open',
          due_date: newForm.due_date || null,
          notes: newForm.notes || null,
        })
        .select()
        .single();
      if (!error && data) newItem.id = (data as Intervention).id;
    } else if (demoMode) {
      addDemoIntervention(newItem);
    }

    setInterventions((prev) => [newItem, ...prev]);
    setLastCreated(newItem);
    logAudit(newItem.id, `Created — assigned to ${newItem.assigned_to || 'unassigned'}`);
    setShowNew(false);
    setNewForm({ student_id: '', action_type: ACTION_TYPES[0], priority: 'medium', due_date: '', notes: '', assigned_to: '', assigned_role: '' });
    addToast('Action created and assigned.');
  }

  async function updateStatus(id: string, status: Intervention['status']) {
    const prev = interventions.find(i => i.id === id);
    const prevStatus = prev?.status;
    if (demoMode) updateDemoIntervention(id, { status });
    else if ((profile as any)?.school_id) await supabase.from('interventions').update({ status }).eq('id', id);
    setInterventions((prev) => prev.map((i) => (i.id === id ? { ...i, status } : i)));
    // When accepting a suggested action, mark signal as action_in_progress so student leaves Signal Queue
    if (demoMode && prev && status === 'open' && prevStatus === 'suggested') {
      setDemoSignalStatus(prev.student_id, 'action_in_progress');
    }
    logAudit(id, `Status changed to ${status.replace(/_/g, ' ')}`);
    addToast(`Status updated to ${status.replace(/_/g, ' ')}.`, 'success', () => {
      if (prevStatus) {
        setInterventions((cur) => cur.map((i) => (i.id === id ? { ...i, status: prevStatus } : i)));
        if (demoMode) updateDemoIntervention(id, { status: prevStatus });
        logAudit(id, `Status reverted to ${prevStatus.replace(/_/g, ' ')} (undo)`);
      }
    });
  }

  function dismissAction(id: string) {
    const dismissed = interventions.find(i => i.id === id);
    setDismissedIds(s => new Set([...s, id]));
    setDismissedReasons(r => ({ ...r, [id]: 'Dismissed by ' + currentUserName }));
    if (demoMode) {
      dismissDemoIntervention(id);
      // If no active interventions remain, reset signal so student returns to Signal Queue for re-evaluation
      if (dismissed) {
        const remaining = interventions.filter(i =>
          i.student_id === dismissed.student_id && i.id !== id &&
          !['completed', 'closed', 'cancelled', 'suggested'].includes(i.status)
        );
        if (remaining.length === 0) {
          setDemoSignalStatus(dismissed.student_id, 'new');
        }
      }
    }
    logAudit(id, 'Dismissed');
    addToast('Action dismissed.', 'success', () => {
      setDismissedIds(s => { const n = new Set(s); n.delete(id); return n; });
      logAudit(id, 'Restored (undo)');
    });
    if (drawerActionId === id) setDrawerActionId(null);
  }

  async function completeIntervention() {
    if (!completeModal || !completeForm.outcomeText.trim()) return;
    const prevIntervention = interventions.find(i => i.id === completeModal);
    const now = new Date().toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });

    // Map outcomeCategory to status and outcome_achieved
    const categoryToAchieved: Record<string, OutcomeAchieved> = {
      'Significant Improvement': 'achieved',
      'Some Improvement': 'achieved',
      'No Change': 'partially',
      'Deteriorated': 'not_achieved',
      'Escalation Required': 'not_achieved',
      'Resolved': 'achieved',
    };
    const outcomeAchieved = categoryToAchieved[completeForm.outcomeCategory] || completeForm.outcomeAchieved;

    // Determine final status based on next step
    let finalStatus: Intervention['status'] = 'completed';
    if (completeForm.nextStep === 'escalate') finalStatus = 'escalated';

    const outcomeDisplay = completeForm.outcomeCategory
      ? `${completeForm.outcomeCategory}${completeForm.overrideReason ? ' (overridden)' : ''}`
      : completeForm.outcomeText;

    const updates: Partial<Intervention> = {
      outcome: completeForm.outcomeText,
      outcome_achieved: outcomeAchieved,
      outcome_notes: outcomeDisplay,
      outcome_status: completeForm.outcomeCategory === 'Resolved' || completeForm.outcomeCategory === 'Significant Improvement' ? 'resolved'
        : completeForm.outcomeCategory === 'Some Improvement' ? 'improving'
        : completeForm.outcomeCategory === 'Deteriorated' || completeForm.outcomeCategory === 'Escalation Required' ? 'escalating'
        : 'no_change',
      status: finalStatus,
      completed_by: currentUserName,
      completed_at: now,
      prev_status: prevIntervention?.status || 'in_progress',
      after_attendance: completeForm.afterAttendance ? parseFloat(completeForm.afterAttendance) : null,
      after_behaviour: completeForm.afterBehaviour ? parseFloat(completeForm.afterBehaviour) : null,
    };
    if (demoMode) updateDemoIntervention(completeModal, updates);
    else if ((profile as any)?.school_id) await supabase.from('interventions').update(updates).eq('id', completeModal);
    const completedId = completeModal;
    // Compute updated intervention list (including the one just completed)
    const updatedInterventions = interventions.map((i) => (i.id === completedId ? { ...i, ...updates } : i));
    // Update signal status based on outcome and whether all actions for this student are now closed
    if (demoMode && prevIntervention) {
      const studentId = prevIntervention.student_id;
      const remainingActive = updatedInterventions.filter(i =>
        i.student_id === studentId &&
        !['completed', 'closed', 'cancelled', 'suggested'].includes(i.status)
      );
      const allDone = remainingActive.length === 0;
      let sigSt: string;
      if (completeForm.nextStep === 'escalate') {
        sigSt = 'escalated';
      } else if (allDone && (completeForm.outcomeCategory === 'Resolved' || completeForm.nextStep === 'close' || completeForm.outcomeCategory === 'Significant Improvement')) {
        sigSt = 'resolved';
      } else if (allDone) {
        sigSt = 'review_due';
      } else {
        // Other interventions still active — signal stays in progress
        sigSt = 'action_in_progress';
      }
      setDemoSignalStatus(studentId, sigSt);
    }
    setInterventions(updatedInterventions);
    const auditMsg = `Completed — ${completeForm.outcomeCategory || outcomeAchieved}${completeForm.overrideReason ? ` | Override: ${completeForm.overrideReason}` : ''}`;
    logAudit(completedId, auditMsg);
    setCompleteModal(null);
    setCompleteForm({ outcomeText: '', outcomeAchieved: 'achieved', outcomeCategory: '', nextStep: '', afterAttendance: '', afterBehaviour: '', overrideReason: '', showOverride: false });
    triggerReanalysis(effectiveSchoolId);
    addToast('Action marked complete. Undo?', 'success', () => {
      if (prevIntervention) {
        setInterventions((cur) => cur.map((i) => (i.id === completedId ? { ...prevIntervention } : i)));
        logAudit(completedId, `Completion undone by ${currentUserName}`);
        addToast('Completion undone — action returned to previous status.');
      }
    });
  }

  function undoCompletion(id: string) {
    const prev = interventions.find(i => i.id === id);
    if (!prev) return;
    const prevStatus = (prev.prev_status as Intervention['status']) || 'in_progress';
    const updates: Partial<Intervention> = {
      status: prevStatus,
      outcome: null,
      outcome_achieved: null,
      outcome_notes: null,
      completed_by: null,
      completed_at: null,
    };
    setInterventions(cur => cur.map(i => i.id === id ? { ...i, ...updates } : i));
    if (demoMode) updateDemoIntervention(id, updates);
    logAudit(id, `Completion undone by ${currentUserName} — returned to ${prevStatus}`);
    addToast(`Action returned to ${prevStatus.replace(/_/g, ' ')}.`, 'success');
  }

  function reassignIntervention(intervention: Intervention, newAssignee: string) {
    const updates: Partial<Intervention> = { assigned_to: newAssignee, status: 'assigned' };
    if (demoMode) updateDemoIntervention(intervention.id, updates);
    else if (effectiveSchoolId) supabase.from('interventions').update(updates).eq('id', intervention.id);
    setInterventions(cur => cur.map(i => i.id === intervention.id ? { ...i, ...updates } : i));
    logAudit(intervention.id, `Reassigned to ${newAssignee} by ${currentUserName}`);
    setReassignTarget(null);
    setReassignTo('');
    addToast(`Reassigned to ${newAssignee}.`, 'success');
  }

  const studentNameMap = new Map<string, Student>();
  students.forEach((s) => studentNameMap.set(s.id, s));

  // For HOY/tutor: scope the 'all' tab to their year group / form
  function isInRoleScope(i: Intervention): boolean {
    if (!isScopedRole) return true;
    const s = studentNameMap.get(i.student_id);
    if (!s) return false;
    return isStudentInScope(currentRole, s, userYearGroup, userForm);
  }

  const tabFiltered = tab === 'mine'
    ? interventions.filter(i => isAssignedToMe(i.assigned_to) && !dismissedIds.has(i.id) && !['escalated', 'completed', 'closed', 'cancelled'].includes(i.status))
    : tab === 'dismissed'
    ? interventions.filter(i => dismissedIds.has(i.id))
    : interventions.filter(i => !dismissedIds.has(i.id) && isInRoleScope(i));

  const ACTIVE_STATUSES = ['suggested', 'open', 'in_progress', 'awaiting_review'] as const;

  // Effective priority: local priorityFilter takes precedence over URL param
  const effectivePriorityFilter = priorityFilter || priorityParam;

  const filtered = tabFiltered.filter((i) => {
    if (filter === 'suggested' && i.status !== 'suggested') return false;
    if (filter === 'active' && !ACTIVE_STATUSES.includes(i.status as typeof ACTIVE_STATUSES[number])) return false;
    if (filter === 'escalated' && i.status !== 'escalated') return false;
    if (filter !== 'all' && filter !== 'active' && filter !== 'escalated' && filter !== 'suggested' && i.status !== filter) return false;
    if (effectivePriorityFilter && i.priority !== effectivePriorityFilter) return false;
    if (studentParam && i.student_id !== studentParam) return false;
    if (search) {
      const term = search.toLowerCase();
      const name = studentNameMap.get(i.student_id)?.name || '';
      return i.action_type.toLowerCase().includes(term) || name.toLowerCase().includes(term) || (i.notes || '').toLowerCase().includes(term) || (i.assigned_to || '').toLowerCase().includes(term);
    }
    return true;
  });

  const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };

  const sorted = useMemo(() => {
    if (!sortCol) return filtered;
    return [...filtered].sort((a, b) => {
      let av = '';
      let bv = '';
      if (sortCol === 'name') {
        av = studentNameMap.get(a.student_id)?.name || '';
        bv = studentNameMap.get(b.student_id)?.name || '';
      } else if (sortCol === 'year') {
        av = studentNameMap.get(a.student_id)?.year_group || '';
        bv = studentNameMap.get(b.student_id)?.year_group || '';
      } else if (sortCol === 'priority') {
        const pa = PRIORITY_ORDER[a.priority] ?? 9;
        const pb = PRIORITY_ORDER[b.priority] ?? 9;
        return sortDir === 'asc' ? pa - pb : pb - pa;
      } else if (sortCol === 'action_type') {
        av = a.action_type || '';
        bv = b.action_type || '';
      } else if (sortCol === 'assigned_to') {
        av = a.assigned_to || '';
        bv = b.assigned_to || '';
      } else if (sortCol === 'due') {
        av = a.due_date || '9999';
        bv = b.due_date || '9999';
      } else if (sortCol === 'status') {
        const STATUS_ORDER: Record<string, number> = { suggested: 0, open: 1, in_progress: 2, awaiting_review: 3, escalated: 4, completed: 5, cancelled: 6 };
        const sa = STATUS_ORDER[a.status] ?? 9;
        const sb = STATUS_ORDER[b.status] ?? 9;
        return sortDir === 'asc' ? sa - sb : sb - sa;
      }
      const cmp = av.localeCompare(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortCol, sortDir, studentNameMap]);

  const suggestedCount = interventions.filter((i) => i.status === 'suggested').length;
  const activeCount    = interventions.filter((i) => ['suggested', 'open', 'in_progress', 'awaiting_review'].includes(i.status)).length;
  const openCount      = interventions.filter((i) => i.status === 'open').length;
  const inProgCount    = interventions.filter((i) => i.status === 'in_progress').length;
  const completedCount = interventions.filter((i) => i.status === 'completed').length;
  const escalatedCount = interventions.filter((i) => i.status === 'escalated').length;
  const urgentCount    = interventions.filter((i) => i.priority === 'urgent' && !['completed', 'suggested'].includes(i.status)).length;
  const myCount        = interventions.filter((i) => isAssignedToMe(i.assigned_to) && !['completed', 'escalated', 'closed', 'cancelled'].includes(i.status)).length;

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" /></div>;
  }

  const completingItem = completeModal ? interventions.find(i => i.id === completeModal) : null;
  const completingStudent = completingItem ? studentNameMap.get(completingItem.student_id) : null;

  return (
    <div className="space-y-8">
      <Toast toasts={toasts} onDismiss={dismissToast} />
      <GlobalPriorityBar />
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Actions</h1>
          <p className="text-sm text-slate-500 mt-1">Agreed work assigned to staff. Track ownership and deadlines.</p>
        </div>
        <button onClick={() => setShowNew(!showNew)} className="btn-primary">
          <Plus className="w-4 h-4" />
          New action
        </button>
      </div>

      {/* Active filter banner */}
      {activeFilterChips.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
          <SlidersHorizontal className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="text-xs font-semibold text-teal-700 mr-1">Filtered by:</span>
          {activeFilterChips.map((chip) => (
            <span key={chip.key} className="flex items-center gap-1 bg-white border border-teal-200 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">
              {chip.label}
              <button onClick={() => removeFilterParam(chip.key)}><X className="w-3 h-3" /></button>
            </span>
          ))}
          <span className="text-xs text-teal-600 font-medium">— showing {filtered.length} of {interventions.filter(i => !dismissedIds.has(i.id)).length}</span>
          <button onClick={() => { setSearchParams({}); setFilter('all'); setPriorityFilter(null); }} className="ml-auto text-xs text-teal-600 hover:text-teal-800 underline font-medium">Clear all</button>
        </div>
      )}

      {/* Stats — clickable filters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
        {([
          { f: 'suggested' as const,    label: 'Suggested',   count: suggestedCount, icon: <Lightbulb className="w-4 h-4 text-purple-500" />,    num: 'text-purple-600',  title: 'Awaiting acceptance' },
          { f: 'active' as const,       label: 'Active',      count: activeCount,    icon: <Activity className="w-4 h-4 text-blue-500" />,       num: 'text-blue-600',    title: 'Open + In Progress + Awaiting Review' },
          { f: 'open' as const,         label: 'Open',        count: openCount,      icon: <Clock className="w-4 h-4 text-sky-500" />,           num: 'text-sky-600',     title: 'Accepted, not yet started' },
          { f: 'in_progress' as const,  label: 'In Progress', count: inProgCount,    icon: <RefreshCw className="w-4 h-4 text-amber-500" />,     num: 'text-amber-600',   title: 'Currently in progress' },
          { f: 'completed' as const,    label: 'Completed',   count: completedCount, icon: <CheckCircle className="w-4 h-4 text-emerald-500" />, num: 'text-emerald-600', title: 'Closed out' },
        ]).map(({ f, label, count, icon, num, title }) => (
          <button
            key={f}
            onClick={() => { setFilter(filter === f ? 'all' : f); setPriorityFilter(null); setSearchParams({}); }}
            title={title}
            className={`card-premium p-4 text-left transition-all hover:ring-2 hover:ring-teal-200 ${filter === f ? 'ring-2 ring-teal-400 bg-teal-50/30' : ''}`}
          >
            <div className="flex items-center justify-between mb-2">{icon}<span className={`text-xl font-bold ${num}`}>{count}</span></div>
            <p className="text-xs font-semibold text-slate-700">{label}</p>
          </button>
        ))}
        {/* Escalated */}
        <button
          onClick={() => { setFilter(filter === 'escalated' ? 'all' : 'escalated'); setPriorityFilter(null); setSearchParams({}); }}
          title="Filter escalated actions"
          className={`card-premium p-4 border-l-4 border-l-red-500 text-left transition-all hover:ring-2 hover:ring-red-200 ${filter === 'escalated' ? 'ring-2 ring-red-400 bg-red-50/30' : ''} ${escalatedCount > 0 ? '' : 'opacity-60'}`}
        >
          <div className="flex items-center justify-between mb-2">
            <AlertTriangle className="w-4 h-4 text-red-500" />
            <span className="text-xl font-bold text-red-600">{escalatedCount}</span>
          </div>
          <p className="text-xs font-semibold text-slate-700">Escalated</p>
        </button>
        <button
          onClick={() => { setPriorityFilter(priorityFilter === 'urgent' ? null : 'urgent'); setFilter('all'); setSearchParams({}); }}
          className={`card-premium p-4 border-l-4 border-l-orange-500 text-left transition-all hover:ring-2 hover:ring-orange-200 ${priorityFilter === 'urgent' ? 'ring-2 ring-orange-400 bg-orange-50/30' : ''}`}
          title="Filter by urgent priority"
        >
          <div className="flex items-center justify-between mb-2"><AlertCircle className="w-4 h-4 text-orange-500" /><span className="text-xl font-bold text-orange-600">{urgentCount}</span></div>
          <p className="text-xs font-semibold text-slate-700">Urgent</p>
        </button>
        <button
          onClick={() => setTab(tab === 'mine' ? 'all' : 'mine')}
          className={`card-premium p-4 border-l-4 border-l-teal-500 text-left transition-all hover:ring-2 hover:ring-teal-200 ${tab === 'mine' ? 'ring-2 ring-teal-400 bg-teal-50/30' : ''}`}
        >
          <div className="flex items-center justify-between mb-2"><User className="w-4 h-4 text-teal-500" /><span className="text-xl font-bold text-teal-600">{myCount}</span></div>
          <p className="text-xs font-semibold text-slate-700">My queue</p>
        </button>
      </div>

      {/* Latest created confirmation */}
      {lastCreated && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-500 mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold text-emerald-800 text-sm mb-2">Action created and assigned</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-1 text-xs text-emerald-700">
                  <span><span className="font-medium">Type:</span> {lastCreated.action_type}</span>
                  <span><span className="font-medium">Priority:</span> {lastCreated.priority}</span>
                  <span><span className="font-medium">Due:</span> {lastCreated.due_date || 'Not set'}</span>
                  <span><span className="font-medium">Assigned:</span> {lastCreated.assigned_to}</span>
                </div>
              </div>
            </div>
            <button onClick={() => setLastCreated(null)} className="p-1 rounded hover:bg-emerald-100 text-emerald-500 transition-colors shrink-0"><X className="w-4 h-4" /></button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showNew && (
        <div className="card-premium p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Create new action</h3>
              <p className="text-xs text-slate-500 mt-0.5">A one-off task assigned to a staff member. For ongoing support plans, scroll down to Interventions.</p>
            </div>
            <button onClick={() => setShowNew(false)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
          </div>
          <div className="grid sm:grid-cols-2 gap-5">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Student</label>
              <select value={newForm.student_id} onChange={(e) => setNewForm({ ...newForm, student_id: e.target.value })} className="input-premium">
                <option value="">Select student...</option>
                {students
                  .filter(s => isStudentInScope(currentRole, s, userYearGroup, userForm))
                  .map((s) => <option key={s.id} value={s.id}>{s.name} ({s.year_group})</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Action type</label>
              <select value={newForm.action_type} onChange={(e) => setNewForm({ ...newForm, action_type: e.target.value })} className="input-premium">
                {ACTION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Priority</label>
              <select value={newForm.priority} onChange={(e) => setNewForm({ ...newForm, priority: e.target.value as any })} className="input-premium">
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Due date <span className="text-slate-400 normal-case font-normal">(optional)</span></label>
              <input type="date" value={newForm.due_date} onChange={(e) => setNewForm({ ...newForm, due_date: e.target.value })} className="input-premium" />
            </div>
            {canSeeAllAssignments ? (
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Assigned to</label>
              <select value={newForm.assigned_to} onChange={e => handleStaffSelect(e.target.value)} className="input-premium">
                <option value="">Select staff member...</option>
                {DEMO_STAFF.map(s => (
                  <option key={s.name} value={s.name}>{s.name} — {s.role}</option>
                ))}
              </select>
              {newForm.assigned_role && (
                <p className="text-xs text-slate-400 mt-1">Role: <span className="font-semibold text-slate-600">{newForm.assigned_role}</span></p>
              )}
            </div>
            ) : (
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Assigned to</label>
              <div className="input-premium bg-slate-50 text-slate-500 cursor-not-allowed">{currentUserName || 'You'}</div>
              <p className="text-xs text-slate-400 mt-1">Actions you create are assigned to you. Contact your DSL or admin to assign elsewhere.</p>
            </div>
            )}
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Notes</label>
              <textarea value={newForm.notes} onChange={(e) => setNewForm({ ...newForm, notes: e.target.value })} className="input-premium" rows={3} placeholder="Add context, concerns or instructions..." />
            </div>
          </div>
          <div className="mt-5 flex justify-end gap-3">
            <button onClick={() => setShowNew(false)} className="btn-secondary">Cancel</button>
            <button onClick={() => createIntervention(false)} className="btn-primary" disabled={!newForm.student_id}>
              <CheckCircle className="w-4 h-4" />
              Create intervention
            </button>
          </div>
        </div>
      )}

      {/* Tab + Filter row */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* My Queue / All / Dismissed tab */}
        <div className="flex border border-slate-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => setTab('all')}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${tab === 'all' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            {currentRole === 'head_of_year' && userYearGroup
              ? userYearGroup
              : currentRole === 'tutor' && userForm
              ? `Form ${userForm}`
              : 'All'}
          </button>
          <button
            onClick={() => setTab('mine')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${tab === 'mine' ? 'bg-teal-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <User className="w-3.5 h-3.5" />
            My Queue
            {myCount > 0 && (
              <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === 'mine' ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-700'}`}>{myCount}</span>
            )}
          </button>
          <button
            onClick={() => setTab('dismissed')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium transition-colors ${tab === 'dismissed' ? 'bg-slate-500 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Archive className="w-3.5 h-3.5" />
            Dismissed
            {dismissedIds.size > 0 && (
              <span className={`ml-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full ${tab === 'dismissed' ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'}`}>{dismissedIds.size}</span>
            )}
          </button>
        </div>

        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Search actions, students, staff..." />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['all', 'open', 'in_progress', 'completed'] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${filter === f ? 'bg-teal-50 text-teal-700 border-teal-200' : 'text-slate-500 hover:bg-slate-50 border-transparent'}`}>
              {f === 'all' ? 'All' : f === 'in_progress' ? 'In progress' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* My Queue banner */}
      {tab === 'mine' && (
        <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <User className="w-4 h-4 text-teal-600 shrink-0" />
          <p className="text-xs text-teal-700">
            Showing interventions assigned to <span className="font-semibold">{currentUserName}</span>
            {currentRole === 'dsl' ? ' (including all safeguarding referrals)' : ''}.
            {filtered.length === 0 ? ' Your queue is clear.' : ` ${filtered.filter(i => i.status !== 'completed').length} active.`}
          </p>
        </div>
      )}

      {/* Dismissed banner */}
      {tab === 'dismissed' && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <Archive className="w-4 h-4 text-slate-500 shrink-0" />
          <p className="text-xs text-slate-600">
            Showing <span className="font-semibold">{dismissedIds.size}</span> dismissed action{dismissedIds.size !== 1 ? 's' : ''}. Use Restore to re-activate.
          </p>
        </div>
      )}

      {/* Showing X of Y + active filter summary */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-500">
          Showing <span className="font-semibold text-slate-800">{filtered.length}</span> of <span className="font-semibold text-slate-800">{interventions.length}</span> actions
          {filter !== 'all' && <span className="ml-1 text-teal-600 font-medium">· filtered by {filter.replace('_', ' ')}</span>}
          {tab === 'mine' && <span className="ml-1 text-teal-600 font-medium">· my queue</span>}
        </span>
        {(filter !== 'all' || tab === 'mine' || search) && (
          <button
            onClick={() => { setFilter('all'); setTab('all'); setSearch(''); setSearchParams({}); setPriorityFilter(null); }}
            className="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="card-premium overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-premium">
            <thead>
              <tr>
                {(['name', 'year'] as SortCol[]).map(col => (
                  <th key={col} className={sortCol === col ? 'bg-teal-50' : ''}>
                    <button onClick={() => handleSort(col)} className={`flex items-center gap-1.5 font-semibold transition-colors ${sortCol === col ? 'text-teal-700' : 'text-slate-600 hover:text-slate-900'}`}>
                      {col === 'name' ? 'Student' : 'Year'}
                      <span className={`flex flex-col -space-y-0.5 ${sortCol === col ? 'opacity-100' : 'opacity-40'}`}>
                        <ChevronUp   className={`w-2.5 h-2.5 ${sortCol === col && sortDir === 'asc'  ? 'text-teal-600' : 'text-slate-400'}`} />
                        <ChevronDown className={`w-2.5 h-2.5 ${sortCol === col && sortDir === 'desc' ? 'text-teal-600' : 'text-slate-400'}`} />
                      </span>
                    </button>
                  </th>
                ))}
                <th className={sortCol === 'action_type' ? 'bg-teal-50' : ''}>
                  <button onClick={() => handleSort('action_type')} className={`flex items-center gap-1.5 font-semibold transition-colors ${sortCol === 'action_type' ? 'text-teal-700' : 'text-slate-600 hover:text-slate-900'}`}>
                    Action type
                    <span className={`flex flex-col -space-y-0.5 ${sortCol === 'action_type' ? 'opacity-100' : 'opacity-40'}`}>
                      <ChevronUp   className={`w-2.5 h-2.5 ${sortCol === 'action_type' && sortDir === 'asc'  ? 'text-teal-600' : 'text-slate-400'}`} />
                      <ChevronDown className={`w-2.5 h-2.5 ${sortCol === 'action_type' && sortDir === 'desc' ? 'text-teal-600' : 'text-slate-400'}`} />
                    </span>
                  </button>
                </th>
                {canSeeAllAssignments && (
                  <th className={sortCol === 'assigned_to' ? 'bg-teal-50' : ''}>
                    <button onClick={() => handleSort('assigned_to')} className={`flex items-center gap-1.5 font-semibold transition-colors ${sortCol === 'assigned_to' ? 'text-teal-700' : 'text-slate-600 hover:text-slate-900'}`}>
                      Assigned to
                      <span className={`flex flex-col -space-y-0.5 ${sortCol === 'assigned_to' ? 'opacity-100' : 'opacity-40'}`}>
                        <ChevronUp   className={`w-2.5 h-2.5 ${sortCol === 'assigned_to' && sortDir === 'asc'  ? 'text-teal-600' : 'text-slate-400'}`} />
                        <ChevronDown className={`w-2.5 h-2.5 ${sortCol === 'assigned_to' && sortDir === 'desc' ? 'text-teal-600' : 'text-slate-400'}`} />
                      </span>
                    </button>
                  </th>
                )}
                <th className={sortCol === 'priority' ? 'bg-teal-50' : ''}>
                  <button onClick={() => handleSort('priority')} className={`flex items-center gap-1.5 font-semibold transition-colors ${sortCol === 'priority' ? 'text-teal-700' : 'text-slate-600 hover:text-slate-900'}`}>
                    Priority
                    <span className={`flex flex-col -space-y-0.5 ${sortCol === 'priority' ? 'opacity-100' : 'opacity-40'}`}>
                      <ChevronUp   className={`w-2.5 h-2.5 ${sortCol === 'priority' && sortDir === 'asc'  ? 'text-teal-600' : 'text-slate-400'}`} />
                      <ChevronDown className={`w-2.5 h-2.5 ${sortCol === 'priority' && sortDir === 'desc' ? 'text-teal-600' : 'text-slate-400'}`} />
                    </span>
                  </button>
                </th>
                <th className={sortCol === 'status' ? 'bg-teal-50' : ''}>
                  <button onClick={() => handleSort('status')} className={`flex items-center gap-1.5 font-semibold transition-colors ${sortCol === 'status' ? 'text-teal-700' : 'text-slate-600 hover:text-slate-900'}`}>
                    Status
                    <span className={`flex flex-col -space-y-0.5 ${sortCol === 'status' ? 'opacity-100' : 'opacity-40'}`}>
                      <ChevronUp   className={`w-2.5 h-2.5 ${sortCol === 'status' && sortDir === 'asc'  ? 'text-teal-600' : 'text-slate-400'}`} />
                      <ChevronDown className={`w-2.5 h-2.5 ${sortCol === 'status' && sortDir === 'desc' ? 'text-teal-600' : 'text-slate-400'}`} />
                    </span>
                  </button>
                </th>
                <th className={sortCol === 'due' ? 'bg-teal-50' : ''}>
                  <button onClick={() => handleSort('due')} className={`flex items-center gap-1.5 font-semibold transition-colors ${sortCol === 'due' ? 'text-teal-700' : 'text-slate-600 hover:text-slate-900'}`}>
                    Due
                    <span className={`flex flex-col -space-y-0.5 ${sortCol === 'due' ? 'opacity-100' : 'opacity-40'}`}>
                      <ChevronUp   className={`w-2.5 h-2.5 ${sortCol === 'due' && sortDir === 'asc'  ? 'text-teal-600' : 'text-slate-400'}`} />
                      <ChevronDown className={`w-2.5 h-2.5 ${sortCol === 'due' && sortDir === 'desc' ? 'text-teal-600' : 'text-slate-400'}`} />
                    </span>
                  </button>
                </th>
                <th>Notes / Outcome</th>
                <th>Workflow</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((i) => {
                const student = studentNameMap.get(i.student_id);
                const notesExpanded = expandedNotes.has(i.id);
                const notesText = i.notes || '';
                const notesLong = notesText.length > 60;
                const outcomeAchieved = (i as any).outcome_achieved as OutcomeAchieved | undefined;
                const isDismissed = dismissedIds.has(i.id);
                const isHighlighted = highlightId === i.id && i.status !== 'completed';
                const evidenceOpen = expandedEvidence.has(i.id);

                // Evidence lines for DSL/SLT/HOY: show risk context inline
                const evidenceItems: string[] = [];
                if (student) {
                  if ((student.attendance_pct ?? 95) < 90) evidenceItems.push(`Att: ${student.attendance_pct ?? '?'}%`);
                  if ((student.behaviour_score ?? 0) > 10) evidenceItems.push(`Beh: ${student.behaviour_score} pts`);
                  if (student.send_status) evidenceItems.push(`SEND: ${student.send_status}`);
                  if (student.risk_level === 'red') evidenceItems.push('Risk: Red');
                  else if (student.risk_level === 'amber') evidenceItems.push('Risk: Amber');
                  if (student.pupil_premium) evidenceItems.push('PP');
                }

                return (
                  <React.Fragment key={i.id}>
                  <tr
                    ref={isHighlighted ? highlightRef : null}
                    className={`cursor-pointer hover:bg-slate-50/50 transition-colors ${
                      isHighlighted ? 'bg-teal-50 ring-2 ring-inset ring-teal-400 animate-flash-ring' : ''
                    } ${isDismissed ? 'opacity-60 bg-slate-50' : ''} ${
                      i.status === 'escalated' ? 'bg-red-50/60 border-l-4 border-l-red-400' : ''
                    }`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button, a, select, input')) return;
                      setDrawerActionId(i.id);
                      setNotificationBanner(null);
                    }}
                  >
                    <td>
                      <Link to={`/students/${i.student_id}`} className="font-semibold text-slate-800 hover:text-teal-700 transition-colors">{student?.name || i.student_id}</Link>
                      {evidenceItems.length > 0 && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setExpandedEvidence(prev => { const n = new Set(prev); evidenceOpen ? n.delete(i.id) : n.add(i.id); return n; }); }}
                          className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-400 hover:text-teal-600 transition-colors"
                          title="Show student context"
                        >
                          {evidenceOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                          context
                        </button>
                      )}
                    </td>
                    <td className="text-slate-500 text-sm whitespace-nowrap">{student?.year_group || '—'}</td>
                    <td className="font-medium text-slate-800">
                      {i.action_type}
                      {i.source === 'auto' && <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-teal-600 bg-teal-50 border border-teal-200 rounded px-1 py-px">Auto</span>}
                    </td>
                    {canSeeAllAssignments && (
                    <td>
                      {i.assigned_to ? (
                        <div>
                          <div className="text-sm font-medium text-slate-800">{i.assigned_to}</div>
                          {(i as any).assigned_role && <div className="text-xs text-slate-400">{(i as any).assigned_role}</div>}
                          {i.created_by && (
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              From: {i.created_by.replace(/\s*\([^)]*\)/, '')}
                              {getCreatorTitle(i.created_by) && <span className="ml-1 font-medium text-slate-500">· {getCreatorTitle(i.created_by)}</span>}
                            </div>
                          )}
                        </div>
                      ) : <span className="text-slate-400 text-sm">—</span>}
                    </td>
                    )}
                    <td>
                      <PriorityBadge priority={i.priority} />
                      <ExplainButton
                        explanation={explainPriority(i.priority, null, i.signal_types as string[] ?? [], i.due_date ?? null)}
                        label="Why?"
                        variant="icon"
                        tone="slate"
                      />
                    </td>
                    <td>
                      <StatusBadge status={i.status} />
                      {i.status === 'awaiting_review' && (
                        <div className="text-[9px] text-orange-600 font-medium mt-0.5">Outcome required</div>
                      )}
                    </td>
                    <td className="text-slate-600 text-sm whitespace-nowrap">{i.due_date || '—'}</td>
                    <td className="max-w-[200px]">
                      <div className={`text-slate-600 text-sm ${notesExpanded ? '' : 'line-clamp-2'}`}>{notesText || '—'}</div>
                      {notesLong && (
                        <button
                          onClick={() => setExpandedNotes((prev) => { const next = new Set(prev); if (notesExpanded) next.delete(i.id); else next.add(i.id); return next; })}
                          className="text-xs text-teal-600 hover:text-teal-700 font-medium mt-0.5 flex items-center gap-0.5"
                        >
                          {notesExpanded ? <><ChevronUp className="w-3 h-3" /> Less</> : <><ChevronDown className="w-3 h-3" /> More</>}
                        </button>
                      )}
                      {i.status === 'completed' && (
                        <div className="mt-1.5 space-y-0.5">
                          {(() => {
                            const cat = i.outcome_notes || '';
                            const cfg =
                              cat.includes('Significant Improvement') || cat.includes('Resolved') ? { label: `Completed — ${cat.includes('Resolved') ? 'Resolved' : 'Improved'}`, cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' }
                              : cat.includes('Some Improvement') ? { label: 'Completed — Some Improvement', cls: 'bg-teal-100 text-teal-700 border-teal-200' }
                              : cat.includes('No Change') ? { label: 'Completed — No Change', cls: 'bg-amber-100 text-amber-700 border-amber-200' }
                              : cat.includes('Deteriorated') ? { label: 'Completed — Deteriorated', cls: 'bg-red-100 text-red-700 border-red-200' }
                              : cat.includes('Escalation Required') ? { label: 'Completed — Escalated', cls: 'bg-red-100 text-red-700 border-red-200' }
                              : cat.includes('overridden') ? { label: 'Completed — Overridden', cls: 'bg-blue-100 text-blue-700 border-blue-200' }
                              : outcomeAchieved ? { label: OUTCOME_ACHIEVED_CFG[outcomeAchieved].label, cls: `${OUTCOME_ACHIEVED_CFG[outcomeAchieved].bg} ${OUTCOME_ACHIEVED_CFG[outcomeAchieved].text} border-current` }
                              : { label: 'Completed', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
                            return (
                              <span className={`inline-block text-[10px] px-2 py-0.5 rounded-full font-bold border ${cfg.cls}`}>
                                {cfg.label}
                              </span>
                            );
                          })()}
                          {i.outcome && <div className="text-xs text-slate-600 italic line-clamp-2 mt-0.5">{i.outcome}</div>}
                          {i.completed_by && (
                            <div className="text-[10px] text-slate-400">by {i.completed_by}{i.completed_at ? ` · ${i.completed_at}` : ''}</div>
                          )}
                        </div>
                      )}
                      {i.status === 'escalated' && i.escalated_to && (
                        <div className="mt-1.5 space-y-0.5">
                          <div className="text-[10px] font-bold text-red-600 uppercase tracking-wide">Escalated</div>
                          <div className="text-xs text-slate-700">To: <span className="font-medium">{i.escalated_to}</span></div>
                          {i.escalation_reason && <div className="text-xs text-slate-500">Reason: {i.escalation_reason}</div>}
                          {i.escalated_by && <div className="text-[10px] text-slate-400">by {i.escalated_by}{i.escalated_at ? ` · ${i.escalated_at}` : ''}</div>}
                          {i.review_date && <div className="text-[10px] text-slate-400">Review: {i.review_date}</div>}
                        </div>
                      )}
                    </td>
                    <td>
                      <div className="flex items-center gap-1 flex-wrap">
                        {(() => {
                          const isOversightRole = ['admin', 'slt', 'dsl', 'sendco'].includes(currentRole);
                          const isAssignee = isAssignedToMe(i.assigned_to);
                          const canAct = isAssignee || isOversightRole;
                          const canReassign = isOversightRole && !isAssignee;
                          const isTerminal = ['completed', 'closed', 'cancelled', 'escalated'].includes(i.status);
                          return (
                            <>
                              {i.status === 'suggested' && (canAct || isOversightRole) ? (
                                <button
                                  onClick={() => updateStatus(i.id, 'open')}
                                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-teal-50 hover:bg-teal-100 text-teal-700 border border-teal-200 text-[10px] font-semibold transition-colors"
                                  title="Accept this suggestion — moves it into your active queue"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  <span>Accept</span>
                                </button>
                              ) : i.status === 'completed' ? (
                                <button
                                  onClick={() => undoCompletion(i.id)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors text-[10px] font-medium border border-transparent hover:border-amber-100"
                                  title="Undo completion — return to previous status"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Undo</span>
                                </button>
                              ) : canAct ? (
                                <button
                                  onClick={() => {
                                    const draftOutcome = i.action_type && student
                                      ? `${i.action_type} completed for ${student.name}. ${i.notes ? i.notes.slice(0, 100) : ''}`
                                      : '';
                                    const suggestedNext = i.priority === 'urgent' ? 'escalate' : i.outcome_status === 'improving' ? 'close' : i.outcome_status === 'escalating' ? 'escalate' : '';
                                    const suggestedCategory = i.outcome_status === 'improving' ? 'Some Improvement' : i.outcome_status === 'resolved' ? 'Resolved' : i.outcome_status === 'escalating' ? 'Deteriorated' : '';
                                    setCompleteModal(i.id);
                                    setCompleteForm({ outcomeText: draftOutcome.trim(), outcomeAchieved: 'achieved', outcomeCategory: suggestedCategory, nextStep: suggestedNext, afterAttendance: String(student?.attendance_pct || ''), afterBehaviour: String(student?.behaviour_score || ''), overrideReason: '', showOverride: false });
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors text-[10px] font-medium border border-transparent hover:border-emerald-100"
                                  title="Complete with outcome"
                                >
                                  <CheckCircle className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Complete</span>
                                </button>
                              ) : canReassign && !isTerminal ? (
                                <button
                                  onClick={() => setReassignTarget(i)}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-amber-50 text-amber-500 hover:text-amber-700 transition-colors text-[10px] font-medium border border-transparent hover:border-amber-200"
                                  title="Reassign to another staff member"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Reassign</span>
                                </button>
                              ) : null}
                              {canAct && i.status === 'open' && (
                                <button
                                  onClick={() => updateStatus(i.id, 'in_progress')}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors text-[10px] font-medium border border-transparent hover:border-amber-100"
                                >
                                  <RefreshCw className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">In Progress</span>
                                </button>
                              )}
                              {canAct && i.status === 'in_progress' && (
                                <button
                                  onClick={() => updateStatus(i.id, 'awaiting_review')}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-orange-50 text-slate-400 hover:text-orange-600 transition-colors text-[10px] font-medium border border-transparent hover:border-orange-100"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Await Review</span>
                                </button>
                              )}
                              {i.status === 'escalated' ? (
                                <button
                                  onClick={() => {
                                    const prevStatus = (i.prev_status as Intervention['status']) || 'in_progress';
                                    setInterventions(cur => cur.map(x => x.id === i.id ? { ...x, status: prevStatus, escalated_to: null, escalation_reason: null, escalated_by: null, escalated_at: null, escalation_notes: null } : x));
                                    logAudit(i.id, `Escalation undone by ${currentUserName}`);
                                    addToast('Escalation undone — action returned to previous state.');
                                  }}
                                  className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors text-[10px] font-medium border border-transparent hover:border-amber-100"
                                  title="Undo escalation"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" />
                                  <span className="hidden sm:inline">Undo Esc.</span>
                                </button>
                              ) : (
                                canAct && i.status !== 'completed' && !isDismissed && currentRole !== 'dsl' && (
                                  <button
                                    onClick={() => escalateAction(i.id)}
                                    className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors text-[10px] font-medium border border-transparent hover:border-red-100"
                                    title="Escalate to senior staff"
                                  >
                                    <AlertTriangle className="w-3.5 h-3.5" />
                                    <span className="hidden sm:inline">Escalate</span>
                                  </button>
                                )
                              )}
                            </>
                          );
                        })()}
                        {isDismissed ? (
                          <button
                            onClick={() => {
                              setDismissedIds(s => { const n = new Set(s); n.delete(i.id); return n; });
                              logAudit(i.id, 'Restored from dismissed');
                              addToast('Action restored.', 'success', () => {
                                setDismissedIds(s => new Set([...s, i.id]));
                                logAudit(i.id, 'Restore undone');
                              });
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-teal-50 text-slate-400 hover:text-teal-600 transition-colors text-[10px] font-medium border border-transparent hover:border-teal-100"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span className="hidden sm:inline">Restore</span>
                          </button>
                        ) : (
                          i.status !== 'completed' && i.status !== 'awaiting_review' && (
                            <button
                              onClick={() => dismissAction(i.id)}
                              className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors text-[10px] font-medium border border-transparent hover:border-slate-200"
                              title="Dismiss"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                        <Link to={`/students/${i.student_id}`} className="p-1.5 rounded-lg hover:bg-teal-50 text-slate-400 hover:text-teal-600 transition-colors" title="View student">
                          <ArrowRight className="w-4 h-4" />
                        </Link>
                        {auditLog[i.id]?.length > 0 && (
                          <button
                            onClick={() => setExpandedAudit((prev) => { const next = new Set(prev); if (next.has(i.id)) next.delete(i.id); else next.add(i.id); return next; })}
                            className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                            title="View audit trail"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                  {expandedAudit.has(i.id) && auditLog[i.id]?.length > 0 && (
                    <tr className="bg-slate-50">
                      <td colSpan={canSeeAllAssignments ? 9 : 8} className="px-6 py-3">
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Audit trail</div>
                        <div className="space-y-1">
                          {auditLog[i.id].map((entry, idx) => (
                            <div key={idx} className="flex items-center gap-2 text-xs text-slate-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
                              <span className="font-medium">{entry.action}</span>
                              <span className="text-slate-400">by {entry.by}</span>
                              <span className="text-slate-400 ml-auto">{entry.at}</span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                  {evidenceOpen && student && (
                    <tr className="bg-slate-50/70 border-t-0">
                      <td colSpan={canSeeAllAssignments ? 9 : 8} className="px-6 py-2.5">
                        <div className="flex items-center gap-6 flex-wrap">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student context</span>
                          {(student.attendance_pct ?? 95) < 95 && (
                            <span className={`text-xs font-medium ${(student.attendance_pct ?? 95) < 85 ? 'text-red-600' : (student.attendance_pct ?? 95) < 90 ? 'text-amber-600' : 'text-slate-600'}`}>
                              Attendance: {student.attendance_pct ?? '?'}%
                            </span>
                          )}
                          {(student.behaviour_score ?? 0) > 0 && (
                            <span className={`text-xs font-medium ${(student.behaviour_score ?? 0) > 30 ? 'text-red-600' : (student.behaviour_score ?? 0) > 10 ? 'text-amber-600' : 'text-slate-600'}`}>
                              Behaviour: {student.behaviour_score} pts
                            </span>
                          )}
                          {student.send_status && (
                            <span className="text-xs font-medium text-violet-700">SEND: {student.send_status}</span>
                          )}
                          {student.pupil_premium && (
                            <span className="text-xs font-medium text-blue-600">Pupil Premium</span>
                          )}
                          {student.risk_level && (
                            <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${student.risk_level === 'red' ? 'bg-red-100 text-red-700' : student.risk_level === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                              {student.risk_level} risk
                            </span>
                          )}
                          <Link
                            to={`/students/${i.student_id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="ml-auto text-xs text-teal-600 hover:text-teal-800 font-medium flex items-center gap-1 transition-colors"
                          >
                            Full profile <ArrowRight className="w-3 h-3" />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );              })}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="empty-state">
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mb-3"><Filter className="w-6 h-6 text-slate-400" /></div>
            <p className="text-sm font-medium text-slate-700">{tab === 'mine' ? 'Your queue is clear' : 'No interventions match your filters'}</p>
            <p className="text-xs text-slate-500 mt-1">{tab === 'mine' ? 'No open interventions are assigned to you.' : 'Try adjusting your search or create a new intervention.'}</p>
          </div>
        )}
      </div>

      {/* Impact section */}
      {interventions.filter((i) => i.status === 'completed').length > 0 && (
        <div className="card-premium overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 flex items-center justify-center"><BarChart3 className="w-5 h-5 text-emerald-600" /></div>
            <div>
              <h2 className="font-semibold text-slate-900">Intervention Impact</h2>
              <p className="text-xs text-slate-500">Before vs after metrics for completed interventions</p>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {interventions.filter((i) => i.status === 'completed').slice(0, 6).map((iv) => {
              const student = studentNameMap.get(iv.student_id);
              const baseAtt = (iv as any).baseline_attendance;
              const afterAtt = (iv as any).after_attendance ?? (iv as any).current_attendance;
              const baseBeh = (iv as any).baseline_behaviour;
              const afterBeh = (iv as any).after_behaviour ?? (iv as any).current_behaviour;
              const oa = (iv as any).outcome_achieved as OutcomeAchieved | undefined;
              const hasMetrics = baseAtt || afterAtt || baseBeh || afterBeh;
              return (
                <div key={iv.id} className="px-6 py-4">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{iv.action_type}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {student?.name || iv.student_id} · Assigned to {iv.assigned_to || '—'}
                        {iv.due_date && ` · ${iv.due_date}`}
                      </div>
                      {iv.outcome && <div className="text-xs text-slate-600 mt-1 italic leading-relaxed">{iv.outcome}</div>}
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      {hasMetrics && (
                        <>
                          {baseAtt && afterAtt && (
                            <div className="text-center">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Attendance</div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-500">{baseAtt}%</span>
                                <span className="text-slate-300 text-xs">→</span>
                                <span className="text-sm font-bold text-slate-800">{afterAtt}%</span>
                                {afterAtt > baseAtt ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> : afterAtt < baseAtt ? <ArrowDownRight className="w-3.5 h-3.5 text-red-500" /> : <Minus className="w-3.5 h-3.5 text-slate-400" />}
                              </div>
                            </div>
                          )}
                          {baseBeh !== undefined && afterBeh !== undefined && (
                            <div className="text-center">
                              <div className="text-[10px] text-slate-400 uppercase tracking-wider mb-1">Behaviour pts</div>
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-slate-500">{baseBeh}</span>
                                <span className="text-slate-300 text-xs">→</span>
                                <span className="text-sm font-bold text-slate-800">{afterBeh}</span>
                                {afterBeh < baseBeh ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> : afterBeh > baseBeh ? <ArrowDownRight className="w-3.5 h-3.5 text-red-500" /> : <Minus className="w-3.5 h-3.5 text-slate-400" />}
                              </div>
                            </div>
                          )}
                        </>
                      )}
                      {oa && (
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${OUTCOME_ACHIEVED_CFG[oa].bg} ${OUTCOME_ACHIEVED_CFG[oa].text}`}>
                          {OUTCOME_ACHIEVED_CFG[oa].label}
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

      {/* Escalation modal */}
      {escalationModal && (() => {
        const intervention = interventions.find(i => i.id === escalationModal);
        const student = intervention ? studentNameMap.get(intervention.student_id) : undefined;
        const canSubmit = escalationForm.escalateTo && escalationForm.reason && escalationForm.notes.trim() && escalationForm.reviewDate;
        const ESCALATE_TO = ['Head of Year', 'Pastoral Lead', 'DSL', 'SENDCo', 'SLT', 'Attendance Officer'];
        const REASONS = ['Safeguarding concern', 'No improvement', 'Worsening behaviour', 'Attendance collapse', 'SEND concern', 'Parent/carer issue', 'Staff concern', 'Other'];
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setEscalationModal(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-5 border-b border-slate-100 bg-red-600 text-white flex items-center justify-between sticky top-0">
                <div>
                  <h3 className="font-bold text-base flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" /> Escalate Action
                  </h3>
                  {student && intervention && (
                    <p className="text-xs text-red-100 mt-0.5">{intervention.action_type} · {student.name}</p>
                  )}
                </div>
                <button onClick={() => setEscalationModal(null)} className="p-2 rounded-lg hover:bg-white/10 transition-colors"><X className="w-4 h-4" /></button>
              </div>
              <div className="px-6 py-5 space-y-5">
                {/* Context banner */}
                <div className="bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">
                  Escalating this action will assign it to the selected role, set priority, create a review date, and add it to their queue and the Reviews page.
                </div>

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
                  {escalationForm.escalateTo === 'DSL' && (
                    <p className="text-xs text-amber-600 mt-2 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                      DSL escalation may be marked restricted for safeguarding-related reasons. Only DSL/SLT can view full detail.
                    </p>
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
              </div>
              <div className="px-6 py-4 border-t border-slate-100 flex gap-3 sticky bottom-0 bg-white">
                <button onClick={() => setEscalationModal(null)} className="btn-secondary flex-1">Cancel</button>
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

      {/* Duplicate signal protection modal */}
      {duplicateWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDuplicateWarning(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
            <div className="px-6 py-5 bg-amber-50 border-b border-amber-100 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-base text-amber-900">Existing active case found</h3>
                <p className="text-sm text-amber-700 mt-1">
                  {duplicateWarning.student?.name || 'This student'} already has an active <strong>{duplicateWarning.existing.action_type}</strong> assigned to{' '}
                  <strong>{duplicateWarning.existing.assigned_to || 'unassigned'}</strong>
                  {duplicateWarning.existing.due_date ? ` (due ${duplicateWarning.existing.due_date})` : ''}.
                </p>
              </div>
            </div>
            <div className="px-6 py-5 space-y-3">
              <p className="text-xs text-slate-500">What would you like to do?</p>
              <Link
                to={`/students/${duplicateWarning.existing.student_id}`}
                onClick={() => setDuplicateWarning(null)}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 border-teal-200 bg-teal-50 hover:bg-teal-100 text-teal-800 text-sm font-medium transition-all"
              >
                <ExternalLink className="w-4 h-4 shrink-0" />
                <div>
                  <div className="font-semibold">View existing action</div>
                  <div className="text-xs text-teal-600 font-normal">Open the student profile to manage the active case</div>
                </div>
              </Link>
              <button
                onClick={() => {
                  // Escalate the existing action
                  const updated = { priority: 'urgent' as const, notes: `ESCALATED: ${duplicateWarning.existing.notes || ''}` };
                  setInterventions((prev) => prev.map((i) => i.id === duplicateWarning.existing.id ? { ...i, ...updated } : i));
                  if (!demoMode && (profile as any)?.school_id) {
                    supabase.from('interventions').update(updated).eq('id', duplicateWarning.existing.id);
                  }
                  setDuplicateWarning(null);
                  addToast('Existing action escalated to urgent.');
                }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-800 text-sm font-medium transition-all"
              >
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <div>
                  <div className="font-semibold">Escalate existing case</div>
                  <div className="text-xs text-orange-600 font-normal">Mark the existing action as urgent</div>
                </div>
              </button>
              <button
                onClick={() => { createIntervention(true); setDuplicateWarning(null); }}
                className="flex items-center gap-3 w-full px-4 py-3 rounded-xl border-2 border-slate-200 hover:bg-slate-50 text-slate-700 text-sm font-medium transition-all"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <div>
                  <div className="font-semibold">Create anyway</div>
                  <div className="text-xs text-slate-500 font-normal">Create a separate action despite the duplicate</div>
                </div>
              </button>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50">
              <button onClick={() => setDuplicateWarning(null)} className="btn-secondary w-full">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Complete action modal — evidence + outcome validation */}
      {completeModal && (() => {
        const baseAtt = completingStudent?.attendance_pct ?? null;
        const baseBeh = completingStudent?.behaviour_score ?? null;
        const basePts = completingStudent?.positive_points ?? null;
        const afterAtt = completeForm.afterAttendance ? parseFloat(completeForm.afterAttendance) : null;
        const afterBeh = completeForm.afterBehaviour ? parseFloat(completeForm.afterBehaviour) : null;

        // Evidence-based outcome suggestion
        const attWorse  = afterAtt !== null && baseAtt !== null && afterAtt < baseAtt;
        const attBetter = afterAtt !== null && baseAtt !== null && afterAtt > baseAtt;
        const behWorse  = afterBeh !== null && baseBeh !== null && afterBeh > baseBeh;
        const behBetter = afterBeh !== null && baseBeh !== null && afterBeh < baseBeh;
        const evidenceProblems: string[] = [];
        if (attWorse) evidenceProblems.push(`Attendance declined (${baseAtt}% → ${afterAtt}%)`);
        if (behWorse) evidenceProblems.push(`Behaviour points increased (${baseBeh} → ${afterBeh})`);

        const POSITIVE_OUTCOMES = ['Significant Improvement', 'Some Improvement', 'Resolved'];
        const NEGATIVE_OUTCOMES = ['Deteriorated', 'Escalation Required'];
        const selectedPositive = POSITIVE_OUTCOMES.includes(completeForm.outcomeCategory);
        const evidenceMismatch = selectedPositive && evidenceProblems.length > 0 && (attWorse || behWorse);

        // Auto-suggest next step
        const suggestedNextStep =
          completeForm.outcomeCategory === 'Significant Improvement' || completeForm.outcomeCategory === 'Resolved' ? 'close' :
          completeForm.outcomeCategory === 'Some Improvement' ? 'continue' :
          completeForm.outcomeCategory === 'No Change' ? 'followup' :
          completeForm.outcomeCategory === 'Deteriorated' || completeForm.outcomeCategory === 'Escalation Required' ? 'escalate' : '';

        const canSubmit = completeForm.outcomeText.trim() && completeForm.outcomeCategory && completeForm.nextStep &&
          (!evidenceMismatch || completeForm.showOverride ? (!evidenceMismatch || completeForm.overrideReason.trim()) : true);

        const OUTCOME_CATEGORIES = [
          { v: 'Significant Improvement', color: 'bg-emerald-600 text-white border-emerald-600', inactive: 'border-slate-200 text-slate-600', dot: 'bg-emerald-500' },
          { v: 'Some Improvement',        color: 'bg-teal-600 text-white border-teal-600',     inactive: 'border-slate-200 text-slate-600', dot: 'bg-teal-500' },
          { v: 'No Change',               color: 'bg-amber-500 text-white border-amber-500',   inactive: 'border-slate-200 text-slate-600', dot: 'bg-amber-500' },
          { v: 'Deteriorated',            color: 'bg-red-600 text-white border-red-600',       inactive: 'border-slate-200 text-slate-600', dot: 'bg-red-500' },
          { v: 'Escalation Required',     color: 'bg-red-700 text-white border-red-700',       inactive: 'border-red-200 text-red-600',    dot: 'bg-red-600' },
          { v: 'Resolved',                color: 'bg-blue-600 text-white border-blue-600',     inactive: 'border-slate-200 text-slate-600', dot: 'bg-blue-500' },
        ];

        const NEXT_STEPS = [
          { v: 'close',    label: 'Close case',             sub: 'Mark resolved, no further action' },
          { v: 'continue', label: 'Continue support',       sub: 'Keep monitoring and supporting' },
          { v: 'escalate', label: 'Escalate',               sub: 'Involve senior staff or specialist' },
          { v: 'followup', label: 'Create follow-up action', sub: 'Assign a new action based on this outcome' },
        ];

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setCompleteModal(null)} />
            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] overflow-y-auto">
              {/* Header */}
              <div className="px-6 py-5 border-b border-slate-100 bg-slate-900 text-white flex items-center justify-between sticky top-0">
                <div>
                  <h3 className="font-bold text-base">Complete Action</h3>
                  {completingStudent && (
                    <p className="text-xs text-slate-400 mt-0.5">
                      {completingStudent.name} · {completingItem?.action_type}
                      {completingItem?.assigned_to && ` · ${completingItem.assigned_to}`}
                    </p>
                  )}
                </div>
                <button onClick={() => setCompleteModal(null)} className="p-2 rounded-lg hover:bg-white/10 transition-colors"><X className="w-4 h-4" /></button>
              </div>

              <div className="px-6 py-5 space-y-6">

                {/* Evidence comparison */}
                {(baseAtt !== null || baseBeh !== null) && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Evidence — before this action</div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      {baseAtt !== null && (
                        <div className="space-y-1">
                          <div className="text-slate-500 font-medium">Attendance</div>
                          <div className="font-bold text-slate-800">{baseAtt}% before</div>
                          <input
                            type="number" min="0" max="100"
                            placeholder="Current %"
                            value={completeForm.afterAttendance}
                            onChange={e => setCompleteForm(f => ({ ...f, afterAttendance: e.target.value }))}
                            className="input-premium w-full text-xs py-1.5"
                          />
                          {afterAtt !== null && (
                            <div className={`text-xs font-semibold ${attBetter ? 'text-emerald-600' : attWorse ? 'text-red-600' : 'text-slate-500'}`}>
                              {attBetter ? '▲' : attWorse ? '▼' : '='} Now {afterAtt}%
                            </div>
                          )}
                        </div>
                      )}
                      {baseBeh !== null && (
                        <div className="space-y-1">
                          <div className="text-slate-500 font-medium">Behaviour pts</div>
                          <div className="font-bold text-slate-800">{baseBeh} pts before</div>
                          <input
                            type="number" min="0"
                            placeholder="Current pts"
                            value={completeForm.afterBehaviour}
                            onChange={e => setCompleteForm(f => ({ ...f, afterBehaviour: e.target.value }))}
                            className="input-premium w-full text-xs py-1.5"
                          />
                          {afterBeh !== null && (
                            <div className={`text-xs font-semibold ${behBetter ? 'text-emerald-600' : behWorse ? 'text-red-600' : 'text-slate-500'}`}>
                              {behBetter ? '▼' : behWorse ? '▲' : '='} Now {afterBeh} pts
                            </div>
                          )}
                        </div>
                      )}
                      {basePts !== null && (
                        <div className="space-y-1">
                          <div className="text-slate-500 font-medium">Positive points</div>
                          <div className="font-bold text-slate-800">{basePts} pts</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Outcome category */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                    Outcome <span className="text-red-500">*</span>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {OUTCOME_CATEGORIES.map(({ v, color, inactive }) => (
                      <button
                        key={v}
                        onClick={() => {
                          const suggestion =
                            v === 'Significant Improvement' || v === 'Resolved' ? 'close' :
                            v === 'Some Improvement' ? 'continue' :
                            v === 'No Change' ? 'followup' : 'escalate';
                          setCompleteForm(f => ({ ...f, outcomeCategory: v, nextStep: f.nextStep || suggestion, showOverride: false, overrideReason: '' }));
                        }}
                        className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                          completeForm.outcomeCategory === v ? color : `bg-white ${inactive} hover:border-slate-300`
                        }`}
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Evidence mismatch warning */}
                {evidenceMismatch && !completeForm.showOverride && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-amber-800">Outcome does not match available evidence</p>
                        <div className="mt-1.5 space-y-0.5">
                          {evidenceProblems.map(p => (
                            <div key={p} className="text-xs text-amber-700 flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" /> {p}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCompleteForm(f => ({ ...f, outcomeCategory: '' }))}
                        className="flex-1 py-2 rounded-xl border border-amber-300 text-amber-700 text-xs font-semibold hover:bg-amber-100 transition-colors"
                      >
                        Change Outcome
                      </button>
                      <button
                        onClick={() => setCompleteForm(f => ({ ...f, showOverride: true }))}
                        className="flex-1 py-2 rounded-xl bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 transition-colors"
                      >
                        Override With Reason
                      </button>
                    </div>
                  </div>
                )}

                {/* Override reason */}
                {completeForm.showOverride && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-blue-600 shrink-0" />
                      <p className="text-xs font-semibold text-blue-800">Staff override — reason required</p>
                    </div>
                    <textarea
                      rows={2}
                      value={completeForm.overrideReason}
                      onChange={e => setCompleteForm(f => ({ ...f, overrideReason: e.target.value }))}
                      placeholder="Why does this outcome differ from the evidence? (e.g. teacher observation, external factors)"
                      className="input-premium w-full text-xs resize-none"
                    />
                    <p className="text-[10px] text-blue-600">This will be stored in the audit trail.</p>
                  </div>
                )}

                {/* Outcome notes */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                    Outcome notes <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    rows={3}
                    autoFocus={!baseAtt && !baseBeh}
                    placeholder="What happened? What evidence do you have? What was agreed?"
                    value={completeForm.outcomeText}
                    onChange={e => setCompleteForm(f => ({ ...f, outcomeText: e.target.value }))}
                    className="input-premium w-full resize-none"
                  />
                </div>

                {/* Next step */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">
                    Next step <span className="text-red-500">*</span>
                    {suggestedNextStep && !completeForm.nextStep && (
                      <span className="ml-2 text-teal-600 normal-case font-normal">
                        Suggested: {NEXT_STEPS.find(s => s.v === suggestedNextStep)?.label}
                      </span>
                    )}
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {NEXT_STEPS.map(({ v, label, sub }) => (
                      <button
                        key={v}
                        onClick={() => setCompleteForm(f => ({ ...f, nextStep: v }))}
                        className={`py-2.5 px-3 rounded-xl border text-left text-xs transition-all ${
                          completeForm.nextStep === v
                            ? 'bg-teal-600 text-white border-teal-600'
                            : v === suggestedNextStep && !completeForm.nextStep
                            ? 'border-teal-300 bg-teal-50 text-teal-700'
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
                <button
                  onClick={completeIntervention}
                  disabled={!canSubmit}
                  className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <CheckCircle className="w-4 h-4" />
                  Save outcome
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Action detail drawer */}
      {drawerActionId && (() => {
        const action = interventions.find(i => i.id === drawerActionId);
        if (!action) return null;
        const student = studentNameMap.get(action.student_id);
        return (
          <ActionDrawer
            intervention={action}
            student={student}
            analysis={drawerAnalysis}
            auditLog={auditLog[drawerActionId] || []}
            notificationBanner={notificationBanner}
            onClose={() => { setDrawerActionId(null); setNotificationBanner(null); }}
            onMarkInProgress={() => { updateStatus(drawerActionId, 'in_progress'); }}
            onComplete={(outcomeText?: string) => { setCompleteModal(drawerActionId); setCompleteForm({ outcomeText: outcomeText || '', outcomeAchieved: 'achieved', outcomeCategory: '', nextStep: '', afterAttendance: String(student?.attendance_pct || ''), afterBehaviour: String(student?.behaviour_score || ''), overrideReason: '', showOverride: false }); setDrawerActionId(null); }}
            onEscalate={currentRole !== 'dsl' ? () => { escalateAction(drawerActionId); } : undefined}
            onReassign={(name, role) => reassignAction(drawerActionId, name, role)}
            onChangeDueDate={(date) => changeDueDate(drawerActionId, date)}
            onChangeReviewDate={(date) => changeReviewDate(drawerActionId, date)}
            onDismiss={() => dismissAction(drawerActionId)}
            onUndoCompletion={() => undoCompletion(drawerActionId)}
            onUndoEscalation={() => {
              const prev = interventions.find(x => x.id === drawerActionId);
              if (prev) {
                const prevStatus = (prev.prev_status as Intervention['status']) || 'in_progress';
                setInterventions(cur => cur.map(x => x.id === drawerActionId ? { ...x, status: prevStatus, escalated_to: null, escalation_reason: null, escalated_by: null, escalated_at: null, escalation_notes: null } : x));
                logAudit(drawerActionId, `Escalation undone by ${currentUserName}`);
                addToast('Escalation undone — action returned to previous state.');
              }
            }}
          />
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
                <p className="text-xs text-amber-700">As {currentRole?.toUpperCase()}, you can redirect this action to the appropriate staff member. The new assignee will be notified and will become responsible for completing it.</p>
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
    </div>
  );
}

