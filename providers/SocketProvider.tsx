import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { getTokens } from "@/lib/apollo";
import { isTokenExpired, refreshAccessToken } from "@/lib/apollo"; // <-- exported in step 1
import { router } from "expo-router";

type Ctx = {
    socket: Socket | null;
    emit: (...args: any[]) => void;
    presence: Record<string, boolean>;
};

const SocketCtx = createContext<Ctx>({ socket: null, emit: () => {}, presence: {} });

export function SocketProvider({ children, token }: { children: React.ReactNode; token?: string | null }) {
    const [presence, setPresence] = useState<Record<string, boolean>>({});
    const socketRef = useRef<Socket | null>(null);
    const refreshingRef = useRef<Promise<string | null> | null>(null); // collapse concurrent refreshes

    // Ensures we have a fresh token (uses passed prop token or stored token)
    const ensureFreshToken = useCallback(async (): Promise<string | null> => {
        // Prefer the prop token when present, else read from storage
        let current = token || (await getTokens()).accessToken;

        if (!current || isTokenExpired(current)) {
            // collapse concurrent refresh attempts
            if (!refreshingRef.current) {
                refreshingRef.current = refreshAccessToken().finally(() => {
                    // small delay to avoid stampede loops
                    setTimeout(() => (refreshingRef.current = null), 250);
                });
            }
            current = await refreshingRef.current;
            if (!current) return null;
        }

        return current;
    }, [token]);

    // Assign a fresh token to socket.auth (if socket exists)
    const setSocketAuthToken = useCallback((s: Socket | null, tkn: string | null) => {
        if (!s || !tkn) return;
        // role is fixed as "client" per your code; change if you pass dynamic role
        s.auth = { token: tkn, role: "client" as const };
    }, []);

    useEffect(() => {
        let cancelled = false;

        (async () => {
            // If no token anywhere, ensure disconnect & stop
            const fromState = token || (await getTokens()).accessToken;
            if (!fromState) {
                if (socketRef.current?.connected) {
                    socketRef.current.disconnect();
                    socketRef.current = null;
                }
                return;
            }

            // Get a *fresh* token first (may refresh)
            const fresh = await ensureFreshToken();
            if (cancelled || !fresh) {
                // user likely logged out or refresh failed (apollo logic routes to /login)
                return;
            }

            // Create (or recreate) the socket
            const s = io(process.env.EXPO_PUBLIC_SOCKET_URL || "http://localhost:4000", {
                transports: ["websocket"],
                autoConnect: false,
            });

            // Set auth before connect
            setSocketAuthToken(s, fresh);

            // --- Handlers ---
            const onConnectError = async (err: any) => {
                const msg = String(err?.message || err || "");
                // If server rejected due to auth, try a one-shot refresh & reconnect
                if (/auth|jwt|token|Unauthorized|Invalid token|UNAUTHENTICATED/i.test(msg)) {
                    const newTok = await ensureFreshToken();
                    if (!newTok) {
                        // redirect handled by refresh helper; just stop here
                        return;
                    }
                    setSocketAuthToken(s, newTok);
                    // reconnect with new token
                    if (!s.connected) s.connect();
                } else {
                    console.log("🔌 connect_error:", msg);
                }
            };

            const onPresence = (p: { userId: string; online: boolean }) => {
                setPresence(prev => ({ ...prev, [p.userId]: p.online }));
            };

            // Optional: if your server emits a custom "unauthorized" event mid-connection
            const onUnauthorized = async () => {
                const newTok = await ensureFreshToken();
                if (!newTok) return; // logout path already triggered
                setSocketAuthToken(s, newTok);
                // Force reconnect to refresh handshake
                if (s.connected) s.disconnect();
                s.connect();
            };

            // Before each reconnect attempt, make sure the token won’t expire imminently
            const onReconnectAttempt = async () => {
                const newTok = await ensureFreshToken();
                if (!newTok) return;
                setSocketAuthToken(s, newTok);
            };

            s.on("connect_error", onConnectError);
            s.on("presence:update", onPresence);
            s.on("unauthorized", onUnauthorized);      // if you choose to emit this server-side
            s.io.on("reconnect_attempt", onReconnectAttempt);

            s.connect();
            socketRef.current = s;

            // Cleanup
            return () => {
                if (cancelled) return;
                s.off("connect_error", onConnectError);
                s.off("presence:update", onPresence);
                s.off("unauthorized", onUnauthorized);
                s.io.off("reconnect_attempt", onReconnectAttempt);
                s.disconnect();
                if (socketRef.current === s) socketRef.current = null;
            };
        })();

        return () => {
            cancelled = true;
        };
    }, [token, ensureFreshToken, setSocketAuthToken]);

    // Emit wrapper that ensures a fresh token right before emitting
    const emit = useMemo(
        () =>
            // @ts-ignore
            async (...args: any[]) => {
                const s = socketRef.current;
                if (!s) return;

                // renew token if needed before important emits
                const newTok = await ensureFreshToken();
                if (!newTok) return;
                setSocketAuthToken(s, newTok);

                // If socket got disconnected (e.g., token expired), reconnect
                if (!s.connected && s.disconnected) {
                    s.connect();
                    // Small wait could be added if you want to guarantee delivery after reconnect
                }

                // @ts-ignore
                return s.emit?.(...args);
            },
        [ensureFreshToken, setSocketAuthToken]
    );

    return (
        <SocketCtx.Provider value={{ socket: socketRef.current, emit, presence }}>
            {children}
        </SocketCtx.Provider>
    );
}

export function useSocket() {
    return useContext(SocketCtx);
}
