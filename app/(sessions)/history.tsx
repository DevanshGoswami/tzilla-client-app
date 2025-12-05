import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl } from "react-native";
import { useQuery } from "@apollo/client/react";
import { router } from "expo-router";
import {
    Avatar,
    Badge,
    Box,
    Button,
    HStack,
    Icon,
    Pressable,
    ScrollView,
    Spinner,
    Text,
    VStack,
} from "native-base";
import { Feather, FontAwesome5 } from "@expo/vector-icons";
import { GET_ME, GET_SESSIONS_FOR_CLIENT, GET_TRAINERS_FOR_CLIENT } from "@/graphql/queries";
import { Session, SessionStatus } from "@/graphql/types";
import Screen from "@/components/ui/Screen";

const BASE_BG = "#050111";
const HERO_BG = "#140B2D";
const CARD_BG = "#0C0A1F";
const BORDER_COLOR = "rgba(124,58,237,0.25)";
const SOFT_TEXT = "#A5A1C2";
const ACCENT_PURPLE = "#7C3AED";
const ACCENT_PURPLE_LIGHT = "#C4B5FD";

const FILTERS = [
    { key: "all", label: "All" },
    { key: "cancelled", label: "Cancelled" },
    { key: "no_show", label: "No show" },
] as const;

const STATUS_STYLES: Record<SessionStatus | "DEFAULT", { bg: string; color: string; label: string }> = {
    CONFIRMED: { bg: ACCENT_PURPLE, color: "white", label: "Completed" },
    PENDING: { bg: "#FBBF24", color: "#1F2937", label: "Pending" },
    COMPLETED: { bg: "#4C1D95", color: "white", label: "Completed" },
    CANCELLED: { bg: "#DC2626", color: "white", label: "Cancelled" },
    NO_SHOW: { bg: "#DC2626", color: "white", label: "No show" },
    DEFAULT: { bg: "#312E81", color: "white", label: "Scheduled" },
};

const formatDate = (dateString: string) => {
    const dateObj = new Date(dateString);
    return dateObj.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
    });
};

const formatTimeRange = (start: string, end: string) => {
    const startObj = new Date(start);
    const endObj = new Date(end);
    const startTime = startObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const endTime = endObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    return `${startTime} – ${endTime}`;
};

