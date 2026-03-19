
import React, { useState } from 'react';

interface OnboardingFlowProps {
  onComplete: () => void;
}

const SLIDES = [
  {
    id: 'chat',
    title: 'Smart Reply Generation',
    desc: 'Paste a conversation or upload a screenshot. Rizzmaster crafts the perfect response — sharp, confident, and on point.',
    color: 'from-rose-500 to-orange-500',
    glowColor: 'rgba(244,63,94,0.25)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16">
        <defs>
          <linearGradient id="g1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f43f5e" />
            <stop offset="100%" stopColor="#f97316" />
          </linearGradient>
        </defs>
        <rect x="4" y="8" width="28" height="22" rx="5" fill="url(#g1)" opacity="0.15" stroke="url(#g1)" strokeWidth="2" />
        <path d="M4 25l4 6v-6" fill="url(#g1)" />
        <rect x="16" y="18" width="28" height="22" rx="5" fill="url(#g1)" opacity="0.25" stroke="url(#g1)" strokeWidth="2" />
        <path d="M44 35l-4 6v-6" fill="url(#g1)" />
        <circle cx="24" cy="27" r="2" fill="url(#g1)" />
        <circle cx="30" cy="27" r="2" fill="url(#g1)" />
        <circle cx="36" cy="27" r="2" fill="url(#g1)" />
        <circle cx="10" cy="19" r="2" fill="url(#g1)" />
        <circle cx="16" cy="19" r="2" fill="url(#g1)" />
        <circle cx="22" cy="19" r="2" fill="url(#g1)" />
      </svg>
    ),
  },
  {
    id: 'bio',
    title: 'Profile Bio Writer',
    desc: 'Describe yourself in a few words. We handle the rest — turning raw details into a compelling, magnetic profile.',
    color: 'from-purple-500 to-indigo-500',
    glowColor: 'rgba(168,85,247,0.25)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16">
        <defs>
          <linearGradient id="g2" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#a855f7" />
            <stop offset="100%" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <rect x="8" y="4" width="32" height="40" rx="6" stroke="url(#g2)" strokeWidth="2" fill="url(#g2)" fillOpacity="0.1" />
        <circle cx="24" cy="17" r="6" stroke="url(#g2)" strokeWidth="1.5" />
        <path d="M13 36c0-6.075 4.925-11 11-11s11 4.925 11 11" stroke="url(#g2)" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M15 32h18" stroke="url(#g2)" strokeWidth="1.5" strokeLinecap="round" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'saved',
    title: 'Your Personal Collection',
    desc: 'Save lines that land perfectly. Build a personal library of your sharpest responses, always within reach.',
    color: 'from-blue-500 to-cyan-400',
    glowColor: 'rgba(59,130,246,0.25)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16">
        <defs>
          <linearGradient id="g3" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <path d="M12 4h24a4 4 0 014 4v32l-16-8-16 8V8a4 4 0 014-4z" stroke="url(#g3)" strokeWidth="2" fill="url(#g3)" fillOpacity="0.12" />
        <path d="M18 18h12M18 24h8" stroke="url(#g3)" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'coach',
    title: 'AI Persona Modes',
    desc: 'Switch between Smooth, Tease, and Chaotic modes. Each crafted for a different situation — you pick the energy.',
    color: 'from-fuchsia-500 to-pink-500',
    glowColor: 'rgba(217,70,239,0.25)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16">
        <defs>
          <linearGradient id="g4" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#d946ef" />
            <stop offset="100%" stopColor="#ec4899" />
          </linearGradient>
        </defs>
        <circle cx="24" cy="20" r="10" stroke="url(#g4)" strokeWidth="2" fill="url(#g4)" fillOpacity="0.12" />
        <path d="M24 30v6M17 36h14" stroke="url(#g4)" strokeWidth="2" strokeLinecap="round" />
        <path d="M19 17c1-2 3-3 5-3s4 1 5 3" stroke="url(#g4)" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="20" cy="21" r="1.5" fill="url(#g4)" />
        <circle cx="28" cy="21" r="1.5" fill="url(#g4)" />
        <path d="M34 10l4-4M14 10l-4-4M24 8V4" stroke="url(#g4)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      </svg>
    ),
  },
  {
    id: 'vision',
    title: 'Vision AI Analysis',
    desc: 'Screenshot a profile or chat and let the AI read the context. No typing needed — just point and generate.',
    color: 'from-teal-400 to-emerald-500',
    glowColor: 'rgba(20,184,166,0.25)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16">
        <defs>
          <linearGradient id="g5" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
        <rect x="6" y="10" width="36" height="28" rx="5" stroke="url(#g5)" strokeWidth="2" fill="url(#g5)" fillOpacity="0.1" />
        <circle cx="24" cy="24" r="7" stroke="url(#g5)" strokeWidth="2" />
        <circle cx="24" cy="24" r="3" fill="url(#g5)" fillOpacity="0.6" />
        <circle cx="36" cy="14" r="3" fill="url(#g5)" />
      </svg>
    ),
  },
  {
    id: 'credits',
    title: 'Daily Credits System',
    desc: '5 free credits every day. Watch an ad for more, or unlock unlimited access with Pro — your rate, your rules.',
    color: 'from-yellow-400 to-amber-500',
    glowColor: 'rgba(234,179,8,0.25)',
    icon: (
      <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-16 h-16">
        <defs>
          <linearGradient id="g6" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#facc15" />
            <stop offset="100%" stopColor="#f59e0b" />
          </linearGradient>
        </defs>
        <path d="M24 4l5.09 10.26L40 15.82l-8 7.78 1.86 11.08L24 29.27l-9.86 5.4L16 23.6 8 15.82l10.91-1.56L24 4z" stroke="url(#g6)" strokeWidth="2" fill="url(#g6)" fillOpacity="0.15" strokeLinejoin="round" />
        <path d="M24 12l3 6 6 .87-4.5 4.38 1.09 6.25L24 26.5l-5.59 3-1.09-6.25L13 18.87 19 18l5-6z" fill="url(#g6)" fillOpacity="0.5" />
      </svg>
    ),
  },
];

