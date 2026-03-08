import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CoachMessage } from '../types';
import { generateCoachAdvice } from '../services/rizzService';
import { NativeBridge } from '../services/nativeBridge';

interface RizzCoachProps {
    isOpen: boolean;
    onClose: () => void;
    credits: number;
    onUpdateCredits: (newAmount: number) => void;
    isPremium: boolean;
}

const INITIAL_MESSAGE: CoachMessage = {
    role: 'assistant',
    content: "You came to the right place. I've seen every fumble, every ghost, every 'haha' reply. Tell me your situation and I'll coach you through it. ⚡",
    timestamp: new Date().toISOString(),
};

const TypingIndicator = () => (
    <div className="flex justify-start">
        <div className="flex items-end gap-2">
            {/* Avatar */}
            <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-sm"
                style={{ background: 'linear-gradient(135deg, #FF0080, #7928CA)' }}>
                ⚡
            </div>
            <div className="px-5 py-4 rounded-[1.5rem] rounded-bl-md"
                style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex space-x-1.5 items-center h-4">
                    {[0, 1, 2].map(i => (
                        <span key={i} className="block w-1.5 h-1.5 rounded-full bg-rose-400"
                            style={{ animation: `coachBounce 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                    ))}
                </div>
            </div>
        </div>
    </div>
);

const MessageBubble = ({ msg, index }: { msg: CoachMessage; index: number }) => {
    const isUser = msg.role === 'user';
    return (
        <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1], delay: index === 0 ? 0.1 : 0 }}
            className={`flex items-end gap-2 ${isUser ? 'justify-end' : 'justify-start'}`}
        >
            {/* Coach avatar */}
            {!isUser && (
                <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-sm"
                    style={{ background: 'linear-gradient(135deg, #FF0080, #7928CA)' }}>
                    ⚡
                </div>
            )}

            <div
                className={`max-w-[78%] px-5 py-3.5 text-[15px] leading-relaxed font-medium whitespace-pre-wrap ${isUser
                    ? 'text-white rounded-[1.5rem] rounded-br-md shadow-lg'
                    : 'text-zinc-100 rounded-[1.5rem] rounded-bl-md'
                    }`}
                style={isUser
                    ? { background: 'linear-gradient(135deg, #FF0080 0%, #7928CA 100%)', boxShadow: '0 4px 24px rgba(255,0,128,0.25)' }
                    : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }
                }
            >
                {msg.content}
            </div>
        </motion.div>
    );
};

const RizzCoach: React.FC<RizzCoachProps> = ({ isOpen, onClose, credits, onUpdateCredits, isPremium }) => {
    const [messages, setMessages] = useState<CoachMessage[]>([INITIAL_MESSAGE]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [messages, loading]);

    // Auto-resize textarea
    const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        const ta = e.target;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 128) + 'px';
    };

    const handleSend = async () => {
        const trimmed = input.trim();
        if (!trimmed || loading) return;

        if (!isPremium && credits <= 0) {
            // Inline error message in chat rather than using alert
            const errorMsg: CoachMessage = {
                role: 'assistant',
                content: "You're out of credits. Upgrade to Premium for unlimited coaching sessions. 👑",
                timestamp: new Date().toISOString(),
            };
            setMessages(prev => [...prev, errorMsg]);
            return;
        }

        const userMsg: CoachMessage = { role: 'user', content: trimmed, timestamp: new Date().toISOString() };
        const next = [...messages, userMsg];
        setMessages(next);
        setInput('');
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }
        setLoading(true);

        try {
            NativeBridge.haptic('light');
            const response = await generateCoachAdvice(next);
            const coachMsg: CoachMessage = { role: 'assistant', content: response.reply, timestamp: new Date().toISOString() };
            setMessages(prev => [...prev, coachMsg]);
            if (!isPremium) onUpdateCredits(credits - 1);
            NativeBridge.haptic('medium');
        } catch (err) {
            console.error('Coach error:', err);
            const errMsg: CoachMessage = {
                role: 'assistant',
                content: "Got a connection issue. Try again in a second. 🔁",
                timestamp: new Date().toISOString(),
            };
            setMessages(prev => [...prev, errMsg]);
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    };

    const canSend = input.trim().length > 0 && !loading;

    return (
        <>
            {/* Bounce keyframes injected once */}
            <style>{`
                @keyframes coachBounce {
                    0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
                    40% { transform: translateY(-6px); opacity: 1; }
                }
                @keyframes coachAurora {
                    0% { transform: translate(-10%, -10%) scale(1); }
                    50% { transform: translate(5%, 8%) scale(1.08); }
                    100% { transform: translate(-10%, -10%) scale(1); }
                }
                @keyframes coachPulseRing {
                    0% { transform: scale(1); opacity: 0.6; }
                    100% { transform: scale(1.8); opacity: 0; }
                }
                @keyframes coachSlideUp {
                    from { opacity: 0; transform: translateY(100%); }
                    to   { opacity: 1; transform: translateY(0); }
                }
            `}</style>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        key="coach-screen"
                        initial={{ opacity: 0, y: 60 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 60 }}
                        transition={{ type: 'spring', damping: 26, stiffness: 240 }}
                        className="fixed inset-0 flex flex-col"
                        style={{ background: '#050505', zIndex: 100 }}
                    >
                        {/* ── Aurora background blobs ── */}
                        <div
                            aria-hidden
                            style={{
                                position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0,
                            }}
                        >
                            <div style={{
                                position: 'absolute', width: '70%', height: '70%',
                                top: '-15%', left: '-15%', borderRadius: '50%',
                                background: 'radial-gradient(circle, rgba(255,0,128,0.13) 0%, transparent 70%)',
                                filter: 'blur(60px)',
                                animation: 'coachAurora 18s ease-in-out infinite',
                            }} />
                            <div style={{
                                position: 'absolute', width: '60%', height: '60%',
                                bottom: '10%', right: '-10%', borderRadius: '50%',
                                background: 'radial-gradient(circle, rgba(121,40,202,0.12) 0%, transparent 70%)',
                                filter: 'blur(60px)',
                                animation: 'coachAurora 22s ease-in-out 5s infinite reverse',
                            }} />
                        </div>

                        {/* ── Header ── */}
                        <div
                            className="shrink-0 relative z-10"
                            style={{
                                paddingTop: 'calc(env(safe-area-inset-top) + 1rem)',
                                paddingBottom: '1rem',
                                paddingLeft: '1.25rem',
                                paddingRight: '1.25rem',
                                borderBottom: '1px solid rgba(255,255,255,0.06)',
                                background: 'rgba(5,5,5,0.7)',
                                backdropFilter: 'blur(20px)',
                                WebkitBackdropFilter: 'blur(20px)',
                            }}
                        >
                            <div className="flex items-center gap-4 max-w-2xl mx-auto">
                                {/* Back button */}
                                <button
                                    onClick={onClose}
                                    className="flex items-center justify-center w-9 h-9 rounded-full transition-all active:scale-90"
                                    style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    aria-label="Go back"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white/70" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                                    </svg>
                                </button>

                                {/* Avatar with pulse ring */}
                                <div className="relative shrink-0">
                                    <div style={{
                                        position: 'absolute', inset: '-4px', borderRadius: '50%',
                                        background: 'linear-gradient(135deg, #FF0080, #7928CA)',
                                        animation: 'coachPulseRing 2s ease-out infinite',
                                    }} />
                                    <div
                                        className="relative w-11 h-11 rounded-full flex items-center justify-center text-xl shadow-xl"
                                        style={{ background: 'linear-gradient(135deg, #FF0080 0%, #7928CA 100%)' }}
                                    >
                                        ⚡
                                    </div>
                                </div>

                                {/* Coach identity */}
                                <div className="flex-1 min-w-0">
                                    <h1 className="text-base font-black text-white tracking-tight leading-none">
                                        Rizz Coach
                                    </h1>
                                    <div className="flex items-center gap-1.5 mt-0.5">
                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                                        <span className="text-[11px] text-white/40 font-semibold uppercase tracking-widest">Online · Elite Strategist</span>
                                    </div>
                                </div>

                                {/* Credits pill */}
                                {!isPremium && (
                                    <div
                                        className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                                        style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                                    >
                                        <span className="text-yellow-400">⚡</span>
                                        <span className="text-white/70">{credits}</span>
                                    </div>
                                )}
                                {isPremium && (
                                    <div
                                        className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold"
                                        style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)' }}
                                    >
                                        <span>👑</span>
                                        <span className="text-yellow-400">VIP</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* ── Messages ── */}
                        <div
                            ref={scrollRef}
                            className="flex-1 overflow-y-auto relative z-10 custom-scrollbar"
                            style={{ padding: '1.5rem 1.25rem 1rem' }}
                        >
                            <div className="flex flex-col gap-4 max-w-2xl mx-auto pb-4">
                                {messages.map((msg, i) => (
                                    <MessageBubble key={i} msg={msg} index={i} />
                                ))}
                                {loading && <TypingIndicator />}
                            </div>
                        </div>

                        {/* ── Input bar ── */}
                        <div
                            className="shrink-0 relative z-10"
                            style={{
                                padding: '0.875rem 1.25rem',
                                paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.875rem)',
                                background: 'rgba(5,5,5,0.85)',
                                backdropFilter: 'blur(24px)',
                                WebkitBackdropFilter: 'blur(24px)',
                                borderTop: '1px solid rgba(255,255,255,0.06)',
                            }}
                        >
                            <div
                                className="flex items-end gap-3 max-w-2xl mx-auto rounded-2xl px-4 py-3 transition-all"
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                            >
                                <textarea
                                    ref={textareaRef}
                                    value={input}
                                    onChange={handleInputChange}
                                    onKeyDown={handleKeyDown}
                                    placeholder="What's the situation?"
                                    rows={1}
                                    disabled={loading}
                                    className="flex-1 bg-transparent text-white placeholder-white/25 text-[15px] leading-relaxed resize-none focus:outline-none disabled:opacity-40"
                                    style={{ minHeight: '24px', maxHeight: '128px', fontFamily: 'inherit' }}
                                />
                                <button
                                    onClick={handleSend}
                                    disabled={!canSend}
                                    aria-label="Send"
                                    className="shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 disabled:opacity-30"
                                    style={canSend
                                        ? { background: 'linear-gradient(135deg, #FF0080, #7928CA)', boxShadow: '0 4px 16px rgba(255,0,128,0.35)' }
                                        : { background: 'rgba(255,255,255,0.07)' }
                                    }
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                                    </svg>
                                </button>
                            </div>

                            {!isPremium && credits <= 2 && credits > 0 && (
                                <p className="text-center text-[11px] text-white/25 mt-2 font-medium">
                                    {credits} credit{credits !== 1 ? 's' : ''} left
                                </p>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </>
    );
};

export default RizzCoach;
