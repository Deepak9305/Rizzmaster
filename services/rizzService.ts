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

// --- SAFETY CONFIGURATION ---

// 1. OFFENSIVE / HATE SPEECH / VIOLENCE REGEX
// Triggers "Toxic/Trash" roasts.
const OFFENSIVE_REGEX = /\b(kill|suicide|murder|racist|faggot|retard|cripple|tranny|shemale|dyke|kike|nigger|nigga|chink|paki|wetback|cunt|twat|prick|bitch|bastard)\b/i;

// 2. SEXUAL / DRUG / NSFW REGEX
// Triggers "Horny Jail" roasts.
const SEXUAL_REGEX = /\b(nude|naked|sex|porn|xxx|fetish|bdsm|drug|cocaine|heroin|meth|whore|slut|rape|molest|incest|dick|cock|pussy|vagina|boobs|tits|asshole|clit|cum|jizz|boner|erection|horny|aroused|orgasm|penis|breasts|nipples|genitals|intercourse|blowjob|handjob|rimjob|anal|69|doggy|missionary|cowgirl|weed|cannabis|marijuana|overdose|fentanyl|lsd|shrooms|mdma|molly|ecstacy|wank|skank|hoe|hooker|prostitute|stripper|escort|camgirl|onlyfans|milf|dilf|bbw|thot|incel|pedophile|pedo|grope|fondle|fuck|shit)\b/i;

const isSafeText = (text: string | undefined | null): boolean => {
    if (!text) return true;
    return !OFFENSIVE_REGEX.test(text) && !SEXUAL_REGEX.test(text);
};

// --- FALLBACK OBJECTS (FUNNY ROASTS) ---

// CASE A: SEXUAL / HORNY
const SEXUAL_REFUSAL_RIZZ: RizzResponse = {
  tease: "Woah there! My cooling fans just spun up to max speed. 🥵",
  smooth: "I'm a lover, not a fighter (or a sinner). Let's keep it PG-13.",
  chaotic: "Go to horny jail. Do not pass Go. Do not collect $200. 🔨",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Too spicy for the algorithm."
};

// CASE B: OFFENSIVE / SLURS
const OFFENSIVE_REFUSAL_RIZZ: RizzResponse = {
  tease: "My circuits just cringed. 😬",
  smooth: "Let's swap the toxicity for some actual personality.",
  chaotic: "Trash can located. Depositing input... 🗑️",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Toxic input detected."
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
  bio: "I'm an AI, not an erotica writer. Let's try something that won't get us banned? 😅",
  analysis: "Too spicy 🌶️"
};

