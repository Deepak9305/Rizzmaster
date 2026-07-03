import { applyCors } from './_cors.js';
import { getRequestAuth } from './_firebase.js';
import { createSavedItem, deleteSavedItem, listSavedItems } from './_profiles.js';
import { isDatabaseConfigured } from './_db.js';

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

  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
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
      error: 'Saved items require an authenticated account.',
      code: LOGIN_REQUIRED_CODE,
    });
  }

  try {
    if (req.method === 'GET') {
      const ascending = req.query?.ascending === 'true';
      const items = await listSavedItems(auth.user.id, { ascending });
      return json(res, 200, { items });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const item = await createSavedItem(auth.user.id, {
        content: readString(body.content),
        type: readString(body.type),
      });
      return json(res, 200, { item });
    }

    const itemId = readString(req.query?.id);
    if (!itemId) {
      return json(res, 400, { error: 'Saved item id is required.' });
    }

    await deleteSavedItem(auth.user.id, itemId);
    return json(res, 200, { success: true });
  } catch (error) {
    console.error('[Saved Items API] Request failed:', error);
    return json(res, 500, { error: 'Saved item request failed.' });
  }
}
