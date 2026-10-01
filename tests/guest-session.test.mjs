import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function callback(name, context) {
  let found;
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer.arguments[0];
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, name);
  return vm.runInNewContext(ts.transpileModule(`(${found.getText(ast)})`, {
    compilerOptions: { target: ts.ScriptTarget.ES2022 },
  }).outputText, context);
}
function harness() {
  const state = {};
  const storage = new Map([
    ['rizzmaster_guest_credits', '3'], ['rizzmaster_guest_last_reset', 'today'],
    ['rizz_coach_messages_v2_guest_user', 'private'], ['rizzmaster_guest_shadow_notes', 'private'],
    ['rizz_coach_shadow_notes_guest_user', 'private'], ['rizz_custom_personas_guest_user', 'private'],
    ['rizz_coach_messages_v2', 'private'],
  ]);
  const context = {
    console: { error() {}, warn() {} },
    isGuest: false,
    isGuestRef: { current: true },
    profileRef: { current: { id: 'guest_user', credits: 3, is_premium: false } },
    authUserIdRef: { current: null },
    generationSessionVersionRef: { current: 0 },
    loadingRef: { current: false },
    textareaRef: { current: { value: 'private chat' } },
    generationInputsRef: { current: { mode: 'CHAT', image: null, selectedVibe: null, responseLength: 'medium', customPersonas: [] } },
    InputMode: { CHAT: 'CHAT', BIO: 'BIO' },
    IAPService: { clearUser() { state.cleared = (state.cleared || 0) + 1; } },
    window: { confirm() { throw new Error('Guest logout must not ask signed-in confirmation'); }, history: { replaceState(value, title, path) { state.path = path; } } },
    localStorage: { removeItem(key) { storage.delete(key); } },
    showToast(...args) { state.toast = args; },
    handleCreditsExhausted() { throw new Error('Unexpected exhausted credits'); },
    syncProfile() { throw new Error('Guests must not sync signed-in profiles'); },
    updateCredits(change) { context.profileRef.current.credits = change(context.profileRef.current.credits); },
  };
  for (const name of ['IsGuest', 'IsSessionBlocked', 'IsProfileLoadingHung', 'ProfileLoadError', 'Profile', 'Session', 'CurrentView', 'Loading', 'SavedItems', 'Result', 'Image', 'InputError', 'SelectedVibe', 'CustomPersonas', 'EditingPersona', 'PersonaName', 'PersonaInstruction', 'ShowPremiumModal', 'ShowCreditsExhaustedModal', 'ShowSavedModal', 'ShowPersonaModal', 'ShowWebMenu', 'ShowWebPremiumModal']) {
    context[`set${name}`] = value => { state[name] = value; };
  }
  context.handleExitGuestMode = callback('handleExitGuestMode', context);
  return { context, state, storage };
}

test('guest logout uses current identity even when callback captured non-guest state', async () => {
  const { context, state } = harness();
  await callback('handleLogout', context)();
  assert.equal(context.isGuestRef.current, false);
  assert.equal(context.profileRef.current, null);
  assert.equal(state.cleared, 1);
  assert.equal(state.CurrentView, 'HOME');
});

test('guest profile is recognized before its guest ref has synchronized', async () => {
  const { context } = harness();
  context.isGuestRef.current = false;
  await callback('handleLogout', context)();
  assert.equal(context.profileRef.current, null);
});

test('a signed-in user still gets logout confirmation after leaving guest mode', async () => {
  const { context, state } = harness();
  context.isGuest = true;
  context.isGuestRef.current = false;
  context.profileRef.current = { id: 'signed-in-user' };
  let confirmations = 0;
  context.window.confirm = () => { ++confirmations; return false; };
  await callback('handleLogout', context)();
  assert.equal(confirmations, 1);
  assert.equal(context.profileRef.current.id, 'signed-in-user');
  assert.equal(state.cleared, undefined);
});

test('exit clears private UI and history while preserving the daily credit limit', () => {
  const { context, state, storage } = harness();
  context.loadingRef.current = true;
  context.handleExitGuestMode();
  assert.equal(context.loadingRef.current, false);
  assert.equal(context.textareaRef.current.value, '');
  assert.equal(state.path, '/');
  for (const name of ['Result', 'Image', 'InputError', 'SelectedVibe', 'EditingPersona']) assert.equal(state[name], null);
  for (const name of ['ShowPremiumModal', 'ShowCreditsExhaustedModal', 'ShowSavedModal', 'ShowPersonaModal', 'ShowWebMenu', 'ShowWebPremiumModal', 'Loading']) assert.equal(state[name], false);
  for (const name of ['SavedItems', 'CustomPersonas']) assert.equal(state[name].length, 0);
  assert.equal(storage.size, 2);
  assert.equal(storage.get('rizzmaster_guest_credits'), '3');
  assert.equal(storage.get('rizzmaster_guest_last_reset'), 'today');
});

for (const outcome of ['resolve', 'reject']) {
  test(`late generation ${outcome} cannot affect a new guest session`, async () => {
    const { context, state } = harness();
    const pending = [];
    context.generateRizz = () => new Promise((resolve, reject) => pending.push({ resolve, reject }));
    const generate = callback('handleGenerate', context);
    const oldRequest = generate('old chat');
    context.handleExitGuestMode();
    context.profileRef.current = { id: 'guest_user', credits: 2, is_premium: false };
    context.isGuestRef.current = true;
    const newRequest = generate('new chat');
    if (outcome === 'resolve') pending[0].resolve({ tease: 'old' });
    else pending[0].reject(new Error('Network error'));
    await oldRequest;
    assert.equal(state.Result, null);
    assert.equal(context.loadingRef.current, true);
    assert.equal(context.profileRef.current.credits, 1);
    assert.equal(state.toast, undefined);
    const fresh = { tease: 'new' };
    pending[1].resolve(fresh);
    await newRequest;
    assert.equal(state.Result, fresh);
    assert.equal(context.loadingRef.current, false);
  });
}
