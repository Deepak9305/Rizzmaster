
import React, { useState, useRef, useEffect, lazy, Suspense, useCallback } from 'react';
import { generateRizz, generateBio } from './services/rizzService';
import { NativeBridge } from './services/nativeBridge';
import { NotificationService } from './services/notificationService';
import { ToastProvider, useToast } from './context/ToastContext';
import { InputMode, RizzResponse, BioResponse, SavedItem, UserProfile, RizzOrBioResponse, ResponseLength, CustomPersona } from './types';
import { supabase } from './services/supabaseClient';
import RizzCard from './components/RizzCard';
import Footer from './components/Footer';
import WebAppMenu from './components/WebAppMenu';
import { createDodoPortalSession } from './services/dodoBillingService';
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
import { getApiUrl, runtimeConfig } from './services/runtimeConfig';
import {
  canUseNativeAdMob,
  canUseNativeAppEvents,
  canUseNativeCamera,
  canUseNativeGoogleAuth,
  canUseNativeIap,
  canUseNativeKeyboard,
  canUseNativeNetwork,
  canUseNativeOneSignal,
  canUseNativeStatusBar,
} from './services/nativeCapabilities';
import ForceUpdateGate from './components/ForceUpdateGate';
import { loadUpdateGateConfig, type UpdateGateConfig } from './services/updateGateService';

// Lazy Load Heavy Components / Modals
const PremiumModal = lazy(() => import('./components/PremiumModal'));
const SavedModal = lazy(() => import('./components/SavedModal'));
const InfoPages = lazy(() => import('./components/InfoPages'));
const RizzCoach = lazy(() => import('./components/RizzCoach'));
const LoginPage = lazy(() => import('./components/LoginPage'));
const OnboardingFlow = lazy(() => import('./components/OnboardingFlow'));
const WebPremiumModal = lazy(() => import('./components/WebPremiumModal'));
import ErrorBoundary from './components/ErrorBoundary';
import NoInternetOverlay from './components/NoInternetOverlay';

