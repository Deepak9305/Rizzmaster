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
    { icon: '🧠', label: 'Rizz Coach – Unlimited Messages', sub: 'Full access to every coaching session.' },
    { icon: '📸', label: 'Advanced Photo Analysis', sub: 'Read the screenshot, decode the vibe.' },
    { icon: '🎭', label: 'All Expert Personas', sub: 'Roast Master, Chaotic & more unlocked.' },
    { icon: '✍️', label: 'Custom AI Personas', sub: 'Build your own AI coaching style.' },
    { icon: '📝', label: 'Long-Form Bio Mode', sub: 'Full dating profile rewrites.' },
    { icon: '🚫', label: 'Zero Ads, Forever', sub: 'No interruptions, ever again.' },
    { icon: '🔒', label: 'Saved Rizz Vault', sub: 'Keep your best lines saved forever.' },
];

const PremiumModal: React.FC<PremiumModalProps> = ({ onClose, onUpgrade, onRestore }) => {
    const [selectedPlan, setSelectedPlan] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
    const [prices, setPrices] = useState({ weekly: '$4.99', monthly: '$15.99' });

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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative bg-[#111] rounded-3xl p-6 md:p-8 max-w-sm w-full border border-yellow-500/30 overflow-hidden shadow-2xl shadow-yellow-500/10 animate-scale-in overflow-y-auto max-h-[90dvh]">
                {/* Gold top bar */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600" />

                {/* Close */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-white/30 hover:text-white"
                >
                    ✕
                </button>

                {/* Hero */}
                <div className="text-center mb-5">
                    <div className="w-14 h-14 mx-auto mb-3 bg-yellow-500/10 rounded-full flex items-center justify-center text-2xl border border-yellow-500/20 animate-pulse-glow">
                        👑
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-white mb-1">Unlock God Mode</h2>
                    <p className="text-xs text-white/40">Everything unlocked. No limits. No ads.</p>
                </div>

                {/* Urgency banner */}
                <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl px-3 py-2 mb-5 text-center">
                    <p className="text-[11px] text-rose-300 font-semibold">
                        🔥 &nbsp;Launch pricing — may increase anytime
                    </p>
                </div>

                {/* Features */}
                <ul className="space-y-3 mb-6">
                    {FEATURES.map((f, i) => (
                        <li key={i} className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg bg-yellow-500/8 border border-yellow-500/15 flex items-center justify-center text-sm flex-shrink-0">
                                {f.icon}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="text-sm text-white/90 font-semibold leading-tight">{f.label}</div>
                                <div className="text-[10px] text-white/35 leading-tight mt-0.5">{f.sub}</div>
                            </div>
                            <span className="text-green-500 text-sm flex-shrink-0">✓</span>
                        </li>
                    ))}
                </ul>

                {/* Plan selector */}
                <div className="grid grid-cols-2 gap-3 mb-5">
                    {(['WEEKLY', 'MONTHLY'] as const).map(plan => {
                        const isSelected = selectedPlan === plan;
                        const price = plan === 'WEEKLY' ? prices.weekly : prices.monthly;
                        const label = plan === 'WEEKLY' ? 'Weekly' : 'Monthly';
                        return (
                            <button
                                key={plan}
                                onClick={() => setSelectedPlan(plan)}
                                className={`p-3 rounded-xl border transition-all flex flex-col items-center justify-center text-center relative ${
                                    isSelected
                                        ? 'bg-yellow-500/10 border-yellow-500 text-white shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                                        : 'bg-white/5 border-white/5 text-white/50 hover:bg-white/10'
                                }`}
                            >
                                {plan === 'MONTHLY' && savings && (
                                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-rose-500 to-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-lg">
                                        SAVE {savings}%
                                    </div>
                                )}
                                <span className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">{label}</span>
                                <span className="text-lg font-black text-yellow-400">{price}</span>
                                <span className="text-[9px] text-white/30 mt-0.5">
                                    {plan === 'WEEKLY' ? 'billed weekly' : 'best value'}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* CTA */}
                <button
                    onClick={handleSubscribe}
                    className="w-full py-3 bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-bold rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg flex flex-col items-center leading-tight mb-4 animate-shimmer bg-[length:200%_100%]"
                >
                    <span className="text-sm">
                        {Capacitor.isNativePlatform() ? '🔓 Subscribe & Upgrade' : '🔓 Sign Up to Unlock'}
                    </span>
                    <span className="text-[10px] opacity-80 uppercase mt-0.5">
                        {Capacitor.isNativePlatform()
                            ? (selectedPlan === 'WEEKLY' ? `${prices.weekly} billed weekly` : `${prices.monthly} billed monthly`)
                            : 'Free account required · Takes 30 seconds'}
                    </span>
                </button>

                {/* Footer */}
                <div className="flex flex-col gap-2 items-center">
                    <button
                        onClick={onRestore}
                        className="text-xs text-white/40 hover:text-white/80 underline decoration-white/20 underline-offset-4"
                    >
                        Restore Purchases
                    </button>
                    <p className="text-center text-[10px] text-white/20">
                        Recurring billing. Cancel anytime in App Store / Play Store.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PremiumModal;
