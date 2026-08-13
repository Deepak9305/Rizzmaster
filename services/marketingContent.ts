export const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=app.vercel.rizzmaster&pcampaignid=web_share';

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
  updatedAt: string;
  readingTime: string;
  category: string;
  keywords: string[];
  image?: string;
  imageAlt?: string;
  resources?: Array<{ label: string; url: string }>;
  sections: BlogSection[];
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'what-to-text-when-they-stop-replying',
    title: 'What to Text When They Stop Replying: A Calm Follow-Up Guide',
    description: 'Not sure what to text when someone stops replying? Learn how long to wait, when to double text, and how to send one confident follow-up without chasing.',
    excerpt: 'Send one clear, low-pressure follow-up, then let their response, timing, and effort give you the information you need. Silence is data, not a challenge to overcome.',
    date: '2026-08-13',
    updatedAt: '2026-08-13',
    readingTime: '10 min read',
    category: 'Texting advice',
    keywords: [
      'what to text when they stop replying',
      'what to text when someone stops replying',
      'what to say when they stop texting',
      'what to text after being ghosted',
      'should I double text after no reply',
      'how long to wait before texting again',
      'how to follow up after no response',
      'last text before giving up',
      'how to respond when someone comes back after ghosting',
      'double texting advice',
      'texting anxiety after no reply'
    ],
    image: '/blog/what-to-text-when-they-stop-replying-hero.svg',
    imageAlt: 'Editorial illustration of a paused phone conversation and a calm follow-up message',
    resources: [
      { label: 'The Gottman Institute: Notice bids for connection', url: 'https://www.gottman.com/blog/want-to-improve-your-relationship-start-paying-more-attention-to-bids/' },
      { label: 'The Gottman Institute: Improve communication', url: 'https://www.gottman.com/improve-communication-relationship/' },
      { label: 'National Domestic Violence Hotline: Healthy relationship guide', url: 'https://www.thehotline.org/pdf/Healthy_Relationships.pdf' }
    ],
    sections: [
      {
        heading: 'First, do not turn a quiet chat into a verdict on your worth',
        paragraphs: [
          'When someone stops replying, your brain usually wants an instant explanation. You may reread the last message, compare the punctuation with earlier texts, or imagine that one awkward sentence changed everything. That reaction is common, but it is not reliable evidence. A delayed reply can mean a busy day, low phone energy, a forgotten notification, uncertainty about what to say, or a drop in interest. You cannot identify the reason from silence alone.',
          'The useful question is not "How do I make them answer?" It is "What is the clearest, kindest next move for me?" That shift matters. You can send a follow-up that makes replying easy, but you cannot text someone into genuine interest. Treat the gap as information about the current level of communication, not as a problem you must solve with a better performance.',
          'Also look at the pattern instead of one isolated gap. Someone who normally communicates warmly and disappears during a stressful week deserves more benefit of the doubt than someone who has replied with one-word answers, cancelled twice, and never asks anything about you. Context should decide your tone.'
        ],
        bullets: [
          'One slow reply is a pause; a repeated one-sided pattern is useful information.',
          'Your goal is clarity and self-respect, not a guaranteed response.',
          'Do not send a message solely to reduce your own anxiety for five minutes.'
        ]
      },
      {
        heading: 'How long should you wait before texting again?',
        paragraphs: [
          'There is no universal number of hours that makes a double text confident. The right wait depends on the conversation, the person, and what you already sent. If you asked a practical question about plans, a same-day check-in can be reasonable. If you sent a casual thought late at night, give it until the next day. If the person told you they were travelling, working, or dealing with something personal, respect the timeframe they gave you.',
          'As a simple rule, wait long enough that your next message is a fresh choice rather than an emotional reflex. For many casual conversations, that means waiting until the next day and sending one message. After that, allow the other person to take a turn. A calendar rule cannot tell you whether someone is interested, but a little space makes the answer easier to see.'
        ],
        bullets: [
          'Plans or logistics: follow up when the decision actually needs an answer.',
          'New match or early chat: usually wait until the next day before one light follow-up.',
          'Several unanswered messages: stop adding more and let the conversation rest.'
        ]
      },
      {
        heading: 'Should you double text after no reply?',
        paragraphs: [
          'Double texting is not automatically desperate. People miss messages, lose their place in a chat, and get interrupted. A second message becomes uncomfortable when it is designed to punish the silence, demand reassurance, or make the other person feel responsible for your mood. The content and the pattern matter more than the fact that it is message number two.',
          'Make the follow-up easy to receive. Add new context, answer your own earlier question, send a specific idea, or acknowledge that they may be busy. Avoid sending "hello?", "did I do something?", or a sequence of increasingly dramatic messages. One calm follow-up gives a person a clear opening. Multiple follow-ups remove the space needed for an honest choice.'
        ],
        bullets: [
          'Good double text: a new detail, a clear plan, or a low-pressure check-in.',
          'Bad double text: guilt, accusations, tests, or a demand for an explanation.',
          'After one thoughtful follow-up, stop and watch whether effort becomes mutual.'
        ]
      },
      {
        heading: 'What to text when someone stops replying',
        paragraphs: [
          'The best message depends on what happened immediately before the silence. If the chat was playful, keep the follow-up light. If you were making plans, be direct. If you had already shared interest and the conversation simply faded, a warm close can protect your dignity better than another attempt to restart it. Your text should sound like a person with a full life, not a customer-service escalation.',
          'Here are a few adaptable examples. Change the wording so it sounds like you, and only send one that is true. A line that is technically clever but emotionally false will make you more anxious after you send it.',
          'If you are unsure, choose the most neutral version first. You can be interested without acting as though the outcome is already decided. The other person should be able to reply, decline, or remain quiet without being cornered.'
        ],
        bullets: [
          'Light check-in: "I am guessing your week got busy. No pressure - how is it going?"',
          'Specific plan: "I enjoyed talking with you. Want to continue over coffee this week?"',
          'Open door: "I had fun chatting. If you are still interested, I would be happy to pick this up later."',
          'Clear close: "I am going to stop double-texting, but I enjoyed meeting you. Take care."'
        ]
      },
      {
        heading: 'If they stopped replying after a good conversation',
        paragraphs: [
          'A strong conversation followed by silence feels especially confusing because the earlier connection was real in that moment. It still does not guarantee that the person has the time, availability, or intention to continue. People can enjoy a conversation and later decide they are not ready to date, become distracted by another priority, or realise that their interest is not strong enough to maintain contact. The earlier good energy was not necessarily fake; it was simply incomplete information.',
          'Send a follow-up that refers to the shared moment instead of asking for a postmortem. Mention the story, joke, place, or plan you were discussing and offer one easy next step. If there is no response, let the good conversation remain a good conversation rather than trying to extract a different ending from it.'
        ],
        bullets: [
          'Reference something specific you both enjoyed.',
          'Offer one simple next step instead of asking what went wrong.',
          'Do not use the previous chemistry as evidence that they owe you access now.'
        ]
      },
      {
        heading: 'If you were making plans and they went quiet',
        paragraphs: [
          'Logistics deserve a more direct follow-up because both people need clarity. If you proposed a day and never received confirmation, send a message that states the plan and gives an easy alternative. For example: "Are we still on for Thursday? If this week is packed, no worries - we can choose another time." That message is clear without pretending that a non-response is acceptable forever.',
          'Set a practical cutoff for yourself. If you need to make other plans, say so: "I will assume tonight is not happening if I do not hear back by this afternoon." Then follow through without a second argument. Clear boundaries reduce waiting-room anxiety and show that your time is part of the equation.'
        ],
        bullets: [
          'Ask for confirmation rather than fishing for reassurance.',
          'Offer a real alternative only if you genuinely want one.',
          'Make other plans when the deadline passes; do not keep the slot emotionally reserved.'
        ]
      },
      {
        heading: 'What not to text when they stop answering',
        paragraphs: [
          'Avoid messages that turn uncertainty into a confrontation before you have enough context. "Why are you ignoring me?", "I guess you never cared", and "You could have just said no" may express a real feeling, but they usually make a conversation less honest and less likely to recover. They also give a near-stranger a large role in regulating your confidence. If you need closure, you can create it through your own decision to stop reaching out.',
          'Do not send a disguised test. Posting something to make them jealous, sending a random meme only to check whether they are online, or deleting and re-sending messages keeps you tied to the response. A follow-up should communicate something you actually mean. If you would not send it when you felt calm, wait until you can edit it into a message you will respect later.'
        ],
        bullets: [
          'Skip guilt trips, sarcasm about their silence, and passive-aggressive status updates.',
          'Do not send multiple channels of contact when one message is unanswered.',
          'Never use threats, pressure, or personal information to force a reply.'
        ]
      },
      {
        heading: 'How to stop chasing someone who is not replying',
        paragraphs: [
          'Stopping does not require a dramatic announcement. Archive the chat, mute notifications, put your phone in another room, or decide that you will not initiate again unless they return with clear effort. Replace the checking loop with a concrete action: finish a workout, call a friend, make plans, or return to a task that existed before the conversation. The goal is not to pretend that you do not care. It is to stop outsourcing your next hour to a notification.',
          'Pay attention to your own boundary. If you repeatedly feel activated by someone who gives inconsistent attention, that pattern is worth taking seriously even if they eventually reply. Healthy communication is not constant availability, but it should not require you to abandon your standards. You can like someone and still choose not to keep chasing a connection that is not meeting you halfway.',
          'If silence is part of a larger pattern of control, intimidation, threats, or pressure, prioritise your safety and reach out to someone you trust or a local support service. Dating advice should never encourage you to stay in a situation that feels unsafe.'
        ]
      },
      {
        heading: 'What to do if they come back after ghosting',
        paragraphs: [
          'A return message does not automatically erase the gap. You can be curious without acting as though nothing happened. Start by noticing whether they offer a real explanation, acknowledge the missed conversation, and make a specific effort to reconnect. "Hey stranger" is not the same as a thoughtful message that takes responsibility and suggests a clear plan.',
          'Choose your response based on what you want now, not on the relief of finally seeing their name. If you want to continue, name the standard lightly: "Good to hear from you. I am open to chatting, but I prefer more consistent communication." If you are no longer interested, a brief "Thanks for checking in, but I am going to pass" is enough. You do not owe a second chance because someone reopened the door.'
        ],
        bullets: [
          'Look for changed effort, not only a new explanation.',
          'Ask for what you need before investing again.',
          'A polite no is a complete answer when the pattern no longer works for you.'
        ]
      },
      {
        heading: 'The last text before giving up',
        paragraphs: [
          'You do not have to send a final text at all. Silence can be your boundary. If a closing message would help you feel clear, keep it short, warm, and free of a hidden request for reassurance: "I enjoyed getting to know you, but I am going to move on. Wishing you well." Send it because it reflects your decision, not because you hope the perfect goodbye will trigger an apology.',
          'After you send it, do not negotiate with the lack of response. A good final text closes your side of the loop; it does not require the other person to approve the closure. The healthiest next move is usually the least dramatic one: return your attention to people and activities that respond with care.',
          'For future conversations, use a simple check before you send: is this specific, respectful, and easy to answer? If yes, send it once. Then let the response, or the continued silence, give you the information you need.'
        ],
        bullets: [
          'Specific: it reflects the actual conversation or plan.',
          'Respectful: it does not punish or pressure the other person.',
          'Complete: it does not depend on a reply×NxÚÚ$z{-®éÜj×rÀ¢FW67&—F–öã¢t'V–ÆBFF–ær&–òF†B—27V6–f–2Â6öæf–FVçBÂæBV7’Fò7F'B6öçfW'6F–öâg&öÒÂv—F†÷WB6÷VæF–ærf¶R÷"vVæW&–2ârÀ¢W†6W'C¢t7G&öærFF–ær&–ò—26†÷'F7WBFòF†R&–v‡B6öçfW'6F–öââ6†÷rö–çBöbf–WrÂæ÷BÆ—7Böb&WV—&VÖVçG2ârÀ¢FFS¢s##bÓbÓ3rÀ¢WFFVDC¢s##bÓrÓ#RrÀ¢&VF–æuF–ÖS¢s‚Ö–â&VBrÀ¢6FVv÷'“¢tFF–ær&öf–ÆW2rÀ¢¶W—v÷&G3¢²vFF–ær&–ò–FV2f÷"wW—2rÂv&W7BFF–ær&öf–ÆR&–òrÂvgVæç’FF–ær&–ò–FV2rÂv†÷rFòw&—FRFF–ær&öf–ÆRuÒÀ¢6V7F–öç3¢°¢°¢†VF–æs¢tv—fRV÷ÆRâ÷Væ–ær–ç7FVBöb,:—7VÜ:’rÀ¢&w&‡3¢°¢r$’Æ–¶RfööBÂG&fVÂÂæB†f–ærgVâ"—2G'VRf÷"ÆÖ÷7BWfW'–öæRÂ6ò—Bv—fW2ÖF6‚æ÷v†W&RFò&Vv–ââFF–ær&–òv÷&·2&WGFW"v†Vâ—B–æ6ÇVFW2öæRf—f–BFWF–Ã¢F†RF—6‚–÷R6öö²&W7BÂF†R6—G’–÷Rv÷VÆB&Wf—6—BFöÖ÷'&÷rÂF†R†ö&'’–÷R&RöFFÇ’6ö×WF—F—fR&÷WBÂ÷"F†R6ÖÆÂ&÷WF–æRF†BÖ¶W2–÷W"vVV¶VæBfVVÂÆ–¶R–÷W'2â7V6–f–2FWF–Ç27&VFRæGW&ÂVW7F–öç2æB†VÇF†R&–v‡BW'6öâ&V6övæ—¦R–÷W"W'6öæÆ—G’ârÀ¢u–÷RFòæ÷BæVVBFòÆ—7BWfW'’–çFW&W7Bâ6†ö÷6RGvò÷"F‡&VRFWF–Ç2F†B†fRFW‡GW&RæBÆVfRÆ—GFÆR&ööÒf÷"7W&–÷6—G’â$’ÒÆV&æ–ærFòÖ¶R&W7FW&çBÖÆWfVÂ&ÖVâæB7F–ÆÂÆ÷6RBWfW'’&ö&BvÖR"—2Ö÷&RW6VgVÂF†âÆ—7Böb'&öBÆ&VÇ2âF†R&VFW"6â6²&÷WBF†R&ÖVâÂ6†ÆÆVævRF†RvÖR6Æ–ÒÂ÷"6†&RF†V—"÷vâö'6W76–öââ7G&öær&–òÖ¶W2F†RæW‡BÖW76vRö'f–÷W2âp¢ÒÀ¢'VÆÆWG3¢°¢r$’Ö¶RFævW&÷W6Ç’vööB'&V¶f7B'W'&—FòæBFVfVæB–æVÆRöâ—§¦â"rÀ¢r$–FVÂ7VæF“¢ÆöærvÆ²ÂæWr6öffVR6†÷ÂæB&WFVæF–ær’v–ÆÂÖVÂ&Wâ"rÀ¢r$’Ò6öÆÆV7F–ærÆö6Â&W7FW&çB&V6öÖÖVæFF–öç2æB&B¶&ö¶R7F÷&–W2â"p¢Ğ¢ÒÀ¢°¢†VF–æs¢uW6R6–×ÆR&–ò7G'V7GW&RrÀ¢&w&‡3¢°¢tW6VgVÂFF–ær&öf–ÆR&–ò6âföÆÆ÷rF‡&VR×'B7G'V7GW&S¢7V6–f–2FWF–ÂÂvÆ–×6Röb–÷W"Æ–fW7G–ÆRÂæBâ–çf—FF–öââF†RFWF–ÂÖ¶W2–÷RÖVÖ÷&&ÆRÂF†RÆ–fW7G–ÆRv—fW26öçFW‡BÂæBF†R–çf—FF–öâv—fW2ÖF6‚âV7’÷Væ–ærâf÷"W†×ÆRÂÖVçF–öâF†RÖVÂ–÷R&RG'––ærFòW&fV7BÂF†R¶–æBöbvVV¶VæB–÷RVæ¦÷’ÂæB6²f÷"F†R&W7BÆ6RFòvWBFW76W'BâF†—27G'V7GW&R¶VW2F†R&–ò6öæ6—6Rv—F†÷WBÖ¶–ær—BV×G’ârÀ¢u–÷W"–çf—FF–öâFöW2æ÷B†fRFò&RF—&V7B&WVW7BFòÖF6‚â—B6â&RÆ–gVÂVW7F–öâ÷"&VfW&Væ6RV÷ÆR6âç7vW"â%FVÆÂÖR–÷W"Ö÷7B÷fW'&FVBfööB÷–æ–öâ"7&VFW2Ö÷&RVæW&w’F†â&ÖW76vRÖR–b–÷RÆ–¶RfööBâ"F†RvöÂ—2æ÷BFòw&—FR6ÆWfW"W§¦ÆRâ—B—2FòÖ¶R–÷W"&öf–ÆRfVVÂÆ–¶RF†Rf—'7BGW&â–â6öçfW'6F–öââp¢ÒÀ¢'VÆÆWG3¢°¢tFWF–Ã¢v†B–÷R6öö²Â6öÆÆV7BÂ&7F–6RÂ÷"Çv—2æ÷F–6RârÀ¢tÆ–fW7G–ÆS¢†÷r–÷R7GVÆÇ’7VæBg&VRgFW&æööâârÀ¢t–çf—FF–öã¢&V6öÖÖVæFF–öâÂFV&FRÂ÷"Æ÷r×&W77W&RVW7F–öââp¢Ğ¢ÒÀ¢°¢†VF–æs¢u6÷VæB6öæf–FVçBv—F†÷WB6÷VæF–ærW&f÷&ÖF—fRrÀ¢&w&‡3¢°¢t6öæf–FVæ6R6÷VæG2Æ–¶R¶æ÷v–ærv†B–÷RVæ¦÷’Âæ÷BG'––ærFò–×&W72WfW'–öæRâW6Rv&ÒÂF—&V7BÆæwVvRæBFW67&–&RF†RÆ–fR–÷R&R'V–ÆF–ær–ç7FVBöbÆ—7F–ærFVÖæG2f÷"gWGW&R'FæW"â÷6—F—fR&VfW&Væ6R—2Ö÷&R–çf—F–ærF†â6ö×Æ–çBâ$’&V6–FRV÷ÆRv†ò&R7W&–÷W2æB¶–æB"v—fW26Vç6Röb–÷W"fÇVW3²ÆöærÆ—7Böbv†B–÷R&VgW6RFòFöÆW&FRÖ¶W2F†R&VFW"fVVÂÆ–¶RF†W’&RÇ––ærf÷"¦ö"ârÀ¢t‡VÖ÷"†VÇ2v†Vâ—B—26öææV7FVBFò6öÖWF†–ærG'VRâ6VÆbÖv&VæW726âÖ¶Râ÷&F–æ'’FWF–Â6†&Ö–ærÂ'WB¦ö¶W2F†BWB–÷W'6VÆb÷"÷F†W"V÷ÆRF÷vâ6âÖ¶RF†R&–òfVVÂFVfVç6—fRâ–b–÷RÖVçF–öâfÆrÂÆWB—B&RÆ–v‡BæB‡VÖâ&F†W"F†âv&æ–ærÆ&VÂâF†R&W7B&öf–ÆRfö–6R—2&VÆ†VBÂ7V6–f–2ÂæB&V6övæ—¦&ÆRg&öÒF†R†÷F÷2æB&ö×G2&÷VæB—Bâp¢Ğ¢ÒÀ¢°¢†VF–æs¢uw&—FRf÷"F†R6öçfW'6F–öâ–÷RvçBrÀ¢&w&‡3¢°¢u–÷W"&–ò—2æ÷BöæÇ’F†W&RFò6öÆÆV7BÆ–¶W2â—B†VÇ2GG&7B6öçfW'6F–öç2F†Bf—B–÷W"–çFW&W7G2æBVæW&w’â–b–÷RvçBFòÖVWB6öÖVöæRv†òVæ¦÷—2G'––æræWrÆ6W2ÂÖVçF–öâ&W7FW&çB–÷RvçBFòFW7Bâ–b–÷R&VfW"V–WBvVV¶VæG2ÂÖ¶RF†B6÷VæBÆ–¶RÆ–fR–÷RVæ¦÷’&F†W"F†ââöÆöw’â&öf–ÆR&V6öÖW2Ö÷&RW6VgVÂv†Vâ—BFVÆÇ26öÖVöæRv†B&V–ær&÷VæB–÷RÖ–v‡BfVVÂÆ–¶RârÀ¢tfö–BG'––ærFòVÂFòWfW'’÷76–&ÆRÖF6‚v—F‚F†R6fW7BfW'6–öâöb–÷W'6VÆbâvVæW&ÂÆæwVvRÖ’6VVÒ'&öFÇ’66WF&ÆRÂ'WB—B—2V7’Fòf÷&vWBâ6ÆV"ö–çBöbf–Wrv—fW26ö×F–&ÆRV÷ÆR&V6öâFòÖW76vR–÷RæBv—fW2–æ6ö×F–&ÆRV÷ÆRW&Ö—76–öâFò¶VW67&öÆÆ–ærâF†B—2W6VgVÂf–ÇFW&–ærÂæ÷Bf–ÇW&Râp¢Ğ¢ÒÀ¢°¢†VF–æs¢uG'’fWrfW'6–öç2æBVF—Bf÷"6Æ&—G’rÀ¢&w&‡3¢°¢töæR&–ò&&VÇ’6GW&W2WfW'’'Böb–÷W"W'6öæÆ—G’âG'’gVæç’fW'6–öâÂ&VÆ†VBfW'6–öâÂæBÖ÷&RF—&V7BfW'6–öâÂF†Vâ6ö×&RF†VÒv—F‚–÷W"†÷F÷2âF†R7G&öævW7B÷F–öâW7VÆÇ’†26ÆV"f—'7BÆ–æRÂGvò÷"F‡&VR6öæ7&WFRFWF–Ç2ÂæBæòVææV6W76'’W‡ÆæF–öââ&VB—B÷WBÆ÷VBâ–b‡&6R6÷VæG2Æ–¶RÖ&¶WF–ær6÷’÷"Æ–æR–÷Rv÷VÆBæWfW"6’Â&WÆ6R—Bv—F‚6–×ÆW"ÆæwVvRârÀ¢t6²v†WF†W"V6‚6VçFVæ6Rv—fW2ÖF6‚6öÖWF†–ærFò6²Â&V7BFòÂ÷"&VÖVÖ&W"â&VÖ÷fR&WVFVBF¦V7F—fW2æB'&öB6Æ–×27V6‚2&Æ÷fRFòÆVv‚â"&WÆ6RF†VÒv—F‚F†R6—GVF–öâF†BÖ¶W2–÷RÆVv‚â&—§¢Ö7FW"6âGW&â–÷W"–çFW&W7G2–çFò6WfW&Â&–òF—&V7F–öç2v†Vâ–÷R&R7F&–ærB&Ææ²&öf–ÆR&÷‚Â'WB–÷R6†÷VÆBÇv—26†ö÷6RF†RfW'6–öâF†BfVVÇ2†öæW7BVæ÷Vv‚FòÆ—fRWFòâp¢Ğ¢ÒÀ¢°¢†VF–æs¢t¶VWF†R&–ò7W'&VçBæBV7’Fò&W7öæBFòrÀ¢&w&‡3¢°¢tFF–ær&öf–ÆR6†÷VÆB6†ævRv†Vâ–÷W"Æ–fR6†ævW2âWFFRâöÆB&VfW&Væ6RÂ&WÆ6RvVæW&–2FWF–Âv—F‚6öÖWF†–ær–÷R&RFö–æræ÷rÂæB6†V6²F†BF†R&–ò7F–ÆÂÖF6†W2–÷W"†÷F÷2â7W'&VçB&öf–ÆRv—fW2ÖF6‚Ö÷&R67W&FR&V6öâFò7F'B6öçfW'6F–öââ—BÇ6ò6†÷w2F†B–÷R&R'F–6—F–ær–âF†RW‡W&–Væ6R&F†W"F†âÆVf–ærvRVçF÷V6†VBf÷"–V'2ârÀ¢tVæBv—F‚â÷Væ–ærÂæ÷BFVÖæBâ6†÷'BVW7F–öâÂ&V6öÖÖVæFF–öâ&WVW7BÂ÷"Æ–gVÂFV&FR—2Væ÷Vv‚â–÷W"&–òFöW2æ÷BæVVBFò6öçf–æ6RWfW'–öæRâ—BæVVG2FòÖ¶RF†R&–v‡BW'6öâF†–æ²Â$’¶æ÷rv†B’v÷VÆB6’FòF†Bâ"p¢Ğ¢ÒÀ¢°¢†VF–æs¢tFF–ær&–ò6†V6¶Æ—7Bf÷"7G&öævW"&öf–ÆRrÀ¢&w&‡3¢°¢u&VBF†R&–ò2–b–÷RvW&RÖF6‚6VV–ær—Bf÷"F†Rf—'7BF–ÖRâ6â–÷R–FVçF–g’v†BF†—2W'6öâVæ¦÷—2Â†÷rF†W’7VæBF–ÖRÂæBv†BÖW76vRv÷VÆB&RV7’Fò6VæCò–bF†Rç7vW"—2æòÂ&WÆ6RöæR'&öB6Æ–Òv—F‚66VæR÷"FWF–Ââ7v$’Æ÷fRGfVçGW&W2"f÷"F†R¶–æBöbGfVçGW&R–÷R7GVÆÇ’&WVBâ7v$’ÒV7–vö–ær"f÷"F†R7VæF’&÷WF–æRF†B6†÷w2—BârÀ¢uF†Vâ6†V6²F†R&Ææ6Râ–÷W"&öf–ÆR6†÷VÆB6öçF–âÖ÷&R–çf—FF–öç2F†â&WV—&VÖVçG2ÂÖ÷&R7W&–÷6—G’F†â6ö×Æ–çG2ÂæBVæ÷Vv‚6öæf–FVæ6RFò6÷VæBÆ–¶RÆ–fR–÷RVæ¦÷’âfWr7V6–f–2Æ–æW2&RVæ÷Vv‚v†VâF†W’&R7W÷'FVB'’†÷F÷2F†BfVVÂ7W'&VçBâF†RvöÂ—2æ÷BW&fV7B&–ó²—B—26ÆV"Â†öæW7B7F'F–ærö–çBf÷"F†R¶–æBöb6öçfW'6F–öâ–÷RvçBâp¢ÒÀ¢'VÆÆWG3¢°¢töæRFWF–ÂÖF6‚6÷VÆB6²&÷WBârÀ¢töæRvÆ–×6Röb–÷W"&VÂ&÷WF–æRârÀ¢töæRÆ÷r×&W77W&R–çf—FF–öâFò&W7öæBâp¢Ğ¢Ğ¢Ğ¢ÒÀ¢°¢6ÇVs¢wv†B×Fò×FW‡BÖgFW"ÖÖf—'7BÖFFRrÀ¢F—FÆS¢uv†BFòFW‡BgFW"f—'7BFFRrÀ¢FW67&—F–öã¢t¶æ÷rv†BFòFW‡BgFW"f—'7BFFR6ò–÷W"ÖW76vRfVVÇ26ÆV"Âv&ÒÂæB6öæf–FVçBv—F†÷WB÷fW'F†–æ¶–ærWfW'’v÷&BârÀ¢W†6W'C¢uF†R&W7B÷7BÖFFRFW‡B—2F–ÖVÇ’Â7V6–f–2ÂæB†öæW7B&÷WBVæ¦÷––ærF†RF–ÖRFövWF†W"ârÀ¢FFS¢s##bÓbÓ#rrÀ¢WFFVDC¢s##bÓrÓ#RrÀ¢&VF–æuF–ÖS¢srÖ–â&VBrÀ¢6FVv÷'“¢tFF–ærGf–6RrÀ¢¶W—v÷&G3¢²wv†BFòFW‡BgFW"f—'7BFFRrÂvf—'7BFFRföÆÆ÷rWFW‡BrÂwFW‡BgFW"vööBFFRrÂv†÷rFò6²f÷"6V6öæBFFRuÒÀ¢6V7F–öç3¢°¢°¢†VF–æs¢u6VæBF†R6–×ÆRfW'6–öâv†–ÆRF†RÖVÖ÷'’—2g&W6‚rÀ¢&w&‡3¢°¢u–÷RFòæ÷BæVVBFòv—BF‡&VRF—2÷"w&—FRW&fV7B&w&‚gFW"f—'7BFFRâ–b–÷RVæ¦÷–VBF†RFFRÂ6’6òv†–ÆRF†RÖVÖ÷'’—2g&W6‚âÖVçF–öâöæR&VÂÖöÖVçBg&öÒF†RWfVæ–ærÂF†VâÖ¶R–÷W"–çFW&W7B6ÆV"â7V6–f–6—G’Ö¶W26†÷'BFW‡BfVVÂW'6öæÂ&V6W6R—B&÷fW2–÷RvW&R&W6VçBâ—BÇ6òv—fW2F†R÷F†W"W'6öâ6öÖWF†–ær&WGFW"Fò&W7öæBFòF†âfwVR&†BgVââ"rÀ¢uF–Ö–ærFöW2æ÷BæVVBFò&RvÖRâ6VæBF†RÖW76vRv†Vâ—BfVVÇ2æGW&ÂÂv†WF†W"F†B—2v†Vâ–÷RvWB†öÖR÷"F†RæW‡BÖ÷&æ–ærâv&ÒföÆÆ÷r×W—2æ÷BæVVG’v†Vâ—B—2†öæW7BæBÆVfW2&ööÒf÷"F†V—"&W7öç6Râ–÷R&Ræ÷B6¶–ærF†VÒFòFV6–FRF†RVçF—&RgWGW&RöbF†R6öææV7F–öââ–÷R&R6–×Ç’6¶æ÷vÆVFv–ærvööBW‡W&–Væ6RæB÷Væ–ærF†RFö÷"Fòæ÷F†W"öæRâp¢ÒÀ¢'VÆÆWG3¢°¢r$’†Bw&VBF–ÖRFöæ–v‡BÒ–÷W"6öö¶–ærÖ6Æ727F÷'’7F–ÆÂ†2ÖRÆVv†–ærâ"rÀ¢r%F†Bv2gVââ’Ò7F–ÆÂF†–æ¶–ær&÷WBF†RFW76W'BÆ6R–÷RÖVçF–öæVBâ"rÀ¢r$ÖFR—B†öÖRÂæB’ÒvÆBvRf–æÆÇ’F–BF†Bâ’v÷VÆBÆ–¶RFò6VR–÷Rv–ââ"p¢Ğ¢ÒÀ¢°¢†VF–æs¢tÖ¶RF†RÖW76vR7V6–f–2v—F†÷WB÷fW"×w&—F–ær—BrÀ¢&w&‡3¢°¢tvööB÷7BÖFFRFW‡BW7VÆÇ’æVVG2öæRFWF–ÂÂöæRfVVÆ–ærÂæBöæR6ÆV"F—&V7F–öââF†RFWF–ÂÖ–v‡B&R7F÷'’Â&W7FW&çBÂ6†&VB¦ö¶RÂ÷"6ÖÆÂÖöÖVçB–÷Ræ÷F–6VBâF†RfVVÆ–ær6â&R26–×ÆR2$’†Bw&VBF–ÖR"÷"$’Væ¦÷–VBFÆ¶–ærv—F‚–÷Râ"F†RF—&V7F–öâ6â&Râ–çf—FF–öâÂ&öÖ—6RFò6öçF–çVRF÷–2Â÷"VW7F–öâ&÷WBF†V—"WfVæ–ærârÀ¢tFòæ÷BGW&âF†RföÆÆ÷r×W–çFò&Wf–WröbF†RFFRâ–÷RFòæ÷BæVVBFòW‡Æ–âWfW'’ÖöÖVçB–÷RÆ–¶VB÷"öÆöv—¦Rf÷"ç—F†–ærF†BfVÇB6Æ–v‡FÇ’v·v&BâV&Ç’FFW2&RÆÆ÷vVBFò&R–×W&fV7Bâ6†÷'BÖW76vRv—F‚v&×F‚æB6Æ&—G’—2Ö÷&RGG&7F—fRF†â6&VgVÆÇ’VF—FVBW76’F†B6÷VæG2VæÆ–¶R–÷Râp¢Ğ¢ÒÀ¢°¢†VF–æs¢u7VvvW7B6V6öæBFFRv†Vâ—BfVVÇ2&–v‡BrÀ¢&w&‡3¢°¢t6ÆV"–çf—FF–öâ—2V6–W"Fò&W7öæBFòF†âfwVRVçF‡W6–6ÒâöffW"6–×ÆRÆâv—F‚Æ—GFÆRfÆW†–&–Æ—G“¢F’Ââ7F—f—G’Â÷"Æ6R6öææV7FVBFò6öÖWF†–ær–÷RF—67W76VBâ–bF†W’ÖVçF–öæVBff÷&—FRÖ&¶WBÂ7VvvW7Bf—6—F–ær—Bâ–b–÷RFV&FVB&W7FW&çBÂ6²v†WF†W"F†W’vçBFòFW7B—BFövWF†W"â7V6–f–2–FVv—fW2F†RæW‡B6öçfW'6F–öâ6†Rv—F†÷WBÖ¶–ær—BfVVÂÆ–¶R6öçG&7BârÀ¢u–÷R6â&RF—&V7Bv—F†÷WBWGF–ær&W77W&RöâF†R÷F†W"W'6öââ$’v÷VÆBÆ–¶RFò6VR–÷Rv–âÒ&R–÷Rg&VRæW‡BvVV³ò"—26ÆV"æB&W7V7FgVÂâ–bF†W’æVVBF–ÖR÷"6ææ÷BÖ¶RF†R7VvvW7FVBF’Â’GFVçF–öâFòv†WF†W"F†W’öffW"æ÷F†W"÷F–öââ–çFW&W7BW7VÆÇ’&V6öÖW2V6–W"Fò&VBv†Vâ&÷F‚V÷ÆR&Rv–ÆÆ–ærFò†VÇÖ¶RÆââp¢ÒÀ¢'VÆÆWG3¢°¢t6öææV7BF†R–çf—FF–öâFò6öÖWF†–ær–÷RÇ&VG’FÆ¶VB&÷WBârÀ¢töffW"öæR6–×ÆRÆâ–ç7FVBöb6¶–ærf÷"âVæFVf–æVB†æv÷WBârÀ¢tÆVfR&ööÒf÷"–W2ÂæòÂ÷"æ÷F†W"F’v—F†÷WB&W77W&Râp¢Ğ¢ÒÀ¢°¢†VF–æs¢t†æFÆRVæ6W'F–çG’v—F†÷WB6VæF–ærç†–÷W2föÆÆ÷r×W2rÀ¢&w&‡3¢°¢t–bF†R&W7öç6R—26Æ÷vW"F†â–÷R†÷VBÂG'’æ÷BFò6VæB6V6öæBÖW76vRF†B6·2v†WF†W"F†W’&V6V—fVBF†Rf—'7BöæR÷"v†WF†W"F†RFFRv2Ö—7F¶RâV÷ÆR†fRF–ffW&VçB66†VGVÆW2ÂæBöæRFVÆ–VB&WÇ’FöW2æ÷BFVÆÂ–÷RWfW'—F†–ærâv—fRF†RÖW76vRVæ÷Vv‚&ööÒFò&V6V—fRâ†öæW7B&W7öç6Râ–÷W"f—'7BFW‡B6†÷VÆBæ÷B7&VFRæWrö&Æ–vF–öâf÷"F†VÒFòÖævR–÷W"ç†–WG’ârÀ¢t–bF†W’ç7vW"v&ÖÇ’'WB6ææ÷BÖ¶RF†Rf—'7BÆâÂ6VRv†WF†W"F†W’7VvvW7Bæ÷F†W"F–ÖRâ–bF†R&WÆ–W27F’fwVRÂ–÷R6âÖ¶RöæR6ÆV"GFV×BFò6öæf—&Ò–çFW&W7BæBF†Vâ7FW&6²â&W7V7FgVÂföÆÆ÷r×W—2W6VgVÂ&V6W6R—Bv—fW2–÷R–æf÷&ÖF–öââ&WVFVBW'7V6–öâFöW2æ÷B7&VFR×WGVÂ–çFW&W7C²—BöæÇ’Ö¶W2F†R6öçfW'6F–öâÆW726öÖf÷'F&ÆRf÷"&÷F‚V÷ÆRâp¢Ğ¢ÒÀ¢°¢†VF–æs¢t¶VWF†RFöæR6öç6—7FVçBv—F‚F†RFFRrÀ¢&w&‡3¢°¢t÷7BÖFFRÖW76vR6†÷VÆB6÷VæBÆ–¶RF†RW'6öâF†W’§W7BÖWBâ¶VWF†Rv&×F‚Â‡VÖ÷"ÂF—&V7FæW72Â÷"6ÆÒVæW&w’F†Bv2Ç&VG’F†W&Râ–b–÷RvW&RÆ–gVÂ–âW'6öâÂ–÷R6â–æ6ÇVFR6ÖÆÂ6ÆÆ&6²â–bF†RFFRv2F†÷Vv‡FgVÂæBV–WBÂ6–æ6W&RÖW76vRÖ’f—B&WGFW"F†âG&ÖF–2Æ–æRâ6öç6—7FVæ7’'V–ÆG2G'W7B&V6W6RF†RFW‡BFöW2æ÷BfVVÂÆ–¶R6ö×ÆWFVÇ’F–ffW&VçBfW'6–öâöb–÷RârÀ¢tFòæ÷BW6RvVæW&–2FF–ær67&—B–b—B&VÖ÷fW2F†RFWF–ÂF†BÖFRF†RFFRfVVÂW'6öæÂâF†RvöÂ—2æ÷BFòW&f÷&Ò6öæf–FVæ6Râ—B—2Fò6öÖ×Væ–6FR6ÆV&Ç’Væ÷Vv‚F†B&÷F‚V÷ÆR¶æ÷rv†BF†RæW‡B7FW6÷VÆB&Râ&—§¢Ö7FW"6âGW&âF†R7GVÂFFR6öçFW‡B–çFòfWræGW&ÂG&gG2Â'WB–÷W"§VFvÖVçB6†÷VÆB6†ö÷6RF†RöæRF†B7F–ÆÂ6÷VæG2Æ–¶R–÷Râp¢Ğ¢ÒÀ¢°¢†VF–æs¢uv†VâF†RfVVÆ–ær—2æ÷B×WGVÂrÀ¢&w&‡3¢°¢u6öÖWF–ÖW2FFR—2ÆV6çBæB7F–ÆÂFöW2æ÷BÆVBFò6V6öæBFFRâ–b–÷R&Ræ÷B–çFW&W7FVBÂ'&–Vb†öæW7BÖW76vR—2¶–æFW"F†âF—6V&–ærgFW"F†W’†fRföÆÆ÷vVBWâ–bF†R÷F†W"W'6öâ—2æ÷B–çFW&W7FVBÂÆWBF†V—"ç7vW"7FæBv—F†÷WBG'––ærFòæVv÷F–FRâ6ÆV"æò—2æ÷B6†ÆÆVævRFò÷fW&6öÖS²—B—2W6VgVÂ–æf÷&ÖF–öâF†B&÷FV7G2&÷F‚V÷ÆRg&öÒÖ÷&RVæ6W'F–çG’ârÀ¢uF†R&W7Bf—'7BÖFFRföÆÆ÷r×W—2æ÷BF†RöæRF†BwV&çFVW2&W7VÇBâ—B—2F†RöæRF†B&W&W6VçG2–÷R67W&FVÇ’æBv—fW2F†R÷F†W"W'6öâ6öÖf÷'F&ÆRv’Fò&W7öæBâ&R7V6–f–2Â&RF–ÖVÇ’ÂæBÆWBF†RæW‡B7FW&R×WGVÂâF†B—2†÷rvööBÖW76vR&V6öÖW2F†R&Vv–ææ–æröb&WGFW"6öçfW'6F–öââp¢Ğ¢ÒÀ¢°¢†VF–æs¢t6–×ÆR6†V6¶Æ—7Bf÷"–÷W"÷7BÖFFRFW‡BrÀ¢&w&‡3¢°¢t&Vf÷&R6VæF–ærÂ6†V6²F†BF†RÖW76vR–æ6ÇVFW2öæR7V6–f–2ÖVÖ÷'’ÂöæR†öæW7B6–væÂöb–çFW&W7BÂæBöæR6öÖf÷'F&ÆRæW‡B7FWâ–b–÷R&Ræ÷B&VG’Fò7VvvW7Bæ÷F†W"FFRÂF†RæW‡B7FW6â6–×Ç’&RVW7F–öâ&÷WB6öÖWF†–ær–÷RF—67W76VBâ–b–÷RFòvçBFòÖVWBv–âÂ6’6ò6ÆV&Ç’âF—&V7BÖW76vR—2V6–W"Fòç7vW"F†â&w&‚f–ÆÆVBv—F‚†–çG2ârÀ¢uF†Vâ&VBF†RFW‡Böæ6R÷WBÆ÷VBæB&VÖ÷fRç—F†–ærF†B6÷VæG2Æ–¶R7G&FVw’â–÷RFòæ÷BæVVBFòÖçVf7GW&RF—7Fæ6RÂ†–FRF†B–÷RVæ¦÷–VB–÷W'6VÆbÂ÷"FBW‡G&¦ö¶W2FòÖ¶RF†RÖW76vR–×&W76—fRâf—'7BÖFFRföÆÆ÷r×Wv÷&·2v†Vâ—BfVVÇ2Æ–¶RæGW&Â6öçF–çVF–öâöbF†RW'6öâF†W’§W7BÖWBâ6ÆV"Âv&ÒÂæB7V6–f–2—2Væ÷Vv‚âp¢ÒÀ¢'VÆÆWG3¢°¢u7V6–f–2ÖVÖ÷'“¢6†÷rF†B–÷RvW&R&W6VçBârÀ¢t†öæW7BfVVÆ–æs¢6’v†WF†W"–÷RVæ¦÷–VBF†RFFRârÀ¢t6ÆV"æW‡B7FW¢–çf—FR&W7öç6Rv—F†÷WB&W77W&Râp¢Ğ¢Ğ¢Ğ¢Ğ¥Ó° ¦W‡÷'B6öç7BvWD&Æöu÷7BÒ‡6ÇVs¢7G&–ær’Óâ$Äôuõõ5E2æf–æB‚‡÷7B’Óâ÷7Bç6ÇVrÓÓÒ6ÇVr“°