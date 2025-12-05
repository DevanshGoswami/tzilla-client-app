// app/(tabs)/nutrition.tsx
import Screen from "@/components/ui/Screen";
import { GET_ME } from "@/graphql/queries";
import { getTokens } from "@/lib/apollo";
import { ENV } from "@/lib/env";
import { gql } from "@apollo/client";
import { useMutation, useQuery } from "@apollo/client/react";
import { FontAwesome5, Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useFocusEffect } from "@react-navigation/native";
import {
  Badge,
  Box,
  Button,
  Divider,
  FormControl,
  HStack,
  Heading,
  Icon,
  Image,
  ScrollView,
  Skeleton,
  Text,
  VStack,
  useToast,
} from "native-base";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  Modal as RNModal,
  ScrollView as RNScrollView,
  TextInput,
} from "react-native";

/* ──────────────────────────────────────────────────────────────────────────
   GraphQL
   ────────────────────────────────────────────────────────────────────────── */

const FITNESS_PROFILE = gql`
  query FitnessProfile($userId: ID!) {
    fitnessProfile(userId: $userId) {
      userId
      profile {
        computed {
          recommendedCaloriesPerDay
        }
        currentWeightKg
        name
      }
    }
  }
`;

const DIET_PLANS_FOR_CLIENT = gql`
  query DietPlansForClient($clientId: ID!, $pageNumber: Int!, $pageSize: Int!) {
    dietPlansForClient(
      clientId: $clientId
      pagination: { pageNumber: $pageNumber, pageSize: $pageSize }
    ) {
      _id
      title
      startDate
      endDate
      meals {
        name
        description
        calories
        scheduledTime
        recipeUrl
        avatarUrl
        order
        days
        macros {
          protein
          carbs
          fat
          fiber
          sugar
          sodiumMg
          cholesterolMg
          alcoholG
          portionSizeG
        }
      }
      createdAt
      updatedAt
    }
  }
`;

const DIET_LOGS_BY_DATE = gql`
  query DietLogsByDate($clientId: ID!, $date: String!) {
    dietLogsByDate(clientId: $clientId, date: $date) {
      id
      clientId
      date
      planId
      planMealOrder
      name
      description
      calories
      quantity
      source
      compliance
      notes
      macros {
        protein
        carbs
        fat
        fiber
      }
      createdAt
      updatedAt
    }
  }
`;

const ADD_DIET_LOG = gql`
  mutation AddDietLog($input: CreateDietLogInput!) {
    addDietLog(input: $input) {
      id
      clientId
      date
      planId
      planMealOrder
      name
      calories
      macros {
        protein
        carbs
        fat
        fiber
      }
      source
      compliance
      quantity
      notes
      createdAt
      updatedAt
    }
  }
`;

/* ──────────────────────────────────────────────────────────────────────────
   Helpers
   ────────────────────────────────────────────────────────────────────────── */

type Weekday =
  | "MONDAY"
  | "TUESDAY"
  | "WEDNESDAY"
  | "THURSDAY"
  | "FRIDAY"
  | "SATURDAY"
  | "SUNDAY";
function getWeekday(d: Date): Weekday {
  const i = d.getDay(); // 0=Sun
  return [
    "SUNDAY",
    "MONDAY",
    "TUESDAY",
    "WEDNESDAY",
    "THURSDAY",
    "FRIDAY",
    "SATURDAY",
  ][i] as Weekday;
}
const toISO = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, delta: number) => {
  const n = new Date(d);
  n.setDate(n.getDate() + delta);
  return n;
};
const startOfDay = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const isSameDay = (a: Date, b: Date) =>
  startOfDay(a).getTime() === startOfDay(b).getTime();
const QUICK_DAY_OFFSETS = [-2, -1, 0, 1, 2];

const STORAGE_KEYS = { water: "tz.nutrition.water.v1" };
const s3UrlCache = new Map<string, string>();
const toInt = (n: any, min = 0, max = 100) => {
  const x = Number.isFinite(n) ? (n as number) : 0;
  const r = Math.round(x + Number.EPSILON);
  return Math.min(max, Math.max(min, r));
};

async function resolveS3KeyToUrl(
  key?: string | null,
  token?: string | null
): Promise<string | undefined> {
  if (!key) return undefined;
  if (key.startsWith("http")) return key;
  if (s3UrlCache.has(key)) return s3UrlCache.get(key);
  if (!token) return undefined;
  try {
    const resp = await fetch(
      `${ENV.API_URL}/api/aws/media/${encodeURIComponent(key)}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${token}`, role: "client" },
      }
    );
    if (!resp.ok) return undefined;
    const json = await resp.json();
    const url = json?.url as string | undefined;
    if (url) s3UrlCache.set(key, url);
    return url;
  } catch {
    return undefined;
  }
}

