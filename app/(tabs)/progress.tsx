import React, { useMemo, useState } from "react";
import {
    Box,
    VStack,
    HStack,
    Text,
    ScrollView,
    Card,
    Button,
    Progress,
    Badge,
    Heading,
    Input,
    FormControl,
    useDisclose,
    Skeleton,
    Divider,
    Modal,
} from "native-base";
import { useQuery, useMutation } from "@apollo/client/react";
import { gql } from "@apollo/client";
import { GET_ME } from "@/graphql/queries";
import {
    Modal as RNModal,
    View,
    // Text,
    TextInput,
    Pressable,
    Platform,
    StyleSheet, KeyboardTypeOptions,
} from "react-native";
import WeightLineChartSvg from "@/components/WeightLineChart";

/* ================================
   GraphQL
================================ */
const FITNESS_PROFILE = gql`
    query FitnessProfile($userId: ID!) {
        fitnessProfile(userId: $userId) {
            userId
            profile {
                name
                age
                gender
                heightCm
                currentWeightKg
                activityLevel
                goal
                targetWeightKg
                targetDateISO
                fitnessExperience
                latestMeasurements { neckCm waistCm hipCm }
                computed {
                    bmi
                    bmiCategory
                    bmr
                    tdee
                    estimatedBodyFatPct
                    recommendedCaloriesPerDay
                    summaries { caloriesLine bmiLine }
                }
                startedOnISO
                progressCount
                weightDeltaKgFromStart
            }
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
            bmi
            tdee
            caloriesRecommended
            createdAt
        }
    }
`;

const SESSIONS_FOR_CLIENT = gql`
    query SessionsForClient($clientId: ID!, $pageNumber: Int!, $pageSize: Int!) {
        sessionsForClient(clientId: $clientId, pagination: { pageNumber: $pageNumber, pageSize: $pageSize }) {
            _id
            type
            status
            scheduledStart
            scheduledEnd
            meetingLink
            location { city state country }
            createdAt
            updatedAt
        }
    }
`;

const ADD_PROGRESS = gql`
    mutation AddProgress($input: AddProgressInput!) {
        addProgress(input: $input) {
            userId
            profile { currentWeightKg }
            progress {
                id
                dateISO
                weightKg
                bmi
                createdAt
            }
        }
    }
`;

