import React, { useEffect, useMemo, useState } from "react";
import { Alert, TextInput } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useMutation, useQuery } from "@apollo/client/react";
import {
    Avatar,
    Badge,
    Box,
    Button,
    Divider,
    Flex,
    HStack,
    Icon,
    Modal,
    Pressable,
    ScrollView,
    Spinner,
    Text,
    VStack,
} from "native-base";
import { LinearGradient } from "expo-linear-gradient";
import { Feather, FontAwesome5 } from "@expo/vector-icons";
import {
    HourSlot,
    Session,
    SessionStatus,
    SessionType,
    Subscription,
    SubscriptionPlan,
} from "@/graphql/types";
import {
    GET_ACTIVE_CLIENT_SUBSCRIPTIONS,
    GET_ME,
    GET_SESSIONS_FOR_TRAINER,
    GET_TRAINER_CONTACT,
    GET_TRAINER_PLANS,
    GET_TRAINER_SLOTS_NEXT_7_DAYS,
} from "@/graphql/queries";
import {
    BOOK_TRAINING_SESSION,
    CREATE_SUBSCRIPTION,
    CANCEL_SUBSCRIPTION,
} from "@/graphql/mutations";
import RazorpayCheckout from "react-native-razorpay";
import { ENV } from "@/lib/env";
import Screen from "@/components/ui/Screen";

const SLOT_DURATION_MIN = 60;
const LOOKAHEAD_DAYS = 7;

const BASE_BG = "#050111";
const HERO_BG = "#140B2D";
const CARD_BG = "#0E0A22";
const BORDER_COLOR = "rgba(124,58,237,0.25)";
const SOFT_TEXT = "#A5A1C2";
const ACCENT_PURPLE = "#7C3AED";
const ACCENT_PURPLE_DARK = "#5B21B6";
const ACCENT_PURPLE_LIGHT = "#C4B5FD";
const BLOCKING_STATUSES: SessionStatus[] = ["PENDING", "CONFIRMED"];

const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
const toISO = (d: Date) => new Date(d).toISOString();
const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
const startOfDayLocal = (d: Date) => {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
};
const daysArray = () => {
    const now = new Date();
    return Array.from({ length: LOOKAHEAD_DAYS }, (_, i) => {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        return startOfDayLocal(d);
    });
};
const isPast = (d: Date) => d.getTime() <= Date.now();
const addDaysMinutes = LOOKAHEAD_DAYS * 24 * 60;
const isFutureWithin7Days = (d: Date) => {
    const now = new Date();
    const max = addMinutes(now, addDaysMinutes);
    return d >= now && d <= max;
};
const formatYMD = (d: Date) => {
    const y = d.getFullYear();
    const m = `${d.getMonth() + 1}`.padStart(2, "0");
    const day = `${d.getDate()}`.padStart(2, "0");
    return `${y}-${m}-${day}`;
};

const STATUS_LABELS: Record<string, { color: string; bg: string; label: string }> = {
    ACTIVE: { color: "#22C55E", bg: "rgba(34,197,94,0.15)", label: "Active" },
    REQUESTED_CANCELLATION: {
        color: "#60A5FA",
        bg: "rgba(96,165,250,0.15)",
        label: "Ending this cycle",
    },
    PENDING: { color: "#FBBF24", bg: "rgba(251,191,36,0.18)", label: "Pending" },
};

type SectionHeaderProps = {
    title: string;
    subtitle?: string;
    actionLabel?: string;
    onActionPress?: () => void;
};

const SectionHeader = ({ title, subtitle, actionLabel, onActionPress }: SectionHeaderProps) => (
    <HStack justifyContent="space-between" alignItems="flex-start" mb={4} space={3}>
        <VStack flex={1} space={1}>
            <Text color="white" fontSize="lg" fontWeight="bold">
                {title}
            </Text>
            {subtitle ? (
                <Text color={SOFT_TEXT} fontSize="xs">
                    {subtitle}
                </Text>
            ) : null}
        </VStack>
        {actionLabel && onActionPress ? (
            <Pressable onPress={onActionPress} hitSlop={12}>
                <Text color={ACCENT_PURPLE_LIGHT} fontWeight="bold" fontSize="xs">
                    {actionLabel}
                </Text>
            </Pressable>
        ) : null}
    </HStack>
);

const GlassSurface = ({ children, ...props }: { children: React.ReactNode } & Record<string, any>) => (
    <Box
        borderRadius="3xl"
        borderWidth={1}
        borderColor={BORDER_COLOR}
        bg="rgba(10,5,23,0.9)"
        px={5}
        py={5}
        {...props}
    >
        {children}
    </Box>
);

const HeroStat = ({ icon, label, value }: { icon: string; label: string; value: string }) => (
    <VStack
        flex={1}
        borderRadius="2xl"
        borderWidth={1}
        borderColor="rgba(255,255,255,0.05)"
        bg="rgba(255,255,255,0.02)"
        px={4}
        py={3}
        space={1}
    >
        <HStack space={2} alignItems="center">
            <Box bg="rgba(124,58,237,0.2)" p={1.5} borderRadius="full">
                <Icon as={Feather} name={icon} size="sm" color={ACCENT_PURPLE_LIGHT} />
            </Box>
            <Text color={SOFT_TEXT} fontSize="xs" textTransform="uppercase">
                {label}
            </Text>
        </HStack>
        <Text color="white" fontSize="lg" fontWeight="bold">
            {value}
        </Text>
    </VStack>
);

