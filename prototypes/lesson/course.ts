// A mechanism lesson as data: the object's mechanisms in build order, each a run of screens. A later mechanism opens
// on its gap (what the build so far cannot do); then come its primitives, each on the primitive template; then the
// questions that apply them, in the five fixed formats, with the piece dragged in before the first question that
// needs it on the bench. The words come from the mechanism library (shared/mechanisms); a lesson file only binds each
// question to the object's 3D model.
import type { Kit } from "../../shared/kit.ts";
import type { Control, Frame, Story, Test, Values } from "./model.ts";

/**
 * A bench screen shows the object with every part built up to and including story module `after` (-1: none yet),
 * framed on `frame` when the whole object is too tall to read.
 */
export type Screen =
  /**
   * The mechanism working, on a loop, before anything is built: what this stretch of the lesson is for. `does` says
   * what the mechanism is, in one line short enough to fit the bubble under the header (about 45 characters); `needs`
   * lists what it has to do to manage that, one line each, which the lesson then builds one at a time.
   */
  | { kind: "demo"; after: number; frame?: Frame; does: string; needs: readonly string[]; run: Test; values: Values; pink?: readonly string[] }
  /** What the build so far cannot do: `try` is done on the bench, and `fails` is what is seen. */
  | { kind: "gap"; after: number; frame?: Frame; test: Test; values: Values; try: string; fails: string }
  /**
   * The connecting problem, straight after the primitives: each sub-function has an empty slot beside it, and the
   * primitives wait below as small pictures. Each is dragged to the job it does.
   */
  | { kind: "match"; rows: readonly { does: string; primitive: string; why: string }[] }
  /**
   * The hard problem. Every dial the mechanism has is handed over at once, set wrong, named only by its primitive and
   * with no word for where it stands. Each sub-function has a test, and it is done when every test passes at one
   * setting: the player has to work out which primitive each failure belongs to, and how much of it is right.
   */
  | { kind: "works"; after: number; frame?: Frame; say: string; goals: readonly { does: string; test: Test }[]; dials: readonly { primitive: string; control: Control }[]; set: Values; success: string; last?: boolean }
  /** One primitive, on the primitive template, by library id. */
  | { kind: "primitive"; id: string }
  /** Who does this? A sub-function is stated; pick the primitive from everything learned so far. */
  | { kind: "who"; after: number; frame?: Frame; does: string; answer: string; why: string }
  /** Drag the piece of story module `module` onto the object. */
  | { kind: "place"; module: number }
  /** How much? Set the primitive's number so the sub-function is met: every test passes. */
  | { kind: "much"; after: number; frame?: Frame; does: string; need: string; control: Control; tests: readonly Test[]; set?: Values }
  /** What broke? A behaviour plays at `fault`; pick the primitive responsible, then fix it with `control`. */
  | {
      kind: "broke";
      after: number;
      frame?: Frame;
      /** Parts taken off the bench so the part in question shows: the barrel round a latch. Each goes with everything fixed to it. */
      hide?: readonly string[];
      behaviour: Test;
      fault: Values;
      options: readonly string[];
      answer: string;
      found: string;
      control: Control;
      tests: readonly Test[];
      set?: Values;
    }
  /** Break it. Change one thing so the named failure happens: `test` ends in `outcome`. Any change that does it passes. */
  | { kind: "break"; after: number; frame?: Frame; failure: string; outcome: string; controls: readonly Control[]; test: Test; set?: Values }
  /** The whole object, working: every test passes with `control` in hand. */
  | { kind: "final"; after: number; frame?: Frame; say: string; success: string; control: Control; tests: readonly Test[]; set?: Values };

export type Mechanism = { id: string; name: string; screens: readonly Screen[] };

export type Course = {
  /** The object's 3D model, rest pose, pieces and final screen. */
  story: Story;
  /** The object as it looks from outside, for the result screen, when the lesson's own model is cut away or see-through. */
  reveal?: Kit;
  mechanisms: readonly Mechanism[];
  /** What each primitive does, in a few words, for the line a wrong pick gets: "closes a gap". */
  jobs: Readonly<Record<string, string>>;
};

export const FORMAT: Readonly<Record<"gap" | "match" | "works" | "who" | "much" | "broke" | "break" | "final", string>> = {
  gap: "What it cannot do yet",
  match: "Connect",
  works: "Make it work",
  who: "Who does this?",
  much: "How much?",
  broke: "What broke?",
  break: "Break it",
  final: "All together",
};
