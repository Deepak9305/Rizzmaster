import { createClient } from '@supabase/supabase-js';
import { runtimeConfig } from './runtimeConfig';
import { createAuthFetch } from './authRequest';

export const supabase = (runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey)
  ? createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
      global: { fetch: createAuthFetch() },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
