/*
# Add school verification fields

## What this does
Extends the `schools` table with fields to support institutional verification
of UK schools during the signup process.

## New columns on `schools`
- `urn` — DfE Unique Reference Number (every UK state school has one).
  Used to cross-reference the Get Information About Schools (GIAS) register.
- `dfe_number` — Optional DfE establishment number (LA code + 4-digit number).
- `domain_verified` — Set to `true` when the registering admin's email uses
  a `.sch.uk` or `.ac.uk` domain, which are JANET-allocated and school-specific.
- `verification_status` — Current verification state of the school record:
    'pending'         — registered, not yet verified
    'domain_verified' — email domain is .sch.uk / .ac.uk (strong signal)
    'urn_verified'    — URN confirmed against GIAS register
    'manual_review'   — submitted for manual review by Student Signal team
    'verified'        — fully verified by all methods
    'rejected'        — rejected (duplicate, fraudulent, or invalid)
- `contact_email` — Email address of the person who registered the school.
- `phase` — School phase: 'primary', 'secondary', 'all-through', 'special', 'other'.
  Populated from GIAS lookup if URN is provided.
- `la_name` — Local Authority name, populated from GIAS if URN is provided.
- `gias_name` — Official school name from GIAS, for cross-checking against user entry.

## Security
No new tables — these are additive columns on `schools`.
Existing RLS policies on `schools` continue to apply.
*/

ALTER TABLE schools
  ADD COLUMN IF NOT EXISTS urn text,
  ADD COLUMN IF NOT EXISTS dfe_number text,
  ADD COLUMN IF NOT EXISTS domain_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS phase text,
  ADD COLUMN IF NOT EXISTS la_name text,
  ADD COLUMN IF NOT EXISTS gias_name text;

-- Index for URN lookups (admins searching by URN, dedup checks)
CREATE INDEX IF NOT EXISTS schools_urn_idx ON schools (urn) WHERE urn IS NOT NULL;

-- Constraint: verification_status must be a known value
ALTER TABLE schools
  DROP CONSTRAINT IF EXISTS schools_verification_status_check;

ALTER TABLE schools
  ADD CONSTRAINT schools_verification_status_check
  CHECK (verification_status IN ('pending', 'domain_verified', 'urn_verified', 'manual_review', 'verified', 'rejected'));

