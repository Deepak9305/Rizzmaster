import { applyCors } from './_cors.js';
import { supabaseAdmin } from './_supabase.js';
import {
  buildCanonicalSsvQuery,
  isUuid,
  isValidRewardPayload,
  toSafeIsoDate,
  verifyAdMobSsvSignature,
} from './_rewarded-ad.js';

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
};

const reject = (res, code) => json(res, 400, { error: 'Invalid rewarded ad callback.', code });

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });
  if (!supabaseAdmin) return json(res, 503, { error: 'Rewarded credits are temporarily unavailable.', code: 'REWARDED_AD_BACKEND_UNAVAILABLE' });

  const query = req.query || {};
  const attemptId = typeof query.custom_data === 'string' ? query.custom_data.trim() : '';
  const userId = typeof query.user_id === 'string' ? query.user_id.trim() : '';
  const transactionId = typeof query.transaction_id === 'string' ? query.transaction_id.trim() : '';
  const adUnit = typeof query.ad_unit === 'string' ? query.ad_unit.trim() : '';
  const rewardItem = typeof query.reward_item === 'string' ? query.reward_item.trim() : '';
  const rewardAmount = typeof query.reward_amount === 'string' ? query.reward_amount.trim() : '';
  const signature = typeof query.signature === 'string' ? query.signature : '';
  const keyId = typeof query.key_id === 'string' ? query.key_id : '';

  // AdMob's dashboard verification can call the endpoint without a live app
  // attempt or with placeholder callback fields. Acknowledge that probe, but
  // never grant credits unless custom_data identifies a real app attempt.
  if (!isUuid(attemptId)) {
    console.info('[AdMob SSV] Non-app verification callback acknowledged.', {
      code: 'SSV_VERIFICATION_ONLY',
    });
    return json(res, 200, { ok: true, status: 'verification_only' });
  }

  if (!transactionId) return reject(res, 'SSV_TRANSACTION_INVALID');
  if (!isValidRewardPayload({ adUnit, rewardItem, rewardAmount })) return reject(res, 'SSV_REWARD_MISMATCH');

  const verification = await verifyAdMobSsvSignature({
    canonicalQuery: buildCanonicalSsvQuery(req.rawQuery || ''),
    signature,
    keyId,
  });
  if (!verification.ok) {
    console.warn('[AdMob SSV] Signature verification rejected.', { code: verification.code });
    return reject(res, verification.code || 'SSV_SIGNATURE_INVALID');
  }

  try {
    const { data: attempt, error: attemptError } = await supabaseAdmin
      .from('rewarded_ad_attempts')
      .select('id,user_id')
      .eq('id', attemptId)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) {
      console.warn('[AdMob SSV] Verified callback did not match an app attempt.', {
        code: 'SSV_ATTEMPT_NOT_FOUND',
      });
      return json(res, 200, { ok: true, status: 'ignored' });
    }
    if (userId && userId !== attempt.user_id) {
      console.warn('[AdMob SSV] Verified callback user did not match the app attempt.', {
        code: 'SSV_USER_MISMATCH',
      });
      return json(res, 200, { ok: true, status: 'rejected', code: 'SSV_USER_MISMATCH' });
    }

    const { data: result, error: grantError } = await supabaseAdmin.rpc('admin_grant_rewarded_ad', {
      p_attempt_id: attemptId,
      p_transaction_id: transactionId,
      p_reward_amount: Number(rewardAmount),
      p_reward_item: rewardItem,
      p_ad_unit_id: adUnit,
      p_ssv_user_id: userId || null,
      p_verified_at: toSafeIsoDate(query.timestamp) || new Date().toISOString(),
    });
    if (grantError) throw grantError;

    if (result?.status === 'rejected' || result?.status === 'expired') {
      console.warn('[AdMob SSV] Reward was not granted.', {
        status: result.status,
        reason: result.reason || null,
      });
    }

    // AdMob retries callbacks when this endpoint does not return 2xx. The RPC
    // is idempotent, so acknowledge valid duplicate callbacks as well.
    return json(res, 200, { ok: true, status: result?.status || 'granted' });
  } catch (error) {
    console.error('[AdMob SSV] Reward grant failed.', {
      code: error?.code || null,
      message: error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
    });
    return json(res, 503, { error: 'Rewarded credit processing is temporarily unavailable.', code: 'REWARDED_AD_BACKEND_UNAVAILABLE' });
  }
}
