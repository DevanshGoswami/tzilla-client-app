import React, { useEffect, useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Linking, Platform, StyleSheet, TextInput } from "react-native";
import { Feather, FontAwesome5 } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQuery } from "@apollo/client/react";
import {
    Avatar,
    Badge,
    Box,
    Button,
    Divider,
    HStack,
    Icon,
    Pressable,
    ScrollView,
    Spinner,
    Text,
    VStack,
} from "native-base";
import { LinearGradient } from "expo-linear-gradient";
import Screen from "@/components/ui/Screen";
import { GET_SESSION_BY_ID, GET_TRAINERS_FOR_CLIENT } from "@/graphql/queries";
import { CANCEL_SESSION, UPDATE_SESSION_CLIENT_NOTES } from "@/graphql/mutations";
import { Session, SessionStatus } from "@/graphql/types";

const BASE_BG = "#050111";
const BORDER_COLOR = "rgba(124,58,237,0.3)";
const SOFT_TEXT = "#A5A1C2";
const ACCENT = "#7C3AED";
const ACCENT_LIGHT = "#C4B5FD";

type SessionDetailsParams = {
    sessionId: string;
    trainerId?: string;
    trainerName?: string;
};

type TrainerPreview = {
    _id?: string;
    name?: string;
    email?: string;
    avatarUrl?: string;
};

const STATUS_META: Record<SessionStatus | "DEFAULT", { label: string; color: string; bg: string }> = {
    CONFIRMED: { label: "Confirmed", color: "#34D399", bg: "rgba(52,211,153,0.15)" },
    PENDING: { label: "Pending", color: "#FBBF24", bg: "rgba(251,191,36,0.15)" },
    COMPLETED: { label: "Completed", color: "#A5A1C2", bg: "rgba(165,161,194,0.18)" },
    CANCELLED: { label: "Cancelled", color: "#F87171", bg: "rgba(248,113,113,0.15)" },
    NO_SHOW: { label: "No show", color: "#F87171", bg: "rgba(248,113,113,0.15)" },
    DEFAULT: { label: "Scheduled", color: ACCENT_LIGHT, bg: "rgba(124,58,237,0.18)" },
};

const getStatusMeta = (status?: SessionStatus | null) => STATUS_META[status ?? "DEFAULT"];

const formatDateTime = (isoDate: string) => {
    const dateObj = new Date(isoDate);
    return {
        date: dateObj.toLocaleDateString(undefined, {
            weekday: "long",
            year: "numeric",
            month: "long",
            day: "numeric",
        }),
        time: dateObj.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        }),
    };
};

const getDurationMinutes = (start: string, end: string) => {
    const startDate = new Date(start);
    const endDate = new Date(end);
    return Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000));
};

const formatLocation = (location?: Session["location"]) => {
    if (!location) {
        return null;
    }

    const cityState = [location.city, location.state].filter(Boolean).join(", ");
    return [
        location.addressLine1,
        location.addressLine2,
        cityState,
        location.postalCode,
        location.country,
    ]
        .filter(Boolean)
        .join("\n");
};

