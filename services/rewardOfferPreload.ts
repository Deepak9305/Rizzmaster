import { AdMobService } from './admobService';
import { observeBannerForeground } from './bannerLifecycle';
import { recordAdEvent } from './adDiagnostics';

// Recover an open offer, without idle requests after success or after it closes.
export const startRewardOfferPreload = (
    prepare: (canPrepare: () => boolean) => Promise<boolean>,
    eligible: () => boolean,
) => {
    let stopped = false;
    let active = false;
    let running = false;
    let completed = false;
    let failures = 0;
    let retryAt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clear = () => { if (timer) clearTimeout(timer); timer = null; };
    const canPrepare = () => !stopped && active && eligible() && !AdMobService.isRewardVideoShowing;
    const schedule = () => {
        clear();
        if (canPrepare() && !completed && failures < 3) {
            timer = setTimeout(() => { timer = null; void run(); }, Math.max(0, retryAt - Date.now()));
        }
    };
    const run = async () => {
        if (!canPrepare() || running || completed || failures >= 3) return;
        if (retryAt > Date.now()) { schedule(); return; }
        running = true;
        const requestsBefore = AdMobService.rewardVideoRequestCount;
        try { completed = await prepare(canPrepare); }
        catch { /* Recover a transient context/API or SDK load failure below. */ }
        finally {
            running = false;
            if (!completed && !stopped) {
                // Backgrounding during context preparation is cancellation,
                // not an SDK failure. Real failed loads keep their deadline.
                if (!canPrepare() && requestsBefore === AdMobService.rewardVideoRequestCount) return;
                failures++;
                retryAt = Date.now() + 60000;
                recordAdEvent('reward.offer-retry');
                schedule();
            }
        }
    };
    const stopRecovery = AdMobService.subscribeRecovery(() => { void run(); });
    const stopForeground = observeBannerForeground(value => {
        active = value;
        clear();
        if (active) void run();
    });
    return () => { stopped = true; clear(); stopRecovery(); stopForeground(); };
};
