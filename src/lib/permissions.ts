/**
 * StudentSignal Permission Model
 *
 * Simple, school-understandable model:
 *
 * Role              | User management | Safeguarding | Signal Queue | Broadcasts | Delete ribbon
 * ──────────────────┼─────────────────┼──────────────┼──────────────┼────────────┼──────────────
 * Platform Admin    | Platform only   | Platform only| Platform only| Platform   | Platform
 * School Admin      | Full            | View         | Full         | Create+Delete | Yes
 * DSL               | ❌              | Full         | Full (saf.)  | Create+Delete | Yes
 * SLT               | ❌              | View (grant) | Full (school)| Create     | Own only
 * HOY               | ❌              | ❌           | Year group   | ❌         | Own only
 * Tutor             | ❌              | ❌           | Form group   | ❌         | Own only
 * Teacher           | ❌              | ❌           | ❌           | ❌         | Own only
 *
 * DSL does not manage user accounts — that is the School Admin's responsibility.
 * SLT can view safeguarding only when explicitly granted can_view_safeguarding=true.
 */

export type AppRole =
  | 'admin'         // Headteacher — full access
  | 'slt'           // Assistant Head / SLT
  | 'dsl'           // Designated Safeguarding Lead
  | 'sendco'        // SENDCo
  | 'head_of_year'  // Head of Year
  | 'pastoral_lead' // Pastoral Lead
  | 'tutor'         // Form Tutor
  | 'teacher'       // Classroom Teacher
  | 'careers_lead'  // Careers Advisor
  | 'trust'         // Trust / MAT user (read-only cross-school)
  | 'staff'         // General staff (fallback)
  | 'super_admin';  // Student Signal platform operator — cross-school

export type Permission =
  | 'view_all_students'
  | 'view_safeguarding'
  | 'view_send'
  | 'view_pastoral_notes'
  | 'view_reports'
  | 'view_full_reports'
  | 'view_signal_queue'
  | 'view_staff_insights'
  | 'view_careers'
  | 'view_communications'
  | 'view_user_management'
  | 'manage_actions'
  | 'assign_to_any_staff'
  | 'upload_data'
  | 'view_timeline_all'
  | 'view_note_general'
  | 'view_note_pastoral'
  | 'view_note_send'
  | 'view_note_dsl_only'
  | 'view_note_slt_only'
  | 'create_notes'
  | 'escalate_concerns'
  | 'success_recognition';

const ROLE_PERMISSIONS: Record<AppRole, Permission[]> = {
  admin: [
    'view_all_students', 'view_safeguarding', 'view_send', 'view_pastoral_notes',
    'view_reports', 'view_full_reports', 'view_signal_queue', 'view_staff_insights',
    'view_careers', 'view_communications', 'view_user_management',
    'manage_actions', 'assign_to_any_staff', 'upload_data',
    'view_timeline_all', 'view_note_general', 'view_note_pastoral',
    'view_note_send', 'view_note_dsl_only', 'view_note_slt_only',
    'create_notes', 'escalate_concerns', 'success_recognition',
  ],
  slt: [
    'view_all_students', 'view_safeguarding', 'view_send', 'view_pastoral_notes',
    'view_reports', 'view_full_reports', 'view_signal_queue', 'view_staff_insights',
    'view_careers', 'view_communications',
    'manage_actions', 'assign_to_any_staff', 'upload_data',
    'view_timeline_all', 'view_note_general', 'view_note_pastoral',
    'view_note_send', 'view_note_slt_only',
    'create_notes', 'escalate_concerns', 'success_recognition',
  ],
  dsl: [
    'view_all_students', 'view_safeguarding', 'view_send', 'view_pastoral_notes',
    'view_reports', 'view_signal_queue', 'view_communications',
    'manage_actions', 'assign_to_any_staff',
    'view_timeline_all', 'view_note_general', 'view_note_pastoral',
    'view_note_send', 'view_note_dsl_only',
    'create_notes', 'escalate_concerns', 'success_recognition',
  ],
  sendco: [
    'view_all_students', 'view_send', 'view_pastoral_notes',
    'view_reports', 'view_signal_queue', 'view_careers', 'view_communications',
    'manage_actions',
    'view_timeline_all', 'view_note_general', 'view_note_pastoral', 'view_note_send',
    'create_notes', 'escalate_concerns', 'success_recognition',
  ],
  head_of_year: [
    'view_all_students', 'view_pastoral_notes',
    'view_reports', 'view_signal_queue', 'view_careers', 'view_communications',
    'manage_actions', 'assign_to_any_staff',
    'view_timeline_all', 'view_note_general', 'view_note_pastoral',
    'create_notes', 'escalate_concerns', 'success_recognition',
  ],
  pastoral_lead: [
    'view_all_students', 'view_pastoral_notes',
    'view_reports', 'view_signal_queue', 'view_communications',
    'manage_actions',
    'view_timeline_all', 'view_note_general', 'view_note_pastoral',
    'create_notes', 'escalate_concerns', 'success_recognition',
  ],
  tutor: [
    'view_all_students', 'view_pastoral_notes',
    'view_signal_queue', 'view_communications',
    'manage_actions',
    'view_note_general', 'view_note_pastoral',
    'create_notes', 'success_recognition',
  ],
  teacher: [
    'view_note_general',
    'create_notes',
  ],
  careers_lead: [
    'view_all_students', 'view_careers', 'view_communications',
    'view_note_general',
    'create_notes', 'success_recognition',
  ],
  trust: [
    'view_all_students', 'view_reports', 'view_full_reports',
    'view_note_general',
  ],
  staff: [
    'view_note_general',
    'create_notes',
  ],
  super_admin: [
    'view_all_students', 'view_safeguarding', 'view_send', 'view_pastoral_notes',
    'view_reports', 'view_full_reports', 'view_signal_queue', 'view_staff_insights',
    'view_careers', 'view_communications', 'view_user_management',
    'manage_actions', 'assign_to_any_staff', 'upload_data',
    'view_timeline_all', 'view_note_general', 'view_note_pastoral',
    'view_note_send', 'view_note_dsl_only', 'view_note_slt_only',
    'create_notes', 'escalate_concerns', 'success_recognition',
  ],
};

