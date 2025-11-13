// ui/Screen.tsx
import React from "react";
import {View, ViewProps, Platform, BackHandler} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type Props = ViewProps & { withHeader?: boolean };

export default function Screen({ children, style, withHeader = false, ...rest }: Props) {
    const insets = useSafeAreaInsets();

    // React.useEffect(() => {
    //     const onBack = () => { /* ... */ return true; };
    //     const sub = BackHandler.addEventListener('hardwareBackPress', onBack);
    //     return () => sub.remove(); // ✅ new
    // }, []);

    return (
        <View style={[{ flex: 1, backgroundColor: "#f5f5f5" }, style]} {...rest}>
            {/* Top safe area for custom headers */}
            {withHeader && <View style={{ height: insets.top, backgroundColor: "#fff" }} />}
            {/* Content gets bottom inset so lists don’t hide behind system navbar */}
            <View style={{ flex: 1, paddingBottom: insets.bottom }}>{children}</View>
        </View>
    );
}
