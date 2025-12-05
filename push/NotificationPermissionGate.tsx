// somewhere mounted early (e.g., right next to PushRegistrar)
import * as Notifications from "expo-notifications";
import { Alert, Linking, Platform } from "react-native";
import { useEffect, useRef } from "react";

export function NotificationPermissionGate() {
    const alertedRef = useRef(false);

    useEffect(() => {
        (async () => {
            // iOS + Android 13+ need a runtime prompt
            const { status, canAskAgain } = await Notifications.getPermissionsAsync();
            if (status !== "granted" && canAskAgain) {
                const res = await Notifications.requestPermissionsAsync();
                console.log("[notif] permission status:", res.status);
            } else if (status !== "granted" && !canAskAgain && !alertedRef.current) {
                alertedRef.current = true;
                Alert.alert(
                    "Enable notifications",
                    "TrainZilla needs notification access for reminders and trainer updates. Please enable notifications in system settings.",
                    [
                        { text: "Later", style: "cancel" },
                        {
                            text: "Open settings",
                            onPress: () => {
                                if (Platform.OS === "ios") {
                                    Linking.openURL("app-settings:");
                                } else {
                                    Linking.openSettings();
                                }
                            },
                        },
                    ]
                );
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
