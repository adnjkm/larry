// Hand-written lessons, keyed by the sample photo they were written for. To add one, write
// lessons/<id>.ts exporting `defineLesson({...})` (or `defineStory({...})` for one told with no numbers) as default and add it to LESSONS below.
import type { Kit } from "../../../shared/kit.ts";
import { type Lesson, missingParts, type Story, type Workshop } from "../model.ts";
import bottle from "./bottle.ts";
import pen from "./pen.ts";
import { generatedLesson } from "../templates/index.ts";
import { generatedStory } from "../stories/index.ts";
import { inspectLesson } from "./inspect.ts";
import stapler from "./stapler.ts";

export const LESSONS: Readonly<Record<string, Workshop | Story>> = { bottle, pen, stapler };

/**
 * The lesson for a kit: a story written for this sample (or whose name pattern matches the scanned
 * object and whose parts the kit has), else a story generated from its parts, else a Workshop written
 * for it or matched the same way, else one generated from its joints, else an Inspect lesson.
 */
export function lessonFor(kit: Kit, sampleId?: string): Lesson {
  const written = sampleId === undefined ? undefined : LESSONS[sampleId];
  if (written) {
    const missing = missingParts(written, kit);
    if (missing.length > 0) throw new Error(`lesson ${written.id} names parts its kit lacks: ${missing.join(", ")}`);
  }
  const matched = written ?? Object.values(LESSONS).find((l) => l.match.test(kit.name) && missingParts(l, kit).length === 0);
  if (matched?.kind === "story") return matched;
  return generatedStory(kit, sampleId === undefined ? "story" : `story-${sampleId}`) ?? matched ?? generatedLesson(kit) ?? inspectLesson(kit);
}
