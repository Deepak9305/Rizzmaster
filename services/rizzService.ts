import OpenAI from "openai";
import { RizzResponse, BioResponse, ResponseLength } from "../types";

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

// Pre-compiled global regexes for sanitization â€” built once at module load, not per call.
// Safe to use with String.replace() as it always resets lastIndex after completing.
const HARD_BLOCK_GLOBAL = new RegExp(HARD_BLOCK_REGEX.source, 'gi');
const NSFW_GLOBAL = new RegExp(NSFW_TERMS_REGEX.source, 'gi');
const MINOR_GLOBAL = new RegExp(MINOR_SAFETY_REGEX.source, 'gi');

// Helper to sanitize output text (Post-Processing)
const sanitizeText = (text: string): string => {
  if (!text) return text;
  return text
    .replace(HARD_BLOCK_GLOBAL, "ðŸ¤¬") // Replace hate/violence with Angry Face
    .replace(NSFW_GLOBAL, "ðŸ«£")       // Replace NSFW with Peeking Face
    .replace(MINOR_GLOBAL, "ðŸ”ž");     // Replace Minor terms with No Under 18
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
  vibe?: string | undefined,
  length: ResponseLength = 'short'
): Promise<RizzResponse> => { // Return type simplified for consistency

  // ... (Safety checks remain the same) ...
  const isToxic = HARD_BLOCK_REGEX.test(inputText);
  const isNSFW = NSFW_TERMS_REGEX.test(inputText);
  const isMinor = MINOR_SAFETY_REGEX.test(inputText);

  const isUnsafe = isToxic || isNSFW || isMinor;

  let systemInstruction = "";

  if (isUnsafe) {
    systemInstruction = `SAFETY OVERRIDE. You are "Roast Master". User sent Toxic/NSFW/Underage content.
Task: IGNORE seduction. ROAST their life choices (unemployment, poor social skills). PG-13 only, no explicit terms.
JSON: {tease:roast social skills, smooth:sarcasm about unemployment, chaotic:reality check, loveScore:0, potentialStatus:"Blocked", analysis:why they need a job}
Return ONLY raw JSON.`;
  } else {
    systemInstruction = `You are an elite dating wingman producing top-tier, high-converting rizz. Vibe: ${vibe || "Playful"}.

TEASE: A charming and playful reply, show affection, don't be mean. ${length === 'short' ? '1 line' : length === 'medium' ? '2 lines' : '2-3 sentences'}.
 
SMOOTH: A charismatic reply for the user to send that improves bonding and shows emotional intelligence. ${length === 'short' ? '1 line' : length === 'medium' ? '2 lines' : '2-3 sentences'}.
 
CHAOTIC: A funny, absurdity-filled reply for the user to send. Take a tiny detail and exaggerate it. PG-13, no confusing Gen-Z slang. ${length === 'short' ? '1-2 lines' : length === 'medium' ? '2-3 lines' : '3-4 sentences'}.

RULES:
- NEVER talk to or answer questions from the user of this app. 
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
          : 'Each rizz response (tease, smooth, chaotic) MUST be substantive and at least 2-3 sentences long. Avoid one-liners.'}`;
  }

  try {
    let imageAnalysisContext = "";
    if (image) {
      try {
        const visionCompletion = await llamaClient.chat.completions.create({
          model: VISION_MODEL,
          messages: [
            {
              role: "system",
              content: "You are an expert dating analyst. Briefly describe the contents of this screenshot (chat history, dating profile, etc). Focus ONLY on the text exchange, vibe, and key details. Keep it under 3 sentences."
            },
            {
              role: "user",
              content: [
                { type: "text", text: inputText || "Analyze this screenshot." },
                { type: "image_url", image_url: { url: image } }
              ]
            }
          ],
          temperature: 0.5,
          max_tokens: 300,
        });
        imageAnalysisContext = visionCompletion.choices[0]?.message?.content?.trim() || "";
      } catch (error) {
        console.error("Rizz Vision Error:", error);
        imageAnalysisContext = "[Failed to thoroughly analyze image, proceed with user context only]";
      }
    }

    const messages: any[] = [
      { role: "system", content: systemInstruction }
    ];

    let finalInput = inputText || "Generate rizz.";
    if (imageAnalysisContext) {
      finalInput = `[User provided an image. Image Analysis: ${imageAnalysisContext}]\n\nUser's message: ${finalInput}`;
    }

    messages.push({
      role: "user",
      content: finalInput
    });

    // Retry logic for robustness
    let attempts = 0;
    while (attempts < 2) {
      try {
        const completion = await llamaClient.chat.completions.create({
          model: TEXT_MODEL,
          messages: messages,
          temperature: 0.7,
          max_tokens: 1000,
          response_format: { type: "json_object" }
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
  vibe?: string | undefined,
  length: ResponseLength = 'short'
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
    systemInstruction = `You are a dating profile optimizer. Vibe: ${vibe || "Attractive"}.
Write an emoji-rich bio (${length === 'short' ? 'punchy and concise' : length === 'medium' ? 'balanced and engaging' : 'detailed and extensive'}). Explain why it works.
Return ONLY raw JSON: {"bio":"<optimized bio with emojis>","analysis":"<1 sentence why it works>"}
CRITICAL: ${length === 'short'
        ? 'The bio must be punchy, catchy, and concise (1-2 lines, approx 15-20 words). Avoid being overly wordy.'
        : length === 'medium'
          ? 'The bio must be balanced and engaging (3-4 lines, approx 40-50 words). Avoid being too short or too long.'
          : 'The bio must be detailed and substantial, at least 100 tokens long.'}`;
  }

  try {
    const completion = await llamaClient.chat.completions.create({
      model: TEXT_MODEL,
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: isUnsafe ? "Generate roast." : inputText }
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

/**
 * Generates coaching advice based on conversation history.
 */
export const generateCoachAdvice = async (
  messages: { role: 'user' | 'assistant'; content: string; image?: string | null; systemContext?: string | null; }[],
  shadowNotes?: string,
  vibe?: string
): Promise<{ reply: string; updatedNotes?: string }> => {
  const lastMessage = messages[messages.length - 1]?.content || '';

  const isToxic = HARD_BLOCK_REGEX.test(lastMessage);
  const isNSFW = NSFW_TERMS_REGEX.test(lastMessage);

  let systemInstruction: string;

  if (isToxic || isNSFW) {
    systemInstruction = `You are the Rizz Master Coach. The user sent Toxic or NSFW content.
Refuse to engage. Roast their poor judgment instead â€” PG-13 only.
Reply in plain text, 1-2 sentences max.`;
  } else {
    // PERSONA-SPECIFIC BASE PROMPTS
    let personaBase = "";
    const p = (vibe || "").toLowerCase();

    if (p.includes("bestie")) {
      personaBase = `You are "The Bestie" 💅 — the user's girl best friend. You are sharp, protective, and elite at decoding female psychology. 
IMPORTANT: Always check the 'SHADOW INTEL' for the user's gender/identity. 
- If user is a guy: Treat him as a close guy friend you are helping. NEVER call him "girl", "bestie" (feminine), or "sis" unless he requests it or you are being ironic. 
- If user's gender is unknown: Be warm and gender-neutral until they reveal it. 
Ask "Wait, are you a guy or a girl? I need to know so I can give you the right advice." if it's the first time and not in INTEL.
Your goal: Help them win by explaining what a girl is *actually* thinking. Use '💅' occasionally.`;
    } else if (p.includes("wingman")) {
      personaBase = `You are "The Elite Wingman" 🤘 — a world-class dating strategist. You don't just hype; you provide high-value framing, psychology-based tactics, and game-changing moves.
"We're here to secure the win, King. Momentum is everything." Use '🤘' occasionally. Focus on high-value behavior, scarcity, and emotional hooks. 
ALWAYS provide 'The Read' (subtext) and 'The Line' (specific message) if any text/screenshot is involved. Do not wait for them to ask.`;
    } else if (p.includes("roast")) {
      personaBase = `You are the "Roast Master" 🔥 — witty, slightly arrogant, and savage. You find the funniest, most devastating way to handle a text.
"This text is so bad I'm legally obligated to roast you." Use '🔥' occasionally. Be hilarious and savage. Your goal is to win the conversation by being the funniest person in the room.`;
    } else if (p.includes("chaotic")) {
      personaBase = `You are "The Chaotic" 🃏 — unpredictable and high-risk. You suggest moves that no sane person would, just to see what happens.
"This is boring. Let's blow it up and see if they can handle the heat." Use '🃏' occasionally. Suggest 'Double-or-Nothing' moves that are bold and unexpected.`;
    } else {
      personaBase = `You are "The Elite Wingman" 🤘 — a world-class dating strategist. High-energy, tactical, and always focused on the win. 
"Secure the lead, King. We're playing for keeps." Use '🤘' occasionally.`;
    }

    systemInstruction = `${personaBase}

Tone & Style:
- Casual, text-message style. No jargon. No bullet points, no numbered lists, no bold formatting.
- Speak directly to them in a natural flow. Break it into maybe 2 short paragraphs max (3-5 sentences total).

YOUR CORE MISSION:
1. Respond to what the user said first as your character. If they are just chatting, just chat back.
2. ONLY IF the user provides an image or specifically asks for tactical/rizz help, you MUST include:
   - The Read: A 1-sentence breakdown of the subtext/vibe.
   - The Line: ONE specific message to send, in bold "quotes".
   - The Follow-up: A punchy question to keep them talking to you.
3. If no rizz help is needed, just be the character and have a conversation. 

NEVER use structural labels like "THE READ:", "THE LINE:", or "FOLLOW-UP:". Weave it all naturally.

SHADOW INTEL (Persistent memory):
${shadowNotes || 'No intel yet — start gathering as the user shares.'}

INTEL UPDATE PROTOCOL:
After your response, append the dossier block (<<<INTEL_START>>> ... <<<INTEL_END>>>). Carry over all existing intel.`;
  }

  // Only remember the last 5 messages to keep context focused and save tokens
  const recentMessages = messages.slice(-5);

  const lastRawMessage = recentMessages[recentMessages.length - 1];

  // STEP 1: If there's an image, analyze it with Llama 4 Scout first
  let imageAnalysisContext = "";
  if (lastRawMessage?.image) {
    try {
      const visionCompletion = await llamaClient.chat.completions.create({
        model: VISION_MODEL,
        messages: [
          {
            role: "system",
            content: "You are an expert dating analyst. Briefly describe the contents of this screenshot (chat history, dating profile, etc). Focus ONLY on the text exchange, vibe, and key details. Keep it under 3 sentences."
          },
          {
            role: "user",
            content: [
              { type: "text", text: lastRawMessage.content || "Analyze this screenshot." },
              { type: "image_url", image_url: { url: lastRawMessage.image } }
            ]
          }
        ],
        temperature: 0.5,
        max_tokens: 300,
      });
      imageAnalysisContext = visionCompletion.choices[0]?.message?.content?.trim() || "";
    } catch (error) {
      console.error("Coach Vision Error:", error);
      imageAnalysisContext = "[Failed to thoroughly analyze image, proceed with user context only]";
    }
  }

  // STEP 2: Format messages for the main Llama 3.1 8B Coach model
  const formatted = recentMessages.map(m => {
    let content = m.content;

    // Inject the vision analysis into the prompt for the last message
    if (m === lastRawMessage && imageAnalysisContext) {
      content = `[User provided an image. Image Analysis: ${imageAnalysisContext}]\n\nUser's message: ${content}`;
    }

    // Inject any manual system context (like the "Chat Reply" continuity)
    if (m.systemContext) {
      content = `[System Note: ${m.systemContext}]\n\n${content}`;
    }

    return {
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: content,
    };
  }) as any[];

  try {
    const completion = await llamaClient.chat.completions.create({
      model: TEXT_MODEL,
      messages: [{ role: 'system', content: systemInstruction }, ...formatted],
      temperature: 0.75,
      max_tokens: 650,
    });

    const rawReply = completion.choices[0]?.message?.content?.trim();
    if (!rawReply) throw new Error('No coach response');

    // Strip the hidden intel dossier block before showing to user
    const INTEL_RE = new RegExp('<<<INTEL_START>>>([^]*?)<<<INTEL_END>>>');
    const intelMatch = rawReply.match(INTEL_RE);
    const updatedNotes = intelMatch ? intelMatch[1].trim() : undefined;
    const cleanReply = rawReply.replace(INTEL_RE, '').trim();

    return { reply: sanitizeText(cleanReply), updatedNotes };
  } catch (error) {
    console.error("Coach Service Error:", error);
    return { reply: "Something went wrong on my end. Try again. ðŸ”" };
  }
};

