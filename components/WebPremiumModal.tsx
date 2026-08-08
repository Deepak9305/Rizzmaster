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

const premiumBenefits = [
  ['Unlimited generations', 'Create replies, bios, and screenshot reads without daily credit limits.'],
  ['Every premium vibe', 'Unlock all expert response styles for any conversation.'],
  ['Full AI Coach access', 'Use all three coach personas whenever you need a second opinion.'],
  ['One account, everywhere', 'Premium follows your Rizz Master account across web and Android.'],
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
    if (!isOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previousOverflow; };
  }, [isOpen]);

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
    <div className="fixed inset-0 z-[260] flex items-center justify-center overflow-y-auto p-3 sm:p-5" role="presentation">
      <button type="button" aria-label="Close premium options" onClick={loadingPlan ? undefined : onClose} className="fixed inset-0 h-full w-full bg-black/85 backdrop-blur-lg" />
      <section role="dialog" aria-modal="true" aria-labelledby="web-premium-title" className="relative my-auto w-full max-w-2xl overflow-hidden rounded-[1.75rem] border border-rose-200/15 bg-[#0c080e] shadow-[0_30px_120px_rgba(236,72,153,0.28)] sm:rounded-[2.25rem]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-300/80 to-transparent" />
        <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-24 h-72 w-72 rounded-full bg-amber-400/10 blur-3xl" />
        <button ref={closeButtonRef} type="button" onClick={onClose} disabled={Boolean(loadingPlan)} aria-label="Close premium options" className="absolute right-4 top-4 z-10 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-black/20 text-base font-medium text-white/55 transition hover:border-white/20 hover:bg-white/10 hover:text-white disabled:opacity-40 sm:right-6 sm:top-6">x</button>
        <div className="web-premium-scroll relative max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-5 sm:max-h-[90dvh] sm:p-8 lg:p-9">
          <div className="pr-12">
            <p className="text-[11px] font-black uppercase tracking-[0.28em] text-amber-300">Rizz Master Premium</p>
            <h2 id="web-premium-title" className="mt-3 max-w-xl text-3xl font-black leading-[1.05] tracking-[-0.04em] text-white sm:text-4xl">
              {isPremium ? 'Your best conversations, unlocked.' : reason === 'credits' ? 'Do not let the perfect reply wait.' : 'More confidence. Zero limits.'}
            </h2>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/55 sm:text-[15px]">
            {isPremium
              ? hasDodoPremium ? 'Your web membership is active. Manage renewal, payment details, or cancellation securely through Dodo Payments.' : 'Your Google Play membership is active here too. Keep using the same Rizz Master account on every device.'
              : 'Unlock the complete Rizz Master toolkit for replies, screenshots, profiles, and live coaching.'}
          </p>

          {isPremium ? (
            <div className="mt-8 space-y-3">
              {hasDodoPremium && (
                <button type="button" onClick={() => { void openPortal(); }} disabled={Boolean(loadingPlan)} className="w-full rounded-2xl bg-gradient-to-r from-amber-300 via-amber-400 to-rose-400 px-5 py-4 text-sm font-black text-[#160b0d] shadow-[0_12px_35px_rgba(251,191,36,0.18)] transition hover:brightness-110 disabled:opacity-50">
                  {loadingPlan === 'PORTAL' ? 'Opening secure portal...' : 'Manage web subscription'}
                </button>
              )}
              <button type="button" onClick={onClose} className="w-full rounded-2xl border border-white/10 px-5 py-3.5 text-sm font-bold text-white/65 transition hover:bg-white/5 hover:text-white">Back to Rizz Master</button>
            </div>
          ) : (
            <>
              <div className="mt-7 grid grid-cols-2 gap-x-4 gap-y-4 border-y border-white/[0.07] py-5 sm:gap-x-6">
                {premiumBenefits.map(([title, description]) => (
                  <div key={title} className="border-l-2 border-rose-400/45 pl-3.5">
                    <p className="text-sm font-bold text-white/90">{title}</p>
                    <p className="mt-1 text-[11px] leading-4 text-white/40 sm:text-xs sm:leading-5">{description}</p>
                  </div>
                ))}
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {plans.map((plan) => {
                  const isMonthly = plan.id === 'MONTHLY';
                  return (
                    <button key={plan.id} type="button" disabled={(isAuthenticated && !enabled) || !plan.available || Boolean(loadingPlan)} onClick={() => { void beginCheckout(plan.id); }} className={`group relative overflow-hidden rounded-2xl border p-5 text-left transition duration-200 disabled:cursor-not-allowed disabled:opacity-45 ${isMonthly ? 'order-first border-amber-300/45 bg-amber-300/[0.08] shadow-[inset_0_0_35px_rgba(251,191,36,0.04)] hover:border-amber-200/75 hover:bg-amber-300/[0.12] sm:order-none' : 'border-white/10 bg-white/[0.035] hover:border-rose-300/35 hover:bg-rose-300/[0.06]'}`}>
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-black text-white">{plan.label}</span>
                        {isMonthly && <span className="rounded-full border border-amber-300/30 bg-amber-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.12em] text-amber-200">Save 26%</span>}
                      </div>
                      <div className="mt-4 flex items-end gap-2">
                        <span className="text-3xl font-black tracking-tight text-white">{plan.price}</span>
                        <span className="pb-1 text-xs text-white/40">per {plan.interval}</span>
                      </div>
                      <p className="mt-2 min-h-5 text-xs text-white/40">{isMonthly ? 'About $3.69 per week. Best overall value.' : 'Maximum flexibility with weekly billing.'}</p>
                      <span className={`mt-5 flex w-full items-center justify-center rounded-xl px-4 py-3 text-xs font-black transition ${isMonthly ? 'bg-gradient-to-r from-amber-300 to-rose-400 text-[#160b0d] group-hover:brightness-110' : 'border border-white/10 bg-white/[0.06] text-white group-hover:bg-white/[0.1]'}`}>
                        {loadingPlan === plan.id ? 'Opening secure checkout...' : isMonthly ? 'Choose monthly' : 'Choose weekly'}
                      </span>
                    </button>
                  );
                })}
              </div>
              {isAuthenticated && !enabled && <p className="mt-4 rounded-xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">Web billing is being configured. You can still subscribe in the Android app.</p>}
              <div className="mt-5 rounded-2xl border border-white/[0.07] bg-black/20 px-4 py-3 text-center text-[11px] leading-5 text-white/38">
                Secure recurring billing by Dodo Payments. Prices are in USD; applicable taxes are shown at checkout. Renews automatically until cancelled from the web billing portal.
              </div>
            </>
          )}

          {error && <p role="alert" className="mt-4 rounded-xl border border-red-400/20 bg-red-400/10 p-3 text-sm text-red-100">{error}</p>}
          {!isPremium && (
            <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" className="mt-4 flex w-full items-center justify-center rounded-xl px-4 py-2 text-xs font-bold text-white/45 transition hover:text-white">Prefer Google Play billing? Get Rizz Master for Android</a>
          )}
        </div>
      </section>
    </div>
  );
};

export default WebPremiumModal;
