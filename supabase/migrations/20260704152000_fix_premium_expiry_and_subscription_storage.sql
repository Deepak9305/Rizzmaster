DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'enforce_safe_profile_insert_defaults'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    EXECUTE 'ALTER FUNCTION public.enforce_safe_profile_insert_defaults() SET search_path = public';
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.purchase_receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  platform text NOT NULL,
  product_id text NOT NULL,
  base_plan_id text,
  transaction_id text,
  purchase_token text,
  status text DEFAULT 'verified',
  raw_payload jsonb DEFAULT '{}'::jsonb,
  verified_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.purchase_receipts ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_purchase_receipts_user_id
  ON public.purchase_receipts (user_id);

CREATE UNIQUE INDEX IF NOT EXISTS unique_transaction_id
  ON public.purchase_receipts (platform, transaction_id)
  WHERE transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS unique_purchase_token
  ON public.purchase_receipts (platform, purchase_token)
  WHERE purchase_token IS NOT NULL;

ALTER TABLE public.premium_subscriptions
  ADD COLUMN IF NOT EXISTS base_plan_id text,
  ADD COLUMN IF NOT EXISTS purchase_token_identifier text,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS raw_payload jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

UPDATE public.premium_subscriptions
SET created_at = COALESCE(created_at, purchase_date, now()),
    updated_at = COALESCE(updated_at, purchase_date, now()),
    raw_payload = COALESCE(raw_payload, '{}'::jsonb);

UPDATE public.premium_subscriptions ps
SET expires_at = COALESCE(ps.expires_at, p.premium_expires_at),
    updated_at = now()
FROM public.profiles p
WHERE p.id = ps.user_id;

UPDATE public.premium_subscriptions ps
SET base_plan_id = COALESCE(
      ps.base_plan_id,
      (
        SELECT pr.base_plan_id
        FROM public.purchase_receipts pr
        WHERE pr.user_id = ps.user_id
          AND (
            (ps.transaction_id IS NOT NULL AND pr.transaction_id = ps.transaction_id)
            OR pr.product_id = ps.product_id
          )
        ORDER BY pr.verified_at DESC NULLS LAST, pr.created_at DESC NULLS LAST
        LIMIT 1
      )
    ),
    purchase_token_identifier = COALESCE(
      ps.purchase_token_identifier,
      (
        SELECT pr.purchase_token
        FROM public.purchase_receipts pr
        WHERE pr.user_id = ps.user_id
          AND (
            (ps.transaction_id IS NOT NULL AND pr.transaction_id = ps.transaction_id)
            OR pr.product_id = ps.product_id
          )
        ORDER BY pr.verified_at DESC NULLS LAST, pr.created_at DESC NULLS LAST
        LIMIT 1
      )
    ),
    raw_payload = CASE
      WHEN ps.raw_payload IS NULL OR ps.raw_payload = '{}'::jsonb THEN COALESCE(
        (
          SELECT pr.raw_payload
          FROM public.purchase_receipts pr
          WHERE pr.user_id = ps.user_id
            AND (
              (ps.transaction_id IS NOT NULL AND pr.transaction_id = ps.transaction_id)
              OR pr.product_id = ps.product_id
            )
          ORDER BY pr.verified_at DESC NULLS LAST, pr.created_at DESC NULLS LAST
          LIMIT 1
        ),
        '{}'::jsonb
      )
      ELSE ps.raw_payload
    END,
    updated_at = now();

INSERT INTO public.premium_subscriptions (
  user_id,
  platform,
  product_id,
  base_plan_id,
  transaction_id,
  purchase_token_identifier,
  purchase_date,
  is_active,
  expires_at,
  raw_payload,
  created_at,
  updated_at
)
SELECT
  p.id,
  COALESCE(p.premium_platform, pr.platform, 'android'),
  COALESCE(p.premium_product_id, pr.product_id, 'premium'),
  COALESCE(p.premium_base_plan_id, pr.base_plan_id),
  COALESCE(p.premium_transaction_id, pr.transaction_id),
  pr.purchase_token,
  COALESCE(pr.verified_at, now()),
  COALESCE(p.is_premium, false),
  p.premium_expires_at,
  COALESCE(pr.raw_payload, '{}'::jsonb),
  COALESCE(pr.created_at, now()),
  now()
