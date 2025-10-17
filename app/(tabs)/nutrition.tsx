import React, { useEffect, useMemo, useState, useCallback } from 'react';
import {
    Box, VStack, HStack, Text, ScrollView, Card, Badge,
    Heading, Button, Divider, useToast, Skeleton, Icon, Image, AspectRatio
} from 'native-base';
import { Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useQuery } from '@apollo/client/react';
import { gql } from '@apollo/client';
import { FontAwesome5 } from '@expo/vector-icons';
import Screen from '@/components/ui/Screen';
import { GET_ME } from '@/graphql/queries';
import {getTokens} from "@/lib/apollo";
import {ENV} from "@/lib/env";

// ---------- GraphQL ----------
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
        dietPlansForClient(clientId: $clientId, pagination: { pageNumber: $pageNumber, pageSize: $pageSize }) {
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

// ----- number helpers -----
const toInt = (n: any, min = 0, max = 100) => {
    const x = Number.isFinite(n) ? n as number : 0;
    // EPSILON guard avoids cases like 14.000000000000002
    const r = Math.round(x + Number.EPSILON);
    return Math.min(max, Math.max(min, r));
};

// ----- UI: safe progress bar (uses % string, not floats) -----
function PercentBar({
                        percent,
                        trackColor = 'gray.200',
                        barColor = 'success.500',
                        h = '6',
                    }: { percent: number; trackColor?: string; barColor?: string; h?: string | number }) {
    const p = toInt(percent, 0, 100);
    return (
        <Box w="100%" bg={trackColor} rounded="full" h={h} overflow="hidden">
            <Box w={`${p}%`} h="100%" bg={barColor} />
        </Box>
    );
}

// ---------- small helpers ----------
type Weekday = 'MONDAY'|'TUESDAY'|'WEDNESDAY'|'THURSDAY'|'FRIDAY'|'SATURDAY'|'SUNDAY';
function getTodayWeekday(): Weekday {
    const i = new Date().getDay(); // 0=Sun
    return ['SUNDAY','MONDAY','TUESDAY','WEDNESDAY','THURSDAY','FRIDAY','SATURDAY'][i] as Weekday;
}
const STORAGE_KEYS = {
    eaten: 'tz.nutrition.eaten.v1',            // JSON string set<string> of meal keys
    water: 'tz.nutrition.water.v1',            // number
};
const MEAL_KEY = (planId: string, order: number, name: string) => `${planId}:${order}:${name}`;

// cache S3 key → URL per session
// cache S3 key → URL per session
const s3UrlCache = new Map<string, string>();

/**
 * Resolves an S3 key to a **view** URL using GET /api/aws/media/:key
 * (same contract as your onboarding screen).
 */
async function resolveS3KeyToUrl(key?: string | null, token?: string | null): Promise<string | undefined> {
    if (!key) return undefined;
    // if already a URL, use directly
    if (key.startsWith('http')) return key;
    if (s3UrlCache.has(key)) return s3UrlCache.get(key);
    if (!token) return undefined; // wait until token is ready
    try {
        const resp = await fetch(`${ENV.API_URL}/api/aws/media/${encodeURIComponent(key)}`, {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
                role: 'client',
            },
        });
        if (!resp.ok) return undefined;
        const json = await resp.json();
        const url = json?.url as string | undefined;
        if (url) s3UrlCache.set(key, url);
        return url;
    } catch {
        return undefined;
    }
}

// ---------- UI subcomponents ----------
function StatPill({label, value}:{label:string; value:string}) {
    return (
        <VStack alignItems="center" space={0.5}>
            <Text fontSize="lg" fontWeight="bold">{value}</Text>
            <Text fontSize="xs" color="gray.500">{label}</Text>
        </VStack>
    );
}

type UIMeal = {
    key: string;
    planId: string;
    title: string;
    time: string;
    calories?: number | null;
    items?: string[];
    completed: boolean;
    icon: string;
    avatarUrl?: string;
    recipeUrl?: string;
    macros?: {
        protein?: number; carbs?: number; fat?: number;
    } | null;
};

