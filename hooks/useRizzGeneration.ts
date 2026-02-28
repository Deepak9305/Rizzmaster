
import { useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { AdMobService } from '../services/admobService';
import { generateRizz, generateBio, FALLBACK_TEASE, FALLBACK_SMOOTH, FALLBACK_CHAOTIC, FALLBACK_ERROR_ANALYSIS } from '../services/rizzService';
import { NativeBridge } from '../services/nativeBridge';
import { InputMode, RizzResponse, RizzOrBioResponse, UserProfile } from '../types';
import { TEST_INTERSTITIAL_ID_IOS, PROD_INTERSTITIAL_ID_ANDROID, TEST_BANNER_ID_IOS, PROD_BANNER_ID_ANDROID } from '../constants/adIds';

const APP_LAUNCH_GRACE_PERIOD = 2 * 60 * 1000; // 2 minutes grace period on launch
const INTERSTITIAL_COOLDOWN_MS = 3 * 60 * 1000; // 3 minutes

export const useRizzGeneration = (
  { mode, inputText, image, selectedVibe, profileRef, updateCredits, showToast, handleOpenPremium, setLoading, setResult, setInputError, isMounted }: any
) => {
  const appLaunchTime = useRef<number>(Date.now());
  const lastInterstitialTime = useRef<number>(Date.now());

  const handleGenerate = useCallback(async () => {
    const currentProfile = profileRef.current;
    if (!currentProfile) return;

    if (mode === InputMode.CHAT && !inputText.trim() && !image) {
      NativeBridge.haptic('error');
      setInputError("Give me some context! Paste the chat or upload a screenshot.");
      return;
    }
    if (mode === InputMode.BIO && !inputText.trim()) {
      NativeBridge.haptic('error');
      setInputError("I can't write a bio for a ghost! Tell me about your hobbies, job, or vibes.");
      return;
    }
    setInputError(null);
    NativeBridge.haptic('medium');

    const cost = (mode === InputMode.CHAT && image) ? 2 : 1;

    if (!currentProfile.is_premium && (currentProfile.credits || 0) < cost) {
      if ((currentProfile.credits || 0) > 0) showToast(`Need ${cost} credits.`, 'error');
      handleOpenPremium();
      return;
    }

    setLoading(true);

    // Hide banner during generation to free up memory and prevent native conflicts
    if (Capacitor.isNativePlatform() && !currentProfile.is_premium) {
      AdMobService.hideBanner().catch(() => { });
    }

    const showInterstitialIfReady = async () => {
      if (!isMounted.current) return; // Safety check

      if (!currentProfile.is_premium && Capacitor.isNativePlatform()) {
        const now = Date.now();

        if (now - appLaunchTime.current < APP_LAUNCH_GRACE_PERIOD) {
          console.log("Skipping Interstitial: In Launch Grace Period");
          return;
        }

        if (now - lastInterstitialTime.current > INTERSTITIAL_COOLDOWN_MS) {
          console.log("Showing Interstitial Ad...");
          const adId = Capacitor.getPlatform() === 'ios' ? TEST_INTERSTITIAL_ID_IOS : PROD_INTERSTITIAL_ID_ANDROID;

          try {
            await AdMobService.showInterstitial(adId);
            if (isMounted.current) {
              lastInterstitialTime.current = Date.now(); // Reset cooldown
            }
          } catch (e) {
            console.warn("Interstitial failed to show:", e);
          }
        }
      }
    };

    const creditsBefore = currentProfile.credits || 0;

    try {
      if (!currentProfile.is_premium) {
        updateCredits(creditsBefore - cost);
      }

      await new Promise(resolve => setTimeout(resolve, 300));

      let res: RizzOrBioResponse;
      if (mode === InputMode.CHAT) {
        res = await generateRizz(inputText, image || undefined, selectedVibe || undefined);
      } else {
        res = await generateBio(inputText, selectedVibe || undefined);
      }

      if (!isMounted.current) return;

      // Re-show banner after generation with a delay to ensure UI is settled
      if (Capacitor.isNativePlatform() && !currentProfile.is_premium) {
        const bannerId = Capacitor.getPlatform() === 'ios' ? TEST_BANNER_ID_IOS : PROD_BANNER_ID_ANDROID;
        setTimeout(() => {
          if (isMounted.current) AdMobService.showBanner(bannerId).catch(() => { });
        }, 1500); // 1.5s delay
      }

      if ('potentialStatus' in res && (res.potentialStatus === 'Error' || res.potentialStatus === 'Blocked')) {
        if (!currentProfile.is_premium) updateCredits(creditsBefore);
        if (res.potentialStatus === 'Blocked') {
          showToast('Request blocked by Safety Policy.', 'error');
        } else {
          showToast('Service unavailable. Credits refunded.', 'error');
        }
        setResult(res);
      } else if ('analysis' in res && (res.analysis === 'System Error' || res.analysis === 'Safety Policy Violation' || res.analysis === FALLBACK_ERROR_ANALYSIS)) {
        if (!currentProfile.is_premium) updateCredits(creditsBefore);
        showToast(res.analysis, 'error');
        setResult(res);
      } else {
        const rizzRes = res as RizzResponse;
        if ('tease' in rizzRes && (
          rizzRes.tease === FALLBACK_TEASE ||
          rizzRes.smooth === FALLBACK_SMOOTH ||
          rizzRes.chaotic === FALLBACK_CHAOTIC
        )) {
          if (!currentProfile.is_premium) updateCredits(creditsBefore);
          showToast('AI was speechless. Credits refunded.', 'error');
          setResult(res);
        } else {
          setResult(res);
          NativeBridge.haptic('success');

          if (isMounted.current) setLoading(false);

          // CRITICAL FIX: Delay AdMob Interstitial significantly to ensure 
          // React has finished rendering the (heavy) new result DOM and 
          // memory from the Base64 image has been GC'd. This prevents OOM.
          setTimeout(() => {
            if (isMounted.current) showInterstitialIfReady();
          }, 4000); // Increased from 3s to 4s for complete stability
          return; // Return early because we handled setLoading above
        }
      }

    } catch (error) {
      console.error(error);
      if (isMounted.current) {
        showToast('The wingman tripped! Try again.', 'error');
        if (!currentProfile.is_premium) updateCredits(creditsBefore);
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  }, [mode, inputText, image, selectedVibe, updateCredits, showToast, handleOpenPremium, profileRef, setLoading, setResult, setInputError, isMounted]);

  return { handleGenerate };
};
