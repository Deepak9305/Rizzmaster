import test from 'node:test';
import assert from 'node:assert/strict';
import { formatDodoQuote, getDodoQuote, getPricingCountry, countryPricing } from '../server/api/_dodo-pricing.js';

const quote = (currency, renewal, today = renewal) => ({ currency,
  recurring_breakup: { total_amount: renewal }, current_breakup: { total_amount: today },
});

test('country prices use Dodo amounts, including trials and currency fractions', () => {
  assert.deepEqual(formatDodoQuote({ ...quote('INR', 14900, 0), trial_period_days: 7 }), {
    currency: 'INR', price: '₹149.00', dueToday: '₹0.00', trialDays: 7,
  });
  assert.equal(formatDodoQuote(quote('USD', 499)).price, '$4.99');
  assert.equal(formatDodoQuote(quote('JPY', 500)).price, '¥500');
  assert.equal(formatDodoQuote(quote('BHD', 1500)).price, 'BHD\u00a01.500');
  assert.throws(() => formatDodoQuote(quote('USD', -1)));
  assert.throws(() => formatDodoQuote({ currency: 'USD', current_breakup: { total_amount: 0 } }));
});

test('country detection has no invented US or USD fallback', () => {
  assert.equal(getPricingCountry({ headers: { 'x-vercel-ip-country': 'IN' } }), 'IN');
  assert.equal(getPricingCountry({ headers: { 'x-vercel-ip-country': 'XX' } }), null);
  assert.equal(getPricingCountry({ headers: {} }), null);
  assert.deepEqual(countryPricing(null), {});
  assert.deepEqual(countryPricing('IN'), { billing_address: { country: 'IN' } });
});

test('preview shares requests per product and country and isolates countries', async () => {
  const calls = [];
  const client = { checkoutSessions: { preview: async (body) => {
    calls.push(body);
    return body.billing_address.country === 'IN' ? quote('INR', 14900) : quote('USD', 499);
  } } };
  const [a, b, c] = await Promise.all([
    getDodoQuote(client, 'pdt_country_test', 'IN'), getDodoQuote(client, 'pdt_country_test', 'IN'),
    getDodoQuote(client, 'pdt_country_test', 'US'),
  ]);
  assert.equal(calls.length, 2);
  assert.equal(a.price, b.price);
  assert.notEqual(a.price, c.price);
  assert.equal(calls[0].billing_currency, undefined);
});

test('a failed preview can retry without retaining a fake price', async () => {
  let calls = 0;
  const client = { checkoutSessions: { preview: async () => {
    if (++calls === 1) throw new Error('Temporary failure');
    return quote('USD', 799);
  } } };
  await assert.rejects(getDodoQuote(client, 'pdt_retry_test', 'US'));
  assert.equal((await getDodoQuote(client, 'pdt_retry_test', 'US')).price, '$7.99');
});

test('public plans serve country quotes without requiring login and fall back gracefully', async () => {
  Object.assign(process.env, {
    DODO_PAYMENTS_ENABLED: 'true', DODO_PAYMENTS_ENVIRONMENT: 'test_mode',
    DODO_PAYMENTS_API_KEY: 'test_key', DODO_PAYMENTS_WEBHOOK_KEY: 'test_webhook',
    DODO_PAYMENTS_WEEKLY_PRODUCT_ID: 'pdt_endpoint_weekly', DODO_PAYMENTS_MONTHLY_PRODUCT_ID: 'pdt_endpoint_monthly',
  });
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url, init) => {
    const body = JSON.parse(init.body);
    requests.push(body);
    return new Response(JSON.stringify(quote('INR', body.product_cart[0].product_id.endsWith('weekly') ? 14900 : 49900)), {
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const { default: handler } = await import('../server/api/dodo-plans.js');
    const run = async (headers) => {
      let result;
      const res = { setHeader() {}, status(code) { assert.equal(code, 200); return this; }, send(value) { result = JSON.parse(value); } };
      await handler({ method: 'GET', headers }, res);
      return result;
    };
    const result = await run({ 'x-vercel-ip-country': 'IN' });
    assert.equal(result.enabled, true);
    assert.deepEqual(result.plans.map(plan => plan.price), ['₹149.00', '₹499.00']);
    assert.equal(requests.length, 2);
    const unknown = await run({});
    assert.equal(unknown.plans[0].price, null);
    assert.equal(unknown.plans[0].available, true);
    assert.equal(requests.length, 2);
  } finally { globalThis.fetch = originalFetch; }
});
