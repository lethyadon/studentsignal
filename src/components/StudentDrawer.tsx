import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getStudent, getAnalysisForStudent, getBehaviourRecords, getCareerProfile, getInterventions, addDemoIntervention, setDemoSignalStatus, type SignalStatus } from '../lib/data';
import type { Student, AnalysisResult, BehaviourRecord, CareerProfile, Intervention } from '../types';
import { Toast, useToast } from './Toast';
import { X, TrendingDown, Clock, GraduationCap, UserCheck, Phone, Briefcase, Plus, FileText, CheckSquare, MessageSquare, Loader2, Brain, AlertTriangle, Activity, Calendar, ShieldAlert, Target, ArrowUpRight, ArrowDownRight, TrendingUp, Star, Trophy, Award, Sparkles, Layers, CheckCircle, CreditCard as Edit2, ChevronRight } from 'lucide-react';

interface StudentDrawerProps {
  studentId: string | null;
  onClose: () => void;
  onCreateIntervention: (studentId: string) => void;
}

const MOCK_AI_SUMMARIES: Record<string, { riskScore: number; reasons: string[]; actions: string[]; pastoralNotes: string[] }> = {
  s1: {
    riskScore: 87,
    reasons: [
      'Attendance down from 91% to 78% over three weeks',
      '7 behaviour incidents in 14 days',
      '4 incidents in Maths — pattern with specific teacher',
      'Pupil Premium vulnerability increases risk',
      'Two pastoral comments suggest disengagement and low motivation',
    ],
    actions: [
      'Parent/carer contact this week',
      'Tutor check-in — explore home factors',
      'Attendance support meeting with HOY',
      'Speak with Maths teacher re: relationship concerns',
      'Review in 2 weeks',
    ],
    pastoralNotes: [
      'Student appears withdrawn in form time (Ms Jones, 12 Jun)',
      'Mum called school to flag possible friendship issues (10 Jun)',
    ],
  },
  s2: {
    riskScore: 81,
    reasons: [
      'Attendance below 75% — significantly below target',
      'EHCP in place — provision requires monitoring',
      'Repeated incidents in Science — anxiety trigger possible',
      'Safeguarding note recorded — DSL review required',
    ],
    actions: [
      'SEND review — check EHCP targets are being met',
      'Parent/carer contact — explore attendance barriers',
      'Science teacher liaison — consider seating/support adjustments',
      'DSL to review safeguarding note',
    ],
    pastoralNotes: [
      'EHCP review overdue by 3 weeks (SENCO note, 8 Jun)',
      'Student mentioned feeling anxious in Science (Ms Jones, 14 Jun)',
    ],
  },
  s3: {
    riskScore: 61,
    reasons: [
      'Attendance at 83% — below 85% threshold',
      'Refusal incident in PE — concerning pattern',
      'Pupil Premium — limited support at home',
      'Year 11 — destination risk if not addressed',
    ],
    actions: [
      'Pastoral meeting — explore reasons for PE refusal',
      'Parent/carer contact — attendance and wellbeing',
      'Careers conversation — link attendance to GCSE outcomes',
      'Consider mentoring referral',
    ],
    pastoralNotes: [
      'Student seems distracted and less engaged than usual (Mr Davis, 15 Jun)',
    ],
  },
  s4: {
    riskScore: 52,
    reasons: [
      'SEN Support in place — provision must be monitored',
      'Attendance at 88% — slightly below target',
      'Maths incidents — possible learning difficulty trigger',
      'Processing difficulties affect written tasks',
    ],
    actions: [
      'Tutor check-in — check provision is working',
      'Maths teacher follow-up — differentiation in place?',
      'Consider parent contact to discuss support',
    ],
    pastoralNotes: [
      'Student working hard but finds written tasks very difficult (Mr Smith, 16 Jun)',
    ],
  },
  s5: {
    riskScore: 58,
    reasons: [
      'Punctuality declining — 5 late marks in 3 weeks',
      'Peers report withdrawal from social groups',
      'Subject teachers note reduced engagement — previously high performer',
      'Pupil Premium — limited access to resources at home',
    ],
    actions: [
      'Discreet pastoral conversation — do not raise in group settings',
      'Check for home circumstances changes',
      'IT/computing pathways — maintain motivation',
    ],
    pastoralNotes: [
      'Student seems quieter than usual — worth a check-in (Mr Smith, 15 Jun)',
    ],
  },
  s6: {
    riskScore: 15,
    reasons: [
      'Behaviour incidents down 70% since January intervention',
      'Attendance improved from 88% to 94%',
      'Receiving consistent praise from Business and English teachers',
      'Showing leadership qualities in group activities',
    ],
    actions: [
      'Share positive progress with parent/carer',
      'Nominate for termly achievement award',
      'Explore A Level Business / marketing apprenticeship options',
    ],
    pastoralNotes: [
      'Outstanding presentation to class — genuine confidence emerging (Mr Lee, 15 Jun)',
    ],
  },
  s7: {
    riskScore: 54,
    reasons: [
      'Gradual drop in effort over 6 weeks — easy to miss',
      'Punctuality worsening — 4 late marks this half term',
      'Disengagement from Art — was previously enthusiastic',
    ],
    actions: [
      'Discreet 1:1 conversation with trusted adult',
      'Art teacher to gently re-engage',
      'Explore whether home circumstances have changed',
    ],
    pastoralNotes: [
      'Less engaged than usual — worth watching (Ms Clark, 10 Jun)',
    ],
  },
  s8: {
    riskScore: 10,
    reasons: [
      'Behaviour incidents at near zero — remarkable improvement',
      'Attendance consistently above 95%',
      'Multiple praise entries from Science, English, and PE',
      'Marked improvement from start of year',
    ],
    actions: [
      'Share positive update with parent/carer',
      'Explore sports science / medicine university pathway',
      'Consider for Pupil Premium success story',
    ],
    pastoralNotes: [
      'Incredible turnaround this year — a real success story (Mr Davis, 16 Jun)',
    ],
  },
  s9: {
    riskScore: 2,
    reasons: [
      'Perfect or near-perfect attendance all year',
      'Top of year group in Science and Maths mocks',
      'Essay shortlisted for national writing competition',
      'Voluntarily tutoring peers in her own time',
    ],
    actions: [
      'Head teacher commendation',
      'Submit for county-level achievement award',
      'University mentoring referral — medical research pathway',
    ],
    pastoralNotes: [
      'Exceptional student — a role model for the whole school (Ms Jones, 14 Jun)',
    ],
  },
  s10: {
    riskScore: 4,
    reasons: [
      'Outstanding coding project — self-directed learning',
      'Attendance 97% despite SEN challenges',
      'Artwork selected for school exhibition',
      'Remarkable resilience demonstrated throughout the year',
    ],
    actions: [
      "Showcase coding project at parents' evening",
      'Pupil of the Term nomination',
      'Explore software engineering apprenticeships and university options',
    ],
    pastoralNotes: [
      'A genuine inspiration — growth has been remarkable (Mr Patel, 17 Jun)',
    ],
  },
};

