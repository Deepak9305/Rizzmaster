import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const ast = ts.createSourceFile('App.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const functions = [];
function visit(node) {
  if (ts.isFunctionDeclaration(node) && ['loadUserDataSafe', 'performUserDataLoad'].includes(node.name?.text)) functions.push(node.getText(ast));
  ts.forEachChild(node, visit);
}
visit(ast);
assert.equal(functions.length, 2);
function harness() {
  const profiles = [];
  let finishClaim;
  let fetches = 0;
  const claim = new Promise(resolve => { finishClaim = resolve; });
  const context = {
    console, setTimeout,
    profileLoadTaskRef: { current: null }, authUserIdRef: { current: 'account' }, profileRef: { current: null },
    fetchServerProfile: async () => { ++fetches; return { profile: { id: 'account', credits: 5, shadow_notes: 'notes' }, savedItems: [] }; },
    normalizeDailyCreditProfile: profile => profile,
    setProfile: profile => profiles.push(profile),
    setIsProfileLoadingHung() {}, setProfileLoadError() {}, setSavedItems() {},
    showToast() { throw new Error('Unexpected stale toast'); },
    localStorage: { setItem() {} },
    supabase: { rpc: () => claim, from: () => ({ upsert: async () => ({ error: null }) }) },
  };
  vm.createContext(context);
  vm.runInContext(ts.transpileModule(functions.join('\n'), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  return { context, profiles, finishClaim, fetches: () => fetches };
}

test('account becomes ready before optional daily-credit request finishes, with one shared profile fetch', async () => {
  const h = harness();
  const first = h.context.loadUserDataSafe('account');
  assert.equal(h.context.loadUserDataSafe('account'), first);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.fetches(), 1);
  assert.equal(h.profiles[0].id, 'account');
  h.finishClaim({ data: null, error: null });
  await first;
  assert.equal(h.context.profileLoadTaskRef.current, null);
});

test('late account enrichment cannot restore a profile after logout', async () => {
  const h = harness();
  const pending = h.context.loadUserDataSafe('account');
  await new Promise(resolve => setImmediate(resolve));
  h.context.authUserIdRef.current = null;
  h.context.profileRef.current = null;
  h.finishClaim({ data: { profile: { id: 'account', credits: 99 }, streak_msg: 'old account' }, error: null });
  await pending;
  assert.equal(h.profiles.length, 1);
  assert.equal(h.context.profileRef.current, null);
});
