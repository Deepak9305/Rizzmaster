import OpenAI from "openai";
import { supabase, supabaseAdmin } from './_supabase.js';

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const ALLOWED_MODELS = new Set([
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.3-70b-versatile",
  "llama-3.2-90b-vision-preview",
]);
const MAX_MESSAGES = 8;
const MAX_TEXT_LENGTH = 16000;
const MAX_IMAGE_URL_LENGTH = 6_000_000;

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

const hasImage = (messages) => {
  if (!Array.isArray(messages)) return false;
  return messages.some(msg => 
    Array.isArray(msg.content) && 
    msg.content.some(part => part && part.type === "image_url")
  );
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

  const isGuest = (token === "unauthenticated");
  let user = null;
  let userId = "guest_user";

  if (!isGuest) {
    if (!supabase || !supabaseAdmin) {
      return json(res, 500, { error: "Supabase integration not configured on the server." });
    }

    try {
      const { data, error } = await supabase.auth.getUser(token);
      if (error || !data || !data.user) {
        return json(res, 401, { error: "Unauthorized. Invalid token." });
      }
      user = data.user;
      userId = user.id;
    } catch (err) {
      return json(res, 401, { error: "Unauthorized. Token verification failed." });
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
      // Check credits and premium status for signed-in users using Service Role
      const { data: profile, error: profileError } = await supabaseAdmin
        .from("profiles")
        .select("credits, is_premium")
        .eq("id", userId)
        .single();

      if (profileError || !profile) {
        console.error("[AI API] Profile not found for user:", userId);
        return json(res, 404, { 
          error: "User profile not found.",
          code: "PROFILE_NOT_FOUND" 
        });
      }

      isPremium = !!profile.is_premium;

      if (!isPremium) {
        if (profile.credits < cost) {
          console.warn(`[AI API] Insufficient credits for user: ${userId}. Has: ${profile.credits}, Needs: ${cost}`);
          return json(res, 403, { 
            error: `Insufficient credits. Rizz AI text costs 1 credit, image costs 2 credits. You have ${profile.credits} credits.`, 
            code: "INSUFFICIENT_CREDITS" 
          });
        }

        // Deduct credits atomically in Postgres. The RPC raises if another request
        // consumed the balance between the read above and this debit.
        const { error: deductError } = await supabaseAdmin.rpc("admin_modify_credits", {
          user_uuid: userId,
          amount_change: -cost
        });

        if (deductError) {
          if (deductError.message?.toLowerCase().includes("insufficient credits")) {
            return json(res, 403, {
              error: `Insufficient credits. Rizz AI text costs 1 credit, image costs 2 credits. You have ${profile.credits} credits.`,
              code: "INSUFFICIENT_CREDITS"
            });
          }

          console.error(`[AI API] Failed to deduct credits for user: ${userId}. Error:`, deductError);
          return json(res, 500, { 
            error: "Failed to deduct credits.",
            code: "CREDIT_DEDUCTION_FAILED"
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

    const completion = await client.chat.completions.create(request);
    const content = completion.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new Error("AI provider returned an empty response.");
    }

    return json(res, 200, { content });
  } catch (error) {
    console.error("AI endpoint error:", error);

    // Refund credits if deducted
    if (creditsDeducted && !isPremium && supabaseAdmin) {
      await supabaseAdmin.rpc("admin_modify_credits", {
        user_uuid: userId,
        amount_change: cost
      }).catch(err => console.error("Refund credits failed:", err));
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
