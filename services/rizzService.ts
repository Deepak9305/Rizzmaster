import { GoogleGenAI, Type } from "@google/genai";
import { RizzResponse, BioResponse } from "../types";

// Initialize Gemini Client
// Note: API Key must be in process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// Strictly use Gemini 3.0 Flash for all operations as requested
const MODEL_NAME = 'gemini-3-flash-preview';

/**
 * Helper to safely parse JSON from AI response, handling Markdown and errors
 */
const safeParseJSON = <T>(text: string): T => {
  try {
    // 1. Try direct parse
    return JSON.parse(text) as T;
  } catch (e) {
    // 2. Try to find JSON block if markdown is present (```json ... ```)
    // This regex looks for the outermost { } pair
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[0]) as T;
      } catch (innerErr) {
        throw new Error("Failed to parse extracted JSON: " + innerErr);
      }
    }
    throw new Error("No valid JSON found in response.");
  }
};

/**
 * Generates Rizz (replies) based on chat context or image
 */
export const generateRizz = async (text: string, imageBase64?: string): Promise<RizzResponse> => {
  const parts: any[] = [];
  
  if (imageBase64) {
    // Extract base64 data and mime type
    const base64Data = imageBase64.split(',')[1] || imageBase64;
    // Try to extract mime type from data URL, default to png if not found
    const mimeMatch = imageBase64.match(/^data:(.*);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: base64Data
      }
    });
  }

  const prompt = `
    You are a world-class dating coach and "Rizz Master". 
    Analyze the following chat context (and image if provided). 
    
    Context: "${text}"

    Generate 3 distinct reply options.
    CRITICAL: Keep replies SHORT, PUNCHY, and UNDER 15 WORDS. High impact only. No fluff.

    1. The Tease (playful, slightly roasting, flirty)
    2. The Smooth (charming, direct, confident)
    3. The Chaotic (unpredictable, funny, high risk high reward)
    
    Also provide a "Love Score" (0-100), a short status label (e.g. "Friendzone", "Soulmates"),
    and a 1-sentence analysis.
  `;

  parts.push({ text: prompt });

  // No try/catch here; let the caller (App.tsx) handle errors to ensure credits are refunded properly.
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: { parts },
    config: {
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

  const textResponse = response.text || "{}";
  return safeParseJSON<RizzResponse>(textResponse);
};

/**
 * Generates a dating profile bio
 */
export const generateBio = async (text: string): Promise<BioResponse> => {
  const prompt = `
    Create a catchy, witty, and attractive dating profile bio based on these details: "${text}"
    Keep it under 280 chars. High impact.
  `;

  // No try/catch here; let the caller (App.tsx) handle errors to ensure credits are refunded properly.
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: prompt,
    config: {
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

  const textResponse = response.text || "{}";
  return safeParseJSON<BioResponse>(textResponse);
};