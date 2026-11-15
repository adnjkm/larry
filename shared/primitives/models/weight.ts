// Weight: be pulled by gravity and resist changes in motion (src/primitives/docs/design-language.md, motion-language.md).
//
// The rig is the textbook pendulum: a bob on a string from the end of a stand's arm, and its weight arrow. The bob is
// held out on the left, where a hand has to hold it: a light bead on the string, just above the bob, is the handle, and
// the hand's pull along the swing, W sin a, is drawn for as long as the hand is on. Mass is the bob's size (radius goes
// as the cube root) and its weight arrow.
//
// Let go and it swings in closed form, small-angle: a = a0 cos(ωt), ω = √(g ÷ L), with L the string length actually
// drawn (100 mm). The time to the bottom, a quarter period, is ¼ × 2π√(L ÷ g) = 0.16 s at every mass. That equal time
// is the surprise; the run plays it slowed SLOW times so it can be seen.
//
// The game, "Wrecking ball": a crate on a pedestal stands on the far side of the bottom of the swing, so the bob must
// swing through the bottom, where the string pulls hardest, and strike the crate on the way up. It must hit hard enough
// to knock the crate off, but the harder it swings the harder it pulls on the string, which breaks at 60 N. One number,
// the mass, decides both.
//
// A snapped string is a projectile, solved here and not drawn by hand: the bob leaves the string where the pull first
// reaches 60 N, with the swing's speed along the arc there, and flies under gravity. Because the swing was still on its
// way down, the bob has not yet risen to the crate, and its fall in the time it takes to cross to it is larger than
// the lift the arc would have given it, so it drops below the crate and strikes the pedestal (or the plate). `freed` finds
// the first thing it touches by marching the flight; the tests march it across every failing setting, and down to the
// lightest bob that still snaps, where the string breaks the instant before the bottom.
import type { Part } from "../../kit.ts";
import { clamp, clamp01, easeOut, fall, rockBack, smooth } from "../motion/ease.ts";
import { frame, MARK, phases, ringTo, SCENE } from "../motion/run.ts";
import { ARROW_GAP, ARROW_MIN, arrow, arrowLength, box, fmt, lathe, look, on, part, plate, PLATE_TOP, shaped, strand, v3, type Pt } from "../parts.ts";
import { type Cue, type Meter, type Motion, type Plot, type Primitive, type Run, type Values, type Verdict, VIEW, type Slider, valueOf } from "../types.ts";
import { DEG_TO_RAD, RAD_TO_DEG } from "../../angles.ts";

const G = 9.8;
/** The string as drawn, the arm's underside to the bob's centre, mm. The period is worked out from this length, not from a made-up one. */
export const STRING_MM = 100;
const L = STRING_MM / 1000;
export const OMEGA = Math.sqrt(G / L);
/** Whole swing, s: 2π√(L ÷ g). */
export const PERIOD = (2 * Math.PI) / OMEGA;
/** Time from let-go to the bottom, s. The same at every mass and, in the small-angle swing, at every angle. */
export const QUARTER = PERIOD / 4;

// Geometry, millimetres.
const BOB_Y = 80;
const PIVOT_Y = BOB_Y + STRING_MM;
const ARM_T = 8;
const POST_W = 10;
/** The bob can be held out this far either side of hanging straight down (negative = left). */
const SWING_MIN = -40;
const SWING_MAX = 40;
/** In the game the crate is on the right, so the bob can only be pulled back away from it, and far enough (past the crate's 20°) to reach it. */
const GAME_MAX = -25;
const MASS_MAX = 5;
export const bobRadius = (mass: number) => 12 * Math.cbrt(mass);
/** How far left of the pivot the heaviest bob reaches, held out furthest. */
const REACH_LEFT = STRING_MM * Math.sin(-SWING_MIN * DEG_TO_RAD) + bobRadius(MASS_MAX);
const STRING_T = 3.2;
const BEAD_LEN = 12;
const BEAD_GAP = 9;
/** Weight's arrow is 40 long at the heaviest bob. */
const FORCE_MAX = MASS_MAX * G;
const ARROW_LONG = 40;

