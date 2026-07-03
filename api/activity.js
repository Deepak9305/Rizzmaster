import { applyCors } from './_cors.js';
import { getRequestAuth } from './_firebase.js';
import { isDatabaseConfigured } from './_db.js';
import { recordUserActivity } from './_profiles.js';

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

  if (!isDatabaseConfigured) {
    return json(res, 503, {
      error: 'Database is not configured on the server.',
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
    });
  }

  let auth;
  try {
    auth = await getRequestAuth(req);
  } catch (error) {
    return json(res, 401, {
      error: 'Unauthorized. Invalid or expired session.',
      code: LOGIN_REQUIRED_CODE,
    });
  }

  if (!auth.user || auth.isGuest) {
    return json(res, 401, {
      error: 'Activity tracking requires an authenticated account.',
      code: LOGIN_REQUIRED_CODE,
    });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

  try {
    await recordUserActivity(auth.user.id, readString(body.activeDate) || undefined);
    return json(res, 200, { success: true });
  } catch (error) {
    console.error('[Activity API] Request failed:', error);
    return json(res, 500, { error: 'Activity tracking failed.' });
  }
}
