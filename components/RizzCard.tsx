
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
      className="glass rounded-2xl p-4 md:p-5 border border-white/5 hover:border-white/20 transition-all duration-300 group opacity-0 animate-fade-in-up active:scale-[0.99]"
      style={{ animationDelay: `${delay}s`, animationFillMode: 'forwards' }}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2 select-none">
            <span className="text-xl">{icon}</span>
            <span className={`text-xs font-bold uppercase tracking-widest bg-gradient-to-r ${color} bg-clip-text text-transparent`}>
                {label}
            </span>
        </div>
        <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            <button 
                onClick={handleCopy}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors active:scale-95"
                title="Copy to Clipboard"
            >
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
            </button>
            <button 
                onClick={onSave}
                className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors active:scale-95 ${isSaved ? 'text-pink-500' : 'text-white/70 hover:text-pink-400'}`}
                title="Save"
            >
                <svg className="w-4 h-4" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
            </button>
            <button 
                onClick={onReport}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-red-400 transition-colors active:scale-95"
                title="Report Issue"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" /></svg>
            </button>
        </div>
      </div>
      
      <div 
        className="text-white text-base md:text-lg font-medium leading-relaxed cursor-pointer hover:opacity-80 transition-opacity"
        onClick={handleCopy}
        title="Click to Copy"
      >
        "{content}"
      </div>
    </div>
  );
});

export default RizzCard;
