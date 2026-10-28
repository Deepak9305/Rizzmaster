import { supabase } from './supabaseClient';
import { getApiUrl } from './runtimeConfig';
import { bounded } from './simpleAds';

export type EarnedClaim = { claimId: string; requiredCredits: 1 | 2 };
export type ClaimResult = { status: 'granted' | 'rejected' | 'pending'; credits?: number; reason?: string };
const key = (account: string) => `rizzmaster_earned_claims_${account}`;

export const readEarnedClaims = (account: string): EarnedClaim[] => {
    try {
        const value = JSON.parse(localStorage.getItem(key(account)) || '[]');
        return Array.isArray(value) ? value.filter(item => typeof item?.claimId === 'string' && [1, 2].includes(item.requiredCredits)) : [];
    } catch { return []; }
};
export const saveEarnedClaim = (account: string, claim: EarnedClaim) => {
    const claims = readEarnedClaims(account);
    if (!claims.some(item => item.claimId === claim.claimId)) localStorage.setItem(key(account), JSON.stringify([...claims, claim]));
};
const removeClaim = (account: string, claimId: string) => {
    const remaining = readEarnedClaims(account).filter(claim => claim.claimId !== claimId);
    localStorage.setItem(key(account), JSON.stringify(remaining));
};
const tasks = new Map<string, Promise<ClaimResult>>();

export function submitEarnedClaim(account: string, claim: EarnedClaim): Promise<ClaimResult> {
    const taskKey = `${account}:${claim.claimId}`;
    const existing = tasks.get(taskKey);
    if (existing) return existing;
    const task = (async (): Promise<ClaimResult> => {
        const controller = new AbortController();
        try {
            const result = await bounded('Reward claim', (async () => {
                if (!supabase) return { status: 'pending' } as ClaimResult;
                const { data: { session } } = await supabase.auth.getSession();
                if (controller.signal.aborted || session?.user.id !== account || !session.access_token) return { status: 'pending' } as ClaimResult;
                const response = await fetch(getApiUrl('/api/rewarded-ad/claim'), {
                    method: 'POST', signal: controller.signal,
                    headers: { Authorization: `Bearer ${session.access_token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify(claim),
                });
                const payload = await response.json();
                if (!response.ok || !['granted', 'rejected'].includes(payload?.status)) return { status: 'pending' } as ClaimResult;
                if (payload.status === 'granted' && (!Number.isFinite(payload.credits) || payload.credits < 0)) return { status: 'pending' } as ClaimResult;
                return payload as ClaimResult;
            })(), 15000);
            if (result.status !== 'pending') removeClaim(account, claim.claimId);
            return result;
        } catch { return { status: 'pending' }; }
        finally { controller.abort(); }
    })().finally(() => { tasks.delete(taskKey); });
    tasks.set(taskKey, task);
    return task;
}

export async function recoverEarnedClaims(account: string, stillCurrent: () => boolean): Promise<ClaimResult | null> {
    let latest: ClaimResult | null = null;
    for (const claim of readEarnedClaims(account)) {
        if (!stillCurrent()) break;
        latest = await submitEarnedClaim(account, claim);
        if (latest.status === 'pending') break;
    }
    return latest;
}
