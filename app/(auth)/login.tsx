// Login.tsx
import { useMutation } from "@apollo/client/react";
import {
  GoogleSignin,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  Box,
  Button,
  Divider,
  HStack,
  Icon,
  Image,
  Modal,
  ScrollView,
  Text,
  useToast,
  VStack,
} from "native-base";
import React, { useEffect, useState } from "react";
import { Platform } from "react-native";
import Svg, { ClipPath, Defs, G, Path, Rect } from "react-native-svg";
import { GOOGLE_AUTH_SIGN_IN } from "../../graphql/mutations";
import { saveTokens } from "../../lib/apollo";
import { useRuntimeConfig } from "@/lib/remoteConfig";

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
  const runtimeConfig = useRuntimeConfig();
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [googleAuthSignIn, { loading }] = useMutation(GOOGLE_AUTH_SIGN_IN);
  const [showTerms, setShowTerms] = useState(false);
  const toast = useToast();

  useEffect(() => {
    GoogleSignin.configure({
      webClientId: runtimeConfig.googleWebClientId,
      iosClientId: runtimeConfig.googleIosClientId,
      offlineAccess: true,
      forceCodeForRefreshToken: true,
    });
  }, [runtimeConfig.googleWebClientId, runtimeConfig.googleIosClientId]);

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
        data: {
          googleAuthSignIn: { accessToken: string; refreshToken: string };
        };
      };

      await saveTokens(
        data.googleAuthSignIn.accessToken,
        data.googleAuthSignIn.refreshToken
      );
      toast.show({
        title: "Welcome to TrainZilla!",
        placement: "top",
        bgColor: "emerald.500",
      });
      router.replace("/(tabs)/home");
    } catch (error: any) {
      console.log("Google Sign-In Error:", error);
      let msg = "Something went wrong";
      if (error.code === statusCodes.SIGN_IN_CANCELLED)
        msg = "Sign in was cancelled";
      else if (error.code === statusCodes.IN_PROGRESS)
        msg = "Sign in already in progress";
      else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE)
        msg = "Google Play Services not available";
      toast.show({
        title: "Sign In Failed",
        description: msg,
        placement: "top",
        bgColor: "red.500",
      });
    } finally {
      setIsSigningIn(false);
    }
  };

  const stats = [
    { label: "Active athletes", value: "12.4k" },
    { label: "Avg. adherence", value: "92%" },
    { label: "Coach response", value: "<2h" },
  ];

  const differentiators = [
    {
      title: "Adaptive coaching",
      detail: "Weekly programming recalibrated by your trainer.",
    },
    {
      title: "Intelligent fueling",
      detail: "Personalised macros linked to your training blocks.",
    },
    {
      title: "Always connected",
      detail: "DMs, nudges, and habit reminders in one feed.",
    },
  ];

  return (
    <Box flex={1} bg="#050111" safeAreaTop>
      <StatusBar style="light" />
      <LinearGradient
        colors={["#0B0E1C", "#050111"]}
        style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
      />
      <Box
        position="absolute"
        top="-120"
        right="-80"
        w="260"
        h="260"
        bg="rgba(124,58,237,0.15)"
        rounded="full"
        blurRadius={40}
      />
      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <VStack px={6} py={10} space={8}>
          <VStack alignItems="center" space={3}>
            <Image
              source={require("../../assets/logo_long.png")}
              alt="TrainZilla"
              resizeMode="contain"
              w="82"
              h="22"
            />
            <Text
              fontSize="xs"
              color="coolGray.400"
              letterSpacing="2"
              textTransform="uppercase"
            >
              Train · Fuel · Grow
            </Text>
          </VStack>

          <VStack space={3}>
            <Text fontSize="xl" fontWeight="bold" color="white" lineHeight="32">
              Precision coaching for athletes that demand more.
            </Text>
            <Text fontSize="sm" color="coolGray.300">
              Every login recalibrates your plan—sessions, meals, recovery, and
              accountability in real time.
            </Text>
          </VStack>

          <Box
            borderWidth={1}
            borderColor="rgba(255,255,255,0.08)"
            bg="#0B0F1C"
            rounded="3xl"
            p={6}
            shadow={6}
          >
            <VStack space={4}>
              <VStack>
                <Text fontSize="md" fontWeight="bold" color="white">
                  Sign in to sync with your coach
                </Text>
                <Text fontSize="xs" color="coolGray.300">
                  Unlock personalised programming, nutrition targets, biomarker
                  tracking, and messaging.
                </Text>
              </VStack>

              <GlassButton
                onPress={signInWithGoogle}
                isLoading={isSigningIn || loading}
                disabled={isSigningIn || loading}
              />

              <VStack space={3}>
                {differentiators.map((item) => (
                  <BenefitRow
                    key={item.title}
                    title={item.title}
                    detail={item.detail}
                  />
                ))}
              </VStack>
            </VStack>
          </Box>

          <VStack space={3} alignItems="center">
            <Text fontSize="xs" color="coolGray.400" textAlign="center">
              By continuing you agree to TrainZilla’s Terms of Service and
              Privacy Policy.
            </Text>
            <Button
              variant="outline"
              size="sm"
              borderColor="rgba(255,255,255,0.3)"
              _text={{
                color: "coolGray.100",
                fontSize: "xs",
                fontWeight: "600",
              }}
              onPress={() => setShowTerms(true)}
            >
              View terms & privacy
            </Button>
          </VStack>

          <HStack justifyContent="center" space={2} alignItems="center">
            <Divider flex={1} bg="rgba(255,255,255,0.15)" />
            <Text fontSize="xs" color="coolGray.500" letterSpacing="2">
              TRAINZILLA
            </Text>
            <Divider flex={1} bg="rgba(255,255,255,0.15)" />
          </HStack>
          <Text fontSize="xs" color="coolGray.500" textAlign="center">
            © {new Date().getFullYear()} TrainZilla. All rights reserved.
          </Text>
        </VStack>
      </ScrollView>

      <Modal isOpen={showTerms} onClose={() => setShowTerms(false)} size="lg">
        <Modal.Content bg="#0F111A" borderColor="rgba(255,255,255,0.1)">
          <Modal.CloseButton />
          <Modal.Header bg="#0F111A" borderColor="rgba(255,255,255,0.1)">
            <Text fontSize="lg" fontWeight="bold" color="white">
              Terms & Privacy
            </Text>
          </Modal.Header>
          <Modal.Body bg="#0F111A">
            <VStack space={3}>
              <Text fontSize="sm" color="coolGray.200">
                • Use TrainZilla responsibly and only for personal fitness
                tracking.
              </Text>
              <Text fontSize="sm" color="coolGray.200">
                • Respect your trainers and community. Harassment or abuse leads
                to account removal.
              </Text>
              <Text fontSize="sm" color="coolGray.200">
                • We store workout, nutrition, and progress data securely and
                never sell it to third parties. Review our privacy policy for
                details on retention and deletion.
              </Text>
              <Text fontSize="sm" color="coolGray.200">
                • You consent to receive service notifications, reminders, and
                trainer updates. You can opt out in settings anytime.
              </Text>
            </VStack>
          </Modal.Body>
          <Modal.Footer bg="#0F111A" borderColor="rgba(255,255,255,0.1)">
            <HStack space={3}>
              <Button
                variant="ghost"
                _text={{ color: "coolGray.300" }}
                onPress={() => setShowTerms(false)}
              >
                Close
              </Button>
            </HStack>
          </Modal.Footer>
        </Modal.Content>
      </Modal>
    </Box>
  );
}

