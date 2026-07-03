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

Run the SQL in `supabase_schema.sql` and then `secure_premium_schema.sql` from the Supabase SQL Editor before deploying backend changes. New Supabase projects may require explicit Data API grants; the schema files include those grants beside the RLS policies.

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

### 4. Security Enhancements
- **Double-Spend Guards:** The credit system uses backend RPC checks with row locking so concurrent requests cannot spend below zero.
- **Stable AI Endpoints:** The app uses stable `llama-3.3-70b-versatile` and `llama-3.2-90b-vision-preview` models through Groq to prevent model deprecation failures.
- **Native Payments Only:** In-app purchases are strictly enforced via the Capacitor native layer. Web fallbacks for premium upgrades have been disabled.
- **Safe Notifications:** The Local Notification service explicitly targets app-managed notification IDs (`1001-1007`) during cancellations to avoid disrupting system alerts.
