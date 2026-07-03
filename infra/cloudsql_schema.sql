CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS profiles (
  id text PRIMARY KEY,
  legacy_user_id text UNIQUE,
  email text,
  credits integer NOT NULL DEFAULT 5,
  is_premium boolean NOT NULL DEFAULT false,
  last_daily_reset date NOT NULL DEFAULT current_date,
  shadow_notes text NOT NULL DEFAULT '',
  streak_count integer NOT NULL DEFAULT 1,
  last_streak_claim date,
  total_time_spent_ms bigint NOT NULL DEFAULT 0,
  premium_source text,
  premium_platform text,
  premium_product_id text,
  premium_base_plan_id text,
  premium_transaction_id text,
  premium_expires_at timestamptz,
  premium_verified_at timestamptz,
  migrated_to_firebase_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_lower
  ON profiles (lower(email))
  WHERE email IS NOT NULL;

CREATE TABLE IF NOT EXISTS saved_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
  content text NOT NULL,
  type text NOT NULL CHECK (type IN ('tease', 'smooth', 'chaotic', 'bio', 'system')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_saved_items_user_id
  ON saved_items (user_id);

CREATE TABLE IF NOT EXISTS premium_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
  platform text NOT NULL,
  product_id text NOT NULL,
  base_plan_id text,
  transaction_id text,
  purchase_token_identifier text,
  is_active boolean NOT NULL DEFAULT true,
  purchase_date timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, platform, product_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_premium_subscriptions_transaction_id
  ON premium_subscriptions (transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_premium_subscriptions_purchase_token
  ON premium_subscriptions (purchase_token_identifier)
  WHERE purchase_token_identifier IS NOT NULL;

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text REFERENCES profiles(id) ON DELETE SET NULL ON UPDATE CASCADE,
  content text NOT NULL,
  type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reports_user_id
  ON reports (user_id);

CREATE TABLE IF NOT EXISTS user_activity_log (
  user_id text NOT NULL REFERENCES profiles(id) ON DELETE CASCADE ON UPDATE CASCADE,
  active_date date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, active_date)
);
