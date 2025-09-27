import { ApolloProvider } from "@apollo/client/react";
import { Stack } from "expo-router";
import {apollo, getTokens} from "../lib/apollo";
import { NativeBaseProvider } from "native-base"; // ← CORRECT IMPORT
import { SafeAreaProvider } from "react-native-safe-area-context";
import { SocketProvider } from "@/providers/SocketProvider";
import {useEffect, useState} from "react";
import { StatusBar } from "expo-status-bar";
import PushRegistrar from "@/push/registerDevice";


export default function RootLayout() {
    const [token, setToken] = useState<string | null>(null);
    const [tokenLoading, setTokenLoading] = useState(true);
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
    return (
        <>
            <StatusBar style="dark" />
            <SafeAreaProvider>

        <NativeBaseProvider>
            { token &&  <SocketProvider token={token}>
                <ApolloProvider client={apollo}>
                    <PushRegistrar/>
                    <Stack screenOptions={{ headerShown: false }} />
                </ApolloProvider>
            </SocketProvider>}
        </NativeBaseProvider>

        </SafeAreaProvider>
            </>
  );
}
