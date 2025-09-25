// app/(profile)/invitations.tsx
import React, { useState } from 'react';
import {
    View,
    Text,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    StyleSheet,
    Alert,
    SafeAreaView,
    RefreshControl,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useQuery, useMutation } from '@apollo/client/react';
import { GET_INVITATIONS_FOR_CLIENT, GET_ME } from '../../graphql/queries';
import { RESPOND_TO_INVITATION } from '../../graphql/mutations';
import { router } from 'expo-router';
import Screen from "@/components/ui/Screen";

interface Invitation {
    _id: string;
    trainerId: string;
    clientId?: string;
    email: string;
    type: 'TRAINER_INVITE' | 'CLIENT_REQUEST';
    status: 'REQUESTED' | 'PENDING' | 'ACCEPTED' | 'REJECTED';
    token: string;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
}

interface GetInvitationsResponse {
    getInvitationsForClient: Invitation[];
}

/**
 * InvitationCard Component
 */
const InvitationCard = ({
                            invitation,
                            onRespond,
                        }: {
    invitation: Invitation;
    onRespond: (id: string, accept: boolean) => void;
}) => {
    const isPending =
        invitation.status === 'PENDING' || invitation.status === 'REQUESTED';
    const isExpired = new Date(invitation.expiresAt) < new Date();

    const getStatusColor = () => {
        if (isExpired) return '#999';
        switch (invitation.status) {
            case 'ACCEPTED':
                return '#4CAF50';
            case 'REJECTED':
                return '#DC2626';
            case 'PENDING':
            case 'REQUESTED':
                return '#FF9800';
            default:
                return '#666';
        }
    };

    const getStatusText = () => {
        if (isExpired) return 'Expired';
        return (
            invitation.status.charAt(0) + invitation.status.slice(1).toLowerCase()
        );
    };

    return (
        <View style={styles.invitationCard}>
            <View style={styles.invitationHeader}>
                <View style={styles.iconContainer}>
                    <FontAwesome5
                        name={invitation.type === 'TRAINER_INVITE' ? 'user-plus' : 'hand-paper'}
                        size={20}
                        color="#2196F3"
                    />
                </View>
                <View style={styles.invitationInfo}>
                    <Text style={styles.invitationType}>
                        {invitation.type === 'TRAINER_INVITE'
                            ? 'Trainer Invitation'
                            : 'Your Request'}
                    </Text>
                    <Text style={styles.invitationEmail}>From: {invitation.email}</Text>
                    <Text style={styles.invitationDate}>
                        {new Date(invitation.createdAt).toLocaleDateString()}
                    </Text>
                </View>
                <View
                    style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor() + '20' },
                    ]}
                >
                    <Text style={[styles.statusText, { color: getStatusColor() }]}>
                        {getStatusText()}
                    </Text>
                </View>
            </View>

            {isPending && !isExpired && invitation.type === 'TRAINER_INVITE' && (
                <View style={styles.actionButtons}>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.acceptButton]}
                        onPress={() => onRespond(invitation._id, true)}
                    >
                        <FontAwesome5 name="check" size={14} color="#fff" />
                        <Text style={styles.acceptButtonText}>Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.actionButton, styles.rejectButton]}
                        onPress={() => onRespond(invitation._id, false)}
                    >
                        <FontAwesome5 name="times" size={14} color="#DC2626" />
                        <Text style={styles.rejectButtonText}>Decline</Text>
                    </TouchableOpacity>
                </View>
            )}

            {isExpired && (
                <Text style={styles.expiredText}>
                    This invitation expired on{' '}
                    {new Date(invitation.expiresAt).toLocaleDateString()}
                </Text>
            )}
        </View>
    );
};

/**
 * InvitationsScreen
 */
