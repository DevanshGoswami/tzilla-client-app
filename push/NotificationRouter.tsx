// src/push/NotificationRouter.tsx
import { useEffect } from "react";
import { router } from "expo-router";
import * as Notifications from "expo-notifications";
import messaging from "@react-native-firebase/messaging";
import { Linking } from "react-native";

function navigateFromData(data?: Record<string, any>) {
    if (!data) return;
    if (data.action_type === "route" && data.action_route) {
        let params;
        if (data.action_params) { try { params = JSON.parse(data.action_params); } catch {} }
        params ? router.push({ pathname: data.action_route, params }) : router.push(data.action_route);
    } else if (data.action_type === "url" && data.action_url) {
        Linking.openURL(data.action_url);
    }
}

export default function NotificationRouter() {
    useEffect(() => {
        // Remote taps (background → foreground)
        const unsubOpened = messaging().onNotificationOpenedApp((rm) => navigateFromData(rm?.data));
        // Remote taps (cold launch)
        messaging().getInitialNotification().then((rm) => navigateFromData(rm?.data)).catch(() => {});

        // Local taps (foreground / cold launch)
        const unsubResponse = Notifications.addNotificationResponseReceivedListener((resp) => {
            navigateFromData(resp.notification.request.content.data as any);
        });
        Notifications.getLastNotificationResponseAsync().then((resp) => {
            if (resp) navigateFromData(resp.notification.request.content.data as any);
        });

        return () => { unsubOpened(); unsubResponse.remove(); };
    }, []);

    return null;
}
