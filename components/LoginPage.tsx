import React from 'react';
import { supabase } from '../services/supabaseClient';

interface LoginPageProps {
  onGuestLogin: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onGuestLogin }) => {
  
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

        <div className="space-y-3">
            <button 
                onClick={handleGoogleLogin}
                className="w-full py-3.5 bg-white text-black rounded-xl font-bold flex items-center justify-center gap-3 hover:bg-gray-100 transition-all active:scale-95"
            >
                <img src="https://www.svgrepo.com/show/475656/google-color.svg" alt="G" className="w-5 h-5" />
                Continue with Google
            </button>
            
            <div className="relative py-4">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10"></div></div>
                <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#0f0f0f] px-2 text-white/30">Or</span></div>
            </div>

            <button 
                onClick={onGuestLogin}
                className="w-full py-3.5 bg-white/5 border border-white/10 text-white rounded-xl font-bold hover:bg-white/10 transition-all active:scale-95"
            >
                Continue as Guest
            </button>
        </div>

        <p className="mt-8 text-xs text-white/20">
            By continuing, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
};

export default LoginPage;