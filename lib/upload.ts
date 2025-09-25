const API_BASE = process.env.EXPO_PUBLIC_API_URL || "http://localhost:4000";

export async function presignImage(token: string, contentType: string) {
    const res = await fetch(`${API_BASE}/aws/presign`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ contentType }),
    });
    if (!res.ok) throw new Error(`presign failed: ${res.status}`);
    return res.json() as Promise<{ uploadUrl: string; fileUrl: string; key: string }>;
}

export async function putToS3(uploadUrl: string, blob: Blob, mime: string) {
    const res = await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": mime }, body: blob });
    if (!res.ok) throw new Error(`upload failed: ${res.status}`);
}
