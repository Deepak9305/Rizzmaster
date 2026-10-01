import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as crypto from 'node:crypto';
import vm from 'node:vm';
import ts from 'typescript';

const quiet = { log() {}, info() {}, warn() {}, error() {} };
const pending = () => new Promise(() => {});
const tick = () => new Promise(resolve => setTimeout(resolve, 0));
const source = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const compile = text => ts.transpileModule(text, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function loadModule(path, imports = {}, globals = {}) {
  const context = {
    exports: {}, console: quiet, Date, Buffer, AbortController, AbortSignal,
    setTimeout, clearTimeout,
    require: name => {
      assert.ok(name in imports, `Unexpected import ${name}`);
      return imports[name];
    },
    ...globals,
  };
  vm.runInNewContext(compile(source(path)), context, { filename: path });
  return context.exports;
}

function setupClient(options = {}) {
  const calls = [];
  const service = loadModule('../services/rewardedAdService.ts', {
    './runtimeConfig': { getApiUrl: path => 'https://example.test' + path },
    './supabaseClient': { supabase: { auth: { getSession: () => options.session?.() ?? Promise.resolve({ data: { session: { access_token: 'token' } } }) } } },
  }, {
    setTimeout: (fn, ms) => {
      assert.equal(ms, 15_000);
      return setTimeout(fn, 15);
    },
    fetch: async (url, init) => {
      calls.push({ url, init });
      return options.fetch?.(url, init) ?? { ok: true, json: async () => ({ status: 'granted', credits: 5 }) };
    },
  });
  return { service, calls };
}

test('a stalled auth lookup times out and cannot send a late reward request', async () => {
  let finish;
  const { service, calls } = setupClient({ session: () => new Promise(resolve => { finish = resolve; }) });
  await assert.rejects(service.getRewardedAdStatus('attempt'), { code: 'REWARDED_AD_TIMEOUT', status: 0 });
  finish({ data: { session: { access_token: 'late-token' } } });
  await tick();
  assert.equal(calls.length, 0);
});

test('a stalled fetch is aborted and a later status check succeeds', async () => {
  let hung = true;
  const { service, calls } = setupClient({ fetch: () => hung ? pending() : undefined });
  await assert.rejects(service.getRewardedAdStatus('attempt'), { code: 'REWARDED_AD_TIMEOUT' });
  assert.equal(calls[0].init.signal.aborted, true);
  hung = false;
  assert.equal((await service.getRewardedAdStatus('attempt')).credits, 5);
  assert.equal(calls[1].init.signal.aborted, false);
});

test('reward request deadlines include stalled response body parsing', async () => {
  const { service } = setupClient({ fetch: () => ({ ok: true, json: pending }) });
  await assert.rejects(service.getRewardedAdStatus('attempt'), { code: 'REWARDED_AD_TIMEOUT' });
});

test('reward API preserves authentication, encoding and server error codes', async () => {
  const { service, calls } = setupClient();
  await service.createRewardedAdAttempt(2);
  assert.equal(calls[0].init.headers.Authorization, 'Bearer token');
  assert.equal(calls[0].init.body, '{"requiredCredits":2}');
  await service.getRewardedAdStatus('a&b');
  assert.ok(calls[1].url.endsWith('attemptId=a%26b'));
  const failed = setupClient({ fetch: () => ({ ok: false, status: 401, json: async () => ({ error: 'Sign in', code: 'LOGIN_REQUIRED' }) }) });
  await assert.rejects(failed.service.getRewardedAdStatus('attempt'), { code: 'LOGIN_REQUIRED', status: 401 });
  const malformed = setupClient({ fetch: () => ({ ok: true, json: async () => { throw new Error('Invalid JSON'); } }) });
  await assert.rejects(malformed.service.getRewardedAdStatus('attempt'), { status: 502 });
});

const attemptId = '11111111-1111-4111-8111-111111111111';
const userId = '22222222-2222-4222-8222-222222222222';
const rewardHelpers = loadModule('../server/api/_rewarded-ad.js', { 'node:crypto': crypto });
const cors = loadModule('../server/api/_cors.js');

function response() {
  return {
    status(code) { this.statusCode = code; return this; },
    setHeader() {},
    send(body) { this.body = JSON.parse(body); },
    end() {},
  };
}

function setupStatus(results, options = {}) {
  const queries = [];
  let grants = 0;
  const imports = {
    './_cors.js': cors,
    './_rewarded-ad.js': rewardHelpers,
    './_supabase.js': {
      getBearerToken: req => req.headers.authorization?.replace('Bearer ', '') || null,
      getAuthenticatedUser: async () => ({ user: options.invalidSession ? null : { id: userId } }),
      supabaseAdmin: {
        rpc() { grants++; throw new Error('Unsigned completion must never grant'); },
        from(table) {
          const query = { table, filters: [] };
          queries.push(query);
          const chain = {
            select() { return chain; },
            update(data) { query.update = data; return chain; },
            eq(column, value) { query.filters.push([column, value]); return chain; },
            maybeSingle: async () => results.shift(),
            single: async () => results.shift(),
          };
          return chain;
        },
      },
    },
  };
  const status = loadModule('../server/api/rewarded-ad-status.js', imports).default;
  const complete = loadModule('../server/api/rewarded-ad-complete.js', {
    './_cors.js': cors, './rewarded-ad-status.js': { default: status },
  }).default;
  return { status, complete, queries, grants: () => grants };
}

const attempt = status => ({ data: { id: attemptId, status, expires_at: new Date(Date.now() + 60_000).toISOString() } });
const request = { method: 'POST', headers: { authorization: 'Bearer token' }, body: { attemptId } };

test('native completion reads pending status without granting account credits', async () => {
  const api = setupStatus([attempt('pending'), { data: { credits: 0 } }]);
  const res = response();
  await api.complete(request, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.body.status, 'pending');
  assert.equal(res.body.credits, 0);
  assert.equal(api.grants(), 0);
  assert.deepEqual(api.queries[0].filters, [['id', attemptId], ['user_id', userId]]);
});

test('older APK completion checks can read signed grants and reject other accounts', async () => {
  const api = setupStatus([attempt('granted'), { data: { credits: 5 } }]);
  const res = response();
  await api.complete(request, res);
  assert.equal(res.body.status, 'granted');
  assert.equal(res.body.credits, 5);
  assert.equal(api.grants(), 0);
  const missing = setupStatus([{ data: null }]);
  const rejected = response();
  await missing.complete(request, rejected);
  assert.equal(rejected.statusCode, 404);
  assert.equal(missing.grants(), 0);
});

test('native completion requires a valid signed-in session', async () => {
  const api = setupStatus([]);
  const res = response();
  await api.complete({ ...request, headers: {} }, res);
  assert.equal(res.statusCode, 401);
  assert.equal(api.queries.length, 0);
  const invalid = setupStatus([], { invalidSession: true });
  await invalid.complete(request, res);
  assert.equal(res.statusCode, 401);
  assert.equal(invalid.queries.length, 0);
});

test('a signed grant winning the expiration race is reported as granted', async () => {
  const expired = attempt('pending');
  expired.data.expires_at = new Date(Date.now() - 1_000).toISOString();
  const api = setupStatus([expired, { data: null }, { data: { status: 'granted' } }, { data: { credits: 5 } }]);
  const res = response();
  await api.status({ ...request, method: 'GET', query: { attemptId } }, res);
  assert.equal(res.body.status, 'granted');
  assert.equal(res.body.credits, 5);
  assert.deepEqual(api.queries[1].filters.at(-1), ['status', 'pending']);
});

function signedFixture() {
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const canonicalQuery = 'ad_unit=6580197977&custom_data=' + attemptId + '&reward_amount=5&reward_item=rizz_credits&transaction_id=txn';
  return {
    canonicalQuery,
    signature: crypto.sign('sha256', Buffer.from(canonicalQuery), pair.privateKey).toString('base64url'),
    pem: pair.publicKey.export({ type: 'spki', format: 'pem' }),
  };
}

test('SSV verification shares key fetches, reuses cache and rejects tampered callbacks', async () => {
  const signed = signedFixture();
  let requests = 0;
  const helper = loadModule('../server/api/_rewarded-ad.js', { 'node:crypto': crypto }, {
    fetch: async (_, init) => {
      requests++;
      assert.ok(init.signal instanceof AbortSignal);
      return { ok: true, json: async () => ({ keys: [{ keyId: 1, pem: signed.pem }] }) };
    },
  });
  const input = { ...signed, keyId: '1' };
  const results = await Promise.all([helper.verifyAdMobSsvSignature(input), helper.verifyAdMobSsvSignature(input)]);
  assert.ok(results.every(result => result.ok));
  assert.equal((await helper.verifyAdMobSsvSignature(input)).ok, true);
  assert.equal(requests, 1);
  assert.equal((await helper.verifyAdMobSsvSignature({ ...input, canonicalQuery: signed.canonicalQuery + '&tampered=1' })).code, 'SSV_SIGNATURE_INVALID');
  assert.equal((await helper.verifyAdMobSsvSignature({ ...input, signature: 'invalid' })).code, 'SSV_SIGNATURE_INVALID');
});

test('SSV key rotation refreshes an older cache once without fetch loops for invalid keys', async () => {
  const signed = signedFixture();
  let now = 100_000;
  let requests = 0;
  const helper = loadModule('../server/api/_rewarded-ad.js', { 'node:crypto': crypto }, {
    Date: class extends Date { static now() { return now; } },
    fetch: async () => ({ ok: true, json: async () => ({ keys: [{ keyId: ++requests === 1 ? 1 : 2, pem: signed.pem }] }) }),
  });
  assert.equal((await helper.verifyAdMobSsvSignature({ ...signed, keyId: '1' })).ok, true);
  assert.equal((await helper.verifyAdMobSsvSignature({ ...signed, keyId: '2' })).code, 'SSV_KEY_NOT_FOUND');
  assert.equal(requests, 1);
  now += 61_000;
  assert.equal((await helper.verifyAdMobSsvSignature({ ...signed, keyId: '2' })).ok, true);
  assert.equal(requests, 2);
  assert.equal((await helper.verifyAdMobSsvSignature({ ...signed, keyId: '999' })).code, 'SSV_KEY_NOT_FOUND');
  assert.equal(requests, 2);
});

test('SSV key fetch timeout releases the shared task for the next callback', async () => {
  const signed = signedFixture();
  let hung = true;
  const helper = loadModule('../server/api/_rewarded-ad.js', { 'node:crypto': crypto }, {
    AbortSignal: { timeout: ms => { assert.equal(ms, 10_000); return AbortSignal.timeout(10); } },
    fetch: (_, init) => hung
      ? new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }))
      : Promise.resolve({ ok: true, json: async () => ({ keys: [{ keyId: 1, pem: signed.pem }] }) }),
  });
  const keepAlive = setTimeout(() => {}, 1_000);
  try {
    assert.equal((await helper.verifyAdMobSsvSignature({ ...signed, keyId: '1' })).code, 'SSV_KEY_FETCH_FAILED');
    hung = false;
    assert.equal((await helper.verifyAdMobSsvSignature({ ...signed, keyId: '1' })).ok, true);
  } finally { clearTimeout(keepAlive); }
});

