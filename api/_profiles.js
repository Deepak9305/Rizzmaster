import { isDatabaseConfigured, pool, withTransaction } from './_db.js';

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

const isSupabaseLikeClient = (value) => typeof value?.from === 'function';

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

  return { profile: normalizeProfileForApi(inserted), created: true, migrated: false };
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

      return {
        profile: normalizeProfileForApi(migrated.rows[0]),
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

    return { profile: normalizeProfileForApi(inserted.rows[0]), created: true, migrated: false };
  };

  if (clientArg) {
    return work(clientArg);
  }

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
  if (purchaseTokenIdentifier) {
    const conflict = await client.query(
      `
        SELECT user_id
        FROM premium_subscriptions
        WHERE purchase_token_identifier = $1
          AND user_id <> $2
        LIMIT 1
      `,
      [purchaseTokenIdentifier, userId]
    );
    if (conflict.rows[0]) {
      throw new AppDataError(
        'This subscription is already linked to another Rizzmaster account. Please log in with that account or contact support.',
        'PURCHASE_ALREADY_LINKED',
        409
      );
    }
  }

  if (transactionIdentifier) {
    const conflict = await client.query(
      `
        SELECT user_id
        FROM premium_subscriptions
        WHERE transaction_id = $1
          AND user_id <> $2
        LIMIT 1
      `,
      [transactionIdentifier, userId]
    );
    if (conflict.rows[0]) {
      throw new AppDataError(
        'This subscription is already linked to another Rizzmaster account. Please log in with that account or contact support.',
        'PURCHASE_ALREADY_LINKED',
        409
      );
    }
  }

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
      ON CONFLICT (user_id, platform, product_id)
      DO UPDATE SET
        base_plan_id = EXCLUDED.base_plan_id,
        transaction_id = EXCLUDED.transaction_id,
        purchase_token_identifier = EXCLUDED.purchase_token_identifier,
        is_active = TRUE,
        expires_at = EXCLUDED.expires_at,
        raw_payload = EXCLUDED.raw_payload,
        updated_at = NOW()
    `,
    [
      userId,
      platformName,
      productIdentifier,
      basePlanIdentifier,
      transactionIdentifier,
      purchaseTokenIdentifier,
      expiresAt,
      JSON.stringify(rawPayload || {}),
    ]
  );

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
