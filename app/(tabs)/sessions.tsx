// app/sessions/index.tsx
import React, { useState } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    Alert,
    SafeAreaView,
    Image,
} from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { router } from "expo-router";
import { GET_ME, GET_TRAINERS_FOR_CLIENT, GET_SESSIONS_FOR_CLIENT } from "@/graphql/queries";
import { useQuery } from "@apollo/client/react";
import { Session, SessionStatus } from "@/graphql/types";

/* ===================== Types ===================== */

type Trainer = {
    _id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
};

type TrainersQueryData = {
    getTrainersForClient: Trainer[];
};

/* ===================== Component ===================== */

export default function SessionsScreen() {
    const [pageNumber, setPageNumber] = useState(1);
    const pageSize = 20;

    const { data: meData, loading: meLoading } = useQuery(GET_ME);
    // @ts-ignore
    const clientId = meData?.user?._id;

    const { data, loading, refetch, fetchMore } = useQuery<TrainersQueryData>(
        GET_TRAINERS_FOR_CLIENT,
        {
            variables: { pagination: { pageNumber, pageSize } },
            notifyOnNetworkStatusChange: true,
        }
    );

    // Fetch upcoming sessions
    const { data: sessionsData, loading: sessionsLoading, refetch: refetchSessions } = useQuery<{
        sessionsForClient: Session[];
    }>(GET_SESSIONS_FOR_CLIENT, {
        variables: {
            clientId: clientId || "",
            pagination: { pageNumber: 1, pageSize: 50 },
        },
        skip: !clientId,
    });

    const trainers = data?.getTrainersForClient ?? [];
    const hasMore = trainers.length >= pageNumber * pageSize;
    const [loadingMore, setLoadingMore] = useState(false);

    // Filter upcoming sessions (future sessions that aren't cancelled)
    const upcomingSessions = (sessionsData?.sessionsForClient ?? [])
        .filter((session) => {
            const sessionDate = new Date(session.scheduledStart);
            const now = new Date();
            return sessionDate > now && session.status !== "CANCELLED";
        })
        .sort(
            (a, b) =>
                new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime()
        )
        .slice(0, 5); // Show only next 5 sessions

    const handleLoadMore = async () => {
        if (!hasMore || loadingMore) return;
        setLoadingMore(true);
        try {
            await fetchMore({
                variables: { pagination: { pageNumber: pageNumber + 1, pageSize } },
                // @ts-ignore
                updateQuery: (prev, { fetchMoreResult }) => {
                    if (!fetchMoreResult?.getTrainersForClient) return prev;
                    return {
                        getTrainersForClient: [
                            ...prev.getTrainersForClient,
                            ...fetchMoreResult.getTrainersForClient,
                        ],
                    };
                },
            });
            setPageNumber((p) => p + 1);
        } catch (e) {
            Alert.alert("Error", "Could not load more trainers.");
        } finally {
            setLoadingMore(false);
        }
    };

    // Helper functions for formatting session data
    const getSessionStatusColor = (status: SessionStatus) => {
        switch (status) {
            case "CONFIRMED":
                return "#2E7D32";
            case "PENDING":
                return "#F57C00";
            case "COMPLETED":
                return "#666";
            case "NO_SHOW":
                return "#C62828";
            default:
                return "#999";
        }
    };

    const formatSessionDate = (dateString: string) => {
        const date = new Date(dateString);
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        if (date.toDateString() === today.toDateString()) {
            return "Today";
        } else if (date.toDateString() === tomorrow.toDateString()) {
            return "Tomorrow";
        } else {
            return date.toLocaleDateString(undefined, {
                weekday: "short",
                month: "short",
                day: "numeric",
            });
        }
    };

    const formatSessionTime = (startString: string, endString: string) => {
        const start = new Date(startString);
        const end = new Date(endString);
        const startTime = start.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
        const endTime = end.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
        return `${startTime} - ${endTime}`;
    };

    // Find trainer name for a session
    const getTrainerForSession = (trainerId: string) => {
        return trainers.find((t) => t._id === trainerId);
    };

    if (meLoading || (loading && trainers.length === 0 && !sessionsData) || sessionsLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#111" />
                <Text style={styles.loadingText}>Loading sessions...</Text>
            </View>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {/* Header */}
                <View style={styles.header}>
                    <Text style={styles.headerTitle}>Sessions</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 16 }}>
                        <TouchableOpacity onPress={() => router.push("/(sessions)/history")}>
                            <Text style={styles.viewAllText}>View History</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => {
                                refetch();
                                refetchSessions();
                            }}
                            accessibilityLabel="Refresh"
                        >
                            <FontAwesome5 name="sync" size={18} color="#111" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* ===================== 1) Your Trainers (book sessions) ===================== */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Your Trainers</Text>

                    {trainers.length === 0 ? (
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIconContainer}>
                                <FontAwesome5 name="user-friends" size={46} color="#ccc" />
                            </View>
                            <Text style={styles.emptyTitle}>No trainers assigned</Text>
                            <Text style={styles.emptyText}>
                                Once a trainer is assigned to your account, they will show up here.
                            </Text>
                        </View>
                    ) : (
                        // @ts-ignore
                        trainers.map((t) => (
                            <TouchableOpacity
                                key={t._id}
                                style={styles.card}
                                onPress={() =>
                                    router.push({
                                        pathname: "/(sessions)/[trainerId]",
                                        params: {
                                            trainerId: t._id,
                                            trainerName: t.name || "",
                                            trainerEmail: t.email,
                                            avatarUrl: t.avatarUrl || "",
                                        },
                                    })
                                }
                            >
                                <View style={{ flexDirection: "row", alignItems: "center" }}>
                                    {t.avatarUrl ? (
                                        <Image source={{ uri: t.avatarUrl }} style={styles.avatarImg} />
                                    ) : (
                                        <View style={styles.avatar}>
                                            <FontAwesome5 name="user-tie" size={18} color="#111" />
                                        </View>
                                    )}
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.trainerName}>{t.name || t.email}</Text>
                                        <Text style={styles.trainerMeta}>{t.email}</Text>
                                    </View>
                                    <FontAwesome5 name="calendar-alt" size={16} color="#111" />
                                </View>
                            </TouchableOpacity>
                        ))
                    )}

                    {/* Load More */}
                    {hasMore && (
                        <View style={{ paddingVertical: 12 }}>
                            <TouchableOpacity
                                style={[styles.button, styles.primaryButton]}
                                disabled={loadingMore}
                                onPress={handleLoadMore}
                            >
                                {loadingMore ? (
                                    <ActivityIndicator color="#fff" />
                                ) : (
                                    <>
                                        <FontAwesome5 name="chevron-down" size={14} color="#fff" />
                                        <Text style={styles.primaryButtonText}>Load more</Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* ===================== 2) Trainer Invitations ===================== */}
                <View style={styles.section}>
                    <TouchableOpacity
                        style={styles.inviteCard}
                        onPress={() => router.push("/(profile)/invitations")}
                    >
                        <View style={styles.inviteIcon}>
                            <FontAwesome5 name="envelope-open-text" size={18} color="#111" />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={styles.inviteTitle}>Trainer Invitations</Text>
                            <Text style={styles.inviteSubtitle}>View and accept invites from trainers.</Text>
                        </View>
                        <FontAwesome5 name="chevron-right" size={14} color="#999" />
                    </TouchableOpacity>
                </View>

                {/* ===================== 3) Upcoming Sessions (always visible) ===================== */}
                <View style={styles.section}>
                    <View style={styles.sectionHeader}>
                        <Text style={styles.sectionTitle}>Upcoming Sessions</Text>
                        <TouchableOpacity onPress={() => router.push("/(sessions)/history")}>
                            <Text style={styles.viewAllText}>View History</Text>
                        </TouchableOpacity>
                    </View>

                    {upcomingSessions.length === 0 ? (
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIconContainer}>
                                <FontAwesome5 name="calendar-times" size={46} color="#ccc" />
                            </View>
                            <Text style={styles.emptyTitle}>No upcoming sessions</Text>
                            <Text style={styles.emptyText}>
                                You don’t have any sessions scheduled yet.
                            </Text>
                            {trainers.length > 0 && (
                                <TouchableOpacity
                                    style={[styles.button, styles.primaryButton, { marginTop: 12 }]}
                                    onPress={() =>
                                        router.push({
                                            pathname: "/(sessions)/[trainerId]",
                                            params: {
                                                trainerId: trainers[0]._id,
                                                trainerName: trainers[0].name || "",
                                                trainerEmail: trainers[0].email,
                                                avatarUrl: trainers[0].avatarUrl || "",
                                            },
                                        })
                                    }
                                >
                                    <FontAwesome5 name="plus" size={14} color="#fff" />
                                    <Text style={styles.primaryButtonText}>Book a session</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ) : (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ gap: 12 }}
                        >
                            {upcomingSessions.map((session) => {
                                const trainer = getTrainerForSession(session.trainerId);
                                return (
                                    <TouchableOpacity
                                        key={session._id}
                                        style={styles.sessionCard}
                                        onPress={() => {
                                            router.push({
                                                pathname: "/(sessions)/details/[sessionId]",
                                                params: { sessionId: session._id },
                                            });
                                        }}
                                    >
                                        <View style={styles.sessionHeader}>
                                            <Text style={styles.sessionDate}>
                                                {formatSessionDate(session.scheduledStart)}
                                            </Text>
                                            <View
                                                style={[
                                                    styles.statusBadge,
                                                    { backgroundColor: getSessionStatusColor(session.status) },
                                                ]}
                                            >
                                                <Text style={styles.statusText}>{session.status}</Text>
                                            </View>
                                        </View>

                                        <Text style={styles.sessionTime}>
                                            {formatSessionTime(session.scheduledStart, session.scheduledEnd)}
                                        </Text>

                                        <View style={styles.sessionTrainer}>
                                            {trainer?.avatarUrl ? (
                                                <Image source={{ uri: trainer.avatarUrl }} style={styles.sessionAvatarImg} />
                                            ) : (
                                                <View style={styles.sessionAvatar}>
                                                    <FontAwesome5 name="user" size={12} color="#666" />
                                                </View>
                                            )}
                                            <Text style={styles.sessionTrainerName} numberOfLines={1}>
                                                {trainer?.name || trainer?.email || "Unknown Trainer"}
                                            </Text>
                                        </View>

                                        <View style={styles.sessionFooter}>
                                            <FontAwesome5
                                                name={session.type === "ONLINE" ? "video" : "map-marker-alt"}
                                                size={12}
                                                color="#666"
                                            />
                                            <Text style={styles.sessionType}>
                                                {session.type === "ONLINE" ? "Online" : "In-person"}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

/* ===================== Styles ===================== */

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f5f5f5" },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#fff",
    },
    loadingText: { marginTop: 10, fontSize: 16, color: "#666" },

    header: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    headerTitle: { fontSize: 20, fontWeight: "700", color: "#111" },

    section: { padding: 16 },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "700",
        color: "#999",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 12,
    },
    sectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 12,
    },
    viewAllText: {
        fontSize: 14,
        color: "#007AFF",
        fontWeight: "600",
    },

    inviteCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderColor: "#eee",
    },
    inviteIcon: {
        width: 36,
        height: 36,
        borderRadius: 10,
        backgroundColor: "#F1F1F1",
        alignItems: "center",
        justifyContent: "center",
    },
    inviteTitle: { fontSize: 15, fontWeight: "700", color: "#111" },
    inviteSubtitle: { fontSize: 12, color: "#666", marginTop: 2 },

    card: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "#EAEAEA",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 12,
    },
    avatarImg: {
        width: 40,
        height: 40,
        borderRadius: 12,
        marginRight: 12,
        backgroundColor: "#EAEAEA",
    },
    trainerName: { fontSize: 16, fontWeight: "600", color: "#111" },
    trainerMeta: { fontSize: 12, color: "#777", marginTop: 2 },

    button: {
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
    },
    primaryButton: { backgroundColor: "#111" },
    primaryButtonText: { color: "#fff", fontSize: 14, fontWeight: "700", marginLeft: 8 },

    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 32,
        paddingHorizontal: 24,
        backgroundColor: "#fff",
        borderRadius: 12,
    },
    emptyIconContainer: { marginBottom: 12 },
    emptyTitle: { fontSize: 18, fontWeight: "700", color: "#333", marginBottom: 6 },
    emptyText: { fontSize: 14, color: "#666", textAlign: "center", lineHeight: 20 },

    // Upcoming sessions styles
    sessionCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 14,
        width: 160,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 3,
        borderWidth: 1,
        borderColor: "#f0f0f0",
    },
    sessionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 8,
    },
    sessionDate: {
        fontSize: 13,
        fontWeight: "700",
        color: "#111",
    },
    statusBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 4,
    },
    statusText: {
        fontSize: 10,
        fontWeight: "700",
        color: "#fff",
        textTransform: "uppercase",
    },
    sessionTime: {
        fontSize: 16,
        fontWeight: "600",
        color: "#333",
        marginBottom: 12,
    },
    sessionTrainer: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 8,
        gap: 6,
    },
    sessionAvatar: {
        width: 24,
        height: 24,
        borderRadius: 8,
        backgroundColor: "#f0f0f0",
        alignItems: "center",
        justifyContent: "center",
    },
    sessionAvatarImg: {
        width: 24,
        height: 24,
        borderRadius: 8,
        backgroundColor: "#f0f0f0",
    },
    sessionTrainerName: {
        fontSize: 12,
        color: "#666",
        flex: 1,
    },
    sessionFooter: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        borderTopWidth: 1,
        borderTopColor: "#f5f5f5",
        paddingTop: 8,
    },
    sessionType: {
        fontSize: 11,
        color: "#666",
    },
});
