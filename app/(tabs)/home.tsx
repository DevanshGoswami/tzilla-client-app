import React from "react";
import {
    Box,
    VStack,
    HStack,
    Text,
    ScrollView,
    Button,
    Avatar,
    Badge,
    Card,
    Skeleton,
    Heading,
    Pressable,
    Divider,
} from "native-base";
import { useQuery } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { GET_ME } from "@/graphql/queries";
import { router } from "expo-router";
import { useSteps } from "@/hooks/useSteps";

/* ================================
   GraphQL (recent sessions)
================================ */
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

// small helpers
function parseDateSafe(input?: string | number | null): Date | null {
    if (!input) return null;
    const d = new Date(String(input));
    return isNaN(d.getTime()) ? null : d;
}

/* ================================
   Small bits
================================ */
function StatsCard({
                       title,
                       value,
                       subtitle,
                       icon,
                       colorScheme = "primary",
                   }: {
    title: string;
    value: string;
    subtitle?: string;
    icon: string;
    colorScheme?: string;
}) {
    return (
        <Card flex={1} p={4} bg="white" rounded="xl" shadow={2}>
            <VStack space={2}>
                <HStack justifyContent="space-between" alignItems="center">
                    <Text fontSize="sm" color="gray.500" fontWeight="medium">
                        {title}
                    </Text>
                    <Text fontSize="2xl">{icon}</Text>
                </HStack>
                <Text fontSize="2xl" fontWeight="bold" color={`${colorScheme}.600`}>
                    {value}
                </Text>
                {subtitle ? <Text fontSize="xs" color="gray.400">{subtitle}</Text> : null}
            </VStack>
        </Card>
    );
}

function ActionButton({
                          title,
                          subtitle,
                          icon,
                          onPress,
                          colorScheme = "primary",
                      }: {
    title: string;
    subtitle?: string;
    icon: string;
    onPress: () => void;
    colorScheme?: string;
}) {
    return (
        <Pressable onPress={onPress}>
            <Card p={4} bg="white" rounded="xl" shadow={1}>
                <HStack space={3} alignItems="center">
                    <Box bg={`${colorScheme}.100`} p={3} rounded="full">
                        <Text fontSize="xl">{icon}</Text>
                    </Box>
                    <VStack flex={1}>
                        <Text fontSize="md" fontWeight="semibold" color="gray.800">
                            {title}
                        </Text>
                        {subtitle ? <Text fontSize="sm" color="gray.500">{subtitle}</Text> : null}
                    </VStack>
                    <Text color="gray.400" fontSize="lg">›</Text>
                </HStack>
            </Card>
        </Pressable>
    );
}

/* --- Steps mini chart (7 bars) --- */
function SevenDayBars({ data }: { data: { date: string; value: number }[] }) {
    const max = Math.max(1, ...data.map((d) => d.value));
    return (
        <HStack space={1} alignItems="flex-end">
            {data.map((d) => {
                const h = Math.max(4, Math.round((d.value / max) * 40)); // 0–40 px
                return (
                    <Box
                        key={d.date}
                        w={3}
                        h={h}
                        bg="info.500"
                        rounded="sm"
                        opacity={d.value === 0 ? 0.35 : 0.9}
                    />
                );
            })}
        </HStack>
    );
}

// function StepsCard() {
//     // const { today, last7, weeklyTotal, loading, error, available } = useSteps();
//
//     return (
//         <Card p={4} bg="white" rounded="xl" shadow={2}>
//             <VStack space={2}>
//                 <HStack justifyContent="space-between" alignItems="center">
//                     <Text fontSize="sm" color="gray.500" fontWeight="medium">
//                         Steps
//                     </Text>
//                     <Text fontSize="xl">🚶</Text>
//                 </HStack>
//
//                 {loading ? (
//                     <Skeleton h="6" w="40%" rounded="lg" />
//                 ) : (
//                     <HStack alignItems="baseline" space={2}>
//                         <Text fontSize="2xl" fontWeight="bold" color="info.600">
//                             {today != null ? today.toLocaleString() : "—"}
//                         </Text>
//                         <Text fontSize="xs" color="gray.400">today</Text>
//                     </HStack>
//                 )}
//
//                 {error ? (
//                     <Text fontSize="xs" color="red.500">{error}</Text>
//                 ) : available === false ? (
//                     <Text fontSize="xs" color="gray.500">Pedometer not available on this device.</Text>
//                 ) : null}
//
//                 {!loading && last7.length ? (
//                     <VStack space={1} mt={2}>
//                         <SevenDayBars data={last7} />
//                         <HStack justifyContent="space-between">
//                             <Text fontSize="xs" color="gray.500">
//                                 7-day total:{" "}
//                                 <Text fontWeight="semibold" color="gray.700">
//                                     {weeklyTotal.toLocaleString()}
//                                 </Text>
//                             </Text>
//                             <Text fontSize="xs" color="gray.400">
//                                 {last7[0].date.slice(5)} → {last7[last7.length - 1].date.slice(5)}
//                             </Text>
//                         </HStack>
//                     </VStack>
//                 ) : null}
//             </VStack>
//         </Card>
//     );
// }

