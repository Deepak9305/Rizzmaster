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

// --- SAFETY CONFIGURATION (GOOGLE PLAY 16+ COMPLIANT) ---

// 1. HATE SPEECH / HARASSMENT / SEVERE TOXICITY
// Strictly prohibited. 
const HATE_SPEECH_REGEX = /\b(suicide|racist|faggot|retard|cripple|tranny|shemale|dyke|kike|nigger|nigga|chink|paki|wetback|rape|molest|incest|pedophile|pedo|bestiality|necrophilia)\b/i;

// 2. EXPLICIT / ILLEGAL CONTENT
// Blocks explicit sexual violence, hard drugs, and non-consensual content.
const EXPLICIT_REGEX = /\b(heroin|meth|fentanyl|cocaine|cp|child porn|sexual violence)\b/i;

const isSafeText = (text: string | undefined | null): boolean => {
    if (!text) return true;
    return !HATE_SPEECH_REGEX.test(text) && !EXPLICIT_REGEX.test(text);
};

// --- FALLBACK OBJECTS (RESPECTFUL REFUSALS) ---

// CASE A: EXPLICIT / ILLEGAL
const SEXUAL_REFUSAL_RIZZ: RizzResponse = {
  tease: "Let's keep it classy. ✨",
  smooth: "I focus on charm, not that.",
  chaotic: "Moving on to better topics... 🎬",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Content violates safety guidelines."
};

// CASE B: HATE SPEECH
const OFFENSIVE_REFUSAL_RIZZ: RizzResponse = {
  tease: "Kindness is more attractive.",
  smooth: "Let's keep the vibe positive.",
  chaotic: "Red flag detected. 🚩",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Hate speech detected."
};

const createErrorRizz = (msg: string): RizzResponse => ({
  tease: "The AI is taking a coffee break.",
  smooth: "Please try again in a moment.",
  chaotic: "System hiccup.",
  loveScore: 0,
  potentialStatus: "Error",
  analysis: msg.substring(0, 50) 
});

const SEXUAL_REFUSAL_BIO: BioResponse = {
  bio: "I can't write that. Let's try something wittier? 😅",
  analysis: "Safety violation 🚫"
};

const OFFENSIVE_REFUSAL_BIO: BioResponse = {
  bio: "Let's keep the bio positive and welcoming. ✨",
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
      if (EXPLICIT_REGEX.test(text)) {
          console.warn("Safety Block: Explicit content detected.");
          return SEXUAL_REFUSAL_RIZZ;
      }
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Witty, Charming, & Engaging';

  // --- MODEL SETTINGS ---
  const COMPLETION_CONFIG = {
      model: LLAMA_MODEL,
      response_format: { type: "json_object" } as any,
      temperature: 1.1, // Reduced slightly for more coherence/cleverness
      top_p: 0.95,             
      frequency_penalty: 0.3, 
      max_tokens: 800,
  };

  // GOOGLE PLAY 16+ COMPLIANT SYSTEM PROMPT
  const SAFETY_SYSTEM_PROMPT = `
  You are the Rizz Master, an expert dating coach specializing in witty, charming, and engaging conversation.
  
  YOUR MISSION: Ghostwrite clever, respectful, and effective replies for the user to send to their match.
  
  GUIDELINES (GOOGLE PLAY 16+):
  - **NO Explicit Sexual Content:** Avoid graphic descriptions or overt sexual aggression. Subtle, clever innuendo is acceptable if appropriate.
  - **NO Hate Speech or Harassment:** Zero tolerance for slurs, bullying, or threats.
  - **NO Illegal Acts:** Do not promote drugs, violence, or criminal behavior.
  - **TONE:** Witty, confident, respectful, and playful. Focus on building connection through humor and charm.
  
  GHOSTWRITER PROTOCOL:
  1. **DIRECT REPLIES ONLY.** Write the exact text to send. Do not add conversational filler.
  2. **CONTEXT:** The user received the input message. You are writing the response for them.
  
  CATEGORIES:
  - **'Tease' (Playful Banter):** Lighthearted teasing, challenging them playfully, or witty comebacks. Keep it friendly and flirtatious, never mean.
    *   *Ex:* "You're bad at replying." -> "I'm just playing hard to get, and clearly, it's working."
  - **'Smooth' (Charismatic):** Genuine compliments, poetic charm, or clever misdirection.
    *   *Ex:* "What are you doing?" -> "Just thinking about how to impress you. How am I doing so far?"
  - **'Chaotic' (Creative/Funny):** Unexpected humor, dad jokes, or absurd (but safe) scenarios to break the ice.
    *   *Ex:* "Tell me a secret." -> "I once waved at a stranger thinking they were waving at me. I still haven't recovered."
  
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
      
      TASK: Analyze the image. Write 3 witty and engaging responses.
      - If it's a chat, reply to the last message.
      - If it's a profile, compliment a specific detail or ask a relevant question.
      - Keep it respectful and clever.
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

        // 2. OUTPUT SAFETY CHECK
        if (!isSafeText(parsed.tease) || !isSafeText(parsed.smooth) || !isSafeText(parsed.chaotic)) {
            console.warn("Safety Block: Unsafe content in output.");
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
      - Focus on wit, charm, and humor. 
      - Avoid generic responses.
      
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
              console.warn("Safety Block: Unsafe content in output.");
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
      if (EXPLICIT_REGEX.test(text)) return SEXUAL_REFUSAL_BIO;
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
  - Style: Clever, engaging, and unique.
  - Use self-deprecating humor or confident charm.
  - NO explicit content.
  
  JSON Output:
  { "bio": "string", "analysis": "string" }
  `;

  try {
    const completion = await llamaClient.chat.completions.create({
        model: LLAMA_MODEL,
        messages: [
            { role: "system", content: "Role: Profile Optimizer. Style: Witty, short, high-status. 16+ compliant (No explicit content)." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 1.1, 
        top_p: 0.95,
        frequency_penalty: 0.3,
        max_tokens: 800,
    });

    const content = completion.choices[0].message.content;
    const parsed = parseJSON(content);
    if (!parsed || !parsed.bio) return createErrorBio("Invalid JSON from Llama");

    // 2. OUTPUT SAFETY CHECK
    if (!isSafeText(parsed.bio)) {
        console.warn("Safety Block: Unsafe output.");
        return OFFENSIVE_REFUSAL_BIO;
    }

    return parsed as BioResponse;

  } catch (error: any) {
    console.error("Llama Bio Error:", error);
    return createErrorBio(error.message || "Llama API Error");
  }
};