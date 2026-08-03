import React, { useEffect, useRef } from 'react';

type SettingsPage = 'PRIVACY' | 'TERMS' | 'SUPPORT';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
  onRestorePurchases: () => void;
  onNavigate: (page: SettingsPage) => void;
  email?: string | null;
  isGuest?: boolean;
  isPremium?: boolean;
  credits?: number;
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onLogout,
  onRestorePurchases,
  onNavigate,
  email,
  isGuest = false,
  isPremium = false,
  credits = 0,
}) => {
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

  const runAndClose = (action: () => void) => {
    onClose();
    action();
  };

  return (
    <div className="app-modal fixed inset-0 z-[350] flex items-end justify-end p-3 sm:items-center">
      <button
        type="button"
        className="absolute inset-0 h-full w-full bg-black/70 backdrop-blur-sm"
        onClick={onClose}
        aria-label="Close settings"
      />

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="rizzmaster-settings-title"
        className="app-card relative z-10 w-full max-w-md rounded-3xl border border-white/10 p-5 shadow-2xl animate-scale-in"
      >
        <div className="mb-5 flex items-start justify-between border-b border-white/10 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-rose-300/80">Preferences</p>
            <h2 id="rizzmaster-settings-title" className="mt-1 text-2xl font-black text-white">Settings</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label="Close settings"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-lg text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            x
          </button>
        </div>

        <div className="mb-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Account</p>
          <p className="mt-2 truncate text-sm font-semibold text-white">
            {isGuest ? 'Guest mode' : (email || 'Signed-in account')}
          </p>
          <p className="mt-1 text-xs text-white/45">
            {isPremium ? 'Premium account with unlimited generations.' : `${credits} daily credits remaining.`}
          </p>
        </div>

        <div className="space-y-2">
          <button type="button" onClick={() => runAndClose(onRestorePurchases)} className="settings-action">
            <span className="settings-action-icon">$</span>
            <span><strong>Restore purchases</strong><small>Sync your Google Play subscription</small></span>
          </button>
          <button type="button" onClick={() => runAndClose(() => onNavigate('SUPPORT'))} className="settings-action">
            <span className="settings-action-icon">?</span>
            <span><strong>Support and account help</strong><small>Billing help, feedback, and account deletion</small></span>
          </button>
          <button type="button" onClick={() => runAndClose(() => onNavigate('PRIVACY'))} className="settings-action">
            <span className="settings-action-icon">i</span>
            <span><strong>Privacy policy</strong><small>How Rizzmaster handles your data</small></span>
          </button>
          <button type="button" onClick={() => runAndClose(() => onNavigate('TERMS'))} className="settings-action">
            <span className="settings-action-icon">T</span>
            <span><strong>Terms of service</strong><small>Usage and subscription terms</small></span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => runAndClose(onLogout)}
          className="mt-5 w-full rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-200 transition-colors hover:bg-rose-500/20"
        >
          Log out
        </button>
      </section>
    </div>
  );
};

export default SettingsModal;
