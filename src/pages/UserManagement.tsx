import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { ALL_YEAR_GROUPS } from '../lib/data';
import {
  Users, Plus, Edit2, Lock, Unlock, Trash2, Mail, Check,
  AlertTriangle, Shield, Eye, EyeOff, ChevronDown, Search,
  UserCheck, X, Save, RefreshCw, Info,
} from 'lucide-react';

type Role =
  | 'admin' | 'slt' | 'dsl' | 'deputy_dsl' | 'sendco' | 'attendance_lead'
  | 'head_of_year' | 'pastoral_lead' | 'teacher' | 'teaching_assistant' | 'staff';

interface UserProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  role: Role;
  department: string | null;
  year_groups: string[];
  is_active: boolean;
  last_sign_in_at: string | null;
  invited_at: string | null;
}

const ROLE_LABELS: Record<Role, string> = {
  admin: 'System Administrator',
  slt: 'Senior Leader (SLT)',
  dsl: 'DSL',
  deputy_dsl: 'Deputy DSL',
  sendco: 'SENDCo',
  attendance_lead: 'Attendance Lead',
  head_of_year: 'Head of Year',
  pastoral_lead: 'Pastoral Lead',
  teacher: 'Teacher',
  teaching_assistant: 'Teaching Assistant',
  staff: 'Staff',
};

const ROLE_PERMISSIONS: Record<Role, string[]> = {
  admin: ['Create users', 'Edit users', 'View all students', 'All reports', 'All settings'],
  slt: ['View all students', 'View all reports', 'View staff analytics', 'Create interventions'],
  dsl: ['Safeguarding access', 'Escalation recipient', 'All students', 'Reports'],
  deputy_dsl: ['Safeguarding access', 'Escalation recipient', 'All students', 'Reports'],
  sendco: ['SEND students', 'SEND escalations', 'SEND reports', 'Create interventions'],
  attendance_lead: ['Attendance alerts', 'Attendance escalations', 'Attendance reports'],
  head_of_year: ['Assigned year groups', 'Create actions', 'Complete reviews', 'Year reports'],
  pastoral_lead: ['Assigned students', 'Create interventions', 'Complete reviews'],
  teacher: ['Submit concerns', 'Add notes', 'Assigned students only'],
  teaching_assistant: ['Submit observations', 'Complete assigned actions', 'Add notes'],
  staff: ['Submit concerns', 'Add notes'],
};

const YEAR_GROUPS = ALL_YEAR_GROUPS;
const DEPARTMENTS = ['Maths', 'English', 'Science', 'Humanities', 'MFL', 'Arts', 'PE', 'Technology', 'PSHE', 'Pastoral', 'Leadership', 'SEND', 'Attendance'];

interface InviteForm {
  firstName: string;
  lastName: string;
  email: string;
  role: Role;
  department: string;
  yearGroups: string[];
}

const EMPTY_INVITE: InviteForm = {
  firstName: '', lastName: '', email: '', role: 'staff', department: '', yearGroups: [],
};

