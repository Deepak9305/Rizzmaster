import { randomUUID } from 'node:crypto';
import { applyCors } from './_cors.js';
import { ensureUserProfile } from './_profiles.js';
import { supabaseAdmin } from './_supabase.js';
import {
  authenticateBillingRequest,
  dodoConfig,
  getActiveDodoSubscription,
  getDodoClient,
  getDodoPlan,
  isDodoConfigured,
  json,
  recomputePremium,
  safeDodoError,
} from './_dodo.js';

export default async function handler(req, res) {
  if (applyCors(req, res)) return;
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });

  const auth = await authenticateBillingRequest(req);
  if (!auth.user) return json(res, 401, { error: auth.error, code: 'LOGIN_REQUIRED' });
  if (!supabaseAdmin) return json(res, 503, { error: 'Billing database is unavailable.', code: 'BILLING_UNAVAILABLE' });
  if (!isDodoConfigured()) return json(res, 503, { error: 'Web billing is not available yet.', code: 'DODO_CONFIG_MISSING' });
  if (!auth.user.email) return json(res, 400, { error: 'Your account needs an email address before checkout.', code: 'BILLING_EMAIL_REQUIRED' });

  const plan = getDodoPlan(req.body?.plan);
  if (!plan?.id) return json(res, 400, { error: 'Invalid or unavailable billing plan.', code: 'INVALID_BILLING_PLAN' });

  let checkoutRecordId = null;
  try {
    await ensureUserProfile(supabaseAdmin, auth.user);
    const profile = await recomputePremium(auth.user.id);
    const activeDodo = await getActiveDodoSubscription(auth.user.id);
    if (activeDodo) {
      return json(res, 409, {
        error: 'Your web subscription is already active.',
        code: 'DODO_SUBSCRIPTION_ACTIVE',
        canManage: true,
      });
    }
    if (profile?.is_premium) {
      return json(res, 409, {
        error: 'Premium is already active through Google Play.',
        code: 'PREMIUM_ALREADY_ACTIVE',
      });
    }

    const billingReference = randomUUID();
    const { data: checkoutRecord, error: insertError } = await supabaseAdmin
      .from('dodo_checkout_sessions')
      .insert({
        user_id: auth.user.id,
        billing_reference: billingReference,
        plan: plan.key,
        product_id: plan.id,
        status: 'created',
      })
      .select('id,billing_reference')
      .single();
    if (insertError || !checkoutRecord) throw insertError || new Error('Could not create billing reference.');
    checkoutRecordId = checkoutRecord.id;

    const client = getDodoClient();
    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: plan.id, quantity: 1 }],
      billing_currency: 'USD',
      customer: {
        email: auth.user.email,
        name: auth.user.user_metadata?.full_name || auth.user.user_metadata?.name || undefined,
      },
      metadata: {
        rizz_user_id: auth.user.id,
        billing_reference: billingReference,
        plan: plan.key,
      },
      return_url: dodoConfig.returnUrl,
      cancel_url: dodoConfig.returnUrl,
      customization: { theme: 'dark' },
      feature_flags: {
        allow_customer_editing_email: false,
        redirect_immediately: true,
      },
    });

    if (!session?.checkout_url) throw new Error('Dodo did not return a checkout URL.');

    await supabaseAdmin
      .from('dodo_checkout_sessions')
      .update({ dodo_session_id: session.session_id, status: 'redirected', updated_at: new Date().toISOString() })
      .eq('id', checkoutRecord.id);

    return json(res, 200, { checkoutUrl: session.checkout_url });
  } catch (error) {
    if (checkoutRecordId) {
      await supabaseAdmin
        .from('dodo_checkout_sessions')
        .update({ status: 'failed', updated_at: new Date().toISOString() })
        .eq('id', checkoutRecordId)
        .then(({ error: updateError }) => {
          if (updateError) console.warn('[Dodo Checkout] Could not mark failed checkout.', { userId: auth.user.id });
        });
    }
    const safe = safeDodoError(error);
    console.error('[Dodo Checkout] Failed.', {
      userId: auth.user.id,
      plan: plan.key,
      code: safe.code,
      statusCode: safe.statusCode,
      message: safe.message,
    });
    return json(res, 502, { error: 'Could not start secure checkout. Please try again.', code: 'DODO_CHECKOUT_FAILED' });
  }
}
