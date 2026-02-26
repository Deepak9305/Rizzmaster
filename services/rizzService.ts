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

// 2. MINOR / AGE SAFETY (Underage detection)
const MINOR_SAFETY_REGEX = /\b(jailbait|loli|shota|underage|preteen|hebephile|ephebophile|child porn|cp)\b|(\b(1[0-7]|[0-9])\s*(yo|years?\s*old|yrs?\s*old)\b)/i;

// 3. NSFW CONTEXT (FOR ROASTING)
// Expanded list to catch variations.
const NSFW_WORDS_LIST = [
    "sex", "boobs", "boobies", "boobees", "bobs", "vagene", "breast", "nudes", "nipple", "naked", "nude", "horny", "aroused", "boner", "erection", "erect", "hard-on", "dick", "cock", "pussy", "vagina", "penis", "tits", "areola", "orgasm", "climax", "shag", "fuck", "motherfucker", "gangbang", "bukkake", "creampie", "anal", "oral", "cum", "jizz", "semen", "sperm", "load", "milf", "dilf", "gilf", "thicc", "gyatt", "bussy", "breeding", "breed", "nut", "suck", "lick", "eating out", "69", "doggystyle", "missionary", "cowgirl", "bdsm", "bondage", "dom", "sub", "dominatrix", "feet", "toes", "fetish", "kink", "squirt", "gushing", "deepthroat", "blowjob", "handjob", "rimjob", "fingering", "fisting", "pegging", "scissoring", "tribadism", "watersports", "scat", "golden shower", "hentai", "porn", "xxx", "adult movie", "onlyfans", "fansly", "send nudes", "clit", "vulva", "labia", "asshole", "butthole", "anus", "rectum", "booty", "butt", "ass", "twerk", "strip", "stripper", "hooker", "prostitute", "escort", "slut", "whore", "skank", "hoe", "bitch", "cunt", "twat", "wank", "masturbate", "dildo", "vibrator", "sex toy", "fleshlight", "strap-on", "camgirl", "sugardaddy", "sugarbaby", "simp", "incel", "virgin", "cuck", "schlong", "dong", "knob", "bellend", "prick", "chode", "taint", "gooch", "perineum", "ballbag", "scrotum", "nutsack", "gonads", "foreskin", "smegma", "felching", "docking", "sounding", "snowballing", "tea bag", "motorboat", "queef", "rusty trombone", "dirty sanchez", "alabama hot pocket", "cleveland steamer", "wanker", "tosser", "bugger", "sod", "slag", "tart", "strumpet", "harlot", "bimbo", "himbo", "yiff", "furry", "futa", "yaoi", "yuri", "ecchi", "bara", "erotic", "sensual", "genitalia", "groin", "crotch", "loins", "pubes", "phallic", "yoni", "lingam", "coitus", "copulate", "fornicate", "sodomy", "buggery", "pederasty", "onanism", "autoerotic", "frottage", "voyeur", "exhibitionist", "nympho", "satyr", "glory hole", "blue waffle", "lemon party", "tubgirl", "goatse", "meatspin", "2 girls 1 cup", "rule 34", "paizuri", "ahegao", "netorare", "ntr",
    // Common misspellings and variations
    "fuk", "fuh", "fvck", "dik", "dic", "puss", "pusi", "pusy", "biatch", "biyatch", "beeyotch", "ho", "hoe", "azz", "secks", "segs", "segway",
    "sh!t", "sh1t", "b!tch", "b1tch", "c0ck", "p0rn", "w0re", "wh0re", "sl0t", "5lut", "cumshot", "facial", "titties", "titty", "breasts", "clitoris",
    "vulva", "labia", "pubic", "groin", "crotch", "loins", "muff", "beaver", "cameltoe", "mooseknuckle", "boner", "erection", "stiffie", "hardon",
    "masturbate", "jerk off", "jack off", "wank", "fap", "schlick", "finger", "diddle", "rub one out", "choke the chicken", "spank the monkey",
    "sex", "intercourse", "coitus", "fornicate", "copulate", "screw", "hump", "bang", "shag", "rail", "plow", "breed", "creampie", "raw dog",
    "bareback", "condom", "rubber", "protection", "pill", "plan b", "abortion", "fetus", "baby killer", "rapist", "molester", "predator", "groomer",
    "pedophile", "pedo", "nonce", "toucher", "bad touch", "incest", "stepbro", "stepsis", "stepmom", "stepdad", "milf", "dilf", "gilf", "cougar",
    "sugar daddy", "sugar baby", "onlyfans", "fansly", "camgirl", "sex worker", "prostitute", "hooker", "escort", "call girl", "street walker",
    "lot lizard", "pimp", "madam", "brothel", "whorehouse", "strip club", "gentlemans club", "lap dance", "private dance", "champagne room",
    "bdsm", "bondage", "dom", "sub", "domme", "mistress", "master", "slave", "gimp", "leash", "collar", "cuffs", "gag", "whip", "paddle", "flogger",
    "spank", "choke", "strangle", "asphyxiate", "breathplay", "knifeplay", "bloodplay", "scat", "piss", "urine", "golden shower", "watersports",
    "enema", "douche", "rimming", "anilingus", "cunnilingus", "fellatio", "blowjob", "handjob", "titjob", "footjob", "deepthroat", "gag reflex",
    "swallow", "spit", "snowball", "felch", "docking", "sounding", "pegging", "strap on", "dildo", "vibrator", "plug", "beads", "fleshlight",
    "pocket pussy", "doll", "robot", "hentai", "ecchi", "yaoi", "yuri", "futa", "furry", "yiff", "vore", "guro", "snuff", "bestiality", "zoophilia"
];

