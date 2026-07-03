import { applyCors } from './_cors.js';
import { getRequestAuth } from './_firebase.js';
import { incrementTotalTimeSpent } from './_profiles.js';
import { isDatabaseConfigured } from './_db.js';

const LOGIN_REQUIRED_CODE = 'LOGIN_REQUIRED';
const SUPABASE_BACKEND_UNAVAILABLE_CODE = 'SUPABASE_BACKEND_UNAVAILABLE';

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
};

const parseBody = (body) => {
  if (typeof body === 'string') {
    return JSON.parse(body);
  }
  return body || {};
};

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
      error: 'Time tracking requires an authenticated account.',
      code: LOGIN_REQUIRED_CODE,
    });
  }

  try {
    const body = parseBody(req.body);
    const inputMs = Number(body.inputMs);
    const totalTimeSpentMs = await incrementTotalTimeSpent(auth.user.id, inputMs);
    return json(res, 200, { totalTimeSpentMs });
  } catch (error) {
    console.error('[Activity Time API] Request failed:', error);
    return json(res, 500, { error: error?.message || 'Time tracking failed.' });
  }
}
