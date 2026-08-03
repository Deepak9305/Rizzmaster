
import React, { useState, useRef, useEffect, lazy, Suspense, useCallback } from 'react';
import { generateRizz, generateBio } from './services/rizzService';
import { NativeBridge } from './services/nativeBridge';
import { NotificationService } from './services/notificationService';
import { ToastProvider, useToast } from './context/ToastContext';
import { InputMode, RizzResponse, BioResponse, SavedItem, UserProfile, RizzOrBioResponse, ResponseLength, CustomPersona } from './types';
import { supabase } from './services/supabaseClient';
import RizzCard from './components/RizzCard';
import Footer from './components/Footer';
import PlayStorePromptModal from './components/PlayStorePromptModal';
import WebAppMenu from './components/WebAppMenu';
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

  // Loading State
  const [loading, setLoading] = useState(false);
  const ￿ߴ翭ǿ󫺷է￿ڙڙYOOH؛يHۛܛۙKݘ\ۊҐTȐؘڙ[وٜڙژ؝[ۈY۝ۛ\]NțX]ڛو٘ٚ\[ٚ[ڜڙYۜȜٝދȊNٝ\ێBYȊ\[و٘ٚ\ٚ[ڜڈOOH	ٝ[؝[ۉʈ]ؚ]٘ٚ\ٚ[ڜڊ
NBȈH؝ڈ
\ܛ܊HْX\ܛۊҐTȐؘڙ[وٜڙژ؝[ۈ؛ؘڈؚ[YˈY\ܘYَș\ܛ܈[ܝ[ؙ[و\ܛ܈ș\ܛ܋ۙ\ܘYوȔݜڛي\ܛ܊KȈ[ٚ[ٔ[Έ\˜[ٚ[ٔ[˂ȈXݚ]ْ[ݙ[ݎȝ\˘Xݚ]ْ[ݙ[݋Ȉݛٜ՜ٜҙȈJN\˛ۑ\ܛ܏ˊٝX\\ܛܓY\ܘYي\ܛ܋ԝ\ؚ\وٜڙژ؝[ۈؚ[YʊNHڛ؛H\˜[ٚ[ٔ[ȏHݛ\˘Xݚ]ْ[ݙ[݈Hݛ\˛\ݐ\۝ٙ؛ܘXݚ[ۈHݛBȈJNȈݛܙKݚ[ʊKٚ[ڜڙY

؛ܘXݚ[ێȘ[ފHOȞْX\ܛۊҐTȕ؛ܘXݚ[ۈڛڜڙYˈ؛ܘXݚ[ےٞ\Έ؛ܘXݚ[ۈȓؚ٘݋ڙ^\ʝ؛ܘXݚ[ۊHȖ׋Ȉ[ٚ[ٔ[Έ\˜[ٚ[ٔ[˂ȈXݚ]ْ[ݙ[ݎȝ\˘Xݚ]ْ[ݙ[݋ȈJNJNȈݛܙKݚ[ʊKܜۙXݕ\]Y

ۙXݎȘ[ފHOȞۛܛۙKۛيPTȔۙX݈\]YȉܜۙX݋ڙHɞܜۙX݋ܝ]_WH؛ԝ\ؚ\َȉܜۙX݋ؘ[ԝ\ؚ\ٟX
N\˜ۙXݜȏHݛܙKܜۙXݜ΂ȈJNȈݛܙKݚ[ʊKݜ]Y

ۛݎȘ[ފHOȞ\˜ۙXݜȏHݛܙKܜۙXݜ΂ȈJNȈݛܙKٜܛ܊
\ܛ܎Ș[ފHOȞْX\ܛۊ	ҐT\ܛ܎ɋۙNș\ܛ܏˘ۙKȈY\ܘYَș\ܛ܏˛Y\ܘYًȈ]ۜێȐ؜Xڝ܋ٙ]]ۜۊ
KȈ[ٚ[ٔ[Έ\˜[ٚ[ٔ[˂ȈXݚ]ْ[ݙ[ݎȝ\˘Xݚ]ْ[ݙ[݋ȈJNYȊ\ܛ܈	Ɉ\ܛ܋؛ٙHOOHٝԝ\ؚ\ًќܛܐۙKԐVSQS՗АSБSQ
HYȊ\˛ۑ\ܛ܊H\˛ۑ\ܛ܊ݛܙH\ܛ܎ȉٙ]X\\ܛܓY\ܘYي\ܛ܊_X
NBȈJNȈˈˈ[ڝX[^وݛܙBȈݛܙKڛڝX[^ي
Kݚ[ʊ
HOȞ\˚\қڝX[^ٙHݙNۛܛۙKۛيҐTȔݛܙH[ڝX[^ٙʎݛܙKݜ]J
NJNB\ޛ؈\ؚ\ي[Έ	ՑQRӖIȟ	ӓӕIˈݛٜ՜ٜҙΈݜڛوݛ
HYȊX؛՜ٓ؝]ْX\

JHۛܛۙKݘ\ۊҐTȐ؛݈ۛ\ؚ\وۈ٘ˈʎٝ\ێBۛܝۜۘ[^ٙݛٜ՜ٜҙH\[وݛٜ՜ٜҙOOH	ܝڛىȏțݛٜ՜ٜҙݜڛJ
HȉɎYȊ[ۜۘ[^ٙݛٜ՜ٜҙ
HۛܛۙKݘ\ۊҐTȐ؛݈ۛ\ؚ\وڝݝHٙٙZ[Ș\X؛ݛ݈ݛٜˈʎ\˛ۑ\ܛ܏ˊԛX\وڙۈ[ȘYؚ[ȘٙۜوݘܘܚXڛًȊNٝ\ێB]X؛ݛݐڛٚ[َȜݜڛَވX؛ݛݐڛٚ[وH]ؚ]\˙ٝX؛ݛݐڛٚ[يۜۘ[^ٙݛٜ՜ٜҙ
NH؝ڈ
\ܛ܊H\˛ۑ\ܛ܏ˊٝX\\ܛܓY\ܘYي\ܛ܋Лݛ۝ٜ\و[ݜȘX؛ݛ݈ۜȜ\ؚ\ًȊJNٝ\ێBۛܝٝԝ\ؚ\وHٝٝԝ\ؚ\ي
NۛܝȜݛܙHHHٝԝ\ؚ\َۛܝ\ғԈH؜Xڝ܋ٙ]]ۜۊ
HOOH	ڛ܉΂ȈۛܝۛٚYȏH[ȏOOH	ՑQRӖIȏȒPTГӑґ˕ёRӖHȒPTГӑґ˓SӕNȈۛܝۙXݒYH\ғԈȘۛٚY˚[ܒYȘۛٚY˘[ٜۚYYۛܝ؜ٔ[ҙH\ғԈțݛȘۛٚY˘[ٜۚY؜ٔ[ҙ\˜[ٚ[ٔ[ȏH[΂Ȉ\˘Xݚ]ْ[ݙ[݈H	ܝ\ؚ\ى΂Ȉ\˘ݜܙ[ݕ\ٜҙHۜۘ[^ٙݛٜ՜ٜҙ\˘ݜܙ[ݐX؛ݛݐڛٚ[وHX؛ݛݐڛٚ[َۛܝܙ\ј]HHȘ\X؝[ە\ٜۘ[YNȘX؛ݛݐڛٚ[وNȈْX\ܛۊҐTȐ][\[و\ؚ\وˈۙXݒYȈ؜ٔ[ҙȘ؜ٔ[ҙݛȈ[˂Ȉݛٜ՜ٜҙțۜۘ[^ٙݛٜ՜ٜҙȈJNȈYȊ]\˚\қڝX[^ٙ
HۛܛۙKݘ\ۊҐTȔݛܙH۝[ڝX[^ٙY]ȐXۜݚ[و\ؚ\ًȊN\˜[ٚ[ٔ[ȏHݛ\˘Xݚ]ْ[ݙ[݈HݛYȊ\˛ۑ\ܛ܊H\˛ۑ\ܛ܊ԝܙH۝٘YKȔX\وވYؚ[Ț[ȘH[ۙ[݋ȊNBȈٝ\ێBۛܝۙX݈HݛܙKٙ]
ۙXݒY
NȈYȊۙX݈	ɈۙX݋ؘ[ԝ\ؚ\يHވYȊ؜ٔ[ҙ
HۛܝٜٙȏHٝ^Xݐ[ٜۚYٜٙʜۙX݋؜ٔ[ҙ
NYȊٜٙʈ]ؚ]ٜٙ˛ܙ\ʛܙ\ј]JNH[و۝țٝȑ\ܛ܊՚HٛXݙYݘܘܚ\[ۈ[Ț\ȝ[؝ؚ[XۙKȔX\وٙܙ\ڈHݛܙH[وވYؚ[ˈʎBȈH[وۛܝٜٙȏHۙX݋ٙ]ٜٙʊNYȊٜٙʈ]ؚ]ٜٙ˛ܙ\ʛܙ\ј]JNH[و]ؚ]ݛܙKۜٙ\ʜۙXݒYܙ\ј]JNBȈBȈH؝ڈ
\܎Ș[ފHْX\ܛۊҐTȓܙ\șؚ[YˈۙNș\܏˘ۙKȈY\ܘYَș\܏˛Y\ܘYًȈ؛YNș\܏˛؛YKȈ[ٚ[ٔ[Έ\˜[ٚ[ٔ[˂ȈXݚ]ْ[ݙ[ݎȝ\˘Xݚ]ْ[ݙ[݋Ȉݛٜ՜ٜҙțۜۘ[^ٙݛٜ՜ٜҙȈJN\˜[ٚ[ٔ[ȏHݛ\˘Xݚ]ْ[ݙ[݈HݛYȊ\˛ۑ\ܛ܊H\˛ۑ\ܛ܊ٝX\\ܛܓY\ܘYي\܊JNBȈH[و\˜[ٚ[ٔ[ȏHݛ\˘Xݚ]ْ[ݙ[݈HݛݛܙKݜ]J
NYȊ\˛ۑ\ܛ܊H\˛ۑ\ܛ܊ԜۙX݈[؝ؚ[XۙKȔٝޚ[وۛۙXݚ[ۋˋȊNBȈBȈB\ޛ؈ٜݛܙJݛٜ՜ٜҙΈݜڛوݛ
HYȊX؛՜ٓ؝]ْX\

JHٝ\ێۛܝۜۘ[^ٙݛٜ՜ٜҙH\[وݛٜ՜ٜҙOOH	ܝڛىȏțݛٜ՜ٜҙݜڛJ
HȉɎYȊ[ۜۘ[^ٙݛٜ՜ٜҙ
H\˛ۑ\ܛ܏ˊԛX\وڙۈ[ȘYؚ[Șٙۜوٜݛܚ[و\ؚ\ٜˈʎٝ\ێBۛܝٝԝ\ؚ\وHٝٝԝ\ؚ\ي
NވۛܝX؛ݛݐڛٚ[وH]ؚ]\˙ٝX؛ݛݐڛٚ[يۜۘ[^ٙݛٜ՜ٜҙ
N\˘Xݚ]ْ[ݙ[݈H	ܙ\ݛܙI΂Ȉ\˘ݜܙ[ݕ\ٜҙHۜۘ[^ٙݛٜ՜ٜҙ\˘ݜܙ[ݐX؛ݛݐڛٚ[وHX؛ݛݐڛٚ[َ]ؚ]ٝԝ\ؚ\ًܝܙKܙ\ݛܙJ
N]ؚ]ٝԝ\ؚ\ًܝܙKݜ]J
NH؝ڈ
JHْX\ܛۊҐTȔٜݛܙHؚ[YˈۙNȊH\Ș[ފO˘ۙKȈY\ܘYَȊH\Ș[ފO˛Y\ܘYًȈ؛YNȊH\Ș[ފO˛؛YKȈXݚ]ْ[ݙ[ݎȝ\˘Xݚ]ْ[ݙ[݋Ȉݛٜ՜ٜҙȝ\˘ݜܙ[ݕ\ٜҙȈJN\˘Xݚ]ْ[ݙ[݈HݛBȈBٝژي[Έ	ՑQRӖIȟ	ӓӕIʎȜݜڛوݛYȊX؛՜ٓ؝]ْX\

JHٝ\ۈݛȈۛܝ\ғԈH؜Xڝ܋ٙ]]ۜۊ
HOOH	ڛ܉΂ȈۛܝۛٚYȏH[ȏOOH	ՑQRӖIȏȒPTГӑґ˕ёRӖHȒPTГӑґ˓SӕNȈۛܝۙXݒYH\ғԈȘۛٚY˚[ܒYȘۛٚY˘[ٜۚYYۛܝ؜ٔ[ҙH\ғԈțݛȘۛٚY˘[ٜۚY؜ٔ[ҙȈۛܝۙX݈H\˜ۙXݜ˙ڛي
Ș[ފHOȜڙOOHۙXݒY
NYȊ\ۙX݊Hٝ\ۈݛȈYȊ؜ٔ[ҙ
HۛܝٜٙȏHٝ^Xݐ[ٜۚYٜٙʜۙX݋؜ٔ[ҙ
NYȊٜٙȉɈٜٙ˜ژڛٔ\ٜȉɈٜٙ˜ژڛٔ\ٜ˛[ٝȌ
Hٝ\ۈٜٙ˜ژڛٔ\ٜ֌KܜژَBȈٝ\ۈݛBȈٝ\ۈۙX݋ۙٙ\܏˖̗O˜ژڛٔ\ٜϋ֌O˜ژوݛBۙX\՜ٜʊH\˜[ٚ[ٔ[ȏHݛ\˘Xݚ]ْ[ݙ[݈Hݛ\˘ݜܙ[ݕ\ٜҙHݛ\˘ݜܙ[ݐX؛ݛݐڛٚ[وHݛ\˛\ݐ\۝ٙ؛ܘXݚ[ۈHݛBڝ؝H\ޛ؈ٝX؛ݛݐڛٚ[يݛٜ՜ٜҙȜݜڛيNȔۛZ\ُݜڛُȞYȊ\ݜX؜يH۝țٝȑ\ܛ܊ӛٚ[Ȝޜݙ[H\ț۝٘YKȔX\وٜݘ\݈H\ȊNBۛܝș]NȞȜٜܚ[ۈHHH]ؚ]ݜX؜ً؝]ٙ]ٜܚ[ۊ
NYȊ\ٜܚ[ۏ˘Xؙ\ܗݛڙ[ȟٜܚ[ۋݜٜ˚YOOHݛٜ՜ٜҙ
H۝țٝȑ\ܛ܊ԛX\وڙۈ[ȘYؚ[Șٙۜو\ؚ\ڛًȊNBۛܝٜܛۜوH]ؚ]ٝڊٝ\U\ۊ	˘\Kژ\XX؛ݛ݋Xڛٚ[ىʋY]َȉԓԕ	˂ȈXY\܎Ȟ]]ܚ^؝[ێȘ٘\ٜȉܙ\ܚ[ۋؘؙ\ܗݛڙ[ߘȈKȈJNۛܝ^[ؙH]ؚ]ٜܛًۜڜۛʊKؘ]ڊ

HOțݛ
NۛܝX؛ݛݐڛٚ[وH\[و^[ؙ˘X؛ݛݐڛٚ[وOOH	ܝڛىȏȜ^[ؙؘ؛ݛݐڛٚ[ًݜڛJ
HȉɎȈYȊ\ٜܛًۜۚȟXX؛ݛݐڛٚ[يH۝țٝȑ\ܛ܊^[ؙ˙\ܛ܈Лݛ۝ٜ\و\ؚ\وX؛ݛ݈ڛٚ[ًȊNBٝ\ۈX؛ݛݐڛٚ[َB߂^ܝY؝[ٝȒPTٜݚXي
N¿￿