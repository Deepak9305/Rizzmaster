import { CategoryInfo, CategoryKey, PickupLine } from '../types';
import masterJson from './pickupLinesMaster.json';
import { isCorruptedText, sanitizePickupLine } from '../utils/textSanitizer';

export const CATEGORIES: CategoryInfo[] = [
  { id: 'all', label: 'All Vibes', emoji: '🔥', description: 'Explore every vibe' },
  { id: 'smooth', label: 'Smooth', emoji: '🍸', description: 'Charming, confident & slick' },
  { id: 'cheesy', label: 'Cheesy', emoji: '🧀', description: 'Classic punchlines & groaners' },
  { id: 'nerdy', label: 'Nerdy', emoji: '💻', description: 'Tech, code, science & math' },
  { id: 'romantic', label: 'Romantic', emoji: '🌹', description: 'Warm words for a mutual connection' },
  { id: 'funny', label: 'Funny', emoji: '😂', description: 'Witty banter & laughs' },
  { id: 'foodie', label: 'Foodie', emoji: '🍕', description: 'Culinary puns' },
  { id: 'clever', label: 'Clever', emoji: '🧠', description: 'Wordplay with a twist' },
];

const DELIVERY_TIPS: Record<CategoryKey, string[]> = {
  all: [
    'Deliver with an easy smile and unhurried eye contact.',
    'Keep your tone conversational and lighthearted.',
    'Wait a beat after the setup before dropping the punchline.',
  ],
  smooth: [
    'Deliver with relaxed eye contact and a gentle grin.',
    'Keep your voice calm, lowered, and unhurried.',
    'A confident posture sells this one best.',
    'Speak softly and let the compliment settle.',
  ],
  cheesy: [
    'Classic dramatic pause before the punchline.',
    'Say it with a knowing smirk and self-aware laugh.',
    'Commit to the cheesiness 100%—don’t apologize!',
    'Feigned seriousness makes this ten times funnier.',
  ],
  nerdy: [
    'Deadpan delivery with a twinkle in your eye.',
    'Deliver like you’re explaining an undeniable law of physics.',
    'Confident geek swagger works like magic.',
    'Smoothly drop it when the topic turns to tech or study.',
  ],
  romantic: [
    'Deliver with slow, calm eye contact and a warm smile.',
    'Speak with quiet confidence—never rush the words.',
    'Lean in slightly and let the sincerity breathe.',
    'A gentle smile right after saying it seals the moment.',
  ],
  funny: [
    'Deliver with mock-serious energy and a dry smirk.',
    'Let them laugh first before breaking your own smile.',
    'Playful self-deprecation with high charismatic energy.',
    'Say it with total theatrical confidence.',
  ],
  foodie: [
    'Great line when sharing food or ordering drinks.',
    'Playful dinner-date banter.',
    'Lighthearted and delightfully delicious.',
  ],
  clever: [
    'Delivered casually like a passing thought.',
    'Sharp, witty, and intellectual.',
    'Hold eye contact after the twist to see if they caught it.',
  ],
};

function getDeliveryTip(cat: CategoryKey, index: number): string {
  const tips = DELIVERY_TIPS[cat] || DELIVERY_TIPS.smooth;
  return tips[index % tips.length];
}

const seenTexts = new Set<string>();
export const CURATED_PICKUP_LINES: PickupLine[] = (masterJson as Array<{ text: string; category: string; tip?: string }>).map((item, index) => {
  const category = (item.category || 'smooth') as CategoryKey;
  return sanitizePickupLine({
    id: `${category}-${index + 1}`,
    text: item.text,
    category,
    source: 'Rizzline catalog',
    deliveryTip: item.tip || getDeliveryTip(category, index),
  });
}).filter(line => {
  if (isCorruptedText(line.text) || seenTexts.has(line.text)) return false;
  seenTexts.add(line.text);
  return true;
});

export const CATALOG_BY_TEXT = new Map(CURATED_PICKUP_LINES.map(line => [line.text, line]));
export const CATALOG_BY_ID = new Map(CURATED_PICKUP_LINES.map(line => [line.id, line]));

// Category lookup map for high performance O(1) random retrieval
export const LINES_BY_CATEGORY: Record<CategoryKey, PickupLine[]> = {
  all: CURATED_PICKUP_LINES,
  smooth: CURATED_PICKUP_LINES.filter(l => l.category === 'smooth'),
  cheesy: CURATED_PICKUP_LINES.filter(l => l.category === 'cheesy'),
  nerdy: CURATED_PICKUP_LINES.filter(l => l.category === 'nerdy'),
  romantic: CURATED_PICKUP_LINES.filter(l => l.category === 'romantic'),
  funny: CURATED_PICKUP_LINES.filter(l => l.category === 'funny'),
  foodie: CURATED_PICKUP_LINES.filter(l => l.category === 'foodie'),
  clever: CURATED_PICKUP_LINES.filter(l => l.category === 'clever'),
};
