// The click pen as a mechanism lesson: the ball tip, then retraction. Each mechanism runs the same way, and tests each
// thing once: a preview of it working, its primitives, one connecting problem (which primitive does which sub-function),
// its pieces dragged onto the pen (where each goes), then one hard problem (how much of each: every dial at once).
// The sub-functions and their sentences come from the mechanism library's two entries (ball-tip, click-latch); this
// file binds them to the pen's model.
import { ballTip } from "../../../shared/mechanisms/entries/ball-tip.ts";
import { clickLatch } from "../../../shared/mechanisms/entries/click-latch.ts";
import { lessonOf, subfunctionsOf, wordsFor } from "../../../shared/mechanisms/instantiate.ts";
import type { KnownMechanism } from "../../../shared/mechanisms/types.ts";
import type { Course, Mechanism, Screen } from "../course.ts";
import pen, { PEN_RIG } from "./pen.ts";
import { PEN_SHELL } from "./pen-kit.ts";

const { controls, tests, keys, frames, demos } = PEN_RIG;

/** The pen story's modules, by what each one's piece is: the bench shows the pen built up to one of them. */
const BALL = 0;
const SPRING = 1;
const LATCH = 2;
/** The socket as "How much?" leaves it, for a break that starts from a working tip. */
const SNUG = 0.55;
/** Retraction is built before the ball tip, so the ball is not on the pen yet. */
const NO_BALL = ["ball"] as const;

type Facts = { does: string; primitive: string; why: string };

/** One library entry as a run of screens. `build` gets its sub-functions by id, in this object's words. */
function mechanismOf(entry: KnownMechanism, name: string, build: (parts: { facts: (sub: string) => Facts; needs: readonly string[]; match: Screen; primitives: readonly Screen[] }) => readonly Screen[]): Mechanism {
  const words = wordsFor(entry, []);
  const lesson = lessonOf(entry, entry.id, words);
  const subs = subfunctionsOf(entry, entry.id, words);
  const facts = (id: string): Facts => {
    const sub = subs.find((s) => s.id === `${entry.id}-${id}`);
    const row = lesson.rows.find((r) => r.id === sub?.id);
    if (!sub || !row) throw new Error(`${entry.id} has no sub-function ${id}`);
    return { does: sub.does, primitive: sub.primitive, why: row.why };
  };
  const rows = entry.subfunctions.map((s) => facts(s.id));
  return {
    id: entry.id,
    name,
    screens: build({
      facts,
      needs: rows.map((r) => r.does),
      match: { kind: "match", rows },
      primitives: [...new Set(rows.map((r) => r.primitive))].map((id): Screen => ({ kind: "primitive", id })),
    }),
  };
}

const tip = mechanismOf(ballTip, "Ball tip", ({ facts, needs, match, primitives }): Screen[] => [
  { kind: "demo", after: LATCH, frame: frames.ball, does: "A ball that rolls a thin, even line of ink.", needs, run: demos.writing, values: { [keys.squeeze]: SNUG, [keys.press]: 1 }, pink: ["ball"] },
  ...primitives,
  match,
  {
    kind: "place",
    module: BALL,
    does: facts("roll").does,
    say: "Drag the ball where it belongs.",
    trial: { test: tests.write, fail: { [keys.squeeze]: 0 }, pass: { [keys.squeeze]: SNUG } },
    tip: ["The ball can only roll if it touches the paper.", "It also has to sit where the ink reaches it from behind."],
    last: true,
  },
]);

const click = mechanismOf(clickLatch, "Retraction", ({ facts, needs, match, primitives }): Screen[] => [
  { kind: "demo", after: LATCH, frame: frames.click, hide: NO_BALL, does: "Each click sends the tip out or tucks it away.", needs, run: demos.clicking, values: {} },
  ...primitives,
  match,
  {
    kind: "place",
    module: SPRING,
    does: facts("bring-back").does,
    say: "Drag the spring where it belongs.",
    trial: { test: tests.push, fail: {}, pass: { [keys.stiffness]: SNUG } },
    tip: ["A spring only pushes back while it is squeezed between two things.", "Look for a ledge it can sit on, and a collar that comes down on it when the tip goes out."],
    absent: NO_BALL,
  },
  // The cam ring is what holds the tip out and what frees it: each click turns it a step, and its steps differ.
  {
    kind: "place",
    module: LATCH,
    does: facts("hold").does,
    also: [facts("take-turns").does],
    say: "Drag the cam where it belongs.",
    trial: { test: tests.clickTwice, fail: {}, pass: {} },
    tip: [
      "The cam you turned lifts by a different amount at each point of its turn.",
      "In the pen, every click turns the cam ring one step.",
      "On one step its high side props the tip out. On the next, its low side lets the spring bring the tip back.",
      "It has to sit where the button's push can reach it.",
    ],
    absent: NO_BALL,
  },
]);

export default {
  story: pen,
  reveal: PEN_SHELL,
  // Retraction first: the pen clicks, and then it turns out it cannot write, which is what the ball tip is for.
  mechanisms: [click, tip],
  jobs: {
    seal: "closes a gap so nothing leaks",
    grip: "holds by rubbing, until it slips",
    spring: "pushes back when squeezed",
    catch: "holds until pushed hard enough",
    cam: "turns each push into a timed step",
  },
} satisfies Course;
