
import 'cordova-plugin-purchase';
import { Capacitor } from '@capacitor/core';

// Access the global CdvPurchase object attached by the plugin.
// Provide a robust mock for Web/Dev environments.
const CdvPurchase = (window as any).CdvPurchase || {
    ProductType: { PAID_SUBSCRIPTION: 'paid subscription' },
    Platform: { GOOGLE_PLAY: 'google-play', APPLE_APPSTORE: 'apple-appstore' },
    ErrorCode: { PAYMENT_CANCELLED: 6777006 },
    store: {
        register: () => {},
        when: () => ({ 
            approved: () => {}, 
            verified: () => ({ finish: () => {} }), 
            finished: () => {}, 
            productUpdated: () => {} 
        }),
        initialize: async () => {},
        get: () => null,
        restore: async () => {},
        products: [],
        error: () => {}
    }
};

/**
 * IN-APP PURCHASE CONFIGURATION
 */
export const IAP_CONFIG = {
    WEEKLY: {
        alias: 'weekly_sub', 
        androidId: 'godmode',               
        androidBasePlanId: 'godmode4-99',   
        iosId: 'godmode4-99',               
        type: CdvPurchase.ProductType.PAID_SUBSCRIPTION
    },
    MONTHLY: {
        alias: 'monthly_sub',
        androidId: 'godmode',               
        androidBasePlanId: 'godmode15-99',  
        iosId: 'godmode15-99',              
        type: CdvPurchase.ProductType.PAID_SUBSCRIPTION
    }
};

class IAPService {
    isInitialized = false;
    products: any[] = []; 
    
    // Callbacks to update UI/DB
    onSuccess: (() => void) | null = null;
    onError: ((msg: string) => void) | null = null;

    initialize(onSuccess: () => void, onError: (msg: string) => void) {
        // ALWAYS update callbacks to ensure we use the latest closures/state from React
        this.onSuccess = onSuccess;
        this.onError = onError;

        if (!Capacitor.isNativePlatform()) {
            console.log("IAP: Not native platform, skipping initialization.");
            return;
        }

        if (this.isInitialized) return;

        const { store, Platform } = CdvPurchase;

        // 1. Prepare Registration List
        const productsToRegister: any[] = [];
        const registeredIds = new Set<string>();

        const addProduct = (id: string, type: string, platform: string) => {
            const key = `${platform}_${id}`;
            if (!registeredIds.has(key)) {
                productsToRegister.push({ id, type, platform });
                registeredIds.add(key);
            }
        };

        // Android Weekly & Monthly
        addProduct(IAP_CONFIG.WEEKLY.androidId, IAP_CONFIG.WEEKLY.type, Platform.GOOGLE_PLAY);
        addProduct(IAP_CONFIG.MONTHLY.androidId, IAP_CONFIG.MONTHLY.type, Platform.GOOGLE_PLAY);
        // iOS Weekly & Monthly
        addProduct(IAP_CONFIG.WEEKLY.iosId, IAP_CONFIG.WEEKLY.type, Platform.APPLE_APPSTORE);
        addProduct(IAP_CONFIG.MONTHLY.iosId, IAP_CONFIG.MONTHLY.type, Platform.APPLE_APPSTORE);

        store.register(productsToRegister);

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
            this.products = store.products;
        });

        store.error((error: any) => {
            console.error('IAP Error:', error);
            if (error.code !== CdvPurchase.ErrorCode.PAYMENT_CANCELLED) {
                 if (this.onError) this.onError(`Store Error: ${error.message}`);
            }
        });

        // 3. Refresh Store
        store.initialize().then(() => {
            this.isInitialized = true;
            console.log("IAP: Store initialized");
        });
    }

    async purchase(plan: 'WEEKLY' | 'MONTHLY') {
        if (!Capacitor.isNativePlatform()) {
            console.warn("IAP: Cannot purchase on web.");
            return;
        }
        
        const { store } = CdvPurchase;
        const isIOS = Capacitor.getPlatform() === 'ios';
        const config = plan === 'WEEKLY' ? IAP_CONFIG.WEEKLY : IAP_CONFIG.MONTHLY;
        
        const productId = isIOS ? config.iosId : config.androidId;
        const basePlanId = isIOS ? null : config.androidBasePlanId;

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
            console.error("IAP Product not found:", productId);
            if (this.onError) this.onError("Store not ready. Please try again.");
        }
    }

    async restore() {
        if (!Capacitor.isNativePlatform()) return;
        try {
            await CdvPurchase.store.restore();
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