// Map characters to their regex pattern including leetspeak and repetitions
const CHAR_MAP: Record<string, string> = {
    'a': '[a@4]',
    'b': '[b8]',
    'c': '[c\\(k]', // c can be k
    'e': '[e3]',
    'f': '(?:f|ph)', // f can be ph
    'g': '[g69]',
    'i': '[i1!|l]',
    'k': '[kqc]', // k can be c or q
    'l': '[l1|i]',
    'o': '[o0]',
    's': '[s5$z]', // s can be z
    't': '[t7+]',
    'u': '[uv]', // u can be v
    'z': '[z2s]' // z can be s
};

// Generate regex that matches words with repeated characters and leetspeak
// e.g. "sex" -> [s5$z]+[e3]+[x]+
// Also allows for optional spaces or separators between characters
const NSFW_TERMS_REGEX = new RegExp(
    `\\b(${NSFW_WORDS_LIST.map(word => 
        word.split('').map(c => {
            const lower = c.toLowerCase();
            if (lower === ' ') return '\\s+';
            if (lower === '-') return '[-_\\s]+';
            if (/[a-z0-9]/.test(lower)) {
                const pattern = CHAR_MAP[lower] || lower;
                // Match the character or its leetspeak equivalent, repeated 1 or more times
                // Allow optional non-word characters between letters to catch "s.e.x"
                return `${pattern}+[\\W_]*`;
            }
            return '\\' + c;
        }).join('')
    ).join('|')})\\b`, 
    'i'
);

// Helper to clean Markdown JSON from Llama responses
const cleanJson = (text: string): string => {
  // Remove markdown code blocks
  let cleaned = text.replace(/```json\n?|```/g, '').trim();
  
  // Attempt to find the first '{' and last '}' to extract just the JSON object
  const firstOpen = cleaned.indexOf('{');
  const lastClose = cleaned.lastIndexOf('}');
  
  if (firstOpen !== -1 && lastClose !== -1 && lastClose > firstOpen) {
    cleaned = cleaned.substring(firstOpen, lastClose + 1);
  }
  
  return cleaned;
};

