import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    Image,
    SafeAreaView,
    Modal,
    Dimensions,
    FlatList,
} from "react-native";
import { Avatar, Button } from "native-base";
import { useLocalSearchParams, router } from "expo-router";
import { useMutation, useQuery } from "@apollo/client/react";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useSelectedTrainerStore } from "@/store/selectedTrainerStore";
import { GET_ME, ACTIVE_CLIENT_SUBSCRIPTIONS_V2 } from "@/graphql/queries";
import { REQUEST_INVITATION } from "@/graphql/mutations";
import { Alert } from "react-native";
import { getTokens, onTokensChanged } from "@/lib/apollo";
import { resolveS3KeyToUrl, isFullUrl } from "@/lib/media";

const SCREEN_BG = "#05030D";
const CARD_BG = "rgba(15,13,25,0.95)";
const BORDER = "rgba(255,255,255,0.08)";
const ACCENT = "#A855F7";
const ACCENT_SOFT = "#7C3AED";
const TEXT_PRIMARY = "#F6F4FF";
const TEXT_MUTED = "rgba(247,244,255,0.72)";

export default function TrainerProfileScreen() {
    const insets = useSafeAreaInsets();
    const { trainerId } = useLocalSearchParams<{ trainerId: string }>();
    const { selected } = useSelectedTrainerStore();

    const trainerWithPlans = selected;
    const [token, setToken] = useState<string | null>(null);
    const [imageMap, setImageMap] = useState<Record<string, string>>({});
    const [imagePreview, setImagePreview] = useState<{ images: string[]; index: number } | null>(null);
    const [previewCursor, setPreviewCursor] = useState(0);
    const previewListRef = useRef<FlatList<string>>(null);
    const previewWindowWidth = Dimensions.get("window").width;

    const { data: meData, loading: meLoading } = useQuery(GET_ME);
    // @ts-ignore
    const user = meData?.user;
    const clientId: string | undefined = user?._id;
    const clientEmail: string | undefined = user?.email;

    useEffect(() => {
        let cancelled = false;
        const syncToken = async () => {
            try {
                const { accessToken } = await getTokens();
                if (!cancelled) setToken(accessToken ?? null);
            } catch {
                if (!cancelled) setToken(null);
            }
        };

        syncToken();
        const unsub = onTokensChanged(syncToken);
        return () => {
            cancelled = true;
            unsub();
        };
    }, []);

    const humanBusinessType = (bt?: string | null) => {
        if (!bt) return "Trainer";
        return bt.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    };

    const pendingImageKeys = useMemo(() => {
        if (!trainerWithPlans) return [];
        const keys = new Set<string>();
        const addKey = (value?: string | null) => {
            if (value && !isFullUrl(value) && !imageMap[value]) {
                keys.add(value);
            }
        };

        addKey(trainerWithPlans.trainer.professional.profilePhoto);
        trainerWithPlans.trainer.professional.gallery?.forEach(addKey);
        trainerWithPlans.trainer.testimonials?.forEach((ts) => addKey(ts.profileImage));
        trainerWithPlans.trainer.transformations?.forEach((tf) => {
            tf.beforeImages?.forEach(addKey);
            tf.afterImages?.forEach(addKey);
        });
        return Array.from(keys);
    }, [trainerWithPlans, imageMap]);

    useEffect(() => {
        if (!token || !pendingImageKeys.length) return;
        let cancelled = false;
        (async () => {
            for (const key of pendingImageKeys) {
                const url = await resolveS3KeyToUrl(key, token);
                if (!cancelled && url) {
                    setImageMap((prev) => ({ ...prev, [key]: url }));
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, pendingImageKeys]);

    const {
        data: activeSubData,
        loading: activeSubLoading,
    } = useQuery(ACTIVE_CLIENT_SUBSCRIPTIONS_V2, {
        variables: {
            trainerId: trainerId as string, // NOTE: this should be trainer.userId per your note
            clientId: clientId as string,
        },
        skip: !trainerId || !clientId,
        fetchPolicy: "network-only",
    });

    const hasActiveSubscription = useMemo(() => {
        // @ts-ignore
        const subs = activeSubData?.activeClientSubscriptionsV2 ?? [];
        return subs.length > 0;
    }, [activeSubData]);

    const [requestInvitation, { loading: inviteLoading }] = useMutation(REQUEST_INVITATION, {
        onCompleted: () => {
            Alert.alert(
                "Invitation sent",
                "We’ve notified the trainer. You’ll hear back once they review your request."
            );
        },
        onError: (error) => {
            const alreadyRequested = error.graphQLErrors?.some(
                (graphErr) => graphErr.extensions?.code === "BAD_REQUEST"
            );
            if (alreadyRequested) {
                Alert.alert(
                    "Already requested",
                    "Looks like you’ve already requested this trainer. Please wait for their response."
                );
                return;
            }
            Alert.alert("Error!", "Unable to process the invitation right now. Please try again later.");
        },
    });

    if (!trainerWithPlans) {
        return (
            <View style={[styles.screen, { justifyContent: "center", alignItems: "center", paddingHorizontal: 32 }]}>
                <Text style={[styles.emptyText, { marginBottom: 16 }]}>
                    Trainer details not available. Please go back to the list and try again.
                </Text>
                <Button onPress={() => router.back()}>Go back</Button>
            </View>
        );
    }

    const alreadyConnected = !!trainerWithPlans.isConnected;
    const t = trainerWithPlans.trainer;
    const p = t.professional;
    const getImageUri = (value?: string | null) => {
        if (!value) return undefined;
        if (isFullUrl(value)) return value;
        return imageMap[value];
    };

    const availability = t.availability;
    const plans = trainerWithPlans.subscriptionPlans;
    const displayName = t.user?.name || humanBusinessType(p.businessType);
    const profileAvatarUri = getImageUri(p.profilePhoto) || t.user?.avatarUrl;
    const avatarInitial = displayName?.trim?.().charAt(0).toUpperCase() || "T";

    const onRequestInvitation = () => {
        if (!clientEmail) {
            Alert.alert("Update profile", "Add your email to your profile before requesting an invitation.");
            return;
        }
        requestInvitation({
            variables: {
                trainerId: t.userId, // per your note: userId is trainerId
                email: clientEmail,
            },
        });
    };

    const cityCountry = [t.contact?.city, t.contact?.country].filter(Boolean).join(", ");
    const specialties = (p.specialties ?? []).map((s) => s.replace(/_/g, " ").toLowerCase());
    const languages = p.languages ?? [];
    const galleryImages = (p.gallery ?? [])
        .map((img) => getImageUri(img))
        .filter((uri): uri is string => !!uri);
    const testimonials = t.testimonials ?? [];
    const transformations = t.transformations ?? [];
    const stats = [
        { label: "Experience", value: `${p.yearsOfExperience}+ yrs` },
        { label: "Timezone", value: availability?.timezone || "Flexible" },
        { label: "Languages", value: languages.slice(0, 2).join(" • ") || "English" },
    ];

    const openPreview = useCallback((images: string[], index = 0) => {
        if (!images.length) return;
        setPreviewCursor(index);
        setImagePreview({ images, index });
    }, []);

    const closePreview = useCallback(() => {
        setImagePreview(null);
        setPreviewCursor(0);
    }, []);

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.screen}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 8 }]}
                >
                <LinearGradient
                    colors={["#1C0F2E", "#07040F"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.heroCard}
                >
                    <View style={styles.heroHeader}>
                        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
                            <Ionicons name="chevron-back" size={18} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.heroSubtitle}>Profile</Text>
                    </View>
                    <View style={styles.heroBody}>
                        <Avatar
                            size="lg"
                            bg="rgba(255,255,255,0.1)"
                            source={profileAvatarUri ? { uri: profileAvatarUri } : undefined}
                        >
                            {avatarInitial}
                        </Avatar>
                        <View style={styles.heroInfo}>
                            <Text style={styles.heroName}>{displayName}</Text>
                            {cityCountry ? (
                                <Text style={styles.heroLocation}>{cityCountry}</Text>
                            ) : null}
                            <View style={styles.chipRow}>
                                <View style={styles.chip}>
                                    <Ionicons name="briefcase-outline" size={12} color="#fff" />
                                    <Text style={styles.chipText}>{humanBusinessType(p.businessType)}</Text>
                                </View>
                                {availability?.preferredTime ? (
                                    <View style={styles.chip}>
                                        <Ionicons name="time-outline" size={12} color="#fff" />
                                        <Text style={styles.chipText}>
                                            {availability.preferredTime.toLowerCase().replace(/_/g, " ")}
                                        </Text>
                                    </View>
                                ) : null}
                            </View>
                        </View>
                    </View>
                    <View style={styles.statsRow}>
                        {stats.map((stat) => (
                            <View key={stat.label} style={styles.statCard}>
                                <Text style={styles.statValue}>{stat.value}</Text>
                                <Text style={styles.statLabel}>{stat.label}</Text>
                            </View>
                        ))}
                    </View>
                </LinearGradient>

                <View style={styles.inviteCard}>
                    <Text style={styles.sectionTitle}>Work with {displayName.split(" ")[0]}</Text>
                    {meLoading || activeSubLoading ? (
                        <ActivityIndicator color="#fff" style={{ marginTop: 12 }} />
                    ) : hasActiveSubscription ? (
                        <Text style={styles.successText}>
                            You already have an active subscription with this trainer. Manage it from your
                            subscriptions screen.
                        </Text>
                    ) : alreadyConnected ? (
                        <Text style={styles.successText}>
                            You’re already connected with this trainer. Head to your subscriptions screen to keep the
                            momentum going.
                        </Text>
                    ) : (
                        <>
                            <Text style={styles.sectionBody}>
                                Send a request to unlock their programs. Once they accept, you can subscribe and begin
                                training.
                            </Text>
                            <TouchableOpacity
                                onPress={onRequestInvitation}
                                disabled={inviteLoading}
                                style={[styles.primaryButton, inviteLoading && styles.primaryButtonDisabled]}
                            >
                                {inviteLoading ? (
                                    <ActivityIndicator color="#05030D" />
                                ) : (
                                    <Text style={styles.primaryButtonText}>Request invitation</Text>
                                )}
                            </TouchableOpacity>
                        </>
                    )}
                </View>

                {p.bio ? (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>About {displayName.split(" ")[0]}</Text>
                        <Text style={styles.sectionBody}>{p.bio}</Text>
                    </View>
                ) : null}

                {specialties.length ? (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>Focus Areas</Text>
                        <View style={styles.tagGrid}>
                            {specialties.map((spec) => (
                                <View key={spec} style={styles.tag}>
                                    <Text style={styles.tagText}>{spec}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : null}

                {languages.length ? (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>Languages</Text>
                        <View style={styles.tagGrid}>
                            {languages.map((lang) => (
                                <View key={lang} style={[styles.tag, { backgroundColor: "rgba(255,255,255,0.04)" }]}>
                                    <Text style={styles.tagText}>{lang}</Text>
                                </View>
                            ))}
                        </View>
                    </View>
                ) : null}

                {availability ? (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>Availability</Text>
                        <Text style={styles.sectionBody}>
                            {availability.checkIn} - {availability.checkOut} ({availability.timezone})
                        </Text>
                        <Text style={styles.metaText}>{availability.daysAvailable.join(" • ")}</Text>
                    </View>
                ) : null}

                {plans?.length ? (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>Subscription plans</Text>
                        <View style={styles.planList}>
                            {plans.map((plan) => (
                                <LinearGradient
                                    key={plan._id}
                                    colors={["rgba(124,58,237,0.25)", "rgba(31,16,44,0.85)"]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.planCard}
                                >
                                    <View style={styles.planHeader}>
                                        <Text style={styles.planName}>{plan.name}</Text>
                                        <Text style={styles.planPrice}>
                                            ₹{(plan.amount / 100).toFixed(2)} · {plan.interval}x{" "}
                                            {plan.period.toLowerCase()}
                                        </Text>
                                    </View>
                                    {plan.description ? (
                                        <Text style={styles.planDescription}>{plan.description}</Text>
                                    ) : null}
                                    {(plan.meta?.freeTrialSessions || plan.meta?.sessionsIncludedPerMonth) && (
                                        <View style={styles.planMetaRow}>
                                            {plan.meta?.freeTrialSessions ? (
                                                <View style={styles.metaChip}>
                                                    <Text style={styles.metaChipText}>
                                                        {plan.meta.freeTrialSessions} trial sessions
                                                    </Text>
                                                </View>
                                            ) : null}
                                            {plan.meta?.sessionsIncludedPerMonth ? (
                                                <View style={styles.metaChip}>
                                                    <Text style={styles.metaChipText}>
                                                        {plan.meta.sessionsIncludedPerMonth}/month included
                                                    </Text>
                                                </View>
                                            ) : null}
                                        </View>
                                    )}
                                </LinearGradient>
                            ))}
                        </View>
                    </View>
                ) : null}

                {galleryImages.length ? (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>Training gallery</Text>
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingVertical: 12 }}
                        >
                            {galleryImages.map((uri, idx) => (
                                <View key={uri + idx} style={styles.galleryItem}>
                                    <Image source={{ uri }} style={styles.galleryImage} resizeMode="cover" />
                                </View>
                            ))}
                        </ScrollView>
                    </View>
                ) : null}

                {transformations.length ? (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>Transformations</Text>
                        {transformations.map((item, idx) => (
                            <View key={idx} style={styles.transformationCard}>
                                <Text style={styles.transformationTitle}>
                                    {item.clientName} · {item.timeline}
                                </Text>
                                <Text style={styles.metaText}>
                                    Goal: {item.transformationGoal.replace(/_/g, " ").toLowerCase()}
                                </Text>
                                {(() => {
                                    const beforeUris = (item.beforeImages ?? [])
                                        .map((img) => getImageUri(img))
                                        .filter((uri): uri is string => !!uri);
                                    const afterUris = (item.afterImages ?? [])
                                        .map((img) => getImageUri(img))
                                        .filter((uri): uri is string => !!uri);
                                    if (!beforeUris.length && !afterUris.length) return null;
                                    const combinedImages = [...beforeUris, ...afterUris];
                                    return (
                                        <View style={styles.transformationImagesRow}>
                                            {beforeUris.length ? (
                                                <TouchableOpacity
                                                    activeOpacity={0.9}
                                                    style={styles.transformationImagePanel}
                                                    onPress={() => openPreview(combinedImages, 0)}
                                                >
                                                    <Image source={{ uri: beforeUris[0] }} style={styles.transformationImage} />
                                                    <View style={styles.transformationImageShade} />
                                                    <Text style={styles.transformationImageBadge}>Before</Text>
                                                    {beforeUris.length > 1 ? (
                                                        <View style={styles.transformationImageCount}>
                                                            <Text style={styles.transformationImageCountText}>
                                                                +{beforeUris.length - 1}
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                </TouchableOpacity>
                                            ) : null}
                                            {afterUris.length ? (
                                                <TouchableOpacity
                                                    activeOpacity={0.9}
                                                    style={styles.transformationImagePanel}
                                                    onPress={() => openPreview(combinedImages, Math.max(0, beforeUris.length))}
                                                >
                                                    <Image source={{ uri: afterUris[0] }} style={styles.transformationImage} />
                                                    <View style={styles.transformationImageShade} />
                                                    <Text style={styles.transformationImageBadge}>After</Text>
                                                    {afterUris.length > 1 ? (
                                                        <View style={styles.transformationImageCount}>
                                                            <Text style={styles.transformationImageCountText}>
                                                                +{afterUris.length - 1}
                                                            </Text>
                                                        </View>
                                                    ) : null}
                                                </TouchableOpacity>
                                            ) : null}
                                        </View>
                                    );
                                })()}
                                {item.resultsAndAchievements?.map((result, rIdx) => (
                                    <Text key={rIdx} style={styles.sectionBody}>
                                        • {result}
                                    </Text>
                                ))}
                            </View>
                        ))}
                    </View>
                ) : null}

                {testimonials.length ? (
                    <View style={styles.sectionCard}>
                        <Text style={styles.sectionTitle}>Testimonials</Text>
                        {testimonials.map((ts, idx) => {
                            const uri = getImageUri(ts.profileImage);
                            return (
                                <View key={idx} style={styles.testimonialCard}>
                                    <Avatar
                                        size="sm"
                                        bg="rgba(255,255,255,0.1)"
                                        source={uri ? { uri } : undefined}
                                    >
                                        {ts.clientName.charAt(0)}
                                    </Avatar>
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.testimonialName}>{ts.clientName}</Text>
                                        <Text style={styles.sectionBody}>{ts.note}</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                ) : null}
                </ScrollView>
            </View>
            {imagePreview && (
                <Modal visible transparent animationType="fade" onRequestClose={closePreview}>
                    <View style={styles.previewBackdrop}>
                        <TouchableOpacity style={styles.previewBackdropPress} activeOpacity={1} onPress={closePreview} />
                        <View style={styles.previewCard}>
                            <FlatList
                                ref={previewListRef}
                                data={imagePreview.images}
                                keyExtractor={(uri, idx) => `${uri}-${idx}`}
                                horizontal
                                pagingEnabled
                                initialScrollIndex={imagePreview.index}
                                getItemLayout={(_, index) => ({
                                    length: previewWindowWidth,
                                    offset: previewWindowWidth * index,
                                    index,
                                })}
                                showsHorizontalScrollIndicator={false}
                                onMomentumScrollEnd={({ nativeEvent }) => {
                                    const idx = Math.round(nativeEvent.contentOffset.x / previewWindowWidth);
                                    setPreviewCursor(idx);
                                }}
                                renderItem={({ item }) => (
                                    <View style={[styles.previewImageShell, { width: previewWindowWidth }]}>
                                        <Image source={{ uri: item }} style={styles.previewImage} resizeMode="contain" />
                                    </View>
                                )}
                            />
                            <View style={styles.previewCounter}>
                                <Text style={styles.previewCounterText}>
                                    {previewCursor + 1} / {imagePreview.images.length}
                                </Text>
                            </View>
                            <TouchableOpacity style={styles.previewClose} onPress={closePreview}>
                                <Ionicons name="close" size={20} color="#fff" />
                            </TouchableOpacity>
                        </View>
                    </View>
                </Modal>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: SCREEN_BG,
    },
    screen: {
        flex: 1,
        backgroundColor: SCREEN_BG,
        paddingTop: 16,
    },
    emptyText: {
        color: TEXT_MUTED,
        textAlign: "center",
        fontSize: 14,
        lineHeight: 20,
    },
    scrollContent: {
        paddingBottom: 48,
        paddingHorizontal: 16,
    },
    heroCard: {
        borderRadius: 28,
        padding: 20,
        borderWidth: 1,
        borderColor: BORDER,
        marginBottom: 18,
    },
    heroHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: BORDER,
        alignItems: "center",
        justifyContent: "center",
    },
    heroSubtitle: {
        color: TEXT_MUTED,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: 1,
    },
    heroBody: {
        flexDirection: "row",
        marginTop: 16,
        alignItems: "center",
        gap: 16,
    },
    heroInfo: { flex: 1 },
    heroName: {
        color: TEXT_PRIMARY,
        fontSize: 24,
        fontWeight: "700",
    },
    heroLocation: {
        color: TEXT_MUTED,
        fontSize: 13,
        marginTop: 4,
    },
    chipRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginTop: 10,
    },
    chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
    },
    chipText: { color: TEXT_PRIMARY, fontSize: 12, textTransform: "capitalize" },
    statsRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 18,
        gap: 10,
    },
    statCard: {
        flex: 1,
        padding: 12,
        borderRadius: 18,
        backgroundColor: "rgba(0,0,0,0.25)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
    },
    statValue: {
        color: TEXT_PRIMARY,
        fontSize: 16,
        fontWeight: "700",
    },
    statLabel: {
        color: TEXT_MUTED,
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: 0.8,
        marginTop: 4,
    },
    inviteCard: {
        backgroundColor: CARD_BG,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: BORDER,
        marginBottom: 18,
    },
    sectionTitle: {
        color: TEXT_PRIMARY,
        fontSize: 16,
        fontWeight: "700",
    },
    sectionBody: {
        color: TEXT_MUTED,
        fontSize: 13,
        lineHeight: 18,
        marginTop: 8,
    },
    primaryButton: {
        marginTop: 14,
        backgroundColor: ACCENT,
        borderRadius: 16,
        paddingVertical: 12,
        alignItems: "center",
    },
    primaryButtonDisabled: {
        opacity: 0.6,
    },
    primaryButtonText: {
        color: "#05030D",
        fontWeight: "800",
    },
    successText: {
        color: "#4ADE80",
        fontSize: 12,
        marginTop: 8,
    },
    sectionCard: {
        backgroundColor: CARD_BG,
        borderRadius: 24,
        padding: 20,
        borderWidth: 1,
        borderColor: BORDER,
        marginBottom: 18,
    },
    tagGrid: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 10,
        marginTop: 12,
    },
    tag: {
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 999,
        backgroundColor: "rgba(124,58,237,0.15)",
    },
    tagText: {
        color: TEXT_PRIMARY,
        fontSize: 12,
        textTransform: "capitalize",
    },
    metaText: {
        color: TEXT_MUTED,
        fontSize: 12,
        marginTop: 6,
    },
    planList: {
        gap: 14,
        marginTop: 12,
    },
    planCard: {
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    planHeader: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
    },
    planName: {
        color: TEXT_PRIMARY,
        fontSize: 16,
        fontWeight: "700",
    },
    planPrice: {
        color: "#FFD580",
        fontWeight: "700",
        fontSize: 12,
        textTransform: "uppercase",
    },
    planDescription: {
        color: TEXT_MUTED,
        marginTop: 8,
        fontSize: 13,
        lineHeight: 18,
    },
    planMetaRow: {
        flexDirection: "row",
        gap: 8,
        marginTop: 12,
        flexWrap: "wrap",
    },
    metaChip: {
        borderRadius: 999,
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: "rgba(0,0,0,0.25)",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.1)",
    },
    metaChipText: { color: TEXT_PRIMARY, fontSize: 11 },
    galleryItem: {
        width: 140,
        height: 120,
        borderRadius: 18,
        overflow: "hidden",
        marginRight: 12,
        borderWidth: 1,
        borderColor: BORDER,
    },
    galleryImage: {
        width: "100%",
        height: "100%",
    },
    transformationCard: {
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.08)",
    },
    transformationTitle: {
        color: TEXT_PRIMARY,
        fontWeight: "600",
        fontSize: 14,
    },
    transformationImagesRow: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 12,
        marginTop: 12,
    },
    transformationImagePanel: {
        flexGrow: 1,
        flexBasis: "48%",
        borderRadius: 18,
        overflow: "hidden",
        position: "relative",
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        minHeight: 160,
        backgroundColor: "rgba(255,255,255,0.02)",
    },
    transformationImage: {
        ...StyleSheet.absoluteFillObject,
        width: undefined,
        height: undefined,
    },
    transformationImageShade: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0,0,0,0.35)",
    },
    transformationImageBadge: {
        position: "absolute",
        bottom: 12,
        left: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: "rgba(5,3,13,0.7)",
        color: "#fff",
        fontSize: 12,
        fontWeight: "700",
        textTransform: "uppercase",
    },
    transformationImageCount: {
        position: "absolute",
        top: 12,
        right: 12,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.15)",
    },
    transformationImageCountText: {
        color: "#fff",
        fontSize: 11,
        fontWeight: "600",
    },
    previewBackdrop: {
        flex: 1,
        backgroundColor: "rgba(5,3,13,0.95)",
        justifyContent: "center",
        alignItems: "center",
    },
    previewBackdropPress: {
        ...StyleSheet.absoluteFillObject,
    },
    previewCard: {
        width: "100%",
        height: "100%",
        justifyContent: "center",
        alignItems: "center",
    },
    previewImageShell: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 24,
    },
    previewImage: {
        width: "100%",
        height: "80%",
    },
    previewClose: {
        position: "absolute",
        top: 56,
        right: 24,
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: "rgba(0,0,0,0.5)",
        alignItems: "center",
        justifyContent: "center",
    },
    previewCounter: {
        position: "absolute",
        bottom: 48,
        alignSelf: "center",
        backgroundColor: "rgba(0,0,0,0.6)",
        paddingHorizontal: 14,
        paddingVertical: 6,
        borderRadius: 999,
    },
    previewCounterText: {
        color: "#fff",
        fontWeight: "700",
        letterSpacing: 0.5,
    },
    testimonialCard: {
        flexDirection: "row",
        gap: 12,
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.08)",
    },
    testimonialName: {
        color: TEXT_PRIMARY,
        fontWeight: "600",
        marginBottom: 4,
    },
});
