import React, { useEffect, useMemo, useState } from "react";
import {
    Box,
    VStack,
    HStack,
    Text,
    ScrollView,
    Avatar,
    Badge,
    Button,
    Skeleton,
    Pressable,
    Card,
    IconButton,
    ArrowBackIcon,
} from "native-base";
import { useQuery } from "@apollo/client/react";
import { router } from "expo-router";

import { TRAINERS_WITH_PLANS } from "@/graphql/queries";
import { useSelectedTrainerStore, TrainerWithPlans } from "@/store/selectedTrainerStore";
import { getTokens, onTokensChanged } from "@/lib/apollo";
import { resolveS3KeyToUrl, isFullUrl } from "@/lib/media";

const PAGE_SIZE = 20;

export default function ViewAllTrainers() {
    const [pageNumber, setPageNumber] = useState(1);
    const [token, setToken] = useState<string | null>(null);
    const [photoMap, setPhotoMap] = useState<Record<string, string>>({});
    const { setSelected } = useSelectedTrainerStore();

    const { data, loading, error, fetchMore, refetch } = useQuery(TRAINERS_WITH_PLANS, {
        variables: { pageNumber: 1, pageSize: PAGE_SIZE },
        fetchPolicy: "cache-and-network",
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

    return (
        <Box flex={1} bg="gray.50" safeAreaTop>
            <VStack flex={1}>
                {/* Header */}
                <HStack px={4} py={3} alignItems="center" justifyContent="space-between">
                    <HStack space={2} alignItems="center">
                        <IconButton
                            variant="ghost"
                            borderRadius="full"
                            onPress={() => router.back()}
                            icon={<ArrowBackIcon color="gray.800" />}
                            accessibilityLabel="Go back"
                        />
                        <Text fontSize="xl" fontWeight="bold" color="gray.800">
                            Explore Trainers
                        </Text>
                    </HStack>
                    {/* You can add a filter button later */}
                </HStack>

                {loading && !data ? (
                    <VStack space={3} px={4}>
                        {[...Array(5)].map((_, i) => (
                            <Skeleton key={i} h="20" rounded="xl" />
                        ))}
                    </VStack>
                ) : error ? (
                    <VStack flex={1} justifyContent="center" alignItems="center" px={4}>
                        <Text color="red.500" textAlign="center">
                            Unable to load trainers.
                        </Text>
                        <Button mt={4} onPress={() => refetch()}>
                            Retry
                        </Button>
                    </VStack>
                ) : (
                    <ScrollView flex={1} px={4}>
                        <VStack space={3} mb={4}>
                            {trainers.map((twp) => {
                                const t = twp.trainer;
                                const p = t.professional;
                                const primarySpec = p.specialties?.[0];
                                const specialtyText = specialtiesToText(p.specialties ?? []);
                                const avatarUri = getAvatarUri(p.profilePhoto);
                                const cityCountry = [t.contact?.city, t.contact?.country]
                                    .filter(Boolean)
                                    .join(", ");

                                return (
                                    <Pressable
                                        key={t._id}
                                        onPress={() => {
                                            setSelected(twp);
                                            // router param uses trainer.userId as trainerId
                                            router.push({
                                                pathname: "/(trainers)/profile/[trainerId]",
                                                params: { trainerId: t.userId },
                                            });
                                        }}
                                    >
                                        <Card p={4} bg="white" shadow={1} rounded="xl">
                                            <HStack space={3}>
                                                <Avatar
                                                    size="lg"
                                                    source={avatarUri ? { uri: avatarUri } : undefined}
                                                    bg="primary.500"
                                                >
                                                    {primarySpec ? primarySpec[0] : "T"}
                                                </Avatar>

                                                <VStack flex={1} space={1}>
                                                    <HStack justifyContent="space-between">
                                                        <VStack flex={1}>
                                                            <Text
                                                                fontWeight="semibold"
                                                                fontSize="md"
                                                                color="gray.800"
                                                            >
                                                                {humanBusinessType(p.businessType)}
                                                            </Text>
                                                            {cityCountry ? (
                                                                <Text
                                                                    fontSize="xs"
                                                                    color="gray.500"
                                                                >
                                                                    {cityCountry}
                                                                </Text>
                                                            ) : null}
                                                        </VStack>
                                                        <Badge
                                                            colorScheme="purple"
                                                            variant="subtle"
                                                            alignSelf="flex-start"
                                                        >
                                                            {p.yearsOfExperience} yrs
                                                        </Badge>
                                                    </HStack>

                                                    {specialtyText ? (
                                                        <Text
                                                            fontSize="xs"
                                                            color="gray.600"
                                                            numberOfLines={1}
                                                        >
                                                            {specialtyText}
                                                        </Text>
                                                    ) : null}

                                                    {t.availability?.preferredTime ? (
                                                        <Text fontSize="xs" color="gray.400">
                                                            Prefers{" "}
                                                            {t.availability.preferredTime
                                                                .toLowerCase()
                                                                .replace(/_/g, " ")}{" "}
                                                            • {t.availability.timezone}
                                                        </Text>
                                                    ) : null}
                                                </VStack>
                                            </HStack>
                                        </Card>
                                    </Pressable>
                                );
                            })}

                            {trainers.length >= PAGE_SIZE && (
                                <Button
                                    mt={2}
                                    mb={8}
                                    variant="outline"
                                    isLoading={loading}
                                    onPress={handleLoadMore}
                                >
                                    Load more
                                </Button>
                            )}
                        </VStack>
                    </ScrollView>
                )}
            </VStack>
        </Box>
    );
}
