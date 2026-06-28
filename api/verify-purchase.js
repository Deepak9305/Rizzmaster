import { supabase, supabaseAdmin } from './_supabase.js';

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(payload));
};

const SUPPORTED_PLATFORMS = new Set(["android", "ios"]);

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
    return json(res, 401, { error: "Missing or invalid authorization header." });
  }
  const token = authHeader.split(" ")[1];

  if (!supabase || !supabaseAdmin) {
    return json(res, 500, { error: "Supabase integration not configured on the server." });
  }

  let user;
  try {
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data || !data.user) {
      return json(res, 401, { error: "Unauthorized. Invalid token." });
    }
    user = data.user;
  } catch (err) {
    return json(res, 401, { error: "Unauthorized. Token verification failed." });
  }

  const userId = user.id;

  try {
    const body = parseJsonBody(req.body);
    const normalizedPlatform =
      typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "";
    const { productId, transactionId, orderId, plan, basePlanId, purchaseToken, rawReceipt, expiresAt } = body || {};

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
    let isValid = false;

    // TODO: [IAP-VERIFICATION] Implement real Apple/Google verification here.
    // If real verification is implemented, it should set isValid = true if successful.
    if (normalizedPlatform === 'ios') {
      // isValid = await verifyWithApple(transactionId, purchaseToken);
    } else if (normalizedPlatform === 'android') {
      // isValid = await verifyWithGoogle(productId, transactionId, purchaseToken);
    }

    if (!isValid && !allowUnverified) {
      console.error("[IAP API] Real verification not implemented and ALLOW_UNVERIFIED_IAP is false.");
      return json(res, 501, {
        error: "Purchase verification failed. Cannot grant premium unverified.",
        code: "PURCHASE_VERIFICATION_FAILED"
      });
    }

    // Call the admin_set_premium RPC using service role
    const { data: updatedProfile, error: rpcError } = await supabaseAdmin.rpc("admin_set_premium", {
      user_uuid: userId,
      platform_name: normalizedPlatform,
      product_identifier: productId,
      transaction_identifier: transactionId,
      base_plan_identifier: basePlanId || null,
      purchase_token_identifier: purchaseToken || null,
      expires_at: expiresAt || null,
      raw_payload: {
        orderId: orderId || null,
        plan: plan || null,
        receipt: rawReceipt || {}
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
    if (error instanceof Error && (error.message === "Invalid JSON body." || error.message === "Invalid request body.")) {
      return json(res, 400, { error: error.message });
    }
    console.error("Verify purchase error:", error);
    return json(res, 500, { error: "Failed to process purchase verification." });
  }
}
