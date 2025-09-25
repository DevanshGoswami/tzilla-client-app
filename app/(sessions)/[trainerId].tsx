// app/sessions/[trainerId].tsx
import React, { useEffect, useMemo, useState } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    Alert,
    SafeAreaView,
    Image,
    TextInput,
    Modal,
} from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { useLocalSearchParams, router } from "expo-router";
import { useMutation, useQuery } from "@apollo/client/react";
import {
    Session,
    SessionType,
    Subscription,
    SubscriptionPlan,
} from "@/graphql/types";
import {
    GET_ACTIVE_CLIENT_SUBSCRIPTIONS,
    GET_ME,
    GET_SESSIONS_FOR_TRAINER,
    GET_TRAINER_PLANS,
} from "@/graphql/queries";
import {
    BOOK_TRAINING_SESSION,
    CREATE_SUBSCRIPTION,
    CANCEL_SUBSCRIPTION,
} from "@/graphql/mutations";

// Razorpay (native module)
import RazorpayCheckout from "react-native-razorpay";
import { ENV } from "@/lib/env";
import Screen from "@/components/ui/Screen";

/* ===================== Utils ===================== */

const SLOT_DURATION_MIN = 60; // 60-minute sessions
const GRID_STEP_MIN = 30; // slots start every 30 minutes
const START_HOUR = 5; // 05:00 local
const END_HOUR = 22; // 22:00 local
const LOOKAHEAD_DAYS = 7;

const addMinutes = (d: Date, m: number) => new Date(d.getTime() + m * 60000);
const toISO = (d: Date) => new Date(d).toISOString();
const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

function startOfDayLocal(d: Date) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function daysArray(): Date[] {
    const now = new Date();
    const arr: Date[] = [];
    for (let i = 0; i < LOOKAHEAD_DAYS; i++) {
        const d = new Date(now);
        d.setDate(now.getDate() + i);
        arr.push(startOfDayLocal(d));
    }
    return arr;
}
function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return aStart < bEnd && bStart < aEnd;
}
function isFutureWithin7Days(d: Date) {
    const now = new Date();
    const max = addMinutes(now, LOOKAHEAD_DAYS * 24 * 60);
    return d >= now && d <= max;
}

