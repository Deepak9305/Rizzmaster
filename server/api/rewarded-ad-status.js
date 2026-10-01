import { applyCors } from './_cors.js';
import { getAuthenticatedUser, getBearerToken, supabaseAdmin } from './_supabase.js';
import { isUuid } from './_rewarded-ad.js';

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed.' });

  const token = getBearerToken(req);
  if (!token) return json(res, 401, { error: 'Missing or invalid authorization header.', code: 'LOGIN_REQUIRED' });
  const auth = await getAuthenticatedUser(token);
  if (auth.error || !auth.user) return json(res, 401, { error: 'Invalid or expired session.', code: 'LOGIN_REQUIRED' });
  if (!supabaseAdmin) return json(res, 503, { error: 'Rewarded credits are temporarily unavailable.', code: 'REWARDED_AD_BACKEND_UNAVAILABLE' });

  const attemptId = typeof req.query?.attemptId === 'string' ? req.query.attemptId.trim() : '';
  if (!isUuid(attemptId)) return json(res, 400, { error: 'Invalid rewarded ad attempt.', code: 'INVALID_REWARDED_AD_REQUEST' });

  try {
    const { data: attempt, error: attemptError } = await supabaseAdmin
      .from('rewarded_ad_attempts')
      .select('id,status,expires_at')
      .eq('id', attemptId)
      .eq('user_id', auth.user.id)
      .maybeSingle();
    if (attemptError) throw attemptError;
    if (!attempt) return json(res, 404, { error: 'Rewarded ad attempt was not found.', code: 'REWARDED_AD_ATTEMPT_NOT_FOUND' });

    let status = attempt.status;
    if (status === 'pending' && new Date(attempt.expires_at).getTime() <= Date.now()) {
      const { data: expired, error: expireError } = await supabaseAdmin
        .from('rewarded_ad_attempts')
        .update({ status: 'expired', updated_at: new Date().toISOString(), rejection_code: 'ATTEMPT_EXPIRED' })
        .eq('id', attempt.id)
        .eq('user_id', auth.user.id)
        .eq('status', 'pending')
        .select('status')
        .maybeSingle();
      if (expireError) throw expireError;
      status = expired?.status || 'expired';
    }

    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('credits')
      .eq('id', auth.user.id)
      .single();
    if (profileError) throw profileError;

    return json(res, 200, {
      attemptId: attempt.id,
      status,
      credits: Number(profile?.credits || 0),
      expiresAt: attempt.expires_at,
    });
  } catch (error) {
    console.error('[Rewarded Ad] Status lookup failed.', {
      userId: auth.user.id,
      attemptId,
      code: error?.code || null,
      message: error instanceof Error ? error.message.slice(0, 200) : 'unknown error',
    });
    return json(res, 503, { error: 'Rewarded credit status is temporarily unavailable.', code: 'REWARDED_AD_BACKEND_UNAVAILABLE' });
  }
}
