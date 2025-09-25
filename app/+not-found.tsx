import React from 'react';
import { Link, Stack } from 'expo-router';
import {
  Box,
  VStack,
  Text,
  Button,
  Heading,
  HStack
} from "native-base";

export default function NotFoundScreen() {
  return (
      <>
        <Stack.Screen options={{
          title: 'Page Not Found',
          headerShown: false
        }} />

        <Box flex={1} bg="white" safeAreaTop>
          <VStack
              flex={1}
              justifyContent="center"
              alignItems="center"
              px={8}
              space={8}
          >
            {/* 404 Illustration */}
            <VStack alignItems="center" space={6}>
              <Box
                  w={32}
                  h={32}
                  rounded="full"
                  bg="gray.100"
                  alignItems="center"
                  justifyContent="center"
              >
                <Text fontSize="6xl" color="gray.400">
                  404
                </Text>
              </Box>

              <VStack alignItems="center" space={3}>
                <Heading size="xl" color="gray.800" textAlign="center">
                  Page Not Found
                </Heading>
                <Text
                    fontSize="md"
                    color="gray.500"
                    textAlign="center"
                    maxW="80%"
                    lineHeight="sm"
                >
                  Sorry, we could not find the page you are looking for.
                  It might have been moved or does not exist.
                </Text>
              </VStack>
            </VStack>

            {/* Action Buttons */}
            <VStack space={4} w="100%" maxW="sm">
              <Link href="/" asChild>
                <Button
                    size="lg"
                    colorScheme="primary"
                    rounded="xl"
                    py={4}
                >
                  <HStack alignItems="center" space={2}>
                    <Text color="white" fontSize="md" fontWeight="semibold">
                      Go to Home
                    </Text>
                  </HStack>
                </Button>
              </Link>

              <Button
                  size="lg"
                  variant="outline"
                  colorScheme="gray"
                  rounded="xl"
                  py={4}
                  onPress={() => {
                    // Go back in navigation history
                    if (typeof window !== 'undefined' && window.history) {
                      window.history.back();
                    }
                  }}
              >
                <Text color="gray.600" fontSize="md" fontWeight="medium">
                  Go Back
                </Text>
              </Button>
            </VStack>

            {/* Help Section */}
            <VStack alignItems="center" space={2} mt={8}>
              <Text fontSize="sm" color="gray.400" textAlign="center">
                Need help? Contact support or check our FAQ
              </Text>
              <HStack space={4}>
                <Button variant="ghost" size="sm" colorScheme="gray">
                  <Text fontSize="sm" color="gray.500">
                    Support
                  </Text>
                </Button>
                <Button variant="ghost" size="sm" colorScheme="gray">
                  <Text fontSize="sm" color="gray.500">
                    FAQ
                  </Text>
                </Button>
              </HStack>
            </VStack>
          </VStack>
        </Box>
      </>
  );
}