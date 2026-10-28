-- Client-reported earned rewards. This is intentionally NOT SSV verification.
CREATE TABLE public.client_reward_claims (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_id uuid NOT NULL,
  required_cost integer NOT NULL CHECK (required_cost IN (1, 2)),
  status text NOT NULL CHECK (status IN ('granted', 'rejected')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, claim_id)
);
ALTER TABLE public.client_reward_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.client_reward_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.client_reward_claims TO service_role;

CREATE FUNCTION public.admin_claim_client_reward(p_user_id uuid, p_claim_id uuid, p_required_cost integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  profile public.profiles%ROWTYPE;
  existing public.client_reward_claims%ROWTYPE;
  rejection text;
BEGIN
  IF COALESCE(auth.jwt()->>'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Service role required';
  END IF;
  IF p_user_id IS NULL OR p_claim_id IS NULL OR p_required_cost IS NULL OR p_required_cost NOT IN (1,2) THEN
    RAISE EXCEPTION 'Invalid reward claim';
  END IF;
  -- Serialize all claims for this account, including duplicate and distinct IDs.
  SELECT * INTO profile FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profile not found'; END IF;
  SELECT * INTO existing FROM public.client_reward_claims WHERE user_id = p_user_id AND claim_id = p_claim_id;
  IF FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', existing.status, 'credits', COALESCE(profile.credits,0), 'reason', existing.reason, 'idempotent', true);
  END IF;
  IF profile.is_premium THEN rejection := 'PREMIUM_USER';
  ELSIF COALESCE(profile.credits,0) >= p_required_cost THEN rejection := 'CREDITS_AVAILABLE';
  END IF;
  INSERT INTO public.client_reward_claims(user_id, claim_id, required_cost, status, reason)
  VALUES (p_user_id, p_claim_id, p_required_cost, CASE WHEN rejection IS NULL THEN 'granted' ELSE 'rejected' END, rejection);
  IF rejection IS NULL THEN
    PERFORM pg_catalog.set_config('app.bypass_profile_trigger', 'true', true);
    UPDATE public.profiles SET credits = COALESCE(credits,0) + 5 WHERE id = p_user_id RETURNING * INTO profile;
  END IF;
  RETURN pg_catalog.jsonb_build_object('status', CASE WHEN rejection IS NULL THEN 'granted' ELSE 'rejected' END,
    'credits', COALESCE(profile.credits,0), 'reason', rejection, 'idempotent', false);
END;
$$;
REVOKE ALL ON FUNCTION public.admin_claim_client_reward(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_claim_client_reward(uuid, uuid, integer) TO service_role;
