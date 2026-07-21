# Student Signal — Project Handover

> Last updated: July 2026  
> Status: Active development / demo-ready. No live school data yet — all data is demo/mock.

---

## Contents

1. [What is Student Signal?](#1-what-is-student-signal)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Running Locally](#4-running-locally)
5. [Environment Variables](#5-environment-variables)
6. [Database Schema](#6-database-schema)
7. [Supabase Migrations](#7-supabase-migrations)
8. [Edge Functions](#8-edge-functions)
9. [Authentication & Demo Mode](#9-authentication--demo-mode)
10. [Role & Permission System (RBAC)](#10-role--permission-system-rbac)
11. [Intelligence Engine](#11-intelligence-engine)
12. [Workflow Engine](#12-workflow-engine)
13. [Stripe Payments](#13-stripe-payments)
14. [Deployment](#14-deployment)
15. [Known Hardcodes / Future Work](#15-known-hardcodes--future-work)

---

## 1. What is Student Signal?

Student Signal is a UK secondary-school pastoral management web application. It aggregates student data (behaviour, attendance, SEND status, safeguarding flags) and surfaces actionable pastoral intelligence to the right staff at the right time — with strict role-based scoping so each user only sees the students they are responsible for.

### Key capabilities

- **Morning Intelligence Briefing** — daily dashboard scoped by role showing red/amber student counts, open actions, and urgent notifications
- **Signal Queue** — ranked list of student concerns, with lifecycle tracking from `suggested` through to `resolved`
- **Student Profiles** — per-student detail with tabs: Overview, Actions, Notes, Timeline, Careers, SEND, Communications
- **Interventions / Actions Workflow** — multi-stage workflow engine with role-based assignment, escalation, and completion tracking
- **Success Stories** — graduation pipeline tracking students from concern to success
- **Careers Intelligence** — destination tracking, pathway suggestions, signposting
- **Parent/Carer Communications Log** — structured contact record with follow-up routing
- **Reports & Exports** — PDF/CSV export of pastoral data
- **CSV Upload** — schools upload behaviour/attendance data; analysis runs automatically
- **Safeguarding Alerts** — keyword detection in notes surfaces DSL flags
- **Notifications** — role-scoped notification centre with priority alerts
- **Staff Insights** — wellbeing and performance data for SLT
- **User Management** — school admin can add/remove staff and assign roles

---

## 2. Tech Stack

| Tool | Version | Notes |
|------|---------|-------|
| React | 18.3 | UI framework |
| TypeScript | 5.5 | Strict typing throughout |
| Vite | 5.4 | Dev server + build tool |
| Tailwind CSS | 3.4 | Utility-first styling, teal/emerald palette |
| React Router | 7 | Client-side routing |
| Supabase | 2.57 | Auth, PostgreSQL DB, Edge Functions, RLS |
| Recharts | 3.8 | Charts and data visualisations |
| jsPDF + jspdf-autotable | 4.2 / 5.0 | PDF report generation |
| Lucide React | 0.344 | Icons (only icon library used) |
| date-fns | 4.4 | Date utilities |

**Do not add additional icon libraries or UI component packages** — use Tailwind + Lucide React only.

---

## 3. Project Structure

```
.
├── public/
├── src/
│   ├── App.tsx                   Routes + ProtectedRoute guard
│   ├── main.tsx
│   ├── index.css                 Tailwind + custom CSS classes
│   ├── stripe-config.ts          Stripe product/price definitions
│   ├── types/
│   │   └── index.ts              All shared TypeScript types
│   ├── context/
│   │   ├── AuthContext.tsx        Supabase auth + demo mode
│   │   └── PriorityBarContext.tsx Scoped student/intervention counts
│   ├── lib/
│   │   ├── data.ts               Mock data, demo stores, data fetch functions
│   │   ├── demoData.ts           Extra demo students/interventions
│   │   ├── permissions.ts        RBAC: roles, permissions, isStudentInScope()
│   │   ├── safeguarding.ts       Keyword detection for safeguarding flags
│   │   ├── supabase.ts           Supabase client initialisation
│   │   └── pdfReport.ts          PDF generation helpers
│   ├── components/
│   │   ├── Layout.tsx            Sidebar nav + top bar wrapper
│   │   ├── GlobalPriorityBar.tsx Scoped red/amber count bar
│   │   ├── ActionDrawer.tsx      Slide-out drawer for editing an intervention
│   │   ├── NotificationCenter.tsx Notification panel (role-scoped)
│   │   ├── StudentDrawer.tsx     Quick student info drawer
│   │   ├── DemoGuide.tsx         Demo onboarding guide
│   │   ├── QuickLogModal.tsx     Quick behaviour log modal
│   │   ├── QuickNoteModal.tsx    Quick note modal
│   │   ├── SafeguardingAlert.tsx Safeguarding keyword banner
│   │   ├── SignpostingModal.tsx  Signposting/next-steps modal
│   │   └── Toast.tsx             Toast notification system
│   └── pages/
│       ├── LandingPage.tsx       Public marketing page
│       ├── AuthPage.tsx          Sign in / sign up
│       ├── Dashboard.tsx         Morning briefing overview
│       ├── SignalQueue.tsx        Ranked concern queue
│       ├── StudentProfile.tsx    Full student detail (7 tabs)
│       ├── Interventions.tsx     Actions/workflow management
│       ├── SuccessStories.tsx    Graduation pipeline
│       ├── Communications.tsx    Parent/carer contact log
│       ├── Careers.tsx           Careers destination tracking
│       ├── ReportsPage.tsx       Exportable reports
│       ├── StaffDevelopment.tsx  Staff insights
│       ├── Settings.tsx          User/school settings
│       ├── UploadCsv.tsx         CSV data upload
│       ├── AnalysisResults.tsx   Post-upload analysis display
│       └── UserManagement.tsx    User admin (admin only)
├── supabase/
│   ├── functions/               Edge Functions (Deno)
│   └── migrations/              SQL migration files
├── .env                         Local environment variables
├── package.json
├── vite.config.ts
├── tailwind.config.js
└── CLAUDE.md                    AI assistant project context
```

### Routes

| Path | Page | Auth Required |
|------|------|--------------|
| `/` | LandingPage | Public |
| `/auth` | AuthPage | Public |
| `/dashboard` | Dashboard | Protected |
| `/upload` | UploadCsv | Protected |
| `/analysis` | AnalysisResults | Protected |
| `/signal-queue` | SignalQueue | Protected |
| `/students/:id` | StudentProfile | Protected |
| `/interventions` | Interventions | Protected |
| `/success-stories` | SuccessStories | Protected |
| `/careers` | Careers | Protected |
| `/reports` | ReportsPage | Protected |
| `/communications` | Communications | Protected |
| `/staff-development` | StaffDevelopment | Protected |
| `/settings` | Settings | Protected |
| `/reviews` | Redirect → /interventions | Protected |

Protected routes require `user || demoMode`. In demo mode, the loading screen is suppressed to avoid race conditions.

---

## 4. Running Locally

### Prerequisites

- Node.js 18+
- npm 9+
- A Supabase project (see Section 5)

### Setup

```bash
# Install dependencies
npm install

# Copy environment template and fill in values
cp .env.example .env

# Start the development server
npm run dev
```

The app runs at `http://localhost:5173`.

### Other commands

```bash
npm run build       # Production build (outputs to dist/)
npm run preview     # Preview the production build locally
npm run typecheck   # TypeScript type check (no emit)
npm run lint        # ESLint
```

---

## 5. Environment Variables

### `.env` (required)

```env
# Supabase — get these from your Supabase project settings
VITE_SUPABASE_URL=https://<your-project-id>.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>

# Stripe price IDs — create products in your Stripe dashboard first
VITE_STRIPE_STARTER_MONTHLY_PRICE_ID=price_...
VITE_STRIPE_STARTER_YEARLY_PRICE_ID=price_...
VITE_STRIPE_SCHOOL_MONTHLY_PRICE_ID=price_...
VITE_STRIPE_SCHOOL_YEARLY_PRICE_ID=price_...
```

### Edge Function secrets (set via Supabase Dashboard → Settings → Edge Functions)

| Secret | Used by | Purpose |
|--------|---------|---------|
| `STRIPE_SECRET_KEY` | stripe-webhook, stripe-checkout, create-checkout-session, create-billing-portal-session | Stripe API key |
| `STRIPE_WEBHOOK_SECRET` | stripe-webhook | Webhook signature verification |
| `RESEND_API_KEY` | invite-user, send-verification-email | Email delivery |
| `SUPABASE_SERVICE_ROLE_KEY` | All edge functions | Bypass RLS for server-side operations |
| `SUPABASE_URL` | All edge functions | Supabase project URL |

---

## 6. Database Schema

All tables live in the `public` schema unless noted. RLS is enabled on every table. A `private` schema holds internal helper functions not accessible to clients.

### Core tables

#### `schools`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | School name |
| slug | text unique | URL-safe identifier |
| subscription_status | text | `trial`, `active`, `cancelled` |
| verified | boolean | School verification status |
| verification_code | text | Email verification token |
| contact_email | text | Primary contact |
| created_at | timestamptz | |

#### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | References `auth.users.id` |
| school_id | uuid FK | `schools.id` |
| role | text | One of the `AppRole` values |
| full_name | text | Used for scoping (HOY parses year from suffix) |
| email | text | |
| created_at | timestamptz | |

#### `students`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| school_id | uuid FK | |
| name | text | |
| year_group | text | `Year 7` – `Year 11` |
| form | text | Form group, e.g. `10B` |
| send_status | text | SEND category or null |
| pupil_premium | boolean | |
| date_of_birth | date | |
| uln | text | Unique Learner Number |
| upn | text | Unique Pupil Number |
| behaviour_score | numeric | Computed from behaviour_records |
| attendance_pct | numeric | Computed from upload |
| risk_level | text | `red`, `amber`, `green` |
| signal_category | text | `red`, `amber`, `purple`, `green`, `blue` |
| positive_points | integer | |
| punctuality_issues | integer | |
| photo_url | text | |
| graduation_status | text | `active`, `monitor`, `stable`, `success_story` |
| created_at | timestamptz | |

#### `behaviour_records`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| school_id | uuid FK | |
| student_id | uuid FK | |
| date | date | |
| incident_type | text | |
| behaviour_points | integer | Negative behaviour score |
| lesson_period | text | |
| subject | text | |
| staff_member | text | |
| comment | text | |
| safeguarding_note | text | Surfaces to DSL |
| positive_points | integer | Positive behaviour score |
| praise_comment | text | |

#### `analysis_results`
AI-derived risk analysis for each student after an upload.

| Column | Type |
|--------|------|
| id | uuid PK |
| school_id | uuid FK |
| student_id | uuid FK |
| risk_level | text (`red`/`amber`/`green`) |
| signal_category | text |
| risk_score | numeric |
| key_reasons | text[] |
| behaviour_trend | text |
| attendance_trend | text |
| subjects_involved | text[] |
| periods_involved | text[] |
| suggested_pastoral_action | text |
| suggested_parent_contact | text |
| suggested_staff_action | text |
| career_signposting | text |
| recommended_review_date | date |
| signal_explanation | text |
| previous_state / current_state / what_changed | text | Delta tracking |
| confidence_score | numeric |
| repeated_patterns | jsonb |
| linked_peers | text[] |
| suggested_next_steps | jsonb |
| evidence_count | integer |
| data_sources | text[] |

#### `interventions`
The core workflow table.

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| school_id | uuid FK | |
| student_id | uuid FK | |
| assigned_to | text | Staff name |
| assigned_to_user_id | uuid | References `profiles.id` |
| assigned_role | text | Role of assignee |
| created_by | text | Staff name who created |
| action_type | text | e.g. `Parent Meeting`, `Mentoring Session` |
| priority | text | `low`, `medium`, `high`, `urgent` |
| status | text | See workflow section |
| due_date | date | |
| review_date | date | |
| notes | text | |
| outcome | text | |
| outcome_achieved | text | `achieved`, `partially`, `not_achieved` |
| outcome_status | text | `improving`, `no_change`, `escalating`, `resolved`, `sustained` |
| outcome_notes | text | |
| baseline_attendance / current_attendance / after_attendance | numeric | Tracking |
| baseline_behaviour / current_behaviour / after_behaviour | numeric | Tracking |
| escalated_to / escalation_reason / escalated_by / escalated_at | various | Escalation chain |
| completed_by / completed_at / next_step | various | Completion metadata |
| source | text | `auto` (AI-suggested) or `manual` |
| created_at | timestamptz | |

#### `communications`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| school_id, student_id | uuid FK | |
| date | date | |
| source | text | `email`, `phone`, `meeting`, `letter`, `external_agency`, `pastoral_conversation` |
| summary | text | |
| priority | text | `low`, `normal`, `high`, `urgent` |
| staff_member | text | |
| follow_up_required | boolean | |
| follow_up_date | date | |
| linked_action_id | uuid | Links to interventions |
| routing_status | text | `pending_review`, `routed`, `dismissed` |
| suggested_assignee | text | |

#### `quick_notes`
Lightweight observations from any staff member.

| Column | Type |
|--------|------|
| id | uuid PK |
| school_id, student_id | uuid FK |
| category | text (QuickNoteCategory enum) |
| concern_level | integer (1–5) |
| visibility | text (`general`, `pastoral`, `send`, `dsl_only`, `slt_only`) |
| note | text |
| staff_member | text |
| date | date |
| action_needed | boolean |
| assign_to | text |
| follow_up_date | date |

#### `success_recognitions`
| Column | Type |
|--------|------|
| id | uuid PK |
| school_id, student_id | uuid FK |
| category | text |
| title | text |
| description | text |
| awarded_by | text |
| date | date |
| is_public | boolean |

#### `notifications`
| Column | Type |
|--------|------|
| id | uuid PK |
| school_id | uuid FK |
| user_id | uuid FK (profiles) |
| type | text |
| title | text |
| message | text |
| priority | text |
| read | boolean |
| action_url | text |
| created_at | timestamptz |

#### `bulletins`
School-wide staff broadcasts.

| Column | Type |
|--------|------|
| id | uuid PK |
| school_id | uuid FK |
| title | text |
| body | text |
| priority | text (`info`, `warning`, `urgent`) |
| author | text |
| created_at | timestamptz |
| expires_at | timestamptz |
| dismissed_by | text[] |

#### Supporting tables

| Table | Purpose |
|-------|---------|
| `career_profiles` | Student career data, interests, barriers, pathways |
| `recommendation_dismissals` | Tracks dismissed AI recommendations per student |
| `staff_insights` | Staff wellbeing/performance metrics |
| `uploads` | CSV upload history |
| `invites` | Pending user invitations |
| `integrations` | MIS/SIMS integration records |
| `sync_logs` | Integration sync history |
| `subscriptions` | Stripe subscription records |
| `stripe_subscriptions` | Raw Stripe subscription data |
| `platform_admins` | Super-admin / platform operator accounts |
| `intelligence_insights` | AI-generated trend insights per school |
| `import_records` | Granular import tracking |

---

## 7. Supabase Migrations

All migrations are in `supabase/migrations/` and applied chronologically. Key milestones:

| File | Purpose |
|------|---------|
| `20260619155351_create_student_signal_schema.sql` | Core schema: schools, profiles, students, behaviour_records, analysis_results, interventions, career_profiles |
| `20260619201507_add_intervention_workflow_fields.sql` | Adds review, outcome, escalation fields to interventions |
| `20260622165636_add_case_management_workflow.sql` | Case management workflow fields, pattern tracking |
| `20260623100813_add_communications_and_staff_insights.sql` | Communications log + staff insights tables |
| `20260623143023_add_user_management_and_notifications.sql` | Notifications, user management, invites |
| `20260623203525_add_recognitions_and_recommendation_dismissals.sql` | success_recognitions, recommendation_dismissals |
| `20260624175404_add_created_by_to_interventions.sql` | created_by column |
| `20260701120000_fix_rls_security_and_invites.sql` | RLS hardening, invites table fix |
| `20260701120100_add_missing_student_signal_columns.sql` | Missing columns backfill |
| `20260701221445_20260701220000_fix_profiles_rls_and_add_trigger.sql` | Auto-create profile on auth.users insert trigger |
| `20260706132651_fix_security_audit_warnings.sql` | Security audit fixes |
| `20260706134912_move_helper_to_private_schema.sql` | Moves `current_user_school_id()` to `private` schema |
| `20260706143431_add_integrations_and_sync_logs.sql` | MIS integration support |
| `20260706150649_add_quick_notes_table.sql` | Quick notes feature |
| `20260706153510_add_bulletins_table.sql` | School bulletins feature |
| `20260706224322_add_subscriptions_table.sql` | Stripe subscriptions tables |
| `20260707082945_add_platform_admins_god_mode.sql` | Platform admin / super-admin support |
| `20260707202019_add_student_identity_fields.sql` | ULN, UPN, DOB columns on students |
| `20260708082827_20260708_create_import_record_tables.sql` | Granular import tracking |
| `20260708161041_create_intelligence_insights.sql` | AI intelligence insights table |
| `20260708172703_fix_interventions_assigned_to_and_add_source.sql` | source column, assigned_to fix |
| `20260708175009_add_assigned_to_user_id_to_interventions.sql` | Links interventions to profiles.id |
| `20260708183248_add_signal_types_to_analysis_results.sql` | signal_category, signal_explanation |
| `20260708183800_add_baseline_columns_to_interventions.sql` | Baseline/current/after tracking |
| `20260708190832_add_signal_explanation_to_analysis_results.sql` | signal_explanation column |

### Applying migrations to a new project

```bash
# Using Supabase CLI (if available)
supabase db push

# Or apply each file manually in the Supabase SQL Editor in chronological order
```

---

## 8. Edge Functions

All functions live in `supabase/functions/<slug>/index.ts` and run on Deno. They all include mandatory CORS headers.

### `run-analysis`
**Trigger:** Called after CSV upload  
**Does:** Processes uploaded student data, computes risk scores, signal categories, behaviour trends, attendance trends, generates suggested interventions, writes to `analysis_results` and `interventions` tables. This is the core intelligence engine.

### `simulate-upload`
**Trigger:** Manual (demo/test)  
**Does:** Simulates a CSV upload for demo environments, creates mock analysis results without real data.

### `data-sync`
**Trigger:** Scheduled / webhook from MIS integrations  
**Does:** Pulls data from connected MIS systems (SIMS, Bromcom, etc.), normalises it, writes to `students` and `behaviour_records`, then calls run-analysis.

### `invite-user`
**Trigger:** Admin invites a new staff member  
**Does:** Creates a record in `invites`, sends an invitation email via Resend with a magic link or set-password link.

### `send-verification-email`
**Trigger:** New school registers  
**Does:** Sends email verification to the school contact using Resend. Creates a verification token stored in `schools.verification_code`.

### `verify-school`
**Trigger:** School clicks email verification link  
**Does:** Validates the token, sets `schools.verified = true`, creates initial admin profile.

### `purge-school-data`
**Trigger:** Admin requests full data purge  
**Does:** Deletes all data for a school (students, behaviour records, interventions, etc.). Irreversible. Requires service role key.

### `stripe-webhook`
**Trigger:** Stripe sends events to `/functions/v1/stripe-webhook`  
**Does:** Handles `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Syncs subscription state to `stripe_subscriptions` and `subscriptions` tables. Updates `schools.subscription_status`.

### `stripe-checkout` / `create-checkout-session`
**Trigger:** User clicks Subscribe on pricing page  
**Does:** Creates a Stripe Checkout session for the selected price ID. Returns the session URL for redirect.

### `create-billing-portal-session`
**Trigger:** User clicks Manage Subscription in Settings  
**Does:** Creates a Stripe Billing Portal session for the customer.

---

## 9. Authentication & Demo Mode

Authentication is managed in `src/context/AuthContext.tsx`.

### Real auth (Supabase)

Standard Supabase email/password auth. On sign-in, the context loads the user's `profile` from the `profiles` table. Email confirmation is OFF by default.

```typescript
const { user, profile, demoMode, demoProfile, loading } = useAuth();
```

### Demo mode

Demo mode bypasses Supabase entirely. Activated via `enableDemo(role, name)`.

```typescript
enableDemo('head_of_year', 'Ms Harris (HOY Y10)');
```

State is persisted in `sessionStorage` under key `ss_demo_session` so page refresh within a tab keeps the session alive. Demo profiles have `school_id: null`.

### Demo personas

| Role | Name | Title |
|------|------|-------|
| `admin` | Mrs Clarke | Headteacher |
| `slt` | Mr Thompson | Deputy Head |
| `dsl` | Mr Ahmed | DSL |
| `head_of_year` | Ms Harris | Head of Year 10 |
| `sendco` | Ms Jones | SENDCo |
| `tutor` | Mr Patel | Form Tutor — 10B |
| `teacher` | Ms Okonkwo | Classroom Teacher |

### GodModeBar (platform admin only)

When logged in as a `super_admin` / platform admin, a fixed bar at the top of the screen allows role/name impersonation without signing out. Uses `setRoleOverride` and `setNameOverride` on AuthContext.

---

## 10. Role & Permission System (RBAC)

**File:** `src/lib/permissions.ts`

### Roles (`AppRole`)

| Role | Label | Scope |
|------|-------|-------|
| `admin` | Headteacher | Full access, all students |
| `slt` | Assistant Head | Full access, all students |
| `dsl` | DSL | All students, safeguarding focus |
| `sendco` | SENDCo | All students, SEND focus |
| `head_of_year` | Head of Year | Own year group only |
| `pastoral_lead` | Pastoral Lead | All students |
| `tutor` | Form Tutor | Own form group only |
| `teacher` | Teacher | No student access by default |
| `careers_lead` | Careers Advisor | All students, careers focus |
| `trust` | Trust User | Read-only, all students |
| `staff` | Staff | Minimal (general notes only) |
| `super_admin` | Platform Admin | Cross-school, all permissions |

### Key functions

```typescript
hasPermission(role, permission)        // boolean
hasAnyPermission(role, permissions[])  // boolean
getVisibleNoteTypes(role)              // string[] — which note visibility levels
getNavPermissions(role)                // nav item visibility object
isStudentInScope(role, student, userYearGroup, userForm) // boolean
```

### `isStudentInScope` — the scoping function

Every page that displays students must filter through this function:

```typescript
// Pattern used across all pages
const currentRole = (profile as any)?.role || '';
const currentUserName = (profile as any)?.full_name || '';
const userYearGroup = currentRole === 'head_of_year'
  ? getHOYYearGroup(currentUserName) : null;
const userForm = currentRole === 'tutor' ? '10B' : null;

const scopedStudents = allStudents.filter(s =>
  isStudentInScope(currentRole, s, userYearGroup, userForm)
);
```

- **Broad roles** (admin, slt, dsl, sendco, pastoral_lead, careers_lead, trust): see ALL students
- **head_of_year**: scoped to their year group, derived by parsing `(HOY Y10)` from their name
- **tutor**: scoped to their form code (currently hardcoded `'10B'` for demo)
- **teacher / staff**: no student access by default

**Important:** Always derive `userYearGroup` using `getHOYYearGroup(fullName)`, not by reversing the `HOY_BY_YEAR` map.

### Permission matrix (abbreviated)

| Permission | admin | slt | dsl | sendco | hoy | tutor | teacher |
|-----------|:-----:|:---:|:---:|:------:|:---:|:-----:|:-------:|
| view_all_students | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| view_safeguarding | ✓ | ✓ | ✓ | — | — | — | — |
| view_send | ✓ | ✓ | ✓ | ✓ | — | — | — |
| manage_actions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| assign_to_any_staff | ✓ | ✓ | ✓ | — | ✓ | — | — |
| view_user_management | ✓ | — | — | — | — | — | — |
| upload_data | ✓ | ✓ | — | — | — | — | — |

---

## 11. Intelligence Engine

The intelligence engine runs in two contexts:

### Production path (real data)

1. School uploads a CSV (behaviour export from MIS, attendance file, etc.)
2. `UploadCsv.tsx` sends the file to the `run-analysis` edge function
3. Edge function normalises data, writes to `behaviour_records` and `students`
4. Computes per-student risk signals:
   - **Risk score** (0–100): weighted combination of behaviour points, attendance, SEND status, pupil premium, punctuality, positive points
   - **Signal category**: `red` (serious concern), `amber` (watchlist), `purple` (hidden decline — performing but struggling), `green` (positive progress), `blue` (exceptional achievement)
   - **Key reasons**: human-readable explanations for the signal
   - **Trends**: behaviour/attendance trend strings
5. Writes `analysis_results` rows; suggests interventions in `interventions` table with `source: 'auto'`
6. Frontend redirects to `/analysis` to review results

### Demo path (mock data)

`src/lib/data.ts` and `src/lib/demoData.ts` contain pre-built mock students, behaviour records, and analysis results. No network calls are made in demo mode.

### Signal category logic

| Category | Criteria |
|----------|---------|
| `red` | High risk score (>70), serious behaviour incidents, or safeguarding flags |
| `amber` | Moderate risk (40–70), declining trends |
| `purple` | Moderate risk but apparently doing well — hidden decline |
| `green` | Improving after intervention, low risk |
| `blue` | Exceptional positive indicators |

### `buildRecommendedActions()` (StudentProfile.tsx)

Generates suggested interventions based on the student's analysis result. Uses a **4-week rolling suppression window**: if a completed intervention of the same `action_type` exists within the last 28 days, that recommendation is suppressed. After 28 days, it can re-appear if the underlying issue recurs.

```typescript
const fourWeeksAgo = new Date();
fourWeeksAgo.setDate(fourWeeksAgo.getDate() - 28);
// Only suppress completions within the 4-week window
```

---

## 12. Workflow Engine

### Intervention status flow

```
suggested → open → in_progress → awaiting_review → completed
                                                  ↘ escalated
                                                  ↘ cancelled
                                                  ↘ closed
```

AI-generated interventions start as `suggested`. Manual interventions start as `open`.

### Signal status (separate from intervention status)

Each student has a `signalStatus` tracked in `_demoSignalStatuses` (demo) / `analysis_results` (production):

```
new → action_in_progress → review_due → resolved
                         ↘ escalated
                         ↘ dismissed
```

### Signal resolution rules

A student's signal only resolves to `resolved` when **all active interventions** are complete:

```typescript
const remainingActive = interventions.filter(i =>
  !['completed', 'closed', 'cancelled', 'suggested'].includes(i.status)
);
const allDone = remainingActive.length === 0;

if (allDone && (outcomeCategory === 'Resolved' || nextStep === 'close')) {
  signalStatus = 'resolved';   // Student disappears from signal queue
} else if (allDone) {
  signalStatus = 'review_due'; // Stays visible, flagged for review
} else {
  signalStatus = 'action_in_progress'; // Still being worked
}
```

A single completed intervention does **not** resolve the student's signal if other interventions remain active.

### Role-based workflow access

```typescript
const isOversightRole = ['admin', 'slt', 'dsl', 'sendco'].includes(currentRole);
const isAssignee = isInterventionAssignedToUser(intervention.assigned_to, fullName);
const canAct = isAssignee || isOversightRole;
```

Only `canAct === true` can progress, complete, or escalate an intervention. HOYs can act on items in their year group that are assigned to them.

**"Assigned to" column visibility:**

```typescript
const canSeeAllAssignments = ['admin', 'slt', 'dsl', 'sendco'].includes(currentRole);
```

Only these roles see the full staff picker and "Assigned to" column. Others are locked to self-assignment.

### Pub/sub for real-time cross-page sync (demo)

```typescript
// Subscribe to changes
const unsubInterventions = subscribeToInterventions(() => loadInterventions());
const unsubSignals = subscribeToSignalStatuses(() => loadStudents());

// Mutations trigger all subscribers
updateDemoIntervention(updated);   // notifies all subscribeToInterventions listeners
setDemoSignalStatus(id, status);   // notifies all subscribeToSignalStatuses listeners
```

This ensures all open pages (Dashboard, Signal Queue, Student Profile, Interventions) update immediately when any action is taken without requiring a page refresh.

### Demo state persistence

| Key | Storage | Contents |
|-----|---------|---------|
| `ss_demo_session` | sessionStorage | Active demo persona |
| `ss_demo_dismissals` | sessionStorage | Recommendation dismissals per student |
| `ss_demo_bulletins` | sessionStorage | School bulletin board items |

---

## 13. Stripe Payments

**Config file:** `src/stripe-config.ts`

### Products

| Product | Price ID | Price |
|---------|---------|-------|
| Essentials (monthly) | `price_1TqL0fAKhcMEN4QaIkgk4MQ0` | £199/mo |
| Essentials (annual) | `price_1TqL1nAKhcMEN4QacLRLq5Nl` | £1,995/yr |
| Professional (monthly) | `price_1TqL2yAKhcMEN4Qa3Db0bB52` | £399/mo |
| Professional (annual) | `price_1TqL3hAKhcMEN4Qazb2dafqz` | £3,995/yr |

### Checkout flow

1. User clicks Subscribe on LandingPage or Settings
2. Frontend calls `create-checkout-session` edge function with the selected `priceId` and `schoolId`
3. Edge function creates a Stripe Checkout session, returns the URL
4. User is redirected to Stripe-hosted checkout
5. On success, Stripe fires a `checkout.session.completed` webhook to `stripe-webhook`
6. `stripe-webhook` updates `subscriptions` and `stripe_subscriptions` tables
7. `schools.subscription_status` is set to `active`

### Webhook endpoint

Register in Stripe Dashboard: `https://<project-id>.supabase.co/functions/v1/stripe-webhook`

Events to enable:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_failed`

---

## 14. Deployment

### Frontend (Bolt / Netlify / Vercel)

The frontend is a standard Vite React SPA. Build with `npm run build` — output is in `dist/`.

Environment variables must be set in the hosting platform's dashboard (prefixed `VITE_`).

### Supabase

1. Create a new Supabase project at [supabase.com](https://supabase.com)
2. Copy the project URL and anon key to `.env`
3. Apply migrations in order (SQL Editor or `supabase db push`)
4. Deploy each edge function:
   ```bash
   supabase functions deploy run-analysis
   supabase functions deploy stripe-webhook
   # ... etc
   ```
5. Set edge function secrets in Supabase Dashboard → Settings → Edge Functions

### Stripe

1. Create products and prices in the Stripe Dashboard matching the price IDs in `stripe-config.ts` (or create new ones and update that file)
2. Register the webhook endpoint
3. Add `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` as Supabase Edge Function secrets

---

## 15. Known Hardcodes / Future Work

These are conscious demo shortcuts that need replacing when connecting real school data:

| Item | Location | Current State | Production Fix |
|------|----------|--------------|----------------|
| Tutor form group | `Interventions.tsx`, `SignalQueue.tsx`, all scoped pages | Hardcoded `'10B'` | Read from `profile.form_group` field (needs DB column) |
| HOY year group | `permissions.ts` / `getHOYYearGroup()` | Parsed from name suffix `(HOY Y10)` | Read from `profile.year_group` field (needs DB column) |
| Demo staff list | `src/lib/data.ts` `DEMO_STAFF` | Static array | Query from `profiles` table filtered by `school_id` |
| Mock students | `src/lib/data.ts` + `src/lib/demoData.ts` | ~50 hard-coded students | Replaced by real CSV upload + analysis pipeline |
| Analysis engine | `run-analysis` edge function | Stub / heuristic | Full ML/AI risk scoring pipeline |
| MIS integration | `data-sync` edge function | Skeleton | Full SIMS/Bromcom/Arbor API adapters |
| Email delivery | `invite-user`, `send-verification-email` | Resend integration | Verify Resend domain; add branded templates |

---

## Appendix: Custom CSS classes

Defined in `src/index.css`:

| Class | Purpose |
|-------|---------|
| `.btn-primary` | Teal primary button |
| `.btn-secondary` | Outlined secondary button |
| `.input-premium` | Styled form input |
| `.table-premium` | Styled data table |
| `.badge-red` | Red risk badge |
| `.badge-amber` | Amber risk badge |
| `.badge-green` | Green risk badge |
| `.card-premium` | White card with shadow |
| `.animate-flash-ring` | Ring animation for highlighted rows |

Primary palette: teal/emerald (`--color-primary-*`). Never use purple/indigo in new UI unless explicitly requested.

---

## Appendix: Signal category meanings

| Category | Colour | Meaning |
|----------|--------|---------|
| `red` | Red | Serious concern — immediate pastoral attention required |
| `amber` | Amber | Watchlist — emerging risk, monitor closely |
| `purple` | Purple | Hidden decline — appears to be performing but struggling |
| `green` | Green | Positive progress — improving after intervention |
| `blue` | Blue | Exceptional achievement — recognition warranted |

---

*Generated from the live codebase. For AI assistant context, see CLAUDE.md.*

