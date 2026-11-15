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
import type { Kit } from "../../../shared/kit.ts";
import type { Course, Mechanism, Screen } from "../course.ts";
import type { Story } from "../model.ts";
import pen, { PEN_RIG } from "./pen.ts";
import { PEN_SHELL } from "./pen-kit.ts";


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

/** What a pen course says in its own words: each mechanism's name, its one line, and the tips of its assemble steps. */
export type PenWords = {
  click: { name: string; does: string; spring: readonly string[]; cam: readonly string[] };
  tip: { name: string; does: string; ball: readonly string[] };
};
const WORDS: PenWords = {
  click: {
    name: "Retraction",
    does: "Each click sends the tip out or tucks it away.",
    spring: ["A spring only pushes back while it is squeezed between two things.", "Look for a ledge it can sit on, and a collar that comes down on it when the tip goes out."],
    cam: ["The cam pushes the rod up only while a bump is under it.", "This cam has two bumps, opposite each other.", "A click that lands on a bump leaves the tip out. The next click has to land between bumps."],
  },
  tip: { name: "Ball tip", does: "A ball that rolls a thin, even line of ink.", ball: ["The ball can only roll if it touches the paper.", "It also has to sit where the ink reaches it from behind."] },
};

export type PenMechanismId = "click-latch" | "ball-tip";

/**
 * The pen course on any pen: `story` and `rig` from penStory, `reveal` its outside, and `order` the mechanisms as they
 * are built. The retraction demo hides the ball only while the ball tip comes after it.
 */
export function penCourseOf(story: Story, rig: typeof PEN_RIG, reveal: Kit, words: PenWords = WORDS, order: readonly PenMechanismId[] = ["click-latch", "ball-tip"]): Course {
const { tests, keys, frames, demos } = rig;
const ballLater = order.indexOf("ball-tip") > order.indexOf("click-latch") || !order.includes("ball-tip");
const noBall = ballLater ? NO_BALL : undefined;

const tip = mechanismOf(ballTip, words.tip.name, ({ facts, needs, match, primitives }): Screen[] => [
  { kind: "demo", after: LATCH, frame: frames.ball, does: words.tip.does, needs, run: demos.writing, values: { [keys.squeeze]: SNUG, [keys.press]: 1 }, pink: ["ball"] },
  ...primitives,
  match,
  {
    kind: "place",
    module: BALL,
    does: facts("close").does,
    also: [facts("roll").does],
    say: "Drag the ball where it belongs.",
    trial: { test: tests.write, fail: { [keys.squeeze]: 0 }, pass: { [keys.squeeze]: SNUG } },
    tip: words.tip.ball,
    last: order[order.length - 1] === "ball-tip",
  },
]);

const click = mechanismOf(clickLatch, words.click.name, ({ facts, needs, match, primitives }): Screen[] => [
  { kind: "demo", after: LATCH, frame: frames.click, ...(noBall && { hide: noBall }), does: words.click.does, needs, run: demos.clicking, values: {} },
  ...primitives,
  match,
  {
    kind: "place",
    module: SPRING,
    does: facts("bring-back").does,
    say: "Drag the spring where it belongs.",
    trial: { test: tests.push, fail: {}, pass: { [keys.stiffness]: SNUG } },
    tip: words.click.spring,
    ...(noBall && { absent: noBall }),
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
    tip: words.click.cam,
    ...(order[order.length - 1] === "click-latch" && { last: true }),
  },
]);

const made = { "click-latch": click, "ball-tip": tip };
return {
  story,
  reveal,
  mechanisms: order.map((id) => made[id]),
  jobs: {
    seal: "closes a gap so nothing leaks",
    grip: "holds by rubbing, until it slips",
    spring: "pushes back when squeezed",
    catch: "holds until pushed hard enough",
    cam: "turns each push into a timed step",
  },
};
}

// Retraction first: the pen clicks, and then it turns out it cannot write, which is what the ball tip is for.
export default penCourseOf(pen, PEN_RIG, PEN_SHELL) satisfies Course;
