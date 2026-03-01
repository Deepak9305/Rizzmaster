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
    "sex", "boobs", "boobies", "boobees", "wet", "bobs", "vagene", "breast", "nudes", "nipple", "naked", "nude", "horny", "aroused", "boner", "erection", "erect", "hard-on", "dick", "cock", "pussy", "vagina", "penis", "tits", "areola", "orgasm", "climax", "shag", "fuck", "motherfucker", "gangbang", "bukkake", "creampie", "anal", "oral", "cum", "jizz", "semen", "sperm", "load", "milf", "dilf", "gilf", "thicc", "gyatt", "bussy", "breeding", "breed", "nut", "suck", "lick", "eating out", "69", "doggystyle", "missionary", "cowgirl", "bdsm", "bondage", "dom", "sub", "dominatrix", "feet", "toes", "fetish", "kink", "squirt", "gushing", "deepthroat", "blowjob", "handjob", "rimjob", "fingering", "fisting", "pegging", "scissoring", "tribadism", "watersports", "scat", "golden shower", "hentai", "porn", "xxx", "adult movie", "onlyfans", "fansly", "send nudes", "clit", "vulva", "labia", "asshole", "butthole", "anus", "rectum", "booty", "butt", "ass", "twerk", "strip", "stripper", "hooker", "prostitute", "escort", "slut", "whore", "skank", "hoe", "bitch", "cunt", "twat", "wank", "masturbate", "dildo", "vibrator", "sex toy", "fleshlight", "strap-on", "camgirl", "sugardaddy", "sugarbaby", "simp", "incel", "virgin", "cuck", "schlong", "dong", "knob", "bellend", "prick", "chode", "taint", "gooch", "perineum", "ballbag", "scrotum", "nutsack", "gonads", "foreskin", "smegma", "felching", "docking", "sounding", "snowballing", "tea bag", "motorboat", "queef", "rusty trombone", "dirty sanchez", "alabama hot pocket", "cleveland steamer", "wanker", "tosser", "bugger", "sod", "slag", "tart", "strumpet", "harlot", "bimbo", "himbo", "yiff", "furry", "futa", "yaoi", "yuri", "ecchi", "bara", "erotic", "sensual", "genitalia", "groin", "crotch", "loins", "pubes", "phallic", "yoni", "lingam", "coitus", "copulate", "fornicate", "sodomy", "buggery", "pederasty", "onanism", "autoerotic", "frottage", "voyeur", "exhibitionist", "nympho", "satyr", "glory hole", "blue waffle", "lemon party", "tubgirl", "goatse", "meatspin", "2 girls 1 cup", "rule 34", "paizuri", "ahegao", "netorare", "ntr",
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


// Fix 4: Fast Set-based NSFW word check for input pre-filtering.
// Replaces the 250-word catastrophic alternation regex that could cause ANR kills
// on low-end devices due to regex backtracking. O(1) Set lookup is ~100x faster.
const NSFW_WORDS_SET = new Set(NSFW_WORDS_LIST.map(w => w.toLowerCase()));

