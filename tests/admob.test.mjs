import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTs(path, imports = {}, globals = {}) {
  const source = readFileSync(new URL(path, import.meta.url), 'utf8');
  const code = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = {
    exports: {}, require: name => {
      assert.ok(name in imports, `Unexpected import ${name}`);
      return imports[name];
    },
    console: { log() {}, warn() {}, error() {} },
    setTimeout, clearTimeout, Date, Promise,
    ...globals,
  };
  vm.runInNewContext(code, context, { filename: path });
  return context.exports;
}

const allowed = {
  status: 'NOT_REQUIRED', canRequestAds: true,
  isConsentFormAvailable: false, privacyOptionsRequirementStatus: 'NOT_REQUIRED',
};
const denied = { ...allowed, status: 'REQUIRED', canRequestAds: false };
const pending = () => new Promise(() => {});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

function setup(options = {}) {
  const calls = [];
  const listeners = new Map();
  const events = { Loaded: 'loaded', FailedToLoad: 'load-error', Showed: 'showed', Dismissed: 'dismissed', FailedToShow: 'show-error', Rewarded: 'rewarded' };
  const plugin = {
    requestConsentInfo: async () => {
      calls.push('consent-refresh');
      return options.refresh ? options.refresh() : allowed;
    },
    showConsentForm: async () => {
      calls.push('consent-form');
      return options.form ? options.form() : allowed;
    },
    initialize: async () => {
      calls.push('sdk-init');
      if (options.initialize) await options.initialize();
    },
    prepareRewardVideoAd: async params => {
      calls.push('reward-request');
      if (options.prepareReward) await options.prepareReward(params);
    },
    showRewardVideoAd: async () => { calls.push('reward-show'); return options.showReward ? options.showReward() : { amount: 5 }; },
    showPrivacyOptionsForm: async () => options.privacyForm?.(),
    addListener: async (event, listener) => {
      if (options.listener) return options.listener(event, listener);
      listeners.set(event, listener);
      return { remove: async () => { listeners.delete(event); } };
    },
  };
  const { AdMobService: service } = loadTs('../services/admobService.ts', {
    '@capacitor-community/admob': {
      AdMob: plugin,
      RewardAdPluginEvents: events,
      AdmobConsentDebugGeography: { EEA: 1, DISABLED: 0 },
    },
    './nativeCapabilities': { canUseNativeAdMob: () => options.native !== false },
    './adConsentState': { readNativeConsentInfo: async () => options.nativeConsent ? options.nativeConsent() : null },
  });
  service.CONSENT_REFRESH_TIMEOUT_MS = 10;
  service.NATIVE_CONSENT_TIMEOUT_MS = 10;
  service.INIT_WAIT_TIMEOUT_MS = 250;
  service.REWARDED_PREPARE_TIMEOUT_MS = 20;
  return { service, calls, listeners, plugin, events };
}

test('concurrent ad requests share consent gathering and SDK initialization', async () => {
  const { service, calls } = setup();
  assert.deepEqual(await Promise.all([
    service.prepareRewardVideo('reward'), service.prepareRewardVideo('reward'), service.initialize(),
  ]), [true, true, true]);
  assert.equal(calls.filter(call => call === 'consent-refresh').length, 1);
  assert.equal(calls.filter(call => call === 'sdk-init').length, 1);
  assert.equal(calls.filter(call => call === 'reward-request').length, 1);
});

test('fresh rewarded ads reuse their verified context, while expired ads reload once', async () => {
  const { service, calls, listeners } = setup();
  const ssv = { userId: 'user', customData: 'attempt' };
  assert.equal(await service.prepareRewardVideo('reward', ssv), true);
  assert.equal(await service.prepareRewardVideo('reward', { ...ssv }), true);
  assert.equal(calls.filter(call => call === 'reward-request').length, 1);
  assert.equal(listeners.size, 0, 'Loading uses its request-specific native promise');
  service.rewardVideoPreparedAt = Date.now() - 51 * 60 * 1000;
  assert.equal(await service.prepareRewardVideo('reward', ssv), true);
  assert.equal(calls.filter(call => call === 'reward-request').length, 2);
});

