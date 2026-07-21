import { useState, useEffect } from 'react';
import { X, StickyNote, CheckCircle, ChevronDown, Shield, BookOpen, GraduationCap, AlertTriangle, Brain, TrendingDown, ShieldAlert } from 'lucide-react';
import type { Student, QuickNote, QuickNoteCategory, QuickNoteConcernLevel, NoteVisibility, AnalysisResult } from '../types';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { triggerReanalysis } from '../lib/analysistrigger';
import {
  addDemoIntervention,
  addDemoBehaviourRecord,
  setDemoSignalStatus,
  MOCK_STUDENTS,
  HOY_BY_YEAR,
  mapOwnerToStaffName,
  getDemoInterventions,
  MOCK_INTERVENTIONS,
  pushLiveNotification,
  getAnalysisForStudent,
} from '../lib/data';
import { detectSafeguarding } from '../lib/safeguarding';
import SafeguardingAlert from './SafeguardingAlert';

const CATEGORIES: QuickNoteCategory[] = [
  'Pastoral concern',
  'Positive observation',
  'Attendance concern',
  'Behaviour concern',
  'SEND observation',
  'Safeguarding review prompt',
  'Parent communication',
  'Academic concern',
  'Career/destination concern',
  'General note',
];

const VISIBILITY_OPTIONS: { value: NoteVisibility; label: string; desc: string }[] = [
  { value: 'general', label: 'General', desc: 'All staff can see' },
  { value: 'pastoral', label: 'Pastoral', desc: 'Pastoral staff only' },
  { value: 'send', label: 'SEND', desc: 'SENDCo and above' },
  { value: 'dsl_only', label: 'DSL Only', desc: 'DSL and SLT only' },
  { value: 'slt_only', label: 'SLT Only', desc: 'Senior leadership only' },
];

const CONCERN_LABELS: Record<number, string> = { 1: 'Very low', 2: 'Low', 3: 'Medium', 4: 'High', 5: 'Urgent' };
const CONCERN_COLORS: Record<number, string> = {
  1: 'bg-slate-100 text-slate-600 border-slate-200',
  2: 'bg-blue-50 text-blue-700 border-blue-200',
  3: 'bg-amber-50 text-amber-700 border-amber-200',
  4: 'bg-orange-100 text-orange-700 border-orange-200',
  5: 'bg-red-100 text-red-700 border-red-200',
};

const SAFEGUARDING_KEYWORDS = [
  'home', 'hurt', 'safe', 'unsafe', 'afraid', 'scared', 'abuse', 'abused', 'hit', 'parent',
  'disclosure', 'disclosed', 'don\'t want to go home', "don't want to go home", 'tonight',
  'worried at home', 'bruise', 'mark', 'crying', 'sobbing', 'distressed', 'self-harm',
  'cut', 'cuts', 'suicide', 'suicidal', 'housing', 'homeless', 'hungry', 'food',
  'safeguarding', 'welfare', 'mash', 'social care', 'early help',
];

const SEND_KEYWORDS = [
  'ehcp', 'sen', 'send', 'special needs', 'autism', 'dyslexia', 'processing',
  'accommodation', 'support plan', 'learning difficulty', 'reading support',
];

const HOY_KEYWORDS = [
  'behaviour', 'disruption', 'refused', 'refuse', 'lateness', 'late', 'missing',
  'attendance', 'absent', 'friendship', 'bullying', 'peer', 'conflict', 'fight',
  'excluded', 'exclusion', 'isolation', 'detention', 'argument',
];

interface RoutingResult {
  owner: string;          // staff name e.g. 'Mr Ahmed (DSL)'
  ownerRole: string;      // e.g. 'DSL'
  actionType: string;
  priority: 'urgent' | 'high' | 'medium';
  visibility: NoteVisibility;
  reason: string;
  evidencePoints: string[];
}

