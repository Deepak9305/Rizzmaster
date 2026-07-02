import { supabase, supabaseAdmin } from "./_supabase.js";
import { applyCors } from "./_cors.js";

const LOGIN_REQUIRED_CODE = "LOGIN_REQUIRED";
const SUPABASE_BACKEND_UNAVAILABLE_CODE = "SUPABASE_BACKEND_UNAVAILABLE";

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(payload));
};

const getBearerToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice("Bearer ".length).trim();
  return token || null;
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
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
    console.error("[Revoke Premium API] Token verification request failed:", error);
    return json(res, 503, {
      error: "Token verification failed because the auth backend could not be reached.",
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
    });
  }

  try {
    const { data: updatedProfile, error: revokeError } = await supabaseAdmin.rpc("admin_revoke_premium", {
      user_uuid: user.id,
    });

    if (revokeError) {
      console.error("[Revoke Premium API] Failed to revoke premium:", revokeError);
      return json(res, 500, {
        error: "Failed to revoke premium status on backend.",
        code: "PREMIUM_REVOKE_FAILED",
      });
    }

    return json(res, 200, {
      success: true,
      profile: updatedProfile,
    });
  } catch (error) {
    console.error("[Revoke Premium API] Unexpected failure:", error);
    return json(res, 500, {
      error: "Failed to revoke premium status.",
      code: "PREMIUM_REVOKE_FAILED",
    });
  }
}