// Helper to sanitize output text (Post-Processing)
const sanitizeText = (text: string): string => {
  if (!text) return text;
  // Create global versions for replacement
  const hardBlockGlobal = new RegExp(HARD_BLOCK_REGEX.source, 'gi');
  const nsfwGlobal = new RegExp(NSFW_TERMS_REGEX.source, 'gi');
  const minorGlobal = new RegExp(MINOR_SAFETY_REGEX.source, 'gi');
  
  return text
    .replace(hardBlockGlobal, "🤬") // Replace hate/violence with Angry Face
    .replace(nsfwGlobal, "🫣")      // Replace NSFW with Peeking Face
    .replace(minorGlobal, "🔞");    // Replace Minor terms with No Under 18
};

// Helper to recursively sanitize response object
const sanitizeResponse = <T>(data: T): T => {
  if (data === null || data === undefined) {
    return "" as unknown as T; // Default to empty string for nulls to prevent crashes
  }
  if (typeof data === 'string') {
    return sanitizeText(data) as unknown as T;
  }
  if (Array.isArray(data)) {
    return data.map(item => sanitizeResponse(item)) as unknown as T;
  }
  if (typeof data === 'object') {
    const sanitizedObj: any = {};
    for (const key in data) {
      sanitizedObj[key] = sanitizeResponse((data as any)[key]);
    }
    return sanitizedObj as T;
  }
  return data;
};

// --- EXPORTED FUNCTIONS ---

/**
 * Generates Rizz (Tease, Smooth, Chaotic) based on input text and optional image.
 */
