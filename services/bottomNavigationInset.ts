import { Capacitor, registerPlugin } from '@capacitor/core';

const BottomNavigationInset = registerPlugin<{
    getBottomInset(): Promise<{ inset: number }>;
}>('BottomNavigationInset');

// The community AdMob plugin applies Android's navigation inset itself on API
// 35+. Earlier Android versions need it included in the banner's bottom margin.
// Keep a conservative legacy fallback so the remotely loaded UI also repairs
// already-installed builds that do not yet have this bridge.
const LEGACY_NAVIGATION_FALLBACK = 48;

export const getBannerBottomMargin = async (): Promise<number> => {
    if (Capacitor.getPlatform() !== 'android') return 8;

    if (!Capacitor.isPluginAvailable('BottomNavigationInset')) {
        return LEGACY_NAVIGATION_FALLBACK + 8;
    }

    try {
        const { inset } = await BottomNavigationInset.getBottomInset();
        return Math.max(8, Math.round(inset) + 8);
    } catch (error) {
        console.warn('[AdMob] Could not read the navigation inset; using legacy banner margin.', error);
        return LEGACY_NAVIGATION_FALLBACK + 8;
    }
};
