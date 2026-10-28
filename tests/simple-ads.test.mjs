import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { isUuid, normalizeRequiredCredits } from '../server/api/_rewarded-ad.js';

const flush = async () => { for (let i = 0; i < 100; i++) await Promise.resolve(); };
function load(path, imports, globals = {}) {
  const context = { exports: {}, console: { info() {}, warn() {}, error() {} }, setTimeout, clearTimeout, Date, Promise,
    require: name => { assert.ok(name in imports, name); return imports[name]; }, ...globals };
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
  return context.exports;
}
function setup() {
  let time = 1000, seq = 0, foreground, nativeState, resolveShow;
  const timers = new Map(), events = new Map(), calls = [], counters = [];
  const state = { canRequestAds: true, sdkReady: true, privacyOptionsRequired: false, busy: false, formOpen: false };
  const clock = { Date: class extends Date { static now() { return time; } },
    setTimeout: (fn, ms) => { const id = ++seq; timers.set(id, { fn, at: time + ms }); return id; }, clearTimeout: id => timers.delete(id) };
  const plugin = {
    prepareRewardVideoAd: async () => { calls.push('load'); },
    showRewardVideoAd: () => { calls.push('show'); events.get('showed')?.(); return new Promise(resolve => { resolveShow = resolve; }); },
    showBanner: async () => { calls.push('banner'); }, hideBanner: async () => { calls.push('hide'); },
    resumeBanner: async () => { calls.push('resume'); }, removeBanner: async () => { calls.push('remove'); },
    addListener: async (name, fn) => { events.set(name, fn); return { remove: async () => { if (events.get(name) === fn) events.delete(name); } }; },
  };
  const startup = { start: async () => state, getState: async () => state, showPrivacyOptions: async () => ({ ...state, formOpen: true }),
    addListener: async (_, fn) => { nativeState = fn; return { remove: async () => {} }; },
    getPresentationState: async () => { throw new Error('Original APK: method unavailable'); } };
  const imports = {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true }, registerPlugin: () => startup },
    '@capacitor-community/admob': { AdMob: plugin, RewardAdPluginEvents: { Showed: 'showed', Rewarded: 'earned', Dismissed: 'closed', FailedToShow: 'show-error' },
      BannerAdPluginEvents: { Loaded: 'banner-loaded', FailedToLoad: 'banner-error', AdImpression: 'banner-impression' }, BannerAdSize: { BANNER: 'small', ADAPTIVE_BANNER: 'adaptive' }, BannerAdPosition: { TOP_CENTER: 'top' } },
    './bannerLifecycle': { observeBannerForeground: fn => { foreground = fn; fn(true); return () => {}; } },
    './adDiagnostics': { recordAdEvent: name => counters.push(name), getAdDeliveryDiagnostics: () => ({}) },
  };
  const { SimpleAds: ads, rewardFailureMessage } = load('../services/simpleAds.ts', imports, clock);
  const runtime = ads.startRuntime(true);
  return { ads, runtime, plugin, startup, state, calls, events, counters, clock, rewardFailureMessage,
    earn: (info = { amount: 1 }) => { events.get('earned')?.(info); resolveShow?.(info); },
    foreground: value => foreground(value), stateEvent: value => nativeState(value),
    advance: async ms => {
      time += ms;
      for (const [id, timer] of [...timers]) if (timer.at <= time) { timers.delete(id); timer.fn(); }
      await flush();
    },
    banner: () => { const { SimpleBannerController } = load('../services/simpleBanner.ts', { ...imports, './simpleAds': { SimpleAds: ads, bounded: ads.withNativeTimeout } }, clock);
      return new SimpleBannerController('banner', 60, () => {}, () => {}, async () => true); },
  };
}

