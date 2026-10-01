import { Capacitor, registerPlugin } from '@capacitor/core';
import { AdMobService } from './admobService';
import { BANNER_HEIGHT, BANNER_WIDTH } from './nativeBannerService';

// Keep the bridge name compatible with APKs which already expose bottom insets.
const BottomNavigationInset = registerPlugin<{
    getBannerGeometry(): Promise<{ density: number; webViewOffsetDp: number; bottomInsetDp: number; widthDp?: number; heightDp?: number }>;
    setBannerPosition(options: { margin: number }): Promise<{ updated: boolean }>;
}>('BottomNavigationInset');

export const calculateBannerMargin = (
    topCss: number,
    pixelRatio: number,
    density: number,
    webViewOffsetDp: number,
) => Math.max(0, Math.round(topCss * pixelRatio / density + webViewOffsetDp));

export const getBannerPlacement = async (anchor: HTMLElement) => {
    let density = window.devicePixelRatio || 1;
    let webViewOffsetDp = 0;
    let bottomInsetDp = 48;
    if (Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('BottomNavigationInset')) {
        try {
            const geometry = await AdMobService.withNativeTimeout('Banner geometry', BottomNavigationInset.getBannerGeometry(), 1500);
            if (Number.isFinite(geometry.density) && geometry.density > 0) density = geometry.density;
            if (Number.isFinite(geometry.webViewOffsetDp)) webViewOffsetDp = geometry.webViewOffsetDp;
            if (Number.isFinite(geometry.bottomInsetDp)) bottomInsetDp = Math.max(0, geometry.bottomInsetDp);
        } catch {
            // Older APKs use CSS coordinates until their native bridge is updated.
        }
    }
    const pixelRatio = window.devicePixelRatio || 1;
    const dpToCss = density / pixelRatio;
    const viewportWidthDp = Math.floor((window.innerWidth || anchor.getBoundingClientRect().width || BANNER_WIDTH) / dpToCss);
    return {
        margin: calculateBannerMargin(anchor.getBoundingClientRect().top, pixelRatio, density, webViewOffsetDp),
        bottomInsetCss: bottomInsetDp * density / pixelRatio,
        dpToCss,
        viewportWidthDp,
        widthDp: BANNER_WIDTH,
        heightDp: BANNER_HEIGHT,
    };
};

export const moveNativeBanner = async (margin: number): Promise<boolean> => {
    if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('BottomNavigationInset')) return false;
    try {
        const result = await AdMobService.withNativeTimeout('Banner position', BottomNavigationInset.setBannerPosition({ margin }), 1500);
        return result.updated;
    } catch {
        return false;
    }
};
