import React from 'react';

interface FooterProps {
  className?: string;
  onNavigate: (page: 'PRIVACY' | 'TERMS' | 'SUPPORT') => void;
  onWebNavigate?: (path: '/privacy' | '/terms' | '/support') => void;
}

const Footer: React.FC<FooterProps> = ({ className = "", onNavigate, onWebNavigate }) => {
  const navigate = (page: 'PRIVACY' | 'TERMS' | 'SUPPORT') => {
    const path = `/${page.toLowerCase()}` as '/privacy' | '/terms' | '/support';
    onWebNavigate ? onWebNavigate(path) : onNavigate(page);
  };

  return (
    <footer
      className={`w-full border-t border-white/5 bg-gradient-to-t from-black via-black/80 to-transparent ${className}`}
      style={{
        paddingTop: '0.5rem', // Tightened to reduce gap above navigation buttons
        paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom))' // Ensures content sits above iPhone Home Indicator
      }}
    >
      <div className="max-w-4xl mx-auto px-4 flex flex-col items-center gap-8">

        {/* Logo & Copyright */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2 opacity-40 grayscale hover:grayscale-0 hover:opacity-100 transition-all duration-500 cursor-default">
            <span className="text-xl">✨</span>
            <span className="font-bold text-white tracking-tighter">Rizz Master</span>
          </div>
          <p className="text-[10px] text-white/20 font-medium tracking-widest uppercase">
            © {new Date().getFullYear()} AI Powered Dating Assistant
          </p>
        </div>

        {/* Navigation Links - Pill Design for better Touch Targets */}
        <div className="flex flex-wrap justify-center gap-3">
          <button
            onClick={() => navigate('PRIVACY')}
            className="px-4 py-2 text-[10px] font-bold text-white/50 bg-white/5 hover:bg-white/10 hover:text-white rounded-lg transition-all uppercase tracking-widest border border-white/5 hover:border-white/20 active:scale-95"
          >
            Privacy
          </button>
          <button
            onClick={() => navigate('TERMS')}
            className="px-4 py-2 text-[10px] font-bold text-white/50 bg-white/5 hover:bg-white/10 hover:text-white rounded-lg transition-all uppercase tracking-widest border border-white/5 hover:border-white/20 active:scale-95"
          >
            Terms
          </button>
          <button
            onClick={() => navigate('SUPPORT')}
            className="px-4 py-2 text-[10px] font-bold text-white/50 bg-white/5 hover:bg-white/10 hover:text-white rounded-lg transition-all uppercase tracking-widest border border-white/5 hover:border-white/20 active:scale-95"
          >
            Support
          </button>
        </div>

        {/* Version Indicator */}
        <div className="text-[9px] text-white/10 font-mono select-none">
          v1.2.0 (Mobile)
        </div>
      </div>
    </footer>
  );
};

export default Footer;