const OnboardingFlow: React.FC<OnboardingFlowProps> = ({ onComplete }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [direction, setDirection] = useState<'forward' | 'back'>('forward');

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      setDirection('forward');
      setCurrentIndex(prev => prev + 1);
    } else {
      handleFinish();
    }
  };

  const handleFinish = () => {
    setIsExiting(true);
    setTimeout(onComplete, 500);
  };

  const currentSlide = SLIDES[currentIndex];
  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <div
      className={`fixed inset-0 z-[200] flex flex-col transition-opacity duration-500 ${isExiting ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
      style={{ background: '#09090b' }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none transition-all duration-700"
        style={{
          background: `radial-gradient(ellipse 70% 50% at 50% 30%, ${currentSlide.glowColor}, transparent 70%)`,
        }}
      />

      {/* Fine grid overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Skip */}
      <div className="absolute top-[calc(env(safe-area-inset-top,0px)+1.5rem)] right-6 z-20">
        <button
          onClick={handleFinish}
          className="text-white/30 text-xs font-semibold uppercase tracking-widest hover:text-white/60 transition-colors duration-200 px-2 py-1"
        >
          Skip
        </button>
      </div>

      {/* Step counter */}
      <div className="absolute top-[calc(env(safe-area-inset-top,0px)+1.5rem)] left-6 z-20">
        <span className="text-white/20 text-xs font-mono tracking-widest">
          {String(currentIndex + 1).padStart(2, '0')} / {String(SLIDES.length).padStart(2, '0')}
        </span>
      </div>

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-8 text-center">

        {/* Icon card */}
        <div
          className="mb-10 w-28 h-28 rounded-3xl flex items-center justify-center transition-all duration-500"
          style={{
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: `0 0 48px ${currentSlide.glowColor}`,
          }}
          key={`icon-${currentIndex}`}
        >
          {currentSlide.icon}
        </div>

        {/* Text */}
        <div
          className="flex flex-col items-center max-w-xs animate-fade-in-up"
          key={`text-${currentIndex}`}
          style={{ minHeight: 140 }}
        >
          <h2 className="text-2xl font-bold text-white tracking-tight leading-snug mb-3">
            {currentSlide.title}
          </h2>
          <p className="text-white/50 text-base leading-relaxed">
            {currentSlide.desc}
          </p>
        </div>

        {/* Dot indicators */}
        <div className="flex items-center gap-2 mt-10 mb-8">
          {SLIDES.map((_, idx) => (
            <button
              key={idx}
              onClick={() => { setDirection('forward'); setCurrentIndex(idx); }}
              className={`rounded-full transition-all duration-300 ${idx === currentIndex
                  ? 'w-6 h-1.5 bg-white'
                  : idx < currentIndex
                    ? 'w-1.5 h-1.5 bg-white/40'
                    : 'w-1.5 h-1.5 bg-white/15'
                }`}
            />
          ))}
        </div>

        {/* CTA Button */}
        <button
          onClick={handleNext}
          className={`w-full max-w-xs py-4 rounded-2xl font-semibold text-base tracking-wide transition-all duration-200 active:scale-[0.98] ${isLast
              ? 'text-black'
              : 'text-white'
            }`}
          style={{
            background: isLast
              ? 'linear-gradient(135deg, #f0f0f0, #d0d0d0)'
              : `linear-gradient(135deg, ${currentSlide.glowColor.replace('0.25', '0.6')}, ${currentSlide.glowColor.replace('0.25', '0.9')})`,
            boxShadow: isLast
              ? '0 4px 24px rgba(255,255,255,0.12)'
              : `0 4px 28px ${currentSlide.glowColor}`,
            border: isLast ? 'none' : '1px solid rgba(255,255,255,0.1)',
          }}
        >
          {isLast ? 'Get Started' : 'Continue'}
        </button>

        {/* Bottom safe area spacer */}
        <div style={{ height: 'max(env(safe-area-inset-bottom, 0px), 16px)' }} />
      </div>
    </div>
  );
};

export default OnboardingFlow;
