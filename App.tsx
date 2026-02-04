import React, { useState, useRef, useEffect } from 'react';
import { generateRizz, generateBio } from './services/rizzService';
import { NativeBridge } from './services/nativeBridge';
import { ToastProvider, useToast } from './context/ToastContext';
import { InputMode, RizzResponse, BioResponse, SavedItem, UserProfile } from './types';
import { supabase } from './services/supabaseClient';
import RizzCard from './components/RizzCard';
import LoginPage from './components/LoginPage';
import Footer from './components/Footer';
import PremiumModal from './components/PremiumModal';
import SavedModal from './components/SavedModal';
import InfoPages from './components/InfoPages';
import AdSenseBanner from './components/AdSenseBanner';
import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { Capacitor } from '@capacitor/core';

const DAILY_CREDITS = 5;

type ViewState = 'HOME' | 'PRIVACY' | 'TERMS' | 'SUPPORT';

const generateUUID = () => {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        return crypto.randomUUID();
    }
    return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

const SplashScreen: React.FC<{ forceLoading?: boolean }> = ({ forceLoading }) => {
  const [progress, setProgress] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const duration = 2500;
    const interval = 20;
    const steps = duration / interval;
    let currentStep = 0;

    const timer = setInterval(() => {
      currentStep++;
      const progressValue = Math.min(100, (currentStep / steps) * 100);
      setProgress(progressValue);

      if (currentStep >= steps) {
        clearInterval(timer);
        if (!forceLoading) {
           setTimeout(() => setIsExiting(true), 400); 
        }
      }
    }, interval);

    return () => clearInterval(timer);
  }, [forceLoading]);

  if (isExiting) return null;

  return (
    <div className={`fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center overflow-hidden transition-opacity duration-700 ${progress === 100 && !forceLoading ? 'pointer-events-none' : ''}`}>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-rose-900/20 rounded-full blur-[100px] animate-pulse-glow" />
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-4xl px-4">
        <div className="relative mb-12 text-center">
           <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-rose-200 via-amber-100 to-rose-200 animate-text-shimmer drop-shadow-2xl">
              Rizz Master
           </h1>
        </div>
        <div className="w-64 md:w-80 h-[2px] bg-white/10 rounded-full overflow-hidden relative">
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-rose-500 via-amber-400 to-rose-500 transition-all duration-75 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-4 h-6">
            <p className="text-[10px] md:text-xs font-bold tracking-[0.5em] text-white/40 uppercase">
              {progress < 30 ? 'ANALYZING...' : progress < 70 ? 'COOKING...' : (forceLoading ? 'AUTHENTICATING...' : 'READY.')}
            </p>
        </div>
      </div>
    </div>
  );
};

