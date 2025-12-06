import React, { useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Avatar, Badge, Button } from "native-base";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@apollo/client/react";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

import { TRAINERS_WITH_PLANS } from "@/graphql/queries";
import { useSelectedTrainerStore, TrainerWithPlans } from "@/store/selectedTrainerStore";
import { getTokens, onTokensChanged } from "@/lib/apollo";
import { resolveS3KeyToUrl, isFullUrl } from "@/lib/media";

const PAGE_SIZE = 20;
const BG = "#05030D";
const CARD_BG = "rgba(15,13,25,0.92)";
const BORDER = "rgba(255,255,255,0.08)";
const TEXT_PRIMARY = "#F6F4FF";
const TEXT_MUTED = "rgba(247,244,255,0.75)";
const ACCENT = "#A855F7";

export default function ViewAllTrainers() {
    const [pageNumber, setPageNumber] = useState(1);
    const [token, setToken] = useState<string | null>(null);
    const [photoMap, setPhotoMap] = useState<Record<string, string>>({});
    const { setSelected } = useSelectedTrainerStore();

    const { data, loading, error, fetchMore, refetch } = useQuery(TRAINERS_WITH_PLANS, {
        variables: { pageNumber: 1, pageSize: PAGE_SIZE },
        fetchPolicy: "no-cache",
        nextFetchPolicy: "no-cache",
        notifyOnNetworkStatusChange: true,
    });

    const trainers: TrainerWithPlans[] = data?.trainersWithPlans ?? [];

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

    const pendingPhotoKeys = useMemo(() => {
        const keys = new Set<string>();
        trainers.forEach((twp) => {
            const key = twp.trainer.professional.profilePhoto;
            if (key && !isFullUrl(key) && !photoMap[key]) {
                keys.add(key);
            }
        });
        return Array.from(keys);
    }, [trainers, photoMap]);

    useEffect(() => {
        if (!token || !pendingPhotoKeys.length) return;
        let cancelled = false;
        (async () => {
            for (const key of pendingPhotoKeys) {
                const url = await resolveS3KeyToUrl(key, token);
                if (!cancelled && url) {
                    setPhotoMap((prev) => ({ ...prev, [key]: url }));
                }
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [token, pendingPhotoKeys]);

    const handleLoadMore = () => {
        // naïve pagination – adjust if backend returns "hasNext" later
        const nextPage = pageNumber + 1;
        fetchMore({
            variables: { pageNumber: nextPage, pageSize: PAGE_SIZE },
            updateQuery: (prev, { fetchMoreResult }) => {
                if (!fetchMoreResult) return prev;
                return {
                    trainersWithPlans: [
                        ...(prev.trainersWithPlans ?? []),
                        ...(fetchMoreResult.trainersWithPlans ?? []),
                    ],
                };
            },
        });
        setPageNumber(nextPage);
    };

    const humanBusinessType = (bt?: string | null) => {
        if (!bt) return "Trainer";
        return bt.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    };

    const specialtiesToText = (specialties: string[]) =>
        specialties
            .slice(0, 3)
            .map((s) => s.replace(/_/g, " ").toLowerCase())
            .join(" • ");

    const getAvatarUri = (value?: string | null) => {
        if (!value) return undefined;
        if (isFullUrl(value)) return value;
        return photoMap[value];
    };

    const isInitialLoading = loading && !data;

    if (error) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={[styles.center, { paddingHorizontal: 32 }]}>
                    <Text style={styles.errorText}>Unable to load trainers right now.</Text>
                    <Button mt={4} onPress={() => refetch()}>
                        Retry
                    </Button>
                </View>
            </SafeAreaView>
        );
    }

    if (isInitialLoading) {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.center}>
                    <ActivityIndicator color="#fff" />
                    <Text style={[styles.errorText, { marginTop: 12 }]}>Finding trainers…</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
            <View style={styles.container}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={styles.scrollContent}
                >
                    <LinearGradient
                        colors={["#1C0F2E", "#07040F"]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={styles.hero}
                    >
                        <TouchableOpacity style={styles.heroBack} onPress={() => router.back()}>
                            <Ionicons name="chevron-back" size={18} color="#fff" />
                        </TouchableOpacity>
                        <Text style={styles.heroEyebrow}>Trainer marketplace</Text>
                        <Text style={styles.heroTitle}>Choose the coach for your next sprint</Text>
                        <Text style={styles.heroSubtitle}>
                            Browse top-tier pros, preview specialties, and send invitations in seconds.
                        </Text>
                    </LinearGradient>

                    <View style={styles.list}>
                        {trainers.map((twp) => {
                            const t = twp.trainer;
                            const p = t.professional;
                            const displayName = t.user?.name || humanBusinessType(p.businessType);
                            const specialtyText = specialtiesToText(p.specialties ?? []);
                            const avatarUri = t.user?.avatarUrl || getAvatarUri(p.profilePhoto);
                            const cityCountry = [t.contact?.city, t.contact?.country].filter(Boolean).join(", ");

                            return (
                                <TouchableOpacity
                                    key={t._id}
                                    activeOpacity={0.9}
                                    onPress={() => {
                                        setSelected(twp);
                                        router.push({
                                            pathname: "/(trainers)/profile/[trainerId]",
                                            params: { trainerId: t.userId },
                                        });
                                    }}
                                >
                                    <LinearGradient
                                        colors={["rgba(124,58,237,0.15)", "rgba(8,6,20,0.9)"]}
                                        start={{ x: 0, y: 0 }}
                                        end={{ x: 1, y: 1 }}
                                        style={styles.card}
                                    >
                                        <Avatar
                                            size="md"
                                            source={avatarUri ? { uri: avatarUri } : undefined}
                                            bg="rgba(255,255,255,0.08)"
                                        >
                                            {displayName.charAt(0).toUpperCase()}
                                        </Avatar>
                                        <View style={{ flex: 1, marginHorizontal: 14 }}>
                                            <Text style={styles.cardName}>{displayName}</Text>
                                            {cityCountry ? <Text style={styles.cardLocation}>{cityCountry}</Text> : null}
                                            {specialtyText ? (
                                                <Text style={styles.cardSpecialties}>{specialtyText}</Text>
                                            ) : null}
                                            {t.availability?.preferredTime ? (
                                                <Text style={styles.cardMeta}>
                                                    Prefers {t.availability.preferredTime.toLowerCase().replace(/_/g, " ")} •{" "}
                                                    {t.availability.timezone}
                                                </Text>
                                            ) : null}
                                        </View>
                                        <View style={styles.experienceChip}>
                                            <Text style={styles.experienceText}>{p.yearsOfExperience} yrs</Text>
                                        </View>
                                    </LinearGradient>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {trainers.length >= PAGE_SIZE && (
                        <TouchableOpacity style={styles.loadButton} onPress={handleLoadMore} disabled={loading}>
                            {loading ? (
                                <ActivityIndicator color="#05030D" />
                            ) : (
                                <Text style={styles.loadButtonText}>Load more profiles</Text>
                            )}
                        </TouchableOpacity>
                    )}
                </ScrollView>
            </View>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: BG,
    },
    container: {
        flex: 1,
        backgroundColor: BG,
    },
    scrollContent: {
        paddingBottom: 60,
        paddingHorizontal: 16,
    },
    hero: {
        borderRadius: 28,
        padding: 20,
        borderWidth: 1,
        borderColor: BORDER,
        marginBottom: 20,
    },
    heroBack: {
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: BORDER,
        alignItems: "center",
        justifyContent: "center",
    },
    heroEyebrow: {
        color: TEXT_MUTED,
        textTransform: "uppercase",
        fontSize: 11,
        letterSpacing: 1,
        marginTop: 16,
    },
    heroTitle: {
        color: TEXT_PRIMARY,
        fontSize: 24,
        fontWeight: "700",
        marginTop: 8,
    },
    heroSubtitle: {
        color: TEXT_MUTED,
        fontSize: 13,
        marginTop: 8,
        lineHeight: 20,
    },
    heroStats: {
        flexDirection: "row",
        justifyContent: "space-between",
        marginTop: 18,
    },
    heroStatValue: {
        color: TEXT_PRIMARY,
        fontSize: 20,
        fontWeight: "700",
    },
    heroStatLabel: {
        color: TEXT_MUTED,
        fontSize: 11,
        marginTop: 4,
        textTransform: "uppercase",
        letterSpacing: 0.8,
    },
    list: {
        gap: 14,
    },
    card: {
        flexDirection: "row",
        alignItems: "center",
        padding: 16,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: BORDER,
    },
    cardName: {
        color: TEXT_PRIMARY,
        fontSize: 16,
        fontWeight: "700",
    },
    cardLocation: {
        color: TEXT_MUTED,
        fontSize: 12,
        marginTop: 2,
    },
    cardSpecialties: {
        color: TEXT_MUTED,
        fontSize: 12,
        marginTop: 6,
    },
    cardMeta: {
        color: "rgba(255,255,255,0.5)",
        fontSize: 11,
        marginTop: 4,
    },
    experienceChip: {
        borderRadius: 14,
        paddingHorizontal: 10,
        paddingVertical: 4,
        backgroundColor: "rgba(0,0,0,0.25)",
        borderWidth: 1,
        borderColor: BORDER,
    },
    experienceText: {
        color: TEXT_PRIMARY,
        fontSize: 11,
        fontWeight: "700",
    },
    loadButton: {
        marginTop: 20,
        backgroundColor: ACCENT,
        borderRadius: 18,
        alignItems: "center",
        paddingVertical: 12,
    },
    loadButtonText: {
        color: "#05030D",
        fontWeight: "800",
    },
    center: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
    },
    errorText: {
        color: TEXT_MUTED,
        textAlign: "center",
    },
});
