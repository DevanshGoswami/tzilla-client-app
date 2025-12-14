import React, {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    useCallback,
} from "react";
import { io, Socket } from "socket.io-client";
import { getTokens, isTokenExpired, refreshAccessToken } from "@/lib/apollo";
import { useRuntimeConfig } from "@/lib/remoteConfig";

// ---- Context shape ----
type SocketContextType = {
    socket: Socket | null;
    connected: boolean;
    emit: (...args: any[]) => void;
    presence: Record<string, boolean>;
};

const SocketCtx = createContext<SocketContextType>({
    socket: null,
    connected: false,
    emit: () => {},
    presence: {},
});

// ---- Provider ----
export function SocketProvider({
                                   children,
                                   token,
                               }: {
    children: React.ReactNode;
    token?: string | null;
}) {
    const runtimeConfig = useRuntimeConfig();
    const socketBaseUrl = (runtimeConfig.socketUrl || runtimeConfig.apiUrl || "").trim();
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const [presence, setPresence] = useState<Record<string, boolean>>({});

    const socketRef = useRef<Socket | null>(null);
    const refreshingRef = useRef<Promise<string | null> | null>(null);

    // --- Ensure we always have a valid access token ---
    const ensureFreshToken = useCallback(async (): Promise<string | null> => {
        let current = token || (await getTokens()).accessToken;
        if (!current || isTokenExpired(current)) {
            if (!refreshingRef.current) {
                refreshingRef.current = refreshAccessToken().finally(() =>
                    setTimeout(() => (refreshingRef.current = null), 250)
                );
            }
            current = await refreshingRef.current;
        }
        return current;
    }, [token]);

    const setSocketAuthToken = useCallback((s: Socket | null, tkn: string | null) => {
        if (!s || !tkn) return;
        s.auth = { token: tkn, role: "client" as const };
    }, []);

    // --- Lifecycle ---
    useEffect(() => {
        let cancelled = false;

        (async () => {
            const stored = token || (await getTokens()).accessToken;
            if (!stored) {
                if (socketRef.current?.connected) socketRef.current.disconnect();
                socketRef.current = null;
                setSocket(null);
                setConnected(false);
                return;
            }

            const fresh = await ensureFreshToken();
            if (cancelled || !fresh) return;

            if (!socketBaseUrl) {
                setSocket(null);
                setConnected(false);
                return;
            }

            const s = io(socketBaseUrl, {
                transports: ["websocket"],
                autoConnect: false,
            });

            setSocketAuthToken(s, fresh);

            // ---- Handlers ----
            const onConnect = () => setConnected(true);
            const onDisconnect = () => setConnected(false);
            const onConnectError = async (err: any) => {
                const msg = String(err?.message || err || "");
                if (/auth|jwt|token|Unauthorized|Invalid token|UNAUTHENTICATED/i.test(msg)) {
                    const newTok = await ensureFreshToken();
                    if (!newTok) return;
                    setSocketAuthToken(s, newTok);
                    if (!s.connected) s.connect();
                } else {
                    console.log("🔌 connect_error:", msg);
                }
            };
            const onPresence = (p: { userId: string; online: boolean }) => {
                setPresence((prev) => ({ ...prev, [p.userId]: p.online }));
            };
            const onUnauthorized = async () => {
                const newTok = await ensureFreshToken();
                if (!newTok) return;
                setSocketAuthToken(s, newTok);
                if (s.connected) s.disconnect();
                s.connect();
            };
            const onReconnectAttempt = async () => {
                const newTok = await ensureFreshToken();
                if (!newTok) return;
                setSocketAuthToken(s, newTok);
            };

            // ---- Register events ----
            s.on("connect", onConnect);
            s.on("disconnect", onDisconnect);
            s.on("connect_error", onConnectError);
            s.on("presence:update", onPresence);
            s.on("unauthorized", onUnauthorized);
            s.io.on("reconnect_attempt", onReconnectAttempt);

            s.connect();
            socketRef.current = s;
            setSocket(s);

            // ---- Cleanup ----
            return () => {
                if (cancelled) return;
                s.off("connect", onConnect);
                s.off("disconnect", onDisconnect);
                s.off("connect_error", onConnectError);
                s.off("presence:update", onPresence);
                s.off("unauthorized", onUnauthorized);
                s.io.off("reconnect_attempt", onReconnectAttempt);
                s.disconnect();
                if (socketRef.current === s) socketRef.current = null;
                setSocket(null);
                setConnected(false);
            };
        })();

        return () => {
            cancelled = true;
        };
    }, [token, ensureFreshToken, setSocketAuthToken, socketBaseUrl]);

    // --- Emit wrapper ---
    const emit = useMemo(
        () => async (...args: any[]) => {
            const s = socketRef.current;
            if (!s) return;

            const newTok = await ensureFreshToken();
            if (!newTok) return;
            setSocketAuthToken(s, newTok);

            if (!s.connected && s.disconnected) {
                s.connect();
            }

            return s.emit?.(...args);
        },
        [ensureFreshToken, setSocketAuthToken]
    );

    useEffect(() => {
        if (!token && socketRef.current?.connected) {
            socketRef.current.disconnect();
            setConnected(false);
            setSocket(null);
        }
    }, [token]);


    return (
        <SocketCtx.Provider value={{ socket, connected, emit, presence }}>
            {children}
        </SocketCtx.Provider>
    );
}

// ---- Hook ----
export function useSocket() {
    return useContext(SocketCtx);
}
