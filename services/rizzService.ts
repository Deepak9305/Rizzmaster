import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { RizzResponse, BioResponse } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// --- FALLBACK OBJECTS ---
const SAFE_REFUSAL_RIZZ: RizzResponse = {
  tease: "I cannot generate content for that request due to safety guidelines. Please keep it respectful and safe.",
  smooth: "I cannot generate content for that request due to safety guidelines. Please keep it respectful and safe.",
  chaotic: "I cannot generate content for that request due to safety guidelines. Please keep it respectful and safe.",
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
  bio: "I cannot generate content for that request due to safety policies.",
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
  
  // Remove markdown wrapping (case insensitive, global)
  cleaned = cleaned.replace(/```json/gi, '').replace(/```/g, '');
  
  cleaned = cleaned.trim();
  
  // Locate the first '{' and last '}' to strip any preamble/postscript
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1) {
    if (lastBrace !== -1 && lastBrace > firstBrace) {
       cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    } else if (lastBrace === -1) {
       // Attempt basic repair for simple truncation (missing closing brace)
       cleaned = cleaned.substring(firstBrace) + "}";
    }
  }

  try {
    return JSON.parse(cleaned);
  } catch (e) {
    console.error("JSON Parse Error. Raw text:", text);
    return null;
  }
};

/**
 * Helper to extract mime type from base64 string
 */
const getMimeType = (base64: string): string => {
    if (base64.startsWith('data:')) {
        const matches = base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/);
        if (matches && matches.length > 1) {
            return matches[1];
        }
    }
    return 'image/png'; // Default fallback
};

/**
 * Generates Rizz (replies) based on chat context or image
 */
export const generateRizz = async (text: string, imageBase64?: string, vibe?: string): Promise<RizzResponse> => {
  // Always use Flash 3
  const modelName = 'gemini-3-flash-preview';

  const parts: any[] = [];
  
  if (imageBase64) {
    const mimeType = getMimeType(imageBase64);
    const base64Data = imageBase64.includes('base64,') 
        ? imageBase64.split('base64,')[1] 
        : imageBase64;
        
    parts.push({ 
        inlineData: { 
            mimeType: mimeType,
            data: base64Data 
        } 
    });
  }

  // Sanitize inputs: Escape backslashes first, then quotes, replace newlines
  const safeText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
  
  const systemInstruction = `Role: Dating coach. Target: Adults.
Output STRICT JSON. No markdown. No chatter.
Refuse unsafe/minor content with {"potentialStatus":"Blocked","analysis":"Safety","loveScore":0}.`;

  const vibeInstruction = vibe ? `Vibe:${vibe}` : '';
  const promptText = `Context:"${safeText || 'Image'}".${vibeInstruction}
Generate JSON:
tease,smooth,chaotic (<15 words).
loveScore(0-100),potentialStatus,analysis.`;
  
  parts.push({ text: promptText });

  // Retry logic for stability
  for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await ai.models.generateContent({
          model: modelName,
          contents: { parts },
          config: {
            systemInstruction: systemInstruction,
            temperature: 1.2, 
            topP: 0.95,
            topK: 40,
            // Safe buffer to prevent truncation
            maxOutputTokens: 2048,
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
            console.warn("Empty response text received.");
            if (attempt === 1) return SAFE_REFUSAL_RIZZ;
            continue;
        }

        const parsed = parseJSON(outputText);
        if (parsed) {
             // Validate keys exist
            if (!parsed.tease || !parsed.smooth) {
                if (attempt === 1) return ERROR_RIZZ;
                continue;
            }
            return parsed as RizzResponse;
        }
        
        console.warn(`Attempt ${attempt + 1} failed to parse JSON.`);

      } catch (error: any) {
        console.error("Rizz Generation Error:", error);
        if (attempt === 1) return ERROR_RIZZ; 
      }
  }
  return ERROR_RIZZ;
};

/**
 * Generates a dating profile bio
 */
export const generateBio = async (text: string, vibe?: string): Promise<BioResponse> => {
  const modelName = 'gemini-3-flash-preview';
  const safeText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');

  const systemInstruction = `Role: Dating coach. Target: Adults.
Output STRICT JSON. No markdown.
Refuse unsafe with {"bio":"Safety Violation","analysis":"Blocked"}.`;

  const vibeInstruction = vibe ? `Vibe:${vibe}` : '';
  const prompt = `Topic:"${safeText}".${vibeInstruction}
Bio <280 chars. Catchy.`;

  try {
    const response = await ai.models.generateContent({
      model: modelName,
      contents: prompt,
      config: {
        systemInstruction: systemInstruction,
        temperature: 1.2,
        topP: 0.95,
        topK: 40,
        maxOutputTokens: 1024,
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
    if (!outputText) return SAFE_REFUSAL_BIO;

    const parsed = parseJSON(outputText);
    if (!parsed) return ERROR_BIO;

    return parsed as BioResponse;

  } catch (error: any) {
    console.error("Bio Generation Error:", error);
    return ERROR_BIO;
  }
};