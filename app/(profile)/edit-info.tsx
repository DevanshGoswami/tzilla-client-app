// app/profile/edit-info.tsx
import React, { useState, useEffect } from 'react';
import {
    View,
    Text,
    ScrollView,
    TextInput,
    TouchableOpacity,
    Switch,
    ActivityIndicator,
    StyleSheet,
    Alert,
    SafeAreaView,
} from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useMutation, useQuery } from '@apollo/client/react';
import { UPDATE_USER_PROFILE } from '../../graphql/mutations';
import { GET_USER_PROFILE } from '../../graphql/queries';
import { router } from 'expo-router';
import type {
    GetUserProfileResponse,
    UpdateUserProfileResponse,
    UpdateClientProfileInput,
} from '../../graphql/types';
import Screen from "@/components/ui/Screen";

/**
 * Server enums:
 * DietaryRestriction = VEGAN | VEGETARIAN | PESCATARIAN | GLUTEN_FREE | DAIRY_FREE | NUT_FREE
 * FoodAllowance     = EGGS | DAIRY | SEAFOOD
 *
 * We keep a "None" option in UI (value "NONE") but do NOT send it.
 */

const DIETARY_RESTRICTIONS = [
    { label: 'None', value: 'NONE' },
    { label: 'Vegetarian', value: 'VEGETARIAN' },
    { label: 'Vegan', value: 'VEGAN' },
    { label: 'Pescatarian', value: 'PESCATARIAN' },
    { label: 'Gluten Free', value: 'GLUTEN_FREE' },
    { label: 'Dairy Free', value: 'DAIRY_FREE' },
    { label: 'Nut Free', value: 'NUT_FREE' },
];

const FOOD_ALLOWANCES = [
    { label: 'Eggs', value: 'EGGS' },
    { label: 'Dairy', value: 'DAIRY' },
    { label: 'Seafood', value: 'SEAFOOD' },
];

// Allowed sets (for safety)
const SERVER_DIETARY = new Set([
    'VEGAN',
    'VEGETARIAN',
    'PESCATARIAN',
    'GLUTEN_FREE',
    'DAIRY_FREE',
    'NUT_FREE',
]);
const SERVER_FOOD_ALLOWANCE = new Set(['EGGS', 'DAIRY', 'SEAFOOD'] as const);

function sanitizeDietaryRestriction(value: string): string | null {
    const v = value?.toUpperCase();
    if (SERVER_DIETARY.has(v)) return v;
    return null; // treat NONE/empty as no restriction
}

