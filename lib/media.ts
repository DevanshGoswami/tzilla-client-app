import { getRuntimeConfigValue } from "@/lib/remoteConfig";

const absoluteUrl = /^https?:\/\//i;
const s3UrlCache = new Map<string, string>();

export function isFullUrl(value?: string | null): value is string {
  return typeof value === "string" && absoluteUrl.test(value);
}

/**
 * Resolves an S3 object key to a signed URL that can be used by Image/Avatar components.
 * Results are cached for the lifetime of the session to avoid redundant presign calls.
 */
export async function resolveS3KeyToUrl(
  key?: string | null,
  token?: string | null
): Promise<string | undefined> {
  if (!key) return undefined;
  if (isFullUrl(key)) return key;

  const cached = s3UrlCache.get(key);
  if (cached) return cached;
  if (!token) return undefined;

  try {
    const resp = await fetch(`${getRuntimeConfigValue("apiUrl")}/api/aws/media/${encodeURIComponent(key)}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        role: "client",
      },
    });

    if (!resp.ok) return undefined;
    const data = (await resp.json()) as { url?: string | null };
    if (data?.url) {
      s3UrlCache.set(key, data.url);
      return data.url;
    }
  } catch {
    // ignore – we'll try again the next time someone asks for this key
  }
  return undefined;
}
