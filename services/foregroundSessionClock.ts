export class ForegroundSessionClock {
    private startedAt: number | null = null;

    start(now: number) {
        if (this.startedAt === null) this.startedAt = now;
    }

    pause(now: number) {
        if (this.startedAt === null) return 0;
        const elapsed = Math.max(0, now - this.startedAt);
        this.startedAt = null;
        return elapsed;
    }
}
