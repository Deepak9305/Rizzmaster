import { createClient } from '@supabase/supabase-js';

// Access environment variables securely
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

// Export supabase instance only if keys are present, otherwise export null to trigger Guest Mode
export const supabase = (supabaseUrl && supabaseKey) 
  ? createClient(supabaseUrl, supabaseKey) 
  : null;