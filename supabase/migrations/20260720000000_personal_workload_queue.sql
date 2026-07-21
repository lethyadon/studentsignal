-- ══════════════════════════════════════════════════════════════════════════════
-- StudentSignal: Personal Workload Semantics
-- Migration: 20260720000000_personal_workload_queue.sql
-- 
-- Implements per-user actionable queue so users see ONLY the pupils they have
-- a current, authorised, actionable responsibility for — not every pupil with
-- any global signal.
--
-- Key changes:
--   1. New columns on interventions: review_owner_id, escalation_owner_id,
--      evidence_hash, signal_version, completed_by_user_id
--   2. get_personal_queue() RPC — returns the user-specific actionable set
--   3. get_my_briefing() RPC — returns morning briefing sections
--   4. acknowledge_my_action() RPC — completes action + removes from personal queue
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Personal workload columns on interventions ─────────────────────────────

ALTER TABLE interventions
  -- Who should review this action (may differ from initial assignee post-escalation)
  ADD COLUMN IF NOT EXISTS review_owner_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Who owns this if escalated (escalation target user id)
  ADD COLUMN IF NOT EXISTS escalation_owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Hash of evidence that generated this action; unchanged evidence = no regen
  ADD COLUMN IF NOT EXISTS evidence_hash     TEXT,
  -- Monotonically increasing version from analysis_results; used to detect material change
  ADD COLUMN IF NOT EXISTS signal_version    INTEGER DEFAULT 0,
  -- Who completed this specific action (UUID, not just name)
  ADD COLUMN IF NOT EXISTS completed_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- When each responsible user last acknowledged this item
  ADD COLUMN IF NOT EXISTS acknowledged_at   TIMESTAMPTZ,
  -- Tracks whether the personal notification was dismissed for each owner
  ADD COLUMN IF NOT EXISTS notification_dismissed BOOLEAN DEFAULT FALSE;

-- Index for the personal queue query (critical for performance at scale)
CREATE INDEX IF NOT EXISTS idx_interventions_assigned_user  ON interventions(school_id, assigned_to_user_id, status) WHERE assigned_to_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interventions_review_owner   ON interventions(school_id, review_owner_id, status)   WHERE review_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interventions_escalation_own ON interventions(school_id, escalation_owner_id, status) WHERE escalation_owner_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_interventions_evidence_hash  ON interventions(school_id, student_id, evidence_hash);

-- ── 2. Personal queue RPC ─────────────────────────────────────────────────────
-- Returns ONLY pupils where the calling user has a current, open, actionable
-- responsibility. Visibility permission and actionable responsibility are
-- separate; this function returns only actionable items.

