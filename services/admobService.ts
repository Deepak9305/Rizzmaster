import {
    AdMobPlus,
    BannerAd,
    InterstitialAd,
    RewardedAd
} from '@admob-plus/capacitor';
import { Capacitor } from '@capacitor/core';

let bannerInstance: BannerAd | null = null;

export const AdMobService = {
    initialized: false,

    async initialize() {
        if (!Capacitor.isNativePlatform()) return;
        if (this.initialized) return;

        try {
            await AdMobPlus.start();
            this.initialized = true;
            console.log('AdMob Plus Initialized');
        } catch (error) {
            console.error('AdMob Plus initialization failed', error);
        }
    },

    async showBanner(adId: string) {
        if (!Capacitor.isNativePlatform()) return;

        try {
            await this.initialize();
            // Hide old banner if any
            if (bannerInstance) {
                try { await bannerInstance.hide(); } catch (_) { }
                bannerInstance = null;
            }
            bannerInstance = new BannerAd({ adUnitId: adId, position: 'bottom' });
            await bannerInstance.load();
            await bannerInstance.show();
            console.log('AdMob Banner shown');
        } catch (e) {
            console.error('AdMob Show Banner Error:', e);
        }
    },

    async hideBanner() {
        if (!Capacitor.isNativePlatform()) return;
        try {
            if (bannerInstance) {
                await bannerInstance.hide();
            }
        } catch (e) {
            console.error('AdMob Hide Banner Error:', e);
        }
    },

    async showInterstitial(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;

        await this.initialize();

        try {
            const ad = new InterstitialAd({ adUnitId: adId });
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
            // AppOpenAd via low-level API (cls-based)
            const id = Math.floor(Math.random() * 100000);
            await AdMobPlus.adCreate({ id, adUnitId: adId, cls: 'AppOpenAd' } as any);
            await AdMobPlus.adLoad({ id });
            await AdMobPlus.adShow({ id });
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
                const ad = new RewardedAd({ adUnitId: adId });

                let earned = false;

                // Listen via plugin-level listener (low-level event bridge)
                const rewardHandle = await AdMobPlus.addListener('admob.rewarded.reward', () => {
                    earned = true;
                });
                const dismissHandle = await AdMobPlus.addListener('admob.rewarded.dismiss', () => {
                    rewardHandle.remove();
                    dismissHandle.remove();
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
