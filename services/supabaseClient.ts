import { createClient } from '@supabase/supabase-js';
import { Preferences } from '@capacitor/preferences';

const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

// Custom storage adapter using Capacitor Preferences for native persistence
const capacitorStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const { value } = await Preferences.get({ key });
    return value;
  },
  setItem: async (key: string, value: string): Promise<void> => {
    await Preferences.set({ key, value });
  },
  removeItem: async (key: string): Promise<void> => {
    await Preferences.remove({ key });
  }
};

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
    auth: {
      storage: capacitorStorageAdapter,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true
    }
  })
  : null;