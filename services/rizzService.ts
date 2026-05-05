import OpenAI from "openai";
import { RizzResponse, BioResponse, ResponseLength } from "../types";
import { resizeImage } from "./imageService";

// --- CLIENT INITIALIZATION ---

// Llama Client (Via OpenAI-compatible provider like Groq, OpenRouter, or DeepInfra)
// Access environment variables securely
// Uses Vite's import.meta.env first, then falls back to process.env (provided by define in vite.config)
const apiKey = (import.meta as any).env?.VITE_GROQ_API_KEY || (import.meta as any).env?.VITE_LLAMA_API_KEY || process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY || 'dummy-key';
const baseURL = (import.meta as any).env?.VITE_LLAMA_BASE_URL || process.env.LLAMA_BASE_URL || 'https://api.groq.com/openai/v1';

const llamaClient = new OpenAI({
  apiKey: apiKey,
  baseURL: baseURL,
  dangerouslyAllowBrowser: true
});

// Model Configuration
const TEXT_MODEL = 'llama-3.1-8b-instant';
const IMAGE_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

// --- LOCAL PRE-FILTERS ---

// 1. HARD SAFETY BLOCK (Illegal, Hate Speech, Extreme Violence, Self-Harm)
const HARD_BLOCK_REGEX = /\b(nigger|nigga|negro|coon|faggot|fag|dyke|kike|chink|spic|gook|raghead|towelhead|retard|retarded|mongoloid|tranny|shemale|hermaphrodite|rape|rapist|molest|molester|pedophile|pedo|hebephile|ephebophile|cp|child porn|bestiality|zoophilia|necrophilia|incest|kill yourself|kys|suicide|self-harm|terrorist|jihad|isis|taliban|nazi|hitler|holocaust|white power|white supremacy|kkk|school shooter|mass shooting|bomb|behead|decapitate|mutilate|genocide|ethnic cleansing|slave|slavery|lynch|lynching)\b/i;

// 2. MINOR / AGE SAFETY (Underage detection)
const MINOR_SAFETY_REGEX = /\b(jailbait|loli|shota|underage|preteen|hebephile|ephebophile|child porn|cp)\b|(\b(1[0-7]|[0-9])\s*(yo|years?\s*old|yrs?\s*old)\b)/i;

// 3. NSFW CONTEXT (FOR ROASTING)
// Expanded list to catch variations.
const NSFW_WORDS_LIST = [
  "sex", "boobs", "boobies", "boobees", "bobs", "vagene", "breast", "nudes", "nipple", "naked", "nude", "horny", "aroused", "boner", "erection", "erect", "hard-on", "dick", "cock", "pussy", "vagina", "penis", "tits", "areola", "orgasm", "shag", "fuck", "motherfucker", "gangbang", "bukkake", "creampie", "anal", "oral", "cum", "jizz", "semen", "sperm", "milf", "dilf", "gilf", "bussy", "breeding", "breed", "nut", "suck", "lick", "eating out", "69", "doggystyle", "missionary", "cowgirl", "bdsm", "bondage", "dom", "dominatrix", "fetish", "kink", "squirt", "gushing", "deepthroat", "blowjob", "handjob", "rimjob", "fingering", "fisting", "pegging", "scissoring", "tribadism", "watersports", "scat", "golden shower", "hentai", "porn", "xxx", "adult movie", "onlyfans", "fansly", "send nudes", "clit", "vulva", "labia", "asshole", "butthole", "anus", "rectum", "booty", "butt", "ass", "twerk", "strip", "stripper", "hooker", "prostitute", "escort", "slut", "whore", "skank", "hoe", "bitch", "cunt", "twat", "wank", "masturbate", "dildo", "vibrator", "sex toy", "fleshlight", "strap-on", "camgirl", "sugardaddy", "sugarbaby", "simp", "incel", "virgin", "cuck", "schlong", "dong", "knob", "bellend", "prick", "chode", "taint", "gooch", "perineum", "ballbag", "scrotum", "nutsack", "gonads", "foreskin", "smegma", "felching", "docking", "snowballing", "motorboat", "queef", "rusty trombone", "dirty sanchez", "alabama hot pocket", "cleveland steamer", "wanker", "tosser", "bugger", "sod", "slag", "tart", "strumpet", "harlot", "bimbo", "himbo", "yiff", "furry", "futa", "yaoi", "yuri", "ecchi", "bara", "erotic", "sensual", "genitalia", "groin", "crotch", "loins", "pubes", "phallic", "yoni", "lingam", "coitus", "copulate", "fornicate", "sodomy", "buggery", "pederasty", "onanism", "autoerotic", "frottage", "voyeur", "exhibitionist", "nympho", "satyr", "glory hole", "blue waffle", "lemon party", "tubgirl", "goatse", "meatspin", "2 girls 1 cup", "rule 34", "paizuri", "ahegao", "netorare", "ntr",
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
  if (!text) return '{}';

  // Remove markdown code blocks
  let cleaned = text.replace(/```json\n?|```/g, '').trim();

  // Attempt to find the first '{' and last '}' to extract just the JSON object
  const firstOpen = cleaned.indexOf('{');
  const lastClose = cleaned.lastIndexOf('}');

  if (firstOpen !== -1 && lastClose !== -1 && lastClose >= firstOpen) {
    cleaned = cleaned.substring(firstOpen, lastClose + 1);
  }

  // Handle common trailing comma issues in LLM JSON
  cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');

  return cleaned;
};

