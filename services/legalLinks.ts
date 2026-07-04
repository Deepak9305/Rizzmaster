const APP_PUBLIC_BASE_URL = 'https://rizzmaster.online';

const joinUrl = (path: string) => `${APP_PUBLIC_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;

export const LEGAL_LINKS = {
  baseUrl: APP_PUBLIC_BASE_URL,
  privacy: joinUrl('/privacy'),
  terms: joinUrl('/terms'),
  support: joinUrl('/support'),
  supportEmail: 'mailto:rizzmasterhelpteam@gmail.com',
  featureRequestEmail: 'mailto:rizzmasterhelpteam@gmail.com?subject=Feature%20Request',
} as const;
