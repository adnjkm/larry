// The stapler: drive the staple (lever arm ratio), spring back open (spring stiffness).
// The head (channel, arm, pad, pin) is one rigid body that turns about the hinge pin, resting open.
import type { Kit, Part, Shape } from "../../../shared/kit.ts";
import { clamp01, easeOut, smooth } from "../ease.ts";
import { AXIS, type Ctx, defineLesson, type Mark, type Overlay, type PartMove, type Scene, STILL, type Test, type Values, vec, type Vec, type Window } from "../model.ts";
import { extents } from "../pose.ts";

const BASE = "base";
const FOOT = "rubber-pad";
const ANVIL = "anvil";
const CHANNEL = "magazine";
const ARM = "top-arm";
const PAD = "blue-cap";
const PIN = "pivot-pin";
const HEAD = [CHANNEL, ARM, PAD, PIN];
const DEG = Math.PI / 180;

/** Arm ratios worth trying: hand distance from the hinge divided by the staple's distance from it. */
const RATIO_WINDOW: Window = [2, 4];
/** Spring stiffnesses worth trying, in N/mm. */
const STIFFNESS_WINDOW: Window = [1.8, 2.5];

// Game numbers. The lever law and Hooke's law are real; every value below is picked so the lesson plays well.
const SHEETS = 20;
const SQUEEZE_N = 50;
const SHEET_N = 4;
const HAND_TRAVEL = 24;
const CLOSE_TRAVEL = 6;
const SPRING_MM = 4;
const FRICTION_N = 6;
const COMFORT_N = 60;

/** How far the head rests open, in degrees. */
const OPEN_DEG = 13.5;
/** The paper stack is drawn thicker than 20 real sheets (about 2 mm) so it reads at phone size. */
const STACK_H = 8;
const STACK_W = 34;
const STACK_D = 46;
const STAPLE_H = 9;
/** How far an arm that cannot beat friction still creeps up. */
const STUCK_DEG = 1.5;

const tenth = (n: number) => Math.round(n * 10) / 10;
const ratioOf = (v: Values) => tenth(v.ratio ?? 3);
const stiffnessOf = (v: Values) => tenth(v.stiffness ?? 2);

function find(kit: Kit, id: string): Part {
  const p = kit.parts.find((q) => q.id === id);
  if (!p) throw new Error(`kit has no part ${id}`);
  return p;
}

const turnPoint = (p: Vec, pivot: Vec, deg: number): Vec => {
  const [c, s] = [Math.cos(deg * DEG), Math.sin(deg * DEG)];
  const [dx, dy] = [p.x - pivot.x, p.y - pivot.y];
  return vec(pivot.x + dx * c - dy * s, pivot.y + dx * s + dy * c, p.z);
};

/** Measurements the timelines need, read from the kit so nothing is typed in twice. */
function rigOf({ kit }: Ctx) {
  const pin = find(kit, PIN).position;
  const anvil = extents([find(kit, ANVIL)]);
  const channel = extents([find(kit, CHANNEL)]);
  const pad = extents([find(kit, PAD)]);
  const noseX = find(kit, ANVIL).position.x;
  const stackTop = anvil.max.y + STACK_H;
  const edge = vec(noseX - STACK_W / 2, channel.min.y, 0);
  let [lo, hi] = [0, OPEN_DEG];
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (turnPoint(edge, pin, mid).y < stackTop) lo = mid;
    else hi = mid;
  }
  return {
    pin,
    /** Where the staple leaves the channel, at rest on the base. */
    nose: vec(noseX, channel.min.y, 0),
    anvilTop: anvil.max.y,
    /** The angle at which the channel meets the paper stack. */
    closeDeg: hi,
    handAt: vec(pad.max.x - 14, pad.max.y + 12, 0),
  };
}

const headMoves = (pin: Vec, deg: number): Record<string, PartMove> =>
  Object.fromEntries(HEAD.map((id) => [id, { turns: [{ axis: AXIS.z, pivot: pin, deg: deg - OPEN_DEG }] }]));

const overlay = (live: string, moves: Overlay["moves"], marks: Mark[]): Overlay => ({ rigid: STILL, live, moves, marks });

