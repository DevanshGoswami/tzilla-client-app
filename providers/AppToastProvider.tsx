import { Ionicons } from "@expo/vector-icons";
import { Box, HStack, Text } from "native-base";
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type ToastPlacement = "top" | "bottom";
type ToastStatus = "success" | "error" | "warning" | "info";

export type AppToastOptions = {
  title: string;
  description?: string;
  placement?: ToastPlacement;
  duration?: number;
  status?: ToastStatus;
  bgColor?: string;
};

type ToastMessage = AppToastOptions & { id: string };

type ToastContextValue = {
  show: (options: AppToastOptions) => string;
  close: (id: string) => void;
};

const AppToastContext = createContext<ToastContextValue | null>(null);

const STATUS_STYLES: Record<
  ToastStatus,
  { bg: string; icon: keyof typeof Ionicons.glyphMap }
> = {
  success: { bg: "#16a34a", icon: "checkmark-circle-outline" },
  error: { bg: "#dc2626", icon: "alert-circle-outline" },
  warning: { bg: "#f97316", icon: "warning-outline" },
  info: { bg: "#2563eb", icon: "information-circle-outline" },
};

export function AppToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const close = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (options: AppToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const toast: ToastMessage = {
        placement: "top",
        duration: 3500,
        status: "info",
        ...options,
        id,
      };
      setToasts((prev) => [...prev, toast]);
      if (toast.duration && toast.duration > 0) {
        const timer = setTimeout(() => close(id), toast.duration);
        timers.current.set(id, timer);
      }
      return id;
    },
    [close]
  );

  const contextValue = useMemo(() => ({ show, close }), [show, close]);

  return (
    <AppToastContext.Provider value={contextValue}>
      {children}
      <ToastOverlay toasts={toasts} onHide={close} />
    </AppToastContext.Provider>
  );
}

export function useAppToast() {
  const ctx = useContext(AppToastContext);
  if (!ctx) {
    throw new Error("useAppToast must be used within AppToastProvider");
  }
  return ctx;
}

function ToastOverlay({
  toasts,
  onHide,
}: {
  toasts: ToastMessage[];
  onHide: (id: string) => void;
}) {
  if (!toasts.length) return null;

  const placements: ToastPlacement[] = ["top", "bottom"];
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={() => {}}
    >
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        <SafeAreaView style={styles.safeArea} pointerEvents="box-none">
          {placements.map((placement) => {
            const items = toasts.filter(
              (toast) => (toast.placement ?? "top") === placement
            );
            if (!items.length) return null;
            return (
              <View
                key={placement}
                style={[
                  styles.placementContainer,
                  placement === "top"
                    ? { top: insets.top + 16 }
                    : { bottom: insets.bottom + 24 },
                ]}
                pointerEvents="box-none"
              >
                {items.map((toast) => (
                  <Pressable
                    key={toast.id}
                    onPress={() => onHide(toast.id)}
                    style={styles.toastPressable}
                  >
                    <ToastCard toast={toast} />
                  </Pressable>
                ))}
              </View>
            );
          })}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function ToastCard({ toast }: { toast: ToastMessage }) {
  const status =
    toast.status && STATUS_STYLES[toast.status]
      ? STATUS_STYLES[toast.status]
      : STATUS_STYLES.info;
  const background = toast.bgColor ?? status.bg;
  const icon = toast.status ? STATUS_STYLES[toast.status].icon : status.icon;

  return (
    <Box
      bg={background}
      px={4}
      py={3}
      borderRadius={16}
      shadow={6}
      minW="72"
      maxW="90%"
    >
      <HStack space={3} alignItems="flex-start">
        <Ionicons name={icon} color="#fff" size={20} />
        <Box flex={1}>
          <Text color="white" fontWeight="semibold">
            {toast.title}
          </Text>
          {toast.description ? (
            <Text color="rgba(255,255,255,0.8)" fontSize="xs" mt={1}>
              {toast.description}
            </Text>
          ) : null}
        </Box>
      </HStack>
    </Box>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  placementContainer: {
    left: 0,
    right: 0,
    alignItems: "center",
    position: "absolute",
    paddingHorizontal: 16,
    gap: 8,
  },
  toastPressable: {
    alignSelf: "center",
    width: "90%",
    maxWidth: 420,
  },
});
