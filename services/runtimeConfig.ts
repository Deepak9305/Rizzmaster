import { Capacitor } from '@capacitor/core';

export interface FrontendRuntimeConfig {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  googleClientId?: string;
  webAuthRedirectUrl?: string;
  apiBaseUrl?: string;
  authAvailable: boolean;
}

declare const __APP_RUNTIME_ENV__: Record<string, string> | undefined;

const injectedEnv =
  typeof __APP_RUNTIME_ENV__ === 'object' && __APP_RUNTIME_ENV__
    ? __APP_RUNTIME_ENV__
    : {};

const readEnv = (key: string): string | undefined => {
  const viteValue = (import.meta as any).env?.[key];
  if (typeof viteValue === 'string' && viteValue.trim()) {
    return viteValue.trim();
  }

  const injectedValue = injectedEnv[key];
  if (typeof injectedValue === 'string' && injectedValue.trim()) {
    return injectedValue.trim();
  }

  const legacyValue =
    typeof process !== 'undefined'
      ? (process.env as Record<string, string | undefined>)?.[key]
      : undefined;
  if (typeof legacyValue === 'string' && legacyValue.trim()) {
    return legacyValue.trim();
  }

  return undefined;
};

const resolveEnv = (keys: string[]) => {
  for (const key of keys) {
    const value = readEnv(key);
    if (value) {
      return { value, source: key };
    }
  }

  return { value: undefined, source: undefined as string | undefined };
};

const normalizeUrl = (value?: string) => {
  if (!value) return undefined;
  return value.replace(/\/+$/, '');
};

const DEFAULT_API_BASE_URL = 'https://rizzmaster.online';

const originFromUrl = (value?: string) => {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
};

const isSafeDerivedApiOrigin = (value?: string) => {
  if (!value) return false;

  return (
    /^https?:\/\/localhost(?::\d+)?$/i.test(value) ||
    value === DEFAULT_API_BASE_URL
  );
};

const supabaseUrlEnv = resolveEnv(['VITE_SUPABASE_URL', 'REACT_APP_SUPABASE_URL', 'SUPABASE_URL']);
const supabaseAnonKeyEnv = resolveEnv(['VITE_SUPABASE_ANON_KEY', 'REACT_APP_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY']);
const googleClientIdEnv = resolveEnv(['VITE_GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID']);
const webAuthRedirectUrlEnv = resolveEnv(['VITE_AUTH_REDIRECT_URL', 'AUTH_REDIRECT_URL']);
const apiBaseUrlEnv = resolveEnv(['VITE_API_BASE_URL', 'API_BASE_URL']);

const supabaseUrl = normalizeUrl(supabaseUrlEnv.value);
const supabaseAnonKey = supabaseAnonKeyEnv.value;
const googleClientId = googleClientIdEnv.value;
const webAuthRedirectUrl = normalizeUrl(webAuthRedirectUrlEnv.value);
const derivedApiOrigin = originFromUrl(webAuthRedirectUrl);
const apiBaseUrl = normalizeUrl(
  apiBaseUrlEnv.value ||
  (isSafeDerivedApiOrigin(derivedApiOrigin) ? derivedApiOrigin : undefined) ||
  DEFAULT_API_BASE_URL
);

const authAvailable = Boolean(supabaseUrl && supabaseAnonKey);

export const runtimeConfig: FrontendRuntimeConfig = {
  supabaseUrl,
  supabaseAnonKey,
  googleClientId,
  webAuthRedirectUrl,
  apiBaseUrl,
  authAvailable,
};

export const runtimeConfigDiagnostics = {
  authAvailable: runtimeConfig.authAvailable,
  hasSupabaseUrl: Boolean(supabaseUrl),
  supabaseUrlSource: supabaseUrlEnv.source || 'missing',
  hasSupabaseAnonKey: Boolean(supabaseAnonKey),
  supabaseAnonKeySource: supabaseAnonKeyEnv.source || 'missing',
  hasGoogleClientId: Boolean(googleClientId),
  googleClientIdSource: googleClientIdEnv.source || 'missing',
  hasAuthRedirectUrl: Boolean(webAuthRedirectUrl),
  authRedirectUrlSource: webAuthRedirectUrlEnv.source || 'missing',
  hasApiBaseUrl: Boolean(apiBaseUrl),
  apiBaseUrlSource:
    apiBaseUrlEnv.source ||
    (isSafeDerivedApiOrigin(derivedApiOrigin) ? 'VITE_AUTH_REDIRECT_URL origin' : 'native-default'),
};

export const runtimeConfigDebugMessage = (
  `auth=${runtimeConfigDiagnostics.authAvailable ? 'supabase' : 'off'} | ` +
  `supabaseUrl=${runtimeConfigDiagnostics.hasSupabaseUrl ? runtimeConfigDiagnostics.supabaseUrlSource : 'missing'} | ` +
  `anonKey=${runtimeConfigDiagnostics.hasSupabaseAnonKey ? runtimeConfigDiagnostics.supabaseAnonKeySource : 'missing'} | ` +
  `google=${runtimeConfigDiagnostics.hasGoogleClientId ? runtimeConfigDiagnostics.googleClientIdSource : 'missing'} | ` +
  `api=${runtimeConfigDiagnostics.hasApiBaseUrl ? runtimeConfigDiagnostics.apiBaseUrlSource : 'missing'}`
);

console.log('[RuntimeConfig]', runtimeConfigDebugMessage, runtimeConfigDiagnostics);

export const getRuntimeConfigDebugMessage = () => runtimeConfigDebugMessage;

export const getApiUrl = (path: string) => {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  if (!Capacitor.isNativePlatform()) {
    return normalizedPath;
  }

  if (typeof window !== 'undefined' && window.location.origin === apiBaseUrl) {
    return normalizedPath;
  }

  return `${apiBaseUrl}${normalizedPath}`;
};

export const getAuthUnavailableMessage = () => {
  if (runtimeConfig.authAvailable) {
    return null;
  }

  return 'Login is unavailable because Supabase auth is not configured for this build.';
};
