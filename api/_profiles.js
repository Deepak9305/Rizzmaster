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
}) => {
  console.info('[Premium] normalization result', {
    userId,
    hadExpiredPremium,
    verificationResultCode,
    updatedExpiryPresent,
    revoked,
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

const loadAllLegacyPremiumSubscriptions = async (client, userId) => {
  const { data, error } = await client
    .from('premium_subscriptions')
    .select('*')
    .eq('user_id', userId)
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

const isMissingLegacySubscriptionColumnError = (error) => {
  const message = error?.message || '';
  return typeof message === 'string' && (
    message.includes("Could not find the '") ||
    message.includes('schema cache') ||
    message.includes('column') && message.includes('does not exist')
  );
};

const upsertLegacyPremiumSubscriptionRecord = async (client, values) => {
  const existing = await loadAllLegacyPremiumSubscriptions(client, values.userId);
  const latest = existing
    .slice()
    .sort((left, right) => {
      const leftUpdated = new Date(left.updated_at || left.purchase_date || 0).getTime();
      const rightUpdated = new Date(right.updated_at || right.purchase_date || 0).getTime();
      return rightUpdated - leftUpdated;
    })[0];

  const baseUpdate = {
    platform: values.platform,
    product_id: values.productId,
    transaction_id: values.transactionId,
    is_active: true,
    purchase_date: new Date().toISOString(),
  };
  const extendedUpdate = {
    ...baseUpdate,
    base_plan_id: values.basePlanId || null,
    purchase_token_identifier: values.purchaseTokenIdentifier || null,
    expires_at: values.expiresAt || null,
    raw_payload: values.rawPayload || {},
    updated_at: new Date().toISOString(),
  };

  if (latest?.id) {
    let { error } = await client
      .from('premium_subscriptions')
      .update(extendedUpdate)
      .eq('id', latest.id);

    if (error && isMissingLegacySubscriptionColumnError(error)) {
      ({ error } = await client
        .from('premium_subscriptions')
        .update(baseUpdate)
        .eq('id', latest.id));
    }

    if (error) {
      throw new AppDataError(
        error.message || 'Failed to update premium subscription',
        'PROFILE_BOOTSTRAP_FAILED',
        500
      );
    }

    return;
  }

  let { error } = await client
    .from('premium_subscriptions')
    .insert({
      user_id: values.userId,
      ...extendedUpdate,
    });

  if (error && isMissingLegacySubscriptionColumnError(error)) {
    ({ error } = await client
      .from('premium_subscriptions')
      .insert({
        user_id: values.userId,
        ...baseUpdate,
      }));
  }

  if (error) {
    throw new AppDataError(
      error.message || 'Failed to create premium subscription',
      'PROFILE_BOOTSTRAP_FAILED',
      500
    );
  }
};

const revokeLegacyProfilePremium = async (client, profile, premiumSource = 'revoked') => {
  await deactivateLegacyPremiumSubscriptionsByUserId(client, profile.id);

  const { data: updated, error } = await client
    .from('profiles')
    .update({
      is_premium: false,
      premium_source: premiumSource,
      premium_expires_at: null,
    })
    .eq('id', profile.id)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new AppDataError(
      error.message || 'Failed to revoke premium profile',
      'PROFILE_BOOTSTRAP_FAILED',
      500
    );
  }

  return updated || { ...profile, is_premium: false, premium_source: premiumSource, premium_expires_at: null };
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
  const nextExpiry = verificationResult?.expiresAt || profile.premium_expires_at || null;
  const nextBasePlanId = verificationResult?.verifiedBasePlanId || receipt?.base_plan_id || profile.premium_base_plan_id || null;
  const nextTransactionId = receipt?.transaction_id || profile.premium_transaction_id || null;
  const nextProductId = receipt?.product_id || profile.premium_product_id || null;

  const { data: updated, error } = await client
    .from('profiles')
    .update({
      is_premium: true,
      premium_source: 'native',
      premium_platform: 'android',
      premium_product_id: nextProductId,
      premium_base_plan_id: nextBasePlanId,
      premium_transaction_id: nextTransactionId,
      premium_expires_at: nextExpiry,
      premium_verified_at: new Date().toISOString(),
    })
    .eq('id', profile.id)
    .select('*')
    .maybeSingle();

  if (error) {
    throw new AppDataError(
      error.message || 'Failed to update verified premium profile',
      'PROFILE_BOOTSTRAP_FAILED',
      500
    );
  }

  await upsertLegacyPremiumSubscriptionRecord(client, {
    userId: profile.id,
    platform: 'android',
    productId: nextProductId,
    basePlanId: nextBasePlanId,
    transactionId: nextTransactionId,
    purchaseTokenIdentifier: receipt?.purchase_token || null,
    expiresAt: nextExpiry,
    rawPayload: receipt?.raw_payload || {},
  });

  return updated || {
    ...profile,
    is_premium: true,
    premium_source: 'native',
    premium_platform: 'android',
    premium_product_id: nextProductId,
    premium_base_plan_id: nextBasePlanId,
    premium_transaction_id: nextTransactionId,
    premium_expires_at: nextExpiry,
  };
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
    });
    return revokedProfile;
  }

  try {
    const verificationResult = await verifyStorePurchase({
      platform: 'android',
      productId: latestReceipt.product_id || profile.premium_product_id || 'premium',
      basePlanId: latestReceipt.base_plan_id || profile.premium_base_plan_id || null,
      purchaseToken: latestReceipt.purchase_token,
      transactionId: latestReceipt.transaction_id || profile.premium_transaction_id || null,
      rawReceipt: latestReceipt.raw_payload || {},
      appUserId: profile.id,
    });

    const updatedProfile = await syncLegacyProfilePremiumFromVerification(
      client,
      profile,
      latestReceipt,
      verificationResult
    );

    logPremiumNormalization({
      userId: profile.id,
      hadExpiredPremium,
      verificationResultCode: 'GOOGLE_PLAY_RENEWED',
      updatedExpiryPresent: Boolean(updatedProfile?.premium_expires_at),
      revoked: false,
    });
    return updatedProfile;
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
      });
      return revokedProfile;
    }

    console.warn('[Premium] Expired premium verification unavailable; keeping stored premium state.', {
      userId: profile.id,
      hadExpiredPremium,
      verificationResultCode,
      updatedExpiryPresent: false,
      revoked: false,
    });
    return profile;
  }
};

