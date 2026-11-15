// Cam: turn steady motion into a timed push. A mechanism made of a wheel and a wedge (src/primitives/docs/design-language.md).
//
// The rig is the textbook picture and nothing more: a pink egg-shaped wheel on a post with a flat-ended rod resting on its
// rim. The rim is a round disc with two bumps, and every bump is a real wedge: a straight rise ramp, a short dwell at the
// top and a straight drop. The follower is not animated; its height is solved from the drawn outline (the highest point of
// the rim under its foot) at every turn, so it climbs each ramp, dwells, and drops with the cam. The number is the lift,
// the height of the bumps.
//
// The game, "Ring the bell": the rod's top is a hammer under a bell. The lift is the only thing the player sets.
// - Too low and the hammer never reaches the bell: silent.
// - Too high and the ramp is too steep: the cam pushes the rod sideways against its guide harder than it pushes it up,
//   and past a pressure angle of 45 degrees the rod wedges and the cam jams. The angle is measured on the drawn ramp.
// The 45 degrees is this game's rule of thumb (real limits depend on friction and how long the guide is); it is a
// simplification, and howItWorks says so.
import type { Part } from "../../kit.ts";
import { clamp, shudder, smooth } from "../motion/ease.ts";
import { frame, LEAD, phases, REWIND, SCENE, whenReaches } from "../motion/run.ts";
import { fmt, knob, lathe, look, on, part, pivoted, plate, post, v3, type Pt } from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW, type Slider, valueOf } from "../types.ts";
import { DEG_TO_RAD, RAD_TO_DEG } from "../../angles.ts";

// Geometry, millimetres. The post is behind the cam and the follower; the whole rig sits in z so the union is centred.
const R0 = 20;
/** Height of the cam's axle: the tallest bump (14 mm) clears the plate. */
const CAM_Y = 42;
const ZC = -6;
const POST_Z = -14;
const KNOB_Z = 8;
const KNOB_R = 8;
const KNOB_AT_0 = 200;
const CAM_T = 8;
/** The follower is a plain rod with a flat end: it rides on the highest part of the rim within half its width of the axis. */
const FOOT_W = 10;
const ROD_L = 16;
/** The follower's top with no bump under it. */
const REST_TOP = CAM_Y + R0 + ROD_L;
/** A bump: the rise ramp, the dwell on top, and the drop (same as the rise), in degrees of the cam. */
const RAMP = 36;
const DWELL = 10;
/** The two bumps sit opposite each other, at 0 and 180 degrees of the cam's own frame. */
const BUMPS = [0, 180];

// The game, in game numbers.
/** The hammer rings when the rod has risen this far. */
export const STRIKE = 9;
/** A ramp steeper than this, in degrees, wedges the rod in its guide: a rule of thumb, not a law. */
export const LIMIT = 45;
/** A wedged rod has climbed this far when the cam stops. */
export const JAM_RISE = 1;
const BELL_R = 7.5;
const BELL_H = 11.6;
/** The post guides the rod up to this far above the rod's rest top; in the game a taller post carries the bell, up to this far past its top. */
const POST_ABOVE_ROD = 4;
const POST_PAST_BELL = 2;

/** Radius of the rim at body angle `a` (degrees): the base circle, and each bump's straight ramps and dwell. */
function rim(lift: number, a: number): number {
  let h = 0;
  for (const c of BUMPS) {
    const away = Math.abs((((a - c) % 360) + 540) % 360 - 180);
    h = Math.max(h, away <= DWELL / 2 ? 1 : away >= DWELL / 2 + RAMP ? 0 : (DWELL / 2 + RAMP - away) / RAMP);
  }
  return R0 + lift * h;
}

/** The drawn outline: a vertex every degree, so the ramps and corners are in it. */
const outlines = new Map<number, Pt[]>();
function outlineOf(lift: number): Pt[] {
  let o = outlines.get(lift);
  if (!o) {
    o = Array.from({ length: 360 }, (_, i): Pt => [rim(lift, i) * Math.cos(i * DEG_TO_RAD), rim(lift, i) * Math.sin(i * DEG_TO_RAD)]);
    outlines.set(lift, o);
  }
  return o;
}

/**
 * The steepest the drawn rim climbs, as the angle between the rim's direction and the way the cam is turning there: the
 * pressure angle, the tilt of the push the rod feels away from straight up. It is the biggest at the foot of a ramp, where
 * the rim is closest to the axle, and is read off the drawn outline's edges.
 */
