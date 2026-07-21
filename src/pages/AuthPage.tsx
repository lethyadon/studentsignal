import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth, DEMO_PERSONAS, type URNInfo } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Shield, Eye, EyeOff, Loader2, ArrowRight,
  Users, BookOpen, AlertTriangle, GraduationCap, UserCheck,
  ChevronRight, TrendingUp, Pencil, Search, CheckCircle2,
  Heart, Briefcase,
  Mail, CheckCircle, Building2, Hash, BadgeCheck, XCircle, HelpCircle,
} from 'lucide-react';

const PERSONA_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  admin: Users,
  slt: TrendingUp,
  dsl: AlertTriangle,
  head_of_year: BookOpen,
  sendco: GraduationCap,
  tutor: UserCheck,
  teacher: Pencil,
  pastoral_lead: Heart,
  careers_lead: Briefcase,
  staff: Users,
};

const PERSONA_COLORS: Record<string, { border: string; icon: string; badge: string }> = {
  slate:   { border: 'border-slate-200 hover:border-slate-400',   icon: 'bg-slate-800 text-white',     badge: 'bg-slate-100 text-slate-700' },
  violet:  { border: 'border-violet-200 hover:border-violet-400', icon: 'bg-violet-700 text-white',    badge: 'bg-violet-100 text-violet-700' },
  red:     { border: 'border-red-200 hover:border-red-400',       icon: 'bg-red-600 text-white',       badge: 'bg-red-100 text-red-700' },
  blue:    { border: 'border-blue-200 hover:border-blue-400',     icon: 'bg-blue-600 text-white',      badge: 'bg-blue-100 text-blue-700' },
  teal:    { border: 'border-teal-200 hover:border-teal-400',     icon: 'bg-teal-600 text-white',      badge: 'bg-teal-100 text-teal-700' },
  emerald: { border: 'border-emerald-200 hover:border-emerald-400', icon: 'bg-emerald-600 text-white', badge: 'bg-emerald-100 text-emerald-700' },
  amber:   { border: 'border-amber-200 hover:border-amber-400',   icon: 'bg-amber-500 text-white',    badge: 'bg-amber-100 text-amber-700' },
};

interface SchoolResult {
  id: string;
  name: string;
}

type SuccessState =
  | { type: 'email_confirm'; email: string; schoolName: string }
  | { type: 'registered'; schoolName: string };

