import type { Kit } from "../../shared/kit.ts";
import type { LessonEvent, Shown } from "../../shared/lesson.ts";
import { streamEvents } from "../../shared/ndjson.ts";

const LESSON_TIMEOUT_MS = 240_000;

/** The server checks each chapter as it is written and the finished lesson against the kit, so events arrive already valid. */
export const requestLesson = (kit: Kit, signal: AbortSignal, resume?: Shown) =>
  streamEvents<LessonEvent>("/api/lessons", {
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ kit, resume }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(LESSON_TIMEOUT_MS)]),
  });
