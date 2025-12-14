import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Dimensions } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { Platform, FlatList, Alert, StyleSheet, SafeAreaView, TouchableOpacity, TextInput, View, Image, Pressable, Modal, ScrollView, Keyboard } from "react-native";
import { Box, Text, HStack, VStack, Avatar, Badge, Spinner, Center } from "native-base";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams, router } from "expo-router";
import { useSocket } from "@/providers/SocketProvider";
import { presignImage, putToS3 } from "@/lib/upload";
import { getTokens } from "@/lib/apollo";
import { useQuery } from "@apollo/client/react";
import { GET_ME } from "@/graphql/queries";
import Screen from "@/components/ui/Screen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRuntimeConfig } from "@/lib/remoteConfig";

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

const THEME_BG = "#05030D";
const PANEL_BG = "#0B0617";
const CARD_BG = "rgba(15,12,28,0.95)";
const BORDER_COLOR = "rgba(255,255,255,0.08)";
const ACCENT = "#A855F7";
const ACCENT_SOLID = "#7C3AED";
const TEXT_MUTED = "rgba(247,244,255,0.7)";
const TEXT_SOFT = "rgba(247,244,255,0.5)";

function ChatHeader({
    name,
    trainerId,
    avatar,
    online,
    busy,
    onBack,
    onBook,
}: {
    name?: string;
    trainerId: string;
    avatar?: string;
    online: boolean;
    busy?: boolean;
    onBack: () => void;
    onBook: () => void;
}) {
    const displayName = name || trainerId || "Trainer";
    const initials = displayName?.charAt(0).toUpperCase() || "T";

    return (
        <View style={styles.chatHeader}>
            <Pressable onPress={onBack} accessibilityLabel="Go back" style={styles.chatHeaderButton} hitSlop={10}>
                <Ionicons name="chevron-back" size={22} color="#fff" />
            </Pressable>
            <View style={styles.chatHeaderIdentity}>
                <Avatar source={avatar ? { uri: avatar } : undefined} bg="rgba(255,255,255,0.12)" size="md">
                    {initials}
                </Avatar>
                <View style={styles.chatHeaderInfo}>
                    <Text style={styles.chatHeaderName} numberOfLines={1}>{displayName}</Text>
                    <View style={styles.chatHeaderStatusRow}>
                        <View style={[styles.chatHeaderDot, online ? styles.chatHeaderDotOnline : styles.chatHeaderDotOffline]} />
                        <Text style={styles.chatHeaderStatusText}>{online ? "Online now" : "Offline"}</Text>
                        {busy && <Spinner size="sm" color={ACCENT} ml={3} />}
                    </View>
                </View>
            </View>
            <Pressable
                accessibilityRole="button"
                onPress={onBook}
                style={styles.chatHeaderBook}
            >
                <Ionicons name="calendar-outline" size={16} color="#05030D" />
                <Text style={styles.chatHeaderBookText}>Book</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    chatHeader: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: PANEL_BG,
        borderBottomWidth: 1,
        borderBottomColor: BORDER_COLOR,
    },
    chatHeaderButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: BORDER_COLOR,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    chatHeaderIdentity: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
    },
    chatHeaderInfo: {
        marginLeft: 12,
        flex: 1,
    },
    chatHeaderName: {
        color: "#fff",
        fontSize: 18,
        fontWeight: "700",
    },
    chatHeaderStatusRow: {
        flexDirection: "row",
        alignItems: "center",
        marginTop: 4,
    },
    chatHeaderDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
        marginRight: 6,
    },
    chatHeaderDotOnline: {
        backgroundColor: "#34D399",
    },
    chatHeaderDotOffline: {
        backgroundColor: "rgba(255,255,255,0.4)",
    },
    chatHeaderStatusText: {
        color: TEXT_SOFT,
        fontSize: 12,
    },
    chatHeaderBook: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: ACCENT,
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        marginLeft: 8,
    },
    chatHeaderBookText: {
        color: "#05030D",
        fontWeight: "800",
        marginLeft: 6,
    },
    listContent: {
        paddingTop: 8,
        paddingBottom: 12,
    },
    historyCapsule: {
        alignItems: "center",
        paddingVertical: 12,
    },
    historyLabel: {
        color: TEXT_MUTED,
        fontSize: 12,
        marginBottom: 6,
        letterSpacing: 0.6,
    },
    historyButton: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: BORDER_COLOR,
    },
    historyButtonText: {
        marginLeft: 6,
        color: ACCENT,
        fontWeight: "700",
    },
    historyHint: {
        color: TEXT_SOFT,
        fontSize: 12,
    },
    typingPill: {
        flexDirection: "row",
        alignItems: "center",
        alignSelf: "flex-start",
        marginLeft: 24,
        marginBottom: 6,
        backgroundColor: "rgba(255,255,255,0.04)",
        borderRadius: 999,
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderWidth: 1,
        borderColor: BORDER_COLOR,
    },
    typingDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: ACCENT,
        marginRight: 4,
    },
    typingText: {
        color: TEXT_SOFT,
        fontSize: 11,
        marginLeft: 6,
    },
    composer: {
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 14,
        paddingVertical: 12,
        backgroundColor: CARD_BG,
        borderTopWidth: 1,
        borderTopColor: BORDER_COLOR,
    },
    inputWrap: {
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 22,
        borderWidth: 1,
        borderColor: BORDER_COLOR,
        backgroundColor: "rgba(255,255,255,0.03)",
        paddingHorizontal: 12,
        paddingVertical: 4,
    },
    input: {
        flex: 1,
        paddingVertical: 8,
        fontSize: 15,
        color: "#fff",
    },
    inlineAttachment: {
        marginLeft: 10,
        padding: 6,
    },
    sendBtn: {
        width: 44,
        height: 44,
        marginLeft: 8,
        borderRadius: 22,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: ACCENT,
    },
    msgRow: {
        flexDirection: "row",
        paddingHorizontal: 16,
        paddingVertical: 4,
    },
    msgRowMine: {
        justifyContent: "flex-end",
    },
    msgRowTheirs: {
        justifyContent: "flex-start",
    },
    msgAvatarShell: {
        marginRight: 8,
        marginTop: 6,
    },
    bubble: {
        maxWidth: "78%",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: BORDER_COLOR,
    },
    bubbleMine: { backgroundColor: ACCENT_SOLID, borderColor: "transparent" },
    bubbleTheirs: { backgroundColor: "rgba(255,255,255,0.05)" },
    imageBubble: {
        paddingHorizontal: 8,
        paddingVertical: 8,
    },
    bubbleText: { color: "#e2e8f0", fontSize: 15, lineHeight: 20 },
    bubbleTextMine: { color: "#fff" },
    bubbleFooter: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        marginTop: 8,
    },
    time: { fontSize: 11, color: "#94a3b8" },
    timeMine: { color: "rgba(255,255,255,0.85)" },
    deliveryPill: {
        flexDirection: "row",
        alignItems: "center",
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: "rgba(255,255,255,0.15)",
        marginLeft: 12,
    },
    deliveryPillRead: {
        backgroundColor: "rgba(16,185,129,0.3)",
    },
    deliveryText: {
        color: "#fff",
        fontSize: 10,
        fontWeight: "700",
        marginLeft: 4,
        letterSpacing: 0.6,
    },
    imageWrap: {
        borderRadius: 12,
        overflow: "hidden",
        backgroundColor: "rgba(255,255,255,0.05)",
        alignSelf: "center",
    },
    imagePressable: {
        alignItems: "center",
    },
    image: {
        width: "100%",
        height: "100%",
    },
    imageLoadingText: { fontSize: 12, color: "#9ca3af" },
    viewerBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.85)",
        justifyContent: "center",
        alignItems: "center",
        paddingHorizontal: 16,
    },
    viewerBackdropPress: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
    },
    viewerCard: {
        width: "100%",
        maxWidth: 420,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: BORDER_COLOR,
        backgroundColor: "#05030D",
        padding: 16,
    },
    viewerScroll: {
        alignItems: "center",
        justifyContent: "center",
    },
    viewerImage: {
        width: "100%",
        height: undefined,
    },
    viewerClose: {
        position: "absolute",
        top: 10,
        right: 10,
        width: 32,
        height: 32,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(0,0,0,0.4)",
    },
});
export default function ChatRoom() {
    const { trainerId, roomId, name, avatar } = useLocalSearchParams<{
        trainerId: string; roomId?: string; name?: string; avatar?: string;
    }>();
    const insets = useSafeAreaInsets();

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
    const [keyboardHeight, setKeyboardHeight] = useState(0);

    const [previewCache, setPreviewCache] = useState<Record<string, string>>({});
    const previewRef = useRef(previewCache);
    previewRef.current = previewCache;
    const [previewImage, setPreviewImage] = useState<{ uri: string; width: number; height: number } | null>(null);
    const viewerAspect = previewImage?.height ? previewImage.width / previewImage.height : 1;

    const runtimeConfig = useRuntimeConfig();
    const awsBase = useMemo(() => `${runtimeConfig.apiUrl}/api/aws`, [runtimeConfig.apiUrl]);

    async function getPreviewUrlForKey(key: string, accessToken: string): Promise<string> {
        const res = await fetch(`${awsBase}/media/${encodeURIComponent(key)}`, {
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
        [token, awsBase]
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

    useEffect(() => {
        const subs = [
            Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow", (evt) => {
                setKeyboardHeight(evt.endCoordinates.height);
            }),
            Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => {
                setKeyboardHeight(0);
                if (!nearBottomRef.current) return;
                requestAnimationFrame(() => {
                    scrollToEnd(false);
                });
            }),
        ];
        return () => subs.forEach((sub) => sub.remove());
    }, [scrollToEnd]);

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

        const readByTrainer = mine && (m.readBy || []).includes(String(trainerId));
        const timeLabel = new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        const bubbleStyles = [
            styles.bubble,
            mine ? styles.bubbleMine : styles.bubbleTheirs,
            { maxWidth: bubbleMaxW },
            m.type === "image" && styles.imageBubble,
        ];

        return (
            <View style={[styles.msgRow, mine ? styles.msgRowMine : styles.msgRowTheirs]}>
                {!mine && (
                    <View style={styles.msgAvatarShell}>
                        <Avatar size="sm" bg="rgba(255,255,255,0.08)">
                            {(name || String(trainerId) || "T")[0]?.toUpperCase?.() || "T"}
                        </Avatar>
                    </View>
                )}
                <View style={bubbleStyles}>
                    {m.type === "text" ? (
                        <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{m.text}</Text>
                    ) : (
                        <Pressable
                            style={styles.imagePressable}
                            onPress={() => {
                                if (imageDisplayUrl) setPreviewImage({ uri: imageDisplayUrl, width: rawW, height: rawH });
                            }}
                            disabled={!imageDisplayUrl}
                        >
                            <View style={[styles.imageWrap, { width: dispW, height: dispH }]}>
                                {imageDisplayUrl ? (
                                    <Image
                                        source={{ uri: imageDisplayUrl }}
                                        style={styles.image}
                                        resizeMode="contain"
                                    />
                                ) : (
                                    <View style={[styles.image, { justifyContent: "center", alignItems: "center" }]}>
                                        <Text style={styles.imageLoadingText}>Loading…</Text>
                                    </View>
                                )}
                            </View>
                        </Pressable>
                    )}
                    <View style={styles.bubbleFooter}>
                        <Text style={[styles.time, mine && styles.timeMine]}>{timeLabel}</Text>
                        {mine && (
                            <View style={[styles.deliveryPill, readByTrainer && styles.deliveryPillRead]}>
                                <Ionicons
                                    name={readByTrainer ? "checkmark-done-outline" : "checkmark-outline"}
                                    size={12}
                                    color="#fff"
                                />
                                <Text style={styles.deliveryText}>{readByTrainer ? "Read" : "Sent"}</Text>
                            </View>
                        )}
                    </View>
                </View>
            </View>
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
        <Screen withHeader backgroundColor={THEME_BG} headerColor={THEME_BG}>
            <SafeAreaView style={{ flex: 1, backgroundColor: THEME_BG }}>
                <VStack flex={1}>
                    <ChatHeader
                        name={typeof name === "string" ? name : undefined}
                        trainerId={String(trainerId)}
                        avatar={typeof avatar === "string" ? avatar : undefined}
                        online={isTrainerOnline}
                        busy={!socket?.connected || joining}
                        onBack={() => router.back()}
                        onBook={() => router.push({ pathname: "/(sessions)/[trainerId]", params: { trainerId: String(trainerId) } })}
                    />

                    <Box flex={1} bg={THEME_BG}>
                        {joining ? (
                            <Center flex={1}>
                                <Spinner size="lg" color="violet.300" />
                                <Text mt={3} color="coolGray.400">Joining room…</Text>
                            </Center>
                        ) : (
                            <>
                                <FlatList
                                    ref={listRef}
                                    data={rows}
                                    keyExtractor={(r) => r.id}
                                    renderItem={renderRow}
                                    contentContainerStyle={[
                                        styles.listContent,
                                        { paddingBottom: composerH + bottomPad + keyboardHeight },
                                    ]}
                                    keyboardShouldPersistTaps="handled"
                                    onScroll={onScroll}
                                    onContentSizeChange={onContentSizeChange}
                                    scrollEventThrottle={16}
                                    keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
                                    ListHeaderComponent={
                                        <View style={styles.historyCapsule}>
                                            <Text style={styles.historyLabel}>{hasMore ? "Need more context?" : "Day one reached"}</Text>
                                            {hasMore ? (
                                                <Pressable onPress={loadEarlier} style={styles.historyButton}>
                                                    <Ionicons name="time-outline" size={14} color={ACCENT} />
                                                    <Text style={styles.historyButtonText}>Load earlier</Text>
                                                </Pressable>
                                            ) : (
                                                <Text style={styles.historyHint}>{"You're fully caught up on this thread."}</Text>
                                            )}
                                        </View>
                                    }
                                />

                                {anyoneTyping && (
                                    <View style={styles.typingPill}>
                                        <View style={styles.typingDot} />
                                        <View style={styles.typingDot} />
                                        <View style={styles.typingDot} />
                                        <Text style={styles.typingText}>Trainer is typing…</Text>
                                    </View>
                                )}

                                <View
                                    style={[
                                        styles.composer,
                                        {
                                            paddingBottom: bottomPad,
                                            marginBottom: Math.max(0, keyboardHeight - bottomPad),
                                        },
                                    ]}
                                    onLayout={(e) => setComposerH(e.nativeEvent.layout.height)}
                                >
                                    <View style={styles.inputWrap}>
                                        <TextInput
                                            value={input}
                                            onChangeText={(t) => {
                                                setInput(t);
                                                if (roomId) emit("typing", String(roomId), t.length > 0);
                                            }}
                                            placeholder="Message coach…"
                                            placeholderTextColor={TEXT_SOFT}
                                            style={styles.input}
                                            editable={!!socket?.connected && !!roomId && !sending}
                                            returnKeyType="send"
                                            onSubmitEditing={sendText}
                                        />
                                        <TouchableOpacity onPress={pickAndSendImage} style={styles.inlineAttachment} disabled={!token}>
                                            <Ionicons name="image-outline" size={18} color="#fff" />
                                        </TouchableOpacity>
                                    </View>
                                    <TouchableOpacity
                                        onPress={sendText}
                                        disabled={sending || !input.trim()}
                                        style={[styles.sendBtn, (sending || !input.trim()) && { opacity: 0.4 }]}
                                    >
                                        <Ionicons name="send" size={18} color="#05030D" />
                                    </TouchableOpacity>
                                </View>
                            </>
                        )}
                    </Box>
                </VStack>
            </SafeAreaView>

            {previewImage && (
                <Modal
                    visible
                    transparent
                    animationType="fade"
                    onRequestClose={() => setPreviewImage(null)}
                >
                    <View style={styles.viewerBackdrop}>
                        <Pressable style={styles.viewerBackdropPress} onPress={() => setPreviewImage(null)} />
                        <View style={styles.viewerCard}>
                            <ScrollView
                                minimumZoomScale={1}
                                maximumZoomScale={3}
                                contentContainerStyle={styles.viewerScroll}
                                bounces={false}
                            >
                                <Image
                                    source={{ uri: previewImage.uri }}
                                    style={[styles.viewerImage, { aspectRatio: viewerAspect }]}
                                    resizeMode="contain"
                                />
                            </ScrollView>
                            <Pressable style={styles.viewerClose} onPress={() => setPreviewImage(null)}>
                                <Ionicons name="close" size={20} color="#fff" />
                            </Pressable>
                        </View>
                    </View>
                </Modal>
            )}
        </Screen>
    );
}
