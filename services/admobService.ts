
import { AdMob, RewardAdOptions, RewardAdPluginEvents, AdMobRewardItem, BannerAdOptions, BannerAdSize, BannerAdPosition, InterstitialAdPluginEvents } from '@capacitor-community/admob';
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

    async showBanner(adId: string) {
        if (!Capacitor.isNativePlatform()) return;
        
        try {
            await this.initialize();

            // CRITICAL: Attempt to hide and remove any existing banner first
            try {
                await AdMob.hideBanner();
                await AdMob.removeBanner();
            } catch (e) {
                // Ignore removal error (e.g. if no banner exists)
            }

            const options: BannerAdOptions = {
                adId: adId,
                adSize: BannerAdSize.ADAPTIVE_BANNER,
                position: BannerAdPosition.BOTTOM_CENTER,
                margin: 0,
                isTesting: true,
                npa: true // Request non-personalized ads for reliability in testing
            };

            await AdMob.showBanner(options);
            console.log('AdMob Banner Request Sent');
        } catch (e) {
            console.error('AdMob Show Banner Error:', e);
        }
    },

    async hideBanner() {
        if (!Capacitor.isNativePlatform()) return;
        
        try {
            await AdMob.hideBanner();
            await AdMob.removeBanner(); 
        } catch (e) {
            console.error('AdMob Hide Banner Error:', e);
        }
    },

    async showInterstitial(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;
        
        await this.initialize();

        return new Promise(async (resolve) => {
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
                const onDismiss = await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
                    console.log('AdMob Interstitial Dismissed');
                    cleanup();
                    resolve(true);
                });
                listeners.push(onDismiss);
                
                const onFailed = await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (err) => {
                    console.error('AdMob Interstitial Failed to load', err);
                    cleanup();
                    resolve(false);
                });
                listeners.push(onFailed);

                const onShowFailed = await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, (err) => {
                    console.error('AdMob Interstitial Failed to show', err);
                    cleanup();
                    resolve(false);
                });
                listeners.push(onShowFailed);

                const options: any = {
                    adId: adId,
                    isTesting: true
                };

                await AdMob.prepareInterstitial(options);
                await AdMob.showInterstitial();
                
            } catch (error) {
                console.error('AdMob Interstitial Execution Error', error);
                await cleanup();
                resolve(false);
            }
        });
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