/* ================================
   Home Screen
================================ */
export default function Home() {

    console.log('c a m e  h e r e ')
    // Primary profile data
    const { data, loading, error, refetch } = useQuery(GET_ME);

    // Pull userId for sessions query
    // @ts-ignore
    const userId: string | undefined = data?.user?._id;

    // helpers near top of file
    const isoDay = (d: Date) => d.toISOString().slice(0, 10);
    const daysAgoISO = (n: number) => {
        const d = new Date();
        d.setDate(d.getDate() - n);
        return isoDay(d);
    };

    // Recent sessions (show last 5, any status)
    const sess = useQuery(SESSIONS_FOR_CLIENT, {
        variables: { clientId: userId as string, pageNumber: 1, pageSize: 20 },
        skip: !userId,
        fetchPolicy: "no-cache",
    });

    const pr = useQuery(PROGRESS_REPORT, {
        variables: {
            userId: userId as string,
            range: {
                fromISO: daysAgoISO(6),  // 6 days ago today = 7-day window
                toISO: isoDay(new Date()),
            },
        },
        fetchPolicy: "no-cache",
    });

    const allSessions = (sess.data?.sessionsForClient ?? []).slice();
    const totalSessions = allSessions.filter(session => session.status === "CONFIRMED").length;

// only last 2 CONFIRMED sessions (newest first)
    const confirmedSessions = allSessions
        .filter((s: any) => s.status === "CONFIRMED")
        .sort(
            (a: any, b: any) =>
                new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime()
        )
        .slice(0, 2);

// weight lost = startWeight - latestWeight (from progressReport)
    const sortedProgress = (pr.data?.progressReport ?? [])
        .slice()
        .sort((a: any, b: any) => {
            const da = parseDateSafe(a.dateISO)?.getTime() ?? 0;
            const db = parseDateSafe(b.dateISO)?.getTime() ?? 0;
            return da - db; // oldest -> newest
        });
    const startW = sortedProgress[0]?.weightKg;
    const latestW = sortedProgress[sortedProgress.length - 1]?.weightKg;
    const weightLost = (typeof startW === "number" && typeof latestW === "number")
        ? Math.max(0, Number((startW - latestW).toFixed(1)))
        : null;

    if (loading) {
        return (
            <Box flex={1} bg="gray.50" safeAreaTop>
                <VStack p={6} space={4}>
                    <HStack space={3} alignItems="center">
                        <Skeleton size={12} rounded="full" />
                        <VStack flex={1} space={1}>
                            <Skeleton h={4} w="60%" />
                            <Skeleton h={3} w="40%" />
                        </VStack>
                    </HStack>
                    <HStack space={3}>
                        <Skeleton flex={1} h={24} rounded="xl" />
                        <Skeleton flex={1} h={24} rounded="xl" />
                    </HStack>
                    <Skeleton h={20} rounded="xl" />
                    <Skeleton h={20} rounded="xl" />
                </VStack>
            </Box>
        );
    }

    if (error) {
        return (
            <Box flex={1} justifyContent="center" alignItems="center" p={6} bg="gray.50">
                <Text color="red.500" fontSize="lg" textAlign="center">
                    Unable to load your dashboard.
                </Text>
                <Button mt={4} onPress={() => refetch()}>
                    Retry
                </Button>
            </Box>
        );
    }

    // @ts-ignore
    const user = data?.user;
    const name: string = user?.name ?? "Athlete";
    const stats = user?.stats;

    // Sessions (sorted newest first, just take a few)
    const sessions = (sess.data?.sessionsForClient ?? [])
        .slice()
        .sort(
            (a: any, b: any) =>
                new Date(b.scheduledStart).getTime() - new Date(a.scheduledStart).getTime()
        )
        .slice(0, 5);

    return (
        <Box flex={1} bg="gray.50" safeAreaTop>
            <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                <VStack space={6} p={6}>
                    {/* Header */}
                    <HStack justifyContent="space-between" alignItems="center">
                        <VStack>
                            <Text fontSize="sm" color="gray.500">Welcome back,</Text>
                            <Heading size="lg" color="gray.800">{name} 👋</Heading>
                        </VStack>
                        <Avatar
                            size="md"
                            source={user?.avatar ? { uri: user.avatar } : undefined}
                            bg="primary.500"
                        >
                            {name.charAt(0).toUpperCase()}
                        </Avatar>
                    </HStack>

                    {/* Overview */}
                    <VStack space={3}>
                        <Text fontSize="lg" fontWeight="bold" color="gray.800">Overview</Text>
                        <HStack space={3}>
                            <StatsCard
                                title="Sessions"
                                value={sess.loading ? "…" : String(totalSessions)}
                                subtitle="total"
                                icon="📅"
                                colorScheme="purple"
                            />
                            <StatsCard
                                title="Weight Lost"
                                value={pr.loading ? "…" : (weightLost != null ? `${weightLost} kg` : "—")}
                                subtitle="since start"
                                icon="⚖️"
                                colorScheme="orange"
                            />
                        </HStack>
                    </VStack>

                    {/* Steps */}
                    {/*<StepsCard />*/}

                    {/* Recent Sessions (last 2 confirmed) */}
                    <VStack space={3}>
                        <Text fontSize="lg" fontWeight="bold" color="gray.800">
                            Upcoming (Confirmed)
                        </Text>
                        {sess.loading ? (
                            <VStack space={2}>
                                <Skeleton h="16" rounded="xl" />
                                <Skeleton h="16" rounded="xl" />
                            </VStack>
                        ) : confirmedSessions.length ? (
                            <VStack space={2}>
                                {confirmedSessions.map((s: any) => {
                                    const date = new Date(s.scheduledStart);
                                    const end = new Date(s.scheduledEnd);
                                    const friendly = isNaN(date.getTime()) ? "—" : date.toLocaleDateString();
                                    return (
                                        <Card key={s._id} p={4} bg="white" rounded="xl" shadow={1}>
                                            <HStack alignItems="center" justifyContent="space-between">
                                                <VStack flex={1}>
                                                    <Text fontWeight="semibold">
                                                        {s.type?.replace("_", " ") || "Session"}
                                                    </Text>
                                                    <Text fontSize="xs" color="gray.500">
                                                        {friendly} · {isNaN(end.getTime()) ? "" : `${end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                                                    </Text>
                                                    {s.location?.city ? (
                                                        <Text fontSize="xs" color="gray.400">
                                                            {s.location.city}{s.location.state ? `, ${s.location.state}` : ""}
                                                        </Text>
                                                    ) : null}
                                                </VStack>
                                                <Badge colorScheme="info" variant="subtle">
                                                    {s.status}
                                                </Badge>
                                            </HStack>
                                        </Card>
                                    );
                                })}
                            </VStack>
                        ) : (
                            <Card p={4} bg="white" rounded="xl" shadow={1}>
                                <Text color="gray.500">No confirmed sessions.</Text>
                            </Card>
                        )}
                    </VStack>


                    {/* Quick Actions */}
                    <VStack space={3}>
                        <Text fontSize="lg" fontWeight="bold" color="gray.800">
                            Quick Actions
                        </Text>
                        <VStack space={3}>
                            <ActionButton
                                title="Log Weight"
                                subtitle="Track your progress"
                                icon="⚖️"
                                onPress={() => router.push("/(tabs)/progress")}
                                colorScheme="info"
                            />
                            <ActionButton
                                title="View Meal Plan"
                                subtitle="Today's nutrition guide"
                                icon="🍎"
                                onPress={() => router.push("/(tabs)/nutrition")}
                                colorScheme="success"
                            />
                            <ActionButton
                                title="Workout History"
                                subtitle="See past sessions"
                                icon="📊"
                                onPress={() => router.push("/(tabs)/workouts")}
                                colorScheme="purple"
                            />
                        </VStack>
                    </VStack>

                    <Box h={6} />
                </VStack>
            </ScrollView>
        </Box>
    );
}
