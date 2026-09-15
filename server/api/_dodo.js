import DodoPayments from 'dodopayments';
import { getAuthenticatedUser, getBearerToken, supabaseAdmin } from './_supabase.js';

const readEnv = (key) => {
  const value = process.env[key];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
};

const isEnabledValue = (value) => /^(1|true|yes|on)$/i.test(value || '');
export const isSafeDodoRedirectUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password;
  } catch {
    return false;
  }
};
const environmentValue = readEnv('DODO_PAYMENTS_ENVIRONMENT');
const hasValidEnvironment = environmentValue === 'test_mode' || environmentValue === 'live_mode';

export const dodoConfig = {
  enabled: isEnabledValue(readEnv('DODO_PAYMENTS_ENABLED')),
  apiKey: readEnv('DODO_PAYMENTS_API_KEY'),
  webhookKey: readEnv('DODO_PAYMENTS_WEBHOOK_KEY'),
  environment: environmentValue === 'test_mode' ? 'test_mode' : 'live_mode',
  returnUrl: readEnv('DODO_PAYMENTS_RETURN_URL') || 'https://rizzmaster.online/billing/return',
  products: {
    WEEKLY: {
      id: readEnv('DODO_PAYMENTS_WEEKLY_PRODUCT_ID'),
      label: 'Weekly',
      price: '$4.99',
      interval: 'week',
    },
    MONTHLY: {
      id: readEnv('DODO_PAYMENTS_MONTHLY_PRODUCT_ID'),
      label: 'Monthly',
      price: '$15.99',
      interval: 'month',
    },
  },
};

const isDodoApiConfigured = () => Boolean(
  dodoConfig.apiKey &&
  hasValidEnvironment
);

export const isDodoWebhookConfigured = () => Boolean(
  isDodoApiConfigured() &&
  dodoConfig.webhookKey &&
  dodoConfig.products.WEEKLY.id &&
  dodoConfig.products.MONTHLY.id
);

// This flag controls new sales only. Existing subscribers must always retain
// webhook updates and portal access when the provider credentials are valid.
export const isDodoConfigured = () => Boolean(
  dodoConfig.enabled && isDodoWebhookConfigured() && isSafeDodoRedirectUrl(dodoConfig.returnUrl)
);

export const isDodoPortalConfigured = () => Boolean(
  isDodoApiConfigured() && isSafeDodoRedirectUrl(dodoConfig.returnUrl)
);

export const getDodoReturnUrl = (checkoutState = null) => {
  if (!isSafeDodoRedirectUrl(dodoConfig.returnUrl)) return null;
  const url = new URL(dodoConfig.returnUrl);
  if (checkoutState) url.searchParams.set('checkout', checkoutState);
  return url.toString();
};

export const getDodoClient = () => {
  if (!isDodoApiConfigured()) return null;
  return new DodoPayments({
    bearerToken: dodoConfig.apiKey,
    webhookKey: dodoConfig.webhookKey,
    environment: dodoConfig.environment,
  });
};

export const getDodoPlan = (plan) => {
  const normalized = typeof plan === 'string' ? plan.trim().toUpperCase() : '';
  return normalized === 'WEEKLY' || normalized === 'MONTHLY'
    ? { key: normalized, ...dodoConfig.products[normalized] }
    : null;
};

export const getPlanForProductId = (productId) => {
  if (!productId) return null;
  return Object.entries(dodoConfig.products)
    .find(([, product]) => product.id === productId)?.[0] || null;
};

export const canReuseDodoCheckout = (checkout, requestedPlan) => Boolean(
  checkout?.checkout_url &&
  ['created', 'redirected'].includes(checkout.status) &&
  checkout.plan === requestedPlan
);

export const authenticateBillingRequest = async (req) => {
  const token = getBearerToken(req);
  if (!token) return { token: null, user: null, error: 'Missing authorization token.' };
  const result = await getAuthenticatedUser(token);
  if (result.error || !result.user) {
    return { token, user: null, error: 'Invalid or expired session.' };
  }
  return { token, user: result.user, error: null };
};

export const recomputePremium = async (userId) => {
  if (!supabaseAdmin) throw new Error('Supabase service role is not configured.');
  const { data, error } = await supabaseAdmin.rpc('admin_recompute_premium', {
    p_user_uuid: userId,
  });
  if (error) throw error;
  return data;
};

export const getManageableDodoSubscription = async (userId) => {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('dodo_subscriptions')
    .select('dodo_customer_id,dodo_subscription_id,product_id,plan,status,cancel_at_next_billing_date,next_billing_date,access_expires_at,on_hold_grace_expires_at')
    .eq('user_id', userId)
    .in('status', ['active', 'on_hold', 'paused'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data || null;
};

export const hasActiveDodoAccess = (subscription, now = Date.now()) => {
  if (!subscription) return false;
  if (subscription.status === 'on_hold') {
    const grace = new Date(subscription.on_hold_grace_expires_at || '').getTime();
    return Number.isFinite(grace) && grace > now;
  }
  if (subscription.status !== 'active') return false;
  const expiry = new Date(subscription.access_expires_at || '').getTime();
  return Number.isFinite(expiry) && expiry > now;
};

const EVENT_STATUS_OVERRIDES = {
  'subscription.active': 'active',
  'subscription.renewed': 'active',
  'subscription.on_hold': 'on_hold',
  'subscription.paused': 'paused',
  'subscription.cancelled': 'cancelled',
  'subscription.failed': 'failed',
  'subscription.expired': 'expired',
};

const DODO_SUBSCRIPTION_STATUSES = new Set([
  'pending',
  'active',
  'on_hold',
  'paused',
  'cancelled',
  'failed',
  'expired',
]);

export const normalizeDodoSubscriptionStatus = (eventType, providerStatus) => {
  const eventStatus = EVENT_STATUS_OVERRIDES[eventType];
  if (eventStatus) return eventStatus;
  return DODO_SUBSCRIPTION_STATUSES.has(providerStatus) ? providerStatus : null;
};

export const hasValidDodoAccessExpiry = (status, nextBillingDate) => {
  if (status !== 'active') return true;
  if (typeof nextBillingDate !== 'string' || !nextBillingDate.trim()) return false;
  return Number.isFinite(Date.parse(nextBillingDate));
};

export const getActiveDodoSubscription = async (userId) => {
  const subscription = await getManageableDodoSubscription(userId);
  return hasActiveDodoAccess(subscription) ? subscription : null;
};

export const safeDodoError = (error) => {
  const statusCode = Number(error?.status || error?.statusCode || 0) || null;
  const code = typeof error?.code === 'string' ? error.code : null;
  const rawMessage = error instanceof Error ? error.message : String(error || 'Dodo request failed.');
  const message = rawMessage
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/whsec_[A-Za-z0-9_-]+/gi, '[redacted]')
    .slice(0, 300);
  return { code, statusCode, message };
};

export const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(payload));
};
