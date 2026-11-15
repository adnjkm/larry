import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { stream } from "hono/streaming";
import { encodeEvent, failedEvent } from "../shared/ndjson.ts";
import { MAX_PHOTOS } from "../shared/photos.ts";
import { type CourseCache, type Generate, createCourseCache } from "./courseCache.ts";
import type { Photo } from "./streamKit.ts";

/** Event types the route sends itself; a generator's own progress events never use them. */
const RESERVED = new Set(["started", "done", "failed"]);
const MEDIA_TYPES = new Set<Photo["mediaType"]>(["image/jpeg", "image/png", "image/webp"]);

/** The generator modules are imported by name so the server starts even while they are not written yet. */
async function loadGenerator(staged: boolean): Promise<Generate> {
  async function load(file: string, name: string): Promise<Generate | undefined> {
    try {
      const mod = (await import(`./${file}.ts`)) as Record<string, unknown>;
      return typeof mod[name] === "function" ? (mod[name] as Generate) : undefined;
    } catch (error) {
      if ((error as { code?: string }).code === "ERR_MODULE_NOT_FOUND") return undefined;
      throw error;
    }
  }
  const found = (staged ? await load("genCourseStaged", "generateCourseStaged") : undefined) ?? (await load("genCourse", "generateCourse"));
  if (!found) throw new Error("The course generator is not available yet (server/genCourse.ts has no generateCourse)");
  return found;
}

const defaultCache = (staged: boolean) =>
  createCourseCache({ dir: fileURLToPath(new URL("../out/gen/cache/", import.meta.url)), generate: () => loadGenerator(staged) });

/** POST /api/course: photos as form data (the same `photo` fields as /api/kits), answered with NDJSON ending in `done` (with the course) or `failed`. */
export function createCourseRoute(caches: { plain: CourseCache; staged: CourseCache } = { plain: defaultCache(false), staged: defaultCache(true) }) {
  return new Hono().post("/api/course", async (c) => {
    const form = await c.req.formData().catch(() => null);
    const files = (form?.getAll("photo") ?? []).filter((v): v is File => v instanceof File);
    if (files.length === 0 || files.length > MAX_PHOTOS) return c.json({ error: `Send 1 to ${MAX_PHOTOS} photos` }, 400);

    const photos: Photo[] = [];
    for (const file of files) {
      if (!MEDIA_TYPES.has(file.type as Photo["mediaType"])) return c.json({ error: `Unsupported image type ${file.type}` }, 415);
      photos.push({ mediaType: file.type as Photo["mediaType"], base64: Buffer.from(await file.arrayBuffer()).toString("base64") });
    }
    const cache = c.req.query("staged") === "1" ? caches.staged : caches.plain;
    const fresh = c.req.query("fresh") === "1";

    c.header("Content-Type", "application/x-ndjson");
    return stream(c, async (out) => {
      const disconnected = new AbortController();
      out.onAbort(() => disconnected.abort());
      const send = (event: { type: string; [key: string]: unknown }) => out.write(encodeEvent(event)).catch(() => {});
      await send({ type: "started" });
      try {
        const started = Date.now();
        const { course, cached } = await cache.get(photos, {
          fresh,
          signal: disconnected.signal,
          onProgress: (event) => !RESERVED.has(event.type) && void send(event),
        });
        console.log(`course: ${cached ? "cached" : `generated in ${((Date.now() - started) / 1000).toFixed(1)}s`}`);
        await send({ type: "done", course, cached });
      } catch (error) {
        if (out.aborted) return;
        console.error(error);
        await send(failedEvent(error instanceof Error ? error.message : "Larry couldn't build this lesson"));
      }
    });
  });
}

export const courseRoute = createCourseRoute();
