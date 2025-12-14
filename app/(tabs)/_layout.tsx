import { Tabs, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, TouchableOpacity, View } from "react-native";
import { useEnsureFitnessProfile } from "@/hooks/useEnsureFitnessProfile";
import { Image, Text } from "react-native";
import logoLong from "../../assets/logo_long.png";


export default function TabsLayout() {

    const { loading } = useEnsureFitnessProfile();

    if (loading) {
        return (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <ActivityIndicator size="large" />
            </View>
        );
    }

    // Shim for libs still calling BackHandler.removeEventListener
    // if (
    //     Platform.OS === 'android' &&
    //     typeof (BackHandler as any).removeEventListener !== 'function'
    // ) {
    //     const _add = BackHandler.addEventListener.bind(BackHandler);
    //     const _map = new Map<(...args: any[]) => any, { remove: () => void }>();
    //
    //     BackHandler.addEventListener = (eventName: any, handler: any) => {
    //         const sub = _add(eventName, handler);
    //         _map.set(handler, sub);
    //         return sub;
    //     };
    //
    //     // @ts-ignore legacy signature
    //     (BackHandler as any).removeEventListener = (_eventName: any, handler: any) => {
    //         const sub = _map.get(handler);
    //         if (sub && typeof sub.remove === 'function') sub.remove();
    //         _map.delete(handler);
    //     };
    // }

    const tabIcon =
        (icon: keyof typeof Ionicons.glyphMap) =>
        ({ color, focused }: { color: string; focused: boolean }) => (
            <View
                style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: focused ? "rgba(124,58,237,0.25)" : "transparent",
                }}
            >
                <Ionicons name={icon} size={20} color={color} />
            </View>
        );

    return (
        <Tabs
            screenOptions={{
                tabBarActiveTintColor: "#FFFFFF",
                tabBarInactiveTintColor: "#7C7C8A",
                tabBarStyle: {
                    paddingBottom: 10,
                    paddingTop: 10,
                    height: 70,
                    backgroundColor: "#0F111A",
                    borderTopWidth: 1,
                    borderTopColor: "rgba(255,255,255,0.08)",
                },
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: "600",
                },
                headerStyle: {
                    backgroundColor: "#05060A",
                },
                headerShadowVisible: false,
                headerTitle: () => (
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <Image
                            source={logoLong}
                            style={{
                                width: 120,
                                height: 26,
                                resizeMode: "contain",
                            }}
                        />
                        <Text style={{ color: "#A5B0C9", fontSize: 10, marginLeft: 8 }}>
                            TRAIN · FUEL · GROW
                        </Text>
                    </View>
                ),
                headerRight: () => (
                    <TouchableOpacity
                        onPress={() => router.push("/profile")}
                        style={{
                            marginRight: 16,
                            width: 34,
                            height: 34,
                            borderRadius: 17,
                            borderWidth: 1,
                            borderColor: "rgba(255,255,255,0.15)",
                            alignItems: "center",
                            justifyContent: "center",
                            backgroundColor: "rgba(255,255,255,0.05)",
                        }}
                    >
                        <Ionicons name="person-outline" size={18} color="#E2E8F0" />
                    </TouchableOpacity>
                ),
            }}
        >
        <Tabs.Screen
                name="home"
                options={{
                    title: "Home",
                    tabBarIcon: tabIcon("home-outline"),
                }}
            />
            <Tabs.Screen
                name="workouts"
                options={{
                    title: "Workouts",
                    tabBarIcon: tabIcon("barbell-outline"),
                }}
            />
            <Tabs.Screen
                name="nutrition"
                options={{
                    title: "Nutrition",
                    tabBarIcon: tabIcon("restaurant-outline"),
                }}
            />
            <Tabs.Screen
                name="progress"
                options={{
                    title: "Progress",
                    tabBarIcon: tabIcon("stats-chart-outline"),
                }}
            />

            {/* NEW: Sessions tab */}
            <Tabs.Screen
                name="sessions"
                options={{
                    title: "Sessions",
                    tabBarIcon: tabIcon("calendar-outline"),
                }}
            />

            <Tabs.Screen
                name="messages"
                options={{
                    title: "Messages",
                    tabBarIcon: tabIcon("chatbubble-ellipses-outline"),
                }}
            />

            {/* Hide profile from tab bar if it exists under the tabs segment */}
            <Tabs.Screen
                name="profile"
                options={{
                    href: null,          // keep it hidden from the tab bar
                    headerShown: false,  // <— important: don't render the Tabs header here
                }}
            />
        </Tabs>
    );
}
