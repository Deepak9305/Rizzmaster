import React from 'react';

type PageType = 'PRIVACY' | 'TERMS' | 'SUPPORT';

interface InfoPagesProps {
  page: PageType;
  onBack: () => void;
  onDeleteAccount: () => void;
}

const InfoPages: React.FC<InfoPagesProps> = ({ page, onBack, onDeleteAccount }) => {
  const renderContent = () => {
    switch (page) {
      case 'PRIVACY':
        return (
          <>
            <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-amber-200 mb-6">Privacy Policy</h1>
            <div className="space-y-6 text-white/80 leading-relaxed text-sm">
              <p className="opacity-60 text-xs">Last Updated: {new Date().toLocaleDateString()}</p>
              
              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">1. Introduction</h3>
                <p>Welcome to Rizz Master ("we," "our," or "us"). We are committed to protecting your personal information and your right to privacy. This Privacy Policy explains what information we collect, how we use it, and your rights.</p>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">2. Information We Collect</h3>
                <ul className="list-disc pl-5 space-y-2 opacity-90">
                  <li><strong>Account Data:</strong> If you sign in via Google or Email, we store your email address and a unique user ID to manage your credits and subscription status.</li>
                  <li><strong>User Inputs:</strong> Text and images you upload (screenshots) are processed transiently. We do not permanently store your chat screenshots or the text context on our servers. They are sent to our AI provider for analysis and immediately discarded after the response is generated.</li>
                  <li><strong>Generated Content:</strong> We store the results (replies, bios) that you explicitly choose to "Save" within the app.</li>
                  <li><strong>Device Data:</strong> We may collect basic device information (model, OS version) for debugging and app optimization.</li>
                </ul>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">3. How We Use Your Data</h3>
                <p>We use your information solely to:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 opacity-90">
                    <li>Provide the AI generation service.</li>
                    <li>Manage your credit balance and premium subscription.</li>
                    <li>Improve app performance and fix bugs.</li>
                    <li>Show rewarded advertisements (via AdMob) if you choose to watch them.</li>
                </ul>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">4. Third-Party Services</h3>
                <p>We share data with the following trusted third-party providers:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 opacity-90">
                    <li><strong>Google Gemini API:</strong> For AI text and image analysis.</li>
                    <li><strong>Supabase:</strong> For authentication and database hosting.</li>
                    <li><strong>Google AdMob:</strong> For displaying advertisements.</li>
                </ul>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                 <h3 className="text-xl font-bold text-white mb-3">5. Data Retention & Deletion</h3>
                 <p className="mb-4">We retain your account data only as long as your account is active. You have the right to request the deletion of your account and all associated data at any time.</p>
                 
                 <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                    <h4 className="text-red-400 font-bold mb-2">Delete Account</h4>
                    <p className="text-xs text-white/60 mb-4">This action is irreversible. All your credits, saved items, and account details will be permanently removed.</p>
                    <button 
                        onClick={onDeleteAccount}
                        className="px-6 py-2 bg-red-500/20 text-red-300 font-bold rounded-lg hover:bg-red-500/30 transition-colors border border-red-500/30"
                    >
                        Delete My Account
                    </button>
                 </div>
              </section>
              
              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">6. Contact Us</h3>
                <p>If you have questions about this policy, please contact us at <a href="mailto:support@rizzmaster.ai" className="text-rose-400 hover:underline">support@rizzmaster.ai</a>.</p>
              </section>
            </div>
          </>
        );
      case 'TERMS':
        return (
          <>
            <h1 className="text-3xl md:text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-rose-400 to-amber-200 mb-6">Terms of Service</h1>
            <div className="space-y-6 text-white/80 leading-relaxed text-sm">
               <p className="opacity-60 text-xs">Last Updated: {new Date().toLocaleDateString()}</p>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">1. Acceptance of Terms</h3>
                <p>By downloading or using the Rizz Master app, you agree to be bound by these Terms. If you do not agree, please discontinue use of the app immediately.</p>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">2. Description of Service</h3>
                <p>Rizz Master uses Artificial Intelligence to generate conversation replies and bios. The content is for entertainment purposes only. We do not guarantee the accuracy, effectiveness, or appropriateness of the AI-generated content in real-world interactions.</p>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">3. User Conduct</h3>
                <p>You agree NOT to use the App to:</p>
                <ul className="list-disc pl-5 mt-2 space-y-1 opacity-90">
                    <li>Generate content that is illegal, harmful, threatening, abusive, harassment, defamatory, or hateful.</li>
                    <li>Generate content involving minors or sexual exploitation.</li>
                    <li>Upload images that contain illegal or non-consensual content.</li>
                </ul>
                <p className="mt-2 text-red-300">We reserve the right to terminate accounts that violate these rules without notice.</p>
              </section>

               <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">4. Subscriptions & Credits</h3>
                <p>Credits are used to generate content. Free credits replenish daily. Paid subscriptions or credit packs are final and non-refundable, except where required by law. We reserve the right to modify credit costs at any time.</p>
              </section>

              <section className="bg-white/5 p-6 rounded-2xl border border-white/5">
                <h3 className="text-xl font-bold text-white mb-3">5. Limitation of Liability</h3>
                <p className="uppercase text-xs tracking-wide">THE APP IS PROVIDED "AS IS". WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES RESULTING FROM YOUR USE OF THE SERVICE.</p>
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
                  <a href="mailto:support@rizzmaster.ai?subject=Feature Request" className="px-6 py-3 border border-white/20 text-white font-bold rounded-xl hover:bg-white/5 transition-colors w-full">
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

            <div className="mt-12 border-t border-red-500/20 pt-8">
              <div className="flex flex-col md:flex-row items-center justify-between gap-6">
                 <div className="text-left">
                    <h3 className="text-red-400 font-bold mb-2 text-lg">Danger Zone</h3>
                    <p className="text-white/40 text-sm max-w-md">
                        Once you delete your account, there is no going back. All your saved rizz, bio, and credits will be permanently removed.
                    </p>
                 </div>
                 <button 
                    onClick={onDeleteAccount}
                    className="px-6 py-3 bg-red-500/5 border border-red-500/20 text-red-400 font-bold rounded-xl hover:bg-red-500/20 transition-all w-full md:w-auto flex-shrink-0"
                  >
                    Delete Account
                  </button>
              </div>
            </div>
          </>
        );
    }
  };

  return (
    <div className="min-h-screen w-full bg-black text-white animate-fade-in pb-20 safe-top">
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
