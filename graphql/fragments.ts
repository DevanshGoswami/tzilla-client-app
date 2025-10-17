import {gql} from "@apollo/client";

export const CLIENT_PROFILE_SUMMARY_FIELDS = gql`
    fragment ClientProfileSummaryFields on ClientProfileSummary {
        name
        age
        gender
        heightCm
        currentWeightKg
        activityLevel
        goal            # <— required by your cache
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
        startedOnISO    # <— required by your cache
        progressCount
        weightDeltaKgFromStart
    }
`;