import {REGISTER_DEVICE_TOKEN} from "@/graphql/mutations";
import {useMutation} from "@apollo/client/react";
import {useEffect} from "react";
import messaging from "@react-native-firebase/messaging";
import {Platform} from "react-native";

export default function PushRegistrar() {
    const [registerDeviceToken] = useMutation(REGISTER_DEVICE_TOKEN);

    console.log('- -- - -- came here - - - - - ')

    useEffect(() => {
        let unsubscribeRefresh: undefined | (() => void);
        let mounted = true;

        (async () => {
            try {
                // iOS permission
                if (Platform.OS === "ios") {
                    const status = await messaging().requestPermission();
                    const enabled =
                        status === messaging.AuthorizationStatus.AUTHORIZED ||
                        status === messaging.AuthorizationStatus.PROVISIONAL;
                    if (!enabled) return;
                }

                // get current token & register
                const token = await messaging().getToken();

                console.log('- -- - -- came here - - - - - token - - - --', token);
                if (mounted && token) {
                    await registerDeviceToken({
                        variables: {
                            input: {
                                platform: Platform.OS, // "ios" | "android"
                                token,
                                appVersion: undefined, // add if you want
                                deviceId: undefined,   // add if you want
                                locale: Intl.DateTimeFormat().resolvedOptions().locale,
                                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                            },
                        },
                    });
                }

                // listen for rotations
                unsubscribeRefresh = messaging().onTokenRefresh(async (newToken: any) => {
                    try {
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
                });
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