const reconcileLegacyProfilePremium = async (client, profile) => {
  const subscriptions = await loadLegacyPremiumSubscriptions(client, profile.id);
  let activeSubscription = subscriptions
    .filter(isActivePremiumSubscription)
    .sort((left, right) => {
      const leftUpdated = new Date(left.updated_at || left.purchase_date || 0).getTime();
      const rightUpdated = new Date(right.updated_at || right.purchase_date || 0).getTime();
      return rightUpdated - leftUpdated;
    })[0];

  if (!activeSubscription) {
    return profile;
  }

  if (isGooglePlaySourceOfTruth(activeSubscription)) {
    try {
      const verificationResult = await verifyLegacySubscriptionWithGooglePlay(profile, activeSubscription);
      if (verificationResult?.expiresAt || verificationResult?.verifiedBasePlanId) {
        activeSubscription = {
          ...activeSubscription,
          expires_at: verificationResult.expiresAt || activeSubscription.expires_at || null,
          base_plan_id: verificationResult.verifiedBasePlanId || activeSubscription.base_plan_id || null,
        };
      }
    } catch (error) {
      await deactivateLegacyPremiumSubscription(client, activeSubscription.id);
      return revokeLegacyProfilePremium(client, profile);
    }
  }

  const needsUpdate =
    profile.is_premium !== true ||
    (activeSubscription.platform || null) !== (profile.premium_platform || null) ||
    (activeSubscription.product_id || null) !== (profile.premium_product_id || null) ||
    (activeSubscription.base_plan_id || null) !== (profile.premium_base_plan_id || null) ||
    (activeSubscription.transaction_id || null) !== (profile.premium_transaction_id || null) ||
    (activeSubscription.expires_at || null) !== (profile.premium_expires_at || null);

  if (!needsUpdate) {
    return profile;
  }

  const { data: updated, error: updateError } = await client
    .from('profiles')
    .update({
      is_premium: true,
      premium_source: profile.premium_source || 'native',
      premium_platform: activeSubscription.platform || profile.premium_platform || null,
      premium_product_id: activeSubscription.product_id || profile.premium_product_id || null,
      premium_base_plan_id: activeSubscription.base_plan_id || profile.premium_base_plan_id || null,
      premium_transaction_id: activeSubscription.transaction_id || profile.premium_transaction_id || null,
      premium_expires_at: activeSubscription.expires_at || profile.premium_expires_at || null,
      premium_verified_at: profile.premium_verified_at || new Date().toISOString(),
    })
    .eq('id', profile.id)
    .select('*')
    .maybeSingle();

  if (updateError) {
    throw new AppDataError(
      updateError.message || 'Failed to reconcile premium profile',
      'PROFILE_BOOTSTRAP_FAILED',
      500
    );
  }

  return updated || profile;
};

