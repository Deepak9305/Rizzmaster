import { createClient } from '@supabase/supabase-js';

// Access environment variables securely
// Supports both VITE_ standard (modern) and REACT_APP_ legacy (if defined in vite.config)
const supabaseUrl = (import.meta as any).env?.VITE_SUPABASE_URL || process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || process.env.REACT_APP_SUPABASE_ANON_KEY;

// Export supabase instance
export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey)
  : null;