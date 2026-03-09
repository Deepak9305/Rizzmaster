
import React, { useState, useRef, useEffect, lazy, Suspense, useCallback } from 'react';
import { generateRizz, generateBio } from './services/rizzService';
import { NativeBridge } from './services/nativeBridge';
import { ToastProvider, useToast } from './context/ToastContext';
import { InputMode, RizzResponse, BioResponse, SavedItem, UserProfile, RizzOrBioResponse, ResponseLength } from './types';
import { supabase } from './services/supabaseClient';
import RizzCard from './components/RizzCard';
import LoginPage from './components/LoginPage';
import Footer from './components/Footer';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Dialog } from '@capacitor/dialog';
import { StatusBar, Style } from '@capacitor/status-bar';
import { AdMobService } from './services/admobService';
import IAPService from './services/iapService';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import AdSenseBanner from './components/AdSenseBanner';
import OnboardingFlow from './components/OnboardingFlow';

// Lazy Load Heavy Components / Modals
const PremiumModal = lazy(() => import('./components/PremiumModal'));
const SavedModal = lazy(() => import('./components/SavedModal'));
const InfoPages = lazy(() => import('./components/InfoPages'));
const RizzCoach = lazy(() => import('./components/RizzCoach'));

const DAILY_CREDITS = 5;
const REWARD_CREDITS = 5;
const AD_DURATION = 10;
const SIMULATE_REWARD_AD = false; // Real AdMob by default, timer only as fallback

// --- AD CONFIGURATION ---
const USE_TEST_ADS = false; // Set to true for testing with Google test ads

const AD_IDS = {
  BANNER: {
    ANDROID: USE_TEST_ADS ? 'ca-app-pub-3940256099942544/6300978111' : 'ca-app-pub-7381421031784616/7234804095',
    IOS: 'ca-app-pub-3940256099942544/2934735716' // Test ID
  },
  INTERSTITIAL: {
    ANDROID: USE_TEST_ADS ? 'ca-app-pub-3940256099942544/1033173712' : 'ca-app-pub-7381421031784616/5183026259',
    IOS: 'ca-app-pub-3940256099942544/4411468910' // Test ID
  },
  REWARD_INTERSTITIAL: {
    ANDROID: USE_TEST_ADS ? 'ca-app-pub-3940256099942544/6978759866' : 'ca-app-pub-7381421031784616/8079257109',
    IOS: 'ca-app-pub-3940256099942544/6978759866' // Test ID
  },
  REWARD: {
    ANDROID: USE_TEST_ADS ? 'ca-app-pub-3940256099942544/5224354917' : 'ca-app-pub-7381421031784616/6580197977',
    IOS: 'ca-app-pub-3940256099942544/1712485313' // Test ID
  },
  APP_OPEN: {
    ANDROID: USE_TEST_ADS ? 'ca-app-pub-3940256099942544/3419835294' : 'ca-app-pub-7381421031784616/2705366298',
    IOS: 'ca-app-pub-3940256099942544/5662855259' // Test ID
  }
};

const getAdId = (type: keyof typeof AD_IDS) => {
  const platform = Capacitor.getPlatform() as 'ios' | 'android';
  return platform === 'ios' ? AD_IDS[type].IOS : AD_IDS[type].ANDROID;
};

// Placeholder for Web AdSense
const ADSENSE_SLOT_ID = '1234567890';

type ViewState = 'HOME' | 'PRIVACY' | 'TERMS' | 'SUPPORT' | 'COACH';

const LOADING_MESSAGES = [
  "Analyzing context...",
  "Reading between the lines...",
  "Scanning for red flags...",
  "Consulting the Rizz God...",
  "Drafting fire replies...",
  "Polishing the charm...",
  "Cooking..."
];

// --- VIBE CONFIGURATION ---
// Define which vibes are PRO only
const VIBES_CHAT = [
  { label: "Flirty", isPro: false },
  { label: "Funny", isPro: false },
  { label: "Savage", isPro: true },      // PRO
  { label: "Wholesome", isPro: false },
  { label: "Nonchalant", isPro: false },
  { label: "Intellectual", isPro: true },// PRO
  { label: "Romantic", isPro: true }     // PRO
];

const VIBES_BIO = [
  { label: "Confident", isPro: false },
  { label: "Chill", isPro: false },
  { label: "Funny", isPro: false },
  { label: "Mysterious", isPro: true },  // PRO
  { label: "Adventurous", isPro: false },
  { label: "Direct", isPro: true },      // PRO
  { label: "Witty", isPro: true }        // PRO
];

// Helper for UUID generation with fallback
const generateUUID = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