/* ================================
   Helpers
================================ */
function parseDateSafe(input?: string | number | null): Date | null {
    if (!input) return null;
    if (typeof input === "number" || /^\d+$/.test(String(input))) {
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
const fmtDate = (input?: string | number | null) => {
    const d = parseDateSafe(input);
    return d ? d.toLocaleDateString() : "—";
};

/* ================================
   Small UI bits
================================ */
function StatCard({
                      title,
                      currentValue,
                      previousValue,
                      unit,
                      icon,
                      colorScheme = "primary",
                      trend,
                  }: {
    title: string;
    currentValue: string | number;
    previousValue?: string | number;
    unit?: string;
    icon: string;
    colorScheme?: string;
    trend?: "up" | "down" | "stable";
}) {
    const trendIcon = trend === "up" ? "📈" : trend === "down" ? "📉" : trend === "stable" ? "➖" : "";
    const trendColor =
        trend === "up" ? "success.500" : trend === "down" ? "red.500" : trend === "stable" ? "gray.500" : "gray.500";

    return (
        <Card flex={1} p={4} bg="white" rounded="xl" shadow={2}>
            <VStack space={2}>
                <HStack justifyContent="space-between" alignItems="center">
                    <Text fontSize="sm" color="gray.500" fontWeight="medium">{title}</Text>
                    <Text fontSize="xl">{icon}</Text>
                </HStack>
                <HStack alignItems="baseline" space={1}>
                    <Text fontSize="2xl" fontWeight="bold" color={`${colorScheme}.600`}>
                        {currentValue}
                    </Text>
                    {unit ? <Text fontSize="sm" color="gray.400">{unit}</Text> : null}
                </HStack>
                {previousValue != null && trend && (
                    <Text fontSize="xs" color={trendColor}>
                        {trendIcon} vs last: {previousValue}{unit ? ` ${unit}` : ""}
                    </Text>
                )}
            </VStack>
        </Card>
    );
}

/* ================================
   Weight Entry Modal
================================ */
// ⬇️ replace the whole WeightEntryModal with this
const todayISO = () => new Date().toISOString().slice(0, 10);

type SavePayload = {
    weightKg: number;
    dateISO: string;
    measurements?: { neckCm?: number; waistCm?: number; hipCm?: number };
    notes?: string;
};

export function WeightEntryModal({
                                     isOpen,
                                     onClose,
                                     onSave,
                                     saving,
                                 }: {
    isOpen: boolean;
    onClose: () => void;
    onSave: (payload: SavePayload) => void;
    saving?: boolean;
}) {
    const [weight, setWeight] = useState("");
    const [dateISO, setDateISO] = useState(todayISO());
    const [neck, setNeck] = useState("");
    const [waist, setWaist] = useState("");
    const [hip, setHip] = useState("");
    const [notes, setNotes] = useState("");

    const sanitizeDecimal = (s: string) =>
        s.replace(",", ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

    const ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/;
    const isValidISO = (v: string) => ISO_REGEX.test(v) && !Number.isNaN(new Date(v).getTime());
    const parsedWeight = Number(weight);

    const toNum = (v: string) => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : undefined;
    };

    const canSave =
        Number.isFinite(parsedWeight) && parsedWeight > 0 && (!dateISO || isValidISO(dateISO));

    const decimalKeyboard: KeyboardTypeOptions =
        Platform.OS === "ios" ? "decimal-pad" : "numeric";

    return (
        <RNModal visible={isOpen} transparent animationType="slide" onRequestClose={onClose}>
            <View style={S.backdrop}>
                <View style={S.sheet}>
                    <View style={S.header}>
                        <Text style={S.title}>Log Progress</Text>
                        <Pressable onPress={onClose}><Text style={S.link}>Close</Text></Pressable>
                    </View>

                    <View style={S.field}>
                        <Text style={S.label}>Weight (kg)</Text>
                        <TextInput
                            value={weight}
                            onChangeText={(t) => setWeight(sanitizeDecimal(t))}
                            keyboardType={decimalKeyboard}
                            placeholder="e.g., 75.5"
                            style={S.input}
                        />
                    </View>

                    <View style={S.field}>
                        <Text style={S.label}>Date (YYYY-MM-DD)</Text>
                        <TextInput
                            value={dateISO}
                            onChangeText={setDateISO}
                            autoCapitalize="none"
                            autoCorrect={false}
                            placeholder={todayISO()}
                            style={S.input}
                        />
                        {!isValidISO(dateISO) ? (
                            <Text style={S.error}>Please use YYYY-MM-DD (e.g., {todayISO()}).</Text>
                        ) : null}
                    </View>

                    <View style={[S.row, { gap: 12 }]}>
                        <View style={[S.field, S.flex]}>
                            <Text style={S.label}>Neck (cm)</Text>
                            <TextInput
                                value={neck}
                                onChangeText={(t) => setNeck(sanitizeDecimal(t))}
                                keyboardType={decimalKeyboard}
                                placeholder="e.g., 38"
                                style={S.input}
                            />
                        </View>
                        <View style={[S.field, S.flex]}>
                            <Text style={S.label}>Waist (cm)</Text>
                            <TextInput
                                value={waist}
                                onChangeText={(t) => setWaist(sanitizeDecimal(t))}
                                keyboardType={decimalKeyboard}
                                placeholder="e.g., 85"
                                style={S.input}
                            />
                        </View>
                        <View style={[S.field, S.flex]}>
                            <Text style={S.label}>Hip (cm)</Text>
                            <TextInput
                                value={hip}
                                onChangeText={(t) => setHip(sanitizeDecimal(t))}
                                keyboardType={decimalKeyboard}
                                placeholder="e.g., 100"
                                style={S.input}
                            />
                        </View>
                    </View>

                    <View style={S.field}>
                        <Text style={S.label}>Notes</Text>
                        <TextInput
                            value={notes}
                            onChangeText={setNotes}
                            placeholder="Anything notable about today’s weigh-in"
                            style={[S.input, { height: 44 }]}
                        />
                    </View>

                    <View style={[S.row, { justifyContent: "flex-end", marginTop: 8 }]}>
                        <Pressable onPress={onClose} style={[S.btn, S.btnGhost]}>
                            <Text style={S.btnTextGhost}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            disabled={!canSave || !!saving}
                            onPress={() =>
                                onSave({
                                    weightKg: parsedWeight,
                                    dateISO: isValidISO(dateISO) ? dateISO : todayISO(),
                                    measurements: { neckCm: toNum(neck), waistCm: toNum(waist), hipCm: toNum(hip) },
                                    notes: notes.trim() ? notes.trim() : undefined,
                                })
                            }
                            style={[S.btn, !canSave || saving ? S.btnDisabled : S.btnPrimary]}
                        >
                            <Text style={S.btnTextPrimary}>{saving ? "Saving..." : "Save"}</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </RNModal>
    );
}


/* ================================
   Screen
================================ */
export default function ProgressSection() {
    const { data: meData } = useQuery(GET_ME);
    // @ts-ignore
    const userId: string | undefined = meData?.user?._id;

    const { isOpen, onOpen, onClose } = useDisclose();

    // Profile
    const { data: fpData, loading: fpLoading } = useQuery(FITNESS_PROFILE, {
        variables: { userId: userId as string },
        skip: !userId,
        fetchPolicy: "no-cache",
        nextFetchPolicy: "no-cache",
    });

    // Progress last 90 days (enough to compute trends safely)
    const { data: prData, loading: prLoading, refetch: refetchProgress } = useQuery(PROGRESS_REPORT, {
        variables: { userId: userId as string, range: { /* fromISO optional */ } },
        skip: !userId,
        fetchPolicy: "no-cache",
        nextFetchPolicy: "no-cache",
    });

    // Sessions (just show completed)
    const { data: sessData, loading: sessLoading } = useQuery(SESSIONS_FOR_CLIENT, {
        variables: { clientId: userId as string, pageNumber: 1, pageSize: 50 },
        skip: !userId,
        fetchPolicy: "no-cache",
        nextFetchPolicy: "no-cache",
    });

    // Add progress mutation
    const [addProgress, { loading: saving }] = useMutation(ADD_PROGRESS, {
        onCompleted: () => {
            onClose();
            refetchProgress();
        },
    });

    // Derive stats
    // @ts-ignore
    const profile = fpData?.fitnessProfile?.profile;
    // @ts-ignore
    const progress = (prData?.progressReport ?? []).slice().sort((a: any, b: any) => {
        const da = parseDateSafe(a.dateISO)?.getTime() ?? 0;
        const db = parseDateSafe(b.dateISO)?.getTime() ?? 0;
        return db - da;
    });

    const latest = progress[0];
    const prev = progress[1];

    const currentWeight = latest?.weightKg ?? profile?.currentWeightKg ?? null;
    const previousWeight = prev?.weightKg ?? null;
    const weightTrend: "up" | "down" | "stable" | undefined =
        previousWeight == null || currentWeight == null
            ? undefined
            : currentWeight < previousWeight
                ? "down"
                : currentWeight > previousWeight
                    ? "up"
                    : "stable";

    const currentBmi = latest?.bmi ?? profile?.computed?.bmi ?? null;
    const previousBmi = prev?.bmi ?? null;
    const bmiTrend: "up" | "down" | "stable" | undefined =
        previousBmi == null || currentBmi == null
            ? undefined
            : currentBmi < previousBmi
                ? "down"
                : currentBmi > previousBmi
                    ? "up"
                    : "stable";

    // Completed sessions
    const completedSessions = useMemo(() => {
        // @ts-ignore
        const list: any[] = sessData?.sessionsForClient ?? [];
        return list
            .filter((s) => s.status === "COMPLETED")
            .sort((a, b) => {
                const da = parseDateSafe(a.scheduledStart)?.getTime() ?? 0;
                const db = parseDateSafe(b.scheduledStart)?.getTime() ?? 0;
                return db - da;
            })
            .slice(0, 5);
    }, [sessData]);

    const handleSaveWeight = (payload: {
        weightKg: number;
        dateISO: string;
        measurements?: { neckCm?: number; waistCm?: number; hipCm?: number };
        notes?: string;
    }) => {
        if (!userId) return;
        addProgress({
            variables: {
                input: {
                    userId,
                    dateISO: payload.dateISO,
                    weightKg: payload.weightKg,
                    measurements: payload.measurements,
                    notes: payload.notes,
                },
            },
        });
    };

    const loadingAny = fpLoading || prLoading || sessLoading;

    return (
        <Box flex={1} bg="gray.50" safeAreaTop>
            <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                <VStack space={6} p={6}>
                    {/* Header */}
                    <VStack space={1}>
                        <Heading size="lg" color="gray.800">
                            Your Progress
                        </Heading>
                        <HStack alignItems="center" justifyContent="space-between">
                            <Text color="gray.500" fontSize="md">
                                Track your fitness journey
                            </Text>
                            {profile ? (
                                <Badge colorScheme="primary" variant="subtle">
                                    {profile?.name ?? "You"}
                                </Badge>
                            ) : null}
                        </HStack>
                    </VStack>

                    {/* Quick Stats */}
                    <VStack space={3}>
                        <HStack justifyContent="space-between" alignItems="center">
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">
                                This Week
                            </Text>
                            <Button size="sm" onPress={onOpen} colorScheme="primary">
                                + Log Weight
                            </Button>
                        </HStack>

                        {loadingAny ? (
                            <HStack space={3}>
                                <Card flex={1} p={4}><Skeleton h="24" /></Card>
                                <Card flex={1} p={4}><Skeleton h="24" /></Card>
                            </HStack>
                        ) : (
                            <>
                                <HStack space={3}>
                                    <StatCard
                                        title="Current Weight"
                                        currentValue={currentWeight != null ? currentWeight.toFixed(1) : "—"}
                                        previousValue={previousWeight != null ? previousWeight.toFixed(1) : undefined}
                                        unit="kg"
                                        icon="⚖️"
                                        colorScheme="info"
                                        trend={weightTrend}
                                    />
                                    <StatCard
                                        title="BMI"
                                        currentValue={currentBmi != null ? currentBmi.toFixed(1) : "—"}
                                        previousValue={previousBmi != null ? previousBmi.toFixed(1) : undefined}
                                        unit=""
                                        icon="📊"
                                        colorScheme="success"
                                        trend={bmiTrend}
                                    />
                                </HStack>

                                <HStack space={3}>
                                    <StatCard
                                        title="TDEE"
                                        currentValue={profile?.computed?.tdee ?? "—"}
                                        unit="kcal"
                                        icon="🔥"
                                        colorScheme="orange"
                                    />
                                    <StatCard
                                        title="Daily Target"
                                        currentValue={profile?.computed?.recommendedCaloriesPerDay ?? "—"}
                                        unit="kcal"
                                        icon="🎯"
                                        colorScheme="purple"
                                    />
                                </HStack>
                            </>
                        )}
                    </VStack>

                    {/* Weight Trend (placeholder for chart) */}
                    <Card p={4} bg="white" rounded="xl" shadow={2}>
                        <VStack space={4}>
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">
                                Weight Trend (Last 90 Days)
                            </Text>

                            <WeightLineChartSvg
                                progress={progress /* your sorted array from progressReport */}
                                height={260}
                                width={360}   // adjust or compute from window width
                            />

                            <HStack justifyContent="space-between">
                                <VStack alignItems="center">
                                    <Text fontSize="sm" color="gray.500">From</Text>
                                    <Text fontSize="md" fontWeight="semibold">
                                        {fmtDate(progress[progress.length - 1]?.dateISO)}
                                    </Text>
                                </VStack>
                                <VStack alignItems="center">
                                    <Text fontSize="sm" color="gray.500">To</Text>
                                    <Text fontSize="md" fontWeight="semibold">
                                        {fmtDate(progress[0]?.dateISO)}
                                    </Text>
                                </VStack>
                            </HStack>
                        </VStack>
                    </Card>

                    {/* Body Measurements / Profile Snapshot */}
                    <Card p={4} bg="white" rounded="xl" shadow={2}>
                        <VStack space={4}>
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">
                                Profile Snapshot
                            </Text>
                            {fpLoading ? (
                                <Skeleton h="20" />
                            ) : profile ? (
                                <VStack space={3}>
                                    <HStack justifyContent="space-between">
                                        <Text color="gray.600">Started</Text>
                                        <Text fontWeight="semibold">{fmtDate(profile.startedOnISO)}</Text>
                                    </HStack>
                                    <HStack justifyContent="space-between">
                                        <Text color="gray.600">Experience</Text>
                                        <Text fontWeight="semibold">{profile.fitnessExperience ?? "—"}</Text>
                                    </HStack>
                                    <HStack justifyContent="space-between">
                                        <Text color="gray.600">Activity</Text>
                                        <Text fontWeight="semibold">{profile.activityLevel ?? "—"}</Text>
                                    </HStack>
                                    <Divider />
                                    <HStack justifyContent="space-between">
                                        <Text color="gray.600">Goal Weight</Text>
                                        <Text fontWeight="semibold">{profile.targetWeightKg ?? "—"} kg</Text>
                                    </HStack>
                                    <HStack justifyContent="space-between">
                                        <Text color="gray.600">Target Date</Text>
                                        <Text fontWeight="semibold">{fmtDate(profile.targetDateISO)}</Text>
                                    </HStack>
                                </VStack>
                            ) : (
                                <Text color="gray.500">No profile yet.</Text>
                            )}
                        </VStack>
                    </Card>

                    {/* Recent Completed Sessions */}
                    <Card p={4} bg="white" rounded="xl" shadow={2}>
                        <VStack space={3}>
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">
                                Recent Sessions (Completed)
                            </Text>
                            {sessLoading ? (
                                <VStack space={2}>
                                    <Skeleton h="12" />
                                    <Skeleton h="12" />
                                </VStack>
                            ) : completedSessions.length ? (
                                <VStack space={2}>
                                    {completedSessions.map((s) => (
                                        <Card key={s._id} p={3} bg="gray.50" rounded="lg">
                                            <HStack justifyContent="space-between" alignItems="center">
                                                <VStack>
                                                    <Text fontWeight="semibold">✅ {s.type.replace("_", " ")}</Text>
                                                    <Text fontSize="xs" color="gray.500">
                                                        {fmtDate(s.scheduledStart)} — {fmtDate(s.scheduledEnd)}
                                                    </Text>
                                                </VStack>
                                                <Badge colorScheme="success" variant="subtle">COMPLETED</Badge>
                                            </HStack>
                                        </Card>
                                    ))}
                                </VStack>
                            ) : (
                                <Text color="gray.500">No completed sessions yet.</Text>
                            )}
                        </VStack>
                    </Card>

                    <Box h={6} />
                </VStack>
            </ScrollView>

            {/* Weight Entry Modal */}
            {isOpen ? (
                <WeightEntryModal
                    key="weight-modal"
                    isOpen
                    onClose={onClose}
                    onSave={handleSaveWeight}
                    saving={saving}
                />
            ) : null}
        </Box>
    );
}


const S = StyleSheet.create({
    backdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.35)",
        justifyContent: "flex-end",
    },
    sheet: {
        backgroundColor: "#fff",
        padding: 16,
        borderTopLeftRadius: 16,
        borderTopRightRadius: 16,
    },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 },
    title: { fontSize: 18, fontWeight: "700", color: "#111" },
    link: { color: "#2563eb", fontWeight: "600" },
    field: { marginBottom: 12 },
    label: { fontSize: 13, color: "#6b7280", marginBottom: 6 },
    input: {
        borderWidth: 1,
        borderColor: "#e5e7eb",
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === "ios" ? 10 : 8,
        fontSize: 16,
        color: "#111827",
    },
    error: { marginTop: 4, fontSize: 12, color: "#ef4444" },
    row: { flexDirection: "row", alignItems: "center" },
    flex: { flex: 1 },
    btn: {
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 10,
        marginLeft: 8,
    },
    btnGhost: { backgroundColor: "transparent" },
    btnPrimary: { backgroundColor: "#111827" },
    btnDisabled: { backgroundColor: "#9ca3af" },
    btnTextPrimary: { color: "#fff", fontWeight: "700" },
    btnTextGhost: { color: "#374151", fontWeight: "600" },
});