CREATE OR REPLACE FUNCTION get_personal_queue(p_school_id UUID)
RETURNS TABLE (
  student_id            UUID,
  student_name          TEXT,
  year_group            TEXT,
  form                  TEXT,
  risk_level            TEXT,
  signal_category       TEXT,
  risk_score            NUMERIC,
  signal_types          JSONB,
  signal_explanation    TEXT,
  -- The specific action making this pupil appear in the queue
  action_id             UUID,
  action_type           TEXT,
  action_status         TEXT,
  action_priority       TEXT,
  action_due_date       DATE,
  action_review_date    DATE,
  action_source         TEXT,
  -- Why this pupil appears for this user
  responsibility_reason TEXT,
  -- Total open actions for this pupil (across all users)
  global_open_action_count INTEGER,
  -- Whether this is only in the queue because of a review (not a new signal)
  is_review_only        BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id  UUID := auth.uid();
  v_role     TEXT := private.current_user_role();
BEGIN
  -- Safety: only return data for the correct school and authenticated user
  IF v_user_id IS NULL OR p_school_id != private.current_user_school_id() THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH
  -- All open actions for this school
  open_actions AS (
    SELECT
      i.id,
      i.student_id,
      i.action_type,
      i.status,
      i.priority,
      i.due_date::date,
      i.review_date::date,
      i.source,
      i.assigned_to_user_id,
      i.review_owner_id,
      i.escalation_owner_id,
      i.evidence_hash,
      i.signal_version,
      i.notification_dismissed
    FROM interventions i
    WHERE
      i.school_id = p_school_id
      AND i.status NOT IN ('completed', 'cancelled', 'closed')
  ),
  -- Actions where THIS user has a direct actionable responsibility
  my_actions AS (
    SELECT
      oa.*,
      CASE
        WHEN oa.escalation_owner_id = v_user_id           THEN 'escalation_owner'
        WHEN oa.review_owner_id     = v_user_id           THEN 'review_owner'
        WHEN oa.assigned_to_user_id = v_user_id           THEN 'action_owner'
        ELSE 'unknown'
      END AS responsibility_reason
    FROM open_actions oa
    WHERE
      oa.assigned_to_user_id   = v_user_id
      OR oa.review_owner_id    = v_user_id
      OR oa.escalation_owner_id = v_user_id
  ),
  -- Pupils appearing in the personal queue (deduplicated to most urgent action per pupil)
  my_pupils AS (
    SELECT DISTINCT ON (ma.student_id)
      ma.student_id,
      ma.id                  AS action_id,
      ma.action_type,
      ma.status              AS action_status,
      ma.priority            AS action_priority,
      ma.due_date            AS action_due_date,
      ma.review_date         AS action_review_date,
      ma.source              AS action_source,
      ma.responsibility_reason,
      ma.responsibility_reason = 'review_owner' AS is_review_only
    FROM my_actions ma
    ORDER BY
      ma.student_id,
      -- Most urgent action first per pupil
      CASE ma.priority
        WHEN 'urgent' THEN 1
        WHEN 'high'   THEN 2
        WHEN 'medium' THEN 3
        ELSE 4
      END,
      ma.due_date ASC NULLS LAST
  ),
  -- Global open action count per pupil (for context display)
  global_counts AS (
    SELECT student_id, COUNT(*)::INTEGER AS cnt
    FROM open_actions
    GROUP BY student_id
  )
  SELECT
    s.id                            AS student_id,
    s.name                          AS student_name,
    s.year_group,
    s.form,
    COALESCE(s.risk_level, 'green') AS risk_level,
    s.signal_category,
    ar.risk_score,
    ar.signal_types,
    ar.signal_explanation,
    mp.action_id,
    mp.action_type,
    mp.action_status,
    mp.action_priority,
    mp.action_due_date,
    mp.action_review_date,
    mp.action_source,
    mp.responsibility_reason,
    COALESCE(gc.cnt, 0)             AS global_open_action_count,
    mp.is_review_only
  FROM my_pupils mp
  JOIN students s      ON s.id = mp.student_id AND s.school_id = p_school_id
  LEFT JOIN analysis_results ar ON ar.student_id = mp.student_id AND ar.school_id = p_school_id
  LEFT JOIN global_counts gc ON gc.student_id = mp.student_id
  ORDER BY
    -- Urgent / overdue first
    CASE mp.action_priority
      WHEN 'urgent' THEN 1
      WHEN 'high'   THEN 2
      WHEN 'medium' THEN 3
      ELSE 4
    END,
    mp.action_due_date ASC NULLS LAST,
    s.name ASC;
END;
$$;

-- ── 3. Morning briefing RPC ───────────────────────────────────────────────────
-- Returns briefing sections in priority order for the logged-in user.
-- Section key: new_today | urgent_overdue | awaiting_action | awaiting_review |
--              changed_since_last | recently_completed

CREATE OR REPLACE FUNCTION get_my_briefing(p_school_id UUID)
RETURNS TABLE (
  section               TEXT,
  student_id            UUID,
  student_name          TEXT,
  year_group            TEXT,
  risk_level            TEXT,
  action_id             UUID,
  action_type           TEXT,
  action_priority       TEXT,
  action_due_date       DATE,
  responsibility_reason TEXT,
  signal_changed        BOOLEAN,
  completed_at          TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today   DATE := CURRENT_DATE;
BEGIN
  IF v_user_id IS NULL OR p_school_id != private.current_user_school_id() THEN
    RETURN;
  END IF;

  RETURN QUERY
  -- ── Active items ────────────────────────────────────────────────────────────
  SELECT
    CASE
      WHEN i.due_date::date < v_today AND i.status NOT IN ('completed','cancelled','closed')
        THEN 'urgent_overdue'
      WHEN i.created_at::date = v_today AND i.status = 'suggested'
        THEN 'new_today'
      WHEN i.status IN ('awaiting_review', 'review_due')
        THEN 'awaiting_review'
      ELSE 'awaiting_action'
    END                                AS section,
    s.id                               AS student_id,
    s.name                             AS student_name,
    s.year_group,
    COALESCE(s.risk_level, 'green')    AS risk_level,
    i.id                               AS action_id,
    i.action_type,
    i.priority::text                   AS action_priority,
    i.due_date::date                   AS action_due_date,
    CASE
      WHEN i.escalation_owner_id = v_user_id THEN 'escalation_owner'
      WHEN i.review_owner_id     = v_user_id THEN 'review_owner'
      ELSE 'action_owner'
    END                                AS responsibility_reason,
    FALSE                              AS signal_changed,
    NULL::TIMESTAMPTZ                  AS completed_at
  FROM interventions i
  JOIN students s ON s.id = i.student_id AND s.school_id = p_school_id
  WHERE
    i.school_id = p_school_id
    AND i.status NOT IN ('completed', 'cancelled', 'closed')
    AND (
      i.assigned_to_user_id    = v_user_id
      OR i.review_owner_id     = v_user_id
      OR i.escalation_owner_id = v_user_id
    )

  UNION ALL

  -- ── Recently completed (last 7 days, collapsed section) ────────────────────
  SELECT
    'recently_completed'               AS section,
    s.id                               AS student_id,
    s.name                             AS student_name,
    s.year_group,
    COALESCE(s.risk_level, 'green')    AS risk_level,
    i.id                               AS action_id,
    i.action_type,
    i.priority::text                   AS action_priority,
    i.due_date::date                   AS action_due_date,
    'action_owner'                     AS responsibility_reason,
    FALSE                              AS signal_changed,
    i.completed_at                     AS completed_at
  FROM interventions i
  JOIN students s ON s.id = i.student_id AND s.school_id = p_school_id
  WHERE
    i.school_id = p_school_id
    AND i.status = 'completed'
    AND i.completed_by_user_id = v_user_id
    AND i.completed_at >= NOW() - INTERVAL '7 days'

  ORDER BY
    CASE section
      WHEN 'urgent_overdue'   THEN 1
      WHEN 'new_today'        THEN 2
      WHEN 'awaiting_action'  THEN 3
      WHEN 'awaiting_review'  THEN 4
      WHEN 'recently_completed' THEN 5
      ELSE 6
    END,
    action_due_date ASC NULLS LAST,
    student_name ASC;
END;
$$;

-- ── 4. Complete action RPC ────────────────────────────────────────────────────
-- Marks the action as completed for the specific user. Does NOT touch other
-- users' actions. Returns the updated action.

CREATE OR REPLACE FUNCTION complete_my_action(
  p_action_id   UUID,
  p_outcome     TEXT DEFAULT NULL,
  p_outcome_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id   UUID := auth.uid();
  v_school_id UUID := private.current_user_school_id();
  v_action    interventions%ROWTYPE;
  result      JSONB;
BEGIN
  -- Fetch and lock the action
  SELECT * INTO v_action
  FROM interventions
  WHERE id = p_action_id
    AND school_id = v_school_id
    AND (
      assigned_to_user_id    = v_user_id
      OR review_owner_id     = v_user_id
      OR escalation_owner_id = v_user_id
    )
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Action not found or not authorised for this user';
  END IF;

  IF v_action.status IN ('completed', 'cancelled', 'closed') THEN
    RAISE EXCEPTION 'Action is already %', v_action.status;
  END IF;

  -- Mark completed
  UPDATE interventions SET
    status                = 'completed',
    completed_at          = NOW(),
    completed_by_user_id  = v_user_id,
    outcome               = COALESCE(p_outcome, outcome),
    outcome_notes         = COALESCE(p_outcome_notes, outcome_notes)
  WHERE id = p_action_id;

  -- Fetch the updated row as JSON
  SELECT row_to_json(i)::JSONB INTO result
  FROM interventions i
  WHERE i.id = p_action_id;

  RETURN result;
END;
$$;

-- ── 5. Reappearance guard ─────────────────────────────────────────────────────
-- Prevents unchanged-evidence reanalysis from recreating completed actions.
-- Called by the engine adapter before inserting a new auto action.

CREATE OR REPLACE FUNCTION should_create_action(
  p_school_id    UUID,
  p_student_id   UUID,
  p_action_type  TEXT,
  p_evidence_hash TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_existing_hash TEXT;
  v_status        TEXT;
BEGIN
  -- Check if an action of this type was recently completed with the same evidence
  SELECT evidence_hash, status INTO v_existing_hash, v_status
  FROM interventions
  WHERE
    school_id   = p_school_id
    AND student_id  = p_student_id
    AND action_type = p_action_type
  ORDER BY created_at DESC
  LIMIT 1;

  -- If the most recent action is completed with identical evidence, don't recreate
  IF v_status = 'completed' AND v_existing_hash = p_evidence_hash THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;

-- ── 6. Workload count function ────────────────────────────────────────────────
-- Efficient count-only query for notification badge / briefing count

CREATE OR REPLACE FUNCTION get_my_workload_counts(p_school_id UUID)
RETURNS TABLE (
  total_actionable    INTEGER,
  urgent_count        INTEGER,
  overdue_count       INTEGER,
  new_today_count     INTEGER,
  review_due_count    INTEGER
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, private
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_today   DATE := CURRENT_DATE;
BEGIN
  IF v_user_id IS NULL OR p_school_id != private.current_user_school_id() THEN
    RETURN QUERY SELECT 0, 0, 0, 0, 0;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER                                                              AS total_actionable,
    COUNT(*) FILTER (WHERE priority = 'urgent')::INTEGER                          AS urgent_count,
    COUNT(*) FILTER (WHERE due_date::date < v_today)::INTEGER                     AS overdue_count,
    COUNT(*) FILTER (WHERE created_at::date = v_today AND status = 'suggested')::INTEGER AS new_today_count,
    COUNT(*) FILTER (WHERE review_date::date <= v_today OR status = 'review_due')::INTEGER AS review_due_count
  FROM interventions
  WHERE
    school_id = p_school_id
    AND status NOT IN ('completed', 'cancelled', 'closed')
    AND (
      assigned_to_user_id    = v_user_id
      OR review_owner_id     = v_user_id
      OR escalation_owner_id = v_user_id
    );
END;
$$;

-- ── 7. Grant execute on RPCs ──────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION get_personal_queue(UUID)       TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_briefing(UUID)          TO authenticated;
GRANT EXECUTE ON FUNCTION complete_my_action(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION should_create_action(UUID, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_my_workload_counts(UUID)   TO authenticated;