// The game, in game numbers. Momentum and the string's pull are exact for a swing let go at a; the crate's needs and
// the string's strength are set so the window sits mid-range for this string.
/** What the crate needs to be knocked off, kg·m/s. */
export const NEED = 1.2;
/** What the string takes before it breaks, N. */
export const SNAP = 60;
const CRATE = 24;
/** Where the bob strikes the crate: this far from the vertical, on the far side of the bottom, degrees. */
export const CONTACT = 20;
const CONTACT_X = STRING_MM * Math.sin(CONTACT * DEG_TO_RAD);
const CONTACT_Y = PIVOT_Y - STRING_MM * Math.cos(CONTACT * DEG_TO_RAD);
/** The bob's centre meets the crate this far above the crate's bottom. */
const LOW = 4;
/** The crate's bottom: the pedestal's top. */
const LEDGE_Y = CONTACT_Y - LOW;
/** The pedestal's near face is this far from the crate's, and its far edge this far from it. */
const PED_NEAR = 2;
const PED_FAR = 22;
/** The crate's centre goes this far past the pedestal's edge before it tips. */
const TIP_D = 5;
/** Where the tipping crate's pivot has moved to by the time it lies flat on the plate. */
const SPREAD = 14;
/** The crate, fallen, reaches this far from where its near face stood. */
const LAND_X = PED_FAR + SPREAD + CRATE;
const START_SWING = -35;

// The stand: its arm reaches over from a post on the right, past the crate and where it falls. Centred so the held bob's
// reach on the left balances the post.
const NEAR_MAX = CONTACT_X + bobRadius(MASS_MAX);
const POST_GAP = 8;
const POST_RIGHT_OF_PIVOT = NEAR_MAX + LAND_X + POST_GAP + POST_W;
export const X0 = (REACH_LEFT - POST_RIGHT_OF_PIVOT) / 2;
const POST_X = X0 + POST_RIGHT_OF_PIVOT - POST_W / 2;

const swingOf = (v: Values) => v.swing ?? SWING.initial;
/** The game's swing: held out on the left, between SWING_MIN and GAME_MAX, wherever free play left the slider. */
const gameSwing = (v: Values) => clamp(swingOf(v), SWING_MIN, GAME_MAX);

/** Everything a pose needs, from the sliders and the run-only poses. `build`, `readouts`, the handle and the game read this. */
export function settle(v: Values) {
  const mass = valueOf(MASS, v);
  const swing = swingOf(v);
  /** Where the bob hangs, signed: the slider's angle, plus how far a run has swung it on from there (0 while the hand holds it). */
  const angle = swing + (v.ahead ?? 0);
  const a = Math.abs(angle) * DEG_TO_RAD;
  const rb = bobRadius(mass);
  const snap = (v.snap ?? 0) > 0.5;
  const weight = mass * G;
  const along = weight * Math.sin(a);
  /** Where the bob is, hanging from the string. After the string snaps it is wherever the fall has put it. */
  const bob = snap ? v3(v.fx ?? 0, v.fy ?? 0, 0) : v3(X0 + STRING_MM * Math.sin(angle * DEG_TO_RAD), PIVOT_Y - STRING_MM * Math.cos(angle * DEG_TO_RAD), 0);
  /** The string's direction at the bob, up toward the arm: the bead sits on it. */
  const lean = snap ? 0 : angle;
  const up = rb + BEAD_GAP + BEAD_LEN / 2;
  const bead = v3(bob.x - up * Math.sin(lean * DEG_TO_RAD), bob.y + up * Math.cos(lean * DEG_TO_RAD), 0);
  /** A hand holds the bob out while a run has not yet let it go: the bob is where the slider put it. */
  const held = !snap && (v.ahead ?? 0) < 1e-9 && a > 1e-9;
  return { mass, swing, angle, a, rb, snap, weight, along, bob, lean, bead, held, rise: STRING_MM * (1 - Math.cos(a)) };
}

const BEAD_PROFILE: Pt[] = [
  [0, 0],
  [3.6, 0],
  [5, 1.6],
  [5, BEAD_LEN - 1.6],
  [3.6, BEAD_LEN],
  [0, BEAD_LEN],
];
const SPHERE_STEPS = 12;
const sphere = (r: number) =>
  lathe(
    Array.from({ length: SPHERE_STEPS + 1 }, (_, i): Pt => {
      const t = ((i / SPHERE_STEPS) * 180 - 90) * DEG_TO_RAD;
      return [r * Math.cos(t), r * Math.sin(t)];
    }),
  );

/** The snapped string's stub, hanging straight from the arm. */
const STUB = 38;

