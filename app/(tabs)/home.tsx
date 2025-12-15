import React, { useCallback, useState } from "react";
import {
    Box,
    VStack,
    HStack,
    Text,
    ScrollView,
    Button,
    Avatar,
    Badge,
    Skeleton,
    Pressable,
    Divider,
} from "native-base";
import { useCachedQuery } from "@/hooks/useCachedQuery";
import { gql } from "@apollo/client";
import { GET_ME } from "@/graphql/queries";
import { router } from "expo-router";
import { useSteps } from "@/hooks/useSteps";
import { Ionicons } from "@expo/vector-icons";
import { RefreshControl } from "react-native";

const SESSIONS_FOR_CLIENT = gql`
    query SessionsForClient($clientId: ID!, $pageNumber: Int!, $pageSize: Int!) {
        sessionsForClient(clientId: $clientId, pagination: { pageNumber: $pageNumber, pageSize: $pageSize }) {
            _id
            type
            status
            scheduledStart
            scheduledEnd
            location { city state country }
            createdAt
            updatedAt
        }
    }
`;

const PROGRESS_REPORT = gql`
    query ProgressReport($userId: ID!, $range: ProgressRange) {
        progressReport(userId: $userId, range: $range) {
            id
            dateISO
            weightKg
            createdAt
        }
    }
`;

function parseDateSafe(input?: string | number | null): Date | null {
    if (!input) return null;
    const d = new Date(String(input));
    return isNaN(d.getTime()) ? null : d;
}