test('different reward contexts serialize their native loads and never share a ready cache', async () => {
  const finishes = [];
  const requests = [];
  const { service } = setup({ prepareReward: params => {
    requests.push(params.ssv.customData);
    return new Promise(resolve => finishes.push(resolve));
  } });
  service.REWARDED_PREPARE_TIMEOUT_MS = 250;
  const firstSsv = { userId: 'user', customData: 'first' };
  const secondSsv = { userId: 'user', customData: 'second' };
  const first = service.prepareRewardVideo('reward', firstSsv);
  while (!finishes.length) await delay(0);
  const second = service.prepareRewardVideo('reward', secondSsv);
  await delay(0);
  assert.deepEqual(requests, ['first']);
  finishes[0]();
  assert.equal(await first, true);
  while (finishes.length < 2) await delay(0);
  assert.equal(service.hasFreshRewardVideo('reward', firstSsv), false);
  assert.equal(service.hasFreshRewardVideo('reward', secondSsv), false);
  finishes[1]();
  assert.equal(await second, true);
  assert.equal(service.hasFreshRewardVideo('reward', secondSsv), true);
});

test('a stalled rewarded load releases the shared task and a later tap can retry', async () => {
  let hung = true;
  const { service, calls } = setup({ prepareReward: () => hung ? pending() : Promise.resolve() });
  service.REWARDED_PREPARE_TIMEOUT_MS = 5;
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(service.rewardVideoPromise, null);
  assert.equal(service.rewardVideoPreparing, false);
  hung = false;
  assert.equal(await service.prepareRewardVideo('reward'), true);
  assert.equal(calls.filter(call => call === 'reward-request').length, 2);
});

test('a late native load invalidates a newer cache for the same ad unit before reuse', async () => {
  let finishOld;
  let requests = 0;
  const { service } = setup({ prepareReward: () => ++requests === 1 ? new Promise(resolve => { finishOld = resolve; }) : Promise.resolve() });
  service.REWARDED_PREPARE_TIMEOUT_MS = 5;
  const newer = { userId: 'user', customData: 'newer' };
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(await service.prepareRewardVideo('reward', newer), true);
  finishOld();
  await delay(0);
  assert.equal(service.hasFreshRewardVideo('reward', newer), false);
  assert.equal(await service.prepareRewardVideo('reward', newer), true);
  assert.equal(requests, 3);
});

test('a newly loaded rewarded ad is shown on the next turn without an artificial delay', async () => {
  let finishLoad;
  const { service, calls, listeners } = setup({ prepareReward: () => new Promise(resolve => { finishLoad = resolve; }) });
  service.REWARDED_PREPARE_TIMEOUT_MS = 250;
  const show = service.showRewardVideo('reward');
  while (!finishLoad) await delay(0);
  finishLoad();
  await delay(0);
  assert.ok(calls.includes('reward-show'));
  assert.equal(await show, true);
  assert.equal(listeners.size, 0);
});

test('a preload for another context cannot replace the ad selected for a show', async () => {
  let finishShow;
  const { service, calls } = setup({ showReward: () => new Promise(resolve => { finishShow = resolve; }) });
  const selected = { userId: 'user', customData: 'selected' };
  await service.prepareRewardVideo('reward', selected);
  const show = service.showRewardVideo('reward', selected);
  while (!finishShow) await delay(0);
  assert.equal(await service.prepareRewardVideo('reward', { ...selected, customData: 'other' }), false);
  assert.equal(calls.filter(call => call === 'reward-request').length, 1);
  finishShow({ amount: 5 });
  assert.equal(await show, true);
});

test('asynchronous listener cleanup failures do not crash a completed rewarded show', async () => {
  const { service } = setup({ listener: async () => ({ remove: async () => { throw new Error('Bridge already closed'); } }) });
  assert.equal(await service.showRewardVideo('reward'), true);
  await delay(0);
});

