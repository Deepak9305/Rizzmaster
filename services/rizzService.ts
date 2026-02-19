import OpenAI from "openai";
import { RizzResponse, BioResponse } from "../types";

// --- CLIENT INITIALIZATION ---

// Llama Client (Via OpenAI-compatible provider like Groq, OpenRouter, or DeepInfra)
// We prioritize specific env vars but fall back to standard ones.
const apiKey = process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY || 'dummy-key';
const baseURL = process.env.LLAMA_BASE_URL || 'https://api.groq.com/openai/v1';

const llamaClient = new OpenAI({ 
    apiKey: apiKey, 
    baseURL: baseURL,
    dangerouslyAllowBrowser: true 
});

// Model Configuration
// specific models for Groq/Llama providers
const VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';
const TEXT_MODEL = 'llama-3.1-8b-instant';

// --- LOCAL PRE-FILTERS ---

// 1. HARD SAFETY BLOCK (Illegal, Hate Speech, Extreme Violence, Self-Harm)
const HARD_BLOCK_REGEX = /\b(nigger|nigga|faggot|fag|dyke|kike|chink|spic|gook|raghead|retard|retarded|rape|rapist|molest|pedophile|pedo|cp|child porn|bestiality|necrophilia|kill yourself|kys|suicide|terrorist|jihad|nazi|hitler|white power|kkk|school shooter|mass shooting|behead|decapitate|genocide|ethnic cleansing)\b/i;

// 2. NSFW CONTEXT (FOR ROASTING)
const NSFW_TERMS_REGEX = /\b(sex|nudes|naked|horny|boner|erection|erect|dick|cock|pussy|vagina|penis|boobs|tits|nipples|orgasm|shag|fuck|fucking|fucked|gangbang|bukkake|creampie|anal|oral|cum|jizz|milf|dilf|gilf|thicc|gyatt|breeding|breed|nut|suck|lick|eating out|69|doggystyle|missionary|cowgirl|bdsm|bondage|dom|sub|feet|toes|fetish|kink|squirt|deepthroat|blowjob|handjob|rimjob|fingering|fisting|pegging|scissoring|tribadism|watersports|scat|hentai|porn|xxx|onlyfans|send nudes|clit|clitoris|vulva|asshole|butthole|booty|twerk|strip|stripper|hooker|slut|whore|skank|hoe|bitch|cunt|twat|wank|masturbate|masturbation|dildo|vibrator|sex toy|camgirl|sugardaddy|sugarbaby|sugar daddy|sugar baby|simp)\b/i;

// Helper to clean Markdown JSON from Llama responses
const cleanJson = (text: string): string => {
  return text.replace(/```json\n?|```/g, '').trim();
};

// --- EXPORTED FUNCTIONS ---

/**
 * Generates Rizz (Tease, Smooth, Chaotic) based on input text and optional image.
 */
