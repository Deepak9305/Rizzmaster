
export enum InputMode {
  CHAT = 'CHAT',
  BIO = 'BIO'
}

export type ResponseLength = 'short' | 'medium' | 'long';

export interface UserProfile {
  id: string;
  email?: string;
  credits: number;
  is_premium: boolean;
  last_daily_reset: string;
  shadow_notes?: string | null;
  premium_source?: string | null;
  streak_count?: number;
  last_streak_claim?: string | null;
  total_time_spent_ms?: number;
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

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
  image?: string | null;
  systemContext?: string | null;
  timestamp: string;
}

export interface CoachResponse {
  reply: string;
}

export interface CustomPersona {
  id: string;
  name: string;
  instruction: string;
}
