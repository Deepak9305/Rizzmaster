
import { AdMob, RewardAdOptions, RewardAdPluginEvents, AdMobRewardItem } from '@capacitor-community/admob';
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
    }
};
