import { AdMob, BannerAdPluginEvents, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob';
import type { PluginListenerHandle } from '@capacitor/core';
import { AdMobService } from './admobService';
import { canUseNativeAdMob } from './nativeCapabilities';

export type BannerMode = 'visible' | 'hidden' | 'removed';
export const BANNER_HEIGHT = 50;
export const BANNER_BOTTOM_MARGIN = 8;
export const BANNER_CONTENT_GAP = 16;
export const BANNER_SLOT_HEIGHT = BANNER_HEIGHT + BANNER_BOTTOM_MARGIN + BANNER_CONTENT_GAP;

// A single native banner is shared by the app. Serialize show/hide/remove so
// a slow consent response cannot display it over a newer modal or premium session.
export class NativeBannerController {
    private desired: BannerMode = 'removed';
    private attached = false;
    private visible = false;
    private disposed = false;
    private listeners: PluginListenerHandle[] = [];
    private running: Promise<void> | null = null;
    private retryTimer: ReturnType<typeof setTimeout> | null = null;
    private retryCount = 0;
    private requestVersion = 0;
    private loadTimer: ReturnType<typeof setTimeout> | null = null;
    private stalled = false;

    constructor(
        private readonly adId: string,
        private readonly reserve: (height: number) => void,
        private readonly consentReady: (required: boolean) => void,
    ) {}

    setMode(mode: BannerMode): Promise<void> {
        if (this.disposed) return this.running ?? Promise.resolve();
        this.desired = mode;
        if (mode !== 'visible') this.clearRetry();
        return this.reconcile();
    }

    private clearRetry() {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        this.retryTimer = null;
    }

    private clearLoadTimer() {
        if (this.loadTimer) clearTimeout(this.loadTimer);
        this.loadTimer = null;
    }

    private scheduleRetry() {
        if (this.disposed || this.desired !== 'visible' || this.retryTimer) return;
        // No tight no-fill loops and no manual refreshing of a loaded ad.
        const waitMs = Math.min(30_000 * 2 ** this.retryCount++, 300_000);
        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.reconcile();
        }, waitMs);
    }

    private async registerListeners() {
        if (this.listeners.length) return;
        const registrations = [
            () => AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
                this.clearLoadTimer();
                this.stalled = false;
                this.retryCount = 0;
                console.log('[AdMob] Bottom banner loaded.');
            }),
            () => AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (error: unknown) => {
                this.clearLoadTimer();
                ++this.requestVersion;
                this.attached = false; // Android destroys a failed banner itself.
                this.visible = false;
                console.warn('[AdMob] Bottom banner failed to load:', error);
                this.scheduleRetry();
            }),
            () => AdMob.addListener(BannerAdPluginEvents.AdImpression, () => console.log('[AdMob] Bottom banner impression.')),
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
                void pending.then(listener => { if (expired) void listener.remove(); }).catch(() => {});
                throw error;
            }
        }
    }

    private reconcile(): Promise<void> {
        if (this.running) return this.running;
        this.running = this.drain().catch(async error => {
            console.warn('[AdMob] Bottom banner operation failed:', error);
            await this.remove().catch(cleanupError => console.warn('[AdMob] Banner cleanup failed:', cleanupError));
            await Promise.allSettled(this.listeners.map(listener => listener.remove()));
            this.listeners = [];
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
        await AdMob.removeBanner();
        this.attached = false;
        this.visible = false;
        this.reserve(0);
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
                if (this.attached && this.visible) await AdMob.hideBanner();
                this.visible = false;
                this.reserve(0);
            } else {
                if (this.retryTimer) return;
                const initialized = await AdMobService.ensureInitialized('Bottom banner');
                this.consentReady(AdMobService.isPrivacyOptionsRequired());
                if (this.desired !== 'visible') continue;
                if (!initialized || !AdMobService.canRequestAds || AdMobService.privacyOptionsInProgress) {
                    await this.remove();
                    this.scheduleRetry();
                    return;
                }
                await this.registerListeners();
                if (this.desired !== 'visible') continue;
                if (!AdMobService.canRequestAds || AdMobService.privacyOptionsInProgress) {
                    await this.remove();
                    this.scheduleRetry();
                    return;
                }
                // Reserve the entire dock synchronously BEFORE the native overlay
                // can appear. BANNER is exactly 50 dp; it never changes on load.
                this.reserve(BANNER_SLOT_HEIGHT);
                if (this.attached) {
                    if (!this.visible) {
                        this.visible = true;
                        await AdMob.resumeBanner();
                    }
                } else {
                    const version = ++this.requestVersion;
                    this.attached = true;
                    this.visible = true;
                    try {
                        this.loadTimer = setTimeout(() => {
                            if (version !== this.requestVersion) return;
                            this.loadTimer = null;
                            this.stalled = true;
                            void this.reconcile();
                        }, 45_000);
                        console.log('[AdMob] Requesting bottom banner.', { adId: this.adId });
                        await AdMob.showBanner({
                            adId: this.adId,
                            adSize: BannerAdSize.BANNER,
                            position: BannerAdPosition.BOTTOM_CENTER,
                            margin: BANNER_BOTTOM_MARGIN,
                            isTesting: false,
                        });
                        // Native show resolves on view creation, not on load;
                        // Loaded/FailedToLoad clear the watchdog above.
                    } catch (error) {
                        await this.remove();
                        this.scheduleRetry();
                        throw error;
                    }
                }
            }
            if (mode === this.desired) return;
        }
    }

    async dispose() {
        this.disposed = true;
        this.desired = 'removed';
        this.clearRetry();
        await this.reconcile();
        this.clearLoadTimer();
        await Promise.allSettled(this.listeners.map(listener => listener.remove()));
        this.listeners = [];
    }
}
