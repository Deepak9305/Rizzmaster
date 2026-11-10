import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isAndroidPremiumPromptDue,
  readAndroidPremiumPromptState,
  recordAndroidSuccessfulGeneration,
  resetAndroidPremiumPromptState,
} from '../services/androidPremiumPrompt.ts';

class MemoryStorage {
  #values = new Map();

  getItem(key) { return this.#values.has(key) ? this.#values.get(key) : null; }
  setItem(key, value) { this.#values.set(key, String(value)); }
  removeItem(key) { this.#values.delete(key); }
  clear() { this.#values.clear(); }
}

globalThis.localStorage = new MemoryStorage();

const dayOne = Date.UTC(2026, 0, 1, 12);
const dayTwo = Date.UTC(2026, 0, 2, 0, 1);

test('shows at generation 3 and every fifth generation after it', () => {
  const identity = 'premium-prompt-test-user';
  resetAndroidPremiumPromptState(identity, dayOne);

  const dueCounts = [];
  for (let count = 1; count <= 13; count += 1) {
    const result = recordAndroidSuccessfulGeneration(identity, dayOne);
    if (result.shouldPrompt) dueCounts.push(result.count);
  }

  assert.deepEqual(dueCounts, [3, 8, 13]);
  assert.equal(readAndroidPremiumPromptState(identity, dayOne).count, 13);
  assert.equal(isAndroidPremiumPromptDue(2), false);
  assert.equal(isAndroidPremiumPromptDue(3), true);
  assert.equal(isAndroidPremiumPromptDue(8), true);
  assert.equal(isAndroidPremiumPromptDue(9), false);
});

test('resets stale data at the next UTC day', () => {
  const identity = 'premium-prompt-utc-test-user';
  resetAndroidPremiumPromptState(identity, dayOne);
  recordAndroidSuccessfulGeneration(identity, dayOne);
  recordAndroidSuccessfulGeneration(identity, dayOne);
  recordAndroidSuccessfulGeneration(identity, dayOne);

  const nextDay = readAndroidPremiumPromptState(identity, dayTwo);
  assert.deepEqual(nextDay, { utcDay: '2026-01-02', count: 0 });
  assert.deepEqual(recordAndroidSuccessfulGeneration(identity, dayTwo), {
    utcDay: '2026-01-02',
    count: 1,
    shouldPrompt: false,
  });
});

test('keeps guest and account counters independent', () => {
  resetAndroidPremiumPromptState('guest_user', dayOne);
  resetAndroidPremiumPromptState('account-123', dayOne);

  recordAndroidSuccessfulGeneration('guest_user', dayOne);
  recordAndroidSuccessfulGeneration('guest_user', dayOne);
  recordAndroidSuccessfulGeneration('account-123', dayOne);

  assert.equal(readAndroidPremiumPromptState('guest_user', dayOne).count, 2);
  assert.equal(readAndroidPremiumPromptState('account-123', dayOne).count, 1);
});
