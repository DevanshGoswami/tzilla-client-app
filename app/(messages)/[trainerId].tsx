import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Dimensions } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { KeyboardAvoidingView, Platform, FlatList, Alert, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, View, Image } from "react-native";
import { Box, Text, HStack, VStack, Avatar, Badge, Button, Spinner, Center } from "native-base";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, router } from "expo-router";
import { useSocket } from "@/providers/SocketProvider";
import { presignImage, putToS3 } from "@/lib/upload";
import { getTokens } from "@/lib/apollo";
import { useQuery } from "@apollo/client/react";
import { GET_ME } from "@/graphql/queries";
import Screen from "@/components/ui/Screen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {ENV} from "@/lib/env";

type ChatMessage = {
    _id: string;
    roomId: string;
    from: string;
    to?: string;
    type: "text" | "image";
    text?: string;
    media?: { url: string; w?: number; h?: number; mime?: string };
    createdAt: string;
    readBy?: string[];
};

export default function ChatRoom() {
    const { trainerId, roomId, name, avatar } = useLocalSearchParams<{
        trainerId: string; roomId?: string; name?: string; avatar?: string;
    }>();
    const insets = useSafeAreaInsets();
    const HEADER_HEIGHT = 56;                // your custom header HStack height
    const KEYBOARD_OFFSET = insets.top + HEADER_HEIGHT;


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

    // me
    const { data: meData, loading: meLoading, error: meError } = useQuery(GET_ME, { fetchPolicy: "cache-first" });
    // @ts-ignore
    const me = meData?.getMe ?? meData?.me ?? meData?.user;
    const userId: string | undefined = me?._id || me?.id || me?.userId;

    const { socket, emit, presence } = useSocket() as any;
    const isTrainerOnline = !!presence?.[String(trainerId)];

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [joining, setJoining] = useState(true);
    const beforeRef = useRef<string | null>(null);
    const listRef = useRef<FlatList<any>>(null);
    const initialScrolled = useRef(false);
    const nearBottomRef = useRef(true);
    const [typingUsers, setTypingUsers] = useState<Record<string, boolean>>({});

    const [previewCache, setPreviewCache] = useState<Record<string, string>>({});
    const previewRef = useRef(previewCache);
    previewRef.current = previewCache;

    const AWS_BASE = `${ENV.API_URL}/api/aws`; // 🔹 same base as your example page

    async function getPreviewUrlForKey(key: string, accessToken: string): Promise<string> {
        const res = await fetch(`${AWS_BASE}/media/${encodeURIComponent(key)}`, {
            method: "GET",
            headers: { Authorization: `Bearer ${accessToken}`, role: "client" },
        });
        if (!res.ok) throw new Error("Failed to get preview URL");
        const data = await res.json();
        return data.url as string;
    }

    const ensureDisplayUrl = useCallback(
        async (keyOrUrl?: string | null) => {
            if (!keyOrUrl) return "";
            // if it already looks like a full URL, use it
            if (/^https?:\/\//i.test(keyOrUrl)) return keyOrUrl;

            const cached = previewRef.current[keyOrUrl];
            if (cached) return cached;

            if (!token) return ""; // will re-try when token available
            try {
                const signed = await getPreviewUrlForKey(keyOrUrl, token);
                setPreviewCache((m) => ({ ...m, [keyOrUrl]: signed }));
                return signed;
            } catch {
                return "";
            }
        },
        [token]
    );


    const rows = useMemo(() => {
        const sorted = [...messages].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
        const out: Array<{ type: "sep" | "msg"; id: string; label?: string; msg?: ChatMessage }> = [];
        let lastDay: string | null = null;
        for (const m of sorted) {
            const day = new Date(m.createdAt).toDateString();
            if (day !== lastDay) {
                out.push({ type: "sep", id: `sep-${day}`, label: new Date(m.createdAt).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }) });
                lastDay = day;
            }
            out.push({ type: "msg", id: m._id, msg: m });
        }
        return out;
    }, [messages]);

    const scrollToEnd = useCallback((animated: boolean) => {
        listRef.current?.scrollToEnd({ animated });
        }, []);

    useEffect(() => {
        if (!socket || !roomId || !userId) return;

        const doJoin = () => {
            setJoining(true);
            emit("joinRoom", roomId, (resp: any) => {
                setJoining(false);
                if (!resp?.ok) {
                    Alert.alert("Failed to open chat", resp?.error || "Unknown");
                    return;
                }
                setMessages(resp.history || []);
                beforeRef.current = resp.page?.before ?? null;
                setHasMore(!!resp.page?.before);
                requestAnimationFrame(() => {
                    initialScrolled.current = true;
                    nearBottomRef.current = true;
                     scrollToEnd(false);
                });
            });
        };

        if (socket.connected) {
            doJoin();
            // also restore focus state after reconnect
            emit("focusRoom", String(roomId));
        } else {
            socket.once("connect", () => {
                doJoin();
                emit("focusRoom", String(roomId));
            });
        }

        const onMsg = (msg: ChatMessage) => {
            if (msg.roomId !== roomId) return;
            setMessages((prev) => [...prev, msg]);
            setTimeout(() => {
                    if (nearBottomRef.current) scrollToEnd(true);
                }, 20);
        };
        const onTyping = ({ roomId: rid, userId: who, isTyping }: any) => {
            if (rid !== roomId || who === userId) return;
            setTypingUsers((prev) => ({ ...prev, [who]: isTyping }));
            if (isTyping) setTimeout(() => setTypingUsers((p) => ({ ...p, [who]: false })), 2500);
        };
        const onRead = ({ roomId: rid, userId: who, messageIds }: any) => {
            if (rid !== roomId) return;
            setMessages((prev) =>
                prev.map((m) => (messageIds.includes(m._id) ? { ...m, readBy: Array.from(new Set([...(m.readBy || []), who])) } : m))
            );
        };

        socket.on("message", onMsg);
        socket.on("typing", onTyping);
        socket.on("readReceipt", onRead);
        return () => {
            socket.off("message", onMsg);
            socket.off("typing", onTyping);
            socket.off("readReceipt", onRead);
        };
    }, [socket, roomId, emit, userId, scrollToEnd]);

    const onScroll = useCallback((e: any) => {
        const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
        const distanceFromBottom = contentSize.height - (contentOffset.y + layoutMeasurement.height);
        nearBottomRef.current = distanceFromBottom < 120;
        }, []);

    const onContentSizeChange = useCallback(() => {
    if (!initialScrolled.current) return;     // handled in join
    if (nearBottomRef.current) scrollToEnd(true);
    }, [scrollToEnd]);

    const loadEarlier = () => {
        if (!hasMore || !roomId) return;
        emit("loadEarlier", { roomId, before: beforeRef.current || undefined, limit: 30 }, (resp: any) => {
            if (!resp?.ok || !resp.older?.length) {
                setHasMore(false);
                return;
            }
            beforeRef.current = resp.older[0]?.createdAt ?? null;
            setMessages((prev) => [...resp.older, ...prev]);
            nearBottomRef.current = false;
        });
    };

    const sendText = useCallback(() => {
        const text = input.trim();
        if (!text || !roomId) return;
        setSending(true);
        emit("sendMessage", { roomId, type: "text", text }, (ack: any) => {
            setSending(false);
            if (!ack?.success) {
                Alert.alert("Send failed", ack?.error || "Unknown");
                return;
            }
            setInput("");
            setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 20);
        });
    }, [emit, roomId, input]);

    const pickAndSendImage = useCallback(async () => {
        try {
            if (!token) {
                Alert.alert("Not authenticated", "Please sign in again.");
                return;
            }
            const res = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                quality: 0.9,
            });
            if (res.canceled || !res.assets?.length) return;

            const asset = res.assets[0];
            const uri = asset.uri;
            const mime = asset.mimeType || "image/jpeg";

            // ⬇️ NOTE: we use key as media.url (per server contract)
            const { uploadUrl, fileUrl, key } = await presignImage(token, mime);

            const blob = await (await fetch(uri)).blob();
            await putToS3(uploadUrl, blob, mime);

            // Warm preview cache using the key (not fileUrl)
            if (key) {
                ensureDisplayUrl(key).catch(() => {});
            }

            emit(
                "sendMessage",
                {
                    roomId,
                    type: "image",
                    media: {
                        url: key,                 // ⬅️ send the S3 KEY here
                        w: asset.width,
                        h: asset.height,
                        mime,
                    },
                },
                (ack: any) => {
                    if (!ack?.success) Alert.alert("Send failed", ack?.error || "Unknown");
                }
            );
        } catch (e: any) {
            Alert.alert("Image upload failed", e.message);
        }
    }, [emit, roomId, token, ensureDisplayUrl]);

    // tell server when user is "looking at" this room
    useFocusEffect(
        useCallback(() => {
            if (socket && roomId) {
                emit("focusRoom", String(roomId));
            }
            return () => {
                if (socket && roomId) {
                    emit("blurRoom", String(roomId));
                }
            };
        }, [socket, roomId, emit])
    );

    useFocusEffect(
        useCallback(() => {
            const sub = AppState.addEventListener("change", (state) => {
                if (!socket || !roomId) return;
                if (state === "active") {
                    emit("focusRoom", String(roomId));
                } else if (state === "background" || state === "inactive") {
                    emit("blurRoom", String(roomId));
                }
            });
            return () => sub.remove();
        }, [socket, roomId, emit])
    );

    const prevRoomIdRef = useRef<string | undefined>(undefined);
    useEffect(() => {
        if (!socket) return;
        const prev = prevRoomIdRef.current;
        if (prev && prev !== roomId) {
            emit("blurRoom", String(prev));
        }
        if (roomId) {
            emit("focusRoom", String(roomId));
        }
        prevRoomIdRef.current = roomId;
    }, [roomId, socket, emit]);

    const [composerH, setComposerH] = useState(0);
    const bottomPad = Math.max(8, insets.bottom || 0);


    const renderRow = ({ item }: { item: any }) => {
        if (item.type === "sep") {
            return (
                <HStack justifyContent="center" py={6}>
                    <Badge rounded="lg" variant="subtle">{item.label}</Badge>
                </HStack>
            );
        }

        const m: ChatMessage = item.msg;
        const mine = m.from === userId;

        // --- Responsive image sizing (contain within bubble) ---
        const winW = Dimensions.get("window").width;
        const bubbleMaxW = Math.min(winW * 0.78, 360);
        const maxImgW = bubbleMaxW - 16;
        const rawW = Math.max(1, m.media?.w ?? 900);
        const rawH = Math.max(1, m.media?.h ?? 1200);
        const scale = Math.min(1, maxImgW / rawW);
        const dispW = Math.max(120, Math.round(rawW * scale));
        const dispH = Math.round(rawH * scale);

        // ✅ resolve display URL (key -> signed URL), with cache + warmup
        let imageDisplayUrl = "";
        if (m.type === "image" && m.media?.url) {
            if (/^https?:\/\//i.test(m.media.url)) {
                imageDisplayUrl = m.media.url;               // already a URL
            } else {
                imageDisplayUrl = previewCache[m.media.url] || "";
                if (!imageDisplayUrl) {
                    // fire-and-forget warmup; rerenders when cache updates
                    ensureDisplayUrl(m.media.url).catch(() => {});
                }
            }
        }

        return (
            <HStack px={12} py={4} justifyContent={mine ? "flex-end" : "flex-start"}>
                <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs, { maxWidth: bubbleMaxW }]}>
                    {m.type === "text" ? (
                        <Text style={[styles.bubbleText, mine && { color: "white" }]}>{m.text}</Text>
                    ) : (
                        <View style={[styles.imageWrap, { width: dispW, height: dispH }]}>
                            {imageDisplayUrl ? (
                                <Image
                                    source={{ uri: imageDisplayUrl }}
                                    style={styles.image}
                                    resizeMode="contain"
                                />
                            ) : (
                                // tiny skeleton while signed URL is fetching
                                <View style={[styles.image, { justifyContent: "center", alignItems: "center" }]}>
                                    <Text style={{ fontSize: 12, color: "#9ca3af" }}>Loading…</Text>
                                </View>
                            )}
                        </View>
                    )}
                    <Text style={[styles.time, mine && { color: "#dbeafe" }]}>
                        {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </Text>
                </View>
            </HStack>
        );
    };



    const anyoneTyping = Object.entries(typingUsers).some(([uid, v]) => uid !== userId && v);

    if (tokenLoading || meLoading || !roomId) {
        return (
            <SafeAreaView style={{ flex: 1 }}>
                <Center flex={1}>
                    <Spinner size="lg" />
                    <Text mt={3} color="coolGray.600">Loading chat…</Text>
                </Center>
            </SafeAreaView>
        );
    }
    if (meError) {
        return (
            <SafeAreaView style={{ flex: 1 }}>
                <Center flex={1} px={6}>
                    <Text color="red.600" textAlign="center">Failed to load your profile.</Text>
                    <Text mt={2} color="coolGray.600" fontSize="xs">{String(meError?.message || "")}</Text>
                </Center>
            </SafeAreaView>
        );
    }

    return (
        <Screen withHeader>
            <SafeAreaView style={{ flex: 1, backgroundColor: "#f8fafc" }}>
                <HStack style={styles.header} alignItems="center" bg="white" borderBottomWidth={1} borderBottomColor="coolGray.100" space={3}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} accessibilityLabel="Back">
                        <Text style={styles.backIcon}>‹</Text>
                    </TouchableOpacity>
                    <Avatar source={avatar ? { uri: String(avatar) } : undefined}>
                        {(name || String(trainerId) || "T")[0]?.toUpperCase?.() || "T"}
                    </Avatar>
                    <VStack flex={1} overflow="hidden">
                        <Text numberOfLines={1} fontSize="md" fontWeight="bold">
                            {name || String(trainerId)}
                        </Text>
                        <HStack space={2} alignItems="center">
                            <Box w={2} h={2} rounded="full" bg={isTrainerOnline ? "green.500" : "coolGray.400"} />
                            <Text fontSize="xs" color="coolGray.600">{isTrainerOnline ? "Online" : "Offline"}</Text>
                        </HStack>
                    </VStack>
                    {(!socket?.connected || joining) && <Spinner size="sm" />}
                </HStack>

                <KeyboardAvoidingView
                  style={{ flex: 1 }}
                  behavior={Platform.OS === "ios" ? "padding" : "height"}
                  keyboardVerticalOffset={Platform.OS === "ios" ? KEYBOARD_OFFSET : KEYBOARD_OFFSET - 60 }
                >
                    <Box flex={1} bg="gray.50">
                        {/* Header */}
                        {joining ? (
                            <Center flex={1}>
                                <Spinner size="lg" />
                                <Text mt={3} color="coolGray.600">Joining room…</Text>
                            </Center>
                        ) : (
                            <>
                                <FlatList
                                    ref={listRef}
                                    data={rows}
                                    keyExtractor={(r) => r.id}
                                    renderItem={renderRow}
                                    contentContainerStyle={[styles.listContent, { paddingBottom: composerH + bottomPad }]}
                                    keyboardShouldPersistTaps="handled"
                                    onScroll={onScroll}
                                    onContentSizeChange={onContentSizeChange}
                                    scrollEventThrottle={16}
                                    keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                                    ListHeaderComponent={
                                        <Box alignItems="center" py={8}>
                                            {hasMore ? (
                                                <Button size="sm" variant="ghost" onPress={loadEarlier}>Load earlier</Button>
                                            ) : (
                                                <Text color="coolGray.400" fontSize="xs">No more</Text>
                                            )}
                                        </Box>
                                    }
                                />

                                {anyoneTyping && (
                                    <HStack px={16} pb={6}><Text color="coolGray.500" fontSize="xs">Typing…</Text></HStack>
                                )}

                                {/* Composer */}
                                <View
                                   style={[styles.composer, { paddingBottom: bottomPad }]}
                                   onLayout={(e) => setComposerH(e.nativeEvent.layout.height)}
                                >
                                    <TouchableOpacity onPress={pickAndSendImage} style={styles.attachBtn} disabled={!token}>
                                        <Text style={{ color: "white" }}>＋</Text>
                                    </TouchableOpacity>
                                    <TextInput
                                        value={input}
                                        onChangeText={(t) => {
                                            setInput(t);
                                            if (roomId) emit("typing", String(roomId), t.length > 0);
                                        }}
                                        placeholder="Message…"
                                        style={styles.input}
                                        editable={!!socket?.connected && !!roomId && !sending}
                                        returnKeyType="send"
                                        onSubmitEditing={sendText}
                                    />
                                    <TouchableOpacity onPress={sendText} disabled={sending || !input.trim()} style={[styles.sendBtn, (sending || !input.trim()) && { opacity: 0.5 }]}>
                                        <Text style={styles.sendIcon}>➤</Text>
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </Box>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </Screen>
    );
}

