import { startAdRecovery as startLegacy } from './legacyAdRecovery';
import { SimpleAds, usesSimpleAds } from './simpleAds';
export const startAdRecovery = (initialOnline: boolean) =>
    usesSimpleAds() ? SimpleAds.startRuntime(initialOnline) : startLegacy(initialOnline);
