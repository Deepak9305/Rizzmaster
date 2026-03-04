
/**
 * Native Bridge Service
 * 
 * Abstraction layer to handle features that might use Native Plugins (Capacitor/Cordova)
 * or fallback to standard Web APIs.
 */
import { Share } from '@capacitor/share';

export const NativeBridge = {
  /**
   * Triggers haptic feedback.
   * Uses navigator.vibrate for web, but Capacitor Haptics plugin would override this behavior in native.
   * Type: 'light' | 'medium' | 'heavy' | 'success' | 'error'
   */
  haptic: (type: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') => {
    // Check for Capacitor global object if you were using the plugin directly
    // but navigator.vibrate is a great web fallback that many native wrappers polyfill.
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      switch (type) {
        case 'light': navigator.vibrate(10); break;
        case 'medium': navigator.vibrate(20); break;
        case 'heavy': navigator.vibrate(40); break;
        case 'success': navigator.vibrate([10, 30, 10]); break; // Pattern
        case 'error': navigator.vibrate([50, 30, 50, 30, 50]); break;
      }
    }
  },

  /**
   * Share content using the official Capacitor Share plugin.
   * Works reliably inside Capacitor's WebView on Android & iOS and falls back to Web Share API on web.
   * Falls back to copying to clipboard if sharing fails or is unavailable.
   * Returns a status string: 'SHARED' | 'COPIED' | 'DISMISSED' | 'FAILED'
   */
  share: async (title: string, text: string, url?: string): Promise<'SHARED' | 'COPIED' | 'DISMISSED' | 'FAILED'> => {
    if (!text && !url) {
      console.warn('Share called with empty text and url');
      return 'FAILED';
    }

    const contentToCopy = url ? `${text}\n${url}` : text;

    try {
      // 1. Try official Capacitor Share (handles Native Android/iOS seamlessly)
      const canShare = await Share.canShare();
      if (canShare.value) {
        const shareResult = await Share.share({
          title: title || 'Share',
          text: text || undefined,
          url: url || undefined,
          dialogTitle: 'Share with',
        });

        // Some platforms don't return accurate activityType when dismissed
        // But if it didn't throw, we assume it was processed
        return 'SHARED';
      }
    } catch (err: any) {
      if (err.message?.includes('cancel') || err.message?.includes('AbortError') || err.name === 'AbortError') {
        return 'DISMISSED';
      }
      console.warn('Capacitor Share failed, falling back to clipboard:', err);
    }

    // 2. Fallback: Copy to Clipboard
    const copied = await NativeBridge.copyToClipboard(contentToCopy);
    return copied ? 'COPIED' : 'FAILED';
  },

  /**
   * Copy to clipboard wrapper
   */
  copyToClipboard: async (text: string): Promise<boolean> => {
    try {
      // 1. Try modern clipboard API
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          return true;
        } catch (e) {
          console.warn("navigator.clipboard.writeText failed, falling back", e);
        }
      }

      // 2. Legacy fallback (execCommand)
      if (typeof document !== 'undefined') {
        const textArea = document.createElement("textarea");
        textArea.value = text;

        // Avoid scrolling to bottom
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";

        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          const successful = document.execCommand('copy');
          document.body.removeChild(textArea);
          return successful;
        } catch (err) {
          document.body.removeChild(textArea);
          console.error('Fallback: Oops, unable to copy', err);
          return false;
        }
      }
      return false;
    } catch (err) {
      console.error('Clipboard failed completely', err);
      return false;
    }
  }
};