test('new flow waits for native SDK completion and obeys UMP denial', async () => {
  const s = setup(); await flush();
  s.stateEvent({ ...s.state, sdkReady: false, canRequestAds: false });
  s.ads.setRewardEligibility('reward', () => true); await flush();
  assert.equal(s.calls.includes('load'), false);
  s.stateEvent(s.state); await flush();
  assert.equal(s.calls.filter(x => x === 'load').length, 1);
  assert.equal(s.ads.getDeliveryDiagnostics().rewardImpressions.startsWith('unavailable'), true);
  s.runtime.stop();
});
test('one low-credit preload is reused and expires after 55 minutes', async () => {
  const s = setup(); await flush(); s.ads.setRewardEligibility('reward', () => true); await flush();
  await s.ads.prepareRewardVideo('reward');
  assert.equal(s.calls.filter(x => x === 'load').length, 1);
  await s.advance(54 * 60000); assert.equal(s.calls.filter(x => x === 'load').length, 1);
  await s.advance(60000); assert.equal(s.calls.filter(x => x === 'load').length, 2);
  s.runtime.stop();
});
test('explicit watch waits for SDK completion, joins preload, and grants once after the ad', async () => {
  const s = setup(); await flush(); let awards = 0;
  Object.assign(s.state, { sdkReady: false, canRequestAds: false });
  s.stateEvent(s.state);
  s.ads.setRewardEligibility('reward', () => true);
  const show = s.ads.showRewardVideo('reward', undefined, undefined, () => awards++);
  await flush(); assert.deepEqual(s.calls, []);
  // A required form opening must not cancel the user's request while it waits.
  s.stateEvent({ ...s.state, formOpen: true }); await flush();
  assert.deepEqual(s.calls, []);
  Object.assign(s.state, { sdkReady: true, canRequestAds: true, formOpen: false });
  s.stateEvent(s.state); await flush();
  assert.equal(s.calls.filter(x => x === 'load').length, 1);
  assert.equal(s.calls.filter(x => x === 'show').length, 1);
  s.earn(); await flush(); s.events.get('closed')(); await s.advance(5000);
  assert.equal(await show, true); assert.equal(awards, 1); s.runtime.stop();
});
test('readiness timeout, denial, background, offline and account changes do not show an ad', async () => {
  for (const cancel of ['timeout', 'background', 'offline', 'account']) {
    const s = setup(); await flush();
    Object.assign(s.state, { sdkReady: false, canRequestAds: false }); s.stateEvent(s.state);
    const baseline = s.ads.listeners.size;
    const show = s.ads.showRewardVideo('reward'); await flush();
    if (cancel === 'timeout') await s.advance(45000);
    if (cancel === 'background') s.foreground(false);
    if (cancel === 'offline') s.runtime.setOnline(false);
    if (cancel === 'account') s.ads.invalidateRewardVideo();
    assert.equal(await show, false);
    assert.equal(s.ads.listeners.size, baseline);
    Object.assign(s.state, { sdkReady: true, canRequestAds: true }); s.stateEvent(s.state); await flush();
    assert.equal(s.calls.includes('show'), false); s.runtime.stop();
  }
});
test('explicit watch respects failed-load retry deadline and never awards for no fill', async () => {
  const s = setup(); await flush(); let awards = 0;
  s.plugin.prepareRewardVideoAd = async () => { s.calls.push('load'); throw new Error('no fill'); };
  assert.equal(await s.ads.showRewardVideo('reward', undefined, undefined, () => awards++), false);
  assert.equal(await s.ads.showRewardVideo('reward'), false);
  assert.equal(s.calls.filter(x => x === 'load').length, 1);
  await s.advance(60000);
  assert.equal(await s.ads.showRewardVideo('reward'), false);
  assert.equal(s.calls.filter(x => x === 'load').length, 2);
  assert.equal(awards, 0); assert.equal(s.calls.includes('show'), false); s.runtime.stop();
});
test('account change immediately after a watch tap cancels before requesting an ad', async () => {
  const s = setup(); await flush();
  const show = s.ads.showRewardVideo('reward');
  s.ads.invalidateRewardVideo();
  assert.equal(await show, false); assert.deepEqual(s.calls, []); s.runtime.stop();
});
test('failed preloads retry once per minute and pause in background', async () => {
  const s = setup(); await flush(); s.plugin.prepareRewardVideoAd = async () => { s.calls.push('load'); throw new Error('no fill'); };
  s.ads.setRewardEligibility('reward', () => true); await flush();
  await s.advance(59000); assert.equal(s.calls.length, 1);
  s.foreground(false); await s.advance(5000); assert.equal(s.calls.length, 1);
  s.foreground(true); await flush(); assert.equal(s.calls.length, 2);
  s.runtime.stop();
});
test('load timeout never permits a second native load, late callback is invalidated on identity change', async () => {
  const s = setup(); await flush(); let finish;
  s.plugin.prepareRewardVideoAd = () => { s.calls.push('load'); return new Promise(resolve => { finish = resolve; }); };
  const first = s.ads.prepareRewardVideo('reward'); await flush();
  await s.advance(35000); assert.equal(await first, false);
  const second = s.ads.prepareRewardVideo('reward'); await flush();
  assert.equal(s.calls.filter(x => x === 'load').length, 1);
  s.ads.invalidateRewardVideo(); finish(); await flush(); assert.equal(await second, false);
  assert.equal(s.ads.hasFreshRewardVideo(), false); s.runtime.stop();
});
test('reward callback and resolved promise grant once; showing keeps its lock until dismissal', async () => {
  const s = setup(); await flush(); let resolveShow, awards = 0;
  s.plugin.showRewardVideoAd = () => { s.calls.push('show'); s.events.get('showed')(); return new Promise(resolve => { resolveShow = resolve; }); };
  const show = s.ads.showRewardVideo('reward', undefined, undefined, () => awards++); await flush();
  s.events.get('earned')({ amount: 1 }); resolveShow({ amount: 1 }); await flush();
  assert.equal(awards, 1); assert.equal(s.ads.isRewardVideoShowing, true);
  await s.advance(100000); assert.equal(s.ads.isRewardVideoShowing, true);
  assert.equal(await s.ads.showRewardVideo('reward'), false);
  s.events.get('closed')(); await s.advance(5000); assert.equal(await show, true);
  assert.equal(s.ads.isRewardVideoShowing, false); s.runtime.stop();
});
test('dismissal without earned callback and a show timeout award no credits', async () => {
  const s = setup(); await flush(); let awards = 0;
  s.plugin.showRewardVideoAd = () => new Promise(() => {});
  const show = s.ads.showRewardVideo('reward', undefined, undefined, () => awards++); await flush();
  await s.advance(40000); assert.equal(await show, false); assert.equal(awards, 0);
  assert.equal(s.ads.isRewardVideoShowing, true);
  s.events.get('closed')(); await flush(); await s.advance(5000);
  assert.equal(s.ads.isRewardVideoShowing, false); s.runtime.stop();
});
test('late native completion survives dismissal cleanup and awards the original viewing only once', async () => {
  const s = setup(); await flush(); let credits = 0;
  const show = s.ads.showRewardVideo('reward', undefined, undefined, () => credits += 5); await flush();
  s.events.get('closed')(); await s.advance(5000);
  assert.equal(await show, false); assert.equal(s.ads.isRewardVideoShowing, false);
  s.earn(); await flush(); assert.equal(credits, 5);
  s.earn(); await flush(); assert.equal(credits, 5); s.runtime.stop();
});
test('a late reward from an older viewing cannot credit the current viewing through global events', async () => {
  const s = setup(); await flush(); let oldCredits = 0, newCredits = 0, finishOld;
  s.plugin.showRewardVideoAd = () => { s.events.get('showed')(); return new Promise(resolve => { finishOld = resolve; }); };
  const old = s.ads.showRewardVideo('reward', undefined, undefined, () => oldCredits += 5); await flush();
  s.events.get('closed')(); await s.advance(5000); await old;
  s.plugin.showRewardVideoAd = () => { s.events.get('showed')(); return new Promise(() => {}); };
  const current = s.ads.showRewardVideo('reward', undefined, undefined, () => newCredits += 5); await flush();
  s.events.get('earned')({ amount: 1 }); finishOld({ amount: 1 }); await flush();
  assert.equal(oldCredits, 5); assert.equal(newCredits, 0);
  s.events.get('closed')(); await s.advance(5000); await current; s.runtime.stop();
});
test('account changes reject late earned callbacks but consent/cache changes do not erase earned rewards', async () => {
  for (const accountChanged of [false, true]) {
    const s = setup(); await flush(); let credits = 0;
    const show = s.ads.showRewardVideo('reward', undefined, undefined, () => credits += 5); await flush();
    s.events.get('closed')(); await s.advance(5000); await show;
    s.ads.invalidateRewardVideo(accountChanged); s.earn(); await flush();
    assert.equal(credits, accountChanged ? 0 : 5); s.runtime.stop();
  }
});
test('native-confirmed stable host return releases a missing-dismissal lock; later watch can show', async () => {
  const s = setup(); await flush(); let interactive = false, checks = 0;
  s.stateEvent({ ...s.state, presentationRecovery: true });
  s.startup.getPresentationState = async () => { checks++; return { hostInteractive: interactive }; };
  const show = s.ads.watchRewardVideo('reward'); await flush();
  s.foreground(false); interactive = true; s.foreground(true); await flush();
  await s.advance(4999); assert.equal(s.ads.isRewardVideoShowing, true);
  await s.advance(1000);
  assert.equal((await show).reason, 'closed-without-reward');
  assert.equal(s.ads.isRewardVideoShowing, false); assert.ok(checks >= 2);
  interactive = false;
  const next = s.ads.showRewardVideo('reward'); await flush();
  assert.equal(s.calls.filter(x => x === 'show').length, 2);
  s.events.get('show-error')({ code: 1 }); await next; s.runtime.stop();
});
test('pod transitions, background time, and bridge errors never release an ad still on screen', async () => {
  const s = setup(); await flush(); let interactive = false, bridgeFails = false, credits = 0;
  s.stateEvent({ ...s.state, presentationRecovery: true });
  s.startup.getPresentationState = async () => { if (bridgeFails) throw Error('bridge busy'); return { hostInteractive: interactive }; };
  const show = s.ads.showRewardVideo('reward', undefined, undefined, () => credits += 5); await flush();
  // Misleading dismissal during a pod transition, with SDK fullscreen still present.
  s.events.get('closed')(); await flush(); await s.advance(60000);
  assert.equal(s.ads.isRewardVideoShowing, true);
  interactive = true; await s.advance(1000); // brief return between segments
  interactive = false; s.events.get('showed')(); await flush(); await s.advance(60000);
  assert.equal(s.ads.isRewardVideoShowing, true);
  s.foreground(false); interactive = true; await s.advance(60000);
  bridgeFails = true; s.foreground(true); await flush(); await s.advance(10000);
  assert.equal(s.ads.isRewardVideoShowing, true);
  bridgeFails = false; interactive = false; await s.advance(1000);
  s.earn(); await flush(); assert.equal(credits, 5);
  interactive = true; s.events.get('closed')(); await flush(); await s.advance(5000);
  assert.equal(await show, true); s.runtime.stop();
});
test('failure results distinguish a busy ad, failed-load cooldown, offline, and a real show error', async () => {
  const s = setup(); await flush();
  const show = s.ads.watchRewardVideo('reward'); await flush();
  const busy = await s.ads.watchRewardVideo('reward'); assert.equal(busy.reason, 'busy');
  assert.doesNotMatch(s.rewardFailureMessage(busy), /could not load/);
  s.events.get('show-error')({ code: 1 }); assert.equal((await show).reason, 'show-failed');
  s.runtime.setOnline(false); assert.equal((await s.ads.watchRewardVideo('reward')).reason, 'offline');
  s.runtime.setOnline(true); await flush();
  s.plugin.prepareRewardVideoAd = async () => { throw { code: 3 }; };
  const cooldown = await s.ads.watchRewardVideo('reward');
  assert.equal(cooldown.reason, 'retry-wait'); assert.equal(cooldown.retryAfterSeconds, 60); s.runtime.stop();
});
test('banner reuses loaded view through keyboard-like geometry updates and suspension; refresh failure recreates after 60 seconds', async () => {
  const s = setup(); await flush(); const banner = s.banner();
  await banner.setMode('visible'); s.events.get('banner-loaded')(); await flush();
  await banner.setTopMargin(60); await banner.setMode('hidden'); await banner.setMode('visible');
  assert.equal(s.calls.filter(x => x === 'banner').length, 1);
  s.events.get('banner-error')(); await s.advance(59000); assert.equal(s.calls.filter(x => x === 'banner').length, 1);
  await s.advance(1000); assert.equal(s.calls.filter(x => x === 'banner').length, 2);
  await banner.dispose(); s.runtime.stop();
});
test('privacy revocation removes banner and discards cached reward', async () => {
  const s = setup(); await flush(); const banner = s.banner(); await banner.setMode('visible');
  await s.ads.prepareRewardVideo('reward');
  s.stateEvent({ ...s.state, canRequestAds: false }); await flush();
  assert.equal(s.ads.hasFreshRewardVideo(), false); assert.ok(s.calls.includes('remove'));
  await banner.dispose(); s.runtime.stop();
});

