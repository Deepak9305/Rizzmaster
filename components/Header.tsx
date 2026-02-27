import React from 'react';
import { UserProfile } from '../types';

interface HeaderProps {
    profile: UserProfile | null;
}

const Header: React.FC<HeaderProps> = ({ profile }) => {
    return (
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
    );
};

export default React.memo(Header);
