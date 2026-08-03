import React, { useEffect, useMemo, useState } from 'react';
import { LEGAL_LINKS } from '../services/legalLinks';
import { BLOG_POSTS, getBlogPost, PLAY_STORE_URL, type BlogPost } from '../services/marketingContent';
import { MARKETING_HOME_PATH, normalizeMarketingPath } from '../services/marketingRoutes';

type MarketingRoute =
  | { kind: 'home' | 'blog' | 'privacy' | 'terms' | 'support' }
  | { kind: 'article'; slug: string }
  | { kind: 'not-found' };

const getRoute = (pathname: string): MarketingRoute => {
  const path = normalizeMarketingPath(pathname).toLowerCase();

  if (path === MARKETING_HOME_PATH) return { kind: 'home' };
  if (path === '/blog') return { kind: 'blog' };
  if (path === '/privacy') return { kind: 'privacy' };
  if (path === '/terms') return { kind: 'terms' };
  if (path === '/support') return { kind: 'support' };
  if (path.startsWith('/blog/')) {
    const slug = path.slice('/blog/'.length);
    return slug ? { kind: 'article', slug } : { kind: 'blog' };
  }

  return { kind: 'not-found' };
};

const setMeta = (name: string, content: string, property = false) => {
  const selector = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
  let tag = document.head.querySelector<HTMLMetaElement>(selector);
  if (!tag) {
    tag = document.createElement('meta');
    if (property) tag.setAttribute('property', name);
    else tag.setAttribute('name', name);
    document.head.appendChild(tag);
  }
  tag.setAttribute('content', content);
};

const updateSeo = (route: MarketingRoute) => {
  const post = route.kind === 'article' ? getBlogPost(route.slug) : undefined;
  const title = post
    ? `${post.title} | Rizz Master`
    : route.kind === 'blog'
      ? 'Rizz Master Blog | Better texts, better dates'
      : route.kind === 'privacy'
        ? 'Privacy Policy | Rizz Master'
        : route.kind === 'terms'
          ? 'Terms of Service | Rizz Master'
          : route.kind === 'support'
            ? 'Support | Rizz Master'
            : 'Rizz Master | Never run out of replies again';
  const description = post?.description
    || (route.kind === 'blog'
      ? 'Practical texting, dating app, opener, and profile advice for better conversations.'
      : route.kind === 'privacy'
        ? 'Read the Rizz Master privacy policy and learn how account and product data are handled.'
        : route.kind === 'terms'
          ? 'Read the Rizz Master terms of service for using the AI dating assistant.'
          : route.kind === 'support'
            ? 'Get help with Rizz Master, subscriptions, credits, account deletion, and feature requests.'
            : 'Rizz Master helps you create flirty replies, dating bios, openers, and conversation starters in seconds.');
  const keywords = post?.keywords.join(', ') || 'dating advice, texting advice, dating app openers, dating bios, AI dating assistant';

  document.title = title;
  setMeta('description', description);
  setMeta('keywords', keywords);
  setMeta('og:title', title, true);
  setMeta('og:description', description, true);
  setMeta('og:type', post ? 'article' : 'website', true);
  setMeta('og:url', `${LEGAL_LINKS.baseUrl}${window.location.pathname}`, true);

  const existingSchema = document.head.querySelector('#rizzmaster-seo-schema');
  existingSchema?.remove();
  const schema = document.createElement('script');
  schema.id = 'rizzmaster-seo-schema';
  schema.type = 'application/ld+json';
  schema.textContent = JSON.stringify(post ? {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updatedAt,
    keywords: post.keywords.join(', '),
    articleSection: post.category,
    author: { '@type': 'Organization', name: 'Rizz Master' },
    publisher: { '@type': 'Organization', name: 'Rizz Master' },
    mainEntityOfPage: `${LEGAL_LINKS.baseUrl}/blog/${post.slug}`
  } : {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Rizz Master',
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Android',
    description: 'AI-powered dating replies, bios, openers, and conversation starters.',
    url: LEGAL_LINKS.baseUrl,
    downloadUrl: PLAY_STORE_URL,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }
  });
  document.head.appendChild(schema);
};

