import { RizzResponse, BioResponse, ResponseLength } from "../types";
import { resizeImage } from "./imageService";
import { getApiUrl } from "./runtimeConfig";
import { supabase } from "./supabaseClient";

const AI_ENDPOINT = getApiUrl('/api/ai');
const LOGIN_REQUIRED_ERROR = 'LOGIN_REQUIRED';
const INSUFFICIENT_CREDITS_ERROR = 'INSUFFICIENT_CREDITS';
const PROFILE_NOT_FOUND_ERROR = 'PROFILE_NOT_FOUND';
const SUPABASE_BACKEND_UNAVAILABLE_ERROR = 'SUPABASE_BACKEND_UNAVAILABLE';
const PROFILE_BOOTSTRAP_FAILED_ERROR = 'PROFILE_BOOTSTRAP_FAILED';
const CREDIT_DEDUCTION_FAILED_ERROR = 'CREDIT_DEDUCTION_FAILED';

// Model Configuration
const TEXT_MODEL = 'openai/gpt-oss-120b';

const getPreferredModel = (_hasImage: boolean) => TEXT_MODEL;

type AiMessageContent =
  | string
  | Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  >;

type AiMessage = {
  role: "system" | "user" | "assistant";
  content: AiMessageContent;
};

type AiCompletionResult = {
  content: string;
};

const getAuthToken = async () => {
  if (!supabase) {
    return 'unauthenticated';
  }

  const { data: { session } } = await supabase.auth.getSession();
  return session?.access_token || 'unauthenticated';
};

const requestAiCompletion = async (payload: {
  model: string;
  messages: AiMessage[];
  temperature: number;
  max_tokens?: number;
}, token: string) => {
  const response = await fetch(AI_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  return { response, data };
};

const callAiChatCompletion = async (payload: {
  model: string;
  messages: AiMessage[];
  temperature: number;
  max_tokens?: number;
}): Promise<AiCompletionResult> => {
  let token = await getAuthToken();
  let { response, data } = await requestAiCompletion(payload, token);

  if ((response.status === 401 || data?.code === LOGIN_REQUIRED_ERROR || data?.error === LOGIN_REQUIRED_ERROR) && supabase && token !== 'unauthenticated') {
    const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
    const refreshedToken = refreshData.session?.access_token;

    if (!refreshError && refreshedToken) {
      token = refreshedToken;
      ({ response, data } = await requestAiCompletion(payload, token));
    }
  }

  if (!response.ok) {
    if (response.status === 401 || data?.code === LOGIN_REQUIRED_ERROR || data?.error === LOGIN_REQUIRED_ERROR) {
      throw new Error(LOGIN_REQUIRED_ERROR);
    }
    if (response.status === 403 || data?.code === INSUFFICIENT_CREDITS_ERROR) {
      throw new Error(INSUFFICIENT_CREDITS_ERROR);
    }
    if (response.status === 404 || data?.code === PROFILE_NOT_FOUND_ERROR) {
      throw new Error(PROFILE_NOT_FOUND_ERROR);
    }
    if (data?.code === SUPABASE_BACKEND_UNAVAILABLE_ERROR) {
      throw new Error(SUPABASE_BACKEND_UNAVAILABLE_ERROR);
    }
    if (data?.code === PROFILE_BOOTSTRAP_FAILED_ERROR) {
      throw new Error(PROFILE_BOOTSTRAP_FAILED_ERROR);
    }
    if (data?.code === CREDIT_DEDUCTION_FAILED_ERROR) {
      throw new Error(CREDIT_DEDUCTION_FAILED_ERROR);
    }
    throw new Error(data?.error || `AI request failed with status ${response.status}.`);
  }

  const content = data?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('Empty response text from AI endpoint.');
  }

  return { content };
};

