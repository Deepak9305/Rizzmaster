REVOKE ALL ON FUNCTION public.admin_set_premium(uuid, text, text, text, text, text, timestamptz, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_set_premium(uuid, text, text, text, text, text, timestamptz, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.admin_set_premium(uuid, text, text, text, text, text, timestamptz, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_premium(uuid, text, text, text, text, text, timestamptz, jsonb) TO service_role;