/* ===================== Component ===================== */

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

    // UI state
    const [selectedDay, setSelectedDay] = useState<Date>(
        startOfDayLocal(new Date())
    );
    const [sessionType, setSessionType] = useState<SessionType>("ONLINE");

    // Address (IN_PERSON)
    const [street, setStreet] = useState("");
    const [aptSuite, setAptSuite] = useState("");
    const [city, setCity] = useState("");
    const [stateRegion, setStateRegion] = useState("");
    const [postalCode, setPostalCode] = useState("");
    const [country, setCountry] = useState("");

    // Notes
    const [notesClient, setNotesClient] = useState("");

    // Subscription selection
    const [selectedSubscriptionId, setSelectedSubscriptionId] = useState<string>(
        ""
    );

    // Confirm modal
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [pendingStartISO, setPendingStartISO] = useState<string>("");

    // Payment success flag
    const [paymentSuccess, setPaymentSuccess] = useState(false);

    // Me
    const { data: meData, loading: meLoading } = useQuery(GET_ME);

    // Sessions for trainer (we still fetch to mark booked slots if user has sub)
    const {
        data: sessData,
        loading: sessLoading,
        refetch: refetchSessions,
    } = useQuery<{ sessionsForTrainer: Session[] }>(GET_SESSIONS_FOR_TRAINER, {
        variables: { trainerId, pagination: { pageNumber: 1, pageSize: 300 } },
        skip: !trainerId,
        notifyOnNetworkStatusChange: true,
    });

    // Active client subscriptions (ACTIVE, PENDING, REQUESTED_CANCELLATION)
    const {
        data: subData,
        loading: subLoading,
        refetch: refetchSubs,
    } = useQuery<{ activeClientSubscriptions: Subscription[] }>(
        GET_ACTIVE_CLIENT_SUBSCRIPTIONS,
        {
            variables: { trainerId },
            skip: !trainerId,
            notifyOnNetworkStatusChange: true,
        }
    );

    // Trainer plans (for subscribe flow)
    const {
        data: plansData,
        loading: plansLoading,
        refetch: refetchPlans,
    } = useQuery<{ subscriptionPlansForTrainer: SubscriptionPlan[] }>(
        GET_TRAINER_PLANS,
        {
            variables: { trainerId, pagination: { pageNumber: 1, pageSize: 50 } },
            skip: !trainerId,
            notifyOnNetworkStatusChange: true,
        }
    );

    const [bookSession, { loading: booking }] =
        useMutation(BOOK_TRAINING_SESSION);
    const [createSubscription, { loading: creatingSub }] =
        useMutation(CREATE_SUBSCRIPTION);
    const [cancelSubscription, { loading: cancelling }] =
        useMutation(CANCEL_SUBSCRIPTION);

    const next7Days = useMemo(() => daysArray(), []);

    const sessionsNext7Days = useMemo(() => {
        const all = sessData?.sessionsForTrainer ?? [];
        const start = startOfDayLocal(new Date());
        const end = addMinutes(start, LOOKAHEAD_DAYS * 24 * 60);
        return all.filter((s) => {
            if (s.status === "CANCELLED") return false;
            const st = new Date(s.scheduledStart);
            return st >= start && st <= end;
        });
    }, [sessData]);

    // Build a slot grid for a date and compute availability
    function buildDaySlots(day: Date): {
        start: Date;
        end: Date;
        disabled: boolean;
        reason?: string;
    }[] {
        const slots: {
            start: Date;
            end: Date;
            disabled: boolean;
            reason?: string;
        }[] = [];
        const dayStart = new Date(day);
        dayStart.setHours(START_HOUR, 0, 0, 0);
        const dayEnd = new Date(day);
        dayEnd.setHours(END_HOUR, 0, 0, 0);

        const now = new Date();

        for (let t = new Date(dayStart); t < dayEnd; t = addMinutes(t, GRID_STEP_MIN)) {
            const start = new Date(t);
            const end = addMinutes(start, SLOT_DURATION_MIN);

            if (!isFutureWithin7Days(start)) {
                slots.push({
                    start,
                    end,
                    disabled: true,
                    reason: "Outside 7-day window",
                });
                continue;
            }
            if (start < now) {
                slots.push({ start, end, disabled: true, reason: "Past time" });
                continue;
            }

            const conflict = sessionsNext7Days.some((s) => {
                const sStart = new Date(s.scheduledStart);
                const sEnd = new Date(s.scheduledEnd);
                return overlaps(start, end, sStart, sEnd);
            });

            if (conflict) {
                slots.push({ start, end, disabled: true, reason: "Booked" });
            } else {
                slots.push({ start, end, disabled: false });
            }
        }
        return slots;
    }

    // Available count per day badge
    const availableCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        next7Days.forEach((d) => {
            const daySlots = buildDaySlots(d);
            counts[d.toDateString()] = daySlots.filter((s) => !s.disabled).length;
        });
        return counts;
    }, [next7Days, sessionsNext7Days]);

    const slotsForSelected = useMemo(
        () => buildDaySlots(selectedDay),
        [selectedDay, sessionsNext7Days]
    );

    // Subscriptions filtered for this trainer (ACTIVE, PENDING, REQUESTED_CANCELLATION)
    const subsForTrainer = useMemo(() => {
        return subData?.activeClientSubscriptions ?? [];
    }, [subData]);

    const activeSubsForTrainer = useMemo(() => {
        return subsForTrainer.filter((s) => s.status === "ACTIVE");
    }, [subsForTrainer]);

    const pendingSubsForTrainer = useMemo(() => {
        return subsForTrainer.filter((s) => s.status === "PENDING");
    }, [subsForTrainer]);

    const cancelRequestedSubsForTrainer = useMemo(() => {
        return subsForTrainer.filter((s) => s.status === "REQUESTED_CANCELLATION");
    }, [subsForTrainer]);

    const hasActive = activeSubsForTrainer.length > 0;
    const hasPending = pendingSubsForTrainer.length > 0;
    const hasCancelRequested = cancelRequestedSubsForTrainer.length > 0;

    // ✅ Eligible to book if ACTIVE or REQUESTED_CANCELLATION
    const bookingEligibleSubs = useMemo(() => {
        return subsForTrainer.filter(
            (s) => s.status === "ACTIVE" || s.status === "REQUESTED_CANCELLATION"
        );
    }, [subsForTrainer]);

    const hasBookingEligibleSubs = bookingEligibleSubs.length > 0;

    // Auto-select first eligible subscription
    useEffect(() => {
        if (hasBookingEligibleSubs && !selectedSubscriptionId) {
            const preferredSub =
                bookingEligibleSubs.find((s) => s.status === "ACTIVE") ||
                bookingEligibleSubs[0];
            setSelectedSubscriptionId(preferredSub._id);
        }
    }, [hasBookingEligibleSubs, bookingEligibleSubs, selectedSubscriptionId]);

    // Plans for trainer (only active ones shown)
    const trainerPlans = useMemo(() => {
        const all = plansData?.subscriptionPlansForTrainer ?? [];
        return all.filter((p) => p.isActive);
    }, [plansData]);

    // UX helpers
    const dayLabel = (d: Date) =>
        d.toLocaleDateString(undefined, {
            weekday: "short",
            month: "short",
            day: "numeric",
        });
    const timeLabel = (d: Date) =>
        d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const onPickSlot = (iso: string) => {
        setPendingStartISO(iso);
        setConfirmOpen(true);
    };

    const onConfirmBooking = async () => {
        if (!pendingStartISO) return;
        // @ts-ignore
        if (!meData?.user?._id) return;

        if (!hasBookingEligibleSubs) {
            Alert.alert(
                "No active subscription",
                "Please subscribe first or wait for your pending subscription to be activated."
            );
            return;
        }
        if (!selectedSubscriptionId) {
            Alert.alert("Choose subscription", "Please select a subscription.");
            return;
        }

        const start = new Date(pendingStartISO);
        const end = addMinutes(start, SLOT_DURATION_MIN);

        const input: any = {
            trainerId,
            // @ts-ignore
            clientId: meData.user._id,
            type: sessionType, // "IN_PERSON" | "ONLINE"
            subscriptionId: selectedSubscriptionId,
            scheduledStart: toISO(start),
            scheduledEnd: toISO(end),
        };

        if (sessionType === "IN_PERSON") {
            if (!street.trim() || !city.trim() || !country.trim()) {
                Alert.alert(
                    "Address required",
                    "Please fill Street address, City and Country."
                );
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
        } catch (e) {
            console.error("Booking error", e);
            Alert.alert("Error", "Couldn't book this slot. Please try another.");
        }
    };

    // Subscribe flow (Razorpay)
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
                Alert.alert(
                    "Missing Key",
                    "EXPO_PUBLIC_RAZORPAY_KEY_ID is not set in your env."
                );
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
            Alert.alert(
                "Payment Failed",
                "The payment could not be completed. Please try again."
            );
        }
    };

    // Cancel subscription flow
    const handleCancelSubscription = async (subscriptionId: string) => {
        Alert.alert(
            "Cancel Subscription",
            "Are you sure you want to cancel this subscription? You can still use it until your current period ends.",
            [
                { text: "No", style: "cancel" },
                {
                    text: "Yes, Cancel",
                    style: "destructive",
                    onPress: async () => {
                        try {
                            await cancelSubscription({
                                variables: { subscriptionId },
                            });
                            Alert.alert(
                                "Success",
                                "Your cancellation request has been processed."
                            );
                            refetchSubs();
                        } catch (e) {
                            console.error("Cancel error", e);
                            Alert.alert(
                                "Error",
                                "Unable to process cancellation request. Please try again."
                            );
                        }
                    },
                },
            ]
        );
    };

    const loadingAny = meLoading || sessLoading || subLoading;

    return (
        <Screen withHeader>
            <SafeAreaView style={styles.container}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 28 }}
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()}>
                            <FontAwesome5 name="arrow-left" size={18} color="#111" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Book with {displayName}</Text>
                        <View style={{ width: 18 }} />
                    </View>

                    {/* Trainer card */}
                    <View style={[styles.section, { paddingBottom: 0 }]}>
                        <View style={styles.trainerCard}>
                            {avatarUrl ? (
                                <Image source={{ uri: avatarUrl }} style={styles.avatarImg} />
                            ) : (
                                <View style={styles.avatar}>
                                    <FontAwesome5 name="user-tie" size={18} color="#111" />
                                </View>
                            )}
                            <View style={{ flex: 1 }}>
                                <Text style={styles.trainerName}>{displayName}</Text>
                                <Text style={styles.trainerMeta}>
                                    Next 7 days • {SLOT_DURATION_MIN} min
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Payment Success Message */}
                    {paymentSuccess && (
                        <View style={styles.section}>
                            <View style={styles.successCard}>
                                <FontAwesome5 name="check-circle" size={16} color="#2E7D32" />
                                <Text style={styles.successText}>
                                    Payment has been processed successfully. You will be notified
                                    once we have completed processing your subscription.
                                </Text>
                            </View>
                        </View>
                    )}

                    {/* Subscriptions / Plans */}
                    {/* Subscriptions / Plans (refined UI) */}
                    <View style={styles.section}>
                        <View style={styles.subCard}>
                            <View style={styles.subCardHeader}>
                                <Text style={styles.subCardTitle}>Your Subscriptions</Text>
                                {loadingAny && <ActivityIndicator color="#111" />}
                            </View>

                            {!loadingAny && !hasActive && !hasPending && !hasCancelRequested ? (
                                <>
                                    <View style={styles.subEmpty}>
                                        <Text style={styles.subEmptyTitle}>No active subscription</Text>
                                        <Text style={styles.subEmptyText}>
                                            Subscribe to a plan to unlock booking.
                                        </Text>
                                    </View>

                                    {/* Plans */}
                                    <View style={styles.subDivider} />
                                    <Text style={styles.subSectionLabel}>Trainer Plans</Text>
                                    {plansLoading ? (
                                        <ActivityIndicator color="#111" />
                                    ) : trainerPlans.length === 0 ? (
                                        <View style={styles.subEmpty}>
                                            <Text style={styles.subEmptyTitle}>No active plans</Text>
                                            <Text style={styles.subEmptyText}>
                                                Check back later or contact your trainer.
                                            </Text>
                                        </View>
                                    ) : (
                                        <View style={{ gap: 10 }}>
                                            {trainerPlans.map((p) => (
                                                <View key={p._id} style={styles.planRow}>
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.planName}>{p.name}</Text>
                                                        <Text style={styles.planMeta}>
                                                            {p.period} • every {p.interval}{" "}
                                                            {p.period === "MONTHLY" ? "month(s)" : "year(s)"}
                                                        </Text>
                                                        {!!p.description && (
                                                            <Text style={styles.planDesc}>{p.description}</Text>
                                                        )}
                                                    </View>
                                                    <View style={{ alignItems: "flex-end" }}>
                                                        <Text style={styles.planPrice}>₹{(p.amount / 100).toFixed(2)}</Text>
                                                        <TouchableOpacity
                                                            style={[styles.button, styles.primaryButton, { marginTop: 6 }]}
                                                            onPress={() => subscribeToPlan(p)}
                                                            disabled={creatingSub}
                                                        >
                                                            {creatingSub ? (
                                                                <ActivityIndicator color="#fff" />
                                                            ) : (
                                                                <>
                                                                    <FontAwesome5 name="credit-card" size={14} color="#fff" />
                                                                    <Text style={styles.primaryButtonText}>Subscribe</Text>
                                                                </>
                                                            )}
                                                        </TouchableOpacity>
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </>
                            ) : (
                                <>
                                    {/* Hints */}
                                    {hasPending && (
                                        <View style={styles.bannerWarn}>
                                            <FontAwesome5 name="exclamation-triangle" size={12} color="#B26A00" />
                                            <Text style={styles.bannerWarnText}>
                                                You have pending subscriptions. Please ensure sufficient balance to activate.
                                            </Text>
                                        </View>
                                    )}

                                    {hasCancelRequested && (
                                        <View style={styles.bannerInfo}>
                                            <FontAwesome5 name="info-circle" size={12} color="#0D47A1" />
                                            <Text style={styles.bannerInfoText}>
                                                You’ve requested cancellation. You can keep booking until your current billing period ends.
                                            </Text>
                                        </View>
                                    )}

                                    {/* Subscription list */}
                                    <View style={{ gap: 10 }}>
                                        {bookingEligibleSubs.map((s) => {
                                            const isActive = s.status === "ACTIVE";
                                            const isEnding = s.status === "REQUESTED_CANCELLATION";
                                            return (
                                                <TouchableOpacity
                                                    key={s._id}
                                                    onPress={() => setSelectedSubscriptionId(s._id)}
                                                    style={[
                                                        styles.subItem,
                                                        isActive && styles.subItemAccentGreen,
                                                        isEnding && styles.subItemAccentBlue,
                                                        selectedSubscriptionId === s._id && styles.subItemSelected,
                                                    ]}
                                                    activeOpacity={0.85}
                                                >
                                                    <View style={styles.subItemMain}>
                                                        <FontAwesome5
                                                            name={selectedSubscriptionId === s._id ? "dot-circle" : "circle"}
                                                            size={14}
                                                            color={selectedSubscriptionId === s._id ? "#111" : "#777"}
                                                            style={{ marginRight: 10 }}
                                                        />
                                                        <View style={{ flex: 1 }}>
                                                            <Text style={styles.subItemTitle}>
                                                                Subscription #{s._id.slice(0, 6)}…
                                                            </Text>
                                                            <Text style={styles.subItemSub}>Plan: {s.planId.slice(0, 6)}…</Text>
                                                            {isEnding && (
                                                                <View style={styles.subInlineInfo}>
                                                                    <FontAwesome5 name="calendar-check" size={11} color="#1565C0" />
                                                                    <Text style={styles.subInlineInfoText}>
                                                                        Booking allowed until end of current cycle
                                                                    </Text>
                                                                </View>
                                                            )}
                                                        </View>
                                                    </View>

                                                    <View style={styles.subItemRight}>
                                                        <Text
                                                            style={[
                                                                styles.badge,
                                                                isActive ? styles.badgeGreen : styles.badgeBlue,
                                                            ]}
                                                        >
                                                            {isActive ? "ACTIVE" : "ENDING AFTER PERIOD"}
                                                        </Text>
                                                        {isActive && (
                                                            <TouchableOpacity
                                                                style={styles.linkButton}
                                                                onPress={() => handleCancelSubscription(s._id)}
                                                                disabled={cancelling}
                                                            >
                                                                <Text style={styles.linkButtonText}>
                                                                    {cancelling ? "Cancelling…" : "Cancel"}
                                                                </Text>
                                                            </TouchableOpacity>
                                                        )}
                                                    </View>
                                                </TouchableOpacity>
                                            );
                                        })}

                                        {/* Pending (read-only) */}
                                        {pendingSubsForTrainer.map((s) => (
                                            <View key={s._id} style={[styles.subItem, styles.subItemAccentAmber]}>
                                                <View style={styles.subItemMain}>
                                                    <FontAwesome5 name="clock" size={14} color="#B26A00" style={{ marginRight: 10 }} />
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={styles.subItemTitle}>
                                                            Subscription #{s._id.slice(0, 6)}…
                                                        </Text>
                                                        <Text style={styles.subItemSub}>Plan: {s.planId.slice(0, 6)}…</Text>
                                                        <View style={styles.subInlineWarn}>
                                                            <FontAwesome5 name="exclamation-circle" size={11} color="#B26A00" />
                                                            <Text style={styles.subInlineWarnText}>
                                                                Payment is failing. Update your payment method to activate.
                                                            </Text>
                                                        </View>
                                                    </View>
                                                </View>
                                                <Text style={[styles.badge, styles.badgeAmber]}>PENDING</Text>
                                            </View>
                                        ))}
                                    </View>
                                </>
                            )}
                        </View>
                    </View>


                    {/* ---- Booking UI (✅ visible for ACTIVE and REQUESTED_CANCELLATION) ---- */}
                    {hasBookingEligibleSubs && (
                        <>
                            {/* Session type + (optional location) */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Session Type</Text>
                                <View style={styles.segment}>
                                    {(["ONLINE", "IN_PERSON"] as SessionType[]).map((t) => (
                                        <TouchableOpacity
                                            key={t}
                                            onPress={() => setSessionType(t)}
                                            style={[
                                                styles.segmentBtn,
                                                sessionType === t && styles.segmentBtnActive,
                                            ]}
                                        >
                                            <Text
                                                style={[
                                                    styles.segmentText,
                                                    sessionType === t && styles.segmentTextActive,
                                                ]}
                                            >
                                                {t === "ONLINE" ? "Online" : "In-person"}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {sessionType === "IN_PERSON" && (
                                    <View style={{ marginTop: 12 }}>
                                        <Text style={styles.label}>Street address *</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="House no. / Street / Road"
                                            value={street}
                                            onChangeText={setStreet}
                                        />
                                        <Text style={styles.label}>Apt, suite, unit (optional)</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Apartment, suite, etc."
                                            value={aptSuite}
                                            onChangeText={setAptSuite}
                                        />
                                        <Text style={styles.label}>City *</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="City"
                                            value={city}
                                            onChangeText={setCity}
                                        />
                                        <Text style={styles.label}>State / Province / Region</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="State / Province / Region"
                                            value={stateRegion}
                                            onChangeText={setStateRegion}
                                        />
                                        <Text style={styles.label}>Postal code</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Postal / ZIP"
                                            value={postalCode}
                                            onChangeText={setPostalCode}
                                        />
                                        <Text style={styles.label}>Country *</Text>
                                        <TextInput
                                            style={styles.input}
                                            placeholder="Country"
                                            value={country}
                                            onChangeText={setCountry}
                                        />
                                    </View>
                                )}
                            </View>

                            {/* Calendar strip (next 7 days) */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Pick a date (next 7 days)</Text>
                                <ScrollView
                                    horizontal
                                    showsHorizontalScrollIndicator={false}
                                    contentContainerStyle={{ gap: 8 }}
                                >
                                    {next7Days.map((d) => {
                                        const selected = sameDay(d, selectedDay);
                                        const count = availableCounts[d.toDateString()] ?? 0;
                                        return (
                                            <TouchableOpacity
                                                key={d.toDateString()}
                                                style={[styles.dayChip, selected && styles.dayChipActive]}
                                                onPress={() => setSelectedDay(startOfDayLocal(d))}
                                            >
                                                <Text
                                                    style={[
                                                        styles.dayChipText,
                                                        selected && styles.dayChipTextActive,
                                                    ]}
                                                >
                                                    {dayLabel(d)}
                                                </Text>
                                                <Text
                                                    style={[
                                                        styles.dayChipBadge,
                                                        count === 0 && styles.dayChipBadgeFull,
                                                        selected && styles.dayChipBadgeActive,
                                                    ]}
                                                >
                                                    {count > 0 ? `${count} slots` : "Full"}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </View>

                            {/* Slots for selected day */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Available slots</Text>

                                {loadingAny ? (
                                    <ActivityIndicator color="#111" />
                                ) : slotsForSelected.filter((s) => !s.disabled).length === 0 ? (
                                    <View style={styles.emptyCard}>
                                        <Text style={styles.emptyTitle}>No available slots</Text>
                                        <Text style={styles.emptyText}>
                                            This day is fully booked or outside the allowed window.
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={styles.slotGrid}>
                                        {slotsForSelected.map((slot) => {
                                            const disabled = slot.disabled;
                                            const label = `${timeLabel(slot.start)} – ${timeLabel(
                                                slot.end
                                            )}`;
                                            return (
                                                <TouchableOpacity
                                                    key={slot.start.toISOString()}
                                                    disabled={disabled}
                                                    onPress={() => onPickSlot(slot.start.toISOString())}
                                                    style={[
                                                        styles.slotBtn,
                                                        disabled
                                                            ? styles.slotBtnDisabled
                                                            : styles.slotBtnEnabled,
                                                    ]}
                                                >
                                                    <Text
                                                        style={
                                                            disabled
                                                                ? styles.slotTextDisabled
                                                                : styles.slotTextEnabled
                                                        }
                                                    >
                                                        {label}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}
                            </View>

                            {/* Notes */}
                            <View style={styles.section}>
                                <Text style={styles.sectionTitle}>Notes (optional)</Text>
                                <TextInput
                                    style={[styles.input, { height: 90 }]}
                                    placeholder="Anything you'd like your trainer to know?"
                                    value={notesClient}
                                    onChangeText={setNotesClient}
                                    multiline
                                />
                            </View>
                        </>
                    )}
                </ScrollView>

                {/* Confirm modal (eligible subs only) */}
                {hasBookingEligibleSubs && (
                    <Modal
                        visible={confirmOpen}
                        transparent
                        animationType="fade"
                        onRequestClose={() => setConfirmOpen(false)}
                    >
                        <View style={styles.modalBackdrop}>
                            <View style={styles.modalCard}>
                                <Text style={styles.modalTitle}>Confirm booking</Text>
                                <Text style={styles.modalSubtitle}>
                                    {pendingStartISO
                                        ? new Date(pendingStartISO).toLocaleString([], {
                                            dateStyle: "medium",
                                            timeStyle: "short",
                                        })
                                        : ""}
                                    {"  •  "}
                                    {SLOT_DURATION_MIN} min •{" "}
                                    {sessionType === "ONLINE" ? "Online" : "In-person"}
                                </Text>

                                {/* Subscription picker (required) */}
                                <Text style={[styles.label, { marginTop: 10 }]}>
                                    Select subscription
                                </Text>
                                <View style={{ gap: 8 }}>
                                    {bookingEligibleSubs.map((s) => (
                                        <TouchableOpacity
                                            key={s._id}
                                            onPress={() => setSelectedSubscriptionId(s._id)}
                                            style={[
                                                styles.subscriptionRow,
                                                selectedSubscriptionId === s._id &&
                                                styles.subscriptionRowActive,
                                                s.status === "REQUESTED_CANCELLATION" &&
                                                styles.subscriptionRowInfo,
                                            ]}
                                        >
                                            <FontAwesome5
                                                name={
                                                    selectedSubscriptionId === s._id
                                                        ? "dot-circle"
                                                        : "circle"
                                                }
                                                size={14}
                                                color={
                                                    selectedSubscriptionId === s._id ? "#111" : "#666"
                                                }
                                                style={{ marginRight: 8 }}
                                            />
                                            <View style={{ flex: 1 }}>
                                                <Text style={styles.subscriptionText}>
                                                    Subscription #{s._id.slice(0, 6)}… • plan{" "}
                                                    {s.planId.slice(0, 6)}…
                                                </Text>
                                            </View>
                                            <Text
                                                style={
                                                    s.status === "ACTIVE"
                                                        ? styles.subscriptionStatus
                                                        : styles.subscriptionStatusInfo
                                                }
                                            >
                                                {s.status === "ACTIVE"
                                                    ? "ACTIVE"
                                                    : "ENDING AFTER PERIOD"}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <View style={{ flexDirection: "row", gap: 8, marginTop: 16 }}>
                                    <TouchableOpacity
                                        style={[styles.button, styles.secondaryButton, { flex: 1 }]}
                                        onPress={() => setConfirmOpen(false)}
                                        disabled={booking}
                                    >
                                        <Text style={styles.secondaryButtonText}>Cancel</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={[styles.button, styles.primaryButton, { flex: 1 }]}
                                        onPress={onConfirmBooking}
                                        disabled={booking || !selectedSubscriptionId}
                                    >
                                        {booking ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <>
                                                <FontAwesome5 name="check" size={14} color="#fff" />
                                                <Text style={styles.primaryButtonText}>Book</Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>
                )}
            </SafeAreaView>
        </Screen>
    );
}

/* ===================== Styles ===================== */

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f5f5f5" },

    header: {
        paddingHorizontal: 16,
        paddingTop: 12,
        paddingBottom: 8,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#eee",
    },
    headerTitle: { fontSize: 18, fontWeight: "700", color: "#111" },

    section: { padding: 16 },
    sectionTitle: {
        fontSize: 13,
        fontWeight: "700",
        color: "#999",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        marginBottom: 10,
    },

    trainerCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderWidth: 1,
        borderColor: "#eee",
    },
    avatar: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "#EAEAEA",
        alignItems: "center",
        justifyContent: "center",
    },
    avatarImg: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "#EAEAEA",
    },
    trainerName: { fontSize: 16, fontWeight: "700", color: "#111" },
    trainerMeta: { fontSize: 12, color: "#777", marginTop: 2 },

    // Success / warning / info
    successCard: {
        backgroundColor: "#E8F5E8",
        borderRadius: 12,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderColor: "#4CAF50",
    },
    successText: { fontSize: 13, color: "#2E7D32", flex: 1 },

    warningCard: {
        backgroundColor: "#FFF8E1",
        borderRadius: 12,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderColor: "#FFC107",
    },
    warningText: { fontSize: 13, color: "#F57C00", flex: 1 },

    infoCard: {
        backgroundColor: "#E3F2FD",
        borderRadius: 12,
        padding: 12,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderWidth: 1,
        borderColor: "#90CAF9",
    },
    infoText: { fontSize: 13, color: "#1565C0", flex: 1 },

    // Calendar chips
    dayChip: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#eee",
        alignItems: "center",
        gap: 6,
        minWidth: 120,
    },
    dayChipActive: { backgroundColor: "#111", borderColor: "#111" },
    dayChipText: { fontSize: 14, fontWeight: "700", color: "#111" },
    dayChipTextActive: { color: "#fff" },
    dayChipBadge: {
        fontSize: 12,
        fontWeight: "700",
        color: "#111",
        paddingHorizontal: 8,
        paddingVertical: 4,
        backgroundColor: "#F2F2F2",
        borderRadius: 8,
    },
    dayChipBadgeActive: {
        backgroundColor: "#fff",
        color: "#111",
    },
    dayChipBadgeFull: {
        backgroundColor: "#FBEAEA",
        color: "#C62828",
    },

    // Slots
    slotGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
    },
    slotBtn: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderRadius: 10,
        minWidth: "30%",
        alignItems: "center",
        borderWidth: 1,
    },
    slotBtnEnabled: { backgroundColor: "#fff", borderColor: "#111" },
    slotBtnDisabled: { backgroundColor: "#F6F6F6", borderColor: "#E5E5E5" },
    slotTextEnabled: { color: "#111", fontWeight: "700" },
    slotTextDisabled: { color: "#aaa" },

    // Inputs & toggles
    segment: { flexDirection: "row", gap: 8 },
    segmentBtn: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 8,
        backgroundColor: "#f2f2f2",
        alignItems: "center",
    },
    segmentBtnActive: { backgroundColor: "#111" },
    segmentText: { fontSize: 13, fontWeight: "700", color: "#333" },
    segmentTextActive: { color: "#fff" },

    label: { fontSize: 13, fontWeight: "700", color: "#333", marginBottom: 6 },
    input: {
        borderWidth: 1,
        borderColor: "#e5e5e5",
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        backgroundColor: "#fafafa",
        marginBottom: 8,
    },

    // Empty states & badges
    emptyCard: {
        backgroundColor: "#fff",
        padding: 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "#eee",
    },
    emptyTitle: { fontSize: 14, fontWeight: "700", color: "#333", marginBottom: 4 },
    emptyText: { fontSize: 13, color: "#666" },

    // Subscriptions
    subscriptionCard: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 16,
        marginBottom: 10,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    subscriptionCardActive: {
        borderColor: "#111",
        backgroundColor: "#FAFAFA",
        borderWidth: 2,
    },
    subscriptionCardPending: {
        borderColor: "#FFC107",
        backgroundColor: "#FFFCF0",
    },
    // neutral style for cancel-requested
    subscriptionCardInfo: {
        borderColor: "#90CAF9",
        backgroundColor: "#EAF4FF",
    },
    subscriptionSelectArea: {
        flexDirection: "row",
        alignItems: "flex-start",
        flex: 1,
    },
    subscriptionText: {
        fontSize: 14,
        color: "#111",
        fontWeight: "700",
        marginBottom: 2,
    },
    subscriptionPlan: {
        fontSize: 12,
        color: "#666",
        marginBottom: 4,
    },
    subscriptionEndDateInfo: {
        fontSize: 11,
        color: "#1565C0",
        marginTop: 4,
        lineHeight: 16,
    },
    subscriptionWarning: {
        fontSize: 11,
        color: "#F57C00",
        marginTop: 4,
        lineHeight: 16,
    },
    subscriptionActions: {
        alignItems: "flex-end",
        gap: 8,
    },
    subscriptionStatusBadge: {
        fontSize: 11,
        color: "#fff",
        backgroundColor: "#2E7D32",
        fontWeight: "700",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    subscriptionStatusBadgePending: {
        fontSize: 11,
        color: "#fff",
        backgroundColor: "#F57C00",
        fontWeight: "700",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },
    // neutral badge for cancel-requested
    subscriptionStatusBadgeInfo: {
        fontSize: 11,
        color: "#fff",
        backgroundColor: "#1565C0",
        fontWeight: "700",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 6,
    },

    subscriptionRow: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#eee",
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        flexDirection: "row",
        alignItems: "center",
    },
    subscriptionRowActive: { borderColor: "#111", backgroundColor: "#1110" },
    // neutral option style in modal
    subscriptionRowInfo: { borderColor: "#90CAF9", backgroundColor: "#EAF4FF" },

    subscriptionStatus: { fontSize: 12, color: "#2E7D32", fontWeight: "700" },
    subscriptionStatusInfo: { fontSize: 12, color: "#1565C0", fontWeight: "700" },

    // Plans
    planCard: {
        backgroundColor: "#fff",
        borderRadius: 12,
        padding: 12,
        borderWidth: 1,
        borderColor: "#eee",
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
    },
    planName: { fontSize: 15, fontWeight: "700", color: "#111" },
    planMeta: { fontSize: 12, color: "#555", marginTop: 2 },
    planDesc: { fontSize: 12, color: "#666", marginTop: 6 },
    planPrice: { fontSize: 16, fontWeight: "800", color: "#111" },

    // Modal
    modalBackdrop: {
        flex: 1,
        backgroundColor: "rgba(0,0,0,0.35)",
        justifyContent: "center",
        padding: 16,
    },
    modalCard: { backgroundColor: "#fff", borderRadius: 12, padding: 16 },
    modalTitle: { fontSize: 16, fontWeight: "700", color: "#111" },
    modalSubtitle: { fontSize: 12, color: "#666", marginTop: 4 },
    button: {
        flexDirection: "row",
        gap: 8,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderRadius: 10,
    },
    primaryButton: { backgroundColor: "#111" },
    primaryButtonText: {
        color: "#fff",
        fontSize: 14,
        fontWeight: "700",
        marginLeft: 8,
    },
    secondaryButton: { backgroundColor: "#fff", borderWidth: 1, borderColor: "#111" },
    secondaryButtonText: { color: "#111", fontSize: 14, fontWeight: "700" },
    cancelButton: {
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#C62828",
        paddingVertical: 6,
        paddingHorizontal: 12,
        borderRadius: 6,
        marginTop: 4,
    },
    cancelButtonText: {
        color: "#C62828",
        fontSize: 12,
        fontWeight: "700",
    },
    /* ===== Subscriptions Card (refined) ===== */
    subCard: {
        backgroundColor: "#fff",
        borderRadius: 14,
        borderWidth: 1,
        borderColor: "#eee",
        padding: 14,
        gap: 12,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 2,
        elevation: 2,
    },
    subCardHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    subCardTitle: { fontSize: 16, fontWeight: "800", color: "#111" },

    subEmpty: { backgroundColor: "#FAFAFA", borderRadius: 10, padding: 14, borderWidth: 1, borderColor: "#f0f0f0" },
    subEmptyTitle: { fontSize: 14, color: "#333", fontWeight: "700", marginBottom: 4 },
    subEmptyText: { fontSize: 13, color: "#666" },

    subDivider: { height: 1, backgroundColor: "#f0f0f0", marginVertical: 8 },
    subSectionLabel: { fontSize: 12, color: "#999", fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },

    /* Plans (re-uses your plan styles but tighter row) */
    planRow: {
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#eee",
        padding: 12,
        flexDirection: "row",
        gap: 10,
        alignItems: "center",
    },

    /* Banners */
    bannerWarn: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        padding: 10,
        borderRadius: 10,
        backgroundColor: "#FFF7E6",
        borderWidth: 1,
        borderColor: "#FFE0A3",
    },
    bannerWarnText: { fontSize: 12, color: "#8A5300", flex: 1, lineHeight: 16 },

    bannerInfo: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        padding: 10,
        borderRadius: 10,
        backgroundColor: "#EAF4FF",
        borderWidth: 1,
        borderColor: "#CFE7FF",
    },
    bannerInfoText: { fontSize: 12, color: "#0D47A1", flex: 1, lineHeight: 16 },

    /* Items */
    subItem: {
        backgroundColor: "#fff",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#eee",
        padding: 12,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
    },
    /* left accent by status */
    subItemAccentGreen: { borderLeftWidth: 3, borderLeftColor: "#2E7D32" },
    subItemAccentBlue: { borderLeftWidth: 3, borderLeftColor: "#1565C0" },
    subItemAccentAmber: { borderLeftWidth: 3, borderLeftColor: "#B26A00" },

    /* selected */
    subItemSelected: { borderColor: "#111" },

    subItemMain: { flexDirection: "row", alignItems: "flex-start", flex: 1 },
    subItemRight: { alignItems: "flex-end", gap: 8 },

    subItemTitle: { fontSize: 14, fontWeight: "700", color: "#111" },
    subItemSub: { fontSize: 12, color: "#666", marginTop: 2 },

    subInlineInfo: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
    subInlineInfoText: { fontSize: 11, color: "#1565C0" },
    subInlineWarn: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6 },
    subInlineWarnText: { fontSize: 11, color: "#8A5300" },

    /* Chips */
    badge: {
        fontSize: 11,
        fontWeight: "800",
        color: "#fff",
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        overflow: "hidden",
        letterSpacing: 0.3,
    },
    badgeGreen: { backgroundColor: "#2E7D32" },
    badgeBlue: { backgroundColor: "#1565C0" },
    badgeAmber: { backgroundColor: "#B26A00" },

    /* Linky action */
    linkButton: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        backgroundColor: "#FFF0F0",
        borderWidth: 1,
        borderColor: "#FFD6D6",
    },
    linkButtonText: { color: "#C62828", fontSize: 12, fontWeight: "700" },
});
