import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function loadTs(path, imports = {}, globals = {}) {
  const code = ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  const context = { exports: {}, require: name => {
    assert.ok(name in imports, `Unexpected import ${name}`);
    return imports[name];
  }, setTimeout, clearTimeout, AbortController, URL, console, ...globals };
  vm.runInNewContext(code, context, { filename: path });
  return context.exports;
}

function auth(options = {}) {
  const calls = [];
  const session = { user: { id: 'account' } };
  const config = { authAvailable: true, googleClientId: 'web-client', ...options.config };
  const google = {
    signOut: async () => { calls.push(['logout']); },
    initialize: async params => { calls.push(['initialize', params]); await options.initialize?.(); },
    signIn: async params => { calls.push(['picker', params]); return options.picker ? options.picker() : { authentication: { idToken: 'id-token' } }; },
  };
  const supabase = { auth: {
    signInWithIdToken: async params => { calls.push(['exchange', params]); return options.exchange ? options.exchange() : { data: { session }, error: null }; },
    signInWithOAuth: async params => { calls.push(['oauth', params]); return { error: null }; },
    signInWithPassword: async params => { calls.push(['password', params]); return options.password ? options.password() : { data: { session }, error: null }; },
    signUp: async params => { calls.push(['signup', params]); return { data: { session: null }, error: null }; },
  } };
  const loaded = loadTs('../services/authService.ts', {
    '@codetrix-studio/capacitor-google-auth': { GoogleAuth: google },
    './supabaseClient': { supabase },
    './runtimeConfig': { runtimeConfig: config },
    './nativeCapabilities': { canUseNativeGoogleAuth: () => options.plugin !== false && options.native !== false, isNativeShellApp: () => options.native !== false },
  }, { window: { location: { origin: 'https://rizzmaster.online' } } });
  loaded.AuthService.GOOGLE_WAIT_TIMEOUT_MS = 100;
  loaded.AuthService.GOOGLE_INIT_TIMEOUT_MS = 100;
  return { ...loaded, calls, supabase, config };
}

test('restored native sessions initialize Google before logging out', async () => {
  const { AuthService: service, calls } = auth();
  await service.signOutGoogle();
  assert.deepEqual(calls.map(call => call[0]), ['initialize', 'logout']);
});

test('Google picker waits for native initialization and exchanges only the ID token', async () => {
  let finish;
  const { AuthService: service, calls } = auth({ initialize: () => new Promise(resolve => { finish = resolve; }) });
  const login = service.signInGoogle();
  await delay(0);
  assert.deepEqual(calls.map(call => call[0]), ['initialize']);
  finish();
  assert.equal(await login, 'signed-in');
  assert.deepEqual(calls.map(call => call[0]), ['initialize', 'picker', 'exchange']);
  assert.equal(calls[1][1].skipAccessToken, true);
  assert.equal(calls[2][1].provider, 'google');
  assert.equal(calls[2][1].token, 'id-token');
});

test('a failed native initialization can retry and never opens the picker early', async () => {
  let fails = true;
  const { AuthService: service, calls } = auth({ initialize: () => { if (fails) throw new Error('initialization failed'); } });
  await assert.rejects(service.signInGoogle(), /initialization failed/);
  assert.equal(calls.filter(call => call[0] === 'picker').length, 0);
  fails = false;
  assert.equal(await service.signInGoogle(), 'signed-in');
});

test('a stalled picker releases the UI deadline without opening a second picker or exchanging a late token', async () => {
  let finish;
  const { AuthService: service, calls } = auth({ picker: () => new Promise(resolve => { finish = resolve; }) });
  service.GOOGLE_WAIT_TIMEOUT_MS = 5;
  await assert.rejects(service.signInGoogle(), /timed out/);
  await assert.rejects(service.signInGoogle(), /still open/);
  assert.equal(calls.filter(call => call[0] === 'picker').length, 1);
  finish({ authentication: { idToken: 'late-token' } });
  await delay(0);
  assert.equal(calls.filter(call => call[0] === 'exchange').length, 0);
  assert.equal(service.googleSignInPromise, null);
});

test('missing tokens and failed session exchange reject instead of reporting success', async () => {
  const missing = auth({ picker: async () => ({ authentication: {} }) });
  await assert.rejects(missing.AuthService.signInGoogle(), /did not complete/);
  assert.equal(missing.calls.filter(call => call[0] === 'exchange').length, 0);
  const rejected = auth({ exchange: async () => ({ data: { session: null }, error: { message: 'Invalid audience' } }) });
  await assert.rejects(rejected.AuthService.signInGoogle(), error => error.message === 'Invalid audience');
  const empty = auth({ exchange: async () => ({ data: { session: null }, error: null }) });
  await assert.rejects(empty.AuthService.signInGoogle(), /did not create a session/);
});

test('a native shell without GoogleAuth never redirects into embedded Google OAuth', async () => {
  const { AuthService: service, calls } = auth({ plugin: false });
  await assert.rejects(service.signInGoogle(), /email sign-in/);
  assert.equal(calls.length, 0);
});

test('web Google login uses OAuth without forcing repeated consent or offline access', async () => {
  const { AuthService: service, calls } = auth({ native: false });
  assert.equal(await service.signInGoogle(), 'redirect');
  assert.deepEqual(calls.map(call => call[0]), ['oauth']);
  assert.equal(calls[0][1].options.redirectTo, 'https://rizzmaster.online');
  assert.equal(calls[0][1].options.queryParams, undefined);
});

