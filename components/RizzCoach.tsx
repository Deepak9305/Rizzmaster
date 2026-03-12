import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { CoachMessage } from '../types';
import { generateCoachAdvice } from '../services/rizzService';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Capacitor } from '@capacitor/core';
import { useToast } from '../context/ToastContext';

// Inject keyframe styles once at module load — avoids re-comparing the CSS string on every keystroke
if (typeof document !== 'undefined') {
    const STYLE_ID = 'rizz-coach-keyframes';
    if (!document.getElementById(STYLE_ID)) {
        const el = document.createElement('style');
        el.id = STYLE_ID;
        el.textContent = [
            '@keyframes coachBounce { 0%, 80%, 100% { transform: translateY(0); opacity: 0.5; } 40% { transform: translateY(-6px); opacity: 1; } }',
            '@keyframes coachAurora { 0% { transform: translate(-10%, -10%) scale(1); } 50% { transform: translate(5%, 8%) scale(1.08); } 100% { transform: translate(-10%, -10%) scale(1); } }',
            '@keyframes coachPulseRing { 0% { transform: scale(1); opacity: 0.6; } 100% { transform: scale(1.8); opacity: 0; } }',
            '@keyframes coachSlideIn { from { opacity: 0; transform: translateY(48px); } to { opacity: 1; transform: translateY(0); } }',
            '@keyframes coachMsgIn { from { opacity: 0; transform: translateY(16px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }',
            '@keyframes coachEntrance { from { opacity: 0; transform: scale(0.9) translateY(10px); } to { opacity: 1; transform: scale(1) translateY(0); } }',
            'div::-webkit-scrollbar { display: none; }',
        ].join(' ');
        document.head.appendChild(el);
    }
}

interface RizzCoachProps {
    isOpen: boolean;
    onClose: () => void;
    credits: number;
    onUpdateCredits: (newAmountOrUpdater: number | ((prev: number) => number)) => void;
    isPremium: boolean;
    onWatchAd?: () => void;
    onGoPremium?: () => void;
}

const INITIAL_MESSAGE: CoachMessage = {
    role: 'assistant',
    content: "I'm Rizz AI. Tell me what's happening or show me the chat. I'll decode the vibe and give you the perfect move.",
    timestamp: new Date().toISOString()
};

const COACH_VIBES = [
    {
        label: "The Wingman", isPro: false, icon: "🤘",
        welcome: "Yo! I'm your Wingman. What's on your mind? Whether it's the grind, the gym, or the girl, I've got your back.",
        colors: { primary: '#FF0080', secondary: '#7928CA', background: 'rgba(255,0,128,0.13)', glow: 'rgba(255,0,128,0.3)' }
    },
    {
        label: "The Bestie", isPro: false, icon: "💅",
        welcome: "Hey! Your bestie is here. Let's talk—tell me everything about your day or that person you're thinking about.",
        colors: { primary: '#Ec4899', secondary: '#8B5CF6', background: 'rgba(236,72,153,0.13)', glow: 'rgba(236,72,153,0.3)' }
    },
    {
        label: "Roast Master", isPro: true, icon: "🔥",
        welcome: "I'm here. Say something interesting or show me a text that needs a reality check. Don't be boring.",
        colors: { primary: '#F97316', secondary: '#EF4444', background: 'rgba(249,115,22,0.13)', glow: 'rgba(249,115,22,0.3)' }
    },
    {
        label: "The Chaotic", isPro: true, icon: "🃏",
        welcome: "The Chaotic one has entered the chat. Tell me something wild or let's find a way to shake things up.",
        colors: { primary: '#A855F7', secondary: '#22C55E', background: 'rgba(168,85,247,0.13)', glow: 'rgba(168,85,247,0.3)' }
    }
];

const COACH_STORAGE_KEY = 'rizz_coach_messages_v2';
const SHADOW_NOTES_KEY = 'rizz_coach_shadow_notes';
const MAX_STORED_MESSAGES = 50; // cap to avoid localStorage bloat

