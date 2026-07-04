BEGIN;

SELECT set_config('app.bypass_profile_trigger', 'true', true);

UPDATE public.premium_subscriptions
SET is_active = false,
    updated_at = now()
WHERE is_active = true
  AND expires_at IS NOT NULL
  AND expires_at <= now();

UPDATE public.profiles
SET is_premium = false,
    premium_source = 'expired',
    premium_expires_at = null,
    premium_verified_at = null
WHERE is_premium = true
  AND premium_expires_at IS NOT NULL
  AND premium_expires_at <= now();

COMMIT;