const styles = StyleSheet.create({
    header: { height: 56, paddingHorizontal: 12 },
    backBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", marginRight: 8 },
    backIcon: { fontSize: 22 },
    listContent: { paddingTop: 8, paddingBottom: 12 },
    composer: {
        flexDirection: "row", alignItems: "center",
        paddingHorizontal: 12, paddingVertical: 8, backgroundColor: "white",
        borderTopWidth: 1, borderTopColor: "#e5e7eb",
    },
    attachBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#6b7280", alignItems: "center", justifyContent: "center", marginRight: 8 },
    input: {
        flex: 1, paddingHorizontal: 12, paddingVertical: 10, borderWidth: 1, borderColor: "#d1d5db",
        borderRadius: 12, backgroundColor: "#ffffff", fontSize: 16,
    },
    sendBtn: { width: 44, height: 44, marginLeft: 8, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: "#3b82f6" },
    sendIcon: { fontSize: 18, color: "white" },
    bubble: { maxWidth: "78%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
    bubbleMine: { backgroundColor: "#3b82f6" },
    bubbleTheirs: { backgroundColor: "#e5e7eb" },
    bubbleText: { color: "#111827" },
    time: { marginTop: 4, fontSize: 11, color: "#6b7280" },
    imageWrap: {
        borderRadius: 8,
        overflow: "hidden",            // <-- clip any overflow
        backgroundColor: "#f3f4f6",    // subtle grey behind contain
        alignSelf: "flex-start",
    },
    image: {
        width: "100%",
        height: "100%",
    },
});