function claimsSetup(account = 'account-a', fetcher = async () => ({ ok: true, json: async () => ({ status: 'granted', credits: 5 }) })) {
  const storage = new Map();
  const context = { session: { user: { id: account }, access_token: 'token' }, calls: 0 };
  const service = load('../services/rewardClaims.ts', {
    './supabaseClient': { supabase: { auth: { getSession: async () => ({ data: { session: context.session } }) } } },
    './runtimeConfig': { getApiUrl: x => x }, './simpleAds': { bounded: async (_, promise) => promise },
  }, { AbortController, localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
    fetch: async (...args) => { context.calls++; return fetcher(...args); } });
  return { service, context, storage };
}
test('claims persist through server failure and only clear after confirmed grant', async () => {
  let online = false;
  const s = claimsSetup('account-a', async () => { if (!online) throw new Error('offline'); return { ok: true, json: async () => ({ status: 'granted', credits: 5 }) }; });
  const claim = { claimId: 'claim', requiredCredits: 1 };
  s.service.saveEarnedClaim('account-a', claim);
  assert.equal((await s.service.submitEarnedClaim('account-a', claim)).status, 'pending');
  assert.equal(s.service.readEarnedClaims('account-a').length, 1);
  online = true; assert.equal((await s.service.recoverEarnedClaims('account-a', () => true)).status, 'granted');
  assert.equal(s.service.readEarnedClaims('account-a').length, 0);
});
test('claims never cross accounts and duplicate in-flight submissions share one request', async () => {
  const s = claimsSetup(); const claim = { claimId: 'claim', requiredCredits: 1 };
  s.service.saveEarnedClaim('account-a', claim);
  s.context.session.user.id = 'account-b';
  assert.equal((await s.service.submitEarnedClaim('account-a', claim)).status, 'pending'); assert.equal(s.context.calls, 0);
  s.context.session.user.id = 'account-a';
  await Promise.all([s.service.submitEarnedClaim('account-a', claim), s.service.submitEarnedClaim('account-a', claim)]);
  assert.equal(s.context.calls, 1);
});

