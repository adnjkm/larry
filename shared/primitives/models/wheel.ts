// Wheel: trade force for distance in continuous rotation. An element, rewritten to src/primitives/docs/design-language.md.
//
// The rig is the wheel and axle: one pink piece, a big flat wheel with a long axle through it, standing on a post. A
// cord winds onto the axle's front end and hangs a bucket; a knob on the wheel's rim is where a hand turns it. The
// number is the wheel's radius, drawn: a bigger wheel is a visibly wider disc against the same axle, and the two radii
// are the ratio. Clockwise lifts the bucket, and the cord winds on as it goes (the wound arc grows with the turn).
//
// Two radii, each the same everywhere. The axle's is the cord's centre line, 8 + 1.6 = 9.6 mm from its middle. The
// wheel's is the knob's centre, which sits ON the rim, R from the middle: that is where the hand pulls, so the hold force
// W x 9.6 / R, the hand's travel 2 pi R a turn and the pull arrow all use it. The bucket rises 2 pi x 9.6 mm a turn.
// An arm gives 15 N, so below a radius of 32 the wheel only strains a millimetre or two (`handle.reach`), and the sliders
// cannot make the picture show a turn the hand could not give.
//
// The turn slider stops at 0.55: the lift needs half a turn, and a knob that went on round to the lower left would swing
// through the bucket's side of the wheel.
//
// The game, "Winch": lift the bucket 30 mm with an arm that pulls 15 N and travels 120 mm. A small wheel needs more than
// 15 N; a big one needs more rim travel than the arm has, so it stops short.
import type { Part } from "../../kit.ts";
import { clamp, fall, rockBack, shudder, smooth } from "../motion/ease.ts";
import { frame, handArrow, HOLD, phases, SCENE } from "../motion/run.ts";
import {
  arrow,
  arrowLength,
  cylinder,
  fmt,
  knob,
  loadBlock,
  loadEdge,
  look,
  on,
  part,
  PLATE_TOP,
  plate,
  post,
  ring,
  shaped,
  strand,
  tick,
  v3,
  type Pt,
} from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW, type Slider, valueOf } from "../types.ts";

// Geometry, millimetres. The wheel's face is at z = 0 before the shift that centres the rig.
const AXLE_R = 8;
const CORD = 3.2;
/** The one radius the cord pulls at: its centre line, from the axle's middle. */
export const R_EFF = AXLE_R + CORD / 2;
const AXLE_Y = 88;
const DISC_T = 5;
/** The axle runs from the post's face to here. */
const Z_AXLE_BACK = -4;
const Z_AXLE_FRONT = 40;
/** The cord winds on at this z, beyond the knob's tip so the bucket clears the turning knob. */
const Z_CORD = 33;
const Z_KNOB = DISC_T / 2 + 10;
const POST_Z = Z_AXLE_BACK - 4;
/** Shift that centres the rig's depth on the plate. */
const ZS = -15.4;
/** The knob's angle at turn 0, degrees anticlockwise from +x; the wheel turns clockwise to lift. */
const KNOB_AT_0 = 150;
/** mm per N for every arrow: the 50 N bucket is 40 long. */
const MM_PER_N = 0.8;
const STRAIN_MM = 1.5;

// The game, in game numbers. The moments and the arc are real; the arm is set so the window sits mid-range.
export const LOAD = 50;
/** What the arm can pull with at the rim. */
export const ARM = 15;
/** How far the arm's hand can travel along the rim. */
export const REACH = 120;
/** The bucket must rise this far. */
export const LIFT = 30;
/** A little over the half turn the lift takes (30 ÷ (2 pi x 9.6) = 0.50). Was 0.8, which swung the knob down to the bucket. */
export const TURN_MAX = 0.55;

const TAU = 2 * Math.PI;
/** Where the knob sits: its centre is on the rim, so the hand's radius is the wheel's. */
const knobR = (radius: number) => radius;
const knobAngle = (turn: number) => KNOB_AT_0 - 360 * turn;
const knobPoint = (radius: number, turn: number): Pt => {
  const a = (knobAngle(turn) * Math.PI) / 180;
  return [knobR(radius) * Math.cos(a), knobR(radius) * Math.sin(a)];
};