function Pill({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
    return (
        <HStack
            space={2}
            alignItems="center"
            px={3}
            py={2}
            borderRadius={999}
            bg="rgba(255,255,255,0.08)"
            borderWidth={1}
            borderColor="rgba(255,255,255,0.12)"
        >
            <Ionicons name={icon} size={16} color="#C4B5FD" />
            <Text fontSize="xs" color="coolGray.300">
                {label} · {" "}
                <Text fontWeight="bold" color="white">
                    {value}
                </Text>
            </Text>
        </HStack>
    );
}

function SectionHeader({ icon, title, actionLabel, onAction }: { icon: keyof typeof Ionicons.glyphMap; title: string; actionLabel?: string; onAction?: () => void }) {
    return (
        <HStack justifyContent="space-between" alignItems="center" mb={2}>
            <HStack alignItems="center" space={2}>
                <Box w={8} h={8} rounded="full" bg="rgba(124,58,237,0.15)" alignItems="center" justifyContent="center">
                    <Ionicons name={icon} size={16} color="#C4B5FD" />
                </Box>
                <Text fontSize="md" fontWeight="bold" color="white">
                    {title}
                </Text>
            </HStack>
            {actionLabel && onAction ? (
                <Pressable onPress={onAction}>
                    <Text fontSize="xs" color="coolGray.300">
                        {actionLabel}
                    </Text>
                </Pressable>
            ) : null}
        </HStack>
    );
}

function MetricCard({ title, value, subtitle, icon }: { title: string; value: string; subtitle?: string; icon: keyof typeof Ionicons.glyphMap }) {
    return (
        <VStack
            flex={1}
            p={4}
            rounded="2xl"
            bg={{
                linearGradient: {
                    colors: ["rgba(124,58,237,0.25)", "rgba(15,17,26,0.8)"],
                    start: [0, 0],
                    end: [1, 1],
                },
            }}
            borderWidth={1}
            borderColor="rgba(255,255,255,0.08)"
            space={3}
        >
            <HStack justifyContent="space-between" alignItems="center">
                <VStack>
                    <Text fontSize="xs" color="coolGray.300">
                        {title}
                    </Text>
                    <Text fontSize="2xl" fontWeight="bold" color="white">
                        {value}
                    </Text>
                </VStack>
                <Box bg="rgba(124,58,237,0.2)" rounded="full" p={2}>
                    <Ionicons name={icon} size={20} color="#C4B5FD" />
                </Box>
            </HStack>
            {subtitle ? <Text fontSize="xs" color="coolGray.400">{subtitle}</Text> : null}
        </VStack>
    );
}

function ActionButton({ title, subtitle, icon, onPress }: { title: string; subtitle?: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
    return (
        <Pressable onPress={onPress} style={{ flex: 1 }}>
            <VStack p={4} rounded="2xl" borderWidth={1} borderColor="rgba(255,255,255,0.08)" bg="#0F111A" space={3}>
                <Box bg="rgba(124,58,237,0.15)" rounded="full" w={10} h={10} alignItems="center" justifyContent="center">
                    <Ionicons name={icon} size={20} color="#C4B5FD" />
                </Box>
                <Text fontSize="md" fontWeight="semibold" color="white">
                    {title}
                </Text>
                {subtitle ? <Text fontSize="xs" color="coolGray.400">{subtitle}</Text> : null}
            </VStack>
        </Pressable>
    );
}

function SevenDayBars({ data }: { data: { date: string; value: number }[] }) {
    const max = Math.max(1, ...data.map((d) => d.value));
    return (
        <HStack space={1} alignItems="flex-end">
            {data.map((d) => {
                const h = Math.max(4, Math.round((d.value / max) * 40));
                return <Box key={d.date} w={3} h={h} bg="info.500" rounded="sm" opacity={d.value === 0 ? 0.35 : 0.9} />;
            })}
        </HStack>
    );
}

function StepsCard() {
    const { today, last7, weeklyTotal, loading, error, available } = useSteps();
    const unavailable = available === false;
    const GOAL_STEPS = 10_000;
    const todaySteps = today ?? 0;
    const goalProgress = Math.min(1, todaySteps / GOAL_STEPS);
    const goalReached = goalProgress >= 1;
    const remaining = Math.max(0, GOAL_STEPS - todaySteps);

    return (
        <VStack p={4} rounded="2xl" borderWidth={1} borderColor="rgba(255,255,255,0.08)" bg="#0F111A" space={3}>
            <SectionHeader icon="walk-outline" title="Steps overview" />
            {loading ? (
                <Skeleton h="6" w="40%" rounded="lg" bg="rgba(255,255,255,0.1)" />
            ) : (
                <HStack alignItems="baseline" space={2}>
                    <Text fontSize="3xl" fontWeight="bold" color="white">
                        {today != null ? today.toLocaleString() : "—"}
                    </Text>
                    <Text fontSize="xs" color="coolGray.400">
                        today
                    </Text>
                </HStack>
            )}
            {!loading && !error && !unavailable ? (
                <VStack space={2} mt={1}>
                    <HStack justifyContent="space-between" alignItems="center">
                        <Text fontSize="xs" color="coolGray.400">
                            Goal: {GOAL_STEPS.toLocaleString()} steps
                        </Text>
                        <Text fontSize="xs" color={goalReached ? "emerald.300" : "coolGray.300"}>
                            {goalReached ? "Goal crushed!" : `${remaining.toLocaleString()} left`}
                        </Text>
                    </HStack>
                    <Box h={2} rounded="full" bg="rgba(255,255,255,0.08)" overflow="hidden">
                        <Box
                            h="100%"
                            w={`${Math.max(4, goalProgress * 100).toFixed(0)}%`}
                            bg={goalReached ? "emerald.400" : "info.500"}
                            rounded="full"
                        />
                    </Box>
                </VStack>
            ) : null}
            {error ? (
                <Text fontSize="xs" color="red.400">
                    {error}
                </Text>
            ) : unavailable ? (
                <Text fontSize="xs" color="coolGray.500">
                    Step tracking isn’t available on this device.
                </Text>
            ) : null}
            {!loading && !error && !unavailable && last7.length ? (
                <VStack space={1} mt={2}>
                    <SevenDayBars data={last7} />
                    <HStack justifyContent="space-between">
                        <Text fontSize="xs" color="coolGray.400">
                            7-day total:{" "}
                            <Text fontWeight="semibold" color="white">
                                {weeklyTotal.toLocaleString()}
                            </Text>
                        </Text>
                        <Text fontSize="xs" color="coolGray.500">
                            {last7[0].date.slice(5)} → {last7[last7.length - 1].date.slice(5)}
                        </Text>
                    </HStack>
                </VStack>
            ) : null}
        </VStack>
    );
}

export default function Home() {
    const { data, loading, error, refetch } = useCachedQuery(GET_ME);
    // @ts-ignore
    const userId: string | undefined = data?.user?._id;

    const sess = useCachedQuery(SESSIONS_FOR_CLIENT, {
        variables: { clientId: userId as string, pageNumber: 1, pageSize: 20 },
        skip: !userId,
    });

    const pr = useCachedQuery(PROGRESS_REPORT, {
        variables: { userId: userId as string },
        skip: !userId,
    });

    const [refreshing, setRefreshing] = useState(false);
    const handleRefresh = useCallback(async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            const tasks: Promise<any>[] = [refetch()];
            if (userId) {
                tasks.push(sess.refetch(), pr.refetch());
            }
            await Promise.all(tasks);
        } catch (error) {
            console.warn("Home refresh failed", error);
        } finally {
            setRefreshing(false);
        }
    }, [refreshing, refetch, sess.refetch, pr.refetch, userId]);

    const allSessions = (sess.data?.sessionsForClient ?? []).slice();
    const totalSessions = allSessions.filter((session) => session.status === "CONFIRMED").length;

    const confirmedSessions = allSessions
        .filter((s: any) => s.status === "CONFIRMED")
        .sort((a: any, b: any) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime())
        .slice(0, 2);

    const sortedProgress = (pr.data?.progressReport ?? [])
        .slice()
        .sort((a: any, b: any) => (parseDateSafe(a.dateISO)?.getTime() ?? 0) - (parseDateSafe(b.dateISO)?.getTime() ?? 0));
    const startW = sortedProgress[0]?.weightKg;
    const latestW = sortedProgress[sortedProgress.length - 1]?.weightKg;
    const weightLost =
        typeof startW === "number" && typeof latestW === "number"
            ? Math.max(0, Number((startW - latestW).toFixed(1)))
            : null;

    const renderSkeleton = () => (
        <Box flex={1} bg="#05060A" safeAreaTop>
            <VStack p={6} space={4}>
                <Skeleton h={40} rounded="2xl" bg="rgba(255,255,255,0.05)" />
                <HStack space={4}>
                    <Skeleton flex={1} h={24} rounded="2xl" bg="rgba(255,255,255,0.05)" />
                    <Skeleton flex={1} h={24} rounded="2xl" bg="rgba(255,255,255,0.05)" />
                </HStack>
                <Skeleton h={20} rounded="2xl" bg="rgba(255,255,255,0.05)" />
            </VStack>
        </Box>
    );

    if (loading) return renderSkeleton();

    if (error) {
        return (
            <Box flex={1} justifyContent="center" alignItems="center" p={6} bg="#05060A">
                <Text color="red.400" fontSize="lg" textAlign="center">
                    Unable to load your dashboard.
                </Text>
                <Button mt={4} onPress={() => refetch()} bg="#7C3AED" _text={{ color: "white" }}>
                    Retry
                </Button>
            </Box>
        );
    }

    // @ts-ignore
    const user = data?.user;
    const name: string = user?.name ?? "Athlete";

    const sessions = (sess.data?.sessionsForClient ?? [])
        .slice()
        .sort((a: any, b: any) => new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime())
        .slice(0, 5);

    return (
        <Box flex={1} bg="#05060A" safeAreaTop>
            <ScrollView
                flex={1}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 80 }}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />}
            >
                <VStack space={6} p={6}>
                    <Box
                        p={5}
                        rounded="3xl"
                        bg={{
                            linearGradient: {
                                colors: ["rgba(124,58,237,0.35)", "rgba(8,9,18,0.95)"],
                                start: [0, 0],
                                end: [1, 1],
                            },
                        }}
                        borderWidth={1}
                        borderColor="rgba(255,255,255,0.1)"
                    >
                        <HStack justifyContent="space-between" alignItems="center">
                            <VStack space={2} flex={1} pr={4}>
                                <Text fontSize="xs" color="coolGray.200">
                                    Welcome back,
                                </Text>
                                <Text fontSize="lg" color="white" fontWeight="bold">
                                    {name} 👋
                                </Text>
                                <Text fontSize="sm" color="coolGray.400">
                                    Keep the momentum going. Your coach synced your latest plan this morning.
                                </Text>
                            </VStack>
                            <Avatar size="md" source={user?.avatar ? { uri: user.avatar } : undefined} bg="#7C3AED">
                                {name.charAt(0).toUpperCase()}
                            </Avatar>
                        </HStack>
                        <HStack mt={4} space={3}>
                            <Pill icon="flame-outline" label="Consistency" value={`${totalSessions} sessions`} />
                            <Pill icon="trophy-outline" label="Goal" value={user?.stats?.goal ?? "—"} />
                        </HStack>
                    </Box>

                    <HStack space={4}>
                        <MetricCard
                            title="Sessions"
                            value={sess.loading ? "…" : String(totalSessions)}
                            subtitle="Total confirmed"
                            icon="calendar-outline"
                        />
                        <MetricCard
                            title="Weight lost"
                            value={pr.loading ? "…" : weightLost != null ? `${weightLost} kg` : "—"}
                            subtitle="Since day one"
                            icon="fitness-outline"
                        />
                    </HStack>

                    <ExploreSpotlight />

                    <StepsCard />

                    <VStack space={3}>
                        <SectionHeader icon="time-outline" title="Upcoming sessions" />
                        {sess.loading ? (
                            <VStack space={2}>
                                <Skeleton h="18" rounded="2xl" bg="rgba(255,255,255,0.05)" />
                                <Skeleton h="18" rounded="2xl" bg="rgba(255,255,255,0.05)" />
                            </VStack>
                        ) : confirmedSessions.length ? (
                            <VStack space={3}>
                                {confirmedSessions.map((s: any) => {
                                    const date = new Date(s.scheduledStart);
                                        const end = new Date(s.scheduledEnd);
                                    const friendly = isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
                                    return (
                                        <VStack
                                            key={s._id}
                                            p={4}
                                            rounded="2xl"
                                            borderWidth={1}
                                            borderColor="rgba(255,255,255,0.08)"
                                            bg="#0F111A"
                                            space={2}
                                        >
                                            <HStack justifyContent="space-between" alignItems="center">
                                                <Text fontWeight="semibold" color="white">
                                                    {s.type?.replace("_", " ") || "Session"}
                                                </Text>
                                                <Badge colorScheme="info" variant="subtle" rounded="full">
                                                    {s.status}
                                                </Badge>
                                            </HStack>
                                            <Text fontSize="xs" color="coolGray.400">
                                                {friendly} · {isNaN(end.getTime()) ? "" : end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                            </Text>
                                            {s.location?.city ? (
                                                <Text fontSize="xs" color="coolGray.500">
                                                    {s.location.city}
                                                    {s.location.state ? `, ${s.location.state}` : ""}
                                                </Text>
                                            ) : null}
                                        </VStack>
                                    );
                                })}
                            </VStack>
                        ) : (
                            <Box p={4} rounded="2xl" borderWidth={1} borderColor="rgba(255,255,255,0.08)" bg="#0F111A">
                                <Text color="coolGray.400">No confirmed sessions.</Text>
                            </Box>
                        )}
                    </VStack>

                    <VStack space={3}>
                        <SectionHeader icon="flash-outline" title="Quick actions" />
                        <HStack space={4}>
                            <ActionButton title="Explore trainers" subtitle="Find the right coach" icon="people-outline" onPress={() => router.push("/(trainers)/view-all")} />
                            <ActionButton title="Log weight" subtitle="Update progress" icon="speedometer-outline" onPress={() => router.push("/(tabs)/progress")} />
                        </HStack>
                        <HStack space={4}>
                            <ActionButton title="Meal plan" subtitle="Today’s nutrition" icon="restaurant-outline" onPress={() => router.push("/(tabs)/nutrition")} />
                            <ActionButton title="Workout history" subtitle="Review past sessions" icon="barbell-outline" onPress={() => router.push("/(tabs)/workouts")} />
                        </HStack>
                    </VStack>
                </VStack>
            </ScrollView>
        </Box>
    );
}

