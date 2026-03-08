import OpenAI from "openai";
import { ChatMessage, ChatResponse } from "../types";

const apiKey = (import.meta as any).env?.VITE_GROQ_API_KEY || (import.meta as any).env?.VITE_LLAMA_API_KEY || process.env.GROQ_API_KEY || process.env.LLAMA_API_KEY || 'dummy-key';
const baseURL = (import.meta as any).env?.VITE_LLAMA_BASE_URL || process.env.LLAMA_BASE_URL || 'https://api.groq.com/openai/v1';

const llamaClient = new OpenAI({
    apiKey: apiKey,
    baseURL: baseURL,
    dangerouslyAllowBrowser: true
});

const TEXT_MODEL = 'llama-3.1-8b-instant';

const SYSTEM_PROMPT = `You are a smooth, teasing chatbot for the "Rizz Master" app. 
Your goal is to talk to the user with a mix of playful teasing (push-pull) and smooth, confident energy.
- Be witty and slightly challenging.
- Keep it flirtatious but PG-13.
- Never be generic or robotic.
- If the user is being boring, call them out on it smoothly.
- Sometimes be "Too smooth for words", other times be "Playfully teasing".

Return ONLY raw JSON in this format:
{"reply": "your response text here", "vibe": "smooth"}`;

const cleanJson = (text: string): string => {
    if (!text) return '{}';
    let cleaned = text.replace(/```json\n?|```/g, '').trim();
    const firstOpen = cleaned.indexOf('{');
    const lastClose = cleaned.lastIndexOf('}');
    if (firstOpen !== -1 && lastClose !== -1 && lastClose >= firstOpen) {
        cleaned = cleaned.substring(firstOpen, lastClose + 1);
    }
    cleaned = cleaned.replace(/,\s*([}\]])/g, '$1');
    return cleaned;
};

export const generateChatResponse = async (history: ChatMessage[], currentVibe: 'smooth' | 'chaos' = 'smooth'): Promise<ChatResponse> => {
    try {
        let vibeInstruction = "";

        switch (currentVibe) {
            case 'smooth':
                vibeInstruction = "You are incredibly smooth, confident, and low-effort. You never try too hard, but you always know exactly what to say to elevate the conversation. Play it cool and charming.";
                break;
            case 'chaos':
                vibeInstruction = "You are agents of absolute chaos. Take the conversation in wild, unpredictable, and absurdly funny directions. Be unapologetically bold, weird, and unhinged, but keep it PG-13.";
                break;
            default:
                vibeInstruction = "You are incredibly smooth, confident, and low-effort. You never try too hard, but you always know exactly what to say to elevate the conversation. Play it cool and charming.";
                break;
        }

        const dynamicPrompt = `You are "Rizzler Your Wingman" for the "Rizz Master" app. 
Your goal is to talk to the user based on your current vibe setting.
Current Vibe: ${currentVibe.toUpperCase()}

INSTRUCTIONS:
${vibeInstruction}
- Keep it flirtatious but PG-13.
- Never be generic or robotic.
- Respond to the exact context of the user's message.

Return ONLY raw JSON in this format:
{"reply": "your response text here", "vibe": "${currentVibe}"}`;

        const messages = [
            { role: "system", content: dynamicPrompt },
            ...history.map(m => ({ role: m.role, content: m.content }))
        ];

        const completion = await llamaClient.chat.completions.create({
            model: TEXT_MODEL,
            messages: messages as any,
            temperature: 0.8,
            response_format: { type: "json_object" }
        });

        const responseText = completion.choices[0]?.message?.content;
        if (responseText) {
            const cleaned = cleanJson(responseText);
            return JSON.parse(cleaned) as ChatResponse;
        }

        throw new Error("Empty response");
    } catch (error) {
        console.error("Chatbot Service Error:", error);
        return {
            reply: "I'm usually better at this, but my brain just short-circuited. Try again?",
            vibe: "smooth"
        };
    }
};
