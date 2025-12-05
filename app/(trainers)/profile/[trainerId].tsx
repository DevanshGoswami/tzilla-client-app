import React, { useEffect, useMemo, useState } from "react";
import {
    Box,
    VStack,
    HStack,
    Text,
    Avatar,
    Badge,
    ScrollView,
    Button,
    Card,
    Divider,
    Skeleton,
    IconButton,
    ArrowBackIcon,
} from "native-base";
import { useLocalSearchParams, router } from "expo-router";
import { useMutation, useQuery } from "@apollo/client/react";

import { useSelectedTrainerStore } from "@/store/selectedTrainerStore";
import { GET_ME, ACTIVE_CLIENT_SUBSCRIPTIONS_V2,
    REQUEST_INVITATION, } from "@/graphql/queries";
import { Alert } from "react-native";
import { getTokens, onTokensChanged } from "@/lib/apollo";
import { resolveS3KeyToUrl, isFullUrl } from "@/lib/media";
import AsyncStorage from "@react-native-async-storage/async-storage";

export default function TrainerProfileScreen() {
    const { trainerId } = useLocalSearchParams<{ trainerId: string }>();
    const { selected } = useSelectedTrainerStore();

    const trainerWithPlans = selected;
    const [token, setToken] = useState<string | null>(null);
    const [imageMap, setImageMap] = useState<Record<string, string>>({});
    const [invitationSent, setInvitationSent] = useState(false);
    const trainerUserId = trainerWithPlans?.trainer.userId ?? (trainerId as string | undefined);
    const invitationStorageKey = trainerUserId ? `trainer_invitation_sent_${trainerUserId}` : null;

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

    useEffect(() => {
        if (!invitationStorageKey) {
            setInvitationSent(false);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const stored = await AsyncStorage.getItem(invitationStorageKey);
                if (!cancelled) setInvitationSent(!!stored);
            } catch {
                if (!cancelled) setInvitationSent(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [invitationStorageKey]);

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

    const [requestInvitation, { loading: inviteLoading }] = useMutation(
        REQUEST_INVITATION,
        {
            onCompleted: async () => {
                await markInvitationSent();
                Alert.alert("Invitation sent", "We’ve notified the trainer. You’ll hear back once they review your request.");
            },
            onError: () => {
                Alert.alert("Error!", "Error while fetching trainer details");
            },
        }
    );

    if (!trainerWithPlans) {
        return (
            <Box flex={1} bg="gray.50" safeAreaTop justifyContent="center" alignItems="center">
                <Text color="gray.600" textAlign="center" px={8}>
                    Trainer details not available. Please go back to the list and try again.
                </Text>
                <Button mt={4} onPress={() => router.back()}>
                    Go back
                </Button>
            </Box>
        );
    }

    const t = trainerWithPlans.trainer;
    const p = t.professional;
    const markInvitationSent = async () => {
        if (!invitationStorageKey) return;
        setInvitationSent(true);
        try {
            await AsyncStorage.setItem(invitationStorageKey, new Date().toISOString());
        } catch {
            // best-effort cache; failures only impact UI state
        }
    };

    const getImageUri = (value?: string | null) => {
        if (!value) return undefined;
        if (isFullUrl(value)) return value;
        return imageMap[value];
    };

    const availability = t.availability;
    const plans = trainerWithPlans.subscriptionPlans;
    const profileAvatarUri = getImageUri(p.profilePhoto);

    const humanBusinessType = (bt?: string | null) => {
        if (!bt) return "Trainer";
        return bt.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase());
    };

    const onRequestInvitation = () => {
        if (invitationSent) return;
        if (!clientEmail) {
            showSnackbar({
                severity: "error",
                message: "Missing your email. Please update your profile first.",
            });
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

    return (
        <Box flex={1} bg="gray.50" safeAreaTop>
            <ScrollView flex={1}>
                <VStack space={4} px={4} pb={8}>
                    <HStack mt={2} alignItems="center" space={3}>
                        <IconButton
                            variant="ghost"
                            borderRadius="full"
                            onPress={() => router.back()}
                            icon={<ArrowBackIcon color="gray.800" />}
                            accessibilityLabel="Go back"
                        />
                        <VStack>
                            <Text fontSize="xl" fontWeight="bold" color="gray.800">
                                Trainer Profile
                            </Text>
                            <Text fontSize="xs" color="gray.500">
                                Learn more about this coach
                            </Text>
                        </VStack>
                    </HStack>
                    {/* Header / hero */}
                    <HStack mt={4} space={3} alignItems="center">
                        <Avatar
                            size="xl"
                            bg="primary.500"
                            source={profileAvatarUri ? { uri: profileAvatarUri } : undefined}
                        >
                            {p.businessType?.[0] ?? "T"}
                        </Avatar>
                        <VStack flex={1} space={1}>
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">
                                {humanBusinessType(p.businessType)}
                            </Text>
                            {cityCountry ? (
                                <Text fontSize="xs" color="gray.500">
                                    {cityCountry}
                                </Text>
                            ) : null}
                            <HStack space={2} mt={1}>
                                <Badge colorScheme="purple" variant="subtle">
                                    {p.yearsOfExperience} yrs experience
                                </Badge>
                                {availability?.preferredTime ? (
                                    <Badge colorScheme="primary" variant="outline">
                                        {availability.preferredTime.toLowerCase().replace(/_/g, " ")}
                                    </Badge>
                                ) : null}
                            </HStack>
                        </VStack>
                    </HStack>

                    {/* Subscription / Invitation state */}
                    <Card p={4} bg="white" rounded="xl" shadow={1}>
                        {meLoading || activeSubLoading ? (
                            <Skeleton h={6} w="70%" rounded="lg" />
                        ) : hasActiveSubscription ? (
                            <VStack space={2}>
                                <Text fontWeight="semibold" color="green.600">
                                    You already have an active subscription with this trainer.
                                </Text>
                                <Text fontSize="xs" color="gray.500">
                                    You can manage your subscription from the Subscriptions section.
                                </Text>
                            </VStack>
                        ) : (
                            <VStack space={3}>
                                <Text fontWeight="semibold" color="gray.800">
                                    Work with this trainer
                                </Text>
                                <Text fontSize="xs" color="gray.500">
                                    Send a request to this trainer. Once they accept, you’ll be able to
                                    subscribe to one of their plans and start training.
                                </Text>
                                <Button
                                    mt={1}
                                    onPress={onRequestInvitation}
                                    isLoading={inviteLoading}
                                    isDisabled={inviteLoading || invitationSent}
                                    colorScheme="primary"
                                >
                                    {invitationSent ? "Invitation Sent" : "Request Invitation"}
                                </Button>
                                {invitationSent ? (
                                    <Text fontSize="xs" color="green.600">
                                        We’ll notify you once the trainer responds.
                                    </Text>
                                ) : null}
                            </VStack>
                        )}
                    </Card>

                    {/* About */}
                    {p.bio ? (
                        <Card p={4} bg="white" rounded="xl" shadow={1}>
                            <Text fontWeight="semibold" mb={1} color="gray.800">
                                About
                            </Text>
                            <Text fontSize="sm" color="gray.600">
                                {p.bio}
                            </Text>
                        </Card>
                    ) : null}

                    {/* Specialties & languages */}
                    <HStack space={3}>
                        {p.specialties?.length ? (
                            <Card flex={1} p={4} bg="white" rounded="xl" shadow={1}>
                                <Text fontWeight="semibold" mb={2} color="gray.800">
                                    Specialties
                                </Text>
                                <HStack flexWrap="wrap" space={1}>
                                    {p.specialties.map((s) => (
                                        <Badge
                                            key={s}
                                            variant="subtle"
                                            colorScheme="purple"
                                            mb={1}
                                        >
                                            {s.replace(/_/g, " ").toLowerCase()}
                                        </Badge>
                                    ))}
                                </HStack>
                            </Card>
                        ) : null}

                        {p.languages?.length ? (
                            <Card flex={1} p={4} bg="white" rounded="xl" shadow={1}>
                                <Text fontWeight="semibold" mb={2} color="gray.800">
                                    Languages
                                </Text>
                                <HStack flexWrap="wrap" space={1}>
                                    {p.languages.map((lang) => (
                                        <Badge key={lang} variant="outline" mb={1}>
                                            {lang}
                                        </Badge>
                                    ))}
                                </HStack>
                            </Card>
                        ) : null}
                    </HStack>

                    {/* Availability */}
                    {availability ? (
                        <Card p={4} bg="white" rounded="xl" shadow={1}>
                            <Text fontWeight="semibold" mb={2} color="gray.800">
                                Availability
                            </Text>
                            <Text fontSize="sm" color="gray.600">
                                {availability.checkIn} - {availability.checkOut} (
                                {availability.timezone})
                            </Text>
                            <Text fontSize="xs" color="gray.400" mt={1}>
                                {availability.daysAvailable.join(" • ")}
                            </Text>
                        </Card>
                    ) : null}

                    {/* Plans */}
                    {plans?.length ? (
                        <Card p={4} bg="white" rounded="xl" shadow={1}>
                            <Text fontWeight="semibold" mb={2} color="gray.800">
                                Subscription Plans
                            </Text>
                            <VStack space={3}>
                                {plans.map((pl) => (
                                    <VStack key={pl._id} space={1}>
                                        <HStack justifyContent="space-between" alignItems="center">
                                            <Text fontWeight="semibold" color="gray.800">
                                                {pl.name}
                                            </Text>
                                            <Text fontWeight="bold" color="primary.600">
                                                ₹{pl.amount} / {pl.interval} ×{" "}
                                                {pl.period.toLowerCase()}
                                            </Text>
                                        </HStack>
                                        {pl.description ? (
                                            <Text fontSize="xs" color="gray.600">
                                                {pl.description}
                                            </Text>
                                        ) : null}
                                        {pl.meta && (pl.meta.freeTrialSessions || pl.meta.sessionsIncludedPerMonth) ? (
                                            <HStack space={2} mt={1}>
                                                {pl.meta.freeTrialSessions ? (
                                                    <Badge colorScheme="green" variant="subtle">
                                                        {pl.meta.freeTrialSessions} trial sessions
                                                    </Badge>
                                                ) : null}
                                                {pl.meta.sessionsIncludedPerMonth ? (
                                                    <Badge colorScheme="blue" variant="outline">
                                                        {pl.meta.sessionsIncludedPerMonth} / month
                                                    </Badge>
                                                ) : null}
                                            </HStack>
                                        ) : null}
                                        <Divider my={2} />
                                    </VStack>
                                ))}
                            </VStack>
                        </Card>
                    ) : null}

                    {/* Transformations */}
                    {t.transformations?.length ? (
                        <Card p={4} bg="white" rounded="xl" shadow={1}>
                            <Text fontWeight="semibold" mb={2} color="gray.800">
                                Transformations
                            </Text>
                            <VStack space={3}>
                                {t.transformations.map((tr, idx) => (
                                    <VStack key={idx} space={1}>
                                        <Text fontWeight="semibold" color="gray.800">
                                            {tr.clientName} • {tr.timeline}
                                        </Text>
                                        <Text fontSize="xs" color="gray.500">
                                            Goal: {tr.transformationGoal.replace(/_/g, " ")}
                                        </Text>
                                        {tr.resultsAndAchievements?.length ? (
                                            <VStack mt={1} space={1}>
                                                {tr.resultsAndAchievements.map((r, i) => (
                                                    <Text key={i} fontSize="xs" color="gray.600">
                                                        • {r}
                                                    </Text>
                                                ))}
                                            </VStack>
                                        ) : null}
                                        <Divider my={2} />
                                    </VStack>
                                ))}
                            </VStack>
                        </Card>
                    ) : null}

                    {/* Testimonials */}
                    {t.testimonials?.length ? (
                        <Card p={4} bg="white" rounded="xl" shadow={1}>
                            <Text fontWeight="semibold" mb={2} color="gray.800">
                                Testimonials
                            </Text>
                            <VStack space={3}>
                                {t.testimonials.map((ts, idx) => (
                                    <HStack key={idx} space={3} alignItems="flex-start">
                                        <Avatar
                                            size="sm"
                                            bg="gray.300"
                                            source={( () => {
                                                const uri = getImageUri(ts.profileImage);
                                                return uri ? { uri } : undefined;
                                            })()}
                                        >
                                            {ts.clientName[0]}
                                        </Avatar>
                                        <VStack flex={1}>
                                            <Text fontWeight="semibold" fontSize="sm" color="gray.800">
                                                {ts.clientName}
                                            </Text>
                                            <Text fontSize="xs" color="gray.600">
                                                {ts.note}
                                            </Text>
                                        </VStack>
                                    </HStack>
                                ))}
                            </VStack>
                        </Card>
                    ) : null}
                </VStack>
            </ScrollView>
        </Box>
    );
}
