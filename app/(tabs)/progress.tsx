import React, { useMemo, useState, useCallback, useRef } from "react";
import {
  Box,
  Button,
  HStack,
  Heading,
  ScrollView as NBScrollView,
  Skeleton,
  Spinner,
  Text,
  VStack,
  useDisclose,
} from "native-base";
import {
  KeyboardAvoidingView,
  Modal as RNModal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView as RNScrollView,
  TextInput,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { useMutation } from "@apollo/client/react";
import { useCachedQuery } from "@/hooks/useCachedQuery";
import { gql } from "@apollo/client";
import { useFocusEffect } from "@react-navigation/native";
import Screen from "@/components/ui/Screen";
import { GET_ME } from "@/graphql/queries";
import WeightLineChartSvg from "@/components/WeightLineChart";

/* =================================
   GraphQL
================================= */
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
        latestMeasurements {
          neckCm
          waistCm
          hipCm
        }
        computed {
          bmi
          bmiCategory
          tdee
          estimatedBodyFatPct
          recommendedCaloriesPerDay
        }
        startedOnISO
        progressCount
        weightDeltaKgFromStart
      }
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
      createdAt
    }
  }
`;

const SESSIONS_FOR_CLIENT = gql`
  query SessionsForClient($clientId: ID!, $pageNumber: Int!, $pageSize: Int!) {
    sessionsForClient(
      clientId: $clientId
      pagination: { pageNumber: $pageNumber, pageSize: $pageSize }
    ) {
      _id
      type
      status
      scheduledStart
      scheduledEnd
      createdAt
    }
  }
