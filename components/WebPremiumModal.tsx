import React, { useEffect, useRef, useState } from 'react';
import PremiumBenefits from './PremiumBenefits';
import { createDodoPortalSession, DodoPlan, DodoPlanId, getDodoPlans, startDodoCheckout } from '../services/dodoBillingService';

interface WebPremiumModalProps {
  isOpen: boolean;
  isAuthenticated: boolean;
  isPremium: boolean;
  premiumSource?: string | null;
  reason: 'credits' | 'premium';
  onClose: () => void;
  onLoginRequired: () => void;
}

export default function WebPremiumModal({ isOpen, isAuthenticated, isPremium, premiumSource, reason, onClose, onLoginRequired }: WebPremiumModalProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [plans, setPlans] = useState<DodoPlan[]>([]);
  const [selected, setSelected] = useState<DodoPlanId>('WEEKLY');
  const [enabled, setEnabled] = useState(false);
  const [loadingPrices, setLoadingPrices] = useState(true);
  const [retry, setRetry] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasDodo = premiumSource === 'dodo' || premiumSource === 'both';
  const plan = plans.find(item => item.id === selected);

  useEffect(() => {
    if (!isOpen) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    closeRef.current?.focus();
    return () => { document.body.style.overflow = overflow; previousFocus?.focus(); };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
      if (event.key !== 'Tab') return;
      const nodes = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]') || []);
      const first = nodes[0]; const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, busy, onClose]);

  useEffect(() => {
    if (!isOpen || isPremium) return;
    let cancelled = false;
    setLoadingPrices(true); setEnabled(false); setPlans([]); setError(null);
    getDodoPlans().then(result => {
      if (cancelled) return;
      setPlans(result.plans); setEnabled(result.enabled);
    }).catch(() => {
      if (!cancelled) setError('Could not load subscription options. Please try again.');
    }).finally(() => { if (!cancelled) setLoadingPrices(false); });
    return () => { cancelled = true; };
  }, [isOpen, isPremium, retry]);

  const openPortal = async () => {
    setBusy(true); setError(null);
    try { window.location.assign((await createDodoPortalSession()).portalUrl); }
    catch (err) { setError(err instanceof Error ? err.message : 'Could not open subscription settings.'); setBusy(false); }
  };

  const subscribe = async () => {
    if (busy) return;
    if (!isAuthenticated) { onClose(); onLoginRequired(); return; }
    if (!enabled || !plan?.available) return;
    setBusy(true); setError(null);
    try { window.location.assign((await startDodoCheckout(selected)).checkoutUrl); }
    catch (err) {
      if ((err as { code?: string })?.code === 'DODO_SUBSCRIPTION_ACTIVE') { await openPortal(); return; }
      setError(err instanceof Error ? err.message : 'Could not start checkout.'); setBusy(false);
    }
  };

  if (!isOpen) return null;
  return <div className="fixed inset-0 z-[260] flex items-center justify-center p-4">
    <button type="button" tabIndex={-1} aria-label="Close premium options" disabled={busy} onClick={onClose} className="absolute inset-0 w-full h-full bg-black/80 backdrop-blur-sm" />
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="web-premium-title" className="relative w-full max-w-sm rounded-3xl border border-yellow-500/30 bg-[#100916] shadow-2xl shadow-yellow-500/10 overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-yellow-600 via-yellow-400 to-yellow-600" />
      <div className="web-premium-scroll max-h-[90dvh] overflow-y-auto p-6 md:p-8">
        <button ref={closeRef} type="button" onClick={onClose} disabled={busy} aria-label="Close premium options" className="absolute right-4 top-4 z-10 rounded-full bg-[#100916] p-2 text-white/60 hover:text-white disabled:opacity-40">✕</button>
        <div className="text-center mb-5">
          <div aria-hidden="true" className="w-14 h-14 mx-auto mb-3 bg-yellow-500/10 rounded-full flex items-center justify-center text-2xl border border-yellow-500/20">👑</div>
          <h2 id="web-premium-title" className="text-xl md:text-2xl font-bold text-white mb-1">{isPremium ? 'God Mode unlocked' : 'Unlock God Mode'}</h2>
          <p className="text-xs text-white/50">{isPremium ? 'Your Rizz Master Premium is active.' : reason === 'credits' ? 'Keep the conversation going without daily credit limits.' : 'All premium styles. No daily credit limits.'}</p>
        </div>
        <div className="bg-rose-500/10 border border-rose-500/25 rounded-xl px-3 py-2 mb-5 text-center text-[11px] text-rose-300 font-semibold">✨ One account. Premium on web and Android.</div>
        <PremiumBenefits />
        {isPremium ? <div className="space-y-3">
          {hasDodo ? <button type="button" disabled={busy} onClick={() => void openPortal()} className="w-full rounded-xl bg-gradient-to-r from-yellow-600 to-amber-500 p-3 font-bold text-black disabled:opacity-50">{busy ? 'Opening billing settings…' : 'Manage subscription'}</button> : <p className="text-center text-xs text-white/60">Manage your Google Play subscription in Google Play.</p>}
          <button type="button" onClick={onClose} disabled={busy} className="w-full p-3 text-sm text-white/70">Back to Rizz Master</button>
        </div> : <>
          {loadingPrices ? <p role="status" className="py-6 text-center text-sm text-white/60">Loading your subscription prices…</p> : <div className="grid grid-cols-2 gap-3 mb-5">
            {plans.map(item => <button key={item.id} type="button" onClick={() => setSelected(item.id)} aria-pressed={selected === item.id} disabled={busy || !item.available} className={`min-w-0 p-3 rounded-xl border flex flex-col items-center justify-center text-center disabled:opacity-50 ${selected === item.id ? 'bg-yellow-500/10 border-yellow-500 shadow-[0_0_15px_rgba(234,179,8,0.2)]' : 'bg-white/5 border-white/10'}`}>
              <span className="text-[10px] text-white/70 font-bold uppercase tracking-wider">{item.label}</span>
              <span className={`${item.price ? 'text-lg' : 'text-xs'} break-words max-w-full font-black text-yellow-400 my-2`}>{item.price || 'Price at checkout'}</span>
              <span className="text-[10px] text-white/45">billed {item.interval === 'week' ? 'weekly' : 'monthly'}</span>
            </button>)}
          </div>}
          {plan?.trialDays ? <p className="mb-3 text-center text-xs text-white/60">{plan.trialDays}-day trial. {plan.dueToday} due today; then {plan.price} per {plan.interval}.</p> : null}
          <button type="button" disabled={busy || loadingPrices || !enabled || !plan?.available} onClick={() => void subscribe()} className="w-full py-3 rounded-xl bg-gradient-to-r from-yellow-600 to-amber-500 text-black font-bold shadow-lg disabled:opacity-45 flex flex-col items-center gap-1">
            <span className="text-sm">{busy ? 'Opening secure checkout…' : isAuthenticated ? '🔓 Subscribe & Upgrade' : '🔓 Sign In to Unlock'}</span>
            <span className="text-[10px] uppercase">{plan?.price ? `${plan.price} per ${plan.interval}` : 'Your country price is confirmed by Dodo at checkout'}</span>
          </button>
          {!loadingPrices && !enabled && <p className="mt-3 text-center text-xs text-white/60">Subscription options are temporarily unavailable.</p>}
          <p className="mt-4 text-center text-[10px] leading-relaxed text-white/45">Recurring billing by Dodo Payments. Prices reflect your detected country. Final price, currency, taxes and any discounts are confirmed at checkout. Cancel anytime in the billing portal.</p>
        </>}
        {error && <div role="alert" className="mt-4 text-xs text-rose-200">{error}{!busy && <button type="button" onClick={() => setRetry(value => value + 1)} className="ml-2 underline">Try again</button>}</div>}
      </div>
    </section>
  </div>;
}
