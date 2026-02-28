import React from 'react';
import { SavedItem } from '../types';

interface SavedModalProps {
  isOpen: boolean;
  onClose: () => void;
  savedItems: SavedItem[];
  onDelete: (id: string) => void;
}

const SavedModal: React.FC<SavedModalProps> = ({
  isOpen,
  onClose,
  savedItems,
  onDelete,
}) => {
  const displayItems = React.useMemo(() => savedItems.filter(item => item.type !== 'system'), [savedItems]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-md h-full bg-[#0a0a0a] border-l border-white/10 shadow-2xl flex flex-col animate-slide-in-right">
        <div className="p-6 border-b border-white/10 flex items-center justify-between bg-black/20">
          <h2 className="text-xl font-bold text-white">Saved Gems</h2>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full text-white/50 hover:text-white">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          {displayItems.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-white/30 text-center">
              <span className="text-4xl mb-4 opacity-50">📂</span>
              <p>No saved items yet.</p>
            </div>
          ) : (
            displayItems.map((item) => (
              <div key={item.id} className="p-4 rounded-xl bg-white/5 border border-white/5 hover:border-white/10 transition-colors group">
                <div className="flex justify-between items-start mb-2">
                  <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${item.type === 'chaotic' ? 'bg-red-500/20 text-red-400' :
                      item.type === 'smooth' ? 'bg-blue-500/20 text-blue-400' :
                        item.type === 'bio' ? 'bg-emerald-500/20 text-emerald-400' :
                          'bg-purple-500/20 text-purple-400'
                    }`}>
                    {item.type}
                  </span>
                  <span className="text-[10px] text-white/30">{new Date(item.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-white/90 text-sm leading-relaxed mb-3">{item.content}</p>
                <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(item.content);
                      // Optional: Show a small toast or feedback here if possible, 
                      // but for now just the action is enough.
                    }}
                    className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg"
                    title="Copy"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                  </button>
                  <button onClick={() => onDelete(item.id)} className="p-1.5 text-white/40 hover:text-red-400 hover:bg-red-500/10 rounded-lg" title="Delete">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default SavedModal;