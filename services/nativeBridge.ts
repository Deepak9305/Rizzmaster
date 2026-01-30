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
   */
  share: async (title: string, text: string, url: string = window.location.href): Promise<boolean> => {
    if (navigator.share) {
      try {
        await navigator.share({ title, text, url });
        return true;
      } catch (err) {
        console.log('Share canceled or failed', err);
        return false;
      }
    } else {
      // Fallback for desktop/unsupported browsers
      await NativeBridge.copyToClipboard(`${text} ${url}`);
      return false; // Return false to indicate we didn't open the share sheet
    }
  },

  /**
   * Copy to clipboard wrapper
   */
  copyToClipboard: async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (err) {
      console.error('Clipboard failed', err);
      return false;
    }
  }
};