import React, { useMemo, useState } from "react";
import { RefreshControl } from "react-native";
import {
  Box,
  VStack,
  HStack,
  Text,
  Pressable,
  ScrollView,
  Spinner,
  Badge,
  Button,
  Icon,
  Avatar,
} from "native-base";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery, useMutation } from "@apollo/client/react";
import { GET_INVITATIONS_FOR_CLIENT, GET_ME } from "@/graphql/queries";
import { RESPOND_TO_INVITATION } from "@/graphql/mutations";
import { useAppToast } from "@/providers/AppToastProvider";

type Invitation = {
  _id: string;
  trainerId: string;
  clientId?: string;
  email: string;
  type: "TRAINER_INVITE" | "CLIENT_REQUEST";
  status: "REQUESTED" | "PENDING" | "ACCEPTED" | "REJECTED";
  token: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  trainer?: {
    name?: string | null;
    email?: string | null;
    avatarUrl?: string | null;
  } | null;
};

export default function InvitationsScreen() {
  const toast = useAppToast();
  const [pageNumber, setPageNumber] = useState(1);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const pageSize = 20;

  const { data: profileData } = useQuery(GET_ME);
  const userEmail = profileData?.user?.email;

  const { data, loading, refetch, fetchMore } = useQuery<{ getInvitationsForClient: Invitation[] }>(
    GET_INVITATIONS_FOR_CLIENT,
    {
      variables: { clientEmail: userEmail, pagination: { pageNumber, pageSize } },
      skip: !userEmail,
      notifyOnNetworkStatusChange: true,
    }
  );

  const [respondToInvitation] = useMutation(RESPOND_TO_INVITATION);

  const invitations = data?.getInvitationsForClient ?? [];
  const now = useMemo(() => new Date(), []);

  const pending = invitations.filter(
    (inv) =>
      (inv.status === "PENDING" || inv.status === "REQUESTED") && new Date(inv.expiresAt) > now
  );
  const past = invitations.filter(
    (inv) => inv.status === "ACCEPTED" || inv.status === "REJECTED" || new Date(inv.expiresAt) <= now
  );

  const hasMore = invitations.length >= pageNumber * pageSize;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      setPageNumber(1);
      await refetch({ clientEmail: userEmail, pagination: { pageNumber: 1, pageSize } });
    } finally {
      setRefreshing(false);
    }
  };

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await fetchMore({
        variables: { clientEmail: userEmail, pagination: { pageNumber: pageNumber + 1, pageSize } },
        updateQuery: (prev, { fetchMoreResult }) => {
          if (!fetchMoreResult?.getInvitationsForClient) return prev;
          return {
            getInvitationsForClient: [
              ...prev.getInvitationsForClient,
              ...fetchMoreResult.getInvitationsForClient,
            ],
          };
        },
      });
      setPageNumber((p) => p + 1);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRespond = async (invitationId: string, accept: boolean) => {
    try {
      await respondToInvitation({ variables: { invitationId, accept } });
      toast.show({
        title: accept ? "Invitation accepted" : "Invitation declined",
        placement: "top",
        bgColor: accept ? "emerald.500" : "coolGray.700",
      });
      setPageNumber(1);
      await refetch({ clientEmail: userEmail, pagination: { pageNumber: 1, pageSize } });
    } catch (error) {
      console.error("Error responding to invitation:", error);
      toast.show({
        title: "Unable to update",
        description: "Please try again",
        placement: "top",
        bgColor: "red.500",
      });
    }
  };

  if (loading && invitations.length === 0 && !refreshing) {
    return (
      <Box flex={1} bg="#05060A" alignItems="center" justifyContent="center">
        <Spinner color="#7C3AED" size="lg" />
        <Text color="coolGray.400" mt={4}>
          Loading invitations…
        </Text>
      </Box>
    );
  }

  return (
    <Box flex={1} bg="#05060A" safeArea>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
        showsVerticalScrollIndicator={false}
      >
        <HStack alignItems="center" mb={6} space={3}>
          <Pressable
            onPress={() => router.back()}
            hitSlop={10}
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              borderWidth: 1,
              borderColor: "rgba(255,255,255,0.1)",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="arrow-back" size={18} color="#E2E8F0" />
          </Pressable>
          <VStack flex={1}>
            <Text fontSize="xl" fontWeight="bold" color="white">
              Trainer invitations
            </Text>
            <Text fontSize="xs" color="coolGray.400">
              Review pending invites and your history
            </Text>
          </VStack>
        </HStack>

        {invitations.length === 0 ? (
          <EmptyState />
        ) : (
          <VStack space={6}>
            {pending.length > 0 && (
              <Section title="Pending">
                {pending.map((invitation) => (
                  <InvitationCard key={invitation._id} invitation={invitation} onRespond={handleRespond} />
                ))}
              </Section>
            )}

            {past.length > 0 && (
              <Section title="History">
                {past.map((invitation) => (
                  <InvitationCard key={invitation._id} invitation={invitation} onRespond={handleRespond} />
                ))}
              </Section>
            )}

            {hasMore && (
              <Button
                variant="outline"
                borderColor="rgba(255,255,255,0.2)"
                _text={{ color: "white", fontWeight: "600" }}
                onPress={handleLoadMore}
                isLoading={loadingMore}
              >
                Load more
              </Button>
            )}
          </VStack>
        )}
      </ScrollView>
    </Box>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <VStack space={3}>
      <Text fontSize="sm" fontWeight="600" color="coolGray.300">
        {title}
      </Text>
      {children}
    </VStack>
  );
}

