import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  getLiveNotificationsForUser,
  subscribeToLiveNotifications,
  subscribeToInterventions,
  getDemoInterventions,
  MOCK_STUDENTS,
  MOCK_INTERVENTIONS,
  isInterventionAssignedToUser,
  getHOYYearGroup,
  type LiveNotification,
} from '../lib/data';
import { hasPermission } from '../lib/permissions';
import {
  Bell, X, Check, CheckCheck, AlertTriangle, Shield,
  ClipboardList, Calendar, MessageCircle, TrendingUp, Info,
  RefreshCw, ArrowRight,
} from 'lucide-react';

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  required_action?: string;
  student_id: string | null;
  link_path: string | null;
  is_read: boolean;
  urgent: boolean;
  created_at: string;
}

// Only truly static notifications that don't correspond to a specific intervention
// (e.g. a behaviour-record safeguarding note alert, or a resolved outcome summary)
const STATIC_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'n1',
    type: 'safeguarding_alert',
    title: 'Safeguarding note recorded',
    body: 'Sophie Green (Year 9) — safeguarding concern raised by Dr Patel. Student disclosed worries at home during Science lesson.',
    required_action: 'Review welfare assessment, confirm CPOMS is up to date, and assign a follow-up action.',
    student_id: 's2',
    link_path: '/interventions?highlight=i8',
    is_read: true,
    urgent: true,
    created_at: new Date(Date.now() - 300000).toISOString(),
  },
  {
    id: 'n5',
    type: 'outcome_recorded',
    title: 'Outcome recorded — Isla Roberts',
    body: 'Ms Harris marked the pastoral programme as resolved. Attendance up to 94%, behaviour incidents down significantly.',
    required_action: 'Review the outcome and consider nominating for Success Stories.',
    student_id: 's6',
    link_path: '/students/s6?tab=actions',
    is_read: true,
    urgent: false,
    created_at: new Date(Date.now() - 172800000).toISOString(),
  },
];

// Generate one notification per open/in-progress intervention assigned to this user.
// Completed interventions are excluded — this is the core sync mechanism.
function buildInterventionNotifications(fullName: string): AppNotification[] {
  const demoInts = getDemoInterventions();
  const demoIds = new Set(demoInts.map(i => i.id));
  // Only suppress mock interventions whose exact ID has been replaced in the demo store.
  // Do NOT suppress by student — that wipes out all other open actions for that student.
  const allInts = [
    ...demoInts,
    ...MOCK_INTERVENTIONS.filter(i => !demoIds.has(i.id)),
  ];

  return allInts
    .filter(i =>
      (i.status === 'open' || i.status === 'in_progress' || i.status === 'assigned') &&
      isInterventionAssignedToUser(i.assigned_to, fullName)
    )
    .map(i => {
      const student = MOCK_STUDENTS.find(s => s.id === i.student_id);
      const studentName = student?.name || 'Student';
      const lowerType = i.action_type.toLowerCase();
      const isSafeguarding = lowerType.includes('safeguard') || lowerType.includes('welfare') || lowerType.includes('disclosure');
      const isInProgress = i.status === 'in_progress';
      const statusLabel = i.status === 'assigned' ? 'assigned to you' : isInProgress ? 'in progress' : 'awaiting action';
      return {
        id: `action-${i.id}`,
        type: isSafeguarding ? 'safeguarding_alert' : 'assigned_action',
        title: i.action_type,
        body: `${studentName} — ${statusLabel}. Due ${i.due_date}.`,
        required_action: i.notes || "Go to the student's Actions tab, mark as in progress, and record an outcome to remove from your queue.",
        student_id: i.student_id,
        link_path: `/students/${i.student_id}?tab=actions&highlight=${i.id}`,
        is_read: isInProgress,
        urgent: i.priority === 'urgent',
        created_at: i.created_at || new Date().toISOString(),
      } as AppNotification;
    });
}

// ─── Action-ability predicates ────────────────────────────────────────────────
// These determine whether a notification requires action from this specific user.
// "Can see the student" is NOT enough — the user must be able to DO something.

