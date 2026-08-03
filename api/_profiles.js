import { isDatabaseConfigured, pool, useCloudSqlCompat, withTransaction } from './_db.js';
import { PurchaseVerificationError, verifyStorePurchase } from './_iap.js';

const DEFAULT_FREE_CREDITS = 5;

export class AppDataError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = 'AppDataError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

const getTodayDateString = () => new Date().toISOString().split('T')[0];

export const buildDefaultProfile = (user) => {
  const today = getTodayDateString();
  return {
    id: user.id,
    email: user.email || null,
    credits: DEFAULT_FREE_CREDITS,
    is_premium: false,
    last_daily_reset: today,
    shadow_notes: '',
    streak_count: 1,
    last_streak_claim: today,
    total_time_spent_ms: 0,
  };
};

export const normalizeProfileForApi = (profile) => ({
  ...profile,
  credits: Number.isFinite(profile?.credits) ? profile.credits : 0,
  is_premium: profile?.is_premium === true,
  total_time_spent_ms: Number.isFinite(profile?.total_time_spent_ms) ? profile.total_time_spent_ms : 0,
});

const loadProfileById = async (client, userId, lockRow = false) => {
  const query = `
    SELECT *
    FROM profiles
    WHERE id = $1
    ${lockRow ? 'FOR UPDATE' : ''}
  `;
  const result = await client.query(query, [userId]);
  return result.rows[0] || null;
};

const loadProfileByEmail = async (client, email, lockRow = false) => {
  if (!email) {
    return null;
  }

  const query = `
    SELECT *
    FROM profiles
    WHERE lower(email) = lower($1)
    ${lockRow ? 'FOR UPDATE' : ''}
  `;
  const result = await client.query(query, [email]);
  return result.rows[0] || null;
};

const isActivePremiumSubscription = (subscription) => {
  if (!subscription || subscription.is_active === false) {
    return false;
  }

  if (!subscription.expires_at) {
    return true;
  }

  const expiresAt = new Date(subscription.expires_at).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
};

const isGooglePlaySourceOfTruth = (subscription) => (
  subscription?.platform === 'android' &&
  typeof subscription?.purchase_token_identifier === 'string' &&
  subscription.purchase_token_identifier.trim().length > 0
);

const PREMIUM_REVOCATION_CODES = new Set([
  'PURCHASE_VERIFICATION_FAILED',
  'PURCHASE_ACCOUNT_MISMATCH',
  'GOOGLE_PLAY_EXPIRED',
  'GOOGLE_PLAY_TOKEN_NOT_FOUND',
  'GOOGLE_PLAY_PRODUCT_MISMATCH',
]);

const shouldRevokeForStoreVerificationError = (error) => (
  error instanceof PurchaseVerificationError &&
  PREMIUM_REVOCATION_CODES.has(error.code)
);

const logPremiumNormalization = ({
  userId,
  hadExpiredPremium,
  verificationResultCode,
  updatedExpiryPresent,
  revoked,
  noPurchaseToken,
  noRawReceipt,
}) => {
  console.info('[Premium] normalization result', {
    userId,
    hadExpiredPremium,
    verificationResultCode,
    updatedExpiryPresent,
    revoked,
    noPurchaseToken,
    noRawReceipt,
  });
};

const loadActivePremiumSubscriptionByUserId = async (client, userId, lockRow = false) => {
  const query = `
    SELECT *
    FROM premium_subscriptions
    WHERE user_id = $1
      AND is_active = TRUE
      AND (expires_at IS NULL OR expires_at > NOW())
    ORDER BY
      COALESCE(expires_at, '9999-12-31T23:59:59Z'::timestamptz) DESC,
      updated_at DESC NULLS LAST,
      purchase_date DESC NULLS LAST
    LIMIT 1
    ${lockRow ? 'FOR UPDATE' : ''}
  `;

  const result = await client.query(query, [userId]);
  return result.rows[0] || null;
};

