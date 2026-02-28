
import React, { useState } from 'react';
import { NativeBridge } from '../services/nativeBridge';

interface OnboardingFlowProps {
  onComplete: () => void;
}

const SLIDES = [
  {
    id: 'chat',
    icon: '🔥',
    title: 'Generate Fire Replies',
    desc: 'Paste a boring chat or upload a screenshot. We\'ll write the perfect response to keep the convo alive.',
    color: 'from-rose-500 to-orange-500'
  },
  {
    id: 'bio',
    icon: '📝',
    title: 'Craft the Perfect Bio',
    desc: 'Stand out instantly. Describe your vibe, hobbies, or job, and we\'ll generate a magnetic profile bio.',
    color: 'from-purple-500 to-indigo-500'
  },
  {
    id: 'saved',
    icon: '💎',
    title: 'Save Your Gems',
    desc: 'Found a line that hits different? Save it to your collection so you never lose your best rizz.',
    color: 'from-blue-500 to-cyan-500'
  },
  {
    id: 'credits',
    icon: '⚡',
    title: 'Daily Credits',
    desc: 'You get 5 free credits every day. Want more? Watch an ad or upgrade to Pro for unlimited power.',
    color: 'from-yellow-400 to-amber-600'
  }
];

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);

  const handleNext = () => {
    NativeBridge.haptic('light');
    if (currentIndex < SLIDES.length - 1) {
      setCurrentIndex(prev => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = () => {
    NativeBridge.haptic('medium');
    setIsExiting(true);
    setTimeout(onComplete, 500); // Allow exit animation
  };

  const currentSlide = SLIDES[currentIndex];

  return (
    <div className={`fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center p-6 transition-opacity duration-500 ${isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      {/* Background Ambience */}
      <div className={`absolute top-1/4 left-1/4 w-64 h-64 rounded-full blur-[100px] opacity-20 bg-gradient-to-br ${currentSlide.color} transition-colors duration-700`} />
      <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black via-black/90 to-transparent z-0" />

      {/* Skip Button */}
      <button 
        onClick={handleFinish} 
        className="absolute top-12 right-6 z-50 text-white/40 text-xs font-bold uppercase tracking-widest hover:text-white transition-colors px-4 py-2"
      >
        Skip
      </button>

      <div className="relative z-10 w-full max-w-md flex flex-col items-center text-center">
        
        {/* Dynamic Icon */}
        <div className="mb-8 relative group">
           <div className={`absolute inset-0 bg-gradient-to-br ${currentSlide.color} blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-500 rounded-full`} />
           <div className="relative text-7xl md:text-8xl animate-float select-none">
             {currentSlide.icon}
           </div>
        </div>

        {/* Text Content */}
        <div className="min-h-[160px] flex flex-col items-center justify-start animate-fade-in-up" key={currentIndex}>
            <h2 className="text-3xl font-black text-white mb-4 tracking-tight leading-tight">
              {currentSlide.title}
            </h2>
            <p className="text-white/60 text-lg leading-relaxed max-w-xs">
              {currentSlide.desc}
            </p>
        </div>

        {/* Indicators */}
        <div className="flex gap-2 mb-10 mt-4">
          {SLIDES.map((_, idx) => (
            <div 
              key={idx}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                idx === currentIndex ? 'w-8 bg-white' : 'w-1.5 bg-white/20'
              }`}
            />
          ))}
        </div>

        {/* Action Button */}
        <button
          onClick={handleNext}
          className="w-full py-4 rounded-2xl font-bold text-lg text-white rizz-gradient shadow-lg hover:shadow-rose-500/20 active:scale-[0.98] transition-all"
        >
          {currentIndex === SLIDES.length - 1 ? "Let's Go 🚀" : "Next"}
        </button>

      </div>
    </div>
  );
};

export default React.memo(OnboardingFlow);
