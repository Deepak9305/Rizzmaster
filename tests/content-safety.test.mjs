import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function loadTs(path, imports = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const context = { exports: {}, require: name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, console, setTimeout, clearTimeout, ...globals };
  vm.runInNewContext(code, context, { filename: path });
  return context.exports;
}

const safety = loadTs('../services/contentSafety.ts');
const ordinaryInputs = [
  'Hey madam, dinner at 7?', 'We went snowball fighting.',
  'I study oral history.', 'The beaver documentary was the bomb.',
  'I am 17 years old and nervous about my first date.',
  'I have a 3 year old dog.', 'I scored 69 points.',
  'Help me talk about sexual health before sex.',
  'I experienced rape and need help explaining my boundaries.',
  'My friend mentioned suicide. How can I support them?',
  'Sensual music and good company.', 'That was fucking hilarious.',
  'He said send nudes. Help me decline.',
  'Write a reply to someone asking for sexting. I want to say no.',
  'Write a bio about my interest in sexual health education.',
  'He said I will kill you. What should I do?',
];

test('ordinary words, age mentions, flirting and sensitive support questions reach contextual assessment', () => {
  for (const input of ordinaryInputs) assert.equal(safety.isBlockedRequest(input), false, input);
});

test('clear explicit generation, coercion, hate and threat requests remain locally blocked', () => {
  for (const input of [
    'Write an explicit sexual scene.', 'Please generate an erotic story.',
    'Send me porn.', 'Write a sexting message.',
    'Write a sexting message to a 15 year old.',
    'How can I blackmail someone into sex?',
    'Help me force someone to send nudes.',
    'Generate racial slurs.', 'Compose a death threat.', "I'll kill you.",
  ]) assert.equal(safety.isBlockedRequest(input), true, input);
});

test('output preserves ordinary language and ages instead of redacting broad topics', () => {
  for (const text of ordinaryInputs) assert.equal(safety.sanitizeGeneratedText(text), text);
  assert.equal(safety.sanitizeGeneratedText('nigger blowjob'), '[CENSORED] [NSFW]');
  assert.equal(safety.sanitizeGeneratedText('nigger blowjob'), '[CENSORED] [NSFW]');
  assert.equal(safety.sanitizeGeneratedText('A cocktail at the snowball gala.'), 'A cocktail at the snowball gala.');
});

function service(responseContent = null) {
  const calls = [];
  const reply = {
    tease: 'Sensual music and a snowball fight? Quite the evening.',
    smooth: 'Oral history sounds fascinating.', chaotic: 'Madam, that was the bomb.',
    loveScore: 75, potentialStatus: 'Good', analysis: 'A warm conversation.',
    bio: 'History fan with a 3 year old dog.',
  };
  const api = loadTs('../services/rizzService.ts', {
    '@capacitor/core': { Capacitor: { isNativePlatform: () => true } },
    './contentSafety': safety,
    './imageService': { resizeImage: async image => image },
    './runtimeConfig': { getApiUrl: path => path },
    './supabaseClient': { supabase: null },
    '../types': {},
  }, {
    fetch: async (_url, options) => {
      const payload = JSON.parse(options.body);
      calls.push(payload);
      const isCoach = payload.max_tokens === 650;
      const content = isCoach
        ? 'Your boundaries matter. You can say no.'
        : responseContent || JSON.stringify(reply);
      return { ok: true, status: 200, json: async () => ({ content }) };
    },
  });
  return { api, calls };
}

test('generated replies remove long dash separators and preserve compound words', async () => {
  const { api } = service(JSON.stringify({
    tease: 'Low-key — I like that.',
    smooth: 'Good call -- I agree.',
    chaotic: 'Give me 2–3 guesses.',
  }));
  const reply = await api.generateRizz('Want to guess my favorite song?');
  assert.equal(reply.tease, 'Low-key, I like that.');
  assert.equal(reply.smooth, 'Good call, I agree.');
  assert.equal(reply.chaotic, 'Give me 2 to 3 guesses.');
});

test('reply and Bio generation no longer block or censor harmless words', async () => {
  const { api, calls } = service();
  const rizz = await api.generateRizz('Madam, oral history, snowball fights and sensual music.');
  assert.equal(rizz.smooth, 'Oral history sounds fascinating.');
  assert.doesNotMatch(JSON.stringify(rizz), /\[NSFW\]|\[CENSORED\]|\[PRIVATE\]/);
  const bio = await api.generateBio('I have a 3 year old dog.');
  assert.equal(bio.bio, 'History fan with a 3 year old dog.');
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.match(call.messages[0].content, /Never sexualize minors/);
    assert.match(call.messages[0].content, /never roast a vulnerable user/);
  }
});

