// The click pen as a mechanism lesson: the ball tip, then retraction. Every sentence and the order of the questions
// come from the mechanism library's two entries (ball-tip, click-latch); this file binds each question to the pen's
// model: which control it hands over, which tests it runs, and which piece is dragged in first.
import type { Step } from "../../../shared/curriculum.ts";
import { ballTip } from "../../../shared/mechanisms/entries/ball-tip.ts";
import { clickLatch } from "../../../shared/mechanisms/entries/click-latch.ts";
import { lessonOf, subfunctionsOf, wordsFor } from "../../../shared/mechanisms/instantiate.ts";
import type { KnownMechanism } from "../../../shared/mechanisms/types.ts";
import type { Course, Mechanism, Screen } from "../course.ts";
import pen, { PEN_RIG } from "./pen.ts";

const { controls, tests, keys, frames } = PEN_RIG;

/** The pen story's modules, by what each one's piece is: the bench shows the pen built up to one of them. */
const BALL = 0;
const SPRING = 1;
const LATCH = 2;
/** The socket as "How much?" leaves it, for a break that starts from a working tip. */
const SNUG = 0.55;

type Facts = { does: string; primitive: string; why: string; need: string };
/** A question's screen, and the piece that must be on the pen before it. */
type Bound = { screen: Screen; place?: number };

/** One library entry as a run of screens: the gap, its primitives in the order its steps meet them, then its questions. */
function mechanismOf(entry: KnownMechanism, name: string, bind: (step: Step, facts: (sub: string) => Facts) => Bound, gap?: Screen): Mechanism {
  const words = wordsFor(entry, []);
  const lesson = lessonOf(entry, entry.id, words);
  const subs = subfunctionsOf(entry, entry.id, words);
  const facts = (id: string): Facts => {
    const sub = subs.find((s) => s.id === id);
    const row = lesson.rows.find((r) => r.id === id);
    if (!sub || !row) throw new Error(`${entry.id} has no sub-function ${id}`);
    return { does: sub.does, primitive: sub.primitive, why: row.why, need: row.need ?? "" };
  };
  const placed = new Set<number>();
  const questions = lesson.steps.flatMap((step): Screen[] => {
    const { screen, place } = bind(step, facts);
    if (place === undefined || placed.has(place)) return [screen];
    placed.add(place);
    return [{ kind: "place", module: place }, screen];
  });
  const primitives = [...new Set(subs.map((s) => s.primitive))];
  return { id: entry.id, name, screens: [...(gap ? [gap] : []), ...primitives.map((id): Screen => ({ kind: "primitive", id })), ...questions] };
}

const unbound = (step: Step): never => {
  throw new Error(`the pen has no bench for this step: ${JSON.stringify(step)}`);
};

const tip = mechanismOf(ballTip, "Ball tip", (step, facts) => {
  if (step.format === "who") {
    const f = facts(step.subfunction);
    return { screen: { kind: "who", after: -1, frame: frames.tip, does: f.does, answer: f.primitive, why: f.why } };
  }
  if (step.format === "much" && step.subfunction === "ball-tip-close") {
    const f = facts(step.subfunction);
    return { place: BALL, screen: { kind: "much", after: BALL, frame: frames.tip, does: f.does, need: f.need, control: controls.squeeze, tests: [tests.write, tests.wait] } };
  }
  if (step.format === "break")
    return { place: BALL, screen: { kind: "break", after: BALL, frame: frames.tip, failure: step.failure, outcome: "skip", controls: [controls.squeeze, controls.pressure], test: tests.write, set: { [keys.squeeze]: SNUG } } };
  return unbound(step);
});

const click = mechanismOf(
  clickLatch,
  "Retraction",
  (step, facts) => {
    if (step.format === "who") {
      const f = facts(step.subfunction);
      return { screen: { kind: "who", after: BALL, frame: frames.low, does: f.does, answer: f.primitive, why: f.why } };
    }
    if (step.format === "much" && step.subfunction === "click-latch-bring-back") {
      const f = facts(step.subfunction);
      return { place: SPRING, screen: { kind: "much", after: SPRING, frame: frames.low, does: f.does, need: f.need, control: controls.stiffness, tests: [tests.lift, tests.press] } };
    }
    if (step.format === "broke" && step.subfunction === "click-latch-hold") {
      const f = facts(step.subfunction);
      return {
        place: LATCH,
        screen: {
          kind: "broke",
          after: LATCH,
          frame: frames.latch,
          hide: ["barrel"],
          behaviour: tests.letgo,
          fault: { [keys.press]: 1, [keys.notch]: 0.1 },
          options: ["spring", "catch", "cam"],
          answer: f.primitive,
          found: f.why,
          control: controls.notch,
          tests: [tests.letgo, tests.again],
          set: { [keys.press]: 1, [keys.notch]: 0.1 },
        },
      };
    }
    return unbound(step);
  },
  {
    kind: "gap",
    after: BALL,
    frame: frames.low,
    test: tests.lift,
    values: { [keys.stiffness]: 0 },
    try: "Pick the pen up to pocket it.",
    fails: "The inky tip is still out, ready to mark the cloth.",
  },
);

export default {
  story: pen,
  mechanisms: [
    tip,
    {
      ...click,
      screens: [
        ...click.screens,
        {
          kind: "final",
          after: LATCH,
          frame: frames.tip,
          say: pen.final.say,
          success: pen.final.success,
          control: controls.pressing,
          tests: pen.final.tests,
          set: { [keys.press]: 0 },
        },
      ],
    },
  ],
  jobs: {
    seal: "closes a gap so nothing leaks",
    grip: "holds by rubbing, until it slips",
    spring: "pushes back when squeezed",
    catch: "holds until pushed hard enough",
    cam: "turns each push into a timed step",
  },
} satisfies Course;
