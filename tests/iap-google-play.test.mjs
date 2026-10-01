import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

process.env.IAP_ACCOUNT_BINDING_SECRET = 'iap-google-play-test-secret';
process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL = 'billing-test@example.iam.gserviceaccount.com';
process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  .privateKey.export({ type: 'pkcs8', format: 'pem' });
process.env.GOOGLE_PLAY_PACKAGE_NAME = 'app.vercel.rizzmaster';

const { verifyStorePurchase } = await import('../server/api/_iap.js');

const activeGooglePurchase = ({ basePlanId = 'monthly' } = {}) => ({
  subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
  latestOrderId: 'GPA.1234-5678-9012-34567',
  lineItems: [{
    productId: 'premium',
    basePlanId,
    expiryTime: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  }],
});

test('restore verifies the base plan returned by Google Play when the device omits it', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    if (String(url) === 'https://oauth2.googleapis.com/token') {
      return new Response(JSON.stringify({ access_token: 'test-access-token' }), { status: 200 });
    }
    return new Response(JSON.stringify(activeGooglePurchase()), { status: 200 });
  };

  try {
    const result = await verifyStorePurchase({
      platform: 'android',
      productId: 'premium',
      basePlanId: null,
      purchaseToken: 'play-purchase-token',
      transactionId: 'GPA.1234-5678-9012-34567',
      appUserId: '3508941a-3ed4-4f3e-8eeb-c5551f171004',
      intent: 'restore',
    });

    assert.equal(result.verifiedProductId, 'premium');
    assert.equal(result.verifiedBasePlanId, 'monthly');
    assert.equal(calls.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('a new purchase still requires the selected base plan before store verification', async () => {
  await assert.rejects(
    verifyStorePurchase({
      platform: 'android',
      productId: 'premium',
      basePlanId: null,
      purchaseToken: 'play-purchase-token',
      transactionId: 'GPA.1234-5678-9012-34567',
      appUserId: '3508941a-3ed4-4f3e-8eeb-c5551f171004',
      intent: 'purchase',
    }),
    error => error?.code === 'GOOGLE_PLAY_PRODUCT_MISMATCH'
  );
});