/** One part, an L: the post on the plate, to the right of the crate's fall, and the arm that reaches out over the bob. The string hangs from the arm's underside. */
function stand(): Part {
  const x0 = X0 - ARM_T / 2;
  const x1 = POST_X + POST_W / 2;
  const top = PIVOT_Y + ARM_T;
  const cx = (x0 + x1) / 2;
  const cy = (PLATE_TOP + top) / 2;
  const outline = [
    [x0, PIVOT_Y],
    [x1 - POST_W, PIVOT_Y],
    [x1 - POST_W, PLATE_TOP],
    [x1, PLATE_TOP],
    [x1, top],
    [x0, top],
  ].map(([x, y]) => ({ x: x! - cx, y: y! - cy }));
  return part(
    "stand",
    "Stand",
    "Holds the string up: a post at the right and an arm that reaches out over the bob and the crate.",
    { kind: "extrusion", outline, depth: 8 },
    v3(cx, cy, 0),
    look.structure,
    on("plate", "weld"),
  );
}

/** The hand's pull on the bead, along the swing and away from the bottom: it balances the part of the weight that would swing the bob back. */
function holdArrow(id: string, s: ReturnType<typeof settle>, parent: string, largest = FORCE_MAX, longest = ARROW_LONG): Part[] {
  if (s.a < 1e-9) return [];
  const t = s.angle > 0 ? 1 : -1;
  const at = v3(s.bead.x + 6 * t * Math.cos(s.angle * DEG_TO_RAD), s.bead.y + 6 * t * Math.sin(s.angle * DEG_TO_RAD), 0);
  return arrow(id, at, s.angle > 0 ? s.angle : 180 + s.angle, arrowLength(s.along, largest, longest), "pull", {
    name: "Hand arrow",
    role: "Your hand's pull along the swing: it holds the bob out.",
    on: on(parent, "glue"),
  });
}

/** The pendulum as the game and the library show it: its weight and the hand's hold drawn on it, to scale. */
const build = (v: Values): Part[] => draw(v, true);
/** The pendulum alone, as free play's hand meets it: stand, string, bead and bob, no arrows. */
const bare = (v: Values): Part[] => draw(v, false);

function draw(v: Values, forces: boolean): Part[] {
  const s = settle(v);
  const string = strand(v3(X0, PIVOT_Y, 0), s.snap ? v3(X0, PIVOT_Y - STUB, 0) : s.bob, STRING_T);
  const bob = sphere(s.rb);
  const bead = lathe(BEAD_PROFILE);
  const weightLen = Math.max(ARROW_MIN, arrowLength(s.weight, FORCE_MAX, ARROW_LONG));
  const parts: Part[] = [
    plate(REACH_LEFT + POST_RIGHT_OF_PIVOT, 2 * bobRadius(MASS_MAX)),
    stand(),
    shaped("string", "String", "Lets the bob swing and carries its pull to the arm.", string, look.slate, on("stand", "hinge")),
    part("bob", "Bob", "The mass: pulled down by gravity, slow to change speed.", bob.shape, s.bob, look.focus, on("string", "glue")),
    part("bead", "Grip bead", "Where your hand holds the bob out.", bead.shape, s.bead, look.light, on("string", "glue"), v3(0, 0, s.lean)),
  ];
  if (!forces) return parts;
  return [
    ...parts,
    // A bob resting on the plate has the plate under it: the arrow would run through it, so it is not drawn.
    ...(s.bob.y - s.rb - ARROW_GAP - weightLen < PLATE_TOP
      ? []
      : arrow("weight-arrow", v3(s.bob.x, s.bob.y - s.rb, 0), -90, weightLen, "pull", {
          name: "Weight arrow",
          role: "Gravity's pull on the bob, straight down.",
          on: on("bob", "glue"),
        })),
    // Held out, nothing but a hand keeps the bob there: the arrow is drawn whenever the hand is on, not only in a run.
    ...(s.held ? holdArrow("hold-arrow", s, "bead") : []),
  ];
}

