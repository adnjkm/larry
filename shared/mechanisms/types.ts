// A known mechanism: something many everyday objects do the same way, written once and checked once, so the planner
// recognises it instead of inventing it. Its lesson is filled in for an object by putting that object's words in the slots.
import type { Fault } from "../curriculum.ts";

/** A thing the mechanism's text talks about that every object names differently. */
export type Slot = {
  id: string;
  /** What the slot stands for, for the planner: "the part that twists on". */
  is: string;
  /** Used when the planner gives nothing usable. A singular phrase starting with "the". */
  default: string;
};

/**
 * Text with slots. `{closure}` becomes "the cap" (capitalised at the start of a sentence); `{=closure}` becomes "cap",
 * for names. Every slot is filled with a singular phrase, so a slot may be the subject of a verb.
 */
export type Template = string;

export type KnownRow = {
  why: Template;
  /** null, with `little` and `much`, when any value of the primitive's number would do here. */
  need: Template | null;
  missing: Template;
  little: Template | null;
  much: Template | null;
};

export type KnownStep =
  | { format: "who" | "much"; sub: string }
  | { format: "broke"; sub: string; fault: Fault }
  | { format: "trace" }
  | { format: "break"; failure: Template; causes: { sub: string; fault: Fault }[] };

export type KnownMechanism = {
  /** kebab-case, the name the planner picks it by. */
  id: string;
  name: string;
  /** One line the planner recognises it by: what it does, in any object. */
  does: string;
  slots: Slot[];
  /** 1 to 3, in the order a builder meets them. `id` is unique within the mechanism. */
  subfunctions: { id: string; does: Template; primitive: string; row: KnownRow }[];
  /** What a push passes through from the hand to the result, in motion order. 3 to 6 names. */
  path: Template[];
  steps: KnownStep[];
  /** Two or three real objects it is found in, with their words, so the text is checked against real things. */
  fits: { object: string; words: Record<string, string> }[];
};
