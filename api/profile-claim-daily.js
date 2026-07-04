import { applyCors } from './_cors.js';
import { createRequestSupabaseClient, getAuthenticatedUser, getBearerToken, supabase } from './_supabase.js';

const LOGIN_REQUIRED_CODE = 'LOGIN_REQUIRED';
const SUPABASE_BACKEND_UNAVAILABLE_CODE = 'SUPABASE_BACKEND_UNAVAILABLE';

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  if (!supabase) {
    return json(res, 503, {
      error: 'Supabase integration not configured on the server.',
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
    });
  }

  const token = getBearerToken(req);
  if (!token) {
    return json(res, 401, {
      error: 'Missing or invalid authorization header.',
      code: LOGIN_REQUIRED_CODE,
    });
  }

  const { user, error } = await getAuthenticatedUser(token);
  if (error || !user) {
    return json(res, 401, {
      error: 'Unauthorized. Invalid or expired session.',
      code: LOGIN_REQUIRED_CODE,
    });
  }

  const requestClient = createRequestSupabaseClient(token);
  if (!requestClient) {
    return json(res, 503, {
      error: 'Supabase integration not configured on the server.',
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
    });
  }

  const { data, error: rpcError } = await requestClient.rpc('claim_daily_credits_and_streak');
  if (rpcError) {
    console.error('[Profile Claim API] Request failed:', rpcError);
    return json(res, 500, { error: rpcError.message || 'Daily claim failed.' });
  }

  return json(res, 200, data || { userId: user.id, updated: false });
}
