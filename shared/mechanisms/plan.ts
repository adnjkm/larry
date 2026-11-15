import { type MechanismLesson, type Plan, lessonMechanisms } from "../curriculum.ts";
import { lessonOf, subfunctionsOf, wordsFor } from "./instantiate.ts";
import { KNOWN } from "./library.ts";

const asWords = (given: { slot: string; phrase: string }[]) => Object.fromEntries(given.map((w) => [w.slot, w.phrase]));

/**
 * Makes a written plan whole: a known mechanism gets its words checked against the library's slots and, when it is a
 * lesson, its sub-functions from the library, so everything downstream reads one shape. A name the library does not
 * have is dropped, and a lesson left with nothing to teach becomes a given.
 */
export function completePlan(plan: Plan): Plan {
  return {
    ...plan,
    mechanisms: plan.mechanisms.map((m) => {
      const entry = m.known === null ? undefined : KNOWN.get(m.known);
      if (!entry) {
        const lesson = m.lesson && m.subfunctions.length > 0;
        return { ...m, known: null, words: [], lesson, gap: lesson ? m.gap : null };
      }
      const words = wordsFor(entry, m.words);
      return {
        ...m,
        words: Object.entries(words).map(([slot, phrase]) => ({ slot, phrase })),
        subfunctions: m.lesson ? subfunctionsOf(entry, m.id, words) : [],
      };
    }),
  };
}

/** The lessons that need no writing: every lesson mechanism the library knows, in this object's words. */
export const libraryLessons = (plan: Plan): MechanismLesson[] =>
  lessonMechanisms(plan).flatMap((m) => {
    const entry = m.known === null ? undefined : KNOWN.get(m.known);
    return entry ? [lessonOf(entry, m.id, asWords(m.words))] : [];
  });

/** The plan as the lesson writer should see it: known lessons are already written, so they read as givens. */
export const withoutKnownLessons = (plan: Plan): Plan => ({
  ...plan,
  mechanisms: plan.mechanisms.map((m) => (m.lesson && m.known !== null ? { ...m, lesson: false, gap: null, subfunctions: [] } : m)),
});
