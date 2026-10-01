import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function setup(options = {}) {
  const calls = [], errors = [];
  const listeners = {};
  for (const event of ['approved', 'verified', 'finished', 'productUpdated', 'updated']) listeners[event] = () => listeners;
  const product = { id: 'premium', canPurchase: true, offers: ['weekly', 'monthly'].map(plan => ({
    id: `premium@${plan}`, order: async () => { calls.push(plan); },
  })) };
  const store = {
    products: [product], register() {}, when: () => listeners, error() {},
    initialize: options.initialize || (async () => []),
    update: async () => { calls.push('update'); }, get: () => product,
    restorePurchases: async () => { calls.push('restorePurchases'); return options.restoreError; },
  };
  const context = {
    exports: {}, window: { CdvPurchase: {
      store, ProductType: { PAID_SUBSCRIPTION: 'subscription' },
      Platform: { GOOGLE_PLAY: 'google-play' }, ErrorCode: { PAYMENT_CANCELLED: 6777006 },
    } },
    console: { log() {}, warn() {}, error() {} }, setTimeout,
    require(name) {
      if (name === 'cordova-plugin-purchase') return {};
      if (name === '@capacitor/core') return { Capacitor: { getPlatform: () => 'android' } };
      if (name === './nativeCapabilities') return { canUseNativeIap: () => true };
      if (name === './runtimeConfig') return { getApiUrl: path => path };
      if (name === './supabaseClient') return { supabase: null };
      throw new Error(`Unexpected import ${name}`);
    },
  };
  const compiled = ts.transpileModule(readFileSync(new URL('../services/iapService.ts', import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(compiled, context);
  const service = context.exports.default;
  service.getAccountBinding = async () => { calls.push('accountBinding'); return 'binding'; };
  service.initialize(() => false, message => errors.push(message));
  return { service, store, calls, errors };
}

test('missing plugin initialization blocks purchase and restore before account binding', async () => {
  const { service, calls, errors } = setup({ initialize: async () => [{ message: 'Init failed - Class not found', code: 6777001 }] });
  assert.equal(await service.purchase('WEEKLY', 'account'), false);
  await service.restore('account');
  assert.equal(service.isInitialized, false);
  assert.equal(service.purchaseInProgress, false);
  assert.equal(calls.length, 0);
  assert.ok(errors.every(message => message.includes('update Rizz Master')));
});

test('a synchronous initialization exception is contained and reported', async () => {
  const { service, errors } = setup({ initialize() { throw new Error('Offline'); } });
  await service.initializationPromise;
  assert.equal(service.isInitialized, false);
  assert.match(errors[0], /restart the app/);
});

test('purchase waits for initialization and orders only the selected base plan', async () => {
  let finish;
  const { service, calls } = setup({ initialize: () => new Promise(resolve => { finish = resolve; }) });
  const purchase = service.purchase('MONTHLY', 'account');
  await Promise.resolve();
  assert.equal(calls.length, 0);
  finish([]);
  assert.equal(await purchase, true);
  assert.ok(calls.includes('monthly'));
  assert.ok(!calls.includes('weekly'));
});

test('restore uses the library restorePurchases API and refreshes the store', async () => {
  const { service, calls, errors } = setup();
  await service.initializationPromise;
  calls.length = 0;
  await service.restore('account');
  assert.deepEqual(calls, ['accountBinding', 'restorePurchases', 'update']);
  assert.equal(errors.length, 0);
});

test('restore reports a returned store error instead of silently accepting it', async () => {
  const { service, calls, errors } = setup({ restoreError: { isError: true, code: 1, message: 'Play Store unavailable' } });
  await service.initializationPromise;
  calls.length = 0;
  await service.restore('account');
  assert.deepEqual(calls, ['accountBinding', 'restorePurchases']);
  assert.equal(service.activeIntent, null);
  assert.equal(errors.at(-1), 'Play Store unavailable');
});
