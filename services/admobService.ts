import {
    AdMob,
    BannerAdOptions,
    BannerAdSize,
    BannerAdPosition,
    BannerAdPluginEvents,
    AdMobBannerSize,
    RewardAdPluginEvents
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
                adSize: BannerAdSize.BANNER,
                position: BannerAdPosition.BOTTOM_CENTER,
                margin: 0,
                isTesting: false
                // isTesting is handled by the overall config, or left false for prod/test IDs
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
            await AdMob.showInterstitial();
            return true;
        } catch (error) {
            console.error('AdMob Interstitial Error', error);
            return false;
        }
    },

    async showRewardVideo(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        await this.initialize();

        return new Promise(async (resolve) => {
            let earned = false;

            try {
                // Listen for reward
                const rewardListener = await AdMob.addListener(RewardAdPluginEvents.Rewarded, () => {
                    earned = true;
                });

                // Listen for dismiss
                const dismissListener = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
                    rewardListener.remove();
                    dismissListener.remove();
                    resolve(earned);
                });

                await AdMob.prepareRewardVideoAd({ adId });
                await AdMob.showRewardVideoAd();

            } catch (error) {
                console.error('AdMob Reward Error', error);
                resolve(false);
            }
        });
    }
};