`;

const ADD_PROGRESS = gql`
  mutation AddProgress($input: AddProgressInput!) {
    addProgress(input: $input) {
      userId
      profile {
        currentWeightKg
      }
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

/* =================================
   Theme helpers
================================= */
const THEME_BG = "#05060B";
const CARD_BG = "rgba(15,17,26,0.95)";
const BORDER_COLOR = "rgba(255,255,255,0.08)";
const ACCENT = "#C4B5FD";
const ACCENT_SOLID = "#7C3AED";

const INPUT_PLACEHOLDER = "rgba(203,213,225,0.7)";
const INPUT_STYLE = {
  borderWidth: 1,
  borderColor: BORDER_COLOR,
  borderRadius: 18,
  paddingHorizontal: 16,
  paddingVertical: Platform.OS === "ios" ? 12 : 8,
  backgroundColor: "rgba(255,255,255,0.05)",
  color: "white",
  fontSize: 16,
} as const;

const GlassCard = ({
  children,
  gradient,
  ...rest
}: {
  children: React.ReactNode;
  gradient?: boolean;
  [key: string]: any;
}) => (
  <Box
    p={4}
    rounded="2xl"
    borderWidth={1}
    borderColor={BORDER_COLOR}
    bg={
      gradient
        ? {
            linearGradient: {
              colors: ["rgba(124,58,237,0.25)", "rgba(5,6,11,0.95)"],
              start: [0, 0],
              end: [1, 1],
            },
          }
        : CARD_BG
    }
    shadow={2}
    {...rest}
  >
    {children}
  </Box>
);

const InfoChip = ({
  icon,
  label,
  color = ACCENT,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
}) => (
  <HStack
    px={3}
    py={1.5}
    space={2}
    alignItems="center"
    rounded="full"
    borderWidth={1}
    borderColor={BORDER_COLOR}
    bg="rgba(255,255,255,0.05)"
  >
    <Ionicons name={icon} size={14} color={color} />
    <Text fontSize="xs" color="coolGray.200">
      {label}
    </Text>
  </HStack>
);

const MetricCard = ({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle?: string;
  icon: keyof typeof Ionicons.glyphMap;
}) => (
  <GlassCard flex={1}>
    <HStack justifyContent="space-between" alignItems="center" mb={3}>
      <Text fontSize="xs" color="coolGray.400">
        {title}
      </Text>
      <Box
        rounded="full"
        p={2}
        borderWidth={1}
        borderColor={BORDER_COLOR}
        bg="rgba(124,58,237,0.15)"
      >
        <Ionicons name={icon} size={16} color={ACCENT} />
      </Box>
    </HStack>
    <Text fontSize="2xl" fontWeight="bold" color="white">
      {value}
    </Text>
    {subtitle ? (
      <Text fontSize="xs" color="coolGray.400" mt={1}>
        {subtitle}
      </Text>
    ) : null}
  </GlassCard>
);

function parseDateSafe(input?: string | number | null): Date | null {
  if (!input) return null;
  if (typeof input === "number" || /^\d+$/.test(String(input))) {
    const s = String(input);
    let ms = Number(s);
    if (s.length >= 16) ms = ms / 1_000_000;
    else if (s.length >= 13) ms = ms;
    else if (s.length >= 10) ms = ms * 1000;
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

const todayISO = () => new Date().toISOString().slice(0, 10);

/* =================================
   Weight Entry Modal
================================= */
type SavePayload = {
  weightKg: number;
  dateISO: string;
  measurements?: { neckCm?: number; waistCm?: number; hipCm?: number };
  notes?: string;
};

function WeightEntryModal({
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
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [pickerDate, setPickerDate] = useState<Date | null>(null);

  const decimalKeyboard = Platform.OS === "ios" ? "decimal-pad" : "numeric";
  const sanitize = (s: string) =>
    s.replace(",", ".").replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

  const parsedWeight = Number(weight);
  const canSave =
    Number.isFinite(parsedWeight) && parsedWeight > 0 && dateISO.length === 10;

  const asNumber = (s: string) => {
    const n = Number(s);
    return Number.isFinite(n) ? n : undefined;
  };

  return (
    <RNModal
      visible={isOpen}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <Box flex={1} bg="rgba(4,5,10,0.92)">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ flex: 1 }}
        >
          <RNScrollView
            flex={1}
            contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
            showsVerticalScrollIndicator={false}
          >
            <VStack space={3} alignItems="center" mb={3}>
              <Ionicons name="fitness-outline" size={32} color={ACCENT} />
              <Text fontSize="2xl" fontWeight="bold" color="white">
                Log progress
              </Text>
              <Text fontSize="xs" color="coolGray.400" textAlign="center">
                Capture today’s weight and measurements
              </Text>
            </VStack>
            <GlassCard>
              <VStack space={4}>
                <VStack space={2}>
                  <Text fontSize="xs" color="coolGray.400">
                    Weight (kg)
                  </Text>
                  <TextInput
                    value={weight}
                    onChangeText={(t) => setWeight(sanitize(t))}
                    keyboardType={decimalKeyboard}
                    placeholder="e.g., 72.4"
                    placeholderTextColor={INPUT_PLACEHOLDER}
                    style={INPUT_STYLE}
                  />
                </VStack>
                <VStack space={2}>
                  <Text fontSize="xs" color="coolGray.400">
                    Date
                  </Text>
                  <Pressable
                    onPress={() => {
                      setPickerDate(parseDateSafe(dateISO) ?? new Date());
                      setShowDatePicker(true);
                    }}
                    style={[
                      INPUT_STYLE,
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      },
                    ]}
                  >
                    <Text style={{ color: "white", fontWeight: "600" }}>
                      {dateISO || todayISO()}
                    </Text>
                    <Ionicons name="calendar-outline" size={18} color={ACCENT} />
                  </Pressable>
                  {showDatePicker && (
                    <RNModal
                      transparent
                      animationType="fade"
                      onRequestClose={() => setShowDatePicker(false)}
                    >
                      <Box flex={1} bg="rgba(0,0,0,0.6)" justifyContent="center" px={6}>
                        <GlassCard>
                          <VStack space={4}>
                            <Text fontSize="md" fontWeight="bold" color="white">
                              Pick a date
                            </Text>
                            <DateTimePicker
                              value={pickerDate ?? new Date()}
                              mode="date"
                              display={Platform.OS === "ios" ? "spinner" : "default"}
                              maximumDate={new Date()}
                              onChange={(_, selectedDate) => {
                                if (selectedDate) setPickerDate(selectedDate);
                              }}
                            />
                            <HStack justifyContent="flex-end" space={3}>
                              <Pressable onPress={() => setShowDatePicker(false)}>
                                <Text style={{ color: "coolGray.300", fontWeight: "600" }}>
                                  Cancel
                                </Text>
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  const finalDate =
                                    (pickerDate ?? new Date()).toISOString().slice(0, 10);
                                  setDateISO(finalDate);
                                  setShowDatePicker(false);
                                }}
                                style={{
                                  backgroundColor: ACCENT_SOLID,
                                  paddingHorizontal: 18,
                                  paddingVertical: 10,
                                  borderRadius: 999,
                                }}
                              >
                                <Text style={{ color: "white", fontWeight: "700" }}>
                                  Set date
                                </Text>
                              </Pressable>
                            </HStack>
                          </VStack>
                        </GlassCard>
                      </Box>
                    </RNModal>
                  )}
                </VStack>
                <HStack space={3}>
                  {[
                    { label: "Neck (cm)", value: neck, setter: setNeck },
                    { label: "Waist (cm)", value: waist, setter: setWaist },
                    { label: "Hip (cm)", value: hip, setter: setHip },
                  ].map((field) => (
                    <VStack flex={1} space={2} key={field.label}>
                      <Text fontSize="xs" color="coolGray.400">
                        {field.label}
                      </Text>
                      <TextInput
                        value={field.value}
                        onChangeText={(t) => field.setter(sanitize(t))}
                        keyboardType={decimalKeyboard}
                        placeholder="—"
                        placeholderTextColor={INPUT_PLACEHOLDER}
                        style={INPUT_STYLE}
                      />
                    </VStack>
                  ))}
                </HStack>
                <VStack space={2}>
                  <Text fontSize="xs" color="coolGray.400">
                    Notes
                  </Text>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Anything notable about today"
                    placeholderTextColor={INPUT_PLACEHOLDER}
                    style={[INPUT_STYLE, { minHeight: 70, textAlignVertical: "top" }]}
                    multiline
                  />
                </VStack>

                <HStack justifyContent="flex-end" space={3}>
                  <Pressable onPress={onClose}>
                    <Text style={{ color: "coolGray.300", fontWeight: "600" }}>
                      Cancel
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={!canSave || !!saving}
                    onPress={() =>
                      onSave({
                        weightKg: parsedWeight,
                        dateISO,
                        measurements: {
                          neckCm: asNumber(neck),
                          waistCm: asNumber(waist),
                          hipCm: asNumber(hip),
                        },
                        notes: notes.trim() || undefined,
                      })
                    }
                    style={{
                      backgroundColor: canSave ? ACCENT_SOLID : "rgba(124,58,237,0.4)",
                      paddingHorizontal: 20,
                      paddingVertical: 12,
                      borderRadius: 999,
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "700" }}>
                      {saving ? "Saving..." : "Save log"}
                    </Text>
                  </Pressable>
                </HStack>
              </VStack>
            </GlassCard>
          </RNScrollView>
        </KeyboardAvoidingView>
      </Box>
    </RNModal>
  );
}

