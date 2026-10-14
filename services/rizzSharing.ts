import { Capacitor } from '@capacitor/core';
import { copyLine, shareLine } from '../components/rizzline/browserActions';
import { downloadCardBlob, shareCardBlob } from '../components/rizzline/cardActions';

const CARD_OPTIONS = { title: 'Rizz Master', filename: 'rizzmaster-rizz-card.png' };

export function canUseRizzSharing(): boolean {
  // The hosted UI can run in an older APK. Preserve Copy until all required
  // native capabilities are present instead of opening a broken share popup.
  return !Capacitor.isNativePlatform() || (Capacitor.getPlatform() === 'android' &&
    ['Share', 'Filesystem', 'Clipboard', 'RizzCardExport'].every(name => Capacitor.isPluginAvailable(name)));
}

export async function copyRizz(text: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    const { nativeRizzSharing } = await import('./nativeRizzSharing');
    return nativeRizzSharing.copyText(text);
  }
  return copyLine(text);
}

export async function shareRizz(text: string): Promise<'shared' | 'copied' | 'cancelled'> {
  if (Capacitor.isNativePlatform()) {
    const { nativeRizzSharing } = await import('./nativeRizzSharing');
    return nativeRizzSharing.shareText(text);
  }
  return shareLine(text, CARD_OPTIONS.title);
}

export async function shareRizzCard(blob: Blob): Promise<'shared' | 'downloaded' | 'cancelled'> {
  if (Capacitor.isNativePlatform()) {
    const { nativeRizzSharing } = await import('./nativeRizzSharing');
    return nativeRizzSharing.shareCard(blob);
  }
  return shareCardBlob(blob, CARD_OPTIONS);
}

export async function saveRizzCard(blob: Blob): Promise<'saved' | 'cancelled'> {
  if (Capacitor.isNativePlatform()) {
    const { nativeRizzSharing } = await import('./nativeRizzSharing');
    return nativeRizzSharing.saveCard(blob);
  }
  downloadCardBlob(blob, CARD_OPTIONS.filename);
  return 'saved';
}
