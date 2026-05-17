import {
    AdMob,
    BannerAdOptions,
    BannerAdPosition,
    BannerAdPluginEvents,
    BannerAdSize,
    InterstitialAdPluginEvents,
    RewardAdPluginEvents,
    RewardInterstitialAdPluginEvents,
    AdMobRewardInterstitialItem,
    AdmobConsentDebugGeography,
    AdmobConsentStatus
} from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

type PrepareOptions = {
    label: string;
    loadedEvent: any;
    failedEvent: any;
    prepareAction: () => Promise<unknown>;
};

export const AdMobService = {
    initialized: false,
    interstitialReady: false,
    interstitialPreparing: false,
    isInterstitialShowing: false,
    rewardVideoReady: false,
    rewardVideoPreparing: false,
    isRewardVideoShowing: false,
    rewardInterstitialReady: false,
    rewardInterstitialPreparing: false,
    isRewardInterstitialShowing: false,

    // Internal Promise tracking to avoid redundant fetches and handle race conditions
    initPromise: null as Promise<boolean> | null,
    interstitialPromise: null as Promise<boolean> | null,
    rewardVideoPromise: null as Promise<boolean> | null,
    rewardInterstitialPromise: null as Promise<boolean> | null,
    interstitialPreparedAt: 0,
    lastInterstitialAdId: null as string | null,
    rewardVideoPreparedAt: 0,
    lastRewardVideoAdId: null as string | null,
    rewardInterstitialPreparedAt: 0,
    lastRewardInterstitialAdId: null as string | null,

    // Set this to true to force the GDPR popup to show for everyone during testing/development.
    // Set to false before releasing to the Play Store.
    DEBUG_FORCE_GDPR: false,
    PREPARE_TIMEOUT_MS: 25000,
    INTERSTITIAL_STALE_AFTER_MS: 20 * 60 * 1000,
    REWARDED_STALE_AFTER_MS: 50 * 60 * 1000,
    POST_PREPARE_SHOW_DELAY_MS: 700,
    BANNER_RESHOW_DELAY_MS: 350,

    removeListener(listener: any) {
        try {
            if (listener && typeof listener.remove === 'function') listener.remove();
        } catch { }
    },

    cleanupListeners(listeners: any[]) {
        listeners.forEach(listener => this.removeListener(listener));
    },

    sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    invalidateInterstitial() {
        this.interstitialReady = false;
        this.interstitialPreparing = false;
        this.interstitialPromise = null;
        this.interstitialPreparedAt = 0;
    },

    hasFreshInterstitial(adId?: string) {
        if (!this.interstitialReady) return false;
        if (!this.lastInterstitialAdId) return false;
        if (adId && this.lastInterstitialAdId !== adId) return false;
        return Date.now() - this.interstitialPreparedAt < this.INTERSTITIAL_STALE_AFTER_MS;
    },

    invalidateRewardVideo() {
        this.rewardVideoReady = false;
        this.rewardVideoPreparing = false;
        this.rewardVideoPromise = null;
        this.rewardVideoPreparedAt = 0;
    },

    hasFreshRewardVideo(adId?: string) {
        if (!this.rewardVideoReady) return false;
        if (!this.lastRewardVideoAdId) return false;
        if (adId && this.lastRewardVideoAdId !== adId) return false;
        return Date.now() - this.rewardVideoPreparedAt < this.REWARDED_STALE_AFTER_MS;
    },

    invalidateRewardInterstitial() {
        this.rewardInterstitialReady = false;
        this.rewardInterstitialPreparing = false;
        this.rewardInterstitialPromise = null;
        this.rewardInterstitialPreparedAt = 0;
    },

    hasFreshRewardInterstitial(adId?: string) {
        if (!this.rewardInterstitialReady) return false;
        if (!this.lastRewardInterstitialAdId) return false;
        if (adId && this.lastRewardInterstitialAdId !== adId) return false;
        return Date.now() - this.rewardInterstitialPreparedAt < this.REWARDED_STALE_AFTER_MS;
    },

    async initialize(): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;
        if (this.initialized) return true;
        if (this.initPromise) return this.initPromise;

        this.initPromise = (async (): Promise<boolean> => {
            try {
                if (this.DEBUG_FORCE_GDPR) {
                    try {
                        await AdMob.resetConsentInfo();
                    } catch (error) {
                        console.warn('Reset GDPR info failed', error);
                    }
                }

                const consentInfo = await AdMob.requestConsentInfo({
                    debugGeography: this.DEBUG_FORCE_GDPR ? AdmobConsentDebugGeography.EEA : AdmobConsentDebugGeography.DISABLED,
                });

                const needsConsent = consentInfo.status === AdmobConsentStatus.REQUIRED ||
                    consentInfo.status === AdmobConsentStatus.UNKNOWN;
                if (consentInfo.isConsentFormAvailable && needsConsent) {
                    console.log('AdMob: GDPR Consent Required/Unknown. Showing form...');
                    await AdMob.showConsentForm();
                }

                await AdMob.initialize({ testingDevices: [] });
                this.initialized = true;
                console.log('AdMob Community Initialized with Advertising ID tracking');
                return true;
            } catch (error) {
                console.error('AdMob Community initialization failed', error);
                try {
                    await AdMob.initialize({ testingDevices: [] });
                    this.initialized = true;
                    console.log('AdMob Community Initialized via fallback path');
                    return true;
                } catch (innerError) {
                    console.warn('AdMob: Secondary init fallback also failed:', innerError);
                    this.initialized = false;
                    return false;
                }
            } finally {
                this.initPromise = null;
            }
        })();

        return this.initPromise;
    },

    async ensureInitialized(context: string): Promise<boolean> {
        const initialized = await this.initialize();
        if (!initialized) {
            console.warn(`[AdMob] ${context} skipped because AdMob failed to initialize.`);
        }
        return initialized;
    },

    async runPrepareWithTimeout(options: PrepareOptions): Promise<boolean> {
        const { label, loadedEvent, failedEvent, prepareAction } = options;

        let loadedListener: any = null;
        let failedListener: any = null;
        let timeout: ReturnType<typeof setTimeout> | null = null;

        return new Promise<boolean>((resolve) => {
            let settled = false;

            const cleanup = () => {
                if (timeout) clearTimeout(timeout);
                this.cleanupListeners([loadedListener, failedListener]);
            };

            const settle = (success: boolean, error?: unknown) => {
                if (settled) return;
                settled = true;
                cleanup();
                if (error) {
                    console.error(`[AdMob] ${label} prepare failed:`, error);
                }
                resolve(success);
            };

            void (async () => {
                try {
                    loadedListener = await AdMob.addListener(loadedEvent, () => {
                        console.log(`[AdMob] ${label} loaded successfully`);
                        settle(true);
                    });

                    failedListener = await AdMob.addListener(failedEvent, (info) => {
                        console.error(`[AdMob] ${label} failed to load:`, info);
                        settle(false);
                    });
                } catch (error) {
                    settle(false, error);
                    return;
                }

                timeout = setTimeout(() => {
                    console.warn(`[AdMob] ${label} prepare timed out after ${this.PREPARE_TIMEOUT_MS}ms`);
                    settle(false);
                }, this.PREPARE_TIMEOUT_MS);

                try {
                    await prepareAction();
                } catch (error) {
                    settle(false, error);
                }
            })();
        });
    },

    bannerListeners: [] as any[],
    bannerVisible: false,
    bannerHidden: false,
    bannerRequestInFlight: false,
    bannerAdId: null as string | null,
    bannerPosition: null as 'TOP' | 'BOTTOM' | null,

    resetBannerState(clearConfig = true) {
        this.bannerVisible = false;
        this.bannerHidden = false;
        this.bannerRequestInFlight = false;
        if (clearConfig) {
            this.bannerAdId = null;
            this.bannerPosition = null;
        }
    },

    isSameBanner(adId: string, position: 'TOP' | 'BOTTOM') {
        return this.bannerAdId === adId && this.bannerPosition === position;
    },

    async showBanner(adId: string, position: 'TOP' | 'BOTTOM' = 'BOTTOM') {
        if (!Capacitor.isNativePlatform()) return;

        try {
            const initialized = await this.ensureInitialized('Banner show');
            if (!initialized) return;

            if (this.isSameBanner(adId, position) && this.bannerHidden && !this.bannerRequestInFlight) {
                const resumed = await this.resumeBanner();
                if (resumed) return;
            }

            if (this.isSameBanner(adId, position) && (this.bannerVisible || this.bannerRequestInFlight)) {
                console.log(`[AdMob] Banner already active for ${position}, skipping duplicate request`);
                return;
            }

            this.cleanupListeners(this.bannerListeners);
            this.bannerListeners = [];
            this.bannerAdId = adId;
            this.bannerPosition = position;
            this.bannerVisible = false;
            this.bannerHidden = false;
            this.bannerRequestInFlight = true;

            this.bannerListeners.push(await AdMob.addListener(BannerAdPluginEvents.Loaded, () => {
                console.log('[AdMob] Banner Loaded Successfully');
                this.bannerVisible = !this.bannerHidden;
                this.bannerRequestInFlight = false;
            }));
            this.bannerListeners.push(await AdMob.addListener(BannerAdPluginEvents.AdImpression, () => {
                console.log('[AdMob] Banner Impression Reported - Visibility confirmed!');
                this.bannerVisible = true;
                this.bannerHidden = false;
                this.bannerRequestInFlight = false;
            }));
            this.bannerListeners.push(await AdMob.addListener(BannerAdPluginEvents.FailedToLoad, (info) => {
                console.error('[AdMob] Banner Failed to Load:', info);
                this.resetBannerState(false);
            }));

            const options: BannerAdOptions = {
                adId,
                adSize: BannerAdSize.BANNER,
                position: position === 'TOP' ? BannerAdPosition.TOP_CENTER : BannerAdPosition.BOTTOM_CENTER,
                margin: position === 'TOP' ? 0 : 60,
                isTesting: false
            };

            await AdMob.showBanner(options);
            console.log(`AdMob Banner request sent at ${position}`);
        } catch (error) {
            this.resetBannerState(false);
            console.error('AdMob Show Banner Error:', error);
        }
    },

    async syncBanner(adId: string, position: 'TOP' | 'BOTTOM' = 'BOTTOM') {
        if (!Capacitor.isNativePlatform()) return;

        if (this.isSameBanner(adId, position) && (this.bannerVisible || this.bannerRequestInFlight)) {
            return;
        }

        if (this.isSameBanner(adId, position) && this.bannerHidden) {
            const resumed = await this.resumeBanner();
            if (resumed) return;
        }

        const needsReposition = this.bannerAdId !== null && !this.isSameBanner(adId, position);
        if (needsReposition) {
            await this.removeBanner();
            await this.sleep(this.BANNER_RESHOW_DELAY_MS);
        }

        await this.showBanner(adId, position);
    },

    async hideBanner() {
        if (!Capacitor.isNativePlatform()) return;
        if (!this.bannerVisible && !this.bannerRequestInFlight) return;

        try {
            await AdMob.hideBanner();
            this.bannerVisible = false;
            this.bannerHidden = true;
            this.bannerRequestInFlight = false;
        } catch (error) {
            this.resetBannerState();
            console.error('AdMob Hide Banner Error:', error);
        }
    },

    async resumeBanner(): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        try {
            await AdMob.resumeBanner();
            this.bannerVisible = true;
            this.bannerHidden = false;
            this.bannerRequestInFlight = false;
            return true;
        } catch (error) {
            this.resetBannerState();
            console.error('AdMob Resume Banner Error:', error);
            return false;
        }
    },

    async removeBanner() {
        if (!Capacitor.isNativePlatform()) return;
        try {
            await AdMob.removeBanner();
            this.cleanupListeners(this.bannerListeners);
            this.bannerListeners = [];
            this.resetBannerState();
        } catch (error) {
            console.error('AdMob Remove Banner Error:', error);
        }
    },

    async prepareInterstitial(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        const initialized = await this.ensureInitialized('Interstitial prepare');
        if (!initialized) {
            this.invalidateInterstitial();
            return false;
        }

        if (this.lastInterstitialAdId && this.lastInterstitialAdId !== adId) {
            this.invalidateInterstitial();
        }
        if (this.hasFreshInterstitial(adId)) return true;
        if (this.interstitialReady && !this.hasFreshInterstitial(adId)) {
            console.log('[AdMob] Cached interstitial went stale, refreshing it before show');
            this.interstitialReady = false;
            this.interstitialPreparedAt = 0;
        }
        if (this.interstitialPromise) return this.interstitialPromise;

        this.interstitialPreparing = true;
        this.lastInterstitialAdId = adId;
        this.interstitialPromise = (async (): Promise<boolean> => {
            let prepared = false;
            try {
                prepared = await this.runPrepareWithTimeout({
                    label: 'Interstitial',
                    loadedEvent: InterstitialAdPluginEvents.Loaded,
                    failedEvent: InterstitialAdPluginEvents.FailedToLoad,
                    prepareAction: () => AdMob.prepareInterstitial({ adId, isTesting: false }),
                });
                this.interstitialReady = prepared;
                this.interstitialPreparedAt = prepared ? Date.now() : 0;
                return prepared;
            } catch (error) {
                console.error('AdMob Prepare Interstitial Exception:', error);
                this.invalidateInterstitial();
                return false;
            } finally {
                if (!prepared) {
                    this.interstitialReady = false;
                    this.interstitialPreparedAt = 0;
                }
                this.interstitialPreparing = false;
                this.interstitialPromise = null;
            }
        })();

        return this.interstitialPromise;
    },

    async showInterstitial(adId: string, onShow?: () => void): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;
        if (this.isInterstitialShowing) return false;
        this.isInterstitialShowing = true;

        const initialized = await this.ensureInitialized('Interstitial show');
        if (!initialized) {
            this.isInterstitialShowing = false;
            this.invalidateInterstitial();
            return false;
        }
        console.log(`[AdMob] Attempting to show interstitial: ${adId}`);

        try {
            return await new Promise<boolean>((resolve) => {
                let resolved = false;
                let showed = false;
                let preparedJustInTime = false;
                let showedListener: any = null;
                let dismissListener: any = null;
                let failedListener: any = null;
                let failedShowListener: any = null;

                const timeout = setTimeout(() => {
                    console.warn('AdMob Interstitial Timeout: Proceeding automatically.');
                    cleanupAndResolve(false);
                }, 30000);

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    this.cleanupListeners([dismissListener, failedListener, failedShowListener, showedListener]);
                    clearTimeout(timeout);
                    this.interstitialReady = false;
                    this.interstitialPreparedAt = 0;
                    this.isInterstitialShowing = false;
                    resolve(success);
                };

                void (async () => {
                    try {
                        showedListener = await AdMob.addListener(InterstitialAdPluginEvents.Showed, () => {
                            showed = true;
                            console.log('[AdMob] Interstitial showing, clearing timeout');
                            clearTimeout(timeout);
                            if (onShow) onShow();
                        });

                        dismissListener = await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
                            cleanupAndResolve(showed);
                        });

                        failedListener = await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => {
                            cleanupAndResolve(false);
                        });

                        failedShowListener = await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, (info) => {
                            console.error('[AdMob] Interstitial Failed to Show:', info);
                            this.interstitialReady = false;
                            this.interstitialPreparedAt = 0;
                            cleanupAndResolve(false);
                        });

                        if (!this.hasFreshInterstitial(adId)) {
                            console.warn('[AdMob] Interstitial not ready, attempting JIT prepare...');
                            preparedJustInTime = true;
                            const prepared = await this.prepareInterstitial(adId);
                            if (!prepared || !this.hasFreshInterstitial(adId)) {
                                console.error('[AdMob] JIT Prepare failed: Ad not ready after preparation.');
                                cleanupAndResolve(false);
                                return;
                            }
                        }

                        if (preparedJustInTime) {
                            await this.sleep(this.POST_PREPARE_SHOW_DELAY_MS);
                        } else {
                            await this.sleep(250);
                        }

                        try {
                            await AdMob.showInterstitial();
                        } catch (error) {
                            console.error('AdMob showInterstitial threw:', error);
                            this.interstitialReady = false;
                            this.interstitialPreparedAt = 0;
                            cleanupAndResolve(false);
                        }
                    } catch (error) {
                        console.error('[AdMob] Interstitial executor error:', error);
                        this.interstitialReady = false;
                        this.interstitialPreparedAt = 0;
                        cleanupAndResolve(false);
                    }
                })();
            });
        } catch (error) {
            console.error('AdMob Interstitial Error', error);
            this.isInterstitialShowing = false;
            this.invalidateInterstitial();
            return false;
        }
    },

    async prepareRewardInterstitial(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        const initialized = await this.ensureInitialized('Reward interstitial prepare');
        if (!initialized) {
            this.invalidateRewardInterstitial();
            return false;
        }

        if (this.lastRewardInterstitialAdId && this.lastRewardInterstitialAdId !== adId) {
            this.invalidateRewardInterstitial();
        }
        if (this.hasFreshRewardInterstitial(adId)) return true;
        if (this.rewardInterstitialReady && !this.hasFreshRewardInterstitial(adId)) {
            console.log('[AdMob] Cached reward interstitial went stale, refreshing it before show');
            this.invalidateRewardInterstitial();
        }
        if (this.rewardInterstitialPromise) return this.rewardInterstitialPromise;

        this.rewardInterstitialPreparing = true;
        this.lastRewardInterstitialAdId = adId;
        this.rewardInterstitialPromise = (async (): Promise<boolean> => {
            let prepared = false;
            try {
                prepared = await this.runPrepareWithTimeout({
                    label: 'Reward Interstitial',
                    loadedEvent: RewardInterstitialAdPluginEvents.Loaded,
                    failedEvent: RewardInterstitialAdPluginEvents.FailedToLoad,
                    prepareAction: () => AdMob.prepareRewardInterstitialAd({ adId, isTesting: false }),
                });
                this.rewardInterstitialReady = prepared;
                this.rewardInterstitialPreparedAt = prepared ? Date.now() : 0;
                if (prepared) {
                    console.log('AdMob Reward Interstitial Prepared');
                }
                return prepared;
            } catch (error) {
                console.error('AdMob Prepare Reward Interstitial Error:', error);
                this.invalidateRewardInterstitial();
                return false;
            } finally {
                if (!prepared) {
                    this.rewardInterstitialReady = false;
                    this.rewardInterstitialPreparedAt = 0;
                }
                this.rewardInterstitialPreparing = false;
                this.rewardInterstitialPromise = null;
            }
        })();

        return this.rewardInterstitialPromise;
    },

    async showRewardInterstitial(adId: string, onShow?: () => void): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;
        if (this.isRewardInterstitialShowing) return false;
        this.isRewardInterstitialShowing = true;

        const initialized = await this.ensureInitialized('Reward interstitial show');
        if (!initialized) {
            this.isRewardInterstitialShowing = false;
            this.invalidateRewardInterstitial();
            return false;
        }
        console.log(`[AdMob] Attempting to show reward interstitial: ${adId}`);

        try {
            return await new Promise<boolean>((resolve) => {
                let resolved = false;
                let earned = false;
                let showedListener: any = null;
                let rewardListener: any = null;
                let dismissListener: any = null;
                let failedListener: any = null;
                let failedShowListener: any = null;

                const timeout = setTimeout(() => {
                    console.warn('[AdMob] Reward Interstitial show timeout');
                    cleanupAndResolve(false);
                }, 30000);

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    this.cleanupListeners([showedListener, rewardListener, dismissListener, failedListener, failedShowListener]);
                    clearTimeout(timeout);
                    this.rewardInterstitialReady = false;
                    this.rewardInterstitialPreparedAt = 0;
                    this.isRewardInterstitialShowing = false;
                    console.log(`[AdMob] Reward Interstitial finished. Success: ${success}`);
                    resolve(success);
                };

                void (async () => {
                    try {
                        showedListener = await AdMob.addListener(RewardInterstitialAdPluginEvents.Showed, () => {
                            console.log('[AdMob] Reward Interstitial showing, clearing timeout');
                            clearTimeout(timeout);
                            if (onShow) onShow();
                        });

                        rewardListener = await AdMob.addListener(RewardInterstitialAdPluginEvents.Rewarded, (info: AdMobRewardInterstitialItem) => {
                            console.log('[AdMob] User earned reward (Interstitial):', info);
                            earned = true;
                        });

                        dismissListener = await AdMob.addListener(RewardInterstitialAdPluginEvents.Dismissed, () => {
                            console.log('[AdMob] Reward Interstitial dismissed');
                            cleanupAndResolve(earned);
                        });

                        failedListener = await AdMob.addListener(RewardInterstitialAdPluginEvents.FailedToLoad, (error) => {
                            console.error('[AdMob] Reward Interstitial failed to load:', error);
                            cleanupAndResolve(false);
                        });

                        failedShowListener = await AdMob.addListener(RewardInterstitialAdPluginEvents.FailedToShow, (error) => {
                            console.error('[AdMob] Reward Interstitial failed to show:', error);
                            this.invalidateRewardInterstitial();
                            cleanupAndResolve(false);
                        });

                        if (!this.hasFreshRewardInterstitial(adId)) {
                            console.warn('[AdMob] Ad not ready, attempting JIT prepare...');
                            const prepared = await this.prepareRewardInterstitial(adId);
                            if (!prepared || !this.hasFreshRewardInterstitial(adId)) {
                                console.error('[AdMob] JIT Prepare failed: Ad not ready.');
                                cleanupAndResolve(false);
                                return;
                            }
                            await new Promise(resolveDelay => setTimeout(resolveDelay, 800));
                        }

                        try {
                            await AdMob.showRewardInterstitialAd();
                        } catch (error) {
                            console.error('AdMob showRewardInterstitialAd threw:', error);
                            this.invalidateRewardInterstitial();
                            cleanupAndResolve(false);
                        }
                    } catch (error) {
                        console.error('[AdMob] Reward Interstitial executor error:', error);
                        this.invalidateRewardInterstitial();
                        cleanupAndResolve(false);
                    }
                })();
            });
        } catch (error) {
            console.error('[AdMob] Critical Reward Interstitial Error', error);
            this.isRewardInterstitialShowing = false;
            this.invalidateRewardInterstitial();
            return false;
        }
    },

    async prepareRewardVideo(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        const initialized = await this.ensureInitialized('Reward video prepare');
        if (!initialized) {
            this.invalidateRewardVideo();
            return false;
        }

        if (this.lastRewardVideoAdId && this.lastRewardVideoAdId !== adId) {
            this.invalidateRewardVideo();
        }
        if (this.hasFreshRewardVideo(adId)) return true;
        if (this.rewardVideoReady && !this.hasFreshRewardVideo(adId)) {
            console.log('[AdMob] Cached reward video went stale, refreshing it before show');
            this.invalidateRewardVideo();
        }
        if (this.rewardVideoPromise) return this.rewardVideoPromise;

        this.rewardVideoPreparing = true;
        this.lastRewardVideoAdId = adId;
        this.rewardVideoPromise = (async (): Promise<boolean> => {
            let prepared = false;
            try {
                prepared = await this.runPrepareWithTimeout({
                    label: 'Reward Video',
                    loadedEvent: RewardAdPluginEvents.Loaded,
                    failedEvent: RewardAdPluginEvents.FailedToLoad,
                    prepareAction: () => AdMob.prepareRewardVideoAd({ adId, isTesting: false }),
                });
                this.rewardVideoReady = prepared;
                this.rewardVideoPreparedAt = prepared ? Date.now() : 0;
                if (prepared) {
                    console.log('AdMob Reward Video Prepared');
                }
                return prepared;
            } catch (error) {
                console.error('AdMob Prepare Reward Error:', error);
                this.invalidateRewardVideo();
                return false;
            } finally {
                if (!prepared) {
                    this.rewardVideoReady = false;
                    this.rewardVideoPreparedAt = 0;
                }
                this.rewardVideoPreparing = false;
                this.rewardVideoPromise = null;
            }
        })();

        return this.rewardVideoPromise;
    },

    async showRewardVideo(adId: string, onShow?: () => void): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;
        if (this.isRewardVideoShowing) return false;
        this.isRewardVideoShowing = true;

        const initialized = await this.ensureInitialized('Reward video show');
        if (!initialized) {
            this.isRewardVideoShowing = false;
            this.invalidateRewardVideo();
            return false;
        }
        console.log(`[AdMob] Attempting to show reward video: ${adId}`);

        try {
            return await new Promise<boolean>((resolve) => {
                let resolved = false;
                let earned = false;
                let showedListener: any = null;
                let rewardListener: any = null;
                let dismissListener: any = null;
                let failedListener: any = null;
                let failedShowListener: any = null;

                const timeout = setTimeout(() => {
                    console.warn('[AdMob] Reward video show timeout');
                    cleanupAndResolve(false);
                }, 30000);

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    this.cleanupListeners([showedListener, rewardListener, dismissListener, failedListener, failedShowListener]);
                    clearTimeout(timeout);
                    this.rewardVideoReady = false;
                    this.rewardVideoPreparedAt = 0;
                    this.isRewardVideoShowing = false;
                    console.log(`[AdMob] Reward video finished. Success: ${success}`);
                    resolve(success);
                };

                void (async () => {
                    try {
                        showedListener = await AdMob.addListener(RewardAdPluginEvents.Showed, () => {
                            console.log('[AdMob] Reward video showing, clearing timeout');
                            clearTimeout(timeout);
                            if (onShow) onShow();
                        });

                        rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (info) => {
                            console.log('[AdMob] User earned reward:', info);
                            earned = true;
                        });

                        dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
                            console.log('[AdMob] Reward video dismissed');
                            cleanupAndResolve(earned);
                        });

                        failedListener = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (error) => {
                            console.error('[AdMob] Reward video failed to load:', error);
                            cleanupAndResolve(false);
                        });

                        failedShowListener = await AdMob.addListener(RewardAdPluginEvents.FailedToShow, (error) => {
                            console.error('[AdMob] Reward video failed to show:', error);
                            this.invalidateRewardVideo();
                            cleanupAndResolve(false);
                        });

                        if (!this.hasFreshRewardVideo(adId)) {
                            console.warn('[AdMob] Ad not ready, attempting JIT prepare...');
                            const prepared = await this.prepareRewardVideo(adId);
                            if (!prepared || !this.hasFreshRewardVideo(adId)) {
                                console.error('[AdMob] JIT Prepare failed: Ad not ready.');
                                cleanupAndResolve(false);
                                return;
                            }
                            await new Promise(resolveDelay => setTimeout(resolveDelay, 800));
                        }

                        try {
                            await AdMob.showRewardVideoAd();
                        } catch (error) {
                            console.error('AdMob showRewardVideoAd threw:', error);
                            this.invalidateRewardVideo();
                            cleanupAndResolve(false);
                        }
                    } catch (error) {
                        console.error('[AdMob] Reward video executor error:', error);
                        this.invalidateRewardVideo();
                        cleanupAndResolve(false);
                    }
                })();
            });
        } catch (error) {
            console.error('[AdMob] Critical Reward Error', error);
            this.isRewardVideoShowing = false;
            this.invalidateRewardVideo();
            return false;
        }
    }
};