/* =================================
   Screen
================================= */
export default function ProgressSection() {
  const { data: meData, loading: meLoading } = useCachedQuery(GET_ME);
  const userId: string | undefined = meData?.user?._id;

  if (meLoading || !userId) {
    return (
      <Screen withHeader backgroundColor={THEME_BG} headerColor={THEME_BG}>
        <Box flex={1} alignItems="center" justifyContent="center" bg={THEME_BG}>
          <Spinner color="violet.400" size="lg" />
          <Text color="coolGray.300" mt={4}>
            Loading your progress...
          </Text>
        </Box>
      </Screen>
    );
  }

  return <ProgressContent userId={userId} />;
}

function ProgressContent({ userId }: { userId: string }) {
  const { isOpen, onOpen, onClose } = useDisclose();

  const {
    data: profileData,
    loading: profileLoading,
    refetch: refetchProfile,
  } = useCachedQuery(FITNESS_PROFILE, {
    variables: { userId },
  });

  const {
    data: progressData,
    loading: progressLoading,
    refetch: refetchProgress,
  } = useCachedQuery(PROGRESS_REPORT, {
    variables: { userId },
  });

  const {
    data: sessionsData,
    loading: sessionLoading,
    refetch: refetchSessions,
  } = useCachedQuery(SESSIONS_FOR_CLIENT, {
    variables: { clientId: userId, pageNumber: 1, pageSize: 50 },
  });

  const lastFocusRef = useRef(0);
  const [refreshing, setRefreshing] = useState(false);
  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      const now = Date.now();
      if (now - lastFocusRef.current < 60_000) {
        return;
      }
      lastFocusRef.current = now;
      refetchProfile();
      refetchProgress();
      refetchSessions();
    }, [userId, refetchProfile, refetchProgress, refetchSessions])
  );

  const handleRefresh = useCallback(async () => {
    if (refreshing || !userId) return;
    setRefreshing(true);
    try {
      await Promise.all([refetchProfile(), refetchProgress(), refetchSessions()]);
    } catch (error) {
      console.warn("Progress refresh failed", error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, userId, refetchProfile, refetchProgress, refetchSessions]);

  const [addProgress, { loading: saving }] = useMutation(ADD_PROGRESS, {
    onCompleted: () => {
      refetchProgress();
      refetchProfile();
      onClose();
    },
  });

  const profile = profileData?.fitnessProfile?.profile;
  const progress = (progressData?.progressReport ?? [])
    .slice()
    .sort(
      (a: any, b: any) =>
        (parseDateSafe(b.dateISO)?.getTime() ?? 0) -
        (parseDateSafe(a.dateISO)?.getTime() ?? 0)
    );
  const latest = progress[0];
  const previous = progress[1];
  const earliest = progress[progress.length - 1];

  const currentWeight = latest?.weightKg ?? profile?.currentWeightKg ?? null;
  const previousWeight = previous?.weightKg ?? null;
  const weightDelta =
    currentWeight != null && previousWeight != null
      ? (currentWeight - previousWeight).toFixed(1)
      : null;

  const completedSessions = useMemo(() => {
    const list: any[] = sessionsData?.sessionsForClient ?? [];
    return list
      .filter((s) => s.status === "COMPLETED")
      .sort(
        (a, b) =>
          (parseDateSafe(b.scheduledStart)?.getTime() ?? 0) -
          (parseDateSafe(a.scheduledStart)?.getTime() ?? 0)
      )
      .slice(0, 4);
  }, [sessionsData]);

  const handleSave = (payload: SavePayload) => {
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

  const loadingAny = profileLoading || progressLoading || sessionLoading;

  return (
    <Screen withHeader backgroundColor={THEME_BG} headerColor={THEME_BG}>
      <Box flex={1} bg={THEME_BG}>
        <NBScrollView
          flex={1}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 24, paddingBottom: 120 }}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#fff"
            />
          }
        >
          <VStack space={6}>
            <HStack alignItems="center" justifyContent="space-between">
              <VStack space={1}>
                <Text fontSize="xs" color="coolGray.400">
                  TRAINZILLA • PROGRESSION
                </Text>
                <Heading size="lg" color="white">
                  Progress
                </Heading>
                <Text color="coolGray.300" fontSize="sm">
                  Data-driven transformation overview
                </Text>
              </VStack>
              <Button
                leftIcon={<Ionicons name="add" size={16} color="white" />}
                bg={ACCENT_SOLID}
                _text={{ fontWeight: "bold" }}
                _pressed={{ bg: "violet.700" }}
                onPress={onOpen}
              >
                Log weight
              </Button>
            </HStack>

            <GlassCard gradient>
              {loadingAny ? (
                <Skeleton h="32" rounded="2xl" startColor="gray.700" />
              ) : (
                <VStack space={4}>
                  <HStack justifyContent="space-between" alignItems="center">
                    <VStack>
                      <Text fontSize="xs" color="coolGray.300">
                        Current weight
                      </Text>
                      <Text fontSize="4xl" fontWeight="bold" color="white">
                        {currentWeight != null ? `${currentWeight.toFixed(1)} kg` : "—"}
                      </Text>
                    </VStack>
                    <VStack alignItems="flex-end" space={1}>
                      <InfoChip
                        icon="trending-down-outline"
                        label={
                          weightDelta
                            ? `${weightDelta} kg vs last`
                            : "Awaiting entries"
                        }
                      />
                      <InfoChip
                        icon="analytics-outline"
                        label={`BMI ${latest?.bmi?.toFixed(1) ?? profile?.computed?.bmi ?? "—"}`}
                      />
                    </VStack>
                  </HStack>
                  <HStack space={2}>
                    <InfoChip
                      icon="calendar-outline"
                      label={`Last logged ${fmtDate(latest?.dateISO)}`}
                    />
                    <InfoChip
                      icon="flag-outline"
                      label={`Goal ${profile?.targetWeightKg ?? "—"} kg`}
                    />
                  </HStack>
                </VStack>
              )}
            </GlassCard>

            <HStack space={3}>
              <MetricCard
                title="Daily calories"
                value={
                  profile?.computed?.recommendedCaloriesPerDay
                    ? `${profile.computed.recommendedCaloriesPerDay}`
                    : "—"
                }
                subtitle="Based on latest metrics"
                icon="flame-outline"
              />
              <MetricCard
                title="TDEE"
                value={
                  profile?.computed?.tdee ? `${profile.computed.tdee}` : "—"
                }
                subtitle="Maintenance burn"
                icon="pulse-outline"
              />
            </HStack>

            <GlassCard gradient>
              <HStack justifyContent="space-between" alignItems="center" mb={4}>
                <VStack>
                  <Text fontSize="xs" color="coolGray.400">
                    Weight trend
                  </Text>
                  <Text fontSize="lg" fontWeight="bold" color="white">
                    Last 90 days
                  </Text>
                </VStack>
                <InfoChip
                  icon="podium-outline"
                  label={`${progress.length} entries`}
                />
              </HStack>
              {progress.length ? (
                <>
                  <Box
                    borderWidth={1}
                    borderColor="rgba(255,255,255,0.05)"
                    rounded="2xl"
                    bg="rgba(0,0,0,0.25)"
                    p={3}
                  >
                    <WeightLineChartSvg
                      progress={progress}
                      height={260}
                      width={360}
                    />
                  </Box>
                  <HStack justifyContent="space-between" mt={3} space={3}>
                    <GlassCard flex={1} bg="rgba(255,255,255,0.04)">
                      <Text fontSize="xs" color="coolGray.400">
                        Earliest
                      </Text>
                      <Text fontWeight="semibold" color="white">
                        {fmtDate(earliest?.dateISO)}
                      </Text>
                      <Text fontSize="xs" color="coolGray.400">
                        {earliest?.weightKg != null
                          ? `${earliest.weightKg.toFixed(1)} kg`
                          : "—"}
                      </Text>
                    </GlassCard>
                    <GlassCard flex={1} bg="rgba(255,255,255,0.04)">
                      <Text fontSize="xs" color="coolGray.400">
                        Latest
                      </Text>
                      <Text fontWeight="semibold" color="white">
                        {fmtDate(progress[0]?.dateISO)}
                      </Text>
                      <Text fontSize="xs" color="coolGray.400">
                        {latest?.weightKg != null
                          ? `${latest.weightKg.toFixed(1)} kg`
                          : "—"}
                      </Text>
                    </GlassCard>
                    <GlassCard flex={1} bg="rgba(36,37,55,0.7)">
                      <Text fontSize="xs" color="coolGray.400">
                        Change
                      </Text>
                      <Text
                        fontWeight="bold"
                        color={
                          weightDelta && Number(weightDelta) < 0
                            ? "#34D399"
                            : weightDelta && Number(weightDelta) > 0
                            ? "#F87171"
                            : "white"
                        }
                      >
                        {weightDelta ? `${weightDelta} kg` : "—"}
                      </Text>
                      <Text fontSize="xs" color="coolGray.400">
                        vs previous entry
                      </Text>
                    </GlassCard>
                  </HStack>
                </>
              ) : (
                <VStack alignItems="center" space={2}>
                  <Text color="coolGray.300">
                    Log your first weigh-in to unlock the trend visualisation.
                  </Text>
                </VStack>
              )}
            </GlassCard>

            <GlassCard>
              <Text fontSize="md" fontWeight="bold" color="white" mb={4}>
                Profile snapshot
              </Text>
              {profile ? (
                <VStack space={3}>
                  <HStack justifyContent="space-between">
                    <Text fontSize="xs" color="coolGray.400">
                      Started
                    </Text>
                    <Text color="white">{fmtDate(profile.startedOnISO)}</Text>
                  </HStack>
                  <HStack justifyContent="space-between">
                    <Text fontSize="xs" color="coolGray.400">
                      Experience
                    </Text>
                    <Text color="white">{profile.fitnessExperience ?? "—"}</Text>
                  </HStack>
                  <HStack justifyContent="space-between">
                    <Text fontSize="xs" color="coolGray.400">
                      Activity level
                    </Text>
                    <Text color="white">{profile.activityLevel ?? "—"}</Text>
                  </HStack>
                  <HStack justifyContent="space-between">
                    <Text fontSize="xs" color="coolGray.400">
                      Goal weight
                    </Text>
                    <Text color="white">{profile.targetWeightKg ?? "—"} kg</Text>
                  </HStack>
                  <HStack justifyContent="space-between">
                    <Text fontSize="xs" color="coolGray.400">
                      Target date
                    </Text>
                    <Text color="white">{fmtDate(profile.targetDateISO)}</Text>
                  </HStack>
                </VStack>
              ) : (
                <Skeleton h="24" rounded="xl" startColor="gray.700" />
              )}
            </GlassCard>

            <GlassCard>
              <HStack justifyContent="space-between" alignItems="center" mb={3}>
                <Text fontSize="md" fontWeight="bold" color="white">
                  Recent sessions
                </Text>
                <InfoChip
                  icon="checkmark-circle-outline"
                  label={`${completedSessions.length} logged`}
                />
              </HStack>
              {sessionLoading ? (
                <VStack space={2}>
                  <Skeleton h="12" rounded="xl" startColor="gray.700" />
                  <Skeleton h="12" rounded="xl" startColor="gray.700" />
                </VStack>
              ) : completedSessions.length ? (
                <VStack space={2}>
                  {completedSessions.map((s) => (
                    <GlassCard key={s._id} bg="rgba(255,255,255,0.02)">
                      <HStack justifyContent="space-between" alignItems="center">
                        <VStack>
                          <Text fontWeight="semibold" color="white">
                            {s.type.replace("_", " ")}
                          </Text>
                          <Text fontSize="xs" color="coolGray.400">
                            {fmtDate(s.scheduledStart)} → {fmtDate(s.scheduledEnd)}
                          </Text>
                        </VStack>
                        <InfoChip icon="ribbon-outline" label="Completed" color="#34D399" />
                      </HStack>
                    </GlassCard>
                  ))}
                </VStack>
              ) : (
                <Text color="coolGray.400">No completed sessions yet.</Text>
              )}
            </GlassCard>
          </VStack>
        </NBScrollView>
      </Box>

      {isOpen && (
        <WeightEntryModal
          isOpen
          onClose={onClose}
          onSave={handleSave}
          saving={saving}
        />
      )}
    </Screen>
  );
}
