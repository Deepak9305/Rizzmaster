import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const USAGE_HISTORY_KEY = 'rizz_app_usage_history';
const MAX_HISTORY_SAMPLES = 14; // Last 14 opens

const RIZZ_TIPS = [
    "Pro Tip: If they're using one-word replies, it's time to pivot. Want a pivot line? 🔄",
    "The Rizz God is watching... don't leave them on read for too long! ⚡",
    "Ready to cook some new replies? Don't let that match go cold. 🍳",
    "Vibe Check! Is it time to ask for the date or keep the banter going? 🍷",
    "Ban the 'Hey'. Try something chaotic instead. Click for a wildcard! 🌪️",
    "Are you really going to send that boring 'How's your day?' Do better. 😤",
    "Nonchalant energy only. Don't double text unless it's fire. 🤫",
    "Mystery is your best friend. Keep them guessing. 🕵️‍♂️",
    "If they sent a meme, the door is open. Send a better one. 🖼️",
    "Confidence is 90% of the game. The other 10% is here. 👑",
    "Avoid being the 'interviewer'. Ask questions they actually want to answer. 🎤",
    "Wife material or just a sleeper hit? Let's check the subtext. 🧐",
    "NPC energy detected! Refresh your replies before you get ghosted. 👻",
    "A well-timed roast is worth 100 compliments. Want a subtle burn? 🔥",
    "Stop overthinking. The best reply is usually the one you're afraid to send. 🚀"
];

export const NotificationService = {
    /**
     * Request permissions and initialize
     */
    async initialize() {
        if (!Capacitor.isNativePlatform()) return;

        const permission = await LocalNotifications.checkPermissions();
        if (permission.display !== 'granted') {
            await LocalNotifications.requestPermissions();
        }

        // Record a usage hit on every init
        await this.recordUsage();

        // Refresh schedule for the next 7 days
        await this.schedulePersonalizedNotifications();
    },

    /**
     * Records the current hour of usage to learn patterns
     */
    async recordUsage() {
        if (!Capacitor.isNativePlatform()) return;

        try {
            const { value } = await Preferences.get({ key: USAGE_HISTORY_KEY });
            let history: number[] = value ? JSON.parse(value) : [];

            const currentHour = new Date().getHours();

            // Add new sample and cap the size
            history.push(currentHour);
            if (history.length > MAX_HISTORY_SAMPLES) {
                history = history.slice(-MAX_HISTORY_SAMPLES);
            }

            await Preferences.set({
                key: USAGE_HISTORY_KEY,
                value: JSON.stringify(history)
            });

            console.log('NotificationService: Recorded usage at hour:', currentHour);
        } catch (e) {
            console.warn('Failed to record usage tracking:', e);
        }
    },

    /**
     * Calculates the best hour to send notifications based on history
     * Falls back to 7 PM if not enough data
     */
    async getOptimalHour(): Promise<number> {
        try {
            const { value } = await Preferences.get({ key: USAGE_HISTORY_KEY });
            const history: number[] = value ? JSON.parse(value) : [];

            if (history.length < 3) return 19; // Default to 7 PM

            // Count frequency of each hour
            const counts: Record<number, number> = {};
            history.forEach(h => counts[h] = (counts[h] || 0) + 1);

            // Find most common hour
            let mostCommonHour = 19;
            let maxCount = 0;

            for (const hour in counts) {
                if (counts[hour] > maxCount) {
                    maxCount = counts[hour];
                    mostCommonHour = parseInt(hour);
                }
            }

            return mostCommonHour;
        } catch {
            return 19;
        }
    },

    /**
     * Schedules random notifications for the next 7 days at the optimal hour
     */
    async schedulePersonalizedNotifications() {
        if (!Capacitor.isNativePlatform()) return;

        try {
            // 1. Clear existing scheduled notifications to avoid duplicates
            const pending = await LocalNotifications.getPending();
            if (pending.notifications.length > 0) {
                await LocalNotifications.cancel(pending);
            }

            // 2. Get the optimal hour
            const optimalHour = await this.getOptimalHour();
            console.log('NotificationService: Scheduling for optimal hour:', optimalHour);

            // 3. Prepare 7 days of random notifications
            const notifications = [];

            // Shuffle a copy of the tips for randomness without immediate repetition
            const shuffledTips = [...RIZZ_TIPS].sort(() => Math.random() - 0.5);

            for (let i = 1; i <= 7; i++) {
                const tip = shuffledTips[(i - 1) % shuffledTips.length];

                notifications.push({
                    title: "Rizz Master ⚡",
                    body: tip,
                    id: 1000 + i, // Unique ID per day
                    schedule: {
                        at: this.getNextOccurrence(optimalHour, i),
                        repeats: false, // We re-schedule every time they open the app anyway
                        allowWhileIdle: true,
                    },
                });
            }

            await LocalNotifications.schedule({ notifications });
            console.log('NotificationService: Scheduled 7 days of tips.');
        } catch (e) {
            console.error('Failed to schedule notifications:', e);
        }
    },

    /**
     * Helper to get the Date object for the next occurrence of a specific hour
     * @param hour The preferred hour (0-23)
     * @param daysAhead How many days from now
     */
    getNextOccurrence(hour: number, daysAhead: number): Date {
        const date = new Date();
        date.setDate(date.getDate() + daysAhead);
        date.setHours(hour, 0, 0, 0); // Set to the start of the preferred hour

        // Randomly offset by +/- 15 minutes to feel more "human"/natural
        const offsetMinutes = Math.floor(Math.random() * 30) - 15;
        date.setMinutes(date.getMinutes() + offsetMinutes);

        return date;
    }
};
