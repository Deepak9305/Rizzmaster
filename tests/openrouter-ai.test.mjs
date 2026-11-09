import test, { before, after, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import handler from '../server/api/ai.js';
import { DEFAULT_TEXT_MODEL, generateText } from '../server/api/_text-ai.js';

const originalEnv = { ...process.env };
const requests = [];
let server;
let responseMode = 'success';
let ip = 0;
const request = {
  model: 'openai/gpt-oss-120b',
  messages: [{ role: 'user', content: 'Write three short replies.' }],
  temperature: 0.9,
  max_tokens: 1000,
};

before(async () => {
  server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
    res.setHeader('Content-Type', 'application/json');
    if (responseMode === 'error') {
      res.writeHead(503).end(JSON.stringify({ error: { message: 'Provider unavailable' } }));
    } else if (responseMode === 'slow') {
      // A client timeout must close this connection without making another attempt.
    } else {
      res.end(JSON.stringify({
        id: 'test',
        choices: [{
          finish_reason: responseMode === 'truncated' ? 'length' : 'stop',
          message: {
            content: responseMode === 'empty' ? '' : 'A useful reply',
            reasoning: 'Private reasoning must never reach the client',
          },
        }],
      }));
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.OPENROUTER_BASE_URL = `http://127.0.0.1:${server.address().port}/api/v1`;
  process.env.OPENROUTER_API_KEY = 'test-openrouter-key';
  delete process.env.OPENROUTER_MODEL;
});

beforeEach(() => { requests.length = 0; responseMode = 'success'; });
after(async () => {
  mock.restoreAll();
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

async function callHandler(body) {
  let status;
  let payload;
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer unauthenticated', 'x-forwarded-for': `test-${++ip}` },
    body,
  }, {
    status(value) { status = value; return this; },
    setHeader() {},
    send(value) { payload = JSON.parse(value); },
  });
  return { status, payload };
}

test('all text budgets use only DeepSeek with bounded low reasoning and private reasoning excluded', async () => {
  for (const max_tokens of [400, 600, 650, 900, 1000]) {
    assert.equal(await generateText({ ...request, max_tokens }, 2000), 'A useful reply');
    const upstream = requests.at(-1);
    assert.equal(upstream.url, '/api/v1/chat/completions');
    assert.equal(upstream.headers.authorization, 'Bearer test-openrouter-key');
    assert.equal(upstream.body.model, DEFAULT_TEXT_MODEL);
    assert.deepEqual(upstream.body.reasoning, { effort: 'low', exclude: true });
    assert.equal(upstream.body.max_tokens, max_tokens + 1024);
    assert.equal(upstream.body.models, undefined);
  }
});

test('legacy Android IDs and the new web ID both route to DeepSeek', async () => {
  for (const model of ['openai/gpt-oss-120b', 'llama-3.3-70b-versatile', DEFAULT_TEXT_MODEL]) {
    assert.deepEqual(await callHandler({ ...request, model }), {
      status: 200, payload: { content: 'A useful reply' },
    });
    assert.equal(requests.at(-1).body.model, DEFAULT_TEXT_MODEL);
  }
});

test('image requests analyze with Gemini then write with DeepSeek without forwarding the image', async () => {
  const originalFetch = globalThis.fetch;
  let analysisCalls = 0;
  const analysis = mock.method(globalThis, 'fetch', async (url, options) => {
    if (!String(url).includes('generativelanguage.googleapis.com')) return originalFetch(url, options);
    analysisCalls += 1;
    return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'Screenshot: they asked about coffee.' }] } }] });
  });
  process.env.GEMINI_API_KEY = 'test';
  try {
    const result = await callHandler({ ...request, messages: [{ role: 'user', content: [
      { type: 'text', text: 'Help me reply' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,dGVzdA==' } },
    ] }] });
    assert.equal(result.status, 200);
    assert.equal(analysisCalls, 1);
    assert.equal(requests[0].body.model, DEFAULT_TEXT_MODEL);
    assert.match(requests[0].body.messages[0].content, /Screenshot: they asked about coffee/);
    assert.doesNotMatch(JSON.stringify(requests[0].body), /data:image/);
  } finally { analysis.mock.restore(); }
});

test('provider failures, empty output and truncation fail without a backup or retry', async () => {
  for (const mode of ['error', 'empty', 'truncated']) {
    responseMode = mode;
    requests.length = 0;
    const result = await callHandler(request);
    assert.equal(result.status, 502);
    assert.equal(requests.length, 1);
  }
});

test('missing OpenRouter key never uses an available Groq key', async () => {
  delete process.env.OPENROUTER_API_KEY;
  process.env.GROQ_API_KEY = 'unused-legacy-key';
  try {
    const result = await callHandler(request);
    assert.equal(result.status, 502);
    assert.match(result.payload.error, /OpenRouter API key/);
    assert.equal(requests.length, 0);
  } finally { process.env.OPENROUTER_API_KEY = 'test-openrouter-key'; }
});

test('timeout aborts the provider request without retrying', async () => {
  responseMode = 'slow';
  await assert.rejects(generateText(request, 50), /timed out/i);
  assert.equal(requests.length, 1);
});

test('server model override is used but arbitrary client models are rejected', async () => {
  process.env.OPENROUTER_MODEL = 'deepseek/deepseek-v4.1-flash-1017';
  try {
    await generateText(request, 2000);
    assert.equal(requests[0].body.model, process.env.OPENROUTER_MODEL);
    const result = await callHandler({ ...request, model: 'arbitrary/client-model' });
    assert.equal(result.status, 400);
    assert.equal(requests.length, 1);
  } finally { delete process.env.OPENROUTER_MODEL; }
});
