import type { Student, BehaviourRecord, AnalysisResult, Intervention, CareerProfile, Communication } from '../types';

// ── DEMO DATA: Additional 17 students (s11-s27) ────────────────────────────────────
// These students expand the core 10-student dataset with realistic Year 9 and Year 11 stories.
// Dates are all relative to 2026-06-27 (today), looking back 8 weeks to 2026-04-28.
// All IDs follow the convention: students s1-s27, behaviour b1-b100, analysis a1-a27,
// interventions i1-i20, careers c1-c27, comms cm1-cm15.

// ────────────────────────────────────────────────────────────────────────────────────
// DEMO STUDENTS (s11-s27)
// ────────────────────────────────────────────────────────────────────────────────────

export const DEMO_STUDENTS_EXTRA: Student[] = [
  // YEAR 9 STUDENTS

  // s11 — RED — Active bullying perpetrator
  {
    id: 's11', name: 'Kai Morrison', year_group: 'Year 9', form: '9A',
    send_status: null, pupil_premium: true,
    risk_level: 'red', signal_category: 'red',
    behaviour_score: 32, attendance_pct: 91, punctuality_issues: 2,
  },

  // s12 — AMBER — Exam anxiety + attendance avoidance
  {
    id: 's12', name: 'Fatima Hussain', year_group: 'Year 9', form: '9C',
    send_status: 'SEN Support', pupil_premium: false,
    risk_level: 'amber', signal_category: 'amber',
    behaviour_score: 12, attendance_pct: 82, punctuality_issues: 6,
  },

  // s13 — PURPLE — Quiet withdrawal
  {
    id: 's13', name: 'Luca Benetti', year_group: 'Year 9', form: '9B',
    send_status: null, pupil_premium: true,
    risk_level: 'amber', signal_category: 'purple',
    behaviour_score: 5, attendance_pct: 89, punctuality_issues: 4,
    positive_points: 0,
  },

  // s14 — GREEN — Turnaround after SEND support
  {
    id: 's14', name: 'Amara Osei', year_group: 'Year 9', form: '9A',
    send_status: 'EHCP', pupil_premium: false,
    risk_level: 'green', signal_category: 'green',
    behaviour_score: 4, attendance_pct: 96, positive_points: 12, punctuality_issues: 0,
  },

  // s15 — BLUE — Exceptional Year 9
  {
    id: 's15', name: 'Zara Ahmed', year_group: 'Year 9', form: '9C',
    send_status: null, pupil_premium: false,
    risk_level: 'green', signal_category: 'blue',
    behaviour_score: 0, attendance_pct: 98, positive_points: 42, punctuality_issues: 0,
  },

  // YEAR 10 STUDENTS

  // s16 — RED — Persistent exclusion risk
  {
    id: 's16', name: 'Tyler Walsh', year_group: 'Year 10', form: '10C',
    send_status: null, pupil_premium: true,
    risk_level: 'red', signal_category: 'red',
    behaviour_score: 51, attendance_pct: 81, punctuality_issues: 8,
  },

  // s17 — AMBER — Friendship group breakdown
  {
    id: 's17', name: 'Chloe Barnes', year_group: 'Year 10', form: '10B',
    send_status: 'SEN Support', pupil_premium: false,
    risk_level: 'amber', signal_category: 'amber',
    behaviour_score: 16, attendance_pct: 83, punctuality_issues: 5,
  },

  // s18 — PURPLE — Academic pressure / perfectionist anxiety
  {
    id: 's18', name: 'Dev Sharma', year_group: 'Year 10', form: '10A',
    send_status: null, pupil_premium: false,
    risk_level: 'amber', signal_category: 'purple',
    behaviour_score: 8, attendance_pct: 97, punctuality_issues: 0,
    positive_points: 28,
  },

  // s19 — GREEN — PP success story
  {
    id: 's19', name: 'Jordan Mitchell', year_group: 'Year 10', form: '10D',
    send_status: null, pupil_premium: true,
    risk_level: 'green', signal_category: 'green',
    behaviour_score: 3, attendance_pct: 93, positive_points: 19, punctuality_issues: 0,
  },

  // s20 — GREEN — Resolved after bullying intervention
  {
    id: 's20', name: 'Ellie Carter', year_group: 'Year 10', form: '10C',
    send_status: null, pupil_premium: false,
    risk_level: 'green', signal_category: 'green',
    behaviour_score: 2, attendance_pct: 95, positive_points: 14, punctuality_issues: 1,
  },

  // YEAR 11 STUDENTS

  // s21 — RED — GCSE stress + housing instability
  {
    id: 's21', name: 'Rhys Evans', year_group: 'Year 11', form: '11B',
    send_status: null, pupil_premium: true,
    risk_level: 'red', signal_category: 'red',
    behaviour_score: 38, attendance_pct: 74, punctuality_issues: 11,
  },

  // s22 — AMBER — EHCP + exam accommodations unconfirmed
  {
    id: 's22', name: 'Phoebe Walsh', year_group: 'Year 11', form: '11A',
    send_status: 'EHCP', pupil_premium: false,
    risk_level: 'amber', signal_category: 'amber',
    behaviour_score: 10, attendance_pct: 89, punctuality_issues: 2,
  },

  // s23 — PURPLE — Gradual disengagement since mocks
  {
    id: 's23', name: 'Callum Reid', year_group: 'Year 11', form: '11C',
    send_status: null, pupil_premium: false,
    risk_level: 'amber', signal_category: 'purple',
    behaviour_score: 6, attendance_pct: 91, punctuality_issues: 1,
    positive_points: 2,
  },

  // s24 — AMBER — Recent bereavement
  {
    id: 's24', name: 'Nadia Kowalski', year_group: 'Year 11', form: '11A',
    send_status: null, pupil_premium: false,
    risk_level: 'amber', signal_category: 'amber',
    behaviour_score: 4, attendance_pct: 84, punctuality_issues: 3,
  },

  // s25 — GREEN — Remarkable turnaround from exclusion
  {
    id: 's25', name: 'Jasmine Clarke', year_group: 'Year 11', form: '11B',
    send_status: null, pupil_premium: true,
    risk_level: 'green', signal_category: 'green',
    behaviour_score: 2, attendance_pct: 94, positive_points: 22, punctuality_issues: 0,
  },

  // s26 — BLUE — Top of year in sciences
  {
    id: 's26', name: 'Aaron Chen', year_group: 'Year 11', form: '11C',
    send_status: null, pupil_premium: false,
    risk_level: 'green', signal_category: 'blue',
    behaviour_score: 0, attendance_pct: 99, positive_points: 50, punctuality_issues: 0,
  },

  // s27 — GREEN — Resolved SEND case
  {
    id: 's27', name: 'Bethany Okafor', year_group: 'Year 11', form: '11A',
    send_status: 'EHCP', pupil_premium: false,
    risk_level: 'green', signal_category: 'green',
    behaviour_score: 1, attendance_pct: 95, positive_points: 16, punctuality_issues: 0,
  },
];

// ────────────────────────────────────────────────────────────────────────────────────
// DEMO BEHAVIOUR RECORDS (b21-b100)
// ────────────────────────────────────────────────────────────────────────────────────

