import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, TouchableOpacity, StyleSheet, SafeAreaView, View, TextInput, Animated } from "react-native";
import { Box, Text, HStack, VStack, Avatar, Spinner, Center, Pressable } from "native-base";
import { useQuery } from "@apollo/client/react";
import { GET_ME, GET_TRAINERS_FOR_CLIENT } from "@/graphql/queries";
import { useSocket } from "@/providers/SocketProvider";
import { getTokens } from "@/lib/apollo";
import { ENV } from "@/lib/env";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";

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

export default function ChatList() {
    // ---- tokens ----
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

    // ---- me & trainers ----
    const { data: meData, loading: meLoading, error: meError } = useQuery(GET_ME, { fetchPolicy: "cache-first" });
    // @ts-ignore
    const me = meData?.getMe ?? meData?.me ?? meData?.user;
    const userId: string | undefined = me?._id || me?.id || me?.userId;

    const { data: trainersData, loading: trainersLoading, error: trainersError, refetch: refetchTrainers } = useQuery(
        GET_TRAINERS_FOR_CLIENT,
        { variables: { pagination: { pageNumber: 1, pageSize: 50 } }, fetchPolicy: "cache-and-network", skip: !userId }
    );
    // @ts-ignore
    const trainers = (trainersData?.getTrainersForClient || []) as Array<{ _id: string; name: string; avatarUrl?: string }>;

    type TabKey = "current" | "new";
    const [tab, setTab] = useState<TabKey>("current");
    const [trainerSearch, setTrainerSearch] = useState("");
    const filteredTrainers = (trainers || []).filter(t =>
        (t?.name || "").toLowerCase().includes(trainerSearch.toLowerCase())
    );

    function SegmentedTabs({
                               value,
                               onChange,
                           }: {
        value: TabKey;
        onChange: (k: TabKey) => void;
    }) {
        return (
            <HStack px={12} pt={12} pb={10} bg="white" borderBottomWidth={1} borderBottomColor="#eee">
                <Box
                    style={styles.tabsContainer}
                    accessibilityRole="tablist"
                >
                    <Pressable accessibilityRole="tab" onPress={() => onChange("current")} style={[styles.tabBtn, value === "current" && styles.tabBtnActive]}>
                        <Text style={[styles.tabText, value === "current" && styles.tabTextActive]}>Current Chats</Text>
                    </Pressable>
                    <Pressable accessibilityRole="tab" onPress={() => onChange("new")} style={[styles.tabBtn, value === "new" && styles.tabBtnActive]}>
                        <Text style={[styles.tabText, value === "new" && styles.tabTextActive]}>New Chat</Text>
                    </Pressable>
                </Box>
            </HStack>
        );
    }

    // when we first get a userId (skip -> active), ensure trainers load
    useEffect(() => {
        if (userId) refetchTrainers?.();
    }, [userId, refetchTrainers]);

    // if user switches to "New Chat" and trainers list is empty, try refetch
    useEffect(() => {
        if (tab === "new" && userId && (!trainers || trainers.length === 0)) {
            refetchTrainers?.();
        }
    }, [tab, userId, trainers, refetchTrainers]);

    // ---- socket presence & rooms ----
    const { socket, emit, presence } = useSocket() as any;
    const [rooms, setRooms] = useState<any[]>([]);
    const [roomsLoading, setRoomsLoading] = useState(false);
    const [roomsError, setRoomsError] = useState<string | null>(null);


    const refreshRooms = useCallback(async () => {
          if (!token) return;
          try {
                setRoomsLoading(true);
                setRoomsError(null);
                const res = await fetch(`${ENV.API_URL}/api/chat/chats`, {
                      headers: { Authorization: `Bearer ${token}`, role: "client" },
                });
                if (!res.ok) throw new Error(`Rooms fetch failed: ${res.status}`);
                const arr = (await res.json()) || [];
                setRooms(arr);
              } catch (e: any) {
                setRoomsError(e?.message || "Failed to load chats");
              } finally {
                setRoomsLoading(false);
              }
        }, [token]);

        // initial when screen focuses
            useFocusEffect(useCallback(() => {
                  refreshRooms();
                }, [refreshRooms]));

        // also refresh when socket (re)connects
            useEffect(() => {
                  if (!socket) return;
                  const onConnect = () => refreshRooms();
                  socket.on("connect", onConnect);
                  return () => { socket.off("connect", onConnect); };
                }, [socket, refreshRooms]);

    // live updates: bump lastMessageText / unread and clear on readReceipt
        useEffect(() => {
              if (!socket || !userId) return;
              const onMsg = (msg: any) => {
                    setRooms(prev => {
                          const next = [...prev];
                          const i = next.findIndex(r => r._id === msg.roomId);
                          if (i === -1) return prev; // unknown room; wait for refreshRooms
                          const r = next[i];
                          const inc = msg.from === userId ? 0 : 1;
                          next[i] = {
                                ...r,
                                lastMessageText: msg.type === "text" ? (msg.text || "") : "[image]",
                                lastMessageAt: msg.createdAt || new Date().toISOString(),
                                unread: { ...(r.unread || {}), [userId]: (r.unread?.[userId] || 0) + inc },
                          };
                          // move to top
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

    // ✅ FIX 1: match server signature -> (peerUserId, cb)
    const startDm = (trainerId: string) => {
        console.log('startDm tap', trainerId);
        emit('startDm', trainerId, 'trainer', (resp: any) => {
            console.log('startDm ack', resp);
            if (resp?.ok) router.push({ pathname: '/(messages)/[trainerId]', params: { trainerId, roomId: resp.roomId } });
            else alert(resp?.error || 'Failed to start chat');
        });
    };

     const openRoom = (room: any) => {
           const peer = getPeerInfo(room, userId);
           router.push({
                 pathname: "/(messages)/[trainerId]",
                 params: { trainerId: peer.id, roomId: room._id, name: peer.display, avatar: peer.avatarUrl },
           });
         };

     // ensure: if room exists with trainer -> open; else create then refresh
         const ensureDmAndOpen = useCallback(async (trainer: { _id: string; name: string; avatarUrl?: string }) => {
           const existing = rooms.find(r =>
                 (r.participants || []).some((p: any) =>
                       (p.userId ?? p.user?._id ?? p.user?.id) === trainer._id
                     )
               );
           if (existing) {
                 openRoom(existing);
                 return;
               }
           emit('startDm', trainer._id, 'trainer', async (resp: any) => {
                 if (!resp?.ok) {
                       alert(resp?.error || 'Failed to start chat');
                       return;
                     }
                 await refreshRooms();
                 const created = (await (async () => {
                       const r = rooms.find(rm => rm._id === resp.roomId);
                       return r || null;
                     })()) || null;
                 if (created) openRoom(created);
                 else router.push({ pathname: "/(messages)/[trainerId]", params: { trainerId: trainer._id, roomId: resp.roomId, name: trainer.name, avatar: trainer.avatarUrl ?? "" } });
               });
         }, [emit, rooms, refreshRooms]);

    const emptyState = rooms.length === 0;

    // if there are no rooms, show New Chat by default
    useEffect(() => {
        if (rooms && rooms.length === 0) setTab("new");
    }, [rooms]);

    // ---- loading & error screens ----
    if (tokenLoading || meLoading || trainersLoading || roomsLoading) {
        return (
            <SafeAreaView style={{ flex: 1 }}>
                <Center flex={1}>
                    <Spinner size="lg" />
                    <Text mt={3} color="coolGray.600">Loading chats…</Text>
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

    return (

         <SafeAreaView style={{ flex: 1, backgroundColor: "#f6f8fb" }}>
            <SegmentedTabs value={tab} onChange={setTab} />

            {/* content per tab */}
           <View style={{ flex: 1 }}>
               {tab === "current" ? (
                   <FlatList
                       style={{ flex: 1}}
                       data={rooms}
                       keyExtractor={(r) => r._id}
                       ListEmptyComponent={
                           <Center flex={1} py={20}>
                               <Text color="coolGray.600">No recent chats yet.</Text>
                               <Text mt={1} color="coolGray.500" fontSize="xs">Switch to “New Chat” to start one.</Text>
                           </Center>
                       }
                       renderItem={({ item }) => {
                           const peer = getPeerInfo(item, userId);
                           const isOnline = !!presence?.[peer.id];
                           const unread = item.unread?.[String(userId)] || 0;
                           return (
                               <TouchableOpacity onPress={() => openRoom(item)} style={styles.rowCard}>
                                   <Avatar source={peer.avatarUrl ? { uri: peer.avatarUrl } : undefined}>{peer.initial}</Avatar>
                                   <VStack ml={12} flex={1}>
                                       <HStack alignItems="center" justifyContent="space-between">
                                           <Text style={styles.title}>{peer.display}</Text>
                                           <Box w={2} h={2} rounded="full" bg={isOnline ? "green.500" : "coolGray.400"} />
                                       </HStack>
                                       <Text style={styles.subtitle} numberOfLines={1}>{item.lastMessageText || "…"}</Text>
                                   </VStack>
                                   {unread > 0 && (
                                       <View style={styles.badge}><Text style={styles.badgeText}>{unread}</Text></View>
                                   )}
                               </TouchableOpacity>
                           );
                       }}
                       ListHeaderComponent={
                           <Box p={12}>
                               <Text style={styles.section}>Recent chats</Text>
                           </Box>
                       }
                       contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20, flexGrow: 1 }}
                   />
               ) : (
                   <>
                       {/* search bar */}
                       <Box px={12} pt={10} pb={6} bg="white" borderBottomWidth={1} borderBottomColor="#eee">
                           <View style={styles.searchBox}>
                               <TextInput
                                   placeholder="Search trainers…"
                                   placeholderTextColor="#94a3b8"
                                   value={trainerSearch}
                                   onChangeText={setTrainerSearch}
                                   style={styles.searchInput}
                                   returnKeyType="search"
                               />
                           </View>
                       </Box>
                       <FlatList
                           style={{ flex: 1 }}
                           data={filteredTrainers}
                           keyExtractor={(t) => t._id}
                           ListEmptyComponent={
                               <Center flex={1} py={20}>
                                   <Text color="coolGray.600">No trainers found.</Text>
                               </Center>
                           }
                           renderItem={({ item }) => (
                               <TouchableOpacity onPress={() => ensureDmAndOpen(item)} style={styles.rowCard}>
                                   <Avatar source={item.avatarUrl ? { uri: item.avatarUrl } : undefined}>
                                       {item.name?.[0] || "T"}
                                   </Avatar>
                                   <VStack ml={12}>
                                       <Text style={styles.title}>{item.name || "Trainer"}</Text>
                                       <Text style={styles.subtitle}>Tap to start chat</Text>
                                   </VStack>
                               </TouchableOpacity>
                           )}
                           ListHeaderComponent={
                               <Box p={12}>
                                   <Text style={styles.section}>Start a chat with your trainer</Text>
                               </Box>
                           }
                           contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 20, flexGrow: 1 }}
                       />
                   </>
               )}
           </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
// segmented tabs
    tabsContainer: {
        flexDirection: "row",
        backgroundColor: "#f1f5f9",
        padding: 4,
        width: "100%",
        borderRadius: 14,
        gap: 6,
    },
    tabBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "transparent",
    },
    tabBtnActive: {
        backgroundColor: "#2563eb",
        elevation: 1,
    },
    tabText: { fontWeight: "600", color: "#0f172a" },
    tabTextActive: { color: "white" },

// list rows → card look
    rowCard: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 12,
        marginBottom: 10,
        backgroundColor: "white",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#e5e7eb",
        shadowColor: "#000",
        shadowOpacity: 0.05,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
    },
    title: { fontWeight: "700", fontSize: 16, color: "#0f172a" },
    subtitle: { color: "#64748b", marginTop: 2 },
    section: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
    badge: {
        minWidth: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: "#ef4444",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 6,
    },
    badgeText: { color: "white", fontSize: 12, fontWeight: "700" },

// search
    searchBox: {
        backgroundColor: "#f1f5f9",
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#e2e8f0",
    },
    searchInput: {
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 16,
        color: "#0f172a",
    },
});

