import { useState, useMemo, useEffect } from 'react';
import {
  X, Phone, CheckCircle, Search, Mail, Users, FileText, Building2, MessageCircle,
  AlertTriangle, ArrowRight, ShieldAlert, TrendingDown, Route, Brain,
} from 'lucide-react';
import type { Student, CommunicationSource, CommunicationPriority, AnalysisResult } from '../types';
import type { Intervention } from '../types';
import { useAuth } from '../context/AuthContext';
import {
  createCommunication, DEMO_STAFF, MOCK_STUDENTS, HOY_BY_YEAR,
  getDemoInterventions, MOCK_INTERVENTIONS, getAnalysisForStudent,
} from '../lib/data';
import { detectSafeguarding } from '../lib/safeguarding';
import SafeguardingAlert from './SafeguardingAlert';

// ── Routing intelligence ──────────────────────────────────────────────────────

const SAFEGUARDING_KEYWORDS = ['threaten', 'threat', 'harm', 'abuse', 'assault', 'violence', 'weapon', 'knife', 'unsafe', 'safeguard', 'hurt', 'self-harm', 'suicid'];
const BEHAVIOUR_KEYWORDS    = ['fight', 'bully', 'disrupt', 'aggress', 'exclusion', 'suspend', 'attitude', 'incident', 'classroom', 'class'];
const ATTENDANCE_KEYWORDS   = ['absent', 'attendance', 'late', 'truant', 'miss', 'not in school', 'holiday', 'unauthoris'];
const SEND_KEYWORDS         = ['ehcp', 'send', 'learning', 'support plan', 'provision', 'disability', 'autism', 'adhd', 'dyslexia', 'anxiety'];

type RoutingSuggestion = {
  role: string;
  reason: string;
  priority: CommunicationPriority;
  urgency: 'urgent' | 'high' | 'normal';
};

function analyseNote(text: string): RoutingSuggestion | null {
  const lower = text.toLowerCase();
  if (SAFEGUARDING_KEYWORDS.some(k => lower.includes(k))) {
    return { role: 'DSL', reason: 'Possible safeguarding concern detected', priority: 'urgent', urgency: 'urgent' };
  }
  if (SEND_KEYWORDS.some(k => lower.includes(k))) {
    return { role: 'SENDCo', reason: 'SEND-related content detected', priority: 'high', urgency: 'high' };
  }
  if (ATTENDANCE_KEYWORDS.some(k => lower.includes(k))) {
    return { role: 'Head of Year', reason: 'Attendance concern detected', priority: 'normal', urgency: 'normal' };
  }
  if (BEHAVIOUR_KEYWORDS.some(k => lower.includes(k))) {
    return { role: 'Head of Year', reason: 'Behaviour concern detected', priority: 'high', urgency: 'high' };
  }
  return null;
}

// ── Source config ─────────────────────────────────────────────────────────────

