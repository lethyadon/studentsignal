import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { getIntelligenceInsights, generateSchoolIntelligence, type IntelligenceInsight } from '../lib/schoolIntelligence';
import type { Student } from '../types';
import {
  TrendingUp, TrendingDown, AlertTriangle, Users, Activity, BookOpen,
  Clock, BarChart2, ShieldAlert, Heart, Star, Brain, Zap,
  ChevronRight, Info, Award, Eye, RefreshCw, Loader2,
  Target, Link2, FileText, Sparkles,
} from 'lucide-react';

// ── helpers ──────────────────────────────────────────────────────────────────

function pct(n: number, total: number) {
  if (!total) return 0;
  return Math.round((n / total) * 100);
}

function avg(arr: number[]) {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

const CATEGORY_META: Record<string, { icon: any; label: string; color: string; bg: string }> = {
  cohort:          { icon: Users,       label: 'Cohort',        color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200' },
  subject:         { icon: BookOpen,    label: 'Subject',       color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  time:            { icon: Clock,       label: 'Time',          color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200' },
  location:        { icon: Target,      label: 'Location',      color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200' },
  emerging:        { icon: Zap,         label: 'Emerging',      color: 'text-red-700',     bg: 'bg-red-50 border-red-200' },
  intervention:    { icon: Activity,    label: 'Intervention',  color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  relationship:    { icon: Link2,       label: 'Relationship',  color: 'text-purple-700',  bg: 'bg-purple-50 border-purple-200' },
  positive:        { icon: Star,        label: 'Positive',      color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  risk_escalation: { icon: AlertTriangle, label: 'Risk',        color: 'text-red-700',     bg: 'bg-red-50 border-red-200' },
  executive:       { icon: Brain,       label: 'Executive',     color: 'text-slate-700',   bg: 'bg-slate-50 border-slate-200' },
};

const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, positive: 4 };
const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-100 text-red-700 border-red-200',
  high:     'bg-orange-100 text-orange-700 border-orange-200',
  medium:   'bg-amber-100 text-amber-700 border-amber-200',
  low:      'bg-slate-100 text-slate-600 border-slate-200',
  positive: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

// ── Insight Card ─────────────────────────────────────────────────────────────

function InsightCard({ insight, onDrillDown }: { insight: IntelligenceInsight; onDrillDown: (ids: string[]) => void }) {
  const meta = CATEGORY_META[insight.category] || CATEGORY_META.emerging;
  const Icon = meta.icon;
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={`border rounded-xl overflow-hidden transition-all hover:shadow-md ${meta.bg}`}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-white/70`}>
            <Icon className={`w-4.5 h-4.5 ${meta.color}`} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className={`text-[10px] font-bold uppercase tracking-wider ${meta.color}`}>{meta.label}</span>
              <span className={`text-[10px] px-1.5 py-px rounded-full font-semibold border ${SEVERITY_BADGE[insight.severity] || SEVERITY_BADGE.medium}`}>
                {insight.severity}
              </span>
              <span className="text-[10px] text-slate-400 ml-auto">{insight.confidence}% confidence</span>
            </div>
            <p className={`text-sm font-semibold ${meta.color} leading-snug mb-1.5`}>{insight.headline}</p>
            <p className="text-xs text-slate-600 leading-relaxed">{insight.narrative}</p>
          </div>
        </div>

        {/* Expandable detail */}
        {expanded && (
          <div className="mt-3 pt-3 border-t border-white/50 space-y-2">
            {insight.recommended_action && (
              <div className="flex items-start gap-2">
                <ChevronRight className="w-3.5 h-3.5 text-teal-600 mt-0.5 shrink-0" />
                <p className="text-xs text-slate-700"><strong>Action:</strong> {insight.recommended_action}</p>
              </div>
            )}
            {insight.affected_cohort && (
              <div className="flex items-center gap-2">
                <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <p className="text-xs text-slate-500">Cohort: {insight.affected_cohort}</p>
              </div>
            )}
            {insight.affected_student_ids.length > 0 && (
              <button onClick={() => onDrillDown(insight.affected_student_ids)}
                className="flex items-center gap-1.5 text-xs text-teal-600 font-medium hover:text-teal-800 transition-colors">
                <Eye className="w-3.5 h-3.5" />
                View {insight.affected_student_ids.length} affected student{insight.affected_student_ids.length > 1 ? 's' : ''}
              </button>
            )}
          </div>
        )}

        <button onClick={() => setExpanded(!expanded)}
          className="mt-2 text-[11px] text-slate-400 hover:text-slate-600 transition-colors flex items-center gap-1">
          {expanded ? 'Less' : 'Details & action'}
          <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      </div>

      {/* Confidence bar */}
      <div className="h-1 bg-white/40">
        <div className={`h-1 ${insight.is_positive ? 'bg-emerald-400' : insight.severity === 'critical' ? 'bg-red-400' : insight.severity === 'high' ? 'bg-orange-400' : 'bg-amber-300'}`}
          style={{ width: `${insight.confidence}%` }} />
      </div>
    </div>
  );
}

// ── MiniBar ──────────────────────────────────────────────────────────────────

function MiniBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-slate-500 w-9 shrink-0 text-right">{label}</span>
      <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full transition-all duration-500 ${color}`} style={{ width: `${w}%` }} />
      </div>
      <span className="text-[11px] font-semibold text-slate-700 w-5 text-right">{value}</span>
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function SchoolIntelligence() {
  const { profile, demoMode } = useAuth();
  const navigate = useNavigate();
  const schoolId = demoMode ? null : (profile as any)?.school_id ?? null;
  const [insights, setInsights] = useState<IntelligenceInsight[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [behaviourRecords, setBehaviourRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadData();
  }, [schoolId]);

  async function loadData() {
    setLoading(true);
    try {
      if (!schoolId) {
        setLoading(false);
        return;
      }
      const [insightsData, { data: sts }, { data: beh }] = await Promise.all([
        getIntelligenceInsights(schoolId),
        supabase.from('students').select('id, name, year_group, form, send_status, pupil_premium, attendance_pct, behaviour_score, risk_level, signal_category, positive_points').eq('school_id', schoolId),
        supabase.from('behaviour_records').select('id, student_id, date, incident_type, behaviour_points, lesson_period, subject, staff_member').eq('school_id', schoolId),
      ]);
      setInsights(insightsData);
      setStudents((sts ?? []) as Student[]);
      setBehaviourRecords(beh ?? []);
    } catch { /* silent */ }
    setLoading(false);
  }

  async function handleRefresh() {
    if (!schoolId) return;
    setRefreshing(true);
    try {
      await generateSchoolIntelligence(schoolId);
      await loadData();
    } catch { /* silent */ }
    setRefreshing(false);
  }

  function handleDrillDown(ids: string[]) {
    if (ids.length === 1) navigate(`/students/${ids[0]}`);
    else navigate('/signal-queue');
  }

  // Sort and filter insights
  const sortedInsights = useMemo(() => {
    let filtered = insights;
    if (activeCategory) filtered = insights.filter(i => i.category === activeCategory);
    return filtered.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3));
  }, [insights, activeCategory]);

  // Derived stats
  const categories = useMemo(() => {
    const cats = new Map<string, number>();
    insights.forEach(i => cats.set(i.category, (cats.get(i.category) || 0) + 1));
    return cats;
  }, [insights]);

  const negativeRecords = behaviourRecords.filter((b: any) => b.behaviour_points > 0);

  // Period chart from real data
  const byPeriod = useMemo(() => {
    const map: Record<string, number> = {};
    negativeRecords.forEach((b: any) => { if (b.lesson_period) map[b.lesson_period] = (map[b.lesson_period] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
  }, [negativeRecords]);
  const maxPeriod = Math.max(...byPeriod.map(d => d.value), 1);

  // Subject chart
  const bySubject = useMemo(() => {
    const map: Record<string, number> = {};
    negativeRecords.forEach((b: any) => { if (b.subject) map[b.subject] = (map[b.subject] || 0) + 1; });
    return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, value]) => ({ label, value }));
  }, [negativeRecords]);
  const maxSubject = Math.max(...bySubject.map(d => d.value), 1);

  // Day chart
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const byDay = useMemo(() => {
    const map: Record<string, number> = {};
    negativeRecords.forEach((b: any) => {
      if (!b.date) return;
      const d = new Date(b.date);
      const day = DAYS[d.getDay()] ?? 'Mon';
      map[day] = (map[day] || 0) + 1;
    });
    return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map(d => ({ label: d, value: map[d] || 0 }));
  }, [negativeRecords]);
  const maxDay = Math.max(...byDay.map(d => d.value), 1);

  // KPI stats
  const schoolAvgAtt = students.length > 0 ? Math.round(students.reduce((s, st) => s + (st.attendance_pct ?? 95), 0) / students.length) : 0;
  const redStudents = students.filter(s => s.signal_category === 'red');
  const amberStudents = students.filter(s => s.signal_category === 'amber' || s.signal_category === 'purple');
  const greenStudents = students.filter(s => s.signal_category === 'green' || s.signal_category === 'blue');
  const criticalInsights = insights.filter(i => i.severity === 'critical').length;
  const positiveInsights = insights.filter(i => i.is_positive).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Empty state when no data has been imported
  if (!schoolId || (students.length === 0 && insights.length === 0)) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mx-auto mb-5">
          <Brain className="w-8 h-8 text-teal-600" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900 mb-2">School Intelligence</h1>
        <p className="text-sm text-slate-500 mb-6">
          Intelligence insights are generated automatically from your uploaded data.
          Upload CSV exports from your MIS systems to activate the intelligence engine.
        </p>
        <button onClick={() => navigate('/upload')} className="btn-primary">
          <FileText className="w-4 h-4" />Upload data to begin
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">School Intelligence</h1>
          <p className="text-sm text-slate-500 mt-1">Live patterns and insights generated from uploaded data — refreshed after every import</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleRefresh} disabled={refreshing}
            className="flex items-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-800 px-3 py-2 rounded-lg border border-teal-200 bg-white hover:bg-teal-50 transition-all disabled:opacity-50">
            {refreshing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            Regenerate
          </button>
          <div className="flex items-center gap-2 text-[11px] text-slate-400 border border-slate-200 rounded-lg px-3 py-2 bg-white">
            <Info className="w-3.5 h-3.5" />
            <span>{students.length} students · {insights.length} insights · {negativeRecords.length} records</span>
          </div>
        </div>
      </div>

      {/* Top KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard label="Students" value={students.length} color="text-slate-800" />
        <KpiCard label="Avg Attendance" value={`${schoolAvgAtt}%`} color={schoolAvgAtt >= 96 ? 'text-emerald-600' : schoolAvgAtt >= 90 ? 'text-amber-600' : 'text-red-600'} />
        <KpiCard label="Critical Signals" value={redStudents.length} color="text-red-600" />
        <KpiCard label="Monitor" value={amberStudents.length} color="text-amber-600" />
        <KpiCard label="Critical Insights" value={criticalInsights} color="text-red-600" />
        <KpiCard label="Positive" value={positiveInsights} color="text-emerald-600" />
      </div>

      {/* Executive Summary */}
      {insights.some(i => i.category === 'executive') && (
        <section className="card-premium p-5 border-l-4 border-l-teal-500">
          <div className="flex items-center gap-2 mb-3">
            <Brain className="w-4.5 h-4.5 text-teal-600" />
            <h2 className="text-sm font-bold text-slate-800">SLT Morning Briefing</h2>
          </div>
          {insights.filter(i => i.category === 'executive').map(ins => (
            <div key={ins.id} className="text-sm text-slate-700 leading-relaxed">
              <p>{ins.narrative}</p>
              {ins.recommended_action && (
                <p className="mt-2 text-xs text-teal-700 font-medium"><ChevronRight className="w-3 h-3 inline" /> {ins.recommended_action}</p>
              )}
            </div>
          ))}
        </section>
      )}

      {/* Category filter pills */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setActiveCategory(null)}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${!activeCategory ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
          All ({insights.length})
        </button>
        {[...categories.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([cat, count]) => {
          const meta = CATEGORY_META[cat] || CATEGORY_META.emerging;
          return (
            <button key={cat} onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${activeCategory === cat ? `${meta.bg}` : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'}`}>
              {meta.label} ({count})
            </button>
          );
        })}
      </div>

      {/* Intelligence Cards Grid */}
      {sortedInsights.length > 0 ? (
        <section>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedInsights.filter(i => i.category !== 'executive').map(insight => (
              <InsightCard key={insight.id} insight={insight} onDrillDown={handleDrillDown} />
            ))}
          </div>
        </section>
      ) : (
        <div className="text-center py-12 text-slate-400 text-sm">
          No insights match this filter.
        </div>
      )}

      {/* Behaviour Analysis Charts */}
      {negativeRecords.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-slate-800 mb-4">Behaviour Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* By period */}
            {byPeriod.length > 0 && (
              <div className="card-premium p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-700">Incidents by period</h3>
                </div>
                <div className="space-y-2">
                  {byPeriod.map(d => (
                    <MiniBar key={d.label} label={d.label} value={d.value} max={maxPeriod}
                      color={d.value === byPeriod[0]?.value ? 'bg-red-400' : 'bg-slate-300'} />
                  ))}
                </div>
              </div>
            )}

            {/* By subject */}
            {bySubject.length > 0 && (
              <div className="card-premium p-5">
                <div className="flex items-center gap-2 mb-4">
                  <BookOpen className="w-4 h-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-700">Incidents by subject</h3>
                </div>
                <div className="space-y-2">
                  {bySubject.map(d => (
                    <MiniBar key={d.label} label={d.label.length > 9 ? d.label.slice(0, 9) + '\u2026' : d.label}
                      value={d.value} max={maxSubject}
                      color={d.value === bySubject[0]?.value ? 'bg-amber-400' : 'bg-slate-300'} />
                  ))}
                </div>
              </div>
            )}

            {/* By weekday */}
            <div className="card-premium p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart2 className="w-4 h-4 text-slate-400" />
                <h3 className="text-sm font-semibold text-slate-700">Incidents by weekday</h3>
              </div>
              <div className="space-y-2">
                {byDay.map(d => (
                  <MiniBar key={d.label} label={d.label} value={d.value} max={maxDay}
                    color={d.value === Math.max(...byDay.map(x => x.value)) ? 'bg-orange-400' : 'bg-slate-300'} />
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Attendance Overview */}
      {students.length > 0 && (
        <section>
          <h2 className="text-base font-bold text-slate-800 mb-4">Attendance Overview</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-5">
            <div className="card-premium p-4 text-center border-emerald-100">
              <div className="text-xl font-bold text-emerald-600">{students.filter(s => (s.attendance_pct ?? 0) >= 96).length}</div>
              <div className="text-[11px] text-slate-400 mt-1">96%+ (Good)</div>
            </div>
            <div className="card-premium p-4 text-center">
              <div className="text-xl font-bold text-amber-600">{students.filter(s => { const a = s.attendance_pct ?? 100; return a >= 90 && a < 96; }).length}</div>
              <div className="text-[11px] text-slate-400 mt-1">90-96% (Monitor)</div>
            </div>
            <div className="card-premium p-4 text-center">
              <div className="text-xl font-bold text-orange-600">{students.filter(s => { const a = s.attendance_pct ?? 100; return a >= 80 && a < 90; }).length}</div>
              <div className="text-[11px] text-slate-400 mt-1">80-90% (Concern)</div>
            </div>
            <div className="card-premium p-4 text-center border-red-100">
              <div className="text-xl font-bold text-red-600">{students.filter(s => (s.attendance_pct ?? 100) < 80).length}</div>
              <div className="text-[11px] text-slate-400 mt-1">&lt;80% (PA)</div>
            </div>
          </div>

          {/* Attendance by year group */}
          <div className="card-premium p-5">
            <h3 className="text-sm font-semibold text-slate-700 mb-4">Attendance by year group</h3>
            <div className="space-y-2">
              {[...new Set(students.map(s => s.year_group))]
                .filter(y => y && y !== 'Unknown')
                .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
                .map(year => {
                  const sts = students.filter(s => s.year_group === year);
                  const yearAvg = avg(sts.map(s => s.attendance_pct ?? 95));
                  const col = yearAvg >= 96 ? 'bg-emerald-400' : yearAvg >= 90 ? 'bg-amber-400' : 'bg-red-400';
                  return <MiniBar key={year} label={year.replace('Year ', 'Y')} value={yearAvg} max={100} color={col} />;
                })}
            </div>
          </div>
        </section>
      )}

      {/* Signal Summary */}
      {students.length > 0 && (
        <section className="card-premium p-6">
          <h2 className="text-sm font-bold text-slate-800 mb-4">School Signal Summary</h2>
          <div className="flex h-4 rounded-full overflow-hidden gap-px mb-3">
            {redStudents.length > 0 && <div className="bg-red-500" style={{ width: `${pct(redStudents.length, students.length)}%` }} />}
            {amberStudents.length > 0 && <div className="bg-amber-400" style={{ width: `${pct(amberStudents.length, students.length)}%` }} />}
            {greenStudents.length > 0 && <div className="bg-emerald-400" style={{ width: `${pct(greenStudents.length, students.length)}%` }} />}
          </div>
          <div className="flex flex-wrap gap-4 text-xs">
            {[
              { label: 'Critical', count: redStudents.length, color: 'bg-red-500' },
              { label: 'Monitor', count: amberStudents.length, color: 'bg-amber-400' },
              { label: 'Positive', count: greenStudents.length, color: 'bg-emerald-400' },
            ].map(({ label, count, color }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
                <span className="text-slate-600">{label}</span>
                <span className="font-semibold text-slate-800">{count}</span>
                <span className="text-slate-400">({pct(count, students.length)}%)</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div className="card-premium p-4 text-center">
      <div className={`text-2xl font-bold ${color}`}>{value}</div>
      <div className="text-[11px] text-slate-400 mt-1">{label}</div>
    </div>
  );
}

