import React from "react";
import {
    Box,
    VStack,
    HStack,
    Text,
    ScrollView,
    Button,
    Avatar,
    Badge,
    Card,
    Progress,
    Skeleton,
    Heading,
    Divider,
    IconButton,
    Pressable
} from "native-base";
import { useQuery } from "@apollo/client/react";
import { GET_ME } from "../../graphql/queries";
import { router } from "expo-router";

// Quick Stats Card Component
function StatsCard({
                       title,
                       value,
                       subtitle,
                       icon,
                       colorScheme = "primary"
                   }: {
    title: string;
    value: string;
    subtitle?: string;
    icon: string;
    colorScheme?: string;
}) {
    return (
        <Card flex={1} p={4} bg="white" rounded="xl" shadow={2}>
            <VStack space={2}>
                <HStack justifyContent="space-between" alignItems="center">
                    <Text fontSize="sm" color="gray.500" fontWeight="medium">
                        {title}
                    </Text>
                    <Text fontSize="2xl">{icon}</Text>
                </HStack>
                <Text fontSize="2xl" fontWeight="bold" color={`${colorScheme}.600`}>
                    {value}
                </Text>
                {subtitle && (
                    <Text fontSize="xs" color="gray.400">
                        {subtitle}
                    </Text>
                )}
            </VStack>
        </Card>
    );
}

// Action Button Component
function ActionButton({
                          title,
                          subtitle,
                          icon,
                          onPress,
                          colorScheme = "primary"
                      }: {
    title: string;
    subtitle?: string;
    icon: string;
    onPress: () => void;
    colorScheme?: string;
}) {
    return (
        <Pressable onPress={onPress}>
            <Card p={4} bg="white" rounded="xl" shadow={1}>
                <HStack space={3} alignItems="center">
                    <Box
                        bg={`${colorScheme}.100`}
                        p={3}
                        rounded="full"
                    >
                        <Text fontSize="xl">{icon}</Text>
                    </Box>
                    <VStack flex={1}>
                        <Text fontSize="md" fontWeight="semibold" color="gray.800">
                            {title}
                        </Text>
                        {subtitle && (
                            <Text fontSize="sm" color="gray.500">
                                {subtitle}
                            </Text>
                        )}
                    </VStack>
                    <Text color="gray.400" fontSize="lg">›</Text>
                </HStack>
            </Card>
        </Pressable>
    );
}

