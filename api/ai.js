import OpenAI from "openai";
import { createClient } from '@supabase/supabase-js';

const DEFAULT_BASE_URL = "https://api.groq.com/openai/v1";
const ALLOWED_MODELS = new Set([
  "meta-llama/llama-4-scout-17b-16e-instruct",
  "llama-3.1-8b-instant",
]);
const MAX_MESSAGES = 8;
const MAX_TEXT_LENGTH = 16000;
const MAX_IMAGE_URL_LENGTH = 6_000_000;

// Basic in-memory rate limiting (IP/Token based) - NOTE: In Vercel serverless, this resets per-container. Use Upstash/Redis for real rate limiting.
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 15;

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

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

  let userId = 'anonymous';
  if (supabase) {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      // Fallback for custom APP_SECRET if Supabase auth fails (e.g., guest mode token)
      if (token !== process.env.APP_SECRET) {
        return json(res, 401, { error: "Unauthorized." });
      }
    } else {
      userId = user.id;
    }
  } else {
     if (token !== process.env.APP_SECRET) {
        return json(res, 401, { error: "Unauthorized." });
     }
  }

  // 2. Rate Limiting
  const identifier = userId !== 'anonymous' ? userId : (req.headers['x-forwarded-for'] || 'unknown_ip');
  const now = Date.now();
  const userRate = rateLimitMap.get(identifier) || { count: 0, startTime: now };
  
  if (now - userRate.startTime > RATE_LIMIT_WINDOW) {
    userRate.count = 1;
    userRate.startTime = now;
  } else {
    userRate.count++;
  }
  rateLimitMap.set(identifier, userRate);

  if (userRate.count > MAX_REQUESTS_PER_WINDOW) {
    return json(res, 429, { error: "Too many requests. Please try again later." });
  }

  const apiKey = process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY;
  if (!apiKey) {
    return json(res, 500, { error: "AI provider key is not configured on the server." });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const request = normalizeRequest(body);

    const client = new OpenAI({
      apiKey,
      baseURL: process.env.LLAMA_BASE_URL || DEFAULT_BASE_URL,
    });

    const completion = await client.chat.completions.create(request);
    const content = completion.choices?.[0]?.message?.content?.trim();

    if (!content) {
      return json(res, 502, { error: "AI provider returned an empty response." });
    }

    return json(res, 200, { content });
  } catch (error) {
    console.error("AI endpoint error:", error);
    const message = error instanceof Error ? error.message : "AI request failed.";
    const statusCode =
      message === "Invalid request body." ||
      message === "Unsupported model." ||
      message === "Invalid messages payload." ||
      message === "Invalid message entry."
        ? 400
        : 502;

    return json(res, statusCode, { error: message });
  }
}
