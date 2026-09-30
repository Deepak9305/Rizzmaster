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
    prepareInterstitial: async () => {
      calls.push('interstitial-request');
      if (options.prepare) await options.prepare();
    },
    prepareRewardVideoAd: async () => {
      calls.push('reward-request');
      if (options.prepareReward) await options.prepareReward();
    },
    showInterstitial: async () => { calls.push('interstitial-show'); },
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
      InterstitialAdPluginEvents: events,
      RewardAdPluginEvents: events,
      RewardInterstitialAdPluginEvents: events,
      AdmobConsentDebugGeography: { EEA: 1, DISABLED: 0 },
    },
    './nativeCapabilities': { canUseNativeAdMob: () => options.native !== false },
    './adConsentState': { readNativeConsentInfo: async () => options.nativeConsent ? options.nativeConsent() : null },
  });
  service.CONSENT_REFRESH_TIMEOUT_MS = 10;
  service.NATIVE_CONSENT_TIMEOUT_MS = 10;
  service.INIT_WAIT_TIMEOUT_MS = 50;
  service.PREPARE_TIMEOUT_MS = 20;
  service.INTERSTITIAL_SHOW_TIMEOUT_MS = 10;
  service.POST_PREPARE_SHOW_DELAY_MS = 0;
  return { service, calls, listeners };
}

test('concurrent ad requests share consent gathering and SDK initialization', async () => {
  const { service, calls } = setup();
  assert.deepEqual(await Promise.all([
    service.prepareInterstitial('interstitial'), service.prepareRewardVideo('reward'), service.initialize(),
  ]), [true, true, true]);
  assert.equal(calls.filter(call => call === 'consent-refresh').length, 1);
  assert.equal(calls.filter(call => call === 'sdk-init').length, 1);
  assert.ok(calls.includes('interstitial-request'));
  assert.ok(calls.includes('reward-request'));
});

test('form failure allows requests only when current native UMP permission allows them', async () => {
  const { service, calls } = setup({
    refresh: () => ({ ...allowed, isConsentFormAvailable: true }),
    form: () => { throw new Error('Form download failed'); },
    nativeConsent: () => allowed,
  });
  assert.equal(await service.prepareInterstitial('interstitial'), true);
  assert.ok(calls.includes('interstitial-request'));
});

test('a pre-form permission cannot override a current native denial', async () => {
  const { service, calls } = setup({
    refresh: () => ({ ...allowed, isConsentFormAvailable: true }),
    form: () => { throw new Error('Form failed after a changed choice'); },
    nativeConsent: () => denied,
  });
  assert.equal(await service.prepareInterstitial('interstitial'), false);
  assert.equal(calls.includes('sdk-init'), false);
  assert.equal(calls.includes('interstitial-request'), false);
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
  assert.equal(await service.prepareInterstitial('interstitial'), true);
  assert.equal(refreshes, 2);
});

test('unverified or missing consent permission blocks both ad formats', async () => {
  for (const refresh of [() => denied, () => ({ ...allowed, canRequestAds: undefined }), () => { throw new Error('Offline'); }]) {
    const { service, calls } = setup({ refresh });
    assert.equal(await service.prepareInterstitial('interstitial'), false);
    assert.equal(await service.prepareRewardVideo('reward'), false);
    assert.equal(calls.includes('sdk-init'), false);
    assert.equal(calls.includes('interstitial-request'), false);
    assert.equal(calls.includes('reward-request'), false);
  }
});

test('a native consent refresh that never settles does not lock future retries', async () => {
  let hung = true;
  const { service } = setup({ refresh: () => hung ? pending() : allowed });
  assert.equal(await service.prepareInterstitial('interstitial'), false);
  assert.equal(service.initPromise, null);
  hung = false;
  assert.equal(await service.prepareInterstitial('interstitial'), true);
});