test('transient SSV key errors return a retryable response without granting', async () => {
  let grants = 0;
  const handler = loadModule('../server/api/admob-reward-ssv.js', {
    './_cors.js': cors,
    './_supabase.js': { supabaseAdmin: { rpc() { grants++; } } },
    './_rewarded-ad.js': { ...rewardHelpers, verifyAdMobSsvSignature: async () => ({ ok: false, code: 'SSV_KEY_FETCH_FAILED' }) },
  }).default;
  const res = response();
  await handler({ method: 'GET', headers: {}, query: {
    custom_data: attemptId, transaction_id: 'txn', ad_unit: '6580197977', reward_item: 'rizz_credits', reward_amount: '5', signature: 'sig', key_id: '1',
  } }, res);
  assert.equal(res.statusCode, 503);
  assert.equal(grants, 0);
});

test('only a correctly signed SSV callback reaches the account grant RPC', async () => {
  const signed = signedFixture();
  const helper = loadModule('../server/api/_rewarded-ad.js', { 'node:crypto': crypto }, {
    fetch: async () => ({ ok: true, json: async () => ({ keys: [{ keyId: 1, pem: signed.pem }] }) }),
  });
  const grants = [];
  const handler = loadModule('../server/api/admob-reward-ssv.js', {
    './_cors.js': cors, './_rewarded-ad.js': helper,
    './_supabase.js': { supabaseAdmin: {
      from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: { id: attemptId, user_id: userId } }) }),
      rpc: async (name, params) => { grants.push({ name, params }); return { data: { status: 'granted' } }; },
    } },
  }).default;
  const rawQuery = signed.canonicalQuery + '&signature=' + signed.signature + '&key_id=1';
  const req = { method: 'GET', headers: {}, rawQuery, query: Object.fromEntries(new URLSearchParams(rawQuery)) };
  const res = response();
  await handler(req, res);
  assert.equal(res.body.status, 'granted');
  assert.equal(grants.length, 1);
  assert.equal(grants[0].name, 'admin_grant_rewarded_ad');
  assert.equal(grants[0].params.p_transaction_id, 'txn');
  assert.equal(grants[0].params.p_reward_amount, 5);
  await handler({ ...req, rawQuery: rawQuery + '&tampered=1' }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(grants.length, 1);
});

