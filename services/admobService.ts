
import { AdMob, RewardAdOptions, RewardAdPluginEvents, AdMobRewardItem, BannerAdOptions, BannerAdSize, BannerAdPosition } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

export const AdMobService = {
    initialized: false,

    async initialize() {
        if (!Capacitor.isNativePlatform()) return;
        if (this.initialized) return;

        try {
            // Request tracking authorization (iOS 14+)
            try {
                await AdMob.requestTrackingAuthorization();
            } catch (e) {
                console.warn("Tracking authorization skipped:", e);
            }

            await AdMob.initialize({
                initializeForTesting: true, // Forces test mode
            });
            this.initialized = true;
            console.log('AdMob Initialized');
        } catch (error) {
            console.error('AdMob initialization failed', error);
        }
    },

    async showRewardVideo(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;
        
        // Ensure initialized
        await this.initialize();

        return new Promise(async (resolve) => {
            let earnedReward = false;
            let listeners: any[] = [];

            const cleanup = async () => {
                for (const listener of listeners) {
                    if (listener && typeof listener.remove === 'function') {
                        await listener.remove();
                    }
                }
                listeners = [];
            };

            try {
                // Set up Listeners
                const onReward = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward: AdMobRewardItem) => {
                    console.log('AdMob Reward Earned', reward);
                    earnedReward = true;
                });
                listeners.push(onReward);

                const onDismiss = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
                    console.log('AdMob Ad Dismissed');
                    cleanup();
                    // Resolve with true only if reward was triggered
                    resolve(earnedReward);
                });
                listeners.push(onDismiss);
                
                const onFailed = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err) => {
                    console.error('AdMob Failed to load', err);
                    cleanup();
                    resolve(false);
                });
                listeners.push(onFailed);

                const onShowFailed = await AdMob.addListener(RewardAdPluginEvents.FailedToShow, (err) => {
                    console.error('AdMob Failed to show', err);
                    cleanup();
                    resolve(false);
                });
                listeners.push(onShowFailed);

                // Prepare and Show
                const options: RewardAdOptions = {
                    adId: adId,
                    isTesting: true
                };

                await AdMob.prepareRewardVideoAd(options);
                await AdMob.showRewardVideoAd();
                
            } catch (error) {
                console.error('AdMob Execution Error', error);
                await cleanup();
                resolve(false);
            }
        });
    },

    async showBanner(adId: string): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        await this.initialize();

        try {
            const options: BannerAdOptions = {
                adId: adId,
                adSize: BannerAdSize.ADAPTIVE_BANNER,
                position: BannerAdPosition.BOTTOM_CENTER, // Fixed: BOTTOM -> BOTTOM_CENTER
                margin: 0,
                isTesting: true
            };
            await AdMob.showBanner(options);
        } catch (e) {
            console.error("AdMob Show Banner Failed", e);
        }
    },

    async hideBanner(): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        try {
            await AdMob.hideBanner();
            // Optionally remove it completely to save resources
            await AdMob.removeBanner(); 
        } catch (e) {
            console.error("AdMob Hide Banner Failed", e);
        }
    },
    
    async resumeBanner(): Promise<void> {
        if (!Capacitor.isNativePlatform()) return;
        try {
            await AdMob.resumeBanner();
        } catch (e) {
            // If resume fails, it might be because it was removed, so we ignore
        }
    }
};
