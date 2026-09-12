import { createVerify } from 'node:crypto';

export const REWARDED_AD_UNIT_ID = 'ca-app-pub-7381421031784616/6580197977';
export const REWARDED_ITEM = 'rizz_credits';
export const REWARDED_AMOUNT = 5;
export const REWARDED_ATTEMPT_TTL_MS = 15 * 60 * 1000;
export const ADMOB_SSV_PUBLIC_KEYS_URL = 'https://www.gstatic.com/admob/reward/verifier-keys.json';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const isUuid = (value) => typeof value === 'string' && UUID_PATTERN.test(value.trim());

export const normalizeRequiredCredits = (value) => {
  const number = Number(value);
  return number === 1 || number === 2 ? number : null;
};

export const isRewardEligible = ({ isPremium, credits, requiredCredits }) => (
  isPremium !== true &&
  normalizeRequiredCredits(requiredCredits) !== null &&
  Number.isFinite(Number(credits)) &&
  Number(credits) < Number(requiredCredits)
);

export const isValidRewardPayload = ({ adUnit, rewardItem, rewardAmount }) => (
  adUnit === REWARDED_AD_UNIT_ID &&
  rewardItem === REWARDED_ITEM &&
  String(rewardAmount) === String(REWARDED_AMOUNT)
);

const decodeQueryKey = (value) => {
  try {
    return decodeURIComponent(value.replace(/\+/g, ' '));
  } catch {
    return value;
  }
};

// Google signs the original query string. Keep encoded key/value segments
// untouched and remove only the internal router plus signature fields.
export const buildCanonicalSsvQuery = (rawQuery = '') => rawQuery
  .replace(/^\?/, '')
  .split('&')
  .filter(Boolean)
  .filter((segment) => {
    const equalsIndex = segment.indexOf('=');
    const key = decodeQueryKey(equalsIndex >= 0 ? segment.slice(0, equalsIndex) : segment);
    return !['__route', 'signature', 'key_id'].includes(key);
  })
  .join('&');

const toBase64Buffer = (value) => {
  const normalized = String(value || '').replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='), 'base64');
};

let publicKeysCache = null;
let publicKeysCacheExpiresAt = 0;
let publicKeysRequest = null;

const loadAdMobPublicKeys = async () => {
  if (publicKeysCache && publicKeysCacheExpiresAt > Date.now()) return publicKeysCache;
  if (publicKeysRequest) return publicKeysRequest;

  publicKeysRequest = (async () => {
    const response = await fetch(ADMOB_SSV_PUBLIC_KEYS_URL, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`AdMob public key request failed with status ${response.status}`);
    const payload = await response.json();
    const keys = Array.isArray(payload?.keys)
      ? payload.keys.filter((key) => Number.isFinite(Number(key?.keyId)) && typeof key?.pem === 'string')
      : [];
    if (!keys.length) throw new Error('AdMob public key response was empty.');
    publicKeysCache = keys;
    publicKeysCacheExpiresAt = Date.now() + (24 * 60 * 60 * 1000);
    return keys;
  })();

  try {
    return await publicKeysRequest;
  } finally {
    publicKeysRequest = null;
  }
};

export const verifyAdMobSsvSignature = async ({ canonicalQuery, signature, keyId }) => {
  if (!canonicalQuery || !signature || !keyId) {
    return { ok: false, code: 'SSV_SIGNATURE_INVALID' };
  }

  try {
    const keys = await loadAdMobPublicKeys();
    const publicKey = keys.find((key) => String(key.keyId) === String(keyId));
    if (!publicKey) return { ok: false, code: 'SSV_KEY_NOT_FOUND' };

    const verifier = createVerify('sha256');
    verifier.update(canonicalQuery, 'utf8');
    verifier.end();
    const ok = verifier.verify({ key: publicKey.pem, dsaEncoding: 'der' }, toBase64Buffer(signature));
    return { ok, code: ok ? null : 'SSV_SIGNATURE_INVALID' };
  } catch {
    return { ok: false, code: 'SSV_KEY_FETCH_FAILED' };
  }
};

export const toSafeIsoDate = (value) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const milliseconds = numeric < 100000000000 ? numeric * 1000 : numeric;
  const date = new Date(milliseconds);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
};
