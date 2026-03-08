import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { generateChatResponse } from '../services/chatbotService';
import { NativeBridge } from '../services/nativeBridge';

interface ChatbotProps {
    onBack: () => void;
    credits: number;
    onUpdateCredits: (newAmount: number) => void;
    isPremium: boolean;
}

const Chatbot: React.FC<ChatbotProps> = ({ onBack, credits, onUpdateCredits, isPremium }) => {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    const [vibe, setVibe] = useState<'smooth' | 'chaos'>('smooth');

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages, loading]);

    const handleSend = async () => {
        if (!input.trim() || loading) return;

        if (!isPremium && credits <= 0) {
            alert("You're out of credits! Upgrade to Premium for unlimited rizz.");
            return;
        }

        const userMessage: ChatMessage = {
            role: 'user',
            content: input,
            timestamp: new Date().toISOString()
        };

        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setInput('');
        setLoading(true);
        NativeBridge.haptic('light');

        try {
            const response = await generateChatResponse(newMessages, vibe);

            const assistantMessage: ChatMessage = {
                role: 'assistant',
                content: response.reply,
                timestamp: new Date().toISOString()
            };

            setMessages(prev => [...prev, assistantMessage]);

            if (!isPremium) {
                onUpdateCredits(credits - 1);
            }

            NativeBridge.haptic('medium');
        } catch (error) {
            console.error("Chat error:", error);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col h-[100dvh] bg-black text-white font-sans">
            {/* Header */}
            <div className="flex flex-col border-b border-white/10 bg-black/50 backdrop-blur-xl sticky top-0 z-10 px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3 shadow-sm">
                <div className="flex items-center mb-4">
                    <button
                        onClick={onBack}
                        className="p-3 -ml-3 text-rose-400 hover:text-rose-300 transition-colors active:scale-95"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                        </svg>
                    </button>
                    <div className="ml-1">
                        <h2 className="text-xl md:text-2xl font-black bg-clip-text text-transparent bg-gradient-to-br from-rose-400 via-rose-300 to-amber-300 tracking-tight leading-none">
                            Rizzler
                        </h2>
                        <span className="text-[11px] font-bold text-white/50 tracking-wide uppercase mt-0.5 block">Your Wingman</span>
                    </div>
                    <div className="ml-auto flex items-center bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                        <span className="text-xs font-bold text-rose-400 mr-1">{isPremium ? '∞' : credits}</span>
                        <span className="text-[10px] text-rose-400/60 font-black tracking-tighter uppercase">Credits</span>
                    </div>
                </div>

                {/* Vibe Selector */}
                <div className="flex bg-white/5 rounded-full p-1 border border-white/10 w-full mb-1">
                    {(['smooth', 'chaos'] as const).map((v) => (
                        <button
                            key={v}
                            onClick={() => {
                                setVibe(v);
                                NativeBridge.haptic('light');
                            }}
                            className={`flex-1 text-sm font-bold items-center justify-center py-2.5 rounded-full transition-all capitalize active:scale-95 ${vibe === v
                                ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25 ring-1 ring-white/10'
                                : 'text-white/40 hover:text-white/80 hover:bg-white/5'
                                }`}
                        >
                            {v}
                        </button>
                    ))}
                </div>
                <div className="text-center mt-1">
                    <p className="text-[9px] text-white/30 uppercase tracking-widest font-bold">
                        {loading ? 'Cooking a reply...' : `Vibe: ${vibe.toUpperCase()}`}
                    </p>
                </div>
            </div>

            {/* Messages */}
            <div
                ref={scrollRef}
                className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth"
            >
                {messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-full opacity-40 text-center px-8">
                        <div className="w-16 h-16 bg-gradient-to-br from-rose-500 to-amber-500 rounded-2xl mb-4 blur-xl animate-pulse" />
                        <p className="text-sm font-medium">Say something boring and see if I can fix it.</p>
                    </div>
                )}

                {messages.map((msg, i) => (
                    <div
                        key={i}
                        className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-fade-in-up`}
                    >
                        <div className={`max-w-[88%] px-4 py-3 rounded-[1.25rem] ${msg.role === 'user'
                            ? 'bg-gradient-to-br from-rose-500 to-rose-600 text-white rounded-tr-sm shadow-md shadow-rose-900/20'
                            : 'bg-white/10 border border-white/10 text-rose-50 rounded-tl-sm backdrop-blur-md shadow-sm'
                            }`}>
                            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        </div>
                    </div>
                ))}

                {loading && (
                    <div className="flex justify-start animate-fade-in">
                        <div className="bg-white/5 border border-white/10 p-4 rounded-2xl rounded-tl-none">
                            <div className="flex space-x-1">
                                <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.3s]" />
                                <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce [animation-delay:-0.15s]" />
                                <div className="w-1.5 h-1.5 bg-rose-400 rounded-full animate-bounce" />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Input */}
            <div className="p-3 bg-black/80 backdrop-blur-xl border-t border-white/10 pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="relative flex items-end max-w-2xl mx-auto">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSend();
                            }
                        }}
                        placeholder="Say something smooth..."
                        className="w-full bg-white/10 border border-white/10 rounded-3xl py-3.5 pl-5 pr-14 text-[15px] focus:outline-none focus:border-rose-500/50 focus:bg-white/15 transition-colors placeholder:text-white/30 resize-none max-h-32 min-h-[52px]"
                        rows={1}
                        style={{ height: input ? 'auto' : '52px' }}
                    />
                    <button
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        className={`absolute right-1.5 bottom-1.5 p-2.5 rounded-full transition-all active:scale-95 ${input.trim() && !loading
                            ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/30'
                            : 'bg-white/10 text-white/30 cursor-not-allowed'
                            }`}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 -rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    );
};

export default Chatbot;
