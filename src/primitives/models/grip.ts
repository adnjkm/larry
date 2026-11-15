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
import type { Part } from "../../../shared/kit.ts";
import { clamp01, fall } from "../motion/ease.ts";
import { frame, phases } from "../motion/run.ts";
import { arrow, arrowLength, box, cylinder, fmt, knob, look, on, part, plate, PLATE_TOP, v3 } from "../parts.ts";
import { type Cue, type Meter, type Primitive, type Run, type Values, type Verdict, VIEW } from "../types.ts";

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
    part(id, "Pad", "Rubber that presses on the rod. It squashes as the squeeze grows.", box(s.t, PAD_H, PAD_Z, 1), v3(X0 + sign * (ROD_R + s.t / 2), PLATE_TOP + PAD_H / 2, 0), look.focus, on("plate", "weld"));
  // A cracked rod is the main piece, still held, and a chip that has broken off its bottom and fallen.
  const mainBottom = s.cracked ? HELD_BOTTOM + CHIP : s.bottom;
  const mainLen = s.cracked ? ROD_LEN - CHIP : ROD_LEN;
  const rod = (id: string, bottom: number, len: number) => part(id, "Rod", "The part being held.", cylinder(ROD_R, len).shape, v3(X0, bottom + len / 2, 0), look.steel, on("pad-left", "press-fit"));
  const top = mainBottom + mainLen;
  return [
    plate(2 * (ROD_R + padThickness(10)) + KNOB, PAD_Z),
    pad("pad-left", -1),
    pad("pad-right", 1),
    rod("rod", mainBottom, mainLen),
    ...(s.cracked ? [rod("rod-chip", s.bottom, CHIP)] : []),
    knob("handle", handleAt(s.t), "x", { name: "Thumb knob", role: "Where your hand pushes the pad on.", on: on("pad-right", "glue") }),
    ...arrow("limit-arrow", v3(X0 - ARROW_X, top, 0), 90, arrowLength(s.limit, FORCE_MAX, ARROW_LONG), "pull", { name: "Friction arrow", role: "The most the two pads can hold: μ × 2 × the squeeze, pointing up.", on: on("rod", "glue") }),
    ...arrow("load-arrow", v3(X0 + ARROW_X, top, 0), -90, arrowLength(s.load, FORCE_MAX, ARROW_LONG), "push", { name: "Load arrow", role: "The load pulling the rod down, at the same scale.", on: on("rod", "glue") }),
  ];
}

function readouts(v: Values) {
  const s = settle(v);
  const squash = Math.round((100 * s.squeeze) / SOFT);
  return [
    { label: "Friction limit", value: `μ × 2 pads × N = ${MU} × 2 × ${fmt(s.squeeze)} = ${fmt(s.limit, 1)} N` },
    { label: "Travel", value: s.drop > 0.05 ? `pads squashed ${squash}%; rod slid ${fmt(s.drop)} of ${SLIDE} mm` : `pads squashed ${squash}%; rod has not moved` },
    { label: "State", value: s.slips ? `slips: the ${fmt(s.load)} N load is over the ${fmt(s.limit, 1)} N limit` : `holds: the ${fmt(s.load)} N load is under the ${fmt(s.limit, 1)} N limit` },
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
