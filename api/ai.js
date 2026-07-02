import OpenAI from "openai";
import { supabase, supabaseAdmin } from './_supabase.js';
import { ensureUserProfile } from './_profiles.js';
import { applyCors } from './_cors.js';

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const ALLOWED_MODELS = new Set([
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.3-70b-versatile",
  "llama-3.2-90b-vision-preview",
]);
const TEXT_MODEL_FALLBACKS = [
  "llama-3.3-70b-versatile",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];
const VISION_MODEL_FALLBACKS = [
  "llama-3.2-90b-vision-preview",
  "meta-llama/llama-4-scout-17b-16e-instruct",
];
const MAX_MESSAGES = 8;
const MAX_TEXT_LENGTH = 16000;
const MAX_IMAGE_URL_LENGTH = 6_000_000;
const AI_PROVIDER_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.AI_PROVIDER_TIMEOUT_MS || "", 10);
  if (Number.isFinite(parsed) && parsed >= 5_000) {
    return parsed;
  }
  return 25_000;
})();

// Basic in-memory rate limiting (IP/Token based) - NOTE: In Vercel serverless, this resets per-container. Use Upstash/Redis for real rate limiting.
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15;

const json = (res, statusCode, payload) => {
  res.status(statusCode);
  res.setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(payload));
};

const isObject = (value) => typeof value === "object" && value !== null;

const isValidMessagePart = (part) => {
  if (!isObject(part) || typeof part.type !== "string") {
    return false;
  }

  if (part.type === "text") {
    return typeof part.text === "string" && part.text.length > 0 && part.text.length <= MAX_TEXT_LENGTH;
  }

  if (part.type === "image_url") {
    return (
      isObject(part.image_url) &&
      typeof part.image_url.url === "string" &&
      part.image_url.url.length > 0 &&
      part.image_url.url.length <= MAX_IMAGE_URL_LENGTH
    );
  }

  return false;
};

const isValidMessageContent = (content) => {
  if (typeof content === "string") {
    return content.length > 0 && content.length <= MAX_TEXT_LENGTH;
  }

  return Array.isArray(content) && content.length > 0 && content.every(isValidMessagePart);
};

const parseJsonBody = (body) => {
  if (typeof body === "string") {
    try {
      return JSON.parse(body);
    } catch {
      throw new Error("Invalid JSON body.");
    }
  }

  if (!isObject(body)) {
    throw new Error("Invalid request body.");
  }

  return body;
};

const getRequestIdentifier = (req, fallback) => {
  const forwardedFor = req.headers["x-forwarded-for"];
  if (typeof forwardedFor === "string" && forwardedFor.trim()) {
    return forwardedFor.split(",")[0].trim();
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    const first = forwardedFor[0]?.trim();
    if (first) {
      return first;
    }
  }

  return fallback;
};

const pruneRateLimitEntries = (now) => {
  for (const [key, value] of rateLimitMap.entries()) {
    if (now - value.startTime > RATE_LIMIT_WINDOW) {
      rateLimitMap.delete(key);
    }
  }
};

const normalizeRequest = (body) => {
  if (!isObject(body)) {
    throw new Error("Invalid request body.");
  }

  const { model, messages, temperature, max_tokens: maxTokens } = body;

  if (!ALLOWED_MODELS.has(model)) {
    throw new Error("Unsupported model.");
  }

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    throw new Error("Invalid messages payload.");
  }

  const normalizedMessages = messages.map((message) => {
    if (
      !isObject(message) ||
      !["system", "user", "assistant"].includes(message.role) ||
      !isValidMessageContent(message.content)
    ) {
      throw new Error("Invalid message entry.");
    }

    return {
      role: message.role,
      content: message.content,
    };
  });

  const safeTemperature =
    typeof temperature === "number" && Number.isFinite(temperature)
      ? Math.min(Math.max(temperature, 0), 2)
      : 1;

  const safeMaxTokens =
    typeof maxTokens === "number" && Number.isFinite(maxTokens)
      ? Math.min(Math.max(Math.floor(maxTokens), 1), 1200)
      : undefined;

  return {
    model,
    messages: normalizedMessages,
    temperature: safeTemperature,
    max_tokens: safeMaxTokens,
  };
};