const PASS_THROUGH_ERRORS = new Set([
  LOGIN_REQUIRED_ERROR,
  INSUFFICIENT_CREDITS_ERROR,
  PROFILE_NOT_FOUND_ERROR,
  SUPABASE_BACKEND_UNAVAILABLE_ERROR,
  PROFILE_BOOTSTRAP_FAILED_ERROR,
  CREDIT_DEDUCTION_FAILED_ERROR,
]);
const isPassThroughAiError = (error: unknown) => (
  error instanceof Error && PASS_THROUGH_ERRORS.has(error.message)
);

// --- LOCAL PRE-FILTERS ---

// 1. HARD SAFETY BLOCK (Illegal, Hate Speech, Extreme Violence, Self-Harm)
const HARD_BLOCK_REGEX = /\b(nigger|nigga|negro|coon|faggot|fag|dyke|kike|chink|spic|gook|raghead|towelhead|retard|retarded|mongoloid|tranny|shemale|hermaphrodite|rape|rapist|molest|molester|pedophile|pedo|hebephile|ephebophile|cp|child porn|bestiality|zoophilia|necrophilia|incest|kill yourself|kys|suicide|self-harm|terrorist|jihad|isis|taliban|nazi|hitler|holocaust|white power|white supremacy|kkk|school shooter|mass shooting|bomb|behead|decapitate|mutilate|genocide|ethnic cleansing|slave|slavery|lynch|lynching)\b/i;

// 2. MINOR / AGE SAFETY (Underage detection)
const MINOR_SAFETY_REGEX = /\b(jailbait|loli|shota|underage|preteen|hebephile|ephebophile|child porn|cp)\b|(\b(1[0-7]|[0-9])\s*(yo|years?\s*old|yrs?\s*old)\b)/i;

// 3. EXPLICIT SEXUAL CONTEXT
// Intentionally scoped to 18+ sexual language, anatomy, porn, fetish, and solicitation.
// Mild flirting, cheeky tension, and ordinary profanity are allowed for the app's 16+ tone.
const NSFW_WORDS_LIST = [
  "sex", "boobs", "boobies", "boobees", "bobs", "nudes", "naked", "nude", "nipple", "horny", "aroused", "boner", "erection", "erect", "hard-on", "dick", "cock", "pussy", "vagina", "penis", "tits", "areola",
  "orgasm", "gangbang", "bukkake", "creampie", "anal", "oral", "cum", "jizz", "semen", "sperm", "milf", "dilf", "gilf", "bussy",
  "eating out", "69", "doggystyle", "missionary", "cowgirl", "bdsm", "bondage", "dominatrix", "fetish", "kink", "squirt", "gushing",
  "deepthroat", "blowjob", "handjob", "rimjob", "fingering", "fisting", "pegging", "scissoring", "tribadism", "watersports", "scat",
  "golden shower", "hentai", "porn", "xxx", "adult movie", "onlyfans", "fansly", "send nudes", "clit", "vulva", "labia", "asshole",
  "butthole", "anus", "rectum", "stripper", "hooker", "prostitute", "escort", "cunt", "twat", "wank", "masturbate", "dildo",
  "vibrator", "sex toy", "fleshlight", "strap-on", "camgirl", "sugardaddy", "sugarbaby", "cuck", "schlong", "dong", "chode", "taint",
  "gooch", "perineum", "ballbag", "scrotum", "nutsack", "gonads", "foreskin", "smegma", "felching", "snowballing", "motorboat", "queef",
  "rusty trombone", "dirty sanchez", "alabama hot pocket", "cleveland steamer", "yiff", "futa", "ecchi", "bara", "erotic", "sensual", "genitalia", "pubes",
  "phallic", "yoni", "lingam", "coitus", "copulate", "fornicate", "sodomy", "buggery", "onanism", "autoerotic", "frottage", "voyeur",
  "exhibitionist", "nympho", "glory hole", "blue waffle", "lemon party", "tubgirl", "goatse", "meatspin", "2 girls 1 cup", "rule 34",
  "paizuri", "ahegao", "netorare", "ntr",
  // Misspellings and leetspeak variations
  "fuk", "fvck", "dik", "dic", "puss", "pusi", "pusy", "secks", "segs", "c0ck", "p0rn", "cumshot", "titties", "titty",
  "muff", "beaver", "cameltoe", "mooseknuckle", "stiffie", "hardon", "jerk off", "jack off", "fap", "schlick", "rub one out",
  "choke the chicken", "spank the monkey", "intercourse", "raw dog", "bareback", "breast", "breasts", "rapist", "molester", "groomer",
  "pedophile", "pedo", "nonce", "toucher", "bad touch", "incest", "sugar daddy", "sugar baby", "sex worker", "call girl",
  "street walker", "lot lizard", "pimp", "madam", "brothel", "whorehouse", "strip club", "gentlemans club", "lap dance", "private dance",
  "champagne room", "domme", "mistress", "gimp", "leash", "gag", "flogger", "strangle", "asphyxiate", "breathplay", "knifeplay",
  "bloodplay", "enema", "rimming", "anilingus", "cunnilingus", "fellatio", "titjob", "footjob", "gag reflex", "snowball", "felch",
  "sounding", "strap on", "pocket pussy", "vore", "guro", "snuff", "bestiality", "zoophilia", "pubic", "groin", "crotch", "loins",
];

