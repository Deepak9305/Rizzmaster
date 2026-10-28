# Android ad initialization and banner maintenance

## Simplified flow (local implementation, 2026-10-28)

Rollback checkpoint: `5acd3e4`. The Android SDK versions remain Capacitor 8.5.2,
community AdMob 8.2.1, Google Mobile Ads 25.4.0, UMP 4.0.0, and Meta mediation
6.22.0.1. The community AdMob package now runs without a source patch; the Google
Auth patch remains independent.

New APKs register `AdsStartup`. That small app-owned bridge requests UMP updates,
opens required consent/privacy forms, and reports readiness from Google's actual
SDK callback. SDK startup does not depend on a banner parent. Its state includes
`canRequestAds`, `privacyOptionsRequired`, `sdkReady`, `busy`, `formOpen`, and `error`.
Only UMP's authoritative permission enables requests. JS timeouts do not cancel
native forms, launch duplicate initialization, or manufacture consent/readiness.
An explicit watch action starts/joins initialization and waits up to 45 seconds
for the native readiness event before preparing the reward. Account changes,
backgrounding, or going offline cancel that wait. A load failure is reported
separately from an ad that was shown and closed without earning a reward.

`simpleAds.ts` owns startup, foreground/network state, and one rewarded cache;
`simpleBanner.ts` owns the banner. Failed native loads retry after 60 seconds while
eligible/foreground, retaining deadlines across backgrounding. Reward preloading
starts at two credits or fewer for both guests and accounts on the main tool,
after splash/onboarding. Watching still requires insufficient generation credits
and explicit user action. Cache lifetime is 55 minutes; one native load remains
serialized even when the JS wait times out. An ad confirmed on screen retains
ownership until native dismissal/failure. If a stock SDK terminal callback never
arrives, restarting the app is the recovery; JS cannot cancel a native show safely.

The stock banner plugin destroys its view on failed automatic refresh as well as
initial failure. The controller therefore retries that missing view after 60
seconds. Successful automatic refresh remains SDK-owned. Existing keyboard,
placement, adaptive sizing, modal, Coach, and premium rules are preserved.

The new flow supplies no SSV data. Earned guests receive five local credits.
Earned account rewards persist an account-scoped UUID claim before calling
`POST /api/rewarded-ad/claim` with `{ claimId, requiredCredits }`. Authentication
selects the account. The service-role-only `admin_claim_client_reward` transaction
locks the profile, checks eligibility, records the account/claim pair, and adds
exactly five credits. Retrying a claim returns the result without granting twice.
This trusts the client completion signal and does not prove that an ad was watched.
Pending claims survive transient server/auth errors and retry on reconnect,
foreground return, next launch, or explicit retry. Switching accounts cannot
submit or display another account's credits.

Local counters record requests, loads, shows, earned callbacks, failures, and
banner impressions. The stock rewarded plugin exposes a paid event, not a
separate impression event: rewarded impression count is explicitly unavailable.
No counter contains account IDs or conversation content, and none is uploaded.

### Migration and verification

- Production claim migration applied on 2026-10-28 after the API deployment.
  Verified the actual service-role grant (+5), duplicate retry, and insufficient-
  credit eligibility using a synthetic account inside a rolled-back transaction;
  no test account, credit update, or test claim persisted. RLS and server-only
  permissions were checked, and the legacy SSV function remains present.
- The watch-readiness/message fix is local until the next frontend deployment.
  The native startup helper and patch removal still require a rebuilt shell.
- The normal Android shell loads `https://rizzmaster.online`. Rebuilding the
  shell alone does not serve unpublished frontend code. Use the existing
  `sharePreview` variant for a bundled local frontend check.
- Older APKs without `AdsStartup` select the isolated `legacy*` services and
  existing SSV flow. Their endpoints, RPC, and history remain available. Do not
  disable the AdMob SSV callback in the console while those clients remain.
  Callbacks without an attempt ID acknowledge without granting credits.
- After adoption and legacy traffic are reviewed, remove the legacy modules and
  SSV runtime in a separate change. Keep the rollback checkpoint and do not drop
  reward history as part of that retirement.
