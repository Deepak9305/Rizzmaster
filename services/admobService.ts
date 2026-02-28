
import { AdMob, RewardAdOptions, RewardAdPluginEvents, AdMobRewardItem, BannerAdOptions, BannerAdSize, BannerAdPosition, InterstitialAdPluginEvents } from '@capacitor-community/admob';
import { Capacitor } from '@capacitor/core';

export const AdMobService = {
    initialized: false,
    initializationPromise: null as Promise<void> | null,
    isAdShowing: false,

    async initialize() {
        if (!Capacitor.isNativePlatform()) return;
        if (this.initialized) return;

        // Return existing promise if initialization is already in progress
        if (this.initializationPromise) {
            return this.initializationPromise;
        }

        this.initializationPromise = (async () => {
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
            } finally {
                this.initializationPromise = null;
            }
        })();

        return this.initializationPromise;
    },

    isBannerManipulating: false,
    isAdManipulating: false,

    async showBanner(adId: string) {
        if (!Capacitor.isNativePlatform()) return;
        if (this.isBannerManipulating) return;
        
        this.isBannerManipulating = true;
        try {
            await this.initialize();

            // Only hide, avoid removeBanner as it can be unstable in some plugin versions
            try {
                await AdMob.hideBanner().catch(() => {});
            } catch (e) {
                // Ignore hide error
            }

            const options: BannerAdOptions = {
                adId: adId,
                adSize: BannerAdSize.ADAPTIVE_BANNER,
                position: BannerAdPosition.BOTTOM_CENTER,
                margin: 0,
                isTesting: true,
                npa: true 
            };

            await AdMob.showBanner(options);
            console.log('AdMob Banner Request Sent');
        } catch (e) {
            console.error('AdMob Show Banner Error:', e);
        } finally {
            // Delay releasing the lock to prevent rapid toggling
            setTimeout(() => {
                this.isBannerManipulating = false;
            }, 1000);
        }
    },

    async hideBanner() {
        if (!Capacitor.isNativePlatform()) return;
        if (this.isBannerManipulating) return;

        this.isBannerManipulating = true;
        try {
            await AdMob.hideBanner().catch(() => {});
        } catch (e) {
            console.error('AdMob Hide Banner Error:', e);
        } finally {
            setTimeout(() => {
                this.isBannerManipulating = false;
            }, 1000);
        }
    },

    async showInterstitial(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;
        if (this.isAdShowing || this.isAdManipulating) {
            console.log("Ad operation in progress, skipping interstitial.");
            return false;
        }
        
        this.isAdManipulating = true;
        try {
            await this.initialize();
            this.isAdShowing = true;

            return await new Promise<boolean>(async (resolve) => {
                let listeners: any[] = [];
                let hasResolved = false;

                const safeResolve = (val: boolean) => {
                    if (!hasResolved) {
                        hasResolved = true;
                        this.isAdShowing = false;
                        this.isAdManipulating = false;
                        resolve(val);
                    }
                };

                const cleanup = async () => {
                    try {
                        for (const listener of listeners) {
                            if (listener && typeof listener.remove === 'function') {
                                await listener.remove().catch(() => {});
                            }
                        }
                    } catch (e) {
                        console.warn("Cleanup failed", e);
                    }
                    listeners = [];
                };

                const timeoutId = setTimeout(() => {
                    console.warn('AdMob Interstitial Timeout');
                    cleanup().then(() => safeResolve(false));
                }, 20000); // Increased timeout to 20s

                try {
                    const onDismiss = await AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => {
                        console.log('AdMob Interstitial Dismissed');
                        clearTimeout(timeoutId);
                        cleanup().then(() => safeResolve(true));
                    });
                    listeners.push(onDismiss);
                    
                    const onFailed = await AdMob.addListener(InterstitialAdPluginEvents.FailedToLoad, (err) => {
                        console.error('AdMob Interstitial Failed to load', err);
                        clearTimeout(timeoutId);
                        cleanup().then(() => safeResolve(false));
                    });
                    listeners.push(onFailed);

                    const onShowFailed = await AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, (err) => {
                        console.error('AdMob Interstitial Failed to show', err);
                        clearTimeout(timeoutId);
                        cleanup().then(() => safeResolve(false));
                    });
                    listeners.push(onShowFailed);

                    await AdMob.prepareInterstitial({ adId, isTesting: true });
                    await AdMob.showInterstitial();
                    
                } catch (error) {
                    console.error('AdMob Interstitial Execution Error', error);
                    clearTimeout(timeoutId);
                    cleanup().then(() => safeResolve(false));
                }
            });
        } catch (e) {
            console.error("Interstitial Outer Error", e);
            this.isAdShowing = false;
            this.isAdManipulating = false;
            return false;
        }
    },

    async showRewardVideo(adId: string): Promise<boolean> {
        if (!Capacitor.isNativePlatform()) return false;
        if (this.isAdShowing || this.isAdManipulating) {
            console.log("Ad operation in progress, skipping reward video.");
            return false;
        }
        
        this.isAdManipulating = true;
        try {
            await this.initialize();
            this.isAdShowing = true;

            return await new Promise<boolean>(async (resolve) => {
                let earnedReward = false;
                let listeners: any[] = [];
                let hasResolved = false;

                const safeResolve = (val: boolean) => {
                    if (!hasResolved) {
                        hasResolved = true;
                        this.isAdShowing = false;
                        this.isAdManipulating = false;
                        resolve(val);
                    }
                };

                const cleanup = async () => {
                    try {
                        for (const listener of listeners) {
                            if (listener && typeof listener.remove === 'function') {
                                await listener.remove().catch(() => {});
                            }
                        }
                    } catch (e) {
                        console.warn("Cleanup failed", e);
                    }
                    listeners = [];
                };

                const timeoutId = setTimeout(() => {
                    console.warn('AdMob Reward Timeout');
                    cleanup().then(() => safeResolve(false));
                }, 25000); // Increased timeout to 25s

                try {
                    const onReward = await AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward: AdMobRewardItem) => {
                        console.log('AdMob Reward Earned', reward);
                        earnedReward = true;
                    });
                    listeners.push(onReward);

                    const onDismiss = await AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
                        console.log('AdMob Ad Dismissed');
                        clearTimeout(timeoutId);
                        cleanup().then(() => safeResolve(earnedReward));
                    });
                    listeners.push(onDismiss);
                    
                    const onFailed = await AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err) => {
                        console.error('AdMob Failed to load', err);
                        clearTimeout(timeoutId);
                        cleanup().then(() => safeResolve(false));
                    });
                    listeners.push(onFailed);

                    const onShowFailed = await AdMob.addListener(RewardAdPluginEvents.FailedToShow, (err) => {
                        console.error('AdMob Failed to show', err);
                        clearTimeout(timeoutId);
                        cleanup().then(() => safeResolve(false));
                    });
                    listeners.push(onShowFailed);

                    await AdMob.prepareRewardVideoAd({ adId, isTesting: true });
                    await AdMob.showRewardVideoAd();
                    
                } catch (error) {
                    console.error('AdMob Execution Error', error);
                    clearTimeout(timeoutId);
                    cleanup().then(() => safeResolve(false));
                }
            });
        } catch (e) {
            console.error("Reward Outer Error", e);
            this.isAdShowing = false;
            this.isAdManipulating = false;
            return false;
        }
    }
};
