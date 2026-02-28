
import React from 'react';

interface GenerateButtonProps {
    loading: boolean;
    loadingMsg: string;
    isPremium: boolean;
    cost: number;
    onClick: () => void;
}

const GenerateButton: React.FC<GenerateButtonProps> = React.memo(({ 
    loading, 
    loadingMsg, 
    isPremium, 
    cost, 
    onClick 
}) => (
    <button
    onClick={onClick}
    disabled={loading}
    className={`w-full py-3.5 md:py-4 rounded-2xl font-bold text-base md:text-lg shadow-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
        isPremium 
        ? "bg-gradient-to-r from-yellow-500 to-amber-600 text-black" 
        : "rizz-gradient text-white"
    }`}
    >
    {loading ? (
        <span className="flex items-center justify-center gap-2 animate-pulse">
        <svg className={`animate-spin h-5 w-5 ${isPremium ? 'text-black' : 'text-white'}`} viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
        {loadingMsg}
        </span>
    ) : (
        isPremium ? "Get Rizz (VIP)" : `Get Rizz (${cost} ⚡)`
    )}
    </button>
));

export default GenerateButton;
