import { supabase, supabaseAdmin } from './_supabase.js';
import { ensureUserProfile } from './_profiles.js';
import { getGooglePlayDiagnostics, PurchaseVerificationError, verifyStorePurchase } from './_iap.js';
import { applyCors } from './_cors.js';

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
const PURCHASE_ACCOUNT_MISMATCH_CODE = "PURCHASE_ACCOUNT_MISMATCH";

const getRequestId = (req) => {
  const value = req?.headers?.["x-vercel-id"];
  return typeof value === "string" && value.trim() ? value.trim() : null;
};

const logIapApi = (level, message, metadata = {}) => {
  const entry = {
    level,
    scope: "iap-api",
    route: "/api/verify-purchase",
    message,
    ...metadata,
  };
  const serialized = JSON.stringify(entry);

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.info(serialized);
};

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

const buildSafeVerificationLog = ({ platform, productId, basePlanId }) => ({
  platform,
  productId,
  basePlanId: basePlanId || null,
  ...(platform === "android" ? getGooglePlayDiagnostics() : {}),
});

const toSafeErrorLog = (error) => ({
  verificationErrorCode: error?.code || "UNKNOWN_VERIFICATION_ERROR",
  verificationStatusCode: error?.statusCode || 500,
  safeErrorMessage: error instanceof Error && error.message ? error.message : "Unknown verification error.",
});

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  const requestId = getRequestId(req);
  const startedAt = Date.now();

  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  // 1. Authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    logIapApi("warn", "Missing authorization header.", { requestId });
    return json(res, 401, {
      error: "Missing or invalid authorization header.",
      code: LOGIN_REQUIRED_CODE
    });
  }
  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    logIapApi("warn", "Empty bearer token.", { requestId });
    return json(res, 401, {
      error: "Empty authorization token.",
      code: LOGIN_REQUIRED_CODE
    });
  }

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
      logIapApi("warn", "Invalid Supabase token.", {
        requestId,
        message: error?.message || null,
      });
      return json(res, 401, {
        error: "Unauthorized. Invalid token.",
        code: LOGIN_REQUIRED_CODE
      });
    }
    user = data.user;
  } catch (err) {
    logIapApi("error", "Token verification request failed.", {
      requestId,
      safeErrorMessage: err instanceof Error ? err.message : "Unknown auth backend error.",
    });
    return json(res, 503, {
      error: "Token verification failed because the auth backend could not be reached.",
      code: SUPABASE_BACKEND_UNAVAILABLE_CODE
    });
  }

  const userId = user.id;

  try {
    const { error: profileError } = await ensureUserProfile(supabaseAdmin, user);
    if (profileError) {
      logIapApi("error", "Failed to prepare profile before premium sync.", {
        requestId,
        userId,
        safeErrorMessage: profileError.message || "Unknown profile bootstrap error.",
      });
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
    const intent = readString(body.intent) === "restore" ? "restore" : "purchase";
    const ownerUserId = readNullableString(body.ownerUserId);
    const basePlanId = readNullableString(body.basePlanId);
    const purchaseToken = readNullableString(body.purchaseToken);
    const rawReceipt = body.rawReceipt && typeof body.rawReceipt === "object" ? body.rawReceipt : {};
    const expiresAt = normalizeOptionalTimestamp(body.expiresAt);

    if (!normalizedPlatform || !productId || !transactionId) {
      logIapApi("warn", "Missing basic purchase data.", { requestId, userId });
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

    if (ownerUserId && ownerUserId !== userId) {
      logIapApi("warn", "Purchase owner mismatch blocked.", {
        requestId,
        authenticatedUserId: userId,
        clientOwnerUserId: ownerUserId,
        platform: normalizedPlatform,
        productId,
        intent,
      });

      return json(res, 409, {
        error: "This purchase was started for a different Rizzmaster account. Please sign out, sign back in, and retry from the correct account.",
        code: PURCHASE_ACCOUNT_MISMATCH_CODE,
      });
    }

    if (normalizedPlatform === 'android' && !purchaseToken) {
      logIapApi("warn", "Missing Android-specific purchase data.", {
        requestId,
        userId,
        platform: normalizedPlatform,
        productId,
      });
      return json(res, 400, {
        error: "Missing Android purchase info (purchaseToken).",
        code: "INVALID_PURCHASE_DATA"
      });
    }

    logIapApi("info", "Verifying purchase.", {
      requestId,
      userId,
      intent,
      plan,
      hasPurchaseToken: Boolean(purchaseToken),
      hasTransactionId: Boolean(transactionId),
      hasOrderId: Boolean(orderId),
      ...buildSafeVerificationLog({
        platform: normalizedPlatform,
        productId,
        basePlanId,
      }),
    });

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
        appUserId: userId,
      });
      logIapApi("info", "verifyStorePurchase succeeded.", {
        requestId,
        userId,
        ...buildSafeVerificationLog({
          platform: normalizedPlatform,
          productId,
          basePlanId,
        }),
        durationMs: Date.now() - startedAt,
      });
    } catch (error) {
      logIapApi("error", "verifyStorePurchase failed.", {
        requestId,
        userId,
        ...buildSafeVerificationLog({
          platform: normalizedPlatform,
          productId,
          basePlanId,
        }),
        ...toSafeErrorLog(error),
        durationMs: Date.now() - startedAt,
      });
      if (!allowUnverified) {
        if (error instanceof PurchaseVerificationError) {
          return json(res, error.statusCode, {
            error: error.message,
            code: error.code,
          });
        }

        logIapApi("error", "Unexpected purchase verification error.", {
          requestId,
          userId,
          safeErrorMessage: error instanceof Error ? error.message : "Unknown purchase verification error.",
          durationMs: Date.now() - startedAt,
        });
        return json(res, 502, {
          error: "Purchase verification failed because the store backend could not be reached.",
          code: PURCHASE_VERIFICATION_BACKEND_ERROR_CODE,
        });
      }

      logIapApi("warn", "ALLOW_UNVERIFIED_IAP override enabled. Granting premium without store proof.", {
        requestId,
        userId,
        safeErrorMessage: error instanceof Error ? error.message : "Unknown verification failure",
      });
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
      p_user_uuid: userId,
      p_platform_name: normalizedPlatform,
      p_product_identifier: productId,
      p_transaction_identifier: transactionId,
      p_base_plan_identifier: verifiedBasePlanId,
      p_purchase_token_identifier: purchaseToken,
      p_expires_at: verifiedExpiresAt,
      p_raw_payload: {
        orderId: verifiedOrderId,
        plan,
        intent,
        client_owner_user_id: ownerUserId,
        client_base_plan_id: basePlanId,
        receipt: rawReceipt,
        verification_provider: verificationResult?.verificationProvider || null,
        verification: verificationResult?.verificationPayload || null,
      }
    });

    if (rpcError) {
      logIapApi("error", "RPC admin_set_premium error.", {
        requestId,
        userId,
        platform: normalizedPlatform,
        productId,
        basePlanId: verifiedBasePlanId,
        safeErrorMessage: rpcError.message || "Unknown premium sync error.",
        durationMs: Date.now() - startedAt,
      });
      return json(res, 500, { 
        error: "Failed to verify and apply premium status on backend.",
        code: "PREMIUM_SYNC_FAILED"
      });
    }

    logIapApi("info", "Premium verification applied successfully.", {
      requestId,
      userId,
      platform: normalizedPlatform,
      productId,
      basePlanId: verifiedBasePlanId,
      durationMs: Date.now() - startedAt,
    });
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
    logIapApi("error", "Verify purchase request failed.", {
      requestId,
      safeErrorMessage: error instanceof Error ? error.message : "Unknown verify purchase error.",
      durationMs: Date.now() - startedAt,
    });
    return json(res, 500, { error: "Failed to process purchase verification." });
  }
}
