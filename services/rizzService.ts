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
const HARD_BLOCK_REGEX = /\b(nigger|nigga|negro|coon|faggot|fag|dyke|kike|chink|spic|gook|raghead|towelhead|retard|retarded|mongoloid|tranny|shemale|hermaphrodite|rape|rapist|molest|molester|pedophile|pedo|hebephile|ephebophile|cp|child porn|bestiality|zoophilia|necrophilia|incest|kill yourself|kys|suicide|self-harm|terrorist|jihad|isis|taliban|nazi|hitler|holocaust|white power|white supremacy|kkk|school shooter|mass shooting|bomb|behead|decapitate|mutilate|genocide|ethnic cleansing|slave|slavery|lynch|lynching)\b/i;

// 2. NSFW CONTEXT (FOR ROASTING)
// Note: The AI will also catch variations like "booooobbbsss" even if regex misses them.
// Added 'bobs' and 'vagene' to catch collapsed obfuscations.
const NSFW_TERMS_REGEX = /\b(sex|boobs|boobbeessss|bobs|vagene|breast|breasts|nudes|nipple|nipples|naked|nude|horny|aroused|boner|erection|erect|hard-on|dick|cock|pussy|vagina|penis|boobs|tits|titties|nipples|areola|orgasm|climax|shag|fuck|fucking|fucked|fucker|motherfucker|gangbang|bukkake|creampie|anal|oral|cum|jizz|semen|sperm|load|milf|dilf|gilf|thicc|gyatt|bussy|breeding|breed|nut|suck|lick|eating out|69|doggystyle|missionary|cowgirl|reverse cowgirl|bdsm|bondage|dom|sub|dominatrix|feet|toes|fetish|kink|squirt|gushing|deepthroat|blowjob|handjob|rimjob|fingering|fisting|pegging|scissoring|tribadism|watersports|scat|golden shower|hentai|porn|pornography|xxx|adult movie|onlyfans|fansly|send nudes|clit|clitoris|vulva|labia|asshole|butthole|anus|rectum|booty|butt|ass|twerk|strip|stripper|hooker|prostitute|escort|slut|whore|skank|hoe|bitch|cunt|twat|wank|jerking off|jacking off|masturbate|masturbation|dildo|vibrator|sex toy|fleshlight|strap-on|camgirl|sugardaddy|sugarbaby|sugar daddy|sugar baby|simp|incel|virgin|cuck|cuckold|schlong|dong|knob|bellend|prick|chode|taint|gooch|perineum|ballbag|scrotum|nutsack|gonads|foreskin|smegma|felching|docking|sounding|snowballing|tea bag|motorboat|queef|rusty trombone|dirty sanchez|alabama hot pocket|cleveland steamer|wanker|tosser|bugger|sod|slag|tart|strumpet|harlot|bimbo|himbo|yiff|furry|futa|futanari|yaoi|yuri|ecchi|bara|erotic|erotica|sensual|genitalia|groin|crotch|loins|pubes|pubic|phallic|yoni|lingam|coitus|copulate|copulation|fornicate|fornication|sodomy|buggery|pederasty|onanism|autoerotic|frottage|voyeur|exhibitionist|nympho|nymphomaniac|satyr|glory hole|gloryhole|blue waffle|lemon party|tubgirl|goatse|meatspin|2 girls 1 cup|rule 34|r34|paizuri|ahegao|netorare|ntr)\b/i;

// Helper to clean Markdown JSON from Llama responses
const cleanJson = (text: string): string => {
  return text.replace(/```json\n?|```/g, '').trim();
};

// Helper to sanitize output text (Post-Processing)
const sanitizeText = (text: string): string => {
  if (!text) return text;
  // Create global versions for replacement
  const hardBlockGlobal = new RegExp(HARD_BLOCK_REGEX.source, 'gi');
  const nsfwGlobal = new RegExp(NSFW_TERMS_REGEX.source, 'gi');
  
  return text
    .replace(hardBlockGlobal, "🤬") // Replace hate/violence with Angry Face
    .replace(nsfwGlobal, "🫣");     // Replace NSFW with Peeking Face
};

// Helper to recursively sanitize response object
const sanitizeResponse = <T>(data: T): T => {
  if (typeof data === 'string') {
    return sanitizeText(data) as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeResponse(item)) as unknown as T;
  }
  if (typeof data === 'object' && data !== null) {
    const sanitizedObj: any = {};
    for (const key in data) {
      sanitizedObj[key] = sanitizeResponse((data as any)[key]);
    }
    return sanitizedObj as T;
  }
  return data;
};