const reconcileProfilePremium = async (client, profile) => {
  const activeSubscription = await loadActivePremiumSubscriptionByUserId(client, profile.id, true);
  if (!activeSubscription || profile.is_premium === true) {
    return profile;
  }

  const updated = await client.query(
    `
      UPDATE profiles
      SET is_premium = TRUE,
          premium_source = COALESCE(premium_source, 'native'),
          premium_platform = COALESCE($2, premium_platform),
          premium_product_id = COALESCE($3, premium_product_id),
          premium_base_plan_id = COALESCE($4, premium_base_plan_id),
          premium_transaction_id = COALESCE($5, premium_transaction_id),
          premium_expires_at = COALESCE($6, premium_expires_at),
          premium_verified_at = COALESCE(premium_verified_at, NOW()),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      profile.id,
      activeSubscription.platform || null,
      activeSubscription.product_id || null,
      activeSubscription.base_plan_id || null,
      activeSubscription.transaction_id || null,
      activeSubscription.expires_at || null,
    ]
  );

  return updated.rows[0] || profile;
};

const isSupabaseLikeClient = (value) => typeof value?.from === 'function';
const loggedProfilePaths = new Set();

const logProfilePath = (path) => {
  const key = `${path}:${useCloudSqlCompat}:${isDatabaseConfigured}`;
  if (loggedProfilePaths.has(key)) {
    return;
  }

  loggedProfilePaths.add(key);
  console.info('[Profiles] ensureUserProfile path selected.', {
    path,
    cloudSqlCompatEnabled: useCloudSqlCompat,
    rawDatabaseConfigured: isDatabaseConfigured,
  });
};

const loadLegacyProfileById = async (client, userId) => {
  const { data, error } = await client
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .limit(1);

  if (error) {
    throw new AppDataError(error.message || 'Failed to load profile', 'PROFILE_BOOTSTRAP_FAILED', 500);
  }

  return Array.isArray(data) ? (data[0] || null) : (data || null);
};

const loadLegacyPremiumSubscriptions = async (client, userId) => {
  const { data, error } = await client
    .from('premium_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(10);

  if (error) {
    throw new AppDataError(
      error.message || 'Failed to load premium subscriptions',
      'PROFILE_BOOTSTRAP_FAILED',
      500
    );
  }

  return Array.isArray(data) ? data : [];
};

const loadLatestLegacyPurchaseReceipt = async (client, userId) => {
  const { data, error } = await client
    .from('purchase_receipts')
    .select('*')
    .eq('user_id', userId)
    .eq('platform', 'android')
    .not('purchase_token', 'is', null)
    .order('verified_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false, nullsFirst: false })
    .limit(1);

  if (error) {
    if (
      error.code === '42P01' ||
      error.code === 'PGRST205' ||
      error.message?.toLowerCase?.().includes('could not find the table')
    ) {
      return null;
    }

    throw new AppDataError(
      error.message || 'Failed to load purchase receipt',
      'PROFILE_BOOTSTRAP_FAILED',
      500
    );
  }

  return Array.isArray(data) ? (data[0] || null) : (data || null);
};

const deactivateLegacyPremiumSubscription = async (client, subscriptionId) => {
  if (!subscriptionId) return;

  const { error } = await client
    .from('premium_subscriptions')
    .update({ is_active: false })
    .eq('id', subscriptionId);

  if (error) {
    throw new AppDataError(
      error.message || 'Failed to deactivate premium subscription',
      'PROFILE_BOOTSTRAP_FAILED',
      500
    );
  }
};

const deactivateLegacyPremiumSubscriptionsByUserId = async (client, userId) => {
  const { error } = await client
    .from('premium_subscriptions')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) {
    throw new AppDataError(
      error.message || 'Failed to deactivate premium subscriptions',
      'PROFILE_BOOTSTRAP_FAILED',
      500
    );
  }
};

const normalizeLegacyRpcProfile = (value) => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value
    : null
);

const setLegacyProfilePremium = async (client, profile, values) => {
  const {
    platform,
    productId,
    basePlanId,
    transactionId,
    purchaseTokenIdentifier,
    expiresAt,
    rawPayload,
  } = values;

  const { data, error } = await client.rpc('admin_set_premium', {
    p_user_uuid: profile.id,
    p_platform_name: platform || 'android',
    p_product_identifier: productId || profile.premium_product_id || 'premium',
    p_transaction_identifier: transactionId || profile.premium_transaction_id || null,
    p_base_plan_identifier: basePlanId || profile.premium_base_plan_id || null,
    p_purchase_token_identifier: purchaseTokenIdentifier || null,
    p_expires_at: expiresAt || profile.premium_expires_at || null,
    p_raw_payload: rawPayload || {},
  });

  if (error) {
    throw new AppDataError(
      error.message || 'Failed to update verified premium profile',
      'PROFILE_BOOTSTRAP_FAILED',
      500
    );
  }

  return normalizeLegacyRpcProfile(data) || {
    ...profile,
    is_premium: true,
    premium_source: 'native',
    premium_platform: platform || profile.premium_platform || 'android',
    premium_product_id: productId || profile.premium_product_id || 'premium',
    premium_base_plan_id: basePlanId || profile.premium_base_plan_id || null,
    premium_transaction_id: transactionId || profile.premium_transaction_id || null,
    premium_expires_at: expiresAt || profile.premium_expires_at || null,
    premium_verified_at: new Date().toISOString(),
  };
};

const revokeLegacyProfilePremium = async (client, profile, premiumSource = 'revoked') => {
  const { data: updated, error } = await client.rpc('admin_revoke_premium', {
    user_uuid: profile.id,
  });

  if (error) {
    throw new AppDataError(
      error.message || 'Failed to revoke premium profile',
      'PROFILE_BOOTSTRAP_FAILED',
      500
    );
  }

  return normalizeLegacyRpcProfile(updated) || {
    ...profile,
    is_premium: false,
    premium_source: premiumSource,
    premium_expires_at: null,
  };
};

const hasActivePremiumVerificationGrace = (profile) => {
  const graceExpiresAt = new Date(profile?.premium_grace_expires_at || '').getTime();
  return Number.isFinite(graceExpiresAt) && graceExpiresAt > Date.now();
};

const recordLegacyPremiumVerificationFailure = async (client, profile, reason) => {
  const { data, error } = await client.rpc('admin_record_premium_verification_failure', {
    p_user_uuid: profile.id,
    p_reason: reason,
  });

  if (error) {
    throw new AppDataError(
      error.message || 'Failed to record premium verification failure',
      'PROFILE_BOOTSTRAP_FAILED',
      500
    );
  }

  return normalizeLegacyRpcProfile(data) || profile;
};

const verifyLegacySubscriptionWithGooglePlay = async (profile, subscription) => {
  try {
    return await verifyStorePurchase({
      platform: 'android',
      productId: subscription.product_id,
      basePlanId: subscription.base_plan_id || null,
      purchaseToken: subscription.purchase_token_identifier,
      transactionId: subscription.transaction_id || null,
      rawReceipt: subscription.raw_payload || {},
      appUserId: profile.id,
    });
  } catch (error) {
    if (!shouldRevokeForStoreVerificationError(error)) {
      console.warn('[Premium] Google Play verification fallback failed, using stored subscription state.', {
        userId: profile.id,
        code: error instanceof PurchaseVerificationError ? error.code : null,
        message: error instanceof Error ? error.message : String(error),
      });
      return null;
    }

    throw error;
  }
};

const syncLegacyProfilePremiumFromVerification = async (client, profile, receipt, verificationResult) => {
  return setLegacyProfilePremium(client, profile, {
    platform: 'android',
    productId: verificationResult?.verifiedProductId,
    basePlanId: verificationResult?.verifiedBasePlanId,
    transactionId: verificationResult?.verifiedTransactionId,
    purchaseTokenIdentifier: receipt?.purchase_token || null,
    expiresAt: verificationResult?.expiresAt,
    rawPayload: {
      verification_provider: verificationResult?.verificationProvider || null,
      verification: verificationResult?.verificationPayload || {},
    },
  });
};

const normalizeExpiredLegacyPremium = async (client, profile) => {
  const expiresAtMs = profile?.premium_expires_at ? new Date(profile.premium_expires_at).getTime() : NaN;
  if (profile?.is_premium !== true || !Number.isFinite(expiresAtMs) || expiresAtMs > Date.now()) {
    return profile;
  }

  const hadExpiredPremium = true;
  const latestReceipt = await loadLatestLegacyPurchaseReceipt(client, profile.id);

  if (!latestReceipt?.purchase_token) {
    const revokedProfile = await revokeLegacyProfilePremium(client, profile, 'expired');
    logPremiumNormalization({
      userId: profile.id,
      hadExpiredPremium,
      verificationResultCode: 'NO_RECEIPT_TOKEN',
      updatedExpiryPresent: false,
      revoked: true,
      noPurchaseToken: true,
      noRawReceipt: !latestReceipt?.raw_payload,
    });
    return revokedProfile;
  }

  let verificationResult;
  try {
    verificationResult = await verifyStorePurchase({
      platform: 'android',
      productId: latestReceipt.product_id || profile.premium_product_id || 'premium',
      basePlanId: latestReceipt.base_plan_id || profile.premium_base_plan_id || null,
      purchaseToken: latestReceipt.purchase_token,
      transactionId: latestReceipt.transaction_id || profile.premium_transaction_id || null,
      rawReceipt: latestReceipt.raw_payload || {},
      appUserId: profile.id,
    });
  } catch (error) {
    const verificationResultCode = error instanceof PurchaseVerificationError
      ? error.code
      : 'UNKNOWN_VERIFICATION_ERROR';

    if (shouldRevokeForStoreVerificationError(error)) {
      const revokedProfile = await revokeLegacyProfilePremium(
        client,
        profile,
        verificationResultCode === 'GOOGLE_PLAY_TOKEN_NOT_FOUND' ? 'revoked' : 'expired'
      );
      logPremiumNormalization({
        userId: profile.id,
        hadExpiredPremium,
        verificationResultCode,
        updatedExpiryPresent: false,
        revoked: true,
        noPurchaseToken: false,
        noRawReceipt: !latestReceipt?.raw_payload,
      });
      return revokedProfile;
    }

    const graceProfile = await recordLegacyPremiumVerificationFailure(client, profile, verificationResultCode);
    if (hasActivePremiumVerificationGrace(graceProfile)) {
      console.warn('[Premium] Expired premium verification unavailable; keeping premium only within the verification grace period.', {
        userId: profile.id,
        hadExpiredPremium,
        verificationResultCode,
        graceExpiresAt: graceProfile.premium_grace_expires_at || null,
      });
      return graceProfile;
    }

    const revokedProfile = await revokeLegacyProfilePremium(client, profile, 'verification_grace_expired');
    logPremiumNormalization({
      userId: profile.id,
      hadExpiredPremium,
      verificationResultCode,
      updatedExpiryPresent: false,
      revoked: true,
      noPurchaseToken: false,
      noRawReceipt: !latestReceipt?.raw_payload,
    });
    return revokedProfi×]ø¶‰žËkºwµçIÍÉ¥ÁÑ¥½¸¹•áÁ¥É•Í}…Ðñð¹Õ±°¤€„ôô€¡ÁÉ½™¥±”¹ÁÉ•µ¥Õµ}•áÁ¥É•Í}…Ðñð¹Õ±°¤ì((€¥˜€ …¹••‘ÍUÁ‘…Ñ”¤ì(€€€É•ÑÕÉ¸ÁÉ½™¥±”ì(€ô((€É•ÑÕÉ¸Í•Ñ1•…åAÉ½™¥±•AÉ•µ¥Õ´¡±¥•¹Ð°ÁÉ½™¥±”°ì(€€€Á±…Ñ™½É´è…Ñ¥Ù•MÕ‰ÍÉ¥ÁÑ¥½¸¹Á±…Ñ™½É´ñðÁÉ½™¥±”¹ÁÉ•µ¥Õµ}Á±…Ñ™½É´ñð€…¹‘É½¥œ°(€€€ÁÉ½‘ÕÑ%è…Ñ¥Ù•MÕ‰ÍÉ¥ÁÑ¥½¸¹ÁÉ½‘ÕÑ}¥ñðÁÉ½™¥±”¹ÁÉ•µ¥Õµ}ÁÉ½‘ÕÑ}¥ñð€ÁÉ•µ¥Õ´œ°(€€€‰…Í•A±…¹%è…Ñ¥Ù•MÕ‰ÍÉ¥ÁÑ¥½¸¹‰…Í•}Á±…¹}¥ñðÁÉ½™¥±”¹ÁÉ•µ¥Õµ}‰…Í•}Á±…¹}¥ñð¹Õ±°°(€€€ÑÉ…¹Í…Ñ¥½¹%è…Ñ¥Ù•MÕ‰ÍÉ¥ÁÑ¥½¸¹ÑÉ…¹Í…Ñ¥½¹}¥ñðÁÉ½™¥±”¹ÁÉ•µ¥Õµ}ÑÉ…¹Í…Ñ¥½¹}¥ñð¹Õ±°°(€€€ÁÕÉ¡…Í•Q½­•¹%‘•¹Ñ¥™¥•Èè…Ñ¥Ù•MÕ‰ÍÉ¥ÁÑ¥½¸¹ÁÕÉ¡…Í•}Ñ½­•¹}¥‘•¹Ñ¥™¥•Èñð¹Õ±°°(€€€•áÁ¥É•ÍÐè…Ñ¥Ù•MÕ‰ÍÉ¥ÁÑ¥½¸¹•áÁ¥É•Í}…ÐñðÁÉ½™¥±”¹ÁÉ•µ¥Õµ}•áÁ¥É•Í}…Ðñð¹Õ±°°(€€€É…ÝA…å±½…è…Ñ¥Ù•MÕ‰ÍÉ¥ÁÑ¥½¸¹É…Ý}Á…å±½…ñðíô°(€ô¤ì)ôì()½¹ÍÐ•¹ÍÕÉ•1•…åUÍ•ÉAÉ½™¥±”€ô…Íå¹Œ€¡±¥•¹Ð°ÕÍ•È¤€ôøì(€±•ÐÁÉ½™¥±”€ô…Ý…¥Ð±½…‘1•…åAÉ½™¥±•	å%¡±¥•¹Ð°ÕÍ•È¹¥¤ì((€¥˜€¡ÁÉ½™¥±”¤ì(€€€¥˜€¡ÕÍ•È¹•µ…¥°€˜˜ÕÍ•È¹•µ…¥°€„ôôÁÉ½™¥±”¹•µ…¥°¤ì(€€€€€½¹ÍÐì‘…Ñ„èÕÁ‘…Ñ•°•ÉÉ½ÈèÕÁ‘…Ñ•ÉÉ½Èô€ô…Ý…¥Ð±¥•¹Ð(€€€€€€€€¹™É½´ ÁÉ½™¥±•Ìœ¤(€€€€€€€€¹ÕÁ‘…Ñ”¡ì•µ…¥°èÕÍ•È¹•µ…¥°ô¤(€€€€€€€€¹•Ä ¥œ°ÕÍ•È¹¥¤(€€€€€€€€¹Í•±•Ð œ¨œ¤(€€€€€€€€¹µ…å‰•M¥¹±” ¤ì((€€€€€¥˜€¡ÕÁ‘…Ñ•ÉÉ½È¤ì(€€€€€€€Ñ¡É½Ü¹•ÜÁÁ…Ñ…ÉÉ½È (€€€€€€€€€ÕÁ‘…Ñ•ÉÉ½È¹µ•ÍÍ…”ñð€…¥±•Ñ¼ÕÁ‘…Ñ”ÁÉ½™¥±”•µ…¥°œ°(€€€€€€€€€€AI=%1}	==QMQIA}%1œ°(€€€€€€€€€€ÔÀÀ(€€€€€€€€¤ì(€€€€€ô((€€€€€ÁÉ½™¥±”€ôÕÁ‘…Ñ•ñðÁÉ½™¥±”ì(€€€ô((€€€ÁÉ½™¥±”€ô…Ý…¥Ð¹½Éµ…±¥é•áÁ¥É•‘1•…åAÉ•µ¥Õ´¡±¥•¹Ð°ÁÉ½™¥±”¤ì(€€€ÁÉ½™¥±”€ô…Ý…¥ÐÉ•½¹¥±•1•…åAÉ½™¥±•AÉ•µ¥Õ´¡±¥•¹Ð°ÁÉ½™¥±”¤ì(€€€É•ÑÕÉ¸ìÁÉ½™¥±”è¹½Éµ…±¥é•AÉ½™¥±•½ÉÁ¤¡ÁÉ½™¥±”¤°É•…Ñ•è™…±Í”°µ¥É…Ñ•è™…±Í”ôì(€ô((€½¹ÍÐ‘•™…Õ±ÑÌ€ô‰Õ¥±‘•™…Õ±ÑAÉ½™¥±”¡ÕÍ•È¤ì(€½¹ÍÐì‘…Ñ„è¥¹Í•ÉÑ•°•ÉÉ½Èè¥¹Í•ÉÑÉÉ½Èô€ô…Ý…¥Ð±¥•¹Ð(€€€€¹™É½´ ÁÉ½™¥±•Ìœ¤(€€€€¹¥¹Í•ÉÐ¡‘•™…Õ±ÑÌ¤(€€€€¹Í•±•Ð œ¨œ¤(€€€€¹µ…å‰•M¥¹±” ¤ì((€¥˜€¡¥¹Í•ÉÑÉÉ½È¤ì(€€€½¹ÍÐ•á¥ÍÑ¥¹AÉ½™¥±”€ô…Ý…¥Ð±½…‘1•…åAÉ½™¥±•	å%¡±¥•¹Ð°ÕÍ•È¹¥¤ì(€€€¥˜€¡•á¥ÍÑ¥¹AÉ½™¥±”¤ì(€€€€€É•ÑÕÉ¸ìÁÉ½™¥±”è¹½Éµ…±¥é•AÉ½™¥±•½ÉÁ¤¡•á¥ÍÑ¥¹AÉ½™¥±”¤°É•…Ñ•è™…±Í”°µ¥É…Ñ•è™…±Í”ôì(€€€ô((€€€Ñ¡É½Ü¹•ÜÁÁ…Ñ…ÉÉ½È (€€€€€¥¹Í•ÉÑÉÉ½È¹µ•ÍÍ…”ñð€…¥±•Ñ¼É•…Ñ”ÁÉ½™¥±”œ°(€€€€€€AI=%1}	==QMQIA}%1œ°(€€€€€€ÔÀÀ(€€€€¤ì(€ô((€ÁÉ½™¥±”€ô…Ý…¥ÐÉ•½¹¥±•1•…åAÉ½™¥±•AÉ•µ¥Õ´¡±¥•¹Ð°¥¹Í•ÉÑ•¤ì(€É•ÑÕÉ¸ìÁÉ½™¥±”è¹½Éµ…±¥é•AÉ½™¥±•½ÉÁ¤¡ÁÉ½™¥±”¤°É•…Ñ•èÑÉÕ”°µ¥É…Ñ•è™…±Í”ôì)ôì()•áÁ½ÉÐ½¹ÍÐ•¹ÍÕÉ•UÍ•ÉAÉ½™¥±”€ô…Íå¹Œ€¡µ…å‰•UÍ•É=É±¥•¹Ð°µ…å‰•UÍ•È€ô¹Õ±°¤€ôøì(€½¹ÍÐÕÍ•È€ôµ…å‰•UÍ•È€˜˜µ…å‰•UÍ•È¹¥€üµ…å‰•UÍ•È€èµ…å‰•UÍ•É=É±¥•¹Ðì(€½¹ÍÐ±¥•¹ÑÉœ€ôµ…å‰•UÍ•È€˜˜µ…å‰•UÍ•È¹¥€˜˜µ…å‰•UÍ•É=É±¥•¹Ðü¹ÅÕ•Éä€üµ…å‰•UÍ•É=É±¥•¹Ð€è¹Õ±°ì(€½¹ÍÐ±•…å±¥•¹ÑÉœ€ô€…¥Í…Ñ…‰…Í•½¹™¥ÕÉ•€˜˜µ…å‰•UÍ•È€˜˜µ…å‰•UÍ•È¹¥€˜˜¥ÍMÕÁ…‰…Í•1¥­•±¥•¹Ð¡µ…å‰•UÍ•É=É±¥•¹Ð¤(€€€€üµ…å‰•UÍ•É=É±¥•¹Ð(€€€€è¹Õ±°ì((€¥˜€ …ÕÍ•Èü¹¥¤ì(€€€Ñ¡É½Ü¹•ÜÁÁ…Ñ…ÉÉ½È UÍ•È¥¥ÌÉ•ÅÕ¥É•Ñ¼•¹ÍÕÉ”ÁÉ½™¥±”œ°€AI=%1}	==QMQIA}%1œ°€ÔÀÀ¤ì(€ô((€¥˜€¡±•…å±¥•¹ÑÉœ¤ì(€€€±½AÉ½™¥±•A…Ñ  ÍÕÁ…‰…Í”µ±¥•¹Ðœ¤ì(€€€É•ÑÕÉ¸•¹ÍÕÉ•1•…åUÍ•ÉAÉ½™¥±”¡±•…å±¥•¹ÑÉœ°ÕÍ•È¤ì(€ô((€½¹ÍÐÝ½É¬€ô…Íå¹Œ€¡±¥•¹Ð¤€ôøì(€€€±•ÐÁÉ½™¥±”€ô…Ý…¥Ð±½…‘AÉ½™¥±•	å%¡±¥•¹Ð°ÕÍ•È¹¥°ÑÉÕ”¤ì(€€€¥˜€¡ÁÉ½™¥±”¤ì(€€€€€¥˜€¡ÕÍ•È¹•µ…¥°€˜˜ÕÍ•È¹•µ…¥°€„ôôÁÉ½™¥±”¹•µ…¥°¤ì(€€€€€€€½¹ÍÐÕÁ‘…Ñ•€ô…Ý…¥Ð±¥•¹Ð¹ÅÕ•Éä (€€€€€€€€€€(€€€€€€€€€€€UAQÁÉ½™¥±•Ì(€€€€€€€€€€€MP•µ…¥°€ô€È°(€€€€€€€€€€€€€€€ÕÁ‘…Ñ•‘}…Ð€ô9=\ ¤(€€€€€€€€€€€]!I¥€ô€Ä(€€€€€€€€€€€IQUI9%9€¨(€€€€€€€€€€°(€€€€€€€€€mÕÍ•È¹¥°ÕÍ•È¹•µ…¥±t(€€€€€€€€¤ì(€€€€€€€ÁÉ½™¥±”€ôÕÁ‘…Ñ•¹É½ÝÍlÁtì(€€€€€ô((€€€€€ÁÉ½™¥±”€ô…Ý…¥ÐÉ•½¹¥±•AÉ½™¥±•AÉ•µ¥Õ´¡±¥•¹Ð°ÁÉ½™¥±”¤ì(€€€€€É•ÑÕÉ¸ìÁÉ½™¥±”è¹½Éµ…±¥é•AÉ½™¥±•½ÉÁ¤¡ÁÉ½™¥±”¤°É•…Ñ•è™…±Í”°µ¥É…Ñ•è™…±Í”ôì(€€€ô((€€€½¹ÍÐ±•…åAÉ½™¥±”€ô…Ý…¥Ð±½…‘AÉ½™¥±•	åµ…¥°¡±¥•¹Ð°ÕÍ•È¹•µ…¥°°ÑÉÕ”¤ì(€€€¥˜€¡±•…åAÉ½™¥±”¤ì(€€€€€½¹ÍÐµ¥É…Ñ•€ô…Ý…¥Ð±¥•¹Ð¹ÅÕ•Éä (€€€€€€€€(€€€€€€€€€UAQÁÉ½™¥±•Ì(€€€€€€€€€MP¥€ô€Ä°(€€€€€€€€€€€€€•µ…¥°€ô=1M È°•µ…¥°¤°(€€€€€€€€€€€€€±•…å}ÕÍ•É}¥€ô=1M¡±•…å}ÕÍ•É}¥°€Ì¤°(€€€€€€€€€€€€€µ¥É…Ñ•‘}Ñ½}™¥É•‰…Í•}…Ð€ô=1M¡µ¥É…Ñ•‘}Ñ½}™¥É•‰…Í•}…Ð°9=\ ¤¤°(€€€€€€€€€€€€€ÕÁ‘…Ñ•‘}…Ð€ô9=\ ¤(€€€€€€€€€]!I¥€ô€Ì(€€€€€€€€€IQUI9%9€¨(€€€€€€€€°(€€€€€€€mÕÍ•È¹¥°ÕÍ•È¹•µ…¥°°±•…åAÉ½™¥±”¹¥‘t(€€€€€€¤ì((€€€€€½¹ÍÐÉ•½¹¥±•‘AÉ½™¥±”€ô…Ý…¥ÐÉ•½¹¥±•AÉ½™¥±•AÉ•µ¥Õ´¡±¥•¹Ð°µ¥É…Ñ•¹É½ÝÍlÁt¤ì(€€€€€É•ÑÕÉ¸ì(€€€€€€€ÁÉ½™¥±”è¹½Éµ…±¥é•AÉ½™¥±•½ÉÁ¤¡É•½¹¥±•‘AÉ½™¥±”¤°(€€€€€€€É•…Ñ•è™…±Í”°(€€€€€€€µ¥É…Ñ•èÑÉÕ”°(€€€€€ôì(€€€ô((€€€½¹ÍÐ‘•™…Õ±ÑÌ€ô‰Õ¥±‘•™…Õ±ÑAÉ½™¥±”¡ÕÍ•È¤ì(€€€½¹ÍÐ¥¹Í•ÉÑ•€ô…Ý…¥Ð±¥•¹Ð¹ÅÕ•Éä (€€€€€€(€€€€€€€%9MIP%9Q<ÁÉ½™¥±•Ì€ (€€€€€€€€€¥°(€€€€€€€€€•µ…¥°°(€€€€€€€€€É•‘¥ÑÌ°(€€€€€€€€€¥Í}ÁÉ•µ¥Õ´°(€€€€€€€€€±…ÍÑ}‘…¥±å}É•Í•Ð°(€€€€€€€€€Í¡…‘½Ý}¹½Ñ•Ì°(€€€€€€€€€ÍÑÉ•…­}½Õ¹Ð°(€€€€€€€€€±…ÍÑ}ÍÑÉ•…­}±…¥´°(€€€€€€€€€Ñ½Ñ…±}Ñ¥µ•}ÍÁ•¹Ñ}µÌ(€€€€€€€€¤(€€€€€€€Y1UL€ Ä°€È°€Ì°€Ð°€Ô°€Ø°€Ü°€à°€ä¤(€€€€€€€IQUI9%9€¨(€€€€€€°(€€€€€l(€€€€€€€‘•™…Õ±ÑÌ¹¥°(€€€€€€€‘•™…Õ±ÑÌ¹•µ…¥°°(€€€€€€€‘•™…Õ±ÑÌ¹É•‘¥ÑÌ°(€€€€€€€‘•™…Õ±ÑÌ¹¥Í}ÁÉ•µ¥Õ´°(€€€€€€€‘•™…Õ±ÑÌ¹±…ÍÑ}‘…¥±å}É•Í•Ð°(€€€€€€€‘•™…Õ±ÑÌ¹Í¡…‘½Ý}¹½Ñ•Ì°(€€€€€€€‘•™…Õ±ÑÌ¹ÍÑÉ•…­}½Õ¹Ð°(€€€€€€€‘•™…Õ±ÑÌ¹±…ÍÑ}ÍÑÉ•…­}±…¥´°(€€€€€€€‘•™…Õ±ÑÌ¹Ñ½Ñ…±}Ñ¥µ•}ÍÁ•¹Ñ}µÌ°(€€€€€t(€€€€¤ì((€€€½¹ÍÐÉ•½¹¥±•‘AÉ½™¥±”€ô…Ý…¥ÐÉ•½¹¥±•AÉ½™¥±•AÉ•µ¥Õ´¡±¥•¹Ð°¥¹Í•ÉÑ•¹É½ÝÍlÁt¤ì(€€€É•ÑÕÉ¸ìÁÉ½™¥±”è¹½Éµ…±¥é•AÉ½™¥±•½ÉÁ¤¡É•½¹¥±•‘AÉ½™¥±”¤°É•…Ñ•èÑÉÕ”°µ¥É…Ñ•è™…±Í”ôì(€ôì((€¥˜€¡±¥•¹ÑÉœ¤ì(€€€±½AÉ½™¥±•A…Ñ  É…ÜµÁœµ±¥•¹Ðœ¤ì(€€€É•ÑÕÉ¸Ý½É¬¡±¥•¹ÑÉœ¤ì(€ô((€±½AÉ½™¥±•A…Ñ  É…ÜµÁœµÑÉ…¹Í…Ñ¥½¸œ¤ì(€É•ÑÕÉ¸Ý¥Ñ¡QÉ…¹Í…Ñ¥½¸¡Ý½É¬¤ì)ôì()•áÁ½ÉÐ½¹ÍÐ±…¥µ…¥±åÉ•‘¥ÑÍ¹‘MÑÉ•…¬€ô…Íå¹Œ€¡ÕÍ•É%¤€ôøÝ¥Ñ¡QÉ…¹Í…Ñ¥½¸¡…Íå¹Œ€¡±¥•¹Ð¤€ôøì(€½¹ÍÐÑ½‘…ä€ô•ÑQ½‘…å…Ñ•MÑÉ¥¹œ ¤ì(€½¹ÍÐå•ÍÑ•É‘…ä€ô¹•Ü…Ñ”¡…Ñ”¹¹½Ü ¤€´€àØÐÀÀÀÀÀ¤¹Ñ½%M=MÑÉ¥¹œ ¤¹ÍÁ±¥Ð Pœ¥lÁtì((€±•ÐÁÉ½™¥±”€ô…Ý…¥Ð±½…‘AÉ½™¥±•	å%¡±¥•¹Ð°ÕÍ•É%°ÑÉÕ”¤ì(€¥˜€ …ÁÉ½™¥±”¤ì(€€€Ñ¡É½Ü¹•ÜÁÁ…Ñ…ÉÉ½È AÉ½™¥±”¹½Ð™½Õ¹œ°€AI=%1}9=Q}=U9œ°€ÐÀÐ¤ì(€ô((€±•ÐÕÁ‘…Ñ•€ô™…±Í”ì(€±•ÐÍÑÉ•…­5Íœ€ô€œœì(€±•ÐÉ•‘¥ÑÌ€ô9Õµ‰•È¹¥Í¥¹¥Ñ”¡ÁÉ½™¥±”¹É•‘¥ÑÌ¤€üÁÉ½™¥±”¹É•‘¥ÑÌ€è€Àì((€¥˜€ …ÁÉ½™¥±”¹±…ÍÑ}‘…¥±å}É•Í•ÐñðÁÉ½™¥±”¹±…ÍÑ}‘…¥±å}É•Í•Ð€ðÑ½‘…ä¤ì(€€€½¹ÍÐÉ•Í•ÑI•ÍÕ±Ð€ô…Ý…¥Ð±¥•¹Ð¹ÅÕ•Éä (€€€€€€(€€€€€€€UAQÁÉ½™¥±•Ì(€€€€€€€MPÉ•‘¥ÑÌ€ô€È°(€€€€€€€€€€€±…ÍÑ}‘…¥±å}É•Í•Ð€ô€Ì°(€€€€€€€€€€€ÕÁ‘…Ñ•‘}…Ð€ô9=\ ¤(€€€€€€€]!I¥€ô€Ä(€€€€€€€IQUI9%9€¨(€€€€€€°(€€€€€mÕÍ•É%°U1Q}I}I%QL°Ñ½‘…åt(€€€€¤ì(€€€ÁÉ½™¥±”€ôÉ•Í•ÑI•ÍÕ±Ð¹É½ÝÍlÁtì(€€€É•‘¥ÑÌ€ôU1Q}I}I%QLì(€€€ÕÁ‘…Ñ•€ôÑÉÕ”ì(€ô((€¥˜€ …ÁÉ½™¥±”¹±…ÍÑ}ÍÑÉ•…­}±…¥´ñðÁÉ½™¥±”¹±…ÍÑ}ÍÑÉ•…­}±…¥´€ðÑ½‘…ä¤ì(€€€½¹ÍÐ¹•áÑMÑÉ•…¬€ô(€€€€€ÁÉ½™¥±”¹±…ÍÑ}ÍÑÉ•…­}±…¥´€˜˜ÁÉ½™¥±”¹±…ÍÑ}ÍÑÉ•…­}±…¥´€ôôôå•ÍÑ•É‘…ä(€€€€€€€€ü€¡9Õµ‰•È¹¥Í¥¹¥Ñ”¡ÁÉ½™¥±”¹ÍÑÉ•…­}½Õ¹Ð¤€üÁÉ½™¥±”¹ÍÑÉ•…­}½Õ¹Ð€è€À¤€¬€Ä(€€€€€€€€è€Äì((€€€±•Ð‰½¹ÕÍÉ•‘¥ÑÌ€ô€Àì(€€€¥˜€¡¹•áÑMÑÉ•…¬€øô€à¤ì(€€€€€‰½¹ÕÍÉ•‘¥ÑÌ€ô€Ìì(€€€€€ÍÑÉ•…­5Íœ€ôƒÂ~R”…ä€‘í¹•áÑMÑÉ•…­ôMÑÉ•…¬„€¬‘í‰½¹ÕÍÉ•‘¥ÑÍô	½¹ÕÌÉ•‘¥ÑÌ…€ì(€€€ô•±Í”¥˜€¡¹•áÑMÑÉ•…¬€øô€Ô¤ì(€€€€€‰½¹ÕÍÉ•‘¥ÑÌ€ô€Èì(€€€€€ÍÑÉ•…­5Íœ€ôƒÂ~R”…ä€‘í¹•áÑMÑÉ•…­ôMÑÉ•…¬„€¬‘í‰½¹ÕÍÉ•‘¥ÑÍô	½¹ÕÌÉ•‘¥ÑÌ…€ì(€€€ô•±Í”¥˜€¡¹•áÑMÑÉ•…¬€øô€È¤ì(€€€€€‰½¹ÕÍÉ•‘¥ÑÌ€ô€Äì(€€€€€ÍÑÉ•…­5Íœ€ôƒÂ~R”…ä€‘í¹•áÑMÑÉ•…­ôMÑÉ•…¬„€¬‘í‰½¹ÕÍÉ•‘¥ÑÍô	½¹ÕÌÉ•‘¥Ð…€ì(€€€ô•±Í”ì(€€€€€ÍÑÉ•…­5Íœ€ô€]•±½µ”‰…¬„ƒÂ~R”…ä€ÄƒŠL­••À¥ÐÕÀ™½È‰½¹ÕÌÉ•‘¥ÑÌ„œì(€€€ô((€€€½¹ÍÐÉ•‘¥Ñ•‘µ½Õ¹Ð€ô‰½¹ÕÍÉ•‘¥ÑÌ€ø€À€˜˜€…ÁÉ½™¥±”¹¥Í}ÁÉ•µ¥Õ´€ü‰½¹ÕÍÉ•‘¥ÑÌ€è€Àì(€€€½¹ÍÐÍÑÉ•…­I•ÍÕ±Ð€ô…Ý…¥Ð±¥•¹Ð¹ÅÕ•Éä (€€€€€€(€€€€€€€UAQÁÉ½™¥±•Ì(€€€€€€€MPÍÑÉ•…­}½Õ¹Ð€ô€È°(€€€€€€€€€€€±…ÍÑ}ÍÑÉ•…­}±…¥´€ô€Ì°(€€€€€€€€€€€É•‘¥ÑÌ€ôÉ•‘¥ÑÌ€¬€Ð°(€€€€€€€€€€€ÕÁ‘…Ñ•‘}…Ð€ô9=\ ¤(€€€€€€€]!I¥€ô€Ä(€€€€€€€IQUI9%9€¨(€€€€€€°(€€€€€mÕÍ•É%°¹•áÑMÑÉ•…¬°Ñ½‘…ä°É•‘¥Ñ•‘µ½Õ¹Ñt(€€€€¤ì((€€€ÁÉ½™¥±”€ôÍÑÉ•…­I•ÍÕ±Ð¹É½ÝÍlÁtì(€€€É•‘¥ÑÌ€ô9Õµ‰•È¹¥Í¥¹¥Ñ”¡ÁÉ½™¥±”¹É•‘¥ÑÌ¤€üÁÉ½™¥±”¹É•‘¥ÑÌ€èÉ•‘¥ÑÌì(€€€ÕÁ‘…Ñ•€ôÑÉÕ”ì(€ô((€É•ÑÕÉ¸ì(€€€ÕÁ‘…Ñ•°(€€€ÁÉ½™¥±”è¹½Éµ…±¥é•AÉ½™¥±•½ÉÁ¤¡ì€¸¸¹ÁÉ½™¥±”°É•‘¥ÑÌô¤°(€€€ÍÑÉ•…­}µÍœèÍÑÉ•…­5Íœ°(€ôì)ô¤ì()•áÁ½ÉÐ½¹ÍÐ•ÑAÉ½™¥±•	å%€ô…Íå¹Œ€¡ÕÍ•É%¤€ôøì(€¥˜€ …Á½½°¤ì(€€€Ñ¡É½Ü¹•ÜÉÉ½È …Ñ…‰…Í”¥Ì¹½Ð½¹™¥ÕÉ•¸œ¤ì(€ô((€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥ÐÁ½½°¹ÅÕ•Éä M1P€¨I=4ÁÉ½™¥±•Ì]!I¥€ô€Äœ°mÕÍ•É%‘t¤ì(€É•ÑÕÉ¸É•ÍÕ±Ð¹É½ÝÍlÁt€ü¹½Éµ…±¥é•AÉ½™¥±•½ÉÁ¤¡É•ÍÕ±Ð¹É½ÝÍlÁt¤€è¹Õ±°ì)ôì()•áÁ½ÉÐ½¹ÍÐÕÁ‘…Ñ•AÉ½™¥±”€ô…Íå¹Œ€¡ÕÍ•É%°ÕÁ‘…Ñ•Ì¤€ôøì(€½¹ÍÐ™¥•±‘Ì€ômtì(€½¹ÍÐÙ…±Õ•Ì€ômÕÍ•É%‘tì((€¥˜€¡=‰©•Ð¹ÁÉ½Ñ½ÑåÁ”¹¡…Í=Ý¹AÉ½Á•ÉÑä¹…±°¡ÕÁ‘…Ñ•Ì°€Í¡…‘½Ý}¹½Ñ•Ìœ¤¤ì(€€€Ù…±Õ•Ì¹ÁÕÍ ¡ÕÁ‘…Ñ•Ì¹Í¡…‘½Ý}¹½Ñ•Ì€üü€œœ¤ì(€€€™¥•±‘Ì¹ÁÕÍ ¡Í¡…‘½Ý}¹½Ñ•Ì€ô€‘íÙ…±Õ•Ì¹±•¹Ñ¡õ€¤ì(€ô((€¥˜€¡™¥•±‘Ì¹±•¹Ñ €ôôô€À¤ì(€€€½¹ÍÐÁÉ½™¥±”€ô…Ý…¥Ð•ÑAÉ½™¥±•	å%¡ÕÍ•É%¤ì(€€€É•ÑÕÉ¸ÁÉ½™¥±”ì(€ô((€Ù…±Õ•Ì¹ÁÕÍ ¡¹•Ü…Ñ” ¤¹Ñ½%M=MÑÉ¥¹œ ¤¤ì(€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥ÐÁ½½°¹ÅÕ•Éä (€€€€(€€€€€UAQÁÉ½™¥±•Ì(€€€€€MP€‘í™¥•±‘Ì¹©½¥¸ œ°€œ¥ô°(€€€€€€€€€ÕÁ‘…Ñ•‘}…Ð€ô€‘íÙ…±Õ•Ì¹±•¹Ñ¡ô(€€€€€]!I¥€ô€Ä(€€€€€IQUI9%9€¨(€€€€°(€€€Ù…±Õ•Ì(€€¤ì((€É•ÑÕÉ¸É•ÍÕ±Ð¹É½ÝÍlÁt€ü¹½Éµ…±¥é•AÉ½™¥±•½ÉÁ¤¡É•ÍÕ±Ð¹É½ÝÍlÁt¤€è¹Õ±°ì)ôì()•áÁ½ÉÐ½¹ÍÐ±¥ÍÑM…Ù•‘%Ñ•µÌ€ô…Íå¹Œ€¡ÕÍ•É%°ì…Í•¹‘¥¹œ€ô™…±Í”ô€ôíô¤€ôøì(€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥ÐÁ½½°¹ÅÕ•Éä (€€€€(€€€€€M1P€¨(€€€€€I=4Í…Ù•‘}¥Ñ•µÌ(€€€€€]!IÕÍ•É}¥€ô€Ä(€€€€€=IH	dÉ•…Ñ•‘}…Ð€‘í…Í•¹‘¥¹œ€ü€Mœ€è€Mô(€€€€°(€€€mÕÍ•É%‘t(€€¤ì(€É•ÑÕÉ¸É•ÍÕ±Ð¹É½ÝÌì)ôì()•áÁ½ÉÐ½¹ÍÐÉ•…Ñ•M…Ù•‘%Ñ•´€ô…Íå¹Œ€¡ÕÍ•É%°¥Ñ•´¤€ôøì(€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥ÐÁ½½°¹ÅÕ•Éä (€€€€(€€€€€%9MIP%9Q<Í…Ù•‘}¥Ñ•µÌ€¡ÕÍ•É}¥°½¹Ñ•¹Ð°ÑåÁ”¤(€€€€€Y1UL€ Ä°€È°€Ì¤(€€€€€IQUI9%9€¨(€€€€°(€€€mÕÍ•É%°¥Ñ•´¹½¹Ñ•¹Ð°¥Ñ•´¹ÑåÁ•t(€€¤ì(€É•ÑÕÉ¸É•ÍÕ±Ð¹É½ÝÍlÁtñð¹Õ±°ì)ôì()•áÁ½ÉÐ½¹ÍÐ‘•±•Ñ•M…Ù•‘%Ñ•´€ô…Íå¹Œ€¡ÕÍ•É%°¥Ñ•µ%¤€ôøì(€¥˜€¡ÕÍ•É%¤ì(€€€…Ý…¥ÐÁ½½°¹ÅÕ•Éä (€€€€€€(€€€€€€€1QI=4Í…Ù•‘}¥Ñ•µÌ(€€€€€€€]!I¥€ô€Ä(€€€€€€€€€9ÕÍ•É}¥€ô€È(€€€€€€°(€€€€€m¥Ñ•µ%°ÕÍ•É%‘t(€€€€¤ì(€€€É•ÑÕÉ¸ì(€ô((€…Ý…¥ÐÁ½½°¹ÅÕ•Éä (€€€€(€€€€€1QI=4Í…Ù•‘}¥Ñ•µÌ(€€€€€]!I¥€ô€Ä(€€€€°(€€€m¥Ñ•µ%‘t(€€¤ì)ôì()•áÁ½ÉÐ½¹ÍÐÉ•…Ñ•I•Á½ÉÐ€ô…Íå¹Œ€¡ÕÍ•É%°½¹Ñ•¹Ð°ÑåÁ”¤€ôøì(€…Ý…¥ÐÁ½½°¹ÅÕ•Éä (€€€€(€€€€€%9MIP%9Q<É•Á½ÉÑÌ€¡ÕÍ•É}¥°½¹Ñ•¹Ð°ÑåÁ”¤(€€€€€Y1UL€ Ä°€È°€Ì¤(€€€€°(€€€mÕÍ•É%°½¹Ñ•¹Ð°ÑåÁ•t(€€¤ì)ôì()•áÁ½ÉÐ½¹ÍÐÉ•½É‘UÍ•ÉÑ¥Ù¥Ñä€ô…Íå¹Œ€¡ÕÍ•É%°…Ñ¥Ù•…Ñ”€ô•ÑQ½‘…å…Ñ•MÑÉ¥¹œ ¤¤€ôøì(€…Ý…¥ÐÁ½½°¹ÅÕ•Éä (€€€€(€€€€€%9MIP%9Q<ÕÍ•É}…Ñ¥Ù¥Ñå}±½œ€¡ÕÍ•É}¥°…Ñ¥Ù•}‘…Ñ”¤(€€€€€Y1UL€ Ä°€È¤(€€€€€=8=91%P€¡ÕÍ•É}¥°…Ñ¥Ù•}‘…Ñ”¤<9=Q!%9(€€€€°(€€€mÕÍ•É%°…Ñ¥Ù•…Ñ•t(€€¤ì)ôì()•áÁ½ÉÐ½¹ÍÐ¥¹É•µ•¹ÑQ½Ñ…±Q¥µ•MÁ•¹Ð€ô…Íå¹Œ€¡ÕÍ•É%°¥¹ÁÕÑ5Ì¤€ôøì(€¥˜€ …¥¹ÁÕÑ5Ìñð¥¹ÁÕÑ5Ì€ðô€À¤ì(€€€Ñ¡É½Ü¹•ÜÁÁ…Ñ…ÉÉ½È ¥¹ÁÕÑ}µÌµÕÍÐ‰”É•…Ñ•ÈÑ¡…¸é•É¼œ°€%9Y1%}%9AUPœ°€ÐÀÀ¤ì(€ô((€½¹ÍÐÉ•ÍÕ±Ð€ô…Ý…¥ÐÁ½½°¹ÅÕ•Éä (€€€€(€€€€€UAQÁÉ½™¥±•Ì(€€€€€MPÑ½Ñ…±}Ñ¥µ•}ÍÁ•¹Ñ}µÌ€ô=1M¡Ñ½Ñ…±}Ñ¥µ•}ÍÁ•¹Ñ}µÌ°€À¤€¬€È°(€€€€€€€€€ÕÁ‘…Ñ•‘}…Ð€ô9=\ ¤(€€€€€]!I¥€ô€Ä(€€€€€IQUI9%9Ñ½Ñ…±}Ñ¥µ•}ÍÁ•¹Ñ}µÌ(€€€€°(€€€mÕÍ•É%°¥¹ÁÕÑ5Ít(€€¤ì((€¥˜€ …É•ÍÕ±Ð¹É½ÝÍlÁt¤ì(€€€Ñ¡É½Ü¹•ÜÁÁ…Ñ…ÉÉ½È AÉ½™¥±”¹½Ð™½Õ¹œ°€AI=%1}9=Q}=U9œ°€ÐÀÐ¤ì(€ô((€É•ÑÕÉ¸9Õµ‰•È¡É•ÍÕ±Ð¹É½ÝÍlÁt¹Ñ½Ñ…±}Ñ¥µ•}ÍÁ•¹Ñ}µÌñð€À¤ì)ôì()•áÁ½ÉÐ½¹ÍÐµ½‘¥™åÉ•‘¥ÑÌ€ô…Íå¹Œ€¡ÕÍ•É%°…µ½Õ¹Ñ¡…¹”¤€ôøÝ¥Ñ¡QÉ…¹Í…Ñ¥½¸¡…Íå¹Œ€¡±¥•¹Ð¤€ôøì(€½¹ÍÐÁÉ½™¥±”€ô…Ý…¥Ð±½…‘AÉ½™¥±•	å%¡±¥•¹Ð°ÕÍ•É%°ÑÉÕ”¤ì(€¥˜€ …ÁÉ½™¥±”¤ì(€€€Ñ¡É½Ü¹•ÜÁÁ…Ñ…ÉÉ½È AÉ½™¥±”¹½Ð™½Õ¹œ°€AI=%1}9=Q}=U9œ°€ÐÀÐ¤ì(€ô((€½¹ÍÐÕÉÉ•¹ÑÉ•‘¥ÑÌ€ô9Õµ‰•È¹¥Í¥¹¥Ñ”¡ÁÉ½™¥±”¹É•‘¥ÑÌ¤€üÁÉ½™¥±”¹É•‘¥ÑÌ€è€Àì(€½¹ÍÐ¹•áÑÉ•‘¥ÑÌ€ôÕÉÉ•¹ÑÉ•‘¥ÑÌ€¬…µ½Õ¹Ñ¡…¹”ì(€¥˜€¡¹•áÑÉ•‘¥ÑÌ€ð€À¤ì(€€€Ñ¡É½Ü¹•ÜÁÁ…Ñ…ÉÉ½È %¹ÍÕ™™¥¥•¹ÐÉ•‘¥ÑÌœ°€%9MU%%9Q}I%QLœ°€ÐÀÌ¤ì(€ô((€½¹ÍÐÕÁ‘…Ñ•€ô…Ý…¥Ð±¥•¹Ð¹ÅÕ•Éä (€€€€(€€€€€UAQÁÉ½™¥±•Ì(€€€€€MPÉ•‘¥ÑÌ€ô€È°(€€€€€€€€€ÕÁ‘…Ñ•‘}…Ð€ô9=\ ¤(€€€€€]!I¥€ô€Ä(€€€€€IQUI9%9É•‘¥ÑÌ(€€€€°(€€€mÕÍ•É%°¹•áÑÉ•‘¥ÑÍt(€€¤ì((€É•ÑÕÉ¸9Õµ‰•È¡ÕÁ‘…Ñ•¹É½ÝÍlÁtü¹É•‘¥ÑÌñð€À¤ì)ô¤ì()•áÁ½ÉÐ½¹ÍÐÍ•ÑAÉ•µ¥Õ´€ô…Íå¹Œ€¡ì(€ÕÍ•É%°(€Á±…Ñ™½Éµ9…µ”°(€ÁÉ½‘ÕÑ%‘•¹Ñ¥™¥•È°(€ÑÉ…¹Í…Ñ¥½¹%‘•¹Ñ¥™¥•È°(€‰…Í•A±…¹%‘•¹Ñ¥™¥•È°(€ÁÕÉ¡…Í•Q½­•¹%‘•¹Ñ¥™¥•È°(€•áÁ¥É•ÍÐ°(€É…ÝA…å±½…°)ô¤€ôøÝ¥Ñ¡QÉ…¹Í…Ñ¥½¸¡…Íå¹Œ€¡±¥•¹Ð¤€ôøì(€½¹ÍÐÁÉ½™¥±•I•ÍÕ±Ð€ô…Ý…¥Ð±¥•¹Ð¹ÅÕ•Éä (€€€€(€€€€€UAQÁÉ½™¥±•Ì(€€€€€MP¥Í}ÁÉ•µ¥Õ´€ôQIU°(€€€€€€€€€ÁÉ•µ¥Õµ}Í½ÕÉ”€ô€¹…Ñ¥Ù”œ°(€€€€€€€€€ÁÉ•µ¥Õµ}Á±…Ñ™½É´€ô€È°(€€€€€€€€€ÁÉ•µ¥Õµ}ÁÉ½‘ÕÑ}¥€ô€Ì°(€€€€€€€€€ÁÉ•µ¥Õµ}‰…Í•}Á±…¹}¥€ô€Ð°(€€€€€€€€€ÁÉ•µ¥Õµ}ÑÉ…¹Í…Ñ¥½¹}¥€ô€Ô°(€€€€€€€€€ÁÉ•µ¥Õµ}•áÁ¥É•Í}…Ð€ô€Ø°(€€€€€€€€€ÁÉ•µ¥Õµ}Ù•É¥™¥•‘}…Ð€ô9=\ ¤°(€€€€€€€€€ÕÁ‘…Ñ•‘}…Ð€ô9=\ ¤(€€€€€]!I¥€ô€Ä(€€€€€IQUI9%9€¨(€€€€°(€€€l(€€€€€ÕÍ•É%°(€€€€€Á±…Ñ™½Éµ9…µ”°(€€€€€ÁÉ½‘ÕÑ%‘•¹Ñ¥™¥•È°(€€€€€‰…Í•A±…¹%‘•¹Ñ¥™¥•È°(€€€€€ÑÉ…¹Í…Ñ¥½¹%‘•¹Ñ¥™¥•È°(€€€€€•áÁ¥É•ÍÐ°(€€€t(€€¤ì((€½¹ÍÐÍ•É¥…±¥é•‘A…å±½…€ô)M=8¹ÍÑÉ¥¹¥™ä¡É…ÝA…å±½…ñðíô¤ì(€½¹ÍÐ•á¥ÍÑ¥¹MÕ‰ÍÉ¥ÁÑ¥½¹I•ÍÕ±Ð€ô…Ý…¥Ð±¥•¹Ð¹ÅÕ•Éä (€€€€(€€€€€M1P¥(€€€€€I=4ÁÉ•µ¥Õµ}ÍÕ‰ÍÉ¥ÁÑ¥½¹Ì(€€€€€]!IÕÍ•É}¥€ô€Ä(€€€€€=IH	dÕÁ‘…Ñ•‘}…ÐM9U11L1MP°ÁÕÉ¡…Í•}‘…Ñ”M9U11L1MP°É•…Ñ•‘}…ÐM9U11L1MP(€€€€€1%5%P€Ä(€€€€°(€€€mÕÍ•É%‘t(€€¤ì((€¥˜€¡•á¥ÍÑ¥¹MÕ‰ÍÉ¥ÁÑ¥½¹I•ÍÕ±Ð¹É½ÝÍlÁtü¹¥¤ì(€€€…Ý…¥Ð±¥•¹Ð¹ÅÕ•Éä (€€€€€€(€€€€€€€UAQÁÉ•µ¥Õµ}ÍÕ‰ÍÉ¥ÁÑ¥½¹Ì(€€€€€€€MPÁ±…Ñ™½É´€ô€È°(€€€€€€€€€€€ÁÉ½‘ÕÑ}¥€ô€Ì°(€€€€€€€€€€€‰…Í•}Á±…¹}¥€ô€Ð°(€€€€€€€€€€€ÑÉ…¹Í…Ñ¥½¹}¥€ô€Ô°(€€€€€€€€€€€ÁÕÉ¡…Í•}Ñ½­•¹}¥‘•¹Ñ¥™¥•È€ô€Ø°(€€€€€€€€€€€¥Í}…Ñ¥Ù”€ôQIU°(€€€€€€€€€€€ÁÕÉ¡…Í•}‘…Ñ”€ô9=\ ¤°(€€€€€€€€€€€•áÁ¥É•Í}…Ð€ô€Ü°(€€€€€€€€€€€É…Ý}Á…å±½…€ô€àèé©Í½¹ˆ°(€€€€€€€€€€€ÕÁ‘…Ñ•‘}…Ð€ô9=\ ¤(€€€€€€€]!I¥€ô€Ä(€€€€€€°(€€€€€l(€€€€€€€•á¥ÍÑ¥¹MÕ‰ÍÉ¥ÁÑ¥½¹I•ÍÕ±Ð¹É½ÝÍlÁt¹¥°(€€€€€€€Á±…Ñ™½Éµ9…µ”°(€€€€€€€ÁÉ½‘ÕÑ%‘•¹Ñ¥™¥•È°(€€€€€€€‰…Í•A±…¹%‘•¹Ñ¥™¥•È°(€€€€€€€ÑÉ…¹Í…Ñ¥½¹%‘•¹Ñ¥™¥•È°(€€€€€€€ÁÕÉ¡…Í•Q½­•¹%‘•¹Ñ¥™¥•È°(€€€€€€€•áÁ¥É•ÍÐ°(€€€€€€€Í•É¥…±¥é•‘A…å±½…°(€€€€€t(€€€€¤ì(€ô•±Í”ì(€€€…Ý…¥Ð±¥•¹Ð¹ÅÕ•Éä (€€€€€€(€€€€€€€%9MIP%9Q<ÁÉ•µ¥Õµ}ÍÕ‰ÍÉ¥ÁÑ¥½¹Ì€ (€€€€€€€€€ÕÍ•É}¥°(€€€€€€€€€Á±…Ñ™½É´°(€€€€€€€€€ÁÉ½‘ÕÑ}¥°(€€€€€€€€€‰…Í•}Á±…¹}¥°(€€€€€€€€€ÑÉ…¹Í…Ñ¥½¹}¥°(€€€€€€€€€ÁÕÉ¡…Í•}Ñ½­•¹}¥‘•¹Ñ¥™¥•È°(€€€€€€€€€¥Í}…Ñ¥Ù”°(€€€€€€€€€ÁÕÉ¡…Í•}‘…Ñ”°(€€€€€€€€€•áÁ¥É•Í}…Ð°(€€€€€€€€€É…Ý}Á…å±½…(€€€€€€€€¤(€€€€€€€Y1UL€ Ä°€È°€Ì°€Ð°€Ô°€Ø°QIU°9=\ ¤°€Ü°€àèé©Í½¹ˆ¤(€€€€€€°(€€€€€l(€€€€€€€ÕÍ•É%°(€€€€€€€Á±…Ñ™½Éµ9…µ”°(€€€€€€€ÁÉ½‘ÕÑ%‘•¹Ñ¥™¥•È°(€€€€€€€‰…Í•A±…¹%‘•¹Ñ¥™¥•È°(€€€€€€€ÑÉ…¹Í…Ñ¥½¹%‘•¹Ñ¥™¥•È°(€€€€€€€ÁÕÉ¡…Í•Q½­•¹%‘•¹Ñ¥™¥•È°(€€€€€€€•áÁ¥É•ÍÐ°(€€€€€€€Í•É¥…±¥é•‘A…å±½…°(€€€€€t(€€€€¤ì(€ô((€É•ÑÕÉ¸¹½Éµ…±¥é•AÉ½™¥±•½ÉÁ¤¡ÁÉ½™¥±•I•ÍÕ±Ð¹É½ÝÍlÁt¤ì)ô¤ì()•áÁ½ÉÐ½¹ÍÐÉ•Ù½­•AÉ•µ¥Õ´€ô…Íå¹Œ€¡ÕÍ•É%¤€ôøÝ¥Ñ¡QÉ…¹Í…Ñ¥½¸¡…Íå¹Œ€¡±¥•¹Ð¤€ôøì(€½¹ÍÐÁÉ½™¥±•I•ÍÕ±Ð€ô…Ý…¥Ð±¥•¹Ð¹ÅÕ•Éä (€€€€(€€€€€UAQÁÉ½™¥±•Ì(€€€€€MP¥Í}ÁÉ•µ¥Õ´€ô1M°(€€€€€€€€€ÁÉ•µ¥Õµ}Í½ÕÉ”€ô€É•Ù½­•œ°(€€€€€€€€€ÁÉ•µ¥Õµ}•áÁ¥É•Í}…Ð€ô9U10°(€€€€€€€€€ÕÁ‘…Ñ•‘}…Ð€ô9=\ ¤(€€€€€]!I¥€ô€Ä(€€€€€IQUI9%9€¨(€€€€°(€€€mÕÍ•É%‘t(€€¤ì((€…Ý…¥Ð±¥•¹Ð¹ÅÕ•Éä (€€€€(€€€€€UAQÁÉ•µ¥Õµ}ÍÕ‰ÍÉ¥ÁÑ¥½¹Ì(€€€€€MP¥Í}…Ñ¥Ù”€ô1M°(€€€€€€€€€ÕÁ‘…Ñ•‘}…Ð€ô9=\ ¤(€€€€€]!IÕÍ•É}¥€ô€Ä(€€€€°(€€€mÕÍ•É%‘t(€€¤ì((€É•ÑÕÉ¸ÁÉ½™¥±•I•ÍÕ±Ð¹É½ÝÍlÁt€ü¹½Éµ…±¥é•AÉ½™¥±•½ÉÁ¤¡ÁÉ½™¥±•I•ÍÕ±Ð¹É½ÝÍlÁt¤€è¹Õ±°ì)ô¤ì()•áÁ½ÉÐ½¹ÍÐ‘•±•Ñ•½Õ¹Ñ…Ñ„€ô…Íå¹Œ€¡ÕÍ•É%¤€ôøì(€…Ý…¥ÐÁ½½°¹ÅÕ•Éä 1QI=4ÁÉ½™¥±•Ì]!I¥€ô€Äœ°mÕÍ•É%‘t¤ì)ôì(