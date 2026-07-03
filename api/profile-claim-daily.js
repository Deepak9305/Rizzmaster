import { applyCors } from './_cors.js';
import { getRequestAuth } from './_firebase.js';
import { claimDailyCreditsAndStreak } from './_profiles.js';
import { isDatabaseConfigured } from './_db.js';

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
      error: 'Daily claim requires an authenticated account.',
      code: LOGIN_REQUIRED_CODE,
    });
  }

  try {
    const result = await claimDailyCreditsAndStreak(auth.user.id);
    return json(res, 200, result);
  } catch (error) {
    console.error('[Profile Claim API] Request failed:', error);
    return json(res, 500, { error: error?.message || 'Daily claim failed.' });
  }
}
