import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';
import LegalModals from './LegalModals';

interface LoginPageProps {
  onGuestLogin: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onGuestLogin }) => {
  const [isEmailMode, setIsEmailMode] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  
  // State for Legal Modals
  const [activeLegalModal, setActiveLegalModal] = useState<'privacy' | 'terms' | null>(null);

  const handleGoogleLogin = async () => {
    if (!supabase) {
        alert("Supabase not configured. Using Guest Mode.");
        onGuestLogin();
        return;
    }
    
    // Robust check for Hybrid/Native/WebView environments
    const userAgent = navigator.userAgent;
    const isCapacitor = !!(window as any).Capacitor;
    const isLocalProtocol = window.location.protocol !== 'http:' && window.location.protocol !== 'https:';

    // Better WebView detection logic:
    // 1. iOS: Check if it's an iOS device AND (it is NOT Safari OR it contains specific app tokens like FBAV, Instagram, etc)
    //    Standard Safari always includes "Safari". WebViews often include "AppleWebKit" but omit "Safari" (though some wrappers add it).
    //    We check for common embedded app strings just in case.
    const isIOS = /iPad|iPhone|iPod/.test(userAgent) && !(window as any).MSStream;
    const isSafari = /Safari/.test(userAgent);
    const isIOSWebView = isIOS && (!isSafari || /FBAV|Instagram|Line|Snapchat/i.test(userAgent)); 

    // 2. Android: Check for "wv" token or typical "Version/X.X ... Chrome/..." pattern without being standard Chrome.
    //    Standard Chrome: "Chrome/100.0..."
    //    WebView: "Version/4.0 Chrome/100.0..."
    const isAndroidWebView = /wv/.test(userAgent) || (/Android/.test(userAgent) && /Version\/[\d\.]+/.test(userAgent) && /Chrome\//.test(userAgent));

    const isHybrid = isCapacitor || isLocalProtocol || isIOSWebView || isAndroidWebView;

    if (isHybrid) {
        // --- HYBRID / EMBEDDED ENVIRONMENT FIX ---
        // Google blocks OAuth in embedded WebViews (403 disallowed_useragent).
        // Solution: Generate the OAuth URL and open it in the System Browser.
        
        try {
            // Determine redirect URL:
            // 1. If VITE_AUTH_REDIRECT_URL is set, use it.
            // 2. If running on localhost/file, try a known production URL or deep link scheme.
            // 3. Fallback to current origin (might not work well if origin is file://)
            const envRedirect = (import.meta as any).env?.VITE_AUTH_REDIRECT_URL;
            const fallbackRedirect = 'https://rizzmaster.vercel.app'; // Fallback for native apps without deep links
            
            const redirectUrl = envRedirect || (isLocalProtocol ? fallbackRedirect : window.location.origin);

            const { data, error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: {
                    redirectTo: redirectUrl,
                    skipBrowserRedirect: true, // Do not auto-navigate the WebView
                    queryParams: {
                        access_type: 'offline',
                        prompt: 'consent',
                    }
                }
            });

            if (error) throw error;

            if (data?.url) {
                // Try to open in system browser
                // '_system' works for Capacitor/Cordova to break out of WebView
                const target = isCapacitor ? '_system' : '_blank';
                const opened = window.open(data.url, target);
                
                if (!opened) {
                    // Fallback if popup blocker catches it
                    window.location.href = data.url; 
                } else {
                     // Note: If using a wrapper without deep linking, the user will be logged in 
                     // on the browser, not the app. This is a limitation of simple wrappers.
                     console.log("Opened Google Auth in system browser/popup");
                }
            }
        } catch (err: any) {
            console.error("Google Hybrid Login Error:", err);
            alert(`Login failed: ${err.message || err}`);
        }
        return;
    }
    
    // --- STANDARD WEB ENVIRONMENT ---
    const redirectUrl = (import.meta as any).env?.VITE_AUTH_REDIRECT_URL || window.location.origin;
    
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectUrl,
        queryParams: {
            access_type: 'offline',
            prompt: 'consent',
        }
      }
    });

    if (error) {
        console.error("Google Login Error:", error);
        const errorMessage = error.message || (error as any).msg || JSON.stringify(error);
        alert(`Login failed: ${errorMessage}`);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
        alert("Supabase not configured. Using Guest Mode.");
        onGuestLogin();
        return;
    }

    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignUp) {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
        });
        if (signUpError) throw signUpError;
        setMessage("Success! Check your email to confirm sign up.");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (signInError) throw signInError;
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-black overflow-hidden relative">
      
      {/* Legal Modals Overlay */}
      {activeLegalModal && (
        <LegalModals 
          type={activeLegalModal} 
          onClose={() => setActiveLegalModal(null)} 
        />
      )}

      {/* Background Decor for Mobile/Overlay */}
      <div className="absolute top-0 left-0 w-full h-full md:hidden z-0">
          <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-rose-600/20 rounded-full blur-[120px]" />
          <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-pink-600/20 rounded-full blur-[120px]" />
      </div>

      {/* Left Panel: Branding (Desktop) */}
      <div className="hidden md:flex w-1/2 relative items-center justify-center p-12 overflow-hidden bg-[#0a0a0a]">
          {/* Ambient Effects */}
          <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-rose-500/10 rounded-full blur-[100px] animate-pulse-glow" />
          <div className="absolute bottom-1/4 right-1/4 w-[300px] h-[300px] bg-amber-500/10 rounded-full blur-[80px] animate-float" />
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-50 contrast-150"></div>
          
          <div className="relative z-10 text-center">
             <div className="mb-6 inline-block">
                <h1 className="text-7xl font-black tracking-tighter bg-gradient-to-r from-rose-400 via-amber-200 to-rose-400 bg-clip-text text-transparent pb-2 animate-text-shimmer drop-shadow-2xl">
                    Rizz Master
                </h1>
             </div>
             <p className="text-white/60 text-xl font-light tracking-wide max-w-sm mx-auto leading-relaxed mb-10">
                AI-Powered Dating Assistant
             </p>

             <div className="grid gap-4 text-left max-w-sm mx-auto">
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm hover:bg-white/10 transition-colors group">
                   <div className="w-12 h-12 rounded-full bg-rose-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">🚀</div>
                   <div>
                      <h3 className="font-bold text-white text-base">Instant Replies</h3>
                      <p className="text-white/40 text-xs">Generate witty responses in seconds</p>
                   </div>
                </div>
                <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm hover:bg-white/10 transition-colors group">
                   <div className="w-12 h-12 rounded-full bg-amber-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">📸</div>
                   <div>
                      <h3 className="font-bold text-white text-base">Screenshot Analysis</h3>
                      <p className="text-white/40 text-xs">Upload chats, get context-aware rizz</p>
                   </div>
                </div>
                 <div className="flex items-center gap-4 p-4 rounded-2xl bg-white/5 border border-white/5 backdrop-blur-sm hover:bg-white/10 transition-colors group">
                   <div className="w-12 h-12 rounded-full bg-purple-500/20 flex items-center justify-center text-2xl group-hover:scale-110 transition-transform">📝</div>
                   <div>
                      <h3 className="font-bold text-white text-base">Profile Bios</h3>
                      <p className="text-white/40 text-xs">Stand out with custom bio generation</p>
                   </div>
                </div>
             </div>
          </div>
      </div>

      {/* Right Panel: Login Form */}
      <div className="w-full md:w-1/2 flex items-center justify-center p-6 md:p-12 relative z-10">
        <div className="w-full max-w-md animate-fade-in-up">
            {/* Mobile Logo Only */}
            <div className="md:hidden text-center mb-10">
                <h1 className="text-5xl font-black tracking-tighter bg-gradient-to-r from-rose-400 via-amber-200 to-rose-400 bg-clip-text text-transparent pb-2 animate-text-shimmer">
                    Rizz Master
                </h1>
                <p className="text-white/60 text-sm">AI-Powered Dating Assistant</p>
            </div>

            <div className="glass md:bg-transparent md:backdrop-filter-none p-8 md:p-0 rounded-3xl md:rounded-none border border-white/10 md:border-none shadow-2xl md:shadow-none">
                <h2 className="text-2xl md:text-3xl font-bold text-white mb-2 md:mb-3">
                    {isSignUp ? 'Create Account' : 'Welcome Back'}
                </h2>
                <p className="text-white/40 text-sm mb-8">
                    {isSignUp ? 'Join Rizz Master today.' : 'Sign in to continue.'}
                </p>

                {isEmailMode ? (
                <form onSubmit={handleEmailAuth} className="space-y-5 text-left animate-fade-in">
                    <button 
                        type="button" 
                        onClick={() => { setIsEmailMode(false); setError(null); setMessage(null); }}
                        className="text-white/50 hover:text-white text-xs uppercase tracking-widest flex items-center gap-2 transition-colors mb-2"
                    >
                        <span>←</span> Back to methods
                    </button>
                    
                    {error && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-200 text-sm">
                        {error}
                    </div>
                    )}
                    
                    {message && (
                    <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-lg text-green-200 text-sm">
                        {message}
                    </div>
                    )}

                    <div className="space-y-1">
                    <label className="block text-xs font-bold text-white/50 uppercase tracking-widest ml-1">Email</label>
                    <input 
                        type="email" 
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full bg-white/5 border-b border-white/20 focus:border-rose-500 rounded-t-lg px-4 py-3 text-white focus:outline-none focus:bg-white/10 transition-all placeholder:text-white/20"
                        placeholder="you@example.com"
                    />
                    </div>
                    
                    <div className="space-y-1">
                    <label className="block text-xs font-bold text-white/50 uppercase tracking-widest ml-1">Password</label>
                    <input 
                        type="password" 
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-white/5 border-b border-white/20 focus:border-rose-500 rounded-t-lg px-4 py-3 text-white focus:outline-none focus:bg-white/10 transition-all placeholder:text-white/20"
                        placeholder="••••••••"
                        minLength={6}
                    />
                    </div>

                    <button 
                        type="submit"
                        disabled={loading}
                        className="w-full py-4 bg-white text-black rounded-xl font-bold hover:bg-gray-200 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                    >
                        {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
                    </button>

                    <div className="text-center mt-6">
                    <button 
                        type="button"
                        onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
                        className="text-xs text-white/40 hover:text-white transition-colors"
                    >
                        {isSignUp ? "Already have an account? " : "Don't have an account? "} 
                        <span className="text-white font-semibold underline decoration-white/30 underline-offset-4">
                            {isSignUp ? "Sign In" : "Sign Up"}
                        </span>
                    </button>
                    </div>
                </form>
                ) : (
                <div className="space-y-4">
                    <button 
                        onClick={handleGoogleLogin}
                        className="w-full py-4 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-gray-100 transition-all active:scale-[0.98] group"
                    >
                        <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="G" className="w-5 h-5 group-hover:scale-110 transition-transform" />
                        Continue with Google
                    </button>
                    
                    <button 
                        onClick={() => setIsEmailMode(true)}
                        className="w-full py-4 bg-transparent border border-white/10 text-white rounded-xl font-bold hover:bg-white/5 transition-all active:scale-[0.98] flex items-center justify-center gap-3"
                    >
                        <svg className="w-5 h-5 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                        Sign in with Email
                    </button>
                    
                    <div className="flex items-center gap-4 py-4 opacity-50">
                        <div className="h-px bg-white/20 flex-1"></div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-white/50">Or</span>
                        <div className="h-px bg-white/20 flex-1"></div>
                    </div>

                    <button 
                        onClick={onGuestLogin}
                        className="w-full py-4 bg-white/5 text-white/60 rounded-xl font-medium text-sm hover:bg-white/10 hover:text-white transition-all active:scale-[0.98]"
                    >
                        Continue as Guest
                    </button>
                </div>
                )}

                <div className="mt-8 pt-6 border-t border-white/5 text-center">
                    <p className="text-[10px] text-white/20 leading-relaxed max-w-xs mx-auto">
                        By entering the Rizz Master terminal, you agree to our{' '}
                        <button 
                          onClick={() => setActiveLegalModal('terms')} 
                          className="text-white/40 hover:text-white underline decoration-white/10 hover:decoration-white/50 transition-all"
                        >
                          Terms of Service
                        </button>
                        {' & '}
                        <button 
                          onClick={() => setActiveLegalModal('privacy')}
                          className="text-white/40 hover:text-white underline decoration-white/10 hover:decoration-white/50 transition-all"
                        >
                          Privacy Policy
                        </button>.
                    </p>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;