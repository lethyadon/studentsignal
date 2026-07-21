/**
 * usePersonalQueue — personal actionable workload hook.
 *
 * Returns ONLY the pupils where the current logged-in user has an open,
 * authorised, actionable responsibility. "Can view" and "must act" are
 * separate concepts — this hook implements the latter.
 *
 * In demo mode (no schoolId) it falls back to a client-side derivation
 * from the existing demo interventions so the demo experience is preserved.
 */
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getDemoInterventions } from '../lib/data';
import type { Intervention } from '../types';

export interface PersonalQueueItem {
  student_id: string;
  student_name: string;
  year_group: string;
  form: string | null;
  risk_level: string;
  signal_category: string | null;
  risk_score: number | null;
  signal_types: string[] | null;
  signal_explanation: string | null;
  // The specific action creating this responsibility
  action_id: string;
  action_type: string;
  action_status: string;
  action_priority: 'low' | 'medium' | 'high' | 'urgent';
  action_due_date: string | null;
  action_review_date: string | null;
  action_source: string | null;
  // Why this pupil is in the queue
  responsibility_reason: 'action_owner' | 'review_owner' | 'escalation_owner';
  global_open_action_count: number;
  is_review_only: boolean;
}

export interface WorkloadCounts {
  total_actionable: number;
  urgent_count: number;
  overdue_count: number;
  new_today_count: number;
  review_due_count: number;
}

export type BriefingSection =
  | 'urgent_overdue'
  | 'new_today'
  | 'awaiting_action'
  | 'awaiting_review'
  | 'recently_completed';

export interface BriefingItem {
  section: BriefingSection;
  student_id: string;
  student_name: string;
  year_group: string;
  risk_level: string;
  action_id: string;
  action_type: string;
  action_priority: string;
  action_due_date: string | null;
  responsibility_reason: string;
  signal_changed: boolean;
  completed_at: string | null;
}

// ── Demo-mode fallback ────────────────────────────────────────────────────────

function buildDemoPersonalQueue(
  userId: string | null,
  userName: string | null,
  interventions: Intervention[],
): PersonalQueueItem[] {
  // In demo mode we match by name string (legacy) or by user ID
  const open = interventions.filter(i => !['completed', 'cancelled', 'closed'].includes(i.status));
  const mine = open.filter(i =>
    i.assigned_to_user_id === userId ||
    (userName && (i.assigned_to === userName || i.assigned_to?.startsWith(userName + ' '))),
  );
  // Deduplicate by student, taking the most urgent action per pupil
  const byStudent = new Map<string, Intervention>();
  for (const i of mine) {
    const existing = byStudent.get(i.student_id);
    if (!existing || comparePriority(i.priority, existing.priority) < 0) {
      byStudent.set(i.student_id, i);
    }
  }
  return [...byStudent.values()].map(i => ({
    student_id: i.student_id,
    student_name: i.assigned_to ?? '', // will be enriched by the caller
    year_group: '',
    form: null,
    risk_level: 'amber',
    signal_category: null,
    risk_score: null,
    signal_types: null,
    signal_explanation: null,
    action_id: i.id,
    action_type: i.action_type,
    action_status: i.status,
    action_priority: i.priority,
    action_due_date: i.due_date,
    action_review_date: i.review_date ?? null,
    action_source: i.source ?? null,
    responsibility_reason: 'action_owner' as const,
    global_open_action_count: 1,
    is_review_only: false,
  }));
}

function comparePriority(a: string, b: string): number {
  const order: Record<string, number> = { urgent: 0, high: 1, medium: 2, low: 3 };
  return (order[a] ?? 4) - (order[b] ?? 4);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function usePersonalQueue(
  schoolId: string | null | undefined,
  userId: string | null | undefined,
  userName: string | null | undefined,
  isDemoMode: boolean,
) {
  const [items, setItems] = useState<PersonalQueueItem[]>([]);
  const [counts, setCounts] = useState<WorkloadCounts>({
    total_actionable: 0, urgent_count: 0, overdue_count: 0,
    new_today_count: 0, review_due_count: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (!schoolId || isDemoMode) {
        // Demo fallback: derive from in-memory demo interventions
        const demoInts = getDemoInterventions();
        const queue = buildDemoPersonalQueue(userId ?? null, userName ?? null, demoInts);
        setItems(queue);
        setCounts({
          total_actionable: queue.length,
          urgent_count: queue.filter(q => q.action_priority === 'urgent').length,
          overdue_count: 0,
          new_today_count: 0,
          review_due_count: 0,
        });
        return;
      }

      // Live mode: call the RPC
      const [queueResult, countResult] = await Promise.all([
        supabase.rpc('get_personal_queue', { p_school_id: schoolId }),
        supabase.rpc('get_my_workload_counts', { p_school_id: schoolId }),
      ]);

      if (queueResult.error) {
        console.error('get_personal_queue error:', queueResult.error.message);
        setError(queueResult.error.message);
        return;
      }
      if (countResult.error) {
        console.error('get_my_workload_counts error:', countResult.error.message);
      }

      setItems((queueResult.data ?? []) as PersonalQueueItem[]);
      if (countResult.data?.[0]) {
        setCounts(countResult.data[0] as WorkloadCounts);
      }
    } finally {
      setLoading(false);
    }
  }, [schoolId, userId, userName, isDemoMode]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { items, counts, loading, error, refresh };
}

// ── Briefing hook ─────────────────────────────────────────────────────────────

export function useMyBriefing(
  schoolId: string | null | undefined,
  isDemoMode: boolean,
) {
  const [sections, setSections] = useState<Map<BriefingSection, BriefingItem[]>>(new Map());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        if (!schoolId || isDemoMode) {
          setSections(new Map());
          return;
        }
        const { data, error } = await supabase.rpc('get_my_briefing', { p_school_id: schoolId });
        if (error) { console.error('get_my_briefing error:', error.message); return; }
        const result = new Map<BriefingSection, BriefingItem[]>();
        for (const item of (data ?? []) as BriefingItem[]) {
          if (!result.has(item.section)) result.set(item.section, []);
          result.get(item.section)!.push(item);
        }
        setSections(result);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [schoolId, isDemoMode]);

  return { sections, loading };
}

// ── Complete action ───────────────────────────────────────────────────────────

export async function completeMyAction(
  actionId: string,
  outcome?: string,
  outcomeNotes?: string,
): Promise<{ data: Record<string,unknown> | null; error: string | null }> {
  const { data, error } = await supabase.rpc('complete_my_action', {
    p_action_id:     actionId,
    p_outcome:       outcome ?? null,
    p_outcome_notes: outcomeNotes ?? null,
  });
  return { data: data as Record<string,unknown> | null, error: error?.message ?? null };
}
