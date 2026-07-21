import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { getProductByPriceId } from '../stripe-config';
import {
  User, School, Bell, Lock, Save, Shield, CheckCircle,
  Database, Upload, Link2, CheckSquare, Circle, Users, Sliders,
  Copy, RefreshCw, Wifi, WifiOff, AlertTriangle, Eye, EyeOff,
  Trash2, Plus, Clock, Activity, Megaphone, Send, Info,
  BadgeCheck, HelpCircle, Hash, CreditCard, ExternalLink, Zap, BookOpen,
} from 'lucide-react';
import UserManagement from './UserManagement';
import { ROLE_LABELS, ASSIGNABLE_ROLES } from '../lib/permissions';
import type { AppRole } from '../lib/permissions';
import { supabase } from '../lib/supabase';
import {
  getDemoBulletins, pushBulletin, dismissBulletin, getBulletins,
  createBulletin, deleteBulletin, type Bulletin,
} from '../lib/data';

const SUPABASE_URL    = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Integration {
  id: string;
  school_id: string;
  system_name: string;
  api_key: string;
  status: 'inactive' | 'active' | 'error';
  last_sync_at: string | null;
  sync_count: number;
  records_synced: number;
  error_message: string | null;
  enabled: boolean;
}

interface SyncLog {
  id: string;
  source: string;
  payload_type: string;
  records_received: number;
  records_upserted: number;
  status: 'success' | 'partial' | 'error';
  created_at: string;
}

// ─── Static config ────────────────────────────────────────────────────────────

const MIS_SYSTEMS = [
  { name: 'classcharts', label: 'ClassCharts',  desc: 'Behaviour, rewards and seating data',           dataTypes: ['behaviour'] },
  { name: 'arbor',       label: 'Arbor',         desc: 'Attendance, demographics and assessment',       dataTypes: ['students', 'attendance'] },
  { name: 'sims',        label: 'SIMS',          desc: 'Full MIS — students, behaviour and attendance', dataTypes: ['students', 'behaviour', 'attendance'] },
  { name: 'bromcom',     label: 'Bromcom',       desc: 'Attendance, behaviour and SEND data',           dataTypes: ['students', 'behaviour', 'attendance'] },
  { name: 'cpoms',       label: 'CPOMS',         desc: 'Safeguarding and pastoral case management',     dataTypes: ['safeguarding'] },
];

const DEMO_INTEGRATIONS: Integration[] = [
  { id: 'demo-1', school_id: 'demo', system_name: 'arbor',   api_key: 'ss_demo_arbor_key',   status: 'active',   last_sync_at: new Date(Date.now() - 3600000).toISOString(), sync_count: 42, records_synced: 1840, error_message: null, enabled: true },
  { id: 'demo-2', school_id: 'demo', system_name: 'cpoms',   api_key: 'ss_demo_cpoms_key',   status: 'active',   last_sync_at: new Date(Date.now() - 7200000).toISOString(), sync_count: 8,  records_synced: 23,   error_message: null, enabled: true },
  { id: 'demo-3', school_id: 'demo', system_name: 'classcharts', api_key: 'ss_demo_cc_key', status: 'error',  last_sync_at: new Date(Date.now() - 86400000).toISOString(), sync_count: 15, records_synced: 600,  error_message: 'Authentication failed — regenerate the API key', enabled: true },
];

const DEMO_LOGS: SyncLog[] = [
  { id: 'l1', source: 'arbor',       payload_type: 'attendance', records_received: 220, records_upserted: 220, status: 'success', created_at: new Date(Date.now() - 3600000).toISOString() },
  { id: 'l2', source: 'arbor',       payload_type: 'students',   records_received: 45,  records_upserted: 43,  status: 'partial', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 'l3', source: 'cpoms',       payload_type: 'safeguarding', records_received: 3, records_upserted: 3,   status: 'success', created_at: new Date(Date.now() - 7200000).toISOString() },
  { id: 'l4', source: 'classcharts', payload_type: 'behaviour',  records_received: 80,  records_upserted: 0,   status: 'error',   created_at: new Date(Date.now() - 86400000).toISOString() },
];

