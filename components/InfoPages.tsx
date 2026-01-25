import React from 'react';

type PageType = 'PRIVACY' | 'TERMS' | 'SUPPORT';

interface InfoPagesProps {
  page: PageType;
  onBack: () => void;
}

const InfoPages: React.FC<InfoPagesProps> = ({ page, onBack }) => {
  const renderContent = () => {
    switch (page) {
      case 'PRIVACY':
        return (
          <>
            <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-amber-200 mb-6">Privacy Policy</h1>
            <div className="space-y-6 text-white/80 leading-relaxed">
              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">1. Data Collection</h3>
                <p>We prioritize your privacy. We collect minimal data necessary to operate Rizz Master:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-white/60">
                  <li>Your email address (for account authentication).</li>
                  <li>Generated content history (stored securely in your profile).</li>
                  <li>Usage credits and subscription status.</li>
                </ul>
                <p className="mt-3 text-sm italic">We do not sell your personal data to third parties.</p>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">2. AI Processing</h3>
                <p>User inputs (chat logs, bio details, and images) are sent to Google's Gemini API for processing. These inputs are transiently processed to generate your results. By using this service, you acknowledge that your input data is processed by third-party AI providers subject to their own data processing terms.</p>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">3. Data Security</h3>
                <p>Your saved Rizz and Bios are stored in a secure Supabase database with Row Level Security (RLS), ensuring only you can access your saved items.</p>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">4. Account Deletion</h3>
                <p>You have the right to be forgotten. If you wish to delete your account and all associated data, please contact our support team using the Support page.</p>
              </section>
            </div>
          </>
        );
      case 'TERMS':
        return (
          <>
            <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-amber-200 mb-6">Terms of Service</h1>
            <div className="space-y-6 text-white/80 leading-relaxed">
              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">1. Acceptance of Terms</h3>
                <p>By accessing Rizz Master, you agree to these terms. This service is provided for entertainment purposes only.</p>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">2. AI Disclaimer</h3>
                <p>Generations are created by Artificial Intelligence. The advice given may be inaccurate, inappropriate, or ineffective. Use your own judgment in real-world social interactions. We are not responsible for rejected dates, awkward conversations, or any outcomes resulting from the use of our generated content.</p>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">3. User Conduct</h3>
                <p>You agree not to use this service to generate:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 text-white/60">
                  <li>Harassment or hate speech.</li>
                  <li>Illegal content or threats.</li>
                  <li>Content that violates the privacy of others.</li>
                </ul>
                <p className="mt-3">We reserve the right to ban users who violate this policy without refund.</p>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">4. Subscriptions & Refunds</h3>
                <p>Premium features are provided on an "as is" basis. Refunds are handled at our discretion for technical failures only. You may cancel your subscription at any time to prevent future billing.</p>
              </section>
            </div>
          </>
        );
      case 'SUPPORT':
        return (
          <>
            <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-amber-200 mb-6">Support Center</h1>
            
            <div className="grid md:grid-cols-2 gap-6 mb-8">
               <div className="glass p-8 rounded-3xl border border-white/10 text-center flex flex-col items-center justify-center hover:border-white/20 transition-all">
                  <div className="w-16 h-16 bg-rose-500/20 rounded-full flex items-center justify-center text-3xl mb-4 text-rose-400">✉️</div>
                  <h3 className="text-xl font-bold text-white mb-2">Contact Us</h3>
                  <p className="text-white/60 mb-6 text-sm">Found a bug? Billing issue? Just want to say hi?</p>
                  <a href="mailto:support@rizzmaster.ai" className="px-6 py-3 bg-white text-black font-bold rounded-xl hover:bg-gray-200 transition-colors w-full">
                    Email Support
                  </a>
               </div>

               <div className="glass p-8 rounded-3xl border border-white/10 text-center flex flex-col items-center justify-center hover:border-white/20 transition-all">
                  <div className="w-16 h-16 bg-amber-500/20 rounded-full flex items-center justify-center text-3xl mb-4 text-amber-400">💡</div>
                  <h3 className="text-xl font-bold text-white mb-2">Feature Request</h3>
                  <p className="text-white/60 mb-6 text-sm">Have an idea to make the Rizz Master even better?</p>
                  <a href="mailto:feedback@rizzmaster.ai?subject=Feature Request" className="px-6 py-3 border border-white/20 text-white font-bold rounded-xl hover:bg-white/5 transition-colors w-full">
                    Submit Idea
                  </a>
               </div>
            </div>

            <h2 className="text-2xl font-bold text-white mb-6 pl-2 border-l-4 border-rose-500">Frequently Asked Questions</h2>
            <div className="space-y-4">
              <details className="group bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
                <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-white/5 transition-colors">
                   <span className="font-semibold text-white">How do credits work?</span>
                   <span className="transform group-open:rotate-180 transition-transform text-white/50">▼</span>
                </summary>
                <div className="p-5 pt-0 text-white/60 leading-relaxed border-t border-white/5 mt-2">
                   Free users get 5 credits every day. Credits reset at midnight UTC. You can earn more credits by waiting for the cooldown or upgrading to Premium for unlimited access.
                </div>
              </details>

              <details className="group bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
                <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-white/5 transition-colors">
                   <span className="font-semibold text-white">Can I cancel my subscription?</span>
                   <span className="transform group-open:rotate-180 transition-transform text-white/50">▼</span>
                </summary>
                <div className="p-5 pt-0 text-white/60 leading-relaxed border-t border-white/5 mt-2">
                   Yes, you can cancel your subscription at any time via the Premium Modal or by contacting support. You will retain access until the end of your billing period.
                </div>
              </details>

              <details className="group bg-white/5 rounded-2xl border border-white/5 overflow-hidden">
                <summary className="flex items-center justify-between p-5 cursor-pointer hover:bg-white/5 transition-colors">
                   <span className="font-semibold text-white">Is my chat data private?</span>
                   <span className="transform group-open:rotate-180 transition-transform text-white/50">▼</span>
                </summary>
                <div className="p-5 pt-0 text-white/60 leading-relaxed border-t border-white/5 mt-2">
                   Absolutely. We only store the generated results you explicitly save. The context you paste and images you upload are processed transiently and are not stored in our persistent database.
                </div>
              </details>
            </div>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen w-full bg-black text-white animate-fade-in pb-20">
      <div className="max-w-4xl mx-auto px-4 py-8">
        <button 
          onClick={onBack}
          className="mb-8 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-full text-sm font-bold text-white/60 hover:text-white transition-all flex items-center gap-2 group"
        >
          <span className="group-hover:-translate-x-1 transition-transform">←</span> Back to Dashboard
        </button>

        <div className="glass p-8 md:p-12 rounded-3xl border border-white/10 shadow-2xl relative overflow-hidden">
          {/* Decorative Background Elements */}
          <div className="absolute top-0 right-0 w-[300px] h-[300px] bg-rose-500/5 rounded-full blur-[80px] pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-amber-500/5 rounded-full blur-[80px] pointer-events-none" />
          
          <div className="relative z-10">
            {renderContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default InfoPages;
