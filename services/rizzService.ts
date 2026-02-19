
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
// Text: Llama 3.1 8B Instant (Fast, Smart, Uncensored-friendly)
// Vision: Llama 4 Scout (High fidelity image understanding)
const VISION_MODEL = process.env.GENERATION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const TEXT_MODEL = 'llama-3.1-8b-instant';

// --- LOCAL PRE-FILTERS ---

// 1. HATE SPEECH (STRICT BLOCK)
// We never allow hate speech, racial slurs, or encouragement of self-harm.
const HATE_SPEECH_REGEX = /\b(suicide|kill yourself|kys|self-harm|die|racist|faggot|fag|retard|retarded|cripple|tranny|shemale|dyke|kike|nigger|nigga|negro|chink|paki|wetback|beaner|gook|raghead|terrorist|jihad|lynch|rape|molest|incest|pedophile|pedo|bestiality|necrophilia|hitler|nazi|white power|kkk|coon|spic|jungle bunny|porch monkey|sand nigger|towelhead|camel jockey|ching chong|dog eater|zipperhead|kraut|mick|wop|yid|heeb|abomination|sodomite|batty boy|chi chi man|fudge packer|pillow biter|rug muncher|carpet muncher|mong|spastic|window licker)\b/i;

// 2. EXPLICIT CONTENT (STRICT PG-13 FILTER)
// Block hardcore pornography terms AND overt sexual slang.
// We ALLOW: damn, hell, ass, shit (Mild Swearing).
// We BLOCK: sex, nudes, genitals, sexual acts.
const EXPLICIT_REGEX = /\b(heroin|meth|fentanyl|cocaine|crack|cp|child porn|sexual violence|gangbang|cunt|anal|oral|cum|sperm|jizz|bukkake|creampie|blowjob|handjob|rimjob|hentai|masturbate|dildo|vibrator|bdsm|fetish|milf|dilf|onlyfans|whore|clit|clitoris|deepthroat|scissoring|tribadism|anilingus|cunnilingus|fellatio|sodomy|buggery|pederasty|hebephilia|ephebophilia|gerontophilia|urolagnia|coprophilia|scat|water sports|golden shower|pearl necklace|facial|titty fuck|tit fuck|boob fuck|paizuri|glory hole|dogging|cuckold|cuck|incel|femcel|sex|nude|nudes|naked|horny|boner|erection|erect|dick|cock|pussy|vagina|penis|boobs|tits|nipples|orgasm|shag|fuck|fucking|fucked)\b/i;

// --- FALLBACK OBJECTS ---

