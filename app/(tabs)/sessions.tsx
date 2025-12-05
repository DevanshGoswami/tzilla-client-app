import React, { useCallback, useMemo, useState } from "react";
import { Alert, RefreshControl } from "react-native";
import { useQuery } from "@apollo/client/react";
import { router } from "expo-router";
import {
    Actionsheet,
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
    ZStack,
    useDisclose,
} from "native-base";
import { Feather, FontAwesome5 } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import Screen from "@/components/ui/Screen";
import {
    GET_ME,
    GET_TRAINERS_FOR_CLIENT,
    GET_SESSIONS_FOR_CLIENT,
} from "@/graphql/queries";
import { Session, SessionStatus } from "@/graphql/types";

type Trainer = {
    _id: string;
    name: string;
    email: string;
    avatarUrl?: string | null;
    contact?: {
        addressLine1?: string | null;
        addressLine2?: string | null;
        city?: string | null;
        state?: string | null;
        country?: string | null;
        postalCode?: string | null;
    } | null;
};

type TrainersQueryData = {
    getTrainersForClient: Trainer[];
};

const BASE_BG = "#050111";
const BORDER_COLOR = "rgba(124,58,237,0.25)";
const SOFT_TEXT = "#A5A1C2";
const ACCENT = "#7C3AED";
const ACCENT_LIGHT = "#C4B5FD";
const CARD_BG = "rgba(8,4,24,0.95)";
const HERO_GRADIENT = ["#5B21B6", "#271447", "#090215"];
const QUICK_CARD_BG = "rgba(255,255,255,0.03)";
const HERO_ORBIT = "rgba(236,72,153,0.35)";
const HERO_WAVE = "rgba(14,165,233,0.2)";
const SECONDARY_ACCENT = "#22D3EE";

const STATUS_STYLES: Record<SessionStatus | "DEFAULT", { bg: string; color: string; label: string }> = {
    CONFIRMED: { bg: ACCENT, color: "white", label: "Confirmed" },
    PENDING: { bg: "#FACC15", color: "#1C1917", label: "Pending" },
    COMPLETED: { bg: "#4C1D95", color: "white", label: "Completed" },
    CANCELLED: { bg: "#DC2626", color: "white", label: "Cancelled" },
    NO_SHOW: { bg: "#DC2626", color: "white", label: "No show" },
    DEFAULT: { bg: "#312E81", color: "white", label: "Scheduled" },
};

const TIMELINE_GRADIENTS: Record<SessionStatus | "DEFAULT", [string, string]> = {
    CONFIRMED: ["rgba(124,58,237,0.45)", "rgba(15,6,38,0.85)"],
    PENDING: ["rgba(250,204,21,0.35)", "rgba(45,20,8,0.85)"],
    COMPLETED: ["rgba(79,70,229,0.55)", "rgba(9,5,24,0.9)"],
    CANCELLED: ["rgba(239,68,68,0.35)", "rgba(49,13,24,0.85)"],
    NO_SHOW: ["rgba(239,68,68,0.35)", "rgba(49,13,24,0.85)"],
    DEFAULT: ["rgba(59,7,100,0.45)", "rgba(10,6,23,0.9)"],
};

const SectionHeader = ({
    title,
    actionLabel,
    onAction,
}: {
    title: string;
    actionLabel?: React.ReactNode;
    onAction?: () => void;
}) => (
    <HStack alignItems="center" justifyContent="space-between" mb={4}>
        <Text color="white" fontSize="lg" fontWeight="bold">
            {title}
        </Text>
        {actionLabel && onAction ? (
            <Pressable onPress={onAction} hitSlop={12}>
                {typeof actionLabel === "string" ? (
                    <Text color={ACCENT_LIGHT} fontSize="xs" fontWeight="bold">
                        {actionLabel}
                    </Text>
                ) : (
                    actionLabel
                )}
            </Pressable>
        ) : null}
    </HStack>
);

const Glass = ({ children }: { children: React.ReactNode }) => (
    <Box borderRadius="2xl" borderWidth={1} borderColor={BORDER_COLOR} bg={CARD_BG} p={5}>
        {children}
    </Box>
);

