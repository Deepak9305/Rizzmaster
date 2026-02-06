import { GoogleGenAI, Type } from "@google/genai";
import { RizzResponse, BioResponse } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// --- FALLBACK OBJECTS ---
const SAFE_REFUSAL_RIZZ: RizzResponse = {
  tease: "I cannot generate content for that request as it involves a minor. Please keep things age-appropriate.",
  smooth: "I cannot generate content for that request as it involves a minor. Please keep things age-appropriate.",
  chaotic: "I cannot generate content for that request as it involves a minor. Please keep things age-appropriate.",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Safety Policy Violation"
};

const ERROR_RIZZ: RizzResponse = {
  tease: "The AI is overloaded. Please try again.",
  smooth: "The AI is overloaded. Please try again.",
  chaotic: "The AI is overloaded. Please try again.",
  loveScore: 0,
  potentialStatus: "Error",
  analysis: "Service temporarily unavailable."
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
const parseJSON = (text: string | undefined): any => {
  if (!text) return null;
  
  // Aggressively clean markdown and whitespace
  let cleaned = text.trim();
  
  // Remove markdown wrapping
  // Handles ```json \n { ... } \n ``` or just ``` { ... } ```
  cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '');
  
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
    // Basic cleanup of base64 if needed
    const base64Data = imageBase64.includes('base64,') 
        ? imageBase64.split('base64,')[1] 
        : imageBase64;
        
    parts.push({ 
        inlineData: { 
            mimeType: 'image/png', // Defaulting to png, usually safe for Gemini even if jpeg
            data: base64Data 
        } 
    });
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

  // Ensure prompt has some text even if empty string passed
  const promptText = `
    Analyze the following chat context (and image if provided). 
    ${vibeInstruction}
    
    Context: "${text || 'No text context provided, analyze image.'}"

    If the context is SAFE (adults only):
    Generate 3 distinct reply options.
    CRITICAL: Keep replies SHORT, PUNCHY, and UNDER 15 WORDS. High impact only. No fluff.

    1. The Tease (playful, slightly roasting, flirty)
    2. The Smooth (charming, direct, confident)
    3. The Chaotic (unpredictable, funny, high risk high reward)
    
    Also provide a "Love Score" (0-100), a short status label (e.g. "Friendzone", "Soulmates"),
    and a 1-sentence analysis.
  `;
  
  parts.push({ text: promptText });

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
    return ERROR_RIZZ; 
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
        return SAFE_REFUSAL_BIO;
    }

    const parsed = parseJSON(outputText);
    if (!parsed) return ERROR_BIO;

    return parsed as BioResponse;

  } catch (error: any) {
    console.error("Bio Generation Error:", error);
    return ERROR_BIO;
  }
};
