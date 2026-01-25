import React, { useState, useRef, useEffect } from 'react';
import { generateRizz, generateBio } from './services/rizzService';
import { InputMode, RizzResponse, BioResponse, SavedItem, UserProfile } from './types';
import { supabase } from './services/supabaseClient';
import RizzCard from './components/RizzCard';
import LoginPage from './components/LoginPage';
import Footer from './components/Footer';
import PremiumModal from './components/PremiumModal';
import SavedModal from './components/SavedModal';
import AdSenseBanner from './components/AdSenseBanner';

const DAILY_CREDITS = 5;
const REWARD_CREDITS = 5;
const AD_DURATION = 30;

// TODO: Replace with actual Ad Unit ID
const GOOGLE_AD_SLOT_ID = "1234567890"; 

const App: React.FC = () => {
  // Auth State
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  // App State
  const [mode, setMode] = useState<InputMode>(InputMode.CHAT);
  const [inputText, setInputText] = useState('');
  const [image, setImage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<RizzResponse | BioResponse | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modals & Flags
  const [isAdPlaying, setIsAdPlaying] = useState(false);
  const [adTimer, setAdTimer] = useState(0);
  const [showPremiumModal, setShowPremiumModal] = useState(false);
  const [showSavedModal, setShowSavedModal] = useState(false);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [isSessionBlocked, setIsSessionBlocked] = useState(false);

  // 1. Session & Auth Listener
  useEffect(() => {
    // If supabase is null (keys not set), skip listener
    if (!supabase) return;

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) loadUserData(session.user.id);
    });

    // Listen for changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) {
        loadUserData(session.user.id);
      } else {
        setProfile(null);
        setSavedItems([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // 2. Broadcast Channel for Single Tab
  useEffect(() => {
    const channel = new BroadcastChannel('rizz_session_sync');
    channel.postMessage({ type: 'NEW_SESSION_STARTED' });
    channel.onmessage = (event) => {
      if (event.data.type === 'NEW_SESSION_STARTED') {
        setIsSessionBlocked(true);
      }
    };
    return () => channel.close();
  }, []);

  // 3. Load User Data
  const loadUserData = async (userId: string) => {
    // Guest Mode Handler or if supabase not configured
    if (!supabase) {
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

    // Fetch Profile
    let { data: profileData, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Profile doesn't exist, create it
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert([{ id: userId, email: session?.user.email }])
          .select()
          .single();
        
        if (!createError) {
           profileData = newProfile;
        } else {
           console.error("Error creating profile:", createError);
        }
      } else {
        console.error("Error loading profile:", error);
      }
    } else if (profileData) {
      // Check for daily reset
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
    
    // If we have profile data, set it, otherwise we stay in error state
    if (profileData) {
        setProfile(profileData as UserProfile);

        // Fetch Saved Items
        const { data: savedData, error: savedError } = await supabase
        .from('saved_items')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
        
        if (!savedError && savedData) setSavedItems(savedData as SavedItem[]);
    }
  };

  const handleLogout = async () => {
    if (supabase) await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setResult(null);
    setInputText('');
    setImage(null);
    setInputError(null);
  };

  const handleGuestLogin = () => {
      const guestUser = { id: 'guest', email: 'guest@rizzmaster.ai' };
      setSession({ user: guestUser });
      loadUserData(guestUser.id);
  };

  // 4. Action Handlers
  const updateCredits = async (newAmount: number) => {
    if (!profile) return;
    
    // Optimistic UI update
    const updatedProfile = { ...profile, credits: newAmount };
    setProfile(updatedProfile);

    if (supabase && profile.id !== 'guest') {
        await supabase
        .from('profiles')
        .update({ credits: newAmount })
        .eq('id', profile.id);
    } else {
        localStorage.setItem('guest_profile', JSON.stringify(updatedProfile));
    }
  };

  const handleUpgrade = async () => {
    if (!profile) return;
    
    const updatedProfile = { ...profile, is_premium: true };
    setProfile(updatedProfile);
    setShowPremiumModal(false);
    alert('Welcome to the Elite Club! 👑');

    if (supabase && profile.id !== 'guest') {
        await supabase
        .from('profiles')
        .update({ is_premium: true })
        .eq('id', profile.id);
    } else {
        localStorage.setItem('guest_profile', JSON.stringify(updatedProfile));
    }
  };

  const toggleSave = async (content: string, type: 'tease' | 'smooth' | 'chaotic' | 'bio') => {
    if (!profile) return;

    const exists = savedItems.find(item => item.content === content);
    
    if (exists) {
      // Delete
      if (supabase && profile.id !== 'guest') {
          await supabase.from('saved_items').delete().eq('id', exists.id);
      }
      const newItems = savedItems.filter(item => item.id !== exists.id);
      setSavedItems(newItems);
      if (!supabase || profile.id === 'guest') localStorage.setItem('guest_saved_items', JSON.stringify(newItems));

    } else {
      // Insert
      const newItem: SavedItem = {
          id: crypto.randomUUID(),
          user_id: profile.id,
          content,
          type,
          created_at: new Date().toISOString()
      };

      if (supabase && profile.id !== 'guest') {
        const { data } = await supabase
            .from('saved_items')
            .insert([{ user_id: profile.id, content, type }])
            .select()
            .single();
        if (data) newItem.id = data.id;
      }
      
      const newItems = [newItem, ...savedItems];
      setSavedItems(newItems);
      if (!supabase || profile.id === 'guest') localStorage.setItem('guest_saved_items', JSON.stringify(newItems));
    }
  };

  const handleDeleteSaved = async (id: string) => {
    if (supabase && profile?.id !== 'guest') {
        await supabase.from('saved_items').delete().eq('id', id);
    }
    const newItems = savedItems.filter(item => item.id !== id);
    setSavedItems(newItems);
    if (!supabase || profile?.id === 'guest') localStorage.setItem('guest_saved_items', JSON.stringify(newItems));
  };

  // --- Logic Helpers ---

  const handleReclaimSession = () => {
    setIsSessionBlocked(false);
    const channel = new BroadcastChannel('rizz_session_sync');
    channel.postMessage({ type: 'NEW_SESSION_STARTED' });
    channel.close();
  };

  const handleShare = async (content: string) => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'Rizz Master Reply',
          text: content,
          url: window.location.href
        });
      } catch (err) { console.log('Share canceled'); }
    } else {
      navigator.clipboard.writeText(content);
      alert('Link copied to clipboard!');
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setImage(reader.result as string);
      reader.readAsDataURL(file);
      if (inputError) setInputError(null);
    }
  };

  const handleGenerate = async () => {
    if (!profile) return;
    
    // Input Validation
    if (mode === InputMode.CHAT && !inputText.trim() && !image) {
      setInputError("Give me some context! Paste the chat or upload a screenshot.");
      return;
    }
    if (mode === InputMode.BIO && !inputText.trim()) {
      setInputError("I can't write a bio for a ghost! Tell me about your hobbies, job, or vibes.");
      return;
    }
    setInputError(null);

    const hasCredits = profile.credits > 0;
    if (!profile.is_premium && !hasCredits) {
      setShowPremiumModal(true);
      return;
    }

    setLoading(true);
    try {
      // Deduct Credit only if not premium
      if (!profile.is_premium) {
        updateCredits(profile.credits - 1);
      }

      if (mode === InputMode.CHAT) {
        const res = await generateRizz(inputText, image || undefined);
        setResult(res);
      } else {
        const res = await generateBio(inputText);
        setResult(res);
      }
    } catch (error) {
      console.error(error);
      alert('The wingman tripped! Check API Keys or try again.');
      // Refund if failed
      if (!profile.is_premium) updateCredits(profile.credits + 1);
    } finally {
      setLoading(false);
    }
  };

  const handleWatchAd = () => {
    setShowPremiumModal(false);
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
      updateCredits((profile?.credits || 0) + REWARD_CREDITS);
      alert(`+${REWARD_CREDITS} Credits Added!`);
    }, AD_DURATION * 1000);
  };

  const isSaved = (content: string) => savedItems.some(item => item.content === content);
  const clear = () => { setInputText(''); setImage(null); setResult(null); setInputError(null); };

  // --- Rendering ---

  if (isSessionBlocked) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center p-4 relative overflow-hidden bg-black">
         <div className="glass max-w-md w-full p-8 rounded-3xl border border-white/10 text-center relative z-10 shadow-2xl">
           <div className="text-5xl mb-6">✋</div>
           <h1 className="text-2xl font-bold mb-4 text-white">Session Paused</h1>
           <p className="text-white/60 mb-8 leading-relaxed">
             Rizz Master is open in another tab.
           </p>
           <button onClick={handleReclaimSession} className="w-full rizz-gradient py-3.5 rounded-xl font-bold text-white hover:opacity-90 transition-opacity">
             Use Here Instead
           </button>
         </div>
         <Footer className="fixed bottom-0 w-full z-10" />
      </div>
    );
  }

  // Not Logged In
  if (!session) {
    return <LoginPage onGuestLogin={handleGuestLogin} />;
  }

  // Loading Profile
  if (!profile) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white p-4 bg-black">
        <svg className="animate-spin h-8 w-8 text-pink-500 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        <p className="text-white/50 animate-pulse">Loading Profile...</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 md:py-12 pb-24 relative min-h-[100dvh] flex flex-col">
      
      {showPremiumModal && (
        <PremiumModal 
          onClose={() => setShowPremiumModal(false)}
          onUpgrade={handleUpgrade}
        />
      )}

      <SavedModal 
        isOpen={showSavedModal} 
        onClose={() => setShowSavedModal(false)}
        savedItems={savedItems}
        onDelete={handleDeleteSaved}
        onShare={handleShare}
      />

      {isAdPlaying && (
        <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center p-8">
          <div className="w-full max-w-md bg-zinc-900 rounded-3xl p-8 text-center border border-white/10 relative overflow-hidden flex flex-col h-[80vh] justify-center">
             <div className="absolute top-0 left-0 w-full h-1 bg-white/20">
               <div 
                 className="h-full bg-pink-500 transition-all ease-linear w-full" 
                 style={{ width: '0%', transitionDuration: `${AD_DURATION}s` }}
               ></div>
             </div>
             <div className="text-4xl font-black text-pink-500 mb-4">{adTimer}s</div>
             <p className="text-white/60 mb-4">Support us by viewing this ad to earn free credits!</p>
             
             {/* Actual Ad Slot inside the wait modal */}
             <div className="bg-white/5 rounded-xl border border-white/10 min-h-[250px] flex items-center justify-center">
                 <AdSenseBanner dataAdSlot={GOOGLE_AD_SLOT_ID} />
             </div>

             <p className="mt-8 text-xs text-white/30 uppercase">Do not close window</p>
          </div>
        </div>
      )}

      <nav className="flex justify-between items-center mb-8 md:mb-12">
        <button 
             onClick={handleLogout} 
             className="px-3 py-1.5 text-xs md:text-sm text-white/40 hover:text-white hover:bg-white/5 rounded-lg transition-all uppercase tracking-widest font-medium border border-transparent hover:border-white/10 flex items-center gap-1"
        >
             <span className="text-lg">←</span> <span className="hidden md:inline">Logout</span>
        </button>

        <div className="flex items-center gap-2 md:gap-3">
           <button 
              onClick={() => setShowSavedModal(true)}
              className="p-2 md:px-4 md:py-2 bg-white/5 hover:bg-white/10 rounded-full flex items-center gap-1.5 transition-all border border-white/5"
           >
              <span className="text-pink-500 text-base md:text-lg">♥</span>
              <span className="hidden md:inline text-xs font-bold text-white">Saved</span>
           </button>

           {!profile.is_premium && (
             <button 
                onClick={() => setShowPremiumModal(true)}
                className="hidden md:flex px-4 py-2 bg-gradient-to-r from-yellow-600 to-yellow-400 text-black text-xs font-bold rounded-full items-center gap-1 hover:brightness-110 transition-all"
             >
                <span>👑</span> Go Premium
             </button>
           )}

           <div className={`flex items-center gap-2 px-3 py-1.5 md:px-4 md:py-2 rounded-full border backdrop-blur-md ${profile.is_premium ? 'bg-yellow-500/10 border-yellow-500/30' : 'bg-white/5 border-white/10'}`}>
              <span className={profile.is_premium ? "text-yellow-400 text-lg" : "text-yellow-400 text-lg"}>
                {profile.is_premium ? '👑' : '⚡'}
              </span>
              <span className={`font-bold text-xs md:text-sm ${profile.is_premium ? 'text-yellow-400' : 'text-white'}`}>
                {profile.is_premium ? 'Unlimited' : `${profile.credits} Credits`}
              </span>
           </div>
        </div>
      </nav>

      {/* Hero Header */}
      <header className="text-center mb-8 md:mb-12">
        <div className="inline-block relative">
           <h1 className="text-4xl md:text-7xl font-extrabold mb-2 md:mb-4 tracking-tighter rizz-gradient bg-clip-text text-transparent leading-tight">
            RIZZ MASTER
          </h1>
          {profile.is_premium && (
            <div className="absolute -top-2 -right-4 md:-right-8 rotate-12 bg-yellow-500 text-black font-bold text-[10px] md:text-xs px-2 py-1 rounded shadow-lg">PRO</div>
          )}
        </div>
        <p className="text-white/60 text-sm md:text-xl font-light max-w-md mx-auto leading-relaxed">
          Your world-class wingman for the digital age.
        </p>
      </header>

      {/* Mode Switcher */}
      <div className="flex p-1 bg-white/5 rounded-full mb-8 relative border border-white/10 max-w-md mx-auto w-full">
        <button onClick={() => { setMode(InputMode.CHAT); clear(); }} className={`flex-1 py-3 rounded-full font-medium text-sm md:text-base transition-all duration-300 relative z-10 ${mode === InputMode.CHAT ? 'text-white shadow-lg' : 'text-white/50 hover:text-white/80'}`}>Chat Reply</button>
        <button onClick={() => { setMode(InputMode.BIO); clear(); }} className={`flex-1 py-3 rounded-full font-medium text-sm md:text-base transition-all duration-300 relative z-10 ${mode === InputMode.BIO ? 'text-white shadow-lg' : 'text-white/50 hover:text-white/80'}`}>Profile Bio</button>
        <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-full rizz-gradient transition-all duration-300 ${mode === InputMode.CHAT ? 'left-1' : 'left-[calc(50%+4px)]'}`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 md:gap-8 items-start">
        {/* Input Section */}
        <section className="glass rounded-3xl p-5 md:p-6 border border-white/10 lg:sticky lg:top-8">
          <div className="mb-4 md:mb-6">
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
              onChange={(e) => {
                setInputText(e.target.value);
                if (inputError) setInputError(null);
              }}
              placeholder={mode === InputMode.CHAT ? "Paste the convo or describe the vibe..." : "e.g. Hiking, dogs, software engineer..."}
              className="w-full h-32 md:h-40 bg-black/40 border border-white/10 rounded-2xl p-4 text-sm md:text-base focus:ring-2 focus:ring-pink-500/50 focus:outline-none resize-none transition-all placeholder:text-white/20"
              style={{ fontSize: '16px' }}
            />
          </div>

          {mode === InputMode.CHAT && (
            <div className="mb-4 md:mb-6">
               <div 
                onClick={() => fileInputRef.current?.click()}
                className={`group border-2 border-dashed border-white/10 rounded-2xl transition-all cursor-pointer hover:border-pink-500/50 hover:bg-white/5 ${image ? 'p-2' : 'p-6 md:p-8'}`}
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
          
          {(profile.is_premium || profile.credits > 0) ? (
            <button
              onClick={handleGenerate}
              disabled={loading}
              className={`w-full py-3.5 md:py-4 rounded-2xl font-bold text-base md:text-lg shadow-xl hover:opacity-90 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed ${
                profile.is_premium 
                ? "bg-gradient-to-r from-yellow-500 to-amber-600 text-black" 
                : "rizz-gradient text-white"
              }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className={`animate-spin h-5 w-5 ${profile.is_premium ? 'text-black' : 'text-white'}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  {profile.is_premium ? "Generating Fast..." : "Cooking..."}
                </span>
              ) : (
                profile.is_premium ? "Generate Rizz (VIP)" : "Generate Rizz (1 ⚡)"
              )}
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-3">
             <button onClick={handleWatchAd} className="bg-white/10 border border-white/10 py-3.5 md:py-4 rounded-2xl font-bold text-sm md:text-base hover:bg-white/20 active:scale-[0.98] transition-all flex flex-col items-center justify-center">
              <span className="text-xl mb-1">📺</span> <span>Watch Ad (+5)</span>
            </button>
            <button onClick={() => setShowPremiumModal(true)} className="bg-gradient-to-r from-yellow-500 to-amber-600 text-black py-3.5 md:py-4 rounded-2xl font-bold text-sm md:text-base shadow-xl hover:brightness-110 active:scale-[0.98] transition-all flex flex-col items-center justify-center animate-pulse">
              <span className="text-xl mb-1">👑</span> <span>Go Unlimited</span>
            </button>
            </div>
          )}

          {!profile.is_premium && (
            <p className="text-center text-[10px] md:text-xs text-white/30 mt-3 md:mt-4">
              {profile.credits} daily credits remaining. <span className="text-yellow-500/80 cursor-pointer hover:underline" onClick={() => setShowPremiumModal(true)}>Upgrade.</span>
            </p>
          )}
        </section>

        {/* Output Section */}
        <section className="flex flex-col gap-4 md:gap-6 min-h-[300px]">
           {!result && !loading && (
            <div className="h-full flex flex-col items-center justify-center text-white/20 py-12 px-4 text-center border-2 border-dashed border-white/5 rounded-3xl bg-white/[0.02]">
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

              <div className="grid gap-3 md:gap-4 animate-fade-in-up" style={{ animationDelay: '0.1s' }}>
                <RizzCard label="The Tease" content={result.tease} icon="😏" color="from-purple-500 to-indigo-500" isSaved={isSaved(result.tease)} onSave={() => toggleSave(result.tease, 'tease')} onShare={() => handleShare(result.tease)} />
                <RizzCard label="The Smooth" content={result.smooth} icon="🪄" color="from-blue-500 to-cyan-500" isSaved={isSaved(result.smooth)} onSave={() => toggleSave(result.smooth, 'smooth')} onShare={() => handleShare(result.smooth)} />
                <RizzCard label="The Chaotic" content={result.chaotic} icon="🤡" color="from-orange-500 to-red-500" isSaved={isSaved(result.chaotic)} onSave={() => toggleSave(result.chaotic, 'chaotic')} onShare={() => handleShare(result.chaotic)} />
              </div>
            </>
          )}

          {result && 'bio' in result && (
            <div className="glass rounded-3xl p-6 md:p-8 border border-white/10 animate-fade-in-up">
               <div className="flex items-center gap-2 mb-4 md:mb-6">
                <span className="text-2xl">📝</span>
                <h3 className="text-xs md:text-sm font-semibold uppercase tracking-widest text-white/60">Bio Result</h3>
                <div className="ml-auto flex gap-2">
                    <button onClick={() => handleShare(result.bio)} className="p-2 rounded-full hover:bg-white/10 transition-all text-white/50 hover:text-white"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg></button>
                    <button onClick={() => toggleSave(result.bio, 'bio')} className={`p-2 rounded-full hover:bg-white/10 transition-all ${isSaved(result.bio) ? 'text-pink-500' : 'text-white/50 hover:text-pink-400'}`}><svg className="w-5 h-5" fill={isSaved(result.bio) ? "currentColor" : "none"} stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg></button>
                </div>
              </div>
              <p className="text-lg md:text-xl leading-relaxed font-medium mb-6 md:mb-8 text-white">{result.bio}</p>
              <div className="p-4 bg-white/5 rounded-2xl border border-white/5 mb-4"><h4 className="text-[10px] uppercase font-bold text-pink-400 mb-1">Why it works</h4><p className="text-xs md:text-sm text-white/60">{result.analysis}</p></div>
              <button onClick={() => { navigator.clipboard.writeText(result.bio); alert('Bio copied!'); }} className="w-full py-3 border border-white/20 rounded-xl hover:bg-white/5 transition-colors text-sm font-medium flex items-center justify-center gap-2"><span>📋</span> Copy Bio</button>
            </div>
          )}
        </section>
      </div>
      
      {/* Footer Ad Placement */}
      {!profile.is_premium && (
         <div className="mt-8 max-w-2xl mx-auto w-full">
            <AdSenseBanner dataAdSlot={GOOGLE_AD_SLOT_ID} />
         </div>
      )}

      <Footer className="mt-12 md:mt-20" />
    </div>
  );
};

export default App;