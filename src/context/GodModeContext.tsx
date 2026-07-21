import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from './AuthContext';
import { supabase } from '../lib/supabase';

const GOD_SCHOOL_KEY   = 'ss_god_school';
const GOD_TIER_KEY     = 'ss_god_tier';
const GOD_PERSONA_KEY  = 'ss_god_persona';

type TierOverride = 'starter' | 'schools' | null;

export interface GodPersona {
  key: string;
  label: string;
  role: string;
  nameSuffix: string; // appended as "(suffix)" to admin's real name — empty string for broad roles
}

export const GOD_PERSONAS: GodPersona[] = [
  { key: '',               label: 'Real role',          role: '',              nameSuffix: '' },
  { key: 'admin',          label: 'Admin (Head)',        role: 'admin',         nameSuffix: '' },
  { key: 'slt',            label: 'SLT',                role: 'slt',           nameSuffix: '' },
  { key: 'dsl',            label: 'DSL',                role: 'dsl',           nameSuffix: 'DSL' },
  { key: 'sendco',         label: 'SENDCo',             role: 'sendco',        nameSuffix: 'SENDCo' },
  { key: 'pastoral_lead',  label: 'Pastoral Lead',      role: 'pastoral_lead', nameSuffix: '' },
  { key: 'careers_lead',   label: 'Careers Lead',       role: 'careers_lead',  nameSuffix: '' },
  { key: 'hoy_y7',         label: 'Head of Year 7',     role: 'head_of_year',  nameSuffix: 'HOY Y7' },
  { key: 'hoy_y8',         label: 'Head of Year 8',     role: 'head_of_year',  nameSuffix: 'HOY Y8' },
  { key: 'hoy_y9',         label: 'Head of Year 9',     role: 'head_of_year',  nameSuffix: 'HOY Y9' },
  { key: 'hoy_y10',        label: 'Head of Year 10',    role: 'head_of_year',  nameSuffix: 'HOY Y10' },
  { key: 'hoy_y11',        label: 'Head of Year 11',    role: 'head_of_year',  nameSuffix: 'HOY Y11' },
  { key: 'tutor',          label: 'Tutor (10B)',         role: 'tutor',         nameSuffix: 'Tutor' },
  { key: 'teacher',        label: 'Teacher',            role: 'teacher',       nameSuffix: '' },
];

interface School { id: string; name: string; contact_email: string | null }

interface GodModeContextType {
  schools: School[];
  godSchoolId: string | null;
  setGodSchoolId: (id: string | null) => void;
  tierOverride: TierOverride;
  setTierOverride: (t: TierOverride) => void;
  personaKey: string;
  setPersona: (key: string) => void;
  roleOverride: string | null;
  activeSchoolName: string | null;
}

const GodModeContext = createContext<GodModeContextType>({
  schools: [],
  godSchoolId: null,
  setGodSchoolId: () => {},
  tierOverride: null,
  setTierOverride: () => {},
  personaKey: '',
  setPersona: () => {},
  roleOverride: null,
  activeSchoolName: null,
});