const arrow = (up: boolean, length: number): Shape => {
  const h = length / 2;
  const s = up ? 1 : -1;
  const pts = [[-2.5, -h], [2.5, -h], [2.5, h - 8], [6, h - 8], [0, h], [-6, h - 8], [-2.5, h - 8]];
  return { kind: "extrusion", outline: pts.map(([x, y]) => ({ x: x!, y: y! * s })), depth: 3 };
};
const SPRING_ARROW = arrow(true, 16);
/** The staple and stack are drawn wider than the channel so both show past its sides. */
const HAND_ARROW = arrow(false, 20);
const STACK_SHAPE: Shape = { kind: "box", width: STACK_W, height: STACK_H, depth: STACK_D, cornerRadius: 0.5 };
const STAPLE_SHAPE: Shape = {
  kind: "extrusion",
  outline: [[-17, STAPLE_H], [17, STAPLE_H], [17, 0], [14, 0], [14, STAPLE_H - 3], [-14, STAPLE_H - 3], [-14, 0], [-17, 0]].map(([x, y]) => ({ x: x!, y: y! })),
  depth: 3,
};

type Squeezed = {
  kind: "weak" | "short" | "hard" | "pass";
  atStaple: number;
  pierced: number;
  travel: number;
  need: number;
  spring: number;
  total: number;
  /** How far down the stack the staple gets, from 0 to 1. */
  depth: number;
};

function squeezeResult(values: Values, hasSpring: boolean): Squeezed {
  const ratio = ratioOf(values);
  const atStaple = tenth(SQUEEZE_N * ratio);
  const pierced = Math.min(SHEETS, Math.floor(atStaple / SHEET_N));
  const travel = tenth(HAND_TRAVEL / ratio);
  const need = tenth((SHEETS * SHEET_N) / ratio);
  const spring = hasSpring ? tenth(SPRING_MM * stiffnessOf(values)) : 0;
  const total = tenth(need + spring);
  const kind = pierced < SHEETS ? "weak" : travel < CLOSE_TRAVEL ? "short" : total > COMFORT_N ? "hard" : "pass";
  return { kind, atStaple, pierced, travel, need, spring, total, depth: Math.min(pierced / SHEETS, Math.min(1, travel / CLOSE_TRAVEL)) };
}

const squeezeLine = (r: Squeezed) => {
  switch (r.kind) {
    case "weak": return `Your ${SQUEEZE_N} N became ${r.atStaple} N at the staple. It pierced ${r.pierced} of ${SHEETS} sheets.`;
    case "short": return `The staple moved ${r.travel} mm. Closing its legs takes ${CLOSE_TRAVEL} mm, so it stopped short.`;
    case "hard": return `Through ${SHEETS} sheets, but it took ${r.total} N of squeeze: ${r.need} N for the sheets and ${r.spring} N against the spring. Past ${COMFORT_N} N it hurts.`;
    case "pass": return r.spring > 0
      ? `Through all ${SHEETS} sheets, legs closed. It took ${r.total} N of squeeze: ${r.need} N for the sheets and ${r.spring} N against the spring.`
      : `Through all ${SHEETS} sheets, legs closed. It took ${r.need} N of squeeze.`;
  }
};

const PRESS = 800;
const DRIVE = 380;
const HOLD = 650;
const LIFT = 800;
const TAIL = 350;

