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
    Divider,
    useDisclose,
    useToast,
    Skeleton,
    FormControl,
    IconButton, ChevronLeftIcon, ChevronRightIcon
} from 'native-base';
import {Modal as RNModal, SafeAreaView, TouchableOpacity, TextInput, Platform, Alert} from 'react-native';
import { useQuery, useMutation } from '@apollo/client/react';
import { gql } from '@apollo/client';

import { GET_ME } from '@/graphql/queries';
import { getTokens } from '@/lib/apollo';
import { ENV } from '@/lib/env';
import { Image as ExpoImage } from 'expo-image'; // ✅ cached images

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

const WORKOUT_LOGS_BY_DATE = gql`
    query WorkoutLogsByDate($clientId: ID!, $date: String!) {
        workoutLogsByDate(clientId: $clientId, date: $date) {
            id
            clientId
            date
            planId
            planExerciseOrder
            name
            videoUrl
            avatarUrl
            sets { set reps weightKg restSeconds }
            totalSets
            repsPerSet
            restSeconds
            durationSeconds
            rpe
            source
            compliance
            notes
            createdAt
            updatedAt
        }
    }
`;

const ADD_WORKOUT_LOG = gql`
    mutation AddWorkoutLog($input: CreateWorkoutLogInput!) {
        addWorkoutLog(input: $input) {
            id
            clientId
            date
            planId
            planExerciseOrder
            name
            videoUrl
            avatarUrl
            totalSets
            repsPerSet
            restSeconds
            durationSeconds
            rpe
            source
            compliance
            notes
            createdAt
            updatedAt
        }
    }
`;

/* ================================
   Helpers
================================ */
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

function isSameLocalDay(a: Date, b: Date) {
    return a.getFullYear() === b.getFullYear() &&
        a.getMonth() === b.getMonth() &&
        a.getDate() === b.getDate();
}
function prettyLocalDate(d: Date) {
    return d.toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
}

function toLocalISODate(d = new Date()) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}
const S = {
    input: {
        borderWidth: 1,
        borderColor: '#e5e7eb',
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === 'ios' ? 10 : 8,
        fontSize: 16,
        color: '#111827',
        backgroundColor: '#fff',
    } as any,
};