function readouts(v: Values) {
  const s = settle(v);
  const deg = fmt(Math.abs(s.angle));
  return [
    { label: "Weight", value: `W = m × g = ${fmt(s.mass, 1)} kg × 9.8 = ${fmt(s.weight, 1)} N` },
    {
      label: "Travel",
      value:
        s.a < 1e-9 ? "hanging straight down: bob up 0 mm" : `${deg}° out, bob up ${fmt(s.rise, 1)} mm; the hand holds W × sin ${deg}° = ${fmt(s.along, 1)} N`,
    },
    {
      label: "State",
      value:
        s.a < 1e-9
          ? `hanging still: the string's ${fmt(s.weight, 1)} N pull cancels the weight`
          : `let go: down in ¼ × 2π√(${fmt(L, 2)} ÷ 9.8) = ${fmt(QUARTER, 2)} s, at any mass`,
    },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "light" | "snap";

/** The outcome, decided once from the mass and the angle; meters, judge and play all read it. */
export const strike = (v: Values) => strikeOf(valueOf(MASS, v), gameSwing(v));
/** The same for any mass in kg and swing in degrees, not only on the sliders' grids (the tests use it right at the string's limit). */
export function strikeOf(mass: number, swing: number) {
  const a = Math.abs(swing) * DEG_TO_RAD;
  const cosA = Math.cos(a);
  /** Exact, from the height the bob has fallen when it meets the crate, on the far side of the bottom. */
  const speed = Math.sqrt(Math.max(0, 2 * G * L * (Math.cos(CONTACT * DEG_TO_RAD) - cosA)));
  const momentum = mass * speed;
  /** The string's pull at the bottom, where it is greatest: weight plus the bob's turning: m g (3 − 2 cos a). */
  const factor = 3 - 2 * cosA;
  const pull = mass * G * factor;
  const kind: Kind = pull > SNAP + 1e-9 ? "snap" : momentum >= NEED - 1e-9 ? "pass" : "light";
  /** Where the string breaks on the way down: m g (3 cos θ − 2 cos a) reaches SNAP. */
  const cosBreak = (SNAP / (mass * G) + 2 * cosA) / 3;
  const breakAt = kind === "snap" ? Math.acos(Math.min(1, cosBreak)) : 0;
  /** The bob's speed when it lets go of the string, m/s. */
  const speedAtBreak = kind === "snap" ? Math.sqrt(Math.max(0, 2 * G * L * (Math.cos(breakAt) - cosA))) : 0;
  return { kind, mass, a, speed, momentum, factor, pull, breakAt, speedAtBreak };
}

/** Where the pedestal's near face is: the crate's face touches the bob when it is at CONTACT degrees, whatever the mass. */
const nearFace = (mass: number) => X0 + CONTACT_X + bobRadius(mass);

type Box = { name: "crate" | "pedestal" | "plate"; x0: number; x1: number; y0: number; y1: number };
/** The things a freed bob can run into: the crate, the pedestal, the plate. Millimetres, in the figure's own space. */
function obstacles(mass: number): Box[] {
  const n = nearFace(mass);
  return [
    { name: "crate", x0: n, x1: n + CRATE, y0: LEDGE_Y, y1: LEDGE_Y + CRATE },
    { name: "pedestal", x0: n + PED_NEAR, x1: n + PED_FAR, y0: PLATE_TOP, y1: LEDGE_Y },
    { name: "plate", x0: -1e4, x1: 1e4, y0: 0, y1: PLATE_TOP },
  ];
}
/** Distance from a point to a box (0 inside it). */
const gap = (b: Box, x: number, y: number) => Math.hypot(Math.max(b.x0 - x, 0, x - b.x1), Math.max(b.y0 - y, 0, y - b.y1));

/**
 * The freed bob's flight, for a setting whose string snaps: from the break point with the swing's velocity there, under
 * gravity, until it first touches the crate, the pedestal or the plate (found by marching the flight in 0.1 ms steps and
 * bisecting the last one). A bob that meets a vertical face loses its sideways motion there and drops down it; one that
 * meets the plate stays. Times are real seconds, before the run's slow-down. Null when the string holds.
 */
export const freed = (v: Values) => freedAt(valueOf(MASS, v), gameSwing(v));
export function freedAt(mass: number, swing: number) {
  const r = strikeOf(mass, swing);
  if (r.kind !== "snap") return null;
  const rb = bobRadius(r.mass);
  const boxes = obstacles(r.mass);
  const th = r.breakAt;
  const x0 = X0 - STRING_MM * Math.sin(th);
  const y0 = PIVOT_Y - STRING_MM * Math.cos(th);
  const vx = Math.cos(th) * r.speedAtBreak * 1000;
  const vy = -Math.sin(th) * r.speedAtBreak * 1000;
  const at = (t: number) => ({ x: x0 + vx * t, y: y0 + vy * t - (G * 1000 * t * t) / 2 });
  const touching = (t: number) => {
    const p = at(t);
    return boxes.some((b) => gap(b, p.x, p.y) < rb);
  };
  const DT = 1e-4;
  let hi = DT;
  while (!touching(hi) && hi < 2) hi += DT;
  let lo = hi - DT;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (touching(mid)) hi = mid;
    else lo = mid;
  }
  const hit = at(hi);
  const touch = boxes.reduce((best, b) => (gap(b, hit.x, hit.y) < gap(best, hit.x, hit.y) ? b : best)).name;
  const yRest = PLATE_TOP + rb;
  const vyHit = vy - G * 1000 * hi;
  /** Time to drop from the touch to the plate (0 if the touch was the plate). */
  const drop = touch === "plate" ? 0 : (vyHit + Math.sqrt(vyHit * vyHit + 2 * G * 1000 * Math.max(0, hit.y - yRest))) / (G * 1000);
  const position = (t: number) => {
    if (t <= hi) return at(t);
    if (touch === "plate") return hit;
    const u = t - hi;
    return { x: hit.x, y: Math.max(yRest, hit.y + vyHit * u - (G * 1000 * u * u) / 2) };
  };
  return { touch, tHit: hi, hit, drop, tEnd: hi + drop, yRest, position, start: v3(x0, y0, 0), vel: { x: vx, y: vy }, breakAt: th, rb, boxes };
}

function judge(v: Values): Verdict {
  const r = strike(v);
  switch (r.kind) {
    case "light":
      return { pass: false, outcome: "too-light", headline: "Crate only rocked", detail: "Too light: the ball hits too softly to knock the crate off." };
    case "snap":
      return {
        pass: false,
        outcome: "string-snapped",
        headline: "The string snapped",
        detail: "Too heavy: the string cannot take the pull, so the ball drops short.",
      };
    case "pass":
      return { pass: true, outcome: "knocked-off", headline: "Crate knocked off", detail: "Hard enough to knock the crate off, and the string held." };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = strike(v);
  return [
    { label: "Hit", value: r.momentum, target: NEED, max: 3, unit: "kg·m/s", need: "atLeast", digits: 2 },
    { label: "String load", value: r.pull, target: SNAP, max: 80, unit: "N", need: "atMost" },
  ];
}

// Choreography, ms. The swing is slowed this many times so a 0.16 s swing can be watched.
const SLOW = 5;
const LEAD = 300;
const HOLD = 650;
const RESET = 650;
const SLIDE_MS = 330;
const TIP_MS = 240;
const FALL_MS = 420;
const ROCK_MS = 700;
const LAND_BOUNCE_MS = 360;
const TIP_A = 28;
const BOUNCE = 4;
const ROCK_MAX = 10;

/** The crate's pose as the three numbers a run sets: how far its centre has gone away from the bob, down, and tilted (clockwise, away). */
type Crate = { away: number; down: number; tilt: number };
/** Rotating the crate about a point P (away, y) by θ, clockwise: the centre goes round it. */
function about(px: number, py: number, dx: number, dy: number, deg: number): Crate {
  const t = deg * DEG_TO_RAD;
  const cx = px + dx * Math.cos(t) + dy * Math.sin(t);
  const cy = py - dx * Math.sin(t) + dy * Math.cos(t);
  return { away: cx - CRATE / 2, down: LEDGE_Y + CRATE / 2 - cy, tilt: deg };
}
const SLIDE = PED_FAR + TIP_D - CRATE / 2;
/** The crate rocking on its far bottom corner, which stays on the pedestal. */
const rocking = (deg: number): Crate => about(CRATE, LEDGE_Y, -CRATE / 2, CRATE / 2, deg);
/** Tipping about the pedestal's edge: the centre sits TIP_D past it. */
const tipping = (deg: number, spread = 0, drop = 0): Crate => about(PED_FAR + spread, LEDGE_Y - drop, TIP_D, CRATE / 2, deg);
/** Where the crate lands: its bottom on the plate, so the pivot has dropped LEDGE_Y − (PLATE_TOP + CRATE/2 + TIP_D). */
const DROP = LEDGE_Y - (PLATE_TOP + CRATE / 2 + TIP_D);

/** The swing's time from let-go to the strike (or the break), ms before slow-down is applied: a0 cos(ωt) reaches `angle` on the way down. */
const swingTo = (a0: number, angle: number) => Math.acos(clamp(angle / a0, -1, 1)) / OMEGA;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = strike(v);
  const a0 = gameSwing(v);
  const snaps = r.kind === "snap";
  const slowMs = SLOW * 1000;
  const fl = freed(v);
  const angleAt = (ms: number) => a0 * Math.cos((OMEGA * ms) / slowMs);

  // To the strike on the far side: a0 cos(ωt) reaches +CONTACT. To the break: it reaches −breakAt, still on the way down.
  const swingDur = (snaps ? swingTo(a0, -r.breakAt * RAD_TO_DEG) : swingTo(a0, CONTACT)) * slowMs;
  const flightMs = fl ? fl.tEnd * slowMs : 0;
  const afterMs = snaps ? flightMs + LAND_BOUNCE_MS : r.kind === "pass" ? SLIDE_MS + TIP_MS + FALL_MS : ROCK_MS;
  const tl = phases({ lead: LEAD, swing: swingDur, after: afterMs, hold: HOLD, reset: snaps ? 0 : RESET });
  const impact = tl.start("after");

  const cues: Cue[] = [];
  if (fl) {
    cues.push({ ms: impact, kind: "snap" });
    cues.push({ ms: impact + fl.tHit * slowMs, kind: "thud" });
    if (fl.drop > 0) cues.push({ ms: impact + flightMs, kind: "thud" });
  } else {
    cues.push({ ms: impact, kind: "thud" });
    if (r.kind === "pass") cues.push({ ms: impact + SLIDE_MS + TIP_MS + FALL_MS, kind: "thud" });
  }

  const rest = { mass: v.mass ?? 2, swing: a0, ahead: 0, snap: 0, fx: 0, fy: 0, crateAway: 0, crateDown: 0, crateTilt: 0 };
  const values = (over: Partial<typeof rest>): Values => ({ ...v, ...rest, ...over });
  const cratePose = (c: Crate) => ({ crateAway: c.away, crateDown: c.down, crateTilt: c.tilt });
  /** The bob at a signed angle, as the run's `ahead` pose: how far on from where the slider put it. */
  const bobAt = (angle: number) => ({ ahead: angle - a0 });
  /** The hand's arrow while it pulls the bob back, drawn with the same numbers `build` uses for a held bob. */
  const handOn = (angle: number) => holdArrow(`${MARK}hand-arrow`, settle({ ...v, ...bobAt(angle) }), "plate");

  /** The crate's pose `t` ms after the strike, and what it says. */
  const crateAfter = (t: number): { crate: Crate; live: string } => {
    if (r.kind === "light") {
      const tilt = clamp((ROCK_MAX * r.momentum) / NEED, 0, ROCK_MAX) * rockBack(t / ROCK_MS, 2);
      return { crate: rocking(tilt), live: "Crate rocks" };
    }
    if (t < SLIDE_MS) return { crate: { away: SLIDE * easeOut(t / SLIDE_MS), down: 0, tilt: 0 }, live: "Crate sliding" };
    if (t < SLIDE_MS + TIP_MS) return { crate: tipping(TIP_A * fall((t - SLIDE_MS) / TIP_MS)), live: "Crate tips over" };
    const u = clamp01((t - SLIDE_MS - TIP_MS) / FALL_MS);
    return { crate: tipping(TIP_A + (90 - TIP_A) * u, SPREAD * easeOut(u), DROP * fall(u)), live: u >= 1 ? "Crate knocked off" : "Crate falls" };
  };
  /** After the strike the bob has given its momentum away: it hangs at the strike angle for an instant and swings back, a small pendulum from rest there. */
  const bobAfter = (t: number) => CONTACT * Math.cos((OMEGA * t) / slowMs);

  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      switch (phase) {
        case "lead":
          return frame(values({}), "Ball held back");
        case "swing": {
          const t = ms - tl.start("swing");
          return frame(values(bobAt(angleAt(t))), "Swinging");
        }
        case "after": {
          const t = ms - impact;
          if (fl) {
            const p = fl.position(t / slowMs);
            const up = t > flightMs ? BOUNCE * rockBack((t - flightMs) / LAND_BOUNCE_MS, 2) : 0;
            const live = t < fl.tHit * slowMs ? "String snapped" : t < flightMs ? "Ball falls short" : "Snapped!";
            return frame(values({ ...bobAt(-r.breakAt * RAD_TO_DEG), snap: 1, fx: p.x, fy: p.y + up }), live);
          }
          const { crate, live } = crateAfter(t);
          return frame(values({ ...bobAt(bobAfter(t)), ...cratePose(crate) }), live);
        }
        case "hold": {
          if (fl) return frame(values({ ...bobAt(-r.breakAt * RAD_TO_DEG), snap: 1, fx: fl.hit.x, fy: fl.yRest }), "String snapped");
          const end = crateAfter(afterMs).crate;
          return frame(
            values({ ...bobAt(bobAfter(afterMs + ms - tl.start("hold"))), ...cratePose(end) }),
            r.kind === "pass" ? "Crate knocked off" : "Crate stayed put",
          );
        }
        default: {
          const q = smooth(tl.t("reset", ms));
          const end = crateAfter(afterMs).crate;
          const crate = r.kind === "pass" ? end : { away: 0, down: 0, tilt: 0 };
          const from = bobAfter(afterMs + HOLD);
          const angle = from + (a0 - from) * q;
          // The last frame is the rest pose, whose hand arrow `build` draws; before it the hand is a mark.
          return frame(values({ ahead: (1 - q) * (from - a0), ...cratePose(crate) }), "Pulling it back", q < 1 ? handOn(angle) : []);
        }
      }
    },
  };
}

