import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FlatList,
    TouchableOpacity,
    StyleSheet,
    SafeAreaView,
    View,
    TextInput,
    RefreshControl,
    Dimensions
} from "react-native";
import { Box, Text, HStack, VStack, Avatar, Spinner, Center, Pressable, Button } from "native-base";
import { useQuery } from "@apollo/client/react";
import { GET_ME, GET_TRAINERS_FOR_CLIENT } from "@/graphql/queries";
import { useSocket } from "@/providers/SocketProvider";
import { getTokens } from "@/lib/apollo";
import { ENV } from "@/lib/env";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

/* ================================
   Helpers
================================ */
export function getPeerInfo(room: any, myId?: string) {
    const peer = (room?.participants || []).find((p: any) => {
        const pid = p?.userId ?? p?.user?._id ?? p?.user?.id ?? "";
        return pid && pid !== (myId ?? "");
    });
    const id = peer?.userId ?? peer?.user?._id ?? peer?.user?.id ?? "";
    const name = peer?.user?.name ?? "";
    const email = peer?.user?.email ?? "";
    const avatarUrl = peer?.user?.avatarUrl ?? "";
    const display = name || email || id || "Trainer";
    const initial = display.trim().charAt(0).toUpperCase();
    return { id, name, email, avatarUrl, display, initial };
}

type TabKey = "current" | "new";

/* ================================
   Header (IG-style)
================================ */
function Header({ onPressNew }: { onPressNew: () => void }) {
    return (
        <HStack px={16} py={12} alignItems="center" justifyContent="space-between" bg="white" borderBottomWidth={1} borderBottomColor="#f2f2f2">
            <Text style={styles.headerTitle}>Messages</Text>
            <HStack alignItems="center" space={4}>
                {/* right icon — create new message */}
                <Pressable accessibilityRole="button" onPress={onPressNew} hitSlop={12}>
                    <Text style={styles.headerIcon}>✉️</Text>
                </Pressable>
            </HStack>
        </HStack>
    );
}

/* ================================
   Tab bar (underline indicator)
================================ */
function TabBar({ value, onChange }: { value: TabKey; onChange: (t: TabKey) => void }) {
    return (
        <HStack bg="white" px={16} pt={8} pb={4} alignItems="center" borderBottomWidth={1} borderBottomColor="#f2f2f2">
            {(["current", "new"] as TabKey[]).map((t) => {
                const active = value === t;
                return (
                    <Pressable key={t} onPress={() => onChange(t)} style={styles.tabItem} accessibilityRole="tab">
                        <Text style={[styles.tabText, active && styles.tabTextActive]}>
                            {t === "current" ? "Chats" : "Explore"}
                        </Text>
                        {active && <View style={styles.tabUnderline} />}
                    </Pressable>
                );
            })}
        </HStack>
    );
}

/* ================================
   Search (rounded pill)
================================ */
function PillSearch({
                        value,
                        onChangeText,
                        placeholder,
                        onClear,
                    }: {
    value: string;
    onChangeText: (s: string) => void;
    placeholder?: string;
    onClear?: () => void;
}) {
    return (
        <Box bg="white" px={16} pt={6} pb={6} borderBottomWidth={0}>
            <View style={styles.searchWrap}>
                <Text style={styles.searchIcon}>🔎</Text>
                <TextInput
                    placeholder={placeholder ?? "Search"}
                    placeholderTextColor="#9aa3ad"
                    value={value}
                    onChangeText={onChangeText}
                    style={styles.searchInput}
                    returnKeyType="search"
                />
                {!!value && (
                    <Pressable onPress={onClear}>
                        <Text style={styles.clearIcon}>×</Text>
                    </Pressable>
                )}
            </View>
        </Box>
    );
}

