import React, { useState, useEffect } from 'react';
import IAPService from '../services/iapService';
import { canUseNativeIap } from '../services/nativeCapabilities';
import PremiumBenefits from './PremiumBenefits';

interface PremiumModalProps {
    onClose: () => void;
    onUpgrade: (plan: 'WEEKLY' | 'MONTHLY') => void;
    onRestore: () => void;
    isGuest?: boolean;
    userId?: string | null;
}


const PremiumModal: React.FC<PremiumModalProps> = ({
    onClose,
    onUpgrade,
    onRestore,
    isGuest = false,
    userId = null,
}) => {
    const [selectedPlan, setSelectedPlan] = useState<'WEEKLY' | 'MONTHLY'>('WEEKLY');
    const [prices, setPrices] = useState({ weekly: '', monthly: '' });
    const [isSubscribing, setIsSubscribing] = useState(false);
    const hasNativePurchases = canUseNativeIap();

    useEffect(() => {
        if (hasNativePurchases) {
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
    }, [hasNativePurchases]);

    const handleSubscribe = async () => {
        if (isSubscribing) return;

        // Guests must sign up first — check before native platform
        if (isGuest) {
            onUpgrade(selectedPlan);
            return;
        }
        if (hasNativePurchases) {
            setIsSubscribing(true);
            try {
                await IAPService.purchase(selectedPlan, userId);
            } finally {
                setIsSubscribing(false);
            }
        } else {
            onUpgrade(selectedPlan);
        }
    };

    return (
        <div className="app-modal fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
                className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                onClick={onClose}
            />

            <div role="dialog" aria-modal="true" aria-labelledby="native-premium-title" className="premium-dialog premium-dialog--native app-card relative bg-[#111] rounded-3xl max-w-sm w-full border border-yellow-500/30 shadow-2xl shadow-yellow-500/10 animate-scale-in">
                {/* Gold top bar */}
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600" />

                {/* Close */}
                <button
                    onClick={onClose}
                    aria-label="Close premium options"
                    className="absolute top-4 right-4 text-white/30 hover:text-white"
                >
                    ✕
                </button>

                {/* Hero */}
                <div className="premium-heading text-center">
                    <div className="premium-crown mx-auto bg-yellow-500/10 rounded-full flex items-center justify-center border border-yellow-500/20">
                        👑
                    </div>
                    <h2 id="native-premium-title" className="text-xl md:text-2xl font-bold text-white mb-1">
                        Unlock God Mode
                    </h2>
                    <p className="text-xs text-white/40">
                        All premium styles. No daily credit limits.
                    </p>
                </div>

                {/* Urgency banner */}

                {/* Features */}
                <PremiumBenefits />

                {/* Plan selector */}
                <div className="premium-plans grid grid-cols-2 gap-3">
                    {(['WEEKLY', 'MONTHLY'] as const).map(plan => {
                        const isSelected = selectedPlan === plan;
                        const price = plan === 'WEEKLY' ? prices.weekly : prices.monthly;
                        const label = plan === 'WEEKLY' ? 'Weekly' : 'Monthly';
                        return (
                            <button
                                key={plan}
                                onClick={() => setSelectedPlan(plan)}
                                disabled={isSubscribing}
                                className={`p-3 rounded-xl border transition-all flex flex-col items-center justify-center text-center relative ${
                                    isSelected
                                        ? 'bg-yellow-500/10 border-yellow-500 text-white shadow-[0_0_15px_rgba(234,179,8,0.2)]'
                                        : 'bg-white/5 border-white/5 text-white/50 hover:bg-white/10'
                                }`}
                            >
                                <span className="text-[10px] font-bold uppercase tracking-wider mb-1 opacity-70">{label}</span>
                                <span className={`${price ? 'text-lg' : 'text-xs'} font-black text-yellow-400`}>{price || 'Price in Google Play'}</span>
                                <span className="text-[9px] text-white/30 mt-0.5">
                                    {plan === 'WEEKLY' ? 'billed weekly' : 'billed monthly'}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* CTA */}
                <button
                    onClick={handleSubscribe}
                    disabled={isSubscribing}
                    className="premium-upgrade w-full py-3 bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-bold rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg flex flex-col items-center leading-tight"
                >
                    <span className="text-sm">
                        {isSubscribing
                            ? 'Connecting to Google Play...'
                            : hasNativePurchases ? '🔓 Subscribe & Upgrade' : '🔓 Sign Up to Unlock'}
                    </span>
                    <span className="text-[10px] opacity-80 uppercase mt-0.5">
                        {hasNativePurchases
                            ? (prices[selectedPlan === 'WEEKLY' ? 'weekly' : 'monthly'] ? (selectedPlan === 'WEEKLY' ? `${prices.weekly} billed weekly` : `${prices.monthly} billed monthly`) : 'Confirm price in Google Play')
                            : 'Free account required · Takes 30 seconds'}
                    </span>
                </button>

                {/* Footer */}
                <div className="premium-footer flex flex-col gap-2 items-center">
                    <button
                        onClick={onRestore}
                        className="text-xs text-white/40 hover:text-white/80 underline decoration-white/20 underline-offset-4"
                    >
                        Restore Purchases
                    </button>
                    <p className="text-center text-[10px] text-white/20">
                        Auto-renews. Cancel in Google Play.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default PremiumModal;
