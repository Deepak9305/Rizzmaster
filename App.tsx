
import React, { useState, useRef, useEffect, lazy, Suspense, useCallback } from 'react';
import { generateRizz, generateBio } from './services/rizzService';
import { NativeBridge } from './services/nativeBridge';
import { NotificationService } from './services/notificationService';
import { ToastProvider, useToast } from './context/ToastContext';
import { InputMode, RizzResponse, BioResponse, SavedItem, UserProfile, RizzOrBioResponse, ResponseLength, CustomPersona } from './types';
import { supabase } from './services/supabaseClient';
import RizzCard from './components/RizzCard';
import Footer from './components/Footer';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Keyboard } from '@capacitor/keyboard';
import { StatusBar, Style } from '@capacitor/status-bar';
import { AdMobService } from './services/admobService';
import { OneSignalService } from './services/oneSignalService';
import IAPService from './services/iapService';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Network } from '@capacitor/network';

// Lazy Load Heavy Components / Modals
const PremiumModal = lazy(() => import('./components/PremiumModal'));
const SavedModal = lazy(() => import('./components/SavedModal'));
const InfoPages = lazy(() => import('./components/InfoPages'));
const RizzCoach = lazy(() => import('./components/RizzCoach'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const OnboardingFlow = lazy(() => import('./components/OnboardingFlow'));
import ErrorBoundary from './components/ErrorBoundary';
import NoInternetOverlay from './components/NoInternetOverlay';

const DAILY_CREDITS = 5;
const INTERSTITIAL_PRELOAD_RETRY_MS = 15000;
const INTERSTITIAL_REFRESH_INTERVAL_MS = 8 * 60 * 1000;

// --- AD CONFIGURATION ---
const USE_TEST_ADS = false; // Set to true for testing with Google test ads

const AD_IDS = {
  INTERSTITIAL: {
    ANDROID: USE_TEST_ADS ? 'ca-app-pub-3940256099942544/1033173712' : 'ca-app-pub-7381421031784616/5183026259',
    IOS: 'ca-app-pub-3940256099942544/4411468910' // Test ID
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

const runAdTask = (label: string, task: Promise<boolean>) => {
  void task.then((success) => {
    if (!success) {
      console.warn(`[AdMob] ${label} did not complete successfully.`);
    }
  }).catch((error) => {
    console.warn(`[AdMob] ${label} crashed unexpectedly:`, error);
  });
};

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
    <div className={`fixed inset-0 z-[9999] bg-black flex flex-col items-center justify-center overflow-hidden transition-all duration-[800ms] ${isExiting ? 'opacity-0 scale-105 pointer-events-none' : 'opacity-100'}`}>
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

const AdLoadingOverlay: React.FC<{ mode: 'hidden' | 'interstitial' }> = ({ mode }) => {
  if (mode === 'hidden') return null;

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center animate-fade-in pointer-events-none">
      {/* Semi-transparent backdrop to ensure viewability signals pass through if needed */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />

      {/* Minimal Loader Content */}
      <div className="relative flex flex-col items-center pointer-events-auto">
        <div className="h-12 w-12 relative mb-6">
          <div className="absolute inset-0 rounded-full border-2 border-white/5" />
          <div className="absolute inset-0 rounded-full border-2 border-white/80 border-t-transparent animate-spin" style={{ animationDuration: '1s' }} />
        </div>

        <h3 className="text-xs font-medium tracking-[0.3em] text-white/60 uppercase text-center px-4">
          Preparing Ad
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);
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
  const [isAdLoading, setIsAdLoading] = useState<'hidden' | 'interstitial'>('hidden');
  const [isProfileLoadingHung, setIsProfileLoadingHung] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const lastOfflineStatusRef = useRef(false);
  const keyboardVisibleRef = useRef(false);

  // Custom Personas State
  const [customPersonas, setCustomPersonas] = useState<CustomPersona[]>([]);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState<CustomPersona | null>(null);
  const [personaName, setPersonaName] = useState('');
  const [personaInstruction, setPersonaInstruction] = useState('');

  // Guest Mode State
  const [isGuest, setIsGuest] = useState(false);

  const handleGuestEntry = useCallback(() => {
    setIsGuest(true);
    const guestNotes = localStorage.getItem('rizzmaster_guest_shadow_notes') || 'Playing it cool as a guest. 😎';

    // --- GUEST CREDIT EXPLOIT FIX ---
    let guestCredits = DAILY_CREDITS;
    const lastReset = localStorage.getItem('rizzmaster_guest_last_reset');
    const todayStr = new Date().toDateString();

    if (lastReset === todayStr) {
      // Same day, load existing credits
      const savedCredits = localStorage.getItem('rizzmaster_guest_credits');
      if (savedCredits !== null && !isNaN(parseInt(savedCredits))) {
        guestCredits = parseInt(savedCredits);
      }
    } else {
      // New day (or first time), reset to DAILY_CREDITS and store new date
      localStorage.setItem('rizzmaster_guest_last_reset', todayStr);
      localStorage.setItem('rizzmaster_guest_credits', DAILY_CREDITS.toString());
    }

    // Provide a mock guest profile
    setProfile({
      id: 'guest_user',
      email: 'guest@rizzmaster.local',
      credits: guestCredits, // Dynamically loaded
      is_premium: false,
      last_daily_reset: new Date().toISOString(),
      shadow_notes: guestNotes
    } as any);
    showToast(`Entered Guest Mode! ⚡ (${guestCredits} Credits)`, "info");
  }, [showToast]);

  const handleExitGuestMode = useCallback(() => {
    setIsGuest(false);
    setProfile(null);
    setSession(null);
    setCurrentView('HOME');

    // Privacy: Wipe all session-based Rizz AI data
    localStorage.removeItem('rizz_coach_messages_v2_guest_user');
    localStorage.removeItem('rizzmaster_guest_shadow_notes');
    localStorage.removeItem('rizz_coach_shadow_notes_guest_user');
    localStorage.removeItem('rizz_custom_personas_guest_user');

    // Legacy generic cleanup
    localStorage.removeItem('rizz_coach_messages_v2');
  }, []);

  useEffect(() => {
    if (profile?.id) {
      try {
        const stored = localStorage.getItem(`rizz_custom_personas_${profile?.id}`);
        if (stored) setCustomPersonas(JSON.parse(stored));
      } catch (e) {
        console.warn("Failed to load personas:", e);
      }
    } else {
      setCustomPersonas([]);
    }
  }, [profile?.id]);

  const saveCustomPersonas = useCallback((newPersonas: CustomPersona[]) => {
    if (!profile?.id) return;
    setCustomPersonas(newPersonas);
    localStorage.setItem(`rizz_custom_personas_${profile.id}`, JSON.stringify(newPersonas));
  }, [profile?.id]);

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

  useEffect(() => {
    keyboardVisibleRef.current = isKeyboardVisible;
  }, [isKeyboardVisible]);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    let cancelled = false;
    const listenerHandles: Array<{ remove: () => Promise<void> | void }> = [];
    const updateKeyboardVisibility = (visible: boolean) => {
      keyboardVisibleRef.current = visible;
      setIsKeyboardVisible(prev => (prev === visible ? prev : visible));
    };

    void Promise.all([
      Keyboard.addListener('keyboardWillShow', () => updateKeyboardVisibility(true)),
      Keyboard.addListener('keyboardDidShow', () => updateKeyboardVisibility(true)),
      Keyboard.addListener('keyboardWillHide', () => updateKeyboardVisibility(false)),
      Keyboard.addListener('keyboardDidHide', () => updateKeyboardVisibility(false)),
    ]).then((handles) => {
      if (cancelled) {
        handles.forEach(handle => void handle.remove());
        return;
      }
      listenerHandles.push(...handles);
    }).catch((error) => {
      console.warn('[Keyboard] Failed to attach listeners:', error);
    });

    return () => {
      cancelled = true;
      listenerHandles.forEach(handle => void handle.remove());
    };
  }, []);

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

  // Network Connectivity Monitoring
  useEffect(() => {
    // Initial State
    Network.getStatus().then(status => {
      const isCurrentlyOffline = !status.connected;
      setIsOffline(isCurrentlyOffline);
      lastOfflineStatusRef.current = isCurrentlyOffline;
    });

    const listener = Network.addListener('networkStatusChange', status => {
      const isNowOffline = !status.connected;
      const wasOffline = lastOfflineStatusRef.current;

      // Update State
      setIsOffline(isNowOffline);
      lastOfflineStatusRef.current = isNowOffline;

      // Only show toast if the status actually CHANGED
      if (isNowOffline !== wasOffline) {
        if (!isNowOffline) {
          showToast("Connection Restored 📡", "success");
        } else {
          showToast("Connection Lost ⚠️", "error");
        }
      }
    });

    return () => {
      listener.then(l => l.remove());
    };
  }, [showToast]);

  // Sync profile ref
  useEffect(() => {
    profileRef.current = profile;

    // Link OneSignal External ID when profile is loaded
    if (Capacitor.isNativePlatform() && profile?.id) {
      OneSignalService.setExternalId(profile.id);
    }
  }, [profile]);

  // --- INTERSTITIAL AD ACTIVE TIME TRACKING ---
  // We use refs here because we need these values to be immediately available
  // in background/foreground event listeners and intervals without causing re-renders.
  const activeTimeMs = useRef<number>(0);
  const lastAdActiveTime = useRef<number>(-120000); // Bug 6 fix: pre-subtract 1 cooldown so the first ad can show immediately
  const backgroundTimestamp = useRef<number | null>(null);
  const adTransitionInProgressRef = useRef<boolean>(false); // Bug 3 fix: prevents double-fire from both nav handlers

  const INTERSTITIAL_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes (Cooldown between ads)
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
    let cancelled = false;
    let appStateListener: any;

    // Using a separate listener specifically for the vital time tracking
    // to keep it decoupled from the ad refresh logic below.
    CapacitorApp.addListener('appStateChange', async ({ isActive }) => {
      const now = Date.now();

      if (isActive) {
        // App came to FOREGROUND
        if (backgroundTimestamp.current !== null) {
          const timeInBackground = now - backgroundTimestamp.current;

          if (timeInBackground >= INACTIVITY_RESET_MS) {
            // Reset active time and ad tracking to grant a new grace period
            activeTimeMs.current = 0;
            lastAdActiveTime.current = 0;
          }
          // We are no longer in the background
          backgroundTimestamp.current = null;

          // Record usage and refresh notification schedule
          await NotificationService.recordUsage();
          await NotificationService.schedulePersonalizedNotifications();

          // Do not warm-load full-screen ads on resume. Broad resume preloads create
          // matched requests that often expire unused and hurt AdMob show rate.
        }
      } else {
        // App went to BACKGROUND — flush session time to Supabase
        backgroundTimestamp.current = now;

        const sessionTimeMs = activeTimeMs.current;
        if (sessionTimeMs > 0) {
          const currentProfile = profileRef.current;
          if (supabase && currentProfile && currentProfile.id !== 'guest_user') {
            const newTotal = (currentProfile.total_time_spent_ms || 0) + sessionTimeMs;
            supabase.from('profiles')
              .update({ total_time_spent_ms: newTotal })
              .eq('id', currentProfile.id)
              .then(({ error }) => {
                if (error) console.warn('[Analytics] Time flush failed:', error.message);
                else console.log(`[Analytics] Flushed ${Math.round(sessionTimeMs / 1000)}s of session time.`);
              });
          }
          // Reset so we don't double-count on next foreground
          activeTimeMs.current = 0;
        }
      }
    }).then(listener => {
      // If the effect has already torn down (e.g. StrictMode double-invoke or fast refresh)
      // before addListener resolved, remove it now — otherwise it leaks and double-counts
      // session time on the next background event.
      if (cancelled) {
        listener.remove();
        return;
      }
      appStateListener = listener;
    });

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (appStateListener) appStateListener.remove();
    };
  }, []);
  // --- END ACTIVE TIME TRACKING ---

  const initializeNotifications = useCallback(() => {
    // OneSignal Push Notifications
    OneSignalService.initialize();
    // Local Notifications & Usage Tracking
    NotificationService.initialize();
  }, []);

  // Check for Onboarding on Mount
  useEffect(() => {
    const hasSeenOnboarding = localStorage.getItem('rizz_onboarding_completed');
    if (!hasSeenOnboarding) {
      setShowOnboarding(true);
    } else {
      initializeNotifications();
    }
  }, [initializeNotifications]);

  const handleOnboardingComplete = () => {
    localStorage.setItem('rizz_onboarding_completed', 'true');
    setShowOnboarding(false);
    initializeNotifications();
  };

  // Define handleUpgrade using REF to avoid stale closures
  const handleUpgrade = useCallback(async () => {
    const currentProfile = profileRef.current;
    // If guest taps Upgrade, close the modal and send them to sign-in/sign-up
    if (!currentProfile || currentProfile.id === 'guest_user' || isGuest) {
      setShowPremiumModal(false);
      handleExitGuestMode();
      return;
    }

    // TODO: Connect Apple App Store / Google Play Billing APIs on backend to verify receipt/transaction token
    try {
      let token = '';
      if (supabase) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          token = session.access_token;
        }
      }

      const platform = Capacitor.getPlatform();
      const products = IAPService.products;
      const mainSub = products.find(p => p.state === 'owned' || p.state === 'approved' || p.state === 'verified');
      const productId = mainSub?.id || 'premium_manual';
      const transactionId = mainSub?.transactionId || (mainSub as any)?.purchase?.transactionId || `manual_${Date.now()}`;

      const response = await fetch('/api/verify-purchase', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          platform,
          productId,
          transactionId
        })
      });

      const resData = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(resData?.error || `Server returned status ${response.status}`);
      }

      if (resData && resData.profile) {
        setProfile(resData.profile);
        profileRef.current = resData.profile;
      } else {
        const updatedProfile = { ...currentProfile, is_premium: true, premium_source: 'native' };
        setProfile(updatedProfile);
        profileRef.current = updatedProfile;
      }

      if (stateRef.current.showPremiumModal) {
        window.history.back();
      }

      showToast(`Welcome to the Elite Club! 👑`, 'success');
    } catch (err) {
      console.error("Failed to verify purchase:", err);
      showToast("Verification failed. Please try again or contact support.", "error");
    }
  }, [showToast, isGuest, handleExitGuestMode]);

  // Interstitial ads are now preloaded strictly sequentially (startup -> show -> preload next)

  // Initialize Native Services
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;

    const timerIds: ReturnType<typeof setTimeout>[] = [];
    let isMounted = true;

    // Defer heavy native plugin initialization so the initial React render is fully unblocked
    timerIds.push(setTimeout(() => {
      // Google Auth
      const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
      GoogleAuth.initialize({
        clientId: clientId || 'YOUR_WEB_CLIENT_ID_PLACEHOLDER',
        scopes: ['profile', 'email'],
        grantOfflineAccess: false,
      });

      // AdMob
      runAdTask('Initial AdMob init', AdMobService.initialize().then(() => {
        return AdMobService.prepareInterstitial(getAdId('INTERSTITIAL'));
      }));

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
    }, 1000)); // Deferred by 1 second to prioritize frame rendering initial paint

    // --- SILENT RE-VERIFICATION FOR "WEB-BUY" EXPLOITERS ---
    // If user is premium but 'unverified', they likely used the web loophole.
    // We force a Restore to confirm they have a real Store receipt.
    timerIds.push(setTimeout(async () => {
      // Wait for profile to settle if it hasn't yet (avoid false revocations)
      const checkVerification = async () => {
        const currentProfile = profileRef.current;
        if (!currentProfile) {
          // If profile not loaded yet, retry once after 5s
          if (!isMounted) return;
          timerIds.push(setTimeout(checkVerification, 5000));
          return;
        }

        if (currentProfile.is_premium && currentProfile.premium_source === 'unverified') {
          console.log("IAP: User is premium but 'unverified'. Starting silent restore check...");
          try {
            await IAPService.restore();

            // Wait 15s for store status to update
            timerIds.push(setTimeout(async () => {
              if (!isMounted) return;
              const refreshedProfile = profileRef.current;
              // If source is STILL unverified, it means no store receipt was found during restore
              if (refreshedProfile?.is_premium && refreshedProfile.premium_source === 'unverified') {
                console.warn("IAP: Re-verification failed (No Store Receipt). Revoking premium.");
                setProfile(prev => prev ? { ...prev, is_premium: false, premium_source: 'revoked' } : null);
                showToast("Subscription verification failed. Access revoked.", 'error');

                if (supabase) {
                  const { data: revokedProfile } = await supabase.rpc('admin_revoke_premium', { user_uuid: refreshedProfile.id });
                  if (revokedProfile) {
                    setProfile(revokedProfile as UserProfile);
                    profileRef.current = revokedProfile as UserProfile;
                  }
                }
              }
            }, 15000));
          } catch (e) {
            console.error("IAP: Re-verification process error", e);
          }
        }
      };

      checkVerification();
    }, 5000));

    return () => {
      isMounted = false;
      timerIds.forEach(id => clearTimeout(id));
    };
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

    let backButtonListener: any;

    const setupBackListener = async () => {
      // Only remove the back-button listener specifically — removeAllListeners() would
      // also kill the appStateChange listeners registered by other effects on the same mount.
      if (backButtonListener) backButtonListener.remove();

      backButtonListener = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
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
    return () => { backButtonListener?.remove(); };
  }, []);

  // Navigation Wrappers
  const handleViewNavigation = useCallback(async (view: ViewState) => {
    if (loading) return;
    if (view === currentView) return;

    window.history.pushState({ view }, '');
    setCurrentView(view);
  }, [currentView, loading, isGuest, showToast, handleExitGuestMode]);

  const handleBackNavigation = useCallback(() => {
    if (loading) {
      window.history.pushState({ view: currentView }, '');
      return;
    }
    // Navigate back immediately — don't block on the ad
    const state = window.history.state;
    if (state && (state.view !== 'HOME' || state.saved || state.premium)) {
      window.history.back();
    } else {
      // Fallback: directly set the view in case history is missing
      setCurrentView('HOME');
      setShowPremiumModal(false);
      setShowSavedModal(false);
    }


  }, [currentView, loading]);

  const handleOpenPremium = useCallback(() => {
    // Guests see the premium modal first so they understand what they're getting
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
      }
    });

    return () => {
      clearTimeout(failSafeTimeout);
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Profile Loading Timeout: Prevent indefinite loading spinner
  useEffect(() => {
    if (session && !profile && !isProfileLoadingHung) {
      const timer = setTimeout(() => {
        setIsProfileLoadingHung(true);
      }, 8000); // 8 seconds timeout
      return () => clearTimeout(timer);
    } else if (profile) {
      setIsProfileLoadingHung(false);
    }
  }, [session, profile, isProfileLoadingHung]);

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

  const loadUserData = useCallback(async (userId: string, email?: string) => {
    if (!supabase) return;

    try {
      const profilePromise = supabase.from('profiles').select('*').eq('id', userId).single();
      const savedPromise = supabase.from('saved_items').select('*').eq('user_id', userId).order('created_at', { ascending: false });

      const [profileResult, savedResult] = await Promise.all([profilePromise, savedPromise]);

      let profileData = profileResult.data;
      const savedData = savedResult.data;

      if (savedData) {
        setSavedItems(savedData as SavedItem[]);
      }

      if (profileResult.error?.code === 'PGRST116') {
        // New user — create their profile
        const { data: newProfile } = await supabase.from('profiles').insert([{
          id: userId,
          email: email,
          credits: DAILY_CREDITS,
          is_premium: false,
          last_daily_reset: new Date().toISOString().split('T')[0],
          shadow_notes: '',
          streak_count: 1,
          last_streak_claim: new Date().toISOString().split('T')[0],
          total_time_spent_ms: 0,
        }]).select().single();
        if (newProfile) profileData = newProfile;
      } else if (profileData) {
        // Delegate daily credits reset and streak tracking to the backend RPC
        try {
          const { data: claimData, error: claimError } = await supabase.rpc('claim_daily_credits_and_streak');
          if (claimError) {
            console.error("Failed to claim daily credits and streak:", claimError);
          } else if (claimData) {
            if (claimData.profile) {
              profileData = claimData.profile;
            }
            if (claimData.streak_msg && claimData.streak_msg.trim()) {
              // Show the streak toast after a brief delay so splash is gone
              setTimeout(() => showToast(claimData.streak_msg, 'success'), 1500);
            }
          }
        } catch (err) {
          console.error("Daily claim error:", err);
        }
      }

      if (profileData) {
        setProfile(profileData as UserProfile);

        // --- DAU ACTIVITY LOG (silent, fire-and-forget) ---
        // The PRIMARY KEY prevents duplicate inserts for the same user on the same day.
        Promise.resolve(supabase.from('user_activity_log')
          .insert([{ user_id: userId }]))
          .then(({ error }) => {
            if (error && error.code !== '23505') { // 23505 = unique violation (expected)
              console.warn('[Analytics] Activity log insert failed:', error.message);
            }
          })
          .catch((e: unknown) => console.warn('[Analytics] Activity log insert error:', e));

        // --- DATA MIGRATION: Sync legacy local notes to Supabase ---
        if (!profileData.shadow_notes) {
          try {
            const localNotes = localStorage.getItem(`rizz_coach_shadow_notes_${userId}`) || localStorage.getItem('rizz_coach_shadow_notes');
            if (localNotes && localNotes.trim()) {
              console.log("Migrating local shadow notes to cloud...");
              const { data: migratedProfile } = await supabase
                .from('profiles')
                .update({ shadow_notes: localNotes })
                .eq('id', userId)
                .select()
                .single();

              if (migratedProfile) {
                setProfile(migratedProfile as UserProfile);
              }
            }
          } catch (err) {
            console.warn("Migration check failed:", err);
          }
        } else {
          // Keep local state in sync so the coach remembers vibes across offline sessions
          localStorage.setItem(`rizz_coach_shadow_notes_${userId}`, profileData.shadow_notes);
        }
      }

    } catch (e) {
      console.error("Error loading user data", e);
    }
  }, [showToast]);

  const handleLogout = useCallback(async () => {
    const currentProfile = profileRef.current;

    if (isGuest) {
      handleExitGuestMode();
      showToast("Successfully logged out 👋", 'success');
      return;
    }
    if (!window.confirm("Are you sure you want to log out of Rizz Master?")) return;

    try {
      if (supabase) await supabase.auth.signOut();

      // Clear AI Session Data
      if (currentProfile?.id) {
        localStorage.removeItem(`rizz_coach_messages_v2_${currentProfile.id}`);
        localStorage.removeItem(`rizz_coach_shadow_notes_${currentProfile.id}`);
        localStorage.removeItem(`rizz_custom_personas_${currentProfile.id}`);
      }
      localStorage.removeItem('rizz_coach_messages_v2');
      localStorage.removeItem('rizzmaster_guest_shadow_notes');
      localStorage.removeItem('rizz_coach_shadow_notes');

      if (Capacitor.isNativePlatform()) {
        try { await GoogleAuth.signOut(); } catch (error) { console.warn("Native Logout err", error); }
        OneSignalService.logout();
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
  }, [showToast, isGuest, handleExitGuestMode]);




  const updateCredits = useCallback(async (newAmountOrUpdater: number | ((prev: number) => number)) => {
    setProfile(prev => {
      if (!prev) return null;
      let newAmount = typeof newAmountOrUpdater === 'function'
        ? newAmountOrUpdater(prev.credits || 0)
        : newAmountOrUpdater;
      
      newAmount = Math.max(0, newAmount);

      const updated = { ...prev, credits: newAmount };

      // Update LocalStorage for guest if needed, but no direct DB updates
      if (prev.id === 'guest_user') {
        localStorage.setItem('rizzmaster_guest_credits', newAmount.toString());
      }

      return updated;
    });
  }, []);

  const syncProfile = useCallback(async () => {
    if (!supabase) return;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', session.user.id)
      .single();
    if (data && !error) {
      setProfile(data as UserProfile);
      profileRef.current = data as UserProfile;
    }
  }, []);

  const handleRestorePurchases = useCallback(async () => {
    if (!profileRef.current) return;
    if (Capacitor.isNativePlatform()) {
      IAPService.restore();
    } else {
      showToast('Restore purchases is only available in the mobile app.', 'info');
    }
  }, [showToast]);

  const toggleSave = useCallback(async (content: string, type: 'tease' | 'smooth' | 'chaotic' | 'bio') => {
    const currentProfile = profileRef.current;
    if (!currentProfile) return;

    const isGuestUser = currentProfile.id === 'guest_user';
    const exists = savedItems.find(item => item.content === content);

    if (exists) {
      const originalItems = [...savedItems];
      const newItems = savedItems.filter(item => item.id !== exists.id);
      setSavedItems(newItems);
      showToast("Removed from saved", 'info');

      if (!isGuestUser && supabase) {
        const { error } = await supabase.from('saved_items').delete().eq('id', exists.id);
        if (error) {
          console.error("Delete saved item failed:", error);
          setSavedItems(originalItems);
          showToast("Failed to remove gem", "error");
        }
      }
    } else {
      const tempId = generateUUID();
      const newItem: SavedItem = {
        id: tempId,
        user_id: currentProfile.id,
        content,
        type,
        created_at: new Date().toISOString()
      };

      setSavedItems(prev => [newItem, ...prev]);
      showToast("Saved to your gems", 'success');

      if (!isGuestUser && supabase) {
        const { data, error } = await supabase
          .from('saved_items')
          .insert([{ user_id: currentProfile.id, content, type }])
          .select()
          .single();

        if (error || !data) {
          console.error("Save item error:", error);
          setSavedItems(prev => prev.filter(item => item.id !== tempId));
          showToast("Failed to save gem", "error");
        } else {
          setSavedItems(prev => prev.map(item => item.id === tempId ? (data as SavedItem) : item));
        }
      }
    }
  }, [savedItems, showToast]);

  const handleDeleteSaved = useCallback(async (id: string) => {
    const isGuestUser = profileRef.current?.id === 'guest_user';
    const originalItems = [...savedItems];
    const newItems = savedItems.filter(item => item.id !== id);
    setSavedItems(newItems);
    showToast("Item deleted", 'info');

    if (!isGuestUser && supabase) {
      const { error } = await supabase.from('saved_items').delete().eq('id', id);
      if (error) {
        console.error("Delete saved item error:", error);
        setSavedItems(originalItems);
        showToast("Failed to delete gem", "error");
      }
    }
  }, [savedItems, showToast]);

  const handleDeleteAccount = useCallback(async () => {
    // Confirmation is handled by the InfoPages UI — no window.confirm needed here.
    const currentProfile = profileRef.current;
    if (!currentProfile) return;

    if (currentProfile.id === 'guest_user' || isGuest) {
      localStorage.removeItem('rizzmaster_guest_shadow_notes');
      localStorage.removeItem('rizzmaster_guest_credits');
      localStorage.removeItem('rizzmaster_guest_last_reset');
      handleExitGuestMode();
      showToast("Guest account deleted", 'success');
      return;
    }

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

      // Clear AI Session Data
      localStorage.removeItem(`rizz_coach_messages_v2_${currentProfile.id}`);
      localStorage.removeItem(`rizz_coach_shadow_notes_${currentProfile.id}`);
      localStorage.removeItem('rizzmaster_guest_shadow_notes');

      // Cleanup any dangling legacy global data
      localStorage.removeItem('rizz_coach_messages_v2');
      localStorage.removeItem('rizz_coach_shadow_notes');
      if (currentProfile?.id) {
        localStorage.removeItem(`rizz_custom_personas_${currentProfile.id}`);
      }

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
  }, [showToast, isGuest, handleExitGuestMode]);

  const handleSaveWrapper = useCallback((content: string, type: 'tease' | 'smooth' | 'chaotic' | 'bio') => {
    toggleSave(content, type);
  }, [toggleSave]);

  const handleReport = useCallback(async (content?: string) => {
    if (!profileRef.current) return;
    try {
      if (supabase && profileRef.current.id !== 'guest_user') {
        await supabase.from('reports').insert([
          { user_id: profileRef.current.id, content: content || 'General Report', type: 'content_report' }
        ]);
      }
      showToast('Report submitted. We will review this.', 'info');
    } catch (err) {
      console.error("Report failed:", err);
      showToast('Failed to send report.', 'error');
    }
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
      reader.onerror = () => {
        console.error('FileReader error reading image.');
        showToast('Failed to load image. Please try another file.', 'error');
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

  const handleGenerate = useCallback(async (textToProcess?: string) => {
    if (loading) return;
    
    const currentProfile = profileRef.current || profile;
    if (!currentProfile) {
      console.error("handleGenerate: currentProfile is null.");
      return;
    }


    const text = typeof textToProcess === 'string' ? textToProcess : inputText;

    // Fix uncontrolled component state mismatch by relying on the passed textToProcess string directly when available
    const finalProcessText = (typeof textToProcess === 'string' ? textToProcess : (textareaRef.current?.value || inputText));

    if (mode === InputMode.CHAT && !finalProcessText.trim() && !image) {
      setInputError("Give me some context! Paste the chat or upload a screenshot.");
      return;
    }
    if (mode === InputMode.BIO && !text.trim()) {
      setInputError("I can't write a bio for a ghost! Tell me about your hobbies, job, or vibes.");
      return;
    }
    setInputError(null);

    const cost = (mode === InputMode.CHAT && image) ? 2 : 1;

    // Guests are rate-limited server-side (5 req/min by IP) but still adhere to client-side credit limits
    if (!currentProfile.is_premium && (currentProfile.credits || 0) < cost) {
      handleOpenPremium();
      return;
    }

    let shouldShowAd = false;
    if (!currentProfile.is_premium && Capacitor.isNativePlatform()) {
      const today = new Date().toDateString();
      const lastAdDate = localStorage.getItem('rizz_last_ad_date');
      let genCount = parseInt(localStorage.getItem('rizz_daily_gen_count') || '0');
      let lastAdGen = parseInt(localStorage.getItem('rizz_last_ad_gen_count') || '0');

      if (lastAdDate !== today) {
        genCount = 0;
        lastAdGen = 0;
        localStorage.setItem('rizz_last_ad_date', today);
        localStorage.setItem('rizz_last_ad_gen_count', '0');
      }

      genCount += 1;
      localStorage.setItem('rizz_daily_gen_count', genCount.toString());

      // Target: 3rd gen for first ad, then random between 3-5 for subsequent ads
      const isFirstAd = lastAdGen === 0;
      // Add slight randomness (3, 4, or 5) to prevent users from predicting exactly when the ad will hit
      const nextAdOffset = Math.floor(Math.random() * 3) + 3; 
      const targetGen = isFirstAd ? 3 : lastAdGen + nextAdOffset;

      const now = activeTimeMs.current;
      const cooldownPassed = isFirstAd || (now - lastAdActiveTime.current >= INTERSTITIAL_COOLDOWN_MS);
      
      if (genCount >= targetGen && cooldownPassed) {
        shouldShowAd = true;
        lastAdActiveTime.current = now;
        localStorage.setItem('rizz_last_ad_gen_count', genCount.toString());
        console.log(`[AdMob] Will trigger concurrent interstitial at gen ${genCount}...`);
      }
    }
    // --------------------------------------------------

    setLoading(true);

    // Fire the ad concurrently so the API generation happens in the background while the user watches the ad!
    if (shouldShowAd) {
      AdMobService.showInterstitial(getAdId('INTERSTITIAL'))
        .catch(e => console.warn("[AdMob] Deferred interstitial failed:", e))
        .finally(() => {
          runAdTask('Post-show preload', AdMobService.prepareInterstitial(getAdId('INTERSTITIAL')));
        });
    }

    // --- GENERATION START ---
    const creditsBefore = currentProfile.credits || 0;

    try {
      // Optimistic credit deduction for signed-in non-premium users only.
      // Guests are rate-limited server-side and have their own localStorage tracking below.
      if (!isGuest && !currentProfile.is_premium) {
        updateCredits(creditsBefore - cost);
      }

      const customInstruction = selectedVibe?.startsWith('custom:') ? customPersonas.find(p => p.id === selectedVibe.split(':')[1])?.instruction : undefined;

      let res;
      if (mode === InputMode.CHAT) {
        res = await generateRizz(finalProcessText, image || undefined, selectedVibe || undefined, responseLength, customInstruction);
      } else {
        res = await generateBio(finalProcessText, selectedVibe || undefined, responseLength, customInstruction);
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
      }

    } catch (error) {
      console.error(error);
      showToast('The wingman tripped! Try again.', 'error');
      if (!currentProfile.is_premium) updateCredits(creditsBefore);
    } finally {
      setLoading(false);
      // Don't call syncProfile for guests — they have no Supabase session
      if (!isGuest) {
        await syncProfile();
      } else {
        // Persist updated guest credits to localStorage (single deduction — not done above)
        const guestCredits = parseInt(localStorage.getItem('rizzmaster_guest_credits') || String(DAILY_CREDITS));
        const newGuestCredits = Math.max(0, guestCredits - cost);
        localStorage.setItem('rizzmaster_guest_credits', newGuestCredits.toString());
        updateCredits(newGuestCredits);
      }
    }
  }, [mode, inputText, image, selectedVibe, responseLength, showToast, handleOpenPremium, updateCredits, customPersonas, profile, isGuest, syncProfile, handleExitGuestMode]);


  const isSaved = useCallback((content: string) => savedItems.some(item => item.content === content), [savedItems]);
  const clear = useCallback(() => {
    setInputText('');
    setImage(null);
    setResult(null);
    setInputError(null);
    setSelectedVibe(null);
    // Also imperatively clear the uncontrolled textarea
    if (textareaRef.current) textareaRef.current.value = '';
  }, []);

  const updateShadowNotes = useCallback(async (newNotes: string) => {
    const currentProfile = profileRef.current;
    if (!currentProfile) return;

    setProfile(prev => prev ? { ...prev, shadow_notes: newNotes } : null);
    
    // Always sync to local storage for offline persistence
    localStorage.setItem(`rizz_coach_shadow_notes_${currentProfile.id}`, newNotes);

    if (!isGuest && currentProfile.id !== 'guest_user' && supabase) {
      Promise.resolve(supabase.from('profiles')
        .update({ shadow_notes: newNotes })
        .eq('id', currentProfile.id))
        .then(({ error }) => { if (error) console.error("Shadow Notes Sync Error:", error); })
        .catch((e: unknown) => console.warn('[ShadowNotes] Sync error:', e));
    }
  }, [isGuest]);

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

      {/* No Internet Overlay */}
      <NoInternetOverlay
        isVisible={isOffline}
        onRetry={async () => {
          const status = await Network.getStatus();
          setIsOffline(!status.connected);
          if (status.connected) showToast("We're back online! 📡", "success");
        }}
      />

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
        ) : (!session && !isGuest) ? (
          <LoginPage onGuestEntry={handleGuestEntry} />
        ) : !profile ? (
          <div className="min-h-screen flex flex-col items-center justify-center text-white p-4 bg-black safe-top safe-bottom">
            <div className="absolute inset-0 bg-rose-900/5 blur-[100px] pointer-events-none" />

            {isProfileLoadingHung ? (
              <div className="relative z-10 max-w-sm w-full glass p-8 rounded-3xl border border-white/10 text-center animate-fade-in">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-3xl mb-6 mx-auto border border-white/10">
                  🔌
                </div>
                <h2 className="text-xl font-bold text-white mb-3">Connection is weak</h2>
                <p className="text-sm text-white/50 mb-8">
                  Taking longer than usual to fetch your profile.
                </p>
                <button
                  onClick={() => window.location.reload()}
                  className="w-full py-3.5 rizz-gradient rounded-xl font-bold text-white active:scale-95 transition-all"
                >
                  Try Again
                </button>
              </div>
            ) : (
              <div className="flex flex-col items-center animate-fade-in">
                <svg className="animate-spin h-8 w-8 text-rose-500 mb-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p className="text-white/50 animate-pulse font-medium tracking-wide">COOKING PROFILE...</p>
              </div>
            )}
          </div>
        ) : currentView === 'COACH' ? (
          <div className="animate-slide-in-right-view fixed inset-0 z-[100] bg-black">
            <Suspense fallback={null}>
              <RizzCoach
                key={profile?.id || 'guest_user'}
                userId={profile?.id || 'guest_user'}
                isOpen={true}
                onClose={handleBackNavigation}
                credits={profile?.credits || 0}
                onUpdateCredits={updateCredits}
                isPremium={profile?.is_premium || false}
                onGoPremium={() => { handleBackNavigation(); handleOpenPremium(); }}
                shadowNotes={profile?.shadow_notes || ''}
                onUpdateShadowNotes={updateShadowNotes}
                customPersonas={customPersonas}
                onAddPersona={() => {
                  const limit = profile?.is_premium ? 3 : 1;
                  if (customPersonas.length >= limit) {
                    if (!profile?.is_premium) {
                      showToast("Free users can only have 1 custom persona. Upgrade to get 3!", "info");
                      handleOpenPremium();
                    } else {
                      showToast("Pro users can have up to 3 custom personas.", "info");
                    }
                    return;
                  }
                  setEditingPersona(null);
                  setPersonaName('');
                  setPersonaInstruction('');
                  setShowPersonaModal(true);
                }}
                onEditPersona={(persona) => {
                  setEditingPersona(persona);
                  setPersonaName(persona.name);
                  setPersonaInstruction(persona.instruction);
                  setShowPersonaModal(true);
                }}
              />
              {showPersonaModal && (
                <div className="fixed inset-0 z-[200] bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in">
                  <div className="bg-[#111] rounded-3xl p-6 w-full max-w-md border border-white/10 animate-scale-up relative">
                    <button onClick={() => setShowPersonaModal(false)} className="absolute top-4 right-4 text-white/50 hover:text-white pb-1 w-8 h-8 rounded-full border border-white/10 bg-white/5">✕</button>
                    <h2 className="text-xl font-bold text-white mb-4">{editingPersona ? 'Edit Persona' : 'New Persona'}</h2>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Persona Name</label>
                        <input
                          type="text"
                          maxLength={20}
                          value={personaName}
                          onChange={(e) => setPersonaName(e.target.value)}
                          placeholder="e.g. Tough Boss, Shy Nerd"
                          className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-rose-500/50 outline-none text-white placeholder:text-white/20"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-2">Instructions / Rules</label>
                        <textarea
                          value={personaInstruction}
                          onChange={(e) => setPersonaInstruction(e.target.value)}
                          placeholder="e.g. You are a tough but fair boss. Be sarcastic but give good advice."
                          className="w-full h-32 bg-black/40 border border-white/10 rounded-xl p-3 text-sm focus:ring-2 focus:ring-rose-500/50 outline-none resize-none text-white placeholder:text-white/20"
                        />
                      </div>
                      <div className="flex gap-3 pt-2">
                        <button onClick={() => {
                          const name = personaName.trim();
                          const inst = personaInstruction.trim();
                          if (!name || !inst) { showToast("Name and instructions required", "error"); return; }
                          if (editingPersona) {
                            saveCustomPersonas(customPersonas.map(p => p.id === editingPersona.id ? { ...p, name, instruction: inst } : p));
                            showToast("Persona updated", "success");
                          } else {
                            saveCustomPersonas([...customPersonas, { id: generateUUID(), name, instruction: inst }]);
                            showToast("Persona created", "success");
                          }
                          setShowPersonaModal(false);
                        }} className="flex-1 bg-white text-black font-bold py-3 rounded-xl hover:bg-white/90 transition-all active:scale-95">Save</button>
                        {editingPersona && (
                          <button onClick={() => {
                            if (window.confirm("Delete this persona?")) {
                              saveCustomPersonas(customPersonas.filter(p => p.id !== editingPersona.id));
                              if (selectedVibe === `custom:${editingPersona.id}`) setSelectedVibe(null);
                              setShowPersonaModal(false);
                              showToast("Persona deleted", "info");
                            }
                          }} className="px-4 bg-rose-500/10 text-rose-500 font-bold py-3 rounded-xl hover:bg-rose-500/20 transition-all border border-rose-500/20 active:scale-95">Delete</button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </Suspense>
          </div>
        )
          : currentView !== 'HOME' ? (
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
            <div className={`max-w-4xl mx-auto px-4 py-6 md:py-12 pb-0 relative min-h-[100dvh] flex flex-col safe-top ${currentView === 'HOME' ? 'animate-fade-in' : 'animate-view-zoom-out'}`}>

              <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden bg-black" />

              <Suspense fallback={null}>
                {showPremiumModal && (
                  <PremiumModal
                    onClose={handleBackNavigation}
                    onUpgrade={handleUpgrade}
                    onRestore={handleRestorePurchases}
                    isGuest={isGuest}
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
                      {profile?.is_premium ? 'Unlimited' : `${profile?.credits ?? 0} Credits`}
                    </span>
                  </div>
                </div>
              </nav>

              <header className="text-center mb-6 md:mb-8">
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
              <div className="flex gap-3 mb-6 max-w-lg mx-auto w-full select-none">
                <button onClick={() => { setMode(InputMode.CHAT); setInputText(''); if (textareaRef.current) textareaRef.current.value = ''; setImage(null); setResult(null); setInputError(null); }} className={`flex-1 py-3.5 rounded-2xl font-medium text-[13px] md:text-base transition-all duration-300 ${mode === InputMode.CHAT ? 'rizz-gradient text-white shadow-lg shadow-rose-500/20 shadow-purple-500/20' : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'}`}>Chat Reply</button>
                <button onClick={() => { setMode(InputMode.BIO); setInputText(''); if (textareaRef.current) textareaRef.current.value = ''; setImage(null); setResult(null); setInputError(null); }} className={`flex-1 py-3.5 rounded-2xl font-medium text-[13px] md:text-base transition-all duration-300 ${mode === InputMode.BIO ? 'rizz-gradient text-white shadow-lg shadow-rose-500/20 shadow-purple-500/20' : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'}`}>Profile Bio</button>
                <button onClick={() => { handleViewNavigation('COACH'); }} className="flex-1 py-3.5 rounded-2xl font-medium text-[13px] md:text-base transition-all duration-300 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center gap-1.5">Rizz AI</button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-start">
                <section className="glass rounded-3xl p-5 md:p-6 border border-white/10 lg:sticky lg:top-8 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto custom-scrollbar">
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-xs font-bold text-white/50 uppercase tracking-widest">
                        {mode === InputMode.CHAT ? 'The Context' : 'About You'}
                      </label>
                      <div className="flex items-center gap-3">
                        <button onClick={() => { if (textareaRef.current) textareaRef.current.value = ''; }} className="text-xs text-white/30 hover:text-white">Clear</button>
                      </div>
                    </div>
                    <textarea
                      ref={textareaRef}
                      defaultValue={inputText}
                      onChange={() => { if (inputError) setInputError(null); }}
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
                      onClick={() => handleGenerate(textareaRef.current?.value || '')}
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
                    <button onClick={handleOpenPremium} className="w-full bg-gradient-to-r from-yellow-500 to-amber-600 text-black py-3.5 md:py-4 rounded-2xl font-bold text-sm md:text-base shadow-xl hover:brightness-110 active:scale-[0.98] transition-all flex flex-col items-center justify-center animate-pulse">
                      Go Unlimited
                    </button>
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
                    <div className="h-full flex flex-col items-center justify-center text-white/20 py-6 px-4 text-center border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.02] select-none">
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

                      <div className="grid gap-3 md:gap-4 pb-6">
                        <RizzCard label="Tease" content={result.tease} icon="😏" color="from-purple-500 to-indigo-500" isSaved={isSaved(result.tease)} type="tease" onSave={handleSaveWrapper} onReport={handleReport} delay={0.1} />
                        <RizzCard label="Smooth" content={result.smooth} icon="🪄" color="from-blue-500 to-cyan-500" isSaved={isSaved(result.smooth)} type="smooth" onSave={handleSaveWrapper} onReport={handleReport} delay={0.2} />
                        <RizzCard label="Chaotic" content={result.chaotic} icon="🤡" color="from-orange-500 to-red-500" isSaved={isSaved(result.chaotic)} type="chaotic" onSave={handleSaveWrapper} onReport={handleReport} delay={0.3} />
                      </div>
                    </>
                  )}

                  {result && 'bio' in result && (
                    <div className="glass rounded-3xl p-6 md:p-8 border border-white/10 animate-fade-in-up pb-6">
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

              <Footer className="mt-2 md:mt-4" onNavigate={handleViewNavigation} />
            </div>
          )}
      </div>
    </div>
  );
}

// Wrap AppContent with Provider
const App: React.FC = () => {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Suspense fallback={<div className="min-h-screen bg-black" />}>
          <AppContent />
        </Suspense>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
