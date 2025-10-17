// Login.tsx
import React, { useEffect, useState } from "react";
import { Platform, Alert } from "react-native";
import {
    Box,
    VStack,
    Text,
    Image,
    Button,
    HStack,
    useColorModeValue,
    Divider,
} from "native-base";
import { StatusBar } from "expo-status-bar";
import { GoogleSignin, statusCodes } from "@react-native-google-signin/google-signin";
import { useMutation } from "@apollo/client/react";
import { GOOGLE_AUTH_SIGN_IN } from "../../graphql/mutations";
import { saveTokens } from "../../lib/auth";
import { ENV } from "../../lib/env";
import { router } from "expo-router";
import Svg, { Path, G, Defs, ClipPath, Rect } from "react-native-svg";

function GoogleGIcon({ size = 20 }: { size?: number }) {
    // Official multicolor "G" in SVG (no network needed, renders instantly)
    return (
        <Svg width={size} height={size} viewBox="0 0 48 48">
            <Defs>
                <ClipPath id="a">
                    <Rect width="48" height="48" rx="0" ry="0" />
                </ClipPath>
            </Defs>
            <G clipPath="url(#a)">
                <Path
                    d="M47.532 24.552c0-1.642-.147-3.214-.42-4.716H24.48v8.92h12.94c-.56 3.022-2.26 5.584-4.83 7.302v6.06h7.81c4.57-4.21 7.14-10.42 7.14-17.566Z"
                    fill="#4285F4"
                />
                <Path
                    d="M24.48 48c6.48 0 11.92-2.144 15.894-5.878l-7.81-6.06c-2.164 1.45-4.93 2.31-8.084 2.31-6.216 0-11.48-4.194-13.364-9.836H3.07v6.203C7.01 43.27 15.06 48 24.48 48Z"
                    fill="#34A853"
                />
                <Path
                    d="M11.116 28.536A14.52 14.52 0 0 1 10.36 24c0-1.58.27-3.11.756-4.536V13.26H3.07A23.515 23.515 0 0 0 .96 24c0 3.73.9 7.25 2.51 10.74l7.646-6.204Z"
                    fill="#FBBC05"
                />
                <Path
                    d="M24.48 9.52c3.526 0 6.69 1.215 9.18 3.6l6.89-6.89C36.38 2.18 31.04 0 24.48 0 15.06 0 7.01 4.73 3.47 12.74l7.646 6.724C13 13.714 18.264 9.52 24.48 9.52Z"
                    fill="#EA4335"
                />
            </G>
        </Svg>
    );
}

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
            if (Platform.OS === "android") {
                await GoogleSignin.hasPlayServices();
            }
            const userInfo = await GoogleSignin.signIn();
            const idToken = userInfo.data?.idToken;
            if (!idToken) throw new Error("No ID token received from Google");

            const { data } = (await googleAuthSignIn({
                variables: { idToken },
                context: { headers: { role: "client" } },
            })) as unknown as {
                data: { googleAuthSignIn: { accessToken: string; refreshToken: string } };
            };

            await saveTokens(data.googleAuthSignIn.accessToken, data.googleAuthSignIn.refreshToken);
            Alert.alert("Welcome!", "Welcome to TrainZilla!");
            router.replace("/(tabs)/home");
        } catch (error: any) {
            console.log("Google Sign-In Error:", error);
            let msg = "Something went wrong";
            if (error.code === statusCodes.SIGN_IN_CANCELLED) msg = "Sign in was cancelled";
            else if (error.code === statusCodes.IN_PROGRESS) msg = "Sign in already in progress";
            else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) msg = "Google Play Services not available";
            Alert.alert("Sign In Failed", msg);
        } finally {
            setIsSigningIn(false);
        }
    };

    // Themed tokens (UI only)
    const bgGrad = {
        linearGradient: {
            colors: ["#F9FAFB", "#F3F4F6", "#FFFFFF"],
            start: [0, 0],
            end: [0, 1],
        },
    };
    const headline = useColorModeValue("#0F172A", "#F8FAFC");
    const subtext = useColorModeValue("#475569", "#CBD5E1");
    const cardBorder = useColorModeValue("#E5E7EB", "#1F2937");

    return (
        <Box flex={1} bg={bgGrad} safeAreaTop>
            <StatusBar style="dark" />

            {/* Subtle brand accent bar */}
            <Box position="absolute" top={0} left={0} right={0} h={2} bg="#7C3AED" opacity={0.8} />

            <VStack flex={1} justifyContent="center" alignItems="center" px={6} space={8}>
                {/* Brand Logo (local asset) */}
                <Image
                    source={require("../../assets/logo_long.png")}
                    alt="TrainZilla"
                    resizeMode="contain"
                    w="80"
                    h="18"
                />

                {/* Tagline */}
                <VStack alignItems="center" space={2} px={2}>
                    <Text fontSize="2xl" fontWeight="bold" color={headline} letterSpacing="0.2">
                        Welcome Back
                    </Text>
                    <Text fontSize="md" textAlign="center" color={subtext} maxW="85%" lineHeight="lg">
                        Train smarter. Eat better. Track progress. Sign in to continue your journey.
                    </Text>
                </VStack>

                {/* Sign-in Card */}
                <VStack
                    w="100%"
                    maxW="md"
                    bg="white"
                    borderWidth={1}
                    borderColor={cardBorder}
                    rounded="2xl"
                    shadow={7}
                    px={{ base: 5, md: 7 }}
                    py={{ base: 6, md: 7 }}
                    space={5}
                >
                    {/* Features row (subtle, grown-up) */}
                    <HStack
                        alignSelf="center"
                        space={4}
                        px={3}
                        py={2}
                        bg="#F8FAFC"
                        rounded="full"
                        borderWidth={1}
                        borderColor="#E2E8F0"
                    >
                        <Text fontSize="xs" color={subtext}>Workouts</Text>
                        <Divider orientation="vertical" bg="#E2E8F0" />
                        <Text fontSize="xs" color={subtext}>Nutrition</Text>
                        <Divider orientation="vertical" bg="#E2E8F0" />
                        <Text fontSize="xs" color={subtext}>Progress</Text>
                    </HStack>

                    {/* Google button — white, crisp, brand-correct */}
                    <Button
                        size="lg"
                        bg="white"
                        variant="outline"
                        borderColor="#E5E7EB"
                        borderWidth={1.5}
                        rounded="xl"
                        py={4}
                        w="100%"
                        _pressed={{ bg: "#F3F4F6" }}
                        shadow={2}
                        onPress={signInWithGoogle}
                        isLoading={isSigningIn || loading}
                        isDisabled={isSigningIn || loading}
                    >
                        <HStack alignItems="center" space={3} justifyContent="center">
                            {!isSigningIn && !loading && <GoogleGIcon size={18} />}
                            <Text fontSize="md" fontWeight="medium" color="#111827">
                                {isSigningIn || loading ? "Signing in..." : "Sign in with Google"}
                            </Text>
                        </HStack>
                    </Button>

                    <Text fontSize="xs" color={subtext} textAlign="center">
                        By continuing, you agree to our <Text underline>Terms of Service</Text> and{" "}
                        <Text underline>Privacy Policy</Text>.
                    </Text>
                </VStack>

                {/* Footer */}
                <Text fontSize="xs" color={subtext}>
                    © {new Date().getFullYear()} TrainZilla. All rights reserved.
                </Text>
            </VStack>
        </Box>
    );
}
