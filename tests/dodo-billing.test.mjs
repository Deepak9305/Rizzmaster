import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DODO_PAYMENTS_API_KEY = 'test_api_key';
process.env.DODO_PAYMENTS_WEBHOOK_KEY = 'whsec_test_key';
process.env.DODO_PAYMENTS_ENVIRONMENT = 'test_mode';
process.env.DODO_PAYMENTS_WEEKLY_PRODUCT_ID = 'pdt_weekly';
process.env.DODO_PAYMENTS_MONTHLY_PRODUCT_ID = 'pdt_monthly';
process.env.DODO_PAYMENTS_ENABLED = 'false';
process.env.DODO_PAYMENTS_RETURN_URL = 'https://rizzmaster.online/billing/return';

const {
  hasActiveDodoAccess,
  hasValidDodoAccessExpiry,
  getDodoReturnUrl,
  isDodoConfigured,
  isDodoPortalConfigured,
  isDodoWebhookConfigured,
  isSafeDodoRedirectUrl,
  normalizeDodoSubscriptionStatus,
} = await import('../server/api/_dodo.js');

test('sales can be disabled without disabling webhooks or the portal', () => {
  assert.equal(isDodoConfigured(), false);
  assert.equal(isDodoWebhookConfigured(), true);
  assert.equal(isDodoPortalConfigured(), true);
});

test('active access observes expiry while provider management remains separate', () => {
  const now = Date.parse('2026-08-08T12:00:00Z');
  assert.equal(hasActiveDodoAccess({ status: 'active', access_expires_at: null }, now), false);
  assert.equal(hasActiveDodoAccess({ status: 'active', access_expires_at: '2026-08-08T13:00:00Z' }, now), true);
  assert.equal(hasActiveDodoAccess({ status: 'active', access_expires_at: '2026-08-08T11:00:00Z' }, now), false);
  assert.equal(hasActiveDodoAccess({ status: 'cancelled', access_expires_at: null }, now), false);
});

test('on-hold access ends at the 48-hour grace boundary', () => {
  const now = Date.parse('2026-08-08T12:00:00Z');
  assert.equal(hasActiveDodoAccess({ status: 'on_hold', on_hold_grace_expires_at: '2026-08-08T13:00:00Z' }, now), true);
  assert.equal(hasActiveDodoAccess({ status: 'on_hold', on_hold_grace_expires_at: '2026-08-08T12:00:00Z' }, now), false);
  assert.equal(hasActiveDodoAccess({ status: 'on_hold', on_hold_grace_expires_at: null }, now), false);
});

test('webhook states fail closed and support paused subscriptions', () => {
  assert.equal(normalizeDodoSubscriptionStatus('subscription.active', 'unknown'), 'active');
  assert.equal(normalizeDodoSubscriptionStatus('subscription.updated', 'paused'), 'paused');
  assert.equal(normalizeDodoSubscriptionStatus('subscription.paused', 'active'), 'paused');
  assert.equal(normalizeDodoSubscriptionStatus('subscription.updated', 'unknown'), null);
});

test('active subscriptions require a valid access expiry', () => {
  assert.equal(hasValidDodoAccessExpiry('active', '2026-08-15T12:00:00Z'), true);
  assert.equal(hasValidDodoAccessExpiry('active', null), false);
  assert.equal(hasValidDodoAccessExpiry('active', 'not-a-date'), false);
  assert.equal(hasValidDodoAccessExpiry('on_hold', null), true);
  assert.equal(hasValidDodoAccessExpiry('paused', null), true);
});

test('checkout return URLs distinguish cancellation without changing entitlement', () => {
  assert.equal(getDodoReturnUrl(), 'https://rizzmaster.online/billing/return');
  assert.equal(getDodoReturnUrl('cancelled'), 'https://rizzmaster.online/billing/return?checkout=cancelled');
});

test('billing redirects accept only credential-free HTTPS URLs', () => {
  assert.equal(isSafeDodoRedirectUrl('https://checkout.dodopayments.com/session/test'), true);
  assert.equal(isSafeDodoRedirectUrl('http://checkout.dodopayments.com/session/test'), false);
  assert.equal(isSafeDodoRedirectUrl('javascript:alert(1)'), false);
  assert.equal(isSafeDodoRedirectUrl('https://user:secret@example.com/path'), false);
  assert.equal(isSafeDodoRedirectUrl(undefined), false);
});
