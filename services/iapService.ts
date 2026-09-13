import 'cordova-plugin-purchase';
import { Capacitor } from '@capacitor/core';
import { canUseNativeIap } from './nativeCapabilities';
import { getApiUrl } from './runtimeConfig';
import { supabase } from './supabaseClient';

// Helper to safely get the CdvPurchase object (Native or Mock)
const getCdvPurchase = () => {
    const native = (window as any).CdvPurchase;
    if (native) return native;

    // Robust Mock for Web/Dev environments
    return {
        ProductType: { PAID_SUBSCRIPTION: 'paid subscription' },
        Platform: { GOOGLE_PLAY: 'google-play', APPLE_APPSTORE: 'apple-appstore' },
        ErrorCode: { PAYMENT_CANCELLED: 6777006 },
        store: {
            register: () => { },
            when: () => ({
                approved: () => { },
                verified: () => ({ finish: () => { } }),
                finished: () => { },
                productUpdated: () => { },
                updated: () => { }
            }),
            initialize: async () => { },
            update: async () => { },
            get: () => null,
            restore: async () => { },
            products: [],
            error: () => { },
            order: async () => { }
        }
    };
};

/**
 * IN-APP PURCHASE CONFIGURATION
 */
const getProductType = () => getCdvPurchase().ProductType.PAID_SUBSCRIPTION;

const readReceiptPath = (source: any, path: Array<string | number>) => {
    let current = source;
    for (const key of path) {
        if (current == null) return '';
        current = current[key];
    }
    return typeof current === 'string' || typeof current === 'number'
        ? String(current).trim()
        : '';
};

const firstReceiptValue = (source: any, paths: Array<Array<string | number>>) => {
    for (const path of paths) {
        const value = readReceiptPath(source, path);
        if (value) return value;
    }
    return '';
};

const tryParseJson = (value: any) => {
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return value;

    try {
        return JSON.parse(trimmed);
    } catch {
        return value;
    }
};

const findDeepReceiptValue = (
    source: any,
    keys: string[],
    depth = 0
): string => {
    if (!source || depth > 8) return '';

    const parsedSource = tryParseJson(source);

    if (typeof parsedSource === 'string' || typeof parsedSource === 'number') {
        return '';
    }

    if (Array.isArray(parsedSource)) {
        for (const item of parsedSource) {
            const found = findDeepReceiptValue(item, keys, depth + 1);
            if (found) return found;
        }
        return '';
    }

    if (typeof parsedSource === 'object') {
        for (const key of keys) {
            const value = parsedSource[key];
            if (typeof value === 'string' || typeof value === 'number') {
                const parsedValue = tryParseJson(value);

                if (parsedValue !== value) {
                    const nested = findDeepReceiptValue(parsedValue, keys, depth + 1);
                    if (nested) return nested;
                }

                return String(value).trim();
            }
        }

        for (const value of Object.values(parsedSource)) {
            const found = findDeepReceiptValue(value, keys, depth + 1);
            if (found) return found;
        }
    }

    return '';
};

const getGooglePurchaseToken = (receipt: any, fallback?: any) => {
    return (
        firstReceiptValue(receipt, [
            ['purchaseToken'],
            ['purchase_token'],
            ['nativePurchase', 'purchaseToken'],
            ['nativePurchase', 'token'],
            ['transaction', 'purchaseToken'],
            ['transaction', 'transactionReceipt'],
            ['transactions', 0, 'purchaseToken'],
            ['transactions', 0, 'transactionReceipt'],
            ['transactions', 0, 'nativePurchase', 'purchaseToken'],
            ['transactions', 0, 'nativePurchase', 'token'],
            ['payload', 'purchaseToken'],
            ['payload', 'purchase_token'],
            ['payload', 'token'],
            ['transactionReceipt'],
        ]) ||
        findDeepReceiptValue(receipt, ['purchaseToken', 'purchase_token']) ||
        findDeepReceiptValue(fallback, ['purchaseToken', 'purchase_token']) ||
        ''
    );
};

