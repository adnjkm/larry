// The combined pen lesson: Aiden's mechanism course (prototypes/lesson/lessons/pen-course.ts) as it is, with what the
// story lesson (lessons/pen.ts) had and the course lacks laid over it. Where both have a thing, the course's wins: its
// mechanisms, screens, order, questions, words, and its Tip pill (his hint). Added from the story:
// - a Why on every primitive screen, saying what the primitive is and what it does in this pen;
// - the story's final after his last screen: its requirement line, the whole pen clicked and written with, its Why,
//   then what each part does.
// Aiden's own course is untouched and still plays on its own demo (pnpm demo:pen). He retired slider problems as a
// lesson format (2026-11-15); the final is the one the story keeps, and it starts with the pen's dials already right,
// so only the click is left to the player.
import penCourse from "../lesson/lessons/pen-course.ts";
import type { Course, Screen } from "../lesson/course.ts";
import pen, { PEN_RIG } from "../lesson/lessons/pen.ts";

/** What the story lesson adds to one primitive's screen: what it is, and what it does in this object. */
export type PrimitiveExtras = { why: readonly string[]; use: string };
/** The story's final payoff: each part and its one job. */
export type Payoff = readonly { part: string; job: string }[];

export type PlusCourse = Course & {
  /** By primitive id. */
  primitiveExtras: Readonly<Record<string, PrimitiveExtras>>;
  /** The last screen's requirement, its Why, and its list of parts and jobs, shown once the whole object works. */
  final: { title: string; need: string; why: readonly string[]; payoff: Payoff };
};

/** Every part on the pen. */
const LATCH = 2;
/** The socket and the spring as the course's own trials pass them: a working pen, so the final is the click alone. */
const SNUG = 0.55;
const finalScreen: Screen = {
  kind: "final",
  after: LATCH,
  say: pen.final.say,
  success: pen.final.success,
  control: PEN_RIG.controls.pressing,
  tests: pen.final.tests,
  set: { [PEN_RIG.keys.squeeze]: SNUG, [PEN_RIG.keys.stiffness]: SNUG, [PEN_RIG.keys.press]: 0 },
};

/** The course's last screen no longer ends the lesson: the story's final follows it. */
const last = penCourse.mechanisms.length - 1;
const mechanisms = penCourse.mechanisms.map((m, i) =>
  i === last ? { ...m, screens: [...m.screens.map((s) => ("last" in s && s.last ? { ...s, last: false } : s)), finalScreen] } : m,
);

export default {
  ...penCourse,
  mechanisms,
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
      use: "A ledge on the cam ring catches the tip and holds it out.",
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
    need: "The pen must click, write, and hide away.",
    why: pen.final.why,
    payoff: [
      { part: "Ball", job: "seals the ink in, and rolls it out." },
      { part: "Spring", job: "tucks the tip away." },
      { part: "Cam ring", job: "holds the tip out, and frees it on the next click." },
    ],
  },
} satisfies PlusCourse;
