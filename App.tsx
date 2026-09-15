
import React, { useState, useRef, useEffect, lazy, Suspense, useCallback } from 'react';
import { generateRizz, generateBio } from './services/rizzService';
import { NativeBridge } from './services/nativeBridge';
import { NotificationService } from './services/notificationService';
import { ToastProvider, useToast } from './context/ToastContext';
import { InputMode, RizzResponse, BioResponse, SavedItem, UserProfile, RizzOrBioResponse, ResponseLength, CustomPersona } from './types';
import { supabase } from './services/supabaseClient';
import RizzCard from './components/RizzCard';
import Footer from './components/Footer';
import { createDodoPortalSession } from './services/dodoBillingService';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { AdMobService, type RewardVideoSsv } from './services/admobService';
import { OneSignalService } from './services/oneSignalService';
import IAPService from './services/iapService';
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';
import { Network } from '@capacitor/network';
import { getApiUrl, runtimeConfig } from './services/runtimeConfig';
import {
  canUseNativeAdMob,
  canUseNativeAppEvents,
  canUseNativeCamera,
  canUseNativeGoogleAuth,
  canUseNativeIap,
  canUseNativeNetwork,
  canUseNativeOneSignal,
  canUseNativeStatusBar,
} from './services/nativeCapabilities';
import ForceUpdateGate from './components/ForceUpdateGate';
import { loadUpdateGateConfig, type UpdateGateConfig } from './services/updateGateService';
import { completeRewardedAdAttempt, createRewardedAdAttempt, getRewardedAdStatus, type RewardedAdStatus } from './services/rewardedAdService';

// Lazy Load Heavy Components / Modals
const PremiumModal = lazy(() => import('./components/PremiumModal'));
const SavedModal = lazy(() => import('./components/SavedModal'));
const InfoPages = lazy(() => import('./components/InfoPages'));
const RizzCoach = lazy(() => import('./components/RizzCoach'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const OnboardingFlow = lazy(() => import('./components/OnboardingFlow'));
const WebPremiumModal = lazy(() => import('./components/WebPremiumModal'));
const WebAppMenu = lazy(() => import('./components/WebAppMenu'));
import ErrorBoundary from './components/ErrorBoundary';
import NoInternetOverlay from './components/NoInternetOverlay';

const DAILY_CREDITS = 5;
const IS_WEB_PLATFORM = !Capacitor.isNativePlatform();
const SILENT_PREMIUM_RESTORE_WAIT_MS = 45000;
const SILENT_PREMIUM_RESTORE_RETRY_MS = 60000;
const SILENT_PREMIUM_RESTORE_MAX_ATTEMPTS = 2;
const REWARDED_STATUS_POLL_ATTEMPTS = 20;

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

const runStartupTask = (label: string, task: Promise<unknown>) => {
  void task.catch((error) => {
    console.warn(`[Startup] ${label} failed:`, error);
  });
};

type ViewState = 'HOME' | 'PRIVACY' | 'TERMS' | 'SUPPORT' | 'COACH';

const PUBLIC_VIEW_PATHS: Record<Exclude<ViewState, 'HOME' | 'COACH'>, string> = {
  PRIVACY: '/privacy',
  TERMS: '/terms',
  SUPPORT: '/support',
};

const normalizePathname = (pathname: string) => {
  const trimmed = pathname.replace(/\/+$/, '');
  return trimmed || '/';
};

const getViewFromLocation = (): ViewState => {
  if (typeof window === 'undefined') {
    return 'HOME';
  }

  const path = normalizePathname(window.location.pathname).toLowerCase();

  switch (path) {
    case '/privacy':
    case '/privacy-policy':
      return 'PRIVACY';
    case '/terms':
    case '/terms-of-service':
      return 'TERMS';
    case '/support':
      return 'SUPPORT';
    case '/coach':
      return 'COACH';
    default:
      return 'HOME';
  }
};

const getPathForView = (view: ViewState) => {
  if (view in PUBLIC_VIEW_PATHS) {
    return PUBLIC_VIEW_PATHS[view as Exclude<ViewState, 'HOME' | 'COACH'>];
  }

  return view === 'COACH' ? '/coach' : '/';
};

const LOADING_MESSAGES = [
  "Analyzing context...",
  "Reading between the lines...",
  "Scanning for red flags...",
  "Consulting the Rizz God...",
  "Drafting fire replies...",
  "Polishing the charm...",
  "Cooking..."
];

// Keep rotating status text isolated so generation progress does not re-render
// the entire app shell every 1.5 seconds.
const LoadingMessage: React.FC = React.memo(() => {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((current) => (current + 1) % LOADING_MESSAGES.length);
    }, 1500);

    return () => clearInterval(timer);
  }, []);

  return <>{LOADING_MESSAGES[index]}</>;
});

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

const getTodayDateString = () => new Date().toISOString().split('T')[0];

const clearSignedInCreditShadow = (userId?: string | null) => {
  if (!userId || typeof localStorage === 'undefined' || userId === 'guest_user') {
    return;
  }

  localStorage.removeItem(`rizzmaster_user_credits_${userId}`);
  localStorage.removeItem(`rizzmaster_user_last_reset_${userId}`);
};

const normalizeDailyCreditProfile = (profile: UserProfile): UserProfile => {
  if (profile.id !== 'guest_user') {
    clearSignedInCreditShadow(profile.id);
  }

  return {
    ...profile,
    credits: Math.max(0, profile.credits || 0),
    last_daily_reset: profile.last_daily_reset || getTodayDateString(),
  };
};

const createDefaultProfile = (userId: string, email?: string | null) => {
  const today = getTodayDateString();
  return {
    id: userId,
    email: email || null,
    credits: DAILY_CREDITS,
    is_premium: false,
    last_daily_reset: today,
    shadow_notes: '',
    streak_count: 1,
    last_streak_claim: today,
    total_time_spent_ms: 0,
  };
};

const isMissingRowError = (error: any) => error?.code === 'PGRST116';
const isMissingOptionalSchemaError = (error: any) => (
  error?.code === '42P01' ||
  error?.code === 'PGRST205' ||
  error?.message?.toLowerCase?.().includes('could not find the table')
);

