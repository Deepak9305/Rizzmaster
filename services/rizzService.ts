import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { RizzResponse, BioResponse } from "../types";

// --- CLIENT INITIALIZATION ---

// 1. Gemini Client (For Image/Multimodal Tasks)
const geminiClient = new GoogleGenAI({ apiKey: process.env.API_KEY || '' });

// 2. Llama Client (Via OpenAI-compatible provider like Groq, OpenRouter, or DeepInfra)
// Defaults to Groq URL if not specified, as they are fastest for Llama 3
const llamaClient = new OpenAI({ 
    apiKey: process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY || '', 
    baseURL: process.env.LLAMA_BASE_URL || 'https://api.groq.com/openai/v1',
    dangerouslyAllowBrowser: true 
});

// Model Configuration
const GEMINI_MODEL = 'gemini-3-flash-preview';
// Use environment variable for model name, default to Llama 3.3 70B (Versatile) if missing
const LLAMA_MODEL = (process.env.LLAMA_MODEL_NAME || 'llama-3.3-70b-versatile'); 

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
 * Logic: 
 * - If Image exists -> Use Gemini (Multimodal expert)
 * - If Text only -> Use Llama (Text expert)
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
      const vibeInstruction = vibe ? `Vibe:${vibe}` : '';
      
      const promptText = `Context:"${safeText || 'Image'}".${vibeInstruction}
      Generate JSON:
      tease,smooth,chaotic (<15 words).
      loveScore(0-100),potentialStatus,analysis.`;
      
      parts.push({ text: promptText });

      try {
        const response = await geminiClient.models.generateContent({
          model: GEMINI_MODEL,
          contents: { parts },
          config: {
            systemInstruction: `Role: Dating coach. Target: Adults. Output STRICT JSON. Refuse unsafe content.`,
            temperature: 1.0, 
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
      
      const vibeInstruction = vibe ? `Current Vibe: ${vibe}` : 'Vibe: General/Witty';
      const prompt = `
      CONTEXT: "${text}"
      ${vibeInstruction}

      TASK: Generate 3 replies (tease, smooth, chaotic).
      
      OUTPUT FORMAT (JSON ONLY):
      {
        "tease": "reply string",
        "smooth": "reply string",
        "chaotic": "reply string",
        "loveScore": number 0-100,
        "potentialStatus": "Friendzoned" | "Talking" | "Married" | "Blocked",
        "analysis": "short explanation"
      }
      `;

      try {
          const completion = await llamaClient.chat.completions.create({
              model: LLAMA_MODEL,
              messages: [
                  { role: "system", content: "You are a world-class dating coach. You provide short, punchy, witty replies. You ALWAYS respond in valid JSON." },
                  { role: "user", content: prompt }
              ],
              response_format: { type: "json_object" },
              temperature: 1.1,
              max_tokens: 800,
          });

          const content = completion.choices[0].message.content;
          const parsed = parseJSON(content);
          if (!parsed || !parsed.tease) return ERROR_RIZZ;
          return parsed as RizzResponse;

      } catch (error) {
          console.error("Llama Text Error:", error);
          // Optional: Fallback to Gemini if Llama fails
          return ERROR_RIZZ;
      }
  }
};

/**
 * GENERATE BIO
 * Always uses Llama for better creative writing text capabilities.
 */
export const generateBio = async (text: string, vibe?: string): Promise<BioResponse> => {
  console.log(`Using ${LLAMA_MODEL} for Bio`);

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : '';
  const prompt = `
  TOPIC: "${text}"
  ${vibeInstruction}
  
  TASK: Write a catchy dating profile bio (under 280 chars).
  
  OUTPUT JSON:
  {
    "bio": "string",
    "analysis": "why it works"
  }
  `;

  try {
    const completion = await llamaClient.chat.completions.create({
        model: LLAMA_MODEL,
        messages: [
            { role: "system", content: "You are an expert profile optimizer. You write short, magnetic bios. Output valid JSON." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 1.2,
        max_tokens: 600,
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