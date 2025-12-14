import { GET_ME, GET_TRAINERS_FOR_CLIENT } from "@/graphql/queries";
import { getTokens } from "@/lib/apollo";
import { useRuntimeConfig } from "@/lib/remoteConfig";
import { useSocket } from "@/providers/SocketProvider";
import { useQuery } from "@apollo/client/react";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { Avatar, Center, Pressable, Spinner, Text } from "native-base";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dimensions,
  FlatList,
  RefreshControl,
  SafeAreaView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

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

const DARK_BG = "#05030D";
const PANEL_BG = "rgba(255,255,255,0.04)";
const CARD_BG = "rgba(12,10,30,0.95)";
const BORDER_COLOR = "rgba(255,255,255,0.08)";
const ACCENT = "#A855F7";
const ACCENT_ALT = "#7C3AED";
const TEXT_PRIMARY = "#F7F4FF";
const TEXT_MUTED = "rgba(247,244,255,0.72)";
const TEXT_SOFT = "rgba(247,244,255,0.55)";

/* ================================
   Header (hero)
================================ */
function Header({ onPressNew }: { onPressNew: () => void }) {
  return (
    <View style={styles.heroContainer}>
      <View style={styles.heroBadge}>
        <Ionicons name="radio-outline" size={14} color={ACCENT} />
        <Text style={styles.heroBadgeText}>Live message relay</Text>
      </View>
      <Text style={styles.heroTitle}>Keep every signal flowing</Text>
      <Text style={styles.heroSubtitle}>
        Orchestrate trainer check-ins, clips, and accountability threads from a
        single midnight console.
      </Text>
      {/* <View style={styles.heroActions}>
                <Pressable accessibilityRole="button" onPress={onPressNew} style={styles.heroPrimaryAction} _pressed={{ opacity: 0.9 }}>
                    <Ionicons name="create-outline" size={18} color="#05030D" />
                    <Text style={styles.heroPrimaryText}>Compose message</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={onPressNew} style={styles.heroGhostAction} _pressed={{ opacity: 0.9 }}>
                    <Ionicons name="people-outline" size={16} color={TEXT_PRIMARY} />
                    <Text style={styles.heroGhostText}>Find trainers</Text>
                </Pressable>
            </View> */}
    </View>
  );
}

