import { AdMob, BannerAdPluginEvents, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob';
import type { PluginListenerHandle } from '@capacitor/core';
import { AdMobService } from './admobService';
import { canUseNativeAdMob } from './nativeCapabilities';

export type BannerMode = 'visible' | 'hidden' | 'removed';
export const BANNER_WIDTH = 320;
export const BANNER_HEIGHT = 50;
export const BANNER_POSITION = BannerAdPosition.TOP_CENTER;
// Keep manual recovery comfortably outside AdMob's one-minute request
// guidance. Normal banner refresh remains owned by the Google Mobile Ads SDK.
export const BANNER_RETRY_INITIAL_MS = 60_000;
export const BANNER_RETRY_MAX_MS = 300_000;
// Permission checks do not issue ad requests. Recover these sooner while
// retaining the slower pacing for actual load failures and no-fill.
export const BANNER_READINESS_RETRY_INITIAL_MS = 15_000;
export const BANNER_READINESS_RETRY_MAX_MS = 60_000;
export const BANNER_LOAD_TIMEOUT_MS = 90_000;
export const getBannerSlotHeight = () => BANNER_HEIGHT;

// A single native banner is shared by the app. Serialize show/hide/remove so
// a slow consent response cannot display it over a newer modal or premium session.
export class NativeBannerController {
    private desired: BannerMode = 'removed';
    private attached = false;
    private visible = false;
    private loaded = false;
    private disposed = false;
    private listeners: PluginListenerHandle[] = [];
    private running: Promise<void> | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private retryCount = 0;
    private readinessRetryCount = 0;
    private retryAt = 0;
    private requestVersion = 0;
    private loadTimer: ReturnType<typeof setTimeout> | null = null;
    private stalled = false;
    private positionDirty = false;
    private viewportWidthDp = 0;

    constructor(
        private readonly adId: string,
        private topMargin: number,
        private readonly reserve: (height: number) => void,
        private readonly consentReady: (required: boolean) => void,
        private readonly moveBanner?: (margin: number) => Promise<boolean>,
    ) {}

    setTopMargin(margin: number, viewportWidthDp = this.viewportWidthDp): Promise<void> {
        if (this.disposed || (margin === this.topMargin && viewportWidthDp === this.viewportWidthDp)) return this.running ?? Promise.resolve();
        this.topMargin = margin;
        this.viewportWidthDp = viewportWidthDp;
        this.positionDirty = this.attached;
        return this.reconcile();
    }

    setMode(mode: BannerMode): Promise<void> {
        if (this.disposed) return this.running ?? Promise.resolve();
        this.desired = mode;
        if (mode !== 'visible') {
            this.clearRetry();
            this.clearLoadTimer();
            // Suspend the timer, not its deadline. Returning from a modal or
            // the background must neither restart nor bypass recovery pacing.
            if (mode === 'removed') {
                this.retryAt = 0;
                this.retryCount = 0;
                this.readinessRetryCount = 0;
            }
        }
        return this.reconcile();
    }

    private nativeCall<T>(label: string, promise: Promise<T>): Promise<T> {
        return AdMobService.withNativeTimeout(`Banner ${label}`, promise, 5000);
    }

    private clearRetry() {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }

    private clearLoadTimer() {
        if (this.loadTimer) clearTimeout(this.loadTimer);
        this.loadTimer = null;
    }

    private watchLoad() {
        if (this.loaded || !this.attached || this.desired !== 'visible' || this.loadTimer) return;
        const version = this.requestVersion;
        this.loadTimer = setTimeout(() => {
            if (version !== this.requestVersion || this.desired !== 'visible') return;
            this.loadTimer = null;
            this.stalled = true;
            void this.reconcile();
        }, BANNER_LOAD_TIMEOUT_MS);
    }

    private async cleanupListeners() {
        const listeners = this.listeners.splice(0);
        await Promise.allSettled(listeners.map(listener => this.nativeCall(
            'listener removal', Promise.resolve().then(() => listener.remove()),
        )));
    }

    private scheduleRetry(readinessOnly = false) {
        if (this.disposed || this.desired === 'removed') return;
        // No tight no-fill loops, no manual refreshing of a loaded ad, and no
        // recovery request inside AdMob's recommended 60-second interval.
        if (!this.retryAt || this.retryAt <= Date.now()) {
            const delay = readinessOnly
                ? Math.min(BANNER_READINESS_RETRY_INITIAL_MS * 2 ** this.readinessRetryCount++, BANNER_READINESS_RETRY_MAX_MS)
                : Math.min(BANNER_RETRY_INITIAL_MS * 2 ** this.retryCount++, BANNER_RETRY_MAX_MS);
            this.retryAt = Date.now() + delay;
        }
        this.waitForRetry();
    }

    private waitForRetry(): boolean {
        if (!this.retryAt) return false;
        const waitMs = this.retryAt - Date.now();
        if (waitMs <= 0) {
            this.retryAt = 0;
            this.clearRetry();
            return false;
        }
        if (this.desired !== 'visible' || this.retryTimer) return true;
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.reconcile();
        }, waitMs);
        return true;
    }

    private async registerListeners() {
        if (this.listeners.length) return;
        const registrations = [
            () => AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
                if (!this.attached || this.disposed) return;
                this.loaded = true;
                this.clearLoadTimer();
                this.stalled = false;
                this.retryCount = 0;
                this.retryAt = 0;
                this.clearRetry();
                console.log('[AdMob] Top banner loaded.');
            }),
            () => AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (error: unknown) => {
                if (!this.attached || this.disposed) return;
                this.clearLoadTimer();
                ++this.requestVersion;
                this.attached = false; // Android destroys a failed banner itself.
                this.visible = false;
                this.loaded = false;
                this.positionDirty = false;
                this.reserve(0);
                console.warn('[AdMob] Top banner failed to load:', error);
                this.scheduleRetry();
            }),
            () => AdMob.addListener(BannerAdPluginEvents.AdImpression, () => console.log('[AdMob] Top banner impression.')),
        ];
        for (const register of registrations) {
            const pending = register();
            // If bridge registration times out, remove a late listener too.
            let expired = false;
            try {
                const listener = await AdMobService.withNativeTimeout('Banner listener', pending, 5000);
                this.listeners.push(listener);
            } catch (error) {
                expired = true;
                void pending.then(listener => { if (expired) AdMobService.removeListener(listener); }).catch(() => {});
                throw error;
            }
        }
    }

    private reconcile(): Promise<void> {
        if (this.running) return this.running;
        this.running = this.drain().catch(async error => {
            console.warn('[AdMob] Top banner operation failed:', error);
            await this.remove().catch(cleanupError => console.warn('[AdMob] Banner cleanup failed:', cleanupError));
            await this.cleanupListeners();
            this.scheduleRetry();
        }).finally(() => { this.running = null; });
        return this.running;
    }

    private async remove() {
        this.clearLoadTimer();
        this.stalled = false;
        ++this.requestVersion;
        // Removal is harmless even if no ad is attached, and also cleans up a
        // native view whose bridge show response did not complete normally.
        this.attached = false;
        this.visible = false;
        this.loaded = false;
        this.positionDirty = false;
        this.reserve(0);
        await this.nativeCall('removal', AdMob.removeBanner());
    }

    private async drain() {
        if (!canUseNativeAdMob()) return;
        for (;;) {
            const mode = this.desired;
            if (this.stalled) {
                await this.remove();
                this.scheduleRetry();
                if (this.desired === 'visible') return;
                continue;
            }
            if (mode === 'removed') {
                await this.remove();
            } else if (mode === 'hidden') {
                this.clearLoadTimer();
                if (this.attached && this.visible) await this.nativeCall('hide', AdMob.hideBanner());
                this.visible = false;
                this.reserve(0);
            } else {
                if (this.waitForRetry()) return;
                const initialized = await AdMobService.ensureInitialized('Top banner');
                this.consentReady(AdMobService.isPrivacyOptionsRequired());
                if (this.desired !== 'visible') continue;
                if (!initialized || !AdMobService.canRequestAds || AdMobService.privacyOptionsInProgress) {
                    await this.remove();
                    this.scheduleRetry(true);
                    return;
                }
                this.readinessRetryCount = 0;
                await this.registerListeners();
                if (this.desired !== 'visible') continue;
                if (!AdMobService.canRequestAds || AdMobService.privacyOptionsInProgress) {
                    await this.remove();
                    this.scheduleRetry(true);
                    return;
                }
                // The component owns a stable layout slot. This reports native
                // visibility without collapsing that slot during suspension.
                this.reserve(getBannerSlotHeight());
                if (this.attached && this.positionDirty) {
                    const margin = this.topMargin;
                    const viewportWidthDp = this.viewportWidthDp;
                    if (this.visible) await this.nativeCall('hide', AdMob.hideBanner());
                    this.visible = false;
                    if (await this.moveBanner?.(margin)) {
                        this.positionDirty = this.topMargin !== margin || this.viewportWidthDp !== viewportWidthDp;
                    } else {
                        // Older APKs cannot move their cached view. Recreate
                        // only on a real layout change, never on scrolling.
                        await this.remove();
                    }
                    if (this.desired !== 'visible') continue;
                }
                if (this.attached) {
                    if (!this.visible) {
                        this.visible = true;
                        await this.nativeCall('resume', AdMob.resumeBanner());
                    }
                } else {
                    this.reserve(getBannerSlotHeight());
                    ++this.requestVersion;
                    this.attached = true;
                    this.visible = true;
                    this.loaded = false;
                    try {
                        this.watchLoad();
                        console.log('[AdMob] Requesting top banner.', { adId: this.adId });
                        await this.nativeCall('show', AdMob.showBanner({
                            adId: this.adId,
                            adSize: BannerAdSize.BANNER,
                            position: BANNER_POSITION,
                            margin: this.topMargin,
                            isTesting: false,
                        }));
                        // Native show resolves on view creation, not on load;
                        // Loaded/FailedToLoad clear the watchdog above.
                        if (this.attached && this.moveBanner) {
                            // Apply the measured slot immediately, including its
                            // safe area, rather than waiting for the first resize.
                            const margin = this.topMargin;
                            const viewportWidthDp = this.viewportWidthDp;
                            if (await this.moveBanner(margin)) {
                                this.positionDirty = this.topMargin !== margin || this.viewportWidthDp !== viewportWidthDp;
                            }
                        }
                    } catch (error) {
                        await this.remove();
                        this.scheduleRetry();
                        throw error;
                    }
                }
                this.watchLoad();
            }
            if (mode === this.desired && (mode !== 'visible' || !this.positionDirty)) return;
        }
    }

    async dispose() {
        this.disposed = true;
        this.desired = 'removed';
        this.clearRetry();
        await this.reconcile();
        this.clearLoadTimer();
        await this.cleanupListeners();
    }
}
