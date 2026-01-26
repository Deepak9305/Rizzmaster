import React, { useState, useRef, useEffect } from 'react';
import { generateRizz, generateBio } from './services/rizzService';
import { InputMode, RizzResponse, BioResponse, SavedItem, UserProfile } from './types';
import { supabase } from './services/supabaseClient';
import RizzCard from './components/RizzCard';
import LoginPage from './components/LoginPage';
import PremiumModal from './components/PremiumModal';
// Using SavedModal as the View Component
import SavedView from './components/SavedModal'; 
import ProfileView from './components/ProfileView';
import InfoPages from './components/InfoPages';
import BottomNav from './components/BottomNav';
import { initializeNativeFeatures, isNative, selectImageNative, showRewardedAdNative, shareNative, copyToClipboard } from './services/capacitorService';
import { App as CapacitorApp } from '@capacitor/app';
import { PluginListenerHandle } from '@capacitor/core';

const DAILY_CREDITS = 5;
const REWARD_CREDITS = 5;
const AD_DURATION = 15;
const TEST_AD_UNIT_ID = 'ca-app-pub-3940256099942544/5224354917';
const TEST_PRODUCT_ID = 'android.test.purchased';

type TabView = 'HOME' | 'SAVED' | 'PROFILE';
type FullScreenView = 'PRIVACY' | 'TERMS' | 'SUPPORT' | null;