/* ================================
   Tab bar (underline indicator)
================================ */
function TabBar({
  value,
  onChange,
}: {
  value: TabKey;
  onChange: (t: TabKey) => void;
}) {
  return (
    <View style={styles.tabWrapper}>
      <View style={styles.tabPillContainer}>
        {(["current", "new"] as TabKey[]).map((t) => {
          const active = value === t;
          return (
            <Pressable
              key={t}
              onPress={() => onChange(t)}
              accessibilityRole="tab"
              style={[styles.tabButton, active && styles.tabButtonActive]}
            >
              <Ionicons
                name={
                  t === "current" ? "chatbubbles-outline" : "sparkles-outline"
                }
                size={16}
                color={active ? TEXT_PRIMARY : TEXT_SOFT}
                style={{ marginRight: 6 }}
              />
              <Text
                style={[
                  styles.tabButtonText,
                  active && styles.tabButtonTextActive,
                ]}
              >
                {t === "current" ? "Chats" : "Discover"}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
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
    <View style={styles.searchOuter}>
      <View style={styles.searchInner}>
        <Ionicons
          name="search"
          size={16}
          color={TEXT_MUTED}
          style={{ marginRight: 8 }}
        />
        <TextInput
          placeholder={placeholder ?? "Search"}
          placeholderTextColor={TEXT_SOFT}
          value={value}
          onChangeText={onChangeText}
          style={styles.searchInput}
          returnKeyType="search"
        />
        {!!value && (
          <Pressable
            onPress={onClear}
            accessibilityRole="button"
            style={styles.clearPressable}
            _pressed={{ opacity: 0.8 }}
          >
            <Ionicons name="close" size={16} color={TEXT_MUTED} />
          </Pressable>
        )}
      </View>
    </View>
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
    ? new Date(item.lastMessageAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.chatCard}
      activeOpacity={0.85}
    >
      <View style={styles.avatarShell}>
        <Avatar
          size="md"
          source={peer.avatarUrl ? { uri: peer.avatarUrl } : undefined}
        >
          {peer.initial}
        </Avatar>
        <View
          style={[
            styles.presenceDot,
            isOnline ? styles.presenceDotActive : styles.presenceDotIdle,
          ]}
        />
      </View>

      <View style={styles.chatContent}>
        <View style={styles.chatHeaderRow}>
          <Text style={styles.chatName} numberOfLines={1}>
            {peer.display}
          </Text>
          {!!time && <Text style={styles.chatTime}>{time}</Text>}
        </View>

        <View style={styles.chatPreviewRow}>
          <Text
            style={[styles.chatPreview, unread > 0 && styles.chatPreviewUnread]}
            numberOfLines={1}
          >
            {item.lastMessageText || "Start the conversation"}
          </Text>
          {unread > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unread > 9 ? "9+" : unread}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.chatMetaRow}>
          <Text style={[styles.chatMetaText, isOnline && { color: "#5BF5A5" }]}>
            {isOnline ? "Live" : "Offline"}
          </Text>
          <View style={styles.metaSeparator} />
          <Text style={styles.chatMetaText}>
            {item.lastMessageText ? "Last ping" : "Awaiting first message"}
          </Text>
        </View>
      </View>
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
    <Pressable
      onPress={onPress}
      style={{ width: CARD_W }}
      _pressed={{ opacity: 0.85 }}
    >
      <View style={styles.trainerCard}>
        <View style={styles.trainerAvatarShell}>
          <Avatar
            size="md"
            source={item.avatarUrl ? { uri: item.avatarUrl } : undefined}
          >
            {item.name?.[0] || "T"}
          </Avatar>
        </View>
        <Text numberOfLines={1} style={styles.trainerName}>
          {item.name || "Trainer"}
        </Text>
        <Text style={styles.trainerSubtitle}>Tap to connect</Text>
      </View>
    </Pressable>
  );
}

/* ================================
   Main
================================ */
export default function ChatList() {
  const runtimeConfig = useRuntimeConfig();
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
    return () => {
      mounted = false;
    };
  }, []);

  // me & trainers
  const {
    data: meData,
    loading: meLoading,
    error: meError,
  } = useQuery(GET_ME, { fetchPolicy: "no-cache" });
  // @ts-ignore
  const me = meData?.getMe ?? meData?.me ?? meData?.user;
  const userId: string | undefined = me?._id || me?.id || me?.userId;

  const {
    data: trainersData,
    loading: trainersLoading,
    error: trainersError,
    refetch: refetchTrainers,
  } = useQuery(GET_TRAINERS_FOR_CLIENT, {
    variables: { pagination: { pageNumber: 1, pageSize: 50 } },
    fetchPolicy: "no-cache",
    skip: !userId,
  });
  // @ts-ignore
  const trainers = (trainersData?.getTrainersForClient || []) as Array<{
    _id: string;
    name: string;
    avatarUrl?: string;
  }>;

  const [tab, setTab] = useState<TabKey>("current");
  const [trainerSearch, setTrainerSearch] = useState("");
  const [chatSearch, setChatSearch] = useState("");

  const filteredTrainers = useMemo(
    () =>
      (trainers || []).filter((t) =>
        (t?.name || "").toLowerCase().includes(trainerSearch.toLowerCase())
      ),
    [trainers, trainerSearch]
  );

  // socket & rooms
  const { socket, emit, presence } = useSocket() as any;
  const [rooms, setRooms] = useState<any[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const filteredRooms = useMemo(() => {
    if (!chatSearch.trim()) return rooms;
    const term = chatSearch.trim().toLowerCase();
    return rooms.filter((room) => {
      const peer = getPeerInfo(room, userId);
      const haystack = `${peer.display} ${
        room.lastMessageText || ""
      }`.toLowerCase();
      return haystack.includes(term);
    });
  }, [rooms, chatSearch, userId]);

  const fetchRooms = useCallback(async () => {
    if (!token) return [];
    const res = await fetch(`${runtimeConfig.apiUrl}/api/chat/chats`, {
      headers: { Authorization: `Bearer ${token}`, role: "client" },
    });
    if (!res.ok) throw new Error(`Rooms fetch failed: ${res.status}`);
    return (await res.json()) || [];
  }, [token, runtimeConfig.apiUrl]);

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
    try {
      const arr = await fetchRooms();
      setRooms(arr);
    } finally {
      setRefreshing(false);
    }
  }, [fetchRooms]);

  // initial load + socket reconnection refresh
  useFocusEffect(
    useCallback(() => {
      refreshRooms();
    }, [refreshRooms])
  );
  useEffect(() => {
    if (!socket) return;
    const onConnect = () => refreshRooms();
    socket.on("connect", onConnect);
    return () => {
      socket.off("connect", onConnect);
    };
  }, [socket, refreshRooms]);

  // live updates
  useEffect(() => {
    if (!socket || !userId) return;
    const onMsg = (msg: any) => {
      setRooms((prev) => {
        const next = [...prev];
        const i = next.findIndex((r) => r._id === msg.roomId);
        if (i === -1) return prev;
        const r = next[i];
        const inc = msg.from === userId ? 0 : 1;
        next[i] = {
          ...r,
          lastMessageText: msg.type === "text" ? msg.text || "" : "[image]",
          lastMessageAt: msg.createdAt || new Date().toISOString(),
          unread: {
            ...(r.unread || {}),
            [userId]: (r.unread?.[userId] || 0) + inc,
          },
        };
        next.sort(
          (a, b) => +new Date(b.lastMessageAt) - +new Date(a.lastMessageAt)
        );
        return next;
      });
    };
    const onRead = (evt: any) => {
      if (evt?.userId !== userId) return;
      setRooms((prev) =>
        prev.map((r) =>
          r._id === evt.roomId
            ? { ...r, unread: { ...(r.unread || {}), [userId]: 0 } }
            : r
        )
      );
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
      if (resp?.ok)
        router.push({
          pathname: "/(messages)/[trainerId]",
          params: { trainerId, roomId: resp.roomId },
        });
      else alert(resp?.error || "Failed to start chat");
    });
  };
  const openRoom = (room: any) => {
    const peer = getPeerInfo(room, userId);
    router.push({
      pathname: "/(messages)/[trainerId]",
      params: {
        trainerId: peer.id,
        roomId: room._id,
        name: peer.display,
        avatar: peer.avatarUrl,
      },
    });
  };
  const ensureDmAndOpen = useCallback(
    async (trainer: { _id: string; name: string; avatarUrl?: string }) => {
      const existing = rooms.find((r) =>
        (r.participants || []).some(
          (p: any) => (p.userId ?? p.user?._id ?? p.user?.id) === trainer._id
        )
      );
      if (existing) return openRoom(existing);
      emit("startDm", trainer._id, "trainer", async (resp: any) => {
        if (!resp?.ok) return alert(resp?.error || "Failed to start chat");
        await refreshRooms();
        const created = rooms.find((rm) => rm._id === resp.roomId);
        if (created) openRoom(created);
        else
          router.push({
            pathname: "/(messages)/[trainerId]",
            params: {
              trainerId: trainer._id,
              roomId: resp.roomId,
              name: trainer.name,
              avatar: trainer.avatarUrl ?? "",
            },
          });
      });
    },
    [emit, rooms, refreshRooms]
  );

  // default to Explore when no chats
  useEffect(() => {
    const count = rooms?.length ?? 0;
    setTab(count > 0 ? "current" : "new");
  }, [rooms]);

  // loading / error
  if (
    tokenLoading ||
    meLoading ||
    (tab === "new" ? trainersLoading : roomsLoading)
  ) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: DARK_BG }}>
        <Center flex={1}>
          <Spinner size="lg" color={ACCENT} />
          <Text mt={3} color={TEXT_MUTED}>
            Loading…
          </Text>
        </Center>
      </SafeAreaView>
    );
  }
  if (meError || trainersError || roomsError) {
    const msg = meError?.message || trainersError?.message || roomsError;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: DARK_BG }}>
        <Center flex={1} px={6}>
          <Text color="red.400" textAlign="center" fontWeight="bold">
            Failed to load
          </Text>
          <Text mt={2} color={TEXT_SOFT} fontSize="xs" textAlign="center">
            {String(msg || "")}
          </Text>
        </Center>
      </SafeAreaView>
    );
  }

  /* ================================
       Render
    ================================== */
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={{ flex: 1 }}>
        <Header onPressNew={() => setTab("new")} />
        <TabBar value={tab} onChange={setTab} />

        {tab === "current" ? (
          <FlatList
            data={filteredRooms}
            keyExtractor={(r) => r._id}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={onPullRefresh}
                tintColor={TEXT_PRIMARY}
              />
            }
            ListHeaderComponent={
              <View style={styles.listHeaderBlock}>
                <PillSearch
                  value={chatSearch}
                  onChangeText={setChatSearch}
                  placeholder="Search conversations"
                  onClear={() => setChatSearch("")}
                />
              </View>
            }
            ListEmptyComponent={() => (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>
                  {chatSearch.trim()
                    ? "No conversations match that search"
                    : "No messages yet"}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {chatSearch.trim()
                    ? "Try a different name, trainer, or keyword."
                    : "Kick off a fresh thread by inviting a trainer to chat."}
                </Text>
                {!chatSearch.trim() && (
                  <Pressable
                    onPress={() => setTab("new")}
                    style={styles.emptyCta}
                    _pressed={{ opacity: 0.85 }}
                  >
                    <Text style={styles.emptyCtaText}>Find trainers</Text>
                  </Pressable>
                )}
              </View>
            )}
            renderItem={({ item }) => (
              <ChatRow
                item={item}
                userId={userId}
                presence={presence}
                onPress={() => openRoom(item)}
              />
            )}
            contentContainerStyle={styles.chatListContent}
            style={{ flex: 1 }}
            showsVerticalScrollIndicator={false}
          />
        ) : (
          <View style={{ flex: 1 }}>
            <View style={styles.listHeaderBlock}>
              <PillSearch
                value={trainerSearch}
                onChangeText={setTrainerSearch}
                placeholder="Search trainers"
                onClear={() => setTrainerSearch("")}
              />
            </View>
            <FlatList
              data={filteredTrainers}
              keyExtractor={(t) => t._id}
              numColumns={COLS}
              columnWrapperStyle={styles.trainerColumn}
              ListHeaderComponent={
                <View style={styles.sectionHeader}>
                  <Text style={styles.sectionTitle}>Suggested coaches</Text>
                  <Text style={styles.sectionSubtitle}>
                    Invite a trainer into your orbit instantly.
                  </Text>
                </View>
              }
              ListEmptyComponent={() => (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>No trainers found</Text>
                  <Text style={styles.emptySubtitle}>
                    Try refining your search or refresh the list.
                  </Text>
                </View>
              )}
              renderItem={({ item }) => (
                <TrainerCard
                  item={item}
                  onPress={() => ensureDmAndOpen(item)}
                />
              )}
              contentContainerStyle={styles.trainerListContent}
              showsVerticalScrollIndicator={false}
            />
          </View>
        )}

        {tab === "current" && (
          <Pressable
            onPress={() => setTab("new")}
            style={styles.fab}
            accessibilityRole="button"
          >
            <View style={styles.fabButton}>
              <Ionicons name="sparkles" size={20} color="#fff" />
            </View>
          </Pressable>
        )}
      </View>
    </SafeAreaView>
  );
}

