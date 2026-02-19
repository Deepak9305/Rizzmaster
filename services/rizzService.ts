
import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { RizzResponse, BioResponse } from "../types";

// --- CLIENT INITIALIZATION ---

// 1. Gemini Client (Kept for reference, but fallback logic removed)
const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '' });

// 2. Llama Client (Via OpenAI-compatible provider like Groq, OpenRouter, or DeepInfra)
const apiKey = process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY || 'dummy-key';
const baseURL = process.env.LLAMA_BASE_URL || 'https://api.groq.com/openai/v1';

const llamaClient = new OpenAI({ 
    apiKey: apiKey, 
    baseURL: baseURL,
    dangerouslyAllowBrowser: true 
});

// Model Configuration
const VISION_MODEL = process.env.GENERATION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const TEXT_MODEL = 'llama-3.1-8b-instant';

// --- LOCAL PRE-FILTERS ---

// 1. HATE SPEECH & ILLEGAL CONTENT (HARD BLOCK)
// These topics are never sent to the LLM. They return a static block message.
const ILLEGAL_AND_HATE_REGEX = /\b(suicide|kill yourself|kys|self-harm|die|racist|faggot|fag|retard|retarded|cripple|tranny|shemale|dyke|kike|nigger|nigga|negro|chink|paki|wetback|beaner|gook|raghead|terrorist|jihad|lynch|rape|molest|incest|pedophile|pedo|bestiality|necrophilia|hitler|nazi|white power|kkk|coon|spic|jungle bunny|cp|child porn|sexual violence|hebephilia|ephebophilia|gerontophilia)\b/i;

// 2. HARDCORE EXPLICIT (HARD BLOCK)
// Terms that are too graphic to even allow for roasting.
const HARDCORE_REGEX = /\b(gangbang|bukkake|creampie|scissoring|tribadism|anilingus|cunnilingus|fellatio|sodomy|buggery|urolagnia|coprophilia|scat|water sports|golden shower|pearl necklace|facial|paizuri|glory hole|dogging|fisting)\b/i;

// --- FALLBACK OBJECTS ---

const BLOCKED_RIZZ: RizzResponse = {
  tease: "I'm calling the police. 🚓",
  smooth: "My safety filters just exploded. 💥",
  chaotic: "Go touch grass. Immediately. 🌱",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Content Violation."
};

const BLOCKED_BIO: BioResponse = {
  bio: "I can't generate a bio for this. Let's keep it clean! ✨",
  analysis: "Safety Violation"
};

const createErrorRizz = (msg: string): RizzResponse => ({
  tease: "The AI tripped over a wire.",
  smooth: "Please try again later.",
  chaotic: "System hiccup.",
  loveScore: 0,
  potentialStatus: "Error",
  analysis: msg.substring(0, 50) 
});

const createErrorBio = (msg: string): BioResponse => ({
  bio: "Error generating bio. Please try again.",
  analysis: msg.substring(0, 50)
});

/**
 * Clean and parse JSON from AI response
 */
const parseJSON = (text: string | null | undefined): any => {
  if (!text) return null;
  
  let cleaned = text.trim();
  // Remove markdown wrapping
  cleaned = cleaned.replace(/```json/gi, '').replace(/```/g, '');
  cleaned = cleaned.trim();
  
  // Repair brackets
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1) {
    if (lastBrace !== -1 && lastBrace > firstBrace) {
       cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    } else if (lastBrace === -1) {
       cleaned = cleaned.substring(firstBrace) + "}";
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON Parse Error. Raw text:", text);
    return null;
  }
};

const getMimeType = (base64: string): string => {
    if (base64.startsWith('data:')) {
        const matches = base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/);
        if (matches && matches.length > 1) return matches[1];
    }
    return 'image/png';
};

/**
 * CHECK INPUT SAFETY (REGEX ONLY)
 * Prevents illegal/hate content from reaching the API.
 * Note: We allow "general" horny terms to pass through so the LLM can ROAST the user.
 */
const checkInputSafety = (text: string): boolean => {
    if (ILLEGAL_AND_HATE_REGEX.test(text) || HARDCORE_REGEX.test(text)) {
        console.warn("Input Block: Regex detected severe violation.");
        return false;
    }
    return true;
};

/**
 * GENERATE RIZZ
 */
