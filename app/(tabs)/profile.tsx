import React, { useCallback, useMemo, useState } from "react";
import {
  Box,
  VStack,
  Text,
  ScrollView,
  Pressable,
  HStack,
  Avatar,
  Button,
  Actionsheet,
  useDisclose,
} from "native-base";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCachedQuery } from "@/hooks/useCachedQuery";
import { GET_ME } from "@/graphql/queries";
import { logout } from "@/lib/apollo";
import { useAppToast } from "@/providers/AppToastProvider";
import { RefreshControl, Linking } from "react-native";
import Constants from "expo-constants";

export default function ProfileScreen() {
  const { data, refetch } = useCachedQuery(GET_ME);
  const me = data?.user;
  const toast = useAppToast();
  const { isOpen, onOpen, onClose } = useDisclose();
  const [refreshing, setRefreshing] = useState(false);
  const versionLabel = useMemo(() => {
    const appVersion = Constants.expoConfig?.version ?? "—";
    const buildNumber = Constants.expoConfig?.android?.versionCode ?? Constants.expoConfig?.ios?.buildNumber;
    return buildNumber ? `${appVersion} (${buildNumber})` : appVersion;
  }, []);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await refetch();
    } catch (error) {
      console.warn("Profile refresh failed", error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, refetch]);

  const handleLogout = async () => {
    try {
      await logout();
    } catch (error) {
      console.error("Logout error:", error);
      toast.show({
        title: "Logout failed",
        description: "Please try again",
        bgColor: "red.500",
        placement: "top",
      });
    }
  };

  const handleDeleteAccount = useCallback(async () => {
    const url = "https://deletemyaccount.trainzilla.in";
    try {
      const canOpen = await Linking.canOpenURL(url);
      if (!canOpen) throw new Error("Cannot open URL");
      await Linking.openURL(url);
    } catch (error) {
      toast.show({
        title: "Unable to open portal",
        description: "Please try again shortly.",
        bgColor: "red.500",
        placement: "top",
      });
    }
  }, [toast]);

  return (
    <Box flex={1} bg="#05060A" safeArea>
      <ScrollView
        contentContainerStyle={{ padding: 20 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#fff" />
        }
      >
        <VStack space={4}>
          <Box
            p={5}
            rounded="3xl"
            bg={{
              linearGradient: {
                colors: ["rgba(124,58,237,0.35)", "rgba(8,9,18,0.95)"],
                start: [0, 0],
                end: [1, 1],
              },
            }}
            borderWidth={1}
            borderColor="rgba(255,255,255,0.12)"
          >
            <HStack justifyContent="space-between" alignItems="center">
              <VStack>
                <Text fontSize="xs" color="coolGray.200">
                  Profile
                </Text>
                <Text fontSize="2xl" fontWeight="bold" color="white">
                  {me?.name ?? "Athlete"}
                </Text>
                <Text fontSize="xs" color="coolGray.400">
                  {me?.email ?? ""}
                </Text>
              </VStack>
              <Avatar size="lg" bg="#7C3AED" source={me?.avatarUrl ? { uri: me.avatarUrl } : undefined}>
                {(me?.name ?? "U").charAt(0).toUpperCase()}
              </Avatar>
            </HStack>
            <HStack mt={4} space={3}>
              <InfoPill icon="person-outline" label="Account" value="Active" />
              <InfoPill icon="shield-checkmark-outline" label="Security" value="Protected" />
            </HStack>
          </Box>

          <CardSection icon="people-outline" title="Connections">
            <MenuItem
              icon="git-merge-outline"
              title="Trainer invitations"
              subtitle="Manage trainer connections"
              onPress={() => router.push("/(profile)/invitations")}
            />
          </CardSection>

          <CardSection icon="help-circle-outline" title="Support">
            <MenuItem
              icon="mail-open-outline"
              title="Help & support"
              subtitle="support@trainzilla.in"
              onPress={() =>
                toast.show({
                  title: "Support",
                  description: "support@trainzilla.in",
                  placement: "top",
                })
              }
            />
            <MenuItem
              icon="information-circle-outline"
              title="About"
              subtitle={`Version ${versionLabel}`}
              onPress={onOpen}
            />
          </CardSection>

          <CardSection icon="log-out-outline" title="Account actions">
            <Button
              onPress={handleDeleteAccount}
              rounded="full"
              borderWidth={1}
              borderColor="rgba(248,113,113,0.4)"
              bg="rgba(248,113,113,0.08)"
              _text={{ color: "#F87171", fontWeight: "bold" }}
              _pressed={{ bg: "rgba(248,113,113,0.18)" }}
            >
              Delete account
            </Button>
            <Button
              onPress={handleLogout}
              mt={3}
              rounded="full"
              bg="rgba(248,113,113,0.15)"
              _text={{ color: "#F87171", fontWeight: "bold" }}
              _pressed={{ bg: "rgba(248,113,113,0.25)" }}
            >
              Logout
            </Button>
          </CardSection>
        </VStack>
      </ScrollView>

      <Actionsheet isOpen={isOpen} onClose={onClose} hideDragIndicator>
        <Actionsheet.Content bg="#0F111A" borderTopWidth={1} borderTopColor="rgba(255,255,255,0.08)">
          <Text fontSize="lg" fontWeight="bold" color="white">
            About TrainZilla
          </Text>
          <Text fontSize="xs" color="coolGray.400" mt={2} textAlign="center">
            Your personal studio in your pocket. Streamlined coaching, precision nutrition, and accountability—anytime,
            anywhere.
          </Text>
          <Text fontSize="xs" color="coolGray.500" mt={3}>
            Version {versionLabel}
          </Text>
          <Button mt={4} onPress={onClose} bg="#7C3AED" _text={{ color: "white", fontWeight: "700" }}>
            Close
          </Button>
        </Actionsheet.Content>
      </Actionsheet>
    </Box>
  );
}

