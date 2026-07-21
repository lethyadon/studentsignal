-- quick_notes: staff observations, safeguarding flags, pastoral notes
CREATE TABLE IF NOT EXISTS public.quick_notes (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id      uuid        NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id     uuid        NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  category       text        NOT NULL DEFAULT 'general',  -- 'general', 'pastoral', 'send', 'Safeguarding concern'
  concern_level  integer     NOT NULL DEFAULT 1,           -- 1 low … 5 critical
  visibility     text        NOT NULL DEFAULT 'general',   -- 'general', 'pastoral', 'send', 'dsl_only', 'slt_only'
  note           text        NOT NULL,
  staff_member   text,
  date           text        NOT NULL DEFAULT (current_date::text),
  created_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT quick_notes_student_date_note_key
    UNIQUE (school_id, student_id, date, note)
);

ALTER TABLE public.quick_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "select_own_quick_notes" ON public.quick_notes FOR SELECT
  TO authenticated USING (school_id = private.current_user_school_id());

CREATE POLICY "insert_own_quick_notes" ON public.quick_notes FOR INSERT
  TO authenticated WITH CHECK (school_id = private.current_user_school_id());

CREATE POLICY "update_own_quick_notes" ON public.quick_notes FOR UPDATE
  TO authenticated
  USING (school_id = private.current_user_school_id())
  WITH CHECK (school_id = private.current_user_school_id());

CREATE POLICY "delete_own_quick_notes" ON public.quick_notes FOR DELETE
  TO authenticated USING (school_id = private.current_user_school_id());

-- service_role (Edge Functions) unrestricted insert
CREATE POLICY "service_insert_quick_notes" ON public.quick_notes FOR INSERT
  TO service_role WITH CHECK (true);