function ExploreSpotlight() {
    return (
        <Box
            p={5}
            rounded="3xl"
            bg={{
                linearGradient: {
                    colors: ["#0F0A24", "#05060A"],
                    start: [0, 0],
                    end: [1, 1],
                },
            }}
            borderWidth={1}
            borderColor="rgba(255,255,255,0.08)"
            shadow={4}
        >
            <HStack justifyContent="space-between" alignItems="center" mb={3}>
                <VStack flex={1} pr={4}>
                    <Text color="#C4B5FD" fontSize="xs" letterSpacing={2} textTransform="uppercase">
                        Explore trainers
                    </Text>
                    <Text color="white" fontSize="lg" fontWeight="bold" lineHeight={24}>
                        Pair with elite coaching talent across strength, conditioning, and nutrition.
                    </Text>
                </VStack>
                <HStack space={-2} alignItems="center">
                    {["A", "L", "T"].map((letter) => (
                        <Avatar key={letter} size="sm" bg="rgba(124,58,237,0.3)">
                            {letter}
                        </Avatar>
                    ))}
                </HStack>
            </HStack>
            <VStack space={2} mb={4}>
                <Text color="coolGray.300" fontSize="xs">
                    • Filter by specialization, availability, or communication style
                </Text>
                <Text color="coolGray.300" fontSize="xs">
                    • Preview client transformations and trainer response times
                </Text>
            </VStack>
            <Button rounded="xl" bg="#7C3AED" _text={{ fontWeight: "bold" }} onPress={() => router.push("/(trainers)/view-all")}>Discover coaches</Button>
        </Box>
    );
}