/** The pedestal and the crate standing on it, on the far side of the bottom, and where a run has put the crate. */
function scene(v: Values): Part[] {
  const s = settle(v);
  const at = (away: number) => nearFace(s.mass) + away;
  return [
    part(
      `${SCENE}pedestal`,
      "Pedestal",
      "What the crate stands on.",
      box(PED_FAR - PED_NEAR, LEDGE_Y - PLATE_TOP, 20, 1),
      v3(at((PED_NEAR + PED_FAR) / 2), (PLATE_TOP + LEDGE_Y) / 2, 0),
      look.structure,
      on("plate", "weld"),
    ),
    part(
      `${SCENE}crate`,
      "Crate",
      "The load the bob has to knock off its pedestal.",
      box(CRATE, CRATE, CRATE, 1.5),
      v3(at(CRATE / 2 + (v.crateAway ?? 0)), LEDGE_Y + CRATE / 2 - (v.crateDown ?? 0), 0),
      look.stone,
      on(`${SCENE}pedestal`, "glue"),
      v3(0, 0, -(v.crateTilt ?? 0)),
    ),
  ];
}

// ---- Free play ---------------------------------------------------------------------------------------------------

/** Free play's swing is slowed only this much, far less than the game's, so it still reads as a quick little pendulum. */
const PLAY_SLOW = 1.2;
/** How many whole swings it makes before it is shown settled. */
const PLAY_SWINGS = 3;
const PLAY_MS = Math.round(PLAY_SWINGS * PERIOD * 1000 * PLAY_SLOW);