export default function UserManagement() {
  const { profile, demoMode } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);
  const [inviteForm, setInviteForm] = useState<InviteForm>(EMPTY_INVITE);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDisable, setConfirmDisable] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showPermissions, setShowPermissions] = useState<Role | null>(null);

  useEffect(() => { loadUsers(); }, [profile?.school_id]);

  async function loadUsers() {
    setLoading(true);
    if (demoMode) {
      setUsers(DEMO_USERS);
      setLoading(false);
      return;
    }
    const { data, error } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, department, year_groups, is_active, last_sign_in_at, invited_at')
      .eq('school_id', profile?.school_id)
      .order('full_name');
    if (!error && data) setUsers(data as UserProfile[]);
    setLoading(false);
  }

  async function inviteUser() {
    setSaving(true);
    setError(null);
    if (!inviteForm.firstName || !inviteForm.lastName || !inviteForm.email) {
      setError('Please fill in all required fields.');
      setSaving(false);
      return;
    }

    if (!demoMode && profile?.school_id) {
      if ((profile as any).role !== 'admin') {
        setError('Only the school administrator can invite users. DSLs manage safeguarding access, not staff accounts.');
        setSaving(false);
        return;
      }

      // Call Edge Function — it sends the invite email and pre-creates the profile
      const res = await supabase.functions.invoke('invite-user', {
        body: {
          email: inviteForm.email.trim().toLowerCase(),
          fullName: `${inviteForm.firstName} ${inviteForm.lastName}`,
          role: inviteForm.role,
          schoolId: profile.school_id,
          department: inviteForm.department || null,
          yearGroups: inviteForm.yearGroups,
        },
      });

      // Function always returns HTTP 200 with { success, error? } — read the body
      const resData = res.data as { success: boolean; error?: string } | null;
      if (res.error || !resData?.success) {
        setError(resData?.error || 'Failed to send invite. Please try again.');
        setSaving(false);
        return;
      }

      setUsers(prev => [
        ...prev,
        {
          id: `pending-${Date.now()}`,
          full_name: `${inviteForm.firstName} ${inviteForm.lastName}`,
          email: inviteForm.email,
          role: inviteForm.role,
          department: inviteForm.department || null,
          year_groups: inviteForm.yearGroups,
          is_active: false,
          last_sign_in_at: null,
          invited_at: new Date().toISOString(),
        },
      ]);
    } else {
      // Demo: add to local state
      const newUser: UserProfile = {
        id: `demo-${Date.now()}`,
        full_name: `${inviteForm.firstName} ${inviteForm.lastName}`,
        email: inviteForm.email,
        role: inviteForm.role,
        department: inviteForm.department || null,
        year_groups: inviteForm.yearGroups,
        is_active: true,
        last_sign_in_at: null,
        invited_at: new Date().toISOString(),
      };
      setUsers(prev => [...prev, newUser]);
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setShowInviteModal(false);
    setInviteForm(EMPTY_INVITE);
    setSaving(false);
    if (!demoMode) await loadUsers();
  }

  async function updateUser(userId: string, updates: Partial<UserProfile>) {
    // Only admin or DSL can amend user accounts
    if (!demoMode) {
      const role = (profile as any)?.role;
      if (role !== 'admin') {
        setError('Only the school administrator can amend user accounts.');
        return;
      }
    }
    setSaving(true);
    if (!demoMode) {
      const { error: err } = await supabase.from('profiles').update(updates).eq('id', userId);
      if (err) { setError(err.message); setSaving(false); return; }
    } else {
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, ...updates } : u));
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    setEditingUser(null);
    setSaving(false);
    if (!demoMode) await loadUsers();
  }

  async function toggleUserStatus(userId: string, currentStatus: boolean) {
    await updateUser(userId, { is_active: !currentStatus });
    setConfirmDisable(null);
  }

  async function deleteUser(userId: string) {
    // Only admin can permanently delete users (DSL can deactivate, not delete)
    if (!demoMode) {
      const role = (profile as any)?.role;
      if (role !== 'admin') {
        setError('Only admins can permanently delete user accounts. DSLs can deactivate users instead.');
        setConfirmDelete(null);
        return;
      }
      await supabase.from('profiles').delete().eq('id', userId);
    } else {
      setUsers(prev => prev.filter(u => u.id !== userId));
    }
    setConfirmDelete(null);
    if (!demoMode) await loadUsers();
  }

  async function resetPassword(email: string) {
    if (!demoMode) {
      await supabase.auth.resetPasswordForEmail(email);
    }
    alert(`Password reset email sent to ${email}`);
  }

  const filtered = users.filter(u => {
    const matchSearch = !search || (u.full_name || '').toLowerCase().includes(search.toLowerCase()) || (u.email || '').toLowerCase().includes(search.toLowerCase());
    const matchRole = roleFilter === 'all' || u.role === roleFilter;
    return matchSearch && matchRole;
  });

  function roleColor(role: Role) {
    const map: Partial<Record<Role, string>> = {
      admin: 'bg-slate-800 text-white',
      slt: 'bg-teal-100 text-teal-800',
      dsl: 'bg-red-100 text-red-800',
      deputy_dsl: 'bg-rose-100 text-rose-800',
      sendco: 'bg-violet-100 text-violet-800',
      attendance_lead: 'bg-blue-100 text-blue-800',
      head_of_year: 'bg-amber-100 text-amber-800',
      pastoral_lead: 'bg-orange-100 text-orange-800',
      teacher: 'bg-sky-100 text-sky-800',
      teaching_assistant: 'bg-indigo-100 text-indigo-800',
    };
    return map[role] || 'bg-slate-100 text-slate-700';
  }

  function YearGroupChips({ groups, onChange }: { groups: string[]; onChange: (g: string[]) => void }) {
    return (
      <div className="flex flex-wrap gap-1.5 mt-2">
        {YEAR_GROUPS.map(yg => {
          const active = groups.includes(yg);
          return (
            <button
              key={yg}
              type="button"
              onClick={() => onChange(active ? groups.filter(g => g !== yg) : [...groups, yg])}
              className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-all ${active ? 'bg-teal-600 text-white border-teal-600' : 'bg-white text-slate-600 border-slate-200 hover:border-teal-400'}`}
            >
              {yg}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">User Management</h2>
          <p className="text-sm text-slate-500 mt-1">Manage staff accounts, roles, and permissions for your school.</p>
        </div>
        <button onClick={() => { setInviteForm(EMPTY_INVITE); setShowInviteModal(true); }} className="btn-primary shrink-0">
          <Plus className="w-4 h-4" />
          Invite user
        </button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
        {[
          { label: 'Total users', value: users.length, color: 'text-slate-700' },
          { label: 'Active', value: users.filter(u => u.is_active).length, color: 'text-emerald-600' },
          { label: 'Disabled', value: users.filter(u => !u.is_active).length, color: 'text-slate-400' },
          { label: 'Admins/SLT', value: users.filter(u => u.role === 'admin' || u.role === 'slt').length, color: 'text-teal-600' },
          { label: 'DSL/Deputy', value: users.filter(u => u.role === 'dsl' || u.role === 'deputy_dsl').length, color: 'text-red-600' },
          { label: 'Teachers', value: users.filter(u => u.role === 'teacher' || u.role === 'teaching_assistant').length, color: 'text-sky-600' },
        ].map(s => (
          <div key={s.label} className="card-premium p-3 text-center">
            <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
            <div className="text-[10px] text-slate-500 font-medium mt-0.5">{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-premium pl-9"
          />
        </div>
        <div className="relative">
          <select
            value={roleFilter}
            onChange={e => setRoleFilter(e.target.value)}
            className="input-premium pr-8 appearance-none cursor-pointer"
          >
            <option value="all">All roles</option>
            {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        </div>
      </div>

      {saved && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          <Check className="w-4 h-4" /> Changes saved successfully.
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-sm">
          <AlertTriangle className="w-4 h-4" /> {error}
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Users table */}
      <div className="card-premium overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-premium">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Year groups</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Last login</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(user => (
                  <tr key={user.id} className={!user.is_active ? 'opacity-50' : ''}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-semibold text-xs shrink-0">
                          {(user.full_name || 'U').charAt(0).toUpperCase()}
                        </div>
                        <span className="font-semibold text-slate-800">{user.full_name || '—'}</span>
                      </div>
                    </td>
                    <td className="text-slate-600 text-sm">{user.email || '—'}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${roleColor(user.role)}`}>
                          {ROLE_LABELS[user.role] || user.role}
                        </span>
                        <button
                          onClick={() => setShowPermissions(showPermissions === user.role ? null : user.role)}
                          className="text-slate-300 hover:text-slate-500 transition-colors"
                          title="View permissions"
                        >
                          <Info className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {showPermissions === user.role && (
                        <div className="mt-1.5 p-2 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-600">
                          {ROLE_PERMISSIONS[user.role]?.map(p => (
                            <div key={p} className="flex items-center gap-1.5 py-0.5">
                              <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                              {p}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td>
                      {user.year_groups?.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {user.year_groups.map(yg => (
                            <span key={yg} className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">{yg}</span>
                          ))}
                        </div>
                      ) : <span className="text-slate-400 text-sm">—</span>}
                    </td>
                    <td className="text-slate-600 text-sm">{user.department || '—'}</td>
                    <td>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${user.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                        {user.is_active ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="text-slate-500 text-sm">
                      {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString('en-GB') : user.invited_at ? `Invited ${new Date(user.invited_at).toLocaleDateString('en-GB')}` : 'Never'}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                          title="Edit user"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => user.email && resetPassword(user.email)}
                          className="p-1.5 rounded-lg hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors"
                          title="Reset password"
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setConfirmDisable(user.id)}
                          className={`p-1.5 rounded-lg transition-colors ${user.is_active ? 'hover:bg-amber-50 text-slate-400 hover:text-amber-600' : 'hover:bg-emerald-50 text-slate-400 hover:text-emerald-600'}`}
                          title={user.is_active ? 'Disable user' : 'Enable user'}
                        >
                          {user.is_active ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        </button>
                        {profile?.role === 'admin' && (
                          <button
                            onClick={() => setConfirmDelete(user.id)}
                            className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                            title="Delete user"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={8} className="text-center py-12">
                      <Users className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      <p className="text-sm text-slate-500 font-medium">No users found</p>
                      <p className="text-xs text-slate-400 mt-1">{search ? 'Try adjusting your search' : 'Invite your first user to get started'}</p>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Escalation routing info */}
      <div className="card-premium p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center"><Shield className="w-5 h-5 text-teal-600" /></div>
          <div>
            <h3 className="font-semibold text-slate-900">Escalation Routing</h3>
            <p className="text-xs text-slate-500">When staff escalate concerns, they are automatically routed to the correct role.</p>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[
            { trigger: 'Safeguarding concern', routes: ['DSL', 'Deputy DSL'], icon: '🔴', note: 'Statutory requirement' },
            { trigger: 'SEND escalation', routes: ['SENDCo'], icon: '🟣', note: 'Provision review triggered' },
            { trigger: 'Attendance concern', routes: ['Attendance Lead'], icon: '🔵', note: 'Referral pathway' },
            { trigger: 'Pastoral concern', routes: ['Head of Year', 'Pastoral Lead'], icon: '🟡', note: 'Year group routing' },
            { trigger: 'Serious concern', routes: ['SLT'], icon: '⚪', note: 'Escalates to Senior Leadership' },
            { trigger: 'Career risk', routes: ['Careers Lead'], icon: '🟢', note: 'Destination support pathway' },
          ].map(r => {
            const routedTo = users.filter(u =>
              r.routes.some(role => ROLE_LABELS[u.role]?.includes(role.split(' ')[0]))
            );
            return (
              <div key={r.trigger} className="p-4 rounded-xl border border-slate-200 bg-slate-50">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm">{r.icon}</span>
                  <span className="text-sm font-semibold text-slate-800">{r.trigger}</span>
                </div>
                <div className="text-xs text-slate-500 mb-2">Routes to: {r.routes.join(', ')}</div>
                {routedTo.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {routedTo.map(u => (
                      <span key={u.id} className="text-[10px] px-2 py-0.5 rounded-full bg-teal-100 text-teal-700 font-medium">{u.full_name || 'Unknown'}</span>
                    ))}
                  </div>
                ) : (
                  <span className="text-[10px] text-amber-600 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> No user assigned this role</span>
                )}
                <div className="text-[10px] text-slate-400 mt-1.5">{r.note}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invite modal */}
      {showInviteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-teal-50 flex items-center justify-center"><Plus className="w-5 h-5 text-teal-600" /></div>
                <div>
                  <h2 className="font-bold text-slate-900">Invite User</h2>
                  <p className="text-xs text-slate-500">They will receive an email to set their password.</p>
                </div>
              </div>
              <button onClick={() => setShowInviteModal(false)} className="p-2 rounded-lg hover:bg-slate-100 transition-colors"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">First name *</label>
                  <input value={inviteForm.firstName} onChange={e => setInviteForm(p => ({ ...p, firstName: e.target.value }))} className="input-premium" placeholder="First name" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Last name *</label>
                  <input value={inviteForm.lastName} onChange={e => setInviteForm(p => ({ ...p, lastName: e.target.value }))} className="input-premium" placeholder="Last name" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Email address *</label>
                <input type="email" value={inviteForm.email} onChange={e => setInviteForm(p => ({ ...p, email: e.target.value }))} className="input-premium" placeholder="teacher@school.edu" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Role *</label>
                <div className="relative">
                  <select value={inviteForm.role} onChange={e => setInviteForm(p => ({ ...p, role: e.target.value as Role }))} className="input-premium pr-8 appearance-none cursor-pointer">
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
                {inviteForm.role && (
                  <div className="mt-2 p-3 rounded-xl bg-slate-50 border border-slate-200">
                    <p className="text-xs font-semibold text-slate-700 mb-1.5">Permissions for {ROLE_LABELS[inviteForm.role]}:</p>
                    <div className="grid grid-cols-2 gap-1">
                      {ROLE_PERMISSIONS[inviteForm.role]?.map(p => (
                        <div key={p} className="flex items-center gap-1.5 text-xs text-slate-600">
                          <Check className="w-3 h-3 text-emerald-500 shrink-0" />
                          {p}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Department</label>
                <div className="relative">
                  <select value={inviteForm.department} onChange={e => setInviteForm(p => ({ ...p, department: e.target.value }))} className="input-premium pr-8 appearance-none cursor-pointer">
                    <option value="">— Select department —</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Year groups assigned</label>
                <p className="text-xs text-slate-400 mb-1.5">Select year groups this staff member is responsible for.</p>
                <YearGroupChips groups={inviteForm.yearGroups} onChange={yg => setInviteForm(p => ({ ...p, yearGroups: yg }))} />
              </div>
              {error && <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">{error}</div>}
              <div className="flex gap-3 pt-2">
                <button onClick={inviteUser} disabled={saving} className="btn-primary flex-1">
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                  {saving ? 'Sending invite...' : 'Send invite'}
                </button>
                <button onClick={() => setShowInviteModal(false)} className="btn-secondary">Cancel</button>
              </div>
              <p className="text-xs text-slate-400 text-center">The user will receive an email invitation to set their password and activate their account.</p>
            </div>
          </div>
        </div>
      )}

      {/* Edit user modal */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between rounded-t-2xl">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
                  <div className="w-6 h-6 rounded-full bg-teal-600 text-white flex items-center justify-center font-bold text-xs">
                    {(editingUser.full_name || 'U').charAt(0)}
                  </div>
                </div>
                <div>
                  <h2 className="font-bold text-slate-900">Edit {editingUser.full_name}</h2>
                  <p className="text-xs text-slate-500">Update role, department, and year group assignments.</p>
                </div>
              </div>
              <button onClick={() => setEditingUser(null)} className="p-2 rounded-lg hover:bg-slate-100"><X className="w-4 h-4 text-slate-500" /></button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Full name</label>
                <input
                  value={editingUser.full_name || ''}
                  onChange={e => setEditingUser(u => u ? { ...u, full_name: e.target.value } : u)}
                  className="input-premium"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Role</label>
                <div className="relative">
                  <select
                    value={editingUser.role}
                    onChange={e => setEditingUser(u => u ? { ...u, role: e.target.value as Role } : u)}
                    className="input-premium pr-8 appearance-none cursor-pointer"
                  >
                    {Object.entries(ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1.5">Department</label>
                <div className="relative">
                  <select
                    value={editingUser.department || ''}
                    onChange={e => setEditingUser(u => u ? { ...u, department: e.target.value || null } : u)}
                    className="input-premium pr-8 appearance-none cursor-pointer"
                  >
                    <option value="">— Select department —</option>
                    {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wider mb-1">Year groups</label>
                <YearGroupChips
                  groups={editingUser.year_groups || []}
                  onChange={yg => setEditingUser(u => u ? { ...u, year_groups: yg } : u)}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => updateUser(editingUser.id, {
                    full_name: editingUser.full_name,
                    role: editingUser.role,
                    department: editingUser.department,
                    year_groups: editingUser.year_groups,
                  })}
                  disabled={saving}
                  className="btn-primary flex-1"
                >
                  {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  Save changes
                </button>
                <button onClick={() => setEditingUser(null)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm disable modal */}
      {confirmDisable && (() => {
        const user = users.find(u => u.id === confirmDisable);
        if (!user) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-amber-500" /></div>
                <div>
                  <h3 className="font-bold text-slate-900">{user.is_active ? 'Disable' : 'Enable'} user?</h3>
                  <p className="text-xs text-slate-500">{user.full_name}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-5">{user.is_active ? 'This user will lose access to Student Signal. Their data will be preserved.' : 'This user will regain access to Student Signal.'}</p>
              <div className="flex gap-3">
                <button onClick={() => toggleUserStatus(user.id, user.is_active)} className="btn-primary flex-1">{user.is_active ? 'Disable user' : 'Enable user'}</button>
                <button onClick={() => setConfirmDisable(null)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Confirm delete modal */}
      {confirmDelete && (() => {
        const user = users.find(u => u.id === confirmDelete);
        if (!user) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center"><Trash2 className="w-5 h-5 text-red-500" /></div>
                <div>
                  <h3 className="font-bold text-slate-900">Delete user permanently?</h3>
                  <p className="text-xs text-slate-500">{user.full_name}</p>
                </div>
              </div>
              <p className="text-sm text-slate-600 mb-2">This action <strong>cannot be undone</strong>. The user's account will be permanently removed.</p>
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-5">Tip: consider disabling the user instead to preserve their activity history.</p>
              <div className="flex gap-3">
                <button onClick={() => deleteUser(user.id)} className="flex-1 px-4 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors">Delete permanently</button>
                <button onClick={() => setConfirmDelete(null)} className="btn-secondary">Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// Demo users for demo mode
const DEMO_USERS: UserProfile[] = [
  { id: 'demo-1', full_name: 'Mrs Sarah Harris', email: 'sarah.harris@oakwood.edu', role: 'head_of_year', department: 'Pastoral', year_groups: ['Year 10', 'Year 11'], is_active: true, last_sign_in_at: new Date(Date.now() - 86400000).toISOString(), invited_at: null },
  { id: 'demo-2', full_name: 'Mr James Smith', email: 'james.smith@oakwood.edu', role: 'teacher', department: 'Maths', year_groups: ['Year 9', 'Year 10'], is_active: true, last_sign_in_at: new Date(Date.now() - 3600000).toISOString(), invited_at: null },
  { id: 'demo-3', full_name: 'Ms Rachel Cooper', email: 'r.cooper@oakwood.edu', role: 'dsl', department: 'Pastoral', year_groups: [], is_active: true, last_sign_in_at: new Date(Date.now() - 7200000).toISOString(), invited_at: null },
  { id: 'demo-4', full_name: 'Mr David Thompson', email: 'd.thompson@oakwood.edu', role: 'sendco', department: 'SEND', year_groups: [], is_active: true, last_sign_in_at: new Date(Date.now() - 172800000).toISOString(), invited_at: null },
  { id: 'demo-5', full_name: 'Mrs Lisa Patel', email: 'l.patel@oakwood.edu', role: 'attendance_lead', department: 'Attendance', year_groups: [], is_active: true, last_sign_in_at: new Date(Date.now() - 43200000).toISOString(), invited_at: null },
  { id: 'demo-6', full_name: 'Mr Tom Watts', email: 't.watts@oakwood.edu', role: 'teacher', department: 'English', year_groups: ['Year 7', 'Year 8'], is_active: false, last_sign_in_at: null, invited_at: new Date(Date.now() - 604800000).toISOString() },
  { id: 'demo-7', full_name: 'Demo User', email: 'demo@studentsignal.io', role: 'admin', department: 'Leadership', year_groups: [], is_active: true, last_sign_in_at: new Date().toISOString(), invited_at: null },
];

