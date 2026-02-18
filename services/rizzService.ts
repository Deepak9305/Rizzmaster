import { GoogleGenAI, Type } from "@google/genai";
import { RizzResponse, BioResponse } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Expanded regex for instant blocking of extreme content to save API calls.
const HATE_SPEECH_REGEX = /\b(suicide|kill yourself|kys|self-harm|die|racist|faggot|fag|retard|retarded|cripple|tranny|shemale|dyke|kike|nigger|nigga|negro|chink|paki|wetback|beaner|gook|raghead)\b/i;

export async function generateRizz(
  text: string, 
  image?: string | null, 
  vibe?: string
): Promise<RizzResponse | { potentialStatus: string; analysis: string; [key: string]: any }> {
    
    // Local pre-check
    if (text && HATE_SPEECH_REGEX.test(text)) {
        return {
            tease: "",
            smooth: "",
            chaotic: "",
            loveScore: 0,
            potentialStatus: "Blocked",
            analysis: "Safety Policy Violation"
        };
    }

    const parts: any[] = [];
    if (image) {
        // Expecting base64 data url from FileReader
        const match = image.match(/^data:(.+);base64,(.+)$/);
        if (match) {
            parts.push({
                inlineData: {
                    mimeType: match[1], // e.g., image/jpeg
                    data: match[2]
                }
            });
        }
    }
    
    let promptText = `
    You are a world-class dating coach and "Rizz Master". 
    Analyze the following conversation context (and image if provided) and generate 3 distinct replies:
    1. Tease (Playful, slightly roasting but flirty)
    2. Smooth (Charming, confident, complimentary)
    3. Chaotic (Unpredictable, funny, bold, maybe a bit unhinged)

    Context: "${text}"
    `;
    
    if (vibe) {
        promptText += `\nVibe: ${vibe}`;
    }

    parts.push({ text: promptText });

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
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
                        analysis: { type: Type.STRING }
                    },
                    required: ["tease", "smooth", "chaotic", "loveScore", "potentialStatus", "analysis"]
                },
                systemInstruction: "You are a helpful dating assistant. Do not generate harmful, hateful, or explicit sexual content. Keep it flirty and fun but within safety guidelines."
            }
        });

        if (response.text) {
             return JSON.parse(response.text) as RizzResponse;
        }
        throw new Error("No text response");
    } catch (error) {
        console.error("Rizz generation error:", error);
        return {
            tease: "",
            smooth: "",
            chaotic: "",
            loveScore: 0,
            potentialStatus: "Error",
            analysis: "System Error"
        };
    }
}

export async function generateBio(
    text: string,
    vibe?: string
): Promise<BioResponse | { analysis: string; [key: string]: any }> {
    
    if (text && HATE_SPEECH_REGEX.test(text)) {
        return { bio: "", analysis: "Safety Policy Violation" };
    }

    const promptText = `
    Create a unique, catchy dating profile bio based on this info: "${text}"
    ${vibe ? `Vibe: ${vibe}` : ''}
    `;

    try {
        const response = await ai.models.generateContent({
            model: 'gemini-3-flash-preview',
            contents: { parts: [{ text: promptText }] },
            config: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        bio: { type: Type.STRING },
                        analysis: { type: Type.STRING }
                    },
                    required: ["bio", "analysis"]
                },
                systemInstruction: "Create a short, magnetic bio. Include emojis. Analysis should explain why it works."
            }
        });

        if (response.text) {
             return JSON.parse(response.text) as BioResponse;
        }
        throw new Error("No text response");

    } catch (error) {
        console.error("Bio generation error:", error);
        return { bio: "", analysis: "System Error" };
    }
}