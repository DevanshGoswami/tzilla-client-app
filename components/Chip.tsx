import { Pressable, Text } from "react-native";
export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
    return (
        <Pressable onPress={onPress} style={{ paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: selected ? "#111" : "#ccc", backgroundColor: selected ? "#111" : "transparent", margin: 6 }}>
            <Text style={{ color: selected ? "#fff" : "#111" }}>{label}</Text>
        </Pressable>
    );
}