function MealCard({
                      meal,
                      onToggle,
                      onOpenRecipe
                  }: {
    meal: UIMeal;
    onToggle: (key: string)=>void;
    onOpenRecipe: (url?: string)=>void;
}) {
    const [imgLoaded, setImgLoaded] = React.useState(false);
    return (
        <Card p={0} bg="white" rounded="xl" shadow={1}>
            <VStack space={0}>
                {/* Big image row */}
                {meal.avatarUrl ? (
                    <Box position="relative" roundedTop="xl" overflow="hidden">
                        {!imgLoaded && (
                            <Skeleton h={40} w="100%" rounded="0" />
                        )}
                        <AspectRatio w="100%" ratio={16/9} style={{ display: imgLoaded ? 'flex' : 'none' }}>
                            <Image
                                alt="meal"
                                source={{ uri: meal.avatarUrl }}
                                resizeMode="cover"
                                onLoadEnd={() => setImgLoaded(true)}
                            />
                        </AspectRatio>
                    </Box>
                ) : (
                    <Box
                        w="100%"
                        bg="gray.100"
                        alignItems="center"
                        justifyContent="center"
                        roundedTop="xl"
                        h={32}
                    >
                        <Text fontSize="5xl">{meal.icon}</Text>
                    </Box>
                )}
                {/* Content */}
                <VStack space={3} p={4}>
                    <HStack justifyContent="space-between" alignItems="center">
                        <VStack>
                            <Text fontSize="md" fontWeight="semibold" color="gray.800">
                                {meal.title}
                            </Text>
                            <Text fontSize="sm" color="gray.500">
                                {meal.time}{meal.calories ? ` • ${Math.round(meal.calories)} cal` : ''}
                            </Text>
                        </VStack>
                        {meal.completed ? (
                            <Badge colorScheme="success" variant="solid">✓ Done</Badge>
                        ) : (
                            <Badge colorScheme="gray" variant="outline">Pending</Badge>
                        )}
                    </HStack>

                    {meal.items?.length ? (
                        <VStack space={1}>
                            {meal.items.map((item, idx) => (
                                <Text key={idx} fontSize="sm" color="gray.600">• {item}</Text>
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
                        {!meal.completed ? (
                            <Button size="sm" flex={1} variant="outline" onPress={() => onToggle(meal.key)}>
                                Mark as Eaten
                            </Button>
                        ) : (
                            <Button size="sm" flex={1} variant="outline" colorScheme="coolGray" onPress={() => onToggle(meal.key)}>
                                Undo
                            </Button>
                        )}
                        <Button size="sm" flex={1} variant="subtle" onPress={() => onOpenRecipe(meal.recipeUrl)}>
                            <HStack space={2} alignItems="center" justifyContent="center">
                                <Icon as={FontAwesome5} name="youtube" size="sm" />
                                <Text>Recipe</Text>
                            </HStack>
                        </Button>
                    </HStack>
                </VStack>
            </VStack>
        </Card>
    );
}


// ---------- Screen ----------
export default function NutritionScreen() {
    const toast = useToast();
    const today = getTodayWeekday();

    // who am i
    const { data: meData } = useQuery(GET_ME);
    // @ts-ignore
    const clientId: string | undefined = meData?.user?._id;

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

    // local cache (device only)
    const [eatenKeys, setEatenKeys] = useState<Set<string>>(new Set());
    const [waterGlasses, setWaterGlasses] = useState<number>(0);

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

    useEffect(() => {
        (async () => {
            try {
                const [eatenRaw, waterRaw] = await Promise.all([
                    AsyncStorage.getItem(STORAGE_KEYS.eaten),
                    AsyncStorage.getItem(STORAGE_KEYS.water),
                ]);
                setEatenKeys(new Set(JSON.parse(eatenRaw ?? '[]')));
                setWaterGlasses(Number(waterRaw ?? 0));
            } catch {
                // ignore
            }
        })();
    }, []);

    const persistEaten = useCallback(async (s: Set<string>) => {
        try {
            await AsyncStorage.setItem(STORAGE_KEYS.eaten, JSON.stringify([...s]));
        } catch { /* ignore */ }
    }, []);

    const persistWater = useCallback(async (n: number) => {
        try {
            await AsyncStorage.setItem(STORAGE_KEYS.water, String(n));
        } catch { /* ignore */ }
    }, []);

    const toggleEaten = useCallback((key: string) => {
        setEatenKeys(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            persistEaten(next);
            return next;
        });
    }, [persistEaten]);

    const addGlass = useCallback(() => {
        setWaterGlasses(prev => {
            const next = Math.min(prev + 1, 20);
            persistWater(next);
            return next;
        });
    }, [persistWater]);

    const openRecipe = useCallback((url?: string) => {
        if (!url) {
            toast.show({ title: 'No recipe link', placement: 'top' });
            return;
        }
        Linking.openURL(url).catch(() => {
            toast.show({ title: 'Failed to open link', placement: 'top' });
        });
    }, [toast]);

    // flatten meals for TODAY across all plans (latest plans first)
    const todaysMeals: UIMeal[] = useMemo(() => {
        // @ts-ignore
        const plans = plansData?.dietPlansForClient ?? [];
        const list: UIMeal[] = [];
        const iconFor = (name: string) => {
            const n = name.toLowerCase();
            if (n.includes('breakfast')) return '🌅';
            if (n.includes('lunch')) return '🥗';
            if (n.includes('dinner')) return '🍽️';
            if (n.includes('snack')) return '🥜';
            return '🍴';
        };



        // sort by updatedAt desc to prefer recent plans
        const sorted = [...plans].sort((a: any, b: any) => (new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));

        for (const plan of sorted) {
            const meals = (plan.meals ?? [])
                .filter((m: any) => (m.days ?? []).includes(today))
                .slice()
                .sort((a: any, b: any) => {
                    if (typeof a.order === 'number' && typeof b.order === 'number') return a.order - b.order;
                    return String(a.scheduledTime).localeCompare(String(b.scheduledTime));
                });

            for (const m of meals) {
                const key = MEAL_KEY(plan._id, m.order ?? 0, m.name ?? '');
                list.push({
                    key,
                    planId: plan._id,
                    title: m.name,
                    time: m.scheduledTime,
                    calories: m.calories ?? null,
                    items: m.description ? [m.description] : undefined,
                    completed: eatenKeys.has(key),
                    icon: iconFor(m.name ?? ''),
                    recipeUrl: m.recipeUrl ?? undefined,
                    avatarUrl: undefined, // we resolve below
                    macros: m.macros ? {
                        protein: m.macros.protein ?? undefined,
                        carbs: m.macros.carbs ?? undefined,
                        fat: m.macros.fat ?? undefined
                    } : undefined
                });
            }
        }
        return list;
    }, [plansData, today, eatenKeys]);


    type Slot = { id: string; options: UIMeal[] };
    const slots: Slot[] = useMemo(() => {
        const map = new Map<string, UIMeal[]>();
        for (const m of todaysMeals) {
            const id = m.time; // if you want stricter grouping, use `${m.time}:${m.title.toLowerCase().includes('breakfast')?'breakfast':''}`
            const arr = map.get(id) ?? [];
            arr.push(m);
            map.set(id, arr);
        }
// stable order: by time ascending based on first option
        return [...map.entries()]
            .map(([id, options]) => ({ id, options }))
            .sort((a, b) => String(a.id).localeCompare(String(b.id)));
    }, [todaysMeals]);

    const [selectedForSlot, setSelectedForSlot] = useState<Record<string, string>>({});
    useEffect(() => {
        setSelectedForSlot(prev => {
            const next = { ...prev };
            for (const s of slots) {
                if (!next[s.id]) next[s.id] = s.options[0]?.key;
            }
            return next;
        });
    }, [slots]);

    // resolve avatarUrl keys -> URLs (best-effort)
    const [resolvedMeals, setResolvedMeals] = useState<UIMeal[]>([]);
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (tokenLoading) return; // wait for token
            const withUrls = await Promise.all(todaysMeals.map(async (m) => ({
                ...m,
                avatarUrl: await resolveS3KeyToUrl(
                    // find original meal by key to read avatar key
                    (() => {
                        const [planId, orderStr, ...rest] = m.key.split(':');
                        const name = rest.join(':'); // name might include :
                        const plan = (plansData?.dietPlansForClient ?? []).find((p: any) => p._id === planId);
                        const mm = plan?.meals?.find((x: any) => (x.order ?? 0) === Number(orderStr) && x.name === name);
                        return mm?.avatarUrl ?? undefined;
                    })()
                    , token)
            })));
            if (!cancelled) setResolvedMeals(withUrls);
        })();
        return () => { cancelled = true; };
    }, [todaysMeals, plansData, token, tokenLoading]);

    // calories math
    // @ts-ignore
    const dailyGoalRaw = fpData?.fitnessProfile?.profile?.computed?.recommendedCaloriesPerDay;
    const dailyGoal = Number.isFinite(dailyGoalRaw) ? (dailyGoalRaw as number) : 2200;

    const consumed = useMemo(() => {
        let sum = 0;
        for (const s of slots) {
            const selectedKey = selectedForSlot[s.id];
            const selected = s.options.find(o => o.key === selectedKey);
            if (selected?.completed && typeof selected.calories === 'number') {
                sum += selected.calories;
            }
        }
        return Math.round(sum);
    }, [slots, selectedForSlot]);
    const remaining = toInt(dailyGoal - consumed, 0, Number.MAX_SAFE_INTEGER);
    const progressPct = toInt((consumed / Math.max(1, dailyGoal)) * 100);

    const loading = fpLoading || plansLoading;

    // ---------- render ----------
    return (
        <Screen withHeader>
            <Box flex={1} bg="gray.50" safeAreaTop>
                <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                    <VStack space={6} p={6}>
                        {/* Header */}
                        <VStack space={2}>
                            <Heading size="lg" color="gray.800">Today{"'"}s Nutrition</Heading>
                            <Text color="gray.500" fontSize="md">Stay on track with your meal plan</Text>
                        </VStack>

                        {/* Errors */}
                        {fpErr && <Text color="red.600">Failed to load profile: {fpErr.message}</Text>}
                        {plansErr && <Text color="red.600">Failed to load plans: {plansErr.message}</Text>}

                        {/* Daily Stats */}
                        <Card p={4} bg="white" rounded="xl" shadow={2}>
                            <VStack space={4}>
                                <HStack justifyContent="space-between" alignItems="center">
                                    <Text fontSize="lg" fontWeight="bold" color="gray.800">Daily Nutrition</Text>
                                    <Text fontSize="sm" color="gray.500">Goal: {dailyGoal} cal</Text>
                                </HStack>

                                <VStack space={2}>
                                    {loading ? (
                                        <Skeleton h="6" rounded="full" />
                                    ) : (
                                        <PercentBar percent={progressPct} barColor="success.500" h="6" />
                                    )}
                                    <HStack justifyContent="space-between">
                                        <Text fontSize="sm" color="gray.600">Consumed: {consumed} cal</Text>
                                        <Text fontSize="sm" color="success.600">Remaining: {remaining} cal</Text>
                                    </HStack>
                                </VStack>

                                {/* quick macro sums (from eaten meals only — optional simple sum) */}
                                <HStack space={4} justifyContent="space-around">
                                    <StatPill
                                        label="Protein"
                                        value={
                                            loading ? '—'
                                                : `${todaysMeals.filter(m=>m.completed).reduce((a,c)=>a+(c.macros?.protein ?? 0),0)}g`
                                        }
                                    />
                                    <StatPill
                                        label="Carbs"
                                        value={
                                            loading ? '—'
                                                : `${todaysMeals.filter(m=>m.completed).reduce((a,c)=>a+(c.macros?.carbs ?? 0),0)}g`
                                        }
                                    />
                                    <StatPill
                                        label="Fat"
                                        value={
                                            loading ? '—'
                                                : `${todaysMeals.filter(m=>m.completed).reduce((a,c)=>a+(c.macros?.fat ?? 0),0)}g`
                                        }
                                    />
                                </HStack>
                            </VStack>
                        </Card>

                        {/* Water Intake */}
                        <Card p={4} bg="blue.50" rounded="xl" shadow={1}>
                            <HStack justifyContent="space-between" alignItems="center">
                                <HStack space={3} alignItems="center">
                                    <Text fontSize="2xl">💧</Text>
                                    <VStack>
                                        <Text fontSize="md" fontWeight="semibold" color="blue.800">
                                            Water Intake
                                        </Text>
                                        <Text fontSize="sm" color="blue.600">
                                            {waterGlasses} of 8 glasses today
                                        </Text>
                                    </VStack>
                                </HStack>
                                <Button size="sm" colorScheme="blue" variant="solid" onPress={addGlass}>
                                    + Add Glass
                                </Button>
                            </HStack>
                            <Box mt={3}>
                                <PercentBar
                                    percent={toInt((waterGlasses / 8) * 100)}
                                    trackColor="blue.100"
                                    barColor="blue.500"
                                    h="4"
                                />
                            </Box>
                        </Card>

                        {/* Meals for Today */}
                        <VStack space={3}>
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">Today{"'"}s Meals</Text>

                            {loading ? (
                                <VStack space={3}>
                                    {[...Array(4)].map((_,i)=>(
                                        <Card key={i} p={4} bg="white" rounded="xl" shadow={1}>
                                            <Skeleton h="6" mb="2" rounded="md" />
                                            <Skeleton h="4" mb="1" rounded="md" />
                                            <Skeleton h="4" rounded="md" />
                                        </Card>
                                    ))}
                                </VStack>
                            ) : slots.length ? (
                                slots.map((slot) => {
                                    // pick the selected option; default already set
                                    const selectedKey = selectedForSlot[slot.id] ?? slot.options[0]?.key;
                                    // use the resolvedMeals data for avatar URLs
                                    const selected = (resolvedMeals.find(r => r.key === selectedKey) ?? slot.options.find(o => o.key === selectedKey))!;
                                    const alt = slot.options.filter(o => o.key !== selectedKey);
                                    return (
                                        <VStack key={slot.id} space={2}>
                                            <MealCard meal={selected} onToggle={toggleEaten} onOpenRecipe={openRecipe} />
                                            {alt.length > 0 && (
                                                <HStack justifyContent="flex-end">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onPress={() => {
                                                            // simple inline rotate for now: pick next option
                                                            const idx = slot.options.findIndex(o => o.key === selectedKey);
                                                            const next = slot.options[(idx + 1) % slot.options.length];
                                                            setSelectedForSlot(prev => ({ ...prev, [slot.id]: next.key }));
                                                        }}
                                                    >
                                                        Change option ({alt.length})
                                                    </Button>
                                                </HStack>
                                            )}
                                        </VStack>
                                    );
                                })
                            ) : (
                                <Card p={4} bg="white" rounded="xl" shadow={1}>
                                    <Text color="gray.600">No meals scheduled for {today.toLowerCase()}.</Text>
                                </Card>
                            )}
                        </VStack>

                        {/* Tip */}
                        <Card p={4} bg="success.50" rounded="xl" shadow={1}>
                            <VStack space={2}>
                                <HStack space={2} alignItems="center">
                                    <Text fontSize="lg">💡</Text>
                                    <Text fontSize="md" fontWeight="semibold" color="success.800">
                                        Nutrition Tip
                                    </Text>
                                </HStack>
                                <Text fontSize="sm" color="success.700">
                                    Eating earlier in the day can improve energy and digestion. Front-load calories around breakfast & lunch when possible.
                                </Text>
                            </VStack>
                        </Card>

                        <Box h={6} />
                    </VStack>
                </ScrollView>
            </Box>
        </Screen>
    );
}
