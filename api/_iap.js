import crypto from "node:crypto";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_ANDROID_PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const GOOGLE_PLAY_API_BASE = "https://androidpublisher.googleapis.com/androidpublisher/v3";
const APPLE_PRODUCTION_API_BASE = "https://api.storekit.itunes.apple.com";
const APPLE_SANDBOX_API_BASE = "https://api.storekit-sandbox.itunes.apple.com";
const DEFAULT_APP_ID = "app.vercel.rizzmaster";

export class PurchaseVerificationError extends Error {
  constructor(message, code, statusCode = 400) {
    super(message);
    this.name = "PurchaseVerificationError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
};

const normalizeMultilineSecret = (value) => value.replace(/\\n/g, "\n").trim();

const base64UrlEncode = (value) => {
  const input = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
  return input
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
};

const base64UrlDecode = (value) => {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, "base64");
};

const parseJsonResponse = async (response) => {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
};

const signRs256Jwt = (header, payload, privateKey) => {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(input), normalizeMultilineSecret(privateKey));
  return `${input}.${base64UrlEncode(signature)}`;
};

const signEs256Jwt = (header, payload, privateKey) => {
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const input = `${encodedHeader}.${encodedPayload}`;
  const signature = crypto.sign("sha256", Buffer.from(input), {
    key: normalizeMultilineSecret(privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${input}.${base64UrlEncode(signature)}`;
};

const decodeJwsPayload = (jws) => {
  const parts = typeof jws === "string" ? jws.split(".") : [];
  if (parts.length !== 3) {
    throw new PurchaseVerificationError(
      "Apple verification returned an invalid signed transaction payload.",
      "PURCHASE_VERIFICATION_BACKEND_ERROR",
      502
    );
  }

  try {
    return JSON.parse(base64UrlDecode(parts[1]).toString("utf8"));
  } catch {
    throw new PurchaseVerificationError(
      "Apple verification returned an unreadable signed transaction payload.",
      "PURCHASE_VERIFICATION_BACKEND_ERROR",
      502
    );
  }
};

const coerceIsoTimestamp = (value) => {
  if (value == null || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    if (/^\d+$/.test(trimmed)) {
      return new Date(Number(trimmed)).toISOString();
    }

    const date = new Date(trimmed);
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString();
    }
  }

  return null;
};

const assertFutureExpiry = (expiresAt) => {
  if (!expiresAt) {
    throw new PurchaseVerificationError(
      "The verified purchase did not include an expiration date.",
      "PURCHASE_VERIFICATION_FAILED",
      400
    );
  }

  if (new Date(expiresAt).getTime() <= Date.now()) {
    throw new PurchaseVerificationError(
      "The verified subscription is expired.",
      "PURCHASE_VERIFICATION_FAILED",
      400
    );
  }
};

const getGooglePlayConfig = () => {
  const rawServiceAccountJson = readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  let clientEmail = "";
  let privateKey = "";

  if (rawServiceAccountJson) {
    try {
      const parsed = JSON.parse(rawServiceAccountJson);
      clientEmail = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
      privateKey = typeof parsed.private_key === "string" ? parsed.private_key.trim() : "";
    } catch {
      throw new PurchaseVerificationError(
        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON.",
        "PURCHASE_VERIFICATION_UNAVAILABLE",
        503
      );
    }
  } else {
    clientEmail = readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PLAY_CLIENT_EMAIL");
    privateKey = readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY", "GOOGLE_PLAY_PRIVATE_KEY");
  }

  const packageName = readEnv("GOOGLE_PLAY_PACKAGE_NAME", "ANDROID_PACKAGE_NAME") || DEFAULT_APP_ID;

  if (!clientEmail || !privateKey || !packageName) {
    throw new PurchaseVerificationError(
      "Google Play purchase verification is not configured on the server.",
      "PURCHASE_VERIFICATION_UNAVAILABLE",
      503
    );
  }

  return {
    clientEmail,
    privateKey,
    packageName,
  };
};

const getAppleConfig = () => {
  const issuerId = readEnv("APPLE_APP_STORE_ISSUER_ID", "APPLE_ISSUER_ID");
  const keyId = readEnv("APPLE_APP_STORE_KEY_ID", "APPLE_KEY_ID");
  const privateKey = readEnv("APPLE_APP_STORE_PRIVATE_KEY", "APPLE_PRIVATE_KEY");
  const bundleId = readEnv("APPLE_APP_BUNDLE_ID", "IOS_BUNDLE_ID") || DEFAULT_APP_ID;
  const preferredEnvironment = readEnv("APPLE_APP_STORE_ENV", "APPLE_ENV").toLowerCase();

  if (!issuerId || !keyId || !privateKey || !bundleId) {
    throw new PurchaseVerificationError(
      "Apple purchase verification is not configured on the server.",
      "PURCHASE_VERIFICATION_UNAVAILABLE",
      503
    );
  }

  return {
    issuerId,
    keyId,
    privateKey,
    bundleId,
    preferredEnvironment,
  };
};

const fetchGoogleAccessToken = async () => {
  const { clientEmail, privateKey } = getGooglePlayConfig();
  const issuedAt = Math.floor(Date.now() / 1000);
  const jwt = signRs256Jwt(
    { alg: "RS256", typ: "JWT" },
    {
      iss: clientEmail,
      scope: GOOGLE_ANDROID_PUBLISHER_SCOPE,
      aud: GOOGLE_TOKEN_URL,
      iat: issuedAt,
      exp: issuedAt + 3600,
    },
    privateKey
  );

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  const payload = await parseJsonResponse(response);
  if (!response.ok || !payload?.access_token) {
    throw new PurchaseVerificationError(
      `Google Play auth failed${payload?.error ? `: ${payload.error}` : "."}`,
      "PURCHASE_VERIFICATION_BACKEND_ERROR",
      response.status === 400 || response.status === 401 ? 503 : 502
    );
  }

  return payload.access_token;
};

const readGoogleBasePlanId = (lineItem) => {
  if (!lineItem || typeof lineItem !== "object") return "";
  const direct = typeof lineItem.basePlanId === "string" ? lineItem.basePlanId.trim() : "";
  if (direct) return direct;
  const nested = typeof lineItem.offerDetails?.basePlanId === "string"
    ? lineItem.offerDetails.basePlanId.trim()
    : "";
  return nested;
};

const verifyGooglePlayPurchase = async ({ productId, basePlanId, purchaseToken }) => {
  const { packageName } = getGooglePlayConfig();
  const accessToken = await fetchGoogleAccessToken();

  const response = await fetch(
    `${GOOGLE_PLAY_API_BASE}/applications/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    }
  );

  const payload = await parseJsonResponse(response);

  if (response.status === 404) {
    throw new PurchaseVerificationError(
      "Google Play did not recognize this purchase token.",
      "PURCHASE_VERIFICATION_FAILED",
      400
    );
  }

  if (!response.ok || !payload) {
    throw new PurchaseVerificationError(
      "Google Play verification request failed.",
      response.status === 401 || response.status === 403
        ? "PURCHASE_VERIFICATION_UNAVAILABLE"
        : "PURCHASE_VERIFICATION_BACKEND_ERROR",
      response.status === 401 || response.status === 403 ? 503 : 502
    );
  }

  const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : [];
  const matchingLineItem = lineItems.find((item) => {
    const itemProductId = typeof item?.productId === "string" ? item.productId.trim() : "";
    if (itemProductId !== productId) return false;
    if (!basePlanId) return true;
    return readGoogleBasePlanId(item) === basePlanId;
  });

  if (!matchingLineItem) {
    throw new PurchaseVerificationError(
      "Google Play verified a different subscription than the one requested.",
      "PURCHASE_VERIFICATION_FAILED",
      400
    );
  }

  const expiresAt = coerceIsoTimestamp(matchingLineItem.expiryTime);
  assertFutureExpiry(expiresAt);

  const state = typeof payload.subscriptionState === "string" ? payload.subscriptionState : "";
  const blockedStates = new Set([
    "SUBSCRIPTION_STATE_EXPIRED",
    "SUBSCRIPTION_STATE_REVOKED",
    "SUBSCRIPTION_STATE_ON_HOLD",
    "SUBSCRIPTION_STATE_PAUSED",
  ]);

  if (blockedStates.has(state)) {
    throw new PurchaseVerificationError(
      `Google Play reported the subscription state as ${state}.`,
      "PURCHASE_VERIFICATION_FAILED",
      400
    );
  }

  return {
    expiresAt,
    orderId: typeof payload.latestOrderId === "string" ? payload.latestOrderId.trim() : null,
    verificationPayload: payload,
    verificationProvider: "google_play",
  };
};

const fetchAppleTransaction = async (baseUrl, token, transactionId) => {
  const response = await fetch(
    `${baseUrl}/inApps/v1/transactions/${encodeURIComponent(transactionId)}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    }
  );

  return {
    response,
    payload: await parseJsonResponse(response),
  };
};

const verifyApplePurchase = async ({ transactionId, productId, rawReceipt }) => {
  const { issuerId, keyId, privateKey, bundleId, preferredEnvironment } = getAppleConfig();
  const issuedAt = Math.floor(Date.now() / 1000);
  const token = signEs256Jwt(
    { alg: "ES256", kid: keyId, typ: "JWT" },
    {
      iss: issuerId,
      iat: issuedAt,
      exp: issuedAt + 3600,
      aud: "appstoreconnect-v1",
      bid: bundleId,
    },
    privateKey
  );

  const hintedEnvironment = typeof rawReceipt?.environment === "string"
    ? rawReceipt.environment.toLowerCase()
    : "";
  const environments = [];

  if (preferredEnvironment === "sandbox" || hintedEnvironment === "sandbox") {
    environments.push({ baseUrl: APPLE_SANDBOX_API_BASE, name: "sandbox" });
    environments.push({ baseUrl: APPLE_PRODUCTION_API_BASE, name: "production" });
  } else {
    environments.push({ baseUrl: APPLE_PRODUCTION_API_BASE, name: "production" });
    environments.push({ baseUrl: APPLE_SANDBOX_API_BASE, name: "sandbox" });
  }

  let lastFailure = null;

  for (const environment of environments) {
    const { response, payload } = await fetchAppleTransaction(environment.baseUrl, token, transactionId);

    if (response.status === 404) {
      lastFailure = new PurchaseVerificationError(
        `Apple did not find transaction ${transactionId} in the ${environment.name} environment.`,
        "PURCHASE_VERIFICATION_FAILED",
        400
      );
      continue;
    }

    if (!response.ok || !payload?.signedTransactionInfo) {
      throw new PurchaseVerificationError(
        "Apple verification request failed.",
        response.status === 401 || response.status === 403
          ? "PURCHASE_VERIFICATION_UNAVAILABLE"
          : "PURCHASE_VERIFICATION_BACKEND_ERROR",
        response.status === 401 || response.status === 403 ? 503 : 502
      );
    }

    const signedTransaction = decodeJwsPayload(payload.signedTransactionInfo);
    const verifiedBundleId = typeof signedTransaction.bundleId === "string"
      ? signedTransaction.bundleId.trim()
      : "";
    const verifiedProductId = typeof signedTransaction.productId === "string"
      ? signedTransaction.productId.trim()
      : "";

    if (verifiedBundleId !== bundleId) {
      throw new PurchaseVerificationError(
        "Apple verified a transaction for a different app bundle.",
        "PURCHASE_VERIFICATION_FAILED",
        400
      );
    }

    if (verifiedProductId !== productId) {
      throw new PurchaseVerificationError(
        "Apple verified a different subscription than the one requested.",
        "PURCHASE_VERIFICATION_FAILED",
        400
      );
    }

    if (signedTransaction.revocationDate) {
      throw new PurchaseVerificationError(
        "Apple reported this subscription purchase as revoked.",
        "PURCHASE_VERIFICATION_FAILED",
        400
      );
    }

    const expiresAt = coerceIsoTimestamp(signedTransaction.expiresDate);
    assertFutureExpiry(expiresAt);

    return {
      expiresAt,
      orderId: typeof signedTransaction.originalTransactionId === "string"
        ? signedTransaction.originalTransactionId.trim()
        : null,
      verificationPayload: {
        environment: environment.name,
        transaction: signedTransaction,
      },
      verificationProvider: "app_store_server_api",
    };
  }

  throw lastFailure || new PurchaseVerificationError(
    "Apple did not recognize this purchase transaction.",
    "PURCHASE_VERIFICATION_FAILED",
    400
  );
};

export const verifyStorePurchase = async ({
  platform,
  productId,
  basePlanId,
  purchaseToken,
  transactionId,
  rawReceipt,
}) => {
  if (platform === "android") {
    return verifyGooglePlayPurchase({ productId, basePlanId, purchaseToken });
  }

  if (platform === "ios") {
    return verifyApplePurchase({ transactionId, productId, rawReceipt });
  }

  throw new PurchaseVerificationError(
    "Unsupported purchase platform.",
    "INVALID_PURCHASE_PLATFORM",
    400
  );
};