const rampAngles = new Map<number, number>();
export function rampAngle(lift: number): number {
  let worst = rampAngles.get(lift);
  if (worst !== undefined) return worst;
  worst = 0;
  const o = outlineOf(lift);
  for (let i = 0; i < o.length; i++) {
    const [x0, y0] = o[i] as Pt;
    const [x1, y1] = o[(i + 1) % o.length] as Pt;
    const dr = Math.hypot(x1, y1) - Math.hypot(x0, y0);
    const along = ((Math.hypot(x0, y0) + Math.hypot(x1, y1)) / 2) * DEG_TO_RAD;
    worst = Math.max(worst, Math.atan2(Math.abs(dr), along) * RAD_TO_DEG);
  }
  rampAngles.set(lift, worst);
  return worst;
}

/**
 * How high the follower stands above its rest, at cam turn `turn`: the highest point of the rim under its foot. The rim is
 * the drawn polygon, so this takes its vertices under the foot and where its edges cross the foot's two ends.
 */
export function rise(v: Values, turn: number): number {
  const th = turn * 360 * DEG_TO_RAD;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const o = outlineOf(valueOf(LIFT, v));
  const W = FOOT_W / 2;
  const n = o.length;
  let top = -Infinity;
  let px = o[0]![0] * c - o[0]![1] * s;
  let py = o[0]![0] * s + o[0]![1] * c;
  for (let i = 0; i < n; i++) {
    const next = o[(i + 1) % n]!;
    const qx = next[0] * c - next[1] * s;
    const qy = next[0] * s + next[1] * c;
    if (Math.abs(px) <= W) top = Math.max(top, py);
    if ((px + W) * (qx + W) < 0) top = Math.max(top, py + ((qy - py) * (-W - px)) / (qx - px));
    if ((px - W) * (qx - W) < 0) top = Math.max(top, py + ((qy - py) * (W - px)) / (qx - px));
    px = qx;
    py = qy;
  }
  return Math.max(0, top - R0);
}

const reaches = new Map<string, number>();
/** The first turn (0..1) at which the follower has risen `height`, or Infinity: where a ramp meets the rod. */
function firstReach(v: Values, height: number): number {
  const key = `${valueOf(LIFT, v)}:${height}`;
  let turn = reaches.get(key);
  if (turn === undefined) reaches.set(key, (turn = scanReach(v, height)));
  return turn;
}

function scanReach(v: Values, height: number): number {
  const N = 720;
  for (let i = 1; i <= N; i++) {
    if (rise(v, i / N) >= height) {
      let lo = (i - 1) / N;
      let hi = i / N;
      for (let k = 0; k < 40; k++) {
        const mid = (lo + hi) / 2;
        if (rise(v, mid) < height) lo = mid;
        else hi = mid;
      }
      return lo;
    }
  }
  return Infinity;
}

/** Everything a pose needs. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const lift = valueOf(LIFT, v);
  const turn = v.turn ?? 0.1;
  const up = rise(v, turn);
  /** The bell's lift off its hook, a run only. */
  const bell = v.bell ?? 0;
  return { lift, turn, up, bell, footY: CAM_Y + R0 + up, topY: REST_TOP + up };
}

const knobAngle = (turn: number) => KNOB_AT_0 + turn * 360;
const knobPoint = (turn: number) => v3(KNOB_R * Math.cos(knobAngle(turn) * DEG_TO_RAD), CAM_Y + KNOB_R * Math.sin(knobAngle(turn) * DEG_TO_RAD), KNOB_Z);

function build(v: Values): Part[] {
  const s = settle(v);
  const cam = pivoted(outlineOf(s.lift), CAM_T, [0, 0], v3(0, CAM_Y, ZC), s.turn * 360);
  const outline: Pt[] = [[-FOOT_W / 2, 0], [FOOT_W / 2, 0], [FOOT_W / 2, ROD_L], [-FOOT_W / 2, ROD_L]];
  const rod = pivoted(outline, CAM_T, [0, 0], v3(0, s.footY, ZC), 0);
  return [
    plate(68, 36),
    // The post is no taller than the rod needs; in the game the scene stacks a piece on it to hold the bell.
    post("post", 0, POST_Z, REST_TOP + POST_ABOVE_ROD, { name: "Post", role: "Carries the cam and guides the follower." }),
    part("cam", "Cam", "A wheel with wedge-shaped bumps: each rises along a ramp, dwells, and drops.", cam.shape, cam.position, look.focus, on("post", "hinge"), cam.rotation),
    part("follower", "Follower", "Its flat end rests on the rim and copies its height as an up-and-down motion.", rod.shape, rod.position, look.steel, on("post", "slide")),
    knob("knob", knobPoint(s.turn), "z", { name: "Knob", role: "Where your hand turns the cam.", on: on("cam", "press-fit") }),
  ];
}

