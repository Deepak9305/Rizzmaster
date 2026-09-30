import { Capacitor, registerPlugin } from '@capacitor/core';
import type { AdmobConsentInfo } from '@capacitor-community/admob';

const AdConsentState = registerPlugin<{
    getConsentInfo(): Promise<AdmobConsentInfo>;
}>('AdConsentState');

// Read UMP itself, never an app/localStorage copy of the user's permission.
// Older APKs do not contain this bridge; callers must recover conservatively.
export const readNativeConsentInfo = async (): Promise<AdmobConsentInfo | null> => {
    if (Capacitor.getPlatform() !== 'android' || !Capacitor.isPluginAvailable('AdConsentState')) {
        return null;
    }
    return AdConsentState.getConsentInfo();
};