export const generateRizz = async (
  inputText: string, 
  image?: string | undefined, // Base64 Data URL
  vibe?: string | undefined
): Promise<RizzResponse> => { // Return type simplified for consistency
  
  // ... (Safety checks remain the same) ...
  const isToxic = HARD_BLOCK_REGEX.test(inputText);
  const isNSFW = NSFW_TERMS_REGEX.test(inputText);
  const isMinor = MINOR_SAFETY_REGEX.test(inputText);
  
  const isUnsafe = isToxic || isNSFW || isMinor;
  
  let systemInstruction = "";

  if (isUnsafe) {
      // ... (Roast Master Persona remains the same) ...
      systemInstruction = `
      SAFETY OVERRIDE.
      Identity: "Roast Master". User text is Toxic/NSFW/Underage.
      
      Task:
      1. IGNORE seduction requests.
      2. ROAST user's life choices (unemployment, touching grass).
      
      Constraints:
      - PG-13 only. No explicit words.
      - Do NOT repeat user's explicit words.
      
      Output JSON (Override meanings):
      - tease: Roast social skills.
      - smooth: Sarcasm about unemployment.
      - chaotic: Reality check.
      - loveScore: 0.
      - potentialStatus: "Blocked".
      - analysis: Why they need a job.
      
      Return ONLY raw JSON.
      `;
  } else {
      // --- RIZZ MASTER PERSONA (Normal Operation) ---
      systemInstruction = `
      Role: "Rizz Master" dating assistant & conversation analyst.
      Goal: Generate witty, high-converting replies for DMs/Dating Apps based on the input context.
      Vibe: ${vibe || "Balanced"}

      TASK 1: CONTEXT ANALYSIS (If image provided)
      - Identify the speakers (User vs. Crush).
      - Analyze the TONE (dry, flirty, angry, ghosting).
      - Check timestamps/gaps (e.g., double texting, late night).
      - Detect "red flags" or "green flags".

      TASK 2: GENERATE REPLIES (3 Personas)
      
      1. TEASE (Playful/Banter):
         - NOT "negging" or mean.
         - Playful disagreement or "bratty" energy.
         - Call out specific details (e.g., "That shirt is a choice," or "You look like you steal fries").
         - Avoid generic lines like "Are you trouble?".
      
      2. SMOOTH (Charming/Confident):
         - Direct but not creepy.
         - Compliment their vibe/energy, not just looks.
         - Move the conversation forward (e.g., "So when are we getting tacos?").
         - Use lowercase for a "chill" aesthetic.
      
      3. CHAOTIC (Unhinged/Funny):
         - NOT "random = funny" (avoid "potato" humor).
         - Go for "deranged but intriguing" or "mildly threatening" (playfully).
         - Bizarrely specific lies or gaslighting (e.g., "I'm actually three raccoons in a trench coat").
         - High risk, high reward.

      TASK 3: VIRAL RECEIPT (The Analysis)
      - loveScore: 0-100 (Be realistic. Dry text = low score).
      - potentialStatus: ONE punchy phrase (e.g., "Friendzone", "Down Bad", "Wife Material", "Cooked", "Soulmate", "Blocked").
      - analysis: A 1-sentence ROAST or HYPE of the situation. Be witty.

      Output JSON:
      {
        "tease": "...",
        "smooth": "...",
        "chaotic": "...",
        "loveScore": 0,
        "potentialStatus": "...",
        "analysis": "..."
      }
      
      Return ONLY raw JSON.
      `;
  }

  try {
    // ... (Model selection and messages setup remain the same) ...
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

    // Retry logic for robustness
    let attempts = 0;
    while (attempts < 2) {
        try {
            const completion = await llamaClient.chat.completions.create({
                model: model,
                messages: messages,
                temperature: 0.85,
                max_tokens: 1000,
                response_format: { type: "json_object" }
            });

            const responseText = completion.choices[0]?.message?.content;

            if (responseText) {
                const rawData = JSON.parse(cleanJson(responseText));
                const sanitized = sanitizeResponse(rawData) as any;

                // Validate structure and provide defaults if keys are missing
                // This prevents "blank screen" issues if the model hallucinates the schema
                const finalResponse: RizzResponse = {
                    tease: sanitized.tease || "The AI is speechless (try again).",
                    smooth: sanitized.smooth || "Too smooth for words (try again).",
                    chaotic: sanitized.chaotic || "System overload (try again).",
                    loveScore: typeof sanitized.loveScore === 'number' ? sanitized.loveScore : 50,
                    potentialStatus: sanitized.potentialStatus || "Unknown",
                    analysis: sanitized.analysis || "No analysis available."
                };

                return finalResponse;
            }
        } catch (e) {
            console.warn(`Attempt ${attempts + 1} failed:`, e);
            attempts++;
        }
    }
    
    throw new Error("No response generated after retries.");

  } catch (error: any) {
    console.error("Rizz Service Error:", error);
    // Return a safe fallback object to prevent UI crashes
    return {
      tease: "Error generating rizz.",
      smooth: "Try again later.",
      chaotic: "The AI is taking a nap.",
      loveScore: 0,
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
  const isNSFW = NSFW_TERMS_REGEX.test(inputText);
  const isMinor = MINOR_SAFETY_REGEX.test(inputText);
  
  const isUnsafe = isToxic || isNSFW || isMinor;

  let systemInstruction = "";

  if (isUnsafe) {
      // --- ROAST MASTER PERSONA (BIO MODE) ---
      systemInstruction = `
      SAFETY OVERRIDE.
      User asking for bio with NSFW/Toxic/Underage terms.
      
      Task:
      1. REFUSE bio.
      2. ROAST their life choices (unemployment, down bad) in 'bio' field.
      
      Rules:
      - PG-13. Sarcastic. Brutal.
      
      Output JSON:
      - bio: The roast.
      - analysis: "Rejected."
      
      Return ONLY raw JSON.
      `;
  } else {
      // --- NORMAL BIO GENERATION ---
      systemInstruction = `
      Role: Dating profile optimizer.
      Input: "${inputText}"
      Vibe: ${vibe || "Attractive"}
  
      Output JSON:
      - bio: Optimized bio string (with emojis).
      - analysis: Why it works.
  
      Return ONLY raw JSON.
      `;
  }

  try {
    const completion = await llamaClient.chat.completions.create({
        model: TEXT_MODEL,
        messages: [
            { role: "system", content: systemInstruction },
            { role: "user", content: "Generate a bio." }
        ],
        temperature: 0.8.5,
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
