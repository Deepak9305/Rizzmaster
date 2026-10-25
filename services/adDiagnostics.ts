// Session-only delivery counters. Never record reply content, user IDs or SSV data.
const counts: Record<string, number> = {};
let lastEvent: { name: string; at: number; code?: string | number } | null = null;

export const recordAdEvent = (name: string, code?: string | number) => {
    counts[name] = (counts[name] || 0) + 1;
    lastEvent = { name, at: Date.now(), ...(code === undefined ? {} : { code }) };
    console.info('[AdDelivery]', name, code ?? '');
};

export const getAdDeliveryDiagnostics = () => ({ counts: { ...counts }, lastEvent: lastEvent && { ...lastEvent } });
