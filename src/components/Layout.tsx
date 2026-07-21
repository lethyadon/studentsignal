import { useState, useEffect, Component, type ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { PriorityBarProvider, usePriorityBar } from '../context/PriorityBarContext';
import { getStudents, getDemoBulletins, subscribeToBulletins, getBulletins, deleteBulletin, type Bulletin } from '../lib/data';
import { supabase } from '../lib/supabase';
import type { Student } from '../types';
import QuickNoteModal from './QuickNoteModal';
import QuickLogModal from './QuickLogModal';
import NotificationCenter, { useNotificationCount } from './NotificationCenter';
import DemoGuide from './DemoGuide';
import { getNavPermissions, ROLE_LABELS } from '../lib/permissions';
import { SubscriptionBadge } from './subscription/SubscriptionBadge';
import { SignalMark } from './Logo';
import { useSubscription } from '../context/SubscriptionContext';
import { useGodMode } from '../context/GodModeContext';
import {
  Home, Upload, Layers, Users, ClipboardList, FileText,
  Settings, LogOut, Menu, X, Shield, ChevronRight, Star,
  StickyNote, Plus, Bell, MessageCircle, TrendingUp, AlertTriangle, Info, Phone, GraduationCap,
  Building2, BadgeCheck, CreditCard, Lock, BarChart2,
} from 'lucide-react';

class DemoGuideErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

const ROLE_LABEL: Record<string, string> = {
  ...ROLE_LABELS,
  admin: 'Admin',
  slt: 'Senior Leader',
};

interface NavItem {
  path: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  indicator?: boolean;
  schoolOnly?: boolean;
}

const navItems: NavItem[] = [
  { path: '/dashboard', label: 'Morning Briefing', icon: Home },
  { path: '/signal-queue', label: 'Signal Queue', icon: Layers, permission: 'showSignalQueue' },
  { path: '/analysis', label: 'Students', icon: Users },
  { path: '/interventions', label: 'Actions', icon: ClipboardList },
  { path: '/communications', label: 'Communications', icon: MessageCircle, permission: 'showCommunications' },
  { path: '/careers', label: 'Careers', icon: GraduationCap, permission: 'showCareers', schoolOnly: true },
  { path: '/success-stories', label: 'Successes', icon: Star, schoolOnly: true },
  { path: '/reports', label: 'Reports', icon: FileText, permission: 'showReports' },
  { path: '/staff-development', label: 'Staff Insights', icon: TrendingUp, permission: 'showStaffDevelopment', schoolOnly: true },
  { path: '/intelligence', label: 'School Intelligence', icon: BarChart2 },
];

const secondaryItems: NavItem[] = [
  { path: '/upload', label: 'Upload CSV', icon: Upload, permission: 'showUpload' },
  { path: '/user-management', label: 'Manage Users', icon: Users },
  { path: '/settings', label: 'Settings', icon: Settings },
  { path: '/pricing', label: 'Plans & Billing', icon: CreditCard, indicator: true },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <PriorityBarProvider>
      <LayoutInner>{children}</LayoutInner>
    </PriorityBarProvider>
  );
}