test('a late show rejection cannot invalidate a newer rewarded cache', async () => {
  let rejectOldShow;
  const { service } = setup({ showReward: () => new Promise((_, reject) => { rejectOldShow = reject; }) });
  service.REWARDED_SHOW_TIMEOUT_MS = 15;
  assert.equal(await service.showRewardVideo('reward'), false);
  const newer = { userId: 'user', customData: 'newer' };
  assert.equal(await service.prepareRewardVideo('reward', newer), true);
  rejectOldShow(new Error('Old native show rejected late'));
  await delay(0);
  assert.equal(service.hasFreshRewardVideo('reward', newer), true);
});

test('a stale global load failure cannot cancel a currently showing rewarded ad', async () => {
  let finishShow;
  const { service, listeners, events } = setup({ showReward: () => new Promise(resolve => { finishShow = resolve; }) });
  const show = service.showRewardVideo('reward');
  while (!finishShow) await delay(0);
  listeners.get(events.FailedToLoad)?.({ message: 'Older request failed' });
  assert.equal(service.isRewardVideoShowing, true);
  finishShow({ amount: 5 });
  assert.equal(await show, true);
});

test('form failure allows requests only when current native UMP permission allows them', async () => {
  const { service, calls } = setup({
    refresh: () => ({ ...allowed, isConsentFormAvailable: true }),
    form: () => { throw new Error('Form download failed'); },
    nativeConsent: () => allowed,
  });
  assert.equal(await service.prepareRewardVideo('reward'), true);
  assert.ok(calls.includes('reward-request'));
});

test('a pre-form permission cannot override a current native denial', async () => {
  const { service, calls } = setup({
    refresh: () => ({ ...allowed, isConsentFormAvailable: true }),
    form: () => { throw new Error('Form failed after a changed choice'); },
    nativeConsent: () => denied,
  });
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(calls.includes('sdk-init'), false);
  assert.equal(calls.includes('reward-request'), false);
});

test('a failed refresh recovers using previous-session permission held by native UMP', async () => {
  const { service, calls } = setup({
    refresh: () => { throw new Error('Offline'); }, nativeConsent: () => allowed,
  });
  assert.equal(await service.prepareRewardVideo('reward'), true);
  assert.ok(calls.includes('reward-request'));
});

test('an older APK can recover a form failure through a fresh consent response', async () => {
  let refreshes = 0;
  const { service } = setup({
    refresh: () => ({ ...allowed, isConsentFormAvailable: ++refreshes === 1 }),
    form: () => { throw new Error('Form failed'); },
  });
  assert.equal(await service.prepareRewardVideo('reward'), true);
  assert.equal(refreshes, 2);
});

test('unverified or missing consent permission blocks rewarded requests', async () => {
  for (const refresh of [() => denied, () => ({ ...allowed, canRequestAds: undefined }), () => { throw new Error('Offline'); }]) {
    const { service, calls } = setup({ refresh });
    assert.equal(await service.prepareRewardVideo('reward'), false);
    assert.equal(calls.includes('sdk-init'), false);
    assert.equal(calls.includes('reward-request'), false);
  }
});

test('a native consent refresh that never settles does not lock future retries', async () => {
  let hung = true;
  const { service } = setup({ refresh: () => hung ? pending() : allowed });
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(service.initPromise, null);
  hung = false;
  assert.equal(await service.prepareRewardVideo('reward'), true);
});

test('a stalled SDK initialization releases the request and permits a retry', async () => {
  let hung = true;
  const { service, calls } = setup({ initialize: () => hung ? pending() : Promise.resolve() });
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(calls.includes('reward-request'), false);
  assert.equal(service.initPromise, null);
  hung = false;
  assert.equal(await service.prepareRewardVideo('reward'), true);
});

test('readiness timeout does not launch another form while the first is open', async () => {
  let dismiss;
  const { service, calls } = setup({
    refresh: () => ({ ...denied, isConsentFormAvailable: true }),
    form: () => new Promise(resolve => { dismiss = resolve; }),
  });
  service.INIT_WAIT_TIMEOUT_MS = 5;
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(calls.filter(call => call === 'consent-form').length, 1);
  dismiss(allowed);
  assert.equal(await service.initialize(), true);
});

