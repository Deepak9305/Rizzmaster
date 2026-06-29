import http from 'node:http';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const loadEnvFile = (fileName) => {
  const filePath = resolve(process.cwd(), fileName);
  if (!existsSync(filePath)) return;

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;

    const key = trimmed.slice(0, separator).trim();
    const rawValue = trimmed.slice(separator + 1).trim();
    if (!key || process.env[key] !== undefined) continue;

    process.env[key] = rawValue.replace(/^['"]|['"]$/g, '');
  }
};

loadEnvFile('.env');
loadEnvFile('.env.local');
loadEnvFile('.env.development');
loadEnvFile('.env.development.local');

const routes = {
  '/api/ai': () => import('./api/ai.js'),
  '/api/profile': () => import('./api/profile.js'),
  '/api/verify-purchase': () => import('./api/verify-purchase.js'),
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
};

const createResponseAdapter = (res) => {
  let statusCode = 200;

  return {
    setHeader: (...args) => res.setHeader(...args),
    status(code) {
      statusCode = code;
      return this;
    },
    json(payload) {
      res.statusCode = statusCode;
      if (!res.hasHeader('Content-Type')) {
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(JSON.stringify(payload));
    },
    send(payload) {
      res.statusCode = statusCode;
      res.end(payload);
    },
  };
};

const parseRequestBody = (rawBody) => {
  if (!rawBody || !rawBody.trim()) {
    return { ok: true, body: undefined };
  }

  try {
    return { ok: true, body: JSON.parse(rawBody) };
  } catch {
    return { ok: false };
  }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const loadRoute = routes[url.pathname];

  if (!loadRoute) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'API route not found.' }));
    return;
  }

  try {
    const rawBody = await readBody(req);
    req.rawBody = rawBody;
    const parsedBody = parseRequestBody(rawBody);
    if (!parsedBody.ok) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Invalid JSON body.' }));
      return;
    }

    req.body = parsedBody.body;
    req.query = Object.fromEntries(url.searchParams.entries());

    const route = await loadRoute();
    await route.default(req, createResponseAdapter(res));
  } catch (error) {
    console.error('[dev-api] Request failed:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify({ error: 'Local API request failed.' }));
  }
});

const port = Number(process.env.API_PORT || 3000);
server.listen(port, () => {
  console.log(`[dev-api] listening on http://localhost:${port}`);
});