const ensureLegacyUserProfile = async (client, user) => {
  let profile = await loadLegacyProfileById(client, user.id);

  if (profile) {
    if (user.email && user.email !== profile.email) {
      const { data: updated, error: updateError } = await client
        .from('profiles')
        .update({ email: user.email })
        .eq('id', user.id)
        .select('*')
        .maybeSingle();

      if (updateError) {
        throw new AppDataError(
          updateError.message || 'Failed to update profile email',
          'PROFILE_BOOTSTRAP_FAILED',
          500
        );
      }

      profile = updated || profile;
    }

    profile = await normalizeExpiredLegacyPremium(client, profile);
    profile = await reconcileLegacyProfilePremium(client, profile);
    return { profile: normalizeProfileForApi(profile), created: false, migrated: false };
  }

  const defaults = buildDefaultProfile(user);
  const { data: inserted, error: insertError } = await client
    .from('profiles')
    .insert(defaults)
    .select('*')
    .maybeSingle();

  if (insertError) {
    const existingProfile = await loadLegacyProfileById(client, user.id);
    if (existingProfile) {
      return { profile: normalizeProfileForApi(existingProfile), created: false, migrated: false };
    }

    throw new AppDataError(
      insertError.message || 'Failed to create profile',
      'PROFILE_BOOTSTRAP_FAILED',
      500
    );
  }

  profile = await reconcileLegacyProfilePremium(client, inserted);
  return { profile: normalizeProfileForApi(profile), created: true, migrated: false };
};

