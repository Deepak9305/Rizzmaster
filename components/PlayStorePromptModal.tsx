import React, { useEffect, useRef } from 'react';
import { PLAY_STORE_URL } from '../services/marketingContent';

interface PlayStorePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PlayStorePromptModal: React.FC<PlayStorePromptModalProps> = ({ isOpen, onClose }) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    closeButtonRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4" role="presentation">
      <button type="button" aria-label="Close Play Store prompt" onClick={onClose} className="absolute inset-0 h-full w-full bg-black/75 backdrop-blur-sm" />
      <section role="dialog" aria-modal="true" aria-labelledby="play-store-prompt-title" className="relative w-full max-w-md overflow-hidden rounded-3xl border border-pink-300/20 bg-[#120b12] p-7 text-center shadow-2xl">
        <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-pink-500/30 blur-3xl" />
        <div className="relative">
          <span className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-pink-300/20 bg-pink-300/10 text-2xl text-pink-200">+</span>
          <h2 id="play-store-prompt-title" className="mt-5 text-2xl font-black tracking-tight text-white">Free credits used</h2>
          <p className="mt-3 text-sm leading-6 text-white/65">You have used your free credits for today. Get unlimited Rizz Master in the Android app.</p>
          <p className="mt-2 text-xs text-white/40">Your free credits reset tomorrow.</p>
          <div className="mt-7 space-y-3">
            <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" onClick={onClose} className="flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-3.5 text-sm font-black text-white transition-transform hover:scale-[1.01]">
              Get it on Google Play
            </a>
            <button ref={closeButtonRef} type="button" onClick={onClose} className="w-full rounded-2xl border border-white/10 px-5 py-3 text-sm font-bold text-white/60 transition-colors hover:bg-white/5 hover:text-white">
              Maybe later
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PlayStorePromptModal;