const squeeze: Test = {
  id: "squeeze",
  label: "Squeeze 20 sheets",
  run: (values, ctx) => {
    const hasSpring = ctx.present.includes(CHANNEL);
    const result = squeezeResult(values, hasSpring);
    const rig = rigOf(ctx);
    const springLifts = hasSpring && SPRING_MM * stiffnessOf(values) > FRICTION_N;
    const carried = turnPoint(rig.nose, rig.pin, rig.closeDeg);
    const dropFull = carried.y - rig.anvilTop;
    const liftAt = PRESS + DRIVE + HOLD;
    const stack: Mark = { id: "stack", shape: STACK_SHAPE, at: vec(rig.nose.x, rig.anvilTop + STACK_H / 2, 0), ride: null };
    const hand: Mark = { id: "hand", shape: HAND_ARROW, at: rig.handAt, ride: PAD };
    const lines = (q: number) => {
      const into = result.depth * q;
      return result.pierced < SHEETS ? `Staple through ${Math.round(into * SHEETS)} of ${SHEETS} sheets` : `Staple down ${(into * CLOSE_TRAVEL).toFixed(1)} of ${CLOSE_TRAVEL} mm`;
    };
    return {
      verdict: { pass: result.kind === "pass", line: squeezeLine(result) },
      durationMs: liftAt + LIFT + TAIL,
      at: (ms) => {
        const press = smooth(clamp01(ms / PRESS));
        const lift = clamp01((ms - liftAt) / LIFT);
        const angle = ms < liftAt ? rig.closeDeg + (OPEN_DEG - rig.closeDeg) * (1 - press) : rig.closeDeg + (OPEN_DEG - rig.closeDeg) * (springLifts ? easeOut(lift) : smooth(lift));
        const q = easeOut(clamp01((ms - PRESS) / DRIVE));
        const tip = ms < PRESS ? turnPoint(rig.nose, rig.pin, angle) : vec(carried.x, carried.y - dropFull * result.depth * q, 0);
        const staple: Mark = { id: "staple", shape: STAPLE_SHAPE, at: vec(tip.x, tip.y + STAPLE_H / 2, 0), rotation: vec(0, 90, 0), ride: null };
        const live =
          ms < PRESS ? `Pad down ${(HAND_TRAVEL * press).toFixed(0)} of ${HAND_TRAVEL} mm`
          : ms < liftAt ? lines(q)
          : springLifts ? "Spring lifts the arm"
          : "Lifting the arm by hand";
        return overlay(live, headMoves(rig.pin, angle), ms < liftAt ? [stack, staple, hand] : [stack, staple]);
      },
    };
  },
};

const R_PRESS = 600;
const R_HOLD = 500;
const R_STUCK = 300;
const R_TAIL = 600;

const release: Test = {
  id: "release",
  label: "Release",
  run: (values, ctx) => {
    const hasSpring = ctx.present.includes(CHANNEL);
    const spring = hasSpring ? tenth(SPRING_MM * stiffnessOf(values)) : 0;
    const lifts = spring > FRICTION_N;
    const rig = rigOf(ctx);
    const popMs = Math.min(900, Math.max(350, 1000 - 40 * spring));
    const start = R_PRESS + R_HOLD;
    const detail = `The spring pushes ${spring} N and hinge friction holds with ${FRICTION_N} N.`;
    const hand: Mark = { id: "hand", shape: HAND_ARROW, at: rig.handAt, ride: PAD };
    return {
      verdict: lifts ? { pass: true, line: `The arm lifted back open. ${detail}` } : { pass: false, line: `The arm stayed down. ${detail}` },
      durationMs: start + (lifts ? popMs : R_STUCK) + R_TAIL,
      at: (ms) => {
        const down = smooth(clamp01(ms / R_PRESS));
        const after = ms - start;
        const angle =
          ms < start ? OPEN_DEG * (1 - down)
          : lifts ? OPEN_DEG * easeOut(clamp01(after / popMs))
          : STUCK_DEG * easeOut(clamp01(after / R_STUCK));
        const live =
          ms < R_PRESS ? "Pressing the arm down"
          : ms < start ? "Holding it down"
          : lifts ? "Spring lifts the arm"
          : "Arm stays down";
        return overlay(live, headMoves(rig.pin, angle), ms < start ? [hand] : []);
      },
    };
  },
};

