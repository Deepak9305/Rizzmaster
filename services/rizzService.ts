import { GoogleGenAI, Type } from "@google/genai";
import { RizzResponse, BioResponse } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// STRICTLY use Gemini 3.0 Flash Preview as requested
const MODEL_NAME = 'gemini-3-flash-preview';

/**
 * Helper to safely parse JSON from AI response, handling Markdown and errors
 */
const safeParseJSON = <T>(text: string): T => {
  try {
    return JSON.parse(text) as T;
  } catch (e) {
    // Robustly handle cases where the model might wrap JSON in markdown code blocks
    const jsonMatch = text.match(/```json\s*(\{[\s\S]*\})\s*```/) || text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const cleanJson = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(cleanJson) as T;
      } catch (innerErr) {
        console.error("JSON Parse Error:", innerErr);
        throw new Error("Failed to parse extracted JSON.");
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
    const base64Data = imageBase64.split(',')[1] || imageBase64;
    const mimeMatch = imageBase64.match(/^data:(.*);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : 'image/png';

    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: base64Data
      }
    });
  }

  // Use a separate part for user input
  parts.push({ text: `Chat Context to Reply to: "${text}"` });

  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: { parts },
    config: {
      systemInstruction: `You are a world-class dating coach and "Rizz Master". 
      Generate 3 distinct reply options based on the provided context/image.
      CRITICAL: Keep replies SHORT, PUNCHY, and UNDER 15 WORDS. High impact only. No fluff.
      1. The Tease (playful, slightly roasting, flirty)
      2. The Smooth (charming, direct, confident)
      3. The Chaotic (unpredictable, funny, high risk high reward)
      Also provide a "Love Score" (0-100), a short status label, and a 1-sentence analysis.`,
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
  const response = await ai.models.generateContent({
    model: MODEL_NAME,
    contents: `User details: "${text}"`,
    config: {
      systemInstruction: `Create a catchy, witty, and attractive dating profile bio based on the user details provided.
      Keep it under 280 chars. High impact. Return JSON.`,
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