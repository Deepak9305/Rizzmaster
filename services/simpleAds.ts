import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { AdMob, RewardAdPluginEvents } from '@capacitor-community/admob';
import { observeBannerForeground } from './bannerLifecycle';
import { getAdDeliveryDiagnostics, recordAdEvent } from './adDiagnostics';

export const usesSimpleAds = () => Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('AdsStartup');
export type AdsState = { canRequestAds: boolean; sdkReady: boolean; privacyOptionsRequired: boolean; busy: boolean; formOpen: boolean; error?: string };
const Startup = registerPlugin<{
    start(): Promise<AdsState>; getState(): Promise<AdsState>; showPrivacyOptions(): Promise<AdsState>;
    addListener(event: 'stateChanged', callback: (state: AdsState) => void): Promise<PluginListenerHandle>;
}>('AdsStartup');

export async function bounded<T>(label: string, work: Promise<T>, ms = 10000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([work, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`${label} timed out`)), ms); })]); }
    finally { if (timer) clearTimeout(timer); }
}

const RETRY_MS = 60000;
const CACHE_MS = 55 * 60000;

/** One readiness/lifecycle source, one native load, and one explicit reward presentation. */
export const SimpleAds = {
    state: { canRequestAds: false, sdkReady: false, privacyOptionsRequired: false, busy: false, formOpen: false } as AdsState,
    active: false, online: true, started: false,
    listeners: new Set<() => void>(),
    runtimeStop: null as (() => void) | null,
    startupTask: null as Promise<boolean> | null,
    startupRetryAt: 0,
    timer: null as ReturnType<typeof setTimeout> | null,
    rewardAdId: '', eligible: null as (() => boolean) | null,
    loadTask: null as Promise<boolean> | null,
    loadRetryAt: 0, rewardVideoPreparedAt: 0, cachedAdId: '',
    rewardVideoRequestCount: 0, generation: 0, actionVersion: 0,
    isRewardVideoShowing: false, rewardVideoDisplayStarted: false,
    REWARDED_STALE_AFTER_MS: CACHE_MS,
    get initialized() { return this.state.sdkReady; },
    get canRequestAds() { return this.state.canRequestAds; },
    get privacyOptionsInProgress() { return this.state.formOpen; },
    get rewardVideoPreparing() { return this.loadTask !== null; },
    get rewardVideoReady() { return this.hasFreshRewardVideo(); },
    withNativeTimeout: bounded,
    isPrivacyOptionsRequired() { return this.state.privacyOptionsRequired; },
    subscribeReadiness(callback: () => void) { this.listeners.add(callback); return () => { this.listeners.delete(callback); }; },
    notify() { for (const callback of this.listeners) { try { callback(); } catch (e) { console.warn('[Ads] Observer failed', e); } } },
    getDeliveryDiagnostics() { return { ...getAdDeliveryDiagnostics(), ...this.state, foreground: this.active, online: this.online, rewardPreparing: this.rewardVideoPreparing, rewardShowing: this.isRewardVideoShowing, rewardImpressions: 'unavailable: stock plugin exposes paid events only' }; },
    apply(state: AdsState) {
        if ((this.state.canRequestAds && !state.canRequestAds) || (!this.state.formOpen && state.formOpen)) this.invalidateRewardVideo(false);
        this.state = state;
        recordAdEvent(state.error ? 'startup.error' : 'startup.state');
        this.notify();
        this.schedule();
        if (this.ready() && this.eligible?.() && !this.isRewardVideoShowing) void this.prepareRewardVideo(this.rewardAdId, undefined, this.eligible);
    },
    ready() { return this.initialized && this.canRequestAds && !this.privacyOptionsInProgress && this.active && this.online; },
    startRuntime(initialOnline: boolean) {
        this.runtimeStop?.();
        this.online = initialOnline;
        let stopped = false;
        let listener: PluginListenerHandle | null = null;
        let revision = 0;
        const registration = Startup.addListener('stateChanged', state => { if (!stopped) { revision++; this.apply(state); } });
        void registration.then(handle => { if (stopped) void handle.remove(); else listener = handle; }).catch(e => console.warn('[Ads] State listener failed', e));
        const stopForeground = observeBannerForeground(active => {
            if (stopped) return;
            this.active = active;
            this.notify();
            if (active) void this.tick(); else this.clearTimer();
        });
        this.runtimeStop = () => { stopped = true; stopForeground(); this.clearTimer(); if (listener) void listener.remove().catch(() => {}); this.active = false; };
        const stateRevision = revision;
        void bounded('Ads state', Startup.getState()).then(state => { if (!stopped && revision === stateRevision) this.apply(state); }).catch(() => {});
        return {
            setOnline: (online: boolean) => { if (stopped) return; this.online = online; this.notify(); if (online) void this.tick(); else this.clearTimer(); },
            stop: this.runtimeStop,
        };
    },
    clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; },
    schedule() {
        this.clearTimer();
        if (!this.active || !this.online) return;
        const delay = this.ready() && this.eligible?.() && this.hasFreshRewardVideo(this.rewardAdId)
            ? Math.max(1000, CACHE_MS - (Date.now() - this.rewardVideoPreparedAt)) : RETRY_MS;
        this.timer = setTimeout(() => { this.timer = null; void this.tick(); }, delay);
    },
    async tick() {
        if (!this.active || !this.online) return;
        if (!this.ready() && Date.now() >= this.startupRetryAt) await this.ensureInitialized('startup');
        if (this.ready() && this.eligible?.() && !this.isRewardVideoShowing) await this.prepareRewardVideo(this.rewardAdId, undefined, this.eligible);
        this.schedule();
    },
    ensureInitialized(_context = ''): Promise<boolean> {
        if (!usesSimpleAds() || !this.active || !this.online) return Promise.resolve(false);
        if (this.ready()) return Promise.resolve(true);
        if (this.startupTask) return this.startupTask;
        this.startupTask = (async () => {
            // Native start() returns state promptly and owns outstanding SDK/form operations.
            try { this.apply(await bounded('Ads startup', Startup.start(), 45000)); }
            catch (e) { recordAdEvent('startup.failed'); console.warn('[Ads] Startup unavailable', e); }
            this.startupRetryAt = Date.now() + RETRY_MS;
            return this.ready();
        })().finally(() => { this.startupTask = null; });
        return this.startupTask;
    },
    async showPrivacyOptionsForm() {
        if (!usesSimpleAds() || this.isRewardVideoShowing || this.state.formOpen) return this.canRequestAds;
        try { this.apply(await bounded('Privacy options', Startup.showPrivacyOptions())); }
        catch (e) { console.warn('[Ads] Privacy options unavailable', e); }
        return this.canRequestAds;
    },
    setRewardEligibility(adId: string, eligible: (() => boolean) | null) {
        this.rewardAdId = adId;
        this.eligible = eligible;
        void this.tick();
    },
    invalidateRewardVideo(cancelActions = true) {
        this.generation++;
        if (cancelActions) this.actionVersion++;
        this.cachedAdId = ''; this.rewardVideoPreparedAt = 0;
        this.notify();
    },
    waitForRewardReady(actionVersion: number): Promise<boolean> {
        if (!this.active || !this.online || actionVersion !== this.actionVersion) return Promise.resolve(false);
        if (this.ready()) return Promise.resolve(true);
        return new Promise(resolve => {
            let settled = false;
            const finish = (ready: boolean) => {
                if (settled) return;
                settled = true;
                clearTimeout(timer);
                this.listeners.delete(check);
                resolve(ready);
            };
            const check = () => {
                if (!this.active || !this.online || actionVersion !== this.actionVersion) finish(false);
                else if (this.ready()) finish(true);
            };
            const timer = setTimeout(() => finish(false), 45000);
            this.listeners.add(check);
            // start() returns promptly; the native readiness event completes this wait.
            void this.ensureInitialized('watch').then(check, () => finish(false));
            check();
        });
    },
    hasFreshRewardVideo(adId?: string, _ssv?: unknown): boolean {
        return Boolean(this.cachedAdId && (!adId || adId === this.cachedAdId) && Date.now() - this.rewardVideoPreparedAt < CACHE_MS);
    },
    async prepareRewardVideo(adId: string, _ssv?: unknown, canPrepare: () => boolean = () => true): Promise<boolean> {
        if (this.isRewardVideoShowing || !adId || !canPrepare() || !this.ready()) return false;
        if (this.hasFreshRewardVideo(adId)) return true;
        if (this.loadTask) return bounded('Reward load', this.loadTask, 35000).catch(() => false);
        if (Date.now() < this.loadRetryAt) return false;
        const generation = this.generation;
        let requested = false;
        // Keep this underlying promise until native settles, even after the UI wait expires.
        // Stock native caches by ad ID: another overlapping load could replace the wrong ad.
        this.loadTask = Promise.resolve().then(() => {
            if (!this.ready() || !canPrepare() || generation !== this.generation) return;
            requested = true;
            this.rewardVideoRequestCount++;
            recordAdEvent('reward.request');
            return AdMob.prepareRewardVideoAd({ adId, isTesting: false });
        }).then(() => {
            if (!requested || generation !== this.generation || !this.canRequestAds || this.privacyOptionsInProgress) return false;
            this.cachedAdId = adId;
            this.rewardVideoPreparedAt = Date.now();
            this.loadRetryAt = 0;
            recordAdEvent('reward.loaded');
            return true;
        }, error => { this.loadRetryAt = Date.now() + RETRY_MS; recordAdEvent('reward.failed', error?.code); return false; })
            .finally(() => { this.loadTask = null; this.notify(); this.schedule(); });
        return bounded('Reward load', this.loadTask, 35000).catch(() => false);
    },
    async showRewardVideo(adId: string, _ssv?: unknown, onShow?: () => void, onEarned?: () => void): Promise<boolean> {
        if (this.isRewardVideoShowing) return false;
        const actionVersion = this.actionVersion;
        if (!await this.waitForRewardReady(actionVersion) || actionVersion !== this.actionVersion) return false;
        const generation = this.generation;
        if (!await this.prepareRewardVideo(adId) || !this.ready() || generation !== this.generation || actionVersion !== this.actionVersion || this.isRewardVideoShowing) return false;
        this.isRewardVideoShowing = true;
        this.notify();
        const handles: PluginListenerHandle[] = [];
        let issued = false, earned = false, ended = false, uiResolved = false;
        let timer: ReturnType<typeof setTimeout> | null = null;
        let grace: ReturnType<typeof setTimeout> | null = null;
        let resolveUi: (value: boolean) => void;
        const result = new Promise<boolean>(resolve => { resolveUi = resolve; });
        const deliver = () => { if (!uiResolved) { uiResolved = true; resolveUi(earned); } };
        const reward = (info: { amount?: number }) => {
            if (!issued || ended || earned || generation !== this.generation || !Number.isFinite(Number(info?.amount)) || Number(info?.amount) <= 0) return;
            earned = true;
            recordAdEvent('reward.earned');
            onEarned?.();
        };
        const finish = () => {
            if (ended) return;
            ended = true;
            if (timer) clearTimeout(timer);
            if (grace) clearTimeout(grace);
            handles.forEach(handle => { void handle.remove().catch(() => {}); });
            this.isRewardVideoShowing = false;
            this.rewardVideoDisplayStarted = false;
            this.notify();
            deliver();
            this.schedule();
        };
        const add = async (event: any, callback: (info: any) => void) => {
            let expired = false;
            const registration = AdMob.addListener(event, callback);
            void registration.then(handle => { if (expired) void handle.remove().catch(() => {}); }).catch(() => {});
            try { handles.push(await bounded('Reward listener', registration, 5000)); }
            catch (error) { expired = true; throw error; }
        };
        try {
            await add(RewardAdPluginEvents.Showed, () => {
                if (!issued || ended) return;
                this.rewardVideoDisplayStarted = true;
                if (timer) clearTimeout(timer);
                recordAdEvent('reward.shown'); onShow?.();
            });
            await add(RewardAdPluginEvents.Rewarded, reward);
            await add(RewardAdPluginEvents.Dismissed, () => {
                if (!issued || ended) return;
                recordAdEvent('reward.dismissed');
                // Allow a mediated earned callback that arrives just after dismissal.
                grace = setTimeout(finish, 2000);
            });
            await add(RewardAdPluginEvents.FailedToShow, () => { if (issued) finish(); });
            if (!this.ready() || generation !== this.generation) { finish(); return result; }
            this.cachedAdId = ''; this.rewardVideoPreparedAt = 0;
            issued = true;
            timer = setTimeout(() => {
                // A native show cannot be cancelled through stock plugin APIs. Release
                // the UI wait, but retain ownership until a terminal native callback.
                recordAdEvent('reward.show-timeout'); deliver();
            }, 40000);
            void AdMob.showRewardVideoAd({ adId }).then(reward, () => finish());
        } catch (e) { console.warn('[Ads] Reward unavailable', e); finish(); }
        return result;
    },
};
