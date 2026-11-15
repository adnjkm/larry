import type { MechanismLesson, Step, Subfunction } from "../curriculum.ts";
import type { KnownMechanism, Template } from "./types.ts";

// "the" and at most two more words, so a sentence with every slot filled still fits its word budget.
const PHRASE = /^the [a-z][a-z'-]*( [a-z][a-z'-]*)?$/;

/** The object's words for a mechanism's slots. A missing or unusable phrase falls back to the slot's default, so a lesson can always be written. */
export function wordsFor(entry: KnownMechanism, given: { slot: string; phrase: string }[]): Record<string, string> {
  const words: Record<string, string> = {};
  for (const slot of entry.slots) {
    const phrase =
      given
        .find((g) => g.slot === slot.id)
        ?.phrase.trim()
        .toLowerCase()
        .replace(/\.$/, "") ?? "";
    words[slot.id] = PHRASE.test(phrase) && phrase.length <= 28 ? phrase : slot.default;
  }
  return words;
}

const capital = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Puts the words in a template's slots. Throws on a slot the words do not have, which a test catches for every entry. */
export function fill(template: Template, words: Record<string, string>): string {
  const filled = template.replace(/\{(=?)([a-z-]+)\}/g, (_, bare: string, id: string) => {
    const phrase = words[id];
    if (phrase === undefined) throw new Error(`No word for slot {${id}}`);
    return bare ? phrase.replace(/^the /, "") : phrase;
  });
  return filled.replace(/(^|[.:] )([a-z])/g, (_, before: string, letter: string) => before + letter.toUpperCase());
}

const subId = (mechanismId: string, sub: string) => `${mechanismId}-${sub}`;

/** The mechanism's sub-functions in this object's words, with ids that stay unique when an object has two of the same mechanism. */
export const subfunctionsOf = (entry: KnownMechanism, mechanismId: string, words: Record<string, string>): Subfunction[] =>
  entry.subfunctions.map((s) => ({ id: subId(mechanismId, s.id), does: fill(s.does, words), primitive: s.primitive }));

/** The mechanism's whole lesson in this object's words. Nothing is generated: every sentence was written and checked in the library. */
export function lessonOf(entry: KnownMechanism, mechanismId: string, words: Record<string, string>): MechanismLesson {
  const text = (t: Template | null) => (t === null ? null : fill(t, words));
  return {
    id: mechanismId,
    rows: entry.subfunctions.map((s) => ({
      id: subId(mechanismId, s.id),
      why: fill(s.row.why, words),
      need: text(s.row.need),
      missing: fill(s.row.missing, words),
      little: text(s.row.little),
      much: text(s.row.much),
    })),
    path: entry.path.map((name) => capital(fill(name, words))),
    steps: entry.steps.map((step): Step => {
      if (step.format === "trace") return step;
      if (step.format === "break")
        return {
          format: "break",
          failure: fill(step.failure, words),
          causes: step.causes.map((c) => ({ subfunction: subId(mechanismId, c.sub), fault: c.fault })),
        };
      if (step.format === "broke") return { format: "broke", subfunction: subId(mechanismId, step.sub), fault: step.fault };
      return { format: step.format, subfunction: subId(mechanismId, step.sub) };
    }),
  };
}