export default defineLesson({
  id: "stapler",
  objectName: "Stapler",
  match: /\bstapler\b/i,
  rest: (ctx): Scene => {
    const rig = rigOf(ctx);
    const channel = find(ctx.kit, CHANNEL);
    const mark: Mark = { id: "spring-arrow", shape: SPRING_ARROW, at: vec(channel.position.x - 40, channel.position.y, channel.position.z + 16), ride: CHANNEL };
    return { moves: headMoves(rig.pin, OPEN_DEG), marks: ctx.present.includes(CHANNEL) ? [mark] : [] };
  },
  apart: {
    [FOOT]: vec(0, -20, 0),
    [BASE]: vec(0, 0, 0),
    [ANVIL]: vec(0, 22, 0),
    [CHANNEL]: vec(0, 48, 0),
    [ARM]: vec(0, 82, 0),
    [PAD]: vec(44, 84, 0),
    [PIN]: vec(-18, 112, 0),
  },
  modules: [
    {
      id: "drive",
      title: "Drive the staple",
      need: "It must push a staple through 20 sheets with an ordinary squeeze.",
      primitive: "lever",
      produces: [ARM, PAD, PIN],
      target: { label: "Top arm", at: vec(-30, 58, 0), ring: { radius: 40, axis: "z" } },
      enter: vec(0, 50, 0),
      fault: { primitive: "lever", slider: "ratio", start: 1 },
      fix: { window: RATIO_WINDOW },
      tests: [squeeze],
      hints: [
        "Run Squeeze and watch the staple. It starts into the stack and stops partway. Whatever pushes it is not multiplying your squeeze enough.",
        "The arm is a lever hinged at the back. The force at the staple is your force times your distance from the hinge, divided by the staple's distance from it. That distance ratio is the arm ratio.",
        "Raise the arm ratio. But the staple moves the same ratio less far than your hand does, so too high a ratio leaves it short of closing its legs. The band on the slider now marks the range worth trying.",
      ],
      suspect: ARM,
      misses: {
        [BASE]: "The base holds the paper still. It does not push the staple.",
        [FOOT]: "The foot only grips the desk.",
        [ANVIL]: "That bends the legs flat afterwards. The problem is getting through the paper first.",
        [PAD]: "The pad is where your hand lands. It moves with the arm, and the arm decides how much your force grows.",
        [PIN]: "The pin is the point the arm swings about. It does not set how hard the staple is pushed.",
      },
      missDefault: "That part is not what limits the force at the staple. Run Squeeze and watch what turns.",
      why: "The arm is a lever hinged at the back. The force at the staple is your force times your distance from the hinge, divided by the staple's distance from it. A larger ratio multiplies your squeeze, and the staple moves the same ratio less far than your hand. No work is gained, only a better trade of force for distance.",
      gameNote: "Game numbers: an ordinary squeeze is 50 N, each sheet takes 4 N to pierce (80 N for 20), the pad moves 24 mm, and the staple needs 6 mm of travel to close its legs. The lever law is real. The paper stack is drawn thicker than 20 real sheets.",
    },
    {
      id: "spring",
      title: "Spring back open",
      need: "It must spring back open after every staple.",
      primitive: "spring",
      produces: [CHANNEL],
      target: { label: "Staple channel", at: vec(11, 46, 0), ring: { radius: 40, axis: "z" } },
      enter: vec(0, 0, 70),
      fault: { primitive: "spring", slider: "stiffness", start: 1 },
      fix: { window: STIFFNESS_WINDOW },
      tests: [release, squeeze],
      hints: [
        "Run Release and watch the arm. After you let go it stays down. Something that should push it back open is too weak.",
        "A spring gives back the push you put into it, F = k × x. It has to beat the friction in the hinge. Stiffness is how many newtons it pushes for each millimetre it is squeezed.",
        "Stiffen it, but not too far. You squeeze against the spring on every staple, so a stiff one makes every squeeze harder. Check Release and Squeeze together. The band on the slider marks the range worth trying.",
      ],
      suspect: CHANNEL,
      misses: {
        [BASE]: "The base stays put. Look for the part that carries the push that opens the arm.",
        [FOOT]: "The foot only grips the desk.",
        [ANVIL]: "The anvil only bends the legs flat. It lifts nothing.",
        [ARM]: "The arm goes down fine when you squeeze. The problem is that nothing lifts it back.",
        [PAD]: "The pad moves with the arm. Something else has to push the arm open.",
        [PIN]: "The pin is only the hinge. It does not push.",
      },
      missDefault: "That is not what pushes the arm open. Run Release and watch where the push should come from.",
      why: "A spring stores the work of your squeeze and gives it back when you let go. It has to push harder than the hinge's friction, or the arm stays down. It also pushes against you on every staple, so a stiffer spring makes every squeeze harder. Stiffness is a trade between those two.",
      gameNote: "Game numbers: the spring is squeezed 4 mm, so it pushes 4 N for each N/mm of stiffness. Hinge friction holds the arm down with 6 N, and a squeeze stays comfortable up to 60 N. A real stapler hides the spring inside the head. The purple arrow shows where it pushes.",
    },
  ],
  final: {
    need: "It must staple 20 sheets and spring back open, every time.",
    success: "You built a stapler.",
    detail: "It drives a staple through 20 sheets with an ordinary squeeze, and springs back open after every staple.",
    tests: [squeeze, release],
  },
});