export const ensureUserProfile = async (maybeUserOrClient, maybeUser = null) => {
  const user = maybeUser && maybeUser.id ? maybeUser : maybeUserOrClient;
  const clientArg = maybeUser && maybeUser.id && maybeUserOrClient?.query ? maybeUserOrClient : null;
  const legacyClientArg = !isDatabaseConfigured && maybeUser && maybeUser.id && isSupabaseLikeClient(maybeUserOrClient)
    ? maybeUserOrClient
    : null;

  if (!user?.id) {
    throw new AppDataError('User id is required to ensure profile', 'PROFILE_BOOTSTRAP_FAILED', 500);
  }

  if (legacyClientArg) {
    logProfilePath('supabase-client');
    return ensureLegacyUserProfile(legacyClientArg, user);
  }

  const work = async (client) => {
    let profile = await loadProfileById(client, user.id, true);
    if (profile) {
      if (user.email && user.email !== profile.email) {
        const updated = await client.query(
          `
            UPDATE profiles
            SET email = $2,
                updated_at = NOW()
            WHERE id = $1
            RETURNING *
          `,
          [user.id, user.email]
        );
        profile = updated.rows[0];
      }

      profile = await reconcileProfilePremium(client, profile);
      return { profile: normalizeProfileForApi(profile), created: false, migrated: false };
    }

    const legacyProfile = await loadProfileByEmail(client, user.email, true);
    if (legacyProfile) {
      const migrated = await client.query(
        `
          UPDATE profiles
          SET id = $1,
              email = COALESCE($2, email),
              legacy_user_id = COALESCE(legacy_user_id, $3),
              migrated_to_firebase_at = COALESCE(migrated_to_firebase_at, NOW()),
              updated_at = NOW()
          WHERE id = $3
          RETURNING *
        `,
        [user.id, user.email, legacyProfile.id]
      );

      const reconciledProfile = await reconcileProfilePremium(client, migrated.rows[0]);
      return {
        profile: normalizeProfileForApi(reconciledProfile),
        created: false,
        migrated: true,
      };
    }

    const defaults = buildDefaultProfile(user);
    const inserted = await client.query(
      `
        INSERT INTO profiles (
          id,
          email,
          credits,
          is_premium,
          last_daily_reset,
          shadow_notes,
          streak_count,
          last_streak_claim,
          total_time_spent_ms
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `,
      [
        defaults.id,
        defaults.email,
        defaults.credits,
        defaults.is_premium,
        defaults.last_daily_reset,
        defaults.shadow_notes,
        defaults.streak_count,
        defaults.last_streak_claim,
        defaults.total_time_spent_ms,
      ]
    );

    const reconciledProfile = await reconcileProfilePremium(client, inserted.rows[0]);
    return { profile: normalizeProfileForApi(reconciledProfile), created: true, migrated: false };
  };

  if (clientArg) {
    logProfilePath('raw-pg-client');
    return work(clientArg);
  }

  logProfilePath('raw-pg-transaction');
  return withTransaction(work);
};

