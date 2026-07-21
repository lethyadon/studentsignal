import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { AppRole } from '../lib/permissions';

export interface URNInfo {
  urn: string;
  gias_name?: string;
  phase?: string;
  la_name?: string;
}

function isDomainVerified(email: string): boolean {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  return domain.endsWith('.sch.uk') || domain.endsWith('.ac.uk');
}

interface Profile {
  id: string;
  school_id: string | null;
  role: string;
  full_name: string | null;
}

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  demoMode: boolean;
  demoRole: AppRole;
  isSuperAdmin: boolean;
  setSchoolIdOverride: (id: string | null) => void;
  setRoleOverride: (role: string | null) => void;
  setNameOverride: (name: string | null) => void;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, fullName: string, schoolName: string, urnInfo?: URNInfo) => Promise<{ error: Error | null; emailConfirmationRequired: boolean }>;
  joinSchool: (email: string, password: string, fullName: string, schoolId: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  clearDemo: () => void;
  enableDemo: (role?: AppRole, name?: string) => void;
  setDemoRole: (role: AppRole) => void;
}

export const DEMO_PERSONAS: { role: AppRole; name: string; title: string; description: string; color: string }[] = [
  // Leadership
  { role: 'admin',        name: 'Mrs Clarke (Head)',        title: 'Headteacher',           description: 'Full school overview — all students, all signals, all data feeds.', color: 'slate' },
  { role: 'slt',          name: 'Mr Thompson (DHT)',        title: 'Deputy Head',            description: 'Strategic oversight — behaviour trends, attendance patterns, intervention effectiveness across all year groups.', color: 'violet' },
  { role: 'slt',          name: 'Mr Lee (SLT)',             title: 'SLT Lead',               description: 'Receives escalations from Heads of Year and pastoral staff. See what lands in an SLT inbox.', color: 'violet' },
  // Designated leads
  { role: 'dsl',          name: 'Mr Ahmed (DSL)',           title: 'DSL',                    description: 'Safeguarding intelligence — escalations from staff, CPOMS context, distilled actions.', color: 'red' },
  { role: 'sendco',       name: 'Ms Jones (SENDCo)',        title: 'SENDCo',                 description: 'SEND students — EHCP reviews, support plan triggers, attendance patterns.', color: 'teal' },
  { role: 'pastoral_lead',name: 'Mrs Thompson (Pastoral)',  title: 'Pastoral Manager',       description: 'Cross-school pastoral oversight — monitor open actions, welfare concerns, and team workload.', color: 'emerald' },
  { role: 'careers_lead', name: 'Ms Brown (Careers)',       title: 'Careers Lead',           description: 'Destinations tracking, CEIAG records, and career readiness signals for all students.', color: 'amber' },
  // Heads of Year
  { role: 'head_of_year', name: 'Ms Clarke (HOY Y7)',       title: 'Head of Year 7',         description: 'Year 7 students — new intake concerns, settling-in signals, early pastoral flags.', color: 'blue' },
  { role: 'head_of_year', name: 'Mr Singh (HOY Y8)',        title: 'Head of Year 8',         description: 'Year 8 students — behaviour trends, attendance patterns, emerging risks in your cohort.', color: 'blue' },
  { role: 'head_of_year', name: 'Mr Okafor (HOY Y9)',       title: 'Head of Year 9',         description: 'Year 9 students — options-year pressures, pastoral concerns, intervention pipeline.', color: 'blue' },
  { role: 'head_of_year', name: 'Ms Harris (HOY Y10)',      title: 'Head of Year 10',        description: 'Year 10 students only — pastoral concerns, actions due, emerging risks.', color: 'blue' },
  { role: 'head_of_year', name: 'Mrs Reeves (HOY Y11)',     title: 'Head of Year 11',        description: 'Year 11 students — exam pressure, attendance risks, safeguarding escalations.', color: 'blue' },
  // Classroom
  { role: 'tutor',        name: 'Mr Patel (Tutor)',         title: 'Form Tutor — 10B',       description: 'Your tutor group — daily welfare signals and actions assigned to you.', color: 'emerald' },
  { role: 'teacher',      name: 'Ms Okonkwo (Teacher)',     title: 'Classroom Teacher',      description: 'Log observations and concerns for any student you teach. Actions are managed by pastoral staff.', color: 'amber' },
];

const DEMO_SESSION_KEY = 'ss_demo_session';

