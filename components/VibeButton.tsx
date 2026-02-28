
import React from 'react';

interface VibeButtonProps {
  vibe: { label: string, isPro: boolean };
  isSelected: boolean;
  isPremium: boolean;
  onClick: (v: any) => void;
}

const VibeButton: React.FC<VibeButtonProps> = React.memo(({ vibe, isSelected, isPremium, onClick }) => (
    <button 
        onClick={() => onClick(vibe)}
        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 ${
            isSelected 
            ? 'bg-rose-500/20 border-rose-500 text-rose-300' 
            : vibe.isPro && !isPremium 
              ? 'bg-white/5 border-yellow-500/30 text-white/40 hover:bg-white/10'
              : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
        }`}
    >
        {vibe.label}
        {vibe.isPro && !isPremium && <span className="text-[10px]">🔒</span>}
        {vibe.isPro && isPremium && !isSelected && <span className="text-[10px] text-yellow-500">👑</span>}
    </button>
));

export default VibeButton;
