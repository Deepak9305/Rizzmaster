// Only clear requests for harmful content are stopped locally. Ambiguous language,
// quoted messages and sensitive support questions are assessed by the model.
const GENERATION_REQUEST = /^(?:please\s+)?(?:write|generate|create|compose|give|send|make)\s+(?:(?:me|us|a|an|some|the|very|more|extremely)\s+)*/i;
const EXPLICIT_REQUEST = /^(?:porn(?:ographic)?|sext(?:ing)?|explicit sexual|graphic sexual|erotic (?:story|scene|roleplay)|(?:blow|hand|rim)job|gangbang|creampie)\b/i;
const COERCION_REQUEST = /^(?:please\s+)?(?:help me|how (?:do|can) i|tell me how to)\s+(?:force|coerce|blackmail|drug)\b.{0,100}\b(?:sex|sexual|nudes|sleep with)\b/i;
const DIRECT_THREAT = /^\s*(?:i(?:'ll| will)|we(?:'ll| will))\s+(?:kill|rape|murder)\s+you\b/i;
const ABUSIVE_GENERATION = /^(?:racial slurs?|hate speech|death threats?|threaten to (?:kill|rape))\b/i;

export const isBlockedRequest = (text: string): boolean => {
  const input = text.trim();
  const requestPrefix = input.match(GENERATION_REQUEST)?.[0];
  const requestedContent = requestPrefix ? input.slice(requestPrefix.length) : '';
  return DIRECT_THREAT.test(input) || COERCION_REQUEST.test(input) ||
    (Boolean(requestPrefix) && (EXPLICIT_REQUEST.test(requestedContent) || ABUSIVE_GENERATION.test(requestedContent)));
};

// Exact, high-confidence terms only. No fuzzy letter substitutions, ordinary
// words, ages or topic labels such as "sex", "abuse" or "suicide".
const OUTPUT_SLURS = /\b(?:nigger|nigga|faggot|kike|raghead)\b/gi;
const OUTPUT_GRAPHIC_TERMS = /\b(?:bukkake|creampie|gangbang|blowjob|handjob|rimjob)\b/gi;

export const sanitizeGeneratedText = (text: string): string => text
  .replace(OUTPUT_SLURS, '[CENSORED]')
  .replace(OUTPUT_GRAPHIC_TERMS, '[NSFW]');
