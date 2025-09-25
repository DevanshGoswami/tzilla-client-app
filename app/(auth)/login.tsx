// Login.tsx
import React, { useEffect, useState } from 'react';
import { Platform, Alert } from "react-native";
import {
    Box,
    VStack,
    Text,
    Image,
    Button,
    Spinner,
    HStack
} from "native-base";
import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import { useMutation } from "@apollo/client/react";
import { GOOGLE_AUTH_SIGN_IN } from "../../graphql/mutations";
import { saveTokens } from "../../lib/auth";
import { ENV } from "../../lib/env";
import { router } from "expo-router";

export default function Login() {
    const [isSigningIn, setIsSigningIn] = useState(false);
    const [googleAuthSignIn, { loading }] = useMutation(GOOGLE_AUTH_SIGN_IN);

    useEffect(() => {
        GoogleSignin.configure({
            webClientId: ENV.GOOGLE_WEB_CLIENT_ID,
            iosClientId: ENV.GOOGLE_IOS_CLIENT_ID,
            offlineAccess: true,
            forceCodeForRefreshToken: true,
        });
    }, []);

    const signInWithGoogle = async () => {
        try {
            setIsSigningIn(true);

            if (Platform.OS === 'android') {
                await GoogleSignin.hasPlayServices();
            }

            const userInfo = await GoogleSignin.signIn();
            const idToken = userInfo.data?.idToken;

            if (!idToken) {
                throw new Error('No ID token received from Google');
            }

            const { data } = await googleAuthSignIn({
                variables: { idToken },
                context: {
                    headers: {
                        'role': 'client'
                    }
                }
            }) as unknown as {
                data: {
                    googleAuthSignIn: {
                        accessToken: string;
                        refreshToken: string
                    }
                }
            };

            await saveTokens(
                data?.googleAuthSignIn?.accessToken,
                data.googleAuthSignIn.refreshToken
            );

            // Replace toast with Alert
            Alert.alert("Welcome!", "Welcome to TrainZilla!");

            router.replace("/(tabs)/home");

        } catch (error: any) {
            console.log('Google Sign-In Error:', error);

            let errorMessage = 'Something went wrong';

            if (error.code === statusCodes.SIGN_IN_CANCELLED) {
                errorMessage = 'Sign in was cancelled';
            } else if (error.code === statusCodes.IN_PROGRESS) {
                errorMessage = 'Sign in already in progress';
            } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
                errorMessage = 'Google Play Services not available';
            }

            // Replace toast with Alert
            Alert.alert("Sign In Failed", errorMessage);
        } finally {
            setIsSigningIn(false);
        }
    };

    return (
        <Box flex={1} bg="white" safeAreaTop>
            <VStack
                flex={1}
                justifyContent="center"
                alignItems="center"
                px={6}
                space={8}
            >
                {/* Logo Section */}
                <VStack alignItems="center" space={4}>
                    <Box
                        size={120}
                        rounded="2xl"
                        bg={{
                            linearGradient: {
                                colors: ['primary.400', 'primary.600'],
                                start: [0, 0],
                                end: [1, 1]
                            }
                        }}
                        alignItems="center"
                        justifyContent="center"
                    >
                        <Text fontSize="2xl" fontWeight="bold" color="white">
                            TZ
                        </Text>
                    </Box>

                    <VStack alignItems="center" space={2}>
                        <Text fontSize="3xl" fontWeight="bold" color="gray.800">
                            Welcome to TrainZilla
                        </Text>
                        <Text
                            fontSize="md"
                            color="gray.500"
                            textAlign="center"
                            maxW="80%"
                        >
                            Your personal fitness journey starts here.
                            Sign in to connect with your trainer.
                        </Text>
                    </VStack>
                </VStack>

                {/* Sign In Button */}
                <VStack space={4} w="100%" maxW="sm">
                    <Button
                        size="lg"
                        variant="solid"
                        bg="gray.800"
                        _pressed={{ bg: "gray.700" }}
                        onPress={signInWithGoogle}
                        isLoading={isSigningIn || loading}
                        isDisabled={isSigningIn || loading}
                        _loading={{ opacity: 0.8 }}
                        rounded="xl"
                        py={4}
                    >
                        <HStack alignItems="center" space={3}>
                            {!isSigningIn && !loading && (
                                <Image
                                    source={{ uri: 'https://developers.google.com/identity/images/g-logo.png' }}
                                    alt="Google"
                                    size={5}
                                />
                            )}
                            <Text color="white" fontSize="md" fontWeight="semibold">
                                {isSigningIn || loading ? "Signing in..." : "Continue with Google"}
                            </Text>
                        </HStack>
                    </Button>

                    <Text fontSize="xs" color="gray.400" textAlign="center" px={4}>
                        By continuing, you agree to our Terms of Service and Privacy Policy
                    </Text>
                </VStack>

                {/* Features Preview */}
                <VStack space={3} alignItems="center" mt={8}>
                    <Text fontSize="sm" fontWeight="semibold" color="gray.600">
                        What you will get:
                    </Text>
                    <HStack space={6}>
                        <VStack alignItems="center" space={1}>
                            <Box bg="primary.100" p={2} rounded="full">
                                <Text fontSize="lg">💪</Text>
                            </Box>
                            <Text fontSize="xs" color="gray.500">Workouts</Text>
                        </VStack>
                        <VStack alignItems="center" space={1}>
                            <Box bg="success.100" p={2} rounded="full">
                                <Text fontSize="lg">🍎</Text>
                            </Box>
                            <Text fontSize="xs" color="gray.500">Nutrition</Text>
                        </VStack>
                        <VStack alignItems="center" space={1}>
                            <Box bg="info.100" p={2} rounded="full">
                                <Text fontSize="lg">📊</Text>
                            </Box>
                            <Text fontSize="xs" color="gray.500">Progress</Text>
                        </VStack>
                    </HStack>
                </VStack>
            </VStack>
        </Box>
    );
}