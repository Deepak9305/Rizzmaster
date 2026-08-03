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
    <div className="pointer-events-none absolute -left-12 bott￿͹֚$z{-Ωܪם�^H^Yݛ[و]۝ݘ\وHܚXȝڝ\ܛۘ[]KɋӛݎȉМڈڙ]\ȝHۚو؜șݛ۞H܈ژ\و؛Y][ۋɈKȈ	ٝ[۞K\Xڝ\[[ٜ˝]]ۜډΈșΈ	՜وH[و\ȘH݈ۙ][ؚ[ݛȘH٘[ۛݙ\ܘ][ۋɋӛݎȉ՜٘]Hܙ[ٜțZوH\ٛܛX[ؙH]ٙYȘHٜ]Y[ɈKȈ	ؙ\݋Y][ًX\Xڛ˚YX\˙ۜ˙ݞ\ɎȞșΈ	Ԛ\وܙXڙژș]Z[ȝ]XZوHٞY\ܘYو؝ڛݜˉˈӛݎȉњ[HڛȝڝܛؙXٛˈݛ\ˈ܈ۛ\Z[ݜˉȟKȈ	ݚ]]˝^XYݙ\˘KYڜܝY]IΈșΈ	ЙH[Y[KܙXڙژˈ[وۙX\ȘX۝][ڛޚ[وH]Kɋӛݎȉ՘Z]ۜȘH\ٙX݈\ؙܘ\܈Y][ݜȜ\ܛۘ[]H]؞KɈBߎ؛݈ۜ\ݚXۙT]ZXڐ[ܝٜΈ٘X݋ѐϞȜܝȐۛٔܝOȏH
