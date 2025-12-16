import { REGISTER_DEVICE_TOKEN } from "@/graphql/mutations";
import { useMutation } from "@apollo/client/react";
import messaging from "@react-native-firebase/messaging";
import { useEffect, useRef } from "react";
import { Platform } from "react-native";

export default function PushRegistrar() {
  const [registerDeviceToken] = useMutation(REGISTER_DEVICE_TOKEN);
  const lastRegisteredTokenRef = useRef<string | null>(null);

  useEffect(() => {
    let unsubscribeRefresh: undefined | (() => void);
    let mounted = true;

    (async () => {
      try {
        // -------------------------
        // iOS: permission -> register for remote messages -> wait APNs -> get FCM
        // Android: keep existing behavior (just get FCM)
        // -------------------------

        if (Platform.OS === "ios") {
          const status = await messaging().requestPermission();
          const enabled =
            status === messaging.AuthorizationStatus.AUTHORIZED ||
            status === messaging.AuthorizationStatus.PROVISIONAL;

          if (!enabled) return;

          // IMPORTANT: do NOT gate this behind isDeviceRegisteredForRemoteMessages
          // RNFirebase can still throw if APNs token isn't ready.
          await messaging().registerDeviceForRemoteMessages();

          // Wait briefly for APNs token to appear
          let apnsToken: string | null = null;
          for (let i = 0; i < 10; i++) {
            apnsToken = await messaging().getAPNSToken();
            if (apnsToken) break;
            await new Promise((r) => setTimeout(r, 400));
          }

          // If you still don't have an APNs token, getToken() will throw the exact error you're seeing.
          if (!apnsToken) {
            console.warn(
              "[PushRegistrar] APNs token not available yet. Make sure you're on a real iPhone + Push Notifications capability is enabled."
            );
            return;
          }
        }

        // ✅ Android unchanged, ✅ iOS safe now
        const token = await messaging().getToken();

        if (mounted && token && lastRegisteredTokenRef.current !== token) {
          lastRegisteredTokenRef.current = token;

          await registerDeviceToken({
            variables: {
              input: {
                platform: Platform.OS, // "ios" | "android"
                token,
                appVersion: undefined,
                deviceId: undefined,
                locale: Intl.DateTimeFormat().resolvedOptions().locale,
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
              },
            },
          });
        }

        unsubscribeRefresh = messaging().onTokenRefresh(
          async (newToken: string) => {
            try {
              if (!mounted) return;
              if (!newToken || lastRegisteredTokenRef.current === newToken)
                return;

              lastRegisteredTokenRef.current = newToken;

              await registerDeviceToken({
                variables: {
                  input: {
                    platform: Platform.OS,
                    token: newToken,
                    locale: Intl.DateTimeFormat().resolvedOptions().locale,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                  },
                },
              });
            } catch (err) {
              console.error(err);
            }
          }
        );
      } catch (err) {
        console.error(err);
      }
    })();

    return () => {
      mounted = false;
      if (unsubscribeRefresh) unsubscribeRefresh();
    };
  }, [registerDeviceToken]);

  return null;
}
