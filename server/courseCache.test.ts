import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { GenCourse } from "../shared/course/gen.ts";
import { type Generate, createCourseCache, hashPhotos } from "./courseCache.ts";
import { createCourseRoute } from "./courseRoute.ts";
import type { Photo } from "./streamKit.ts";

const course = GenCourse.parse(JSON.parse(readFileSync(new URL("../fixtures/courses/pen.gold.json", import.meta.url), "utf8")));
const photo = (text: string): Photo => ({ mediaType: "image/jpeg", base64: Buffer.from(text).toString("base64") });

/** A generator that counts its calls and finishes when the test says so. */
function fake() {
  const calls: { photos: Photo[]; signal: AbortSignal | undefined }[] = [];
  const waiting: (() => void)[] = [];
  const generate: Generate = (photos, { signal, onProgress }) => {
    calls.push({ photos, signal });
    onProgress?.({ type: "progress" });
    return new Promise((resolve, reject) => {
      waiting.push(() => resolve(course));
      signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    });
  };
  return { generate, calls, finish: () => waiting.splice(0).forEach((f) => f()) };
}

async function withCache(run: (cache: ReturnType<typeof createCourseCache>, f: ReturnType<typeof fake>, dir: string) => Promise<void>) {
  const dir = await mkdtemp(`${tmpdir()}/course-cache-`);
  try {
    const f = fake();
    await run(createCourseCache({ dir, generate: () => f.generate }), f, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

test("the hash depends on the bytes and their order, not the encoding of the request", () => {
  assert.equal(hashPhotos([photo("a")]), hashPhotos([{ mediaType: "image/png", base64: photo("a").base64 }]));
  assert.notEqual(hashPhotos([photo("a")]), hashPhotos([photo("b")]));
  assert.notEqual(hashPhotos([photo("a"), photo("b")]), hashPhotos([photo("b"), photo("a")]));
  assert.notEqual(hashPhotos([photo("ab")]), hashPhotos([photo("a"), photo("b")]));
});

test("a second request for the same photo is answered from disk without generating", () =>
  withCache(async (cache, f, dir) => {
    const first = cache.get([photo("pen")]);
    await tick();
    f.finish();
    assert.deepEqual(await first, { course, cached: false });
    assert.deepEqual(await readdir(dir), [`${hashPhotos([photo("pen")])}.json`]);

    assert.deepEqual(await cache.get([photo("pen")]), { course, cached: true });
    assert.equal(f.calls.length, 1);
  }));

test("requests for the same photo at the same time share one generation and its progress", () =>
  withCache(async (cache, f) => {
    const heard: string[] = [];
    const a = cache.get([photo("pen")]);
    await tick();
    const b = cache.get([photo("pen")], { onProgress: (e) => heard.push(e.type) });
    const other = cache.get([photo("mug")]);
    await tick();
    assert.equal(f.calls.length, 2);
    assert.equal(cache.inFlight(), 2);
    f.finish();
    assert.deepEqual((await Promise.all([a, b, other])).map((r) => r.cached), [false, false, false]);
    assert.equal(cache.inFlight(), 0);
  }));

test("fresh skips the cache but still joins a generation already running", () =>
  withCache(async (cache, f) => {
    const first = cache.get([photo("pen")]);
    await tick();
    f.finish();
    await first;

    const again = cache.get([photo("pen")], { fresh: true });
    const joined = cache.get([photo("pen")], { fresh: true });
    await tick();
    assert.equal(f.calls.length, 2);
    f.finish();
    assert.equal((await again).cached, false);
    assert.equal((await joined).cached, false);
  }));

test("a corrupt cache file is generated again", () =>
  withCache(async (cache, f, dir) => {
    await writeFile(`${dir}/${hashPhotos([photo("pen")])}.json`, "{not json");
    const result = cache.get([photo("pen")]);
    await tick();
    f.finish();
    assert.equal((await result).cached, false);
  }));

test("the generation is aborted only when every request for it has gone", () =>
  withCache(async (cache, f) => {
    const one = new AbortController();
    const two = new AbortController();
    const a = cache.get([photo("pen")], { signal: one.signal });
    const b = cache.get([photo("pen")], { signal: two.signal });
    await tick();
    one.abort();
    await assert.rejects(a);
    assert.equal(f.calls[0]!.signal!.aborted, false);
    two.abort();
    await assert.rejects(b);
    assert.equal(f.calls[0]!.signal!.aborted, true);
    assert.equal(cache.inFlight(), 0);
  }));

async function post(route: ReturnType<typeof createCourseRoute>, query = "") {
  const body = new FormData();
  body.append("photo", new File([Buffer.from("pen")], "pen.jpg", { type: "image/jpeg" }));
  const response = await route.request(`/api/course${query}`, { method: "POST", body });
  return (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as { type: string });
}

test("the route streams started, progress and done, and reports a missing generator as failed", async () => {
  const dir = await mkdtemp(`${tmpdir()}/course-route-`);
  try {
    const ok = createCourseCache({ dir, generate: () => async (_photos, { onProgress }) => (onProgress?.({ type: "progress" }), course) });
    const missing = createCourseCache({
      dir: `${dir}/none`,
      generate: () => {
        throw new Error("The course generator is not available yet");
      },
    });
    const route = createCourseRoute({ plain: ok, staged: missing });
    const events = await post(route);
    assert.deepEqual(events.map((e) => e.type), ["started", "progress", "done"]);
    assert.equal((await post(route)).at(-1)?.type, "done"); // from the cache
    const failed = await post(route, "?staged=1");
    assert.deepEqual(failed.map((e) => e.type), ["started", "failed"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
