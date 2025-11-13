// app/(tabs)/nutrition.tsx
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    Box, VStack, HStack, Text, ScrollView, Badge,
    Heading, Button, Divider, useToast, Skeleton, Icon, Image, AspectRatio, FormControl
} from 'native-base';
import {Linking, Platform, TextInput, StyleSheet, Alert} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery, useMutation } from '@apollo/client/react';
import { gql } from '@apollo/client';
import { FontAwesome5 } from '@expo/vector-icons';
import Screen from '@/components/ui/Screen';
import { GET_ME } from '@/graphql/queries';
import { getTokens } from '@/lib/apollo';
import { ENV } from '@/lib/env';

/* ──────────────────────────────────────────────────────────────────────────
   GraphQL
   ────────────────────────────────────────────────────────────────────────── */

const FITNESS_PROFILE = gql`
    query FitnessProfile($userId: ID!) {
        fitnessProfile(userId: $userId) {
            userId
            profile {
                computed { recommendedCaloriesPerDay }
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
            macros { protein carbs fat fiber }
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
            macros { protein carbs fat fiber }
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

type Weekday = 'MONDAY'|'TUESDAY'|'WEDNESDAY'|'THURSDAY'|'FRIDAY'|'SATURDAY'|'SUNDAY';
function getWeekday(d: Date): Weekday {
    const i = d.getDay(); // 0=Sun
    return ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][i] as Weekday;
}
const toISO = (d: Date) => d.toISOString().slice(0,10);
const addDays = (d: Date, delta: number) => { const n = new Date(d); n.setDate(n.getDate()+delta); return n; };

const STORAGE_KEYS = { water: 'tz.nutrition.water.v1' };
const s3UrlCache = new Map<string, string>();
const toInt = (n: any, min = 0, max = 100) => {
    const x = Number.isFinite(n) ? n as number : 0;
    const r = Math.round(x + Number.EPSILON);
    return Math.min(max, Math.max(min, r));
};

async function resolveS3KeyToUrl(key?: string | null, token?: string | null): Promise<string | undefined> {
    if (!key) return undefined;
    if (key.startsWith('http')) return key;
    if (s3UrlCache.has(key)) return s3UrlCache.get(key);
    if (!token) return undefined;
    try {
        const resp = await fetch(`${ENV.API_URL}/api/aws/media/${encodeURIComponent(key)}`, {
            method: 'GET',
            headers: { Authorization: `Bearer ${token}`, role: 'client' },
        });
        if (!resp.ok) return undefined;
        const json = await resp.json();
        const url = json?.url as string | undefined;
        if (url) s3UrlCache.set(key, url);
        return url;
    } catch { return undefined; }
}

// Extract a readable GraphQL/Network error string
function extractGraphQLError(err: any): string {
    try {
        // Apollo-style graphQLErrors first
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

        // Network errors (status + any returned error message)
        const net = err?.networkError;
        if (net) {
            const status = net.statusCode ?? net.status;
            const bodyMsg =
                net.result?.errors?.[0]?.message ||
                net.bodyText ||
                net.message;
            return `Network${status ? ` ${status}` : ''}: ${bodyMsg || 'Request failed'}`;
        }

        // Fallback
        return err?.message || 'Unknown error';
    } catch {
        return String(err || 'Unknown error');
    }
}


const NBCard = ({ children, p = 4, bg = "white", rounded = "xl", shadow = 1, ...rest }: any) => (
    <Box p={p} bg={bg} rounded={rounded} borderWidth={1} borderColor="coolGray.200" {...rest}>
        {children}
    </Box>
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
    source: 'PLANNED' | 'EXTRA';
    compliance: 'ON_PLAN' | 'OFF_PLAN' | 'PARTIAL';
    notes?: string | null;
    macros?: { protein?: number | null; carbs?: number | null; fat?: number | null; fiber?: number | null } | null;
};

/* ──────────────────────────────────────────────────────────────────────────
   Small UI bits
   ────────────────────────────────────────────────────────────────────────── */

function PercentBar({ percent, trackColor='gray.200', barColor='success.500', h='6' }:{
    percent:number; trackColor?:string; barColor?:string; h?:string|number
}) {
    const p = toInt(percent, 0, 100);
    return (
        <Box w="100%" bg={trackColor} rounded="full" h={h} overflow="hidden">
            <Box w={`${p}%`} h="100%" bg={barColor} />
        </Box>
    );
}
function StatPill({label, value}:{label:string; value:string}) {
    return (
        <VStack alignItems="center" space={0.5}>
            <Text fontSize="lg" fontWeight="bold">{value}</Text>
            <Text fontSize="xs" color="gray.500">{label}</Text>
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
    source: 'PLANNED' | 'EXTRA';
    compliance: 'ON_PLAN' | 'OFF_PLAN' | 'PARTIAL';
    notes?: string;
};

function Chip({
                  active, children, onPress
              }:{active:boolean; children:React.ReactNode; onPress:()=>void}) {
    return (
        <Button
            size="sm"
            variant={active ? "solid" : "subtle"}
            colorScheme={active ? "primary" : "coolGray"}
            borderWidth={active ? 0 : 1}
            borderColor="coolGray.300"
            onPress={onPress}
        >
            {children}
        </Button>
    );
}

function AddFoodInlinePanel({
                                defaults,
                                onCancel,
                                onSave,
                                saving
                            }:{defaults?:Partial<SavePayload>; onCancel:()=>void; onSave:(p:SavePayload)=>void; saving?:boolean;}) {
    const toast = useToast();

    const [name, setName]       = useState(defaults?.name ?? "");
    const [desc, setDesc]       = useState(defaults?.description ?? "");
    const [cal, setCal]         = useState(defaults?.calories != null ? String(defaults?.calories) : "");
    const [qty, setQty]         = useState(defaults?.quantity ?? "");
    const [protein, setProtein] = useState(defaults?.macros?.protein != null ? String(defaults?.macros?.protein) : "");
    const [carbs, setCarbs]     = useState(defaults?.macros?.carbs   != null ? String(defaults?.macros?.carbs)   : "");
    const [fat, setFat]         = useState(defaults?.macros?.fat     != null ? String(defaults?.macros?.fat)     : "");
    const [fiber, setFiber]     = useState(defaults?.macros?.fiber   != null ? String(defaults?.macros?.fiber)   : "");
    const [source, setSource]   = useState<'PLANNED'|'EXTRA'>(defaults?.source ?? 'EXTRA');
    const [compliance, setCompliance] = useState<'ON_PLAN'|'OFF_PLAN'|'PARTIAL'>(defaults?.compliance ?? 'OFF_PLAN');
    const [notes, setNotes]     = useState(defaults?.notes ?? "");

    const num = (s:string) => {
        if (!s?.trim()) return undefined;
        const n = Number(s.replace(",", "."));
        return Number.isFinite(n) ? n : undefined;
    };

    const onSubmit = () => {
        const calories = Number((cal ?? '').toString().replace(",", "."));
        if (!Number.isFinite(calories) || calories <= 0) {
            toast.show({ title: "Calories are required", placement: "top" });
            return;
        }
        onSave({
            name: name.trim() || "Food Item",
            description: desc.trim() || undefined,
            calories,
            quantity: qty.trim() || undefined,
            macros: { protein: num(protein), carbs: num(carbs), fat: num(fat), fiber: num(fiber) },
            source,
            compliance,
            notes: notes.trim() || undefined,
        });
    };

    return (
        <NBCard p={4} bg="white" rounded="xl">
            <VStack space={4}>
                <HStack alignItems="center" justifyContent="space-between">
                    <Heading size="md">Add Food Log</Heading>
                    <Button variant="ghost" onPress={onCancel}>Close</Button>
                </HStack>

                <FormControl>
                    <FormControl.Label>Name</FormControl.Label>
                    <TextInput value={name} onChangeText={setName} placeholder="e.g., Veg Sandwich" style={S.input}/>
                </FormControl>

                <FormControl isRequired>
                    <FormControl.Label>Calories *</FormControl.Label>
                    <TextInput
                        value={cal}
                        onChangeText={setCal}
                        placeholder="e.g., 420"
                        style={S.input}
                        keyboardType={Platform.OS==='ios' ? 'decimal-pad' : 'numeric'}
                    />
                </FormControl>

                <HStack space={3}>
                    <FormControl flex={1}>
                        <FormControl.Label>Protein (g)</FormControl.Label>
                        <TextInput value={protein} onChangeText={setProtein} style={S.input} keyboardType={Platform.OS==='ios' ? 'decimal-pad' : 'numeric'} />
                    </FormControl>
                    <FormControl flex={1}>
                        <FormControl.Label>Carbs (g)</FormControl.Label>
                        <TextInput value={carbs} onChangeText={setCarbs} style={S.input} keyboardType={Platform.OS==='ios' ? 'decimal-pad' : 'numeric'} />
                    </FormControl>
                    <FormControl flex={1}>
                        <FormControl.Label>Fat (g)</FormControl.Label>
                        <TextInput value={fat} onChangeText={setFat} style={S.input} keyboardType={Platform.OS==='ios' ? 'decimal-pad' : 'numeric'} />
                    </FormControl>
                </HStack>

                <FormControl>
                    <FormControl.Label>Fiber (g)</FormControl.Label>
                    <TextInput value={fiber} onChangeText={setFiber} style={S.input} keyboardType={Platform.OS==='ios' ? 'decimal-pad' : 'numeric'} />
                </FormControl>

                <FormControl>
                    <FormControl.Label>Quantity</FormControl.Label>
                    <TextInput value={qty} onChangeText={setQty} placeholder='e.g., "1 bowl", "150 g"' style={S.input}/>
                </FormControl>

                <FormControl>
                    <FormControl.Label>Description</FormControl.Label>
                    <TextInput value={desc} onChangeText={setDesc} placeholder="Optional details" style={[S.input, {height: 44}]}/>
                </FormControl>

                <HStack space={3} alignItems="center">
                    <FormControl flex={1}>
                        <FormControl.Label>Source</FormControl.Label>
                        <HStack space={2}>
                            <Chip active={source==='PLANNED'} onPress={()=>setSource('PLANNED')}>Planned</Chip>
                            <Chip active={source==='EXTRA'} onPress={()=>setSource('EXTRA')}>Extra</Chip>
                        </HStack>
                    </FormControl>

                    <FormControl flex={1}>
                        <FormControl.Label>Compliance</FormControl.Label>
                        <HStack space={2} flexWrap="wrap">
                            <Chip active={compliance==='ON_PLAN'} onPress={()=>setCompliance('ON_PLAN')}>On plan</Chip>
                            <Chip active={compliance==='OFF_PLAN'} onPress={()=>setCompliance('OFF_PLAN')}>Off plan</Chip>
                            <Chip active={compliance==='PARTIAL'} onPress={()=>setCompliance('PARTIAL')}>Partial</Chip>
                        </HStack>
                    </FormControl>
                </HStack>

                <FormControl>
                    <FormControl.Label>Coach Notes</FormControl.Label>
                    <TextInput value={notes} onChangeText={setNotes} placeholder="Optional notes" style={[S.input, {height: 44}]}/>
                </FormControl>

                <HStack justifyContent="flex-end" space={2}>
                    <Button variant="subtle" borderWidth={1} borderColor="coolGray.300" onPress={onCancel}>Cancel</Button>
                    <Button isDisabled={!!saving} onPress={onSubmit}>{saving ? 'Saving...' : 'Save Log'}</Button>
                </HStack>
            </VStack>
        </NBCard>
    );
}

/* ──────────────────────────────────────────────────────────────────────────
   Meal Card
   ────────────────────────────────────────────────────────────────────────── */

function MealCard({
                      meal, alreadyLogged, onLogPlanned, onOpenRecipe
                  }:{ meal:UIMeal; alreadyLogged:boolean; onLogPlanned:(m:UIMeal)=>void; onOpenRecipe:(url?:string)=>void }) {
    const [imgLoaded, setImgLoaded] = React.useState(false);
    return (
        <NBCard p={0} bg="white" rounded="xl">
            <VStack space={0}>
                {meal.avatarUrl ? (
                    <Box position="relative" roundedTop="xl" overflow="hidden">
                        {!imgLoaded && <Skeleton h={40} w="100%" rounded="0" />}
                        <AspectRatio w="100%" ratio={16/9} style={{ display: imgLoaded ? 'flex' : 'none' }}>
                            <Image alt="meal" source={{ uri: meal.avatarUrl }} resizeMode="cover" onLoadEnd={()=>setImgLoaded(true)} />
                        </AspectRatio>
                    </Box>
                ) : (
                    <Box w="100%" bg="gray.100" alignItems="center" justifyContent="center" roundedTop="xl" h={32}>
                        <Text fontSize="5xl">{meal.icon}</Text>
                    </Box>
                )}

                <VStack space={3} p={4}>
                    <HStack justifyContent="space-between" alignItems="center">
                        <VStack>
                            <Text fontSize="md" fontWeight="semibold" color="gray.800">{meal.title}</Text>
                            <Text fontSize="sm" color="gray.500">
                                {meal.time}{typeof meal.calories==='number' ? ` • ${Math.round(meal.calories)} cal` : ''}
                            </Text>
                        </VStack>
                        {alreadyLogged ? (
                            <Badge colorScheme="success" variant="solid">Logged</Badge>
                        ) : (
                            <Badge colorScheme="coolGray" variant="subtle" borderWidth={1} borderColor="coolGray.300">
                                Not logged
                            </Badge>
                        )}
                    </HStack>

                    {meal.items?.length ? (
                        <VStack space={1}>
                            {meal.items.map((it, idx) => (
                                <Text key={idx} fontSize="sm" color="gray.600">• {it}</Text>
                            ))}
                        </VStack>
                    ) : null}

                    {meal.macros ? (
                        <>
                            <Divider my={1} />
                            <HStack space={6}>
                                {typeof meal.macros.protein === 'number' && <StatPill label="Protein" value={`${meal.macros.protein}g`} />}
                                {typeof meal.macros.carbs === 'number' && <StatPill label="Carbs" value={`${meal.macros.carbs}g`} />}
                                {typeof meal.macros.fat === 'number' && <StatPill label="Fat" value={`${meal.macros.fat}g`} />}
                            </HStack>
                        </>
                    ) : null}

                    <HStack space={3}>
                        <Button
                            size="sm"
                            flex={1}
                            variant={alreadyLogged ? 'subtle' : 'solid'}
                            borderWidth={alreadyLogged ? 1 : 0}
                            borderColor={alreadyLogged ? 'coolGray.300' : undefined}
                            colorScheme={alreadyLogged ? 'coolGray' : 'primary'}
                            onPress={() => onLogPlanned(meal)}
                            isDisabled={alreadyLogged}
                        >
                            {alreadyLogged ? 'Already Logged' : 'Log this Meal'}
                        </Button>
                        <Button size="sm" flex={1} variant="subtle" onPress={() => onOpenRecipe(meal.recipeUrl)}>
                            <HStack space={2} alignItems="center" justifyContent="center">
                                <Icon as={FontAwesome5} name="youtube" size="sm" />
                                <Text>Recipe</Text>
                            </HStack>
                        </Button>
                    </HStack>
                </VStack>
            </VStack>
        </NBCard>
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
        return () => { mounted = false; };
    }, []);

    // date state
    const [currentDate, setCurrentDate] = useState<Date>(new Date());
    const isoDate = useMemo(()=>toISO(currentDate), [currentDate]);
    const todayWeekday = getWeekday(currentDate);

    // queries
    const { data: fpData, loading: fpLoading, error: fpErr } = useQuery(FITNESS_PROFILE, {
        variables: { userId: clientId as string },
        skip: !clientId,
        fetchPolicy: 'no-cache',
        nextFetchPolicy: 'no-cache',
    });

    const { data: plansData, loading: plansLoading, error: plansErr } = useQuery(DIET_PLANS_FOR_CLIENT, {
        variables: { clientId: clientId as string, pageNumber: 1, pageSize: 10 },
        skip: !clientId,
        fetchPolicy: 'no-cache',
        nextFetchPolicy: 'no-cache',
    });

    const { data: logsData, loading: logsLoading, error: logsErr, refetch: refetchLogs } = useQuery(DIET_LOGS_BY_DATE, {
        variables: { clientId: clientId as string, date: isoDate },
        skip: !clientId,
        fetchPolicy: 'no-cache',
        nextFetchPolicy: 'no-cache',
    });

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
        try { await AsyncStorage.setItem(STORAGE_KEYS.water, String(n)); } catch {}
    }, []);
    const addGlass = useCallback(() => {
        setWaterGlasses(prev => {
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
            const n = (name||'').toLowerCase();
            if (n.includes('breakfast')) return '🌅';
            if (n.includes('lunch')) return '🥗';
            if (n.includes('dinner')) return '🍽️';
            if (n.includes('snack')) return '🥜';
            return '🍴';
        };
        const sorted = [...plans].sort((a: any, b: any) =>
            (new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        );

        const list: UIMeal[] = [];
        for (const plan of sorted) {
            const meals = (plan.meals ?? [])
                .filter((m: any) => (m.days ?? []).includes(weekday))
                .slice()
                .sort((a: any, b: any) => {
                    if (typeof a.order === 'number' && typeof b.order === 'number') return a.order - b.order;
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
                    icon: iconFor(m.name ?? ''),
                    recipeUrl: m.recipeUrl ?? undefined,
                    avatarKey: m.avatarUrl ?? undefined,
                    macros: m.macros ? {
                        protein: m.macros.protein ?? undefined,
                        carbs: m.macros.carbs ?? undefined,
                        fat: m.macros.fat ?? undefined,
                    } : undefined
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
            const withUrls = await Promise.all(plannedMeals.map(async (m) => ({
                ...m,
                avatarUrl: await resolveS3KeyToUrl(m.avatarKey, token)
            })));
            if (!cancelled) setResolvedMeals(withUrls);
        })();
        return () => { cancelled = true; };
    }, [plannedMeals, token, tokenLoading]);

    // logs
    const dietLogs: DietLog[] = logsData?.dietLogsByDate ?? [];

    // index logs: decide if plan meal logged
    const loggedMap = useMemo(() => {
        const map = new Set<string>();
        for (const l of dietLogs) {
            if (l.planId && typeof l.planMealOrder === 'number') {
                map.add(`${l.planId}:${l.planMealOrder}`);
            }
        }
        return map;
    }, [dietLogs]);

    // totals from logs
    const dailyGoalRaw = fpData?.fitnessProfile?.profile?.computed?.recommendedCaloriesPerDay;
    const dailyGoal = Number.isFinite(dailyGoalRaw) ? (dailyGoalRaw as number) : 2200;

    const consumed = useMemo(() => {
        return Math.round((dietLogs ?? []).reduce((a, c) => a + (Number(c.calories) || 0), 0));
    }, [dietLogs]);
    const remaining = Math.max(0, Math.round(dailyGoal - consumed));
    const progressPct = toInt((consumed / Math.max(1, dailyGoal)) * 100);

    // macro totals (from logs)
    const totalProtein = Math.round((dietLogs ?? []).reduce((a,c)=>a+(Number(c.macros?.protein)||0), 0));
    const totalCarbs   = Math.round((dietLogs ?? []).reduce((a,c)=>a+(Number(c.macros?.carbs)||0), 0));
    const totalFat     = Math.round((dietLogs ?? []).reduce((a,c)=>a+(Number(c.macros?.fat)||0), 0));

    const loading = fpLoading || plansLoading || logsLoading;

    // recipe
    const openRecipe = useCallback((url?: string) => {
        if (!url) { toast.show({ title: 'No recipe link', placement: 'top' }); return; }
        Linking.openURL(url).catch(() => toast.show({ title: 'Failed to open link', placement: 'top' }));
    }, [toast]);

    /* ── Inline Add Panel state ───────────────────────────────────────────── */
    const [addMode, setAddMode] = useState<null | { defaults?: Partial<SavePayload>, planRef?: { planId?: string; planMealOrder?: number } }>(null);
    const [saving, setSaving] = useState(false);

    const openCustomAdd = () => {
        setAddMode({ defaults: { source: 'EXTRA', compliance: 'OFF_PLAN' }, planRef: undefined });
    };
    const handleLogPlanned = (m: UIMeal) => {
        setAddMode({
            planRef: { planId: m.planId, planMealOrder: m.order },
            defaults: {
                name: m.title,
                description: m.items?.[0] ?? '',
                calories: m.calories ?? (undefined as any),
                macros: { protein: m.macros?.protein, carbs: m.macros?.carbs, fat: m.macros?.fat },
                source: 'PLANNED',
                compliance: 'ON_PLAN',
            }
        });
    };

    // 🔧 fixed save with single mutation + helpful toast if client not ready
    // --- replace your saveDietLog with this safer version ---
    const saveDietLog = async (payload: SavePayload) => {
        if (!clientId) {
            toast.show({ title: "User not ready yet. Please try again.", placement: "top" });
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
            toast.show({ title: "Calories are required and must be a number.", placement: "top" });
            return;
        }

        // Build input step-by-step
        const input: any = {
            clientId,
            date: isoDate,
            name: String(payload.name || "Food Item"),
            calories,
            source: payload.source,      // 'PLANNED' | 'EXTRA'
            compliance: payload.compliance, // 'ON_PLAN' | 'OFF_PLAN' | 'PARTIAL'
        };

        if (addMode?.planRef?.planId) input.planId = addMode.planRef.planId;
        if (typeof addMode?.planRef?.planMealOrder === 'number')
            input.planMealOrder = addMode.planRef.planMealOrder;

        if (payload.description?.trim()) input.description = payload.description.trim();
        if (payload.quantity?.trim())    input.quantity = payload.quantity.trim();
        if (payload.notes?.trim())       input.notes = payload.notes.trim();

        // --- IMPORTANT: Respect new MacrosInput (protein, carbs, fat are required when macros exists)
        const havePCF = typeof p === 'number' && typeof c === 'number' && typeof f === 'number';
        if (havePCF) {
            input.macros = {
                protein: p,
                carbs: c,
                fat: f,
                ...(typeof fi === 'number' ? { fiber: fi } : {}),
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
            .sort((a,b)=>String(a.id).localeCompare(String(b.id)));
    }, [resolvedMeals]);

    return (
        <Screen withHeader>
            <Box flex={1} bg="gray.50" safeAreaTop>
                <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                    <VStack space={6} p={6}>

                        {/* Header + date nav */}
                        <VStack space={2}>
                            <HStack alignItems="center" justifyContent="space-between">
                                <Heading size="lg" color="gray.800">
                                    Diet Tracking
                                </Heading>
                                <HStack space={2}>
                                    <Button size="sm" variant="subtle" borderWidth={1} borderColor="coolGray.300"
                                            onPress={()=>setCurrentDate(d=>addDays(d,-1))}>◀︎ Prev</Button>
                                    <Button size="sm" variant="subtle" borderWidth={1} borderColor="coolGray.300"
                                            onPress={()=>setCurrentDate(new Date())}>Today</Button>
                                    <Button size="sm" variant="subtle" borderWidth={1} borderColor="coolGray.300"
                                            onPress={()=>setCurrentDate(d=>addDays(d,1))}>Next ▶︎</Button>
                                </HStack>
                            </HStack>
                            <Text color="gray.500" fontSize="md">
                                {isoDate} • {todayWeekday}
                            </Text>
                        </VStack>

                        {/* Errors */}
                        {fpErr && <Text color="red.600">Failed to load profile: {fpErr.message}</Text>}
                        {plansErr && <Text color="red.600">Failed to load plans: {plansErr.message}</Text>}
                        {logsErr && <Text color="red.600">Failed to load logs: {logsErr.message}</Text>}

                        {/* Daily Stats */}
                        <NBCard p={4} bg="white" rounded="xl">
                            <VStack space={4}>
                                <HStack justifyContent="space-between" alignItems="center">
                                    <Text fontSize="lg" fontWeight="bold" color="gray.800">Daily Nutrition</Text>
                                    <Text fontSize="sm" color="gray.500">Goal: {dailyGoal} cal</Text>
                                </HStack>

                                <VStack space={2}>
                                    {loading ? <Skeleton h="6" rounded="full" /> : <PercentBar percent={progressPct} barColor="success.500" h="6" />}
                                    <HStack justifyContent="space-between">
                                        <Text fontSize="sm" color="gray.600">Consumed: {consumed} cal</Text>
                                        <Text fontSize="sm" color="success.600">Remaining: {remaining} cal</Text>
                                    </HStack>
                                </VStack>

                                <HStack space={4} justifyContent="space-around">
                                    <StatPill label="Protein" value={loading ? '—' : `${totalProtein}g`} />
                                    <StatPill label="Carbs"   value={loading ? '—' : `${totalCarbs}g`} />
                                    <StatPill label="Fat"     value={loading ? '—' : `${totalFat}g`} />
                                </HStack>
                            </VStack>
                        </NBCard>

                        {/* Add panel toggle */}
                        {addMode ? (
                            <AddFoodInlinePanel
                                defaults={addMode.defaults}
                                onCancel={()=>setAddMode(null)}
                                onSave={saveDietLog}
                                saving={saving}
                            />
                        ) : (
                            <HStack justifyContent="flex-end">
                                <Button size="sm" onPress={openCustomAdd} isDisabled={!clientId}>+ Add Food</Button>
                            </HStack>
                        )}

                        {/* Planned Meals */}
                        <VStack space={3}>
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">Planned Meals</Text>
                            {loading ? (
                                <VStack space={3}>
                                    {[...Array(4)].map((_,i)=>(
                                        <NBCard key={i} p={4} bg="white" rounded="xl">
                                            <Skeleton h="6" mb="2" rounded="md" />
                                            <Skeleton h="4" mb="1" rounded="md" />
                                            <Skeleton h="4" rounded="md" />
                                        </NBCard>
                                    ))}
                                </VStack>
                            ) : slots.length ? (
                                slots.map((slot) => (
                                    <VStack key={slot.id} space={2}>
                                        {slot.options.map((m) => {
                                            const alreadyLogged = loggedMap.has(`${m.planId}:${m.order}`);
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
                                <NBCard p={4} bg="white" rounded="xl">
                                    <Text color="gray.600">No meals scheduled for {todayWeekday.toLowerCase()}.</Text>
                                </NBCard>
                            )}
                        </VStack>

                        {/* Logged foods list */}
                        <VStack space={3}>
                            <HStack alignItems="center" justifyContent="space-between">
                                <Text fontSize="lg" fontWeight="bold" color="gray.800">Food Logged</Text>
                                <Text fontSize="sm" color="gray.500">{dietLogs.length} item(s)</Text>
                            </HStack>
                            {logsLoading ? (
                                <VStack space={3}>
                                    {[...Array(3)].map((_,i)=>(
                                        <NBCard key={i} p={4} bg="white" rounded="xl">
                                            <Skeleton h="6" mb="2" rounded="md" />
                                            <Skeleton h="4" mb="1" rounded="md" />
                                        </NBCard>
                                    ))}
                                </VStack>
                            ) : dietLogs.length ? (
                                <VStack space={3}>
                                    {dietLogs.map((l) => (
                                        <NBCard key={l.id} p={4} bg="white" rounded="xl">
                                            <VStack space={2}>
                                                <HStack justifyContent="space-between" alignItems="center">
                                                    <VStack>
                                                        <Text fontSize="md" fontWeight="semibold" color="gray.800">{l.name}</Text>
                                                        <Text fontSize="sm" color="gray.500">
                                                            {Math.round(l.calories || 0)} cal
                                                            {l.quantity ? ` • ${l.quantity}` : ''}
                                                            {l.planId ? ' • from plan' : ' • custom'}
                                                        </Text>
                                                    </VStack>
                                                    <Badge colorScheme={l.source === 'PLANNED' ? 'primary' : 'amber'}>{l.source}</Badge>
                                                </HStack>
                                                {l.notes ? <Text fontSize="sm" color="gray.600">{l.notes}</Text> : null}
                                                <HStack space={6}>
                                                    {typeof l.macros?.protein === 'number' && <StatPill label="Protein" value={`${Math.round(l.macros?.protein||0)}g`} />}
                                                    {typeof l.macros?.carbs   === 'number' && <StatPill label="Carbs"   value={`${Math.round(l.macros?.carbs||0)}g`} />}
                                                    {typeof l.macros?.fat     === 'number' && <StatPill label="Fat"     value={`${Math.round(l.macros?.fat||0)}g`} />}
                                                </HStack>
                                            </VStack>
                                        </NBCard>
                                    ))}
                                </VStack>
                            ) : (
                                <NBCard p={4} bg="white" rounded="xl">
                                    <Text color="gray.600">No food logged for this day.</Text>
                                </NBCard>
                            )}
                        </VStack>

                        {/* Water Intake */}
                        <NBCard p={4} bg="blue.50" rounded="xl">
                            <HStack justifyContent="space-between" alignItems="center">
                                <HStack space={3} alignItems="center">
                                    <Text fontSize="2xl">💧</Text>
                                    <VStack>
                                        <Text fontSize="md" fontWeight="semibold" color="blue.800">Water Intake</Text>
                                        <Text fontSize="sm" color="blue.600">{waterGlasses} of 8 glasses today</Text>
                                    </VStack>
                                </HStack>
                                <Button size="sm" colorScheme="blue" variant="solid" onPress={addGlass}>
                                    + Add Glass
                                </Button>
                            </HStack>
                            <Box mt={3}>
                                <PercentBar percent={toInt((waterGlasses / 8) * 100)} trackColor="blue.100" barColor="blue.500" h="4" />
                            </Box>
                        </NBCard>

                        {/* Tip */}
                        <NBCard p={4} bg="success.50" rounded="xl">
                            <VStack space={2}>
                                <HStack space={2} alignItems="center">
                                    <Text fontSize="lg">💡</Text>
                                    <Text fontSize="md" fontWeight="semibold" color="success.800">Nutrition Tip</Text>
                                </HStack>
                                <Text fontSize="sm" color="success.700">
                                    Eating earlier in the day can improve energy and digestion. Front-load calories around breakfast & lunch when possible.
                                </Text>
                            </VStack>
                        </NBCard>

                        <Box h={6} />
                    </VStack>
                </ScrollView>
            </Box>
        </Screen>
    );
}

const S = StyleSheet.create({
    input: {
        borderWidth: 1,
        borderColor: "#e5e7eb",
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: Platform.OS === "ios" ? 10 : 8,
        fontSize: 16,
        color: "#111827",
        backgroundColor: "#fff",
    },
});
