/*
# Fix interventions assigned_to column and add source tracking

## Purpose
The interventions.assigned_to column is currently uuid with an FK to auth.users,
but the app already inserts text staff names. This migration:
1. Drops the FK constraint
2. Changes assigned_to from uuid to text (allowing role-based assignment)
3. Makes assigned_to nullable (auto-generated actions may not have a specific assignee yet)
4. Adds assigned_role column for role-based routing
5. Adds source column to distinguish auto-generated vs manual actions

## Modified Tables

### interventions
- assigned_to: changed from uuid NOT NULL to text (nullable) — stores staff name or role
- assigned_role (new): text — the role this action is assigned to (e.g. 'head_of_year', 'dsl')
- source (new): text — either 'auto' or 'manual' to track how the action was created

## Important Notes
1. No data is lost — existing uuid values will be cast to text strings
2. The FK constraint is dropped since the column now stores names, not user IDs
3. Existing code already inserts text names, so this aligns schema with reality
*/

-- Drop the FK constraint
ALTER TABLE interventions DROP CONSTRAINT IF EXISTS interventions_assigned_to_fkey;

-- Change column type from uuid to text
ALTER TABLE interventions ALTER COLUMN assigned_to TYPE text USING assigned_to::text;

-- Make it nullable for auto-generated actions
ALTER TABLE interventions ALTER COLUMN assigned_to DROP NOT NULL;

-- Add new columns
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interventions' AND column_name = 'assigned_role') THEN
    ALTER TABLE interventions ADD COLUMN assigned_role text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'interventions' AND column_name = 'source') THEN
    ALTER TABLE interventions ADD COLUMN source text DEFAULT 'manual';
  END IF;
END $$;