- `npm run test:admob` covers old/new orchestration; `npm run test:rewarded`
  covers compatibility/verification; `npm run test:ads-db` runs the actual new
  SQL in local PGlite PostgreSQL, including duplicate submissions, account locks,
  eligibility and SQL permissions. PGlite serializes connections; a real
  multi-connection Postgres contention test remains a release check.
- Run `npm run build`, `npx cap sync android`, `npm run verify:native-config`,
  and Android unit/compile checks. Use test ads on a connected device; production
  ad IDs/configuration stay unchanged. Measure delivery and revenue after rollout.

## Legacy implementation history

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

- Resolves initialization after Google's SDK/mediation completion callback, independently of banner attachment. A missing callback rejects after 35 seconds; late callbacks cannot resolve a rejected call. The JavaScript SDK deadline is 45 seconds, independently of UMP's network timeout.
- Runs banner view creation, hide, resume, removal, and requests on the UI thread, catching exceptions inside queued actions.
- Rejects hide/resume when a load failure has removed the view. Removal resolves after cleanup and is idempotent.
- Settles requests for existing banners, and installs listeners/attaches the parent before loading a new banner.

`BottomNavigationInsetPlugin` maps the measured WebView slot directly to the native parent. It does not add/subtract a guessed Android 15 status-bar inset or replace Capacitor's window listener. Initial attachment applies the measured position immediately; later keyboard/viewport changes reuse the existing view.

## Consent and retry behavior

A stalled consent-form bridge callback releases initialization after 60 seconds. The native form remains tracked, so retries cannot open duplicates. Only a fresh native UMP `canRequestAds` result can authorize requests; denial stays blocked. Late callbacks re-read native consent instead of trusting stale permission.

Readiness failures retry after 15 seconds, backing off to 60 seconds. Local bridge errors retry after 1–15 seconds; network load errors after 15–60 seconds; other failed loads/no-fill after 60 seconds. Normal refresh remains controlled by the Google SDK/AdMob setting, and layout changes do not create extra requests.

Network loss pauses banner recovery timers and load watchdogs without resetting the retry deadline. Reconnection resumes an overdue request immediately when Home is visible; reconnecting before the deadline waits the remaining interval. It never resumes the banner over Coach or an open dialog. When a refreshed UMP result already allows ads, SDK initialization overlaps the form check; actual requests still wait for the final permission and SDK completion.

In the AdMob console, verify that the banner unit uses **Google optimized automatic refresh**. This setting lives in AdMob, not this repository; publishing code does not enable it. Do not add a separate JavaScript refresh loop for loaded banners.

## Delivery recovery (2026-10-25)

`adRecovery.ts` owns startup retries independently of banner/reward screens. It retries failed readiness at 15/30/60-second intervals while foreground and online. Foreground, reconnect and verified readiness wake pending work; per-format load/no-fill deadlines and request deduplication still apply. SDK initialization still waits for the mediation completion callback.

The native patch retains an empty banner view after internal/network/no-fill errors. `hasLoadedAd` distinguishes a retained empty view needing a paced retry from an existing creative whose automatic refresh remains SDK-owned. Invalid requests recreate the view. Hosted JS also understands older APKs: absent retention metadata uses their existing destroy/recreate path.

An open insufficient-credit offer retries unsuccessful preload at most three times, one minute apart, stopping on success, closing, identity change or lost eligibility. It never displays an ad automatically. Reward cache expiry is 55 minutes. A native `AD_NOT_FOREGROUND` rejection before calling `show()` preserves an unconsumed reward for a later explicit opt-in; unknown failures from older APKs still invalidate conservatively.

`AdMobService.getDeliveryDiagnostics()` returns session counters and current readiness. `[AdDelivery]` log entries distinguish eligibility, requests, loads, shows and actual SDK impressions. The new `rewardedAdRecordedImpression` event is optional on older APKs; do not substitute shows or paid callbacks for missing impression data. Diagnostics contain no conversation text, account IDs or SSV tokens and are not uploaded.

JavaScript recovery can deploy ahead of the APK. Retained native banner views, the explicit unconsumed-reward rejection and rewarded impression callbacks require a rebuilt APK/AAB. These changes improve recovery coverage; actual requests, fill and impression changes must be measured after rollout.

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