// Pre-compiled global regexes for sanitization — built once at module load, not per call.
// Safe to use with String.replace() as it always resets lastIndex after completing.
const HARD_BLOCK_GLOBAL = new RegExp(HARD_BLOCK_REGEX.source, 'gi');
const NSFW_GLOBAL = new RegExp(NSFW_TERMS_REGEX.source, 'gi');
const MINOR_GLOBAL = new RegExp(MINOR_SAFETY_REGEX.source, 'gi');

// Helper to sanitize output text (Post-Processing)
const sanitizeText = (text: string): string => {
  if (!text) return text;
  return text
    .replace(HARD_BLOCK_GLOBAL, "[CENSORED]") // Replace hate/violence with text tag
    .replace(NSFW_GLOBAL, "[NSFW]")         // Replace NSFW with text tag
    .replace(MINOR_GLOBAL, "[PRIVATE]");     // Replace Minor terms with text tag
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
  image?: string | undefined,
  vibe?: string | undefined,
  length: ResponseLength = 'short',
  customInstruction?: string
): Promise<RizzResponse> => { // Return type simplified for consistency

  const isToxic = HARD_BLOCK_REGEX.test(inputText);
  const isNSFW = NSFW_TERMS_REGEX.test(inputText);
  const isMinor = MINOR_SAFETY_REGEX.test(inputText);

  const isUnsafe = isToxic || isNSFW || isMinor;

  let systemInstruction = "";

  if (isUnsafe) {
    systemInstruction = `SAFETY OVERRIDE. You are "Roast Master". User sent NSFW/Underage content.
Task: IGNORE seduction. ROAST their life choices (unemployment, poor social skills).
JSON: {tease:roast social skills, smooth:sarcasm about unemployment, chaotic:reality check, loveScore:0, potentialStatus:"Blocked", analysis:why they need a job}
Return ONLY raw JSON.`;
  } else {
    const basePrompt = customInstruction
      ? `User will provide you messages someone send to them you will give replies as the user so he can copy them and send to target. Vibe: Custom.
CUSTOM PERSONA INSTRUCTIONS:
"${customInstruction}"`
      : `User will provide you messages someone send to them you will give replies as the user so he can copy them and send to target. Vibe: ${vibe || "Playful"}.`;

    systemInstruction = `${basePrompt}

TEASE: Playful teasing, show affection. ${length === 'short' ? '1 line' : length === 'medium' ? '2 lines' : '2-3 sentences'}.
 
SMOOTH: Charismatic, smooth, improve bonding. ${length === 'short' ? '1 line' : length === 'medium' ? '2 lines' : '2-3 sentences'}.
 
CHAOTIC: Awkward humor, relatable jokes ${length === 'short' ? '1-2 lines' : length === 'medium' ? '2-3 lines' : '3-4 sentences'}.

RULES:
-Use easy to understand words.
- Dont go out of context.
- NO "Hey", "So", "Well", or generic bot-speak.
- loveScore: 0-100 (brutally honest rating of their game).
- potentialStatus: 1-3 word label (e.g. "Sleeper Hit", "NPC Energy", "Wife Material").
- analysis: 1 sharp, witty sentence reviewing their message.

Return ONLY raw JSON:
{"tease":"...","smooth":"...","chaotic":"...","loveScore":0,"potentialStatus":"...","analysis":"..."}
CRITICAL: ${length === 'short'
        ? 'Each rizz response (tease, smooth, chaotic) MUST be concise, punchy, and high-impact. Limit to 1-2 lines and approximately 18 words per response.'
        : length === 'medium'
          ? 'Each rizz response (tease, smooth, chaotic) MUST be balanced and engaging. Limit to 2-3 lines and approximately 30-35 words per response.'
          : 'Each rizz response (tease, smooth, chaotic) MUST be substantive and at least 3-4 sentences long. Avoid one-liners.'}`;
  }

  try {
    const messages: any[] = [
      { role: "system", content: systemInstruction }
    ];

    const finalInput = inputText || "Generate rizz.";

    if (image) {
      // Strip formatting characters and newlines that Capacitor might embed,
      // which cause the Groq parser to fail with "unsupported protocol".
      const rawOptimized = await resizeImage(image);
      const cleanOptimized = rawOptimized.replace(/[\r\n\s]+/g, '');

      messages.push({
        role: "user",
        content: [
          { type: "text", text: finalInput },
          { type: "image_url", image_url: { url: cleanOptimized } }
        ]
      });
    } else {
      messages.push({
        role: "user",
        content: finalInput
      });
    }

    // Retry logic for robustness
    let attempts = 0;
    while (attempts < 3) {
      try {
        const completion = await llamaClient.chat.completions.create({
          model: image ? IMAGE_MODEL : TEXT_MODEL,
          messages: messages,
          temperature: 1.1,
          max_tokens: 1000
        });

        const responseText = completion.choices[0]?.message?.content;

        if (responseText) {
          const rawData = JSON.parse(cleanJson(responseText));
          const sanitized = sanitizeResponse(rawData) as any;

          // Normalize keys to lowercase to handle AI capitalization inconsistencies
          // e.g. {"Tease": "..."} instead of {"tease": "..."}
          const normalizedData: any = {};
          if (sanitized && typeof sanitized === 'object') {
            for (const key in sanitized) {
              if (sanitized[key] !== "") {
                normalizedData[key.toLowerCase()] = sanitized[key];
              }
            }
          }

          // Validate structure and provide defaults if keys are missing
          // This prevents "blank screen" issues if the model hallucinates the schema
          const finalResponse: RizzResponse = {
            tease: normalizedData.tease || "The AI is speechless (try again).",
            smooth: normalizedData.smooth || "Too smooth for words (try again).",
            chaotic: normalizedData.chaotic || "System overload (try again).",
            loveScore: typeof normalizedData.lovescore === 'number' ? normalizedData.lovescore : 50,
            potentialStatus: normalizedData.potentialstatus || "Unknown",
            analysis: normalizedData.analysis || "No analysis available."
          };

          return finalResponse;
        } else {
          throw new Error("Empty response text from model.");
        }
      } catch (e: any) {
        console.warn(`Attempt ${attempts + 1} failed:`, e?.message || e);
        attempts++;
        if (attempts >= 3) break;
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
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
  vibe?: string | undefined,
  length: ResponseLength = 'short',
  customInstruction?: string
): Promise<BioResponse | { analysis: string }> => {

  const isToxic = HARD_BLOCK_REGEX.test(inputText);
  const isNSFW = NSFW_TERMS_REGEX.test(inputText);
  const isMinor = MINOR_SAFETY_REGEX.test(inputText);

  const isUnsafe = isToxic || isNSFW || isMinor;

  let systemInstruction = "";

  if (isUnsafe) {
    systemInstruction = `SAFETY OVERRIDE. User sent NSFW/Toxic/Underage content while requesting a bio.
Refuse. Roast their life choices (unemployment, down bad) in the bio field. PG-13.
Return ONLY raw JSON: {"bio":"<roast>","analysis":"Rejected."}`;
  } else {
    const basePrompt = customInstruction
      ? `You are a dating profile optimizer. Vibe: Custom.
CUSTOM PERSONA INSTRUCTIONS:
"${customInstruction}"`
      : `You are a dating profile optimizer. Vibe: ${vibe || "Attractive"}.`;

    systemInstruction = `${basePrompt}
Write a high-impact bio (${length === 'short' ? 'punchy and concise' : length === 'medium' ? 'balanced and engaging' : 'detailed and extensive'}). Do not use emojis unless they are essential for the vibe.
Return ONLY raw JSON: {"bio":"<optimized bio>","analysis":"<1 sentence why it works>"}
CRITICAL: ${length === 'short'
        ? 'The bio must be punchy, catchy, and concise (1-2 lines, approx 15-20 words). Avoid being overly wordy.'
        : length === 'medium'
          ? 'The bio must be balanced and engaging (3-4 lines, approx 40-50 words). Avoid being too short or too long.'
          : 'The bio must be detailed and substantial, at least 100 tokens long.'}`;
  }

  let attempts = 0;
  while (attempts < 3) {
    try {
      const completion = await llamaClient.chat.completions.create({
        model: TEXT_MODEL,
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: isUnsafe ? "Generate roast." : inputText }
        ],
        temperature: 0.85
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
      console.warn(`Bio Attempt ${attempts + 1} failed:`, error?.message || error);
      attempts++;
      if (attempts >= 3) {
        console.error("Bio Service Error:", error);
        return { bio: '', analysis: 'System Error' };
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
    }
  }
  return { bio: '', analysis: 'System Error' };
};

/**
 * Generates coaching advice based on conversation history.
 */
export const generateCoachAdvice = async (
  messages: { role: 'user' | 'assistant'; content: string; image?: string | null; systemContext?: string | null; }[],
  shadowNotes?: string,
  vibe?: string,
  customInstruction?: string
): Promise<{ reply: string; updatedNotes?: string }> => {
  const lastMessage = messages[messages.length - 1]?.content || '';

  const isToxic = HARD_BLOCK_REGEX.test(lastMessage);
  const isNSFW = NSFW_TERMS_REGEX.test(lastMessage);

  let systemInstruction: string;

  if (isToxic || isNSFW) {
    systemInstruction = `You are the Rizz Master Coach. The user sent Toxic or NSFW content.
Refuse to engage. Roast their poor judgment instead — PG-13 only.
Reply in plain text, 1-2 sentences max.`;
  } else {
    // PERSONA-SPECIFIC BASE PROMPTS
    let personaBase = "";
    const p = (vibe || "").toLowerCase();

    if (customInstruction) {
      personaBase = `You are a Custom Persona created by the user.
CUSTOM PERSONA INSTRUCTIONS:
"${customInstruction}"

Follow the user's instructions for your personality and tone. Be engaging and helpful.`;
    } else if (p.includes("bestie")) {
      personaBase = `You are "The Bestie" — the user's high-energy, protective, and EQ-maximized girl best friend. You are elite at decoding vibes, subtext, and social dynamics in any situation.
TONE: Sisterly, warm but brutally honest.  
GUIDE:
- You interpret EVERYTHING through the lens of vibes, connection, and emotional intelligence. 
- Be your user's biggest hype-person but don't let them be delusional. 
- ADDRESS: Consistently address the user as "bestie", or "sweetheart".
- Reply in 2-3 sentence.
GOAL: Provide the ultimate emotional and social read on the user's life.`;
    } else if (p.includes("wingman")) {
      personaBase = `You are "The Elite Wingman" — a world-class strategic consultant for life and social dynamics. You treat every user as your buddy and gives best advice. 
TONE: Tactical, hype, confident. Uses strategic metaphors. Do not use emojis.
VOICE: Casual, friendly.
GUIDE:
-Reply in 2-3 sentence.
GOAL: Provide high-value advice in casual language.`;
    } else if (p.includes("roast")) {
      personaBase = `You are the "Roast Master" — a witty, savage sensei of social dynamics. You have zero tolerance for mediocrity, "down-bad" behavior, or NPC energy.
TONE: Arrogant, hilarious, brutally honest "tough love". Do not use emojis.
VOICE: "I've seen wet cardboard with more game.", "Do better, or don't complain when life ghosts you.", "Reality check incoming...", "Imagine being this mid. Couldn't be me."
GUIDE:
- You are the filter for the world's cringe. Find the funniest/most devastating way to handle the user's input.
- If they are being boring, "simp-y", or settled for "mid" energy, call it out immediately, regardless of the topic.
- Reply in 2-3 sentence.
GOAL: Reality checks and high-impact verbal gymnastics to force improvement.`;
    } else if (p.includes("chaotic")) {
      personaBase = `You are "The Chaotic" — the ultimate agent of entropy and unpredictability. You suggest high-risk, high-reward moves that blow up boring dynamics.
TONE: Daring, slightly unhinged, playful. No emojis.
VOICE: "Boring. Let's see what happens if we...", "Let's blow this up.", "Time to cause some harmless trouble.", "Normal is for cowards."
GUIDE:
- Suggest "Nuclear Options" and bold "Wildcard" moves for ANY situation (dating, work, life, chores).
- Shake things up if the user's life feels too predictable. Anti-NPC.
- Reply in 2-3 sentence.
GOAL: Predictable entertainment and bold breakthroughs.`;
    } else {
      personaBase = `You are "The Elite Wingman" — a world-class dating strategist. Tactical and focused on the win. No emojis.`;
    }

    systemInstruction = `${personaBase}

Tone & Style:
- Casual, text-message style. No jargon. No bullet points, no numbered lists, no bold formatting.
- Speak directly to them in a natural flow. Break it into maybe 2 short paragraphs max (3-5 sentences total).

YOUR CORE MISSION:
1. Respond to what the user said first as your character. You are a versatile companion — you can talk about movies, work, life, or dating, but ALWAYS stay in your specific character.
2. BE INTERACTIVE: Always ask a follow-up question. Be genuinely curious about the user's life and update your "Shadow Intel" regularly.
3. ONLY IF the user provides an image or specifically asks for tactical/social/rizz help, you MUST include:
   - THE READ: (1 sentence) The subtext/vibe you're picking up from their situation.
   - THE MOVE: (1 bold line) The specific message or action they should take.
   - THE BAIT: (1 punchy question) A follow-up to keep the progress moving.
4. If the user is just chatting about life, be an engaging, high-character companion. 

STRICT RULE: Never use structural labels like "THE READ:", "THE MOVE:", or "THE BAIT:". Blend them into your natural speech.

SHADOW INTEL (Your persistent Dossier on the user):
${shadowNotes || 'No intel yet — start gathering facts as the user shares.'}

INTEL UPDATE PROTOCOL:
1. First, write your character's natural reply.
2. Then, on a NEW LINE at the very end of your message, append the dossier block EXACTLY like this:
<<<INTEL_START>>>
[USER]: Gender, goals, style (e.g., "Guy, wants LTR, flirty style").
[TARGET]: Personality, red flags, interest level (e.g., "Girl, low interest, bad texter").
[SITUATION]: Match status, current vibe (e.g., "Just matched on Hinge, dry convo").
<<<INTEL_END>>>

CRITICAL: Do NOT write "Here is the intel:" or any conversational filler before or after the intel block. The block MUST start exactly with <<<INTEL_START>>> and end with <<<INTEL_END>>>.
Carry over all existing intel and update it when new facts emerge.`;
  }

  // Only remember the last 5 messages to keep context focused and save tokens
  const recentMessages = messages.slice(-5);

  const rawMessages = await Promise.all(recentMessages.map(async m => {
    let textContent = m.content;

    // Inject any manual system context (like the "Chat Reply" continuity)
    if (m.systemContext) {
      textContent = `[System Note: ${m.systemContext}]\n\n${textContent}`;
    }

    let finalContent: any = textContent;
    if (m.image) {
      const rawOptimized = await resizeImage(m.image);
      const cleanOptimized = rawOptimized.replace(/[\r\n\s]+/g, '');

      finalContent = [
        { type: "text", text: textContent },
        { type: "image_url", image_url: { url: cleanOptimized } }
      ];
    }

    return {
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: finalContent,
    };
  })) as any[];

  let attempts = 0;
  while (attempts < 3) {
    try {
      const completion = await llamaClient.chat.completions.create({
        model: messages.some(m => m.image) ? IMAGE_MODEL : TEXT_MODEL,
        messages: [{ role: 'system', content: systemInstruction }, ...rawMessages],
        temperature: 0.85,
        max_tokens: 650,
      });

      const rawReply = completion.choices[0]?.message?.content?.trim();
      if (!rawReply) throw new Error('No coach response');

      // Strip the hidden intel dossier block before showing to user, handling potential formatting issues from the model
      // This regex looks for <<<INTEL_START>>>, takes everything until <<<INTEL_END>>> or the end of the string.
      // It also handles optional markdown codeblocks often added by AI
      const INTEL_RE = /(?:```(?:markdown|text)?\n?)?<<<INTEL_START>>>([\s\S]*?)(?:<<<INTEL_END>>>|$)(?:\n?```)?/i;
      const intelMatch = rawReply.match(INTEL_RE);
      const updatedNotes = intelMatch ? intelMatch[1].trim() : undefined;

      // Remove the entirely matched block
      let cleanReply = rawReply.replace(INTEL_RE, '').trim();

      // Sometimes the AI might still add filler like "Here is the updated intel:", let's strip common trailing filler
      cleanReply = cleanReply.replace(/(?:\n|^)(?:Here is the updated intel|Updated Intel|Shadow Intel|Here is the intel).*:?\s*$/i, '').trim();

      return { reply: sanitizeText(cleanReply), updatedNotes };
    } catch (error: any) {
      console.warn(`Coach Attempt ${attempts + 1} failed:`, error?.message || error);
      attempts++;
      if (attempts >= 3) {
        console.error("Coach Service Error:", error);
        return { reply: "Something went wrong on my end. Try again. 🔧" };
      }
      await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempts - 1)));
    }
  }
  return { reply: "Something went wrong on my end. Try again. 🔧" };
};
