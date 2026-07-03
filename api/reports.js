import { applyCors } from './_cors.js';
import { getRequestAuth } from './_firebase.js';
import { createReport } from './_profiles.js';
import { isDatabaseConfigured } from './_db.js';

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

  if (!isDatabaseConfigured) {
    return json(res, 503, {
      error: 'Database is not configured on the server.',
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
    });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const requestedUserId = body.user_id === null ? null : readString(body.user_id, null);

  let authUserId = null;
  if (requestedUserId !== null) {
    try {
      const auth = await getRequestAuth(req);
      if (!auth.user || auth.isGuest) {
        return json(res, 401, {
          error: 'Unauthorized. Invalid or expired session.',
          code: LOGIN_REQUIRED_CODE,
        });
      }
      authUserId = auth.user.id;
    } catch (error) {
      return json(res, 401, {
        error: 'Unauthorized. Invalid or expired session.',
        code: LOGIN_REQUIRED_CODE,
      });
    }
  }

  try {
    await createReport(
      authUserId,
      readString(body.content, 'General Report'),
      readString(body.type, 'content_report')
    );
    return json(res, 200, { success: true });
  } catch (error) {
    console.error('[Reports API] Request failed:', error);
    return json(res, 500, { error: 'Report request failed.' });
  }
}
