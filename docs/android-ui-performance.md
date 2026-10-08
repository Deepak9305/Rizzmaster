# Android UI performance check — 2026-10-08

Changes remove the additional native React splash delay, stabilize the toast
context, defer the AI module until input focus/use, and only load Saved Gems
when opened. Native coach bubbles use lighter surfaces and the composer uses
CSS content sizing where supported, with a frame-batched older-WebView fallback.
Animation frames and splash timers are cancelled when their owner unmounts.

Removed estimated coach message heights: restoring 50 long messages previously
left the last message outside the viewport and changed the scroll range as
offscreen messages were measured. The list now retains real message heights.

## Evidence

Before/after production builds were compared in isolated headless Edge at a
390 × 844 mobile viewport, using simulated Android/Capacitor and Cordova globals.
External network calls were blocked; these are local UI measurements, not phone
benchmarks or real ad/purchase delivery tests.

| Check | Before | After |
| --- | --- | --- |
| Page navigation to guest entry | 3,284 ms | 679 ms |
| React splash bar width updates | 110 | 0 |
| JS textarea height reads while typing 85 characters | 85 | 0 |
| Distance from restored conversation to bottom after typing | 4,133 px | 0 px |
| Initial App JavaScript chunk | 320.46 KB | 302.17 KB |

The composer expanded to its 128px cap and shrank to 24px after shortening the
text. With CSS content sizing disabled, the fallback also resized correctly and
kept the latest message visible. No JavaScript exceptions were observed.

Reply, bio, and coach requests were exercised with mocked API responses, including
the 5 → 4 → 3 → 2 guest credit deductions, opening/closing Saved Gems and returning
from coach. Production build, TypeScript, marketing prerender and the existing
AdMob (67), rewarded-ad (23), and billing (13) regression tests passed.

No Android device was attached during verification. Real device scrolling,
keyboard behavior, GPU/frame timing and native SDK delivery still need a device
check. Native project files, ad configuration and billing behavior were unchanged.