const PlayStoreButton: React.FC<{
  variant?: 'primary' | 'secondary';
  label?: string;
  supportText?: string;
  compact?: boolean;
  className?: string;
}> = ({
  variant = 'primary',
  label = 'Get it on Google Play',
  supportText = 'Free daily credits · Android app',
  compact = false,
  className = ''
}) => (
  <a
    href={PLAY_STORE_URL}
    target="_blank"
    rel="noreferrer"
    aria-label={label}
    className={`group inline-flex items-center justify-center gap-3 rounded-2xl px-4 py-3 transition-all duration-300 active:scale-[0.98] ${compact ? 'min-w-[158px]' : 'min-w-[214px]'} ${variant === 'primary'
      ? 'marketing-cta-primary text-white shadow-[0_16px_50px_rgba(236,72,153,0.24)] hover:-translate-y-0.5 hover:shadow-[0_20px_60px_rgba(236,72,153,0.34)]'
      : 'border border-white/15 bg-white/[0.06] text-white/80 hover:-translate-y-0.5 hover:border-white/30 hover:bg-white/10 hover:text-white'
      } ${className}`}
  >
    <span className={`flex shrink-0 items-center justify-center rounded-xl border border-white/20 bg-black/15 ${compact ? 'h-8 w-8' : 'h-10 w-10'}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" className={compact ? 'h-5 w-5' : 'h-6 w-6'} fill="none">
        <path d="M3.5 3.7 13.1 12 3.5 20.3V3.7Z" fill="#4ADE80" />
        <path d="m13.1 12 2.6-2.25 3.55 2.04c.74.43.74 1.5 0 1.93l-3.55 2.04L13.1 12Z" fill="#FACC15" />
        <path d="m3.5 3.7 12.2 6.05L13.1 12 3.5 3.7Z" fill="#F472B6" />
        <path d="m3.5 20.3 12.2-6.05L13.1 12l-9.6 8.3Z" fill="#C084FC" />
      </svg>
    </span>
    <span className="min-w-0 text-left">
      <span className={`block truncate font-black leading-tight ${compact ? 'text-xs' : 'text-sm'}`}>{label}</span>
      {supportText && <span className={`mt-1 block truncate font-medium leading-tight text-white/60 ${compact ? 'text-[9px]' : 'text-[10px]'}`}>{supportText}</span>}
    </span>
    <span className="text-white/60 transition-transform group-hover:translate-x-1" aria-hidden="true">→</span>
  </a>
);

const MarketingNav: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => (
  <header className="relative z-20 border-b border-white/[0.07] bg-black/30 backdrop-blur-xl">
    <div className="marketing-container flex h-20 items-center justify-between gap-6">
      <button onClick={() => navigate(MARKETING_HOME_PATH)} className="flex items-center gap-3 text-left" aria-label="Rizz Master home">
        <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-pink-300/25 bg-gradient-to-br from-pink-500/25 to-purple-500/25 shadow-[0_0_30px_rgba(236,72,153,0.2)]">
          <img src="/logo.png" alt="" className="h-8 w-8 object-contain" />
        </span>
        <span className="font-bold tracking-tight text-white">Rizz <span className="text-pink-300">Master</span></span>
      </button>

      <nav className="hidden items-center gap-7 text-sm text-white/55 md:flex" aria-label="Marketing navigation">
        <a href="/landing#features" onClick={(event) => { event.preventDefault(); navigate('/landing#features'); }} className="transition-colors hover:text-white">Features</a>
        <a href="/landing#how-it-works" onClick={(event) => { event.preventDefault(); navigate('/landing#how-it-works'); }} className="transition-colors hover:text-white">How it works</a>
        <a href="/blog" onClick={(event) => { event.preventDefault(); navigate('/blog'); }} className="transition-colors hover:text-white">Blog</a>
      </nav>

      <PlayStoreButton compact supportText="Free Android app" />
    </div>
  </header>
);

const OFFICIAL_LEGAL_LINKS = [
  { label: 'Google Play Terms', href: 'https://play.google.com/intl/en_us/about/play-terms/index.html' },
  { label: 'Google Play User Data policy', href: 'https://support.google.com/googleplay/android-developer/answer/10144311?hl=en' },
  { label: 'Google Play Data safety', href: 'https://support.google.com/googleplay/android-developer/answer/10787469?hl=en' },
  { label: 'Google Play refunds', href: 'https://support.google.com/googleplay/answer/2479637' }
] as const;

const MarketingFooter: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => (
  <footer className="border-t border-white/[0.08] bg-black/50">
    <div className="marketing-container flex flex-col gap-8 py-10 md:flex-row md:items-center md:justify-between">
      <div>
        <button onClick={() => navigate(MARKETING_HOME_PATH)} className="font-bold tracking-tight text-white">Rizz <span className="text-pink-300">Master</span></button>
        <p className="mt-2 text-xs text-white/35">Built for people who overthink every text.</p>
      </div>
      <div className="flex flex-wrap gap-x-6 gap-y-3 text-xs font-semibold text-white/45">
        <a href="/blog" onClick={(event) => { event.preventDefault(); navigate('/blog'); }} className="transition-colors hover:text-white">Blog</a>
        <a href="/privacy" onClick={(event) => { event.preventDefault(); navigate('/privacy'); }} className="transition-colors hover:text-white">Privacy</a>
        <a href="/terms" onClick={(event) => { event.preventDefault(); navigate('/terms'); }} className="transition-colors hover:text-white">Terms</a>
        <a href="/support" onClick={(event) => { event.preventDefault(); navigate('/support'); }} className="transition-colors hover:text-white">Support</a>
      </div>
      <div className="flex max-w-md flex-wrap gap-x-4 gap-y-2 text-[11px] font-medium text-white/30">
        {OFFICIAL_LEGAL_LINKS.map((link) => <a key={link.href} href={link.href} target="_blank" rel="noreferrer" className="transition-colors hover:text-white/70">{link.label}</a>)}
      </div>
      <p className="text-xs text-white/25">© {new Date().getFullYear()} Rizz Master</p>
    </div>
  </footer>
);

const SectionHeading: React.FC<{ eyebrow: string; title: string; description?: string; align?: 'center' | 'left' }> = ({ eyebrow, title, description, align = 'center' }) => (
  <div className={`${align === 'center' ? 'mx-auto text-center' : 'text-left'} max-w-2xl`}>
    <p className="mb-3 text-xs font-bold uppercase tracking-[0.28em] text-pink-300/80">{eyebrow}</p>
    <h2 className="text-3xl font-black tracking-tight text-white sm:text-4xl md:text-5xl">{title}</h2>
    {description && <p className="mt-5 text-base leading-7 text-white/55">{description}</p>}
  </div>
);

const BlogCard: React.FC<{ post: BlogPost; navigate: (path: string) => void; featured?: boolean }> = ({ post, navigate, featured = false }) => (
  <article className={`marketing-card group relative flex h-full flex-col overflow-hidden p-6 ${featured ? 'md:col-span-2 md:p-8' : ''}`}>
    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-pink-400/80 via-fuchsia-400/45 to-purple-400/80 opacity-70" />
    <div className="mb-7 flex items-center justify-between gap-4 text-[11px] font-bold uppercase tracking-[0.18em] text-white/35">
      <span className="rounded-full border border-pink-300/15 bg-pink-300/[0.07] px-2.5 py-1 text-pink-200/85">{post.category}</span>
      <span>{post.readingTime}</span>
    </div>
    <h3 className={`font-bold leading-tight text-white transition-colors group-hover:text-pink-200 ${featured ? 'text-2xl md:text-3xl' : 'text-xl'}`}>{post.title}</h3>
    <p className="mt-4 flex-1 text-sm leading-6 text-white/50">{post.excerpt}</p>
    <a href={`/blog/${post.slug}`} onClick={(event) => { event.preventDefault(); navigate(`/blog/${post.slug}`); }} className="mt-7 inline-flex items-center gap-2 self-start rounded-full border border-pink-300/15 bg-pink-300/[0.06] px-3 py-2 text-sm font-bold text-pink-200 transition-all group-hover:gap-3">
      Read the guide <span>→</span>
    </a>
  </article>
);

type MessageExample = {
  before: string;
  after: string;
  context: string;
};

const MESSAGE_EXAMPLES: MessageExample[] = [
  {
    before: 'haha',
    after: "Careful, if you keep laughing like that, I'll start thinking I'm charming.",
    context: 'When the chat gives you almost nothing to work with.'
  },
  {
    before: 'what are you doing?',
    after: "Trying to look busy, but clearly getting distracted by you.",
    context: 'A playful answer that keeps the door open.'
  },
  {
    before: 'tell me about yourself',
    after: "I'm the kind of person who says one coffee and somehow turns it into a whole personality.",
    context: 'A profile answer with an easy hook for the next message.'
  }
];

const FEATURE_HIGHLIGHTS = [
  { icon: '✦', title: 'AI Reply Generator', copy: 'Paste the message, choose the vibe, and get thoughtful options that sound ready to send.', accent: 'from-pink-500/20 to-purple-500/10' },
  { icon: '◉', title: 'AI Chat Coach', copy: 'Talk through the whole situation with Rizz AI. Share the context or a screenshot, get the vibe decoded, and find your next move.', accent: 'from-purple-500/20 to-fuchsia-500/10' },
  { icon: '⌁', title: 'Dating Bio Generator', copy: 'Turn your interests, energy, and sense of humor into a profile that sounds like you.', accent: 'from-fuchsia-500/20 to-pink-500/10' }
];

const SECONDARY_FEATURES = ['Pickup lines', 'Tone selection', 'Custom personas', 'Save favorites', 'Daily free credits', 'Premium modes'];

const USE_CASES = [
  ['Tinder replies', 'Turn dry matches into actual conversations.'],
  ['Bumble openers', "Start with something better than 'hey'."],
  ['Instagram DMs', 'Reply without sounding forced.'],
  ['Dating bios', 'Sound confident without sounding fake.'],
  ['First-date follow-ups', 'Keep the energy alive after meeting.'],
  ['What should I text back?', 'Get unstuck when your mind goes blank.']
];

const FloatingHeroChip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="marketing-floating-chip inline-flex items-center gap-2 rounded-full border border-white/15 bg-[#110b16]/90 px-3 py-2 text-[11px] font-bold text-white/80 shadow-[0_14px_34px_rgba(0,0,0,0.3)] backdrop-blur-xl">
    <span className="h-1.5 w-1.5 rounded-full bg-pink-300 shadow-[0_0_10px_rgba(244,114,182,0.95)]" />
    {children}
  </span>
);

const HeroPoster: React.FC = () => (
  <div className="relative mx-auto w-full max-w-[390px] sm:px-8">
    <div className="absolute -inset-8 rounded-[4rem] bg-pink-500/20 blur-3xl" />
    <div className="pointer-events-none absolute -left-8 top-12 z-10 hidden sm:block"><FloatingHeroChip>Flirty</FloatingHeroChip></div>
    <div className="pointer-events-none absolute -right-8 top-28 z-10 hidden sm:block"><FloatingHeroChip>Funny</FloatingHeroChip></div>
    <div className="pointer-events-no￿ێտ󨑩쾚͹￿󻠤isplay: 'flex', alignItems: 'center', gap: '8px' }}>
                                    <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '20px', height: '20px', borderRadius: '6px', background: 'rgba(255,255,255,0.08)' }}>👤</span>
                                    {persona.name}
                                </span>
                                <span onClick={(e) => { e.stopPropagation(); onEditPersona(persona); setShowVibeDropdown(false); }} style={{ opacity: 0.5, padding: '4px' }}>✏️</span>
                            </button>
                        ))}
                        <button
                            onClick={() => { onAddPersona(); setShowVibeDropdown(false); }}
                            style={{
                                display: 'flex', alignItems: 'center', gap: '8px',
                                textAlign: 'left', padding: '10px 12px', background: 'transparent',
                                border: '1px dashed rgba(255,255,255,0.1)', borderRadius: '10px', color: 'rgba(255,255,255,0.5)',
                                fontSize: '13px', fontWeight: 600, cursor: 'pointer', marginTop: '4px'
                            }}
                        >
                            <span>+ Persona</span>
                            {(!isPremium && customPersonas.length === 0) && <span style={{ fontSize: '10px', color: '#facc15' }}>(Free)</span>}
                            {(!isPremium && customPersonas.length >= 1) && <span style={{ fontSize: '10px' }}>🔒</span>}
                        </button>
                    </div>
                )}

                {/* Backdrop handler to close dropdown */}
                {showVibeDropdown && (
                    <div onClick={() => setShowVibeDropdown(false)} style={{ position: 'absolute', inset: 0, zIndex: 90 }} />
                )}

                {/* Messages */}
                <div ref={scrollRef} style={{
                    flex: 1, overflowY: 'auto', position: 'relative', zIndex: 10, padding: '1rem 1.25rem 0',
                    animation: 'coachStaggerIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both',
                    willChange: 'transform, opacity',
                }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', maxWidth: '672px', margin: '0 auto', paddingBottom: '0.5rem' }}>
                        {messages.map((msg, i) => (
                            <MessageBubble
                                key={i}
                                msg={msg}
                                onReport={handleReportMessage}
                                icon={currentTheme.icon}
                                colors={currentTheme.colors}
                            />
                        ))}
                        {loading && <TypingIndicator icon={currentTheme.icon} colors={currentTheme.colors} />}
                    </div>
                </div>

                {/* Input Container Wrapper */}
                <div style={{
                    flexShrink: 0, position: 'relative', zIndex: 10,
                    padding: '0 0 env(safe-area-inset-bottom)',
                    borderTop: '1px solid rgba(255,255,255,0.06)',
                    animation: 'coachStaggerIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) 0.2s both',
                    willChange: 'transform, opacity',
                }}>

                    {/* Quick-Tap Prompts */}
                    {messages.length === 1 && !loading && !image && (
                        <div style={{
                            padding: '10px 16px 8px', display: 'flex', gap: '8px', overflowX: 'auto', maxWidth: '672px', margin: '0 auto',
                            WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none', msOverflowStyle: 'none',
                            animation: 'coachEntrance 0.5s ease-out'
                        }}>
                            {[
                                { text: "She left me on read 📵", icon: "📵" },
                                { text: "She's going cold 🥶", icon: "🥶" },
                                { text: "Help me ask her out 🍷", icon: "🍷" }
                            ].map((prompt, i) => (
                                <button
                                    key={i}
                                    onClick={() => {
                                        if (textareaRef.current) {
                                            textareaRef.current.value = prompt.text;
                                            textareaRef.current.style.height = 'auto';
                                            textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 128) + 'px';
                                            textareaRef.current.focus();
                                        }
                                        setHasContent(true);
                                    }}
                                    style={{
                                        whiteSpace: 'nowrap', padding: '10px 16px', background: 'rgba(255,255,255,0.05)',
                                        border: '1px solid rgba(255,255,255,0.1)', borderRadius: '24px',
                                        color: 'rgba(255,255,255,0.9)', fontSize: '13.5px', fontWeight: 600,
                                        cursor: 'pointer', transition: 'all 0.2s', flexShrink: 0
                                    }}
                                >
                                    {prompt.text}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Image Preview Area */}
                    {image && (
                        <div style={{ padding: '12px 20px 0', display: 'flex' }}>
                            <div style={{ position: 'relative', display: 'inline-block' }}>
                                <img src={image} alt="Upload preview" style={{ height: '70px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.2)', objectFit: 'cover' }} />
                                <button
                                    onClick={() => setImage(null)}
                                    style={{
                                        position: 'absolute', top: '-8px', right: '-8px', width: '24px', height: '24px',
                                        background: 'rgba(0,0,0,0.8)', border: '1px solid rgba(255,255,255,0.2)', padding: 0,
                                        borderRadius: '50%', color: 'white', fontSize: '12px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                        cursor: 'pointer'
                                    }}
                                >✕</button>
                            </div>
                        </div>
                    )}

                    {/* Input Area */}
                    <div style={{ padding: '0px 16px 6px' }}>
                        <div style={{
                            display: 'flex', alignItems: 'flex-end', gap: '8px', maxWidth: '672px', margin: '0 auto',
                            borderRadius: '1.25rem', padding: '8px 8px 8px 16px',
                            background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                        }}>
                            <button
                                onClick={handleImageUpload}
                                style={{
                                    flexShrink: 0, width: '38px', height: '38px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.6)', cursor: 'pointer',
                                    borderRadius: '10px', transition: 'all 0.2s', padding: '0'
                                }}
                                onMouseEnter={e => e.currentTarget.style.color = '#fff'}
                                onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.6)'}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                                </svg>
                            </button>
                            <input type="file" ref={fileInputRef} onChange={handleFileInput} accept="image/*" style={{ display: 'none' }} />

                            <textarea
                                ref={textareaRef}
                                defaultValue=""
                                onChange={handleInputChange}
                                onKeyDown={handleKeyDown}
                                placeholder={image ? "Add context..." : "What's the situation?"}
                                rows={1}
                                disabled={loading}
                                style={{
                                    flex: 1, background: 'transparent', border: 'none', outline: 'none',
                                    color: 'white', fontSize: '15px', lineHeight: 1.6, resize: 'none',
                                    fontFamily: 'inherit', minHeight: '24px', maxHeight: '128px',
                                    opacity: loading ? 0.4 : 1,
                                }}
                            />
                            <button onClick={handleSend} disabled={!canSend} aria-label="Send"
                                style={{
                                    flexShrink: 0, width: '40px', height: '40px', borderRadius: '50%', border: 'none',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    cursor: canSend ? 'pointer' : 'not-allowed', opacity: canSend ? 1 : 0.4,
                                    transition: 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)', paddingLeft: '2px',
                                    transform: canSend ? 'scale(1)' : 'scale(0.9)',
                                    ...(canSend
                                        ? {
                                            background: `linear-gradient(135deg, ${currentTheme.colors.primary}, ${currentTheme.colors.secondary})`,
                                            boxShadow: `0 4px 16px ${currentTheme.colors.glow}`,
                                            animation: 'coachPulseRing 2s infinite'
                                        }
                                        : { background: 'rgba(255,255,255,0.1)' }
                                    )
                                }}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="white">
                                    <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                                </svg>
                            </button>
                        </div>
                    </div>
                </div>

            </div >
        </>
    );
};

export default RizzCoach;