FROM public.profiles p
LEFT JOIN LATERAL (
  SELECT
    pr.user_id,
    pr.platform,
    pr.product_id,
    pr.base_plan_id,
    pr.transaction_id,
    pr.purchase_token,
    pr.raw_payload,
    pr.verified_at,
    pr.created_at
  FROM public.purchase_receipts pr
  WHERE pr.user_id = p.id
  ORDER BY pr.verified_at DESC NULLS LAST, pr.created_at DESC NULLS LAST
  LIMIT 1
) pr ON TRUE
WHERE NOT EXISTS (
  SELECT 1
  FROM public.premium_subscriptions ps
  WHERE ps.user_id = p.id
)
AND (
  p.is_premium = TRUE
  OR p.premium_product_id IS NOT NULL
  OR pr.user_id IS NOT NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.purchase_receipts TO service_role;
REVOKE ALL ON TABLE public.purchase_receipts FROM anon, authenticated, PUBLIC;
REVOKE ALL ON TABLE public.premium_subscriptions FROM anon, authenticated, PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.premium_subscriptions TO service_role;

DROP POLICY IF EXISTS "Users can view own receipts" ON public.purchase_receipts;
DROP POLICY IF EXISTS "Users can view own subscription" ON public.premium_subscriptions;

DROP FUNCTION IF EXISTS public.admin_set_premium(uuid, text, text, text, text, text, timestamptz, jsonb);

CREATE OR REPLACE FUNCTION public.admin_set_premium(
  p_user_uuid uuid,
  p_platform_name text,
  p_product_identifier text,
  p_transaction_identifier text,
  p_base_plan_identifier text DEFAULT NULL,
  p_purchase_token_identifier text DEFAULT NULL,
  p_expires_at timestamptz DEFAULT NULL,
  p_raw_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  updated_profile record;
  existing_owner uuid;
  inserted_owner uuid;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can set premium';
  END IF;

  PERFORM set_config('app.bypass_profile_trigger', 'true', true);

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_user_uuid) THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  INSERT INTO public.purchase_receipts (
    user_id, platform, product_id, base_plan_id, transaction_id, purchase_token, raw_payload, status
  )
  VALUES (
    p_user_uuid, p_platform_name, p_product_identifier, p_base_plan_identifier, p_transaction_identifier, p_purchase_token_identifier, p_raw_payload, 'verified'
  )
  ON CONFLICT DO NOTHING
  RETURNING user_id INTO inserted_owner;

  IF inserted_owner IS NULL THEN
    SELECT pr.user_id
    INTO existing_owner
    FROM public.purchase_receipts pr
    WHERE pr.platform = p_platform_name
      AND (
        (
          p_purchase_token_identifier IS NOT NULL
          AND pr.purchase_token = p_purchase_token_identifier
        )
        OR (
          p_transaction_identifier IS NOT NULL
          AND pr.transaction_id = p_transaction_identifier
        )
      )
    LIMIT 1;

    IF existing_owner IS NULL THEN
      RAISE EXCEPTION 'Purchase receipt conflict could not be resolved';
    END IF;

    IF existing_owner <> p_user_uuid THEN
      RAISE EXCEPTION 'This purchase is already linked to another account';
    END IF;
  END IF;

  UPDATE public.profiles
  SET is_premium = true,
      premium_source = 'native',
      premium_platform = p_platform_name,
      premium_product_id = p_product_identifier,
      premium_base_plan_id = p_base_plan_identifier,
      premium_transaction_id = p_transaction_identifier,
      premium_expires_at = p_expires_at,
      premium_verified_at = now()
  WHERE id = p_user_uuid;

  UPDATE public.premium_subscriptions
  SET platform = p_platform_name,
      product_id = p_product_identifier,
      base_plan_id = p_base_plan_identifier,
      transaction_id = p_transaction_identifier,
      purchase_token_identifier = p_purchase_token_identifier,
      is_active = true,
      purchase_date = now(),
      expires_at = p_expires_at,
      raw_payload = COALESCE(p_raw_payload, '{}'::jsonb),
      updated_at = now()
  WHERE user_id = p_user_uuid;

  IF NOT FOUND THEN
    INSERT INTO public.premium_subscriptions (
      user_id,
      platform,
      product_id,
      base_plan_id,
      transaction_id,
      purchase_token_identifier,
      is_active,
      purchase_date,
      expires_at,
      raw_payload,
      created_at,
      updated_at
    )
    VALUES (
      p_user_uuid,
      p_platform_name,
      p_product_identifier,
      p_base_plan_identifier,
      p_transaction_identifier,
      p_purchase_token_identifier,
      true,
      now(),
      p_expires_at,
      COALESCE(p_raw_payload, '{}'::jsonb),
      now(),
      now()
    );
  END IF;

  SELECT *
  INTO updated_profile
  FROM public.profiles
  WHERE id = p_user_uuid;

  RETURN to_jsonb(updated_profile);
END;
$$;