const SIXTEEN_PLUS_TONE_RULES = `
16+ tone target:
- Bold, witty, teasing, confident, and a little suggestive is allowed.
- Mild profanity is fine when it sounds natural, not edgy for its own sake.
- Flirty tension is good; explicit sexual content is not.
- Never write porn language, sexting copy, graphic body-part focus, fetish content, or instructions for sexual acts.
- Keep it emotionally smart, playful, and realistic enough to send in an actual chat.`;

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

  if (isUnsafe) {
    return {
      tease: "Not touching that. Keep it legal, respectful, and sendable.",
      smooth: "Reset the context with something normal and I can help.",
      chaotic: "That prompt needs a life audit before it needs rizz.",
      loveScore: 0,
      potentialStatus: "Blocked",
      analysis: "Request blocked by safety policy before using AI credits."
    };
  }

  let systemInstruction = "";

  const basePrompt = customInstruction
      ? `User will provide you messages someone send to them you will give replies as the user so he can copy them and send to target. Vibe: Custom.
CUSTOM PERSONA INSTRUCTIONS:
"${customInstruction}"`
      : `User will provide you messages someone send to them you will give replies as the user so he can copy them and send to target. Vibe: ${vibe || "Playful"}.`;

  systemInstruction = `${basePrompt}
${SIXTEEN_PLUS_TONE_RULES}

TEASE: Playful teasing, show affection. ${length === 'short' ? '1 line' : length === 'medium' ? '2 lines' : '2-3 sentences'}.
 
SMOOTH: Charismatic, smooth, improve bonding. ${length === 'short' ? '1 line' : length === 'medium' ? '2 lines' : '2-3 sentences'}.
 
CHAOTIC: Awkward humor, relatable jokes, bold but still sendable ${length === 'short' ? '1-2 lines' : length === 'medium' ? '2-3 lines' : '3-4 sentences'}.

RULES:
-Use easy to understand words.
- Dont go out of context.
- NO "Hey", "So", "Well", or generic bot-speak.
- Sound older-teen / young-adult confident, not childish and not pornographic.
- A little jealousy, tension, and cheeky challenge is okay. Explicit sexual acts or anatomy are not.
- Prioritize lines a real person could actually send without sounding cringe or too sanitized.
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
        const completion = await callAiChatCompletion({
          model: getPreferredModel(Boolean(image)),
          messages: messages,
          temperature: 1.3,
          max_tokens: 1000
        });
        const responseText = completion.content;

        if (responseText) {
          let rawData: any;
          try {
            rawData = JSON.parse(cleanJson(responseText));
          } catch (parseError) {
            console.warn("Rizz JSON parse failed, returning sanitized fallback:", parseError);
            const fallback = sanitizeText(responseText).slice(0, 240);
            return {
              tease: fallback || "The reply came back scrambled. Try a shorter prompt.",
              smooth: "Try again with a little more context if you want a cleaner set.",
              chaotic: "The model freestyled off-format, but I caught it before the UI broke.",
              loveScore: 50,
              potentialStatus: "Needs Retry",
              analysis: "The AI returned text instead of the requested JSON format."
            };
          }
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
        if (isPassThroughAiError(e)) throw e;
        
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
    if (isPassThroughAiError(error)) throw error;
    
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

  if (isUnsafe) {
    return {
      bio: '',
      analysis: 'Safety Policy Violation'
    };
  }

  let systemInstruction = "";

  const basePrompt = customInstruction
      ? `You are a dating profile optimizer. Vibe: Custom.
