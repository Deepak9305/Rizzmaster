import {
  dodoConfig,
  getDodoClient,
  getPlanForProductId,
  hasValidDodoAccessExpiry,
  isDodoWebhookConfigured,
  json,
  normalizeDodoSubscriptionStatus,
  safeDodoError,
} from './_dodo.js';
import { supabaseAdmin } from './_supabase.js';

export const config = { api: { bodyParser: false } };

const SUBSCRIPTION_EVENTS = new Set([
  'subscription.active',
  'subscription.renewed',
  'subscription.updated',
  'subscription.plan_changed',
  'subscription.update_payment_method',
  'subscription.on_hold',
  'subscription.paused',
  'subscription.cancelled',
  'subscription.failed',
  'subscription.expired',
]);

const readRawBody = async (req) => {
  if (typeof req.rawBody === 'string') return req.rawBody;
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody.toString('utf8');
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf8');
};

const header = (req, name) => {
  const value = req.headers?.[name];
  return Array.isArray(value) ? value[0] : (typeof value === 'string' ? value : '');
};

const stringValue = (value) => (
  typeof value === 'string' ? value.trim() : (typeof value === 'number' ? String(value) : '')
);

const uuidValue = (value) => {
  const candidate = stringValue(value);
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(candidate)
    ? candidate
    : null;
};

const recordIgnoredEvent = async (webhookId, eventType, eventTimestamp, subscriptionId, code, message) => {
  if (!supabaseAdmin || !webhookId) return;
  await supabaseAdmin.from('dodo_webhook_events').upsert({
    webhook_id: webhookId,
    event_type: eventType || 'unknown',
    dodo_subscription_id: subscriptionId || null,
    processing_status: code ? 'failed' : 'ignored',
    safe_error_code: code || null,
    safe_error_message: message ? String(message).slice(0, 300) : null,
    event_timestamp: eventTimestamp || new Date().toISOString(),
    processed_at: new Date().toISOString(),
  }, { onConflict: 'webhook_id', ignoreDuplicates: true });
};