export default function Home() {
    const { data, loading, error } = useQuery(GET_ME) as unknown as {
        data: {
            user: {
                name: string;
                email: string;
                isProfileCompleted: boolean;
                avatar?: string;
                stats?: {
                    currentWeight?: number;
                    workoutsThisWeek?: number;
                    streakDays?: number;
                };
                trainer?: {
                    name: string;
                    avatar?: string;
                };
                nextWorkout?: {
                    title: string;
                    scheduledAt: string;
                };
            };
        };
        loading: boolean;
        error: any;
    };

    if (loading) {
        return (
            <Box flex={1} bg="gray.50" safeAreaTop>
                <VStack p={6} space={4}>
                    <HStack space={3} alignItems="center">
                        <Skeleton size={12} rounded="full" />
                        <VStack flex={1} space={1}>
                            <Skeleton h={4} w="60%" />
                            <Skeleton h={3} w="40%" />
                        </VStack>
                    </HStack>
                    <HStack space={3}>
                        <Skeleton flex={1} h={24} rounded="xl" />
                        <Skeleton flex={1} h={24} rounded="xl" />
                    </HStack>
                    <Skeleton h={20} rounded="xl" />
                    <Skeleton h={20} rounded="xl" />
                </VStack>
            </Box>
        );
    }

    if (error) {
        return (
            <Box flex={1} justifyContent="center" alignItems="center" p={6}>
                <Text color="red.500" fontSize="lg" textAlign="center">
                    Unable to load your dashboard. Please try again.
                </Text>
                <Button mt={4} onPress={() => window.location.reload()}>
                    Retry
                </Button>
            </Box>
        );
    }

    const user = data?.user;
    const name = user?.name ?? "Athlete";
    const isProfileCompleted = user?.isProfileCompleted;
    const stats = user?.stats;
    const trainer = user?.trainer;
    const nextWorkout = user?.nextWorkout;

    return (
        <Box flex={1} bg="gray.50" safeAreaTop>
            <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                <VStack space={6} p={6}>
                    {/* Header Section */}
                    <HStack justifyContent="space-between" alignItems="center">
                        <VStack>
                            <Text fontSize="sm" color="gray.500">
                                Good morning,
                            </Text>
                            <Heading size="lg" color="gray.800">
                                {name} 👋
                            </Heading>
                        </VStack>
                        <Avatar
                            size="md"
                            source={user?.avatar ? { uri: user.avatar } : undefined}
                            bg="primary.500"
                        >
                            {name.charAt(0).toUpperCase()}
                        </Avatar>
                    </HStack>

                    {/* Profile Completion Alert */}
                    {!isProfileCompleted && (
                        <Card p={4} bg="warning.50" borderLeftWidth={4} borderLeftColor="warning.500">
                            <HStack space={3} alignItems="center">
                                <Text fontSize="xl">⚠️</Text>
                                <VStack flex={1} space={1}>
                                    <Text fontSize="md" fontWeight="semibold" color="warning.800">
                                        Complete Your Profile
                                    </Text>
                                    <Text fontSize="sm" color="warning.700">
                                        Help your trainer create the perfect plan for you
                                    </Text>
                                </VStack>
                                <Button
                                    size="sm"
                                    variant="solid"
                                    colorScheme="warning"
                                    onPress={() => router.push("/(profile)/edit-info")}
                                >
                                    Complete
                                </Button>
                            </HStack>
                        </Card>
                    )}

                    {/* Quick Stats */}
                    <VStack space={3}>
                        <Text fontSize="lg" fontWeight="bold" color="gray.800">
                            This Week
                        </Text>
                        <HStack space={3}>
                            <StatsCard
                                title="Workouts"
                                value={stats?.workoutsThisWeek?.toString() ?? "0"}
                                subtitle="This week"
                                icon="💪"
                                colorScheme="success"
                            />
                            <StatsCard
                                title="Streak"
                                value={stats?.streakDays?.toString() ?? "0"}
                                subtitle="Days"
                                icon="🔥"
                                colorScheme="orange"
                            />
                        </HStack>
                    </VStack>

                    {/* Next Workout */}
                    {nextWorkout && (
                        <VStack space={3}>
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">
                                Up Next
                            </Text>
                            <Card p={4} bg="primary.50" borderColor="primary.200" borderWidth={1}>
                                <HStack space={3} alignItems="center">
                                    <Box bg="primary.500" p={3} rounded="full">
                                        <Text color="white" fontSize="lg">🏋️</Text>
                                    </Box>
                                    <VStack flex={1}>
                                        <Text fontSize="md" fontWeight="semibold" color="primary.800">
                                            {nextWorkout.title}
                                        </Text>
                                        <Text fontSize="sm" color="primary.600">
                                            {new Date(nextWorkout.scheduledAt).toLocaleDateString()}
                                        </Text>
                                    </VStack>
                                    <Button size="sm" colorScheme="primary">
                                        Start
                                    </Button>
                                </HStack>
                            </Card>
                        </VStack>
                    )}

                    {/* Trainer Section */}
                    {trainer && (
                        <VStack space={3}>
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">
                                Your Trainer
                            </Text>
                            <Card p={4} bg="white">
                                <HStack space={3} alignItems="center">
                                    <Avatar
                                        source={trainer.avatar ? { uri: trainer.avatar } : undefined}
                                        bg="info.500"
                                        size="md"
                                    >
                                        {trainer.name.charAt(0)}
                                    </Avatar>
                                    <VStack flex={1}>
                                        <Text fontSize="md" fontWeight="semibold">
                                            {trainer.name}
                                        </Text>
                                        <Badge colorScheme="success" alignSelf="flex-start">
                                            Available
                                        </Badge>
                                    </VStack>
                                    <Button size="sm" variant="outline" colorScheme="info">
                                        Message
                                    </Button>
                                </HStack>
                            </Card>
                        </VStack>
                    )}

                    {/* Quick Actions */}
                    <VStack space={3}>
                        <Text fontSize="lg" fontWeight="bold" color="gray.800">
                            Quick Actions
                        </Text>
                        <VStack space={3}>
                            <ActionButton
                                title="Log Weight"
                                subtitle="Track your progress"
                                icon="⚖️"
                                onPress={() => router.push("/(tabs)/progress")}
                                colorScheme="info"
                            />
                            <ActionButton
                                title="View Meal Plan"
                                subtitle="Today's nutrition guide"
                                icon="🍎"
                                onPress={() => router.push("/(tabs)/nutrition")}
                                colorScheme="success"
                            />
                            <ActionButton
                                title="Workout History"
                                subtitle="See past sessions"
                                icon="📊"
                                onPress={() => router.push("/(tabs)/workouts")}
                                colorScheme="purple"
                            />
                        </VStack>
                    </VStack>

                    {/* Bottom Spacing */}
                    <Box h={6} />
                </VStack>
            </ScrollView>
        </Box>
    );
}