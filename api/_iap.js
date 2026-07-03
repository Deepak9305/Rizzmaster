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

const logIap = (level, message, metadata = {}) => {
  const entry = {
    level,
    scope: "iap",
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

const toSafeErrorMessage = (error) => {
  if (error instanceof Error && typeof error.message === "string" && error.message.trim()) {
    return error.message.trim();
  }
  return "Unknown verification error.";
};

const toSafeStack = (error) => {
  if (!(error instanceof Error) || typeof error.stack !== "string") {
    return null;
  }

  return error.stack
    .split("\n")
    .slice(0, 5)
    .join("\n");
};

const getGoogleApiErrorDetails = (payload) => {
  const nestedError = payload?.error && typeof payload.error === "object" ? payload.error : null;
  const topLevelError = typeof payload?.error === "string" ? payload.error : null;
  const safeMessage = typeof nestedError?.message === "string"
    ? nestedError.message.trim()
    : typeof payload?.error_description === "string"
      ? payload.error_description.trim()
      : null;
  const safeStatus = typeof nestedError?.status === "string" ? nestedError.status.trim() : null;
  const safeCode = Number.isFinite(nestedError?.code) ? nestedError.code : null;

  return {
    googleApiError: topLevelError,
    googleApiErrorCode: safeCode,
    googleApiErrorStatus: safeStatus,
    googleApiErrorMessage: safeMessage,
  };
};

const buildGooglePlayDiagnostics = ({
  hasGooglePlayServiceAccountJson,
  hasGooglePlayClientEmail,
  hasGooglePlayPrivateKey,
  googlePlayPackageName,
}) => ({
  hasGooglePlayServiceAccountJson,
  hasGooglePlayClientEmail,
  hasGooglePlayPrivateKey,
  googlePlayPackageName,
});

export const getGooglePlayDiagnostics = () => {
  const rawServiceAccountJson = readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  const fallbackClientEmail = readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PLAY_CLIENT_EMAIL");
  const fallbackPrivateKey = readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY", "GOOGLE_PLAY_PRIVATE_KEY");
  const packageName = readEnv("GOOGLE_PLAY_PACKAGE_NAME", "ANDROID_PACKAGE_NAME") || DEFAULT_APP_ID;

  if (!rawServiceAccountJson) {
    return buildGooglePlayDiagnostics({
      hasGooglePlayServiceAccountJson: false,
      hasGooglePlayClientEmail: Boolean(fallbackClientEmail),
      hasGooglePlayPrivateKey: Boolean(fallbackPrivateKey),
      googlePlayPackageName: packageName,
    });
  }

  try {
    const parsed = JSON.parse(rawServiceAccountJson);
    const parsedClientEmail = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
    const parsedPrivateKey = typeof parsed.private_key === "string" ? parsed.private_key.trim() : "";

    return buildGooglePlayDiagnostics({
      hasGooglePlayServiceAccountJson: true,
      hasGooglePlayClientEmail: Boolean(parsedClientEmail || fallbackClientEmail),
      hasGooglePlayPrivateKey: Boolean(parsedPrivateKey || fallbackPrivateKey),
      googlePlayPackageName: packageName,
    });
  } catch {
    return buildGooglePlayDiagnostics({
      hasGooglePlayServiceAccountJson: true,
      hasGooglePlayClientEmail: false,
      hasGooglePlayPrivateKey: false,
      googlePlayPackageName: packageName,
    });
  }
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

const googlePlayAccountIdsForUser = (userId) => {
  if (typeof userId !== "string" || !userId.trim()) return new Set();

  const raw = userId.trim().toLowerCase();
  const md5 = crypto.createHash("md5").update(userId.trim()).digest("hex").toLowerCase();

  return new Set([raw, md5]);
};

const readGoogleExternalAccountId = (payload) => {
  const value = payload?.externalAccountIdentifiers?.obfuscatedExternalAccountId;
  return typeof value === "string" ? value.trim() : "";
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
      logIap("error", "Google Play configuration error", {
        ...getGooglePlayDiagnostics(),
        verificationErrorCode: "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_INVALID",
        verificationStatusCode: 503,
        safeErrorMessage: "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON.",
      });
      throw new PurchaseVerificationError(
        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON is not valid JSON.",
        "GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_INVALID",
        503
      );
    }
  } else {
    clientEmail = readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PLAY_CLIENT_EMAIL");
    privateKey = readEnv("GOOGLE_PLAY_SERVICE_ACCOUNT_PRIVATE_KEY", "GOOGLE_PLAY_PRIVATE_KEY");
  }

  const packageName = readEnv("GOOGLE_PLAY_PACKAGE_NAME", "ANDROID_PACKAGE_NAME") || DEFAULT_APP_ID;

  if (!clientEmail || !privateKey || !packageName) {
    logIap("error", "Google Play configuration error", {
      ...getGooglePlayDiagnostics(),
      verificationErrorCode: "GOOGLE_PLAY_CONFIG_MISSING",
      verificationStatusCode: 503,
      safeErrorMessage: "Google Play purchase verification is not configured on the server.",
    });
    throw new PurchaseVerificationError(
      "Google Play purchase verification is not configured on the server.",
      "GOOGLE_PLAY_CONFIG_MISSING",
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
  const diagnostics = getGooglePlayDiagnostics();
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
    const safeErrorMessage = `Google Play auth failed${payload?.error ? `: ${payload.error}` : "."}`;
    logIap("error", "Google Play auth failure", {
      ...diagnostics,
      verificationErrorCode: "GOOGLE_PLAY_AUTH_FAILED",
      verificationStatusCode: response.status === 400 || response.status === 401 ? 503 : 502,
      safeErrorMessage,
      googleAuthHttpStatus: response.status,
      ...getGoogleApiErrorDetails(payload),
    });
    throw new PurchaseVerificationError(
      safeErrorMessage,
      "GOOGLE_PLAY_AUTH_FAILED",
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

const verifyGooglePlayPurchase = async ({ productId, basePlanId, purchaseToken, appUserId }) => {
  const { packageName } = getGooglePlayConfig();
  const diagnostics = getGooglePlayDiagnostics();
  logIap("info", "Google Play verification start", {
    platform: "android",
    productId,
    basePlanId: basePlanId || null,
    ...diagnostics,
  });
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
    logIap("warn", "Google Play verification failure", {
      platform: "android",
      productId,
      basePlanId: basePlanId || null,
      ...diagnostics,
      verificationErrorCode: "GOOGLE_PLAY_TOKEN_NOT_FOUND",
      verificationStatusCode: 400,
      safeErrorMessage: "Google Play did not recognize this purchase token.",
      googleApiHttpStatus: response.status,
      ...getGoogleApiErrorDetails(payload),
    });
    throw new PurchaseVerificationError(
      "Google Play did not recognize this purchase token.",
      "GOOGLE_PLAY_TOKEN_NOT_FOUND",
      400
    );
  }

  if (!response.ok || !payload) {
    const verificationErrorCode = response.status === 403
      ? "GOOGLE_PLAY_PERMISSION_DENIED"
      : response.status === 401
        ? "GOOGLE_PLAY_AUTH_FAILED"
        : "PURCHASE_VERIFICATION_BACKEND_ERROR";
    const verificationStatusCode = response.status === 401 || response.status === 403 ? 503 : 502;
    const safeErrorMessage = response.status === 403
      ? "Google Play verification permission denied."
      : response.status === 401
        ? "Google Play verification authentication failed."
        : "Google Play verification request failed.";
    logIap("error", "Google Play verification request failure", {
      platform: "android",
      productId,
      basePlanId: basePlanId || null,
      ...diagnostics,
      verificationErrorCode,
      verificationStatusCode,
      safeErrorMessage,
      googleApiHttpStatus: response.status,
      ...getGoogleApiErrorDetails(payload),
    });
    throw new PurchaseVerificationError(
      safeErrorMessage,
      verificationErrorCode,
      verificationStatusCode
    );
  }

  const verifiedExternalAccountId = readGoogleExternalAccountId(payload);
  const expectedExternalAccountIds = googlePlayAccountIdsForUser(appUserId);
  const normalizedVerifiedExternalAccountId = verifiedExternalAccountId.toLowerCase();

  if (
    verifiedExternalAccountId &&
    expectedExternalAccountIds.size > 0 &&
    !expectedExternalAccountIds.has(normalizedVerifiedExternalAccountId)
  ) {
    logIap("warn", "Google Play account mismatch", {
      platform: "android",
      productId,
      basePlanId: basePlanId || null,
      ...diagnostics,
      verificationErrorCode: "PURCHASE_ACCOUNT_MISMATCH",
      verificationStatusCode: 409,
      safeErrorMessage: "Google Play verified this purchase for a different Rizzmaster account.",
      googleHasExternalAccountId: true,
    });
    throw new PurchaseVerificationError(
      "Google Play verified this purchase for a different Rizzmaster account.",
      "PURCHASE_ACCOUNT_MISMATCH",
      409
    );
  }

  const lineItems = Array.isArray(payload.lineItems) ? payload.lineItems : [];
  const matchingLineItem = lineItems.find((item) => {
    const itemProductId = typeof item?.productId === "string" ? item.productId.trim() : "";
    return itemProductId === productId;
  });

  if (!matchingLineItem) {
    logIap("warn", "Google Play verification failure", {
      platform: "android",
      productId,
      basePlanId: basePlanId || null,
      ...diagnostics,
      verificationErrorCode: "GOOGLE_PLAY_PRODUCT_MISMATCH",
      verificationStatusCode: 400,
      safeErrorMessage: "Google Play verified a different subscription than the one requested.",
      googleLineItemProductIds: lineItems.map((item) => (
        typeof item?.productId === "string" ? item.productId.trim() : null
      )).filter(Boolean),
    });
    throw new PurchaseVerificationError(
      "Google Play verified a different subscription than the one requested.",
      "GOOGLE_PLAY_PRODUCT_MISMATCH",
      400
    );
  }

  const verifiedBasePlanId = readGoogleBasePlanId(matchingLineItem);

  if (basePlanId && verifiedBasePlanId && basePlanId !== verifiedBasePlanId) {
    logIap("warn", "Client basePlanId mismatch. Using Google verified base plan.", {
      clientBasePlanId: basePlanId,
      verifiedBasePlanId,
      productId,
    });
  }

  const expiresAt = coerceIsoTimestamp(matchingLineItem.expiryTime);
  try {
    assertFutureExpiry(expiresAt);
  } catch (error) {
    logIap("warn", "Google Play verification failure", {
      platform: "android",
      productId,
      basePlanId: basePlanId || null,
      ...diagnostics,
      verificationErrorCode: "GOOGLE_PLAY_EXPIRED",
      verificationStatusCode: 400,
      safeErrorMessage: toSafeErrorMessage(error),
      googleSubscriptionState: typeof payload.subscriptionState === "string" ? payload.subscriptionState : null,
    });
    throw new PurchaseVerificationError(
      "The verified subscription is expired.",
      "GOOGLE_PLAY_EXPIRED",
      400
    );
  }

  const state = typeof payload.subscriptionState === "string" ? payload.subscriptionState : "";
  const blockedStates = new Set([
    "SUBSCRIPTION_STATE_EXPIRED",
    "SUBSCRIPTION_STATE_REVOKED",
    "SUBSCRIPTION_STATE_ON_HOLD",
    "SUBSCRIPTION_STATE_PAUSED",
  ]);

  if (blockedStates.has(state)) {
    logIap("warn", "Google Play verification failure", {
      platform: "android",
      productId,
      basePlanId: basePlanId || null,
      ...diagnostics,
      verificationErrorCode: "GOOGLE_PLAY_EXPIRED",
      verificationStatusCode: 400,
      safeErrorMessage: `Google Play reported the subscription state as ${state}.`,
      googleSubscriptionState: state,
    });
    throw new PurchaseVerificationError(
      `Google Play reported the subscription state as ${state}.`,
      "GOOGLE_PLAY_EXPIRED",
      400
    );
  }

  logIap("info", "Google Play verification success", {
    platform: "android",
    productId,
    basePlanId: verifiedBasePlanId || basePlanId || null,
    ...diagnostics,
    googleSubscriptionState: state || null,
    googleHasExternalAccountId: Boolean(verifiedExternalAccountId),
    hasExpiryTime: Boolean(expiresAt),
  });

  return {
    expiresAt,
    orderId: typeof payload.latestOrderId === "string" ? payload.latestOrderId.trim() : null,
    verifiedBasePlanId: verifiedBasePlanId || null,
    verifiedExternalAccountId: verifiedExternalAccountId || null,
    verificationPayload: {
      ...payload,
      verifiedBasePlanId,
      verifiedExternalAccountId: verifiedExternalAccountId || null,
    },
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
  appUserId,
}) => {
  const diagnostics = platform === "android" ? getGooglePlayDiagnostics() : null;
  logIap("info", "verifyStorePurchase invoked", {
    platform,
    productId,
    basePlanId: basePlanId || null,
    ...(diagnostics || {}),
  });

  if (platform === "android") {
    try {
      return await verifyGooglePlayPurchase({ productId, basePlanId, purchaseToken, appUserId });
    } catch (error) {
      logIap("error", "verifyStorePurchase failed", {
        platform,
        productId,
        basePlanId: basePlanId || null,
        ...(diagnostics || {}),
        verificationErrorCode: error?.code || "UNKNOWN_VERIFICATION_ERROR",
        verificationStatusCode: error?.statusCode || 500,
        safeErrorMessage: toSafeErrorMessage(error),
        safeStack: toSafeStack(error),
      });
      throw error;
    }
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
