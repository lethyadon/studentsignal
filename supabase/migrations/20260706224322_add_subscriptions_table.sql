/*
  # Add subscriptions table for Student Signal billing

  ## Summary
  Creates a `subscriptions` table to track Stripe subscription state per user/school.
  This table is written by edge functions (service role, bypasses RLS) and read by
  the authenticated frontend client.

  ## New Table: `subscriptions`
  | Column                  | Type        | Notes |
  |------------------------|-------------|-------|
  | id                     | uuid PK     | auto-generated |
  | user_id                | uuid        | references auth.users, UNIQUE (one active sub per user) |
  | school_id              | uuid        | nullable, references schools |
  | stripe_customer_id     | text        | Stripe customer ID |
  | stripe_subscription_id | text        | Stripe subscription ID (null until checkout completes) |
  | plan_name              | text        | 'starter' or 'school' |
  | status                 | text        | pending, active, trialing, cancelled, unpaid, past_due, incomplete_expired |
  | current_period_end     | timestamptz | null until active |
  | created_at             | timestamptz | auto-set |

  ## Security
  - RLS enabled. 4 separate policies (SELECT/INSERT/UPDATE/DELETE) scoped to authenticated users.
  - Edge functions use service role key which bypasses RLS, so webhook writes work without policies.
  - Frontend reads use the authenticated session token — only the owner row is returned.

  ## Notes
  - UNIQUE(user_id) enforces one subscription record per user; upsert updates the existing row on resubscription.
  - The `stripe_customers` table (from existing Bolt Stripe template) maps user_id → Stripe customer_id.
*/

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  school_id uuid REFERENCES schools(id) ON DELETE SET NULL,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text,
  plan_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_subscription" ON subscriptions;
CREATE POLICY "select_own_subscription" ON subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_subscription" ON subscriptions;
CREATE POLICY "insert_own_subscription" ON subscriptions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_subscription" ON subscriptions;
CREATE POLICY "update_own_subscription" ON subscriptions
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_subscription" ON subscriptions;
CREATE POLICY "delete_own_subscription" ON subscriptions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

