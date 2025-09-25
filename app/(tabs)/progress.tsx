import React, {useState} from "react";
import {
    Box,
    VStack,
    HStack,
    Text,
    ScrollView,
    Card,
    Button,
    Progress,
    Badge,
    Heading,
    Modal,
    Input,
    FormControl,
    useDisclose
} from "native-base";

// Stat Card Component
function StatCard({
                      title,
                      currentValue,
                      previousValue,
                      unit,
                      icon,
                      colorScheme = "primary",
                      trend
                  }: {
    title: string;
    currentValue: string;
    previousValue?: string;
    unit: string;
    icon: string;
    colorScheme?: string;
    trend?: "up" | "down" | "stable";
}) {
    const getTrendIcon = () => {
        switch (trend) {
            case "up":
                return "📈";
            case "down":
                return "📉";
            case "stable":
                return "➖";
            default:
                return "";
        }
    };

    const getTrendColor = () => {
        switch (trend) {
            case "up":
                return "success.500";
            case "down":
                return "red.500";
            case "stable":
                return "gray.500";
            default:
                return "gray.500";
        }
    };

    return (
        <Card flex={1} p={4} bg="white" rounded="xl" shadow={2}>
            <VStack space={2}>
                <HStack justifyContent="space-between" alignItems="center">
                    <Text fontSize="sm" color="gray.500" fontWeight="medium">
                        {title}
                    </Text>
                    <Text fontSize="xl">{icon}</Text>
                </HStack>
                <HStack alignItems="baseline" space={1}>
                    <Text fontSize="2xl" fontWeight="bold" color={`${colorScheme}.600`}>
                        {currentValue}
                    </Text>
                    <Text fontSize="sm" color="gray.400">
                        {unit}
                    </Text>
                </HStack>
                {previousValue && trend && (
                    <HStack alignItems="center" space={1}>
                        <Text fontSize="xs" color={getTrendColor()}>
                            {getTrendIcon()} vs last week: {previousValue}
                        </Text>
                    </HStack>
                )}
            </VStack>
        </Card>
    );
}

// Achievement Badge Component
function AchievementBadge({
                              title,
                              description,
                              icon,
                              earned = false,
                              progress
                          }: {
    title: string;
    description: string;
    icon: string;
    earned?: boolean;
    progress?: number;
}) {
    return (
        <Card
            p={4}
            bg={earned ? "success.50" : "gray.50"}
            rounded="xl"
            shadow={1}
            opacity={earned ? 1 : 0.7}
        >
            <VStack space={2}>
                <HStack space={3} alignItems="center">
                    <Text fontSize="2xl">{icon}</Text>
                    <VStack flex={1}>
                        <Text
                            fontSize="md"
                            fontWeight="semibold"
                            color={earned ? "success.800" : "gray.600"}
                        >
                            {title}
                        </Text>
                        <Text
                            fontSize="sm"
                            color={earned ? "success.600" : "gray.500"}
                        >
                            {description}
                        </Text>
                    </VStack>
                    {earned ? (
                        <Badge colorScheme="success" variant="solid">
                            ✓
                        </Badge>
                    ) : (
                        progress && (
                            <Text fontSize="xs" color="gray.400">
                                {progress}%
                            </Text>
                        )
                    )}
                </HStack>
                {!earned && progress && (
                    <Progress
                        value={progress}
                        colorScheme="primary"
                        size="sm"
                        rounded="full"
                    />
                )}
            </VStack>
        </Card>
    );
}

