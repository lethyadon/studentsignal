/*
# Add bulletins table for school-wide broadcast messages

## Purpose
Staff with admin, slt, or dsl roles can push school-wide alerts/reminders that
appear as coloured banners at the top of every page for all staff in the school.

## New Tables
- `bulletins`
  - `id` (uuid, primary key)
  - `school_id` (uuid, FK to schools, cascade delete)
  - `message` (text, the broadcast content)
  - `severity` (text, one of: 'info' | 'warning' | 'urgent')
  - `created_by` (text, staff display name e.g. 'Mr Ahmed (DSL)')
  - `created_at` (timestamptz, auto)

## Security
- RLS enabled
- SELECT: any authenticated user in the same school can read bulletins
- INSERT: only authenticated users whose profile role is admin/slt/dsl
- DELETE: only authenticated users whose profile role is admin/slt/dsl
- No UPDATE policy — bulletins are immutable; delete and re-create to edit

## Notes
1. Role enforcement is done via a subquery on the profiles table, not JWT claims.
2. No UPDATE policy intentionally — bulletins should be dismissed/re-created.
3. The school_id FK ensures bulletins are automatically removed if the school record is deleted.
*/

CREATE TABLE IF NOT EXISTS bulletins (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id  uuid        NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  message    text        NOT NULL,
  severity   text        NOT NULL DEFAULT 'info'
               CHECK (severity IN ('info', 'warning', 'urgent')),
  created_by text        NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bulletins_school_id_idx ON bulletins (school_id);

ALTER TABLE bulletins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_school_bulletins" ON bulletins;
CREATE POLICY "select_school_bulletins" ON bulletins FOR SELECT
TO authenticated
USING (
  school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
);

DROP POLICY IF EXISTS "insert_school_bulletins" ON bulletins;
CREATE POLICY "insert_school_bulletins" ON bulletins FOR INSERT
TO authenticated
WITH CHECK (
  school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'slt', 'dsl')
);

DROP POLICY IF EXISTS "delete_school_bulletins" ON bulletins;
CREATE POLICY "delete_school_bulletins" ON bulletins FOR DELETE
TO authenticated
USING (
  school_id = (SELECT school_id FROM profiles WHERE id = auth.uid())
  AND (SELECT role FROM profiles WHERE id = auth.uid()) IN ('admin', 'slt', 'dsl')
);

