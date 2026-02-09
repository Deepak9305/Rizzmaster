
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
            productUpdated: () => {},
            updated: () => {}
        }),
        initialize: async () => {},
        update: async () => {},
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

        if (this.isInitialized) {
            // Even if initialized, refreshing callbacks is key. 
            // We might also want to trigger a refresh of products.
            return;
        }

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

        // Register products for both platforms to be safe, or conditionally based on OS
        // The plugin handles platform filtering, but being specific helps.
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

        // Track product updates to keep local cache sync
        store.when().productUpdated((product: any) => {
            console.log(`IAP: Product Updated: ${product.id} [${product.state}] CanPurchase: ${product.canPurchase}`);
            this.products = store.products;
        });

        store.when().updated((root: any) => {
            // General store update
            this.products = store.products;
        });

        store.error((error: any) => {
            console.error('IAP Error:', error);
            // Ignore cancel errors (user closed modal)
            if (error.code !== CdvPurchase.ErrorCode.PAYMENT_CANCELLED) {
                 // Only show toast for actual errors
                 if (this.onError) this.onError(`Store Error: ${error.message}`);
            }
        });

        // 3. Initialize Store
        store.initialize().then(() => {
            this.isInitialized = true;
            console.log("IAP: Store initialized");
            // Force a refresh to pull latest prices/validity
            store.update(); 
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

        console.log(`IAP: Attempting purchase for ${productId} (BasePlan: ${basePlanId || 'N/A'})`);

        // Check if store is ready
        if (!this.isInitialized) {
            console.warn("IAP: Store not initialized yet, attempting to update...");
            await store.update();
        }

        const product = store.get(productId);

        if (product && product.canPurchase) {
            try {
                if (basePlanId) {
                    // Android Subscriptions with Base Plans
                    if (!product.offers || product.offers.length === 0) {
                        // Fallback if offers aren't loaded yet
                        console.log("IAP: No offers found, ordering product directly.");
                        await store.order(productId);
                        return;
                    }

                    // Find specific offer
                    const offer = product.offers.find((o: any) => o.id === basePlanId || o.id.includes(basePlanId));
                    if (offer) {
                        console.log(`IAP: Ordering offer ${offer.id}`);
                        await offer.order();
                    } else {
                        console.warn(`IAP: Offer ${basePlanId} not found, ordering default product.`);
                        await store.order(productId);
                    }
                } else {
                    // iOS or Simple Android Product
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
            // Diagnostics
            if (!product) {
                console.error(`IAP: Product ${productId} NOT FOUND in store. Check console for 'register' calls.`);
            } else {
                console.error(`IAP: Product ${productId} found but cannot purchase. State: ${product.state}, Valid: ${product.valid}`);
            }
            
            // Force update for next attempt
            store.update();

            if (this.onError) {
                 this.onError("Store not connected or product unavailable. Retrying connection...");
            }
        }
    }

    async restore() {
        if (!Capacitor.isNativePlatform()) return;
        try {
            console.log("IAP: Restoring purchases...");
            await CdvPurchase.store.restore();
            // Force update to refresh state
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
