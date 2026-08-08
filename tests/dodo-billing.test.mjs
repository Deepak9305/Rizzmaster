import assert from 'node:assert/strict';
import test from 'node:test';

process.env.DODO_PAYMENTS_API_KEY = 'test_api_key';
process.env.DODO_PAYMENTS_WEBHOOK_KEY = 'whsec_test_key';
process.env.DODO_PAYMENTS_ENVIRONMENT = 'test_mode';
process.env.DODO_PAYMENTS_WEEKLY_PRODUCT_ID = 'pdt_weekly';
process.env.DODO_PAYMENTS_MONTHLY_PRODUCT_ID = 'pdt_monthly';
process.env.DODO_PAYMENTS_ENABLED = 'false';

const {
  hasActiveDodoAccess,
  isDodoConfigured,
  isDodoPortalConfigured,
  isDodoWebhookConfigured,
} = await import('../server/api/_dodo.js');

test('sales can be disabled without disabling webhooks or the portal', () => {
  assert.equal(isDodoConfigured(), false);
  assert.equal(isDodoWebhookConfigured(), true);
  assert.equal(isDodoPortalConfigured(), true);
});

test('active access observes expiry while provider management remains separate', () => {
  const now = Date.parse('2026-08-08T12:00:00Z');
  assert.equal(hasActiveDodoAccess({ status: 'active', access_expires_at: null }, now), true);
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