export const claimDailyCreditsAndStreak = async (userId) => withTransaction(async (client) => {
  const today = getTodayDateString();
  const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  let profile = await loadProfileById(client, userId, true);
  if (!profile) {
    throw new AppDataError('Profile not found', 'PROFILE_NOT_FOUND', 404);
  }

  let updated = false;
  let streakMsg = '';
  let credits = Number.isFinite(profile.credits) ? profile.credits : 0;

  if (!profile.last_daily_reset || profile.last_daily_reset < today) {
    const resetResult = await client.query(
      `
        UPDATE profiles
        SET credits = $2,
            last_daily_reset = $3,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [userId, DEFAULT_FREE_CREDITS, today]
    );
    profile = resetResult.rows[0];
    credits = DEFAULT_FREE_CREDITS;
    updated = true;
  }

  if (!profile.last_streak_claim || profile.last_streak_claim < today) {
    const nextStreak =
      profile.last_streak_claim && profile.last_streak_claim === yesterday
        ? (Number.isFinite(profile.streak_count) ? profile.streak_count : 0) + 1
        : 1;

    let bonusCredits = 0;
    if (nextStreak >= 8) {
      bonusCredits = 3;
      streakMsg = `🔥 Day ${nextStreak} Streak! +${bonusCredits} Bonus Credits!`;
    } else if (nextStreak >= 5) {
      bonusCredits = 2;
      streakMsg = `🔥 Day ${nextStreak} Streak! +${bonusCredits} Bonus Credits!`;
    } else if (nextStreak >= 2) {
      bonusCredits = 1;
      streakMsg = `🔥 Day ${nextStreak} Streak! +${bonusCredits} Bonus Credit!`;
    } else {
      streakMsg = 'Welcome back! 🔥 Day 1 – keep it up for bonus credits!';
    }

    const creditedAmount = bonusCredits > 0 && !profile.is_premium ? bonusCredits : 0;
    const streakResult = await client.query(
      `
        UPDATE profiles
        SET streak_count = $2,
            last_streak_claim = $3,
            credits = credits + $4,
            updated_at = NOW()
        WHERE id = $1
        RETURNING *
      `,
      [userId, nextStreak, today, creditedAmount]
    );

    profile = streakResult.rows[0];
    credits = Number.isFinite(profile.credits) ? profile.credits : credits;
    updated = true;
  }

  return {
    updated,
    profile: normalizeProfileForApi({ ...profile, credits }),
    streak_msg: streakMsg,
  };
});

export const getProfileById = async (userId) => {
  if (!pool) {
    throw new Error('Database is not configured.');
  }

  const result = await pool.query('SELECT * FROM profiles WHERE id = $1', [userId]);
  return result.rows[0] ? normalizeProfileForApi(result.rows[0]) : null;
};

export const updateProfile = async (userId, updates) => {
  const fields = [];
  const values = [userId];

  if (Object.prototype.hasOwnProperty.call(updates, 'shadow_notes')) {
    values.push(updates.shadow_notes ?? '');
    fields.push(`shadow_notes = $${values.length}`);
  }

  if (fields.length === 0) {
    const profile = await getProfileById(userId);
    return profile;
  }

  values.push(new Date().toISOString());
  const result = await pool.query(
    `
      UPDATE profiles
      SET ${fields.join(', ')},
          updated_at = $${values.length}
      WHERE id = $1
      RETURNING *
    `,
    values
  );

  return result.rows[0] ? normalizeProfileForApi(result.rows[0]) : null;
};

export const listSavedItems = async (userId, { ascending = false } = {}) => {
  const result = await pool.query(
    `
      SELECT *
      FROM saved_items
      WHERE user_id = $1
      ORDER BY created_at ${ascending ? 'ASC' : 'DESC'}
    `,
    [userId]
  );
  return result.rows;
};

export const createSavedItem = async (userId, item) => {
  const result = await pool.query(
    `
      INSERT INTO saved_items (user_id, content, type)
      VALUES ($1, $2, $3)
      RETURNING *
    `,
    [userId, item.content, item.type]
  );
  return result.rows[0] || null;
};

export const deleteSavedItem = async (userId, itemId) => {
  if (userId) {
    await pool.query(
      `
        DELETE FROM saved_items
        WHERE id = $1
          AND user_id = $2
      `,
      [itemId, userId]
    );
    return;
  }

  await pool.query(
    `
      DELETE FROM saved_items
      WHERE id = $1
    `,
    [itemId]
  );
};

export const createReport = async (userId, content, type) => {
  await pool.query(
    `
      INSERT INTO reports (user_id, content, type)
      VALUES ($1, $2, $3)
    `,
    [userId, content, type]
  );
};

export const recordUserActivity = async (userId, activeDate = getTodayDateString()) => {
  await pool.query(
    `
      INSERT INTO user_activity_log (user_id, active_date)
      VALUES ($1, $2)
      ON CONFLICT (user_id, active_date) DO NOTHING
    `,
    [userId, activeDate]
  );
};

export const incrementTotalTimeSpent = async (userId, inputMs) => {
  if (!inputMs || inputMs <= 0) {
    throw new AppDataError('input_ms must be greater than zero', 'INVALID_INPUT', 400);
  }

  const result = await pool.query(
    `
      UPDATE profiles
      SET total_time_spent_ms = COALESCE(total_time_spent_ms, 0) + $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING total_time_spent_ms
    `,
    [userId, inputMs]
  );

  if (!result.rows[0]) {
    throw new AppDataError('Profile not found', 'PROFILE_NOT_FOUND', 404);
  }

  return Number(result.rows[0].total_time_spent_ms || 0);
};

export const modifyCredits = async (userId, amountChange) => withTransaction(async (client) => {
  const profile = await loadProfileById(client, userId, true);
  if (!profile) {
    throw new AppDataError('Profile not found', 'PROFILE_NOT_FOUND', 404);
  }

  const currentCredits = Number.isFinite(profile.credits) ? profile.credits : 0;
  const nextCredits = currentCredits + amountChange;
  if (nextCredits < 0) {
    throw new AppDataError('Insufficient credits', 'INSUFFICIENT_CREDITS', 403);
  }

  const updated = await client.query(
    `
      UPDATE profiles
      SET credits = $2,
          updated_at = NOW()
      WHERE id = $1
      RETURNING credits
    `,
    [userId, nextCredits]
  );

  return Number(updated.rows[0]?.credits || 0);
});

export const setPremium = async ({
  userId,
  platformName,
  productIdentifier,
  transactionIdentifier,
  basePlanIdentifier,
  purchaseTokenIdentifier,
  expiresAt,
  rawPayload,
}) => withTransaction(async (client) => {
  const profileResult = await client.query(
    `
      UPDATE profiles
      SET is_premium = TRUE,
          premium_source = 'native',
          premium_platform = $2,
          premium_product_id = $3,
          premium_base_plan_id = $4,
          premium_transaction_id = $5,
          premium_expires_at = $6,
          premium_verified_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [
      userId,
      platformName,
      productIdentifier,
      basePlanIdentifier,
      transactionIdentifier,
      expiresAt,
    ]
  );

  const serializedPayload = JSON.stringify(rawPayload || {});
  const existingSubscriptionResult = await client.query(
    `
      SELECT id
      FROM premium_subscriptions
      WHERE user_id = $1
      ORDER BY updated_at DESC NULLS LAST, purchase_date DESC NULLS LAST, created_at DESC NULLS LAST
      LIMIT 1
    `,
    [userId]
  );

  if (existingSubscriptionResult.rows[0]?.id) {
    await client.query(
      `
        UPDATE premium_subscriptions
        SET platform = $2,
            product_id = $3,
            base_plan_id = $4,
            transaction_id = $5,
            purchase_token_identifier = $6,
            is_active = TRUE,
            purchase_date = NOW(),
            expires_at = $7,
            raw_payload = $8::jsonb,
            updated_at = NOW()
        WHERE id = $1
      `,
      [
        existingSubscriptionResult.rows[0].id,
        platformName,
        productIdentifier,
        basePlanIdentifier,
        transactionIdentifier,
        purchaseTokenIdentifier,
        expiresAt,
        serializedPayload,
      ]
    );
  } else {
    await client.query(
      `
        INSERT INTO premium_subscriptions (
          user_id,
          platform,
          product_id,
          base_plan_id,
          transaction_id,
          purchase_token_identifier,
          is_active,
          purchase_date,
          expires_at,
          raw_payload
        )
        VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW(), $7, $8::jsonb)
      `,
      [
        userId,
        platformName,
        productIdentifier,
        basePlanIdentifier,
        transactionIdentifier,
        purchaseTokenIdentifier,
        expiresAt,
        serializedPayload,
      ]
    );
  }

  return normalizeProfileForApi(profileResult.rows[0]);
});

export const revokePremium = async (userId) => withTransaction(async (client) => {
  const profileResult = await client.query(
    `
      UPDATE profiles
      SET is_premium = FALSE,
          premium_source = 'revoked',
          premium_expires_at = NULL,
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
    [userId]
  );

  await client.query(
    `
      UPDATE premium_subscriptions
      SET is_active = FALSE,
          updated_at = NOW()
      WHERE user_id = $1
    `,
    [userId]
  );

  return profileResult.rows[0] ? normalizeProfileForApi(profileResult.rows[0]) : null;
});

export const deleteAccountData = async (userId) => {
  await pool.query('DELETE FROM profiles WHERE id = $1', [userId]);
};