function readouts(v: Values) {
  const s = settle(v);
  return [
    { label: "Rod height", value: `highest rim under the foot − rest = ${fmt(s.up, 1)} mm of ${s.lift} mm` },
    { label: "Travel", value: `cam ${fmt(s.turn * 360)}° round, ${fmt(rampAngle(s.lift))}° ramps` },
    { label: "State", value: s.up < 0.05 ? "on the base circle" : s.up >= s.lift - 0.05 ? `dwelling on a ${s.lift} mm bump` : `riding a ramp: ${fmt(s.up, 1)} of ${s.lift} mm` },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "silent" | "jam";

/** The outcome, decided once from the lift; meters, judge and play all read it. */
export function beat(v: Values) {
  const lift = valueOf(LIFT, v);
  const angle = rampAngle(lift);
  const kind: Kind = angle > LIMIT ? "jam" : lift < STRIKE ? "silent" : "pass";
  return { kind, lift, angle, rings: kind === "pass" ? BUMPS.length : 0 };
}

function judge(v: Values): Verdict {
  const r = beat(v);
  switch (r.kind) {
    case "jam":
      return { pass: false, outcome: "cam-jammed", headline: "Cam jammed", detail: "Bumps too tall and steep: the rod wedges in its guide and the cam stops." };
    case "silent":
      return { pass: false, outcome: "bell-silent", headline: "Bell stays silent", detail: "Bumps too low: the rod never reaches the bell, so nothing rings." };
    case "pass":
      return { pass: true, outcome: "bell-rung", headline: "Bell rung", detail: "Bumps tall enough to hit the bell, gentle enough to keep turning." };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = beat(v);
  return [
    { label: "Lift", value: r.lift, target: STRIKE, max: 14, unit: "mm", need: "atLeast" },
    { label: "Steepness", value: r.angle, target: LIMIT, max: 60, unit: "°", need: "atMost" },
  ];
}

// Choreography, ms.
const SPIN = 3000;
const HOLD = 600;

const DT = 4;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = beat(v);
  const t0 = clamp(v.turn ?? 0, 0, 1);
  const tl = phases({ rewind: t0 > 1e-9 ? REWIND : 0, lead: LEAD, spin: SPIN, hold: HOLD });
  const jamTurn = r.kind === "jam" ? firstReach(v, JAM_RISE) : Infinity;
  /** The share of the spin at which the jam stops the cam. */
  const jamU = r.kind === "jam" ? whenReaches(smooth, jamTurn, 0, 1) : Infinity;
  /** How long the stopped cam shudders against the rod, as a share of the spin. */
  const SHUDDER_U = 0.2;
  /** The cam's turn a share `u` of the way through the spin: with a short ease at each end, stopped by the jam, and shuddering against it. */
  const spinTurn = (u: number) => (u < jamU ? smooth(u) : jamTurn - 0.004 * Math.abs(shudder(clamp((u - jamU) / SHUDDER_U, 0, 1))));
  const turnOf = (ms: number) => {
    const { phase } = tl.at(ms);
    switch (phase) {
      case "rewind":
        return t0 * (1 - smooth(tl.t("rewind", ms)));
      case "lead":
        return 0;
      case "spin":
        return spinTurn(tl.t("spin", ms));
      case "hold":
        return r.kind === "jam" ? spinTurn(1) : 1;
    }
  };
  // A ring where the rod first meets the bell, on each bump that clears it: scan the run.
  const cues: Cue[] = [];
  let ringing = false;
  for (let ms = 0; ms <= tl.total; ms += DT) {
    const touching = rise(v, turnOf(ms)) >= STRIKE - 0.01;
    if (touching && !ringing) cues.push({ ms, kind: "ring" });
    ringing = touching;
  }
  if (r.kind === "jam") cues.push({ ms: tl.start("spin") + SPIN * jamU, kind: "thud" });
  /** The bell hangs loose on its hook: the rod lifts it as far as the rod rises past it, and it rests on the hook again as the rod drops. */
  const values = (ms: number): Values => {
    const turn = clamp(turnOf(ms), 0, 1);
    return { ...v, lift: v.lift ?? 12, turn, bell: clamp(rise({ ...v, lift: v.lift ?? 12 }, turn) - STRIKE, 0, 10) };
  };
  const rungSoFar = (turn: number) => {
    // One ring for each bump whose top has passed: the bump at body angle c reaches the top at turn (90 - c) / 360, wrapped.
    const tops = BUMPS.map((c) => (((90 - c) / 360) % 1 + 1) % 1);
    return r.kind === "pass" ? tops.filter((t) => turn >= t - 1e-9).length : 0;
  };
  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      const turn = turnOf(ms);
      switch (phase) {
        case "rewind":
          return frame(values(ms), "Back to the start");
        case "lead":
          return frame(values(ms), "Ready to spin");
        case "spin":
          return frame(values(ms), tl.t("spin", ms) >= jamU ? "Jammed" : rungSoFar(turn) > 0 ? "Ringing" : "Rod rising");
        case "hold":
          return frame(values(ms), r.kind === "pass" ? "Bell rung" : r.kind === "jam" ? "Cam jammed" : "Missed the bell");
      }
    },
  };
}

