import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { Capacitor } from '@capacitor/core';

const server = await createServer({ configFile: false, cacheDir: 'node_modules/.vite-tests-native-sharing', server: { middlewareMode: true, watch: null, hmr: false }, appType: 'custom' });
after(() => server.close());
const { createNativeRizzSharing, isShareCancellation } = await server.ssrLoadModule('/services/nativeRizzSharing.ts');
const { canUseRizzSharing } = await server.ssrLoadModule('/services/rizzSharing.ts');

function harness(overrides = {}) {
  const shares = [], copies = [], writes = [], deletes = [], exports = [];
  const deps = {
    share: { share: async data => { shares.push(data); return { activityType: 'com.example.receiver' }; } },
    clipboard: { write: async data => copies.push(data) },
    filesystem: {
      readdir: async () => ({ files: [] }),
      writeFile: async data => { writes.push(data); return { uri: `file:///cache/${data.path}` }; },
      deleteFile: async data => deletes.push(data),
    },
    cardExport: { savePng: async data => { exports.push(data); return { saved: true }; } },
    toBase64: async () => 'cG5n', now: () => 200000000, uniqueId: () => 'unique-id',
    ...overrides,
  };
  return { actions: createNativeRizzSharing(deps), deps, shares, copies, writes, deletes, exports };
}

test('native text shares only the selected reply, copies on failure, and respects plain-object cancellation', async () => {
  const h = harness();
  const text = 'Selected smooth reply';
  assert.equal(await h.actions.shareText(text), 'shared');
  assert.deepEqual(h.shares, [{ title: 'Rizz Master', text, dialogTitle: 'Share Rizz' }]);
  h.deps.share.share = async () => { throw { message: 'Share canceled' }; };
  assert.equal(await h.actions.shareText(text), 'cancelled');
  assert.equal(h.copies.length, 0);
  h.deps.share.share = async () => ({ activityType: '' });
  assert.equal(await h.actions.shareText(text), 'cancelled');
  assert.equal(h.copies.length, 0);
  h.deps.share.share = async () => { throw new Error('Plugin unavailable'); };
  assert.equal(await h.actions.shareText(text), 'copied');
  assert.deepEqual(h.copies, [{ string: text }]);
  h.deps.clipboard.write = async () => { throw new Error('Copy failed'); };
  await assert.rejects(h.actions.shareText(text), /Copy failed/);
  assert.equal(isShareCancellation({ message: 'Cannot share while sharing is in progress' }), false);
  assert.equal(isShareCancellation(new DOMException('cancelled', 'AbortError')), true);
});

test('native card sharing writes a unique PNG to cache and retains the file for receiving apps', async () => {
  const h = harness();
  assert.equal(await h.actions.shareCard(new Blob(['png'], { type: 'image/png' })), 'shared');
  assert.deepEqual(h.writes[0], { path: 'rizz-share/rizzmaster-200000000-unique-id.png', directory: 'CACHE', data: 'cG5n', recursive: true });
  assert.deepEqual(h.shares[0], { title: 'Rizz Master', files: ['file:///cache/rizz-share/rizzmaster-200000000-unique-id.png'], dialogTitle: 'Share Rizz Card' });
  assert.equal(h.deletes.length, 0);
  h.deps.share.share = async () => { throw { message: 'Share cancelled' }; };
  assert.equal(await h.actions.shareCard(new Blob(['png'], { type: 'image/png' })), 'cancelled');
  assert.equal(h.exports.length, 0);
  h.deps.share.share = async () => { throw new Error('Sharing failed'); };
  await assert.rejects(h.actions.shareCard(new Blob(['png'], { type: 'image/png' })), /Sharing failed/);
});

test('save picker reports cancellation accurately and cleans temporary files after success or failure', async () => {
  const h = harness();
  const blob = new Blob(['png'], { type: 'image/png' });
  assert.equal(await h.actions.saveCard(blob), 'saved');
  assert.deepEqual(h.exports[0], { uri: 'file:///cache/rizz-share/rizzmaster-200000000-unique-id.png', filename: 'rizzmaster-200000000-unique-id.png' });
  assert.equal(h.deletes.length, 1);
  h.deps.cardExport.savePng = async () => ({ saved: false });
  assert.equal(await h.actions.saveCard(blob), 'cancelled');
  assert.equal(h.deletes.length, 2);
  h.deps.cardExport.savePng = async () => { throw new Error('Storage full'); };
  await assert.rejects(h.actions.saveCard(blob), /Storage full/);
  assert.equal(h.deletes.length, 3);
});

test('cache cleanup removes only expired card files and validates blobs before native writes', async () => {
  const h = harness();
  h.deps.filesystem.readdir = async () => ({ files: [
    { name: 'rizzmaster-old.png', type: 'file', mtime: 1 },
    { name: 'rizzmaster-new.png', type: 'file', mtime: 200000000 },
    { name: 'other-feature.png', type: 'file', mtime: 1 },
    { name: 'rizzmaster-folder.png', type: 'directory', mtime: 1 },
  ] });
  await h.actions.shareCard(new Blob(['png'], { type: 'image/png' }));
  assert.deepEqual(h.deletes, [{ path: 'rizz-share/rizzmaster-old.png', directory: 'CACHE' }]);
  await assert.rejects(h.actions.shareCard(new Blob(['bad'], { type: 'text/plain' })), /not a valid PNG/);
  await assert.rejects(h.actions.shareCard(new Blob([], { type: 'image/png' })), /not a valid PNG/);
  await assert.rejects(h.actions.shareCard(new Blob([new Uint8Array(10 * 1024 * 1024 + 1)], { type: 'image/png' })), /too large/);
  assert.equal(h.writes.length, 1);
});

test('hosted UI preserves Copy in old APKs and enables sharing only with the native capabilities', () => {
  const originalNative = Capacitor.isNativePlatform, originalPlatform = Capacitor.getPlatform, originalAvailable = Capacitor.isPluginAvailable;
  try {
    Capacitor.isNativePlatform = () => false;
    assert.equal(canUseRizzSharing(), true);
    Capacitor.isNativePlatform = () => true;
    Capacitor.getPlatform = () => 'android';
    Capacitor.isPluginAvailable = () => false;
    assert.equal(canUseRizzSharing(), false);
    Capacitor.isPluginAvailable = name => name !== 'RizzCardExport';
    assert.equal(canUseRizzSharing(), false);
    Capacitor.isPluginAvailable = () => true;
    assert.equal(canUseRizzSharing(), true);
  } finally { Capacitor.isNativePlatform = originalNative; Capacitor.getPlatform = originalPlatform; Capacitor.isPluginAvailable = originalAvailable; }
});