function canUserActOnIntervention(role: string, userName: string, intervention: any, student: any): boolean {
  // 1. Directly assigned to this user — always show
  if (isInterventionAssignedToUser(intervention.assigned_to, userName)) return true;

  // 2. Admin / SLT have oversight of everything
  if (['admin', 'slt'].includes(role)) return true;

  // 3. DSL: only safeguarding / welfare-type interventions
  if (role === 'dsl') {
    const t = (intervention.action_type || '').toLowerCase();
    return t.includes('safeguard') || t.includes('welfare') || t.includes('disclosure') ||
           t.includes('concern') || t.includes('cpoms') || t.includes('protect');
  }

  // 4. HOY: any intervention for a student in their year group
  if (role === 'head_of_year') {
    const hoyYear = getHOYYearGroup(userName);
    return hoyYear ? student?.year_group === hoyYear : false;
  }

  // 5. SENDCo: SEND students, or SEND/EHCP-type interventions
  if (role === 'sendco') {
    const t = (intervention.action_type || '').toLowerCase();
    return !!student?.send_status || t.includes('send') || t.includes('ehcp') || t.includes('provision');
  }

  // 6. Tutor: their form group only
  if (role === 'tutor') {
    return student?.form === '10B';
  }

  // Pastoral lead — any student
  if (role === 'pastoral_lead') return true;

  return false;
}

function canUserActOnEscalation(role: string, userName: string, intervention: any, student: any): boolean {
  // Person the escalation was directed to
  if (intervention.escalated_to && isInterventionAssignedToUser(intervention.escalated_to, userName)) return true;
  // Fall through to standard action-ability rules
  return canUserActOnIntervention(role, userName, intervention, student);
}

// ─────────────────────────────────────────────────────────────────────────────

// Generate notifications for overdue reviews and escalated items.
// Only surfaces items where the current user can actually take action —
// broad student-scope is NOT sufficient; the user must own or oversee the work.
function buildPriorityAlerts(role: string, userName: string): AppNotification[] {
  const demoInts = getDemoInterventions();
  const demoIds = new Set(demoInts.map(i => i.id));
  const allInts = [
    ...demoInts,
    ...MOCK_INTERVENTIONS.filter(i => !demoIds.has(i.id)),
  ];

  const today = new Date().toISOString().slice(0, 10);
  const alerts: AppNotification[] = [];

  for (const i of allInts) {
    if (['completed', 'closed', 'cancelled'].includes(i.status)) continue;

    const student = MOCK_STUDENTS.find(s => s.id === i.student_id);
    const studentName = student?.name || 'Student';

    // Overdue review — only show if this user can actually act on it
    if (i.review_date && i.review_date < today && canUserActOnIntervention(role, userName, i, student)) {
      alerts.push({
        id: `overdue-${i.id}`,
        type: 'review_overdue',
        title: `Review overdue: ${i.action_type}`,
        body: `${studentName} — review was due ${i.review_date}.${i.assigned_to ? ` Assigned to ${i.assigned_to}.` : ''}`,
        required_action: 'Record the review outcome and complete or extend this action to clear it from the queue.',
        student_id: i.student_id,
        link_path: `/students/${i.student_id}?tab=actions&highlight=${i.id}`,
        is_read: false,
        urgent: true,
        created_at: i.review_date + 'T00:00:00.000Z',
      });
    }

    // Escalated — only show to users who can act on this escalation
    if (i.status === 'escalated' && canUserActOnEscalation(role, userName, i, student)) {
      alerts.push({
        id: `escal-${i.id}`,
        type: 'new_escalation',
        title: `Escalated: ${i.action_type}`,
        body: `${studentName}${i.escalated_by ? ` — escalated by ${i.escalated_by}` : ''}${i.escalation_reason ? `. Reason: ${i.escalation_reason}` : ''}.`,
        required_action: i.escalated_to ? `Assigned to ${i.escalated_to} — confirm they have reviewed and are acting.` : 'Review who owns this escalation and confirm next steps.',
        student_id: i.student_id,
        link_path: `/students/${i.student_id}?tab=actions&highlight=${i.id}`,
        is_read: false,
        urgent: true,
        created_at: i.escalated_at || i.created_at || new Date().toISOString(),
      });
    }
  }

  return alerts;
}

function isStaticNotifRelevant(n: AppNotification, role: string, userName: string): boolean {
  // Safeguarding notifications only for roles with that explicit permission
  if (n.type === 'safeguarding_alert') {
    return hasPermission(role, 'view_safeguarding');
  }
  if (!n.student_id) return true;
  const student = MOCK_STUDENTS.find(s => s.id === n.student_id);
  if (!student) return true;
  if (['admin', 'slt', 'dsl', 'pastoral_lead'].includes(role)) return true;
  if (role === 'head_of_year') {
    const hoyYear = getHOYYearGroup(userName);
    return hoyYear ? student.year_group === hoyYear : true;
  }
  if (role === 'sendco') return !!student.send_status;
  if (role === 'tutor') return student.form === '10B';
  return false;
}

