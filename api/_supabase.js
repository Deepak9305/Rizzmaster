import { createClient } from '@supabase/supabase-js';

const createServerClient = (url, key) => createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const normalizeUrl = (value) => value ? value.replace(/\/+$/, '') : value;

export const supabaseUrl = normalizeUrl(readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'REACT_APP_SUPABASE_URL'));
export const supabaseAnonKey = readEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'REACT_APP_SUPABASE_ANON_KEY');
export const supabaseServiceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

export const supabase = supabaseUrl && supabaseAnonKey
  ? createServerClient(supabaseUrl, supabaseAnonKey)
  : null;

export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createServerClient(supabaseUrl, supabaseServiceKey)
  : null;
