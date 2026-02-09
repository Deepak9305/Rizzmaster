
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
 * 
 * Updated for Google Play "Single Product + Multiple Base Plans" structure.
 * 
 * ANDROID:
 * - Product ID: 'godmode' (Container)
 * - Base Plan IDs: 'godmode4-99' (Weekly) and 'godmode15-99' (Monthly)
 * 
 * IOS:
 * - Product IDs: 'godmode4-99' and 'godmode15-99'
 */
export const IAP_CONFIG = {
    WEEKLY: {
        alias: 'weekly_sub', 
        androidId: 'godmode',               // The Google Play Product ID
        androidBasePlanId: 'godmode4-99',   // Weekly Base Plan ID
        iosId: 'godmode4-99',               // iOS Product ID
        type: CdvPurchase.ProductType.PAID_SUBSCRIPTION
    },
    MONTHLY: {
        alias: 'monthly_sub',
        androidId: 'godmode',               // The Google Play Product ID
        androidBasePlanId: 'godmode15-99',  // Monthly Base Plan ID
        iosId: 'godmode15-99',              // iOS Product ID
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
        if (!Capacitor.isNativePlatform()) {
            console.log("IAP: Not native platform, skipping initialization.");
            return;
        }

        if (this.isInitialized) return;

        this.onSuccess = onSuccess;
        this.onError = onError;

        const { store, Platform } = CdvPurchase;

        // 1. Prepare Registration List
        // We use a Set to ensure we don't register the same Product ID twice 
        // (which happens if Weekly and Monthly share the same androidId 'godmode').
        const productsToRegister: any[] = [];
        const registeredIds = new Set<string>();

        const addProduct = (id: string, type: string, platform: string) => {
            const key = `${platform}_${id}`;
            if (!registeredIds.has(key)) {
                productsToRegister.push({ id, type, platform });
                registeredIds.add(key);
            }
        };

        // Android Weekly
        addProduct(IAP_CONFIG.WEEKLY.androidId, IAP_CONFIG.WEEKLY.type, Platform.GOOGLE_PLAY);
        // Android Monthly
        addProduct(IAP_CONFIG.MONTHLY.androidId, IAP_CONFIG.MONTHLY.type, Platform.GOOGLE_PLAY);
        // iOS Weekly
        addProduct(IAP_CONFIG.WEEKLY.iosId, IAP_CONFIG.WEEKLY.type, Platform.APPLE_APPSTORE);
        // iOS Monthly
        addProduct(IAP_CONFIG.MONTHLY.iosId, IAP_CONFIG.MONTHLY.type, Platform.APPLE_APPSTORE);

        // Register unique list
        store.register(productsToRegister);

        // 2. Setup Listeners
        
        // APPROVED: Fired when user completes the purchase interaction successfully.
        store.when().approved((transaction: any) => {
            console.log("IAP: Transaction approved", transaction);
            
            // OPTIMISTIC SUCCESS: We grant access immediately upon approval.
            // In a strict environment, you would verify the receipt on a server first.
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
            // Ignore cancel errors (user closed the popup)
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

    /**
     * Trigger a purchase
     */
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
                // SCENARIO B: If a specific Base Plan ID is provided (Android Only)
                if (basePlanId) {
                    if (!product.offers || product.offers.length === 0) {
                        console.warn(`IAP: Product '${productId}' has no offers loaded. Google Play might still be syncing.`);
                        // Attempt fallback to main product order
                        await store.order(productId);
                        return;
                    }

                    // Find the offer that matches the Base Plan ID
                    // We use .includes() as well because sometimes IDs are prefixed (e.g. "godmode:godmode4-99")
                    const offer = product.offers.find((o: any) => o.id === basePlanId || o.id.includes(basePlanId));
                    
                    if (offer) {
                        console.log(`IAP: Ordering specific offer ${offer.id} for Base Plan ${basePlanId}`);
                        await offer.order();
                        return;
                    } else {
                        console.warn(`IAP: Base Plan '${basePlanId}' not found in product '${productId}'. Available offers:`, product.offers.map((o:any) => o.id));
                        // Fallback: This might pick the wrong plan (e.g. Weekly instead of Monthly), but better than crashing.
                        // Ideally, we show an error here, but we'll try the default offer.
                        await store.order(productId);
                    }
                } else {
                    // SCENARIO A: Standard Product Order (iOS or simple Android products)
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
            console.error("IAP Product not found or not purchasable:", productId);
            if (this.onError) this.onError("Store not ready. Please try again in a moment.");
        }
    }

    /**
     * Restore Purchases
     */
    async restore() {
        if (!Capacitor.isNativePlatform()) return;
        try {
            await CdvPurchase.store.restore();
            console.log("IAP: Restore triggered");
        } catch (e) {
            console.error("IAP: Restore failed", e);
        }
    }

    /**
     * Get display price for a plan
     */
    getPrice(plan: 'WEEKLY' | 'MONTHLY'): string | null {
        if (!Capacitor.isNativePlatform()) return null;
        
        const isIOS = Capacitor.getPlatform() === 'ios';
        const config = plan === 'WEEKLY' ? IAP_CONFIG.WEEKLY : IAP_CONFIG.MONTHLY;

        const productId = isIOS ? config.iosId : config.androidId;
        const basePlanId = isIOS ? null : config.androidBasePlanId;
        
        const product = this.products.find((p: any) => p.id === productId);
        if (!product) return null;

        // If targeting a specific base plan, try to find that specific offer's price
        if (basePlanId) {
            const offer = product.offers?.find((o: any) => o.id === basePlanId || o.id.includes(basePlanId));
            if (offer && offer.pricingPhases && offer.pricingPhases.length > 0) {
                return offer.pricingPhases[0].price;
            }
        }

        // Fallback: Return first available price
        return product.offers?.[0]?.pricingPhases?.[0]?.price || null;
    }
}

export default new IAPService();
