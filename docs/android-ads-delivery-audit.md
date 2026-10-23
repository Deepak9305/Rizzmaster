# Android ad delivery audit - 2026-10-23

Status: delivery fixes implemented and verified from baseline `5e3020d`; the user authorized publishing all ad fixes to GitHub. No live database or ad-console settings were changed. Publishing native source does not update installed APKs.

## Implemented locally

- A previously loaded native banner survives transient refresh errors (internal error, network error, no-fill). Its existing SDK automatic-refresh lifecycle remains the only refresh owner. Failed initial loads still release the empty view for JavaScript recovery. A confirmed loaded ad also survives a lost show bridge response.
- No-fill recovery uses a fixed 60 seconds, with no increasing cooldown. Local bridge/listener errors use 1–15-second recovery; network load errors use 15–60 seconds and wake on an actual reconnect. No-fill deadlines survive modal/background/network transitions. These are recovery attempts, not a manual refresh loop for loaded ads.
- Required UMP refresh starts first; authoritative previous-session native permission can allow startup without waiting for that refresh's deadline. The refresh and required-form flow continue, and a newer denial takes precedence. SDK readiness wakes waiting banners promptly.
- Lost privacy-options callbacks no longer leave all ads blocked for the rest of the session. A bounded wait releases the UI, permission is re-read from native UMP, and an unfinished native form stays tracked to prevent duplicates. Late completion re-reads current permission.
- Valid late rewarded loads are retained for the same guest/account, ad unit and SSV context. Native load generations prevent an old callback replacing a newer ad. Older APKs keep conservative recovery when a late callback could overwrite a different SSV context. Logout/privacy changes invalidate the cache; no reward auto-shows after a timed-out action. Failure before a show request preserves an unused valid ad.
- SDK/mediation initialization no longer depends on banner-parent layout. Banner attachment waits for its own parent. Adapter status and native load-error domain/response details are available for diagnosis; optional impression-listener registration cannot prevent ad loading.
- Network monitoring ignores stale snapshots and callbacks after cleanup, rechecks on resume, and performs one bounded, uncached HTTPS manifest check for a native transport lacking Android validation. No transport or an unsuccessful check stays offline. Bundled localhost assets are never accepted as proof of internet access.
- Native changes are stored in `patches/@capacitor-community+admob+8.2.1.patch`, preserving the installed plugin/SDK versions. The patch was checked against the pristine 8.2.1 package.

## Second scan: additional unnecessary restrictions removed

| Reproduced restriction | Local fix |
| --- | --- |
| A guest credit/profile update cleans up the preload effect. Its old eligibility callback could then discard a successfully fetched ad, even though the guest identity and reward context had not changed. | Eligibility is a stable derived boolean for balances 2, 1 and 0. Eligibility controls starting requests; identity, SSV context and native permission control accepting their results. Existing identity/privacy invalidation still wins. |
| A failed guest preload was a one-off attempt. The eligible guest could stay in the app without another preload until an unrelated state change or a Watch ad tap. | Maintain one guest cache while eligible and foregrounded. Retry a failed native load after 60 seconds; keep a successful ad until its existing 50-minute expiry. Consent/SDK-only waits do not count as failed native requests: readiness notifications or a foreground return wake them promptly when permitted, with a bounded 15-second readiness fallback. Backgrounding suspends timers and preserves actual load-failure pacing. No signed-in proactive preload was added. |
| A newly verified permission woke the banner only when SDK initialization had already completed. A late consent result with a cold SDK could wait up to the readiness timer. | Verified permission immediately wakes the controller, which starts the shared SDK initialization. It still waits for actual SDK readiness before loading an ad. |
| Banner no-fill recovery still increased from 60 to 120 seconds after the first pass. | Use one paced initial-load recovery attempt every 60 seconds, without exponential demand-failure cooldown. Loaded-banner refresh remains owned by the SDK. |
| The positioning helper treated a transient bridge timeout as an unsupported APK. Repositioning then destroyed a usable cached banner and loaded another ad. | Only confirmed unsupported/missing native positioning returns the compatibility fallback. Temporary errors retry the move while preserving the cached banner, hidden until positioned correctly. |
| Reward preparation could take 35 seconds of a 40-second show deadline, leaving only about 5 seconds for the native fullscreen callback. | Once an ad is ready, restart the bounded native-show deadline. A preparation/action timeout still prevents a late automatic show. The post-show dismissal watchdog and earned-reward checks remain in place. |
| The banner stayed hidden during server reward verification even when the fullscreen ad had closed and no dialog covered the main tool. | Verification alone does not suspend the banner. Opening/showing an ad and covering dialogs still suspend it; Coach remains banner-free. |

Four regression cases failed before their corresponding fixes: credit-update cache loss, cold-SDK permission wake-up, cached-view destruction on positioning failure, and the depleted native-show deadline. Additional tests cover retry pacing, foreground/resume, cache expiry, owner cleanup and verification visibility.

