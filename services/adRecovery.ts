import { AdMobService } from './admobService';
import { observeBannerForeground } from './bannerLifecycle';
import { recordAdEvent } from './adDiagnostics';

// One startup recovery owner, independent of whether a banner or reward is open.
export const startAdRecovery = (initialOnline: boolean) => {
    let active = false;
    let online = initialOnline;
    let stopped = false;
    let running = false;
    let attempt = 0;
    let retryAt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const ready = () => AdMobService.initialized && AdMobService.canRequestAds && !AdMobService.privacyOptionsInProgress;
    const clear = () => { if (timer) clearTimeout(timer); timer = null; };
    const permitted = () => !stopped && active && online;
    const schedule = () => {
        clear();
        if (!permitted()) return;
        timer = setTimeout(() => { timer = null; void wake(); }, Math.max(0, retryAt - Date.now()));
    };
    const wake = async () => {
        if (!permitted() || running) return;
        if (ready()) {
            clear();
            attempt = 0;
            retryAt = 0;
            AdMobService.wakePendingAds();
            return;
        }
        if (retryAt > Date.now()) { schedule(); return; }
        if (AdMobService.isRewardVideoShowing || AdMobService.privacyOptionsInProgress || AdMobService.privacyOptionsPromise) {
            retryAt = Date.now() + 15000;
            schedule();
            return;
        }
        running = true;
        recordAdEvent('startup.attempt');
        try { await AdMobService.ensureInitialized('Delivery recovery'); }
        finally {
            running = false;
            if (stopped) return;
            if (ready()) {
                attempt = 0;
                retryAt = 0;
                if (permitted()) AdMobService.wakePendingAds();
            } else {
                retryAt = Date.now() + Math.min(15000 * 2 ** Math.min(attempt++, 2), 60000);
                recordAdEvent('startup.retry-scheduled');
                schedule();
            }
        }
    };
    const stopReadiness = AdMobService.subscribeReadiness(() => {
        if (permitted() && ready()) {
            clear();
            retryAt = 0;
            attempt = 0;
            AdMobService.wakePendingAds();
        }
    });
    const stopForeground = observeBannerForeground(value => {
        const resumed = value && !active;
        active = value;
        clear();
        if (resumed) { retryAt = 0; recordAdEvent('wake.foreground'); }
        if (active) void wake();
    });
    return {
        setOnline(value: boolean) {
            if (stopped || online === value) return;
            online = value;
            clear();
            if (online) { retryAt = 0; recordAdEvent('wake.reconnect'); void wake(); }
        },
        stop() { stopped = true; clear(); stopReadiness(); stopForeground(); },
    };
};
