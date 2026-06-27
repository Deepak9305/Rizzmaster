import React, { useState, useEffect } from 'react';
import IAPService from '../services/iapService';
import { Capacitor } from '@capacitor/core';

interface PremiumModalProps {
    onClose: () => void;
    onUpgrade: (plan: 'WEEKLY' | 'MONTHLY') => void;
    onRestore: () => void;
}

const FEATURES = [
    { icon: '⚡', label: 'Unlimited Daily Rizz', sub: 'No caps. Generate as much as you want.' },
    { icon: '🧠', label: 'Rizz Coach – Unlimited Messages', sub: 'Full access to every coach session.' },
    { icon: '📸', label: 'Advanced Photo Analysis', sub: 'Read the screenshot, decode the vibe.' },
    { icon: '🎭', label: 'All Expert Personas', sub: 'Roast Master, Chaotic & more unlocked.' },
    { icon: '✍️', label: 'Custom AI Personas', sub: 'Build your own AI coaching style.' },
    { icon: '📝', label: 'Long-Form Bio Mode', sub: 'Full dating profile rewrites.' },
    { icon: '🚫', label: 'Zero Ads, Forever', sub: 'No interruptions, ever again.' },
    { icon: '🔒', label: 'Saved Rizz Vault', sub: 'Keep your best lines forever.' },
];

