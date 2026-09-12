import { getApiUrl } from './runtimeConfig';
import { supabase } from './supabaseClient';

export type RewardedAdStatus = 'pending' | 'granted' | 'rejected' | 'expired';

interface RewardedAdApiError extends Error {
  code?: string;
  status?: number;
}

const getAccessToken = async () => {
  if (!supabase) throw new Error('Authentication is unavailable.');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error('LOGIN_REQUIRED');
  return session.access_token;
};

const request = async <T>(path: string, init: RequestInit = {}) => {
  const token = await getAccessToken();
  const response = await fetch(getApiUrl(path), {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(payload?.error || 'Rewarded ad request failed.') as RewardedAdApiError;
    error.code = payload?.code;
    error.status = response.status;
    throw error;
  }
  return payload as T;
};

export const createRewardedAdAttempt = (requiredCredits: 1 | 2) => request<{
  attemptId: string;
  customData: string;
  expiresAt: string;
}>('/api/rewarded-ad/attempt', {
  method: 'POST',
  body: JSON.stringify({ requiredCredits }),
});

export const getRewardedAdStatus = (attemptId: string) => request<{
  attemptId: string;
  status: RewardedAdStatus;
  credits: number;
  expiresAt: string;
}>('/api/rewarded-ad/status?attemptId=' + encodeURIComponent(attemptId));