const getAndroidSubscriptionProductId = () => {
    return IAP_CONFIG.WEEKLY.androidId || IAP_CONFIG.MONTHLY.androidId || '';
};

const getExactAndroidOffer = (product: any, basePlanId: string) => {
    const offers = Array.isArray(product?.offers) ? product.offers : [];
    const productId = typeof product?.id === 'string' ? product.id : '';
    const canonicalOfferId = productId ? `${productId}@${basePlanId}` : '';

    // cordova-plugin-purchase v13 represents Google base plans as product@basePlan.
    return offers.find((offer: any) => offer?.id === canonicalOfferId)
        || offers.find((offer: any) => (
            offer?.id === basePlanId
            || offer?.basePlanId === basePlanId
            || offer?.base_plan_id === basePlanId
            || (typeof offer?.id === 'string' && offer.id.endsWith(`@${basePlanId}`))
        ));
};

const logIapJson = (message: string, data: Record<string, any>) => {
    try {
        console.log(`${message} ${JSON.stringify(data)}`);
    } catch {
        console.log(message);
    }
};

const getIapErrorMessage = (error: any, fallback = "Purchase failed") => {
    if (typeof error === 'string' && error.trim()) return error.trim();
    if (typeof error?.message === 'string' && error.message.trim()) return error.message.trim();
    if (typeof error?.code === 'string' && error.code.trim()) return `${fallback} (${error.code.trim()})`;
    if (typeof error?.code === 'number') return `${fallback} (${error.code})`;
    return fallback;
};

const delay = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds));

const throwIfStoreError = (error: any) => {
    if (error && (error.isError || error.code || error.message)) {
        throw error;
    }
};

export const IAP_CONFIG = {
    WEEKLY: {
        alias: 'weekly_sub',
        androidId: 'premium',
        androidBasePlanId: 'weekly',
        iosId: 'premium_weekly', // iOS typically requires unique product IDs per subscription duration
        get type() { return getProductType(); }
    },
    MONTHLY: {
        alias: 'monthly_sub',
        androidId: 'premium',
        androidBasePlanId: 'monthly',
        iosId: 'premium_monthly', // iOS typically requires unique product IDs per subscription duration
        get type() { return getProductType(); }
    }
};

class IAPService {
    isInitialized = false;
    products: any[] = [];
    initializationPromise: Promise<void> | null = null;
    purchaseInProgress = false;

    // Callbacks to update UI/DB
    onSuccess: ((purchaseData: any) => boolean | void | Promise<boolean | void>) | null = null;
    onError: ((msg: string) => void) | null = null;
    pendingPlan: 'WEEKLY' | 'MONTHLY' | null = null;
    lastApprovedTransaction: any = null;
    activeIntent: 'purchase' | 'restore' | null = null;
    currentUserId: string | null = null;
    currentAccountBinding: string | null = null;

