// Grip: hold by friction up to a limit, then slip (src/primitives/docs/design-language.md, motion-language.md).
//
// The rig is the textbook picture: a rod between two pink rubber pads, a thumb knob on the right one, and two arrows at
// one scale on the rod's top, side by side: the friction limit pointing up (μ × 2 × the squeeze) and the load pointing
// down. Both pads face the camera. Squeezing squashes the pads, so the number shows as thinner pads and a longer
// friction arrow. When the load is the longer arrow the rod has slid down to the plate; otherwise it stays where it is
// held. That is the whole threshold: two unmistakable poses.
//
// The game, "Hold on": a glass rod is held while the load climbs to LOAD_END. Squeeze too little and the load passes the
// friction limit, so the rod slides down; squeeze too much and the glass cracks. One number, the squeeze, decides both.
//
// Free play is its own rig, the plainest picture of a grip there is: a block resting on a plank hinged at one end. Lift
// the plank's free end and the block holds, holds, then slides off once the slope passes the friction angle, where
// tan θ = μ. The slider is the grip, from ice to rubber, and it moves that angle.
import type { Part } from "../../kit.ts";
import { RAD_TO_DEG } from "../../angles.ts";
import { clamp01, fall, lerp, smooth } from "../motion/ease.ts";
import { frame, phases } from "../motion/run.ts";
import { arrow, arrowLength, box, COLOR, cylinder, fmt, knob, look, on, part, pin, plate, PLATE_TOP, rotateAbout, v3, type Look, type Vec } from "../parts.ts";
import { type Cue, type Meter, type Motion, type Primitive, type Run, type Slider, type Task, type Values, type Verdict, VIEW } from "../types.ts";

/** Friction coefficient, assumed: it depends on the surfaces. */
export const MU = 0.4;
// Geometry, millimetres.
const ROD_R = 7;
const ROD_LEN = 56;
const PAD_T = 26;
const PAD_H = 60;
const PAD_Z = 30;
/** Rubber squashed: a pad pressed with N newtons loses N ÷ SOFT of its thickness. */
const SOFT = 150;
/** How far the rod slides when it lets go: from held to resting on the plate. */
export const SLIDE = 30;
/** The rod, held, has its bottom this high above the plate. */
const HELD_BOTTOM = PLATE_TOP + SLIDE;
/** The load's and the limit's arrows start this far above the rod's top, side by side. */
const ARROW_X = 5.5;
const FORCE_MAX = 60;
const ARROW_LONG = 40;
/** When the glass cracks a bit this long breaks off the bottom. */
const CHIP = 22;

// The game, in game numbers. Friction and the load are real; the glass's strength and the climb are set so the window
// sits mid-range.
/** The load climbs to this, N. */
export const LOAD_END = 30;
/** Each pad's squeeze at which the glass cracks, N. */
export const CRACK = 52;

/** The thumb knob sticks out of the right pad this far, so the pads and rod sit this far left to keep the rig centred. */
const KNOB = 20;
const X0 = -KNOB / 2;
const padThickness = (squeeze: number) => PAD_T * (1 - squeeze / SOFT);

/** Everything a pose needs. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const squeeze = v.squeeze ?? 40;
  const load = v.load ?? 20;
  const limit = MU * 2 * squeeze;
  const t = padThickness(squeeze);
  /** Run-only: how far the rod has slid (-1: not set by a run, so it has slid all the way when the load beats the limit). */
  const set = v.drop ?? -1;
  const slips = load > limit + 1e-9;
  const drop = set >= 0 ? set : slips ? SLIDE : 0;
  const cracked = (v.crack ?? 0) > 0.5;
  return { squeeze, load, limit, t, slips, drop, cracked, bottom: HELD_BOTTOM - drop };
}

const handleAt = (t: number) => v3(X0 + ROD_R + t + KNOB / 2, PLATE_TOP + PAD_H / 2, 0);

