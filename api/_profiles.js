const DEFAULT_FREE_CREDITS = 5;

const getTodayDateString = () => new Date().toISOString().split("T")[0];

export const buildDefaultProfile = (user) => {
  const today = getTodayDateString();
  return {
    id: user.id,
    email: user.email || null,
    credits: DEFAULT_FREE_CREDITS,
    is_premium: false,
    last_daily_reset: today,
    shadow_notes: "",
    streak_count: 1,
    last_streak_claim: today,
    total_time_spent_ms: 0,
  };
};

const isProfileColumnMismatch = (error) => (
  error && (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.message?.toLowerCase().includes("column")
  )
);

const normalizeProfileForApi = (profile) => ({
  ...profile,
  credits: Number.isFinite(profile?.credits) ? profile.credits : 0,
  is_premium: profile?.is_premium === true,
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const readExistingProfile = async (supabaseAdmin, userId) => {
  const result = await supabaseAdmin
    .from("profiles")
    .select("credits, is_premium")
    .eq("id", userId)
    .single();

  if (!result.error && result.data) {
    return { profile: normalizeProfileForApi(result.data), created: false };
  }

  return { profile: null, created: false, error: result.error };
};

export const ensureUserProfile = async (supabaseAdmin, user) => {
  let { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("credits, is_premium")
    .eq("id", user.id)
    .single();

  if (!error && profile) {
    return { profile: normalizeProfileForApi(profile), created: false };
  }

  const missingRow = error?.code === "PGRST116";
  if (!missingRow) {
    return { profile: null, created: false, error };
  }

  const defaultProfile = buildDefaultProfile(user);
  const legacyProfile = {
    id: defaultProfile.id,
    email: defaultProfile.email,
    credits: defaultProfile.credits,
    is_premium: defaultProfile.is_premium,
    last_daily_reset: defaultProfile.last_daily_reset,
    shadow_notes: defaultProfile.shadow_notes,
  };

  for (let attempt = 0; attempt < 3; attempt += 1) {
    let insertResult = await supabaseAdmin
      .from("profiles")
      .insert([defaultProfile])
      .select("credits, is_premium")
      .single();

    if (isProfileColumnMismatch(insertResult.error)) {
      insertResult = await supabaseAdmin
        .from("profiles")
        .insert([legacyProfile])
        .select("credits, is_premium")
        .single();
    }

    if (!insertResult.error && insertResult.data) {
      return { profile: normalizeProfileForApi(insertResult.data), created: true };
    }

    if (insertResult.error?.code === "23505") {
      return readExistingProfile(supabaseAdmin, user.id);
    }

    if (insertResult.error?.code === "23503") {
      await wait(250 * (attempt + 1));
      const existingProfile = await readExistingProfile(supabaseAdmin, user.id);
      if (existingProfile.profile) {
        return existingProfile;
      }
      error = insertResult.error;
      continue;
    }

    return { profile: null, created: false, error: insertResult.error };
  }

  return { profile: null, created: false, error };
};
