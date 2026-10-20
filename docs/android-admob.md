# Android ad initialization and banner maintenance

The Android app loads `https://rizzmaster.online` inside Capacitor. Guest and signed-in free users share the same native banner/UMP initialization. Guest rewarded completions grant local credits; signed-in rewards use server verification. These eligibility rules are unchanged.

Guests preload one rewarded ad when they have two or fewer credits, after startup and while online. The existing cache is reused when they explicitly choose “Watch ad”; preparation does not display an ad or grant credits. Cancellation checks prevent a guest who exits during consent gathering from making a late preload. Signed-in users retain preparation only for the insufficient-credit offer, with their existing server verification context.

Coach remains banner-free. The banner remains hidden under fullscreen dialogs and rewarded ads to avoid overlapping controls. Returning to Home reuses unchanged slot geometry so restoration does not wait for an unnecessary native measurement. Layout changes still trigger measurement.

## Native dependencies

- Capacitor platform packages: 8.5.2.
- AdMob plugin: 8.2.1, with the tracked patch in `patches/@capacitor-community+admob+8.2.1.patch`.
- Google Mobile Ads: 25.4.0, pinned in `android/variables.gradle`.
- Meta mediation adapter: 6.22.0.1, tested by Google with Mobile Ads 25.4.0 and Audience Network 6.22.0.
- UMP: 4.0.0.

`npm install` / `npm ci` apply the native patch through `postinstall`. Do not skip installation scripts when building Android. Keep the patch when upgrading dependencies, review whether its fixes are upstream, and run the native regression tests before replacing it.

Upstream 8.2.1 retains the 8.2.0 missing-parent and decor-view inset fixes. Its Android banner and initialization code still needs the app patch below; the new Native Ads preview API is not used. Keep the supported Android SDK at the exact 25.4.0 pin instead of forcing a newer SDK independently of the plugin and mediation adapter. The app patch additionally:

- Resolves initialization only after the parent exists **and** Google's SDK/mediation completion callback arrives. A missing callback rejects after 35 seconds; late callbacks cannot resolve a rejected call. The JavaScript SDK deadline is 45 seconds, independently of UMP's network timeout.
- Runs banner view creation, hide, resume, removal, and requests on the UI thread, catching exceptions inside queued actions.
- Rejects hide/resume when a load failure has removed the view. Removal resolves after cleanup and is idempotent.
- Settles requests for existing banners, and installs listeners/attaches the parent before loading a new banner.

`BottomNavigationInsetPlugin` maps the measured WebView slot directly to the native parent. It does not add/subtract a guessed Android 15 status-bar inset or replace Capacitor's window listener. Initial attachment applies the measured position immediately; later keyboard/viewport changes reuse the existing view.

## Consent and retry behavior

A stalled consent-form bridge callback releases initialization after 60 seconds. The native form remains tracked, so retries cannot open duplicates. Only a fresh native UMP `canRequestAds` result can authorize requests; denial stays blocked. Late callbacks re-read native consent instead of trusting stale permission.

Readiness failures retry after 15 seconds, backing off to 60 seconds. Actual banner load failures/no-fill retain the 60–300 second backoff. Normal refresh remains controlled by the Google SDK/AdMob setting, and layout changes do not create extra requests.

Network loss pauses banner recovery timers and load watchdogs without resetting the retry deadline. Reconnection resumes an overdue request immediately when Home is visible; reconnecting before the deadline waits the remaining interval. It never resumes the banner over Coach or an open dialog. When a refreshed UMP result already allows ads, SDK initialization overlaps the form check; actual requests still wait for the final permission and SDK completion.

In the AdMob console, verify that the banner unit uses **Google optimized automatic refresh**. This setting lives in AdMob, not this repository; publishing code does not enable it. Do not add a separate JavaScript refresh loop for loaded banners.

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

The 8.2.1 upgrade was verified locally on 2026-10-20: the regenerated patch applied to pristine 8.2.1 sources, all 108 JavaScript ad/reward tests and 13 Android unit tests (including eight AdMob regressions) passed, production web build and Android sync/config checks passed, and the minified release APK built successfully. Gradle's release dependency report resolved Google Mobile Ads 25.4.0. Live ad delivery on a device was not checked as part of this upgrade.

Native fixes require a rebuilt APK/AAB and a Play release; publishing web JavaScript cannot change native classes already installed in release 10022. Compare requests, matched requests, impressions, and affected-session logs after rollout. Code fixes alone do not establish the cause of country-specific no-fill or AdMob account restrictions.

References: [plugin 8.2.1 release notes](https://github.com/capacitor-community/admob/releases/tag/v8.2.1), [Google SDK initialization](https://developers.google.com/admob/android/quick-start#initialize_the_google_mobile_ads_sdk), [Meta adapter compatibility](https://developers.google.com/admob/android/mediation/meta#version_62201).
