import React, { useEffect, useRef, useState } from 'react';
import { PLAY_STORE_URL } from '../services/marketingContent';
import {
  createDodoPortalSession,
  DodoPlan,
  DodoPlanId,
  getDodoPlans,
  startDodoCheckout,
} from '../services/dodoBillingService';

interface WebPremiumModalProps {
  isOpen: boolean;
  isAuthenticated: boolean;
  isPremium: boolean;
  premiumSource?: string | null;
  reason: 'credits' | 'premium';
  onClose: () => void;
  onLoginRequired: () => void;
}

const fallbackPlans: DodoPlan[] = [
  { id: 'WEEKLY', label: 'Weekly', price: '$4.99', interval: 'week', available: true },
  { id: 'MONTHLY', label: 'Monthly', price: '$15.99', interval: 'month', available: true },
];

const WebPremiumModal: React.FC<WebPremiumModalProps> = ({
  isOpen,
  isAuthenticated,
  isPremium,
  premiumSource,
  reason,
  onClose,
  onLoginRequired,
}) => {
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [plans, setPlans] = useState<DodoPlan[]>(fallbackPlans);
  const [enabled, setEnabled] = useState(false);
  const [loadingPlan, setLoadingPlan] = useState<DodoPlanId | 'PORTAL' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const hasDodoPremium = premiumSource === 'dodo' || premiumSource === 'both';

  useEffect(() => {
    if (!isOpen) return;
    closeButtonRef.current?.focus();
    setError(null);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !loadingPlan) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, loadingPlan, onClose]);

  useEffect(() => {
    if (!isOpen || !isAuthenticated || isPremium) return;
    let cancelled = false;
    setEnabled(false);
    getDodoPlans()
      .then((result) => {
        if (cancelled) return;
        setEnabled(result.enabled);
        if (result.plans?.length) setPlans(result.plans);
      })
      .catch(() => {
        if (!cancelled) setEnabled(false);
      });
    return () => { cancelled = true; };
  }, [isAuthenticated, isOpen, isPremium]);

  if (!isOpen) return null;

  const beginCheckout = async (plan: DodoPlanId) => {
    if (!isAuthenticated) {
      onClose();
      onLoginRequired();
      return;
    }
    setLoadingPlan(plan);
    setError(null);
    try {
      const result = await startDodoCheckout(plan);
      window.location.assign(result.checkoutUrl);
    } catch (requestError: any) {
      if (requestError?.code === 'DODO_SUBSCRIPTION_ACTIVE') {
        await openPortal();
        return;
      }
      setError(requestError instanceof Error ? requestError.message : 'Could not start checkout.');
      setLoadingPlan(null);
    }
  };

  const openPortal = async () => {
    setLoadingPlan('PORTAL');
    setError(null);
    try {
      const result = await createDodoPortalSession();
      window.location.assign(result.portalUrl);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not open billing portal.');
      setLoadingPlan(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[260] flex items-center justify-center p-4" role="presentation">
      <button type="button" aria-label="Close premium options" onClick={loadingPlan ? undefined : onClose} className="absolute inset-0 h-full w-full bg-black/80 backdrop-blur-md" />
      <section role="dialog" aria-modal="true" aria-labelledby="web-premium-title" className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-pink-300/20 bg-[#100912] p-6 shadow-[0_30px_100px_rgba(236,72,153,0.25)] md:p-8">
        <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-pink-500/25 blur-3xl" />
        <button ref={closeButtonRef} type="button" onClick={onClose} disabled={Boolean(loadingPlan)} aria-label="Close premium options" className="absolute right-5 top-5 z-10 flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/60 hover:text-white disabled:opacity-40">x</button>
        <div className="relative">
          <p className="text-xs font-black uppercase tracking-[0.25em] text-pink-300">Rizz Master Premium</p>
          <h2 id="web-premium-title" className="mt-3 pr-10 text-3xl font-black tracking-tight text-white">
            {isPremium ? 'Premium is active' : reason === 'credits' ? 'Keep the conversation going' : 'Unlimited rizz, one simple plan'}
          </h2>
          <p className="mt-3 text-sm leading-6 text-white/55">
            {isPremium
              ? hasDodoPremium ? 'Manage your web subscription securely through Dodo Payments.' : 'Your premium access is active through Google Play and works here too.'
              : 'Unlimited generations and premium modes across web and Android when you use the same Rizz Master account.'}
          </p>

          {isPremium ? (
            <div className="mt-7 space-y-3">
              {hasDodoPremium && (
                <button type="button" onClick={() => { void openPortal(); }} disabled={Boolean(loadingPlan)} className="w-full rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-4 text-sm font-black text-white disabled:opacity-50">
                  {loadingPlan === 'PORTAL' ? 'Opening secure portal...' : 'Manage web subscription'}
                </button>
              )}
              <button type="button" onClick={onClose} className="w-full rounded-2xl border border-white/10 px-5 py-3.5 text-sm font-bold text-white/65 hover:bg-white/5 hover:text-white">Back to Rizz Master</button>
            </div>
          ) : (
            <>
              <div className="mt-7 grid gap-3 sm:grid-cols-2">
                {plans.map((plan) => (
                  <button key={plan.id} type="button" disabled={(isAuthenticated && !enabled) || !plan.available || Boolean(loadingPlan)} onClick={() => { void beginCheckout(plan.id); }} className="group rounded-2xl border border-white/10 bg-white/[0.04] p-5 text-left transition hover:border-pink-300/40 hover:bg-pink-300/[0.07] disabled:cursor-not-allowed disabled:opacity-45">
                    <span className="text-sm font-black text-white">{plan.label}</span>
                    <span className="mt-3 block text-2xl font-black text-white">{plan.price}</span>
                    <span className="text-xs text-white/40">per {plan.interval}</span>
                    <span className="mt-4 block text-xs font-bold text-pink-300">{loadingPlan === plan.id ? 'Opening checkout...' : 'Choose plan'}</span>
                  </button>
                ))}
              </div>
              {isAuthenticated && !enabled && <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">Web billing is being configured. You can still subscribe in the Android app.</p>}
              <p className="mt-4 text-center text-xs text-white/35">Secure recurring billing by Dodo Payments. Cancel anytime from the web billing portal.</p>
            </>
          )}

          {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">{error}</p>}
          {!isPremium && (
            <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" className="mt-5 flex w-full items-center justify-center rounded-xl px-4 py-2 text-xs font-bold text-white/45 hover:text-white">Prefer Android? Get it on Google Play</a>
          )}
        </div>
      </section>
    </div>
  );
};

export default WebPremiumModal;
