# Android sign-in

Google login waits for shared native initialization before opening the account picker. Google and email failures render in the same visible alert area. The UI blocks duplicate submissions and guest/method changes while authentication is pending.

The GoogleAuth patch adds an opt-in `skipAccessToken` path: Google Play services returns an ID token and Supabase validates it with `signInWithIdToken`. This app does not need the plugin's AccountManager access token or extra tokeninfo request. Existing callers that omit the option keep the upstream behavior. `patch-package` applies the patch during installation.

Initialization has a 12-second deadline; the account picker has a 45-second deadline. A timed-out picker remains tracked until its native operation finishes, preventing duplicate pickers and ignoring a late token. Supabase authentication HTTP requests abort after 30 seconds. The startup screen is kept to its deterministic three-second animation while profile enrichment continues behind the first app view.

The Android plugin is configured with the same Google web client ID used by the production Vercel build under `clientId`, `androidClientId`, and `serverClientId`. The ID-token audience must stay aligned with Supabase's Google provider configuration.

The UI changes require a web deployment. The ID-token-only native path requires a new APK. Old APKs ignore the new option. Production continues to load `https://rizzmaster.online`; a temporary bundled-UI APK can be used for testing before deploying.

If Google returns error code 10, verify the Android OAuth client package name and signing certificate in Google Cloud, including the Play app-signing certificate. Code 10 is a configuration error, not proof of a network failure. Do not log authentication tokens.

Validation:

```sh
node --test tests/auth.test.mjs tests/profile-login.test.mjs tests/guest-session.test.mjs
npm run build
npx cap sync android
```

With Java 21 configured, run `gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease` from `android`. A successful build does not prove a real account can sign in; verify the account picker and session creation on a device.
