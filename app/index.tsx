import { useEffect, useState } from "react";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";


console.log("[Index] file evaluated");

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

    useEffect(() => {
        if (!ready) return;
        const target = authed ? "/(tabs)/home" : "/(auth)/login";
        router.replace(target);
    }, [ready, authed]);

    return null;
}