    initialize(onSuccess: (purchaseData: any) => boolean | void | Promise<boolean | void>, onError: (msg: string) => void) {
        this.onSuccess = onSuccess;
        this.onError = onError;

        if (!canUseNativeIap()) {
            console.log("IAP: Not native platform, skipping initialization.");
            return;
        }

        if (this.isInitialized || this.initializationPromise) return;

        const CdvPurchase = getCdvPurchase();
        if (!CdvPurchase) return; // Safety check

        const { store, Platform } = CdvPurchase;
        store.applicationUsername = () => this.currentAccountBinding || undefined;
        // Keep Google Play's account ID format stable across old and new app builds.
        store.obfuscator = 'legacy';

        // 1. Prepare Registration List
        const productsToRegister: any[] = [];
        const registeredIds = new Set<string>();

        const addProduct = (id: string, type: string, platform: string) => {
            if (!id) return;
            const key = `${platform}_${id}`;
            if (!registeredIds.has(key)) {
                productsToRegister.push({ id, type, platform });
                registeredIds.add(key);
            }
        };

        if (Capacitor.getPlatform() === 'android') {
            addProduct(IAP_CONFIG.WEEKLY.androidId, IAP_CONFIG.WEEKLY.type, Platform.GOOGLE_PLAY);
            addProduct(IAP_CONFIG.MONTHLY.androidId, IAP_CONFIG.MONTHLY.type, Platform.GOOGLE_PLAY);
        } else if (Capacitor.getPlatform() === 'ios') {
            addProduct(IAP_CONFIG.WEEKLY.iosId, IAP_CONFIG.WEEKLY.type, Platform.APPLE_APPSTORE);
            addProduct(IAP_CONFIG.MONTHLY.iosId, IAP_CONFIG.MONTHLY.type, Platform.APPLE_APPSTORE);
        }

        if (productsToRegister.length > 0) {
            store.register(productsToRegister);
        }

        // 2. Setup Listeners
        // IMPORTANT: onSuccess fires on 'verified' (after receipt auth), not 'approved'.
        // Firing on 'approved' would grant premium before Google/Apple confirms payment.
        store.when().approved((transaction: any) => {
            logIapJson("IAP: Transaction approved. Verifying with server...", {
                transactionKeys: transaction ? Object.keys(transaction) : [],
                pendingPlan: this.pendingPlan,
                activeIntent: this.activeIntent,
                ownerUserId: this.currentUserId,
            });
            this.lastApprovedTransaction = transaction;
            transaction.verify();
        });

        store.when().verified(async (receipt: any) => {
            logIapJson("IAP: Receipt verified. Passing to backend.", {
                receiptKeys: receipt ? Object.keys(receipt) : [],
                pendingPlan: this.pendingPlan,
                activeIntent: this.activeIntent,
                ownerUserId: this.currentUserId,
            });

            const purchaseToken = getGooglePurchaseToken(receipt, this.lastApprovedTransaction);
            const transactionId = firstReceiptValue(receipt, [
                ['transactionId'],
                ['orderId'],
                ['transaction', 'transactionId'],
                ['transaction', 'orderId'],
                ['transactions', 0, 'transactionId'],
                ['transactions', 0, 'orderId'],
                ['nativePurchase', 'orderId'],
                ['payload', 'orderId'],
            ]);
            const productId = firstReceiptValue(receipt, [
                ['id'],
                ['productId'],
                ['transaction', 'products', 0, 'id'],
                ['transactions', 0, 'products', 0, 'id'],
                ['transactions', 0, 'productId'],
            ]);
            const basePlanId = firstReceiptValue(receipt, [
                ['basePlanId'],
                ['offerId'],
                ['transaction', 'offerId'],
                ['transactions', 0, 'offerId'],
            ]) || null;
            const expiresAt = firstReceiptValue(receipt, [
                ['expiresAt'],
                ['expiryDate'],
                ['expirationDate'],
                ['transaction', 'expiresAt'],
                ['transactions', 0, 'expiresAt'],
            ]) || null;
            const pendingConfig =
                this.pendingPlan === 'WEEKLY'
                    ? IAP_CONFIG.WEEKLY
                    : this.pendingPlan === 'MONTHLY'
                        ? IAP_CONFIG.MONTHLY
                        : null;
            const isAndroid = Capacitor.getPlatform() === 'android';
            const isIOS = Capacitor.getPlatform() === 'ios';
            const configuredAndroidProductId = isAndroid ? getAndroidSubscriptionProductId() : '';
            const expectedProductId = pendingConfig
                ? (isIOS ? pendingConfig.iosId : pendingConfig.androidId)
                : (isAndroid && configuredAndroidProductId ? configuredAndroidProductId : productId);
            const expectedBasePlanId = pendingConfig && isAndroid
                ? pendingConfig.androidBasePlanId
                : basePlanId;
            const intent = this.pendingPlan ? 'purchase' : (this.activeIntent || 'restore');
            const ownerUserId = this.currentUserId || null;

            logIapJson("IAP: Purchase token extraction result", {
                hasPurchaseToken: Boolean(purchaseToken),
                productId: expectedProductId || productId,
                basePlanId: expectedBasePlanId || basePlanId,
                plan: this.pendingPlan,
                intent,
                ownerUserId,
                receiptKeys: receipt ? Object.keys(receipt) : [],
                approvedKeys: this.lastApprovedTransaction ? Object.keys(this.lastApprovedTransaction) : [],
            });

            // Normalize the purchase data for the backend
            const purchaseData = {
                platform: Capacitor.getPlatform(),
                productId: expectedProductId,
                plan: this.pendingPlan,
                intent,
                ownerUserId,
                basePlanId: expectedBasePlanId,
                purchaseToken,
                transactionId,
                orderId: firstReceiptValue(receipt, [['orderId'], ['transaction', 'orderId'], ['transactions', 0, 'orderId']]),
                expiresAt,
                rawReceipt: receipt
            };

            try {
                const verified = this.onSuccess ? await this.onSuccess(purchaseData) : false;
                if (verified === false) {
                    console.warn("IAP: Backend verification did not complete; leaving receipt unfinished for retry.");
                    return;
                }

                if (typeof receipt.finish === 'function') {
                    await receipt.finish();
                }
            } catch (error) {
                logIapJson("IAP: Backend verification callback failed", {
                    message: error instanceof Error ? error.message : String(error),
                    pendingPlan: this.pendingPlan,
                    activeIntent: this.activeIntent,
                    ownerUserId,
                });
                this.onError?.(getIapErrorMessage(error, "Purchase verification failed"));
            } finally {
                this.pendingPlan = null;
                this.activeIntent = null;
                this.lastApprovedTransaction = null;
            }
        });

        store.when().finished((transaction: any) => {
            logIapJson("IAP: Transaction finished", {
                transactionKeys: transaction ? Object.keys(transaction) : [],
                pendingPlan: this.pendingPlan,
                activeIntent: this.activeIntent,
            });
        });

        store.when().productUpdated((product: any) => {
            console.log(`IAP: Product Updated: ${product.id} [${product.state}] CanPurchase: ${product.canPurchase}`);
            this.products = store.products;
        });

        store.when().updated((root: any) => {
            this.products = store.products;
        });

        store.error((error: any) => {
            logIapJson('IAP Error:', {
                code: error?.code,
                message: error?.message,
                platform: Capacitor.getPlatform(),
                pendingPlan: this.pendingPlan,
                activeIntent: this.activeIntent,
            });
            if (error && error.code !== CdvPurchase.ErrorCode.PAYMENT_CANCELLED) {
                if (this.onError) this.onError(`Store Error: ${getIapErrorMessage(error)}`);
            }
        });

        // 3. Initialize Store
        this.initializationPromise = Promise.resolve(store.initialize())
            .then(async (errors: any[]) => {
                if (Array.isArray(errors) && errors.length > 0) {
                    logIapJson("IAP: Store initialization returned errors", {
                        errors: errors.map(error => ({
                            code: error?.code || null,
                            message: getIapErrorMessage(error, "Store initialization failed"),
                            platform: error?.platform || null,
                            productId: error?.productId || null,
                        })),
                    });
                    this.onError?.("Google Play Billing could not connect. Please check Play Store and try again.");
                    return;
                }

                this.isInitialized = true;
                console.log("IAP: Store initialized");
                try {
                    await store.update();
                } catch (error) {
                    logIapJson("IAP: Initial store refresh failed", {
                        code: (error as any)?.code || null,
                        message: getIapErrorMessage(error, "Store refresh failed"),
                    });
                }
                this.products = Array.isArray(store.products) ? store.products : [];
            })
            .catch((error: any) => {
                this.isInitialized = false;
                logIapJson("IAP: Store initialization failed", {
                    code: error?.code || null,
                    message: getIapErrorMessage(error, "Store initialization failed"),
                });
                this.onError?.("Google Play Billing could not connect. Please check Play Store and try again.");
            });
    }

