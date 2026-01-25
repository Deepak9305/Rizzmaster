import React from 'react';

interface FooterProps {
  className?: string;
  onNavigate: (page: 'PRIVACY' | 'TERMS' | 'SUPPORT') => void;
}

const Footer: React.FC<FooterProps> = ({ className = "", onNavigate }) => {
  return (
    <footer className={`w-full text-center py-6 border-t border-white/5 ${className}`}>
      <div className="flex flex-col items-center justify-center gap-2">
        <p className="text-white/30 text-xs">
          © {new Date().getFullYear()} Rizz Master AI. All rights reserved.
        </p>
        <div className="flex gap-4 text-xs text-white/20">
            <button onClick={() => onNavigate('PRIVACY')} className="hover:text-white/50 transition-colors uppercase tracking-wider">Privacy</button>
            <button onClick={() => onNavigate('TERMS')} className="hover:text-white/50 transition-colors uppercase tracking-wider">Terms</button>
            <button onClick={() => onNavigate('SUPPORT')} className="hover:text-white/50 transition-colors uppercase tracking-wider">Support</button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;