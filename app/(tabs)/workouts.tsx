import React, { useState } from "react";
import {
    Box,
    VStack,
    HStack,
    Text,
    ScrollView,
    Card,
    Button,
    Badge,
    Progress,
    Heading,
    Pressable,
    Divider,
    Avatar,
    Modal,
    useDisclose
} from "native-base";

// Workout Card Component
function WorkoutCard({
                         title,
                         duration,
                         exercises,
                         difficulty,
                         status,
                         scheduledDate,
                         completedDate,
                         onPress,
                         trainer
                     }: {
    title: string;
    duration: string;
    exercises: number;
    difficulty: "Beginner" | "Intermediate" | "Advanced";
    status: "upcoming" | "completed" | "in_progress" | "missed";
    scheduledDate?: string;
    completedDate?: string;
    onPress: () => void;
    trainer?: string;
}) {
    const getStatusBadge = () => {
        switch (status) {
            case "upcoming":
                return <Badge colorScheme="info" variant="solid">Scheduled</Badge>;
            case "completed":
                return <Badge colorScheme="success" variant="solid">✓ Completed</Badge>;
            case "in_progress":
                return <Badge colorScheme="warning" variant="solid">In Progress</Badge>;
            case "missed":
                return <Badge colorScheme="red" variant="solid">Missed</Badge>;
            default:
                return null;
        }
    };

    const getDifficultyColor = () => {
        switch (difficulty) {
            case "Beginner": return "success";
            case "Intermediate": return "warning";
            case "Advanced": return "red";
            default: return "gray";
        }
    };

    return (
        <Pressable onPress={onPress}>
            <Card p={4} bg="white" rounded="xl" shadow={2} mb={3}>
                <VStack space={3}>
                    <HStack justifyContent="space-between" alignItems="flex-start">
                        <VStack flex={1} space={1}>
                            <Text fontSize="lg" fontWeight="bold" color="gray.800">
                                {title}
                            </Text>
                            <HStack space={4} alignItems="center">
                                <HStack alignItems="center" space={1}>
                                    <Text fontSize="sm" color="gray.500">⏱️</Text>
                                    <Text fontSize="sm" color="gray.500">{duration}</Text>
                                </HStack>
                                <HStack alignItems="center" space={1}>
                                    <Text fontSize="sm" color="gray.500">💪</Text>
                                    <Text fontSize="sm" color="gray.500">{exercises} exercises</Text>
                                </HStack>
                            </HStack>
                        </VStack>
                        {getStatusBadge()}
                    </HStack>

                    <HStack space={2} alignItems="center">
                        <Badge
                            colorScheme={getDifficultyColor()}
                            variant="outline"
                            size="sm"
                        >
                            {difficulty}
                        </Badge>
                        {trainer && (
                            <HStack space={2} alignItems="center">
                                <Avatar size="xs" bg="primary.500">
                                    {trainer.charAt(0)}
                                </Avatar>
                                <Text fontSize="xs" color="gray.500">by {trainer}</Text>
                            </HStack>
                        )}
                    </HStack>

                    {scheduledDate && (
                        <Text fontSize="sm" color="gray.500">
                            📅 Scheduled: {new Date(scheduledDate).toLocaleDateString()}
                        </Text>
                    )}

                    {completedDate && (
                        <Text fontSize="sm" color="success.600">
                            ✅ Completed: {new Date(completedDate).toLocaleDateString()}
                        </Text>
                    )}

                    {status === "upcoming" && (
                        <Button size="sm" colorScheme="primary">
                            Start Workout
                        </Button>
                    )}
                </VStack>
            </Card>
        </Pressable>
    );
}

