import React, { useEffect, useState } from 'react';
import { App as CapacitorApp } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import type { PluginListenerHandle } from '@capacitor/core';
import { NativeBannerController, type BannerMode } from '../services/nativeBannerService';
import { canUseNativeAdMob, canUseNativeAppEvents, canUseNativeKeyboard } from '../services/nativeCapabilities';

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
let slotObserver: ((height: number) => void) | null = null;
let consentObserver: ((required: boolean) => void) | null = null;

const reserveSlot = (height: number) => {
    document.documentElement.style.setProperty('--native-banner-height', `${height}px`);
    document.documentElement.classList.toggle('native-banner-active', height > 0);
    slotObserver?.(height);
};

const NativeBanner: React.FC<NativeBannerProps> = ({ adId, enabled, suspended, onConsentReady }) => {
    const [slotHeight, setSlotHeight] = useState(0);
    const [foreground, setForeground] = useState(() => document.visibilityState !== 'hidden');
    const [keyboardOpen, setKeyboardOpen] = useState(false);
    const [editing, setEditing] = useState(false);
    const native = canUseNativeAdMob();
    const mode: BannerMode = !enabled ? 'removed' : suspended || !foreground || keyboardOpen || (!canUseNativeKeyboard() && editing) ? 'hidden' : 'visible';

    useEffect(() => {
        if (!native) return;
        slotObserver = setSlotHeight;
        consentObserver = onConsentReady;
        controller ??= new NativeBannerController(adId, reserveSlot, required => consentObserver?.(required));
        return () => {
            slotObserver = null;
            consentObserver = null;
            void controller?.setMode('removed');
        };
    }, [adId, native, onConsentReady]);

    useEffect(() => {
        if (native) void controller?.setMode(mode);
    }, [mode, native]);

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
        const onFocus = () => {
            const active = document.activeElement;
            setEditing(active instanceof HTMLElement && (active.matches('input, textarea, select') || active.isContentEditable));
        };
        document.addEventListener('visibilitychange', onVisibility);
        document.addEventListener('focusin', onFocus);
        document.addEventListener('focusout', onFocus);
        if (canUseNativeAppEvents()) {
            track(CapacitorApp.addListener('appStateChange', ({ isActive }) => setForeground(isActive)));
            void CapacitorApp.getState().then(({ isActive }) => {
                if (!cancelled) setForeground(isActive);
            }).catch(() => {});
        }
        if (canUseNativeKeyboard()) {
            track(Keyboard.addListener('keyboardWillShow', () => setKeyboardOpen(true)));
            track(Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true)));
            track(Keyboard.addListener('keyboardDidHide', () => { setKeyboardOpen(false); onFocus(); }));
        }
        onFocus();
        return () => {
            cancelled = true;
            listeners.forEach(listener => { void listener.remove(); });
            document.removeEventListener('visibilitychange', onVisibility);
            document.removeEventListener('focusin', onFocus);
            document.removeEventListener('focusout', onFocus);
        };
    }, [native]);

    return native && slotHeight > 0 ? <div aria-hidden="true" className="native-banner-dock" /> : null;
};

export default NativeBanner;