/**
 * Let go, the bob swings down through the bottom and up the other side, back and forth at the string's own period
 * whatever the mass, and settles hanging straight down. A real one swings far longer; the swing is damped so it settles
 * in three swings.
 */
function release(v: Values): Motion {
  return ringTo(v, "swing", 0, PLAY_MS, PLAY_SWINGS, SWING_MIN, SWING_MAX);
}

const MASS: Slider = { id: "mass", label: "Mass", min: 1, max: MASS_MAX, step: 0.1, initial: 2, unit: " kg", ends: ["Light", "Heavy"] };

/** The biggest pull a hand needs here: the heaviest bob held out furthest. Free play's hold arrow is 52 long at it. */
const HOLD_MAX = MASS_MAX * G * Math.sin(SWING_MAX * DEG_TO_RAD);

/**
 * While a hand holds the bob out: its pull along the swing, W sin a, drawn on free play's own scale, where the biggest
 * hold rather than the biggest weight is 52 long. On the game's scale every hold under 2 kg is a head with no shaft. The
 * weight arrow is left off: on this scale the heaviest bob's would run into the plate, and the bob's size already says
 * its mass.
 */
const hand = (v: Values): Part[] => holdArrow("hold-arrow", settle(v), "bead", HOLD_MAX, 52);

