
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
    // Prepare data
    const shareData: any = { title, text };
    if (url) shareData.url = url;

    if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
      try {
        await navigator.share(shareData);
        return 'SHARED';
      } catch (err: any) {
        if (err.name === 'AbortError') {
          return 'DISMISSED'; // User cancelled
        }
        // If share failed for other reasons, fall through to clipboard
        console.warn('Share failed, attempting fallback:', err);
      }
    }
    
    // Fallback: Copy text only (append URL if meaningful context, but for Rizz we usually just want text)
    const contentToCopy = url ? `${text}\n${url}` : text;
    const copied = await NativeBridge.copyToClipboard(contentToCopy);
    return copied ? 'COPIED' : 'FAILED';
  },

  /**
   * Copy to clipboard wrapper
   */
  copyToClipboard: async (text: string): Promise<boolean> => {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      } else {
        // Legacy fallback
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            document.execCommand('copy');
            document.body.removeChild(textArea);
            return true;
        } catch (err) {
            document.body.removeChild(textArea);
            return false;
        }
      }
    } catch (err) {
      console.error('Clipboard failed', err);
      return false;
    }
  }
};
