
import { GoogleGenAI, Type } from "@google/genai";
import { RizzResponse, BioResponse } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// --- FALLBACK OBJECTS ---
// Used when the API blocks generation (Safety Filter) or fails to parse
const SAFE_REFUSAL_RIZZ: RizzResponse = {
  tease: "I cannot generate content for that request as it involves a minor. Please keep things age-appropriate.",
  smooth: "I cannot generate content for that request as it involves a minor. Please keep things age-appropriate.",
  chaotic: "I cannot generate content for that request as it involves a minor. Please keep things age-appropriate.",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Safety Policy Violation"
};

const ERROR_RIZZ: RizzResponse = {
  tease: "Error generating response.",
  smooth: "Error generating response.",
  chaotic: "Error generating response.",
  loveScore: 0,
  potentialStatus: "Error",
  analysis: "Please try again."
};

const SAFE_REFUSAL_BIO: BioResponse = {
  bio: "I cannot generate content for that request as it involves a minor. Please keep things age-appropriate.",
  analysis: "Safety Policy Violation"
};

const ERROR_BIO: BioResponse = {
  bio: "Error generating bio. Please try again.",
  analysis: "System Error"
};

/**
 * Clean and parse JSON from AI response, handling Markdown code blocks.
 */
const parseJSON = (text: string): any => {
  if (!text) return null;
  
  let cleaned = text.trim();
  // Remove markdown code blocks if present (e.g. ```json ... ```)
  cleaned = cleaned.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '');
  
  // Locate the first '{' and last '}' to strip any preamble/postscript
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1) {
    cleaned = cleaned.substring(firstBrace, lastBrace + 1);
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON Parse Error. Raw text:", text);
    return null;
  }
};

/**
 * Generates Rizz (replies) based on chat context or image
 */
export const generateRizz = async (text: string, imageBase64?: string, vibe?: string): Promise<RizzResponse> => {
  const modelName = 'gemini-3-flash-preview';

  const parts: any[] = [];
  
  if (imageBase64) {
    const base64Data = imageBase64.split(',')[1] || imageBase64;
    const mimeMatch = imageBase64.match(/^data:(.*);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';
    parts.push({ inlineData: { mimeType, data: base64Data } });
  }

  const vibeInstruction = vibe 
    ? `IMPORTANT: The user specifically wants a "${vibe}" tone for these replies. Adjust the style accordingly.` 
    : '';

  const systemInstruction = `
    You are "Rizz Master", an AI assistant that helps adults generate smooth, respectful, and funny social icebreakers.
    
    CRITICAL SAFETY RULE: You must strictly refuse to generate any romantic, flirtatious, or 'rizz' content involving minors (anyone under 18). 
    
    HOW TO REFUSE:
    If a user mentions a minor, school-age children, or specific ages under 18, you MUST return a VALID JSON object matching the defined schema.
    - Set 'tease', 'smooth', and 'chaotic' fields ALL to exactly: "I cannot generate content for that request as it involves a minor. Please keep things age-appropriate."
    - Set 'loveScore' to 0.
    - Set 'potentialStatus' to "Blocked".
    - Set 'analysis' to "Safety Policy Violation".
    
    Do NOT return plain text. You must ALWAYS return JSON.
  `;

  const prompt = `
    Analyze the following chat context (and image if provided). 
    ${vibeInstruction}
    
    Context: "${text}"

    If the context is SAFE (adults only):
    Generate 3 distinct reply options.
    CRITICAL: Keep replies SHORT, PUNCHY, and UNDER 15 WORDS. High impact only. No fluff.

    1. The Tease (playful, slightly roasting, flirty)
    2. The Smooth (charming, direct, confident)
    3. The Chaotic (unpredictable, funny, high risk high reward)
    
    Also provide a "Love Score" (0-100), a short status label (e.g. "Friendzone", "Soulmates"),
    and a 1-sentence analysis.
  `;

  parts.push({ text: prompt });

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: { parts },
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            tease: { type: Type.STRING },
            smooth: { type: Type.STRING },
            chaotic: { type: Type.STRING },
            loveScore: { type: Type.INTEGER },
            potentialStatus: { type: Type.STRING },
            analysis: { type: Type.STRING },
          },
          required: ["tease", "smooth", "chaotic", "loveScore", "potentialStatus", "analysis"]
        }
      }
    });

    // Check for empty text (Safety Block)
    const outputText = response.text;
    if (!outputText) {
        console.warn("Empty response text received (likely safety block). Returning refusal.");
        return SAFE_REFUSAL_RIZZ;
    }

    const parsed = parseJSON(outputText);
    if (!parsed) return ERROR_RIZZ;
    
    // Validate keys exist to prevent blank UI
    if (!parsed.tease || !parsed.smooth) {
        return ERROR_RIZZ;
    }

    return parsed as RizzResponse;

  } catch (error: any) {
    console.error("Rizz Generation Error:", error);
    // If it's a safety-related error from the SDK, return the refusal message
    // Otherwise return generic error
    return SAFE_REFUSAL_RIZZ; 
  }
};

/**
 * Generates a dating profile bio
 */
export const generateBio = async (text: string, vibe?: string): Promise<BioResponse> => {
  const modelName = 'gemini-3-flash-preview';

  const vibeInstruction = vibe 
    ? `The user specifically wants a "${vibe}" vibe for this bio.` 
    : '';

  const systemInstruction = `
    You are "Rizz Master".
    CRITICAL SAFETY RULE: You must strictly refuse to generate content involving minors (under 18).
    
    HOW TO REFUSE:
    If the user describes a minor, school-age child, or specific age under 18, you MUST return a VALID JSON object.
    - Set 'bio' to: "I cannot generate content for that request as it involves a minor. Please keep things age-appropriate."
    - Set 'analysis' to "Safety Policy Violation".

    Do NOT return plain text. You must ALWAYS return JSON.
  `;

  const prompt = `
    Task: Create a catchy, witty, and attractive dating profile bio based on these details: "${text}"
    ${vibeInstruction}
    Keep it under 280 chars. High impact.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            bio: { type: Type.STRING },
            analysis: { type: Type.STRING },
          },
          required: ["bio", "analysis"]
        }
      }
    });

    const outputText = response.text;
    if (!outputText) {
        console.warn("Empty bio response text received. Returning refusal.");
        return SAFE_REFUSAL_BIO;
    }

    const parsed = parseJSON(outputText);
    if (!parsed) return ERROR_BIO;

    return parsed as BioResponse;

  } catch (error: any) {
    console.error("Bio Generation Error:", error);
    return SAFE_REFUSAL_BIO;
  }
};
