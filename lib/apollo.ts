import { ApolloClient, InMemoryCache, createHttpLink, ApolloLink, type FetchResult } from "@apollo/client";
import { setContext } from "@apollo/client/link/context";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import {jwtDecode} from "jwt-decode";
import { onError } from "@apollo/client/link/error";
import { Observable } from "@apollo/client";
import {ENV} from "@/lib/env";

// --- Token change event bus (notify app when tokens update) ---
type Listener = () => void;
const _tokenListeners = new Set<Listener>();

export function onTokensChanged(fn: Listener) {
  _tokenListeners.add(fn);
  return () => _tokenListeners.delete(fn);
}
function _notifyTokensChanged() {
  _tokenListeners.forEach((fn) => {
    try { fn(); } catch {}
  });
}



// Token management functions
export const tokenKeys = {
  access: "tz_access_token",
  refresh: "tz_refresh_token",
};

export async function saveTokens(accessToken: string, refreshToken: string) {
  await SecureStore.setItemAsync(tokenKeys.access, accessToken);
  await SecureStore.setItemAsync(tokenKeys.refresh, refreshToken);
  _notifyTokensChanged(); // <— NEW
}

export async function clearTokens() {
  await SecureStore.deleteItemAsync(tokenKeys.access);
  await SecureStore.deleteItemAsync(tokenKeys.refresh);
  _notifyTokensChanged(); // <— NEW
}

// --- Add near top (module scope) ---
let refreshInFlight: Promise<string | null> | null = null;

async function getValidAccessToken(): Promise<string | null> {
  const { accessToken, refreshToken } = await getRawTokens();
  // If we have a non-expired access token, just use it
  if (accessToken && !isTokenExpired(accessToken)) return accessToken;

  // If we have no refresh token, we can't recover
  if (!refreshToken) return null;

  // Dedupe concurrent refreshes
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const newAccess = await refreshAccessToken();
        return newAccess; // can be null if refresh failed
      } finally {
        refreshInFlight = null;
      }
    })();
  }
  return refreshInFlight;
}

// --- Replace your existing getTokens with these two functions ---

async function getRawTokens() {
  const accessToken = await SecureStore.getItemAsync(tokenKeys.access);
  const refreshToken = await SecureStore.getItemAsync(tokenKeys.refresh);
  return { accessToken, refreshToken };
}

/**
 * Always returns a valid, non-expired access token if possible.
 * If the stored access token is expired but a refresh token exists,
 * this will refresh and persist new tokens before returning.
 *
 * On failure, returns { accessToken: null, refreshToken: null }.
 */
export async function getTokens() {
  try {
    const { refreshToken } = await getRawTokens();

    // Ensure we end up with a valid (refreshed if needed) access token
    const validAccessToken = await getValidAccessToken();

    if (!validAccessToken || !refreshToken) {
      // Hard failure – clear to avoid using bad state elsewhere
      await clearTokens();
      return { accessToken: null, refreshToken: null };
    }

    return { accessToken: validAccessToken, refreshToken };
  } catch (e) {
    console.warn("getTokens failed:", e);
    await clearTokens();
    return { accessToken: null, refreshToken: null };
  }
}


// Function to check if token is expired
export function isTokenExpired(token: string): boolean {
  try {
    const decoded: { exp?: number } = jwtDecode(token);
    const currentTime = Date.now() / 1000;
    return (decoded.exp ?? 0) < currentTime + 30; // 30s buffer
  } catch {
    return true;
  }
}
// Function to refresh the access token
export async function refreshAccessToken(): Promise<string | null> {
  try {
    const { refreshToken } = await getRawTokens();

    if (!refreshToken) {
      throw new Error("No refresh token available");
    }

    // Make a direct HTTP request to refresh the token
    // We can't use the Apollo client here to avoid circular dependencies
    const response = await fetch(ENV.API_URL + '/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'role': 'client'
      },
      body: JSON.stringify({
        query: `
          mutation RefreshAccessToken($refreshToken: String!) {
            refreshAccessToken(refreshToken: $refreshToken) {
              accessToken
              refreshToken
            }
          }
        `,
        variables: { refreshToken }
      })
    });

    const data = await response.json();

    if (data.errors) {
      throw new Error(data.errors[0]?.message || "Failed to refresh token");
    }

    const newAccessToken = data.data?.refreshAccessToken?.accessToken;
    const newRefreshToken = data.data?.refreshAccessToken?.refreshToken;

    if (newAccessToken && newRefreshToken) {
      await saveTokens(newAccessToken, newRefreshToken);
      return newAccessToken;
    }

    throw new Error("Invalid refresh response");
  } catch (error) {
    console.error("Token refresh failed:", error);
    // Clear tokens and redirect to login
    await clearTokens();
    router.replace("/(auth)/login");
    return null;
  }
}