Coach remains banner-free. Premium remains ad-free. Rewards remain opt-in, with the existing credit eligibility, guest earned-callback checks, signed-in SSV and duplicate-grant protections. No new ad format, native plugin, production test ID, or GDPR debug setting was enabled.

## Local verification

- 145 JavaScript ad/reward regression tests pass, including the additional second-scan cases above, startup, late callbacks, cache context isolation, network races, reconnect/resume, privacy changes, no-fill pacing, retained banners, and optional listener failures.
- Production web build, prerendering and the lean Android fallback bundle pass.
- Capacitor Android sync and native configuration validation pass against the resulting assets.
- All 17 Android unit tests pass (12 AdMob-specific), and debug/release APK builds pass after sync. The release APK is unsigned. No Android device is connected, so live device behavior, AdMob fill and a revenue/impression increase cannot be verified here.

The findings below describe the pre-fix audit and its evidence. Native fixes require the rebuilt app to reach users; hosted JavaScript improvements take effect after the website deployment. Compatibility paths support existing APKs during this transition.

## Assessment

Some recovery and readiness rules suppress valid opportunities. Loosen those selectively. Consent permission, reward integrity, duplicate-request protection, and visibility safeguards should remain enforced. Passing existing regression tests does not establish that the delivery strategy is optimal or explain the full DAU-to-impression gap.

Guest users are eligible for banners and rewarded ads. No guest-specific banner exclusion, country allowlist, or production Google test ad unit was found. Coach remains banner-free by the user's explicit preference. Only guest low-credit preloading is currently authorized; signed-in proactive preloading would be a separate scope decision.

## Original prioritized findings (before the local fixes)

| Priority | Current behavior and evidence | Recommended direction |
| --- | --- | --- |
| 1 | The installed AdMob plugin destroys `AdView` on every `onAdFailedToLoad`, including refresh failure. See `node_modules/@capacitor-community/admob/android/src/main/java/com/getcapacitor/community/admob/banner/BannerExecutor.java:396`. Its tracked patch does not remove this behavior. JavaScript then uses consecutive failure delays of 60, 120, 240, and 300 seconds (`services/nativeBannerService.ts:125`). | Preserve a usable banner and its SDK refresh lifecycle through transient refresh failures. Separate initial-load failure, refresh failure, bridge failure, and genuine missing-view recovery. Use one paced recovery owner; avoid a competing manual refresh loop. Verify the banner unit's actual AdMob automatic refresh setting. |
| 2 | `services/admobService.ts:219` clears the JavaScript readiness flag and awaits the consent update before checking existing native UMP permission. A slow update waits up to 15 seconds before the native recovery read. | Start the required consent update, promptly inspect UMP's current native `canRequestAds`, and use an already-valid permission when available. Coalesce SDK initialization and requests. Continue handling required forms and subsequent permission changes; never substitute localStorage or an assumed permission. |
| 3 | `App.tsx:715` lets the initial `Network.getStatus()` result overwrite a newer network event. The banner receives the resulting `isOffline` flag as both a suspension condition and a request gate (`App.tsx:2403`). | Ignore stale initial results and results after cleanup; recheck state on relevant resume/reconnect events. Recover promptly when connectivity is restored. Keep protection against repeated requests on a truly disconnected device. |
| 4 | `services/admobService.ts:358` waits 35 seconds for rewarded loading. A success after that wait does not restore readiness for the same context. | Let a valid late completion populate the cache if identity, ad unit, reward context, expiry, and privacy permission still match. Keep the user-facing wait bounded. Never auto-show a reward after a cancelled or timed-out user action. Serialize late and newer loads so one cannot overwrite another context. |
| 5 | Readiness recovery checks back off from 15 to 60 seconds, independently of whether a valid native permission/ready signal has just become available. | Reconcile promptly on a verified readiness transition. Distinguish permission/bridge rechecks from actual ad requests so an old recovery timer does not add avoidable waiting. Do not poll consent forms or launch duplicates. |
| 6 | Native initialization ignores individual adapter statuses, and `AdMobPluginError` forwards only code/message, losing response and adapter detail. | Record adapter readiness, load-error domain/response information, and the stages request -> loaded -> shown -> impression. Record suppression reasons without conversation text, screenshots, or credentials. This is needed to measure the real contribution of each issue. |

The code comment describing one-minute recovery guidance should not be treated as a policy requirement for a five-minute cooldown after every type of failure. Google's configured automatic refresh supports optimized timing or custom 30-150 second intervals. That automatic-refresh range is not a blanket license for arbitrary manual retry loops.

## Additional restrictions reviewed

