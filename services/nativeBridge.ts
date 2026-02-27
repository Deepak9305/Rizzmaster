
import { Share } from '@capacitor/share';
import { Capacitor } from '@capacitor/core';

/**
 * Native Bridge Service
 * 
 * Abstraction layer to handle features that might use Native Plugins (Capacitor/Cordova)
 * or fallback to standard Web APIs.
 */

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
   * Share content using native share sheet if available
   * Returns a status string: 'SHARED', 'COPIED', 'DISMISSED', 'FAILED'
   */
  share: async (title: string, text: string, url?: string): Promise<'SHARED' | 'COPIED' | 'DISMISSED' | 'FAILED'> => {
    if (!text && !url) return 'FAILED';

    const shareData = {
      title: title || 'Rizz Master',
      text: text || '',
      url: url || ''
    };

    // 1. Try Native Web Share API FIRST (Most reliable in modern browsers)
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        // Check if the browser actually thinks it can share this data
        if (navigator.canShare && navigator.canShare(shareData)) {
            await navigator.share(shareData);
            return 'SHARED';
        } else if (!navigator.canShare) {
            // Fallback for browsers that support share but not canShare
            await navigator.share(shareData);
            return 'SHARED';
        }
      } catch (err: any) {
        if (err.name === 'AbortError') return 'SHARED';
        console.warn('Web Share failed:', err);
        // If web share fails, we continue to try Capacitor or Clipboard
      }
    }

    // 2. Try Capacitor Share Plugin (For Native Apps)
    try {
        if (Capacitor.isNativePlatform() && Share) {
            await Share.share(shareData);
            return 'SHARED';
        }
    } catch (err: any) {
        console.warn('Capacitor Share failed:', err);
        if (err.message?.includes('canceled') || err.name === 'AbortError') return 'SHARED';
    }

    // 3. Fallback: Copy to Clipboard
    try {
        const contentToCopy = url ? `${text}\n${url}` : text;
        const copied = await NativeBridge.copyToClipboard(contentToCopy);
        return copied ? 'COPIED' : 'FAILED';
    } catch (err) {
        console.error('Final share fallback failed:', err);
        return 'FAILED';
    }
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
