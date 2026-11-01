import React from 'react';

const benefits = [
  { icon: '⚡', label: 'Unlimited generations', sub: 'Replies, bios, Coach and screenshot reads.' },
  { icon: '🧠', label: 'Every Coach persona', sub: '2 free personas. All 4 with Premium.' },
  { icon: '🎭', label: 'All premium vibes', sub: 'Every reply and bio style unlocked.' },
  { icon: '✨', label: 'Three custom personas', sub: 'Create 3 of your own. Free includes 1.' },
  { icon: '🚫', label: 'Ad-free Android experience', sub: 'No banners or ads for extra credits.' },
];

export default function PremiumBenefits() {
  return <ul className="premium-benefits">
    {benefits.map((benefit) => <li key={benefit.label} className="flex items-center gap-3">
      <span aria-hidden="true" className="w-9 h-9 rounded-lg bg-yellow-500/10 border border-yellow-500/15 flex items-center justify-center text-lg shrink-0">{benefit.icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-white/90 font-semibold leading-snug">{benefit.label}</p>
        <p className="text-[11px] text-white/50 leading-relaxed mt-0.5">{benefit.sub}</p>
      </div>
      <span aria-hidden="true" className="text-green-500 shrink-0">✓</span>
    </li>)}
  </ul>;
}
