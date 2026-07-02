import { supabase, supabaseAdmin } from './_supabase.js';
import { applyCors } from './_cors.js';

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
    console.error("[Delete Account API] Token verification request failed:", error);
    return json(res, 503, {
      error: "Token verification failed because the auth backend could not be reached.",
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
    });
  }

  try {
    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id, true);
    if (authDeleteError) {
      console.error("[Delete Account API] Failed to delete auth user:", authDeleteError);
      return json(res, 500, { error: "Failed to delete auth user." });
    }

    const { error: profileDeleteError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", user.id);

    if (profileDeleteError) {
      console.error("[Delete Account API] Profile cleanup failed after auth soft delete:", profileDeleteError);
      return json(res, 200, {
        success: true,
        cleanupWarning: "Account access was removed, but profile cleanup needs retry.",
      });
    }

    return json(res, 200, { success: true });
  } catch (error) {
    console.error("[Delete Account API] Unexpected failure:", error);
    return json(res, 500, { error: "Failed to delete account." });
  }
}
