import { applyCors } from './_cors.js';
import { getAuthenticatedUser, getBearerToken, supabase, supabaseAdmin } from './_supabase.js';

const LOGIN_REQUIRED_CODE = 'LOGIN_REQUIRED';
const SUPABASE_BACKEND_UNAVAILABLE_CODE = 'SUPABASE_BACKEND_UNAVAILABLE';

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
};

const readString = (value, fallback = '') => {
  if (typeof value === 'string') {
    return value.trim();
  }
  return fallback;
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  if (!supabase || !supabaseAdmin) {
    return json(res, 503, {
      error: 'Supabase integration not configured on the server.',
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
    });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const requestedUserId = body.user_id === null ? null : readString(body.user_id, null);

  let authUserId = null;
  if (requestedUserId !== null) {
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

    authUserId = user.id;
  }

  const { error: insertError } = await supabaseAdmin
    .from('reports')
    .insert({
      user_id: authUserId,
      content: readString(body.content, 'General Report'),
      type: readString(body.type, 'content_report'),
    });

  if (insertError) {
    console.error('[Reports API] Request failed:', insertError);
    return json(res, 500, { error: 'Report request failed.' });
  }

  return json(res, 200, { success: true });
}