const AppContent: React.FC = () => {
  const { showToast } = useToast();
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [currentView, setCurrentView] = useState<ViewState>('HOME');
  const [mode, setMode] = useState<InputMode>(InputMode.CHAT);
  const [inputText, setInputText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RizzResponse | BioResponse | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionChannelRef = useRef<BroadcastChannel | null>(null);
  const isAuthInitialized = useRef(false);

  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [isSessionBlocked, setIsSessionBlocked] = useState(false);

  useEffect(() => {
    if (Capacitor.isNativePlatform() && !isAuthInitialized.current) {
       isAuthInitialized.current = true;
       const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
       // GoogleAuth.initialize is void, so we do not use .catch()
       try {
           GoogleAuth.initialize({
               clientId: clientId || 'YOUR_WEB_CLIENT_ID_PLACEHOLDER',
               scopes: ['profile', 'email'],
               grantOfflineAccess: false,
           });
       } catch (e) {
           console.warn("GoogleAuth Init Error:", e);
       }
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
        loadUserData(session.user.id, session.user.email).finally(() => {
            setIsAuthReady(true);
        });
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

  const handleReclaimSession = () => {
    setIsSessionBlocked(false);
    sessionChannelRef.current?.postMessage({ type: 'NEW_SESSION_STARTED' });
  };

  const loadUserData = async (userId: string, email?: string) => {
    if (!supabase || userId === 'guest') {
        const storedProfile = localStorage.getItem('guest_profile');
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
        const storedItems = localStorage.getItem('guest_saved_items');
        setSavedItems(storedItems ? JSON.parse(storedItems) : []);
        return;
    }

    try {
        let { data: profileData, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

        if (error && error.code === 'PGRST116') {
            const { data: newProfile, error: createError } = await supabase
            .from('profiles')
            .insert([{ 
                id: userId, 
                email: email, 
                credits: DAILY_CREDITS, 
                is_premium: false,
                last_daily_reset: new Date().toISOString().split('T')[0]
            }])
            .select()
            .single();
            if (!createError) profileData = newProfile;
        } else if (profileData) {
            const today = new Date().toISOString().split('T')[0];
            if (profileData.last_daily_reset !== today) {
                const { data: updated } = await supabase
                .from('profiles')
                .update({ credits: DAILY_CREDITS, last_daily_reset: today })
                .eq('id', userId)
                .select()
                .single();
                if (updated) profileData = updated;
            }
        }
        
        if (profileData) {
            setProfile(profileData as UserProfile);
            const { data: savedData, error: savedError } = await supabase
            .from('saved_items')
            .select('*')
            .eq('user_id', userId);
            if (!savedError) setSavedItems(savedData || []);
        }
    } catch (err) {
        console.error("Error loading user data:", err);
    }
  };

  const handleGuestLogin = () => {
    loadUserData('guest');
  };

  const handleGenerate = async () => {
    if (!profile) return;
    if (profile.credits <= 0 && !profile.is_premium) {
      setShowPremiumModal(true);
      return;
    }

    if (!inputText.trim() && !image) {
      setInputError("Please provide context or an image.");
      return;
    }

    setLoading(true);
    setInputError(null);
    NativeBridge.haptic('medium');

    try {
      let res;
      if (mode === InputMode.CHAT) {
        res = await generateRizz(inputText, image || undefined);
      } else {
        res = await generateBio(inputText);
      }
      setResult(res);

      if (!profile.is_premium) {
        const newCredits = profile.credits - 1;
        setProfile({ ...profile, credits: newCredits });
        if (supabase && profile.id !== 'guest') {
          await supabase.from('profiles').update({ credits: newCredits }).eq('id', profile.id);
        } else {
          localStorage.setItem('guest_profile', JSON.stringify({ ...profile, credits: newCredits }));
        }
      }
      showToast("Rizz generated!", "success");
    } catch (err: any) {
      showToast(err.message || "Failed to generate", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (content: string, type: 'tease' | 'smooth' | 'chaotic' | 'bio') => {
    if (!profile) return;
    const newItem: SavedItem = {
        id: generateUUID(),
        user_id: profile.id,
        content,
        type,
        created_at: new Date().toISOString()
    };

    if (!supabase || profile.id === 'guest') {
        const newSaved = [newItem, ...savedItems];
        setSavedItems(newSaved);
        localStorage.setItem('guest_saved_items', JSON.stringify(newSaved));
    } else {
        const { error } = await supabase.from('saved_items').insert([newItem]);
        if (!error) setSavedItems([newItem, ...savedItems]);
    }
    showToast("Saved!", "success");
    NativeBridge.haptic('light');
  };

  const handleDeleteSaved = async (id: string) => {
      if (!supabase || profile?.id === 'guest') {
          const newSaved = savedItems.filter(i => i.id !== id);
          setSavedItems(newSaved);
          localStorage.setItem('guest_saved_items', JSON.stringify(newSaved));
      } else {
          await supabase.from('saved_items').delete().eq('id', id);
          setSavedItems(savedItems.filter(i => i.id !== id));
      }
      showToast("Deleted", "info");
  };

  const handleImageUpload = () => fileInputRef.current?.click();

  const onImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  if (isSessionBlocked) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-6 text-center">
        <div className="glass p-8 rounded-3xl border border-white/10 max-w-sm">
          <h2 className="text-2xl font-bold mb-4">Session Active Elsewhere</h2>
          <p className="text-white/60 mb-6">Rizz Master is open in another tab.</p>
          <button onClick={handleReclaimSession} className="w-full py-3 bg-white text-black font-bold rounded-xl">
            Use Here
          </button>
        </div>
      </div>
    );
  }

  if (!isAuthReady) return <SplashScreen forceLoading />;

  if (!session && (!profile || profile.id !== 'guest')) {
    return <LoginPage onGuestLogin={handleGuestLogin} />;
  }

  if (currentView !== 'HOME') {
    return (
      <InfoPages 
        page={currentView} 
        onBack={() => setCurrentView('HOME')} 
        onDeleteAccount={() => confirm("Permanently delete account?") && showToast("Contact support to delete.", "info")}
      />
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <header className="sticky top-0 z-40 bg-black/80 backdrop-blur-lg border-b border-white/5 px-4 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
           <div className="flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <span className="font-black tracking-tighter text-xl">Rizz Master</span>
           </div>
           
           <div className="flex items-center gap-3">
              <button onClick={() => setShowSavedModal(true)} className="p-2 bg-white/5 rounded-full hover:bg-white/10 relative">
                📂 {savedItems.length > 0 && <span className="absolute -top-1 -right-1 w-4 h-4 bg-rose-500 rounded-full text-[10px] flex items-center justify-center">{savedItems.length}</span>}
              </button>
              <div onClick={() => setShowPremiumModal(true)} className="flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded-full border border-white/10 cursor-pointer hover:bg-white/10">
                <span className="text-amber-400">👑</span>
                <span className="text-xs font-bold">{profile?.is_premium ? 'PREMIUM' : `${profile?.credits} left`}</span>
              </div>
           </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 py-8">
        <div className="flex bg-white/5 p-1 rounded-2xl mb-8 border border-white/5">
            <button onClick={() => { setMode(InputMode.CHAT); setResult(null); }} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${mode === InputMode.CHAT ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}>Rizz Reply</button>
            <button onClick={() => { setMode(InputMode.BIO); setResult(null); }} className={`flex-1 py-3 rounded-xl font-bold text-sm transition-all ${mode === InputMode.BIO ? 'bg-white text-black shadow-lg' : 'text-white/40 hover:text-white'}`}>Bio Gen</button>
        </div>

        <div className="glass p-6 rounded-3xl border border-white/10 mb-8">
            <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} placeholder={mode === InputMode.CHAT ? "Paste chat or describe scenario..." : "Tell us about yourself..."} className="w-full bg-transparent border-none resize-none h-32 focus:outline-none text-lg placeholder:text-white/20" />
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
                <div className="flex gap-2">
                    {mode === InputMode.CHAT && (
                        <button onClick={handleImageUpload} className={`p-3 rounded-xl transition-all ${image ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>📸</button>
                    )}
                    <input type="file" ref={fileInputRef} onChange={onImageChange} accept="image/*" className="hidden" />
                </div>
                <button onClick={handleGenerate} disabled={loading} className="px-8 py-3 bg-gradient-to-r from-rose-500 to-amber-500 text-white font-bold rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50">{loading ? 'Thinking...' : 'Generate ✨'}</button>
            </div>
            {image && <div className="mt-4 relative inline-block"><img src={image} className="h-20 w-20 object-cover rounded-xl border border-white/10" alt="Preview" /><button onClick={() => setImage(null)} className="absolute -top-2 -right-2 bg-black rounded-full p-1 border border-white/20 text-[10px]">✕</button></div>}
        </div>

        {result && (
            <div className="space-y-4 animate-fade-in">
                {mode === InputMode.CHAT ? (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <RizzCard label="The Tease" icon="😏" color="from-purple-400 to-pink-400" content={(result as RizzResponse).tease} isSaved={savedItems.some(i => i.content === (result as RizzResponse).tease)} onSave={() => handleSave((result as RizzResponse).tease, 'tease')} onShare={() => NativeBridge.share('Tease Reply', (result as RizzResponse).tease)} delay={0.1} />
                            <RizzCard label="The Smooth" icon="✨" color="from-blue-400 to-emerald-400" content={(result as RizzResponse).smooth} isSaved={savedItems.some(i => i.content === (result as RizzResponse).smooth)} onSave={() => handleSave((result as RizzResponse).smooth, 'smooth')} onShare={() => NativeBridge.share('Smooth Reply', (result as RizzResponse).smooth)} delay={0.2} />
                            <RizzCard label="The Chaotic" icon="😈" color="from-red-400 to-orange-400" content={(result as RizzResponse).chaotic} isSaved={savedItems.some(i => i.content === (result as RizzResponse).chaotic)} onSave={() => handleSave((result as RizzResponse).chaotic, 'chaotic')} onShare={() => NativeBridge.share('Chaotic Reply', (result as RizzResponse).chaotic)} delay={0.3} />
                        </div>
                        <div className="glass p-6 rounded-3xl border border-white/10 text-center">
                            <div className="flex items-center justify-center gap-8 mb-4">
                                <div><div className="text-3xl font-black text-rose-500">{(result as RizzResponse).loveScore}%</div><div className="text-[10px] uppercase font-bold text-white/40">Love Score</div></div>
                                <div className="h-10 w-px bg-white/10" />
                                <div><div className="text-xl font-bold text-amber-400">{(result as RizzResponse).potentialStatus}</div><div className="text-[10px] uppercase font-bold text-white/40">Status</div></div>
                            </div>
                            <p className="text-sm text-white/60 italic">"{(result as RizzResponse).analysis}"</p>
                        </div>
                    </>
                ) : (
                    <div className="space-y-4">
                        <RizzCard label="Your Bio" icon="📝" color="from-emerald-400 to-teal-400" content={(result as BioResponse).bio} isSaved={savedItems.some(i => i.content === (result as BioResponse).bio)} onSave={() => handleSave((result as BioResponse).bio, 'bio')} onShare={() => NativeBridge.share('My New Bio', (result as BioResponse).bio)} />
                        <div className="glass p-6 rounded-3xl border border-white/10"><p className="text-sm text-white/60 text-center italic">"{(result as BioResponse).analysis}"</p></div>
                    </div>
                )}
            </div>
        )}
        <AdSenseBanner dataAdSlot="rizz-main-banner" />
      </main>

      <Footer onNavigate={setCurrentView} />

      {showPremiumModal && (
        <PremiumModal 
          onClose={() => setShowPremiumModal(false)}
          onUpgrade={() => { setProfile(p => p ? { ...p, is_premium: true } : null); setShowPremiumModal(false); }}
          onRestore={() => showToast("Restored", "success")}
        />
      )}

      {showSavedModal && (
        <SavedModal isOpen={showSavedModal} onClose={() => setShowSavedModal(false)} savedItems={savedItems} onDelete={handleDeleteSaved} onShare={(c) => NativeBridge.share('Saved Rizz', c)} />
      )}
    </div>
  );
};

const App = () => (
    <ToastProvider>
        <AppContent />
    </ToastProvider>
);

export default App;