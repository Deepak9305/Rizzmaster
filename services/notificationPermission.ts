type Permission = { display: string };

interface PermissionDependencies {
    checkPermissions(): Promise<Permission>;
    requestPermissions(): Promise<Permission>;
    getDecision(): Promise<string | null>;
    saveDecision(value: string): Promise<void>;
}

// Device-wide, shared by guests and accounts. Save before opening the OS dialog
// so closing/restarting the app cannot cause an automatic second request.
export function createNotificationPermissionGate(deps: PermissionDependencies) {
    let pending: Promise<boolean> | null = null;
    return (canPrompt: () => boolean = () => true): Promise<boolean> => {
        if (pending) return pending;
        pending = (async () => {
            const permission = await deps.checkPermissions();
            if (permission.display === 'granted') return true;
            const decision = await deps.getDecision();
            if (decision) return false;
            // Respect a denial from an older app too, including Android's
            // prompt-with-rationale state following the first refusal.
            if (permission.display !== 'prompt') {
                await deps.saveDecision('declined');
                return false;
            }
            if (!canPrompt()) return false;
            await deps.saveDecision('requested');
            if (!canPrompt()) return false;
            const result = await deps.requestPermissions();
            const granted = result.display === 'granted';
            await deps.saveDecision(granted ? 'granted' : 'declined');
            return granted;
        })().finally(() => { pending = null; });
        return pending;
    };
}