/* ================================
   Chat Row (IG DM vibe)
================================ */
function ChatRow({
                     item,
                     userId,
                     presence,
                     onPress,
                 }: {
    item: any;
    userId?: string;
    presence: Record<string, any> | undefined;
    onPress: () => void;
}) {
    const peer = getPeerInfo(item, userId);
    const isOnline = !!presence?.[peer.id];
    const unread = item.unread?.[String(userId)] || 0;

    const time = item.lastMessageAt
        ? new Date(item.lastMessageAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
        : "";

    return (
        <TouchableOpacity onPress={onPress} style={styles.dmRow} activeOpacity={0.7}>
            <View style={{ position: "relative" }}>
                <Avatar size="md" source={peer.avatarUrl ? { uri: peer.avatarUrl } : undefined}>
                    {peer.initial}
                </Avatar>
                <View style={[styles.dot, { backgroundColor: isOnline ? "#31c553" : "#cbd5e1" }]} />
            </View>

            <VStack ml={12} flex={1} space={0.5}>
                <HStack alignItems="center" justifyContent="space-between">
                    <Text style={styles.dmName} numberOfLines={1}>{peer.display}</Text>
                    {!!time && <Text style={styles.dmTime}>{time}</Text>}
                </HStack>
                <HStack alignItems="center" space={2}>
                    {unread > 0 && <View style={styles.unreadDot} />}
                    <Text style={[styles.dmPreview, unread > 0 && styles.dmPreviewUnread]} numberOfLines={1}>
                        {item.lastMessageText || "Start the conversation"}
                    </Text>
                </HStack>
            </VStack>
        </TouchableOpacity>
    );
}

/* ================================
   Explore Grid (trainers)
================================ */
const COLS = 3;
const GUTTER = 12;
const SCREEN_W = Dimensions.get("window").width;
const CARD_W = Math.floor((SCREEN_W - 16 * 2 - GUTTER * (COLS - 1)) / COLS);

function TrainerCard({
                         item,
                         onPress,
                     }: {
    item: { _id: string; name: string; avatarUrl?: string };
    onPress: () => void;
}) {
    return (
        <Pressable onPress={onPress} style={[styles.trainerCard, { width: CARD_W }]}>
            <Avatar size="lg" source={item.avatarUrl ? { uri: item.avatarUrl } : undefined}>
                {item.name?.[0] || "T"}
            </Avatar>
            <Text numberOfLines={1} style={styles.trainerName}>{item.name || "Trainer"}</Text>
        </Pressable>
    );
}

/* ================================
   Main
================================ */
export default function ChatList() {
    // tokens
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

    // me & trainers
    const { data: meData, loading: meLoading, error: meError } = useQuery(GET_ME, { fetchPolicy: "no-cache" });
    // @ts-ignore
    const me = meData?.getMe ?? meData?.me ?? meData?.user;
    const userId: string | undefined = me?._id || me?.id || me?.userId;

    const { data: trainersData, loading: trainersLoading, error: trainersError, refetch: refetchTrainers } = useQuery(
        GET_TRAINERS_FOR_CLIENT,
        { variables: { pagination: { pageNumber: 1, pageSize: 50 } }, fetchPolicy: "no-cache", skip: !userId }
    );
    // @ts-ignore
    const trainers = (trainersData?.getTrainersForClient || []) as Array<{ _id: string; name: string; avatarUrl?: string }>;

    const [tab, setTab] = useState<TabKey>("current");
    const [trainerSearch, setTrainerSearch] = useState("");

    const filteredTrainers = useMemo(
        () => (trainers || []).filter(t => (t?.name || "").toLowerCase().includes(trainerSearch.toLowerCase())),
        [trainers, trainerSearch]
    );

    // socket & rooms
    const { socket, emit, presence } = useSocket() as any;
    const [rooms, setRooms] = useState<any[]>([]);
    const [roomsLoading, setRoomsLoading] = useState(false);
    const [roomsError, setRoomsError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchRooms = useCallback(async () => {
        if (!token) return [];
        const res = await fetch(`${ENV.API_URL}/api/chat/chats`, {
            headers: { Authorization: `Bearer ${token}`, role: "client" },
        });
        if (!res.ok) throw new Error(`Rooms fetch failed: ${res.status}`);
        return (await res.json()) || [];
    }, [token]);

    const refreshRooms = useCallback(async () => {
        if (!token) return;
        try {
            setRoomsLoading(true);
            setRoomsError(null);
            const arr = await fetchRooms();
            setRooms(arr);
        } catch (e: any) {
            setRoomsError(e?.message || "Failed to load chats");
        } finally {
            setRoomsLoading(false);
        }
    }, [token, fetchRooms]);

    const onPullRefresh = useCallback(async () => {
        setRefreshing(true);
        try { const arr = await fetchRooms(); setRooms(arr); }
        finally { setRefreshing(false); }
    }, [fetchRooms]);

    // initial load + socket reconnection refresh
    useFocusEffect(useCallback(() => { refreshRooms(); }, [refreshRooms]));
    useEffect(() => {
        if (!socket) return;
        const onConnect = () => refreshRooms();
        socket.on("connect", onConnect);
        return () => { socket.off("connect", onConnect); };
    }, [socket, refreshRooms]);

    // live updates
    useEffect(() => {
        if (!socket || !userId) return;
        const onMsg = (msg: any) => {
            setRooms(prev => {
                const next = [...prev];
                const i = next.findIndex(r => r._id === msg.roomId);
                if (i === -1) return prev;
                const r = next[i];
                const inc = msg.from === userId ? 0 : 1;
                next[i] = {
                    ...r,
                    lastMessageText: msg.type === "text" ? (msg.text || "") : "[image]",
                    lastMessageAt: msg.createdAt || new Date().toISOString(),
                    unread: { ...(r.unread || {}), [userId]: (r.unread?.[userId] || 0) + inc },
                };
                next.sort((a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt));
                return next;
            });
        };
        const onRead = (evt: any) => {
            if (evt?.userId !== userId) return;
            setRooms(prev => prev.map(r => r._id === evt.roomId
                ? { ...r, unread: { ...(r.unread || {}), [userId]: 0 } }
                : r
            ));
        };
        socket.on("message", onMsg);
        socket.on("readReceipt", onRead);
        return () => {
            socket.off("message", onMsg);
            socket.off("readReceipt", onRead);
        };
    }, [socket, userId]);

    // navigation helpers (unchanged)
    const startDm = (trainerId: string) => {
        emit("startDm", trainerId, "trainer", (resp: any) => {
            if (resp?.ok) router.push({ pathname: "/(messages)/[trainerId]", params: { trainerId, roomId: resp.roomId } });
            else alert(resp?.error || "Failed to start chat");
        });
    };
    const openRoom = (room: any) => {
        const peer = getPeerInfo(room, userId);
        router.push({
            pathname: "/(messages)/[trainerId]",
            params: { trainerId: peer.id, roomId: room._id, name: peer.display, avatar: peer.avatarUrl },
        });
    };
    const ensureDmAndOpen = useCallback(async (trainer: { _id: string; name: string; avatarUrl?: string }) => {
        const existing = rooms.find(r =>
            (r.participants || []).some((p: any) => (p.userId ?? p.user?._id ?? p.user?.id) === trainer._id)
        );
        if (existing) return openRoom(existing);
        emit("startDm", trainer._id, "trainer", async (resp: any) => {
            if (!resp?.ok) return alert(resp?.error || "Failed to start chat");
            await refreshRooms();
            const created = rooms.find(rm => rm._id === resp.roomId);
            if (created) openRoom(created);
            else router.push({ pathname: "/(messages)/[trainerId]", params: { trainerId: trainer._id, roomId: resp.roomId, name: trainer.name, avatar: trainer.avatarUrl ?? "" } });
        });
    }, [emit, rooms, refreshRooms]);

    // default to Explore when no chats
    useEffect(() => {
        const count = rooms?.length ?? 0;
        setTab(count > 0 ? "current" : "new");
    }, [rooms]);

    // loading / error
    if (tokenLoading || meLoading || (tab === "new" ? trainersLoading : roomsLoading)) {
        return (
            <SafeAreaView style={{ flex: 1 }}>
                <Center flex={1}>
                    <Spinner size="lg" />
                    <Text mt={3} color="coolGray.600">Loading…</Text>
                </Center>
            </SafeAreaView>
        );
    }
    if (meError || trainersError || roomsError) {
        const msg = meError?.message || trainersError?.message || roomsError;
        return (
            <SafeAreaView style={{ flex: 1 }}>
                <Center flex={1} px={6}>
                    <Text color="red.600" textAlign="center">Failed to load.</Text>
                    <Text mt={2} color="coolGray.600" fontSize="xs">{String(msg || "")}</Text>
                </Center>
            </SafeAreaView>
        );
    }

    /* ================================
       Render
    ================================== */
    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
            <Header onPressNew={() => setTab("new")} />
            <TabBar value={tab} onChange={setTab} />

            {tab === "current" ? (
                <FlatList
                    data={rooms}
                    keyExtractor={(r) => r._id}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onPullRefresh} />}
                    ListEmptyComponent={
                        <Center flex={1} py={24}>
                            <Text color="coolGray.700" mb={2} fontWeight="700">No messages yet</Text>
                            <Button variant="subtle" onPress={() => setTab("new")}>Find trainers</Button>
                        </Center>
                    }
                    renderItem={({ item }) => (
                        <ChatRow item={item} userId={userId} presence={presence} onPress={() => openRoom(item)} />
                    )}
                    contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
                    style={{ flex: 1, backgroundColor: "#fff" }}
                />
            ) : (
                <>
                    <PillSearch
                        value={trainerSearch}
                        onChangeText={setTrainerSearch}
                        placeholder="Search trainers"
                        onClear={() => setTrainerSearch("")}
                    />
                    {/* Grid */}
                    <FlatList
                        data={filteredTrainers}
                        keyExtractor={(t) => t._id}
                        numColumns={COLS}
                        columnWrapperStyle={{ justifyContent: "space-between", paddingHorizontal: 16, marginBottom: GUTTER }}
                        ListHeaderComponent={
                            <Box px={16} py={8} bg="white">
                            <Text style={styles.sectionTitle}>Suggested</Text>
                            </Box>
                        }
                        ListEmptyComponent={
                            <Center flex={1} py={24}>
                                <Text color="coolGray.700">No trainers found</Text>
                            </Center>
                        }
                        renderItem={({ item }) => (
                            <TrainerCard item={item} onPress={() => ensureDmAndOpen(item)} />
                        )}
                        contentContainerStyle={{ paddingBottom: 80 }}
                        style={{ flex: 1, backgroundColor: "#fff" }}
                    />
                </>
            )}

            {/* FAB like IG compose */}
            {tab === "current" && (
                <Pressable
                    onPress={() => setTab("new")}
                    style={styles.fab}
                    accessibilityRole="button"
                >
                    <Text style={styles.fabIcon}>✚</Text>
                </Pressable>
            )}
        </SafeAreaView>
    );
}

