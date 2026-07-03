import { applyCors } from './_cors.js';
import { createRequestSupabaseClient, getAuthenticatedUser, getBearerToken, supabase } from './_supabase.js';

const LOGIN_REQUIRED_CODE = 'LOGIN_REQUIRED';
const SUPABASE_BACKEND_UNAVAILABLE_CODE = 'SUPABASE_BACKEND_UNAVAILABLE';

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
};

const readString = (value) => (typeof value === 'string' ? value.trim() : '');

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

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const activeDate = readString(body.activeDate) || new Date().toISOString().slice(0, 10);

  const { error: upsertError } = await requestClient
    .from('user_activity_log')
    .upsert(
      [{ user_id: user.id, active_date: activeDate }],
      { onConflict: 'user_id,active_date', ignoreDuplicates: true }
    );

  if (upsertError) {
    console.error('[Activity API] Request failed:', upsertError);
    return json(res, 500, { error: 'Activity tracking failed.' });
  }

  return json(res, 200, { success: true });
}
