
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

/**
 * Native Bridge Service
 * Optimized with capability caching and robust fallbacks.
 */

// Lazy-load capabilities to prevent initialization crashes
const getCapabilities = () => {
  try {
    return {
      hasWebShare: typeof navigator !== 'undefined' && !!navigator.share,
      hasClipboard: typeof navigator !== 'undefined' && !!navigator.clipboard,
      hasVibrate: typeof navigator !== 'undefined' && !!navigator.vibrate,
      isNative: typeof Capacitor !== 'undefined' ? Capacitor.isNativePlatform() : false
    };
  } catch (e) {
    console.warn('[NativeBridge] Capability check failed:', e);
    return { hasWebShare: false, hasClipboard: false, hasVibrate: false, isNative: false };
  }
};

export const NativeBridge = {
  /**
   * Triggers haptic feedback with optimized patterns.
   */
  haptic: (type: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') => {
    const caps = getCapabilities();
    if (!caps.hasVibrate) return;

    try {
      switch (type) {
        case 'light': navigator.vibrate(10); break;
        case 'medium': navigator.vibrate(25); break;
        case 'heavy': navigator.vibrate(50); break;
        case 'success': navigator.vibrate([10, 40, 10]); break;
        case 'error': navigator.vibrate([60, 40, 60]); break;
      }
    } catch (e) {
      // Silent fail for haptics
    }
  },

  /**
   * Share content with a prioritized, cached capability flow.
   */
  share: async (title: string, text: string, url?: string): Promise<'SHARED' | 'COPIED' | 'DISMISSED' | 'FAILED'> => {
    if (!text && !url) return 'FAILED';

    const caps = getCapabilities();

    // Construct clean share data
    const shareData: any = {};
    if (title) shareData.title = title;
    if (text) shareData.text = text;
    if (url) shareData.url = url;

    // 1. Try Native Platform Plugin (Highest priority for iOS/Android apps)
    // We use the plugin because it handles native intents better than navigator.share in WebViews
    if (caps.isNative) {
      try {
        await Share.share({
          title: title || 'Rizz Master',
          text: text || '',
          url: url || '',
          dialogTitle: 'Share'
        });
        return 'SHARED';
      } catch (err: any) {
        const msg = err.message?.toLowerCase() || '';
        if (msg.includes('canceled') || msg.includes('dismissed') || err.name === 'AbortError') {
          return 'SHARED'; // Treat as shared for UX
        }
        console.warn('[NativeBridge] Capacitor Share failed:', err);
        // If native share fails (e.g. plugin not installed properly), we fall back
      }
    }

    // 2. Try Web Share API (Safest & Best for Modern Devices)
    if (caps.hasWebShare) {
      try {
        let canShare = true;
        if (typeof navigator.canShare === 'function') {
            try {
                canShare = navigator.canShare(shareData);
            } catch (e) {
                console.warn('[NativeBridge] canShare check failed:', e);
                canShare = true; // Try anyway if check fails
            }
        }

        if (canShare) {
            // Add a timeout to prevent freezing if the share sheet hangs
            const sharePromise = navigator.share(shareData);
            const timeoutPromise = new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Share operation timed out')), 3000)
            );
            
            await Promise.race([sharePromise, timeoutPromise]);
            return 'SHARED';
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return 'SHARED';
        console.warn('[NativeBridge] Web Share failed:', err);
        // Proceed to Clipboard fallback
      }
    }

    // 3. Final Fallback: Copy to Clipboard
    const contentToCopy = url ? `${text}\n${url}` : text;
    const copied = await NativeBridge.copyToClipboard(contentToCopy);
    return copied ? 'COPIED' : 'FAILED';
  },

  /**
   * Optimized Clipboard copy with modern-first approach.
   */
  copyToClipboard: async (text: string): Promise<boolean> => {
    if (!text) return false;
    const caps = getCapabilities();

    // 1. Modern API
    if (caps.hasClipboard) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (e) {
        console.warn("[NativeBridge] Clipboard API failed, using fallback");
      }
    }
    
    // 2. Legacy Fallback
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      Object.assign(textArea.style, {
        position: 'fixed',
        left: '-9999px',
        top: '0',
        opacity: '0'
      });
      
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      
      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      console.error('[NativeBridge] Clipboard fallback failed:', err);
      return false;
    }
  }
};


