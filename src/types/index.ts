export type SignalCategory = 'red' | 'amber' | 'purple' | 'green' | 'blue';

export type UserRole = 'admin' | 'slt' | 'dsl' | 'sendco' | 'head_of_year' | 'tutor' | 'careers_lead' | 'staff';

export type NoteVisibility = 'general' | 'pastoral' | 'send' | 'dsl_only' | 'slt_only';

export type GraduationStatus = 'active' | 'monitor' | 'stable' | 'success_story';

export type OutcomeAchieved = 'achieved' | 'partially' | 'not_achieved';

export type PatternPersistence = 'new' | 'recurring' | 'resolved' | 'reappeared';

export interface StaffMember {
  name: string;
  role: string;
}

export interface Student {
  id: string;
  name: string;
  year_group: string;
  form: string;
  send_status: string | null;
  pupil_premium: boolean;
  behaviour_score?: number;
  attendance_pct?: number;
  risk_level?: 'red' | 'amber' | 'green';
  signal_category?: SignalCategory;
  positive_points?: number;
  punctuality_issues?: number;
  photo_url?: string | null;
  graduation_status?: GraduationStatus;
}

export interface BehaviourRecord {
  id: string;
  student_id: string;
  date: string;
  incident_type: string;
  behaviour_points: number;
  lesson_period: string | null;
  subject: string | null;
  staff_member: string | null;
  comment: string | null;
  safeguarding_note: string | null;
  positive_points?: number;
  praise_comment?: string | null;
}

export interface AnalysisResult {
  id: string;
  student_id: string;
  risk_level: 'red' | 'amber' | 'green';
  signal_category?: SignalCategory;
  risk_score?: number;
  key_reasons: string[];
  behaviour_trend: string;
  attendance_trend: string;
  subjects_involved: string[];
  periods_involved: string[];
  suggested_pastoral_action: string | null;
  suggested_parent_contact: string | null;
  suggested_staff_action: string | null;
  career_signposting: string | null;
  recommended_review_date: string | null;
  signal_explanation?: string | null;
  previous_state?: string | null;
  current_state?: string | null;
  what_changed?: string | null;
  contributing_intervention?: string | null;
  suggested_recognition?: string | null;
  celebration_type?: string | null;
  strengths?: string | null;
  barriers?: string | null;
  recent_improvements?: string | null;
  repeated_patterns?: Array<{ type: string; value: any; count: number }>;
  linked_peers?: string[];
  suggested_next_steps?: Array<{ role: string; action: string; priority: string }>;
  evidence_count?: number;
  data_sources?: string[];
  confidence_score?: number;
}

export interface Intervention {
  id: string;
  student_id: string;
  assigned_to: string;
  assigned_role?: string | null;
  created_by?: string | null;
  action_type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'suggested' | 'open' | 'assigned' | 'in_progress' | 'awaiting_review' | 'review_due' | 'completed' | 'escalated' | 'closed' | 'cancelled';
  due_date: string | null;
  review_date?: string | null;
  notes: string | null;
  outcome: string | null;
  outcome_achieved?: OutcomeAchieved | null;
  outcome_notes?: string | null;
  outcome_status?: 'improving' | 'no_change' | 'escalating' | 'resolved' | 'sustained';
  review_completed?: boolean;
  review_action_taken?: boolean | null;
  review_student_improved?: 'improved' | 'no_change' | 'worsened' | null;
  review_notes?: string | null;
  reason?: string | null;
  suggested_owner?: string | null;
  baseline_attendance?: number | null;
  current_attendance?: number | null;
  after_attendance?: number | null;
  baseline_behaviour?: number | null;
  current_behaviour?: number | null;
  after_behaviour?: number | null;
  created_at: string;
  // Escalation fields
  escalated_to?: string | null;
  escalation_reason?: string | null;
  escalated_by?: string | null;
  escalated_at?: string | null;
  escalation_notes?: string | null;
  prev_status?: string | null;
  completed_by?: string | null;
  completed_at?: string | null;
  next_step?: string | null;
  source?: 'auto' | 'manual' | null;
  assigned_to_user_id?: string | null;
}

export interface PatternWorkflowRecord {
  id?: string;
  school_id?: string;
  student_id: string;
  pattern_id: string;
  status: 'not_actioned' | 'assigned' | 'in_progress' | 'awaiting_review' | 'completed' | 'escalated' | 'dismissed';
  persistence: PatternPersistence;
  owner_name: string;
  owner_role: string;
  action_type: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  due_date: string | null;
  review_date: string | null;
  notes: string;
  outcome_notes: string;
  dismissed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CareerProfile {
  id: string;
  student_id: string;
  career_interests: string[];
  preferred_subjects: string[];
  strengths: string | null;
  barriers: string | null;
  confidence_level: string | null;
  destination_risk: string | null;
  suggested_pathways: string[];
  useful_signposting: string[];
  career_goal?: string | null;
  work_experience_status?: string | null;
}

export interface DashboardStats {
  red_priority: number;
  amber_watchlist: number;
  hidden_decline: number;
  positive_growth: number;
  exceptional_achievement: number;
  open_interventions: number;
  overdue_actions: number;
  improving_after_intervention: number;
  escalating_despite_intervention: number;
  intervention_success_rate: number;
  attendance_concerns: number;
  behaviour_escalation: number;
  safeguarding_flags: number;
  send_support: number;
  career_support: number;
  completed_interventions: number;
  review_due: number;
}

export interface UploadRecord {
  id: string;
  filename: string;
  row_count: number;
  status: string;
  created_at: string;
}

export interface Report {
  id: string;
  title: string;
  content: Record<string, unknown>;
  created_at: string;
}

export type CommunicationSource = 'email' | 'phone' | 'meeting' | 'letter' | 'external_agency' | 'pastoral_conversation';
export type CommunicationPriority = 'low' | 'normal' | 'high' | 'urgent';

export interface Communication {
  id: string;
  student_id: string;
  date: string;
  source: CommunicationSource;
  summary: string;
  priority: CommunicationPriority;
  staff_member: string;
  follow_up_required: boolean;
  follow_up_date: string | null;
  linked_action_id: string | null;
  notes: string | null;
  created_at: string;
  routing_status?: 'pending_review' | 'routed' | 'dismissed';
  suggested_assignee?: string | null;
}

export type QuickNoteConcernLevel = 1 | 2 | 3 | 4 | 5;

export type QuickNoteCategory =
  | 'Pastoral concern'
  | 'Positive observation'
  | 'Attendance concern'
  | 'Behaviour concern'
  | 'SEND observation'
  | 'Safeguarding review prompt'
  | 'Parent communication'
  | 'Academic concern'
  | 'Career/destination concern'
  | 'General note';

export interface QuickNote {
  id: string;
  student_id: string;
  category: QuickNoteCategory;
  concern_level: QuickNoteConcernLevel;
  visibility: NoteVisibility;
  note: string;
  staff_member: string;
  date: string;
  created_at: string;
  action_needed?: boolean;
  assign_to?: string | null;
  follow_up_date?: string | null;
}

