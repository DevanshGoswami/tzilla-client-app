import { BackHandler } from "react-native";

// React Native 0.79 removed BackHandler.removeEventListener, but some libraries still call it.
// Shim it to keep those dependencies working on every platform.
if (typeof BackHandler.addEventListener === "function") {
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