test('structured native errors are classified by exact code, not incidental digits', () => {
  const { normalizeAuthError: normalize } = auth();
  assert.match(normalize({ message: 'Something went wrong', code: '10' }, 'google'), /not configured/);
  assert.match(normalize({ message: 'Cancelled', code: 12501 }, 'google'), /cancelled/);
  assert.equal(normalize({ message: 'Request 100 timed out' }, 'google'), 'Sign-in took too long. Check your connection and try again.');
  assert.equal(normalize({ message: 'Invalid login credentials' }, 'email'), 'Incorrect email or password.');
});

function loginPage(options = {}) {
  const service = auth(options);
  const hooks = [];
  let index = 0;
  const react = { ...React,
    useState(initial) {
      const position = index++;
      if (!(position in hooks)) hooks[position] = initial;
      return [hooks[position], value => { hooks[position] = typeof value === 'function' ? value(hooks[position]) : value; }];
    },
    useRef(initial) { const position = index++; return hooks[position] ??= { current: initial }; },
    useEffect() {},
  };
  const { default: Component } = loadTs('../components/LoginPage.tsx', {
    react,
    '../services/supabaseClient': { supabase: service.supabase },
    '../services/runtimeConfig': { runtimeConfig: service.config, getAuthUnavailableMessage: () => null, getRuntimeConfigDebugMessage: () => '' },
    '../services/nativeCapabilities': { canUseNativeGoogleAuth: () => options.native !== false },
    './LegalModals': { default: () => null, __esModule: true },
    '../services/authService': { AuthService: service.AuthService, normalizeAuthError: service.normalizeAuthError },
  }, { window: { location: { origin: 'https://rizzmaster.online' } } });
  const render = () => { index = 0; return Component({ onGuestEntry() {} }); };
  function elements(tree) {
    if (!React.isValidElement(tree)) return [];
    return [tree, ...React.Children.toArray(tree.props.children).flatMap(elements)];
  }
  const text = element => React.Children.toArray(element.props.children).map(child => React.isValidElement(child) ? text(child) : child).join('');
  const find = (tree, label) => elements(tree).find(element => element.type === 'button' && text(element).includes(label));
  return { ...service, render, find, html: () => renderToStaticMarkup(render()), elements };
}

test('Google failures show an alert in the Google panel and clear the spinner', async () => {
  const page = loginPage({ picker: async () => { throw { message: 'Something went wrong', code: '10' }; } });
  await page.find(page.render(), 'Continue with Google').props.onClick();
  assert.match(page.html(), /role="alert"/);
  assert.match(page.html(), /not configured for this app build/);
  assert.doesNotMatch(page.html(), /Signing in\.\.\./);
  assert.equal(page.find(page.render(), 'Continue with Google').props.disabled, false);
});

test('rapid login taps share one operation and guest/method switches stay disabled', async () => {
  let finish;
  const page = loginPage({ picker: () => new Promise(resolve => { finish = resolve; }) });
  const button = page.find(page.render(), 'Continue with Google');
  const first = button.props.onClick();
  const second = button.props.onClick();
  while (!finish) await delay(0);
  assert.equal(page.find(page.render(), 'Continue as Guest').props.disabled, true);
  assert.equal(page.find(page.render(), 'Sign in with Email').props.disabled, true);
  finish({ authentication: { idToken: 'id-token' } });
  await Promise.all([first, second]);
  assert.equal(page.calls.filter(call => call[0] === 'picker').length, 1);
});

test('existing short passwords are not blocked by signup-only validation', () => {
  const page = loginPage();
  page.find(page.render(), 'Sign in with Email').props.onClick();
  let password = page.elements(page.render()).find(element => element.type === 'input' && element.props.type === 'password');
  assert.equal(password.props.minLength, undefined);
  assert.equal(password.props.autoComplete, 'current-password');
  page.find(page.render(), "Don't have an account?").props.onClick();
  password = page.elements(page.render()).find(element => element.type === 'input' && element.props.type === 'password');
  assert.equal(password.props.minLength, 6);
  assert.equal(password.props.autoComplete, 'new-password');
});

test('stalled auth HTTP requests abort, while ordinary data requests are unchanged', async () => {
  const { createAuthFetch } = loadTs('../services/authRequest.ts');
  let authSignal;
  const wrapped = createAuthFetch(async (url, init) => {
    if (!String(url).includes('/auth/v1/')) return { ordinary: true, init };
    authSignal = init.signal;
    return new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('Aborted')), { once: true }));
  }, 5);
  await assert.rejects(wrapped('https://project.supabase.co/auth/v1/token', { method: 'POST' }), /timed out/);
  assert.equal(authSignal.aborted, true);
  const init = { method: 'GET' };
  const result = await wrapped('https://project.supabase.co/rest/v1/profiles', init);
  assert.equal(result.init, init);
});

test('caller cancellation propagates without being mislabeled as a timeout', async () => {
  const { createAuthFetch } = loadTs('../services/authRequest.ts');
  const caller = new AbortController();
  const wrapped = createAuthFetch(async (_, init) => new Promise((_, reject) => {
    init.signal.addEventListener('abort', () => reject(new Error('Caller cancelled')), { once: true });
  }), 100);
  const request = wrapped('https://project.supabase.co/auth/v1/token', { signal: caller.signal });
  caller.abort();
  await assert.rejects(request, /Caller cancelled/);
});