function build(v: Values): Part[] {
  const s = settle(v);
  const pad = (id: string, sign: number) =>
    part(
      id,
      "Pad",
      "Rubber that presses on the rod. It squashes as the squeeze grows.",
      box(s.t, PAD_H, PAD_Z, 1),
      v3(X0 + sign * (ROD_R + s.t / 2), PLATE_TOP + PAD_H / 2, 0),
      look.focus,
      on("plate", "weld"),
    );
  // A cracked rod is the main piece, still held, and a chip that has broken off its bottom and fallen.
  const mainBottom = s.cracked ? HELD_BOTTOM + CHIP : s.bottom;
  const mainLen = s.cracked ? ROD_LEN - CHIP : ROD_LEN;
  const rod = (id: string, bottom: number, len: number) =>
    part(id, "Rod", "The part being held.", cylinder(ROD_R, len).shape, v3(X0, bottom + len / 2, 0), look.steel, on("pad-left", "press-fit"));
  const top = mainBottom + mainLen;
  return [
    plate(2 * (ROD_R + padThickness(10)) + KNOB, PAD_Z),
    pad("pad-left", -1),
    pad("pad-right", 1),
    rod("rod", mainBottom, mainLen),
    ...(s.cracked ? [rod("rod-chip", s.bottom, CHIP)] : []),
    knob("handle", handleAt(s.t), "x", { name: "Thumb knob", role: "Where your hand pushes the pad on.", on: on("pad-right", "glue") }),
    ...arrow("limit-arrow", v3(X0 - ARROW_X, top, 0), 90, arrowLength(s.limit, FORCE_MAX, ARROW_LONG), "pull", {
      name: "Friction arrow",
      role: "The most the two pads can hold: μ × 2 × the squeeze, pointing up.",
      on: on("rod", "glue"),
    }),
    ...arrow("load-arrow", v3(X0 + ARROW_X, top, 0), -90, arrowLength(s.load, FORCE_MAX, ARROW_LONG), "push", {
      name: "Load arrow",
      role: "The load pulling the rod down, at the same scale.",
      on: on("rod", "glue"),
    }),
  ];
}

function readouts(v: Values) {
  const s = settle(v);
  const squash = Math.round((100 * s.squeeze) / SOFT);
  return [
    { label: "Friction limit", value: `μ × 2 pads × N = ${MU} × 2 × ${fmt(s.squeeze)} = ${fmt(s.limit, 1)} N` },
    {
      label: "Travel",
      value: s.drop > 0.05 ? `pads squashed ${squash}%; rod slid ${fmt(s.drop)} of ${SLIDE} mm` : `pads squashed ${squash}%; rod has not moved`,
    },
    {
      label: "State",
      value: s.slips
        ? `slips: the ${fmt(s.load)} N load is over the ${fmt(s.limit, 1)} N limit`
        : `holds: the ${fmt(s.load)} N load is under the ${fmt(s.limit, 1)} N limit`,
    },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "slip" | "crack";

/** The outcome, decided once from the squeeze; meters, judge and play all read it. */
export function hold(v: Values) {
  const squeeze = v.squeeze ?? 40;
  const limit = MU * 2 * squeeze;
  const kind: Kind = squeeze > CRACK ? "crack" : limit < LOAD_END - 1e-9 ? "slip" : "pass";
  return { kind, squeeze, limit };
}

function judge(v: Values): Verdict {
  const r = hold(v);
  switch (r.kind) {
    case "slip":
      return { pass: false, outcome: "slipped", headline: "The rod slipped", detail: "Too loose: the pads cannot grip hard enough, so the rod slides out." };
    case "crack":
      return { pass: false, outcome: "glass-cracked", headline: "The glass cracked", detail: "Too tight: the glass cannot take that squeeze and cracks." };
    case "pass":
      return { pass: true, outcome: "held", headline: "It held", detail: "The pads gripped firmly enough, and the glass took the squeeze." };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = hold(v);
  return [
    { label: "Grip", value: r.limit, target: LOAD_END, max: 50, unit: "N", need: "atLeast", digits: 1 },
    { label: "Glass strain", value: r.squeeze, target: CRACK, max: 60, unit: "N", need: "atMost" },
  ];
}

// Choreography, ms.
const LEAD = 300;
const RAMP = 2400;
const HOLD = 650;
const RESET = 650;
const FALL_MS = 380;
const START_LOAD = 5;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = hold(v);
  const load0 = v.load ?? START_LOAD;
  const tl = phases({ lead: LEAD, ramp: RAMP, hold: HOLD, reset: r.kind === "pass" ? RESET : 0 });
  const rampStart = tl.start("ramp");
  const loadAt = (ms: number) => load0 + (LOAD_END - load0) * clamp01((ms - rampStart) / RAMP);
  /** When the load reaches the limit, if it does. */
  const slipMs = r.kind === "slip" ? rampStart + (RAMP * (r.limit - load0)) / (LOAD_END - load0) : Infinity;
  const crackMs = r.kind === "crack" ? rampStart : Infinity;
  const cues: Cue[] = [];
  if (r.kind === "slip") cues.push({ ms: slipMs, kind: "slip" });
  if (r.kind === "crack") cues.push({ ms: crackMs, kind: "snap" });
  if (r.kind !== "pass") cues.push({ ms: Math.min(slipMs, crackMs) + FALL_MS, kind: "thud" });

  const values = (load: number, over: Values = {}): Values => ({ ...v, squeeze: r.squeeze, load, drop: -1, crack: 0, ...over });
  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      if (phase === "lead") return frame(values(load0), "Squeezing");
      if (phase === "reset") return frame(values(LOAD_END + (load0 - LOAD_END) * clamp01(tl.t("reset", ms))), "Putting it back");
      const load = loadAt(ms);
      const since = ms - Math.min(slipMs, crackMs);
      if (r.kind === "slip" && since >= 0) {
        const drop = SLIDE * fall(clamp01(since / FALL_MS));
        return frame(values(load, { drop }), since < FALL_MS ? "Slipping" : "Slipped!");
      }
      if (r.kind === "crack" && since >= 0) {
        const drop = SLIDE * fall(clamp01(since / FALL_MS));
        return frame(values(load, { drop, crack: 1 }), since < FALL_MS ? "Glass cracks" : "Cracked");
      }
      if (phase === "hold") return frame(values(load), "Holding");
      return frame(values(load), "Load growing");
    },
  };
}

