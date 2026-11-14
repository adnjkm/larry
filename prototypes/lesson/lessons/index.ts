// Hand-written lessons, keyed by the sample photo they were written for. To add one, write
// lessons/<id>.ts exporting `defineLesson({...})` as default and add it to LESSONS below.
import type { Kit } from "../../../shared/kit.ts";
import { type Lesson, missingParts, type Workshop } from "../model.ts";
import bottle from "./bottle.ts";
import { inspectLesson } from "./inspect.ts";
import stapler from "./stapler.ts";

export const LESSONS: Readonly<Record<string, Workshop>> = { bottle, stapler };

/**
 * The lesson for a kit: the one written for this sample, else one whose name pattern matches the
 * scanned object and whose parts the kit has, else an Inspect lesson derived from the kit.
 */
export function lessonFor(kit: Kit, sampleId?: string): Lesson {
  const written = sampleId === undefined ? undefined : LESSONS[sampleId];
  if (written) {
    const missing = missingParts(written, kit);
    if (missing.length > 0) throw new Error(`lesson ${written.id} names parts its kit lacks: ${missing.join(", ")}`);
    return written;
  }
  const matched = Object.values(LESSONS).find((l) => l.match.test(kit.name) && missingParts(l, kit).length === 0);
  return matched ?? inspectLesson(kit);
}
