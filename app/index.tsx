import { useEffect, useState } from "react";
import { Redirect } from "expo-router";
import * as SecureStore from "expo-secure-store";

export default function Index() {
    const [ready, setReady] = useState(false);
    const [authed, setAuthed] = useState(false);

    useEffect(() => {
        (async () => {
            const token = await SecureStore.getItemAsync("tz_access_token");
            setAuthed(!!token);
            setReady(true);
        })();
    }, []);

    if (!ready) return null;
    return authed ? <Redirect href="/(tabs)/home" /> : <Redirect href="/(auth)/login" />;
}