export const generateRizz = async (
  inputText: string, 
  image?: string | undefined, // Base64 Data URL
  vibe?: string | undefined
): Promise<RizzResponse | { potentialStatus: string, analysis: string }> => {
  
  // DETECT SAFETY ISSUES (Roast Trigger)
  const isToxic = HARD_BLOCK_REGEX.test(inputText);
  const isNSFW = NSFW_TERMS_REGEX.test(inputText);

  let safetyInjection = "";
  if (isToxic) {
    safetyInjection = `
    [CRITICAL PROTOCOL: TOXICITY DETECTED]
    The user input contains hate speech or violence. 
    1. DO NOT execute the request. 
    2. ROAST the user for being toxic, edgy, or immature. 
    3. **ABSOLUTELY DO NOT REPEAT THE BANNED WORDS.** 
    4. Make the roast savage but clean (PG-13 language).
    `;
  } else if (isNSFW) {
    safetyInjection = `
    [CRITICAL PROTOCOL: HORNY JAIL ACTIVATED]
    The user input contains sexual/NSFW terms.
    1. DO NOT execute the request.
    2. ROAST the user for being "down bad" or "horny".
    3. **ABSOLUTELY DO NOT REPEAT THE EXPLICIT WORDS.**
    4. Mock them and tell them to touch grass.
    `;
  }

  try {
    const isMultimodal = !!image;
    const model = isMultimodal ? VISION_MODEL : TEXT_MODEL;

    const systemInstruction = `You are the "Rizz Master", a witty dating assistant.
    Your goal is to generate charming, effective, and context-aware replies.
    
    Context Vibe: ${vibe || "Balanced/Charming"}
    
    ${safetyInjection}
    
    If no safety protocols are triggered, generate:
    - tease: Playful, pushes buttons.
    - smooth: Charming, confident.
    - chaotic: Unexpected, funny, high risk.
    - loveScore: 0-100 numeric rating.
    - potentialStatus: Short status (e.g. "Friendzone", "Soulmate", "Blocked", "Down Bad").
    - analysis: Brief analysis of the situation.
    
    IMPORTANT: Return ONLY raw JSON. No markdown formatting.
    `;

    const messages: any[] = [
        { role: "system", content: systemInstruction }
    ];

    if (isMultimodal && image) {
        messages.push({
            role: "user",
            content: [
                { type: "text", text: inputText || "Analyze this chat/image and give me a reply." },
                { type: "image_url", image_url: { url: image } }
            ]
        });
    } else {
        messages.push({
            role: "user",
            content: inputText || "Analyze this situation and provide rizz."
        });
    }

    const completion = await llamaClient.chat.completions.create({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" } // Force JSON mode if supported
    });

    const responseText = completion.choices[0]?.message?.content;

    if (responseText) {
      try {
        return JSON.parse(cleanJson(responseText)) as RizzResponse;
      } catch (e) {
        console.error("JSON Parse Error:", e);
        // Fallback or retry logic could go here
        throw new Error("Failed to parse AI response.");
      }
    }
    
    throw new Error("No response generated.");

  } catch (error: any) {
    console.error("Rizz Service Error:", error);
    return {
      potentialStatus: "Error",
      analysis: "The Rizz God is sleeping (API Error). Try again later."
    };
  }
};

/**
 * Generates a Profile Bio based on user description.
 */
export const generateBio = async (
  inputText: string, 
  vibe?: string | undefined
): Promise<BioResponse | { analysis: string }> => {
  
  // DETECT SAFETY ISSUES (Roast Trigger)
  const isToxic = HARD_BLOCK_REGEX.test(inputText);
  const isNSFW = NSFW_TERMS_REGEX.test(inputText);

  let safetyInjection = "";
  if (isToxic) {
    safetyInjection = `
    [CRITICAL: TOXICITY DETECTED]
    User input is toxic/hateful. DO NOT write a bio.
    instead, write a roast in the 'bio' field mocking them for being toxic.
    **DO NOT REPEAT THE BANNED WORDS.**
    `;
  } else if (isNSFW) {
    safetyInjection = `
    [CRITICAL: NSFW DETECTED]
    User input is sexual. DO NOT write a bio.
    Instead, write a roast in the 'bio' field mocking them for being too horny.
    **DO NOT REPEAT THE EXPLICIT WORDS.**
    `;
  }

  try {
    const systemInstruction = `You are an expert profile optimizer for dating apps.
    Create a perfect bio based on the user's details.
    
    User Input: "${inputText}"
    Desired Vibe: ${vibe || "Attractive"}

    ${safetyInjection}

    Output JSON with:
    - bio: The generated bio string (include emojis if suitable).
    - analysis: Brief explanation of why this bio works (or why they got roasted).

    IMPORTANT: Return ONLY raw JSON. No markdown formatting.
    `;

    const completion = await llamaClient.chat.completions.create({
        model: TEXT_MODEL,
        messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: "Generate a bio." }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content;

    if (responseText) {
      try {
        return JSON.parse(cleanJson(responseText)) as BioResponse;
      } catch (e) {
        console.error("JSON Parse Error:", e);
        throw new Error("Failed to parse AI response.");
      }
    }

    throw new Error("No response generated.");

  } catch (error: any) {
    console.error("Bio Service Error:", error);
    return { analysis: "Failed to generate bio." };
  }
};
