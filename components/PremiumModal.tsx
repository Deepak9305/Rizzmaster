import React from 'react';

interface PremiumModalProps {
  onClose: () => void;
  onUpgrade: () => void;
}

const PremiumModal: React.FC<PremiumModalProps> = ({ onClose, onUpgrade }) => {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />
      
      <div className="relative bg-[#111] rounded-3xl p-8 max-w-sm w-full border border-yellow-500/30 overflow-hidden shadow-2xl shadow-yellow-500/10">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600" />
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-white/30 hover:text-white"
        >
          ✕
        </button>

        <div className="text-center mb-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-yellow-500/10 rounded-full flex items-center justify-center text-3xl border border-yellow-500/20">
                👑
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">Unlock Rizz God Mode</h2>
            <p className="text-white/50 text-sm">Get unlimited generations and premium models.</p>
        </div>

        <ul className="space-y-4 mb-8">
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

        <button 
            onClick={onUpgrade}
            className="w-full py-4 bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-bold rounded-xl hover:brightness-110 active:scale-95 transition-all shadow-lg"
        >
            Upgrade Now - $4.99/mo
        </button>
        
        <p className="text-center text-[10px] text-white/20 mt-4">
            Recurring billing. Cancel anytime.
        </p>
      </div>
    </div>
  );
};

export default PremiumModal;