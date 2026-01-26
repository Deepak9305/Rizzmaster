import React from 'react';

interface BottomNavProps {
  currentView: 'HOME' | 'SAVED' | 'PROFILE';
  onChange: (view: 'HOME' | 'SAVED' | 'PROFILE') => void;
}

const BottomNav: React.FC<BottomNavProps> = ({ currentView, onChange }) => {
  return (
    <div className="fixed bottom-0 left-0 w-full z-40 bg-black/90 backdrop-blur-xl border-t border-white/10 pb-[env(safe-area-inset-bottom)]">
      <div className="flex justify-around items-center h-16">
        <button 
          onClick={() => onChange('HOME')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${currentView === 'HOME' ? 'text-rose-500' : 'text-white/40 hover:text-white/60'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
          <span className="text-[10px] font-medium tracking-wide">Create</span>
        </button>

        <button 
          onClick={() => onChange('SAVED')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${currentView === 'SAVED' ? 'text-rose-500' : 'text-white/40 hover:text-white/60'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" /></svg>
          <span className="text-[10px] font-medium tracking-wide">Saved</span>
        </button>

        <button 
          onClick={() => onChange('PROFILE')}
          className={`flex flex-col items-center justify-center w-full h-full space-y-1 ${currentView === 'PROFILE' ? 'text-rose-500' : 'text-white/40 hover:text-white/60'}`}
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
          <span className="text-[10px] font-medium tracking-wide">Profile</span>
        </button>
      </div>
    </div>
  );
};

export default BottomNav;