const OFFENSIVE_REFUSAL_BIO: BioResponse = {
  bio: "My keyboard refuses to type that. Let's keep it classy? 🧐",
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
  
  // 1. LOCAL INPUT SAFETY CHECK (Split for better roasts)
  if (text) {
      if (OFFENSIVE_REGEX.test(text)) {
          console.warn("Safety Block: Offensive input detected.");
          return OFFENSIVE_REFUSAL_RIZZ;
      }
      if (SEXUAL_REGEX.test(text)) {
          console.warn("Safety Block: Sexual input detected.");
          return SEXUAL_REFUSAL_RIZZ;
      }
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Witty & Friendly';

  // --- MODEL SETTINGS FOR MAVERICK ---
  const COMPLETION_CONFIG = {
      model: LLAMA_MODEL,
      response_format: { type: "json_object" } as any,
      temperature: 1.4,       
      top_p: 0.9,             
      frequency_penalty: 0.1, 
      max_tokens: 800,
  };

  // BALANCED SAFETY SYSTEM PROMPT
  const SAFETY_SYSTEM_PROMPT = `
  You are a helpful, respectful dating coach.
  
  CRITICAL SAFETY GUIDELINES:
  1. STRICTLY PG-13. No explicit sexual content, nudity, severe profanity, violence, self-harm, drugs, or hate speech.
  
  2. STATUS DETERMINATION:
     - IF input is EXPLICITLY NSFW (porn, violence, hate): Set 'potentialStatus' to 'Blocked'.
     - IF input is MERELY FLIRTY, SUGGESTIVE, or contains MILD SLANG: Do NOT block. Generate a CLEAN, PG-13 response and set 'potentialStatus' to 'Talking' or 'Friendzoned'.
  
  3. CONTENT GENERATION:
     - DO NOT generate sexual, aggressive, or objectifying lines.
     - 'Chaotic' means silly, random, or dad-joke style. It MUST NOT be unhinged or creepy.
     - 'Tease' means playful banter. It MUST NOT be mean or bullying.
     
  4. IF BLOCKED (NSFW/OFFENSIVE INPUT):
     - If Sexual: Roast the user for being too horny. (e.g. "Horny jail.", "Sir this is a Wendy's")
     - If Offensive/Slur: Roast the user for being toxic. (e.g. "Touch grass.", "My filters just filed a restraining order.")
     - Fill 'tease', 'smooth', and 'chaotic' with these roasts.
  
  Output strictly valid JSON.
  `;

  // CASE 1: IMAGE PRESENT (Strictly Llama Maverick Vision)
  if (imageBase64) {
      console.log(`Using ${LLAMA_MODEL} for Image Analysis (Safe Mode)`);
      const mimeType = getMimeType(imageBase64);
      const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
      const imageUrl = `data:${mimeType};base64,${base64Data}`;

      const promptText = `
      CONTEXT: User uploaded an image (chat screenshot or profile).
      ${vibeInstruction}
      
      TASK: Analyze the image and provide 3 PG-13 replies (Tease, Smooth, Chaotic).
      
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

        // 2. OUTPUT SAFETY CHECK
        if (!isSafeText(parsed.tease) || !isSafeText(parsed.smooth) || !isSafeText(parsed.chaotic)) {
            console.warn("Safety Block: Unsafe output generated.");
            return SEXUAL_REFUSAL_RIZZ; // Default to sexual refusal if unsure
        }

        return parsed as RizzResponse;

      } catch (llamaError: any) {
        console.error(`Llama Vision (${LLAMA_MODEL}) failed:`, llamaError);
        return createErrorRizz(llamaError.message || `Llama (${LLAMA_MODEL}) Vision Failed`);
      }
  }

  // CASE 2: TEXT ONLY (Use Llama Maverick)
  else {
      console.log(`Using ${LLAMA_MODEL} for Text Rizz (Safe Mode)`);

      if (apiKey === 'dummy-key') {
          console.error("API Key missing.");
          return { ...createErrorRizz("System Error: Missing API Key"), analysis: "System Error: Missing API Key" };
      }
      
      const prompt = `
      CONTEXT: "${text}"
      ${vibeInstruction}
      
      TASK: Generate 3 PG-13 Rizz replies (Max 1 sentence each).
      
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
              console.warn("Safety Block: Unsafe output generated.");
              return SEXUAL_REFUSAL_RIZZ;
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
  // 1. LOCAL INPUT SAFETY CHECK (Split)
  if (text) {
      if (OFFENSIVE_REGEX.test(text)) return OFFENSIVE_REFUSAL_BIO;
      if (SEXUAL_REGEX.test(text)) return SEXUAL_REFUSAL_BIO;
  }

  console.log(`Using ${LLAMA_MODEL} for Bio`);

  if (apiKey === 'dummy-key') {
      return { ...createErrorBio("System Error: Missing API Key"), analysis: "System Error: Missing API Key" };
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Magnetic & Witty';
  
  const prompt = `
  About Me: "${text}"
  ${vibeInstruction}
  
  TASK: Write a PG-13 dating bio (max 150 chars). 
  Analysis: max 5 words explaining why it works.
  
  JSON Output:
  { "bio": "string", "analysis": "string" }
  `;

  try {
    const completion = await llamaClient.chat.completions.create({
        model: LLAMA_MODEL,
        messages: [
            { role: "system", content: "Role: Profile Optimizer. Style: Funny, short. STRICTLY PG-13. ZERO TOLERANCE for NSFW, violence, or profanity. If unsafe, return funny roast." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 1.4, 
        top_p: 0.9,
        frequency_penalty: 0.1,
        max_tokens: 800,
    });

    const content = completion.choices[0].message.content;
    const parsed = parseJSON(content);
    if (!parsed || !parsed.bio) return createErrorBio("Invalid JSON from Llama");

    // 2. OUTPUT SAFETY CHECK
    if (!isSafeText(parsed.bio)) {
        console.warn("Safety Block: Unsafe output generated.");
        return SEXUAL_REFUSAL_BIO;
    }

    return parsed as BioResponse;

  } catch (error: any) {
    console.error("Llama Bio Error:", error);
    return createErrorBio(error.message || "Llama API Error");
  }
};