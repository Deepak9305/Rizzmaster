
import React, { useState, useEffect } from 'react';
import IAPService from '../services/iapService';
import { Capacitor } from '@capacitor/core';
import { NativeBridge } from '../services/nativeBridge';

interface PremiumModalProps {
    onClose: () => void;
    onUpgrade: () => void;  // Called after purchase to update premium state. Plan is handled internally by IAPService.
    onRestore: () => void;
}

const PremiumModal: React.FC<PremiumModalProps> = ({ onClose, onUpgrade, onRestore }) => {
    const [selectedPlan, setSelectedPlan] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
    // Default to user's specified prices as fallback
    const [prices, setPrices] = useState({ weekly: '$4.99', monthly: '$15.99' });

    useEffect(() => {
        // Fetch real prices if native
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

            // Try immediately
            fetchPrices();

            // Retry after a second in case store was initializing
            const timer = setTimeout(fetchPrices, 1500);
            return () => clearTimeout(timer);
        }
    }, []);

    const handleSubscribe = () => {
        NativeBridge.haptic('medium');

        if (Capacitor.isNativePlatform()) {
            IAPService.purchase(selectedPlan);
        } else {
            // Fallback for web demo
            console.log(`Simulating upgrade for ${selectedPlan}`);
            setTimeout(() => onUpgrade(), 1000);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative bg-[#111] rounded-3xl p-6 md:p-8 max-w-sm w-full border border-yellow-500/30 overflow-hidden shadow-2xl shadow-yellow-500/10 animate-scale-in">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600" />

                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-white/30 hover:text-white"
                >
                    ✕
                </button>

                <div className="text-center mb-6">
                    <div className="w-14 h-14 mx-auto mb-3 bg-yellow-500/10 rounded-full flex items-center justify-center text-2xl border border-yellow-500/20 animate-pulse-glow">
                        👑
                    </div>
                    <h2 className="text-xl md:text-2xl font-bold text-white mb-1">Unlock God Mode</h2>
                </div>

                <ul className="space-y-2 mb-6">
                    <li className="flex items-center gap-3 text-sm text-white/80">
                        <span className="text-green-500">✓</span> Unlimited Daily Generations
                    </li>
                    <li className="flex items-center gap-3 text-sm text-white/80">
                        <span className="text-green-500">✓</span> Faster Response Times
                    </li>
                    <li className="flex items-center gap-3 text-sm text-white/80">
                        <span className="text-green-500">✓</span> Advanced Image Analysis
                    </li>
                    <li className="flex items-center gap-3 text-sm text-white/80">
                        <span className="text-green-500">✓</span> Ad-Free Experience
                    </li>
                </ul>

                {/* Plan Selection */}
                <div className="grid grid-cols-2 gap-3 mb-6">
                    <button
                        onClick={() => setSelectedPlan('WEEKLY')}
                        className={`p-3 rounded-xl border transition-all flex flex-col items-center justify-center text-center relative ${selectedPlan === 'WEEKLY' ? 'bg-yellow-500/10 border-yellow-500 text-white shadow-[0_0_15px_rgba(234,179,8,0.2)]' : 'bg-white/5 border-white/5 text-white/50 hover:bg-white/10'}`}
                    >
                        <span className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">Weekly</span>
                        <span className="text-lg font-black text-yellow-400">{prices.weekly}</span>
                    </button>
                    <button
                        onClick={() => setSelectedPlan('MONTHLY')}
                        className={`p-3 rounded-xl border transition-all flex flex-col items-center justify-center text-center relative ${selectedPlan === 'MONTHLY' ? 'bg-yellow-500/10 border-yellow-500 text-white shadow-[0_0_15px_rgba(234,179,8,0.2)]' : 'bg-white/5 border-white/5 text-white/50 hover:bg-white/10'}`}
                    >
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 bg-gradient-to-r from-rose-500 to-red-500 text-white text-[9px] font-bold px-2 py-0.5 rounded-full whitespace-nowrap shadow-lg">
                            SAVE 20%
                        </div>
                        <span className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">Monthly</span>
                        <span className="text-lg font-black text-yellow-400">{prices.monthly}</span>
                    </button>
                </div>

                <button
                    onClick={handleSubscribe}
                    className="w-full py-3 bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-bold rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg flex flex-col items-center leading-tight mb-4 animate-shimmer bg-[length:200%_100%]"
                >
                    <span className="text-sm">Subscribe & Upgrade</span>
                    <span className="text-[10px] opacity-80 uppercase">
                        {selectedPlan === 'WEEKLY'
                            ? `${prices.weekly} billed weekly`
                            : `${prices.monthly} billed monthly`}
                    </span>
                </button>

                <div className="flex flex-col gap-2 items-center">
                    <button
                        onClick={onRestore}
                        className="text-xs text-white/40 hover:text-white/80 underline decoration-white/20 underline-offset-4"
                    >
                        Restore Purchases
                    </button>
                    <p className="text-center text-[10px] text-white/20">
                        Recurring billing. Cancel anytime.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default React.memo(PremiumModal);
