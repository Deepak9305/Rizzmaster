import React from 'react';
import { UserProfile } from '../types';

interface ProfileViewProps {
  profile: UserProfile;
  onLogout: () => void;
  onUpgrade: () => void;
  onWatchAd: () => void;
  onNavigate: (page: 'PRIVACY' | 'TERMS' | 'SUPPORT') => void;
  isMusicPlaying: boolean;
  onToggleMusic: () => void;
}

const ProfileView: React.FC<ProfileViewProps> = ({ 
  profile, 
  onLogout, 
  onUpgrade, 
  onWatchAd,
  onNavigate,
  isMusicPlaying,
  onToggleMusic
}) => {
  return (
    <div className="w-full h-full flex flex-col animate-fade-in pt-4 pb-32 overflow-y-auto custom-scrollbar">
      
      {/* Header */}
      <div className="px-1 mb-6">
        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-fuchsia-400">
            Profile
        </h2>
        <p className="text-white/40 text-sm">Manage your account and settings.</p>
      </div>

      {/* Stats Card */}
      <div className="glass p-6 rounded-3xl border border-white/10 mb-6 relative overflow-hidden">
         <div className="absolute top-0 right-0 w-32 h-32 bg-rose-500/10 rounded-full blur-3xl"></div>
         
         <div className="flex items-center gap-4 mb-6 relative z-10">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-violet-600 to-rose-600 p-0.5">
                <div className="w-full h-full bg-black rounded-full flex items-center justify-center text-2xl">
                    {profile.is_premium ? '👑' : '😎'}
                </div>
            </div>
            <div>
                <h3 className="text-xl font-bold text-white">
                    {profile.email?.split('@')[0] || 'Rizz Master'}
                </h3>
                <p className={`text-xs font-bold uppercase tracking-wider ${profile.is_premium ? 'text-yellow-400' : 'text-white/50'}`}>
                    {profile.is_premium ? 'Premium Member' : 'Free Plan'}
                </p>
            </div>
         </div>

         <div className="flex gap-4">
            <div className="flex-1 bg-white/5 rounded-2xl p-4 text-center border border-white/5">
                <div className="text-2xl font-black text-white mb-1">
                    {profile.is_premium ? '∞' : profile.credits}
                </div>
                <div className="text-[10px] uppercase tracking-widest text-white/40">Credits</div>
            </div>
            {!profile.is_premium && (
                <button 
                    onClick={onWatchAd}
                    className="flex-1 bg-white/5 hover:bg-white/10 rounded-2xl p-4 text-center border border-white/5 transition-colors flex flex-col items-center justify-center gap-1 group"
                >
                    <span className="text-xl group-hover:scale-110 transition-transform">📺</span>
                    <div className="text-[10px] uppercase tracking-widest text-white/40">Get +5</div>
                </button>
            )}
         </div>
      </div>

      {/* Premium Banner */}
      {!profile.is_premium && (
          <button onClick={onUpgrade} className="w-full p-1 rounded-3xl bg-gradient-to-r from-yellow-600 via-amber-500 to-yellow-600 mb-6 group transform transition-all active:scale-[0.98]">
              <div className="bg-black/90 rounded-[22px] p-5 flex items-center justify-between backdrop-blur-sm group-hover:bg-black/80 transition-colors">
                  <div className="text-left">
                      <h3 className="font-bold text-white text-lg flex items-center gap-2">
                          Go Premium <span className="text-yellow-400">👑</span>
                      </h3>
                      <p className="text-white/50 text-xs">Unlock unlimited generations</p>
                  </div>
                  <div className="bg-yellow-500 text-black font-bold text-xs px-4 py-2 rounded-full">
                      Upgrade
                  </div>
              </div>
          </button>
      )}

      {/* Settings List */}
      <div className="space-y-3">
          <h4 className="text-xs font-bold text-white/30 uppercase tracking-widest px-2 mb-2">Settings</h4>
          
          <button 
            onClick={onToggleMusic}
            className="w-full p-4 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-between hover:bg-white/10 transition-colors"
          >
              <div className="flex items-center gap-3">
                  <span className="text-lg opacity-70">🎵</span>
                  <span className="text-sm font-medium text-white/80">Background Music</span>
              </div>
              <div className={`w-10 h-6 rounded-full p-1 transition-colors ${isMusicPlaying ? 'bg-green-500' : 'bg-white/10'}`}>
                  <div className={`w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${isMusicPlaying ? 'translate-x-4' : 'translate-x-0'}`}></div>
              </div>
          </button>

          <div className="grid grid-cols-3 gap-3">
             <button onClick={() => onNavigate('PRIVACY')} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-xs font-medium text-white/60">Privacy</button>
             <button onClick={() => onNavigate('TERMS')} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-xs font-medium text-white/60">Terms</button>
             <button onClick={() => onNavigate('SUPPORT')} className="p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 transition-colors text-xs font-medium text-white/60">Support</button>
          </div>

          <button 
            onClick={onLogout}
            className="w-full p-4 rounded-2xl border border-red-500/20 text-red-400 hover:bg-red-500/10 transition-colors text-sm font-bold flex items-center justify-center gap-2 mt-4"
          >
              <span>←</span> Log Out
          </button>
      </div>
      
      <p className="text-center text-[10px] text-white/20 mt-8">
          Version 2.0.0 • Build 245
      </p>
    </div>
  );
};

export default ProfileView;