import { Link } from 'react-router-dom';
import type { Intervention, Student, AnalysisResult } from '../types';
import { DEMO_STAFF } from '../lib/data';
import {
  X, User, Calendar, Clock, AlertTriangle, CheckCircle, RefreshCw,
  Eye, ArrowRight, Flag, ChevronRight, ExternalLink, RotateCcw,
  Brain, Shield, Phone, UserCheck, Briefcase,
} from 'lucide-react';

type AuditEntry = { action: string; by: string; at: string };

interface ActionDrawerProps {
  intervention: Intervention;
  student: Student | undefined;
  analysis?: AnalysisResult | null;
  auditLog: AuditEntry[];
  onClose: () => void;
  onMarkInProgress: () => void;
  onComplete: (outcomeText?: string) => void;
  onEscalate?: () => void;
  onReassign: (name: string, role: string) => void;
  onChangeDueDate: (date: string) => void;
  onChangeReviewDate: (date: string) => void;
  onDismiss: () => void;
  onUndoCompletion?: () => void;
  onUndoEscalation?: () => void;
  notificationBanner?: string | null;
}

function getCreatorTitle(createdBy: string | null | undefined): string {
  if (!createdBy) return '';
  const m = createdBy.match(/\(([^)]+)\)/);
  if (m) return m[1];
  if (/system/i.test(createdBy)) return 'System';
  return '';
}