const PremiumModal: React.FC<PremiumModalProps> = ({ onClose, onUpgrade, onRestore }) => {
    const [selectedPlan, setSelectedPlan] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
    const [prices, setPrices] = useState({ weekly: '$4.99', monthly: '$15.99' });
    const [pulse, setPulse] = useState(false);

    useEffect(() => {
        if (Capacitor.isNativePlatform()) {
            const fetchPrices = () => {
                const weeklyPrice = IAPService.getPrice('WEEKLY');
                const monthlyPrice = IAPService.getPrice('MONTHLY');
                if (weeklyPrice || monthlyPrice) {
                    setPrices(prev => ({
                        weekly: weeklyPrice || prev.weekly,
                        monthly: monthlyPrice || prev.monthly
                    }));
                }
            };
            fetchPrices();
            const timer = setTimeout(fetchPrices, 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    // Pulse the CTA every 4s to draw attention
    useEffect(() => {
        const interval = setInterval(() => {
            setPulse(true);
            setTimeout(() => setPulse(false), 600);
        }, 4000);
        return () => clearInterval(interval);
    }, []);

    const handleSubscribe = () => {
        if (Capacitor.isNativePlatform()) {
            IAPService.purchase(selectedPlan);
        } else {
            onUpgrade(selectedPlan);
        }
    };

    const computeSavings = () => {
        const w = parseFloat(prices.weekly.replace(/[^0-9.]/g, ''));
        const m = parseFloat(prices.monthly.replace(/[^0-9.]/g, ''));
        if (!isNaN(w) && !isNaN(m)) {
            const savings = Math.round((1 - (m / 4.33 / w)) * 100);
            return savings > 0 ? savings : null;
        }
        return null;
    };
    const savings = computeSavings();

    return (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)' }}
            />

            {/* Sheet */}
            <div style={{
                position: 'relative', width: '100%', maxWidth: '480px',
                background: 'linear-gradient(180deg, #0e0e0e 0%, #0a0a0a 100%)',
                borderRadius: '28px 28px 0 0',
                border: '1px solid rgba(255,215,0,0.15)',
                borderBottom: 'none',
                padding: '0 0 env(safe-area-inset-bottom)',
                overflowY: 'auto',
                maxHeight: '92dvh',
                boxShadow: '0 -8px 60px rgba(255,180,0,0.12)',
                animation: 'premiumSlideUp 0.45s cubic-bezier(0.16, 1, 0.3, 1)',
            }}>
                <style>{`
                    @keyframes premiumSlideUp {
                        from { transform: translateY(100%); opacity: 0; }
                        to { transform: translateY(0); opacity: 1; }
                    }
                    @keyframes goldShimmer {
                        0% { background-position: -200% center; }
                        100% { background-position: 200% center; }
                    }
                    @keyframes ctaPulse {
                        0%, 100% { box-shadow: 0 0 20px rgba(255,180,0,0.35); }
                        50% { box-shadow: 0 0 40px rgba(255,180,0,0.65); }
                    }
                    @keyframes starFloat {
                        0%, 100% { transform: translateY(0px); }
                        50% { transform: translateY(-4px); }
                    }
                `}</style>

                {/* Gold top bar */}
                <div style={{ width: '100%', height: '3px', background: 'linear-gradient(90deg, transparent, #facc15, #fbbf24, #facc15, transparent)' }} />

                {/* Drag handle */}
                <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '10px' }}>
                    <div style={{ width: '40px', height: '4px', borderRadius: '99px', background: 'rgba(255,255,255,0.15)' }} />
                </div>

                {/* Close */}
                <button
                    onClick={onClose}
                    style={{
                        position: 'absolute', top: '16px', right: '16px', width: '30px', height: '30px',
                        borderRadius: '50%', background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
                        color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: '14px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                >✕</button>

                <div style={{ padding: '4px 20px 24px' }}>

                    {/* Hero */}
                    <div style={{ textAlign: 'center', marginBottom: '16px' }}>
                        <div style={{
                            fontSize: '52px', marginBottom: '6px',
                            animation: 'starFloat 3s ease-in-out infinite',
                            display: 'inline-block',
                            filter: 'drop-shadow(0 0 16px rgba(250,204,21,0.6))',
                        }}>👑</div>
                        <h2 style={{
                            fontSize: '22px', fontWeight: 900, color: 'white',
                            letterSpacing: '-0.03em', lineHeight: 1.1, marginBottom: '6px'
                        }}>
                            Unlock <span style={{
                                background: 'linear-gradient(90deg, #facc15, #fbbf24, #f59e0b, #facc15)',
                                backgroundSize: '200% auto',
                                WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                                animation: 'goldShimmer 3s linear infinite',
                            }}>God Mode</span>
                        </h2>
                        <p style={{ fontSize: '13px', color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>
                            Join <strong style={{ color: 'rgba(255,255,255,0.8)' }}>12,400+</strong> guys who leveled up their dating game this week.
                        </p>
                    </div>

                    {/* Urgency Banner */}
                    <div style={{
                        background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(220,38,38,0.08))',
                        border: '1px solid rgba(239,68,68,0.25)', borderRadius: '12px',
                        padding: '8px 14px', marginBottom: '16px', textAlign: 'center',
                    }}>
                        <p style={{ fontSize: '12px', color: '#fca5a5', fontWeight: 700, margin: 0 }}>
                            🔥 &nbsp;Special launch pricing — may increase at any time
                        </p>
                    </div>

                    {/* Plan selector */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                        {(['WEEKLY', 'MONTHLY'] as const).map(plan => {
                            const isSelected = selectedPlan === plan;
                            const price = plan === 'WEEKLY' ? prices.weekly : prices.monthly;
                            const label = plan === 'WEEKLY' ? 'Weekly' : 'Monthly';
                            const sub = plan === 'WEEKLY' ? 'Billed weekly' : 'Best value';
                            return (
                                <button
                                    key={plan}
                                    onClick={() => setSelectedPlan(plan)}
                                    style={{
                                        position: 'relative', padding: '14px 10px',
                                        borderRadius: '16px', cursor: 'pointer',
                                        border: isSelected ? '2px solid #facc15' : '2px solid rgba(255,255,255,0.08)',
                                        background: isSelected ? 'rgba(250,204,21,0.1)' : 'rgba(255,255,255,0.03)',
                                        transition: 'all 0.2s cubic-bezier(0.16,1,0.3,1)',
                                        boxShadow: isSelected ? '0 0 20px rgba(250,204,21,0.2)' : 'none',
                                        display: 'flex', flexDirection: 'column', alignItems: 'center',
                                    }}
                                >
                                    {plan === 'MONTHLY' && savings && (
                                        <div style={{
                                            position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)',
                                            background: 'linear-gradient(90deg, #ef4444, #dc2626)',
                                            color: 'white', fontSize: '9px', fontWeight: 800,
                                            padding: '2px 8px', borderRadius: '99px', whiteSpace: 'nowrap',
                                            letterSpacing: '0.05em', textTransform: 'uppercase',
                                        }}>
                                            SAVE {savings}%
                                        </div>
                                    )}
                                    <span style={{ fontSize: '11px', color: isSelected ? 'rgba(250,204,21,0.8)' : 'rgba(255,255,255,0.4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>{label}</span>
                                    <span style={{ fontSize: '22px', fontWeight: 900, color: isSelected ? '#facc15' : 'rgba(255,255,255,0.6)' }}>{price}</span>
                                    <span style={{ fontSize: '10px', color: 'rgba(255,255,255,0.3)', marginTop: '2px' }}>{sub}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Feature list */}
                    <div style={{
                        background: 'rgba(255,255,255,0.03)', borderRadius: '16px',
                        border: '1px solid rgba(255,255,255,0.06)', padding: '12px',
                        marginBottom: '18px', display: 'flex', flexDirection: 'column', gap: '10px'
                    }}>
                        {FEATURES.map((f, i) => (
                            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{
                                    width: '34px', height: '34px', borderRadius: '10px', flexShrink: 0,
                                    background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.15)',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '16px',
                                }}>{f.icon}</div>
                                <div>
                                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'white', lineHeight: 1.2 }}>{f.label}</div>
                                    <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.35)', marginTop: '1px' }}>{f.sub}</div>
                                </div>
                                <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                        <path d="M20 6L9 17l-5-5" stroke="#4ade80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* CTA */}
                    <button
                        onClick={handleSubscribe}
                        style={{
                            width: '100%', padding: '16px',
                            background: 'linear-gradient(135deg, #facc15 0%, #f59e0b 50%, #facc15 100%)',
                            backgroundSize: '200% auto',
                            animation: `goldShimmer 3s linear infinite${pulse ? ', ctaPulse 0.6s ease' : ''}`,
                            border: 'none', borderRadius: '16px', cursor: 'pointer',
                            color: '#000', fontWeight: 900, fontSize: '15px',
                            letterSpacing: '-0.01em',
                            boxShadow: '0 4px 24px rgba(250,204,21,0.35)',
                            transition: 'transform 0.15s, box-shadow 0.15s',
                            display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.transform = 'scale(1.02)')}
                        onMouseLeave={e => (e.currentTarget.style.transform = 'scale(1)')}
                    >
                        <span>🔓 {Capacitor.isNativePlatform() ? 'Unlock God Mode Now' : 'Sign Up to Unlock'}</span>
                        <span style={{ fontSize: '11px', fontWeight: 600, opacity: 0.7 }}>
                            {Capacitor.isNativePlatform()
                                ? (selectedPlan === 'WEEKLY' ? `${prices.weekly}/week · Cancel anytime` : `${prices.monthly}/month · Cancel anytime`)
                                : 'Free account required · Takes 30 seconds'}
                        </span>
                    </button>

                    {/* Social proof + restore */}
                    <div style={{ textAlign: 'center', marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <div style={{ display: 'flex' }}>
                                {['#FF0080', '#7928CA', '#FF4D4D', '#0070F3', '#00DFD8'].map((c, i) => (
                                    <div key={i} style={{
                                        width: '20px', height: '20px', borderRadius: '50%',
                                        background: c, border: '1.5px solid #0a0a0a',
                                        marginLeft: i === 0 ? 0 : '-6px',
                                    }} />
                                ))}
                            </div>
                            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
                                ⭐ 4.8 · Loved by 12k+ users
                            </span>
                        </div>
                        <button
                            onClick={onRestore}
                            style={{ fontSize: '11px', color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
                        >
                            Restore Purchases
                        </button>
                        <p style={{ fontSize: '10px', color: 'rgba(255,255,255,0.15)', margin: 0 }}>
                            Recurring subscription. Cancel anytime in App Store / Play Store.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PremiumModal;