function BenefitRow({ title, detail }: { title: string; detail: string }) {
  return (
    <HStack space={3} alignItems="flex-start">
      <Icon as={Svg} viewBox="0 0 24 24" size="4" color="emerald.300">
        <Path
          d="M10.5 17.5L5 12l1.4-1.4 4.1 4.15L17.6 7l1.4 1.4-7.5 9.1z"
          fill="currentColor"
        />
      </Icon>
      <VStack flex={1} space={1}>
        <Text fontSize="sm" color="white" fontWeight="bold">
          {title}
        </Text>
        <Text fontSize="xs" color="coolGray.300">
          {detail}
        </Text>
      </VStack>
    </HStack>
  );
}

function GlassButton({
  onPress,
  isLoading,
  disabled,
}: {
  onPress: () => void;
  isLoading: boolean;
  disabled: boolean;
}) {
  return (
    <Button
      mt={2}
      size="lg"
      rounded="xl"
      bg="rgba(255,255,255,0.05)"
      borderWidth={1}
      borderColor="rgba(255,255,255,0.2)"
      _pressed={{ bg: "rgba(255,255,255,0.08)" }}
      shadow={8}
      onPress={onPress}
      isLoading={isLoading}
      isDisabled={disabled}
    >
      <HStack alignItems="center" space={3} justifyContent="center">
        {!isLoading && !disabled && <GoogleGIcon size={18} />}
        <Text fontSize="md" fontWeight="semibold" color="white">
          {isLoading ? "Signing in…" : "Continue with Google"}
        </Text>
      </HStack>
    </Button>
  );
}
