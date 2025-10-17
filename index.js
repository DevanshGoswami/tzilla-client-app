// index.js (project root)
import 'expo-router/entry';

import messaging from '@react-native-firebase/messaging';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

async function ensureChannel() {
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Default',
            importance: Notifications.AndroidImportance.DEFAULT,
        });
    }
}

messaging().setBackgroundMessageHandler(async (rm) => {
    await ensureChannel();

    const title = rm.data?.title ?? 'Notification';
    const body  = rm.data?.body  ?? '';

    await Notifications.scheduleNotificationAsync({
        content: { title, body, data: rm.data }, // keep action_* keys for routing
        trigger: null, // show immediately
    });
});
