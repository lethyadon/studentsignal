import { supabase } from './supabase';
import { triggerReanalysis } from './analysistrigger';
import type { Student, BehaviourRecord, AnalysisResult, Intervention, CareerProfile, DashboardStats, StaffMember, GraduationStatus, Communication } from '../types';
import {
  DEMO_STUDENTS_EXTRA,
  DEMO_BEHAVIOUR_EXTRA,
  DEMO_ANALYSIS_EXTRA,
  DEMO_INTERVENTIONS_EXTRA,
  DEMO_CAREERS_EXTRA,
  DEMO_COMMUNICATIONS_EXTRA,
} from './demoData';

// ── YEAR GROUPS ───────────────────────────────────────────────────────────────
// Ordered from youngest to oldest — covers primary (Reception–Y6) and secondary (Y7–Y13)
export const ALL_YEAR_GROUPS = [
  'Reception', 'Year 1', 'Year 2', 'Year 3', 'Year 4', 'Year 5', 'Year 6',
  'Year 7', 'Year 8', 'Year 9', 'Year 10', 'Year 11', 'Year 12', 'Year 13',
];

// ── DEMO STAFF ─────────────────────────────────────────────────────────────────
export const DEMO_STAFF: StaffMember[] = [
  // Leadership
  { name: 'Mrs Clarke (Head)',        role: 'Headteacher',                   },
  { name: 'Mr Thompson (DHT)',        role: 'Deputy Headteacher',            },
  { name: 'Mr Lee (SLT)',             role: 'SLT Lead',                      },
  // Designated leads
  { name: 'Mr Ahmed (DSL)',           role: 'Designated Safeguarding Lead',  },
  { name: 'Ms Jones (SENDCo)',        role: 'SENDCo',                        },
  { name: 'Ms Green (Counsellor)',    role: 'School Counsellor',             },
  { name: 'Ms Williams (Attend)',     role: 'Attendance Officer',            },
  { name: 'Mrs Thompson (Pastoral)',  role: 'Pastoral Manager',              },
  { name: 'Ms Brown (Careers)',       role: 'Careers Lead',                  },
  // Heads of Year — all year groups
  { name: 'Ms Webb (HOY Reception)', role: 'Head of Reception',             },
  { name: 'Mr Bailey (HOY Y1)',       role: 'Head of Year 1',                },
  { name: 'Ms Taylor (HOY Y2)',       role: 'Head of Year 2',                },
  { name: 'Mrs Fox (HOY Y3)',         role: 'Head of Year 3',                },
  { name: 'Mr Cole (HOY Y4)',         role: 'Head of Year 4',                },
  { name: 'Ms Grant (HOY Y5)',        role: 'Head of Year 5',                },
  { name: 'Mrs Morton (HOY Y6)',      role: 'Head of Year 6',                },
  { name: 'Ms Clarke (HOY Y7)',       role: 'Head of Year 7',                },
  { name: 'Mr Singh (HOY Y8)',        role: 'Head of Year 8',                },
  { name: 'Mr Okafor (HOY Y9)',       role: 'Head of Year 9',                },
  { name: 'Ms Harris (HOY Y10)',      role: 'Head of Year 10',               },
  { name: 'Mrs Reeves (HOY Y11)',     role: 'Head of Year 11',               },
  // Form tutors & classroom teachers
  { name: 'Mr Patel (Tutor)',         role: 'Form Tutor',                    },
  { name: 'Ms Okonkwo (Teacher)',     role: 'Classroom Teacher',             },
  { name: 'Mr Smith (Maths)',         role: 'Maths Teacher',                 },
  { name: 'Mr Davis (PE)',            role: 'PE Teacher',                    },
  { name: 'Dr Patel (Science)',       role: 'Science Teacher',               },
];

// Year-group → HOY staff name mapping (secondary demo data)
export const HOY_BY_YEAR: Record<string, string> = {
  'Reception': 'Ms Webb (HOY Reception)',
  'Year 1':   'Mr Bailey (HOY Y1)',
  'Year 2':   'Ms Taylor (HOY Y2)',
  'Year 3':   'Mrs Fox (HOY Y3)',
  'Year 4':   'Mr Cole (HOY Y4)',
  'Year 5':   'Ms Grant (HOY Y5)',
  'Year 6':   'Mrs Morton (HOY Y6)',
  'Year 7':   'Ms Clarke (HOY Y7)',
  'Year 8':   'Mr Singh (HOY Y8)',
  'Year 9':   'Mr Okafor (HOY Y9)',
  'Year 10':  'Ms Harris (HOY Y10)',
  'Year 11':  'Mrs Reeves (HOY Y11)',
};

// Maps suggested_owner keywords + optional year group → actual DEMO_STAFF name
export function mapOwnerToStaffName(suggestedOwner: string, yearGroup?: string): string {
  const lower = (suggestedOwner || '').toLowerCase();
  if (lower.includes('dsl') || lower.includes('safeguarding')) return 'Mr Ahmed (DSL)';
  if (lower.includes('senco') || lower.includes('send'))       return 'Ms Jones (SENDCo)';
  if (lower.includes('counsell'))                              return 'Ms Green (Counsellor)';
  if (lower.includes('head of year') || lower === 'hoy') {
    if (yearGroup && HOY_BY_YEAR[yearGroup]) return HOY_BY_YEAR[yearGroup];
    return 'Ms Harris (HOY Y10)';
  }
  if (lower.includes('career'))                                return 'Ms Brown (Careers)';
  if (lower.includes('pastoral') || lower.includes('manager')) return 'Mrs Thompson (Pastoral)';
  if (lower.includes('slt') || lower.includes('senior'))       return 'Mr Lee (SLT)';
  if (lower.includes('attendance'))                            return 'Ms Williams (Attend)';
  if (lower.includes('tutor'))                                 return 'Mr Patel (Tutor)';
  const direct = DEMO_STAFF.find(s => s.name === suggestedOwner);
  return direct ? direct.name : '';
}

// ── GRADUATION STATUS ─────────────────────────────────────────────────────────
export function computeGraduationStatus(student: Student): GraduationStatus {
  const cat = student.signal_category;
  if (cat === 'green' || cat === 'blue') return 'success_story';
  const att = student.attendance_pct ?? 95;
  const beh = student.behaviour_score ?? 0;
  if (att >= 95 && beh <= 5) return 'stable';
  if (att >= 90 && beh <= 15) return 'monitor';
  return 'active';
}


// ── DEMO RECOGNITION STORE ────────────────────────────────────────────────────
// In-memory store shared between SuccessStories and StudentProfile in demo mode.
// Cleared on page reload (intentional — demo data is ephemeral).

export interface DemoRecognition {
  id: string;
  student_id: string;
  recognition_type: string;
  recognition_label: string;
  notes: string;
  completed_by: string;
  completed_at: string;
  is_undone: boolean;
  is_cleared: boolean;
  is_dismissed: boolean;
}

const _demoRecognitions: DemoRecognition[] = [];

export function getDemoRecognitions(): DemoRecognition[] {
  return _demoRecognitions;
}

export function addDemoRecognition(rec: DemoRecognition): void {
  _demoRecognitions.unshift(rec);
}

export function updateDemoRecognition(id: string, patch: Partial<DemoRecognition>): void {
  const idx = _demoRecognitions.findIndex(r => r.id === id);
  if (idx !== -1) Object.assign(_demoRecognitions[idx], patch);
}

// ─── Demo intervention store ──────────────────────────────────────────────────

const _demoInterventions: Intervention[] = [];
const _interventionListeners: Set<() => void> = new Set();

export function subscribeToInterventions(fn: () => void): () => void {
  _interventionListeners.add(fn);
  return () => _interventionListeners.delete(fn);
}

export function getDemoInterventions(studentId?: string): Intervention[] {
  return studentId ? _demoInterventions.filter(i => i.student_id === studentId) : _demoInterventions;
}

export function addDemoIntervention(item: Intervention): boolean {
  // Prevent exact duplicates: same student + same action_type + still open
  const isDuplicate = _demoInterventions.some(i =>
    i.student_id === item.student_id &&
    i.action_type === item.action_type &&
    !['completed', 'cancelled', 'closed'].includes(i.status)
  );
  // Also check mock interventions for the same active combination
  const isMockDuplicate = !isDuplicate && MOCK_INTERVENTIONS.some(i =>
    i.student_id === item.student_id &&
    i.action_type === item.action_type &&
    !['completed', 'cancelled', 'closed'].includes(i.status) &&
    !_demoInterventions.some(d => d.id === i.id && ['completed', 'cancelled', 'closed'].includes(d.status))
  );
  if (isDuplicate || isMockDuplicate) return false;
  _demoInterventions.unshift(item);
  _interventionListeners.forEach(fn => fn());
  // Push a live notification targeted at the assigned staff member
  const studentName = MOCK_STUDENTS.find(s => s.id === item.student_id)?.name || 'Student';
  const isUrgent = item.priority === 'urgent';
  pushLiveNotification({
    id: `live-${item.id}`,
    type: 'assigned_action',
    title: `Action assigned: ${item.action_type}`,
    body: `${studentName} — assigned to ${item.assigned_to || 'staff'}.`,
    required_action: 'Open the student\'s Actions tab to mark as in progress and record the outcome.',
    student_id: item.student_id,
    link_path: `/students/${item.student_id}?tab=actions&highlight=${item.id}`,
    is_read: false,
    urgent: isUrgent,
    created_at: item.created_at || new Date().toISOString(),
    target_user: item.assigned_to || undefined,
  });
  return true;
}

export function updateDemoIntervention(id: string, patch: Partial<Intervention>): void {
  let idx = _demoInterventions.findIndex(i => i.id === id);
  if (idx === -1) {
    // Seed from mock data so status changes on mock interventions are persisted
    const mock = MOCK_INTERVENTIONS.find(i => i.id === id);
    if (mock) { _demoInterventions.unshift({ ...mock }); idx = 0; }
  }
  if (idx !== -1) Object.assign(_demoInterventions[idx], patch);
  _interventionListeners.forEach(fn => fn());
}

// ─── Live demo notification store ────────────────────────────────────────────
// Notifications pushed here appear immediately in NotificationCenter

export interface LiveNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  required_action: string;
  student_id: string | null;
  link_path: string;
  is_read: boolean;
  urgent: boolean;
  created_at: string;
  target_user?: string; // full_name of the staff member this notification is for
}

const _liveNotifications: LiveNotification[] = [];
const _notifListeners: Set<() => void> = new Set();

export function subscribeToLiveNotifications(fn: () => void): () => void {
  _notifListeners.add(fn);
  return () => _notifListeners.delete(fn);
}

export function getLiveNotifications(): LiveNotification[] {
  return [..._liveNotifications];
}

