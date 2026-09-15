export type MarketingLegalPageKey = 'privacy' | 'terms' | 'support';

export interface MarketingLegalSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface MarketingLegalPage {
  eyebrow: string;
  title: string;
  intro: string;
  updatedAt: string;
  sections: MarketingLegalSection[];
  actionLabel: string;
  actionHref: string;
}

export const MARKETING_LEGAL_PAGES: Record<MarketingLegalPageKey, MarketingLegalPage> = {
  privacy: {
    eyebrow: 'Your data matters',
    title: 'Privacy Policy',
    intro: 'This policy explains what Rizz Master processes, why it is needed, and the choices available when you use our web app, Android app, or support channels.',
    updatedAt: 'September 7, 2026',
    sections: [
      {
        heading: 'Who we are',
        paragraphs: [
          'Rizz Master is an AI dating assistant operated by Vantalum Studio. For privacy questions, data requests, or account help, contact rizzmasterhelpteam@gmail.com.'
        ]
      },
      {
        heading: 'Information we collect',
        paragraphs: ['Depending on how you use the service, we may process the following information:'],
        bullets: [
          'Account details such as your email address, authentication provider, and profile preferences.',
          'Text, images, and conversation context that you choose to submit for a reply, bio, image analysis, or AI Coach result.',
          'Generated results and saved items that you explicitly save to your account.',
          'Credit usage, subscription status, purchase records, and provider identifiers needed to deliver premium access and prevent fraud.',
          'Technical and security information needed to operate the service, protect accounts, and diagnose failures.'
        ]
      },
      {
        heading: 'How we use information',
        paragraphs: ['We use information to provide and secure Rizz Master, authenticate your account, generate requested results, sync entitlements across web and Android, process support requests, prevent abuse, and improve reliability. We do not use your private conversation context as public marketing content.']
      },
      {
        heading: 'AI and uploaded content',
        paragraphs: ['Text and images are sent to the service providers needed to produce the feature you request. They may be processed temporarily for that request. Results are retained in your account when you choose to save them. Avoid submitting passwords, payment credentials, government identifiers, or information about another person that you do not have permission to share.']
      },
      {
        heading: 'Cookies and advertising',
        paragraphs: [
          'This site currently includes an ads.txt declaration, but the current application source does not serve Google AdSense ads. If advertising is enabled, Google and other authorized advertising partners may use cookies, local storage, or similar technologies to measure delivery, prevent fraud, and personalize ads where permitted.',
          'Before personalized advertising is enabled for visitors in the European Economic Area, the United Kingdom, or Switzerland, the site must present an appropriate consent choice through a Google-certified consent management platform or another legally appropriate mechanism. You can manage Google advertising choices through Google Ads Settings and your browser controls.'
        ]
      },
      {
        heading: 'Purchases and providers',
        paragraphs: ['Android subscriptions are processed by Google Play. Web subscriptions are processed by Dodo Payments. These providers receive the information needed to complete, verify, refund, or manage a purchase under their own privacy policies. Rizz Master receives verified transaction and entitlement information so premium access can be linked to your signed-in account.']
      },
      {
        heading: 'Data retention and deletion',
        paragraphs: ['We retain account and saved-item information while it is needed to provide the service or meet legitimate security and accounting requirements. You can request account deletion through the app support flow or by emailing us. Deletion removes account-owned data subject to records we must retain by law or for fraud prevention.']
      },
      {
        heading: 'Security and third parties',
        paragraphs: ['We use authentication, access controls, server-side verification, and other reasonable safeguards. No online service can guarantee absolute security. Service providers may process information on our behalf only for the functions they provide, such as hosting, authentication, AI generation, analytics, payments, and security.']
      },
      {
        heading: 'Your choices',
        paragraphs: ['You may access or update available profile information, stop submitting new content, delete saved items, request account deletion, and contact us about privacy concerns. Where consent is used for advertising, you may withdraw it through the available consent controls without changing the lawful processing that occurred before withdrawal.']
      },
      {
        heading: 'Contact',
        paragraphs: ['For privacy questions or requests, email rizzmasterhelpteam@gmail.com. Include enough account information for us to locate your request, but do not send a password or payment card number.']
      }
    ],
    actionLabel: 'Email privacy support',
    actionHref: 'mailto:rizzmasterhelpteam@gmail.com?subject=Privacy%20Request'
  },
  terms: {
    eyebrow: 'Use it thoughtfully',
    title: 'Terms of Service',
    intro: 'These terms describe the rules for using Rizz Master and the limits that apply to AI-generated suggestions, accounts, and subscriptions.',
    updatedAt: 'September 7, 2026',
    sections: [
      {
        heading: 'The service',
        paragraphs: ['Rizz Master provides AI-assisted conversation suggestions, profile ideas, image analysis, and coaching prompts for communication support and entertainment. AI output can be incomplete, incorrect, or unsuitable for a particular situation. Review every result before using it.']
      },
      {
        heading: 'Your responsibility',
        paragraphs: ['You are responsible for the messages you send, the decisions you make, and the information you submit. Do not use Rizz Master to impersonate someone, threaten or harass another person, break the law, violate privacy, or create content that is abusive, exploitative, or sexually explicit.']
      },
      {
        heading: 'Accounts and security',
        paragraphs: ['Keep your authentication credentials and devices secure. You must not access another person\'s account or attempt to bypass credits, premium checks, rate limits, or security controls. Tell support promptly if you believe your account was compromised.']
      },
      {
        heading: 'Subscriptions and billing',
        paragraphs: ['Android subscriptions are purchased and managed through Google Play. Web subscriptions are purchased and managed through Dodo Payments. Each provider controls its checkout, renewal, cancellation, refund, and payment methods under its applicable terms. Premium access is granted only after verified provider confirmation and is linked to the Rizz Master account used at checkout.']
      },
      {
        heading: 'Advertising',
        paragraphs: ['If advertising is added to public editorial pages, ads must remain clearly distinguishable from site content and navigation. You must not click your own ads, encourage clicks or views, use traffic-exchange services, or use the service to generate artificial ad activity.']
      },
      {
        heading: 'Ownership and feedback',
        paragraphs: ['You retain rights to content you submit, subject to the permissions needed to operate the requested feature. Rizz Master and its branding, software, and original editorial content remain owned by Vantalum Studio or its licensors. Feedback may be used to improve the service without creating an obligation to pay you.']
      },
      {
        heading: 'Availability and changes',
        paragraphs: ['Features, credits, models, and availability may change as the service develops. We may suspend access when necessary for security, legal compliance, abuse prevention, or maintenance. We may update these terms by posting a revised version on this page.']
      },
      {
        heading: 'Account deletion and contact',
        paragraphs: ['You can request account deletion through the app support flow or by contacting rizzmasterhelpteam@gmail.com. Questions about these terms should be sent to the same address.']
      }
    ],
    actionLabel: 'Contact support',
    actionHref: 'mailto:rizzmasterhelpteam@gmail.com?subject=Terms%20Question'
  },
  support: {
    eyebrow: 'We are here to help',
    title: 'Support Center',
    intro: 'Get help with account access, credits, AI generation, subscriptions, privacy requests, or a feature idea.',
    updatedAt: 'September 7, 2026',
    sections: [
      {
        heading: 'Contact support',
        paragraphs: ['Email rizzmasterhelpteam@gmail.com. Include the account email, device or browser, the approximate time of the issue, and a short description. Never include passwords, full payment card numbers, or purchase tokens.']
      },
      {
        heading: 'Credits and generation',
        paragraphs: ['Free credits reset daily. Text generation uses one credit and image generation uses two credits. Premium accounts receive unlimited access subject to fair-use, security, and service availability controls.']
      },
      {
        heading: 'Subscriptions',
        paragraphs: ['Manage Android subscriptions in Google Play. Manage web subscriptions through the Dodo Payments billing portal. Premium follows the same signed-in Rizz Master account after the provider confirms the purchase.']
      },
      {
        heading: 'Privacy and account deletion',
        paragraphs: ['Use the privacy policy for data details. You can request account deletion through the signed-in app support flow or by emailing us. Active web subscriptions may need to be cancelled before account deletion can complete.']
      },
      {
        heading: 'Common troubleshooting',
        bullets: [
          'Refresh the page and sign in again if your profile or premium status is stale.',
          'Use the same Rizz Master account when moving between web and Android.',
          'Check that your browser allows the site authentication redirect and required storage.',
          'For billing issues, include whether the purchase was made through Google Play or Dodo Payments.'
        ]
      },
      {
        heading: 'Feature ideas',
        paragraphs: ['Send suggestions to rizzmasterhelpteam@gmail.com with “Feature Request” in the subject.']
      }
    ],
    actionLabel: 'Email support',
    actionHref: 'mailto:rizzmasterhelpteam@gmail.com'
  }
};
