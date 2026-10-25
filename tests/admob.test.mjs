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
      if (options.prepareReward) return await options.prepareReward(params);
    },
    showRewardVideoAd: async () => {
      calls.push('reward-show');
      listeners.get(events.Showed)?.();
      const result = options.showReward ? await options.showReward() : { amount: 5 };
      listeners.get(events.Rewarded)?.(result);
      if (!options.manualDismiss) setTimeout(() => listeners.get(events.Dismissed)?.(), 0);
      return result;
    },
    showPrivacyOptionsForm: async () => options.privacyForm?.(),
    addListener: async (event, listener) => {
      const handle = options.listener ? await options.listener(event, listener) : null;
      listeners.set(event, listener);
      return { remove: async () => {
        try { await handle?.remove(); }
        finally { if (listeners.get(event) === listener) listeners.delete(event); }
      } };
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
    './adDiagnostics': { recordAdEvent() {}, getAdDeliveryDiagnostics: () => ({ counts: {}, lastEvent: null }) },
  });
  service.CONSENT_REFRESH_TIMEOUT_MS = 10;
  service.SDK_INIT_TIMEOUT_MS = 10;
  service.NATIVE_CONSENT_TIMEOUT_MS = 10;
  service.CONSENT_FORM_TIMEOUT_MS = 100;
  service.INIT_WAIT_TIMEOUT_MS = 250;
  service.REWARDED_PREPARE_TIMEOUT_MS = 20;
  service.REWARDED_POST_SHOW_TIMEOUT_MS = 250;
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

