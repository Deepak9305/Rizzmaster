import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const server = await createServer({ configFile: false, server: { middlewareMode: true, watch: null }, appType: 'custom' });
after(() => server.close());
const { shareLine } = await server.ssrLoadModule('/components/rizzline/browserActions.ts');
const { createLineCard, shareCardBlob } = await server.ssrLoadModule('/components/rizzline/cardActions.ts');

function replaceGlobal(key, value) {
  const original = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, value });
  return () => original ? Object.defineProperty(globalThis, key, original) : delete globalThis[key];
}

test('text sharing uses the selected reply, copies on unavailable/failed sharing, and leaves cancellation alone', async () => {
  const shares = [], copies = [];
  const restoreWindow = replaceGlobal('window', { isSecureContext: true });
  const restoreNavigator = replaceGlobal('navigator', {
    clipboard: { writeText: async text => copies.push(text) },
    share: async data => shares.push(data),
  });
  try {
    const text = 'You are making it very hard to play it cool.';
    assert.equal(await shareLine(text, 'Rizz Master'), 'shared');
    assert.deepEqual(shares[0], { title: 'Rizz Master', text });
    assert.equal(copies.length, 0);
    navigator.share = async () => { throw new DOMException('Cancelled', 'AbortError'); };
    assert.equal(await shareLine(text, 'Rizz Master'), 'cancelled');
    assert.equal(copies.length, 0);
    navigator.share = async () => { throw new Error('Sharing blocked'); };
    assert.equal(await shareLine(text, 'Rizz Master'), 'copied');
    navigator.share = undefined;
    assert.equal(await shareLine(text, 'Rizz Master'), 'copied');
    assert.deepEqual(copies, [text, text]);
    navigator.clipboard.writeText = async () => { throw new Error('Clipboard blocked'); };
    const restoreHTMLElement = replaceGlobal('HTMLElement', class {});
    const restoreDocument = replaceGlobal('document', {
      activeElement: null,
      createElement: () => ({ style: {}, setAttribute() {}, select() {}, remove() {} }),
      body: { appendChild() {} },
      execCommand: () => false,
    });
    try { await assert.rejects(shareLine(text, 'Rizz Master'), /Copy unavailable/); }
    finally { restoreDocument(); restoreHTMLElement(); }
  } finally { restoreNavigator(); restoreWindow(); }
});

test('card export wraps all reply text, including paragraphs and long words, and uses configured branding', async () => {
  const written = [], colors = [];
  const ctx = {
    font: '',
    createLinearGradient: () => ({ addColorStop: (_, color) => colors.push(color) }),
    fillRect() {}, beginPath() {}, roundRect() {}, stroke() {}, moveTo() {}, lineTo() {},
    measureText(text) { return { width: Array.from(text).length * Number(this.font.match(/(\d+)px/)?.[1] || 24) * 0.6 }; },
    fillText(text, x, y) { written.push({ text, x, y, font: this.font }); },
  };
  let canvas;
  const restoreDocument = replaceGlobal('document', {
    fonts: { ready: Promise.resolve() },
    createElement: () => (canvas = { getContext: () => ctx, toBlob: callback => callback(new Blob(['png'], { type: 'image/png' })) }),
  });
  try {
    for (const category of ['Tease', 'Smooth', 'Chaotic']) {
      written.length = 0;
      const text = 'A first paragraph.\n' + 'A longer reply that should stay fully readable. '.repeat(100) + 'x'.repeat(180);
      const blob = await createLineCard(text, category, 'midnight', 'Alex', { brand: 'Rizz Master', url: 'rizzmaster.online' });
      assert.equal(blob.type, 'image/png');
      assert.equal(canvas.width, 1080);
      assert.ok(canvas.height > 1350);
      assert.ok(colors.includes('#291c4a'));
      assert.ok(written.some(item => item.text === category.toUpperCase()));
      assert.ok(written.some(item => item.text === 'Rizz Master'));
      assert.ok(written.some(item => item.text === 'rizzmaster.online'));
      assert.ok(written.some(item => item.text === '— Alex'));
      const quote = written.filter(item => item.y >= 340 && item.y < canvas.height - 330 && item.text !== '“');
      assert.equal(quote.map(item => item.text).join('').replace(/\s/g, ''), text.replace(/\s/g, ''));
      assert.ok(quote.every(item => Array.from(item.text).length * Number(item.font.match(/(\d+)px/)[1]) * 0.6 <= 880));
      assert.ok(written.every(item => item.y > 50 && item.y < canvas.height - 50));
    }
    written.length = 0;
    await createLineCard('A short reply.', 'Smooth', 'rose', '', { brand: 'Rizz Master', url: 'rizzmaster.online' });
    assert.equal(canvas.height, 1350);
  } finally { restoreDocument(); }
});

test('card generation reports missing canvas and PNG export failures for the popup retry flow', async () => {
  const restoreDocument = replaceGlobal('document', {
    fonts: { ready: Promise.resolve() },
    createElement: () => ({ getContext: () => null }),
  });
  try {
    await assert.rejects(createLineCard('Reply', 'Smooth', 'rose'), /Image export unavailable/);
    const ctx = {
      createLinearGradient: () => ({ addColorStop() {} }),
      fillRect() {}, beginPath() {}, roundRect() {}, stroke() {}, moveTo() {}, lineTo() {}, fillText() {},
      measureText: () => ({ width: 100 }),
    };
    document.createElement = () => ({ getContext: () => ctx, toBlob: callback => callback(null) });
    await assert.rejects(createLineCard('Reply', 'Smooth', 'rose'), /Image export failed/);
  } finally { restoreDocument(); }
});

test('image sharing uses Rizz Master filenames, respects cancellation, and downloads when unsupported', async () => {
  const shares = [], downloads = [], revoked = [];
  const restoreNavigator = replaceGlobal('navigator', { canShare: () => true, share: async data => shares.push(data) });
  const restoreDocument = replaceGlobal('document', {
    createElement: () => ({ click() { downloads.push({ href: this.href, filename: this.download }); }, remove() {} }),
    body: { appendChild() {} },
  });
  const restoreWindow = replaceGlobal('window', { setTimeout: callback => callback() });
  const originalRevoke = URL.revokeObjectURL;
  URL.revokeObjectURL = url => { revoked.push(url); originalRevoke.call(URL, url); };
  const blob = new Blob(['png'], { type: 'image/png' });
  const options = { title: 'Rizz Master', filename: 'rizzmaster-rizz-card.png' };
  try {
    assert.equal(await shareCardBlob(blob, options), 'shared');
    assert.equal(shares[0].title, 'Rizz Master');
    assert.equal(shares[0].files[0].name, options.filename);
    assert.equal(await shares[0].files[0].text(), 'png');
    navigator.share = async () => { throw new DOMException('Cancelled', 'AbortError'); };
    assert.equal(await shareCardBlob(blob, options), 'cancelled');
    assert.equal(downloads.length, 0);
    navigator.share = async () => { throw new Error('Sharing failed'); };
    await assert.rejects(shareCardBlob(blob, options), /Sharing failed/);
    navigator.canShare = () => false;
    assert.equal(await shareCardBlob(blob, options), 'downloaded');
    assert.equal(downloads[0].filename, options.filename);
    assert.ok(downloads[0].href.startsWith('blob:'));
    assert.deepEqual(revoked, [downloads[0].href]);
  } finally {
    URL.revokeObjectURL = originalRevoke;
    restoreWindow(); restoreDocument(); restoreNavigator();
  }
});
