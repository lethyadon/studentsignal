import React from 'react';

interface PricingToggleProps {
  interval: 'month' | 'year';
  onChange: (interval: 'month' | 'year') => void;
}

export function PricingToggle({ interval, onChange }: PricingToggleProps) {
  return (
    <div className="inline-flex items-center rounded-full bg-slate-100 p-1 gap-0.5">
      <button
        onClick={() => onChange('month')}
        className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
          interval === 'month'
            ? 'bg-white text-slate-900 shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        Monthly
      </button>
      <button
        onClick={() => onChange('year')}
        className={`px-5 py-2 rounded-full text-sm font-semibold transition-all duration-200 ${
          interval === 'year'
            ? 'bg-slate-900 text-white shadow-sm'
            : 'text-slate-500 hover:text-slate-700'
        }`}
      >
        Yearly
      </button>
      <span
        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 ${
          interval === 'year'
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200'
            : 'text-slate-400'
        }`}
      >
        Save 17%
      </span>
    </div>
  );
}