const BLOCKED_RIZZ: RizzResponse = {
  tease: "Whoa there, cowboy. 🤠",
  smooth: "My safety filters are blushing. 😳",
  chaotic: "Go to horny jail. BONK. 🔨",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Too spicy for the App Store."
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
 * CHECK OUTPUT SAFETY (REGEX ONLY)
 * Output is checked only against the Regex blocklist to allow for "edgy" humor 
 * that might trip the strict API filters.
 */
const checkOutputSafety = (text: string): boolean => {
    return !HATE_SPEECH_REGEX.test(text) && !EXPLICIT_REGEX.test(text);
};

/**
 * CHECK INPUT SAFETY (REGEX ONLY)
 * Removed Guard API. Input is checked strictly by local regex to prevent jailbreaks.
 */
const checkInputSafety = (text: string): boolean => {
    if (HATE_SPEECH_REGEX.test(text) || EXPLICIT_REGEX.test(text)) {
        console.warn("Input Block: Regex detected violation.");
        return false;
    }
    return true;
};

/**
 * GENERATE RIZZ
 */
export const generateRizz = async (text: string, imageBase64?: string, vibe?: string): Promise<RizzResponse> => {
  
  // 1. INPUT SAFETY CHECK (Regex Only)
  if (text) {
      const isSafe = checkInputSafety(text);
      if (!isSafe) return BLOCKED_RIZZ;
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Unpredictable, Witty, & High-Status';

  // --- GENERATION SETTINGS ---
  const COMPLETION_CONFIG = {
      response_format: { type: "json_object" } as any,
      temperature: 0.85, // Lowered to reduce hallucinations/chaos
      top_p: 0.95,             
      frequency_penalty: 0.3, 
      max_tokens: 800,
  };

  // ENHANCED SYSTEM PROMPT FOR STRICT PG-13 HUMOR
  const CREATIVE_SYSTEM_PROMPT = `
  You are the Rizz Master, a chaotic good dating coach and stand-up comedian.
  
  YOUR MISSION: Ghostwrite the funniest, sharpest, most engaging replies for the user.
  
  RATING: PG-13 (STRICTLY SAFE)
  - **Allowed:** Mild swearing (damn, hell, ass, shit), flirting, roasting, sarcasm, witty banter.
  - **Strictly Banned:** Overt sexual content, sexual acts, genitals, nudity, hate speech, violence.
  
  STYLE GUIDE (The "Meta" Vibe):
  - **Brainrot:** Use subtle Gen Z slang (cooked, aura, cringe, based, down bad) but don't overdo it.
  - **Lowercase Aesthetic:** Write like a text message (lowercase, minimal punctuation).
  - **Status:** Be confident. Frame the user as the prize.
  - **No NPC Energy:** If the input is "hey", destroy them. If the input is boring, roast them.
  
  CATEGORIES:
  - **'Tease' (The Roast):** Playful bullying. Treat them like a bratty sibling. Be mean but funny.
  - **'Smooth' (The Charm):** Slick, confident, romantic but NOT sexual.
  - **'Chaotic' (The Wildcard):** Unhinged, random, delusional. "I'm already planning our wedding/divorce."
  
  Output strictly valid JSON.
  `;

  // CASE 1: IMAGE PRESENT -> Use VISION_MODEL (Scout)
  if (imageBase64) {
      console.log(`Using Vision Model: ${VISION_MODEL}`);
      const mimeType = getMimeType(imageBase64);
      const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
      const imageUrl = `data:${mimeType};base64,${base64Data}`;

      const promptText = `
      CONTEXT: User uploaded an image (chat screenshot or profile).
      ${vibeInstruction}
      
      TASK: Analyze the image. Write 3 hilarious/witty replies.
      - If chat: Reply to the last message with maximum rizz.
      - If profile: Roast a specific detail or compliment them suspiciously.
      - Make it punchy. No essays.
      - KEEP IT PG-13. NO SEXUAL COMMENTS.
      
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

        // 2. OUTPUT SAFETY CHECK (Regex Only)
        const combinedOutput = `${parsed.tease} ${parsed.smooth} ${parsed.chaotic} ${parsed.analysis}`;
        const isOutputSafe = checkOutputSafety(combinedOutput);
        
        if (!isOutputSafe) {
            return BLOCKED_RIZZ;
        }

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
      INPUT MESSAGE (The message the user received): "${text}"
      ${vibeInstruction}
      
      TASK: Write 3 Rizz replies for the user to send back.
      - ACT AS THE USER replying to this message.
      - DIRECT REPLIES ONLY.
      - Make it hilarious. If they are boring, roast them.
      - Be creative. Avoid generic lines.
      - KEEP IT PG-13. NO SEXUAL COMMENTS.
      
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

          // 2. OUTPUT SAFETY CHECK (Regex Only)
          const combinedOutput = `${parsed.tease} ${parsed.smooth} ${parsed.chaotic} ${parsed.analysis}`;
          const isOutputSafe = checkOutputSafety(combinedOutput);

          if (!isOutputSafe) {
              return BLOCKED_RIZZ;
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
  // 1. INPUT SAFETY CHECK (Regex Only)
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
  - Make it stand out. 
  - Use self-deprecating humor, confident absurdity, or "red flag" jokes.
  - Avoid clichés like "I love travel". Be specific.
  - KEEP IT PG-13.
  
  JSON Output:
  { "bio": "string", "analysis": "string" }
  `;

  try {
    const completion = await llamaClient.chat.completions.create({
        model: TEXT_MODEL,
        messages: [
            { role: "system", content: "Role: Profile Optimizer. Style: Hilarious, short, high-status. Rating: PG-13 (Strictly Safe). Be creative but strictly allow NO sexual content." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 0.85, 
        top_p: 0.95,
        frequency_penalty: 0.2,
        max_tokens: 800,
    });

    const content = completion.choices[0].message.content;
    const parsed = parseJSON(content);
    if (!parsed || !parsed.bio) return createErrorBio("Invalid JSON from Generation Model");

    // 2. OUTPUT SAFETY CHECK (Regex Only)
    const combinedOutput = `${parsed.bio} ${parsed.analysis}`;
    const isOutputSafe = checkOutputSafety(combinedOutput);

    if (!isOutputSafe) {
        return BLOCKED_BIO;
    }

    return parsed as BioResponse;

  } catch (error: any) {
    console.error("Llama Bio Error:", error);
    return createErrorBio(error.message || "Llama API Error");
  }
};
