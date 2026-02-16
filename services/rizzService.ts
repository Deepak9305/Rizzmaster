import { GoogleGenAI, Type } from "@google/genai";
import OpenAI from "openai";
import { RizzResponse, BioResponse } from "../types";

// --- CLIENT INITIALIZATION ---

// 1. Gemini Client (Kept for reference, but fallback logic removed)
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
// Using Llama 4 Maverick for Text AND Image
const LLAMA_MODEL = (process.env.LLAMA_MODEL_NAME || 'meta-llama/llama-4-maverick-17b-128e-instruct'); 

// --- FALLBACK OBJECTS ---
const SAFE_REFUSAL_RIZZ: RizzResponse = {
  tease: "I cannot generate content for that request due to safety guidelines.",
  smooth: "I cannot generate content for that request due to safety guidelines.",
  chaotic: "I cannot generate content for that request due to safety guidelines.",
  loveScore: 0,
  potentialStatus: "Blocked",
  analysis: "Safety Policy Violation"
};

const createErrorRizz = (msg: string): RizzResponse => ({
  tease: "The AI encountered an error.",
  smooth: "Please try again later.",
  chaotic: "System hiccup.",
  loveScore: 0,
  potentialStatus: "Error",
  analysis: msg.substring(0, 50) // Keep it concise for UI
});

const SAFE_REFUSAL_BIO: BioResponse = {
  bio: "I cannot generate content for that request due to safety policies.",
  analysis: "Safety Policy Violation"
};

const createErrorBio = (msg: string): BioResponse => ({
  bio: "Error generating bio. Please try again.",
  analysis: msg.substring(0, 50)
});

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
  
  // CASE 1: IMAGE PRESENT (Strictly Llama Maverick Vision)
  if (imageBase64) {
      console.log(`Using ${LLAMA_MODEL} for Image Analysis (No Fallback)`);
      const mimeType = getMimeType(imageBase64);
      const base64Data = imageBase64.includes('base64,') ? imageBase64.split('base64,')[1] : imageBase64;
      const imageUrl = `data:${mimeType};base64,${base64Data}`;

      const vibeInstruction = vibe ? `Vibe:${vibe}` : 'Vibe:Witty';
      const promptText = `Ctx:"${text || 'Img'}".${vibeInstruction}.
      Output JSON: tease,smooth,chaotic (Max 1 sentence each), loveScore(0-100), potentialStatus, analysis(Max 5 words).`;

      try {
        // Attempt Llama Vision
        const completion = await llamaClient.chat.completions.create({
            model: LLAMA_MODEL,
            messages: [
                { role: "system", content: "Role: Dating Coach. Tone: Witty. Output: Valid JSON." },
                { 
                    role: "user", 
                    content: [
                        { type: "text", text: promptText },
                        { type: "image_url", image_url: { url: imageUrl } }
                    ]
                }
            ],
            response_format: { type: "json_object" },
            temperature: 1.4,
            top_p: 0.95,
            max_tokens: 200,
        });

        const content = completion.choices[0].message.content;
        const parsed = parseJSON(content);
        if (!parsed || !parsed.tease) throw new Error("Invalid JSON from Llama Vision");
        return parsed as RizzResponse;

      } catch (llamaError: any) {
        // Fallback REMOVED as requested. Directly return error to test Llama.
        console.error(`Llama Vision (${LLAMA_MODEL}) failed:`, llamaError);
        return createErrorRizz(llamaError.message || `Llama (${LLAMA_MODEL}) Vision Failed`);
      }
  }

  // CASE 2: TEXT ONLY (Use Llama Maverick)
  else {
      console.log(`Using ${LLAMA_MODEL} for Text Rizz`);

      if (apiKey === 'dummy-key') {
          console.error("API Key missing.");
          return { ...createErrorRizz("System Error: Missing API Key"), analysis: "System Error: Missing API Key" };
      }
      
      const vibeInstruction = vibe ? `Vibe: ${vibe}` : 'Vibe: Witty';
      
      // Updated prompt for extreme brevity
      const prompt = `
      CTX: "${text}"
      ${vibeInstruction}
      
      TASK: 3 distinct replies (MAX 1 SENTENCE EACH). 
      Keep analysis under 10 words.
      
      JSON OUTPUT:
      {
        "tease": "string",
        "smooth": "string",
        "chaotic": "string",
        "loveScore": 0-100,
        "potentialStatus": "Friendzoned"|"Talking"|"Married"|"Blocked",
        "analysis": "very short"
      }
      `;

      try {
          const completion = await llamaClient.chat.completions.create({
              model: LLAMA_MODEL,
              messages: [
                  { role: "system", content: "Role: Dating Coach. Style: Witty, short. Output: Valid JSON." },
                  { role: "user", content: prompt }
              ],
              response_format: { type: "json_object" },
              temperature: 1.4, 
              top_p: 0.95,      
              max_tokens: 200,
          });

          const content = completion.choices[0].message.content;
          const parsed = parseJSON(content);
          if (!parsed || !parsed.tease) return createErrorRizz("Invalid JSON from Llama");
          return parsed as RizzResponse;

      } catch (error: any) {
          console.error("Llama Text Error:", error);
          return createErrorRizz(error.message || "Llama API Error");
      }
  }
};

/**
 * GENERATE BIO
 */
export const generateBio = async (text: string, vibe?: string): Promise<BioResponse> => {
  console.log(`Using ${LLAMA_MODEL} for Bio`);

  if (apiKey === 'dummy-key') {
      return { ...createErrorBio("System Error: Missing API Key"), analysis: "System Error: Missing API Key" };
  }

  const vibeInstruction = vibe ? `Vibe: ${vibe}` : '';
  
  // Updated prompt for brevity
  const prompt = `
  About Me: "${text}"
  ${vibeInstruction}
  
  Task: Dating Bio (max 150 chars). 
  Analysis: max 5 words.
  
  JSON Output:
  { "bio": "string", "analysis": "string" }
  `;

  try {
    const completion = await llamaClient.chat.completions.create({
        model: LLAMA_MODEL,
        messages: [
            { role: "system", content: "Role: Profile Optimizer. Style: Funny, short. JSON Only." },
            { role: "user", content: prompt }
        ],
        response_format: { type: "json_object" },
        temperature: 1.4, 
        top_p: 0.95,
        max_tokens: 200,
    });

    const content = completion.choices[0].message.content;
    const parsed = parseJSON(content);
    if (!parsed || !parsed.bio) return createErrorBio("Invalid JSON from Llama");
    return parsed as BioResponse;

  } catch (error: any) {
    console.error("Llama Bio Error:", error);
    return createErrorBio(error.message || "Llama API Error");
  }
};