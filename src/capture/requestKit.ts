import { KitEvent } from "../../shared/kit.ts";

export async function* requestKit(photos: Blob[]): AsyncGenerator<KitEvent> {
  const form = new FormData();
  photos.forEach((photo, i) => form.append("photo", photo, `photo-${i}.jpg`));

  const response = await fetch("/api/kits", { method: "POST", body: form });
  if (!response.ok || !response.body) {
    const body: unknown = await response.json().catch(() => null);
    const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string" ? body.error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  let ended = false;
  for (;;) {
    const { done, value } = await reader.read();
    buffer += value ?? "";
    const lines = buffer.split("\n");
    buffer = done ? "" : (lines.pop() ?? "");
    for (const line of lines) {
      if (!line.trim()) continue;
      const event = parseEvent(line);
      ended ||= event.type === "done" || event.type === "failed";
      yield event;
    }
    if (done) break;
  }
  if (!ended) throw new Error("Larry stopped before finishing");
}

function parseEvent(line: string): KitEvent {
  try {
    return KitEvent.parse(JSON.parse(line));
  } catch {
    throw new Error("Larry sent back something that doesn't add up");
  }
}