test('privacy changes block pending requests and invalidate a cached permission', async () => {
  let dismiss;
  const { service, calls } = setup({
    nativeConsent: () => denied,
    privacyForm: () => new Promise(resolve => { dismiss = resolve; }),
  });
  assert.equal(await service.initialize(), true);
  service.privacyOptionsRequired = true;
  const privacy = service.showPrivacyOptionsForm();
  assert.equal(await service.prepareRewardVideo('reward'), false);
  dismiss();
  assert.equal(await privacy, false);
  assert.equal(service.canRequestAds, false);
  assert.equal(calls.includes('reward-request'), false);
});

test('an initialized SDK cannot bypass an in-flight consent form on a later refresh', async () => {
  let refreshing = false;
  let dismiss;
  const { service, calls } = setup({
    refresh: () => refreshing ? { ...allowed, isConsentFormAvailable: true } : allowed,
    form: () => new Promise(resolve => { dismiss = resolve; }),
  });
  assert.equal(await service.initialize(), true);
  service.canRequestAds = false;
  refreshing = true;
  service.INIT_WAIT_TIMEOUT_MS = 5;
  const retry = service.initialize();
  await delay(0);
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(calls.includes('reward-request'), false);
  dismiss(allowed);
  assert.equal(await retry, true);
});

test('show listener registration is bounded and late listeners are removed without registering more', async () => {
  let register;
  let removed = false;
  let registrations = 0;
  const { service, calls } = setup({ listener: () => { registrations++; return new Promise(resolve => { register = resolve; }); } });
  service.REWARDED_SHOW_TIMEOUT_MS = 5;
  assert.equal(await service.showRewardVideo('reward'), false);
  register({ remove: () => { removed = true; } });
  await delay(0);
  assert.equal(removed, true);
  assert.equal(registrations, 1);
  assert.equal(calls.includes('reward-request'), false);
});

test('a rewarded ad cannot appear after its show attempt timed out', async () => {
  const { service, calls } = setup({ prepareReward: () => delay(25) });
  service.REWARDED_PREPARE_TIMEOUT_MS = 100;
  service.REWARDED_SHOW_TIMEOUT_MS = 5;
  assert.equal(await service.showRewardVideo('reward'), false);
  await delay(40);
  assert.equal(calls.includes('reward-show'), false);
});

test('permission changing during loading prevents a late rewarded cache from becoming ready', async () => {
  let finish;
  const { service } = setup({ prepareReward: () => new Promise(resolve => { finish = resolve; }) });
  service.REWARDED_PREPARE_TIMEOUT_MS = 100;
  const prepare = service.prepareRewardVideo('reward');
  while (!finish) await delay(0);
  service.canRequestAds = false;
  service.invalidateRewardVideo();
  finish();
  assert.equal(await prepare, false);
  assert.equal(service.rewardVideoReady, false);
  assert.equal(service.rewardVideoPromise, null);
});

test('ordinary web or an APK without AdMob never invokes native ad APIs', async () => {
  const { service, calls } = setup({ native: false });
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(calls.length, 0);
});

test('remote and bundled UI both use native AdMob; a browser cannot use it', () => {
  for (const origin of ['https://rizzmaster.online', 'https://localhost']) {
    const { Capacitor } = loadTs('../node_modules/@capacitor/core/dist/index.js', {}, {
      androidBridge: {}, Capacitor: { PluginHeaders: [{ name: 'AdMob', methods: [] }] },
    });
    const capabilities = loadTs('../services/nativeCapabilities.ts', {
      '@capacitor/core': { Capacitor },
    }, { location: { origin } });
    assert.equal(capabilities.canUseNativeAdMob(), true, origin);
    assert.equal(capabilities.getNativeAdMobDiagnostics().uiOrigin, origin);
  }
  const { Capacitor } = loadTs('../node_modules/@capacitor/core/dist/index.js');
  const web = loadTs('../services/nativeCapabilities.ts', {
    '@capacitor/core': { Capacitor },
  });
  assert.equal(web.canUseNativeAdMob(), false);
});

