import { useEffect } from "react";
import { Platform } from "react-native";
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
} from "expo-tracking-transparency";

export default function TrackingPermissionGate() {
  useEffect(() => {
    let mounted = true;
    if (Platform.OS !== "ios") return () => { mounted = false; };
    (async () => {
      try {
        const { status } = await getTrackingPermissionsAsync();
        if (!mounted) return;
        if (status === "undetermined") {
          await requestTrackingPermissionsAsync();
        }
      } catch (err) {
        console.warn("Tracking permission check failed:", err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  return null;
}
