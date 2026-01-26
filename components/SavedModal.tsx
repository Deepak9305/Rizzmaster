import React from 'react';
import { SavedItem } from '../types';

interface SavedModalProps {
  isOpen: boolean; // Kept for compatibility if used as modal, but we'll use it as a view
  onClose: () => void;
  savedItems: SavedItem[];
  onDelete: (id: string) => void;
  onShare: (content: string) => void;
}

const SavedModal: React.FC<SavedModalProps> = ({ 
  savedItems, 
  onDelete, 
  onShare 
}) => {
  // Acts as the 'Saved' Tab View
  return (
    <div className="w-full h-full flex flex-col animate-fade-in pt-4">
        {/* Header */}
        <div className="px-1 mb-6">
            <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
                Saved Gems
            </h2>
            <p className="text-white/40 text-sm">Your collection of masterstrokes.</p>
        </div>

        <div className="flex-1 overflow-y-auto pb-32 custom-scrollbar">
            {savedItems.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-white/20 text-center border-2 border-dashed border-white/5 rounded-3xl mx-1">
                    <span className="text-5xl mb-4 grayscale opacity-50">📂</span>
                    <p className="text-sm">No saved items yet.</p>
                    <p className="text-xs mt-2 opacity-50">Hit the heart icon on results.</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {savedItems.map((item) => (
                    <div key={item.id} className="glass p-5 rounded-2xl border border-white/5 active:bg-white/10 transition-all group relative overflow-hidden">
                         <div className="flex justify-between items-start mb-3">
                             <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded-md tracking-wider ${
                                 item.type === 'chaotic' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                                 item.type === 'smooth' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' :
                                 item.type === 'bio' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                                 'bg-purple-500/10 text-purple-400 border border-purple-500/20'
                             }`}>
                                 {item.type}
                             </span>
                             <span className="text-[10px] text-white/30 font-mono">{new Date(item.created_at).toLocaleDateString()}</span>
                         </div>
                         
                         <p className="text-white/90 text-base font-medium leading-relaxed mb-4 select-text font-sans">
                            "{item.content}"
                         </p>

                         <div className="flex gap-2 justify-end items-center border-t border-white/5 pt-3">
                             <button 
                                onClick={() => onShare(item.content)} 
                                className="flex-1 py-2 bg-white/5 rounded-xl text-white/60 hover:text-white hover:bg-white/10 text-xs font-bold transition-all flex items-center justify-center gap-2"
                             >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                                Share
                             </button>
                             <button 
                                onClick={() => onDelete(item.id)} 
                                className="w-10 h-9 flex items-center justify-center rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                             >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                             </button>
                         </div>
                    </div>
                    ))}
                </div>
            )}
        </div>
    </div>
  );
};

export default SavedModal;