const SOURCE_OPTIONS: { value: CommunicationSource; label: string; icon: React.FC<{ className?: string }> }[] = [
  { value: 'phone',                 label: 'Phone call',            icon: Phone },
  { value: 'email',                 label: 'Email',                 icon: Mail },
  { value: 'meeting',               label: 'Meeting',               icon: Users },
  { value: 'letter',                label: 'Letter',                icon: FileText },
  { value: 'external_agency',       label: 'External agency',       icon: Building2 },
  { value: 'pastoral_conversation', label: 'Pastoral conversation', icon: MessageCircle },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function getStudentContext(studentId: string, allInterventions: Intervention[]) {
  const student = MOCK_STUDENTS.find(s => s.id === studentId);
  const studentInts = allInterventions.filter(i => i.student_id === studentId && ['open', 'in_progress', 'assigned'].includes(i.status));
  const hasSafeguarding = studentInts.some(i =>
    i.action_type.toLowerCase().includes('safeguard') ||
    i.action_type.toLowerCase().includes('welfare') ||
    i.action_type.toLowerCase().includes('dsl')
  ) || (student?.signal_category === 'red' && studentInts.some(i => i.priority === 'urgent'));
  const attendanceSignal = student ? (student.attendance_pct ?? 100) < 92 : false;
  const behaviourSignal  = student ? (student.behaviour_score ?? 0) > 10 : false;

  let suggestedRoute = 'Head of Year';
  if (hasSafeguarding) suggestedRoute = 'DSL';
  else if (student?.send_status) suggestedRoute = 'SENDCo';

  return { hasSafeguarding, attendanceSignal, behaviourSignal, suggestedRoute, activeCount: studentInts.length };
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  students?: Student[];
  defaultStudentId?: string;
  onClose: () => void;
  onSaved: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function QuickLogModal({ students: propStudents, defaultStudentId, onClose, onSaved }: Props) {
  const { profile, demoMode } = useAuth();
  const students = propStudents && propStudents.length > 0 ? propStudents : MOCK_STUDENTS;

  const [search, setSearch]             = useState('');
  const [studentId, setStudentId]       = useState(defaultStudentId || '');
  const [source, setSource]             = useState<CommunicationSource>('phone');
  const [summary, setSummary]           = useState('');
  const [saving, setSaving]             = useState(false);
  const [saved, setSaved]               = useState(false);
  const [showStudentDropdown, setShowStudentDropdown] = useState(false);
  const [sgDismissed, setSgDismissed]   = useState(false);
  const [sgAccepted, setSgAccepted]     = useState(false);
  const [overrideAssignee, setOverrideAssignee] = useState('');

  const currentUser = profile?.full_name || 'Demo User';
  const schoolId = demoMode ? null : profile?.school_id;

  const allInterventions = useMemo((): Intervention[] => {
    const demoInts = getDemoInterventions();
    const demoIds = new Set(demoInts.map(i => i.id));
    const demoStudentIds = new Set(demoInts.map(i => i.student_id));
    return [
      ...demoInts,
      ...MOCK_INTERVENTIONS.filter(i => !demoIds.has(i.id) && !demoStudentIds.has(i.student_id)),
    ];
  }, []);

  const filteredStudents = useMemo(() => {
    if (!search.trim()) return students.slice(0, 8);
    const q = search.toLowerCase();
    return students.filter(s =>
      s.name.toLowerCase().includes(q) || s.year_group.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [students, search]);

  const selectedStudent = students.find(s => s.id === studentId);
  const suggestion      = summary.trim().length > 10 ? analyseNote(summary) : null;
  const sgDetection     = !sgDismissed && summary.trim().length >= 8 ? detectSafeguarding(summary) : null;

  const ctx = useMemo(() =>
    studentId ? getStudentContext(studentId, allInterventions) : null,
  [studentId, allInterventions]);

  // Fetch analysis intelligence for the selected student
  const [studentAnalysis, setStudentAnalysis] = useState<AnalysisResult | null>(null);
  useEffect(() => {
    if (!studentId) { setStudentAnalysis(null); return; }
    getAnalysisForStudent(schoolId, studentId).then(setStudentAnalysis);
  }, [studentId, schoolId]);

  // Derive suggested assignee from routing or student context
  const suggestedAssignee = useMemo(() => {
    if (!selectedStudent) return '';
    const route = suggestion?.role || ctx?.suggestedRoute;
    if (!route) return '';
    if (route === 'DSL')    return 'Mr Ahmed (DSL)';
    if (route === 'SENDCo') return 'Ms Jones (SENDCo)';
    if (route === 'Head of Year') {
      return HOY_BY_YEAR[selectedStudent.year_group] || 'Ms Harris (HOY Y10)';
    }
    return '';
  }, [suggestion, ctx, selectedStudent]);

  const effectiveAssignee = overrideAssignee || suggestedAssignee;
  const isAutoAssigned = !overrideAssignee && !!suggestedAssignee;

  const urgencyColor = suggestion
    ? suggestion.urgency === 'urgent' ? 'bg-red-50 border-red-200 text-red-800'
    : suggestion.urgency === 'high'   ? 'bg-amber-50 border-amber-200 text-amber-800'
    : 'bg-blue-50 border-blue-200 text-blue-800'
    : '';
  const UrgencyIcon = suggestion?.urgency === 'urgent' ? AlertTriangle : ArrowRight;

  async function handleSave() {
    if (!studentId || !summary.trim()) return;
    setSaving(true);

    const today = new Date().toISOString().slice(0, 10);

    await createCommunication(schoolId, {
      student_id: studentId,
      date: today,
      source,
      summary: summary.trim(),
      priority: suggestion?.priority || 'normal',
      staff_member: currentUser,
      follow_up_required: false,
      follow_up_date: null,
      linked_action_id: null,
      notes: null,
      routing_status: 'pending_review',
      suggested_assignee: effectiveAssignee || null,
    });

    setSaving(false);
    setSaved(true);
    setTimeout(() => { onSaved(); }, 900);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-100 flex items-center justify-center">
              <Phone className="w-5 h-5 text-teal-600" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900">Log Communication</h2>
              <p className="text-xs text-slate-500">Reception / call log — will be routed for review</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {saved ? (
          <div className="px-6 py-12 flex flex-col items-center gap-4 text-center">
            <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-teal-600" />
            </div>
            <div>
              <div className="font-semibold text-slate-800 text-base">Communication logged</div>
              {selectedStudent && (
                <div className="text-sm text-slate-500 mt-1">Added to the routing queue for {selectedStudent.name}.</div>
              )}
              {effectiveAssignee && (
                <div className="mt-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-teal-50 border border-teal-200 text-xs text-teal-700 font-medium">
                  <Route className="w-3 h-3" />
                  {isAutoAssigned ? 'Auto-suggested: ' : 'Assigned to: '}{effectiveAssignee}
                </div>
              )}
              <div className="text-xs text-slate-400 mt-3">Staff can review and confirm routing on the Communications page.</div>
            </div>
          </div>
        ) : (
          <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

            {/* Student search */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Student</label>
              <div className="relative">
                {selectedStudent ? (
                  <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-teal-300 bg-teal-50">
                    <div>
                      <span className="text-sm font-semibold text-slate-800">{selectedStudent.name}</span>
                      <span className="ml-2 text-xs text-slate-500">{selectedStudent.year_group} · {selectedStudent.form}</span>
                    </div>
                    <button
                      onClick={() => { setStudentId(''); setSearch(''); setOverrideAssignee(''); }}
                      className="text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                    <input
                      type="text"
                      value={search}
                      onChange={(e) => { setSearch(e.target.value); setShowStudentDropdown(true); }}
                      onFocus={() => setShowStudentDropdown(true)}
                      placeholder="Search student by name or year group..."
                      className="input-premium pl-9"
                      autoFocus
                    />
                    {showStudentDropdown && filteredStudents.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg z-10 overflow-hidden">
                        {filteredStudents.map(s => (
                          <button
                            key={s.id}
                            onClick={() => { setStudentId(s.id); setShowStudentDropdown(false); setSearch(''); }}
                            className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-teal-50 text-left transition-colors border-b border-slate-50 last:border-0"
                          >
                            <span className="text-sm font-medium text-slate-800">{s.name}</span>
                            <span className="text-xs text-slate-400">{s.year_group} · {s.form}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Student context panel */}
            {ctx && selectedStudent && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 space-y-3">
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Active actions</span>
                    <span className={`font-semibold ${ctx.activeCount > 0 ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {ctx.activeCount > 0 ? ctx.activeCount : 'None'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Safeguarding flag</span>
                    <span className={`font-semibold flex items-center gap-1 ${ctx.hasSafeguarding ? 'text-red-700' : 'text-slate-400'}`}>
                      {ctx.hasSafeguarding && <ShieldAlert className="w-3 h-3" />}
                      {ctx.hasSafeguarding ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Attendance signal</span>
                    <span className={`font-semibold flex items-center gap-1 ${ctx.attendanceSignal ? 'text-amber-700' : 'text-slate-400'}`}>
                      {ctx.attendanceSignal && <TrendingDown className="w-3 h-3" />}
                      {ctx.attendanceSignal ? `${selectedStudent.attendance_pct}%` : 'OK'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500">Behaviour signal</span>
                    <span className={`font-semibold ${ctx.behaviourSignal ? 'text-amber-700' : 'text-slate-400'}`}>
                      {ctx.behaviourSignal ? 'Raised' : 'OK'}
                    </span>
                  </div>
                </div>

                {/* Analysis intelligence */}
                {studentAnalysis && (
                  <div className="border-t border-slate-200 pt-3 space-y-2">
                    <div className="flex items-center gap-2">
                      <Brain className="w-3.5 h-3.5 text-teal-600" />
                      <span className="text-[10px] font-bold text-teal-600 uppercase tracking-widest">Intelligence</span>
                      {studentAnalysis.signal_category === 'red' && <span className="ml-auto text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">High Risk</span>}
                      {studentAnalysis.signal_category === 'amber' && <span className="ml-auto text-[10px] font-bold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">Watchlist</span>}
                    </div>
                    {studentAnalysis.barriers && (
                      <p className="text-xs text-slate-600 leading-relaxed">{studentAnalysis.barriers}</p>
                    )}
                    {studentAnalysis.suggested_next_steps && studentAnalysis.suggested_next_steps.length > 0 && (
                      <div className="space-y-1">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Suggested actions</div>
                        {studentAnalysis.suggested_next_steps.slice(0, 2).map((step, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${step.priority === 'urgent' ? 'bg-red-500' : step.priority === 'high' ? 'bg-amber-500' : 'bg-blue-400'}`} />
                            <span className="text-slate-700 flex-1">{step.action}</span>
                            <span className="text-slate-400 text-[10px]">{step.role}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Source type */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Type</label>
              <div className="grid grid-cols-3 gap-2">
                {SOURCE_OPTIONS.map(({ value, label, icon: Icon }) => (
                  <button
                    key={value}
                    onClick={() => setSource(value)}
                    className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border text-xs font-medium transition-colors ${
                      source === value
                        ? 'bg-teal-600 text-white border-teal-600'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-teal-300 hover:text-teal-700'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-center leading-tight">{label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Summary */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">Summary</label>
              <textarea
                value={summary}
                onChange={(e) => { setSummary(e.target.value); setSgDismissed(false); setSgAccepted(false); }}
                placeholder="Who called, what was raised, any immediate concerns..."
                className="input-premium w-full"
                rows={3}
              />
            </div>

            {/* Safeguarding alert */}
            {sgDetection && !saved && (
              <SafeguardingAlert
                detection={sgDetection}
                accepted={sgAccepted}
                onAccept={(dslName) => {
                  setOverrideAssignee(dslName);
                  setSgAccepted(true);
                }}
                onDismiss={!sgAccepted ? () => setSgDismissed(true) : undefined}
              />
            )}

            {/* Routing suggestion */}
            {suggestion && !sgDetection && (
              <div className={`flex items-start gap-3 p-4 rounded-xl border ${urgencyColor}`}>
                <UrgencyIcon className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold">{suggestion.reason}</div>
                  <div className="text-xs mt-0.5 opacity-80">
                    Will be suggested to <span className="font-semibold">{effectiveAssignee || suggestion.role}</span> for review
                  </div>
                </div>
              </div>
            )}

            {/* Routing destination — always shown when student selected */}
            {selectedStudent && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Route className="w-4 h-4 text-teal-600" />
                    <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Routing</span>
                  </div>
                  {isAutoAssigned && effectiveAssignee && (
                    <span className="text-[10px] font-semibold bg-teal-100 text-teal-700 px-2 py-0.5 rounded-full uppercase tracking-wider">Auto-suggested</span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={effectiveAssignee}
                    onChange={(e) => setOverrideAssignee(e.target.value)}
                    className="input-premium flex-1 text-sm"
                  >
                    <option value="">Leave unrouted — assign on Comms page</option>
                    {DEMO_STAFF.map(s => (
                      <option key={s.name} value={s.name}>{s.name}</option>
                    ))}
                  </select>
                  {overrideAssignee && (
                    <button
                      onClick={() => setOverrideAssignee('')}
                      className="text-xs text-slate-400 hover:text-slate-600 underline whitespace-nowrap"
                    >
                      Reset
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-400 mt-2">
                  This will appear in the <span className="font-medium text-slate-600">Needs Routing</span> queue on the Communications page for confirmation.
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleSave}
                disabled={!studentId || !summary.trim() || saving}
                className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? 'Logging...' : 'Log & send to review'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