/* ================================
   Styles
================================ */
const styles = StyleSheet.create({
    headerTitle: {
        fontSize: 22,
        fontWeight: "800",
        color: "#111827",
        letterSpacing: 0.2,
    },
    headerIcon: { fontSize: 18 },

    tabItem: {
        flex: 1,
        alignItems: "center",
        paddingVertical: 10,
        position: "relative",
    },
    tabText: { fontSize: 14, color: "#94a3b8", fontWeight: "700" },
    tabTextActive: { color: "#111827" },
    tabUnderline: {
        position: "absolute",
        bottom: -4,
        height: 3,
        width: 28,
        borderRadius: 2,
        backgroundColor: "#111827",
    },

    searchWrap: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#f3f4f6",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    searchIcon: { fontSize: 12, marginRight: 6, color: "#6b7280" },
    clearIcon: { fontSize: 16, marginLeft: 6, color: "#6b7280" },
    searchInput: { flex: 1, fontSize: 15, color: "#111827" },

    dmRow: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 12,
        paddingHorizontal: 8,
    },
    dmName: { fontSize: 16, fontWeight: "800", color: "#111827", maxWidth: "70%" },
    dmTime: { fontSize: 11, color: "#9ca3af" },
    dmPreview: { fontSize: 13, color: "#6b7280" },
    dmPreviewUnread: { color: "#111827", fontWeight: "700" },
    dot: {
        position: "absolute",
        bottom: -1,
        right: -1,
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 2,
        borderColor: "#fff",
    },
    unreadDot: {
        width: 7,
        height: 7,
        borderRadius: 3.5,
        backgroundColor: "#2563eb",
    },

    sectionTitle: { fontSize: 13, fontWeight: "800", color: "#6b7280", textTransform: "uppercase", letterSpacing: 0.6 },

    trainerCard: {
        alignItems: "center",
        gap: 6,
    },
    trainerName: { fontSize: 12, color: "#111827", fontWeight: "700", maxWidth: CARD_W },

    fab: {
        position: "absolute",
        right: 16,
        bottom: 24,
        width: 52,
        height: 52,
        borderRadius: 26,
        backgroundColor: "#111827",
        alignItems: "center",
        justifyContent: "center",
        shadowColor: "#000",
        shadowOpacity: 0.2,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 4,
    },
    fabIcon: { fontSize: 24, color: "#fff", marginTop: -1 },
});