// ---- Free play: a block on a plank -------------------------------------------------------------------------------
//
// Values: `mu` (the grip, the slider shown), `tilt` (the handle's), and two that only the let-go sets, so no slider
// shows them: `slid`, how far the block has gone from its spot (0) down the plank (ALONG) and off onto the plate (1),
// and `put`, how far it has been carried back to its spot (0 to 1). `slid` below 0 or missing means the tilt decides it.

const GRIP: Slider = { id: "mu", label: "Grip", min: 0.1, max: 1, step: 0.05, initial: 0.5, ends: ["Ice", "Rubber"] };
const TILT: Slider = { id: "tilt", label: "Tilt", min: 0, max: 60, step: 0.5, initial: 0, unit: "°" };

// Geometry, millimetres. The plank turns about a pin through its low end, at its mid-thickness, so lying flat it rests
// on the plate and tilted no corner of it dips below the plate.
const PLANK_L = 100;
const PLANK_T = 6;
const PLANK_Z = 30;
const BLOCK = 20;
const HINGE_R = 3;
const HINGE_LEN = PLANK_Z + 8;
/** The knob's centre is this far past the plank's end, so the knob's side meets the end face. Also the knob's radius. */
const LIFT_OUT = 5.5;
/** A block that has slid off lands this far clear of the hinge pin. */
const LAND_GAP = 6;
/** From the landed block's far face to the knob's far side: the rig's width, centred on the plate. */
const RIG_W = BLOCK + LAND_GAP + HINGE_R + PLANK_L + 2 * LIFT_OUT;
const HINGE: Vec = v3(-RIG_W / 2 + BLOCK + LAND_GAP + HINGE_R, PLATE_TOP + PLANK_T / 2, 0);
/** Along the plank from the hinge: the block's centre at its spot near the raised end, and with its downhill face at the low end. */
const BLOCK_HOME = PLANK_L - BLOCK / 2 - 6;
const BLOCK_END = BLOCK / 2;
/** The block's centre once it has slid off and landed on the plate, beyond the hinge. */
const LANDED = v3(HINGE.x - HINGE_R - LAND_GAP - BLOCK / 2, PLATE_TOP + BLOCK / 2, 0);
/** The share of `slid` spent going down the plank; the rest is the tumble off its end onto the plate. */
const ALONG = 0.75;
/**
 * How high the block's centre arcs above the straight line from the plank's end to where it lands. A block leaving
 * the end tips over the edge and the pin; this is the least arc that keeps it clear of both at every tilt.
 */