function LayoutInner({ children }: { children: React.ReactNode }) {
  const { signOut, profile, demoMode, isSuperAdmin } = useAuth();
  const { effectivePlanName } = useSubscription();
  const { godSchoolId, activeSchoolName } = useGodMode();
  const { notifCount: legacyNotifCount } = usePriorityBar();
  const realNotifCount = useNotificationCount();
  // Super admins without an active school override have no school context — suppress the
  // legacy count (which reads mock data) and only show real Supabase notification rows.
  const notifCount = isSuperAdmin && !godSchoolId && !demoMode
    ? realNotifCount
    : (realNotifCount || legacyNotifCount);
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [showQuickLog, setShowQuickLog] = useState(false);
  const [students, setStudents] = useState<Student[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [bulletins, setBulletins] = useState<Bulletin[]>(() => demoMode ? getDemoBulletins() : []);

  useEffect(() => {
    if (demoMode) {
      setBulletins(getDemoBulletins());
      return subscribeToBulletins(() => setBulletins(getDemoBulletins()));
    }
    const schoolId = profile?.school_id;
    if (!schoolId) return;
    getBulletins(schoolId).then(setBulletins);
    const channel = supabase
      .channel('bulletins-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bulletins', filter: `school_id=eq.${schoolId}` }, () => {
        getBulletins(schoolId).then(setBulletins);
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [demoMode, profile?.school_id]);

  const navPerms = getNavPermissions(profile?.role);

  function isNavVisible(item: NavItem): boolean {
    if (!item.permission) return true;
    return (navPerms as Record<string, boolean>)[item.permission] ?? true;
  }
  async function openQuickNote() {
    const effectiveSchoolId = demoMode ? null : profile?.school_id;
    if (students.length === 0) {
      const s = await getStudents(effectiveSchoolId);
      setStudents(s);
    }
    setShowQuickNote(true);
  }

  async function openQuickLog() {
    const effectiveSchoolId = demoMode ? null : profile?.school_id;
    if (students.length === 0) {
      const s = await getStudents(effectiveSchoolId);
      setStudents(s);
    }
    setShowQuickLog(true);
  }

  const isActive = (path: string) => {
    if (path === '/analysis') return location.pathname === '/analysis' || location.pathname.startsWith('/students/');
    if (path === '/signal-queue') return location.pathname === '/signal-queue';
    return location.pathname === path;
  };

  const isStarterUser = !demoMode && !isSuperAdmin && effectivePlanName === 'starter';
  // Super admin shows restricted platform-only nav only when NOT viewing a specific school
  const showPlatformNav = isSuperAdmin && !godSchoolId;
  // GodModeBar renders when isSuperAdmin && user && !demoMode — sidebar must offset for it
  const godBarVisible = isSuperAdmin && !!profile && !demoMode;

  function NavLink({ item, onClick }: { item: typeof navItems[0]; onClick?: () => void }) {
    const active = isActive(item.path);
    const Icon = item.icon;
    const locked = isStarterUser && !!item.schoolOnly;
    return (
      <Link
        to={item.path}
        onClick={onClick}
        data-tour={item.path === '/dashboard' ? 'nav-dashboard' : item.path === '/signal-queue' ? 'nav-signal-queue' : item.path === '/reports' ? 'nav-reports' : undefined}
        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
          active
            ? 'bg-teal-50 text-teal-700'
            : locked
            ? 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
            : 'text-slate-500 hover:bg-slate-50 hover:text-slate-800'
        }`}
      >
        <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-teal-600' : locked ? 'text-slate-300' : 'text-slate-400'}`} />
        <span className="flex-1">{item.label}</span>
        {active && <ChevronRight className="w-4 h-4 text-teal-400" />}
        {!active && locked && <Lock className="w-3 h-3 text-slate-300" />}
        {!active && !locked && item.indicator && (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-teal-500" />
          </span>
        )}
      </Link>
    );
  }

  return (
    <div className={`min-h-screen bg-slate-50 flex flex-col ${godBarVisible ? 'pt-10' : ''}`}>
      <div className="flex flex-1">
      {/* Desktop sidebar */}
      <aside
        className="hidden lg:flex flex-col w-60 bg-white border-r border-slate-200 fixed z-40 overflow-y-auto"
        style={{ top: godBarVisible ? 40 : 0, height: godBarVisible ? 'calc(100vh - 40px)' : '100vh' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-5 py-5 border-b border-slate-100">
          <SignalMark size={36} />
          <div>
            <span className="font-bold text-slate-900 text-base tracking-tight leading-tight">Student Signal</span>
            <div className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">Pastoral Intelligence</div>
          </div>
        </div>

        {/* Quick actions — hidden for platform-only super_admin */}
        <div className="px-3 pt-3 pb-1 space-y-1.5">
          {!showPlatformNav && (
            <>
              <button
                onClick={openQuickNote}
                data-tour="quick-note"
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-teal-600 text-white text-sm font-semibold hover:bg-teal-700 transition-colors shadow-sm"
              >
                <Plus className="w-4 h-4" />
                Quick Note
                <StickyNote className="w-3.5 h-3.5 ml-auto opacity-70" />
              </button>
              <button
                onClick={openQuickLog}
                className="w-full flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-semibold hover:bg-slate-900 transition-colors shadow-sm"
              >
                <Phone className="w-4 h-4" />
                Log Communication
                <MessageCircle className="w-3.5 h-3.5 ml-auto opacity-70" />
              </button>
            </>
          )}
          {showPlatformNav && (
            <div className="px-3 py-2.5 rounded-xl bg-slate-800 text-white text-xs font-bold tracking-wide flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" /> Platform Operations
            </div>
          )}
          {isSuperAdmin && godSchoolId && (
            <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs font-semibold flex items-center gap-2">
              <Shield className="w-3 h-3 shrink-0" />
              <span className="truncate">Viewing: {activeSchoolName}</span>
            </div>
          )}
        </div>

        {/* Primary nav */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
          {showPlatformNav ? (
            <>
              <NavLink item={{ path: '/platform-admin', label: 'School Registry', icon: Building2 }} />
              <div className="pt-3 border-t border-slate-100 mt-3 space-y-0.5">
                <NavLink item={{ path: '/settings', label: 'Settings', icon: Settings }} />
              </div>
            </>
          ) : (
            <>
              {navItems.filter(isNavVisible).map((item) => (
                <NavLink key={item.path} item={item} />
              ))}
              <div className="pt-3 border-t border-slate-100 mt-3 space-y-0.5">
                {secondaryItems.filter(isNavVisible).map((item) => (
                  <NavLink key={item.path} item={item} />
                ))}
                {isSuperAdmin && (
                  <NavLink item={{ path: '/platform-admin', label: 'Platform Admin', icon: Shield }} />
                )}
              </div>
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="px-4 py-4 border-t border-slate-100 space-y-2">
          {/* Notification bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotifications(!showNotifications)}
              data-tour="notifications"
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition-colors"
            >
              <div className="relative">
                <Bell className="w-4 h-4" />
                {notifCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                    {notifCount > 9 ? '9+' : notifCount}
                  </span>
                )}
              </div>
              <span>Notifications</span>
              {notifCount > 0 && (
                <span className="ml-auto text-xs font-bold text-red-500">{notifCount}</span>
              )}
            </button>
            {showNotifications && (
              <div className="fixed bottom-20 left-60 z-[60]">
                <NotificationCenter mobile onClose={() => setShowNotifications(false)} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 px-2 py-1.5">
            <div className="w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center text-teal-700 font-semibold text-xs shrink-0">
              {(profile?.full_name || 'U').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-slate-800 truncate">{profile?.full_name || 'Staff Member'}</div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <div className="text-xs text-slate-500">{ROLE_LABEL[profile?.role || ''] || profile?.role || 'Staff'}</div>
                {demoMode && (
                  <span className="text-[9px] font-bold bg-amber-100 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded-full">DEMO</span>
                )}
                {!demoMode && <SubscriptionBadge />}
              </div>
            </div>
          </div>
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-50 hover:text-slate-800 w-full transition-colors"
          >
            <LogOut className="w-4 h-4" />
            {demoMode ? 'Switch role / Exit demo' : 'Sign out'}
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div
        className="lg:hidden fixed left-0 right-0 z-50 bg-white/95 backdrop-blur-xl border-b border-slate-200"
        style={{ top: godBarVisible ? 40 : 0 }}
      >
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-teal-600 flex items-center justify-center">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-slate-900 text-sm">Student Signal</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <Bell className="w-4 h-4 text-slate-500" />
                {notifCount > 0 && (
                  <span className="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
                    {notifCount > 9 ? '9+' : notifCount}
                  </span>
                )}
              </button>
              {showNotifications && (
                <div className="fixed top-16 right-2 z-[60]">
                  <NotificationCenter mobile onClose={() => setShowNotifications(false)} />
                </div>
              )}
            </div>
            <button onClick={openQuickNote} className="p-2 rounded-lg bg-teal-600 text-white hover:bg-teal-700 transition-colors">
              <Plus className="w-4 h-4" />
            </button>
            <button onClick={openQuickLog} className="p-2 rounded-lg bg-slate-800 text-white hover:bg-slate-900 transition-colors">
              <Phone className="w-4 h-4" />
            </button>
            <button onClick={() => setMobileOpen(!mobileOpen)} className="p-2 rounded-lg hover:bg-slate-100">
              {mobileOpen ? <X className="w-5 h-5 text-slate-700" /> : <Menu className="w-5 h-5 text-slate-700" />}
            </button>
          </div>
        </div>
        {mobileOpen && (
          <nav className="px-4 pb-4 space-y-1 border-t border-slate-100 pt-2">
            {showPlatformNav ? (
              <>
                <Link to="/platform-admin" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive('/platform-admin') ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'}`}><Building2 className="w-4 h-4" />School Registry</Link>
                <Link to="/settings" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive('/settings') ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'}`}><Settings className="w-4 h-4" />Settings</Link>
              </>
            ) : (
              <>
                {[...navItems, ...secondaryItems].filter(isNavVisible).map((item) => {
                  const active = isActive(item.path);
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.path}
                      to={item.path}
                      onClick={() => setMobileOpen(false)}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                        active ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      {item.label}
                    </Link>
                  );
                })}
                {isSuperAdmin && (
                  <Link to="/platform-admin" onClick={() => setMobileOpen(false)} className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${isActive('/platform-admin') ? 'bg-teal-50 text-teal-700' : 'text-slate-600 hover:bg-slate-50'}`}><Shield className="w-4 h-4" />Platform Admin</Link>
                )}
              </>
            )}
            <button
              onClick={() => { setMobileOpen(false); signOut(); }}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-600 hover:bg-slate-50 w-full"
            >
              <LogOut className="w-4 h-4" />
              {demoMode ? 'Exit demo' : 'Sign out'}
            </button>
          </nav>
        )}
      </div>

      {/* Main content */}
      <main className="flex-1 lg:ml-60 pt-16 lg:pt-0">
        {bulletins.length > 0 && (
          <div className="space-y-0">
            {bulletins.map((b) => {
              const isUrgent = b.severity === 'urgent';
              const isWarning = b.severity === 'warning';
              return (
                <div
                  key={b.id}
                  className={`flex items-start gap-3 px-4 sm:px-6 lg:px-8 py-3 text-sm font-medium ${
                    isUrgent
                      ? 'bg-red-600 text-white'
                      : isWarning
                      ? 'bg-amber-500 text-white'
                      : 'bg-blue-600 text-white'
                  }`}
                >
                  {isUrgent ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : isWarning ? (
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  ) : (
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <span>{b.message}</span>
                    <span className="ml-2 opacity-75 text-xs font-normal">— {b.created_by}</span>
                  </div>
                  <button
                    onClick={() => {
                        const schoolId = demoMode ? null : (profile?.school_id ?? null);
                        const role = (profile as any)?.role ?? '';
                        if (role === 'admin' || role === 'dsl' || demoMode) {
                          deleteBulletin(schoolId, b.id);
                        }
                        setBulletins(prev => prev.filter(x => x.id !== b.id));
                      }}
                    className="shrink-0 opacity-80 hover:opacity-100 transition-opacity ml-2"
                    aria-label="Dismiss"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">{children}</div>
      </main>

      {showQuickNote && (
        <QuickNoteModal
          students={students}
          onClose={() => setShowQuickNote(false)}
          onSaved={() => setShowQuickNote(false)}
        />
      )}
      {showQuickLog && (
        <QuickLogModal
          students={students}
          onClose={() => setShowQuickLog(false)}
          onSaved={() => setShowQuickLog(false)}
        />
      )}
      <DemoGuideErrorBoundary><DemoGuide /></DemoGuideErrorBoundary>
      </div>
    </div>
  );
}

