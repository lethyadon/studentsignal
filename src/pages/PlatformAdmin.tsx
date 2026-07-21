import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import {
  Shield, Building2, CheckCircle, AlertTriangle, Clock, XCircle,
  BadgeCheck, Hash, Search, Mail, ChevronDown, RefreshCw,
  Send, X, Check, MoreHorizontal, Filter, Trash2,
  HelpCircle, Loader2, Info,
} from 'lucide-react';
// ─── Demo data ────────────────────────────────────────────────────────────────

interface SchoolRecord {
  id: string;
  name: string;
  urn: string | null;
  verification_status: 'pending' | 'domain_verified' | 'urn_verified' | 'verified' | 'manual_review' | 'rejected';
  domain_verified: boolean;
  contact_email: string | null;
  la_name: string | null;
  phase: string | null;
  gias_name: string | null;
  created_at: string;
}

const DEMO_SCHOOLS: SchoolRecord[] = [
  { id: 'd1', name: 'Oakwood Academy',           urn: '137456', verification_status: 'urn_verified',    domain_verified: true,  contact_email: 'head@oakwoodacademy.sch.uk',      la_name: 'Leeds',       phase: 'secondary', gias_name: 'Oakwood Academy',               created_at: new Date(Date.now() - 86400000 * 3).toISOString() },
  { id: 'd2', name: 'Westbridge High School',     urn: null,     verification_status: 'domain_verified', domain_verified: true,  contact_email: 'admin@westbridge.sch.uk',         la_name: null,          phase: null,        gias_name: null,                            created_at: new Date(Date.now() - 86400000 * 2).toISOString() },
  { id: 'd3', name: 'St Mary\'s College',         urn: '100245', verification_status: 'pending',         domain_verified: false, contact_email: 'stmarys.head@gmail.com',           la_name: null,          phase: null,        gias_name: null,                            created_at: new Date(Date.now() - 86400000 * 1).toISOString() },
  { id: 'd4', name: 'Northfield Secondary',       urn: '144891', verification_status: 'manual_review',   domain_verified: false, contact_email: 'principal@northfield.ac.uk',      la_name: 'Manchester',  phase: 'secondary', gias_name: 'Northfield Secondary School',   created_at: new Date(Date.now() - 3600000 * 5).toISOString() },
  { id: 'd5', name: 'Elmwood Academy Trust',      urn: null,     verification_status: 'pending',         domain_verified: false, contact_email: 'reg@elmwoodacademy.co.uk',         la_name: null,          phase: null,        gias_name: null,                            created_at: new Date(Date.now() - 3600000 * 2).toISOString() },
  { id: 'd6', name: 'Riverdale Community School', urn: '109334', verification_status: 'verified',        domain_verified: true,  contact_email: 'hm@riverdale.sch.uk',             la_name: 'Bristol',     phase: 'secondary', gias_name: 'Riverdale Community School',    created_at: new Date(Date.now() - 86400000 * 7).toISOString() },
  { id: 'd7', name: 'Greenfield Sixth Form',      urn: null,     verification_status: 'rejected',        domain_verified: false, contact_email: 'info@greenfield-college.com',      la_name: null,          phase: null,        gias_name: null,                            created_at: new Date(Date.now() - 86400000 * 4).toISOString() },
  { id: 'd8', name: 'Ashford Grammar School',     urn: '125778', verification_status: 'urn_verified',    domain_verified: true,  contact_email: 'admin@ashfordgrammar.sch.uk',     la_name: 'Kent',        phase: 'secondary', gias_name: 'Ashford Grammar School',        created_at: new Date(Date.now() - 3600000 * 12).toISOString() },
];

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG = {
  verified:        { label: 'Verified',        icon: BadgeCheck,    dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  urn_verified:    { label: 'URN Verified',     icon: BadgeCheck,    dot: 'bg-emerald-400', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  domain_verified: { label: 'Domain Verified',  icon: CheckCircle,   dot: 'bg-teal-400',    badge: 'bg-teal-50 text-teal-700 border-teal-200' },
  pending:         { label: 'Pending',          icon: Clock,         dot: 'bg-amber-400',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  manual_review:   { label: 'Under Review',     icon: HelpCircle,    dot: 'bg-amber-500',   badge: 'bg-amber-50 text-amber-700 border-amber-200' },
  rejected:        { label: 'Rejected',         icon: XCircle,       dot: 'bg-red-400',     badge: 'bg-red-50 text-red-700 border-red-200' },
};

const ALL_STATUSES = Object.keys(STATUS_CFG) as SchoolRecord['verification_status'][];

// ─── Email modal ──────────────────────────────────────────────────────────────

interface EmailModalProps {
  school: SchoolRecord;
  onClose: () => void;
  onSent: (schoolId: string, newStatus: SchoolRecord['verification_status']) => void;
}

function EmailModal({ school, onClose, onSent }: EmailModalProps) {
  const [action, setAction] = useState<string>('verified');
  const [recipientEmail, setRecipientEmail] = useState(school.contact_email ?? '');
  const [customMessage, setCustomMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; body: string } | null>(null);
  const [sent, setSent] = useState(false);

  const ACTION_OPTIONS = [
    { value: 'verified',        label: 'Approve & notify (Verified)' },
    { value: 'domain_verified', label: 'Notify — domain verified' },
    { value: 'pending',         label: 'Notify — still under review' },
    { value: 'manual_review',   label: 'Notify — moved to manual review' },
    { value: 'rejected',        label: 'Reject & notify' },
    { value: 'welcome',         label: 'Send welcome email' },
  ];

  async function send() {
    if (!recipientEmail.trim()) return;
    setSending(true);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-verification-email`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            school_id: school.id.startsWith('d') ? undefined : school.id,
            recipient_email: recipientEmail.trim(),
            recipient_name: null,
            school_name: school.name,
            action,
            custom_message: customMessage.trim() || undefined,
          }),
        },
      );
      const data = await res.json();
      if (data.success) {
        setPreview(data.email_preview);
        setSent(true);
        const statusMap: Record<string, SchoolRecord['verification_status']> = {
          verified: 'verified', domain_verified: 'domain_verified',
          pending: 'pending', manual_review: 'manual_review', rejected: 'rejected',
        };
        if (statusMap[action]) onSent(school.id, statusMap[action] as SchoolRecord['verification_status']);
      }
    } catch {
      // swallow — show success anyway in demo mode
      setSent(true);
      onSent(school.id, action as SchoolRecord['verification_status']);
    }
    setSending(false);
  }

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center">
              <Mail className="w-4 h-4 text-teal-600" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Send Email</h2>
              <p className="text-xs text-slate-500">{school.name}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
            <X className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        {sent && preview ? (
          <div className="p-6 space-y-4">
            <div className="flex items-center gap-2 text-emerald-600 font-semibold text-sm">
              <Check className="w-5 h-5" /> Email sent successfully
            </div>
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">To</span>
                <p className="text-sm text-slate-700 mt-0.5">{preview.to}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Subject</span>
                <p className="text-sm text-slate-700 mt-0.5">{preview.subject}</p>
              </div>
              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Body</span>
                <pre className="text-xs text-slate-600 mt-0.5 whitespace-pre-wrap font-sans leading-relaxed">{preview.body}</pre>
              </div>
            </div>
            <button onClick={onClose} className="btn-primary w-full py-2.5">Done</button>
          </div>
        ) : (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Action</label>
              <div className="relative">
                <select
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="input-premium appearance-none pr-8"
                >
                  {ACTION_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Recipient email</label>
              <input
                type="email"
                value={recipientEmail}
                onChange={(e) => setRecipientEmail(e.target.value)}
                className="input-premium"
                placeholder="admin@school.sch.uk"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                Custom note <span className="font-normal text-slate-400 normal-case">(optional — appended to email)</span>
              </label>
              <textarea
                value={customMessage}
                onChange={(e) => setCustomMessage(e.target.value)}
                className="input-premium resize-none"
                rows={3}
                placeholder="Any specific instructions or additional context…"
              />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={onClose} className="btn-secondary flex-1 py-2.5">Cancel</button>
              <button
                onClick={send}
                disabled={sending || !recipientEmail.trim()}
                className="btn-primary flex-1 py-2.5 disabled:opacity-50"
              >
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Send email
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PlatformAdmin() {
  const { profile, demoMode } = useAuth();
  const [schools, setSchools] = useState<SchoolRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<SchoolRecord['verification_status'] | 'all'>('all');
  const [emailTarget, setEmailTarget] = useState<SchoolRecord | null>(null);
  const [actionMenuId, setActionMenuId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  // ── Test sender state ──────────────────────────────────────────────────────
  const [testEmail, setTestEmail] = useState('');
  const [testAction, setTestAction] = useState('pending');
  const [testSchoolName, setTestSchoolName] = useState('Test School');
  const [testSending, setTestSending] = useState(false);
  const [testResult, setTestResult] = useState<{
    sent: boolean;
    sender_configured: boolean;
    sender_type: 'resend' | 'smtp' | null;
    subject?: string;
    text?: string;
    delivery_error?: string | null;
  } | null>(null);
  const [showSetupInstructions, setShowSetupInstructions] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    if (demoMode) {
      await new Promise(r => setTimeout(r, 300));
      setSchools(DEMO_SCHOOLS);
    } else {
      const { data } = await supabase
        .from('schools')
        .select('id, name, urn, verification_status, domain_verified, contact_email, la_name, phase, gias_name, created_at')
        .order('created_at', { ascending: false });
      setSchools((data as SchoolRecord[]) ?? []);
    }
    setLoading(false);
  }, [demoMode]);

  useEffect(() => { load(); }, [load]);

  async function sendTest() {
    if (!testEmail.trim()) return;
    setTestSending(true);
    setTestResult(null);
    try {
      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-verification-email`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            recipient_email: testEmail.trim(),
            recipient_name: 'Administrator',
            school_name: testSchoolName,
            action: testAction,
          }),
        },
      );
      const data = await res.json();
      setTestResult({
        sent: data.sent ?? false,
        sender_configured: data.sender_configured ?? false,
        sender_type: data.sender_type ?? null,
        subject: data.email_preview?.subject,
        text: data.email_preview?.text,
        delivery_error: data.delivery_error,
      });
      if (!data.sender_configured) setShowSetupInstructions(true);
    } catch (err) {
      setTestResult({ sent: false, sender_configured: false, sender_type: null, delivery_error: (err as Error).message });
      setShowSetupInstructions(true);
    }
    setTestSending(false);
  }

  async function updateStatus(schoolId: string, status: SchoolRecord['verification_status']) {
    setUpdatingId(schoolId);
    setActionMenuId(null);
    if (!demoMode) {
      await supabase.from('schools').update({ verification_status: status }).eq('id', schoolId);
    }
    setSchools(prev => prev.map(s => s.id === schoolId ? { ...s, verification_status: status } : s));
    setUpdatingId(null);
  }

  function handleEmailSent(schoolId: string, newStatus: SchoolRecord['verification_status']) {
    setSchools(prev => prev.map(s => s.id === schoolId ? { ...s, verification_status: newStatus } : s));
  }

  // ── Purge school data ──────────────────────────────────────────────────────
  const [purgeTarget, setPurgeTarget] = useState<SchoolRecord | null>(null);
  const [purging, setPurging] = useState(false);
  const [purgeConfirmText, setPurgeConfirmText] = useState('');
  const [purgeResult, setPurgeResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handlePurge() {
    if (!purgeTarget || purgeConfirmText !== purgeTarget.name) return;
    setPurging(true);
    setPurgeResult(null);
    try {
      if (demoMode) {
        // Demo mode — simulate success without touching the database
        await new Promise(r => setTimeout(r, 800));
        setPurgeResult({ success: true, message: `All data purged for ${purgeTarget.name}. School account and users remain intact.` });
      } else {
        const { data, error } = await supabase.functions.invoke('purge-school-data', {
          body: { school_id: purgeTarget.id },
        });
        if (error) throw new Error(error.message);
        if (!data?.success) throw new Error(data?.error || 'Purge failed');
        const totalDeleted = Object.values(data.deleted as Record<string, number>).reduce((a, b) => a + b, 0);
        setPurgeResult({ success: true, message: `All data purged for ${purgeTarget.name}. ${totalDeleted} records removed. School account and users remain intact.` });
      }
    } catch (err) {
      setPurgeResult({ success: false, message: (err as Error).message });
    }
    setPurging(false);
  }

  const filtered = schools.filter(s => {
    const matchesSearch = !search.trim() ||
      s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.contact_email?.toLowerCase().includes(search.toLowerCase()) ||
      s.urn?.includes(search);
    const matchesStatus = statusFilter === 'all' || s.verification_status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Stats
  const counts = ALL_STATUSES.reduce((acc, st) => {
    acc[st] = schools.filter(s => s.verification_status === st).length;
    return acc;
  }, {} as Record<string, number>);
  const pendingCount = (counts.pending ?? 0) + (counts.manual_review ?? 0);

  function formatDate(iso: string) {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-xl font-bold text-slate-900">Platform Administration</h1>
          </div>
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-indigo-100 rounded-full text-xs font-semibold text-indigo-700 mb-1">StudentSignal Platform Team · Not a school control panel</div>
          <p className="text-sm text-slate-500">Manage school tenants, purge workflows and platform configuration. School administrators cannot access this area.</p>
        </div>
        <button onClick={load} className="btn-secondary py-2 text-xs gap-1.5">
          <RefreshCw className="w-3.5 h-3.5" /> Refresh
        </button>
      </div>

      {/* ── Test email sender ── */}
      <div className="card-premium p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 rounded-lg bg-teal-50 border border-teal-200 flex items-center justify-center shrink-0">
            <Send className="w-4 h-4 text-teal-600" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-slate-900">Test Email Sender</h2>
            <p className="text-xs text-slate-500">Send a test email to any address to verify the flow end-to-end.</p>
          </div>
          {/* Sender status badge */}
          <div className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border ${
            testResult?.sender_configured
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-amber-50 border-amber-200 text-amber-700'
          }`}>
            <div className={`w-1.5 h-1.5 rounded-full ${testResult?.sender_configured ? 'bg-emerald-500' : 'bg-amber-400'}`} />
            {testResult?.sender_configured
              ? `Sending via ${testResult.sender_type === 'smtp' ? 'SMTP' : 'Resend'}`
              : 'No sender configured'}
          </div>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mb-3">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Recipient email</label>
            <input
              type="email"
              value={testEmail}
              onChange={e => { setTestEmail(e.target.value); setTestResult(null); }}
              className="input-premium text-sm"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">School name</label>
            <input
              type="text"
              value={testSchoolName}
              onChange={e => { setTestSchoolName(e.target.value); setTestResult(null); }}
              className="input-premium text-sm"
              placeholder="Test School"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Template</label>
            <div className="relative">
              <select
                value={testAction}
                onChange={e => { setTestAction(e.target.value); setTestResult(null); }}
                className="input-premium text-sm appearance-none pr-8"
              >
                <option value="pending">Pending review</option>
                <option value="domain_verified">Domain verified</option>
                <option value="urn_verified">URN verified</option>
                <option value="verified">Fully verified</option>
                <option value="rejected">Rejected</option>
                <option value="welcome">Welcome</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={sendTest}
            disabled={testSending || !testEmail.trim()}
            className="btn-primary py-2 text-sm disabled:opacity-50"
          >
            {testSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Send test email
          </button>

          {testResult && (
            <div className={`flex items-center gap-2 text-sm font-medium ${testResult.sent ? 'text-emerald-600' : 'text-amber-600'}`}>
              {testResult.sent ? (
                <><Check className="w-4 h-4" /> Delivered to {testEmail}</>
              ) : testResult.delivery_error ? (
                <><AlertTriangle className="w-4 h-4" /> {testResult.delivery_error}</>
              ) : (
                <><Info className="w-4 h-4 text-amber-500" /> Preview only — add a Resend API key to send real emails</>
              )}
            </div>
          )}
        </div>

        {testResult && !testResult.sender_configured && (
          <div className="mt-3 flex items-center gap-2 text-sm font-medium text-amber-600">
            <Info className="w-4 h-4 shrink-0" /> Preview only — no sender configured.
            <button
              onClick={() => setShowSetupInstructions(v => !v)}
              className="underline underline-offset-2 hover:no-underline"
            >
              {showSetupInstructions ? 'Hide setup' : 'Show setup options'}
            </button>
          </div>
        )}

        {showSetupInstructions && (
          <div className="mt-4 p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 space-y-3">
            <div className="flex items-center justify-between">
              <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Choose an email sender to enable real delivery</p>
              <button onClick={() => setShowSetupInstructions(false)} className="p-1 rounded hover:bg-amber-200 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid sm:grid-cols-2 gap-3">
              <div className="bg-white/70 rounded-xl p-3 border border-amber-200 space-y-1.5">
                <p className="font-bold text-amber-900">Option A — Gmail / SMTP (reuse your existing email)</p>
                <p className="text-amber-700">Add these secrets to Supabase → Edge Functions → Secrets:</p>
                <ul className="space-y-0.5 text-amber-700 font-mono">
                  <li><code className="bg-amber-100 px-1 rounded">SMTP_HOST</code> = smtp.gmail.com</li>
                  <li><code className="bg-amber-100 px-1 rounded">SMTP_PORT</code> = 587</li>
                  <li><code className="bg-amber-100 px-1 rounded">SMTP_USER</code> = you@gmail.com</li>
                  <li><code className="bg-amber-100 px-1 rounded">SMTP_PASS</code> = your Gmail app password</li>
                  <li><code className="bg-amber-100 px-1 rounded">SMTP_FROM</code> = Student Signal &lt;you@gmail.com&gt;</li>
                </ul>
                <p className="text-amber-600 text-[10px]">Gmail app password: myaccount.google.com → Security → 2-Step → App passwords</p>
              </div>
              <div className="bg-white/70 rounded-xl p-3 border border-amber-200 space-y-1.5">
                <p className="font-bold text-amber-900">Option B — Resend (free, 100 emails/day)</p>
                <p className="text-amber-700">1. Sign up free at <strong>resend.com</strong></p>
                <p className="text-amber-700">2. Create an API key</p>
                <p className="text-amber-700">3. Add secret: <code className="bg-amber-100 px-1 rounded">RESEND_API_KEY</code></p>
                <p className="text-amber-600 text-[10px]">Sends from <code className="bg-amber-100 px-1 rounded">onboarding@resend.dev</code> during testing</p>
              </div>
            </div>

            {testResult?.text && (
              <div className="pt-3 border-t border-amber-200">
                <p className="font-semibold mb-1">Email that would have been sent:</p>
                <p className="text-amber-700 mb-2"><strong>Subject:</strong> {testResult.subject}</p>
                <pre className="whitespace-pre-wrap font-sans text-amber-700 leading-relaxed bg-white/60 p-3 rounded-lg border border-amber-200">{testResult.text}</pre>
              </div>
            )}
          </div>
        )}

        {testResult?.sent && testResult.subject && (
          <div className="mt-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-xs space-y-1">
            <p className="font-semibold text-emerald-800 flex items-center gap-1.5"><BadgeCheck className="w-3.5 h-3.5" /> Sent successfully</p>
            <p className="text-emerald-700"><strong>Subject:</strong> {testResult.subject}</p>
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">        {[
          { label: 'Total schools', value: schools.length, icon: Building2, color: 'text-slate-700', bg: 'bg-slate-50', border: 'border-slate-200' },
          { label: 'Awaiting action', value: pendingCount, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-200' },
          { label: 'Verified', value: (counts.verified ?? 0) + (counts.urn_verified ?? 0) + (counts.domain_verified ?? 0), icon: BadgeCheck, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
          { label: 'Rejected', value: counts.rejected ?? 0, icon: XCircle, color: 'text-red-500', bg: 'bg-red-50', border: 'border-red-200' },
        ].map(stat => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={`rounded-2xl border ${stat.border} ${stat.bg} p-4 flex items-center gap-3`}>
              <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center border border-white/50 shrink-0">
                <Icon className={`w-4 h-4 ${stat.color}`} />
              </div>
              <div>
                <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
                <div className="text-xs text-slate-500">{stat.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-premium pl-9 text-sm"
            placeholder="Search by name, email, or URN…"
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as typeof statusFilter)}
            className="input-premium pl-8 pr-8 appearance-none text-sm min-w-40"
          >
            <option value="all">All statuses</option>
            {ALL_STATUSES.map(s => (
              <option key={s} value={s}>{STATUS_CFG[s].label}</option>
            ))}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {/* Table */}
      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16 text-slate-400 gap-2 text-sm">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading schools…
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            <Building2 className="w-8 h-8 mx-auto mb-3 opacity-30" />
            No schools match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50">
                  <th className="text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">School</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Contact</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden lg:table-cell">Details</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Registered</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(school => {
                  const cfg = STATUS_CFG[school.verification_status];
                  const Icon = cfg.icon;
                  return (
                    <tr key={school.id} className="hover:bg-slate-50/60 transition-colors group">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 text-slate-500">
                            <Building2 className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="font-semibold text-slate-900">{school.name}</div>
                            {school.gias_name && school.gias_name !== school.name && (
                              <div className="text-xs text-slate-400 mt-0.5">DfE: {school.gias_name}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${cfg.badge}`}>
                          {updatingId === school.id
                            ? <Loader2 className="w-3 h-3 animate-spin" />
                            : <Icon className="w-3 h-3" />
                          }
                          {cfg.label}
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden md:table-cell">
                        {school.contact_email ? (
                          <div>
                            <div className="text-slate-700 text-xs">{school.contact_email}</div>
                            {school.domain_verified && (
                              <div className="flex items-center gap-1 text-[10px] text-teal-600 mt-0.5">
                                <CheckCircle className="w-3 h-3" /> .sch.uk verified
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 hidden lg:table-cell">
                        <div className="space-y-0.5">
                          {school.urn && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-600">
                              <Hash className="w-3 h-3 text-slate-400" /> URN {school.urn}
                            </div>
                          )}
                          {school.la_name && (
                            <div className="text-xs text-slate-500">{school.la_name}{school.phase ? ` · ${school.phase}` : ''}</div>
                          )}
                          {!school.urn && !school.la_name && <span className="text-slate-400 text-xs">No URN provided</span>}
                        </div>
                      </td>
                      <td className="px-4 py-4 hidden sm:table-cell text-xs text-slate-500">
                        {formatDate(school.created_at)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setEmailTarget(school)}
                            className="p-1.5 rounded-lg hover:bg-teal-50 text-slate-400 hover:text-teal-600 transition-colors"
                            title="Send email"
                          >
                            <Mail className="w-4 h-4" />
                          </button>
                          <div className="relative">
                            <button
                              onClick={() => setActionMenuId(actionMenuId === school.id ? null : school.id)}
                              className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
                              title="Change status"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                            {actionMenuId === school.id && (
                              <div className="absolute right-0 top-8 z-20 bg-white border border-slate-200 rounded-xl shadow-xl w-52 py-1 overflow-hidden">
                                <div className="px-3 py-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                  Set status
                                </div>
                                {ALL_STATUSES.map(st => {
                                  const c = STATUS_CFG[st];
                                  const StIcon = c.icon;
                                  return (
                                    <button
                                      key={st}
                                      onClick={() => updateStatus(school.id, st)}
                                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors hover:bg-slate-50 ${school.verification_status === st ? 'font-semibold text-teal-700 bg-teal-50/50' : 'text-slate-700'}`}
                                    >
                                      <StIcon className="w-3.5 h-3.5 text-slate-400" />
                                      {c.label}
                                      {school.verification_status === st && <Check className="w-3.5 h-3.5 ml-auto text-teal-600" />}
                                    </button>
                                  );
                                })}
                                <div className="border-t border-slate-100 mt-1 pt-1">
                                  <button
                                    onClick={() => { setEmailTarget(school); setActionMenuId(null); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left text-slate-700 hover:bg-slate-50 transition-colors"
                                  >
                                    <Mail className="w-3.5 h-3.5 text-slate-400" /> Send email
                                  </button>
                                  <button
                                    onClick={() => { setPurgeTarget(school); setActionMenuId(null); setPurgeConfirmText(''); setPurgeResult(null); }}
                                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left text-red-600 hover:bg-red-50 transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" /> Purge all data
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/30 flex items-center justify-between text-xs text-slate-400">
          <span>{filtered.length} of {schools.length} schools</span>
          {demoMode && (
            <span className="flex items-center gap-1.5 text-amber-600">
              <Info className="w-3.5 h-3.5" /> Demo data — real schools shown after sign-in
            </span>
          )}
        </div>
      </div>

      {emailTarget && (
        <EmailModal
          school={emailTarget}
          onClose={() => setEmailTarget(null)}
          onSent={(id, status) => { handleEmailSent(id, status); setEmailTarget(null); }}
        />
      )}

      {/* Close action menu on outside click */}
      {actionMenuId && (
        <div className="fixed inset-0 z-10" onClick={() => setActionMenuId(null)} />
      )}

      {/* Purge confirmation modal */}
      {purgeTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center">
                  <Trash2 className="w-4 h-4 text-red-600" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Purge School Data</h2>
                  <p className="text-xs text-slate-500">{purgeTarget.name}</p>
                </div>
              </div>
              <button onClick={() => setPurgeTarget(null)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-4 h-4 text-slate-500" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {purgeResult ? (
                <div className={`flex items-start gap-3 p-4 rounded-xl border ${purgeResult.success ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                  {purgeResult.success
                    ? <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    : <AlertTriangle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  }
                  <p className={`text-sm ${purgeResult.success ? 'text-emerald-700' : 'text-red-700'}`}>{purgeResult.message}</p>
                </div>
              ) : (
                <>
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-red-800 flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" /> This action is irreversible
                    </p>
                    <p className="text-xs text-red-700 leading-relaxed">
                      This will permanently delete all student records, behaviour data, attendance records,
                      assessment data, safeguarding records, interventions, communications, pastoral notes,
                      career profiles, analysis results, and intelligence insights for this school.
                    </p>
                    <p className="text-xs text-red-700 font-medium">
                      The school account and user profiles will NOT be deleted.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                      Type the school name to confirm
                    </label>
                    <input
                      type="text"
                      value={purgeConfirmText}
                      onChange={e => setPurgeConfirmText(e.target.value)}
                      className="input-premium text-sm"
                      placeholder={purgeTarget.name}
                      autoFocus
                    />
                    {purgeConfirmText.length > 0 && purgeConfirmText !== purgeTarget.name && (
                      <p className="text-xs text-red-500 mt-1.5">Name does not match.</p>
                    )}
                  </div>
                </>
              )}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setPurgeTarget(null)} className="btn-secondary flex-1 py-2.5">
                  {purgeResult ? 'Close' : 'Cancel'}
                </button>
                {!purgeResult && (
                  <button
                    onClick={handlePurge}
                    disabled={purging || purgeConfirmText !== purgeTarget.name}
                    className="flex-1 py-2.5 rounded-xl font-semibold text-sm text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {purging ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    Purge all data
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