// Weight Entry Modal
function WeightEntryModal({isOpen, onClose}: { isOpen: boolean; onClose: () => void }) {
    const [weight, setWeight] = useState("");

    const handleSave = () => {
        // Here you would save the weight to your backend
        console.log("Saving weight:", weight);
        onClose();
        setWeight("");
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose}>
            <Modal.Content>
                <Modal.CloseButton/>
                <Modal.Header>Log Your Weight</Modal.Header>
                <Modal.Body>
                    <FormControl>
                        <FormControl.Label>Current Weight</FormControl.Label>
                        <Input
                            placeholder="e.g., 75.5"
                            keyboardType="decimal-pad"
                            value={weight}
                            onChangeText={setWeight}
                            InputRightElement={<Box pr={3}><Text color="gray.400">kg</Text></Box>}
                        />
                        <FormControl.HelperText>
                            Best to weigh yourself first thing in the morning
                        </FormControl.HelperText>
                    </FormControl>
                </Modal.Body>
                <Modal.Footer>
                    <Button.Group space={2}>
                        <Button variant="ghost" colorScheme="blueGray" onPress={onClose}>
                            Cancel
                        </Button>
                        <Button onPress={handleSave} isDisabled={!weight}>
                            Save Weight
                        </Button>
                    </Button.Group>
                </Modal.Footer>
            </Modal.Content>
        </Modal>
    );
}

