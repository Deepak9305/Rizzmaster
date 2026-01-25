import React, { useState } from 'react';
import { supabase } from '../services/supabaseClient';

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

  const handleGoogleLogin = async () => {
    if (!supabase) {
        alert("Supabase not configured. Using Guest Mode.");
        onGuestLogin();
        return;
    }
    await supabase.auth.signInWithOAuth({
      provider: 'google',
    });
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
    <div className="min-h-screen flex flex-col items-center justify-center p-4 relative overflow-hidden bg-black">
      {/* Ambient Background */}
      <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-purple-600/20 rounded-full blur-[120px]" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[500px] h-[500px] bg-pink-600/20 rounded-full blur-[120px]" />

      <div className="relative z-10 max-w-md w-full glass p-8 rounded-3xl border border-white/10 text-center shadow-2xl">
        <div className="mb-8">
            <div className="w-16 h-16 mx-auto mb-4 bg-gradient-to-br from-pink-500 to-purple-600 rounded-2xl flex items-center justify-center text-3xl shadow-lg shadow-pink-500/20">
                🔥
            </div>
            <h1 className="text-4xl font-bold mb-2 tracking-tight text-white">Rizz Master</h1>
            <p className="text-white/60 text-lg">Your AI Wingman</p>
        </div>

        {isEmailMode ? (
          <form onSubmit={handleEmailAuth} className="space-y-4 text-left animate-fade-in">
             <div className="flex items-center mb-2">
               <button 
                 type="button" 
                 onClick={() => { setIsEmailMode(false); setError(null); setMessage(null); }}
                 className="text-white/50 hover:text-white text-sm flex items-center gap-1 transition-colors"
               >
                 <span>←</span> Back
               </button>
             </div>
             
             {error && (
               <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-200 text-sm">
                 {error}
               </div>
             )}
             
             {message && (
               <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl text-green-200 text-sm">
                 {message}
               </div>
             )}

             <div>
               <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-1.5">Email</label>
               <input 
                 type="email" 
                 required
                 value={email}
                 onChange={(e) => setEmail(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all placeholder:text-white/20"
                 placeholder="you@example.com"
               />
             </div>
             
             <div>
               <label className="block text-xs font-bold text-white/50 uppercase tracking-widest mb-1.5">Password</label>
               <input 
                 type="password" 
                 required
                 value={password}
                 onChange={(e) => setPassword(e.target.value)}
                 className="w-full bg-white/5 border border-white/10 rounded-xl p-3 text-white focus:outline-none focus:ring-2 focus:ring-pink-500/50 transition-all placeholder:text-white/20"
                 placeholder="••••••••"
                 minLength={6}
               />
             </div>

             <button 
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-xl font-bold hover:brightness-110 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed mt-2 shadow-lg shadow-purple-500/20"
            >
                {loading ? 'Processing...' : (isSignUp ? 'Create Account' : 'Sign In')}
            </button>

            <div className="text-center mt-4">
              <button 
                type="button"
                onClick={() => { setIsSignUp(!isSignUp); setError(null); setMessage(null); }}
                className="text-xs text-white/40 hover:text-white transition-colors underline underline-offset-4"
              >
                {isSignUp ? "Already have an account? Sign In" : "Don't have an account? Sign Up"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-3">
            <button 
                onClick={handleGoogleLogin}
                className="w-full py-3.5 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-gray-100 transition-all active:scale-95"
            >
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="G" className="w-5 h-5" />
                Continue with Google
            </button>
            
            <button 
                onClick={() => setIsEmailMode(true)}
                className="w-full py-3.5 bg-white/5 border border-white/10 text-white rounded-xl font-bold hover:bg-white/10 transition-all active:scale-95 flex items-center justify-center gap-3"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                Sign in with Email
            </button>
            
            <div className="flex items-center gap-4 py-2">
                <div className="h-px bg-white/10 flex-1"></div>
                <span className="text-xs uppercase text-white/30">Or</span>
                <div className="h-px bg-white/10 flex-1"></div>
            </div>

            <button 
                onClick={onGuestLogin}
                className="w-full py-3.5 bg-transparent border border-white/10 text-white/60 rounded-xl font-bold hover:bg-white/5 hover:text-white transition-all active:scale-95"
            >
                Continue as Guest
            </button>
          </div>
        )}

        <p className="mt-8 text-xs text-white/20">
            By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;