const HOP = 7;
/**
 * Past the friction angle, the drag alone shows the block going: it runs down the plank, faster and faster, over this
 * many more degrees of tilt, then is off. The stage moves a held figure only with the finger, so this stands in for the
 * second or so a real block takes; the let-go finishes any slide still under way in real time.
 */
const SLIP_WINDOW = 2;
/** How high the block is lifted, mid-way, when it is carried back to its spot. */
const CARRY = 28;
/** Grip at or under this shows the plank slick (a metal shine) rather than matte. */
const SLICK = 0.25;

/** The friction angle in degrees: the steepest slope the grip holds on, where tan θ = μ. */
export const slipAngle = (mu: number) => Math.atan(mu) * RAD_TO_DEG;

/** Free play's state at `v`; the build, the handle, the plot and the let-go all read it. */
export function ramp(v: Values) {
  const mu = v.mu ?? GRIP.initial;
  const tilt = v.tilt ?? TILT.min;
  const angle = slipAngle(mu);
  const over = (tilt - angle) / SLIP_WINDOW;
  const set = v.slid ?? -1;
  // Set by a let-go, or else followed from the tilt: still until the friction angle, then down the plank (distance as
  // the square, as gravity gives) and off once SLIP_WINDOW is passed.
  const slid = set >= 0 ? Math.min(1, set) : over <= 0 ? 0 : over >= 1 ? 1 : ALONG * over * over;
  const put = clamp01(v.put ?? 0);
  return { mu, tilt, angle, slips: tilt > angle, slid, put, onPlank: slid < ALONG + 1e-9 && put === 0 };
}

type Pose = { centre: Vec; angle: number };

/** The block on the plank, its centre `x` along it from the hinge, its underside on the plank's top. */
const onPlank = (x: number, tilt: number): Pose => ({ centre: rotateAbout([x, PLANK_T / 2 + BLOCK / 2], tilt, HINGE), angle: tilt });

/** Where the block is and how it is turned. */
export function blockPose(r: ReturnType<typeof ramp>): Pose {
  let pose: Pose;
  if (r.slid <= ALONG) pose = onPlank(lerp(BLOCK_HOME, BLOCK_END, r.slid / ALONG), r.tilt);
  else {
    // Off the low end and onto the plate, levelling out as it goes.
    const k = (r.slid - ALONG) / (1 - ALONG);
    const from = onPlank(BLOCK_END, r.tilt).centre;
    pose = { centre: v3(lerp(from.x, LANDED.x, k), lerp(from.y, LANDED.y, k) + HOP * Math.sin(Math.PI * k)), angle: r.tilt * (1 - k) };
  }
  if (r.put === 0) return pose;
  // Carried back in a low arc over the hinge to its spot, so it can slide again.
  const home = onPlank(BLOCK_HOME, r.tilt);
  return {
    centre: v3(lerp(pose.centre.x, home.centre.x, r.put), lerp(pose.centre.y, home.centre.y, r.put) + CARRY * Math.sin(Math.PI * r.put)),
    angle: lerp(pose.angle, home.angle, r.put),
  };
}

/** The knob at the plank's free end: the point the finger lifts. */
const liftAt = (tilt: number) => rotateAbout([PLANK_L + LIFT_OUT, 0], tilt, HINGE);

function rampBuild(v: Values): Part[] {
  const r = ramp(v);
  const b = blockPose(r);
  return [
    plate(RIG_W, HINGE_LEN),
    pin("hinge", HINGE, HINGE_LEN, { name: "Hinge", role: "The plank turns on it." }),
    part(
      "plank",
      "Plank",
      "Its top is the grip: the block stays put on it until the slope is too steep.",
      box(PLANK_L, PLANK_T, PLANK_Z, 1),
      rotateAbout([PLANK_L / 2, 0], r.tilt, HINGE),
      { color: COLOR.focus, finish: r.mu <= SLICK + 1e-9 ? "metal" : "matte" },
      on("hinge", "hinge"),
      v3(0, 0, r.tilt),
    ),
    part(
      "block",
      "Block",
      "The load the grip holds on the slope.",
      box(BLOCK, BLOCK, BLOCK, 1.5),
      b.centre,
      look.stone,
      on(r.onPlank ? "plank" : "plate", "slide"),
      v3(0, 0, b.angle),
    ),
    knob("handle", liftAt(r.tilt), "z", { name: "Lift knob", role: "Where your finger lifts the plank's end.", on: on("plank", "glue") }),
  ];
}