export function getLiveNotificationsForUser(fullName: string): LiveNotification[] {
  if (!fullName) return _liveNotifications.filter(n => !n.target_user);
  return _liveNotifications.filter(n => {
    if (!n.target_user) return true;
    if (n.target_user === fullName) return true;
    // Match 'Ms Harris (HOY Y10)' when fullName is 'Ms Harris'
    if (n.target_user.startsWith(fullName + ' ')) return true;
    if (n.target_user.startsWith(fullName + '(')) return true;
    return false;
  });
}

// ─── Emergency bulletin store ─────────────────────────────────────────────────
// Bulletins are school-wide and shown to ALL users at the top of every page.

export interface Bulletin {
  id: string;
  message: string;
  severity: 'info' | 'warning' | 'urgent';
  created_at: string;
  created_by: string;
}

const DEMO_BULLETINS_KEY = 'ss_demo_bulletins';

function loadDemoBulletinsFromStorage(): Bulletin[] {
  try {
    const raw = sessionStorage.getItem(DEMO_BULLETINS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return [
    {
      id: 'b1',
      message: 'URGENT — Safeguarding: A Year 10 student threatened a classmate with scissors during Period 3 and is currently unaccounted for. All staff check corridors and report any sighting immediately to Mr Ahmed (DSL) on ext. 201. Do not approach the student alone.',
      severity: 'urgent',
      created_at: new Date(Date.now() - 900000).toISOString(),
      created_by: 'Mr Ahmed (DSL)',
    },
    {
      id: 'b2',
      message: 'Reminder: All safeguarding concerns must be logged in CPOMS by end of day. Contact Mr Ahmed (DSL) directly for any urgent disclosures.',
      severity: 'warning',
      created_at: new Date(Date.now() - 3600000).toISOString(),
      created_by: 'Mrs Clarke (Headteacher)',
    },
  ];
}

function saveDemoBulletinsToStorage(bulletins: Bulletin[]): void {
  try { sessionStorage.setItem(DEMO_BULLETINS_KEY, JSON.stringify(bulletins)); } catch {}
}

const _demoBulletins: Bulletin[] = loadDemoBulletinsFromStorage();
const _bulletinListeners: Set<() => void> = new Set();

export function subscribeToBulletins(fn: () => void): () => void {
  _bulletinListeners.add(fn);
  return () => _bulletinListeners.delete(fn);
}

export function getDemoBulletins(): Bulletin[] {
  return [..._demoBulletins];
}

export function pushBulletin(b: Bulletin): void {
  _demoBulletins.unshift(b);
  saveDemoBulletinsToStorage(_demoBulletins);
  _bulletinListeners.forEach(fn => fn());
}

export function dismissBulletin(id: string): void {
  const idx = _demoBulletins.findIndex(b => b.id === id);
  if (idx !== -1) _demoBulletins.splice(idx, 1);
  saveDemoBulletinsToStorage(_demoBulletins);
  _bulletinListeners.forEach(fn => fn());
}

export async function getBulletins(schoolId: string | null): Promise<Bulletin[]> {
  if (!schoolId) return getDemoBulletins();
  const { data } = await supabase
    .from('bulletins')
    .select('*')
    .eq('school_id', schoolId)
    .order('created_at', { ascending: false });
  return (data as Bulletin[]) || [];
}

export async function createBulletin(
  schoolId: string,
  message: string,
  severity: Bulletin['severity'],
  createdBy: string,
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('bulletins').insert({
    school_id: schoolId,
    message,
    severity,
    created_by: createdBy,
  });
  return { error: error?.message ?? null };
}

export async function deleteBulletin(schoolId: string | null, id: string): Promise<void> {
  if (!schoolId) { dismissBulletin(id); return; }
  await supabase.from('bulletins').delete().eq('id', id).eq('school_id', schoolId);
}

// Returns true if an intervention's assigned_to matches a staff member's full name
// Handles cases like 'Mr Ahmed (DSL)' matching profile full_name 'Mr Ahmed'
export function isInterventionAssignedToUser(assignedTo: string | null | undefined, fullName: string): boolean {
  if (!assignedTo || !fullName) return false;
  return assignedTo === fullName || assignedTo.startsWith(fullName + ' ') || assignedTo.startsWith(fullName + '(');
}

// Returns the year group a HOY covers.
// Parses "(HOY Y10)" or "(HOY Reception)" style suffix from the name.
export function getHOYYearGroup(fullName: string): string | null {
  // Handle Reception: "(HOY Reception)"
  if (/\(HOY\s+Reception\)/i.test(fullName)) return 'Reception';
  // Handle Year N: "(HOY Y9)", "(HOY Y10)" etc.
  const m = fullName.match(/\(HOY\s+Y(\d+)\)/i);
  if (m) return `Year ${m[1]}`;
  // Fallback: reverse lookup in HOY_BY_YEAR
  for (const [year, staffName] of Object.entries(HOY_BY_YEAR)) {
    if (staffName === fullName) return year;
  }
  return null;
}

export function pushLiveNotification(n: LiveNotification): void {
  _liveNotifications.unshift(n);
  _notifListeners.forEach(fn => fn());
}

const DEMO_DISMISSALS_KEY = 'ss_demo_dismissals';

function loadDemoDismissals(): Map<string, Set<string>> {
  try {
    const raw = sessionStorage.getItem(DEMO_DISMISSALS_KEY);
    if (!raw) return new Map();
    const obj = JSON.parse(raw) as Record<string, string[]>;
    const map = new Map<string, Set<string>>();
    for (const [k, v] of Object.entries(obj)) map.set(k, new Set(v));
    return map;
  } catch { return new Map(); }
}

function saveDemoDismissals(map: Map<string, Set<string>>): void {
  try {
    const obj: Record<string, string[]> = {};
    map.forEach((set, key) => { obj[key] = [...set]; });
    sessionStorage.setItem(DEMO_DISMISSALS_KEY, JSON.stringify(obj));
  } catch {}
}

const _demoDismissalMap: Map<string, Set<string>> = loadDemoDismissals();

export function getDemoDismissals(studentId: string): Set<string> {
  return _demoDismissalMap.get(studentId) || new Set();
}

export function addDemoDismissal(studentId: string, recId: string): void {
  if (!_demoDismissalMap.has(studentId)) _demoDismissalMap.set(studentId, new Set());
  _demoDismissalMap.get(studentId)!.add(recId);
  saveDemoDismissals(_demoDismissalMap);
}

// ─── Dismissed intervention IDs (survives page navigation) ───────────────────
const _dismissedInterventionIds: Set<string> = new Set();

export function dismissDemoIntervention(id: string): void {
  _dismissedInterventionIds.add(id);
  // Also persist as cancelled in the demo store so it's excluded from counts
  updateDemoIntervention(id, { status: 'cancelled' });
}

export function isDemoDismissed(id: string): boolean {
  return _dismissedInterventionIds.has(id);
}

export function getDemoDismissedIds(): Set<string> {
  return new Set(_dismissedInterventionIds);
}
// Tracks where each student sits in the SIGNAL → ACTION → REVIEW → OUTCOME flow.

export type SignalStatus =
  | 'new'               // Signal just appeared — no action taken yet
  | 'action_in_progress' // Action assigned to a staff member or being self-actioned
  | 'review_due'        // Action completed — review needed to assess impact
  | 'resolved'          // Signal resolved — student no longer needs pastoral attention
  | 'escalated'         // Escalated to DSL / SLT
  | 'dismissed';        // Deliberately dismissed with a reason

const _demoSignalStatuses: Map<string, SignalStatus> = new Map();
const _signalStatusListeners: Set<() => void> = new Set();

export function subscribeToSignalStatuses(fn: () => void): () => void {
  _signalStatusListeners.add(fn);
  return () => _signalStatusListeners.delete(fn);
}

export function getDemoSignalStatus(studentId: string): SignalStatus {
  return _demoSignalStatuses.get(studentId) || 'new';
}

export function setDemoSignalStatus(studentId: string, status: SignalStatus): void {
  _demoSignalStatuses.set(studentId, status);
  _signalStatusListeners.forEach(fn => fn());
}

export function updateDemoStudentRisk(studentId: string, risk: { risk_level?: 'red' | 'amber' | 'green'; signal_category?: 'red' | 'amber' | 'purple' | 'green' | 'blue' }): void {
  // Update in-memory MOCK_STUDENTS so the student profile reflects the live routing outcome
  const student = MOCK_STUDENTS.find(s => s.id === studentId);
  if (student) {
    if (risk.risk_level) (student as any).risk_level = risk.risk_level;
    if (risk.signal_category) (student as any).signal_category = risk.signal_category;
  }
  _signalStatusListeners.forEach(fn => fn());
}

export function getAllDemoSignalStatuses(): Map<string, SignalStatus> {
  return _demoSignalStatuses;
}

// ── DEMO BEHAVIOUR (chronology) ───────────────────────────────────────────────
const _demoBehaviourRecords: BehaviourRecord[] = [];

export function addDemoBehaviourRecord(record: BehaviourRecord): void {
  _demoBehaviourRecords.unshift(record);
}

export function getDemoBehaviourRecords(): BehaviourRecord[] {
  return _demoBehaviourRecords;
}


// Each student is designed to trigger specific, evidence-backed patterns.
// Pattern triggers are documented inline so the Pattern Engine has real data to work with.
export const MOCK_STUDENTS: Student[] = [
  // RED — escalating behaviour + attendance collapse
  {
    id: 's1', name: 'Oliver Brown', year_group: 'Year 10', form: '10A',
    send_status: null, pupil_premium: true,
    risk_level: 'red', signal_category: 'red',
    behaviour_score: 44, attendance_pct: 77, punctuality_issues: 6,
  },
  // RED — EHCP + safeguarding note + attendance crisis
  {
    id: 's2', name: 'Sophie Green', year_group: 'Year 9', form: '9B',
    send_status: 'EHCP', pupil_premium: false,
    risk_level: 'red', signal_category: 'red',
    behaviour_score: 28, attendance_pct: 71, punctuality_issues: 5,
  },
  // AMBER — lesson avoidance (Maths P5, pattern across 5 weeks)
  {
    id: 's3', name: 'James Wilson', year_group: 'Year 11', form: '11C',
    send_status: null, pupil_premium: true,
    risk_level: 'amber', signal_category: 'amber',
    behaviour_score: 18, attendance_pct: 86, punctuality_issues: 4,
  },
  // AMBER — peer/time pattern (incidents always Period 4, always with same peer)
  {
    id: 's4', name: 'Emma Taylor', year_group: 'Year 10', form: '10B',
    send_status: 'SEN Support', pupil_premium: false,
    risk_level: 'amber', signal_category: 'amber',
    behaviour_score: 20, attendance_pct: 88, punctuality_issues: 2,
  },
  // PURPLE — withdrawal pattern (positive points falling, lateness rising, pastoral notes)
  {
    id: 's5', name: 'Noah Davies', year_group: 'Year 9', form: '9A',
    send_status: null, pupil_premium: true,
    risk_level: 'amber', signal_category: 'purple',
    behaviour_score: 10, attendance_pct: 87, punctuality_issues: 5,
    positive_points: 2,
  },
  // PURPLE — quiet subject decline (Art: attendance dropping, behaviour emerging, prev. A-grade student)
  {
    id: 's7', name: 'Anya Sharma', year_group: 'Year 10', form: '10C',
    send_status: null, pupil_premium: false,
    risk_level: 'amber', signal_category: 'purple',
    behaviour_score: 8, attendance_pct: 90, punctuality_issues: 3,
    positive_points: 3,
  },
  // GREEN — turnaround after pastoral intervention (attendance 84%→94%, behaviour 22→5)
  {
    id: 's6', name: 'Isla Roberts', year_group: 'Year 11', form: '11A',
    send_status: null, pupil_premium: false,
    risk_level: 'green', signal_category: 'green',
    behaviour_score: 5, attendance_pct: 94, positive_points: 18, punctuality_issues: 0,
  },
  // GREEN — mentoring success (PP student, was amber, now thriving)
  {
    id: 's8', name: 'Marcus Thompson', year_group: 'Year 10', form: '10D',
    send_status: null, pupil_premium: true,
    risk_level: 'green', signal_category: 'green',
    behaviour_score: 3, attendance_pct: 96, positive_points: 24, punctuality_issues: 0,
  },
  // BLUE — exceptional achievement
  {
    id: 's9', name: 'Priya Patel', year_group: 'Year 11', form: '11B',
    send_status: null, pupil_premium: false,
    risk_level: 'green', signal_category: 'blue',
    behaviour_score: 0, attendance_pct: 99, positive_points: 47, punctuality_issues: 0,
  },
  // BLUE — exceptional achievement despite SEN
  {
    id: 's10', name: "Finn O'Connor", year_group: 'Year 9', form: '9C',
    send_status: 'SEN Support', pupil_premium: true,
    risk_level: 'green', signal_category: 'blue',
    behaviour_score: 1, attendance_pct: 97, positive_points: 38, punctuality_issues: 0,
  },
  ...DEMO_STUDENTS_EXTRA,
];

// ── MOCK BEHAVIOUR ────────────────────────────────────────────────────────────
// Dates are relative to 2026-06-22 (today in session). Records are spread across
// 6-8 weeks to give the Pattern Engine meaningful time-series data.
export const MOCK_BEHAVIOUR: Record<string, BehaviourRecord[]> = {

  // s1: Oliver Brown — escalation pattern
  // Behaviour pts: Week 1-2 = 12pts, Week 3-4 = 22pts, Week 5-6 = 44pts → >100% escalation
  s1: [
    { id: 'b1', student_id: 's1', date: '2026-05-05', incident_type: 'Disruption', behaviour_points: 3, lesson_period: 'P2', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Talking over teacher', safeguarding_note: null },
    { id: 'b2', student_id: 's1', date: '2026-05-09', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'English', staff_member: 'Ms Jones', comment: 'Arrived 15 minutes late, no reason', safeguarding_note: null },
    { id: 'b3', student_id: 's1', date: '2026-05-15', incident_type: 'Disruption', behaviour_points: 5, lesson_period: 'P3', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Off-task, distracting others repeatedly', safeguarding_note: null },
    { id: 'b4', student_id: 's1', date: '2026-05-22', incident_type: 'Disruption', behaviour_points: 5, lesson_period: 'P2', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Continued off-task behaviour', safeguarding_note: null },
    { id: 'b5', student_id: 's1', date: '2026-05-28', incident_type: 'Refusal', behaviour_points: 10, lesson_period: 'P3', subject: 'Science', staff_member: 'Dr Patel', comment: 'Refused to follow instructions after two warnings', safeguarding_note: null },
    { id: 'b6', student_id: 's1', date: '2026-06-03', incident_type: 'Refusal', behaviour_points: 10, lesson_period: 'P2', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Left the room without permission', safeguarding_note: null },
    { id: 'b7', student_id: 's1', date: '2026-06-10', incident_type: 'Isolation', behaviour_points: 15, lesson_period: 'P4', subject: 'Science', staff_member: 'Dr Patel', comment: 'Removed from lesson — aggressive response to redirection', safeguarding_note: null },
    { id: 'b8', student_id: 's1', date: '2026-06-17', incident_type: 'Isolation', behaviour_points: 15, lesson_period: 'P3', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Second isolation this fortnight — escalating pattern', safeguarding_note: null },
  ],

  // s2: Sophie Green — safeguarding + attendance crisis + EHCP not meeting need
  s2: [
    { id: 'b9',  student_id: 's2', date: '2026-05-12', incident_type: 'Disruption', behaviour_points: 4, lesson_period: 'P3', subject: 'Science', staff_member: 'Dr Patel', comment: 'Appeared distressed, off-task', safeguarding_note: null },
    { id: 'b10', student_id: 's2', date: '2026-05-20', incident_type: 'Late',       behaviour_points: 2, lesson_period: 'P1', subject: 'English',  staff_member: 'Ms Jones',  comment: 'Late again — 4th time this half term', safeguarding_note: null },
    { id: 'b11', student_id: 's2', date: '2026-06-02', incident_type: 'Disruption', behaviour_points: 5, lesson_period: 'P3', subject: 'Science', staff_member: 'Dr Patel', comment: 'Refused to start work. Disclosed worries at home to TA.', safeguarding_note: 'Student mentioned parents arguing at home and feeling unsafe. Referred to DSL same day.' },
    { id: 'b12', student_id: 's2', date: '2026-06-14', incident_type: 'Late',       behaviour_points: 2, lesson_period: 'P1', subject: 'Maths',   staff_member: 'Mr Smith',  comment: 'Fifth punctuality issue this half term', safeguarding_note: null },
  ],

  // s3: James Wilson — lesson avoidance (Maths specifically, Period 5, 6 incidents in 5 weeks)
  // Present at registration on all these days — avoidance not absence
  s3: [
    { id: 'b13', student_id: 's3', date: '2026-05-06', incident_type: 'Lesson refusal', behaviour_points: 8, lesson_period: 'P5', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Left Maths P5 without permission — present at P1 registration', safeguarding_note: null },
    { id: 'b14', student_id: 's3', date: '2026-05-13', incident_type: 'Lesson refusal', behaviour_points: 8, lesson_period: 'P5', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Did not attend Maths P5 — attended all other lessons', safeguarding_note: null },
    { id: 'b15', student_id: 's3', date: '2026-05-20', incident_type: 'Disruption', behaviour_points: 5, lesson_period: 'P5', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Extremely disruptive when made to stay — said he hates Maths', safeguarding_note: null },
    { id: 'b16', student_id: 's3', date: '2026-05-27', incident_type: 'Lesson refusal', behaviour_points: 8, lesson_period: 'P5', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Third walk-out from Maths P5 in four weeks', safeguarding_note: null },
    { id: 'b17', student_id: 's3', date: '2026-06-03', incident_type: 'Late',          behaviour_points: 2, lesson_period: 'P5', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Arrived 20 minutes late to Maths — "couldn\'t find classroom"', safeguarding_note: null },
    { id: 'b18', student_id: 's3', date: '2026-06-10', incident_type: 'Lesson refusal', behaviour_points: 8, lesson_period: 'P5', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Fourth refusal in six weeks. All P5. No other lesson pattern.', safeguarding_note: null },
  ],

  // s4: Emma Taylor — peer/time pattern
  // All incidents in P4, several involve the same peer group
  s4: [
    { id: 'b19', student_id: 's4', date: '2026-05-08', incident_type: 'Disruption', behaviour_points: 4, lesson_period: 'P4', subject: 'Drama', staff_member: 'Ms Clark', comment: 'Disruption involving Kai M and Jordan T — taunting behaviour', safeguarding_note: null },
    { id: 'b20', student_id: 's4', date: '2026-05-15', incident_type: 'Disruption', behaviour_points: 5, lesson_period: 'P4', subject: 'PE',    staff_member: 'Mr Davis', comment: 'Incident with Kai M — same peer from Drama last week', safeguarding_note: null },
    { id: 'b21', student_id: 's4', date: '2026-05-22', incident_type: 'Disruption', behaviour_points: 4, lesson_period: 'P4', subject: 'Art',   staff_member: 'Ms Clark', comment: 'Verbal confrontation — Kai M and Jordan T involved again', safeguarding_note: null },
    { id: 'b22', student_id: 's4', date: '2026-06-05', incident_type: 'Refusal',    behaviour_points: 8, lesson_period: 'P4', subject: 'PE',    staff_member: 'Mr Davis', comment: 'Refused to change — Kai M also involved. All P4 incidents.', safeguarding_note: null },
    { id: 'b23', student_id: 's4', date: '2026-06-17', incident_type: 'Disruption', behaviour_points: 4, lesson_period: 'P4', subject: 'Drama', staff_member: 'Ms Clark', comment: 'Escalating again after two quiet weeks. Jordan T involved.', safeguarding_note: null },
  ],

  // s5: Noah Davies — withdrawal pattern
  // Positive points: early records show 8pts+, recent records drop to near zero
  // Lateness increasing, previously A-band student, pastoral notes mention quiet/withdrawn
  s5: [
    { id: 'b24', student_id: 's5', date: '2026-04-28', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P2', subject: 'Computer Science', staff_member: 'Mr Patel', comment: 'Excellent independent coding project', safeguarding_note: null, positive_points: 9, praise_comment: 'Outstanding analytical thinking' },
    { id: 'b25', student_id: 's5', date: '2026-05-07', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P3', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Top of class on mock paper', safeguarding_note: null, positive_points: 7, praise_comment: 'Strong performance, showed real effort' },
    { id: 'b26', student_id: 's5', date: '2026-05-20', incident_type: 'Late',   behaviour_points: 2, lesson_period: 'P1', subject: 'English', staff_member: 'Ms Jones', comment: 'Late for second time this month — looked very tired', safeguarding_note: null },
    { id: 'b27', student_id: 's5', date: '2026-05-28', incident_type: 'Late',   behaviour_points: 2, lesson_period: 'P1', subject: 'Maths',   staff_member: 'Mr Smith', comment: 'Late again. Didn\'t engage in lesson — very quiet today', safeguarding_note: null },
    { id: 'b28', student_id: 's5', date: '2026-06-08', incident_type: 'Late',   behaviour_points: 2, lesson_period: 'P1', subject: 'Science', staff_member: 'Dr Patel', comment: 'Third late this month. Sits alone now — used to work in a group', safeguarding_note: null },
    { id: 'b29', student_id: 's5', date: '2026-06-17', incident_type: 'Disruption', behaviour_points: 3, lesson_period: 'P3', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Uncharacteristically disruptive — uncommunicative when asked to explain', safeguarding_note: null, positive_points: 0 },
  ],

  // s7: Anya Sharma — subject-specific decline (Art)
  // No issues in other subjects. Art: disruption + punctuality + teacher notes
  s7: [
    { id: 'b30', student_id: 's7', date: '2026-05-06', incident_type: 'Late',       behaviour_points: 2, lesson_period: 'P5', subject: 'Art',    staff_member: 'Ms Clark', comment: 'Third late arrival to Art this term', safeguarding_note: null },
    { id: 'b31', student_id: 's7', date: '2026-05-14', incident_type: 'Disruption', behaviour_points: 4, lesson_period: 'P5', subject: 'Art',    staff_member: 'Ms Clark', comment: 'Disengaged — previously her favourite lesson. Sat at the back.', safeguarding_note: null },
    { id: 'b32', student_id: 's7', date: '2026-05-27', incident_type: 'Late',       behaviour_points: 2, lesson_period: 'P5', subject: 'Art',    staff_member: 'Ms Clark', comment: 'Late again to Art specifically — on time for all other lessons', safeguarding_note: null },
    { id: 'b33', student_id: 's7', date: '2026-06-09', incident_type: 'Disruption', behaviour_points: 4, lesson_period: 'P5', subject: 'Art',    staff_member: 'Ms Clark', comment: 'Refused to show her sketchbook — used to volunteer work in class', safeguarding_note: null },
    { id: 'b34', student_id: 's7', date: '2026-06-17', incident_type: 'Late',       behaviour_points: 2, lesson_period: 'P3', subject: 'Maths',  staff_member: 'Mr Smith', comment: 'One late mark in Maths — all others in Art', safeguarding_note: null },
  ],

  // s6: Isla Roberts — improvement pattern (turnaround after pastoral intervention)
  // Early records show behaviour; recent records show praise only
  s6: [
    { id: 'b35', student_id: 's6', date: '2026-04-10', incident_type: 'Disruption', behaviour_points: 8, lesson_period: 'P2', subject: 'Maths',    staff_member: 'Mr Smith', comment: 'Persistent disruption — third incident this week', safeguarding_note: null },
    { id: 'b36', student_id: 's6', date: '2026-04-22', incident_type: 'Refusal',    behaviour_points: 10, lesson_period: 'P3', subject: 'History',  staff_member: 'Ms Brown', comment: 'Refused to complete assessment — left room', safeguarding_note: null },
    { id: 'b37', student_id: 's6', date: '2026-05-14', incident_type: 'Disruption', behaviour_points: 5, lesson_period: 'P4', subject: 'Business', staff_member: 'Mr Lee', comment: 'Minor incident — much less than usual. Responding well to pastoral check-ins.', safeguarding_note: null },
    { id: 'b38', student_id: 's6', date: '2026-05-28', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P4', subject: 'Business', staff_member: 'Mr Lee', comment: 'Outstanding group presentation', safeguarding_note: null, positive_points: 8, praise_comment: 'Exceptional leadership — real turnaround from April' },
    { id: 'b39', student_id: 's6', date: '2026-06-10', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P2', subject: 'English',  staff_member: 'Ms Jones', comment: 'Creative writing piece — significant improvement', safeguarding_note: null, positive_points: 6, praise_comment: 'Strong effort and improvement from start of term' },
    { id: 'b40', student_id: 's6', date: '2026-06-17', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P4', subject: 'Business', staff_member: 'Mr Lee', comment: 'Nominated for term award by form tutor', safeguarding_note: null, positive_points: 10, praise_comment: 'Remarkable turnaround — consistent and self-motivated' },
  ],

  // s8: Marcus Thompson — improvement after mentoring (PP student)
  s8: [
    { id: 'b41', student_id: 's8', date: '2026-06-05', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P2', subject: 'Science',  staff_member: 'Dr Patel',  comment: 'Excellent experimental write-up', safeguarding_note: null, positive_points: 6, praise_comment: 'Impressive analytical thinking' },
    { id: 'b42', student_id: 's8', date: '2026-06-10', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P1', subject: 'English',  staff_member: 'Ms Jones',  comment: 'Outstanding creative writing', safeguarding_note: null, positive_points: 8, praise_comment: 'Strong improvement from earlier in year' },
    { id: 'b43', student_id: 's8', date: '2026-06-17', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P5', subject: 'PE',       staff_member: 'Mr Davis',  comment: 'Shown real leadership on the pitch', safeguarding_note: null, positive_points: 5, praise_comment: 'Great role model for peers' },
  ],

  // s9: Priya Patel — exceptional
  s9: [
    { id: 'b44', student_id: 's9', date: '2026-06-12', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P3', subject: 'Science', staff_member: 'Dr Patel',  comment: 'Top of year group in mock papers', safeguarding_note: null, positive_points: 10, praise_comment: 'Exceptional — full marks on Chemistry paper' },
    { id: 'b45', student_id: 's9', date: '2026-06-15', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P4', subject: 'Maths',   staff_member: 'Mr Smith',  comment: 'Tutoring peers in her own time', safeguarding_note: null, positive_points: 8, praise_comment: 'Remarkable peer support — real community spirit' },
    { id: 'b46', student_id: 's9', date: '2026-06-17', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P2', subject: 'English', staff_member: 'Ms Jones',  comment: 'Essay shortlisted for national competition', safeguarding_note: null, positive_points: 10, praise_comment: 'Exceptional written communication' },
  ],

  // s10: Finn O'Connor — exceptional despite SEN
  s10: [
    { id: 'b47', student_id: 's10', date: '2026-06-12', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P1', subject: 'Computer Science', staff_member: 'Mr Patel',  comment: 'Outstanding coding project — self-directed', safeguarding_note: null, positive_points: 9, praise_comment: 'Despite SEN challenges, exceeded all expected outcomes' },
    { id: 'b48', student_id: 's10', date: '2026-06-15', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P2', subject: 'Maths',           staff_member: 'Mr Smith',  comment: 'Showed incredible resilience after struggling in Spring', safeguarding_note: null, positive_points: 8, praise_comment: 'Remarkable growth mindset' },
    { id: 'b49', student_id: 's10', date: '2026-06-17', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P5', subject: 'Art',             staff_member: 'Ms Clark',  comment: 'Work selected for school exhibition', safeguarding_note: null, positive_points: 7, praise_comment: 'Creative talent emerging strongly' },
  ],
  ...DEMO_BEHAVIOUR_EXTRA,
};

// ── MOCK ANALYSIS ─────────────────────────────────────────────────────────────
// key_reasons contains ONLY raw metrics — no conclusions, no circular AI text.
// Pattern Engine derives conclusions from this raw evidence.
export const MOCK_ANALYSIS: Record<string, AnalysisResult> = {
  ...DEMO_ANALYSIS_EXTRA,
  s1: {
    id: 'a1', student_id: 's1', risk_level: 'red', signal_category: 'red', risk_score: 87,
    key_reasons: [
      'Behaviour points: 44 total — 12pts weeks 1-2, 22pts weeks 3-4, 44pts weeks 5-6 (+267%)',
      'Attendance: 77% (threshold: 96% expected, 80% persistent absence trigger)',
      'Subjects: Maths = 5 of 8 incidents (63%)',
      'Punctuality: 6 late marks recorded',
      'Incident types: 2 isolations in last 2 weeks (escalation)',
    ],
    signal_explanation: "Oliver's behaviour has escalated 267% over six weeks and attendance has dropped to 77% — below the persistent absence threshold. Five of eight incidents are in Maths, mostly P5, with a recurring peer group. The pattern suggests a specific trigger in one context, not general disengagement. Two isolations in the last fortnight signal this is accelerating.",
    behaviour_trend: 'Escalating', attendance_trend: 'Declining',
    subjects_involved: ['Maths', 'Science'], periods_involved: ['P2', 'P3', 'P4'],
    suggested_pastoral_action: 'Immediate pastoral meeting — involve HOY and review behaviour plan',
    suggested_parent_contact: 'Telephone contact with parent/carer today — discuss escalation',
    suggested_staff_action: 'Inform HOY and DSL. Raise behaviour report card. Alert Maths and Science teachers.',
    career_signposting: 'Attendance affecting future options — discuss implications for post-16 with student',
    recommended_review_date: '2026-06-29',
  },
  s2: {
    id: 'a2', student_id: 's2', risk_level: 'red', signal_category: 'red', risk_score: 84,
    key_reasons: [
      'EHCP in place — last review over 8 weeks ago',
      'Attendance: 71% (persistent absence threshold)',
      'Safeguarding note recorded 2026-06-02 — DSL informed',
      'Punctuality: 5 late marks this half term',
      'Disruption in Science: 2 of 4 incidents',
    ],
    signal_explanation: "Sophie's EHCP has not been reviewed in over eight weeks, her attendance has fallen to 71% — well below the persistent absence threshold — and a safeguarding note was recorded earlier this month. The combination of an unreviewed EHCP, attendance crisis, and a live safeguarding concern makes this a DSL-level priority, not a form-tutor referral.",
    behaviour_trend: 'Escalating', attendance_trend: 'Declining',
    subjects_involved: ['Science', 'English'], periods_involved: ['P1', 'P3'],
    suggested_pastoral_action: 'Urgent pastoral meeting — DSL to be informed, EHCP emergency review required',
    suggested_parent_contact: 'Contact parent/carer today — sensitive approach re: home circumstances',
    suggested_staff_action: 'DSL review of safeguarding note. EHCP emergency review. Alert form tutor.',
    career_signposting: null,
    recommended_review_date: '2026-06-25',
  },
  s3: {
    id: 'a3', student_id: 's3', risk_level: 'amber', signal_category: 'amber', risk_score: 62,
    key_reasons: [
      'Maths P5: 4 refusals + 1 late + 1 disruption in 6 weeks — 6 of 6 Maths incidents in P5',
      'Attendance: 86% (target 96%)',
      'Present at registration on all refusal days — avoidance, not absence',
      'Punctuality: 4 late marks (3 of which are Maths P5)',
      'No similar pattern in any other subject or period',
    ],
    signal_explanation: "James has six Maths-specific incidents in six weeks — every single one in Period 5, every single one in the same lesson slot. On every refusal day, he was present at registration: this is deliberate lesson avoidance, not absence. No issues in any other subject or period. The concentration of the pattern is the signal — something specific is happening in Maths P5 that needs to be understood, not just managed.",
    behaviour_trend: 'Concerning', attendance_trend: 'Below target',
    subjects_involved: ['Maths'], periods_involved: ['P5'],
    suggested_pastoral_action: 'Pastoral conversation with James — explore what is happening in Maths P5 specifically',
    suggested_parent_contact: 'Inform parent/carer — explore home factors and any anxiety around Maths',
    suggested_staff_action: 'Maths teacher meeting to explore triggers — consider seating, grouping, peer dynamics',
    career_signposting: 'Maths avoidance may affect post-16 options — explore support pathways',
    recommended_review_date: '2026-07-03',
  },
  s4: {
    id: 'a4', student_id: 's4', risk_level: 'amber', signal_category: 'amber', risk_score: 55,
    key_reasons: [
      'All 5 incidents in P4 (100% concentration in one period)',
      'Same peer group (Kai M, Jordan T) involved in 4 of 5 incidents',
      'Subjects vary (Drama, PE, Art) — consistent peer, not subject trigger',
      'SEN Support plan — review provision',
      'Attendance: 88%',
    ],
    signal_explanation: "All five of Emma's incidents happened in Period 4 regardless of subject — Drama, PE, and Art are all affected, but Maths and English are fine. The same two peers appear in four of the five cases. The subject-free, period-specific, peer-consistent pattern points directly to a relationship dynamic, not a curriculum issue. Her SEN Support plan also needs reviewing given the emerging pattern.",
    behaviour_trend: 'Concerning', attendance_trend: 'Below target',
    subjects_involved: ['Drama', 'PE', 'Art'], periods_involved: ['P4'],
    suggested_pastoral_action: 'Pastoral meeting — explore peer dynamics. Consider seating/class changes for P4.',
    suggested_parent_contact: 'Inform parent/carer — discuss peer relationship concerns sensitively',
    suggested_staff_action: 'Alert P4 subject teachers. Consider whether groupings can be adjusted.',
    career_signposting: 'Healthcare pathway interest noted — reinforce positive direction',
    recommended_review_date: '2026-07-06',
  },
  s5: {
    id: 'a5', student_id: 's5', risk_level: 'amber', signal_category: 'purple', risk_score: 61,
    key_reasons: [
      'Positive points: 16pts (April-May) → 0pts (June) — 100% drop',
      'Late marks: 0 (April) → 5 (May-June)',
      'Staff comments reference: tired, quiet, sitting alone, uncommunicative',
      'Previously high-performing: top of class in Maths mock (2026-05-07)',
      'No major incidents — easy to overlook',
    ],
    behaviour_trend: 'Hidden decline', attendance_trend: 'Below target',
    subjects_involved: ['English', 'Maths', 'Science'], periods_involved: ['P1', 'P3'],
    suggested_pastoral_action: 'Discreet pastoral conversation — do not raise concerns in group settings',
    suggested_parent_contact: 'Sensitive contact — check for any home circumstances or changes',
    suggested_staff_action: 'Alert HOY quietly. Ask form tutor to make informal contact.',
    career_signposting: 'IT and software development aspirations — maintain motivation and connections',
    recommended_review_date: '2026-07-01',
    signal_explanation: 'Noah appears fine on the surface but data shows a significant shift since early May.',
  },
  s7: {
    id: 'a7', student_id: 's7', risk_level: 'amber', signal_category: 'purple', risk_score: 52,
    key_reasons: [
      'Art incidents: 4 of 5 total (80%) — all in Art P5',
      'Late marks: 3 of 4 are Art-specific (not other subjects)',
      'Teacher comment: "previously her favourite lesson" — change in engagement',
      'Positive points: 3 remaining (down from 12 in Spring term)',
      'No disruption in any other subject',
    ],
    behaviour_trend: 'Hidden decline', attendance_trend: 'Stable but Art-specific avoidance',
    subjects_involved: ['Art'], periods_involved: ['P5'],
    suggested_pastoral_action: 'Discreet 1:1 conversation with trusted adult — explore Art-specific issue',
    suggested_parent_contact: 'Low-key check-in — explore whether anything has changed at home or in Art',
    suggested_staff_action: 'Art teacher (Ms Clark) to gently explore what has changed. Avoid confrontation.',
    career_signposting: 'Creative arts pathway — rebuild confidence and interest',
    recommended_review_date: '2026-07-04',
    signal_explanation: 'Anya shows a targeted decline in Art only. The subject-specific pattern suggests a specific trigger.',
  },
  s6: {
    id: 'a6', student_id: 's6', risk_level: 'green', signal_category: 'green', risk_score: 14,
    key_reasons: [
      'Behaviour points: 23pts (April) → 5pts (June) — 78% reduction',
      'Attendance: 84% (April) → 94% (June)',
      'Praise records: 0 (April) → 3 entries, 24 pts (May-June)',
      'No behaviour incidents since 2026-05-14',
      'Nominated for term award by form tutor',
    ],
    behaviour_trend: 'Improving', attendance_trend: 'Improving',
    subjects_involved: ['Business', 'English'], periods_involved: ['P4'],
    suggested_pastoral_action: null,
    suggested_parent_contact: 'Positive update to parent/carer — celebrate the turnaround',
    suggested_staff_action: null,
    career_signposting: 'Business and marketing pathway — explore A Level and apprenticeship options',
    recommended_review_date: '2026-07-25',
    signal_explanation: 'Isla has made a clear, measurable turnaround since pastoral support began in April.',
    previous_state: 'Amber Watchlist — recurring disruption, attendance 84%, two refusal incidents',
    current_state: 'Positive Growth — engagement improving, attendance 94%, peer leadership emerging',
    what_changed: 'Weekly pastoral check-ins + positive recognition programme (April–May)',
    contributing_intervention: 'i4',
    suggested_recognition: 'Nominate for termly achievement award. Share positive update with parent/carer.',
    celebration_type: 'turnaround',
  },
  s8: {
    id: 'a8', student_id: 's8', risk_level: 'green', signal_category: 'green', risk_score: 10,
    key_reasons: [
      'Behaviour incidents: near zero this term',
      'Attendance: 91% (Spring) → 96% (Summer)',
      'Positive points: 19pts across 3 records since June',
      'Praise from Science, English, and PE — consistent across subjects',
      'PP student — significant progress from previous amber signal',
    ],
    behaviour_trend: 'Improving strongly', attendance_trend: 'Excellent',
    subjects_involved: ['Science', 'English', 'PE'], periods_involved: ['P1', 'P2', 'P5'],
    suggested_pastoral_action: null,
    suggested_parent_contact: 'Share positive update — strong evidence of growth',
    suggested_staff_action: null,
    career_signposting: 'Science and sports leadership — explore university pathways',
    recommended_review_date: '2026-07-25',
    signal_explanation: 'Marcus has made a significant positive shift since the mentoring programme in Spring.',
    previous_state: 'Amber — PP student, low engagement, attendance 91%',
    current_state: 'Positive Growth — high praise, consistent attendance, leadership emerging',
    what_changed: 'Structured mentoring programme and science enrichment club (8 sessions)',
    contributing_intervention: 'i5',
    suggested_recognition: 'House points award. Consider as PP success story for governors.',
    celebration_type: 'growth',
  },
  s9: {
    id: 'a9', student_id: 's9', risk_level: 'green', signal_category: 'blue', risk_score: 2,
    key_reasons: [
      'Attendance: 99% — near perfect all year',
      'Mock paper: top of year group in Science',
      'Essay: shortlisted for national writing competition',
      'Positive points: 47 — peers, staff, cross-curricular',
      'Peer tutoring: voluntarily supports peers in own time',
    ],
    behaviour_trend: 'Exemplary', attendance_trend: 'Excellent',
    subjects_involved: ['Science', 'Maths', 'English'], periods_involved: ['P2', 'P3', 'P4'],
    suggested_pastoral_action: null,
    suggested_parent_contact: 'Exceptional achievement communication to parent/carer',
    suggested_staff_action: null,
    career_signposting: 'Medicine or academic research — Russell Group universities, scholarship opportunities',
    recommended_review_date: '2026-09-07',
    signal_explanation: 'Priya is performing at an exceptional level. Peer contribution is remarkable.',
    previous_state: null,
    current_state: 'Exceptional Achievement — academic excellence, peer leadership, community contribution',
    what_changed: null,
    contributing_intervention: null,
    suggested_recognition: 'Head teacher commendation. Submit for county-level achievement award.',
    celebration_type: 'exceptional',
  },
  s10: {
    id: 'a10', student_id: 's10', risk_level: 'green', signal_category: 'blue', risk_score: 4,
    key_reasons: [
      'Attendance: 97% despite SEN support needs',
      'Coding project: self-directed, exceeded expected outcomes',
      'Art: work selected for school exhibition',
      'Positive points: 38 — multiple subjects',
      'Resilience: overcoming SEN and PP barriers',
    ],
    behaviour_trend: 'Exemplary', attendance_trend: 'Excellent',
    subjects_involved: ['Computer Science', 'Maths', 'Art'], periods_involved: ['P1', 'P2', 'P5'],
    suggested_pastoral_action: null,
    suggested_parent_contact: 'Exceptional progress — acknowledge family support in communication',
    suggested_staff_action: null,
    career_signposting: 'Software development and creative technology — apprenticeships and university',
    recommended_review_date: '2026-09-07',
    signal_explanation: "Finn's progress, given SEN and PP status, is genuinely exceptional. A model of resilience.",
    previous_state: 'SEND concern — engagement and output below expected levels',
    current_state: 'Exceptional Achievement — self-directed learning, creative excellence, consistent attendance',
    what_changed: 'Targeted SEND support + Computer Science enrichment + Art mentoring',
    contributing_intervention: null,
    suggested_recognition: "Pupil of the Term nomination. Showcase coding project at parents' evening.",
    celebration_type: 'resilience',
  },
};

// ── MOCK INTERVENTIONS ────────────────────────────────────────────────────────
export const MOCK_INTERVENTIONS: Intervention[] = [
  ...DEMO_INTERVENTIONS_EXTRA,
  {
    id: 'i1', student_id: 's1', assigned_to: 'Ms Harris (HOY Y10)', created_by: 'Student Signal (System)',
    action_type: 'Pastoral meeting', priority: 'urgent', status: 'suggested',
    due_date: '2026-07-15', review_date: '2026-07-28',
    notes: 'Discuss escalating behaviour and attendance collapse. Involve DSL if safeguarding concern emerges.',
    outcome: null,
    reason: 'Behaviour points up 267% over 6 weeks. Attendance 77%. Two isolations in last fortnight.',
    suggested_owner: 'Head of Year',
    created_at: '2026-06-19',
  },
  {
    id: 'i2', student_id: 's2', assigned_to: 'Ms Jones (SENDCo)', created_by: 'Student Signal (System)',
    action_type: 'EHCP emergency review', priority: 'high', status: 'suggested',
    due_date: '2026-07-17', review_date: '2026-07-31',
    notes: 'Review EHCP targets — provision not meeting need. Coordinate with DSL on safeguarding note.',
    outcome: null,
    reason: 'EHCP in place but behaviour and attendance have declined. Safeguarding note on record.',
    suggested_owner: 'SENCO',
    created_at: '2026-06-18',
  },
  {
    id: 'i3', student_id: 's3', assigned_to: 'Mr Smith (Maths)', created_by: 'Student Signal (System)',
    action_type: 'Subject teacher follow-up', priority: 'high', status: 'suggested',
    due_date: '2026-07-16', review_date: '2026-07-30',
    notes: 'Maths P5 conversation — explore triggers, consider seating/grouping change.',
    outcome: null,
    reason: '6 Maths P5 incidents in 6 weeks. Present at registration on all days — avoidance, not absence.',
    suggested_owner: 'Subject Teacher',
    created_at: '2026-06-19',
  },
  {
    id: 'i4', student_id: 's6', assigned_to: 'Ms Harris (HOY Y10)', created_by: 'Ms Harris (HOY Y10)',
    action_type: 'Pastoral check-in programme', priority: 'medium', status: 'completed',
    due_date: '2026-05-30', review_date: '2026-05-30',
    notes: 'Weekly pastoral check-in for 8 weeks. Linked to positive recognition programme.',
    outcome: 'Isla reported feeling more confident and settled. Attendance improved to 94%. Behaviour incidents down significantly. Nominated for term award.',
    outcome_status: 'sustained',
    review_completed: true, review_action_taken: true, review_student_improved: 'improved',
    review_notes: 'Clear measurable improvement across all tracked metrics. Pastoral support has been highly effective.',
    baseline_attendance: 84, current_attendance: 94,
    baseline_behaviour: 23, current_behaviour: 5,
    reason: 'Amber signal: recurring disruption, refusal incidents, attendance 84%.',
    created_at: '2026-04-07',
  },
  {
    id: 'i5', student_id: 's8', assigned_to: 'Mr Davis (PE)', created_by: 'Ms Harris (HOY Y10)',
    action_type: 'Mentoring programme', priority: 'medium', status: 'completed',
    due_date: '2026-06-01', review_date: '2026-06-01',
    notes: '8-session mentoring programme. Focus on motivation, self-belief, and engagement.',
    outcome: 'Remarkable progress. Praise records up. Behaviour near zero. Science enrichment club now engaged.',
    outcome_status: 'resolved',
    review_completed: true, review_action_taken: true, review_student_improved: 'improved',
    review_notes: 'PP student with significant positive trajectory. Mentoring clearly effective.',
    baseline_attendance: 91, current_attendance: 96,
    baseline_behaviour: 18, current_behaviour: 3,
    reason: 'Pupil Premium student with low engagement, declining confidence, amber signal.',
    created_at: '2026-03-20',
  },
  {
    id: 'i6', student_id: 's1', assigned_to: 'Mr Smith (Maths)', created_by: 'Ms Harris (HOY Y10)',
    action_type: 'Behaviour report card', priority: 'high', status: 'suggested',
    due_date: '2026-07-14', review_date: '2026-07-28',
    notes: 'Daily report card — Maths and Science focus. Review each Friday.',
    outcome: null,
    outcome_status: 'escalating',
    baseline_attendance: 82, current_attendance: 77,
    baseline_behaviour: 22, current_behaviour: 44,
    reason: 'Behaviour escalating across Maths and Science. Report card to track daily.',
    created_at: '2026-06-03',
  },
  {
    id: 'i7', student_id: 's4', assigned_to: 'Mr Patel (Tutor)', created_by: 'Student Signal (System)',
    action_type: 'Pastoral meeting', priority: 'medium', status: 'suggested',
    due_date: '2026-07-17', review_date: '2026-07-31',
    notes: 'Explore P4 peer dynamics. Consider whether Emma can be moved away from Kai M and Jordan T.',
    outcome: null,
    reason: 'All 5 incidents in P4, same peer group in 4 of 5 cases.',
    suggested_owner: 'Form Tutor',
    created_at: '2026-06-17',
  },
  {
    id: 'i8', student_id: 's2', assigned_to: 'Mr Ahmed (DSL)', created_by: 'Ms Jones (SENDCo)',
    action_type: 'Safeguarding referral', priority: 'urgent', status: 'suggested',
    due_date: '2026-07-13', review_date: '2026-07-25',
    notes: 'DSL to review note recorded 2026-06-02. Assess risk and agree next steps.',
    outcome: null,
    reason: 'Safeguarding note in behaviour record — parents arguing, student felt unsafe.',
    suggested_owner: 'DSL',
    created_at: '2026-06-19',
  },
  {
    id: 'i9', student_id: 's5', assigned_to: 'Mr Patel (Tutor)', created_by: 'Student Signal (System)',
    action_type: 'Discreet welfare check', priority: 'medium', status: 'suggested',
    due_date: '2026-07-17', review_date: '2026-07-31',
    notes: 'Low-key welfare check. Do not raise in group. Ask how he is generally.',
    outcome: null,
    reason: 'Positive points fallen 100%, 5 late marks, staff notes: tired, quiet, withdrawn.',
    suggested_owner: 'Form Tutor',
    created_at: '2026-06-19',
  },
  {
    id: 'i10', student_id: 's7', assigned_to: 'Ms Clark (Art)', created_by: 'Student Signal (System)',
    action_type: 'Subject teacher follow-up', priority: 'low', status: 'suggested',
    due_date: '2026-07-20', review_date: '2026-08-04',
    notes: 'Art teacher to gently explore what has changed for Anya. Avoid making it confrontational.',
    outcome: null,
    reason: '80% of incidents in Art only. Previously enthusiastic in this subject.',
    suggested_owner: 'Subject Teacher',
    created_at: '2026-06-17',
  },
  {
    id: 'i11', student_id: 's1', assigned_to: 'Mr Ahmed (DSL)', created_by: 'Ms Harris (HOY Y10)',
    action_type: 'Safeguarding referral', priority: 'urgent', status: 'suggested',
    due_date: '2026-07-15', review_date: '2026-07-28',
    notes: 'Behaviour pattern + home concern noted by form tutor. DSL to conduct initial review and determine if CP referral required.',
    outcome: null,
    reason: 'Form tutor reported Oliver arrived dishevelled on two occasions. Mentioned argument at home when pressed. HOY has escalated to DSL for review.',
    suggested_owner: 'DSL',
    created_at: '2026-06-23',
  },
  {
    id: 'i12', student_id: 's5', assigned_to: 'Mr Ahmed (DSL)', created_by: 'Mr Patel (Tutor)',
    action_type: 'DSL welfare review', priority: 'high', status: 'suggested',
    due_date: '2026-07-16', review_date: '2026-07-30',
    notes: 'Noah has become increasingly withdrawn. Staff have noticed he winces when bag is knocked. DSL to conduct discreet check and liaise with CPOMS record.',
    outcome: null,
    reason: 'Three staff members independently noted withdrawal and possible physical concern. Signal analysis flagged silent distress pattern.',
    suggested_owner: 'DSL',
    created_at: '2026-06-22',
  },
];

// ── MOCK CAREERS ──────────────────────────────────────────────────────────────
export const MOCK_CAREERS: Record<string, CareerProfile> = {
  ...DEMO_CAREERS_EXTRA,
  s1: {
    id: 'c1', student_id: 's1',
    career_interests: ['Engineering', 'Construction', 'Motor Mechanics'],
    preferred_subjects: ['Design Technology', 'Maths', 'Science'],
    strengths: 'Good practical skills, enjoys hands-on work',
    barriers: 'Attendance affecting progress, low confidence in written work',
    confidence_level: 'Medium', destination_risk: 'At risk of NEET',
    suggested_pathways: ['Level 2 Engineering', 'Construction apprenticeship', 'Motor vehicle course'],
    useful_signposting: ['College open days', 'Work experience', 'CV support', 'Interview support'],
    career_goal: 'Automotive engineer', work_experience_status: 'Not arranged',
  },
  s2: {
    id: 'c2', student_id: 's2',
    career_interests: ['Art', 'Graphic Design', 'Photography'],
    preferred_subjects: ['Art', 'Media', 'English'],
    strengths: 'Creative, detail-oriented, good visual sense',
    barriers: 'SEN support needs, anxiety around exams',
    confidence_level: 'Low', destination_risk: 'At risk of NEET',
    suggested_pathways: ['Art Foundation', 'Level 3 Art & Design', 'Creative apprenticeship'],
    useful_signposting: ['SEND careers support', 'Mentoring', 'Confidence building'],
    career_goal: 'Graphic designer', work_experience_status: 'Not arranged',
  },
  s3: {
    id: 'c3', student_id: 's3',
    career_interests: ['Sport', 'Fitness', 'Coaching'],
    preferred_subjects: ['PE', 'Biology', 'Maths'],
    strengths: 'Team player, natural leader, physically active',
    barriers: 'Maths avoidance may limit options — needs targeted support',
    confidence_level: 'Medium', destination_risk: 'High risk of NEET',
    suggested_pathways: ['Sports coaching course', 'Fitness instructor apprenticeship', 'Level 3 Sport'],
    useful_signposting: ['Work experience', 'Mentoring', 'Attendance support', 'Maths intervention'],
    career_goal: 'Sports coach', work_experience_status: 'Arranged — local sports centre',
  },
  s4: {
    id: 'c4', student_id: 's4',
    career_interests: ['Healthcare', 'Nursing', 'Social Care'],
    preferred_subjects: ['Science', 'Health & Social Care', 'English'],
    strengths: 'Caring, empathetic, good communicator',
    barriers: 'Processing difficulties, needs extra time. Peer conflict in P4 affecting confidence.',
    confidence_level: 'High', destination_risk: 'On track',
    suggested_pathways: ['T Level Health', 'Level 3 Health & Social Care', 'Nursing apprenticeship'],
    useful_signposting: ['College open days', 'Work experience in care', 'SEND careers support'],
    career_goal: 'Nurse', work_experience_status: 'Arranged — NHS placement',
  },
  s5: {
    id: 'c5', student_id: 's5',
    career_interests: ['IT', 'Gaming', 'Software Development'],
    preferred_subjects: ['Computer Science', 'Maths', 'Physics'],
    strengths: 'Analytical, logical thinker, strong in Computer Science',
    barriers: 'Pupil Premium, limited home resources. Recent disengagement — cause unknown.',
    confidence_level: 'Medium', destination_risk: 'At risk of NEET',
    suggested_pathways: ['Level 3 Computing', 'Software developer apprenticeship', 'T Level Digital'],
    useful_signposting: ['Work experience', 'Coding clubs', 'Mentoring', 'CV support'],
    career_goal: 'Software developer', work_experience_status: 'Not arranged',
  },
  s6: {
    id: 'c6', student_id: 's6',
    career_interests: ['Business', 'Marketing', 'Retail'],
    preferred_subjects: ['Business', 'Maths', 'English'],
    strengths: 'Confident speaker, organised, excellent presentation skills',
    barriers: null, confidence_level: 'High', destination_risk: 'On track',
    suggested_pathways: ['A Level Business', 'Level 3 Business', 'Marketing apprenticeship'],
    useful_signposting: ['Work experience', 'College open days', 'Interview support'],
    career_goal: 'Marketing manager', work_experience_status: 'Completed — local business',
  },
  s7: {
    id: 'c7', student_id: 's7',
    career_interests: ['Art', 'Fashion', 'Creative Design'],
    preferred_subjects: ['Art', 'English', 'Media'],
    strengths: 'Strong creative instincts, good visual communication',
    barriers: 'Recent disengagement from Art — may affect portfolio and options',
    confidence_level: 'Medium', destination_risk: 'At risk of NEET',
    suggested_pathways: ['Art Foundation', 'Fashion & Textiles Level 3', 'Creative apprenticeship'],
    useful_signposting: ['Art portfolio guidance', 'College open days', 'Mentoring'],
    career_goal: 'Fashion designer', work_experience_status: 'Not arranged',
  },
  s8: {
    id: 'c8', student_id: 's8',
    career_interests: ['Sports Science', 'Medicine', 'Biology'],
    preferred_subjects: ['Science', 'PE', 'Maths'],
    strengths: 'Strong analytical and physical ability, excellent leadership',
    barriers: null, confidence_level: 'High', destination_risk: 'On track',
    suggested_pathways: ['A Levels — Biology, Chemistry, PE', 'Sports science degree'],
    useful_signposting: ['University open days', 'Work experience — sports medicine'],
    career_goal: 'Sports physiotherapist', work_experience_status: 'Arranged — hospital physiotherapy unit',
  },
  s9: {
    id: 'c9', student_id: 's9',
    career_interests: ['Medicine', 'Research', 'Biochemistry'],
    preferred_subjects: ['Science', 'Maths', 'English'],
    strengths: 'Exceptional academic ability, peer leadership, determined',
    barriers: null, confidence_level: 'High', destination_risk: 'On track',
    suggested_pathways: ['Russell Group university — Medicine or Natural Sciences', 'Scholarship programmes'],
    useful_signposting: ['University mentoring', 'UKMT/Olympiad entry', 'NHS work experience'],
    career_goal: 'Medical researcher', work_experience_status: 'Completed — hospital work experience',
  },
  s10: {
    id: 'c10', student_id: 's10',
    career_interests: ['Software Development', 'Game Design', 'Creative Technology'],
    preferred_subjects: ['Computer Science', 'Art', 'Maths'],
    strengths: 'Outstanding coding ability, creative problem-solver, remarkable resilience',
    barriers: 'SEN support needs — ensure adjustments in assessments',
    confidence_level: 'High', destination_risk: 'On track',
    suggested_pathways: ['Computer Science degree', 'Software developer apprenticeship'],
    useful_signposting: ['Tech company work experience', 'Coding competition entry', 'University open days', 'SEND transitions support'],
    career_goal: 'Software engineer', work_experience_status: 'Arranged — local tech company',
  },
};

// ── MOCK STATS ────────────────────────────────────────────────────────────────
export const MOCK_STATS: DashboardStats = {
  red_priority: 5,            // s1, s2, s11, s16, s21
  amber_watchlist: 7,         // s3, s4, s12, s17, s22, s24 (s23 is purple)
  hidden_decline: 5,          // s5, s7, s13, s18, s23
  positive_growth: 7,         // s6, s8, s14, s19, s20, s25, s27
  exceptional_achievement: 4, // s9, s10, s15, s26
  open_interventions: 15,
  overdue_actions: 3,
  improving_after_intervention: 2,
  escalating_despite_intervention: 1,
  intervention_success_rate: 67,
  attendance_concerns: 10,
  behaviour_escalation: 6,
  safeguarding_flags: 4,
  send_support: 7,
  career_support: 9,
  completed_interventions: 2,
  review_due: 5,
};

// ── DATA HELPERS ──────────────────────────────────────────────────────────────

export async function getStudents(schoolId: string | null | undefined): Promise<Student[]> {
  if (!schoolId) return MOCK_STUDENTS;
  const { data, error } = await supabase.from('students').select('*').eq('school_id', schoolId);
  if (error) return [];
  return (data || []) as Student[];
}

export async function getAnalysisResults(schoolId: string | null | undefined): Promise<AnalysisResult[]> {
  if (!schoolId) return Object.values(MOCK_ANALYSIS);
  const { data, error } = await supabase.from('analysis_results').select('*').eq('school_id', schoolId);
  if (error) return [];
  if (!data || data.length === 0) return [];
  return data.map((a) => ({
    ...a,
    key_reasons: Array.isArray(a.key_reasons) ? a.key_reasons : JSON.parse(a.key_reasons as string || '[]'),
    subjects_involved: Array.isArray(a.subjects_involved) ? a.subjects_involved : JSON.parse(a.subjects_involved as string || '[]'),
    periods_involved: Array.isArray(a.periods_involved) ? a.periods_involved : JSON.parse(a.periods_involved as string || '[]'),
  })) as AnalysisResult[];
}

export async function getAnalysisForStudent(schoolId: string | null | undefined, studentId: string): Promise<AnalysisResult | null> {
  if (!schoolId) return MOCK_ANALYSIS[studentId] || null;
  const { data, error } = await supabase.from('analysis_results').select('*').eq('school_id', schoolId).eq('student_id', studentId).maybeSingle();
  if (error || !data) return MOCK_ANALYSIS[studentId] || null;
  return {
    ...data,
    key_reasons: Array.isArray(data.key_reasons) ? data.key_reasons : JSON.parse(data.key_reasons as string || '[]'),
    subjects_involved: Array.isArray(data.subjects_involved) ? data.subjects_involved : JSON.parse(data.subjects_involved as string || '[]'),
    periods_involved: Array.isArray(data.periods_involved) ? data.periods_involved : JSON.parse(data.periods_involved as string || '[]'),
  } as AnalysisResult;
}

export async function getBehaviourRecords(schoolId: string | null | undefined, studentId?: string): Promise<BehaviourRecord[]> {
  if (!schoolId) {
    const live = studentId ? _demoBehaviourRecords.filter(r => r.student_id === studentId) : _demoBehaviourRecords;
    const mock = studentId ? (MOCK_BEHAVIOUR[studentId] || []) : Object.values(MOCK_BEHAVIOUR).flat();
    return [...live, ...mock];
  }
  let q = supabase.from('behaviour_records').select('*').eq('school_id', schoolId);
  if (studentId) q = q.eq('student_id', studentId);
  const { data, error } = await q.order('date', { ascending: false });
  if (error) return [];
  return (data || []) as BehaviourRecord[];
}

export async function getInterventions(schoolId: string | null | undefined, studentId?: string): Promise<Intervention[]> {
  if (!schoolId) {
    // Demo mode: demo entries win on matching IDs.
    // Suppress student-level mock entries only in the full list (no studentId),
    // to prevent the same student appearing twice in the action queue when a
    // demo intervention exists for them.  Per-student queries always show all.
    const demoInts = getDemoInterventions();
    const demoIds = new Set(demoInts.map(i => i.id));
    if (studentId) {
      // Per-student: merge demo entries (including status updates) + remaining mock entries for that student
      const mock = MOCK_INTERVENTIONS.filter(i => i.student_id === studentId && !demoIds.has(i.id));
      return [...demoInts.filter(i => i.student_id === studentId), ...mock];
    }
    const demoStudentIds = new Set(
      demoInts.filter(i => !['completed', 'cancelled', 'closed'].includes(i.status)).map(i => i.student_id)
    );
    const merged = [...demoInts, ...MOCK_INTERVENTIONS.filter(i => !demoIds.has(i.id) && !demoStudentIds.has(i.student_id))];
    return merged;
  }
  let q = supabase.from('interventions').select('*').eq('school_id', schoolId).order('created_at', { ascending: false });
  if (studentId) q = q.eq('student_id', studentId);
  const { data, error } = await q;
  if (error) return [];
  return (data || []) as Intervention[];
}

export interface SchoolProfile {
  id: string;
  full_name: string | null;
  role: string | null;
  year_groups: string[] | null;
  form_groups: string[] | null;
  department: string | null;
  is_active: boolean | null;
  can_view_safeguarding: boolean | null;
}

/** Fetch all active staff profiles for the school — used by assignment modals. */
export async function getSchoolProfiles(schoolId: string | null | undefined): Promise<SchoolProfile[]> {
  if (!schoolId) {
    // Demo mode: convert DEMO_STAFF to the same shape
    return DEMO_STAFF.map(s => ({
      id: s.name, // demo: use name as id
      full_name: s.name,
      role: s.role,
      year_groups: null, // DEMO_STAFF does not carry year_groups; live profiles do
      form_groups: null,
      department: null,
      is_active: true,
      can_view_safeguarding: s.role === 'dsl',
    }));
  }
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, year_groups, form_groups, department, is_active, can_view_safeguarding')
    .eq('school_id', schoolId)
    .eq('is_active', true)
    .order('full_name');
  if (error) { console.error('getSchoolProfiles error:', error.message); return []; }
  return (data ?? []) as SchoolProfile[];
}


export async function getCareerProfile(schoolId: string | null | undefined, studentId: string): Promise<CareerProfile | null> {
  if (!schoolId) return MOCK_CAREERS[studentId] || null;
  const { data, error } = await supabase.from('career_profiles').select('*').eq('school_id', schoolId).eq('student_id', studentId).maybeSingle();
  if (error || !data) return MOCK_CAREERS[studentId] || null;
  return {
    ...data,
    career_interests: Array.isArray(data.career_interests) ? data.career_interests : JSON.parse(data.career_interests as string || '[]'),
    preferred_subjects: Array.isArray(data.preferred_subjects) ? data.preferred_subjects : JSON.parse(data.preferred_subjects as string || '[]'),
    suggested_pathways: Array.isArray(data.suggested_pathways) ? data.suggested_pathways : JSON.parse(data.suggested_pathways as string || '[]'),
    useful_signposting: Array.isArray(data.useful_signposting) ? data.useful_signposting : JSON.parse(data.useful_signposting as string || '[]'),
  } as CareerProfile;
}

export async function getCareerProfiles(schoolId: string | null | undefined): Promise<CareerProfile[]> {
  if (!schoolId) return Object.values(MOCK_CAREERS);
  const { data, error } = await supabase.from('career_profiles').select('*').eq('school_id', schoolId);
  if (error || !data || data.length === 0) return [];
  return data.map((c) => ({
    ...c,
    career_interests: Array.isArray(c.career_interests) ? c.career_interests : JSON.parse(c.career_interests as string || '[]'),
    preferred_subjects: Array.isArray(c.preferred_subjects) ? c.preferred_subjects : JSON.parse(c.preferred_subjects as string || '[]'),
    suggested_pathways: Array.isArray(c.suggested_pathways) ? c.suggested_pathways : JSON.parse(c.suggested_pathways as string || '[]'),
    useful_signposting: Array.isArray(c.useful_signposting) ? c.useful_signposting : JSON.parse(c.useful_signposting as string || '[]'),
  })) as CareerProfile[];
}

export async function getDashboardStats(schoolId: string | null | undefined): Promise<DashboardStats> {
  if (!schoolId) return { ...MOCK_STATS };
  const stats = { ...MOCK_STATS };
  Object.keys(stats).forEach(k => { (stats as Record<string, number>)[k] = 0; });
  try {
    const { count: redCount }       = await supabase.from('analysis_results').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('signal_category', 'red');
    const { count: amberCount }     = await supabase.from('analysis_results').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('signal_category', 'amber');
    const { count: purpleCount }    = await supabase.from('analysis_results').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('signal_category', 'purple');
    const { count: greenCount }     = await supabase.from('analysis_results').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('signal_category', 'green');
    const { count: blueCount }      = await supabase.from('analysis_results').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('signal_category', 'blue');
    const { count: openInt }        = await supabase.from('interventions').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).in('status', ['suggested', 'open', 'in_progress', 'assigned']);
    const { count: completedInt }   = await supabase.from('interventions').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'completed');
    const { count: improving }      = await supabase.from('interventions').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).in('outcome_status', ['improving', 'resolved', 'sustained']);
    const { count: escalating }     = await supabase.from('interventions').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).eq('outcome_status', 'escalating');
    const { count: attendConcern }  = await supabase.from('analysis_results').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).in('attendance_trend', ['Critical decline', 'Declining', 'Below target']);
    const { count: behavEsc }       = await supabase.from('analysis_results').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).in('behaviour_trend', ['Escalating', 'Concerning']);
    const { count: safe }           = await supabase.from('behaviour_records').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).not('safeguarding_note', 'is', null);
    const { count: send }           = await supabase.from('students').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).not('send_status', 'is', null);
    const { count: career }         = await supabase.from('career_profiles').select('*', { count: 'exact', head: true }).eq('school_id', schoolId).not('destination_risk', 'is', null).not('destination_risk', 'eq', 'On track');

    if (redCount !== null)      stats.red_priority = redCount;
    if (amberCount !== null)    stats.amber_watchlist = amberCount;
    if (purpleCount !== null)   stats.hidden_decline = purpleCount;
    if (greenCount !== null)    stats.positive_growth = greenCount;
    if (blueCount !== null)     stats.exceptional_achievement = blueCount;
    if (openInt !== null)       stats.open_interventions = openInt;
    if (completedInt !== null)  stats.completed_interventions = completedInt;
    if (improving !== null)     stats.improving_after_intervention = improving;
    if (escalating !== null)    stats.escalating_despite_intervention = escalating;
    if (attendConcern !== null) stats.attendance_concerns = attendConcern;
    if (behavEsc !== null)      stats.behaviour_escalation = behavEsc;
    if (safe !== null)          stats.safeguarding_flags = safe;
    if (send !== null)          stats.send_support = send;
    if (career !== null)        stats.career_support = career;

    const total = (improving ?? 0) + (escalating ?? 0);
    if (total > 0) stats.intervention_success_rate = Math.round(((improving ?? 0) / total) * 100);
  } catch {
    // keep mock stats
  }
  return stats;
}

export async function getStudent(schoolId: string | null | undefined, studentId: string): Promise<Student | null> {
  if (!schoolId) return MOCK_STUDENTS.find((s) => s.id === studentId) || null;
  const { data } = await supabase.from('students').select('*').eq('school_id', schoolId).eq('id', studentId).maybeSingle();
  if (data) return data as Student;
  // Fallback: query without school_id constraint (RLS handles security) in case of ID format mismatch
  const { data: fallback } = await supabase.from('students').select('*').eq('id', studentId).maybeSingle();
  if (fallback) return fallback as Student;
  return MOCK_STUDENTS.find((s) => s.id === studentId) || null;
}

export async function seedMockData(schoolId: string) {
  const { data: existingStudents } = await supabase.from('students').select('id').eq('school_id', schoolId).limit(1);
  if (existingStudents && existingStudents.length > 0) return;

  const { data: insertedStudents } = await supabase
    .from('students')
    .insert(MOCK_STUDENTS.map((s) => ({ ...s, school_id: schoolId })))
    .select('id, name');

  if (!insertedStudents) return;
  const nameToId = new Map<string, string>();
  insertedStudents.forEach((s) => nameToId.set((s as any).name, (s as any).id));

  await supabase.from('behaviour_records').insert(
    Object.values(MOCK_BEHAVIOUR).flat().map((b) => ({
      ...b, school_id: schoolId,
      student_id: nameToId.get(MOCK_STUDENTS.find((st) => st.id === b.student_id)?.name || '') || b.student_id,
    }))
  );

  await supabase.from('analysis_results').insert(
    Object.values(MOCK_ANALYSIS).map((a) => ({
      ...a, school_id: schoolId,
      student_id: nameToId.get(MOCK_STUDENTS.find((st) => st.id === a.student_id)?.name || '') || a.student_id,
    }))
  );

  await supabase.from('interventions').insert(
    MOCK_INTERVENTIONS.map((i) => ({
      ...i, school_id: schoolId,
      student_id: nameToId.get(MOCK_STUDENTS.find((st) => st.id === i.student_id)?.name || '') || i.student_id,
    }))
  );

  await supabase.from('career_profiles').insert(
    Object.values(MOCK_CAREERS).map((c) => ({
      ...c, school_id: schoolId,
      student_id: nameToId.get(MOCK_STUDENTS.find((st) => st.id === c.student_id)?.name || '') || c.student_id,
    }))
  );
}

// ── COMMUNICATIONS ─────────────────────────────────────────────────────────────

export const MOCK_COMMUNICATIONS: Communication[] = [
  ...DEMO_COMMUNICATIONS_EXTRA,
  {
    id: 'cm16', student_id: 's1', date: '2026-06-18', source: 'phone',
    summary: 'Mum called to report Oliver has been unwell and will be absent this week. Mentioned ongoing issues at home.',
    priority: 'high', staff_member: 'Ms Harris',
    follow_up_required: true, follow_up_date: '2026-06-23',
    linked_action_id: null, notes: 'Consider safeguarding check-in on return.',
    created_at: '2026-06-18T09:15:00Z',
  },
  {
    id: 'cm17', student_id: 's1', date: '2026-06-12', source: 'meeting',
    summary: 'Pastoral meeting with Oliver. Discussed poor attendance and disengagement in Maths. Student disclosed friendship difficulties.',
    priority: 'high', staff_member: 'Ms Jones',
    follow_up_required: true, follow_up_date: '2026-06-19',
    linked_action_id: null, notes: 'Student tearful. Alert DSL.',
    created_at: '2026-06-12T14:00:00Z',
  },
  {
    id: 'cm18', student_id: 's2', date: '2026-06-17', source: 'external_agency',
    summary: 'CAMHS referral accepted. Appointment scheduled for 4 July. School to provide background information.',
    priority: 'urgent', staff_member: 'Mr Ahmed (DSL)',
    follow_up_required: true, follow_up_date: '2026-06-25',
    linked_action_id: null, notes: 'Do not disclose CAMHS referral to non-DSL staff without consent.',
    created_at: '2026-06-17T11:30:00Z',
  },
  {
    id: 'cm19', student_id: 's3', date: '2026-06-15', source: 'email',
    summary: 'Parent emailed to say James is finding Maths very stressful. Requests conversation with teacher.',
    priority: 'normal', staff_member: 'Ms Williams',
    follow_up_required: true, follow_up_date: '2026-06-20',
    linked_action_id: null, notes: null,
    created_at: '2026-06-15T08:45:00Z',
  },
  {
    id: 'cm20', student_id: 's4', date: '2026-06-14', source: 'phone',
    summary: 'Dad rang to query Emma\'s SEN Support plan. Wants an updated copy. Referred to SENDCo.',
    priority: 'normal', staff_member: 'Ms Jones (SENDCo)',
    follow_up_required: false, follow_up_date: null,
    linked_action_id: null, notes: null,
    created_at: '2026-06-14T10:00:00Z',
  },
  {
    id: 'cm21', student_id: 's6', date: '2026-06-11', source: 'meeting',
    summary: 'Parent meeting — Isla\'s progress celebrated. Attendance now 94%. Pastoral plan completed. No further actions needed.',
    priority: 'low', staff_member: 'Ms Harris',
    follow_up_required: false, follow_up_date: null,
    linked_action_id: null, notes: 'Success story — nominate for Recognition Board.',
    created_at: '2026-06-11T15:30:00Z',
  },
  {
    id: 'cm22', student_id: 's5', date: '2026-06-16', source: 'pastoral_conversation',
    summary: 'Noah spoke to Ms Jones in form time about feeling isolated. Mentioned he has not been sleeping well.',
    priority: 'high', staff_member: 'Ms Jones',
    follow_up_required: true, follow_up_date: '2026-06-20',
    linked_action_id: null, notes: 'Alert HOY. Check for wellbeing indicators.',
    created_at: '2026-06-16T09:00:00Z',
  },
];

export async function getCommunications(schoolId: string | null | undefined, studentId?: string): Promise<Communication[]> {
  if (!schoolId) {
    const all = MOCK_COMMUNICATIONS;
    return studentId ? all.filter(c => c.student_id === studentId) : all;
  }
  let q = supabase.from('communications').select('*').eq('school_id', schoolId).order('date', { ascending: false });
  if (studentId) q = q.eq('student_id', studentId);
  const { data, error } = await q;
  if (error || !data || data.length === 0) return [];
  return data as Communication[];
}

export async function createCommunication(schoolId: string | null | undefined, comm: Omit<Communication, 'id' | 'created_at'>): Promise<Communication> {
  const id = 'local_' + Math.random().toString(36).slice(2) + Date.now();
  const created_at = new Date().toISOString();
  const newComm: Communication = { id, created_at, ...comm };
  if (!schoolId) {
    MOCK_COMMUNICATIONS.unshift(newComm);
    return newComm;
  }
  const { data, error } = await supabase.from('communications').insert({ school_id: schoolId, ...comm }).select().single();
  if (error || !data) {
    MOCK_COMMUNICATIONS.unshift(newComm);
    return newComm;
  }
  triggerReanalysis(schoolId);
  return data as Communication;
}

// ── Pending-comms pub/sub (for quick-log → comms page live update) ────────────

const _commListeners: Array<() => void> = [];

export function subscribeToComms(fn: () => void): () => void {
  _commListeners.push(fn);
  return () => { const i = _commListeners.indexOf(fn); if (i !== -1) _commListeners.splice(i, 1); };
}

function notifyCommListeners() { _commListeners.forEach(fn => fn()); }

export function routeCommunication(id: string): void {
  const c = MOCK_COMMUNICATIONS.find(c => c.id === id);
  if (c) { (c as any).routing_status = 'routed'; notifyCommListeners(); }
}

export function dismissCommunication(id: string): void {
  const c = MOCK_COMMUNICATIONS.find(c => c.id === id);
  if (c) { (c as any).routing_status = 'dismissed'; notifyCommListeners(); }
}

