import { gql } from "@apollo/client";
import { useMutation } from "@apollo/client/react";
import { useCachedQuery } from "@/hooks/useCachedQuery";
import {
  Box,
  Button,
  FormControl,
  Heading,
  HStack,
  Pressable,
  ScrollView,
  Skeleton,
  Text,
  useDisclose,
  VStack,
} from "native-base";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal as RNModal,
  Platform,
  RefreshControl,
  ScrollView as RNScrollView,
  TextInput,
  TouchableWithoutFeedback,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";

import { GET_ME } from "@/graphql/queries";
import { getTokens } from "@/lib/apollo";
import { getRuntimeConfigValue } from "@/lib/remoteConfig";
import { useAppToast } from "@/providers/AppToastProvider";
import { Image as ExpoImage } from "expo-image"; // ✅ cached images
import { Ionicons } from "@expo/vector-icons";

/* ================================
   GraphQL
================================ */
const WORKOUT_PLANS_FOR_CLIENT = gql`
  query WorkoutPlansForClient(
    $clientId: ID!
    $pageNumber: Int!
    $pageSize: Int!
  ) {
    workoutPlansForClient(
      clientId: $clientId
      pagination: { pageNumber: $pageNumber, pageSize: $pageSize }
    ) {
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
    getTrainersForClient(
      pagination: { pageNumber: $pageNumber, pageSize: $pageSize }
    ) {
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
      sets {
        set
        reps
        weightKg
        restSeconds
      }
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
async function resolveS3KeyToUrl(
  key?: string | null,
  token?: string | null
): Promise<string | undefined> {
  if (!key) return undefined;
  if (key.startsWith("http")) return key;
  const cached = s3UrlCache.get(key);
  if (cached) return cached;
  if (!token) return undefined;
  try {
    const resp = await fetch(
      `${getRuntimeConfigValue("apiUrl")}/api/aws/media/${encodeURIComponent(key)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, role: "client" },
      }
    );
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
  if (typeof input === "number" || /^\d+$/.test(String(input))) {
    const s = String(input);
    let ms = Number(s);
    if (s.length >= 16) ms = ms / 1_000_000; // ns -> ms
    else if (s.length >= 13) ms = ms; // ms
    else if (s.length >= 10) ms = ms * 1000; // s -> ms
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(String(input));
  return isNaN(d.getTime()) ? null : d;
}
function formatDateShort(input?: string | number | null): string {
  const d = parseDateSafe(input);
  return d ? d.toLocaleDateString() : "—";
}

function isSameLocalDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}
function prettyLocalDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function startOfLocalDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function toLocalISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
const THEME_BG = "#05060B";
const CARD_BG = "rgba(15,17,26,0.95)";
const BORDER_COLOR = "rgba(255,255,255,0.08)";
const ACCENT = "#C4B5FD";
const ACCENT_SOLID = "#7C3AED";
const GLASS_GRADIENT = {
  linearGradient: {
    colors: ["rgba(124,58,237,0.2)", "rgba(5,6,11,0.95)"],
    start: [0, 0],
    end: [1, 1],
  },
};
const QUICK_DAY_OFFSETS = [-2, -1, 0, 1, 2];
const INPUT_PLACEHOLDER = "rgba(203,213,225,0.7)";
const TEXT_INPUT_STYLE = {
  borderWidth: 1,
  borderColor: BORDER_COLOR,
  borderRadius: 14,
  paddingHorizontal: 14,
  paddingVertical: Platform.OS === "ios" ? 12 : 10,
  backgroundColor: "rgba(255,255,255,0.05)",
  color: "white",
  fontSize: 16,
} as const;
const TEXT_AREA_STYLE = {
  ...TEXT_INPUT_STYLE,
  minHeight: 96,
  textAlignVertical: "top" as const,
};