    async purchase(plan: 'WEEKLY' | 'MONTHLY', ownerUserId?: string | null): Promise<boolean> {
        if (!canUseNativeIap()) {
            console.warn("IAP: Cannot purchase on web.");
            return false;
        }

        const normalizedOwnerUserId = typeof ownerUserId === 'string' ? ownerUserId.trim() : '';
        if (!normalizedOwnerUserId) {
            console.warn("IAP: Cannot purchase without a logged-in app account owner.");
            this.onError?.("Please sign in again before subscribing.");
            return false;
        }

        if (this.purchaseInProgress) {
            this.onError?.("A purchase is already in progress.");
            return false;
        }

        this.purchaseInProgress = true;

        let accountBinding: string;
        try {
            accountBinding = await this.getAccountBinding(normalizedOwnerUserId);
        } catch (error) {
            this.onError?.(getIapErrorMessage(error, "Could not prepare your account for purchase."));
            this.purchaseInProgress = false;
            return false;
        }

        const CdvPurchase = getCdvPurchase();
        const { store } = CdvPurchase;
        const isIOS = Capacitor.getPlatform() === 'ios';
        const config = plan === 'WEEKLY' ? IAP_CONFIG.WEEKLY : IAP_CONFIG.MONTHLY;

        const productId = isIOS ? config.iosId : config.androidId;
        const basePlanId = isIOS ? null : config.androidBasePlanId;
        this.pendingPlan = plan;
        this.activeIntent = 'purchase';
        this.currentUserId = normalizedOwnerUserId;
        this.currentAccountBinding = accountBinding;

        logIapJson("IAP: Attempting purchase", {
            productId,
            basePlanId: basePlanId || null,
            plan,
            ownerUserId: normalizedOwnerUserId,
        });

        let product: any;
        try {
            product = await this.waitForProduct(store, productId, basePlanId);
        } catch (error) {
            logIapJson("IAP: Failed while waiting for the selected product", {
                code: (error as any)?.code || null,
                message: getIapErrorMessage(error, "Billing plan unavailable"),
                productId,
                basePlanId,
            });
            this.pendingPlan = null;
            this.activeIntent = null;
            this.purchaseInProgress = false;
            this.onError?.("Billing plan unavailable. Open Google Play, check your connection, then try again.");
            return false;
        }

        if (!this.isInitialized || !product) {
            console.warn("IAP: Store or selected product did not become ready.");
            this.pendingPlan = null;
            this.activeIntent = null;
            this.purchaseInProgress = false;
            if (this.onError) {
                this.onError("Billing plan unavailable. Open Google Play, check your connection, then try again.");
            }
            return false;
        }

        if (product && product.canPurchase) {
            try {
                let orderError: any;
                if (basePlanId) {
                    const offer = getExactAndroidOffer(product, basePlanId);
                    if (offer) {
                        orderError = await offer.order();
                    } else {
                        throw new Error("The selected subscription plan is unavailable. Please refresh the store and try again.");
                    }
                } else {
                    const offer = product.getOffer();
                    if (offer) {
                        orderError = await offer.order();
                    } else {
                        throw new Error("The selected subscription plan is unavailable. Please refresh the store and try again.");
                    }
                }
                throwIfStoreError(orderError);
                return true;
            } catch (err: any) {
                logIapJson("IAP: Order failed", {
                    code: err?.code,
                    message: err?.message,
                    name: err?.name,
                    pendingPlan: this.pendingPlan,
                    activeIntent: this.activeIntent,
                    ownerUserId: normalizedOwnerUserId,
                });
                this.pendingPlan = null;
                this.activeIntent = null;
                if (this.onError) this.onError(getIapErrorMessage(err));
                return false;
            } finally {
                this.purchaseInProgress = false;
            }
        } else {
            this.pendingPlan = null;
            this.activeIntent = null;
            this.purchaseInProgress = false;

            if (product) {
                this.onError?.("This Play account may already own Premium. Restoring the subscription now.");
                await this.restore(normalizedOwnerUserId);
            } else {
                this.onError?.("Billing plan unavailable. Open Google Play, check your connection, then try again.");
            }
            return false;
        }
    }

