import {
    AdMob,
    RewardAdPluginEvents,
    AdMobRewardItem,
    AdmobConsentDebugGeography,
    type AdmobConsentInfo
} from '@capacitor-community/admob';
import { canUseNativeAdMob } from './nativeCapabilities';
import { readNativeConsentInfo } from './adConsentState';

export type RewardVideoSsv = {
    userId: string;
    customData: string;
};

// Android mediation adapters do not consistently preserve the configured reward
// type in the JS bridge. A positive native reward callback is authoritative for
// this fixed ad unit; the server still grants only its configured 5-credit item.
const didEarnReward = (info: Partial<AdMobRewardItem> | null | undefined) => (
    Number(info?.amount) > 0
);

const getRewardVideoSsvKey = (ssv?: RewardVideoSsv) => (
    ssv ? `${ssv.userId}:${ssv.customData}` : ''
);

export const AdMobService = {
    initialized: false,
    rewardVideoReady: false,
    rewardVideoPreparing: false,
    isRewardVideoShowing: false,
    rewardVideoDisplayStarted: false,
    // Internal Promise tracking to avoid redundant fetches and handle race conditions
    initPromise: null as Promise<boolean> | null,
    consentFormPromise: null as Promise<AdmobConsentInfo> | null,
    rewardVideoPromise: null as Promise<boolean> | null,
    rewardVideoVersion: 0,
    rewardVideoPendingVersion: 0,
    rewardVideoPendingAdId: null as string | null,
    rewardVideoPendingSsvKey: '',
    activeRewardVideoAdId: null as string | null,
    activeRewardVideoSsvKey: '',
    consentInfo: null as AdmobConsentInfo | null,
    canRequestAds: false,
    privacyOptionsRequired: false,
    privacyOptionsInProgress: false,
    rewardVideoPreparedAt: 0,
    lastRewardVideoAdId: null as string | null,
    lastRewardVideoSsvKey: '',
    // Set this to true to force the GDPR popup to show for everyone during testing/development.
    // Set to false before releasing to the Play Store.
    DEBUG_FORCE_GDPR: false,
    REWARDED_PREPARE_TIMEOUT_MS: 35000,
    REWARDED_POST_SHOW_TIMEOUT_MS: 90000,
    REWARDED_DISMISS_GRACE_MS: 2000,
    REWARDED_STALE_AFTER_MS: 50 * 60 * 1000,
    REWARDED_SHOW_TIMEOUT_MS: 40000,
    CONSENT_REFRESH_TIMEOUT_MS: 15000,
    // Google allows mediation up to 30 seconds, plus native parent-view setup.
    SDK_INIT_TIMEOUT_MS: 45000,
    NATIVE_CONSENT_TIMEOUT_MS: 3000,
    CONSENT_FORM_TIMEOUT_MS: 60000,
    INIT_WAIT_TIMEOUT_MS: 90000,

    applyConsentInfo(consentInfo: AdmobConsentInfo) {
        if (typeof consentInfo.canRequestAds !== 'boolean') {
            throw new Error('Native AdMob consent response lacks canRequestAds; this APK needs an AdMob plugin update.');
        }
        this.consentInfo = consentInfo;
        this.canRequestAds = consentInfo.canRequestAds === true;
        this.privacyOptionsRequired = consentInfo.privacyOptionsRequirementStatus === 'REQUIRED';
        return consentInfo;
    },

    isPrivacyOptionsRequired() {
        return this.privacyOptionsRequired;
    },

    removeListener(listener: any) {
        try {
            if (listener && typeof listener.remove === 'function') {
                void Promise.resolve(listener.remove()).catch(() => {});
            }
        } catch { }
    },

    cleanupListeners(listeners: any[]) {
        listeners.forEach(listener => this.removeListener(listener));
    },

    sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    invalidateRewardVideo() {
        ++this.rewardVideoVersion;
        this.rewardVideoReady = false;
        // Keep an in-flight load serialized until its bounded wait settles.
        // Its completion must not restore a cache invalidated by privacy or
        // replace the metadata of a newer reward context.
        this.rewardVideoPreparedAt = 0;
        this.lastRewardVideoAdId = null;
        this.lastRewardVideoSsvKey = '';
    },

    hasFreshRewardVideo(adId?: string, ssv?: RewardVideoSsv) {
        if (!this.rewardVideoReady) return false;
        if (!this.lastRewardVideoAdId) return false;
        if (adId && this.lastRewardVideoAdId !== adId) return false;
        if (getRewardVideoSsvKey(ssv) !== this.lastRewardVideoSsvKey) return false;
        return Date.now() - this.rewardVideoPreparedAt < this.REWARDED_STALE_AFTER_MS;
    },

    async withNativeTimeout<T>(label: string, operation: Promise<T>, timeoutMs: number): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([
                operation,
                new Promise<never>((_, reject) => {
                    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
                }),
            ]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    },

    async refreshConsentInfo(): Promise<AdmobConsentInfo> {
        return this.withNativeTimeout('UMP consent refresh', AdMob.requestConsentInfo({
            debugGeography: this.DEBUG_FORCE_GDPR ? AdmobConsentDebugGeography.EEA : AdmobConsentDebugGeography.DISABLED,
        }), this.CONSENT_REFRESH_TIMEOUT_MS);
    },

    async gatherConsentForm(): Promise<AdmobConsentInfo> {
        // A deadline releases initialization, not the native form. Keep the
        // operation tracked until its callback arrives to avoid duplicate forms.
        let waitExpired = false;
        if (!this.consentFormPromise) {
            const operation = AdMob.showConsentForm();
            this.consentFormPromise = operation;
            const release = async () => {
                try {
                    if (waitExpired) {
                        // A late callback must not restore its stale permission
                        // snapshot after recovery. Re-read UMP's current state.
                        this.canRequestAds = false;
                        this.invalidateRewardVideo();
                        await this.recoverConsentInfo();
                    }
                } catch (error) {
                    console.warn('[AdMob] Late consent recovery failed:', error);
                } finally {
                    // Keep privacy-options entry serialized with this read too.
                    if (this.consentFormPromise === operation) this.consentFormPromise = null;
                }
            };
            void operation.then(release, release);
        }
        try {
            return await this.withNativeTimeout('UMP consent form', this.consentFormPromise, this.CONSENT_FORM_TIMEOUT_MS);
        } catch (error) {
            waitExpired = true;
            throw error;
        }
    },

    async recoverConsentInfo(): Promise<AdmobConsentInfo | null> {
        try {
            const nativeInfo = await this.withNativeTimeout(
                'Native UMP state read', readNativeConsentInfo(), this.NATIVE_CONSENT_TIMEOUT_MS,
            );
            if (nativeInfo) return this.applyConsentInfo(nativeInfo);
        } catch (error) {
            console.warn('[AdMob] Native UMP state read failed:', error);
        }
        // Existing APKs lack AdConsentState. Refresh once to obtain an authoritative
        // result instead of trusting a pre-form snapshot or stored consent string.
        try {
            return this.applyConsentInfo(await this.refreshConsentInfo());
        } catch (error) {
            console.warn('[AdMob] Could not verify UMP permission; ads remain blocked:', error);
            this.canRequestAds = false;
            return null;
        }
    },

    async initialize(): Promise<boolean> {
        if (!canUseNativeAdMob()) {
            console.warn('[AdMob] Initialization skipped: native AdMob plugin is unavailable.');
            return false;
        }
        if (this.privacyOptionsInProgress) return false;
        if (this.initPromise) return this.initPromise;
        if (this.initialized && this.canRequestAds) return true;

        this.initPromise = (async (): Promise<boolean> => {
            try {
                // Only UMP's current native permission can authorize an ad request.
                this.consentInfo = null;
                this.canRequestAds = false;
                this.privacyOptionsRequired = false;

                if (this.DEBUG_FORCE_GDPR) {
                    try {
                        await AdMob.resetConsentInfo();
                    } catch (error) {
                        console.warn('Reset GDPR info failed', error);
                    }
                }

                let consentInfo: AdmobConsentInfo | null;
                try {
                    if (this.consentFormPromise) {
                        // A previous wait expired. Read current native permission
                        // rather than waiting forever or presenting another form.
                        consentInfo = await this.recoverConsentInfo();
                    } else {
                        consentInfo = this.applyConsentInfo(await this.refreshConsentInfo());
                    }
                    if (!this.consentFormPromise && consentInfo?.isConsentFormAvailable) {
                        // Native loadAndShowConsentFormIfRequired decides whether
                        // an EU or US-state message must actually be presented.
                        console.log('AdMob: Loading required consent/privacy form...');
                        consentInfo = this.applyConsentInfo(await this.gatherConsentForm());
                    }
                } catch (error) {
                    console.warn('[AdMob] Consent gathering failed; checking current UMP permission:', error);
                    consentInfo = await this.recoverConsentInfo();
                }

                console.log('[AdMob] UMP permission result', {
                    status: consentInfo?.status ?? 'unavailable',
                    canRequestAds: consentInfo?.canRequestAds === true,
                    privacyOptionsRequired: this.privacyOptionsRequired,
                });
                if (!consentInfo?.canRequestAds) {
                    console.warn('[AdMob] Ads blocked because UMP has not granted permission to request ads.');
                    return false;
                }

                await this.withNativeTimeout('AdMob SDK initialization',
                    AdMob.initialize(), this.SDK_INIT_TIMEOUT_MS);
                this.initialized = true;
                console.log('AdMob Community Initialized after UMP consent checks');
                return true;
            } catch (error) {
                console.error('AdMob Community initialization failed', error);
                this.initialized = false;
                this.canRequestAds = false;
                return false;
            } finally {
                this.initPromise = null;
            }
        })();

        return this.initPromise;
    },

    async showPrivacyOptionsForm(): Promise<boolean> {
        if (!canUseNativeAdMob() || !this.privacyOptionsRequired || this.privacyOptionsInProgress || this.initPromise || this.consentFormPromise) return false;

        this.privacyOptionsInProgress = true;
        this.canRequestAds = false;
        this.invalidateRewardVideo();
        try {
            await AdMob.showPrivacyOptionsForm();
            await this.recoverConsentInfo();
            return this.canRequestAds;
        } catch (error) {
            console.warn('[AdMob] Privacy options form failed:', error);
            await this.recoverConsentInfo();
            return this.canRequestAds;
        } finally {
            this.privacyOptionsInProgress = false;
        }
    },

    async ensureInitialized(context: string): Promise<boolean> {
        let initialized = false;
        try {
            // Bound callers' waiting time without launching another consent form
            // while a user is still considering the first one.
            initialized = await this.withNativeTimeout('AdMob readiness', this.initialize(), this.INIT_WAIT_TIMEOUT_MS);
        } catch (error) {
            console.warn(`[AdMob] ${context} readiness failed:`, error);
        }
        if (!initialized) {
            console.warn(`[AdMob] ${context} skipped because AdMob failed to initialize.`);
        }
        return initialized;
    },

    async prepareRewardVideo(adId: string, ssv?: RewardVideoSsv): Promise<boolean> {
        if (!canUseNativeAdMob()) return false;

        const ssvKey = getRewardVideoSsvKey(ssv);
        if (this.isRewardVideoShowing && (this.rewardVideoDisplayStarted || this.activeRewardVideoAdId !== adId || this.activeRewardVideoSsvKey !== ssvKey)) return false;

        const initialized = await this.ensureInitialized('Reward video prepare');
        if (!initialized) {
            this.invalidateRewardVideo();
            return false;
        }
        if (this.isRewardVideoShowing && (this.rewardVideoDisplayStarted || this.activeRewardVideoAdId !== adId || this.activeRewardVideoSsvKey !== ssvKey)) return false;

        if (this.rewardVideoPromise) {
            const pending = this.rewardVideoPromise;
            if (this.rewardVideoPendingAdId === adId && this.rewardVideoPendingSsvKey === ssvKey && this.rewardVideoPendingVersion === this.rewardVideoVersion) return pending;
            await pending;
            return this.prepareRewardVideo(adId, ssv);
        }
        if (this.hasFreshRewardVideo(adId, ssv)) return true;

        const version = ++this.rewardVideoVersion;
        this.rewardVideoReady = false;
        this.rewardVideoPreparedAt = 0;
        this.rewardVideoPreparing = true;
        this.rewardVideoPendingVersion = version;
        this.rewardVideoPendingAdId = adId;
        this.rewardVideoPendingSsvKey = ssvKey;
        this.lastRewardVideoAdId = adId;
        this.lastRewardVideoSsvKey = ssvKey;
        const task = (async (): Promise<boolean> => {
            let prepared = false;
            try {
                // Publish the shared task before any synchronous bridge error
                // or permission change can run its cleanup.
                await Promise.resolve();
                if (!this.canRequestAds || this.privacyOptionsInProgress) return false;
                // The plugin's prepare promise resolves from this request's
                // native onAdLoaded callback. Global Loaded events cannot
                // distinguish two SSV contexts sharing the same ad unit.
                const nativeLoad = AdMob.prepareRewardVideoAd({ adId, isTesting: false, ssv });
                void nativeLoad.then(() => {
                    // A native request can finish after our timeout. If it
                    // replaced this ad unit's newer cache, discard readiness.
                    if (version !== this.rewardVideoVersion && this.lastRewardVideoAdId === adId) this.invalidateRewardVideo();
                }).catch(() => {});
                await this.withNativeTimeout('Reward video load', nativeLoad, this.REWARDED_PREPARE_TIMEOUT_MS);
                prepared = version === this.rewardVideoVersion && this.canRequestAds && !this.privacyOptionsInProgress;
                if (!prepared) return false;
                this.rewardVideoReady = prepared;
                this.rewardVideoPreparedAt = prepared ? Date.now() : 0;
                if (prepared) {
                    console.log('AdMob Reward Video Prepared');
                }
                return prepared;
            } catch (error) {
                console.error('AdMob Prepare Reward Error:', error);
                return false;
            } finally {
                if (this.rewardVideoPendingVersion === version) {
                    this.rewardVideoPreparing = false;
                    this.rewardVideoPromise = null;
                    this.rewardVideoPendingAdId = null;
                    this.rewardVideoPendingSsvKey = '';
                }
            }
        })();
        this.rewardVideoPromise = task;
        return task;
    },

    async showRewardVideo(adId: string, ssv?: RewardVideoSsv, onShow?: () => void): Promise<boolean> {
        if (!canUseNativeAdMob()) return false;
        if (this.isRewardVideoShowing) return false;
        this.isRewardVideoShowing = true;
        this.rewardVideoDisplayStarted = false;
        this.activeRewardVideoAdId = adId;
        this.activeRewardVideoSsvKey = getRewardVideoSsvKey(ssv);

        const initialized = await this.ensureInitialized('Reward video show');
        if (!initialized) {
            this.isRewardVideoShowing = false;
            this.rewardVideoDisplayStarted = false;
            this.activeRewardVideoAdId = null;
            this.activeRewardVideoSsvKey = '';
            this.invalidateRewardVideo();
            return false;
        }
        console.log(`[AdMob] Attempting to show reward video: ${adId}`);

        try {
            return await new Promise<boolean>((resolve) => {
                let resolved = false;
                let earned = false;
                let dismissed = false;
                let showRequested = false;
                let showed = false;
                let showedListener: any = null;
                let rewardListener: any = null;
                let dismissListener: any = null;
                let failedShowListener: any = null;
                let dismissGraceTimer: ReturnType<typeof setTimeout> | null = null;

                let timeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
                    console.warn('[AdMob] Reward video show timeout');
                    cleanupAndResolve(false);
                }, this.REWARDED_SHOW_TIMEOUT_MS);

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    this.cleanupListeners([showedListener, rewardListener, dismissListener, failedShowListener]);
                    if (timeout) clearTimeout(timeout);
                    if (dismissGraceTimer) clearTimeout(dismissGraceTimer);
                    this.rewardVideoReady = false;
                    this.rewardVideoPreparedAt = 0;
                    this.isRewardVideoShowing = false;
                    this.rewardVideoDisplayStarted = false;
                    this.activeRewardVideoAdId = null;
                    this.activeRewardVideoSsvKey = '';
                    console.log(`[AdMob] Reward video finished. Success: ${success}`);
                    resolve(success);
                };

                const register = async (event: any, callback: (info: any) => void) => {
                    if (resolved) return null;
                    const listener = await AdMob.addListener(event, info => { if (!resolved && showRequested) callback(info); });
                    if (resolved) {
                        this.removeListener(listener);
                        return null;
                    }
                    return listener;
                };

                void (async () => {
                    try {
                        showedListener = await register(RewardAdPluginEvents.Showed, () => {
                            if (showed) return;
                            showed = true;
                            console.log('[AdMob] Reward video showing, switching to dismissal watchdog');
                            if (timeout) clearTimeout(timeout);
                            timeout = setTimeout(() => {
                                console.warn('[AdMob] Reward video dismiss event never arrived after show; releasing state.');
                                cleanupAndResolve(earned);
                            }, this.REWARDED_POST_SHOW_TIMEOUT_MS);
                            try { onShow?.(); } catch (error) { console.warn('[AdMob] Reward video show observer failed:', error); }
                        });
                        if (resolved) return;

                        rewardListener = await register(RewardAdPluginEvents.Rewarded, (info) => {
                            console.log('[AdMob] Reward video reward event received.', {
                                amount: Number.isFinite(Number(info?.amount)) ? Number(info.amount) : null,
                                type: typeof info?.type === 'string' ? info.type : null,
                            });
                            const validReward = didEarnReward(info);
                            earned ||= validReward;
                            if (!validReward) {
                                console.warn('[AdMob] Reward video callback did not include a positive reward amount.');
                            }
                            if (dismissed && earned) cleanupAndResolve(true);
                        });
                        if (resolved) return;

                        dismissListener = await register(RewardAdPluginEvents.Dismissed, () => {
                            console.log('[AdMob] Reward video dismissed');
                            if (dismissed) return;
                            dismissed = true;
                            if (earned) { cleanupAndResolve(true); return; }
                            if (timeout) clearTimeout(timeout);
                            // Some mediation adapters can dispatch dismiss
                            // before the native reward callback. Give the
                            // plugin result/event a brief chance to arrive.
                            dismissGraceTimer = setTimeout(() => {
                                cleanupAndResolve(earned);
                            }, this.REWARDED_DISMISS_GRACE_MS);
                        });
                        if (resolved) return;

                        failedShowListener = await register(RewardAdPluginEvents.FailedToShow, (error) => {
                            console.error('[AdMob] Reward video failed to show:', error);
                            this.invalidateRewardVideo();
                            cleanupAndResolve(false);
                        });
                        if (resolved) {
                            this.cleanupListeners([showedListener, rewardListener, dismissListener, failedShowListener]);
                            return;
                        }

                        if (!this.hasFreshRewardVideo(adId, ssv)) {
                            console.warn('[AdMob] Ad not ready, attempting JIT prepare...');
                            const prepared = await this.prepareRewardVideo(adId, ssv);
                            if (resolved) return;
                            if (!prepared || !this.hasFreshRewardVideo(adId, ssv)) {
                                console.error('[AdMob] JIT Prepare failed: Ad not ready.');
                                cleanupAndResolve(false);
                                return;
                            }
                        }
                        if (resolved || !this.canRequestAds || this.privacyOptionsInProgress || !this.hasFreshRewardVideo(adId, ssv)) {
                            cleanupAndResolve(false);
                            return;
                        }

                        try {
                            showRequested = true;
                            this.rewardVideoDisplayStarted = true;
                            this.rewardVideoReady = false;
                            this.rewardVideoPreparedAt = 0;
                            // The plugin resolves this call from the native
                            // onUserEarnedReward callback. Use its result as
                            // the source of truth if the JS event delivery is
                            // delayed or missed by the WebView bridge.
                            const rewardItem = await AdMob.showRewardVideoAd({ adId }) as AdMobRewardItem;
                            if (resolved) return;
                            if (didEarnReward(rewardItem)) {
                                earned = true;
                            }
                            // Earning a reward is not dismissal. Keep the show
                            // lock and listeners until the fullscreen ad closes.
                            if (dismissed && earned) cleanupAndResolve(true);
                        } catch (error) {
                            if (resolved) return;
                            console.error('AdMob showRewardVideoAd threw:', error);
                            this.invalidateRewardVideo();
                            cleanupAndResolve(false);
                        }
                    } catch (error) {
                        if (resolved) return;
                        console.error('[AdMob] Reward video executor error:', error);
                        this.invalidateRewardVideo();
                        cleanupAndResolve(false);
                    }
                })();
            });
        } catch (error) {
            console.error('[AdMob] Critical Reward Error', error);
            this.isRewardVideoShowing = false;
            this.rewardVideoDisplayStarted = false;
            this.activeRewardVideoAdId = null;
            this.activeRewardVideoSsvKey = '';
            this.invalidateRewardVideo();
            return false;
        }
    }
};
