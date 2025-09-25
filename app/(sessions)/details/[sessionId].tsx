// app/sessions/details/[sessionId].tsx
import React, { useState } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    SafeAreaView,
    Image,
    TextInput,
    Alert,
} from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@apollo/client/react";
import { GET_SESSION_BY_ID, GET_TRAINERS_FOR_CLIENT } from "@/graphql/queries";
import { UPDATE_SESSION_CLIENT_NOTES, CANCEL_SESSION } from "@/graphql/mutations";
import { Session, SessionStatus } from "@/graphql/types";
import Screen from "@/components/ui/Screen";

export default function SessionDetailsScreen() {
    const params = useLocalSearchParams<{
        sessionId: string;
        trainerId?: string;
        trainerName?: string;
    }>();

    const [editingNotes, setEditingNotes] = useState(false);
    const [clientNotes, setClientNotes] = useState("");

    const { data: sessionData, loading: sessionLoading, refetch } = useQuery<{
        sessionById: Session
    }>(GET_SESSION_BY_ID, {
        variables: { id: params.sessionId },
        skip: !params.sessionId,
    });

    const { data: trainersData } = useQuery(GET_TRAINERS_FOR_CLIENT, {
        variables: { pagination: { pageNumber: 1, pageSize: 50 } },
    });

    const [updateNotes, { loading: updatingNotes }] = useMutation(UPDATE_SESSION_CLIENT_NOTES);
    const [cancelSession, { loading: cancelling }] = useMutation(CANCEL_SESSION);

    const session = sessionData?.sessionById;
    // @ts-ignore
    const trainers = trainersData?.getTrainersForClient ?? [];
    // @ts-ignore
    const trainer = trainers.find(t => t._id === session?.trainerId) || {
        name: params.trainerName,
        _id: params.trainerId,
    };

    const getStatusColor = (status: SessionStatus) => {
        switch (status) {
            case "CONFIRMED": return "#2E7D32";
            case "PENDING": return "#F57C00";
            case "COMPLETED": return "#666";
            case "CANCELLED": return "#C62828";
            case "NO_SHOW": return "#C62828";
            default: return "#999";
        }
    };

    const formatDateTime = (dateString: string) => {
        const dateObj = new Date(dateString)
        return {
            date: dateObj.toLocaleDateString(undefined, {
                weekday: 'long',
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            }),
            time: dateObj.toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            })
        };
    };

    const getDuration = (startString: string, endString: string) => {
        const end = new Date(endString)
        const start = new Date(startString)
        const minutes = Math.round((end.getTime() - start.getTime()) / 60000);
        return minutes;
    };

    const canCancel = () => {
        if (!session) return false;
        const sessionDate = new Date(session.scheduledStart);
        const now = new Date();
        return sessionDate > now && session.status !== "CANCELLED" && session.status !== "COMPLETED";
    };

    const handleSaveNotes = async () => {
        if (!session?._id) return;

        try {
            await updateNotes({
                variables: {
                    input: {
                        sessionId: session._id,
                        notes: clientNotes
                    }
                }
            });
            setEditingNotes(false);
            Alert.alert("Success", "Notes updated successfully");
            refetch();
        } catch (error) {
            Alert.alert("Error", "Failed to update notes");
        }
    };

    const handleCancelSession = () => {
        if (!session?._id) return;

        Alert.alert(
            "Cancel Session",
            "Are you sure you want to cancel this session?",
            [
                { text: "No", style: "cancel" },
                {
                    text: "Yes, Cancel",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await cancelSession({
                                variables: {
                                    sessionId: session._id,
                                    reason: "Cancelled by client"
                                }
                            });
                            Alert.alert("Success", "Session cancelled successfully");
                            refetch();
                        } catch (error) {
                            Alert.alert("Error", "Failed to cancel session");
                        }
                    }
                }
            ]
        );
    };

    if (sessionLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#111" />
                <Text style={styles.loadingText}>Loading session details...</Text>
            </View>
        );
    }

    if (!session) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>Session not found</Text>
                <TouchableOpacity
                    style={styles.backButton}
                    onPress={() => router.back()}
                >
                    <Text style={styles.backButtonText}>Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    const startDateTime = formatDateTime(session.scheduledStart);
    const endDateTime = formatDateTime(session.scheduledEnd);
    const duration = getDuration(session.scheduledStart, session.scheduledEnd);

    return (
        <Screen>
            <SafeAreaView style={styles.container}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()}>
                        <FontAwesome5 name="arrow-left" size={18} color="#111" />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Session Details</Text>
                    <TouchableOpacity onPress={() => refetch()}>
                        <FontAwesome5 name="sync" size={18} color="#111" />
                    </TouchableOpacity>
                </View>

                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                    {/* Status Card */}
                    <View style={styles.section}>
                        <View style={[styles.statusCard, { borderColor: getStatusColor(session.status) }]}>
                            <View style={[styles.statusBadge, { backgroundColor: getStatusColor(session.status) }]}>
                                <Text style={styles.statusText}>{session.status.replace('_', ' ')}</Text>
                            </View>
                            <Text style={styles.sessionId}>Session #{session._id.slice(-6)}</Text>
                        </View>
                    </View>

                    {/* Trainer Info */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Trainer</Text>
                        <View style={styles.trainerCard}>
                            {trainer.avatarUrl ? (
                                <Image source={{ uri: trainer.avatarUrl }} style={styles.trainerAvatar} />
                            ) : (
                                <View style={styles.trainerAvatarPlaceholder}>
                                    <FontAwesome5 name="user-tie" size={20} color="#666" />
                                </View>
                            )}
                            <View style={{ flex: 1 }}>
                                <Text style={styles.trainerName}>{trainer.name || trainer.email || "Unknown Trainer"}</Text>
                                {trainer.email && <Text style={styles.trainerEmail}>{trainer.email}</Text>}
                            </View>
                        </View>
                    </View>

                    {/* Date & Time */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Date & Time</Text>
                        <View style={styles.card}>
                            <View style={styles.dateTimeRow}>
                                <FontAwesome5 name="calendar" size={16} color="#666" />
                                <Text style={styles.dateText}>{startDateTime.date}</Text>
                            </View>
                            <View style={styles.dateTimeRow}>
                                <FontAwesome5 name="clock" size={16} color="#666" />
                                <Text style={styles.timeText}>
                                    {startDateTime.time} - {endDateTime.time} ({duration} min)
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Session Type & Location/Link */}
                    <View style={styles.section}>
                        <Text style={styles.sectionTitle}>Session Details</Text>
                        <View style={styles.card}>
                            <View style={styles.detailRow}>
                                <Text style={styles.detailLabel}>Type</Text>
                                <View style={styles.typeTag}>
                                    <FontAwesome5
                                        name={session.type === "ONLINE" ? "video" : "map-marker-alt"}
                                        size={12}
                                        color="#666"
                                    />
                                    <Text style={styles.typeText}>
                                        {session.type === "ONLINE" ? "Online" : "In-person"}
                                    </Text>
                                </View>
                            </View>

                            {session.type === "ONLINE" && session.meetingLink && (
                                <View style={styles.detailRow}>
                                    <Text style={styles.detailLabel}>Meeting Link</Text>
                                    <TouchableOpacity style={styles.linkButton}>
                                        <FontAwesome5 name="external-link-alt" size={12} color="#007AFF" />
                                        <Text style={styles.linkText}>Join Meeting</Text>
                                    </TouchableOpacity>
                                </View>
                            )}

                            {session.type === "IN_PERSON" && session.location && (
                                <View style={styles.locationContainer}>
                                    <Text style={styles.detailLabel}>Location</Text>
                                    <Text style={styles.locationText}>
                                        {session.location.addressLine1}
                                        {session.location.addressLine2 ? `\n${session.location.addressLine2}` : ''}
                                        {`\n${session.location.city}${session.location.state ? `, ${session.location.state}` : ''}`}
                                        {session.location.postalCode ? ` ${session.location.postalCode}` : ''}
                                        {`\n${session.location.country}`}
                                    </Text>
                                </View>
                            )}
                        </View>
                    </View>

                    {/* Notes */}
                    <View style={styles.section}>
                        <View style={styles.sectionHeader}>
                            <Text style={styles.sectionTitle}>Notes</Text>
                            {!editingNotes && (
                                <TouchableOpacity onPress={() => {
                                    setClientNotes(session.notes?.client || "");
                                    setEditingNotes(true);
                                }}>
                                    <FontAwesome5 name="edit" size={16} color="#666" />
                                </TouchableOpacity>
                            )}
                        </View>

                        {editingNotes ? (
                            <View style={styles.notesEditContainer}>
                                <TextInput
                                    style={styles.notesInput}
                                    value={clientNotes}
                                    onChangeText={setClientNotes}
                                    placeholder="Add your notes for this session..."
                                    multiline
                                    autoFocus
                                />
                                <View style={styles.notesActions}>
                                    <TouchableOpacity
                                        style={[styles.button, styles.secondaryButton]}
                                        onPress={() => setEditingNotes(false)}
                                    >
                                        <Text style={styles.secondaryButtonText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.button, styles.primaryButton]}
                                        onPress={handleSaveNotes}
                                        disabled={updatingNotes}
                                    >
                                        {updatingNotes ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <Text style={styles.primaryButtonText}>Save</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ) : (
                            <View style={styles.card}>
                                {session.notes?.trainer && (
                                    <View style={styles.noteItem}>
                                        <Text style={styles.noteLabel}>{"Trainer's"} Notes</Text>
                                        <Text style={styles.noteText}>{session.notes.trainer}</Text>
                                    </View>
                                )}
                                {session.notes?.client ? (
                                    <View style={styles.noteItem}>
                                        <Text style={styles.noteLabel}>Your Notes</Text>
                                        <Text style={styles.noteText}>{session.notes.client}</Text>
                                    </View>
                                ) : (
                                    <Text style={styles.emptyNotes}>No notes added yet</Text>
                                )}
                            </View>
                        )}
                    </View>

                    {/* Cancel Button */}
                    {canCancel() && (
                        <View style={styles.section}>
                            <TouchableOpacity
                                style={[styles.button, styles.cancelButton]}
                                onPress={handleCancelSession}
                                disabled={cancelling}
                            >
                                {cancelling ? (
                                    <ActivityIndicator size="small" color="#C62828" />
                                ) : (
                                    <>
                                        <FontAwesome5 name="times-circle" size={16} color="#C62828" />
                                        <Text style={styles.cancelButtonText}>Cancel Session</Text>
                                    </>
                                )}
                            </TouchableOpacity>
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
    errorContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#fff",
        padding: 24,
    },
    errorText: { fontSize: 18, color: "#666", marginBottom: 16 },

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

    section: { padding: 16 },
    sectionTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: "#999",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 10,
    },
    sectionHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
    },

    card: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
        borderWidth: 2,
    },
    sessionId: {
        fontSize: 13,
        color: "#666",
        fontWeight: "600",
    },
    statusBadge: {
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    statusText: {
        fontSize: 12,
        fontWeight: "700",
        color: "#fff",
        textTransform: "uppercase",
    },

    trainerCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderColor: "#eee",
    },
    trainerAvatar: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: "#f0f0f0",
    },
    trainerAvatarPlaceholder: {
        width: 48,
        height: 48,
        borderRadius: 14,
        backgroundColor: "#f0f0f0",
        alignItems: "center",
        justifyContent: "center",
    },
    trainerName: {
        fontSize: 16,
        fontWeight: "700",
        color: "#111",
    },
    trainerEmail: {
        fontSize: 13,
        color: "#666",
        marginTop: 2,
    },

    dateTimeRow: {
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 8,
    },
    dateText: {
        fontSize: 15,
        color: "#333",
        fontWeight: "500",
    },
    timeText: {
        fontSize: 15,
        color: "#333",
        fontWeight: "500",
    },

    detailRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingVertical: 8,
    },
    detailLabel: {
        fontSize: 14,
        color: "#666",
        fontWeight: "600",
    },
    typeTag: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        backgroundColor: "#f5f5f5",
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 8,
    },
    typeText: {
        fontSize: 13,
        color: "#333",
        fontWeight: "600",
    },
    linkButton: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
    },
    linkText: {
        fontSize: 14,
        color: "#007AFF",
        fontWeight: "600",
    },
    locationContainer: {
        paddingTop: 8,
    },
    locationText: {
        fontSize: 14,
        color: "#333",
        lineHeight: 20,
        marginTop: 8,
    },

    notesEditContainer: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: "#eee",
    },
    notesInput: {
        fontSize: 14,
        color: "#333",
        minHeight: 100,
        textAlignVertical: "top",
        marginBottom: 12,
    },
    notesActions: {
        flexDirection: "row",
        gap: 12,
        justifyContent: "flex-end",
    },
    noteItem: {
        marginBottom: 16,
    },
    noteLabel: {
        fontSize: 13,
        fontWeight: "700",
        color: "#666",
        marginBottom: 6,
    },
    noteText: {
        fontSize: 14,
        color: "#333",
        lineHeight: 20,
    },
    emptyNotes: {
        fontSize: 14,
        color: "#999",
        fontStyle: "italic",
    },

    button: {
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        paddingHorizontal: 20,
        borderRadius: 10,
    },
    primaryButton: {
        backgroundColor: "#111",
    },
    primaryButtonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700",
    },
    secondaryButton: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#ddd",
    },
    secondaryButtonText: {
        color: "#666",
        fontSize: 14,
        fontWeight: "600",
    },
    cancelButton: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#C62828",
    },
    cancelButtonText: {
        color: "#C62828",
        fontSize: 14,
        fontWeight: "700",
    },
    backButton: {
        backgroundColor: "#111",
        paddingVertical: 12,
        paddingHorizontal: 24,
        borderRadius: 10,
    },
    backButtonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700",
    },
    statusCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 16,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        borderWidth: 1,
        borderColor: "#eee",
    },
});