export const ROLE_LABELS: Record<AppRole, string> = {
  admin:        'Headteacher',
  slt:          'Assistant Head',
  dsl:          'DSL',
  sendco:       'SENDCo',
  head_of_year: 'Head of Year',
  pastoral_lead:'Pastoral Lead',
  tutor:        'Form Tutor',
  teacher:      'Teacher',
  careers_lead: 'Careers Advisor',
  trust:        'Trust User',
  staff:        'Staff',
  super_admin:  'Platform Admin',
};

export const ASSIGNABLE_ROLES: AppRole[] = [
  'admin', 'slt', 'dsl', 'sendco', 'head_of_year', 'pastoral_lead', 'tutor', 'careers_lead',
];

export function hasPermission(role: string | null | undefined, permission: Permission): boolean {
  if (!role) return false;
  const perms = ROLE_PERMISSIONS[role as AppRole];
  if (!perms) return false;
  return perms.includes(permission);
}

export function hasAnyPermission(role: string | null | undefined, permissions: Permission[]): boolean {
  return permissions.some(p => hasPermission(role, p));
}

export function getVisibleNoteTypes(role: string | null | undefined): string[] {
  const types: string[] = [];
  if (hasPermission(role, 'view_note_general'))  types.push('general');
  if (hasPermission(role, 'view_note_pastoral')) types.push('pastoral');
  if (hasPermission(role, 'view_note_send'))     types.push('send');
  if (hasPermission(role, 'view_note_dsl_only')) types.push('dsl_only');
  if (hasPermission(role, 'view_note_slt_only')) types.push('slt_only');
  return types;
}

export function getNavPermissions(role: string | null | undefined) {
  return {
    showSignalQueue:      hasPermission(role, 'view_signal_queue'),
    showReports:          hasPermission(role, 'view_reports'),
    showStaffDevelopment: hasPermission(role, 'view_staff_insights'),
    showCareers:          hasPermission(role, 'view_careers'),
    showCommunications:   hasPermission(role, 'view_communications'),
    showUserManagement:   hasPermission(role, 'view_user_management'),
    showUpload:           hasPermission(role, 'upload_data'),
    showSuccessStories:   hasAnyPermission(role, ['view_all_students', 'success_recognition']),
    canManageActions:     hasPermission(role, 'manage_actions'),
  };
}

// ─── Legacy helpers ─────────────────────────────────────────────────────────

export function canViewSafeguarding(role: string | null | undefined): boolean {
  return hasPermission(role, 'view_safeguarding');
}

export function canViewSEND(role: string | null | undefined): boolean {
  return hasPermission(role, 'view_send');
}

export function canViewAllStudents(role: string | null | undefined): boolean {
  return hasPermission(role, 'view_all_students');
}

export function canManageActions(role: string | null | undefined): boolean {
  return hasPermission(role, 'manage_actions');
}

export function isAdminOrSLT(role: string | null | undefined): boolean {
  if (!role) return false;
  return (['admin', 'slt'] as AppRole[]).includes(role as AppRole);
}

// Returns true if the given student is within the user's scope for their role.
// Broad roles (admin, slt, dsl, sendco, pastoral_lead, careers_lead, trust) see all.
// head_of_year sees only students in their year group.
// tutor sees only students in their form group.
// teacher / staff see no students by default (must be given explicit access).
export function isStudentInScope(
  role: string | null | undefined,
  student: { year_group?: string; form?: string; send_status?: string | null },
  userYearGroup: string | null,   // result of getHOYYearGroup(fullName) for HOY
  userForm: string | null,        // form code for tutors, e.g. '10B'
): boolean {
  if (!role) return false;
  const broadRoles: AppRole[] = ['admin', 'slt', 'dsl', 'sendco', 'pastoral_lead', 'careers_lead', 'trust'];
  if (broadRoles.includes(role as AppRole)) return true;
  if (role === 'head_of_year') {
    if (!userYearGroup) return true; // can't determine scope — show all rather than nothing
    return student.year_group === userYearGroup;
  }
  if (role === 'tutor') {
    if (!userForm) return true;
    return student.form === userForm;
  }
  // teacher / staff — no default student access
  return false;
}