export default function ProgressSection() {
    const {isOpen, onOpen, onClose} = useDisclose();

    const achievements = [
        {
            title: "First Workout",
            description: "Complete your first workout session",
            icon: "🏆",
            earned: true
        },
        {
            title: "Week Warrior",
            description: "Complete 5 workouts in a week",
            icon: "💪",
            earned: true
        },
        {
            title: "Consistency King",
            description: "Workout 10 days in a row",
            icon: "🔥",
            earned: false,
            progress: 70
        },
        {
            title: "Weight Goal",
            description: "Reach your target weight",
            icon: "🎯",
            earned: false,
            progress: 45
        }
    ];

    return (
        <Box flex={1} bg="gray.50" safeAreaTop>
            <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                <VStack space={6} p={6}>
                    {/* Header */}
                    <VStack space={2}>
                        <Heading size="lg" color="gray.800">
                            Your Progress
                        </Heading>
                        <Text color="gray.500" fontSize="md">
                            Track your fitness journey
                        </Text>
                    </VStack>

                    {/* Quick Stats */}
                    <VStack space={3}>
                        <HStack justifyContent="space-between" alignItems="center">
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">
                                This Week
                            </Text>
                            <Button size="sm" onPress={onOpen} colorScheme="primary">
                                + Log Weight
                            </Button>
                        </HStack>

                        <HStack space={3}>
                            <StatCard
                                title="Current Weight"
                                currentValue="78.5"
                                previousValue="79.2"
                                unit="kg"
                                icon="⚖️"
                                colorScheme="info"
                                trend="down"
                            />
                            <StatCard
                                title="BMI"
                                currentValue="24.1"
                                previousValue="24.3"
                                unit=""
                                icon="📊"
                                colorScheme="success"
                                trend="down"
                            />
                        </HStack>

                        <HStack space={3}>
                            <StatCard
                                title="Workouts"
                                currentValue="4"
                                previousValue="3"
                                unit="this week"
                                icon="💪"
                                colorScheme="purple"
                                trend="up"
                            />
                            <StatCard
                                title="Streak"
                                currentValue="12"
                                unit="days"
                                icon="🔥"
                                colorScheme="orange"
                            />
                        </HStack>
                    </VStack>

                    {/* Weight Progress Chart Placeholder */}
                    <Card p={4} bg="white" rounded="xl" shadow={2}>
                        <VStack space={4}>
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">
                                Weight Trend (Last 30 Days)
                            </Text>

                            {/* Placeholder for actual chart */}
                            <Box
                                h={40}
                                bg="gray.100"
                                rounded="lg"
                                justifyContent="center"
                                alignItems="center"
                            >
                                <VStack alignItems="center" space={2}>
                                    <Text fontSize="4xl">📈</Text>
                                    <Text fontSize="sm" color="gray.500" textAlign="center">
                                        Weight progress chart{"\n"}(Chart component goes here)
                                    </Text>
                                </VStack>
                            </Box>

                            <HStack justifyContent="space-between">
                                <VStack alignItems="center">
                                    <Text fontSize="sm" color="gray.500">Starting</Text>
                                    <Text fontSize="md" fontWeight="semibold">82.0 kg</Text>
                                </VStack>
                                <VStack alignItems="center">
                                    <Text fontSize="sm" color="gray.500">Current</Text>
                                    <Text fontSize="md" fontWeight="semibold" color="success.600">
                                        78.5 kg
                                    </Text>
                                </VStack>
                                <VStack alignItems="center">
                                    <Text fontSize="sm" color="gray.500">Goal</Text>
                                    <Text fontSize="md" fontWeight="semibold">75.0 kg</Text>
                                </VStack>
                            </HStack>
                        </VStack>
                    </Card>

                    {/* Body Measurements */}
                    <Card p={4} bg="white" rounded="xl" shadow={2}>
                        <VStack space={4}>
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">
                                Body Measurements
                            </Text>

                            <VStack space={3}>
                                <HStack justifyContent="space-between" alignItems="center">
                                    <Text fontSize="md" color="gray.600">Chest</Text>
                                    <HStack alignItems="center" space={2}>
                                        <Text fontSize="md" fontWeight="semibold">102 cm</Text>
                                        <Text fontSize="sm" color="success.500">+2cm</Text>
                                    </HStack>
                                </HStack>

                                <HStack justifyContent="space-between" alignItems="center">
                                    <Text fontSize="md" color="gray.600">Waist</Text>
                                    <HStack alignItems="center" space={2}>
                                        <Text fontSize="md" fontWeight="semibold">85 cm</Text>
                                        <Text fontSize="sm" color="success.500">-3cm</Text>
                                    </HStack>
                                </HStack>

                                <HStack justifyContent="space-between" alignItems="center">
                                    <Text fontSize="md" color="gray.600">Arms</Text>
                                    <HStack alignItems="center" space={2}>
                                        <Text fontSize="md" fontWeight="semibold">38 cm</Text>
                                        <Text fontSize="sm" color="success.500">+1cm</Text>
                                    </HStack>
                                </HStack>
                            </VStack>

                            <Button variant="outline" colorScheme="primary">
                                Update Measurements
                            </Button>
                        </VStack>
                    </Card>

                    {/* Achievements */}
                    <VStack space={3}>
                        <Text fontSize="lg" fontWeight="bold" color="gray.800">
                            Achievements
                        </Text>

                        {achievements.map((achievement, index) => (
                            <AchievementBadge key={index} {...achievement} />
                        ))}
                    </VStack>

                    {/* Goals */}
                    <Card p={4} bg="primary.50" rounded="xl" shadow={1}>
                        <VStack space={3}>
                            <HStack space={2} alignItems="center">
                                <Text fontSize="lg">🎯</Text>
                                <Text fontSize="lg" fontWeight="bold" color="primary.800">
                                    Current Goals
                                </Text>
                            </HStack>

                            <VStack space={2}>
                                <HStack justifyContent="space-between" alignItems="center">
                                    <Text fontSize="md" color="primary.700">
                                        Lose 3.5kg more
                                    </Text>
                                    <Text fontSize="sm" color="primary.600">
                                        60% complete
                                    </Text>
                                </HStack>
                                <Progress value={60} colorScheme="primary" size="sm"/>

                                <HStack justifyContent="space-between" alignItems="center" mt={2}>
                                    <Text fontSize="md" color="primary.700">
                                        Workout 5x per week
                                    </Text>
                                    <Text fontSize="sm" color="primary.600">
                                        80% complete
                                    </Text>
                                </HStack>
                                <Progress value={80} colorScheme="primary" size="sm"/>
                            </VStack>
                        </VStack>
                    </Card>

                    {/* Bottom Spacing */}
                    <Box h={6}/>
                </VStack>
            </ScrollView>

            {/* Weight Entry Modal */}
            {isOpen ? (
                <WeightEntryModal key="weight-modal" isOpen onClose={onClose} />
            ) : null}
        </Box>
    );
}