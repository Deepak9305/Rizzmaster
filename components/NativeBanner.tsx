import React, { useEffect, useLayoutEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { NativeBannerController, type BannerMode, type BannerDimensions } from '../services/nativeBannerService';
import { getBannerPlacement, moveNativeBanner } from '../services/bottomNavigationInset';
import { canUseNativeAdMob, canUseNativeAppEvents } from '../services/nativeCapabilities';

interface NativeBannerProps {
    adId: string;
    enabled: boolean;
    suspended: boolean;
    onConsentReady: (required: boolean) => void;
}

// One owner of the native view across React StrictMode's effect replay. Keeping
// its listeners for the WebView lifetime avoids duplicate callbacks and races
// between an old owner's removal and a new owner's show call.
let controller: NativeBannerController | null = null;
let consentObserver: ((required: boolean) => void) | null = null;
let bannerSize: BannerDimensions | undefined;
let dpToCss = 1;

const applyBannerSize = (width: number, height: number) => {
    document.documentElement.style.setProperty('--native-banner-width', `${width * dpToCss}px`);
    document.documentElement.style.setProperty('--native-banner-height', `${height * dpToCss}px`);
};

const reserveSlot = (height: number) => {
    document.documentElement.classList.toggle('native-banner-active', height > 0);
};

const NativeBanner: React.FC<NativeBannerProps> = ({ adId, enabled, suspended, onConsentReady }) => {
    const [foreground, setForeground] = useState(() => document.visibilityState !== 'hidden');
    const native = canUseNativeAdMob();
    const mode: BannerMode = !enabled ? 'removed' : suspended || !foreground ? 'hidden' : 'visible';

    useLayoutEffect(() => {
        if (!native) return;
        // Reserve space before paint, independently of network/consent/native
        // view state. Opening the keyboard or a modal must not jump the page.
        document.documentElement.classList.toggle('native-banner-enabled', enabled);
        return () => document.documentElement.classList.remove('native-banner-enabled');
    }, [enabled, native]);

    useEffect(() => {
        if (!native) return;
        consentObserver = onConsentReady;
    }, [native, onConsentReady]);

    useEffect(() => {
        if (!native) return;
        return () => {
            consentObserver = null;
            void controller?.setMode('removed');
        };
    }, [native]);

    useEffect(() => {
        if (!native) return;
        if (mode !== 'visible') {
            void controller?.setMode(mode);
            return;
        }
        let cancelled = false;
        let frame = 0;
        let version = 0;
        const measure = async (measurement: number) => {
            const anchor = document.querySelector('.native-banner-anchor');
            if (!(anchor instanceof HTMLElement) || !anchor.getBoundingClientRect().height) return;
            const placement = await getBannerPlacement(anchor, bannerSize);
            if (cancelled || measurement !== version) return;
            document.documentElement.style.setProperty('--native-navigation-inset', `${placement.bottomInsetCss}px`);
            dpToCss = placement.dpToCss;
            applyBannerSize(placement.widthDp, placement.heightDp);
            controller ??= new NativeBannerController(adId, placement.margin, reserveSlot, required => consentObserver?.(required), moveNativeBanner, size => {
                bannerSize = size;
                applyBannerSize(size.width, size.height);
            });
            await controller.setTopMargin(placement.margin, placement.widthDp);
            if (!cancelled && measurement === version) await controller.setMode('visible');
        };
        const schedule = () => {
            const measurement = ++version;
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => { void measure(measurement); });
        };
        const header = document.querySelector('.web-app-sticky-header');
        const observer = new ResizeObserver(schedule);
        if (header) observer.observe(header);
        window.addEventListener('resize', schedule);
        window.visualViewport?.addEventListener('resize', schedule);
        void document.fonts.ready.then(() => { if (!cancelled) schedule(); });
        schedule();
        return () => {
            cancelled = true;
            cancelAnimationFrame(frame);
            observer.disconnect();
            window.removeEventListener('resize', schedule);
            window.visualViewport?.removeEventListener('resize', schedule);
        };
    }, [adId, mode, native]);

    useEffect(() => {
        if (!native) return;
        let cancelled = false;
        const listeners: PluginListenerHandle[] = [];
        const track = (registration: Promise<PluginListenerHandle>) => {
            void registration.then(listener => {
                if (cancelled) void listener.remove();
                else listeners.push(listener);
            }).catch(error => console.warn('[AdMob] Banner lifecycle listener unavailable:', error));
        };
        const onVisibility = () => setForeground(document.visibilityState !== 'hidden');
        document.addEventListener('visibilitychange', onVisibility);
        if (canUseNativeAppEvents()) {
            track(CapacitorApp.addListener('appStateChange', ({ isActive }) => setForeground(isActive)));
            void CapacitorApp.getState().then(({ isActive }) => {
                if (!cancelled) setForeground(isActive);
            }).catch(() => {});
        }
        return () => {
            cancelled = true;
            listeners.forEach(listener => { void listener.remove(); });
            document.removeEventListener('visibilitychange', onVisibility);
        };
    }, [native]);

    return null;
};

export default NativeBanner;
