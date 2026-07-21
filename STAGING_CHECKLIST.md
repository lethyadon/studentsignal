# Staging Deployment Checklist
StudentSignal — 20 Jul 2026 Sprint | STAGING CANDIDATE ONLY — NOT PRODUCTION READY

This document is the handoff from the static-audit/test environment to a live Supabase staging project.
Complete every item in order. Do not promote to production until all items are ticked.

---

## Prerequisites

- Supabase project (staging) connected to Bolt
- `supabase` CLI authenticated: `supabase login`
- Node ≥ 18, npm installed
- The ZIP from this sprint unpacked as the working directory

---

## 1. Build verification (must pass before any DB changes)

```bash
npm install
npm run build          # Vite production build — must exit 0 with no TS errors
npm run type-check     # tsc --noEmit — must exit 0
```

Expected: no TypeScript errors, no missing imports, bundle emitted to `dist/`.

---

## 2. Database migrations

Run in the order listed. **All are additive (ADD COLUMN IF NOT EXISTS / CREATE IF NOT EXISTS) — safe to run on an existing schema.**

```bash
# 2a. Sprint migrations (apply in timestamp order)
supabase db push \
  supabase/migrations/20260719100000_role_scoped_rls_and_safeguarding_separation.sql

supabase db push \
  supabase/migrations/20260719110000_structured_intelligence_fields.sql

supabase db push \
  supabase/migrations/20260720000000_personal_workload_queue.sql

supabase db push \
  supabase/migrations/20260720010000_context_intelligence_tables.sql
```

Alternatively, if using `supabase db push --local` with all migrations in the folder:
```bash
supabase db push
```

### Schema diff — new objects added by this sprint

**New tables:**
- `safeguarding_notes` (immutable, audit-only)
- `staff_student_scope` (role → student scope assignments)
- `reward_findings` (persisted reward pattern classifications)
- `staff_baselines` (persisted staff outlier analysis)

**New columns on `interventions`:**
- `review_owner_id UUID`
- `escalation_owner_id UUID`
- `evidence_hash TEXT`
- `signal_version INTEGER DEFAULT 0`
- `completed_by_user_id UUID`
- `acknowledged_at TIMESTAMPTZ`
- `notification_dismissed BOOLEAN DEFAULT FALSE`

**New columns on `analysis_results`:**
- `hypotheses JSONB`
- `context_generated_at TIMESTAMPTZ`

**New columns on `behaviour_records`:** `behaviour_class`, `category`, `location`, `time_of_day`, `department`, `event_type`, `provenance`

**New columns on `attendance_records`:** `late_marks`, `attendance_concern`, `provenance`

**New columns on `safeguarding_records`:** `category`, `subcategory`, `status`, `provenance`

**New columns on `assessment_results`:** `assessment_cycle`, `progress_status`, `provenance`

**New RPCs:**
- `get_personal_queue(p_school_id UUID)`
- `get_my_briefing(p_school_id UUID)`
- `complete_my_action(p_action_id UUID, p_outcome TEXT, p_outcome_notes TEXT)`
- `should_create_action(p_school_id UUID, p_student_id UUID, p_action_type TEXT, p_evidence_hash TEXT)`
- `get_my_workload_counts(p_school_id UUID)`
- `get_safeguarding_notes(p_student_id UUID)`
- `get_safeguarding_records(p_student_id UUID)`

**New triggers on `profiles`:** `enforce_profile_update_rules`
**New trigger on `behaviour_records`:** `divert_safeguarding_note_trigger`

---

## 3. Edge function deployment

```bash
# Deploy the analysis edge function (now uses shared engine)
supabase functions deploy run-analysis

# Deploy the data-sync edge function (now uses canonical.ts)
supabase functions deploy data-sync

# Verify both are active
supabase functions list
```

---

## 4. RLS verification (critical security checks)

Run the following queries in the Supabase SQL editor, logged in as each role:

```sql
-- As a HOY user (year_groups = ['Year 10'])
-- Must return ONLY Year 10 pupils
SELECT id, name, year_group FROM students WHERE school_id = '{school_id}';

-- As a tutor user (form_groups = ['10A'])
-- Must return ONLY 10A pupils
SELECT id, name FROM students WHERE school_id = '{school_id}';

-- As any non-DSL user
-- Must return 0 rows
SELECT * FROM safeguarding_notes WHERE school_id = '{school_id}';

-- Cross-school isolation
-- Must return 0 rows (foreign school)
SELECT * FROM students WHERE school_id = '{other_school_id}';

-- Safeguarding records as HOY (no safeguarding grant)
-- Must return 0 rows
SELECT * FROM safeguarding_records WHERE school_id = '{school_id}';

-- Safeguarding records as DSL
-- Must return all rows for the school
SELECT COUNT(*) FROM safeguarding_records WHERE school_id = '{school_id}';
```

Run the RLS SQL test file for comprehensive coverage:
```bash
psql "$DATABASE_URL" -f tests/db/rls_role_scope.test.sql
```

---

## 5. get_personal_queue RPC verification

```sql
-- Log in as HOY user for school_id = '{school_id}'
-- Should return only pupils where this HOY has an open action
SELECT * FROM get_personal_queue('{school_id}');

-- Log in as DSL user
-- Should return only safeguarding-related pupils
SELECT * FROM get_personal_queue('{school_id}');

-- Log in as a teacher with no assigned actions
-- Should return 0 rows
SELECT COUNT(*) FROM get_personal_queue('{school_id}');
```

