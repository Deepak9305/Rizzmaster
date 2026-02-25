
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
    // Ensure we have at least some content to share
    if (!text && !url) {
        console.warn('Share called with empty text and url');
        return 'FAILED';
    }

    const contentToCopy = url ? `${text}\n${url}` : text;

    // 1. Try Capacitor Native Share (Plugin)
    if (Capacitor.isNativePlatform()) {
        try {
            await Share.share({
                title: title || 'Check this out!',
                text: text || '',
                url: url || '',
                dialogTitle: 'Share' // Android only
            });
            return 'SHARED';
        } catch (err: any) {
            console.warn('Native share dismissed/failed', err);
            // If the user dismissed the sheet, we stop here.
            // If it failed for another reason, we might want to fallback, but usually native share is reliable.
            if (err.message !== 'Share canceled') {
                 // Fallback to clipboard only on actual errors, not user cancellation
                 const copied = await NativeBridge.copyToClipboard(contentToCopy);
                 return copied ? 'COPIED' : 'FAILED';
            }
            return 'DISMISSED';
        }
    }

    // 2. Try Web Share API (Desktop/Mobile Web)
    // Validate share data for Web Share API
    const shareData: any = { title: title || 'Share' };
    if (text) shareData.text = text;
    if (url) shareData.url = url;

    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return 'SHARED';
      } catch (err: any) {
        if (err.name === 'AbortError') {
           console.log('User cancelled share');
           return 'DISMISSED';
        }
        console.warn('Web Share failed, attempting fallback:', err);
      }
    }
    
    // 3. Fallback: Copy to Clipboard (Always try this if others fail/dismiss)
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