const SplashScreen: React.FC = () => {
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
        setTimeout(() => setIsExiting(true), 400);
      }
    }, interval);

    return () => clearInterval(timer);
  }, []);

  if (isExiting) return null;

  return (
    <div className={`fixed inset-0 z-[100] bg-[#020202] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-700 ${progress === 100 ? 'pointer-events-none' : ''}`}>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-violet-900/20 rounded-full blur-[120px] animate-pulse-glow" />
      <div className="absolute top-1/4 left-1/4 w-[300px] h-[300px] bg-fuchsia-900/10 rounded-full blur-[80px] animate-float" />
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-4xl px-4">
        <div className="relative mb-12">
           <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-violet-200 via-fuchsia-100 to-rose-200 animate-text-shimmer drop-shadow-2xl">
              Rizz Master
           </h1>
           <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent blur-xl opacity-50 animate-text-shimmer" style={{ backgroundSize: '200% 100%' }}></div>
        </div>
        <div className="w-64 md:w-80 h-[2px] bg-white/5 rounded-full overflow-hidden relative">
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-rose-500 shadow-[0_0_15px_rgba(219,39,119,0.5)] transition-all duration-75 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [showSplash, setShowSplash] = useState(true);
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileError, setProfileError] = useState(false);

  // Navigation State
  const [activeTab, setActiveTab] = useState<TabView>('HOME');
  const [fullScreenPage, setFullScreenPage] = useState<FullScreenView>(null);

  // Content State
  const [mode, setMode] = useState<InputMode>(InputMode.CHAT);
  const [inputText, setInputText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RizzResponse | BioResponse | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // UI State
  const [isAdPlaying, setIsAdPlaying] = useState(false);
  const [adTimer, setAdTimer] = useState(0);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [isSessionBlocked, setIsSessionBlocked] = useState(false);

  // Music State
  const [isMusicPlaying, setIsMusicPlaying] = useState(false);
  const [isUserMuted, setIsUserMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
     initializeNativeFeatures();
     const timer = setTimeout(() => setShowSplash(false), 3000);
     return () => clearTimeout(timer);
  }, []);

  const safePlay = () => {
    if (audioRef.current) {
        audioRef.current.volume = 0.2;
        audioRef.current.play().then(() => setIsMusicPlaying(true)).catch(() => setIsMusicPlaying(false));
    }
  };

  useEffect(() => {
    if (!isUserMuted && !isMusicPlaying) safePlay();
    const handleInteraction = () => {
      if (!isUserMuted && !isMusicPlaying) safePlay();
      window.removeEventListener('click', handleInteraction);
    };
    window.addEventListener('click', handleInteraction);
    return () => window.removeEventListener('click', handleInteraction);
  }, [isUserMuted]); 

  const toggleMusic = () => {
    if (audioRef.current) {
      if (isMusicPlaying) {
        audioRef.current.pause();
        setIsMusicPlaying(false);
        setIsUserMuted(true);
      } else {
        safePlay();
        setIsUserMuted(false);
      }
    }
  };

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadUserData(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadUserData(session.user.id);
      } else {
        setProfile(null);
        setSavedItems([]);
      }
    });

    let urlListener: PluginListenerHandle | undefined;
    let backListener: PluginListenerHandle | undefined;

    const setupListeners = async () => {
      if (isNative()) {
        urlListener = await CapacitorApp.addListener('appUrlOpen', async ({ url }) => {
          if (url.includes('auth/callback')) {
            try {
               const parsedUrl = new URL(url);
               const code = parsedUrl.searchParams.get('code');
               if (code) await supabase?.auth.exchangeCodeForSession(code);
            } catch (err) { console.error(err); }
          }
        });

        backListener = await CapacitorApp.addListener('backButton', ({ canGoBack }) => {
          if (showPremiumModal) setShowPremiumModal(false);
          else if (fullScreenPage) setFullScreenPage(null);
          else if (activeTab !== 'HOME') setActiveTab('HOME');
          else CapacitorApp.exitApp();
        });
      }
    };

    setupListeners();
    return () => {
        subscription.unsubscribe();
        if (urlListener) urlListener.remove();
        if (backListener) backListener.remove();
    };
  }, [showPremiumModal, fullScreenPage, activeTab]); 

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel('rizz_session_sync');
    channel.postMessage({ type: 'NEW_SESSION_STARTED' });
    channel.onmessage = (event) => {
      if (event.data.type === 'NEW_SESSION_STARTED') setIsSessionBlocked(true);
    };
    return () => channel.close();
  }, []);

  const loadUserData = async (userId: string) => {
    if (!supabase) return;
    setProfileError(false);

    try {
        let { data: profileData, error } = await supabase.from('profiles').select('*').eq('id', userId).single();

        if (error && error.code === 'PGRST116') {
            const { data: newProfile } = await supabase.from('profiles').insert([{ 
                id: userId, 
                email: session?.user.email,
                credits: DAILY_CREDITS,
                is_premium: false,
                last_daily_reset: new Date().toISOString().split('T')[0]
            }]).select().single();
            if (newProfile) profileData = newProfile;
        }
        
        if (profileData) {
            const today = new Date().toISOString().split('T')[0];
            if (profileData.last_daily_reset !== today) {
                const { data: updated } = await supabase.from('profiles').update({ credits: DAILY_CREDITS, last_daily_reset: today }).eq('id', userId).select().single();
                if (updated) profileData = updated;
            }
            setProfile(profileData as UserProfile);

            const { data: savedData } = await supabase.from('saved_items').select('*').eq('user_id', userId).order('created_at', { ascending: false });
            if (savedData) setSavedItems(savedData as SavedItem[]);
        } else {
            setProfileError(true);
        }
    } catch (e) {
        setProfileError(true);
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setResult(null);
    setInputText('');
    setImage(null);
    setActiveTab('HOME');
  };

  const updateCredits = async (newAmount: number) => {
    if (!profile) return;
    setProfile({ ...profile, credits: newAmount });
    if (supabase) await supabase.from('profiles').update({ credits: newAmount }).eq('id', profile.id);
  };

  const handleUpgrade = async (plan: 'WEEKLY' | 'MONTHLY') => {
    if (!profile) return;
    setProfile({ ...profile, is_premium: true });
    setShowPremiumModal(false);
    alert(`[TEST MODE] Payment Successful!\nWelcome to the Elite Club! 👑`);
    if (supabase) await supabase.from('profiles').update({ is_premium: true }).eq('id', profile.id);
  };

  const handleRestorePurchases = async () => {
    if (!profile) return;
    await new Promise(resolve => setTimeout(resolve, 1500));
    setProfile({ ...profile, is_premium: true });
    setShowPremiumModal(false);
    alert(`[TEST MODE] Purchases Restored!`);
    if (supabase) await supabase.from('profiles').update({ is_premium: true }).eq('id', profile.id);
  };

  const toggleSave = async (content: string, type: 'tease' | 'smooth' | 'chaotic' | 'bio') => {
    if (!profile) return;
    const exists = savedItems.find(item => item.content === content);
    if (exists) {
      if (supabase) await supabase.from('saved_items').delete().eq('id', exists.id);
      setSavedItems(savedItems.filter(item => item.id !== exists.id));
    } else {
      const newItem: SavedItem = { id: crypto.randomUUID(), user_id: profile.id, content, type, created_at: new Date().toISOString() };
      if (supabase) {
        const { data } = await supabase.from('saved_items').insert([{ user_id: profile.id, content, type }]).select().single();
        if (data) newItem.id = data.id;
      }
      setSavedItems([newItem, ...savedItems]);
    }
  };

  const handleDeleteSaved = async (id: string) => {
    if (supabase) await supabase.from('saved_items').delete().eq('id', id);
    setSavedItems(savedItems.filter(item => item.id !== id));
  };

  const handleShare = async (content: string) => {
    await shareNative(content);
  };

  const handleImageSelect = async () => {
    if (isNative()) {
      const nativeImage = await selectImageNative();
      if (nativeImage) setImage(nativeImage);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleGenerate = async () => {
    if (!profile) return;
    if (mode === InputMode.CHAT && !inputText.trim() && !image) {
      setInputError("Give me some context!");
      return;
    }
    if (mode === InputMode.BIO && !inputText.trim()) {
      setInputError("Tell me about yourself!");
      return;
    }
    setInputError(null);
    const cost = (mode === InputMode.CHAT && image) ? 2 : 1;
    if (!profile.is_premium && profile.credits < cost) {
      setShowPremiumModal(true);
      return;
    }
    setLoading(true);
    try {
      if (!profile.is_premium) updateCredits(profile.credits - cost);
      const res = mode === InputMode.CHAT ? await generateRizz(inputText, image || undefined) : await generateBio(inputText);
      setResult(res);
    } catch (error) {
      console.error(error);
      alert('The wingman tripped!');
      if (!profile.is_premium) updateCredits(profile.credits);
    } finally {
      setLoading(false);
    }
  };

  const handleWatchAd = async () => {
    if (isMusicPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsMusicPlaying(false);
    }
    setShowPremiumModal(false);

    if (isNative()) {
      setLoading(true);
      const reward = await showRewardedAdNative();
      setLoading(false);
      if (reward) {
         updateCredits((profile?.credits || 0) + REWARD_CREDITS);
         alert(`+${REWARD_CREDITS} Credits Added!`);
      }
      if (!isUserMuted && audioRef.current) safePlay();
      return;
    }

    setIsAdPlaying(true);
    setAdTimer(AD_DURATION); 
    const interval = setInterval(() => {
      setAdTimer((prev) => {
        if (prev <= 1) { clearInterval(interval); return 0; }
        return prev - 1;
      });
    }, 1000);
    setTimeout(() => {
      setIsAdPlaying(false);
      updateCredits((profile?.credits || 0) + REWARD_CREDITS);
      alert(`+${REWARD_CREDITS} Credits Added!`);
      if (!isUserMuted && audioRef.current) safePlay();
    }, AD_DURATION * 1000);
  };

  const isSaved = (content: string) => savedItems.some(item => item.content === content);
  const clear = () => { setInputText(''); setImage(null); setResult(null); setInputError(null); };

  if (showSplash) return <SplashScreen />;
  if (isSessionBlocked) return <div className="text-white text-center p-10">Session Paused</div>;
  if (!session) return <LoginPage />;
  if (!profile) return <div className="text-white text-center p-10">Loading...</div>;

  if (fullScreenPage) {
    return <InfoPages page={fullScreenPage} onBack={() => setFullScreenPage(null)} />;
  }

  return (
    <div className="mx-auto w-full h-[100dvh] bg-black text-white relative flex flex-col">
      <audio ref={audioRef} loop>
        <source src="https://cdn.pixabay.com/audio/2022/03/24/audio_078f45a709.mp3" type="audio/mp3" />
      </audio>

      {showPremiumModal && <PremiumModal onClose={() => setShowPremiumModal(false)} onUpgrade={handleUpgrade} onRestore={handleRestorePurchases} />}

      {isAdPlaying && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center">
             <div className="text-4xl font-black text-rose-500 mb-4">{adTimer}s</div>
             <p className="text-white/60">Watching Ad...</p>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto px-4 pt-[env(safe-area-inset-top)] pb-0 relative">
          
          {/* HOME TAB */}
          <div className={activeTab === 'HOME' ? 'block pb-24' : 'hidden'}>
              {/* Compact Header */}
              <header className="flex justify-between items-center py-4 mb-2">
                 <h1 className="text-2xl font-black tracking-tighter bg-gradient-to-r from-violet-400 to-rose-400 bg-clip-text text-transparent">Rizz Master</h1>
                 {!profile.is_premium && (
                     <button onClick={() => setShowPremiumModal(true)} className="px-3 py-1 bg-gradient-to-r from-yellow-600 to-amber-500 rounded-full text-[10px] font-bold text-black flex items-center gap-1">
                        <span>👑</span> Upgrade
                     </button>
                 )}
              </header>

              {/* Mode Switcher */}
              <div className="flex p-1 bg-white/5 rounded-2xl mb-6 relative border border-white/10">
                <button onClick={() => { setMode(InputMode.CHAT); clear(); }} className={`flex-1 py-2 rounded-xl font-bold text-xs transition-all z-10 ${mode === InputMode.CHAT ? 'text-white' : 'text-white/50'}`}>Chat</button>
                <button onClick={() => { setMode(InputMode.BIO); clear(); }} className={`flex-1 py-2 rounded-xl font-bold text-xs transition-all z-10 ${mode === InputMode.BIO ? 'text-white' : 'text-white/50'}`}>Bio</button>
                <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl rizz-gradient transition-all duration-300 ${mode === InputMode.CHAT ? 'left-1' : 'left-[calc(50%+4px)]'}`} />
              </div>

              {/* Input */}
              <div className="space-y-4">
                  <textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder={mode === InputMode.CHAT ? "Paste the chat..." : "Describe yourself..."}
                    className="w-full h-32 bg-white/5 border border-white/10 rounded-2xl p-4 text-sm focus:ring-1 focus:ring-rose-500/50 focus:outline-none resize-none transition-all placeholder:text-white/20"
                    style={{ fontSize: '16px' }}
                  />
                  
                  {mode === InputMode.CHAT && (
                     <div onClick={handleImageSelect} className={`border border-dashed border-white/10 rounded-2xl transition-all cursor-pointer bg-white/[0.02] ${image ? 'p-2' : 'p-4'}`}>
                        {image ? (
                          <div className="relative"><img src={image} className="w-full max-h-32 object-contain rounded-lg" /><button onClick={(e) => { e.stopPropagation(); setImage(null); }} className="absolute top-1 right-1 bg-black/80 rounded-full w-6 h-6 flex items-center justify-center text-xs">✕</button></div>
                        ) : (
                          <div className="flex items-center justify-center gap-2 opacity-50"><span className="text-xl">📸</span><span className="text-xs font-bold">Add Screenshot</span></div>
                        )}
                        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleImageUpload} />
                     </div>
                  )}

                  {inputError && <p className="text-red-400 text-xs text-center font-bold animate-pulse">{inputError}</p>}

                  <button
                    onClick={handleGenerate}
                    disabled={loading}
                    className={`w-full py-4 rounded-2xl font-black text-sm shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 ${profile.is_premium ? "bg-gradient-to-r from-yellow-500 to-amber-600 text-black" : "rizz-gradient text-white"}`}
                  >
                    {loading ? "COOKING..." : (profile.is_premium ? "GENERATE (VIP)" : `GENERATE (${(mode === InputMode.CHAT && image) ? 2 : 1} ⚡)`)}
                  </button>
              </div>

              {/* Results */}
              <div className="mt-8 space-y-4">
                  {result && 'tease' in result && (
                      <div className="animate-fade-in-up">
                          <div className="flex items-center justify-between mb-4 px-1">
                              <span className="text-xs font-bold text-white/40 uppercase">Rizz Report</span>
                              <span className="text-xl font-black text-rose-500">{result.loveScore}%</span>
                          </div>
                          <div className="grid gap-3">
                              <RizzCard label="Tease" content={result.tease} icon="😏" color="from-purple-500 to-indigo-500" isSaved={isSaved(result.tease)} onSave={() => toggleSave(result.tease, 'tease')} onShare={() => handleShare(result.tease)} delay={0} />
                              <RizzCard label="Smooth" content={result.smooth} icon="🪄" color="from-blue-500 to-cyan-500" isSaved={isSaved(result.smooth)} onSave={() => toggleSave(result.smooth, 'smooth')} onShare={() => handleShare(result.smooth)} delay={0.1} />
                              <RizzCard label="Chaotic" content={result.chaotic} icon="🤡" color="from-orange-500 to-red-500" isSaved={isSaved(result.chaotic)} onSave={() => toggleSave(result.chaotic, 'chaotic')} onShare={() => handleShare(result.chaotic)} delay={0.2} />
                          </div>
                      </div>
                  )}
                  {result && 'bio' in result && (
                      <div className="glass p-6 rounded-3xl border border-white/10 animate-fade-in-up">
                          <p className="text-lg font-medium leading-relaxed mb-4">"{result.bio}"</p>
                          <div className="flex gap-2">
                             <button onClick={() => { copyToClipboard(result.bio); alert('Copied'); }} className="flex-1 py-3 bg-white/10 rounded-xl font-bold text-xs">Copy</button>
                             <button onClick={() => toggleSave(result.bio, 'bio')} className={`px-4 rounded-xl font-bold text-xl bg-white/10 ${isSaved(result.bio) ? 'text-rose-500' : 'text-white/50'}`}>♥</button>
                          </div>
                      </div>
                  )}
              </div>
          </div>

          {/* SAVED TAB */}
          {activeTab === 'SAVED' && (
             <SavedView 
                isOpen={true} 
                onClose={() => setActiveTab('HOME')} 
                savedItems={savedItems} 
                onDelete={handleDeleteSaved} 
                onShare={handleShare} 
             />
          )}

          {/* PROFILE TAB */}
          {activeTab === 'PROFILE' && (
             <ProfileView 
                profile={profile} 
                onLogout={handleLogout} 
                onUpgrade={() => setShowPremiumModal(true)} 
                onWatchAd={handleWatchAd} 
                onNavigate={setFullScreenPage} 
                isMusicPlaying={isMusicPlaying}
                onToggleMusic={toggleMusic}
             />
          )}

      </main>

      <BottomNav currentView={activeTab} onChange={setActiveTab} />
    </div>
  );
};

export default App;