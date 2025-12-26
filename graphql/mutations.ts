import { gql } from "@apollo/client";
import {CLIENT_PROFILE_SUMMARY_FIELDS} from "@/graphql/fragments";

export const GOOGLE_AUTH_SIGN_IN = gql`
  mutation GoogleAuthSignIn($idToken: String!) {
    googleAuthSignIn(idToken: $idToken) {
      accessToken
      refreshToken
    }
  }
`;

export const APPLE_AUTH_SIGN_IN = gql`
  mutation AppleAuthSignIn($idToken: String!) {
    appleAuthSignIn(idToken: $idToken) {
      accessToken
      refreshToken
    }
  }
`;

export const REFRESH_ACCESS_TOKEN = gql`
  mutation RefreshAccessToken($refreshToken: String!) {
    refreshAccessToken(refreshToken: $refreshToken) {
      accessToken
      refreshToken
    }
  }
`;

export const UPDATE_USER_PROFILE = gql`
  mutation UpdateUserProfile($input: UpdateClientProfileInput!) {
    updateUserProfile(input: $input) {
      _id
      name
      email
      isProfileCompleted
      preferences {
        dietaryRestrictions
        allowedFoods
        workoutTimePreference
      }
      stats {
        weightHistory {
          kg
        }
      }
    }
  }
`;

export const RESPOND_TO_INVITATION = gql`
  mutation RespondToInvitation($invitationId: ID!, $accept: Boolean!) {
    respondToInvitation(invitationId: $invitationId, accept: $accept) {
      _id
      status
    }
  }
`;

export const BOOK_TRAINING_SESSION = gql`
  mutation BookTrainingSession($input: BookSessionInput!) {
      bookSession(input: $input) {
      _id
      trainerId
      clientId
      scheduledStart
      scheduledEnd
      status
    }
  }
`;

export const CREATE_SUBSCRIPTION = gql`
  mutation CreateSubscription($input: CreateSubscriptionInput!) {
    createSubscription(input: $input) {
      _id
      type
      issuer
      subscriber
      planId
      rzpSubscriptionId
      status
      startedAt
      currentPeriodEnd
      createdAt
      updatedAt
    }
  }
`;

export const CANCEL_SUBSCRIPTION = gql`
  mutation CancelSubscription($subscriptionId: ID!) {
    cancelSubscription(subscriptionId: $subscriptionId) {
      _id
      status
      currentPeriodEnd
    }
  }
`;


export const UPDATE_SESSION_CLIENT_NOTES = gql`
  mutation UpdateSessionClientNotes($input: UpdateSessionClientNotesInput!) {
    updateSessionClientNotes(input: $input) {
      _id
      notes {
        trainer
        client
      }
    }
  }
`;

export const CANCEL_SESSION = gql`
  mutation CancelSession($sessionId: ID!, $reason: String) {
    cancelSession(sessionId: $sessionId, reason: $reason) {
      _id
      status
    }
  }
`;

export const REGISTER_DEVICE_TOKEN = gql`
  mutation RegisterDeviceToken($input: DeviceTokenInput!) {
    registerDeviceToken(input: $input)
  }
`;

export const ONBOARD_OR_UPDATE = gql`
    mutation OnboardOrUpdate($input: OnboardingInput!) {
        onboardOrUpdate(input: $input) {
            userId
            profile { ...ClientProfileSummaryFields }
            progress {
                id dateISO weightKg notes
                bmi tdee caloriesRecommended
                measurements { neckCm waistCm hipCm }
                createdAt
            }
            createdAt
            updatedAt
        }
    }
    ${CLIENT_PROFILE_SUMMARY_FIELDS}
`;

export const ADD_PROGRESS = gql`
    mutation AddProgress($input: AddProgressInput!) {
        addProgress(input: $input) {
            userId
            profile { ...ClientProfileSummaryFields }  # ensure Goal + startedOnISO are present
            progress {
                id dateISO weightKg notes
                bmi tdee caloriesRecommended
                measurements { neckCm waistCm hipCm }
                createdAt
            }
            createdAt
            updatedAt
        }
    }
    ${CLIENT_PROFILE_SUMMARY_FIELDS}
`;

export const REQUEST_INVITATION = gql`
  mutation RequestInvitation($trainerId: ID!, $email: String!) {
    requestInvitation(input: { trainerId: $trainerId, email: $email }) {
      _id
      trainerId
      email
      status
      createdAt
    }
  }
`;
