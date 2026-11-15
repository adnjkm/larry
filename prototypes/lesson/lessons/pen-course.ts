// The click pen as a mechanism lesson: retraction, then the ball tip. Each mechanism runs the same way: a preview of it
// working, its primitives, then its assemble section. That section always opens with the connecting problem (drag each
// primitive to the sub-function it does) and then has two or three assemble steps, fewer when in doubt, each testing
// one sub-function or several: a piece dragged to where it belongs, or a part set turning, with its test as the answer.
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
    does: facts("close").does,
    also: [facts("roll").does],
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
  // The cam's job is in how it turns, so its assemble step is the cam itself: the rod on its rim is the pen's tip.
  {
    kind: "place",
    module: LATCH,
    does: facts("hold").does,
    also: [facts("take-turns").does],
    say: "The rod is the pen's tip. Drag on how far each click turns the cam.",
    turn: [
      { id: "half", label: "½ Turn", turns: 0.5 },
      { id: "quarter", label: "¼ Turn", turns: 0.25 },
      { id: "whole", label: "Full Turn", turns: 1 },
    ],
    tip: ["The cam pushes the rod up only while a bump is under it.", "This cam has two bumps, opposite each other.", "A click that lands on a bump leaves the tip out. The next click has to land between bumps."],
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
