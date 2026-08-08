import { getApiUrl } from './runtimeConfig';
import { supabase } from './supabaseClient';

export type DodoPlanId = 'WEEKLY' | 'MONTHLY';

export interface DodoPlan {
  id: DodoPlanId;
  label: string;
  price: string;
  interval: string;
  available: boolean;
}

interface BillingApiError extends Error {
  code?: string;
  canManage?: boolean;
}

const getAccessToken = async () => {
  if (!supabase) throw new Error('Authentication is unavailable.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('Please sign in before managing premium.');
  return session.access_token;
};

const billingRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const accessToken = await getAccessToken();
  const response = await fetch(getApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || 'Billing request failed.') as BillingApiError;
    error.code = payload?.code;
    error.canManage = payload?.canManage === true;
    throw error;
  }
  return payload as T;
};

export const getDodoPlans = () => billingRequest<{
  enabled: boolean;
  currency: string;
  plans: DodoPlan[];
}>('/api/dodo-plans');

export const startDodoCheckout = (plan: DodoPlanId) => billingRequest<{ checkoutUrl: string }>(
  '/api/dodo-checkout',
  { method: 'POST', body: JSON.stringify({ plan }) }
);

export const createDodoPortalSession = () => billingRequest<{ portalUrl: string }>(
  '/api/dodo-portal',
  { method: 'POST' }
);
