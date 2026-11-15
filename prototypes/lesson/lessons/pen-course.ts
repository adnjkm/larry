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
  { kind: "demo", after: BALL, frame: frames.ball, does: "A ball that rolls a thin, even line of ink.", needs, run: demos.writing, values: { [keys.squeeze]: SNUG } },
  ...primitives,
  match,
  { kind: "place", module: BALL },
  {
    kind: "works",
    after: BALL,
    frame: frames.tip,
    say: "Set the seal and the grip so both hold.",
    goals: [
      { does: facts("close").does, test: tests.wait },
      { does: facts("roll").does, test: tests.write },
    ],
    dials: [
      { primitive: "seal", control: controls.squeeze },
      { primitive: "grip", control: controls.pressure },
    ],
    set: { [keys.squeeze]: 0.1, [keys.pressure]: 0.1 },
    success: "A thin, even line, and not a drop when it rests.",
  },
]);

const click = mechanismOf(clickLatch, "Retraction", ({ facts, needs, match, primitives }): Screen[] => [
  { kind: "demo", after: LATCH, frame: frames.click, does: "Each click sends the tip out or tucks it away.", needs, run: demos.clicking, values: {}, pink: ["spring"] },
  ...primitives,
  match,
  { kind: "place", module: SPRING },
  { kind: "place", module: LATCH },
  {
    kind: "works",
    after: LATCH,
    frame: frames.click,
    say: "Set the spring and the catch so all three hold.",
    goals: [
      { does: facts("bring-back").does, test: tests.lift },
      { does: facts("hold").does, test: tests.clickOut },
      { does: facts("take-turns").does, test: tests.clickIn },
    ],
    dials: [
      { primitive: "spring", control: controls.stiffness },
      { primitive: "catch", control: controls.notch },
    ],
    set: { [keys.stiffness]: 0.1, [keys.notch]: 0.9 },
    success: "Out on one click, away on the next, and hidden when you pocket it.",
    last: true,
  },
]);

export default {
  story: pen,
  reveal: PEN_SHELL,
  mechanisms: [tip, click],
  jobs: {
    seal: "closes a gap so nothing leaks",
    grip: "holds by rubbing, until it slips",
    spring: "pushes back when squeezed",
    catch: "holds until pushed hard enough",
    cam: "turns each push into a timed step",
  },
} satisfies Course;
