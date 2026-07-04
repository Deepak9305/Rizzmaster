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

const deleteUserOwnedRows = async (table, column, userId) => {
  const { error } = await supabaseAdmin
    .from(table)
    .delete()
    .eq(column, userId);

  if (error) {
    throw error;
  }
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
    await deleteUserOwnedRows('saved_items', 'user_id', user.id);
    await deleteUserOwnedRows('user_activity_log', 'user_id', user.id);
    await deleteUserOwnedRows('reports', 'user_id', user.id);
    await deleteUserOwnedRows('purchase_receipts', 'user_id', user.id);
    await deleteUserOwnedRows('premium_subscriptions', 'user_id', user.id);
    await deleteUserOwnedRows('profiles', 'id', user.id);

    const { error: authDeleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id, true);
    if (authDeleteError) {
      console.error("[Delete Account API] Failed to delete auth user:", authDeleteError);
      return json(res, 500, { error: "Failed to delete auth user." });
    }

    return json(res, 200, { success: true });
  } catch (error) {
    console.error("[Delete Account API] Unexpected failure:", error);
    return json(res, 500, { error: "Failed to delete account." });
  }
}
