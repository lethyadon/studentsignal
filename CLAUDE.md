# Student Signal — CLAUDE.md

This file gives any Claude session full context about this project so work can
continue immediately without re-explanation.

---

## What this project is

**Student Signal** is a UK secondary-school pastoral management web app.
It aggregates student data (behaviour, attendance, SEND status, safeguarding
flags) and surfaces actionable pastoral intelligence to the right staff at the
right time — with strict role-based scoping so each user only sees students
they are responsible for.

Status: **active development / demo-ready**. No live school data yet — all
data is demo/mock. Supabase is wired for auth and persistence when real data
is uploaded.

---

## Tech stack

| Tool | Version / notes |
|------|----------------|
| React | 18 + TypeScript |
| Vite | dev server (already running — never start/stop it) |
| Tailwind CSS | v3, teal/emerald primary palette |
| Supabase | auth + DB (credentials pre-populated in `.env`) |
| React Router | v7 |
| Lucide React | icons only — no other icon libraries |
| Recharts | charts |
| jsPDF + jspdf-autotable | PDF report export |

**Never install additional UI/icon packages.** Use Tailwind + Lucide React.

---

## Project structure

```
src/
  App.tsx                  — routes + ProtectedRoute guard
  index.css                — Tailwind + custom CSS classes
  types/index.ts           — all shared TypeScript types
  context/
    AuthContext.tsx         — Supabase auth + demo mode
    PriorityBarContext.tsx  — scoped student/intervention counts for the top bar
  lib/
    data.ts                — MOCK data, DEMO_STAFF, HOY_BY_YEAR, data fetch fns
    demoData.ts            — extra demo students/records imported by data.ts
    permissions.ts         — role/permission system + isStudentInScope()
    safeguarding.ts        — safeguarding keyword detection
    supabase.ts            — Supabase client
    pdfReport.ts           — PDF generation helpers
  components/
    Layout.tsx             — sidebar nav + top bar wrapper
    GlobalPriorityBar.tsx  — scoped red/amber counts bar (reads PriorityBarContext)
    ActionDrawer.tsx       — slide-out drawer for editing an intervention
    NotificationCenter.tsx — notification panel, role-scoped
    StudentDrawer.tsx      — quick student info drawer
    DemoGuide.tsx          — demo onboarding guide
    QuickLogModal.tsx      — quick behaviour log modal
    QuickNoteModal.tsx     — quick note modal
    SafeguardingAlert.tsx  — safeguarding banner
    SignpostingModal.tsx   — signposting/next steps modal
    Toast.tsx              — toast notification system
  pages/
    LandingPage.tsx        — public marketing page
    AuthPage.tsx           — sign in / sign up
    Dashboard.tsx          — main overview, year-scoped for HOY
    SignalQueue.tsx        — ranked student concern queue, role-scoped
    StudentProfile.tsx     — full student detail (tabs: overview, actions, notes, timeline, careers, SEND, comms)
    Interventions.tsx      — actions/workflow management
    SuccessStories.tsx     — graduation pipeline + recognition
    Communications.tsx     — parent/carer contact log
    Careers.tsx            — careers destination tracking
    ReportsPage.tsx        — exportable reports
    StaffDevelopment.tsx   — staff insights
    Settings.tsx           — user/school settings
    UploadCsv.tsx          — CSV data upload
    AnalysisResults.tsx    — post-upload analysis
    UserManagement.tsx     — user admin (admin only)
    Reviews.tsx            — redirects to /interventions
```

---

## Routes

| Path | Page | Auth |
|------|------|------|
| `/` | LandingPage | public |
| `/auth` | AuthPage | public |
| `/dashboard` | Dashboard | protected |
| `/upload` | UploadCsv | protected |
| `/analysis` | AnalysisResults | protected |
| `/signal-queue` | SignalQueue | protected |
| `/students/:id` | StudentProfile | protected |
| `/interventions` | Interventions | protected |
| `/success-stories` | SuccessStories | protected |
| `/careers` | Careers | protected |
| `/reports` | ReportsPage | protected |
| `/communications` | Communications | protected |
| `/staff-development` | StaffDevelopment | protected |
| `/settings` | Settings | protected |
| `/reviews` | → redirect to /interventions | |