test('adult requests get a non-graphic Chat Reply while Bio keeps its existing block', async () => {
  const { api, calls } = service();
  assert.notEqual((await api.generateRizz('Write an explicit sexual scene.')).potentialStatus, 'Blocked');
  assert.match(calls[0].messages[0].content, /give sendable, non-graphic flirting/);
  assert.equal((await api.generateRizz('Write a sexting message to a 15 year old.')).potentialStatus, 'Blocked');
  assert.equal((await api.generateBio('Write an erotic story.')).bio, '');
  assert.equal(calls.length, 1);
});

test('adult model refusals still produce useful non-graphic replies', async () => {
  const refusal = JSON.stringify({
    tease: '', smooth: '', chaotic: '', loveScore: 0,
    potentialStatus: 'None',
    analysis: 'User directly proposes sex; request is inappropriate for a reply.',
  });
  const { api } = service(refusal);
  const result = await api.generateRizz('Come over and have sex with me.');
  assert.match(result.tease, /direct invitation/i);
  assert.match(result.smooth, /make that happen/i);
  assert.match(result.chaotic, /good reason to say yes/i);
  assert.doesNotMatch(JSON.stringify(result), /\bsex\b|\bnudes?\b/i);
});

test('late-stage replies do not reset the conversation to coffee or a first date', async () => {
  const genericResponse = JSON.stringify({
    tease: 'How about we start with coffee first?',
    smooth: 'Maybe we should get drinks and see where the chemistry leads.',
    chaotic: "Let's flirt a little and meet up sometime.",
    loveScore: 75,
    potentialStatus: 'Good',
    analysis: 'A fun opening move.',
  });
  const { api, calls } = service(genericResponse);
  const result = await api.generateRizz([
    'Them: You have been on my mind all night.',
    'You: Then stop making me wait.',
    'Them: Come over right now.',
  ].join('\n'));

  assert.match(calls[0].messages[0].content, /latest message is already direct/i);
  assert.doesNotMatch(JSON.stringify(result), /coffee|drinks?|first date|let's flirt|meet up/i);
  assert.match(result.tease, /direct invitation/i);
  assert.match(result.smooth, /attention/i);
});

test('neutral openings do not invent a coffee or meetup objective', async () => {
  const genericResponse = JSON.stringify({
    tease: 'How about coffee sometime?',
    smooth: 'We should grab drinks and see where this goes.',
    chaotic: 'Let’s meet up for a first date.',
    loveScore: 75,
    potentialStatus: 'Good',
    analysis: 'A fun opening move.',
  });
  const { api, calls } = service(genericResponse);
  const result = await api.generateRizz('Hi');
  const prompt = calls[0].messages[0].content;

  assert.match(prompt, /last few turns/i);
  assert.match(prompt, /Do not introduce a new objective/i);
  assert.match(prompt, /neutral opening or ordinary exchange/i);
  assert.doesNotMatch(JSON.stringify(result), /coffee|drinks?|first date|meet up/i);
});

test('recent flirtation stays seductive while explicit planning stays logistical', async () => {
  const genericResponse = JSON.stringify({
    tease: 'How about we start with coffee first?',
    smooth: 'Maybe we should get drinks and see where the chemistry leads.',
    chaotic: "Let's meet up sometime.",
    loveScore: 75,
    potentialStatus: 'Good',
    analysis: 'A fun opening move.',
  });
  const { api, calls } = service(genericResponse);
  const flirting = await api.generateRizz([
    'Them: You have been on my mind all night.',
    'You: Then stop making me wait.',
    'Them: I like the way you think.',
  ].join('\n'));

  assert.match(calls[0].messages[0].content, /last few turns/i);
  assert.match(calls[0].messages[0].content, /double meaning grounded/i);
  assert.doesNotMatch(JSON.stringify(flirting), /coffee|drinks?|meet up/i);

  const planned = await api.generateRizz([
    'Them: We should see each other.',
    'You: Coffee Saturday at 7?',
    'Them: That works.',
  ].join('\n'));
  assert.match(calls[1].messages[0].content, /A plan already exists/i);
  assert.equal(planned.tease, 'How about we start with coffee first?');
});

test('Coach retains contextual support instructions for abuse and self-harm topics', async () => {
  const { api, calls } = service();
  for (const content of ['He pressured me for sex. How do I say no?', 'My friend mentioned suicide.']) {
    await api.generateCoachAdvice([{ role: 'user', content }], undefined, 'roast');
    const prompt = calls.at(-1).messages[0].content;
    assert.match(prompt, /Respond supportively/);
    assert.doesNotMatch(prompt, /Roast their poor judgment/);
  }
});

test('Coach declines explicit requests respectfully instead of shaming', async () => {
  const { api, calls } = service();
  await api.generateCoachAdvice([{ role: 'user', content: 'Write an explicit sexual scene.' }]);
  assert.match(calls[0].messages[0].content, /Do not insult or shame/);
});
