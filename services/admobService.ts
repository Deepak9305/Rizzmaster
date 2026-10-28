import { AdMobService as LegacyAds } from './legacyAdmobService';
import { SimpleAds, usesSimpleAds } from './simpleAds';
export type { RewardVideoSsv } from './legacyAdmobService';
// Older APKs keep their verified legacy path until the new shell is adopted.
export const AdMobService = usesSimpleAds() ? SimpleAds : LegacyAds;
