import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { getRemoteConfig, fetchAndActivate, getValue, isSupported } from 'firebase/remote-config';
import { firebaseApp } from './firebaseClient';
import { requestBackend } from './backendApi';
import { runtimeConfig } from './runtimeConfig';

export type UpdateGateConfig = {
  forceUpdateEnabled: boolean;
  minSupportedVersion: string;
  latestVersion: string | null;
  updateUrl: string | null;
  updateMessage: string;
  currentVersion: string;
  blocked: boolean;
  source: 'firebase-remote-config' | 'backend-fallback';
};

const normalizeBoolean = (value: unknown) => {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  }
  return false;
};

const normalizeVersion = (value: string) => value.split('-')[0].trim();

const compareVersions = (left: string, right: string) => {
  const leftParts = normalizeVersion(left).split('.').map((part) => Number.parseInt(part || '0', 10) || 0);
  const rightParts = normalizeVersion(right).split('.').map((part) => Number.parseInt(part || '0', 10) || 0);
  const length = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < length; index += 1) {
    const leftValue = leftParts[index] || 0;
    const rightValue = rightParts[index] || 0;

    if (leftValue > rightValue) return 1;
    if (leftValue < rightValue) return -1;
  }

  return 0;
};

export const getCurrentAppVersion = async () => {
  if (Capacitor.isNativePlatform()) {
    try {
      const info = await CapacitorApp.getInfo();
      return info.version || __APP_VERSION__;
    } catch (error) {
      console.warn('[UpdateGate] Failed to read native app version:', error);
    }
  }

  return __APP_VERSION__;
};

const fetchFromFirebaseRemoteConfig = async () => {
  if (!firebaseApp || !runtimeConfig.remoteConfigAvailable || !(await isSupported())) {
    return null;
  }

  const remoteConfig = getRemoteConfig(firebaseApp);
  remoteConfig.settings.minimumFetchIntervalMillis = 60_000;
  remoteConfig.defaultConfig = {
    force_update_enabled: 'false',
    min_supported_version: '0.0.0',
    latest_version: '',
    update_url: '',
    update_message: 'A newer Rizz Master build is required to continue.',
  };

  await fetchAndActivate(remoteConfig);

  return {
    force_update_enabled: getValue(remoteConfig, 'force_update_enabled').asString(),
    min_supported_version: getValue(remoteConfig, 'min_supported_version').asString(),
    latest_version: getValue(remoteConfig, 'latest_version').asString(),
    update_url: getValue(remoteConfig, 'update_url').asString(),
    update_message: getValue(remoteConfig, 'update_message').asString(),
  };
};

const fetchFromBackendFallback = async () => {
  const { response, data } = await requestBackend('/api/runtime-config', {
    method: 'GET',
    requireAuth: false,
  });

  if (!response.ok || !data) {
    throw new Error('Failed to fetch runtime config.');
  }

  return data;
};

export const loadUpdateGateConfig = async (): Promise<UpdateGateConfig> => {
  const currentVersion = await getCurrentAppVersion();

  let source: UpdateGateConfig['source'] = 'backend-fallback';
  let rawConfig = null;

  try {
    rawConfig = await fetchFromFirebaseRemoteConfig();
    if (rawConfig) {
      source = 'firebase-remote-config';
    }
  } catch (error) {
    console.warn('[UpdateGate] Firebase Remote Config fetch failed, falling back to backend:', error);
  }

  if (!rawConfig) {
    rawConfig = await fetchFromBackendFallback();
  }

  const forceUpdateEnabled = normalizeBoolean(rawConfig.force_update_enabled);
  const minSupportedVersion = rawConfig.min_supported_version || '0.0.0';
  const latestVersion = rawConfig.latest_version || null;
  const updateUrl = rawConfig.update_url || null;
  const updateMessage = rawConfig.update_message || 'A newer Rizz Master build is required to continue.';
  const blocked = forceUpdateEnabled && compareVersions(currentVersion, minSupportedVersion) < 0;

  return {
    forceUpdateEnabled,
    minSupportedVersion,
    latestVersion,
    updateUrl,
    updateMessage,
    currentVersion,
    blocked,
    source,
  };
};
