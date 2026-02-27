
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

/**
 * Native Bridge Service
 * Optimized with capability caching and robust fallbacks.
 */

// Singleton to cache capabilities after first check
let cachedCaps: { hasWebShare: boolean; hasClipboard: boolean; hasVibrate: boolean; isNative: boolean } | null = null;

const getCapabilities = () => {
  if (cachedCaps) return cachedCaps;
  try {
    cachedCaps = {
      hasWebShare: typeof navigator !== 'undefined' && !!navigator.share,
      hasClipboard: typeof navigator !== 'undefined' && !!navigator.clipboard,
      hasVibrate: typeof navigator !== 'undefined' && !!navigator.vibrate,
      isNative: typeof Capacitor !== 'undefined' ? Capacitor.isNativePlatform() : false
    };
  } catch (e) {
    console.warn('[NativeBridge] Capability check failed:', e);
    // Return safe defaults but don't cache error state to allow retry
    return { hasWebShare: false, hasClipboard: false, hasVibrate: false, isNative: false };
  }
  return cachedCaps;
};

// Helper to detect user cancellation errors
const isCancelled = (err: any) => {
    const msg = err?.message?.toLowerCase() || '';
    return msg.includes('cancel') || msg.includes('dismiss') || err?.name === 'AbortError';
};

export const NativeBridge = {
  /**
   * Triggers haptic feedback with optimized patterns.
   */
  haptic: (type: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') => {
    const { hasVibrate } = getCapabilities();
    if (!hasVibrate) return;

    try {
      // Navigator.vibrate automatically cancels previous vibrations
      switch (type) {
        case 'light': navigator.vibrate(10); break;
        case 'medium': navigator.vibrate(25); break;
        case 'heavy': navigator.vibrate(50); break;
        case 'success': navigator.vibrate([10, 40, 10]); break;
        case 'error': navigator.vibrate([60, 40, 60]); break;
      }
    } catch { /* Silent fail */ }
  },

  /**
   * Share content with a prioritized, cached capability flow.
   */
  share: async (title: string, text: string, url?: string): Promise<'SHARED' | 'COPIED' | 'DISMISSED' | 'FAILED'> => {
    if (!text && !url) return 'FAILED';

    const { isNative, hasWebShare } = getCapabilities();
    const shareData = { title: title || 'Rizz Master', text: text || '', url: url || '', dialogTitle: 'Share' };

    // Strategy 1: Native Plugin (Preferred for App)
    // Handles native intents better than WebView navigator.share
    if (isNative) {
      try {
        await Share.share(shareData);
        return 'SHARED';
      } catch (err: any) {
        if (isCancelled(err)) return 'DISMISSED';
        console.warn('[NativeBridge] Native share failed, trying fallbacks:', err);
      }
    }

    // Strategy 2: Web Share API (Preferred for Mobile Web)
    if (hasWebShare) {
      try {
        if (navigator.canShare && !navigator.canShare(shareData)) throw new Error('Invalid share data');
        
        // Race against a timeout to prevent hanging
        await Promise.race([
            navigator.share(shareData),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
        ]);
        return 'SHARED';
      } catch (err: any) {
        if (isCancelled(err)) return 'DISMISSED';
        console.warn('[NativeBridge] Web share failed:', err);
      }
    }

    // Strategy 3: Clipboard Fallback (Universal)
    const contentToCopy = url ? `${text}\n${url}` : text;
    const success = await NativeBridge.copyToClipboard(contentToCopy);
    return success ? 'COPIED' : 'FAILED';
  },

  /**
   * Optimized Clipboard copy with modern-first approach.
   */
  copyToClipboard: async (text: string): Promise<boolean> => {
    if (!text) return false;
    const { hasClipboard } = getCapabilities();

    // Try Modern API
    if (hasClipboard) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch { /* Fallthrough to legacy */ }
    }

    // Legacy Fallback
    try {
      const el = document.createElement("textarea");
      el.value = text;
      // Use cssText for faster style application
      el.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
      
      document.body.appendChild(el);
      el.focus();
      el.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(el);
      return successful;
    } catch (err) {
      console.error('[NativeBridge] Clipboard fallback failed:', err);
      return false;
    }
  }
};


