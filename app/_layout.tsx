// app/_layout.tsx
import { ApolloProvider } from "@apollo/client/react";
import { Stack } from "expo-router";
import { apollo, getTokens, onTokensChanged } from "../lib/apollo"; // <— add onTokensChanged
import { NativeBaseProvider } from "native-base";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SocketProvider } from "@/providers/SocketProvider";
import { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import PushRegistrar from "@/push/registerDevice";
import NotificationRouter from "@/push/NotificationRouter";
import NotificationDisplay from "@/push/NotificationDisplay";
import { NotificationPermissionGate } from "@/push/NotificationPermissionGate";

export default function RootLayout() {
    const [token, setToken] = useState<string | null>(null);
    const [tokenLoading, setTokenLoading] = useState(true);

    // Initial read
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const { accessToken } = await getTokens();
                if (!mounted) return;
                setToken(accessToken ?? null);
            } finally {
                if (mounted) setTokenLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, []);

    // React to login/logout/refresh
    useEffect(() => {
        const unsubscribe = onTokensChanged(async () => {
            const { accessToken } = await getTokens();
            setToken(accessToken ?? null);
        });
        return unsubscribe;
    }, []);

    return (
        <>
            <StatusBar style="dark" />
            <SafeAreaProvider>
                <NativeBaseProvider>
                    <ApolloProvider client={apollo}>
                        <PushRegistrar />
                        <NotificationPermissionGate />
                        <NotificationRouter />
                        <NotificationDisplay />
                        {token ? (
                            // key forces a clean remount when auth flips → fresh socket connect
                            <SocketProvider token={token} key={`sock-auth-1`}>
                                <Stack screenOptions={{ headerShown: false }} />
                            </SocketProvider>
                        ) : (
                            <Stack screenOptions={{ headerShown: false }} key={`sock-auth-0`} />
                        )}
                    </ApolloProvider>
                </NativeBaseProvider>
            </SafeAreaProvider>
        </>
    );
}
