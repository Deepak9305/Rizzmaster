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
            // No need to call prepare here if it's already pre-loaded, 
            // but calling it again won't hurt if we want to be safe.
            // However, the "Community" plugin usually requires an explicit prepare call 
            // before show if it hasn't been done yet.
            // We'll trust the pre-loading logic in App.tsx but keep a safety prepare here 
            // just in case it was missed (though it might cause a slight delay).
            // await AdMob.prepareInterstitial({ adId }); 

            return new Promise(async (resolve) => {
                let resolved = false;
                let showed = false;

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

                const showedListener = await AdMob.addListener(InterstitialAdPluginEvents.Showed, () => {
                    showed = true;
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

                // Timeout fail-safe (5 seconds)
                const timeout = setTimeout(() => {
                    console.warn('AdMob Interstitial Timeout: Proceeding automatically.');
                    cleanupAndResolve(false);
                }, 5000);

                await AdMob.showInterstitial();

                // Immediately start preparing the NEXT one in the background
                this.prepareInterstitial(adId);
            });
        } catch (error) {
            console.error('AdMob Interstitial Error', error);
            return false;
        }
    },

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
            return new Promise(async (resolve) => {
                let resolved = false;
                let earned = false;

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    rewardListener.remove();
                    dismissListener.remove();
                    failedListener.remove();
                    failedShowListener.remove();
                    clearTimeout(timeout);
                    console.log(`[AdMob] Reward video finished. Success: ${success}`);
                    resolve(success);
                };

                // Listen for reward
                const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (info) => {
                    console.log('[AdMob] User earned reward:', info);
                    earned = true;
                });

                // Listen for dismiss
                const dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
                    console.log('[AdMob] Reward video dismissed');
                    cleanupAndResolve(earned);
                });

                // Listen for failure (load)
                const failedListener = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err) => {
                    console.error('[AdMob] Reward video failed to load:', err);
                    cleanupAndResolve(false);
                    this.prepareRewardVideo(adId);
                });

                // Listen for failure (show)
                const failedShowListener = await AdMob.addListener(RewardAdPluginEvents.FailedToShow, (err) => {
                    console.error('[AdMob] Reward video failed to show:', err);
                    cleanupAndResolve(false);
                    this.prepareRewardVideo(adId);
                });

                // Fail-safe timeout (12 seconds for reward ads)
                const timeout = setTimeout(() => {
                    console.warn('[AdMob] Reward video show timeout');
                    cleanupAndResolve(false);
                }, 12000);

                await AdMob.showRewardVideoAd();

                // Immediately start preparing the NEXT one in the background
                this.prepareRewardVideo(adId);
            });
        } catch (error) {
            console.error('[AdMob] Critical Reward Error', error);
            return false;
        }
    }
};