/** Everything a pose needs, from the two sliders. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const radius = valueOf(RADIUS, v);
  /** The hand's radius: where the knob is, the one radius every force and travel below uses. */
  const hand = knobR(radius);
  const ratio = hand / R_EFF;
  /** The pull at the knob that holds the bucket at any turn. */
  const hold = (LOAD * R_EFF) / hand;
  const weak = hold > ARM + 1e-9;
  /** A hand that cannot pull this much gets a millimetre or two of travel at the knob. */
  const strain = STRAIN_MM / (TAU * hand);
  const limit = weak ? strain : TURN_MAX;
  const turn = clamp(v.turn ?? 0.3, 0, limit);
  return { radius, hand, ratio, hold, weak, limit, turn, rim: TAU * hand * turn, rise: TAU * R_EFF * turn, effort: weak ? ARM : hold };
}

const wheelAt = (z: number) => z + ZS;

function build(v: Values): Part[] {
  const s = settle(v);
  const k = knobPoint(s.radius, s.turn);
  const kDeg = knobAngle(s.turn);
  const wound = clamp(30 + 360 * s.turn, 30, 340);
  const bucket = loadBlock("bucket", v3(-R_EFF, PLATE_TOP + s.rise, wheelAt(Z_CORD)), LOAD, MM_PER_N, {
    name: "Load",
    role: "The bucket the wheel lifts: its weight tries to turn the wheel back.",
    on: on("cord", "glue"),
    arrowSide: "left",
  });
  const cord = strand(v3(-R_EFF, AXLE_Y, wheelAt(Z_CORD)), v3(-R_EFF, bucket.top, wheelAt(Z_CORD)), CORD);
  const parts: Part[] = [
    plate(95, 55),
    post("post", 0, wheelAt(POST_Z), AXLE_Y + 5, { name: "Post", role: "Holds the wheel and axle." }),
    part(
      "axle",
      "Wheel",
      "The small wheel the cord winds onto: the wheel's own centre, turning with it.",
      cylinder(AXLE_R, Z_AXLE_FRONT - Z_AXLE_BACK).shape,
      v3(0, AXLE_Y, wheelAt((Z_AXLE_BACK + Z_AXLE_FRONT) / 2)),
      look.focus,
      on("post", "hinge"),
      v3(90, 0, 0),
    ),
    part(
      "wheel",
      "Wheel",
      "The big wheel: a small pull at its rim is a big pull at the axle.",
      cylinder(s.radius, DISC_T).shape,
      v3(0, AXLE_Y, wheelAt(0)),
      look.focus,
      on("axle", "weld"),
      v3(90, 0, 0),
    ),
    part(
      "wound",
      "Cord",
      "Cord wrapped on the axle: more of it as the bucket rises.",
      ring(R_EFF, CORD / 2, wound),
      v3(0, AXLE_Y, wheelAt(Z_CORD)),
      look.slate,
      on("axle", "glue"),
      v3(90, 180 - wound / 2, 0),
    ),
    shaped("cord", "Cord", "Hangs the bucket from the axle.", cord, look.slate, on("axle", "glue")),
    ...bucket.parts.map((p) => (/arrow/.test(p.id) ? { ...p, name: "Arrow" } : p)),
    knob("knob", v3(k[0], AXLE_Y + k[1], wheelAt(Z_KNOB)), "z", { name: "Knob", role: "Where a hand turns the wheel.", on: on("wheel", "weld") }),
  ];
  // The hand holds the bucket against the wheel's pull once it is turning: at rest the bucket stands on the plate.
  if (s.turn > 1e-9) {
    const tangent = kDeg - 90;
    const u: Pt = [Math.cos((tangent * Math.PI) / 180), Math.sin((tangent * Math.PI) / 180)];
    parts.push(
      ...arrow("pull-arrow", v3(k[0] - 5.5 * u[0], AXLE_Y + k[1] - 5.5 * u[1], wheelAt(Z_KNOB)), tangent, arrowLength(s.effort, LOAD, 40), "push", {
        name: "Arrow",
        role: s.weak ? "An arm's whole pull at the rim: 15 N, not enough." : "The pull at the rim that holds the bucket, to the same scale.",
        on: on("knob", "glue"),
      }),
    );
  }
  return parts;
}