Protected routes require `user || demoMode`. Loading screen is suppressed in
demo mode to avoid race conditions.

---

## Authentication & demo mode

`AuthContext` (`src/context/AuthContext.tsx`) manages both real Supabase auth
and demo mode.

**Demo mode** is activated via `enableDemo(role, name)`. State is persisted in
`sessionStorage` under key `ss_demo_session` so page refresh within a tab
keeps the demo session alive. Demo profiles have `school_id: null`.

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

Profile shape: `{ id, school_id, role, full_name }`.
Access via `const { profile, demoMode } = useAuth()`.

---

## Role & permission system

**File:** `src/lib/permissions.ts`

### Roles (`AppRole`)
`admin` | `slt` | `dsl` | `sendco` | `head_of_year` | `pastoral_lead` |
`tutor` | `teacher` | `careers_lead` | `trust` | `staff`

### Key functions

```typescript
hasPermission(role, permission)      // boolean
hasAnyPermission(role, permissions[]) // boolean
getVisibleNoteTypes(role)            // string[]
getNavPermissions(role)              // nav visibility object
isStudentInScope(role, student, userYearGroup, userForm) // boolean
```

### `isStudentInScope` — THE KEY SCOPING FUNCTION

```typescript
isStudentInScope(
  role,         // AppRole string
  student,      // { year_group, form, send_status }
  userYearGroup, // from getHOYYearGroup(fullName) — null for non-HOY
  userForm,     // form code e.g. '10B' for tutors — null for non-tutors
): boolean
```

- **Broad roles** (admin, slt, dsl, sendco, pastoral_lead, careers_lead, trust): see ALL students
- **head_of_year**: scoped to their `year_group` (derived from name like `Ms Harris (HOY Y10)`)
- **tutor**: scoped to their `form` code (currently hardcoded `'10B'` for demo — real app would use profile field)
- **teacher / staff**: no student access by default

**IMPORTANT:** Always derive `userYearGroup` using `getHOYYearGroup(fullName)`, NOT by
reversing `HOY_BY_YEAR`. The function parses the year from the name suffix `(HOY Y10)`.

### Permission table (abbreviated)

| Permission | admin | slt | dsl | sendco | hoy | pastoral | tutor | teacher |
|-----------|-------|-----|-----|--------|-----|----------|-------|---------|
| view_all_students | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| view_safeguarding | ✓ | ✓ | ✓ | — | — | — | — | — |
| view_send | ✓ | ✓ | ✓ | ✓ | — | — | — | — |
| manage_actions | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| assign_to_any_staff | ✓ | ✓ | ✓ | — | ✓ | — | — | — |
| view_user_management | ✓ | — | — | — | — | — | — | — |
| upload_data | ✓ | ✓ | — | — | — | — | — | — |

`canSeeAllAssignments` = `['admin','slt','dsl','sendco'].includes(role)`

---

## Data layer

**File:** `src/lib/data.ts`

### Demo staff (`DEMO_STAFF`)
```typescript
{ name: 'Ms Harris (HOY Y10)', role: 'Head of Year 10' }
{ name: 'Mr Okafor (HOY Y9)', role: 'Head of Year 9' }
{ name: 'Mrs Reeves (HOY Y11)', role: 'Head of Year 11' }
{ name: 'Mr Ahmed (DSL)', role: 'Designated Safeguarding Lead' }
{ name: 'Ms Jones (SENDCo)', role: 'SENDCo' }
{ name: 'Mr Patel (Tutor)', role: 'Form Tutor' }
{ name: 'Mrs Thompson (Pastoral)', role: 'Pastoral Manager' }
{ name: 'Ms Brown (Careers)', role: 'Careers Lead' }
{ name: 'Mr Lee (SLT)', role: 'SLT Lead' }
// ... and more
```