function CardSection({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <VStack p={4} rounded="2xl" borderWidth={1} borderColor="rgba(255,255,255,0.08)" bg="#0F111A" space={3}>
      <HStack space={2} alignItems="center">
        <Box bg="rgba(124,58,237,0.15)" rounded="full" p={2}>
          <Ionicons name={icon} size={16} color="#C4B5FD" />
        </Box>
        <Text fontSize="sm" fontWeight="bold" color="white">
          {title}
        </Text>
      </HStack>
      <VStack>{children}</VStack>
    </VStack>
  );
}

function MenuItem({
  icon,
  title,
  subtitle,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress}>
      <HStack py={3} alignItems="center" borderBottomWidth={1} borderColor="rgba(255,255,255,0.05)">
        <Box w={10} h={10} rounded="full" bg="rgba(255,255,255,0.06)" alignItems="center" justifyContent="center">
          <Ionicons name={icon} size={18} color="#C4B5FD" />
        </Box>
        <VStack flex={1} ml={3} space={1}>
          <Text fontSize="sm" fontWeight="600" color="white">
            {title}
          </Text>
          {subtitle ? (
            <Text fontSize="xs" color="coolGray.400">
              {subtitle}
            </Text>
          ) : null}
        </VStack>
        <Ionicons name="chevron-forward" size={16} color="#7C7C8A" />
      </HStack>
    </Pressable>
  );
}

function InfoPill({ icon, label, value }: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string }) {
  return (
    <HStack
      space={2}
      alignItems="center"
      px={3}
      py={1.5}
      borderRadius={999}
      bg="rgba(255,255,255,0.06)"
      borderWidth={1}
      borderColor="rgba(255,255,255,0.12)"
    >
      <Ionicons name={icon} size={14} color="#C4B5FD" />
      <Text fontSize="xs" color="coolGray.300">
        {label}: <Text color="white">{value}</Text>
      </Text>
    </HStack>
  );
}