export default function SessionsScreen() {
    const [pageNumber, setPageNumber] = useState(1);
    const [loadingMore, setLoadingMore] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const pageSize = 20;
    const { isOpen: trainerSheetOpen, onOpen: openTrainerSheet, onClose: closeTrainerSheet } = useDisclose();

    const { data: meData, loading: meLoading } = useQuery(GET_ME);
    // @ts-ignore
    const clientId = meData?.user?._id;

    const {
        data,
        loading,
        refetch,
        fetchMore,
    } = useQuery<TrainersQueryData>(GET_TRAINERS_FOR_CLIENT, {
        variables: { pagination: { pageNumber, pageSize } },
        notifyOnNetworkStatusChange: true,
    });

    const {
        data: sessionsData,
        loading: sessionsLoading,
        refetch: refetchSessions,
    } = useQuery<{ sessionsForClient: Session[] }>(GET_SESSIONS_FOR_CLIENT, {
        variables: { clientId: clientId || "", pagination: { pageNumber: 1, pageSize: 80 } },
        skip: !clientId,
        notifyOnNetworkStatusChange: true,
    });

    const trainers = useMemo(() => data?.getTrainersForClient ?? [], [data?.getTrainersForClient]);
    const hasMore = trainers.length >= pageNumber * pageSize;
    const firstName = useMemo(() => meData?.user?.name?.split(" ")[0] ?? "Athlete", [meData?.user?.name]);

    const upcomingSessions = useMemo(() => {
        const sessions = sessionsData?.sessionsForClient ?? [];
        const now = new Date();
        return sessions
            .filter((session) => {
                const start = new Date(session.scheduledStart);
                return start > now && session.status !== "CANCELLED";
            })
            .sort(
                (a, b) =>
                    new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime()
            )
            .slice(0, 5);
    }, [sessionsData]);

    const nextSession = upcomingSessions[0];
    const totalSessionsCount = useMemo(() => sessionsData?.sessionsForClient?.length ?? 0, [sessionsData]);
    const recentSessions = useMemo(() => {
        const sessions = sessionsData?.sessionsForClient ?? [];
        const now = new Date();
        return sessions
            .filter((session) => new Date(session.scheduledStart) <= now)
            .sort((a, b) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime())
            .slice(0, 3);
    }, [sessionsData]);
    const buildTrainerParams = useCallback(
        (trainer: Trainer) => ({
            trainerId: trainer._id,
            trainerName: trainer.name || "",
            trainerEmail: trainer.email,
            avatarUrl: trainer.avatarUrl || "",
            addressLine1: trainer.contact?.addressLine1 ?? "",
            addressLine2: trainer.contact?.addressLine2 ?? "",
            city: trainer.contact?.city ?? "",
            state: trainer.contact?.state ?? "",
            country: trainer.contact?.country ?? "",
            postalCode: trainer.contact?.postalCode ?? "",
        }),
        []
    );
    const handleBookPress = useCallback(() => {
        if (!trainers.length) {
            router.push("/(trainers)/view-all");
            return;
        }
        openTrainerSheet();
    }, [trainers.length, openTrainerSheet]);

    const handleTrainerSelection = useCallback(
        (trainer: Trainer) => {
            closeTrainerSheet();
            router.push({
                pathname: "/(sessions)/[trainerId]",
                params: buildTrainerParams(trainer),
            });
        },
        [closeTrainerSheet, buildTrainerParams]
    );

    const quickActions = useMemo(
        () => [
            {
                icon: "calendar",
                label: trainers.length ? "Book session" : "Find trainer",
                helper: trainers.length ? "Lock in your next slot" : "Start with a coach",
                onPress: handleBookPress,
                gradient: ["#C026D3", "#7C3AED"],
            },
            {
                icon: "search",
                label: "Explore trainers",
                helper: "Browse the marketplace",
                onPress: () => router.push("/(trainers)/view-all"),
                gradient: ["#0EA5E9", "#0B1120"],
            },
        ],
        [trainers.length, handleBookPress]
    );

    const getTrainerForSession = useCallback(
        (trainerId: string) => trainers.find((t) => t._id === trainerId),
        [trainers]
    );
    const nextSessionCoach = useMemo(() => {
        if (!nextSession) return null;
        return getTrainerForSession(nextSession.trainerId) ?? null;
    }, [nextSession, getTrainerForSession]);

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
        } catch {
            Alert.alert("Error", "Could not load more trainers.");
        } finally {
            setLoadingMore(false);
        }
    };

    const handleRefresh = useCallback(async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            const tasks = [refetch()];
            if (clientId) tasks.push(refetchSessions());
            await Promise.all(tasks);
        } catch {
            Alert.alert("Refresh failed", "Please try again.");
        } finally {
            setRefreshing(false);
        }
    }, [refreshing, refetch, refetchSessions, clientId]);

    const heroSnapshot = useMemo(
        () => [
            {
                label: "Trainers connected",
                value: trainers.length ? `${trainers.length}` : "0",
                helper: trainers.length ? "Mentors linked to your profile" : "Add a coach to begin",
                icon: "users",
                gradient: ["rgba(99,102,241,0.4)", "rgba(49,46,129,0.6)"],
            },
            {
                label: "Sessions booked",
                value: totalSessionsCount ? `${totalSessionsCount}` : "0",
                helper: totalSessionsCount ? "Lifetime coach-led sessions" : "Lock in your first block",
                icon: "calendar",
                gradient: ["rgba(236,72,153,0.4)", "rgba(124,58,237,0.6)"],
            },
        ],
        [trainers.length, totalSessionsCount]
    );

    const formatSessionDay = useCallback((isoDate: string) => {
        const date = new Date(isoDate);
        return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    }, []);

    const formatSessionTimeRange = useCallback((session: Session) => {
        const start = new Date(session.scheduledStart);
        const end = new Date(session.scheduledEnd);
        return `${start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - ${end.toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        })}`;
    }, []);

    const formatCountdown = useCallback((isoDate: string) => {
        const target = new Date(isoDate).getTime();
        if (!Number.isFinite(target)) return "";
        const diff = target - Date.now();
        if (diff <= 0) return "Now";
        const hours = diff / 36e5;
        if (hours < 1) return "<1h out";
        if (hours < 24) return `${Math.round(hours)}h out`;
        const days = Math.round(diff / 86400000);
        return `${days}d out`;
    }, []);

    if (meLoading || (loading && !data && trainers.length === 0 && !sessionsData) || sessionsLoading) {
        return (
            <Screen withHeader backgroundColor={BASE_BG}>
                <Box flex={1} bg={BASE_BG} alignItems="center" justifyContent="center" px={10}>
                    <Spinner size="lg" color={ACCENT_LIGHT} />
                    <Text color={SOFT_TEXT} mt={4} textAlign="center">
                        Gathering your sessions...
                    </Text>
                </Box>
            </Screen>
        );
    }

    return (
        <Screen withHeader backgroundColor={BASE_BG}>
            <ScrollView
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />}
                contentContainerStyle={{ paddingBottom: 80 }}
            >
                <Box bg={BASE_BG} px={5} pt={6}>
                    <VStack space={6}>
                        <VStack space={1}>
                            <Text color="white" fontSize="3xl" fontWeight="bold">
                                Sessions
                            </Text>
                            <Text color={SOFT_TEXT} fontSize="sm">
                                Command your coaching pipeline, track readiness, and elevate every rep.
                            </Text>
                        </VStack>

                        <ZStack borderRadius="3xl" overflow="hidden" shadow={9}>
                            <LinearGradient colors={HERO_GRADIENT} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 28 }}>
                                <Box position="absolute" right={-70} top={-40} w="72" h="72" bg={HERO_ORBIT} borderRadius="full" opacity={0.45} />
                                <Box position="absolute" left={-30} bottom={-30} w="56" h="56" bg={HERO_WAVE} borderRadius="full" opacity={0.35} />
                                <VStack space={6}>
                                    <VStack space={3}>
                                        <Badge bg="rgba(0,0,0,0.35)" borderRadius="full" px={3} py={1} alignSelf="flex-start">
                                            <Text color="white" fontSize="xs" fontWeight="bold">
                                                Elite session control
                                            </Text>
                                        </Badge>
                                        <Text color="white" fontSize="2xl" fontWeight="bold">
                                            Hi {firstName}, this is your session command center
                                        </Text>
                                        <Text color="rgba(255,255,255,0.85)" fontSize="sm">
                                            {nextSession
                                                ? "You're locked in. Review the timeline, share notes, or upgrade the cadence."
                                                : "No sessions on deck. Book a slot and keep your training arc trending upward."}
                                        </Text>
                                    </VStack>
                                    <HStack space={3} flexWrap="wrap">
                                        {heroSnapshot.map((snapshot) => (
                                            <LinearGradient
                                                key={snapshot.label}
                                                colors={snapshot.gradient as [string, string]}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={{
                                                    borderRadius: 24,
                                                    padding: 18,
                                                    flexBasis: "48%",
                                                }}
                                            >
                                                <VStack space={3}>
                                                    <HStack space={3} alignItems="center">
                                                        <Box p={2} borderRadius="full" bg="rgba(0,0,0,0.25)">
                                                            <Icon as={Feather} name={snapshot.icon as any} color="white" size="sm" />
                                                        </Box>
                                                        <VStack>
                                                            <Text color="rgba(255,255,255,0.75)" fontSize="xs">
                                                                {snapshot.label}
                                                            </Text>
                                                            <Text color="white" fontSize="2xl" fontWeight="bold">
                                                                {snapshot.value}
                                                            </Text>
                                                        </VStack>
                                                    </HStack>
                                                    <Text color="rgba(255,255,255,0.85)" fontSize="xs">
                                                        {snapshot.helper}
                                                    </Text>
                                                </VStack>
                                            </LinearGradient>
                                        ))}
                                    </HStack>
                                    <Box borderRadius="2xl" borderWidth={1} borderColor="rgba(255,255,255,0.2)" overflow="hidden">
                                        <LinearGradient colors={["rgba(255,255,255,0.1)", "rgba(7,2,19,0.85)"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 20 }}>
                                            {nextSession ? (
                                                <HStack space={4} alignItems="center">
                                                    <Box borderRadius="full" borderWidth={1} borderColor="rgba(255,255,255,0.3)" p={3}>
                                                        <Icon as={Feather} name="zap" color={ACCENT_LIGHT} size="sm" />
                                                    </Box>
                                                    <VStack flex={1} space={1}>
                                                        <Text color="rgba(255,255,255,0.7)" fontSize="xs">
                                                            Next collaboration
                                                        </Text>
                                                        <Text color="white" fontSize="lg" fontWeight="bold">
                                                            {formatSessionDay(nextSession.scheduledStart)} · {formatSessionTimeRange(nextSession)}
                                                        </Text>
                                                        <Text color={SOFT_TEXT} fontSize="xs">
                                                            with {nextSessionCoach?.name || nextSessionCoach?.email || "your coach"}
                                                        </Text>
                                                    </VStack>
                                                    <Button
                                                        size="sm"
                                                        borderRadius="full"
                                                        variant="outline"
                                                        borderColor="rgba(255,255,255,0.6)"
                                                        _text={{ color: "white", fontWeight: "bold" }}
                                                        onPress={() =>
                                                            router.push({
                                                                pathname: "/(sessions)/details/[sessionId]",
                                                                params: { sessionId: nextSession._id },
                                                            })
                                                        }
                                                    >
                                                        Prep
                                                    </Button>
                                                </HStack>
                                            ) : (
                                                <HStack alignItems="center" justifyContent="space-between">
                                                    <VStack flex={1} mr={6}>
                                                        <Text color="white" fontWeight="bold" fontSize="lg">
                                                            Your board is clear
                                                        </Text>
                                                        <Text color="rgba(255,255,255,0.7)" fontSize="sm">
                                                            Choose a coach, add notes, and design a standout training week.
                                                        </Text>
                                                    </VStack>
                                                    <Button
                                                        variant="solid"
                                                        borderRadius="full"
                                                        bg="white"
                                                        _text={{ color: "#130B2D", fontWeight: "bold" }}
                                                        _pressed={{ bg: "#F4F1FF" }}
                                                        onPress={handleBookPress}
                                                    >
                                                        Book
                                                    </Button>
                                                </HStack>
                                            )}
                                        </LinearGradient>
                                    </Box>
                                    <HStack space={3} flexWrap="wrap">
                                        <Button
                                            flex={1}
                                            bg="white"
                                            _text={{ color: "#1B1430", fontWeight: "bold" }}
                                            _pressed={{ bg: "#F4F1FF" }}
                                            borderRadius="full"
                                            onPress={handleBookPress}
                                        >
                                            {trainers.length ? "Plan next session" : "Find a trainer"}
                                        </Button>
                                        <Button
                                            flexBasis="40%"
                                            borderRadius="full"
                                            variant="outline"
                                            borderColor="rgba(255,255,255,0.4)"
                                            _text={{ color: "white", fontWeight: "bold" }}
                                            onPress={() => router.push("/(sessions)/history")}
                                        >
                                            Review week
                                        </Button>
                                    </HStack>
                                </VStack>
                            </LinearGradient>
                        </ZStack>

                        <Glass>
                            <SectionHeader title="Command center" />
                            <HStack space={3}>
                                {quickActions.map((action) => (
                                    <Pressable key={action.label} flex={1} onPress={action.onPress}>
                                        <LinearGradient colors={action.gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, padding: 18, height: 150 }}>
                                            <VStack flex={1} justifyContent="space-between">
                                                <Box borderRadius="full" p={2} bg="rgba(0,0,0,0.35)" alignSelf="flex-start">
                                                    <Icon as={Feather} name={action.icon as any} color="white" size="sm" />
                                                </Box>
                                                <VStack space={1}>
                                                    <Text color="white" fontWeight="bold">
                                                        {action.label}
                                                    </Text>
                                                    <Text color="rgba(255,255,255,0.85)" fontSize="xs">
                                                        {action.helper}
                                                    </Text>
                                                </VStack>
                                                <HStack alignItems="center" justifyContent="space-between">
                                                    <Text color="white" fontSize="xs" opacity={0.85}>
                                                        Tap to open
                                                    </Text>
                                                    <Icon as={Feather} name="arrow-up-right" color="white" size="xs" />
                                                </HStack>
                                            </VStack>
                                        </LinearGradient>
                                    </Pressable>
                                ))}
                            </HStack>
                        </Glass>

                        {recentSessions.length ? (
                            <ZStack borderRadius="3xl" overflow="hidden">
                                <LinearGradient colors={["#1E1B4B", "#4C1D95"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 24 }}>
                                    <HStack alignItems="center" justifyContent="space-between">
                                        <VStack flex={1} mr={6} space={1}>
                                            <Text color="rgba(255,255,255,0.8)" fontSize="xs">
                                                Session history
                                            </Text>
                                            <Text color="white" fontSize="xl" fontWeight="bold">
                                                Review your latest coach-led blocks
                                            </Text>
                                            <Text color="rgba(255,255,255,0.7)" fontSize="sm">
                                                Quickly revisit notes or jump into the detailed log.
                                            </Text>
                                        </VStack>
                                        <Button
                                            variant="outline"
                                            borderColor="rgba(255,255,255,0.6)"
                                            borderRadius="full"
                                            _text={{ color: "white", fontWeight: "bold" }}
                                            onPress={() => router.push("/(sessions)/history")}
                                        >
                                            Full history
                                        </Button>
                                    </HStack>
                                    <VStack space={3} mt={6}>
                                        {recentSessions.map((session) => {
                                            const trainer = getTrainerForSession(session.trainerId);
                                            const statusMeta = STATUS_STYLES[session.status] ?? STATUS_STYLES.DEFAULT;
                                            return (
                                                <Pressable
                                                    key={session._id}
                                                    borderRadius="xl"
                                                    borderWidth={1}
                                                    borderColor="rgba(255,255,255,0.12)"
                                                    bg="rgba(0,0,0,0.2)"
                                                    p={4}
                                                    onPress={() =>
                                                        router.push({
                                                            pathname: "/(sessions)/details/[sessionId]",
                                                            params: { sessionId: session._id },
                                                        })
                                                    }
                                                >
                                                    <VStack space={3}>
                                                        <HStack justifyContent="space-between" alignItems="center">
                                                            <VStack>
                                                                <Text color="white" fontWeight="bold">
                                                                    {formatSessionDay(session.scheduledStart)}
                                                                </Text>
                                                                <Text color="rgba(255,255,255,0.7)" fontSize="xs">
                                                                    {formatSessionTimeRange(session)}
                                                                </Text>
                                                            </VStack>
                                                            <Badge bg={statusMeta.bg} borderRadius="full" px={3} py={1}>
                                                                <Text color={statusMeta.color} fontSize="xs" fontWeight="bold">
                                                                    {statusMeta.label}
                                                                </Text>
                                                            </Badge>
                                                        </HStack>
                                                        <HStack alignItems="center" justifyContent="space-between">
                                                            <HStack space={3} alignItems="center" flex={1}>
                                                                <Avatar
                                                                    size="sm"
                                                                    source={trainer?.avatarUrl ? { uri: trainer.avatarUrl } : undefined}
                                                                    bg="rgba(124,58,237,0.35)"
                                                                >
                                                                    <Icon as={FontAwesome5} name="user" color="white" size="xs" />
                                                                </Avatar>
                                                                <VStack flex={1}>
                                                                    <Text color="white" fontWeight="medium" numberOfLines={1}>
                                                                        {trainer?.name || trainer?.email || "Trainer TBD"}
                                                                    </Text>
                                                                    <Text color="rgba(255,255,255,0.65)" fontSize="xs" numberOfLines={1}>
                                                                        {trainer?.email}
                                                                    </Text>
                                                                </VStack>
                                                            </HStack>
                                                            <Icon as={Feather} name="arrow-up-right" color="white" />
                                                        </HStack>
                                                    </VStack>
                                                </Pressable>
                                            );
                                        })}
                                    </VStack>
                                </LinearGradient>
                            </ZStack>
                        ) : null}

                        <Glass>
                            <SectionHeader
                                title="Upcoming timeline"
                                actionLabel={
                                    <HStack space={1} alignItems="center">
                                        <Icon as={Feather} name="link" color={ACCENT_LIGHT} size="xs" />
                                        <Text color={ACCENT_LIGHT} fontSize="xs" fontWeight="bold">
                                            History
                                        </Text>
                                    </HStack>
                                }
                                onAction={() => router.push("/(sessions)/history")}
                            />
                            {upcomingSessions.length === 0 ? (
                                <VStack space={3} alignItems="center" py={6}>
                                    <Icon as={Feather} name="calendar" color={SOFT_TEXT} size="lg" />
                                    <Text color="white" fontWeight="bold">
                                        No sessions scheduled
                                    </Text>
                                    <Text color={SOFT_TEXT} fontSize="sm" textAlign="center">
                                        Let your trainer know what works for you and get it on the calendar.
                                    </Text>
                                    <Button
                                        mt={2}
                                        bg={ACCENT}
                                        _pressed={{ bg: "#5B21B6" }}
                                        _text={{ fontWeight: "bold" }}
                                        onPress={handleBookPress}
                                    >
                                        {trainers.length ? "Book with coach" : "Discover trainers"}
                                    </Button>
                                </VStack>
                            ) : (
                                <VStack space={6}>
                                    {upcomingSessions.map((session, index) => {
                                        const trainer = getTrainerForSession(session.trainerId);
                                        const statusMeta = STATUS_STYLES[session.status] ?? STATUS_STYLES.DEFAULT;
                                        const isLast = index === upcomingSessions.length - 1;
                                        const startDate = new Date(session.scheduledStart);
                                        const dayShort = startDate.toLocaleDateString(undefined, { weekday: "short" });
                                        const monthShort = startDate.toLocaleDateString(undefined, { month: "short" });
                                        const dayNumber = startDate.getDate();
                                        const countdownLabel = formatCountdown(session.scheduledStart);
                                        const gradient = TIMELINE_GRADIENTS[session.status] ?? TIMELINE_GRADIENTS.DEFAULT;
                                        const locationIcon = session.type === "ONLINE" ? "wifi" : "map-pin";
                                        const locationLabel =
                                            session.type === "ONLINE"
                                                ? session.meetingLink
                                                    ? "Video link attached"
                                                    : "Virtual session"
                                                : session.location?.city
                                                    ? `${session.location.city}, ${session.location?.state ?? ""}`
                                                    : "In-person session";
                                        const locationChip = session.location?.city
                                            ? `${session.location.city}${session.location?.state ? `, ${session.location.state}` : ""}`
                                            : session.type === "IN_PERSON"
                                                ? "Location TBD"
                                                : undefined;
                                        const meetingChip =
                                            session.type === "ONLINE"
                                                ? session.meetingLink
                                                    ? "Link ready"
                                                    : "Link needed"
                                                : undefined;
                                        const detailChips = [
                                            session.type === "ONLINE" ? "Virtual session" : "In-person",
                                            locationChip,
                                            meetingChip,
                                        ].filter(Boolean) as string[];

                                        return (
                                            <HStack key={session._id} space={4} alignItems="stretch">
                                                <VStack alignItems="center" w="16">
                                                    <Box borderRadius="2xl" borderWidth={1} borderColor={statusMeta.bg} px={3} py={2} alignItems="center" bg="rgba(0,0,0,0.15)">
                                                        <Text color="rgba(255,255,255,0.7)" fontSize="xs" fontWeight="bold">
                                                            {monthShort.toUpperCase()}
                                                        </Text>
                                                        <Text color="white" fontSize="xl" fontWeight="bold">
                                                            {dayNumber}
                                                        </Text>
                                                    </Box>
                                                    {!isLast ? (
                                                        <Box flex={1} width="1px" bg="rgba(255,255,255,0.12)" mt={1} />
                                                    ) : null}
                                                </VStack>
                                                <Pressable
                                                    flex={1}
                                                    borderRadius="2xl"
                                                    overflow="hidden"
                                                    onPress={() =>
                                                        router.push({
                                                            pathname: "/(sessions)/details/[sessionId]",
                                                            params: { sessionId: session._id },
                                                        })
                                                    }
                                                >
                                                    <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 18 }}>
                                                        <Box position="absolute" right={-30} top={-30} w="32" h="32" bg="rgba(255,255,255,0.08)" borderRadius="full" />
                                                        <Box position="absolute" left={-20} bottom={-40} w="40" h="40" bg="rgba(0,0,0,0.15)" borderRadius="full" />
                                                        <VStack space={4}>
                                                            <HStack justifyContent="space-between" alignItems="flex-start">
                                                                <VStack space={1}>
                                                                    <Text color="rgba(255,255,255,0.8)" fontSize="xs">
                                                                        {dayShort}
                                                                    </Text>
                                                                    <Text color="white" fontWeight="bold" fontSize="lg">
                                                                        {formatSessionDay(session.scheduledStart)}
                                                                    </Text>
                                                                    <Text color="rgba(255,255,255,0.75)" fontSize="sm">
                                                                        {formatSessionTimeRange(session)}
                                                                    </Text>
                                                                </VStack>
                                                                <VStack alignItems="flex-end" space={2}>
                                                                    <Badge bg={statusMeta.bg} borderRadius="full" px={3} py={1}>
                                                                        <Text color={statusMeta.color} fontSize="xs" fontWeight="bold">
                                                                            {statusMeta.label}
                                                                        </Text>
                                                                    </Badge>
                                                                    {countdownLabel ? (
                                                                        <HStack
                                                                            space={1}
                                                                            alignItems="center"
                                                                            px={3}
                                                                            py={1}
                                                                            borderRadius="full"
                                                                            bg="rgba(0,0,0,0.3)"
                                                                        >
                                                                            <Icon as={Feather} name="clock" color="white" size="xs" />
                                                                            <Text color="white" fontSize="xs" fontWeight="bold">
                                                                                {countdownLabel}
                                                                            </Text>
                                                                        </HStack>
                                                                    ) : null}
                                                                </VStack>
                                                            </HStack>
                                                            {detailChips.length ? (
                                                                <HStack space={2} flexWrap="wrap">
                                                                    {detailChips.map((chip) => (
                                                                        <Badge key={chip} bg="rgba(0,0,0,0.3)" borderRadius="full" px={3} py={1}>
                                                                            <Text color="rgba(255,255,255,0.8)" fontSize="xs">
                                                                                {chip}
                                                                            </Text>
                                                                        </Badge>
                                                                    ))}
                                                                </HStack>
                                                            ) : null}
                                                            <HStack space={3} alignItems="center">
                                                                <Avatar
                                                                    size="sm"
                                                                    source={trainer?.avatarUrl ? { uri: trainer.avatarUrl } : undefined}
                                                                    bg="rgba(124,58,237,0.35)"
                                                                >
                                                                    <Icon as={FontAwesome5} name="user" color="white" size="xs" />
                                                                </Avatar>
                                                                <VStack flex={1}>
                                                                    <Text color="white" fontWeight="medium">
                                                                        {trainer?.name || trainer?.email || "Trainer TBD"}
                                                                    </Text>
                                                                    <Text color="rgba(255,255,255,0.65)" fontSize="xs">
                                                                        {trainer?.email}
                                                                    </Text>
                                                                </VStack>
                                                                <Icon as={Feather} name="arrow-up-right" color="white" />
                                                            </HStack>
                                                            <HStack alignItems="center" justifyContent="space-between">
                                                                <HStack space={2} alignItems="center">
                                                                    <Icon as={Feather} name={locationIcon as any} color="rgba(255,255,255,0.8)" size="xs" />
                                                                    <Text color="rgba(255,255,255,0.8)" fontSize="xs">
                                                                        {locationLabel}
                                                                    </Text>
                                                                </HStack>
                                                                <Button
                                                                    size="sm"
                                                                    variant="ghost"
                                                                    _text={{ color: "white", fontWeight: "bold" }}
                                                                    onPress={() =>
                                                                        router.push({
                                                                            pathname: "/(sessions)/details/[sessionId]",
                                                                            params: { sessionId: session._id },
                                                                        })
                                                                    }
                                                                >
                                                                    Details
                                                                </Button>
                                                            </HStack>
                                                        </VStack>
                                                    </LinearGradient>
                                                </Pressable>
                                            </HStack>
                                        );
                                    })}
                                </VStack>
                            )}
                        </Glass>

                        <Glass>
                            <SectionHeader title="Coach network" />
                            {trainers.length === 0 ? (
                                <VStack space={3} alignItems="center" py={6}>
                                    <Icon as={Feather} name="user-plus" color={SOFT_TEXT} size="lg" />
                                    <Text color="white" fontWeight="bold">
                                        No trainers connected yet
                                    </Text>
                                    <Text color={SOFT_TEXT} textAlign="center" fontSize="sm">
                                        Accept an invitation or browse our marketplace to collaborate with elite coaches.
                                    </Text>
                                    <Button
                                        mt={2}
                                        variant="outline"
                                        borderColor={ACCENT_LIGHT}
                                        _text={{ color: ACCENT_LIGHT, fontWeight: "bold" }}
                                        onPress={() => router.push("/(profile)/invitations")}
                                    >
                                        Review invites
                                    </Button>
                                </VStack>
                            ) : (
                                <VStack space={4}>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                        <HStack space={4}>
                                            {trainers.slice(0, 8).map((trainer) => (
                                                <Pressable
                                                    key={trainer._id}
                                                    width="240px"
                                                    borderRadius="2xl"
                                                    overflow="hidden"
                                                    onPress={() =>
                                                        router.push({
                                                            pathname: "/(sessions)/[trainerId]",
                                                            params: buildTrainerParams(trainer),
                                                        })
                                                    }
                                                >
                                                    <LinearGradient
                                                        colors={["rgba(124,58,237,0.3)", "rgba(9,2,20,0.95)"]}
                                                        start={{ x: 0, y: 0 }}
                                                        end={{ x: 1, y: 1 }}
                                                        style={{ padding: 20 }}
                                                    >
                                                        <VStack space={4}>
                                                            <HStack space={3} alignItems="center">
                                                                <Avatar
                                                                    size="sm"
                                                                    source={trainer.avatarUrl ? { uri: trainer.avatarUrl } : undefined}
                                                                    bg="rgba(124,58,237,0.3)"
                                                                >
                                                                    <Icon as={FontAwesome5} name="user-tie" color="white" size="xs" />
                                                                </Avatar>
                                                                <VStack flex={1}>
                                                                    <Text color="white" fontWeight="bold" numberOfLines={1}>
                                                                        {trainer.name || "Coach"}
                                                                    </Text>
                                                                    <Text color="rgba(255,255,255,0.7)" fontSize="xs" numberOfLines={1}>
                                                                        {trainer.email}
                                                                    </Text>
                                                                </VStack>
                                                            </HStack>
                                                            {trainer.contact?.city ? (
                                                                <Badge
                                                                    bg="rgba(255,255,255,0.08)"
                                                                    borderRadius="full"
                                                                    px={3}
                                                                    py={1}
                                                                    alignSelf="flex-start"
                                                                >
                                                                    <Text color={SOFT_TEXT} fontSize="xs">
                                                                        {trainer.contact.city}
                                                                    </Text>
                                                                </Badge>
                                                            ) : null}
                                                            <Text color="rgba(255,255,255,0.75)" fontSize="xs">
                                                                {trainer.contact?.addressLine1 || "Tap to view profile & availability"}
                                                            </Text>
                                                            <HStack alignItems="center" justifyContent="space-between">
                                                                <Text color={ACCENT_LIGHT} fontSize="xs" fontWeight="bold">
                                                                    View details
                                                                </Text>
                                                                <Icon as={Feather} name="arrow-right" color={ACCENT_LIGHT} />
                                                            </HStack>
                                                        </VStack>
                                                    </LinearGradient>
                                                </Pressable>
                                            ))}
                                        </HStack>
                                    </ScrollView>
                                    <HStack space={3}>
                                        {hasMore ? (
                                            <Button
                                                flex={1}
                                                variant="outline"
                                                borderColor={ACCENT_LIGHT}
                                                _text={{ color: ACCENT_LIGHT, fontWeight: "bold" }}
                                                onPress={handleLoadMore}
                                                isLoading={loadingMore}
                                            >
                                                Load more coaches
                                            </Button>
                                        ) : null}
                                        <Button
                                            flex={hasMore ? 1 : undefined}
                                            variant="ghost"
                                            _text={{ color: ACCENT_LIGHT, fontWeight: "bold" }}
                                            onPress={() => router.push("/(profile)/invitations")}
                                        >
                                            Manage invites
                                        </Button>
                                    </HStack>
                                </VStack>
                            )}
                        </Glass>

                        <ZStack borderRadius="3xl" overflow="hidden">
                            <LinearGradient colors={["#111827", "#4C1D95"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 28 }}>
                                <VStack space={3}>
                                    <Text color="white" fontSize="lg" fontWeight="bold">
                                        Need another trainer?
                                    </Text>
                                    <Text color="rgba(255,255,255,0.75)" fontSize="sm">
                                        Explore niche experts, hybrid programs, or on-demand specialists. Request an intro and keep everything synced here.
                                    </Text>
                                    <HStack space={3}>
                                        <Button
                                            flex={1}
                                            variant="outline"
                                            borderColor="rgba(255,255,255,0.5)"
                                            _text={{ color: "white", fontWeight: "bold" }}
                                            onPress={() => router.push("/(trainers)/view-all")}
                                            leftIcon={<Icon as={Feather} name="search" color="white" size="sm" />}
                                        >
                                            Browse marketplace
                                        </Button>
                                        <Button
                                            flexBasis="35%"
                                            bg="white"
                                            borderRadius="full"
                                            _text={{ color: "#1B1430", fontWeight: "bold" }}
                                            _pressed={{ bg: "#F4F1FF" }}
                                            onPress={handleBookPress}
                                        >
                                            Book now
                                        </Button>
                                    </HStack>
                                </VStack>
                            </LinearGradient>
                        </ZStack>
                    </VStack>
                </Box>
            </ScrollView>
            <Actionsheet isOpen={trainerSheetOpen} onClose={closeTrainerSheet} hideDragIndicator>
                <Actionsheet.Content bg="#06030F" borderTopWidth={1} borderTopColor="rgba(255,255,255,0.12)" px={0}>
                    <Box w="100%" px={5} py={4}>
                        <HStack justifyContent="space-between" alignItems="center" mb={3}>
                            <VStack>
                                <Text color="white" fontSize="lg" fontWeight="bold">
                                    Book a session
                                </Text>
                                <Text color={SOFT_TEXT} fontSize="xs">
                                    Choose a coach to view availability and lock in your next block.
                                </Text>
                            </VStack>
                            <Button
                                variant="unstyled"
                                onPress={closeTrainerSheet}
                                leftIcon={<Icon as={Feather} name="x" color={SOFT_TEXT} />}
                                _pressed={{ opacity: 0.6 }}
                            />
                        </HStack>
                        {trainers.length ? (
                            <ScrollView style={{ width: "100%", maxHeight: 360 }} showsVerticalScrollIndicator={false}>
                                <VStack space={3}>
                                    {trainers.map((trainer) => (
                                        <Pressable key={trainer._id} onPress={() => handleTrainerSelection(trainer)}>
                                            <LinearGradient
                                                colors={["rgba(124,58,237,0.25)", "rgba(15,5,35,0.9)"]}
                                                start={{ x: 0, y: 0 }}
                                                end={{ x: 1, y: 1 }}
                                                style={{ borderRadius: 16, padding: 14 }}
                                            >
                                                <HStack space={3} alignItems="center">
                                                    <Avatar
                                                        size="sm"
                                                        source={trainer.avatarUrl ? { uri: trainer.avatarUrl } : undefined}
                                                        bg="rgba(124,58,237,0.3)"
                                                    >
                                                        <Icon as={FontAwesome5} name="user-tie" color="white" size="xs" />
                                                    </Avatar>
                                                    <VStack flex={1}>
                                                        <Text color="white" fontWeight="bold">
                                                            {trainer.name || trainer.email}
                                                        </Text>
                                                        <Text color={SOFT_TEXT} fontSize="xs">
                                                            {trainer.email}
                                                        </Text>
                                                    </VStack>
                                                    <Badge bg="rgba(255,255,255,0.12)" borderRadius="full" px={3} py={1}>
                                                        <Text color={SOFT_TEXT} fontSize="xs">
                                                            {trainer.contact?.city || "Remote"}
                                                        </Text>
                                                    </Badge>
                                                    <Icon as={Feather} name="arrow-up-right" color={ACCENT_LIGHT} />
                                                </HStack>
                                            </LinearGradient>
                                        </Pressable>
                                    ))}
                                </VStack>
                            </ScrollView>
                        ) : (
                            <VStack alignItems="center" space={2} mt={6}>
                                <Icon as={Feather} name="search" color={SOFT_TEXT} size="lg" />
                                <Text color="white" fontWeight="bold">
                                    No trainers connected
                                </Text>
                                <Text color={SOFT_TEXT} fontSize="xs" textAlign="center">
                                    Browse the marketplace to connect with a coach and start booking sessions.
                                </Text>
                                <Button
                                    mt={2}
                                    variant="outline"
                                    borderColor={ACCENT_LIGHT}
                                    _text={{ color: ACCENT_LIGHT, fontWeight: "bold" }}
                                    onPress={() => {
                                        closeTrainerSheet();
                                        router.push("/(trainers)/view-all");
                                    }}
                                >
                                    Browse trainers
                                </Button>
                            </VStack>
                        )}
                        <Button mt={5} variant="ghost" _text={{ color: "white", fontWeight: "bold" }} onPress={closeTrainerSheet}>
                            Cancel
                        </Button>
                    </Box>
                </Actionsheet.Content>
            </Actionsheet>
        </Screen>
    );
}