// Execute the actual App callbacks with controlled refs, network and SDK.
// This verifies orchestration without rendering unrelated screens or auth UI.
const appSource = source('../App.tsx');
const appAst = ts.createSourceFile('App.tsx', appSource, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function appCallback(name, context) {
  let callback;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(appAst) === name) callback = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(appAst);
  assert.ok(callback, `Missing App callback ${name}`);
  return vm.runInNewContext(compile('(' + callback.getText(appAst) + ')'), context);
}

function setupFlow(options = {}) {
  const guest = options.guest === true;
  const profile = { id: guest ? 'guest_user' : userId, credits: 0, is_premium: false };
  const state = { status: options.pending ? 'pending' : 'idle', loading: false, shows: 0, checks: 0, attempts: 0, toasts: [], storage: new Map() };
  let now = 100_000;
  const context = {
    console: quiet, Date: class extends Date { static now() { return now; } },
    profileRef: { current: profile }, isGuest: guest, isGuestRef: { current: guest },
    rewardedAdRequiredCredits: 1, rewardedAdStatus: state.status, showPremiumModal: false,
    rewardedAdAttemptRef: { current: options.pending ? attemptId : null },
    rewardedAdPreparationContextRef: { current: null }, rewardedAdPreparationPromiseRef: { current: null },
    rewardedAdIdentityVersionRef: { current: 1 }, rewardedAdInProgressRef: { current: false },
    REWARDED_STATUS_POLL_ATTEMPTS: 20, REWARDED_STATUS_POLL_WINDOW_MS: 30_000,
    canUseNativeAdMob: () => true, getAdId: () => 'reward-unit',
    setIsRewardedAdLoading: value => { state.loading = value; },
    setRewardedAdStatus: value => { state.status = value; },
    setShowCreditsExhaustedModal: () => {}, handleBackNavigation: () => {},
    setProfile: value => { state.profile = value; },
    localStorage: { setItem: (key, value) => state.storage.set(key, value) },
    showToast: (text, kind) => state.toasts.push({ text, kind }),
    createRewardedAdAttempt: async () => {
      state.attempts++;
      return { attemptId, expiresAt: new Date(now + 60_000).toISOString() };
    },
    getRewardedAdStatus: async () => {
      state.checks++;
      return options.status?.(context) ?? { status: 'granted', credits: 5 };
    },
    wait: async ms => { now += ms; await options.wait?.(context); },
    AdMobService: { showRewardVideo: async (_, ssv) => {
      state.shows++;
      state.ssv = ssv;
      return options.show?.(context) ?? true;
    } },
  };
  context.updateCredits = appCallback('updateCredits', context);
  context.getRewardedAdPreparationContext = appCallback('getRewardedAdPreparationContext', context);
  return { run: appCallback('handleWatchRewardedAd', context), state, context, advance: ms => { now += ms; } };
}

