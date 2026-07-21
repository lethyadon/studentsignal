/**
 * ExplainButton — canonical UI component for all AI explanations.
 *
 * Usage:
 *   <ExplainButton explanation={explainFlag(analysis)} label="Why flagged?" />
 *
 * The explanation is always derived from engine output via src/lib/explain.ts.
 * Never hard-code explanation text in this component.
 */
import { useState } from 'react';
import { HelpCircle, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import type { Explanation } from '../lib/explain';

interface ExplainButtonProps {
  explanation: Explanation;
  /** Button label — defaults to "Why?" */
  label?: string;
  /** Visual variant */
  variant?: 'inline' | 'badge' | 'icon';
  /** Colour tone — defaults to indigo */
  tone?: 'indigo' | 'amber' | 'red' | 'emerald' | 'slate';
}

const TONE_CLASSES = {
  indigo:  { btn: 'text-indigo-600 hover:text-indigo-800', panel: 'bg-indigo-50 border-indigo-100 text-indigo-900', bullet: 'text-indigo-400' },
  amber:   { btn: 'text-amber-600 hover:text-amber-800',   panel: 'bg-amber-50 border-amber-100 text-amber-900',   bullet: 'text-amber-400' },
  red:     { btn: 'text-red-600 hover:text-red-800',       panel: 'bg-red-50 border-red-100 text-red-900',         bullet: 'text-red-400' },
  emerald: { btn: 'text-emerald-600 hover:text-emerald-800', panel: 'bg-emerald-50 border-emerald-100 text-emerald-900', bullet: 'text-emerald-400' },
  slate:   { btn: 'text-slate-500 hover:text-slate-700',   panel: 'bg-slate-50 border-slate-200 text-slate-700',  bullet: 'text-slate-400' },
};

export default function ExplainButton({
  explanation,
  label = 'Why?',
  variant = 'inline',
  tone = 'indigo',
}: ExplainButtonProps) {
  const [open, setOpen] = useState(false);
  const t = TONE_CLASSES[tone];

  return (
    <div className="inline-block w-full">
      {variant === 'icon' ? (
        <button
          onClick={() => setOpen(v => !v)}
          className={`p-1 rounded-lg ${t.btn} transition-colors`}
          title={label}
          aria-expanded={open}
        >
          <HelpCircle className="w-3.5 h-3.5" />
        </button>
      ) : variant === 'badge' ? (
        <button
          onClick={() => setOpen(v => !v)}
          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border border-current ${t.btn} transition-colors`}
          aria-expanded={open}
        >
          <HelpCircle className="w-2.5 h-2.5" />
          {label}
        </button>
      ) : (
        <button
          onClick={() => setOpen(v => !v)}
          className={`flex items-center gap-1 text-xs font-medium ${t.btn} transition-colors`}
          aria-expanded={open}
        >
          {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          {label}
        </button>
      )}

      {open && (
        <div className={`mt-2 rounded-xl border p-3 text-xs space-y-2 ${t.panel}`}>
          {/* Summary headline */}
          <p className="font-semibold">{explanation.summary}</p>

          {/* Main explanation paragraphs */}
          {explanation.paragraphs.filter(Boolean).map((para, i) => (
            <p key={i} className="leading-relaxed">{para}</p>
          ))}

          {/* Evidence bullets */}
          {explanation.evidence.length > 0 && (
            <ul className="space-y-0.5 pt-1">
              {explanation.evidence.map((item, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  <span className={`mt-0.5 shrink-0 ${t.bullet}`}>·</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          )}

          {/* If unaddressed */}
          {explanation.ifUnaddressed && (
            <div className="flex items-start gap-1.5 pt-1 border-t border-current border-opacity-10">
              <AlertCircle className={`w-3 h-3 mt-0.5 shrink-0 ${t.bullet}`} />
              <p className="italic">{explanation.ifUnaddressed}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