function routeConcern(
  noteText: string,
  category: QuickNoteCategory,
  concernLevel: QuickNoteConcernLevel,
  student: Student | undefined,
  existingInterventions: ReturnType<typeof getDemoInterventions>
): RoutingResult {
  const lower = (noteText + ' ' + category).toLowerCase();

  // If the student already has an active safeguarding case, route to DSL regardless of what was written.
  // This matches real practice — any new concern for a student already on the DSL's radar goes straight there.
  const hasActiveSafeguardingCase = student
    ? existingInterventions.some(
        i => i.student_id === student.id &&
             ['open', 'in_progress'].includes(i.status) &&
             /safeguard|welfare|disclosure/i.test(i.action_type)
      )
    : false;

  const isSafeguarding =
    hasActiveSafeguardingCase ||
    SAFEGUARDING_KEYWORDS.some(kw => lower.includes(kw)) ||
    category === 'Safeguarding review prompt' ||
    concernLevel >= 4;

  const isSEND =
    SEND_KEYWORDS.some(kw => lower.includes(kw)) ||
    category === 'SEND observation' ||
    (student?.send_status != null && !isSafeguarding);

  const evidencePoints: string[] = [];

  // Build evidence from student context
  if (student) {
    if ((student.attendance_pct ?? 100) < 92) {
      evidencePoints.push(`Attendance ${student.attendance_pct}% (below target)`);
    }
    if ((student.behaviour_score ?? 0) > 10) {
      evidencePoints.push(`Behaviour score ${student.behaviour_score} (elevated)`);
    }
    if (student.send_status) {
      evidencePoints.push(`SEND status: ${student.send_status}`);
    }
    const openInts = existingInterventions.filter(
      i => i.student_id === student.id && ['open', 'in_progress'].includes(i.status)
    );
    if (openInts.length > 0) {
      evidencePoints.push(`${openInts.length} active intervention${openInts.length > 1 ? 's' : ''} already open`);
    }
    if (hasActiveSafeguardingCase) {
      evidencePoints.push('Student already has an open safeguarding case — routed to DSL automatically');
    }
  }

  evidencePoints.unshift('Teacher observation logged');

  if (isSafeguarding) {
    const owner = mapOwnerToStaffName('DSL');
    return {
      owner,
      ownerRole: 'DSL',
      actionType: concernLevel >= 4 ? 'Urgent safeguarding welfare review' : 'DSL welfare review',
      priority: concernLevel >= 4 ? 'urgent' : 'high',
      visibility: 'dsl_only',
      reason: 'Note contains language indicating a possible home/welfare/safeguarding concern.',
      evidencePoints,
    };
  }

  if (isSEND) {
    const owner = mapOwnerToStaffName('SENCO');
    return {
      owner,
      ownerRole: 'SENDCo',
      actionType: 'SENDCo welfare check',
      priority: 'medium',
      visibility: 'send',
      reason: 'Note relates to a student with SEND needs or SEND-specific language detected.',
      evidencePoints,
    };
  }

  // Default: route to HOY
  const yearGroup = student?.year_group;
  const owner = yearGroup && HOY_BY_YEAR[yearGroup] ? HOY_BY_YEAR[yearGroup] : mapOwnerToStaffName('Head of Year');
  return {
    owner,
    ownerRole: 'Head of Year',
    actionType: 'Pastoral welfare check',
    priority: concernLevel >= 4 ? 'high' : 'medium',
    visibility: 'pastoral',
    reason: 'Concern raised by classroom teacher. Routed to Head of Year for pastoral follow-up.',
    evidencePoints,
  };
}

interface Props {
  students: Student[];
  defaultStudentId?: string;
  onClose: () => void;
  onSaved: (note: QuickNote) => void;
  teacherMode?: boolean;
}

function generateId() {
  return 'note_' + Math.random().toString(36).slice(2) + Date.now();
}

