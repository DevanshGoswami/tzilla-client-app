// somewhere mounted early (e.g., right next to PushRegistrar)
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { useEffect } from "react";

export function NotificationPermissionGate() {
    useEffect(() => {
        (async () => {
            // iOS + Android 13+ need a runtime prompt
            const { status, canAskAgain } = await Notifications.getPermissionsAsync();
            if (status !== "granted" && canAskAgain) {
                const res = await Notifications.requestPermissionsAsync();
                console.log("[notif] permission status:", res.status);
            } else {
                console.log("[notif] permission status:", status);
            }

            // Foreground handler: show alert when we display locally
            Notifications.setNotificationHandler({
                handleNotification: async () => ({
                    shouldShowAlert: true,
                    shouldPlaySound: false,
                    shouldSetBadge: false,
                    shouldShowList: true, shouldShowBanner: true,
                }),
            });

            // Android channel (use id = 'default' to be extra safe)
            if (Platform.OS === "android") {
                await Notifications.setNotificationChannelAsync("default", {
                    name: "Default",
                    importance: Notifications.AndroidImportance.DEFAULT,
                });
            }
        })();
    }, []);
    return null;
}
