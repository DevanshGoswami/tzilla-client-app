// lib/upload.ts
import { getRuntimeConfigValue } from "@/lib/remoteConfig";

const apiBase = () => getRuntimeConfigValue("apiUrl");

type PresignOut = {
    uploadUrl: string;   // signed PUT url
    key: string;         // S3 object key
    fileUrl?: string;    // sometimes server returns a read URL; optional
    maxSize?: number;    // optional server hint
};

/**
 * Presign an S3 PUT. Supports BOTH:
 *  1) GET  {API}/api/aws/presign?type=...   (returns { url, key, maxSize })
 *  2) POST {API}/aws/presign                (returns { uploadUrl, key, fileUrl, maxSize })
 *
 * Always returns: { uploadUrl, key, fileUrl?, maxSize? }
 */
export async function presignImage(
    token: string,
    contentType: string,
    role: "client" | "trainer" = "client"
): Promise<PresignOut> {
    // First try the newer POST route
    const tryPost = async (): Promise<PresignOut | null> => {
        try {
            const res = await fetch(`${apiBase()}/aws/presign`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`,
                    role,
                },
                body: JSON.stringify({ contentType }),
            });
            if (!res.ok) return null;
            const json = await res.json();
            // normalize
            return {
                uploadUrl: json.uploadUrl || json.url, // some stacks still use "url"
                key: json.key,
                fileUrl: json.fileUrl,
                maxSize: json.maxSize,
            };
        } catch {
            return null;
        }
    };

    // Fallback to legacy GET route
    const tryGet = async (): Promise<PresignOut> => {
        const u = `${apiBase()}/api/aws/presign?type=${encodeURIComponent(contentType)}`;
        const res = await fetch(u, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                role,
            },
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`presign failed: ${res.status} ${text}`);
        }
        const json = await res.json();
        return {
            uploadUrl: json.uploadUrl || json.url, // legacy returns { url, key, maxSize }
            key: json.key,
            fileUrl: json.fileUrl,                 // some backends include it
            maxSize: json.maxSize,
        };
    };

    const post = await tryPost();
    if (post && post.uploadUrl && post.key) return post;
    return await tryGet();
}

/**
 * PUT the file/blob to S3. Handles RN quirkiness and 200/204 responses.
 * Throws on non-OK.
 */
export async function putToS3(uploadUrl: string, blob: Blob | ArrayBuffer | Uint8Array, mime: string) {
    // Some S3 setups return 200, others 204; both are OK. We just check res.ok.
    const headers: Record<string, string> = { "Content-Type": mime || "application/octet-stream" };

    // Abort after 60s to avoid hanging builds on flaky networks
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 60_000);

    try {
        const res = await fetch(uploadUrl, {
            method: "PUT",
            headers,
            body: blob as any,
            signal: controller.signal,
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error(`upload failed: ${res.status} ${text}`);
        }
    } finally {
        clearTimeout(to);
    }
}
