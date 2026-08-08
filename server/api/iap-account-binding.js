import { getIapAccountBinding, PurchaseVerificationError } from './_iap.js';
import { supabase } from './_supabase.js';
import { applyCors } from './_cors.js';

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
};

const getBearerToken = (req) => {
  const value = req.headers.authorization;
  if (!value || !value.startsWith('Bearer ')) return null;
  const token = value.slice('Bearer '.length).trim();
  return token || null;
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== 'POST') {
    return json(res, 405, { error: 'Method not allowed.' });
  }

  const token = getBearerToken(req);
  if (!token) {
    return json(res, 401, { error: 'Missing or invalid authorization header.', code: 'LOGIN_REQUIRED' });
  }

  if (!supabase) {
    return json(res, 503, { error: 'Supabase integration is not configured on the server.', code: 'SUPABASE_BACKEND_UNAVAILABLE' });
  }

  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return json(res, 401, { error: 'Unauthorized. Invalid or expired session.', code: 'LOGIN_REQUIRED' });
    }

    return json(res, 200, { accountBinding: getIapAccountBinding(data.user.id) });
  } catch (error) {
    if (error instanceof PurchaseVerificationError) {
      return json(res, error.statusCode, { error: error.message, code: error.code });
    }

    console.error('[IAP Account Binding] Failed to create account binding.', error instanceof Error ? error.message : error);
    return json(res, 503, { error: 'Could not prepare purchase account binding.', code: 'IAP_ACCOUNT_BINDING_UNAVAILABLE' });
  }
}
