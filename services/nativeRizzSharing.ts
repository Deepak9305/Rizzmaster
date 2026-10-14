import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Clipboard } from '@capacitor/clipboard';
import { registerPlugin } from '@capacitor/core';

interface CardExportPlugin {
  savePng(options: { uri: string; filename: string }): Promise<{ saved: boolean }>;
}

const CardExport = registerPlugin<CardExportPlugin>('RizzCardExport');
const CACHE_FOLDER = 'rizz-share';
const MAX_PNG_BYTES = 10 * 1024 * 1024;
const CACHE_LIFETIME_MS = 24 * 60 * 60 * 1000;

interface NativeSharingDependencies {
  share: Pick<typeof Share, 'share'>;
  filesystem: Pick<typeof Filesystem, 'writeFile' | 'readdir' | 'deleteFile'>;
  clipboard: Pick<typeof Clipboard, 'write'>;
  cardExport: CardExportPlugin;
  toBase64: (blob: Blob) => Promise<string>;
  now: () => number;
  uniqueId: () => string;
}

// Capacitor rejections are plain objects on some WebView versions.
export function isShareCancellation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const details = error as { name?: string; code?: string; message?: string };
  return details.name === 'AbortError' || details.code === 'USER_CANCELLED' ||
    /^(share cancel(?:ed|led)|sharing cancel(?:ed|led)|user cancel(?:ed|led))\.?$/i.test(details.message || '');
}

export function createNativeRizzSharing(deps: NativeSharingDependencies) {
  const copyText = async (text: string) => { await deps.clipboard.write({ string: text }); };

  const cacheCard = async (blob: Blob) => {
    if (blob.type !== 'image/png' || !blob.size || blob.size > MAX_PNG_BYTES) {
      throw new Error('The card is too large or is not a valid PNG. Try a shorter reply.');
    }
    // Retain recent shares because another app may read the file after the
    // chooser closes. Only expire files owned by this feature, after a day.
    try {
      const { files } = await deps.filesystem.readdir({ path: CACHE_FOLDER, directory: Directory.Cache });
      for (const file of files) {
        if (file.type === 'file' && /^rizzmaster-.*\.png$/.test(file.name) &&
            file.mtime < deps.now() - CACHE_LIFETIME_MS) {
          await deps.filesystem.deleteFile({ path: `${CACHE_FOLDER}/${file.name}`, directory: Directory.Cache });
        }
      }
    } catch { /* A missing cache folder or failed cleanup must not block sharing. */ }
    const filename = `rizzmaster-${deps.now()}-${deps.uniqueId()}.png`;
    const path = `${CACHE_FOLDER}/${filename}`;
    const { uri } = await deps.filesystem.writeFile({
      path, directory: Directory.Cache, data: await deps.toBase64(blob), recursive: true,
    });
    if (!uri?.startsWith('file://')) throw new Error('Could not prepare the native image file.');
    return { uri, path, filename };
  };

  return {
    copyText,
    async shareText(text: string): Promise<'shared' | 'copied' | 'cancelled'> {
      try {
        const result = await deps.share.share({ title: 'Rizz Master', text, dialogTitle: 'Share Rizz' });
        // Android may resolve with no selected activity when the chooser was
        // dismissed after onStop. Leave that outcome silent as well.
        return result.activityType ? 'shared' : 'cancelled';
      } catch (error) {
        if (isShareCancellation(error)) return 'cancelled';
        await copyText(text);
        return 'copied';
      }
    },
    async shareCard(blob: Blob): Promise<'shared' | 'cancelled'> {
      const card = await cacheCard(blob);
      try {
        const result = await deps.share.share({ title: 'Rizz Master', files: [card.uri], dialogTitle: 'Share Rizz Card' });
        return result.activityType ? 'shared' : 'cancelled';
      } catch (error) {
        if (isShareCancellation(error)) return 'cancelled';
        throw error;
      }
    },
    async saveCard(blob: Blob): Promise<'saved' | 'cancelled'> {
      const card = await cacheCard(blob);
      try {
        const result = await deps.cardExport.savePng({ uri: card.uri, filename: card.filename });
        return result.saved ? 'saved' : 'cancelled';
      } finally {
        // The system picker has finished copying; this temporary file is safe
        // to remove now. Share files above deliberately have a longer lifetime.
        await deps.filesystem.deleteFile({ path: card.path, directory: Directory.Cache }).catch(() => {});
      }
    },
  };
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the card image.'));
    reader.onload = () => {
      const data = typeof reader.result === 'string' ? reader.result.split(',')[1] : '';
      if (data) resolve(data); else reject(new Error('Could not read the card image.'));
    };
    reader.readAsDataURL(blob);
  });
}

export const nativeRizzSharing = createNativeRizzSharing({
  share: Share, filesystem: Filesystem, clipboard: Clipboard, cardExport: CardExport,
  toBase64: blobToBase64, now: Date.now,
  uniqueId: () => crypto.randomUUID(),
});