function extractGraphQLError(err: any): string {
  try {
    const gql = err?.graphQLErrors || err?.error?.graphQLErrors;
    if (Array.isArray(gql) && gql.length) {
      const first = gql[0];
      const code = first?.extensions?.code;
      const path = Array.isArray(first?.path)
        ? first.path.join(".")
        : undefined;
      const detail =
        first?.extensions?.exception?.message ||
        first?.extensions?.exception?.stacktrace?.[0] ||
        first?.message;
      return [code ? `[${code}]` : null, path ? `at ${path}` : null, detail]
        .filter(Boolean)
        .join(" ");
    }
    const net = err?.networkError;
    if (net) {
      const status = net.statusCode ?? net.status;
      const bodyMsg =
        net.result?.errors?.[0]?.message || net.bodyText || net.message;
      return `Network${status ? ` ${status}` : ""}: ${
        bodyMsg || "Request failed"
      }`;
    }
    return err?.message || "Unknown error";
  } catch {
    return String(err || "Unknown error");
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
function GlassCard({
  children,
  gradient,
  ...rest
}: {
  children: React.ReactNode;
  gradient?: boolean;
  [key: string]: any;
}) {
  return (
    <Box
      p={4}
      rounded="2xl"
      borderWidth={1}
      borderColor={BORDER_COLOR}
      bg={gradient ? GLASS_GRADIENT : CARD_BG}
      shadow={2}
      {...rest}
    >
      {children}
    </Box>
  );
}

function SectionHeading({
  icon,
  title,
  actionLabel,
  onAction,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <HStack justifyContent="space-between" alignItems="center" mb={2}>
      <HStack alignItems="center" space={3}>
        <Box
          rounded="full"
          bg="rgba(124,58,237,0.2)"
          borderWidth={1}
          borderColor={BORDER_COLOR}
          p={2}
        >
          <Ionicons name={icon} size={18} color={ACCENT} />
        </Box>
        <Text fontSize="md" fontWeight="semibold" color="white">
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

function MiniMetric({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  return (
    <HStack
      space={2}
      alignItems="center"
      px={3}
      py={1}
      rounded="full"
      bg="rgba(255,255,255,0.05)"
      borderWidth={1}
      borderColor={BORDER_COLOR}
    >
      <Ionicons name={icon} size={14} color={ACCENT} />
      <Text fontSize="xs" color="coolGray.200">
        {value} <Text color="coolGray.500">{label}</Text>
      </Text>
    </HStack>
  );
}

function StatusChip({
  icon,
  color,
  label,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
}) {
  return (
    <HStack
      space={2}
      px={3}
      py={1.5}
      rounded="full"
      bg="rgba(255,255,255,0.05)"
      borderWidth={1}
      borderColor={BORDER_COLOR}
      alignItems="center"
    >
      <Ionicons name={icon} size={14} color={color} />
      <Text fontSize="xs" color="coolGray.200">
        {label}
      </Text>
    </HStack>
  );
}

function InfoChip({
  icon,
  label,
  color = ACCENT,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color?: string;
}) {
  return (
    <HStack
      px={3}
      py={1.5}
      space={1}
      alignItems="center"
      borderRadius="full"
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
}

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
      <GlassCard p={0} mb={3} overflow="hidden" gradient>
        <VStack space={0}>
          {item.bannerUrl ? (
            <Box position="relative" overflow="hidden">
              {!imgLoaded && <Skeleton h={40} w="100%" rounded="0" />}
              <ExpoImage
                source={{ uri: item.bannerUrl }}
                style={{ width: "100%", height: 176 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={200}
                priority="high"
                onLoadEnd={() => setImgLoaded(true)}
              />
              <Box
                position="absolute"
                top={0}
                left={0}
                right={0}
                bottom={0}
                bg="rgba(0,0,0,0.35)"
              />
            </Box>
          ) : (
            <Box
              w="100%"
              bg="rgba(255,255,255,0.04)"
              alignItems="center"
              justifyContent="center"
              h={32}
            >
              <Ionicons name="barbell-outline" color={ACCENT} size={42} />
            </Box>
          )}

          <VStack space={3} p={4}>
            <HStack justifyContent="space-between" alignItems="center">
              <VStack flex={1} pr={3}>
                <Text
                  fontSize="lg"
                  fontWeight="bold"
                  color="white"
                  numberOfLines={1}
                >
                  {item.title}
                </Text>
                <HStack space={2} flexWrap="wrap" mt={1}>
                  <InfoChip
                    icon="barbell-outline"
                    label={`${item.exercisesCount} exercises`}
                  />
                  {item.scheduled && (
                    <InfoChip
                      icon="calendar-outline"
                      label={`Starts ${formatDateShort(item.scheduled)}`}
                    />
                  )}
                  {item.trainerName && (
                    <InfoChip
                      icon="person-outline"
                      label={`Coach ${item.trainerName}`}
                      maxW="80%"
                    />
                  )}
                </HStack>
              </VStack>
              <InfoChip icon="layers-outline" label="Plan" color="#F472B6" />
            </HStack>

            {item.description ? (
              <Text fontSize="sm" color="coolGray.200" numberOfLines={3}>
                {item.description}
              </Text>
            ) : null}

            <Button
              size="sm"
              variant="solid"
              bg={ACCENT_SOLID}
              _text={{ color: "white", fontWeight: "bold" }}
              _pressed={{ bg: "violet.700" }}
              onPress={onOpen}
            >
              View plan
            </Button>
          </VStack>
        </VStack>
      </GlassCard>
    </Pressable>
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
  compliance: "ON_PLAN" | "OFF_PLAN" | "PARTIAL";
  source: "PLANNED" | "EXTRA";
  notes?: string | null;
  createdAt?: string | null;
}) {
  const complianceMeta: Record<
    typeof compliance,
    { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
  > = {
    ON_PLAN: {
      label: "On plan",
      color: "#34D399",
      icon: "checkmark-circle-outline",
    },
    PARTIAL: {
      label: "Partial",
      color: "#FBBF24",
      icon: "alert-circle-outline",
    },
    OFF_PLAN: {
      label: "Off plan",
      color: "#F87171",
      icon: "warning-outline",
    },
  };
  const sourceMeta: Record<
    typeof source,
    { label: string; color: string; icon: keyof typeof Ionicons.glyphMap }
  > = {
    PLANNED: {
      label: "Program",
      color: ACCENT,
      icon: "barbell-outline",
    },
    EXTRA: {
      label: "Extra",
      color: "#FDE68A",
      icon: "flash-outline",
    },
  };
  const comp = complianceMeta[compliance];
  const src = sourceMeta[source];

  return (
    <GlassCard>
      <VStack space={4}>
        <VStack space={2}>
          <HStack space={3} alignItems="center">
            <Box
              p={3}
              rounded="full"
              bg="rgba(124,58,237,0.15)"
              borderWidth={1}
              borderColor={BORDER_COLOR}
            >
              <Ionicons name="body-outline" size={18} color={ACCENT} />
            </Box>
            <VStack flex={1}>
              <Text fontSize="md" fontWeight="semibold" color="white">
                {title}
              </Text>
              <Text fontSize="xs" color="coolGray.400">
                {createdAt ? `Logged ${formatDateShort(createdAt)}` : "Logged"}
              </Text>
            </VStack>
          </HStack>

          <HStack
            space={2}
            flexWrap="wrap"
            justifyContent="flex-start"
            mt={1}
          >
            <StatusChip icon={src.icon} color={src.color} label={src.label} />
            <StatusChip icon={comp.icon} color={comp.color} label={comp.label} />
          </HStack>
        </VStack>

        <HStack space={2} flexWrap="wrap">
          {Number.isFinite(totalSets) && Number.isFinite(repsPerSet) && (
            <MiniMetric
              icon="repeat-outline"
              value={`${totalSets}×${repsPerSet}`}
              label="volume"
            />
          )}
          {Number.isFinite(rpe) && (
            <MiniMetric icon="flame-outline" value={`RPE ${rpe}`} label="" />
          )}
          {Number.isFinite(durationSeconds) && (
            <MiniMetric
              icon="time-outline"
              value={`${durationSeconds}s`}
              label="duration"
            />
          )}
        </HStack>

        {notes ? (
          <Box
            p={3}
            rounded="xl"
            bg="rgba(255,255,255,0.04)"
            borderWidth={1}
            borderColor={BORDER_COLOR}
          >
            <Text fontSize="xs" color="coolGray.300">
              Notes
            </Text>
            <Text fontSize="sm" color="coolGray.100">
              {notes}
            </Text>
          </Box>
        ) : null}
      </VStack>
    </GlassCard>
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
  onLog: (extras?: {
    rpe?: number;
    durationSeconds?: number;
    notes?: string;
  }) => void;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const [rpe, setRpe] = useState<string>("7");
  const [dur, setDur] = useState<string>("");
  const [notes, setNotes] = useState<string>("");

  const handleSubmit = useCallback(() => {
    onLog({
      rpe: Number.isFinite(Number(rpe)) ? Number(rpe) : undefined,
      durationSeconds: Number.isFinite(Number(dur)) ? Number(dur) : undefined,
      notes: notes?.trim() || undefined,
    });
  }, [onLog, rpe, dur, notes]);

  return (
    <GlassCard p={0} mb={3}>
      {url ? (
        <Box
          position="relative"
          overflow="hidden"
          bg="#fff"
          alignItems="center"
          justifyContent="center"
        >
          {!imgLoaded && (
            <Skeleton h={48} w="100%" rounded="0" startColor="gray.700" />
          )}
          <ExpoImage
            source={{ uri: url }}
            style={{ width: "100%", height: 192 }}
            contentFit="contain"
            cachePolicy="memory-disk"
            transition={200}
            priority="high"
            onLoadEnd={() => setImgLoaded(true)}
          />
        </Box>
      ) : null}
      <VStack p={4} space={4}>
        <HStack justifyContent="space-between" alignItems="center">
          <Text fontSize="md" fontWeight="semibold" color="white">
            {order}. {name}
          </Text>
          <Text fontSize="xs" color="coolGray.400">
            Rest: {restSeconds}s
          </Text>
        </HStack>

        <Text fontSize="sm" color="coolGray.200">
          {sets} sets × {reps} reps
        </Text>

        {/* Quick inputs */}
        <HStack space={3}>
          <FormControl flex={1}>
            <FormControl.Label _text={{ color: "coolGray.300" }}>
              RPE
            </FormControl.Label>
            <TextInput
              style={TEXT_INPUT_STYLE}
              value={rpe}
              onChangeText={setRpe}
              keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
              placeholder="7"
              placeholderTextColor={INPUT_PLACEHOLDER}
            />
          </FormControl>
          <FormControl flex={1}>
            <FormControl.Label _text={{ color: "coolGray.300" }}>
              Duration (s)
            </FormControl.Label>
            <TextInput
              style={TEXT_INPUT_STYLE}
              value={dur}
              onChangeText={setDur}
              keyboardType={Platform.OS === "ios" ? "decimal-pad" : "numeric"}
              placeholder="e.g., 300"
              placeholderTextColor={INPUT_PLACEHOLDER}
            />
          </FormControl>
        </HStack>

        <FormControl>
          <FormControl.Label _text={{ color: "coolGray.300" }}>
            Notes
          </FormControl.Label>
          <TextInput
            style={TEXT_AREA_STYLE}
            value={notes}
            onChangeText={setNotes}
            placeholder="Optional notes"
            placeholderTextColor={INPUT_PLACEHOLDER}
          />
        </FormControl>

        <Pressable
          onPress={handleSubmit}
          disabled={!!logging}
          style={{
            marginTop: 12,
            alignSelf: "flex-end",
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            paddingHorizontal: 20,
            paddingVertical: 12,
            borderRadius: 999,
            backgroundColor: logging ? "rgba(124,58,237,0.35)" : ACCENT_SOLID,
          }}
        >
          {logging ? (
            <Text style={{ color: "white", fontSize: 12, fontWeight: "600" }}>
              Logging…
            </Text>
          ) : (
            <>
              <Ionicons name="checkmark-circle-outline" size={20} color="white" />
              <Text style={{ color: "white", fontWeight: "700" }}>Log set</Text>
            </>
          )}
        </Pressable>
      </VStack>
    </GlassCard>
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
  trainerName,
}: {
  visible: boolean;
  onClose: () => void;
  plan?: GQLWorkoutPlan | null;
  resolvedExercises: {
    name: string;
    url?: string;
    sets: number;
    reps: number;
    restSeconds: number;
    order: number;
  }[];
  onLogExercise: (p: {
    order: number;
    name: string;
    rpe?: number;
    durationSeconds?: number;
    notes?: string;
  }) => void;
  loggingOrder?: number | null;
  trainerName?: string | null;
}) {
  if (!plan) return null;
  return (
    <RNModal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent
    >
      <TouchableWithoutFeedback onPress={onClose} accessible={false}>
        <Box flex={1} bg="rgba(4,5,10,0.92)">
          <TouchableWithoutFeedback onPress={() => {}} accessible={false}>
            <SafeAreaView style={{ flex: 1 }}>
              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{ flex: 1 }}
              >
                <RNScrollView
                  contentContainerStyle={{ padding: 24, paddingBottom: 96 }}
                  showsVerticalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                >
            <VStack space={4}>
              <HStack alignItems="center" justifyContent="space-between">
                <Pressable onPress={onClose}>
                  <HStack space={1} alignItems="center">
                    <Ionicons name="chevron-back" size={18} color={ACCENT} />
                    <Text style={{ color: ACCENT, fontWeight: "600" }}>
                      Close
                    </Text>
                  </HStack>
                </Pressable>
                <InfoChip icon="layers-outline" label="Plan detail" />
              </HStack>

              <VStack alignItems="flex-start" space={1}>
                <Text fontSize="xs" color="coolGray.400">
                  Active plan
                </Text>
                <Heading size="md" color="white">
                  {plan.title}
                </Heading>
                {plan.description ? (
                  <Text color="coolGray.300" fontSize="sm">
                    {plan.description}
                  </Text>
                ) : null}
              </VStack>

              <GlassCard gradient>
                <HStack justifyContent="space-between" alignItems="center">
                  <VStack space={1}>
                    <Text fontSize="xs" color="coolGray.300">
                      Total exercises
                    </Text>
                    <Text fontSize="2xl" fontWeight="bold" color="white">
                      {plan.exercises.length}
                    </Text>
                  </VStack>
                  <VStack alignItems="flex-end" space={2}>
                    <InfoChip
                      icon="calendar-outline"
                      label={
                        plan.startDate
                          ? `Starts ${formatDateShort(plan.startDate)}`
                          : "On demand"
                      }
                    />
                    <InfoChip
                      icon="person-outline"
                      label={trainerName ? `Coach ${trainerName}` : "Trainer plan"}
                    />
                  </VStack>
                </HStack>
              </GlassCard>

              <VStack space={3}>
                <Text fontSize="md" fontWeight="bold" color="white">
                  Exercises
                </Text>
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
                      onLog={(extras) =>
                        onLogExercise({
                          order: ex.order,
                          name: ex.name,
                          ...extras,
                        })
                      }
                    />
                  ))}
              </VStack>

              <GlassCard>
                <VStack space={2}>
                  <HStack space={2} alignItems="center">
                    <Ionicons name="bulb-outline" size={18} color={ACCENT} />
                    <Text fontSize="md" fontWeight="semibold" color="white">
                      Execution cues
                    </Text>
                  </HStack>
                  <Text fontSize="sm" color="coolGray.200">
                    • Warm up 5–10 minutes
                  </Text>
                  <Text fontSize="sm" color="coolGray.200">
                    • Prioritize form over speed
                  </Text>
                  <Text fontSize="sm" color="coolGray.200">
                    • Hydrate between sets
                  </Text>
                  <Text fontSize="sm" color="coolGray.200">
                    • Cool down and stretch
                  </Text>
                </VStack>
              </GlassCard>
            </VStack>
          </RNScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </TouchableWithoutFeedback>
  </Box>
</TouchableWithoutFeedback>
</RNModal>
  );
}

/* ================================
   Screen
================================ */
export default function Workouts() {
  const toast = useAppToast();
  const { isOpen, onOpen, onClose } = useDisclose();
  const [selectedPlan, setSelectedPlan] = useState<GQLWorkoutPlan | null>(null);
  const [loggingOrder, setLoggingOrder] = useState<number | null>(null);
  const [selectedTrainerName, setSelectedTrainerName] = useState<string | null>(null);

  // who am i
  const { data: meData, refetch: refetchMe } = useCachedQuery(GET_ME);
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
        console.log("A C C E S S. T O K E N ", accessToken);
        if (!mounted) return;
        setToken(accessToken ?? null);
      } finally {
        if (mounted) setTokenLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // date scope for logs (today for now)
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const isoDate = useMemo(() => toLocalISODate(currentDate), [currentDate]);

  // server data
  const {
    data: plansResp,
    loading: plansLoading,
    error: plansErr,
    refetch: refetchPlans,
  } = useCachedQuery<{ workoutPlansForClient: GQLWorkoutPlan[] }>(
    WORKOUT_PLANS_FOR_CLIENT,
    {
      variables: { clientId: clientId as string, pageNumber: 1, pageSize: 20 },
      skip: !clientId,
    }
  );

  const lastPlanRefreshRef = useRef(0);
  useFocusEffect(
    useCallback(() => {
      if (!clientId) return;
      const now = Date.now();
      if (now - lastPlanRefreshRef.current < 60_000) {
        return;
      }
      lastPlanRefreshRef.current = now;
      refetchPlans();
    }, [clientId, refetchPlans])
  );

  const plansSorted: GQLWorkoutPlan[] = useMemo(() => {
    const p = plansResp?.workoutPlansForClient ?? [];
    return [...p].sort(
      (a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }, [plansResp]);

  const { data: trainersData, refetch: refetchTrainers } = useCachedQuery<{
    getTrainersForClient: {
      _id: string;
      name: string;
      avatarUrl?: string | null;
    }[];
  }>(GET_TRAINERS_FOR_CLIENT, { variables: { pageNumber: 1, pageSize: 25 } });
  const trainersById = useMemo(() => {
    const map = new Map<string, { name: string; avatarUrl?: string | null }>();
    for (const t of trainersData?.getTrainersForClient ?? []) {
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
          const first = [...(plan.exercises ?? [])].sort(
            (a, b) => a.order - b.order
          )[0];
          const bannerUrl = await resolveS3KeyToUrl(
            first?.avatarUrl ?? undefined,
            token
          );
          if (bannerUrl) ExpoImage.prefetch(bannerUrl).catch(() => {});
          const trainer = plan.trainerId
            ? trainersById.get(plan.trainerId)
            : undefined;
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
    return () => {
      cancelled = true;
    };
  }, [plansSorted, token, tokenLoading, trainersById]);

  // resolved exercises for modal (prefetch each asset)
  const [resolvedExercises, setResolvedExercises] = useState<
    {
      name: string;
      url?: string;
      sets: number;
      reps: number;
      restSeconds: number;
      order: number;
    }[]
  >([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!selectedPlan || tokenLoading) return;
      const list = await Promise.all(
        [...(selectedPlan.exercises ?? [])]
          .sort((a, b) => a.order - b.order)
          .map(async (ex) => {
            const url = await resolveS3KeyToUrl(
              ex.avatarUrl ?? undefined,
              token
            );
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
    return () => {
      cancelled = true;
    };
  }, [selectedPlan, token, tokenLoading]);

  // logs by date
  const {
    data: logsResp,
    loading: logsLoading,
    error: logsErr,
    refetch: refetchLogs,
  } = useCachedQuery(WORKOUT_LOGS_BY_DATE, {
    variables: { clientId: clientId as string, date: isoDate },
    skip: !clientId,
  });
  const workoutLogs = logsResp?.workoutLogsByDate ?? [];
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const tasks: Promise<any>[] = [refetchMe(), refetchTrainers()];
      if (clientId) {
        tasks.push(refetchPlans(), refetchLogs());
      }
      await Promise.all(tasks);
    } catch (error) {
      console.warn("Workouts refresh failed", error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, refetchMe, refetchTrainers, clientId, refetchPlans, refetchLogs]);

  // mutation + saver
  const [runAddWorkoutLog, { loading: creatingLog }] =
    useMutation(ADD_WORKOUT_LOG);

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
        setsOverride?: {
          set: number;
          reps: number;
          weightKg?: number;
          restSeconds?: number;
        }[];
        source?: "PLANNED" | "EXTRA";
        compliance?: "ON_PLAN" | "OFF_PLAN" | "PARTIAL";
      };
    }) => {
      try {
        if (!clientId) {
          toast.show({
            title: "Profile not ready",
            description: "Please wait a moment and try again.",
            placement: "top",
            bg: "amber.500",
          });
          return;
        }

        const totalSets = Number.isFinite(exercise.sets)
          ? exercise.sets
          : undefined;
        const repsPerSet = Number.isFinite(exercise.reps)
          ? exercise.reps
          : undefined;
        const restSeconds = Number.isFinite(exercise.restSeconds)
          ? exercise.restSeconds
          : undefined;

        let setsPayload:
          | {
              set: number;
              reps: number;
              weightKg?: number;
              restSeconds?: number;
            }[]
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
          durationSeconds: Number.isFinite(extras?.durationSeconds)
            ? extras?.durationSeconds
            : undefined,
          rpe: Number.isFinite(extras?.rpe) ? extras?.rpe : undefined,
          source: extras?.source ?? "PLANNED",
          compliance: extras?.compliance ?? "ON_PLAN",
          notes: extras?.notes?.trim() || undefined,
        };

        setLoggingOrder(exercise.order);
        await runAddWorkoutLog({ variables: { input } });
        setLoggingOrder(null);

        toast.show({
          title: "Workout logged",
          description: `${exercise.name} saved successfully`,
          placement: "top",
          bg: "emerald.500",
        });
        await refetchLogs();
      } catch (e: any) {
        setLoggingOrder(null);
        const msg = extractGraphQLError(e);
        console.error("AddWorkoutLog error:", e);
        toast.show({
          title: "Failed to save workout",
          description: msg,
          placement: "top",
          bg: "red.600",
        });
      }
    },
    [clientId, isoDate, runAddWorkoutLog, refetchLogs, toast]
  );

  const openPlan = useCallback(
    (plan: GQLWorkoutPlan) => {
      if (plan.trainerId) {
        const info = trainersById.get(plan.trainerId);
        setSelectedTrainerName(info?.name ?? null);
      } else {
        setSelectedTrainerName(null);
      }
      setSelectedPlan(plan);
      onOpen();
    },
    [onOpen, trainersById]
  );

  const dayIsToday = isSameLocalDay(currentDate, new Date());
  const dayLabel = dayIsToday ? "Today" : prettyLocalDate(currentDate);
  const logsTitle = dayIsToday ? "Logged Today" : `Logged on ${isoDate}`;
  const quickDayOptions = useMemo(
    () =>
      QUICK_DAY_OFFSETS.map((offset) => ({
        offset,
        date: new Date(
          currentDate.getFullYear(),
          currentDate.getMonth(),
          currentDate.getDate() + offset
        ),
      })),
    [currentDate]
  );
  const todayStartMs = startOfLocalDay(new Date()).getTime();

  return (
    <Box flex={1} bg={THEME_BG} safeAreaTop>
      <ScrollView
        flex={1}
        contentContainerStyle={{ paddingBottom: 96 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />
        }
      >
        <VStack px={5} pt={6} space={6}>
          {/* Header */}
          <VStack space={3}>
            <Text fontSize="xs" color="coolGray.400">
              TRAINZILLA • PERFORMANCE
            </Text>
            <HStack alignItems="center" justifyContent="space-between">
              <VStack flex={1} space={1}>
                <Heading size="lg" color="white">
                  Workouts
                </Heading>
                <Text color="coolGray.300" fontSize="sm">
                  Your personalized training control room
                </Text>
              </VStack>
              <InfoChip icon="albums-outline" label={`${uiWorkouts.length} plans`} />
            </HStack>
          </VStack>

          {(plansErr || logsErr) && (
            <GlassCard bg="rgba(127,29,29,0.4)">
              <Text color="red.200" fontSize="sm">
                {plansErr ? `Plans: ${plansErr.message}` : ""}
                {plansErr && logsErr ? " • " : ""}
                {logsErr ? `Logs: ${logsErr.message}` : ""}
              </Text>
            </GlassCard>
          )}

          {/* Plans */}
          <VStack space={3}>
            <SectionHeading icon="flash-outline" title="Assigned plans" />
            <Text fontSize="xs" color="coolGray.400">
              Launch any plan to review exercises and log progress. Plans are
              categorized by muscle group or goal, not by calendar dates.
            </Text>
            {plansLoading || tokenLoading ? (
              <VStack space={3}>
                {Array.from({ length: 2 }).map((_, i) => (
                  <GlassCard key={i} p={0}>
                    <Skeleton
                      h={40}
                      w="100%"
                      rounded="2xl"
                      startColor="gray.700"
                      endColor="gray.600"
                    />
                    <VStack p={4} space={3}>
                      <Skeleton h="4" />
                      <Skeleton h="4" w="40%" />
                    </VStack>
                  </GlassCard>
                ))}
              </VStack>
            ) : uiWorkouts.length ? (
              uiWorkouts.map((w) => {
                const plan = plansSorted.find((p) => p._id === w.key)!;
                return (
                  <WorkoutCard
                    key={w.key}
                    item={w}
                    onOpen={() => openPlan(plan)}
                  />
                );
              })
            ) : (
              <GlassCard>
                <VStack alignItems="center" space={3}>
                  <Ionicons name="time-outline" size={32} color={ACCENT} />
                  <Text color="coolGray.200" textAlign="center">
                    No workouts yet. Your trainer will schedule sessions soon.
                  </Text>
                </VStack>
              </GlassCard>
            )}
          </VStack>

          {/* Day selector */}
          <VStack space={3}>
            <SectionHeading
              icon="calendar-outline"
              title="Daily tracking"
              actionLabel={dayIsToday ? undefined : "Jump to today"}
              onAction={dayIsToday ? undefined : () => setCurrentDate(new Date())}
            />
            <GlassCard>
              <VStack space={5}>
                <VStack alignItems="center" space={1}>
                  <Text fontSize="xs" color="coolGray.400">
                    Selected day
                  </Text>
                  <Heading size="md" color="white">
                    {dayLabel}
                  </Heading>
                  <Text color="coolGray.300" fontSize="sm">
                    {isoDate}
                  </Text>
                  <InfoChip
                    icon="checkmark-done-outline"
                    label={`${workoutLogs.length} logged`}
                  />
                </VStack>

                <Button.Group isAttached colorScheme="secondary" variant="outline">
                  <Button
                    flex={1}
                    borderColor={BORDER_COLOR}
                    bg="transparent"
                    leftIcon={<Ionicons name="chevron-back" size={14} color="white" />}
                    _text={{ color: "white" }}
                    _pressed={{ bg: "rgba(255,255,255,0.08)" }}
                    onPress={() =>
                      setCurrentDate(
                        (d) =>
                          new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1)
                      )
                    }
                  >
                    Previous
                  </Button>
                  <Button
                    flex={1}
                    borderColor={BORDER_COLOR}
                    variant={dayIsToday ? "solid" : "outline"}
                    bg={dayIsToday ? ACCENT_SOLID : "transparent"}
                    _text={{ color: "white", fontWeight: "semibold" }}
                    _pressed={{ bg: ACCENT_SOLID }}
                    onPress={() => setCurrentDate(new Date())}
                  >
                    Today
                  </Button>
                  <Button
                    flex={1}
                    borderColor={BORDER_COLOR}
                    bg="transparent"
                    rightIcon={
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color="white"
                      />
                    }
                    isDisabled={dayIsToday}
                    _text={{ color: "white" }}
                    _pressed={{ bg: "rgba(255,255,255,0.08)" }}
                    onPress={() =>
                      setCurrentDate(
                        (d) =>
                          new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
                      )
                    }
                  >
                    Next
                  </Button>
                </Button.Group>

                <RNScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ paddingHorizontal: 2 }}
                >
                  <HStack space={2}>
                    {quickDayOptions.map(({ offset, date }) => {
                      const isSelected = isSameLocalDay(date, currentDate);
                      const isFuture = startOfLocalDay(date).getTime() > todayStartMs;
                      const dayName = date.toLocaleDateString(undefined, {
                        weekday: "short",
                      });
                      const dayAndMonth = date.toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                      });
                      return (
                        <Pressable
                          key={offset}
                          isDisabled={isFuture}
                          onPress={() =>
                            setCurrentDate(
                              new Date(
                                date.getFullYear(),
                                date.getMonth(),
                                date.getDate()
                              )
                            )
                          }
                        >
                          <Box
                            px={3}
                            py={2}
                            borderRadius="xl"
                            borderWidth={1}
                            borderColor={isSelected ? ACCENT : BORDER_COLOR}
                            bg={
                              isSelected
                                ? "rgba(124,58,237,0.25)"
                                : "rgba(255,255,255,0.03)"
                            }
                            opacity={isFuture ? 0.4 : 1}
                          >
                            <VStack space={1} alignItems="center">
                              <Text fontSize="xs" color="coolGray.400">
                                {dayName}
                              </Text>
                              <Text fontSize="sm" fontWeight="semibold" color="white">
                                {dayAndMonth}
                              </Text>
                            </VStack>
                          </Box>
                        </Pressable>
                      );
                    })}
                  </HStack>
                </RNScrollView>
              </VStack>
            </GlassCard>
          </VStack>

          {/* Logs */}
          <VStack space={3}>
            <SectionHeading
              icon="checkmark-circle-outline"
              title={logsTitle}
            />

            {logsLoading ? (
              <VStack space={3}>
                {Array.from({ length: 3 }).map((_, i) => (
                  <GlassCard key={i}>
                    <Skeleton h="4" mb={2} startColor="gray.700" />
                    <Skeleton h="4" w="60%" startColor="gray.700" />
                  </GlassCard>
                ))}
              </VStack>
            ) : workoutLogs.length ? (
              <VStack space={3}>
                {workoutLogs
                  .slice()
                  .sort((a: any, b: any) =>
                    (b.createdAt || "").localeCompare(a.createdAt || "")
                  )
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
              <GlassCard>
                <Text color="coolGray.300">
                  No workouts logged for this day. Knock one out to build your
                  streak.
                </Text>
              </GlassCard>
            )}
          </VStack>
        </VStack>
      </ScrollView>

      {/* Modal */}
      <WorkoutDetailModal
        visible={isOpen && !!selectedPlan}
        onClose={onClose}
        plan={selectedPlan}
        resolvedExercises={resolvedExercises}
        loggingOrder={loggingOrder}
        trainerName={selectedTrainerName}
        onLogExercise={(p) => {
          const ex = selectedPlan?.exercises?.find((e) => e.order === p.order);
          if (!selectedPlan || !ex) return;
          saveWorkoutLog({
            plan: selectedPlan,
            exercise: ex,
            extras: {
              rpe: p.rpe,
              durationSeconds: p.durationSeconds,
              notes: p.notes,
            },
          });
        }}
      />
    </Box>
  );
}
