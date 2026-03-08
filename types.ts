
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
  type: 'smooth' | 'chaotic' | 'bio' | 'system';
  created_at: string;
}

export interface RizzResponse {
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

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

export interface ChatResponse {
  reply: string;
  vibe: 'smooth' | 'chaos';
}

export interface CoachMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

export interface CoachResponse {
  reply: string;
  analysis?: string;
}

