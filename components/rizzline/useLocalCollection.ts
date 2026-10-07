import { useEffect, useState } from 'react';
import { CATALOG_BY_ID } from './data/curatedLines';

const SAVED_KEY = 'rizzmaster_rizzline_saved_v1';
export function readSavedIds(): string[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SAVED_KEY) || '[]');
    return Array.isArray(value) ? [...new Set(value.filter((id): id is string => typeof id === 'string' && CATALOG_BY_ID.has(id)))].slice(0, 500) : [];
  } catch { return []; }
}

export function useLocalCollection() {
  const [savedIds, setSavedIds] = useState(readSavedIds);
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(savedIds)); setStorageAvailable(true); }
    catch { setStorageAvailable(false); }
  }, [savedIds]);
  useEffect(() => {
    const sync = (event: StorageEvent) => { if (event.key === SAVED_KEY || event.key === null) setSavedIds(readSavedIds()); };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  return { savedIds, setSavedIds, storageAvailable };
}
