import React, { useEffect, useMemo, useState } from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    ActivityIndicator,
    TextInput,
} from "react-native";
import { Avatar, Button } from "native-base";
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

interface TraineeResponse {
  trainersWithPlans: TrainerWithPlans[];
}

export default function ViewAllTrainers() {
    const [pageNumber, setPageNumber] = useState(1);
    const [token, setToken] = useState<string | null>(null);
    const [photoMap, setPhotoMap] = useState<Record<string, string>>({});
    const [searchTerm, setSearchTerm] = useState("");
    const [debouncedSearchTerm, setDebouncedSearchTerm] = useState("");
    const [isSearching, setIsSearching] = useState(false);
    const { setSelected } = useSelectedTrainerStore();

    const { data, loading, error, fetchMore, refetch } = useQuery<TraineeResponse>(TRAINERS_WITH_PLANS, {
        variables: { 
            pageNumber: 1, 
            pageSize: PAGE_SIZE,
            searchTerm: debouncedSearchTerm.trim() || undefined
        },
        fetchPolicy: "no-cache",
        nextFetchPolicy: "no-cache",
        notifyOnNetworkStatusChange: true,
    });

    const trainers: TrainerWithPlans[] = data?.trainersWithPlans ?? [];

    // Track search state properly
    useEffect(() => {
        if (debouncedSearchTerm.trim()) {
            setIsSearching(true);
        } else {
            setIsSearching(false);
        }
    }, [debouncedSearchTerm]);

    // Clear search state when data loads
    useEffect(() => {
        if (data && !loading) {
            setIsSearching(false);
        }
    }, [data, loading]);

    // Debounce search input
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedSearchTerm(searchTerm);
            setPageNumber(1); // Reset to first page when search changes
        }, 300);

        return () => clearTimeout(handler);
    }, [searchTerm]);

    // Sync auth token
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

    // Handle S3 image URLs
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
        const nextPage = pageNumber + 1;
        fetchMore({
            variables: { 
                pageNumber: nextPage, 
                pageSize: PAGE_SIZE,
                searchTerm: debouncedSearchTerm.trim() || undefined
            },
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

    const isInitialLoading = loading && !data && !debouncedSearchTerm.trim();
    const showLoadMore = !debouncedSearchTerm.trim() && trainers.length >= PAGE_SIZE && !loading;

    if (error && !debouncedSearchTerm.trim()) {
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

                    {/* 🔎 SEARCH BAR */}
                    <View style={styles.searchContainer}>
                        <Ionicons name="search" size={20} color="#aaa" style={{ marginRight: 8 }} />
                        <TextInput
                            placeholder="Search coaches by name, location, or specialty"
                            placeholderTextColor="#aaa"
                            value={searchTerm}
                            onChangeText={setSearchTerm}
                            style={styles.searchInput}
                        />
                    </View>

                    {/* Show loading indicator during search */}
                    {isSearching && (
                        <View style={styles.searchLoading}>
                            <ActivityIndicator color="#A855F7" size="small" />
                            <Text style={styles.searchLoadingText}>Searching...</Text>
                        </View>
                    )}

                    <View style={styles.list}>
                        {trainers.map((twp) => {
                            const t = twp.trainer;
                            const p = t.professional;
                            const displayName = t.user?.name || humanBusinessType(p.businessType);
                            const specialtyText = specialtiesToText(p.specialties ?? []);
                            const avatarUri = getAvatarUri(p.profilePhoto) || t.user?.avatarUrl;
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

                    {trainers.length === 0 && debouncedSearchTerm.trim() && !isSearching && (
                        <Text style={styles.noResults}>No trainers found matching "{debouncedSearchTerm}"</Text>
                    )}

                    {/* Show Load More button when not searching and there are more results */}
                    {showLoadMore && (
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
    searchContainer: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#1a1826",
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 8,
        marginBottom: 20,
    },
    searchInput: {
        flex: 1,
        fontSize: 16,
        color: "#fff",
    },
    searchLoading: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        marginVertical: 10,
    },
    searchLoadingText: {
        color: TEXT_MUTED,
        marginLeft: 8,
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
    noResults: {
        color: TEXT_MUTED,
        textAlign: "center",
        marginTop: 20,
        fontStyle: "italic",
    },
});