const getErrorMessage = (error: unknown, fallback: string) => (
  error instanceof Error ? error.message : fallback
);

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchServerProfile = async (method: 'GET' | 'POST' = 'GET', accessToken?: string | null) => {
  if (!supabase) {
    throw new Error('Supabase is not configured.');
  }

  let token = accessToken || null;
  if (!token) {
    const { data: { session } } = await supabase.auth.getSession();
    token = session?.access_token || null;
  }

  if (!token) {
    throw new Error('LOGIN_REQUIRED');
  }

  const maxAttempts = method === 'POST' ? 4 : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const response = await fetch(getApiUrl('/api/profile'), {
      method,
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    const data = await response.json().catch(() => null);

    if (response.ok) {
      return data as { profile: UserProfile; savedItems?: SavedItem[]; created?: boolean };
    }

    const errorCode = data?.code || data?.error || `Profile API failed with status ${response.status}`;
    const canRetry = (
      method === 'POST' &&
      errorCode === 'PROFILE_BOOTSTRAP_FAILED' &&
      attempt < maxAttempts - 1
    );

    if (canRetry) {
      await wait(500 * (attempt + 1));
      continue;
    }

    throw new Error(errorCode);
  }

  throw new Error('PROFILE_BOOTSTRAP_FAILED');
};

interface SplashScreenProps {
  isAppReady: boolean;
  onComplete: () => void;
}

const SplashScreen: React.FC<SplashScreenProps> = React.memo(({ isAppReady, onComplete }) => {
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
      <div className="native-splash-orb absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-rose-900/20 rounded-full blur-[100px] animate-pulse-glow" />
      <div className="native-splash-orb absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-amber-900/10 rounded-full blur-[80px] animate-float" />

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
});

interface AppProps {
  onNavigateToPath?: (path: string) => void;
}

const AppContent: React.FC<AppProps> = React.memo(({ onNavigateToPath }) => {
  return (
    <Suspense fallback={<div className="fixed inset-0 bg-black z-50" />}>
      <AppContentInner onNavigateToPath={onNavigateToPath} />
    </Suspense>
  );
});

const AppContentInner: React.FC<AppProps> = ({ onNavigateToPath }) => {
  const { showToast } = useToast();

  // Auth State
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [updateGateConfig, setUpdateGateConfig] = useState<UpdateGateConfig | null>(null);

  // Refs
  const profileRef = useRef<UserProfile | null>(null);
  const isGuestRef = useRef(false);
  const authUserIdRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sessionChannelRef = useRef<BroadcastChannel | null>(null);
  const rewardedAdAttemptRef = useRef<string | null>(null);
  const rewardedAdInProgressRef = useRef(false);
  const loadingRef = useRef(false);
  const savedItemsRef = useRef<SavedItem[]>([]);

  // Splash State
  const [showSplash, setShowSplash] = useState(true);

  // Onboarding State
  const [showOnboarding, setShowOnboarding] = useState(false);

  // App State
  const [currentView, setCurrentView] = useState<ViewState>(() => getViewFromLocation());
  const [mode, setMode] = useState<InputMode>(InputMode.CHAT);
  const [image, setImage] = useState<string | null>(null);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [responseLength, setResponseLength] = useState<ResponseLength>('medium');

  // Loading State
  const [loading, setLoading] = useState(false);

  const [result, setResult] = useState<RizzOrBioResponse | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  // Modals & Flags
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [rewardedAdStatus, setRewardedAdStatus] = useState<'idle' | 'loading' | 'pending' | 'success' | 'error'>('idle');
  const [isRewardedAdLoading, setIsRewardedAdLoading] = useState(false);
  const [rewardedAdRequiredCredits, setRewardedAdRequiredCredits] = useState<1 | 2>(1);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [showWebMenu, setShowWebMenu] = useState(false);
  const [showWebPremiumModal, setShowWebPremiumModal] = useState(false);
  const [webPremiumReason, setWebPremiumReason] = useState<'credits' | 'premium'>('premium');
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [isSessionBlocked, setIsSessionBlocked] = useState(false);
  const [isProfileLoadingHung, setIsProfileLoadingHung] = useState(false);
  const [profileLoadError, setProfileLoadError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const lastOfflineStatusRef = useRef(false);

  loadingRef.current = loading;
  savedItemsRef.current = savedItems;

  // Custom Personas State
  const [customPersonas, setCustomPersonas] = useState<CustomPersona[]>([]);
  const [showPersonaModal, setShowPersonaModal] = useState(false);
  const [editingPersona, setEditingPersona] = useState<CustomPersona | null>(null);
  const [personaName, setPersonaName] = useState('');
  const [personaInstruction, setPersonaInstruction] = useState('');

  // Guest Mode State
  const [isGuest, setIsGuest] = useState(false);
  const [loginReason, setLoginReason] = useState<'premium' | undefined>(undefined);

  const generationInputsRef = useRef({
    mode,
    image,
    selectedVibe,
    responseLength,
    customPersonas,
  });
  generationInputsRef.current = {
    mode,
    image,
    selectedVibe,
    responseLength,
    customPersonas,
  };

  useEffect(() => {
    let cancelled = false;

    loadUpdateGateConfig()
      .then((config) => {
        if (!cancelled) {
          setUpdateGateConfig(config);
        }
      })
      .catch((error) => {
        console.warn('[UpdateGate] Failed to load update gate config:', error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleGuestEntry = useCallback(() => {
    isGuestRef.current = true;
    setIsGuest(true);
    setIsSessionBlocked(false);
    setIsProfileLoadingHung(false);
    setProfileLoadError(null);
    if (supabase) {
      supabase.auth.signOut().catch(() => {});
    }
    const guestNotes = localStorage.getItem('rizzmaster_guest_shadow_notes') || 'Playing it cool as a guest. 😎';

    // --- GUEST CREDIT EXPLOIT FIX ---
    let guestCredits = DAILY_CREDITS;
    const lastReset = localStorage.getItem('rizzmaster_guest_last_reset');
    const todayStr = new Date().toDateString();

    if (lastReset === todayStr) {
      const savedCredits = localStorage.getItem('rizzmaster_guest_credits');
      const parsedCredits = savedCredits !== null ? parseInt(savedCredits, 10) : NaN;
      guestCredits = Number.isFinite(parsedCredits)
        ? Math.max(parsedCredits, 0)
        : DAILY_CREDITS;
      localStorage.setItem('rizzmaster_guest_credits', guestCredits.toString());
    } else {
      // New day (or first time), reset to DAILY_CREDITS and store new date
      localStorage.setItem('rizzmaster_guest_last_reset', todayStr);
      localStorage.setItem('rizzmaster_guest_credits', DAILY_CREDITS.toString());
    }

    // Provide a mock guest profile
    const guestProfile = {
      id: 'guest_user',
      email: 'guest@rizzmaster.local',
      credits: guestCredits, // Dynamically loaded
      is_premium: false,
      last_daily_reset: new Date().toISOString(),
      shadow_notes: guestNotes
    } as UserProfile;
    profileRef.current = guestProfile;
    setProfile(guestProfile);
    showToast(`Entered Guest Mode! ⚡ (${guestCredits} Credits)`, "info");
  }, [showToast]);

  const handleExitGuestMode = useCallback(() => {
    IAPService.clearUser();
    isGuestRef.current = false;
    setIsGuest(false);
    setIsSessionBlocked(false);
    setIsProfileLoadingHung(false);
    setProfileLoadError(null);
    profileRef.current = null;
    authUserIdRef.current = null;
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
    isGuestRef.current = isGuest;
  }, [isGuest]);

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
    const profileId = profileRef.current?.id;
    if (!profileId) return;
    setCustomPersonas(newPersonas);
    localStorage.setItem(`rizz_custom_personas_${profileId}`, JSON.stringify(newPersonas));
  }, []);

  // Ref to track state for event listeners without re-binding
  const stateRef = useRef({
    currentView,
    showPremiumModal,
    showSavedModal,
    showOnboarding,
  });

  // Keep stateRef in sync
  useEffect(() => {
    stateRef.current = { currentView, showPremiumModal, showSavedModal, showOnboarding };
  }, [currentView, showPremiumModal, showSavedModal, showOnboarding]);

  const isPublicInfoView =
    currentView === 'PRIVACY' ||
    currentView === 'TERMS' ||
    currentView === 'SUPPORT';

  // Handle Status Bar Visibility on Scroll
  useEffect(() => {
    if (!canUseNativeStatusBar()) return;

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
    if (!canUseNativeNetwork()) {
      return;
    }

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

  // Sync the ref without coupling notification updates to every profile refresh.
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    // Link OneSignal External ID when profile is loaded
    if (canUseNativeOneSignal() && profile?.id) {
      OneSignalService.setExternalId(profile.id);
    }
  }, [profile?.id]);

  // --- INTERSTITIAL AD ACTIVE TIME TRACKING ---
  // We use refs here because we need these values to be immediately available
  // in background/foreground event listeners and intervals without causing re-renders.
  const activeTimeMs = useRef<number>(0);
  const lastAdActiveTime = useRef<number>(-120000); // Bug 6 fix: pre-subtract 1 cooldown so the first ad can show immediately
  const backgroundTimestamp = useRef<number | null>(null);
  const foregroundStartedAt = useRef<number | null>(null);
  const adTransitionInProgressRef = useRef<boolean>(false); // Bug 3 fix: prevents double-fire from both nav handlers

  const INTERSTITIAL_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes (Cooldown between ads)
  const INACTIVITY_RESET_MS = 30 * 60 * 1000; // 30 minutes of background time to reset

  // Track Active Time (Foreground)
  useEffect(() => {
    if (!canUseNativeAppEvents()) return;

    // Track the current foreground segment with timestamps instead of a 1-second
    // interval. This avoids waking the WebView continuously while the app is idle.
    foregroundStartedAt.current = Date.now();

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
          foregroundStartedAt.current = now;

          // Record usage and refresh notification schedule
          await NotificationService.recordUsage();
          await NotificationService.schedulePersonalizedNotifications();

          // Do not warm-load full-screen ads on resume. Broad resume preloads create
          // matched requests that often expire unused and hurt AdMob show rate.
        }
      } else {
        // App went to BACKGROUND — flush session time to Supabase
        const sessionTimeMs = activeTimeMs.current + (
          foregroundStartedAt.current === null
            ? 0
            : Math.max(0, now - foregroundStartedAt.current)
        );
        backgroundTimestamp.current = now;
        if (sessionTimeMs > 0) {
          const currentProfile = profileRef.current;
          if (supabase && currentProfile && currentProfile.id !== 'guest_user') {
            supabase.rpc('increment_total_time_spent', { input_ms: sessionTimeMs })
              .then(({ error }) => {
                if (error) console.warn('[Analytics] Time flush failed:', error.message);
                else console.log(`[Analytics] Flushed ${Math.round(sessionTimeMs / 1000)}s of session time.`);
              });
          }
          // Reset so we don't double-count on next foreground
          activeTimeMs.current = 0;
        }
        foregroundStartedAt.current = null;
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
      if (appStateListener) appStateListener.remove();
    };
  }, []);
  // --- END ACTIVE TIME TRACKING ---

  const initializeNotifications = useCallback(() => {
    // OneSignal Push Notifications
    runStartupTask('OneSignal initialization', Promise.resolve(OneSignalService.initialize()));
    // Local Notifications & Usage Tracking
    runStartupTask('Local notifications initialization', Promise.resolve(NotificationService.initialize()));
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

  const handleOnboardingComplete = useCallback(() => {
    localStorage.setItem('rizz_onboarding_completed', 'true');
    setShowOnboarding(false);
    initializeNotifications();
  }, [initializeNotifications]);

  const handleUpgrade = useCallback(async (purchaseData?: any): Promise<boolean> => {
    const currentProfile = profileRef.current;
    // If guest taps Upgrade, close the modal and send them to sign-in/sign-up
    if (!currentProfile || currentProfile.id === 'guest_user' || isGuestRef.current) {
      setShowPremiumModal(false);
      setRewardedAdStatus('idle');
      setIsRewardedAdLoading(false);
      rewardedAdAttemptRef.current = null;
      setLoginReason('premium');
      handleExitGuestMode();
      return false;
    }

    let platform = Capacitor.getPlatform();
    let productId = '';
    let transactionId = '';
    let orderId = '';
    let basePlanId = null;
    let purchaseToken = '';
    let rawReceipt = null;
    let plan = null;

    if (purchaseData && typeof purchaseData === 'object') {
      platform = purchaseData.platform || platform;
      productId = purchaseData.productId;
      transactionId = purchaseData.transactionId || purchaseData.orderId;
      orderId = purchaseData.orderId || '';
      basePlanId = purchaseData.basePlanId;
      purchaseToken = purchaseData.purchaseToken;
      rawReceipt = purchaseData.rawReceipt;
      plan = purchaseData.plan || null;
    } else {
      // Fallback to searching products (only if absolutely necessary)
      const products = IAPService.products;
      const mainSub = products.find(p => p.state === 'owned' || p.state === 'approved' || p.state === 'verified');

      if (!mainSub) {
        console.log('handleUpgrade: No owned IAP product found — skipping verification.');
        return false;
      }
      productId = mainSub.id;
      transactionId = mainSub.transactionId || (mainSub as any)?.purchase?.transactionId;
    }

    if (platform === 'android') {
      if (!productId || !purchaseToken) {
        console.warn('handleUpgrade: Missing required Android purchase fields (productId, purchaseToken).');
        showToast("Purchase verification failed: Missing token. Please try again.", "error");
        return false;
      }
      if (!transactionId) {
        transactionId = orderId || purchaseToken;
      }
    } else {
      if (!transactionId) {
        console.warn('handleUpgrade: Owned product found but no transactionId — skipping.');
        return false;
      }
    }

    try {
      if (!supabase) {
        showToast("Login system is not ready. Please restart the app.", "error");
        return false;
      }

      const { data: { session: activeSession } } = await supabase.auth.getSession();

      console.log(`IAP verification auth check ${JSON.stringify({
        hasSupabaseClient: Boolean(supabase),
        profileId: currentProfile?.id,
        profileEmail: currentProfile?.email,
        hasSession: Boolean(activeSession),
        sessionUserId: activeSession?.user?.id || null,
        sessionEmail: activeSession?.user?.email || null,
        hasAccessToken: Boolean(activeSession?.access_token),
        platform,
        productId,
        hasPurchaseToken: Boolean(purchaseToken),
      })}`);

      if (!activeSession?.access_token || !activeSession?.user?.id) {
        console.warn("IAP: No valid Supabase session during purchase verification.");
        showToast("Please sign in again before restoring or buying premium.", "error");
        return false;
      }

      if (currentProfile.id !== activeSession.user.id) {
        console.warn(`IAP: Profile/session mismatch during purchase verification ${JSON.stringify({
          profileId: currentProfile.id,
          sessionUserId: activeSession.user.id,
        })}`);
        showToast("Account mismatch. Please sign out, sign back in, and retry.", "error");
        return false;
      }

      const token = activeSession.access_token;

      const response = await fetch(getApiUrl('/api/verify-purchase'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          platform,
          productId,
          transactionId,
          orderId,
          plan,
          intent: purchaseData?.intent || 'purchase',
          ownerUserId: currentProfile.id,
          basePlanId,
          purchaseToken,
          rawReceipt,
          expiresAt: purchaseData?.expiresAt || purchaseData?.expirationDate || null
        })
      });

      const resData = await response.json().catch(() => null);
      if (!response.ok) {
        if (resData?.code === 'PURCHASE_ACCOUNT_MISMATCH') {
          throw new Error('This purchase was started for a different Rizzmaster account. Please retry while signed into this account.');
        }
        if (resData?.code === 'PURCHASE_ALREADY_LINKED') {
          throw new Error('This Play Store subscription is already linked to another Rizzmaster account. Log in with that account or contact support.');
        }
        const code = resData?.code ? ` (${resData.code})` : '';
        throw new Error(`${resData?.error || `Server returned status ${response.status}`}${code}`);
      }

      if (resData && resData.profile) {
        setProfile(resData.profile);
        profileRef.current = resData.profile;
      } else {
        const synced = await syncProfile();
        if (!synced || !synced.is_premium) {
          throw new Error("Purchase was verified, but premium status did not sync to your profile.");
        }
      }

      if (stateRef.current.showPremiumModal) {
        window.history.back();
      }

      showToast(`Welcome to the Elite Club! 👑`, 'success');
      return true;
    } catch (err) {
      console.error("Failed to verify purchase:", err);
      showToast(getErrorMessage(err, "Purchase verification failed. Please try again or contact support."), "error");
      return false;
    }
  }, [showToast, handleExitGuestMode]);


  // Initialize native services without requesting an ad before a user is close to an ad trigger.

  // Initialize Native Services
  useEffect(() => {
    if (!canUseNativeAppEvents()) return;

    const timerIds: ReturnType<typeof setTimeout>[] = [];
    let isMounted = true;

    // Defer heavy native plugin initialization so the initial React render is fully unblocked
    timerIds.push(setTimeout(() => {
      // Google Auth
      if (canUseNativeGoogleAuth() && runtimeConfig.googleClientId) {
        try {
          GoogleAuth.initialize({
            clientId: runtimeConfig.googleClientId,
            scopes: ['profile', 'email'],
            grantOfflineAccess: false,
          });
        } catch (error) {
          console.warn('[Startup] GoogleAuth initialization failed:', error);
        }
      } else if (!runtimeConfig.googleClientId) {
        console.warn('[Startup] GoogleAuth initialization skipped because VITE_GOOGLE_CLIENT_ID is missing.');
      }

      // AdMob
      if (canUseNativeAdMob()) {
        runAdTask('Initial AdMob init', AdMobService.initialize());
      }

      // In-App Purchases
      try {
        IAPService.initialize(
          (purchaseData) => handleUpgrade(purchaseData),
          (errorMessage) => {
            showToast(errorMessage, 'error');
          }
        );
      } catch (error) {
        console.warn('[Startup] IAP initialization failed:', error);
      }
    }, 1000)); // Deferred by 1 second to prioritize frame rendering initial paint

    const silentPremiumRestoreAttemptsRef = { current: 0 };

    // --- SILENT PREMIUM RE-CHECK ---
    // If a premium user is still marked unverified, attempt a background restore
    // without revoking access unless the backend later returns an explicit store failure.
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
          const attempt = silentPremiumRestoreAttemptsRef.current + 1;
          silentPremiumRestoreAttemptsRef.current = attempt;
          console.log(`IAP: User is premium but 'unverified'. Starting silent restore check (attempt ${attempt}/${SILENT_PREMIUM_RESTORE_MAX_ATTEMPTS})...`);
          try {
            await IAPService.restore(currentProfile.id);

            // Give store verification more time to settle before deciding it was inconclusive.
            timerIds.push(setTimeout(async () => {
              if (!isMounted) return;
              const refreshedProfile = profileRef.current;
              if (refreshedProfile?.is_premium && refreshedProfile.premium_source === 'unverified') {
                if (attempt < SILENT_PREMIUM_RESTORE_MAX_ATTEMPTS) {
                  console.warn('IAP: Silent restore was inconclusive. Retrying later without revoking premium.');
                  timerIds.push(setTimeout(checkVerification, SILENT_PREMIUM_RESTORE_RETRY_MS));
                  return;
                }
                console.warn('IAP: Silent restore remained inconclusive after retries. Keeping premium until backend returns an explicit invalid, expired, or revoked store verification.');
              } else if (!refreshedProfile?.is_premium || refreshedProfile.premium_source !== 'unverified') {
                silentPremiumRestoreAttemptsRef.current = 0;
              }
            }, SILENT_PREMIUM_RESTORE_WAIT_MS));
          } catch (e) {
            console.error("IAP: Re-verification process error", e);
            if (attempt < SILENT_PREMIUM_RESTORE_MAX_ATTEMPTS && isMounted) {
              timerIds.push(setTimeout(checkVerification, SILENT_PREMIUM_RESTORE_RETRY_MS));
            }
          }
        } else {
          silentPremiumRestoreAttemptsRef.current = 0;
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
      setCurrentView(state.view || getViewFromLocation());
      setShowPremiumModal(!!state.premium);
      setShowSavedModal(!!state.saved);
      if (!state.premium) {
        setRewardedAdStatus('idle');
        setIsRewardedAdLoading(false);
        rewardedAdAttemptRef.current = null;
      }
    };

    if (!window.history.state) {
      const initialView = getViewFromLocation();
      window.history.replaceState({ view: initialView }, '', getPathForView(initialView));
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Native Back Button Handler
  useEffect(() => {
    if (!canUseNativeAppEvents()) return;

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
    if (loadingRef.current) return;
    if (view === stateRef.current.currentView) return;

    window.history.pushState({ view }, '', getPathForView(view));
    setCurrentView(view);
  }, []);

  const handleBackNavigation = useCallback(() => {
    if (loadingRef.current) {
      window.history.pushState({ view: stateRef.current.currentView }, '');
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
      setRewardedAdStatus('idle');
      setIsRewardedAdLoading(false);
      rewardedAdAttemptRef.current = null;
      window.history.replaceState({ view: 'HOME' }, '', '/');
    }


  }, []);

  const handleOpenPremium = useCallback(() => {
    if (IS_WEB_PLATFORM) {
      setWebPremiumReason('premium');
      setShowWebPremiumModal(true);
      return;
    }

    // Guests see the premium modal first so they understand what they're getting
    window.history.pushState({ view: stateRef.current.currentView, premium: true }, '');
    setRewardedAdStatus('idle');
    setIsRewardedAdLoading(false);
    rewardedAdAttemptRef.current = null;
    setShowPremiumModal(true);
  }, []);

  const handleCreditsExhausted = useCallback((requiredCredits: 1 | 2 = 1) => {
    if (IS_WEB_PLATFORM) {
      setWebPremiumReason('credits');
      setShowWebPremiumModal(true);
      return;
    }

    setRewardedAdRequiredCredits(requiredCredits);
    handleOpenPremium();
  }, [handleOpenPremium]);

  useEffect(() => {
    if (!IS_WEB_PLATFORM || loginReason !== 'premium' || !session || !profile || isGuest) return;
    setWebPremiumReason('premium');
    setShowWebPremiumModal(true);
    setLoginReason(undefined);
  }, [isGuest, loginReason, profile, session]);

  const handleOpenSaved = useCallback(() => {
    window.history.pushState({ view: stateRef.current.currentView, saved: true }, '');
    setShowSavedModal(true);
  }, []);

  useEffect(() => {
    if (!supabase) {
      setProfileLoadError(null);
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
      authUserIdRef.current = session?.user?.id || null;
      setSession(session);
      setIsSessionBlocked(false);
      setProfileLoadError(null);
      setIsProfileLoadingHung(false);
      if (session) {
        if (profileRef.current?.id && profileRef.current.id !== session.user.id) {
          profileRef.current = null;
          setProfile(null);
          setSavedItems([]);
        }
        loadUserDataSafe(session.user.id, session.user.email, session.access_token)
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
      authUserIdRef.current = session?.user?.id || null;
      setSession(session);
      setIsSessionBlocked(false);
      setProfileLoadError(null);
      setIsProfileLoadingHung(false);
      if (session) {
        if (profileRef.current?.id && profileRef.current.id !== session.user.id) {
          profileRef.current = null;
          setProfile(null);
          setSavedItems([]);
        }
        loadUserDataSafe(session.user.id, session.user.email, session.access_token)
          .catch((e) => {
            console.error("Auth State Load Error:", e);
            setIsProfileLoadingHung(true);
          });
        // NOTE: App Open Ad is triggered by the useEffect watching [session, profile, isAuthReady]
        // after the profile has actually loaded, not here where profile is not yet available.
      } else {
        if (isGuestRef.current) {
          return;
        }
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

  const handleReclaimSession = useCallback(() => {
    setIsSessionBlocked(false);
    sessionChannelRef.current?.postMessage({ type: 'NEW_SESSION_STARTED' });
  }, []);

  async function loadUserDataSafe(userId: string, email?: string | null, accessToken?: string | null) {
    if (!supabase) return;
    setIsProfileLoadingHung(false);
    setProfileLoadError(null);

    try {
      const repaired = await fetchServerProfile('POST', accessToken);
      let profileData = repaired.profile;

      if (Array.isArray(repaired.savedItems)) {
        setSavedItems(repaired.savedItems as SavedItem[]);
      } else {
        const { data: savedData, error: savedError } = await supabase
          .from('saved_items')
          .select('*')
          .eq('user_id', userId)
          .order('created_at', { ascending: false });

        if (savedError) {
          console.warn('[Profile] Saved items load failed:', savedError.message);
          setSavedItems([]);
        } else {
          setSavedItems((savedData || []) as SavedItem[]);
        }
      }

      if (profileData) {
        try {
          const { data: claimData, error: claimError } = await supabase.rpc('claim_daily_credits_and_streak');
          if (claimError) {
            console.error("Failed to claim daily credits and streak:", claimError);
          } else if (claimData) {
            if (claimData.profile) {
              profileData = claimData.profile;
            }
            if (claimData.streak_msg && claimData.streak_msg.trim()) {
              setTimeout(() => showToast(claimData.streak_msg, 'success'), 1500);
            }
          }
        } catch (err) {
          console.error("Daily claim error:", err);
        }
      }

      if (!profileData) {
        setProfileLoadError("Your session is active, but your profile data did not load.");
        setIsProfileLoadingHung(true);
        return;
      }

      if (authUserIdRef.current !== userId) {
        return;
      }

      profileData = normalizeDailyCreditProfile(profileData as UserProfile);
      setProfile(profileData as UserProfile);
      profileRef.current = profileData as UserProfile;

      Promise.resolve(supabase.from('user_activity_log').upsert(
        [{ user_id: userId, active_date: new Date().toISOString().slice(0, 10) }],
        { onConflict: 'user_id,active_date', ignoreDuplicates: true }
      ))
        .then(({ error }) => {
          if (error && !isMissingOptionalSchemaError(error)) {
            console.warn('[Analytics] Activity log insert failed:', error.message);
          }
        })
        .catch((e: unknown) => console.warn('[Analytics] Activity log insert error:', e));

      if (!profileData.shadow_notes) {
        try {
          const localNotes = localStorage.getItem(`rizz_coach_shadow_notes_${userId}`) || localStorage.getItem('rizz_coach_shadow_notes');
          if (localNotes && localNotes.trim()) {
            const { data: migratedProfile, error: migrateError } = await supabase
              .from('profiles')
              .update({ shadow_notes: localNotes })
              .eq('id', userId)
              .select()
              .single();

            if (migrateError) {
              console.warn("Migration check failed:", migrateError.message);
            } else if (migratedProfile) {
              if (authUserIdRef.current !== userId) {
                return;
              }
              const normalizedProfile = normalizeDailyCreditProfile(migratedProfile as UserProfile);
              setProfile(normalizedProfile);
              profileRef.current = normalizedProfile;
            }
          }
        } catch (err) {
          console.warn("Migration check failed:", err);
        }
      } else {
        localStorage.setItem(`rizz_coach_shadow_notes_${userId}`, profileData.shadow_notes);
      }
    } catch (e) {
      console.error("Error loading user data", e);
      showToast("Could not load your account data. Please try again.", "error");
      setProfileLoadError("We couldn't finish loading your account data.");
      setIsProfileLoadingHung(true);
    }
  }

  const retryProfileLoad = useCallback(() => {
    if (!session?.user?.id) {
      window.location.reload();
      return;
    }

    setIsProfileLoadingHung(false);
    setProfileLoadError(null);
    loadUserDataSafe(session.user.id, session.user.email, session.access_token)
      .catch((error) => {
        console.error("Retry profile load failed:", error);
        setProfileLoadError("Retry failed. Please try again.");
        setIsProfileLoadingHung(true);
      });
  }, [session]);

  const handleLogout = useCallback(async () => {
    const currentProfile = profileRef.current;

    if (isGuest) {
      IAPService.clearUser();
      handleExitGuestMode();
      showToast("Successfully logged out 👋", 'success');
      return;
    }
    if (!window.confirm("Are you sure you want to log out of Rizz Master?")) return;

    try {
      if (supabase) await supabase.auth.signOut();

      // Clear AI Session Data
      if (currentProfile?.id) {
        clearSignedInCreditShadow(currentProfile.id);
        localStorage.removeItem(`rizz_coach_messages_v2_${currentProfile.id}`);
        localStorage.removeItem(`rizz_coach_shadow_notes_${currentProfile.id}`);
        localStorage.removeItem(`rizz_custom_personas_${currentProfile.id}`);
      }
      localStorage.removeItem('rizz_coach_messages_v2');
      localStorage.removeItem('rizzmaster_guest_shadow_notes');
      localStorage.removeItem('rizz_coach_shadow_notes');

      if (canUseNativeGoogleAuth()) {
        try { await GoogleAuth.signOut(); } catch (error) { console.warn("Native Logout err", error); }
      }
      if (canUseNativeOneSignal()) {
        OneSignalService.logout();
      }
    } catch (err) {
      console.error("Logout failed:", err);
    } finally {
      IAPService.clearUser();
      setSession(null);
      setProfile(null);
      setSavedItems([]);
      setIsSessionBlocked(false);
      setIsProfileLoadingHung(false);
      setProfileLoadError(null);
      setResult(null);
      setImage(null);
      setInputError(null);
      setSelectedVibe(null);
      setCurrentView('HOME');
      setShowPremiumModal(false);
      setShowSavedModal(false);
      setRewardedAdStatus('idle');
      setIsRewardedAdLoading(false);
      rewardedAdAttemptRef.current = null;
      showToast("Successfully logged out 👋", 'success');
      window.history.replaceState({ view: 'HOME' }, '', '/');
    }
  }, [showToast, handleExitGuestMode]);




  const updateCredits = useCallback((newAmountOrUpdater: number | ((prev: number) => number)) => {
    const baseProfile = profileRef.current;
    if (!baseProfile) return;

    let newAmount = typeof newAmountOrUpdater === 'function'
      ? newAmountOrUpdater(baseProfile.credits || 0)
      : newAmountOrUpdater;

    newAmount = Math.max(0, newAmount);

    const updated = { ...baseProfile, credits: newAmount };
    profileRef.current = updated;

    if (baseProfile.id === 'guest_user') {
      localStorage.setItem('rizzmaster_guest_credits', newAmount.toString());
    }

    setProfile(updated);
  }, []);

  const syncProfile = useCallback(async () => {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) return null;
    
    try {
      const repaired = await fetchServerProfile('POST', session.access_token);
      const normalizedProfile = normalizeDailyCreditProfile(repaired.profile as UserProfile);
      setProfile(normalizedProfile);
      profileRef.current = normalizedProfile;
      if (Array.isArray(repaired.savedItems)) {
        setSavedItems(repaired.savedItems as SavedItem[]);
      }
      return normalizedProfile;
    } catch (repairError) {
      console.warn('[Profile] Server sync repair failed:', repairError);
    }
    return null;
  }, []);

  const handleWatchRewardedAd = useCallback(async (requiredCreditsOverride?: 1 | 2) => {
    const currentProfile = profileRef.current;
    const requiredCredits = requiredCreditsOverride ?? rewardedAdRequiredCredits;
    const openedFromPremiumModal = showPremiumModal;
    if (
      !currentProfile ||
      currentProfile.is_premium ||
      (currentProfile.credits || 0) >= requiredCredits ||
      rewardedAdInProgressRef.current ||
      rewardedAdStatus === 'pending'
    ) {
      return;
    }

    rewardedAdInProgressRef.current = true;
    setIsRewardedAdLoading(true);
    setRewardedAdStatus('loading');

    try {
      if (!canUseNativeAdMob()) {
        setRewardedAdStatus('error');
        showToast('Rewarded ads are unavailable in this app build. Please update and try again.', 'error');
        return;
      }

      let ssv: RewardVideoSsv | undefined;
      if (!isGuest && currentProfile.id !== 'guest_user') {
        const attempt = await createRewardedAdAttempt(requiredCredits);
        rewardedAdAttemptRef.current = attempt.attemptId;
        ssv = {
          userId: currentProfile.id,
          customData: attempt.customData || attempt.attemptId,
        };
      }

      const earned = await AdMobService.showRewardVideo(getAdId('REWARD'), ssv);
      if (!earned) {
        setRewardedAdStatus('error');
        showToast('The rewarded ad could not be completed. No credits were added.', 'error');
        return;
      }

      if (isGuest || currentProfile.id === 'guest_user') {
        updateCredits((previous) => previous + 5);
        setRewardedAdStatus('success');
        showToast('5 credits added. You can continue generating.', 'success');
        if (openedFromPremiumModal) handleBackNavigation();
        return;
      }

      const attemptId = rewardedAdAttemptRef.current;
      if (!attemptId) {
        setRewardedAdStatus('error');
        showToast('Reward verification could not be started. No credits were added.', 'error');
        return;
      }

      setRewardedAdStatus('pending');
      let latestStatus: RewardedAdStatus = 'pending';
      for (let poll = 0; poll < REWARDED_STATUS_POLL_ATTEMPTS; poll += 1) {
        await wait(poll === 0 ? 250 : 1500);

        let status;
        try {
          // Submit native completion immediately after the SDK reward event,
          // then retry while polling in case the first request races the
          // server's minimum-watch-time check or hits a transient failure.
          const shouldSubmitNativeCompletion = poll === 0 || poll === 4 || poll === 9;
          status = shouldSubmitNativeCompletion
            ? await completeRewardedAdAttempt(attemptId)
            : await getRewardedAdStatus(attemptId);
        } catch (pollError) {
          const responseStatus = Number((pollError as { status?: number })?.status || 0);
          if (responseStatus === 409 || responseStatus >= 500 || responseStatus === 0) {
            console.warn('[AdMob] Reward confirmation retry scheduled.', { poll, responseStatus });
            continue;
          }
          throw pollError;
        }
        latestStatus = status.status;

        if (status.status === 'granted') {
          const grantedCredits = Number(status.credits);
          if (Number.isFinite(grantedCredits) && profileRef.current) {
            const creditedProfile = { ...profileRef.current, credits: grantedCredits };
            profileRef.current = creditedProfile;
            setProfile(creditedProfile);
          }
          const syncedProfile = await syncProfile();
          setRewardedAdStatus('success');
          showToast(
            syncedProfile ? '5 credits added. You can continue generating.' : '5 credits added. Your balance is ready.',
            'success',
          );
          if (openedFromPremiumModal) handleBackNavigation();
          return;
        }
        if (status.status === 'rejected' || status.status === 'expired') break;
      }

      if (latestStatus === 'pending') {
        setRewardedAdStatus('pending');
        showToast('Reward verification is still pending. Your credits will appear shortly.', 'info');
      } else {
        setRewardedAdStatus('error');
        showToast('The reward could not be verified. No credits were added.', 'error');
      }
    } catch (error) {
      console.warn('[AdMob] Rewarded credit flow failed:', error instanceof Error ? error.message : error);
      setRewardedAdStatus('error');
      showToast('Reward verification is temporarily unavailable. No credits were added.', 'error');
    } finally {
      rewardedAdInProgressRef.current = false;
      setIsRewardedAdLoading(false);
    }
  }, [handleBackNavigation, isGuest, rewardedAdRequiredCredits, rewardedAdStatus, showPremiumModal, showToast, syncProfile, updateCredits]);

  const handleRestorePurchases = useCallback(async () => {
    if (!profileRef.current) return;
    if (canUseNativeIap()) {
      IAPService.restore(profileRef.current.id);
    } else {
      showToast('Restore purchases is only available in the mobile app.', 'info');
    }
  }, [showToast]);

  const toggleSave = useCallback(async (content: string, type: 'tease' | 'smooth' | 'chaotic' | 'bio') => {
    const currentProfile = profileRef.current;
    if (!currentProfile) return;

    const isGuestUser = currentProfile.id === 'guest_user';
    const currentItems = savedItemsRef.current;
    const exists = currentItems.find(item => item.content === content);

    if (exists) {
      const originalItems = currentItems;
      const newItems = currentItems.filter(item => item.id !== exists.id);
      savedItemsRef.current = newItems;
      setSavedItems(newItems);
      showToast("Removed from saved", 'info');

      if (!isGuestUser && supabase) {
        const { error } = await supabase.from('saved_items').delete().eq('id', exists.id);
        if (error) {
          console.error("Delete saved item failed:", error);
          savedItemsRef.current = originalItems;
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

      const newItems = [newItem, ...currentItems];
      savedItemsRef.current = newItems;
      setSavedItems(newItems);
      showToast("Saved to your gems", 'success');

      if (!isGuestUser && supabase) {
        const { data, error } = await supabase
          .from('saved_items')
          .insert([{ user_id: currentProfile.id, content, type }])
          .select()
          .single();

        if (error || !data) {
          console.error("Save item error:", error);
          const rolledBackItems = savedItemsRef.current.filter(item => item.id !== tempId);
          savedItemsRef.current = rolledBackItems;
          setSavedItems(rolledBackItems);
          showToast("Failed to save gem", "error");
        } else {
          const updatedItems = savedItemsRef.current.map(item => item.id === tempId ? (data as SavedItem) : item);
          savedItemsRef.current = updatedItems;
          setSavedItems(updatedItems);
        }
      }
    }
  }, [showToast]);

  const handleDeleteSaved = useCallback(async (id: string) => {
    const isGuestUser = profileRef.current?.id === 'guest_user';
    const originalItems = savedItemsRef.current;
    const newItems = originalItems.filter(item => item.id !== id);
    savedItemsRef.current = newItems;
    setSavedItems(newItems);
    showToast("Item deleted", 'info');

    if (!isGuestUser && supabase) {
      const { error } = await supabase.from('saved_items').delete().eq('id', id);
      if (error) {
        console.error("Delete saved item error:", error);
        savedItemsRef.current = originalItems;
        setSavedItems(originalItems);
        showToast("Failed to delete gem", "error");
      }
    }
  }, [showToast]);

  const handleDeleteAccount = useCallback(async () => {
    // Confirmation is handled by the InfoPages UI — no window.confirm needed here.
    const currentProfile = profileRef.current;
    if (!currentProfile) return;

    if (currentProfile.id === 'guest_user' || isGuestRef.current) {
      localStorage.removeItem('rizzmaster_guest_shadow_notes');
      localStorage.removeItem('rizzmaster_guest_credits');
      localStorage.removeItem('rizzmaster_guest_last_reset');
      handleExitGuestMode();
      showToast("Guest account deleted", 'success');
      return;
    }

    if (!supabase) return;

    loadingRef.current = true;
    setLoading(true);

    try {
      const { data: { session: activeSession } } = await supabase.auth.getSession();
      if (!activeSession?.access_token) {
        throw new Error('Your session expired. Please sign in again.');
      }

      const response = await fetch(getApiUrl('/api/delete-account'), {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeSession.access_token}`,
        },
      });
      const payload = await response.json().catch(() => null);

      if (!response.ok) {
        if (payload?.code === 'ACTIVE_DODO_SUBSCRIPTION' && IS_WEB_PLATFORM) {
          const portal = await createDodoPortalSession();
          window.location.assign(portal.portalUrl);
          return;
        }
        throw new Error(payload?.error || 'Failed to delete account.');
      }

      // 2. Sign Out & Cleanup (Only if server delete succeeded)
      await supabase.auth.signOut();

      // Clear AI Session Data
      localStorage.removeItem(`rizz_coach_messages_v2_${currentProfile.id}`);
      localStorage.removeItem(`rizz_coach_shadow_notes_${currentProfile.id}`);
      clearSignedInCreditShadow(currentProfile.id);
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
      loadingRef.current = false;
      setLoading(false);
    }
  }, [showToast, handleExitGuestMode]);

  const handleSaveWrapper = useCallback((content: string, type: 'tease' | 'smooth' | 'chaotic' | 'bio') => {
    toggleSave(content, type);
  }, [toggleSave]);

  const handleReport = useCallback(async (content?: string) => {
    if (!profileRef.current) return;
    try {
      if (!supabase) {
        throw new Error('Supabase is unavailable.');
      }
      const { error } = await supabase.from('reports').insert([
        {
          user_id: profileRef.current.id === 'guest_user' ? null : profileRef.current.id,
          content: content || 'General Report',
          type: 'content_report'
        }
      ]);
      if (error) {
        throw error;
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
      setInputError(null);
    }
  }, [showToast]);


  const handleCameraCapture = useCallback(async () => {
    if (!canUseNativeCamera()) {
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
        setInputError(null);
      }
    } catch (e: any) {
      // Don't show toast if user cancelled
      if (e.message !== 'User cancelled photos app') {
        console.error('Camera Error:', e);
        showToast('Failed to open camera.', 'error');
      }
    }
  }, [showToast]);

  const handleGalleryCapture = useCallback(async () => {
    if (!canUseNativeCamera()) {
      fileInputRef.current?.click();
      return;
    }

    try {
      // Use the system photo picker where available so we do not request broad storage access.
      const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.DataUrl,
        source: CameraSource.Photos
      });

      if (photo.dataUrl) {
        setImage(photo.dataUrl);
        setInputError(null);
      }
    } catch (e: any) {
      // Don't show toast if user cancelled
      if (e.message !== 'User cancelled photos app') {
        console.error('Gallery Error:', e);
        showToast('Failed to open gallery.', 'error');
      }
    }
  }, [showToast]);

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
    if (loadingRef.current) return;

    const {
      mode: activeMode,
      image: activeImage,
      selectedVibe: activeVibe,
      responseLength: activeResponseLength,
      customPersonas: activePersonas,
    } = generationInputsRef.current;
    
    const currentProfile = profileRef.current;
    if (!currentProfile) {
      console.error("handleGenerate: currentProfile is null.");
      return;
    }

    const finalProcessText = typeof textToProcess === 'string'
      ? textToProcess
      : (textareaRef.current?.value || '');

    if (activeMode === InputMode.CHAT && !finalProcessText.trim() && !activeImage) {
      setInputError("Give me some context! Paste the chat or upload a screenshot.");
      return;
    }
    if (activeMode === InputMode.BIO && !finalProcessText.trim()) {
      setInputError("I can't write a bio for a ghost! Tell me about your hobbies, job, or vibes.");
      return;
    }
    setInputError(null);

    const cost: 1 | 2 = (activeMode === InputMode.CHAT && activeImage) ? 2 : 1;

    // Guests are rate-limited server-side (5 req/min by IP) but still adhere to client-side credit limits
    if (!currentProfile.is_premium && (currentProfile.credits || 0) < cost) {
      handleCreditsExhausted(cost);
      return;
    }

    let shouldShowAd = false;
    let shouldPreloadInterstitial = false;
    let adGenerationToRecord: number | null = null;
    if (!currentProfile.is_premium && canUseNativeAdMob()) {
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

      const now = activeTimeMs.current + (
        foregroundStartedAt.current === null
          ? 0
          : Math.max(0, Date.now() - foregroundStartedAt.current)
      );
      const cooldownPassed = isFirstAd || (now - lastAdActiveTime.current >= INTERSTITIAL_COOLDOWN_MS);
      
      if (genCount >= targetGen && cooldownPassed) {
        shouldShowAd = true;
        adGenerationToRecord = genCount;
        console.log(`[AdMob] Will trigger concurrent interstitial at gen ${genCount}...`);
      } else if (genCount + 1 >= targetGen && cooldownPassed) {
        // Warm the ad one generation before the trigger so it is ready without
        // creating requests for users who never reach the ad threshold.
        shouldPreloadInterstitial = true;
      }
    }
    // --------------------------------------------------

    loadingRef.current = true;
    setLoading(true);

    if (shouldPreloadInterstitial) {
      runAdTask('Eligible interstitial preload', AdMobService.prepareInterstitial(getAdId('INTERSTITIAL')));
    }

    // Fire the ad concurrently so the API generation happens in the background while the user watches the ad!
    if (shouldShowAd) {
      let accountedForShownInterstitial = false;
      const recordShownInterstitial = () => {
        if (accountedForShownInterstitial || adGenerationToRecord === null) return;
        accountedForShownInterstitial = true;
        lastAdActiveTime.current = activeTimeMs.current + (
          foregroundStartedAt.current === null
            ? 0
            : Math.max(0, Date.now() - foregroundStartedAt.current)
        );
        localStorage.setItem('rizz_last_ad_gen_count', adGenerationToRecord.toString());
      };

      const isForeground = backgroundTimestamp.current === null;
      const isVisible = typeof document === 'undefined' || document.visibilityState === 'visible';
      const { showOnboarding, showPremiumModal, showSavedModal } = stateRef.current;
      const hasUiConflict = showOnboarding || showPremiumModal || showSavedModal;

      if (!isForeground || !isVisible || hasUiConflict || adTransitionInProgressRef.current) {
        console.warn('[AdMob] Skipping interstitial because the app is not in a stable foreground state.', {
          isForeground,
          visibilityState: typeof document === 'undefined' ? 'unavailable' : document.visibilityState,
          hasUiConflict,
          adTransitionInProgress: adTransitionInProgressRef.current,
        });
      } else {
        adTransitionInProgressRef.current = true;

        AdMobService.showInterstitial(getAdId('INTERSTITIAL'), recordShownInterstitial)
          .then((result) => {
            if (result.shown) {
              recordShownInterstitial();
              return;
            }

            console.warn('[AdMob] Interstitial did not reach the user.', {
              reason: result.reason,
              generation: adGenerationToRecord,
            });
          })
        .catch(e => console.warn("[AdMob] Deferred interstitial failed:", e))
        .finally(() => {
          adTransitionInProgressRef.current = false;
        });
      }
    }

    // --- GENERATION START ---
    const shouldManageLocalCredits = !currentProfile.is_premium;
    const shouldSyncSignedInProfile = !isGuestRef.current && currentProfile.id !== 'guest_user';
    let skipFinalProfileSync = !shouldSyncSignedInProfile;
    let creditsAdjustedOptimistically = false;
    const refundOptimisticCredits = () => {
      if (!shouldManageLocalCredits || !creditsAdjustedOptimistically) return;
      updateCredits(prevCredits => prevCredits + cost);
      creditsAdjustedOptimistically = false;
    };

    try {
      // Optimistic credit deduction for all non-premium users (including guests)
      if (shouldManageLocalCredits) {
        updateCredits(prevCredits => prevCredits - cost);
        creditsAdjustedOptimistically = true;
      }

      const customInstruction = activeVibe?.startsWith('custom:')
        ? activePersonas.find(p => p.id === activeVibe.split(':')[1])?.instruction
        : undefined;

      let res;
      if (activeMode === InputMode.CHAT) {
        res = await generateRizz(finalProcessText, activeImage || undefined, activeVibe || undefined, activeResponseLength, customInstruction);
      } else {
        res = await generateBio(finalProcessText, activeVibe || undefined, activeResponseLength, customInstruction);
      }

      if ('potentialStatus' in res && (res.potentialStatus === 'Error' || res.potentialStatus === 'Blocked')) {
        refundOptimisticCredits();

        if (res.potentialStatus === 'Blocked') {
          showToast('Request blocked by Safety Policy.', 'error');
        } else {
          showToast('Service unavailable. Credits refunded.', 'error');
        }
        setResult(res);
      } else if ('analysis' in res && (res.analysis === 'System Error' || res.analysis === 'Safety Policy Violation')) {
        refundOptimisticCredits();
        showToast(res.analysis, 'error');
        setResult(res);
      } else {
        creditsAdjustedOptimistically = false;
        skipFinalProfileSync = !shouldSyncSignedInProfile;
        setResult(res);
      }

    } catch (error: any) {
      console.error(error);
      if (error.message === 'LOGIN_REQUIRED') {
         setLoginReason(undefined);
         refundOptimisticCredits();
         if (shouldSyncSignedInProfile && supabase) {
           await supabase.auth.signOut().catch((signOutError) => {
             console.warn('Forced sign-out after auth failure failed:', signOutError);
           });
           setSession(null);
           setProfile(null);
           setSavedItems([]);
           profileRef.current = null;
           showToast('Your session expired. Please sign in again.', 'info');
         } else {
           showToast('Authentication failed for this request. Please try again.', 'error');
         }
         return;
      }
      if (error.message === 'INSUFFICIENT_CREDITS') {
         refundOptimisticCredits();
         handleCreditsExhausted(cost);
         if (shouldSyncSignedInProfile) {
           syncProfile().catch(() => {});
         }
         return;
      }
      if (error.message === 'PROFILE_NOT_FOUND') {
         refundOptimisticCredits();
         if (shouldSyncSignedInProfile) {
           await syncProfile().catch(() => null);
         }
         showToast('Profile repaired. Try again.', 'info');
         return;
      }
      if (error.message === 'PROFILE_BOOTSTRAP_FAILED') {
         refundOptimisticCredits();
         if (shouldSyncSignedInProfile) {
           await syncProfile().catch(() => null);
         }
         showToast('We could not prepare your account for generation. Please retry in a moment.', 'error');
         return;
      }
      if (error.message === 'SUPABASE_BACKEND_UNAVAILABLE') {
         refundOptimisticCredits();
         showToast('Signed-in generation is temporarily unavailable on the server. Please retry shortly.', 'error');
         return;
      }
      showToast('The wingman tripped! Try again.', 'error');
      refundOptimisticCredits();
    } finally {
      loadingRef.current = false;
      setLoading(false);
      // Don't call syncProfile for guests — they have no Supabase session
      if (shouldSyncSignedInProfile && !skipFinalProfileSync) {
        await syncProfile().catch(() => null);
      }
    }
  }, [showToast, handleCreditsExhausted, updateCredits, syncProfile]);

  const isSaved = useCallback((content: string) => savedItems.some(item => item.content === content), [savedItems]);
  const clear = useCallback(() => {
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

    if (!isGuestRef.current && currentProfile.id !== 'guest_user' && supabase) {
      Promise.resolve(supabase.from('profiles')
        .update({ shadow_notes: newNotes })
        .eq('id', currentProfile.id))
        .then(({ error }) => { if (error) console.error("Shadow Notes Sync Error:", error); })
        .catch((e: unknown) => console.warn('[ShadowNotes] Sync error:', e));
    }
  }, []);

  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  const handleRetryNetwork = useCallback(async () => {
    const status = await Network.getStatus();
    setIsOffline(!status.connected);
    if (status.connected) showToast("We're back online! 📡", "success");
  }, [showToast]);

  const handleCoachGoPremium = useCallback(() => {
    handleBackNavigation();
    handleOpenPremium();
  }, [handleBackNavigation, handleOpenPremium]);

  const handleCoachOpenWebMenu = useCallback(() => {
    setShowWebMenu(true);
  }, []);

  const handleCoachLoginRequired = useCallback(() => {
    setLoginReason('premium');
    handleExitGuestMode();
  }, [handleExitGuestMode]);

  const handleAddPersona = useCallback(() => {
    const currentProfile = profileRef.current;
    const personas = generationInputsRef.current.customPersonas;
    const limit = currentProfile?.is_premium ? 3 : 1;

    if (personas.length >= limit) {
      if (!currentProfile?.is_premium) {
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
  }, [handleOpenPremium, showToast]);

  const handleEditPersona = useCallback((persona: CustomPersona) => {
    setEditingPersona(persona);
    setPersonaName(persona.name);
    setPersonaInstruction(persona.instruction);
    setShowPersonaModal(true);
  }, []);

  if (updateGateConfig?.blocked) {
    return <ForceUpdateGate config={updateGateConfig} />;
  }

  return (
    <div className="web-app-root relative min-h-screen overflow-x-hidden">

      {showSplash && (
        <SplashScreen
          isAppReady={isAuthReady}
          onComplete={handleSplashComplete}
        />
      )}

      {/* No Internet Overlay */}
      <NoInternetOverlay
        isVisible={isOffline}
        onRetry={handleRetryNetwork}
      />

      {IS_WEB_PLATFORM && onNavigateToPath && showWebMenu && (
        <Suspense fallback={null}>
          <WebAppMenu
            isOpen
            onClose={() => setShowWebMenu(false)}
            onOpenRizz={() => { void handleViewNavigation('HOME'); }}
            onOpenCoach={() => { void handleViewNavigation('COACH'); }}
            onOpenSaved={handleOpenSaved}
            onNavigateToPath={onNavigateToPath}
            onLogout={() => { void handleLogout(); }}
          />
        </Suspense>
      )}
      {IS_WEB_PLATFORM && showWebPremiumModal && (
        <Suspense fallback={null}>
          <WebPremiumModal
            isOpen={showWebPremiumModal}
            isAuthenticated={Boolean(session && profile && !isGuest)}
            isPremium={profile?.is_premium === true}
            premiumSource={profile?.premium_source}
            reason={webPremiumReason}
            onClose={() => setShowWebPremiumModal(false)}
            onLoginRequired={() => {
              setLoginReason('premium');
              handleExitGuestMode();
            }}
          />
        </Suspense>
      )}
      {IS_WEB_PLATFORM && onNavigateToPath && !profile && !showSplash && (
        <button onClick={() => setShowWebMenu(true)} aria-label="Open navigation menu" className="fixed left-4 top-4 z-[150] flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-black/60 text-white/75 shadow-lg backdrop-blur transition-colors hover:bg-white/10 hover:text-white">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      )}

      {/* Onboarding Flow: Shows after Splash if not completed */}
      {!showSplash && showOnboarding && !isPublicInfoView && (
        <OnboardingFlow onComplete={handleOnboardingComplete} />
      )}

      <div className={showSplash ? 'pointer-events-none' : ''}>
        {isPublicInfoView ? (
          <div className="safe-top safe-bottom">
            <Suspense fallback={<div className="min-h-screen bg-black flex items-center justify-center text-white">Loading...</div>}>
              <InfoPages
                page={currentView}
                onBack={handleBackNavigation}
                onDeleteAccount={handleDeleteAccount}
              />
            </Suspense>
          </div>
        ) : isSessionBlocked ? (
          <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 relative overflow-hidden bg-black safe-top safe-bottom">
            <div className="glass max-w-md w-full p-8 rounded-3xl border border-white/10 text-center relative z-10 shadow-2xl">
              <h1 className="text-2xl font-bold mb-4 text-white">Session Paused</h1>
              <button onClick={() => { handleReclaimSession(); }} className="w-full rizz-gradient py-3.5 rounded-xl font-bold text-white">
                Use Here Instead
              </button>
            </div>
          </div>
        ) : (!session && !isGuest) ? (
          <LoginPage onGuestEntry={() => { setLoginReason(undefined); handleGuestEntry(); }} reason={loginReason} />
        ) : !profile ? (
          <div className="min-h-screen flex flex-col items-center justify-center text-white p-4 bg-black safe-top safe-bottom">
            <div className="absolute inset-0 bg-rose-900/5 blur-[100px] pointer-events-none" />

            {isProfileLoadingHung ? (
              <div className="relative z-10 max-w-sm w-full glass p-8 rounded-3xl border border-white/10 text-center animate-fade-in">
                <div className="w-16 h-16 bg-white/5 rounded-full flex items-center justify-center text-3xl mb-6 mx-auto border border-white/10">
                  🔌
                </div>
                <h2 className="text-xl font-bold text-white mb-3">
                  {profileLoadError ? 'Profile load failed' : 'Connection is weak'}
                </h2>
                <p className="text-sm text-white/50 mb-8">
                  {profileLoadError || 'Taking longer than usual to fetch your profile.'}
                </p>
                <button
                  onClick={retryProfileLoad}
                  className="w-full py-3.5 rizz-gradient rounded-xl font-bold text-white active:scale-95 transition-all"
                >
                  Retry
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
          <div className={`${IS_WEB_PLATFORM ? 'animate-slide-in-right-view' : 'native-coach-shell'} fixed inset-0 z-[100] bg-black`}>
            <Suspense fallback={null}>
              <RizzCoach
                key={profile?.id || 'guest_user'}
                userId={profile?.id || 'guest_user'}
                isOpen={true}
                onClose={handleBackNavigation}
                credits={profile?.credits || 0}
                onUpdateCredits={updateCredits}
                isPremium={profile?.is_premium || false}
                onGoPremium={handleCoachGoPremium}
                onCreditsExhausted={handleCreditsExhausted}
                onOpenWebMenu={IS_WEB_PLATFORM && onNavigateToPath ? handleCoachOpenWebMenu : undefined}
                onLoginRequired={handleCoachLoginRequired}
                shadowNotes={profile?.shadow_notes || ''}
                onUpdateShadowNotes={updateShadowNotes}
                customPersonas={customPersonas}
                onAddPersona={handleAddPersona}
                onEditPersona={handleEditPersona}
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
          ) : (
              <div className={`web-app-shell relative min-h-[100dvh] flex flex-col safe-top ${currentView === 'HOME' ? 'animate-fade-in' : 'animate-view-zoom-out'}`}>

              <div className="web-app-backdrop fixed inset-0 z-[-1] pointer-events-none overflow-hidden" />

              <Suspense fallback={null}>
                {showPremiumModal && (
                  <PremiumModal
                    onClose={handleBackNavigation}
                    onUpgrade={handleUpgrade}
                    onRestore={handleRestorePurchases}
                    isGuest={isGuest}
                    userId={profile?.id || null}
                  />
                )}
                <SavedModal
                  isOpen={showSavedModal}
                  onClose={handleBackNavigation}
                  savedItems={savedItems}
                  onDelete={handleDeleteSaved}
                />
              </Suspense>



              <nav className="web-app-topbar">
                <div className="web-app-topbar-leading">
                  {IS_WEB_PLATFORM && onNavigateToPath && (
                    <button onClick={() => setShowWebMenu(true)} aria-label="Open navigation menu" className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white">
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path strokeLinecap="round" d="M4 7h16M4 12h16M4 17h16" /></svg>
                    </button>
                  )}
                <button onClick={handleLogout} className="web-app-logout px-3 py-1.5 text-xs md:text-sm text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all uppercase tracking-widest font-medium border border-transparent hover:border-white/10 flex items-center gap-2 active:scale-95">
                  <span className="text-lg">←</span> <span>Logout</span>
                </button>
                </div>

                <div className="web-app-topbar-actions">

                  <button onClick={handleOpenSaved} className="web-app-topbar-button p-2 md:px-4 md:py-2 bg-white/5 hover:bg-white/10 rounded-full flex items-center gap-1.5 transition-all border border-white/5 active:scale-95">
                    <span className="text-rose-500 text-base md:text-lg">♥</span>
                    <span className="hidden md:inline text-xs font-bold text-white">Saved</span>
                  </button>

                  {!profile?.is_premium && (
                    <button onClick={() => handleOpenPremium()} className="web-app-premium-button hidden md:flex px-4 py-2 bg-gradient-to-r from-yellow-600 to-yellow-400 text-black text-xs font-bold rounded-full items-center gap-1 hover:brightness-110 transition-all active:scale-95">
                      <span>👑</span> Go Premium
                    </button>
                  )}

                  <div
                    onClick={() => showToast("Credits reset to 5 daily. Extra ad credits do not stack.", "info")}
                    className={`web-app-credits flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full border backdrop-blur-md cursor-pointer active:scale-95 transition-all ${profile?.is_premium ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-white/5 border-white/10'}`}
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

              <header className="web-app-heading text-center mb-6 md:mb-8">
                <div className="inline-block relative">
                  <h1 className="web-app-title text-5xl md:text-7xl font-black mb-2 tracking-tighter bg-gradient-to-r from-rose-400 via-amber-200 to-rose-400 bg-clip-text text-transparent pb-2 animate-text-shimmer">
                    Rizz Master
                  </h1>
                  {profile?.is_premium && <div className="absolute -top-4 -right-6 md:-right-8 rotate-12 bg-yellow-500 text-black font-bold text-[10px] md:text-xs px-2 py-1 rounded shadow-lg">PRO</div>}
                </div>
                <p className="web-app-subtitle text-white/60 text-sm md:text-xl font-light max-w-md mx-auto leading-relaxed">
                  Never send a boring text again.
                </p>
              </header>

              {/* Main Mode Selection */}
              <div className="web-app-tabs flex gap-3 mb-6 max-w-lg mx-auto w-full select-none">
                <button onClick={() => { setMode(InputMode.CHAT); if (textareaRef.current) textareaRef.current.value = ''; setImage(null); setResult(null); setInputError(null); }} className={`flex-1 py-3.5 rounded-2xl font-medium text-[13px] md:text-base transition-all duration-300 ${mode === InputMode.CHAT ? 'rizz-gradient text-white shadow-lg shadow-rose-500/20 shadow-purple-500/20' : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'}`}>Chat Reply</button>
                <button onClick={() => { setMode(InputMode.BIO); if (textareaRef.current) textareaRef.current.value = ''; setImage(null); setResult(null); setInputError(null); }} className={`flex-1 py-3.5 rounded-2xl font-medium text-[13px] md:text-base transition-all duration-300 ${mode === InputMode.BIO ? 'rizz-gradient text-white shadow-lg shadow-rose-500/20 shadow-purple-500/20' : 'bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10'}`}>Profile Bio</button>
                <button onClick={() => { handleViewNavigation('COACH'); }} className="flex-1 py-3.5 rounded-2xl font-medium text-[13px] md:text-base transition-all duration-300 bg-white/5 border border-white/10 text-white/60 hover:text-white hover:bg-white/10 flex items-center justify-center gap-1.5">Rizz AI</button>
              </div>

              <div className="web-app-workspace grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-start">
                <section className="web-app-panel web-app-input-panel glass rounded-3xl p-5 md:p-6 border border-white/10 lg:sticky lg:top-8 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto custom-scrollbar">
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
                      defaultValue=""
                      onChange={() => { if (inputError) setInputError(null); }}
                      placeholder={mode === InputMode.CHAT ? "Paste chat. Get Rizz." : "Hobbies, job, vibes..."}
                      className="web-app-textarea w-full h-32 md:h-40 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm md:text-base focus:ring-2 focus:ring-rose-500/50 focus:outline-none resize-none transition-all placeholder:text-white/20"
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
                    <div className="web-app-segmented flex p-0.5 bg-white/5 rounded-xl border border-white/10 select-none w-fit">
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
                          className="web-app-media-button flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all active:scale-[0.98]"
                        >
                          <span className="text-xl">📸</span>
                          <span className="text-sm font-bold text-white/80">Camera</span>
                        </button>
                        <button
                          onClick={handleGalleryCapture}
                          className="web-app-media-button flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 transition-all active:scale-[0.98]"
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
                      className={`web-app-generate-button w-full py-3.5 md:py-4 rounded-2xl font-bold text-base md:text-lg shadow-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed ${profile?.is_premium
                        ? "bg-gradient-to-r from-yellow-500 to-amber-600 text-black"
                        : "rizz-gradient text-white"
                        }`}
                    >
                      {loading ? (
                        <span className="flex items-center justify-center gap-2 animate-pulse">
                          <svg className={`animate-spin h-5 w-5 ${profile?.is_premium ? 'text-black' : 'text-white'}`} viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                          <LoadingMessage />
                        </span>
                      ) : (
                        profile?.is_premium ? "Get Rizz (VIP)" : `Get Rizz (${(mode === InputMode.CHAT && image) ? 2 : 1} ⚡)`
                      )}
                    </button>
                  ) : (
                    <div className={`grid gap-2 ${IS_WEB_PLATFORM ? 'grid-cols-1' : 'grid-cols-2'}`}>
                      <button onClick={() => handleOpenPremium()} className="w-full min-h-[58px] bg-gradient-to-r from-yellow-500 to-amber-600 text-black px-2 py-3 rounded-2xl font-bold text-sm md:text-base shadow-xl hover:brightness-110 active:scale-[0.98] transition-all flex flex-col items-center justify-center animate-pulse">
                        <span>Go Premium</span>
                        <span className="text-[10px] uppercase tracking-wide opacity-70">Unlimited access</span>
                      </button>
                      {!IS_WEB_PLATFORM && !profile?.is_premium && (
                        <button
                          type="button"
                          onClick={() => handleWatchRewardedAd(1)}
                          disabled={isRewardedAdLoading || rewardedAdStatus === 'pending'}
                          className="w-full min-h-[58px] rounded-2xl border border-amber-300/30 bg-amber-300/10 px-2 py-3 text-xs font-bold text-amber-200 transition hover:bg-amber-300/20 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 flex flex-col items-center justify-center"
                        >
                          <span>{isRewardedAdLoading ? 'Opening ad...' : 'Watch an ad'}</span>
                          <span className="text-[10px] uppercase tracking-wide text-amber-200/70">+5 credits</span>
                        </button>
                      )}
                    </div>
                  )}
                  {!profile?.is_premium && (
                    <p
                      onClick={() => showToast("Credits reset to 5 daily. Extra ad credits do not stack.", "info")}
                      className="web-app-credit-note text-center text-[10px] md:text-xs text-white/30 mt-3 md:mt-4 cursor-pointer hover:text-white transition-colors"
                    >
                      {profile?.credits} daily credits remaining. <span className="text-yellow-500/80 cursor-pointer hover:underline" onClick={(e) => { e.stopPropagation(); handleOpenPremium(); }}>Upgrade.</span>
                    </p>
                  )}
                </section>

                <section className="web-app-results-panel flex flex-col gap-4 md:gap-6 min-h-[300px]">
                  {!result && !loading && (
                    <div className="web-app-empty-state h-full flex flex-col items-center justify-center text-white/20 py-6 px-4 text-center border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.02] select-none">
                      <span className="text-5xl md:text-6xl mb-4 grayscale opacity-50">✨</span>
                      <p className="text-sm md:text-xl font-medium max-w-[200px] md:max-w-none mx-auto">Results will appear here.</p>
                    </div>
                  )}

                  {result && 'tease' in result && (
                    <>
                      <div className="web-app-result-card glass rounded-3xl p-5 md:p-6 border border-white/10 animate-fade-in-up">
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
                    <div className="web-app-result-card glass rounded-3xl p-6 md:p-8 border border-white/10 animate-fade-in-up pb-6">
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

              <Footer className="web-app-footer mt-2 md:mt-4" onNavigate={handleViewNavigation} onWebNavigate={IS_WEB_PLATFORM ? onNavigateToPath : undefined} />
            </div>
          )}
      </div>
    </div>
  );
}

// Wrap AppContent with Provider
const App: React.FC<AppProps> = ({ onNavigateToPath }) => {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Suspense fallback={<div className="min-h-screen bg-black" />}>
          <AppContent onNavigateToPath={onNavigateToPath} />
        </Suspense>
      </ToastProvider>
    </ErrorBoundary>
  );
};

export default App;