// Create the HTTP link
const httpLink = createHttpLink({
  uri: ENV.API_URL + '/graphql'
});

// Auth link with token refresh logic
const authLink = setContext(async (_, { headers }) => {
  try {
    let { accessToken } = await getRawTokens();

    // Check if token exists and is expired
    if (accessToken && isTokenExpired(accessToken)) {
      console.log("Access token expired, refreshing...");
      accessToken = await refreshAccessToken();
    }

    return {
      headers: {
        ...headers,
        role: 'client',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    };
  } catch (error) {
    console.error("Auth link error:", error);
    return { headers };
  }
});

// Error link to handle authentication errors
// @ts-ignore
const errorLink = onError(({ graphQLErrors, networkError, operation, forward }) => {
  if (graphQLErrors) {
    for (const err of graphQLErrors) {
      if (
          err.extensions?.code === "UNAUTHENTICATED" ||
          err.message?.toLowerCase().includes("unauthorized") ||
          err.message?.toLowerCase().includes("jwt expired")
      ) {
        return new Observable(observer => {
          refreshAccessToken()
              .then(newAccessToken => {
                if (!newAccessToken) {
                  observer.complete(); // No new token, abort
                  return;
                }
                // Retry the operation with updated auth header
                const oldHeaders = operation.getContext().headers;
                operation.setContext({
                  headers: {
                    ...oldHeaders,
                    Authorization: `Bearer ${newAccessToken}`,
                    role: "client",
                  },
                });
                // Forward the operation, pass results to the observer
                const subscriber = forward(operation).subscribe({
                  next: result => observer.next(result),
                  error: err => observer.error(err),
                  complete: () => observer.complete(),
                });
                return () => subscriber.unsubscribe();
              })
              .catch(error => {
                observer.error(error);
              });
        });
      }
    }
  }

  if (networkError) {
    console.error(`[Network error]:`, networkError);
  }
});
// Combine all links

const loggingLink = new ApolloLink((operation, forward) => {
  const startTime = Date.now();

  console.log("🚀 GraphQL Request:", {
    operationName: operation.operationName,
    variables: operation.variables,
  });

  return new Observable<FetchResult<Record<string, unknown>>>((observer) => {
    const sub = forward(operation).subscribe({
      next: (result: FetchResult) => {
        const duration = Date.now() - startTime;
        console.log("✅ GraphQL Response:", {
          operationName: operation.operationName,
          duration: `${duration}ms`,
        });
        observer.next(result);
      },
      error: (error: unknown) => {
        const duration = Date.now() - startTime;
        console.log("❌ GraphQL Error:", {
          operationName: operation.operationName,
          duration: `${duration}ms`,
          error,
        });
        observer.error(error);
      },
      complete: () => observer.complete(),
    });

    return () => sub.unsubscribe();
  });
});


const link = ApolloLink.from([
  errorLink,
  authLink,
  loggingLink,
  httpLink,
]);

// Create Apollo Client
export const apollo = new ApolloClient({
  link,
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
      errorPolicy: 'all',
    },
    query: {
      fetchPolicy: 'network-only',
      errorPolicy: 'all',
    },
  },
});

// Export a logout function that can be called from anywhere
export async function logout() {
  await clearTokens();
  // Clear Apollo cache
  await apollo.clearStore();
  // Navigate to login
  router.replace("/(auth)/login");
}