    async restore(ownerUserId?: string | null) {
        if (!canUseNativeIap()) return;
        const normalizedOwnerUserId = typeof ownerUserId === 'string' ? ownerUserId.trim() : '';
        if (!normalizedOwnerUserId) {
            this.onError?.("Please sign in again before restoring purchases.");
            return;
        }

        const CdvPurchase = getCdvPurchase();
        try {
            const accountBinding = await this.getAccountBinding(normalizedOwnerUserId);
            this.activeIntent = 'restore';
            this.currentUserId = normalizedOwnerUserId;
            this.currentAccountBinding = accountBinding;
            await CdvPurchase.store.restore();
            await CdvPurchase.store.update();
        } catch (e) {
            logIapJson("IAP: Restore failed", {
                code: (e as any)?.code,
                message: (e as any)?.message,
                name: (e as any)?.name,
                activeIntent: this.activeIntent,
                ownerUserId: this.currentUserId,
            });
            this.activeIntent = null;
        }
    }

    getPrice(plan: 'WEEKLY' | 'MONTHLY'): string | null {
        if (!canUseNativeIap()) return null;

        const isIOS = Capacitor.getPlatform() === 'ios';
        const config = plan === 'WEEKLY' ? IAP_CONFIG.WEEKLY : IAP_CONFIG.MONTHLY;

        const productId = isIOS ? config.iosId : config.androidId;
        const basePlanId = isIOS ? null : config.androidBasePlanId;

        const product = this.products.find((p: any) => p.id === productId);
        if (!product) return null;

        if (basePlanId) {
            const offer = getExactAndroidOffer(product, basePlanId);
            if (offer && offer.pricingPhases && offer.pricingPhases.length > 0) {
                return offer.pricingPhases[0].price;
            }
            return null;
        }
        return product.offers?.[0]?.pricingPhases?.[0]?.price || null;
    }

