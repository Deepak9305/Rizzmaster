import { GoogleAuth } from '@codetrix-studio/capacitor-google-auth';
import { supabase } from './supabaseClient';
import { runtimeConfig } from './runtimeConfig';
import { canUseNativeGoogleAuth, isNativeShellApp } from './nativeCapabilities';

export const normalizeAuthError = (error: unknown, context: 'google' | 'email') => {
    const details = error as { message?: unknown; code?: unknown } | null;
    const raw = typeof details?.message === 'string' ? details.message : (typeof error === 'string' ? error : '');
    const message = raw.toLowerCase();
    const code = String(details?.code ?? '');
    if (context === 'google' && code === '10') return 'Google sign-in is not configured for this Android build. Check the app package and signing certificate in Google Cloud, then try again.';
    if (code === '12501' || message.includes('cancel')) return 'Google sign-in was cancelled. Try again when you’re ready.';
    if (message.includes('invalid login credentials')) return 'Incorrect email or password.';
    if (message.includes('email not confirmed')) return 'Confirm your email before signing in.';
    if (message.includes('user already registered')) return 'This email already has an account. Sign in instead.';
    if (message.includes('password') && (message.includes('weak') || message.includes('at least') || message.includes('valid password'))) return 'Use a stronger password with at least 6 characters.';
    if (message.includes('timeout') || message.includes('timed out') || message.includes('abort')) return 'Sign-in took too long. Check your connection and try again.';
    if (code === '7' || message.includes('network') || message.includes('fetch') || message.includes('retrieving access token')) return 'Sign-in could not reach Google or the authentication service. Check your connection and try again.';
    if (message.includes('audience')) return 'Google sign-in is temporarily unavailable. Please use email sign-in.';
    return raw || 'Sign-in failed. Please try again.';
};

export const AuthService = {
    googleInitialized: false,
    googleInitPromise: null as Promise<void> | null,
    googleSignInPromise: null as Promise<Awaited<ReturnType<typeof GoogleAuth.signIn>>> | null,
    // Keep a failed native bridge from leaving the login button spinning for
    // minutes, while allowing enough time for the account picker on slower
    // devices and networks.
    GOOGLE_WAIT_TIMEOUT_MS: 45_000,
    GOOGLE_INIT_TIMEOUT_MS: 12_000,

    async withTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
            return await Promise.race([operation, new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('Sign-in timed out')), milliseconds);
            })]);
        } finally {
            if (timer) clearTimeout(timer);
        }
    },

    async initializeGoogle() {
        if (this.googleInitialized) return;
        if (!this.googleInitPromise) {
            // Native builds also carry the client ID in Capacitor's plugin
            // config and Android resources. This lets a bundled fallback UI
            // initialize Google Auth even when Vite has no runtime env vars.
            const options: { clientId?: string; scopes: string[]; grantOfflineAccess: boolean } = {
                scopes: ['profile', 'email'],
                grantOfflineAccess: false,
            };
            if (runtimeConfig.googleClientId) options.clientId = runtimeConfig.googleClientId;
            const operation = GoogleAuth.initialize(options);
            this.googleInitPromise = operation;
            void operation.then(() => {
                this.googleInitialized = true;
                if (this.googleInitPromise === operation) this.googleInitPromise = null;
            }, () => {
                if (this.googleInitPromise === operation) this.googleInitPromise = null;
            });
        }
        await this.withTimeout(this.googleInitPromise, this.GOOGLE_INIT_TIMEOUT_MS);
    },

    async signOutGoogle() {
        if (!canUseNativeGoogleAuth()) return;
        await this.initializeGoogle();
        await this.withTimeout(GoogleAuth.signOut(), this.GOOGLE_INIT_TIMEOUT_MS);
    },

    async signInGoogle() {
        if (!supabase || !runtimeConfig.authAvailable) throw new Error('Sign-in is currently unavailable. Please try again later.');
        if (isNativeShellApp() && !canUseNativeGoogleAuth()) {
            // Google OAuth in an embedded WebView cannot replace the native picker.
            throw new Error('Google sign-in is unavailable in this app build. Please use email sign-in.');
        }
        if (!canUseNativeGoogleAuth()) {
            const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: runtimeConfig.webAuthRedirectUrl || window.location.origin },
            });
            if (error) throw error;
            return 'redirect' as const;
        }
        await this.initializeGoogle();
        if (this.googleSignInPromise) throw new Error('Google sign-in is still open. Finish or close the account picker before trying again.');
        // New APKs can return the ID token directly. Older APKs ignore the
        // option and keep their existing plugin behavior.
        const operation = (GoogleAuth.signIn as (options?: { skipAccessToken: boolean }) => ReturnType<typeof GoogleAuth.signIn>)({ skipAccessToken: true });
        this.googleSignInPromise = operation;
        const release = () => { if (this.googleSignInPromise === operation) this.googleSignInPromise = null; };
        void operation.then(release, release);
        const user = await this.withTimeout(operation, this.GOOGLE_WAIT_TIMEOUT_MS);
        const token = user?.authentication?.idToken || (user as typeof user & { idToken?: string })?.idToken;
        if (!token) throw new Error('Google did not complete sign-in. Please try again or use email sign-in.');
        const { data, error } = await supabase.auth.signInWithIdToken({ provider: 'google', token });
        if (error) throw error;
        if (!data.session?.user) throw new Error('Sign-in did not create a session. Please try again.');
        return 'signed-in' as const;
    },
};
