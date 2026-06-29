import { supabase, supabaseAdmin } from './_supabase.js';
import { ensureUserProfile } from './_profiles.js';

const LOGIN_REQUIRED_CODE = "LOGIN_REQUIRED";
const SUPABASE_BACKEND_UNAVAILABLE_CODE = "SUPABASE_BACKEND_UNAVAILABLE";
const PROFILE_BOOTSTRAP_FAILED_CODE = "PROFILE_BOOTSTRAP_FAILED";

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(payload));
};

const isMissingOptionalSchemaError = (error) => (
  error?.code === "42P01" ||
  error?.code === "PGRST205" ||
  error?.message?.toLowerCase?.().includes("could not find the table")
);

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
};

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  const token = getBearerToken(req);
  if (!token) {
    return json(res, 401, {
      error: "Missing or invalid authorization header.",
      code: LOGIN_REQUIRED_CODE,
    });
  }

  if (!supabase || !supabaseAdmin) {
    return json(res, 503, {
      error: "Supabase integration not configured on the server.",
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
    });
  }

  let user;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data?.user) {
      return json(res, 401, {
        error: "Unauthorized. Invalid or expired session.",
        code: LOGIN_REQUIRED_CODE,
      });
    }
    user = data.user;
  } catch (error) {
    console.error("[Profile API] Token verification request failed:", error);
    return json(res, 503, {
      error: "Token verification failed because the auth backend could not be reached.",
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
    });
  }

  const ensured = await ensureUserProfile(supabaseAdmin, user);
  if (ensured.error || !ensured.profile) {
    console.error("[Profile API] Failed to prepare profile:", ensured.error);
    return json(res, 500, {
      error: "Could not prepare your account profile.",
      code: PROFILE_BOOTSTRAP_FAILED_CODE,
    });
  }

  const profileResult = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  if (profileResult.error || !profileResult.data) {
    console.error("[Profile API] Failed to load prepared profile:", profileResult.error);
    return json(res, 500, {
      error: "Could not load your account profile.",
      code: PROFILE_BOOTSTRAP_FAILED_CODE,
    });
  }

  const savedResult = await supabaseAdmin
    .from("saved_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (savedResult.error && !isMissingOptionalSchemaError(savedResult.error)) {
    console.warn("[Profile API] Saved items load failed:", savedResult.error.message);
  }

  return json(res, 200, {
    profile: profileResult.data,
    savedItems: savedResult.error ? [] : (savedResult.data || []),
    created: ensured.created === true,
  });
}