### HOY year group mapping
```typescript
export const HOY_BY_YEAR: Record<string, string> = {
  'Year 7':  'Ms Clarke (HOY Y7)',
  'Year 8':  'Mr Singh (HOY Y8)',
  'Year 9':  'Mr Okafor (HOY Y9)',
  'Year 10': 'Ms Harris (HOY Y10)',
  'Year 11': 'Mrs Reeves (HOY Y11)',
};
```

### `getHOYYearGroup(fullName)`
Parses `(HOY Y10)` from the name string. Returns `'Year 10'` etc.
**Do NOT use `HOY_BY_YEAR` reverse lookup** — it was buggy (multiple years
mapped to the same HOY). Always use this function.

### Student fields (`Student` type)
```typescript
id, name, year_group, form, send_status, pupil_premium,
behaviour_score, attendance_pct, risk_level, signal_category,
positive_points, punctuality_issues, photo_url, graduation_status
```

`year_group` values: `'Year 7'` through `'Year 11'`
`signal_category` values: `'red' | 'amber' | 'purple' | 'green' | 'blue'`
`risk_level` values: `'red' | 'amber' | 'green'`

### Key data functions
```typescript
getStudents(schoolId)               // all students (pass null for demo)
getStudent(schoolId, id)            // single student
getInterventions(schoolId, studentId?) // interventions
getAnalysisResults(schoolId)        // analysis records
getCommunications(schoolId, studentId?)
getStudentsWithSignals(schoolId)
getHOYYearGroup(fullName)
isInterventionAssignedToUser(assignedTo, fullName)
computeGraduationStatus(student)
mapOwnerToStaffName(suggested, yearGroup?)
```

Demo state stores (in-memory, ephemeral):
- `getDemoRecognitions()` / `addDemoRecognition()` / `updateDemoRecognition()`
- `getDemoDismissals(studentId)` / `addDemoDismissal(studentId, recId)`
- `getDemoSignalStatus(id)` / `setDemoSignalStatus(id, status)`
- `addDemoIntervention()` / `updateDemoIntervention()`
- `subscribeToInterventions(fn)` / `subscribeToSignalStatuses(fn)` (pub/sub for cross-page sync)

---

## Role-scoped pages — implementation pattern

Every page that shows students/data must scope by role. The pattern is:

```typescript
const currentRole = (profile as any)?.role || '';
const currentUserName = (profile as any)?.full_name || '';
const userYearGroup = currentRole === 'head_of_year' ? getHOYYearGroup(currentUserName) : null;
const userForm = currentRole === 'tutor' ? '10B' : null;
// Then filter students:
students.filter(s => isStudentInScope(currentRole, s, userYearGroup, userForm))
```

### Pages that implement scoping
- `SignalQueue.tsx` — student list scoped before building signals
- `Interventions.tsx` — tab label, student dropdown, action list, "Assigned to" column hidden for non-privileged roles
- `StudentProfile.tsx` — access denied screen if HOY navigates to out-of-year student
- `SuccessStories.tsx` — graduation pipeline scoped
- `Communications.tsx` — comms feed + stats + student dropdown scoped
- `PriorityBarContext.tsx` — red/amber/green counts + intervention counts scoped
- `NotificationCenter.tsx` — already had its own `inScope()` helper

### "Assigned to" column visibility
Only `['admin', 'slt', 'dsl', 'sendco']` see the "Assigned to" column and
full staff picker. Other roles see the column hidden and the create-action form
locks assignment to themselves.

```typescript
const canSeeAllAssignments = ['admin', 'slt', 'dsl', 'sendco'].includes(currentRole);
```

---

## PriorityBarContext

`src/context/PriorityBarContext.tsx` — provides scoped counts to
`GlobalPriorityBar` and other consumers.

```typescript
const { redCount, amberCount, greenCount, openActionsCount, urgentCount,
        reviewsDueCount, myQueueCount, notifCount, notifications,
        students, interventions, loading, refresh } = usePriorityBar();
```

`students` and `interventions` returned are **already scoped** to the current
user's role. Consumers should not re-scope.