const LOGIN_REQUIRED_CODE = "LOGIN_REQUIRED";
const PROFILE_NOT_FOUND_CODE = "PROFILE_NOT_FOUND";
const INSUFFICIENT_CREDITS_CODE = "INSUFFICIENT_CREDITS";
const SUPABASE_BACKEND_UNAVAILABLE_CODE = "SUPABASE_BACKEND_UNAVAILABLE";
const PROFILE_BOOTSTRAP_FAILED_CODE = "PROFILE_BOOTSTRAP_FAILED";
const CREDIT_DEDUCTION_FAILED_CODE = "CREDIT_DEDUCTION_FAILED";

const isAuthTokenError = (error) => {
  const status = error?.status ?? error?.code;
  const message = `${error?.message || ""} ${error?.name || ""}`.toLowerCase();
  return (
    status === 401 ||
    status === 403 ||
    message.includes("jwt") ||
    message.includes("token") ||
    message.includes("unauthorized") ||
    message.includes("auth session missing")
  );
};

const isInsufficientCreditsError = (error) => (
  error?.message?.toLowerCase().includes("insufficient credits")
);

const isRpcLookupError = (error) => {
  const message = error?.message?.toLowerCase() || "";
  return (
    error?.code === "42883" ||
    error?.code === "PGRST202" ||
    error?.code === "PGRST204" ||
    (message.includes("function") && (message.includes("not found") || message.includes("schema cache"))) ||
    (message.includes("could not find") && message.includes("admin_modify_credits"))
  );
};

const updateCreditsDirectly = async (userId, amountChange) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { data: currentProfile, error: readError } = await supabaseAdmin
      .from("profiles")
      .select("credits")
      .eq("id", userId)
      .single();

    if (readError || !currentProfile) {
      return { error: readError || new Error("User profile not found") };
    }

    const hasNullCredits = currentProfile.credits === null || currentProfile.credits === undefined;
    const currentCredits = Number.isFinite(currentProfile.credits) ? currentProfile.credits : 0;
    const nextCredits = currentCredits + amountChange;
    if (nextCredits < 0) {
      return { error: new Error("Insufficient credits") };
    }

    let updateQuery = supabaseAdmin
      .from("profiles")
      .update({ credits: nextCredits })
      .eq("id", userId);

    updateQuery = hasNullCredits
      ? updateQuery.is("credits", null)
      : updateQuery.eq("credits", currentCredits);

    const { data: updatedProfile, error: updateError } = await updateQuery
      .select("credits")
      .maybeSingle();

    if (!updateError && updatedProfile) {
      return { error: null, credits: updatedProfile.credits };
    }

    if (updateError) {
      return { error: updateError };
    }
  }

  return { error: new Error("Concurrent credit update conflict") };
};

const modifyCredits = async (userId, amountChange) => {
  const rpcAttempts = [
    { user_uuid: userId, amount_change: amountChange },
    { p_user_id: userId, p_amount: amountChange },
    { user_id: userId, amount: amountChange },
  ];

  let lastLookupError = null;

  for (const params of rpcAttempts) {
    const { data, error } = await supabaseAdmin.rpc("admin_modify_credits", params);

    if (!error) {
      return { credits: data, usedFallback: false };
    }

    if (isInsufficientCreditsError(error)) {
      return { error };
    }

    if (!isRpcLookupError(error)) {
      return { error };
    }

    lastLookupError = error;
  }

  console.warn("[AI API] admin_modify_credits RPC unavailable; trying direct service-role credit update.", lastLookupError);
  const directResult = await updateCreditsDirectly(userId, amountChange);
  return { ...directResult, usedFallback: true };
};

