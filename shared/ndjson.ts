/** The wire format shared by the server and the client: one JSON event per line, ending with a `done` or `failed` event. */
const TERMINAL = new Set(["done", "failed"]);

export const encodeEvent = (event: { type: string }): string => `${JSON.stringify(event)}\n`;

export const failedEvent = (message: string) => ({ type: "failed" as const, message });

function errorText(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  return `Larry's server had a problem (${status}). Try again in a moment.`;
}

/**
 * Reads a streamed NDJSON response, yielding each line as an event. The server validates every event against the
 * shared schemas before sending it, so the client only checks the shape and keeps zod out of its first download;
 * pass `parse` (e.g. a schema's parse) to validate anyway. A rejected request throws the server's `{ error }` text,
 * and a stream that ends without a `done` or `failed` event throws.
 */
export async function* readEvents<T extends { type: string }>(response: Response, parse?: (raw: unknown) => T): AsyncGenerator<T> {
  if (!response.ok || !response.body) throw new Error(errorText(await response.json().catch(() => null), response.status));

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
      const event = parseLine(line, parse);
      ended ||= TERMINAL.has(event.type);
      yield event;
    }
    if (done) break;
  }
  if (!ended) throw new Error("Larry stopped before finishing");
}

/** POSTs to `url` and reads the NDJSON response. Throws the server's `{ error }` text when the request is rejected. */
export async function* streamEvents<T extends { type: string }>(url: string, init: RequestInit, parse?: (raw: unknown) => T): AsyncGenerator<T> {
  yield* readEvents<T>(await fetch(url, { method: "POST", ...init }), parse);
}

function parseLine<T extends { type: string }>(line: string, parse?: (raw: unknown) => T): T {
  try {
    const raw: unknown = JSON.parse(line);
    if (parse) return parse(raw);
    if (typeof raw === "object" && raw !== null && "type" in raw && typeof raw.type === "string") return raw as T;
  } catch {
    // Falls through to the error below.
  }
  throw new Error("Larry sent back something that doesn't add up");
}
