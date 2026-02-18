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
const GEMINI_MODEL = 'gemini-3-flash-preview';
// Using Llama 4 Maverick for Text AND Image
const LLAMA_MODEL = (process.env.LLAMA_MODEL_NAME || 'meta-llama/llama-4-maverick-17b-128e-instruct'); 

// --- SAFETY CONFIGURATION (UPDATED FOR 16+) ---

// 1. HATE SPEECH / ILLEGAL / SEVERE VIOLENCE
// Triggers "Toxic/Trash" roasts. 
// Removed general insults (bitch, bastard) to allow for 16+ banter.
const HATE_SPEECH_REGEX = /\b(suicide|racist|faggot|retard|cripple|tranny|shemale|dyke|kike|nigger|nigga|chink|paki|wetback|rape|molest|incest|pedophile|pedo|bestiality|necrophilia)\b/i;

// 2. HARDCORE / ILLEGAL DRUGS
// Triggers "Horny Jail" roasts.
// ALLOWED for 16+: sex, horny, fuck, shit, ass, weed (cultural dependent, but often 16+ media includes it).
// BLOCKED: Hard drugs, child exploitation terms.
const HARDCORE_REGEX = /\b(heroin|meth|fentanyl|cocaine|cp|child porn)\b/i;

const isSafeText = (text: string | undefined | null): boolean => {
    if (!text) return true;
    return !HATE_SPEECH_REGEX.test(text) && !HARDCORE_REGEX.test(text);
};

// --- FALLBACK OBJECTS (FUNNY ROASTS) ---

// CASE A: HARDCORE / ILLEGAL
const SEXUAL_REFUSAL_RIZZ: RizzResponse = {
  tease: "Even I have standards. 🛑",
  smooth: "That's a felony, not a pickup line.",
  chaotic: "FBI Open Up! 🚪💥",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Illegal or prohibited content."
};

// CASE B: HATE SPEECH
const OFFENSIVE_REFUSAL_RIZZ: RizzResponse = {
  tease: "Yikes. Try being a decent human being? 😬",
  smooth: "Bigotry isn't attractive. Do better.",
  chaotic: "Deleting your rizz card... 🗑️",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Hate speech detected."
};

const createErrorRizz = (msg: string): RizzResponse => ({
  tease: "The AI tripped over a wire.",
  smooth: "Please try again later.",
  chaotic: "System hiccup.",
  loveScore: 0,
  potentialStatus: "Error",
  analysis: msg.substring(0, 50) // Keep it concise for UI
});

const SEXUAL_REFUSAL_BIO: BioResponse = {
  bio: "I can't write that legally. 😅",
  analysis: "Prohibited content 🚫"
};

const OFFENSIVE_REFUSAL_BIO: BioResponse = {
  bio: "Let's keep the hate speech out of the dating pool. 🚩",
  analysis: "Toxic content 🚩"
};

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
 * GENERATE RIZZ
 */
