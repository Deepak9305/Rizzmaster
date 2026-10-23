import { AdMobService } from './admobService';
import { observeBannerForeground } from './bannerLifecycle';

const RETRY_MS = 60_000;
const READINESS_RETRY_MS = 15_000;

// Maintain one usable guest ad. Failed loads recover at a measured pace;
// loaded ads are reused until expiry, and background time starts no new requests.
export const startGuestRewardPreload = (adId: string, eligible: () => boolean): (() => void) => {
    let stopped = false;
    let foreground = false;
    let running = false;
    let retryAt = 0;
    let waitingForReadiness = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const clearTimer = () => {
        if (timer) clearTimeout(timer);
        timer = null;
    };
    const canPrepare = () => !stopped && foreground && eligible();
    const prepare = async () => {
        if (running || !canPrepare()) return;
        clearTimer();
        if (!AdMobService.hasFreshRewardVideo(adId) && retryAt > Date.now()) {
            timer = setTimeout(() => { timer = null; void prepare(); }, retryAt - Date.now());
            return;
        }
        running = true;
        const requestsBefore = AdMobService.rewardVideoRequestCount;
        const joinedLoad = AdMobService.rewardVideoPreparing;
        try {
            if (!AdMobService.hasFreshRewardVideo(adId)) {
                await AdMobService.prepareRewardVideo(adId, undefined, canPrepare);
            }
        } catch (error) {
            console.warn('[AdMob] Guest rewarded preload will retry:', error);
        } finally {
            running = false;
            const fresh = AdMobService.hasFreshRewardVideo(adId);
            const requested = joinedLoad || AdMobService.rewardVideoRequestCount !== requestsBefore;
            waitingForReadiness = !fresh && !requested;
            retryAt = fresh ? 0 : Date.now() + (requested ? RETRY_MS : READINESS_RETRY_MS);
            if (canPrepare()) {
                const remaining = fresh
                    ? AdMobService.REWARDED_STALE_AFTER_MS - (Date.now() - AdMobService.rewardVideoPreparedAt)
                    : retryAt - Date.now();
                timer = setTimeout(() => { timer = null; void prepare(); }, Math.max(1000, remaining));
            }
        }
    };
    const ready = () => AdMobService.initialized && AdMobService.canRequestAds && !AdMobService.privacyOptionsInProgress;
    const stopReadiness = AdMobService.subscribeReadiness(() => {
        if (waitingForReadiness && ready()) {
            retryAt = 0;
            if (foreground) void prepare();
        }
    });
    const stopForeground = observeBannerForeground(active => {
        foreground = active;
        clearTimer();
        if (waitingForReadiness && ready()) retryAt = 0;
        if (active) void prepare();
    });
    return () => {
        stopped = true;
        stopReadiness();
        clearTimer();
        stopForeground();
    };
};
