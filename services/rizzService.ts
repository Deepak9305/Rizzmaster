import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { RizzResponse, BioResponse } from "../types";

// --- CLIENT INITIALIZATION ---

// 1. Gemini Client (For Image/Multimodal Tasks)
const geminiClient = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || process.env.API_KEY || '' });

// 2. Llama Client (Via OpenAI-compatible provider like Groq, OpenRouter, or DeepInfra)
const apiKey = process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY || 'dummy-key';
const baseURL = process.env.LLAMA_BASE_URL || 'https://api.groq.com/openai/v1';

const llamaClient = new OpenAI({ 
    apiKey: apiKey, 
    baseURL: baseURL,
    dangerouslyAllowBrowser: true 
});

// Model Configuration
const GEMINI_MODEL = 'gemini-3-flash-preview';
// Updated to Llama 3.1 as requested
const LLAMA_MODEL = (process.env.LLAMA_MODEL_NAME || 'llama-3.1-70b-versatile'); 

// --- FALLBACK OBJECTS ---
const SAFE_REFUSAL_RIZZ: RizzResponse = {
  tease: "I cannot generate content for that request due to safety guidelines.",
  smooth: "I cannot generate content for that request due to safety guidelines.",
  chaotic: "I cannot generate content for that request due to safety guidelines.",
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
 * Clean and parse JSON from AI response
 */
const parseJSON = (text: string | null | undefined): any => {
  if (!text) return null;
  
  let cleaned = text.trim();
  // Remove markdown wrapping
  cleaned = cleaned.replace(/```json/gi, '').replace(/```/g, '');
  cleaned = cleaned.trim();
  
  // Repair brackets
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace !== -1) {
    if (lastBrace !== -1 && lastBrace > firstBrace) {
       cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    } else if (lastBrace === -1) {
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

const getMimeType = (base64: string): string => {
    if (base64.startsWith('data:')) {
        const matches = base64.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,/);
        if (matches && matches.length > 1) return matches[1];
    }
    return 'image/png';
};

/**
 * GENERATE RIZZ
 */
export const generateRizz = async (text: string, imageBase64?: string, vibe?: string): Promise<RizzResponse> => {
  
  // CASE 1: IMAGE PRESENT (Use Gemini)
  if (imageBase64) {
      console.log("Using Gemini 3 for Image Analysis");
      const parts: any[] = [];
      const mimeType = getMimeType(imageBase64);
      const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
          
      parts.push({ inlineData: { mimeType: mimeType, data: base64Data } });

      const safeText = text.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, ' ');
      const vibeInstruction = vibe ? `Vibe:${vibe}` : 'Vibe:Witty';
      
      const promptText = `Ctx:"${safeText || 'Img'}".${vibeInstruction}.
      Output JSON: tease,smooth,chaotic (natural phrasing, not robotic), loveScore(0-100), potentialStatus, analysis(concise).`;
      
      parts.push({ text: promptText });

      try {
        const response = await geminiClient.models.generateContent({
          model: GEMINI_MODEL,
          contents: { parts },
          config: {
            systemInstruction: `Role: Elite Dating Coach. Tone: Authentic, witty, high-risk/high-reward. Avoid robotic brevity or cringe cliches. Strict JSON.`,
            temperature: 1.4, // High creativity
            topP: 0.95,       // Stabilize high temp
            maxOutputTokens: 1000, // Optimized to 1000
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

        const parsed = parseJSON(response.text);
        if (!parsed || !parsed.tease) return ERROR_RIZZ;
        return parsed as RizzResponse;

      } catch (error) {
        console.error("Gemini Image Error:", error);
        return ERROR_RIZZ;
      }
  }

  // CASE 2: TEXT ONLY (Use Llama)
  else {
      console.log(`Using ${LLAMA_MODEL} for Text Rizz`);

      if (apiKey === 'dummy-key') {
          console.error("API Key missing.");
          return { ...ERROR_RIZZ, analysis: "System Error: Missing API Key" };
      }
      
      const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Witty';
      
      const prompt = `
      CTX: "${text}"
      ${vibeInstruction}
      
      TASK: 3 distinct replies (max 2-3 sentences each). 
      Make them sound human, witty, and calibrated. Avoid being overly brief or robotic.
      
      JSON OUTPUT:
      {
        "tease": "string",
        "smooth": "string",
        "chaotic": "string",
        "loveScore": 0-100,
        "potentialStatus": "Friendzoned"|"Talking"|"Married"|"Blocked",
        "analysis": "1-2 sentences"
      }
      `;

      try {
          const completion = await llamaClient.chat.completions.create({
              model: LLAMA_MODEL,
              messages: [
                  { role: "system", content: "Role: Master Dating Coach. Style: Authentic, magnetic, unpredictable. Avoid generic advice. Output: Valid JSON." },
                  { role: "user", content: prompt }
              ],
              response_format: { type: "json_object" },
              temperature: 1.4, // High Creativity
              top_p: 0.95,      // Stability
              max_tokens: 1000,  // Optimized to 1000
          });

          const content = completion.choices[0].message.content;
          const parsed = parseJSON(content);
          if (!parsed || !parsed.tease) return ERROR_RIZZ;
          return parsed as RizzResponse;

      } catch (error) {
          console.error("Llama Text Error:", error);
          return ERROR_RIZZ;
      }
  }
};

/**
 * GENERATE BIO
 */
export const generateBio = async (text: string, vibe?: string): Promise<BioResponse> => {
  console.log(`Using ${LLAMA_MODEL} for Bio`);

  if (apiKey === 'dummy-key') {
      return { ...ERROR_BIO, analysis: "System Error: Missing API Key" };
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : '';
  
  const prompt = `
  About Me: "${text}"
  ${vibeInstruction}
  
  Task: Dating App Bio (max 280 chars).
  Make it stand out. Not too generic.
  
  JSON Output:
  { "bio": "string", "analysis": "string" }
  `;

  try {
    const completion = await llamaClient.chat.completions.create({
        model: LLAMA_MODEL,
        messages: [
            { role: "system", content: "Role: Profile Optimizer. Style: Magnetic, mysterious, funny. JSON Only." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 1.4,
        top_p: 0.95,
        max_tokens: 1000, // Optimized to 1000
    });

    const content = completion.choices[0].message.content;
    const parsed = parseJSON(content);
    if (!parsed || !parsed.bio) return ERROR_BIO;
    return parsed as BioResponse;

  } catch (error) {
    console.error("Llama Bio Error:", error);
    return ERROR_BIO;
  }
};