export default function SessionDetailsScreen() {
    const params = useLocalSearchParams<SessionDetailsParams>();

    const [editingNotes, setEditingNotes] = useState(false);
    const [clientNotes, setClientNotes] = useState("");

    const { data: sessionData, loading: sessionLoading, refetch } = useQuery<{ sessionById: Session }>(
        GET_SESSION_BY_ID,
        {
            variables: { id: params.sessionId },
            skip: !params.sessionId,
        },
    );

    const { data: trainersData } = useQuery(GET_TRAINERS_FOR_CLIENT, {
        variables: { pagination: { pageNumber: 1, pageSize: 50 } },
        skip: !params.sessionId,
    });

    const [updateNotes, { loading: updatingNotes }] = useMutation(UPDATE_SESSION_CLIENT_NOTES);
    const [cancelSession, { loading: cancelling }] = useMutation(CANCEL_SESSION);

    const session = sessionData?.sessionById;
    const trainerResults = trainersData?.getTrainersForClient;
    const trainers = useMemo<TrainerPreview[]>(
        () => (trainerResults ?? []) as TrainerPreview[],
        [trainerResults],
    );

    const trainer = useMemo(() => {
        if (!session) {
            return {
                _id: params.trainerId,
                name: params.trainerName,
            };
        }

        return (
            trainers.find((t) => t._id === session.trainerId) ?? {
                _id: session.trainerId,
                name: params.trainerName,
            }
        );
    }, [params.trainerId, params.trainerName, session, trainers]);

    useEffect(() => {
        if (!editingNotes && session?.notes?.client) {
            setClientNotes(session.notes.client);
        }
    }, [editingNotes, session?.notes?.client]);

    const startDate = session ? formatDateTime(session.scheduledStart) : null;
    const endDate = session ? formatDateTime(session.scheduledEnd) : null;
    const duration = session ? getDurationMinutes(session.scheduledStart, session.scheduledEnd) : null;
    const statusMeta = getStatusMeta(session?.status);
    const locationText = formatLocation(session?.location);

    const canCancelSession = useMemo(() => {
        if (!session) {
            return false;
        }

        const sessionDate = new Date(session.scheduledStart);
        const now = new Date();
        return sessionDate > now && !["CANCELLED", "COMPLETED"].includes(session.status ?? "");
    }, [session]);

    const handleSaveNotes = async () => {
        if (!session?._id) {
            return;
        }

        try {
            await updateNotes({
                variables: {
                    input: {
                        sessionId: session._id,
                        notes: clientNotes,
                    },
                },
            });
            setEditingNotes(false);
            Alert.alert("Success", "Notes updated successfully");
            refetch();
        } catch (error) {
            console.error("Failed to update notes", error);
            Alert.alert("Error", "Failed to update notes");
        }
    };

    const handleCancelSession = () => {
        if (!session?._id) {
            return;
        }

        Alert.alert("Cancel Session", "Are you sure you want to cancel this session?", [
            { text: "No", style: "cancel" },
            {
                text: "Yes, Cancel",
                style: "destructive",
                onPress: async () => {
                    try {
                        await cancelSession({
                            variables: {
                                sessionId: session._id,
                                reason: "Cancelled by client",
                            },
                        });
                        Alert.alert("Success", "Session cancelled successfully");
                        refetch();
                    } catch (error) {
                        console.error("Failed to cancel session", error);
                        Alert.alert("Error", "Failed to cancel session");
                    }
                },
            },
        ]);
    };

    if (sessionLoading) {
        return (
            <Screen withHeader backgroundColor={BASE_BG}>
                <Box flex={1} bg={BASE_BG} alignItems="center" justifyContent="center" px={10}>
                    <Spinner size="lg" color={ACCENT_LIGHT} />
                    <Text color={SOFT_TEXT} mt={4} textAlign="center">
                        Loading session details...
                    </Text>
                </Box>
            </Screen>
        );
    }

    if (!session) {
        return (
            <Screen withHeader backgroundColor={BASE_BG}>
                <Box flex={1} bg={BASE_BG} justifyContent="center" alignItems="center" px={8}>
                    <Text color="white" fontSize="lg" fontWeight="bold" textAlign="center">
                        Session not found
                    </Text>
                    <Button
                        mt={6}
                        onPress={() => router.back()}
                        variant="outline"
                        borderColor={ACCENT_LIGHT}
                        _text={{ color: ACCENT_LIGHT }}
                    >
                        Go back
                    </Button>
                </Box>
            </Screen>
        );
    }

    return (
        <Screen withHeader backgroundColor={BASE_BG}>
            <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                keyboardVerticalOffset={Platform.OS === "ios" ? 80 : 0}
            >
                <Box flex={1} bg={BASE_BG}>
                    <ScrollView
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 80 }}
                        keyboardShouldPersistTaps="handled"
                    >
                        <VStack flex={1} bg={BASE_BG} px={5} pt={6} space={8}>
                            <Box borderRadius="3xl" overflow="hidden" shadow={7}>
                                <LinearGradient
                                    colors={["#3B1E66", "#090313"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={{ padding: 24 }}
                                >
                                    <HStack justifyContent="space-between" alignItems="center">
                                        <Pressable onPress={() => router.back()} hitSlop={12}>
                                            <Icon as={Feather} name="arrow-left" color="white" size="lg" />
                                        </Pressable>
                                        <Text color="white" fontSize="lg" fontWeight="bold">
                                            Session Details
                                        </Text>
                                        <Pressable onPress={() => refetch()} hitSlop={12}>
                                            <Icon as={Feather} name="refresh-ccw" color="white" size="lg" />
                                        </Pressable>
                                    </HStack>
                                    <VStack space={3} mt={8}>
                                        <Badge alignSelf="flex-start" bg={statusMeta.bg} px={3} py={1} borderRadius="full">
                                            <Text color={statusMeta.color} fontWeight="bold" fontSize="xs">
                                                {statusMeta.label.toUpperCase()}
                                            </Text>
                                        </Badge>
                                        <Text color="white" fontSize="3xl" fontWeight="bold">
                                            #{session._id.slice(-6)}
                                        </Text>
                                        <Text color={SOFT_TEXT}>{startDate?.date}</Text>
                                        <HStack space={3} alignItems="center">
                                            <Icon as={Feather} name="clock" color={ACCENT_LIGHT} />
                                            <Text color="white" fontWeight="semibold">
                                                {startDate?.time} - {endDate?.time} · {duration} min
                                            </Text>
                                        </HStack>
                                    </VStack>
                                </LinearGradient>
                            </Box>

                            <VStack space={6}>
                                <SectionCard title="Trainer">
                                    <HStack space={4} alignItems="center">
                                        <Avatar
                                            size="md"
                                            source={trainer?.avatarUrl ? { uri: trainer.avatarUrl } : undefined}
                                            bg="rgba(124,58,237,0.4)"
                                        >
                                            <Icon as={FontAwesome5} name="user-tie" color="white" size="sm" />
                                        </Avatar>
                                        <VStack flex={1} space={1}>
                                            <Text color="white" fontWeight="bold">
                                                {trainer?.name || "Unknown trainer"}
                                            </Text>
                                            {trainer?.email ? (
                                                <Text color={SOFT_TEXT} fontSize="xs">
                                                    {trainer.email}
                                                </Text>
                                            ) : null}
                                        </VStack>
                                    </HStack>
                                </SectionCard>

                                <SectionCard title="Session">
                                    <VStack space={4}>
                                        <HStack alignItems="center" space={3}>
                                            <Icon as={FontAwesome5} name="calendar" color={ACCENT_LIGHT} size="sm" />
                                            <Text color="white" fontWeight="semibold">
                                                {startDate?.date}
                                            </Text>
                                        </HStack>
                                        <Divider bg="rgba(255,255,255,0.08)" />
                                        <HStack alignItems="center" justifyContent="space-between">
                                            <Text color={SOFT_TEXT}>Type</Text>
                                            <Badge bg="rgba(124,58,237,0.25)" borderRadius="full" px={3} py={1}>
                                                <HStack alignItems="center" space={2}>
                                                    <Icon
                                                        as={FontAwesome5}
                                                        name={session.type === "ONLINE" ? "video" : "map-marker-alt"}
                                                        color={ACCENT_LIGHT}
                                                        size="xs"
                                                    />
                                                    <Text color={ACCENT_LIGHT} fontWeight="bold" fontSize="xs">
                                                        {session.type === "ONLINE" ? "Online" : "In person"}
                                                    </Text>
                                                </HStack>
                                            </Badge>
                                        </HStack>
                                        {session.type === "ONLINE" && session.meetingLink ? (
                                            <Button
                                                mt={2}
                                                variant="outline"
                                                borderColor={ACCENT_LIGHT}
                                                _text={{ color: ACCENT_LIGHT, fontWeight: "bold" }}
                                                leftIcon={
                                                    <Icon
                                                        as={FontAwesome5}
                                                        name="external-link-alt"
                                                        color={ACCENT_LIGHT}
                                                        size="sm"
                                                    />
                                                }
                                                onPress={() => Linking.openURL(session.meetingLink!)}
                                            >
                                                Join meeting
                                            </Button>
                                        ) : null}
                                        {session.type === "IN_PERSON" && locationText ? (
                                            <VStack space={1} mt={2}>
                                                <Text color={SOFT_TEXT} fontSize="xs">
                                                    Location
                                                </Text>
                                                <Text color="white" fontWeight="medium">
                                                    {locationText}
                                                </Text>
                                            </VStack>
                                        ) : null}
                                    </VStack>
                                </SectionCard>

                                <SectionCard
                                    title="Notes"
                                    actionLabel={!editingNotes ? "Edit" : undefined}
                                    onAction={
                                        !editingNotes
                                            ? () => {
                                                  setClientNotes(session.notes?.client || "");
                                                  setEditingNotes(true);
                                              }
                                            : undefined
                                    }
                                >
                                    {editingNotes ? (
                                        <VStack space={3}>
                                            <Box
                                                borderWidth={1}
                                                borderColor={BORDER_COLOR}
                                                borderRadius="xl"
                                                bg="rgba(5,1,17,0.7)"
                                            >
                                                <TextInput
                                                    value={clientNotes}
                                                    onChangeText={setClientNotes}
                                                    placeholder="Add context for your trainer..."
                                                    placeholderTextColor={SOFT_TEXT}
                                                    multiline
                                                    autoFocus
                                                    style={styles.notesInput}
                                                />
                                            </Box>
                                            <HStack space={3}>
                                                <Button
                                                    flex={1}
                                                    variant="outline"
                                                    borderColor={ACCENT_LIGHT}
                                                    _text={{ color: ACCENT_LIGHT, fontWeight: "bold" }}
                                                    onPress={() => setEditingNotes(false)}
                                                >
                                                    Cancel
                                                </Button>
                                                <Button
                                                    flex={1}
                                                    bg={ACCENT}
                                                    _pressed={{ bg: "#5B21B6" }}
                                                    _text={{ fontWeight: "bold" }}
                                                    onPress={handleSaveNotes}
                                                    isLoading={updatingNotes}
                                                >
                                                    Save
                                                </Button>
                                            </HStack>
                                        </VStack>
                                    ) : (
                                        <VStack space={4}>
                                            {session.notes?.trainer ? (
                                                <NoteBubble label="Trainer notes" text={session.notes.trainer} />
                                            ) : null}
                                            {session.notes?.client ? (
                                                <NoteBubble label="Your notes" text={session.notes.client} />
                                            ) : (
                                                <Text color={SOFT_TEXT} fontSize="sm">
                                                    No notes added yet.
                                                </Text>
                                            )}
                                        </VStack>
                                    )}
                                </SectionCard>

                                {canCancelSession ? (
                                    <Button
                                        variant="outline"
                                        borderColor="rgba(248,113,113,0.5)"
                                        _text={{ color: "#F87171", fontWeight: "bold" }}
                                        leftIcon={<Icon as={FontAwesome5} name="times-circle" color="#F87171" />}
                                        onPress={handleCancelSession}
                                        isLoading={cancelling}
                                    >
                                        Cancel session
                                    </Button>
                                ) : null}
                            </VStack>
                        </VStack>
                    </ScrollView>
                </Box>
            </KeyboardAvoidingView>
        </Screen>
    );
}

