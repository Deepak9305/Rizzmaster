import { LocalNotifications } from '@capacitor/local-notifications';
import { Preferences } from '@capacitor/preferences';
import { Capacitor } from '@capacitor/core';

const USAGE_HISTORY_KEY = 'rizz_app_usage_history';
const MAX_HISTORY_SAMPLES = 14; // Last 14 opens

const RIZZ_TIPS = [
    // --- General Rizz & Chat ---
    "Pro Tip: If they're using one-word replies, it's time to pivot. Want a pivot line? 🔄",
    "The Rizz God is watching... don't leave them on read for too long! ⚡",
    "Ready to cook some new replies? Don't let that match go cold. 🍳",
    "Vibe Check! Is it time to ask for the date or keep the banter going? 🍷",
    "Ban the 'Hey'. Try something chaotic instead. Click for a wildcard! 🌪️",
    "Are you really going to send that boring 'How's your day?' Do better. 😤",
    "Nonchalant energy only. Don't double text unless it's fire. 🤫",
    "Mystery is your best friend. Keep them guessing. 🕵️‍♂️",
    "Confidence is 90% of the game. The other 10% is here. 👑",
    "Avoid being the 'interviewer'. Ask questions they actually want to answer. 🎤",
    "Stop overthinking. The best reply is usually the one you're afraid to send. 🚀",
    "First dates are won in the chat. Let's polish those lines. 💎",

    // --- Bestie / Persona Modes ---
    "Need a sister's take? Use the Bestie mode for an elite vibe check. 💅",
    "Switch to Chaotic mode if the convo is getting too predictable. 🌪️",
    "The Roast Master is ready. Don't send that mid reply! 🔥",
    "The Smooth mode is for the closers. Ready to lock it in? 🤝",
    "Don't be an NPC. Refresh your vibe with a new persona. 🎭",
    "Level up your game with a custom persona. Your style, your rules. 👑",

    // --- Bio Writer ---
    "Your bio is your first impression. Let's make it magnetic. ✨",
    "Is your profile doing the work? Let's refresh that bio. ✍️",

    // --- Vision AI ---
    "Got a screenshot? Upload it and let Vision AI read the subtext for you. 📸",
    "Wife material or just a sleeper hit? Let's check the subtext. 🧐",

    // --- Saved Items ---
    "Build your personal library. Save your best lines for later! 📚",
    "Your secret weapon is waiting. Review your saved rizz. 📂",

    // --- General Engagement ---
    "NPC energy detected! Refresh your replies before you get ghosted. 👻",
    "A well-timed roast is worth 100 compliments. Want a subtle burn? 🔥",
    "Running low on juice? Watch a quick ad for a credit boost! ⚡"
];

export const NotificationService = {
    /**
     * Request permissions and initialize
     */
    async initialize() {
        if (!Capacitor.isNativePlatform()) return;

        const permission = await LocalNotifications.checkPermissions();
        if (permission.display !== 'granted') {
            const result = await LocalNotifications.requestPermissions();
            if (result.display !== 'granted') return;
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
            let history: number[] = [];
            if (value) {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) history = parsed;
            }

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
            let history: number[] = [];
            if (value) {
                const parsed = JSON.parse(value);
                if (Array.isArray(parsed)) history = parsed;
            }

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
        date.setHours(hour, 0, 0, 0);

        // Randomly offset by +/- 15 minutes to feel more "human"/natural
        const offsetMinutes = Math.floor(Math.random() * 30) - 15;
        date.setMinutes(date.getMinutes() + offsetMinutes);

        // Ensure we never schedule in the past (can happen at hour=0 with negative offset)
        if (date.getTime() <= Date.now()) {
            date.setTime(Date.now() + 60_000);
        }

        return date;
    }
};