export default async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed.' });
  if (!isDodoWebhookConfigured() || !supabaseAdmin) {
    return json(res, 503, { error: 'Webhook processing is not configured.', code: 'DODO_CONFIG_MISSING' });
  }

  const webhookId = header(req, 'webhook-id');
  const signature = header(req, 'webhook-signature');
  const timestamp = header(req, 'webhook-timestamp');
  if (!webhookId || !signature || !timestamp) {
    return json(res, 400, { error: 'Missing webhook signature headers.', code: 'INVALID_WEBHOOK_SIGNATURE' });
  }

  let event;
  try {
    const rawBody = await readRawBody(req);
    event = getDodoClient().webhooks.unwrap(rawBody, {
      headers: {
        'webhook-id': webhookId,
        'webhook-signature': signature,
        'webhook-timestamp': timestamp,
      },
      key: dodoConfig.webhookKey,
    });
  } catch (error) {
    const safe = safeDodoError(error);
    console.warn('[Dodo Webhook] Signature verification failed.', {
      webhookId,
      code: safe.code,
      message: safe.message,
    });
    return json(res, 400, { error: 'Invalid webhook signature.', code: 'INVALID_WEBHOOK_SIGNATURE' });
  }

  const eventType = stringValue(event?.type);
  const data = event?.data || {};
  const subscriptionId = stringValue(data.subscription_id);
  const eventTimestamp = stringValue(event?.timestamp) || new Date().toISOString();

  if (eventType === 'payment.succeeded') {
    try {
      const checkoutSessionId = stringValue(data.checkout_session_id);
      if (!checkoutSessionId || !subscriptionId) {
        await recordIgnoredEvent(webhookId, eventType, eventTimestamp, subscriptionId, null, null);
        return json(res, 200, { received: true, ignored: true });
      }

      const { data: checkout, error: checkoutError } = await supabaseAdmin
        .from('dodo_checkout_sessions')
        .select('user_id,billing_reference,product_id')
        .eq('dodo_session_id', checkoutSessionId)
        .maybeSingle();
      if (checkoutError) throw checkoutError;
      if (!checkout) {
        await recordIgnoredEvent(webhookId, eventType, eventTimestamp, subscriptionId, 'DODO_CHECKOUT_NOT_FOUND', 'Checkout session was not created by this application.');
        return json(res, 200, { received: true, applied: false });
      }

      const subscription = await getDodoClient().subscriptions.retrieve(subscriptionId);
      const plan = getPlanForProductId(subscription.product_id);
      if (!plan || subscription.product_id !== checkout.product_id) {
        await recordIgnoredEvent(webhookId, eventType, eventTimestamp, subscriptionId, 'DODO_CHECKOUT_MISMATCH', 'Verified subscription product did not match the checkout.');
        return json(res, 200, { received: true, applied: false });
      }
      const customerId = stringValue(subscription.customer?.customer_id);
      if (!customerId) {
        throw new Error('Verified subscription is not ready to grant access.');
      }
      if (subscription.status === 'pending') {
        throw new Error('Verified subscription is still pending activation.');
      }
      if (!['active', 'on_hold'].includes(subscription.status)) {
        await recordIgnoredEvent(webhookId, eventType, eventTimestamp, subscriptionId, null, null);
        return json(res, 200, { received: true, ignored: true });
      }
      const normalizedStatus = normalizeDodoSubscriptionStatus(eventType, stringValue(subscription.status));
      const nextBillingDate = stringValue(subscription.next_billing_date) || null;
      if (!normalizedStatus || !hasValidDodoAccessExpiry(normalizedStatus, nextBillingDate)) {
        await recordIgnoredEvent(webhookId, eventType, eventTimestamp, subscriptionId, 'DODO_SUBSCRIPTION_STATE_INVALID', 'Verified subscription state or access expiry was invalid.');
        return json(res, 200, { received: true, applied: false });
      }

      const { data: applied, error: applyError } = await supabaseAdmin.rpc('admin_apply_dodo_subscription_event', {
        p_webhook_id: webhookId,
        p_event_type: eventType,
        p_event_timestamp: eventTimestamp,
        p_user_uuid: checkout.user_id,
        p_subscription_id: subscriptionId,
        p_customer_id: customerId,
        p_product_id: subscription.product_id,
        p_plan: plan,
        p_status: normalizedStatus,
        p_cancel_at_next_billing_date: subscription.cancel_at_next_billing_date === true,
        p_next_billing_date: nextBillingDate,
        p_recurring_amount: Number.isFinite(subscription.recurring_pre_tax_amount) ? subscription.recurring_pre_tax_amount : null,
        p_currency: stringValue(subscription.currency) || 'USD',
        p_billing_reference: checkout.billing_reference,
      });
      if (applyError) throw applyError;

      console.info('[Dodo Webhook] Checkout-linked payment applied.', {
        webhookId,
        eventType,
        subscriptionId,
        duplicate: applied?.duplicate === true,
      });
      return json(res, 200, { received: true, duplicate: applied?.duplicate === true });
    } catch (error) {
      const safe = safeDodoError(error);
      console.error('[Dodo Webhook] Checkout-linked payment processing failed.', {
        webhookId,
        eventType,
        subscriptionId,
        code: safe.code,
        statusCode: safe.statusCode,
        message: safe.message,
      });
      return json(res, 500, { error: 'Webhook processing failed.', code: 'DODO_WEBHOOK_PROCESSING_FAILED' });
    }
  }

  if (!SUBSCRIPTION_EVENTS.has(eventType)) {
    await recordIgnoredEvent(webhookId, eventType, eventTimestamp, subscriptionId, null, null);
    return json(res, 200, { received: true, ignored: true });
  }

  try {
    const productId = stringValue(data.product_id);
    const plan = getPlanForProductId(productId);
    const metadata = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
    let userId = uuidValue(metadata.rizz_user_id);
    let billingReference = uuidValue(metadata.billing_reference);

    if (!userId && subscriptionId) {
      const { data: existing } = await supabaseAdmin
        .from('dodo_subscriptions')
        .select('user_id,billing_reference')
        .eq('dodo_subscription_id', subscriptionId)
        .maybeSingle();
      userId = existing?.user_id || null;
      billingReference = existing?.billing_reference || billingReference;
    }

    const customerId = stringValue(data.customer?.customer_id);
    if (!subscriptionId || !userId || !plan || !customerId) {
      await recordIgnoredEvent(
        webhookId,
        eventType,
        eventTimestamp,
        subscriptionId,
        'DODO_WEBHOOK_LINK_INVALID',
        'Subscription ID, account binding, or configured product mapping is missing.'
      );
      console.error('[Dodo Webhook] Safe account linking validation failed.', {
        webhookId,
        eventType,
        hasSubscriptionId: Boolean(subscriptionId),
        hasUserId: Boolean(userId),
        productMatched: Boolean(plan),
        hasCustomerId: Boolean(customerId),
      });
      return json(res, 200, { received: true, applied: false });
    }

    const normalizedStatus = normalizeDodoSubscriptionStatus(eventType, stringValue(data.status));
    const nextBillingDate = stringValue(data.next_billing_date) || null;
    if (!normalizedStatus || !hasValidDodoAccessExpiry(normalizedStatus, nextBillingDate)) {
      await recordIgnoredEvent(
        webhookId,
        eventType,
        eventTimestamp,
        subscriptionId,
        'DODO_SUBSCRIPTION_STATE_INVALID',
        'Subscription state or access expiry was invalid.'
      );
      return json(res, 200, { received: true, applied: false });
    }

    if (billingReference) {
      const { data: checkout } = await supabaseAdmin
        .from('dodo_checkout_sessions')
        .select('user_id,product_id')
        .eq('billing_reference', billingReference)
        .maybeSingle();
      if (!checkout || checkout.user_id !== userId || checkout.product_id !== productId) {
        await recordIgnoredEvent(webhookId, eventType, eventTimestamp, subscriptionId, 'DODO_CHECKOUT_MISMATCH', 'Checkout binding did not match the subscription.');
        return json(res, 200, { received: true, applied: false });
      }
    }

    const { data: applied, error } = await supabaseAdmin.rpc('admin_apply_dodo_subscription_event', {
      p_webhook_id: webhookId,
      p_event_type: eventType,
      p_event_timestamp: eventTimestamp,
      p_user_uuid: userId,
      p_subscription_id: subscriptionId,
      p_customer_id: customerId,
      p_product_id: productId,
      p_plan: plan,
      p_status: normalizedStatus,
      p_cancel_at_next_billing_date: data.cancel_at_next_billing_date === true,
      p_next_billing_date: nextBillingDate,
      p_recurring_amount: Number.isFinite(data.recurring_pre_tax_amount) ? data.recurring_pre_tax_amount : null,
      p_currency: stringValue(data.currency) || 'USD',
      p_billing_reference: billingReference,
    });
    if (error) throw error;

    console.info('[Dodo Webhook] Subscription event applied.', {
      webhookId,
      eventType,
      subscriptionId,
      duplicate: applied?.duplicate === true,
    });
    return json(res, 200, { received: true, duplicate: applied?.duplicate === true });
  } catch (error) {
    const safe = safeDodoError(error);
    console.error('[Dodo Webhook] Processing failed.', {
      webhookId,
      eventType,
      subscriptionId,
      code: safe.code,
      statusCode: safe.statusCode,
      message: safe.message,
    });
    return json(res, 500, { error: 'Webhook processing failed.', code: 'DODO_WEBHOOK_PROCESSING_FAILED' });
  }
}
