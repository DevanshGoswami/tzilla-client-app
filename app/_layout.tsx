// app/_layout.tsx
import "@/lib/backHandlerShim";
import { ensureRemoteConfig } from "@/lib/remoteConfig";
import { SocketProvider } from "@/providers/SocketProvider";
import NotificationDisplay from "@/push/NotificationDisplay";
import { NotificationPermissionGate } from "@/push/NotificationPermissionGate";
import NotificationRouter from "@/push/NotificationRouter";
import PushRegistrar from "@/push/registerDevice";
import { ApolloProvider } from "@apollo/client/react";
import { LinearGradient } from "expo-linear-gradient";
import { SplashScreen, Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { NativeBaseProvider } from "native-base";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  Text as RNText,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { apollo, getTokens, onTokensChanged } from "../lib/apollo"; // <— add onTokensChanged
import { AppToastProvider } from "@/providers/AppToastProvider";

const splashLogo = require("../assets/images/splash-icon.png");
const PARTICLES = [
  { top: "18%", left: "22%" },
  { top: "32%", left: "68%" },
  { top: "55%", left: "12%" },
  { top: "70%", left: "78%" },
  { top: "42%", left: "45%" },
];

void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [token, setToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [splashAnimationStarted, setSplashAnimationStarted] = useState(false);
  const [splashHidden, setSplashHidden] = useState(false);
  const splashFade = useRef(new Animated.Value(1)).current;
  const pulse = useRef(new Animated.Value(0)).current;
  const heartbeatProgress = useRef(new Animated.Value(0)).current;
  const ringRotation = useRef(new Animated.Value(0)).current;
  const particlePulse = useRef(new Animated.Value(0)).current;
  const waveShift = useRef(new Animated.Value(0)).current;
  const pulseLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const heartbeatLoopRef = useRef<Animated.CompositeAnimation | null>(null);
  const ringLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  const [configReady, setConfigReady] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);

  const bootstrapRuntimeConfig = useCallback(() => {
    setConfigError(null);
    ensureRemoteConfig()
      .then(() => setConfigReady(true))
      .catch((err: any) => {
        console.error("[remote-config] bootstrap failed", err);
        setConfigError(err?.message || "Failed to load app configuration.");
      });
  }, []);

  useEffect(() => {
    bootstrapRuntimeConfig();
  }, [bootstrapRuntimeConfig]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoopRef.current = loop;
    loop.start();
    return () => {
      loop.stop();
    };
  }, [pulse]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(heartbeatProgress, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(heartbeatProgress, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    heartbeatLoopRef.current = loop;
    loop.start();
    return () => loop.stop();
  }, [heartbeatProgress]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(particlePulse, {
          toValue: 1,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(particlePulse, {
          toValue: 0,
          duration: 1500,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [particlePulse]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(waveShift, {
          toValue: 1,
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(waveShift, {
          toValue: 0,
          duration: 2600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [waveShift]);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(ringRotation, {
        toValue: 1,
        duration: 4500,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    ringLoopRef.current = loop;
    loop.start();
    return () => loop.stop();
  }, [ringRotation]);

  const startHideSplash = useCallback(() => {
    Animated.timing(splashFade, {
      toValue: 0,
      duration: 450,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start(async () => {
      setSplashHidden(true);
    });
  }, [splashFade]);
  useEffect(() => {
    const timeout = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, 50);
    return () => clearTimeout(timeout);
  }, []);

  // Initial read
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const { accessToken } = await getTokens();
        if (!mounted) return;
        setToken(accessToken ?? null);
      } finally {
        if (mounted) setTokenLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // React to login/logout/refresh
  useEffect(() => {
    const unsubscribe = onTokensChanged(async () => {
      const { accessToken } = await getTokens();
      setToken(accessToken ?? null);
    });
    return unsubscribe;
  }, []);

  const [appStart] = useState(() => Date.now());
  const MIN_SPLASH_DURATION = 1600;

  useEffect(() => {
    if (!configReady || tokenLoading || splashAnimationStarted) return;
    const elapsed = Date.now() - appStart;
    const delay = Math.max(0, MIN_SPLASH_DURATION - elapsed);
    const timeout = setTimeout(() => {
      setSplashAnimationStarted(true);
      pulseLoopRef.current?.stop();
      heartbeatLoopRef.current?.stop();
      ringLoopRef.current?.stop();
      startHideSplash();
    }, delay);
    return () => clearTimeout(timeout);
  }, [
    tokenLoading,
    splashAnimationStarted,
    startHideSplash,
    appStart,
    configReady,
  ]);

  const pulseScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1.05],
  });
  const heartbeatTranslate = heartbeatProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [-70, 70],
  });
  const heartbeatScaleX = heartbeatProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.8, 1.2],
  });
  const ringRotationValue = ringRotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const particleOpacity = particlePulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.3, 0.8],
  });
  const waveTranslate = waveShift.interpolate({
    inputRange: [0, 1],
    outputRange: [-30, 30],
  });

  const sharedScreens = (
    <>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
      <Stack.Screen name="(sessions)" options={{ headerShown: false }} />
      <Stack.Screen name="(trainers)" options={{ headerShown: false }} />
      <Stack.Screen name="(profile)" options={{ headerShown: false }} />
      <Stack.Screen name="(messages)" options={{ headerShown: false }} />
      <Stack.Screen name="+not-found" options={{ headerShown: false }} />
    </>
  );

  const splashLayer = !splashHidden && (
    <Animated.View style={[styles.splashOverlay, { opacity: splashFade }]}>
      <LinearGradient
        colors={["#050111", "#09041C", "#050111"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <Animated.View
        style={[
          styles.glow,
          {
            transform: [{ scale: pulseScale }],
          },
        ]}
      />
      <Animated.View
        style={[
          styles.wave,
          {
            transform: [{ translateY: waveTranslate }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.energyRing,
          {
            transform: [{ rotate: ringRotationValue }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.secondaryRing,
          {
            transform: [{ rotate: ringRotationValue }],
          },
        ]}
      />
      <Animated.View
        pointerEvents="none"
        style={[
          styles.heartbeatLine,
          {
            transform: [
              { translateX: heartbeatTranslate },
              { scaleX: heartbeatScaleX },
            ],
          },
        ]}
      />
      {PARTICLES.map((p, idx) => (
        <Animated.View
          key={`particle-${idx}`}
          style={[
            styles.particle,
            { top: p.top, left: p.left, opacity: particleOpacity },
          ]}
        />
      ))}
      <Animated.Image
        source={splashLogo}
        style={[
          styles.splashLogo,
          {
            transform: [{ scale: pulseScale }],
          },
        ]}
        resizeMode="contain"
      />
      <TextOverlay />
    </Animated.View>
  );

  if (!configReady) {
    return (
      <>
        <StatusBar style="dark" />
        <View style={styles.configGate}>
          <ActivityIndicator size="large" color="#fff" />
          <RNText style={styles.configMessage}>
            {configError ? configError : "Preparing your experience..."}
          </RNText>
          {configError ? (
            <TouchableOpacity
              style={styles.retryButton}
              onPress={bootstrapRuntimeConfig}
            >
              <RNText style={styles.retryText}>Retry</RNText>
            </TouchableOpacity>
          ) : null}
        </View>
        {splashLayer}
      </>
    );
  }

  return (
    <>
      <StatusBar style="dark" />
      <SafeAreaProvider>
        <NativeBaseProvider>
          <AppToastProvider>
          <NotificationPermissionGate />
          <ApolloProvider client={apollo}>
            {token ? (
              <>
                <PushRegistrar />
                <NotificationRouter />
                <NotificationDisplay />
              </>
            ) : null}
            {token ? (
              // key forces a clean remount when auth flips → fresh socket connect
              <SocketProvider token={token} key={`sock-auth-1`}>
                <Stack screenOptions={{ headerShown: false }}>
                  {sharedScreens}
                </Stack>
              </SocketProvider>
            ) : (
              <Stack screenOptions={{ headerShown: false }} key={`sock-auth-0`}>
                {sharedScreens}
              </Stack>
            )}
          </ApolloProvider>
          </AppToastProvider>
        </NativeBaseProvider>
      </SafeAreaProvider>
      {splashLayer}
    </>
  );
}

function TextOverlay() {
  return (
    <View style={styles.textWrapper}>
      <RNText style={styles.splashSubtitle}>TRAIN · FUEL · GROW</RNText>
      <RNText style={styles.splashSubtitleSmall}>
        Fitness engineered for humans
      </RNText>
    </View>
  );
}

const styles = StyleSheet.create({
  splashOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "#050111",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  glow: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: "rgba(124,58,237,0.25)",
    shadowColor: "#7C3AED",
    shadowOpacity: 0.8,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  splashTitle: {
    color: "#FFFFFF",
    fontSize: 28,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  splashSubtitle: {
    color: "#A5A1C2",
    fontSize: 12,
    letterSpacing: 4,
    textTransform: "uppercase",
  },
  splashSubtitleSmall: {
    color: "#7C8AA4",
    fontSize: 10,
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  textWrapper: {
    alignItems: "center",
    gap: 6,
  },
  splashLogo: {
    width: 110,
    height: 110,
    marginBottom: 26,
  },
  energyRing: {
    position: "absolute",
    width: 260,
    height: 260,
    borderRadius: 130,
    borderWidth: 1.5,
    borderColor: "rgba(196,181,253,0.4)",
    shadowColor: "#7C3AED",
    shadowOpacity: 0.6,
    shadowRadius: 30,
  },
  secondaryRing: {
    position: "absolute",
    width: 320,
    height: 320,
    borderRadius: 160,
    borderWidth: 1,
    borderColor: "rgba(98,0,234,0.25)",
  },
  wave: {
    position: "absolute",
    width: 360,
    height: 360,
    borderRadius: 180,
    backgroundColor: "rgba(14,165,233,0.08)",
    top: "35%",
    transform: [{ rotate: "45deg" }],
    shadowColor: "#0EA5E9",
    shadowOpacity: 0.4,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 0 },
  },
  heartbeatLine: {
    position: "absolute",
    width: 220,
    height: 2,
    backgroundColor: "rgba(255,255,255,0.35)",
    top: "40%",
    borderRadius: 999,
    shadowColor: "#A855F7",
    shadowOpacity: 0.7,
    shadowRadius: 10,
  },
  particle: {
    position: "absolute",
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.9)",
    shadowColor: "#7C3AED",
    shadowOpacity: 0.6,
    shadowRadius: 6,
  },
  configGate: {
    flex: 1,
    backgroundColor: "#050111",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  configMessage: {
    color: "#E2E8F0",
    fontSize: 14,
    textAlign: "center",
    marginTop: 16,
  },
  retryButton: {
    marginTop: 20,
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
  },
  retryText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
});