function extractGraphQLError(err: any): string {
    try {
        const gql = err?.graphQLErrors || err?.error?.graphQLErrors;
        if (Array.isArray(gql) && gql.length) {
            const first = gql[0];
            const code = first?.extensions?.code;
            const path = Array.isArray(first?.path) ? first.path.join('.') : undefined;
            const detail =
                first?.extensions?.exception?.message ||
                first?.extensions?.exception?.stacktrace?.[0] ||
                first?.message;
            return [code ? `[${code}]` : null, path ? `at ${path}` : null, detail]
                .filter(Boolean)
                .join(' ');
        }
        const net = err?.networkError;
        if (net) {
            const status = net.statusCode ?? net.status;
            const bodyMsg =
                net.result?.errors?.[0]?.message || net.bodyText || net.message;
            return `Network${status ? ` ${status}` : ''}: ${bodyMsg || 'Request failed'}`;
        }
        return err?.message || 'Unknown error';
    } catch {
        return String(err || 'Unknown error');
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
    trainerId?: string | null;
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
   Visual bits
================================ */
function NBCard({ children, p = 4, bg = 'white', rounded = 'xl', ...rest }: any) {
    return (
        <Card p={p} bg={bg} rounded={rounded} borderWidth={1} borderColor="coolGray.200" {...rest}>
            {children}
        </Card>
    );
}

function WorkoutCard({ item, onOpen }: { item: UIWorkout; onOpen: () => void }) {
    const [imgLoaded, setImgLoaded] = useState(false);
    return (
        <Card p={0} bg="white" rounded="xl" shadow={2} mb={3}>
            <VStack space={0}>
                {item.bannerUrl ? (
                    <Box position="relative" roundedTop="xl" overflow="hidden">
                        {!imgLoaded && <Skeleton h={48} w="100%" rounded="0" />}
                        <ExpoImage
                            source={{ uri: item.bannerUrl }}
                            style={{ width: '100%', height: 192 }}
                            contentFit="cover"
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
                        <Badge colorScheme="info" variant="outline">
                            Plan
                        </Badge>
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
    );
}

function LoggedWorkoutCard({
                               title,
                               rpe,
                               durationSeconds,
                               totalSets,
                               repsPerSet,
                               compliance,
                               source,
                               notes,
                               createdAt,
                           }: {
    title: string;
    rpe?: number | null;
    durationSeconds?: number | null;
    totalSets?: number | null;
    repsPerSet?: number | null;
    compliance: 'ON_PLAN' | 'OFF_PLAN' | 'PARTIAL';
    source: 'PLANNED' | 'EXTRA';
    notes?: string | null;
    createdAt?: string | null;
}) {
    return (
        <NBCard p={4} bg="white" rounded="xl">
            <VStack space={2}>
                <HStack justifyContent="space-between" alignItems="center">
                    <VStack>
                        <Text fontSize="md" fontWeight="semibold" color="gray.800">
                            {title}
                        </Text>
                        <Text fontSize="xs" color="gray.500">
                            {createdAt ? `Logged ${formatDateShort(createdAt)}` : ''}
                        </Text>
                    </VStack>
                    <HStack space={2}>
                        <Badge colorScheme={source === 'PLANNED' ? 'primary' : 'amber'}>{source}</Badge>
                        <Badge colorScheme={compliance === 'ON_PLAN' ? 'success' : compliance === 'PARTIAL' ? 'warning' : 'error'}>
                            {compliance}
                        </Badge>
                    </HStack>
                </HStack>

                <HStack space={6} flexWrap="wrap">
                    {Number.isFinite(totalSets) && Number.isFinite(repsPerSet) && (
                        <Badge variant="subtle" colorScheme="coolGray">
                            {totalSets} × {repsPerSet}
                        </Badge>
                    )}
                    {Number.isFinite(rpe) && <Badge variant="subtle" colorScheme="purple">RPE {rpe}</Badge>}
                    {Number.isFinite(durationSeconds) && (
                        <Badge variant="subtle" colorScheme="info">
                            {durationSeconds}s
                        </Badge>
                    )}
                </HStack>

                {notes ? <Text fontSize="sm" color="gray.600">{notes}</Text> : null}
            </VStack>
        </NBCard>
    );
}

/* ================================
   Exercise row with quick log
================================ */
function ExerciseRow({
                         name,
                         url,
                         sets,
                         reps,
                         restSeconds,
                         order,
                         onLog,
                         logging,
                     }: {
    name: string;
    url?: string;
    sets: number;
    reps: number;
    restSeconds: number;
    order: number;
    logging?: boolean;
    onLog: (extras?: { rpe?: number; durationSeconds?: number; notes?: string }) => void;
}) {
    const [imgLoaded, setImgLoaded] = useState(false);
    const [rpe, setRpe] = useState<string>('7');
    const [dur, setDur] = useState<string>('');
    const [notes, setNotes] = useState<string>('');

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
            <VStack p={3} space={3}>
                <HStack justifyContent="space-between" alignItems="center">
                    <Text fontSize="md" fontWeight="semibold">
                        {order}. {name}
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                        Rest: {restSeconds}s
                    </Text>
                </HStack>

                <Text fontSize="sm" color="gray.600">
                    {sets} sets × {reps} reps
                </Text>

                {/* Quick inputs */}
                <HStack space={3}>
                    <FormControl flex={1}>
                        <FormControl.Label>RPE</FormControl.Label>
                        <TextInput
                            value={rpe}
                            onChangeText={setRpe}
                            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                            style={S.input}
                            placeholder="7"
                        />
                    </FormControl>
                    <FormControl flex={1}>
                        <FormControl.Label>Duration (s)</FormControl.Label>
                        <TextInput
                            value={dur}
                            onChangeText={setDur}
                            keyboardType={Platform.OS === 'ios' ? 'decimal-pad' : 'numeric'}
                            style={S.input}
                            placeholder="e.g., 300"
                        />
                    </FormControl>
                </HStack>

                <FormControl>
                    <FormControl.Label>Notes</FormControl.Label>
                    <TextInput
                        value={notes}
                        onChangeText={setNotes}
                        style={S.input}
                        placeholder="Optional notes"
                    />
                </FormControl>

                <HStack justifyContent="flex-end">
                    <Button
                        isDisabled={!!logging}
                        onPress={() =>
                            onLog({
                                rpe: Number.isFinite(Number(rpe)) ? Number(rpe) : undefined,
                                durationSeconds: Number.isFinite(Number(dur)) ? Number(dur) : undefined,
                                notes: notes?.trim() || undefined,
                            })
                        }
                    >
                        {logging ? 'Logging...' : 'Log Exercise'}
                    </Button>
                </HStack>
            </VStack>
        </Card>
    );
}

/* ================================
   Plan Detail Modal
================================ */
function WorkoutDetailModal({
                                visible,
                                onClose,
                                plan,
                                resolvedExercises,
                                onLogExercise,
                                loggingOrder,
                            }: {
    visible: boolean;
    onClose: () => void;
    plan?: GQLWorkoutPlan | null;
    resolvedExercises: { name: string; url?: string; sets: number; reps: number; restSeconds: number; order: number }[];
    onLogExercise: (p: { order: number; name: string; rpe?: number; durationSeconds?: number; notes?: string }) => void;
    loggingOrder?: number | null;
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
                                            logging={loggingOrder === ex.order}
                                            onLog={(extras) => onLogExercise({ order: ex.order, name: ex.name, ...extras })}
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
    const [loggingOrder, setLoggingOrder] = useState<number | null>(null);

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

    // date scope for logs (today for now)
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const isoDate = useMemo(() => toLocalISODate(currentDate), [currentDate]);

    // server data
    const { data: plansResp, loading: plansLoading, error: plansErr } = useQuery<{ workoutPlansForClient: GQLWorkoutPlan[] }>(
        WORKOUT_PLANS_FOR_CLIENT,
        {
            variables: { clientId: clientId as string, pageNumber: 1, pageSize: 20 },
            skip: !clientId,
            fetchPolicy: 'no-cache',
            nextFetchPolicy: 'no-cache',
        }
    );

    const plansSorted: GQLWorkoutPlan[] = useMemo(() => {
        const p = plansResp?.workoutPlansForClient ?? [];
        return [...p].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    }, [plansResp]);

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

    // map plans → UI
    const [uiWorkouts, setUiWorkouts] = useState<UIWorkout[]>([]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (tokenLoading) return;
            const mapped = await Promise.all(
                plansSorted.map(async (plan) => {
                    const first = [...(plan.exercises ?? [])].sort((a, b) => a.order - b.order)[0];
                    const bannerUrl = await resolveS3KeyToUrl(first?.avatarUrl ?? undefined, token);
                    if (bannerUrl) ExpoImage.prefetch(bannerUrl).catch(() => {});
                    const trainer = plan.trainerId ? trainersById.get(plan.trainerId) : undefined;
                    return {
                        key: plan._id,
                        title: plan.title,
                        exercisesCount: plan.exercises?.length ?? 0,
                        bannerUrl,
                        scheduled: plan.startDate,
                        description: plan.description ?? undefined,
                        trainerName: trainer?.name,
                    } as UIWorkout;
                })
            );
            if (!cancelled) setUiWorkouts(mapped);
        })();
        return () => { cancelled = true; };
    }, [plansSorted, token, tokenLoading, trainersById]);

    // resolved exercises for modal (prefetch each asset)
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
                        if (url) ExpoImage.prefetch(url).catch(() => {});
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

    // logs by date
    const {
        data: logsResp,
        loading: logsLoading,
        error: logsErr,
        refetch: refetchLogs,
    } = useQuery(WORKOUT_LOGS_BY_DATE, {
        variables: { clientId: clientId as string, date: isoDate },
        skip: !clientId,
        fetchPolicy: 'no-cache',
        nextFetchPolicy: 'no-cache',
    });
    const workoutLogs = logsResp?.workoutLogsByDate ?? [];

    // mutation + saver
    const [runAddWorkoutLog, { loading: creatingLog }] = useMutation(ADD_WORKOUT_LOG);

    const saveWorkoutLog = useCallback(
        async ({
                   plan,
                   exercise,
                   extras,
               }: {
            plan: GQLWorkoutPlan;
            exercise: GQLExercise;
            extras?: {
                durationSeconds?: number;
                rpe?: number;
                notes?: string;
                setsOverride?: { set: number; reps: number; weightKg?: number; restSeconds?: number }[];
                source?: 'PLANNED' | 'EXTRA';
                compliance?: 'ON_PLAN' | 'OFF_PLAN' | 'PARTIAL';
            };
        }) => {
            try {
                if (!clientId) {
                    Alert.alert('User not ready yet. Please try again.');
                    return;
                }

                const totalSets = Number.isFinite(exercise.sets) ? exercise.sets : undefined;
                const repsPerSet = Number.isFinite(exercise.reps) ? exercise.reps : undefined;
                const restSeconds = Number.isFinite(exercise.restSeconds) ? exercise.restSeconds : undefined;

                let setsPayload:
                    | { set: number; reps: number; weightKg?: number; restSeconds?: number }[]
                    | undefined = extras?.setsOverride;

                if (!setsPayload && totalSets && repsPerSet) {
                    setsPayload = Array.from({ length: totalSets }, (_, i) => ({
                        set: i + 1,
                        reps: repsPerSet,
                        restSeconds,
                    }));
                }

                const input: any = {
                    clientId,
                    date: isoDate,
                    planId: plan._id,
                    planExerciseOrder: exercise.order,
                    name: exercise.name,
                    videoUrl: exercise.videoUrl ?? undefined,
                    avatarUrl: exercise.avatarUrl ?? undefined,
                    sets: setsPayload,
                    totalSets,
                    repsPerSet,
                    restSeconds,
                    durationSeconds:
                        Number.isFinite(extras?.durationSeconds) ? extras?.durationSeconds : undefined,
                    rpe: Number.isFinite(extras?.rpe) ? extras?.rpe : undefined,
                    source: extras?.source ?? 'PLANNED',
                    compliance: extras?.compliance ?? 'ON_PLAN',
                    notes: extras?.notes?.trim() || undefined,
                };

                setLoggingOrder(exercise.order);
                await runAddWorkoutLog({ variables: { input } });
                setLoggingOrder(null);

                Alert.alert('Workout logged');
                await refetchLogs();
            } catch (e: any) {
                setLoggingOrder(null);
                const msg = extractGraphQLError(e);
                console.error('AddWorkoutLog error:', e);
                Alert.alert('Failed to save workout');
            }
        },
        [clientId, runAddWorkoutLog, refetchLogs]
    );

    const openPlan = useCallback((plan: GQLWorkoutPlan) => {
        setSelectedPlan(plan);
        onOpen();
    }, [onOpen]);

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

            <ScrollView flex={1} px={6} py={4} showsVerticalScrollIndicator={false}>
                {(plansErr || logsErr) && (
                    <Card p={4} bg="red.50" rounded="lg" mb={3}>
                        <Text color="red.700">
                            {plansErr ? `Plans: ${plansErr.message}` : ''}
                            {plansErr && logsErr ? ' • ' : ''}
                            {logsErr ? `Logs: ${logsErr.message}` : ''}
                        </Text>
                    </Card>
                )}

                {/* Today summary */}
                <NBCard p={4} bg="white" rounded="xl" mb={4}>
                    <HStack justifyContent="space-between" alignItems="center">
                        <Text fontSize="lg" fontWeight="bold" color="gray.800">
                            Today • {isoDate}
                        </Text>
                        <Badge colorScheme="coolGray" variant="subtle">
                            {workoutLogs.length} logged
                        </Badge>
                    </HStack>
                </NBCard>

                {/* Plans */}
                <VStack space={3} mb={6}>
                    <Text fontSize="lg" fontWeight="bold" color="gray.800">Plans</Text>

                    {plansLoading || tokenLoading ? (
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
                                const plan = plansSorted.find((p) => p._id === w.key)!;
                                return <WorkoutCard key={w.key} item={w} onOpen={() => openPlan(plan)} />;
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
                </VStack>

                <NBCard p={4} bg="white" rounded="xl" mb={4}>
                    <VStack space={2}>
                        {/* Row 1: centered day navigator (wrap-safe) */}
                        <HStack space={2} justifyContent="center" alignItems="center" flexWrap="wrap">
                            <IconButton
                                variant="ghost"
                                size="sm"
                                icon={<ChevronLeftIcon />}
                                onPress={() =>
                                    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1))
                                }
                            />
                            <VStack maxW="70%">
                                <Text fontSize="md" fontWeight="bold" color="gray.800" textAlign="center">
                                    {isSameLocalDay(currentDate, new Date()) ? 'Today' : 'Selected Day'}
                                </Text>
                                <Text
                                    fontSize="xs"
                                    color="gray.500"
                                    textAlign="center"
                                    numberOfLines={1}
                                    ellipsizeMode="tail"
                                >
                                    {prettyLocalDate(currentDate)} • {isoDate}
                                </Text>
                            </VStack>
                            <IconButton
                                variant="ghost"
                                size="sm"
                                isDisabled={isSameLocalDay(currentDate, new Date())}
                                icon={<ChevronRightIcon />}
                                onPress={() =>
                                    setCurrentDate(d => new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1))
                                }
                            />
                        </HStack>

                        {/* Row 2: actions + count (spread, never overflows) */}
                        <HStack justifyContent="space-between" alignItems="center">
                            <Button
                                size="sm"
                                variant={isSameLocalDay(currentDate, new Date()) ? 'outline' : 'solid'}
                                onPress={() => setCurrentDate(new Date())}
                            >
                                Today
                            </Button>
                            <Badge colorScheme="coolGray" variant="subtle">
                                {workoutLogs.length} logged
                            </Badge>
                        </HStack>
                    </VStack>
                </NBCard>



                {/* Logged today */}
                <VStack space={3}>
                    <HStack alignItems="center" justifyContent="space-between" mb={1}>
                        <Text fontSize="lg" fontWeight="bold" color="gray.800">
                            {isSameLocalDay(currentDate, new Date()) ? 'Logged Today' : `Logged on ${isoDate}`}
                        </Text>
                        <Text fontSize="sm" color="gray.500">{workoutLogs.length} item(s)</Text>
                    </HStack>

                    {logsLoading ? (
                        <VStack space={3}>
                            {Array.from({ length: 3 }).map((_, i) => (
                                <NBCard key={i} p={4} bg="white" rounded="xl">
                                    <Skeleton h="6" mb="2" rounded="md" />
                                    <Skeleton h="4" mb="1" rounded="md" />
                                </NBCard>
                            ))}
                        </VStack>
                    ) :  workoutLogs.length ? (
                        <VStack space={3}>
                    {workoutLogs
                        .slice()
                        .sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || '')) // newest first
                        .map((l: any) => (
                            <LoggedWorkoutCard
                                key={l.id}
                                title={l.name}
                                rpe={l.rpe}
                                durationSeconds={l.durationSeconds}
                                totalSets={l.totalSets}
                                repsPerSet={l.repsPerSet}
                                compliance={l.compliance}
                                source={l.source}
                                notes={l.notes}
                                createdAt={l.createdAt}
                            />
                        ))}
                </VStack>
                ) : (
                <NBCard p={4} bg="white" rounded="xl">
                    <Text color="gray.600">No workouts logged for this day.</Text>
                </NBCard>
                )}
                </VStack>

                <Box h={8} />
            </ScrollView>

            {/* Modal */}
            <WorkoutDetailModal
                visible={isOpen && !!selectedPlan}
                onClose={onClose}
                plan={selectedPlan}
                resolvedExercises={resolvedExercises}
                loggingOrder={loggingOrder}
                onLogExercise={(p) => {
                    const ex = selectedPlan?.exercises?.find((e) => e.order === p.order);
                    if (!selectedPlan || !ex) return;
                    saveWorkoutLog({
                        plan: selectedPlan,
                        exercise: ex,
                        extras: { rpe: p.rpe, durationSeconds: p.durationSeconds, notes: p.notes },
                    });
                }}
            />
        </Box>
    );
}