test('a stalled SDK initialization releases the request and permits a retry', async () => {
  let hung = true;
  const { service, calls } = setup({ initialize: () => hung ? pending() : Promise.resolve() });
  assert.equal(await service.prepareInterstitial('interstitial'), false);
  assert.equal(calls.includes('interstitial-request'), false);
  assert.equal(service.initPromise, null);
  hung = false;
  assert.equal(await service.prepareInterstitial('interstitial'), true);
});

test('readiness timeout does not launch another form while the first is open', async () => {
  let dismiss;
  const { service, calls } = setup({
    refresh: () => ({ ...denied, isConsentFormAvailable: true }),
    form: () => new Promise(resolve => { dismiss = resolve; }),
  });
  service.INIT_WAIT_TIMEOUT_MS = 5;
  assert.equal(await service.prepareInterstitial('interstitial'), false);
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
  assert.equal(await service.prepareInterstitial('interstitial'), false);
  dismiss();
  assert.equal(await privacy, false);
  assert.equal(service.canRequestAds, false);
  assert.equal(calls.includes('interstitial-request'), false);
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
  assert.equal(await service.prepareInterstitial('interstitial'), false);
  assert.equal(calls.includes('interstitial-request'), false);
  dismiss(allowed);
  assert.equal(await retry, true);
});

test('listener registration is bounded and late listeners are removed', async () => {
  let register;
  let removed = false;
  const { service, calls } = setup({ listener: () => new Promise(resolve => { register = resolve; }) });
  service.PREPARE_TIMEOUT_MS = 5;
  assert.equal(await service.prepareInterstitial('interstitial'), false);
  register({ remove: () => { removed = true; } });
  await delay(0);
  assert.equal(removed, true);
  assert.equal(calls.includes('interstitial-request'), false);
});

test('an interstitial cannot appear after its show attempt timed out', async () => {
  const { service, calls } = setup({ prepare: () => delay(25) });
  service.PREPARE_TIMEOUT_MS = 100;
  const result = await service.showInterstitial('interstitial');
  assert.equal(result.reason, 'timeout_before_show');
  await delay(40);
  assert.equal(calls.includes('interstitial-show'), false);
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
  service.PREPARE_TIMEOUT_MS = 100;
  const prepare = service.prepareInterstitial('interstitial');
  await delay(0);
  service.canRequestAds = false;
  register({ remove() {} });
  await delay(0);
  register({ remove() {} });
  assert.equal(await prepare, false);
  assert.equal(calls.includes('interstitial-request'), false);
});

test('ordinary web or an APK without AdMob never invokes native ad APIs', async () => {
  const { service, calls } = setup({ native: false });
  assert.equal(await service.prepareInterstitial('interstitial'), false);
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

const { AdForegroundClock } = loadTs('../services/adForegroundClock.ts');
test('short foreground sessions accumulate cooldown without counting background time', () => {
  const clock = new AdForegroundClock();
  clock.start(0);
  clock.recordAd(300_000);
  assert.equal(clock.pause(310_000), 310_000);
  clock.start(370_000);
  assert.equal(clock.canShowAd(380_000), false);
  assert.equal(clock.pause(400_000), 30_000);
  assert.equal(clock.pause(400_000), 0);
  clock.start(460_000);
  assert.equal(clock.canShowAd(539_999), false);
  assert.equal(clock.canShowAd(540_000), true);
});

test('long inactivity resets both time origins and preserves a two-minute grace', () => {
  const clock = new AdForegroundClock();
  clock.start(0);
  clock.recordAd(300_000);
  clock.pause(310_000);
  clock.start(2_110_000);
  assert.equal(clock.canShowAd(2_229_999), false);
  assert.equal(clock.canShowAd(2_230_000), true);
});

test('duplicate foreground events neither lose time nor double-count analytics', () => {
  const clock = new AdForegroundClock();
  clock.start(0);
  assert.equal(clock.canShowAd(0), true);
  clock.start(1_000);
  assert.equal(clock.pause(2_000), 2_000);
});