export default function EditInfoScreen() {
    // Form state
    const [currentWeight, setCurrentWeight] = useState('');
    const [height, setHeight] = useState('');
    const [dietaryRestriction, setDietaryRestriction] = useState(''); // UI string (may be "NONE")
    const [allowedFoods, setAllowedFoods] = useState<{ [key: string]: boolean }>({
        EGGS: false,
        DAIRY: false,
        SEAFOOD: false,
    });
    const [workoutTimePreference, setWorkoutTimePreference] = useState('');
    const [healthConditions, setHealthConditions] = useState('');

    // GraphQL
    const { data, loading: profileLoading } =
        useQuery<GetUserProfileResponse>(GET_USER_PROFILE);
    const [updateProfile, { loading: updating }] =
        useMutation<UpdateUserProfileResponse>(UPDATE_USER_PROFILE);

    // Prefill from profile
    useEffect(() => {

        console.log(data)

        // @ts-ignore
        const profile = data?.user;
        if (!profile) return;

        // Weight: pick the last entry (assuming appended chronologically)
        const wh = profile.stats?.weightHistory ?? [];
        if (wh.length > 0) {
            const latest = wh[wh.length - 1];
            if (typeof latest?.kg === 'number') {
                setCurrentWeight(String(latest.kg));
            }
        }

        // Height: pick the last entry
        const mh = profile.stats?.measurementHistory ?? [];
        if (mh.length > 0) {
            const latest = mh[mh.length - 1];
            if (typeof latest?.heightCm === 'number') {
                setHeight(String(latest.heightCm));
            }
        }

        // Dietary restriction: take first if server-supported, else blank/"NONE"
        const firstDR = (profile.preferences?.dietaryRestrictions?.[0] || '').toUpperCase();
        setDietaryRestriction(SERVER_DIETARY.has(firstDR) ? firstDR : 'NONE');

        // Allowed foods: server returns EGGS/DAIRY/SEAFOOD; set toggles accordingly
        const serverAF = profile.preferences?.allowedFoods ?? [];
        const nextAF: { [k: string]: boolean } = { EGGS: false, DAIRY: false, SEAFOOD: false };
        for (const v of serverAF) {
            if (SERVER_FOOD_ALLOWANCE.has(v as any)) nextAF[v] = true;
        }
        setAllowedFoods(nextAF);

        // Workout time preference (string passthrough)
        setWorkoutTimePreference(profile.preferences?.workoutTimePreference || '');

        // Health conditions (comma-separated)
        if (Array.isArray(profile.healthConditions)) {
            setHealthConditions(profile.healthConditions.join(', '));
        }
    }, [data]);

    const handleUpdateProfile = async () => {
        try {
            // Sanitize dietary restriction to server enum (omit NONE)
            const dr = sanitizeDietaryRestriction(dietaryRestriction);
            const dietaryRestrictions = dr ? [dr] : [];

            // Compress allowed foods to server array
            const allowedFoodsForServer = Object.keys(allowedFoods)
                .filter((k) => allowedFoods[k])
                .filter((k) => SERVER_FOOD_ALLOWANCE.has(k as any)) as Array<
                'EGGS' | 'DAIRY' | 'SEAFOOD'
            >;

            const input: UpdateClientProfileInput = {
                healthConditions: healthConditions
                    ? healthConditions
                        .split(',')
                        .map((c) => c.trim())
                        .filter(Boolean)
                    : [],
                preferences: {
                    dietaryRestrictions,
                    allowedFoods: allowedFoodsForServer,
                    workoutTimePreference: workoutTimePreference || undefined,
                },
                stats: {
                    // Append new entries only if provided
                    weightHistory: currentWeight
                        ? [
                            {
                                date: new Date().toISOString(),
                                kg: parseFloat(currentWeight),
                            },
                        ]
                        : [],
                    measurementHistory: height
                        ? [
                            {
                                date: new Date().toISOString(),
                                heightCm: parseFloat(height),
                            },
                        ]
                        : [],
                },
            };

            await updateProfile({ variables: { input } });

            Alert.alert('Success', 'Your profile has been updated successfully');
        } catch (error) {
            console.error('Update profile error:', error);
            Alert.alert(
                'Error',
                'Failed to update profile. Please review your selections and try again.'
            );
        }
    };

    if (profileLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#111" />
                <Text style={styles.loadingText}>Loading profile...</Text>
            </View>
        );
    }

    return (
       <Screen withHeader>
           <SafeAreaView style={styles.container}>
               <ScrollView showsVerticalScrollIndicator={false}>
                   {/* Header */}
                   <View style={styles.header}>
                       <TouchableOpacity onPress={() => router.back()}>
                           <FontAwesome5 name="arrow-left" size={20} color="#333" />
                       </TouchableOpacity>
                       <Text style={styles.headerTitle}>Personal Information</Text>
                       <View style={{ width: 20 }} />
                   </View>

                   {/* Physical Stats */}
                   <View style={styles.card}>
                       <Text style={styles.sectionTitle}>Physical Stats</Text>

                       <View style={styles.inputGroup}>
                           <Text style={styles.label}>Current Weight (kg)</Text>
                           <TextInput
                               style={styles.input}
                               placeholder="Enter weight"
                               value={currentWeight}
                               onChangeText={setCurrentWeight}
                               keyboardType="numeric"
                           />
                       </View>

                       <View style={styles.inputGroup}>
                           <Text style={styles.label}>Height (cm)</Text>
                           <TextInput
                               style={styles.input}
                               placeholder="Enter height"
                               value={height}
                               onChangeText={setHeight}
                               keyboardType="numeric"
                           />
                       </View>
                   </View>

                   {/* Dietary Preferences */}
                   <View style={styles.card}>
                       <Text style={styles.sectionTitle}>Dietary Preferences</Text>

                       <View style={styles.inputGroup}>
                           <Text style={styles.label}>Dietary Restriction</Text>
                           <View style={styles.pillContainer}>
                               {DIETARY_RESTRICTIONS.map((restriction) => (
                                   <TouchableOpacity
                                       key={restriction.value}
                                       style={[
                                           styles.pill,
                                           dietaryRestriction === restriction.value && styles.pillActive,
                                       ]}
                                       onPress={() =>
                                           setDietaryRestriction(
                                               dietaryRestriction === restriction.value ? 'NONE' : restriction.value
                                           )
                                       }
                                   >
                                       <Text
                                           style={[
                                               styles.pillText,
                                               dietaryRestriction === restriction.value && styles.pillTextActive,
                                           ]}
                                       >
                                           {restriction.label}
                                       </Text>
                                   </TouchableOpacity>
                               ))}
                           </View>
                           <Text style={styles.helperText}>
                               Saved only if it’s one of: Vegan, Vegetarian, Pescatarian, Gluten/Dairy/Nut Free.
                           </Text>
                       </View>

                       <View style={styles.inputGroup}>
                           <Text style={styles.label}>Allowed Foods</Text>
                           {FOOD_ALLOWANCES.map((food) => (
                               <View key={food.value} style={styles.switchRow}>
                                   <Text style={styles.switchLabel}>{food.label}</Text>
                                   <Switch
                                       value={!!allowedFoods[food.value]}
                                       onValueChange={() =>
                                           setAllowedFoods((prev) => ({
                                               ...prev,
                                               [food.value]: !prev[food.value],
                                           }))
                                       }
                                       trackColor={{ false: '#ccc', true: '#4CAF50' }}
                                   />
                               </View>
                           ))}
                           <Text style={styles.helperText}>
                               Saved as: Eggs, Dairy, Seafood.
                           </Text>
                       </View>
                   </View>

                   {/* Workout Preferences */}
                   <View style={styles.card}>
                       <Text style={styles.sectionTitle}>Workout Preferences</Text>

                       <View style={styles.inputGroup}>
                           <Text style={styles.label}>Preferred Workout Time</Text>
                           <View style={styles.pillContainer}>
                               {[
                                   { label: 'Morning (7-10 AM)', value: 'MORNING' },
                                   { label: 'Afternoon (2-5 PM)', value: 'AFTERNOON' },
                                   { label: 'Evening (5-8 PM)', value: 'EVENING' },
                               ].map((time) => (
                                   <TouchableOpacity
                                       key={time.value}
                                       style={[
                                           styles.pill,
                                           workoutTimePreference === time.value && styles.pillActive,
                                       ]}
                                       onPress={() =>
                                           setWorkoutTimePreference(
                                               workoutTimePreference === time.value ? '' : time.value
                                           )
                                       }
                                   >
                                       <Text
                                           style={[
                                               styles.pillText,
                                               workoutTimePreference === time.value && styles.pillTextActive,
                                           ]}
                                       >
                                           {time.label}
                                       </Text>
                                   </TouchableOpacity>
                               ))}
                           </View>
                       </View>
                   </View>

                   {/* Health Conditions */}
                   <View style={styles.card}>
                       <Text style={styles.sectionTitle}>Health Conditions</Text>

                       <View style={styles.inputGroup}>
                           <Text style={styles.label}>Medical Conditions</Text>
                           <TextInput
                               style={[styles.input, styles.textArea]}
                               placeholder="e.g., Diabetes, Hypertension (comma separated)"
                               value={healthConditions}
                               onChangeText={setHealthConditions}
                               multiline
                               numberOfLines={3}
                           />
                           <Text style={styles.helperText}>
                               Enter any medical conditions your trainer should know about
                           </Text>
                       </View>
                   </View>

                   {/* Save Button */}
                   <View style={styles.buttonContainer}>
                       <TouchableOpacity
                           style={[styles.button, styles.primaryButton, updating && styles.buttonDisabled]}
                           onPress={handleUpdateProfile}
                           disabled={updating}
                       >
                           <Text style={styles.primaryButtonText}>
                               {updating ? 'Saving...' : 'Save Changes'}
                           </Text>
                       </TouchableOpacity>
                   </View>
               </ScrollView>
           </SafeAreaView>
       </Screen>
    );
}

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
    card: {
        backgroundColor: '#fff',
        marginHorizontal: 16,
        marginTop: 16,
        padding: 16,
        borderRadius: 12,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 3,
        elevation: 2,
    },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: '#111', marginBottom: 16 },
    inputGroup: { marginBottom: 16 },
    label: { fontSize: 14, fontWeight: '500', color: '#333', marginBottom: 8 },
    input: {
        borderWidth: 1,
        borderColor: '#e5e5e5',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        backgroundColor: '#fafafa',
    },
    textArea: { minHeight: 80, textAlignVertical: 'top' },
    helperText: { fontSize: 12, color: '#666', marginTop: 4 },
    pillContainer: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
    pill: {
        paddingHorizontal: 16,
        paddingVertical: 8,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: '#e5e5e5',
        marginRight: 8,
        marginBottom: 8,
        backgroundColor: '#fff',
    },
    pillActive: { backgroundColor: '#111', borderColor: '#111' },
    pillText: { fontSize: 14, color: '#666' },
    pillTextActive: { color: '#fff' },
    switchRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 8,
    },
    switchLabel: { fontSize: 14, color: '#333' },
    buttonContainer: { padding: 16, paddingBottom: 32 },
    button: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16,
        borderRadius: 12,
        marginBottom: 12,
    },
    primaryButton: { backgroundColor: '#111' },
    primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    buttonDisabled: { opacity: 0.6 },
});
