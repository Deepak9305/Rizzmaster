import {
    AdMob,
    BannerAdOptions,
    BannerAdSize,
    BannerAdPosition,
    BannerAdPluginEvents,
    AdMobBannerSize,
    RewardAdPluginEvents,
    InterstitialAdPluginEvents
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

    async showBanner(adId: string) {
        if (!Capacitor.isNativePlatform()) return;

        try {
            await this.initialize();

            const options: BannerAdOptions = {
                adId: adId,
                adSize: BannerAdSize.ADAPTIVE_BANNER,
                position: BannerAdPosition.BOTTOM_CENTER,
                margin: 50,
                isTesting: false
            };

            await AdMob.showBanner(options);
            console.log('AdMob Banner shown');
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

    async showInterstitial(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        await this.initialize();

        try {
            await AdMob.prepareInterstitial({ adId });

            return new Promise(async (resolve) => {
                let resolved = false;
                let showed = false;

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    dismissListener.remove();
                    failedListener.remove();
                    showedListener.remove();
                    clearTimeout(timeout);
                    resolve(success);
                };

                const showedListener = await AdMob.addListener(InterstitialAdPluginEvents.Showed, () => {
                    showed = true;
                });

                const dismissListener = await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
                    cleanupAndResolve(showed);
                });

                const failedListener = await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, () => {
                    cleanupAndResolve(false);
                });

                // Timeout fail-safe (2 seconds)
                const timeout = setTimeout(() => {
                    console.warn('AdMob Interstitial Timeout: Proceeding automatically.');
                    cleanupAndResolve(false);
                }, 2000);

                await AdMob.showInterstitial();
            });
        } catch (error) {
            console.error('AdMob Interstitial Error', error);
            return false;
        }
    },

    async showRewardVideo(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        await this.initialize();

        try {
            await AdMob.prepareRewardVideoAd({ adId });

            return new Promise(async (resolve) => {
                let resolved = false;
                let earned = false;

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    rewardListener.remove();
                    dismissListener.remove();
                    failedListener.remove();
                    clearTimeout(timeout);
                    resolve(success);
                };

                // Listen for reward
                const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
                    earned = true;
                });

                // Listen for dismiss
                const dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
                    cleanupAndResolve(earned);
                });

                // Listen for failure
                const failedListener = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, () => {
                    cleanupAndResolve(false);
                });

                // Fail-safe timeout (5 seconds)
                const timeout = setTimeout(() => {
                    console.warn('AdMob Reward Timeout');
                    cleanupAndResolve(false);
                }, 5000);

                await AdMob.showRewardVideoAd();
            });
        } catch (error) {
            console.error('AdMob Reward Error', error);
            return false;
        }
    }
};
