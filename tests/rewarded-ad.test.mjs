import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REWARDED_AD_UNIT_ID,
  REWARDED_ITEM,
  buildCanonicalSsvQuery,
  isRewardEligible,
  isValidRewardPayload,
  normalizeRequiredCredits,
} from '../server/api/_rewarded-ad.js';

test('only generation costs 1 or 2 are valid rewarded attempt costs', () => {
  assert.equal(normalizeRequiredCredits(1), 1);
  assert.equal(normalizeRequiredCredits('2'), 2);
  assert.equal(normalizeRequiredCredits(0), null);
  assert.equal(normalizeRequiredCredits(3), null);
});

test('rewarded credits are eligible only for non-premium users without enough credits', () => {
  assert.equal(isRewardEligible({ isPremium: false, credits: 0, requiredCredits: 1 }), true);
  assert.equal(isRewardEligible({ isPremium: false, credits: 1, requiredCredits: 2 }), true);
  assert.equal(isRewardEligible({ isPremium: false, credits: 1, requiredCredits: 1 }), false);
  assert.equal(isRewardEligible({ isPremium: true, credits: 0, requiredCredits: 1 }), false);
});

test('SSV canonical query preserves encoded content and removes only signature fields', () => {
  const rawQuery = '__route=admob%2Freward-ssv&ad_network=1&custom_data=abc%2B123&signature=secret&key_id=42';
  assert.equal(buildCanonicalSsvQuery(rawQuery), 'ad_network=1&custom_data=abc%2B123');
});

test('SSV payload must match the configured reward', () => {
  assert.equal(isValidRewardPayload({
    adUnit: REWARDED_AD_UNIT_ID,
    rewardItem: REWARDED_ITEM,
    rewardAmount: '5',
  }), true);
  assert.equal(isValidRewardPayload({
    adUnit: REWARDED_AD_UNIT_ID,
    rewardItem: REWARDED_ITEM,
    rewardAmount: '10',
  }), false);
  assert.equal(isValidRewardPayload({
    adUnit: 'other-unit',
    rewardItem: REWARDED_ITEM,
    rewardAmount: '5',
  }), false);
});
