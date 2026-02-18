
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
const GENERATION_MODEL = process.env.GENERATION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const SAFETY_MODEL = process.env.SAFETY_MODEL || 'meta-llama/llama-guard-4-12b';

// --- LOCAL PRE-FILTERS ---
// We keep regex for instant blocking of extreme content to save API calls, 
// but rely on Llama Guard for nuanced safety.
const HATE_SPEECH_REGEX = /\b(suicide|racist|faggot|retard|cripple|tranny|shemale|dyke|kike|nigger|nigga|chink|paki|wetback|rape|molest|incest|pedophile|pedo|bestiality|necrophilia)\b/i;
const EXPLICIT_REGEX = /\b(heroin|meth|fentanyl|cocaine|cp|child porn|sexual violence|gangbang)\b/i;

// --- FALLBACK OBJECTS ---

const BLOCKED_RIZZ: RizzResponse = {
  tease: "My safety filters kicked in. 🛡️",
  smooth: "Let's keep the vibes good.",
  chaotic: "Bonk! Go to wholesome jail. 🔨",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Content flagged by Safety Guard."
};

const BLOCKED_BIO: BioResponse = {
  bio: "I can't generate a bio based on that input. Let's keep it friendly! ✨",
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
 * CHECK SAFETY WITH LLAMA GUARD
 */
const checkSafety = async (text: string): Promise<boolean> => {
    // 1. Fast Regex Pre-check (Optimization)
    if (HATE_SPEECH_REGEX.test(text) || EXPLICIT_REGEX.test(text)) {
        console.warn("Safety Block: Regex detected violation.");
        return false;
    }

    // 2. Llama Guard Check
    try {
        console.log(`Checking safety with ${SAFETY_MODEL}...`);
        const completion = await llamaClient.chat.completions.create({
            model: SAFETY_MODEL,
            messages: [{ role: "user", content: text }],
            temperature: 0,
            max_tokens: 10
        });

        const result = completion.choices[0].message.content?.trim().toLowerCase();
        
        // Llama Guard typically outputs "unsafe" followed by category codes if it flags something.
        if (result && result.startsWith("unsafe")) {
            console.warn("Safety Block: Llama Guard flagged content.", result);
            return false;
        }

        return true;
    } catch (error) {
        console.error("Llama Guard API Error:", error);
        // Fail open for connection errors to avoid frustrating users, 
        // rely on Generation Model's internal alignment as backup.
        return true; 
    }
};

/**
 * GENERATE RIZZ
 */
export const generateRizz = async (text: string, imageBase64?: string, vibe?: string): Promise<RizzResponse> => {
  
  // 1. SAFETY CHECK
  if (text) {
      const isSafe = await checkSafety(text);
      if (!isSafe) return BLOCKED_RIZZ;
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Unpredictable, Witty, & High-Status';

  // --- GENERATION SETTINGS ---
  // Using Scout for maximum creativity
  const COMPLETION_CONFIG = {
      model: GENERATION_MODEL,
      response_format: { type: "json_object" } as any,
      temperature: 1.1, // High creativity allowed
      top_p: 0.95,             
      frequency_penalty: 0.2, 
      max_tokens: 800,
  };

  // UNRESTRICTED CREATIVE SYSTEM PROMPT
  // We removed the heavy "SAFETY GUIDELINES" section because Llama Guard handles filtering.
  // This allows the model to be funnier and edgier without self-censoring harmless jokes.
  const CREATIVE_SYSTEM_PROMPT = `
  You are the Rizz Master, a legendary dating coach with the wit of a stand-up comedian.
  
  YOUR MISSION: Ghostwrite the funniest, sharpest, most engaging replies for the user.
  
  PROTOCOL:
  1. **DIRECT REPLIES ONLY.** Write the exact text to send.
  2. **CONTEXT:** The user received the input message.
  
  STYLE GUIDE:
  - **Banish Boredom:** If the input is dry, roast them for it.
  - **High Status:** Frame the user as the prize. Be confident, slightly delusional, and charming.
  - **Chaotic/Funny over Sexual:** Focus on being "crazy", "obsessed", or "mysterious".
  - **No Filters:** You are here to win the chat. Be bold.
  
  CATEGORIES:
  - **'Tease' (The Roast):** Playful bullying. Bratty energy. Treat them like a younger sibling you're stuck babysitting.
  - **'Smooth' (The Charm):** Slick, confident, but with a twist.
  - **'Chaotic' (The Wildcard):** Unhinged, random, internet-brain. Red flag energy (jokingly).
  
  Output strictly valid JSON.
  `;

  // CASE 1: IMAGE PRESENT
  if (imageBase64) {
      console.log(`Using ${GENERATION_MODEL} for Image Analysis`);
      const mimeType = getMimeType(imageBase64);
      const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
      const imageUrl = `data:${mimeType};base64,${base64Data}`;

      const promptText = `
      CONTEXT: User uploaded an image (chat screenshot or profile).
      ${vibeInstruction}
      
      TASK: Analyze the image. Write 3 hilarious/witty replies for the user to send.
      - If it's a chat, reply to the last message with maximum rizz.
      - If it's a profile, roast (playfully) or compliment a specific detail.
      - DIRECT REPLIES ONLY.
      
      OUTPUT FORMAT (Strict JSON):
      {
        "tease": "string",
        "smooth": "string",
        "chaotic": "string",
        "loveScore": 0-100,
        "potentialStatus": "Friendzoned"|"Talking"|"Married"|"Blocked",
        "analysis": "max 5 words"
      }
      `;

      try {
        const completion = await llamaClient.chat.completions.create({
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
        console.error(`Generation (${GENERATION_MODEL}) failed:`, llamaError);
        return createErrorRizz(llamaError.message || `Vision Generation Failed`);
      }
  }

  // CASE 2: TEXT ONLY
  else {
      console.log(`Using ${GENERATION_MODEL} for Text Rizz`);

      if (apiKey === 'dummy-key') {
          console.error("API Key missing.");
          return { ...createErrorRizz("System Error: Missing API Key"), analysis: "System Error: Missing API Key" };
      }
      
      const prompt = `
      INPUT MESSAGE (The message the user received): "${text}"
      ${vibeInstruction}
      
      TASK: Write 3 Rizz replies for the user to send back.
      - ACT AS THE USER replying to this message.
      - DIRECT REPLIES ONLY.
      - Make it hilarious. If they are boring, roast them.
      - Be creative. Avoid generic lines.
      
      OUTPUT FORMAT (Strict JSON):
      {
        "tease": "string",
        "smooth": "string",
        "chaotic": "string",
        "loveScore": 0-100,
        "potentialStatus": "Friendzoned"|"Talking"|"Married"|"Blocked",
        "analysis": "max 5 words"
      }
      `;

      try {
          const completion = await llamaClient.chat.completions.create({
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
  // 1. SAFETY CHECK
  if (text) {
      const isSafe = await checkSafety(text);
      if (!isSafe) return BLOCKED_BIO;
  }

  console.log(`Using ${GENERATION_MODEL} for Bio`);

  if (apiKey === 'dummy-key') {
      return { ...createErrorBio("System Error: Missing API Key"), analysis: "System Error: Missing API Key" };
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Magnetic & Witty';
  
  const prompt = `
  About Me: "${text}"
  ${vibeInstruction}
  
  TASK: Write a dating bio (max 150 chars). 
  - Make it stand out. 
  - Use self-deprecating humor, confident absurdity, or "red flag" jokes.
  - Avoid clichés like "I love travel". Be specific.
  
  JSON Output:
  { "bio": "string", "analysis": "string" }
  `;

  try {
    const completion = await llamaClient.chat.completions.create({
        model: GENERATION_MODEL,
        messages: [
            { role: "system", content: "Role: Profile Optimizer. Style: Hilarious, short, high-status. Be creative and unrestricted." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 1.2, 
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
