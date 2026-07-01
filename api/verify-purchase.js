import { supabase, supabaseAdmin } from './_supabase.js';
import { ensureUserProfile } from './_profiles.js';
import { PurchaseVerificationError, verifyStorePurchase } from './_iap.js';

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(payload));
};

const SUPPORTED_PLATFORMS = new Set(["android", "ios"]);
const LOGIN_REQUIRED_CODE = "LOGIN_REQUIRED";
const SUPABASE_BACKEND_UNAVAILABLE_CODE = "SUPABASE_BACKEND_UNAVAILABLE";
const PROFILE_BOOTSTRAP_FAILED_CODE = "PROFILE_BOOTSTRAP_FAILED";
const PURCHASE_VERIFICATION_FAILED_CODE = "PURCHASE_VERIFICATION_FAILED";
const PURCHASE_VERIFICATION_UNAVAILABLE_CODE = "PURCHASE_VERIFICATION_UNAVAILABLE";
const PURCHASE_VERIFICATION_BACKEND_ERROR_CODE = "PURCHASE_VERIFICATION_BACKEND_ERROR";

const readString = (value) => {
  if (typeof value === "string") {
    return value.trim();
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  return "";
};

const readNullableString = (value) => {
  const normalized = readString(value);
  return normalized || null;
};

const normalizeOptionalTimestamp = (value) => {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const date = typeof value === "number" || typeof value === "string"
    ? new Date(value)
    : null;

  if (!date || Number.isNaN(date.getTime())) {
    throw new Error("Invalid expiration timestamp.");
  }

  return date.toISOString();
};

const parseJsonBody = (body) => {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON body.");
    }
  }

  if (!body || typeof body !== "object") {
    throw new Error("Invalid request body.");
  }

  return body;
};

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  // 1. Authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json(res, 401, {
      error: "Missing or invalid authorization header.",
      code: LOGIN_REQUIRED_CODE
    });
  }
  const token = authHeader.split(" ")[1];

  if (!supabase || !supabaseAdmin) {
    return json(res, 503, {
      error: "Supabase integration not configured on the server.",
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE
    });
  }

  let user;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) {
      return json(res, 401, {
        error: "Unauthorized. Invalid token.",
        code: LOGIN_REQUIRED_CODE
      });
    }
    user = data.user;
  } catch (err) {
    console.error("[IAP API] Token verification request failed:", err);
    return json(res, 503, {
      error: "Token verification failed because the auth backend could not be reached.",
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE
    });
  }

  const userId = user.id;

  try {
    const { error: profileError } = await ensureUserProfile(supabaseAdmin, user);
    if (profileError) {
      console.error("[IAP API] Failed to prepare profile before premium sync:", profileError);
      return json(res, 500, {
        error: "Could not prepare your profile for premium verification.",
        code: PROFILE_BOOTSTRAP_FAILED_CODE
      });
    }

    const body = parseJsonBody(req.body);
    const normalizedPlatform = readString(body.platform).toLowerCase();
    const productId = readString(body.productId);
    const transactionId = readString(body.transactionId);
    const orderId = readNullableString(body.orderId);
    const plan = readNullableString(body.plan);
    const basePlanId = readNullableString(body.basePlanId);
    const purchaseToken = readNullableString(body.purchaseToken);
    const rawReceipt = body.rawReceipt && typeof body.rawReceipt === "object" ? body.rawReceipt : {};
    const expiresAt = normalizeOptionalTimestamp(body.expiresAt);

    if (!normalizedPlatform || !productId || !transactionId) {
      console.warn("[IAP API] Missing basic purchase data.");
      return json(res, 400, { 
        error: "Missing required purchase information (platform, productId, transactionId).",
        code: "INVALID_PURCHASE_DATA"
      });
    }

    if (!SUPPORTED_PLATFORMS.has(normalizedPlatform)) {
      return json(res, 400, {
        error: "Unsupported purchase platform.",
        code: "INVALID_PURCHASE_PLATFORM"
      });
    }

    if (normalizedPlatform === 'android' && !purchaseToken) {
      console.warn("[IAP API] Missing Android-specific purchase data.");
      return json(res, 400, {
        error: "Missing Android purchase info (purchaseToken).",
        code: "INVALID_PURCHASE_DATA"
      });
    }

    const allowUnverified = process.env.ALLOW_UNVERIFIED_IAP === 'true';
    let verificationResult;

    try {
      verificationResult = await verifyStorePurchase({
        platform: normalizedPlatform,
        productId,
        basePlanId,
        purchaseToken,
        transactionId,
        rawReceipt,
      });
    } catch (error) {
      if (!allowUnverified) {
        if (error instanceof PurchaseVerificationError) {
          return json(res, error.statusCode, {
            error: error.message,
            code: error.code,
          });
        }

        console.error("[IAP API] Unexpected purchase verification error:", error);
        return json(res, 502, {
          error: "Purchase verification failed because the store backend could not be reached.",
          code: PURCHASE_VERIFICATION_BACKEND_ERROR_CODE,
        });
      }

      console.warn("[IAP API] ALLOW_UNVERIFIED_IAP override enabled. Granting premium without store proof.", error);
      verificationResult = {
        expiresAt: expiresAt || null,
        orderId,
        verificationPayload: {
          mode: "unverified_override",
          reason: error instanceof Error ? error.message : "Unknown verification failure",
        },
        verificationProvider: "unverified_override",
      };
    }

    const verifiedExpiresAt = verificationResult?.expiresAt || expiresAt || null;
    const verifiedOrderId = verificationResult?.orderId || orderId || null;
    const verifiedBasePlanId = verificationResult?.verifiedBasePlanId || basePlanId || null;

    // Call the admin_set_premium RPC using service role
    const { data: updatedProfile, error: rpcError } = await supabaseAdmin.rpc("admin_set_premium", {
      user_uuid: userId,
      platform_name: normalizedPlatform,
      product_identifier: productId,
      transaction_identifier: transactionId,
      base_plan_identifier: verifiedBasePlanId,
      purchase_token_identifier: purchaseToken,
      expires_at: verifiedExpiresAt,
      raw_payload: {
        orderId: verifiedOrderId,
        plan,
        client_base_plan_id: basePlanId,
        receipt: rawReceipt,
        verification_provider: verificationResult?.verificationProvider || null,
        verification: verificationResult?.verificationPayload || null,
      }
    });

    if (rpcError) {
      console.error("[IAP API] RPC admin_set_premium error:", rpcError);
      return json(res, 500, { 
        error: "Failed to verify and apply premium status on backend.",
        code: "PREMIUM_SYNC_FAILED"
      });
    }

    return json(res, 200, { 
      success: true, 
      message: "Premium subscription verified and applied successfully.",
      profile: updatedProfile
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message === "Invalid JSON body." ||
        error.message === "Invalid request body." ||
        error.message === "Invalid expiration timestamp."
      )
    ) {
      return json(res, 400, {
        error: error.message,
        code: "INVALID_PURCHASE_DATA"
      });
    }
    if (error instanceof PurchaseVerificationError) {
      return json(res, error.statusCode, {
        error: error.message,
        code: error.code,
      });
    }
    console.error("Verify purchase error:", error);
    return json(res, 500, { error: "Failed to process purchase verification." });
  }
}
