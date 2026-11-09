import test, { before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import handler from '../server/api/ai.js';

const originalEnv = { ...process.env };
const requests = [];
let server;
let requestId = 0;

before(async () => {
  server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ choices: [{ message: { content: 'A useful reply' }, finish_reason: 'stop' }] }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  process.env.LLAMA_BASE_URL = `http://127.0.0.1:${server.address().port}/openai/v1`;
  process.env.GROQ_API_KEY = 'test-groq-key';
  delete process.env.LLAMA_API_KEY;
});

after(async () => {
  mock.restoreAll();
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
});

async function generate(body) {
  let status;
  let payload;
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer unauthenticated', 'x-forwarded-for': `groq-test-${++requestId}` },
    body: { model: 'openai/gpt-oss-120b', temperature: 0.9, ...body },
  }, {
    status(value) { status = value; return this; },
    setHeader() {},
    send(value) { payload = JSON.parse(value); },
  });
  return { status, payload };
}

test('reply, Bio and Coach token budgets retain Groq low reasoning with no extra token allowance', async () => {
  for (const max_tokens of [400, 600, 650, 900, 1000]) {
    const result = await generate({ messages: [{ role: 'user', content: 'Write a short reply.' }], max_tokens });
    assert.deepEqual(result, { status: 200, payload: { content: 'A useful reply' } });
    const upstream = requests.at(-1);
    assert.equal(upstream.url, '/openai/v1/chat/completions');
    assert.equal(upstream.headers.authorization, 'Bearer test-groq-key');
    assert.equal(upstream.body.model, 'openai/gpt-oss-120b');
    assert.equal(upstream.body.reasoning_effort, 'low');
    assert.equal(upstream.body.max_tokens, max_tokens);
    assert.equal(upstream.body.provider, undefined);
    assert.equal(upstream.body.reasoning, undefined);
  }
});

test('legacy Llama clients still map to OSS 120B', async () => {
  const result = await generate({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'user', content: 'Hello' }] });
  assert.equal(result.status, 200);
  assert.equal(requests.at(-1).body.model, 'openai/gpt-oss-120b');
});

test('Gemini image analysis is passed to Groq for reply writing', async () => {
  const originalFetch = globalThis.fetch;
  let analysisCalls = 0;
  const analysis = mock.method(globalThis, 'fetch', async (url, options) => {
    if (!String(url).includes('generativelanguage.googleapis.com')) return originalFetch(url, options);
    analysisCalls += 1;
    return Response.json({ candidates: [{ content: { role: 'model', parts: [{ text: 'A conversation about coffee.' }] } }] });
  });
  process.env.GEMINI_API_KEY = 'test';
  try {
    const result = await generate({ max_tokens: 1000, messages: [{ role: 'user', content: [
      { type: 'text', text: 'Help me reply' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,dGVzdA==' } },
    ] }] });
    assert.equal(result.status, 200);
    assert.equal(analysisCalls, 1);
    const upstream = requests.at(-1).body;
    assert.equal(upstream.model, 'openai/gpt-oss-120b');
    assert.equal(upstream.reasoning_effort, 'low');
    assert.match(upstream.messages[0].content, /conversation about coffee/);
    assert.doesNotMatch(JSON.stringify(upstream), /data:image/);
  } finally { analysis.mock.restore(); }
});

test('missing Groq credentials fail before any provider request', async () => {
  const count = requests.length;
  delete process.env.GROQ_API_KEY;
  try {
    const result = await generate({ messages: [{ role: 'user', content: 'Hello' }] });
    assert.equal(result.status, 502);
    assert.match(result.payload.error, /Groq API key is not configured/);
    assert.equal(requests.length, count);
  } finally { process.env.GROQ_API_KEY = 'test-groq-key'; }
});
