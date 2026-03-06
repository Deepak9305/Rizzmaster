import {
    AdMob,
    BannerAd,
    InterstitialAd,
    RewardedAd
} from '@capgo/capacitor-admob';
import { Capacitor } from '@capacitor/core';

export const AdMobService = {
    initialized: false,
    banner: null as any,

    async initialize() {
        if (!Capacitor.isNativePlatform()) return;
        if (this.initialized) return;

        try {
            await AdMob.start();
            this.initialized = true;
            console.log('AdMob Initialized');
        } catch (error) {
            console.error('AdMob initialization failed', error);
        }
    },

    async showBanner(adId: string) {
        if (!Capacitor.isNativePlatform()) return;

        try {
            await this.initialize();

            if (this.banner) {
                try {
                    await this.banner.hide();
                } catch (e) { }
            }

            this.banner = new BannerAd({
                adUnitId: adId,
                position: 'bottom'
            });

            await this.banner.show();
            console.log('AdMob Banner shown');
        } catch (e) {
            console.error('AdMob Show Banner Error:', e);
        }
    },

    async hideBanner() {
        if (!Capacitor.isNativePlatform()) return;
        try {
            if (this.banner) {
                await this.banner.hide();
            }
        } catch (e) {
            console.error('AdMob Hide Banner Error:', e);
        }
    },

    async showInterstitial(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        await this.initialize();

        try {
            const ad = new InterstitialAd({
                adUnitId: adId
            });
            await ad.load();
            await ad.show();
            return true;
        } catch (error) {
            console.error('AdMob Interstitial Error', error);
            return false;
        }
    },

    async showAppOpenAd(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        await this.initialize();

        try {
            // Using direct adCreate for AppOpenAd cls
            const id = Math.floor(Math.random() * 10000);
            await AdMob.adCreate({
                id,
                adUnitId: adId,
                cls: 'AppOpenAd'
            } as any);

            await AdMob.adLoad({ id });
            await AdMob.adShow({ id });
            return true;
        } catch (error) {
            console.error('AdMob App Open Error', error);
            return false;
        }
    },

    async showRewardVideo(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        await this.initialize();

        return new Promise(async (resolve) => {
            try {
                const ad = new RewardedAd({
                    adUnitId: adId
                });

                let earned = false;

                const rewardListener = AdMob.addListener('admob.rewarded.reward', () => {
                    earned = true;
                });

                const dismissListener = AdMob.addListener('admob.rewarded.dismiss', () => {
                    rewardListener.remove();
                    dismissListener.remove();
                    resolve(earned);
                });

                await ad.load();
                await ad.show();

            } catch (error) {
                console.error('AdMob Reward Error', error);
                resolve(false);
            }
        });
    }
};
