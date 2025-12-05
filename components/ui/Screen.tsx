// ui/Screen.tsx
import React from "react";
import { View, ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type Props = ViewProps & {
  withHeader?: boolean;
  backgroundColor?: string;
  headerColor?: string;
};

export default function Screen({
  children,
  style,
  withHeader = false,
  backgroundColor = "#f5f5f5",
  headerColor,
  ...rest
}: Props) {
  const insets = useSafeAreaInsets();
  const headerBg = headerColor ?? backgroundColor;

  return (
    <View style={[{ flex: 1, backgroundColor }, style]} {...rest}>
      {withHeader && (
        <View style={{ height: insets.top, backgroundColor: headerBg }} />
      )}
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>{children}</View>
    </View>
  );
}
