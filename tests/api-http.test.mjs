import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createApiServer } from '../server/api/_http-server.js';
import vercelHandler from '../api/index.js';

let direct;
let rewritten;
const servers = [];

async function listen(server) {
  servers.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return `http://127.0.0.1:${server.address().port}`;
}

before(async () => {
  direct = await listen(createApiServer());
  rewritten = await listen(http.createServer((req, res) => {
    req.query = Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
    void vercelHandler(req, res);
  }));
});

after(async () => {
  await Promise.all(servers.map(server => new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close(error => error ? reject(error) : resolve());
  })));
});

const preflight = (url, origin = 'https://localhost') => fetch(url, {
  method: 'OPTIONS',
  headers: {
    Origin: origin,
    'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'authorization,content-type',
  },
  signal: AbortSignal.timeout(15_000),
});

async function assertPreflight(response, origin) {
  assert.equal(response.status, 204);
  assert.equal(await response.text(), '');
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.ok(response.headers.get('access-control-allow-methods').includes('POST'));
  assert.ok(response.headers.get('access-control-allow-headers').includes('Authorization'));
  assert.equal(response.headers.get('vary'), 'Origin');
}

test('native preflights return empty 204 responses through the shared HTTP adapter', async () => {
  for (const route of ['/api/ai', '/api/profile', '/api/rewarded-ad/status', '/api/rewarded-ad/complete']) {
    await assertPreflight(await preflight(direct + route), 'https://localhost');
  }
});

test('Vercel rewritten API routes support Android and Capacitor preflights', async () => {
  for (const origin of ['https://localhost', 'capacitor://localhost']) {
    for (const route of ['ai', 'rewarded-ad/complete']) {
      await assertPreflight(await preflight(`${rewritten}/api/index?__route=${route}`, origin), origin);
    }
  }
});

test('an untrusted origin is not granted cross-origin API access', async () => {
  const response = await preflight(`${rewritten}/api/index?__route=ai`, 'https://untrusted.example');
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('normal JSON and error responses retain their bodies and status codes', async () => {
  const unauthenticated = await fetch(`${rewritten}/api/index?__route=ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(unauthenticated.status, 401);
  assert.equal((await unauthenticated.json()).code, 'LOGIN_REQUIRED');
  const unknown = await fetch(`${direct}/api/unknown`, { signal: AbortSignal.timeout(5_000) });
  assert.equal(unknown.status, 404);
  assert.equal((await unknown.json()).error, 'API route not found.');
  const invalidJson = await fetch(`${rewritten}/api/index?__route=ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{invalid',
    signal: AbortSignal.timeout(5_000),
  });
  assert.equal(invalidJson.status, 400);
  assert.equal((await invalidJson.json()).error, 'Invalid JSON body.');
});