CUSTOM PERSONA INSTRUCTIONS:
"${customInstruction}"`
      : `You are a dating profile optimizer. Vibe: ${vibe || "Attractive"}.`;

  systemInstruction = `${basePrompt}
${SIXTEEN_PLUS_TONE_RULES}
Write a high-impact bio (${length === 'short' ? 'punchy and concise' : length === 'medium' ? 'balanced and engaging' : 'detailed and extensive'}). Do not use emojis unless they are essential for the vibe.
Make it feel 16+: confident, attractive, a little cheeky, and socially sharp.
Avoid anything explicit, horny, porn-coded, or overly try-hard.
Return ONLY raw JSON: {"bio":"<optimized bio>","analysis":"<1 sentence why it works>"}
CRITICAL: ${length === 'short'
        ? 'The bio must be punchy, catchy, and concise (1-2 lines, approx 15-20 words). Avoid being overly wordy.'
        : length === 'medium'
          ? 'The bio must be balanced and engaging (3-4 lines, approx 40-50 words). Avoid being too short or too long.'
          : 'The bio must be detailed and substantial, at least 100 tokens long.'}`;

  let attempts = 0;
  while (attempts < 3) {
    try {
      const completion = await callAiChatCompletion({
        model: getPreferredModel(false),
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: isUnsafe ? "Generate roast." : inputText }
        ],
        temperature: 1.15,
        max_tokens: length === 'short' ? 400 : length === 'medium' ? 600 : 900
      });
      const responseText = completion.content;

      if (responseText) {
        try {
          const rawData = JSON.parse(cleanJson(responseText));
          return sanitizeResponse(rawData) as BioResponse;
        } catch (e) {
          console.warn("Bio JSON parse failed, returning sanitized fallback:", e);
          return {
            bio: sanitizeText(responseText).slice(0, 500) || '',
            analysis: 'The AI returned text instead of the requested JSON format.'
          };
        }
      }

      throw new Error("No response generated.");

    } catch (error: any) {
      if (isPassThroughAiError(error)) throw error;
      
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
${SIXTEEN_PLUS_TONE_RULES}

Tone & Style:
- Casual, text-message style. No jargon. No bullet points, no numbered lists, no bold formatting.
- Speak directly to them in a natural flow. Break it into maybe 2 short paragraphs max (3-5 sentences total).
- Keep the energy bold and modern, but never explicit or porn-coded.
- Advice can be flirty, teasing, jealous, confident, or slightly spicy as long as it stays sendable and non-graphic.

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
      const completion = await callAiChatCompletion({
        model: getPreferredModel(recentMessages.some(message => Boolean(message.image))),
        messages: [{ role: 'system', content: systemInstruction }, ...rawMessages],
        temperature: 1.05,
        max_tokens: 650,
      });
      const rawReply = completion.content;
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
      if (isPassThroughAiError(error)) throw error;
      
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
