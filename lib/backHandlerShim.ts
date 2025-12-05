import { BackHandler, Platform } from "react-native";

if (Platform.OS === "android") {
    const originalAddEventListener = BackHandler.addEventListener.bind(BackHandler);
    const subscriptions = new Map<(...args: any[]) => any, { remove?: () => void }>();

    BackHandler.addEventListener = (eventName: string, handler: (...args: any[]) => any) => {
        const sub = originalAddEventListener(eventName, handler);
        subscriptions.set(handler, sub);
        return {
            remove: () => {
                subscriptions.get(handler)?.remove?.();
                subscriptions.delete(handler);
            },
        };
    };

    if (typeof (BackHandler as any).removeEventListener !== "function") {
        (BackHandler as any).removeEventListener = (_eventName: string, handler: (...args: any[]) => any) => {
            subscriptions.get(handler)?.remove?.();
            subscriptions.delete(handler);
        };
    }
}