interface TimelineItem {
  date: string;
  title: string;
  category: 'Behaviour' | 'Attendance' | 'Pastoral' | 'Intervention' | 'Outcome' | 'SEND';
  note: string;
  severity?: 'high' | 'medium' | 'low';
}

function buildTimeline(behaviour: BehaviourRecord[], interventions: Intervention[]): TimelineItem[] {
  const items: TimelineItem[] = [
    ...behaviour.map((b) => ({
      date: b.date,
      title: b.incident_type + (b.subject ? ` — ${b.subject}` : ''),
      category: 'Behaviour' as const,
      note: b.comment || `${b.behaviour_points} behaviour points`,
      severity: b.behaviour_points >= 10 ? 'high' as const : b.behaviour_points >= 5 ? 'medium' as const : 'low' as const,
    })),
    ...interventions.map((i) => ({
      date: i.created_at.split('T')[0],
      title: i.action_type,
      category: (i.status === 'completed' ? 'Outcome' : 'Intervention') as 'Intervention' | 'Outcome',
      note: i.outcome || i.notes || '',
      severity: i.priority === 'urgent' ? 'high' as const : i.priority === 'high' ? 'medium' as const : 'low' as const,
    })),
  ];
  return items.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);
}

const CATEGORY_COLORS: Record<string, string> = {
  Behaviour: 'bg-red-100 text-red-700',
  Attendance: 'bg-blue-100 text-blue-700',
  Pastoral: 'bg-purple-100 text-purple-700',
  Intervention: 'bg-teal-100 text-teal-700',
  Outcome: 'bg-emerald-100 text-emerald-700',
  SEND: 'bg-amber-100 text-amber-700',
};

const CATEGORY_DOT: Record<string, string> = {
  Behaviour: 'bg-red-400',
  Attendance: 'bg-blue-400',
  Pastoral: 'bg-purple-400',
  Intervention: 'bg-teal-400',
  Outcome: 'bg-emerald-400',
  SEND: 'bg-amber-400',
};