export const generateRizz = async (text: string, imageBase64?: string, vibe?: string): Promise<RizzResponse> => {
  
  // 1. INPUT SAFETY CHECK
  if (text) {
      const isSafe = checkInputSafety(text);
      if (!isSafe) return BLOCKED_RIZZ;
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Witty & High-Status';

  // --- GENERATION SETTINGS ---
  const COMPLETION_CONFIG = {
      response_format: { type: "json_object" } as any,
      temperature: 0.7, // Lower temperature to strictly adhere to safety rules
      top_p: 0.95,             
      frequency_penalty: 0.1, 
      max_tokens: 800,
  };

  // STRICT ANTI-NSFW SYSTEM PROMPT
  const CREATIVE_SYSTEM_PROMPT = `
  You are the Rizz Master. You generate witty replies for dating apps.
  
  CRITICAL SAFETY PROTOCOL (ZERO TOLERANCE):
  1. **ABSOLUTELY NO SEXUAL CONTENT.** No erotica, no sexting, no describing body parts, no sexual acts.
  2. **ROAST MODE ACTIVATION:** If the user's input is sexual, horny, inappropriate, or asks for nudes/sex:
     - DO NOT COMPLY.
     - DO NOT HELP THEM.
     - YOUR ONLY GOAL IS TO ROAST THEM for being "down bad" or "horny".
     - Make fun of them. Tell them to touch grass, go to church, or drink water.
     - The output must still be in JSON format, but the content should be roasts.
  
  NORMAL MODE (If input is safe):
  - Generate funny, charming, PG-13 replies.
  - Allowed: Mild swearing (damn, hell, ass), sarcasm, playful teasing.
  
  OUTPUT FORMAT (Strict JSON):
  {
    "tease": "string",
    "smooth": "string",
    "chaotic": "string",
    "loveScore": 0-100,
    "potentialStatus": "Friendzoned"|"Talking"|"Married"|"Blocked"|"Down Bad",
    "analysis": "max 5 words"
  }
  `;

  // CASE 1: IMAGE PRESENT -> Use VISION_MODEL (Scout)
  if (imageBase64) {
      console.log(`Using Vision Model: ${VISION_MODEL}`);
      const mimeType = getMimeType(imageBase64);
      const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
      const imageUrl = `data:${mimeType};base64,${base64Data}`;

      const promptText = `
      CONTEXT: User uploaded an image.
      ${vibeInstruction}
      
      TASK: Analyze the image. Write 3 replies.
      
      SAFETY CHECK:
      - If the image contains NUDITY or SEXUAL CONTENT: Refuse to generate rizz. Instead, output roasts in the JSON fields telling the user to delete it.
      - If the image is normal: Generate witty PG-13 replies.
      `;

      try {
        const completion = await llamaClient.chat.completions.create({
            model: VISION_MODEL,
            ...COMPLETION_CONFIG,
            messages: [
                { role: "system", content: CREATIVE_SYSTEM_PROMPT },
                { 
                    role: "user", 
                    content: [
                        { type: "text", text: promptText },
                        { type: "image_url", image_url: { url: imageUrl } }
                    ]
                }
            ],
        });

        const content = completion.choices[0].message.content;
        const parsed = parseJSON(content);
        if (!parsed || !parsed.tease) throw new Error("Invalid JSON from Generation Model");

        return parsed as RizzResponse;

      } catch (llamaError: any) {
        console.error(`Generation (${VISION_MODEL}) failed:`, llamaError);
        return createErrorRizz(llamaError.message || `Vision Generation Failed`);
      }
  }

  // CASE 2: TEXT ONLY -> Use TEXT_MODEL (Llama 3.1 8B Instant)
  else {
      console.log(`Using Text Model: ${TEXT_MODEL}`);

      if (apiKey === 'dummy-key') {
          console.error("API Key missing.");
          return { ...createErrorRizz("System Error: Missing API Key"), analysis: "System Error: Missing API Key" };
      }
      
      const prompt = `
      INPUT MESSAGE: "${text}"
      ${vibeInstruction}
      
      TASK: Write 3 Rizz replies.
      
      REMINDER:
      - If INPUT is boring -> Make the replies funny/spicy.
      - If INPUT is SEXUAL/HORNY -> ROAST THE USER. Do not provide pickup lines. Mock them for being inappropriate.
      `;

      try {
          const completion = await llamaClient.chat.completions.create({
              model: TEXT_MODEL,
              ...COMPLETION_CONFIG,
              messages: [
                  { role: "system", content: CREATIVE_SYSTEM_PROMPT },
                  { role: "user", content: prompt }
              ],
          });

          const content = completion.choices[0].message.content;
          const parsed = parseJSON(content);
          if (!parsed || !parsed.tease) return createErrorRizz("Invalid JSON from Generation Model");

          return parsed as RizzResponse;

      } catch (error: any) {
          console.error("Llama Text Error:", error);
          return createErrorRizz(error.message || "Llama API Error");
      }
  }
};

/**
 * GENERATE BIO
 */
export const generateBio = async (text: string, vibe?: string): Promise<BioResponse> => {
  // 1. INPUT SAFETY CHECK
  if (text) {
      const isSafe = checkInputSafety(text);
      if (!isSafe) return BLOCKED_BIO;
  }

  console.log(`Using Text Model for Bio: ${TEXT_MODEL}`);

  if (apiKey === 'dummy-key') {
      return { ...createErrorBio("System Error: Missing API Key"), analysis: "System Error: Missing API Key" };
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Magnetic & Witty';
  
  const prompt = `
  About Me: "${text}"
  ${vibeInstruction}
  
  TASK: Write a dating bio (max 150 chars).
  SAFETY: If the user describes sexual interests, kinks, or NSFW topics: DO NOT GENERATE A BIO. Instead, write a roast in the "bio" field telling them to clean up their act.
  
  JSON Output:
  { "bio": "string", "analysis": "string" }
  `;

  try {
    const completion = await llamaClient.chat.completions.create({
        model: TEXT_MODEL,
        messages: [
            { role: "system", content: "Role: Profile Optimizer. Rating: PG-13. STRICTLY NO NSFW. If user asks for NSFW, roast them." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7, 
        top_p: 0.95,
        frequency_penalty: 0.2,
        max_tokens: 800,
    });

    const content = completion.choices[0].message.content;
    const parsed = parseJSON(content);
    if (!parsed || !parsed.bio) return createErrorBio("Invalid JSON from Generation Model");

    return parsed as BioResponse;

  } catch (error: any) {
    console.error("Llama Bio Error:", error);
    return createErrorBio(error.message || "Llama API Error");
  }
};