const PRIORITY_CFG: Record<string, { bg: string; text: string; border: string }> = {
  urgent: { bg: 'bg-red-50',    text: 'text-red-700',    border: 'border-red-200'    },
  high:   { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  medium: { bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'   },
  low:    { bg: 'bg-slate-50',  text: 'text-slate-600',  border: 'border-slate-200'  },
};

const STATUS_CFG: Record<string, { bg: string; text: string }> = {
  open:            { bg: 'bg-blue-50',    text: 'text-blue-700'    },
  in_progress:     { bg: 'bg-amber-50',   text: 'text-amber-700'   },
  awaiting_review: { bg: 'bg-orange-50',  text: 'text-orange-700'  },
  escalated:       { bg: 'bg-red-50',     text: 'text-red-700'     },
  completed:       { bg: 'bg-emerald-50', text: 'text-emerald-700' },
  cancelled:       { bg: 'bg-slate-50',   text: 'text-slate-500'   },
};

const OUTCOME_CFG = {
  achieved:     { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  partially:    { bg: 'bg-amber-100',   text: 'text-amber-700'   },
  not_achieved: { bg: 'bg-red-100',     text: 'text-red-700'     },
};

function SuggestedActionItem({
  text, icon, colorClass, doneColorClass, disabled, onDone,
}: {
  text: string;
  icon: React.ReactNode;
  colorClass: string;
  doneColorClass: string;
  disabled: boolean;
  onDone: () => void;
}) {
  return (
    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs ${disabled ? doneColorClass : colorClass}`}>
      {icon}
      <span className="flex-1 leading-snug">{text}</span>
      {!disabled && (
        <button
          onClick={onDone}
          className="shrink-0 flex items-center gap-1 ml-2 px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 transition-colors whitespace-nowrap"
        >
          <CheckCircle className="w-3 h-3" />
          Mark done
        </button>
      )}
    </div>
  );
}

export default function ActionDrawer({
  intervention: i,
  student,
  analysis,
  auditLog,
  onClose,
  onMarkInProgress,
  onComplete,
  onEscalate,
  onReassign,
  onChangeDueDate,
  onChangeReviewDate,
  onDismiss,
  onUndoCompletion,
  onUndoEscalation,
  notificationBanner,
}: ActionDrawerProps) {
  const pc = PRIORITY_CFG[i.priority] || PRIORITY_CFG.medium;
  const sc = STATUS_CFG[i.status] || STATUS_CFG.open;
  const oc = (i as any).outcome_achieved ? OUTCOME_CFG[(i as any).outcome_achieved as keyof typeof OUTCOME_CFG] : null;
  const isComplete = i.status === 'completed';
  const today = new Date().toISOString().slice(0, 10);
  const isOverdue = i.due_date && i.due_date < today && !isComplete;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Drawer panel */}
      <div className="relative bg-white w-full max-w-lg h-full overflow-y-auto shadow-2xl flex flex-col">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider border ${pc.bg} ${pc.text} ${pc.border}`}>{i.priority}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase tracking-wider ${sc.bg} ${sc.text}`}>{i.status.replace(/_/g, ' ')}</span>
              {isOverdue && <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-red-100 text-red-700">OVERDUE</span>}
            </div>
            <h2 className="text-lg font-bold text-slate-900 mt-1.5 leading-tight">{i.action_type}</h2>
            {student && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <User className="w-3.5 h-3.5 text-slate-400" />
                <Link to={`/students/${i.student_id}`} onClick={onClose} className="text-sm text-teal-700 font-medium hover:underline">
                  {student.name}
                </Link>
                <span className="text-xs text-slate-400">{student.year_group}</span>
              </div>
            )}
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 shrink-0 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Notification banner */}
        {notificationBanner && (
          <div className="mx-6 mt-4 bg-teal-50 border border-teal-200 rounded-xl px-4 py-2.5 flex items-center gap-2">
            <ChevronRight className="w-3.5 h-3.5 text-teal-600 shrink-0" />
            <p className="text-xs text-teal-700 font-medium">{notificationBanner}</p>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 px-6 py-5 space-y-6">

          {/* Detail grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Assigned to</p>
              <p className="text-sm font-semibold text-slate-800">{i.assigned_to || '—'}</p>
              {(i as any).assigned_role && <p className="text-xs text-slate-500">{(i as any).assigned_role}</p>}
            </div>
            {i.created_by && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Assigned by</p>
                <p className="text-sm font-semibold text-slate-800">{i.created_by.replace(/\s*\([^)]*\)/, '')}</p>
                {getCreatorTitle(i.created_by) && <p className="text-xs text-slate-500">{getCreatorTitle(i.created_by)}</p>}
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Due date</p>
              <p className={`text-sm font-semibold ${isOverdue ? 'text-red-600' : 'text-slate-800'}`}>
                {i.due_date || '—'}
              </p>
            </div>
            {i.review_date && (
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Review date</p>
                <p className="text-sm font-semibold text-slate-800">{i.review_date}</p>
              </div>
            )}
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Created</p>
              <p className="text-sm text-slate-600">{i.created_at ? new Date(i.created_at).toLocaleDateString('en-GB') : '—'}</p>
            </div>
          </div>

          {/* Student context */}
          {student && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-3 border border-slate-200">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Student context</p>
                <Link
                  to={`/students/${i.student_id}`}
                  onClick={onClose}
                  className="inline-flex items-center gap-1 text-[10px] text-teal-600 font-semibold hover:underline"
                >
                  <ExternalLink className="w-3 h-3" /> Full profile
                </Link>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm text-slate-700">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Attendance</span>
                  <span className={`font-semibold ${student.attendance_pct && student.attendance_pct < 85 ? 'text-red-600' : student.attendance_pct && student.attendance_pct < 92 ? 'text-amber-600' : 'text-slate-800'}`}>
                    {student.attendance_pct ?? '—'}%
                  </span>
                </div>
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Behaviour pts</span>
                  <span className={`font-semibold ${student.behaviour_score && student.behaviour_score > 30 ? 'text-red-600' : student.behaviour_score && student.behaviour_score > 10 ? 'text-amber-600' : 'text-slate-800'}`}>
                    {student.behaviour_score ?? '—'}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {student.risk_level && (
                  <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${student.risk_level === 'red' ? 'bg-red-50 text-red-700 border-red-200' : student.risk_level === 'amber' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                    {student.risk_level} risk
                  </span>
                )}
                {student.send_status && <span className="text-[10px] bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded-full font-medium">{student.send_status}</span>}
                {student.pupil_premium && <span className="text-[10px] bg-blue-50 text-blue-700 border border-blue-200 px-2 py-0.5 rounded-full font-medium">PP</span>}
                <span className="text-[10px] text-slate-400">{student.form}</span>
              </div>

              {/* Evidence from analysis */}
              {analysis?.key_reasons && analysis.key_reasons.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Why this student was flagged</p>
                  <div className="space-y-1">
                    {analysis.key_reasons.slice(0, 4).map((r, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-slate-700 bg-white border border-slate-200 rounded-lg px-2.5 py-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-slate-400 shrink-0 mt-1" />
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Suggested actions from analysis */}
          {analysis && (analysis.suggested_pastoral_action || analysis.suggested_parent_contact || analysis.suggested_staff_action) && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-slate-500" />
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Suggested next steps</p>
              </div>
              <div className="space-y-2">
                {analysis.suggested_pastoral_action && (
                  <SuggestedActionItem
                    text={analysis.suggested_pastoral_action}
                    icon={<UserCheck className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />}
                    colorClass="bg-red-50 border-red-200 text-red-800"
                    doneColorClass="bg-emerald-50 border-emerald-200 text-emerald-800"
                    disabled={isComplete}
                    onDone={() => onComplete(analysis.suggested_pastoral_action!)}
                  />
                )}
                {analysis.suggested_parent_contact && (
                  <SuggestedActionItem
                    text={analysis.suggested_parent_contact}
                    icon={<Phone className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />}
                    colorClass="bg-amber-50 border-amber-200 text-amber-800"
                    doneColorClass="bg-emerald-50 border-emerald-200 text-emerald-800"
                    disabled={isComplete}
                    onDone={() => onComplete(analysis.suggested_parent_contact!)}
                  />
                )}
                {analysis.suggested_staff_action && (
                  <SuggestedActionItem
                    text={analysis.suggested_staff_action}
                    icon={<Briefcase className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />}
                    colorClass="bg-blue-50 border-blue-200 text-blue-800"
                    doneColorClass="bg-emerald-50 border-emerald-200 text-emerald-800"
                    disabled={isComplete}
                    onDone={() => onComplete(analysis.suggested_staff_action!)}
                  />
                )}
              </div>
              {!isComplete && (
                <p className="text-[10px] text-slate-400 mt-2">Clicking "Mark done" completes this action and removes the student from your queue.</p>
              )}
            </div>
          )}

          {/* Notes */}
          {i.notes && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Notes</p>
              <p className="text-sm text-slate-700 leading-relaxed bg-slate-50 rounded-xl p-4">{i.notes}</p>
            </div>
          )}

          {/* Outcome */}
          {isComplete && i.outcome && (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-2">Outcome</p>
              {oc && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${oc.bg} ${oc.text} mb-2 inline-block`}>
                  {(i as any).outcome_achieved?.replace('_', ' ') || ''}
                </span>
              )}
              <p className="text-sm text-emerald-800 mt-1 leading-relaxed">{i.outcome}</p>
              {i.completed_by && (
                <p className="text-[10px] text-emerald-600 mt-2">
                  Completed by {i.completed_by}{i.completed_at ? ` · ${i.completed_at}` : ''}
                </p>
              )}
            </div>
          )}

          {/* Escalation details */}
          {i.status === 'escalated' && i.escalated_to && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
              <p className="text-[10px] font-bold text-red-600 uppercase tracking-wider">Escalation</p>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <p className="text-slate-400 font-medium">Escalated to</p>
                  <p className="font-semibold text-slate-800">{i.escalated_to}</p>
                </div>
                {i.escalation_reason && (
                  <div>
                    <p className="text-slate-400 font-medium">Reason</p>
                    <p className="font-semibold text-slate-800">{i.escalation_reason}</p>
                  </div>
                )}
                {i.escalated_by && (
                  <div>
                    <p className="text-slate-400 font-medium">Escalated by</p>
                    <p className="font-semibold text-slate-800">{i.escalated_by}</p>
                  </div>
                )}
                {i.escalated_at && (
                  <div>
                    <p className="text-slate-400 font-medium">Date</p>
                    <p className="font-semibold text-slate-800">{i.escalated_at}</p>
                  </div>
                )}
                {i.review_date && (
                  <div>
                    <p className="text-slate-400 font-medium">Review date</p>
                    <p className="font-semibold text-slate-800">{i.review_date}</p>
                  </div>
                )}
              </div>
              {i.escalation_notes && (
                <div className="mt-2">
                  <p className="text-slate-400 font-medium text-xs mb-1">Notes</p>
                  <p className="text-sm text-slate-700 bg-white rounded-lg p-2.5 border border-red-100">{i.escalation_notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Reassign */}
          {!isComplete && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Reassign to</p>
              <select
                className="input-premium"
                value={i.assigned_to || ''}
                onChange={(e) => {
                  const staff = DEMO_STAFF.find(s => s.name === e.target.value);
                  onReassign(e.target.value, staff?.role || '');
                }}
              >
                <option value="">Select staff member...</option>
                {DEMO_STAFF.map(s => (
                  <option key={s.name} value={s.name}>{s.name} — {s.role}</option>
                ))}
              </select>
            </div>
          )}

          {/* Change dates */}
          {!isComplete && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Change due date</p>
                <input
                  type="date"
                  className="input-premium"
                  value={i.due_date || ''}
                  onChange={(e) => onChangeDueDate(e.target.value)}
                />
              </div>
              <div>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Change review date</p>
                <input
                  type="date"
                  className="input-premium"
                  value={i.review_date || ''}
                  onChange={(e) => onChangeReviewDate(e.target.value)}
                />
              </div>
            </div>
          )}

          {/* Audit trail */}
          {auditLog.length > 0 && (
            <div>
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">Activity log</p>
              <div className="space-y-2">
                {auditLog.map((entry, idx) => (
                  <div key={idx} className="flex items-start gap-3 text-xs">
                    <div className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0 mt-1.5" />
                    <div className="flex-1">
                      <span className="font-semibold text-slate-800">{entry.action}</span>
                      <span className="text-slate-400 ml-1">by {entry.by}</span>
                    </div>
                    <span className="text-slate-400 whitespace-nowrap">{entry.at}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action buttons footer */}
        {!isComplete && i.status !== 'escalated' && (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 space-y-2">
            <div className="flex gap-2">
              {i.status === 'open' && (
                <button onClick={onMarkInProgress} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors">
                  <RefreshCw className="w-4 h-4" />
                  Mark In Progress
                </button>
              )}
              <button onClick={() => onComplete()} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                <CheckCircle className="w-4 h-4" />
                Complete
              </button>
            </div>
            <div className="flex gap-2">
              {onEscalate && (
                <button onClick={onEscalate} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium bg-slate-50 border border-slate-200 text-red-600 hover:bg-red-50 hover:border-red-200 transition-colors">
                  <AlertTriangle className="w-4 h-4" />
                  Escalate
                </button>
              )}
              <button onClick={onDismiss} className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4" />
                Dismiss
              </button>
            </div>
          </div>
        )}
        {isComplete && (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 space-y-2">
            <Link to={`/students/${i.student_id}`} onClick={onClose} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-teal-50 border border-teal-200 text-teal-700 hover:bg-teal-100 transition-colors">
              <ArrowRight className="w-4 h-4" />
              View in student timeline
            </Link>
            {onUndoCompletion && (
              <button
                onClick={() => { onUndoCompletion(); onClose(); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Undo completion
              </button>
            )}
          </div>
        )}
        {i.status === 'escalated' && (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 space-y-2">
            <button onClick={() => onComplete()} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
              <CheckCircle className="w-4 h-4" />
              Resolve escalation
            </button>
            {onUndoEscalation && (
              <button
                onClick={() => { onUndoEscalation(); onClose(); }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-amber-50 border border-amber-200 text-amber-700 hover:bg-amber-100 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Undo escalation
              </button>
            )}
            <Link to={`/students/${i.student_id}`} onClick={onClose} className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium bg-slate-50 border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors">
              <ArrowRight className="w-4 h-4" />
              View student profile
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

