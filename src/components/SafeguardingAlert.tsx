import { Shield, AlertTriangle, X, ChevronRight, CheckCircle } from 'lucide-react';
import { type SafeguardingDetection, CATEGORY_LABELS } from '../lib/safeguarding';

interface Props {
  detection: SafeguardingDetection;
  onAccept: (dslName: string, actionType: string, priority: 'urgent' | 'high' | 'medium') => void;
  onDismiss?: () => void;
  accepted?: boolean;
  compact?: boolean;
}

export default function SafeguardingAlert({ detection, onAccept, onDismiss, accepted = false, compact = false }: Props) {
  const isUrgent = detection.level === 'urgent';
  const isHigh = detection.level === 'high';

  const colors = isUrgent
    ? { bg: 'bg-red-50', border: 'border-red-300', title: 'text-red-900', body: 'text-red-700', badge: 'bg-red-100 text-red-700 border-red-200', btn: 'bg-red-600 hover:bg-red-700 text-white', icon: 'text-red-600' }
    : isHigh
    ? { bg: 'bg-amber-50', border: 'border-amber-300', title: 'text-amber-900', body: 'text-amber-700', badge: 'bg-amber-100 text-amber-700 border-amber-200', btn: 'bg-amber-600 hover:bg-amber-700 text-white', icon: 'text-amber-600' }
    : { bg: 'bg-blue-50', border: 'border-blue-200', title: 'text-blue-900', body: 'text-blue-700', badge: 'bg-blue-100 text-blue-700 border-blue-200', btn: 'bg-blue-600 hover:bg-blue-700 text-white', icon: 'text-blue-600' };

  if (accepted) {
    return (
      <div className={`rounded-xl border p-3 flex items-center gap-2.5 ${isUrgent ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
        <CheckCircle className={`w-4 h-4 shrink-0 ${isUrgent ? 'text-red-600' : 'text-amber-600'}`} />
        <p className={`text-xs font-semibold ${isUrgent ? 'text-red-800' : 'text-amber-800'}`}>
          Escalated to {detection.dslName} — {detection.suggestedAction}
        </p>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border-2 ${colors.bg} ${colors.border} overflow-hidden animate-in fade-in slide-in-from-top-1 duration-200`}>
      {/* Title row */}
      <div className={`px-3 py-2.5 flex items-center justify-between gap-2 border-b ${colors.border}`}>
        <div className="flex items-center gap-2 min-w-0">
          <Shield className={`w-4 h-4 shrink-0 ${colors.icon}`} />
          <span className={`text-xs font-black uppercase tracking-wide ${colors.title}`}>
            {isUrgent ? 'Urgent safeguarding concern' : 'Safeguarding concern detected'}
          </span>
          <span className={`ml-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full border ${colors.badge}`}>
            {detection.level}
          </span>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className={`p-0.5 rounded hover:opacity-70 transition-opacity shrink-0 ${colors.icon}`}>
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <div className={`px-3 py-2.5 space-y-2.5`}>
        {/* Category + message */}
        <div>
          <p className={`text-[11px] font-bold ${colors.title} mb-0.5`}>{CATEGORY_LABELS[detection.category]}</p>
          <p className={`text-[11px] leading-snug ${colors.body}`}>{detection.message}</p>
        </div>

        {/* Trigger words */}
        {detection.triggers.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {detection.triggers.map(t => (
              <span key={t} className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${colors.badge}`}>
                "{t}"
              </span>
            ))}
          </div>
        )}

        {/* Action row */}
        <div className={`flex items-center gap-2 ${compact ? '' : 'pt-0.5'}`}>
          <button
            onClick={() => onAccept(detection.dslName, detection.suggestedAction, detection.suggestedPriority)}
            className={`flex items-center gap-1.5 text-[11px] font-bold px-3 py-1.5 rounded-lg transition-colors ${colors.btn}`}
          >
            <Shield className="w-3 h-3" />
            Auto-assign to {detection.dslName}
            <ChevronRight className="w-3 h-3" />
          </button>
          <p className={`text-[10px] ${colors.body} opacity-70`}>
            Creates {detection.suggestedAction} · {detection.suggestedPriority} priority
          </p>
        </div>
      </div>
    </div>
  );
}