/**
 * What the mass changes, and the swing does not: the pull that holds the bob out (up, signed by the side) at each angle
 * (across), W sin a. A heavier bob raises the whole curve. Its time to swing back would be the same line at every mass,
 * since the pull and the bob's reluctance to move grow together, so that is left to the release to show.
 */
function holding(v: Values): Plot {
  const s = settle(v);
  const N = 40;
  const y = (deg: number) => 0.5 + (0.5 * s.weight * Math.sin(deg * DEG_TO_RAD)) / HOLD_MAX;
  const x = (deg: number) => (deg - SWING_MIN) / (SWING_MAX - SWING_MIN);
  const line = Array.from({ length: N + 1 }, (_, i): [number, number] => {
    const deg = SWING_MIN + ((SWING_MAX - SWING_MIN) * i) / N;
    return [x(deg), y(deg)];
  });
  const at = clamp(s.angle, SWING_MIN, SWING_MAX);
  return { line, zero: 0.5, dot: [x(at), y(at)], caption: "pull to hold it out" };
}
const SWING: Slider = { id: "swing", label: "Swing angle", min: SWING_MIN, max: SWING_MAX, step: 1, initial: -28, unit: "°" };

export const weight: Primitive = {
  id: "weight",
  name: "Weight",
  level: "Element",
  job: "Be pulled by gravity and resist changes in motion",
  howItWorks:
    "Gravity pulls every mass with a weight W = m·g, where g is about 9.8 m/s² near the ground. The same mass also resists changes in motion, which is why a heavy hammer head keeps going once swung. On a pendulum the two cancel exactly: a heavier bob is pulled harder but is harder to speed up, so the swing time depends on the string length and not on the mass. Here the string is 100 mm, so a whole swing takes 2π√(0.1 ÷ 9.8) = 0.63 s. Hold the bob out and your hand must balance the part of the weight along the swing, W·sin a. Air drag, the string's mass and big swings (which run slightly slower) are left out.",
  madeOf: [],
  seenIn: ["Hammer", "Pendulum", "Flywheel"],
  sliders: [
    MASS,
    // Was -40..-25, one side only for the game's crate. Now either side of the bottom, so free play can start the bob
    // hanging straight down and swing it through; the game keeps to -40..-25 with the handle's reach and `gameSwing`.
    SWING,
  ],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "swing",
    label: "Pull back",
    at: (v) => settle(v).bead,
    // The bead rides the string, so the string's angle is the angle from the arm to the finger.
    solve: (point) => Math.atan2(point.x - X0, PIVOT_Y - point.y) * RAD_TO_DEG,
    // In the game the bob is only pulled back away from the crate, and far enough out to reach it.
    reach: () => [SWING_MIN, GAME_MAX],
  },
  play: {
    // The stand, the string and the bob: no crate, no arrows.
    build: bare,
    hand,
    plot: holding,
    // Hanging straight down: the string's pull cancels the weight, and nothing needs holding.
    rest: { swing: 0 },
    // A hand can hold the bob out either side, as far as the slider goes.
    reach: () => [SWING_MIN, SWING_MAX],
    release,
  },
  game: {
    name: "Wrecking ball",
    goal: "Knock the crate off its pedestal without snapping the string.",
    rules: "A heavier ball hits harder, but a heavy ball also pulls harder on the string. Pull the ball back to choose how far it swings.",
    number: "mass",
    action: "Let go",
    meters,
    judge,
    play,
    start: { mass: 1.5, swing: START_SWING },
    poses: [
      { id: "ahead", label: "Swung on", min: 0, max: 80, step: 0.1, initial: 0, unit: "°" },
      { id: "snap", label: "String snapped", min: 0, max: 1, step: 1, initial: 0 },
      { id: "fx", label: "Bob x", min: -160, max: 160, step: 0.1, initial: 0, unit: " mm" },
      { id: "fy", label: "Bob y", min: 0, max: 200, step: 0.1, initial: 0, unit: " mm" },
      { id: "crateAway", label: "Crate pushed", min: 0, max: 80, step: 0.1, initial: 0, unit: " mm" },
      { id: "crateDown", label: "Crate dropped", min: -10, max: 80, step: 0.1, initial: 0, unit: " mm" },
      { id: "crateTilt", label: "Crate tilt", min: 0, max: 90, step: 0.1, initial: 0, unit: "°" },
    ],
    scene,
  },
};

/** Exposed for tests: the layout the parts are placed by. */
export const geometry = {
  BOB_Y,
  PIVOT_Y,
  LEDGE_Y,
  CONTACT_X,
  CONTACT_Y,
  PED_NEAR,
  PED_FAR,
  CRATE,
  POST_X,
  POST_W,
  SLIDE,
  DROP,
  STUB,
  SLOW,
  LAND_X,
  nearFace,
  obstacles,
  gap,
  SWING_MIN,
  SWING_MAX,
  GAME_MAX,
};
