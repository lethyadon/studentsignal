import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { SchoolOnlyGate } from '../components/SchoolOnlyGate';
import { getStudents, getCareerProfiles, getAnalysisResults } from '../lib/data';
import type { Student, CareerProfile, AnalysisResult } from '../types';
import SignpostingModal from '../components/SignpostingModal';
import { Toast, useToast } from '../components/Toast';
import {
  GraduationCap, Search, ArrowRight, Calendar, FileText, Star,
  AlertTriangle, CheckCircle, Filter, Briefcase, TrendingDown,
  Edit, X, Save, Info, ShieldAlert,
} from 'lucide-react';

interface StudentWithCareer extends Student {
  career?: CareerProfile;
  analysis?: AnalysisResult;
}

interface NeetRiskResult {
  level: 'High risk' | 'At risk' | 'Monitor' | 'On track';
  score: number;
  reasons: string[];
}

// Evidence-based NEET risk engine
function computeNeetRisk(s: StudentWithCareer): NeetRiskResult {
  let score = 0;
  const reasons: string[] = [];

  const att = s.attendance_pct ?? 95;
  if (att < 80) { score += 35; reasons.push(`Attendance critically low (${att}%)`); }
  else if (att < 85) { score += 25; reasons.push(`Attendance severely below target (${att}%)`); }
  else if (att < 90) { score += 15; reasons.push(`Attendance below 90% (${att}%)`); }

  const beh = s.behaviour_score ?? 0;
  if (beh >= 20) { score += 25; reasons.push(`High behaviour incident score (${beh} pts)`); }
  else if (beh >= 10) { score += 12; reasons.push(`Elevated behaviour score (${beh} pts)`); }

  if (s.send_status) { score += 10; reasons.push(`SEND status: ${s.send_status}`); }
  if (s.pupil_premium) { score += 8; reasons.push('Pupil Premium eligible'); }

  const a = s.analysis;
  if (a?.risk_level === 'red') { score += 20; reasons.push('Red priority in Signal'); }
  else if (a?.risk_level === 'amber') { score += 10; reasons.push('Amber watchlist in Signal'); }
  if (a?.behaviour_trend === 'Escalating') { score += 12; reasons.push('Escalating behaviour trend'); }

  const yearNum = parseInt((s.year_group || '').replace(/[^0-9]/g, ''));
  if (yearNum >= 10 && !s.career?.destination_risk) { score += 8; reasons.push('Year 10+ with no destination recorded'); }
  if (!s.career?.career_interests?.length) { score += 5; reasons.push('No career interests recorded'); }

  let level: NeetRiskResult['level'];
  if (score >= 50) level = 'High risk';
  else if (score >= 25) level = 'At risk';
  else if (score >= 12) level = 'Monitor';
  else level = 'On track';

  return { level, score, reasons };
}

