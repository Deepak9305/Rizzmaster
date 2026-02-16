import { GoogleGenAI, Type } from "@google/genai";
import Groq from "groq-sdk";
import { RizzResponse, BioResponse } from "../types";

// Initialize Gemini Client (for image processing)
const geminiAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '' });

// Initialize Groq Client (for text generation with Llama)
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || ''
});

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

  // Remove markdown wrapping
  // Handles ```json \n { ... } \n ``` or just ``` { ... } ```
  cleaned = cleaned.replace(/^```(json)?/i, '').replace(/```$/, '');

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
    // Silent fail to return error object
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
  // MODEL ROUTING: Gemini 3 Flash for images, Llama Maverick 4 for text-only
  const useGemini = !!imageBase64;

  // Sanitize inputs
  const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');

  try {
    if (useGemini) {
      // === GEMINI PATH (Image Processing) ===
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

      const systemInstruction = `Role: Dating coach. Target: Adults.
Refuse unsafe/minor content with {"potentialStatus":"Blocked","analysis":"Safety","loveScore":0}.`;

      const vibeInstruction = vibe ? `Vibe:${vibe}` : '';
      const promptText = `Context:"${safeText || 'Image'}".${vibeInstruction}
Output JSON:
tease,smooth,chaotic (<15 words).
loveScore(0-100),potentialStatus,analysis.`;

      parts.push({ text: promptText });

      const response = await geminiAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: { parts },
        config: {
          systemInstruction: systemInstruction,
          temperature: 1.2,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 1000,
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

    } else {
      // === GROQ PATH (Text-Only with Llama) ===
      const vibeInstruction = vibe ? `Vibe: ${vibe}` : '';
      const systemPrompt = `You are a dating coach for adults. Generate rizz lines (flirty responses).
Refuse unsafe/minor content with {"potentialStatus":"Blocked","analysis":"Safety","loveScore":0}.

Output ONLY valid JSON with this exact structure:
{
  "tease": "playful line (<15 words)",
  "smooth": "charming line (<15 words)",
  "chaotic": "bold line (<15 words)",
  "loveScore": 0-100,
  "potentialStatus": "status",
  "analysis": "brief analysis"
}`;

      const userPrompt = `Context: "${safeText}". ${vibeInstruction}
Generate rizz lines as JSON.`;

      const completion = await groq.chat.completions.create({
        model: "llama-4-maverick",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 1.2,
        max_tokens: 1000,
        response_format: { type: "json_object" }
      });

      const outputText = completion.choices[0]?.message?.content;
      if (!outputText) {
        console.warn("Empty response from Groq");
        return ERROR_RIZZ;
      }

      const parsed = parseJSON(outputText);
      if (!parsed) return ERROR_RIZZ;

      // Validate keys exist to prevent blank UI
      if (!parsed.tease || !parsed.smooth) {
        return ERROR_RIZZ;
      }

      return parsed as RizzResponse;
    }

  } catch (error: any) {
    console.error("Rizz Generation Error:", error);
    return ERROR_RIZZ;
  }
};

/**
 * Generates a dating profile bio
 */
export const generateBio = async (text: string, vibe?: string): Promise<BioResponse> => {
  // MODEL ROUTING: Llama Maverick 4 for text-only generation
  const safeText = text.replace(/"/g, '\\"').replace(/\n/g, ' ');

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : '';
  const systemPrompt = `You are a dating coach for adults. Generate catchy dating profile bios.
Refuse unsafe content with {"bio":"Safety Violation","analysis":"Blocked"}.

Output ONLY valid JSON with this exact structure:
{
  "bio": "catchy bio (<280 chars)",
  "analysis": "brief analysis"
}`;

  const userPrompt = `Topic: "${safeText}". ${vibeInstruction}
Generate a bio as JSON.`;

  try {
    const completion = await groq.chat.completions.create({
      model: "llama-4-maverick",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 1.2,
      max_tokens: 800,
      response_format: { type: "json_object" }
    });

    const outputText = completion.choices[0]?.message?.content;
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