// Workout Detail Modal
function WorkoutDetailModal({
                                isOpen,
                                onClose,
                                workout
                            }: {
    isOpen: boolean;
    onClose: () => void;
    workout: any;
}) {
    if (!workout) return null;

    const exercises = [
        { name: "Push-ups", sets: 3, reps: "12-15", rest: "60s" },
        { name: "Squats", sets: 3, reps: "15-20", rest: "60s" },
        { name: "Plank", sets: 3, reps: "30-45s", rest: "45s" },
        { name: "Lunges", sets: 3, reps: "12 each leg", rest: "60s" },
        { name: "Mountain Climbers", sets: 3, reps: "20", rest: "45s" }
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} size="full">
            <Modal.Content>
                <Modal.CloseButton />
                <Modal.Header>{workout.title}</Modal.Header>
                <Modal.Body>
                    <ScrollView>
                        <VStack space={4}>
                            <Card p={4} bg="primary.50">
                                <VStack space={2}>
                                    <Text fontSize="md" fontWeight="semibold" color="primary.800">
                                        Workout Overview
                                    </Text>
                                    <HStack space={4}>
                                        <Text fontSize="sm" color="primary.600">
                                            ⏱️ {workout.duration}
                                        </Text>
                                        <Text fontSize="sm" color="primary.600">
                                            💪 {workout.exercises} exercises
                                        </Text>
                                        <Text fontSize="sm" color="primary.600">
                                            🎯 {workout.difficulty}
                                        </Text>
                                    </HStack>
                                </VStack>
                            </Card>

                            <VStack space={3}>
                                <Text fontSize="lg" fontWeight="bold">
                                    Exercises
                                </Text>
                                {exercises.map((exercise, index) => (
                                    <Card key={index} p={3} bg="gray.50">
                                        <HStack justifyContent="space-between" alignItems="center">
                                            <VStack flex={1}>
                                                <Text fontSize="md" fontWeight="semibold">
                                                    {index + 1}. {exercise.name}
                                                </Text>
                                                <Text fontSize="sm" color="gray.600">
                                                    {exercise.sets} sets × {exercise.reps}
                                                </Text>
                                            </VStack>
                                            <Text fontSize="sm" color="gray.500">
                                                Rest: {exercise.rest}
                                            </Text>
                                        </HStack>
                                    </Card>
                                ))}
                            </VStack>

                            <Card p={4} bg="warning.50">
                                <VStack space={2}>
                                    <HStack space={2} alignItems="center">
                                        <Text fontSize="lg">💡</Text>
                                        <Text fontSize="md" fontWeight="semibold" color="warning.800">
                                            Tips
                                        </Text>
                                    </HStack>
                                    <Text fontSize="sm" color="warning.700">
                                        • Warm up for 5-10 minutes before starting
                                    </Text>
                                    <Text fontSize="sm" color="warning.700">
                                        • Focus on proper form over speed
                                    </Text>
                                    <Text fontSize="sm" color="warning.700">
                                        • Stay hydrated throughout the workout
                                    </Text>
                                    <Text fontSize="sm" color="warning.700">
                                        • Cool down and stretch after completion
                                    </Text>
                                </VStack>
                            </Card>
                        </VStack>
                    </ScrollView>
                </Modal.Body>
                <Modal.Footer>
                    <Button.Group space={2}>
                        <Button variant="ghost" colorScheme="blueGray" onPress={onClose}>
                            Close
                        </Button>
                        <Button colorScheme="primary">
                            Start Workout
                        </Button>
                    </Button.Group>
                </Modal.Footer>
            </Modal.Content>
        </Modal>
    );
}