/* ================================
   Styles
================================ */
const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  heroContainer: {
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 24,
    borderBottomWidth: 1,
    borderBottomColor: BORDER_COLOR,
    backgroundColor: "#0B0617",
  },
  heroBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: "rgba(5,3,13,0.6)",
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.08)",
  },
  heroBadgeText: {
    marginLeft: 6,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    color: TEXT_SOFT,
    fontWeight: "700",
  },
  heroTitle: {
    color: TEXT_PRIMARY,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 14,
    lineHeight: 34,
  },
  heroSubtitle: {
    color: TEXT_MUTED,
    fontSize: 14,
    marginTop: 10,
    lineHeight: 20,
  },
  heroActions: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    marginTop: 18,
  },
  heroPrimaryAction: {
    backgroundColor: ACCENT,
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 18,
    flexDirection: "row",
    alignItems: "center",
    marginRight: 12,
    marginBottom: 10,
  },
  heroPrimaryText: {
    color: "#05030D",
    fontWeight: "800",
    marginLeft: 8,
  },
  heroGhostAction: {
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  heroGhostText: {
    marginLeft: 6,
    color: TEXT_PRIMARY,
    fontWeight: "700",
  },
  tabWrapper: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
    backgroundColor: DARK_BG,
    borderBottomColor: BORDER_COLOR,
    borderBottomWidth: 1,
  },
  tabPillContainer: {
    flexDirection: "row",
    backgroundColor: PANEL_BG,
    borderRadius: 999,
    padding: 4,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
  },
  tabButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 999,
  },
  tabButtonActive: {
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  tabButtonText: {
    color: TEXT_SOFT,
    fontSize: 13,
    fontWeight: "600",
  },
  tabButtonTextActive: {
    color: TEXT_PRIMARY,
  },
  searchOuter: {
    width: "100%",
    borderRadius: 999,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    backgroundColor: "rgba(3,1,10,0.95)",
  },
  searchInner: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    backgroundColor: "rgba(9,6,20,0.8)",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: TEXT_PRIMARY,
  },
  clearPressable: {
    padding: 6,
    borderRadius: 16,
  },
  chatCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 22,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    marginBottom: 14,
  },
  avatarShell: {
    marginRight: 14,
  },
  presenceDot: {
    position: "absolute",
    bottom: -2,
    right: -2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: DARK_BG,
  },
  presenceDotActive: {
    backgroundColor: "#5BF5A5",
  },
  presenceDotIdle: {
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  chatContent: {
    flex: 1,
  },
  chatHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  chatName: {
    flex: 1,
    color: TEXT_PRIMARY,
    fontSize: 16,
    fontWeight: "800",
    marginRight: 8,
  },
  chatTime: {
    color: TEXT_SOFT,
    fontSize: 12,
  },
  chatPreviewRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  chatPreview: {
    color: TEXT_MUTED,
    fontSize: 13,
    flex: 1,
  },
  chatPreviewUnread: {
    color: TEXT_PRIMARY,
    fontWeight: "700",
  },
  unreadBadge: {
    marginLeft: 12,
    backgroundColor: ACCENT,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    minWidth: 24,
    alignItems: "center",
  },
  unreadBadgeText: {
    color: "white",
    fontSize: 11,
    fontWeight: "700",
  },
  chatMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  chatMetaText: {
    color: TEXT_SOFT,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  metaSeparator: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.25)",
    marginHorizontal: 10,
  },
  listHeaderBlock: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  chatListContent: {
    paddingHorizontal: 20,
    paddingBottom: 160,
    paddingTop: 4,
    backgroundColor: DARK_BG,
  },
  emptyState: {
    paddingHorizontal: 32,
    paddingVertical: 60,
    alignItems: "center",
  },
  emptyTitle: {
    color: TEXT_PRIMARY,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  emptySubtitle: {
    color: TEXT_SOFT,
    fontSize: 13,
    marginTop: 8,
    textAlign: "center",
  },
  emptyCta: {
    marginTop: 18,
    paddingHorizontal: 28,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: ACCENT,
  },
  emptyCtaText: {
    color: "white",
    fontWeight: "700",
  },
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 8,
  },
  sectionTitle: {
    color: TEXT_PRIMARY,
    fontSize: 17,
    fontWeight: "700",
  },
  sectionSubtitle: {
    color: TEXT_SOFT,
    fontSize: 12,
    marginTop: 4,
  },
  trainerCard: {
    width: "100%",
    borderRadius: 20,
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: "center",
    borderWidth: 1,
    borderColor: BORDER_COLOR,
    backgroundColor: "rgba(7,5,18,0.94)",
  },
  trainerAvatarShell: {
    marginBottom: 8,
  },
  trainerName: {
    color: TEXT_PRIMARY,
    fontWeight: "700",
    fontSize: 13,
  },
  trainerSubtitle: {
    color: TEXT_SOFT,
    fontSize: 11,
    marginTop: 4,
  },
  trainerColumn: {
    justifyContent: "space-between",
    paddingHorizontal: 20,
    marginBottom: 18,
  },
  trainerListContent: {
    paddingBottom: 160,
    paddingTop: 4,
    backgroundColor: DARK_BG,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 32,
  },
  fabButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: ACCENT,
    shadowColor: ACCENT,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },
});
