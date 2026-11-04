import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const store = new Map();
let display = 'prompt';
const schedules = [];
globalThis.__notificationTest = {
  LocalNotifications: {
    checkPermissions: async () => ({ display }),
    requestPermissions: async () => { throw new Error('Unexpected permission dialog'); },
    getPending: async () => ({ notifications: [] }),
    schedule: async batch => schedules.push(batch),
  },
  Preferences: {
    get: async ({ key }) => ({ value: store.get(key) ?? null }),
    set: async ({ key, value }) => { store.set(key, value); },
  },
};
const server = await createServer({
  configFile: false,
  ssr: { noExternal: true },
  server: { middlewareMode: true, watch: null, hmr: false },
  appType: 'custom',
  plugins: [{
    name: 'notification-test-plugins',
    enforce: 'pre',
    resolveId(id) {
      if (['@capacitor/core', '@capacitor/local-notifications', '@capacitor/preferences'].includes(id)) return '\0mock:' + id;
    },
    load(id) {
      if (id === '\0mock:@capacitor/core') return 'export const Capacitor = { isNativePlatform: () => true, isPluginAvailable: () => true };';
      if (id === '\0mock:@capacitor/local-notifications') return 'export const LocalNotifications = globalThis.__notificationTest.LocalNotifications;';
      if (id === '\0mock:@capacitor/preferences') return 'export const Preferences = globalThis.__notificationTest.Preferences;';
    },
  }],
});
after(async () => { await server.close(); delete globalThis.__notificationTest; });
const { createNotificationPermissionGate } = await server.ssrLoadModule('/services/notificationPermission.ts');
const { NotificationService } = await server.ssrLoadModule('/services/notificationService.ts');

function harness(initial = 'prompt', saved = null) {
  let decision = saved, status = initial, requests = 0;
  const deps = {
    checkPermissions: async () => ({ display: status }),
    getDecision: async () => decision,
    saveDecision: async value => { decision = value; },
    requestPermissions: async () => { requests++; return { display: status = 'denied' }; },
  };
  return { deps, gate: createNotificationPermissionGate(deps), decision: () => decision, requests: () => requests, setStatus: value => { status = value; } };
}

test('concurrent entry triggers ask once and a denial survives a new launch/account', async () => {
  const h = harness();
  assert.deepEqual(await Promise.all([h.gate(), h.gate(), h.gate()]), [false, false, false]);
  assert.equal(h.requests(), 1);
  assert.equal(h.decision(), 'declined');
  h.setStatus('prompt'); // Even if a device reports prompt again, our decision wins.
  assert.equal(await createNotificationPermissionGate(h.deps)(), false);
  assert.equal(h.requests(), 1);
});

test('allow is saved and later permission revocation does not prompt again', async () => {
  const h = harness();
  h.deps.requestPermissions = async () => ({ display: 'granted' });
  assert.equal(await h.gate(), true);
  assert.equal(h.decision(), 'granted');
  h.setStatus('denied');
  assert.equal(await h.gate(), false);
});

test('older-client denial and rationale states are respected', async () => {
  for (const state of ['denied', 'prompt-with-rationale']) {
    const h = harness(state);
    assert.equal(await h.gate(), false);
    assert.equal(h.requests(), 0);
    assert.equal(h.decision(), 'declined');
  }
});

test('interrupted OS request is saved before invocation and is never repeated', async () => {
  const h = harness();
  h.deps.requestPermissions = async () => {
    assert.equal(h.decision(), 'requested');
    throw new Error('Interrupted');
  };
  await assert.rejects(h.gate(), /Interrupted/);
  assert.equal(await createNotificationPermissionGate(h.deps)(), false);
});

test('existing grant works without asking, including a manual enable after declining', async () => {
  const h = harness('granted', 'declined');
  assert.equal(await h.gate(), true);
  assert.equal(h.requests(), 0);
});

test('leaving the eligible screen before the check completes prevents a dialog', async () => {
  const h = harness();
  assert.equal(await h.gate(() => false), false);
  assert.equal(h.requests(), 0);
  assert.equal(h.decision(), null);
});

test('resume scheduling with denied or unrequested permission never schedules or asks', async () => {
  schedules.length = 0;
  for (display of ['denied', 'prompt', 'prompt-with-rationale']) {
    await NotificationService.schedulePersonalizedNotifications();
  }
  assert.equal(schedules.length, 0);
});

test('granted reminders all use inexact alarms and retain seven daily tips', async () => {
  display = 'granted';
  schedules.length = 0;
  await NotificationService.schedulePersonalizedNotifications();
  assert.equal(schedules.length, 1);
  const { notifications } = schedules[0];
  assert.equal(notifications.length, 7);
  assert.deepEqual(notifications.map(n => n.id), [1001, 1002, 1003, 1004, 1005, 1006, 1007]);
  assert.ok(notifications.every(n => n.isExactNotification === false && n.schedule.at > new Date()));
});
