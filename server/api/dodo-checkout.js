import { randomUUID } from 'node:crypto';
import { applyCors } from './_cors.js';
import { ensureUserProfile } from './_profiles.js';
import { supabaseAdmin } from './_supabase.js';
import {
  authenticateBillingRequest,
  getManageableDodoSubscription,
  getDodoClient,
  getDodoPlan,
  getDodoReturnUrl,
  isDodoConfigured,
  isSafeDodoRedirectUrl,
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
    const manageableDodo = await getManageableDodoSubscription(auth.user.id);
    if (manageableDodo) {
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

    const staleCreatedCutoff = new Date(Date.now() - (5 * 60 * 1000)).toISOString();
    const { error: staleCreatedError } = await supabaseAdmin
      .from('dodo_checkout_sessions')
      .update({ status: 'failed', updated_at: new Date().toISOString() })
      .eq('user_id', auth.user.id)
      .eq('status', 'created')
      .lte('updated_at', staleCreatedCutoff);
    if (staleCreatedError) throw staleCreatedError;

    const { error: expireError } = await supabaseAdmin
      .from('dodo_checkout_sessions')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('user_id', auth.user.id)
      .in('status', ['created', 'redirected'])
      .lte('expires_at', new Date().toISOString());
    if (expireError) throw expireError;

    const loadOpenCheckout = async () => {
      const { data, error } = await supabaseAdmin
        .from('dodo_checkout_sessions')
        .select('id,checkout_url,status,expires_at,plan')
        .eq('user_id', auth.user.id)
        .in('status', ['created', 'redirected'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data || null;
    };

    const openCheckout = await loadOpenCheckout();
    if (openCheckout?.checkout_url && openCheckout.plan === plan.key) {
      return json(res, 200, { checkoutUrl: openCheckout.checkout_url, resumed: true });
    }
    if (openCheckout) {
      return json(res, 409, {
        error: 'A checkout is already being prepared. Please retry in a moment.',
        code: 'DODO_CHECKOUT_PENDING',
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
    if (insertError?.code === '23505') {
      const racedCheckout = await loadOpenCheckout();
      if (racedCheckout?.checkout_url && racedCheckout.plan === plan.key) {
        return json(res, 200, { checkoutUrl: racedCheckout.checkout_url, resumed: true });
      }
      return json(res, 409, {
        error: 'A checkout is already being prepared. Please retry in a moment.',
        code: 'DODO_CHECKOUT_PENDING',
      });
    }
    if (insertError || !checkoutRecord) throw insertError || new Error('Could not create billing reference.');
    checkoutRecordId = checkoutRecord.id;

    const client = getDodoClient();
    const returnUrl = getDodoReturnUrl();
    const cancelUrl = getDodoReturnUrl('cancelled');
    if (!returnUrl || !cancelUrl) {
      throw new Error('Dodo return URL is invalid.');
    }
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
      return_url: returnUrl,
      cancel_url: cancelUrl,
      customization: { theme: 'dark' },
      feature_flags: {
        allow_customer_editing_email: false,
        redirect_immediately: true,
      },
    });

    if (!session?.session_id || !isSafeDodoRedirectUrl(session.checkout_url)) {
      throw new Error('Dodo did not return a complete checkout session.');
    }

    const { data: linkedCheckout, error: sessionUpdateError } = await supabaseAdmin
      .from('dodo_checkout_sessions')
      .update({
        dodo_session_id: session.session_id,
        checkout_url: session.checkout_url,
        status: 'redirected',
        updated_at: new Date().toISOString(),
      })
      .eq('id', checkoutRecord.id)
      .select('id')
      .single();
    if (sessionUpdateError || !linkedCheckout) {
      throw sessionUpdateError || new Error('Could not securely link the checkout session.');
    }

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