function readouts(v: Values) {
  const s = settle(v);
  const state = s.weak
    ? `needs ${fmt(s.hold, 1)} N, arm gives ${ARM}: it strains ${fmt(STRAIN_MM, 1)} mm`
    : s.turn < 1e-9
      ? "bucket stands on the plate"
      : `holding the bucket takes ${fmt(s.hold, 1)} N of the arm's ${ARM}`;
  return [
    { label: "Pull at rim", value: `F = ${LOAD} N × ${fmt(R_EFF, 1)} ÷ ${fmt(s.hand)} = ${fmt(s.hold, 1)} N` },
    { label: "Travel", value: `rim ${fmt(s.rim)} mm, bucket up ${fmt(s.rise)} mm: ${fmt(s.rim)} ÷ ${fmt(s.rise)} = ${fmt(s.ratio, 1)}×` },
    { label: "State", value: state },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "weak" | "short";

/** The outcome, decided once from the radius; meters, judge and play all read it. */
export function winch(v: Values) {
  const radius = valueOf(RADIUS, v);
  const hand = knobR(radius);
  const hold = (LOAD * R_EFF) / hand;
  /** The travel at the knob the lift takes: the bucket rises R_EFF per radian, the hand travels `hand` per radian. */
  const need = (LIFT * hand) / R_EFF;
  const kind: Kind = hold > ARM + 1e-9 ? "weak" : need > REACH + 1e-9 ? "short" : "pass";
  /** How far up the arm gets the bucket, if it were strong enough. */
  const canLift = (REACH * R_EFF) / hand;
  return { kind, radius, hand, hold, need, canLift, turn: LIFT / (TAU * R_EFF), armTurn: REACH / (TAU * hand) };
}

function judge(v: Values): Verdict {
  const r = winch(v);
  switch (r.kind) {
    case "weak":
      return {
        pass: false,
        outcome: "too-heavy",
        headline: "Too heavy to turn",
        detail: "Wheel too small: without a big wheel to turn, one arm cannot pull hard enough.",
      };
    case "short":
      return {
        pass: false,
        outcome: "out-of-reach",
        headline: "Arm ran out",
        detail: "Wheel too big: the arm runs out of reach before the bucket gets to the line.",
      };
    case "pass":
      return {
        pass: true,
        outcome: "bucket-lifted",
        headline: "Bucket lifted",
        detail: "The wheel makes the pull easy, and the arm still reaches far enough.",
      };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = winch(v);
  return [
    { label: "Arm effort", value: r.hold, target: ARM, max: 30, unit: "N", need: "atMost", digits: 1 },
    { label: "Lift room", value: r.canLift, target: LIFT, max: 50, unit: "mm", need: "atLeast", digits: 1 },
  ];
}

// Choreography, ms.
const LEAD = 300;
const RESET = 650;
const TWITCH = 700;
const REBOUND_MS = 260;
/** Rim travel the arm gives back when it runs out and hits its stop, mm. */
const REBOUND_MM = 2;
/** A turn back down at the end, when the arm has given out and lets go. */
const DROP_MS = 520;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = winch(v);
  const home = clamp(v.turn ?? 0, 0, TURN_MAX);
  const to = r.kind === "pass" ? r.turn : r.kind === "short" ? r.armTurn : 0;
  const haulMs = clamp(500 + 1700 * (to - home), 500, 1500);
  const tl =
    r.kind === "weak"
      ? phases({ lead: LEAD, haul: 0, twitch: TWITCH, hold: HOLD, reset: 0, drop: 0 })
      : r.kind === "short"
        ? phases({ lead: LEAD, haul: haulMs, twitch: 0, hold: HOLD, reset: 0, drop: DROP_MS })
        : phases({ lead: LEAD, haul: haulMs, twitch: 0, hold: HOLD, reset: RESET, drop: 0 });
  const cues: Cue[] =
    r.kind === "short"
      ? [
          { ms: tl.end("haul"), kind: "thud" },
          { ms: tl.end("hold") + DROP_MS * 0.95, kind: "thud" },
        ]
      : r.kind === "pass"
        ? [{ ms: tl.end("haul"), kind: "click" }]
        : [{ ms: tl.start("twitch") + 120, kind: "thud" }];

  const values = (turn: number): Values => ({ ...v, radius: r.radius, turn });
  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      if (phase === "lead") {
        const s = settle(values(home));
        const tangent = knobAngle(home) - 90;
        const k = knobPoint(s.radius, home);
        const u: Pt = [Math.cos((tangent * Math.PI) / 180), Math.sin((tangent * Math.PI) / 180)];
        const hand = handArrow(v3(k[0] - 5.5 * u[0], AXLE_Y + k[1] - 5.5 * u[1], wheelAt(Z_KNOB)), tangent, "push", ARM * MM_PER_N);
        return frame(values(home), "Wind the wheel", home < 1e-9 ? hand : []);
      }
      if (phase === "twitch") {
        const turn = (STRAIN_MM / (TAU * r.hand)) * Math.abs(shudder(tl.t("twitch", ms)));
        return frame(values(turn), "Too heavy");
      }
      if (phase === "haul") {
        const turn = home + (to - home) * smooth(tl.t("haul", ms));
        return frame(values(turn), "Bucket rising");
      }
      if (phase === "hold") {
        const since = ms - tl.start("hold");
        if (r.kind === "weak") return frame(values(0), "Won't turn");
        // The arm is out: the wheel kicks back a little against the arm's stop, then the arm gives up.
        const back = r.kind === "short" && since < REBOUND_MS ? (REBOUND_MM / (TAU * r.hand)) * rockBack(since / REBOUND_MS, 1) : 0;
        return frame(values(to - back), r.kind === "pass" ? "Bucket lifted" : "Not high enough");
      }
      if (phase === "drop") return frame(values(to * (1 - fall(tl.t("drop", ms)))), "Letting go");
      return frame(values(to + (home - to) * smooth(tl.t("reset", ms))), "Putting it back");
    },
  };
}

