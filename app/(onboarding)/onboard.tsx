import Screen from "@/components/ui/Screen";
import React, {useCallback, useEffect, useMemo, useState} from "react";
import {
    Text,
    TextInput,
    TouchableOpacity,
    StyleSheet,
    Alert,
    ScrollView,
    View,
    ActivityIndicator,
    Image,
    Platform,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { useMutation, useQuery } from "@apollo/client/react";
import { ONBOARD_OR_UPDATE } from "@/graphql/mutations";
import {router, useNavigation} from "expo-router";
import { StatusBar } from "expo-status-bar";
import { GET_ME } from "@/graphql/queries";
import {ENV} from "@/lib/env";
import {getTokens} from "@/lib/apollo";

type Gender = "MALE" | "FEMALE" | "OTHER";
type Goal = "LOSE_FAT" | "GAIN_MUSCLE" | "MAINTAIN";
type Activity =
    | "SEDENTARY"
    | "LIGHT"
    | "MODERATE"
    | "ACTIVE"
    | "VERY_ACTIVE";

const AWS_BASE = `${ENV.API_URL}/api/aws`; // <-- adjust if your router mounts elsewhere
const SCREEN_BG = "#05060A";

export default function OnboardingScreen() {
    const { data: meData, loading: meLoading } = useQuery(GET_ME);

    const nav = useNavigation();

    useEffect(() => {
        nav.setOptions({
            headerLeft: () => (
                <TouchableOpacity
                    onPress={() => router.replace("/(tabs)/home")}
                    style={{ paddingHorizontal: 12, paddingVertical: 8 }}
                >
                    <Text style={{ fontWeight: "700" }}>Back</Text>
                </TouchableOpacity>
            ),
        });
    }, [nav]);

    // @ts-ignore
    const userId = meData?.user?._id;

    const [name, setName] = useState("");
    const [age, setAge] = useState("");
    const [gender, setGender] = useState<Gender | "">("");
    const [heightCm, setHeightCm] = useState("");
    const [weightKg, setWeightKg] = useState("");
    const [goal, setGoal] = useState<Goal | "">("");
    const [activityLevel, setActivityLevel] = useState<Activity | "">("");
    const [accept, setAccept] = useState(false);

    // Photos: we store both server key and a previewable URL (from /media/:key)
    const [photoFront, setPhotoFront] = useState<{ key?: string; url?: string }>({});
    const [photoSide, setPhotoSide] = useState<{ key?: string; url?: string }>({});
    const [photoBack, setPhotoBack] = useState<{ key?: string; url?: string }>({});
    const [uploading, setUploading] = useState<"front"|"side"|"back" | null>(null);

    const ISO_REGEX = /^\d{4}-\d{2}-\d{2}$/; // YYYY-MM-DD

    const isValidISODate = (v?: string) => !!v && ISO_REGEX.test(v) && !Number.isNaN(new Date(v).getTime());
// Keep only well-formed YYYY-MM-DD values
    const normalizeISO = (v?: string) => (isValidISODate(v) ? v : undefined);

    // add near other useState calls
    const [targetWeightKg, setTargetWeightKg] = useState("");
    const [targetDateISO, setTargetDateISO] = useState("");
    const [targetDateError, setTargetDateError] = useState<string | null>(null);

    const [fitnessExperience, setFitnessExperience] = useState<"BEGINNER"|"INTERMEDIATE"|"ADVANCED"|"">("");
    const [neckCm, setNeckCm] = useState("");
    const [waistCm, setWaistCm] = useState("");
    const [hipCm, setHipCm] = useState("");

// simple list of conditions
    type HC = { name: string; notes?: string };
    const [healthConditions, setHealthConditions] = useState<HC[]>([]);
    const [stepIndex, setStepIndex] = useState(0);


    const anyMeasurements =
        Number(neckCm) > 0 || Number(waistCm) > 0 || Number(hipCm) > 0;

    const mappedMeasurements = anyMeasurements
        ? {
            neckCm: Number(neckCm) || undefined,
            waistCm: Number(waistCm) || undefined,
            hipCm: Number(hipCm) || undefined,
        }
        : undefined;


    const [onboard, { loading }] = useMutation(ONBOARD_OR_UPDATE, {
        onCompleted: () => {
            router.replace("/(tabs)/home"); // next step page
        },
    });

    const [token, setToken] = useState<string | null>(null);
    const [tokenLoading, setTokenLoading] = useState(true);
    useEffect(() => {
        let mounted = true;
        (async () => {
            try {
                const { accessToken } = await getTokens();
                if (!mounted) return;
                setToken(accessToken ?? null);
            } catch (err) {
                if (mounted) {
                    setToken(null);
                    console.warn("getTokens failed:", err);
                }
            } finally {
                if (mounted) setTokenLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, []);

    const requiredFilled = useMemo(() => {
        // Only the *required* onboarding fields
        return (
            !!userId &&
            name.trim().length > 1 &&
            !!gender &&
            !!goal &&
            !!activityLevel &&
            Number(age) > 0 &&
            Number(heightCm) > 0 &&
            Number(weightKg) > 0 &&
            accept
        );
    }, [userId, name, gender, goal, activityLevel, age, heightCm, weightKg, accept]);

    const steps = [
        {
            key: "basics",
            title: "Let’s get to know you",
            description: "Share a few basics so we can personalize your journey.",
            isValid: name.trim().length > 1 && Number(age) > 0 && !!gender,
            content: (
                <View style={styles.card}>
                    <SectionHeading
                        icon="person-outline"
                        title="Personal details"
                        subtitle="Your coach uses this to personalise guidance."
                    />
                    <Label label="Full name *" hint="As it should appear on your profile" />
                    <Input value={name} onChangeText={setName} placeholder="Jane Doe" />

                    <Label label="Age *" />
                    <Input
                        value={age}
                        onChangeText={setAge}
                        keyboardType="numeric"
                        placeholder="e.g., 28"
                    />

                    <Label label="Gender *" />
                    <ChipsRow
                        options={[
                            { label: "Male", value: "MALE" },
                            { label: "Female", value: "FEMALE" },
                            { label: "Other", value: "OTHER" },
                        ]}
                        value={gender}
                        onChange={setGender as (v: string) => void}
                    />
                </View>
            ),
        },
        {
            key: "metrics",
            title: "Body metrics",
            description: "Tell us where you are today.",
            isValid: Number(heightCm) > 0 && Number(weightKg) > 0,
            content: (
                <>
                    <View style={styles.card}>
                        <SectionHeading
                            icon="body-outline"
                            title="Body metrics"
                            subtitle="Where you are today."
                        />
                        <Label label="Height (cm) *" />
                        <Input
                            value={heightCm}
                            onChangeText={setHeightCm}
                            keyboardType="numeric"
                            placeholder="e.g., 175"
                        />

                        <Label label="Current weight (kg) *" />
                        <Input
                            value={weightKg}
                            onChangeText={setWeightKg}
                            keyboardType="numeric"
                            placeholder="e.g., 72"
                        />
                    </View>

                    <View style={styles.card}>
                        <SectionHeading
                            icon="fitness-outline"
                            title="Measurements (optional)"
                            subtitle="Helpful for precise tracking."
                        />
                        <Text style={styles.sectionTitle}>Measurements (optional)</Text>

                        <Label label="Neck (cm)" />
                        <Input value={neckCm} onChangeText={setNeckCm} keyboardType="numeric" placeholder="e.g., 38" />

                        <Label label="Waist (cm)" />
                        <Input value={waistCm} onChangeText={setWaistCm} keyboardType="numeric" placeholder="e.g., 85" />

                        <Label label="Hip (cm)" />
                        <Input value={hipCm} onChangeText={setHipCm} keyboardType="numeric" placeholder="e.g., 100" />
                    </View>
                </>
            ),
        },
        {
            key: "goals",
            title: "Goals & lifestyle",
            description: "What are you aiming for and how active are you?",
            isValid: !!goal && !!activityLevel,
            content: (
                <View style={styles.card}>
                    <SectionHeading
                        icon="trending-up-outline"
                        title="Goals & routine"
                        subtitle="Define what success looks like."
                    />
                    <Label label="Primary goal *" />
                    <ChipsRow
                        options={[
                            { label: "Fat loss", value: "LOSE_FAT" },
                            { label: "Muscle gain", value: "GAIN_MUSCLE" },
                            { label: "Maintain", value: "MAINTAIN" },
                        ]}
                        value={goal}
                        onChange={setGoal as (v: string) => void}
                    />

                    <Label label="Activity level *" hint="Typical daily/weekly routine" />
                    <ChipsRow
                        options={[
                            { label: "Sedentary", value: "SEDENTARY" },
                            { label: "Light", value: "LIGHT" },
                            { label: "Moderate", value: "MODERATE" },
                            { label: "Active", value: "ACTIVE" },
                            { label: "Very Active", value: "VERY_ACTIVE" },
                        ]}
                        value={activityLevel}
                        onChange={setActivityLevel as (v: string) => void}
                        scroll
                    />

                    <Label label="Target weight (kg)" />
                    <Input
                        value={targetWeightKg}
                        onChangeText={setTargetWeightKg}
                        keyboardType="numeric"
                        placeholder="e.g., 68"
                    />

                    <Label label="Target date (YYYY-MM-DD)" hint="Optional target timeline" />
                    <DateInput value={targetDateISO} onChange={setTargetDateISO} />

                    <Label label="Fitness experience" />
                    <ChipsRow
                        options={[
                            { label: "Beginner", value: "BEGINNER" },
                            { label: "Intermediate", value: "INTERMEDIATE" },
                            { label: "Advanced", value: "ADVANCED" },
                        ]}
                        value={fitnessExperience}
                        onChange={setFitnessExperience as (v: string) => void}
                    />
                </View>
            ),
        },
        {
            key: "health",
            title: "Health & photos",
            description: "Anything else your coach should know?",
            isValid: accept,
            content: (
                <>
                    <View style={styles.card}>
                        <SectionHeading
                            icon="medkit-outline"
                            title="Health considerations"
                            subtitle="Let your trainer know anything important."
                        />
                        <Text style={styles.sectionTitle}>Health Conditions (optional)</Text>
                        {healthConditions.length === 0 ? (
                            <Text style={styles.muted}>Add any relevant conditions (e.g., asthma, knee pain).</Text>
                        ) : null}

                        {healthConditions.map((hc, idx) => (
                            <View key={idx} style={{ marginBottom: 14 }}>
                                <Label label={`Condition #${idx + 1}`} />
                                <Input
                                    placeholder="Name (required)"
                                    value={hc.name}
                                    onChangeText={(t) => {
                                        const next = [...healthConditions];
                                        next[idx] = { ...next[idx], name: t };
                                        setHealthConditions(next);
                                    }}
                                />
                                <Label label="Notes" />
                                <Input
                                    placeholder="Notes (optional)"
                                    value={hc.notes ?? ""}
                                    onChangeText={(t) => {
                                        const next = [...healthConditions];
                                        next[idx] = { ...next[idx], notes: t };
                                        setHealthConditions(next);
                                    }}
                                />
                            <TouchableOpacity
                                style={styles.iconAction}
                                onPress={() => setHealthConditions(healthConditions.filter((_, i) => i !== idx))}
                            >
                                <Ionicons name="trash-outline" size={18} color="#F87171" />
                            </TouchableOpacity>
                            </View>
                        ))}

                        <TouchableOpacity
                            style={[styles.outlineBtn, { marginTop: 4 }]}
                            onPress={() => setHealthConditions([...healthConditions, { name: "" }])}
                        >
                            <Text style={styles.outlineBtnText}>+ Add Condition</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={styles.card}>
                        <SectionHeading
                            icon="camera-outline"
                            title="Progress photos"
                            subtitle="Visual context is optional but powerful."
                        />
                        <Text style={styles.sectionTitle}>Progress Photos (optional)</Text>
                        <Text style={styles.muted}>
                            These help your trainer track visual progress. Clear, well-lit shots
                            in similar clothing work best.
                        </Text>

                        <PhotoRow
                            title="Front"
                            uploading={uploading === "front"}
                            imageUrl={photoFront.url}
                            onPick={() => pickAndUpload("front")}
                            onClear={() => setPhotoFront({})}
                        />
                        <PhotoRow
                            title="Side"
                            uploading={uploading === "side"}
                            imageUrl={photoSide.url}
                            onPick={() => pickAndUpload("side")}
                            onClear={() => setPhotoSide({})}
                        />
                        <PhotoRow
                            title="Back"
                            uploading={uploading === "back"}
                            imageUrl={photoBack.url}
                            onPick={() => pickAndUpload("back")}
                            onClear={() => setPhotoBack({})}
                        />
                    </View>

                    <TouchableOpacity
                        style={[styles.termsBtn, accept && styles.termsBtnActive]}
                        onPress={() => setAccept((v) => !v)}
                    >
                        <Text style={styles.termsText}>
                            {accept ? "✓ " : ""}I accept the Terms & Conditions
                        </Text>
                    </TouchableOpacity>
                </>
            ),
        },
    ];

    const pickAndUpload = useCallback(
        async (slot: "front" | "side" | "back") => {
            try {
                const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
                if (perm.status !== "granted") {
                    Alert.alert("Permission needed", "We need access to your photos to upload.");
                    return;
                }

                const result = await ImagePicker.launchImageLibraryAsync({
                    mediaTypes: ImagePicker.MediaTypeOptions.Images,
                    allowsEditing: true,
                    quality: 0.9,
                });
                if (result.canceled || !result.assets?.length) return;

                // 🔐 Ensure we have a fresh token at click-time
                let effectiveToken = token;
                if (!effectiveToken) {
                    try {
                        const { accessToken } = await getTokens();
                        effectiveToken = accessToken ?? null;
                        if (!effectiveToken) throw new Error("No access token");
                        setToken(effectiveToken); // cache in state for next time
                    } catch {
                        Alert.alert("Auth error", "You’re not signed in. Please log in again.");
                        return;
                    }
                }

                const asset = result.assets[0];
                const contentType = (asset.mimeType as string) || "image/jpeg";
                setUploading(slot);

                // 1) presign
                const presignRes = await fetch(
                    `${AWS_BASE}/presign?type=${encodeURIComponent(contentType)}`,
                    {
                        method: "GET",
                        headers: {
                            "role": "client",
                            "Authorization": `Bearer ${effectiveToken}`,
                        },
                    }
                );
                if (!presignRes.ok) {
                    // Optional: if 401, one retry with fresh token
                    if (presignRes.status === 401) {
                        try {
                            const { accessToken: retryToken } = await getTokens();
                            if (retryToken) {
                                const retryRes = await fetch(
                                    `${AWS_BASE}/presign?type=${encodeURIComponent(contentType)}`,
                                    {
                                        method: "GET",
                                        headers: { role: "client", Authorization: `Bearer ${retryToken}` },
                                    }
                                );
                                if (retryRes.ok) {
                                    // overwrite response and token for the rest of the flow
                                    const { url: putUrl, key, maxSize } = await retryRes.json();
                                    // continue with PUT branch, see below...
                                }
                            }
                        } catch {}
                    }
                    throw new Error(`Presign failed: ${await presignRes.text()}`);
                }

                const { url: putUrl, key, maxSize } = await presignRes.json();

                const fileResp = await fetch(asset.uri);
                const blob = await fileResp.blob();
                if (blob.size > maxSize) {
                    throw new Error(`Image exceeds limit (${Math.round(maxSize / (1024 * 1024))}MB).`);
                }

                const putResp = await fetch(putUrl, {
                    method: "PUT",
                    headers: { "Content-Type": contentType },
                    body: blob,
                });
                if (!putResp.ok) throw new Error(`Upload failed: ${await putResp.text()}`);

                // 4) get a view URL
                const viewRes = await fetch(`${AWS_BASE}/media/${encodeURIComponent(key)}`, {
                    method: "GET",
                    headers: {
                        role: "client",
                        Authorization: `Bearer ${effectiveToken}`,
                    },
                });
                let viewUrl: string | undefined;
                if (viewRes.ok) {
                    const json = await viewRes.json();
                    viewUrl = json.url as string;
                }

                const payload = { key, url: viewUrl };
                if (slot === "front") setPhotoFront(payload);
                if (slot === "side") setPhotoSide(payload);
                if (slot === "back") setPhotoBack(payload);
                setUploading(null);
            } catch (e: any) {
                setUploading(null);
                Alert.alert("Upload error", e?.message ?? "Could not upload photo");
            }
        },
        [token] // (safe, but we still fetch fresh if missing)
    );


    async function submit() {
        if (!userId) return Alert.alert("Error", "User not logged in");
        if (!requiredFilled)
            return Alert.alert("Missing info", "Please complete all required fields.");

        if (targetDateISO && !isValidISODate(targetDateISO)) {
            return Alert.alert("Invalid date", "Please enter date as YYYY-MM-DD (e.g., 2025-03-01).");
        }

        try {
            await onboard({
                variables: {
                    input: {
                        userId,
                        name,
                        age: Number(age),
                        gender,
                        heightCm: Number(heightCm),
                        weightKg: Number(weightKg),
                        activityLevel,
                        goal,
                        // NEW (optional fields):
                        targetWeightKg: Number(targetWeightKg) || undefined,
                        targetDateISO: normalizeISO(targetDateISO),
                        fitnessExperience: fitnessExperience || undefined,
                        measurements: mappedMeasurements,
                        healthConditions:
                            healthConditions.length
                                ? healthConditions
                                    .filter(h => h.name?.trim().length) // only send valid rows
                                    .map(h => ({ name: h.name.trim(), notes: h.notes?.trim() || undefined }))
                                : undefined,
                        // existing:
                        photos: {
                            front: photoFront.key,
                            side: photoSide.key,
                            back: photoBack.key,
                        },
                        acceptedTermsAndConditions: true,
                    },
                },
            });

        } catch (e: any) {
            Alert.alert("Error", e?.message ?? "Failed to onboard");
        }
    }

    if (meLoading || tokenLoading) {
        return (
            <Screen withHeader backgroundColor={SCREEN_BG} headerColor={SCREEN_BG}>
                <StatusBar style="light" backgroundColor={SCREEN_BG} />
                <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color="#FFFFFF" />
                    <Text style={styles.loadingText}>Loading your profile…</Text>
                </View>
            </Screen>
        );
    }

    const currentStep = steps[stepIndex];
    const isLastStep = stepIndex === steps.length - 1;
    const canContinue = isLastStep ? requiredFilled : currentStep.isValid;
    const progress = ((stepIndex + 1) / steps.length) * 100;

    return (
        <Screen withHeader backgroundColor={SCREEN_BG} headerColor={SCREEN_BG}>
            <StatusBar style="light" backgroundColor={SCREEN_BG} />
            <View style={styles.container}>
                <Text style={styles.headerTitle}>Create your fitness profile</Text>
                <View style={styles.progressTrack}>
                    <View style={[styles.progressFill, { width: `${progress}%` }]} />
                </View>
                <Text style={styles.progressMeta}>
                    Step {stepIndex + 1} of {steps.length}
                </Text>

                <Text style={styles.stepTitle}>{currentStep.title}</Text>
                <Text style={styles.stepSubtitle}>{currentStep.description}</Text>

                <ScrollView
                    style={styles.stepScroll}
                    contentContainerStyle={styles.stepScrollInner}
                    showsVerticalScrollIndicator={false}
                >
                    {currentStep.content}
                </ScrollView>

                <View style={styles.navRow}>
                    {stepIndex > 0 ? (
                        <TouchableOpacity
                            style={[styles.navBtn, styles.secondaryBtn]}
                            onPress={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                        >
                            <Text style={styles.secondaryBtnText}>Back</Text>
                        </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                        disabled={!canContinue || (isLastStep && loading)}
                        style={[
                            styles.navBtn,
                            styles.primaryBtn,
                            (!canContinue || (isLastStep && loading)) && styles.disabled,
                        ]}
                        onPress={
                            isLastStep
                                ? submit
                                : () => setStepIndex((prev) => Math.min(steps.length - 1, prev + 1))
                        }
                    >
                        <Text style={styles.primaryBtnText}>
                            {isLastStep ? (loading ? "Saving…" : "Finish") : "Next"}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Screen>
    );
}

/* ---------- Small, reusable UI bits ---------- */

function SectionHeading({
    icon,
    title,
    subtitle,
}: {
    icon: keyof typeof Ionicons.glyphMap;
    title: string;
    subtitle?: string;
}) {
    return (
        <View style={styles.sectionHeading}>
            <View style={styles.sectionHeadingIcon}>
                <Ionicons name={icon} size={16} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={styles.sectionHeadingTitle}>{title}</Text>
                {subtitle ? <Text style={styles.sectionHeadingSubtitle}>{subtitle}</Text> : null}
            </View>
        </View>
    );
}

function Label({ label, hint }: { label: string; hint?: string }) {
    return (
        <View style={{ marginBottom: 6 }}>
            <Text style={styles.label}>{label}</Text>
            {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
    );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
    return (
        <TextInput
            {...props}
            placeholderTextColor={props.placeholderTextColor ?? "#7C8595"}
            style={[styles.input, props.style]}
        />
    );
}

function ChipsRow({
                      options,
                      value,
                      onChange,
                      scroll,
                  }: {
    options: { label: string; value: string }[];
    value?: string | null;
    onChange: (v: string) => void;
    scroll?: boolean;
}) {
    const content = (
        <View style={styles.chipsRowInner}>
            {options.map((o) => {
                const active = value === o.value;
                return (
                    <TouchableOpacity
                        key={o.value}
                        onPress={() => onChange(o.value)}
                        style={[styles.chip, active && styles.chipActive]}
                    >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>
                            {o.label}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
    if (scroll) {
        return <ScrollView horizontal showsHorizontalScrollIndicator={false}>{content}</ScrollView>;
    }
    return content;
}

function PhotoRow({
                      title,
                      uploading,
                      imageUrl,
                      onPick,
                      onClear,
                  }: {
    title: string;
    uploading?: boolean;
    imageUrl?: string;
    onPick: () => void;
    onClear: () => void;
}) {
    return (
        <View style={styles.photoRow}>
            <View style={{ flex: 1 }}>
                <Text style={styles.label}>{title}</Text>
                <Text style={styles.hint}>Upload JPEG or PNG</Text>
            </View>

            <View style={styles.photoActions}>
                <View style={[styles.photoPreview, styles.photoEmpty]}>
                    {imageUrl ? (
                        <Image source={{ uri: imageUrl }} style={styles.photoPreviewImage} />
                    ) : uploading ? (
                        <ActivityIndicator color="#7C3AED" />
                    ) : (
                        <View style={styles.photoPlaceholder}>
                            <Ionicons name="image-outline" size={20} color="#94A3B8" />
                            <Text style={styles.muted}>No image</Text>
                        </View>
                    )}
                </View>
                <View style={{ width: 8 }} />
                <TouchableOpacity style={styles.outlineBtn} onPress={onPick} disabled={uploading}>
                    <Text style={styles.outlineBtnText}>{uploading ? "Uploading…" : "Choose"}</Text>
                </TouchableOpacity>
                <View style={{ width: 6 }} />
                <TouchableOpacity
                    style={[styles.outlineBtn, styles.dangerOutline]}
                    onPress={onClear}
                    disabled={!imageUrl || uploading}
                >
                    <Text style={[styles.outlineBtnText, styles.dangerText]}>Clear</Text>
                </TouchableOpacity>
            </View>
        </View>
    );
}

function DateInput({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
    const [pickerVisible, setPickerVisible] = useState(false);

    return (
        <>
            <TouchableOpacity
                onPress={() => setPickerVisible(true)}
                style={styles.dateInput}
                activeOpacity={0.85}
            >
                <Text style={[styles.dateInputText, !value && { color: "#7C8595" }]}>
                    {value || "Select a date"}
                </Text>
            </TouchableOpacity>
            {pickerVisible && (
                <DateTimePicker
                    value={value ? new Date(value) : new Date()}
                    mode="date"
                    display={Platform.OS === "ios" ? "spinner" : "default"}
                    onChange={(_, selectedDate) => {
                        setPickerVisible(false);
                        if (!selectedDate) return;
                        const iso = selectedDate.toISOString().slice(0, 10);
                        onChange(iso);
                    }}
                />
            )}
        </>
    );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
    container: {
        flex: 1,
        padding: 16,
        backgroundColor: SCREEN_BG,
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: "800",
        color: "#F4F6FB",
        textAlign: "center",
        marginBottom: 10,
    },
    progressTrack: {
        width: "100%",
        height: 6,
        borderRadius: 999,
        backgroundColor: "rgba(255,255,255,0.08)",
        overflow: "hidden",
    },
    progressFill: {
        height: "100%",
        backgroundColor: "#7C3AED",
    },
    progressMeta: {
        marginTop: 6,
        fontSize: 12,
        fontWeight: "600",
        color: "#8F9BB4",
        textAlign: "right",
    },
    stepTitle: {
        fontSize: 22,
        fontWeight: "800",
        color: "#F8FAFC",
        marginTop: 16,
    },
    stepSubtitle: {
        fontSize: 14,
        color: "#A5B0C9",
        marginTop: 4,
    },
    stepScroll: {
        flex: 1,
        marginTop: 16,
    },
    stepScrollInner: {
        paddingBottom: 32,
    },
    card: {
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        backgroundColor: "#0F111A",
        borderRadius: 16,
        padding: 16,
        marginBottom: 16,
        shadowColor: "#000",
        shadowOpacity: 0.3,
        shadowRadius: 10,
        shadowOffset: { width: 0, height: 6 },
        elevation: 4,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "700",
        marginBottom: 10,
        color: "#E2E8F0",
    },
    sectionHeading: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 14,
    },
    sectionHeadingIcon: {
        width: 32,
        height: 32,
        borderRadius: 16,
        backgroundColor: "rgba(249,115,22,0.12)",
        justifyContent: "center",
        alignItems: "center",
        marginRight: 10,
    },
    sectionHeadingTitle: {
        fontSize: 15,
        fontWeight: "700",
        color: "#F8FAFC",
    },
    sectionHeadingSubtitle: {
        fontSize: 12,
        color: "#94A3B8",
    },
    label: {
        fontSize: 13,
        fontWeight: "700",
        color: "#F8FAFC",
    },
    hint: {
        fontSize: 12,
        color: "#94A3B8",
        marginTop: 2,
    },
    muted: {
        color: "#94A3B8",
        fontSize: 12.5,
        marginBottom: 10,
    },
    input: {
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        borderRadius: 12,
        padding: 12,
        fontSize: 15.5,
        backgroundColor: "#141829",
        color: "#F8FAFC",
        marginBottom: 12,
    },
    chipsRowInner: {
        flexDirection: "row",
        flexWrap: "wrap",
        gap: 8,
        marginBottom: 6,
    },
    chip: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "#141726",
    },
    chipActive: {
        backgroundColor: "#7C3AED",
        borderColor: "#7C3AED",
    },
    chipText: {
        fontSize: 13.5,
        color: "#E2E8F0",
        fontWeight: "600",
    },
    chipTextActive: {
        color: "#111",
    },
    photoRow: {
        borderTopWidth: 1,
        borderTopColor: "rgba(255,255,255,0.08)",
        paddingTop: 10,
        marginTop: 6,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
    },
    photoActions: {
        flexDirection: "row",
        alignItems: "center",
    },
    photoPreview: {
        width: 64,
        height: 64,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        backgroundColor: "#141829",
        overflow: "hidden",
    },
    photoEmpty: {
        justifyContent: "center",
        alignItems: "center",
    },
    photoPreviewImage: {
        width: "100%",
        height: "100%",
    },
    photoPlaceholder: {
        alignItems: "center",
        justifyContent: "center",
        gap: 4,
    },
    outlineBtn: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.15)",
        backgroundColor: "transparent",
    },
    outlineBtnText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#F1F5F9",
    },
    iconAction: {
        width: 36,
        height: 36,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "rgba(248,113,113,0.4)",
        alignItems: "center",
        justifyContent: "center",
        marginTop: 6,
    },
    dangerOutline: {
        borderColor: "rgba(248,113,113,0.4)",
    },
    dangerText: {
        color: "#F87171",
    },
    termsBtn: {
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.12)",
        marginTop: 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "rgba(255,255,255,0.04)",
    },
    termsBtnActive: {
        borderColor: "#7C3AED",
    },
    termsText: {
        fontWeight: "600",
        color: "#E2E8F0",
    },
    primaryBtn: {
        backgroundColor: "#7C3AED",
    },
    primaryBtnText: {
        color: "#111",
        fontSize: 16,
        fontWeight: "700",
    },
    navRow: {
        flexDirection: "row",
        gap: 12,
        marginTop: 16,
    },
    navBtn: {
        flex: 1,
        paddingVertical: 14,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
    },
    secondaryBtn: {
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.15)",
        backgroundColor: "transparent",
    },
    secondaryBtnText: {
        fontWeight: "700",
        color: "#E2E8F0",
    },
    disabled: {
        opacity: 0.5,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: SCREEN_BG,
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: "#94A3B8",
    },
    dateInput: {
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
        borderRadius: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        backgroundColor: "#141829",
        marginTop: 6,
    },
    dateInputText: {
        color: "#F8FAFC",
        fontSize: 15,
        fontWeight: "600",
    },
});
