
import OpenAI from "openai";
import { RizzResponse, BioResponse } from "../types";

// --- CLIENT INITIALIZATION ---

// Llama Client (Sole Provider)
const llamaApiKey = process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY;
const llamaClient = llamaApiKey ? new OpenAI({ 
    apiKey: llamaApiKey, 
    baseURL: process.env.LLAMA_BASE_URL || 'https://api.groq.com/openai/v1',
    dangerouslyAllowBrowser: true 
}) : null;

// Model Configuration
const VISION_MODEL = process.env.GENERATION_MODEL || 'meta-llama/llama-3.2-11b-vision-preview'; // Updated to 3.2 Vision
const TEXT_MODEL = 'llama-3.3-70b-versatile'; // Stronger instruction following

// --- LOCAL PRE-FILTERS ---

const ILLEGAL_AND_HATE_REGEX = /\b(suicide|kill yourself|kys|self-harm|die|racist|faggot|fag|retard|retarded|cripple|tranny|shemale|dyke|kike|nigger|nigga|negro|chink|paki|wetback|beaner|gook|raghead|terrorist|jihad|lynch|rape|molest|incest|pedophile|pedo|bestiality|necrophilia|hitler|nazi|white power|kkk|coon|spic|jungle bunny|cp|child porn|sexual violence|hebephilia|ephebophilia|gerontophilia)\b/i;

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

// --- HELPER FUNCTIONS ---

const parseJSON = (text: string | null | undefined): any => {
  if (!text) return null;
  let cleaned = text.trim();
  cleaned = cleaned.replace(/```json/gi, '').replace(/```/g, '').trim();
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

const checkInputSafety = (text: string): boolean => {
    if (ILLEGAL_AND_HATE_REGEX.test(text) || HARDCORE_REGEX.test(text)) {
        console.warn("Input Block: Regex detected severe violation.");
        return false;
    }
    return true;
};

const PROMPT_TEMPLATE = `
You are the Rizz Master.

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

// --- GENERATION FUNCTIONS ---

export const generateRizz = async (text: string, imageBase64?: string, vibe?: string): Promise<RizzResponse> => {
  
  if (text && !checkInputSafety(text)) return BLOCKED_RIZZ;

  if (!llamaClient) {
      return createErrorRizz("Llama API Key missing. Please configure VITE_GROQ_API_KEY.");
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Witty & High-Status';
  const promptContent = `INPUT: "${text}"\n${vibeInstruction}\nTASK: Write 3 Rizz replies. If input is sexual/horny, ROAST THE USER.`;

  try {
        console.log(`Attempting Llama Generation...`);
        const messages: any[] = [{ role: "system", content: PROMPT_TEMPLATE }];
        
        if (imageBase64) {
            messages.push({
                role: "user",
                content: [
                    { type: "text", text: `CONTEXT: Image Uploaded.\n${promptContent}` },
                    { type: "image_url", image_url: { url: imageBase64 } } // Ensure full data URI is passed
                ]
            });
        } else {
            messages.push({ role: "user", content: promptContent });
        }

        const completion = await llamaClient.chat.completions.create({
            model: imageBase64 ? VISION_MODEL : TEXT_MODEL,
            messages: messages,
            response_format: { type: "json_object" },
            temperature: 0.7,
            max_tokens: 800
        });

        const parsed = parseJSON(completion.choices[0].message.content);
        if (parsed && parsed.tease) return parsed as RizzResponse;
        
        return createErrorRizz("Received invalid JSON from Llama.");

  } catch (e: any) {
        console.error("Llama Generation Failed:", e);
        // Return the actual error message so you can debug
        return createErrorRizz(e.message || "Llama Generation Failed");
  }
};

export const generateBio = async (text: string, vibe?: string): Promise<BioResponse> => {
  if (text && !checkInputSafety(text)) return BLOCKED_BIO;

  if (!llamaClient) {
    return createErrorBio("Llama API Key missing. Please configure VITE_GROQ_API_KEY.");
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Magnetic & Witty';
  const promptContent = `About Me: "${text}"\n${vibeInstruction}\nTASK: Write a dating bio (max 150 chars). SAFETY: If sexual/NSFW, ROAST the user in the bio field.`;

  const BIO_SYSTEM_PROMPT = `
  Role: Profile Optimizer. Rating: PG-13. 
  STRICTLY NO NSFW. If user asks for NSFW, roast them in the JSON output.
  JSON Output format: { "bio": "string", "analysis": "string" }
  `;

  try {
    const completion = await llamaClient.chat.completions.create({
        model: TEXT_MODEL,
        messages: [
            { role: "system", content: BIO_SYSTEM_PROMPT },
            { role: "user", content: promptContent }
        ],
        response_format: { type: "json_object" },
        temperature: 0.7,
    });
    const parsed = parseJSON(completion.choices[0].message.content);
    if (parsed && parsed.bio) return parsed as BioResponse;
    return createErrorBio("Received invalid JSON from Llama.");
  } catch (e: any) {
    console.error("Llama Bio Failed:", e);
    return createErrorBio(e.message || "Llama Bio Failed");
  }
};
