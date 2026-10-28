import { applyCors } from './_cors.js';
import { getAuthenticatedUser, getBearerToken, supabaseAdmin } from './_supabase.js';
import { isUuid, normalizeRequiredCredits } from './_rewarded-ad.js';

// Client-reported completion, deliberately without SSV. Authentication identifies
// the account; the database transaction provides eligibility and idempotency only.
export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  const send = (code, body) => { res.status(code); res.setHeader('Content-Type', 'application/json'); res.send(JSON.stringify(body)); };
  if (req.method !== 'POST') return send(405, { error: 'Method not allowed.' });
  const token = getBearerToken(req);
  if (!token) return send(401, { code: 'LOGIN_REQUIRED' });
  const auth = await getAuthenticatedUser(token);
  if (auth.error || !auth.user) return send(401, { code: 'LOGIN_REQUIRED' });
  const { claimId, requiredCredits } = req.body || {};
  if (!isUuid(claimId) || ![1, 2].includes(requiredCredits) || !normalizeRequiredCredits(requiredCredits)) return send(400, { code: 'INVALID_REWARD_CLAIM' });
  if (!supabaseAdmin) return send(503, { code: 'REWARD_CLAIM_UNAVAILABLE' });
  try {
    const { data, error } = await supabaseAdmin.rpc('admin_claim_client_reward', {
      p_user_id: auth.user.id, p_claim_id: claimId, p_required_cost: requiredCredits,
    });
    if (error || !data) throw error || new Error('No reward claim result');
    return send(200, data);
  } catch {
    return send(503, { code: 'REWARD_CLAIM_UNAVAILABLE' });
  }
}
