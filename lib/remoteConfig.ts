import AsyncStorage from "@react-native-async-storage/async-storage";
import remoteConfig from "@react-native-firebase/remote-config";
import Constants from "expo-constants";
import { useEffect, useState } from "react";

declare const process: {
  env?: Record<string, string | undefined>;
};

const RC_KEYS = {
  apiUrl: "api_url",
  socketUrl: "socket_url",
  razorpayKeyId: "razorpay_key_id",
  googleAndroidClientId: "google_android_client_id",
  googleIosClientId: "google_ios_client_id",
  googleWebClientId: "google_web_client_id",
} as const;

type RemoteKey = keyof typeof RC_KEYS;

export type RuntimeConfig = {
  apiUrl: string;
  socketUrl: string;
  razorpayKeyId: string;
  googleAndroidClientId: string;
  googleIosClientId: string;
  googleWebClientId: string;
};

let cachedConfig: RuntimeConfig | null = null;

let initPromise: Promise<RuntimeConfig> | null = null;
let initialized = false;

const STORAGE_KEY = "tz_runtime_config_cache_v1";

const ENV_KEY_MAP: Record<RemoteKey, string> = {
  apiUrl: "EXPO_PUBLIC_API_URL",
  socketUrl: "EXPO_PUBLIC_SOCKET_URL",
  razorpayKeyId: "EXPO_PUBLIC_RAZORPAY_KEY_ID",
  googleAndroidClientId: "EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID",
  googleIosClientId: "EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID",
  googleWebClientId: "EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID",
};

function isRuntimeConfig(value: any): value is RuntimeConfig {
  if (!value || typeof value !== "object") return false;
  return (Object.keys(RC_KEYS) as RemoteKey[]).every((key) => {
    const v = value[key];
    return typeof v === "string" && v.trim().length > 0;
  });
}

function getBundledRuntimeConfig(): RuntimeConfig | null {
  const extraRuntime =
    ((Constants.expoConfig?.extra as any)?.runtimeConfig as Partial<
      RuntimeConfig
    > | undefined) ?? {};

  const envValues: Partial<RuntimeConfig> = {};
  (Object.keys(RC_KEYS) as RemoteKey[]).forEach((key) => {
    const envKey = ENV_KEY_MAP[key];
    const envValue = process?.env?.[envKey];
    if (envValue && envValue.trim()) {
      envValues[key] = envValue.trim();
    }
  });

  const merged = { ...extraRuntime, ...envValues };
  return isRuntimeConfig(merged) ? (merged as RuntimeConfig) : null;
}

async function loadCachedRuntimeConfig(): Promise<RuntimeConfig | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isRuntimeConfig(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function persistRuntimeConfig(config: RuntimeConfig) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {
    // ignore persistence failures
  }
}

const bundledRuntimeConfig = getBundledRuntimeConfig();

function readRuntimeConfig(): RuntimeConfig {
  const instance = remoteConfig();
  const missing: string[] = [];
  const result = {} as RuntimeConfig;

  (Object.keys(RC_KEYS) as RemoteKey[]).forEach((key) => {
    const rcKey = RC_KEYS[key];
    const value = instance.getValue(rcKey).asString()?.trim() ?? "";
    if (!value) {
      missing.push(rcKey);
    } else {
      result[key] = value;
    }
  });

  if (missing.length) {
    throw new Error(`[remote-config] Missing keys: ${missing.join(", ")}`);
  }

  return result;
}

export async function ensureRemoteConfig(): Promise<RuntimeConfig> {
  if (initialized && cachedConfig) return cachedConfig;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      await remoteConfig().setConfigSettings({
        minimumFetchIntervalMillis: __DEV__ ? 0 : 6 * 60 * 60 * 1000,
      });

      if (bundledRuntimeConfig) {
        const defaults: Record<string, string> = {};
        (Object.keys(RC_KEYS) as RemoteKey[]).forEach((key) => {
          defaults[RC_KEYS[key]] = bundledRuntimeConfig[key];
        });
        try {
          await remoteConfig().setDefaults(defaults);
        } catch {
          // ignore inability to seed defaults
        }
      }

      await remoteConfig().fetchAndActivate();
      const config = readRuntimeConfig();
      cachedConfig = config;
      initialized = true;
      await persistRuntimeConfig(config);
      initPromise = null;
      return config;
    } catch (err) {
      console.warn("[remote-config] fetch failed", err);
      const cached = await loadCachedRuntimeConfig();
      if (cached) {
        cachedConfig = cached;
        initialized = true;
        initPromise = null;
        return cached;
      }
      if (bundledRuntimeConfig) {
        console.warn("[remote-config] using bundled fallback config");
        cachedConfig = bundledRuntimeConfig;
        initialized = true;
        initPromise = null;
        return bundledRuntimeConfig;
      }
      initPromise = null;
      throw err;
    }
  })();

  return initPromise;
}

export function getRuntimeConfig(): RuntimeConfig {
  if (!cachedConfig) {
    throw new Error("Runtime config accessed before initialization");
  }
  return cachedConfig;
}

export function getRuntimeConfigValue(key: RemoteKey): string {
  return getRuntimeConfig()[key];
}

export function useRuntimeConfig(): RuntimeConfig {
  const [config, setConfig] = useState<RuntimeConfig | null>(cachedConfig);

  useEffect(() => {
    if (config) return;
    ensureRemoteConfig()
      .then(setConfig)
      .catch((err) => console.warn("[remote-config] init error", err));
  }, [config]);

  if (!config) {
    throw new Error("Runtime config hook used before initialization");
  }

  return config;
}
