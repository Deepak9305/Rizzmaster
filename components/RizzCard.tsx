
import React, { memo, useRef, useState } from 'react';
import { NativeBridge } from '../services/nativeBridge';
import { useToast } from '../context/ToastContext';
import { toPng } from 'html-to-image';

interface RizzCardProps {
  label: string;
  content: string;
  icon: string;
  color: string;
  isSaved: boolean;
  onSave: () => void;
  onShare: () => void; // Kept for backward compatibility or analytics if needed
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
  const cardRef = useRef<HTMLDivElement>(null);
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  
  const handleCopy = async () => {
    NativeBridge.haptic('light');
    const success = await NativeBridge.copyToClipboard(content);
    if (success) {
      showToast('Copied to clipboard!', 'success');
    }
  };

  const handleImageShare = async () => {
    if (isGeneratingImage || !cardRef.current) return;
    
    setIsGeneratingImage(true);
    NativeBridge.haptic('medium');
    
    try {
        // Small delay to ensure rendering
        await new Promise(resolve => setTimeout(resolve, 100));

        // Generate Image
        const dataUrl = await toPng(cardRef.current, {
            cacheBust: true,
            pixelRatio: 2, // Reduced from 3 to 2 to prevent memory crashes on some devices
            backgroundColor: '#000000',
            style: {
                transform: 'scale(1)',
                opacity: '1',
                margin: '0',
            }
        });

        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'rizz-master.png', { type: 'image/png' });

        // Check if sharing files is supported
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: 'Rizz Master',
                text: 'Check this out! ⚡',
            });
            showToast('Shared successfully!', 'success');
        } else {
            // Fallback to text share if file sharing not supported
            onShare();
        }

    } catch (err) {
        console.warn('Image generation/share failed, falling back to text', err);
        // Fallback to standard text share
        onShare();
    } finally {
        setIsGeneratingImage(false);
    }
  };

  return (
    <>
    {/* Hidden Capture Element - Optimized for Image Generation */}
    <div 
        ref={cardRef}
        className="fixed top-[-9999px] left-[-9999px] w-[600px] p-12 bg-black text-white rounded-3xl overflow-hidden flex flex-col justify-center items-center text-center border-[12px] border-zinc-900"
        style={{ fontFamily: 'Inter, sans-serif' }}
    >
        {/* Background Gradient Blob */}
        <div className={`absolute top-0 right-0 w-[400px] h-[400px] bg-gradient-to-br ${color} opacity-20 blur-[100px] rounded-full pointer-events-none`} />
        <div className={`absolute bottom-0 left-0 w-[300px] h-[300px] bg-gradient-to-tr ${color} opacity-10 blur-[80px] rounded-full pointer-events-none`} />

        <div className="relative z-10 flex flex-col items-center gap-6">
            <div className="flex items-center gap-3 mb-4">
                <span className="text-6xl filter drop-shadow-lg">{icon}</span>
                <div className="flex flex-col items-start">
                    <span className={`text-2xl font-black uppercase tracking-widest bg-gradient-to-r ${color} bg-clip-text text-transparent`}>
                        {label}
                    </span>
                    <span className="text-zinc-500 text-sm font-bold tracking-wider uppercase">Rizz Master AI</span>
                </div>
            </div>

            <div className="text-4xl font-bold leading-tight tracking-tight text-white/95 max-w-[90%]">
                "{content}"
            </div>

            <div className="mt-8 pt-6 border-t border-white/10 w-full flex justify-center">
                <div className="px-6 py-2 bg-white/10 rounded-full text-white/60 text-lg font-medium">
                    rizzmaster.ai
                </div>
            </div>
        </div>
    </div>

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
                onClick={handleImageShare}
                disabled={isGeneratingImage}
                className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors active:scale-95 disabled:opacity-50"
                title="Share Image"
            >
                {isGeneratingImage ? (
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                )}
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
    </>
  );
});

export default RizzCard;
