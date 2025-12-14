import remoteConfig from "@react-native-firebase/remote-config";
import { useEffect, useState } from "react";

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
    await remoteConfig().setConfigSettings({
      minimumFetchIntervalMillis: __DEV__ ? 0 : 6 * 60 * 60 * 1000,
    });
    await remoteConfig().fetchAndActivate();
    const config = readRuntimeConfig();
    cachedConfig = config;
    initialized = true;
    initPromise = null;
    return config;
  })().catch((err) => {
    initPromise = null;
    throw err;
  });

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
