// Where a lesson comes from: the server, streamed chapter by chapter, or (demo mode) a fixture checked into the repo.
import { type Kit, parseKit } from "../../shared/kit.ts";
import { type Chapter, type Lesson, LessonEvent, parseLesson } from "../../shared/lesson.ts";
import { readEvents } from "../ndjson.ts";
import { CATALOG } from "../primitives/catalog.ts";
import { type Arrived, arrivedWhole } from "./model.ts";

const LESSON_TIMEOUT_MS = 240_000;

type Started = { title: string; hook: string[] };

/** A failure keeps what arrived before it, so a player already running keeps its place. */
export type LessonLoad =
  | { status: "planning"; started?: Started; chapters: Chapter[] }
  | { status: "complete"; lesson: Lesson }
  | { status: "failed"; message: string; started?: Started; chapters: Chapter[] };

export const planning = (): LessonLoad => ({ status: "planning", chapters: [] });

export const arrivedOf = (load: LessonLoad): Arrived => (load.status === "complete" ? arrivedWhole(load.lesson) : { chapters: load.chapters, done: null });

export const hookOf = (load: LessonLoad): string[] | undefined => (load.status === "complete" ? load.lesson.hook : load.started?.hook);

export function addLessonEvent(load: LessonLoad, event: LessonEvent): LessonLoad {
  if (load.status !== "planning") return load;
  switch (event.type) {
    case "started":
      return { ...load, started: { title: event.title, hook: event.hook } };
    case "chapter":
      return { ...load, chapters: [...load.chapters, event.chapter] };
    case "done":
      return { status: "complete", lesson: event.lesson };
    case "failed":
      return { status: "failed", message: event.message, started: load.started, chapters: load.chapters };
  }
}

/** Chapters were checked on the server as they were written. The finished lesson is checked here against the kit. */
export async function* requestLesson(kit: Kit, signal: AbortSignal): AsyncGenerator<LessonEvent> {
  const response = await fetch("/api/lessons", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kit }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(LESSON_TIMEOUT_MS)]),
  });
  for await (const event of readEvents(response, LessonEvent)) {
    if (event.type !== "done") {
      yield event;
      continue;
    }
    try {
      yield { type: "done", lesson: parseLesson(event.lesson, kit, CATALOG) };
    } catch {
      throw new Error("Larry's lesson didn't hold together");
    }
  }
}

const kitFixtures = import.meta.glob<unknown>("../../fixtures/kits/*.json", { import: "default" });
const lessonFixtures = import.meta.glob<unknown>("../../fixtures/lessons/*.json", { import: "default" });

const fixtureAt = <T>(fixtures: Record<string, () => Promise<T>>, dir: string, name: string) => fixtures[`../../fixtures/${dir}/${name}.json`];

/** A kit and, unless `live` or none is checked in, its lesson. A fixture that exists but is invalid throws; a missing lesson is left to the server. */
export async function loadDemo(name: string, live: boolean): Promise<{ kit: Kit; lesson: Lesson | undefined }> {
  const kitFixture = fixtureAt(kitFixtures, "kits", name);
  if (!kitFixture) throw new Error(`No demo called "${name}"`);
  const kit = parseKit(await kitFixture());
  const lessonFixture = live ? undefined : fixtureAt(lessonFixtures, "lessons", name);
  return { kit, lesson: lessonFixture ? parseLesson(await lessonFixture(), kit, CATALOG) : undefined };
}
