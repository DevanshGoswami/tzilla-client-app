// app/(profile)/index.tsx (or wherever your ProfileScreen lives)
import React from "react";
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    StyleSheet,
    Alert,
    Image,
} from "react-native";
import { FontAwesome5 } from "@expo/vector-icons";
import { useQuery } from "@apollo/client/react";
import { GET_ME } from "@/graphql/queries";
import { logout } from "@/lib/apollo";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";

type MeResponse = {
    user?: {
        _id: string;
        name?: string | null;
        email?: string | null;
        avatarUrl?: string | null;
    };
};

const MenuOption = ({
                        icon,
                        title,
                        subtitle,
                        onPress,
                        color = "#333",
                    }: {
    icon: any;
    title: string;
    subtitle?: string;
    onPress: () => void;
    color?: string;
}) => (
    <TouchableOpacity style={styles.menuOption} onPress={onPress}>
        <View style={[styles.menuIconContainer, { backgroundColor: color + "15" }]}>
            <FontAwesome5 name={icon} size={20} color={color} />
        </View>
        <View style={styles.menuTextContainer}>
            <Text style={styles.menuTitle}>{title}</Text>
            {subtitle ? <Text style={styles.menuSubtitle}>{subtitle}</Text> : null}
        </View>
        <FontAwesome5 name="chevron-right" size={16} color="#999" />
    </TouchableOpacity>
);

function InitialsCircle({ name }: { name?: string | null }) {
    const initials =
        (name || "")
            .trim()
            .split(/\s+/)
            .slice(0, 2)
            .map((n) => n[0]?.toUpperCase() || "")
            .join("") || "U";
    return (
        <View style={styles.avatar}>
            <Text style={{ fontSize: 28, fontWeight: "700", color: "#555" }}>
                {initials}
            </Text>
        </View>
    );
}

export default function ProfileScreen() {
    const { data } = useQuery<MeResponse>(GET_ME);
    const me = data?.user;

    const handleLogout = () => {
        Alert.alert("Logout", "Are you sure you want to logout?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Logout",
                style: "destructive",
                onPress: async () => {
                    try {
                        await logout();
                    } catch (error) {
                        console.error("Logout error:", error);
                        Alert.alert("Error", "Failed to logout. Please try again.");
                    }
                },
            },
        ]);
    };

    return (
        <SafeAreaView style={styles.container} edges={["top", "left", "right"]}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                {/* Minimal title row (no back button) */}
                <View style={styles.titleBar}>
                    <Text style={styles.headerTitle}>Profile</Text>
                </View>

                {/* User Info Card */}
                <View style={styles.userCard}>
                    {me?.avatarUrl ? (
                        <Image source={{ uri: me.avatarUrl }} style={styles.avatarImg} />
                    ) : (
                        <InitialsCircle name={me?.name} />
                    )}
                    <Text style={styles.userName}>{me?.name || "User"}</Text>
                    <Text style={styles.userEmail}>{me?.email}</Text>
                </View>

                {/* Menu Options */}
                <View style={styles.menuSection}>
                    <Text style={styles.sectionTitle}>Account</Text>

                    <MenuOption
                        icon="user-friends"
                        title="Trainer Invitations"
                        subtitle="Manage trainer connections"
                        onPress={() => router.push("/(profile)/invitations")}
                        color="#2196F3"
                    />

                    <MenuOption
                        icon="bell"
                        title="Notifications"
                        subtitle="Coming soon"
                        onPress={() =>
                            Alert.alert("Coming Soon", "Notification settings will be available soon.")
                        }
                        color="#FF9800"
                    />

                    <MenuOption
                        icon="shield-alt"
                        title="Privacy & Security"
                        subtitle="Coming soon"
                        onPress={() =>
                            Alert.alert("Coming Soon", "Privacy settings will be available soon.")
                        }
                        color="#9C27B0"
                    />
                </View>

                <View style={styles.menuSection}>
                    <Text style={styles.sectionTitle}>Support</Text>

                    <MenuOption
                        icon="question-circle"
                        title="Help & Support"
                        subtitle="Get help with the app"
                        onPress={() =>
                            Alert.alert("Coming Soon", "Help center will be available soon.")
                        }
                        color="#607D8B"
                    />

                    <MenuOption
                        icon="info-circle"
                        title="About"
                        subtitle="App version and information"
                        onPress={() =>
                            Alert.alert(
                                "TrainZilla",
                                "Version 1.0.0\n\nYour personal fitness journey companion."
                            )
                        }
                        color="#795548"
                    />
                </View>

                {/* Logout */}
                <View style={styles.logoutSection}>
                    <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
                        <FontAwesome5
                            name="sign-out-alt"
                            size={16}
                            color="#DC2626"
                            style={{ marginRight: 8 }}
                        />
                        <Text style={styles.logoutText}>Logout</Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: "#f5f5f5" },

    // Minimal title bar (no back button)
    titleBar: {
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 8,
        backgroundColor: "#fff",
        borderBottomWidth: 1,
        borderBottomColor: "#e5e5e5",
    },
    headerTitle: { fontSize: 20, fontWeight: "bold", color: "#111" },

    userCard: {
        backgroundColor: "#fff",
        marginHorizontal: 16,
        marginTop: 16,
        padding: 24,
        borderRadius: 12,
        alignItems: "center",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    avatar: {
        width: 84,
        height: 84,
        borderRadius: 42,
        backgroundColor: "#f0f0f0",
        justifyContent: "center",
        alignItems: "center",
        marginBottom: 16,
    },
    avatarImg: {
        width: 84,
        height: 84,
        borderRadius: 42,
        backgroundColor: "#f0f0f0",
        marginBottom: 16,
    },
    userName: { fontSize: 22, fontWeight: "bold", color: "#111", marginBottom: 4 },
    userEmail: { fontSize: 14, color: "#666" },

    menuSection: {
        backgroundColor: "#fff",
        marginHorizontal: 16,
        marginTop: 16,
        borderRadius: 12,
        overflow: "hidden",
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: "600",
        color: "#999",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        paddingHorizontal: 16,
        paddingTop: 16,
        paddingBottom: 8,
    },
    menuOption: {
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 14,
        paddingHorizontal: 16,
        borderBottomWidth: 1,
        borderBottomColor: "#f0f0f0",
    },
    menuIconContainer: {
        width: 40,
        height: 40,
        borderRadius: 10,
        justifyContent: "center",
        alignItems: "center",
        marginRight: 12,
    },
    menuTextContainer: { flex: 1 },
    menuTitle: { fontSize: 16, fontWeight: "500", color: "#111", marginBottom: 2 },
    menuSubtitle: { fontSize: 13, color: "#666" },

    logoutSection: { marginHorizontal: 16, marginTop: 24, marginBottom: 32 },
    logoutButton: {
        flexDirection: "row",
        justifyContent: "center",
        alignItems: "center",
        padding: 16,
        borderRadius: 12,
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#DC2626",
    },
    logoutText: { color: "#DC2626", fontSize: 16, fontWeight: "600" },
});
