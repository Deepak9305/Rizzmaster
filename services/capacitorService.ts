import { Capacitor } from '@capacitor/core';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Share } from '@capacitor/share';
import { Clipboard } from '@capacitor/clipboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { AdMob, RewardAdOptions, AdLoadInfo, RewardAdPluginEvents, AdMobRewardItem } from '@capacitor-community/admob';

// --- Configuration ---
const ADMOB_TEST_AD_UNIT = 'ca-app-pub-3940256099942544/5224354917'; // Google Test ID for Android Rewarded Video

export const isNative = () => Capacitor.isNativePlatform();

/**
 * Initialize Native App Features (Status Bar, AdMob, etc.)
 */
export const initializeNativeFeatures = async () => {
  if (!isNative()) return;

  try {
    // 1. Status Bar: Dark style for immersive feel
    await StatusBar.setStyle({ style: Style.Dark });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({ color: '#020202' });
      await StatusBar.setOverlaysWebView({ overlay: false });
    }

    // 2. Hide Native Splash Screen (Let React Splash take over)
    await SplashScreen.hide();

    // 3. Initialize AdMob
    await AdMob.initialize();

  } catch (err) {
    console.warn("Native initialization failed:", err);
  }
};

/**
 * Handle Auth Redirect URL based on platform
 */
export const getAuthRedirectUrl = () => {
  if (isNative()) {
    // IMPORTANT: You must register this scheme in your capacitor.config.json and AndroidManifest.xml
    return 'com.rizzmaster.app://auth/callback';
  }
  return window.location.origin;
};

/**
 * Native Image Selection
 */
export const selectImageNative = async (): Promise<string | null> => {
  try {
    const image = await Camera.getPhoto({
      quality: 90,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Prompt // Asks user: Camera or Photos?
    });

    return image.dataUrl || null;
  } catch (err) {
    console.log("User cancelled image selection or error:", err);
    return null;
  }
};

/**
 * Native Share
 */
export const shareNative = async (text: string, title: string = 'Rizz Master Reply') => {
  if (isNative()) {
    await Share.share({
      title,
      text,
      dialogTitle: 'Share with...'
    });
  } else {
    // Web Fallback
    if (navigator.share) {
      await navigator.share({ title, text });
    } else {
      await navigator.clipboard.writeText(text);
      alert('Copied to clipboard!');
    }
  }
};

/**
 * Native Clipboard
 */
export const copyToClipboard = async (text: string) => {
  if (isNative()) {
    await Clipboard.write({ string: text });
  } else {
    await navigator.clipboard.writeText(text);
  }
};

/**
 * Native Rewarded Ad
 * Returns true if ad completed and user should be rewarded
 */
export const showRewardedAdNative = async (): Promise<boolean> => {
  if (!isNative()) return false; // Should use web fallback

  return new Promise(async (resolve) => {
    try {
      const options: RewardAdOptions = {
        adId: ADMOB_TEST_AD_UNIT,
        isTesting: true // Set to false in production
      };

      await AdMob.prepareRewardVideoAd(options);
      
      // Listeners
      const onReward = AdMob.addListener(RewardAdPluginEvents.Rewarded, (reward: AdMobRewardItem) => {
        resolve(true);
      });
      
      const onDismiss = AdMob.addListener(RewardAdPluginEvents.Dismissed, () => {
        // If dismissed without reward, we might resolve false, or handle logic
        // For now, we rely on the Rewarded event to set success
      });

      const onFailed = AdMob.addListener(RewardAdPluginEvents.FailedToLoad, (err) => {
        console.error("Ad Failed to Load:", err);
        resolve(false);
      });

      await AdMob.showRewardVideoAd();

    } catch (err) {
      console.error("AdMob Error:", err);
      resolve(false);
    }
  });
};