import 'cordova-plugin-purchase';
import { Capacitor } from '@capacitor/core';

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
            register: () => {},
            when: () => ({ 
                approved: () => {}, 
                verified: () => ({ finish: () => {} }), 
                finished: () => {}, 
                productUpdated: () => {},
                updated: () => {}
            }),
            initialize: async () => {},
            update: async () => {},
            get: () => null,
            restore: async () => {},
            products: [],
            error: () => {},
            order: async () => {}
        }
    };
};

/**
 * IN-APP PURCHASE CONFIGURATION
 */
const getProductType = () => getCdvPurchase().ProductType.PAID_SUBSCRIPTION;

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
    
    // Callbacks to update UI/DB
    onSuccess: (() => void) | null = null;
    onError: ((msg: string) => void) | null = null;

    initialize(onSuccess: () => void, onError: (msg: string) => void) {
        this.onSuccess = onSuccess;
        this.onError = onError;

        if (!Capacitor.isNativePlatform()) {
            console.log("IAP: Not native platform, skipping initialization.");
            return;
        }

        if (this.isInitialized) return;

        const CdvPurchase = getCdvPurchase();
        if (!CdvPurchase) return; // Safety check

        const { store, Platform } = CdvPurchase;

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
        store.when().approved((transaction: any) => {
            console.log("IAP: Transaction approved", transaction);
            if (this.onSuccess) this.onSuccess();
            transaction.finish();
        });

        store.when().verified((receipt: any) => {
            console.log("IAP: Receipt verified", receipt);
            receipt.finish();
        });

        store.when().finished((transaction: any) => {
            console.log("IAP: Transaction finished", transaction);
        });

        store.when().productUpdated((product: any) => {
            console.log(`IAP: Product Updated: ${product.id} [${product.state}] CanPurchase: ${product.canPurchase}`);
            this.products = store.products;
        });

        store.when().updated((root: any) => {
            this.products = store.products;
        });

        store.error((error: any) => {
            console.error('IAP Error:', error);
            if (error && error.code !== CdvPurchase.ErrorCode.PAYMENT_CANCELLED) {
                 if (this.onError) this.onError(`Store Error: ${error.message}`);
            }
        });

        // 3. Initialize Store
        store.initialize().then(() => {
            this.isInitialized = true;
            console.log("IAP: Store initialized");
            store.update(); 
        });
    }

    async purchase(plan: 'WEEKLY' | 'MONTHLY') {
        if (!Capacitor.isNativePlatform()) {
            console.warn("IAP: Cannot purchase on web.");
            return;
        }
        
        const CdvPurchase = getCdvPurchase();
        const { store } = CdvPurchase;
        const isIOS = Capacitor.getPlatform() === 'ios';
        const config = plan === 'WEEKLY' ? IAP_CONFIG.WEEKLY : IAP_CONFIG.MONTHLY;
        
        const productId = isIOS ? config.iosId : config.androidId;
        const basePlanId = isIOS ? null : config.androidBasePlanId;

        console.log(`IAP: Attempting purchase for ${productId} (BasePlan: ${basePlanId || 'N/A'})`);

        if (!this.isInitialized) {
            await store.update();
        }

        const product = store.get(productId);

        if (product && product.canPurchase) {
            try {
                if (basePlanId) {
                    if (!product.offers || product.offers.length === 0) {
                        await store.order(productId);
                        return;
                    }

                    const offer = product.offers.find((o: any) => o.id === basePlanId || o.id.includes(basePlanId));
                    if (offer) {
                        await offer.order();
                    } else {
                        await store.order(productId);
                    }
                } else {
                    const offer = product.getOffer();
                    if (offer) {
                         await offer.order();
                    } else {
                         await store.order(productId);
                    }
                }
            } catch (err: any) {
                console.error("IAP: Order failed", err);
                if (this.onError) this.onError(err.message || "Purchase failed");
            }
        } else {
            store.update();
            if (this.onError) {
                 this.onError("Product unavailable. Retrying connection...");
            }
        }
    }

    async restore() {
        if (!Capacitor.isNativePlatform()) return;
        const CdvPurchase = getCdvPurchase();
        try {
            await CdvPurchase.store.restore();
            await CdvPurchase.store.update();
        } catch (e) {
            console.error("IAP: Restore failed", e);
        }
    }

    getPrice(plan: 'WEEKLY' | 'MONTHLY'): string | null {
        if (!Capacitor.isNativePlatform()) return null;
        
        const isIOS = Capacitor.getPlatform() === 'ios';
        const config = plan === 'WEEKLY' ? IAP_CONFIG.WEEKLY : IAP_CONFIG.MONTHLY;

        const productId = isIOS ? config.iosId : config.androidId;
        const basePlanId = isIOS ? null : config.androidBasePlanId;
        
        const product = this.products.find((p: any) => p.id === productId);
        if (!product) return null;

        if (basePlanId) {
            const offer = product.offers?.find((o: any) => o.id === basePlanId || o.id.includes(basePlanId));
            if (offer && offer.pricingPhases && offer.pricingPhases.length > 0) {
                return offer.pricingPhases[0].price;
            }
        }
        return product.offers?.[0]?.pricingPhases?.[0]?.price || null;
    }
}

export default new IAPService();