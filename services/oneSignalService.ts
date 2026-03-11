import OneSignal from 'onesignal-cordova-plugin';
import { Capacitor } from '@capacitor/core';

// This is where you would put your OneSignal App ID
// You can find this in OneSignal Dashboard -> Settings -> App Settings
export const ONESIGNAL_APP_ID = '1ef08667-85c4-42b4-8bce-247b558b9a8f';

export const OneSignalService = {
    async initialize() {
        if (!Capacitor.isNativePlatform()) return;

        // --- OneSignal Initialization ---
        // 1. Initialise OneSignal
        OneSignal.initialize(ONESIGNAL_APP_ID);

        // 2. Request Notification Permission
        // This prompts the user to allow notifications on iOS and Android 13+
        OneSignal.Notifications.requestPermission(true).then((success: boolean) => {
            console.log('OneSignal: Notification permission granted:', success);
        });

        // 3. Notification Click/Opened Listener
        OneSignal.Notifications.addEventListener('click', (event) => {
            console.log('OneSignal: Notification clicked:', event);
            // You can handle deep linking or specific actions here
        });

        console.log('OneSignal Service Initialized');
    },

    // Link a specific user ID for targeted notifications 
    // (e.g. sending a specific tip to one person)
    setExternalId(userId: string) {
        if (!Capacitor.isNativePlatform()) return;

        console.log('OneSignal: Setting External ID:', userId);
        OneSignal.login(userId);
    },

    // Remove the link when they log out
    logout() {
        if (!Capacitor.isNativePlatform()) return;
        OneSignal.logout();
    }
};
