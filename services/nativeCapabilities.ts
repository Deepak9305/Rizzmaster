import { Capacitor } from '@capacitor/core';

const readWindow = () => globalThis as typeof globalThis & {
  CdvPurchase?: { store?: unknown };
  OneSignal?: unknown;
  plugins?: { OneSignal?: unknown };
};

export const isNativeShellApp = () => Capacitor.isNativePlatform();

export const hasCapacitorPlugin = (name: string) => (
  isNativeShellApp() && Capacitor.isPluginAvailable(name)
);

export const hasCordovaGlobal = (name: 'CdvPurchase' | 'OneSignal') => {
  if (!isNativeShellApp()) return false;
  const host = readWindow();

  if (name === 'CdvPurchase') {
    return Boolean(host.CdvPurchase?.store);
  }

  return Boolean(host.OneSignal || host.plugins?.OneSignal);
};

export const canUseNativeGoogleAuth = () => hasCapacitorPlugin('GoogleAuth');
export const canUseNativeKeyboard = () => hasCapacitorPlugin('Keyboard');
export const canUseNativeStatusBar = () => hasCapacitorPlugin('StatusBar');
export const canUseNativeNetwork = () => hasCapacitorPlugin('Network');
export const canUseNativeCamera = () => hasCapacitorPlugin('Camera');
export const canUseNativeNotifications = () => (
  hasCapacitorPlugin('LocalNotifications') && hasCapacitorPlugin('Preferences')
);
export const canUseNativeAdMob = () => hasCapacitorPlugin('AdMob');
export const canUseNativeIap = () => hasCordovaGlobal('CdvPurchase');
export const canUseNativeOneSignal = () => hasCordovaGlobal('OneSignal');
export const canUseNativeAppEvents = () => hasCapacitorPlugin('App');
