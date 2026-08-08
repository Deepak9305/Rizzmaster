import React, { useEffect, useState } from 'react';
import { getApiUrl } from '../services/runtimeConfig';
import { supabase } from '../services/supabaseClient';

interface BillingReturnPageProps {
  onContinue: () => void;
}

type ConfirmationState = 'checking' | 'active' | 'pending' | 'login';

const BillingReturnPage: React.FC<BillingReturnPageProps> = ({ onContinue }) => {
  const [state, setState] = useState<ConfirmationState>('checking');

  useEffect(() => {
    let cancelled = false;
    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

    const confirm = async () => {
      if (!supabase) {
        setState('login');
        return;
      }
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        if (!cancelled) setState('login');
        return;
      }

      for (let attempt = 0; attempt < 7 && !cancelled; attempt += 1) {
        const response = await fetch(getApiUrl('/api/profile'), {
          headers: { Authorization: `Bearer ${session.access_token}` },
        }).catch(() => null);
        const payload = response ? await response.json().catch(() => null) : null;
        if (response?.ok && payload?.profile?.is_premium === true) {
          setState('active');
          return;
        }
        await wait(2000);
      }
      if (!cancelled) setState('pending');
    };

    void confirm();
    return () => { cancelled = true; };
  }, []);

  const content = {
    checking: ['Confirming your subscription', 'We are waiting for secure confirmation from Dodo Payments.'],
    active: ['Premium is active', 'Your subscription is verified and premium is ready on this account.'],
    pending: ['Payment confirmation is pending', 'This can take a moment. Return to the app and use Sync Profile shortly.'],
    login: ['Sign in to confirm premium', 'Use the same Rizz Master account that started checkout.'],
  }[state];

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#050407] p-5 text-white">
      <section className="relative w-full max-w-lg overflow-hidden rounded-[2rem] border border-pink-300/20 bg-[#100912] p-8 text-center shadow-[0_30px_100px_rgba(236,72,153,0.2)]">
        <div className="absolute left-1/2 top-0 h-40 w-64 -translate-x-1/2 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="relative">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-pink-300/20 bg-pink-300/10 text-2xl text-pink-200">
            {state === 'checking' ? <span className="animate-pulse">...</span> : state === 'active' ? '✓' : '!'}
          </div>
          <h1 className="mt-6 text-3xl font-black tracking-tight">{content[0]}</h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-6 text-white/55">{content[1]}</p>
          <button type="button" onClick={onContinue} className="mt-8 w-full rounded-2xl bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-4 text-sm font-black text-white">
            {state === 'login' ? 'Go to sign in' : 'Continue to Rizz Master'}
          </button>
        </div>
      </section>
    </main>
  );
};

export default BillingReturnPage;