// Helper to check for repeated character obfuscation (e.g. "bboooobbbsss")
const hasObfuscatedNSFW = (text: string): boolean => {
    // Collapse repeated characters to single char (e.g. "booooobs" -> "bobs", "sexx" -> "sex")
    const collapsed = text.toLowerCase().replace(/(.)\1+/g, '$1');
    // Check if the collapsed version contains triggers
    return NSFW_TERMS_REGEX.test(collapsed);
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
  
  // DETECT SAFETY ISSUES
  const isToxic = HARD_BLOCK_REGEX.test(inputText);
  const isNSFW = NSFW_TERMS_REGEX.test(inputText) || hasObfuscatedNSFW(inputText);
  
  // BRANCHING LOGIC: If unsafe, we completely switch personas.
  const isUnsafe = isToxic || isNSFW;
  
  let systemInstruction = "";

  if (isUnsafe) {
      // --- ROAST MASTER PERSONA ---
      // We instruct the model to abandon 'Rizz' and switch to 'Roast'
      // The keys 'tease', 'smooth', 'chaotic' must be preserved for JSON validity,
      // but their content will be replaced by life-choice roasts.
      
      systemInstruction = `
      CRITICAL OVERRIDE: SAFETY PROTOCOL TRIGGERED.
      
      IDENTITY: You are the "Roast Master" (a disappointed parent / reality check bot).
      The user has submitted text that is Toxic, Horny, Seductive, or NSFW.
      
      YOUR TASK:
      1. IGNORE the user's request for seduction or validation. Do NOT play along.
      2. ROAST the user for their life choices instead.
      3. Focus on: Unemployment, being single, spending too much time online, living in a basement, "touching grass".
      
      STRICT CONSTRAINTS:
      - **DO NOT** use any explicit, sexual, or banned words. Keep it PG-13.
      - **DO NOT** repeat the user's input words (especially if they are misspelled explicit words like "boooobs").
      - **DO NOT** give dating advice.
      
      JSON OUTPUT FORMAT (Override the meanings):
      - tease: A light roast about their social skills.
      - smooth: A sarcastic comment about their unemployment.
      - chaotic: A brutal reality check about their employment status.
      - loveScore: Return 0.
      - potentialStatus: "Blocked".
      - analysis: A short sentence explaining why they need to get a job instead of doing this.
      
      IMPORTANT: Return ONLY raw JSON. No markdown.
      `;
  } else {
      // --- RIZZ MASTER PERSONA (Normal Operation) ---
      systemInstruction = `
      You are the "Rizz Master", a witty dating assistant.
      Your goal is to generate charming, effective, and context-aware replies.
      
      Context Vibe: ${vibe || "Balanced/Charming"}
      
      Generate a JSON object with:
      - tease: Playful, pushes buttons.
      - smooth: Charming, confident.
      - chaotic: Unexpected, funny.
      - loveScore: 0-100 numeric rating.
      - potentialStatus: Short status (e.g. "Friendzone", "Soulmate").
      - analysis: Brief analysis of the situation.
      
      IMPORTANT: Return ONLY raw JSON. No markdown.
      `;
  }

  try {
    const isMultimodal = !!image;
    const model = isMultimodal ? VISION_MODEL : TEXT_MODEL;

    const messages: any[] = [
        { role: "system", content: systemInstruction }
    ];

    if (isMultimodal && image) {
        messages.push({
            role: "user",
            content: [
                { type: "text", text: inputText || "Analyze this." },
                { type: "image_url", image_url: { url: image } }
            ]
        });
    } else {
        messages.push({
            role: "user",
            content: inputText || "Generate rizz."
        });
    }

    const completion = await llamaClient.chat.completions.create({
        model: model,
        messages: messages,
        temperature: 0.7,
        max_tokens: 800,
        response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content;

    if (responseText) {
      try {
        const rawData = JSON.parse(cleanJson(responseText));
        return sanitizeResponse(rawData) as RizzResponse;
      } catch (e) {
        console.error("JSON Parse Error:", e);
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
  
  const isToxic = HARD_BLOCK_REGEX.test(inputText);
  const isNSFW = NSFW_TERMS_REGEX.test(inputText) || hasObfuscatedNSFW(inputText);
  const isUnsafe = isToxic || isNSFW;

  let systemInstruction = "";

  if (isUnsafe) {
      // --- ROAST MASTER PERSONA (BIO MODE) ---
      systemInstruction = `
      CRITICAL OVERRIDE: SAFETY PROTOCOL TRIGGERED.
      
      The user is asking for a bio using NSFW/Toxic/Seductive terms.
      
      YOUR TASK:
      1. REFUSE to write a dating bio.
      2. Instead, write a ROAST in the 'bio' field.
      3. Topic: Their lack of employment, their "down bad" behavior, or need to touch grass.
      
      STRICT RULES:
      - Keep it PG-13.
      - Do NOT repeat the explicit words.
      - Be sarcastic and brutally honest about their life choices.
      
      JSON OUTPUT FORMAT:
      - bio: The roast message.
      - analysis: "Profile rejected due to thirst/toxicity."
      
      IMPORTANT: Return ONLY raw JSON.
      `;
  } else {
      // --- NORMAL BIO GENERATION ---
      systemInstruction = `
      You are an expert profile optimizer for dating apps.
      Create a perfect bio based on the user's details.
      
      User Input: "${inputText}"
      Desired Vibe: ${vibe || "Attractive"}
  
      Output JSON with:
      - bio: The generated bio string (include emojis if suitable).
      - analysis: Brief explanation of why this bio works.
  
      IMPORTANT: Return ONLY raw JSON.
      `;
  }

  try {
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
        const rawData = JSON.parse(cleanJson(responseText));
        return sanitizeResponse(rawData) as BioResponse;
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
