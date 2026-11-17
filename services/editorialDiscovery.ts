// Shared by the browser and prerenderer so discovery links survive without JS.
export const EBOOK_PROMOTION_SLUGS = [
  'why-you-procrastinate-on-things-you-care-about',
  'why-small-things-annoy-you-lately',
  'respond-to-last-minute-date-cancellation',
  'what-to-text-when-someone-needs-space',
  'do-i-like-them-or-just-like-the-attention',
  'how-to-pace-a-new-relationship-without-losing-yourself',
  'restart-conversation-after-long-pause',
  'signs-texting-conversation-losing-momentum',
  'how-to-tell-if-someone-is-flirting-over-text',
  'signs-texting-conversation-becoming-one-sided',
  'how-to-ask-someone-out-over-text',
  'follow-up-after-awkward-first-date',
  'what-to-say-when-dating-app-match-nearly-empty-profile'
];

export const getArticlePromotionLayout = (slug: string, sectionCount: number) => ({
  ebook: EBOOK_PROMOTION_SLUGS.includes(slug),
  firstIndex: EBOOK_PROMOTION_SLUGS.includes(slug) ? Math.floor(sectionCount / 3) : Math.ceil(sectionCount / 2),
  appIndex: Math.min(sectionCount - 1, Math.ceil(sectionCount * 0.85))
});

export const PICKUP_LINE_GUIDE_SLUGS = ['funny-pickup-lines-that-work', 'best-tinder-openers-for-guys', 'how-to-flirt-without-coming-on-too-strong'];

const TOPIC_GROUPS = [
  ['what-to-say-when-someone-keeps-interrupting-you', 'why-group-conversations-feel-invisible', 'why-you-overexplain-yourself', 'how-to-have-a-difficult-conversation-without-getting-defensive'],
  ['talk-about-sexual-health-before-sex', 'texting-boundaries-while-dating', 'how-to-have-the-exclusive-conversation-without-pressure', 'how-to-have-a-difficult-conversation-without-getting-defensive'],
  ['talk-about-money-while-dating', 'talk-about-what-you-want-in-dating', 'how-to-build-trust-in-a-new-relationship', 'how-to-have-a-difficult-conversation-without-getting-defensive'],
  ['how-to-stop-overthinking-while-dating', 'how-to-tell-if-someone-is-losing-interest-without-overthinking', 'how-to-handle-jealousy-in-a-new-relationship', 'signs-texting-conversation-becoming-one-sided']
];

export const getRelatedGuideSlugs = (slug: string): string[] =>
  [...new Set(TOPIC_GROUPS.filter(group => group.includes(slug)).flat())]
    .filter(candidate => candidate !== slug);