/**
 * In the bucket's own plane (z), on the open left: a post and, on it, the line the top of the bucket has to reach. The
 * weight arrow stands between it and the bucket, so the line's free end stops just short of the arrow. Seen from the
 * front the line is against open background, not the support post or the wheel.
 */
const MARK_LEN = 10;
/** From the bucket's left face to the line's free end: the arrow's gap (4), its width (10) and a clear 3. */
const MARK_CLEAR = 4 + 10 + 3;

function scene(): Part[] {
  const edge = loadEdge(LOAD);
  const z = wheelAt(Z_CORD);
  const at = PLATE_TOP + LIFT + edge;
  const tip = -R_EFF - edge / 2 - MARK_CLEAR;
  return [
    post(`${SCENE}mark-post`, tip - MARK_LEN - 5, z, at + 4, { name: "Mark post", role: "Carries the line the bucket has to reach." }),
    tick(`${SCENE}mark`, v3(tip - MARK_LEN / 2, at, z), MARK_LEN, "x", {
      name: "Mark",
      role: "How high the top of the bucket has to get.",
      on: on(`${SCENE}mark-post`, "weld"),
    }),
  ];
}

const RADIUS: Slider = { id: "radius", label: "Wheel radius", min: 20, max: 44, step: 1, initial: 36, unit: " mm" };

export const wheel: Primitive = {
  id: "wheel",
  name: "Wheel",
  level: "Element",
  job: "Trade force for distance in continuous rotation",
  howItWorks:
    "A wheel and axle is a lever that can turn without end. A force at the rim of the big wheel turns the small axle, and the cord wound on the axle pulls with a force bigger by the ratio of the radii, R ÷ r, where r is measured to the cord's middle. The price is distance: the rim travels R ÷ r times further than the load rises. An arm that cannot pull the force a small wheel needs only strains it a millimetre or two. Friction in the bearing and the stiffness of the cord are left out.",
  madeOf: [],
  seenIn: ["Doorknob", "Screwdriver handle", "Tap"],
  sliders: [RADIUS, { id: "turn", label: "Turn", min: 0, max: TURN_MAX, step: 0.01, initial: 0.3, unit: " turns" }],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "turn",
    label: "Turn",
    at: (v) => {
      const s = settle(v);
      const k = knobPoint(s.radius, s.turn);
      return v3(k[0], AXLE_Y + k[1], wheelAt(Z_KNOB));
    },
    // The knob goes round a circle about the axle: the turn whose angle points at the finger, nearest the current one.
    solve: (point, v) => {
      const a = (Math.atan2(point.y - AXLE_Y, point.x) * 180) / Math.PI;
      const base = (KNOB_AT_0 - a) / 360;
      const now = v.turn ?? 0.3;
      return base + Math.round(now - base);
    },
    // A hand that cannot pull what the bucket needs gets a millimetre or two of rim travel; otherwise the whole range.
    reach: (v) => [0, settle(v).limit],
  },
  game: {
    name: "Winch",
    goal: "Lift the bucket to the line with one arm.",
    rules: "A bigger wheel makes your pull stronger, but your arm has to travel further. Find the size that is strong enough and short enough.",
    number: "radius",
    action: "Wind",
    meters,
    judge,
    play,
    start: { radius: 24, turn: 0 },
    scene,
  },
};

/** Exposed for tests: the layout. */
export const rig = { AXLE_Y, ZS, Z_CORD, Z_KNOB, DISC_T, wheelAt, MARK_LEN, MARK_CLEAR, BUCKET: loadEdge(LOAD) };
