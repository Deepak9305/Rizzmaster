import {
    AdMob,
    BannerAdOptions,
    BannerAdSize,
    BannerAdPosition,
    BannerAdPluginEvents,
    AdMobBannerSize,
    RewardAdPluginEvents,
    InterstitialAdPluginEvents,
    RewardInterstitialAdPluginEvents,
    AdOptions,
    AdMobRewardInterstitialItem,
    AdmobConsentStatus,
    AdmobConsentDebugGeography
} from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

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

    // Set this to true to force the GDPR popup to show for everyone during testing/development.
    // Set to false before releasing to the Play Store.
    DEBUG_FORCE_GDPR: false,

    async initialize() {
        if (!Capacitor.isNativePlatform()) return;
        if (this.initialized) return;

        try {
            // --- GDPR / UMP CONSENT FLOW ---
            if (this.DEBUG_FORCE_GDPR) {
                // Completely reset the user's consent state so the form shows up every time we test
                try { await AdMob.resetConsentInfo(); } catch (e) { console.warn("Reset GDPR info failed", e); }
            }

            // 1. Request consent info from Google
            const consentInfo = await AdMob.requestConsentInfo({
                debugGeography: this.DEBUG_FORCE_GDPR ? AdmobConsentDebugGeography.EEA : AdmobConsentDebugGeography.DISABLED,
            });

            // 2. If a form is available and we need to show it, do it now
            if (consentInfo.isConsentFormAvailable && consentInfo.status === AdmobConsentStatus.REQUIRED) {
                console.log('AdMob: GDPR Consent Required. Showing form...');
                await AdMob.showConsentForm();
            }
            // -------------------------------

            await AdMob.initialize({});
            this.initialized = true;
            console.log('AdMob Community Initialized');
        } catch (error) {
            console.error('AdMob Community initialization failed', error);
            // Fallback: Try to initialize anyway so ads might still show
            await AdMob.initialize({});
            this.initialized = true;
        }
    },

    async showBanner(adId: string, position: 'TOP' | 'BOTTOM' = 'BOTTOM') {
        if (!Capacitor.isNativePlatform()) return;

        try {
            await this.initialize();

            const options: BannerAdOptions = {
                adId: adId,
                adSize: BannerAdSize.ADAPTIVE_BANNER,
                position: position === 'TOP' ? BannerAdPosition.TOP_CENTER : BannerAdPosition.BOTTOM_CENTER,
                margin: position === 'TOP' ? 0 : 0,
                isTesting: false
            };

            await AdMob.showBanner(options);
            console.log(`AdMob Banner shown at ${position}`);
        } catch (e) {
            console.error('AdMob Show Banner Error:', e);
        }
    },

    async hideBanner() {
        if (!Capacitor.isNativePlatform()) return;
        try {
            await AdMob.hideBanner();
        } catch (e) {
            console.error('AdMob Hide Banner Error:', e);
        }
    },

    async prepareInterstitial(adId: string) {
        if (!Capacitor.isNativePlatform()) return;
        if (AdMobService.interstitialReady || AdMobService.interstitialPreparing) return;

        await this.initialize();
        AdMobService.interstitialPreparing = true;
        try {
            await AdMob.prepareInterstitial({ adId });
            AdMobService.interstitialReady = true;
            console.log('AdMob Interstitial Prepared');
        } catch (e) {
            console.error('AdMob Prepare Interstitial Error:', e);
        } finally {
            AdMobService.interstitialPreparing = false;
        }
    },

    async showInterstitial(adId: string, onShow?: () => void): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;
        if (AdMobService.isInterstitialShowing) return false;

        console.log(`[AdMob] Attempting to show interstitial: ${adId}`);

        if (!AdMobService.interstitialReady) {
            console.warn('[AdMob] Interstitial not ready, attempting JIT prepare...');
            await AdMobService.prepareInterstitial(adId);
        }

        try {
            return new Promise(async (resolve) => {
                let resolved = false;
                let showed = false;

                const showedListener = await AdMob.addListener(InterstitialAdPluginEvents.Showed, () => {
                    showed = true;
                    console.log('[AdMob] Interstitial showing, clearing timeout');
                    clearTimeout(timeout);
                    if (onShow) onShow();
                });

                const dismissListener = await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
                    cleanupAndResolve(showed);
                });

                const failedListener = await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => {
                    cleanupAndResolve(false);
                });

                const failedShowListener = await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => {
                    cleanupAndResolve(false);
                });

                // Timeout fail-safe (15 seconds) - Increased for better reliability in high-latency environments
                const timeout = setTimeout(() => {
                    console.warn('AdMob Interstitial Timeout: Proceeding automatically.');
                    cleanupAndResolve(false);
                }, 15000);

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    // Robust cleanup
                    [dismissListener, failedListener, failedShowListener, showedListener].forEach(l => {
                        try { l.remove(); } catch (e) { }
                    });
                    clearTimeout(timeout);
                    AdMobService.interstitialReady = false;
                    AdMobService.isInterstitialShowing = false;
                    resolve(success);
                };

                try {
                    AdMobService.isInterstitialShowing = true;
                    await AdMob.showInterstitial();
                } catch (e) {
                    console.error('AdMob showInterstitial threw:', e);
                    cleanupAndResolve(false);
                }
            });
        } catch (error) {
            console.error('AdMob Interstitial Error', error);
            return false;
        }
    },

    // --- REWARDED INTERSTITIAL (New) ---

    async prepareRewardInterstitial(adId: string) {
        if (!Capacitor.isNativePlatform()) return;
        if (AdMobService.rewardInterstitialReady || AdMobService.rewardInterstitialPreparing) return;

        await this.initialize();
        AdMobService.rewardInterstitialPreparing = true;
        try {
            await AdMob.prepareRewardInterstitialAd({ adId });
            AdMobService.rewardInterstitialReady = true;
            console.log('AdMob Reward Interstitial Prepared');
        } catch (e) {
            console.error('AdMob Prepare Reward Interstitial Error:', e);
        } finally {
            AdMobService.rewardInterstitialPreparing = false;
        }
    },

    async showRewardInterstitial(adId: string, onShow?: () => void): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;
        if (AdMobService.isRewardInterstitialShowing) return false;

        await this.initialize();
        console.log(`[AdMob] Attempting to show reward interstitial: ${adId}`);

        if (!AdMobService.rewardInterstitialReady) {
            console.warn('[AdMob] Ad not ready, attempting JIT prepare...');
            await AdMobService.prepareRewardInterstitial(adId);
        }

        try {

            return new Promise(async (resolve) => {
                let resolved = false;
                let earned = false;

                const showedListener = await AdMob.addListener(RewardInterstitialAdPluginEvents.Showed, () => {
                    console.log('[AdMob] Reward Interstitial showing, clearing timeout');
                    clearTimeout(timeout);
                    if (onShow) onShow();
                });

                const rewardListener = await AdMob.addListener(RewardInterstitialAdPluginEvents.Rewarded, (info: AdMobRewardInterstitialItem) => {
                    console.log('[AdMob] User earned reward (Interstitial):', info);
                    earned = true;
                });

                const dismissListener = await AdMob.addListener(RewardInterstitialAdPluginEvents.Dismissed, () => {
                    console.log('[AdMob] Reward Interstitial dismissed');
                    cleanupAndResolve(earned);
                });

                const failedListener = await AdMob.addListener(RewardInterstitialAdPluginEvents.FailedToLoad, (err) => {
                    console.error('[AdMob] Reward Interstitial failed to load:', err);
                    cleanupAndResolve(false);
                });

                const failedShowListener = await AdMob.addListener(RewardInterstitialAdPluginEvents.FailedToShow, (err) => {
                    console.error('[AdMob] Reward Interstitial failed to show:', err);
                    cleanupAndResolve(false);
                });

                // Fail-safe timeout (15 seconds)
                const timeout = setTimeout(() => {
                    console.warn('[AdMob] Reward Interstitial show timeout');
                    cleanupAndResolve(false);
                }, 15000);

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    [showedListener, rewardListener, dismissListener, failedListener, failedShowListener].forEach(l => {
                        try { l.remove(); } catch (e) { }
                    });
                    clearTimeout(timeout);
                    AdMobService.rewardInterstitialReady = false;
                    AdMobService.isRewardInterstitialShowing = false;
                    console.log(`[AdMob] Reward Interstitial finished. Success: ${success}`);
                    resolve(success);
                };

                try {
                    AdMobService.isRewardInterstitialShowing = true;
                    await AdMob.showRewardInterstitialAd();
                } catch (err) {
                    console.error('AdMob showRewardInterstitialAd threw:', err);
                    cleanupAndResolve(false);
                }
            });
        } catch (error) {
            console.error('[AdMob] Critical Reward Interstitial Error', error);
            return false;
        }
    },

    // --- REWARDED VIDEO ---

    async prepareRewardVideo(adId: string) {
        if (!Capacitor.isNativePlatform()) return;
        if (AdMobService.rewardVideoReady || AdMobService.rewardVideoPreparing) return;

        await this.initialize();
        AdMobService.rewardVideoPreparing = true;
        try {
            await AdMob.prepareRewardVideoAd({ adId });
            AdMobService.rewardVideoReady = true;
            console.log('AdMob Reward Video Prepared');
        } catch (e) {
            console.error('AdMob Prepare Reward Error:', e);
        } finally {
            AdMobService.rewardVideoPreparing = false;
        }
    },

    async showRewardVideo(adId: string, onShow?: () => void): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;
        if (AdMobService.isRewardVideoShowing) return false;

        await this.initialize();
        console.log(`[AdMob] Attempting to show reward video: ${adId}`);

        if (!AdMobService.rewardVideoReady) {
            console.warn('[AdMob] Ad not ready, attempting JIT prepare...');
            await AdMobService.prepareRewardVideo(adId);
        }

        try {

            return new Promise(async (resolve) => {
                let resolved = false;
                let earned = false;

                const showedListener = await AdMob.addListener(RewardAdPluginEvents.Showed, () => {
                    console.log('[AdMob] Reward video showing, clearing timeout');
                    clearTimeout(timeout);
                    if (onShow) onShow();
                });

                const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (info) => {
                    console.log('[AdMob] User earned reward:', info);
                    earned = true;
                });

                const dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
                    console.log('[AdMob] Reward video dismissed');
                    cleanupAndResolve(earned);
                });

                const failedListener = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err) => {
                    console.error('[AdMob] Reward video failed to load:', err);
                    cleanupAndResolve(false);
                });

                const failedShowListener = await AdMob.addListener(RewardAdPluginEvents.FailedToShow, (err) => {
                    console.error('[AdMob] Reward video failed to show:', err);
                    cleanupAndResolve(false);
                });

                // Fail-safe timeout (15 seconds)
                const timeout = setTimeout(() => {
                    console.warn('[AdMob] Reward video show timeout');
                    cleanupAndResolve(false);
                }, 15000);

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    [showedListener, rewardListener, dismissListener, failedListener, failedShowListener].forEach(l => {
                        try { l.remove(); } catch (e) { }
                    });
                    clearTimeout(timeout);
                    AdMobService.rewardVideoReady = false;
                    AdMobService.isRewardVideoShowing = false;
                    console.log(`[AdMob] Reward video finished. Success: ${success}`);
                    resolve(success);
                };

                try {
                    AdMobService.isRewardVideoShowing = true;
                    await AdMob.showRewardVideoAd();
                } catch (err) {
                    console.error('AdMob showRewardVideoAd threw:', err);
                    cleanupAndResolve(false);
                }
            });
        } catch (error) {
            console.error('[AdMob] Critical Reward Error', error);
            return false;
        }
    }
};
