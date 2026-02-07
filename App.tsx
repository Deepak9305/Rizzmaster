
import React, { useState, useRef, useEffect, lazy, Suspense, useCallback } from 'react';
import { generateRizz, generateBio } from './services/rizzService';
import { NativeBridge } from './services/nativeBridge';
import { ToastProvider, useToast } from './context/ToastContext';
import { InputMode, RizzResponse, BioResponse, SavedItem, UserProfile } from './types';
import { supabase } from './services/supabaseClient';
import RizzCard from './components/RizzCard';
import LoginPage from './components/LoginPage';
import Footer from './components/Footer';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';
import { AdMobService } from './services/admobService';

// Lazy Load Heavy Components / Modals
const PremiumModal = lazy(() => import('./components/PremiumModal'));
const SavedModal = lazy(() => import('./components/SavedModal'));
const InfoPages = lazy(() => import('./components/InfoPages'));

const DAILY_CREDITS = 5;
const REWARD_CREDITS = 3;
const AD_DURATION = 15;

// --- OFFICIAL GOOGLE TEST IDS ---
const TEST_AD_UNIT_ID_ANDROID = 'ca-app-pub-3940256099942544/5224354917';
const TEST_AD_UNIT_ID_IOS = 'ca-app-pub-3940256099942544/1712485313';
const TEST_PRODUCT_ID = 'android.test.purchased';

type ViewState = 'HOME' | 'PRIVACY' | 'TERMS' | 'SUPPORT';

const LOADING_MESSAGES = [
  "Analyzing context...",
  "Reading between the lines...",
  "Scanning for red flags...",
  "Consulting the Rizz God...",
  "Drafting fire replies...",
  "Polishing the charm...",
  "Cooking..."
];

