import { Capacitor, registerPlugin } from '@capacitor/core';
import { AdMobService } from './admobService';

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

export const getBannerPlacement = async (anchor: HTMLElement, loadedSize?: { width: number; height: number }) => {
    let density = window.devicePixelRatio || 1;
    let webViewOffsetDp = 0;
    let bottomInsetDp = 48;
    let widthDp = 0;
    let heightDp = 0;
    if (Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('BottomNavigationInset')) {
        try {
            const geometry = await AdMobService.withNativeTimeout('Banner geometry', BottomNavigationInset.getBannerGeometry(), 1500);
            if (Number.isFinite(geometry.density) && geometry.density > 0) density = geometry.density;
            if (Number.isFinite(geometry.webViewOffsetDp)) webViewOffsetDp = geometry.webViewOffsetDp;
            if (Number.isFinite(geometry.bottomInsetDp)) bottomInsetDp = Math.max(0, geometry.bottomInsetDp);
            if (geometry.widthDp && Number.isFinite(geometry.widthDp) && geometry.widthDp > 0) widthDp = geometry.widthDp;
            if (geometry.heightDp && Number.isFinite(geometry.heightDp) && geometry.heightDp > 0) heightDp = geometry.heightDp;
        } catch {
            // Older APKs use CSS coordinates until their native bridge is updated.
        }
    }
    const pixelRatio = window.devicePixelRatio || 1;
    const dpToCss = density / pixelRatio;
    widthDp ||= Math.floor((window.innerWidth || anchor.getBoundingClientRect().width || 320) / dpToCss);
    // APKs without adaptive geometry reserve the standard maximum until the
    // SDK reports its size. Zero-size hide/failure events never collapse it.
    heightDp ||= loadedSize?.width === widthDp ? loadedSize.height : 90;
    return {
        margin: calculateBannerMargin(anchor.getBoundingClientRect().top, pixelRatio, density, webViewOffsetDp),
        bottomInsetCss: bottomInsetDp * density / pixelRatio,
        dpToCss,
        widthDp,
        heightDp,
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