const TYPE_CONFIG: Record<string, { icon: React.FC<{ className?: string }>; color: string; bg: string; actionColor: string }> = {
  safeguarding_alert: { icon: Shield,       color: 'text-red-600',     bg: 'bg-red-50',     actionColor: 'text-red-700 bg-red-50 border-red-200' },
  new_escalation:    { icon: AlertTriangle, color: 'text-amber-600',   bg: 'bg-amber-50',   actionColor: 'text-amber-700 bg-amber-50 border-amber-200' },
  review_due:        { icon: Calendar,      color: 'text-blue-600',    bg: 'bg-blue-50',    actionColor: 'text-blue-700 bg-blue-50 border-blue-200' },
  review_overdue:    { icon: Calendar,      color: 'text-red-600',     bg: 'bg-red-50',     actionColor: 'text-red-700 bg-red-50 border-red-200' },
  assigned_action:   { icon: ClipboardList, color: 'text-teal-600',    bg: 'bg-teal-50',    actionColor: 'text-teal-700 bg-teal-50 border-teal-200' },
  intervention_due:  { icon: ClipboardList, color: 'text-orange-600',  bg: 'bg-orange-50',  actionColor: 'text-orange-700 bg-orange-50 border-orange-200' },
  outcome_recorded:  { icon: TrendingUp,    color: 'text-emerald-600', bg: 'bg-emerald-50', actionColor: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  parent_communication: { icon: MessageCircle, color: 'text-sky-600', bg: 'bg-sky-50',     actionColor: 'text-sky-700 bg-sky-50 border-sky-200' },
  student_risk_change:  { icon: AlertTriangle, color: 'text-amber-600', bg: 'bg-amber-50', actionColor: 'text-amber-700 bg-amber-50 border-amber-200' },
  general:           { icon: Info,          color: 'text-slate-500',   bg: 'bg-slate-50',   actionColor: 'text-slate-600 bg-slate-50 border-slate-200' },
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  onClose: () => void;
  mobile?: boolean;
}

export default function NotificationCenter({ onClose, mobile = false }: Props) {
  const { profile, demoMode } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  // IDs dismissed within this session (mark-done or manual X)
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [actionedIds, setActionedIds] = useState<Set<string>>(new Set());

  const loadNotifications = useCallback(async () => {
    if (demoMode) {
      const userName = (profile as any)?.full_name || '';
      const role = (profile as any)?.role || '';

      const live = getLiveNotificationsForUser(userName) as AppNotification[];
      const liveIds = new Set(live.map(n => n.id));
      // Also deduplicate by stripping the 'live-' prefix — an intervention notification
      // whose ID is 'action-X' should be suppressed when there's already 'live-X'.
      const liveInterventionIds = new Set(live.map(n => n.id.startsWith('live-') ? n.id.slice(5) : ''));

      const interventionNotifs = buildInterventionNotifications(userName)
        .filter(n => {
          const rawId = n.id.startsWith('action-') ? n.id.slice(7) : n.id;
          return !liveIds.has(n.id) && !liveInterventionIds.has(rawId) && !dismissedIds.has(n.id);
        });

      const priorityAlerts = buildPriorityAlerts(role, userName).filter(n => !dismissedIds.has(n.id));
      // Deduplicate priority alerts against live + intervention notifs by intervention ID
      const coveredInterventionIds = new Set([
        ...interventionNotifs.map(n => n.id.startsWith('action-') ? n.id.slice(7) : n.id),
        ...live.map(n => n.id.startsWith('live-') ? n.id.slice(5) : n.id),
      ]);
      const filteredPriorityAlerts = priorityAlerts.filter(n => {
        const rawId = n.id.replace(/^(overdue|escal|urgent)-/, '');
        return !coveredInterventionIds.has(rawId);
      });

      const allNotifIds = new Set([
        ...live.map(n => n.id),
        ...interventionNotifs.map(n => n.id),
        ...filteredPriorityAlerts.map(n => n.id),
      ]);

      const staticFiltered = STATIC_NOTIFICATIONS.filter(n =>
        !liveIds.has(n.id) &&
        !allNotifIds.has(n.id) &&
        !dismissedIds.has(n.id) &&
        isStaticNotifRelevant(n, role, userName)
      );

      const combined = [...live, ...filteredPriorityAlerts, ...interventionNotifs, ...staticFiltered];
      // Urgent always surfaces first, then unread, then by recency
      combined.sort((a, b) => {
        if (a.urgent && !b.urgent) return -1;
        if (!a.urgent && b.urgent) return 1;
        if (!a.is_read && b.is_read) return -1;
        if (a.is_read && !b.is_read) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      setNotifications(combined);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('recipient_id', profile?.id)
      .order('created_at', { ascending: false })
      .limit(50);
    if (!error && data) setNotifications(data as AppNotification[]);
    setLoading(false);
  }, [profile?.id, profile?.full_name, demoMode, dismissedIds]);

  useEffect(() => { loadNotifications(); }, [loadNotifications]);

  // Refresh when live notifications are pushed (e.g. action assigned from dashboard)
  useEffect(() => {
    if (!demoMode) return;
    return subscribeToLiveNotifications(() => loadNotifications());
  }, [demoMode, loadNotifications]);

  // Refresh when any intervention is updated (e.g. marked complete → removes from notifications)
  useEffect(() => {
    if (!demoMode) return;
    return subscribeToInterventions(() => loadNotifications());
  }, [demoMode, loadNotifications]);

  async function markRead(id: string) {
    if (demoMode) {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
      return;
    }
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function markAllRead() {
    if (demoMode) {
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      return;
    }
    await supabase.from('notifications').update({ is_read: true }).eq('recipient_id', profile?.id);
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  function removeNotification(id: string) {
    setDismissedIds(prev => new Set([...prev, id]));
    setNotifications(prev => prev.filter(n => n.id !== id));
    if (!demoMode) {
      supabase.from('notifications').delete().eq('id', id);
    }
  }

  function markDone(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setActionedIds(prev => new Set([...prev, id]));
    markRead(id);
    setTimeout(() => {
      removeNotification(id);
      setActionedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
    }, 700);
  }

  function handleClick(n: AppNotification) {
    markRead(n.id);
    if (n.link_path) {
      onClose();
      navigate(n.link_path);
    }
  }

  const displayed = filter === 'unread' ? notifications.filter(n => !n.is_read) : notifications;
  const unreadCount = notifications.filter(n => !n.is_read).length;

  return (
    <div className={`bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden z-50 w-80 ${mobile ? '' : 'absolute bottom-full left-0 right-0 mb-2'}`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
        <div className="flex items-center gap-2">
          <Bell className="w-4 h-4 text-slate-600" />
          <span className="text-sm font-bold text-slate-800">Notifications</span>
          {unreadCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500 text-white">{unreadCount}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button onClick={markAllRead} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors" title="Mark all read">
              <CheckCheck className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={() => loadNotifications()} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors" title="Refresh">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-400 hover:text-slate-700 transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-slate-100">
        {(['all', 'unread'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={`flex-1 py-2 text-xs font-semibold transition-colors ${filter === tab ? 'text-teal-600 border-b-2 border-teal-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            {tab === 'all' ? `All (${notifications.length})` : `Unread (${unreadCount})`}
          </button>
        ))}
      </div>

      {/* Notifications list */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="px-4 py-8 text-center">
            <Check className="w-8 h-8 text-emerald-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600">All clear</p>
            <p className="text-xs text-slate-400 mt-0.5">{filter === 'unread' ? 'No unread notifications' : 'No notifications'}</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-50">
            {displayed.map(n => {
              const cfg = TYPE_CONFIG[n.type] || TYPE_CONFIG.general;
              const Icon = cfg.icon;
              const isDone = actionedIds.has(n.id);

              if (isDone) {
                return (
                  <div key={n.id} className="flex items-center gap-3 px-4 py-3 bg-emerald-50 transition-all">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    </div>
                    <p className="text-xs font-semibold text-emerald-700 flex-1">Marked as done</p>
                  </div>
                );
              }

              return (
                <div
                  key={n.id}
                  className={`flex flex-col px-4 py-3 transition-colors cursor-pointer group ${!n.is_read ? (n.urgent ? 'bg-red-50/40' : 'bg-blue-50/30') : 'hover:bg-slate-50'}`}
                  onClick={() => handleClick(n)}
                >
                  {/* Row 1: icon + title + time + dismiss */}
                  <div className="flex items-start gap-2.5">
                    <div className={`mt-0.5 w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                      <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-1">
                        <p className={`text-xs font-bold leading-tight ${n.is_read ? 'text-slate-700' : 'text-slate-900'}`}>
                          {n.title}
                          {n.urgent && !n.is_read && (
                            <span className="ml-1.5 text-[9px] font-bold uppercase tracking-wider text-red-600 bg-red-100 px-1 py-0.5 rounded">Urgent</span>
                          )}
                        </p>
                        <span className="text-[10px] text-slate-400 shrink-0 ml-1">{timeAgo(n.created_at)}</span>
                      </div>
                      {n.body && <p className="text-[11px] text-slate-500 mt-0.5 leading-snug">{n.body}</p>}
                    </div>
                  </div>

                  {/* Row 2: required action */}
                  {n.required_action && (
                    <div className="mt-2.5 ml-9">
                      <div className={`text-[11px] font-semibold px-2.5 py-1.5 rounded-lg border leading-snug ${cfg.actionColor}`}>
                        <span className="font-bold">Action: </span>{n.required_action}
                      </div>
                    </div>
                  )}

                  {/* Row 3: CTA buttons */}
                  <div className="flex items-center gap-2 mt-2 ml-9">
                    {n.link_path && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleClick(n); }}
                        className="flex items-center gap-1 text-[11px] font-semibold text-teal-600 hover:text-teal-800 transition-colors"
                      >
                        View <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    <span className="text-slate-200 text-xs">|</span>
                    <button
                      onClick={(e) => markDone(e, n.id)}
                      className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
                    >
                      <Check className="w-3 h-3" /> Mark done
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); removeNotification(n.id); }}
                      className="ml-auto text-[10px] text-slate-300 hover:text-slate-500 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50">
        <p className="text-[10px] text-slate-400 text-center">Notifications update when actions are completed. Click to go directly to the relevant record.</p>
      </div>
    </div>
  );
}

// Hook for unread count used by Layout — stays in sync with intervention completions
export function useNotificationCount() {
  const { profile, demoMode } = useAuth();
  const [count, setCount] = useState(0);

  // Use refs so subscription callbacks always read current values without stale closures
  const fullNameRef = useRef(profile?.full_name ?? '');
  const roleRef = useRef(profile?.role ?? '');
  fullNameRef.current = profile?.full_name ?? '';
  roleRef.current = profile?.role ?? '';

  function computeCount() {
    const userName = fullNameRef.current;
    const role = roleRef.current;
    const live = getLiveNotificationsForUser(userName);
    const liveIds = new Set(live.map(n => n.id));
    const liveInterventionIds = new Set(live.map(n => n.id.startsWith('live-') ? n.id.slice(5) : ''));
    const liveUnread = live.filter(n => !n.is_read).length;

    const interventionNotifs = buildInterventionNotifications(userName)
      .filter(n => {
        const rawId = n.id.startsWith('action-') ? n.id.slice(7) : n.id;
        return !liveIds.has(n.id) && !liveInterventionIds.has(rawId);
      });
    const interventionUnread = interventionNotifs.filter(n => !n.is_read).length;

    const coveredIds = new Set([
      ...interventionNotifs.map(n => n.id.startsWith('action-') ? n.id.slice(7) : n.id),
      ...live.map(n => n.id.startsWith('live-') ? n.id.slice(5) : n.id),
    ]);
    const priorityUnread = buildPriorityAlerts(role, userName).filter(n => {
      const rawId = n.id.replace(/^(overdue|escal|urgent)-/, '');
      return !coveredIds.has(rawId);
    }).length;

    const staticUnread = STATIC_NOTIFICATIONS.filter(n =>
      !liveIds.has(n.id) && !n.is_read && isStaticNotifRelevant(n, role, userName)
    ).length;

    return liveUnread + interventionUnread + priorityUnread + staticUnread;
  }

  // Recompute immediately when persona changes
  useEffect(() => {
    if (!demoMode) return;
    setCount(computeCount());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.full_name, profile?.role, demoMode]);

  // Subscribe to live data changes
  useEffect(() => {
    if (!demoMode) return;
    const unsub1 = subscribeToLiveNotifications(() => setCount(computeCount()));
    const unsub2 = subscribeToInterventions(() => setCount(computeCount()));
    return () => { unsub1(); unsub2(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [demoMode]);

  // Real Supabase count for non-demo
  useEffect(() => {
    if (demoMode || !profile?.id) return;

    async function load() {
      const { count: c } = await supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', profile!.id)
        .eq('is_read', false);
      setCount(c || 0);
    }
    load();

    const channel = supabase
      .channel('notifications-count')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${profile.id}` }, () => load())
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, demoMode]);

  return count;
}

