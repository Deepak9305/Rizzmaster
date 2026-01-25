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
                <h3 className="text-white font-bold mb-2">1. Data Collection</h3>
                <p>We collect minimal data necessary to operate Rizz Master. This includes your email (for authentication), generated content history, and usage credits. We do not sell your personal data to third parties.</p>
              </section>
              <section>
                <h3 className="text-white font-bold mb-2">2. AI Processing</h3>
                <p>User inputs (chat logs, bio details, and images) are sent to Google's Gemini API for processing. These inputs are not used by us to train models, but are subject to Google's data processing terms.</p>
              </section>
              <section>
                <h3 className="text-white font-bold mb-2">3. Local Storage</h3>
                <p>For guest users, data is stored locally on your device. Clearing your browser cache will result in data loss.</p>
              </section>
              <section>
                <h3 className="text-white font-bold mb-2">4. Account Deletion</h3>
                <p>You may request full account deletion at any time by contacting support.</p>
              </section>
            </>
          ) : (
            <>
               <section>
                <h3 className="text-white font-bold mb-2">1. Acceptance of Terms</h3>
                <p>By accessing Rizz Master, you agree to these terms. This service is for entertainment purposes only.</p>
              </section>
              <section>
                <h3 className="text-white font-bold mb-2">2. AI Disclaimer</h3>
                <p>Generations are created by Artificial Intelligence. The advice given may be inaccurate, inappropriate, or ineffective. Use your own judgment in real-world social interactions. We are not responsible for rejected dates or awkward conversations.</p>
              </section>
              <section>
                <h3 className="text-white font-bold mb-2">3. User Conduct</h3>
                <p>You agree not to use this service to generate harassment, hate speech, or illegal content. We reserve the right to ban users who violate this policy.</p>
              </section>
              <section>
                <h3 className="text-white font-bold mb-2">4. Subscriptions & Refunds</h3>
                <p>Premium features are provided on an "as is" basis. Refunds are handled at our discretion for technical failures only.</p>
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