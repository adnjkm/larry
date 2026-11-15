import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { GenCourse } from "../shared/course/gen.ts";
import type { Photo } from "./streamKit.ts";

export type GenerateOpts = { signal?: AbortSignal; onProgress?: (event: { type: string }) => void };
export type Generate = (photos: Photo[], opts: GenerateOpts) => Promise<GenCourse>;
export type CourseResult = { course: GenCourse; cached: boolean };

/** Hash of the photo bytes, in order. The same photos give the same hash however the request was encoded. */
export function hashPhotos(photos: readonly Photo[]): string {
  const hash = createHash("sha256");
  for (const photo of photos) {
    const bytes = Buffer.from(photo.base64, "base64");
    hash.update(`${bytes.length}:`).update(bytes);
  }
  return hash.digest("hex").slice(0, 32);
}

type Flight = {
  promise: Promise<GenCourse>;
  abort: AbortController;
  waiters: number;
  listeners: Set<(event: { type: string }) => void>;
};

/**
 * Courses cached on disk under `dir` by the hash of the photos. Requests for the same photos at the same time share one
 * generation, which is only aborted once every one of them has gone away.
 */
export function createCourseCache(options: { dir: string; generate: () => Promise<Generate> | Generate }) {
  const { dir } = options;
  const flights = new Map<string, Flight>();
  const fileOf = (hash: string) => `${dir}/${hash}.json`;

  async function read(hash: string): Promise<GenCourse | undefined> {
    try {
      return GenCourse.parse(JSON.parse(await readFile(fileOf(hash), "utf8")));
    } catch {
      // Missing or no longer valid: generate again.
      return undefined;
    }
  }

  async function write(hash: string, course: GenCourse) {
    await mkdir(dir, { recursive: true });
    const tmp = `${fileOf(hash)}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(course));
    await rename(tmp, fileOf(hash));
  }

  function start(hash: string, photos: Photo[]): Flight {
    const flight: Flight = { promise: undefined as never, abort: new AbortController(), waiters: 0, listeners: new Set() };
    flight.promise = (async () => {
      const generate = await options.generate();
      const course = GenCourse.parse(
        await generate(photos, { signal: flight.abort.signal, onProgress: (event) => flight.listeners.forEach((listener) => listener(event)) }),
      );
      await write(hash, course).catch((error: unknown) => console.error("course cache write failed", error));
      return course;
    })().finally(() => {
      if (flights.get(hash) === flight) flights.delete(hash);
    });
    flights.set(hash, flight);
    return flight;
  }

  /** The course for these photos: from disk if cached (unless `fresh`), else from the generation already running, else a new one. */
  async function get(
    photos: Photo[],
    opts: { fresh?: boolean; signal?: AbortSignal; onProgress?: (event: { type: string }) => void } = {},
  ): Promise<CourseResult> {
    const hash = hashPhotos(photos);
    const running = flights.get(hash);
    if (!running && !opts.fresh) {
      const cached = await read(hash);
      if (cached) return { course: cached, cached: true };
    }
    const flight = flights.get(hash) ?? start(hash, photos);
    flight.waiters++;
    if (opts.onProgress) flight.listeners.add(opts.onProgress);

    let onAbort: (() => void) | undefined;
    const gone = new Promise<never>((_, reject) => {
      onAbort = () => reject(opts.signal?.reason ?? new DOMException("Aborted", "AbortError"));
      if (opts.signal?.aborted) onAbort();
      else opts.signal?.addEventListener("abort", onAbort, { once: true });
    });
    try {
      return { course: await Promise.race([flight.promise, gone]), cached: false };
    } finally {
      if (onAbort) opts.signal?.removeEventListener("abort", onAbort);
      if (opts.onProgress) flight.listeners.delete(opts.onProgress);
      if (--flight.waiters === 0) {
        // Nobody left to hear the answer. A finished flight is already out of the map.
        if (flights.get(hash) === flight) flights.delete(hash);
        flight.abort.abort();
      }
    }
  }

  return { get, inFlight: () => flights.size };
}
export type CourseCache = ReturnType<typeof createCourseCache>;