export default function InvitationsScreen() {
    // 🔒 All hooks at the top; no hooks after conditional returns.
    const [refreshing, setRefreshing] = useState(false);
    const [pageNumber, setPageNumber] = useState(1);
    const pageSize = 20;

    const { data: profileData } = useQuery(GET_ME);
    // @ts-ignore
    const userEmail = profileData?.user?.email;

    const {
        data,
        loading,
        refetch,
        fetchMore,
    } = useQuery<GetInvitationsResponse>(GET_INVITATIONS_FOR_CLIENT, {
        variables: {
            clientEmail: userEmail,
            pagination: { pageNumber, pageSize },
        },
        skip: !userEmail,
        notifyOnNetworkStatusChange: true,
    });

    const [respondToInvitation] = useMutation(RESPOND_TO_INVITATION);

    const invitations = data?.getInvitationsForClient ?? [];

    // Compute derived arrays WITHOUT hooks (prevents hook-order issues).
    const now = new Date();
    const pendingInvitations = invitations.filter(
        (inv) =>
            (inv.status === 'PENDING' || inv.status === 'REQUESTED') &&
            new Date(inv.expiresAt) > now
    );
    const pastInvitations = invitations.filter(
        (inv) =>
            inv.status === 'ACCEPTED' ||
            inv.status === 'REJECTED' ||
            new Date(inv.expiresAt) <= now
    );

    // If backend does not return total/hasNext, infer hasMore by page fill.
    const hasMore = invitations.length >= pageNumber * pageSize;
    const [loadingMore, setLoadingMore] = useState(false);

    const handleLoadMore = async () => {
        if (loadingMore || !hasMore) return;
        setLoadingMore(true);
        try {
            await fetchMore({
                variables: {
                    clientEmail: userEmail,
                    pagination: { pageNumber: pageNumber + 1, pageSize },
                },
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
        Alert.alert(
            accept ? 'Accept Invitation' : 'Decline Invitation',
            `Are you sure you want to ${accept ? 'accept' : 'decline'} this invitation?`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Confirm',
                    style: accept ? 'default' : 'destructive',
                    onPress: async () => {
                        try {
                            await respondToInvitation({
                                variables: { invitationId, accept },
                                refetchQueries: [
                                    {
                                        query: GET_INVITATIONS_FOR_CLIENT,
                                        variables: {
                                            clientEmail: userEmail,
                                            pagination: { pageNumber: 1, pageSize },
                                        },
                                    },
                                ],
                            });
                            setPageNumber(1);
                            Alert.alert(
                                'Success',
                                accept
                                    ? 'Invitation accepted! Your trainer will be notified.'
                                    : 'Invitation declined.'
                            );
                        } catch (error) {
                            console.error('Error responding to invitation:', error);
                            Alert.alert(
                                'Error',
                                'Failed to respond to invitation. Please try again.'
                            );
                        }
                    },
                },
            ]
        );
    };

    const onRefresh = async () => {
        setRefreshing(true);
        try {
            setPageNumber(1);
            await refetch({
                clientEmail: userEmail,
                pagination: { pageNumber: 1, pageSize },
            });
        } finally {
            setRefreshing(false);
        }
    };

    // Early return is OK now (no hooks after this point).
    if (loading && !refreshing && invitations.length === 0) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#111" />
                <Text style={styles.loadingText}>Loading invitations...</Text>
            </View>
        );
    }

    return (
        <Screen withHeader>
            <SafeAreaView style={styles.container}>
                <ScrollView
                    showsVerticalScrollIndicator={false}
                    refreshControl={
                        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
                    }
                >
                    {/* Header */}
                    <View style={styles.header}>
                        <TouchableOpacity onPress={() => router.back()}>
                            <FontAwesome5 name="arrow-left" size={20} color="#333" />
                        </TouchableOpacity>
                        <Text style={styles.headerTitle}>Trainer Invitations</Text>
                        <View style={{ width: 20 }} />
                    </View>

                    {invitations.length === 0 ? (
                        <View style={styles.emptyState}>
                            <View style={styles.emptyIconContainer}>
                                <FontAwesome5 name="envelope-open-text" size={50} color="#ccc" />
                            </View>
                            <Text style={styles.emptyTitle}>No Invitations</Text>
                            <Text style={styles.emptyText}>
                                You dont have any trainer invitations yet.{'\n'}
                                When a trainer invites you, theyll appear here.
                            </Text>
                        </View>
                    ) : (
                        <>
                            {pendingInvitations.length > 0 && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Pending Invitations</Text>
                                    {pendingInvitations.map((invitation) => (
                                        <InvitationCard
                                            key={invitation._id}
                                            invitation={invitation}
                                            onRespond={handleRespond}
                                        />
                                    ))}
                                </View>
                            )}

                            {pastInvitations.length > 0 && (
                                <View style={styles.section}>
                                    <Text style={styles.sectionTitle}>Past Invitations</Text>
                                    {pastInvitations.map((invitation) => (
                                        <InvitationCard
                                            key={invitation._id}
                                            invitation={invitation}
                                            onRespond={handleRespond}
                                        />
                                    ))}
                                </View>
                            )}

                            {/* Load More */}
                            {hasMore && (
                                <View style={{ paddingHorizontal: 16, paddingVertical: 12 }}>
                                    <TouchableOpacity
                                        style={[styles.actionButton, { backgroundColor: '#111' }]}
                                        disabled={loadingMore}
                                        onPress={handleLoadMore}
                                    >
                                        {loadingMore ? (
                                            <ActivityIndicator color="#fff" />
                                        ) : (
                                            <>
                                                <FontAwesome5 name="chevron-down" size={14} color="#fff" />
                                                <Text
                                                    style={[styles.acceptButtonText, { marginLeft: 8 }]}
                                                >
                                                    Load more
                                                </Text>
                                            </>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}
                        </>
                    )}
                </ScrollView>
            </SafeAreaView>
        </Screen>
    );
}

/**
 * Styles
 */
const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#f5f5f5' },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
    },
    loadingText: { marginTop: 10, fontSize: 16, color: '#666' },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: 16,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e5e5e5',
    },
    headerTitle: { fontSize: 20, fontWeight: 'bold', color: '#111' },
    section: { marginTop: 16, paddingHorizontal: 16 },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '600',
        color: '#999',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 12,
    },
    invitationCard: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        marginBottom: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    invitationHeader: { flexDirection: 'row', alignItems: 'flex-start' },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 10,
        backgroundColor: '#2196F315',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    invitationInfo: { flex: 1 },
    invitationType: {
        fontSize: 16,
        fontWeight: '600',
        color: '#111',
        marginBottom: 4,
    },
    invitationEmail: { fontSize: 14, color: '#666', marginBottom: 2 },
    invitationDate: { fontSize: 12, color: '#999' },
    statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
    statusText: { fontSize: 12, fontWeight: '600' },
    actionButtons: {
        flexDirection: 'row',
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 10,
        borderRadius: 8,
        marginHorizontal: 4,
    },
    acceptButton: { backgroundColor: '#4CAF50' },
    acceptButtonText: {
        color: '#fff',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 6,
    },
    rejectButton: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#DC2626',
    },
    rejectButtonText: {
        color: '#DC2626',
        fontSize: 14,
        fontWeight: '600',
        marginLeft: 6,
    },
    expiredText: {
        fontSize: 12,
        color: '#999',
        fontStyle: 'italic',
        marginTop: 12,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
    },
    emptyState: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingVertical: 80,
        paddingHorizontal: 32,
    },
    emptyIconContainer: { marginBottom: 24 },
    emptyTitle: {
        fontSize: 20,
        fontWeight: '600',
        color: '#333',
        marginBottom: 8,
    },
    emptyText: { fontSize: 14, color: '#666', textAlign: 'center', lineHeight: 20 },
});
