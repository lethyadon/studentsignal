import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getStudents, getAnalysisResults, getInterventions, getCareerProfiles } from '../lib/data';
import type { Student, AnalysisResult, Intervention, CareerProfile } from '../types';
import GlobalPriorityBar from '../components/GlobalPriorityBar';
import { generatePDF } from '../lib/pdfReport';
import {
  Download, AlertTriangle, Eye, CheckCircle, TrendingDown,
  Star, FileText, Copy, BarChart3, ShieldAlert, Brain,
  GraduationCap, ClipboardList, Activity, ArrowUpRight, ArrowDownRight, Minus,
  RefreshCw, Check, Users, TrendingUp, Target, Percent, Zap, Info,
  Filter, X, ChevronDown, ChevronUp, Award, Repeat2, BookOpen, Building2,
  Lightbulb, UserCheck, CalendarClock,
} from 'lucide-react';

interface StaffWorkloadRow {
  name: string;
  role: string;
  openCount: number;
  overdueCount: number;
  completedCount: number;
  successRate: number;
  pdLabel: 'Best Practice' | 'Standard' | 'Training Opportunity' | null;
}

interface ImpactRow {
  intervention: Intervention;
  studentName: string;
  studentId: string;
  outcome: 'Improving' | 'No change' | 'Escalating' | 'Resolved';
  baselineAttendance: number;
  currentAttendance: number;
  baselineBehaviour: number;
  currentBehaviour: number;
}

interface EffectivenessRow {
  actionType: string;
  timesUsed: number;
  improved: number;
  resolved: number;
  escalated: number;
  noChange: number;
  successRate: number;
}

type ActiveFilter =
  | 'red' | 'amber' | 'attendance' | 'behaviour' | 'send' | 'career'
  | 'open_interventions' | 'completed_interventions' | 'urgent';

const MOCK_IMPACT: Record<string, { baselineAttendance: number; currentAttendance: number; baselineBehaviour: number; currentBehaviour: number; outcome: ImpactRow['outcome'] }> = {
  i4: { baselineAttendance: 84, currentAttendance: 91, baselineBehaviour: 8, currentBehaviour: 2, outcome: 'Improving' },
  i7: { baselineAttendance: 90, currentAttendance: 93, baselineBehaviour: 5, currentBehaviour: 1, outcome: 'Resolved' },
};

