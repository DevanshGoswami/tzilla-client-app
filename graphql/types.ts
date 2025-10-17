// types/graphql.ts
export interface User {
    _id: string;
    name: string;
    email: string;
    isProfileCompleted: boolean;
    healthConditions?: string[];
    preferences?: {
        dietaryRestrictions?: string[];
        allowedFoods?: string[];
        workoutTimePreference?: string;
    };
    stats?: {
        weightHistory?: Array<{
            date: string;
            kg: number;
        }>;
        measurementHistory?: Array<{
            date: string;
            heightCm: number;
        }>;
        strengthTestHistory?: Array<{
            date: string;
            exerciseName: string;
            maxKg: number;
        }>;
        cardioTestHistory?: Array<{
            date: string;
            activity: string;
            metric: string;
            value: number;
        }>;
        flexibilityAssessmentHistory?: Array<{
            date: string;
            area: string;
            rangeDeg: number;
        }>;
    };
}

export interface GetUserProfileResponse {
    getUserProfile: User;
}

export interface UpdateUserProfileResponse {
    updateUserProfile: User;
}

export interface UpdateClientProfileInput {
    healthConditions?: string[];
    preferences?: {
        dietaryRestrictions?: string[];
        allowedFoods?: string[];
        workoutTimePreference?: string;
    };
    stats?: {
        weightHistory?: Array<{
            date: string;
            kg: number;
        }>;
        measurementHistory?: Array<{
            date: string;
            heightCm: number;
        }>;
    };
}

export type SessionStatus = "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
export type SessionType = "IN_PERSON" | "ONLINE";

export interface Session {
    _id: string;
    trainerId: string;
    clientId: string;
    type: SessionType;
    subscriptionId: string;

    scheduledStart: string;
    scheduledEnd: string;

    location?: {
        addressLine1: string;
        addressLine2?: string;
        city: string;
        state?: string;
        postalCode?: string;
        country: string;
    };
    meetingLink?: string;

    status: SessionStatus;

    notes?: {
        trainer?: string;
        client?: string;
    };

    createdAt: string;
    updatedAt: string;
}

export interface Subscription  {
    _id: string;
    type: "PLATFORM" | "CLIENT";
    issuer: string; // trainerId
    subscriber: string; // clientId
    status: "ACTIVE" | "PENDING" | "CANCELLED" | "CREATED" | "COMPLETED" | "HALTED" | "REQUESTED_CANCELLATION";
    planId: string;
    startedAt: string;
    currentPeriodEnd: string;
};

// ---------------------------------------------
// SubscriptionPlan types
// ---------------------------------------------

export type ISODateString = string;

export enum PlanCategory {
    PLATFORM = "PLATFORM",
    CLIENT = "CLIENT",
}

export enum PlanPeriod {
    MONTHLY = "MONTHLY",
    YEARLY = "YEARLY",
}

export interface PlanMeta {
    /** number of free trial sessions included with this plan */
    freeTrialSessions?: number | null;
    /** number of sessions included per month (if applicable) */
    sessionsIncludedPerMonth?: number | null;
}

export interface SubscriptionPlan {
    _id: string;
    name: string;
    /** PlanCategory */
    category: PlanCategory;
    /** amount in minor units (e.g., paise) */
    amount: number;
    /** PlanPeriod: MONTHLY | YEARLY */
    period: PlanPeriod;
    /** interval count (e.g., every 1 month, every 3 months) */
    interval: number;
    description?: string | null;
    /** trainerId (issuer on the server schema) */
    issuer: string;
    meta?: PlanMeta | null;
    /** Razorpay plan id */
    rzpPlanId: string;
    isActive: boolean;
    createdAt: ISODateString;
    updatedAt: ISODateString;
}


export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type ActivityLevel = 'SEDENTARY'|'LIGHT'|'MODERATE'|'ACTIVE'|'VERY_ACTIVE';
export type GoalType = 'FAT_LOSS'|'MUSCLE_GAIN'|'MAINTAIN';


export interface FitnessProfileQuery {
    fitnessProfile: {
        userId: string;
        createdAt: string;
        updatedAt: string;
        profile: {
            name: string;
            age: number;
            gender: Gender;
            heightCm: number;
            currentWeightKg: number;
            activityLevel: ActivityLevel;
            goal: GoalType;
            targetWeightKg?: number;
            targetDateISO?: string;
            fitnessExperience?: 'BEGINNER'|'INTERMEDIATE'|'ADVANCED';
            healthConditions?: { name: string; notes?: string }[];
            startedOnISO: string;
            progressCount: number;
            weightDeltaKgFromStart?: number;
            computed: { bmi: number; bmiCategory: string; tdee: number; recommendedCaloriesPerDay: number };
        } | null;
        progress: Array<{ id: string; dateISO: string; weightKg?: number }>;
    } | null;
}

export type HourSlot = {
    startUtc: string;
    endUtc: string;
    ymdLocal: string;   // "YYYY-MM-DD" in trainer timezone
    startLocal: string; // "HH:mm"
    endLocal: string;   // "HH:mm"
};