export const RIZZLINE_SEO = {
  title: 'Rizzline: Funny, Smooth & Romantic Pickup Lines | Rizz Master',
  heading: 'Pickup lines for every vibe.',
  description: 'Find funny, smooth, romantic, cheesy and nerdy pickup lines with Rizzline. Browse by vibe, save your favorites, copy a line or make a shareable card. Free on the web.',
  url: 'https://rizzmaster.online/rizzline',
  image: 'https://rizzmaster.online/logo.png',
};

export const RIZZLINE_CATEGORIES = [
  { id: 'smooth', label: 'Smooth', emoji: '🍸', description: 'A relaxed compliment for a conversation that already feels warm. Keep it short and leave room for their reply.', examples: ['Your smile just completely wrecked my poker face.', 'I was having a productive day until you showed up and ruined my concentration.'] },
  { id: 'funny', label: 'Funny', emoji: '😂', description: 'An opener that makes the joke part of the conversation. Pick something you would actually say, then follow it with a real question.', examples: ['I was going to play hard to get, but my poker face is awful and you are way too cute.', 'My friends bet me $20 I would not talk to the prettiest person here. Want to split the drinks?'] },
  { id: 'romantic', label: 'Romantic', emoji: '🌹', description: 'Warm words for someone you already know likes the attention. These fit an established connection better than a first message to a stranger.', examples: ['I have had a lot of good conversations, but none that made me lose track of time this fast.', 'Your voice is my favorite sound, and your presence is my favorite peace.'] },
  { id: 'cheesy', label: 'Cheesy', emoji: '🧀', description: 'Classic wordplay with a wink. The fun comes from both people being in on the joke, rather than pretending the line is a serious declaration.', examples: ['Do you have an eraser? Because you just wiped my whole train of thought.', 'Are you a parking ticket? Because you have got fine written all over you.'] },
  { id: 'nerdy', label: 'Nerdy', emoji: '💻', description: 'Code, games, science and shared interests. A reference lands best when it is something the other person enjoys too.', examples: ['Are you Ctrl + Z? Because you just fixed my entire evening.', 'My heart usually runs at 60 FPS, but around you it is definitely dropping frames.'] },
  { id: 'foodie', label: 'Foodie', emoji: '🍕', description: 'Coffee, food and dinner-date banter. Use a food reference as a bridge to a favorite café, a shared recipe or an easy date idea.', examples: ['You are like the surprise fries at the bottom of the takeout bag: unexpected and the best part.', 'Are you a double shot of espresso? Because you just sped up my heart rate in one second.'] },
  { id: 'clever', label: 'Clever', emoji: '🧠', description: 'A little twist for someone who enjoys wordplay. If the joke needs explaining, let it go and move into an ordinary conversation.', examples: ['They say nothing lasts forever... so will you be my nothing?', 'If you were text on a page, you would be the fine print: easily overlooked, but worth reading closely.'] },
] as const;

export const RIZZLINE_GUIDANCE = [
  { title: 'Match the moment', text: 'Choose a vibe that fits the conversation. A light joke can suit a dating-app opener; a romantic line usually needs some mutual interest first.' },
  { title: 'Make it sound like you', text: 'Use a line as a starting point. Add a detail from their profile or something you have already discussed, and skip wording you would feel awkward saying aloud.' },
  { title: 'Give them room to respond', text: 'Send one opener, then see whether they engage. A pickup line is an invitation to talk. Silence, a no, or a change of subject is a cue to ease off.' },
];

export const RIZZLINE_FAQS = [
  { question: 'What is a good pickup line for texting?', answer: 'A good texting pickup line is short, suits your existing conversation and gives the other person an easy way to respond. Try a light compliment such as “Your smile just completely wrecked my poker face,” then ask about something specific in their profile. A personal detail often matters more than a polished line.' },
  { question: 'How do I use Rizzline?', answer: 'Pick a category, browse with Next line and save anything you like. You can search the catalog, revisit previous lines, copy text, share it or download a card. The tool works in your browser without an account.' },
  { question: 'Is Rizzline free, and does it use AI?', answer: 'Rizzline is free to browse and uses an existing catalog of pickup lines. It does not send your text to an AI model or require credits. For a reply tailored to an actual conversation, use the Rizz Master Chat Reply tool.' },
  { question: 'Do cheesy pickup lines work?', answer: 'They can start a playful exchange when both people enjoy that humor. They do not guarantee attraction or a reply. Say it lightly, pay attention to the response and move into a real conversation instead of sending a series of lines.' },
  { question: 'Where are my saved pickup lines stored?', answer: 'Your saved lines and reactions stay in this browser on this device. They do not sync to an account or the Android app. Clearing site data removes them, and private browsing or blocked storage may prevent saves from lasting.' },
];

export const RIZZLINE_LINKS = [
  { href: '/', label: 'Write a tailored chat reply', description: 'Bring the conversation to Rizz Master and find words that fit the context.' },
  { href: '/blog/how-to-flirt-without-coming-on-too-strong', label: 'Flirt without coming on too strong', description: 'Keep the exchange playful while paying attention to mutual interest.' },
  { href: '/blog/how-to-ask-someone-out-over-text', label: 'Turn the conversation into a date', description: 'Move from a good opener to a clear, comfortable invitation.' },
];

export const RIZZLINE_SCHEMA = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebPage', '@id': `${RIZZLINE_SEO.url}#page`, url: RIZZLINE_SEO.url, name: RIZZLINE_SEO.title, description: RIZZLINE_SEO.description, isPartOf: { '@type': 'WebSite', name: 'Rizz Master', url: 'https://rizzmaster.online' }, mainEntity: { '@id': `${RIZZLINE_SEO.url}#tool` } },
    { '@type': 'WebApplication', '@id': `${RIZZLINE_SEO.url}#tool`, name: 'Rizzline', url: RIZZLINE_SEO.url, description: RIZZLINE_SEO.description, applicationCategory: 'LifestyleApplication', operatingSystem: 'Any', browserRequirements: 'Requires a modern web browser with JavaScript enabled', offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, publisher: { '@type': 'Organization', name: 'Rizz Master' } },
    { '@type': 'BreadcrumbList', itemListElement: [{ '@type': 'ListItem', position: 1, name: 'Rizz Master', item: 'https://rizzmaster.online/landing' }, { '@type': 'ListItem', position: 2, name: 'Rizzline: Pickup Lines', item: RIZZLINE_SEO.url }] },
  ],
};
