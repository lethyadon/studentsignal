import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGodMode, GOD_PERSONAS } from '../context/GodModeContext';
import { Shield, ChevronDown, X, Building2, Layers, UserCog } from 'lucide-react';

const TIER_LABELS: Record<string, string> = {
  starter: 'Essentials',
  schools: 'Professional',
};

export function GodModeBar() {
  const { isSuperAdmin, user, demoMode } = useAuth();
  const { schools, godSchoolId, setGodSchoolId, tierOverride, setTierOverride, personaKey, setPersona, roleOverride, activeSchoolName } = useGodMode();

  if (!isSuperAdmin || !user || demoMode) return null;

  const hasFakeState = godSchoolId || tierOverride || personaKey;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] bg-slate-900 border-b border-slate-700 text-white">
      <div className="flex items-center gap-3 px-4 py-2 flex-wrap">

        {/* Badge */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="flex h-5 w-5 items-center justify-center rounded bg-amber-400">
            <Shield className="h-3 w-3 text-slate-900" />
          </div>
          <span className="text-xs font-bold text-amber-400 uppercase tracking-widest">God Mode</span>
        </div>

        <div className="h-4 w-px bg-slate-700 shrink-0" />

        {/* School switcher */}
        <div className="flex items-center gap-2">
          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-400 shrink-0">School:</span>
          <div className="relative">
            <select
              value={godSchoolId ?? ''}
              onChange={e => setGodSchoolId(e.target.value || null)}
              className="appearance-none bg-slate-800 border border-slate-600 text-white text-xs font-medium rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer min-w-40"
            >
              <option value="">Your own account</option>
              <option disabled>──────────────────</option>
              {schools.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
          </div>
          {activeSchoolName && (
            <span className="text-xs font-medium text-teal-400 truncate max-w-32">{activeSchoolName}</span>
          )}
        </div>

        <div className="h-4 w-px bg-slate-700 shrink-0" />

        {/* Role / persona mimicking */}
        <div className="flex items-center gap-2">
          <UserCog className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-400 shrink-0">Mimic role:</span>
          <div className="relative">
            <select
              value={personaKey}
              onChange={e => setPersona(e.target.value)}
              className="appearance-none bg-slate-800 border border-slate-600 text-white text-xs font-medium rounded-lg pl-2.5 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-teal-500 cursor-pointer min-w-36"
            >
              {GOD_PERSONAS.map(p => (
                <option key={p.key} value={p.key}>{p.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-slate-400 pointer-events-none" />
          </div>
          {roleOverride && (
            <span className="text-xs text-amber-400 font-medium">(active)</span>
          )}
        </div>

        <div className="h-4 w-px bg-slate-700 shrink-0" />

        {/* Tier override */}
        <div className="flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-slate-400 shrink-0" />
          <span className="text-xs text-slate-400 shrink-0">Tier:</span>
          <div className="flex items-center gap-1">
            {(['none', 'starter', 'schools'] as const).map(t => {
              const active = (t === 'none' ? !tierOverride : tierOverride === t);
              return (
                <button
                  key={t}
                  onClick={() => setTierOverride(t === 'none' ? null : t)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                    active
                      ? t === 'starter'
                        ? 'bg-teal-600 text-white'
                        : t === 'schools'
                          ? 'bg-slate-200 text-slate-900'
                          : 'bg-slate-700 text-slate-200'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  {t === 'none' ? 'Real' : TIER_LABELS[t]}
                </button>
              );
            })}
          </div>
          {tierOverride && (
            <span className="text-xs text-amber-400 font-medium">(override)</span>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Platform Admin link */}
        <Link
          to="/platform-admin"
          className="text-xs font-medium text-slate-300 hover:text-white underline underline-offset-2 shrink-0"
        >
          Platform Admin
        </Link>

        {/* Clear all overrides */}
        {hasFakeState && (
          <button
            onClick={() => { setGodSchoolId(null); setTierOverride(null); setPersona(''); }}
            className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-400 transition-colors shrink-0"
            title="Clear all overrides"
          >
            <X className="h-3.5 w-3.5" />
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}

