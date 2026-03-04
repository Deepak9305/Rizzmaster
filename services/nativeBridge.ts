import { Capacitor, registerPlugin } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { Share } from '@capacitor/share';

/**
 * --- NATIVE BRIDGE ---
 * Custom bridge for features not readily available in official plugins
 * OR for advanced customization.
 */
interface NativeSharePlugin {
  share(options: { title: string; text: string }): Promise<{ value: string }>;
}

const NativeShare = registerPlugin<NativeSharePlugin>("NativeShare");

export const NativeBridge = {
  /**
   * Triggers haptic feedback.
   * Type: 'light' | 'medium' | 'heavy' | 'success' | 'error'
   */
  haptic: (style: 'light' | 'medium' | 'heavy' | 'success' | 'error' = 'light') => {
    if (style === 'success' || style === 'error') {
      Haptics.notification({ type: style === 'success' ? NotificationType.Success : NotificationType.Error });
    } else {
      Haptics.impact({ style: ImpactStyle[style.toUpperCase() as keyof typeof ImpactStyle] || ImpactStyle.Light });
    }
  },

  /**
   * Share Content
   * Uses custom native plugin with clipboard fallback
   */
  share: async (title: string, text: string): Promise<'SHARED' | 'COPIED' | 'FAILED'> => {
    try {
      // 1. Try custom Native intent (best experience)
      await NativeShare.share({ title, text });
      return 'SHARED';
    } catch (e) {
      console.warn("Native share failed, using fallback:", e);
      try {
        // 2. Try the official Capacitor Share (standard intent)
        await Share.share({ title, text, dialogTitle: title });
        return 'SHARED';
      } catch (officialError) {
        console.warn("Official share failed, using clipboard:", officialError);
        // 3. Last resort: Copy to Clipboard
        const success = await NativeBridge.copyToClipboard(text);
        return success ? 'COPIED' : 'FAILED';
      }
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