// The let-go, ms. The plank falls flat under its own weight; a block already going finishes its run off; one that
// has slid off sits on the plate a moment, then is carried back to its spot.
const PLANK_FALL_MS = 420;
const SLIDE_MS = 420;
const LANDED_MS = 500;
const CARRY_MS = 650;

function letGo(v: Values): Motion {
  const r = ramp(v);
  const fallMs = Math.round(PLANK_FALL_MS * Math.sqrt(r.tilt / TILT.max));
  const tiltAt = (ms: number) => (fallMs > 0 ? r.tilt * (1 - fall(clamp01(ms / fallMs))) : 0);
  const rest: Values = { ...v, tilt: 0, slid: -1, put: 0 };
  if (r.slid === 0 && r.put === 0) {
    // Still held by the grip: the block rides the plank down.
    const durationMs = Math.max(1, fallMs);
    return {
      durationMs,
      at: (ms) => frame(ms >= durationMs ? rest : { ...rest, tilt: tiltAt(ms) }, ""),
      ...(fallMs > 0 ? { cues: [{ ms: fallMs, kind: "thud" as const }] } : {}),
    };
  }
  const slideMs = r.slid < 1 ? Math.round(SLIDE_MS * Math.sqrt(1 - r.slid)) : 0;
  const tl = phases({ drop: Math.max(fallMs, slideMs), landed: r.put > 0 ? 0 : LANDED_MS, carry: Math.round(CARRY_MS * (1 - r.put)) });
  return {
    durationMs: tl.total,
    cues: [{ ms: slideMs > 0 ? slideMs : fallMs, kind: "thud" }],
    at: (ms) => {
      if (ms >= tl.total) return frame(rest, "");
      const slid = slideMs > 0 ? r.slid + (1 - r.slid) * fall(clamp01(ms / slideMs)) : 1;
      return frame({ ...v, tilt: tiltAt(ms), slid, put: r.put + (1 - r.put) * smooth(tl.t("carry", ms)) }, "");
    },
  };
}

// ---- Free play's goal: lift the plank to the green by hand, without the block slipping -------------------------------
//
// A ghost plank in see-through green marks the angle to reach. The hand lifts the real plank, as in free play. The block
// holds while the slope is under its friction angle (tan θ = μ); past it, it slides off, and letting go brings it home.
// Only the grip slider decides which: enough grip, and the block rides the plank up to the green.

/** The angle to reach, degrees: a grip of 0.75 or better holds there, 0.7 and under does not (tan 35° = 0.700). */
export const TARGET = 35;
/** Within this of the green counts as there: half the tilt's step. */
const NEAR = 0.5;

/**
 * Watches the hand: `reached` once the plank has been at the green with the block still on its spot, `failed` once the
 * block has slid, for the hint. It only records; the hand and the let-go move the machine.
 */
function watch(v: Values): Values {
  const r = ramp(v);
  const out: Values = { ...v };
  if (r.tilt >= TARGET - NEAR && r.slid === 0 && r.put === 0) out.reached = 1;
  if (r.slid > 0) out.failed = 1;
  return out.reached === v.reached && out.failed === v.failed ? v : out;
}

/** The ghost plank at the green angle: a see-through sheet the plank's size, with a solid green rim. */
function ghost(): Part[] {
  const sheet = (id: string, w: number, t: number, d: number, x: number, y: number, z: number, look_: Look) =>
    part(`goal-${id}`, "Goal", "The angle to lift the plank to.", box(w, t, d), { ...rotateAbout([x, y], TARGET, HINGE), z }, look_, on("plate", "glue"), v3(0, 0, TARGET));
  const top = PLANK_T / 2;
  const RIM = 1.4;
  return [
    sheet("sheet", PLANK_L, 0.6, PLANK_Z, PLANK_L / 2, top, 0, look.goalClear),
    sheet("near", PLANK_L, RIM, RIM, PLANK_L / 2, top, PLANK_Z / 2, look.goal),
    sheet("far", PLANK_L, RIM, RIM, PLANK_L / 2, top, -PLANK_Z / 2, look.goal),
    sheet("end", RIM, RIM, PLANK_Z, PLANK_L, top, 0, look.goal),
  ];
}

