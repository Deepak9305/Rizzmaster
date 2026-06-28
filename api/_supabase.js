import { createClient } from '@supabase/supabase-js';

const createServerClient = (url, key) => createClient(url, key, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
export const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
export const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createServerClient(supabaseUrl, supabaseAnonKey)
  : null;

export const supabaseAdmin = supabaseUrl && supabaseServiceKey
  ? createServerClient(supabaseUrl, supabaseServiceKey)
  : null;