function InvitationCard({
  invitation,
  onRespond,
}: {
  invitation: Invitation;
  onRespond: (id: string, accept: boolean) => void;
}) {
  const isExpired = new Date(invitation.expiresAt) < new Date();
  const isPending = (invitation.status === "PENDING" || invitation.status === "REQUESTED") && !isExpired;

  const statusConfig: Record<string, { label: string; color: string }> = {
    REQUESTED: { label: "Requested", color: "amber.400" },
    PENDING: { label: "Pending", color: "amber.400" },
    ACCEPTED: { label: "Accepted", color: "emerald.400" },
    REJECTED: { label: "Declined", color: "red.400" },
    EXPIRED: { label: "Expired", color: "coolGray.500" },
  };

  const status = isExpired ? statusConfig.EXPIRED : statusConfig[invitation.status];

  const trainerName = invitation.trainer?.name || "Trainer";
  const trainerEmail = invitation.trainer?.email || invitation.email;
  const trainerAvatar = invitation.trainer?.avatarUrl;

  return (
    <VStack p={4} rounded="2xl" borderWidth={1} borderColor="rgba(255,255,255,0.08)" bg="#0F111A" space={3}>
      <HStack justifyContent="space-between" alignItems="flex-start" space={3}>
        <Avatar
          size="sm"
          bg="rgba(124,58,237,0.2)"
          source={trainerAvatar ? { uri: trainerAvatar } : undefined}
        >
          {trainerName.charAt(0).toUpperCase()}
        </Avatar>
        <VStack flex={1} space={1}>
          <Text fontWeight="bold" color="white">
            {trainerName}
          </Text>
          <Text fontSize="xs" color="coolGray.400">
            {trainerEmail}
          </Text>
          <Text fontSize="xs" color="coolGray.500">
            Sent {new Date(invitation.createdAt).toLocaleDateString()}
          </Text>
        </VStack>
        <Badge
          variant="subtle"
          bg={`${status.color}1A`}
          _text={{ color: status.color, fontSize: "xs", fontWeight: "700" }}
          rounded="full"
        >
          {status.label}
        </Badge>
      </HStack>

      {isPending && invitation.type === "TRAINER_INVITE" && (
        <HStack space={3} mt={1}>
          <Button flex={1} bg="#10B981" _text={{ fontWeight: "bold" }} onPress={() => onRespond(invitation._id, true)}>
            Accept
          </Button>
          <Button
            flex={1}
            variant="outline"
            borderColor="rgba(248,113,113,0.6)"
            _text={{ color: "#F87171", fontWeight: "bold" }}
            onPress={() => onRespond(invitation._id, false)}
          >
            Decline
          </Button>
        </HStack>
      )}

      {isExpired && (
        <Text fontSize="xs" color="coolGray.500" fontStyle="italic">
          Expired on {new Date(invitation.expiresAt).toLocaleDateString()}
        </Text>
      )}
    </VStack>
  );
}

function EmptyState() {
  return (
    <VStack
      alignItems="center"
      justifyContent="center"
      space={4}
      py={20}
      px={10}
      rounded="3xl"
      borderWidth={1}
      borderColor="rgba(255,255,255,0.08)"
      bg="#0F111A"
    >
      <Icon as={Ionicons} name="mail-open-outline" size="xl" color="coolGray.400" />
      <Text fontSize="lg" fontWeight="bold" color="white">
        No invitations yet
      </Text>
      <Text fontSize="xs" color="coolGray.400" textAlign="center">
        When a trainer invites you or responds to your request, it will appear here.
      </Text>
    </VStack>
  );
}
