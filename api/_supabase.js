import { createClient } from '@supabase/supabase-js';

const readEnv = (...keys) => {
  for (const key of keys) {
    const value = process.env[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
};

const normalizeUrl = (value) => (value ? value.replace(/\/+$/, '') : value);

export const supabaseUrl = normalizeUrl(readEnv('SUPABASE_URL', 'VITE_SUPABASE_URL', 'REACT_APP_SUPABASE_URL'));
export const supabaseAnonKey = readEnv('SUPABASE_ANON_KEY', 'VITE_SUPABASE_ANON_KEY', 'REACT_APP_SUPABASE_ANON_KEY');
export const supabaseServiceKey = readEnv('SUPABASE_SERVICE_ROLE_KEY');

const baseClientOptions = {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
};

export const supabase = (supabaseUrl && supabaseAnonKey)
  ? createClient(supabaseUrl, supabaseAnonKey, baseClientOptions)
  : null;

export const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
  ? createClient(supabaseUrl, supabaseServiceKey, baseClientOptions)
  : null;

export const getBearerToken = (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
};

export const createRequestSupabaseClient = (token) => {
  if (!supabaseUrl || !supabaseAnonKey) {
    return null;
  }

  return createClient(supabaseUrl, supabaseAnonKey, {
    ...baseClientOptions,
    global: token
      ? {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      : undefined,
  });
};

export const getAuthenticatedUser = async (token) => {
  if (!supabase) {
    return {
      user: null,
      error: new Error('Supabase integration not configured on the server.'),
    };
  }

  const { data, error } = await supabase.auth.getUser(token);
  return {
    user: data?.user || null,
    error: error || null,
  };
};
