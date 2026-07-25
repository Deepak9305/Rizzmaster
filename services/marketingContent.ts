export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=YOUR_APP_PACKAGE_NAME';

export interface BlogSection {
  heading: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface BlogPost {
  slug: string;
  title: string;
  description: string;
  excerpt: string;
  date: string;
  readingTime: string;
  category: string;
  sections: BlogSection[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'reply-to-dry-texts',
    title: 'How to Reply to Dry Texts Without Sounding Desperate',
    description: 'Learn how to turn short, low-energy messages into an easy conversation without chasing or overthinking every reply.',
    excerpt: 'A short reply does not always mean a dead conversation. Here is how to bring the energy back without forcing it.',
    date: '2026-07-10',
    readingTime: '5 min read',
    category: 'Texting advice',
    sections: [
      {
        heading: 'Do not match low effort with more effort',
        paragraphs: [
          'When someone replies with “k” or “lol,” the instinct is often to send another question, explain yourself, or try three new topics at once. That creates pressure. Instead, keep your next message light and specific.',
          'A good reply gives the other person something easy to react to. Share a small opinion, a playful observation, or a question with a real hook instead of asking another generic “how was your day?”'
        ],
        bullets: [
          '“That was the diplomatic answer. What is the honest version?”',
          '“I am choosing to believe you are saving the good story for later.”',
          '“Quick verdict: best part of your day so far?”'
        ]
      },
      {
        heading: 'Use the two-message test',
        paragraphs: [
          'Try one playful follow-up, then give the conversation room. If the replies stay flat after a genuine attempt, you have useful information. Chemistry should feel like a shared effort, not a performance you have to carry alone.',
          'The goal is not to manufacture interest. It is to make it easy for mutual interest to show up.'
        ]
      },
      {
        heading: 'Make your message sound like you',
        paragraphs: [
          'The best line is one you could actually say out loud. Pick a tone that fits the moment—funny, flirty, confident, or wholesome—and keep it short enough to invite a response.',
          'If you want a few options before you send, Rizz Master can turn the exact context into replies that match your voice and the vibe you want.'
        ]
      }
    ]
  },
  {
    slug: 'best-tinder-openers-for-guys',
    title: 'Best Tinder Openers That Don’t Sound Boring',
    description: 'Skip “hey” with easy Tinder openers that feel natural, specific, and simple to answer.',
    excerpt: 'The best Tinder opener is not the cleverest line. It is the one that gives someone a reason to reply.',
    date: '2026-07-08',
    readingTime: '6 min read',
    category: 'Dating apps',
    sections: [
      {
        heading: 'Start with something you can actually see',
        paragraphs: [
          'A profile-specific opener feels more confident because it proves you looked. Notice the travel photo, the oddly specific hobby, or the food opinion that tells you something about them.',
          'Keep the observation positive and leave a little space for them to add their side of the story.'
        ],
        bullets: [
          '“Important question: was that hike worth the view or the snack break?”',
          '“You seem like you have a strong coffee order. What am I judging?”',
          '“I need the backstory behind the dog photo. Who is actually in charge?”'
        ]
      },
      {
        heading: 'Ask a question with a point of view',
        paragraphs: [
          'Questions are easier to answer when they are not interview questions. Offer two fun choices, make a low-stakes prediction, or ask for a recommendation you would genuinely use.',
          'Specificity creates momentum. “What do you do for fun?” is broad; “What is your ideal Sunday when nobody needs anything from you?” is a real invitation.'
        ]
      },
      {
        heading: 'Know when to keep it simple',
        paragraphs: [
          'Do not stack a punchline, a compliment, and three questions in one opener. One thoughtful detail is enough. The conversation gets better when both people get room to contribute.',
          'Rizz Master can help you turn a match’s profile into a few opening directions, so you can choose the one that sounds most like you.'
        ]
      }
    ]
  },
  {
    slug: 'reply-when-she-says-haha',
    title: 'How to Reply When She Says Haha',
    description: 'Turn a “haha” reply into a smoother conversation with playful follow-ups that do not feel needy or forced.',
    excerpt: '“Haha” can mean amused, polite, busy, or ready for a new topic. Read the moment and give the conversation somewhere to go.',
    date: '2026-07-06',
    readingTime: '4 min read',
    category: 'Texting advice',
    sections: [
      {
        heading: 'Read the energy around the haha',
        paragraphs: [
          'A “haha” after a playful message is different from a “haha” that arrives three hours later with no follow-up. Look at the whole exchange before deciding what it means. One short reply is not a verdict on the connection.',
          'If the earlier messages were warm, stay playful. If the conversation has gone flat, change the subject or let it breathe.'
        ],
        bullets: [
          '“I will accept that laugh, but I am keeping score.”',
          '“That sounded suspiciously polite. Want to try again?”',
          '“Okay, your turn—make me laugh.”'
        ]
      },
      {
        heading: 'Pivot instead of begging for validation',
        paragraphs: [
          'Avoid asking “was that funny?” or sending a second punchline to prove the first one worked. A better move is to pivot into a topic that reveals personality: a current obsession, a weekend plan, or a tiny debate.',
          'The conversation should move forward, not pause while you wait for a score.'
        ]
      },
      {
        heading: 'Keep your confidence quiet',
        paragraphs: [
          'Confidence is not pretending every message lands. It is staying relaxed enough to move on. If you want help finding the next angle, Rizz Master can suggest replies in a funny, flirty, wholesome, or confident tone.'
        ]
      }
    ]
  },
  {
    slug: 'funny-pickup-lines-that-work',
    title: 'Funny Pickup Lines That Actually Work',
    description: 'Use funny pickup lines as conversation starters, not performances, with examples that make it easy to keep talking.',
    excerpt: 'A good pickup line opens a door. The follow-up is what turns it into an actual conversation.',
    date: '2026-07-03',
    readingTime: '5 min read',
    category: 'Openers',
    sections: [
      {
        heading: 'Choose playful over perfect',
        paragraphs: [
          'The line does not need to be original enough for a comedy special. It needs to be light, low-pressure, and easy to answer. A little self-awareness makes a cheesy line feel intentional instead of awkward.',
          'Use the line as a soft launch into a real question, not as the entire conversation.'
        ],
        bullets: [
          '“Are you always this easy to match with, or am I having a very lucky day?”',
          '“I had a clever opener ready, but your profile distracted me. What is your best recommendation around here?”',
          '“On a scale from ‘one more episode’ to ‘up at sunrise,’ how chaotic is your weekend?”'
        ]
      },
      {
        heading: 'Make the follow-up specific',
        paragraphs: [
          'If the line gets a laugh, do not immediately send another line. Ask about the detail that made you swipe right, or invite a small opinion. That gives the other person a chance to be more than an audience.',
          'A simple “What made you choose that photo?” can be more memorable than a second attempt at a punchline.'
        ]
      },
      {
        heading: 'Match the setting and the person',
        paragraphs: [
          'A bold line can work in a playful app chat and feel strange in a serious conversation. Read their profile and keep the tone respectful. Rizz Master helps you explore several directions before choosing the one that feels natural.'
        ]
      }
    ]
  },
  {
    slug: 'best-dating-app-bio-ideas-for-guys',
    title: 'Best Dating App Bio Ideas for Guys',
    description: 'Build a dating app bio that is specific, confident, and easy to start a conversation from.',
    excerpt: 'A strong bio is a shortcut to the right conversation. Show a point of view, not a list of requirements.',
    date: '2026-06-30',
    readingTime: '7 min read',
    category: 'Dating profiles',
    sections: [
      {
        heading: 'Give people an opening',
        paragraphs: [
          '“I like food, travel, and having fun” is true for almost everyone, so it gives a match nowhere to begin. Replace broad labels with one vivid detail: the dish you cook best, the city you would revisit tomorrow, or the oddly competitive hobby you have picked up.',
          'A bio works when it makes the next message obvious.'
        ],
        bullets: [
          '“I make a dangerously good breakfast burrito and will defend pineapple on pizza.”',
          '“Looking for someone who can recommend a book and forgive my terrible parallel parking.”',
          '“Ideal Sunday: long walk, new coffee shop, and pretending I will meal prep.”'
        ]
      },
      {
        heading: 'Use confident, warm language',
        paragraphs: [
          'Confidence sounds like knowing what you enjoy, not trying to impress everyone. Keep the bio positive and curious. Avoid a long list of rules, complaints about dating apps, or jokes that put other people down.',
          'Two or three specific lines are usually more inviting than a dense paragraph.'
        ]
      },
      {
        heading: 'Try a few versions',
        paragraphs: [
          'Your bio can have a different flavor: funny, relaxed, direct, or a little mysterious. Test the version that best matches your photos and your actual personality. Rizz Master can turn your interests into several bio directions when you are staring at a blank profile box.'
        ]
      }
    ]
  },
  {
    slug: 'what-to-text-after-a-first-date',
    title: 'What to Text After a First Date',
    description: 'Know what to say after a first date so your message feels clear, warm, and confident without overthinking it.',
    excerpt: 'The best post-date text is timely, specific, and honest about enjoying the time together.',
    date: '2026-06-27',
    readingTime: '5 min read',
    category: 'Dating advice',
    sections: [
      {
        heading: 'Send the simple version',
        paragraphs: [
          'You do not need to wait three days or write a perfect paragraph. If you enjoyed the date, say so while the memory is fresh. Mention one real moment from the evening, then make your interest clear.',
          'Specificity makes a short text feel personal.'
        ],
        bullets: [
          '“I had a great time tonight—your story about the failed cooking class still has me laughing.”',
          '“That was fun. I am still thinking about that dessert place you mentioned. Want to try it together next week?”',
          '“Made it home, and I am glad we finally did that. I would like to see you again.”'
        ]
      },
      {
        heading: 'Suggest a next step when it feels right',
        paragraphs: [
          'A clear invitation is easier to respond to than vague enthusiasm. Offer a simple plan with a little flexibility: a day, an activity, or a place connected to something you discussed.',
          'If you are unsure whether the feeling was mutual, a warm message without pressure is still enough. Their response will give you the information you need.'
        ]
      },
      {
        heading: 'Do not over-edit your personality out',
        paragraphs: [
          'A post-date message should sound like the person they just met. Keep the warmth, humor, or directness that was already there. If you want a few natural ways to phrase it, Rizz Master can help you draft options from the actual date context.'
        ]
      }
    ]
  }
];

export const getBlogPost = (slug: string) => BLOG_POSTS.find((post) => post.slug === slug);