test('guests still earn and persist five local credits without account verification', async () => {
  const flow = setupFlow({ guest: true });
  await flow.run();
  assert.equal(flow.state.shows, 1);
  assert.equal(flow.state.ssv, undefined);
  assert.equal(flow.state.attempts, 0);
  assert.equal(flow.state.checks, 0);
  assert.equal(flow.state.profile.credits, 5);
  assert.equal(flow.state.storage.get('rizzmaster_guest_credits'), '5');
  assert.equal(flow.state.status, 'success');
  assert.equal(flow.state.loading, false);
});

test('an unfinished guest ad grants no credits', async () => {
  const flow = setupFlow({ guest: true, show: () => false });
  await flow.run();
  assert.equal(flow.context.profileRef.current.credits, 0);
  assert.equal(flow.state.storage.size, 0);
  assert.equal(flow.state.status, 'error');
});

test('a pending account reward can be checked without opening a second ad', async () => {
  const flow = setupFlow({ pending: true });
  await flow.run();
  assert.equal(flow.state.shows, 0);
  assert.equal(flow.state.attempts, 0);
  assert.equal(flow.state.checks, 1);
  assert.equal(flow.context.profileRef.current.credits, 5);
  assert.equal(flow.context.rewardedAdAttemptRef.current, null);
});

test('a delayed signed reward stays pending and keeps its attempt for rechecking', async () => {
  const flow = setupFlow({ status: () => ({ status: 'pending', credits: 0 }) });
  await flow.run();
  assert.equal(flow.state.shows, 1);
  assert.equal(flow.state.status, 'pending');
  assert.equal(flow.state.loading, false);
  assert.equal(flow.context.rewardedAdAttemptRef.current, attemptId);
  assert.equal(flow.context.profileRef.current.credits, 0);
});

test('account changes during an ad or verification cannot credit the new profile', async () => {
  const change = context => {
    context.profileRef.current = { id: 'other-account', credits: 9 };
    context.rewardedAdIdentityVersionRef.current++;
  };
  for (const options of [
    { show: context => { change(context); return true; } },
    { pending: true, status: context => { change(context); return { status: 'granted', credits: 5 }; } },
  ]) {
    const flow = setupFlow(options);
    await flow.run();
    assert.equal(flow.context.profileRef.current.credits, 9);
    assert.equal(flow.state.toasts.length, 0);
  }
});

test('slow verification failures stop automatic retries within the polling window', async () => {
  let flow;
  flow = setupFlow({ pending: true, status: () => {
    flow.advance(15_000);
    throw Object.assign(new Error('Timeout'), { status: 0 });
  } });
  await flow.run();
  assert.equal(flow.state.checks, 2);
  assert.equal(flow.state.status, 'pending');
  assert.equal(flow.state.loading, false);
});
