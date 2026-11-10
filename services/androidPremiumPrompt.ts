const STORAGE_PREFIX = 'rizz_android_premium_prompt_v1';

export interface AndroidPremiumPromptState {
  utcDay: string;
  count: number;
}

export interface AndroidPremiumPromptRecord extends AndroidPremiumPromptState {
  shouldPrompt: boolean;
}

const memoryStore = new Map<string, string>();

const getUtcDay = (now: number = Date.now()): string => new Date(now).toISOString().slice(0, 10);

const getStorageKey = (identity: string): string => `${STORAGE_PREFIX}:${encodeURIComponent(identity)}`;

const readStoredValue = (key: string): string | null => {
  try {
    if (typeof globalThis.localStorage !== 'undefined') return globalThis.localStorage.getItem(key);
  } catch {
    // Fall through to the in-memory backup when WebView storage is unavailable.
  }
  return memoryStore.get(key) ?? null;
};

const writeStoredValue = (key: string, value: string): void => {
  memoryStore.set(key, value);
  try {
    if (typeof globalThis.localStorage !== 'undefined') globalThis.localStorage.setItem(key, value);
  } catch {
    // The in-memory copy still protects the current process from duplicate prompts.
  }
};

const emptyState = (utcDay: string): AndroidPremiumPromptState => ({ utcDay, count: 0 });

const parseState = (raw: string | null, utcDay: string): AndroidPremiumPromptState => {
  if (!raw) return emptyState(utcDay);

  try {
    const parsed = JSON.parse(raw) as Partial<AndroidPremiumPromptState>;
    if (
      parsed.utcDay === utcDay &&
      Number.isSafeInteger(parsed.count) &&
      (parsed.count as number) >= 0
    ) {
      return { utcDay, count: parsed.count as number };
    }
  } catch {
    // Invalid or stale state is treated as a fresh UTC day.
  }

  return emptyState(utcDay);
};

/** Reads today's count and clears stale data when the UTC day changes. */
export const readAndroidPremiumPromptState = (
  identity: string,
  now: number = Date.now(),
): AndroidPremiumPromptState => {
  const utcDay = getUtcDay(now);
  const key = getStorageKey(identity);
  const state = parseState(readStoredValue(key), utcDay);
  writeStoredValue(key, JSON.stringify(state));
  return state;
};

/** Explicitly resets an identity's counter to the current UTC day. */
export const resetAndroidPremiumPromptState = (
  identity: string,
  now: number = Date.now(),
): AndroidPremiumPromptState => {
  const state = emptyState(getUtcDay(now));
  writeStoredValue(getStorageKey(identity), JSON.stringify(state));
  return state;
};

/** The Android schedule is generation 3, then every fifth generation. */
export const isAndroidPremiumPromptDue = (count: number): boolean => (
  count >= 3 && (count - 3) % 5 === 0
);

/** Records one successful AI response and reports whether it reached a prompt point. */
export const recordAndroidSuccessfulGeneration = (
  identity: string,
  now: number = Date.now(),
): AndroidPremiumPromptRecord => {
  const current = readAndroidPremiumPromptState(identity, now);
  const next: AndroidPremiumPromptState = {
    utcDay: current.utcDay,
    count: current.count + 1,
  };
  writeStoredValue(getStorageKey(identity), JSON.stringify(next));
  return { ...next, shouldPrompt: isAndroidPremiumPromptDue(next.count) };
};