interface SplashScreenProps {
  isAppReady: boolean;
  onComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ isAppReady, onComplete }) => {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    // Duration of the progress bar animation in ms
    const duration = 2200;
    const interval = 20;
    const steps = duration / interval;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      // Calculate progress
      const progressValue = Math.min(100, (currentStep / steps) * 100);
      setProgress(progressValue);

      if (currentStep >= steps) {
        clearInterval(timer);
      }
    }, interval);

    return () => clearInterval(timer);
  }, []);

  // Monitor for completion
  useEffect(() => {
    // Only exit if progress bar is full AND app data is ready
    if (progress >= 100 && isAppReady && !isExiting) {
      setIsExiting(true);
      // Wait for the exit animation (fade/scale out) to finish before unmounting
      setTimeout(() => {
        onComplete();
      }, 800);
    }
  }, [progress, isAppReady, isExiting, onComplete]);

  return (
    <div className={`fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center overflow-hidden transition-all duration-800 ${isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100'}`}>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-rose-900/20 rounded-full blur-[100px] animate-pulse-glow" />
      <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-amber-900/10 rounded-full blur-[80px] animate-float" />

      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-4xl px-4">
        <div className="relative mb-12">
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-rose-200 via-amber-100 to-rose-200 animate-text-shimmer drop-shadow-2xl">
            Rizz Master
          </h1>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent blur-xl opacity-50 animate-text-shimmer" style={{ backgroundSize: '200% 100%' }}></div>
        </div>
        <div className="w-64 md:w-80 h-[2px] bg-white/10 rounded-full overflow-hidden relative">
          <div
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-rose-500 via-amber-400 to-rose-500 shadow-[0_0_15px_rgba(251,191,36,0.5)] transition-all duration-75 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-4 h-10 overflow-hidden flex flex-col items-center">
          <p className="text-[10px] md:text-xs font-bold tracking-[0.5em] text-white/40 uppercase animate-fade-in-up">
            {progress < 30 ? 'ANALYZING...' : progress < 70 ? 'COOKING...' : (isAppReady ? 'READY.' : 'AUTHENTICATING...')}
          </p>
          {progress >= 100 && !isAppReady && (
            <p className="text-[9px] text-white/20 mt-2 animate-pulse">
              JUST A MOMENT...
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

const AdLoadingOverlay: React.FC<{ mode: 'hidden' | 'interstitial' | 'reward' }> = ({ mode }) => {
  if (mode === 'hidden') return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center animate-fade-in">
      {/* Deep, clean backdrop */}
      <div className="absolute inset-0 bg-black/90 backdrop-blur-2xl" />

      {/* Minimal Loader Content */}
      <div className="relative flex flex-col items-center">
        {/* Subtle, elegant spinner */}
        <div className="h-12 w-12 relative mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-white/5" />
          <div className="absolute inset-0 rounded-full border-2 border-white/80 border-t-transparent animate-spin" style={{ animationDuration: '1s' }} />
        </div>

        {/* Minimal Typography */}
        <h3 className="text-xs font-medium tracking-[0.3em] text-white/60 uppercase">
          {mode === 'reward' ? 'Loading Reward' : 'Loading'}
        </h3>
      </div>
    </div>
  );
};

const AppContent: React.FC = React.memo(() => {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black z-50" />}>
      <AppContentInner />
    </Suspense>
  );
});

const AppContentInner: React.FC = () => {
  const { showToast } = useToast();

  // Auth State
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);

  // Refs
  const profileRef = useRef<UserProfile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionChannelRef = useRef<BroadcastChannel | null>(null);

  // Splash State
  const [showSplash, setShowSplash] = useState(true);

  // Onboarding State
  const [showOnboarding, setShowOnboarding] = useState(false);

  // App State
  const [currentView, setCurrentView] = useState<ViewState>('HOME');
  const [mode, setMode] = useState<InputMode>(InputMode.CHAT);
  const [inputText, setInputText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [responseLength, setResponseLength] = useState<ResponseLength>('medium');

  // Loading State
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Cooking...");

  const [result, setResult] = useState<RizzOrBioResponse | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  // Modals & Flags
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [isSessionBlocked, setIsSessionBlocked] = useState(false);
  const [isAdLoading, setIsAdLoading] = useState<'hidden' | 'interstitial' | 'reward'>('hidden');

  // Ref to track state for event listeners without re-binding
  const stateRef = useRef({
    currentView,
    showPremiumModal,
    showSavedModal
  });

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = { currentView, showPremiumModal, showSavedModal };
  }, [currentView, showPremiumModal, showSavedModal]);

  // Handle Status Bar Visibility on Scroll
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let isStatusBarVisible = false; // Track local state to prevent spamming bridge

    // Initial Hide
    StatusBar.hide().catch(() => { }); // Catch potential errors on initial hide

    let ticking = false;

    // Handle Status Bar Visibility on Scroll with Debounce
    const handleScroll = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          const scrollY = window.scrollY;
          const shouldBeVisible = scrollY > 50;

          if (shouldBeVisible && !isStatusBarVisible) {
            isStatusBarVisible = true;
            StatusBar.show().catch(() => { });
            StatusBar.setStyle({ style: Style.Dark }).catch(() => { });
            StatusBar.setOverlaysWebView({ overlay: true }).catch(() => { });
          } else if (!shouldBeVisible && isStatusBarVisible) {
            isStatusBarVisible = false;
            StatusBar.hide().catch(() => { });
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Sync profile ref
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // --- INTERSTITIAL AD ACTIVE TIME TRACKING ---
  // We use refs here because we need these values to be immediately available
  // in background/foreground event listeners and intervals without causing re-renders.
  const activeTimeMs = useRef<number>(0);
  const lastAdActiveTime = useRef<number>(0);
  const lastCoachAdTime = useRef<number>(0);
  const backgroundTimestamp = useRef<number | null>(null);
  const sessionGenCount = useRef<number>(0);

  const INTERSTITIAL_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes (Reduced from 3m)
  const COACH_AD_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes (Reduced from 3m)
  const COACH_AD_GRACE_PERIOD_MS = 1 * 60 * 1000; // 1 minute (Reduced from 3m)
  const INACTIVITY_RESET_MS = 30 * 60 * 1000; // 30 minutes of background time to reset

  // Track Active Time (Foreground)
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    // Start tracking active time immediately
    const interval = setInterval(() => {
      // If we are not in the background, increment active time
      if (backgroundTimestamp.current === null) {
        activeTimeMs.current += 1000;
      }
    }, 1000);

    // Initial setup listener for App state to handle background/foreground
    let appStateListener: any;

    // Using a separate listener specifically for the vital time tracking 
    // to keep it decoupled from the ad refresh logic below.
    CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      const now = Date.now();

      if (isActive) {
        // App came to FOREGROUND
        if (backgroundTimestamp.current !== null) {
          const timeInBackground = now - backgroundTimestamp.current;

          if (timeInBackground >= INACTIVITY_RESET_MS) {
            // Reset active time and ad tracking to grant a new grace period
            activeTimeMs.current = 0;
            lastAdActiveTime.current = 0;
            lastCoachAdTime.current = 0;
            sessionGenCount.current = 0;
          }
          // We are no longer in the background
          backgroundTimestamp.current = null;
        }
      } else {
        // App went to BACKGROUND
        backgroundTimestamp.current = now;
      }
    }).then(listener => appStateListener = listener);

    return () => {
      clearInterval(interval);
      if (appStateListener) appStateListener.remove();
    };
  }, []);
  // --- END ACTIVE TIME TRACKING ---

  // Check for Onboarding on Mount
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('rizz_onboarding_completed');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    }
  }, []);

  const handleOnboardingComplete = () => {
    localStorage.setItem('rizz_onboarding_completed', 'true');
    setShowOnboarding(false);
  };

  // Manage Native Banner Ads
  useEffect(() => {
    let timer: any;
    const refreshBanner = () => {
      if (Capacitor.isNativePlatform() && session) {
        // Wait for profile to load before making ad decisions
        if (!profile) return;

        if (profile.is_premium) {
          AdMobService.hideBanner();
        } else {
          const adId = getAdId('BANNER');
          const position = currentView === 'COACH' ? 'TOP' : 'BOTTOM';

          // Force hide first to ensure the plugin repositions cleanly
          AdMobService.hideBanner().then(() => {
            // Delay slightly to ensure layout is settled and old banners are gone
            timer = setTimeout(() => AdMobService.showBanner(adId, position), 1500);
          });
        }
      }
    };

    refreshBanner();

    // Listen for App Resume to refresh ads (often needed if they disappear)
    let appListener: any;
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) {
          // 1. Refresh Banner
          if (profile && !profile.is_premium) {
            AdMobService.hideBanner().then(() => {
              const adId = getAdId('BANNER');
              const position = currentView === 'COACH' ? 'TOP' : 'BOTTOM';
              timer = setTimeout(() => AdMobService.showBanner(adId, position), 1000);
            });
          }

        }
      }).then(l => appListener = l);
    }

    return () => {
      if (timer) clearTimeout(timer);
      if (appListener) appListener.remove();
    };
  }, [profile?.is_premium, session, currentView]);

  // Define handleUpgrade using REF to avoid stale closures
  const handleUpgrade = useCallback(async () => {
    const currentProfile = profileRef.current;
    if (!currentProfile) return;

    const updatedProfile = { ...currentProfile, is_premium: true };
    setProfile(updatedProfile);

    // Hide Banner Immediately
    if (Capacitor.isNativePlatform()) {
      AdMobService.hideBanner();
    }

    // Close modal via back navigation if open
    if (stateRef.current.showPremiumModal) {
      window.history.back();
    }

    showToast(`Welcome to the Elite Club! 👑`, 'success');

    if (supabase) {
      await supabase.from('profiles').update({ is_premium: true }).eq('id', currentProfile.id);
    }
  }, [showToast]);

  // Ad Pre-loading (Initial)
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      const interId = getAdId('INTERSTITIAL');
      // Only pre-load Interstitial at startup. Banner is handled by its own effect.
      // Reward ads are now pre-loaded conditionally to save resources.
      AdMobService.prepareInterstitial(interId);
    }
  }, []);

  // Conditional Pre-loading: Reward Video (Low Credits)
  useEffect(() => {
    if (Capacitor.isNativePlatform() && profile && !profile.is_premium) {
      const credits = profile.credits || 0;
      // Pre-load Reward Video when credits are low (<= 2)
      if (credits <= 2) {
        const rewardId = getAdId('REWARD');
        AdMobService.prepareRewardVideo(rewardId);
      }
    }
  }, [profile?.credits, profile?.is_premium]);

  // Initialize Native Services
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      // Google Auth
      const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
      GoogleAuth.initialize({
        clientId: clientId || 'YOUR_WEB_CLIENT_ID_PLACEHOLDER',
        scopes: ['profile', 'email'],
        grantOfflineAccess: false,
      });

      // AdMob
      AdMobService.initialize();

      // In-App Purchases
      IAPService.initialize(
        () => {
          // On successful purchase/restore
          handleUpgrade();
        },
        (errorMessage) => {
          showToast(errorMessage, 'error');
        }
      );
    }
  }, [handleUpgrade, showToast]);

  // Handle History API for Mobile Back Button support
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state || {};
      setCurrentView(state.view || 'HOME');
      setShowPremiumModal(!!state.premium);
      setShowSavedModal(!!state.saved);
    };

    if (!window.history.state) {
      window.history.replaceState({ view: 'HOME' }, '');
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Native Back Button Handler
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const setupBackListener = async () => {
      await CapacitorApp.removeAllListeners();

      CapacitorApp.addListener('backButton', ({ canGoBack }) => {
        const { currentView, showPremiumModal, showSavedModal } = stateRef.current;

        if (showPremiumModal || showSavedModal) {
          window.history.back();
          return;
        }

        if (currentView !== 'HOME') {
          window.history.back();
          return;
        }

        const shouldExit = window.confirm("Do you want to exit Rizz Master?");
        if (shouldExit) {
          CapacitorApp.exitApp();
        }
      });
    };

    setupBackListener();
    return () => { CapacitorApp.removeAllListeners(); };
  }, []);

  // Navigation Wrappers
  const showCoachTransitionAd = async () => {
    const isPremium = profileRef.current?.is_premium;
    if (isPremium) return;

    const currentActiveTime = activeTimeMs.current;

    // Check grace period (3 mins) or if on Web
    if (currentActiveTime < COACH_AD_GRACE_PERIOD_MS && Capacitor.isNativePlatform()) return;

    // Check combined 3 min cooldown
    if (currentActiveTime - lastCoachAdTime.current >= COACH_AD_COOLDOWN_MS) {
      setIsAdLoading('interstitial'); // SHOW OVERLAY

      let adShowed = false;
      if (Capacitor.isNativePlatform()) {
        const adId = getAdId('INTERSTITIAL');
        try {
          adShowed = await AdMobService.showInterstitial(adId);
        } catch (e) {
          console.warn("Transition ad error:", e);
        } finally {
          setIsAdLoading('hidden'); // ALWAYS HIDE OVERLAY
        }
      } else {
        setIsAdLoading('hidden');
      }

      // Always reset the cooldown after attempting to show an ad
      const now = activeTimeMs.current;
      lastCoachAdTime.current = now;
      lastAdActiveTime.current = now; // Synchronize with generation ads
    }
  };

  const handleViewNavigation = useCallback(async (view: ViewState) => {
    if (view === currentView) return;

    if (view === 'COACH' || (currentView === 'COACH' && view === 'HOME')) {
      await showCoachTransitionAd();
    }

    window.history.pushState({ view }, '');
    setCurrentView(view);
  }, [currentView]);

  const handleBackNavigation = useCallback(() => {
    // Navigate back immediately — don't block on the ad
    if (window.history.state?.view && window.history.state.view !== 'HOME') {
      window.history.back();
    } else {
      // Fallback: directly set the view in case history is missing
      setCurrentView('HOME');
      setShowPremiumModal(false);
      setShowSavedModal(false);
    }

    // Fire the transition ad in the background (non-blocking)
    if (currentView === 'COACH') {
      showCoachTransitionAd();
    }
  }, [currentView]);

  const handleOpenPremium = useCallback(() => {
    window.history.pushState({ view: currentView, premium: true }, '');
    setShowPremiumModal(true);
  }, [currentView]);

  const handleOpenSaved = useCallback(() => {
    window.history.pushState({ view: currentView, saved: true }, '');
    setShowSavedModal(true);
  }, [currentView]);

  useEffect(() => {
    if (!supabase) {
      setIsAuthReady(true);
      return;
    }

    // FAIL-SAFE: If authentication takes more than 10 seconds, force the app to "ready" 
    // to prevent a permanent blank screen.
    const failSafeTimeout = setTimeout(() => {
      if (!isAuthReady) {
        console.warn("Startup Hang Detected: Forcing App Ready (Fail-safe)");
        setIsAuthReady(true);
      }
    }, 10000);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadUserData(session.user.id, session.user.email)
          .catch(e => console.error("Session Load Auth Err:", e))
          .finally(() => {
            clearTimeout(failSafeTimeout);
            setIsAuthReady(true);
          });
      } else {
        clearTimeout(failSafeTimeout);
        setIsAuthReady(true);
      }
    }).catch(err => {
      console.error("Auth Session Error:", err);
      clearTimeout(failSafeTimeout);
      setIsAuthReady(true);
    });


    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadUserData(session.user.id, session.user.email);
        // NOTE: App Open Ad is triggered by the useEffect watching [session, profile, isAuthReady]
        // after the profile has actually loaded, not here where profile is not yet available.
      } else {
        setProfile(null);
        setSavedItems([]);
        if (Capacitor.isNativePlatform()) {
          AdMobService.hideBanner();
        }
      }
    });

    return () => {
      clearTimeout(failSafeTimeout);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('rizz_session_sync');
    sessionChannelRef.current = channel;

    channel.postMessage({ type: 'NEW_SESSION_STARTED' });
    channel.onmessage = (event) => {
      if (event.data.type === 'NEW_SESSION_STARTED') {
        setIsSessionBlocked(true);
      }
    };
    return () => {
      channel.close();
      sessionChannelRef.current = null;
    };
  }, []);

  useEffect(() => {
    let interval: any;
    if (loading) {
      let i = 0;
      setLoadingMsg(LOADING_MESSAGES[0]);
      interval = setInterval(() => {
        i = (i + 1) % LOADING_MESSAGES.length;
        setLoadingMsg(LOADING_MESSAGES[i]);
      }, 1500);
    }
    return () => clearInterval(interval);
  }, [loading]);



  const handleReclaimSession = useCallback(() => {
    setIsSessionBlocked(false);
    sessionChannelRef.current?.postMessage({ type: 'NEW_SESSION_STARTED' });
  }, []);

  const loadUserData = async (userId: string, email?: string) => {
    if (!supabase) return;

    try {
      const profilePromise = supabase.from('profiles').select('*').eq('id', userId).single();
      const savedPromise = supabase.from('saved_items').select('*').eq('user_id', userId).order('created_at', { ascending: false });

      const [profileResult, savedResult] = await Promise.all([profilePromise, savedPromise]);

      let profileData = profileResult.data;
      const savedData = savedResult.data;

      if (savedData) {
        const items = savedData as SavedItem[];
        setSavedItems(items);
      }

      if (profileResult.error?.code === 'PGRST116') {
        const { data: newProfile } = await supabase.from('profiles').insert([{
          id: userId,
          email: email,
          credits: DAILY_CREDITS,
          is_premium: false,
          last_daily_reset: new Date().toISOString().split('T')[0]
        }]).select().single();
        if (newProfile) profileData = newProfile;
      } else if (profileData) {
        const today = new Date().toISOString().split('T')[0];
        if (profileData.last_daily_reset !== today) {
          const { data: updated } = await supabase.from('profiles').update({ credits: DAILY_CREDITS, last_daily_reset: today }).eq('id', userId).select().single();
          if (updated) profileData = updated;
        }
      }

      if (profileData) setProfile(profileData as UserProfile);
      if (savedData) setSavedItems(savedData as SavedItem[]);

    } catch (e) {
      console.error("Error loading user data", e);
    }
  };

  const handleLogout = useCallback(async () => {
    if (!window.confirm("Are you sure you want to log out of Rizz Master?")) return;

    try {
      if (supabase) await supabase.auth.signOut();
      if (Capacitor.isNativePlatform()) {
        try { await GoogleAuth.signOut(); } catch (error) { console.warn("Native Logout err", error); }
        AdMobService.hideBanner();
      }
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      setSession(null);
      setProfile(null);
      setSavedItems([]);
      setResult(null);
      setInputText('');
      setImage(null);
      setInputError(null);
      setSelectedVibe(null);
      setCurrentView('HOME');
      setShowPremiumModal(false);
      setShowSavedModal(false);
      showToast("Successfully logged out 👋", 'success');
      window.history.replaceState({ view: 'HOME' }, '', '/');
    }
  }, [showToast]);




  const updateCredits = useCallback(async (newAmountOrUpdater: number | ((prev: number) => number)) => {
    // We update the profile state functionally to ensure we never lose updates 
    // due to race conditions or stale closures.
    setProfile(prev => {
      if (!prev) return null;
      const newAmount = typeof newAmountOrUpdater === 'function'
        ? newAmountOrUpdater(prev.credits || 0)
        : newAmountOrUpdater;

      const updated = { ...prev, credits: newAmount };

      // Update persistent storage (Background task)
      if (supabase) {
        supabase.from('profiles').update({ credits: newAmount }).eq('id', prev.id)
          .then(({ error }) => { if (error) console.error("Credit Sync Error:", error); });
      }

      return updated;
    });
  }, []);

  const handleRestorePurchases = useCallback(async () => {
    if (!profileRef.current) return;
    if (Capacitor.isNativePlatform()) {
      IAPService.restore();
    } else {
      // Dev fallback
      setTimeout(() => handleUpgrade(), 1500);
    }
  }, [handleUpgrade]);

  const toggleSave = useCallback(async (content: string, type: 'tease' | 'smooth' | 'chaotic' | 'bio') => {
    const currentProfile = profileRef.current;
    if (!currentProfile) return;

    const exists = savedItems.find(item => item.content === content);

    if (exists) {
      const newItems = savedItems.filter(item => item.id !== exists.id);
      setSavedItems(newItems);
      showToast("Removed from saved", 'info');

      if (supabase) {
        await supabase.from('saved_items').delete().eq('id', exists.id);
      }
    } else {
      const newItem: SavedItem = {
        id: generateUUID(),
        user_id: currentProfile.id,
        content,
        type,
        created_at: new Date().toISOString()
      };

      const newItems = [newItem, ...savedItems];
      setSavedItems(newItems);
      showToast("Saved to your gems", 'success');

      if (supabase) {
        const { data } = await supabase.from('profiles').select('id').eq('id', currentProfile.id).single(); // Just a ping to ensure they exist
        await supabase.from('saved_items').insert([{ user_id: currentProfile.id, content, type }]);
      }
    }
  }, [savedItems, showToast]);

  const handleDeleteSaved = useCallback(async (id: string) => {
    const newItems = savedItems.filter(item => item.id !== id);
    setSavedItems(newItems);
    showToast("Item deleted", 'info');

    if (supabase) {
      await supabase.from('saved_items').delete().eq('id', id);
    }
  }, [savedItems, showToast]);

  const handleDeleteAccount = useCallback(async () => {
    if (!window.confirm("Are you sure? This cannot be undone. Your account and data will be permanently deleted.")) return;

    const currentProfile = profileRef.current;
    if (!currentProfile) return;

    if (!supabase) return;

    setLoading(true);

    try {
      // 1. Try to fully delete the user (Auth + Data) via RPC
      // This requires the 'delete_user' function to be set up in Supabase
      const { error: rpcError } = await supabase.rpc('delete_user');

      if (rpcError) {
        console.error("RPC Error:", rpcError);
        // PGRST202 or code 42883 = Function not found
        if (rpcError.code === '42883' || rpcError.message?.includes('does not exist')) {
          alert("CRITICAL ERROR: The database function 'delete_user' is missing.\n\nYou must run the SQL script in your Supabase SQL Editor to enable account deletion.");
          setLoading(false);
          return;
        }
        throw new Error(rpcError.message);
      }

      // 2. Sign Out & Cleanup (Only if RPC succeeded)
      await supabase.auth.signOut();

      // Clear Local State
      setSession(null);
      setProfile(null);
      setSavedItems([]);
      setResult(null);
      setCurrentView('HOME');

      showToast("Account permanently deleted", 'success');
      window.history.replaceState({ view: 'HOME' }, '', '/');

    } catch (err: any) {
      console.error("Delete Account Critical Error:", err);
      showToast(err.message || 'Failed to delete account.', 'error');
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  const handleSaveWrapper = useCallback((content: string, type: 'tease' | 'smooth' | 'chaotic' | 'bio') => {
    toggleSave(content, type);
  }, [toggleSave]);

  const handleReport = useCallback(() => {
    showToast('Report submitted. We will review this.', 'info');
  }, [showToast]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        showToast('Image too large. Max 5MB.', 'error');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
      if (inputError) setInputError(null);
    }
  }, [inputError, showToast]);

  const handleCameraCapture = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const permissions = await Camera.checkPermissions();
      if (permissions.camera !== 'granted') {
        const request = await Camera.requestPermissions({ permissions: ['camera'] });
        if (request.camera !== 'granted') {
          showToast('Camera permission is required to take photos.', 'error');
          return;
        }
      }

      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Camera
      });

      if (photo.dataUrl) {
        setImage(photo.dataUrl);
        if (inputError) setInputError(null);
      }
    } catch (e: any) {
      // Don't show toast if user cancelled
      if (e.message !== 'User cancelled photos app') {
        console.error('Camera Error:', e);
        showToast('Failed to open camera.', 'error');
      }
    }
  }, [inputError, showToast]);

  const handleGalleryCapture = useCallback(async () => {
    if (!Capacitor.isNativePlatform()) {
      fileInputRef.current?.click();
      return;
    }

    try {
      const permissions = await Camera.checkPermissions();
      if (permissions.photos !== 'granted') {
        const request = await Camera.requestPermissions({ permissions: ['photos'] });
        if (request.photos !== 'granted') {
          showToast('Image/Storage permission is required to select photos.', 'error');
          return;
        }
      }

      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos
      });

      if (photo.dataUrl) {
        setImage(photo.dataUrl);
        if (inputError) setInputError(null);
      }
    } catch (e: any) {
      // Don't show toast if user cancelled
      if (e.message !== 'User cancelled photos app') {
        console.error('Gallery Error:', e);
        showToast('Failed to open gallery.', 'error');
      }
    }
  }, [inputError, showToast]);

  const handleVibeClick = useCallback((vibe: { label: string, isPro: boolean }) => {
    const isPremium = profileRef.current?.is_premium;

    if (vibe.isPro && !isPremium) {
      showToast(`'${vibe.label}' is a Pro vibe!`, 'error');
      handleOpenPremium();
      return;
    }

    setSelectedVibe(prev => prev === vibe.label ? null : vibe.label);
  }, [handleOpenPremium, showToast]);

  // Active Time tracking handles the grace period now (see useEffect above)

  const handleGenerate = useCallback(async () => {
    const currentProfile = profileRef.current;
    if (!currentProfile) return;

    if (mode === InputMode.CHAT && !inputText.trim() && !image) {
      setInputError("Give me some context! Paste the chat or upload a screenshot.");
      return;
    }
    if (mode === InputMode.BIO && !inputText.trim()) {
      setInputError("I can't write a bio for a ghost! Tell me about your hobbies, job, or vibes.");
      return;
    }
    setInputError(null);

    const cost = (mode === InputMode.CHAT && image) ? 2 : 1;

    if (!currentProfile.is_premium && (currentProfile.credits || 0) < cost) {
      if ((currentProfile.credits || 0) > 0) showToast(`Need ${cost} credits.`, 'error');
      handleOpenPremium();
      return;
    }

    setLoading(true);

    // INTERSTITIAL AD LOGIC - "GATE" STRATEGY
    // This ensures we show ads BEFORE generation as a natural transition,
    // allowing the user to view results without interruption.
    // We prepare the ad logic here but execute it later.
    const showInterstitialIfReady = async () => {
      if (!currentProfile.is_premium && Capacitor.isNativePlatform()) {
        const currentActiveTime = activeTimeMs.current;

        if (sessionGenCount.current === 0) return;

        // Trigger if 2 mins have passed OR if it's the 3rd generation (1st ad guarantee)
        const isThirdGeneration = sessionGenCount.current === 2;
        const cooldownPassed = (currentActiveTime - lastAdActiveTime.current >= INTERSTITIAL_COOLDOWN_MS) && lastAdActiveTime.current !== 0;

        if (isThirdGeneration || cooldownPassed) {
          setIsAdLoading('interstitial'); // SHOW OVERLAY
          const adId = getAdId('INTERSTITIAL');

          try {
            const success = await AdMobService.showInterstitial(adId);
            if (success) {
              const now = activeTimeMs.current;
              lastAdActiveTime.current = now;
              lastCoachAdTime.current = now;
            }
          } catch (e) {
            console.warn("Generation ad error:", e);
          } finally {
            setIsAdLoading('hidden'); // ALWAYS HIDE OVERLAY
          }
        }
      }
    };

    // --- TRIGGER INTERSTITIAL BEFORE GENERATION ---
    await showInterstitialIfReady();
    // ----------------------------------------------

    const creditsBefore = currentProfile.credits || 0;

    try {
      if (!currentProfile.is_premium) {
        updateCredits(creditsBefore - cost);
      }

      let res;
      if (mode === InputMode.CHAT) {
        res = await generateRizz(inputText, image || undefined, selectedVibe || undefined, responseLength);
      } else {
        res = await generateBio(inputText, selectedVibe || undefined, responseLength);
      }

      if ('potentialStatus' in res && (res.potentialStatus === 'Error' || res.potentialStatus === 'Blocked')) {
        if (!currentProfile.is_premium) updateCredits(creditsBefore);

        if (res.potentialStatus === 'Blocked') {
          showToast('Request blocked by Safety Policy.', 'error');
        } else {
          showToast('Service unavailable. Credits refunded.', 'error');
        }
        setResult(res);
      } else if ('analysis' in res && (res.analysis === 'System Error' || res.analysis === 'Safety Policy Violation')) {
        if (!currentProfile.is_premium) updateCredits(creditsBefore);
        showToast(res.analysis, 'error');
        setResult(res);
      } else {
        setResult(res);
        // Successful generation: Increment session counter
        sessionGenCount.current += 1;
      }

    } catch (error) {
      console.error(error);
      showToast('The wingman tripped! Try again.', 'error');
      if (!currentProfile.is_premium) updateCredits(creditsBefore);
    } finally {
      setLoading(false);
    }
  }, [mode, inputText, image, selectedVibe, responseLength, showToast, handleOpenPremium, updateCredits]);

  const handleWatchAd = useCallback(async () => {
    if (Capacitor.isNativePlatform()) {
      setIsAdLoading('reward'); // SHOW OVERLAY
      try {
        const adUnitId = getAdId('REWARD');
        console.log("Showing Reward Ad:", adUnitId);

        const onShow = () => setIsAdLoading('hidden');

        const rewardEarned = await AdMobService.showRewardVideo(adUnitId, onShow);

        if (rewardEarned) {
          // 1. First Reward (+5)
          updateCredits((prevCredits) => prevCredits + REWARD_CREDITS);
          showToast(`+${REWARD_CREDITS} Credits Added! ⚡`, 'success');

          // 2. Pre-load Chained Bonus Ad (+10)
          const rewardInterId = getAdId('REWARD_INTERSTITIAL');
          AdMobService.prepareRewardInterstitial(rewardInterId);

          // 3. Chained Bonus Ad Sequence
          // Wait briefly for first ad dismissal to settle
          await new Promise(resolve => setTimeout(resolve, 800));

          // Prompt the user with a native dialog
          const { value } = await Dialog.confirm({
            title: 'Bonus Reward! 🎁',
            message: 'Want +7 more credits? Watch one more short ad.',
            okButtonTitle: 'Watch Now',
            cancelButtonTitle: 'No Thanks'
          });

          if (value) {
            setIsAdLoading('reward'); // Show overlay for second ad prep

            try {
              const bonusEarned = await AdMobService.showRewardInterstitial(rewardInterId, onShow);
              if (bonusEarned) {
                updateCredits((prevCredits) => prevCredits + 7);
                showToast(`+7 Bonus Credits! 🥷`, 'success');
              }
            } catch (e) {
              console.warn("Chained bonus ad error:", e);
            }
          }
        } else {
          showToast('Ad dismissed or failed to give reward.', 'info');
        }
      } catch (e) {
        console.warn("Native Ad Error:", e);
        showToast('Ad failed to load. Please try again later.', 'error');
      } finally {
        setIsAdLoading('hidden'); // ALWAYS HIDE OVERLAY
      }
      return;
    }

    showToast('Ads are only available on mobile devices.', 'info');
  }, [showToast, updateCredits]);

  const isSaved = useCallback((content: string) => savedItems.some(item => item.content === content), [savedItems]);
  const clear = useCallback(() => {
    setInputText('');
    setImage(null);
    setResult(null);
    setInputError(null);
    setSelectedVibe(null);
  }, []);

  return (
    <div className="relative min-h-screen bg-black overflow-x-hidden">

      {showSplash && (
        <SplashScreen
          isAppReady={isAuthReady}
          onComplete={() => setShowSplash(false)}
        />
      )}

      {/* Optimized Ad Loading UI */}
      <AdLoadingOverlay mode={isAdLoading} />

      {/* Onboarding Flow: Shows after Splash if not completed */}
      {!showSplash && showOnboarding && (
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      )}

      <div className={showSplash ? 'pointer-events-none' : ''}>
        {isSessionBlocked ? (
          <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 relative overflow-hidden bg-black safe-top safe-bottom">
            <div className="glass max-w-md w-full p-8 rounded-3xl border border-white/10 text-center relative z-10 shadow-2xl">
              <h1 className="text-2xl font-bold mb-4 text-white">Session Paused</h1>
              <button onClick={() => { handleReclaimSession(); }} className="w-full rizz-gradient py-3.5 rounded-xl font-bold text-white">
                Use Here Instead
              </button>
            </div>
          </div>
        ) : !session ? (
          <LoginPage />
        ) : !profile ? (
          <div className="min-h-screen flex flex-col items-center justify-center text-white p-4 bg-black safe-top safe-bottom">
            <svg className="animate-spin h-8 w-8 text-rose-500 mb-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <p className="text-white/50 animate-pulse">Loading Profile...</p>
          </div>
        ) : currentView === 'COACH' ? (
          <div className="animate-slide-in-right-view fixed inset-0 z-50 bg-black">
            <Suspense fallback={null}>
              <RizzCoach
                isOpen={true}
                onClose={handleBackNavigation}
                credits={profile?.credits || 0}
                onUpdateCredits={updateCredits}
                isPremium={profile?.is_premium || false}
                onWatchAd={handleWatchAd}
                onGoPremium={() => { handleBackNavigation(); handleOpenPremium(); }}
              />
            </Suspense>
          </div>
        ) : currentView !== 'HOME' ? (
          <div className="safe-top safe-bottom">
            <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>}>
              <InfoPages
                page={currentView}
                onBack={handleBackNavigation}
                onDeleteAccount={handleDeleteAccount}
              />
            </Suspense>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-4 py-6 md:py-12 pb-40 relative min-h-[100dvh] flex flex-col animate-fade-in safe-top">

            <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden bg-black" />

            <Suspense fallback={null}>
              {showPremiumModal && (
                <PremiumModal
                  onClose={handleBackNavigation}
                  onUpgrade={handleUpgrade}
                  onRestore={handleRestorePurchases}
                />
              )}
              <SavedModal
                isOpen={showSavedModal}
                onClose={handleBackNavigation}
                savedItems={savedItems}
                onDelete={handleDeleteSaved}
              />
            </Suspense>


            <nav className="flex justify-between items-center mb-8 md:mb-12">
              <button onClick={handleLogout} className="px-3 py-1.5 text-xs md:text-sm text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all uppercase tracking-widest font-medium border border-transparent hover:border-white/10 flex items-center gap-2 active:scale-95">
                <span className="text-lg">←</span> <span>Logout</span>
              </button>

              <div className="flex items-center gap-2 md:gap-3">

                <button onClick={handleOpenSaved} className="p-2 md:px-4 md:py-2 bg-white/5 hover:bg-white/10 rounded-full flex items-center gap-1.5 transition-all border border-white/5 active:scale-95">
                  <span className="text-rose-500 text-base md:text-lg">♥</span>
                  <span className="hidden md:inline text-xs font-bold text-white">Saved</span>
                </button>

                {!profile?.is_premium && (
                  <button onClick={handleOpenPremium} className="hidden md:flex px-4 py-2 bg-gradient-to-r from-yellow-600 to-yellow-400 text-black text-xs font-bold rounded-full items-center gap-1 hover:brightness-110 transition-all active:scale-95">
                    <span>👑</span> Go Premium
                  </button>
                )}

                <div
                  onClick={() => showToast("Credits reset to 5 daily. Extra ad credits do not stack.", "info")}
                  className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full border backdrop-blur-md cursor-pointer active:scale-95 transition-all ${profile?.is_premium ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-white/5 border-white/10'}`}
                >
                  <span className={profile?.is_premium ? "text-yellow-400 text-lg" : "text-yellow-400 text-lg"}>
                    {profile?.is_premium ? '👑' : '⚡'}
                  </span>
                  <span className={`font-bold text-xs md:text-sm ${profile?.is_premium ? 'text-yellow-400' : 'text-white'}`}>
                    {profile?.is_premium ? 'Unlimited' : `${profile?.credits} Credits`}
                  </span>
                </div>
              </div>
            </nav>

            <header className="text-center mb-8 md:mb-12">
              <div className="inline-block relative">
                <h1 className="text-5xl md:text-7xl font-black mb-2 tracking-tighter bg-gradient-to-r from-rose-400 via-amber-200 to-rose-400 bg-clip-text text-transparent pb-2 animate-text-shimmer">
                  Rizz Master
                </h1>
                {profile?.is_premium && <div className="absolute -top-4 -right-6 md:-right-8 rotate-12 bg-yellow-500 text-black font-bold text-[10px] md:text-xs px-2 py-1 rounded shadow-lg">PRO</div>}
              </div>
              <p className="text-white/60 text-sm md:text-xl font-light max-w-md mx-auto leading-relaxed">
                Never send a boring text again.
              </p>
            </header>

            {/* Main Mode Selection */}
            <div className="flex gap-3 mb-8 max-w-lg mx-auto w-full select-none">
              <button onClick={() => { setMode(InputMode.CHAT); clear(); }} className={`flex-1 py-3.5 rounded-2xl font-medium text-[13px] md:text-base transition-all duration-300 ${mode === InputMode.CHAT ? 'rizz-gradient text-white shadow-lg shadow-rose-500/20 shadow-purple-500/20' : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'}`}>Chat Reply</button>
              <button onClick={() => { setMode(InputMode.BIO); clear(); }} className={`flex-1 py-3.5 rounded-2xl font-medium text-[13px] md:text-base transition-all duration-300 ${mode === InputMode.BIO ? 'rizz-gradient text-white shadow-lg shadow-rose-500/20 shadow-purple-500/20' : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'}`}>Profile Bio</button>
              <button onClick={() => { handleViewNavigation('COACH'); }} className="flex-1 py-3.5 rounded-2xl font-medium text-[13px] md:text-base transition-all duration-300 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center gap-1.5">Coach</button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-start">
              <section className="glass rounded-3xl p-5 md:p-6 border border-white/10 lg:sticky lg:top-8 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto custom-scrollbar">
                <div className="mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <label className="block text-xs font-bold text-white/50 uppercase tracking-widest">
                      {mode === InputMode.CHAT ? 'The Context' : 'About You'}
                    </label>
                    <div className="flex items-center gap-3">
                      {inputText.length > 0 && (
                        <button onClick={() => setInputText('')} className="text-xs text-white/30 hover:text-white">Clear</button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={inputText}
                    onChange={(e) => { setInputText(e.target.value); if (inputError) setInputError(null); }}
                    placeholder={mode === InputMode.CHAT ? "Paste chat. Get Rizz." : "Hobbies, job, vibes..."}
                    className="w-full h-32 md:h-40 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm md:text-base focus:ring-2 focus:ring-rose-500/50 focus:outline-none resize-none transition-all placeholder:text-white/20"
                    style={{ fontSize: '16px' }}
                  />
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-3">
                    Select Vibe (Optional)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {(mode === InputMode.CHAT ? VIBES_CHAT : VIBES_BIO).map((vibe) => (
                      <button
                        key={vibe.label}
                        onClick={() => handleVibeClick(vibe)}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95 flex items-center gap-1.5 ${selectedVibe === vibe.label
                          ? 'bg-rose-500/20 border-rose-500 text-rose-300'
                          : vibe.isPro && !profile?.is_premium
                            ? 'bg-white/5 border-yellow-500/30 text-white/40 hover:bg-white/10'
                            : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
                          }`}
                      >
                        {vibe.label}
                        {vibe.isPro && !profile?.is_premium && <span className="text-[10px]">🔒</span>}
                        {vibe.isPro && profile?.is_premium && selectedVibe !== vibe.label && <span className="text-[10px] text-yellow-500">👑</span>}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mb-6">
                  <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-3">
                    Response Length
                  </label>
                  <div className="flex p-0.5 bg-white/5 rounded-xl border border-white/10 select-none w-fit">
                    <button
                      onClick={() => setResponseLength('short')}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all min-w-[80px] ${responseLength === 'short' ? 'bg-rose-500 text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                    >
                      SHORT
                    </button>
                    <button
                      onClick={() => setResponseLength('medium')}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all min-w-[80px] ${responseLength === 'medium' ? 'bg-rose-500 text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                    >
                      MEDIUM
                    </button>
                    <button
                      onClick={() => setResponseLength('long')}
                      className={`px-4 py-1.5 rounded-lg text-[10px] font-black transition-all min-w-[80px] ${responseLength === 'long' ? 'bg-rose-500 text-white shadow-lg' : 'text-white/40 hover:text-white/60'}`}
                    >
                      LONG
                    </button>
                  </div>
                </div>

                {mode === InputMode.CHAT && (
                  <div className="mb-4 md:mb-6">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <button
                        onClick={handleCameraCapture}
                        className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all active:scale-[0.98]"
                      >
                        <span className="text-xl">📸</span>
                        <span className="text-sm font-bold text-white/80">Camera</span>
                      </button>
                      <button
                        onClick={handleGalleryCapture}
                        className="flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all active:scale-[0.98]"
                      >
                        <span className="text-xl">🖼️</span>
                        <span className="text-sm font-bold text-white/80">Gallery</span>
                      </button>
                    </div>

                    {image && (
                      <div
                        className="group border-2 border-dashed border-white/10 rounded-2xl transition-all p-2 relative"
                      >
                        <img src={image} alt="Preview" className="w-full max-h-48 object-contain rounded-lg mx-auto" />
                        <button onClick={(e) => { e.stopPropagation(); setImage(null); }} className="absolute top-2 right-2 bg-black/80 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm border border-white/20">✕</button>
                      </div>
                    )}
                    <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
                  </div>
                )}

                {inputError && (
                  <div className="mb-4 p-3 bg-red-500/10 border border-red-500/50 rounded-xl flex items-center justify-center gap-2 animate-pulse">
                    <span className="text-lg">⚠️</span>
                    <p className="text-sm text-red-200 font-medium">{inputError}</p>
                  </div>
                )}

                {(profile?.is_premium || (profile?.credits || 0) > 0) ? (
                  <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className={`w-full py-3.5 md:py-4 rounded-2xl font-bold text-base md:text-lg shadow-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed ${profile?.is_premium
                      ? "bg-gradient-to-r from-yellow-500 to-amber-600 text-black"
                      : "rizz-gradient text-white"
                      }`}
                  >
                    {loading ? (
                      <span className="flex items-center justify-center gap-2 animate-pulse">
                        <svg className={`animate-spin h-5 w-5 ${profile?.is_premium ? 'text-black' : 'text-white'}`} viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                        {loadingMsg}
                      </span>
                    ) : (
                      profile?.is_premium ? "Get Rizz (VIP)" : `Get Rizz (${(mode === InputMode.CHAT && image) ? 2 : 1} ⚡)`
                    )}
                  </button>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={handleWatchAd} disabled={isAdLoading !== 'hidden'} className="bg-white/10 border border-white/10 py-3.5 md:py-4 rounded-2xl font-bold text-sm md:text-base hover:bg-white/20 active:scale-[0.98] transition-all flex flex-col items-center justify-center">
                      {isAdLoading !== 'hidden' ? <span className="text-white/50 text-xs">Loading...</span> : <><span className="text-xl mb-1">📺</span> <span>Watch Ad (+5)</span></>}
                    </button>
                    <button onClick={handleOpenPremium} className="bg-gradient-to-r from-yellow-500 to-amber-600 text-black py-3.5 md:py-4 rounded-2xl font-bold text-sm md:text-base shadow-xl hover:brightness-110 active:scale-[0.98] transition-all flex flex-col items-center justify-center animate-pulse">
                      <span className="text-xl mb-1">👑</span> <span>Go Unlimited</span>
                    </button>
                  </div>
                )}
                {!profile?.is_premium && (
                  <p
                    onClick={() => showToast("Credits reset to 5 daily. Extra ad credits do not stack.", "info")}
                    className="text-center text-[10px] md:text-xs text-white/30 mt-3 md:mt-4 cursor-pointer hover:text-white transition-colors"
                  >
                    {profile?.credits} daily credits remaining. <span className="text-yellow-500/80 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); handleOpenPremium(); }}>Upgrade.</span>
                  </p>
                )}
              </section>

              <section className="flex flex-col gap-4 md:gap-6 min-h-[300px]">
                {!result && !loading && (
                  <div className="h-full flex flex-col items-center justify-center text-white/20 py-12 px-4 text-center border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.02] select-none">
                    <span className="text-5xl md:text-6xl mb-4 grayscale opacity-50">✨</span>
                    <p className="text-sm md:text-xl font-medium max-w-[200px] md:max-w-none mx-auto">Results will appear here.</p>
                  </div>
                )}

                {result && 'tease' in result && (
                  <>
                    <div className="glass rounded-3xl p-5 md:p-6 border border-white/10 animate-fade-in-up">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-xs font-bold uppercase tracking-widest text-white/40">Analysis</h3>
                        <span className="text-2xl md:text-3xl font-black text-white">{result.loveScore}%</span>
                      </div>
                      <div className="mb-4">
                        <div className="text-xl md:text-2xl font-black text-rose-500 uppercase italic leading-none">{result.potentialStatus}</div>
                      </div>
                      <div className="relative h-3 md:h-4 bg-black/40 rounded-full overflow-hidden border border-white/5">
                        <div className="absolute top-0 left-0 h-full rizz-gradient transition-all duration-1000 ease-out" style={{ width: `${result.loveScore}%` }}></div>
                      </div>
                      {result.analysis && <p className="mt-4 text-xs md:text-sm text-white/60 leading-relaxed border-t border-white/5 pt-3">{result.analysis}</p>}
                    </div>

                    <div className="grid gap-3 md:gap-4 pb-12">
                      <RizzCard label="Tease" content={result.tease} icon="😏" color="from-purple-500 to-indigo-500" isSaved={isSaved(result.tease)} type="tease" onSave={handleSaveWrapper} onReport={handleReport} delay={0.1} />
                      <RizzCard label="Smooth" content={result.smooth} icon="🪄" color="from-blue-500 to-cyan-500" isSaved={isSaved(result.smooth)} type="smooth" onSave={handleSaveWrapper} onReport={handleReport} delay={0.2} />
                      <RizzCard label="Chaotic" content={result.chaotic} icon="🤡" color="from-orange-500 to-red-500" isSaved={isSaved(result.chaotic)} type="chaotic" onSave={handleSaveWrapper} onReport={handleReport} delay={0.3} />
                    </div>
                  </>
                )}

                {result && 'bio' in result && (
                  <div className="glass rounded-3xl p-6 md:p-8 border border-white/10 animate-fade-in-up pb-12">
                    <div className="flex items-center gap-2 mb-4 md:mb-6">
                      <span className="text-2xl">📝</span>
                      <h3 className="text-xs md:text-sm font-semibold uppercase tracking-widest text-white/60">Bio Result</h3>
                      <div className="ml-auto flex gap-2">
                        <button onClick={() => { NativeBridge.copyToClipboard(result.bio); showToast('Bio copied!', 'success'); }} className="p-2 rounded-full hover:bg-white/10 transition-all text-white/50 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg></button>
                        <button onClick={() => toggleSave(result.bio, 'bio')} className={`p-2 rounded-full hover:bg-white/10 transition-all ${isSaved(result.bio) ? 'text-rose-500' : 'text-white/50 hover:text-rose-400'}`}><svg className="w-5 h-5" fill={isSaved(result.bio) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg></button>
                      </div>
                    </div>
                    <p className="text-lg md:text-xl leading-relaxed font-medium mb-6 md:mb-8 text-white">{result.bio}</p>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 mb-4"><h4 className="text-[10px] uppercase font-bold text-rose-400 mb-1">Why it works</h4><p className="text-xs md:text-sm text-white/60">{result.analysis}</p></div>
                    <button onClick={() => { NativeBridge.copyToClipboard(result.bio); showToast('Bio copied!', 'success'); }} className="w-full py-3 border border-white/20 rounded-xl hover:bg-white/5 transition-colors text-sm font-medium flex items-center justify-center gap-2"><span>📋</span> Copy Bio</button>
                  </div>
                )}
              </section>
            </div>

            {/* Sticky Ad Container (WEB ONLY) - Hidden on Native to prevent overlap */}
            {!profile?.is_premium && !Capacitor.isNativePlatform() && (
              <div className="fixed bottom-0 left-0 right-0 z-40 bg-black/90 backdrop-blur-md border-t border-white/10 pb-[env(safe-area-inset-bottom)] pt-2 animate-slide-up-fade">
                <div className="max-w-md mx-auto px-2">
                  <AdSenseBanner
                    dataAdSlot={ADSENSE_SLOT_ID}
                    className="!my-0 !min-h-[50px] !bg-transparent !border-none"
                  />
                </div>
              </div>
            )}

            <Footer className="mt-12 md:mt-20" onNavigate={handleViewNavigation} />
          </div>
        )}
      </div>
    </div>
  );
}

// Wrap AppContent with Provider
const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};

export default App;
