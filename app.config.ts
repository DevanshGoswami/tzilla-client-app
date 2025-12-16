import { config as loadEnv } from "dotenv";
import type { ExpoConfig, ConfigContext } from "expo/config";

loadEnv();

const appJson = require("./app.json");

const RUNTIME_ENV_KEYS = {
  apiUrl: "EXPO_PUBLIC_API_URL",
  socketUrl: "EXPO_PUBLIC_SOCKET_URL",
  razorpayKeyId: "EXPO_PUBLIC_RAZORPAY_KEY_ID",
  googleAndroidClientId: "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
  googleIosClientId: "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
  googleWebClientId: "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
} as const;

type RuntimeConfig = Record<keyof typeof RUNTIME_ENV_KEYS, string>;

function buildRuntimeConfig(): Partial<RuntimeConfig> {
  const runtimeConfig: Partial<RuntimeConfig> = {};
  (Object.keys(RUNTIME_ENV_KEYS) as Array<keyof typeof RUNTIME_ENV_KEYS>).forEach(
    (key) => {
      const envKey = RUNTIME_ENV_KEYS[key];
      const value = process.env[envKey];
      if (value && value.trim()) {
        runtimeConfig[key] = value.trim();
      }
    }
  );
  return runtimeConfig;
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const baseExpoConfig: ExpoConfig = {
    ...(appJson.expo as ExpoConfig),
    ...config,
  };

  const mergedRuntime = {
    ...(baseExpoConfig.extra?.runtimeConfig ?? {}),
    ...buildRuntimeConfig(),
  };

  return {
    ...baseExpoConfig,
    extra: {
      ...(baseExpoConfig.extra ?? {}),
      runtimeConfig: mergedRuntime,
    },
  };
};
