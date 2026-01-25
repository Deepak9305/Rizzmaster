import React from 'react';

interface RizzCardProps {
  label: string;
  content: string;
  icon: string;
  color: string;
  isSaved: boolean;
  onSave: () => void;
  onShare: () => void;
  delay?: number;
}

const RizzCard: React.FC<RizzCardProps> = ({ 
  label, 
  content, 
  icon, 
  color, 
  isSaved, 
  onSave, 
  onShare,
  delay = 0
}) => {
  
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      // We use a simple alert per the app's style, but in a real app a toast would be better.
      // Doing this inside the try block ensures we only alert on success.
      alert("Copied!"); 
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Fallback for older browsers or non-secure contexts could go here,
      // but for this MVP we'll just log it.
    }
  };

  return (
    <div 
      className="glass rounded-2xl p-4 md:p-5 border border-white/5 hover:border-white/20 transition-all duration-300 group opacity-0 animate-fade-in-up"
      style={{ animationDelay: `${delay}s`, animationFillMode: 'forwards' }}
    >
      <div className="flex justify-between items-start mb-2">
        <div className="flex items-center gap-2">
            <span className="text-xl">{icon}</span>
            <span className={`text-xs font-bold uppercase tracking-widest bg-gradient-to-r ${color} bg-clip-text text-transparent`}>
                {label}
            </span>
        </div>
        <div className="flex gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
            <button 
                onClick={handleCopy}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                title="Copy to Clipboard"
            >
               <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
            </button>
            <button 
                onClick={onShare}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors"
                title="Share"
            >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
            </button>
            <button 
                onClick={onSave}
                className={`p-1.5 rounded-lg hover:bg-white/10 transition-colors ${isSaved ? 'text-pink-500' : 'text-white/70 hover:text-pink-400'}`}
                title="Save"
            >
                <svg className="w-4 h-4" fill={isSaved ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
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
};

export default RizzCard;