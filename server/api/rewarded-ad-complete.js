import { applyCors } from './_cors.js';
import { getAuthenticatedUser, getBearerToken, supabaseAdmin } from './_supabase.js';
import {
  isUuid,
  REWARDED_AD_UNIT_ID,
  REWARDED_AMOUNT,
  REWARDED_ITEM,
} from './_rewarded-ad.js';

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  const token = getBearerToken(req);
  if (!token) return json(res, 401, { error: 'Missing or invalid authorization header.', code: 'LOGIN_REQUIRED' });
  const auth = await getAuthenticatedUser(token);
  if (auth.error || !auth.user) return json(res, 401, { error: 'Invalid or expired session.', code: 'LOGIN_REQUIRED' });
  if (!supabaseAdmin) return json(res, 503, { error: 'Rewarded credits are temporarily unavailable.', code: 'REWARDED_AD_BACKEND_UNAVAILABLE' });

  const attemptId = typeof req.body?.attemptId === 'string' ? req.body.attemptId.trim() : '';
  if (!isUuid(attemptId)) return json(res, 400, { error: 'Invalid rewarded ad attempt.', code: 'INVALID_REWARDED_AD_REQUEST' });

  try {
    const { data: attempt, error: attemptError } = await supabaseAdmin
      .from('rewarded_ad_attempts')
      .select('id,user_id,status,expires_at,created_at')
      .eq('id', attemptId)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) return json(res, 404, { error: 'Rewarded ad attempt was not found.', code: 'REWARDED_AD_ATTEMPT_NOT_FOUND' });

    if (attempt.status !== 'pending') {
      const { data: profile } = await supabaseAdmin.from('profiles').select('credits').eq('id', auth.user.id).single();
      return json(res, 200, { attemptId, status: attempt.status, credits: Number(profile?.credits || 0) });
    }

    const createdAt = new Date(attempt.created_at).getTime();
    if (!Number.isFinite(createdAt) || Date.now() - createdAt < 7000 || new Date(attempt.expires_at).getTime() <= Date.now()) {
      return json(res, 409, { error: 'Reward confirmation is not ready.', code: 'REWARDED_AD_CONFIRMATION_NOT_READY' });
    }

    const { data: result, error: grantError } = await supabaseAdmin.rpc('admin_grant_rewarded_ad', {
      p_attempt_id: attemptId,
      p_transaction_id: `native-reward:${attemptId}`,
      p_reward_amount: REWARDED_AMOUNT,
      p_reward_item: REWARDED_ITEM,
      p_ad_unit_id: REWARDED_AD_UNIT_ID,
      p_ssv_user_id: auth.user.id,
      p_verified_at: new Date().toISOString(),
    });
    if (grantError) throw grantError;

    console.info('[Rewarded Ad] Native completion fallback processed.', {
      userId: auth.user.id,
      attemptId,
      status: result?.status || null,
    });
    return json(res, 200, {
      attemptId,
      status: result?.status || 'rejected',
      credits: Number(result?.credits || 0),
    });
  } catch (error) {
    console.error('[Rewarded Ad] Native completion fallback failed.', {
      userId: auth.user.id,
      attemptId,
      code: error?.code || null,
      message: error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
    });
    return json(res, 503, { error: 'Rewarded credit confirmation is temporarily unavailable.', code: 'REWARDED_AD_BACKEND_UNAVAILABLE' });
  }
}