export default function AuthPage() {
  const [searchParams] = useSearchParams();
  const initialMode = (['login', 'register', 'join', 'demo'].includes(searchParams.get('mode') ?? ''))
    ? (searchParams.get('mode') as 'login' | 'register' | 'join' | 'demo')
    : 'demo';
  const [mode, setMode] = useState<'login' | 'register' | 'join' | 'demo'>(initialMode);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [schoolName, setSchoolName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const [schoolSearch, setSchoolSearch] = useState('');
  const [schoolResults, setSchoolResults] = useState<SchoolResult[]>([]);
  const [selectedSchool, setSelectedSchool] = useState<SchoolResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSent, setResendSent] = useState(false);

  // ── URN verification state ────────────────────────────────────────────────
  const [urn, setUrn] = useState('');
  const [urnLookup, setUrnLookup] = useState<'idle' | 'loading' | 'found' | 'not_found' | 'invalid' | 'error'>('idle');
  const [urnInfo, setUrnInfo] = useState<URNInfo | null>(null);
  const [urnErrorMsg, setUrnErrorMsg] = useState('');
  const urnDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const domainVerified = email.includes('@') && (
    email.split('@')[1]?.toLowerCase().endsWith('.sch.uk') ||
    email.split('@')[1]?.toLowerCase().endsWith('.ac.uk')
  );

  const { signIn, signUp, joinSchool, enableDemo, clearDemo, user, loading: authLoading, demoMode } = useAuth();
  const navigate = useNavigate();

  // ── URN lookup (debounced) ────────────────────────────────────────────────
  const lookupUrn = useCallback(async (rawUrn: string) => {
    const trimmed = rawUrn.trim();
    if (!trimmed) { setUrnLookup('idle'); setUrnInfo(null); return; }
    if (!/^\d{6}$/.test(trimmed)) { setUrnLookup('invalid'); setUrnInfo(null); return; }
    setUrnLookup('loading');
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/verify-school?urn=${trimmed}`,
        { headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` } },
      );
      const data = await res.json();
      if (!data.found) {
        setUrnLookup('not_found');
        setUrnErrorMsg(data.error || 'URN not found on the DfE register.');
        setUrnInfo(null);
      } else if (!data.valid) {
        setUrnLookup('not_found');
        setUrnErrorMsg(data.error || 'School is not currently open.');
        setUrnInfo(null);
      } else {
        setUrnLookup('found');
        setUrnErrorMsg('');
        setUrnInfo({ urn: trimmed, gias_name: data.name, phase: data.phase, la_name: data.la_name });
      }
    } catch {
      setUrnLookup('error');
      setUrnErrorMsg('Could not reach verification service. Your URN will be stored for manual review.');
      setUrnInfo({ urn: trimmed });
    }
  }, []);

  function handleUrnChange(value: string) {
    setUrn(value);
    setUrnInfo(null);
    if (urnDebounceRef.current) clearTimeout(urnDebounceRef.current);
    urnDebounceRef.current = setTimeout(() => lookupUrn(value), 600);
  }

  // When a user becomes authenticated (and we're not on the post-registration splash),
  // redirect to the dashboard. Handles both sign-in and auto-confirmed registration.
  const successRef = useRef<SuccessState | null>(null);
  useEffect(() => { successRef.current = success; }, [success]);

  useEffect(() => {
    if (!authLoading && user && !successRef.current) {
      navigate('/dashboard');
    }
  }, [user, authLoading]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    if (mode === 'login') {
      const { error } = await signIn(email, password);
      if (error) {
        if (error.message.toLowerCase().includes('email not confirmed')) {
          setError('Please verify your email address before signing in. Check your inbox for a confirmation link.');
        } else if (error.message.toLowerCase().includes('invalid login')) {
          setError('Incorrect email or password. Please try again.');
        } else {
          setError(error.message);
        }
      }
      // Navigation is handled by the useEffect watching `user` — don't navigate here
      // or ProtectedRoute will see user=null before the state commit and bounce back.
    } else if (mode === 'register') {
      if (!fullName || !schoolName) {
        setError('Please enter your full name and school name.');
        setLoading(false);
        return;
      }
      const { error, emailConfirmationRequired } = await signUp(email, password, fullName, schoolName, urnInfo ?? undefined);
      if (error) {
        setError(error.message);
      } else {
        setSuccess(
          emailConfirmationRequired
            ? { type: 'email_confirm', email, schoolName }
            : { type: 'registered', schoolName }
        );
      }
    } else if (mode === 'join') {
      if (!fullName || !selectedSchool) {
        setError('Please enter your name and select your school.');
        setLoading(false);
        return;
      }
      const { error } = await joinSchool(email, password, fullName, selectedSchool.id);
      if (error) {
        setError(error.message.replace(/^.*ERROR:\s*/i, ''));
      } else {
        navigate('/dashboard');
      }
    }

    setLoading(false);
  }

  async function resendVerification() {
    setResendLoading(true);
    await supabase.auth.resend({ type: 'signup', email });
    setResendSent(true);
    setResendLoading(false);
  }

  async function searchSchools(query: string) {
    setSchoolSearch(query);
    setSelectedSchool(null);
    if (query.trim().length < 2) { setSchoolResults([]); return; }
    setSearching(true);
    const { data } = await supabase
      .from('schools')
      .select('id, name')
      .ilike('name', `%${query.trim()}%`)
      .limit(8);
    setSchoolResults(data ?? []);
    setSearching(false);
  }

  function selectSchool(school: SchoolResult) {
    setSelectedSchool(school);
    setSchoolSearch(school.name);
    setSchoolResults([]);
  }

  function switchMode(m: typeof mode) {
    // Switching away from demo — clear demo state only (don't sign out a real Supabase session)
    if (m !== 'demo' && demoMode) clearDemo();
    setMode(m);
    setError('');
    setSuccess(null);
    setSchoolSearch('');
    setSchoolResults([]);
    setSelectedSchool(null);
    setResendSent(false);
    setUrn('');
    setUrnLookup('idle');
    setUrnInfo(null);
    setUrnErrorMsg('');
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-10 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-96 h-96 bg-teal-100/30 rounded-full blur-3xl -translate-y-1/2 -translate-x-1/4" />
      <div className="absolute bottom-0 right-0 w-72 h-72 bg-blue-100/30 rounded-full blur-3xl translate-y-1/3 translate-x-1/4" />

      <div className="w-full max-w-2xl relative z-10">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl bg-teal-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-200">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Student Signal</h1>
          <p className="text-sm text-slate-500 mt-1">UK School Intelligence Platform</p>
        </div>

        {/* ── Email confirmation required splash ── */}
        {success?.type === 'email_confirm' && (
          <div className="card-premium p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-teal-50 border-2 border-teal-200 flex items-center justify-center mx-auto mb-5">
              <Mail className="w-8 h-8 text-teal-600" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Check your email</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-1">
              We've sent a confirmation link to <span className="font-semibold text-slate-800">{success.email}</span>.
            </p>
            <p className="text-sm text-slate-500 mb-6">
              Click the link in that email to verify your address, then sign in to access your <span className="font-medium">{success.schoolName}</span> account.
            </p>
            <div className="bg-teal-50 border border-teal-100 rounded-xl px-4 py-3 mb-6 text-left space-y-1.5">
              {['Check your inbox (and spam folder)', 'Click the verification link', 'Return here and sign in'].map((step, i) => (
                <div key={i} className="flex items-center gap-2.5 text-sm text-teal-800">
                  <span className="w-5 h-5 rounded-full bg-teal-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                  {step}
                </div>
              ))}
            </div>
            {resendSent ? (
              <p className="text-sm text-emerald-600 font-medium mb-4 flex items-center justify-center gap-1.5">
                <CheckCircle className="w-4 h-4" /> Verification email resent
              </p>
            ) : (
              <button
                onClick={resendVerification}
                disabled={resendLoading}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium mb-4 flex items-center justify-center gap-1.5 mx-auto disabled:opacity-50"
              >
                {resendLoading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Didn't get it? Resend verification email
              </button>
            )}
            <button onClick={() => switchMode('login')} className="btn-primary w-full py-3">
              Go to Sign In
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Registration success (auto-confirmed) splash ── */}
        {success?.type === 'registered' && (
          <div className="card-premium p-10 text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 border-2 border-emerald-200 flex items-center justify-center mx-auto mb-5">
              <Building2 className="w-8 h-8 text-emerald-600" />
            </div>
            <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-full mb-4">
              <CheckCircle className="w-3.5 h-3.5" /> Account created successfully
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Welcome to Student Signal</h2>
            <p className="text-sm text-slate-600 leading-relaxed mb-6">
              Your school <span className="font-semibold text-slate-800">{success.schoolName}</span> is ready. You've been set up as the school admin — you can invite your team from User Management once you're in.
            </p>
            <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-6 text-left space-y-2">
              {[
                'Upload your MIS data (Arbor, ClassCharts, CPOMS)',
                'Invite staff and assign roles',
                'Student Signal will start surfacing patterns immediately',
              ].map((step, i) => (
                <div key={i} className="flex items-start gap-2.5 text-sm text-slate-700">
                  <CheckCircle2 className="w-4 h-4 text-teal-500 shrink-0 mt-0.5" />
                  {step}
                </div>
              ))}
            </div>
            <button onClick={() => navigate('/dashboard')} className="btn-primary w-full py-3">
              Go to Dashboard
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── Normal mode tabs + forms ── */}
        {!success && (
          <>
            {/* Mode tabs */}
            <div className="card-premium p-1 flex mb-6 gap-1">
              {(['demo', 'login', 'register', 'join'] as const).map(m => (
                <button key={m} onClick={() => switchMode(m)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    mode === m
                      ? 'bg-teal-600 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                  }`}>
                  {m === 'demo' ? 'Try Demo' : m === 'login' ? 'Sign In' : m === 'register' ? 'New School' : 'Join School'}
                </button>
              ))}
            </div>

            {/* Demo personas */}
            {mode === 'demo' && (
              <div className="space-y-3">
                <div className="text-center mb-4">
                  <p className="text-sm text-slate-600 font-medium">Enter as a specific role to see how the system looks from that perspective.</p>
                  <p className="text-xs text-slate-400 mt-1">Each view is filtered to what that person needs to act on — not a firehose of data.</p>
                </div>
                {DEMO_PERSONAS.map((persona) => {
                  const Icon = PERSONA_ICONS[persona.role as keyof typeof PERSONA_ICONS] || Users;
                  const colors = PERSONA_COLORS[persona.color];
                  return (
                    <button key={`${persona.role}-${persona.name}`}
                      onClick={() => { enableDemo(persona.role, persona.name); navigate('/dashboard'); }}
                      className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 bg-white transition-all text-left group ${colors.border}`}>
                      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${colors.icon}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900 text-sm">{persona.name}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${colors.badge}`}>{persona.title}</span>
                        </div>
                        <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{persona.description}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-500 shrink-0 transition-colors" />
                    </button>
                  );
                })}
              </div>
            )}

            {/* Sign in / New school */}
            {(mode === 'login' || mode === 'register') && (
              <div className="card-premium p-8">
                {mode === 'register' && (
                  <div className="mb-5 p-4 rounded-xl bg-teal-50 border border-teal-100">
                    <p className="text-sm text-teal-800 font-semibold">Register your school</p>
                    <p className="text-xs text-teal-600 mt-1">You'll be set up as admin. Provide your DfE URN for instant verification — or your <span className="font-medium">.sch.uk</span> email will be automatically verified. Invite your staff from User Management after signing in.</p>
                  </div>
                )}
                <form onSubmit={handleSubmit} className="space-y-5">
                  {mode === 'register' && (
                    <>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Full name</label>
                        <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-premium" placeholder="e.g. Jane Smith" required />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">School name</label>
                        <input type="text" value={schoolName} onChange={(e) => setSchoolName(e.target.value)} className="input-premium" placeholder="e.g. Oakwood Academy" required />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">
                          DfE URN
                          <span className="ml-1.5 text-[10px] font-normal text-slate-400 normal-case">(Unique Reference Number — recommended)</span>
                        </label>
                        <div className="relative">
                          <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                          <input
                            type="text"
                            value={urn}
                            onChange={(e) => handleUrnChange(e.target.value)}
                            className="input-premium pl-9 pr-10"
                            placeholder="6-digit number, e.g. 123456"
                            maxLength={6}
                            inputMode="numeric"
                          />
                          <div className="absolute right-3 top-1/2 -translate-y-1/2">
                            {urnLookup === 'loading' && <Loader2 className="w-4 h-4 text-slate-400 animate-spin" />}
                            {urnLookup === 'found' && <BadgeCheck className="w-4 h-4 text-emerald-500" />}
                            {(urnLookup === 'not_found' || urnLookup === 'invalid') && <XCircle className="w-4 h-4 text-red-400" />}
                            {urnLookup === 'error' && <HelpCircle className="w-4 h-4 text-amber-400" />}
                          </div>
                        </div>
                        {urnLookup === 'found' && urnInfo?.gias_name && (
                          <div className="mt-2 flex items-start gap-2 px-3 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200">
                            <BadgeCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <p className="text-xs font-semibold text-emerald-800">{urnInfo.gias_name}</p>
                              <p className="text-[10px] text-emerald-600 mt-0.5">
                                {[urnInfo.phase && `Phase: ${urnInfo.phase}`, urnInfo.la_name && `LA: ${urnInfo.la_name}`].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                          </div>
                        )}
                        {(urnLookup === 'not_found' || urnLookup === 'invalid') && (
                          <p className="mt-1.5 text-xs text-red-600 flex items-center gap-1.5">
                            <XCircle className="w-3.5 h-3.5 shrink-0" />
                            {urnLookup === 'invalid' ? 'URN must be exactly 6 digits.' : urnErrorMsg}
                          </p>
                        )}
                        {urnLookup === 'error' && (
                          <p className="mt-1.5 text-xs text-amber-700 flex items-center gap-1.5">
                            <HelpCircle className="w-3.5 h-3.5 shrink-0" /> {urnErrorMsg}
                          </p>
                        )}
                        {urnLookup === 'idle' && (
                          <p className="mt-1.5 text-[10px] text-slate-400">
                            Find your URN on the <a href="https://get-information-schools.service.gov.uk" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-600">DfE GIAS register</a>. Speeds up verification.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Email address</label>
                    <div className="relative">
                      <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`input-premium ${mode === 'register' && domainVerified ? 'pr-28' : ''}`} placeholder="you@school.sch.uk" required />
                      {mode === 'register' && domainVerified && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-bold px-2 py-0.5 rounded-full">
                          <CheckCircle className="w-3 h-3" /> Domain verified
                        </div>
                      )}
                    </div>
                    {mode === 'register' && !domainVerified && email.includes('@') && (
                      <p className="mt-1.5 text-[10px] text-slate-400">
                        A <span className="font-medium">.sch.uk</span> or <span className="font-medium">.ac.uk</span> address is automatically verified. Other domains will be reviewed manually.
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Password</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="input-premium pr-10" placeholder={mode === 'register' ? 'At least 6 characters' : 'Enter your password'} required minLength={mode === 'register' ? 6 : undefined} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                  {error && (
                    <div className="flex items-start gap-2.5 text-sm text-red-700 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}
                  <button type="submit" disabled={loading} className="btn-primary w-full py-3">
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    {mode === 'login' ? 'Sign in' : 'Create account'}
                    <ArrowRight className="w-4 h-4" />
                  </button>
                  {mode === 'login' && (
                    <p className="text-center text-xs text-slate-500">
                      New school?{' '}
                      <button type="button" onClick={() => switchMode('register')} className="text-teal-600 hover:text-teal-700 font-semibold">
                        Register here
                      </button>
                    </p>
                  )}
                </form>
              </div>
            )}

            {/* Join school (invite flow) */}
            {mode === 'join' && (
              <div className="card-premium p-8">
                <div className="mb-5 p-4 rounded-xl bg-teal-50 border border-teal-100">
                  <p className="text-sm text-teal-800 font-medium">You need a pending invite from your school admin.</p>
                  <p className="text-xs text-teal-600 mt-1">An admin must invite your email address first via User Management. Sign up below using the same email address.</p>
                </div>
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Full name</label>
                    <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-premium" placeholder="e.g. Jane Smith" required />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Your school</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      <input
                        type="text"
                        value={schoolSearch}
                        onChange={(e) => searchSchools(e.target.value)}
                        className="input-premium pl-9"
                        placeholder="Start typing your school name…"
                        autoComplete="off"
                      />
                      {searching && (
                        <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 animate-spin" />
                      )}
                      {selectedSchool && !searching && (
                        <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-emerald-500" />
                      )}
                    </div>

                    {schoolResults.length > 0 && (
                      <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        {schoolResults.map((school) => (
                          <button
                            key={school.id}
                            type="button"
                            onClick={() => selectSchool(school)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-700 hover:bg-teal-50 hover:text-teal-800 transition-colors border-b border-slate-100 last:border-0"
                          >
                            <Shield className="w-4 h-4 text-slate-300 shrink-0" />
                            {school.name}
                          </button>
                        ))}
                      </div>
                    )}

                    {schoolSearch.length >= 2 && !searching && schoolResults.length === 0 && !selectedSchool && (
                      <p className="mt-2 text-xs text-slate-500">
                        No schools found. If your school hasn't been set up yet, ask an admin to register it under "New School".
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Email address</label>
                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input-premium" placeholder="The email your invite was sent to" required />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Choose a password</label>
                    <div className="relative">
                      <input type={showPassword ? 'text' : 'password'} value={password} onChange={(e) => setPassword(e.target.value)} className="input-premium pr-10" placeholder="At least 6 characters" required minLength={6} />
                      <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-start gap-2.5 text-sm text-red-700 bg-red-50 border border-red-100 px-4 py-3 rounded-xl">
                      <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button type="submit" disabled={loading || !selectedSchool} className="btn-primary w-full py-3 disabled:opacity-50 disabled:cursor-not-allowed">
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Join school
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </form>
              </div>
            )}
          </>
        )}

        <p className="text-center text-sm text-slate-500 mt-6">
          <button onClick={() => navigate('/')} className="text-teal-600 hover:text-teal-700 font-medium">
            Back to home
          </button>
        </p>
      </div>
    </div>
  );
}

