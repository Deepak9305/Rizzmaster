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
    prepareRewardVideoAd: async () => {
      calls.push('reward-request');
      if (options.prepareReward) await options.prepareReward();
    },
    showRewardVideoAd: async () => { calls.push('reward-show'); return { amount: 5 }; },
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
  service.PREPARE_TIMEOUT_MS = 20;
  service.REWARDED_POST_PREPARE_SHOW_DELAY_MS = 0;
  service.REWARDED_PREPARE_TIMEOUT_MS = 20;
  return { service, calls, listeners, plugin };
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

test('listener registration is bounded and late listeners are removed', async () => {
  let register;
  let removed = false;
  const { service, calls } = setup({ listener: () => new Promise(resolve => { register = resolve; }) });
  service.REWARDED_PREPARE_TIMEOUT_MS = 5;
  assert.equal(await service.prepareRewardVideo('reward'), false);
  register({ remove: () => { removed = true; } });
  await delay(0);
  assert.equal(removed, true);
  assert.equal(calls.includes('reward-request'), false);
});

test('a rewarded ad cannot appear after its show attempt timed out', async () => {
  const { service, calls } = setup({ prepareReward: () => delay(25) });
  service.REWARDED_PREPARE_TIMEOUT_MS = 100;
  service.REWARDED_SHOW_TIMEOUT_MS = 5;
  service.REWARDED_POST_PREPARE_SHOW_DELAY_MS = 0;
  assert.equal(await service.showRewardVideo('reward'), false);
  await delay(40);
  assert.equal(calls.includes('reward-show'), false);
});

test('permission changing during listener registration prevents the actual request', async () => {
  let register;
  const { service, calls } = setup({ listener: () => new Promise(resolve => { register = resolve; }) });
  service.REWARDED_PREPARE_TIMEOUT_MS = 100;
  const prepare = service.prepareRewardVideo('reward');
  await delay(0);
  service.canRequestAds = false;
  register({ remove() {} });
  await delay(0);
  register({ remove() {} });
  assert.equal(await prepare, false);
  assert.equal(calls.includes('reward-request'), false);
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
  const callbacks = new Map();
  const timers = new Map();
  const slots = [];
  let nextTimer = 1;
  const bannerEvents = { Loaded: 'banner-loaded', FailedToLoad: 'banner-failed', AdImpression: 'banner-impression' };
  plugin.addListener = async (event, callback) => {
    callbacks.set(event, callback);
    return { remove: async () => callbacks.delete(event) };
  };
  plugin.showBanner = async params => {
    assert.equal(slots.at(-1), 122, 'Scroll room must include the banner, navigation inset, and safe gap');
    assert.equal(params.adId, 'ca-app-pub-7381421031784616/7234804095');
    assert.equal(params.adSize, 'BANNER');
    assert.equal(params.position, 'BOTTOM_CENTER');
    assert.equal(params.margin, 56);
    assert.equal(params.isTesting, false);
    calls.push('banner-request');
    if (options.showBanner) await options.showBanner();
    if (!options.noLoad) callbacks.get(bannerEvents.Loaded)?.();
  };
  plugin.hideBanner = async () => calls.push('banner-hide');
  plugin.resumeBanner = async () => calls.push('banner-resume');
  plugin.removeBanner = async () => calls.push('banner-remove');
  const { NativeBannerController } = loadTs('../services/nativeBannerService.ts', {
    '@capacitor-community/admob': {
      AdMob: plugin, BannerAdPluginEvents: bannerEvents,
      BannerAdPosition: { BOTTOM_CENTER: 'BOTTOM_CENTER' }, BannerAdSize: { BANNER: 'BANNER' },
    },
    './admobService': { AdMobService: service },
    './nativeCapabilities': { canUseNativeAdMob: () => options.native !== false },
  }, {
    setTimeout: (callback, ms) => { const id = nextTimer++; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const controller = new NativeBannerController('ca-app-pub-7381421031784616/7234804095', 56, height => slots.push(height), () => {});
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

test('keyboard, modal and background suspension resumes a banner without a new request', async t => {
  const { controller, calls, slots } = setupBanner();
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  for (let i = 0; i < 3; i++) {
    await controller.setMode('hidden');
    assert.equal(slots.at(-1), 0);
    await controller.setMode('visible');
    assert.equal(slots.at(-1), 122);
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
