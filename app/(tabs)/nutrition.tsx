import React from "react";
import {
    Box,
    VStack,
    HStack,
    Text,
    ScrollView,
    Card,
    Progress,
    Badge,
    Divider,
    Heading,
    Avatar,
    Button
} from "native-base";

// Meal Card Component
function MealCard({
                      title,
                      time,
                      calories,
                      items,
                      completed = false,
                      icon
                  }: {
    title: string;
    time: string;
    calories: number;
    items: string[];
    completed?: boolean;
    icon: string;
}) {
    return (
        <Card p={4} bg="white" rounded="xl" shadow={1}>
            <VStack space={3}>
                <HStack justifyContent="space-between" alignItems="center">
                    <HStack space={3} alignItems="center">
                        <Text fontSize="2xl">{icon}</Text>
                        <VStack>
                            <Text fontSize="md" fontWeight="semibold" color="gray.800">
                                {title}
                            </Text>
                            <Text fontSize="sm" color="gray.500">
                                {time} • {calories} cal
                            </Text>
                        </VStack>
                    </HStack>
                    {completed ? (
                        <Badge colorScheme="success" variant="solid">
                            ✓ Done
                        </Badge>
                    ) : (
                        <Badge colorScheme="gray" variant="outline">
                            Pending
                        </Badge>
                    )}
                </HStack>

                <VStack space={1}>
                    {items.map((item, index) => (
                        <Text key={index} fontSize="sm" color="gray.600">
                            • {item}
                        </Text>
                    ))}
                </VStack>

                {!completed && (
                    <Button size="sm" colorScheme="primary" variant="outline">
                        Mark as Eaten
                    </Button>
                )}
            </VStack>
        </Card>
    );
}

// Nutrition Stats Component
function NutritionStats() {
    const dailyGoal = 2200;
    const consumed = 1650;
    const remaining = dailyGoal - consumed;

    return (
        <Card p={4} bg="white" rounded="xl" shadow={2}>
            <VStack space={4}>
                <HStack justifyContent="space-between" alignItems="center">
                    <Text fontSize="lg" fontWeight="bold" color="gray.800">
                        Daily Nutrition
                    </Text>
                    <Text fontSize="sm" color="gray.500">
                        Goal: {dailyGoal} cal
                    </Text>
                </HStack>

                <VStack space={2}>
                    <Progress
                        value={(consumed / dailyGoal) * 100}
                        colorScheme="success"
                        size="lg"
                        rounded="full"
                    />
                    <HStack justifyContent="space-between">
                        <Text fontSize="sm" color="gray.600">
                            Consumed: {consumed} cal
                        </Text>
                        <Text fontSize="sm" color="success.600">
                            Remaining: {remaining} cal
                        </Text>
                    </HStack>
                </VStack>

                <HStack space={4} justifyContent="space-around">
                    <VStack alignItems="center" space={1}>
                        <Text fontSize="lg" fontWeight="bold" color="info.600">
                            120g
                        </Text>
                        <Text fontSize="xs" color="gray.500">Protein</Text>
                    </VStack>
                    <VStack alignItems="center" space={1}>
                        <Text fontSize="lg" fontWeight="bold" color="warning.600">
                            180g
                        </Text>
                        <Text fontSize="xs" color="gray.500">Carbs</Text>
                    </VStack>
                    <VStack alignItems="center" space={1}>
                        <Text fontSize="lg" fontWeight="bold" color="purple.600">
                            65g
                        </Text>
                        <Text fontSize="xs" color="gray.500">Fat</Text>
                    </VStack>
                </HStack>
            </VStack>
        </Card>
    );
}

export default function Nutrition() {
    const meals = [
        {
            title: "Breakfast",
            time: "8:00 AM",
            calories: 450,
            items: ["Oatmeal with berries", "Greek yogurt", "Green tea"],
            completed: true,
            icon: "🌅"
        },
        {
            title: "Mid-Morning Snack",
            time: "10:30 AM",
            calories: 200,
            items: ["Apple with almond butter"],
            completed: true,
            icon: "🍎"
        },
        {
            title: "Lunch",
            time: "1:00 PM",
            calories: 550,
            items: ["Grilled chicken salad", "Quinoa", "Avocado", "Olive oil dressing"],
            completed: true,
            icon: "🥗"
        },
        {
            title: "Afternoon Snack",
            time: "4:00 PM",
            calories: 150,
            items: ["Mixed nuts", "Herbal tea"],
            completed: false,
            icon: "🥜"
        },
        {
            title: "Dinner",
            time: "7:30 PM",
            calories: 600,
            items: ["Salmon fillet", "Roasted vegetables", "Sweet potato", "Lemon"],
            completed: false,
            icon: "🍽️"
        }
    ];

    return (
        <Box flex={1} bg="gray.50" safeAreaTop>
            <ScrollView flex={1} showsVerticalScrollIndicator={false}>
                <VStack space={6} p={6}>
                    {/* Header */}
                    <VStack space={2}>
                        <Heading size="lg" color="gray.800">
                            Today{"'"}s Nutrition
                        </Heading>
                        <Text color="gray.500" fontSize="md">
                            Stay on track with your meal plan
                        </Text>
                    </VStack>

                    {/* Daily Stats */}
                    <NutritionStats />

                    {/* Water Intake */}
                    <Card p={4} bg="blue.50" rounded="xl" shadow={1}>
                        <HStack justifyContent="space-between" alignItems="center">
                            <HStack space={3} alignItems="center">
                                <Text fontSize="2xl">💧</Text>
                                <VStack>
                                    <Text fontSize="md" fontWeight="semibold" color="blue.800">
                                        Water Intake
                                    </Text>
                                    <Text fontSize="sm" color="blue.600">
                                        6 of 8 glasses today
                                    </Text>
                                </VStack>
                            </HStack>
                            <Button size="sm" colorScheme="blue" variant="solid">
                                + Add Glass
                            </Button>
                        </HStack>
                        <Progress
                            value={75}
                            colorScheme="blue"
                            size="sm"
                            rounded="full"
                            mt={3}
                        />
                    </Card>

                    {/* Meals */}
                    <VStack space={3}>
                        <Text fontSize="lg" fontWeight="bold" color="gray.800">
                            Today{"'"}s Meals
                        </Text>

                        {meals.map((meal, index) => (
                            <MealCard key={index} {...meal} />
                        ))}
                    </VStack>

                    {/* Tips Section */}
                    <Card p={4} bg="success.50" rounded="xl" shadow={1}>
                        <VStack space={2}>
                            <HStack space={2} alignItems="center">
                                <Text fontSize="lg">💡</Text>
                                <Text fontSize="md" fontWeight="semibold" color="success.800">
                                    Nutrition Tip
                                </Text>
                            </HStack>
                            <Text fontSize="sm" color="success.700">
                                Try to eat your largest meal earlier in the day when your metabolism is most active. This helps with better digestion and energy levels.
                            </Text>
                        </VStack>
                    </Card>

                    {/* Bottom Spacing */}
                    <Box h={6} />
                </VStack>
            </ScrollView>
        </Box>
    );
}