export default function Workouts() {
    const { isOpen, onOpen, onClose } = useDisclose();
    const [selectedWorkout, setSelectedWorkout] = useState(null);
    const [activeTab, setActiveTab] = useState("upcoming");

    const workouts = {
        upcoming: [
            {
                id: 1,
                title: "Full Body Strength",
                duration: "45 min",
                exercises: 6,
                difficulty: "Intermediate" as const,
                status: "upcoming" as const,
                scheduledDate: "2024-12-20",
                trainer: "Sarah"
            },
            {
                id: 2,
                title: "Cardio Blast",
                duration: "30 min",
                exercises: 5,
                difficulty: "Beginner" as const,
                status: "upcoming" as const,
                scheduledDate: "2024-12-22",
                trainer: "Mike"
            }
        ],
        completed: [
            {
                id: 3,
                title: "Upper Body Focus",
                duration: "40 min",
                exercises: 5,
                difficulty: "Advanced" as const,
                status: "completed" as const,
                completedDate: "2024-12-18",
                trainer: "Sarah"
            },
            {
                id: 4,
                title: "Core & Abs",
                duration: "25 min",
                exercises: 4,
                difficulty: "Intermediate" as const,
                status: "completed" as const,
                completedDate: "2024-12-16",
                trainer: "Mike"
            },
            {
                id: 5,
                title: "Leg Day",
                duration: "50 min",
                exercises: 6,
                difficulty: "Advanced" as const,
                status: "completed" as const,
                completedDate: "2024-12-14",
                trainer: "Sarah"
            }
        ]
    };

    const handleWorkoutPress = (workout: any) => {
        setSelectedWorkout(workout);
        onOpen();
    };

    const TabButton = ({
                           label,
                           isActive,
                           onPress,
                           count
                       }: {
        label: string;
        isActive: boolean;
        onPress: () => void;
        count: number;
    }) => (
        <Pressable flex={1} onPress={onPress}>
            <VStack
                alignItems="center"
                py={3}
                borderBottomWidth={2}
                borderBottomColor={isActive ? "primary.500" : "transparent"}
            >
                <Text
                    fontSize="md"
                    fontWeight={isActive ? "bold" : "medium"}
                    color={isActive ? "primary.600" : "gray.500"}
                >
                    {label}
                </Text>
                <Badge
                    colorScheme={isActive ? "primary" : "gray"}
                    variant="subtle"
                    size="sm"
                    mt={1}
                >
                    {count}
                </Badge>
            </VStack>
        </Pressable>
    );

    return (
        <Box flex={1} bg="gray.50" safeAreaTop>
            <VStack flex={1} space={0}>
                {/* Header */}
                <VStack px={6} py={4} bg="white" space={2}>
                    <Heading size="lg" color="gray.800">
                        Workouts
                    </Heading>
                    <Text color="gray.500" fontSize="md">
                        Your personalized training plan
                    </Text>
                </VStack>

                {/* Weekly Progress */}
                <Card mx={6} my={4} p={4} bg="white" rounded="xl" shadow={2}>
                    <VStack space={3}>
                        <HStack justifyContent="space-between" alignItems="center">
                            <Text fontSize="md" fontWeight="semibold" color="gray.800">
                                This Week{"'"}s Progress
                            </Text>
                            <Text fontSize="sm" color="primary.600">
                                4 of 5 workouts
                            </Text>
                        </HStack>
                        <Progress value={80} colorScheme="primary" size="md" rounded="full" />
                        <HStack justifyContent="space-between">
                            <Text fontSize="sm" color="gray.500">
                                🔥 4-day streak
                            </Text>
                            <Text fontSize="sm" color="gray.500">
                                💪 180 min this week
                            </Text>
                        </HStack>
                    </VStack>
                </Card>

                {/* Tabs */}
                <HStack bg="white" px={6}>
                    <TabButton
                        label="Upcoming"
                        isActive={activeTab === "upcoming"}
                        onPress={() => setActiveTab("upcoming")}
                        count={workouts.upcoming.length}
                    />
                    <TabButton
                        label="Completed"
                        isActive={activeTab === "completed"}
                        onPress={() => setActiveTab("completed")}
                        count={workouts.completed.length}
                    />
                </HStack>

                <Divider />

                {/* Workout List */}
                <ScrollView flex={1} px={6} py={4} showsVerticalScrollIndicator={false}>
                    {activeTab === "upcoming" ? (
                        <VStack space={3}>
                            {workouts.upcoming.length > 0 ? (
                                workouts.upcoming.map((workout) => (
                                    <WorkoutCard
                                        key={workout.id}
                                        {...workout}
                                        onPress={() => handleWorkoutPress(workout)}
                                    />
                                ))
                            ) : (
                                <Card p={6} bg="white" rounded="xl" alignItems="center">
                                    <VStack alignItems="center" space={3}>
                                        <Text fontSize="4xl">📅</Text>
                                        <Text fontSize="lg" fontWeight="semibold" color="gray.600">
                                            No upcoming workouts
                                        </Text>
                                        <Text fontSize="sm" color="gray.500" textAlign="center">
                                            Your trainer will schedule new workouts soon
                                        </Text>
                                    </VStack>
                                </Card>
                            )}
                        </VStack>
                    ) : (
                        <VStack space={3}>
                            {workouts.completed.map((workout) => (
                                <WorkoutCard
                                    key={workout.id}
                                    {...workout}
                                    onPress={() => handleWorkoutPress(workout)}
                                />
                            ))}
                        </VStack>
                    )}

                    {/* Quick Stats for Completed Tab */}
                    {activeTab === "completed" && (
                        <Card p={4} bg="success.50" rounded="xl" mt={4}>
                            <VStack space={3}>
                                <HStack space={2} alignItems="center">
                                    <Text fontSize="lg">🏆</Text>
                                    <Text fontSize="md" fontWeight="semibold" color="success.800">
                                        Recent Achievements
                                    </Text>
                                </HStack>
                                <VStack space={2}>
                                    <HStack justifyContent="space-between">
                                        <Text fontSize="sm" color="success.700">
                                            Total workouts completed
                                        </Text>
                                        <Text fontSize="sm" fontWeight="semibold" color="success.800">
                                            {workouts.completed.length}
                                        </Text>
                                    </HStack>
                                    <HStack justifyContent="space-between">
                                        <Text fontSize="sm" color="success.700">
                                            Total workout time
                                        </Text>
                                        <Text fontSize="sm" fontWeight="semibold" color="success.800">
                                            115 minutes
                                        </Text>
                                    </HStack>
                                    <HStack justifyContent="space-between">
                                        <Text fontSize="sm" color="success.700">
                                            Favorite difficulty
                                        </Text>
                                        <Text fontSize="sm" fontWeight="semibold" color="success.800">
                                            Intermediate
                                        </Text>
                                    </HStack>
                                </VStack>
                            </VStack>
                        </Card>
                    )}

                    {/* Bottom Spacing */}
                    <Box h={6} />
                </ScrollView>
            </VStack>

            {/* Workout Detail Modal */}
            <WorkoutDetailModal
                isOpen={isOpen}
                onClose={onClose}
                workout={selectedWorkout}
            />
        </Box>
    );
}