const RISK_CFG: Record<NeetRiskResult['level'], { bg: string; text: string; border: string; dot: string }> = {
  'High risk': { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200', dot: 'bg-red-500' },
  'At risk':   { bg: 'bg-amber-100', text: 'text-amber-700', border: 'border-amber-200', dot: 'bg-amber-500' },
  'Monitor':   { bg: 'bg-blue-100', text: 'text-blue-700', border: 'border-blue-200', dot: 'bg-blue-500' },
  'On track':  { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', dot: 'bg-emerald-500' },
};

const SIGNPOSTING = [
  { name: 'College open days', icon: Calendar, desc: 'Next events in your area' },
  { name: 'Apprenticeships', icon: GraduationCap, desc: 'Level 2, 3 and degree programmes' },
  { name: 'T Levels', icon: FileText, desc: 'Technical qualifications pathways' },
  { name: 'A Levels', icon: Star, desc: 'Academic progression routes' },
  { name: 'Vocational courses', icon: Briefcase, desc: 'Practical and career-focused study' },
  { name: 'SEND careers support', icon: GraduationCap, desc: 'Specialist guidance and resources' },
  { name: 'Mentoring', icon: CheckCircle, desc: 'Peer and professional mentoring' },
  { name: 'Work experience', icon: Briefcase, desc: 'Employer and placement opportunities' },
  { name: 'CV and application support', icon: FileText, desc: 'Writing, interview and skills prep' },
  { name: 'Confidence building', icon: Star, desc: 'Workshops and tailored programmes' },
  { name: 'Attendance & future goals', icon: AlertTriangle, desc: 'Linking attendance to aspirations' },
  { name: 'NEET prevention', icon: TrendingDown, desc: 'Early intervention and signposting' },
];

export default function Careers() {
  const { profile } = useAuth();
  const { toasts, addToast, dismissToast } = useToast();
  const [data, setData] = useState<StudentWithCareer[]>([]);
  const [filter, setFilter] = useState<'all' | 'high_risk' | 'at_risk' | 'on_track'>('all');
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedResource, setSelectedResource] = useState<typeof SIGNPOSTING[0] | null>(null);
  const [createInterventionFor, setCreateInterventionFor] = useState<string | null>(null);

  // Manual override modal state
  const [overrideModal, setOverrideModal] = useState<StudentWithCareer | null>(null);
  const [overrideForm, setOverrideForm] = useState<{ level: NeetRiskResult['level']; reason: string }>({ level: 'Monitor', reason: '' });
  // overrides: studentId → { level, reason, overriddenBy, overriddenAt }
  const [overrides, setOverrides] = useState<Record<string, { level: NeetRiskResult['level']; reason: string; overriddenBy: string; overriddenAt: string }>>({});
  const [expandedEvidence, setExpandedEvidence] = useState<Set<string>>(new Set());

  useEffect(() => {
    async function load() {
      const [students, careers, analysis] = await Promise.all([
        getStudents(profile?.school_id),
        getCareerProfiles(profile?.school_id),
        getAnalysisResults(profile?.school_id),
      ]);
      setData(students.map((s) => ({
        ...s,
        career: careers.find((c) => c.student_id === s.id),
        analysis: analysis.find((a) => a.student_id === s.id),
      })));
      setLoading(false);
    }
    load();
  }, [profile?.school_id]);

  function effectiveRisk(s: StudentWithCareer): NeetRiskResult['level'] {
    return overrides[s.id]?.level ?? computeNeetRisk(s).level;
  }

  const filtered = data.filter((d) => {
    const risk = effectiveRisk(d);
    if (filter === 'high_risk' && risk !== 'High risk') return false;
    if (filter === 'at_risk' && risk !== 'At risk') return false;
    if (filter === 'on_track' && risk !== 'On track') return false;
    if (search) {
      const term = search.toLowerCase();
      return d.name.toLowerCase().includes(term) || d.year_group?.toLowerCase().includes(term) || d.career?.career_interests?.some((i) => i.toLowerCase().includes(term));
    }
    return true;
  });

  const highRiskCount = data.filter(d => effectiveRisk(d) === 'High risk').length;
  const atRiskCount = data.filter(d => effectiveRisk(d) === 'At risk').length;
  const onTrackCount = data.filter(d => effectiveRisk(d) === 'On track').length;
  const monitorCount = data.filter(d => effectiveRisk(d) === 'Monitor').length;

  function openOverride(student: StudentWithCareer) {
    const current = overrides[student.id]?.level ?? computeNeetRisk(student).level;
    setOverrideModal(student);
    setOverrideForm({ level: current, reason: '' });
  }

  function submitOverride() {
    if (!overrideModal || !overrideForm.reason.trim()) return;
    setOverrides(prev => ({
      ...prev,
      [overrideModal.id]: {
        level: overrideForm.level,
        reason: overrideForm.reason.trim(),
        overriddenBy: (profile as any)?.full_name || 'Staff',
        overriddenAt: new Date().toISOString(),
      },
    }));
    addToast(`NEET risk for ${overrideModal.name} overridden to "${overrideForm.level}".`, 'success');
    setOverrideModal(null);
  }

  function clearOverride(studentId: string) {
    setOverrides(prev => { const next = { ...prev }; delete next[studentId]; return next; });
    addToast('Override cleared — risk reverted to evidence-based assessment.');
  }

  function toggleEvidence(id: string) {
    setExpandedEvidence(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" /></div>;
  }

  return (
    <SchoolOnlyGate
      featureName="Careers Tracking"
      featureDescription="Track destination data, NEET risk and career readiness across every student in your school."
      highlights={[
        'NEET risk identification per student',
        'Destination tracking (employment, FE, apprenticeships)',
        'Signposting resources and referrals',
        'Linked to interventions and student profiles',
      ]}
    >
    <div className="space-y-8">
      <Toast toasts={toasts} onDismiss={dismissToast} />

      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Careers and Signposting</h1>
        <p className="text-sm text-slate-500 mt-1">Evidence-based NEET risk scoring with career interests, pathways and destination support.</p>
      </div>

      {/* Summary cards */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className="card-premium p-5 border-l-4 border-l-red-500">
          <div className="flex items-center justify-between mb-2"><AlertTriangle className="w-5 h-5 text-red-500" /><span className="text-3xl font-bold text-red-600">{highRiskCount}</span></div>
          <p className="text-sm font-semibold text-slate-800">High risk of NEET</p>
          <p className="text-xs text-slate-500 mt-0.5">Immediate careers support needed</p>
        </div>
        <div className="card-premium p-5 border-l-4 border-l-amber-500">
          <div className="flex items-center justify-between mb-2"><TrendingDown className="w-5 h-5 text-amber-500" /><span className="text-3xl font-bold text-amber-600">{atRiskCount}</span></div>
          <p className="text-sm font-semibold text-slate-800">At risk</p>
          <p className="text-xs text-slate-500 mt-0.5">Monitoring and early intervention</p>
        </div>
        <div className="card-premium p-5 border-l-4 border-l-blue-400">
          <div className="flex items-center justify-between mb-2"><Info className="w-5 h-5 text-blue-400" /><span className="text-3xl font-bold text-blue-600">{monitorCount}</span></div>
          <p className="text-sm font-semibold text-slate-800">Monitor</p>
          <p className="text-xs text-slate-500 mt-0.5">Some risk factors present</p>
        </div>
        <div className="card-premium p-5 border-l-4 border-l-emerald-500">
          <div className="flex items-center justify-between mb-2"><CheckCircle className="w-5 h-5 text-emerald-500" /><span className="text-3xl font-bold text-emerald-600">{onTrackCount}</span></div>
          <p className="text-sm font-semibold text-slate-800">On track</p>
          <p className="text-xs text-slate-500 mt-0.5">Destination confirmed or in progress</p>
        </div>
      </div>

      {/* Evidence engine notice */}
      <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50 border border-blue-200">
        <ShieldAlert className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
        <div className="text-xs text-blue-700">
          <span className="font-semibold">Evidence-based risk scoring</span> — NEET risk is automatically computed from attendance, behaviour, SEND status, Signal risk level, and destination data. You can override any assessment with a required reason, which is stored in the audit trail.
        </div>
      </div>

      {/* Signposting resources */}
      <div className="card-premium p-6">
        <h3 className="text-base font-semibold text-slate-900 mb-4">Signposting Resources</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {SIGNPOSTING.map((cat) => {
            const Icon = cat.icon;
            return (
              <button
                key={cat.name}
                onClick={() => setSelectedResource(cat)}
                className="text-left flex items-start gap-3 px-4 py-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-100 hover:border-slate-200"
              >
                <div className="w-8 h-8 rounded-lg bg-teal-50 flex items-center justify-center shrink-0"><Icon className="w-4 h-4 text-teal-600" /></div>
                <div>
                  <div className="text-sm font-semibold text-slate-800">{cat.name}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{cat.desc}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500" placeholder="Search students, year groups or career interests..." />
        </div>
        <div className="flex gap-2 flex-wrap">
          {([['all', 'All'], ['high_risk', 'High risk'], ['at_risk', 'At risk'], ['on_track', 'On track']] as const).map(([f, label]) => (
            <button key={f} onClick={() => setFilter(f)} className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all border ${filter === f ? 'bg-teal-50 text-teal-700 border-teal-200' : 'text-slate-500 hover:bg-slate-50 border-transparent'}`}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Student cards */}
      <div className="space-y-5">
        {filtered.length === 0 && (
          <div className="card-premium p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3"><Filter className="w-6 h-6 text-slate-400" /></div>
            <p className="text-sm font-medium text-slate-700">No career profiles match your filter.</p>
          </div>
        )}
        {filtered.map((student) => {
          const computed = computeNeetRisk(student);
          const override = overrides[student.id];
          const displayLevel = override?.level ?? computed.level;
          const cfg = RISK_CFG[displayLevel];
          const evidenceOpen = expandedEvidence.has(student.id);

          return (
            <div key={student.id} className="card-premium overflow-hidden">
              <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-sm">
                    {(student.name || '').split(' ').filter(Boolean).map((n) => n[0]).join('')}
                  </div>
                  <div>
                    <button onClick={() => navigate(`/students/${student.id}`)} className="font-semibold text-slate-900 hover:text-teal-700 text-base transition-colors text-left">{student.name}</button>
                    <div className="text-xs text-slate-500 mt-0.5">{student.year_group} &bull; {student.form} &bull; Confidence: {student.career?.confidence_level || 'Not assessed'}</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {/* NEET risk badge */}
                  <div className="flex items-center gap-1.5">
                    <span className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
                      {displayLevel}
                      {override && <span className="text-[9px] opacity-70 ml-0.5">(overridden)</span>}
                    </span>
                    <button
                      onClick={() => toggleEvidence(student.id)}
                      title="Show evidence"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => openOverride(student)}
                      title="Override risk assessment"
                      className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-amber-600 transition-colors"
                    >
                      <Edit className="w-3.5 h-3.5" />
                    </button>
                    {override && (
                      <button
                        onClick={() => clearOverride(student.id)}
                        title="Clear override"
                        className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <button onClick={() => navigate(`/students/${student.id}`)}><ArrowRight className="w-5 h-5 text-slate-400 hover:text-teal-600 transition-colors" /></button>
                </div>
              </div>

              {/* Evidence panel */}
              {evidenceOpen && (
                <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Evidence basis — score: {computed.score}</div>
                  {computed.reasons.length === 0
                    ? <p className="text-xs text-slate-500">No risk factors identified from available data.</p>
                    : <div className="space-y-1">
                        {computed.reasons.map((r, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${computed.score >= 50 ? 'bg-red-500' : computed.score >= 25 ? 'bg-amber-500' : 'bg-blue-400'}`} />
                            {r}
                          </div>
                        ))}
                      </div>
                  }
                  {override && (
                    <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200">
                      <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Manual override</div>
                      <div className="text-xs text-amber-800">&ldquo;{override.reason}&rdquo; — {override.overriddenBy}, {new Date(override.overriddenAt).toLocaleDateString('en-GB')}</div>
                    </div>
                  )}
                </div>
              )}

              <div className="px-6 py-5 grid md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Career interests</div>
                    <div className="flex flex-wrap gap-2">
                      {student.career?.career_interests?.map((i, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-lg bg-teal-50 text-teal-700 text-xs font-semibold border border-teal-100">{i}</span>
                      ))}
                      {!student.career?.career_interests?.length && <span className="text-xs text-slate-400">None recorded</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Preferred subjects</div>
                    <div className="text-sm text-slate-700">{student.career?.preferred_subjects?.join(', ') || 'None'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Strengths</div>
                    <div className="text-sm text-slate-700">{student.career?.strengths || 'None recorded'}</div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Barriers</div>
                    <div className="text-sm text-slate-700">{student.career?.barriers || 'None recorded'}</div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Suggested pathways</div>
                    <div className="space-y-1.5">
                      {student.career?.suggested_pathways?.map((p, idx) => (
                        <div key={idx} className="flex items-center gap-2 text-sm text-slate-700"><ArrowRight className="w-3.5 h-3.5 text-teal-500 shrink-0" />{p}</div>
                      ))}
                      {!student.career?.suggested_pathways?.length && <span className="text-xs text-slate-400">None recorded</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Signposting</div>
                    <div className="flex flex-wrap gap-2">
                      {student.career?.useful_signposting?.map((s, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 font-medium">{s}</span>
                      ))}
                      {!student.career?.useful_signposting?.length && <span className="text-xs text-slate-400">None recorded</span>}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100">
                    <button
                      onClick={() => { setCreateInterventionFor(student.id); }}
                      className="flex items-center gap-1.5 text-xs font-semibold text-teal-700 hover:text-teal-800 transition-colors"
                    >
                      <GraduationCap className="w-3.5 h-3.5" /> Create careers action
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Override modal */}
      {overrideModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOverrideModal(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-base">Override NEET Risk</h3>
                <p className="text-xs text-slate-500 mt-0.5">{overrideModal.name} · Computed: {computeNeetRisk(overrideModal).level}</p>
              </div>
              <button onClick={() => setOverrideModal(null)} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-5 space-y-5">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-700 flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-600" />
                Overriding the evidence-based assessment requires a written reason. This will be stored in the audit trail.
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-2">New risk level</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['High risk', 'At risk', 'Monitor', 'On track'] as const).map((lvl) => {
                    const c = RISK_CFG[lvl];
                    return (
                      <button
                        key={lvl}
                        onClick={() => setOverrideForm(f => ({ ...f, level: lvl }))}
                        className={`py-2.5 px-3 rounded-xl border text-sm font-semibold transition-all ${overrideForm.level === lvl ? `${c.bg} ${c.text} ${c.border}` : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
                      >
                        {lvl}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Reason for override <span className="text-red-500">*</span>
                </label>
                <textarea
                  rows={3}
                  autoFocus
                  value={overrideForm.reason}
                  onChange={e => setOverrideForm(f => ({ ...f, reason: e.target.value }))}
                  placeholder="Why does this assessment differ from the evidence? (e.g. recent meeting, external support in place, context not reflected in data)"
                  className="input-premium w-full resize-none text-sm"
                />
                <p className="text-[10px] text-slate-500 mt-1">Required. Will appear in the evidence panel for this student.</p>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 flex gap-3">
              <button onClick={() => setOverrideModal(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={submitOverride}
                disabled={!overrideForm.reason.trim()}
                className="btn-primary flex-1 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4" /> Save override
              </button>
            </div>
          </div>
        </div>
      )}

      <SignpostingModal
        resource={selectedResource}
        onClose={() => setSelectedResource(null)}
      />

      {createInterventionFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCreateInterventionFor(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Create careers action</h3>
            <p className="text-sm text-slate-600 mb-6">Create a targeted intervention for careers support and NEET prevention.</p>
            <div className="flex gap-3">
              <Link to="/interventions" className="btn-primary flex-1 py-2.5 text-sm" onClick={() => setCreateInterventionFor(null)}>
                Go to Interventions
              </Link>
              <button onClick={() => setCreateInterventionFor(null)} className="btn-secondary flex-1 py-2.5 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
    </SchoolOnlyGate>
  );
}

