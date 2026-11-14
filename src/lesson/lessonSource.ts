// Where a lesson comes from: the server, or (demo mode) a fixture checked into the repo.
import { type Kit, parseKit } from "../../shared/kit.ts";
import { type Lesson, parseLesson } from "../../shared/lesson.ts";
import { CATALOG } from "../primitives/catalog.ts";

const LESSON_TIMEOUT_MS = 240_000;

export type LessonLoad = { status: "loading" } | { status: "ready"; lesson: Lesson } | { status: "failed"; message: string };

function errorText(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") return body.error;
  return `Request failed (${status})`;
}

export async function requestLesson(kit: Kit): Promise<Lesson> {
  const response = await fetch("/api/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kit }),
    signal: AbortSignal.timeout(LESSON_TIMEOUT_MS),
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new Error(errorText(body, response.status));
  if (typeof body !== "object" || body === null || !("lesson" in body)) throw new Error("Larry sent back something that doesn't add up");
  try {
    return parseLesson(body.lesson, kit, CATALOG);
  } catch {
    throw new Error("Larry's lesson didn't hold together");
  }
}

export async function loadLesson(kit: Kit): Promise<LessonLoad> {
  try {
    return { status: "ready", lesson: await requestLesson(kit) };
  } catch (error) {
    return { status: "failed", message: error instanceof Error ? error.message : String(error) };
  }
}

const kitFixtures = import.meta.glob<unknown>("../../fixtures/kits/*.json", { import: "default" });
const lessonFixtures = import.meta.glob<unknown>("../../fixtures/lessons/*.json", { import: "default" });

const fixtureAt = <T>(fixtures: Record<string, () => Promise<T>>, dir: string, name: string) => fixtures[`../../fixtures/${dir}/${name}.json`];

/** A kit and, when one is checked in, its lesson. A fixture that exists but is invalid throws; a missing lesson is left to the server. */
export async function loadDemo(name: string): Promise<{ kit: Kit; lesson: Lesson | undefined }> {
  const kitFixture = fixtureAt(kitFixtures, "kits", name);
  if (!kitFixture) throw new Error(`No demo called "${name}"`);
  const kit = parseKit(await kitFixture());
  const lessonFixture = fixtureAt(lessonFixtures, "lessons", name);
  return { kit, lesson: lessonFixture ? parseLesson(await lessonFixture(), kit, CATALOG) : undefined };
}
