import React from 'react';

interface LegalModalProps {
  type: 'privacy' | 'terms';
  onClose: () => void;
}

const LegalModals: React.FC<LegalModalProps> = ({ type, onClose }) => {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div 
        className="absolute inset-0 bg-black/90 backdrop-blur-md"
        onClick={onClose}
      />
      
      <div className="relative bg-[#0a0a0a] rounded-3xl w-full max-w-2xl max-h-[80vh] border border-white/10 shadow-2xl flex flex-col animate-scale-in">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5 rounded-t-3xl">
          <h2 className="text-xl font-bold text-white">
            {type === 'privacy' ? 'Privacy Policy' : 'Terms of Service'}
          </h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/20 transition-all"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-6 md:p-8 overflow-y-auto text-white/70 text-sm leading-relaxed space-y-6 custom-scrollbar">
          {type === 'privacy' ? (
            <>
              <section>
                <h3 className="text-white font-bold mb-2">Privacy Summary</h3>
                <p>We respect your privacy. This app collects minimal data (e.g., email, credits) to operate the service. User inputs are processed by third-party AI providers for generation only. We do not sell your personal data.</p>
                <p className="mt-4 text-xs opacity-50">For full details, please check the Privacy Policy link on our App Store / Play Store listing.</p>
              </section>
              <section>
                <h3 className="text-white font-bold mb-2">Account Deletion</h3>
                <p>You may request the deletion of your account and all associated data at any time via the in-app support or by contacting us.</p>
              </section>
            </>
          ) : (
            <>
               <section>
                <h3 className="text-white font-bold mb-2">Terms Overview</h3>
                <p>Rizz Master is for entertainment purposes only. AI-generated advice may be inaccurate or inappropriate; please use your own judgment.</p>
              </section>
              <section>
                <h3 className="text-white font-bold mb-2">User Conduct</h3>
                <p>You agree not to use this service to generate harmful, illegal, or harassing content. We reserve the right to ban users who violate this policy.</p>
                <p className="mt-4 text-xs opacity-50">For full terms, please check the Terms of Service link on our App Store / Play Store listing.</p>
              </section>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-black/20 rounded-b-3xl">
          <button 
            onClick={onClose}
            className="w-full py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors"
          >
            Understood
          </button>
        </div>
      </div>
    </div>
  );
};

export default LegalModals;