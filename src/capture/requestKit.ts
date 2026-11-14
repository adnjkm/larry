import { type Kit, parseKit } from "../../shared/kit.ts";

export async function requestKit(photos: Blob[]): Promise<Kit> {
  const form = new FormData();
  photos.forEach((photo, i) => form.append("photo", photo, `photo-${i}.jpg`));

  const response = await fetch("/api/kits", { method: "POST", body: form });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  try {
    return parseKit(body);
  } catch {
    throw new Error("Larry sent back a kit that doesn't add up");
  }
}
