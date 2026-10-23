import { AdMob, BannerAdPluginEvents, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob';
import type { PluginListenerHandle } from '@capacitor/core';
import { AdMobService } from './admobService';
import { canUseNativeAdMob } from './nativeCapabilities';

export type BannerMode = 'visible' | 'hidden' | 'removed';
export const BANNER_WIDTH = 320;
export const BANNER_HEIGHT = 50;
export const BANNER_POSITION = BannerAdPosition.TOP_CENTER;
// Actual failed loads remain paced. Refresh of a loaded banner belongs to the SDK.
export const BANNER_RETRY_INITIAL_MS = 60_000;
// Permission checks do not issue ad requests. Recover these sooner while
// retaining the slower pacing for actual load failures and no-fill.
export const BANNER_READINESS_RETRY_INITIAL_MS = 15_000;
export const BANNER_READINESS_RETRY_MAX_MS = 60_000;
export const BANNER_LOAD_TIMEOUT_MS = 90_000;
export const getBannerSlotHeight = () => BANNER_HEIGHT;
type RetryKind = 'load' | 'network' | 'local' | 'readiness';

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
    private reconcileAgain = false;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private networkRetryCount = 0;
    private readinessRetryCount = 0;
    private localRetryCount = 0;
    private retryKind: RetryKind = 'load';
    private retryAt = 0;
    private requestVersion = 0;
    private loadTimer: ReturnType<typeof setTimeout> | null = null;
    private stalled = false;
    private positionDirty = false;
    private viewportWidthDp = 0;
    private requestedWidthDp = 0;
    private requestedAdaptive = false;
    private bannerHeightDp = BANNER_HEIGHT;
    private adaptive = false;
    private networkAvailable = true;
    private readonly stopReadiness: () => void;

    constructor(
        private readonly adId: string,
        private topMargin: number,
        private readonly reserve: (height: number) => void,
        private readonly consentReady: (required: boolean) => void,
        private readonly moveBanner?: (margin: number) => Promise<boolean>,
    ) {
        this.stopReadiness = AdMobService.subscribeReadiness(() => {
            if (this.disposed || this.desired !== 'visible') return;
            const permitted = AdMobService.canRequestAds && !AdMobService.privacyOptionsInProgress;
            if (permitted && this.retryKind === 'readiness') {
                this.retryAt = 0;
                this.clearRetry();
            }
            if (permitted || this.attached) void this.reconcile();
        });
    }

    setTopMargin(margin: number, viewportWidthDp = this.viewportWidthDp, heightDp = this.bannerHeightDp, adaptive = this.adaptive): Promise<void> {
        if (this.disposed || (margin === this.topMargin && viewportWidthDp === this.viewportWidthDp && heightDp === this.bannerHeightDp && adaptive === this.adaptive)) return this.running ?? Promise.resolve();
        this.topMargin = margin;
        this.viewportWidthDp = viewportWidthDp;
        this.bannerHeightDp = heightDp;
        this.adaptive = adaptive;
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
                this.networkRetryCount = 0;
                this.readinessRetryCount = 0;
                this.localRetryCount = 0;
            }
        }
        return this.reconcile();
    }

    setNetworkAvailable(available: boolean): Promise<void> {
        if (this.disposed || available === this.networkAvailable) return this.running ?? Promise.resolve();
        this.networkAvailable = available;
        if (!available) {
            this.clearRetry();
            this.clearLoadTimer();
        } else if (this.retryKind === 'network') {
            this.retryAt = 0;
            this.clearRetry();
        }
        // Reconnect wakes network recovery. A no-fill deadline remains intact.
        return this.reconcile();
    }

    private nativeCall<T>(label: string, promise: Promise<T>): Promise<T> {
        return AdMobService.withNativeTimeout(`Banner ${label}`, promise, 10000);
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
        if (this.loaded || !this.attached || this.desired !== 'visible' || !this.networkAvailable || this.loadTimer) return;
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

    private scheduleRetry(kind: RetryKind = 'load') {
        if (this.disposed || this.desired === 'removed') return;
        // Bridge/listener failures are not no-fill responses. Recover locally
        // without making them wait through the demand-failure cooldown.
        if (!this.retryAt || this.retryAt <= Date.now()) {
            this.retryKind = kind;
            const delay = kind === 'readiness'
                ? Math.min(BANNER_READINESS_RETRY_INITIAL_MS * 2 ** this.readinessRetryCount++, BANNER_READINESS_RETRY_MAX_MS)
                : kind === 'local' ? Math.min(1000 * 2 ** this.localRetryCount++, 15000)
                : kind === 'network' ? Math.min(15000 * 2 ** this.networkRetryCount++, 60000)
                : BANNER_RETRY_INITIAL_MS;
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
        if (this.desired !== 'visible' || !this.networkAvailable || this.retryTimer) return true;
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
                this.networkRetryCount = 0;
                this.localRetryCount = 0;
                this.retryAt = 0;
                this.clearRetry();
                console.log('[AdMob] Top banner loaded.');
            }),
            () => AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (error: unknown) => {
                if (!this.attached || this.disposed) return;
                this.clearLoadTimer();
                console.warn('[AdMob] Top banner failed to load:', error);
                const failure = error as { code?: number; viewRetained?: boolean } | null;
                if (failure?.viewRetained) {
                    // A transient SDK refresh failure does not invalidate the
                    // displayed ad. Keep its view and automatic-refresh lifecycle.
                    this.loaded = true; // Native confirms it has a previously loaded ad.
                    this.stalled = false;
                    return;
                }
                ++this.requestVersion;
                this.attached = false; // Initial-load failure destroys its native view.
                this.visible = false;
                this.loaded = false;
                this.positionDirty = false;
                this.reserve(0);
                this.scheduleRetry(failure?.code === 2 ? 'network' : 'load');
            }),
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
        // Impression telemetry must never prevent requesting an ad. A missing
        // optional event on an older bridge is safe; Loaded/Failed remain required.
        const requiredListener = this.listeners[0];
        void Promise.resolve().then(() => AdMob.addListener(
            BannerAdPluginEvents.AdImpression, () => console.log('[AdMob] Top banner impression.'),
        )).then(listener => {
            if (this.disposed || this.listeners[0] !== requiredListener) AdMobService.removeListener(listener);
            else this.listeners.push(listener);
        }).catch(error => console.warn('[AdMob] Banner impression telemetry unavailable:', error));
    }

    private reconcile(): Promise<void> {
        if (this.running) {
            this.reconcileAgain = true;
            return this.running;
        }
        this.running = (async () => {
            do {
                this.reconcileAgain = false;
                try { await this.drain(); }
                catch (error) {
                    console.warn('[AdMob] Top banner operation failed:', error);
                    await this.remove().catch(cleanupError => console.warn('[AdMob] Banner cleanup failed:', cleanupError));
                    await this.cleanupListeners();
                    this.scheduleRetry('local');
                }
            } while (this.reconcileAgain);
        })().finally(() => { this.running = null; });
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
        this.requestedWidthDp = 0;
        this.reserve(0);
        await this.nativeCall('removal', AdMob.removeBanner());
    }

    private needsNewSize() {
        return this.attached && (this.adaptive !== this.requestedAdaptive ||
            (this.adaptive && this.requestedWidthDp !== this.viewportWidthDp));
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
                if (!this.networkAvailable) {
                    if (this.attached && this.visible) await this.nativeCall('hide', AdMob.hideBanner());
                    this.visible = false;
                    this.reserve(0);
                    return;
                }
                if (this.attached && (!AdMobService.canRequestAds || AdMobService.privacyOptionsInProgress)) {
                    await this.remove();
                }
                if (this.waitForRetry()) return;
                const initialized = await AdMobService.ensureInitialized('Top banner');
                this.consentReady(AdMobService.isPrivacyOptionsRequired());
                if (this.desired !== 'visible') continue;
                if (!this.networkAvailable) continue;
                if (!initialized || !AdMobService.canRequestAds || AdMobService.privacyOptionsInProgress) {
                    await this.remove();
                    this.scheduleRetry('readiness');
                    return;
                }
                this.readinessRetryCount = 0;
                await this.registerListeners();
                if (this.desired !== 'visible') continue;
                if (!this.networkAvailable) continue;
                if (!AdMobService.canRequestAds || AdMobService.privacyOptionsInProgress) {
                    await this.remove();
                    this.scheduleRetry('readiness');
                    return;
                }
                // The component owns a stable layout slot. This reports native
                // visibility without collapsing that slot during suspension.
                // Adaptive ads need a new SDK size only when the real width
                // changes. Keyboard, scrolling and modal returns reuse them.
                if (this.needsNewSize()) {
                    await this.remove();
                    if (this.desired !== 'visible') continue;
                }
                this.reserve(this.bannerHeightDp);
                if (this.attached && this.positionDirty) {
                    const margin = this.topMargin;
                    const viewportWidthDp = this.viewportWidthDp;
                    this.clearLoadTimer();
                    if (this.visible) await this.nativeCall('hide', AdMob.hideBanner());
                    this.visible = false;
                    try {
                        if (await this.moveBanner?.(margin)) {
                            this.positionDirty = this.topMargin !== margin || this.viewportWidthDp !== viewportWidthDp;
                        } else {
                            // Only confirmed unsupported/missing views need recreation.
                            await this.remove();
                        }
                    } catch (error) {
                        console.warn('[AdMob] Banner positioning will retry:', error);
                        this.scheduleRetry('local');
                        return; // Keep the cached view hidden until it is positioned safely.
                    }
                    if (this.desired !== 'visible') continue;
                }
                if (this.attached) {
                    if (!this.visible) {
                        this.visible = true;
                        await this.nativeCall('resume', AdMob.resumeBanner());
                    }
                } else {
                    this.reserve(this.bannerHeightDp);
                    ++this.requestVersion;
                    this.attached = true;
                    this.visible = true;
                    this.loaded = false;
                    this.requestedWidthDp = this.viewportWidthDp;
                    this.requestedAdaptive = this.adaptive;
                    try {
                        this.watchLoad();
                        console.log('[AdMob] Requesting top banner.', { adId: this.adId });
                        await this.nativeCall('show', AdMob.showBanner({
                            adId: this.adId,
                            adSize: this.adaptive ? BannerAdSize.ADAPTIVE_BANNER : BannerAdSize.BANNER,
                            position: BANNER_POSITION,
                            margin: this.topMargin,
                            isTesting: false,
                        }));
                    } catch (error) {
                        // Loaded is stronger evidence than a lost bridge response.
                        // Do not destroy a usable ad or turn that into a fast reload.
                        if (!this.attached || !this.loaded) throw error;
                        console.warn('[AdMob] Banner loaded despite a bridge response failure:', error);
                    }
                    // Native show resolves on view creation, not on load;
                    // Loaded/FailedToLoad clear the watchdog above.
                    if (this.attached && this.moveBanner) {
                        // Apply the measured slot, including its safe area.
                        const margin = this.topMargin;
                        const viewportWidthDp = this.viewportWidthDp;
                        try {
                            if (await this.moveBanner(margin)) {
                                this.positionDirty = this.topMargin !== margin || this.viewportWidthDp !== viewportWidthDp;
                            }
                        } catch (error) {
                            console.warn('[AdMob] Initial banner positioning will retry:', error);
                            this.positionDirty = true;
                            this.clearLoadTimer();
                            if (this.attached && this.visible) await this.nativeCall('hide', AdMob.hideBanner());
                            this.visible = false;
                            this.scheduleRetry('local');
                            return;
                        }
                    }
                }
                this.watchLoad();
            }
            if (mode === this.desired && (mode !== 'visible' || (!this.positionDirty && !this.needsNewSize()))) return;
        }
    }

    async dispose() {
        this.disposed = true;
        this.stopReadiness();
        this.desired = 'removed';
        this.clearRetry();
        await this.reconcile();
        this.clearLoadTimer();
        await this.cleanupListeners();
    }
}
