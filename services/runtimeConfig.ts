export interface FrontendRuntimeConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  googleClientId?: string;
  webAuthRedirectUrl?: string;
  authAvailable: boolean;
}

const readEnv = (key: string): string | undefined => {
  const viteValue = (import.meta as any).env?.[key];
  if (typeof viteValue === 'string' && viteValue.trim()) {
    return viteValue.trim();
  }

  const legacyValue = (process.env as Record<string, string | undefined>)[key];
  if (typeof legacyValue === 'string' && legacyValue.trim()) {
    return legacyValue.trim();
  }

  return undefined;
};

const normalizeUrl = (value?: string) => {
  if (!value) return undefined;
  return value.replace(/\/+$/, '');
};

const supabaseUrl = normalizeUrl(readEnv('VITE_SUPABASE_URL') || readEnv('REACT_APP_SUPABASE_URL'));
const supabaseAnonKey = readEnv('VITE_SUPABASE_ANON_KEY') || readEnv('REACT_APP_SUPABASE_ANON_KEY');
const googleClientId = readEnv('VITE_GOOGLE_CLIENT_ID');
const webAuthRedirectUrl = normalizeUrl(readEnv('VITE_AUTH_REDIRECT_URL'));

export const runtimeConfig: FrontendRuntimeConfig = {
  supabaseUrl,
  supabaseAnonKey,
  googleClientId,
  webAuthRedirectUrl,
  authAvailable: Boolean(supabaseUrl && supabaseAnonKey),
};

export const getAuthUnavailableMessage = () => {
  if (runtimeConfig.authAvailable) {
    return null;
  }

  return 'Login is unavailable because Supabase auth is not configured for this build.';
};
