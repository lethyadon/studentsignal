import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { getStudents, getAnalysisResults, getInterventions, subscribeToInterventions, getAllDemoSignalStatuses, subscribeToSignalStatuses, getHOYYearGroup } from '../lib/data';
import type { Student, AnalysisResult, Intervention } from '../types';
import { isStudentInScope } from '../lib/permissions';

interface PriorityBarData {
  redCount: number;
  amberCount: number;
  greenCount: number;
  openActionsCount: number;
  urgentCount: number;
  reviewsDueCount: number;
  myQueueCount: number;
  notifCount: number;
  notifications: Array<{ id: string; label: string; sub: string; href: string; urgent: boolean; created_at: string }>;
  students: Student[];
  interventions: Intervention[];
  loading: boolean;
  refresh: () => void;
}

const PriorityBarContext = createContext<PriorityBarData>({
  redCount: 0, amberCount: 0, greenCount: 0,
  openActionsCount: 0, urgentCount: 0, reviewsDueCount: 0,
  myQueueCount: 0, notifCount: 0, notifications: [],
  students: [], interventions: [], loading: true,
  refresh: () => {},
});

export function PriorityBarProvider({ children }: { children: ReactNode }) {
  const { profile, demoMode } = useAuth();
  const effectiveSchoolId = demoMode ? null : (profile as any)?.school_id;
  const currentUser = (profile as any)?.full_name || 'Demo User';
  const currentRole = (profile as any)?.role || '';
  const userYearGroup = currentRole === 'head_of_year' ? getHOYYearGroup(currentUser) : null;
  const userForm = currentRole === 'tutor' ? '10B' : null;

  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [analyses, setAnalyses] = useState<AnalysisResult[]>([]);
  const [allInterventions, setAllInterventions] = useState<Intervention[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);
  const [signalStatuses, setSignalStatuses] = useState<Map<string, string>>(new Map());

  const refresh = useCallback(() => setTick(t => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [st, an, int] = await Promise.all([
        getStudents(effectiveSchoolId),
        getAnalysisResults(effectiveSchoolId),
        getInterventions(effectiveSchoolId),
      ]);
      if (!cancelled) {
        setAllStudents(st);
        setAnalyses(an);
        setAllInterventions(int);
        setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [effectiveSchoolId, tick]);

  // Keep intervention counts fresh whenever any component adds/updates a demo intervention
  useEffect(() => {
    if (effectiveSchoolId !== null) return;
    return subscribeToInterventions(() => setTick(t => t + 1));
  }, [effectiveSchoolId]);

  // Keep signal statuses fresh — affects red/amber counts
  useEffect(() => {
    if (effectiveSchoolId !== null) return;
    setSignalStatuses(new Map(getAllDemoSignalStatuses()));
    return subscribeToSignalStatuses(() => setSignalStatuses(new Map(getAllDemoSignalStatuses())));
  }, [effectiveSchoolId]);

  const today = new Date().toISOString().slice(0, 10);

  // Scope students to the user's role
  const students = allStudents.filter(s => isStudentInScope(currentRole, s, userYearGroup, userForm));

  // Scope interventions to the user's scoped student set
  const scopedStudentIds = new Set(students.map(s => s.id));
  const canSeeAllActions = ['admin', 'slt', 'dsl', 'sendco'].includes(currentRole);
  const interventions = canSeeAllActions
    ? allInterventions
    : allInterventions.filter(i => scopedStudentIds.has(i.student_id));

  const analysisMap = new Map(analyses.map(a => [a.student_id, a]));

  const ACTIONED = new Set(['action_in_progress', 'review_due', 'resolved', 'escalated', 'dismissed']);

  const redCount = students.filter(s => {
    const a = analysisMap.get(s.id);
    const isRed = s.signal_category === 'red' || s.risk_level === 'red' || a?.risk_level === 'red';
    return isRed && !ACTIONED.has(signalStatuses.get(s.id) || '');
  }).length;

  const amberCount = students.filter(s => {
    const a = analysisMap.get(s.id);
    const isAmber = s.signal_category === 'amber' || s.signal_category === 'purple' ||
            s.risk_level === 'amber' || a?.risk_level === 'amber' || a?.signal_category === 'purple';
    return isAmber && !ACTIONED.has(signalStatuses.get(s.id) || '');
  }).length;

  const greenCount = students.filter(s => {
    const a = analysisMap.get(s.id);
    return (s.signal_category === 'green' || s.signal_category === 'blue' ||
            s.risk_level === 'green' || a?.risk_level === 'green');
  }).length;

  const openActionsCount = interventions.filter(i =>
    ['suggested', 'open', 'in_progress', 'awaiting_review', 'assigned'].includes(i.status)
  ).length;

  const urgentCount = interventions.filter(i =>
    i.priority === 'urgent' && !['completed', 'closed', 'cancelled'].includes(i.status)
  ).length;

  const reviewsDueCount = interventions.filter(i =>
    i.review_date && i.review_date <= today &&
    !['completed', 'closed', 'cancelled'].includes(i.status)
  ).length;

  const myQueueCount = interventions.filter(i =>
    i.assigned_to === currentUser && !['completed', 'closed', 'cancelled'].includes(i.status)
  ).length;

  // Notifications: only items that require action from THIS user
  // Oversight roles (admin/slt/dsl/sendco) see all; others see only their assigned items
  const isOversight = ['admin', 'slt', 'dsl', 'sendco'].includes(currentRole);
  function isAssignedToMe(assignedTo: string | null | undefined) {
    if (!assignedTo) return false;
    return assignedTo === currentUser || assignedTo.startsWith(currentUser + ' ');
  }

  const overdueReviews = interventions.filter(i =>
    !['completed', 'closed', 'cancelled', 'suggested'].includes(i.status) &&
    i.review_date && i.review_date < today &&
    (isOversight || isAssignedToMe(i.assigned_to))
  );
  const escalated = interventions.filter(i =>
    i.status === 'escalated' &&
    (isOversight || isAssignedToMe(i.assigned_to) || isAssignedToMe(i.escalated_to))
  );
  const urgent = interventions.filter(i =>
    i.priority === 'urgent' &&
    !['completed', 'closed', 'cancelled', 'suggested'].includes(i.status) &&
    i.status !== 'escalated' &&
    (isOversight || isAssignedToMe(i.assigned_to))
  );

  const notifications = [
    ...overdueReviews.map(i => ({
      id: `review-${i.id}`,
      label: `Review overdue: ${i.action_type}`,
      sub: i.assigned_to ? `Assigned to ${i.assigned_to}` : '',
      href: `/students/${i.student_id}?tab=actions&highlight=${i.id}`,
      urgent: true,
      created_at: i.created_at || new Date().toISOString(),
    })),
    ...escalated.map(i => ({
      id: `esc-${i.id}`,
      label: `Escalated: ${i.action_type}`,
      sub: i.assigned_to ? `Owner: ${i.assigned_to}` : '',
      href: `/students/${i.student_id}?tab=actions&highlight=${i.id}`,
      urgent: true,
      created_at: i.created_at || new Date().toISOString(),
    })),
    ...urgent.map(i => ({
      id: `urg-${i.id}`,
      label: `Urgent action: ${i.action_type}`,
      sub: i.assigned_to ? `Assigned to ${i.assigned_to}` : '',
      href: `/students/${i.student_id}?tab=actions&highlight=${i.id}`,
      urgent: false,
      created_at: i.created_at || new Date().toISOString(),
    })),
  ].slice(0, 10);

  const notifCount = notifications.length;

  return (
    <PriorityBarContext.Provider value={{
      redCount, amberCount, greenCount,
      openActionsCount, urgentCount, reviewsDueCount,
      myQueueCount, notifCount, notifications,
      students, interventions, loading, refresh,
    }}>
      {children}
    </PriorityBarContext.Provider>
  );
}

export function usePriorityBar() {
  return useContext(PriorityBarContext);
}

