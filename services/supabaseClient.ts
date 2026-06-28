import { createClient } from '@supabase/supabase-js';
import { Capacitor } from '@capacitor/core';
import { runtimeConfig } from './runtimeConfig';

export const supabase = (runtimeConfig.supabaseUrl && runtimeConfig.supabaseAnonKey)
  ? createClient(runtimeConfig.supabaseUrl, runtimeConfig.supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: !Capacitor.isNativePlatform(),
      },
    })
  : null;
