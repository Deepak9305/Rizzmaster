/** Abort stalled auth HTTP requests, rather than letting a late request sign in
 * after the UI has moved to guest mode. Other Supabase requests are unchanged. */
export const createAuthFetch = (fetcher: typeof fetch = globalThis.fetch, timeoutMs = 30_000): typeof fetch => (
    async (input, init) => {
        const url = typeof input === 'object' && 'url' in input ? input.url : String(input);
        if (!new URL(url).pathname.startsWith('/auth/v1/')) return fetcher(input, init);
        const controller = new AbortController();
        const signal = init?.signal ?? (typeof input === 'object' && 'signal' in input ? input.signal : undefined);
        const cancel = () => controller.abort(signal?.reason);
        if (signal?.aborted) cancel();
        else signal?.addEventListener('abort', cancel, { once: true });
        let expired = false;
        const timer = setTimeout(() => { expired = true; controller.abort(); }, timeoutMs);
        try {
            return await fetcher(input, { ...init, signal: controller.signal });
        } catch (error) {
            if (expired) throw new Error('Authentication request timed out');
            throw error;
        } finally {
            clearTimeout(timer);
            signal?.removeEventListener('abort', cancel);
        }
    }
);