test('SDK readiness has its own deadline and no reward request runs before completion', async () => {
  let finishSdk;
  const { service, calls } = setup({ initialize: () => new Promise(resolve => { finishSdk = resolve; }) });
  // Leave wall-clock headroom when Android compilation runs on the same host.
  service.SDK_INIT_TIMEOUT_MS = 3000;
  service.INIT_WAIT_TIMEOUT_MS = 4000;
  const request = service.prepareRewardVideo('reward');
  while (!finishSdk) await delay(0);
  await delay(20); // Longer than the consent-refresh deadline.
  assert.equal(service.initialized, false);
  assert.equal(calls.includes('reward-request'), false);
  finishSdk();
  assert.equal(await request, true);
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
  service.rewardVideoPreparedAt = Date.now() - 54 * 60 * 1000;
  assert.equal(await service.prepareRewardVideo('reward', ssv), true);
  assert.equal(calls.filter(call => call === 'reward-request').length, 1);
  service.rewardVideoPreparedAt = Date.now() - 56 * 60 * 1000;
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
  service.REWARDED_POST_SHOW_TIMEOUT_MS = 15;
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

test('earning a reward keeps the show locked until dismissal and prevents cache reuse', async () => {
  const { service, calls, listeners, events } = setup({ manualDismiss: true });
  let settled = false;
  const show = service.showRewardVideo('reward').then(result => { settled = true; return result; });
  while (!calls.includes('reward-show')) await delay(0);
  await delay(0);
  assert.equal(settled, false);
  assert.equal(service.isRewardVideoShowing, true);
  assert.equal(service.hasFreshRewardVideo('reward'), false);
  assert.equal(await service.showRewardVideo('reward'), false);
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(calls.filter(call => call === 'reward-request').length, 1);
  listeners.get(events.Dismissed)();
  assert.equal(await show, true);
  assert.equal(service.isRewardVideoShowing, false);
  assert.equal(listeners.size, 0);
  assert.equal(await service.prepareRewardVideo('reward'), true);
  assert.equal(calls.filter(call => call === 'reward-request').length, 2);
});

test('dismissal before a delayed valid reward callback still grants the earned result', async () => {
  const { service, calls, listeners, events } = setup({ showReward: pending, manualDismiss: true });
  service.REWARDED_DISMISS_GRACE_MS = 100;
  const show = service.showRewardVideo('reward');
  while (!calls.includes('reward-show')) await delay(0);
  listeners.get(events.Dismissed)();
  await delay(0);
  listeners.get(events.Rewarded)({ amount: 5 });
  assert.equal(await show, true);
  assert.equal(listeners.size, 0);
});

test('closing without a reward releases the show and does not grant credits', async () => {
  const { service, calls, listeners, events } = setup({ showReward: pending, manualDismiss: true });
  service.REWARDED_DISMISS_GRACE_MS = 5;
  const show = service.showRewardVideo('reward');
  while (!calls.includes('reward-show')) await delay(0);
  listeners.get(events.Dismissed)();
  assert.equal(await show, false);
  assert.equal(service.isRewardVideoShowing, false);
  assert.equal(listeners.size, 0);
});

test('an empty duplicate reward callback cannot undo an already earned reward', async () => {
  const { service, calls, listeners, events } = setup({ manualDismiss: true });
  const show = service.showRewardVideo('reward');
  while (!calls.includes('reward-show')) await delay(0);
  await delay(0);
  listeners.get(events.Rewarded)({ amount: 0 });
  listeners.get(events.Dismissed)();
  assert.equal(await show, true);
});

test('a missing dismiss callback releases an earned ad through the bounded watchdog', async () => {
  const { service, listeners } = setup({ manualDismiss: true });
  service.REWARDED_POST_SHOW_TIMEOUT_MS = 10;
  assert.equal(await service.showRewardVideo('reward'), true);
  assert.equal(service.isRewardVideoShowing, false);
  assert.equal(listeners.size, 0);
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
  // SDK warm-up can start under the earlier valid UMP result; an actual ad
  // request must still wait for the final permission after the form.
  assert.equal(calls.includes('sdk-init'), true);
  assert.equal(calls.includes('reward-request'), false);
});

test('valid UMP permission overlaps SDK warm-up with the form check without requesting ads early', async () => {
  let finishForm;
  const { service, calls } = setup({
    refresh: () => ({ ...allowed, isConsentFormAvailable: true }),
    form: () => new Promise(resolve => { finishForm = resolve; }),
  });
  const preparing = service.prepareRewardVideo('reward');
  while (!finishForm) await delay(0);
  assert.equal(calls.filter(call => call === 'sdk-init').length, 1);
  assert.equal(calls.includes('reward-request'), false);
  finishForm(allowed);
  assert.equal(await preparing, true);
  assert.equal(calls.filter(call => call === 'reward-request').length, 1);
});

test('a guest preload survives until opt-in and reuses a single request without SSV', async () => {
  const contexts = [];
  const { service, calls } = setup({ prepareReward: params => contexts.push(params.ssv) });
  assert.equal(await service.prepareRewardVideo('reward', undefined, () => true), true);
  assert.equal(calls.includes('reward-show'), false);
  assert.equal(await service.showRewardVideo('reward'), true);
  assert.equal(calls.filter(call => call === 'reward-request').length, 1);
  assert.deepEqual(contexts, [undefined]);
});

test('a guest exiting during consent cannot issue a late preload', async () => {
  let finishConsent;
  let guestActive = true;
  const { service, calls } = setup({ refresh: () => new Promise(resolve => { finishConsent = resolve; }) });
  const preload = service.prepareRewardVideo('reward', undefined, () => guestActive);
  while (!finishConsent) await delay(0);
  guestActive = false;
  service.invalidateRewardVideo();
  finishConsent(allowed);
  assert.equal(await preload, false);
  assert.equal(calls.includes('reward-request'), false);
});

test('the app preloads low-credit guests only and never starts a signed-in verification attempt early', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let effect;
  let eligibility;
  const findEffect = node => {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === 'guestRewardPreloadEligible') {
      eligibility = node.initializer.getText(ast);
    }
    if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' &&
        node.arguments[0]?.getText(ast).includes('startGuestRewardPreload(')) {
      effect = node.arguments[0].getText(ast);
    }
    ts.forEachChild(node, findEffect);
  };
  findEffect(ast);
  assert.ok(effect, 'Guest preparation must be wired into the app');
  for (const scenario of [
    { credits: 2, expected: 1 }, { credits: 1, expected: 1 }, { credits: 0, expected: 1 },
    { credits: 3, expected: 0 }, { signedIn: true, credits: 0, expected: 0 },
    { credits: 2, premium: true, expected: 0 }, { credits: 2, offline: true, expected: 0 },
    { credits: 2, splash: true, expected: 0 }, { credits: 2, native: false, expected: 0 },
  ]) {
    let loads = 0;
    const profile = { id: scenario.signedIn ? 'account' : 'guest_user', credits: scenario.credits, is_premium: Boolean(scenario.premium) };
    const globals = {
      IS_WEB_PLATFORM: scenario.native === false, showSplash: Boolean(scenario.splash), showOnboarding: false,
      isOffline: Boolean(scenario.offline), profile, isGuest: !scenario.signedIn,
      rewardedAdIdentityVersionRef: { current: 0 }, profileRef: { current: profile },
      canUseNativeAdMob: () => scenario.native !== false, hasProductionAdUnit: () => true,
      getAdId: () => 'reward', runAdTask() {},
      startGuestRewardPreload: (_id, canPrepare) => {
        if (canPrepare()) loads++;
        return () => {};
      },
      AdMobService: { prepareRewardVideo: (_id, ssv, canPrepare) => {
        assert.equal(ssv, undefined);
        if (canPrepare()) loads++;
        return Promise.resolve(true);
      } },
      exports: {},
    };
    vm.runInNewContext(ts.transpileModule(`exports.run = () => { const guestRewardPreloadEligible = ${eligibility}; return (${effect})(); };`, {
      compilerOptions: { target: ts.ScriptTarget.ES2022 },
    }).outputText, globals);
    globals.exports.run();
    assert.equal(loads, scenario.expected, JSON.stringify(scenario));
  }
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

test('a lost consent callback releases initialization and native permission permits rewarded ads', async () => {
  const { service, calls } = setup({
    refresh: () => ({ ...denied, isConsentFormAvailable: true }),
    form: pending, nativeConsent: () => allowed,
  });
  service.CONSENT_FORM_TIMEOUT_MS = 5;
  assert.equal(await service.prepareRewardVideo('reward'), true);
  assert.equal(service.initPromise, null);
  assert.ok(service.consentFormPromise, 'Keep the native form tracked even after the wait expires');
  assert.equal(calls.filter(call => call === 'consent-form').length, 1);
  assert.equal(calls.filter(call => call === 'reward-request').length, 1);
});

test('pending consent stays blocked until UMP permits ads, without another form or another long wait', async () => {
  let permission = denied;
  const { service, calls } = setup({
    refresh: () => ({ ...denied, isConsentFormAvailable: true }),
    form: pending, nativeConsent: () => permission,
  });
  service.CONSENT_FORM_TIMEOUT_MS = 5;
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(service.initPromise, null);
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(calls.includes('sdk-init'), false);
  assert.equal(calls.includes('reward-request'), false);
  permission = allowed;
  assert.equal(await service.prepareRewardVideo('reward'), true);
  assert.equal(calls.filter(call => call === 'consent-form').length, 1);
});

test('older APKs recover a missing form callback through a fresh UMP response', async () => {
  let refreshes = 0;
  const { service, calls } = setup({
    refresh: () => ++refreshes === 1 ? { ...denied, isConsentFormAvailable: true } : allowed,
    form: pending,
  });
  service.CONSENT_FORM_TIMEOUT_MS = 5;
  assert.equal(await service.initialize(), true);
  assert.equal(refreshes, 2);
  assert.equal(calls.filter(call => call === 'consent-form').length, 1);
});

test('a late form callback cannot restore stale permission after a native denial', async () => {
  let dismiss;
  let permission = allowed;
  const { service, calls } = setup({
    refresh: () => ({ ...denied, isConsentFormAvailable: true }),
    form: () => new Promise(resolve => { dismiss = resolve; }),
    nativeConsent: () => permission,
  });
  service.CONSENT_FORM_TIMEOUT_MS = 5;
  assert.equal(await service.initialize(), true);
  permission = denied;
  service.canRequestAds = false;
  assert.equal(await service.initialize(), false);
  dismiss(allowed);
  await delay(0);
  assert.equal(service.consentFormPromise, null);
  assert.equal(service.canRequestAds, false);
  assert.equal(await service.prepareRewardVideo('reward'), false);
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

test('a slow JIT load does not consume the native fullscreen show deadline', async () => {
  const { service, plugin, listeners, events } = setup({ prepareReward: () => delay(40) });
  service.REWARDED_PREPARE_TIMEOUT_MS = 200;
  service.REWARDED_SHOW_TIMEOUT_MS = 60;
  plugin.showRewardVideoAd = async () => {
    await delay(35);
    listeners.get(events.Showed)?.();
    listeners.get(events.Rewarded)?.({ amount: 5 });
    listeners.get(events.Dismissed)?.();
    return { amount: 5 };
  };
  assert.equal(await service.showRewardVideo('reward'), true);
  assert.equal(service.isRewardVideoShowing, false);
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
  let now = 1_000;
  const bannerEvents = { SizeChanged: 'banner-size', Loaded: 'banner-loaded', FailedToLoad: 'banner-failed', AdImpression: 'banner-impression' };
  plugin.addListener = async (event, callback) => {
    callbacks.set(event, callback);
    if (options.bannerListener) await options.bannerListener(event);
    return { remove: async () => {
      try { await options.removeBannerListener?.(event); }
      finally { callbacks.delete(event); }
    } };
  };
  plugin.showBanner = async params => {
    assert.equal(slots.at(-1), options.bannerHeight ?? 50, 'Top reservation must match the native banner height');
    assert.equal(params.adId, 'ca-app-pub-7381421031784616/7234804095');
    assert.equal(params.adSize, options.adaptive ? 'ADAPTIVE_BANNER' : 'BANNER');
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
  plugin.resumeBanner = async () => { calls.push('banner-resume'); await options.resumeBanner?.(); };
  plugin.removeBanner = async () => {
    calls.push('banner-remove');
    await options.removeBanner?.();
  };
  const { NativeBannerController } = loadTs('../services/nativeBannerService.ts', {
    '@capacitor-community/admob': {
      AdMob: plugin, BannerAdPluginEvents: bannerEvents,
      BannerAdPosition: { TOP_CENTER: 'TOP_CENTER' }, BannerAdSize: { BANNER: 'BANNER', ADAPTIVE_BANNER: 'ADAPTIVE_BANNER' },
    },
    './admobService': { AdMobService: service },
    './nativeCapabilities': { canUseNativeAdMob: () => options.native !== false },
    './adDiagnostics': { recordAdEvent() {} },
  }, {
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, ms) => { const id = nextTimer++; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const controller = new NativeBannerController('ca-app-pub-7381421031784616/7234804095', 72, height => slots.push(height), () => {}, options.moveBanner);
  return { controller, service, calls, callbacks, slots, timers, bannerEvents, advance: ms => { now += ms; } };
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

test('a newly attached banner uses the measured native slot before any resize', async t => {
  const margins = [];
  const { controller, calls } = setupBanner({ moveBanner: async margin => { margins.push(margin); return true; } });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  assert.deepEqual(margins, [72]);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal(calls.includes('banner-hide'), false);
  await controller.setMode('visible');
  assert.deepEqual(margins, [72], 'Stable geometry does not repeat positioning or ad requests');
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

test('a missing consent callback does not prevent a permitted banner request', async t => {
  const { controller, service, calls } = setupBanner({
    refresh: () => ({ ...denied, isConsentFormAvailable: true }),
    form: pending, nativeConsent: () => allowed,
  });
  t.after(() => controller.dispose());
  service.CONSENT_FORM_TIMEOUT_MS = 5;
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal(service.initPromise, null);
});

test('readiness retries check permission sooner without making premature banner requests', async t => {
  let permission = denied;
  const { controller, calls, timers, advance } = setupBanner({ refresh: () => permission });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  assert.equal(calls.includes('banner-request'), false);
  const [id, retry] = [...timers][0];
  assert.equal(retry.ms, 15_000);
  permission = allowed;
  advance(retry.ms);
  timers.delete(id);
  retry.callback();
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
});

test('no-fill schedules one delayed retry and a later native success recovers', async t => {
  const { controller, calls, callbacks, bannerEvents, timers, advance } = setupBanner();
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  callbacks.get(bannerEvents.FailedToLoad)({ code: 3 });
  assert.equal(timers.size, 1);
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  const [id, retry] = [...timers][0];
  assert.equal(retry.ms, 60_000);
  advance(retry.ms);
  timers.delete(id);
  retry.callback();
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
  assert.equal(timers.size, 0);
});

test('offline time pauses banner retries and reconnection recovers a due request once', async t => {
  const { controller, calls, callbacks, bannerEvents, timers, advance } = setupBanner();
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  callbacks.get(bannerEvents.FailedToLoad)({ code: 2 });
  await controller.setNetworkAvailable(false);
  assert.equal(timers.size, 0);
  advance(120_000);
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  await controller.setNetworkAvailable(true);
  await controller.setNetworkAvailable(true);
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
});

test('reconnecting before a no-fill deadline preserves pacing and a suspended banner stays hidden', async t => {
  const { controller, calls, callbacks, bannerEvents, timers, advance } = setupBanner();
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  callbacks.get(bannerEvents.FailedToLoad)({ code: 3 });
  await controller.setNetworkAvailable(false);
  advance(10_000);
  await controller.setNetworkAvailable(true);
  assert.equal([...timers.values()][0].ms, 50_000);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  await controller.setMode('hidden');
  await controller.setNetworkAvailable(false);
  advance(60_000);
  await controller.setNetworkAvailable(true);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
});

test('network loss during consent prevents a late banner request', async t => {
  let finishConsent;
  const { controller, calls } = setupBanner({ refresh: () => new Promise(resolve => { finishConsent = resolve; }) });
  t.after(() => controller.dispose());
  const showing = controller.setMode('visible');
  while (!finishConsent) await delay(0);
  const offline = controller.setNetworkAvailable(false);
  finishConsent(allowed);
  await Promise.all([showing, offline]);
  assert.equal(calls.includes('banner-request'), false);
  await controller.setNetworkAvailable(true);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
});

test('a banner whose load callback never arrives is removed before retry', async t => {
  const { controller, calls, timers } = setupBanner({ noLoad: true });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  const [id, watchdog] = [...timers][0];
  assert.equal(watchdog.ms, 90_000);
  timers.delete(id);
  watchdog.callback();
  await controller.setMode('visible');
  assert.equal(calls.at(-1), 'banner-remove');
  assert.equal([...timers.values()][0].ms, 60_000);
});

test('an unfinished banner load pauses its watchdog while hidden and reuses its request on return', async t => {
  const { controller, calls, timers, callbacks, bannerEvents } = setupBanner({ noLoad: true });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  assert.equal(timers.size, 1);
  await controller.setMode('hidden');
  assert.equal(timers.size, 0, 'Hidden time must not count as a stalled visible load');
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal(timers.size, 1);
  callbacks.get(bannerEvents.Loaded)();
  assert.equal(timers.size, 0);
});

test('a banner that loads while hidden resumes without starting another load watchdog', async t => {
  const { controller, calls, timers, callbacks, bannerEvents } = setupBanner({ noLoad: true });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  await controller.setMode('hidden');
  callbacks.get(bannerEvents.Loaded)();
  await controller.setMode('visible');
  assert.equal(timers.size, 0);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
});

test('stalled native listener cleanup cannot wedge the banner retry queue', async t => {
  let fail = true;
  const { controller, timers, calls, advance } = setupBanner({
    bannerTimeout: 5,
    showBanner: () => { if (fail) throw new Error('Native creation failed'); },
    removeBannerListener: pending,
  });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  const retry = [...timers.values()].find(timer => timer.ms === 1000);
  assert.ok(retry, 'Cleanup must settle and schedule recovery');
  fail = false;
  advance(retry.ms);
  timers.clear();
  retry.callback();
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
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
  moved.length = 0;
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
  moved.length = 0;
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
  const { controller, calls } = setupBanner({ moveBanner: () => ++moves === 2 ? new Promise(resolve => { finishMove = resolve; }) : Promise.resolve(true) });
  t.after(() => controller.dispose());
  await controller.setTopMargin(72, 392);
  await controller.setMode('visible');
  const resize = controller.setTopMargin(72, 872);
  while (!finishMove) await delay(0);
  const again = controller.setTopMargin(72, 940);
  finishMove(true);
  await Promise.all([resize, again]);
  assert.equal(moves, 3, 'Initial placement plus both viewport changes');
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
      registerPlugin: () => ({ getBannerGeometry: async () => ({ density: 2.75, webViewOffsetDp: -24, bottomInsetDp: 48, widthDp: 392, heightDp: 61, adaptive: true }) }),
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
  assert.equal(placement.widthDp, 392, 'Reserve the full native adaptive width');
  assert.equal(placement.heightDp, 61);
  assert.equal(placement.adaptive, true);
  assert.equal(placement.viewportWidthDp, 392);
  assert.equal(placement.dpToCss, 1);
  assert.equal(placement.nativeGeometryVerified, true);
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
  assert.equal(placement.nativeGeometryVerified, false, 'A fallback must not become a permanent cached measurement');
  assert.equal(placement.adaptive, false, 'An older APK must keep its compatible compact layout');
  assert.equal(await moveNativeBanner(69), false);
});

test('adaptive banners reserve the measured height and keep keyboard and modal returns request-free', async t => {
  const { controller, calls, slots } = setupBanner({ adaptive: true, bannerHeight: 61, moveBanner: async () => true });
  t.after(() => controller.dispose());
  await controller.setTopMargin(72, 392, 61, true);
  await controller.setMode('visible');
  assert.equal(slots.at(-1), 61);
  calls.length = 0;
  await controller.setTopMargin(72, 392, 61, true);
  await controller.setMode('visible');
  assert.equal(calls.length, 0, 'Keyboard changes cannot recreate or move the ad');
  await controller.setMode('hidden');
  await controller.setMode('visible');
  assert.equal(slots.at(-1), 61);
  assert.equal(calls.filter(call => call === 'banner-request').length, 0);
});

test('a real adaptive width change requests the new size once after the modal closes', async t => {
  const { controller, calls } = setupBanner({ adaptive: true, bannerHeight: 61, moveBanner: async () => true });
  t.after(() => controller.dispose());
  await controller.setTopMargin(72, 392, 61, true);
  await controller.setMode('visible');
  await controller.setMode('hidden');
  calls.length = 0;
  await controller.setTopMargin(72, 872, 61, true);
  assert.equal(calls.includes('banner-request'), false);
  await controller.setMode('visible');
  await controller.setTopMargin(72, 872, 61, true);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal(calls.filter(call => call === 'banner-remove').length, 1);
});

test('an adaptive width change during native creation replaces the old width once', async t => {
  let finishShow;
  let first = true;
  const { controller, calls } = setupBanner({ adaptive: true, bannerHeight: 61, moveBanner: async () => true, showBanner: () => {
    if (!first) return Promise.resolve();
    first = false;
    return new Promise(resolve => { finishShow = resolve; });
  } });
  t.after(() => controller.dispose());
  await controller.setTopMargin(72, 392, 61, true);
  const show = controller.setMode('visible');
  while (!finishShow) await delay(0);
  const resize = controller.setTopMargin(72, 872, 61, true);
  finishShow();
  await Promise.all([show, resize]);
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
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
  moves = 0;
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
  moves = 0;
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
  assert.equal([...timers.values()][0].ms, 1000);
  await controller.setMode('removed');
  assert.equal(timers.size, 0);
  hung = false;
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
});

test('returning before a no-fill deadline waits only the remaining time', async t => {
  const { controller, calls, callbacks, bannerEvents, timers, advance } = setupBanner();
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  callbacks.get(bannerEvents.FailedToLoad)({ code: 3 });
  advance(10_000);
  await controller.setMode('hidden');
  assert.equal(timers.size, 0, 'Background recovery must not issue requests');
  advance(20_000);
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal([...timers.values()][0].ms, 30_000, 'Do not reset or bypass the deadline');
  advance(30_000);
  const [id, retry] = [...timers][0];
  timers.delete(id);
  retry.callback();
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
  assert.equal(timers.size, 0);
});

test('returning after a retry deadline requests immediately rather than waiting another minute', async t => {
  const { controller, calls, callbacks, bannerEvents, timers, advance } = setupBanner();
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  callbacks.get(bannerEvents.FailedToLoad)({ code: 3 });
  await controller.setMode('hidden');
  advance(70_000);
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
  assert.equal(timers.size, 0);
});

test('a pending banner failure while hidden retains its recovery deadline', async t => {
  const { controller, calls, callbacks, bannerEvents, timers, advance } = setupBanner({ noLoad: true });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  await controller.setMode('hidden');
  callbacks.get(bannerEvents.FailedToLoad)({ code: 3 });
  assert.equal(timers.size, 0);
  advance(20_000);
  await controller.setMode('visible');
  assert.equal([...timers.values()][0].ms, 40_000);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
});

test('repeated no-fill uses one-minute recovery without an increasing cooldown', async t => {
  const { controller, callbacks, bannerEvents, timers, advance } = setupBanner({ noLoad: true });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  for (const expected of [60_000, 60_000, 60_000, 60_000, 60_000]) {
    callbacks.get(bannerEvents.FailedToLoad)({ code: 3 });
    assert.equal([...timers.values()][0].ms, expected);
    await controller.setMode('hidden');
    advance(expected);
    await controller.setMode('visible');
  }
  callbacks.get(bannerEvents.Loaded)();
  callbacks.get(bannerEvents.FailedToLoad)({ code: 3 });
  assert.equal([...timers.values()][0].ms, 60_000, 'A real loaded callback resets backoff');
});

test('a slow mediated banner can finish after the old 45-second watchdog without a replacement', async t => {
  const { controller, calls, callbacks, bannerEvents, timers, advance } = setupBanner({ noLoad: true });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  assert.equal([...timers.values()][0].ms, 90_000);
  advance(60_000);
  callbacks.get(bannerEvents.Loaded)();
  await controller.setMode('visible');
  assert.equal(timers.size, 0);
  assert.equal(calls.includes('banner-remove'), false);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
});

function setupBannerLifecycle(options = {}) {
  const changes = [];
  const handlers = new Map();
  const document = {
    visibilityState: 'visible',
    addEventListener: (event, listener) => handlers.set(event, listener),
    removeEventListener: (event, listener) => { if (handlers.get(event) === listener) handlers.delete(event); },
  };
  let appStateChange;
  let resolveState;
  let resolveListener;
  let removed = 0;
  const handle = { remove: async () => { removed++; } };
  const { observeBannerForeground } = loadTs('../services/bannerLifecycle.ts', {
    '@capacitor/app': { App: {
      addListener: async (_event, callback) => {
        appStateChange = callback;
        return options.lateListener ? new Promise(resolve => { resolveListener = resolve; }) : handle;
      },
      getState: () => new Promise(resolve => { resolveState = resolve; }),
    } },
    './nativeCapabilities': { canUseNativeAppEvents: () => options.native !== false },
  }, { document });
  const stop = observeBannerForeground(value => changes.push(value));
  return {
    changes, document, handlers, stop,
    state: isActive => appStateChange({ isActive }),
    resolveState: isActive => resolveState({ isActive }),
    resolveListener: () => resolveListener(handle),
    removed: () => removed,
  };
}

test('previous-session native permission starts ads while this session consent refresh is pending', async () => {
  let finishRefresh;
  const { service, calls } = setup({
    refresh: () => new Promise(resolve => { finishRefresh = resolve; }), nativeConsent: () => allowed,
  });
  service.CONSENT_REFRESH_TIMEOUT_MS = 200;
  const result = await Promise.race([service.prepareRewardVideo('reward'), delay(60).then(() => 'still waiting')]);
  assert.equal(result, true, 'Valid native permission should not wait for the refresh deadline');
  assert.ok(calls.indexOf('consent-refresh') < calls.indexOf('sdk-init'));
  assert.equal(calls.filter(call => call === 'reward-request').length, 1);
  finishRefresh(denied);
  await service.consentGatheringPromise;
  assert.equal(service.canRequestAds, false);
  assert.equal(service.rewardVideoReady, false, 'A later denial invalidates the loaded cache');
});

test('a delayed startup permission snapshot cannot override a newer UMP denial', async () => {
  let finishRead;
  const { service, calls } = setup({ refresh: () => denied, nativeConsent: () => new Promise(resolve => { finishRead = resolve; }) });
  assert.equal(await service.initialize(), false);
  finishRead(allowed);
  await delay(0);
  assert.equal(service.canRequestAds, false);
  assert.equal(calls.includes('sdk-init'), false);
});

test('a lost privacy-options callback recovers permission without allowing duplicate forms', async () => {
  let dismiss;
  let permission = allowed;
  let forms = 0;
  const { service } = setup({
    nativeConsent: () => permission,
    privacyForm: () => { forms++; return new Promise(resolve => { dismiss = resolve; }); },
  });
  assert.equal(await service.initialize(), true);
  service.privacyOptionsRequired = true;
  service.CONSENT_FORM_TIMEOUT_MS = 5;
  assert.equal(await service.showPrivacyOptionsForm(), true);
  assert.equal(service.privacyOptionsInProgress, false);
  assert.equal(await service.prepareRewardVideo('reward'), true);
  service.privacyOptionsRequired = true;
  assert.equal(await service.showPrivacyOptionsForm(), false);
  assert.equal(forms, 1);
  permission = denied;
  dismiss();
  await delay(0);
  assert.equal(service.privacyOptionsPromise, null);
  assert.equal(service.canRequestAds, false);
  assert.equal(service.rewardVideoReady, false);
});

test('a late guest load is cached after the UI deadline and reused on the next opt-in', async () => {
  let finish;
  const { service, calls } = setup({ prepareReward: () => new Promise(resolve => { finish = resolve; }) });
  service.REWARDED_PREPARE_TIMEOUT_MS = 5;
  assert.equal(await service.prepareRewardVideo('reward'), false);
  finish();
  await delay(0);
  assert.equal(service.hasFreshRewardVideo('reward'), true);
  assert.equal(calls.includes('reward-show'), false);
  assert.equal(await service.showRewardVideo('reward'), true);
  assert.equal(calls.filter(call => call === 'reward-request').length, 1);
});

test('a credit change during guest preloading does not discard an already requested ad', async () => {
  let finish;
  let eligible = true;
  const { service, calls } = setup({ prepareReward: () => new Promise(resolve => { finish = resolve; }) });
  service.REWARDED_PREPARE_TIMEOUT_MS = 100;
  const preload = service.prepareRewardVideo('reward', undefined, () => eligible);
  while (!finish) await delay(0);
  eligible = false; // React cleaned up the old effect after a credit/profile update.
  finish();
  assert.equal(await preload, true);
  assert.equal(service.hasFreshRewardVideo('reward'), true);
  assert.equal(await service.showRewardVideo('reward'), true);
  assert.equal(calls.filter(call => call === 'reward-request').length, 1);
});

function setupGuestPreload(options = {}) {
  const timers = new Map();
  let timerId = 0;
  let now = 100_000;
  let ready = Boolean(options.ready);
  let eligible = true;
  let foreground;
  let requests = 0;
  let observersRemoved = 0;
  const readinessListeners = new Set();
  const service = {
    initialized: options.readiness !== false,
    canRequestAds: options.readiness !== false,
    rewardVideoRequestCount: 0,
    rewardVideoPreparing: false,
    subscribeReadiness: callback => { readinessListeners.add(callback); return () => readinessListeners.delete(callback); },
    REWARDED_STALE_AFTER_MS: 50 * 60 * 1000,
    rewardVideoPreparedAt: now - (options.age ?? 0),
    hasFreshRewardVideo: () => ready && now - service.rewardVideoPreparedAt < service.REWARDED_STALE_AFTER_MS,
    prepareRewardVideo: async (_id, ssv, canPrepare) => {
      assert.equal(ssv, undefined, 'Guest maintenance must not create an SSV context');
      assert.equal(canPrepare(), true);
      if (!service.initialized || !service.canRequestAds) return false;
      if (!options.noRequest) ++service.rewardVideoRequestCount;
      requests++;
      const result = await (options.load?.(requests) ?? true);
      if (result) { ready = true; service.rewardVideoPreparedAt = now; }
      return result;
    },
  };
  const { startGuestRewardPreload } = loadTs('../services/guestRewardPreload.ts', {
    './admobService': { AdMobService: service },
    './bannerLifecycle': { observeBannerForeground: callback => {
      foreground = callback;
      callback(options.foreground !== false);
      return () => { observersRemoved++; };
    } },
  }, {
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, ms) => { const id = ++timerId; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const stop = startGuestRewardPreload('reward', () => eligible);
  return {
    stop, timers, service, foreground: active => foreground(active),
    notifyReadiness: () => { for (const callback of readinessListeners) callback(); },
    advance: ms => { now += ms; }, setEligible: value => { eligible = value; },
    get requests() { return requests; }, get observersRemoved() { return observersRemoved; },
    fire: async () => {
      const [id, timer] = [...timers][0];
      now += timer.ms;
      timers.delete(id);
      timer.callback();
      await delay(0);
    },
  };
}

test('a failed guest preload retries once per minute and then reuses the ready cache', async t => {
  const state = setupGuestPreload({ load: request => request > 1 });
  t.after(state.stop);
  await delay(0);
  assert.equal(state.requests, 1);
  assert.equal([...state.timers.values()][0].ms, 60000);
  await state.fire();
  assert.equal(state.requests, 2);
  assert.equal([...state.timers.values()][0].ms, 50 * 60 * 1000);
  state.foreground(true);
  await delay(0);
  assert.equal(state.requests, 2, 'Visibility updates reuse a ready ad');
});

test('guest preload failure pacing survives background and quick resume', async t => {
  const state = setupGuestPreload({ load: () => false });
  t.after(state.stop);
  await delay(0);
  state.foreground(false);
  assert.equal(state.timers.size, 0);
  state.advance(10000);
  state.foreground(true);
  await delay(0);
  assert.equal(state.requests, 1);
  assert.equal([...state.timers.values()][0].ms, 50000);
  await state.fire();
  assert.equal(state.requests, 2);
});

test('guest maintenance reuses a fresh cache and reloads only at expiry', async t => {
  const state = setupGuestPreload({ ready: true, age: 10000 });
  t.after(state.stop);
  await delay(0);
  assert.equal(state.requests, 0);
  assert.equal([...state.timers.values()][0].ms, 50 * 60 * 1000 - 10000);
  await state.fire();
  assert.equal(state.requests, 1);
});

test('guest maintenance issues no requests in the background and refreshes expired cache on return', async t => {
  const state = setupGuestPreload({ ready: true });
  t.after(state.stop);
  await delay(0);
  state.foreground(false);
  state.advance(51 * 60 * 1000);
  assert.equal(state.requests, 0);
  assert.equal(state.timers.size, 0);
  state.foreground(true);
  await delay(0);
  assert.equal(state.requests, 1);
});

test('guest preload expiry and retry stop when the guest is no longer eligible', async () => {
  const state = setupGuestPreload({ load: () => false });
  await delay(0);
  state.setEligible(false);
  await state.fire();
  assert.equal(state.requests, 1);
  assert.equal(state.timers.size, 0);
  state.stop();
  assert.equal(state.observersRemoved, 1);
});

test('foreground changes during one guest load do not duplicate it or leak timers after cleanup', async () => {
  let finish;
  const state = setupGuestPreload({ load: () => new Promise(resolve => { finish = resolve; }) });
  state.foreground(false);
  state.foreground(true);
  assert.equal(state.requests, 1);
  state.stop();
  finish(true);
  await delay(0);
  assert.equal(state.timers.size, 0);
  assert.equal(state.observersRemoved, 1);
});

test('guest preload starts promptly when permission and SDK become ready without waiting for a failure timer', async t => {
  const state = setupGuestPreload({ readiness: false });
  t.after(state.stop);
  await delay(0);
  assert.equal(state.service.rewardVideoRequestCount, 0);
  assert.equal([...state.timers.values()][0].ms, 15000);
  state.service.canRequestAds = true;
  state.service.initialized = true;
  state.notifyReadiness();
  await delay(0);
  assert.equal(state.service.rewardVideoRequestCount, 1);
  assert.equal(state.requests, 1);
  assert.equal([...state.timers.values()][0].ms, 50 * 60 * 1000);
});

test('a consent-only wait interrupted by backgrounding does not become a no-fill cooldown', async t => {
  let finish;
  const state = setupGuestPreload({ noRequest: true, load: () => new Promise(resolve => { finish = resolve; }) });
  t.after(state.stop);
  state.foreground(false);
  finish(false);
  await delay(0);
  assert.equal(state.service.rewardVideoRequestCount, 0);
  state.foreground(true);
  assert.equal(state.requests, 2, 'Resume may prepare immediately because no native ad request failed');
  finish(true);
  await delay(0);
});

test('reward verification alone does not hide a banner; covering UI and Coach still do', () => {
  const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let expression;
  const visit = node => {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'NativeBanner') {
      expression = node.attributes.properties.find(prop => prop.name?.getText(ast) === 'suspended').initializer.expression.getText(ast);
    }
    ts.forEachChild(node, visit);
  };
  visit(ast);
  assert.ok(expression);
  const base = {
    showSplash: false, showOnboarding: false, currentView: 'HOME', isSessionBlocked: false,
    isOffline: false, showPremiumModal: false, showSavedModal: false, showRizzShareCard: false,
    showCreditsExhaustedModal: false, showPersonaModal: false, isPrivacyFormOpen: false,
    isRewardedAdLoading: true, rewardedAdStatus: 'pending',
  };
  const suspended = overrides => vm.runInNewContext(expression, { ...base, ...overrides });
  assert.equal(suspended({}), false);
  assert.equal(suspended({ rewardedAdStatus: 'loading' }), true);
  assert.equal(suspended({ currentView: 'COACH' }), true);
  assert.equal(suspended({ showCreditsExhaustedModal: true }), true);
  assert.equal(suspended({ showPremiumModal: true }), true);
  assert.equal(suspended({ isPrivacyFormOpen: true }), true);
});

test('a late older load for the same guest context does not discard the newer ready cache', async () => {
  let finish;
  let loads = 0;
  const { service, calls } = setup({ prepareReward: () => ++loads === 1 ? new Promise(resolve => { finish = resolve; }) : undefined });
  service.REWARDED_PREPARE_TIMEOUT_MS = 5;
  assert.equal(await service.prepareRewardVideo('reward'), false);
  assert.equal(await service.prepareRewardVideo('reward'), true);
  finish();
  await delay(0);
  assert.equal(service.hasFreshRewardVideo('reward'), true);
  assert.equal(await service.showRewardVideo('reward'), true);
  assert.equal(calls.filter(call => call === 'reward-request').length, 2);
});

test('a superseded native callback cannot invalidate the newer SSV cache', async () => {
  let finish;
  let loads = 0;
  const { service } = setup({ prepareReward: () => ++loads === 1 ? new Promise(resolve => { finish = resolve; }) : undefined });
  service.REWARDED_PREPARE_TIMEOUT_MS = 5;
  const a = { userId: 'user', customData: 'first' };
  const b = { userId: 'user', customData: 'second' };
  assert.equal(await service.prepareRewardVideo('reward', a), false);
  assert.equal(await service.prepareRewardVideo('reward', b), true);
  finish({ superseded: true });
  await delay(0);
  assert.equal(service.hasFreshRewardVideo('reward', b), true);
  assert.equal(service.hasFreshRewardVideo('reward', a), false);
});

test('logout during a timed-out load prevents late guest cache adoption', async () => {
  let finish;
  const { service } = setup({ prepareReward: () => new Promise(resolve => { finish = resolve; }) });
  service.REWARDED_PREPARE_TIMEOUT_MS = 5;
  assert.equal(await service.prepareRewardVideo('reward'), false);
  service.invalidateRewardVideo();
  finish();
  await delay(0);
  assert.equal(service.hasFreshRewardVideo('reward'), false);
});

test('a failed show-listener registration preserves a valid ad that was never shown', async () => {
  let broken = true;
  const { service, calls } = setup({ listener: () => { if (broken) throw new Error('Bridge registration failed'); } });
  assert.equal(await service.prepareRewardVideo('reward'), true);
  assert.equal(await service.showRewardVideo('reward'), false);
  assert.equal(service.hasFreshRewardVideo('reward'), true);
  broken = false;
  assert.equal(await service.showRewardVideo('reward'), true);
  assert.equal(calls.filter(call => call === 'reward-request').length, 1);
});

test('optional impression listener failure or a lost callback cannot block banner loading', async t => {
  for (const hanging of [false, true]) {
    const { controller, calls, timers } = setupBanner({ bannerListener: event => {
      if (event !== 'banner-impression') return;
      if (hanging) return pending();
      throw new Error('Unsupported optional event');
    } });
    t.after(() => controller.dispose());
    await controller.setMode('visible');
    assert.equal(calls.filter(call => call === 'banner-request').length, 1);
    assert.equal(timers.size, 0);
  }
});

test('transient native refresh failures retain the loaded banner and SDK refresh ownership', async t => {
  const { controller, calls, callbacks, bannerEvents, timers, slots } = setupBanner();
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  for (const code of [0, 2, 3]) callbacks.get(bannerEvents.FailedToLoad)({ code, viewRetained: true, refreshFailure: true });
  await controller.setMode('visible');
  assert.equal(timers.size, 0, 'Do not add a second refresh loop');
  assert.equal(slots.at(-1), 50);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal(calls.includes('banner-remove'), false);
});

test('native retained-view confirmation also recovers a missed initial Loaded event', async t => {
  const { controller, calls, callbacks, bannerEvents, timers } = setupBanner({ noLoad: true });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  callbacks.get(bannerEvents.FailedToLoad)({ code: 3, viewRetained: true, refreshFailure: true });
  await controller.setMode('hidden');
  await controller.setMode('visible');
  assert.equal(timers.size, 0);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
});

test('verified permission and SDK readiness wake a banner before its readiness retry deadline', async t => {
  const { controller, service, calls, timers } = setupBanner({ refresh: () => denied });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  assert.equal([...timers.values()][0].ms, 15000);
  service.applyConsentInfo(allowed);
  await service.initializeSdk();
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal(timers.size, 0);
});

test('verified permission wakes a cold SDK and banner without waiting for a readiness timer', async t => {
  const { controller, service, calls, timers } = setupBanner({ refresh: () => denied });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  assert.equal(service.initialized, false);
  assert.equal(timers.size, 1);
  service.applyConsentInfo(allowed);
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'sdk-init').length, 1);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal(timers.size, 0);
});

test('a temporary positioning failure retries the move without destroying the cached banner', async t => {
  let moves = 0;
  const { controller, calls, timers, advance } = setupBanner({ moveBanner: async () => {
    if (++moves === 2) throw new Error('Temporary bridge delay');
    return true;
  } });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  await controller.setTopMargin(90);
  assert.equal(calls.includes('banner-remove'), false);
  const [id, retry] = [...timers][0];
  assert.equal(retry.ms, 1000);
  advance(retry.ms);
  timers.delete(id);
  retry.callback();
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal(calls.filter(call => call === 'banner-resume').length, 1);
  assert.equal(moves, 3);
});

test('a temporary initial positioning failure retains the pending banner and pauses its load watchdog', async t => {
  let moves = 0;
  const { controller, calls, callbacks, bannerEvents, timers, advance } = setupBanner({
    noLoad: true,
    moveBanner: async () => { if (++moves === 1) throw new Error('Bridge busy'); return true; },
  });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  assert.equal(calls.includes('banner-remove'), false);
  assert.equal(timers.size, 1);
  const [id, retry] = [...timers][0];
  assert.equal(retry.ms, 1000);
  advance(retry.ms);
  timers.delete(id);
  retry.callback();
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal([...timers.values()][0].ms, 90000);
  callbacks.get(bannerEvents.Loaded)();
  assert.equal(timers.size, 0);
});

test('a positioning bridge timeout is not misreported as an unsupported APK', async () => {
  const { moveNativeBanner } = loadTs('../services/bottomNavigationInset.ts', {
    '@capacitor/core': {
      Capacitor: { getPlatform: () => 'android', isPluginAvailable: () => true },
      registerPlugin: () => ({ setBannerPosition: async () => { throw new Error('Banner position timed out'); } }),
    },
    './admobService': { AdMobService: { withNativeTimeout: async (_label, promise) => promise } },
    './nativeBannerService': { BANNER_HEIGHT: 50, BANNER_WIDTH: 320 },
  });
  await assert.rejects(moveNativeBanner(90), /timed out/);
});

test('a missing cached view on resume uses a short local retry instead of no-fill backoff', async t => {
  const { controller, calls, timers, advance } = setupBanner({ resumeBanner: () => { throw new Error('No cached view'); } });
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  await controller.setMode('hidden');
  await controller.setMode('visible');
  const [id, retry] = [...timers][0];
  assert.equal(retry.ms, 1000);
  advance(retry.ms);
  timers.delete(id);
  retry.callback();
  await controller.setMode('visible');
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
});

test('a loaded banner survives a lost native show response without a replacement request', async t => {
  const { controller, calls, callbacks, bannerEvents, timers } = setupBanner({ bannerTimeout: 15, showBanner: pending });
  t.after(() => controller.dispose());
  const showing = controller.setMode('visible');
  while (!calls.includes('banner-request')) await delay(0);
  callbacks.get(bannerEvents.Loaded)();
  await showing;
  assert.equal(timers.size, 0);
  assert.equal(calls.filter(call => call === 'banner-request').length, 1);
  assert.equal(calls.includes('banner-remove'), false);
});

test('network load errors recover on a real reconnect without bypassing no-fill pacing', async t => {
  const { controller, calls, callbacks, bannerEvents, timers } = setupBanner();
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  callbacks.get(bannerEvents.FailedToLoad)({ code: 2 });
  assert.equal([...timers.values()][0].ms, 15000);
  await controller.setNetworkAvailable(false);
  await controller.setNetworkAvailable(true);
  assert.equal(calls.filter(call => call === 'banner-request').length, 2);
  assert.equal(timers.size, 0);
});

function setupNetworkLifecycle(options = {}) {
  const changes = [];
  const windowEvents = new Map();
  let nativeEvent;
  let foregroundEvent;
  let reads = 0;
  let removed = 0;
  let probes = 0;
  const { observeNativeNetwork } = loadTs('../services/networkLifecycle.ts', {
    '@capacitor/network': { Network: {
      getStatus: async () => { reads++; return options.status?.(reads) ?? { connected: true, connectionType: 'wifi' }; },
      addListener: async (_name, callback) => {
        nativeEvent = callback;
        await options.registration?.();
        return { remove: async () => { removed++; } };
      },
    } },
    './bannerLifecycle': { observeBannerForeground: callback => { foregroundEvent = callback; callback(true); return () => {}; } },
  }, {
    AbortController, URL,
    location: { origin: 'https://rizzmaster.online', protocol: 'https:', hostname: 'rizzmaster.online' },
    window: { addEventListener: (event, callback) => windowEvents.set(event, callback), removeEventListener: event => windowEvents.delete(event) },
    fetch: async (url, init) => {
      probes++;
      assert.equal(url.href, 'https://rizzmaster.online/manifest.webmanifest');
      assert.equal(init.method, 'HEAD');
      assert.equal(init.cache, 'no-store');
      assert.equal(init.credentials, 'omit');
      return options.fetch ? await options.fetch(init.signal) : { ok: true, headers: { get: () => 'application/manifest+json' } };
    },
  });
  const observer = observeNativeNetwork(connected => changes.push(connected));
  return {
    observer, changes, windowEvents, nativeEvent: status => nativeEvent(status), foregroundEvent: active => foregroundEvent(active),
    get reads() { return reads; }, get removed() { return removed; }, get probes() { return probes; },
  };
}

test('an old offline snapshot cannot overwrite a newer online native event', async t => {
  let finish;
  const state = setupNetworkLifecycle({ status: () => new Promise(resolve => { finish = resolve; }) });
  t.after(() => state.observer.dispose());
  state.nativeEvent({ connected: true, connectionType: 'wifi' });
  finish({ connected: false, connectionType: 'none' });
  await state.observer.refresh();
  assert.deepEqual(state.changes, [true]);
});

test('late network snapshots and listener registration are ignored and cleaned up after unmount', async () => {
  let finish;
  let register;
  const state = setupNetworkLifecycle({
    status: () => new Promise(resolve => { finish = resolve; }),
    registration: () => new Promise(resolve => { register = resolve; }),
  });
  state.observer.dispose();
  finish({ connected: false, connectionType: 'none' });
  register();
  await delay(0);
  assert.deepEqual(state.changes, []);
  assert.equal(state.removed, 1);
  assert.equal(state.windowEvents.size, 0);
});

test('native foreground resume rechecks connectivity instead of retaining an old offline state', async t => {
  const state = setupNetworkLifecycle({ status: reads => ({ connected: reads > 1, connectionType: reads > 1 ? 'wifi' : 'none' }) });
  t.after(() => state.observer.dispose());
  await state.observer.refresh();
  assert.deepEqual(state.changes, [false]);
  state.foregroundEvent(false);
  state.foregroundEvent(true);
  await state.observer.refresh();
  assert.deepEqual(state.changes, [false, true]);
  assert.equal(state.reads, 2);
});

test('resuming during an old network snapshot queues a fresh read after that snapshot settles', async t => {
  let finish;
  const state = setupNetworkLifecycle({ status: reads => reads === 1
    ? new Promise(resolve => { finish = resolve; }) : { connected: true, connectionType: 'wifi' },
  });
  t.after(() => state.observer.dispose());
  state.foregroundEvent(false);
  state.foregroundEvent(true);
  finish({ connected: false, connectionType: 'none' });
  await delay(0);
  assert.deepEqual(state.changes, [true]);
  assert.equal(state.reads, 2);
});

test('a reachable HTTPS origin can recover an unvalidated native transport', async t => {
  const state = setupNetworkLifecycle({ status: () => ({ connected: false, connectionType: 'wifi' }) });
  t.after(() => state.observer.dispose());
  await state.observer.refresh();
  assert.deepEqual(state.changes, [true]);
  assert.equal(state.probes, 1);
});

test('no transport, failed probes and captive portal HTML cannot be treated as online', async t => {
  for (const options of [
    { status: () => ({ connected: false, connectionType: 'none' }) },
    { status: () => ({ connected: false, connectionType: 'wifi' }), fetch: () => { throw new Error('Offline'); } },
    { status: () => ({ connected: false, connectionType: 'wifi' }), fetch: () => ({ ok: true, headers: { get: () => 'text/html' } }) },
  ]) {
    const state = setupNetworkLifecycle(options);
    t.after(() => state.observer.dispose());
    await state.observer.refresh();
    assert.deepEqual(state.changes, [false]);
    if (options.status().connectionType === 'none') assert.equal(state.probes, 0);
  }
});

test('an older reachability probe cannot overwrite a newer real disconnection', async t => {
  let finish;
  const state = setupNetworkLifecycle({
    status: () => ({ connected: false, connectionType: 'wifi' }),
    fetch: () => new Promise(resolve => { finish = resolve; }),
  });
  t.after(() => state.observer.dispose());
  while (!finish) await delay(0);
  state.nativeEvent({ connected: false, connectionType: 'none' });
  finish({ ok: true, headers: { get: () => 'application/manifest+json' } });
  await state.observer.refresh();
  assert.deepEqual(state.changes, [false]);
});

test('a stale initial inactive response cannot hide a banner after a newer native resume', async () => {
  const lifecycle = setupBannerLifecycle();
  lifecycle.state(false);
  lifecycle.state(true);
  lifecycle.resolveState(false);
  await delay(0);
  assert.deepEqual(lifecycle.changes, [true, false, true]);
  lifecycle.stop();
});

test('WebView visibility cannot resume a banner while its native Activity is inactive', async () => {
  const lifecycle = setupBannerLifecycle();
  lifecycle.state(false);
  lifecycle.handlers.get('visibilitychange')();
  assert.equal(lifecycle.changes.at(-1), false);
  lifecycle.document.visibilityState = 'hidden';
  lifecycle.state(true);
  assert.equal(lifecycle.changes.at(-1), false);
  lifecycle.document.visibilityState = 'visible';
  lifecycle.handlers.get('visibilitychange')();
  assert.equal(lifecycle.changes.at(-1), true);
  lifecycle.stop();
  await delay(0);
  assert.equal(lifecycle.removed(), 1);
  assert.equal(lifecycle.handlers.size, 0);
});

test('late native lifecycle registration and state resolve safely after owner cleanup', async () => {
  const lifecycle = setupBannerLifecycle({ lateListener: true });
  lifecycle.stop();
  lifecycle.resolveListener();
  lifecycle.resolveState(false);
  lifecycle.state(false);
  await delay(0);
  assert.deepEqual(lifecycle.changes, [true]);
  assert.equal(lifecycle.removed(), 1);
});

test('APKs without native App events still track WebView visibility', () => {
  const lifecycle = setupBannerLifecycle({ native: false });
  lifecycle.document.visibilityState = 'hidden';
  lifecycle.handlers.get('visibilitychange')();
  lifecycle.document.visibilityState = 'visible';
  lifecycle.handlers.get('visibilitychange')();
  assert.deepEqual(lifecycle.changes, [true, false, true]);
  lifecycle.stop();
});

test('retained empty banner retries once on the same view, and a later SDK load cancels its retry', async t => {
  const state = setupBanner({ noLoad: true });
  const { controller, callbacks, bannerEvents, calls, timers } = state;
  t.after(() => controller.dispose());
  await controller.setMode('visible');
  callbacks.get(bannerEvents.FailedToLoad)({ code: 3, viewRetained: true, hasLoadedAd: false, refreshFailure: false });
  await controller.setMode('hidden');
  await controller.setMode('visible');
  assert.equal(calls.filter(x => x === 'banner-request').length, 1);
  assert.equal(calls.includes('banner-remove'), false);
  const retry = [...timers.values()].find(x => x.ms === 60000);
  assert.ok(retry);
  state.advance(60000);
  retry.callback();
  await delay(0);
  assert.equal(calls.filter(x => x === 'banner-request').length, 2);
  assert.ok(calls.lastIndexOf('banner-resume') < calls.lastIndexOf('banner-request'));
  assert.ok(calls.includes('banner-resume'), 'A retained view hidden during backoff must resume before reloading');
  assert.equal(calls.includes('banner-remove'), false);
  callbacks.get(bannerEvents.Loaded)();
  callbacks.get(bannerEvents.FailedToLoad)({ code: 0, viewRetained: true, hasLoadedAd: true, refreshFailure: true });
  await controller.setMode('visible');
  assert.equal(calls.filter(x => x === 'banner-request').length, 2);
});

test('a confirmed unconsumed native rejection preserves the reward for the next opt-in', async () => {
  const { service, plugin, listeners, calls, events } = setup();
  await service.prepareRewardVideo('reward');
  const loadedAt = service.rewardVideoPreparedAt;
  plugin.showRewardVideoAd = async () => { throw Object.assign(new Error('Activity unavailable'), { code: 'AD_NOT_FOREGROUND' }); };
  assert.equal(await service.showRewardVideo('reward'), false);
  assert.equal(service.hasFreshRewardVideo('reward'), true);
  assert.equal(service.rewardVideoPreparedAt, loadedAt);
  assert.equal(service.isRewardVideoShowing, false);
  plugin.showRewardVideoAd = async () => {
    listeners.get(events.Showed)?.();
    listeners.get(events.Rewarded)?.({ amount: 5 });
    listeners.get(events.Dismissed)?.();
    return { amount: 5 };
  };
  assert.equal(await service.showRewardVideo('reward'), true);
  assert.equal(calls.filter(x => x === 'reward-request').length, 1);
  assert.equal(service.hasFreshRewardVideo('reward'), false);
});

test('an older native bridge with an unknown show rejection cannot restore a possibly consumed reward', async () => {
  const { service, plugin } = setup();
  await service.prepareRewardVideo('reward');
  plugin.showRewardVideoAd = async () => { throw new Error('Unknown native failure'); };
  assert.equal(await service.showRewardVideo('reward'), false);
  assert.equal(service.hasFreshRewardVideo('reward'), false);
});

test('a privacy change during a rejected reward show cannot resurrect its cached ad', async () => {
  const { service, plugin } = setup();
  await service.prepareRewardVideo('reward');
  plugin.showRewardVideoAd = async () => {
    service.applyConsentInfo(denied);
    throw Object.assign(new Error('No activity'), { code: 'AD_NOT_FOREGROUND' });
  };
  assert.equal(await service.showRewardVideo('reward'), false);
  assert.equal(service.hasFreshRewardVideo('reward'), false);
});

function recoveryHarness(service, path, start) {
  let foreground;
  let now = 100000;
  let next = 0;
  const timers = new Map();
  const module = loadTs(path, {
    './admobService': { AdMobService: service },
    './bannerLifecycle': { observeBannerForeground: callback => { foreground = callback; callback(true); return () => {}; } },
    './adDiagnostics': { recordAdEvent() {} },
  }, {
    Date: class extends Date { static now() { return now; } },
    setTimeout: (callback, ms) => { const id = ++next; timers.set(id, { callback, ms }); return id; },
    clearTimeout: id => timers.delete(id),
  });
  const result = start(module);
  return { result, timers, foreground: value => foreground(value),
    fire() { const [id, timer] = timers.entries().next().value; timers.delete(id); now += timer.ms; timer.callback(); } };
}

test('startup retries independently without a banner, respects offline/background and stops cleanly', async () => {
  let attempts = 0;
  const { service } = setup({ initialize: () => { if (++attempts === 1) throw new Error('Temporary SDK failure'); } });
  let wakes = 0;
  service.subscribeRecovery(() => wakes++);
  const state = recoveryHarness(service, '../services/adRecovery.ts', module => module.startAdRecovery(true));
  await delay(0);
  assert.equal(attempts, 1);
  assert.equal(state.timers.size, 1);
  state.foreground(false);
  assert.equal(state.timers.size, 0);
  state.result.setOnline(false);
  state.foreground(true);
  await delay(0);
  assert.equal(attempts, 1);
  state.result.setOnline(true);
  await delay(0);
  assert.equal(attempts, 2);
  assert.equal(service.initialized, true);
  assert.ok(wakes > 0);
  assert.equal(state.timers.size, 0);
  state.result.stop();
  state.foreground(true);
  assert.equal(state.timers.size, 0);
});

test('startup retries a failed SDK automatically without another UI trigger', async () => {
  let attempts = 0;
  const { service } = setup({ initialize: () => { if (++attempts < 2) throw new Error('Retry'); } });
  const state = recoveryHarness(service, '../services/adRecovery.ts', module => module.startAdRecovery(true));
  await delay(0);
  assert.equal(attempts, 1);
  assert.equal([...state.timers.values()][0].ms, 15000);
  state.fire();
  await delay(0);
  assert.equal(attempts, 2);
  assert.equal(service.initialized, true);
  assert.equal(state.timers.size, 0);
  state.result.stop();
});

test('open rewarded offers retry bounded failures, respect recovery pacing and stop after success', async () => {
  const { service } = setup();
  let requests = 0;
  const state = recoveryHarness(service, '../services/rewardOfferPreload.ts', module => module.startRewardOfferPreload(async allowed => {
    assert.equal(allowed(), true);
    return ++requests >= 2;
  }, () => true));
  await delay(0);
  assert.equal(requests, 1);
  service.wakePendingAds();
  await delay(0);
  assert.equal(requests, 1, 'Reconnect/readiness must not bypass an actual failure deadline');
  state.fire();
  await delay(0);
  assert.equal(requests, 2);
  assert.equal(state.timers.size, 0);
  service.wakePendingAds();
  assert.equal(requests, 2);
  state.result();
});

test('reward offer recovery stops at three failures and never loads after its offer closes', async () => {
  const { service } = setup();
  let requests = 0;
  const state = recoveryHarness(service, '../services/rewardOfferPreload.ts', module => module.startRewardOfferPreload(async () => { requests++; return false; }, () => true));
  await delay(0);
  for (let i = 0; i < 2; i++) { state.fire(); await delay(0); }
  assert.equal(requests, 3);
  assert.equal(state.timers.size, 0);
  state.result();
  service.wakePendingAds();
  state.foreground(true);
  assert.equal(requests, 3);
});

test('closing an offer during async preparation prevents a late native request', async () => {
  const { service } = setup();
  let finishContext;
  let requests = 0;
  const state = recoveryHarness(service, '../services/rewardOfferPreload.ts', module => module.startRewardOfferPreload(async canPrepare => {
    await new Promise(resolve => { finishContext = resolve; });
    if (!canPrepare()) return false;
    requests++;
    return true;
  }, () => true));
  state.result();
  finishContext();
  await delay(0);
  assert.equal(requests, 0);
  assert.equal(state.timers.size, 0);
});