export default function QuickNoteModal({ students, defaultStudentId, onClose, onSaved, teacherMode }: Props) {
  const { profile, demoMode } = useAuth();
  const isTeacher = teacherMode || profile?.role === 'teacher';
  const [studentId, setStudentId] = useState(defaultStudentId || '');
  const [category, setCategory] = useState<QuickNoteCategory>('Pastoral concern');
  const [concernLevel, setConcernLevel] = useState<QuickNoteConcernLevel>(3);
  const [visibility, setVisibility] = useState<NoteVisibility>('general');
  const [note, setNote] = useState('');
  const [actionNeeded, setActionNeeded] = useState(false);
  const [assignTo, setAssignTo] = useState('');
  const [followUpDate, setFollowUpDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [routing, setRouting] = useState<RoutingResult | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [observationType, setObservationType] = useState<'observation' | 'concern'>('observation');
  const [sgDismissed, setSgDismissed] = useState(false);
  const [sgAccepted, setSgAccepted] = useState(false);

  const selectedStudent = students.find((s) => s.id === studentId);
  const isConcern = isTeacher ? observationType === 'concern' : actionNeeded || concernLevel >= 4;

  // Fetch analysis intelligence for the selected student
  const [studentAnalysis, setStudentAnalysis] = useState<AnalysisResult | null>(null);
  useEffect(() => {
    if (!studentId) { setStudentAnalysis(null); return; }
    const schoolId = demoMode ? null : profile?.school_id;
    getAnalysisForStudent(schoolId, studentId).then(setStudentAnalysis);
  }, [studentId, demoMode, profile?.school_id]);

  // Live safeguarding detection — computed from note text
  const sgDetection = !sgDismissed && note.trim().length >= 8 ? detectSafeguarding(note) : null;

  async function handleSave() {
    if (!studentId || !note.trim()) return;
    setSaving(true);

    const effectiveVisibility: NoteVisibility = isTeacher && observationType === 'observation' ? 'general' : visibility;
    const effectiveActionNeeded = isTeacher && observationType === 'observation' ? false : actionNeeded;

    const newNote: QuickNote = {
      id: generateId(),
      student_id: studentId,
      category,
      concern_level: concernLevel,
      visibility: effectiveVisibility,
      note: note.trim(),
      staff_member: profile?.full_name || 'Demo User',
      date: new Date().toISOString().slice(0, 10),
      created_at: new Date().toISOString(),
      action_needed: effectiveActionNeeded || undefined,
      assign_to: assignTo.trim() || undefined,
      follow_up_date: followUpDate || undefined,
    };

    if (!demoMode && profile?.school_id) {
      await supabase.from('quick_notes').insert({ ...newNote, school_id: profile.school_id });
      triggerReanalysis(profile.school_id);
    }

    // If this is a concern, route it and create an intervention
    if (isConcern) {
      const allInts = [...getDemoInterventions(), ...MOCK_INTERVENTIONS];
      const student = MOCK_STUDENTS.find(s => s.id === studentId);
      const result = routeConcern(note.trim(), category, concernLevel, student, allInts);

      // ── 1. Chronology event ──────────────────────────────────────────────────
      addDemoBehaviourRecord({
        id: 'chron_' + Date.now(),
        student_id: studentId,
        date: new Date().toISOString().slice(0, 10),
        incident_type: result.ownerRole === 'DSL' ? 'Safeguarding note' : 'Staff concern',
        behaviour_points: 0,
        lesson_period: null,
        subject: null,
        staff_member: profile?.full_name || 'Ms Okonkwo',
        comment: note.trim(),
        safeguarding_note: result.ownerRole === 'DSL' ? note.trim() : null,
      });

      // ── 2. Signal update ─────────────────────────────────────────────────────
      // Escalate to red for safeguarding/urgent concerns; amber for others
      const newSignal = (result.priority === 'urgent' || result.ownerRole === 'DSL') ? 'new' : 'new';
      setDemoSignalStatus(studentId, newSignal);

      // ── 3. Duplicate protection ──────────────────────────────────────────────
      // Do not create a second open intervention for the same student+action_type
      const existingOpen = allInts.find(
        i => i.student_id === studentId &&
          i.status === 'open' &&
          i.action_type === result.actionType
      );

      if (!existingOpen) {
        const today = new Date();
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + (result.priority === 'urgent' ? 1 : result.priority === 'high' ? 2 : 5));
        const reviewDate = new Date(today);
        reviewDate.setDate(reviewDate.getDate() + 3);

        addDemoIntervention({
          id: 'concern_' + Date.now(),
          student_id: studentId,
          assigned_to: result.owner,
          created_by: profile?.full_name || 'Ms Okonkwo',
          action_type: result.actionType,
          priority: result.priority,
          status: 'open',
          due_date: dueDate.toISOString().slice(0, 10),
          review_date: reviewDate.toISOString().slice(0, 10),
          notes: `Teacher concern: "${note.trim().slice(0, 120)}${note.length > 120 ? '...' : ''}"`,
          outcome: null,
          reason: result.reason,
          suggested_owner: result.ownerRole,
          created_at: new Date().toISOString(),
        });
      }

      setRouting(result);

      // Push a confirmation notification back to the teacher so their bell reflects the submission
      if (demoMode && profile?.full_name) {
        pushLiveNotification({
          id: `concern-confirm-${Date.now()}`,
          type: 'outcome_recorded',
          title: `Concern received — ${selectedStudent?.name || 'Student'}`,
          body: `Routed to ${result.owner}. ${result.reason.slice(0, 120)}`,
          required_action: 'Your concern has been logged. The named staff member has been notified and will action it.',
          student_id: studentId,
          link_path: `/students/${studentId}?tab=notes`,
          is_read: false,
          urgent: result.priority === 'urgent',
          created_at: new Date().toISOString(),
          target_user: profile.full_name,
        });
      }
    }

    setSaving(false);
    setSaved(true);

    if (!isConcern) {
      setTimeout(() => onSaved(newNote), 800);
    } else {
      onSaved(newNote);
    }
  }

  const routeIcon = routing?.ownerRole === 'DSL'
    ? Shield
    : routing?.ownerRole === 'SENDCo'
    ? GraduationCap
    : routing?.ownerRole === 'Head of Year'
    ? BookOpen
    : AlertTriangle;

  const routeColor = routing?.ownerRole === 'DSL'
    ? { bg: 'bg-red-50', icon: 'bg-red-600', text: 'text-red-700', badge: 'bg-red-100 text-red-700' }
    : routing?.ownerRole === 'SENDCo'
    ? { bg: 'bg-teal-50', icon: 'bg-teal-600', text: 'text-teal-700', badge: 'bg-teal-100 text-teal-700' }
    : { bg: 'bg-blue-50', icon: 'bg-blue-600', text: 'text-blue-700', badge: 'bg-blue-100 text-blue-700' };

  const RouteIcon = routeIcon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center">
              <StickyNote className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Quick Note</h2>
              <p className="text-xs text-slate-500">Log an observation for any student</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {saved ? (
          <div className="px-6 py-8 flex flex-col gap-5">
            {/* Observation-only confirmation */}
            {!routing && (
              <div className="flex flex-col items-center gap-3 text-center py-4">
                <CheckCircle className="w-12 h-12 text-emerald-500" />
                <div className="font-semibold text-slate-800">Observation saved</div>
                <div className="text-sm text-slate-500">
                  {selectedStudent?.name && `Logged for ${selectedStudent.name}.`} Contributes to the intelligence picture over time.
                </div>
              </div>
            )}

            {/* Concern routing confirmation */}
            {routing && (
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-6 h-6 text-emerald-500 shrink-0" />
                  <div>
                    <div className="font-bold text-slate-900">Concern logged and routed</div>
                    <div className="text-xs text-slate-500">Chronology updated for {selectedStudent?.name}</div>
                  </div>
                </div>

                {/* Routing card */}
                <div className={`rounded-2xl p-4 ${routeColor.bg} border border-slate-200`}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${routeColor.icon}`}>
                      <RouteIcon className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className={`text-xs font-bold uppercase tracking-wider ${routeColor.text}`}>Routed to</div>
                      <div className="font-bold text-slate-900">{routing.owner}</div>
                    </div>
                    <span className={`ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${routeColor.badge}`}>
                      {routing.priority}
                    </span>
                  </div>
                  <div className={`text-xs ${routeColor.text} mb-3`}>{routing.reason}</div>
                  <div className="space-y-1">
                    {routing.evidencePoints.map((pt, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                        <div className="w-1 h-1 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                        {pt}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-xs text-slate-500 bg-slate-50 rounded-xl px-4 py-3">
                  <span className="font-semibold text-slate-700">{routing.owner}</span> will see this in their action queue immediately. You do not need to do anything else — the concern is in the system.
                </div>
              </div>
            )}

            <button onClick={onClose} className="btn-primary w-full">Done</button>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
            {/* Teacher mode: observation type choice */}
            {isTeacher && (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Save as
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setObservationType('observation')}
                    className={`px-4 py-3 rounded-xl border text-left transition-colors ${
                      observationType === 'observation'
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="text-sm font-semibold">Observation only</div>
                    <div className={`text-xs mt-0.5 ${observationType === 'observation' ? 'text-white/80' : 'text-slate-400'}`}>
                      Saved to chronology. No signal raised.
                    </div>
                  </button>
                  <button
                    onClick={() => setObservationType('concern')}
                    className={`px-4 py-3 rounded-xl border text-left transition-colors ${
                      observationType === 'concern'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300'
                    }`}
                  >
                    <div className="text-sm font-semibold">Raise concern</div>
                    <div className={`text-xs mt-0.5 ${observationType === 'concern' ? 'text-white/80' : 'text-slate-400'}`}>
                      Routed to DSL, HOY, or SENDCo automatically.
                    </div>
                  </button>
                </div>
                {observationType === 'observation' && (
                  <p className="text-xs text-slate-500 mt-2">
                    This note is saved privately and contributes to the intelligence picture over time, but does not immediately alert anyone.
                  </p>
                )}
                {observationType === 'concern' && (
                  <p className="text-xs text-amber-700 bg-amber-50 rounded-xl px-3 py-2 mt-2 font-medium">
                    Student Signal will analyse your note and route it to the right person — DSL for welfare/safeguarding, SENDCo for SEND concerns, or Head of Year for pastoral issues. You do not need to decide.
                  </p>
                )}
              </div>
            )}

            {/* Student */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Student
              </label>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="input-premium"
              >
                <option value="">Select a student...</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} — {s.year_group}
                  </option>
                ))}
              </select>
            </div>

            {/* Student intelligence context */}
            {selectedStudent && studentAnalysis && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center gap-2 mb-1">
                  <Brain className="w-4 h-4 text-teal-600" />
                  <span className="text-[10px] font-bold text-teal-600 uppercase tracking-widest">Student Signal Intelligence</span>
                  {studentAnalysis.signal_category === 'red' && <span className="ml-auto text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">High Risk</span>}
                  {studentAnalysis.signal_category === 'amber' && <span className="ml-auto text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Watchlist</span>}
                  {studentAnalysis.signal_category === 'green' && <span className="ml-auto text-[10px] font-bold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">On Track</span>}
                </div>
                {studentAnalysis.barriers && (
                  <div className="flex items-start gap-2">
                    <TrendingDown className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-700 leading-relaxed">{studentAnalysis.barriers}</p>
                  </div>
                )}
                {studentAnalysis.strengths && (
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-700 leading-relaxed">{studentAnalysis.strengths}</p>
                  </div>
                )}
                {studentAnalysis.key_reasons && studentAnalysis.key_reasons.length > 0 && !studentAnalysis.barriers && (
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-slate-700">{studentAnalysis.key_reasons.slice(0, 2).join('; ')}</p>
                  </div>
                )}
                {studentAnalysis.suggested_next_steps && studentAnalysis.suggested_next_steps.length > 0 && (
                  <div className="border-t border-slate-200 pt-2 mt-2">
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Suggested actions</div>
                    <div className="space-y-1.5">
                      {studentAnalysis.suggested_next_steps.slice(0, 3).map((step, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs">
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${step.priority === 'urgent' ? 'bg-red-500' : step.priority === 'high' ? 'bg-amber-500' : 'bg-blue-400'}`} />
                          <span className="text-slate-700 flex-1">{step.action}</span>
                          <span className="text-slate-400 text-[10px] font-medium">{step.role}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(selectedStudent.attendance_pct ?? 100) < 92 && (
                  <div className="flex items-center gap-2 text-xs text-amber-700">
                    <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                    <span>Attendance: {selectedStudent.attendance_pct}% (below 92% target)</span>
                  </div>
                )}
              </div>
            )}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategory(cat)}
                    className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-colors ${
                      category === cat
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Concern Level */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Concern level
              </label>
              <div className="flex gap-2">
                {([1, 2, 3, 4, 5] as QuickNoteConcernLevel[]).map((level) => (
                  <button
                    key={level}
                    onClick={() => setConcernLevel(level)}
                    className={`flex-1 py-2 rounded-xl border text-xs font-bold transition-colors ${
                      concernLevel === level
                        ? CONCERN_COLORS[level] + ' ring-2 ring-offset-1 ring-teal-400'
                        : 'bg-white text-slate-400 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {level}
                    <div className="text-[10px] font-normal mt-0.5 hidden sm:block">{CONCERN_LABELS[level]}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Visibility — hidden for teacher concern (auto-set by routing) */}
            {!(isTeacher && observationType === 'concern') && (
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Visibility
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {VISIBILITY_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setVisibility(opt.value)}
                      className={`text-left px-3 py-2 rounded-xl border text-xs transition-colors ${
                        visibility === opt.value
                          ? 'bg-teal-600 text-white border-teal-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-semibold">{opt.label}</div>
                      <div className={`text-[10px] mt-0.5 ${visibility === opt.value ? 'text-white/80' : 'text-slate-400'}`}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Note */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                Note
              </label>
              <textarea
                value={note}
                onChange={(e) => { setNote(e.target.value); setSgDismissed(false); setSgAccepted(false); }}
                placeholder={
                  isTeacher && observationType === 'concern'
                    ? 'What did you observe? Be specific — your note will be analysed and routed automatically.'
                    : 'What have you observed? Be specific — this will inform future signals.'
                }
                className="input-premium w-full"
                rows={3}
                autoFocus={!!defaultStudentId}
              />
            </div>

            {/* Live safeguarding detection banner */}
            {sgDetection && !saved && (
              <SafeguardingAlert
                detection={sgDetection}
                accepted={sgAccepted}
                onAccept={(dslName, actionType, priority) => {
                  setAssignTo(dslName);
                  setVisibility('dsl_only');
                  setConcernLevel(priority === 'urgent' ? 5 : 4);
                  setCategory('Safeguarding review prompt');
                  setActionNeeded(true);
                  setSgAccepted(true);
                }}
                onDismiss={!sgAccepted ? () => setSgDismissed(true) : undefined}
              />
            )}

            {/* Advanced toggle — hidden for teacher concern */}
            {!(isTeacher && observationType === 'concern') && (
              <>
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-slate-700 transition-colors"
                >
                  <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                  {showAdvanced ? 'Hide' : 'Show'} follow-up options
                </button>

                {showAdvanced && (
                  <div className="space-y-4 pt-1 border-t border-slate-100">
                    <div className="flex items-center justify-between p-4 rounded-xl border border-slate-200">
                      <div>
                        <div className="text-sm font-semibold text-slate-800">Action needed</div>
                        <div className="text-xs text-slate-500 mt-0.5">Flag this note as requiring follow-up</div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={actionNeeded}
                          onChange={(e) => setActionNeeded(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600" />
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Assign to (optional)
                      </label>
                      <input
                        type="text"
                        value={assignTo}
                        onChange={(e) => setAssignTo(e.target.value)}
                        placeholder="Staff member name..."
                        className="input-premium"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                        Follow-up date (optional)
                      </label>
                      <input
                        type="date"
                        value={followUpDate}
                        onChange={(e) => setFollowUpDate(e.target.value)}
                        className="input-premium"
                      />
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!studentId || !note.trim() || saving}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Saving...' : isConcern ? 'Log concern' : 'Save note'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