function loadDemoSession(): { role: AppRole; name: string } | null {
  try {
    const raw = sessionStorage.getItem(DEMO_SESSION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDemoSession(role: AppRole, name: string) {
  try { sessionStorage.setItem(DEMO_SESSION_KEY, JSON.stringify({ role, name })); } catch {}
}

function clearDemoSessionStorage() {
  try { sessionStorage.removeItem(DEMO_SESSION_KEY); } catch {}
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const saved = loadDemoSession();
  const [profile, setProfile] = useState<Profile | null>(
    saved ? { id: 'demo', school_id: null, role: saved.role, full_name: saved.name } : null
  );
  const [loading, setLoading] = useState(!saved);
  const [demoMode, setDemoMode] = useState(!!saved);
  const [demoRole, setDemoRoleState] = useState<AppRole>(saved?.role ?? 'admin');
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [schoolIdOverride, setSchoolIdOverride] = useState<string | null>(null);
  const [roleOverride, setRoleOverride] = useState<string | null>(null);
  const [nameOverride, setNameOverride] = useState<string | null>(null);
  // Ref so the onAuthStateChange closure always reads the latest demo state
  const demoModeRef = useRef(!!saved);
  useEffect(() => { demoModeRef.current = demoMode; }, [demoMode]);

  useEffect(() => {
    // Always subscribe — even if starting in demo mode, so sign-in later works
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (demoModeRef.current) return;
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    // Check for an existing real session on mount (skip if in demo mode)
    if (!demoModeRef.current) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (demoModeRef.current) return;
        setUser(session?.user ?? null);
        if (session?.user) {
          fetchProfile(session.user.id);
        } else {
          setLoading(false);
        }
      });
    }

    return () => subscription.unsubscribe();
  }, []);

  function enableDemo(role: AppRole = 'admin', name = 'Demo User') {
    setDemoMode(true);
    demoModeRef.current = true;
    setDemoRoleState(role);
    setProfile({ id: 'demo', school_id: null, role, full_name: name });
    setLoading(false);
    saveDemoSession(role, name);
  }

  function setDemoRole(role: AppRole) {
    const name = profile?.full_name || 'Demo User';
    setDemoRoleState(role);
    setProfile({ id: 'demo', school_id: null, role, full_name: name });
    saveDemoSession(role, name);
  }

  // Clear demo state only — does NOT touch the Supabase session
  function clearDemo() {
    setDemoMode(false);
    demoModeRef.current = false;
    setProfile(null);
    setUser(null);
    clearDemoSessionStorage();
    // Re-check for an existing real Supabase session now that demo is cleared
    setLoading(true);
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });
  }

  async function fetchProfile(userId: string) {
    const [profileResult, adminResult] = await Promise.all([
      supabase.from('profiles').select('id, school_id, role, full_name').eq('id', userId).maybeSingle(),
      supabase.from('platform_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ]);
    if (!profileResult.error && profileResult.data) {
      setProfile(profileResult.data as Profile);
    }
    setIsSuperAdmin(!!adminResult.data);
    setLoading(false);
  }

  async function signIn(email: string, password: string) {
    if (demoModeRef.current) {
      // Clear demo state first so onAuthStateChange can fire
      setDemoMode(false);
      demoModeRef.current = false;
      clearDemoSessionStorage();
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }

  async function signUp(email: string, password: string, fullName: string, schoolName: string, urnInfo?: URNInfo) {
    if (demoModeRef.current) {
      setDemoMode(false);
      demoModeRef.current = false;
      clearDemoSessionStorage();
    }
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (signUpError || !authData.user) return { error: signUpError || new Error('Signup failed'), emailConfirmationRequired: false };

    const emailConfirmationRequired = !authData.user.email_confirmed_at;

    const domainVerified = isDomainVerified(email);
    const verificationStatus = urnInfo ? 'urn_verified' : domainVerified ? 'domain_verified' : 'pending';

    const schoolInsert: Record<string, unknown> = {
      name: schoolName,
      contact_email: email,
      domain_verified: domainVerified,
      verification_status: verificationStatus,
    };
    if (urnInfo) {
      schoolInsert.urn = urnInfo.urn;
      if (urnInfo.gias_name) schoolInsert.gias_name = urnInfo.gias_name;
      if (urnInfo.phase) schoolInsert.phase = urnInfo.phase;
      if (urnInfo.la_name) schoolInsert.la_name = urnInfo.la_name;
    }

    const { data: schoolData, error: schoolError } = await supabase
      .from('schools')
      .insert(schoolInsert)
      .select()
      .single();
    if (schoolError) return { error: schoolError, emailConfirmationRequired };

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        school_id: schoolData.id,
        role: 'admin',
        full_name: fullName,
      });

    // Fire verification email (non-blocking — don't fail signup if this errors)
    fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-verification-email`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          school_id: schoolData.id,
          recipient_email: email,
          recipient_name: fullName,
          school_name: schoolName,
          action: verificationStatus,
        }),
      },
    ).catch(() => { /* swallow — email is best-effort */ });

    return { error: profileError, emailConfirmationRequired };
  }

  async function joinSchool(email: string, password: string, fullName: string, schoolId: string) {
    if (demoModeRef.current) {
      setDemoMode(false);
      demoModeRef.current = false;
      clearDemoSessionStorage();
    }
    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    if (signUpError || !authData.user) return { error: signUpError || new Error('Signup failed') };

    const { error: profileError } = await supabase
      .from('profiles')
      .insert({
        id: authData.user.id,
        school_id: schoolId,
        role: 'staff',
        full_name: fullName,
      });

    return { error: profileError };
  }

  async function signOut() {
    // Clear demo ref before the Supabase call so onAuthStateChange(SIGNED_OUT) isn't ignored
    demoModeRef.current = false;
    clearDemoSessionStorage();
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setDemoMode(false);
  }

  return (
    <AuthContext.Provider value={{ user, profile: (() => {
      if (!profile) return profile;
      let p = schoolIdOverride !== null ? { ...profile, school_id: schoolIdOverride } : profile;
      if (roleOverride) p = { ...p, role: roleOverride };
      if (nameOverride) p = { ...p, full_name: nameOverride };
      return p;
    })(), loading, demoMode, demoRole, isSuperAdmin, setSchoolIdOverride, setRoleOverride, setNameOverride, signIn, signUp, joinSchool, signOut, clearDemo, enableDemo, setDemoRole }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

