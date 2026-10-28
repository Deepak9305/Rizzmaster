import { AdMob, BannerAdPluginEvents, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';
import type { PluginListenerHandle } from '@capacitor/core';
import { SimpleAds, bounded } from './simpleAds';
import { recordAdEvent } from './adDiagnostics';

export class SimpleBannerController {
    private desired: 'visible' | 'hidden' | 'removed' = 'removed';
    private attached = false;
    private visible = false;
    private loaded = false;
    private disposed = false;
    private dirty = false;
    private width = 320;
    private height = 50;
    private adaptive = false;
    private sizeDirty = false;
    private online = true;
    private retryAt = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private loadTimer: ReturnType<typeof setTimeout> | null = null;
    private queue: Promise<void> = Promise.resolve();
    private listeners: PluginListenerHandle[] = [];
    private unsubscribe: () => void;
    constructor(private adId: string, private margin: number, private reserve: (height: number) => void,
        private consentReady: (required: boolean) => void, private move?: (margin: number) => Promise<boolean>) {
        this.unsubscribe = SimpleAds.subscribeReadiness(() => { void this.reconcile(); });
    }
    setMode(mode: 'visible' | 'hidden' | 'removed') { this.desired = mode; return this.reconcile(); }
    setNetworkAvailable(online: boolean) { this.online = online; return this.reconcile(); }
    setTopMargin(margin: number, width = this.width, height = this.height, adaptive = this.adaptive) {
        this.sizeDirty ||= this.attached && (adaptive !== this.adaptive || (adaptive && width !== this.width));
        this.dirty ||= this.margin !== margin;
        this.margin = margin; this.width = width; this.height = height; this.adaptive = adaptive;
        return this.reconcile();
    }
    private clearTimers() {
        if (this.timer) clearTimeout(this.timer);
        if (this.loadTimer) clearTimeout(this.loadTimer);
        this.timer = this.loadTimer = null;
    }
    private retry() {
        this.retryAt = Date.now() + 60000;
        this.schedule();
    }
    private schedule() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
        if (!this.disposed && this.desired === 'visible' && this.online && SimpleAds.active) {
            this.timer = setTimeout(() => { this.timer = null; void this.reconcile(); }, Math.max(1000, this.retryAt - Date.now()));
        }
    }
    private reconcile() {
        this.queue = this.queue.then(() => this.update()).catch(error => {
            recordAdEvent('banner.bridge-error');
            console.warn('[Ads] Banner operation failed', error);
            this.retry();
        });
        return this.queue;
    }
    private async listen() {
        if (this.listeners.length) return;
        const add = async (event: any, callback: () => void) => {
            let expired = false;
            const registration = AdMob.addListener(event, callback);
            void registration.then(handle => { if (expired || this.disposed) void handle.remove().catch(() => {}); }).catch(() => {});
            try { this.listeners.push(await bounded('Banner listener', registration, 5000)); }
            catch (error) { expired = true; throw error; }
        };
        try {
            await add(BannerAdPluginEvents.Loaded, () => {
                if (!this.attached) return;
                this.loaded = true;
                this.retryAt = 0;
                this.clearTimers();
                recordAdEvent('banner.loaded');
                void this.reconcile();
            });
            await add(BannerAdPluginEvents.FailedToLoad, () => {
                // Upstream destroys the view even when an automatic refresh fails.
                this.attached = this.loaded = this.visible = false;
                this.reserve(0); this.clearTimers();
                recordAdEvent('banner.failed'); this.retry();
            });
        } catch (error) {
            this.listeners.splice(0).forEach(handle => { void handle.remove().catch(() => {}); });
            throw error;
        }
        // Optional telemetry must never block banner loading.
        void add(BannerAdPluginEvents.AdImpression, () => recordAdEvent('banner.impression')).catch(() => {});
    }
    private async remove() {
        this.clearTimers();
        if (this.attached) await bounded('Banner removal', AdMob.removeBanner());
        this.attached = this.visible = this.loaded = false;
        this.reserve(0);
    }
    private async update() {
        this.consentReady(SimpleAds.isPrivacyOptionsRequired());
        if (this.disposed || this.desired === 'removed') { await this.remove(); return; }
        if (!SimpleAds.canRequestAds || SimpleAds.privacyOptionsInProgress) {
            await this.remove(); return;
        }
        if (this.desired !== 'visible' || !this.online || !SimpleAds.active || SimpleAds.isRewardVideoShowing) {
            this.clearTimers();
            if (this.attached && this.visible) await bounded('Banner hide', AdMob.hideBanner());
            this.visible = false; this.reserve(0); return;
        }
        if (!SimpleAds.initialized) return;
        if (this.sizeDirty) { await this.remove(); this.sizeDirty = false; }
        if (this.retryAt > Date.now()) { this.schedule(); return; }
        await this.listen();
        // State can change during listener registration.
        if (this.desired !== 'visible' || !SimpleAds.ready() || !this.online || this.disposed) return;
        if (!this.attached) {
            recordAdEvent('banner.request');
            this.attached = true; this.visible = true; this.loaded = false;
            try {
                await bounded('Banner creation', AdMob.showBanner({ adId: this.adId, isTesting: false,
                    adSize: this.adaptive ? BannerAdSize.ADAPTIVE_BANNER : BannerAdSize.BANNER,
                    position: BannerAdPosition.TOP_CENTER, margin: this.margin }));
            } catch (error) {
                await this.remove(); throw error;
            }
            this.dirty = true;
        }
        if (this.dirty && this.attached) {
            const margin = this.margin;
            if (this.move && !await this.move(margin)) throw new Error('Banner view not available for placement');
            this.dirty = margin !== this.margin;
        }
        if (this.attached && !this.visible) {
            await bounded('Banner resume', AdMob.resumeBanner()); this.visible = true;
        }
        if (this.attached) this.reserve(this.height);
        if (!this.loaded && !this.loadTimer && this.attached) {
            this.loadTimer = setTimeout(() => {
                this.loadTimer = null;
                this.queue = this.queue.then(async () => { await this.remove(); this.retry(); }).catch(() => this.retry());
            }, 90000);
        }
    }
    async dispose() {
        this.disposed = true; this.unsubscribe(); this.clearTimers();
        await this.reconcile();
        await Promise.allSettled(this.listeners.splice(0).map(handle => handle.remove()));
    }
}
