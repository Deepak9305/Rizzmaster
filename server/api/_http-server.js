import http from 'node:http';
import { routes } from './_routes.js';

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

export const handleApiRequest = async (req, res, { routePath } = {}) => {
  const url = new URL(req.url || '/', 'http://localhost');
  const loadRoute = routes[routePath || url.pathname];

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
    delete req.query.__route;

    const route = await loadRoute();
    await route.default(req, createResponseAdapter(res));
  } catch (error) {
    console.error('[api-server] Request failed:', error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
    }
    res.end(JSON.stringify({ error: 'Local API request failed.' }));
  }
};

export const createApiServer = () => http.createServer((req, res) =>
  handleApiRequest(req, res)
);
