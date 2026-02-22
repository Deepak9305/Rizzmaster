
export enum InputMode {
  CHAT = 'CHAT',
  BIO = 'BIO'
}

export interface UserProfile {
  id: string;
  email?: string;
  credits: number;
  is_premium: boolean;
  last_daily_reset: string;
}

export interface SavedItem {
  id: string;
  user_id: string;
  content: string;
  type: 'tease' | 'smooth' | 'chaotic' | 'bio' | 'system';
  created_at: string;
}

export interface RizzResponse {
  tease: string;
  smooth: string;
  chaotic: string;
  loveScore: number;
  potentialStatus: string;
  analysis: string;
}

export interface BioResponse {
  bio: string;
  analysis: string;
}

export interface RizzError {
  potentialStatus: string;
  analysis: string;
}

export interface BioError {
  analysis: string;
}

export type RizzOrBioResponse = RizzResponse | BioResponse | RizzError | BioError;
