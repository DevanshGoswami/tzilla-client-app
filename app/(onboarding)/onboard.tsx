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
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useMutation, useQuery } from "@apollo/client/react";
import { ONBOARD_OR_UPDATE } from "@/graphql/mutations";
import {router, useNavigation} from "expo-router";
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
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" />
                <Text style={styles.loadingText}>Loading your profile…</Text>
            </View>
        );
    }

    return (
        <Screen withHeader>
            <ScrollView contentContainerStyle={styles.container}>
                <Text style={styles.headerTitle}>Create your fitness profile</Text>

                {/* Personal Details */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Personal Details</Text>

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

                {/* Body Metrics */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Body Metrics</Text>

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
                    <Text style={styles.sectionTitle}>Measurements (optional)</Text>

                    <Label label="Neck (cm)" />
                    <Input value={neckCm} onChangeText={setNeckCm} keyboardType="numeric" placeholder="e.g., 38" />

                    <Label label="Waist (cm)" />
                    <Input value={waistCm} onChangeText={setWaistCm} keyboardType="numeric" placeholder="e.g., 85" />

                    <Label label="Hip (cm)" />
                    <Input value={hipCm} onChangeText={setHipCm} keyboardType="numeric" placeholder="e.g., 100" />
                </View>


                {/* Goals & Activity */}
                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Goals & Activity</Text>

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
                        placeholder="e.g., 75"
                    />

                    <Label label="Target date (YYYY-MM-DD)" hint="Optional target timeline" />
                    <Input
                        value={targetDateISO}
                        onChangeText={(txt) => {
                            setTargetDateISO(txt);
                            if (!txt) {
                                setTargetDateError(null); // empty is allowed
                            } else if (!ISO_REGEX.test(txt)) {
                                setTargetDateError("Please use YYYY-MM-DD (e.g., 2025-03-01).");
                            } else if (!isValidISODate(txt)) {
                                setTargetDateError("This date looks invalid.");
                            } else {
                                setTargetDateError(null);
                            }
                        }}
                        placeholder="e.g., 2025-03-01"
                    />
                    {targetDateError ? (
                        <Text style={[styles.hint, { color: "#b50000", marginTop: 6 }]}>{targetDateError}</Text>
                    ) : null}

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

                <View style={styles.card}>
                    <Text style={styles.sectionTitle}>Health Conditions (optional)</Text>
                    {healthConditions.length === 0 ? (
                        <Text style={styles.muted}>Add any relevant conditions (e.g., asthma, knee pain).</Text>
                    ) : null}

                    {healthConditions.map((hc, idx) => (
                        <View key={idx} style={{ marginBottom: 10 }}>
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
                                style={[styles.outlineBtn, { marginTop: 6 }]}
                                onPress={() => setHealthConditions(healthConditions.filter((_, i) => i !== idx))}
                            >
                                <Text style={styles.outlineBtnText}>Remove</Text>
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


                {/* Photos */}
                <View style={styles.card}>
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

                {/* Terms */}
                <TouchableOpacity
                    style={[styles.termsBtn, accept && styles.termsBtnActive]}
                    onPress={() => setAccept((v) => !v)}
                >
                    <Text style={styles.termsText}>
                        {accept ? "✓ " : ""}I accept the Terms & Conditions
                    </Text>
                </TouchableOpacity>

                <TouchableOpacity
                    disabled={!requiredFilled || loading}
                    style={[
                        styles.primaryBtn,
                        (!requiredFilled || loading) && styles.disabled,
                    ]}
                    onPress={submit}
                >
                    <Text style={styles.primaryBtnText}>
                        {loading ? "Saving…" : "Continue"}
                    </Text>
                </TouchableOpacity>

                <View style={{ height: 28 }} />
            </ScrollView>
        </Screen>
    );
}

/* ---------- Small, reusable UI bits ---------- */

function Label({ label, hint }: { label: string; hint?: string }) {
    return (
        <View style={{ marginBottom: 6 }}>
            <Text style={styles.label}>{label}</Text>
            {hint ? <Text style={styles.hint}>{hint}</Text> : null}
        </View>
    );
}

function Input(props: React.ComponentProps<typeof TextInput>) {
    return <TextInput {...props} style={[styles.input, props.style]} />;
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
                {imageUrl ? (
                    <Image source={{ uri: imageUrl }} style={styles.photoPreview} />
                ) : (
                    <View style={[styles.photoPreview, styles.photoEmpty]}>
                        {uploading ? <ActivityIndicator /> : <Text style={styles.muted}>No image</Text>}
                    </View>
                )}
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

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
    container: {
        padding: 16,
        backgroundColor: "#fff",
    },
    headerTitle: {
        fontSize: 22,
        fontWeight: "800",
        color: "#111",
        marginBottom: 12,
        textAlign: "center",
    },
    card: {
        borderWidth: 1,
        borderColor: "#eee",
        backgroundColor: "#fff",
        borderRadius: 14,
        padding: 14,
        marginBottom: 14,
        shadowColor: "#000",
        shadowOpacity: 0.04,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: "700",
        marginBottom: 10,
        color: "#111",
    },
    label: {
        fontSize: 13,
        fontWeight: "700",
        color: "#222",
    },
    hint: {
        fontSize: 12,
        color: "#888",
        marginTop: 2,
    },
    muted: {
        color: "#777",
        fontSize: 12.5,
        marginBottom: 10,
    },
    input: {
        borderWidth: 1,
        borderColor: "#e8e8e8",
        borderRadius: 10,
        padding: 12,
        fontSize: 15.5,
        backgroundColor: "#fafafa",
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
        borderColor: "#e6e6e6",
        backgroundColor: "#fff",
    },
    chipActive: {
        backgroundColor: "#111",
        borderColor: "#111",
    },
    chipText: {
        fontSize: 13.5,
        color: "#333",
        fontWeight: "600",
    },
    chipTextActive: {
        color: "#fff",
    },
    photoRow: {
        borderTopWidth: 1,
        borderTopColor: "#f3f3f3",
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
        borderColor: "#eee",
        backgroundColor: "#fafafa",
    },
    photoEmpty: {
        justifyContent: "center",
        alignItems: "center",
    },
    outlineBtn: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        backgroundColor: "#fff",
    },
    outlineBtnText: {
        fontSize: 13,
        fontWeight: "700",
        color: "#111",
    },
    dangerOutline: {
        borderColor: "#f2d3d3",
    },
    dangerText: {
        color: "#b50000",
    },
    termsBtn: {
        padding: 14,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "#e5e5e5",
        marginTop: 6,
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#fff",
    },
    termsBtnActive: {
        borderColor: "#111",
    },
    termsText: {
        fontWeight: "600",
        color: "#222",
    },
    primaryBtn: {
        marginTop: 12,
        paddingVertical: 14,
        borderRadius: 12,
        backgroundColor: "#111",
        alignItems: "center",
        justifyContent: "center",
    },
    primaryBtnText: {
        color: "#fff",
        fontSize: 16,
        fontWeight: "700",
    },
    disabled: {
        opacity: 0.5,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: "center",
        alignItems: "center",
        backgroundColor: "#fff",
    },
    loadingText: {
        marginTop: 10,
        fontSize: 16,
        color: "#666",
    },
});
