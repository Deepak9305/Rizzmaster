import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import { canUseNativeAppEvents } from './nativeCapabilities';

// A visible WebView does not necessarily mean its native Activity is active.
// Treat these signals independently, and ignore an old getState response if a
// newer appStateChange has already arrived while crossing the native bridge.
export const observeBannerForeground = (onChange: (foreground: boolean) => void): (() => void) => {
    let cancelled = false;
    let nativeActive = true;
    let nativeRevision = 0;
    let listener: PluginListenerHandle | null = null;
    const notify = () => {
        if (!cancelled) onChange(nativeActive && document.visibilityState !== 'hidden');
    };
    const removeListener = (handle: PluginListenerHandle) => {
        void Promise.resolve().then(() => handle.remove()).catch(error => {
            console.warn('[AdMob] Banner lifecycle listener cleanup failed:', error);
        });
    };
    document.addEventListener('visibilitychange', notify);
    notify();
    if (canUseNativeAppEvents()) {
        const revision = nativeRevision;
        void CapacitorApp.addListener('appStateChange', ({ isActive }) => {
            if (cancelled) return;
            ++nativeRevision;
            nativeActive = isActive;
            notify();
        }).then(handle => {
            if (cancelled) removeListener(handle);
            else listener = handle;
        }).catch(error => console.warn('[AdMob] Banner lifecycle listener unavailable:', error));
        void CapacitorApp.getState().then(({ isActive }) => {
            if (cancelled || revision !== nativeRevision) return;
            nativeActive = isActive;
            notify();
        }).catch(error => console.warn('[AdMob] Banner foreground state unavailable:', error));
    }
    return () => {
        cancelled = true;
        document.removeEventListener('visibilitychange', notify);
        if (listener) removeListener(listener);
    };
};
