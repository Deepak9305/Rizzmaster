import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

process.env.IAP_ACCOUNT_BINDING_SECRET = 'iap-account-binding-test-secret';

const {
  getGoogleAccountBindingMatch,
  getIapAccountBinding,
} = await import('../server/api/_iap.js');

const md5 = (value) => crypto.createHash('md5').update(value).digest('hex');

const md5ToUuid = (value) => {
  const hash = md5(value);
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-3${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20)}`;
};

const userId = '3508941a-3ed4-4f3e-8eeb-c5551f171004';

test('accepts current raw and plugin-obfuscated account bindings', () => {
  const binding = getIapAccountBinding(userId);

  assert.equal(getGoogleAccountBindingMatch(binding, userId), 'current_raw');
  assert.equal(getGoogleAccountBindingMatch(md5(binding), userId), 'current_legacy_md5');
  assert.equal(getGoogleAccountBindingMatch(md5ToUuid(binding), userId), 'current_uuid');
});

test('accepts account bindings created by older app releases', () => {
  assert.equal(getGoogleAccountBindingMatch(userId, userId), 'legacy_user_raw');
  assert.equal(getGoogleAccountBindingMatch(md5(userId), userId), 'legacy_user_md5');
  assert.equal(getGoogleAccountBindingMatch(md5ToUuid(userId), userId), 'legacy_user_uuid');
});

test('rejects a binding from another app account', () => {
  const otherUserId = '13c29de4-b792-43dc-bb30-b8d41a8a6a8d';
  const otherBinding = getIapAccountBinding(otherUserId);

  assert.equal(getGoogleAccountBindingMatch(md5(otherBinding), userId), null);
});