function timeAgo(iso: string | null): string {
  if (!iso) return 'Never';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Settings() {
  const { profile, signOut, demoMode, demoRole, setDemoRole } = useAuth();
  const currentRole = (profile as any)?.role || '';
  const canBroadcast = ['admin', 'slt', 'dsl'].includes(currentRole) || demoMode;

  const navigate = useNavigate();
  const { stripeRow, isSubscribed } = useSubscription();
  const [activeTab, setActiveTab] = useState<'profile' | 'school' | 'notifications' | 'security' | 'data' | 'broadcasts' | 'users' | 'demo' | 'billing'>('profile');
  const [billingLoading, setBillingLoading] = useState(false);
  const [billingError, setBillingError] = useState<string | null>(null);
  const [fullName, setFullName] = useState(profile?.full_name || '');
  const [saved, setSaved] = useState(false);
  const [dataMode, setDataMode] = useState<'csv' | 'connected'>('csv');

  // Broadcasts state
  const [bulletins, setBulletins] = useState<Bulletin[]>([]);
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [broadcastSeverity, setBroadcastSeverity] = useState<Bulletin['severity']>('info');
  const [broadcastSending, setBroadcastSending] = useState(false);
  const [broadcastError, setBroadcastError] = useState<string | null>(null);

  // Integrations state
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([]);
  const [integrationsLoading, setIntegrationsLoading] = useState(false);
  const [generatingKey, setGeneratingKey] = useState<string | null>(null);
  const [visibleKeys, setVisibleKeys] = useState<Set<string>>(new Set());
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // School verification state
  const [schoolRecord, setSchoolRecord] = useState<{
    name: string;
    urn: string | null;
    verification_status: string;
    domain_verified: boolean;
    la_name: string | null;
    phase: string | null;
    gias_name: string | null;
  } | null>(null);

  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/data-sync`;

  const loadBulletins = useCallback(async () => {
    if (demoMode) { setBulletins(getDemoBulletins()); return; }
    if (!profile?.school_id) return;
    const data = await getBulletins(profile.school_id);
    setBulletins(data);
  }, [demoMode, profile?.school_id]);

  useEffect(() => {
    if (activeTab === 'broadcasts') loadBulletins();
  }, [activeTab, loadBulletins]);

  async function sendBroadcast() {
    if (!broadcastMessage.trim()) return;
    setBroadcastSending(true);
    setBroadcastError(null);
    const createdBy = (profile as any)?.full_name || 'Staff';
    if (demoMode) {
      pushBulletin({
        id: `b-${Date.now()}`,
        message: broadcastMessage.trim(),
        severity: broadcastSeverity,
        created_at: new Date().toISOString(),
        created_by: createdBy,
      });
      setBulletins(getDemoBulletins());
    } else {
      if (!profile?.school_id) { setBroadcastSending(false); return; }
      const { error } = await createBulletin(profile.school_id, broadcastMessage.trim(), broadcastSeverity, createdBy);
      if (error) { setBroadcastError(error); setBroadcastSending(false); return; }
      await loadBulletins();
    }
    setBroadcastMessage('');
    setBroadcastSending(false);
  }

  async function removeBulletin(id: string) {
    const schoolId = demoMode ? null : (profile?.school_id ?? null);
    const role = (profile as any)?.role ?? '';
    const canDeleteForAll = demoMode || role === 'admin' || role === 'dsl';
    if (canDeleteForAll) {
      // Admin/DSL: permanently remove for all staff
      dismissBulletin(id);
      deleteBulletin(schoolId, id);
      setBulletins(prev => prev.filter(b => b.id !== id));
    } else {
      // Other roles: local dismiss only — stays for other staff
      setBulletins(prev => prev.filter(b => b.id !== id));
    }
  }

  const loadIntegrations = useCallback(async () => {
    if (demoMode) { setIntegrations(DEMO_INTEGRATIONS); setSyncLogs(DEMO_LOGS); return; }
    if (!profile?.school_id) return;
    setIntegrationsLoading(true);
    const [{ data: ints }, { data: logs }] = await Promise.all([
      supabase.from('integrations').select('*').eq('school_id', profile.school_id).order('system_name'),
      supabase.from('sync_logs').select('*').eq('school_id', profile.school_id).order('created_at', { ascending: false }).limit(20),
    ]);
    setIntegrations((ints as Integration[]) || []);
    setSyncLogs((logs as SyncLog[]) || []);
    setIntegrationsLoading(false);
  }, [demoMode, profile?.school_id]);

  useEffect(() => {
    if (activeTab === 'data') loadIntegrations();
  }, [activeTab, loadIntegrations]);

  useEffect(() => {
    if (activeTab !== 'school' || demoMode || !profile?.school_id) return;
    supabase
      .from('schools')
      .select('name, urn, verification_status, domain_verified, la_name, phase, gias_name')
      .eq('id', profile.school_id)
      .maybeSingle()
      .then(({ data }) => { if (data) setSchoolRecord(data as typeof schoolRecord); });
  }, [activeTab, profile?.school_id, demoMode]);

  function handleSave() {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function generateApiKey(systemName: string) {
    if (demoMode) return;
    if (!profile?.school_id) return;
    setGeneratingKey(systemName);
    const key = 'ss_' + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
    const { error } = await supabase.from('integrations').upsert(
      { school_id: profile.school_id, system_name: systemName, api_key: key, status: 'inactive', enabled: true },
      { onConflict: 'school_id,system_name' },
    );
    if (!error) {
      await loadIntegrations();
      setVisibleKeys(prev => new Set([...prev, systemName]));
    }
    setGeneratingKey(null);
  }

  async function revokeApiKey(integrationId: string, systemName: string) {
    if (demoMode) return;
    await supabase.from('integrations').delete().eq('id', integrationId);
    await loadIntegrations();
    setVisibleKeys(prev => { const n = new Set(prev); n.delete(systemName); return n; });
  }

  async function toggleEnabled(integration: Integration) {
    if (demoMode) {
      setIntegrations(prev => prev.map(i => i.id === integration.id ? { ...i, enabled: !i.enabled } : i));
      return;
    }
    await supabase.from('integrations').update({ enabled: !integration.enabled }).eq('id', integration.id);
    await loadIntegrations();
  }

  function copyToClipboard(text: string, id: string) {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function openBillingPortal() {
    setBillingLoading(true);
    setBillingError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('Not authenticated');
      const res = await fetch(`${SUPABASE_URL}/functions/v1/create-billing-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ return_url: window.location.origin + '/settings' }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to open billing portal');
      window.location.href = data.url;
    } catch (err: any) {
      setBillingError(err.message || 'Something went wrong');
    } finally {
      setBillingLoading(false);
    }
  }

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'school' as const, label: 'School', icon: School },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
    { id: 'security' as const, label: 'Security', icon: Lock },
    { id: 'data' as const, label: 'Data & Integrations', icon: Database },
    ...(canBroadcast ? [{ id: 'broadcasts' as const, label: 'Broadcasts', icon: Megaphone }] : []),
    ...(profile?.role === 'admin' ? [{ id: 'users' as const, label: 'User Management', icon: Users }] : []),
    ...(!demoMode ? [{ id: 'billing' as const, label: 'Billing', icon: CreditCard }] : []),
    ...(demoMode ? [{ id: 'demo' as const, label: 'Demo Mode', icon: Sliders }] : []),
  ];

  const toggleItem = (label: string, desc: string, defaultChecked: boolean) => (
    <div className="flex items-center justify-between p-5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
      <div>
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
      </div>
      <label className="relative inline-flex items-center cursor-pointer">
        <input type="checkbox" defaultChecked={defaultChecked} className="sr-only peer" />
        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-teal-600" />
      </label>
    </div>
  );

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Manage your account, school configuration and preferences.</p>
      </div>

      <div className="flex gap-6 items-start">
        {/* Tab sidebar */}
        <div className="w-52 shrink-0 space-y-1">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === tab.id ? 'bg-teal-50 text-teal-700 shadow-sm' : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'}`}
              >
                <Icon className={`w-4 h-4 ${activeTab === tab.id ? 'text-teal-600' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content panel */}
        <div className="flex-1 card-premium p-8">

          {/* ── Profile ── */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div className="flex items-center gap-4 pb-6 border-b border-slate-100">
                <div className="w-16 h-16 rounded-2xl bg-teal-100 flex items-center justify-center text-teal-700 font-bold text-2xl">
                  {(profile?.full_name || 'U').charAt(0).toUpperCase()}
                </div>
                <div>
                  <div className="text-xl font-bold text-slate-900">{profile?.full_name || 'Staff Member'}</div>
                  <div className="text-sm text-slate-500 mt-0.5 capitalize">{profile?.role || 'Staff'}</div>
                </div>
              </div>
              <h2 className="text-base font-semibold text-slate-800">Profile Settings</h2>
              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Full name</label>
                  <input type="text" value={fullName} onChange={(e) => setFullName(e.target.value)} className="input-premium" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Email</label>
                  <input type="email" disabled className="input-premium bg-slate-50 text-slate-500" placeholder="Managed via authentication" />
                  <p className="text-xs text-slate-500 mt-2">Email is managed through your authentication provider.</p>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Role</label>
                  <input type="text" value={profile?.role || 'Staff'} disabled className="input-premium bg-slate-50 text-slate-500" />
                </div>
              </div>
              <div className="flex items-center gap-3 pt-6 border-t border-slate-100">
                <button onClick={handleSave} className="btn-primary">
                  <Save className="w-4 h-4" />Save changes
                </button>
                {saved && <div className="flex items-center gap-1.5 text-sm text-emerald-600"><CheckCircle className="w-4 h-4" />Saved</div>}
              </div>
            </div>
          )}

          {/* ── School ── */}
          {activeTab === 'school' && (
            <div className="space-y-6">
              <h2 className="text-base font-semibold text-slate-800">School Settings</h2>

              {/* Verification status card */}
              {(() => {
                const status = demoMode ? 'verified' : (schoolRecord?.verification_status ?? null);
                const urn = demoMode ? null : schoolRecord?.urn;
                const giasName = demoMode ? null : schoolRecord?.gias_name;
                const laName = demoMode ? null : schoolRecord?.la_name;
                const phase = demoMode ? null : schoolRecord?.phase;
                const domainVerif = demoMode ? true : (schoolRecord?.domain_verified ?? false);

                const STATUS_CFG = {
                  verified:        { icon: BadgeCheck, bg: 'bg-emerald-50', border: 'border-emerald-200', iconColor: 'text-emerald-600', label: 'Verified', sub: 'Your school has been fully verified on the DfE register.', labelClass: 'bg-emerald-100 text-emerald-700' },
                  urn_verified:    { icon: BadgeCheck, bg: 'bg-emerald-50', border: 'border-emerald-200', iconColor: 'text-emerald-600', label: 'URN Verified', sub: 'Confirmed against the DfE GIAS register.', labelClass: 'bg-emerald-100 text-emerald-700' },
                  domain_verified: { icon: CheckCircle, bg: 'bg-teal-50', border: 'border-teal-200', iconColor: 'text-teal-600', label: 'Domain Verified', sub: 'Verified via .sch.uk / .ac.uk email domain.', labelClass: 'bg-teal-100 text-teal-700' },
                  pending:         { icon: HelpCircle, bg: 'bg-amber-50', border: 'border-amber-200', iconColor: 'text-amber-500', label: 'Pending Verification', sub: 'Our team will verify your school within 1–2 working days.', labelClass: 'bg-amber-100 text-amber-700' },
                  manual_review:   { icon: HelpCircle, bg: 'bg-amber-50', border: 'border-amber-200', iconColor: 'text-amber-500', label: 'Under Review', sub: 'Your school is being reviewed manually by our team.', labelClass: 'bg-amber-100 text-amber-700' },
                  rejected:        { icon: AlertTriangle, bg: 'bg-red-50', border: 'border-red-200', iconColor: 'text-red-500', label: 'Rejected', sub: 'Verification was unsuccessful. Contact support.', labelClass: 'bg-red-100 text-red-700' },
                };
                const cfg = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.pending;
                const Icon = cfg.icon;

                return (
                  <div className={`rounded-2xl border ${cfg.border} ${cfg.bg} p-5`}>
                    <div className="flex items-start gap-4">
                      <div className={`w-10 h-10 rounded-xl bg-white/70 flex items-center justify-center shrink-0 border ${cfg.border}`}>
                        <Icon className={`w-5 h-5 ${cfg.iconColor}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-bold text-slate-900">School Verification</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${cfg.labelClass}`}>{cfg.label}</span>
                        </div>
                        <p className="text-xs text-slate-600 mb-3">{cfg.sub}</p>
                        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-2">
                          {(urn || demoMode) && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-700">
                              <Hash className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-medium">URN:</span>
                              <span className="text-slate-500">{demoMode ? '123456 (demo)' : urn}</span>
                            </div>
                          )}
                          {giasName && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-700 col-span-2">
                              <BadgeCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                              <span className="font-medium">DfE name:</span>
                              <span className="text-slate-500">{giasName}</span>
                            </div>
                          )}
                          {laName && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-700">
                              <School className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-medium">LA:</span>
                              <span className="text-slate-500">{laName}</span>
                            </div>
                          )}
                          {phase && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-700">
                              <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="font-medium">Phase:</span>
                              <span className="text-slate-500 capitalize">{phase}</span>
                            </div>
                          )}
                          {domainVerif && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-700">
                              <CheckCircle className="w-3.5 h-3.5 text-teal-400 shrink-0" />
                              <span className="text-slate-500">.sch.uk / .ac.uk domain confirmed</span>
                            </div>
                          )}
                        </div>
                        {status === 'pending' && !urn && (
                          <p className="mt-3 text-xs text-amber-700">
                            Speed up verification by providing your{' '}
                            <a href="https://get-information-schools.service.gov.uk" target="_blank" rel="noopener noreferrer" className="underline font-medium">DfE URN</a>.
                            Contact <a href="mailto:hello@studentsignal.co.uk" className="underline font-medium">hello@studentsignal.co.uk</a> to update it.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })()}

              <div className="space-y-5">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">School name</label>
                  <input type="text" defaultValue="Oakwood Academy" disabled className="input-premium bg-slate-50 text-slate-500" />
                  <p className="text-xs text-slate-500 mt-2">Contact support to change your school name.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Attendance target (%)</label>
                    <input type="number" defaultValue={95} className="input-premium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Behaviour threshold (points)</label>
                    <input type="number" defaultValue={20} className="input-premium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Red threshold (points)</label>
                    <input type="number" defaultValue={35} className="input-premium" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">Amber threshold (points)</label>
                    <input type="number" defaultValue={15} className="input-premium" />
                  </div>
                </div>
              </div>
              <div className="pt-6 border-t border-slate-100">
                <button onClick={handleSave} className="btn-primary"><Save className="w-4 h-4" />Save school settings</button>
              </div>
            </div>
          )}

          {/* ── Notifications ── */}
          {activeTab === 'notifications' && (
            <div className="space-y-6">
              <h2 className="text-base font-semibold text-slate-800">Notification Preferences</h2>
              <div className="space-y-3">
                {toggleItem('Red priority alerts', 'Get notified when a student moves to red priority', true)}
                {toggleItem('Intervention reminders', 'Daily digest of upcoming due interventions', true)}
                {toggleItem('Weekly report', 'Receive the executive summary every Monday', false)}
                {toggleItem('Safeguarding alerts', 'Immediate alert for any safeguarding note', true)}
                {toggleItem('Attendance drops', 'Alert when a student attendance falls below target', true)}
                {toggleItem('New uploads processed', 'Notify when CSV analysis is complete', false)}
                {toggleItem('Live sync events', 'Notify when an external system posts new data', false)}
              </div>
            </div>
          )}

          {/* ── Security ── */}
          {activeTab === 'security' && (
            <div className="space-y-6">
              <h2 className="text-base font-semibold text-slate-800">Security</h2>
              <div className="space-y-4">
                <div className="p-5 rounded-xl border border-slate-200">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center"><Lock className="w-4 h-4 text-slate-600" /></div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800 mb-1">Password</div>
                      <div className="text-xs text-slate-500 mb-3">Password is managed through Supabase Auth.</div>
                      <button className="btn-secondary py-2 text-xs">Reset password</button>
                    </div>
                  </div>
                </div>
                <div className="p-5 rounded-xl border border-slate-200">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-slate-50 flex items-center justify-center"><Shield className="w-4 h-4 text-slate-600" /></div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-slate-800 mb-1">Two-factor authentication</div>
                      <div className="text-xs text-slate-500 mb-3">Add an extra layer of security to your account.</div>
                      <button className="btn-secondary py-2 text-xs">Enable 2FA</button>
                    </div>
                  </div>
                </div>
                <div className="p-5 rounded-xl border border-red-200 bg-red-50">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center"><Lock className="w-4 h-4 text-red-600" /></div>
                    <div className="flex-1">
                      <div className="text-sm font-semibold text-red-800 mb-1">Sign out</div>
                      <div className="text-xs text-red-600 mb-3">Sign out from your account on this device.</div>
                      <button onClick={signOut} className="px-4 py-2 rounded-xl border border-red-200 text-sm font-semibold text-red-600 hover:bg-white transition-colors">Sign out</button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── Data & Integrations ── */}
          {activeTab === 'data' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-semibold text-slate-800">Data &amp; Integrations</h2>
                  <p className="text-sm text-slate-500 mt-1">Bring data in via CSV upload or configure live API sync from your MIS.</p>
                </div>
                {activeTab === 'data' && (
                  <button onClick={loadIntegrations} className="p-2 rounded-lg hover:bg-slate-100 transition-colors" title="Refresh">
                    <RefreshCw className={`w-4 h-4 text-slate-500 ${integrationsLoading ? 'animate-spin' : ''}`} />
                  </button>
                )}
              </div>

              {/* Mode toggle */}
              <div className="grid sm:grid-cols-2 gap-4">
                <button onClick={() => setDataMode('csv')} className={`text-left p-5 rounded-xl border-2 transition-all ${dataMode === 'csv' ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-200' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${dataMode === 'csv' ? 'bg-teal-100' : 'bg-slate-100'}`}>
                      <Upload className={`w-4 h-4 ${dataMode === 'csv' ? 'text-teal-600' : 'text-slate-500'}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 text-sm">CSV Import</span>
                        {dataMode === 'csv' && <CheckSquare className="w-4 h-4 text-teal-600" />}
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Upload exported files from your MIS on demand. Simple, no configuration needed.</p>
                    </div>
                  </div>
                </button>

                <button onClick={() => setDataMode('connected')} className={`text-left p-5 rounded-xl border-2 transition-all ${dataMode === 'connected' ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-200' : 'border-slate-200 hover:border-slate-300'}`}>
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${dataMode === 'connected' ? 'bg-teal-100' : 'bg-slate-100'}`}>
                      <Link2 className={`w-4 h-4 ${dataMode === 'connected' ? 'text-teal-600' : 'text-slate-500'}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800 text-sm">Live Sync</span>
                        {dataMode === 'connected' && <CheckSquare className="w-4 h-4 text-teal-600" />}
                        <span className="text-[10px] font-bold bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full">Active</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">Your MIS pushes data automatically — no manual exports required.</p>
                    </div>
                  </div>
                </button>
              </div>

              {/* CSV mode */}
              {dataMode === 'csv' && (
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-sm text-slate-600">
                  <p className="font-medium text-slate-800 mb-1">CSV Import mode</p>
                  <p className="text-xs text-slate-500 mb-3">Upload behaviour, attendance and student exports from ClassCharts, Arbor, SIMS, Bromcom or any CSV.</p>
                  <a href="/upload" className="inline-flex items-center gap-1.5 text-xs font-medium text-teal-600 hover:text-teal-700">
                    <Upload className="w-3.5 h-3.5" />Go to Upload CSV
                  </a>
                </div>
              )}

              {/* Live sync mode */}
              {dataMode === 'connected' && (
                <div className="space-y-5">

                  {/* Webhook URL */}
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                    <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Your webhook endpoint</div>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-xs bg-white border border-slate-200 rounded-lg px-3 py-2 text-slate-700 font-mono truncate">
                        {webhookUrl}
                      </code>
                      <button
                        onClick={() => copyToClipboard(webhookUrl, 'webhook')}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:border-teal-400 hover:text-teal-600 transition-colors shrink-0"
                      >
                        {copiedId === 'webhook' ? <CheckCircle className="w-3.5 h-3.5 text-teal-500" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedId === 'webhook' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">POST JSON to this URL with <code className="bg-white px-1 rounded">Authorization: Bearer &lt;api_key&gt;</code> — see docs for payload format.</p>
                  </div>

                  {/* Per-system cards */}
                  <div className="space-y-3">
                    {MIS_SYSTEMS.map((sys) => {
                      const existing = integrations.find(i => i.system_name === sys.name);
                      const isKeyVisible = visibleKeys.has(sys.name) || demoMode;
                      const statusColor = existing?.status === 'active' ? 'text-emerald-600 bg-emerald-50 border-emerald-200'
                        : existing?.status === 'error' ? 'text-red-600 bg-red-50 border-red-200'
                        : 'text-slate-500 bg-slate-100 border-slate-200';

                      return (
                        <div key={sys.name} className={`rounded-xl border p-4 transition-colors ${existing?.enabled === false ? 'opacity-60' : ''} ${existing?.status === 'error' ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}>
                          <div className="flex items-start gap-3">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${existing ? 'bg-teal-50' : 'bg-slate-100'}`}>
                              {existing ? (
                                existing.status === 'active' ? <Wifi className="w-4 h-4 text-teal-600" /> :
                                existing.status === 'error' ? <AlertTriangle className="w-4 h-4 text-red-500" /> :
                                <WifiOff className="w-4 h-4 text-slate-400" />
                              ) : (
                                <Circle className="w-4 h-4 text-slate-300" />
                              )}
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap mb-1">
                                <span className="text-sm font-semibold text-slate-800">{sys.label}</span>
                                {existing && (
                                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold border ${statusColor}`}>
                                    {existing.status === 'active' ? 'Connected' : existing.status === 'error' ? 'Error' : 'Inactive'}
                                  </span>
                                )}
                              </div>
                              <p className="text-xs text-slate-500 mb-2">{sys.desc}</p>

                              {/* Data types */}
                              <div className="flex gap-1 flex-wrap mb-2">
                                {sys.dataTypes.map(t => (
                                  <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium">{t}</span>
                                ))}
                              </div>

                              {/* Stats row */}
                              {existing && (
                                <div className="flex items-center gap-4 text-xs text-slate-400 mb-3">
                                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />Last sync: {timeAgo(existing.last_sync_at)}</span>
                                  <span className="flex items-center gap-1"><Activity className="w-3 h-3" />{existing.sync_count} syncs</span>
                                  <span>{existing.records_synced.toLocaleString()} records</span>
                                </div>
                              )}

                              {/* Error */}
                              {existing?.error_message && (
                                <div className="flex items-start gap-1.5 p-2 rounded-lg bg-red-50 border border-red-200 mb-3">
                                  <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                                  <p className="text-xs text-red-700">{existing.error_message}</p>
                                </div>
                              )}

                              {/* API Key */}
                              {existing && (
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
                                    <code className="text-xs text-slate-600 font-mono truncate flex-1">
                                      {isKeyVisible ? existing.api_key : existing.api_key.slice(0, 10) + '••••••••••••'}
                                    </code>
                                    <button
                                      onClick={() => setVisibleKeys(prev => { const n = new Set(prev); n.has(sys.name) ? n.delete(sys.name) : n.add(sys.name); return n; })}
                                      className="text-slate-400 hover:text-slate-600 transition-colors shrink-0"
                                    >
                                      {isKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                                    </button>
                                  </div>
                                  <button
                                    onClick={() => copyToClipboard(existing.api_key, existing.id)}
                                    className="p-1.5 rounded-lg border border-slate-200 hover:border-teal-400 transition-colors"
                                    title="Copy key"
                                  >
                                    {copiedId === existing.id ? <CheckCircle className="w-3.5 h-3.5 text-teal-500" /> : <Copy className="w-3.5 h-3.5 text-slate-500" />}
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Actions */}
                            <div className="flex items-center gap-2 shrink-0">
                              {existing ? (
                                <>
                                  <button
                                    onClick={() => toggleEnabled(existing)}
                                    title={existing.enabled ? 'Disable' : 'Enable'}
                                    className="p-1.5 rounded-lg border border-slate-200 hover:border-amber-400 transition-colors"
                                  >
                                    {existing.enabled
                                      ? <Wifi className="w-3.5 h-3.5 text-teal-500" />
                                      : <WifiOff className="w-3.5 h-3.5 text-slate-400" />
                                    }
                                  </button>
                                  <button
                                    onClick={() => revokeApiKey(existing.id, sys.name)}
                                    title="Revoke key"
                                    className="p-1.5 rounded-lg border border-slate-200 hover:border-red-400 hover:text-red-500 transition-colors text-slate-400"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => generateApiKey(sys.name)}
                                  disabled={!!generatingKey}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-teal-300 bg-teal-50 text-teal-700 text-xs font-semibold hover:bg-teal-100 transition-colors disabled:opacity-50"
                                >
                                  {generatingKey === sys.name
                                    ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    : <Plus className="w-3.5 h-3.5" />
                                  }
                                  {generatingKey === sys.name ? 'Generating…' : 'Generate key'}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Payload format docs */}
                  <details className="group rounded-xl border border-slate-200 overflow-hidden">
                    <summary className="flex items-center justify-between px-4 py-3 bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 hover:bg-slate-100 transition-colors list-none">
                      <span>Payload format &amp; examples</span>
                      <span className="text-xs text-slate-400 group-open:hidden">Show</span>
                      <span className="text-xs text-slate-400 hidden group-open:block">Hide</span>
                    </summary>
                    <div className="p-4 space-y-4">
                      <p className="text-xs text-slate-500">POST JSON to the webhook URL. Set <code className="bg-slate-100 px-1 rounded">payload_type</code> to one of: <strong>students</strong>, <strong>behaviour</strong>, <strong>attendance</strong>, <strong>safeguarding</strong>.</p>
                      <pre className="text-xs bg-slate-900 text-emerald-300 rounded-xl p-4 overflow-x-auto leading-relaxed">{`POST ${webhookUrl}
Authorization: Bearer ss_your_api_key
Content-Type: application/json

{
  "payload_type": "behaviour",
  "records": [
    {
      "student_name": "Oliver Brown",
      "year_group": "Year 10",
      "date": "2026-07-06",
      "incident_type": "Disruption",
      "points": 3,
      "subject": "Maths"
    }
  ]
}`}
                      </pre>
                      <p className="text-xs text-slate-400">For <strong>attendance</strong>, include <code className="bg-slate-100 px-1 rounded">attendance_pct</code> (0–100) per student. For <strong>safeguarding</strong>, include <code className="bg-slate-100 px-1 rounded">note</code>, <code className="bg-slate-100 px-1 rounded">concern_level</code> (1–5), and <code className="bg-slate-100 px-1 rounded">staff_member</code>.</p>
                    </div>
                  </details>

                  {/* Sync log */}
                  {syncLogs.length > 0 && (
                    <div>
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Recent sync activity</div>
                      <div className="rounded-xl border border-slate-200 overflow-hidden">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200">
                              {['Source', 'Type', 'Received', 'Upserted', 'Status', 'When'].map(h => (
                                <th key={h} className="px-3 py-2 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {syncLogs.map(log => (
                              <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-2 font-medium text-slate-700 capitalize">{log.source}</td>
                                <td className="px-3 py-2 text-slate-500">{log.payload_type}</td>
                                <td className="px-3 py-2 text-slate-600">{log.records_received}</td>
                                <td className="px-3 py-2 text-slate-600">{log.records_upserted}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-2 py-0.5 rounded-full font-semibold ${
                                    log.status === 'success' ? 'bg-emerald-50 text-emerald-700' :
                                    log.status === 'partial' ? 'bg-amber-50 text-amber-700' :
                                    'bg-red-50 text-red-700'
                                  }`}>{log.status}</span>
                                </td>
                                <td className="px-3 py-2 text-slate-400">{timeAgo(log.created_at)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Broadcasts ── */}
          {activeTab === 'broadcasts' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-teal-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Staff Broadcasts</h2>
                  <p className="text-xs text-slate-500">Send urgent alerts and reminders to all staff — they appear as banners at the top of every page.</p>
                </div>
              </div>

              {/* Compose */}
              <div className="space-y-4">
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider">Compose broadcast</label>

                {/* Severity picker */}
                <div className="grid grid-cols-3 gap-2">
                  {(['urgent', 'warning', 'info'] as const).map((sev) => {
                    const styles = {
                      urgent:  { base: 'border-red-300 bg-red-50 text-red-700 ring-red-200',    active: 'border-red-500 ring-2',   dot: 'bg-red-500',    label: 'Urgent' },
                      warning: { base: 'border-amber-300 bg-amber-50 text-amber-700 ring-amber-200', active: 'border-amber-500 ring-2', dot: 'bg-amber-500',  label: 'Warning' },
                      info:    { base: 'border-blue-300 bg-blue-50 text-blue-700 ring-blue-200',  active: 'border-blue-500 ring-2',  dot: 'bg-blue-500',   label: 'Info' },
                    }[sev];
                    return (
                      <button
                        key={sev}
                        onClick={() => setBroadcastSeverity(sev)}
                        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-semibold transition-all ${styles.base} ${broadcastSeverity === sev ? styles.active : 'opacity-60 hover:opacity-80'}`}
                      >
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${styles.dot}`} />
                        {styles.label}
                        {broadcastSeverity === sev && <CheckSquare className="w-3.5 h-3.5 ml-auto" />}
                      </button>
                    );
                  })}
                </div>

                {/* Preview strip */}
                {broadcastMessage.trim() && (
                  <div className={`flex items-start gap-2 px-4 py-2.5 rounded-xl text-sm font-medium ${
                    broadcastSeverity === 'urgent' ? 'bg-red-600 text-white' :
                    broadcastSeverity === 'warning' ? 'bg-amber-500 text-white' :
                    'bg-blue-600 text-white'
                  }`}>
                    {broadcastSeverity === 'info'
                      ? <Info className="w-4 h-4 shrink-0 mt-0.5" />
                      : <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />}
                    <span className="flex-1">{broadcastMessage.trim()}</span>
                    <span className="opacity-75 text-xs font-normal ml-2">— {(profile as any)?.full_name || 'You'}</span>
                  </div>
                )}

                <textarea
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  rows={3}
                  placeholder="Type your message here… e.g. Reminder: All safeguarding concerns must be logged in CPOMS by end of day."
                  className="input-premium resize-none"
                />

                {broadcastError && (
                  <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
                    <AlertTriangle className="w-4 h-4 shrink-0" />{broadcastError}
                  </div>
                )}

                <button
                  onClick={sendBroadcast}
                  disabled={!broadcastMessage.trim() || broadcastSending}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {broadcastSending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  {broadcastSending ? 'Sending…' : 'Send to all staff'}
                </button>
              </div>

              {/* Active broadcasts */}
              <div>
                <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">
                  Active broadcasts ({bulletins.length})
                </div>
                {bulletins.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 text-sm border border-dashed border-slate-200 rounded-xl">
                    No active broadcasts — all clear.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {bulletins.map((b) => (
                      <div key={b.id} className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 hover:border-slate-300 transition-colors">
                        <span className={`mt-0.5 w-2.5 h-2.5 rounded-full shrink-0 ${
                          b.severity === 'urgent' ? 'bg-red-500' :
                          b.severity === 'warning' ? 'bg-amber-400' : 'bg-blue-500'
                        }`} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-800">{b.message}</p>
                          <p className="text-xs text-slate-400 mt-1">
                            {b.created_by} · {timeAgo(b.created_at)}
                          </p>
                        </div>
                        {(currentRole === 'admin' || currentRole === 'dsl' || demoMode) ? (
                          <button onClick={() => removeBulletin(b.id)} className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors" title="Remove broadcast for all staff"><Trash2 className="w-3.5 h-3.5" /></button>
                        ) : (
                          <button onClick={() => removeBulletin(b.id)} className="shrink-0 p-1.5 rounded-lg text-slate-400 hover:text-slate-500 hover:bg-slate-50 transition-colors" title="Dismiss from my view"><X className="w-3.5 h-3.5" /></button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Users ── */}
          {activeTab === 'users' && (
            <div className="space-y-2 -mx-8 -my-8">
              <div className="px-8 pt-8">
                <UserManagement />
              </div>
            </div>
          )}

          {/* ── Demo ── */}
          {activeTab === 'demo' && (
            <div className="space-y-6">
              <div className="flex items-center gap-3 pb-5 border-b border-slate-100">
                <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
                  <Sliders className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h2 className="text-base font-bold text-slate-900">Demo Mode</h2>
                  <p className="text-xs text-slate-500">Switch roles to preview how different staff see the system.</p>
                </div>
                <span className="ml-auto text-xs font-bold bg-amber-100 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">Active</span>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-3">Current demo role</label>
                <div className="grid sm:grid-cols-2 gap-2.5">
                  {(ASSIGNABLE_ROLES as AppRole[]).concat(['teacher', 'trust', 'staff'] as AppRole[]).map((role) => {
                    const isSelected = demoRole === role;
                    return (
                      <button
                        key={role}
                        onClick={() => setDemoRole(role)}
                        className={`flex items-center gap-3 px-4 py-3 rounded-xl border-2 text-left transition-all ${
                          isSelected ? 'border-teal-500 bg-teal-50 ring-2 ring-teal-200' : 'border-slate-200 hover:border-teal-300 hover:bg-slate-50'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? 'bg-teal-100' : 'bg-slate-100'}`}>
                          <User className={`w-4 h-4 ${isSelected ? 'text-teal-600' : 'text-slate-500'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className={`text-sm font-semibold ${isSelected ? 'text-teal-800' : 'text-slate-800'}`}>{ROLE_LABELS[role]}</div>
                          <div className="text-xs text-slate-400 truncate">{role}</div>
                        </div>
                        {isSelected && <CheckSquare className="w-4 h-4 text-teal-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
                <p className="text-xs text-slate-400 mt-3">
                  Changing role takes effect immediately. Navigation and note visibility will update to reflect the selected role's permissions.
                </p>
              </div>
            </div>
          )}

          {/* ── Billing ── */}
          {activeTab === 'billing' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Billing &amp; subscription</h2>
                <p className="text-sm text-slate-500 mt-1">Manage your plan and payment details.</p>
              </div>

              {/* Current plan card */}
              <div className={`rounded-2xl border p-6 ${isSubscribed ? 'bg-teal-50 border-teal-200' : 'bg-amber-50 border-amber-200'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isSubscribed ? 'bg-teal-100' : 'bg-amber-100'}`}>
                      {stripeRow?.price_id && getProductByPriceId(stripeRow.price_id)?.tier === 'schools' ? <BookOpen className={`w-5 h-5 ${isSubscribed ? 'text-teal-700' : 'text-amber-700'}`} /> : <Zap className={`w-5 h-5 ${isSubscribed ? 'text-teal-700' : 'text-amber-700'}`} />}
                    </div>
                    <div>
                      <div className={`text-sm font-bold ${isSubscribed ? 'text-teal-900' : 'text-amber-900'}`}>
                        {stripeRow ? (getProductByPriceId(stripeRow.price_id ?? '')?.name ?? 'Active subscription') : 'No active subscription'}
                      </div>
                      <div className={`text-xs mt-0.5 ${isSubscribed ? 'text-teal-700' : 'text-amber-700'}`}>
                        {stripeRow ? (
                          <>
                            Status: <span className="font-semibold capitalize">{stripeRow.subscription_status}</span>
                            {stripeRow.current_period_end && (
                              <> &middot; Renews {new Date(stripeRow.current_period_end * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</>
                            )}
                          </>
                        ) : 'Subscribe to unlock the full dashboard'}
                      </div>
                    </div>
                  </div>
                  {isSubscribed && (
                    <span className="text-[10px] font-bold bg-teal-200 text-teal-800 px-2.5 py-1 rounded-full uppercase tracking-widest">Active</span>
                  )}
                </div>
              </div>

              {billingError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-3 rounded-xl">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {billingError}
                </div>
              )}

              {/* Actions */}
              <div className="space-y-3">
                {isSubscribed ? (
                  <button
                    onClick={openBillingPortal}
                    disabled={billingLoading}
                    className="w-full flex items-center justify-between px-5 py-4 rounded-xl border border-slate-200 hover:border-teal-300 hover:bg-teal-50/50 transition-all group disabled:opacity-60"
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5 text-slate-400 group-hover:text-teal-600" />
                      <div className="text-left">
                        <div className="text-sm font-semibold text-slate-800">Manage billing</div>
                        <div className="text-xs text-slate-500">Update payment method, view invoices, cancel subscription</div>
                      </div>
                    </div>
                    {billingLoading ? (
                      <svg className="w-4 h-4 animate-spin text-teal-600" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                    ) : (
                      <ExternalLink className="w-4 h-4 text-slate-400 group-hover:text-teal-600" />
                    )}
                  </button>
                ) : (
                  <button
                    onClick={() => navigate('/pricing')}
                    className="w-full flex items-center justify-between px-5 py-4 rounded-xl border border-teal-200 bg-teal-50 hover:bg-teal-100 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <CreditCard className="w-5 h-5 text-teal-600" />
                      <div className="text-left">
                        <div className="text-sm font-bold text-teal-800">View plans &amp; subscribe</div>
                        <div className="text-xs text-teal-600">Choose a plan to unlock full access</div>
                      </div>
                    </div>
                    <ExternalLink className="w-4 h-4 text-teal-600" />
                  </button>
                )}
              </div>

              <p className="text-xs text-slate-400 leading-relaxed">
                Payments are processed securely by Stripe. Student Signal does not store your card details. For billing queries, contact{' '}
                <a href="mailto:billing@studentsignal.co.uk" className="text-teal-700 hover:underline">billing@studentsignal.co.uk</a>.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

