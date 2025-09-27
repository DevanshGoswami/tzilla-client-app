// plugins/soft-input-resize.ts
import { AndroidConfig, ConfigPlugin, withAndroidManifest } from "@expo/config-plugins";

const withAdjustResize: ConfigPlugin = (config) => {
    return withAndroidManifest(config, (cfg) => {
        const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
        app.$["android:windowSoftInputMode"] = "adjustResize";
        return cfg;
    });
};

export default withAdjustResize;
