import { create } from "zustand";

export interface TrainerWithPlans {
    isConnected: boolean;
    trainer: {
        _id: string;
        userId: string;
        user?: {
            _id: string;
            name?: string | null;
            email?: string | null;
            avatarUrl?: string | null;
        } | null;
        gender: string;
        contact: {
            city: string;
            country: string;
        };
        professional: {
            profilePhoto: string;
            bio?: string | null;
            yearsOfExperience: number;
            businessType: string;
            specialties: string[];
            languages: string[];
            gallery: string[];
        };
        availability: {
            preferredTime: string;
            daysAvailable: string[];
            checkIn: string;
            checkOut: string;
            timezone: string;
        };
        transformations?: {
            clientName: string;
            timeline: string;
            transformationGoal: string;
            resultsAndAchievements: string[];
        }[];
        testimonials?: {
            clientName: string;
            profileImage: string;
            note: string;
        }[];
    };
    subscriptionPlans: {
        _id: string;
        name: string;
        amount: number;
        period: string;
        interval: number;
        description?: string | null;
        meta?: {
            freeTrialSessions?: number | null;
            sessionsIncludedPerMonth?: number | null;
        } | null;
    }[];
}

interface SelectedTrainerState {
    selected: TrainerWithPlans | null;
    setSelected: (t: TrainerWithPlans | null) => void;
}

export const useSelectedTrainerStore = create<SelectedTrainerState>((set) => ({
    selected: null,
    setSelected: (selected) => set({ selected }),
}));
