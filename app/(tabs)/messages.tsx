import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, TouchableOpacity, StyleSheet, SafeAreaView, View } from "react-native";
import { Box, Text, HStack, VStack, Avatar, Spinner, Center } from "native-base";
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

    const { data: trainersData, loading: trainersLoading, error: trainersError } = useQuery(
        GET_TRAINERS_FOR_CLIENT,
        { variables: { pagination: { pageNumber: 1, pageSize: 50 } }, fetchPolicy: "cache-and-network", skip: !userId }
    );
    // @ts-ignore
    const trainers = (trainersData?.getTrainersForClient || []) as Array<{ _id: string; name: string; avatarUrl?: string }>;

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
        <SafeAreaView style={{ flex: 1 }}>
            {emptyState ? (
                <FlatList
                    data={trainers}
                    keyExtractor={(t) => t._id}
                    renderItem={({ item }) => (
                        <TouchableOpacity onPress={() => ensureDmAndOpen(item)} style={styles.row}>
                      <Avatar source={item.avatarUrl ? { uri: item.avatarUrl } : undefined}>
                        {item.name?.[0] || "T"}
                      </Avatar>
                      <VStack ml={12}>
                        <Text fontWeight="bold">{item.name || "Trainer"}</Text>
                        <Text fontSize="xs" color="coolGray.600">Tap to start chat</Text>
                      </VStack>
                    </TouchableOpacity>
                    )}
                    ListHeaderComponent={<Box p={12}><Text fontSize="md" fontWeight="bold">Start a chat with your trainer</Text></Box>}
                />
            ) : (
                <FlatList
                    data={rooms}
                    keyExtractor={(r) => r._id}
                    renderItem={({ item }) => {
                        const peer = getPeerInfo(item, userId);
                        const isOnline = !!presence?.[peer.id];
                        const unread = item.unread?.[String(userId)] || 0;
                        return (
                            <TouchableOpacity onPress={() => openRoom(item)} style={styles.row}>
                                <Avatar source={peer.avatarUrl ? { uri: peer.avatarUrl } : undefined}>{peer.initial}</Avatar>
                                <VStack ml={12} flex={1}>
                                    <HStack alignItems="center" justifyContent="space-between">
                                        <Text fontWeight="bold">{peer.display}</Text>
                                        <Box w={2} h={2} rounded="full" bg={isOnline ? "green.500" : "coolGray.400"} />
                                    </HStack>
                                    <Text color="coolGray.600" numberOfLines={1}>{item.lastMessageText || "…"}</Text>
                                </VStack>
                                {unread > 0 && (
                                    <View style={styles.badge}><Text color="white" fontSize="xs">{unread}</Text></View>
                                )}
                            </TouchableOpacity>
                        );
                    }}
                    ListHeaderComponent={<Box p={12}><Text fontSize="md" fontWeight="bold">Recent chats</Text></Box>}
                />
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
    badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: "#ef4444", alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
});
