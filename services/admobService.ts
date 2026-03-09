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
    AdMobRewardInterstitialItem
} from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

export const AdMobService = {
    initialized: false,

    async initialize() {
        if (!Capacitor.isNativePlatform()) return;
        if (this.initialized) return;

        try {
            await AdMob.initialize({});
            this.initialized = true;
            console.log('AdMob Community Initialized');
        } catch (error) {
            console.error('AdMob Community initialization failed', error);
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
                margin: position === 'TOP' ? 0 : 50,
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
        await this.initialize();
        try {
            await AdMob.prepareInterstitial({ adId });
            console.log('AdMob Interstitial Prepared');
        } catch (e) {
            console.error('AdMob Prepare Interstitial Error:', e);
        }
    },

    async showInterstitial(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        await this.initialize();

        try {
            return new Promise(async (resolve) => {
                let resolved = false;
                let showed = false;

                const showedListener = await AdMob.addListener(InterstitialAdPluginEvents.Showed, () => {
                    showed = true;
                    console.log('[AdMob] Interstitial showing, clearing timeout');
                    clearTimeout(timeout);
                });

                const dismissListener = await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
                    cleanupAndResolve(showed);
                });

                const failedListener = await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => {
                    cleanupAndResolve(false);
                    this.prepareInterstitial(adId);
                });

                const failedShowListener = await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => {
                    cleanupAndResolve(false);
                    this.prepareInterstitial(adId);
                });

                // Timeout fail-safe (4 seconds) - Optimized for better UX
                const timeout = setTimeout(() => {
                    console.warn('AdMob Interstitial Timeout: Proceeding automatically.');
                    cleanupAndResolve(false);
                }, 4000);

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    dismissListener.remove();
                    failedListener.remove();
                    failedShowListener.remove();
                    showedListener.remove();
                    clearTimeout(timeout);
                    resolve(success);
                };

                try {
                    await AdMob.showInterstitial();
                    // Immediately start preparing the NEXT one in the background
                    this.prepareInterstitial(adId);
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
        await this.initialize();
        try {
            await AdMob.prepareRewardInterstitialAd({ adId });
            console.log('AdMob Reward Interstitial Prepared');
        } catch (e) {
            console.error('AdMob Prepare Reward Interstitial Error:', e);
        }
    },

    async showRewardInterstitial(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        await this.initialize();
        console.log(`[AdMob] Attempting to show reward interstitial: ${adId}`);

        try {
            // Rely on background pre-loading for instant display
            // (Ad id is used for listener cleanup/retry logic only)

            return new Promise(async (resolve) => {
                let resolved = false;
                let earned = false;

                const showedListener = await AdMob.addListener(RewardInterstitialAdPluginEvents.Showed, () => {
                    console.log('[AdMob] Reward Interstitial showing, clearing timeout');
                    clearTimeout(timeout);
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
                    this.prepareRewardInterstitial(adId);
                });

                const failedShowListener = await AdMob.addListener(RewardInterstitialAdPluginEvents.FailedToShow, (err) => {
                    console.error('[AdMob] Reward Interstitial failed to show:', err);
                    cleanupAndResolve(false);
                    this.prepareRewardInterstitial(adId);
                });

                // Fail-safe timeout (4 seconds for transitions)
                const timeout = setTimeout(() => {
                    console.warn('[AdMob] Reward Interstitial show timeout');
                    cleanupAndResolve(false);
                }, 4000);

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    showedListener.remove();
                    rewardListener.remove();
                    dismissListener.remove();
                    failedListener.remove();
                    failedShowListener.remove();
                    clearTimeout(timeout);
                    console.log(`[AdMob] Reward Interstitial finished. Success: ${success}`);
                    resolve(success);
                };

                try {
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
        await this.initialize();
        try {
            await AdMob.prepareRewardVideoAd({ adId });
            console.log('AdMob Reward Video Prepared');
        } catch (e) {
            console.error('AdMob Prepare Reward Error:', e);
        }
    },

    async showRewardVideo(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        await this.initialize();
        console.log(`[AdMob] Attempting to show reward video: ${adId}`);

        try {
            // Rely on background pre-loading for instant display

            return new Promise(async (resolve) => {
                let resolved = false;
                let earned = false;

                const showedListener = await AdMob.addListener(RewardAdPluginEvents.Showed, () => {
                    console.log('[AdMob] Reward video showing, clearing timeout');
                    clearTimeout(timeout);
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
                    this.prepareRewardVideo(adId);
                });

                const failedShowListener = await AdMob.addListener(RewardAdPluginEvents.FailedToShow, (err) => {
                    console.error('[AdMob] Reward video failed to show:', err);
                    cleanupAndResolve(false);
                    this.prepareRewardVideo(adId);
                });

                const timeout = setTimeout(() => {
                    console.warn('[AdMob] Reward video show timeout');
                    cleanupAndResolve(false);
                }, 4000);

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    showedListener.remove();
                    rewardListener.remove();
                    dismissListener.remove();
                    failedListener.remove();
                    failedShowListener.remove();
                    clearTimeout(timeout);
                    console.log(`[AdMob] Reward video finished. Success: ${success}`);
                    resolve(success);
                };

                try {
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