export default function StudentDrawer({ studentId, onClose, onCreateIntervention }: StudentDrawerProps) {
  const { profile, demoMode } = useAuth();
  const navigate = useNavigate();
  const { toasts, addToast, dismissToast } = useToast();
  const [student, setStudent] = useState<Student | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [behaviour, setBehaviour] = useState<BehaviourRecord[]>([]);
  const [career, setCareer] = useState<CareerProfile | null>(null);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeSection, setActiveSection] = useState<'summary' | 'timeline' | 'evidence'>('summary');
  // Recommendation card edit state
  const [editMode, setEditMode] = useState(false);
  const [editedActionType, setEditedActionType] = useState('');
  const [editedOwner, setEditedOwner] = useState('');
  const [editedDeadline, setEditedDeadline] = useState('');

  useEffect(() => {
    if (!studentId) {
      setStudent(null); setAnalysis(null); setBehaviour([]); setCareer(null); setInterventions([]);
      setEditMode(false); setEditedActionType(''); setEditedOwner(''); setEditedDeadline('');
      return;
    }
    async function load() {
      setLoading(true);
      const [s, a, b, c, i] = await Promise.all([
        getStudent(profile?.school_id, studentId!),
        getAnalysisForStudent(profile?.school_id, studentId!),
        getBehaviourRecords(profile?.school_id, studentId!),
        getCareerProfile(profile?.school_id, studentId!),
        getInterventions(profile?.school_id, studentId!),
      ]);
      setStudent(s);
      setAnalysis(a);
      setBehaviour(b);
      setCareer(c);
      setInterventions(i);
      setLoading(false);
    }
    load();
  }, [studentId, profile?.school_id]);

  async function markReviewed() {
    if (!studentId) return;
    setSaving(true);
    if (demoMode) {
      setDemoSignalStatus(studentId, 'dismissed' as SignalStatus);
    } else if (profile?.school_id) {
      await supabase.from('analysis_results')
        .update({ updated_at: new Date().toISOString() })
        .eq('student_id', studentId).eq('school_id', profile.school_id);
      await supabase.from('interventions').insert({
        school_id: profile.school_id,
        student_id: studentId,
        assigned_to: (profile as any).full_name || 'Staff',
        created_by: (profile as any).full_name || 'Staff',
        action_type: 'Signal reviewed — no further action',
        priority: 'low',
        status: 'completed',
        due_date: null,
        notes: `Reviewed on ${new Date().toLocaleDateString()} — no action required at this time.`,
        outcome: null,
        created_at: new Date().toISOString(),
      });
    }
    addToast(`${student?.name || 'Student'} — marked as reviewed, removed from priorities`, 'success');
    setSaving(false);
    onClose();
  }

  async function createActionFromRec(actionType: string, owner: string, priority: string, dueDate: string, reviewDate: string, reason: string) {
    if (!studentId || !student) return;
    setSaving(true);
    const intervention: Intervention = {
      id: `draft-${Date.now()}`,
      student_id: studentId,
      assigned_to: owner,
      created_by: (profile as any)?.full_name || 'Staff',
      action_type: actionType,
      priority: priority as Intervention['priority'],
      status: 'open',
      due_date: dueDate,
      review_date: reviewDate,
      notes: reason ? `Reason: ${reason}` : null,
      outcome: null,
      baseline_attendance: student.attendance_pct ?? null,
      baseline_behaviour: behaviour.filter(b => b.behaviour_points > 0).length || null,
      created_at: new Date().toISOString(),
    };
    if (demoMode) {
      const created = addDemoIntervention(intervention);
      if (!created) {
        addToast(`An active "${actionType}" already exists for ${student.name} — view it in the Actions tab.`, 'error');
        setSaving(false);
        return;
      }
      setDemoSignalStatus(studentId, 'action_in_progress' as SignalStatus);
    } else if (profile?.school_id) {
      const { error } = await supabase.from('interventions').insert({ ...intervention, school_id: profile.school_id });
      if (error) { addToast('Failed to create action', 'error'); setSaving(false); return; }
    }
    addToast(`Action created for ${student.name}: ${actionType}`, 'success');
    setSaving(false);
    setEditMode(false);
    onClose();
  }

  async function addNote() {
    if (!studentId || !profile?.school_id || !note.trim()) return;
    setSaving(true);
    await supabase.from('interventions').insert({
      school_id: profile.school_id,
      student_id: studentId,
      assigned_to: profile.id,
      action_type: 'Pastoral note',
      priority: 'low',
      status: 'completed',
      notes: note,
    });
    setNote('');
    setShowNoteForm(false);
    setSaving(false);
  }

  const totalPoints = behaviour.reduce((sum, r) => sum + (r.behaviour_points || 0), 0);
  const totalPositivePoints = behaviour.reduce((sum, r) => sum + (r.positive_points || 0), 0);
  const recentComments = behaviour.filter((b) => b.comment && b.comment.trim() && b.behaviour_points > 0).slice(0, 3);
  const isPositive = analysis?.signal_category === 'green' || analysis?.signal_category === 'blue';
  const isHiddenDecline = analysis?.signal_category === 'purple';

  // Derive evidence from real records — no circular AI text
  const riskScore = analysis?.risk_score ?? (
    student?.risk_level === 'red' ? 72 : student?.risk_level === 'amber' ? 44 : 18
  );

  // Evidence items derived from raw data
  const evidenceItems: string[] = (analysis?.key_reasons || []);

  // Recommended actions from analysis (not hallucinated)
  const recommendedActions = [
    analysis?.suggested_pastoral_action,
    analysis?.suggested_parent_contact,
    analysis?.suggested_staff_action,
  ].filter(Boolean) as string[];

  // Staff notes from behaviour record comments (for pastoral context)
  const staffComments = recentComments.map((c) => `${c.comment} — ${c.staff_member || 'staff'}, ${c.date}`);

  const signalBadgeClass = () => {
    const cat = analysis?.signal_category || student?.risk_level;
    if (cat === 'red') return 'bg-red-100 text-red-700 border-red-200';
    if (cat === 'amber') return 'bg-amber-100 text-amber-700 border-amber-200';
    if (cat === 'purple') return 'bg-purple-100 text-purple-700 border-purple-200';
    if (cat === 'green') return 'bg-emerald-100 text-emerald-700 border-emerald-200';
    if (cat === 'blue') return 'bg-blue-100 text-blue-700 border-blue-200';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  const signalLabel = () => {
    const cat = analysis?.signal_category || student?.risk_level;
    if (cat === 'red') return 'Priority Support';
    if (cat === 'amber') return 'Watchlist';
    if (cat === 'purple') return 'Hidden Decline';
    if (cat === 'green') return 'Positive Growth';
    if (cat === 'blue') return 'Exceptional';
    return cat || 'unknown';
  };

  const avatarClass = () => {
    const cat = analysis?.signal_category || student?.risk_level;
    if (cat === 'red') return 'bg-red-100 text-red-700';
    if (cat === 'amber') return 'bg-amber-100 text-amber-700';
    if (cat === 'purple') return 'bg-purple-100 text-purple-700';
    if (cat === 'green') return 'bg-emerald-100 text-emerald-700';
    if (cat === 'blue') return 'bg-blue-100 text-blue-700';
    return 'bg-slate-100 text-slate-700';
  };

  const timeline = buildTimeline(behaviour, interventions);

  if (!studentId) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg bg-white shadow-2xl h-full overflow-y-auto flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
          </div>
        ) : !student ? (
          <div className="flex-1 flex items-center justify-center text-slate-500">Student not found</div>
        ) : (
          <>
            {/* Header */}
            <div className="sticky top-0 bg-white z-10 border-b border-slate-100 px-6 py-5">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center font-bold text-lg ${avatarClass()}`}>
                    {(student.name || '').split(' ').filter(Boolean).map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <div className="font-bold text-slate-900 text-lg leading-tight">{student.name}</div>
                    <div className="text-xs text-slate-500">{student.year_group} &bull; {student.form}</div>
                  </div>
                </div>
                <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="flex items-center gap-2 flex-wrap mb-4">
                <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${signalBadgeClass()}`}>
                  {signalLabel()}
                </span>
                <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                  isPositive
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : riskScore >= 70 ? 'bg-red-50 text-red-700 border-red-200' :
                      riskScore >= 40 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                      'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}>
                  {isPositive ? `+${100 - riskScore} strength` : `Risk score: ${riskScore}/100`}
                </span>
                {student.pupil_premium && <span className="badge-blue">Pupil Premium</span>}
                {student.send_status && <span className="badge-purple">{student.send_status}</span>}
              </div>

              {/* Section tabs */}
              <div className="flex gap-1">
                {(['summary', 'timeline', 'evidence'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setActiveSection(s)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      activeSection === s ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    {s === 'summary' ? 'Summary' : s === 'timeline' ? 'Timeline' : 'Evidence'}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-6 py-6 space-y-6 flex-1">

              {activeSection === 'summary' && (
                <>
                  {/* ── Open actions ── */}
                  {student && (() => {
                    const activeInts = interventions.filter(i => ['open', 'in_progress', 'assigned', 'suggested'].includes(i.status));
                    if (activeInts.length === 0) return null;
                    return (
                      <div className="rounded-xl border border-amber-200 overflow-hidden">
                        <div className="px-4 py-2.5 bg-amber-500 flex items-center justify-between">
                          <span className="text-white text-xs font-bold uppercase tracking-widest">
                            {activeInts.length} open action{activeInts.length > 1 ? 's' : ''} — why {(student.name || '').split(' ')[0] || student.name} is in your queue
                          </span>
                          <button
                            onClick={() => { navigate(`/students/${student.id}?tab=actions`); onClose(); }}
                            className="text-[10px] font-bold text-white/90 hover:text-white underline underline-offset-2"
                          >
                            View all
                          </button>
                        </div>
                        <div className="px-4 py-3 bg-amber-50 space-y-2">
                          {activeInts.slice(0, 3).map(int => {
                            const priorityDot = int.priority === 'urgent' ? 'bg-red-500' : int.priority === 'high' ? 'bg-orange-500' : 'bg-amber-400';
                            return (
                              <button
                                key={int.id}
                                onClick={() => { navigate(`/students/${student.id}?tab=actions&highlight=${int.id}`); onClose(); }}
                                className="w-full text-left flex items-start gap-2 px-3 py-2.5 rounded-lg border border-amber-200 bg-white hover:bg-amber-50 transition-colors"
                              >
                                <span className={`w-2 h-2 rounded-full mt-1 shrink-0 ${priorityDot}`} />
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs font-bold text-slate-800">{int.action_type}</span>
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold uppercase tracking-wider bg-slate-100 text-slate-600">
                                      {int.status.replace('_', ' ')}
                                    </span>
                                    {int.priority === 'urgent' && <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold bg-red-100 text-red-700 uppercase">URGENT</span>}
                                  </div>
                                  {int.assigned_to && <div className="text-[11px] text-slate-500 mt-0.5">{int.assigned_to}{int.due_date ? ` · Due ${int.due_date}` : ''}</div>}
                                </div>
                                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}
                  {/* ── Pre-filled Action Recommendation card ── */}
                  {!isPositive && student && (() => {
                    const cat = analysis?.signal_category || student.signal_category || 'amber';
                    const isRed = cat === 'red';
                    const hasSafeguarding = behaviour.some(b => b.safeguarding_note);
                    const hasEHCP = student.send_status?.toLowerCase().includes('ehcp');

                    const derivedActionType = hasSafeguarding
                      ? 'DSL welfare review + CPOMS update'
                      : hasEHCP
                      ? 'EHCP emergency review with SENDCo'
                      : isRed
                      ? 'Immediate pastoral meeting'
                      : cat === 'purple'
                      ? 'Discreet welfare check — do not disclose to student'
                      : 'Pastoral meeting + parent/carer contact';

                    const derivedOwner = hasSafeguarding
                      ? 'Mr Ahmed (DSL)'
                      : hasEHCP
                      ? 'Ms Jones (SENDCo)'
                      : `Ms Harris (HOY ${student.year_group})`;

                    const todayObj = new Date();
                    const dueDateObj = new Date(todayObj);
                    if (!isRed) {
                      const dow = todayObj.getDay();
                      dueDateObj.setDate(todayObj.getDate() + Math.max(1, dow <= 5 ? 5 - dow : 6));
                    }
                    const dueDateISO = dueDateObj.toISOString().split('T')[0];
                    const dueDateDisplay = isRed ? 'Today' : dueDateObj.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

                    const reviewDays = isRed ? 3 : 5;
                    const reviewDateObj = new Date(todayObj);
                    reviewDateObj.setDate(todayObj.getDate() + reviewDays);
                    const reviewDateISO = reviewDateObj.toISOString().split('T')[0];
                    const reviewDateDisplay = `${reviewDays} school days (${reviewDateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})`;

                    const priority = isRed ? 'urgent' : cat === 'purple' ? 'high' : 'medium';
                    const reason = evidenceItems.slice(0, 2).join('; ') || 'Pattern detected across data sources';
                    const evidenceSummary = [
                      student.attendance_pct !== undefined ? `Attendance: ${student.attendance_pct}%` : null,
                      behaviour.filter(b => b.behaviour_points > 0).length > 0
                        ? `${behaviour.filter(b => b.behaviour_points > 0).length} behaviour incidents` : null,
                      hasSafeguarding ? 'Safeguarding note on record' : null,
                    ].filter(Boolean).join(' · ');

                    const actionType = editedActionType || derivedActionType;
                    const owner = editedOwner || derivedOwner;
                    const deadline = editedDeadline || dueDateDisplay;

                    return (
                      <div className="rounded-xl border border-slate-200 overflow-hidden shadow-sm">
                        {/* Header */}
                        <div className="bg-slate-800 px-4 py-2.5 flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Brain className="w-4 h-4 text-teal-400" />
                            <span className="text-white text-xs font-bold uppercase tracking-widest">Action Recommendation</span>
                          </div>
                          {editMode && (
                            <span className="text-amber-300 text-[10px] font-bold uppercase tracking-wider bg-amber-500/20 px-2 py-0.5 rounded">Editing</span>
                          )}
                        </div>

                        {/* Fields */}
                        <div className="bg-white px-4 py-3 space-y-3">
                          {/* Action type */}
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Action type</div>
                            {editMode ? (
                              <input
                                value={editedActionType || actionType}
                                onChange={e => setEditedActionType(e.target.value)}
                                className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                              />
                            ) : (
                              <p className="text-sm font-bold text-slate-900">{actionType}</p>
                            )}
                          </div>

                          <div className="grid grid-cols-2 gap-3">
                            {/* Owner */}
                            <div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Suggested owner</div>
                              {editMode ? (
                                <input
                                  value={editedOwner || owner}
                                  onChange={e => setEditedOwner(e.target.value)}
                                  className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                              ) : (
                                <p className="text-xs font-semibold text-slate-800">{owner}</p>
                              )}
                            </div>

                            {/* Deadline */}
                            <div>
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Deadline</div>
                              {editMode ? (
                                <input
                                  type="date"
                                  defaultValue={dueDateISO}
                                  onChange={e => setEditedDeadline(new Date(e.target.value).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }))}
                                  className="w-full text-xs font-semibold border border-slate-200 rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-2 focus:ring-teal-500"
                                />
                              ) : (
                                <p className="text-xs font-semibold text-slate-800">{deadline}</p>
                              )}
                            </div>
                          </div>

                          {/* Reason */}
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Reason</div>
                            <p className="text-xs text-slate-700 leading-snug">{reason}</p>
                          </div>

                          {/* Evidence */}
                          {evidenceSummary && (
                            <div className="bg-slate-50 rounded-lg px-3 py-2 border border-slate-100">
                              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Evidence used</div>
                              <p className="text-xs text-slate-600">{evidenceSummary}</p>
                            </div>
                          )}

                          {/* Review date */}
                          <div>
                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Review date</div>
                            <p className="text-xs text-slate-700">{reviewDateDisplay}</p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="border-t border-slate-100 bg-slate-50 px-4 py-3 flex gap-2">
                          <button
                            onClick={() => createActionFromRec(actionType, owner, priority, dueDateISO, reviewDateISO, reason)}
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-1.5 bg-slate-900 text-white text-xs font-bold rounded-xl py-2.5 hover:bg-slate-800 transition-colors disabled:opacity-50"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            {saving ? 'Creating...' : 'Create action'}
                          </button>
                          <button
                            onClick={() => {
                              if (editMode) {
                                setEditMode(false);
                              } else {
                                setEditedActionType(actionType);
                                setEditedOwner(owner);
                                setEditedDeadline(deadline);
                                setEditMode(true);
                              }
                            }}
                            className="px-3 flex items-center gap-1 border border-slate-200 bg-white text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-50 transition-colors"
                          >
                            <Edit2 className="w-3 h-3" />
                            {editMode ? 'Cancel' : 'Modify'}
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Positive signal explanation */}
                  {isPositive && analysis?.signal_explanation && (
                    <div className="p-4 rounded-xl bg-gradient-to-br from-emerald-50 to-blue-50 border border-emerald-200">
                      <div className="flex items-center gap-2 mb-2">
                        {analysis.signal_category === 'blue' ? <Star className="w-4 h-4 text-blue-500" /> : <TrendingUp className="w-4 h-4 text-emerald-500" />}
                        <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                          {analysis.signal_category === 'blue' ? 'Exceptional Achievement' : 'Positive Growth'}
                        </span>
                      </div>
                      <p className="text-sm text-slate-700 leading-relaxed">{analysis.signal_explanation}</p>
                    </div>
                  )}

                  {/* Hidden decline explanation */}
                  {isHiddenDecline && analysis?.signal_explanation && (
                    <div className="p-4 rounded-xl bg-purple-50 border border-purple-200">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingDown className="w-4 h-4 text-purple-500" />
                        <span className="text-xs font-semibold text-purple-600 uppercase tracking-wider">Hidden Decline — Handle with care</span>
                      </div>
                      <p className="text-sm text-purple-800 leading-relaxed">{analysis.signal_explanation}</p>
                    </div>
                  )}

                  {/* Why flagged (risk students) */}
                  {!isPositive && evidenceItems.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Evidence — why this student was flagged</div>
                      <div className="space-y-1.5">
                        {evidenceItems.map((r, i) => (
                          <div key={i} className="flex items-start gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
                            <span className="w-1.5 h-1.5 rounded-full bg-slate-400 mt-1.5 shrink-0" />
                            {r}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 italic">Raw data metrics from uploaded records.</p>
                    </div>
                  )}

                  {/* Quick stats */}
                  <div className="grid grid-cols-3 gap-3">
                    {isPositive ? (
                      <>
                        <div className="bg-emerald-50 rounded-xl p-3 text-center border border-emerald-100">
                          <div className="text-xl font-bold text-emerald-700">{student.positive_points ?? totalPositivePoints}</div>
                          <div className="text-[10px] text-emerald-600 uppercase tracking-wider mt-1">Praise pts</div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                          <div className="text-xl font-bold text-slate-800">{student.attendance_pct ?? 95}%</div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Attendance</div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                          <div className="text-xl font-bold text-slate-800">{behaviour.filter((b) => b.positive_points).length}</div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Praise entries</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                          <div className={`text-xl font-bold ${totalPoints > 30 ? 'text-red-600' : totalPoints > 10 ? 'text-amber-600' : 'text-slate-800'}`}>{totalPoints}</div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Behaviour pts</div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                          <div className={`text-xl font-bold ${(student.attendance_pct || 95) < 85 ? 'text-red-600' : (student.attendance_pct || 95) < 92 ? 'text-amber-600' : 'text-slate-800'}`}>{student.attendance_pct ?? 95}%</div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Attendance</div>
                        </div>
                        <div className="bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
                          <div className="text-xl font-bold text-slate-800">{behaviour.length}</div>
                          <div className="text-[10px] text-slate-500 uppercase tracking-wider mt-1">Incidents</div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Positive: before/after */}
                  {isPositive && analysis?.previous_state && analysis.current_state && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-red-50 border border-red-100 rounded-xl px-3 py-3">
                        <div className="text-[10px] text-red-500 font-semibold uppercase tracking-wide mb-1">Before</div>
                        <p className="text-xs text-red-800 leading-snug">{analysis.previous_state}</p>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-3">
                        <div className="text-[10px] text-emerald-600 font-semibold uppercase tracking-wide mb-1">Now</div>
                        <p className="text-xs text-emerald-800 leading-snug">{analysis.current_state}</p>
                      </div>
                    </div>
                  )}

                  {/* Trends (risk/hidden students) */}
                  {!isPositive && (
                    <div className="grid grid-cols-2 gap-3">
                      <div className={`p-3 rounded-xl border ${analysis?.behaviour_trend === 'Escalating' || analysis?.behaviour_trend === 'Hidden decline' ? 'bg-red-50 border-red-100' : analysis?.behaviour_trend === 'Concerning' ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <Activity className="w-3.5 h-3.5 text-slate-500" />
                          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Behaviour</div>
                        </div>
                        <div className={`text-sm font-bold ${analysis?.behaviour_trend === 'Escalating' || analysis?.behaviour_trend === 'Hidden decline' ? 'text-red-700' : analysis?.behaviour_trend === 'Concerning' ? 'text-amber-700' : 'text-emerald-700'}`}>{analysis?.behaviour_trend || 'Unknown'}</div>
                      </div>
                      <div className={`p-3 rounded-xl border ${analysis?.attendance_trend === 'Declining' ? 'bg-red-50 border-red-100' : analysis?.attendance_trend === 'Below target' || analysis?.attendance_trend?.includes('punctuality') ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
                        <div className="flex items-center gap-2 mb-1">
                          <TrendingDown className="w-3.5 h-3.5 text-slate-500" />
                          <div className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Attendance</div>
                        </div>
                        <div className={`text-sm font-bold ${analysis?.attendance_trend === 'Declining' ? 'text-red-700' : analysis?.attendance_trend === 'Below target' ? 'text-amber-700' : 'text-emerald-700'}`}>{analysis?.attendance_trend || 'Unknown'}</div>
                      </div>
                    </div>
                  )}

                  {/* Staff comments from records */}
                  {staffComments.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Staff record comments</div>
                      <div className="space-y-2">
                        {staffComments.map((n, i) => (
                          <div key={i} className={`flex items-start gap-2 p-3 rounded-xl text-xs ${isPositive ? 'bg-emerald-50 border border-emerald-100 text-emerald-800' : 'bg-slate-50 border border-slate-200 text-slate-700'}`}>
                            {isPositive ? <Sparkles className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" /> : <ShieldAlert className="w-3.5 h-3.5 text-slate-400 mt-0.5 shrink-0" />}
                            {n}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recognition suggestion */}
                  {isPositive && analysis?.suggested_recognition && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Suggested recognition</div>
                      <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                        <Award className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-800">{analysis.suggested_recognition}</p>
                      </div>
                    </div>
                  )}

                  {/* SEND / Pupil Premium */}
                  {(student.send_status || student.pupil_premium) && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">SEND / Pupil Premium context</div>
                      <div className="p-3 rounded-xl bg-amber-50 border border-amber-100 text-sm text-amber-800 space-y-1">
                        {student.send_status && <div className="flex items-center gap-2"><Brain className="w-3.5 h-3.5" /><span>{student.send_status}</span></div>}
                        {student.pupil_premium && <div className="flex items-center gap-2"><Target className="w-3.5 h-3.5" /><span>Pupil Premium eligible</span></div>}
                      </div>
                    </div>
                  )}

                  {/* Career concern */}
                  {career && career.destination_risk && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Career / destination</div>
                      <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-sm text-slate-700">
                        <div className="flex items-center gap-2 mb-1">
                          <GraduationCap className="w-4 h-4 text-teal-600" />
                          <span className={`font-semibold ${career.destination_risk.includes('risk') ? 'text-red-600' : 'text-slate-800'}`}>{career.destination_risk}</span>
                        </div>
                        <div className="text-xs text-slate-500">Interests: {career.career_interests?.join(', ')}</div>
                        {career.career_goal && <div className="text-xs text-slate-500 mt-0.5">Goal: {career.career_goal}</div>}
                        {career.barriers && <div className="text-xs text-slate-500 mt-0.5">Barriers: {career.barriers}</div>}
                      </div>
                    </div>
                  )}

                  {/* Recommended actions (risk/hidden only) */}
                  {!isPositive && analysis && (analysis.suggested_pastoral_action || analysis.suggested_parent_contact || analysis.suggested_staff_action) && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Recommended actions</div>
                      <div className="space-y-2">
                        {analysis.suggested_pastoral_action && (
                          <button
                            onClick={() => { navigate(`/students/${student.id}?tab=actions`); onClose(); }}
                            className="w-full flex items-start gap-3 p-3 rounded-xl bg-red-50 border border-red-100 hover:bg-red-100 transition-colors text-left group"
                          >
                            <UserCheck className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
                            <div className="flex-1 text-sm text-red-700">{analysis.suggested_pastoral_action}</div>
                            <ArrowUpRight className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                        {analysis.suggested_parent_contact && (
                          <button
                            onClick={() => { navigate(`/students/${student.id}?tab=actions`); onClose(); }}
                            className="w-full flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100 hover:bg-amber-100 transition-colors text-left group"
                          >
                            <Phone className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
                            <div className="flex-1 text-sm text-amber-700">{analysis.suggested_parent_contact}</div>
                            <ArrowUpRight className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                        {analysis.suggested_staff_action && (
                          <button
                            onClick={() => { navigate(`/students/${student.id}?tab=actions`); onClose(); }}
                            className="w-full flex items-start gap-3 p-3 rounded-xl bg-blue-50 border border-blue-100 hover:bg-blue-100 transition-colors text-left group"
                          >
                            <Briefcase className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                            <div className="flex-1 text-sm text-blue-700">{analysis.suggested_staff_action}</div>
                            <ArrowUpRight className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </button>
                        )}
                        <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                          <Clock className="w-4 h-4 text-slate-500 mt-0.5" />
                          <div className="text-sm text-slate-600">Review due: <span className="font-semibold text-slate-800">{analysis.recommended_review_date || 'Not set'}</span></div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Positive: parent contact suggestion */}
                  {isPositive && analysis?.suggested_parent_contact && (
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-100">
                      <Phone className="w-4 h-4 text-emerald-600 mt-0.5" />
                      <div className="text-sm text-emerald-700">{analysis.suggested_parent_contact}</div>
                    </div>
                  )}

                  {/* Add note form */}
                  {showNoteForm && (
                    <div className="space-y-2">
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="input-premium"
                        rows={3}
                        placeholder="Add a pastoral note..."
                      />
                      <div className="flex gap-2">
                        <button onClick={addNote} disabled={saving || !note.trim()} className="btn-primary py-2 text-xs">
                          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                          Add note
                        </button>
                        <button onClick={() => setShowNoteForm(false)} className="btn-secondary py-2 text-xs">Cancel</button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {activeSection === 'timeline' && (
                <div>
                  <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">Recent events</div>
                  {timeline.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                      <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40" />
                      <p className="text-sm">No events recorded yet</p>
                    </div>
                  ) : (
                    <div className="relative border-l-2 border-slate-200 ml-3 space-y-5">
                      {timeline.map((event, idx) => (
                        <div key={idx} className="relative pl-6">
                          <div className={`absolute -left-[9px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-slate-200 flex items-center justify-center`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${CATEGORY_DOT[event.category] || 'bg-slate-400'}`} />
                          </div>
                          <div className="text-xs text-slate-400 font-medium mb-0.5">{event.date}</div>
                          <div className="flex items-start gap-2 flex-wrap mb-0.5">
                            <div className="text-sm font-bold text-slate-800">{event.title}</div>
                            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${CATEGORY_COLORS[event.category] || 'bg-slate-100 text-slate-600'}`}>{event.category}</span>
                            {event.severity === 'high' && <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider bg-red-100 text-red-700">High</span>}
                          </div>
                          {event.note && <div className="text-xs text-slate-500">{event.note}</div>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeSection === 'evidence' && (
                <div className="space-y-5">
                  {/* Score card */}
                  <div className={`p-4 rounded-xl bg-gradient-to-br ${isPositive ? 'from-emerald-700 to-teal-900' : 'from-slate-800 to-slate-900'} text-white`}>
                    <div className="flex items-center gap-2 mb-3">
                      <Layers className={`w-4 h-4 ${isPositive ? 'text-emerald-300' : 'text-teal-400'}`} />
                      <span className={`text-xs font-semibold uppercase tracking-wider ${isPositive ? 'text-emerald-300' : 'text-teal-400'}`}>
                        {isPositive ? 'Positive Signal Summary' : 'Evidence Summary'}
                      </span>
                    </div>
                    {isPositive ? (
                      <>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="text-3xl font-bold">+{100 - riskScore}<span className="text-lg font-medium text-slate-300">/100</span></div>
                          <div>
                            <div className="text-xs text-slate-300">Strength score</div>
                            <span className="text-sm font-bold text-emerald-300">{analysis?.signal_category === 'blue' ? 'EXCEPTIONAL' : 'POSITIVE GROWTH'}</span>
                          </div>
                        </div>
                        <div className="w-full bg-white/20 rounded-full h-2">
                          <div className="h-2 rounded-full bg-emerald-400 transition-all" style={{ width: `${100 - riskScore}%` }} />
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 mb-2">
                          <div className="text-3xl font-bold">{riskScore}<span className="text-lg font-medium text-slate-400">/100</span></div>
                          <div>
                            <div className="text-xs text-slate-400">Risk score</div>
                            <span className={`text-sm font-bold ${analysis?.signal_category === 'red' ? 'text-red-400' : analysis?.signal_category === 'purple' ? 'text-purple-400' : 'text-amber-400'}`}>{signalLabel().toUpperCase()}</span>
                          </div>
                        </div>
                        <div className="w-full bg-slate-700 rounded-full h-2">
                          <div
                            className={`h-2 rounded-full transition-all ${riskScore >= 70 ? 'bg-red-500' : riskScore >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${riskScore}%` }}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  {/* Evidence from raw records */}
                  {evidenceItems.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        {isPositive ? 'Evidence of positive progress' : isHiddenDecline ? 'Detected decline signals' : 'Evidence from records'}
                      </div>
                      <div className="space-y-1.5">
                        {evidenceItems.map((r, i) => (
                          <div key={i} className={`flex items-start gap-2 p-2.5 rounded-lg text-xs border ${
                            isPositive
                              ? 'bg-emerald-50 border-emerald-100 text-emerald-800'
                              : isHiddenDecline
                              ? 'bg-violet-50 border-violet-100 text-violet-800'
                              : 'bg-red-50 border-red-100 text-red-800'
                          }`}>
                            {isPositive
                              ? <Star className="w-3.5 h-3.5 text-emerald-500 mt-0.5 shrink-0" />
                              : <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />}
                            {r}
                          </div>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-2 italic">Source: uploaded records — not AI-generated conclusions.</p>
                    </div>
                  )}

                  {/* Recommended actions */}
                  {recommendedActions.length > 0 && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">
                        {isPositive ? 'Suggested next steps' : 'Recommended actions'}
                      </div>
                      <div className="space-y-2">
                        {recommendedActions.map((a, i) => (
                          <button
                            key={i}
                            onClick={() => { navigate(`/students/${student.id}?tab=actions`); onClose(); }}
                            className={`w-full flex items-start gap-2 p-3 rounded-xl text-sm text-left group transition-colors ${
                              isPositive
                                ? 'bg-blue-50 border border-blue-100 text-blue-800 hover:bg-blue-100'
                                : 'bg-teal-50 border border-teal-100 text-teal-800 hover:bg-teal-100'
                            }`}
                          >
                            <CheckSquare className={`w-3.5 h-3.5 mt-0.5 shrink-0 ${isPositive ? 'text-blue-500' : 'text-teal-600'}`} />
                            <span className="flex-1">{a}</span>
                            <ArrowUpRight className={`w-3.5 h-3.5 mt-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${isPositive ? 'text-blue-400' : 'text-teal-500'}`} />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recognition suggestion */}
                  {isPositive && analysis?.suggested_recognition && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Suggested recognition</div>
                      <div className="flex items-start gap-3 p-3 rounded-xl bg-amber-50 border border-amber-100">
                        <Award className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-800">{analysis.suggested_recognition}</p>
                      </div>
                    </div>
                  )}

                  {/* Before/After impact for completed interventions */}
                  {interventions.some((i) => i.status === 'completed' && (i.baseline_attendance != null || i.baseline_behaviour != null)) && (
                    <div>
                      <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Intervention impact — before vs after</div>
                      <div className="space-y-2">
                        {interventions
                          .filter((i) => i.status === 'completed' && (i.baseline_attendance != null || i.baseline_behaviour != null))
                          .map((i) => (
                          <div key={i.id} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                            <div className="text-xs font-semibold text-slate-700 mb-2">{i.action_type}</div>
                            <div className="grid grid-cols-2 gap-2">
                              {i.baseline_attendance != null && i.current_attendance != null && (
                                <div className="flex items-center gap-1.5 text-xs">
                                  <Activity className="w-3 h-3 text-slate-400" />
                                  <span className="text-slate-600">Attendance:</span>
                                  <span className="font-semibold text-slate-500">{i.baseline_attendance}%</span>
                                  {i.current_attendance > i.baseline_attendance
                                    ? <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                                    : <ArrowDownRight className="w-3 h-3 text-red-500" />}
                                  <span className={`font-bold ${i.current_attendance > i.baseline_attendance ? 'text-emerald-600' : 'text-red-600'}`}>{i.current_attendance}%</span>
                                </div>
                              )}
                              {i.baseline_behaviour != null && i.current_behaviour != null && (
                                <div className="flex items-center gap-1.5 text-xs">
                                  <AlertTriangle className="w-3 h-3 text-slate-400" />
                                  <span className="text-slate-600">Incidents:</span>
                                  <span className="font-semibold text-slate-500">{i.baseline_behaviour}</span>
                                  {i.current_behaviour < i.baseline_behaviour
                                    ? <ArrowDownRight className="w-3 h-3 text-emerald-500" />
                                    : <ArrowUpRight className="w-3 h-3 text-red-500" />}
                                  <span className={`font-bold ${i.current_behaviour < i.baseline_behaviour ? 'text-emerald-600' : 'text-red-600'}`}>{i.current_behaviour}</span>
                                </div>
                              )}
                            </div>
                            {i.outcome_status && (
                              <div className={`mt-1.5 text-[10px] font-semibold uppercase tracking-wider ${
                                i.outcome_status === 'resolved' || i.outcome_status === 'sustained' ? 'text-emerald-600' :
                                i.outcome_status === 'improving' ? 'text-teal-600' :
                                i.outcome_status === 'escalating' ? 'text-red-600' : 'text-slate-500'
                              }`}>
                                Impact observed for this student: {i.outcome_status}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-3 rounded-xl text-xs bg-slate-50 border border-slate-200 text-slate-500">
                    <span className="font-semibold">Note:</span> Evidence shown is derived from uploaded records only. Student Signal does not generate conclusions independently — it surfaces patterns from your data. Always apply professional judgement.
                  </div>
                </div>
              )}
            </div>

            {/* Footer actions */}
            <div className="sticky bottom-0 bg-white border-t border-slate-100 px-6 py-4 space-y-2">
              {isPositive ? (
                <button onClick={() => { navigate('/success-stories'); onClose(); }} className="btn-primary w-full py-2.5 text-sm bg-emerald-600 hover:bg-emerald-700">
                  <Trophy className="w-4 h-4" />
                  View success story
                </button>
              ) : (
                <button onClick={() => onCreateIntervention(studentId)} className="btn-primary w-full py-2.5 text-sm">
                  <Plus className="w-4 h-4" />
                  Create intervention
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setShowNoteForm(!showNoteForm)} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors border border-slate-200">
                  <MessageSquare className="w-3.5 h-3.5" />
                  Add note
                </button>
                <button onClick={() => { navigate(`/students/${studentId}`); onClose(); }} className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-50 text-slate-700 text-xs font-semibold hover:bg-slate-100 transition-colors border border-slate-200">
                  <FileText className="w-3.5 h-3.5" />
                  Full profile
                </button>
              </div>
            </div>
          </>
        )}
      </div>
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