// Extract a readable GraphQL/Network error string
function extractGraphQLError(err: any): string {
  try {
    // Apollo-style graphQLErrors first
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

    // Network errors (status + any returned error message)
    const net = err?.networkError;
    if (net) {
      const status = net.statusCode ?? net.status;
      const bodyMsg =
        net.result?.errors?.[0]?.message || net.bodyText || net.message;
      return `Network${status ? ` ${status}` : ""}: ${
        bodyMsg || "Request failed"
      }`;
    }

    // Fallback
    return err?.message || "Unknown error";
  } catch {
    return String(err || "Unknown error");
  }
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
const INPUT_PLACEHOLDER = "rgba(203,213,225,0.7)";
const TEXT_INPUT_STYLE = {
  borderWidth: 1,
  borderColor: BORDER_COLOR,
  borderRadius: 16,
  paddingHorizontal: 14,
  paddingVertical: Platform.OS === "ios" ? 12 : 10,
  backgroundColor: "rgba(255,255,255,0.05)",
  color: "white",
  fontSize: 16,
} as const;
const TEXT_AREA_STYLE = {
  ...TEXT_INPUT_STYLE,
  minHeight: 90,
  textAlignVertical: "top" as const,
};

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
    bg={gradient ? GLASS_GRADIENT : CARD_BG}
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
    <HStack justifyContent="space-between" alignItems="center" mb={1}>
      <HStack space={3} alignItems="center">
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

const MacroPill = ({ label, value }: { label: string; value: string }) => (
  <VStack
    flex={1}
    p={3}
    rounded="xl"
    borderWidth={1}
    borderColor={BORDER_COLOR}
    bg="rgba(255,255,255,0.04)"
    alignItems="center"
  >
    <Text fontSize="xs" color="coolGray.400">
      {label}
    </Text>
    <Text fontSize="lg" fontWeight="bold" color="white">
      {value}
    </Text>
  </VStack>
);

const CalorieStat = ({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) => (
  <VStack
    flex={1}
    p={3}
    rounded="xl"
    borderWidth={1}
    borderColor={accent ? "rgba(196,181,253,0.8)" : BORDER_COLOR}
    bg={accent ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.03)"}
    space={1}
  >
    <Text fontSize="xs" color="coolGray.400">
      {label}
    </Text>
    <Text fontSize="lg" fontWeight="bold" color="white">
      {value}
      <Text fontSize="xs" color="coolGray.300">
        {" "}
        cal
      </Text>
    </Text>
  </VStack>
);

/* ──────────────────────────────────────────────────────────────────────────
   UI Types
   ────────────────────────────────────────────────────────────────────────── */

type UIMeal = {
  planId: string;
  order: number;
  title: string;
  time: string;
  calories?: number | null;
  items?: string[];
  icon: string;
  avatarKey?: string;
  avatarUrl?: string;
  recipeUrl?: string;
  macros?: { protein?: number; carbs?: number; fat?: number } | null;
};
type DietLog = {
  id: string;
  date: string;
  planId?: string | null;
  planMealOrder?: number | null;
  name: string;
  calories?: number | null;
  quantity?: string | null;
  source: "PLANNED" | "EXTRA";
  compliance: "ON_PLAN" | "OFF_PLAN" | "PARTIAL";
  notes?: string | null;
  macros?: {
    protein?: number | null;
    carbs?: number | null;
    fat?: number | null;
    fiber?: number | null;
  } | null;
};

/* ──────────────────────────────────────────────────────────────────────────
   Small UI bits
   ────────────────────────────────────────────────────────────────────────── */

function PercentBar({
  percent,
  trackColor = "rgba(255,255,255,0.08)",
  barColor = ACCENT_SOLID,
  h = "6",
}: {
  percent: number;
  trackColor?: string;
  barColor?: string;
  h?: string | number;
}) {
  const p = toInt(percent, 0, 100);
  return (
    <Box w="100%" bg={trackColor} rounded="full" h={h} overflow="hidden">
      <Box w={`${p}%`} h="100%" bg={barColor} />
    </Box>
  );
}
function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <VStack alignItems="center" space={0.5}>
      <Text fontSize="lg" fontWeight="bold" color="white">
        {value}
      </Text>
      <Text fontSize="xs" color="coolGray.400">
        {label}
      </Text>
    </VStack>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Inline Add/Edit Panel (pure RN inputs)
   ────────────────────────────────────────────────────────────────────────── */

type SavePayload = {
  name: string;
  description?: string;
  calories: number;
  quantity?: string;
  macros: { protein?: number; carbs?: number; fat?: number; fiber?: number };
  source: "PLANNED" | "EXTRA";
  compliance: "ON_PLAN" | "OFF_PLAN" | "PARTIAL";
  notes?: string;
};

function Chip({
  active,
  children,
  onPress,
}: {
  active: boolean;
  children: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={{
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: active ? ACCENT : BORDER_COLOR,
        backgroundColor: active ? "rgba(124,58,237,0.2)" : "transparent",
      }}
    >
      <Text color={active ? "white" : "coolGray.300"} fontWeight="medium">
        {children}
      </Text>
    </Pressable>
  );
}

function AddFoodInlinePanel({
  defaults,
  onCancel,
  onSave,
  saving,
}: {
  defaults?: Partial<SavePayload>;
  onCancel: () => void;
  onSave: (p: SavePayload) => void;
  saving?: boolean;
}) {
  const toast = useToast();

  const [name, setName] = useState(defaults?.name ?? "");
  const [desc, setDesc] = useState(defaults?.description ?? "");
  const [cal, setCal] = useState(
    defaults?.calories != null ? String(defaults?.calories) : ""
  );
  const [qty, setQty] = useState(defaults?.quantity ?? "");
  const [protein, setProtein] = useState(
    defaults?.macros?.protein != null ? String(defaults?.macros?.protein) : ""
  );
  const [carbs, setCarbs] = useState(
    defaults?.macros?.carbs != null ? String(defaults?.macros?.carbs) : ""
  );
  const [fat, setFat] = useState(
    defaults?.macros?.fat != null ? String(defaults?.macros?.fat) : ""
  );
  const [fiber, setFiber] = useState(
    defaults?.macros?.fiber != null ? String(defaults?.macros?.fiber) : ""
  );
  const [source, setSource] = useState<"PLANNED" | "EXTRA">(
    defaults?.source ?? "EXTRA"
  );
  const [compliance, setCompliance] = useState<
    "ON_PLAN" | "OFF_PLAN" | "PARTIAL"
  >(defaults?.compliance ?? "OFF_PLAN");
  const [notes, setNotes] = useState(defaults?.notes ?? "");

  const num = (s: string) => {
    if (!s?.trim()) return undefined;
    const n = Number(s.replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  };

  const onSubmit = () => {
    const calories = Number((cal ?? "").toString().replace(",", "."));
    if (!Number.isFinite(calories) || calories <= 0) {
      toast.show({ title: "Calories are required", placement: "top" });
      return;
    }
    onSave({
      name: name.trim() || "Food Item",
      description: desc.trim() || undefined,
      calories,
      quantity: qty.trim() || undefined,
      macros: {
        protein: num(protein),
        carbs: num(carbs),
        fat: num(fat),
        fiber: num(fiber),
      },
      source,
      compliance,
      notes: notes.trim() || undefined,
    });
  };

  const macroSummary = {
    protein: num(protein) ?? 0,
    carbs: num(carbs) ?? 0,
    fat: num(fat) ?? 0,
  };

  const mealTemplates = [
    {
      label: "Power Breakfast",
      emoji: "🥣",
      calories: 420,
      macros: { protein: 30, carbs: 45, fat: 12 },
      name: "Power breakfast bowl",
      description: "Greek yogurt, oats, berries",
    },
    {
      label: "Lean Lunch",
      emoji: "🥗",
      calories: 520,
      macros: { protein: 35, carbs: 40, fat: 18 },
      name: "Lean lunch plate",
      description: "Chicken, quinoa, greens",
    },
    {
      label: "Snack",
      emoji: "🍌",
      calories: 220,
      macros: { protein: 10, carbs: 30, fat: 8 },
      name: "Smart snack",
      description: "Fruit + nut butter",
    },
  ];

  return (
    <RNModal
      animationType="slide"
      transparent
      visible
      onRequestClose={onCancel}
    >
      <Box flex={1} bg="rgba(3,4,10,0.92)">
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <ScrollView
            flex={1}
            contentContainerStyle={{ padding: 24, paddingBottom: 48 }}
            showsVerticalScrollIndicator={false}
          >
            <VStack space={3} alignItems="center" mb={3}>
              <Ionicons name="nutrition-outline" size={28} color={ACCENT} />
              <Text fontSize="2xl" fontWeight="bold" color="white">
                Log custom meal
              </Text>
              <Text fontSize="xs" color="coolGray.300">
                Capture off-plan bites or manual macros
              </Text>
            </VStack>
            <GlassCard gradient mb={4}>
              <HStack justifyContent="space-between" alignItems="center">
                <VStack>
                  <Text fontSize="xs" color="coolGray.300">
                    Calories
                  </Text>
                  <Text fontSize="3xl" fontWeight="bold" color="white">
                    {cal || "—"} kcal
                  </Text>
                </VStack>
                <VStack alignItems="flex-end">
                  <Text fontSize="xs" color="coolGray.300">
                    Macro estimate
                  </Text>
                  <HStack space={2} flexWrap="wrap" justifyContent="flex-end">
                    <InfoChip
                      icon="barbell-outline"
                      label={`${macroSummary.protein || 0}g P`}
                    />
                    <InfoChip
                      icon="leaf-outline"
                      label={`${macroSummary.carbs || 0}g C`}
                    />
                    <InfoChip
                      icon="flame-outline"
                      label={`${macroSummary.fat || 0}g F`}
                    />
                  </HStack>
                </VStack>
              </HStack>
            </GlassCard>
            <GlassCard>
              <VStack space={4}>
                <Text fontSize="xs" color="coolGray.400">
                  Quick templates
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <HStack space={3}>
                    {mealTemplates.map((tpl) => (
                      <Pressable
                        key={tpl.label}
                        onPress={() => {
                          setName(tpl.name);
                          setDesc(tpl.description ?? "");
                          setCal(String(tpl.calories));
                          setProtein(String(tpl.macros.protein));
                          setCarbs(String(tpl.macros.carbs));
                          setFat(String(tpl.macros.fat));
                        }}
                      >
                        <GlassCard p={3} bg="rgba(15,17,26,0.9)" minW="36">
                          <HStack space={2} alignItems="center">
                            <Text fontSize="lg">{tpl.emoji}</Text>
                            <VStack>
                              <Text fontSize="xs" color="coolGray.300">
                                {tpl.label}
                              </Text>
                              <Text
                                fontSize="sm"
                                fontWeight="semibold"
                                color="white"
                              >
                                {tpl.calories} kcal
                              </Text>
                            </VStack>
                          </HStack>
                        </GlassCard>
                      </Pressable>
                    ))}
                  </HStack>
                </ScrollView>
              </VStack>
            </GlassCard>
            <GlassCard mt={4} p={5}>
              <VStack space={5}>
                <HStack alignItems="center" justifyContent="space-between">
                  <Heading size="md" color="white">
                    Add Food Log
                  </Heading>
                </HStack>

                <FormControl>
                  <FormControl.Label _text={{ color: "coolGray.300" }}>
                    Name
                  </FormControl.Label>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g., Veg Sandwich"
                    placeholderTextColor={INPUT_PLACEHOLDER}
                    style={TEXT_INPUT_STYLE}
                  />
                </FormControl>

                <FormControl isRequired>
                  <FormControl.Label _text={{ color: "coolGray.300" }}>
                    Calories *
                  </FormControl.Label>
                  <TextInput
                    value={cal}
                    onChangeText={setCal}
                    placeholder="e.g., 420"
                    placeholderTextColor={INPUT_PLACEHOLDER}
                    style={TEXT_INPUT_STYLE}
                    keyboardType={
                      Platform.OS === "ios" ? "decimal-pad" : "numeric"
                    }
                  />
                  <HStack space={2} mt={2}>
                    {[200, 350, 500].map((preset) => (
                      <Chip
                        key={preset}
                        active={false}
                        onPress={() => setCal(String(preset))}
                      >
                        {preset} kcal
                      </Chip>
                    ))}
                  </HStack>
                </FormControl>

                <HStack space={3} flexWrap="wrap">
                  <FormControl flex={1}>
                    <FormControl.Label _text={{ color: "coolGray.300" }}>
                      Protein (g)
                    </FormControl.Label>
                    <TextInput
                      value={protein}
                      onChangeText={setProtein}
                      style={TEXT_INPUT_STYLE}
                      placeholderTextColor={INPUT_PLACEHOLDER}
                      keyboardType={
                        Platform.OS === "ios" ? "decimal-pad" : "numeric"
                      }
                    />
                  </FormControl>
                  <FormControl flex={1}>
                    <FormControl.Label _text={{ color: "coolGray.300" }}>
                      Carbs (g)
                    </FormControl.Label>
                    <TextInput
                      value={carbs}
                      onChangeText={setCarbs}
                      style={TEXT_INPUT_STYLE}
                      placeholderTextColor={INPUT_PLACEHOLDER}
                      keyboardType={
                        Platform.OS === "ios" ? "decimal-pad" : "numeric"
                      }
                    />
                  </FormControl>
                  <FormControl flex={1}>
                    <FormControl.Label _text={{ color: "coolGray.300" }}>
                      Fat (g)
                    </FormControl.Label>
                    <TextInput
                      value={fat}
                      onChangeText={setFat}
                      style={TEXT_INPUT_STYLE}
                      placeholderTextColor={INPUT_PLACEHOLDER}
                      keyboardType={
                        Platform.OS === "ios" ? "decimal-pad" : "numeric"
                      }
                    />
                  </FormControl>
                </HStack>

                <FormControl>
                  <FormControl.Label _text={{ color: "coolGray.300" }}>
                    Fiber (g)
                  </FormControl.Label>
                  <TextInput
                    value={fiber}
                    onChangeText={setFiber}
                    style={TEXT_INPUT_STYLE}
                    placeholderTextColor={INPUT_PLACEHOLDER}
                    keyboardType={
                      Platform.OS === "ios" ? "decimal-pad" : "numeric"
                    }
                  />
                </FormControl>

                <FormControl>
                  <FormControl.Label _text={{ color: "coolGray.300" }}>
                    Quantity
                  </FormControl.Label>
                  <TextInput
                    value={qty}
                    onChangeText={setQty}
                    placeholder='e.g., "1 bowl", "150 g"'
                    placeholderTextColor={INPUT_PLACEHOLDER}
                    style={TEXT_INPUT_STYLE}
                  />
                </FormControl>

                <FormControl>
                  <FormControl.Label _text={{ color: "coolGray.300" }}>
                    Description
                  </FormControl.Label>
                  <TextInput
                    value={desc}
                    onChangeText={setDesc}
                    placeholder="Optional details"
                    placeholderTextColor={INPUT_PLACEHOLDER}
                    style={TEXT_AREA_STYLE}
                  />
                </FormControl>

                <HStack space={3} flexWrap="wrap">
                  <FormControl flex={1}>
                    <FormControl.Label _text={{ color: "coolGray.300" }}>
                      Source
                    </FormControl.Label>
                    <HStack space={2}>
                      <Chip
                        active={source === "PLANNED"}
                        onPress={() => setSource("PLANNED")}
                      >
                        Planned
                      </Chip>
                      <Chip
                        active={source === "EXTRA"}
                        onPress={() => setSource("EXTRA")}
                      >
                        Extra
                      </Chip>
                    </HStack>
                  </FormControl>

                  <FormControl flex={1}>
                    <FormControl.Label _text={{ color: "coolGray.300" }}>
                      Compliance
                    </FormControl.Label>
                    <HStack space={2} flexWrap="wrap">
                      <Chip
                        active={compliance === "ON_PLAN"}
                        onPress={() => setCompliance("ON_PLAN")}
                      >
                        On plan
                      </Chip>
                      <Chip
                        active={compliance === "OFF_PLAN"}
                        onPress={() => setCompliance("OFF_PLAN")}
                      >
                        Off plan
                      </Chip>
                      <Chip
                        active={compliance === "PARTIAL"}
                        onPress={() => setCompliance("PARTIAL")}
                      >
                        Partial
                      </Chip>
                    </HStack>
                  </FormControl>
                </HStack>

                <FormControl>
                  <FormControl.Label _text={{ color: "coolGray.300" }}>
                    Coach Notes
                  </FormControl.Label>
                  <TextInput
                    value={notes}
                    onChangeText={setNotes}
                    placeholder="Optional notes"
                    placeholderTextColor={INPUT_PLACEHOLDER}
                    style={TEXT_AREA_STYLE}
                  />
                </FormControl>

                <HStack justifyContent="flex-end" space={3}>
                  <Button
                    variant="outline"
                    borderColor={BORDER_COLOR}
                    _text={{ color: "white" }}
                    onPress={onCancel}
                  >
                    Cancel
                  </Button>
                  <Button
                    isDisabled={!!saving}
                    bg={ACCENT_SOLID}
                    _text={{ fontWeight: "bold" }}
                    _pressed={{ bg: "violet.700" }}
                    onPress={onSubmit}
                  >
                    {saving ? "Saving..." : "Save log"}
                  </Button>
                </HStack>
              </VStack>
            </GlassCard>
          </ScrollView>
        </KeyboardAvoidingView>
      </Box>
    </RNModal>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Meal Card
   ────────────────────────────────────────────────────────────────────────── */

function MealCard({
  meal,
  alreadyLogged,
  onLogPlanned,
  onOpenRecipe,
}: {
  meal: UIMeal;
  alreadyLogged: boolean;
  onLogPlanned: (m: UIMeal) => void;
  onOpenRecipe: (url?: string) => void;
}) {
  const [imgLoaded, setImgLoaded] = React.useState(false);
  return (
    <GlassCard p={0} mb={4} overflow="hidden">
      <VStack space={0}>
        {meal.avatarUrl ? (
          <Box position="relative">
            {!imgLoaded && (
              <Skeleton h={40} w="100%" rounded="0" startColor="gray.700" />
            )}
            <Image
              alt="meal"
              source={{ uri: meal.avatarUrl }}
              resizeMode="cover"
              w="100%"
              h={48}
              opacity={imgLoaded ? 1 : 0}
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
            h={36}
          >
            <Text fontSize="5xl">{meal.icon}</Text>
          </Box>
        )}

        <VStack space={4} p={5}>
          <HStack justifyContent="space-between" alignItems="center">
            <VStack flex={1}>
              <Text fontSize="lg" fontWeight="bold" color="white">
                {meal.title}
              </Text>
              <Text fontSize="xs" color="coolGray.300">
                {meal.time}
                {typeof meal.calories === "number"
                  ? ` • ${Math.round(meal.calories)} cal`
                  : ""}
              </Text>
            </VStack>
            <Badge
              rounded="full"
              colorScheme={alreadyLogged ? "success" : "coolGray"}
              variant={alreadyLogged ? "solid" : "outline"}
              borderColor={alreadyLogged ? undefined : BORDER_COLOR}
            >
              {alreadyLogged ? "Logged" : "Pending"}
            </Badge>
          </HStack>

          {meal.items?.length ? (
            <VStack space={1}>
              {meal.items.map((it, idx) => (
                <Text key={idx} fontSize="sm" color="coolGray.200">
                  • {it}
                </Text>
              ))}
            </VStack>
          ) : null}

          {meal.macros ? (
            <>
              <Divider my={1} bg={BORDER_COLOR} />
              <HStack space={3} flexWrap="wrap">
                {typeof meal.macros.protein === "number" && (
                  <MacroPill
                    label="Protein"
                    value={`${meal.macros.protein}g`}
                  />
                )}
                {typeof meal.macros.carbs === "number" && (
                  <MacroPill label="Carbs" value={`${meal.macros.carbs}g`} />
                )}
                {typeof meal.macros.fat === "number" && (
                  <MacroPill label="Fat" value={`${meal.macros.fat}g`} />
                )}
              </HStack>
            </>
          ) : null}

          <HStack space={3}>
            <Button
              flex={1}
              variant="outline"
              borderColor={alreadyLogged ? BORDER_COLOR : ACCENT}
              _text={{
                color: alreadyLogged ? "coolGray.200" : "white",
                fontWeight: "bold",
              }}
              bg={alreadyLogged ? "transparent" : ACCENT_SOLID}
              _pressed={{ bg: "violet.700" }}
              onPress={() => onLogPlanned(meal)}
              isDisabled={alreadyLogged}
            >
              {alreadyLogged ? "Already logged" : "Log meal"}
            </Button>
            <Button
              flex={1}
              variant="outline"
              borderColor={BORDER_COLOR}
              _text={{ color: "white" }}
              onPress={() => onOpenRecipe(meal.recipeUrl)}
            >
              <HStack space={2} alignItems="center" justifyContent="center">
                <Icon
                  as={FontAwesome5}
                  name="youtube"
                  size="sm"
                  color="red.400"
                />
                <Text color="white">Recipe</Text>
              </HStack>
            </Button>
          </HStack>
        </VStack>
      </VStack>
    </GlassCard>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   Screen
   ────────────────────────────────────────────────────────────────────────── */

export default function NutritionScreen() {
  const toast = useToast();

  const { data: meData } = useQuery(GET_ME);
  // @ts-ignore
  const clientId: string | undefined = meData?.user?._id;

  // auth token (for S3 URL resolver)
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
    return () => {
      mounted = false;
    };
  }, []);

  // date state
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const isoDate = useMemo(() => toISO(currentDate), [currentDate]);
  const todayWeekday = getWeekday(currentDate);
  const isFutureDay = useMemo(() => {
    const now = new Date();
    return startOfDay(currentDate).getTime() > startOfDay(now).getTime();
  }, [currentDate]);
  const dayIsToday = isSameDay(currentDate, new Date());
  const dayLabel = dayIsToday
    ? "Today"
    : currentDate.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
  const quickDayOptions = useMemo(
    () =>
      QUICK_DAY_OFFSETS.map((offset) => ({
        offset,
        date: addDays(currentDate, offset),
      })),
    [currentDate]
  );
  const todayStartMs = startOfDay(new Date()).getTime();
  const friendlyWeekday =
    todayWeekday.charAt(0) + todayWeekday.slice(1).toLowerCase();

  // queries
  const {
    data: fpData,
    loading: fpLoading,
    error: fpErr,
  } = useQuery(FITNESS_PROFILE, {
    variables: { userId: clientId as string },
    skip: !clientId,
    fetchPolicy: "no-cache",
    nextFetchPolicy: "no-cache",
  });

  const {
    data: plansData,
    loading: plansLoading,
    error: plansErr,
    refetch: refetchPlans,
  } = useQuery(DIET_PLANS_FOR_CLIENT, {
    variables: { clientId: clientId as string, pageNumber: 1, pageSize: 10 },
    skip: !clientId,
    fetchPolicy: "no-cache",
    nextFetchPolicy: "no-cache",
  });

  const {
    data: logsData,
    loading: logsLoading,
    error: logsErr,
    refetch: refetchLogs,
  } = useQuery(DIET_LOGS_BY_DATE, {
    variables: { clientId: clientId as string, date: isoDate },
    skip: !clientId,
    fetchPolicy: "no-cache",
    nextFetchPolicy: "no-cache",
  });

  useFocusEffect(
    useCallback(() => {
      if (!clientId) return;
      refetchPlans();
    }, [clientId, refetchPlans])
  );

  // 🔧 use ONE clearly named mutation hook
  const [runAddDietLog] = useMutation(ADD_DIET_LOG);

  // water tracker
  const [waterGlasses, setWaterGlasses] = useState<number>(0);
  useEffect(() => {
    (async () => {
      try {
        const waterRaw = await AsyncStorage.getItem(STORAGE_KEYS.water);
        setWaterGlasses(Number(waterRaw ?? 0));
      } catch {}
    })();
  }, []);
  const persistWater = useCallback(async (n: number) => {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.water, String(n));
    } catch {}
  }, []);
  const addGlass = useCallback(() => {
    setWaterGlasses((prev) => {
      const next = Math.min(prev + 1, 20);
      persistWater(next);
      return next;
    });
  }, [persistWater]);

  // flatten meals for the selected day
  const plannedMeals: UIMeal[] = useMemo(() => {
    const plans = plansData?.dietPlansForClient ?? [];
    const weekday = todayWeekday;
    const iconFor = (name: string) => {
      const n = (name || "").toLowerCase();
      if (n.includes("breakfast")) return "🌅";
      if (n.includes("lunch")) return "🥗";
      if (n.includes("dinner")) return "🍽️";
      if (n.includes("snack")) return "🥜";
      return "🍴";
    };
    const sorted = [...plans].sort(
      (a: any, b: any) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );

    const list: UIMeal[] = [];
    for (const plan of sorted) {
      const meals = (plan.meals ?? [])
        .filter((m: any) => (m.days ?? []).includes(weekday))
        .slice()
        .sort((a: any, b: any) => {
          if (typeof a.order === "number" && typeof b.order === "number")
            return a.order - b.order;
          return String(a.scheduledTime).localeCompare(String(b.scheduledTime));
        });

      for (const m of meals) {
        list.push({
          planId: plan._id,
          order: m.order ?? 0,
          title: m.name,
          time: m.scheduledTime,
          calories: m.calories ?? null,
          items: m.description ? [m.description] : undefined,
          icon: iconFor(m.name ?? ""),
          recipeUrl: m.recipeUrl ?? undefined,
          avatarKey: m.avatarUrl ?? undefined,
          macros: m.macros
            ? {
                protein: m.macros.protein ?? undefined,
                carbs: m.macros.carbs ?? undefined,
                fat: m.macros.fat ?? undefined,
              }
            : undefined,
        });
      }
    }
    return list;
  }, [plansData, todayWeekday]);

  // resolve avatar keys -> URLs
  const [resolvedMeals, setResolvedMeals] = useState<UIMeal[]>([]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (tokenLoading) return;
      const withUrls = await Promise.all(
        plannedMeals.map(async (m) => ({
          ...m,
          avatarUrl: await resolveS3KeyToUrl(m.avatarKey, token),
        }))
      );
      if (!cancelled) setResolvedMeals(withUrls);
    })();
    return () => {
      cancelled = true;
    };
  }, [plannedMeals, token, tokenLoading]);

  // logs
  const dietLogs: DietLog[] = logsData?.dietLogsByDate ?? [];

  // index logs: decide if plan meal logged
  const loggedMap = useMemo(() => {
    const map = new Set<string>();
    for (const l of dietLogs) {
      if (l.planId && typeof l.planMealOrder === "number") {
        map.add(`${l.planId}:${l.planMealOrder}`);
      }
    }
    return map;
  }, [dietLogs]);

  // totals from logs
  const dailyGoalRaw =
    fpData?.fitnessProfile?.profile?.computed?.recommendedCaloriesPerDay;
  const dailyGoal = Number.isFinite(dailyGoalRaw)
    ? (dailyGoalRaw as number)
    : 2200;

  const consumed = useMemo(() => {
    return Math.round(
      (dietLogs ?? []).reduce((a, c) => a + (Number(c.calories) || 0), 0)
    );
  }, [dietLogs]);
  const remaining = Math.max(0, Math.round(dailyGoal - consumed));
  const progressPct = toInt((consumed / Math.max(1, dailyGoal)) * 100);

  // macro totals (from logs)
  const totalProtein = Math.round(
    (dietLogs ?? []).reduce((a, c) => a + (Number(c.macros?.protein) || 0), 0)
  );
  const totalCarbs = Math.round(
    (dietLogs ?? []).reduce((a, c) => a + (Number(c.macros?.carbs) || 0), 0)
  );
  const totalFat = Math.round(
    (dietLogs ?? []).reduce((a, c) => a + (Number(c.macros?.fat) || 0), 0)
  );

  const loading = fpLoading || plansLoading || logsLoading;

  // recipe
  const openRecipe = useCallback(
    (url?: string) => {
      if (!url) {
        toast.show({ title: "No recipe link", placement: "top" });
        return;
      }
      Linking.openURL(url).catch(() =>
        toast.show({ title: "Failed to open link", placement: "top" })
      );
    },
    [toast]
  );

  /* ── Inline Add Panel state ───────────────────────────────────────────── */
  const [addMode, setAddMode] = useState<null | {
    defaults?: Partial<SavePayload>;
    planRef?: { planId?: string; planMealOrder?: number };
  }>(null);
  const [saving, setSaving] = useState(false);

  const openCustomAdd = () => {
    setAddMode({
      defaults: { source: "EXTRA", compliance: "OFF_PLAN" },
      planRef: undefined,
    });
  };
  const handleLogPlanned = (m: UIMeal) => {
    setAddMode({
      planRef: { planId: m.planId, planMealOrder: m.order },
      defaults: {
        name: m.title,
        description: m.items?.[0] ?? "",
        calories: m.calories ?? (undefined as any),
        macros: {
          protein: m.macros?.protein,
          carbs: m.macros?.carbs,
          fat: m.macros?.fat,
        },
        source: "PLANNED",
        compliance: "ON_PLAN",
      },
    });
  };

  // 🔧 fixed save with single mutation + helpful toast if client not ready
  // --- replace your saveDietLog with this safer version ---
  const saveDietLog = async (payload: SavePayload) => {
    if (!clientId) {
      toast.show({
        title: "User not ready yet. Please try again.",
        placement: "top",
      });
      return;
    }
    if (saving) return;

    const asNum = (v: any) => (Number.isFinite(v) ? Number(v) : undefined);

    // Sanitize numeric inputs
    const calories = asNum(payload.calories);
    const p = asNum(payload.macros?.protein);
    const c = asNum(payload.macros?.carbs);
    const f = asNum(payload.macros?.fat);
    const fi = asNum(payload.macros?.fiber);

    if (typeof calories !== "number" || calories <= 0) {
      toast.show({
        title: "Calories are required and must be a number.",
        placement: "top",
      });
      return;
    }

    // Build input step-by-step
    const input: any = {
      clientId,
      date: isoDate,
      name: String(payload.name || "Food Item"),
      calories,
      source: payload.source, // 'PLANNED' | 'EXTRA'
      compliance: payload.compliance, // 'ON_PLAN' | 'OFF_PLAN' | 'PARTIAL'
    };

    if (addMode?.planRef?.planId) input.planId = addMode.planRef.planId;
    if (typeof addMode?.planRef?.planMealOrder === "number")
      input.planMealOrder = addMode.planRef.planMealOrder;

    if (payload.description?.trim())
      input.description = payload.description.trim();
    if (payload.quantity?.trim()) input.quantity = payload.quantity.trim();
    if (payload.notes?.trim()) input.notes = payload.notes.trim();

    // --- IMPORTANT: Respect new MacrosInput (protein, carbs, fat are required when macros exists)
    const havePCF =
      typeof p === "number" && typeof c === "number" && typeof f === "number";
    if (havePCF) {
      input.macros = {
        protein: p,
        carbs: c,
        fat: f,
        ...(typeof fi === "number" ? { fiber: fi } : {}),
        // If you later collect these, you can add them safely:
        // sugar, sodiumMg, cholesterolMg, alcoholG, portionSizeG
      };
    }
    // If p/c/f are not all present, DO NOT include macros at all (prevents GraphQL validation errors)

    setSaving(true);
    try {
      await runAddDietLog({ variables: { input } });
      setAddMode(null);
      await refetchLogs();
    } catch (e: any) {
      const msg = extractGraphQLError(e);
      console.error("AddDietLog error:", e);
      // toast.show({
      //     title: "Failed to save log",
      //     description: msg,
      //     placement: "top",
      //     duration: 6000,
      // });
      Alert.alert(msg);
    } finally {
      setSaving(false);
    }
  };

  // group planned by time
  const slots = useMemo(() => {
    const map = new Map<string, UIMeal[]>();
    for (const m of resolvedMeals) {
      const id = m.time;
      const arr = map.get(id) ?? [];
      arr.push(m);
      map.set(id, arr);
    }
    return [...map.entries()]
      .map(([id, options]) => ({ id, options }))
      .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  }, [resolvedMeals]);

  return (
    <Screen withHeader backgroundColor={THEME_BG} headerColor={THEME_BG}>
      <Box flex={1} bg={THEME_BG}>
        <ScrollView
          flex={1}
          bg={THEME_BG}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 96 }}
        >
          <VStack px={5} pt={6} pb={8} space={6}>
            <VStack space={3}>
              <Text fontSize="xs" color="coolGray.400">
                TRAINZILLA • FUEL
              </Text>
              <HStack alignItems="center" justifyContent="space-between">
                <Heading size="lg" color="white">
                  Nutrition
                </Heading>
                <InfoChip
                  icon="restaurant-outline"
                  label={`${plannedMeals.length} meals`}
                />
              </HStack>
              <Text color="coolGray.300" fontSize="sm">
                Precision fuel planning for every session.
              </Text>
            </VStack>

            {(fpErr || plansErr || logsErr) && (
              <GlassCard bg="rgba(127,29,29,0.3)">
                <Text color="red.200" fontSize="sm">
                  {fpErr ? `Profile: ${fpErr.message}` : ""}
                  {fpErr && plansErr ? " • " : ""}
                  {plansErr ? `Plans: ${plansErr.message}` : ""}
                  {(fpErr || plansErr) && logsErr ? " • " : ""}
                  {logsErr ? `Logs: ${logsErr.message}` : ""}
                </Text>
              </GlassCard>
            )}

            <GlassCard gradient>
              <VStack space={6}>
                <VStack space={1}>
                  <HStack justifyContent="space-between" alignItems="center">
                    <VStack space={1}>
                      <Text fontSize="xs" color="coolGray.300">
                        Calorie balance
                      </Text>
                      <Heading size="md" color="white">
                        Keep fueling for{" "}
                        {dayIsToday ? "today" : friendlyWeekday.toLowerCase()}
                      </Heading>
                    </VStack>
                    <InfoChip
                      icon="flame-outline"
                      label={`Goal ${dailyGoal} cal`}
                    />
                  </HStack>
                  <Text fontSize="xs" color="coolGray.400">
                    {progressPct}% of target completed
                  </Text>
                </VStack>

                {loading ? (
                  <Skeleton h="8" rounded="full" startColor="gray.700" />
                ) : (
                  <Box position="relative">
                    <PercentBar
                      percent={progressPct}
                      h="8"
                      trackColor="rgba(255,255,255,0.12)"
                      barColor="rgba(124,58,237,0.9)"
                    />
                    <HStack
                      position="absolute"
                      top={0}
                      bottom={0}
                      left={0}
                      right={0}
                      px={4}
                      justifyContent="space-between"
                      alignItems="center"
                    >
                      <Text fontSize="sm" color="white" fontWeight="semibold">
                        {consumed} cal eaten
                      </Text>
                      <Text fontSize="xs" color="coolGray.200">
                        {remaining} cal left
                      </Text>
                    </HStack>
                  </Box>
                )}

                {/* <HStack space={3}>
                                    <CalorieStat
                                        label="Consumed"
                                        value={loading ? "—" : `${consumed}`}
                                        accent
                                    />
                                    <CalorieStat label="Remaining" value={loading ? "—" : `${remaining}`} />
                                    <CalorieStat label="Goal" value={loading ? "—" : `${dailyGoal}`} />
                                </HStack> */}

                <VStack space={3}>
                  <HStack justifyContent="space-between" alignItems="center">
                    <Text fontSize="xs" color="coolGray.400">
                      Macro breakdown
                    </Text>
                    <InfoChip
                      icon="nutrition-outline"
                      color="#34D399"
                      label={`${dietLogs.length} log${
                        dietLogs.length === 1 ? "" : "s"
                      }`}
                    />
                  </HStack>
                  <HStack space={3}>
                    <MacroPill
                      label="Protein"
                      value={loading ? "—" : `${totalProtein}g`}
                    />
                    <MacroPill
                      label="Carbs"
                      value={loading ? "—" : `${totalCarbs}g`}
                    />
                    <MacroPill
                      label="Fat"
                      value={loading ? "—" : `${totalFat}g`}
                    />
                  </HStack>
                </VStack>
              </VStack>
            </GlassCard>

            <VStack space={3}>
              <SectionHeading icon="restaurant-outline" title="Planned meals" />
              {loading ? (
                <VStack space={3}>
                  {[...Array(3)].map((_, i) => (
                    <GlassCard key={i}>
                      <Skeleton
                        h="5"
                        rounded="md"
                        startColor="gray.700"
                        mb={2}
                      />
                      <Skeleton h="4" rounded="md" startColor="gray.700" />
                    </GlassCard>
                  ))}
                </VStack>
              ) : slots.length ? (
                slots.map((slot) => (
                  <VStack key={slot.id} space={3}>
                    {slot.options.map((m) => {
                      const alreadyLogged = loggedMap.has(
                        `${m.planId}:${m.order}`
                      );
                      return (
                        <MealCard
                          key={`${m.planId}:${m.order}`}
                          meal={m}
                          alreadyLogged={alreadyLogged}
                          onLogPlanned={handleLogPlanned}
                          onOpenRecipe={openRecipe}
                        />
                      );
                    })}
                  </VStack>
                ))
              ) : (
                <GlassCard>
                  <Text color="coolGray.200">
                    No meals scheduled for {todayWeekday.toLowerCase()}.
                  </Text>
                </GlassCard>
              )}
            </VStack>

            <VStack space={3}>
              <SectionHeading
                icon="calendar-outline"
                title="Daily tracking"
                actionLabel={dayIsToday ? undefined : "Jump to today"}
                onAction={
                  dayIsToday ? undefined : () => setCurrentDate(new Date())
                }
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
                      {isoDate} • {friendlyWeekday}
                    </Text>
                    <InfoChip
                      icon="nutrition-outline"
                      label={`${dietLogs.length} logged`}
                    />
                  </VStack>

                  <Button.Group
                    isAttached
                    colorScheme="secondary"
                    variant="outline"
                  >
                    <Button
                      flex={1}
                      borderColor={BORDER_COLOR}
                      bg="transparent"
                      leftIcon={
                        <Ionicons name="chevron-back" size={14} color="white" />
                      }
                      _text={{ color: "white" }}
                      _pressed={{ bg: "rgba(255,255,255,0.08)" }}
                      onPress={() => setCurrentDate((d) => addDays(d, -1))}
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
                      isDisabled={isFutureDay}
                      _text={{ color: "white" }}
                      _pressed={{ bg: "rgba(255,255,255,0.08)" }}
                      onPress={() => setCurrentDate((d) => addDays(d, 1))}
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
                        const isSelected = isSameDay(date, currentDate);
                        const isFuture =
                          startOfDay(date).getTime() > todayStartMs;
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
                            disabled={isFuture}
                            onPress={() => setCurrentDate(startOfDay(date))}
                            style={({ pressed }) => ({
                              opacity: isFuture ? 0.4 : pressed ? 0.8 : 1,
                            })}
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
                            >
                              <VStack space={1} alignItems="center">
                                <Text fontSize="xs" color="coolGray.400">
                                  {dayName}
                                </Text>
                                <Text
                                  fontSize="sm"
                                  fontWeight="semibold"
                                  color="white"
                                >
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

              <Pressable
                onPress={openCustomAdd}
                disabled={!clientId}
                style={{
                  borderWidth: 1,
                  borderColor: BORDER_COLOR,
                  borderStyle: "dashed",
                  borderRadius: 20,
                  padding: 16,
                  alignItems: "center",
                  backgroundColor: "rgba(255,255,255,0.02)",
                }}
              >
                <HStack space={2} alignItems="center">
                  <Ionicons
                    name="add-circle-outline"
                    size={20}
                    color={ACCENT}
                  />
                  <Text color="white" fontWeight="bold">
                    Log custom food
                  </Text>
                </HStack>
              </Pressable>

              {addMode && (
                <AddFoodInlinePanel
                  defaults={addMode.defaults}
                  onCancel={() => setAddMode(null)}
                  onSave={saveDietLog}
                  saving={saving}
                />
              )}
            </VStack>

            <VStack space={3}>
              <SectionHeading
                icon="nutrition-outline"
                title="Food logged"
                actionLabel={`${dietLogs.length} item(s)`}
              />
              {logsLoading ? (
                <VStack space={3}>
                  {[...Array(3)].map((_, i) => (
                    <GlassCard key={i}>
                      <Skeleton
                        h="5"
                        rounded="md"
                        startColor="gray.700"
                        mb={2}
                      />
                      <Skeleton h="4" rounded="md" startColor="gray.700" />
                    </GlassCard>
                  ))}
                </VStack>
              ) : dietLogs.length ? (
                <VStack space={3}>
                  {dietLogs.map((l) => (
                    <GlassCard key={l.id}>
                      <VStack space={3}>
                        <HStack
                          justifyContent="space-between"
                          alignItems="center"
                        >
                          <VStack>
                            <Text
                              fontSize="md"
                              fontWeight="semibold"
                              color="white"
                            >
                              {l.name}
                            </Text>
                            <Text fontSize="xs" color="coolGray.400">
                              {Math.round(l.calories || 0)} cal
                              {l.quantity ? ` • ${l.quantity}` : ""}
                              {l.planId ? " • plan" : " • custom"}
                            </Text>
                          </VStack>
                          <Badge
                            rounded="full"
                            colorScheme={
                              l.source === "PLANNED" ? "purple" : "amber"
                            }
                          >
                            {l.source}
                          </Badge>
                        </HStack>
                        {l.notes ? (
                          <Text fontSize="sm" color="coolGray.200">
                            {l.notes}
                          </Text>
                        ) : null}
                        <HStack space={3}>
                          {typeof l.macros?.protein === "number" && (
                            <MacroPill
                              label="Protein"
                              value={`${Math.round(l.macros?.protein || 0)}g`}
                            />
                          )}
                          {typeof l.macros?.carbs === "number" && (
                            <MacroPill
                              label="Carbs"
                              value={`${Math.round(l.macros?.carbs || 0)}g`}
                            />
                          )}
                          {typeof l.macros?.fat === "number" && (
                            <MacroPill
                              label="Fat"
                              value={`${Math.round(l.macros?.fat || 0)}g`}
                            />
                          )}
                        </HStack>
                      </VStack>
                    </GlassCard>
                  ))}
                </VStack>
              ) : (
                <GlassCard>
                  <Text color="coolGray.300">No food logged for this day.</Text>
                </GlassCard>
              )}
            </VStack>

            <GlassCard>
              <VStack space={4}>
                <HStack justifyContent="space-between" alignItems="center">
                  <HStack space={3} alignItems="center">
                    <Box
                      rounded="full"
                      p={3}
                      borderWidth={1}
                      borderColor={BORDER_COLOR}
                      bg="rgba(59,130,246,0.15)"
                    >
                      <Ionicons
                        name="water-outline"
                        size={24}
                        color="#93C5FD"
                      />
                    </Box>
                    <VStack>
                      <Text fontSize="md" fontWeight="semibold" color="white">
                        Hydration streak
                      </Text>
                      <Text fontSize="xs" color="coolGray.400">
                        {waterGlasses} / 8 glasses today
                      </Text>
                    </VStack>
                  </HStack>
                  <Pressable
                    onPress={addGlass}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 6,
                      paddingHorizontal: 16,
                      paddingVertical: 8,
                      borderRadius: 999,
                      backgroundColor: "rgba(59,130,246,0.2)",
                      borderWidth: 1,
                      borderColor: "rgba(59,130,246,0.4)",
                    }}
                  >
                    <Ionicons name="add" size={16} color="#BFDBFE" />
                    <Text style={{ color: "#E0F2FE", fontWeight: "700" }}>
                      Add glass
                    </Text>
                  </Pressable>
                </HStack>
                <HStack alignItems="center" space={4}>
                  <Box flex={1}>
                    <PercentBar
                      percent={toInt((waterGlasses / 8) * 100)}
                      h="4"
                    />
                  </Box>
                  <Text fontSize="lg" fontWeight="bold" color="#93C5FD">
                    {toInt((waterGlasses / 8) * 100)}%
                  </Text>
                </HStack>
                <HStack justifyContent="space-between" alignItems="center">
                  <Text fontSize="xs" color="coolGray.400">
                    Stay consistent to keep your recovery on point.
                  </Text>
                  <HStack
                    space={2}
                    alignItems="center"
                    px={3}
                    py={1.5}
                    rounded="full"
                    borderWidth={1}
                    borderColor="rgba(147,197,253,0.5)"
                    bg="rgba(147,197,253,0.12)"
                  >
                    <Ionicons name="beaker-outline" size={14} color="#93C5FD" />
                    <Text fontSize="xs" color="#E0F2FE" fontWeight="600">
                      {waterGlasses * 250} ml
                    </Text>
                  </HStack>
                </HStack>
              </VStack>
            </GlassCard>

            <GlassCard>
              <HStack space={3} alignItems="center" mb={2}>
                <Ionicons name="bulb-outline" size={18} color={ACCENT} />
                <Text fontSize="md" fontWeight="semibold" color="white">
                  Nutrition tip
                </Text>
              </HStack>
              <Text fontSize="sm" color="coolGray.200">
                Eating earlier in the day can improve energy and digestion.
                Front-load calories around breakfast & lunch when possible.
              </Text>
            </GlassCard>
          </VStack>
        </ScrollView>
      </Box>
    </Screen>
  );
}
