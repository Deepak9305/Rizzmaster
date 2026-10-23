// Shared by the browser and prerenderer so discovery links survive without JS.
export const PICKUP_LINE_GUIDE_SLUGS = ['funny-pickup-lines-that-work', 'best-tinder-openers-for-guys', 'how-to-flirt-without-coming-on-too-strong'];

const TOPIC_GROUPS = [
  ['talk-about-sexual-health-before-sex', 'texting-boundaries-while-dating', 'how-to-have-the-exclusive-conversation-without-pressure', 'how-to-have-a-difficult-conversation-without-getting-defensive'],
  ['talk-about-money-while-dating', 'talk-about-what-you-want-in-dating', 'how-to-build-trust-in-a-new-relationship', 'how-to-have-a-difficult-conversation-without-getting-defensive'],
  ['how-to-stop-overthinking-while-dating', 'how-to-tell-if-someone-is-losing-interest-without-overthinking', 'how-to-handle-jealousy-in-a-new-relationship', 'signs-texting-conversation-becoming-one-sided']
];

export const getRelatedGuideSlugs = (slug: string): string[] =>
  [...new Set(TOPIC_GROUPS.filter(group => group.includes(slug)).flat())]
    .filter(candidate => candidate !== slug);