const DAILY_CREDITS = 5;
const IS_WEB_PLATFORM = !Capacitor.isNativePlatform();
const INTERSTITIAL_PRELOAD_RETRY_MS = 15000;
const INTERSTITIAL_REFRESH_INTERVAL_MS = 8 * 60 * 1000;
const SILENT_PREMIUM_RESTORE_WAIT_MS = 45000;
const SILENT_PREMIUM_RESTORE_RETRY_MS = 60000;
const SILENT_PREMIUM_RESTORE_MAX_ATTEMPTS = 2;

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

  // Splash State
  const [showSplash, setShowSplash] = useState(true);

  // Onboarding State
  const [showOnboarding, setShowOnboarding] = useState(false);

  // App State
  const [currentView, setCurrentView] = useState<ViewState>(() => getViewFromLocation());
  const [mode, setMode] = useState<InputMode>(InputMode.CHAT);
  const [inputText, setInputText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  const [responseLength, setResponseLength] = useState<ResponseLength>('medium');

  // LÛ¾5ÖÚ$z{-®éÜj×¶ÖöFRÓÓÒ–çWDÖöFRä4„BòuF†R6öçFW‡Br¢t&÷WB–÷RwÐ¢ÂöÆ&VÃà¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ2#à¢Æ'WGFöâöä6Æ–6³×²‚’Óâ²–b‡FW‡F&V&Vbæ7W'&VçB’FW‡F&V&Vbæ7W'&VçBçfÇVRÒrs²×Ò6Æ74æÖSÒ'FW‡B×‡2FW‡B×v†—FRó3†÷fW#§FW‡B×v†—FR#ä6ÆV#Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢ÇFW‡F&V¢&Vc×·FW‡F&V&VgÐ¢FVfVÇEfÇVS×¶–çWEFW‡GÐ¢öä6†ævS×²‚’Óâ²–b†–çWDW'&÷"’6WD–çWDW'&÷"†çVÆÂ“²×Ð¢Æ6V†öÆFW#×¶ÖöFRÓÓÒ–çWDÖöFRä4„Bò%7FR6†BâvWB&—§¢â"¢$†ö&&–W2Â¦ö"Âf–&W2âââ'Ð¢6Æ74æÖSÒ'vV"Ö×FW‡F&VrÖgVÆÂ‚Ó3"ÖC¦‚ÓC&rÖ&Æ6²óC&÷&FW"&÷&FW"×v†—FRó&÷VæFVBÓ'†ÂÓBFW‡B×6ÒÖC§FW‡BÖ&6Rfö7W3§&–ærÓ"fö7W3§&–ær×&÷6RÓSóSfö7W3¦÷WFÆ–æRÖæöæR&W6—¦RÖæöæRG&ç6—F–öâÖÆÂÆ6V†öÆFW#§FW‡B×v†—FRó# ¢7G–ÆS×·²föçE6—¦S¢sg‚r×Ð¢óà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&Ö"Ób#à¢ÆÆ&VÂ6Æ74æÖSÒ&&Æö6²FW‡B×‡2föçBÖ&öÆBFW‡B×v†—FRóSWW&66RG&6¶–ær×v–FW7BÖ"Ó2#à¢6VÆV7Bf–&R„÷F–öæÂ¢ÂöÆ&VÃà¢ÆF—b6Æ74æÖSÒ&fÆW‚fÆW‚×w&vÓ"#à¢²†ÖöFRÓÓÒ–çWDÖöFRä4„Bòd”$U5ô4„B¢d”$U5ô$”ò’æÖ‚‡f–&R’Óâ€¢Æ'WGFöà¢¶W“×·f–&RæÆ&VÇÐ¢öä6Æ–6³×²‚’Óâ†æFÆUf–&T6Æ–6²‡f–&R—Ð¢6Æ74æÖS×¶‚Ó2’ÓãR&÷VæFVBÖgVÆÂFW‡B×‡2föçBÖ&öÆB&÷&FW"G&ç6—F–öâÖÆÂ7F—fS§66ÆRÓ“RfÆW‚—FV×2Ö6VçFW"vÓãRG·6VÆV7FVEf–&RÓÓÒf–&RæÆ&VÀ¢òv&r×&÷6RÓSó#&÷&FW"×&÷6RÓSFW‡B×&÷6RÓ3p¢¢f–&Ræ—5&òbb&öf–ÆSòæ—5÷&VÖ—VÐ¢òv&r×v†—FRóR&÷&FW"×–VÆÆ÷rÓSó3FW‡B×v†—FRóC†÷fW#¦&r×v†—FRóp¢¢v&r×v†—FRóR&÷&FW"×v†—FRóFW‡B×v†—FRóc†÷fW#¦&r×v†—FRó†÷fW#§FW‡B×v†—FRp¢ÖÐ¢à¢·f–&RæÆ&VÇÐ¢·f–&Ræ—5&òbb&öf–ÆSòæ—5÷&VÖ—VÒbbÇ7â6Æ74æÖSÒ'FW‡BÕ³…Ò#ï	ùI#Â÷7ãçÐ¢·f–&Ræ—5&òbb&öf–ÆSòæ—5÷&VÖ—VÒbb6VÆV7FVEf–&RÓÒf–&RæÆ&VÂbbÇ7â6Æ74æÖSÒ'FW‡BÕ³…ÒFW‡B×–VÆÆ÷rÓS#ï	ùÂ÷7ãçÐ¢Âö'WGFöãà¢’—Ð¢ÂöF—cà¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&Ö"Ób#à¢ÆÆ&VÂ6Æ74æÖSÒ&&Æö6²FW‡B×‡2föçBÖ&öÆBFW‡B×v†—FRóSWW&66RG&6¶–ær×v–FW7BÖ"Ó2#à¢&W7öç6RÆVæwF€¢ÂöÆ&VÃà¢ÆF—b6Æ74æÖSÒ'vV"Ö×6VvÖVçFVBfÆW‚ÓãR&r×v†—FRóR&÷VæFVB×†Â&÷&FW"&÷&FW"×v†—FRó6VÆV7BÖæöæRrÖf—B#à¢Æ'WGFöà¢öä6Æ–6³×²‚’Óâ6WE&W7öç6TÆVæwF‚‚w6†÷'Br—Ð¢6Æ74æÖS×¶‚ÓB’ÓãR&÷VæFVBÖÆrFW‡BÕ³…ÒföçBÖ&Æ6²G&ç6—F–öâÖÆÂÖ–â×rÕ³ƒ…ÒG·&W7öç6TÆVæwF‚ÓÓÒw6†÷'Bròv&r×&÷6RÓSFW‡B×v†—FR6†F÷rÖÆrr¢wFW‡B×v†—FRóC†÷fW#§FW‡B×v†—FRócwÖÐ¢à¢4„õ%@¢Âö'WGFöãà¢Æ'WGFöà¢öä6Æ–6³×²‚’Óâ6WE&W7öç6TÆVæwF‚‚vÖVF—VÒr—Ð¢6Æ74æÖS×¶‚ÓB’ÓãR&÷VæFVBÖÆrFW‡BÕ³…ÒföçBÖ&Æ6²G&ç6—F–öâÖÆÂÖ–â×rÕ³ƒ…ÒG·&W7öç6TÆVæwF‚ÓÓÒvÖVF—VÒròv&r×&÷6RÓSFW‡B×v†—FR6†F÷rÖÆrr¢wFW‡B×v†—FRóC†÷fW#§FW‡B×v†—FRócwÖÐ¢à¢ÔTD•TÐ¢Âö'WGFöãà¢Æ'WGFöà¢öä6Æ–6³×²‚’Óâ6WE&W7öç6TÆVæwF‚‚vÆöærr—Ð¢6Æ74æÖS×¶‚ÓB’ÓãR&÷VæFVBÖÆrFW‡BÕ³…ÒföçBÖ&Æ6²G&ç6—F–öâÖÆÂÖ–â×rÕ³ƒ…ÒG·&W7öç6TÆVæwF‚ÓÓÒvÆöærròv&r×&÷6RÓSFW‡B×v†—FR6†F÷rÖÆrr¢wFW‡B×v†—FRóC†÷fW#§FW‡B×v†—FRócwÖÐ¢à¢Äôäp¢Âö'WGFöãà¢ÂöF—cà¢ÂöF—cà ¢¶ÖöFRÓÓÒ–çWDÖöFRä4„Bbb€¢ÆF—b6Æ74æÖSÒ&Ö"ÓBÖC¦Ö"Ób#à¢ÆF—b6Æ74æÖSÒ&w&–Bw&–BÖ6öÇ2Ó"vÓ2Ö"Ó2#à¢Æ'WGFöà¢öä6Æ–6³×¶†æFÆT6ÖW&6GW&WÐ¢6Æ74æÖSÒ'vV"ÖÖÖVF–Ö'WGFöâfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"’Ó2&r×v†—FRóR&÷&FW"&÷&FW"×v†—FRó&÷VæFVBÓ'†Â†÷fW#¦&r×v†—FRóG&ç6—F–öâÖÆÂ7F—fS§66ÆRÕ³ã“…Ò ¢à¢Ç7â6Æ74æÖSÒ'FW‡B×†Â#ï	ù;ƒÂ÷7ãà¢Ç7â6Æ74æÖSÒ'FW‡B×6ÒföçBÖ&öÆBFW‡B×v†—FRóƒ#ä6ÖW&Â÷7ãà¢Âö'WGFöãà¢Æ'WGFöà¢öä6Æ–6³×¶†æFÆTvÆÆW'”6GW&WÐ¢6Æ74æÖSÒ'vV"ÖÖÖVF–Ö'WGFöâfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"’Ó2&r×v†—FRóR&÷&FW"&÷&FW"×v†—FRó&÷VæFVBÓ'†Â†÷fW#¦&r×v†—FRóG&ç6—F–öâÖÆÂ7F—fS§66ÆRÕ³ã“…Ò ¢à¢Ç7â6Æ74æÖSÒ'FW‡B×†Â#ï	ùkÎûˆóÂ÷7ãà¢Ç7â6Æ74æÖSÒ'FW‡B×6ÒföçBÖ&öÆBFW‡B×v†—FRóƒ#ävÆÆW'“Â÷7ãà¢Âö'WGFöãà¢ÂöF—cà ¢¶–ÖvRbb€¢ÆF—`¢6Æ74æÖSÒ&w&÷W&÷&FW"Ó"&÷&FW"ÖF6†VB&÷&FW"×v†—FRó&÷VæFVBÓ'†ÂG&ç6—F–öâÖÆÂÓ"&VÆF—fR ¢à¢Æ–Ör7&3×¶–ÖvWÒÇCÒ%&Wf–Wr"6Æ74æÖSÒ'rÖgVÆÂÖ‚Ö‚ÓC‚ö&¦V7BÖ6öçF–â&÷VæFVBÖÆr×‚ÖWFò"óà¢Æ'WGFöâöä6Æ–6³×²†R’Óâ²Rç7F÷&÷vF–öâ‚“²6WD–ÖvR†çVÆÂ“²×Ò6Æ74æÖSÒ&'6öÇWFRF÷Ó"&–v‡BÓ"&rÖ&Æ6²óƒFW‡B×v†—FR&÷VæFVBÖgVÆÂrÓ‚‚Ó‚fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"FW‡B×6Ò&÷&FW"&÷&FW"×v†—FRó##î)ÉSÂö'WGFöãà¢ÂöF—cà¢—Ð¢Æ–çWBG—SÒ&f–ÆR"66WCÒ&–ÖvRò¢"6Æ74æÖSÒ&†–FFVâ"&Vc×¶f–ÆT–çWE&VgÒöä6†ævS×¶†æFÆT–ÖvUWÆöGÒóà¢ÂöF—cà¢—Ð ¢¶–çWDW'&÷"bb€¢ÆF—b6Æ74æÖSÒ&Ö"ÓBÓ2&r×&VBÓSó&÷&FW"&÷&FW"×&VBÓSóS&÷VæFVB×†ÂfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"æ–ÖFR×VÇ6R#à¢Ç7â6Æ74æÖSÒ'FW‡BÖÆr#î)ªûˆóÂ÷7ãà¢Ç6Æ74æÖSÒ'FW‡B×6ÒFW‡B×&VBÓ#föçBÖÖVF—VÒ#ç¶–çWDW'&÷'ÓÂ÷à¢ÂöF—cà¢—Ð ¢²‡&öf–ÆSòæ—5÷&VÖ—VÒÇÂ‡&öf–ÆSòæ7&VF—G2ÇÂ’â’ò€¢Æ'WGFöà¢öä6Æ–6³×²‚’Óâ†æFÆTvVæW&FR‡FW‡F&V&Vbæ7W'&VçCòçfÇVRÇÂrr—Ð¢F—6&ÆVC×¶ÆöF–æwÐ¢6Æ74æÖS×¶vV"ÖÖvVæW&FRÖ'WGFöârÖgVÆÂ’Ó2ãRÖC§’ÓB&÷VæFVBÓ'†ÂföçBÖ&öÆBFW‡BÖ&6RÖC§FW‡BÖÆr6†F÷r×†Â†÷fW#¦÷6—G’Ó“7F—fS§66ÆRÕ³ã“…ÒG&ç6—F–öâÖÆÂF—6&ÆVC¦÷6—G’Ó3F—6&ÆVC¦7W'6÷"Öæ÷BÖÆÆ÷vVBG·&öf–ÆSòæ—5÷&VÖ—VÐ¢ò&&rÖw&F–VçB×Fò×"g&öÒ×–VÆÆ÷rÓSFòÖÖ&W"ÓcFW‡BÖ&Æ6² ¢¢'&—§¢Öw&F–VçBFW‡B×v†—FR ¢ÖÐ¢à¢¶ÆöF–ærò€¢Ç7â6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"æ–ÖFR×VÇ6R#à¢Ç7fr6Æ74æÖS×¶æ–ÖFR×7–â‚ÓRrÓRG·&öf–ÆSòæ—5÷&VÖ—VÒòwFW‡BÖ&Æ6²r¢wFW‡B×v†—FRwÖÒf–Wt&÷ƒÒ##B#B#ãÆ6—&6ÆR6Æ74æÖSÒ&÷6—G’Ó#R"7ƒÒ#""7“Ò#""#Ò#"7G&ö¶SÒ&7W'&VçD6öÆ÷""7G&ö¶Uv–GFƒÒ#B#ãÂö6—&6ÆSãÇF‚6Æ74æÖSÒ&÷6—G’ÓsR"f–ÆÃÒ&7W'&VçD6öÆ÷""CÒ$ÓB&‚‚‚Ó…c3Rã3s2Rã3s2&ƒG¦Ó"Rã#“rã“c"rã“c"B$ƒ32ãC"ã3RRãƒ#B2rã“3†Ã2Ó"ãcCw¢#ãÂ÷FƒãÂ÷7fsà¢¶ÆöF–æt×6wÐ¢Â÷7ãà¢’¢€¢&öf–ÆSòæ—5÷&VÖ—VÒò$vWB&—§¢…d•’"¢vWB&—§¢‚G²†ÖöFRÓÓÒ–çWDÖöFRä4„Bbb–ÖvR’ò"¢Ò)ª– ¢—Ð¢Âö'WGFöãà¢’¢€¢Æ'WGFöâöä6Æ–6³×¶†æFÆT÷Vå&VÖ—V×Ò6Æ74æÖSÒ'rÖgVÆÂ&rÖw&F–VçB×Fò×"g&öÒ×–VÆÆ÷rÓSFòÖÖ&W"ÓcFW‡BÖ&Æ6²’Ó2ãRÖC§’ÓB&÷VæFVBÓ'†ÂföçBÖ&öÆBFW‡B×6ÒÖC§FW‡BÖ&6R6†F÷r×†Â†÷fW#¦'&–v‡FæW72Ó7F—fS§66ÆRÕ³ã“…ÒG&ç6—F–öâÖÆÂfÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"æ–ÖFR×VÇ6R#à¢vòVæÆ–Ö—FV@¢Âö'WGFöãà¢—Ð¢²&öf–ÆSòæ—5÷&VÖ—VÒbb€¢Ç ¢öä6Æ–6³×²‚’Óâ6†÷uFö7B‚$7&VF—G2&W6WBFòRF–Ç’âW‡G&B7&VF—G2Fòæ÷B7F6²â"Â&–æfò"—Ð¢6Æ74æÖSÒ'vV"ÖÖ7&VF—BÖæ÷FRFW‡BÖ6VçFW"FW‡BÕ³…ÒÖC§FW‡B×‡2FW‡B×v†—FRó3×BÓ2ÖC¦×BÓB7W'6÷"×ö–çFW"†÷fW#§FW‡B×v†—FRG&ç6—F–öâÖ6öÆ÷'2 ¢à¢·&öf–ÆSòæ7&VF—G7ÒF–Ç’7&VF—G2&VÖ–æ–ærâÇ7â6Æ74æÖSÒ'FW‡B×–VÆÆ÷rÓSóƒ7W'6÷"×ö–çFW"†÷fW#§VæFW&Æ–æR"öä6Æ–6³×²†R’Óâ²Rç7F÷&÷vF–öâ‚“²†æFÆT÷Vå&VÖ—VÒ‚“²×ÓåWw&FRãÂ÷7ãà¢Â÷à¢—Ð¢Â÷6V7F–öãà ¢Ç6V7F–öâ6Æ74æÖSÒ'vV"Ö×&W7VÇG2×æVÂfÆW‚fÆW‚Ö6öÂvÓBÖC¦vÓbÖ–âÖ‚Õ³3…Ò#à¢²&W7VÇBbbÆöF–ærbb€¢ÆF—b6Æ74æÖSÒ'vV"ÖÖV×G’×7FFR‚ÖgVÆÂfÆW‚fÆW‚Ö6öÂ—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"FW‡B×v†—FRó#’Ób‚ÓBFW‡BÖ6VçFW"&÷&FW"Ó"&÷&FW"ÖF6†VB&÷&FW"×v†—FRóR&÷VæFVBÓ7†Â&r×v†—FRõ³ã%Ò6VÆV7BÖæöæR#à¢Ç7â6Æ74æÖSÒ'FW‡BÓW†ÂÖC§FW‡BÓg†ÂÖ"ÓBw&—66ÆR÷6—G’ÓS#î)ÊƒÂ÷7ãà¢Ç6Æ74æÖSÒ'FW‡B×6ÒÖC§FW‡B×†ÂföçBÖÖVF—VÒÖ‚×rÕ³#…ÒÖC¦Ö‚×rÖæöæR×‚ÖWFò#å&W7VÇG2v–ÆÂV"†W&RãÂ÷à¢ÂöF—cà¢—Ð ¢·&W7VÇBbbwFV6Rr–â&W7VÇBbb€¢Ãà¢ÆF—b6Æ74æÖSÒ'vV"Ö×&W7VÇBÖ6&BvÆ72&÷VæFVBÓ7†ÂÓRÖC§Ób&÷&FW"&÷&FW"×v†—FRóæ–ÖFRÖfFRÖ–â×W#à¢ÆF—b6Æ74æÖSÒ&fÆW‚§W7F–g’Ö&WGvVVâ—FV×2Ö6VçFW"Ö"Ó2#à¢Æƒ26Æ74æÖSÒ'FW‡B×‡2föçBÖ&öÆBWW&66RG&6¶–ær×v–FW7BFW‡B×v†—FRóC#äæÇ—6—3Âöƒ3à¢Ç7â6Æ74æÖSÒ'FW‡BÓ'†ÂÖC§FW‡BÓ7†ÂföçBÖ&Æ6²FW‡B×v†—FR#ç·&W7VÇBæÆ÷fU66÷&WÒSÂ÷7ãà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ&Ö"ÓB#à¢ÆF—b6Æ74æÖSÒ'FW‡B×†ÂÖC§FW‡BÓ'†ÂföçBÖ&Æ6²FW‡B×&÷6RÓSWW&66R—FÆ–2ÆVF–ærÖæöæR#ç·&W7VÇBç÷FVçF–Å7FGW7ÓÂöF—cà¢ÂöF—cà¢ÆF—b6Æ74æÖSÒ'&VÆF—fR‚Ó2ÖC¦‚ÓB&rÖ&Æ6²óC&÷VæFVBÖgVÆÂ÷fW&fÆ÷rÖ†–FFVâ&÷&FW"&÷&FW"×v†—FRóR#à¢ÆF—b6Æ74æÖSÒ&'6öÇWFRF÷ÓÆVgBÓ‚ÖgVÆÂ&—§¢Öw&F–VçBG&ç6—F–öâÖÆÂGW&F–öâÓV6RÖ÷WB"7G–ÆS×·²v–GFƒ¢G·&W7VÇBæÆ÷fU66÷&WÒV×ÓãÂöF—cà¢ÂöF—cà¢·&W7VÇBææÇ—6—2bbÇ6Æ74æÖSÒ&×BÓBFW‡B×‡2ÖC§FW‡B×6ÒFW‡B×v†—FRócÆVF–ær×&VÆ†VB&÷&FW"×B&÷&FW"×v†—FRóRBÓ2#ç·&W7VÇBææÇ—6—7ÓÂ÷çÐ¢ÂöF—cà ¢ÆF—b6Æ74æÖSÒ&w&–BvÓ2ÖC¦vÓB"Ób#à¢Å&—§¤6&BÆ&VÃÒ%FV6R"6öçFVçC×·&W7VÇBçFV6WÒ–6öãÒ/	ùˆò"6öÆ÷#Ò&g&öÒ×W'ÆRÓSFòÖ–æF–vòÓS"—56fVC×¶—56fVB‡&W7VÇBçFV6R—ÒG—SÒ'FV6R"öå6fS×¶†æFÆU6fUw&W'Òöå&W÷'C×¶†æFÆU&W÷'GÒFVÆ“×³ãÒóà¢Å&—§¤6&BÆ&VÃÒ%6Öö÷F‚"6öçFVçC×·&W7VÇBç6Öö÷F‡Ò–6öãÒ/	ú¨B"6öÆ÷#Ò&g&öÒÖ&ÇVRÓSFòÖ7–âÓS"—56fVC×¶—56fVB‡&W7VÇBç6Öö÷F‚—ÒG—SÒ'6Öö÷F‚"öå6fS×¶†æFÆU6fUw&W'Òöå&W÷'C×¶†æFÆU&W÷'GÒFVÆ“×³ã'Òóà¢Å&—§¤6&BÆ&VÃÒ$6†÷F–2"6öçFVçC×·&W7VÇBæ6†÷F–7Ò–6öãÒ/	úJ"6öÆ÷#Ò&g&öÒÖ÷&ævRÓSFò×&VBÓS"—56fVC×¶—56fVB‡&W7VÇBæ6†÷F–2—ÒG—SÒ&6†÷F–2"öå6fS×¶†æFÆU6fUw&W'Òöå&W÷'C×¶†æFÆU&W÷'GÒFVÆ“×³ã7Òóà¢ÂöF—cà¢Âóà¢—Ð ¢·&W7VÇBbbv&–òr–â&W7VÇBbb€¢ÆF—b6Æ74æÖSÒ'vV"Ö×&W7VÇBÖ6&BvÆ72&÷VæFVBÓ7†ÂÓbÖC§Ó‚&÷&FW"&÷&FW"×v†—FRóæ–ÖFRÖfFRÖ–â×W"Ób#à¢ÆF—b6Æ74æÖSÒ&fÆW‚—FV×2Ö6VçFW"vÓ"Ö"ÓBÖC¦Ö"Ób#à¢Ç7â6Æ74æÖSÒ'FW‡BÓ'†Â#ï	ù9ÓÂ÷7ãà¢Æƒ26Æ74æÖSÒ'FW‡B×‡2ÖC§FW‡B×6ÒföçB×6VÖ–&öÆBWW&66RG&6¶–ær×v–FW7BFW‡B×v†—FRóc#ä&–ò&W7VÇCÂöƒ3à¢ÆF—b6Æ74æÖSÒ&ÖÂÖWFòfÆW‚vÓ"#à¢Æ'WGFöâöä6Æ–6³×²‚’Óâ²æF—fT'&–FvRæ6÷•Fô6Æ—&ö&B‡&W7VÇBæ&–ò“²6†÷uFö7B‚t&–ò6÷–VBrÂw7V66W72r“²×Ò6Æ74æÖSÒ'Ó"&÷VæFVBÖgVÆÂ†÷fW#¦&r×v†—FRóG&ç6—F–öâÖÆÂFW‡B×v†—FRóS†÷fW#§FW‡B×v†—FR#ãÇ7fr6Æ74æÖSÒ'rÓR‚ÓR"f–ÆÃÒ&æöæR"7G&ö¶SÒ&7W'&VçD6öÆ÷""f–Wt&÷ƒÒ##B#B#ãÇF‚7G&ö¶TÆ–æV6Ò'&÷VæB"7G&ö¶TÆ–æV¦ö–ãÒ'&÷VæB"7G&ö¶Uv–GFƒÒ#""CÒ$Ó‚Tƒf""Ó"'c&"""&ƒ"""Ó'bÓÓ‚V"""&ƒ&"""Ó$Ó‚V"""Ó&ƒ&"""&Óƒ&"""'c6Ó"DƒÓÃ2Ó6ÒÓ26Ã22"óãÂ÷7fsãÂö'WGFöãà¢Æ'WGFöâöä6Æ–6³×²‚’ÓâFövvÆU6fR‡&W7VÇBæ&–òÂv&–òr—Ò6Æ74æÖS×¶Ó"&÷VæFVBÖgVÆÂ†÷fW#¦&r×v†—FRóG&ç6—F–öâÖÆÂG¶—56fVB‡&W7VÇBæ&–ò’òwFW‡B×&÷6RÓSr¢wFW‡B×v†—FRóS†÷fW#§FW‡B×&÷6RÓCwÖÓãÇ7fr6Æ74æÖSÒ'rÓR‚ÓR"f–ÆÃ×¶—56fVB‡&W7VÇBæ&–ò’ò&7W'&VçD6öÆ÷""¢&æöæR'Ò7G&ö¶SÒ&7W'&VçD6öÆ÷""f–Wt&÷ƒÒ##B#B#ãÇF‚7G&ö¶TÆ–æV6Ò'&÷VæB"7G&ö¶TÆ–æV¦ö–ãÒ'&÷VæB"7G&ö¶Uv–GFƒÒ#""CÒ$ÓBã3‚bã3†BãRBãRbã3cDÃ"#ã3cFÃrãcƒ"Órãcƒ&BãRBãRÓbã3cBÓbã3cDÃ"rãc3fÂÓã3‚Óã3†BãRBãRÓbã3cB¢"óãÂ÷7fsãÂö'WGFöãà¢ÂöF—cà¢ÂöF—cà¢Ç6Æ74æÖSÒ'FW‡BÖÆrÖC§FW‡B×†ÂÆVF–ær×&VÆ†VBföçBÖÖVF—VÒÖ"ÓbÖC¦Ö"Ó‚FW‡B×v†—FR#ç·&W7VÇBæ&–÷ÓÂ÷à¢ÆF—b6Æ74æÖSÒ'ÓB&r×v†—FRóR&÷VæFVBÓ'†Â&÷&FW"&÷&FW"×v†—FRóRÖ"ÓB#ãÆƒB6Æ74æÖSÒ'FW‡BÕ³…ÒWW&66RföçBÖ&öÆBFW‡B×&÷6RÓCÖ"Ó#åv‡’—Bv÷&·3ÂöƒCãÇ6Æ74æÖSÒ'FW‡B×‡2ÖC§FW‡B×6ÒFW‡B×v†—FRóc#ç·&W7VÇBææÇ—6—7ÓÂ÷ãÂöF—cà¢Æ'WGFöâöä6Æ–6³×²‚’Óâ²æF—fT'&–FvRæ6÷•Fô6Æ—&ö&B‡&W7VÇBæ&–ò“²6†÷uFö7B‚t&–ò6÷–VBrÂw7V66W72r“²×Ò6Æ74æÖSÒ'rÖgVÆÂ’Ó2&÷&FW"&÷&FW"×v†—FRó#&÷VæFVB×†Â†÷fW#¦&r×v†—FRóRG&ç6—F–öâÖ6öÆ÷'2FW‡B×6ÒföçBÖÖVF—VÒfÆW‚—FV×2Ö6VçFW"§W7F–g’Ö6VçFW"vÓ"#ãÇ7ãï	ù8³Â÷7ãâ6÷’&–óÂö'WGFöãà¢ÂöF—cà¢—Ð¢Â÷6V7F–öãà¢ÂöF—cà ¢Äfö÷FW"6Æ74æÖSÒ'vV"ÖÖfö÷FW"×BÓ"ÖC¦×BÓB"öäæf–vFS×¶†æFÆUf–Wtæf–vF–öçÒöåvV$æf–vFS×´•5õtT%õÄDdõ$Òòöäæf–vFUFõF‚¢VæFVf–æVGÒóà¢ÂöF—cà¢—Ð¢ÂöF—cà¢ÂöF—cà¢“°§Ð ¢òòw&6öçFVçBv—F‚&÷f–FW ¦6öç7B¢&V7Bäd3Ä&÷3âÒ‡²öäæf–vFUFõF‚Ò’Óâ°¢&WGW&â€¢ÄW'&÷$&÷VæF'“à¢ÅFö7E&÷f–FW#à¢Å7W7Vç6RfÆÆ&6³×³ÆF—b6Æ74æÖSÒ&Ö–âÖ‚×67&VVâ&rÖ&Æ6²"óçÓà¢Ä6öçFVçBöäæf–vFUFõFƒ×¶öäæf–vFUFõF‡Òóà¢Âõ7W7Vç6Sà¢ÂõFö7E&÷f–FW#à¢ÂôW'&÷$&÷VæF'“à¢“°§Ó° ¦W‡÷'BFVfVÇB°