const hasImage = (messages) => {
  if (!Array.isArray(messages)) return false;
  return messages.some(msg => 
    Array.isArray(msg.content) && 
    msg.content.some(part => part && part.type === "image_url")
  );
};

const withProviderTimeout = async (promise, timeoutMs) => {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("AI provider timed out.")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
  }
};

const getModelFallbackChain = (requestedModel, isImageRequest) => {
  const chain = [
    requestedModel,
    ...(isImageRequest ? VISION_MODEL_FALLBACKS : TEXT_MODEL_FALLBACKS),
  ];

  return chain.filter((model, index) => (
    typeof model === "string" &&
    ALLOWED_MODELS.has(model) &&
    chain.indexOf(model) === index
  ));
};

export default async function handler(req, res) {
  if (applyCors(req, res)) return;

  if (req.method !== "POST") {
    return json(res, 405, { error: "Method not allowed." });
  }

  // 1. Authentication
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return json(res, 401, {
      error: "Missing or invalid authorization header.",
      code: LOGIN_REQUIRED_CODE,
    });
  }
  const token = authHeader.slice("Bearer ".length).trim();

  if (!token) {
    return json(res, 401, {
      error: "Empty authorization token.",
      code: LOGIN_REQUIRED_CODE,
    });
  }

  const isGuest = (token === "unauthenticated");
  let user = null;
  let userId = "guest_user";

  if (!isGuest) {
    if (!supabase || !supabaseAdmin) {
      return json(res, 503, {
        error: "Supabase integration is unavailable on the server for signed-in generation.",
        code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
      });
    }

    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data || !data.user) {
        if (isAuthTokenError(error) || (!error && !data?.user)) {
          return json(res, 401, {
            error: "Unauthorized. Invalid or expired session.",
            code: LOGIN_REQUIRED_CODE,
          });
        }

        console.error("[AI API] Supabase auth lookup failed:", error);
        return json(res, 503, {
          error: "Signed-in generation is temporarily unavailable because the auth backend could not be reached.",
          code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
        });
      }
      user = data.user;
      userId = user.id;
    } catch (err) {
      console.error("[AI API] Token verification request failed:", err);
      return json(res, 503, {
        error: "Signed-in generation is temporarily unavailable because the auth backend could not be reached.",
        code: SUPABASE_BACKEND_UNAVAILABLE_CODE,
      });
    }
  }

  // 2. Rate Limiting
  const identifier = isGuest
    ? getRequestIdentifier(req, req.socket?.remoteAddress || "guest_ip")
    : userId;
  const now = Date.now();
  pruneRateLimitEntries(now);
  const userRate = rateLimitMap.get(identifier) || { count: 0, startTime: now };
  
  if (now - userRate.startTime > RATE_LIMIT_WINDOW) {
    userRate.count = 1;
    userRate.startTime = now;
  } else {
    userRate.count++;
  }
  rateLimitMap.set(identifier, userRate);

  const limit = MAX_REQUESTS_PER_WINDOW;
  if (userRate.count > limit) {
    return json(res, 429, { error: "Too many requests. Please try again later." });
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: "AI provider key is not configured on the server." });
  }

  let cost = 1;
  let isPremium = false;
  let creditsDeducted = false;

  try {
    const body = parseJsonBody(req.body);
    const request = normalizeRequest(body);

    // Determine cost: 1 for text-only, 2 if has image
    const isImageRequest = hasImage(request.messages);
    cost = isImageRequest ? 2 : 1;

    if (!isGuest) {
      const { profile, created, error: profileError } = await ensureUserProfile(supabaseAdmin, user);

      if (profileError || !profile) {
        console.error("[AI API] Profile lookup/create failed for user:", userId, profileError);
        if (profileError?.code === "PGRST116") {
          return json(res, 404, {
            error: "User profile not found.",
            code: PROFILE_NOT_FOUND_CODE,
          });
        }

        return json(res, 500, {
          error: "We could not prepare your profile for signed-in generation.",
          code: PROFILE_BOOTSTRAP_FAILED_CODE,
        });
      }

      if (created) {
        console.log(`[AI API] Created missing profile for signed-in user: ${userId}.`);
      }

      isPremium = !!profile.is_premium;

      if (!isPremium) {
        if (profile.credits < cost) {
          console.warn(`[AI API] Insufficient credits for user: ${userId}. Has: ${profile.credits}, Needs: ${cost}`);
          return json(res, 403, { 
            error: `Insufficient credits. Rizz AI text costs 1 credit, image costs 2 credits. You have ${profile.credits} credits.`, 
            code: INSUFFICIENT_CREDITS_CODE,
          });
        }

        // Deduct credits atomically in Postgres. The RPC raises if another request
        // consumed the balance between the read above and this debit.
        const { error: deductError } = await modifyCredits(userId, -cost);

        if (deductError) {
          if (isInsufficientCreditsError(deductError)) {
            return json(res, 403, {
              error: `Insufficient credits. Rizz AI text costs 1 credit, image costs 2 credits. You have ${profile.credits} credits.`,
              code: INSUFFICIENT_CREDITS_CODE,
            });
          }

          console.error(`[AI API] Failed to deduct credits for user: ${userId}. Error:`, deductError);
          return json(res, 500, { 
            error: "Failed to deduct credits.",
            code: CREDIT_DEDUCTION_FAILED_CODE
          });
        }
        creditsDeducted = true;
        console.log(`[AI API] Credits deducted: ${cost} for user: ${userId}.`);
      } else {
        console.log(`[AI API] Generation free for premium user: ${userId}.`);
      }
    } else {
      console.log(`[AI API] Guest generation allowed for IP: ${identifier}. Frontend will manage local credits.`);
    }

    // Call Groq / AI provider
    const client = new OpenAI({
      apiKey,
      baseURL: process.env.LLAMA_BASE_URL || DEFAULT_BASE_URL,
    });

    const candidateModels = getModelFallbackChain(request.model, isImageRequest);
    let completion = null;
    let content = "";
    let lastProviderError = null;

    for (const candidateModel of candidateModels) {
      try {
        completion = await withProviderTimeout(
          client.chat.completions.create({
            ...request,
            model: candidateModel,
          }),
          AI_PROVIDER_TIMEOUT_MS
        );
        content = completion.choices?.[0]?.message?.content?.trim() || "";

        if (content) {
          if (candidateModel !== request.model) {
            console.warn(`[AI API] Provider fallback used. Requested ${request.model}, served with ${candidateModel}.`);
          }
          break;
        }

        lastProviderError = new Error(`AI provider returned an empty response for model ${candidateModel}.`);
      } catch (providerError) {
        lastProviderError = providerError;
        console.warn(`[AI API] Model attempt failed for ${candidateModel}:`, providerError?.message || providerError);
      }
    }

    if (!content) {
      throw lastProviderError || new Error("AI provider returned an empty response.");
    }

    return json(res, 200, { content });
  } catch (error) {
    console.error("AI endpoint error:", error);

    // Refund credits if deducted
    if (creditsDeducted && !isPremium && supabaseAdmin) {
      const refundResult = await modifyCredits(userId, cost).catch(error => ({ error }));
      if (refundResult.error) {
        console.error("Refund credits failed:", refundResult.error);
      }
    }

    const message = error instanceof Error ? error.message : "AI request failed.";
    const statusCode =
      message === "Invalid JSON body." ||
      message === "Invalid request body." ||
      message === "Unsupported model." ||
      message === "Invalid messages payload." ||
      message === "Invalid message entry."
        ? 400
        : 502;

    return json(res, statusCode, { error: message });
  }
}