const TASKS: Task[] = [
  {
    goal: "Lift it to the green without it slipping.",
    hand: true,
    scene: ghost,
    // Reached by hand, and still a grip that holds there: turned down after, it no longer would.
    met: (v) => (v.reached ?? 0) > 0 && slipAngle(v.mu ?? GRIP.initial) >= TARGET,
    hint: (v) => ((v.failed ?? 0) > 0 && slipAngle(v.mu ?? GRIP.initial) < TARGET ? "Too slick, so it slides off. Add grip." : undefined),
    drive: watch,
  },
];

export const grip: Primitive = {
  id: "grip",
  name: "Grip",
  level: "Element",
  job: "Hold by friction up to a limit, then slip",
  howItWorks:
    "Two surfaces pressed together resist sliding with a friction force up to μ times the force pressing them together. Below that limit the grip holds exactly as hard as the load needs; above it, the rod slips. Here two pads press with the same force each, so the limit is μ × 2N, with μ = 0.4 assumed (it depends on the surfaces). Squeezing harder raises the limit, and squashes the rubber more. Sliding friction is usually a little lower than this limit and is not modelled; a slipped rod is shown resting on the plate.",
  madeOf: [],
  seenIn: ["Brake pad", "Press-fit lid", "Knot"],
  sliders: [
    { id: "squeeze", label: "Squeeze (each pad)", min: 10, max: 60, step: 1, initial: 40, unit: " N" },
    { id: "load", label: "Load", min: 5, max: 60, step: 1, initial: 20, unit: " N" },
  ],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "squeeze",
    label: "Squeeze",
    at: (v) => handleAt(settle(v).t),
    // The knob sits on the right pad's outer face, which is ROD_R + thickness out: invert thickness = PAD_T (1 - N ÷ SOFT).
    solve: (point) => SOFT * (1 - (point.x - X0 - KNOB / 2 - ROD_R) / PAD_T),
  },
  play: {
    sliders: [GRIP, TILT],
    handle: {
      slider: TILT.id,
      label: "Lift",
      at: (v) => liftAt(ramp(v).tilt),
      // The knob rides a circle about the hinge, so the tilt is the angle from the hinge to the finger.
      solve: (point) => Math.atan2(point.y - HINGE.y, point.x - HINGE.x) * RAD_TO_DEG,
      // Once the block has started down, the hand can only lift further until it lets go. Lowering the plank would show
      // the block climbing back up: while held, the figure can only follow the tilt, so it cannot remember the slide.
      reach: (v) => {
        const r = ramp(v);
        return r.slid > 0 ? [r.tilt, TILT.max] : [TILT.min, TILT.max];
      },
    },
    label: "Lift",
    build: rampBuild,
    tasks: TASKS,
    // The plank lying flat with the block at its spot near the free end, on a middling grip.
    rest: { mu: GRIP.initial, tilt: 0 },
    release: letGo,
  },
  game: {
    name: "Hold on",
    goal: "Hold the glass rod as the load grows, without cracking it.",
    rules: "A harder squeeze grips better, but glass cracks if squeezed too hard. The load keeps growing, so squeeze enough to hold to the end.",
    number: "squeeze",
    action: "Add the load",
    meters,
    judge,
    play,
    start: { squeeze: 20, load: START_LOAD },
    poses: [
      { id: "drop", label: "Rod slid", min: -1, max: SLIDE, step: 0.1, initial: -1, unit: " mm" },
      { id: "crack", label: "Glass cracked", min: 0, max: 1, step: 1, initial: 0 },
    ],
  },
};

/** Exposed for tests: the layout the parts are placed by. */
export const geometry = { X0, KNOB, ROD_R, ROD_LEN, PAD_T, PAD_H, HELD_BOTTOM, CHIP, SOFT };