export default function ReportsPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [students, setStudents] = useState<Student[]>([]);
  const [analysis, setAnalysis] = useState<AnalysisResult[]>([]);
  const [interventions, setInterventions] = useState<Intervention[]>([]);
  const [careers, setCareers] = useState<CareerProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [activeFilters, setActiveFilters] = useState<Set<ActiveFilter>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['recommendations', 'red', 'amber', 'repeat', 'attendance', 'yeargroup', 'subjects', 'behaviour', 'send', 'safeguarding', 'career', 'open_interventions', 'effectiveness', 'impact', 'success', 'pd', 'patterns']));
  const [dateRange, setDateRange] = useState<'all' | 'today' | 'week' | 'month' | 'term' | 'year' | 'custom'>('all');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  function getDateBounds(): { from: Date | null; to: Date | null } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (dateRange === 'today') return { from: today, to: new Date(today.getTime() + 86400000) };
    if (dateRange === 'week') return { from: new Date(today.getTime() - 7 * 86400000), to: null };
    if (dateRange === 'month') return { from: new Date(today.getTime() - 30 * 86400000), to: null };
    if (dateRange === 'term') {
      const m = now.getMonth();
      const termStart = m >= 8 ? new Date(now.getFullYear(), 8, 1) : m >= 3 ? new Date(now.getFullYear(), 3, 14) : new Date(now.getFullYear(), 0, 7);
      return { from: termStart, to: null };
    }
    if (dateRange === 'year') {
      const yearStart = now.getMonth() >= 8 ? new Date(now.getFullYear(), 8, 1) : new Date(now.getFullYear() - 1, 8, 1);
      return { from: yearStart, to: null };
    }
    if (dateRange === 'custom' && customFrom) {
      return { from: new Date(customFrom), to: customTo ? new Date(customTo + 'T23:59:59') : null };
    }
    return { from: null, to: null };
  }

  // Which filter cards make each section visible (empty = always visible)
  const SECTION_FILTER_MAP: Record<string, ActiveFilter[]> = {
    recommendations: [],
    red: ['red'],
    amber: ['amber'],
    repeat: ['red', 'amber'],
    attendance: ['attendance'],
    yeargroup: ['attendance', 'behaviour', 'red', 'amber'],
    subjects: ['behaviour'],
    behaviour: ['behaviour'],
    send: ['send'],
    safeguarding: ['red'],
    career: ['career'],
    open_interventions: ['open_interventions', 'urgent'],
    effectiveness: ['completed_interventions'],
    impact: ['completed_interventions'],
    success: ['completed_interventions'],
    pd: ['open_interventions'],
    patterns: [],
  };

  function isSectionVisible(sectionId: string): boolean {
    if (activeFilters.size === 0) return true;
    const relevant = SECTION_FILTER_MAP[sectionId];
    if (!relevant || relevant.length === 0) return true; // always shown
    return relevant.some(f => activeFilters.has(f));
  }

  useEffect(() => {
    async function load() {
      const [st, a, i, c] = await Promise.all([
        getStudents(profile?.school_id),
        getAnalysisResults(profile?.school_id),
        getInterventions(profile?.school_id),
        getCareerProfiles(profile?.school_id),
      ]);
      setStudents(st);
      setAnalysis(a);
      setInterventions(i);
      setCareers(c);
      setLoading(false);
    }
    load();
  }, [profile?.school_id]);

  const analysisMap = useMemo(() => {
    const m = new Map<string, AnalysisResult>();
    analysis.forEach((a) => m.set(a.student_id, a));
    return m;
  }, [analysis]);

  const careerMap = useMemo(() => {
    const m = new Map<string, CareerProfile>();
    careers.forEach((c) => m.set(c.student_id, c));
    return m;
  }, [careers]);

  // Date-range filtered interventions — used throughout the report sections
  const dateFilteredInterventions = useMemo(() => {
    const bounds = getDateBounds();
    if (!bounds.from) return interventions;
    return interventions.filter(i => {
      const d = new Date(i.created_at || i.due_date || '');
      if (isNaN(d.getTime())) return true;
      if (bounds.from && d < bounds.from) return false;
      if (bounds.to && d > bounds.to) return false;
      return true;
    });
  }, [interventions, dateRange, customFrom, customTo]);

  // Base data sets
  const redStudents = useMemo(() => students.filter((s) => analysisMap.get(s.id)?.risk_level === 'red'), [students, analysisMap]);
  const amberStudents = useMemo(() => students.filter((s) => analysisMap.get(s.id)?.risk_level === 'amber'), [students, analysisMap]);
  const attendanceConcerns = useMemo(() => students.filter((s) => (s.attendance_pct || 95) < 90), [students]);
  const behaviourEscalation = useMemo(() => students.filter((s) => analysisMap.get(s.id)?.behaviour_trend === 'Escalating'), [students, analysisMap]);
  const sendStudents = useMemo(() => students.filter((s) => s.send_status), [students]);
  const careerAtRisk = useMemo(() => students.filter((s) => careerMap.get(s.id)?.destination_risk?.includes('risk')), [students, careerMap]);
  const openInterventions = useMemo(() => dateFilteredInterventions.filter((i) => i.status === 'open' || i.status === 'in_progress'), [dateFilteredInterventions]);
  const completedInterventions = useMemo(() => dateFilteredInterventions.filter((i) => i.status === 'completed'), [dateFilteredInterventions]);
  const urgentInterventions = useMemo(() => dateFilteredInterventions.filter((i) => i.priority === 'urgent' && i.status !== 'completed'), [dateFilteredInterventions]);
  const escalatedInterventions = useMemo(() => dateFilteredInterventions.filter((i) => i.status === 'escalated'), [dateFilteredInterventions]);

  const dueThisWeek = useMemo(() => interventions.filter((i) => {
    if (!i.due_date || i.status === 'completed') return false;
    const due = new Date(i.due_date);
    const now = new Date();
    const week = new Date(); week.setDate(now.getDate() + 7);
    return due <= week && due >= now;
  }), [interventions]);

  const avgAttendance = students.length > 0
    ? Math.round(students.reduce((sum, s) => sum + (s.attendance_pct || 95), 0) / students.length)
    : 0;

  // Filtered student list based on active filter cards
  const filteredStudents = useMemo(() => {
    if (activeFilters.size === 0) return students;
    const sets: Student[][] = [];
    if (activeFilters.has('red')) sets.push(redStudents);
    if (activeFilters.has('amber')) sets.push(amberStudents);
    if (activeFilters.has('attendance')) sets.push(attendanceConcerns);
    if (activeFilters.has('behaviour')) sets.push(behaviourEscalation);
    if (activeFilters.has('send')) sets.push(sendStudents);
    if (activeFilters.has('career')) sets.push(careerAtRisk);
    if (activeFilters.has('open_interventions')) {
      const ids = new Set(openInterventions.map(i => i.student_id));
      sets.push(students.filter(s => ids.has(s.id)));
    }
    if (activeFilters.has('completed_interventions')) {
      const ids = new Set(completedInterventions.map(i => i.student_id));
      sets.push(students.filter(s => ids.has(s.id)));
    }
    if (activeFilters.has('urgent')) {
      const ids = new Set(urgentInterventions.map(i => i.student_id));
      sets.push(students.filter(s => ids.has(s.id)));
    }
    // Union all filtered sets, deduplicated
    const idSeen = new Set<string>();
    const result: Student[] = [];
    for (const set of sets) {
      for (const s of set) {
        if (!idSeen.has(s.id)) { idSeen.add(s.id); result.push(s); }
      }
    }
    return result;
  }, [activeFilters, students, redStudents, amberStudents, attendanceConcerns, behaviourEscalation, sendStudents, careerAtRisk, openInterventions, completedInterventions, urgentInterventions]);

  const filteredInterventions = useMemo(() => {
    if (activeFilters.size === 0) return interventions;
    if (activeFilters.has('urgent')) return interventions.filter(i => i.priority === 'urgent');
    const ids = new Set(filteredStudents.map(s => s.id));
    return interventions.filter(i => ids.has(i.student_id));
  }, [activeFilters, interventions, filteredStudents]);

  // Impact rows
  const impactRows: ImpactRow[] = useMemo(() => completedInterventions
    .filter(i => activeFilters.size === 0 || filteredStudents.some(s => s.id === i.student_id))
    .map((i) => {
      const student = students.find((s) => s.id === i.student_id);
      // MOCK_IMPACT: placeholder outcome data used until real outcome_status fields are recorded.
      // In live mode with real data, these values come from after_attendance/after_behaviour columns.
      const mock = MOCK_IMPACT[i.id] || {
        baselineAttendance: (student?.attendance_pct || 88) - Math.floor(Math.random() * 10),
        currentAttendance: student?.attendance_pct || 88,
        baselineBehaviour: (student?.behaviour_score || 0) + Math.floor(Math.random() * 8),
        currentBehaviour: student?.behaviour_score || 0,
        outcome: i.outcome ? 'Resolved' as const : 'No change' as const,
      };
      return { intervention: i, studentName: student?.name || i.student_id, studentId: i.student_id, ...mock };
    }), [completedInterventions, students, filteredStudents, activeFilters]);

  const totalClosed = impactRows.length;
  const successCount = impactRows.filter(r => r.outcome === 'Resolved' || r.outcome === 'Improving').length;
  const improvingCount = impactRows.filter(r => r.outcome === 'Improving').length;
  const escalatingCount = impactRows.filter(r => r.outcome === 'Escalating').length;
  const resolvedCount = impactRows.filter(r => r.outcome === 'Resolved').length;
  const successRate = totalClosed > 0 ? Math.round((successCount / totalClosed) * 100) : 0;
  const improvementRate = totalClosed > 0 ? Math.round((improvingCount / totalClosed) * 100) : 0;
  const escalationRate = totalClosed > 0 ? Math.round((escalatingCount / totalClosed) * 100) : 0;
  const resolutionRate = totalClosed > 0 ? Math.round((resolvedCount / totalClosed) * 100) : 0;

  // Effectiveness by action type
  const effectivenessRows: EffectivenessRow[] = useMemo(() => {
    const typeMap = new Map<string, EffectivenessRow>();
    completedInterventions.forEach((i) => {
      const type = i.action_type;
      if (!typeMap.has(type)) typeMap.set(type, { actionType: type, timesUsed: 0, improved: 0, resolved: 0, escalated: 0, noChange: 0, successRate: 0 });
      const row = typeMap.get(type)!;
      row.timesUsed++;
      const impact = impactRows.find(r => r.intervention.id === i.id);
      if (impact?.outcome === 'Improving') row.improved++;
      else if (impact?.outcome === 'Resolved') row.resolved++;
      else if (impact?.outcome === 'Escalating') row.escalated++;
      else row.noChange++;
    });
    typeMap.forEach(row => {
      row.successRate = row.timesUsed > 0 ? Math.round(((row.improved + row.resolved) / row.timesUsed) * 100) : 0;
    });
    return Array.from(typeMap.values()).sort((a, b) => b.timesUsed - a.timesUsed);
  }, [completedInterventions, impactRows]);

  // Staff workload + PD insights
  const staffRows = useMemo(() => {
    const workload = new Map<string, StaffWorkloadRow>();
    interventions.forEach((i) => {
      if (!i.assigned_to) return;
      const key = i.assigned_to;
      if (!workload.has(key)) workload.set(key, { name: key, role: '', openCount: 0, overdueCount: 0, completedCount: 0, successRate: 0, pdLabel: null });
      const row = workload.get(key)!;
      if (i.status === 'completed') row.completedCount++;
      else { row.openCount++; if (i.due_date && new Date(i.due_date) < new Date()) row.overdueCount++; }
    });
    workload.forEach((row) => {
      const staffCompleted = interventions.filter(i => i.assigned_to === row.name && i.status === 'completed');
      const staffSuccess = staffCompleted.filter(i => i.outcome && i.outcome.trim().length > 0).length;
      row.successRate = staffCompleted.length > 0 ? Math.round((staffSuccess / staffCompleted.length) * 100) : 0;
      // PD label based on outcome rate and overdue ratio
      if (staffCompleted.length >= 2) {
        if (row.successRate >= 75 && row.overdueCount === 0) row.pdLabel = 'Best Practice';
        else if (row.successRate >= 40 || row.overdueCount <= 1) row.pdLabel = 'Standard';
        else row.pdLabel = 'Training Opportunity';
      }
    });
    return Array.from(workload.values()).sort((a, b) => b.openCount - a.openCount);
  }, [interventions]);

  // Staff pattern: which staff members appear on multiple repeat concerns
  const staffPatterns = useMemo(() => {
    const map = new Map<string, Set<string>>();
    interventions.forEach(i => {
      if (!i.assigned_to) return;
      const key = i.assigned_to;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(i.student_id);
    });
    return Array.from(map.entries())
      .map(([staff, studentIds]) => ({
        staff,
        studentCount: studentIds.size,
        urgentCount: interventions.filter(i => i.assigned_to === staff && i.priority === 'urgent').length,
        overdueCount: interventions.filter(i => i.assigned_to === staff && i.due_date && new Date(i.due_date) < new Date() && i.status !== 'completed').length,
      }))
      .filter(r => r.studentCount > 1)
      .sort((a, b) => b.urgentCount - a.urgentCount || b.studentCount - a.studentCount);
  }, [interventions]);

  // Subject hotspots — scoped to filtered students
  const subjectHotspots = useMemo(() => {
    const counts = new Map<string, { behaviour: number; students: Set<string> }>();
    filteredStudents.forEach((s) => {
      const a = analysisMap.get(s.id);
      (a?.subjects_involved || []).forEach((subj) => {
        if (!counts.has(subj)) counts.set(subj, { behaviour: 0, students: new Set() });
        counts.get(subj)!.behaviour++;
        counts.get(subj)!.students.add(s.id);
      });
    });
    return Array.from(counts.entries())
      .map(([subject, data]) => ({ subject, incidentCount: data.behaviour, studentCount: data.students.size }))
      .sort((a, b) => b.incidentCount - a.incidentCount);
  }, [filteredStudents, analysisMap]);

  // Year group trends — scoped to filtered students
  const yearGroupTrends = useMemo(() => {
    const map = new Map<string, { year: string; redCount: number; amberCount: number; attendanceCount: number; behaviourCount: number; sendCount: number; total: number }>();
    filteredStudents.forEach((s) => {
      const y = s.year_group;
      if (!map.has(y)) map.set(y, { year: y, redCount: 0, amberCount: 0, attendanceCount: 0, behaviourCount: 0, sendCount: 0, total: 0 });
      const row = map.get(y)!;
      row.total++;
      const a = analysisMap.get(s.id);
      if (a?.risk_level === 'red') row.redCount++;
      else if (a?.risk_level === 'amber') row.amberCount++;
      if ((s.attendance_pct || 95) < 90) row.attendanceCount++;
      if (a?.behaviour_trend === 'Escalating') row.behaviourCount++;
      if (s.send_status) row.sendCount++;
    });
    return Array.from(map.values()).sort((a, b) => a.year.localeCompare(b.year));
  }, [filteredStudents, analysisMap]);

  // SEND data — scoped to filtered students
  const filteredSendStudents = useMemo(() => filteredStudents.filter(s => s.send_status), [filteredStudents]);
  const sendReviewsDue = filteredSendStudents.filter((s) => analysisMap.get(s.id)?.risk_level === 'red' || analysisMap.get(s.id)?.risk_level === 'amber').length;
  const sendEHCP = filteredSendStudents.filter((s) => s.send_status === 'EHCP').length;
  const sendSupportPlan = filteredSendStudents.filter((s) => s.send_status?.includes('Plan')).length;
  const sendPupilPremium = filteredSendStudents.filter((s) => s.pupil_premium).length;

  // Safeguarding — scoped to filtered students
  const safeguardingStudents = useMemo(() => filteredStudents.filter(s => {
    const a = analysisMap.get(s.id);
    return a?.key_reasons?.some(r => r.toLowerCase().includes('safeguard') || r.toLowerCase().includes('welfare'));
  }), [filteredStudents, analysisMap]);

  // Repeat concern students — scoped to filtered students
  const repeatConcernStudents = useMemo(() => {
    const map = new Map<string, { student: Student; categories: Set<string>; openCount: number; escalated: boolean }>();
    filteredStudents.forEach(s => {
      const a = analysisMap.get(s.id);
      const cats = new Set<string>();
      if (a?.risk_level === 'red') cats.add('Red priority');
      if ((s.attendance_pct || 95) < 90) cats.add('Attendance');
      if (a?.behaviour_trend === 'Escalating') cats.add('Behaviour escalation');
      if (s.send_status) cats.add('SEND');
      const stuInterventions = interventions.filter(i => i.student_id === s.id);
      if (stuInterventions.some(i => i.status === 'escalated')) cats.add('Escalated intervention');
      if (cats.size >= 2) {
        map.set(s.id, {
          student: s,
          categories: cats,
          openCount: stuInterventions.filter(i => i.status !== 'completed' && i.status !== 'closed').length,
          escalated: stuInterventions.some(i => i.status === 'escalated'),
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.categories.size - a.categories.size || b.openCount - a.openCount);
  }, [filteredStudents, analysisMap, interventions]);

  // Success stories — scoped to filtered students
  const successStories = useMemo(() => filteredStudents.filter(s => {
    const a = analysisMap.get(s.id);
    return s.graduation_status === 'success_story' || a?.celebration_type || a?.signal_category === 'green';
  }), [filteredStudents, analysisMap]);

  // School-wide patterns — use filtered attendance data
  const filteredAttendanceConcerns = useMemo(() => filteredStudents.filter(s => (s.attendance_pct || 95) < 90), [filteredStudents]);
  const yearGroupCounts: Record<string, number> = {};
  filteredAttendanceConcerns.forEach((s) => { yearGroupCounts[s.year_group] = (yearGroupCounts[s.year_group] || 0) + 1; });
  const topYearGroup = Object.entries(yearGroupCounts).sort((a, b) => b[1] - a[1])[0];
  const topSubject = subjectHotspots[0];
  const sendReviewsOverdue = Math.floor(sendReviewsDue * 0.4);
  const filteredRedStudents = useMemo(() => filteredStudents.filter(s => analysisMap.get(s.id)?.risk_level === 'red'), [filteredStudents, analysisMap]);
  const filteredAmberStudents = useMemo(() => filteredStudents.filter(s => analysisMap.get(s.id)?.risk_level === 'amber'), [filteredStudents, analysisMap]);
  const pupilPremiumRed = filteredRedStudents.filter((s) => s.pupil_premium).length;

  // Executive recommendations — scoped to filtered data
  const allRecommendations: Array<{ title: string; detail: string; level: 'urgent' | 'high' | 'medium'; action: string; category: ActiveFilter | 'all' }> = [];
  if (filteredRedStudents.length > 0) allRecommendations.push({ title: `${filteredRedStudents.length} student${filteredRedStudents.length > 1 ? 's' : ''} require urgent pastoral action`, detail: `${filteredRedStudents.map(s => s.name).join(', ')}`, level: 'urgent', action: 'Review now', category: 'red' });
  if (urgentInterventions.length > 0) allRecommendations.push({ title: `${urgentInterventions.length} urgent intervention${urgentInterventions.length > 1 ? 's' : ''} unresolved`, detail: 'Immediate action required — check the Actions page', level: 'urgent', action: 'View actions', category: 'urgent' });
  if (escalatedInterventions.length > 0) allRecommendations.push({ title: `${escalatedInterventions.length} escalated case${escalatedInterventions.length > 1 ? 's' : ''} awaiting resolution`, detail: 'Check escalated queue in Actions', level: 'high', action: 'Review escalations', category: 'open_interventions' });
  if (dueThisWeek.length > 0) allRecommendations.push({ title: `${dueThisWeek.length} action${dueThisWeek.length > 1 ? 's' : ''} due this week`, detail: 'Ensure all due actions are reviewed before end of week', level: 'high', action: 'Check schedule', category: 'open_interventions' });
  if (sendReviewsDue > 0) allRecommendations.push({ title: `${sendReviewsDue} SEND student${sendReviewsDue > 1 ? 's' : ''} flagged — provision review advised`, detail: 'Amber or red students with SEND status should be prioritised', level: 'high', action: 'SEND review', category: 'send' });
  if (pupilPremiumRed > 0) allRecommendations.push({ title: `${pupilPremiumRed} Pupil Premium student${pupilPremiumRed > 1 ? 's' : ''} at red priority`, detail: 'Review disadvantage gap — Pupil Premium students overrepresented in urgent category', level: 'high', action: 'Review', category: 'red' });
  if (topSubject && topSubject.incidentCount > 2) allRecommendations.push({ title: `${topSubject.subject} is a subject hotspot (${topSubject.incidentCount} incidents)`, detail: `${topSubject.studentCount} students involved — consider curriculum review or additional support`, level: 'medium', action: 'Subject report', category: 'behaviour' });
  if (repeatConcernStudents.length > 0) allRecommendations.push({ title: `${repeatConcernStudents.length} student${repeatConcernStudents.length > 1 ? 's' : ''} flagged across multiple concern categories`, detail: 'Multi-category concerns indicate complex need — holistic review recommended', level: 'medium', action: 'View students', category: 'all' });
  if (staffRows.some(r => r.openCount >= 6)) allRecommendations.push({ title: 'Staff workload imbalance detected', detail: `${staffRows.filter(r => r.openCount >= 6).map(r => r.name).join(', ')} has 6+ open actions — consider redistribution`, level: 'medium', action: 'Staff report', category: 'open_interventions' });
  if (filteredAmberStudents.length > 0) allRecommendations.push({ title: `${filteredAmberStudents.length} amber watchlist student${filteredAmberStudents.length > 1 ? 's' : ''} require monitoring`, detail: 'Review amber students and ensure intervention plans are in place', level: 'medium', action: 'View amber', category: 'amber' });
  if (filteredAttendanceConcerns.length > 0) allRecommendations.push({ title: `${filteredAttendanceConcerns.length} student${filteredAttendanceConcerns.length > 1 ? 's' : ''} below 90% attendance target`, detail: 'Attendance letters and meetings should be scheduled for persistent absentees', level: 'high', action: 'Attendance report', category: 'attendance' });
  if (behaviourEscalation.length > 0) allRecommendations.push({ title: `${behaviourEscalation.length} student${behaviourEscalation.length > 1 ? 's' : ''} with escalating behaviour trends`, detail: 'Review behaviour patterns and consider restorative intervention', level: 'high', action: 'Behaviour report', category: 'behaviour' });
  if (careerAtRisk.length > 0) allRecommendations.push({ title: `${careerAtRisk.length} student${careerAtRisk.length > 1 ? 's' : ''} at risk of NEET`, detail: 'Career signposting and destination planning required before end of year', level: 'high', action: 'Career report', category: 'career' });
  if (completedInterventions.length > 0) allRecommendations.push({ title: `${completedInterventions.length} intervention${completedInterventions.length > 1 ? 's' : ''} completed — review outcomes`, detail: `Success rate: ${successRate}%. Review impact data and identify what worked.`, level: 'medium', action: 'View outcomes', category: 'completed_interventions' });

  const recommendations = activeFilters.size === 0
    ? allRecommendations
    : allRecommendations.filter(r => r.category === 'all' || activeFilters.has(r.category as ActiveFilter));

  function toggleFilter(f: ActiveFilter) {
    setActiveFilters(prev => {
      const next = new Set(prev);
      if (next.has(f)) next.delete(f); else next.add(f);
      return next;
    });
  }

  function clearFilters() { setActiveFilters(new Set()); }

  function toggleSection(key: string) {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  function goToStudent(id: string) { navigate(`/students/${id}`); }

  const filterCards: Array<{ key: ActiveFilter; label: string; value: number; color: string; bg: string; border: string; activeBg: string }> = [
    { key: 'red', label: 'Red priority', value: redStudents.length, color: 'text-red-600', bg: 'bg-red-50', border: 'border-red-100', activeBg: 'bg-red-100 border-red-400 ring-2 ring-red-300' },
    { key: 'amber', label: 'Amber watchlist', value: amberStudents.length, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100', activeBg: 'bg-amber-100 border-amber-400 ring-2 ring-amber-300' },
    { key: 'attendance', label: 'Attendance alerts', value: attendanceConcerns.length, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100', activeBg: 'bg-blue-100 border-blue-400 ring-2 ring-blue-300' },
    { key: 'behaviour', label: 'Behaviour esc.', value: behaviourEscalation.length, color: 'text-orange-600', bg: 'bg-orange-50', border: 'border-orange-100', activeBg: 'bg-orange-100 border-orange-400 ring-2 ring-orange-300' },
    { key: 'send', label: 'SEND support', value: sendStudents.length, color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-100', activeBg: 'bg-violet-100 border-violet-400 ring-2 ring-violet-300' },
    { key: 'career', label: 'Career risks', value: careerAtRisk.length, color: 'text-rose-600', bg: 'bg-rose-50', border: 'border-rose-100', activeBg: 'bg-rose-100 border-rose-400 ring-2 ring-rose-300' },
    { key: 'open_interventions', label: 'Open interventions', value: openInterventions.length, color: 'text-teal-600', bg: 'bg-teal-50', border: 'border-teal-100', activeBg: 'bg-teal-100 border-teal-400 ring-2 ring-teal-300' },
    { key: 'urgent', label: 'Urgent actions', value: urgentInterventions.length, color: 'text-red-700', bg: 'bg-red-50', border: 'border-red-200', activeBg: 'bg-red-200 border-red-500 ring-2 ring-red-400' },
    { key: 'completed_interventions', label: 'Completed', value: completedInterventions.length, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100', activeBg: 'bg-emerald-100 border-emerald-400 ring-2 ring-emerald-300' },
  ];

  function downloadCSV() {
    const studentsToExport = filteredStudents;
    const rows = [
      ['Student', 'Year', 'Form', 'Attendance', 'Behaviour Score', 'Risk Level', 'SEND', 'Pupil Premium', 'Key Reasons', 'Suggested Action', 'Review Date'],
      ...studentsToExport.map((s) => {
        const a = analysisMap.get(s.id);
        return [
          s.name, s.year_group, s.form, `${s.attendance_pct ?? 95}%`, String(s.behaviour_score ?? 0),
          a?.risk_level || 'green', s.send_status || '', s.pupil_premium ? 'Yes' : 'No',
          a?.key_reasons?.join('; ') || '', a?.suggested_pastoral_action || '', a?.recommended_review_date || '',
        ];
      }),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const filterSuffix = activeFilters.size > 0 ? `-filtered-${Array.from(activeFilters).join('_')}` : '';
    a.download = `student-signal-data-${new Date().toISOString().split('T')[0]}${filterSuffix}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function downloadInterventionsCSV() {
    const rows = [
      ['Action', 'Student', 'Assigned To', 'Priority', 'Status', 'Due Date', 'Notes', 'Outcome'],
      ...filteredInterventions.map((i) => [
        i.action_type,
        students.find(s => s.id === i.student_id)?.name || i.student_id,
        i.assigned_to || '',
        i.priority,
        i.status,
        i.due_date || '',
        i.notes || '',
        i.outcome || '',
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `interventions-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  }

  function buildReportText() {
    const filterLabel: Record<string, string> = {
      red: 'Red Priority', amber: 'Amber Watchlist', attendance: 'Attendance',
      behaviour: 'Behaviour', send: 'SEND', career: 'Career Risks',
      open_interventions: 'Open Interventions', completed_interventions: 'Completed Interventions', urgent: 'Urgent',
    };
    const filterSummary = activeFilters.size > 0
      ? `Filters applied: ${Array.from(activeFilters).map(f => filterLabel[f] || f).join(', ')}\nStudents in scope: ${filteredStudents.length} of ${students.length}\n`
      : `All students — no filter applied (${students.length} students)\n`;
    return `Student Signal — Report
Generated: ${new Date().toLocaleDateString('en-GB')}
${filterSummary}
EXECUTIVE SUMMARY
- ${filteredRedStudents.length} red priority students requiring urgent action
- ${filteredAmberStudents.length} amber watchlist students requiring monitoring
- ${filteredInterventions.filter(i => i.status === 'open' || i.status === 'in_progress').length} open interventions in progress (${urgentInterventions.length} urgent)
- ${filteredAttendanceConcerns.length} attendance concerns (below 90%)
- ${behaviourEscalation.length} behaviour escalation cases
- ${filteredSendStudents.length} SEND support students
- ${careerAtRisk.length} career/destination risk cases
- Average attendance: ${avgAttendance}%

EXECUTIVE RECOMMENDATIONS
${recommendations.map(r => `[${r.level.toUpperCase()}] ${r.title}\n  ${r.detail}`).join('\n')}

RED PRIORITY STUDENTS
${filteredRedStudents.map((s) => {
  const a = analysisMap.get(s.id);
  return `- ${s.name} (${s.year_group}, ${s.form}) — Attendance: ${s.attendance_pct ?? 95}%, Behaviour: ${s.behaviour_score ?? 0}pts
  Reasons: ${a?.key_reasons?.slice(0, 2).join(', ')}
  Action: ${a?.suggested_pastoral_action || 'Review required'}`;
}).join('\n')}

OPEN INTERVENTIONS
${filteredInterventions.filter(i => i.status === 'open' || i.status === 'in_progress').map((i) => `- ${i.action_type} for ${students.find((s) => s.id === i.student_id)?.name || i.student_id} (Due: ${i.due_date || 'Not set'}, Priority: ${i.priority})`).join('\n')}

---
Student Signal — Decision support, not decision replacement.
Staff remain responsible for all safeguarding and pastoral decisions.`;
  }

  function downloadPDFReport(reportType = 'Executive SLT Report') {
    const filterLabel: Record<string, string> = {
      red: 'Red Priority', amber: 'Amber Watchlist', attendance: 'Attendance',
      behaviour: 'Behaviour', send: 'SEND', career: 'Career Risks',
      open_interventions: 'Open Interventions', completed_interventions: 'Completed Interventions', urgent: 'Urgent',
    };
    generatePDF({
      reportType,
      schoolName: 'Student Signal School',
      generatedBy: (profile as any)?.full_name || 'School Staff',
      activeFilters: Array.from(activeFilters).map(f => filterLabel[f] || f),
      date: new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }),
      students: filteredStudents,
      redStudents: filteredRedStudents,
      amberStudents: filteredAmberStudents,
      attendanceConcerns: filteredAttendanceConcerns,
      behaviourEscalation: filteredStudents.filter(s => analysisMap.get(s.id)?.behaviour_trend === 'Escalating'),
      sendStudents: filteredSendStudents,
      openInterventions: filteredInterventions.filter(i => i.status === 'open' || i.status === 'in_progress'),
      urgentInterventions: filteredInterventions.filter(i => i.priority === 'urgent' && i.status !== 'completed'),
      completedInterventions: filteredInterventions.filter(i => i.status === 'completed'),
      escalatedInterventions: filteredInterventions.filter(i => i.status === 'escalated'),
      avgAttendance,
      successRate,
      resolutionRate,
      effectivenessRows,
      impactRows: impactRows.filter(r => activeFilters.size === 0 || filteredStudents.some(s => s.id === r.studentId)),
      yearGroupStats: yearGroupTrends.map(y => ({ year: y.year, count: y.total, redCount: y.redCount, amberCount: y.amberCount })),
      subjectHotspots: subjectHotspots.map(s => ({ subject: s.subject, count: s.incidentCount })),
      recommendations: recommendations.map(r => ({ title: r.title, detail: r.detail, level: r.level === 'urgent' ? 'critical' : r.level as 'high' | 'medium' | 'info' })),
      staffRows,
    });
  }

  function copySummary() {
    const date = new Date().toLocaleDateString('en-GB', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const filterLine = activeFilters.size > 0 ? `[Filtered: ${Array.from(activeFilters).join(', ')}]\n` : '';
    const topRecs = recommendations.slice(0, 4);
    const text = `STUDENT SIGNAL — EXECUTIVE SUMMARY
${date}
${filterLine}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
KEY METRICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔴 Red Priority:          ${redStudents.length} student${redStudents.length !== 1 ? 's' : ''}
🟡 Amber Watchlist:       ${amberStudents.length} student${amberStudents.length !== 1 ? 's' : ''}
📊 Avg Attendance:        ${avgAttendance}%${avgAttendance < 90 ? ' ⚠ Below target' : avgAttendance < 95 ? ' → Watch' : ' ✓'}
🚨 Urgent Actions:        ${urgentInterventions.length}
📋 Open Interventions:    ${openInterventions.length}
✅ Intervention Success:  ${successRate}%

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIORITY ACTIONS REQUIRED
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${topRecs.length > 0 ? topRecs.map((r, i) => `${i + 1}. [${r.level.toUpperCase()}] ${r.title}\n   ${r.detail}`).join('\n') : 'No urgent actions at this time.'}

${redStudents.length > 0 ? `RED PRIORITY STUDENTS: ${redStudents.map(s => s.name).join(', ')}` : ''}
Generated via Student Signal — Confidential, authorised staff only`;
    navigator.clipboard.writeText(text.trim()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function SectionHeader({ id, icon, title, subtitle, count }: { id: string; icon: React.ReactNode; title: string; subtitle: string; count?: number }) {
    const open = expandedSections.has(id);
    return (
      <button
        onClick={() => toggleSection(id)}
        className="w-full px-6 py-5 border-b border-slate-100 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left"
      >
        <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">{icon}</div>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        {count !== undefined && (
          <span className="text-sm font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-full shrink-0">{count}</span>
        )}
        {open ? <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />}
      </button>
    );
  }

  if (loading) {
    return <div className="flex items-center justify-center h-96"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" /></div>;
  }

  return (
    <div className="space-y-6">
      <GlobalPriorityBar />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Reports & Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Executive overview for SLT, DSLs, and Heads of Year.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="relative group">
            <button className="btn-primary flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Download PDF
              <ChevronDown className="w-3.5 h-3.5 ml-0.5" />
            </button>
            <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl shadow-xl border border-slate-200 overflow-hidden z-20 hidden group-hover:block">
              {[
                ['Executive SLT Report', 'Full overview for leadership'],
                ['DSL Safeguarding Report', 'Safeguarding & red priority'],
                ['Head of Year Report', 'Year group & pastoral focus'],
                ['Attendance Report', 'Attendance concerns & trends'],
                ['SEND Report', 'Special educational needs'],
                ['Intervention Impact Report', 'Outcomes & effectiveness'],
              ].map(([type, sub]) => (
                <button
                  key={type}
                  onClick={() => downloadPDFReport(type)}
                  className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-0"
                >
                  <div className="text-xs font-semibold text-slate-800">{type}</div>
                  <div className="text-[10px] text-slate-500">{sub}</div>
                </button>
              ))}
            </div>
          </div>
          <button onClick={downloadCSV} className="btn-secondary">
            <BarChart3 className="w-4 h-4" />
            Export CSV
          </button>
          <button onClick={downloadInterventionsCSV} className="btn-secondary">
            <ClipboardList className="w-4 h-4" />
            Actions CSV
          </button>
          <button onClick={copySummary} className="btn-secondary">
            {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy for SLT'}
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider shrink-0">Date range:</span>
        {(['all', 'today', 'week', 'month', 'term', 'year', 'custom'] as const).map(r => (
          <button
            key={r}
            onClick={() => setDateRange(r)}
            className={`text-xs px-3 py-1.5 rounded-lg border font-semibold transition-colors ${
              dateRange === r
                ? 'bg-teal-600 text-white border-teal-600'
                : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'
            }`}
          >
            {r === 'all' ? 'All time' : r === 'today' ? 'Today' : r === 'week' ? 'Last 7 days' : r === 'month' ? 'Last 30 days' : r === 'term' ? 'This term' : r === 'year' ? 'Academic year' : 'Custom'}
          </button>
        ))}
        {dateRange === 'custom' && (
          <div className="flex items-center gap-2 ml-1">
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700" />
            <span className="text-xs text-slate-400">to</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-700" />
          </div>
        )}
        {dateRange !== 'all' && (
          <span className="text-xs text-slate-500 bg-teal-50 border border-teal-200 px-2 py-1 rounded-lg font-medium">
            {dateFilteredInterventions.length} action{dateFilteredInterventions.length !== 1 ? 's' : ''} in range
          </span>
        )}
      </div>

      {/* Live Filter Cards */}
      <div className="card-premium p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-semibold text-slate-700">Live Report Filters</span>
            <span className="text-xs text-slate-400">— click cards to filter all sections</span>
          </div>
          {activeFilters.size > 0 && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 transition-colors font-medium">
              <X className="w-3.5 h-3.5" /> Clear filters
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
          {filterCards.map((card) => {
            const isActive = activeFilters.has(card.key);
            return (
              <button
                key={card.key}
                onClick={() => toggleFilter(card.key)}
                className={`rounded-xl p-3 text-center border transition-all duration-150 cursor-pointer ${
                  isActive ? card.activeBg : `${card.bg} ${card.border} hover:opacity-80`
                }`}
              >
                <div className={`text-2xl font-bold ${card.color}`}>{card.value}</div>
                <div className="text-[10px] text-slate-500 mt-1 font-medium leading-tight">{card.label}</div>
              </button>
            );
          })}
        </div>
        {activeFilters.size > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5 items-center">
            <span className="text-xs text-slate-500 font-medium">Active:</span>
            {Array.from(activeFilters).map(f => {
              const card = filterCards.find(c => c.key === f);
              return (
                <span key={f} className={`flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full ${card?.bg} ${card?.color} border ${card?.border}`}>
                  {card?.label}
                  <X className="w-3 h-3 cursor-pointer hover:opacity-70" onClick={() => toggleFilter(f)} />
                </span>
              );
            })}
            <span className="text-xs text-slate-400">({filteredStudents.length} student{filteredStudents.length !== 1 ? 's' : ''} matched)</span>
          </div>
        )}
      </div>

      {/* Filter summary banner — shown when filters are active */}
      {activeFilters.size > 0 && (
        <div className="flex items-center gap-3 px-5 py-4 rounded-2xl bg-teal-50 border border-teal-200">
          <Filter className="w-4 h-4 text-teal-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold text-teal-700 uppercase tracking-wider mb-1">Report scope — active filters</p>
            <div className="flex flex-wrap gap-1.5">
              {Array.from(activeFilters).map(f => {
                const card = filterCards.find(c => c.key === f);
                return <span key={f} className="px-2.5 py-0.5 rounded-full bg-teal-100 text-teal-800 text-xs font-semibold border border-teal-200">{card?.label || f}</span>;
              })}
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-bold text-teal-700">{filteredStudents.length}</div>
            <div className="text-[10px] text-teal-600">students in scope</div>
          </div>
        </div>
      )}

      {/* Executive Recommendations */}
      <div className="card-premium overflow-hidden">
        <SectionHeader
          id="recommendations"
          icon={<Lightbulb className="w-5 h-5 text-amber-500" />}
          title="Executive Recommendations"
          subtitle="Auto-generated from current data — prioritised actions for SLT"
          count={recommendations.length}
        />
        {expandedSections.has('recommendations') && (
          <div className="p-6 space-y-2.5">
            {recommendations.length === 0 && (
              <div className="text-center py-8">
                <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                <p className="text-sm font-semibold text-slate-600">No urgent recommendations</p>
                <p className="text-xs text-slate-400 mt-1">All monitored areas are within expected ranges.</p>
              </div>
            )}
            {recommendations.map((rec, idx) => {
              const cfg =
                rec.level === 'urgent' ? { bg: 'bg-red-50 border-red-200', text: 'text-red-900', badge: 'bg-red-100 text-red-700', icon: <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" /> } :
                rec.level === 'high'   ? { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-900', badge: 'bg-amber-100 text-amber-700', icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /> } :
                { bg: 'bg-blue-50 border-blue-100', text: 'text-blue-900', badge: 'bg-blue-100 text-blue-700', icon: <Info className="w-4 h-4 text-blue-500 shrink-0" /> };
              return (
                <div key={idx} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${cfg.bg}`}>
                  {cfg.icon}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${cfg.text}`}>{rec.title}</p>
                    <p className={`text-xs mt-0.5 ${cfg.text} opacity-80`}>{rec.detail}</p>
                  </div>
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${cfg.badge}`}>{rec.level}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Red Priority */}
      {isSectionVisible('red') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="red"
          icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
          title="Red Priority Students"
          subtitle="Urgent pastoral action required"
          count={filteredStudents.filter(s => analysisMap.get(s.id)?.risk_level === 'red').length}
        />
        {expandedSections.has('red') && (() => {
          const rows = filteredStudents.filter(s => analysisMap.get(s.id)?.risk_level === 'red');
          return (
            <div className="overflow-x-auto">
              <table className="table-premium">
                <thead><tr><th>Student</th><th>Year</th><th>Attendance</th><th>Behaviour</th><th>SEND</th><th>Key reasons</th><th>Suggested action</th></tr></thead>
                <tbody>
                  {rows.map((s) => {
                    const a = analysisMap.get(s.id);
                    return (
                      <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => goToStudent(s.id)}>
                        <td className="font-semibold text-slate-800 text-teal-700 hover:underline">
                          {s.name}
                          {s.pupil_premium && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">PP</span>}
                        </td>
                        <td className="text-slate-600">{s.year_group}</td>
                        <td className="font-semibold text-red-600">{s.attendance_pct ?? 95}%</td>
                        <td className="font-semibold text-red-600">{s.behaviour_score ?? 0} pts</td>
                        <td className="text-slate-600">{s.send_status || '—'}</td>
                        <td className="text-slate-600">{a?.key_reasons?.slice(0, 2).join('; ')}</td>
                        <td className="text-slate-600">{a?.suggested_pastoral_action}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && (
                <div className="empty-state py-10">
                  <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-slate-700">No red priority students {activeFilters.size > 0 ? 'in current filter' : ''}</p>
                </div>
              )}
            </div>
          );
        })()}
      </div>}

      {/* Amber */}
      {isSectionVisible('amber') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="amber"
          icon={<Eye className="w-5 h-5 text-amber-600" />}
          title="Amber Watchlist"
          subtitle="Monitor and schedule interventions"
          count={filteredStudents.filter(s => analysisMap.get(s.id)?.risk_level === 'amber').length}
        />
        {expandedSections.has('amber') && (() => {
          const rows = filteredStudents.filter(s => analysisMap.get(s.id)?.risk_level === 'amber');
          return (
            <div className="overflow-x-auto">
              <table className="table-premium">
                <thead><tr><th>Student</th><th>Year</th><th>Attendance</th><th>Behaviour</th><th>Key reasons</th><th>Review date</th></tr></thead>
                <tbody>
                  {rows.map((s) => {
                    const a = analysisMap.get(s.id);
                    return (
                      <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => goToStudent(s.id)}>
                        <td className="font-semibold text-teal-700 hover:underline">{s.name}</td>
                        <td className="text-slate-600">{s.year_group}</td>
                        <td className="text-amber-600 font-semibold">{s.attendance_pct ?? 95}%</td>
                        <td className="text-amber-600 font-semibold">{s.behaviour_score ?? 0} pts</td>
                        <td className="text-slate-600">{a?.key_reasons?.slice(0, 2).join('; ')}</td>
                        <td className="text-slate-600">{a?.recommended_review_date || 'Not set'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {rows.length === 0 && <div className="empty-state py-10"><p className="text-sm text-slate-500">No amber watchlist students {activeFilters.size > 0 ? 'in current filter' : ''}</p></div>}
            </div>
          );
        })()}
      </div>}

      {/* Repeat Concern Students */}
      {isSectionVisible('repeat') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="repeat"
          icon={<Repeat2 className="w-5 h-5 text-rose-600" />}
          title="Repeat Concern Students"
          subtitle="Flagged across 2+ concern categories — complex need, holistic review recommended"
          count={repeatConcernStudents.length}
        />
        {expandedSections.has('repeat') && (
          <div className="overflow-x-auto">
            <table className="table-premium">
              <thead><tr><th>Student</th><th>Year</th><th>Concern categories</th><th>Open actions</th><th>Escalated</th></tr></thead>
              <tbody>
                {repeatConcernStudents.map(({ student: s, categories, openCount, escalated }) => (
                  <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => goToStudent(s.id)}>
                    <td className="font-semibold text-teal-700 hover:underline">
                      {s.name}
                      {s.pupil_premium && <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-semibold">PP</span>}
                    </td>
                    <td className="text-slate-600">{s.year_group}</td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {Array.from(categories).map(cat => (
                          <span key={cat} className="text-[10px] px-1.5 py-0.5 rounded bg-rose-50 border border-rose-100 text-rose-700 font-medium">{cat}</span>
                        ))}
                      </div>
                    </td>
                    <td className={`font-semibold ${openCount > 2 ? 'text-red-600' : 'text-slate-700'}`}>{openCount}</td>
                    <td>{escalated ? <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-semibold">Yes</span> : <span className="text-xs text-slate-400">No</span>}</td>
                  </tr>
                ))}
                {repeatConcernStudents.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8 text-sm text-slate-400">No students flagged across multiple concern categories.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* Attendance alerts */}
      {isSectionVisible('attendance') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="attendance"
          icon={<TrendingDown className="w-5 h-5 text-blue-600" />}
          title="Attendance Alerts"
          subtitle="Students below 90% attendance target"
          count={filteredStudents.filter(s => (s.attendance_pct || 95) < 90).length}
        />
        {expandedSections.has('attendance') && (() => {
          const rows = filteredStudents.filter(s => (s.attendance_pct || 95) < 90).sort((a, b) => (a.attendance_pct || 95) - (b.attendance_pct || 95));
          return (
            <div className="overflow-x-auto">
              <table className="table-premium">
                <thead><tr><th>Student</th><th>Year</th><th>Attendance</th><th>Risk level</th><th>Trend</th><th>SEND</th></tr></thead>
                <tbody>
                  {rows.map((s) => {
                    const a = analysisMap.get(s.id);
                    return (
                      <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => goToStudent(s.id)}>
                        <td className="font-semibold text-teal-700 hover:underline">{s.name}</td>
                        <td>{s.year_group}</td>
                        <td className={`font-semibold ${(s.attendance_pct || 95) < 85 ? 'text-red-600' : 'text-amber-600'}`}>{s.attendance_pct ?? 95}%</td>
                        <td><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a?.risk_level === 'red' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{a?.risk_level || 'green'}</span></td>
                        <td className="text-slate-600">{a?.attendance_trend || '—'}</td>
                        <td className="text-slate-600">{s.send_status || '—'}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm text-slate-400">No attendance concerns {activeFilters.size > 0 ? 'in current filter' : ''}</td></tr>}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>}

      {/* Year Group Trends */}
      {isSectionVisible('yeargroup') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="yeargroup"
          icon={<Building2 className="w-5 h-5 text-sky-600" />}
          title="Year Group Trends"
          subtitle="Risk distribution across year groups"
          count={yearGroupTrends.length}
        />
        {expandedSections.has('yeargroup') && (
          <div className="overflow-x-auto">
            <table className="table-premium">
              <thead><tr><th>Year group</th><th>Total</th><th>Red priority</th><th>Amber</th><th>Attendance concerns</th><th>Behaviour esc.</th><th>SEND</th><th>Risk %</th></tr></thead>
              <tbody>
                {yearGroupTrends.map((row) => {
                  const riskPct = row.total > 0 ? Math.round(((row.redCount + row.amberCount) / row.total) * 100) : 0;
                  return (
                    <tr key={row.year}>
                      <td className="font-semibold text-slate-800">{row.year}</td>
                      <td className="text-slate-600">{row.total}</td>
                      <td className={row.redCount > 0 ? 'font-semibold text-red-600' : 'text-slate-400'}>{row.redCount}</td>
                      <td className={row.amberCount > 0 ? 'font-semibold text-amber-600' : 'text-slate-400'}>{row.amberCount}</td>
                      <td className={row.attendanceCount > 0 ? 'font-semibold text-blue-600' : 'text-slate-400'}>{row.attendanceCount}</td>
                      <td className={row.behaviourCount > 0 ? 'font-semibold text-orange-600' : 'text-slate-400'}>{row.behaviourCount}</td>
                      <td className={row.sendCount > 0 ? 'font-semibold text-violet-600' : 'text-slate-400'}>{row.sendCount}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${riskPct >= 40 ? 'bg-red-400' : riskPct >= 20 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${riskPct}%` }} />
                          </div>
                          <span className={`text-xs font-semibold ${riskPct >= 40 ? 'text-red-600' : riskPct >= 20 ? 'text-amber-600' : 'text-emerald-600'}`}>{riskPct}%</span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {yearGroupTrends.length === 0 && <tr><td colSpan={8} className="text-center py-8 text-sm text-slate-400">No year group data available.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* Subject Hotspots */}
      {isSectionVisible('subjects') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="subjects"
          icon={<BookOpen className="w-5 h-5 text-indigo-600" />}
          title="Subject Hotspots"
          subtitle="Subjects appearing most frequently in behaviour signals"
          count={subjectHotspots.length}
        />
        {expandedSections.has('subjects') && (
          <div className="overflow-x-auto">
            <table className="table-premium">
              <thead><tr><th>Subject</th><th>Incident count</th><th>Students affected</th><th>Signal intensity</th></tr></thead>
              <tbody>
                {subjectHotspots.map((row) => {
                  const maxCount = subjectHotspots[0]?.incidentCount || 1;
                  const pct = Math.round((row.incidentCount / maxCount) * 100);
                  return (
                    <tr key={row.subject}>
                      <td className="font-semibold text-slate-800">{row.subject}</td>
                      <td className={`font-semibold ${row.incidentCount > 4 ? 'text-red-600' : row.incidentCount > 2 ? 'text-amber-600' : 'text-slate-600'}`}>{row.incidentCount}</td>
                      <td className="text-slate-600">{row.studentCount}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <div className="w-24 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div className={`h-full rounded-full ${pct >= 80 ? 'bg-red-400' : pct >= 50 ? 'bg-amber-400' : 'bg-blue-400'}`} style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {subjectHotspots.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-sm text-slate-400">No subject data available.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* Behaviour escalation */}
      {isSectionVisible('behaviour') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="behaviour"
          icon={<Activity className="w-5 h-5 text-orange-600" />}
          title="Behaviour Escalation"
          subtitle="Students with escalating behaviour trends"
          count={filteredStudents.filter(s => analysisMap.get(s.id)?.behaviour_trend === 'Escalating').length}
        />
        {expandedSections.has('behaviour') && (() => {
          const rows = filteredStudents.filter(s => analysisMap.get(s.id)?.behaviour_trend === 'Escalating');
          return (
            <div className="overflow-x-auto">
              <table className="table-premium">
                <thead><tr><th>Student</th><th>Year</th><th>Behaviour score</th><th>Trend</th><th>Top subject</th><th>Period</th></tr></thead>
                <tbody>
                  {rows.map((s) => {
                    const a = analysisMap.get(s.id);
                    return (
                      <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => goToStudent(s.id)}>
                        <td className="font-semibold text-teal-700 hover:underline">{s.name}</td>
                        <td>{s.year_group}</td>
                        <td className="font-semibold text-orange-600">{s.behaviour_score ?? 0} pts</td>
                        <td><span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-700">Escalating</span></td>
                        <td className="text-slate-600">{a?.subjects_involved?.[0] || '—'}</td>
                        <td className="text-slate-600">{a?.periods_involved?.[0] || '—'}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm text-slate-400">No escalating behaviour patterns {activeFilters.size > 0 ? 'in current filter' : ''}</td></tr>}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>}

      {/* SEND Reporting */}
      {isSectionVisible('send') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="send"
          icon={<Brain className="w-5 h-5 text-violet-600" />}
          title="SEND Reporting"
          subtitle="Full SEND picture — EHCP, support plans, provision monitoring"
          count={filteredSendStudents.length}
        />
        {expandedSections.has('send') && (
          <>
            <div className="px-6 pt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'EHCP', value: sendEHCP, color: 'text-violet-600', bg: 'bg-violet-50 border-violet-100' },
                { label: 'Support Plan', value: sendSupportPlan, color: 'text-sky-600', bg: 'bg-sky-50 border-sky-100' },
                { label: 'Also Pupil Premium', value: sendPupilPremium, color: 'text-blue-600', bg: 'bg-blue-50 border-blue-100' },
                { label: 'Review due (amber/red)', value: sendReviewsDue, color: sendReviewsDue > 0 ? 'text-red-600' : 'text-emerald-600', bg: sendReviewsDue > 0 ? 'bg-red-50 border-red-100' : 'bg-emerald-50 border-emerald-100' },
              ].map(item => (
                <div key={item.label} className={`rounded-xl p-3 text-center border ${item.bg}`}>
                  <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
                  <div className="text-xs text-slate-500 mt-1 font-medium">{item.label}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto mt-4">
              <table className="table-premium">
                <thead><tr><th>Student</th><th>Year</th><th>SEND status</th><th>Risk level</th><th>Pupil Premium</th><th>Review needed</th></tr></thead>
                <tbody>
                  {filteredStudents.filter(s => s.send_status).map((s) => {
                    const a = analysisMap.get(s.id);
                    const reviewNeeded = a?.risk_level === 'red' || a?.risk_level === 'amber';
                    return (
                      <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => goToStudent(s.id)}>
                        <td className="font-semibold text-teal-700 hover:underline">{s.name}</td>
                        <td>{s.year_group}</td>
                        <td className="text-violet-700 font-medium">{s.send_status}</td>
                        <td><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a?.risk_level === 'red' ? 'bg-red-100 text-red-700' : a?.risk_level === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{a?.risk_level || 'green'}</span></td>
                        <td>{s.pupil_premium ? <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-blue-100 text-blue-700">Yes</span> : '—'}</td>
                        <td>{reviewNeeded ? <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">Review due</span> : <span className="text-xs text-emerald-600 font-medium">Stable</span>}</td>
                      </tr>
                    );
                  })}
                  {filteredStudents.filter(s => s.send_status).length === 0 && <tr><td colSpan={6} className="text-center py-8 text-sm text-slate-400">No SEND students in current view.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>}

      {/* Safeguarding Review */}
      {isSectionVisible('safeguarding') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="safeguarding"
          icon={<ShieldAlert className="w-5 h-5 text-red-600" />}
          title="Safeguarding Review Report"
          subtitle="Students with safeguarding or welfare signals — DSL use only"
          count={safeguardingStudents.length}
        />
        {expandedSections.has('safeguarding') && (
          <>
            <div className="mx-6 mt-4 flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-xs text-red-800 font-medium">This section contains safeguarding-sensitive data. Ensure you are authorised to view it and that any concerns are reported through appropriate statutory channels.</p>
            </div>
            <div className="overflow-x-auto mt-2">
              <table className="table-premium">
                <thead><tr><th>Student</th><th>Year</th><th>Risk level</th><th>Signal reason</th><th>Review date</th><th>Open actions</th></tr></thead>
                <tbody>
                  {safeguardingStudents.map((s) => {
                    const a = analysisMap.get(s.id);
                    const stuActions = interventions.filter(i => i.student_id === s.id && i.status !== 'completed');
                    return (
                      <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => goToStudent(s.id)}>
                        <td className="font-semibold text-teal-700 hover:underline">{s.name}</td>
                        <td>{s.year_group}</td>
                        <td><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${a?.risk_level === 'red' ? 'bg-red-100 text-red-700' : a?.risk_level === 'amber' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>{a?.risk_level || 'green'}</span></td>
                        <td className="text-slate-600 max-w-[200px] truncate">{a?.key_reasons?.find(r => r.toLowerCase().includes('safeguard') || r.toLowerCase().includes('welfare')) || a?.key_reasons?.[0] || '—'}</td>
                        <td className="text-slate-600">{a?.recommended_review_date || 'Not set'}</td>
                        <td className={`font-semibold ${stuActions.length > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{stuActions.length}</td>
                      </tr>
                    );
                  })}
                  {safeguardingStudents.length === 0 && (
                    <tr><td colSpan={6} className="text-center py-8 text-sm text-slate-400">No safeguarding signals detected in current data.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>}

      {/* Career / destination risks */}
      {isSectionVisible('career') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="career"
          icon={<GraduationCap className="w-5 h-5 text-rose-600" />}
          title="Career / Destination Risks"
          subtitle="NEET risk and career signposting needs"
          count={filteredStudents.filter(s => careerMap.get(s.id)?.destination_risk?.includes('risk')).length}
        />
        {expandedSections.has('career') && (() => {
          const rows = filteredStudents.filter(s => careerMap.get(s.id)?.destination_risk?.includes('risk'));
          return (
            <div className="overflow-x-auto">
              <table className="table-premium">
                <thead><tr><th>Student</th><th>Year</th><th>Destination risk</th><th>Interests</th><th>Barriers</th></tr></thead>
                <tbody>
                  {rows.map((s) => {
                    const c = careerMap.get(s.id);
                    return (
                      <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => goToStudent(s.id)}>
                        <td className="font-semibold text-teal-700 hover:underline">{s.name}</td>
                        <td>{s.year_group}</td>
                        <td className="text-rose-700 font-semibold">{c?.destination_risk}</td>
                        <td className="text-slate-600">{c?.career_interests?.slice(0, 2).join(', ') || '—'}</td>
                        <td className="text-slate-600 max-w-[150px] truncate">{c?.barriers || '—'}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={5} className="text-center py-8 text-sm text-slate-400">No career/destination risk students {activeFilters.size > 0 ? 'in current filter' : ''}</td></tr>}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>}

      {/* Open Interventions */}
      {isSectionVisible('open_interventions') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="open_interventions"
          icon={<ClipboardList className="w-5 h-5 text-teal-600" />}
          title="Open Interventions"
          subtitle={`${filteredInterventions.filter(i => i.status === 'open' || i.status === 'in_progress').length} open · ${dueThisWeek.length} due this week · ${escalatedInterventions.length} escalated`}
          count={filteredInterventions.filter(i => i.status === 'open' || i.status === 'in_progress').length}
        />
        {expandedSections.has('open_interventions') && (() => {
          const rows = filteredInterventions
            .filter(i => i.status === 'open' || i.status === 'in_progress' || i.status === 'escalated')
            .sort((a, b) => {
              const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
              return (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3);
            });
          return (
            <div className="overflow-x-auto">
              <table className="table-premium">
                <thead><tr><th>Action</th><th>Student</th><th>Owner</th><th>Priority</th><th>Status</th><th>Due</th><th>Notes</th></tr></thead>
                <tbody>
                  {rows.map((i) => {
                    const student = students.find((s) => s.id === i.student_id);
                    return (
                      <tr key={i.id} className="cursor-pointer hover:bg-slate-50" onClick={() => student && goToStudent(i.student_id)}>
                        <td className="font-semibold text-slate-800">{i.action_type}</td>
                        <td className="text-teal-700 font-medium hover:underline">{student?.name || i.student_id}</td>
                        <td className="text-slate-600">{i.assigned_to || '—'}</td>
                        <td><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${i.priority === 'urgent' ? 'bg-red-100 text-red-700' : i.priority === 'high' ? 'bg-orange-100 text-orange-700' : i.priority === 'medium' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>{i.priority}</span></td>
                        <td><span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${i.status === 'escalated' ? 'bg-red-100 text-red-700' : i.status === 'in_progress' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>{i.status.replace('_', ' ')}</span></td>
                        <td className={`${dueThisWeek.some((d) => d.id === i.id) ? 'text-amber-600 font-semibold' : 'text-slate-600'}`}>{i.due_date || '—'}</td>
                        <td className="text-slate-600 max-w-[150px] truncate">{i.notes || '—'}</td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={7} className="text-center py-8"><CheckCircle className="w-7 h-7 text-emerald-400 mx-auto mb-2" /><p className="text-sm text-slate-500">No open interventions</p></td></tr>}
                </tbody>
              </table>
            </div>
          );
        })()}
      </div>}

      {/* Intervention Effectiveness Table */}
      {isSectionVisible('effectiveness') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="effectiveness"
          icon={<BarChart3 className="w-5 h-5 text-emerald-600" />}
          title="Intervention Effectiveness by Type"
          subtitle="Success rate per action type — helps identify what works"
          count={effectivenessRows.length}
        />
        {expandedSections.has('effectiveness') && (
          <>
            <div className="p-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Success Rate', value: successRate, desc: 'Improving or resolved', color: successRate >= 70 ? 'text-emerald-600' : successRate >= 40 ? 'text-amber-600' : 'text-red-600', bg: successRate >= 70 ? 'bg-emerald-50 border-emerald-200' : successRate >= 40 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200', icon: <CheckCircle className="w-5 h-5" /> },
                { label: 'Improvement Rate', value: improvementRate, desc: 'Actively improving', color: improvementRate >= 50 ? 'text-emerald-600' : improvementRate >= 25 ? 'text-amber-600' : 'text-slate-500', bg: improvementRate >= 50 ? 'bg-emerald-50 border-emerald-200' : 'bg-slate-50 border-slate-200', icon: <TrendingUp className="w-5 h-5" /> },
                { label: 'Resolution Rate', value: resolutionRate, desc: 'Fully resolved cases', color: resolutionRate >= 40 ? 'text-teal-600' : 'text-slate-500', bg: resolutionRate >= 40 ? 'bg-teal-50 border-teal-200' : 'bg-slate-50 border-slate-200', icon: <Target className="w-5 h-5" /> },
                { label: 'Escalation Rate', value: escalationRate, desc: 'Required escalation', color: escalationRate === 0 ? 'text-emerald-600' : escalationRate <= 15 ? 'text-amber-600' : 'text-red-600', bg: escalationRate === 0 ? 'bg-emerald-50 border-emerald-200' : escalationRate <= 15 ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200', icon: <AlertTriangle className="w-5 h-5" /> },
              ].map(item => (
                <div key={item.label} className={`rounded-2xl border p-5 ${item.bg}`}>
                  <div className={`${item.color} mb-3`}>{item.icon}</div>
                  <div className={`text-3xl font-black ${item.color} mb-0.5`}>{totalClosed > 0 ? `${item.value}%` : '—'}</div>
                  <div className="text-sm font-semibold text-slate-800">{item.label}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{item.desc}</div>
                </div>
              ))}
            </div>
            <div className="overflow-x-auto border-t border-slate-100">
              <table className="table-premium">
                <thead><tr><th>Action type</th><th>Times used</th><th>Improved</th><th>Resolved</th><th>Escalated</th><th>No change</th><th>Success rate</th></tr></thead>
                <tbody>
                  {effectivenessRows.map((row) => (
                    <tr key={row.actionType}>
                      <td className="font-semibold text-slate-800">{row.actionType}</td>
                      <td className="text-slate-600">{row.timesUsed}</td>
                      <td className="text-emerald-600 font-semibold">{row.improved}</td>
                      <td className="text-teal-600 font-semibold">{row.resolved}</td>
                      <td className={`font-semibold ${row.escalated > 0 ? 'text-red-600' : 'text-slate-400'}`}>{row.escalated}</td>
                      <td className={`font-semibold ${row.noChange > 0 ? 'text-slate-500' : 'text-slate-400'}`}>{row.noChange}</td>
                      <td>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${row.successRate >= 70 ? 'bg-emerald-100 text-emerald-700' : row.successRate >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-red-50 text-red-600'}`}>
                          {row.successRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                  {effectivenessRows.length === 0 && <tr><td colSpan={7} className="text-center py-8 text-sm text-slate-400">No completed interventions to analyse.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>}

      {/* Intervention Impact */}
      {isSectionVisible('impact') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="impact"
          icon={<Activity className="w-5 h-5 text-emerald-600" />}
          title="Intervention Impact — Baseline vs Current"
          subtitle="Per-student evidence of change after intervention"
          count={impactRows.length}
        />
        {expandedSections.has('impact') && (
          <div className="overflow-x-auto">
            <table className="table-premium">
              <thead><tr><th>Intervention</th><th>Student</th><th>Attendance</th><th>Behaviour</th><th>Outcome</th></tr></thead>
              <tbody>
                {impactRows.slice(0, 10).map((row, idx) => {
                  const attendanceDiff = row.currentAttendance - row.baselineAttendance;
                  const behaviourDiff = row.currentBehaviour - row.baselineBehaviour;
                  return (
                    <tr key={idx} className="cursor-pointer hover:bg-slate-50" onClick={() => goToStudent(row.studentId)}>
                      <td className="font-semibold text-slate-800">{row.intervention.action_type}</td>
                      <td className="text-teal-700 font-medium hover:underline">{row.studentName}</td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">{row.baselineAttendance}%</span>
                          <span className="text-slate-300">→</span>
                          <span className="text-sm font-semibold text-slate-800">{row.currentAttendance}%</span>
                          {attendanceDiff > 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> : attendanceDiff < 0 ? <ArrowDownRight className="w-3.5 h-3.5 text-red-500" /> : <Minus className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                      </td>
                      <td>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs text-slate-500">{row.baselineBehaviour}</span>
                          <span className="text-slate-300">→</span>
                          <span className="text-sm font-semibold text-slate-800">{row.currentBehaviour}</span>
                          {behaviourDiff < 0 ? <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" /> : behaviourDiff > 0 ? <ArrowDownRight className="w-3.5 h-3.5 text-red-500" /> : <Minus className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                      </td>
                      <td>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${row.outcome === 'Improving' ? 'bg-emerald-100 text-emerald-700' : row.outcome === 'Resolved' ? 'bg-teal-100 text-teal-700' : row.outcome === 'Escalating' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>{row.outcome}</span>
                      </td>
                    </tr>
                  );
                })}
                {impactRows.length === 0 && <tr><td colSpan={5} className="text-center py-8"><Star className="w-7 h-7 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-500">No completed interventions to analyse</p></td></tr>}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* Success Stories */}
      {isSectionVisible('success') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="success"
          icon={<Award className="w-5 h-5 text-amber-500" />}
          title="Success Stories"
          subtitle="Students who have shown sustained improvement or reached graduation status"
          count={successStories.length}
        />
        {expandedSections.has('success') && (
          <div className="overflow-x-auto">
            <table className="table-premium">
              <thead><tr><th>Student</th><th>Year</th><th>Status</th><th>Signal</th><th>Celebration note</th></tr></thead>
              <tbody>
                {successStories.map((s) => {
                  const a = analysisMap.get(s.id);
                  return (
                    <tr key={s.id} className="cursor-pointer hover:bg-slate-50" onClick={() => goToStudent(s.id)}>
                      <td className="font-semibold text-teal-700 hover:underline">{s.name}</td>
                      <td>{s.year_group}</td>
                      <td>
                        {s.graduation_status === 'success_story' && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold">Success Story</span>}
                        {s.graduation_status === 'stable' && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-semibold">Stable</span>}
                        {!s.graduation_status && <span className="text-xs px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-semibold">Positive signal</span>}
                      </td>
                      <td className="text-slate-600">{a?.signal_category || '—'}</td>
                      <td className="text-slate-600 max-w-[200px] truncate">{a?.suggested_recognition || a?.celebration_type || '—'}</td>
                    </tr>
                  );
                })}
                {successStories.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-8">
                    <Star className="w-7 h-7 text-amber-300 mx-auto mb-2" />
                    <p className="text-sm text-slate-500">No success stories recorded yet. Mark students as graduated or add positive signals.</p>
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>}

      {/* Professional Development Insights */}
      {isSectionVisible('pd') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="pd"
          icon={<UserCheck className="w-5 h-5 text-sky-600" />}
          title="Professional Development Insights"
          subtitle="Staff outcome patterns — for line management and CPD planning only"
          count={staffRows.filter(r => r.pdLabel).length}
        />
        {expandedSections.has('pd') && (
          <>
            {staffRows.some(r => r.openCount >= 6) && (
              <div className="mx-6 mt-4 flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-800">
                  <span className="font-semibold">Workload warning:</span>{' '}
                  {staffRows.filter(r => r.openCount >= 6).map(r => r.name).join(', ')} {staffRows.filter(r => r.openCount >= 6).length === 1 ? 'has' : 'have'} 6+ open actions. Consider redistributing.
                </p>
              </div>
            )}
            <div className="overflow-x-auto">
              <table className="table-premium">
                <thead><tr><th>Staff member</th><th>Open</th><th>Overdue</th><th>Completed</th><th>Outcome rate</th><th>PD label</th><th>Workload</th></tr></thead>
                <tbody>
                  {staffRows.map((row) => {
                    const total = row.openCount + row.completedCount;
                    const pct = total > 0 ? Math.round((row.openCount / total) * 100) : 0;
                    const overloaded = row.openCount >= 6;
                    const pdCfg =
                      row.pdLabel === 'Best Practice' ? 'bg-emerald-100 text-emerald-700' :
                      row.pdLabel === 'Training Opportunity' ? 'bg-amber-100 text-amber-700' :
                      'bg-slate-100 text-slate-600';
                    return (
                      <tr key={row.name} className={overloaded ? 'bg-amber-50/50' : ''}>
                        <td className="font-semibold text-slate-800">
                          {row.name}
                          {overloaded && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 ml-1.5 inline-block" />}
                        </td>
                        <td><span className={`text-sm font-semibold ${overloaded ? 'text-amber-600' : 'text-slate-700'}`}>{row.openCount}</span></td>
                        <td>{row.overdueCount > 0 ? <span className="text-xs font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">{row.overdueCount} overdue</span> : <span className="text-xs text-emerald-600 font-medium">None</span>}</td>
                        <td className="text-slate-600">{row.completedCount}</td>
                        <td>
                          {row.completedCount > 0 ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${row.successRate >= 70 ? 'bg-emerald-100 text-emerald-700' : row.successRate >= 40 ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>{row.successRate}%</span>
                          ) : <span className="text-xs text-slate-400">—</span>}
                        </td>
                        <td>
                          {row.pdLabel ? (
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pdCfg}`}>{row.pdLabel}</span>
                          ) : <span className="text-xs text-slate-400">Insufficient data</span>}
                        </td>
                        <td>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden min-w-[60px]">
                              <div className={`h-full rounded-full ${overloaded ? 'bg-amber-400' : pct > 70 ? 'bg-amber-400' : 'bg-teal-400'}`} style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-slate-500 whitespace-nowrap">{row.openCount}/{total}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {staffRows.length === 0 && (
                    <tr><td colSpan={7} className="text-center py-8"><Users className="w-7 h-7 text-slate-300 mx-auto mb-2" /><p className="text-sm text-slate-500">No assigned interventions found.</p></td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {staffPatterns.length > 0 && (
              <div className="border-t border-slate-100 p-6">
                <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2"><Repeat2 className="w-4 h-4 text-rose-500" /> Staff Pattern Report — repeated student concerns</h3>
                <div className="overflow-x-auto">
                  <table className="table-premium">
                    <thead><tr><th>Staff member</th><th>Students involved</th><th>Urgent actions</th><th>Overdue</th></tr></thead>
                    <tbody>
                      {staffPatterns.map(row => (
                        <tr key={row.staff}>
                          <td className="font-semibold text-slate-800">{row.staff}</td>
                          <td className="text-slate-600">{row.studentCount}</td>
                          <td className={`font-semibold ${row.urgentCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>{row.urgentCount}</td>
                          <td className={`font-semibold ${row.overdueCount > 0 ? 'text-amber-600' : 'text-slate-400'}`}>{row.overdueCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>}

      {/* School-Wide Patterns */}
      {isSectionVisible('patterns') && <div className="card-premium overflow-hidden">
        <SectionHeader
          id="patterns"
          icon={<Zap className="w-5 h-5 text-teal-600" />}
          title="School-Wide Patterns"
          subtitle="Detected trends for SLT review — cross-year, cross-subject"
        />
        {expandedSections.has('patterns') && (
          <div className="p-6 space-y-2.5">
            {recommendations.length === 0 && (
              <p className="text-sm text-slate-400 text-center py-6">No significant patterns detected.</p>
            )}
            {[
              topYearGroup && topYearGroup[1] > 1 ? { text: `${topYearGroup[0]} accounts for ${topYearGroup[1]} of attendance concerns.`, level: 'warn' as const } : null,
              topSubject && topSubject.incidentCount > 2 ? { text: `${topSubject.subject} appears in ${topSubject.incidentCount} behaviour signals across ${topSubject.studentCount} students.`, level: 'warn' as const } : null,
              sendReviewsOverdue > 0 ? { text: `${sendReviewsOverdue} SEND review${sendReviewsOverdue !== 1 ? 's' : ''} overdue this term.`, level: 'alert' as const } : null,
              pupilPremiumRed > 0 ? { text: `${pupilPremiumRed} Pupil Premium student${pupilPremiumRed !== 1 ? 's' : ''} in red priority — check disadvantage gap.`, level: 'alert' as const } : null,
              urgentInterventions.length > 3 ? { text: `${urgentInterventions.length} urgent interventions require immediate attention.`, level: 'alert' as const } : null,
              dueThisWeek.length > 0 ? { text: `${dueThisWeek.length} action${dueThisWeek.length !== 1 ? 's' : ''} due this week — review before Friday.`, level: 'info' as const } : null,
              { text: `Average school attendance: ${avgAttendance}% — ${avgAttendance >= 96 ? 'on target' : avgAttendance >= 90 ? 'below target' : 'significantly below target'}.`, level: (avgAttendance >= 96 ? 'info' : avgAttendance >= 90 ? 'warn' : 'alert') as 'info' | 'warn' | 'alert' },
            ].filter(Boolean).map((insight, i) => {
              if (!insight) return null;
              const cfg =
                insight.level === 'alert' ? { bg: 'bg-red-50 border-red-200', text: 'text-red-800', icon: <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" /> } :
                insight.level === 'warn'  ? { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-800', icon: <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" /> } :
                { bg: 'bg-blue-50 border-blue-100', text: 'text-blue-800', icon: <Info className="w-4 h-4 text-blue-500 shrink-0" /> };
              return (
                <div key={i} className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${cfg.bg}`}>
                  {cfg.icon}
                  <p className={`text-sm ${cfg.text}`}>{insight.text}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>}

      {/* Footer note */}
      <div className="flex items-center gap-3 px-5 py-4 rounded-xl bg-slate-50 border border-slate-200 text-slate-500 text-xs">
        <CalendarClock className="w-4 h-4 shrink-0" />
        <span>Report data as of {new Date().toLocaleDateString('en-GB')}. Student Signal supports staff review — it does not replace professional safeguarding judgement or statutory procedures.</span>
      </div>
    </div>
  );
}

