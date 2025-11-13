import { Tabs, router } from "expo-router";
import { FontAwesome5 } from '@expo/vector-icons';
import {ActivityIndicator, BackHandler, Platform, TouchableOpacity, View} from "react-native";
import {useEnsureFitnessProfile} from "@/hooks/useEnsureFitnessProfile";
import { Image } from "react-native";
import logoLong from "../../assets/logo_long.png"; // adjust path if needed


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

    return (
        <Tabs
            screenOptions={{
                headerTitle: () => (
                    <Image
                        source={logoLong}
                        style={{
                            width: 140,
                            height: 30,
                            resizeMode: "contain",
                        }}
                    />
                ),
                tabBarActiveTintColor: "#111",
                tabBarInactiveTintColor: "#999",
                tabBarStyle: {
                    paddingBottom: 8,
                    paddingTop: 8,
                    height: 65,
                    backgroundColor: '#fff',
                    borderTopWidth: 1,
                    borderTopColor: '#f0f0f0',
                },
                tabBarLabelStyle: {
                    fontSize: 11,
                    fontWeight: '600',
                    marginTop: 4,
                },
                headerStyle: {
                    backgroundColor: '#fff',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.05,
                    shadowRadius: 3,
                    elevation: 5,
                },
                headerTitleStyle: {
                    fontWeight: 'bold',
                    fontSize: 20,
                },
                headerRight: () => (
                    <TouchableOpacity
                        onPress={() => router.push('/profile')}
                        style={{ marginRight: 15 }}
                    >
                        <FontAwesome5 name="user-circle" size={24} color="#111" />
                    </TouchableOpacity>
                ),
            }}
        >
        <Tabs.Screen
                name="home"
                options={{
                    title: "Home",
                    tabBarIcon: ({ color, size, focused }) => (
                        <FontAwesome5 name="home" size={size - 2} color={color} solid={focused} />
                    ),
                }}
            />
            <Tabs.Screen
                name="workouts"
                options={{
                    title: "Workouts",
                    tabBarIcon: ({ color, size, focused }) => (
                        <FontAwesome5 name="dumbbell" size={size - 4} color={color} solid={focused} />
                    ),
                }}
            />
            <Tabs.Screen
                name="nutrition"
                options={{
                    title: "Nutrition",
                    tabBarIcon: ({ color, size, focused }) => (
                        <FontAwesome5 name="apple-alt" size={size - 2} color={color} solid={focused} />
                    ),
                }}
            />
            <Tabs.Screen
                name="progress"
                options={{
                    title: "Progress",
                    tabBarIcon: ({ color, size, focused }) => (
                        <FontAwesome5 name="chart-line" size={size - 3} color={color} solid={focused} />
                    ),
                }}
            />

            {/* NEW: Sessions tab */}
            <Tabs.Screen
                name="sessions"
                options={{
                    title: "Sessions",
                    tabBarIcon: ({ color, size, focused }) => (
                        <FontAwesome5 name="calendar-alt" size={size - 2} color={color} solid={focused} />
                    ),
                }}
            />

            <Tabs.Screen
                name="messages"
                options={{
                    title: "Messages",
                    tabBarIcon: ({ color, size, focused }) => (
                        <FontAwesome5 name="comments" size={size - 2} color={color} solid={focused} />
                    ),
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
