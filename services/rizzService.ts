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

// STRICT ANTI-NSFW REGEX
// Filters out sexual content, hate speech, drugs, violence, and severe profanity.
// Note: "acid", "pills", "slave", "dom", "sub" omitted to avoid common false positives (e.g., "acidic", "submarine"), handled by context in System Prompt instead.
const UNSAFE_REGEX = /\b(nude|naked|sex|porn|xxx|fetish|bdsm|kill|suicide|murder|drug|cocaine|heroin|meth|whore|slut|rape|molest|incest|dick|cock|pussy|vagina|boobs|tits|asshole|clit|cum|jizz|boner|erection|horny|aroused|orgasm|penis|breasts|nipples|genitals|intercourse|blowjob|handjob|rimjob|anal|oral|69|doggy|missionary|cowgirl|weed|cannabis|marijuana|overdose|fentanyl|lsd|shrooms|mdma|molly|ecstacy|racist|faggot|retard|cripple|tranny|shemale|dyke|kike|nigger|nigga|chink|paki|wetback|cunt|twat|wank|prick|skank|hoe|hooker|prostitute|stripper|escort|camgirl|onlyfans|milf|dilf|bbw|thot|incel|pedophile|pedo|grope|fondle|lust|fuck|shit|bitch|bastard)\b/i;

const isSafeText = (text: string | undefined | null): boolean => {
    if (!text) return true;
    return !UNSAFE_REGEX.test(text);
};

// --- FALLBACK OBJECTS ---
const SAFE_REFUSAL_RIZZ: RizzResponse = {
  tease: "I can't generate that due to strict safety guidelines.",
  smooth: "Let's keep the conversation respectful and PG-13.",
  chaotic: "My safety filters blocked this request.",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Safety Policy Violation"
};

const createErrorRizz = (msg: string): RizzResponse => ({
  tease: "The AI encountered an error.",
  smooth: "Please try again later.",
  chaotic: "System hiccup.",
  loveScore: 0,
  potentialStatus: "Error",
  analysis: msg.substring(0, 50) // Keep it concise for UI
});

const SAFE_REFUSAL_BIO: BioResponse = {
  bio: "Content blocked. Please ensure your request is PG-13 and free of explicit material.",
  analysis: "Safety Policy Violation"
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
  if (!isSafeText(text)) {
      console.warn("Safety Block: Unsafe input detected.");
      return SAFE_REFUSAL_RIZZ;
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Witty & Friendly';

  // --- MODEL SETTINGS FOR MAVERICK ---
  const COMPLETION_CONFIG = {
      model: LLAMA_MODEL,
      response_format: { type: "json_object" } as any,
      temperature: 1.0,       // Conservative temp for safety
      top_p: 0.9,             
      frequency_penalty: 0.1, 
      max_tokens: 350,
  };

  // ZERO TOLERANCE SYSTEM PROMPT
  const SAFETY_SYSTEM_PROMPT = `
  You are a helpful, respectful dating coach.
  
  CRITICAL SAFETY GUIDELINES (ZERO TOLERANCE):
  1. STRICTLY PG-13. ABSOLUTELY NO sexually explicit content, nudity, sexual innuendo, severe profanity, violence, self-harm, drugs, or hate speech.
  2. If the user input contains ANY sexual references (even mild), insults, harassment, or controversial topics, output 'potentialStatus' as 'Blocked' and 'analysis' as 'Safety Violation'.
  3. DO NOT generate pickup lines that are sexual, aggressive, or objectifying.
  4. 'Chaotic' means silly, random, or dad-joke style. It MUST NOT be unhinged, dangerous, or creepy.
  5. 'Tease' means playful, friendly banter. It MUST NOT be mean, bullying, or derogatory.
  6. Avoid words like "hot", "sexy", "babe" if they can be construed as objectifying. Use "cute", "charming", "lovely" instead.
  
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
            return SAFE_REFUSAL_RIZZ;
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
      1. Tease (Playful/Light Roast)
      2. Smooth (Charming/Complimentary)
      3. Chaotic (Silly/Dad Joke/Random)
      
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
              return SAFE_REFUSAL_RIZZ;
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
  if (!isSafeText(text)) {
      console.warn("Safety Block: Unsafe input detected.");
      return SAFE_REFUSAL_BIO;
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
            { role: "system", content: "Role: Profile Optimizer. Style: Funny, short. STRICTLY PG-13. ZERO TOLERANCE for NSFW, violence, or profanity. JSON Only." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 1.0, 
        top_p: 0.9,
        frequency_penalty: 0.1,
        max_tokens: 200,
    });

    const content = completion.choices[0].message.content;
    const parsed = parseJSON(content);
    if (!parsed || !parsed.bio) return createErrorBio("Invalid JSON from Llama");

    // 2. OUTPUT SAFETY CHECK
    if (!isSafeText(parsed.bio)) {
        console.warn("Safety Block: Unsafe output generated.");
        return SAFE_REFUSAL_BIO;
    }

    return parsed as BioResponse;

  } catch (error: any) {
    console.error("Llama Bio Error:", error);
    return createErrorBio(error.message || "Llama API Error");
  }
};