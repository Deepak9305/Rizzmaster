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
        <a href="/" onClick={(event) => { event.preventDefault(); navigate('/'); }} className="rounded-full border border-pink-300/20 bg-pink-300/[0.08] px-3 py-1.5 text-pink-100 transition-colors hover:border-pink-200/40 hover:bg-pink-300/[0.15]">Open web app</a>
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
        <a href="/" onClick={(event) => { event.preventDefault(); navigate('/'); }} className="font-bold text-pink-200 transition-colors hover:text-white">Open web app</a>
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
    <div className="pointer-events-none absolute -left-12 bottom-32 z-10 hidden sm:block"><FloatingHeroChip>Screenshot analysis</FloatingHeroChip></div>
    <div className="pointer-events-none absolute -right-8 bottom-20 z-10 hidden sm:block"><FloatingHeroChip>Send-ready replies</FloatingHeroChip></div>
    <div className="pointer-events-none absolute -bottom-3 left-0 z-10 hidden max-w-[220px] rounded-2xl border border-pink-300/15 bg-[#110b16]/95 p-3 text-xs leading-5 text-white/70 shadow-[0_18px_45px_rgba(0,0,0,0.4)] backdrop-blur-xl sm:block">
      <p><span className="font-bold text-pink-200">Her:</span> haha</p>
      <p><span className="font-bold text-purple-200">You:</span> Don't laugh too much, I'm trying to look mysterious here.</p>
    </div>
    <img
      src="/rizzmaster-hero-poster.png"
      alt="Rizz Master app poster showing smart replies, custom vibes, and AI-powered dating tools"
      className="marketing-phone relative mx-auto block w-full rounded-[2rem] border border-pink-300/25 shadow-[0_30px_100px_rgba(0,0,0,0.65)]"
      loading="eager"
      decoding="async"
    />
  </div>
);

const MessageExampleCard: React.FC<MessageExample> = ({ before, after, context }) => (
  <article className="marketing-card group relative overflow-hidden p-5 sm:p-6">
    <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-pink-300/60 to-transparent" />
    <p className="text-xs font-bold uppercase tracking-[0.2em] text-white/35">{context}</p>
    <div className="mt-6 space-y-3">
      <div className="flex items-start gap-3">
        <span className="mt-1 shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-white/35">Before</span>
        <div className="rounded-2xl rounded-tl-sm border border-white/10 bg-white/[0.05] px-4 py-3 text-sm text-white/60">{before}</div>
      </div>
      <div className="flex items-start gap-3">
        <span className="mt-1 shrink-0 text-[10px] font-black uppercase tracking-[0.16em] text-pink-200/75">After</span>
        <div className="rounded-2xl rounded-tl-sm border border-pink-300/20 bg-gradient-to-br from-pink-500/15 to-purple-500/10 px-4 py-3 text-sm leading-6 text-white">{after}</div>
      </div>
    </div>
  </article>
);

const FeatureHighlightCard: React.FC<{ icon: string; title: string; copy: string; accent: string }> = ({ icon, title, copy, accent }) => (
  <article className={`marketing-card group relative overflow-hidden bg-gradient-to-br ${accent} p-6 md:p-7`}>
    <div className="absolute -right-10 -top-10 h-28 w-28 rounded-full bg-pink-300/10 blur-3xl" />
    <span className="relative flex h-12 w-12 items-center justify-center rounded-2xl border border-pink-300/20 bg-black/20 text-xl text-pink-100 transition-transform group-hover:scale-110">{icon}</span>
    <h3 className="relative mt-7 text-xl font-black text-white">{title}</h3>
    <p className="relative mt-3 text-sm leading-6 text-white/60">{copy}</p>
    <span className="relative mt-6 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-pink-200/75">Built for the moment <span aria-hidden="true">→</span></span>
  </article>
);

