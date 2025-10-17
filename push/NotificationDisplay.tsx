// src/push/NotificationDisplay.tsx
import { useEffect } from "react";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import messaging from "@react-native-firebase/messaging";

// Android: show heads-up
// @ts-ignore
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: false,
    }),
});

export default function NotificationDisplay() {
    useEffect(() => {
        let unsub: undefined | (() => void);

        (async () => {
            if (Platform.OS === "android") {
                await Notifications.setNotificationChannelAsync("general", {
                    name: "General",
                    importance: Notifications.AndroidImportance.DEFAULT,
                });
            }

            // Foreground remote messages -> show local notification
            unsub = messaging().onMessage(async (rm) => {
                console.log("[onMessage] received:", JSON.stringify(rm, null, 2));

                const title = rm.data?.title ?? rm.notification?.title ?? "Notification";
                const body  = rm.data?.body  ?? rm.notification?.body  ?? "";

                await Notifications.scheduleNotificationAsync({
                    content: {
                        title: title as string,
                        body: body as string,
                        data: rm.data, // keep action_* keys for tap routing
                    },
                    trigger: null, // fire immediately
                });
            });
        })();

        return () => { unsub?.(); };
    }, []);

    return null;
}
