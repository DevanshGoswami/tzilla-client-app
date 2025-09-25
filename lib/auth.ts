import * as SecureStore from "expo-secure-store";

export const tokenKeys = {
  access: "tz_access_token",
  refresh: "tz_refresh_token",
};

export async function saveTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(tokenKeys.access, accessToken);
  await SecureStore.setItemAsync(tokenKeys.refresh, refreshToken);
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(tokenKeys.access);
  await SecureStore.deleteItemAsync(tokenKeys.refresh);
}
