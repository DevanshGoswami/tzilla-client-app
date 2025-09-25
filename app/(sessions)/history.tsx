// app/sessions/history.tsx
import React, { useState, useMemo } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    SafeAreaView,
    Image,
    RefreshControl,
} from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@apollo/client/react";
import { GET_ME, GET_SESSIONS_FOR_CLIENT, GET_TRAINERS_FOR_CLIENT } from "@/graphql/queries";
import { Session, SessionStatus } from "@/graphql/types";
import Screen from "@/components/ui/Screen";

export default function SessionHistoryScreen() {
    const [refreshing, setRefreshing] = useState(false);
    // removed "completed" filter per requirement
    const [filter, setFilter] = useState<"all" | "cancelled" | "no_show">("all");

    const { data: meData, loading: meLoading } = useQuery(GET_ME);
    // @ts-ignore
    const clientId = meData?.user?._id;

    const { data: sessionsData, loading: sessionsLoading, refetch: refetchSessions } = useQuery<{
        sessionsForClient: Session[];
    }>(GET_SESSIONS_FOR_CLIENT, {
        variables: {
            clientId: clientId || "",
            pagination: { pageNumber: 1, pageSize: 100 },
        },
        skip: !clientId,
    });

    const { data: trainersData } = useQuery(GET_TRAINERS_FOR_CLIENT, {
        variables: { pagination: { pageNumber: 1, pageSize: 50 } },
    });

    // @ts-ignore
    const trainers = trainersData?.getTrainersForClient ?? [];

    // Past sessions (end time in the past)
    const historySessions = useMemo(() => {
        const sessions = sessionsData?.sessionsForClient ?? [];

        const filtered = sessions.filter((s) => {
            switch (filter) {
                case "cancelled":
                    return s.status === "CANCELLED";
                case "no_show":
                    return s.status === "NO_SHOW";
                case "all":
                default:
                    return true; // show everything
            }
        });

        // Newest (and upcoming) first
        return filtered.sort(
            (a, b) =>
                new Date(b.scheduledStart).getTime() -
                new Date(a.scheduledStart).getTime()
        );
    }, [sessionsData, filter]);


    const getTrainerForSession = (trainerId: string) => {
        // @ts-ignore
        return trainers.find((t) => t._id === trainerId);
    };

    // Treat CONFIRMED as the "completed/done" state (green)
    const getStatusColor = (status: SessionStatus) => {
        switch (status) {
            case "CONFIRMED":
                return "#2E7D32"; // done
            case "CANCELLED":
                return "#F57C00";
            case "NO_SHOW":
                return "#C62828";
            default:
                return "#666";
        }
    };

    const formatDate = (date: string) => {
        const dateObj = new Date(date);
        return dateObj.toLocaleDateString(undefined, {
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "numeric",
        });
    };

    const formatTime = (startString: string, endString: string) => {
        const start = new Date(startString);
        const end = new Date(endString);
        const startTime = start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        const endTime = end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        return `${startTime} - ${endTime}`;
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await refetchSessions();
        setRefreshing(false);
    };

    if (meLoading || sessionsLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#111" />
                <Text style={styles.loadingText}>Loading session history...</Text>
            </View>
        );
    }

    return (
        <Screen withHeader>
            <SafeAreaView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <FontAwesome5 name="arrow-left" size={18} color="#111" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Session History</Text>
                    <View style={{ width: 18 }} />
                </View>

                {/* Filter Tabs (removed "Completed") */}
                <View style={styles.filterContainer}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                        {[
                            { key: "all", label: "All" },
                            { key: "cancelled", label: "Cancelled" },
                            { key: "no_show", label: "No Show" },
                        ].map((tab) => (
                            <TouchableOpacity
                                key={tab.key}
                                style={[styles.filterTab, filter === tab.key && styles.filterTabActive]}
                                onPress={() => setFilter(tab.key as any)}
                            >
                                <Text
                                    style={[
                                        styles.filterTabText,
                                        filter === tab.key && styles.filterTabTextActive,
                                    ]}
                                >
                                    {tab.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>

                {/* Sessions List */}
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
                    contentContainerStyle={{ paddingBottom: 24 }}
                >
                    {historySessions.length === 0 ? (
                        <View style={styles.emptyState}>
                            <FontAwesome5 name="history" size={48} color="#ccc" />
                            <Text style={styles.emptyTitle}>No past sessions</Text>
                            <Text style={styles.emptyText}>
                                {filter === "all"
                                    ? "Your sessions will appear here"
                                    : `No ${filter.replace("_", " ")} sessions found`}
                            </Text>
                        </View>
                    ) : (
                        <View style={styles.sessionsList}>
                            {historySessions.map((session) => {
                                const trainer = getTrainerForSession(session.trainerId);
                                return (
                                    <TouchableOpacity
                                        key={session._id}
                                        style={styles.sessionCard}
                                        onPress={() =>
                                            router.push({
                                                pathname: "/(sessions)/details/[sessionId]",
                                                params: {
                                                    sessionId: session._id,
                                                    trainerId: session.trainerId,
                                                    trainerName: trainer?.name || trainer?.email || "Unknown",
                                                },
                                            })
                                        }
                                    >
                                        <View style={styles.sessionCardHeader}>
                                            <View style={styles.trainerInfo}>
                                                {trainer?.avatarUrl ? (
                                                    <Image source={{ uri: trainer.avatarUrl }} style={styles.trainerAvatar} />
                                                ) : (
                                                    <View style={styles.trainerAvatarPlaceholder}>
                                                        <FontAwesome5 name="user" size={16} color="#666" />
                                                    </View>
                                                )}
                                                <View style={{ flex: 1 }}>
                                                    <Text style={styles.trainerName}>
                                                        {trainer?.name || trainer?.email || "Unknown Trainer"}
                                                    </Text>
                                                    <Text style={styles.sessionDate}>{formatDate(session.scheduledStart)}</Text>
                                                </View>
                                            </View>
                                            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(session.status) }]}>
                                                <Text style={styles.statusText}>
                                                    {session.status.replace("_", " ")}
                                                </Text>
                                            </View>
                                        </View>

                                        <View style={styles.sessionCardContent}>
                                            <View style={styles.sessionDetail}>
                                                <FontAwesome5 name="clock" size={12} color="#666" />
                                                <Text style={styles.sessionDetailText}>
                                                    {formatTime(session.scheduledStart, session.scheduledEnd)}
                                                </Text>
                                            </View>
                                            <View style={styles.sessionDetail}>
                                                <FontAwesome5
                                                    name={session.type === "ONLINE" ? "video" : "map-marker-alt"}
                                                    size={12}
                                                    color="#666"
                                                />
                                                <Text style={styles.sessionDetailText}>
                                                    {session.type === "ONLINE" ? "Online" : "In-person"}
                                                </Text>
                                            </View>
                                        </View>

                                        {session.notes?.client && (
                                            <View style={styles.notesPreview}>
                                                <FontAwesome5 name="sticky-note" size={12} color="#999" />
                                                <Text style={styles.notesText} numberOfLines={1}>
                                                    {session.notes.client}
                                                </Text>
                                            </View>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </ScrollView>
            </SafeAreaView>
        </Screen>
    );
}

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
    headerTitle: { fontSize: 18, fontWeight: "700", color: "#111" },

    filterContainer: {
        backgroundColor: "#fff",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    filterTab: {
        paddingVertical: 8,
        paddingHorizontal: 16,
        marginRight: 12,
        borderRadius: 20,
        backgroundColor: "#f5f5f5",
    },
    filterTabActive: {
        backgroundColor: "#111",
    },
    filterTabText: {
        fontSize: 14,
        fontWeight: "600",
        color: "#666",
    },
    filterTabTextActive: {
        color: "#fff",
    },

    sessionsList: {
        padding: 16,
        gap: 12,
    },
    sessionCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 2,
    },
    sessionCardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: 12,
    },
    trainerInfo: {
        flexDirection: "row",
        alignItems: "center",
        flex: 1,
        gap: 12,
    },
    trainerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "#f0f0f0",
    },
    trainerAvatarPlaceholder: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "#f0f0f0",
        alignItems: "center",
        justifyContent: "center",
    },
    trainerName: {
        fontSize: 16,
        fontWeight: "600",
        color: "#111",
    },
    sessionDate: {
        fontSize: 13,
        color: "#666",
        marginTop: 2,
    },
    statusBadge: {
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 6,
    },
    statusText: {
        fontSize: 11,
        fontWeight: "700",
        color: "#fff",
        textTransform: "uppercase",
    },
    sessionCardContent: {
        flexDirection: "row",
        gap: 20,
    },
    sessionDetail: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    sessionDetailText: {
        fontSize: 13,
        color: "#666",
    },
    notesPreview: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: "#f5f5f5",
    },
    notesText: {
        fontSize: 12,
        color: "#999",
        flex: 1,
    },

    emptyState: {
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 80,
        paddingHorizontal: 24,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: "#333",
        marginTop: 16,
        marginBottom: 8,
    },
    emptyText: {
        fontSize: 14,
        color: "#666",
        textAlign: "center",
    },
});
