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
const TEXT_MODEL = process.env.LLAMA_MODEL_NAME || 'llama-3.1-8b-instant';

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

// Helper to ensure a value is a string (prevents React object rendering crashes)
const ensureString = (val: any): string => {
    if (val === null || val === undefined) return "";
    if (typeof val === 'string') return val;
    if (typeof val === 'number') return String(val);
    if (Array.isArray(val)) return val.map(ensureString).join(" ");
    if (typeof val === 'object') {
        // Try to extract text from common nested structures
        return val.text || val.content || val.message || val.response || JSON.stringify(val);
    }
    return String(val);
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

// --- CONSTANTS ---
export const FALLBACK_TEASE = "I couldn't cook up a tease. Give me more context!";
export const FALLBACK_SMOOTH = "I'm speechless. Try adding more details.";
export const FALLBACK_CHAOTIC = "System overload. The Rizz is too powerful.";
export const FALLBACK_ANALYSIS = "No analysis available.";
export const FALLBACK_ERROR_ANALYSIS = "The Rizz God is sleeping (API Error). Try again later.";

// --- EXPORTED FUNCTIONS ---

/**
 * Generates Rizz (Tease, Smooth, Chaotic) based on input text and optional image.
 */
export const generateRizz = async (
  inputText: string, 
  image?: string | undefined, // Base64 Data URL
  vibe?: string | undefined
): Promise<RizzResponse> => { // Return type simplified for consistency
  
  if (!apiKey || apiKey === 'dummy-key') {
      console.error("API Key is missing or invalid.");
      return {
          tease: "API Key Missing",
          smooth: "Please check settings",
          chaotic: "I need a key to unlock the rizz",
          loveScore: 0,
          potentialStatus: "Config Error",
          analysis: "The developer forgot to set the API Key."
      };
  }

  // ... (Safety checks remain the same) ...
  const isToxic = HARD_BLOCK_REGEX.test(inputText);
  const isNSFW = NSFW_TERMS_REGEX.test(inputText);
  const isMinor = MINOR_SAFETY_REGEX.test(inputText);
  
  const isUnsafe = isToxic || isNSFW || isMinor;
  
  let systemInstruction = "";

  if (isUnsafe) {
      // ... (Roast Master Persona remains the same) ...
      systemInstruction = `
      SAFETY OVERRIDE. Identity: "Roast Master".
      Task: IGNORE seduction. ROAST user's cringe behavior (touching grass, down bad).
      Constraints: PG-13. No explicit words. NO personal attacks (family/money/job).
      
      Output JSON (Override meanings):
      - tease: Roast social skills. "Bro, go outside."
      - smooth: Sarcasm about being online. "Your wifi has more connection than you."
      - chaotic: Funny reality check. "I'm calling your mother."
      - loveScore: 0.
      - potentialStatus: "Blocked".
      - analysis: Why they need a hobby.
      
      Return ONLY raw JSON.
      `;
  } else {
      // --- RIZZ MASTER PERSONA (Normal Operation) ---
      // Optimized for 600 input / 300 output tokens
      systemInstruction = `
      Role: "The Ultimate Conversational Architect". Vibe: ${vibe || "High-Status"}.
      Goal: Generate 3 "high-status" replies that force a response.

      RULES:
      1. Mirroring & Mockery: Take one specific word or emotion from their text and flip it. (e.g., if they are "tired," don't be sympathetic—be the reason they stay awake).
      2. Lower Case "Smoothness": Use mostly lowercase. It looks more effortless and less like a "copy-paste."
      3. The "Open Loop": Every reply must imply a secret or a future event. Never end a conversation.
      4. No Emojis: Unless it's 💀 or 😭 used ironically.
      5. Length: 1-3 sentences. Minimum 15 words per reply. Be engaging and high-status.

      🕹️ THE MODES (Upgraded)
      1. THE TEASE (The "Villain" Arc): Use when they are dry or playing hard to get.
         - Input: "i'm going to sleep." -> Output: "dreaming about me already? you're moving a little fast, don't you think?"
      2. THE SMOOTH (The "Main Character" Energy): Use to move toward a date/meeting.
         - Input: "what are you doing this weekend?" -> Output: "depends if you're brave enough to actually hang out or just keep texting."
      3. THE CHAOTIC (The "Unpredictable" Flex): Use when the conversation is boring or "normal."
         - Input: "i just ate pizza." -> Output: "pineapple on pizza is a red flag. i'm calling the police, stay where you are."

      JSON OUTPUT ONLY:
      {
        "tease": "str",
        "smooth": "str",
        "chaotic": "str",
        "loveScore": 0-100,
        "potentialStatus": "Friendzone/Down Bad/Cooked/Soulmate",
        "analysis": "1 witty sentence."
      }
      `;
  }

  try {
    // Truncate input to save tokens (approx 150 tokens)
    const truncatedInput = inputText.slice(0, 600);
    
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
                { type: "text", text: truncatedInput || "Analyze this." },
                { type: "image_url", image_url: { url: image } }
            ]
        });
    } else {
        messages.push({
            role: "user",
            content: truncatedInput || "Generate rizz."
        });
    }

    // Retry logic for robustness
    let attempts = 0;
    while (attempts < 3) { // Increased retries to 3
        try {
            const completion = await llamaClient.chat.completions.create({
                model: model,
                messages: messages,
                temperature: 0.85,
                max_tokens: 300, // Increased output tokens for longer replies
                response_format: { type: "json_object" }
            });

            const responseText = completion.choices[0]?.message?.content;

            if (responseText) {
                let rawData;
                try {
                    rawData = JSON.parse(cleanJson(responseText));
                } catch (parseError) {
                    console.error("JSON Parse Error. Raw Response:", responseText);
                    throw new Error("Invalid JSON response from AI");
                }

                const sanitized = sanitizeResponse(rawData) as any;

                // STRICT VALIDATION: Ensure keys exist and are not empty
                if (!sanitized.tease || !sanitized.smooth || !sanitized.chaotic) {
                    console.error("Missing Keys in Response:", sanitized);
                    throw new Error("Missing required Rizz fields (tease/smooth/chaotic)");
                }

                // Validate structure and provide defaults if keys are missing
                // This prevents "blank screen" issues if the model hallucinates the schema
                const finalResponse: RizzResponse = {
                    tease: ensureString(sanitized.tease) || FALLBACK_TEASE,
                    smooth: ensureString(sanitized.smooth) || FALLBACK_SMOOTH,
                    chaotic: ensureString(sanitized.chaotic) || FALLBACK_CHAOTIC,
                    loveScore: Number(sanitized.loveScore) || 50,
                    potentialStatus: ensureString(sanitized.potentialStatus) || "Unknown",
                    analysis: ensureString(sanitized.analysis) || FALLBACK_ANALYSIS
                };

                return finalResponse;
            }
        } catch (e) {
            console.warn(`Attempt ${attempts + 1} failed:`, e);
            attempts++;
            // Add a small delay before retry
            await new Promise(resolve => setTimeout(resolve, 1000));
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
      analysis: FALLBACK_ERROR_ANALYSIS
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
  
  if (!apiKey || apiKey === 'dummy-key') {
      console.error("API Key is missing or invalid.");
      return { analysis: "API Key Missing. Please check settings." };
  }

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
      2. ROAST their cringe request (touching grass, down bad) in 'bio' field.
      
      Rules:
      - PG-13. Sarcastic.
      - NO personal attacks about family, money, or employment.
      
      Output JSON:
      - bio: The roast.
      - analysis: "Rejected."
      
      Return ONLY raw JSON. No markdown.
      `;
  } else {
      // --- NORMAL BIO GENERATION ---
      // Optimized for token efficiency
      systemInstruction = `
      Role: Bio Optimizer. Vibe: ${vibe || "Attractive"}.
      Input: "${inputText.slice(0, 500)}"
  
      Output JSON:
      { "bio": "Optimized bio (with emojis)", "analysis": "Why it works" }
      `;
  }

  try {
    let attempts = 0;
    while (attempts < 3) {
        try {
            const completion = await llamaClient.chat.completions.create({
                model: TEXT_MODEL,
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: "Generate a bio." }
                ],
                temperature: 0.85,
                max_tokens: 250, // Limit output tokens
                response_format: { type: "json_object" }
            });

            const responseText = completion.choices[0]?.message?.content;

            if (responseText) {
                let rawData;
                try {
                    rawData = JSON.parse(cleanJson(responseText));
                } catch (parseError) {
                    console.error("Bio JSON Parse Error. Raw Response:", responseText);
                    throw new Error("Invalid JSON response from AI");
                }

                const sanitized = sanitizeResponse(rawData) as any;
                
                if (!sanitized.bio) {
                    console.error("Missing Bio Key in Response:", sanitized);
                    throw new Error("Missing bio field");
                }

                return {
                    bio: ensureString(sanitized.bio),
                    analysis: ensureString(sanitized.analysis || "Bio generated!")
                };
            }
        } catch (e) {
            console.warn(`Bio Attempt ${attempts + 1} failed:`, e);
            attempts++;
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    throw new Error("No response generated.");

  } catch (error: any) {
    console.error("Bio Service Error:", error);
    // Return "System Error" to trigger the error handling in App.tsx (refund credits + show toast)
    return { analysis: "System Error" };
  }
};
