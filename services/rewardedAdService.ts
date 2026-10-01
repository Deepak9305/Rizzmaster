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
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const token = await getAccessToken();
        if (controller.signal.aborted) throw new Error('Reward request expired.');
        const response = await fetch(getApiUrl(path), {
          ...init,
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(init.body ? { 'Content-Type': 'application/json' } : {}),
            ...init.headers,
          },
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload) {
          const error = new Error(payload?.error || 'Rewarded ad request failed.') as RewardedAdApiError;
          error.code = payload?.code;
          error.status = response.ok ? 502 : response.status;
          throw error;
        }
        return payload as T;
      })(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error('Reward verification took too long. Please try again.') as RewardedAdApiError;
          error.code = 'REWARDED_AD_TIMEOUT';
          error.status = 0;
          reject(error);
          controller.abort();
        }, 15_000);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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

export const completeRewardedAdAttempt = (attemptId: string) => request<{
  attemptId: string;
  status: RewardedAdStatus;
  credits: number;
}>('/api/rewarded-ad/complete', {
  method: 'POST',
  body: JSON.stringify({ attemptId }),
});
