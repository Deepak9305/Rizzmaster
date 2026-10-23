import { Network, type ConnectionStatus } from '@capacitor/network';
import type { PluginListenerHandle } from '@capacitor/core';
import { observeBannerForeground } from './bannerLifecycle';

// Some networks can reach our HTTPS origin before Android's validation probe
// succeeds. Verify that case with one bounded, uncached same-origin request.
const canReachWebOrigin = async (signal: AbortSignal): Promise<boolean> => {
    if (location.protocol !== 'https:' || location.hostname === 'localhost') return false;
    try {
        const response = await fetch(new URL('/manifest.webmanifest', location.origin), {
            method: 'HEAD', cache: 'no-store', credentials: 'omit', redirect: 'error', signal,
        });
        return response.ok && /(?:manifest\+json|application\/json)/i.test(response.headers.get('content-type') ?? '');
    } catch { return false; }
};

export const observeNativeNetwork = (onChange: (connected: boolean) => void) => {
    let cancelled = false;
    let revision = 0;
    let listener: PluginListenerHandle | null = null;
    let probe: AbortController | null = null;
    let foreground = true;
    let refreshTask: Promise<void> | null = null;
    let refreshAfterResume = false;
    const remove = (handle: PluginListenerHandle) => {
        void Promise.resolve().then(() => handle.remove()).catch(error => console.warn('[Network] Listener cleanup failed:', error));
    };
    const apply = async (status: ConnectionStatus, version: number) => {
        if (cancelled || version !== revision) return;
        let connected = status.connected;
        if (!connected && status.connectionType !== 'none' && foreground) {
            const controller = new AbortController();
            probe = controller;
            const timeout = setTimeout(() => controller.abort(), 2500);
            try { connected = await canReachWebOrigin(controller.signal); }
            finally {
                clearTimeout(timeout);
                if (probe === controller) probe = null;
            }
        }
        if (!cancelled && version === revision) onChange(connected);
    };
    const refresh = (): Promise<void> => {
        if (cancelled) return Promise.resolve();
        if (refreshTask) return refreshTask;
        const version = ++revision;
        let timer: ReturnType<typeof setTimeout>;
        refreshTask = Promise.race([
            Network.getStatus(),
            new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Network state timed out')), 3000); }),
        ]).then(status => apply(status, version)).catch(error => console.warn('[Network] State check failed:', error))
            .finally(() => {
                clearTimeout(timer);
                refreshTask = null;
                if (refreshAfterResume && !cancelled && foreground) {
                    refreshAfterResume = false;
                    void refresh();
                }
            });
        return refreshTask;
    };
    void Network.addListener('networkStatusChange', status => {
        if (cancelled) return;
        probe?.abort();
        void apply(status, ++revision);
    }).then(handle => {
        if (cancelled) remove(handle);
        else listener = handle;
    }).catch(error => console.warn('[Network] Native listener unavailable:', error));
    const stopForeground = observeBannerForeground(active => {
        if (active && !foreground) {
            if (refreshTask) refreshAfterResume = true;
            else void refresh();
        }
        foreground = active;
        if (!active) {
            ++revision;
            probe?.abort();
        }
    });
    window.addEventListener('online', refresh);
    window.addEventListener('offline', refresh);
    void refresh();
    return {
        refresh,
        dispose() {
            cancelled = true;
            ++revision;
            probe?.abort();
            stopForeground();
            window.removeEventListener('online', refresh);
            window.removeEventListener('offline', refresh);
            if (listener) remove(listener);
        },
    };
};
