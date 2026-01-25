import { GoogleGenAI, Type } from "@google/genai";
import { RizzResponse, BioResponse } from "../types";

// Initialize Gemini Client
// Note: API Key must be in process.env.API_KEY
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

/**
 * Generates Rizz (replies) based on chat context or image
 */
export const generateRizz = async (text: string, imageBase64?: string): Promise<RizzResponse> => {
  const modelName = 'gemini-3-flash-preview';

  const parts: any[] = [];
  
  if (imageBase64) {
    // Extract base64 data if it contains the prefix
    const base64Data = imageBase64.split(',')[1] || imageBase64;
    parts.push({
      inlineData: {
        mimeType: 'image/png', // Assuming png/jpeg from input, Gemini handles standard image types
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

  try {
    const response = await ai.models.generateContent({
      model: modelName,
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

    let jsonText = response.text || "{}";
    // Clean up potential markdown code blocks
    jsonText = jsonText.replace(/```json|```/g, '').trim();
    return JSON.parse(jsonText) as RizzResponse;
  } catch (error) {
    console.error("Rizz Generation Error:", error);
    // Fallback if API fails
    return {
      tease: "Are you a keyboard? Because you're my type.",
      smooth: "I was just thinking about you.",
      chaotic: "Do you like bread?",
      loveScore: 69,
      potentialStatus: "Connection Error",
      analysis: "AI is napping. You got this."
    };
  }
};

/**
 * Generates a dating profile bio
 */
export const generateBio = async (text: string): Promise<BioResponse> => {
  const modelName = 'gemini-3-flash-preview';

  const prompt = `
    Create a catchy, witty, and attractive dating profile bio based on these details: "${text}"
    Keep it under 280 chars. High impact.
  `;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
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

    let jsonText = response.text || "{}";
    // Clean up potential markdown code blocks
    jsonText = jsonText.replace(/```json|```/g, '').trim();
    return JSON.parse(jsonText) as BioResponse;
  } catch (error) {
    console.error("Bio Generation Error:", error);
    return {
      bio: "Professional napper and snack enthusiast.",
      analysis: "Fallback bio due to connection error."
    };
  }
};