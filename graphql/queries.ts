import { gql } from "@apollo/client";

export const GET_ME = gql`
  query GetMe {
    user {
      _id
      name
      email
      avatarUrl
      isProfileCompleted
    }
  }
`;

export const GET_USER_PROFILE = gql`
  query GetUserProfile {
    user {
      healthConditions
      preferences {
        dietaryRestrictions
        allowedFoods
        workoutTimePreference
      }
    }
  }
`;

export const GET_INVITATIONS_FOR_CLIENT = gql`
    query GetInvitationsForClient($clientEmail: String!, $pagination: PaginationInput) {
        getInvitationsForClient(clientEmail: $clientEmail, pagination: $pagination) {
            _id
            trainerId
            clientId
            email
            type
            status
            token
            expiresAt
            createdAt
            updatedAt
        }
    }
`;

export const GET_TRAINERS_FOR_CLIENT = gql`
    query GetTrainersForClient($pagination: PaginationInput!) {
        getTrainersForClient(pagination: $pagination) {
            _id
            name
            email
            avatarUrl
        }
    }
`;

// Sessions for trainer (we'll filter client-side to next 7 days)
export const GET_SESSIONS_FOR_TRAINER = gql`
    query SessionsForTrainer($trainerId: ID!, $pagination: PaginationInput!) {
        sessionsForTrainer(trainerId: $trainerId, pagination: $pagination) {
            _id
            trainerId
            clientId
            type
            status
            scheduledStart
            scheduledEnd
        }
    }
`;

// All client subscriptions; we'll filter by issuer === trainerId and status === ACTIVE
export const GET_CLIENT_SUBSCRIPTIONS = gql`
    query ClientSubscriptions($clientId: ID!, $pagination: PaginationInput!) {
        clientSubscriptions(clientId: $clientId, pagination: $pagination) {
            _id
            type
            issuer            # trainerId
            subscriber        # clientId
            status
            planId
            startedAt
            currentPeriodEnd
        }
    }
`;

export const GET_TRAINER_PLANS = gql`
    query SubscriptionPlansForTrainer($trainerId: ID!, $pagination: PaginationInput) {
        subscriptionPlansForTrainer(trainerId: $trainerId, pagination: $pagination) {
            _id
            name
            category
            amount
            period
            interval
            description
            isActive
            createdAt
            updatedAt
        }
    }
`;

export const GET_ACTIVE_CLIENT_SUBSCRIPTIONS = gql`
    query ActiveClientSubscriptions($trainerId: ID!) {
        activeClientSubscriptions(trainerId: $trainerId) {
            _id
            type
            issuer            # trainerId
            subscriber        # clientId
            status
            planId
            rzpSubscriptionId
            startedAt
            currentPeriodEnd
            createdAt
            updatedAt
        }
    }
`;

export const GET_SESSIONS_FOR_CLIENT = gql`
    query GetSessionsForClient($clientId: ID!, $pagination: PaginationInput!) {
        sessionsForClient(clientId: $clientId, pagination: $pagination) {
            _id
            trainerId
            clientId
            type
            subscriptionId
            scheduledStart
            scheduledEnd
            location {
                addressLine1
                addressLine2
                city
                state
                postalCode
                country
            }
            meetingLink
            status
            notes {
                trainer
                client
            }
            createdAt
            updatedAt
        }
    }
`;

export const GET_SESSION_BY_ID = gql`
    query GetSessionById($id: ID!) {
        sessionById(id: $id) {
            _id
            trainerId
            clientId
            type
            subscriptionId
            scheduledStart
            scheduledEnd
            location {
                addressLine1
                addressLine2
                city
                state
                postalCode
                country
            }
            meetingLink
            status
            notes {
                trainer
                client
            }
            createdAt
            updatedAt
        }
    }
`;


export const FITNESS_PROFILE = gql`
    query FitnessProfile($userId: ID!) {
        fitnessProfile(userId: $userId) {
            userId
            createdAt
            updatedAt
            profile {
                name
                age
                gender
                heightCm
                currentWeightKg
                activityLevel
                goal
                targetWeightKg
                targetDateISO
                fitnessExperience
                healthConditions { name notes }
                photos { front side back }
                latestMeasurements { neckCm waistCm hipCm }
                computed {
                    bmi
                    bmiCategory
                    bmr
                    tdee
                    estimatedBodyFatPct
                    recommendedCaloriesPerDay
                    summaries { caloriesLine bmiLine }
                }
                startedOnISO
                progressCount
                weightDeltaKgFromStart
            }
            progress {
                id
                dateISO
                weightKg
                measurements { neckCm waistCm hipCm }
                notes
                createdAt
                bmi
                tdee
                caloriesRecommended
            }
        }
    }
`;


export const PROGRESS_REPORT = gql`
    query ProgressReport($userId: ID!, $range: ProgressRange) {
        progressReport(userId: $userId, range: $range) {
            id
            dateISO
            weightKg
            measurements { neckCm waistCm hipCm }
            notes
            createdAt
            bmi
            tdee
            caloriesRecommended
        }
    }
`;

export const GET_TRAINER_SLOTS_NEXT_7_DAYS = gql`
    query TrainerAvailableHourSlotsNext7Days($trainerId: ID!) {
        trainerAvailableHourSlotsNext7Days(trainerId: $trainerId) {
            startUtc
            endUtc
            ymdLocal
            startLocal
            endLocal
        }
    }
`;