const VIBES_CHAT = ["Flirty", "Funny", "Savage", "Wholesome", "Nonchalant", "Intellectual", "Romantic"];
const VIBES_BIO = ["Confident", "Chill", "Funny", "Mysterious", "Adventurous", "Direct", "Witty"];

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
    // Increased to 2200ms to ensure it's not too fast ("flash")
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
        <div className="mt-4 h-6 overflow-hidden">
            <p className="text-[10px] md:text-xs font-bold tracking-[0.5em] text-white/40 uppercase animate-fade-in-up">
              {progress < 30 ? 'ANALYZING...' : progress < 70 ? 'COOKING...' : (isAppReady ? 'READY.' : 'AUTHENTICATING...')}
            </p>
        </div>
      </div>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { showToast } = useToast();
  
  // Auth State
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const profileRef = useRef<UserProfile | null>(null); 

  // Splash State
  const [showSplash, setShowSplash] = useState(true);

  // App State
  const [currentView, setCurrentView] = useState<ViewState>('HOME');
  const [mode, setMode] = useState<InputMode>(InputMode.CHAT);
  const [inputText, setInputText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [selectedVibe, setSelectedVibe] = useState<string | null>(null);
  
  // Loading State
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState("Cooking...");
  
  const [result, setResult] = useState<RizzResponse | BioResponse | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionChannelRef = useRef<BroadcastChannel | null>(null);

  // Modals & Flags
  const [isAdPlaying, setIsAdPlaying] = useState(false);
  const [adTimer, setAdTimer] = useState(0);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [isSessionBlocked, setIsSessionBlocked] = useState(false);
  const [isAdLoading, setIsAdLoading] = useState(false);

  // Sync profile ref
  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  // Handle History API for Mobile Back Button support
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state || {};
      
      // Update Views
      setCurrentView(state.view || 'HOME');
      
      // Update Modals
      setShowPremiumModal(!!state.premium);
      setShowSavedModal(!!state.saved);
    };

    // Initialize state if needed
    if (!window.history.state) {
      window.history.replaceState({ view: 'HOME' }, '');
    }

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Navigation Wrappers
  const handleViewNavigation = useCallback((view: ViewState) => {
    if (view === currentView) return;
    window.history.pushState({ view }, '');
    setCurrentView(view);
    NativeBridge.haptic('light');
  }, [currentView]);

  const handleBackNavigation = useCallback(() => {
    NativeBridge.haptic('light');
    window.history.back();
  }, []);

  const handleOpenPremium = useCallback(() => {
    window.history.pushState({ view: currentView, premium: true }, '');
    setShowPremiumModal(true);
    NativeBridge.haptic('medium');
  }, [currentView]);

  const handleOpenSaved = useCallback(() => {
    window.history.pushState({ view: currentView, saved: true }, '');
    setShowSavedModal(true);
    NativeBridge.haptic('light');
  }, [currentView]);

  // Initialize Native Google Auth & AdMob
  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
       const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
       if (!clientId) console.warn("VITE_GOOGLE_CLIENT_ID missing");
       
       GoogleAuth.initialize({
           clientId: clientId || 'YOUR_WEB_CLIENT_ID_PLACEHOLDER',
           scopes: ['profile', 'email'],
           grantOfflineAccess: false,
       });

       // Init AdMob
       AdMobService.initialize();
    }
  }, []);

  useEffect(() => {
    if (!supabase) {
        setIsAuthReady(true);
        return;
    }
    
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        loadUserData(session.user.id, session.user.email).finally(() => setIsAuthReady(true));
      } else {
         setIsAuthReady(true);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadUserData(session.user.id, session.user.email);
      } else {
        setProfile(null);
        setSavedItems([]);
      }
    });

    return () => subscription.unsubscribe();
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

  // Loading Message Rotation
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
    if (!supabase || userId === 'guest') {
        const storedProfile = localStorage.getItem('guest_profile');
        const storedItems = localStorage.getItem('guest_saved_items');
        
        if (storedProfile) {
            setProfile(JSON.parse(storedProfile));
        } else {
            const newProfile: UserProfile = { 
              id: 'guest', 
              email: 'guest@rizzmaster.ai', 
              credits: DAILY_CREDITS, 
              is_premium: false, 
              last_daily_reset: new Date().toISOString().split('T')[0] 
            };
            setProfile(newProfile);
            localStorage.setItem('guest_profile', JSON.stringify(newProfile));
        }
        setSavedItems(storedItems ? JSON.parse(storedItems) : []);
        return;
    }

    try {
        const profilePromise = supabase.from('profiles').select('*').eq('id', userId).single();
        const savedPromise = supabase.from('saved_items').select('*').eq('user_id', userId).order('created_at', { ascending: false });

        const [profileResult, savedResult] = await Promise.all([profilePromise, savedPromise]);

        let profileData = profileResult.data;
        const savedData = savedResult.data;

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
    
    NativeBridge.haptic('medium');
    
    try {
        if (supabase) await supabase.auth.signOut();
        if (Capacitor.isNativePlatform()) {
            try { await GoogleAuth.signOut(); } catch (error) { console.warn("Native Logout err", error); }
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
        
        // Reset history to clean slate
        window.history.replaceState({ view: 'HOME' }, '', '/');
    }
  }, [showToast]);

  const handleGuestLogin = useCallback(() => {
      NativeBridge.haptic('light');
      const guestUser = { id: 'guest', email: 'guest@rizzmaster.ai' };
      setSession({ user: guestUser });
      loadUserData(guestUser.id);
  }, []);

  const updateCredits = useCallback(async (newAmount: number) => {
    if (!profileRef.current) return;
    
    const currentProfile = profileRef.current;
    const updatedProfile = { ...currentProfile, credits: newAmount };
    
    setProfile(updatedProfile); 
    
    if (supabase && currentProfile.id !== 'guest') {
        await supabase.from('profiles').update({ credits: newAmount }).eq('id', currentProfile.id);
    } else {
        localStorage.setItem('guest_profile', JSON.stringify(updatedProfile));
    }
  }, []);

  const handleUpgrade = useCallback(async (plan: 'WEEKLY' | 'MONTHLY') => {
    if (!profile) return;
    NativeBridge.haptic('success');
    const updatedProfile = { ...profile, is_premium: true };
    setProfile(updatedProfile);
    
    // Close modal via back navigation to keep history clean
    handleBackNavigation();
    
    showToast(`Welcome to the Elite Club! 👑`, 'success');

    if (supabase && profile.id !== 'guest') {
        await supabase.from('profiles').update({ is_premium: true }).eq('id', profile.id);
    } else {
        localStorage.setItem('guest_profile', JSON.stringify(updatedProfile));
    }
  }, [profile, showToast, handleBackNavigation]);

  const handleRestorePurchases = useCallback(async () => {
    if (!profile) return;
    NativeBridge.haptic('medium');
    await new Promise(resolve => setTimeout(resolve, 1500));
    const updatedProfile = { ...profile, is_premium: true };
    setProfile(updatedProfile);
    
    handleBackNavigation();
    
    showToast(`Purchases Restored!`, 'success');
    
    if (supabase && profile.id !== 'guest') {
        await supabase.from('profiles').update({ is_premium: true }).eq('id', profile.id);
    } else {
        localStorage.setItem('guest_profile', JSON.stringify(updatedProfile));
    }
  }, [profile, showToast, handleBackNavigation]);

  const toggleSave = useCallback(async (content: string, type: 'tease' | 'smooth' | 'chaotic' | 'bio') => {
    if (!profile) return;
    NativeBridge.haptic('light');

    const exists = savedItems.find(item => item.content === content);
    
    if (exists) {
      const newItems = savedItems.filter(item => item.id !== exists.id);
      setSavedItems(newItems);
      showToast("Removed from saved", 'info');
      
      if (supabase && profile.id !== 'guest') {
          await supabase.from('saved_items').delete().eq('id', exists.id);
      } else {
          localStorage.setItem('guest_saved_items', JSON.stringify(newItems));
      }
    } else {
      const newItem: SavedItem = {
          id: generateUUID(),
          user_id: profile.id,
          content,
          type,
          created_at: new Date().toISOString()
      };
      
      const newItems = [newItem, ...savedItems];
      setSavedItems(newItems);
      showToast("Saved to your gems", 'success');

      if (supabase && profile.id !== 'guest') {
        const { data } = await supabase.from('saved_items').insert([{ user_id: profile.id, content, type }]).select().single();
        if (data) {
             setSavedItems(current => current.map(i => i.id === newItem.id ? { ...i, id: data.id } : i));
        }
      } else {
        localStorage.setItem('guest_saved_items', JSON.stringify(newItems));
      }
    }
  }, [profile, savedItems, showToast]);

  const handleDeleteSaved = useCallback(async (id: string) => {
    NativeBridge.haptic('medium');
    const newItems = savedItems.filter(item => item.id !== id);
    setSavedItems(newItems);
    showToast("Item deleted", 'info');

    if (supabase && profile?.id !== 'guest') {
        await supabase.from('saved_items').delete().eq('id', id);
    } else {
        localStorage.setItem('guest_saved_items', JSON.stringify(newItems));
    }
  }, [profile, savedItems, showToast]);

  const handleDeleteAccount = useCallback(async () => {
    NativeBridge.haptic('error');
    if (!window.confirm("Are you sure? This cannot be undone.")) return;
    if (!profile) return;

    if (!supabase || profile.id === 'guest') {
        localStorage.removeItem('guest_profile');
        localStorage.removeItem('guest_saved_items');
        setProfile(null);
        setSession(null);
        setSavedItems([]);
        setResult(null);
        setCurrentView('HOME');
        showToast("Guest account deleted", 'info');
        window.history.replaceState({ view: 'HOME' }, '', '/');
        return;
    }

    try {
        setLoading(true);
        const { error } = await supabase.from('profiles').delete().eq('id', profile.id);
        if (error) throw error;
        await supabase.auth.signOut();
        setSession(null);
        setProfile(null);
        setSavedItems([]);
        setResult(null);
        setCurrentView('HOME');
        showToast("Account deleted", 'success');
        window.history.replaceState({ view: 'HOME' }, '', '/');
    } catch (err: any) {
        showToast("Failed to delete account", 'error');
    } finally {
        setLoading(false);
    }
  }, [profile, showToast]);

  const handleSaveWrapper = useCallback((content: string, type: 'tease' | 'smooth' | 'chaotic' | 'bio') => {
      toggleSave(content, type);
  }, [toggleSave]);

  const handleShare = useCallback(async (content: string) => {
    NativeBridge.haptic('light');
    const status = await NativeBridge.share('Rizz Master Reply', content);
    if (status === 'COPIED') {
        showToast('Link copied to clipboard!', 'success');
    } else if (status === 'FAILED') {
        showToast('Could not share content.', 'error');
    }
  }, [showToast]);

  const handleReport = useCallback(() => {
    NativeBridge.haptic('medium');
    showToast('Report submitted. We will review this.', 'info');
  }, [showToast]);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
          NativeBridge.haptic('error');
          showToast('Image too large. Max 5MB.', 'error');
          return;
      }
      NativeBridge.haptic('light');
      const reader = new FileReader();
      reader.onloadend = () => {
        setImage(reader.result as string);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
      if (inputError) setInputError(null);
    }
  };

  const handleGenerate = async () => {
    if (!profile) return;
    
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

    if (!profile?.is_premium && (profile?.credits || 0) < cost) {
      if ((profile?.credits || 0) > 0) showToast(`Need ${cost} credits.`, 'error');
      handleOpenPremium();
      return;
    }

    setLoading(true);
    
    const creditsBefore = profile.credits || 0;

    try {
      if (!profile?.is_premium) {
        updateCredits(creditsBefore - cost);
      }

      let res;
      if (mode === InputMode.CHAT) {
        res = await generateRizz(inputText, image || undefined, selectedVibe || undefined);
      } else {
        res = await generateBio(inputText, selectedVibe || undefined);
      }

      if ('potentialStatus' in res && (res.potentialStatus === 'Error' || res.potentialStatus === 'Blocked')) {
         if (profileRef.current && !profileRef.current.is_premium) updateCredits(creditsBefore);
         
         if (res.potentialStatus === 'Blocked') {
            showToast('Request blocked by Safety Policy.', 'error');
         } else {
            showToast('Service unavailable. Credits refunded.', 'error');
         }
         setResult(res);
      } else if ('analysis' in res && (res.analysis === 'System Error' || res.analysis === 'Safety Policy Violation')) {
         if (profileRef.current && !profileRef.current.is_premium) updateCredits(creditsBefore);
         showToast(res.analysis, 'error');
         setResult(res);
      } else {
         setResult(res);
         NativeBridge.haptic('success');
      }

    } catch (error) {
      console.error(error);
      showToast('The wingman tripped! Try again.', 'error');
      if (profileRef.current && !profileRef.current.is_premium) updateCredits(creditsBefore);
    } finally {
      setLoading(false);
    }
  };

  const handleWatchAd = async () => {
    NativeBridge.haptic('medium');
    // Close modal first via back navigation to keep history clean
    handleBackNavigation();

    if (Capacitor.isNativePlatform()) {
        setIsAdLoading(true);
        try {
            const adUnitId = Capacitor.getPlatform() === 'ios' ? TEST_AD_UNIT_ID_IOS : TEST_AD_UNIT_ID_ANDROID;
            const rewardEarned = await AdMobService.showRewardVideo(adUnitId);
            setIsAdLoading(false);
            
            if (rewardEarned) {
                 updateCredits((profile?.credits || 0) + REWARD_CREDITS);
                 NativeBridge.haptic('success');
                 showToast(`+${REWARD_CREDITS} Credits Added!`, 'success');
            } else {
                 showToast('Ad was canceled or failed.', 'info');
            }
            return; 
        } catch (e) {
            console.warn("Native Ad failed, fallback to web.", e);
            setIsAdLoading(false);
        }
    }

    setIsAdPlaying(true);
    setAdTimer(AD_DURATION); 
    const interval = setInterval(() => {
      setAdTimer((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    setTimeout(() => {
      setIsAdPlaying(false);
      if (profileRef.current) {
          updateCredits((profileRef.current.credits || 0) + REWARD_CREDITS);
          NativeBridge.haptic('success');
          showToast(`+${REWARD_CREDITS} Credits Added!`, 'success');
      }
    }, AD_DURATION * 1000);
  };

  const isSaved = useCallback((content: string) => savedItems.some(item => item.content === content), [savedItems]);
  const clear = useCallback(() => { 
      setInputText(''); 
      setImage(null); 
      setResult(null); 
      setInputError(null); 
      setSelectedVibe(null);
      NativeBridge.haptic('light'); 
  }, []);

  return (
    <div className="relative min-h-screen bg-black overflow-x-hidden">
      
      {/* 
        SPLASH SCREEN OVERLAY 
        Render conditionally but sits on top (z-50+). 
        The app content is rendered beneath it to prevent "pop-in" of elements.
      */}
      {showSplash && (
          <SplashScreen 
            isAppReady={isAuthReady} 
            onComplete={() => setShowSplash(false)} 
          />
      )}

      {/* 
        MAIN CONTENT
        Only interactive when splash is gone, but rendered to allow background loading 
      */}
      <div className={showSplash ? 'pointer-events-none' : ''}>
          {isSessionBlocked ? (
            <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 relative overflow-hidden bg-black safe-top safe-bottom">
                <div className="glass max-w-md w-full p-8 rounded-3xl border border-white/10 text-center relative z-10 shadow-2xl">
                <h1 className="text-2xl font-bold mb-4 text-white">Session Paused</h1>
                <button onClick={() => { handleReclaimSession(); NativeBridge.haptic('medium'); }} className="w-full rizz-gradient py-3.5 rounded-xl font-bold text-white">
                    Use Here Instead
                </button>
                </div>
            </div>
          ) : !session ? (
            <LoginPage onGuestLogin={handleGuestLogin} />
          ) : !profile ? (
            <div className="min-h-screen flex flex-col items-center justify-center text-white p-4 bg-black safe-top safe-bottom">
                <svg className="animate-spin h-8 w-8 text-rose-500 mb-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <p className="text-white/50 animate-pulse">Loading Profile...</p>
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
            <div className="max-w-4xl mx-auto px-4 py-6 md:py-12 pb-24 relative min-h-[100dvh] flex flex-col animate-fade-in safe-top safe-bottom">
            
            {/* Background Animation Layer */}
            <div className="fixed inset-0 z-[-1] pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-20%] w-[600px] h-[600px] bg-rose-900/10 rounded-full blur-[120px] animate-pulse-glow" />
                <div className="absolute bottom-[-10%] right-[-20%] w-[500px] h-[500px] bg-amber-900/10 rounded-full blur-[100px] animate-float" />
            </div>

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
                    onShare={handleShare}
                />
            </Suspense>

            {isAdLoading && (
                <div className="fixed inset-0 z-[100] bg-black/80 flex flex-col items-center justify-center p-8 backdrop-blur-sm">
                <div className="bg-zinc-900 border border-white/10 rounded-2xl p-6 flex flex-col items-center">
                    <svg className="animate-spin h-8 w-8 text-rose-500 mb-4" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    <p className="text-white font-bold">Loading Ad...</p>
                </div>
                </div>
            )}

            {isAdPlaying && (
                <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-8 safe-top safe-bottom">
                <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-8 text-center border border-white/10 relative overflow-hidden flex flex-col h-[60vh] justify-center">
                    <div className="absolute top-0 left-0 w-full h-1 bg-white/20">
                    <div className="h-full bg-rose-500 transition-all ease-linear w-full" style={{ width: '0%', transitionDuration: `${AD_DURATION}s` }}></div>
                    </div>
                    <div className="text-4xl font-black text-rose-500 mb-4">{adTimer}s</div>
                    <p className="text-white/60 mb-6">Watching Rewarded Ad...</p>
                </div>
                </div>
            )}

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

                <div className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full border backdrop-blur-md ${profile?.is_premium ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-white/5 border-white/10'}`}>
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

            <div className="flex p-1 bg-white/5 rounded-full mb-8 relative border border-white/10 max-w-md mx-auto w-full select-none">
                <button onClick={() => { setMode(InputMode.CHAT); clear(); }} className={`flex-1 py-3 rounded-full font-medium text-sm md:text-base transition-all duration-300 relative z-10 ${mode === InputMode.CHAT ? 'text-white shadow-lg' : 'text-white/50 hover:text-white/80'}`}>Chat Reply</button>
                <button onClick={() => { setMode(InputMode.BIO); clear(); }} className={`flex-1 py-3 rounded-full font-medium text-sm md:text-base transition-all duration-300 relative z-10 ${mode === InputMode.BIO ? 'text-white shadow-lg' : 'text-white/50 hover:text-white/80'}`}>Profile Bio</button>
                <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full rizz-gradient transition-all duration-300 ${mode === InputMode.CHAT ? 'left-1' : 'left-[calc(50%+4px)]'}`} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-start">
                <section className="glass rounded-3xl p-5 md:p-6 border border-white/10 lg:sticky lg:top-8 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto custom-scrollbar">
                <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                        <label className="block text-xs font-bold text-white/50 uppercase tracking-widest">
                        {mode === InputMode.CHAT ? 'The Context' : 'About You'}
                        </label>
                        {inputText.length > 0 && (
                            <button onClick={() => setInputText('')} className="text-xs text-white/30 hover:text-white">Clear</button>
                        )}
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
                                key={vibe} 
                                onClick={() => { setSelectedVibe(selectedVibe === vibe ? null : vibe); NativeBridge.haptic('light'); }}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all active:scale-95 ${
                                    selectedVibe === vibe 
                                    ? 'bg-rose-500/20 border-rose-500 text-rose-300' 
                                    : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
                                }`}
                            >
                                {vibe}
                            </button>
                        ))}
                    </div>
                </div>

                {mode === InputMode.CHAT && (
                    <div className="mb-4 md:mb-6">
                    <div 
                        onClick={() => fileInputRef.current?.click()}
                        className={`group border-2 border-dashed border-white/10 rounded-2xl transition-all cursor-pointer hover:border-rose-500/50 hover:bg-white/5 active:scale-[0.99] ${image ? 'p-2' : 'p-6 md:p-8'}`}
                    >
                        {image ? (
                        <div className="relative w-full">
                            <img src={image} alt="Preview" className="w-full max-h-48 object-contain rounded-lg mx-auto" />
                            <button onClick={(e) => { e.stopPropagation(); setImage(null); }} className="absolute top-2 right-2 bg-black/80 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm border border-white/20">✕</button>
                        </div>
                        ) : (
                        <div className="flex flex-row items-center justify-center gap-3 opacity-50">
                            <span className="text-2xl">📸</span>
                            <span className="text-sm font-medium">Add Screenshot</span>
                        </div>
                        )}
                        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
                    </div>
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
                    className={`w-full py-3.5 md:py-4 rounded-2xl font-bold text-base md:text-lg shadow-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                        profile?.is_premium 
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
                    <button onClick={handleWatchAd} disabled={isAdLoading} className="bg-white/10 border border-white/10 py-3.5 md:py-4 rounded-2xl font-bold text-sm md:text-base hover:bg-white/20 active:scale-[0.98] transition-all flex flex-col items-center justify-center">
                    {isAdLoading ? <span className="text-white/50 text-xs">Loading...</span> : <><span className="text-xl mb-1">📺</span> <span>Watch Ad (+3)</span></>}
                    </button>
                    <button onClick={handleOpenPremium} className="bg-gradient-to-r from-yellow-500 to-amber-600 text-black py-3.5 md:py-4 rounded-2xl font-bold text-sm md:text-base shadow-xl hover:brightness-110 active:scale-[0.98] transition-all flex flex-col items-center justify-center animate-pulse">
                    <span className="text-xl mb-1">👑</span> <span>Go Unlimited</span>
                    </button>
                    </div>
                )}
                {!profile?.is_premium && <p className="text-center text-[10px] md:text-xs text-white/30 mt-3 md:mt-4">{profile?.credits} daily credits remaining. <span className="text-yellow-500/80 cursor-pointer hover:underline" onClick={handleOpenPremium}>Upgrade.</span></p>}
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
                        <RizzCard label="Tease" content={result.tease} icon="😏" color="from-purple-500 to-indigo-500" isSaved={isSaved(result.tease)} onSave={() => handleSaveWrapper(result.tease, 'tease')} onShare={() => handleShare(result.tease)} onReport={handleReport} delay={0.1} />
                        <RizzCard label="Smooth" content={result.smooth} icon="🪄" color="from-blue-500 to-cyan-500" isSaved={isSaved(result.smooth)} onSave={() => handleSaveWrapper(result.smooth, 'smooth')} onShare={() => handleShare(result.smooth)} onReport={handleReport} delay={0.2} />
                        <RizzCard label="Chaotic" content={result.chaotic} icon="🤡" color="from-orange-500 to-red-500" isSaved={isSaved(result.chaotic)} onSave={() => handleSaveWrapper(result.chaotic, 'chaotic')} onShare={() => handleShare(result.chaotic)} onReport={handleReport} delay={0.3} />
                    </div>
                    </>
                )}

                {result && 'bio' in result && (
                    <div className="glass rounded-3xl p-6 md:p-8 border border-white/10 animate-fade-in-up pb-12">
                    <div className="flex items-center gap-2 mb-4 md:mb-6">
                        <span className="text-2xl">📝</span>
                        <h3 className="text-xs md:text-sm font-semibold uppercase tracking-widest text-white/60">Bio Result</h3>
                        <div className="ml-auto flex gap-2">
                            <button onClick={() => { NativeBridge.copyToClipboard(result.bio); showToast('Bio copied!', 'success'); NativeBridge.haptic('light'); }} className="p-2 rounded-full hover:bg-white/10 transition-all text-white/50 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg></button>
                            <button onClick={() => handleShare(result.bio)} className="p-2 rounded-full hover:bg-white/10 transition-all text-white/50 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg></button>
                            <button onClick={() => toggleSave(result.bio, 'bio')} className={`p-2 rounded-full hover:bg-white/10 transition-all ${isSaved(result.bio) ? 'text-rose-500' : 'text-white/50 hover:text-rose-400'}`}><svg className="w-5 h-5" fill={isSaved(result.bio) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg></button>
                        </div>
                    </div>
                    <p className="text-lg md:text-xl leading-relaxed font-medium mb-6 md:mb-8 text-white">{result.bio}</p>
                    <div className="p-4 bg-white/5 rounded-2xl border border-white/5 mb-4"><h4 className="text-[10px] uppercase font-bold text-rose-400 mb-1">Why it works</h4><p className="text-xs md:text-sm text-white/60">{result.analysis}</p></div>
                    <button onClick={() => { NativeBridge.copyToClipboard(result.bio); showToast('Bio copied!', 'success'); NativeBridge.haptic('light'); }} className="w-full py-3 border border-white/20 rounded-xl hover:bg-white/5 transition-colors text-sm font-medium flex items-center justify-center gap-2"><span>📋</span> Copy Bio</button>
                    </div>
                )}
                </section>
            </div>
            <Footer className="mt-12 md:mt-20" onNavigate={handleViewNavigation} />
            </div>
          )}
      </div>
    </div>
  );
}

const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppContent />
    </ToastProvider>
  );
};

export default App;
