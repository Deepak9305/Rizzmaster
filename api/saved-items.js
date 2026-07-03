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

  if (!['GET', 'POST', 'DELETE'].includes(req.method)) {
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

  try {
    if (req.method === 'GET') {
      const ascending = req.query?.ascending === 'true';
      const { data, error: listError } = await requestClient
        .from('saved_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending });

      if (listError) {
        throw listError;
      }

      return json(res, 200, { items: data || [] });
    }

    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
      const payload = {
        user_id: user.id,
        content: readString(body.content),
        type: readString(body.type),
      };

      const { data, error: insertError } = await requestClient
        .from('saved_items')
        .insert(payload)
        .select('*')
        .single();

      if (insertError) {
        throw insertError;
      }

      return json(res, 200, { item: data });
    }

    const itemId = readString(req.query?.id);
    if (!itemId) {
      return json(res, 400, { error: 'Saved item id is required.' });
    }

    const { error: deleteError } = await requestClient
      .from('saved_items')
      .delete()
      .eq('id', itemId);

    if (deleteError) {
      throw deleteError;
    }

    return json(res, 200, { success: true });
  } catch (error) {
    console.error('[Saved Items API] Request failed:', error);
    return json(res, 500, { error: 'Saved item request failed.' });
  }
}
