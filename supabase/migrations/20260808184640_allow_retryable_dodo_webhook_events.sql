CREATE OR REPLACE FUNCTION public.admin_apply_dodo_subscription_event(
  p_webhook_id text,
  p_event_type text,
  p_event_timestamp timestamptz,
  p_user_uuid uuid,
  p_subscription_id text,
  p_customer_id text,
  p_product_id text,
  p_plan text,
  p_status text,
  p_cancel_at_next_billing_date boolean,
  p_next_billing_date timestamptz,
  p_recurring_amount integer,
  p_currency text,
  p_billing_reference uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  existing_owner uuid;
  claimed_event_id text;
  grace_expires_at timestamptz;
  access_expires_at timestamptz;
  profile_result jsonb;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Unauthorized: Only service_role can apply Dodo events';
  END IF;

  IF p_plan NOT IN ('WEEKLY', 'MONTHLY')
     OR p_status NOT IN ('pending', 'active', 'on_hold', 'paused', 'cancelled', 'failed', 'expired') THEN
    RAISE EXCEPTION 'Invalid Dodo subscription state';
  END IF;

  IF p_status = 'active' AND p_next_billing_date IS NULL THEN
    RAISE EXCEPTION 'Active Dodo subscription requires an access expiry';
  END IF;

  INSERT INTO public.dodo_webhook_events (
    webhook_id, event_type, dodo_subscription_id, processing_status,
    safe_error_code, safe_error_message, event_timestamp, processed_at
  ) VALUES (
    p_webhook_id, p_event_type, p_subscription_id, 'processed',
    NULL, NULL, p_event_timestamp, now()
  )
  ON CONFLICT (webhook_id) DO UPDATE
  SET event_type = EXCLUDED.event_type,
      dodo_subscription_id = EXCLUDED.dodo_subscription_id,
      processing_status = 'processed',
      safe_error_code = NULL,
      safe_error_message = NULL,
      event_timestamp = EXCLUDED.event_timestamp,
      processed_at = now()
  WHERE public.dodo_webhook_events.processing_status <> 'processed'
  RETURNING webhook_id INTO claimed_event_id;

  IF claimed_event_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('duplicate', true);
  END IF;

  SELECT user_id INTO existing_owner
  FROM public.dodo_subscriptions
  WHERE dodo_subscription_id = p_subscription_id;

  IF existing_owner IS NOT NULL AND existing_owner <> p_user_uuid THEN
    RAISE EXCEPTION 'Dodo subscription is already linked to another account';
  END IF;

  grace_expires_at := CASE
    WHEN p_status = 'on_hold' THEN p_event_timestamp + interval '48 hours'
    ELSE NULL
  END;

  access_expires_at := CASE
    WHEN p_status = 'active' THEN p_next_billing_date
    WHEN p_status = 'on_hold' THEN COALESCE(p_next_billing_date, grace_expires_at)
    ELSE p_event_timestamp
  END;

  INSERT INTO public.dodo_subscriptions (
    user_id, dodo_customer_id, dodo_subscription_id, billing_reference, product_id, plan,
    status, currency, recurring_amount, cancel_at_next_billing_date, next_billing_date,
    access_expires_at, on_hold_grace_expires_at, provider_updated_at
  ) VALUES (
    p_user_uuid, p_customer_id, p_subscription_id, p_billing_reference, p_product_id, p_plan,
    p_status, upper(p_currency), p_recurring_amount, COALESCE(p_cancel_at_next_billing_date, false),
    p_next_billing_date, access_expires_at, grace_expires_at, p_event_timestamp
  )
  ON CONFLICT (dodo_subscription_id) DO UPDATE
  SET dodo_customer_id = EXCLUDED.dodo_customer_id,
      product_id = EXCLUDED.product_id,
      plan = EXCLUDED.plan,
      status = EXCLUDED.status,
      currency = EXCLUDED.currency,
      recurring_amount = EXCLUDED.recurring_amount,
      cancel_at_next_billing_date = EXCLUDED.cancel_at_next_billing_date,
      next_billing_date = EXCLUDED.next_billing_date,
      access_expires_at = EXCLUDED.access_expires_at,
      on_hold_grace_expires_at = EXCLUDED.on_hold_grace_expires_at,
      billing_reference = COALESCE(EXCLUDED.billing_reference, public.dodo_subscriptions.billing_reference),
      provider_updated_at = EXCLUDED.provider_updated_at,
      updated_at = now()
  WHERE EXCLUDED.provider_updated_at >= public.dodo_subscriptions.provider_updated_at;

  IF p_billing_reference IS NOT NULL THEN
    UPDATE public.dodo_checkout_sessions
    SET status = CASE WHEN p_status IN ('active', 'on_hold') THEN 'completed' ELSE status END,
        updated_at = now()
    WHERE billing_reference = p_billing_reference
      AND user_id = p_user_uuid;
  END IF;

  profile_result := public.admin_recompute_premium(p_user_uuid);
  RETURN pg_catalog.jsonb_build_object('duplicate', false, 'profile', profile_result);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_apply_dodo_subscription_event(
  text, text, timestamptz, uuid, text, text, text, text, text,
  boolean, timestamptz, integer, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_apply_dodo_subscription_event(
  text, text, timestamptz, uuid, text, text, text, text, text,
  boolean, timestamptz, integer, text, uuid
) TO service_role;
