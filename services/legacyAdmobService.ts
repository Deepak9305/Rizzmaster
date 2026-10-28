import {
    AdMob,
    RewardAdPluginEvents,
    AdMobRewardItem,
    AdmobConsentDebugGeography,
    type AdmobConsentInfo
} from '@capacitor-community/admob';
import { canUseNativeAdMob } from './nativeCapabilities';
import { readNativeConsentInfo } from './adConsentState';
import { getAdDeliveryDiagnostics, recordAdEvent } from './adDiagnostics';

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
    sdkInitPromise: null as Promise<boolean> | null,
    consentFormPromise: null as Promise<AdmobConsentInfo> | null,
    consentGatheringPromise: null as Promise<void> | null,
    privacyOptionsPromise: null as Promise<void> | null,
    consentRevision: 0,
    readinessListeners: new Set<() => void>(),
    recoveryListeners: new Set<() => void>(),
    rewardVideoPromise: null as Promise<boolean> | null,
    rewardVideoVersion: 0,
    rewardVideoContextVersion: 0,
    rewardVideoRequestCount: 0,
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
    REWARDED_STALE_AFTER_MS: 55 * 60 * 1000,
    REWARDED_SHOW_TIMEOUT_MS: 40000,
    CONSENT_REFRESH_TIMEOUT_MS: 15000,
    // Google allows mediation up to 30 seconds; leave room for bridge delivery.
    SDK_INIT_TIMEOUT_MS: 45000,
    NATIVE_CONSENT_TIMEOUT_MS: 3000,
    CONSENT_FORM_TIMEOUT_MS: 60000,
    INIT_WAIT_TIMEOUT_MS: 90000,

    getDeliveryDiagnostics() {
        return {
            ...getAdDeliveryDiagnostics(), initialized: this.initialized,
            canRequestAds: this.canRequestAds, privacyInProgress: this.privacyOptionsInProgress,
            rewardPreparing: this.rewardVideoPreparing, rewardShowing: this.isRewardVideoShowing,
        };
    },

    subscribeReadiness(listener: () => void) {
        this.readinessListeners.add(listener);
        return () => { this.readinessListeners.delete(listener); };
    },

    subscribeRecovery(listener: () => void) {
        this.recoveryListeners.add(listener);
        return () => { this.recoveryListeners.delete(listener); };
    },

    wakePendingAds() {
        for (const listener of this.recoveryListeners) {
            try { listener(); } catch (error) { console.warn('[AdMob] Recovery observer failed:', error); }
        }
    },

    notifyReadiness() {
        for (const listener of this.readinessListeners) {
            try { listener(); } catch (error) { console.warn('[AdMob] Readiness observer failed:', error); }
        }
    },

    applyConsentInfo(consentInfo: AdmobConsentInfo) {
        if (typeof consentInfo.canRequestAds !== 'boolean') {
            throw new Error('Native AdMob consent response lacks canRequestAds; this APK needs an AdMob plugin update.');
        }
        const changed = this.canRequestAds !== consentInfo.canRequestAds ||
            this.privacyOptionsRequired !== (consentInfo.privacyOptionsRequirementStatus === 'REQUIRED');
        if (this.canRequestAds && !consentInfo.canRequestAds) this.invalidateRewardVideo();
        ++this.consentRevision;
        this.consentInfo = consentInfo;
        this.canRequestAds = consentInfo.canRequestAds === true;
        if (changed) recordAdEvent(this.canRequestAds ? 'consent.allowed' : 'consent.blocked');
        this.privacyOptionsRequired = consentInfo.privacyOptionsRequirementStatus === 'REQUIRED';
        if (changed) this.notifyReadiness();
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
        ++this.rewardVideoContextVersion;
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
            ++this.consentRevision;
            this.invalidateRewardVideo();
            this.notifyReadiness();
            return null;
        }
    },

    initializeSdk(): Promise<boolean> {
        if (this.initialized) return Promise.resolve(true);
        if (this.sdkInitPromise) return this.sdkInitPromise;
        this.sdkInitPromise = (async () => {
            try {
                await Promise.resolve(); // Publish the shared task before bridge errors can settle it.
                const result: unknown = await this.withNativeTimeout('AdMob SDK initialization', AdMob.initialize(), this.SDK_INIT_TIMEOUT_MS);
                if (result && typeof result === 'object') console.log('[AdMob] Adapter initialization:', result);
                this.initialized = true;
                recordAdEvent('sdk.ready');
                return true;
            } catch (error) {
                console.error('[AdMob] SDK initialization failed:', error);
                this.initialized = false;
                recordAdEvent('sdk.failed');
                return false;
            } finally {
                this.sdkInitPromise = null;
                this.notifyReadiness();
            }
        })();
        return this.sdkInitPromise;
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
                let earlyPermission: Promise<boolean> = Promise.resolve(false);
                if (!this.consentGatheringPromise && !this.canRequestAds) {
                    if (this.DEBUG_FORCE_GDPR) await AdMob.resetConsentInfo();
                    // Start this session's required update BEFORE consulting UMP's
                    // previous-session permission. Never use a stored JS consent flag.
                    const refresh = this.consentFormPromise ? null : this.refreshConsentInfo();
                    const revision = this.consentRevision;
                    if (refresh && !this.DEBUG_FORCE_GDPR) {
                        earlyPermission = this.withNativeTimeout(
                            'Native UMP startup state', readNativeConsentInfo(), this.NATIVE_CONSENT_TIMEOUT_MS,
                        ).then(info => {
                            // An update/form that already finished takes precedence
                            // over a slower snapshot crossing the native bridge.
                            if (revision !== this.consentRevision || !info?.canRequestAds || this.privacyOptionsInProgress) return false;
                            this.applyConsentInfo(info);
                            return true;
                        }).catch(() => false);
                    }
                    this.consentGatheringPromise = (async () => {
                        try {
                            const info = refresh
                                ? this.applyConsentInfo(await refresh)
                                : await this.recoverConsentInfo();
                            if (info?.canRequestAds) void this.initializeSdk();
                            if (!this.consentFormPromise && info?.isConsentFormAvailable) {
                                // Native UMP decides whether any required form is shown.
                                this.applyConsentInfo(await this.gatherConsentForm());
                            }
                        } catch (error) {
                            console.warn('[AdMob] Consent gathering failed; checking current UMP permission:', error);
                            await this.recoverConsentInfo();
                        } finally {
                            this.consentGatheringPromise = null;
                            this.notifyReadiness();
                        }
                    })();
                }
                const gathering = this.consentGatheringPromise;
                if (gathering) {
                    await Promise.race([
                        gathering,
                        earlyPermission.then(permitted => permitted ? undefined : gathering),
                    ]);
                    // The refresh can revoke an early permission while the
                    // startup read crosses the bridge. Await its final form result.
                    if (!this.canRequestAds) await gathering;
                }
                if (!this.canRequestAds || this.privacyOptionsInProgress) {
                    console.warn('[AdMob] Ads blocked because UMP has not granted permission to request ads.');
                    return false;
                }

                if (!await this.initializeSdk()) return false;
                if (!this.canRequestAds && gathering) await gathering;
                return this.canRequestAds && !this.privacyOptionsInProgress;
            } catch (error) {
                console.error('AdMob Community initialization failed', error);
                this.initialized = false;
                this.canRequestAds = false;
                ++this.consentRevision;
                this.invalidateRewardVideo();
                this.notifyReadiness();
                return false;
            } finally {
                this.initPromise = null;
            }
        })();

        return this.initPromise;
    },

    async showPrivacyOptionsForm(): Promise<boolean> {
        if (!canUseNativeAdMob() || !this.privacyOptionsRequired || this.privacyOptionsInProgress || this.privacyOptionsPromise || this.initPromise || this.consentFormPromise || this.consentGatheringPromise) return false;

        this.privacyOptionsInProgress = true;
        this.canRequestAds = false;
        ++this.consentRevision;
        this.invalidateRewardVideo();
        this.notifyReadiness();
        let expired = false;
        try {
            const operation = AdMob.showPrivacyOptionsForm();
            this.privacyOptionsPromise = operation;
            const release = async () => {
                try {
                    if (expired) await this.recoverConsentInfo();
                } finally {
                    if (this.privacyOptionsPromise === operation) this.privacyOptionsPromise = null;
                    this.notifyReadiness();
                }
            };
            void operation.then(release, release).catch(error => console.warn('[AdMob] Late privacy recovery failed:', error));
            await this.withNativeTimeout('UMP privacy options', operation, this.CONSENT_FORM_TIMEOUT_MS);
        } catch (error) {
            expired = true;
            console.warn('[AdMob] Privacy options form failed:', error);
        } finally {
            await this.recoverConsentInfo();
            this.privacyOptionsInProgress = false;
            this.notifyReadiness();
        }
        return this.canRequestAds;
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

    async prepareRewardVideo(adId: string, ssv?: RewardVideoSsv, canPrepare: () => boolean = () => true): Promise<boolean> {
        if (!canUseNativeAdMob() || !canPrepare()) return false;

        const ssvKey = getRewardVideoSsvKey(ssv);
        if (this.isRewardVideoShowing && (this.rewardVideoDisplayStarted || this.activeRewardVideoAdId !== adId || this.activeRewardVideoSsvKey !== ssvKey)) return false;

        const initialized = await this.ensureInitialized('Reward video prepare');
        if (!canPrepare()) return false;
        if (!initialized) {
            this.invalidateRewardVideo();
            return false;
        }
        if (this.isRewardVideoShowing && (this.rewardVideoDisplayStarted || this.activeRewardVideoAdId !== adId || this.activeRewardVideoSsvKey !== ssvKey)) return false;

        if (this.rewardVideoPromise) {
            const pending = this.rewardVideoPromise;
            if (this.rewardVideoPendingAdId === adId && this.rewardVideoPendingSsvKey === ssvKey && this.rewardVideoPendingVersion === this.rewardVideoVersion) return pending;
            await pending;
            return this.prepareRewardVideo(adId, ssv, canPrepare);
        }
        if (this.hasFreshRewardVideo(adId, ssv)) return true;

        const version = ++this.rewardVideoVersion;
        const contextVersion = this.rewardVideoContextVersion;
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
                if (!this.canRequestAds || this.privacyOptionsInProgress || !canPrepare()) return false;
                // The plugin's prepare promise resolves from this request's
                // native onAdLoaded callback. Global Loaded events cannot
                // distinguish two SSV contexts sharing the same ad unit.
                ++this.rewardVideoRequestCount;
                recordAdEvent('reward.request');
                const nativeLoad = AdMob.prepareRewardVideoAd({ adId, isTesting: false, ssv });
                const adopt = (result: unknown) => {
                    if ((result as { superseded?: boolean } | null)?.superseded) return false;
                    // canPrepare controls starting a request. A later UI/credit
                    // update must not discard an ad already fetched for this identity.
                    if (contextVersion !== this.rewardVideoContextVersion ||
                        !this.canRequestAds || this.privacyOptionsInProgress || this.rewardVideoDisplayStarted) return false;
                    if (this.lastRewardVideoAdId !== adId) return false;
                    if (this.lastRewardVideoSsvKey !== ssvKey) {
                        // Older APKs lack native generation fencing: their late
                        // callback really can replace a newer SSV context.
                        this.invalidateRewardVideo();
                        return false;
                    }
                    this.rewardVideoReady = true;
                    this.rewardVideoPreparedAt = Date.now();
                    // The same promise is observed twice; count each native load once.
                    if (!prepared) { recordAdEvent('reward.loaded'); prepared = true; }
                    return true;
                };
                void nativeLoad.then(result => {
                    // A UI deadline ends waiting, not the native load. Keep a
                    // late ad for the same identity/context for the next opt-in.
                    adopt(result);
                }).catch(() => {});
                const result = await this.withNativeTimeout('Reward video load', nativeLoad, this.REWARDED_PREPARE_TIMEOUT_MS);
                prepared = adopt(result);
                if (!prepared) return false;
                this.rewardVideoReady = prepared;
                this.rewardVideoPreparedAt = prepared ? Date.now() : 0;
                if (prepared) {
                    console.log('AdMob Reward Video Prepared');
                }
                return prepared;
            } catch (error) {
                console.error('AdMob Prepare Reward Error:', error);
                recordAdEvent('reward.load-failed');
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
                let impressionListener: any = null;
                let dismissGraceTimer: ReturnType<typeof setTimeout> | null = null;

                let timeout: ReturnType<typeof setTimeout> | null = setTimeout(() => {
                    console.warn('[AdMob] Reward video show timeout');
                    cleanupAndResolve(false);
                }, this.REWARDED_SHOW_TIMEOUT_MS);

                const cleanupAndResolve = (success: boolean) => {
                    if (resolved) return;
                    resolved = true;
                    this.cleanupListeners([showedListener, rewardListener, dismissListener, failedShowListener, impressionListener]);
                    if (timeout) clearTimeout(timeout);
                    if (dismissGraceTimer) clearTimeout(dismissGraceTimer);
                    if (showRequested) {
                        this.rewardVideoReady = false;
                        this.rewardVideoPreparedAt = 0;
                    }
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
                            recordAdEvent('reward.shown');
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
                            if (validReward && !earned) recordAdEvent('reward.earned');
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
                            recordAdEvent('reward.dismissed');
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

                        // Optional actual SDK impression event. Older APKs do not
                        // emit it; its registration must never delay showing.
                        void Promise.resolve().then(() => AdMob.addListener('rewardedAdRecordedImpression' as any, () => {
                            if (!resolved && showRequested) recordAdEvent('reward.impression');
                        })).then(listener => {
                            if (resolved) this.removeListener(listener);
                            else impressionListener = listener;
                        }).catch(() => {});
                        const cachedAt = this.rewardVideoPreparedAt;
                        const cachedContext = this.rewardVideoContextVersion;
                        try {
                            // JIT loading has its own deadline. Give the native
                            // show callback its full window once an ad is ready.
                            if (timeout) clearTimeout(timeout);
                            timeout = setTimeout(() => {
                                console.warn('[AdMob] Native reward show callback timed out');
                                cleanupAndResolve(false);
                            }, this.REWARDED_SHOW_TIMEOUT_MS);
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
                            const notConsumed = (error as { code?: string } | null)?.code === 'AD_NOT_FOREGROUND';
                            if (notConsumed && !showed && !earned && !dismissed &&
                                cachedContext === this.rewardVideoContextVersion && this.canRequestAds &&
                                !this.privacyOptionsInProgress && Date.now() - cachedAt < this.REWARDED_STALE_AFTER_MS) {
                                showRequested = false;
                                this.rewardVideoReady = true;
                                this.rewardVideoPreparedAt = cachedAt;
                                recordAdEvent('reward.retained-not-shown');
                            } else this.invalidateRewardVideo();
                            recordAdEvent('reward.show-failed', (error as { code?: string } | null)?.code);
                            cleanupAndResolve(false);
                        }
                    } catch (error) {
                        if (resolved) return;
                        console.error('[AdMob] Reward video executor error:', error);
                        if (showRequested) this.invalidateRewardVideo();
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