| Restriction | Assessment |
| --- | --- |
| Native UMP `canRequestAds` must be true | Retain. Reduce unnecessary waiting, not the requirement for authoritative permission. The code does not require acceptance of personalized advertising or hardcode `status === OBTAINED`. |
| SDK/mediation completion before the first load | Retain. Google recommends waiting for initialization completion when using mediation. Diagnose slow/failing adapters rather than bypassing the callback. |
| Banner hidden while backgrounded or covered by fullscreen dialogs/ads | Retain. Resume the cached view promptly when appropriate. Do not show a native banner over modal controls. |
| Premium users receive no ads; logged-out/onboarding/update-blocked states suppress the main banner | Retain the existing product promises and placement boundaries. Guest entry enables the normal free-user banner flow. |
| Coach has no banner | Retain the explicit user preference. |
| One in-flight load/show and one reusable rewarded cache | Retain. More duplicate requests do not establish more impressions and can replace a usable ad. |
| Reward cache expires after 50 minutes | Retain. Google's guide states loaded rewarded ads expire after an hour. The current margin is reasonable. |
| Active identity/context checks, earned-reward checks, signed account SSV, and duplicate-grant protection | Retain. A guest reward uses the native earned callback; signed-in account credits require verified server callbacks. |
| Network plugin requires Android's `NET_CAPABILITY_VALIDATED` | Investigate on affected devices. It is stricter than merely having a network transport. A false or stale result can suppress ads, but no live affected-device evidence establishes how often validation is wrong. Do not globally assume a connection exists. |
| Five-second banner bridge deadline and 1.5-second geometry deadline | Review with device latency logs. These could be tight on a stalled UI thread, but current evidence does not prove them responsible for this revenue gap. Geometry has a fallback. Keep bounded waits and cleanup. |

## Optional product change: earlier voluntary rewarded refill

Currently, rewards are offered only when the user's balance is below the next action's cost:

- Text/profile/one-credit action: balance must be 0.
- Screenshot/two-credit action: balance may be 0 or 1.
- The direct home-screen Watch ad button is displayed at zero credits (`App.tsx:2883`).
- Guest preloading begins at two or fewer credits (`App.tsx:1302`), but preloading does not make watching eligible earlier.
- The app handler (`App.tsx:1733`), attempt endpoint (`server/api/rewarded-ad-attempt.js:45`), and account grant function in the latest committed migration (`supabase/migrations/20260912162009_accept_admob_ssv_numeric_ad_unit.sql:143`) all enforce the insufficient-credit rule.

This is a business rule, not a requirement found in Google's published rewarded-ad policy. An optional, clearly disclosed low-credit refill at one or two credits could reduce the interruption when a user runs out. It is a separate proposed product change, not an approved implementation. UI, API eligibility, and the grant function would need to agree, while preserving the promised reward and preventing duplicate grants. Verify the deployed database definition before implementing; the SQL reviewed here is repository migration code, not a live database inspection.

Do not replace this rule with unlimited prompts or automatically displayed rewarded ads. Keep rewards explicitly opt-in. If the policy is changed, an earned reward must not be rejected merely because the user's balance changed during viewing or verification.

## Evidence and remaining verification

Read-only reproductions performed in the audit preceding this note:

- With native UMP permission already true, JavaScript did not read it or start SDK initialization while a simulated consent refresh remained pending; recovery occurred after the shortened test equivalent of the 15-second timeout.
- A rewarded native load completing after the shortened test equivalent of 35 seconds left JavaScript readiness false.
- Consecutive simulated banner failures produced 60/120/240/300/300-second recovery delays.
- Executing the actual extracted network-monitoring effect with a newer online event followed by an old offline response ended in `isOffline === true`.

These demonstrate pre-fix code behavior under controlled conditions, not its frequency among real users. The original 85 ad and 23 reward tests passed at the audit stage; those tests included some conservative behavior and were not proof that recovery timing was optimal. Implementation and added regression coverage are recorded above.

The live site bundle was also checked during the preceding audit: it contains the production banner/reward IDs and guest-preload logic. The public `app-ads.txt` returned HTTP 200 and listed Google and Meta. This does not verify console mappings, seller approval, privacy partner configuration, demand, or fill.

Before attributing the revenue gap to one cause, collect affected-session data: app build, eligibility/suppression reason, native consent permission, network state, initialization time, first-request time, load error/adapter response, load success, impression, and rewarded show rate. Inspect the actual AdMob refresh setting and adapter initialization in Ad Inspector. No Android device was connected during this audit, and no AdMob-console changes or live database queries were made.

Measure success through earlier first requests, fewer eligible sessions with zero requests, fewer blank banner periods, and more impressions per eligible foreground session. Keep typing/scrolling smooth and Coach banner-free. Native plugin fixes require a rebuilt APK/AAB; hosted JavaScript cannot replace installed native classes.

## Official references checked on 2026-10-23

- [UMP permission and previous-session consent](https://developers.google.com/admob/android/privacy)
- [Banner loading, failure handling, refresh and visibility](https://developers.google.com/admob/android/banner?hl=en)
- [Google optimized automatic refresh and custom intervals](https://support.google.com/admob/answer/3245199)
- [SDK and mediation initialization](https://developers.google.com/admob/android/quick-start)
- [Rewarded caching, expiry and callbacks](https://developers.google.com/admob/android/rewarded)
- [Rewarded-ad disclosure, opt-in and delivery requirements](https://support.google.com/admob/answer/7313578?hl=en)
