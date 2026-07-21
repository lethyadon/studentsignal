/**
 * ExplainPanel — Universal "Why?" expandable explanation component.
 *
 * Used everywhere an AI recommendation, automatic assignment, escalation,
 * confidence score or priority needs to explain itself.
 *
 * All explanation content comes from explainEngine.ts — never from this component.
 * This component is purely presentational.
 *
 * Usage:
 *   <ExplainPanel explanation={explainAssignment({ ... })} />
 *   <ExplainPanel explanation={explainPriority({ ... })} label="Why urgent?" />
 *   <ExplainPanel explanation={explainSignal({ ... })} variant="inline" />
 */
import { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, Info, AlertCircle } from 'lucide-react';
import type { Explanation } from '../lib/explainEngine';

interface ExplainPanelProps {
  explanation: Explanation;
  /** Button label override. Default: "Why?" */
  label?: string;
  /** 'button' = expandable via a small button (default, for modals/cards)
   *  'inline' = always-visible compact form
   *  'badge' = tiny pill that expands on click */
  variant?: 'button' | 'inline' | 'badge';
  /** Additional class on the outer wrapper */
  className?: string;
}

export function ExplainPanel({
  explanation,
  label = 'Why?',
  variant = 'button',
  className = '',
}: ExplainPanelProps) {
  const [open, setOpen] = useState(false);

  if (variant === 'inline') {
    return (
      <div className={`space-y-1.5 ${className}`}>
        <p className="text-xs text-slate-600 leading-relaxed">{explanation.summary}</p>
        {explanation.bullets.length > 0 && (
          <ul className="space-y-1">
            {explanation.bullets.map((b, i) => (
              <li key={i} className="flex items-start gap-1.5 text-xs text-slate-500">
                <span className="text-slate-300 mt-0.5 shrink-0">·</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
        {explanation.caveat && (
          <div className="flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-50 border border-amber-100">
            <Info className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
            <p className="text-xs text-amber-700">{explanation.caveat}</p>
          </div>
        )}
      </div>
    );
  }

  if (variant === 'badge') {
    return (
      <div className={`relative inline-block ${className}`}>
        <button
          onClick={() => setOpen(v => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded-full transition-colors"
        >
          <HelpCircle className="w-3 h-3" />
          {label}
        </button>
        {open && (
          <div className="absolute z-50 top-6 left-0 w-72 bg-white rounded-xl border border-slate-200 shadow-lg p-3.5 space-y-2">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-semibold text-slate-800">{explanation.summary}</p>
              <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600 shrink-0">
                <ChevronUp className="w-3.5 h-3.5" />
              </button>
            </div>
            {explanation.bullets.length > 0 && (
              <ul className="space-y-1 border-t border-slate-100 pt-2">
                {explanation.bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                    <span className="text-slate-300 mt-0.5 shrink-0">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
            {explanation.caveat && (
              <div className="flex items-start gap-1.5 p-2 rounded-lg bg-amber-50 border border-amber-100">
                <AlertCircle className="w-3 h-3 text-amber-500 mt-0.5 shrink-0" />
                <p className="text-[11px] text-amber-700">{explanation.caveat}</p>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // Default: 'button' variant — toggle
  return (
    <div className={`space-y-2 ${className}`}>
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium transition-colors group"
      >
        {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
        <span>{open ? 'Hide explanation' : label}</span>
      </button>

      {open && (
        <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-3.5 space-y-2">
          <p className="text-xs font-semibold text-indigo-900">{explanation.summary}</p>
          {explanation.bullets.length > 0 && (
            <ul className="space-y-1.5">
              {explanation.bullets.map((b, i) => (
                <li key={i} className="flex items-start gap-1.5 text-xs text-indigo-800">
                  <span className="text-indigo-300 mt-0.5 shrink-0">·</span>
                  <span className="leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          )}
          {explanation.caveat && (
            <div className="flex items-start gap-1.5 p-2.5 rounded-lg bg-amber-50 border border-amber-100 mt-1">
              <Info className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">{explanation.caveat}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Convenience wrapper — renders as a small badge-style "Why?" button.
 * Use this in tight spaces: table rows, notification items, briefing cards.
 */
export function WhyBadge({ explanation, label = 'Why?' }: { explanation: Explanation; label?: string }) {
  return <ExplainPanel explanation={explanation} variant="badge" label={label} />;
}

/**
 * Routing rationale badge — used specifically in assignment modals.
 * Shows "Auto-assigned by StudentSignal" with expandable explanation.
 */
export function AssignmentRationale({
  summary,
  bullets,
}: {
  summary: string;
  bullets: string[];
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-indigo-100 bg-indigo-50/60 px-3 py-2.5">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-between w-full text-left gap-2"
      >
        <span className="text-xs text-indigo-700 font-medium">{summary}</span>
        {open
          ? <ChevronUp className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
          : <HelpCircle className="w-3.5 h-3.5 text-indigo-400 shrink-0" />}
      </button>
      {open && (
        <ul className="mt-2 space-y-1 border-t border-indigo-100 pt-2">
          {bullets.map((b, i) => (
            <li key={i} className="flex items-start gap-1.5 text-xs text-indigo-700">
              <span className="text-indigo-300 mt-0.5 shrink-0">·</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
