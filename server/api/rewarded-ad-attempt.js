import { randomUUID } from 'node:crypto';
import { applyCors } from './_cors.js';
import { getAuthenticatedUser, getBearerToken, supabaseAdmin } from './_supabase.js';
import {
  REWARDED_AD_UNIT_ID,
  REWARDED_AMOUNT,
  REWARDED_ATTEMPT_TTL_MS,
  REWARDED_ITEM,
  normalizeRequiredCredits,
} from './_rewarded-ad.js';

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
};

const authenticate = async (req) => {
  const token = getBearerToken(req);
  if (!token) return { user: null, error: 'Missing or invalid authorization header.' };
  const result = await getAuthenticatedUser(token);
  return { user: result.user, error: result.error ? 'Invalid or expired session.' : null };
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  const auth = await authenticate(req);
  if (!auth.user) return json(res, 401, { error: auth.error, code: 'LOGIN_REQUIRED' });
  if (!supabaseAdmin) return json(res, 503, { error: 'Rewarded credits are temporarily unavailable.', code: 'REWARDED_AD_BACKEND_UNAVAILABLE' });

  const requiredCredits = normalizeRequiredCredits(req.body?.requiredCredits);
  if (!requiredCredits) return json(res, 400, { error: 'Invalid rewarded ad request.', code: 'INVALID_REWARDED_AD_REQUEST' });

  try {
    const { data: recomputedProfile, error: recomputeError } = await supabaseAdmin.rpc('admin_recompute_premium', {
      p_user_uuid: auth.user.id,
    });
    if (recomputeError || !recomputedProfile) throw recomputeError || new Error('Premium state could not be checked.');

    if (recomputedProfile.is_premium === true) {
      return json(res, 409, { error: 'Premium users do not need rewarded credits.', code: 'REWARDED_AD_PREMIUM_USER' });
    }
    if (Number(recomputedProfile.credits || 0) >= requiredCredits) {
      return json(res, 409, { error: 'Rewarded credits are available only when generation is blocked.', code: 'REWARDED_AD_NOT_ELIGIBLE' });
    }

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('rewarded_ad_attempts')
      .select('id,expires_at,status,required_cost')
      .eq('user_id', auth.user.id)
      .eq('required_cost', requiredCredits)
      .eq('status', 'pending')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      return json(res, 200, {
        attemptId: existing.id,
        customData: existing.id,
        expiresAt: existing.expires_at,
      });
    }

    const expiresAt = new Date(Date.now() + REWARDED_ATTEMPT_TTL_MS).toISOString();
    const { data: created, error: createError } = await supabaseAdmin
      .from('rewarded_ad_attempts')
      .insert({
        id: randomUUID(),
        user_id: auth.user.id,
        required_cost: requiredCredits,
        reward_amount: REWARDED_AMOUNT,
        reward_item: REWARDED_ITEM,
        ad_unit_id: REWARDED_AD_UNIT_ID,
        status: 'pending',
        expires_at: expiresAt,
      })
      .select('id,expires_at')
      .single();
    if (createError || !created) throw createError || new Error('Rewarded ad attempt could not be created.');

    return json(res, 200, {
      attemptId: created.id,
      customData: created.id,
      expiresAt: created.expires_at,
    });
  } catch (error) {
    console.error('[Rewarded Ad] Attempt creation failed.', {
      userId: auth.user.id,
      code: error?.code || null,
      message: error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
    });
    return json(res, 503, { error: 'Rewarded credits are temporarily unavailable.', code: 'REWARDED_AD_BACKEND_UNAVAILABLE' });
  }
}
