export class AdForegroundClock {
    private activeMs = 0;
    private startedAt: number | null = null;
    private backgroundAt: number | null = null;
    private lastAdAt: number;

    constructor(
        private readonly cooldownMs = 2 * 60 * 1000,
        private readonly inactivityResetMs = 30 * 60 * 1000,
    ) {
        this.lastAdAt = -cooldownMs;
    }

    start(now: number) {
        if (this.startedAt !== null) return;
        if (this.backgroundAt !== null && now - this.backgroundAt >= this.inactivityResetMs) {
            this.activeMs = 0;
            this.lastAdAt = 0;
        }
        this.backgroundAt = null;
        this.startedAt = now;
    }

    pause(now: number) {
        if (this.startedAt === null) return 0;
        const segmentMs = Math.max(0, now - this.startedAt);
        this.activeMs += segmentMs;
        this.startedAt = null;
        this.backgroundAt = now;
        // Analytics flushes only this segment; cooldown keeps the total.
        return segmentMs;
    }

    private activeTime(now: number) {
        return this.activeMs + (this.startedAt === null ? 0 : Math.max(0, now - this.startedAt));
    }

    canShowAd(now: number) {
        return this.activeTime(now) - this.lastAdAt >= this.cooldownMs;
    }

    recordAd(now: number) {
        this.lastAdAt = this.activeTime(now);
    }
}