export default function TrainerDetail() {
    const params = useLocalSearchParams<{
        trainerId: string;
        trainerName?: string;
        trainerEmail?: string;
        avatarUrl?: string;
    }>();

    const trainerId = params.trainerId;
    const displayName = params.trainerName || params.trainerEmail || "Trainer";
    const avatarUrl = params.avatarUrl || "";

    const [selectedDay, setSelectedDay] = useState<Date>(startOfDayLocal(new Date()));
    const [sessionType, setSessionType] = useState<SessionType>("ONLINE");
    const [street, setStreet] = useState("");
    const [aptSuite, setAptSuite] = useState("");
    const [city, setCity] = useState("");
    const [stateRegion, setStateRegion] = useState("");
    const [postalCode, setPostalCode] = useState("");
    const [country, setCountry] = useState("");
    const [notesClient, setNotesClient] = useState("");
    const [prefilledAddress, setPrefilledAddress] = useState(false);
    const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string>("");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingStartISO, setPendingStartISO] = useState<string>("");
    const [paymentSuccess, setPaymentSuccess] = useState(false);

    const { data: meData, loading: meLoading } = useQuery(GET_ME);

    const { data: sessionsData, loading: sessLoading, refetch: refetchSessions } = useQuery<{
        sessionsForTrainer: Session[];
    }>(GET_SESSIONS_FOR_TRAINER, {
        variables: { trainerId, pagination: { pageNumber: 1, pageSize: 300 } },
        skip: !trainerId,
        notifyOnNetworkStatusChange: true,
    });

    const {
        data: subData,
        loading: subLoading,
        refetch: refetchSubs,
    } = useQuery<{ activeClientSubscriptions: Subscription[] }>(GET_ACTIVE_CLIENT_SUBSCRIPTIONS, {
        variables: { trainerId },
        skip: !trainerId,
        notifyOnNetworkStatusChange: true,
    });

    const {
        data: plansData,
        loading: plansLoading,
        refetch: refetchPlans,
    } = useQuery<{ subscriptionPlansForTrainer: SubscriptionPlan[] }>(GET_TRAINER_PLANS, {
        variables: { trainerId, pagination: { pageNumber: 1, pageSize: 50 } },
        skip: !trainerId,
        notifyOnNetworkStatusChange: true,
    });

    const { data: slotsData, loading: slotsLoading, refetch: refetchSlots } = useQuery<{
        trainerAvailableHourSlotsNext7Days: HourSlot[];
    }>(GET_TRAINER_SLOTS_NEXT_7_DAYS, {
        variables: { trainerId },
        skip: !trainerId,
        notifyOnNetworkStatusChange: true,
        fetchPolicy: "no-cache",
    });

    const { data: trainerContactData } = useQuery<{
        trainer: {
            _id: string;
            userId: string;
            contact?: {
                phone?: string | null;
                addressLine1?: string | null;
                addressLine2?: string | null;
                city?: string | null;
                state?: string | null;
                country?: string | null;
                postalCode?: string | null;
            } | null;
        } | null;
    }>(GET_TRAINER_CONTACT, {
        variables: { trainerId },
        skip: !trainerId,
    });

    const [bookSession, { loading: booking }] = useMutation(BOOK_TRAINING_SESSION);
    const [createSubscription, { loading: creatingSub }] = useMutation(CREATE_SUBSCRIPTION);
    const [cancelSubscription, { loading: cancelling }] = useMutation(CANCEL_SUBSCRIPTION);

    const next7Days = useMemo(() => daysArray(), []);
    const allSessions = useMemo(
        () => sessionsData?.sessionsForTrainer ?? [],
        [sessionsData]
    );
    const rawServerSlots = useMemo<HourSlot[]>(
        () => slotsData?.trainerAvailableHourSlotsNext7Days ?? [],
        [slotsData]
    );

    const bookedSlotTimes = useMemo(() => {
        const now = new Date();
        const max = addMinutes(now, addDaysMinutes);
        const taken = new Set<number>();
        for (const session of allSessions) {
            const start = new Date(session.scheduledStart);
            if (BLOCKING_STATUSES.includes(session.status) && start >= now && start <= max) {
                taken.add(start.getTime());
            }
        }
        return taken;
    }, [allSessions]);

    const serverSlots = useMemo(
        () =>
            rawServerSlots.filter((slot) => {
                const start = new Date(slot.startUtc).getTime();
                return !bookedSlotTimes.has(start);
            }),
        [rawServerSlots, bookedSlotTimes]
    );

    const countsByYmd = useMemo(() => {
        const acc: Record<string, number> = {};
        for (const s of serverSlots) {
            acc[s.ymdLocal] = (acc[s.ymdLocal] || 0) + 1;
        }
        return acc;
    }, [serverSlots]);

    const availableCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        for (const d of next7Days) {
            const ymd = formatYMD(d);
            counts[ymd] = countsByYmd[ymd] ?? 0;
        }
        return counts;
    }, [next7Days, countsByYmd]);

    const slotsForSelected = useMemo(
        () =>
            serverSlots
                .filter((s) => s.ymdLocal === formatYMD(selectedDay))
                .map((s) => {
                    const start = new Date(s.startUtc);
                    const end = new Date(s.endUtc);
                    const disabled = isPast(start) || !isFutureWithin7Days(start);
                    return { start, end, disabled };
                }),
        [serverSlots, selectedDay]
    );

    const trainerContact = trainerContactData?.trainer?.contact;

    useEffect(() => {
        if (prefilledAddress || !trainerContact) {
            return;
        }
        const hasDetails =
            trainerContact.addressLine1 ||
            trainerContact.addressLine2 ||
            trainerContact.city ||
            trainerContact.state ||
            trainerContact.country ||
            trainerContact.postalCode;
        if (!hasDetails) {
            return;
        }

        setStreet((prev) => prev || trainerContact.addressLine1 || "");
        setAptSuite((prev) => prev || trainerContact.addressLine2 || "");
        setCity((prev) => prev || trainerContact.city || "");
        setStateRegion((prev) => prev || trainerContact.state || "");
        setPostalCode((prev) => prev || trainerContact.postalCode || "");
        setCountry((prev) => prev || trainerContact.country || "");
        setPrefilledAddress(true);
    }, [trainerContact, prefilledAddress]);

    const subsForTrainer = useMemo(() => subData?.activeClientSubscriptions ?? [], [subData]);
    const activeSubsForTrainer = useMemo(() => subsForTrainer.filter((s) => s.status === "ACTIVE"), [subsForTrainer]);
    const pendingSubsForTrainer = useMemo(
        () => subsForTrainer.filter((s) => s.status === "PENDING"),
        [subsForTrainer]
    );
    const cancelRequestedSubsForTrainer = useMemo(
        () => subsForTrainer.filter((s) => s.status === "REQUESTED_CANCELLATION"),
        [subsForTrainer]
    );
    const bookingEligibleSubs = useMemo(
        () => subsForTrainer.filter((s) => s.status === "ACTIVE" || s.status === "REQUESTED_CANCELLATION"),
        [subsForTrainer]
    );

    const hasBookingEligibleSubs = bookingEligibleSubs.length > 0;

    useEffect(() => {
        if (hasBookingEligibleSubs && !selectedSubscriptionId) {
            const preferred =
                bookingEligibleSubs.find((s) => s.status === "ACTIVE") || bookingEligibleSubs[0];
            if (preferred) setSelectedSubscriptionId(preferred._id);
        }
    }, [hasBookingEligibleSubs, bookingEligibleSubs, selectedSubscriptionId]);

    const trainerPlans = useMemo(() => {
        const all = plansData?.subscriptionPlansForTrainer ?? [];
        return all.filter((p) => p.isActive);
    }, [plansData]);

    const handleSlotSelect = (iso: string) => {
        const start = new Date(iso);
        if (isPast(start) || !isFutureWithin7Days(start)) {
            Alert.alert("Unavailable", "You can’t book past or out-of-window slots.");
            return;
        }
        setPendingStartISO(iso);
        setConfirmOpen(true);
    };

    const onConfirmBooking = async () => {
        if (!pendingStartISO) return;
        // @ts-ignore
        if (!meData?.user?._id) return;
        if (!hasBookingEligibleSubs) {
            Alert.alert("No active subscription", "Subscribe to a plan before booking.");
            return;
        }
        if (!selectedSubscriptionId) {
            Alert.alert("Choose subscription", "Select a subscription to continue.");
            return;
        }

        const start = new Date(pendingStartISO);
        const end = addMinutes(start, SLOT_DURATION_MIN);
        if (isPast(start) || !isFutureWithin7Days(start)) {
            Alert.alert("Unavailable", "Selected time is no longer bookable.");
            setConfirmOpen(false);
            setPendingStartISO("");
            return;
        }

        const input: any = {
            trainerId,
            // @ts-ignore
            clientId: meData.user._id,
            type: sessionType,
            subscriptionId: selectedSubscriptionId,
            scheduledStart: toISO(start),
            scheduledEnd: toISO(end),
        };

        if (sessionType === "IN_PERSON") {
            if (!street.trim() || !city.trim() || !country.trim()) {
                Alert.alert("Address required", "Fill Street, City and Country.");
                return;
            }
            input.location = {
                addressLine1: street.trim(),
                addressLine2: aptSuite.trim() || undefined,
                city: city.trim(),
                state: stateRegion.trim() || undefined,
                postalCode: postalCode.trim() || undefined,
                country: country.trim(),
            };
        }

        if (notesClient.trim()) {
            input.notes = { client: notesClient.trim() };
        }

        try {
            await bookSession({ variables: { input } });
            setConfirmOpen(false);
            setPendingStartISO("");
            Alert.alert("Booked", "Your session has been scheduled.");
            refetchSessions();
            refetchSlots();
        } catch (e) {
            console.error("Booking error", e);
            Alert.alert("Error", "Couldn’t book this slot. Try another.");
        }
    };

    const subscribeToPlan = async (plan: SubscriptionPlan) => {
        // @ts-ignore
        if (!meData?.user?._id) return;
        try {
            const { data } = await createSubscription({
                variables: { input: { planId: plan._id, trainerId } },
            });
            // @ts-ignore
            const sub = data?.createSubscription as Subscription | undefined;
            // @ts-ignore
            if (!sub?.rzpSubscriptionId) {
                Alert.alert("Error", "Unable to create subscription.");
                return;
            }
            const key = ENV.RZP_CLIENT_ID;
            if (!key) {
                Alert.alert("Missing key", "EXPO_PUBLIC_RAZORPAY_KEY_ID not set.");
                return;
            }
            const options: any = {
                key,
                name: "TrainZilla",
                description: plan.description || plan.name,
                // @ts-ignore
                subscription_id: sub.rzpSubscriptionId,
                prefill: {
                    // @ts-ignore
                    name: meData.user.name || "",
                    // @ts-ignore
                    email: meData.user.email || "",
                },
                notes: {
                    trainerId,
                    planId: plan._id,
                    // @ts-ignore
                    clientId: meData.user._id,
                    app: "trainzilla",
                },
                theme: { color: "#111111" },
            };
            await RazorpayCheckout.open(options);
            setPaymentSuccess(true);
            await refetchSubs();
            await refetchPlans();
        } catch (err: any) {
            console.log("Razorpay error", err?.description || err);
            Alert.alert("Payment failed", "Please try again.");
        }
    };

    const handleCancelSubscription = async (subscriptionId: string) => {
        Alert.alert(
            "Cancel subscription",
            "You can continue using it until the billing cycle ends.",
            [
                { text: "Keep", style: "cancel" },
                {
                    text: "Cancel",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await cancelSubscription({ variables: { subscriptionId } });
                            Alert.alert("Submitted", "Cancellation request sent.");
                            refetchSubs();
                        } catch (e) {
                            Alert.alert("Error", "Unable to cancel. Try again.");
                        }
                    },
                },
            ]
        );
    };

    const loadingAny = meLoading || sessLoading || subLoading || slotsLoading;
    const showInitialLoader = loadingAny && !subData;

    const selectedStart = pendingStartISO ? new Date(pendingStartISO) : null;
    const todaysSlotCount = availableCounts[formatYMD(selectedDay)] ?? 0;

    const openSlotsCount = useMemo(() => {
        return serverSlots.filter((slot) => {
            const start = new Date(slot.startUtc);
            return !isPast(start);
        }).length;
    }, [serverSlots]);

    const heroStats = useMemo(
        () => [
            {
                icon: "star",
                label: "Active plans",
                value: activeSubsForTrainer.length ? `${activeSubsForTrainer.length}` : "None",
            },
            {
                icon: "clock",
                label: "Open slots",
                value: openSlotsCount ? `${openSlotsCount} in 7d` : "Check back",
            },
            {
                icon: "calendar",
                label: "Today",
                value: todaysSlotCount ? `${todaysSlotCount} slots` : "Sold out",
            },
        ],
        [activeSubsForTrainer.length, openSlotsCount, todaysSlotCount]
    );

    return (
        <Screen withHeader backgroundColor={BASE_BG}>
            <Box flex={1} bg={BASE_BG}>
                {showInitialLoader ? (
                    <Box flex={1} alignItems="center" justifyContent="center" px={10}>
                        <Spinner size="lg" color={ACCENT_PURPLE_LIGHT} />
                        <Text color={SOFT_TEXT} mt={4} textAlign="center">
                            Preparing booking experience...
                        </Text>
                    </Box>
                ) : (
                    <>
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={{ paddingBottom: 80 }}
                        >
                            <Box px={5} pt={8}>
                                <Box borderRadius="3xl" shadow={9} overflow="hidden">
                                    <LinearGradient
                                        colors={["#3B1E66", "#090313"]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={{ padding: 24, paddingBottom: 40 }}
                                    >
                                        <HStack justifyContent="space-between" alignItems="center">
                                            <Pressable onPress={() => router.back()} hitSlop={12}>
                                                <Icon as={Feather} name="arrow-left" color="white" size="lg" />
                                            </Pressable>
                                            <Badge bg="rgba(0,0,0,0.25)" borderRadius="full" px={3} py={1}>
                                                <Text color="white" fontSize="xs" fontWeight="bold">
                                                    Premium booking
                                                </Text>
                                            </Badge>
                                            <Box w={8} />
                                        </HStack>
                                        <HStack mt={8} space={5} alignItems="center">
                                            <Avatar size="xl" source={avatarUrl ? { uri: avatarUrl } : undefined} bg="rgba(124,58,237,0.3)">
                                                <Icon as={FontAwesome5} name="user-tie" color="white" size="sm" />
                                            </Avatar>
                                            <VStack flex={1} space={1}>
                                                <Text color="white" fontSize="2xl" fontWeight="bold">
                                                    {displayName}
                                                </Text>
                                                <Text color={SOFT_TEXT} fontSize="sm">
                                                    Precision coaching partner
                                                </Text>
                                                <Text color={SOFT_TEXT} fontSize="xs">
                                                    Next {LOOKAHEAD_DAYS} days · {SLOT_DURATION_MIN} min blocks
                                                </Text>
                                            </VStack>
                                        </HStack>
                                        <Text color={SOFT_TEXT} mt={5} fontSize="sm">
                                            Lock sessions with responsive slots curated by {displayName}. Pick a format, confirm, and your trainer gets instant updates.
                                        </Text>
                                        <Flex direction="row" wrap="wrap" mt={5}>
                                            {["Precision coaching", "Live availability", "Secure payments"].map((chip) => (
                                                <Badge
                                                    key={chip}
                                                    borderRadius="full"
                                                    bg="rgba(255,255,255,0.12)"
                                                    px={3}
                                                    py={1}
                                                    mr={2}
                                                    mb={2}
                                                >
                                                    <Text color="white" fontSize="xs" fontWeight="bold">
                                                        {chip}
                                                    </Text>
                                                </Badge>
                                            ))}
                                        </Flex>
                                    </LinearGradient>
                                </Box>
                                <GlassSurface mt={-8} shadow={6} mb={4}>
                                    <HStack space={3}>
                                        {heroStats.map((stat) => (
                                            <HeroStat key={stat.label} {...stat} />
                                        ))}
                                    </HStack>
                                    {paymentSuccess && (
                                        <HStack
                                            mt={5}
                                            space={3}
                                            p={3}
                                            borderRadius="2xl"
                                            borderWidth={1}
                                            borderColor="rgba(34,197,94,0.4)"
                                            bg="rgba(34,197,94,0.12)"
                                            alignItems="center"
                                        >
                                            <Icon as={FontAwesome5} name="check-circle" color="#22C55E" size="sm" />
                                            <Text color="white" flex={1} fontSize="xs">
                                                Payment processed. We’ll notify you the moment your subscription activates.
                                            </Text>
                                        </HStack>
                                    )}
                                </GlassSurface>
                            </Box>

                            <Box px={5} mt={4}>
                                <GlassSurface>
                                    <SectionHeader
                                        title="Your access"
                                        subtitle="Tap the subscription that should power this booking"
                                        actionLabel="Refresh"
                                        onActionPress={() => {
                                            refetchSubs();
                                            refetchPlans();
                                        }}
                                    />
                                    {!bookingEligibleSubs.length && !pendingSubsForTrainer.length && !cancelRequestedSubsForTrainer.length ? (
                                        <VStack space={4}>
                                            <Text color="white" fontWeight="bold">
                                                No active subscription yet
                                            </Text>
                                            <Text color={SOFT_TEXT} fontSize="sm">
                                                Choose one of the curated trainer plans below to unlock instant booking.
                                            </Text>
                                            <Divider bg="rgba(255,255,255,0.08)" />
                                            {plansLoading ? (
                                                <Spinner color={ACCENT_PURPLE_LIGHT} />
                                            ) : trainerPlans.length === 0 ? (
                                                <Text color={SOFT_TEXT}>Trainer hasn’t published plans yet.</Text>
                                            ) : (
                                                <ScrollView
                                                    horizontal
                                                    showsHorizontalScrollIndicator={false}
                                                    contentContainerStyle={{ paddingVertical: 4, paddingRight: 16 }}
                                                >
                                                    <HStack space={4}>
                                                        {trainerPlans.map((plan) => (
                                                            <Box
                                                                key={plan._id}
                                                                borderRadius="2xl"
                                                                borderWidth={1}
                                                                borderColor="rgba(255,255,255,0.07)"
                                                                overflow="hidden"
                                                                minW="64"
                                                            >
                                                                <LinearGradient
                                                                    colors={["#1C0F33", "#090312"]}
                                                                    start={{ x: 0, y: 0 }}
                                                                    end={{ x: 1, y: 1 }}
                                                                    style={{ padding: 20 }}
                                                                >
                                                                    <VStack space={2}>
                                                                        <Text color="white" fontWeight="bold" fontSize="md">
                                                                            {plan.name}
                                                                        </Text>
                                                                        <Text color={SOFT_TEXT} fontSize="xs">
                                                                            {plan.period} • every {plan.interval}
                                                                        </Text>
                                                                        {!!plan.description && (
                                                                            <Text color={SOFT_TEXT} fontSize="xs">
                                                                                {plan.description}
                                                                            </Text>
                                                                        )}
                                                                        <Text color={ACCENT_PURPLE_LIGHT} fontWeight="bold" fontSize="xl">
                                                                            ₹{(plan.amount / 100).toFixed(2)}
                                                                        </Text>
                                                                        <Button
                                                                            mt={2}
                                                                            bg={ACCENT_PURPLE}
                                                                            _pressed={{ bg: ACCENT_PURPLE_DARK }}
                                                                            _text={{ fontWeight: "bold" }}
                                                                            onPress={() => subscribeToPlan(plan)}
                                                                            isLoading={creatingSub}
                                                                        >
                                                                            Subscribe
                                                                        </Button>
                                                                    </VStack>
                                                                </LinearGradient>
                                                            </Box>
                                                        ))}
                                                    </HStack>
                                                </ScrollView>
                                            )}
                                        </VStack>
                                    ) : (
                                        <VStack space={5}>
                                            {bookingEligibleSubs.length ? (
                                                <ScrollView
                                                    horizontal
                                                    showsHorizontalScrollIndicator={false}
                                                    contentContainerStyle={{ paddingBottom: 4, paddingRight: 16 }}
                                                >
                                                    <HStack space={4}>
                                                        {bookingEligibleSubs.map((sub) => {
                                                            const meta = STATUS_LABELS[sub.status] ?? STATUS_LABELS.ACTIVE;
                                                            const selected = selectedSubscriptionId === sub._id;
                                                            const active = sub.status === "ACTIVE";
                                                            return (
                                                                <Pressable
                                                                    key={sub._id}
                                                                    onPress={() => setSelectedSubscriptionId(sub._id)}
                                                                    style={{ width: 260 }}
                                                                >
                                                                    <Box
                                                                        borderRadius="2xl"
                                                                        borderWidth={selected ? 2 : 1}
                                                                        borderColor={selected ? ACCENT_PURPLE : BORDER_COLOR}
                                                                        bg="rgba(7,3,18,0.95)"
                                                                        p={4}
                                                                    >
                                                                        <HStack justifyContent="space-between" alignItems="center">
                                                                            <VStack flex={1} space={1}>
                                                                                <Text color="white" fontWeight="bold">
                                                                                    Subscription #{sub._id.slice(0, 6)}
                                                                                </Text>
                                                                                <Text color={SOFT_TEXT} fontSize="xs">
                                                                                    Plan • {sub.planId.slice(0, 6)}
                                                                                </Text>
                                                                            </VStack>
                                                                            <Badge bg={meta.bg} borderRadius="full" px={3} py={1}>
                                                                                <Text color={meta.color} fontSize="xs" fontWeight="bold">
                                                                                    {meta.label}
                                                                                </Text>
                                                                            </Badge>
                                                                        </HStack>
                                                                        <Text color={SOFT_TEXT} fontSize="xs" mt={3}>
                                                                            Tap to route bookings through this plan.
                                                                        </Text>
                                                                        {active && (
                                                                            <Button
                                                                                mt={3}
                                                                                variant="ghost"
                                                                                _text={{ color: "#F87171", fontWeight: "bold" }}
                                                                                onPress={() => handleCancelSubscription(sub._id)}
                                                                                isLoading={cancelling}
                                                                            >
                                                                                Cancel subscription
                                                                            </Button>
                                                                        )}
                                                                    </Box>
                                                                </Pressable>
                                                            );
                                                        })}
                                                    </HStack>
                                                </ScrollView>
                                            ) : (
                                                <Box borderRadius="2xl" borderWidth={1} borderColor="rgba(251,191,36,0.4)" bg="rgba(251,191,36,0.08)" p={4}>
                                                    <Text color="white" fontSize="sm">
                                                        We’re waiting for your subscription to activate. Payments usually settle instantly, but can take a couple of minutes.
                                                    </Text>
                                                </Box>
                                            )}
                                            {cancelRequestedSubsForTrainer.length > 0 && (
                                                <Box borderRadius="2xl" borderWidth={1} borderColor="rgba(96,165,250,0.4)" bg="rgba(96,165,250,0.08)" p={4}>
                                                    <HStack space={3} alignItems="center">
                                                        <Icon as={Feather} name="info" color="#60A5FA" />
                                                        <Text color="white" flex={1} fontSize="xs">
                                                            Cancellation scheduled. You can keep booking until this cycle ends.
                                                        </Text>
                                                    </HStack>
                                                </Box>
                                            )}
                                            {pendingSubsForTrainer.length > 0 && (
                                                <Box borderRadius="2xl" borderWidth={1} borderColor="rgba(251,191,36,0.4)" bg="rgba(251,191,36,0.08)" p={4}>
                                                    <HStack space={3} alignItems="center">
                                                        <Icon as={Feather} name="alert-triangle" color="#FBBF24" />
                                                        <Text color="white" flex={1} fontSize="xs">
                                                            Pending subscriptions detected. Update the payment method in Razorpay to activate.
                                                        </Text>
                                                    </HStack>
                                                </Box>
                                            )}
                                        </VStack>
                                    )}
                                </GlassSurface>
                            </Box>

                            {hasBookingEligibleSubs && (
                                <>
                                    <Box px={5} mt={8}>
                                        <GlassSurface>
                                            <SectionHeader
                                                title="Session format"
                                                subtitle="Switch between online or in-person coaching"
                                            />
                                            <HStack
                                                borderRadius="full"
                                                borderWidth={1}
                                                borderColor="rgba(255,255,255,0.08)"
                                                p={1}
                                                bg="rgba(255,255,255,0.02)"
                                            >
                                                {(["ONLINE", "IN_PERSON"] as SessionType[]).map((type) => {
                                                    const active = sessionType === type;
                                                    return (
                                                        <Pressable key={type} onPress={() => setSessionType(type)} style={{ flex: 1 }}>
                                                            <Box
                                                                borderRadius="full"
                                                                py={3}
                                                                bg={active ? ACCENT_PURPLE : "transparent"}
                                                                alignItems="center"
                                                            >
                                                                <Text
                                                                    color={active ? "white" : SOFT_TEXT}
                                                                    fontWeight="bold"
                                                                >
                                                                    {type === "ONLINE" ? "Online" : "In person"}
                                                                </Text>
                                                            </Box>
                                                        </Pressable>
                                                    );
                                                })}
                                            </HStack>
                                            <Text color={SOFT_TEXT} fontSize="xs" mt={3}>
                                                We’ll send confirmations and reminders the moment you confirm a slot.
                                            </Text>
                                            {sessionType === "IN_PERSON" && (
                                                <VStack space={3} mt={5}>
                                                    <Text color="white" fontWeight="bold">
                                                        Share the session address
                                                    </Text>
                                                    {[
                                                        { value: street, onChangeText: setStreet, placeholder: "Street address" },
                                                        { value: aptSuite, onChangeText: setAptSuite, placeholder: "Apartment / Suite" },
                                                        { value: city, onChangeText: setCity, placeholder: "City" },
                                                        { value: stateRegion, onChangeText: setStateRegion, placeholder: "State / Region" },
                                                        { value: postalCode, onChangeText: setPostalCode, placeholder: "Postal code" },
                                                        { value: country, onChangeText: setCountry, placeholder: "Country" },
                                                    ].map((field) => (
                                                        <Box
                                                            key={field.placeholder}
                                                            borderRadius="xl"
                                                            borderWidth={1}
                                                            borderColor="rgba(255,255,255,0.08)"
                                                            bg="rgba(3,2,8,0.8)"
                                                            px={4}
                                                            py={2}
                                                        >
                                                            <TextInput
                                                                value={field.value}
                                                                onChangeText={field.onChangeText}
                                                                placeholder={field.placeholder}
                                                                placeholderTextColor={SOFT_TEXT}
                                                                style={{ color: "white", fontSize: 14 }}
                                                            />
                                                        </Box>
                                                    ))}
                                                </VStack>
                                            )}
                                        </GlassSurface>
                                    </Box>

                                    <Box px={5} mt={8}>
                                        <GlassSurface>
                                            <SectionHeader
                                                title="Choose the day"
                                                subtitle={`Live availability · ${LOOKAHEAD_DAYS}-day lookahead`}
                                                actionLabel="Today"
                                                onActionPress={() => setSelectedDay(startOfDayLocal(new Date()))}
                                            />
                                            <ScrollView
                                                horizontal
                                                showsHorizontalScrollIndicator={false}
                                                contentContainerStyle={{ paddingVertical: 6, paddingRight: 12 }}
                                            >
                                                <HStack space={3}>
                                                    {next7Days.map((day) => {
                                                        const selected = sameDay(day, selectedDay);
                                                        const count = availableCounts[formatYMD(day)] ?? 0;
                                                        const label = day.toLocaleDateString(undefined, { weekday: "short" });
                                                        const date = day.getDate();
                                                        return (
                                                            <Pressable
                                                                key={day.toISOString()}
                                                                onPress={() => setSelectedDay(startOfDayLocal(day))}
                                                            >
                                                                <Box
                                                                    borderRadius="2xl"
                                                                    borderWidth={1}
                                                                    borderColor={selected ? ACCENT_PURPLE : "rgba(255,255,255,0.08)"}
                                                                    bg={selected ? "rgba(124,58,237,0.25)" : "rgba(255,255,255,0.02)"}
                                                                    px={4}
                                                                    py={3}
                                                                    alignItems="center"
                                                                    minW={20}
                                                                >
                                                                    <Text color="white" fontWeight="bold">
                                                                        {label}
                                                                    </Text>
                                                                    <Text color={SOFT_TEXT} fontSize="xs">
                                                                        {date}
                                                                    </Text>
                                                                    <Text color={SOFT_TEXT} fontSize="xs" mt={2}>
                                                                        {count ? `${count} slots` : "Full"}
                                                                    </Text>
                                                                </Box>
                                                            </Pressable>
                                                        );
                                                    })}
                                                </HStack>
                                            </ScrollView>
                                        </GlassSurface>
                                    </Box>

                                    <Box px={5} mt={8}>
                                        <GlassSurface>
                                            <SectionHeader
                                                title="Live slots"
                                                subtitle="Times are held for a minute while you confirm"
                                                actionLabel="Refresh"
                                                onActionPress={() => refetchSlots()}
                                            />
                                            {slotsLoading ? (
                                                <Spinner color={ACCENT_PURPLE_LIGHT} />
                                            ) : slotsForSelected.length === 0 ? (
                                                <VStack space={4} alignItems="center">
                                                    <Text color={SOFT_TEXT} textAlign="center">
                                                        No slots found for this day. Pick another date or refresh availability.
                                                    </Text>
                                                    <Button
                                                        variant="outline"
                                                        borderColor={ACCENT_PURPLE_LIGHT}
                                                        _text={{ color: ACCENT_PURPLE_LIGHT, fontWeight: "bold" }}
                                                        onPress={() => refetchSlots()}
                                                    >
                                                        Refresh slots
                                                    </Button>
                                                </VStack>
                                            ) : (
                                                <VStack space={1}>
                                                    {slotsForSelected.map((slot, index) => {
                                                        const iso = slot.start.toISOString();
                                                        const disabled = slot.disabled;
                                                        const isLast = index === slotsForSelected.length - 1;
                                                        return (
                                                            <Pressable
                                                                key={iso}
                                                                onPress={() => handleSlotSelect(iso)}
                                                                disabled={disabled}
                                                            >
                                                                <HStack space={4} alignItems="center" opacity={disabled ? 0.35 : 1} py={3}>
                                                                    <VStack alignItems="center" space={1}>
                                                                        <Box
                                                                            w={2}
                                                                            h={2}
                                                                            borderRadius="full"
                                                                            bg={disabled ? "rgba(255,255,255,0.2)" : ACCENT_PURPLE_LIGHT}
                                                                        />
                                                                        {!isLast && (
                                                                            <Box w="1px" flex={1} bg="rgba(255,255,255,0.08)" />
                                                                        )}
                                                                    </VStack>
                                                                    <Box flex={1} borderRadius="xl" borderWidth={1} borderColor="rgba(255,255,255,0.08)" bg="rgba(255,255,255,0.02)" p={3}>
                                                                        <Text color="white" fontWeight="bold">
                                                                            {slot.start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                                        </Text>
                                                                        <Text color={SOFT_TEXT} fontSize="xs">
                                                                            Ends {slot.end.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                                                        </Text>
                                                                    </Box>
                                                                    <Icon as={Feather} name="arrow-right-circle" color={ACCENT_PURPLE_LIGHT} size="md" />
                                                                </HStack>
                                                            </Pressable>
                                                        );
                                                    })}
                                                </VStack>
                                            )}
                                        </GlassSurface>
                                    </Box>

                                    <Box px={5} mt={8}>
                                        <GlassSurface>
                                            <SectionHeader
                                                title="Notes & context"
                                                subtitle="Share injuries, preferences or reminders"
                                            />
                                            <Box
                                                borderRadius="xl"
                                                borderWidth={1}
                                                borderColor="rgba(255,255,255,0.08)"
                                                bg="rgba(3,2,8,0.85)"
                                                px={4}
                                                py={3}
                                            >
                                                <TextInput
                                                    value={notesClient}
                                                    onChangeText={setNotesClient}
                                                    placeholder="Example: focus on mobility, recovering from knee surgery, love kettlebells"
                                                    placeholderTextColor={SOFT_TEXT}
                                                    multiline
                                                    style={{
                                                        minHeight: 120,
                                                        color: "white",
                                                        fontSize: 14,
                                                        textAlignVertical: "top",
                                                    }}
                                                />
                                            </Box>
                                            <Text color={SOFT_TEXT} fontSize="xs" mt={2}>
                                                Notes go straight to your trainer and help them personalize the session.
                                            </Text>
                                        </GlassSurface>
                                    </Box>
                                </>
                            )}
                        </ScrollView>

                        <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} size="lg">
                            <Modal.Content bg={CARD_BG} borderColor={BORDER_COLOR}>
                                <Modal.CloseButton />
                                <Modal.Header bg="transparent" borderBottomWidth={0}>
                                    <Text color="white" fontWeight="bold">
                                        Confirm booking
                                    </Text>
                                </Modal.Header>
                                <Modal.Body>
                                    {selectedStart ? (
                                        <VStack space={3}>
                                            <HStack justifyContent="space-between">
                                                <Text color={SOFT_TEXT}>Trainer</Text>
                                                <Text color="white" fontWeight="bold">
                                                    {displayName}
                                                </Text>
                                            </HStack>
                                            <HStack justifyContent="space-between">
                                                <Text color={SOFT_TEXT}>Date</Text>
                                                <Text color="white" fontWeight="bold">
                                                    {selectedStart.toLocaleDateString(undefined, {
                                                        weekday: "long",
                                                        day: "numeric",
                                                        month: "long",
                                                    })}
                                                </Text>
                                            </HStack>
                                            <HStack justifyContent="space-between">
                                                <Text color={SOFT_TEXT}>Time</Text>
                                                <Text color="white" fontWeight="bold">
                                                    {selectedStart.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {SLOT_DURATION_MIN} min
                                                </Text>
                                            </HStack>
                                            {sessionType === "IN_PERSON" && (
                                                <Box mt={2}>
                                                    <Text color={SOFT_TEXT} fontSize="xs">
                                                        Location
                                                    </Text>
                                                    <Text color="white">
                                                        {street}
                                                        {aptSuite ? `, ${aptSuite}` : ""}
                                                        {`\n${city}${stateRegion ? `, ${stateRegion}` : ""}`}
                                                        {postalCode ? ` ${postalCode}` : ""}
                                                        {`\n${country}`}
                                                    </Text>
                                                </Box>
                                            )}
                                        </VStack>
                                    ) : null}
                                </Modal.Body>
                                <Modal.Footer borderTopWidth={0}>
                                    <Button
                                        flex={1}
                                        bg={ACCENT_PURPLE}
                                        _pressed={{ bg: ACCENT_PURPLE_DARK }}
                                        _text={{ fontWeight: "bold" }}
                                        onPress={onConfirmBooking}
                                        isLoading={booking}
                                    >
                                        Confirm booking
                                    </Button>
                                </Modal.Footer>
                            </Modal.Content>
                        </Modal>
                    </>
                )}
            </Box>
        </Screen>
    );
}