export default function SessionHistoryScreen() {
    const [filter, setFilter] = useState<"all" | "cancelled" | "no_show">("all");
    const [refreshing, setRefreshing] = useState(false);

    const { data: meData, loading: meLoading } = useQuery(GET_ME);
    // @ts-ignore
    const clientId = meData?.user?._id;

    const {
        data: sessionsData,
        loading: sessionsLoading,
        refetch: refetchSessions,
    } = useQuery<{ sessionsForClient: Session[] }>(GET_SESSIONS_FOR_CLIENT, {
        variables: {
            clientId: clientId || "",
            pagination: { pageNumber: 1, pageSize: 150 },
        },
        skip: !clientId,
        notifyOnNetworkStatusChange: true,
    });

    const { data: trainersData } = useQuery(GET_TRAINERS_FOR_CLIENT, {
        variables: { pagination: { pageNumber: 1, pageSize: 100 } },
    });

    // @ts-ignore
    const trainers = trainersData?.getTrainersForClient ?? [];

    const sessions = sessionsData?.sessionsForClient ?? [];

    const historySessions = useMemo(() => {
        const filtered = sessions.filter((session) => {
            if (filter === "cancelled") return session.status === "CANCELLED";
            if (filter === "no_show") return session.status === "NO_SHOW";
            return true;
        });
        return filtered.sort(
            (a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime()
        );
    }, [sessions, filter]);

    const getTrainerForSession = useCallback(
        (trainerId: string) => trainers.find((t: any) => t._id === trainerId),
        [trainers]
    );

    const handleRefresh = useCallback(async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            await refetchSessions();
        } finally {
            setRefreshing(false);
        }
    }, [refreshing, refetchSessions]);

    const totalCompleted = useMemo(
        () => sessions.filter((s) => s.status === "CONFIRMED" || s.status === "COMPLETED").length,
        [sessions]
    );
    const totalCancelled = useMemo(
        () => sessions.filter((s) => s.status === "CANCELLED").length,
        [sessions]
    );

    if (meLoading || sessionsLoading) {
        return (
            <Screen withHeader backgroundColor={BASE_BG}>
                <Box flex={1} bg={BASE_BG} alignItems="center" justifyContent="center">
                    <Spinner size="lg" color={ACCENT_PURPLE_LIGHT} />
                    <Text color={SOFT_TEXT} mt={4}>
                        Pulling your history...
                    </Text>
                </Box>
            </Screen>
        );
    }

    return (
        <Screen withHeader backgroundColor={BASE_BG}>
            <Box flex={1} bg={BASE_BG}>
                <ScrollView
                    contentContainerStyle={{ paddingBottom: 40 }}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />
                    }
                >
                    <Box px={5} pt={8} pb={6} bg={HERO_BG} borderBottomLeftRadius="3xl" borderBottomRightRadius="3xl">
                        <HStack alignItems="center" justifyContent="space-between">
                            <Pressable onPress={() => router.back()}>
                                <Icon as={Feather} name="arrow-left" color="white" size="lg" />
                            </Pressable>
                            <Text color="white" fontSize="lg" fontWeight="bold">
                                History
                            </Text>
                            <Box w={8} />
                        </HStack>
                        <Text color={SOFT_TEXT} fontSize="xs" textTransform="uppercase" letterSpacing={1} mt={6}>
                            Overview
                        </Text>
                        <Text color="white" fontSize="3xl" fontWeight="bold">
                            Your training ledger
                        </Text>
                        <Text color={SOFT_TEXT} mt={2}>
                            Track every session, cancellation, and milestone in one place.
                        </Text>
                        <HStack space={3} mt={6}>
                            <Box flex={1} borderRadius="2xl" borderWidth={1} borderColor={BORDER_COLOR} p={4} bg={CARD_BG}>
                                <Text color={SOFT_TEXT} fontSize="xs" textTransform="uppercase">
                                    Total logged
                                </Text>
                                <Text color="white" fontSize="2xl" fontWeight="bold" mt={1}>
                                    {sessions.length}
                                </Text>
                                <Text color={SOFT_TEXT} fontSize="xs">
                                    Sessions recorded
                                </Text>
                            </Box>
                            <Box flex={1} borderRadius="2xl" borderWidth={1} borderColor={BORDER_COLOR} p={4} bg={CARD_BG}>
                                <Text color={SOFT_TEXT} fontSize="xs" textTransform="uppercase">
                                    Completed
                                </Text>
                                <Text color="white" fontSize="2xl" fontWeight="bold" mt={1}>
                                    {totalCompleted}
                                </Text>
                                <Text color={SOFT_TEXT} fontSize="xs">
                                    Confirmed workouts
                                </Text>
                            </Box>
                            <Box flex={1} borderRadius="2xl" borderWidth={1} borderColor={BORDER_COLOR} p={4} bg={CARD_BG}>
                                <Text color={SOFT_TEXT} fontSize="xs" textTransform="uppercase">
                                    Cancelled
                                </Text>
                                <Text color="white" fontSize="2xl" fontWeight="bold" mt={1}>
                                    {totalCancelled}
                                </Text>
                                <Text color={SOFT_TEXT} fontSize="xs">
                                    Missed sessions
                                </Text>
                            </Box>
                        </HStack>
                    </Box>

                    <Box px={5} mt={8}>
                        <Text color={ACCENT_PURPLE_LIGHT} fontSize="lg" fontWeight="bold" mb={3}>
                            Filter
                        </Text>
                        <HStack space={2}>
                            {FILTERS.map((tab) => {
                                const active = filter === tab.key;
                                return (
                                    <Pressable key={tab.key} onPress={() => setFilter(tab.key)}>
                                        <Box
                                            px={4}
                                            py={2}
                                            borderRadius="full"
                                            borderWidth={1}
                                            borderColor={active ? ACCENT_PURPLE : BORDER_COLOR}
                                            bg={active ? "rgba(124,58,237,0.2)" : "transparent"}
                                        >
                                            <Text color={active ? ACCENT_PURPLE_LIGHT : SOFT_TEXT} fontWeight="bold">
                                                {tab.label}
                                            </Text>
                                        </Box>
                                    </Pressable>
                                );
                            })}
                        </HStack>
                    </Box>

                    <Box px={5} mt={8}>
                        <Text color={ACCENT_PURPLE_LIGHT} fontSize="lg" fontWeight="bold" mb={4}>
                            Timeline
                        </Text>
                        {historySessions.length === 0 ? (
                            <VStack
                                alignItems="center"
                                justifyContent="center"
                                py={12}
                                px={6}
                                borderRadius="2xl"
                                borderWidth={1}
                                borderColor={BORDER_COLOR}
                                bg={CARD_BG}
                                space={3}
                            >
                                <Icon as={FontAwesome5} name="history" size="xl" color={SOFT_TEXT} />
                                <Text color="white" fontWeight="bold">
                                    No sessions found
                                </Text>
                                <Text color={SOFT_TEXT} textAlign="center">
                                    {filter === "all"
                                        ? "Your completed sessions will appear here."
                                        : `No ${filter.replace("_", " ")} sessions yet.`}
                                </Text>
                            </VStack>
                        ) : (
                            <VStack space={4}>
                                {historySessions.map((session) => {
                                    const trainer = getTrainerForSession(session.trainerId);
                                    const statusToken =
                                        STATUS_STYLES[session.status as SessionStatus] ?? STATUS_STYLES.DEFAULT;

                                    return (
                                        <Pressable
                                            key={session._id}
                                            onPress={() =>
                                                router.push({
                                                    pathname: "/(sessions)/details/[sessionId]",
                                                    params: {
                                                        sessionId: session._id,
                                                        trainerId: session.trainerId,
                                                        trainerName: trainer?.name || trainer?.email || "Trainer",
                                                    },
                                                })
                                            }
                                        >
                                            <Box
                                                borderRadius="2xl"
                                                borderWidth={1}
                                                borderColor={BORDER_COLOR}
                                                bg={CARD_BG}
                                                p={4}
                                            >
                                                <HStack justifyContent="space-between" alignItems="center">
                                                    <VStack>
                                                        <Text color={SOFT_TEXT} fontSize="xs">
                                                            {formatDate(session.scheduledStart)}
                                                        </Text>
                                                        <Text color="white" fontSize="xl" fontWeight="bold">
                                                            {formatTimeRange(session.scheduledStart, session.scheduledEnd)}
                                                        </Text>
                                                    </VStack>
                                                    <Badge
                                                        bg={statusToken.bg}
                                                        _text={{ color: statusToken.color, fontWeight: "700", fontSize: "xs" }}
                                                        px={3}
                                                        py={1}
                                                        rounded="full"
                                                    >
                                                        {statusToken.label}
                                                    </Badge>
                                                </HStack>

                                                <HStack alignItems="center" space={3} mt={4}>
                                                    <Avatar
                                                        size="sm"
                                                        source={trainer?.avatarUrl ? { uri: trainer.avatarUrl } : undefined}
                                                        bg="rgba(124,58,237,0.25)"
                                                    >
                                                        <Icon as={FontAwesome5} name="user" size="xs" color="white" />
                                                    </Avatar>
                                                    <VStack flex={1}>
                                                        <Text color="white" fontWeight="bold">
                                                            {trainer?.name || trainer?.email || "Trainer"}
                                                        </Text>
                                                        <Text color={SOFT_TEXT} fontSize="xs">
                                                            {session.type === "ONLINE" ? "Online session" : "In person"}
                                                        </Text>
                                                    </VStack>
                                                    <Icon as={Feather} name="arrow-right" color={SOFT_TEXT} />
                                                </HStack>
                                            </Box>
                                        </Pressable>
                                    );
                                })}
                            </VStack>
                        )}
                    </Box>
                </ScrollView>
            </Box>
        </Screen>
    );
}
