import React from 'react';

interface FooterProps {
  className?: string;
}

const Footer: React.FC<FooterProps> = ({ className = "" }) => {
  return (
    <footer className={`w-full text-center py-6 border-t border-white/5 ${className}`}>
      <div className="flex flex-col items-center justify-center gap-2">
        <p className="text-white/30 text-xs">
          © {new Date().getFullYear()} Rizz Master AI. All rights reserved.
        </p>
        <div className="flex gap-4 text-xs text-white/20">
            <a href="#" className="hover:text-white/50 transition-colors">Privacy</a>
            <a href="#" className="hover:text-white/50 transition-colors">Terms</a>
            <a href="#" className="hover:text-white/50 transition-colors">Support</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;