// Lightweight tokenizer: split input into words and check against the Set.
// This covers exact matches and basic normalizations (lowercase, trim).
const isNSFWInput = (text: string): boolean => {
    // Single regex pass to strip markup/numbers, then Set lookup — no backtracking
    const words = text.toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/);
    return words.some(w => NSFW_WORDS_SET.has(w));
};

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
// Fix 4: Only apply the compact HARD_BLOCK_REGEX to output.
// The full NSFW regex is NOT applied to output — the AI handles content policy.
// Running NSFW_TERMS_REGEX (250-word alternation) on every output string caused
// catastrophic backtracking that could stall the JS thread and trigger an ANR kill.
const sanitizeText = (text: string): string => {
    if (!text) return text;
    const hardBlockGlobal = new RegExp(HARD_BLOCK_REGEX.source, 'gi');
    return text.replace(hardBlockGlobal, "🤬");
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
    // Fix 4: Use fast Set lookup instead of the 250-word alternation regex
    const isNSFW = isNSFWInput(inputText);
    const isMinor = MINOR_SAFETY_REGEX.test(inputText);

    const isUnsafe = isToxic || isNSFW || isMinor;

    let systemInstruction = "";

    if (isUnsafe) {
        // ... (Roast Master Persona remains the same) ...
        systemInstruction = `
      SAFETY OVERRIDE. Role: Roast Master.
      Task: Roast cringe request. PG-13. No personal attacks.
      JSON OUT: {"tease": "roast social skills", "smooth": "sarcasm", "chaotic": "reality check", "loveScore": 0, "potentialStatus": "Blocked", "analysis": "why they need a hobby"}
      `;
    } else {
        // --- RIZZ MASTER PERSONA (Normal Operation) ---
        // Enhanced for higher token context and better replies
        systemInstruction = `
      Role: Supreme Conversational Charm Expert. Vibe: ${vibe || "High-Status"}.
      Goal: Generate 3 highly engaging, emotionally gripping, and outrageously clever replies based ONLY on the provided context.
      
      CRITICAL RULES:
      1. HUMAN ENGAGEMENT: Make it sound completely natural, deeply charismatic, and highly confident. Do not use generic AI-sounding phrases.
      2. INTERACTIVE: Every reply must subtly invite a response—an open loop, a clever challenge, or a witty observation.
      3. LENGTH & PACING: Keep texts punchy and impactful (15-50 words). Break rules of grammar slightly if it makes it read more like a real text.
      4. STYLE: Mostly lowercase. Use punctuation for pacing. Do not use emojis unless absolutely necessary for the joke.
      
      MODES:
      - TEASE: Playful, challenging, slightly arrogant but undeniable. Push-pull dynamic. Roast them slightly but keep the underlying tension flirtatious. Never sound desperate.
      - SMOOTH: Unapologetically confident, suave, and magnetic. Use high-energy charisma to pivot the conversation towards undeniable chemistry or a fun date. Absolutely zero sadness, hesitance, or formal tones.
      - CHAOTIC: Completely unhinged, wild, absurdist humor, or delightfully dramatic. Make them say "wtf" but still want to reply immediately. Break the fourth wall of normal conversation.
      
      JSON OUTPUT FORMAT:
      {
        "tease": "...",
        "smooth": "...",
        "chaotic": "...",
        "loveScore": 0-100,
        "potentialStatus": "Friendzone / Hooked / Obsessed / Speechless",
        "analysis": "1 brilliant, sharp sentence explaining the psychological angle of your approach."
      }
      `;
    }

    try {
        // Truncate input to a higher limit (approx 2000+ tokens)
        const truncatedInput = inputText.slice(0, 8000);

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
                    max_tokens: 400, // Increased to allow more detailed and creative replies + JSON overhead
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
    // Fix 4: Use fast Set lookup instead of the 250-word alternation regex
    const isNSFW = isNSFWInput(inputText);
    const isMinor = MINOR_SAFETY_REGEX.test(inputText);

    const isUnsafe = isToxic || isNSFW || isMinor;

    let systemInstruction = "";

    if (isUnsafe) {
        systemInstruction = `
      SAFETY OVERRIDE.
      Task: Refuse bio. Roast cringe request in 'bio' field. PG-13. No personal attacks.
      JSON OUT: {"bio": "roast", "analysis": "Rejected"}
      `;
    } else {
        // --- NORMAL BIO GENERATION ---
        // Enhanced for better context and creativity
        systemInstruction = `
      Role: Elite Bio Architect. Vibe: ${vibe || "Attractive"}.
      Task: Create a highly engaging, interactive dating bio based ONLY on context: "${inputText.slice(0, 4000)}".
      RULES:
      1. Simple, punchy, modern language. No cliches.
      2. Include a subtle "call to action" or conversation starter.
      3. LENGTH: 30-60 words. Make every word count.
      JSON OUT: {"bio": "...", "analysis": "1 sharp sentence on why this works."}
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
                    max_tokens: 250, // Increased limit for more creative bios
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
