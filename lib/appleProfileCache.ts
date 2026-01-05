import * as SecureStore from "expo-secure-store";

const appleProfileKeys = {
  fullName: "tz_apple_full_name",
  email: "tz_apple_email",
};

export async function cacheAppleProfile(input: {
  fullName?: string;
  email?: string;
}) {
  const tasks: Promise<void>[] = [];
  if (input.fullName) {
    tasks.push(SecureStore.setItemAsync(appleProfileKeys.fullName, input.fullName));
  }
  if (input.email) {
    tasks.push(SecureStore.setItemAsync(appleProfileKeys.email, input.email));
  }
  await Promise.all(tasks);
}

export async function getCachedAppleProfile() {
  const [fullName, email] = await Promise.all([
    SecureStore.getItemAsync(appleProfileKeys.fullName),
    SecureStore.getItemAsync(appleProfileKeys.email),
  ]);
  return {
    fullName: fullName ?? undefined,
    email: email ?? undefined,
  };
}