const TypingIndicator = React.memo(({ icon, colors }: { icon?: string, colors?: any }) => (
    <div style={{ display: 'flex', justifyContent: 'flex-start', animation: 'coachEntrance 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem' }}>
            <div style={{
                width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                background: `linear-gradient(135deg, ${colors?.primary || '#FF0080'}, ${colors?.secondary || '#7928CA'})`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: `0 2px 10px ${colors?.glow || 'rgba(0,0,0,0.3)'}`
            }}>
                <span style={{ fontSize: '14px', lineHeight: 1 }}>{icon || '🥷'}</span>
            </div>
            <div style={{
                padding: '1rem 1.25rem', borderRadius: '1.5rem 1.5rem 1.5rem 4px',
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)'
            }}>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', height: '16px' }}>
                    {[0, 1, 2].map(i => (
                        <span key={i} style={{
                            display: 'block', width: '6px', height: '6px', borderRadius: '50%',
                            background: colors?.primary || '#fb7185', animation: `coachBounce 1.2s ease-in-out ${i * 0.2}s infinite`
                        }} />
                    ))}
                </div>
            </div>
        </div>
    </div>
));

interface MsgProps { msg: CoachMessage; onReport: () => void; icon?: string; colors?: any; }
const MessageBubble = React.memo(({ msg, onReport, icon, colors }: MsgProps) => {
    const isUser = msg.role === 'user';
    const [isHovered, setIsHovered] = useState(false);

    return (
        <div
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            style={{
                display: 'flex', alignItems: 'flex-end', gap: '0.5rem',
                justifyContent: isUser ? 'flex-end' : 'flex-start',
                animation: 'coachEntrance 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) both',
                position: 'relative'
            }}
        >
            {!isUser && (
                <div style={{
                    width: '28px', height: '28px', borderRadius: '50%', flexShrink: 0,
                    background: `linear-gradient(135deg, ${colors?.primary || '#FF0080'}, ${colors?.secondary || '#7928CA'})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 2px 10px ${colors?.glow || 'rgba(0,0,0,0.3)'}`
                }}>
                    <span style={{ fontSize: '14px', lineHeight: 1 }}>{icon || '🥷'}</span>
                </div>
            )}

            <div style={{
                maxWidth: '78%', padding: '0.875rem 1.25rem', fontSize: '15px',
                lineHeight: 1.65, fontWeight: 500, whiteSpace: 'pre-wrap',
                borderRadius: isUser ? '1.5rem 1.5rem 4px 1.5rem' : '1.5rem 1.5rem 1.5rem 4px',
                color: 'white',
                position: 'relative',
                backdropFilter: !isUser ? 'blur(12px)' : 'none',
                WebkitBackdropFilter: !isUser ? 'blur(12px)' : 'none',
                ...(isUser
                    ? { background: `linear-gradient(135deg, ${colors?.primary || '#FF0080'} 0%, ${colors?.secondary || '#7928CA'} 100%)`, boxShadow: `0 4px 24px ${colors?.glow || 'rgba(255,0,128,0.25)'}` }
                    : { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 15px rgba(0,0,0,0.1)' }
                )
            }}>
                {msg.content}

                {/* Report Action */}
                <button
                    onClick={(e) => { e.stopPropagation(); onReport(); }}
                    style={{
                        position: 'absolute',
                        top: '-8px',
                        [isUser ? 'left' : 'right']: '-8px',
                        background: '#1a1a1a',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        cursor: 'pointer',
                        opacity: isHovered ? 1 : 0.25, // Subtly visible for mobile discovery
                        transform: isHovered ? 'scale(1)' : 'scale(0.85)',
                        transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                        zIndex: 10,
                        boxShadow: '0 4px 12px rgba(0,0,0,0.5)'
                    }}
                    title="Report message"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FF0080" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"></path>
                        <line x1="4" y1="22" x2="4" y2="15"></line>
                    </svg>
                </button>
            </div>
        </div>
    );
});

const RizzCoach: React.FC<RizzCoachProps> = ({ isOpen, onClose, credits, onUpdateCredits, isPremium, onWatchAd, onGoPremium }) => {
    const { showToast } = useToast();
    const [messages, setMessages] = useState<CoachMessage[]>(() => {
        try {
            const stored = localStorage.getItem(COACH_STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored) as CoachMessage[];
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch { }
        return [INITIAL_MESSAGE];
    });
    // Rich Shadow Notes — persistent intel dossier for this user's situation
    const [shadowNotes, setShadowNotes] = useState<string>(() => {
        try { return localStorage.getItem(SHADOW_NOTES_KEY) || ''; } catch { return ''; }
    });
    // Uncontrolled textarea: only track empty vs non-empty to avoid re-rendering on every keystroke
    const [hasContent, setHasContent] = useState(false);
    const [image, setImage] = useState<string | null>(null);
    const [selectedVibe, setSelectedVibe] = useState<string | null>("The Wingman");
    const [showVibeDropdown, setShowVibeDropdown] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showOutofCredits, setShowOutOfCredits] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
        }
    }, [messages, loading]);

    // Persist coach history in localStorage whenever messages change (images stripped to save space)
    useEffect(() => {
        try {
            const toStore = messages.slice(-MAX_STORED_MESSAGES).map(m => ({ ...m, image: m.image ? '[Photo]' : null }));
            localStorage.setItem(COACH_STORAGE_KEY, JSON.stringify(toStore));
        } catch { } // Fail silently if quota is exceeded
    }, [messages]);

    const handleInputChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const ta = e.target;
        ta.style.height = 'auto';
        ta.style.height = Math.min(ta.scrollHeight, 128) + 'px';
        // Only flip React state when empty↔non-empty — prevents re-render on every typed character
        const nowHasContent = ta.value.trim().length > 0;
        setHasContent(prev => prev === nowHasContent ? prev : nowHasContent);
    }, []);

    const handleSend = useCallback(async () => {
        const trimmed = textareaRef.current?.value.trim() || '';
        if ((!trimmed && !image) || loading) return;

        if (!isPremium && credits <= 0) {
            setShowOutOfCredits(true);
            return;
        }

        const userMsg: CoachMessage = {
            role: 'user',
            content: trimmed || "Analyze this.",
            image: image,
            timestamp: new Date().toISOString()
        };

        // Capture image status BEFORE clearing state (used for credit cost below)
        const hadImage = !!image;

        const next = [...messages, userMsg];
        setMessages(next);
        if (textareaRef.current) textareaRef.current.value = '';
        setHasContent(false);
        setImage(null);
        if (textareaRef.current) textareaRef.current.style.height = 'auto';
        setLoading(true);

        try {
            const response = await generateCoachAdvice(next, shadowNotes, selectedVibe || undefined);
            // Persist updated intel dossier if the AI tacked one on
            if (response.updatedNotes && response.updatedNotes !== shadowNotes) {
                setShadowNotes(response.updatedNotes);
                try { localStorage.setItem(SHADOW_NOTES_KEY, response.updatedNotes); } catch { }
            }
            setMessages(prev => [...prev, {
                role: 'assistant', content: response.reply, timestamp: new Date().toISOString()
            }]);

            // Image costs 2 credits, text costs 1
            const cost = hadImage ? 2 : 1;
            if (!isPremium) onUpdateCredits((prev) => prev - cost);
        } catch (err) {
            console.error('Coach error:', err);
            setMessages(prev => [...prev, {
                role: 'assistant', content: "Got a connection issue. Try again in a second. 🔁",
                timestamp: new Date().toISOString()
            }]);
        } finally {
            setLoading(false);
        }
    }, [image, loading, isPremium, credits, messages, shadowNotes, onUpdateCredits, showToast, selectedVibe]);

    const handleImageUpload = useCallback(async () => {
        if (!Capacitor.isNativePlatform()) {
            fileInputRef.current?.click();
            return;
        }

        try {
            const photo = await Camera.getPhoto({
                quality: 80,
                allowEditing: false,
                resultType: CameraResultType.DataUrl,
                source: CameraSource.Prompt
            });

            if (photo.dataUrl) {
                setImage(photo.dataUrl);
            }
        } catch (e: any) {
            if (e.message !== 'User cancelled photos app') {
                console.error('Camera Error:', e);
            }
        }
    }, []);

    const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) return; // 5MB limit
            const reader = new FileReader();
            reader.onloadend = () => setImage(reader.result as string);
            reader.readAsDataURL(file);
        }
    }, []);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    }, [handleSend]);

    const handleClearChat = useCallback(() => {
        try { localStorage.removeItem(COACH_STORAGE_KEY); } catch { }
        try { localStorage.removeItem(SHADOW_NOTES_KEY); } catch { }

        const defaultVibe = COACH_VIBES.find(v => v.label === "The Wingman");
        setMessages([{
            role: 'assistant',
            content: defaultVibe?.welcome || INITIAL_MESSAGE.content,
            timestamp: new Date().toISOString()
        }]);
        setShadowNotes('');
        setHasContent(false);
        setSelectedVibe("The Wingman");
        if (textareaRef.current) { textareaRef.current.value = ''; textareaRef.current.style.height = 'auto'; }
    }, []);

    const handleVibeClick = useCallback((vibe: { label: string, isPro: boolean }) => {
        if (vibe.isPro && !isPremium) {
            showToast(`'${vibe.label}' is a Pro vibe!`, 'error');
            onClose(); // Close coach
            setTimeout(() => onGoPremium && onGoPremium(), 300); // Trigger premium modal after transition
            return;
        }
        setSelectedVibe(vibe.label);
    }, [isPremium, onClose, onGoPremium, showToast]);

    const canSend = useMemo(() => (hasContent || image !== null) && !loading, [hasContent, image, loading]);

    const currentTheme = useMemo(() => {
        return COACH_VIBES.find(v => v.label === selectedVibe) || COACH_VIBES[0];
    }, [selectedVibe]);

    if (!isOpen) return null;

    return (
        <>
            <div style={{
                position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
                background: '#050505', zIndex: 100,
            }}>
                {/* Aurora blobs */}
                <div aria-hidden style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
                    <div style={{
                        position: 'absolute', width: '70%', height: '70%', top: '-15%', left: '-15%', borderRadius: '50%',
                        background: `radial-gradient(circle, ${currentTheme.colors.background} 0%, transparent 70%)`,
                        filter: 'blur(60px)', animation: 'coachAurora 18s ease-in-out infinite',
                        willChange: 'transform', transition: 'background 1.5s ease-in-out'
                    }} />
                    <div style={{
                        position: 'absolute', width: '60%', height: '60%', bottom: '10%', right: '-10%', borderRadius: '50%',
                        background: `radial-gradient(circle, ${currentTheme.colors.secondary}14 0%, transparent 70%)`,
                        filter: 'blur(60px)', animation: 'coachAurora 22s ease-in-out 5s infinite reverse',
                        willChange: 'transform', transition: 'background 1.5s ease-in-out'
                    }} />
                </div>

                {/* Header */}
                <div style={{
                    flexShrink: 0, position: 'relative', zIndex: 10,
                    paddingTop: !isPremium ? 'calc(env(safe-area-inset-top) + 44px)' : 'calc(env(safe-area-inset-top) + 0.75rem)',
                    paddingBottom: '0.75rem', paddingLeft: '1.25rem', paddingRight: '1.25rem',
                    borderBottom: '1px solid rgba(255,255,255,0.06)',
                    background: 'rgba(5,5,5,0.75)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', maxWidth: '672px', margin: '0 auto' }}>
                        {/* Back */}
                        <button onClick={onClose} aria-label="Go back"
                            style={{
                                width: '36px', height: '36px', borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', flexShrink: 0, transition: 'transform 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.05)')}
                            onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.7)" strokeWidth={2.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>

                        {/* Pulsing avatar */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                            <div style={{
                                position: 'absolute', inset: '-4px', borderRadius: '50%',
                                background: `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                                animation: 'coachPulseRing 2s ease-out infinite',
                            }} />
                            <div style={{
                                position: 'relative', width: '44px', height: '44px', borderRadius: '50%',
                                background: `linear-gradient(135deg, ${currentTheme.colors.primary} 0%, ${currentTheme.colors.secondary} 100%)`,
                                display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px',
                                boxShadow: `0 4px 20px ${currentTheme.colors.glow}`,
                            }}>
                                <span style={{ fontSize: '24px', lineHeight: 1, paddingTop: '1px' }}>
                                    {COACH_VIBES.find(v => v.label === selectedVibe)?.icon || '🥷'}
                                </span>
                            </div>
                        </div>

                        {/* Identity & Dropdown */}
                        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                            <div style={{ fontSize: '15px', fontWeight: 900, color: 'white', letterSpacing: '-0.02em', lineHeight: 1 }}>Rizz AI</div>
                            <button
                                onClick={() => setShowVibeDropdown(!showVibeDropdown)}
                                style={{
                                    display: 'flex', alignItems: 'center', gap: '4px', marginTop: '4px',
                                    padding: '3px 9px', borderRadius: '10px',
                                    background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                                    cursor: 'pointer', transition: 'background 0.2s', width: 'fit-content',
                                    maxWidth: '130px' // Prevent overlap on smaller screens
                                }}
                                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
                            >
                                <span style={{
                                    fontSize: '10.5px', color: 'rgba(255,255,255,0.9)', fontWeight: 700,
                                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                                    flex: 1
                                }}>
                                    {`Expert: ${selectedVibe || 'The Wingman'}`}
                                </span>
                                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} style={{ opacity: 0.7, flexShrink: 0 }}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                                </svg>
                            </button>
                        </div>

                        {/* Credits / Premium pill */}
                        {!isPremium ? (
                            <div
                                onClick={() => showToast("Credits reset to 5 daily. Extra ad credits do not stack.", "info")}
                                style={{
                                    flexShrink: 0, display: 'flex', alignItems: 'center', gap: '6px',
                                    padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                                    cursor: 'pointer'
                                }}
                            >
                                <span style={{ color: '#facc15' }}>⚡</span>
                                <span style={{ color: 'rgba(255,255,255,0.7)' }}>{credits}</span>
                            </div>
                        ) : (
                            <div style={{
                                flexShrink: 0, display: 'flex', alignItems: 'center', gap: '4px',
                                padding: '6px 12px', borderRadius: '999px', fontSize: '12px', fontWeight: 700,
                                background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.25)'
                            }}>
                                <span>👑</span>
                                <span style={{ color: '#facc15' }}>VIP</span>
                            </div>
                        )}
                        {/* Clear chat — shown when history exists */}
                        {messages.length > 1 && (
                            <button
                                onClick={handleClearChat}
                                aria-label="Clear chat history"
                                style={{
                                    flexShrink: 0, width: '32px', height: '32px', borderRadius: '50%',
                                    border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.04)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: 'pointer', opacity: 0.5, transition: 'opacity 0.2s', padding: 0,
                                }}
                                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                                onMouseLeave={e => (e.currentTarget.style.opacity = '0.5')}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="rgba(255,255,255,0.65)" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                </svg>
                            </button>
                        )}
                    </div>
                </div>

                {/* Vibe Dropdown Menu */}
                {showVibeDropdown && (
                    <div style={{
                        position: 'absolute', top: 'calc(env(safe-area-inset-top) + 80px)', left: '50%', transform: 'translateX(-50%) translateZ(0)',
                        background: 'rgba(20,20,20,0.98)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
                        border: '1px solid rgba(255,255,255,0.12)', borderRadius: '16px', padding: '8px',
                        display: 'flex', flexDirection: 'column', gap: '4px', zIndex: 100, width: '220px',
                        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                        animation: 'coachMsgIn 0.2s cubic-bezier(0.16,1,0.3,1)',
                        willChange: 'transform, opacity'
                    }}>
                        {COACH_VIBES.map((vibe) => (
                            <button
                                key={vibe.label}
                                onClick={() => {
                                    handleVibeClick({ label: vibe.label, isPro: vibe.isPro });
                                    if (!vibe.isPro || isPremium) setShowVibeDropdown(false);
                                }}
                                style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                    textAlign: 'left', padding: '10px 12px', background: selectedVibe === vibe.label ? 'rgba(255,0,128,0.15)' : 'transparent',
                                    border: 'none', borderRadius: '10px', color: selectedVibe === vibe.label ? '#FF0080' : 'rgba(255,255,255,0.8)',
                                    fontSize: '14px', fontWeight: selectedVibe === vibe.label ? 700 : 500, cursor: 'pointer'
                                }}
                            >
                                <span>{vibe.icon} {vibe.label}</span>
                                {vibe.isPro && !isPremium && <span style={{ fontSize: '12px' }}>🔒</span>}
                                {vibe.isPro && isPremium && selectedVibe !== vibe.label && <span style={{ fontSize: '12px', opacity: 0.5 }}>👑</span>}
                            </button>
                        ))}
                    </div>
                )}

                {/* Backdrop handler to close dropdown */}
                {showVibeDropdown && (
                    <div onClick={() => setShowVibeDropdown(false)} style={{ position: 'absolute', inset: 0, zIndex: 90 }} />
                )}

                {/* Messages */}
                <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', position: 'relative', zIndex: 10, padding: '1rem 1.25rem 0.5rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', maxWidth: '672px', margin: '0 auto', paddingBottom: '0.75rem' }}>
                        {messages.map((msg, i) => (
                            <MessageBubble
                                key={i}
                                msg={msg}
                                onReport={() => showToast("Report received! We'll review this. 🤝", 'success')}
                                icon={currentTheme.icon}
                                colors={currentTheme.colors}
                            />
                        ))}
                        {loading && <TypingIndicator icon={currentTheme.icon} colors={currentTheme.colors} />}
                    </div>
                </div>

                {/* Input Container Wrapper */}
                <div style={{
                    flexShrink: 0, position: 'relative', zIndex: 10,
                    padding: '0 0 calc(env(safe-area-inset-bottom) + 0.625rem)',
                    background: 'rgba(5,5,5,0.8)', backdropFilter: 'blur(32px)', WebkitBackdropFilter: 'blur(32px)',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                }}>

                    {/* Quick-Tap Prompts */}
                    {messages.length === 1 && !loading && !image && (
                        <div style={{
                            padding: '10px 16px 0', display: 'flex', gap: '8px', overflowX: 'auto',
                            WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none',
                            animation: 'coachEntrance 0.5s ease-out'
                        }}>
                            {[
                                { text: "She left me on read 📵", icon: "📵" },
                                { text: "She's going cold 🥶", icon: "🥶" },
                                { text: "Help me ask her out 🍷", icon: "🍷" }
                            ].map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        if (textareaRef.current) {
                                            textareaRef.current.value = prompt.text;
                                            textareaRef.current.style.height = 'auto';
                                            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + 'px';
                                            textareaRef.current.focus();
                                        }
                                        setHasContent(true);
                                    }}
                                    style={{
                                        whiteSpace: 'nowrap', padding: '10px 16px', background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
                                        color: 'rgba(255,255,255,0.9)', fontSize: '13.5px', fontWeight: 600,
                                        cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0
                                    }}
                                >
                                    {prompt.text}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Image Preview Area */}
                    {image && (
                        <div style={{ padding: '12px 20px 0', display: 'flex' }}>
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                <img src={image} alt="Upload preview" style={{ height: '70px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', objectFit: 'cover' }} />
                                <button
                                    onClick={() => setImage(null)}
                                    style={{
                                        position: 'absolute', top: '-8px', right: '-8px', width: '24px', height: '24px',
                                        background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)', padding: 0,
                                        borderRadius: '50%', color: 'white', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer'
                                    }}
                                >✕</button>
                            </div>
                        </div>
                    )}

                    {/* Input Area */}
                    <div style={{ padding: '6px 16px 12px' }}>
                        <div style={{
                            display: 'flex', alignItems: 'flex-end', gap: '8px', maxWidth: '672px', margin: '0 auto',
                            borderRadius: '1.25rem', padding: '8px 8px 8px 16px',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                            <button
                                onClick={handleImageUpload}
                                style={{
                                    flexShrink: 0, width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
                                    borderRadius: '10px', transition: 'all 0.2s', padding: '0'
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                </svg>
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleFileInput} accept="image/*" style={{ display: 'none' }} />

                            <textarea
                                ref={textareaRef}
                                defaultValue=""
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                placeholder={image ? "Add context..." : "What's the situation?"}
                                rows={1}
                                disabled={loading}
                                style={{
                                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                                    color: 'white', fontSize: '15px', lineHeight: 1.6, resize: 'none',
                                    fontFamily: 'inherit', minHeight: '24px', maxHeight: '128px',
                                    opacity: loading ? 0.4 : 1,
                                }}
                            />
                            <button onClick={handleSend} disabled={!canSend} aria-label="Send"
                                style={{
                                    flexShrink: 0, width: '40px', height: '40px', borderRadius: '50%', border: 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: canSend ? 'pointer' : 'not-allowed', opacity: canSend ? 1 : 0.4,
                                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)', paddingLeft: '2px',
                                    transform: canSend ? 'scale(1)' : 'scale(0.9)',
                                    ...(canSend
                                        ? {
                                            background: `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                                            boxShadow: `0 4px 16px ${currentTheme.colors.glow}`,
                                            animation: 'coachPulseRing 2s infinite'
                                        }
                                        : { background: 'rgba(255,255,255,0.1)' }
                                    )
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white">
                                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                    {!isPremium && credits <= 2 && credits > 0 && (
                        <p
                            onClick={() => showToast("Credits reset to 5 daily. Extra ad credits do not stack.", "info")}
                            style={{ textAlign: 'center', fontSize: '11px', color: 'rgba(255,255,255,0.25)', marginTop: '8px', fontWeight: 500, cursor: 'pointer' }}
                        >
                            {credits} credit{credits !== 1 ? 's' : ''} left
                        </p>
                    )}
                </div>

                {/* Out of Credits Modal */}
                {
                    showOutofCredits && (
                        <div style={{
                            position: 'absolute', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center',
                            background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)'
                        }}>
                            <div style={{
                                background: '#111', borderRadius: '24px', padding: '24px', width: '85%', maxWidth: '320px',
                                border: '1px solid rgba(255,255,255,0.1)', textAlign: 'center',
                                animation: 'coachMsgIn 0.3s cubic-bezier(0.16,1,0.3,1)'
                            }}>
                                <h3 style={{ color: 'white', fontSize: '20px', fontWeight: 900, marginBottom: '8px' }}>Out of Credits</h3>
                                <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: '14px', marginBottom: '24px', lineHeight: 1.5 }}>
                                    You need more juice to keep the wingman active. Watch a quick ad or go Unlimited.
                                </p>

                                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                    <button
                                        onClick={() => { setShowOutOfCredits(false); onWatchAd?.(); }}
                                        style={{
                                            background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)',
                                            color: 'white', fontWeight: 700, padding: '14px', borderRadius: '16px',
                                            display: 'flex', alignItems: 'center', justifyItems: 'center', justifyContent: 'center', gap: '8px',
                                            cursor: 'pointer'
                                        }}>
                                        <span style={{ fontSize: '18px' }}>📺</span> Watch Ad (+5)
                                    </button>
                                    <button
                                        onClick={() => { setShowOutOfCredits(false); onGoPremium?.(); }}
                                        style={{
                                            background: 'linear-gradient(to right, #d97706, #d97706)',
                                            border: 'none', color: 'black', fontWeight: 900, padding: '14px', borderRadius: '16px',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                                            cursor: 'pointer', boxShadow: '0 4px 12px rgba(217,119,6,0.2)'
                                        }}>
                                        <span style={{ fontSize: '18px' }}>👑</span> Go Unlimited
                                    </button>
                                    <button
                                        onClick={() => setShowOutOfCredits(false)}
                                        style={{
                                            background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)',
                                            fontSize: '13px', padding: '8px', marginTop: '4px', cursor: 'pointer', fontWeight: 600
                                        }}>
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div >
        </>
    );
};

export default RizzCoach;