function readLocal(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function writeLocal(key: string, val: string | null) {
  try { val ? localStorage.setItem(key, val) : localStorage.removeItem(key); } catch {}
}

function buildName(realName: string, suffix: string): string {
  if (!suffix) return realName;
  return `${realName} (${suffix})`;
}

export function GodModeProvider({ children }: { children: ReactNode }) {
  const { isSuperAdmin, setSchoolIdOverride, setRoleOverride, setNameOverride, profile } = useAuth();
  const [schools, setSchools] = useState<School[]>([]);
  const [godSchoolId, _setGodSchoolId] = useState<string | null>(null);
  const [tierOverride, _setTierOverride] = useState<TierOverride>(null);
  const [personaKey, _setPersonaKey] = useState<string>('');

  // realName is the actual DB name, not the overridden one — store separately
  const [realName, setRealName] = useState<string>('');

  useEffect(() => {
    if (!isSuperAdmin) {
      setSchoolIdOverride(null);
      setRoleOverride(null);
      setNameOverride(null);
      return;
    }

    // Load schools
    supabase.from('schools').select('id, name, contact_email').order('name')
      .then(({ data }) => setSchools(data ?? []));

    // Restore persisted school
    const savedSchool = readLocal(GOD_SCHOOL_KEY);
    if (savedSchool) {
      _setGodSchoolId(savedSchool);
      setSchoolIdOverride(savedSchool);
    }

    // Restore persisted tier
    const savedTier = readLocal(GOD_TIER_KEY);
    if (savedTier === 'starter' || savedTier === 'schools') {
      _setTierOverride(savedTier);
    }

    // Restore persisted persona
    const savedPersona = readLocal(GOD_PERSONA_KEY);
    if (savedPersona) {
      _setPersonaKey(savedPersona);
    }
  }, [isSuperAdmin]);

  // When the real profile loads, capture the real name and re-apply any persona
  useEffect(() => {
    if (!isSuperAdmin || !profile?.full_name) return;
    // profile.full_name here could be the overridden value if persona is active;
    // only update realName if no persona is active
    const activePersona = readLocal(GOD_PERSONA_KEY);
    if (!activePersona) {
      setRealName(profile.full_name);
    } else if (!realName) {
      // We have a persona but haven't set realName yet — we can't recover the original
      // name from the overridden profile; just use what we have and strip the known suffix
      const persona = GOD_PERSONAS.find(p => p.key === activePersona);
      if (persona?.nameSuffix) {
        const suffix = ` (${persona.nameSuffix})`;
        const base = profile.full_name.endsWith(suffix)
          ? profile.full_name.slice(0, -suffix.length)
          : profile.full_name;
        setRealName(base);
        // Re-apply overrides
        setRoleOverride(persona.role || null);
        setNameOverride(buildName(base, persona.nameSuffix));
      } else if (persona) {
        setRealName(profile.full_name);
        setRoleOverride(persona.role || null);
        setNameOverride(null);
      }
    }
  }, [isSuperAdmin, profile?.full_name]);

  // Apply persona overrides whenever personaKey or realName changes
  useEffect(() => {
    if (!isSuperAdmin || !realName) return;
    const persona = GOD_PERSONAS.find(p => p.key === personaKey);
    if (!persona || !persona.key) {
      setRoleOverride(null);
      setNameOverride(null);
    } else {
      setRoleOverride(persona.role || null);
      setNameOverride(buildName(realName, persona.nameSuffix));
    }
  }, [personaKey, realName, isSuperAdmin]);

  function setGodSchoolId(id: string | null) {
    _setGodSchoolId(id);
    setSchoolIdOverride(id);
    writeLocal(GOD_SCHOOL_KEY, id);
  }

  function setTierOverride(t: TierOverride) {
    _setTierOverride(t);
    writeLocal(GOD_TIER_KEY, t);
  }

  function setPersona(key: string) {
    _setPersonaKey(key);
    writeLocal(GOD_PERSONA_KEY, key || null);
    const persona = GOD_PERSONAS.find(p => p.key === key);
    if (!persona || !persona.key) {
      setRoleOverride(null);
      setNameOverride(null);
    } else {
      setRoleOverride(persona.role || null);
      setNameOverride(buildName(realName, persona.nameSuffix));
    }
  }

  const activeSchoolName = godSchoolId
    ? (schools.find(s => s.id === godSchoolId)?.name ?? null)
    : null;

  const roleOverride = (() => {
    const persona = GOD_PERSONAS.find(p => p.key === personaKey);
    return (persona && persona.key) ? persona.role || null : null;
  })();

  return (
    <GodModeContext.Provider value={{ schools, godSchoolId, setGodSchoolId, tierOverride, setTierOverride, personaKey, setPersona, roleOverride, activeSchoolName }}>
      {children}
    </GodModeContext.Provider>
  );
}

export function useGodMode() {
  return useContext(GodModeContext);
}