const { ForegroundSessionClock } = loadTs('../services/foregroundSessionClock.ts');
test('foreground analytics counts each segment once and excludes background time', () => {
  const clock = new ForegroundSessionClock();
  clock.start(0);
  clock.start(1_000);
  assert.equal(clock.pause(2_000), 2_000);
  assert.equal(clock.pause(3_000), 0);
  clock.start(30_000);
  assert.equal(clock.pause(31_000), 1_000);
});

function setupBanner(options = {}) {
  const { service, calls, plugin } = setup(options);
  if (options.bannerTimeout !== undefined) {
    const nativeTimeout = service.withNativeTimeout.bind(service);
    service.withNativeTimeout = (label, promise, ms) => nativeTimeout(label, promise, label.startsWith('Banner ') ? options.bannerTimeout : ms);
  }
  const callbacks = new Map();
  const timers = new Map();
  const slots = [];
  let nextTimer = 1;
  const bannerEvents = { SizeChanged: 'banner-size', Loaded: 'banner-loaded', FailedToLoad: 'banner-failed', AdImpression: 'banner-impression' };
  plugin.addListener = async (event, callback) => {
    callbacks.set(event, callback);
    return { remove: async () => callbacks.delete(event) };
  };
  plugin.showBanner = async params => {
    assert.equal(slots.at(-1), 50, 'Top reservation must match the native banner height');
    assert.equal(params.adId, 'ca-app-pub-7381421031784616/7234804095');
    assert.equal(params.adSize, 'BANNER');
    assert.equal(params.position, 'TOP_CENTER');
    assert.equal(params.margin, options.requestMargins?.shift() ?? 72);
    assert.equal(params.isTesting, false);
    calls.push('banner-request');
    if (options.showBanner) await options.showBanner();
    if (!options.noLoad) {
      callbacks.get(bannerEvents.SizeChanged)?.({ width: 320, height: 50 });
      callbacks.get(bannerEvents.Loaded)?.();
    }
  };
  plugin.hideBanner = async () => calls.push('banner-hide');
  plugin.resumeBanner = async () => calls.push('banner-resume');
  plugin.removeBanner = async () => calls.push('banner-remove');
  const { NativeBannerController } = loadTs('../services/nativeBannerService.ts', {
    '@capacitor-community/admob': {
      AdMob: plugin, BannerAdPluginEvents: bannerEvents,
      BannerAdPosition: { TOP_CENTER: 'TOP_CENTER' }, BannerAdSize: { BANNER: 'BANNER' },
    },
    './admobService': { AdMobService: service },
    './nativeCapabilities': { canUseNativeAdMob: () => options.native !== false },
  }, {
    setTimeout: (callback, ms) => { const id = nextTimer++; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const controller = new NativeBannerController('ca-app-pub-7381421031784616/7234804095', 72, height => slots.push(height), () => {}, options.moveBanner);
  return { controller, service, calls, callbacks, slots, timers, bannerEvents };
}

test('banner and rewarded requests share a single consent and SDK initialization', async t => {
  const { controller, service, calls, timers } = setupBanner();
  t.after(() => controller.dispose());
  await Promise.all([controller.setMode('visible'), service.prepareRewardVideo('reward')]);
  assert.equal(calls.filter(call => call === 'consent-refresh').length, 1);
  assert.equal(calls.filter(call => call === 'sdk-init').length, 1);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.ok(calls.includes('reward-request'));
  assert.equal(timers.size, 0, 'A loaded banner must not retain its load watchdog');
});

test('modal and background suspension resumes a banner without a new request', async t => {
  const { controller, calls, slots } = setupBanner();
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  for (let i = 0; i < 3; i++) {
    await controller.setMode('hidden');
    assert.equal(slots.at(-1), 0);
    await controller.setMode('visible');
    assert.equal(slots.at(-1), 50);
  }
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal(calls.filter(call => call === 'banner-resume').length, 3);
});

test('premium or logout during slow consent prevents a late banner request', async t => {
  let resolveConsent;
  const { controller, calls } = setupBanner({ refresh: () => new Promise(resolve => { resolveConsent = resolve; }) });
  t.after(() => controller.dispose());
  const visible = controller.setMode('visible');
  await delay(0);
  const removed = controller.setMode('removed');
  resolveConsent(allowed);
  await Promise.all([visible, removed]);
  assert.equal(calls.includes('banner-request'), false);
  assert.ok(calls.includes('banner-remove'));
});

test('a hide arriving while a native banner is being created wins over the old show', async t => {
  let finishShow;
  const { controller, calls, slots } = setupBanner({ showBanner: () => new Promise(resolve => { finishShow = resolve; }) });
  t.after(() => controller.dispose());
  const show = controller.setMode('visible');
  while (!finishShow) await delay(0);
  const hide = controller.setMode('hidden');
  finishShow();
  await Promise.all([show, hide]);
  assert.equal(calls.at(-1), 'banner-hide');
  assert.equal(slots.at(-1), 0);
});

test('concurrent visibility updates do not duplicate a banner request', async t => {
  const { controller, calls } = setupBanner();
  t.after(() => controller.dispose());
  await Promise.all([controller.setMode('visible'), controller.setMode('visible'), controller.setMode('visible')]);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
});

test('consent denial blocks banners and logout cancels the retry', async t => {
  const { controller, calls, timers, slots } = setupBanner({ refresh: () => denied });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  assert.equal(calls.includes('banner-request'), false);
  assert.equal(slots.at(-1), 0);
  assert.equal(timers.size, 1);
  await controller.setMode('removed');
  assert.equal(timers.size, 0);
});

test('no-fill schedules one delayed retry and a later native success recovers', async t => {
  const { controller, calls, callbacks, bannerEvents, timers } = setupBanner();
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  callbacks.get(bannerEvents.FailedToLoad)({ code: 3 });
  assert.equal(timers.size, 1);
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  const [id, retry] = [...timers][0];
  assert.equal(retry.ms, 30_000);
  timers.delete(id);
  retry.callback();
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
  assert.equal(timers.size, 0);
});

test('a banner whose load callback never arrives is removed before retry', async t => {
  const { controller, calls, timers } = setupBanner({ noLoad: true });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  const [id, watchdog] = [...timers][0];
  assert.equal(watchdog.ms, 45_000);
  timers.delete(id);
  watchdog.callback();
  await controller.setMode('visible');
  assert.equal(calls.at(-1), 'banner-remove');
  assert.equal([...timers.values()][0].ms, 30_000);
});

test('browser sessions never reserve space or call native banner APIs', async () => {
  const { controller, calls, slots } = setupBanner({ native: false });
  await controller.setMode('visible');
  await controller.dispose();
  assert.deepEqual(calls, []);
  assert.deepEqual(slots, []);
});

test('a cached banner is destroyed when updated privacy permission blocks ads', async t => {
  let blocked = false;
  const { controller, service, calls, slots } = setupBanner({ refresh: () => blocked ? denied : allowed });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  await controller.setMode('hidden');
  blocked = true;
  service.canRequestAds = false;
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal(calls.includes('banner-resume'), false);
  assert.equal(calls.at(-1), 'banner-remove');
  assert.equal(slots.at(-1), 0);
});

test('an initial premium or logged-out state never initializes or requests ads', async () => {
  const { controller, calls } = setupBanner();
  await controller.setMode('removed');
  assert.equal(calls.includes('consent-refresh'), false);
  assert.equal(calls.includes('sdk-init'), false);
  assert.equal(calls.includes('banner-request'), false);
  await controller.dispose();
});

test('resizing moves the cached banner instead of loading another ad', async t => {
  const moved = [];
  const { controller, calls } = setupBanner({ moveBanner: async margin => { moved.push(margin); return true; } });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  await controller.setTopMargin(90);
  await controller.setTopMargin(90);
  assert.deepEqual(moved, [90]);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal(calls.filter(call => call === 'banner-resume').length, 1);
});

test('a size change while suspended does not display the banner until resuming', async t => {
  const moved = [];
  const { controller, calls } = setupBanner({ moveBanner: async margin => { moved.push(margin); return true; } });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  await controller.setMode('hidden');
  await controller.setTopMargin(90);
  assert.deepEqual(moved, []);
  assert.equal(calls.includes('banner-resume'), false);
  await controller.setMode('visible');
  assert.deepEqual(moved, [90]);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
});

test('a size change during native creation moves the view after creation settles', async t => {
  let finishShow;
  const moved = [];
  const { controller, calls } = setupBanner({
    showBanner: () => new Promise(resolve => { finishShow = resolve; }),
    moveBanner: async margin => { moved.push(margin); return true; },
  });
  t.after(() => controller.dispose());
  const show = controller.setMode('visible');
  while (!finishShow) await delay(0);
  const resize = controller.setTopMargin(90);
  finishShow();
  await Promise.all([show, resize]);
  assert.deepEqual(moved, [90]);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
});

test('another viewport change during native repositioning is applied before the queue settles', async t => {
  let finishMove;
  let moves = 0;
  const { controller, calls } = setupBanner({ moveBanner: () => ++moves === 1 ? new Promise(resolve => { finishMove = resolve; }) : Promise.resolve(true) });
  t.after(() => controller.dispose());
  await controller.setTopMargin(72, 392);
  await controller.setMode('visible');
  const resize = controller.setTopMargin(72, 872);
  while (!finishMove) await delay(0);
  const again = controller.setTopMargin(72, 940);
  finishMove(true);
  await Promise.all([resize, again]);
  assert.equal(moves, 2);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
});

test('APKs without native repositioning recreate only when the measured position changes', async t => {
  const { controller, calls } = setupBanner({ requestMargins: [72, 90] });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  await controller.setTopMargin(90);
  await controller.setTopMargin(90);
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
  assert.equal(calls.filter(call => call === 'banner-remove').length, 1);
});

test('banner placement converts CSS pixels and accounts for native origins once', async () => {
  const { calculateBannerMargin, getBannerPlacement } = loadTs('../services/bottomNavigationInset.ts', {
    '@capacitor/core': {
      Capacitor: { getPlatform: () => 'android', isPluginAvailable: () => true },
      registerPlugin: () => ({ getBannerGeometry: async () => ({ density: 2.75, webViewOffsetDp: -24, bottomInsetDp: 48, widthDp: 392, heightDp: 61 }) }),
    },
    './admobService': { AdMobService: { withNativeTimeout: async (_label, promise) => promise } },
    './nativeBannerService': { BANNER_HEIGHT: 50, BANNER_WIDTH: 320 },
  }, { window: { devicePixelRatio: 2.75, innerWidth: 392 } });
  assert.equal(calculateBannerMargin(69, 2.75, 2.75, 0), 69, 'Fullscreen Android has no extra status offset');
  assert.equal(calculateBannerMargin(93, 2.75, 2.75, -24), 69, 'Android 15 SDK-applied status inset is counted once');
  assert.equal(calculateBannerMargin(69, 3, 2, 0), 104, 'CSS and native densities can differ');
  const placement = await getBannerPlacement({ getBoundingClientRect: () => ({ top: 93 }) });
  assert.equal(placement.margin, 69);
  assert.equal(placement.bottomInsetCss, 48);
  assert.equal(placement.widthDp, 320, 'An older APK advertising adaptive geometry cannot enlarge the compact slot');
  assert.equal(placement.heightDp, 50);
  assert.equal(placement.viewportWidthDp, 392);
  assert.equal(placement.dpToCss, 1);
});

test('an older bridge falls back without negative offsets or preventing an ad request', async () => {
  const { getBannerPlacement, moveNativeBanner } = loadTs('../services/bottomNavigationInset.ts', {
    '@capacitor/core': {
      Capacitor: { getPlatform: () => 'android', isPluginAvailable: () => true },
      registerPlugin: () => ({ getBannerGeometry: async () => { throw new Error('Unimplemented'); }, setBannerPosition: async () => { throw new Error('Unimplemented'); } }),
    },
    './admobService': { AdMobService: { withNativeTimeout: async (_label, promise) => promise } },
    './nativeBannerService': { BANNER_HEIGHT: 50, BANNER_WIDTH: 320 },
  }, { window: { devicePixelRatio: 2.75, innerWidth: 392 } });
  const placement = await getBannerPlacement({ getBoundingClientRect: () => ({ top: 69 }) });
  assert.equal(placement.margin, 69);
  assert.equal(placement.widthDp, 320);
  assert.equal(placement.heightDp, 50, 'The compact slot needs no loaded-size event');
  assert.equal(await moveNativeBanner(69), false);
});

test('same-width keyboard viewport updates keep the compact banner visible without native calls', async t => {
  const { controller, calls } = setupBanner();
  t.after(() => controller.dispose());
  await controller.setTopMargin(72, 392);
  await controller.setMode('visible');
  calls.length = 0;
  for (let i = 0; i < 3; i++) {
    await controller.setTopMargin(72, 392);
    await controller.setMode('visible');
  }
  assert.equal(calls.some(call => call.startsWith('banner-')), false);
});

test('a real width change recenters the compact banner without requesting another ad', async t => {
  let moves = 0;
  const { controller, calls } = setupBanner({ moveBanner: async () => { moves++; return true; } });
  t.after(() => controller.dispose());
  await controller.setTopMargin(72, 392);
  await controller.setMode('visible');
  calls.length = 0;
  await controller.setTopMargin(72, 872);
  await controller.setTopMargin(72, 872);
  assert.equal(moves, 1);
  assert.equal(calls.includes('banner-remove'), false);
  assert.equal(calls.includes('banner-request'), false);
});

test('width changes during a modal recenter the cached banner only after the modal closes', async t => {
  let moves = 0;
  const { controller, calls } = setupBanner({ moveBanner: async () => { moves++; return true; } });
  t.after(() => controller.dispose());
  await controller.setTopMargin(72, 392);
  await controller.setMode('visible');
  await controller.setMode('hidden');
  calls.length = 0;
  await controller.setTopMargin(72, 872);
  assert.equal(moves, 0);
  assert.equal(calls.includes('banner-request'), false);
  await controller.setMode('visible');
  assert.equal(moves, 1);
  assert.equal(calls.includes('banner-request'), false);
});

test('a width change during native creation recenters the pending compact ad without replacing it', async t => {
  let finishShow;
  let first = true;
  const { controller, calls } = setupBanner({ moveBanner: async () => true, showBanner: () => {
    if (!first) return Promise.resolve();
    first = false;
    return new Promise(resolve => { finishShow = resolve; });
  } });
  t.after(() => controller.dispose());
  await controller.setTopMargin(72, 392);
  const show = controller.setMode('visible');
  while (!finishShow) await delay(0);
  const resize = controller.setTopMargin(72, 872);
  finishShow();
  await Promise.all([show, resize]);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
});

test('compact banner layout does not subscribe to SDK zero-size hide and removal events', async t => {
  const { controller, callbacks, bannerEvents, slots } = setupBanner();
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  assert.equal(callbacks.has(bannerEvents.SizeChanged), false);
  assert.equal(slots.at(-1), 50);
});

test('a hung banner bridge call releases the queue for logout and later retries', async t => {
  let hung = true;
  const { controller, calls, timers } = setupBanner({ bannerTimeout: 10, showBanner: () => hung ? pending() : Promise.resolve() });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  assert.equal(calls.at(-1), 'banner-remove');
  assert.equal([...timers.values()][0].ms, 30_000);
  await controller.setMode('removed');
  assert.equal(timers.size, 0);
  hung = false;
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
});
