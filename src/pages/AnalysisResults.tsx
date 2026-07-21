import { useEffect, useState } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getStudents, getAnalysisResults } from '../lib/data';
import type { Student, AnalysisResult } from '../types';
import GlobalPriorityBar from '../components/GlobalPriorityBar';
import {
  AlertTriangle, Eye, CheckCircle, ChevronRight, ArrowUpDown,
  TrendingDown, BookOpen, Clock, UserCheck, Phone, Briefcase,
  Calendar, Search, Filter, X, SlidersHorizontal, Brain, Activity, ShieldAlert, GraduationCap,
} from 'lucide-react';

type FilterKey = 'all' | 'red' | 'amber' | 'green' | 'purple' | 'send' | 'attendance' | 'safeguarding' | 'careers';

export default function AnalysisResults() {
  const { profile, demoMode } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlFilter = (searchParams.get('filter') || searchParams.get('risk')) as FilterKey | null;
  const [filter, setFilter] = useState<FilterKey>(urlFilter || 'all');
  const [search, setSearch] = useState('');
  const [students, setStudents] = useState<Student[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [createInterventionFor, setCreateInterventionFor] = useState<string | null>(null);

  useEffect(() => {
    if (urlFilter) setFilter(urlFilter);
    else setFilter('all');
  }, [urlFilter]);

  useEffect(() => {
    async function load() {
      const effectiveId = demoMode ? null : profile?.school_id;
      const [st, a] = await Promise.all([
        getStudents(effectiveId),
        getAnalysisResults(effectiveId),
      ]);
      setStudents(st);
      setAnalysis(a);
      setLoading(false);
    }
    load();
  }, [profile?.school_id, demoMode]);

  const allStudentMap = new Map(students.map(s => [s.id, s]));

  // Merge students with analysis so unanalysed students still appear
  const mergedIds = new Set(analysis.map(a => a.student_id));
  const analysedRows = analysis.map((a) => {
    const s = students.find((st) => st.id === a.student_id);
    // Spread analysis first so student fields (including id) take precedence
    return { ...a, ...s, id: s?.id ?? a.student_id } as Student & AnalysisResult;
  }).filter((d) => d.id);
  const unanalysedRows = students
    .filter(s => !mergedIds.has(s.id))
    .map(s => ({ ...s } as Student & AnalysisResult));
  const merged = [...analysedRows, ...unanalysedRows];

  const filtered = merged.filter((d) => {
    const riskLevel = d.risk_level || (d.signal_category === 'red' ? 'red' : d.signal_category === 'amber' || d.signal_category === 'purple' ? 'amber' : 'green');
    if (filter === 'red' && riskLevel !== 'red') return false;
    if (filter === 'amber' && riskLevel !== 'amber') return false;
    if (filter === 'green' && riskLevel !== 'green') return false;
    if (filter === 'purple' && d.signal_category !== 'purple') return false;
    if (filter === 'send' && !d.send_status) return false;
    if (filter === 'attendance' && (d.attendance_pct ?? 100) >= 90) return false;
    if (filter === 'safeguarding' && !(d.key_reasons || []).some((r: string) => r.toLowerCase().includes('safeguard'))) return false;
    if (filter === 'careers' && !d.career_signposting) return false;
    if (search) {
      const term = search.toLowerCase();
      return d.name?.toLowerCase().includes(term) || (d.key_reasons || []).some((r: string) => r.toLowerCase().includes(term));
    }
    return true;
  });

  const redCount   = merged.filter((d) => (d.risk_level || '') === 'red').length;
  const amberCount = merged.filter((d) => (d.risk_level || '') === 'amber' || d.signal_category === 'purple').length;
  const greenCount = merged.filter((d) => (d.risk_level || '') === 'green').length;
  const sendCount  = students.filter(s => s.send_status).length;
  const attCount   = students.filter(s => (s.attendance_pct ?? 100) < 90).length;

  const FILTER_LABELS: Record<FilterKey, string> = {
    all: 'All', red: 'Red Priority', amber: 'Amber Watchlist', green: 'Green',
    purple: 'Emerging Concerns', send: 'SEND Support', attendance: 'Attendance Below 90%',
    safeguarding: 'Safeguarding Flags', careers: 'Career Support Needed',
  };

  function clearFilter() {
    setFilter('all');
    const next = new URLSearchParams(searchParams);
    next.delete('filter'); next.delete('risk');
    setSearchParams(next);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <GlobalPriorityBar />
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Students</h1>
          <p className="text-sm text-slate-500 mt-1">All students with pattern analysis and risk indicators.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/upload" className="btn-secondary">
            <ArrowUpDown className="w-4 h-4" />
            Upload new data
          </Link>
        </div>
      </div>

      {/* Active filter banner */}
      {filter !== 'all' && (
        <div className="flex items-center gap-2 flex-wrap bg-teal-50 border border-teal-200 rounded-xl px-4 py-3">
          <SlidersHorizontal className="w-4 h-4 text-teal-600 shrink-0" />
          <span className="text-xs font-semibold text-teal-700">Filtered by:</span>
          <span className="flex items-center gap-1 bg-white border border-teal-200 text-teal-700 text-xs font-medium px-2.5 py-1 rounded-full">
            {FILTER_LABELS[filter]}
            <button onClick={clearFilter}><X className="w-3 h-3" /></button>
          </span>
          <span className="ml-auto text-xs text-teal-600 font-medium">
            Showing {filtered.length} of {merged.length} students
          </span>
          <button onClick={clearFilter} className="text-xs text-teal-600 hover:text-teal-800 underline font-medium">Clear</button>
        </div>
      )}

      {/* Risk summary cards — clickable */}
      <div className="grid sm:grid-cols-4 gap-4">
        {([
          { f: 'red'   as FilterKey, label: 'Red priority',       count: redCount,   Icon: AlertTriangle, color: 'text-red-600',     bg: 'border-l-red-500',     iconBg: 'bg-red-50'     },
          { f: 'amber' as FilterKey, label: 'Amber watchlist',    count: amberCount, Icon: Eye,           color: 'text-amber-600',   bg: 'border-l-amber-500',   iconBg: 'bg-amber-50'   },
          { f: 'green' as FilterKey, label: 'No concern',         count: greenCount, Icon: CheckCircle,   color: 'text-emerald-600', bg: 'border-l-emerald-500', iconBg: 'bg-emerald-50' },
          { f: 'send'  as FilterKey, label: 'SEND support',       count: sendCount,  Icon: Brain,         color: 'text-blue-600',    bg: 'border-l-blue-500',    iconBg: 'bg-blue-50'    },
        ]).map(({ f, label, count, Icon, color, bg, iconBg }) => (
          <button
            key={f}
            onClick={() => setFilter(filter === f ? 'all' : f)}
            className={`card-premium p-5 border-l-4 ${bg} text-left transition-all hover:ring-2 hover:ring-teal-200 ${filter === f ? 'ring-2 ring-teal-400 bg-teal-50/20' : ''}`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className={`w-9 h-9 rounded-xl ${iconBg} flex items-center justify-center`}><Icon className={`w-5 h-5 ${color}`} /></div>
              <span className={`text-2xl font-bold ${color}`}>{count}</span>
            </div>
            <p className="text-sm font-semibold text-slate-800">{label}</p>
          </button>
        ))}
      </div>

      {/* Quick filter pills */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider shrink-0">Filter:</span>
        {([
          { f: 'all'          as FilterKey, label: 'All students' },
          { f: 'red'          as FilterKey, label: `Needs action (${redCount})` },
          { f: 'purple'       as FilterKey, label: 'Emerging concerns' },
          { f: 'attendance'   as FilterKey, label: `Attendance <90% (${attCount})` },
          { f: 'send'         as FilterKey, label: `SEND (${sendCount})` },
          { f: 'safeguarding' as FilterKey, label: 'Safeguarding' },
          { f: 'careers'      as FilterKey, label: 'Careers support' },
        ]).map(({ f, label }) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
              filter === f ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Search + showing count */}
      <div className="flex flex-col sm:flex-row gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            placeholder="Search students, reasons..."
          />
        </div>
        <span className="text-sm text-slate-500 whitespace-nowrap">
          Showing <span className="font-semibold text-slate-800">{filtered.length}</span> of <span className="font-semibold text-slate-800">{merged.length}</span> students
        </span>
      </div>

      {/* Results */}
      <div className="space-y-5">
        {filtered.length === 0 && (
          <div className="card-premium p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-slate-50 flex items-center justify-center mx-auto mb-3"><Filter className="w-6 h-6 text-slate-400" /></div>
            <p className="text-sm font-medium text-slate-700">No analysis results match your filter.</p>
            <p className="text-xs text-slate-500 mt-1">Try adjusting your search or upload new data.</p>
          </div>
        )}
        {filtered.map((student) => (
          <div key={student.id} className="card-premium overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm ${
                  student.risk_level === 'red' ? 'bg-red-100 text-red-700' : student.risk_level === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'
                }`}>
                  {student.name?.split(' ').map((n) => n[0]).join('')}
                </div>
                <div>
                  <button onClick={() => navigate(`/students/${student.id}`)} className="font-semibold text-slate-900 hover:text-teal-700 text-base transition-colors text-left">{student.name}</button>
                  <div className="text-xs text-slate-500 mt-0.5">{student.year_group} &bull; {student.form} {student.pupil_premium && ' &bull; Pupil Premium'} {student.send_status && ` &bull; ${student.send_status}`}</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                  student.risk_level === 'red' ? 'bg-red-100 text-red-700 border border-red-200' : student.risk_level === 'amber' ? 'bg-amber-100 text-amber-700 border border-amber-200' : 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                }`}>
                  {student.risk_level}
                </span>
                <button
                  onClick={() => navigate(`/students/${student.id}`)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-700 transition-colors"
                >
                  View profile
                </button>
                <button onClick={() => navigate(`/students/${student.id}`)} title="View full profile"><ChevronRight className="w-5 h-5 text-slate-400 hover:text-teal-600 transition-colors" /></button>
              </div>
            </div>

            <div className="px-6 py-5 grid md:grid-cols-2 gap-6">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <ArrowUpDown className="w-4 h-4 text-slate-400 mt-1" />
                  <div><div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Behaviour trend</div><div className={`text-sm font-semibold ${student.behaviour_trend === 'Escalating' ? 'text-red-600' : student.behaviour_trend === 'Concerning' ? 'text-amber-600' : 'text-emerald-600'}`}>{student.behaviour_trend}</div></div>
                </div>
                <div className="flex items-start gap-3">
                  <TrendingDown className="w-4 h-4 text-slate-400 mt-1" />
                  <div><div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Attendance trend</div><div className={`text-sm font-semibold ${student.attendance_trend === 'Declining' ? 'text-red-600' : student.attendance_trend === 'Below target' ? 'text-amber-600' : 'text-emerald-600'}`}>{student.attendance_trend}</div></div>
                </div>
                <div className="flex items-start gap-3">
                  <BookOpen className="w-4 h-4 text-slate-400 mt-1" />
                  <div><div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Subjects involved</div><div className="text-sm text-slate-700">{student.subjects_involved?.join(', ') || 'None'}</div></div>
                </div>
                <div className="flex items-start gap-3">
                  <Clock className="w-4 h-4 text-slate-400 mt-1" />
                  <div><div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Periods involved</div><div className="text-sm text-slate-700">{student.periods_involved?.join(', ') || 'None'}</div></div>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <UserCheck className="w-4 h-4 text-slate-400 mt-1" />
                  <div><div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Pastoral action</div><div className="text-sm text-slate-700">{student.suggested_pastoral_action || 'None'}</div></div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="w-4 h-4 text-slate-400 mt-1" />
                  <div><div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Parent contact</div><div className="text-sm text-slate-700">{student.suggested_parent_contact || 'None'}</div></div>
                </div>
                <div className="flex items-start gap-3">
                  <Briefcase className="w-4 h-4 text-slate-400 mt-1" />
                  <div><div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Staff action</div><div className="text-sm text-slate-700">{student.suggested_staff_action || 'None'}</div></div>
                </div>
                <div className="flex items-start gap-3">
                  <Calendar className="w-4 h-4 text-slate-400 mt-1" />
                  <div><div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Review date</div><div className="text-sm text-slate-700">{student.recommended_review_date || 'Not set'}</div></div>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50/60 border-t border-slate-100">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Key reasons</div>
              <div className="flex flex-wrap gap-2">
                {student.key_reasons?.map((reason, i) => (
                  <span key={i} className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-xs text-slate-700 font-medium">{reason}</span>
                )) || <span className="text-xs text-slate-500">No specific reasons flagged</span>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {createInterventionFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCreateInterventionFor(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Create intervention</h3>
            <p className="text-sm text-slate-600 mb-6">For student {createInterventionFor}. This would open the full intervention form.</p>
            <div className="flex gap-3">
              <Link to={`/interventions`} className="btn-primary flex-1 py-2.5 text-sm" onClick={() => setCreateInterventionFor(null)}>
                Go to Interventions
              </Link>
              <button onClick={() => setCreateInterventionFor(null)} className="btn-secondary flex-1 py-2.5 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

