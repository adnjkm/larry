// The combined pen lesson: Aiden's mechanism course (prototypes/lesson/lessons/pen-course.ts) as it is, with what the
// story lesson (lessons/pen.ts) had and the course lacks laid over it. Where both have a thing, the course's wins: its
// mechanisms, screens, order, questions and words. Added from the story:
// - the requirement line over each mechanism's "Make it work", which turns Met when it is solved;
// - a Why on every primitive screen, saying what the primitive is and what it does in this pen;
// - a Why on each "Make it work" that turns into a Hint, one hint at a time, while it is unsolved;
// - the story's final: the whole pen clicked and written with, then what each part does.
// Aiden's own course is untouched and still plays on its own demo (pnpm demo:pen).
import penCourse from "../lesson/lessons/pen-course.ts";
import type { Course, Screen } from "../lesson/course.ts";
import pen, { PEN_RIG } from "../lesson/lessons/pen.ts";

/** What the story lesson adds to one mechanism: its requirement, its Why, and the hints for its "Make it work". */
export type MechanismExtras = { need: string; why: readonly string[]; hints: readonly string[] };
/** What the story lesson adds to one primitive's screen: what it is, and what it does in this object. */
export type PrimitiveExtras = { why: readonly string[]; use: string };
/** The story's final payoff: each part and its one job. */
export type Payoff = readonly { part: string; job: string }[];

export type PlusCourse = Course & {
  /** By mechanism id. */
  mechanismExtras: Readonly<Record<string, MechanismExtras>>;
  /** By primitive id. */
  primitiveExtras: Readonly<Record<string, PrimitiveExtras>>;
  /** The last screen's Why and its list of parts and jobs, shown once the whole object works. */
  final: { title: string; why: readonly string[]; payoff: Payoff };
};

const write = pen.modules[0]!;
const hide = pen.modules[1]!;
const stay = pen.modules[2]!;

/** The course's last "Make it work" no longer ends the lesson: the story's final follows it. */
const LATCH = 2;
const finalScreen: Screen = {
  kind: "final",
  after: LATCH,
  say: pen.final.say,
  success: pen.final.success,
  control: PEN_RIG.controls.pressing,
  tests: pen.final.tests,
};

const mechanisms = penCourse.mechanisms.map((m, i) =>
  i === penCourse.mechanisms.length - 1 ? { ...m, screens: [...m.screens.map((s) => (s.kind === "works" ? { ...s, last: false } : s)), finalScreen] } : m,
);

export default {
  ...penCourse,
  mechanisms,
  mechanismExtras: {
    "ball-tip": {
      need: write.need ?? "Ink must come out thin and even.",
      why: write.why,
      hints: write.hints,
    },
    "click-latch": {
      need: "The tip must click out, and tuck away.",
      why: [...hide.why.slice(0, 2), ...stay.why.slice(0, 2)],
      hints: [...hide.hints, ...stay.hints],
    },
  },
  primitiveExtras: {
    seal: {
      why: ["A seal is a snug fit that closes a gap.", "The ball sits tight in its socket.", "So the ink stays in until you write."],
      use: "The ball sits snug in its socket, sealing the ink in.",
    },
    grip: {
      why: ["A grip holds by rubbing, until it slips.", "The paper rubs the ball as the tip moves.", "That turns the ball, so its wet side comes round."],
      use: "The paper grips the ball and rolls it.",
    },
    spring: {
      why: ["A spring stores the push you give it.", "Let go and it gives that push back.", "In the pen, that push carries the tip back inside."],
      use: "The spring pushes the tip back inside the pen.",
    },
    catch: {
      why: ["A catch holds until it is pushed hard enough.", "In the pen, it holds the tip out while you write.", "Click again and it lets go."],
      use: "The catch holds the tip out while you write.",
    },
    cam: {
      why: [
        "A cam is a wheel with a bump.",
        "Each turn, the bump pushes whatever rests on it.",
        "In the pen, each click turns it a notch, so the tip takes turns: out, then in.",
      ],
      use: "Each click turns the cam, so the tip goes out, then in.",
    },
  },
  final: {
    title: pen.final.title,
    why: pen.final.why,
    payoff: [
      { part: "Ball", job: "seals the ink in, and rolls it out." },
      { part: "Spring", job: "tucks the tip away." },
      { part: "Catch", job: "holds the tip out." },
      { part: "Cam", job: "frees it on the next click." },
    ],
  },
} satisfies PlusCourse;