const StickyMobileCta: React.FC = () => {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > Math.min(window.innerHeight * 0.72, 520));
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  if (!visible) return null;

  return (
    <div className="marketing-sticky-cta fixed inset-x-3 bottom-3 z-40 md:hidden">
      <a href={PLAY_STORE_URL} target="_blank" rel="noreferrer" className="marketing-cta-primary flex items-center justify-between gap-4 rounded-2xl border border-pink-200/20 px-4 py-3 text-white shadow-[0_14px_40px_rgba(236,72,153,0.35)]" aria-label="Download Rizz Master from Google Play">
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/20 text-lg" aria-hidden="true">↓</span>
          <span className="min-w-0 text-left"><span className="block truncate text-sm font-black">Download Rizz Master</span><span className="mt-0.5 block text-[10px] font-medium text-white/65">Free daily credits · Android app</span></span>
        </span>
        <span className="shrink-0 text-sm font-black" aria-hidden="true">→</span>
      </a>
    </div>
  );
};

const HomePage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => (
  <>
    <main>
      <section className="marketing-hero relative overflow-hidden">
        <div className="marketing-grid absolute inset-0 opacity-60" />
        <div className="marketing-container relative grid items-center gap-16 pb-20 pt-16 md:grid-cols-[1.05fr_0.95fr] md:pb-28 md:pt-24">
          <div className="relative z-10 max-w-2xl">
            <div className="marketing-kicker mb-6 inline-flex items-center gap-2 rounded-full border border-pink-300/15 bg-pink-300/[0.06] px-3 py-2 text-[11px] font-bold uppercase tracking-[0.2em] text-pink-100/75">
              <span className="h-1.5 w-1.5 rounded-full bg-pink-300 shadow-[0_0_12px_rgba(244,114,182,0.9)]" /> AI dating assistant
            </div>
            <h1 className="max-w-xl text-5xl font-black leading-[0.98] tracking-[-0.06em] text-white sm:text-6xl md:text-7xl">Never run out of <span className="marketing-text-gradient">replies</span> again.</h1>
            <p className="mt-7 max-w-xl text-lg leading-8 text-white/58 md:text-xl">Rizz Master helps you create flirty replies, dating bios, openers, and conversation starters in seconds.</p>
            <div className="mt-9 flex flex-col gap-3 sm:flex-row">
              <PlayStoreButton />
              <a href="/blog" onClick={(event) => { event.preventDefault(); navigate('/blog'); }} className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 py-3.5 text-sm font-bold text-white/75 transition-all hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.08] hover:text-white">Read texting tips <span>→</span></a>
            </div>
            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-white/35">
              <span className="flex items-center gap-2"><span className="text-pink-300">✦</span> Daily free credits</span>
              <span className="flex items-center gap-2"><span className="text-pink-300">✦</span> Your tone, your choice</span>
              <span className="flex items-center gap-2"><span className="text-pink-300">✦</span> Android app</span>
            </div>
          </div>
          <HeroPoster />
        </div>
      </section>

      <section className="marketing-section marketing-container">
        <SectionHeading eyebrow="The blank screen problem" title="You have the feeling. Not the words." description="When the moment matters, a blank typing box can turn one simple text into a full spiral." />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ['01', 'She replied with “haha” and now you’re stuck.', 'Turn a dead-end reply into a natural next move.'],
            ['02', 'Your dating bio sounds boring.', 'Find a sharper way to show your personality.'],
            ['03', 'You do not know how to start the conversation.', 'Get openers that give them something to answer.'],
            ['04', 'You overthink every message before sending it.', 'Choose a tone, get options, and hit send.']
          ].map(([number, title, copy]) => <div key={number} className="marketing-card p-6"><span className="text-xs font-black tracking-[0.2em] text-pink-300/60">{number}</span><h3 className="mt-10 text-lg font-bold leading-snug text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-white/45">{copy}</p></div>)}
        </div>
      </section>

      <section className="marketing-section marketing-container">
        <SectionHeading eyebrow="See the difference in seconds" title="Less staring. More send-ready." description="A small nudge can turn a flat prompt into a reply that sounds like you and gives the conversation somewhere to go." />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">{MESSAGE_EXAMPLES.map((example) => <MessageExampleCard key={example.before} {...example} />)}</div>
      </section>

      <section id="features" className="marketing-section marketing-container scroll-mt-8">
        <SectionHeading eyebrow="More than a one-liner" title="A better way to find your next move" description="From one perfect reply to a full conversation coach, Rizz Master gives you the right kind of help for the moment." />
        <div className="mt-12 grid gap-4 lg:grid-cols-3">{FEATURE_HIGHLIGHTS.map((feature) => <FeatureHighlightCard key={feature.title} {...feature} />)}</div>
        <div className="mt-5 flex flex-wrap gap-3">{SECONDARY_FEATURES.map((feature) => <span key={feature} className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-4 py-2.5 text-sm font-semibold text-white/65"><span className="h-1.5 w-1.5 rounded-full bg-pink-300/80" />{feature}</span>)}</div>
        <div className="hidden">
          {[
            ['✦', 'AI reply generator', 'Paste the message, choose the vibe, and get thoughtful options in seconds.'],
            ['⌁', 'Dating bio generator', 'Turn your interests, energy, and sense of humor into a profile that sounds like you.'],
            ['♡', 'Pickup line generator', 'Start with playful openers that make the next message easier.'],
            ['◌', 'Your tone, your choice', 'Go flirty, funny, wholesome, confident, savage, or romantic.'],
            ['▢', 'Save your favorites', 'Keep the replies that feel right so your best ideas are always close.'],
            ['∞', 'Daily free credits', 'Get useful help every day, with premium modes when you want more range.'],
            ['◎', 'AI Chat Coach', 'Talk through the whole situation with Rizz AI. Share the context or a screenshot, get the vibe decoded, and find your next move.'],
            ['✧', 'Custom personas', 'Create your own advisors with custom instructions—a playful wingman, a direct friend, or the exact voice you need.'],
            ['♛', 'Premium coaching modes', 'Unlock deeper coaching, more tone range, and extra persona space when you want your personal dating assistant to go further.']
          ].map(([icon, title, copy]) => <div key={title} className="marketing-card group p-7"><span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-pink-300/15 bg-pink-300/[0.07] text-xl text-pink-200 transition-transform group-hover:scale-110">{icon}</span><h3 className="mt-6 text-lg font-bold text-white">{title}</h3><p className="mt-3 text-sm leading-6 text-white/48">{copy}</p></div>)}
        </div>
      </section>

      <section id="how-it-works" className="marketing-section marketing-container scroll-mt-8">
        <SectionHeading eyebrow="Three easy steps" title="From overthinking to send-ready" />
        <div className="relative mt-12 grid gap-4 md:grid-cols-3">
          <div className="absolute left-[16%] right-[16%] top-12 hidden h-px bg-gradient-to-r from-pink-500/0 via-pink-300/35 to-purple-500/0 md:block" />
          {[
            ['1', 'Choose what you need', 'Reply, bio, opener, pickup line, or a fresh conversation starter.'],
            ['2', 'Add your situation or message', 'Give Rizz Master the context, even if it is just a few words.'],
            ['3', 'Get better replies instantly', 'Pick the line that feels most like you and make your move.']
          ].map(([number, title, copy]) => <div key={number} className="relative z-10 text-center"><div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-pink-300/25 bg-[#120d17] text-3xl font-black text-pink-200 shadow-[0_0_40px_rgba(236,72,153,0.15)]">{number}</div><h3 className="mt-7 text-lg font-bold text-white">{title}</h3><p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-white/45">{copy}</p></div>)}
        </div>
      </section>

      <section className="marketing-section marketing-container">
        <div className="grid gap-8 rounded-[2rem] border border-white/[0.08] bg-gradient-to-br from-pink-500/[0.08] via-white/[0.02] to-purple-500/[0.07] p-6 md:grid-cols-[0.85fr_1.15fr] md:p-10">
          <div><p className="text-xs font-bold uppercase tracking-[0.25em] text-pink-300/80">Built for real moments</p><h2 className="mt-4 text-3xl font-black tracking-tight text-white md:text-4xl">Your conversation does not need to be perfect.</h2><p className="mt-5 max-w-md text-sm leading-7 text-white/50">It just needs a little momentum. Use Rizz Master when you want a second opinion that is quick, personal, and actually fun to send.</p></div>
          <div className="grid gap-3 sm:grid-cols-2">{USE_CASES.map(([useCase, copy], index) => <div key={useCase} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4"><div className="flex items-center gap-3 text-sm font-semibold text-white/80"><span className="text-xs font-black text-pink-300/80">0{index + 1}</span>{useCase}</div><p className="mt-2 pl-7 text-xs leading-5 text-white/45">{copy}</p></div>)}</div>
          <div className="hidden">
            {['Tinder replies', 'Bumble openers', 'Instagram DM replies', 'Dating app bios', 'First-date follow-ups', '“What should I text back?”'].map((useCase, index) => <div key={useCase} className="rounded-2xl border border-white/10 bg-black/20 px-4 py-4 text-sm font-semibold text-white/70"><span className="mr-3 text-pink-300/80">{['↗', '✦', '◎', '⌁', '♡', '?'][index]}</span>{useCase}</div>)}
          </div>
        </div>
      </section>

      <section className="marketing-container py-8 md:py-12">
        <div className="marketing-trust-band mx-auto flex max-w-4xl flex-col gap-5 rounded-3xl px-6 py-6 md:flex-row md:items-center md:justify-between md:px-8">
          <div className="flex items-start gap-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-pink-300/20 bg-pink-300/[0.08] text-pink-200">✦</span>
            <div>
              <h2 className="text-lg font-bold leading-snug text-white md:text-xl">Designed for faster, better, more confident replies.</h2>
              <p className="mt-1.5 text-sm text-pink-100/45">Built for people who overthink every text.</p>
            </div>
          </div>
          <p className="max-w-sm text-sm leading-6 text-white/45 md:text-right">No fake numbers. No pressure to perform. Just a little help for the moments you want to show up well.</p>
        </div>
      </section>

      <section className="marketing-container pb-24 pt-8 md:pb-32 md:pt-12">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between"><SectionHeading align="left" eyebrow="From the blog" title="A little help for your next text" description="Practical advice for openers, dry replies, profiles, and the moments you replay before hitting send." /><a href="/blog" onClick={(event) => { event.preventDefault(); navigate('/blog'); }} className="self-start whitespace-nowrap text-sm font-bold text-pink-200 transition-colors hover:text-white md:self-end">View all tips →</a></div>
        <div className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">{BLOG_POSTS.slice(0, 6).map((post) => <BlogCard key={post.slug} post={post} navigate={navigate} />)}</div>
      </section>

      <section className="relative overflow-hidden border-y border-white/[0.08] bg-gradient-to-br from-pink-500/10 via-black to-purple-500/10">
        <div className="marketing-container relative py-20 text-center md:py-28"><div className="absolute left-1/2 top-1/2 h-60 w-60 -translate-x-1/2 -translate-y-1/2 rounded-full bg-pink-500/20 blur-[100px]" /><div className="relative"><p className="text-xs font-bold uppercase tracking-[0.25em] text-pink-300/80">Your next message is closer than you think</p><h2 className="mx-auto mt-5 max-w-2xl text-4xl font-black tracking-tight text-white md:text-6xl">Stop staring at the typing box.</h2><p className="mx-auto mt-5 max-w-lg text-base text-white/50">Get better replies with Rizz Master.</p><div className="mt-8"><PlayStoreButton /></div></div></div>
      </section>
    </main>
    <StickyMobileCta />
    <MarketingFooter navigate={navigate} />
  </>
);

const BlogIndexPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => (
  <>
    <main className="marketing-container marketing-page-padding">
      <div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.28em] text-pink-300/80">The Rizz Master blog</p><h1 className="mt-5 text-5xl font-black tracking-[-0.04em] text-white md:text-7xl">Better texts start with a better next move.</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-white/55">Practical texting and dating advice for the conversations you want to handle with a little more confidence.</p></div>
      <div className="mt-16 grid gap-5 md:grid-cols-2">{BLOG_POSTS.map((post, index) => <BlogCard key={post.slug} post={post} navigate={navigate} featured={index === 0} />)}</div>
    </main>
    <MarketingFooter navigate={navigate} />
  </>
);

const ARTICLE_EXAMPLES: Record<string, string[]> = {
  'reply-to-dry-texts': ['That was the diplomatic answer. What is the honest version?', 'I am choosing to believe you are saving the good story for later.'],
  'best-tinder-openers-for-guys': ['Important question: was that hike worth the view or the snack break?', 'You seem like you have a strong coffee order. What am I judging?'],
  'reply-when-she-says-haha': ['I will accept that laugh, but I am keeping score.', 'Okay, your turn - make me laugh.'],
  'funny-pickup-lines-that-work': ['I had a clever opener ready, but your profile distracted me. What is your best recommendation around here?'],
  'best-dating-app-bio-ideas-for-guys': ['Ideal Sunday: long walk, new coffee shop, and pretending I will meal prep.'],
  'what-to-text-after-a-first-date': ['I had a great time tonight - your story about the failed cooking class still has me laughing.']
};

const ARTICLE_DO_DONT: Record<string, { do: string; doNot: string }> = {
  'reply-to-dry-texts': { do: 'Offer one specific hook, then give the conversation room.', doNot: 'Stack questions or send three follow-ups to force momentum.' },
  'best-tinder-openers-for-guys': { do: 'Notice one real detail and ask a question with a point of view.', doNot: 'Lead with a generic compliment or an interview question.' },
  'reply-when-she-says-haha': { do: 'Stay playful and pivot toward a topic with personality.', doNot: 'Ask whether the joke was funny or chase validation.' },
  'funny-pickup-lines-that-work': { do: 'Use the line as a soft launch into a real conversation.', doNot: 'Treat the opener like a performance that needs a sequel.' },
  'best-dating-app-bio-ideas-for-guys': { do: 'Share specific details that make the next message obvious.', doNot: 'Fill the bio with broad labels, rules, or complaints.' },
  'what-to-text-after-a-first-date': { do: 'Be timely, specific, and clear about enjoying the date.', doNot: 'Wait for a perfect paragraph or edit your personality away.' }
};

const ArticleQuickAnswer: React.FC<{ post: BlogPost }> = ({ post }) => (
  <aside className="relative overflow-hidden rounded-3xl border border-pink-300/20 bg-gradient-to-br from-pink-500/12 via-white/[0.03] to-purple-500/10 p-6 md:p-7">
    <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full bg-pink-400/15 blur-3xl" />
    <p className="relative text-xs font-black uppercase tracking-[0.2em] text-pink-200/80">Quick answer</p>
    <p className="relative mt-3 text-base leading-7 text-white/75">{post.excerpt}</p>
  </aside>
);

const ArticleExampleBox: React.FC<{ examples?: string[] }> = ({ examples }) => {
  if (!examples?.length) return null;

  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 md:p-6">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-200/75">Try a reply like this</p>
      <div className="mt-4 space-y-3">
        {examples.map((example) => <div key={example} className="rounded-2xl rounded-tl-sm border border-pink-300/15 bg-pink-300/[0.06] px-4 py-3 text-sm leading-6 text-white/80">{example}</div>)}
      </div>
    </div>
  );
};

const ArticleDoDont: React.FC<{ post: BlogPost }> = ({ post }) => {
  const tips = ARTICLE_DO_DONT[post.slug];
  if (!tips) return null;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-emerald-300/15 bg-emerald-300/[0.05] p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-200/80">Do</p><p className="mt-3 text-sm leading-6 text-white/70">{tips.do}</p></div>
      <div className="rounded-2xl border border-rose-300/15 bg-rose-300/[0.05] p-5"><p className="text-xs font-black uppercase tracking-[0.2em] text-rose-200/80">Don't</p><p className="mt-3 text-sm leading-6 text-white/70">{tips.doNot}</p></div>
    </div>
  );
};

const RelatedPosts: React.FC<{ post: BlogPost; navigate: (path: string) => void }> = ({ post, navigate }) => {
  const relatedPosts = BLOG_POSTS.filter((candidate) => candidate.slug !== post.slug).slice(0, 3);

  return (
    <section className="mt-20 border-t border-white/10 pt-12">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-200/75">Keep reading</p>
      <h2 className="mt-3 text-2xl font-black text-white md:text-3xl">More help for your next text</h2>
      <div className="mt-7 grid gap-4 md:grid-cols-3">{relatedPosts.map((related) => <BlogCard key={related.slug} post={related} navigate={navigate} />)}</div>
    </section>
  );
};

const ARTICLE_INTERNAL_LINKS: Record<string, Array<{ slug: string; label: string }>> = {
  'reply-to-dry-texts': [
    { slug: 'reply-when-she-says-haha', label: 'How to reply when she says haha' },
    { slug: 'best-tinder-openers-for-guys', label: 'Better Tinder openers' },
    { slug: 'what-to-text-after-a-first-date', label: 'What to text after a first date' }
  ],
  'best-tinder-openers-for-guys': [
    { slug: 'funny-pickup-lines-that-work', label: 'Funny pickup lines that work' },
    { slug: 'best-dating-app-bio-ideas-for-guys', label: 'Dating app bio ideas' },
    { slug: 'reply-to-dry-texts', label: 'How to reply to dry texts' }
  ],
  'reply-when-she-says-haha': [
    { slug: 'reply-to-dry-texts', label: 'How to handle a dry text' },
    { slug: 'funny-pickup-lines-that-work', label: 'Funny conversation starters' },
    { slug: 'what-to-text-after-a-first-date', label: 'Post-date texting advice' }
  ],
  'funny-pickup-lines-that-work': [
    { slug: 'best-tinder-openers-for-guys', label: 'Best Tinder openers' },
    { slug: 'reply-when-she-says-haha', label: 'What to say after a laugh' },
    { slug: 'best-dating-app-bio-ideas-for-guys', label: 'Write a better dating bio' }
  ],
  'best-dating-app-bio-ideas-for-guys': [
    { slug: 'best-tinder-openers-for-guys', label: 'Openers that start conversations' },
    { slug: 'funny-pickup-lines-that-work', label: 'Playful pickup lines' },
    { slug: 'what-to-text-after-a-first-date', label: 'What to text after a date' }
  ],
  'what-to-text-after-a-first-date': [
    { slug: 'reply-to-dry-texts', label: 'Reply to a short message' },
    { slug: 'reply-when-she-says-haha', label: 'Keep a playful chat moving' },
    { slug: 'best-dating-app-bio-ideas-for-guys', label: 'Refresh your dating profile' }
  ]
};

const ArticleInternalLinks: React.FC<{ post: BlogPost; navigate: (path: string) => void }> = ({ post, navigate }) => (
  <nav aria-label="Related dating guides" className="rounded-3xl border border-white/10 bg-white/[0.03] p-5 md:p-6">
    <p className="text-xs font-black uppercase tracking-[0.2em] text-pink-200/75">Continue reading</p>
    <div className="mt-4 flex flex-wrap gap-2.5">
      {(ARTICLE_INTERNAL_LINKS[post.slug] || []).map((link) => <a key={link.slug} href={`/blog/${link.slug}`} onClick={(event) => { event.preventDefault(); navigate(`/blog/${link.slug}`); }} className="rounded-full border border-white/10 bg-black/20 px-3.5 py-2 text-xs font-bold text-white/65 transition-colors hover:border-pink-300/30 hover:text-pink-100">{link.label} <span aria-hidden="true">→</span></a>)}
    </div>
  </nav>
);

const ArticlePage: React.FC<{ post: BlogPost; navigate: (path: string) => void }> = ({ post, navigate }) => {
  const middleIndex = Math.ceil(post.sections.length / 2);

  return <>
    <main className="marketing-container marketing-page-padding">
      <a href="/blog" onClick={(event) => { event.preventDefault(); navigate('/blog'); }} className="mb-10 inline-flex items-center gap-2 text-sm font-bold text-white/45 transition-colors hover:text-white">← Back to the blog</a>
      <article className="mx-auto max-w-3xl">
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold uppercase tracking-[0.18em] text-white/35"><span className="text-pink-300/80">{post.category}</span><span>•</span><span>{post.readingTime}</span><span>•</span><time dateTime={post.date}>{new Date(`${post.date}T12:00:00`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</time></div>
        <h1 className="mt-6 text-4xl font-black leading-[1.05] tracking-[-0.04em] text-white md:text-6xl">{post.title}</h1>
        <p className="mt-7 text-lg leading-8 text-white/55">{post.description}</p>
        <div className="mt-10 space-y-5">
          <ArticleQuickAnswer post={post} />
          <ArticleExampleBox examples={ARTICLE_EXAMPLES[post.slug]} />
          <ArticleDoDont post={post} />
          <ArticleInternalLinks post={post} navigate={navigate} />
        </div>
        <div className="mt-12 space-y-12">
          {post.sections.map((section, index) => <React.Fragment key={section.heading}>
            {index === middleIndex && <ArticleCta navigate={navigate} compact />}
            <section><h2 className="text-2xl font-bold tracking-tight text-white md:text-3xl">{section.heading}</h2>{section.paragraphs.map((paragraph) => <p key={paragraph} className="mt-5 text-base leading-8 text-white/60">{paragraph}</p>)}{section.bullets && <ul className="mt-6 space-y-3 rounded-2xl border border-pink-300/10 bg-pink-300/[0.04] p-5 text-sm leading-7 text-white/65">{section.bullets.map((bullet) => <li key={bullet} className="flex gap-3"><span className="mt-1 text-pink-300">✦</span><span>{bullet}</span></li>)}</ul>}</section>
          </React.Fragment>)}
        </div>
        <ArticleCta navigate={navigate} />
        <RelatedPosts post={post} navigate={navigate} />
      </article>
    </main>
    <MarketingFooter navigate={navigate} />
  </>;
};

const ArticleCta: React.FC<{ navigate: (path: string) => void; compact?: boolean }> = ({ navigate, compact = false }) => <div className={`relative overflow-hidden rounded-3xl border border-pink-300/15 bg-gradient-to-br from-pink-500/15 to-purple-500/10 ${compact ? 'my-2 p-6' : 'mt-16 p-7 md:p-9'}`}><div className="absolute -right-12 -top-12 h-32 w-32 rounded-full bg-pink-400/20 blur-3xl" /><p className="relative text-xs font-bold uppercase tracking-[0.22em] text-pink-200/75">Need a second opinion?</p><h2 className="relative mt-3 text-2xl font-bold text-white">Turn the situation into a send-ready reply.</h2><p className="relative mt-3 max-w-xl text-sm leading-6 text-white/50">Rizz Master helps you find the right words without losing your personality.</p><div className="relative mt-6 flex flex-col gap-3 sm:flex-row"><PlayStoreButton /><button onClick={() => navigate('/')} className="rounded-2xl px-5 py-3.5 text-sm font-bold text-white/60 transition-colors hover:text-white">Open web app</button></div></div>;

const LegalPage: React.FC<{ kind: 'privacy' | 'terms' | 'support'; navigate: (path: string) => void }> = ({ kind, navigate }) => {
  const content = {
    privacy: { eyebrow: 'Your data matters', title: 'Privacy Policy', intro: 'Rizz Master is built to help with everyday conversations while keeping data collection focused on running the product.', sections: [['What we collect', 'We may process account details, saved items, profile preferences, purchase state, and the text or image context you choose to submit for generation. We only use this information to provide, secure, and improve the service.'], ['Generated content', 'Inputs are processed to generate responses. Only items you explicitly save are intended to remain in your account history. Review the full hosted policy linked below for the current details.'], ['Your choices', 'You can request account help, data questions, or deletion through Support.']], link: LEGAL_LINKS.privacy },
    terms: { eyebrow: 'Use it thoughtfully', title: 'Terms of Service', intro: 'Rizz Master is an AI dating assistant for entertainment and communication support—not a substitute for your judgment.', sections: [['Using the service', 'You are responsible for the messages you send and the way you use AI-generated suggestions. Content may be imperfect, so review it before sharing.'], ['Respectful conduct', 'Do not use the service to create harmful, illegal, abusive, or harassing content. Access may be limited when the service is misused.'], ['Purchases', 'Premium features and subscriptions are managed through the Google Play Store.']], link: LEGAL_LINKS.terms },
    support: { eyebrow: 'We are here to help', title: 'Support Center', intro: 'Questions about credits, subscriptions, account access, or a feature idea? Send us a note and we will help you find the next step.', sections: [['Contact support', 'Email rizzmasterhelpteam@gmail.com for bugs, billing questions, account deletion requests, or general help.'], ['Credits and Premium', 'Free credits reset daily. Premium access and subscription cancellation are managed through Google Play.'], ['Account deletion', 'Email support from the address connected to your account and include “Delete my account” in the subject.']], link: LEGAL_LINKS.supportEmail },
  }[kind];
  return <>
    <main className="marketing-container marketing-page-padding"><button onClick={() => navigate(MARKETING_HOME_PATH)} className="mb-10 inline-flex items-center gap-2 text-sm font-bold text-white/45 transition-colors hover:text-white">← Back home</button><div className="max-w-3xl"><p className="text-xs font-bold uppercase tracking-[0.28em] text-pink-300/80">{content.eyebrow}</p><h1 className="mt-5 text-5xl font-black tracking-[-0.04em] text-white md:text-7xl">{content.title}</h1><p className="mt-6 text-lg leading-8 text-white/55">{content.intro}</p></div><div className="mt-12 max-w-3xl space-y-5">{content.sections.map(([heading, copy]) => <section key={heading} className="marketing-card p-6 md:p-8"><h2 className="text-xl font-bold text-white">{heading}</h2><p className="mt-3 text-sm leading-7 text-white/55">{copy}</p></section>)}</div><a href={content.link} target={kind === 'support' ? undefined : '_blank'} rel={kind === 'support' ? undefined : 'noreferrer'} className="mt-8 inline-flex rounded-2xl border border-white/15 bg-white/[0.05] px-5 py-3.5 text-sm font-bold text-white transition-colors hover:bg-white/10">{kind === 'support' ? 'Email support' : 'Read the full policy →'}</a></main><MarketingFooter navigate={navigate} />
  </>;
};

const NotFoundPage: React.FC<{ navigate: (path: string) => void }> = ({ navigate }) => <main className="marketing-container marketing-page-padding"><p className="text-xs font-bold uppercase tracking-[0.28em] text-pink-300/80">404</p><h1 className="mt-5 text-5xl font-black text-white">That page ghosted you.</h1><p className="mt-5 text-white/55">Let’s get you back to the good part.</p><button onClick={() => navigate(MARKETING_HOME_PATH)} className="marketing-cta-primary mt-8 rounded-2xl px-5 py-3.5 text-sm font-bold text-white">Back home →</button></main>;

const MarketingSite: React.FC<{ onNavigateToPath?: (path: string) => void }> = ({ onNavigateToPath }) => {
  const [pathname, setPathname] = useState(() => typeof window === 'undefined' ? '/' : window.location.pathname);
  const route = useMemo(() => getRoute(pathname), [pathname]);

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  useEffect(() => {
    updateSeo(route);
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [route]);

  const navigate = (path: string) => {
    if (onNavigateToPath) {
      onNavigateToPath(path);
      return;
    }

    const [pathnamePart, hash] = path.split('#');
    const nextPath = pathnamePart || '/';
    window.history.pushState({}, '', `${nextPath}${hash ? `#${hash}` : ''}`);
    setPathname(nextPath);
    window.setTimeout(() => {
      if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: 'smooth' });
      else window.scrollTo({ top: 0, behavior: 'auto' });
    }, 0);
  };

  const article = route.kind === 'article' ? getBlogPost(route.slug) : undefined;

  return <div className="marketing-site min-h-screen overflow-x-hidden bg-[#050407] text-white"><MarketingNav navigate={navigate} />{route.kind === 'home' ? <HomePage navigate={navigate} /> : route.kind === 'blog' ? <BlogIndexPage navigate={navigate} /> : article ? <ArticlePage post={article} navigate={navigate} /> : route.kind === 'privacy' || route.kind === 'terms' || route.kind === 'support' ? <LegalPage kind={route.kind} navigate={navigate} /> : <><NotFoundPage navigate={navigate} /><MarketingFooter navigate={navigate} /></>}</div>;
};

export default MarketingSite;
