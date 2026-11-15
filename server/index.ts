import { serve } from "@hono/node-server";
import { type Context, Hono } from "hono";
import { stream } from "hono/streaming";
import { KitError, parseKit } from "../shared/kit.ts";
import { LessonError, Shown } from "../shared/lesson.ts";
import { encodeEvent, failedEvent } from "../shared/ndjson.ts";
import { MAX_PHOTOS } from "../shared/photos.ts";
import { type Photo, streamKit } from "./streamKit.ts";
import { streamLesson } from "./streamLesson.ts";

const MEDIA_TYPES = new Set<Photo["mediaType"]>(["image/jpeg", "image/png", "image/webp"]);

/** Streams events as NDJSON. An error after the stream has started becomes a `failed` event, and a client that disconnects aborts `events`. */
function ndjson(c: Context, events: (signal: AbortSignal) => AsyncGenerator<{ type: string }>, failure: (error: unknown) => string) {
  c.header("Content-Type", "application/x-ndjson");
  return stream(c, async (out) => {
    const disconnected = new AbortController();
    out.onAbort(() => disconnected.abort());
    try {
      for await (const event of events(disconnected.signal)) {
        if (out.aborted) break;
        await out.write(encodeEvent(event));
      }
    } catch (error) {
      if (out.aborted) return;
      console.error(error);
      await out.write(encodeEvent(failedEvent(failure(error))));
    }
  });
}

const app = new Hono()
  .post("/api/kits", async (c) => {
    const form = await c.req.formData();
    const files = form.getAll("photo").filter((v): v is File => v instanceof File);
    if (files.length === 0 || files.length > MAX_PHOTOS) return c.json({ error: `Send 1 to ${MAX_PHOTOS} photos` }, 400);

    const photos: Photo[] = [];
    for (const file of files) {
      if (!MEDIA_TYPES.has(file.type as Photo["mediaType"])) return c.json({ error: `Unsupported image type ${file.type}` }, 415);
      photos.push({ mediaType: file.type as Photo["mediaType"], base64: Buffer.from(await file.arrayBuffer()).toString("base64") });
    }

    const events = (signal: AbortSignal) => streamKit(photos, { onStats: (s) => console.log(`kit: first part ${s.firstPartMs}ms, done ${s.ms}ms, $${s.costUsd.toFixed(3)}`), signal });
    return ndjson(c, events, (error) => (error instanceof KitError ? "Larry built an inconsistent kit" : "Larry couldn't build this one"));
  })
  .post("/api/lessons", async (c) => {
    const body: unknown = await c.req.json().catch(() => null);
    const request = (body ?? {}) as { kit?: unknown; resume?: unknown };
    let kit;
    try {
      kit = parseKit(request.kit);
    } catch {
      return c.json({ error: "Send the kit to plan a lesson for" }, 400);
    }
    const resume = request.resume === undefined ? undefined : Shown.safeParse(request.resume);
    if (resume && !resume.success) return c.json({ error: "The lesson to continue from is not valid" }, 400);
    const events = (signal: AbortSignal) =>
      streamLesson(kit, {
        resume: resume?.data,
        signal,
        onStats: (s) => console.log(`lesson: first chapter ${s.firstChapterMs}ms, done ${s.ms}ms, $${s.costUsd.toFixed(3)}, ${s.attempts} attempt(s)`),
      });
    return ndjson(c, events, (error) => (error instanceof LessonError ? "Larry's plan didn't hold together" : "Larry couldn't plan this one"));
  });

serve({ fetch: app.fetch, port: Number(process.env.LARRY_API_PORT ?? 8787) }, ({ port }) => console.log(`server on :${port}`));