/**
 * The game's one target: the bell, hung loose from the post just above the rod, its underside STRIKE mm above the rod's
 * rest top, and the piece of post that holds it. The bell's back touches the post, so it hangs on it. It is slate, not
 * steel: steel renders nearly white and would read as the handle.
 */
function scene(v: Values): Part[] {
  const b = lathe([[0, 0], [BELL_R, 0], [7.1, 1.4], [6, 4.5], [5.2, 8], [3.8, 10.4], [1.8, 11.4], [0, BELL_H]]);
  const bottom = REST_TOP + STRIKE + (v.bell ?? 0);
  const top = REST_TOP + STRIKE + BELL_H + POST_PAST_BELL;
  return [
    post(`${SCENE}post`, 0, POST_Z, top, { name: "Post", role: "Carries the bell above the rod.", bottom: REST_TOP + POST_ABOVE_ROD, on: on("post", "weld") }),
    part(`${SCENE}bell`, "Bell", "Rings when the rod reaches it.", b.shape, v3(0, bottom + b.midY, POST_Z + 4 + BELL_R), look.slate, on(`${SCENE}post`, "screw")),
  ];
}

const LIFT: Slider = { id: "lift", label: "Lift", min: 4, max: 14, step: 1, initial: 12, unit: " mm" };

export const cam: Primitive = {
  id: "cam",
  name: "Cam",
  level: "Mechanism",
  job: "Turn steady motion into a timed push",
  howItWorks:
    "A cam is a wheel whose edge bulges out like a wedge. Spin it steadily and a flat-ended rod resting on the edge is pushed up the rising ramp, held by the flat top, then dropped down the falling ramp. Where the bumps sit round the rim is the timing: this cam has two, so the rod is pushed twice a turn. The lift is the bump height above the base circle, and it sets the steepness too: a taller bump on the same ramp length is a steeper ramp. A ramp that is too steep pushes the rod sideways against its guide harder than it pushes it up, and the rod wedges; the 45° limit here is a rule of thumb, since real limits depend on friction and the guide. The rod rests on the cam by its own weight (real cams often use a spring), and friction is left out.",
  madeOf: ["wheel", "wedge"],
  seenIn: ["Click pen", "Music box", "Sewing machine"],
  sliders: [
    LIFT,
    { id: "turn", label: "Turn", min: 0, max: 1, step: 0.005, initial: 0.1, unit: "°", displayScale: 360 },
  ],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "turn",
    label: "Turn",
    at: (v) => knobPoint(settle(v).turn),
    // The knob rides a circle round the cam's axle: the turn whose knob angle points at the finger, nearest the current one.
    solve: (point, v) => {
      const a = Math.atan2(point.y - CAM_Y, point.x) * RAD_TO_DEG;
      const base = (a - KNOB_AT_0) / 360;
      return base + Math.round((v.turn ?? 0) - base);
    },
    // A bump too steep for the guide stops the cam where the ramp first meets the rod.
    reach: (v) => (rampAngle(valueOf(LIFT, v)) > LIMIT ? [0, Math.min(1, firstReach(v, JAM_RISE))] : [0, 1]),
  },
  game: {
    name: "Ring the bell",
    goal: "Set the lift so the bell rings, then spin the cam once.",
    rules: "The rod must rise high enough to hit the bell. Taller bumps push higher but are steeper, and too steep jams the cam. Without a cam, nothing times the push.",
    number: "lift",
    action: "Spin",
    meters,
    judge,
    play,
    start: { lift: 6, turn: 0 },
    // The range is wider than a bump so a bell the rod kicks up can move a whole frame's worth at a time.
    poses: [{ id: "bell", label: "Bell lift", min: 0, max: 10, step: 0.01, initial: 0, unit: " mm" }],
    scene,
  },
};

/** Exposed for tests: where the rod, the bell and the rim are. */
export const geometry = { R0, CAM_Y, REST_TOP, FOOT_W, ROD_L, BELL_H, BELL_R, POST_Z, RAMP, DWELL, BUMPS, outlineOf, knobAngle, firstReach };