test('claim API takes the authenticated account, ignores requested reward amounts, and rejects invalid requests', async () => {
  const calls = [];
  const handler = load('../server/api/rewarded-ad-claim.js', {
    './_cors.js': { applyCors: () => false },
    './_rewarded-ad.js': { isUuid, normalizeRequiredCredits },
    './_supabase.js': { getBearerToken: req => req.headers.authorization,
      getAuthenticatedUser: async () => ({ user: { id: 'authenticated-account' } }),
      supabaseAdmin: { rpc: async (name, params) => { calls.push({ name, params }); return { data: { status: 'granted', credits: 5 } }; } } },
  }).default;
  const response = () => ({ statusCode: 0, body: null, status(n) { this.statusCode = n; }, setHeader() {}, send(body) { this.body = JSON.parse(body); } });
  const req = { method: 'POST', headers: { authorization: 'valid' }, body: { claimId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', requiredCredits: 1, userId: 'victim', amount: 1000 } };
  const res = response(); await handler(req, res);
  assert.equal(res.statusCode, 200); assert.equal(calls[0].params.p_user_id, 'authenticated-account');
  assert.equal(Object.keys(calls[0].params).length, 3);
  await handler({ ...req, headers: {} }, res); assert.equal(res.statusCode, 401);
  await handler({ ...req, body: { ...req.body, requiredCredits: 3 } }, res); assert.equal(res.statusCode, 400);
  assert.equal(calls.length, 1);
});

function appFlow({ guest = false, pending = false, earns = true, simple = true, switched = false, shown = false } = {}) {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => { if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'handleWatchRewardedAd') callback = node.initializer.arguments[0].getText(ast); ts.forEachChild(node, visit); };
  visit(ast);
  const user = { id: guest ? 'guest_user' : 'account-a', credits: 0, is_premium: false };
  const messages = setup(); messages.runtime.stop();
  const state = { shows: 0, saves: 0, submits: 0, legacy: 0, status: 'idle', credited: 0, loading: false, toasts: [], closes: 0 };
  const context = {
    usesSimpleAds: () => simple, handleWatchLegacyRewardedAd: async () => { state.legacy++; },
    profileRef: { current: user }, rewardedAdInProgressRef: { current: false }, rewardedAdIdentityVersionRef: { current: 1 },
    rewardedAdRequiredCredits: 1, showPremiumModal: false, handleBackNavigation() {},
    readEarnedClaims: () => pending ? [{ claimId: 'saved', requiredCredits: 1 }] : [],
    saveEarnedClaim: account => { state.saves++; assert.equal(account, 'account-a'); },
    submitEarnedClaim: async account => { state.submits++; assert.equal(account, 'account-a'); return { status: 'granted', credits: 5 }; },
    setIsRewardedAdLoading: value => { state.loading = value; }, setRewardedAdStatus: value => { state.status = value; },
    setShowCreditsExhaustedModal: () => { state.closes++; }, setProfile: profile => { state.credited = profile.credits; }, showToast: message => state.toasts.push(message),
    updateCredits: updater => { state.credited = updater(user.credits); }, getAdId: () => 'reward',
    crypto: { randomUUID: () => 'new-claim' },
    rewardFailureMessage: messages.rewardFailureMessage,
    SimpleAds: { watchRewardVideo: async (_id, _ssv, _onShow, onEarned) => {
      state.shows++;
      if (switched) { context.rewardedAdIdentityVersionRef.current++; context.profileRef.current = { id: 'account-b' }; }
      if (earns) onEarned();
      return { earned: earns, reason: earns ? undefined : shown ? 'closed-without-reward' : 'load-failed' };
    } },
  };
  const run = vm.runInNewContext(ts.transpileModule(`exports.run = ${callback}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText + '\nexports.run;', { exports: {}, ...context });
  return { run, state, context };
}
test('actual App action credits guests locally and accounts through one saved claim after earning', async () => {
  for (const guest of [true, false]) {
    const flow = appFlow({ guest }); await flow.run();
    assert.equal(flow.state.credited, 5); assert.equal(flow.state.shows, 1); assert.equal(flow.state.status, 'success');
    assert.equal(flow.state.saves, guest ? 0 : 1); assert.equal(flow.state.submits, guest ? 0 : 1);
  }
});
test('actual App saves earned credits immediately but defers success navigation until the fullscreen session ends', async () => {
  const flow = appFlow(); let finish;
  flow.context.SimpleAds.isRewardVideoShowing = true;
  flow.context.SimpleAds.watchRewardVideo = async (_id, _ssv, _onShow, onEarned) => {
    onEarned(); return new Promise(resolve => { finish = resolve; });
  };
  const run = flow.run(); await flush();
  assert.equal(flow.state.credited, 5); assert.equal(flow.state.saves, 1);
  assert.equal(flow.state.closes, 0); assert.equal(flow.state.loading, true);
  flow.context.SimpleAds.isRewardVideoShowing = false; finish({ earned: true }); await run;
  assert.equal(flow.state.closes, 1); assert.equal(flow.state.status, 'success');
});
test('actual App action retries a saved reward before showing another ad; cancellation/account switching grants nothing', async () => {
  const pending = appFlow({ pending: true }); await pending.run(); assert.equal(pending.state.shows, 0); assert.equal(pending.state.credited, 5);
  for (const options of [{ earns: false }, { switched: true }]) {
    const flow = appFlow(options); await flow.run(); assert.equal(flow.state.credited, 0); assert.equal(flow.state.submits, 0);
  }
  const legacy = appFlow({ simple: false }); await legacy.run(); assert.equal(legacy.state.legacy, 1); assert.equal(legacy.state.shows, 0);
});
test('actual App distinguishes load failure from a displayed ad closed without reward', async () => {
  const unavailable = appFlow({ earns: false }); await unavailable.run();
  assert.match(unavailable.state.toasts.at(-1), /could not load/);
  assert.doesNotMatch(unavailable.state.toasts.at(-1), /without earning|did not earn/);
  const closed = appFlow({ earns: false, shown: true }); await closed.run();
  assert.match(closed.state.toasts.at(-1), /ended without confirming/);
  assert.equal(closed.state.credited, 0); assert.equal(unavailable.state.credited, 0);
});
test('actual App Back handler leaves SDK-owned fullscreen sessions alone', async () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let callback;
  const visit = node => {
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'CapacitorApp.addListener' && node.arguments[0]?.getText(ast) === "'backButton'") callback = node.arguments[1].getText(ast);
    ts.forEachChild(node, visit);
  };
  visit(ast); assert.ok(callback);
  const state = { closes: 0, showing: true };
  const context = { AdMobService: { get isRewardVideoShowing() { return state.showing; } },
    document: { querySelector: () => null }, stateRef: { current: { currentView: 'HOME', showCreditsExhaustedModal: true } },
    setShowCreditsExhaustedModal: () => { state.closes++; } };
  const run = vm.runInNewContext(ts.transpileModule(`exports.run = ${callback}`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText + '\nexports.run;', { exports: {}, ...context });
  run({ canGoBack: true }); assert.equal(state.closes, 0);
  state.showing = false; run({ canGoBack: true }); assert.equal(state.closes, 1);
});
