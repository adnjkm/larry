import type { Chapter, Lesson, LessonEvent, LessonHeader, Shown } from "../../shared/lesson.ts";

/** A lesson as far as it has been written. `done` is the finished lesson, null while chapters are still arriving. */
export type Arrived = { chapters: Chapter[]; done: Lesson | null };

export const arrivedWhole = (lesson: Lesson): Arrived => ({ chapters: lesson.chapters, done: lesson });

/** A failure keeps what arrived before it, so a player already running keeps its place. */
export type LessonLoad =
  | { status: "planning"; started?: LessonHeader; chapters: Chapter[] }
  | { status: "complete"; lesson: Lesson }
  | { status: "failed"; message: string; started?: LessonHeader; chapters: Chapter[] };

export type FailedLoad = Extract<LessonLoad, { status: "failed" }>;

/** Planning from scratch, or again after a failure keeping what the reader was shown, which the server continues from. */
export const planning = (after?: FailedLoad): LessonLoad => ({ status: "planning", started: after?.started, chapters: after?.chapters ?? [] });

export const shownOf = (failed: FailedLoad): Shown => ({ header: failed.started, chapters: failed.chapters });

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