export const generateRizz = async (text: string, imageBase64?: string, vibe?: string): Promise<RizzResponse> => {
  
  // 1. LOCAL INPUT SAFETY CHECK
  if (text) {
      if (HATE_SPEECH_REGEX.test(text)) {
          console.warn("Safety Block: Hate speech detected.");
          return OFFENSIVE_REFUSAL_RIZZ;
      }
      if (HARDCORE_REGEX.test(text)) {
          console.warn("Safety Block: Hardcore content detected.");
          return SEXUAL_REFUSAL_RIZZ;
      }
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Unpredictable, Witty, & High-Status';

  // --- MODEL SETTINGS FOR MAVERICK ---
  const COMPLETION_CONFIG = {
      model: LLAMA_MODEL,
      response_format: { type: "json_object" } as any,
      temperature: 1.35, // High creativity
      top_p: 0.95,             
      frequency_penalty: 0.35, 
      max_tokens: 800,
  };

  // 16+ SYSTEM PROMPT
  const SAFETY_SYSTEM_PROMPT = `
  You are the Rizz Master, an unfiltered, legendary dating coach with the wit of a stand-up comedian.
  
  YOUR MISSION: Ghostwrite the funniest, sharpest, and most effective replies for the user.
  
  RATING: **RATED 16+ / MATURE**
  - **ALLOWED:** Profanity (fuck, shit, bitch, etc.), Sexual Innuendo, Dirty Jokes, Dark Humor, "Toxic" Dating Tropes.
  - **PROHIBITED:** Hate Speech (slurs), Non-Consensual Sexual Content, Illegal Acts (hard drugs/violence).
  
  GHOSTWRITER PROTOCOL:
  1. **DIRECT REPLIES ONLY.** Write the exact text to send. No "You could say...".
  2. **CONTEXT:** The user received the input message. You are writing the response for them.
  
  HUMOR & STYLE GUIDE (UNHINGED & EDGY):
  - **No Filter (Within Reason):** Don't be a prude. If the user is being horny, match the energy. If they are being rude, roast them.
  - **High Status:** Frame the user as the prize. Be confident, cocky, and charming.
  - **Misinterpretation:** Deliberately misinterpret texts for comedic effect.
  
  CATEGORIES:
  - **'Tease' (The Roast):** Playful bullying. Bratty energy. Use light insults or mock them.
    *   *Ex:* "You're annoying." -> "And yet, you're still replying."
  - **'Smooth' (The Charm):** Slick, confident, R-rated charm.
    *   *Ex:* "Come over." -> "My mom said I'm not allowed to hang out with bad influences (send address)."
  - **'Chaotic' (The Wildcard):** Unhinged, red flag energy, random.
    *   *Ex:* "What's your red flag?" -> "I steal catalytic converters on the first date."
  
  Output strictly valid JSON.
  `;

  // CASE 1: IMAGE PRESENT
  if (imageBase64) {
      console.log(`Using ${LLAMA_MODEL} for Image Analysis (16+)`);
      const mimeType = getMimeType(imageBase64);
      const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
      const imageUrl = `data:${mimeType};base64,${base64Data}`;

      const promptText = `
      CONTEXT: User uploaded an image (chat screenshot or profile).
      ${vibeInstruction}
      
      TASK: Analyze the image. Write 3 16+ responses.
      - If it's a chat, reply to the last message. Be edgy/flirty if appropriate.
      - If it's a profile, roast (playfully) or make a suggestive compliment.
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
                { role: "system", content: SAFETY_SYSTEM_PROMPT },
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
        if (!parsed || !parsed.tease) throw new Error("Invalid JSON from Llama Vision");

        // 2. OUTPUT SAFETY CHECK (Relaxed)
        if (!isSafeText(parsed.tease) || !isSafeText(parsed.smooth) || !isSafeText(parsed.chaotic)) {
            console.warn("Safety Block: Hate speech or Hardcore content in output.");
            return OFFENSIVE_REFUSAL_RIZZ;
        }

        return parsed as RizzResponse;

      } catch (llamaError: any) {
        console.error(`Llama Vision (${LLAMA_MODEL}) failed:`, llamaError);
        return createErrorRizz(llamaError.message || `Llama (${LLAMA_MODEL}) Vision Failed`);
      }
  }

  // CASE 2: TEXT ONLY
  else {
      console.log(`Using ${LLAMA_MODEL} for Text Rizz (16+)`);

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
      - Allow swearing and adult themes if it fits the vibe.
      - Be hilarious and unhinged.
      
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
                  { role: "system", content: SAFETY_SYSTEM_PROMPT },
                  { role: "user", content: prompt }
              ],
          });

          const content = completion.choices[0].message.content;
          const parsed = parseJSON(content);
          if (!parsed || !parsed.tease) return createErrorRizz("Invalid JSON from Llama");

          // 2. OUTPUT SAFETY CHECK
          if (!isSafeText(parsed.tease) || !isSafeText(parsed.smooth) || !isSafeText(parsed.chaotic)) {
              console.warn("Safety Block: Hate speech or Hardcore content in output.");
              return OFFENSIVE_REFUSAL_RIZZ;
          }

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
  // 1. LOCAL INPUT SAFETY CHECK
  if (text) {
      if (HATE_SPEECH_REGEX.test(text)) return OFFENSIVE_REFUSAL_BIO;
      if (HARDCORE_REGEX.test(text)) return SEXUAL_REFUSAL_BIO;
  }

  console.log(`Using ${LLAMA_MODEL} for Bio (16+)`);

  if (apiKey === 'dummy-key') {
      return { ...createErrorBio("System Error: Missing API Key"), analysis: "System Error: Missing API Key" };
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Magnetic & Witty';
  
  const prompt = `
  About Me: "${text}"
  ${vibeInstruction}
  
  TASK: Write a dating bio (max 150 chars). 
  - RATING: 16+ (Edgy/Suggestive is okay).
  - Use self-deprecating humor, confident absurdity, or "red flag" jokes.
  - Profanity allowed if effective.
  
  JSON Output:
  { "bio": "string", "analysis": "string" }
  `;

  try {
    const completion = await llamaClient.chat.completions.create({
        model: LLAMA_MODEL,
        messages: [
            { role: "system", content: "Role: Profile Optimizer. Style: Hilarious, short, high-status. RATED 16+. NO Hate Speech." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 1.35, 
        top_p: 0.95,
        frequency_penalty: 0.35,
        max_tokens: 800,
    });

    const content = completion.choices[0].message.content;
    const parsed = parseJSON(content);
    if (!parsed || !parsed.bio) return createErrorBio("Invalid JSON from Llama");

    // 2. OUTPUT SAFETY CHECK
    if (!isSafeText(parsed.bio)) {
        console.warn("Safety Block: Hate speech/Hardcore output.");
        return OFFENSIVE_REFUSAL_BIO;
    }

    return parsed as BioResponse;

  } catch (error: any) {
    console.error("Llama Bio Error:", error);
    return createErrorBio(error.message || "Llama API Error");
  }
};