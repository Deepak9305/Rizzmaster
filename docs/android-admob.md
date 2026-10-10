# Android ad initialization and banner maintenance

The Android app loads `https://rizzmaster.online` inside Capacitor. Guest and signed-in free users share the same native banner/UMP initialization. Guest rewarded completions grant local credits; signed-in rewards use server verification. These eligibility rules are unchanged.

## Native dependencies

- Capacitor platform packages: 8.5.2.
- AdMob plugin: 8.2.0, with the tracked patch in `patches/@capacitor-community+admob+8.2.0.patch`.
- Google Mobile Ads: 25.4.0, pinned in `android/variables.gradle`.
- Meta mediation adapter: 6.22.0.1, tested by Google with Mobile Ads 25.4.0 and Audience Network 6.22.0.
- UMP: 4.0.0.

`npm install` / `npm ci` apply the native patch through `postinstall`. Do not skip installation scripts when building Android. Keep the patch when upgrading dependencies, review whether its fixes are upstream, and run the native regression tests before replacing it.

The upstream 8.2.0 plugin fixes the missing-parent lookup and avoids replacing Capacitor's decor-view inset listener. The app patch additionally:

- Resolves initialization only after the parent exists **and** Google's SDK/mediation completion callback arrives. A missing callback rejects after 35 seconds; late callbacks cannot resolve a rejected call. The JavaScript SDK deadline is 45 seconds, independently of UMP's network timeout.
- Runs banner view creation, hide, resume, removal, and requests on the UI thread, catching exceptions inside queued actions.
- Rejects hide/resume when a load failure has removed the view. Removal resolves after cleanup and is idempotent.
- Settles requests for existing banners, and installs listeners/attaches the parent before loading a new banner.

`BottomNavigationInsetPlugin` maps the measured WebView slot directly to the native parent. It does not add/subtract a guessed Android 15 status-bar inset or replace Capacitor's window listener. Initial attachment applies the measured position immediately; later keyboard/viewport changes reuse the existing view.

## Consent and retry behavior

A stalled consent-form bridge callback releases initialization after 60 seconds. The native form remains tracked, so retries cannot open duplicates. Only a fresh native UMP `canRequestAds` result can authorize requests; denial stays blocked. Late callbacks re-read native consent instead of trusting stale permission.

Readiness failures retry after 15 seconds, backing off to 60 seconds. Actual banner load failures/no-fill retain the 60–300 second backoff. Normal refresh remains controlled by the Google SDK/AdMob setting, and layout changes do not create extra requests.

## Verification

```powershell
npm ci
node --test tests/admob.test.mjs tests/rewarded-ad.test.mjs tests/rewarded-ad-runtime.test.mjs
npm run build
npx cap sync android
npm run verify:native-config
cd android
.\gradlew.bat :app:testDebugUnitTest :app:assembleDebug :app:assembleRelease
```

The native tests execute the patched plugin with controlled SDK callbacks, layout callbacks, and UI queues. They cover mediation readiness, callback timeouts, delayed/missing parents, hide-after-failure, resume of a missing view, removal ordering, and measured positioning without replacing Capacitor's insets listener. They do not replace a device check for keyboard, scrolling, rotation, app resume, and consent forms.

Native fixes require a rebuilt APK/AAB and a Play release; publishing web JavaScript cannot change native classes already installed in release 10021. Compare requests, matched requests, impressions, and affected-session logs after rollout. Code fixes alone do not establish the cause of country-specific no-fill or AdMob account restrictions.

References: [plugin 8.2.0 release notes](https://github.com/capacitor-community/admob/releases/tag/v8.2.0), [Google SDK initialization](https://developers.google.com/admob/android/quick-start#initialize_the_google_mobile_ads_sdk), [Meta adapter compatibility](https://developers.google.com/admob/android/mediation/meta#version_62201).