export const DEMO_BEHAVIOUR_EXTRA: Record<string, BehaviourRecord[]> = {

  // s11: Kai Morrison — bullying perpetrator (4 incidents over 6 weeks)
  s11: [
    { id: 'b50', student_id: 's11', date: '2026-05-08', incident_type: 'Bullying', behaviour_points: 8, lesson_period: 'P3', subject: 'PE', staff_member: 'Mr Davis', comment: 'Taunting Year 9 peer about appearance. Targeted behaviour.', safeguarding_note: null },
    { id: 'b51', student_id: 's11', date: '2026-05-18', incident_type: 'Bullying', behaviour_points: 10, lesson_period: 'P4', subject: 'Science', staff_member: 'Dr Patel', comment: 'Deliberately excluded peer from group work. Exclusionary behaviour noted.', safeguarding_note: null },
    { id: 'b52', student_id: 's11', date: '2026-05-28', incident_type: 'Bullying', behaviour_points: 8, lesson_period: 'Lunch', subject: null, staff_member: 'Ms Williams', comment: 'Physically aggressive towards younger student. Reported by peer witness.', safeguarding_note: 'Witness statement taken. Reported to DSL.' },
    { id: 'b53', student_id: 's11', date: '2026-06-10', incident_type: 'Bullying', behaviour_points: 6, lesson_period: 'P2', subject: 'English', staff_member: 'Ms Jones', comment: 'Name-calling towards Emma T. Repeated pattern from earlier incidents.', safeguarding_note: null },
  ],

  // s12: Fatima Hussain — exam anxiety (incidents before tests)
  s12: [
    { id: 'b54', student_id: 's12', date: '2026-05-10', incident_type: 'Disruption', behaviour_points: 3, lesson_period: 'P3', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Asked to leave exam practice — anxiety symptoms visible', safeguarding_note: null },
    { id: 'b55', student_id: 's12', date: '2026-05-17', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'English', staff_member: 'Ms Jones', comment: 'Called in sick. Pattern of illness before assessed lessons.', safeguarding_note: null },
    { id: 'b56', student_id: 's12', date: '2026-06-02', incident_type: 'Disruption', behaviour_points: 4, lesson_period: 'P2', subject: 'Science', staff_member: 'Dr Patel', comment: 'Off-task and anxious during mock exam week. Requested adjustments.', safeguarding_note: null },
    { id: 'b57', student_id: 's12', date: '2026-06-09', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P3', subject: 'Science', staff_member: 'Dr Patel', comment: 'Sixth absence before formal tests. SEN support plan needs review.', safeguarding_note: null },
  ],

  // s13: Luca Benetti — withdrawal pattern
  s13: [
    { id: 'b58', student_id: 's13', date: '2026-05-05', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P4', subject: 'Drama', staff_member: 'Ms Clark', comment: 'Excellent performance in group work', safeguarding_note: null, positive_points: 7, praise_comment: 'Confident and engaged' },
    { id: 'b59', student_id: 's13', date: '2026-05-18', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Not himself today — very quiet', safeguarding_note: null },
    { id: 'b60', student_id: 's13', date: '2026-05-30', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'English', staff_member: 'Ms Jones', comment: 'Withdrawn during participation task — unusual for him', safeguarding_note: null },
    { id: 'b61', student_id: 's13', date: '2026-06-12', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'PE', staff_member: 'Mr Davis', comment: 'Sits alone at lunch now. Staff concerned about wellbeing.', safeguarding_note: null },
  ],

  // s14: Amara Osei — turnaround after SEND support
  s14: [
    { id: 'b62', student_id: 's14', date: '2026-04-28', incident_type: 'Disruption', behaviour_points: 5, lesson_period: 'P2', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Appeared frustrated. EHCP in draft.', safeguarding_note: null },
    { id: 'b63', student_id: 's14', date: '2026-05-12', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P1', subject: 'English', staff_member: 'Ms Jones', comment: 'EHCP now finalised. Huge improvement in engagement.', safeguarding_note: null, positive_points: 6, praise_comment: 'Responding well to support structure' },
    { id: 'b64', student_id: 's14', date: '2026-05-25', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P3', subject: 'Science', staff_member: 'Dr Patel', comment: 'Completing all work with support staff. Confident.', safeguarding_note: null, positive_points: 6, praise_comment: 'Real progress — EHCP is meeting need' },
  ],

  // s15: Zara Ahmed — exceptional (no incidents, all praise)
  s15: [
    { id: 'b65', student_id: 's15', date: '2026-06-02', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P2', subject: 'Science', staff_member: 'Dr Patel', comment: 'Top of mock in Chemistry. Mentoring other students.', safeguarding_note: null, positive_points: 9, praise_comment: 'Exceptional academic standard' },
    { id: 'b66', student_id: 's15', date: '2026-06-10', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P1', subject: 'English', staff_member: 'Ms Jones', comment: 'Leadership in peer support group. Chosen as Year 9 ambassador.', safeguarding_note: null, positive_points: 8, praise_comment: 'Outstanding peer contribution' },
    { id: 'b67', student_id: 's15', date: '2026-06-18', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P4', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Consistently excellent across all subjects.', safeguarding_note: null, positive_points: 8, praise_comment: 'Role model for year group' },
  ],

  // s16: Tyler Walsh — persistent exclusion risk
  s16: [
    { id: 'b68', student_id: 's16', date: '2026-05-02', incident_type: 'Aggression', behaviour_points: 15, lesson_period: 'P3', subject: 'Science', staff_member: 'Dr Patel', comment: 'Fixed term exclusion 1: threw equipment. Aggressive language.', safeguarding_note: null },
    { id: 'b69', student_id: 's16', date: '2026-05-20', incident_type: 'Aggression', behaviour_points: 12, lesson_period: 'P5', subject: 'PE', staff_member: 'Mr Davis', comment: 'Fixed term exclusion 2: confrontation with staff. Physical threat.', safeguarding_note: 'Escalated to SLT. Behaviour plan reviewed.' },
    { id: 'b70', student_id: 's16', date: '2026-06-08', incident_type: 'Aggression', behaviour_points: 18, lesson_period: 'P2', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Fixed term exclusion 3: targeted behaviour towards peer. Risk of permanent exclusion.', safeguarding_note: null },
    { id: 'b71', student_id: 's16', date: '2026-06-15', incident_type: 'Disruption', behaviour_points: 6, lesson_period: 'P4', subject: 'English', staff_member: 'Ms Jones', comment: 'On return from exclusion. Isolated but not compliant.', safeguarding_note: null },
  ],

  // s17: Chloe Barnes — friendship breakdown
  s17: [
    { id: 'b72', student_id: 's17', date: '2026-05-05', incident_type: 'Disruption', behaviour_points: 3, lesson_period: 'P4', subject: 'Drama', staff_member: 'Ms Clark', comment: 'Conflict with friend group. Tearful.', safeguarding_note: null },
    { id: 'b73', student_id: 's17', date: '2026-05-18', incident_type: 'Disruption', behaviour_points: 4, lesson_period: 'P4', subject: 'Art', staff_member: 'Ms Clark', comment: 'Avoiding previous friend group. Isolated seating.', safeguarding_note: null },
    { id: 'b74', student_id: 's17', date: '2026-06-05', incident_type: 'Disruption', behaviour_points: 5, lesson_period: 'P4', subject: 'PE', staff_member: 'Mr Davis', comment: 'Refused to participate in group activity. Attendance to P4 declining.', safeguarding_note: null },
    { id: 'b75', student_id: 's17', date: '2026-06-17', incident_type: 'Disruption', behaviour_points: 4, lesson_period: 'P1', subject: 'English', staff_member: 'Ms Jones', comment: 'First incident outside P4. Generalised anxiety spreading.', safeguarding_note: null },
  ],

  // s18: Dev Sharma — academic pressure / perfectionist anxiety
  s18: [
    { id: 'b76', student_id: 's18', date: '2026-05-10', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P3', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Top grade in mock. Showing stress symptoms though.', safeguarding_note: null, positive_points: 9, praise_comment: 'Excellent performance' },
    { id: 'b77', student_id: 's18', date: '2026-05-25', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'English', staff_member: 'Ms Jones', comment: 'Nurse visit for headache. Third visit this half term.', safeguarding_note: null },
    { id: 'b78', student_id: 's18', date: '2026-06-08', incident_type: 'Disruption', behaviour_points: 3, lesson_period: 'P4', subject: 'Science', staff_member: 'Dr Patel', comment: 'Asked to leave lesson citing illness. Staff notes anxiety and perfectionism.', safeguarding_note: null },
    { id: 'b79', student_id: 's18', date: '2026-06-18', incident_type: 'Disruption', behaviour_points: 3, lesson_period: 'P2', subject: 'Business', staff_member: 'Mr Lee', comment: 'Distressed about mock results. Appearing withdrawn. Recommended pastoral check-in.', safeguarding_note: null },
  ],

  // s19: Jordan Mitchell — success story after mentoring
  s19: [
    { id: 'b80', student_id: 's19', date: '2026-05-15', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P2', subject: 'Science', staff_member: 'Dr Patel', comment: 'Mentoring programme showing real impact. Engaged and positive.', safeguarding_note: null, positive_points: 7, praise_comment: 'Excellent turnaround from Spring term' },
    { id: 'b81', student_id: 's19', date: '2026-06-05', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P4', subject: 'PE', staff_member: 'Mr Davis', comment: 'Chosen for sports leadership training. Consistent improvement.', safeguarding_note: null, positive_points: 6, praise_comment: 'Real leadership potential emerging' },
    { id: 'b82', student_id: 's19', date: '2026-06-18', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P1', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Attended afterschool sessions voluntarily. Real motivation change.', safeguarding_note: null, positive_points: 6, praise_comment: 'PP success story — self-directed learning' },
  ],

  // s20: Ellie Carter — resolved bullying victim
  s20: [
    { id: 'b83', student_id: 's20', date: '2026-05-05', incident_type: 'Disruption', behaviour_points: 4, lesson_period: 'P4', subject: 'Drama', staff_member: 'Ms Clark', comment: 'Bullying victim — incident with Chloe B and her peer group.', safeguarding_note: null },
    { id: 'b84', student_id: 's20', date: '2026-05-20', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P3', subject: 'English', staff_member: 'Ms Jones', comment: 'Peer support intervention has helped. Gaining confidence.', safeguarding_note: null, positive_points: 5, praise_comment: 'Building friendships in other areas' },
    { id: 'b85', student_id: 's20', date: '2026-06-10', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P2', subject: 'Art', staff_member: 'Ms Clark', comment: 'Reintegration into group work successful. Participating well.', safeguarding_note: null, positive_points: 5, praise_comment: 'Resilience and recovery evident' },
  ],

  // s21: Rhys Evans — GCSE stress + housing instability
  s21: [
    { id: 'b86', student_id: 's21', date: '2026-05-08', incident_type: 'Disruption', behaviour_points: 6, lesson_period: 'P3', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Off-task and worried. Mentioned exams.', safeguarding_note: null },
    { id: 'b87', student_id: 's21', date: '2026-05-20', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'English', staff_member: 'Ms Jones', comment: 'Late — fifth mark this month. Appears tired.', safeguarding_note: null },
    { id: 'b88', student_id: 's21', date: '2026-06-02', incident_type: 'Disruption', behaviour_points: 8, lesson_period: 'P4', subject: 'Science', staff_member: 'Dr Patel', comment: 'Aggressive response to feedback. Disclosed family housing issues to staff member.', safeguarding_note: 'Housing instability disclosed. DSL and local authority referral advised.' },
    { id: 'b89', student_id: 's21', date: '2026-06-15', incident_type: 'Disruption', behaviour_points: 8, lesson_period: 'P2', subject: 'History', staff_member: 'Ms Brown', comment: 'Repeated disruption. Exam anxiety + home stress escalating.', safeguarding_note: null },
    { id: 'b90', student_id: 's21', date: '2026-06-22', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Eighth attendance mark. Appears unwell and anxious.', safeguarding_note: null },
  ],

  // s22: Phoebe Walsh — EHCP + exam accommodations
  s22: [
    { id: 'b91', student_id: 's22', date: '2026-05-12', incident_type: 'Disruption', behaviour_points: 3, lesson_period: 'P3', subject: 'English', staff_member: 'Ms Jones', comment: 'Distressed about exam arrangements. EHCP targets not clear.', safeguarding_note: null },
    { id: 'b92', student_id: 's22', date: '2026-05-28', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'Science', staff_member: 'Dr Patel', comment: 'Anxious about mock exam access arrangements.', safeguarding_note: null },
    { id: 'b93', student_id: 's22', date: '2026-06-10', incident_type: 'Disruption', behaviour_points: 4, lesson_period: 'P2', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Exam accommodations still not confirmed. SENDCo urgent action needed.', safeguarding_note: null },
    { id: 'b94', student_id: 's22', date: '2026-06-18', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P4', subject: 'History', staff_member: 'Ms Brown', comment: 'Very anxious about final exam arrangements and accommodations.', safeguarding_note: null },
  ],

  // s23: Callum Reid — gradual disengagement
  s23: [
    { id: 'b95', student_id: 's23', date: '2026-05-15', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P2', subject: 'Business', staff_member: 'Mr Lee', comment: 'Strong mock result. A-band student. Confident performance.', safeguarding_note: null, positive_points: 6, praise_comment: 'Excellent preparation' },
    { id: 'b96', student_id: 's23', date: '2026-06-05', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Skipping revision sessions. Staff concerned about motivation shift.', safeguarding_note: null },
    { id: 'b97', student_id: 's23', date: '2026-06-15', incident_type: 'Disruption', behaviour_points: 3, lesson_period: 'P3', subject: 'Science', staff_member: 'Dr Patel', comment: 'Noticeably disengaged compared to earlier in year. No incidents but low engagement.', safeguarding_note: null },
    { id: 'b98', student_id: 's23', date: '2026-06-22', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'English', staff_member: 'Ms Jones', comment: 'Missing form time. Withdrawal pattern emerging post-mocks.', safeguarding_note: null },
  ],

  // s24: Nadia Kowalski — recent bereavement
  s24: [
    { id: 'b99', student_id: 's24', date: '2026-05-15', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Granddad died last month. Still grieving. Form tutor supportive.', safeguarding_note: null },
    { id: 'b100', student_id: 's24', date: '2026-06-02', incident_type: 'Late', behaviour_points: 2, lesson_period: 'P1', subject: 'English', staff_member: 'Ms Jones', comment: 'Attendance dropping. Grief affecting engagement.', safeguarding_note: null },
    { id: 'b101', student_id: 's24', date: '2026-06-18', incident_type: 'Disruption', behaviour_points: 4, lesson_period: 'P3', subject: 'Science', staff_member: 'Dr Patel', comment: 'Crying during lesson. Personal circumstances difficult. HOY needs to review support.', safeguarding_note: null },
  ],

  // s25: Jasmine Clarke — remarkable turnaround
  s25: [
    { id: 'b102', student_id: 's25', date: '2026-05-20', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P2', subject: 'English', staff_member: 'Ms Jones', comment: 'Was excluded twice last year. Now stable and engaged. Applying to sixth form.', safeguarding_note: null, positive_points: 8, praise_comment: 'Remarkable resilience and turnaround' },
    { id: 'b103', student_id: 's25', date: '2026-06-08', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P4', subject: 'Business', staff_member: 'Mr Lee', comment: 'Excellent sixth form application. Strong commitment to study.', safeguarding_note: null, positive_points: 7, praise_comment: 'Exceptional progress from exclusion risk' },
    { id: 'b104', student_id: 's25', date: '2026-06-18', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P1', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Attendance perfect this term. Positive role model for younger students.', safeguarding_note: null, positive_points: 7, praise_comment: 'Model of determination and success' },
  ],

  // s26: Aaron Chen — top of year in sciences
  s26: [
    { id: 'b105', student_id: 's26', date: '2026-06-05', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P3', subject: 'Science', staff_member: 'Dr Patel', comment: 'Top of year group in Chemistry mock. Shortlisted for national maths competition.', safeguarding_note: null, positive_points: 12, praise_comment: 'Exceptional academic achievement' },
    { id: 'b106', student_id: 's26', date: '2026-06-15', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P2', subject: 'Maths', staff_member: 'Mr Smith', comment: 'Competing in regional mathematics competition. Exceptional potential.', safeguarding_note: null, positive_points: 10, praise_comment: 'National-level achievement' },
    { id: 'b107', student_id: 's26', date: '2026-06-22', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P1', subject: 'Physics', staff_member: 'Dr Patel', comment: 'Mentoring struggling peers in physics. Leadership and brilliance combined.', safeguarding_note: null, positive_points: 8, praise_comment: 'Role model and exceptional achiever' },
  ],

  // s27: Bethany Okafor — resolved SEND case
  s27: [
    { id: 'b108', student_id: 's27', date: '2026-05-10', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P2', subject: 'English', staff_member: 'Ms Jones', comment: 'EHCP targets met in English. Attendance 95%. Real progress.', safeguarding_note: null, positive_points: 6, praise_comment: 'EHCP goals being achieved' },
    { id: 'b109', student_id: 's27', date: '2026-06-05', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P3', subject: 'Science', staff_member: 'Dr Patel', comment: 'EHCP support working well across all subjects. Confident and happy.', safeguarding_note: null, positive_points: 5, praise_comment: 'SEND support enabling success' },
    { id: 'b110', student_id: 's27', date: '2026-06-18', incident_type: 'Praise', behaviour_points: 0, lesson_period: 'P4', subject: 'History', staff_member: 'Ms Brown', comment: 'SENDCo celebrating successful EHCP outcomes. Attending well (95%), thriving.', safeguarding_note: null, positive_points: 5, praise_comment: 'Successful SEND outcomes across all areas' },
  ],
};

// ────────────────────────────────────────────────────────────────────────────────────
// DEMO ANALYSIS RESULTS (a11-a27)
// ────────────────────────────────────────────────────────────────────────────────────

export const DEMO_ANALYSIS_EXTRA: Record<string, AnalysisResult> = {

  s11: {
    id: 'a11', student_id: 's11', risk_level: 'red', signal_category: 'red', risk_score: 76,
    key_reasons: [
      'Bullying perpetrator: 4 incidents in 5 weeks, all targeting younger or vulnerable peers',
      'Behaviour points: 32 (concentration in bullying category)',
      'Attendance: 91% (acceptable but peer harm pattern dominant)',
      'Safeguarding note: physical aggression + witness statements',
      'Peer impact: multiple victims reporting fear',
    ],
    signal_explanation: 'Kai is not an at-risk student academically — he is a bullying risk to others. His four incidents over five weeks show a deliberate pattern of targeting vulnerable peers. Physical aggression and witness statements elevate this to DSL priority. The pattern is about perpetration, not disengagement.',
    behaviour_trend: 'Escalating', attendance_trend: 'Stable',
    subjects_involved: ['PE', 'Science', 'English'], periods_involved: ['P2', 'P3', 'P4', 'Lunch'],
    suggested_pastoral_action: 'DSL intervention required. Restorative justice process with victims. Behaviour contract with clear consequences.',
    suggested_parent_contact: 'Urgent parent meeting with DSL — discuss impact on other students and intervention plan',
    suggested_staff_action: 'DSL to coordinate response. Alert all staff to safeguarding concern. Monitor peer interactions.',
    career_signposting: null,
    recommended_review_date: '2026-07-04',
  },

  s12: {
    id: 'a12', student_id: 's12', risk_level: 'amber', signal_category: 'amber', risk_score: 58,
    key_reasons: [
      'Exam anxiety pattern: 4 incidents all before or during assessed work',
      'Attendance: 82% — calling in sick when test scheduled',
      'SEN Support in place but anxiety accommodations not clearly documented',
      'Punctuality: 6 late marks (anxiety avoidance pattern)',
      'Behaviour points: 12 (low individually but all anxiety-triggered)',
    ],
    signal_explanation: 'Fatima is not generally disruptive — she has severe exam anxiety. Every incident occurred before or during formal assessments or mock exam weeks. Her SEN Support plan needs a specific anxiety component with exam accommodations documented. This is a curriculum/pastoral need, not a behaviour problem.',
    behaviour_trend: 'Pattern-driven', attendance_trend: 'Below target',
    subjects_involved: ['Maths', 'Science', 'English'], periods_involved: ['P1', 'P2', 'P3'],
    suggested_pastoral_action: 'SENDCo review of anxiety accommodations — document formally before final exams',
    suggested_parent_contact: 'Discuss exam anxiety and what accommodations are in place — build confidence',
    suggested_staff_action: 'Update SEN plan with anxiety support. Liaise with exam officer re: access arrangements.',
    career_signposting: 'Anxiety affecting GCSE pathway — discuss support for post-16 options',
    recommended_review_date: '2026-07-08',
  },

  s13: {
    id: 'a13', student_id: 's13', risk_level: 'amber', signal_category: 'purple', risk_score: 64,
    key_reasons: [
      'Positive points: 7 (May) → 0 (June) — sudden drop',
      'Late marks: increasing pattern over 6 weeks',
      'Staff comments: "not himself", "very quiet", "sits alone now"',
      'Behaviour type shift: was contributing (praise) → now withdrawn',
      'No major incidents — pattern is hidden decline',
    ],
    signal_explanation: 'Luca was a model student until Christmas. Now there is a clear shift — he has withdrawn socially and academically. Staff independently notice he is different. The combination of increased lateness, collapse in positive engagement, and isolation merits pastoral intervention to understand what is happening at home or peer level.',
    behaviour_trend: 'Hidden decline', attendance_trend: 'Below target',
    subjects_involved: ['Maths', 'English', 'PE'], periods_involved: ['P1'],
    suggested_pastoral_action: 'Discreet welfare check by form tutor — not a telling-off, a check-in',
    suggested_parent_contact: 'Low-key contact — have things changed at home? Any peer or family issues?',
    suggested_staff_action: 'Alert HOY quietly. Form tutor to make informal contact.',
    career_signposting: null,
    recommended_review_date: '2026-07-05',
  },

  s14: {
    id: 'a14', student_id: 's14', risk_level: 'green', signal_category: 'green', risk_score: 22,
    key_reasons: [
      'EHCP finalised (May) — immediate positive impact',
      'Behaviour: 5pts (April, unmet need) → 4pts (June, with support)',
      'Attendance: improved to 96% — consistent now',
      'Praise records: 2 entries with positive feedback',
      'Trend: amber → green — clear causal link to EHCP provision',
    ],
    signal_explanation: 'Amara is a success story for SEND provision. When her EHCP was finalised and she received the right support structure, everything changed. Attendance improved, behaviour stabilised, engagement visible. This is evidence that early identification and proper SEND assessment work.',
    behaviour_trend: 'Improving', attendance_trend: 'Improving',
    subjects_involved: ['English', 'Science'], periods_involved: ['P1', 'P3'],
    suggested_pastoral_action: null,
    suggested_parent_contact: 'Positive update — celebrate the EHCP working well',
    suggested_staff_action: 'Continue current support. Monitor EHCP targets closely.',
    career_signposting: 'Supported pathways — discuss options with SENDCo',
    recommended_review_date: '2026-08-15',
  },

  s15: {
    id: 'a15', student_id: 's15', risk_level: 'green', signal_category: 'blue', risk_score: 3,
    key_reasons: [
      'Attendance: 98% — near perfect',
      'Praise records: 3 entries across 3 weeks',
      'Positive points: 42 — high across subjects',
      'Mentoring and peer support: chosen as Year 9 ambassador',
      'Mock performance: competitive with much older students',
    ],
    signal_explanation: 'Zara is an exceptional Year 9 student. Not only is she academically outstanding — top of mocks, consistent across all subjects — but she is actively mentoring peers and providing leadership. She should be fast-tracked for leadership and gifted programmes.',
    behaviour_trend: 'Exemplary', attendance_trend: 'Excellent',
    subjects_involved: ['Science', 'English', 'Maths'], periods_involved: ['P1', 'P2', 'P4'],
    suggested_pastoral_action: null,
    suggested_parent_contact: 'Exceptional achievement communication',
    suggested_staff_action: 'Consider gifted programme entry and advanced academic pathways',
    career_signposting: 'Academic excellence pathway — Russell Group aspirations',
    recommended_review_date: '2026-09-15',
  },

  s16: {
    id: 'a16', student_id: 's16', risk_level: 'red', signal_category: 'red', risk_score: 88,
    key_reasons: [
      'Exclusions: 3 fixed-term exclusions this year alone (1 permanent likely next)',
      'Behaviour points: 51 (3 of 4 records are aggression/isolation level)',
      'Attendance: 81% (missing time due to exclusions)',
      'Safeguarding pattern: escalating aggression + physical threat',
      'On last-chance warning — one more major incident = permanent exclusion',
    ],
    signal_explanation: 'Tyler is at imminent risk of permanent exclusion. Three fixed-term exclusions in one year show a pattern that staff cannot manage within the school setting. His latest incident included a physical threat. This requires urgent SLT review and possible external placement discussion (PRU, alternative provision, or managed move).',
    behaviour_trend: 'Escalating', attendance_trend: 'Declining',
    subjects_involved: ['Science', 'PE', 'Maths', 'English'], periods_involved: ['P2', 'P3', 'P5'],
    suggested_pastoral_action: 'Urgent SLT meeting — exclusion policy review and next steps (internal/external placement)',
    suggested_parent_contact: 'Formal meeting with SLT re: permanent exclusion risk',
    suggested_staff_action: 'SLT to lead. Consider alternative provision, managed move, or PEP (Pastoral Exclusion Plan).',
    career_signposting: null,
    recommended_review_date: '2026-07-02',
  },

  s17: {
    id: 'a17', student_id: 's17', risk_level: 'amber', signal_category: 'amber', risk_score: 55,
    key_reasons: [
      'All 4 incidents in P4 period only — time-concentrated pattern',
      'Friendship group breakdown (May) — loss of peer support',
      'Attendance: 83% — declining after friendship fallout',
      'SEN Support plan — review provision given emerging anxiety',
      'Trend: incidents spreading to other periods (P1 in week of 2026-06-17)',
    ],
    signal_explanation: 'Chloe\'s pattern is a peer relationship crisis following a friendship group breakdown. Her SEN Support needs (processing difficulties) have left her vulnerable when peer structures change. All incidents happened in P4 initially — now spreading to other times as her anxiety generalises. This needs both peer relationship repair and SEN support review.',
    behaviour_trend: 'Concerning', attendance_trend: 'Below target',
    subjects_involved: ['Drama', 'Art', 'PE', 'English'], periods_involved: ['P1', 'P4'],
    suggested_pastoral_action: 'Pastoral meeting to explore peer issues. Consider class/seating changes away from conflict zone.',
    suggested_parent_contact: 'Discuss peer relationship difficulty sensitively',
    suggested_staff_action: 'SEN support plan review. Alert P4 teachers. Consider restorative approach.',
    career_signposting: null,
    recommended_review_date: '2026-07-10',
  },

  s18: {
    id: 'a18', student_id: 's18', risk_level: 'amber', signal_category: 'purple', risk_score: 59,
    key_reasons: [
      'Academic performance: excellent (top grade in mock)',
      'Physical stress markers: nurse visits x3, headaches, illness complaints',
      'Attendance: 97% (attendance not the issue — stress response is)',
      'Behaviour shift: leaving lessons citing illness, anxiety visible',
      'Staff comment: "perfectionism" and anxiety noted in records',
    ],
    signal_explanation: 'Dev is a high-achiever showing signs of severe academic stress and perfectionism. His excellent mock results have triggered anxiety about maintaining performance, not concern about failure. The pattern is psychosomatic — frequent nurse visits, illness complaints, stress-related absences from lessons. He needs pastoral support focused on wellbeing and realistic expectations, not academic pressure.',
    behaviour_trend: 'Stress-driven', attendance_trend: 'Excellent but stress-related absence pattern',
    subjects_involved: ['Maths', 'Science', 'Business'], periods_involved: ['P1', 'P2', 'P4'],
    suggested_pastoral_action: 'Pastoral conversation about balancing achievement and wellbeing',
    suggested_parent_contact: 'Discuss realistic post-GCSE expectations and managing perfectionism',
    suggested_staff_action: 'Alert HOY. Consider wellbeing support. Reassure on realistic outcome expectations.',
    career_signposting: null,
    recommended_review_date: '2026-07-12',
  },

  s19: {
    id: 'a19', student_id: 's19', risk_level: 'green', signal_category: 'green', risk_score: 12,
    key_reasons: [
      'Attendance: 91% (Spring) → 93% (Summer) — improving',
      'Praise records: 3 entries across different subjects',
      'Positive points: 19 over 3 records (consistent)',
      'PP student — mentoring and career programmes showing clear ROI',
      'Leadership pathway: chosen for sports leadership, self-directed learning emerging',
    ],
    signal_explanation: 'Jordan is a PP success story. Mentoring programme and careers focus have transformed his engagement. From an amber signal early in the year, he is now thriving with visible leadership emerging. This case exemplifies how targeted PP investment works.',
    behaviour_trend: 'Improving strongly', attendance_trend: 'Improving',
    subjects_involved: ['Science', 'PE', 'Maths'], periods_involved: ['P1', 'P2', 'P4'],
    suggested_pastoral_action: null,
    suggested_parent_contact: 'Share positive update and career progression',
    suggested_staff_action: null,
    career_signposting: 'Sports leadership and coaching pathways — T Level or apprenticeship',
    recommended_review_date: '2026-08-01',
  },

  s20: {
    id: 'a20', student_id: 's20', risk_level: 'green', signal_category: 'green', risk_score: 11,
    key_reasons: [
      'Bullying victim (May) — now resolved through peer support intervention',
      'Behaviour: 4pts (one incident, bullying-related) → 2pts (stable)',
      'Attendance: 95% — reintegration successful',
      'Praise records: 2 entries showing confidence rebuilding',
      'Positive trend: engagement in group work restored',
    ],
    signal_explanation: 'Ellie was isolated and bullied by a peer group (notably Chloe B). A peer support intervention and time/space away from the conflict zone have resolved the issue. She is now reintegrated, confident, and participating fully. This is a resolution story.',
    behaviour_trend: 'Improved', attendance_trend: 'Excellent',
    subjects_involved: ['English', 'Art'], periods_involved: ['P2', 'P3'],
    suggested_pastoral_action: null,
    suggested_parent_contact: 'Positive update on resolution',
    suggested_staff_action: null,
    career_signposting: null,
    recommended_review_date: '2026-08-15',
  },

  s21: {
    id: 'a21', student_id: 's21', risk_level: 'red', signal_category: 'red', risk_score: 82,
    key_reasons: [
      'Attendance: 74% (persistent absence threshold)',
      'Safeguarding: housing instability disclosed (home circumstances changing)',
      'Behaviour: escalating from 6pts (May) to 8pts (June)',
      'Punctuality: 11 late marks — cumulative indicator of morning routine collapse',
      'GCSE stress compounding home crisis — dual pressure impact',
    ],
    signal_explanation: 'Rhys is a red-priority multi-factor crisis. His attendance has fallen below the persistent absence threshold (74%), he has disclosed housing instability at home, his behaviour is escalating under exam stress, and he is showing signs of physical exhaustion (late every morning). This requires urgent DSL involvement for home circumstances AND pastoral support for GCSE anxiety. Local authority referral likely needed.',
    behaviour_trend: 'Escalating', attendance_trend: 'Declining sharply',
    subjects_involved: ['Maths', 'English', 'Science', 'History'], periods_involved: ['P1', 'P2', 'P3', 'P4'],
    suggested_pastoral_action: 'Urgent DSL meeting — home circumstances and safeguarding assessment',
    suggested_parent_contact: 'DSL-led sensitive contact re: home situation and support available',
    suggested_staff_action: 'DSL to coordinate. Local authority Early Help referral. GCSE support plan (exam access arrangements?).',
    career_signposting: null,
    recommended_review_date: '2026-06-29',
  },

  s22: {
    id: 'a22', student_id: 's22', risk_level: 'amber', signal_category: 'amber', risk_score: 61,
    key_reasons: [
      'EHCP exam accommodations: NOT YET CONFIRMED (11 days before exams)',
      'Behaviour points: 10 (all anxiety-related, before assessed work)',
      'Attendance: 89% — affected by exam anxiety',
      'SENDCo action: URGENT — formal assessment needed immediately',
      'Exam officer coordination: failing — accommodations must be locked down',
    ],
    signal_explanation: 'Phoebe has an EHCP and is entitled to exam accommodations, but as of 2026-06-20, these have not been formally confirmed. With GCSEs imminent, this is a critical SENDCo/exam officer coordination failure. Her anxiety is understandable — she does not know what support she will have. This must be resolved within days, not weeks.',
    behaviour_trend: 'Anxiety-driven', attendance_trend: 'Below target',
    subjects_involved: ['English', 'Science', 'Maths', 'History'], periods_involved: ['P1', 'P2', 'P3', 'P4'],
    suggested_pastoral_action: 'SENDCo to confirm accommodations immediately in writing to Phoebe and parents',
    suggested_parent_contact: 'Urgent — reassure re: confirmed exam accommodations',
    suggested_staff_action: 'SENDCo + Exam Officer urgent coordination. Formal written confirmation to student.',
    career_signposting: null,
    recommended_review_date: '2026-06-25',
  },

  s23: {
    id: 'a23', student_id: 's23', risk_level: 'amber', signal_category: 'purple', risk_score: 53,
    key_reasons: [
      'Mock performance: A-band (May) — high achiever previously',
      'Recent shift: skipping revision, disengaging from study sessions',
      'Behaviour: subtle — no major incidents, but 3 late marks in 3 weeks',
      'Staff concern: "motivation shift" and withdrawal from normal study pattern',
      'Post-mock disengagement: common but concerning for top achiever',
    ],
    signal_explanation: 'Callum is a high-achiever who performed well in mocks (A-band results). Since then, he has gradually withdrawn — no longer attending revision sessions, becoming less engaged in lessons, arriving late to form time. This is post-mock disengagement from a previously motivated student. It may be anxiety (fear of maintaining performance) or loss of motivation. Pastoral check-in needed to understand the cause.',
    behaviour_trend: 'Hidden decline', attendance_trend: 'Stable but engagement dropping',
    subjects_involved: ['Maths', 'Science', 'English'], periods_involved: ['P1', 'P3'],
    suggested_pastoral_action: 'Discreet pastoral conversation about motivation and any changes',
    suggested_parent_contact: 'Check whether anything changed at home. Any pressures or concerns?',
    suggested_staff_action: 'Alert HOY for discreet check-in. Monitor attendance at revision sessions.',
    career_signposting: null,
    recommended_review_date: '2026-07-09',
  },

  s24: {
    id: 'a24', student_id: 's24', risk_level: 'amber', signal_category: 'amber', risk_score: 52,
    key_reasons: [
      'Recent bereavement: grandfather died last month (May)',
      'Attendance: 84% — declining since bereavement',
      'Punctuality: 3 late marks in post-bereavement period',
      'Behaviour: 4pts one incident (crying during lesson) — grief-related',
      'Form tutor support: in place but HOY needs to formalise grief plan and monitor for prolonged impact',
    ],
    signal_explanation: 'Nadia has suffered a significant bereavement (loss of grandfather) very recently. Her attendance has understandably declined, she is showing signs of grief in class (crying), and she is struggling with morning routines. This is not a behaviour problem — it is a grief support need. Form tutor is already engaged, but HOY should formalise a grief support plan and monitor whether more specialist counselling is needed.',
    behaviour_trend: 'Grief-related', attendance_trend: 'Declining due to bereavement',
    subjects_involved: ['Maths', 'English', 'Science'], periods_involved: ['P1', 'P3'],
    suggested_pastoral_action: 'Pastoral plan for bereavement support. HOY to formalise grief support structure with form tutor and review in 2 weeks.',
    suggested_parent_contact: 'Sensitively offer school grief support and external bereavement resources. Check whether family have other support in place.',
    suggested_staff_action: 'HOY to formalise bereavement support plan. Form tutor to maintain structured weekly check-ins. Refer to school counsellor (Ms Green) if grief impact is prolonged beyond 4–6 weeks.',
    career_signposting: null,
    recommended_review_date: '2026-07-15',
  },

  s25: {
    id: 'a25', student_id: 's25', risk_level: 'green', signal_category: 'green', risk_score: 8,
    key_reasons: [
      'Previous state: exclusion risk (2 exclusions in Year 10)',
      'Current state: stable, engaged, applying for sixth form',
      'Attendance: perfect this term (94%)',
      'Praise records: 3 entries showing resilience and determination',
      'Positive points: 22 over 3 months',
    ],
    signal_explanation: 'Jasmine is a genuine success story. She was excluded twice in Year 10 — a serious escalation pathway. Through Year 11, with structured support and mentoring, she has completely turned around. She is now stable, engaged, attending consistently, and applying for sixth form. This is resilience in action.',
    behaviour_trend: 'Improved dramatically', attendance_trend: 'Excellent',
    subjects_involved: ['English', 'Business', 'Maths'], periods_involved: ['P1', 'P2', 'P4'],
    suggested_pastoral_action: null,
    suggested_parent_contact: 'Celebrate remarkable progress and sixth form application success',
    suggested_staff_action: null,
    career_signposting: 'Sixth form entry or apprenticeship pathways — she is ready',
    recommended_review_date: '2026-09-01',
  },

  s26: {
    id: 'a26', student_id: 's26', risk_level: 'green', signal_category: 'blue', risk_score: 1,
    key_reasons: [
      'Academic excellence: top of year group in Chemistry mock (full marks)',
      'Competitive achievement: shortlisted for national maths competition',
      'Peer contribution: mentoring struggling peers in physics',
      'Attendance: 99% — consistent',
      'Positive points: 50 across subjects',
    ],
    signal_explanation: 'Aaron is at the top of the Year 11 cohort. He is not only academically exceptional (top of year in sciences, national maths competition qualification) but is also mentoring peers and showing leadership. He is a model for the school and should be showcased for gifted/talented pathways and Russell Group university preparation.',
    behaviour_trend: 'Exemplary', attendance_trend: 'Near perfect',
    subjects_involved: ['Science', 'Maths', 'Physics'], periods_involved: ['P1', 'P2', 'P3'],
    suggested_pastoral_action: null,
    suggested_parent_contact: 'Exceptional achievement recognition',
    suggested_staff_action: 'Russell Group university mentoring. Oxbridge entry advice.',
    career_signposting: 'Medicine or academic research pathway — elite university',
    recommended_review_date: '2026-09-15',
  },

  s27: {
    id: 'a27', student_id: 's27', risk_level: 'green', signal_category: 'green', risk_score: 9,
    key_reasons: [
      'EHCP implementation: successful across all subjects',
      'Attendance: 95% — consistent and engaged',
      'Behaviour: 1pt (near zero) — stable',
      'Positive points: 16 across 3 records',
      'SENDCo celebration: EHCP targets met and exceeded expectations',
    ],
    signal_explanation: 'Bethany is a success story for SEND provision done right. Her EHCP has been implemented effectively, targets are being met, and she is thriving across all subjects. She is attending well, behaving positively, and showing engagement. This exemplifies what good SEND support looks like.',
    behaviour_trend: 'Stable and positive', attendance_trend: 'Excellent',
    subjects_involved: ['English', 'Science', 'History'], periods_involved: ['P2', 'P3', 'P4'],
    suggested_pastoral_action: null,
    suggested_parent_contact: 'Positive update on EHCP success and Year 11 outcomes',
    suggested_staff_action: 'Continue current support. Plan Year 12 transition with SEND support.',
    career_signposting: 'Supported pathways — T Level, apprenticeship, or Level 3 college course',
    recommended_review_date: '2026-09-01',
  },
};

// ────────────────────────────────────────────────────────────────────────────────────
// DEMO INTERVENTIONS (i13-i20)
// ────────────────────────────────────────────────────────────────────────────────────

export const DEMO_INTERVENTIONS_EXTRA: Intervention[] = [

  // s11 — bullying perpetrator
  {
    id: 'i13', student_id: 's11', assigned_to: 'Mr Ahmed (DSL)', created_by: 'Student Signal (System)',
    action_type: 'Safeguarding + restorative intervention', priority: 'urgent', status: 'suggested',
    due_date: '2026-07-15', review_date: '2026-07-28',
    notes: 'DSL to lead restorative justice sessions with bullying victims. Behaviour contract. Peer mentoring in reverse (Kai to be mentored about impact of behaviour).',
    outcome: null,
    reason: 'Four incidents of deliberate targeting of vulnerable peers. Safeguarding concern. Pattern of bullying.',
    suggested_owner: 'DSL',
    created_at: '2026-06-20',
  },

  // s12 — exam anxiety
  {
    id: 'i14', student_id: 's12', assigned_to: 'Ms Jones (SENDCo)', created_by: 'Student Signal (System)',
    action_type: 'SEN plan update + exam accommodations', priority: 'high', status: 'suggested',
    due_date: '2026-07-17', review_date: '2026-07-31',
    notes: 'Formalise exam accommodations (extra time, quiet room, scribe if needed). Update SEN plan with anxiety-specific strategies.',
    outcome: null,
    reason: 'Exam anxiety pattern — 4 incidents all before assessed work. Need formal accommodations documented.',
    suggested_owner: 'SENCO',
    created_at: '2026-06-19',
  },

  // s13 — withdrawal
  {
    id: 'i15', student_id: 's13', assigned_to: 'Mr Patel (Tutor)', created_by: 'Student Signal (System)',
    action_type: 'Welfare check-in', priority: 'medium', status: 'suggested',
    due_date: '2026-07-18', review_date: '2026-08-01',
    notes: 'Low-key check-in with form tutor. Explore any home circumstances or peer issues. Do not make it formal or confrontational.',
    outcome: null,
    reason: 'Hidden withdrawal — positive points collapsed, late marks increasing, staff note mood change',
    suggested_owner: 'Form Tutor',
    created_at: '2026-06-19',
  },

  // s16 — exclusion risk
  {
    id: 'i16', student_id: 's16', assigned_to: 'Mr Lee (SLT)', created_by: 'Ms Harris (HOY Y10)',
    action_type: 'Exclusion case review + alternative provision', priority: 'urgent', status: 'suggested',
    due_date: '2026-07-15', review_date: '2026-07-22',
    notes: 'SLT to review exclusion threshold (3 FTE + physical threat = likely permanent). Explore PRU placement, alternative provision, or managed move. Parent meeting required.',
    outcome: null,
    reason: '3 fixed-term exclusions this year. Escalating aggression. Physical threat to staff/peers. One more major incident = permanent exclusion.',
    suggested_owner: 'SLT',
    created_at: '2026-06-22',
  },

  // s17 — friendship breakdown + peer dynamics
  {
    id: 'i17', student_id: 's17', assigned_to: 'Mr Patel (Tutor)', created_by: 'Student Signal (System)',
    action_type: 'Peer support + SEN review', priority: 'medium', status: 'suggested',
    due_date: '2026-07-20', review_date: '2026-08-04',
    notes: 'Explore peer relationship difficulty. Consider restorative approach. Review SEN Support plan for anxiety accommodations.',
    outcome: null,
    reason: 'All incidents in P4 with specific peer group. Friendship breakdown affected attendance and anxiety.',
    suggested_owner: 'Form Tutor',
    created_at: '2026-06-18',
  },

  // s18 — academic perfectionism
  {
    id: 'i18', student_id: 's18', assigned_to: 'Mrs Thompson (Pastoral)', created_by: 'Student Signal (System)',
    action_type: 'Wellbeing support + expectation-setting', priority: 'medium', status: 'suggested',
    due_date: '2026-07-20', review_date: '2026-08-04',
    notes: 'Pastoral conversation about balancing achievement and wellbeing. Reassure re: realistic GCSE outcomes. Consider peer support for anxiety management.',
    outcome: null,
    reason: 'High-achiever showing severe stress: nurse visits x3, illness complaints, anxiety-driven absences from lessons',
    suggested_owner: 'Pastoral Manager',
    created_at: '2026-06-19',
  },

  // s21 — multi-factor crisis (housing + exam stress)
  {
    id: 'i19', student_id: 's21', assigned_to: 'Mr Ahmed (DSL)', created_by: 'Mr Patel (Tutor)',
    action_type: 'DSL safeguarding + Early Help referral', priority: 'urgent', status: 'suggested',
    due_date: '2026-07-13', review_date: '2026-07-27',
    notes: 'Housing instability disclosed. DSL to assess safeguarding risk and coordinate Early Help/local authority referral. Attendance crisis + GCSE stress compound need.',
    outcome: null,
    reason: 'Attendance 74% (persistent absence). Housing instability. Escalating behaviour. GCSE stress compounding.',
    suggested_owner: 'DSL',
    created_at: '2026-06-20',
  },

  // s22 — EHCP exam accommodations (urgent SENDCo)
  {
    id: 'i20', student_id: 's22', assigned_to: 'Ms Jones (SENDCo)', created_by: 'Student Signal (System)',
    action_type: 'Exam accommodations confirmation — URGENT', priority: 'urgent', status: 'suggested',
    due_date: '2026-07-11', review_date: '2026-07-18',
    notes: 'IMMEDIATE ACTION: Confirm EHCP exam accommodations in writing to Phoebe and parents. Exam officer coordination. Written confirmation within 48 hours.',
    outcome: null,
    reason: 'EHCP accommodations NOT confirmed. Phoebe anxious. SENDCo/Exam Officer failure to coordinate.',
    suggested_owner: 'SENCO',
    created_at: '2026-06-20',
  },

  // s1 (Oliver Brown) — teacher follow-up assigned to Ms Okonkwo
  {
    id: 'i21', student_id: 's1', assigned_to: 'Ms Okonkwo', created_by: 'Ms Harris (HOY Y10)',
    action_type: 'Subject teacher follow-up — Maths disengagement', priority: 'high', status: 'suggested',
    due_date: '2026-07-20', review_date: '2026-07-27',
    notes: 'Check in with Oliver during or after Maths. Note engagement levels, any verbal exchanges, and whether he engages with the lesson. Do not raise formally — observe and report back to HOY.',
    outcome: null,
    reason: 'Pattern of disengagement and 4 incidents in Maths. Subject teacher observation requested.',
    suggested_owner: 'Subject Teacher',
    created_at: '2026-06-24',
  },

  // s16 (Tyler Walsh) — teacher observation assigned to Ms Okonkwo
  {
    id: 'i22', student_id: 's16', assigned_to: 'Ms Okonkwo', created_by: 'Mrs Thompson (Pastoral)',
    action_type: 'Classroom behaviour monitoring', priority: 'medium', status: 'suggested',
    due_date: '2026-07-22', review_date: '2026-07-29',
    notes: 'Record any incidents or notable behaviour in class this week. Log via Quick Note in Student Signal and escalate immediately if physical aggression occurs.',
    outcome: null,
    reason: 'Tyler at exclusion threshold. Pastoral team need teacher-level visibility of classroom behaviour.',
    suggested_owner: 'Subject Teacher',
    created_at: '2026-06-23',
  },
];

// ────────────────────────────────────────────────────────────────────────────────────
// DEMO CAREER PROFILES (c11-c27)
// ────────────────────────────────────────────────────────────────────────────────────

export const DEMO_CAREERS_EXTRA: Record<string, CareerProfile> = {

  s11: {
    id: 'c11', student_id: 's11',
    career_interests: ['Engineering', 'Physical Labour', 'Skilled Trades'],
    preferred_subjects: ['Design Technology', 'Maths', 'PE'],
    strengths: 'Hands-on skills, physically strong, good practical ability',
    barriers: 'Behaviour escalation affecting future prospects. Bullying pattern concerns employers.',
    confidence_level: 'Medium', destination_risk: 'High risk of NEET',
    suggested_pathways: ['Engineering apprenticeship (if behaviour resolved)', 'Construction Level 2', 'Skilled trades'],
    useful_signposting: ['Restorative justice completion', 'Behaviour evidence', 'Apprenticeship support'],
    career_goal: 'Construction site foreman', work_experience_status: 'On hold — pending behaviour resolution',
  },

  s12: {
    id: 'c12', student_id: 's12',
    career_interests: ['Healthcare', 'Social Care', 'Counselling'],
    preferred_subjects: ['Science', 'Health & Social Care', 'English'],
    strengths: 'Empathetic, caring, good verbal communication when calm',
    barriers: 'Exam anxiety may limit A*-C grades. Processing difficulties need support.',
    confidence_level: 'Low', destination_risk: 'At risk of NEET',
    suggested_pathways: ['Health & Social Care Level 3', 'Nursing apprenticeship (with support)', 'T Level Care'],
    useful_signposting: ['Exam accommodations secured', 'Work experience in care', 'SEND careers mentor'],
    career_goal: 'Care worker or counsellor', work_experience_status: 'Not arranged',
  },

  s13: {
    id: 'c13', student_id: 's13',
    career_interests: ['Design', 'Creative Industries', 'Media'],
    preferred_subjects: ['Drama', 'Art', 'English'],
    strengths: 'Creative, previously articulate and engaging',
    barriers: 'Recent withdrawal affecting creative output and confidence. Motivation unclear.',
    confidence_level: 'Low (declining)', destination_risk: 'At risk of NEET',
    suggested_pathways: ['Creative Industries Foundation', 'Media Level 3', 'Design apprenticeship'],
    useful_signposting: ['Welfare support', 'Creative mentoring', 'Confidence rebuilding'],
    career_goal: 'Graphic designer or media producer', work_experience_status: 'Not arranged',
  },

  s14: {
    id: 'c14', student_id: 's14',
    career_interests: ['Childcare', 'Teaching Support', 'Social Work'],
    preferred_subjects: ['English', 'Science', 'Health & Social Care'],
    strengths: 'Caring, good with younger children, engaged when supported',
    barriers: 'EHCP support needs — ensure continued support in post-16',
    confidence_level: 'Medium', destination_risk: 'On track (with support)',
    suggested_pathways: ['Level 3 Childcare', 'TA apprenticeship', 'T Level Education & Childcare'],
    useful_signposting: ['SEND post-16 transition', 'Supported internship', 'College SEND liaison'],
    career_goal: 'Nursery teacher or TA', work_experience_status: 'Arranged — local nursery',
  },

  s15: {
    id: 'c15', student_id: 's15',
    career_interests: ['Medicine', 'Science Research', 'Engineering'],
    preferred_subjects: ['Science', 'Maths', 'English'],
    strengths: 'Exceptional academic ability, leadership, peer mentoring, resilience',
    barriers: null,
    confidence_level: 'High', destination_risk: 'On track',
    suggested_pathways: ['Russell Group — Medicine or Natural Sciences', 'Scholarship/bursary entry', 'PhD research'],
    useful_signposting: ['Oxbridge mentoring', 'Underrepresented communities programme (if applicable)', 'Work experience — NHS/lab'],
    career_goal: 'Medical researcher', work_experience_status: 'Arranged — hospital work experience',
  },

  s16: {
    id: 'c16', student_id: 's16',
    career_interests: ['Engineering', 'Construction', 'Skilled Trades'],
    preferred_subjects: ['Design Technology', 'Maths', 'PE'],
    strengths: 'Physical strength, practical ability when focused',
    barriers: 'Exclusion risk / alternative provision placement. Aggression record limiting employer options.',
    confidence_level: 'Low', destination_risk: 'Very high risk of NEET',
    suggested_pathways: ['PRU entry + Level 1 trades course', 'Alternative provision', 'Supported employment'],
    useful_signposting: ['SLT placement coordination', 'Behaviour evidence / employer liaison', 'Supported apprenticeship'],
    career_goal: 'Construction worker (if behaviour resolves)', work_experience_status: 'Not available — exclusion',
  },

  s17: {
    id: 'c17', student_id: 's17',
    career_interests: ['Healthcare', 'Nursing', 'Therapy'],
    preferred_subjects: ['Science', 'Health & Social Care', 'English'],
    strengths: 'Empathetic, caring, good communicator',
    barriers: 'SEN support needs. Processing difficulties. Peer relationship crisis affecting confidence.',
    confidence_level: 'Medium', destination_risk: 'At risk of NEET',
    suggested_pathways: ['Health & Social Care Level 3', 'Supported apprenticeship', 'T Level Care'],
    useful_signposting: ['SEND careers mentor', 'Work experience — care setting', 'Peer support group'],
    career_goal: 'Healthcare worker', work_experience_status: 'Arranged — care home',
  },

  s18: {
    id: 'c18', student_id: 's18',
    career_interests: ['Engineering', 'Computing', 'Architecture'],
    preferred_subjects: ['Maths', 'Science', 'Design Technology'],
    strengths: 'Exceptional analytical ability, high achiever, problem-solver',
    barriers: 'Perfectionism and anxiety may affect A-level choices and university transition',
    confidence_level: 'High (but anxious)', destination_risk: 'On track',
    suggested_pathways: ['A Levels — Maths, Physics, Chemistry', 'Engineering apprenticeship', 'Top-tier engineering university'],
    useful_signposting: ['Wellbeing support', 'University mentoring', 'Realistic expectations coach'],
    career_goal: 'Structural engineer or architect', work_experience_status: 'Arranged — local design firm',
  },

  s19: {
    id: 'c19', student_id: 's19',
    career_interests: ['Sports Science', 'Coaching', 'PE Teaching'],
    preferred_subjects: ['PE', 'Science', 'Maths'],
    strengths: 'Leadership, physical ability, excellent team player, mentoring emerging',
    barriers: null,
    confidence_level: 'High', destination_risk: 'On track',
    suggested_pathways: ['A Levels — PE, Biology, Chemistry', 'Sports coaching apprenticeship', 'University Sports Science'],
    useful_signposting: ['University sports science entry', 'Coaching qualification', 'Mentoring programme (as mentor)'],
    career_goal: 'Sports physiotherapist', work_experience_status: 'Arranged — sports centre coaching',
  },

  s20: {
    id: 'c20', student_id: 's20',
    career_interests: ['Art', 'Fashion', 'Graphic Design'],
    preferred_subjects: ['Art', 'Media', 'English'],
    strengths: 'Creative, visual sense, resilience shown in overcoming bullying',
    barriers: null,
    confidence_level: 'High', destination_risk: 'On track',
    suggested_pathways: ['Art Foundation', 'Fashion & Textiles Level 3', 'Creative apprenticeship'],
    useful_signposting: ['Portfolio development', 'College open days', 'Work experience — design studio'],
    career_goal: 'Fashion designer', work_experience_status: 'Arranged — local fashion retailer',
  },

  s21: {
    id: 'c21', student_id: 's21',
    career_interests: ['Construction', 'Skilled Trades', 'Hospitality'],
    preferred_subjects: ['Design Technology', 'Business', 'PE'],
    strengths: 'Practical skills, resilience given home challenges',
    barriers: 'Attendance crisis + housing instability affecting all pathways. GCSE results at risk.',
    confidence_level: 'Low', destination_risk: 'Very high risk of NEET',
    suggested_pathways: ['Level 1 Entry pathway', 'Supported apprenticeship (requires stable housing)', 'Alternative provision'],
    useful_signposting: ['DSL/Early Help coordination', 'Housing liaison', 'Flexible GCSE support'],
    career_goal: 'Construction worker (aspiration)', work_experience_status: 'Not arranged — housing unstable',
  },

  s22: {
    id: 'c22', student_id: 's22',
    career_interests: ['Administration', 'Healthcare', 'Support Services'],
    preferred_subjects: ['English', 'Health & Social Care', 'IT'],
    strengths: 'Organised, detail-focused, well-supported with EHCP',
    barriers: 'EHCP support needs. Exam accommodations must be secured.',
    confidence_level: 'Medium', destination_risk: 'At risk of NEET (but manageable)',
    suggested_pathways: ['Level 2 Business Admin', 'Healthcare admin apprenticeship', 'Supported employment'],
    useful_signposting: ['SEND post-16 support', 'Supported internship', 'Work coach'],
    career_goal: 'Healthcare administrator', work_experience_status: 'Arranged — GP surgery admin',
  },

  s23: {
    id: 'c23', student_id: 's23',
    career_interests: ['Business', 'Law', 'Accounting'],
    preferred_subjects: ['Business', 'Maths', 'English'],
    strengths: 'High achiever, analytical, previously well-motivated',
    barriers: 'Post-mock disengagement. Needs motivation re-engagement for final exams.',
    confidence_level: 'Medium (declining)', destination_risk: 'At risk (from disengagement)',
    suggested_pathways: ['A Levels — Business, Maths, Economics', 'University accounting / law', 'Apprenticeship'],
    useful_signposting: ['Motivation check-in', 'Career mentoring', 'University open days'],
    career_goal: 'Accountant or solicitor', work_experience_status: 'Arranged — local law firm',
  },

  s24: {
    id: 'c24', student_id: 's24',
    career_interests: ['Languages', 'Travel & Tourism', 'International Development'],
    preferred_subjects: ['English', 'Modern Languages', 'Geography'],
    strengths: 'Good communicator, culturally aware, empathetic',
    barriers: 'Recent bereavement affecting focus. Attendance slightly low but manageable.',
    confidence_level: 'Medium', destination_risk: 'On track (with grief support)',
    suggested_pathways: ['A Levels — Languages, Geography, English', 'Travel & Tourism Level 3', 'University languages'],
    useful_signposting: ['Grief counselling', 'Mentoring support', 'University language exchange'],
    career_goal: 'International development worker', work_experience_status: 'Arranged — NGO office',
  },

  s25: {
    id: 'c25', student_id: 's25',
    career_interests: ['Business', 'Management', 'Social Enterprise'],
    preferred_subjects: ['Business', 'English', 'Maths'],
    strengths: 'Remarkable resilience, leadership after exclusion recovery, self-determined',
    barriers: null,
    confidence_level: 'High', destination_risk: 'On track',
    suggested_pathways: ['A Levels or T Level Business', 'University business school entry', 'Apprenticeship management'],
    useful_signposting: ['Sixth form entry coordination', 'Mentoring (success story)', 'University business programmes'],
    career_goal: 'Business manager or social entrepreneur', work_experience_status: 'Completed — local business',
  },

  s26: {
    id: 'c26', student_id: 's26',
    career_interests: ['Medicine', 'Physics Research', 'Engineering'],
    preferred_subjects: ['Science', 'Maths', 'Physics'],
    strengths: 'Exceptional academic ability, national competition level, peer leadership',
    barriers: null,
    confidence_level: 'High', destination_risk: 'On track',
    suggested_pathways: ['Russell Group — Medicine, Natural Sciences, Engineering', 'Oxbridge entry', 'PhD research'],
    useful_signposting: ['Oxbridge mentoring', 'Medical school mentoring', 'UKMT involvement'],
    career_goal: 'Physics researcher or medical scientist', work_experience_status: 'Arranged — university research lab',
  },

  s27: {
    id: 'c27', student_id: 's27',
    career_interests: ['Childcare', 'Support Services', 'Social Care'],
    preferred_subjects: ['English', 'Health & Social Care', 'Communication'],
    strengths: 'Caring, good social skills, well-supported with EHCP, resilient',
    barriers: 'EHCP support needs — ensure transition to post-16 provision',
    confidence_level: 'Medium', destination_risk: 'On track (with support)',
    suggested_pathways: ['Level 2 Support Services', 'Childcare apprenticeship (supported)', 'Supported employment'],
    useful_signposting: ['SEND post-16 coordinator', 'Supported internship', 'Post-16 transition planning'],
    career_goal: 'Support worker or TA', work_experience_status: 'Arranged — primary school support',
  },
};

// ────────────────────────────────────────────────────────────────────────────────────
// DEMO COMMUNICATIONS (cm1-cm15)
// ────────────────────────────────────────────────────────────────────────────────────

export const DEMO_COMMUNICATIONS_EXTRA: Communication[] = [

  {
    id: 'cm1', student_id: 's11', date: '2026-06-18', source: 'meeting',
    summary: 'HOY and DSL met to discuss bullying incidents. Four separate incidents over 5 weeks. Decision: restorative justice sessions to commence, behaviour contract.',
    priority: 'urgent', staff_member: 'Mr Okafor (HOY Y9)',
    follow_up_required: true, follow_up_date: '2026-06-25',
    linked_action_id: 'i13', notes: 'Parents to be contacted about restorative approach. Victims\' parents need support.',
    created_at: '2026-06-18T14:30:00Z',
  },

  {
    id: 'cm2', student_id: 's12', date: '2026-06-16', source: 'email',
    summary: 'Parent emailed SENDCo expressing worry about exam stress. Fatima calling in sick before tests. Requested formal accommodations review.',
    priority: 'high', staff_member: 'Ms Jones (SENDCo)',
    follow_up_required: true, follow_up_date: '2026-06-23',
    linked_action_id: 'i14', notes: 'SEN plan update needed urgently — exam accommodations must be formalised.',
    created_at: '2026-06-16T10:15:00Z',
  },

  {
    id: 'cm3', student_id: 's13', date: '2026-06-17', source: 'pastoral_conversation',
    summary: 'Ms Jones noted in staff room that Luca seems withdrawn and uncharacteristically quiet. Has been sitting alone at lunch. Previously very engaged.',
    priority: 'high', staff_member: 'Ms Jones',
    follow_up_required: true, follow_up_date: '2026-06-24',
    linked_action_id: 'i15', notes: 'Silent alarm — no incidents but behaviour change significant. Form tutor check-in needed.',
    created_at: '2026-06-17T12:00:00Z',
  },

  {
    id: 'cm4', student_id: 's16', date: '2026-06-20', source: 'meeting',
    summary: 'SLT review of Tyler\'s exclusions (3 FTE this year). Escalating aggression pattern. Physical threat recorded. Decision pending: permanent exclusion or alternative provision placement.',
    priority: 'urgent', staff_member: 'Mr Lee (SLT)',
    follow_up_required: true, follow_up_date: '2026-06-23',
    linked_action_id: 'i16', notes: 'Parent formal meeting required. Likely permanent exclusion or PRU placement.',
    created_at: '2026-06-20T16:00:00Z',
  },

  {
    id: 'cm5', student_id: 's18', date: '2026-06-18', source: 'email',
    summary: 'School nurse reported Dev made 4 visits in 3 weeks (headaches, general illness). Notes stress and perfectionism. Parent aware.',
    priority: 'high', staff_member: 'Mrs Thompson (Pastoral)',
    follow_up_required: true, follow_up_date: '2026-06-25',
    linked_action_id: 'i18', notes: 'Pastoral intervention needed — academic perfectionism affecting wellbeing.',
    created_at: '2026-06-18T11:30:00Z',
  },

  {
    id: 'cm6', student_id: 's21', date: '2026-06-19', source: 'pastoral_conversation',
    summary: 'Rhys disclosed to Mr Smith (Maths) that family is in housing crisis — may lose home. Very distressed. Reported to DSL same day.',
    priority: 'urgent', staff_member: 'Mr Ahmed (DSL)',
    follow_up_required: true, follow_up_date: '2026-06-22',
    linked_action_id: 'i19', notes: 'Safeguarding concern — housing instability. Early Help referral initiated.',
    created_at: '2026-06-19T13:45:00Z',
  },

  {
    id: 'cm7', student_id: 's21', date: '2026-06-22', source: 'external_agency',
    summary: 'Early Help assessment accepted. Referral to local authority support for housing. CAMHS also offering support.',
    priority: 'urgent', staff_member: 'Mr Ahmed (DSL)',
    follow_up_required: true, follow_up_date: '2026-06-29',
    linked_action_id: 'i19', notes: 'School to coordinate with Early Help team. Regular liaison meetings.',
    created_at: '2026-06-22T10:00:00Z',
  },

  {
    id: 'cm8', student_id: 's22', date: '2026-06-19', source: 'phone',
    summary: 'Parent called SENDCo in distress. Phoebe\'s EHCP exam accommodations still not confirmed. Exams in 11 days. SENDCo assured written confirmation would be sent immediately.',
    priority: 'urgent', staff_member: 'Ms Jones (SENDCo)',
    follow_up_required: true, follow_up_date: '2026-06-21',
    linked_action_id: 'i20', notes: 'EMERGENCY ACTION: Accommodations must be confirmed TODAY. Exam officer coordination failure.',
    created_at: '2026-06-19T14:20:00Z',
  },

  {
    id: 'cm9', student_id: 's24', date: '2026-06-15', source: 'pastoral_conversation',
    summary: 'Form tutor reported Nadia is grieving the loss of her grandfather (died in May). Attendance has dipped to 84%. Tutor offering ongoing support.',
    priority: 'high', staff_member: 'Mr Patel (Tutor)',
    follow_up_required: true, follow_up_date: '2026-06-29',
    linked_action_id: null, notes: 'Consider referral to school counselling. Grief is normal but monitor for prolonged impact.',
    created_at: '2026-06-15T15:00:00Z',
  },

  {
    id: 'cm10', student_id: 's25', date: '2026-06-11', source: 'meeting',
    summary: 'Parent meeting to celebrate Jasmine\'s sixth form application success. Two exclusions in Year 10, now thriving. Remarkable turnaround recognised.',
    priority: 'low', staff_member: 'Ms Harris (HOY Y10)',
    follow_up_required: false, follow_up_date: null,
    linked_action_id: null, notes: 'Success story — nominate for school recognition and governors\' report.',
    created_at: '2026-06-11T16:30:00Z',
  },

  {
    id: 'cm11', student_id: 's15', date: '2026-06-12', source: 'email',
    summary: 'Parent of Zara expressed gratitude for peer mentoring and leadership opportunities. Proud of daughter\'s achievements and university pathway discussions.',
    priority: 'low', staff_member: 'Mr Okafor (HOY Y9)',
    follow_up_required: false, follow_up_date: null,
    linked_action_id: null, notes: 'Positive communication — family very engaged.',
    created_at: '2026-06-12T09:00:00Z',
  },

  {
    id: 'cm12', student_id: 's14', date: '2026-06-10', source: 'meeting',
    summary: 'SENDCo and parents met to review Amara\'s EHCP. Targets being met in all areas. Attendance 96%, engagement excellent. EHCP is working.',
    priority: 'normal', staff_member: 'Ms Jones (SENDCo)',
    follow_up_required: false, follow_up_date: null,
    linked_action_id: null, notes: 'EHCP success story — to be included in school SEND report to governors.',
    created_at: '2026-06-10T14:00:00Z',
  },

  {
    id: 'cm13', student_id: 's19', date: '2026-06-08', source: 'meeting',
    summary: 'Parent update on Jordan\'s progress in mentoring programme. Attendance up, engagement strong, career pathway discussions positive.',
    priority: 'normal', staff_member: 'Ms Harris (HOY Y10)',
    follow_up_required: false, follow_up_date: null,
    linked_action_id: null, notes: 'PP student success — mentor programme clearly effective.',
    created_at: '2026-06-08T15:45:00Z',
  },

  {
    id: 'cm14', student_id: 's26', date: '2026-06-15', source: 'email',
    summary: 'National maths competition organisers notified school that Aaron has been shortlisted as finalist. School to facilitate attendance at regional competition.',
    priority: 'normal', staff_member: 'Mr Smith (Maths)',
    follow_up_required: true, follow_up_date: '2026-07-01',
    linked_action_id: null, notes: 'Exceptional achievement — coordinate competition attendance and logistics.',
    created_at: '2026-06-15T10:30:00Z',
  },

  {
    id: 'cm15', student_id: 's20', date: '2026-06-09', source: 'pastoral_conversation',
    summary: 'Staff noted Ellie has reintegrated into peer groups after bullying incident. Participating in group work, smiling, engaging. Peer support intervention working.',
    priority: 'low', staff_member: 'Ms Jones',
    follow_up_required: false, follow_up_date: null,
    linked_action_id: null, notes: 'Resolution confirmed — peer support approach successful.',
    created_at: '2026-06-09T12:15:00Z',
  },
];


// ══════════════════════════════════════════════════════════════════════════════
// DEMO EXTENSIONS — 20 Jul 2026
// Adds the remaining 12 required demo stories + longitudinal memory fields
// on existing analysis rows.
// ══════════════════════════════════════════════════════════════════════════════

// ── Demo Story 4: Grey — insufficient evidence ────────────────────────────────
// s28: New pupil, one data source, no pattern yet. Must show grey not green.
export const DEMO_STORY4_STUDENT: Student = {
  id: 's28', name: 'Jordan Marsh', year_group: 'Year 8', form: '8C',
  send_status: null, pupil_premium: false,
  risk_level: 'green', signal_category: 'grey' as any,
  behaviour_score: 2, attendance_pct: 91, punctuality_issues: 1,
};

export const DEMO_STORY4_ANALYSIS: AnalysisResult = {
  id: 'a28', student_id: 's28', risk_level: 'green', signal_category: 'grey' as any, risk_score: 8,
  key_reasons: ['New pupil — insufficient data to establish a pattern'],
  signal_explanation: "Jordan joined this school 3 weeks ago. StudentSignal is monitoring but has insufficient cross-source data to identify a meaningful pattern. One late mark recorded. No safeguarding records. No behaviour incidents. This is shown as grey (monitoring) rather than green (clear) because the evidence base is too small to draw a conclusion. Review in 4 weeks as data accumulates.",
  confidence_score: 15,
  data_sources: ['attendance'],
  subjects_involved: [],
  periods_involved: [],
  signal_types: [],
  suggested_pastoral_action: null,
  behaviour_trend: 'Stable',
  attendance_trend: 'Stable',
  suggested_parent_contact: null,
  suggested_staff_action: null,
  career_signposting: null,
  recommended_review_date: null,
  barriers: 'Insufficient data — monitoring period.',
  memory_narrative: 'No previous interventions recorded. This is the first time this pupil has been monitored. Insufficient data to assess trajectory.',
  trajectory: 'insufficient_data',
  trajectory_text: 'Insufficient attendance data to determine trajectory — monitoring for emerging patterns.',
  intervention_count: 0,
  recurrence_count: 0,
  updated_at: '2026-07-19T08:00:00Z',
};

// ── Demo Story 12: Negative case — data imported, no signal needed ────────────
// s29: Good pupil, all green. Must NOT generate signals or actions.
export const DEMO_STORY12_STUDENT: Student = {
  id: 's29', name: 'Noah Adeyemi', year_group: 'Year 10', form: '10B',
  send_status: null, pupil_premium: false,
  risk_level: 'green', signal_category: 'green',
  behaviour_score: 0, attendance_pct: 98, punctuality_issues: 0,
  positive_points: 18,
};

export const DEMO_STORY12_ANALYSIS: AnalysisResult = {
  id: 'a29', student_id: 's29', risk_level: 'green', signal_category: 'green', risk_score: 2,
  key_reasons: ['Attendance 98%', 'No behaviour incidents', '18 positive points this term'],
  signal_explanation: "Noah has no current concerns. Attendance is excellent at 98%, no behaviour incidents have been recorded, and 18 positive points reflect consistent engagement. No action required. StudentSignal will alert you if this changes.",
  confidence_score: 95,
  data_sources: ['attendance', 'behaviour'],
  subjects_involved: [],
  periods_involved: [],
  signal_types: ['positive_progress'],
  suggested_pastoral_action: null,
  behaviour_trend: 'Stable',
  attendance_trend: 'Stable',
  suggested_parent_contact: null,
  suggested_staff_action: null,
  career_signposting: null,
  recommended_review_date: null,
  barriers: null,
  memory_narrative: 'No previous interventions required. This pupil has consistently performed well.',
  trajectory: 'stable',
  trajectory_text: 'Trajectory is stable — no concerns detected.',
  intervention_count: 0,
  recurrence_count: 0,
  updated_at: '2026-07-19T08:00:00Z',
};

// ── Memory fields patched onto existing key demo pupils ───────────────────────
// These supplement the existing DEMO_ANALYSIS_EXTRA entries with longitudinal
// memory fields so every demo signal card answers all 10 required questions.

export const DEMO_MEMORY_PATCHES: Record<string, Partial<AnalysisResult>> = {
  // Story 1: Deterioration across systems (uses existing s1/s2 — core dataset)
  // Story 2: Brief improvement then relapse (s12 — Fatima)
  's12': {
    memory_narrative: '2 interventions recorded (2 completed, 0 ongoing). Tutor welfare check (Feb 2026): attendance briefly improved from 82% to 86% over 3 weeks, then returned to 82%. First parent meeting produced no measurable change. This is a recurring pattern — similar concerns have been raised twice previously. Tutor intervention has twice failed to produce sustained improvement. Parent contact within 72 hours has shown better results for similar cases in this school.',
    trajectory: 'volatile',
    trajectory_text: 'Trajectory is volatile — attendance has recovered briefly after each intervention before declining again. The underlying cause has not been resolved.',
    intervention_count: 2,
    recurrence_count: 2,
  },
  // Story 3: Sustained recovery (s15 — blue state)
  's15': {
    memory_narrative: '3 interventions recorded (3 completed, 0 ongoing). All three produced measurable improvement. The most recent SEND support review produced a 12% attendance improvement that has sustained for 9 weeks — the longest-lasting recovery for this pupil. No recurrence of previous patterns. Strong practice: structured SEND review + form tutor mentoring.',
    trajectory: 'improving',
    trajectory_text: 'Trajectory is improving — attendance has recovered to 97% and sustained.',
    intervention_count: 3,
    recurrence_count: 0,
  },
  // Story 8: Reward spike — short-term compliance
  's20': {
    memory_narrative: '1 intervention recorded (1 completed). Green-point campaign in May produced attendance improvement from 78% to 85% over 11 school days before declining again. This matches the reward_burst_short_term pattern — improvement held for 11 days before declining again. Previous attendance mentoring produced no measurable change. Recommendation: structured family support rather than further reward-based intervention.',
    trajectory: 'volatile',
    trajectory_text: 'Trajectory is volatile — reward campaign produced brief recovery that did not sustain.',
    intervention_count: 1,
    recurrence_count: 1,
  },
  // Story 5: Multi-role pupil (s11 — DSL/HOY/SENDCo separate actions)
  's11': {
    memory_narrative: '1 intervention recorded (1 in progress). Safeguarding review opened 18 days ago — ongoing with DSL. This is the first formal safeguarding concern for this pupil. Previous behaviour review meetings (HOY) addressed individual incidents but did not address the pattern. Pattern has escalated: 4 incidents in 5 weeks vs 1 in the previous term.',
    trajectory: 'deteriorating',
    trajectory_text: 'Trajectory is deteriorating — incident frequency has quadrupled since last term.',
    intervention_count: 1,
    recurrence_count: 1,
  },
};

// ── Demo persona workload fixture ─────────────────────────────────────────────
// Maps each demo role to the pupils/actions they should see in their personal queue.
// Used by the personal-queue RPC simulation in demo mode.
export const DEMO_PERSONA_WORKLOADS: Record<string, string[]> = {
  dsl: ['s1', 's11', 's12', 's16'],          // safeguarding + cross-source
  head_of_year_10: ['s1', 's12', 's20', 's28'],  // Y10 HOY — attendance + monitoring
  head_of_year_9: ['s11', 's13', 's19'],      // Y9 HOY
  sendco: ['s12', 's14', 's21'],              // SEND reviews
  tutor_10a: ['s1', 's20'],                   // form-specific
  slt: [],                                    // SLT sees org intelligence, not personal queue
  teacher: [],                                // no assigned actions — empty personal queue
};

// ── Demo walkthrough script ────────────────────────────────────────────────────
// Referenced by the demo guide component. Pure data, no UI logic.
export const DEMO_WALKTHROUGH_STEPS = [
  {
    step: 1,
    persona: 'dsl',
    title: 'Open as DSL — your personal Morning Briefing',
    instruction: 'Select the DSL (Ms Dalton) persona. The Morning Briefing shows only pupils where YOU have an open responsibility — not every flagged pupil in school.',
    highlight: 'Morning Briefing',
    pupil: null,
  },
  {
    step: 2,
    persona: 'dsl',
    title: 'Review a red signal',
    instruction: 'Click on Kai Morrison (red). The signal card shows: what changed (4 incidents in 5 weeks vs 1 last term), why (escalating bullying pattern), confidence (high — 3 sources), evidence, and what happens if nothing is done.',
    highlight: 'Signal card',
    pupil: 's11',
  },
  {
    step: 3,
    persona: 'dsl',
    title: 'See the pre-filled action',
    instruction: 'Click "Accept & Assign". The modal opens fully pre-filled — pupil, action type, assignee (you, as DSL), priority (urgent), due date (tomorrow), evidence, and success criteria. Click "Why this recommendation?" to see the reasoning.',
    highlight: 'Accept & Assign modal + Why?',
    pupil: 's11',
  },
  {
    step: 4,
    persona: 'dsl',
    title: 'Confirm the action',
    instruction: 'Confirm without changing anything. One click. The action is saved, assigned, and you would receive a confirmation. The pupil remains in your queue with status "In progress".',
    highlight: 'Confirm button',
    pupil: 's11',
  },
  {
    step: 5,
    persona: 'head_of_year_10',
    title: 'Switch to Year 10 HOY — different responsibility, same pupil',
    instruction: "Switch to Mrs Clarke (Y10 HOY). Her briefing shows Fatima Hussain (attendance) and Chloe Baker (peer group). She does NOT see Kai Morrison's safeguarding details. Her personal queue is scoped to attendance and behaviour in Year 10 only.",
    highlight: 'Persona switch → different workload',
    pupil: null,
  },
  {
    step: 6,
    persona: 'head_of_year_10',
    title: 'Complete the HOY action for Fatima',
    instruction: "Open Fatima Hussain. Click 'Mark complete'. Add outcome notes. Confirm. Fatima disappears immediately from the HOY's briefing and actions list.",
    highlight: 'Mark complete',
    pupil: 's12',
  },
  {
    step: 7,
    persona: 'dsl',
    title: 'Switch back to DSL — Fatima still present',
    instruction: "Switch back to DSL. Fatima Hussain is still in the DSL briefing because the DSL's safeguarding review is still open. Completing the HOY action did not affect the DSL's responsibility.",
    highlight: 'Separate personal queues',
    pupil: 's12',
  },
  {
    step: 8,
    persona: 'head_of_year_9',
    title: 'Show a blue recovery story',
    instruction: 'Switch to Year 9 HOY. Find Amara Osei (blue). The signal card shows: previous SEND support produced a 12% attendance improvement sustained for 9 weeks. This is a success — no action required. The card explains what worked and why.',
    highlight: 'Blue success state + memory',
    pupil: 's14',
  },
  {
    step: 9,
    persona: 'slt',
    title: 'SLT school intelligence',
    instruction: 'Switch to Headteacher/SLT. Open School Intelligence. Year 9 shows three pupils with concurrent deterioration. One department (Science) shows higher incident concentration. One teacher shows significantly fewer positive points than peers — flagged for a coaching conversation, not a formal process.',
    highlight: 'School Intelligence',
    pupil: null,
  },
  {
    step: 10,
    persona: 'slt',
    title: 'Show reward-pattern intelligence',
    instruction: "Open Staff Development. The May green-point campaign produced short-term compliance but attendance declined after 11 days. The system distinguishes this from Amara's genuine recovery. Neither is labelled as bribery — the language is cautious and evidence-based.",
    highlight: 'Staff Development → reward patterns',
    pupil: null,
  },
  {
    step: 11,
    persona: 'head_of_year_10',
    title: 'Show the grey insufficient-evidence case',
    instruction: 'Switch to Year 10 HOY. Find Jordan Marsh (grey). The card says: "Insufficient data — monitoring period. Joined 3 weeks ago. One late mark. No pattern detected." StudentSignal does not invent a concern where none exists.',
    highlight: 'Grey state card',
    pupil: 's28',
  },
  {
    step: 12,
    persona: 'teacher',
    title: 'Show that a teacher sees nothing they cannot act on',
    instruction: 'Switch to Teacher persona. The Signal Queue and Morning Briefing are empty — no assigned actions. The teacher can view pupil profiles they teach, but no safeguarding details, no personal workload items, no actions to complete.',
    highlight: 'Empty teacher queue',
    pupil: null,
  },
];