    clearUser() {
        this.pendingPlan = null;
        this.activeIntent = null;
        this.currentUserId = null;
        this.currentAccountBinding = null;
        this.lastApprovedTransaction = null;
        this.purchaseInProgress = false;
    }

    private async waitForProduct(store: any, productId: string, basePlanId: string | null): Promise<any | null> {
        const deadline = Date.now() + 10000;
        let refreshed = false;

        while (Date.now() < deadline) {
            if (this.initializationPromise && !this.isInitialized) {
                await this.initializationPromise;
            }

            if (this.isInitialized && !refreshed) {
                refreshed = true;
                try {
                    await store.update();
                } catch (error) {
                    logIapJson("IAP: Store refresh failed before purchase", {
                        code: (error as any)?.code || null,
                        message: getIapErrorMessage(error, "Store refresh failed"),
                    });
                }
            }

            this.products = Array.isArray(store.products) ? store.products : this.products;
            const product = store.get(productId) || this.products.find((item: any) => item?.id === productId);
            const hasRequestedOffer = !basePlanId || Boolean(getExactAndroidOffer(product, basePlanId));

            if (product && hasRequestedOffer) {
                return product;
            }

            await delay(250);
        }

        return null;
    }

    private async getAccountBinding(ownerUserId: string): Promise<string> {
        if (!supabase) {
            throw new Error("Login system is not ready. Please restart the app.");
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token || session.user.id !== ownerUserId) {
            throw new Error("Please sign in again before purchasing.");
        }

        const response = await fetch(getApiUrl('/api/iap-account-binding'), {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${session.access_token}`,
            },
        });
        const payload = await response.json().catch(() => null);
        const accountBinding = typeof payload?.accountBinding === 'string' ? payload.accountBinding.trim() : '';

        if (!response.ok || !accountBinding) {
            throw new Error(payload?.error || "Could not prepare purchase account binding.");
        }

        return accountBinding;
    }
}

export default new IAPService();
