
import React, { memo } from 'react';
import { NativeBridge } from '../services/nativeBridge';
import { useToast } from '../context/ToastContext';

interface RizzCardProps {
  label: string;
  content: string;
  icon: string;
  color: string;
  isSaved: boolean;
  onSave: () => void;
  onShare: () => void;
  onReport: () => void;
  delay?: number;
}

const RizzCard: React.FC<RizzCardProps> = memo(({ 
  label, 
  content, 
  icon, 
  color, 
  isSaved, 
  onSave, 
  onShare,
  onReport,
  delay = 0
}) => {
  const { showToast } = useToast();
  
  const handleCopy = async () => {
    NativeBridge.haptic('light');
    const success = await NativeBridge.copyToClipboard(content);
    if (success) {
      showToast('Copied to clipboard!', 'success');
    }
  };

  return (
    <div 
      className="glass rounded-2xl p-5 md:p-6 border border-white/5 hover:border-white/20 transition-all duration-300 group opacity-0 animate-fade-in-up active:scale-[0.99] relative overflow-hidden"
      style={{ animationDelay: `${delay}s`, animationFillMode: 'forwards' }}
    >
      {/* Background Glow */}
      <div className={`absolute -top-10 -right-10 w-32 h-32 bg-gradient-to-br ${color} opacity-10 blur-3xl rounded-full pointer-events-none`} />

      <div className="flex justify-between items-center mb-3">
        <div className="flex items-center gap-2 select-none">
            <span className="text-2xl filter drop-shadow-md">{icon}</span>
            <span className={`text-xs font-bold uppercase tracking-widest bg-gradient-to-r ${color} bg-clip-text text-transparent`}>
                {label}
            </span>
        </div>
        
        {/* Action Buttons */}
        <div className="flex gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
            <button 
                onClick={onShare}
                className="p-2 rounded-xl hover:bg-white/10 text-white/60 hover:text-white transition-colors active:scale-90"
                title="Share"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
            </button>
            <button 
                onClick={onSave}
                className={`p-2 rounded-xl hover:bg-white/10 transition-colors active:scale-90 ${isSaved ? 'text-pink-500' : 'text-white/60 hover:text-pink-400'}`}
                title="Save"
            >
                <svg className="w-5 h-5" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            </button>
        </div>
      </div>
      
      {/* Content Area */}
      <div 
        className="relative group/content cursor-pointer"
        onClick={handleCopy}
      >
        <div className="text-white text-lg md:text-xl font-medium leading-relaxed tracking-wide py-2 pr-2">
          "{content}"
        </div>
        
        {/* Copy Overlay Hint */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover/content:opacity-100 transition-opacity duration-200 pointer-events-none">
            <div className="bg-black/60 backdrop-blur-sm px-3 py-1 rounded-full text-xs font-bold text-white uppercase tracking-wider transform scale-90 group-hover/content:scale-100 transition-transform">
                Tap to Copy
            </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="mt-4 pt-3 border-t border-white/5 flex justify-between items-center">
         <button 
            onClick={handleCopy}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 active:bg-white/20 transition-all w-full justify-center group/btn"
         >
            <svg className="w-4 h-4 text-white/60 group-hover/btn:text-white transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
            <span className="text-sm font-semibold text-white/80 group-hover/btn:text-white">Copy Text</span>
         </button>
      </div>
    </div>
  );
});

export default RizzCard;