---

## Custom CSS classes (from `index.css`)

```css
.btn-primary        — teal primary button
.btn-secondary      — outlined secondary button
.input-premium      — styled form input
.table-premium      — styled table
.badge-red          — red risk badge
.badge-amber        — amber risk badge
.badge-green        — green risk badge
.card-premium       — white card with shadow
.animate-flash-ring — ring animation for highlighted rows
```

Primary palette: teal/emerald (`--color-primary-*`).
**Never use purple/indigo** unless explicitly requested.

---

## Supabase DB tables (from migrations)

| Table | Purpose |
|-------|---------|
| `schools` | school records |
| `profiles` | user profiles (id, school_id, role, full_name) |
| `students` | student records |
| `behaviour_records` | behaviour incidents |
| `analysis_results` | AI-derived risk analysis |
| `interventions` | pastoral actions/workflow |
| `career_profiles` | student career data |
| `communications` | parent/carer contact log |
| `quick_notes` | quick staff observations |
| `success_recognitions` | recognition records |
| `recommendation_dismissals` | dismissed recommendations |
| `notifications` | user notifications |
| `staff_insights` | staff development data |
| `uploads` | CSV upload history |

Always enable RLS on new tables. Use 4 separate policies (SELECT, INSERT,
UPDATE, DELETE). Use `auth.uid()` for ownership checks, not `current_user`.

---

## Key design decisions & constraints

1. **Demo mode is entirely in-memory / sessionStorage.** No Supabase calls
   when `demoMode === true` (`effectiveSchoolId = demoMode ? null : schoolId`).
   Pass `null` as schoolId to all data functions for demo.

2. **`getHOYYearGroup` parses from name suffix**, not reverse HOY_BY_YEAR
   lookup. The mapping previously had Y7/Y8 pointing to Ms Harris (a bug now
   fixed). Always use the parsing function.

3. **Tutor form is hardcoded `'10B'`** in demo. In production this would come
   from a `form_group` field on the user's profile.

4. **`isStudentInScope` is the single source of truth** for who can see whom.
   Apply it consistently — don't write ad-hoc year-group filters inline.

5. **PriorityBarContext exposes pre-scoped data.** Downstream components
   (`GlobalPriorityBar`, `Dashboard`) read from it and should not re-filter.

6. **Interventions "Assigned to" column** is hidden for non-admin/SLT/DSL/SENDCo.
   Non-privileged users also cannot assign to other staff when creating actions.

7. **StudentProfile shows an access denied screen** (not a 404) when an HOY
   navigates to an out-of-year student — with an explanation of which year
   their remit covers.

8. **Never start the dev server** — it runs automatically in this environment.

9. **No purple/indigo** in new UI unless user explicitly requests it.

10. **No new packages** without good reason. Lucide React for icons, Tailwind
    for styling.

---

## Intervention status flow

```
suggested → open → assigned → in_progress → awaiting_review → completed
                                          ↘ escalated
                                          ↘ cancelled
                                          ↘ closed
```

Priority levels: `low | medium | high | urgent`

---

## Signal category meanings

| Category | Meaning |
|----------|---------|
| `red` | Serious concern — immediate pastoral attention |
| `amber` | Watchlist — emerging risk |
| `purple` | Hidden decline — performing but struggling |
| `green` | Positive progress |
| `blue` | Exceptional achievement |

---

## Graduation pipeline (SuccessStories)

```
active → monitor → stable → success_story
```

Computed by `computeGraduationStatus(student)` in `data.ts`.

---

## Note visibility levels

`general` | `pastoral` | `send` | `dsl_only` | `slt_only`

Controlled by `getVisibleNoteTypes(role)` in `permissions.ts`.

---

## Things still using demo hardcodes (future real-app work)

- Tutor form group: hardcoded `'10B'` — needs `profile.form_group` field
- HOY year group: parsed from name suffix — needs `profile.year_group` field  
- DEMO_STAFF list is static — needs to come from `profiles` table
- Mock students in `data.ts` / `demoData.ts` — need real upload flow

