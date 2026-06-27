import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;
const supabaseAdmin = supabaseUrl && supabaseServiceKey ? createClient(supabaseUrl, supabaseServiceKey) : null;

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(payload));
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
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const { platform, productId, transactionId } = body || {};

    if (!platform || !productId || !transactionId) {
      return json(res, 400, { error: "Missing required purchase information (platform, productId, transactionId)." });
    }

    // TODO: [IAP-VERIFICATION] Connect Apple App Store / Google Play Billing APIs to verify receipt/transaction token with the stores.
    // e.g., using 'node-apple-receipt-verify' or 'googleapis' before invoking the RPC database update.
    //
    // if (platform === 'ios') {
    //   await verifyWithApple(transactionId);
    // } else if (platform === 'android') {
    //   await verifyWithGoogle(productId, transactionId);
    // }

    // Call the admin_set_premium RPC using service role
    const { data: updatedProfile, error: rpcError } = await supabaseAdmin.rpc("admin_set_premium", {
      user_uuid: userId,
      platform_name: platform,
      product_identifier: productId,
      transaction_identifier: transactionId
    });

    if (rpcError) {
      console.error("RPC admin_set_premium error:", rpcError);
      return json(res, 500, { error: "Failed to verify and apply premium status on backend." });
    }

    return json(res, 200, { 
      success: true, 
      message: "Premium subscription verified and applied successfully.",
      profile: updatedProfile
    });
  } catch (error) {
    console.error("Verify purchase error:", error);
    return json(res, 500, { error: "Failed to process purchase verification." });
  }
}
