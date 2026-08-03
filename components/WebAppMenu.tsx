import React, { useEffect, useRef } from 'react';
import { PLAY_STORE_URL } from '../services/marketingContent';

interface WebAppMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenRizz: () => void;
  onOpenCoach: () => void;
  onOpenSaved: () => void;
  onNavigateToPath: (path: string) => void;
  onLogout: () => void;
}

const WebAppMenu: React.FC<WebAppMenuProps> = ({
  isOpen,
  onClose,
  onOpenRizz,
  onOpenCoach,
  onOpenSaved,
  onNavigateToPath,
  onLogout,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== 'Tab') return;
      const menu = document.getElementById('rizzmaster-web-navigation');
      if (!menu) return;
      const focusable = Array.from(menu.querySelectorAll<HTMLElement>('button, a[href], input, textarea, select, [tabindex]:not([tabindex="-1"])')).filter((element) => !element.hasAttribute('disabled'));
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      window.requestAnimationFrame(() => previouslyFocusedRef.current?.focus());
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const runAction = (action: () => void) => {
    action();
    onClose();
  };

  const contentLinks = [
    { label: 'Blog', path: '/blog' },
    { label: 'Support', path: '/support' },
    { label: 'Privacy', path: '/privacy' },
    { label: 'Terms', path: '/terms' },
    { label: 'Landing page', path: '/landing' },
  ];

  return (
    <div className="fixed inset-0 z-[300]" role="presentation">
      <button
        type="button"
        aria-label="Close navigation menu"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <aside
        id="rizzmaster-web-navigation"
        role="dialog"
        aria-modal="true"
        aria-labelledby="rizzmaster-web-navigation-title"
        className="absolute inset-y-0 left-0 flex w-[min(22rem,88vw)] flex-col border-r border-white/10 bg-[#0b080d] p-5 shadow-2xl animate-slide-in-right-view"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-5">
          <div>
            <p id="rizzmaster-web-navigation-title" className="text-lg font-black tracking-tight text-white">Rizz <span className="text-pink-300">Master</span></p>
            <p className="mt-1 text-xs text-white/45">Your web wingman</p>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close navigation menu"
          >
             <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <nav className="mt-5 space-y-1" aria-label="Rizz Master sections">
          <button type="button" onClick={() => runAction(onOpenRizz)} className="w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-white transition-colors hover:bg-white/10">Rizz</button>
          <button type="button" onClick={() => runAction(onOpenCoach)} className="w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-white transition-colors hover:bg-white/10">AI Coach</button>
          <button type="button" onClick={() => runAction(onOpenSaved)} className="w-full rounded-xl px-4 py-3 text-left text-sm font-bold text-white transition-colors hover:bg-white/10">Saved</button>
        </nav>

        <div className="my-5 border-t border-white/10" />
        <nav className="space-y-1" aria-label="Rizz Master information">
          {contentLinks.map((link) => (
            <button key={link.path} type="button" onClick={() => runAction(() => onNavigateToPath(link.path))} className="w-full rounded-xl px-4 py-3 text-left text-sm font-semibold text-white/65 transition-colors hover:bg-white/10 hover:text-white">
              {link.label}
            </button>
          ))}
        </nav>

        <div className="mt-auto space-y-3 border-t border-white/10 pt-5">
          <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" onClick={onClose} className="flex w-full items-center justify-center rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-4 py-3 text-sm font-black text-white transition-transform hover:scale-[1.01]">
            Download app
          </a>
          <button type="button" onClick={() => runAction(onLogout)} className="w-full rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/60 transition-colors hover:bg-white/5 hover:text-white">Logout</button>
        </div>
      </aside>
    </div>
  );
};

export default WebAppMenu;
