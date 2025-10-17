import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Box,
    VStack,
    HStack,
    Text,
    ScrollView,
    Card,
    Button,
    Badge,
    Heading,
    Pressable,
    Divider,
    useDisclose,
    useToast,
    Skeleton,
} from 'native-base';
import { Modal as RNModal, SafeAreaView, TouchableOpacity } from 'react-native';
import { useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';

import { GET_ME } from '@/graphql/queries';
import { getTokens } from '@/lib/apollo';
import { ENV } from '@/lib/env';
import { Image as ExpoImage } from 'expo-image'; // ✅ use expo-image for caching

/* ================================
   GraphQL
================================ */
const WORKOUT_PLANS_FOR_CLIENT = gql`
    query WorkoutPlansForClient($clientId: ID!, $pageNumber: Int!, $pageSize: Int!) {
        workoutPlansForClient(clientId: $clientId, pagination: { pageNumber: $pageNumber, pageSize: $pageSize }) {
            _id
            title
            trainerId
            description
            startDate
            endDate
            updatedAt
            exercises {
                name
                avatarUrl
                videoUrl
                sets
                reps
                restSeconds
                order
            }
        }
    }
`;

const GET_TRAINERS_FOR_CLIENT = gql`
    query GetTrainersForClient($pageNumber: Int!, $pageSize: Int!) {
        getTrainersForClient(pagination: { pageNumber: $pageNumber, pageSize: $pageSize }) {
            _id
            name
            avatarUrl
        }
    }
`;

function parseDateSafe(input?: string | number | null): Date | null {
    if (!input) return null;
    if (typeof input === 'number' || /^\d+$/.test(String(input))) {
        const s = String(input);
        let ms = Number(s);
        if (s.length >= 16) ms = ms / 1_000_000; // ns -> ms
        else if (s.length >= 13) ms = ms;        // ms
        else if (s.length >= 10) ms = ms * 1000; // s -> ms
        const d = new Date(ms);
        return isNaN(d.getTime()) ? null : d;
    }
    const d = new Date(String(input));
    return isNaN(d.getTime()) ? null : d;
}

function formatDateShort(input?: string | number | null): string {
    const d = parseDateSafe(input);
    return d ? d.toLocaleDateString() : '—';
}

/* ================================
   Helpers
================================ */
const toInt = (n: any, min = 0, max = 100) => {
    const x = Number.isFinite(n) ? (n as number) : 0;
    const r = Math.round(x + Number.EPSILON);
    return Math.min(max, Math.max(min, r));
};

function PercentBar({
                        percent,
                        trackColor = 'gray.200',
                        barColor = 'primary.500',
                        h = '6',
                    }: { percent: number; trackColor?: string; barColor?: string; h?: string | number }) {
    const p = toInt(percent, 0, 100);
    return (
        <Box w="100%" bg={trackColor} rounded="full" h={h} overflow="hidden">
            <Box w={`${p}%`} h="100%" bg={barColor} />
        </Box>
    );
}

const s3UrlCache = new Map<string, string>();
async function resolveS3KeyToUrl(key?: string | null, token?: string | null): Promise<string | undefined> {
    if (!key) return undefined;
    if (key.startsWith('http')) return key;
    const cached = s3UrlCache.get(key);
    if (cached) return cached;
    if (!token) return undefined;
    try {
        const resp = await fetch(`${ENV.API_URL}/api/aws/media/${encodeURIComponent(key)}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, role: 'client' },
        });
        if (!resp.ok) return undefined;
        const { url } = await resp.json();
        if (url) s3UrlCache.set(key, url);
        return url as string | undefined;
    } catch {
        return undefined;
    }
}

/* ================================
   Types
================================ */
type GQLExercise = {
    name: string;
    avatarUrl?: string | null;
    videoUrl?: string | null;
    sets: number;
    reps: number;
    restSeconds: number;
    order: number;
};

type GQLWorkoutPlan = {
    _id: string;
    title: string;
    description?: string | null;
    startDate: string;
    endDate?: string | null;
    updatedAt: string;
    exercises: GQLExercise[];
};

type UIWorkout = {
    key: string;
    title: string;
    exercisesCount: number;
    bannerUrl?: string;
    scheduled?: string;
    description?: string;
    trainerName?: string;
};

/* ================================
   Card
================================ */
function WorkoutCard({
                         item,
                         onOpen,
                     }: {
    item: UIWorkout;
    onOpen: () => void;
}) {
    const [imgLoaded, setImgLoaded] = useState(false);

    return (
        <Pressable onPress={onOpen}>
            <Card p={0} bg="white" rounded="xl" shadow={2} mb={3}>
                <VStack space={0}>
                    {item.bannerUrl ? (
                        <Box position="relative" roundedTop="xl" overflow="hidden">
                            {!imgLoaded && <Skeleton h={48} w="100%" rounded="0" />}
                            <ExpoImage
                                source={{ uri: item.bannerUrl }}
                                style={{ width: '100%', height: 192 }}   // ~ h={48}
                                contentFit="cover"                        // better banner feel
                                cachePolicy="memory-disk"
                                transition={200}
                                priority="high"
                                onLoadEnd={() => setImgLoaded(true)}
                            />
                        </Box>
                    ) : (
                        <Box w="100%" bg="gray.100" alignItems="center" justifyContent="center" roundedTop="xl" h={32}>
                            <Text fontSize="5xl">🏋️</Text>
                        </Box>
                    )}

                    <VStack space={3} p={4}>
                        <HStack justifyContent="space-between" alignItems="center">
                            <VStack flex={1} pr={2}>
                                <Text fontSize="lg" fontWeight="bold" color="gray.800" numberOfLines={2}>
                                    {item.title}
                                </Text>
                                <HStack space={3} mt={1} flexWrap="wrap">
                                    <Badge variant="subtle" colorScheme="primary">
                                        {item.exercisesCount} exercises
                                    </Badge>
                                    {item.scheduled && (
                                        <Badge variant="outline" colorScheme="coolGray">
                                            Starts {formatDateShort(item.scheduled)}
                                        </Badge>
                                    )}
                                    {item.trainerName && (
                                        <Badge variant="subtle" colorScheme="secondary">
                                            by {item.trainerName}
                                        </Badge>
                                    )}
                                </HStack>
                            </VStack>
                            <Badge colorScheme="info" variant="outline">Plan</Badge>
                        </HStack>

                        {item.description ? (
                            <Text fontSize="sm" color="gray.600" numberOfLines={3}>
                                {item.description}
                            </Text>
                        ) : null}
                        <Button size="sm" variant="solid" onPress={onOpen}>
                            View Details
                        </Button>
                    </VStack>
                </VStack>
            </Card>
        </Pressable>
    );
}

/* ================================
   Exercise row (isolated state)
================================ */
function ExerciseRow({
                         name,
                         url,
                         sets,
                         reps,
                         restSeconds,
                         order,
                     }: {
    name: string;
    url?: string;
    sets: number;
    reps: number;
    restSeconds: number;
    order: number;
}) {
    const [imgLoaded, setImgLoaded] = useState(false);

    return (
        <Card p={0} bg="gray.50" rounded="lg">
            {url ? (
                <Box position="relative" overflow="hidden">
                    {!imgLoaded && <Skeleton h={48} w="100%" rounded="0" />}
                    <ExpoImage
                        source={{ uri: url }}
                        style={{ width: '100%', height: 192 }}
                        contentFit="contain"
                        cachePolicy="memory-disk"
                        transition={200}
                        priority="high"
                        onLoadEnd={() => setImgLoaded(true)}
                    />
                </Box>
            ) : null}
            <VStack p={3} space={1}>
                <Text fontSize="md" fontWeight="semibold">{order}. {name}</Text>
                <HStack justifyContent="space-between" alignItems="center">
                    <Text fontSize="sm" color="gray.600">
                        {sets} sets × {reps} reps
                    </Text>
                    <Text fontSize="sm" color="gray.500">Rest: {restSeconds}s</Text>
                </HStack>
            </VStack>
        </Card>
    );
}

/* ================================
   Detail Modal (RN Modal to avoid BackHandler bug)
================================ */
function WorkoutDetailModal({
                                visible,
                                onClose,
                                plan,
                                resolvedExercises,
                            }: {
    visible: boolean;
    onClose: () => void;
    plan?: GQLWorkoutPlan | null;
    resolvedExercises: { name: string; url?: string; sets: number; reps: number; restSeconds: number; order: number }[];
}) {
    if (!plan) return null;

    return (
        <RNModal
            visible={visible}
            animationType="slide"
            onRequestClose={onClose}
            presentationStyle="fullScreen"
            transparent={false}
        >
            <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
                <VStack flex={1}>
                    {/* Header */}
                    <HStack px={16} py={3} alignItems="center" justifyContent="space-between" borderBottomWidth={1} borderBottomColor="#eee">
                        <TouchableOpacity onPress={onClose} style={{ padding: 8 }}>
                            <Text style={{ fontWeight: '700', color: '#111' }}>Close</Text>
                        </TouchableOpacity>
                        <Text style={{ fontWeight: '800', color: '#111' }} numberOfLines={1}>{plan.title}</Text>
                        <Box w={12} />
                    </HStack>

                    <ScrollView flex={1} contentContainerStyle={{ padding: 16 }}>
                        <VStack space={4}>
                            <Card p={4} bg="primary.50">
                                <VStack space={2}>
                                    <Text fontSize="md" fontWeight="semibold" color="primary.800">
                                        Workout Overview
                                    </Text>
                                    <HStack space={4} flexWrap="wrap">
                                        <Text fontSize="sm" color="primary.600">💪 {plan.exercises.length} exercises</Text>
                                        {plan.startDate && (
                                            <Text fontSize="sm" color="primary.600">📅 Starts {formatDateShort(plan.startDate)}</Text>
                                        )}
                                    </HStack>
                                </VStack>
                            </Card>

                            <VStack space={3}>
                                <Text fontSize="lg" fontWeight="bold">Exercises</Text>
                                {resolvedExercises
                                    .slice()
                                    .sort((a, b) => a.order - b.order)
                                    .map((ex) => (
                                        <ExerciseRow
                                            key={`${ex.name}-${ex.order}`}
                                            name={ex.name}
                                            url={ex.url}
                                            sets={ex.sets}
                                            reps={ex.reps}
                                            restSeconds={ex.restSeconds}
                                            order={ex.order}
                                        />
                                    ))}
                            </VStack>

                            <Card p={4} bg="warning.50">
                                <VStack space={2}>
                                    <HStack space={2} alignItems="center">
                                        <Text fontSize="lg">💡</Text>
                                        <Text fontSize="md" fontWeight="semibold" color="warning.800">
                                            Tips
                                        </Text>
                                    </HStack>
                                    <Text fontSize="sm" color="warning.700">• Warm up 5–10 minutes</Text>
                                    <Text fontSize="sm" color="warning.700">• Prioritize form over speed</Text>
                                    <Text fontSize="sm" color="warning.700">• Hydrate between sets</Text>
                                    <Text fontSize="sm" color="warning.700">• Cool down and stretch</Text>
                                </VStack>
                            </Card>

                            <HStack space={3}>
                                <Button flex={1} variant="outline" onPress={onClose}>Close</Button>
                                <Button flex={1} colorScheme="primary" onPress={onClose}>Start Workout</Button>
                            </HStack>
                        </VStack>
                    </ScrollView>
                </VStack>
            </SafeAreaView>
        </RNModal>
    );
}

/* ================================
   Screen
================================ */
export default function Workouts() {
    const toast = useToast();
    const { isOpen, onOpen, onClose } = useDisclose();
    const [selectedPlan, setSelectedPlan] = useState<GQLWorkoutPlan | null>(null);

    // who am i
    const { data: meData } = useQuery(GET_ME);
    // @ts-ignore
    const clientId: string | undefined = meData?.user?._id;

    // auth token
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

    // server data
    const { data, loading, error } = useQuery<{ workoutPlansForClient: GQLWorkoutPlan[] }>(
        WORKOUT_PLANS_FOR_CLIENT,
        {
            variables: { clientId: clientId as string, pageNumber: 1, pageSize: 20 },
            skip: !clientId,
            fetchPolicy: 'no-cache',
            nextFetchPolicy: 'no-cache',
        }
    );

    // plans → sorted
    const plansSorted: GQLWorkoutPlan[] = useMemo(() => {
        const p = data?.workoutPlansForClient ?? [];
        return [...p].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }, [data]);

    const { data: trainersData } = useQuery<{ getTrainersForClient: { _id: string; name: string; avatarUrl?: string | null }[] }>(
        GET_TRAINERS_FOR_CLIENT,
        { variables: { pageNumber: 1, pageSize: 25 } }
    );
    const trainersById = useMemo(() => {
        const map = new Map<string, { name: string; avatarUrl?: string | null }>();
        for (const t of (trainersData?.getTrainersForClient ?? [])) {
            map.set(t._id, { name: t.name, avatarUrl: t.avatarUrl ?? undefined });
        }
        return map;
    }, [trainersData]);

    // UI mapping with banner (prefetch CDN URLs once resolved)
    const [uiWorkouts, setUiWorkouts] = useState<UIWorkout[]>([]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (tokenLoading) return;
            const mapped = await Promise.all(
                plansSorted.map(async (plan) => {
                    const first = [...(plan.exercises ?? [])].sort((a, b) => a.order - b.order)[0];
                    const bannerUrl = await resolveS3KeyToUrl(first?.avatarUrl ?? undefined, token);
                    if (bannerUrl) {
                        // ✅ warm cache (non-blocking)
                        ExpoImage.prefetch(bannerUrl).catch(() => {});
                    }
                    const trainer = trainersById.get((plan as any).trainerId);
                    return {
                        key: plan._id,
                        title: plan.title,
                        exercisesCount: plan.exercises?.length ?? 0,
                        bannerUrl,
                        scheduled: plan.startDate,
                        description: plan.description ?? undefined,
                        trainerName: trainer?.name
                    } as UIWorkout;
                })
            );
            if (!cancelled) setUiWorkouts(mapped);
        })();
        return () => { cancelled = true; };
    }, [plansSorted, token, tokenLoading, trainersById]);

    const openPlan = useCallback((plan: GQLWorkoutPlan) => {
        setSelectedPlan(plan);
        onOpen();
    }, [onOpen]);

    // resolved exercises for modal (prefetch each asset as we resolve)
    const [resolvedExercises, setResolvedExercises] = useState<
        { name: string; url?: string; sets: number; reps: number; restSeconds: number; order: number }[]
    >([]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!selectedPlan || tokenLoading) return;
            const list = await Promise.all(
                [...(selectedPlan.exercises ?? [])]
                    .sort((a, b) => a.order - b.order)
                    .map(async (ex) => {
                        const url = await resolveS3KeyToUrl(ex.avatarUrl ?? undefined, token);
                        if (url) {
                            // ✅ warm cache
                            ExpoImage.prefetch(url).catch(() => {});
                        }
                        return {
                            name: ex.name,
                            url,
                            sets: ex.sets,
                            reps: ex.reps,
                            restSeconds: ex.restSeconds,
                            order: ex.order,
                        };
                    })
            );
            if (!cancelled) setResolvedExercises(list);
        })();
        return () => { cancelled = true; };
    }, [selectedPlan, token, tokenLoading]);

    return (
        <Box flex={1} bg="gray.50" safeAreaTop>
            {/* Header */}
            <VStack px={6} py={4} bg="white" space={1}>
                <Heading size="lg" color="gray.800">Workouts</Heading>
                <HStack justifyContent="space-between" alignItems="center">
                    <Text color="gray.500" fontSize="md">Your personalized training plan</Text>
                    <Badge variant="subtle" colorScheme="primary">{uiWorkouts.length} plans</Badge>
                </HStack>
            </VStack>
            <Divider />

            {/* List */}
            <ScrollView flex={1} px={6} py={4} showsVerticalScrollIndicator={false}>
                {error && (
                    <Card p={4} bg="red.50" rounded="lg" mb={3}>
                        <Text color="red.700">Failed to load: {error.message}</Text>
                    </Card>
                )}

                {loading || tokenLoading ? (
                    <VStack space={3}>
                        {Array.from({ length: 3 }).map((_, i) => (
                            <Card key={i} p={0} bg="white" rounded="xl" shadow={2}>
                                <Skeleton h={40} w="100%" roundedTop="xl" />
                                <VStack p={4} space={3}>
                                    <Skeleton h="5" w="60%" />
                                    <Skeleton h="4" w="40%" />
                                    <Skeleton h="9" w="100%" />
                                </VStack>
                            </Card>
                        ))}
                    </VStack>
                ) : (
                    <VStack space={3}>
                        {uiWorkouts.map((w) => {
                            const plan = plansSorted.find(p => p._id === w.key)!;
                            return (
                                <WorkoutCard
                                    key={w.key}
                                    item={w}
                                    onOpen={() => openPlan(plan)}
                                />
                            );
                        })}
                        {!uiWorkouts.length && (
                            <Card p={6} bg="white" rounded="xl" alignItems="center">
                                <VStack alignItems="center" space={3}>
                                    <Text fontSize="4xl">📭</Text>
                                    <Text fontSize="lg" fontWeight="semibold" color="gray.600">
                                        No workouts yet
                                    </Text>
                                    <Text fontSize="sm" color="gray.500" textAlign="center">
                                        Your trainer will schedule new workouts soon.
                                    </Text>
                                </VStack>
                            </Card>
                        )}
                    </VStack>
                )}

                <Box h={6} />
            </ScrollView>

            {/* Modal (RN) */}
            <WorkoutDetailModal
                visible={isOpen && !!selectedPlan}
                onClose={onClose}
                plan={selectedPlan}
                resolvedExercises={resolvedExercises}
            />
        </Box>
    );
}
