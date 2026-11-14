import type { z } from "zod";

function errorText(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  return `Request failed (${status})`;
}

/**
 * Reads a streamed NDJSON response, yielding each line parsed with `schema`. A rejected request throws the server's
 * `{ error }` text, and a stream that ends without a `done` or `failed` event throws.
 */
export async function* readEvents<T extends { type: string }>(response: Response, schema: z.ZodType<T>): AsyncGenerator<T> {
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
      const event = parseLine(line, schema);
      ended ||= event.type === "done" || event.type === "failed";
      yield event;
    }
    if (done) break;
  }
  if (!ended) throw new Error("Larry stopped before finishing");
}

function parseLine<T>(line: string, schema: z.ZodType<T>): T {
  try {
    return schema.parse(JSON.parse(line));
  } catch {
    throw new Error("Larry sent back something that doesn't add up");
  }
}
