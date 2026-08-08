ALTER TABLE public.dodo_checkout_sessions
  ADD COLUMN IF NOT EXISTS checkout_url text;

WITH ranked_open_sessions AS (
  SELECT id,
         row_number() OVER (
           PARTITION BY user_id
           ORDER BY updated_at DESC, created_at DESC, id DESC
         ) AS row_number
  FROM public.dodo_checkout_sessions
  WHERE status IN ('created', 'redirected')
)
UPDATE public.dodo_checkout_sessions AS sessions
SET status = 'expired',
    checkout_url = NULL,
    updated_at = now()
FROM ranked_open_sessions AS ranked
WHERE sessions.id = ranked.id
  AND ranked.row_number > 1;

CREATE UNIQUE INDEX IF NOT EXISTS dodo_checkout_sessions_one_open_per_user_idx
  ON public.dodo_checkout_sessions (user_id)
  WHERE status IN ('created', 'redirected');

CREATE OR REPLACE FUNCTION public.clear_terminal_dodo_checkout_url()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF NEW.status IN ('completed', 'expired', 'failed') THEN
    NEW.checkout_url := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_terminal_dodo_checkout_url_trigger
  ON public.dodo_checkout_sessions;
CREATE TRIGGER clear_terminal_dodo_checkout_url_trigger
BEFORE INSERT OR UPDATE OF status ON public.dodo_checkout_sessions
FOR EACH ROW
EXECUTE FUNCTION public.clear_terminal_dodo_checkout_url();

REVOKE ALL ON FUNCTION public.clear_terminal_dodo_checkout_url() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_terminal_dodo_checkout_url() TO service_role;