type SectionCardProps = {
    title: string;
    children: React.ReactNode;
    actionLabel?: string;
    onAction?: () => void;
};

const SectionCard = ({ title, children, actionLabel, onAction }: SectionCardProps) => (
    <Box borderRadius="2xl" borderWidth={1} borderColor={BORDER_COLOR} bg="rgba(12,8,33,0.9)" p={5}>
        <HStack justifyContent="space-between" alignItems="center" mb={3}>
            <Text color={SOFT_TEXT} fontSize="xs" fontWeight="bold" textTransform="uppercase" letterSpacing="0.5">
                {title}
            </Text>
            {actionLabel && onAction ? (
                <Pressable onPress={onAction} hitSlop={12}>
                    <Text color={ACCENT_LIGHT} fontSize="xs" fontWeight="bold">
                        {actionLabel}
                    </Text>
                </Pressable>
            ) : null}
        </HStack>
        {children}
    </Box>
);

const NoteBubble = ({ label, text }: { label: string; text: string }) => (
    <Box
        bg="rgba(255,255,255,0.04)"
        borderRadius="xl"
        p={4}
        borderWidth={1}
        borderColor="rgba(255,255,255,0.05)"
    >
        <Text color={SOFT_TEXT} fontSize="xs" fontWeight="bold" textTransform="uppercase">
            {label}
        </Text>
        <Text color="white" mt={2} lineHeight="lg">
            {text}
        </Text>
    </Box>
);

const styles = StyleSheet.create({
    notesInput: {
        minHeight: 140,
        padding: 16,
        color: "#FFFFFF",
        fontSize: 14,
        textAlignVertical: "top",
    },
});
