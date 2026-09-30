# Rizzmaster Production App

Rizzmaster is an AI dating assistant mobile app using React, Vite, Capacitor, Supabase, AdMob, Google login, and Groq-hosted Llama AI models.

## Production Setup & Security Hardening

This repository has been hardened for production deployment. The following configurations are required to ensure a secure, stable production environment.

### 1. Environment Variables
You must provide the following environment variables during your production build process:

- `VITE_GOOGLE_CLIENT_ID`: Your Google OAuth Client ID for authentication.
- `VITE_SUPABASE_URL`: Your Supabase project URL.
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anon key.
- `VITE_AUTH_REDIRECT_URL`: The exact hosted web URL Supabase should return to after Google login.
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase server-only service role key for API routes. Never expose this with a `VITE_` prefix.
- `GROQ_API_KEY`: Your Groq API key for accessing Llama models.
- `IAP_ACCOUNT_BINDING_SECRET`: Preferred high-entropy server-only secret used to bind an Android purchase to the signed-in Rizzmaster account. If omitted, the API derives a domain-separated fallback from `SUPABASE_SERVICE_ROLE_KEY`; set this explicitly in Vercel Production for independent secret rotation. Never expose it with a `VITE_` prefix.
- `DODO_PAYMENTS_API_KEY`: Server-only Dodo Payments API key.
- `DODO_PAYMENTS_WEBHOOK_KEY`: Server-only signing key for `/api/dodo-webhook`.
- `DODO_PAYMENTS_ENVIRONMENT`: Explicitly `test_mode` or `live_mode`.
- `DODO_PAYMENTS_WEEKLY_PRODUCT_ID`: Dodo recurring product configured at `$4.99 USD` per week.
- `DODO_PAYMENTS_MONTHLY_PRODUCT_ID`: Dodo recurring product configured at `$15.99 USD` per month.
- `DODO_PAYMENTS_RETURN_URL`: Web return URL, normally `https://rizzmaster.online/billing/return`.
- `DODO_PAYMENTS_ENABLED`: Set to `true` only after products, webhook delivery, and the Supabase billing migration are verified.

Never give Dodo secrets a `VITE_` prefix. Use test credentials in Vercel Preview and live credentials in Production.

Create a `.env.production` or inject these via your CI/CD pipeline (e.g., Vercel, GitHub Actions) before running the build.

### 2. Supabase Setup
For the reporting system to function, you must manually create a `reports` table in your Supabase project:
- **Table Name**: `reports`
- **Columns**:
  - `id` (uuid, primary key, default: `gen_random_uuid()`)
  - `user_id` (uuid, nullable, references `public.profiles(id)`)
  - `content` (text)
  - `type` (text)
  - `created_at` (timestamp with time zone, default: `now()`)

Ensure Row Level Security (RLS) policies allow authenticated (and guest) inserts to this table, or simply allow all `INSERT` operations while restricting `SELECT` to admins.

Run the SQL in `supabase_schema.sql` and then `secure_premium_schema.sql` from the Supabase SQL Editor before deploying backend changes. Apply every file in `supabase/migrations/` to production before deploying code that depends on it, including `20260808161836_harden_premium_verification.sql` and `20260808161857_add_dodo_web_billing.sql`. New Supabase projects may require explicit Data API grants; the Dodo billing tables are intentionally service-role-only.

### 3. Database Functions (RPC)
For the account deletion feature to work correctly, you must execute the `public.delete_user()` function script found in `supabase_schema.sql` via the Supabase SQL Editor. This ensures that user data and authentication credentials are completely removed when a user deletes their account.

### 4. Build & Deployment
The project uses a localized Tailwind build process rather than a CDN.

1. Install dependencies: `npm install`
2. Build for production: `npm run build`
3. Sync Capacitor Android assets: `npx cap sync android`
4. Verify the native shell matches the declared Capacitor launch mode: `npm run verify:native-config`
5. Deploy native builds via Android Studio.

*Note: `npm run verify:native-config` compares the generated Android `server_url` against `capacitor.config.json`. In the current wrapper setup, Android is expected to load `https://rizzmaster.online` directly.*

AdMob regression checks: `npm run test:admob`. The Android `AdConsentState` bridge reads UMP's current `canRequestAds` after consent errors; it requires rebuilding and releasing the APK/AAB. Existing APKs use one bounded consent refresh retry and continue to block ads if permission cannot be verified. Website deployment alone cannot add a missing native plugin. Runtime logs under `[AdMob] Native capabilities` identify the platform, UI origin, and plugin availability; `[AdMob] UMP permission result` identifies consent blocking. Slow internet does not select bundled assets as a fallback.

Android monetization uses a bottom banner (`ca-app-pub-7381421031784616/7234804095`) and optional rewarded video only. Interstitials, their generation counters, and app-open configuration have been removed. The 320 × 50 dp banner starts on the free user's main screen, including guest sessions, after UMP permits requests; it does not wait for a generation. Premium users and ordinary browsers never request it.

The banner reserves a 74 px footer plus the system safe inset, leaving 16 px between the scroll viewport and the ad and 8 dp below the ad. Native banner APIs overlay the WebView, so this reservation must remain in place. Typing, modals, Coach, offline state, and backgrounding suspend the banner; returning resumes the same view without another request. Logout/premium removal destroys it. Failed loads retry with backoff; loaded banners use SDK/AdMob refresh settings. `[AdMob] Requesting bottom banner`, `Bottom banner loaded`, `Bottom banner impression`, and failure logs distinguish requesting from loading and displaying. Use test ads/device registration for device validation; simulated browser checks do not confirm live fill or revenue.

### 4. Security Enhancements
- **Double-Spend Guards:** The credit system uses backend RPC checks with row locking so concurrent requests cannot spend below zero.
- **Stable AI Endpoints:** The app uses stable `llama-3.3-70b-versatile` and `llama-3.2-90b-vision-preview` models through Groq to prevent model deprecation failures.
- **Platform-Safe Payments:** Capacitor Android uses Google Play Billing only. Browser sessions use Dodo hosted checkout, and Supabase grants premium when either verified provider is active.
- **Safe Notifications:** The Local Notification service explicitly targets app-managed notification IDs (`1001-1007`) during cancellations to avoid disrupting system alerts.