ȜܝJHOȊȈ\ڙHۘ\ܓ؛YOHܙ[]]وݙ\ٛ݋ZY[Ȝ۝[ٙYLޛۜٙ\Șۜٙ\˜[ڋĽ̌ًYܘYY[݋]˘܈ܛۋ\[ڋML̌ȝژK]ښ]K֌̌׈˜\ܛKML̌MțY܋Mȏ]Șۘ\ܓ؛YOHؘܛ۝]H\ڙڝLL]܋LLL̈ˌ̈۝[ٙYYݛً\[ڋM̍H۝\ˌޛȋςȈۘ\ܓ؛YOHܙ[]]و^^șۛ݋XۘXڈ\\ؘ\وؘښ[ًV̙̋[WH^\[ڋĽΌϔ]ZXڈ[ܝٜϋ܏ۘ\ܓ؛YOHܙ[]]و]Lȝ^X؜وXY[ًMȝ^]ښ]K͍HϞܛܝٞٜܝO܏؜ڙON؛݈ۜ\ݚXۙQ^[\P۞Ȕ٘X݋ѐϞș^[\\ώȜݜڛٖ׈OȏH
ș^[\\ȟJHOȞYȊY^[\\ϋۙ[ٝ
Hٝ\ۈݛȈٝ\ۈ
Ȉ]Șۘ\ܓ؛YOHܛݛٙYLޛۜٙ\Șۜٙ\˝ښ]Ǩً]ښ]K֌̌͗HMHY܋Mȏۘ\ܓ؛YOHݙ^^șۛ݋XۘXڈ\\ؘ\وؘښ[ًV̙̋[WH^\[ڋĽ͍HϕވHٜHZو\ϋ܏]Șۘ\ܓ؛YOH۝MܘXً^KLȏٞ[\\˛X\

^[\JHOȏ]ȚٞO^ٞ[\_Hۘ\ܓ؛YOHܛݛٙYLޛ۝[ٙY]\ۈۜٙ\Șۜٙ\˜[ڋĽ̍Hً\[ڋĽ֌̍׈MKLȝ^\ۈXY[ًMȝ^]ښ]KΌϞٞ[\_Oٚ]ϊ_BȈٚ]ςȈٚ]ςȈ
NN؛݈ۜ\ݚXۙQћ۝Ȕ٘X݋ѐϞȜܝȐۛٔܝOȏH
ȜܝJHOȞۛܝ\ȏHTՒPӑWѓבӕܛܝܛY׎YȊ]\ʈٝ\ۈݛȈٝ\ۈ
Ȉ]Șۘ\ܓ؛YOHٜڙ؜LȜێٜڙXۛˌȏ]Șۘ\ܓ؛YOHܛݛٙYLޛۜٙ\Șۜٙ\˙[Y\؛Ľ̍HًY[Y\؛Ľ֌̍WHMHϏۘ\ܓ؛YOHݙ^^șۛ݋XۘXڈ\\ؘ\وؘښ[ًV̙̋[WH^Y[Y\؛ĽΌϑϋ܏Ϝۘ\ܓ؛YOH۝Lȝ^\ۈXY[ًMȝ^]ښ]K͌Ϟݚ\˙ߏ܏ϋٚ]ςȈ]Șۘ\ܓ؛YOHܛݛٙYLޛۜٙ\Șۜٙ\˜ًۜĽ̍Hً\ًۜĽ֌̍WHMHϏۘ\ܓ؛YOHݙ^^șۛ݋XۘXڈ\\ؘ\وؘښ[ًV̙̋[WH^\ًۜĽΌϑۉݏ܏Ϝۘ\ܓ؛YOH۝Lȝ^\ۈXY[ًMȝ^]ښ]K͌Ϟݚ\˙ӛݟO܏ϋٚ]ςȈٚ]ςȈ
NN؛݈ۜٛ]YܝΈ٘X݋ѐϞȜܝȐۛٔܝț؝ڙ؝NȊ]ȜݜڛيHOȝۚYOȏH
Ȝܝ؝ڙ؝HJHOȞۛܝٛ]YܝȏHӓїԓԕ˙ڛ\ʊ؛ٚY]JHOȘ؛ٚY]KܛYȈOOHܝܛYʋܛXيʎȈٝ\ۈ
Ȉ٘ݚ[ۈۘ\ܓ؛YOH۝L̈ۜٙ\˝ۜٙ\˝ښ]ǨLLȏۘ\ܓ؛YOHݙ^^șۛ݋XۘXڈ\\ؘ\وؘښ[ًV̙̋[WH^\[ڋĽ͍Hϒٙ\٘Y[ُ܏Șۘ\ܓ؛YOH۝Lȝ^Lޛۛ݋XۘXڈ^]ښ]HYݙ^Lޛϓ[ܙH[ۜȞ[ݜțٞ^ڌςȈ]Șۘ\ܓ؛YOH۝MșܚY؜MYٜڙXۛˌȏޜٛ]Yܝ˛X\

ٛ]Y
HOȏِۛ؜وٞO^ܙ[]YܛY߈ܝ^ܙ[]YH؝ڙ؝O^ۘ]ڙ؝_Hϊ_Oٚ]ςȈܙXݚ[ۏ
NN؛݈ۜTՒPӑWғՑTӐSӒSҔΈُ٘ۜݜڛً\ܘ^OȜ۝YΈݜڛَțXٛȜݜڛوOψH	ܙ\K]˙ދ]^ɎȖȜ۝YΈ	ܙ\K]ڙ[˜ڙK\؞\˚ZIˈXٛȉқ݈ȜٜHڙ[ȜڙH؞\ȚZIȟKȈȜ۝YΈ	ؙ\݋][ٙ\˛ܙ[ٜ܋Yۜ˙ݞ\ɋXٛȉЙ]\ȕ[ٙ\țܙ[ٜ܉ȟKȈȜ۝YΈ	ݚ]]˝^XYݙ\˘KYڜܝY]IˈXٛȉ՚]ȝ^Yݙ\ȘHڜܝ]IȟBȈKȈ	ؙ\݋][ٙ\˛ܙ[ٜ܋Yۜ˙ݞ\ɎȖȜ۝YΈ	ٝ[۞K\Xڝ\[[ٜ˝]]ۜډˈXٛȉѝ[۞HXڝ\[ٜȝ]ۜډȟKȈȜ۝YΈ	ؙ\݋Y][ًX\Xڛ˚YX\˙ۜ˙ݞ\ɋXٛȉј][و\ڛȚYX\ɈKȈȜ۝YΈ	ܙ\K]˙ދ]^ɋXٛȉқ݈ȜٜHșވ^ɈBȈKȈ	ܙ\K]ڙ[˜ڙK\؞\˚ZIΈȜ۝YΈ	ܙ\K]˙ދ]^ɋXٛȉқ݈Ț[ٛHHވ^	ȟKȈȜ۝YΈ	ٝ[۞K\Xڝ\[[ٜ˝]]ۜډˈXٛȉѝ[۞Hۛݙ\ܘ][ۈݘ\ݙ\܉ȟKȈȜ۝YΈ	ݚ]]˝^XYݙ\˘KYڜܝY]IˈXٛȉԛܝY]H^[وYژىȟBȈKȈ	ٝ[۞K\Xڝ\[[ٜ˝]]ۜډΈȜ۝YΈ	ؙ\݋][ٙ\˛ܙ[ٜ܋Yۜ˙ݞ\ɋXٛȉЙ\݈[ٙ\țܙ[ٜ܉ȟKȈȜ۝YΈ	ܙ\K]ڙ[˜ڙK\؞\˚ZIˈXٛȉ՚]Ȝ؞HYݙ\ȘH]YډȟKȈȜ۝YΈ	ؙ\݋Y][ًX\Xڛ˚YX\˙ۜ˙ݞ\ɋXٛȉ՜ڝHHٝ\ș][وڛɈBȈKȈ	ؙ\݋Y][ًX\Xڛ˚YX\˙ۜ˙ݞ\ɎȖȜ۝YΈ	ؙ\݋][ٙ\˛ܙ[ٜ܋Yۜ˙ݞ\ɋXٛȉӜ[ٜ܈]ݘ\݈ۛݙ\ܘ][ۜɈKȈȜ۝YΈ	ٝ[۞K\Xڝ\[[ٜ˝]]ۜډˈXٛȉԛ^YݛXڝ\[ٜɈKȈȜ۝YΈ	ݚ]]˝^XYݙ\˘KYڜܝY]IˈXٛȉ՚]ȝ^Yݙ\ȘH]IȟBȈKȈ	ݚ]]˝^XYݙ\˘KYڜܝY]IΈȜ۝YΈ	ܙ\K]˙ދ]^ɋXٛȉԙ\HȘHڛܝY\ܘYىȟKȈȜ۝YΈ	ܙ\K]ڙ[˜ڙK\؞\˚ZIˈXٛȉҙY\H^Yݛژ][ݚ[ىȟKȈȜ۝YΈ	ؙ\݋Y][ًX\Xڛ˚YX\˙ۜ˙ݞ\ɋXٛȉԙYܙ\ڈ[ݜș][وۙڛIȟBȈBߎ؛݈ۜ\ݚXۙR[ݙ\ۘ[[ڜΈ٘X݋ѐϞȜܝȐۛٔܝț؝ڙ؝NȊ]ȜݜڛيHOȝۚYOȏH
Ȝܝ؝ڙ؝HJHOȊȈ؝Ș\ژK[XٛHԙ[]Y][وݚY\Ȉۘ\ܓ؛YOHܛݛٙYLޛۜٙ\Șۜٙ\˝ښ]Ǩً]ښ]K֌̌׈MHY܋Mȏۘ\ܓ؛YOHݙ^^șۛ݋XۘXڈ\\ؘ\وؘښ[ًV̙̋[WH^\[ڋĽ͍Hϐۛݚ[ݙH٘Y[ُ܏]Șۘ\ܓ؛YOH۝Mۙ^ۙ^]ܘ\؜LˍHςȈʐTՒPӑWғՑTӐSӒSҔ֜ܝܛY׈׊Kۘ\

[ڊHOȏHٞO^ۚ[ڋܛY߈ٙϞ؋؛ًɞۚ[ڋܛYߘHېۚXڏ^ʙ]ٛ݊HOȞș]ٛ݋ܜٝٛݑY؝[

Nț؝ڙ؝J؛ًɞۚ[ڋܛYߘ
Nȟ_Hۘ\ܓ؛YOHܛݛٙYYݛۜٙ\Șۜٙ\˝ښ]ǨًXۘXڋ̌LˍHKLȝ^^șۛ݋Xۛ^]ښ]K͍H؛ܚ][ۋXۛܜȚݙ\Θۜٙ\˜[ڋĽ̌ݙ\Ν^\[ڋLLϞۚ[ڋۘXٛHܘ[Ș\ژKZY[ψݜݙHϸdϋܜ[Ϗ؏ʟBȈٚ]ςȈۘ]ςʎ؛݈ۜ\ݚXۙTYَȔ٘X݋ѐϞȜܝȐۛٔܝț؝ڙ؝NȊ]ȜݜڛيHOȝۚYOȏH
Ȝܝ؝ڙ؝HJHOȞۛܝZYR[ٙ^HX]ؙZ[
ܝܙXݚ[ۜ˛[ٝȌʎȈٝ\ۈXZ[Șۘ\ܓ؛YOHۘ\ڙ][ًXۛݘZ[ٜțX\ڙ][ً\Yً\Y[وςȈHٙψ˘ۛوțېۚXڏ^ʙ]ٛ݊HOȞș]ٛ݋ܜٝٛݑY؝[

Nț؝ڙ؝J	˘ۛىʎȟ_Hۘ\ܓ؛YOHۘˌL[ۚ[ًYۙ^][\˘ٛݙ\ș؜Lȝ^\ۈۛ݋Xۛ^]ښ]K͍H؛ܚ][ۋXۛܜȚݙ\Ν^]ښ]HϸdؘڈȝHُۛ؏\ݚXۙHۘ\ܓ؛YOH۞X]]țX^]ˌޛςȈ]Șۘ\ܓ؛YOHٛ^ۙ^]ܘ\][\˘ٛݙ\ș؜Lȝ^^șۛ݋Xۛ\\ؘ\وؘښ[ًV̋̎[WH^]ښ]K̍HϏܘ[Șۘ\ܓ؛YOHݙ^\[ڋĽΌϞܛܝؘ]YۜޟOܜ[Ϗܘ[ϸ(ϋܜ[Ϗܘ[ϞܛܝܙXY[ٕ[Y_Oܜ[Ϗܘ[ϸ(ϋܜ[Ϗ[YH]U[YO^ܛܝ٘]_Oޛٝȑ]J	ܛܝ٘]_ULΌ̌
Kݛӛؘ[Q]Tݜڛي	ٛ˕Tɋț[۝ȉۛۙɋ^Nȉ۝[Y\ژɋYX\Έ	۝[Y\ژɈJ_Oݚ[YOϋٚ]ςȈHۘ\ܓ؛YOH۝Mȝ^Mۛ݋XۘXڈXY[ًV̋̍WHؘښ[ًVˌ̍[WH^]ښ]HYݙ^MޛϞܛܝݚ]_OڌOۘ\ܓ؛YOH۝Mȝ^[țXY[ًN^]ښ]K͍HϞܛܝٙ\؜ڜ[۟O܏]Șۘ\ܓ؛YOH۝LLܘXً^KMHςȈ\ݚXۙT]ZXڐ[ܝٜȜܝ^ܛܝHςȈ\ݚXۙQ^[\P۞^[\\ϞДՒPӑWіSTT֜ܝܛYןHςȈ\ݚXۙQћ۝ܝ^ܛܝHςȈ\ݚXۙR[ݙ\ۘ[[ڜȜܝ^ܛܝH؝ڙ؝O^ۘ]ڙ؝_HςȈٚ]ςȈ]Șۘ\ܓ؛YOH۝LLȜܘXً^KLLȏܛܝܙXݚ[ۜ˛X\

٘ݚ[ۋ[ٙ^
HOȏ٘X݋ќؙۙ[݈ٞO^ܙXݚ[ۋڙXY[ٟOڛٙ^OOHZYR[ٙ^	Ɉ\ݚXۙPݘH؝ڙ؝O^ۘ]ڙ؝_Hۛ\X݈ϟBȈ٘ݚ[ۏϚȘۘ\ܓ؛YOHݙ^Lޛۛ݋Xۛؘښ[ً]Yڝ^]ښ]HYݙ^LޛϞܙXݚ[ۋڙXY[ٟOڌϞܙXݚ[ۋܘ\ؙܘ\˛X\

\ؙܘ\
HOȏٞO^ܘ\ؙܘ\Hۘ\ܓ؛YOH۝MH^X؜وXY[ًN^]ښ]K͌Ϟܘ\ؙܘ\O܏ʟ^ܙXݚ[ۋ؝[]ȉɈ[ۘ\ܓ؛YOH۝MȜܘXً^KLȜ۝[ٙYLޛۜٙ\Șۜٙ\˜[ڋĽ̌ً\[ڋĽ֌̍HMH^\ۈXY[ًMȝ^]ښ]K͍HϞܙXݚ[ۋ؝[]˛X\

ݛ]
HOȏHٞO^؝[]Hۘ\ܓ؛YOHٛ^؜LȏϜܘ[Șۘ\ܓ؛YOH۝LH^\[ڋĽϸǩϋܜ[Ϗܘ[Ϟ؝[]Oܜ[ϏۚOʟOݛߏܙXݚ[ۏԙXX݋ќؙۙ[ݏʟBȈٚ]ςȈ\ݚXۙPݘH؝ڙ؝O^ۘ]ڙ؝_HςȈٛ]YܝȜܝ^ܛܝH؝ڙ؝O^ۘ]ڙ؝_HςȈ؜ݚXۙOۘZ[ςȈX\ڙ][ّۛݙ\ț؝ڙ؝O^ۘ]ڙ؝_HςȈώN؛݈ۜ\ݚXۙPݘNȔ٘X݋ѐϞț؝ڙ؝NȊ]ȜݜڛيHOȝۚYȘۛ\XݏΈۛۙX[ȟOȏH
ț؝ڙ؝Kۛ\X݈H؛وJHOȏ]Șۘ\ܓ؛YO^؜ٛ]]وݙ\ٛ݋ZY[Ȝ۝[ٙYLޛۜٙ\Șۜٙ\˜[ڋĽ̍HًYܘYY[݋]˘܈ܛۋ\[ڋML̍H˜\ܛKML̌	؛ۜX݈ȉ۞KLȜMɈȉ۝LMȜMțY܋NIߘOϙ]Șۘ\ܓ؛YOHؘܛ۝]H\ڙڝLLȋ]܋LLȚL̈ˌ̈۝[ٙYYݛً\[ڋM̌۝\ˌޛȋϏۘ\ܓ؛YOHܙ[]]و^^șۛ݋Xۛ\\ؘ\وؘښ[ًV̋̌ٛWH^\[ڋĽ͍HϓٙYH٘ۛوܚ[ڛۏϋ܏ϚȘۘ\ܓ؛YOHܙ[]]و]Lȝ^Lޛۛ݋Xۛ^]ښ]Hϕ\ۈHڝX][ۈ[ݛȘHًٛ\٘YHٜKϋڌϏۘ\ܓ؛YOHܙ[]]و]LțX^]˞^\ۈXY[ًMȝ^]ښ]K͌ϔڞވX\ݙ\Ț[Ȟ[݈ڛوHڙڝٜۜȝڝݝܚ[و[ݜȜ\ܛۘ[]Kϋ܏ϙ]Șۘ\ܓ؛YOHܙ[]]و]Mșۙ^ۙ^Xۛ؜LȜێٛ^\۝ȏϔ^TݛܙPݝۈϏݝۈېۚXڏ^ʊHOț؝ڙ؝JPTґUSїғӑWԐU
_Hۘ\ܓ؛YOHܛݛٙYLޛMHKLˍH^\ۈۛ݋Xۛ^]ښ]K͌؛ܚ][ۋXۛܜȚݙ\Ν^]ښ]Hϑ^ܙHڞވX\ݙ\ȸdϋ؝]ۏϋٚ]Ϗٚ]ώ؛݈ۜY؛YَȔ٘X݋ѐϞȚڛَȉܜڝؘމȟ	ݙ\ۜɈ	ܝ\ܝ	Έ؝ڙ؝NȊ]ȜݜڛيHOȝۚYOȏH
Țڛً؝ڙ؝HJHOȞۛܝۛݙ[݈HڝؘގȞș^YXܛݎȉ֛ݜș]HX]\܉ˈ]NȉԜڝؘވۚXމˈ[ݜێȉԚ^ވX\ݙ\Ț\Șݚ[Ț[ڝ]ٜޙ^Hۛݙ\ܘ][ۜȝښ[Hٙ\[و]HۛXݚ[ۈۘݜٙۈݛۚ[وHۙX݋ɋ٘ݚ[ۜΈ։՚]وۛX݉ˈ	ՙHX^Hٜۘ܈X؛ݛ݈]Z[ˈ؝ٙ][\ˈۙڛHؙٜٙٛ\ˈ\ؚ\وݘ]K[وH^܈[XYوۛݙ^[݈ڛۜوȜݘۚ]ۜșٜٛ؝[ۋȕوۛH\و\Ț[ٛܛX][ۈȜ۝ڙK٘ݜً[و[\۝وHٜݚXًɗKɑٜٛ؝Yۛݙ[݉ˈ	қܝ]Ș\وٜۘܙYșٜٛ؝HٜܛٜۜˈۛH][\Ȟ[݈^XڝH؝و\و[ݙ[ٙYȜٛXZ[Ț[Ȟ[ݜȘX؛ݛ݈\ݛܞKȔٝڙ]ȝHݛܝYۚXވ[ڙYٛ݈ۜȝHݜܙ[݈]Z[ˉ׋ɖ[ݜȘڛژٜɋ	֛݈؛Ȝٜ]Y\݈X؛ݛ݈[]H]Y\ݚ[ۜˈ܈[][ۈ۝YڈݜܝɗWK[ڎȓQГӒSҔ˜ڝؘވKȈ\ۜΈș^YXܛݎȉ՜و]ݙڝݛIˈ]Nȉՙ\ۜțوٜݚXىˈ[ݜێȉԚ^ވX\ݙ\Ț\Ș[ȐRH][و\ܚ\ݘ[݈ۜș[ݙ\ݘZ[ۙ[݈[وۛ[][ژ؝[ۈݜܝ8%۝Hݘܝ]]HۜȞ[ݜȚݙۙ[݋ɋ٘ݚ[ۜΈ։՜ڛوHٜݚXىˈ	֛݈\وٜܛۜژۙHۜȝHY\ܘYٜȞ[݈ٛو[وH؞H[݈\وRKYٜٛ؝Yݙٙ\ݚ[ۜˈۛݙ[݈X^Hو[\\ٙX݋ۈٝڙ]Ț]ٙۜوژ\ڛًɗKɔٜܙXݙݛۛٝX݉ˈ	ћț۝\وHٜݚXوȘܙX]H\ۙݛ[Y؛Xݜڝً܈\؜ܚ[وۛݙ[݋ȐXؙ\܈X^Hو[Z]Yڙ[ȝHٜݚXو\țZ\ݜٙɗKɔ\ؚ\ٜɋ	ԜٛZ][H٘]\ٜȘ[وݘܘܚ\[ۜȘ\وX[ؙٙ۝YڈHۛٛH^HݛܙKɗWK[ڎȓQГӒSҔ˝\ۜȟKȈݜܝȞș^YXܛݎȉՙH\و\وȚ[	ˈ]Nȉԝ\ܝٛݙ\ɋ[ݜێȉԝY\ݚ[ۜȘX۝]ܙY]ˈݘܘܚ\[ۜˈX؛ݛ݈Xؙ\܋܈H٘]\وYXOȔٛو\ȘH۝H[ووڛ[[݈ڛوHٞݙ\ɋ٘ݚ[ۜΈ։Л۝X݈ݜܝ	ˈ	ћXZ[ڞޛX\ݙ\ڙ[X[PۘZ[؛ۈۜȘݙ܋ڛ[و]Y\ݚ[ۜˈX؛ݛ݈[][ۈٜ]Y\ݜˈ܈ٜٛ؛[ɗKɐܙY]Ș[وٛZ][Iˈ	ќٙHܙY]ȜٜٝZ[KȔٛZ][HXؙ\܈[وݘܘܚ\[ۈ؛ؙ[][ۈ\وX[ؙٙ۝YڈۛٛH^KɗKɐX؛ݛ݈[][ۉˈ	ћXZ[ݜܝܛۈHYٜ܈ۛۙXݙYȞ[ݜȘX؛ݛ݈[و[؛YH8'[]H^HX؛ݛݸ'H[ȝHݘڙX݋ɗWK[ڎȓQГӒSҔ˜ݜܝ[XZ[KȈVښ[ٗNٝ\ۈXZ[Șۘ\ܓ؛YOHۘ\ڙ][ًXۛݘZ[ٜțX\ڙ][ً\Yً\Y[وϏݝۈېۚXڏ^ʊHOț؝ڙ؝JPTґUSїғӑWԐU
_Hۘ\ܓ؛YOHۘˌL[ۚ[ًYۙ^][\˘ٛݙ\ș؜Lȝ^\ۈۛ݋Xۛ^]ښ]K͍H؛ܚ][ۋXۛܜȚݙ\Ν^]ښ]HϸdؘڈۙO؝]ۏϙ]Șۘ\ܓ؛YOHۘ^]ˌޛϏۘ\ܓ؛YOHݙ^^șۛ݋Xۛ\\ؘ\وؘښ[ًV̋̎[WH^\[ڋĽΌϞ؛۝[݋ٞYXܛݟO܏ϚHۘ\ܓ؛YOH۝MH^M^ۛ݋XۘXڈؘښ[ًVˌ̍[WH^]ښ]HYݙ^MޛϞ؛۝[݋ݚ]_OڌOϜۘ\ܓ؛YOH۝Mȝ^[țXY[ًN^]ښ]K͍HϞ؛۝[݋ڛݜ۟O܏ϋٚ]Ϗ]Șۘ\ܓ؛YOH۝LLțX^]ˌޛܘXً^KMHϞ؛۝[݋ܙXݚ[ۜ˛X\

ڙXY[ًۜWJHOȏ٘ݚ[ۈٞO^ڙXY[ٟHۘ\ܓ؛YOHۘ\ڙ][ًX؜وMțY܋NϏȘۘ\ܓ؛YOHݙ^^ۛ݋Xۛ^]ښ]HϞڙXY[ٟOڌϏۘ\ܓ؛YOH۝Lȝ^\ۈXY[ًMȝ^]ښ]K͍HϞ؛ܞ_O܏ϋܙXݚ[ۏʟOٚ]ϏHٙϞ؛۝[݋ۚ[ڟH\ٙ]^ښ[وOOH	ܝ\ܝ	ȏȝ[ٙYڛٙȉטۘ[ډ߈ٛ^ښ[وOOH	ܝ\ܝ	ȏȝ[ٙYڛٙȉۛܙYٜܙ\ɟHۘ\ܓ؛YOH۝N[ۚ[ًYۙ^۝[ٙYLޛۜٙ\Șۜٙ\˝ښ]K̍Hً]ښ]K֌̍WHMHKLˍH^\ۈۛ݋Xۛ^]ښ]H؛ܚ][ۋXۛܜȚݙ\Θً]ښ]ǨϞښ[وOOH	ܝ\ܝ	ȏȉћXZ[ݜܝ	ȎȉԙXYHݛۚXވ8dɟO؏ϋۘZ[ϏX\ڙ][ّۛݙ\ț؝ڙ؝O^ۘ]ڙ؝_HςȈώN؛݈ۜ۝۝[ٔYَȔ٘X݋ѐϞț؝ڙ؝NȊ]ȜݜڛيHOȝۚYOȏH
ț؝ڙ؝HJHOȏXZ[Șۘ\ܓ؛YOHۘ\ڙ][ًXۛݘZ[ٜțX\ڙ][ً\Yً\Y[وϏۘ\ܓ؛YOHݙ^^șۛ݋Xۛ\\ؘ\وؘښ[ًV̋̎[WH^\[ڋĽΌύ܏ϚHۘ\ܓ؛YOH۝MH^M^ۛ݋XۘXڈ^]ښ]Hϕ]YوڛܝY[݋ϋڌOϜۘ\ܓ؛YOH۝MH^]ښ]K͍Hϓ]8&\șٝ[݈ؘڈȝHۛو\݋ϋ܏ϘݝۈېۚXڏ^ʊHOț؝ڙ؝JPTґUSїғӑWԐU
_Hۘ\ܓ؛YOHۘ\ڙ][ًXݘK\ڛX\ވ]N۝[ٙYLޛMHKLˍH^\ۈۛ݋Xۛ^]ښ]HϐؘڈۙH8dϋ؝]ۏϋۘZ[ώ؛݈ۜX\ڙ][ٔڝNȔ٘X݋ѐȏH

HOȞۛܝܘ]؛YKٝ]؛YWHH\ٔݘ]J

HOȝ\[وڛ݈ٛOOH	ݛٙYڛٙ	ȏȉˉȎȝڛٛ݋ؘۛ][ۋܘ]؛YJNۛܝ۝]HH\ٓY[[ʊ
HOșٝ۝]J]؛YJKܘ]؛YWJNȈ\ّYٙX݊

HOȞۛܝ۔ܔݘ]HH

HOȜٝ]؛YJڛٛ݋ؘۛ][ۋܘ]؛YJNڛٛ݋ؙ]ٛݓ\ݙ[ٜʉܛܜݘ]Iˈ۔ܔݘ]JNٝ\ۈ

HOȝڛٛ݋ܙ[[ݙQ]ٛݓ\ݙ[ٜʉܛܜݘ]Iˈ۔ܔݘ]JNK׊NȈ\ّYٙX݊

HOȞ\]Tٛʜ۝]JNڛٛ݋ܘܛۛʞȝ܎Ȍٚ]ڛ܎ȉ؝]ɈJNKܛݝWJNȈۛܝ؝ڙ؝HH
]ȜݜڛيHOȞۛܝܘ]؛YT\݋\ڗHH]ܜ]
	ȉʎۛܝٞ]H]؛YT\݈	ˉ΂Ȉڛٛ݋ښ\ݛܞKܝ\ڔݘ]Jߋ	ɋ	ۙ^]Iژ\ڈȘɞژ\ڟXȉɟX
Nٝ]؛YJٞ]
Nڛٛ݋ܙ][Y[ݝ


HOȞYȊ\ڊH؝[Y[݋ٙ][[Y[ݐޒY
\ڊO˜؜ۛ[ݛ՚Y]ʞȘٚ]ڛ܎ȉܛ[۝	ȟJN[وڛٛ݋ܘܛۛʞȝ܎Ȍٚ]ڛ܎ȉ؝]ɈJNK
NNȈۛܝ\ݚXۙHH۝]Kښ[وOOH	؜ݚXۙIȏșٝۛٔܝ
۝]KܛYʈȝ[ٙYڛٙȈٝ\ۈ]Șۘ\ܓ؛YOHۘ\ڙ][ً\ڝHZ[˚\؜ٙ[țݙ\ٛ݋^ZY[ȘًVȌL׈^]ښ]HϏX\ڙ][ٓ؝ț؝ڙ؝O^ۘ]ڙ؝_HϞܛݝKښ[وOOH	ڛۙIȏȏۙTYو؝ڙ؝O^ۘ]ڙ؝_HψȜ۝]Kښ[وOOH	؛ىȏȏْۛ[ٙ^Yو؝ڙ؝O^ۘ]ڙ؝_HψȘ\ݚXۙHȏ\ݚXۙTYوܝ^؜ݚXۙ_H؝ڙ؝O^ۘ]ڙ؝_HψȜ۝]Kښ[وOOH	ܜڝؘމȟ۝]Kښ[وOOH	ݙ\ۜɈ۝]Kښ[وOOH	ܝ\ܝ	ȏȏY؛Yوڛُ^ܛݝKښ[ٟH؝ڙ؝O^ۘ]ڙ؝_Hψȏϓ۝۝[ٔYو؝ڙ؝O^ۘ]ڙ؝_HϏX\ڙ][ّۛݙ\ț؝ڙ؝O^ۘ]ڙ؝_HϏϟOٚ]ώNٞܝY؝[X\ڙ][ٔڝN¿￿