---

## 6. Analysis end-to-end test (real data)

1. Log in as admin
2. Navigate to `/upload` 
3. Upload all 6 sample CSVs in order: SIMS → Arbor → ClassCharts → CPOMS → Bromcom → Manual Pastoral Notes
4. Confirm: "20 students imported, 0 rejected, 0 inactive skipped"
5. Navigate to Signal Queue — confirm Ava Wilson appears with `red` badge
6. Click "Accept & Assign" — confirm modal is pre-filled with:
   - Pupil: Ava Wilson
   - Action: (one of the generated actions)
   - Assignee: [actual HOY or DSL name, not 'Select staff member...']
   - Priority: pre-populated
   - Due date: auto-computed
   - Rationale: "Auto-assigned to [name] by StudentSignal."
7. Confirm and save
8. Check NotificationCenter as the HOY user — confirm notification appears
9. Navigate to Interventions — confirm the action appears
10. Click "Mark complete" — confirm action moves to completed state
11. Return to Signal Queue — confirm Ava Wilson no longer appears in HOY's personal queue
12. Log in as DSL — confirm Ava Wilson still appears (safeguarding action still open)
13. Check Ava Wilson's profile timeline — confirm completed HOY action is still visible

---

## 7. Performance checks

```sql
-- Index usage on personal queue filter (should use idx_interventions_assigned_user)
EXPLAIN ANALYZE
SELECT * FROM interventions
WHERE school_id = '{school_id}'
AND assigned_to_user_id = '{user_id}'
AND status NOT IN ('completed', 'cancelled', 'closed');
```

Expected: index scan, not sequential scan.

---

## 8. Smoke tests

```bash
# Verify all routes load without JS errors:
# / (landing)
# /dashboard
# /signals  
# /students
# /students/:id
# /interventions
# /school-intelligence
# /staff-development
# /upload
```

Check browser console for errors. All pages must load without "Cannot read property of undefined" or 404 errors.

---

## Rollback instructions

If any migration causes issues, revert in reverse order:

```bash
# Revert 20260720010000 (reward_findings, staff_baselines tables)
psql "$DATABASE_URL" -c "DROP TABLE IF EXISTS reward_findings; DROP TABLE IF EXISTS staff_baselines; ALTER TABLE analysis_results DROP COLUMN IF EXISTS context_generated_at;"

# Revert 20260720000000 (personal workload columns, RPCs)
psql "$DATABASE_URL" -c "
  ALTER TABLE interventions
    DROP COLUMN IF EXISTS review_owner_id,
    DROP COLUMN IF EXISTS escalation_owner_id,
    DROP COLUMN IF EXISTS evidence_hash,
    DROP COLUMN IF EXISTS signal_version,
    DROP COLUMN IF EXISTS completed_by_user_id,
    DROP COLUMN IF EXISTS acknowledged_at,
    DROP COLUMN IF EXISTS notification_dismissed;
  DROP FUNCTION IF EXISTS get_personal_queue(UUID);
  DROP FUNCTION IF EXISTS get_my_briefing(UUID);
  DROP FUNCTION IF EXISTS complete_my_action(UUID, TEXT, TEXT);
  DROP FUNCTION IF EXISTS should_create_action(UUID, UUID, TEXT, TEXT);
  DROP FUNCTION IF EXISTS get_my_workload_counts(UUID);
"

# Revert 20260719110000 (structured fields)
# See migration file header for full column list — use ALTER TABLE...DROP COLUMN IF EXISTS

# Revert 20260719100000 (RLS overhaul)
# Restore original policies from backup or re-run the previous RLS migration
# Drop: safeguarding_notes, staff_student_scope tables
# Drop: enforce_profile_update_rules trigger
# Drop: get_safeguarding_notes, get_safeguarding_records RPCs
```

To restore original code files:
- `supabase/functions/run-analysis/index.ts` — restore from `/home/claude/recon/originals/run_analysis_original.ts`
- `src/lib/signalEngine.ts` — restore from `/home/claude/recon/originals/signalEngine_original.ts`
- `src/lib/intelligence.ts` — restore from `/home/claude/recon/originals/intelligence_original.ts`
- Remove `supabase/functions/_shared/routing.ts`, `context.ts`, `hypothesis.ts`, `canonical.ts`
- Restore `src/pages/UploadCsv.tsx` from original (remove rejectedRows panel)
- Restore `src/pages/SignalQueue.tsx` filtering to name-string matching (revert personal_workload changes)

---

## READY FOR BOLT: NO

**STAGING CANDIDATE ONLY.**

This package is complete at the static-audit layer:
- 65/65 tests pass
- `tsc -p tsconfig.shared.json` exits 0
- All migrations authored and verified statically
- Integration paths traced to exact file:function:RPC:column

It is NOT production ready until:
1. `npm run build` passes in a connected environment
2. All 3 migration files deploy successfully to staging Supabase
3. RLS runtime checks (Section 4) return correct row counts for each role
4. `get_personal_queue` returns correct results for each user in a live session
5. The 13-step end-to-end journey (Section 6) completes in the browser
