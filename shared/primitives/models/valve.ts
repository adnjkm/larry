// Valve: let fluid through one way only. A mechanism made of a seal and a spring (src/primitives/docs/design-language.md,
// motion-language.md).
//
// The rig is the textbook check valve, cut open so you see inside: a tube standing on the plate with a seat (a hole in a
// ledge) partway up, a pink ball sitting on the hole, and a spring above pressing the ball down. A pump barrel comes in
// under the seat from the left, its plunger the thumb's disc. The tube narrows to a neck at the top, and on the neck sits
// a small bag: the thing being filled, drawn bigger as its pressure rises. Air from the pump pushes up on the ball over
// the hole's area; once that beats the spring's preload the ball lifts and air goes round it, up the neck and into the
// bag. Air from the bag only presses the ball harder onto its seat: one way.
//
// The number is the opening pressure: the spring's preload over the hole's area. Every spring here is fitted squeezed by
// the same 5 mm and goes solid at the same length, so a higher opening pressure is a stiffer spring: thicker wire and
// fewer turns. The ball lifts until the spring's coils touch, which is its stop.
//
// The game, "Pump it up": six strokes to bring the bag up to the mark. A stiff spring keeps its opening pressure back
// from every stroke, so the bag stalls where the thumb's 250 kPa minus it runs out: the ball stops lifting. A soft spring
// is slow to push the ball back down after each stroke, and until it is down air runs back out of the bag.
import type { Part } from "../../kit.ts";
import { clamp, clamp01, easeOut, smooth } from "../motion/ease.ts";
import { frame, MARK, phases, SCENE, whenReaches } from "../motion/run.ts";
import { arrow, box, coilSpring, fmt, lathe, look, on, part, pivoted, plate, PLATE_TOP, pushDisc, tick, v3, type Pt } from "../parts.ts";
import { type Cue, type Meter, type Motion, type Primitive, type Run, type Task, type Values, type Verdict, VIEW, type Slider, valueOf } from "../types.ts";
import { DEG_TO_RAD } from "../../angles.ts";

// Geometry, mm. x = 0 is the valve's axis before VX shifts the rig to centre it on the plate.
const WALL = 3;
/**
 * The pump barrel: a pipe that runs in from the left to under the seat, its plunger disc (radius 15) sliding in it. It
 * stands GAP clear of the plate, held by the tube's foot, so its floor reads as a pipe wall and not as part of the plate.
 */
const BAR_L = 44;
const GAP = 8;
const FLOOR_TOP = PLATE_TOP + GAP + WALL;
const ROOF = FLOOR_TOP + 32;
const BARREL_Y = (FLOOR_TOP + ROOF) / 2;
/** The tube's bore (half width) and its outside. */
const BORE = 13;
const OUTER = BORE + WALL;
/** The seat: a ledge SEAT_T thick across the tube's foot, with a hole of half width SEAT_R. Its area is what the pressure pushes on. */
const SEAT_T = 4;
const SEAT_Y = ROOF + SEAT_T;
const SEAT_R = 6;
export const SEAT_AREA = Math.PI * SEAT_R * SEAT_R;
export const BALL_R = 9;
/** The ball's centre, seated: it rests on the hole's edge. */
const BALL_REST = SEAT_Y + Math.sqrt(BALL_R ** 2 - SEAT_R ** 2);
/** The spring: coil radius, the squeeze it is fitted with, and the length its coils touch at (the ball's stop). */
const COIL_R = 5.5;
const PRELOAD_MM = 5;
const SOLID = 12;
/** The shoulder the spring's top bears on, and the neck above it that carries the air to the bag. */
const SHOULDER = SEAT_Y + 35;
const NECK = 4;
const NECK_TOP = SHOULDER + WALL + 12;
/** The body is drawn deep enough to hold the ball, open at front and back so the inside shows. */
const DEPTH = 20;
/** The plunger disc's centre with no pressure, at the barrel's mouth, and how far it goes in per kPa. */
const PLUNGER_X0 = -BAR_L + 2;
const PLUNGER_MM_PER_KPA = 0.1;
/** mm per N for the pump's push on the ball: 250 kPa on the hole (28 N) is 27 long, inside the barrel. */
const MM_PER_N = 0.95;
/** The bag: its radius empty and how much it grows per kPa. Only a drawing of fullness: a stretchy bag swells with its pressure. */
const BAG_R0 = 5;
const BAG_MM_PER_KPA = 0.05;
/** Shifts the rig so the union of its poses (barrel mouth to the tube's right wall) is centred on the plate. */
const VX = -(-BAR_L + OUTER) / 2;

// The game. The pressure balance is real; the stroke, the delays and the mark are game numbers (see howItWorks).
/** The thumb's stroke makes this much under the ball. */
export const THUMB = 250;
/** Each stroke pushes this much into the bag, if the thumb can beat the bag plus the spring. */
export const STEP = 30;
export const STROKES = 6;
export const TARGET = 140;
/** The 20 kPa spring's reseat time, ms: a quarter swing of a ball on a spring goes as 1 ÷ √k. Slowed for the eye. */
const RESEAT_20 = 110;
/** While the ball is still up after the pump drops below the bag, the bag loses 1/TAU of its pressure each ms. */
export const TAU = 250;

/** Wire diameter for the 20 kPa spring; k goes as d⁴ ÷ turns, and turns = SOLID ÷ d − 1 keeps the solid length fixed. */
const WIRE_SOFT = 2.4;
const WIRE_C = WIRE_SOFT ** 4 / (SOLID / WIRE_SOFT - 1);

/** Where the coil's bottom wire sits on a ball centred at `ballY`: where a wire of radius `tube`, at the coil's radius, meets the sphere. */
const footOn = (ballY: number, tube: number) => ballY + Math.sqrt((BALL_R + tube) ** 2 - COIL_R ** 2) - tube;

/** The spring for opening pressure `open`: preload over the hole's area, the rate that preload takes 5 mm to reach, its wire and stop. */
export function springFor(open: number) {
  const preload = (open * SEAT_AREA) / 1000;
  const rate = preload / PRELOAD_MM;
  let lo = 1;
  let hi = 8;
  for (let i = 0; i < 40; i++) {
    const d = (lo + hi) / 2;
    if (d ** 4 / (SOLID / d - 1) < (WIRE_C * open) / 20) lo = d;
    else hi = d;
  }
  const wire = (lo + hi) / 2;
  /** The ball lifts until the coils touch. */
  const liftMax = SHOULDER - footOn(BALL_REST, wire / 2) - SOLID;
  return { preload, rate, wire, turns: SOLID / wire - 1, liftMax, reseat: RESEAT_20 * Math.sqrt(20 / open) };
}

/** How far the ball lifts for a pressure difference `across` (under minus over): the extra over the opening pressure squeezes the spring past its preload. */
function liftFor(open: number, across: number) {
  return clamp((PRELOAD_MM * (across - open)) / open, 0, springFor(open).liftMax);
}

/** Everything a pose needs. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const open = valueOf(OPEN, v);
  const pressure = v.pressure ?? 130;
  /** Run-only: the bag's pressure, and the pump pressure a ball that is late to reseat still answers to. */
  const bag = v.bag ?? 0;
  const held = v.held ?? 0;
  const spring = springFor(open);
  const lift = liftFor(open, Math.max(pressure, held) - bag);
  const ballY = BALL_REST + lift;
  const foot = footOn(ballY, spring.wire / 2);
  return {
    open,
    pressure,
    bag,
    ...spring,
    lift,
    ballY,
    foot,
    springLength: SHOULDER - foot,
    solid: lift >= spring.liftMax - 1e-9,
    push: (pressure * SEAT_AREA) / 1000,
    plunger: PLUNGER_X0 + PLUNGER_MM_PER_KPA * pressure,
    bagR: BAG_R0 + BAG_MM_PER_KPA * clamp(bag, 0, THUMB),
  };
}

/** The bag's centre for radius r: it rests on the neck's rim, like the ball on its seat. */
const bagCentre = (r: number) => NECK_TOP + Math.sqrt(r * r - NECK * NECK);
const bagTop = (kPa: number) => {
  const r = BAG_R0 + BAG_MM_PER_KPA * kPa;
  return bagCentre(r) + r;
};

/**
 * The body, cut open, in two pieces either side of the cut. The left one: the barrel's roof, the left half of the seat,
 * the tube's left wall, the shoulder and the neck. The right one: the barrel's floor, the right wall and the other halves.
 */
const LEFT: Pt[] = [
  [-BAR_L, ROOF],
  [-SEAT_R, ROOF],
  [-SEAT_R, SEAT_Y],
  [-BORE, SEAT_Y],
  [-BORE, SHOULDER],
  [-NECK, SHOULDER],
  [-NECK, NECK_TOP],
  [-NECK - WALL, NECK_TOP],
  [-NECK - WALL, SHOULDER + WALL],
  [-OUTER, SHOULDER + WALL],
  [-OUTER, ROOF + WALL],
  [-BAR_L, ROOF + WALL],
];
const RIGHT: Pt[] = [
  [-BAR_L, PLATE_TOP + GAP],
  [-OUTER, PLATE_TOP + GAP],
  [-OUTER, PLATE_TOP],
  [OUTER, PLATE_TOP],
  [OUTER, SHOULDER + WALL],
  [NECK + WALL, SHOULDER + WALL],
  [NECK + WALL, NECK_TOP],
  [NECK, NECK_TOP],
  [NECK, SHOULDER],
  [BORE, SHOULDER],
  [BORE, SEAT_Y],
  [SEAT_R, SEAT_Y],
  [SEAT_R, ROOF],
  [BORE, ROOF],
  [BORE, FLOOR_TOP],
  [-BAR_L, FLOOR_TOP],
];

const shift = (outline: Pt[]) =>
  pivoted(
    outline.map(([x, y]): Pt => [VX + x, y]),
    DEPTH,
    [0, 0],
    v3(0, 0, 0),
    0,
  );

const sphere = (r: number) =>
  lathe(
    Array.from({ length: 25 }, (_, i): Pt => {
      const t = (i / 24) * Math.PI;
      return [r * Math.sin(t), -r * Math.cos(t)];
    }),
  ).shape;

function build(v: Values): Part[] {
  const s = settle(v);
  const left = shift(LEFT);
  const right = shift(RIGHT);
  const parts: Part[] = [
    plate(BAR_L + OUTER, 30),
    part(
      "body-left",
      "Valve body",
      "Cut open to show inside: the pump barrel's roof, half the seat, the tube's wall, the shoulder and the neck.",
      left.shape,
      left.position,
      look.structure,
      on("plate", "weld"),
    ),
    part(
      "body-right",
      "Valve body",
      "Cut open to show inside: the barrel's floor, half the seat, the tube's wall, the shoulder and the neck.",
      right.shape,
      right.position,
      look.structure,
      on("plate", "weld"),
    ),
    part(
      "ball",
      "Ball",
      "Sits on the hole and shuts it; lifts when the push under it beats the spring.",
      sphere(BALL_R),
      v3(VX, s.ballY, 0),
      look.focus,
      on("body-right", "slide"),
    ),
    coilSpring(
      "spring",
      "Spring",
      "Presses the ball onto its seat: its preload sets the opening pressure. The ball lifts until its coils touch.",
      [VX, s.foot],
      [VX, SHOULDER],
      0,
      COIL_R,
      s.wire / 2,
      s.turns,
      look.slate,
      on("body-left", "spring"),
    ),
    pushDisc("plunger", v3(VX + s.plunger, BARREL_Y, 0), "x", {
      name: "Pump plunger",
      role: "Your thumb pushes it in to raise the pressure under the ball.",
      on: on("body-left", "slide"),
    }),
    part(
      "bag",
      "Bag",
      "The thing being filled: it swells as its pressure rises.",
      sphere(s.bagR),
      v3(VX, bagCentre(s.bagR), 0),
      look.stone,
      on("body-left", "glue"),
    ),
  ];
  // The pump's push on the ball from below, to scale.
  if (s.push > 0)
    parts.push(
      ...arrow("push-arrow", v3(VX, s.ballY - BALL_R, 0), 90, s.push * MM_PER_N, "push", {
        name: "Pump's push",
        role: "The pressure under the ball times the hole's area.",
        on: on("ball", "glue"),
      }),
    );
  return parts;
}

function readouts(v: Values) {
  const s = settle(v);
  const state = s.solid
    ? "wide open: the coils touch, the ball's stop"
    : s.lift > 1e-6
      ? `open: the ball is up ${fmt(s.lift, 1)} mm and air goes round it`
      : s.bag > 0
        ? `shut: the bag's ${fmt(s.bag)} kPa only presses it down`
        : `shut: ${fmt(s.push, 1)} N is under the spring's ${fmt(s.preload, 1)} N`;
  return [
    { label: "Push", value: `${fmt(s.pressure)} kPa × ${fmt(SEAT_AREA)} mm² = ${fmt(s.push, 1)} N vs ${fmt(s.preload, 1)} N of spring` },
    { label: "Travel", value: `plunger in ${fmt(s.plunger - PLUNGER_X0, 1)} mm, ball up ${fmt(s.lift, 1)} of ${fmt(s.liftMax, 1)} mm` },
    { label: "State", value: state },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

// Choreography, ms. One stroke: the thumb pushes in, lets the pressure fall back over FALL (1 ms per kPa), and rests.
const LEAD = 200;
const PUSH_MS = 200;
const FALL = 250;
const REST = 150;
const STROKE = PUSH_MS + FALL + REST;
const HOLD = 600;
/** ms the pump takes to fall 1 kPa on the way back. */
const MS_PER_KPA = FALL / THUMB;

type Kind = "pass" | "stalls" | "leaks";

/**
 * How late the ball is back on its seat, ms after the pump has dropped below the bag. It starts down once the pump falls
 * below bag + opening pressure, and air only runs back once the pump falls below the bag, so a stiffer spring has a
 * head start of open × MS_PER_KPA, and reseats faster too.
 */
const lateFor = (open: number) => Math.max(0, springFor(open).reseat - open * MS_PER_KPA);

/** The bag's pressure through six strokes: each adds STEP up to the most the thumb can push past the spring, then loses its share to a late ball. */
function strokes(open: number) {
  const late = lateFor(open);
  const share = late / TAU;
  const ceiling = THUMB - open;
  const list: { from: number; gain: number; after: number; lost: number; full: boolean }[] = [];
  let q = 0;
  for (let n = 0; n < STROKES; n++) {
    const gain = clamp(ceiling - q, 0, STEP);
    const after = q + gain;
    /** A stroke that reaches the ceiling ends with the ball just shut, so nothing can run back past it. */
    const full = after >= ceiling - 1e-9;
    const lost = full ? 0 : share * after;
    list.push({ from: q, gain, after, lost, full });
    q = after - lost;
  }
  return { late, share, ceiling, list, final: q };
}

/** The most air a passing spring can let back a stroke: the share at which six full strokes just reach the mark. */
export const LEAK_LIMIT = (() => {
  const reach = (share: number) => Array.from({ length: STROKES }).reduce<number>((q) => (q + STEP) * (1 - share), 0);
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const m = (lo + hi) / 2;
    if (reach(m) >= TARGET) lo = m;
    else hi = m;
  }
  return lo;
})();

/** The outcome, decided once from the opening pressure; meters, judge and play all read it. */
export function pumpUp(v: Values) {
  const open = valueOf(OPEN, v);
  const s = strokes(open);
  const kind: Kind = s.final >= TARGET - 1e-9 ? "pass" : s.share > LEAK_LIMIT ? "leaks" : "stalls";
  return { kind, open, ...s };
}

function judge(v: Values): Verdict {
  const r = pumpUp(v);
  switch (r.kind) {
    case "stalls":
      return {
        pass: false,
        outcome: "stalls-short",
        headline: "Stalled below the mark",
        detail: "Too stiff a spring: your thumb cannot push the ball open far enough to fill the bag.",
      };
    case "leaks":
      return {
        pass: false,
        outcome: "leaks-back",
        headline: "Leaked back each stroke",
        detail: "Too soft a spring: the ball shuts late, so air runs back out of the bag.",
      };
    case "pass":
      return {
        pass: true,
        outcome: "pumped-up",
        headline: "Pumped to the mark",
        detail: "The ball opens for your thumb and shuts fast enough to trap the air.",
      };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = pumpUp(v);
  return [
    { label: "Leaks back", value: 100 * r.share, target: 100 * LEAK_LIMIT, max: 40, unit: "%", need: "atMost" },
    { label: "Reach", value: r.ceiling, target: TARGET, max: THUMB, unit: "kPa", need: "atLeast" },
  ];
}

/** The pump's pressure `t` ms into a stroke: up as the thumb pushes, down at 1 kPa a ms, then resting. */
const pumpAt = (t: number) => (t < PUSH_MS ? THUMB * smooth(t / PUSH_MS) : THUMB * (1 - clamp01((t - PUSH_MS) / FALL)));

/** One stroke, `t` ms in: the pump, the bag, the pressure the ball answers to, and whether air is going in or running back. */
export function strokeAt(r: ReturnType<typeof pumpUp>, n: number, t: number) {
  const s = r.list[n]!;
  const pump = pumpAt(t);
  const room = THUMB - s.from - r.open;
  if (t < PUSH_MS) {
    // Air goes in once the pump beats the bag plus the spring, slowly at first and faster as the gap opens (the square of
    // the push past opening), so the pump stays ahead of the bag and the ball stays up while air goes in.
    const opened = s.gain > 0 ? clamp01((pump - s.from - r.open) / room) : 0;
    return { pump, bag: s.from + s.gain * opened ** 2, held: pump, flow: opened > 0 && opened < 1 ? 1 : 0 };
  }
  // The ball sees the pump's fall `reseat` ms late. Air runs back from when the pump drops below the bag until the ball is down.
  const lagged = THUMB * (1 - clamp01((t - PUSH_MS - springFor(r.open).reseat) / FALL));
  const below = PUSH_MS + (THUMB - s.after) * MS_PER_KPA;
  const back = s.lost > 0 ? clamp(t - below, 0, r.late) : 0;
  const bag = s.after * (1 - back / TAU);
  return { pump, bag, held: clamp(lagged - s.after + bag, 0, THUMB), flow: back > 0 && back < r.late ? -1 : 0 };
}

/**
 * When the ball lands back on its seat in stroke n, ms into the stroke: the lagged pump reaches bag + opening pressure.
 * A stroke that fills the bag to the ceiling shuts the ball as the push ends.
 */
const seatAt = (r: ReturnType<typeof pumpUp>, n: number) =>
  r.list[n]!.full ? PUSH_MS : PUSH_MS + springFor(r.open).reseat + (THUMB - r.list[n]!.after - r.open) * MS_PER_KPA;

/** Air in the neck: two slate dots that ride the air, so they climb into the bag as it fills and sink as it runs back. */
const DOT_R = 2;
const DOT_LO = SHOULDER + DOT_R + 0.5;
const DOT_HI = NECK_TOP - DOT_R - 0.5;
const DOT_KPA = 12;
const dot = lathe(
  Array.from({ length: 9 }, (_, i): Pt => {
    const a = ((i / 8) * 180 - 90) * DEG_TO_RAD;
    return [DOT_R * Math.cos(a), DOT_R * Math.sin(a)];
  }),
);
function airDots(bag: number): Part[] {
  return [0, 0.5].map((offset, i) => {
    const u = (((bag / DOT_KPA + offset) % 1) + 1) % 1;
    return part(
      `${MARK}air-${i + 1}`,
      "Air",
      "Air going through the neck: up into the bag, or back out of it.",
      dot.shape,
      v3(VX, DOT_LO + u * (DOT_HI - DOT_LO), 0),
      look.slate,
      on("body-left", "glue"),
    );
  });
}

function play(v: Values): Run {
  const verdict = judge(v);
  const r = pumpUp(v);
  const p0 = clamp(v.pressure ?? 0, 0, THUMB);
  const tl = phases({ lead: LEAD, strokes: STROKES * STROKE, hold: HOLD });
  const strokeStart = (n: number) => tl.start("strokes") + n * STROKE;
  const cues: Cue[] = r.list.flatMap((s, n) => (s.gain > 0 ? [{ ms: strokeStart(n) + seatAt(r, n), kind: "click" as const }] : []));
  const values = (pressure: number, bag: number, held: number): Values => ({
    ...v,
    open: r.open,
    pressure: clamp(pressure, 0, THUMB),
    bag: clamp(bag, 0, THUMB),
    held: clamp(held, 0, THUMB),
  });

  return {
    verdict,
    durationMs: tl.total,
    cues,
    at: (ms) => {
      const { phase } = tl.at(ms);
      if (phase === "lead") return frame(values(p0 * (1 - smooth(tl.t("lead", ms))), 0, 0), "Ready to pump");
      if (phase === "hold") {
        const live = r.kind === "pass" ? "Bag full" : r.kind === "stalls" ? "Stuck" : "Leaked back";
        return frame(values(0, r.final, 0), live);
      }
      const into = ms - tl.start("strokes");
      const n = Math.min(STROKES - 1, Math.floor(into / STROKE));
      const k = strokeAt(r, n, into - n * STROKE);
      const live = r.list[n]!.gain <= 0 ? "Ball stays shut" : k.flow < 0 ? "Air running back" : "Bag filling";
      return frame(values(k.pump, k.bag, k.held), live, k.flow !== 0 ? airDots(k.bag) : []);
    },
  };
}

/** The mark: a tick at the height the bag's top reaches at the target, on a slim post standing on the pump barrel. */
const MARK_POST_X = -BAR_L + 6;
const MARK_Y = bagTop(TARGET);
const BAG_MAX_R = BAG_R0 + BAG_MM_PER_KPA * THUMB;
function scene(): Part[] {
  const postTop = MARK_Y + 1.5;
  const tickFrom = MARK_POST_X + 2;
  const tickTo = -BAG_MAX_R - 2;
  return [
    part(
      `${SCENE}mark-post`,
      "Mark post",
      "Holds the mark beside the bag.",
      box(4, postTop - (ROOF + WALL), 4, 1),
      v3(VX + MARK_POST_X, (postTop + ROOF + WALL) / 2, 0),
      look.structure,
      on("body-left", "weld"),
    ),
    tick(`${SCENE}mark`, v3(VX + (tickFrom + tickTo) / 2, MARK_Y, 0), tickTo - tickFrom, "x", {
      name: "Mark",
      role: `The bag's top has to come up to this level: ${TARGET} kPa.`,
      on: on(`${SCENE}mark-post`, "glue"),
    }),
  ];
}

// ---- Free play ---------------------------------------------------------------------------------------------------

/** The plunger pushed back out from all the way in, ms. */
const RELEASE_MS = 450;

/**
 * Let go of the plunger: the air squeezed in the barrel pushes it back out to the mouth, fast at first, and the pressure
 * under the ball falls with it. The ball answers `reseat` ms late, as in the game (a softer spring is slower), so it
 * clicks down onto its seat just after the pressure has dropped under the opening pressure.
 */
function release(v: Values): Motion {
  const { open, reseat } = settle(v);
  const p0 = clamp(v.pressure ?? 0, 0, THUMB);
  const out = Math.max(1, Math.round(RELEASE_MS * Math.sqrt(p0 / THUMB)));
  const pressureAt = (t: number) => p0 * (1 - easeOut(clamp01(t / out)));
  const lifted = p0 > open + 1e-9;
  const lag = lifted ? reseat : 0;
  const cues: Cue[] = lifted ? [{ ms: whenReaches((t) => -pressureAt(t), -open, 0, out) + lag, kind: "click" }] : [];
  return {
    durationMs: out + lag,
    cues,
    at: (t) => frame({ ...v, pressure: pressureAt(t), held: lifted ? pressureAt(t - lag) : 0 }, ""),
  };
}

const OPEN: Slider = { id: "open", label: "Opening pressure", min: 20, max: 160, step: 5, initial: 80, unit: " kPa", ends: ["Soft", "Stiff"] };

/**
 * The spring's push down on the ball, to the pump arrow's scale: its preload, plus its rate times the lift. While the
 * ball is shut it is more than the pump's push and the seat takes the difference; once the ball is up the two are equal,
 * which is where the ball floats. It stands just in front of the coil, which would hide it, and points at the ball's
 * upper half: there is room for it under a solid coil.
 */
const SPRING_ARROW_Z = COIL_R + 4.5;
function springArrow(v: Values): Part[] {
  const s = settle(v);
  return arrow("spring-arrow", v3(VX, s.ballY, SPRING_ARROW_Z), -90, s.rate * (PRELOAD_MM + s.lift) * MM_PER_N, "push", {
    name: "Spring's push",
    role: "The spring pressing the ball down onto its seat.",
    on: on("ball", "glue"),
  });
}

// ---- Free play's goal: pump a bag up to a mark, one press of the Pump button a stroke -------------------------------------

/** The Pump button's stroke is the game's, slowed this many times so the ball, the air and the leak can be followed. */
export const SLOW = 3;
const IDLE = -1;

/** The stroke the thumb makes `t` ms (game time) in, from a bag at `from` kPa: what the game's six strokes do, one at a time. */
function strokeFrom(v: Values, from: number) {
  const r = pumpUp(v);
  const gain = clamp(r.ceiling - from, 0, STEP);
  const after = from + gain;
  const full = after >= r.ceiling - 1e-9;
  const lost = full ? 0 : r.share * after;
  return { r: { ...r, list: [{ from, gain, after, lost, full }] }, gain, after, lost };
}

/**
 * The pump, `dtMs` on from `v`. Pressing Pump sets `push`; the thumb then makes one stroke from there, the game's own
 * (same push, same spring, same reseat time, same leak), and the bag keeps what it ends with. The opening pressure is read
 * afresh each frame. `reached` records a stroke that left a passing spring's bag at the mark: the goal. `stuck` is a
 * stroke that added nothing, `leaked` one that lost air: what the hints go on.
 */
function pumping(v: Values, ms: number, dtMs: number): Values {
  void dtMs;
  const out: Values = { ...v, push: 0 };
  let at = v.at ?? IDLE;
  let from = v.from ?? 0;
  if ((v.push ?? 0) > 0 && at < 0) {
    at = ms;
    from = v.bag ?? 0;
  }
  if (at < 0) return { ...out, at: IDLE, pressure: 0, held: 0, flow: 0 };
  const t = (ms - at) / SLOW;
  const k = strokeFrom(v, from);
  if (t < STROKE) {
    const s = strokeAt(k.r, 0, t);
    return { ...out, at, from, pressure: s.pump, held: s.held, flow: s.flow, bag: s.bag };
  }
  const bag = k.after - k.lost;
  const reached = pumpUp(v).kind === "pass" && bag >= TARGET - 1e-6 ? 1 : 0;
  return { ...out, at: IDLE, from, pressure: 0, held: 0, flow: 0, bag, reached, stuck: k.gain <= 0 ? 1 : 0, leaked: k.lost > 1e-9 ? 1 : 0 };
}

/** The bag being filled (the game's, under a scene id), the mark beside it, and the air in the neck while it moves. */
function bagScene(v: Values): Part[] {
  const bag = build(v).find((p) => p.id === "bag")!;
  return [...scene(), { ...bag, id: `${SCENE}bag` }, ...((v.flow ?? 0) !== 0 ? airDots(v.bag ?? 0) : [])];
}

// One goal, with a failure on each side: too stiff and the thumb's push runs out short of the mark, too soft and the air
// leaks back past a ball that is slow to shut. Pressing Pump is the user's; the hints wait until they have seen it.
const TASKS: Task[] = [
  {
    goal: "Pump the bag up to the mark.",
    start: { open: 150, pressure: 0, bag: 0, held: 0, flow: 0, push: 0, at: IDLE, from: 0, reached: 0, stuck: 0, leaked: 0 },
    scene: bagScene,
    met: (v) => pumpUp(v).kind === "pass" && (v.reached ?? 0) > 0,
    hint: (v) => {
      const kind = pumpUp(v).kind;
      if (kind === "stalls" && (v.stuck ?? 0) > 0) return "Too stiff: the push runs out. Make it softer.";
      if (kind === "leaks" && (v.leaked ?? 0) > 0) return "Too soft, so the air leaks back. Stiffer.";
      return undefined;
    },
    action: { label: "Pump", set: { push: 1 } },
    drive: pumping,
  },
];

export const valve: Primitive = {
  id: "valve",
  name: "Valve",
  level: "Mechanism",
  job: "Let fluid through one way, or only when opened",
  howItWorks:
    "A check valve is a ball held on a hole by a spring. Air pushing from below presses on the ball over the hole's area: pressure times area. While that is less than the spring's preload the ball stays shut; past it, the ball lifts and air goes round it. Air from above only presses the ball harder onto its seat, so nothing comes back: one way. The opening pressure is the preload over the hole's area, and every push loses that much, so a stiff spring stalls short. A soft spring is slow to push the ball back down (a ball on a spring swings back in a time that goes as 1 ÷ √k), and until it is down air runs back. Real balls reseat in milliseconds: here the delay is slowed so you can see it, and the bag losing 1/250 of its air per late millisecond is this game's rule. The bag is drawn bigger as its pressure rises; the ball's weight and the air's own drag are left out.",
  madeOf: ["seal", "spring"],
  seenIn: ["Bike tyre", "Spray bottle", "Tap"],
  sliders: [OPEN, { id: "pressure", label: "Pressure", min: 0, max: 250, step: 5, initial: 130, unit: " kPa" }],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "pressure",
    label: "Pump",
    at: (v) => v3(VX + settle(v).plunger, BARREL_Y, 0),
    solve: (point) => (point.x - VX - PLUNGER_X0) / PLUNGER_MM_PER_KPA,
  },
  play: {
    facts: {
      say: "/valv/",
      is: "A spring-held gate that opens under a push.",
      note: "Stiffness affects how much push opens it.",
    },
    // The plunger out at the barrel's mouth, no pressure under the ball, and the ball on its seat.
    rest: { pressure: 0 },
    // The valve alone: body, ball, spring and plunger. The bag is the game's thing to fill, and the push arrow is a force
    // the thumb already feels.
    build: (v) => build(v).filter((p) => p.id !== "bag" && p.id !== "push-arrow"),
    // While the thumb is on the plunger: the pump's push up on the ball against the spring's push down, both to scale.
    hand: (v) => [...build(v).filter((p) => p.id === "push-arrow"), ...springArrow(v)],
    tasks: TASKS,
    release,
  },
  game: {
    name: "Pump it up",
    goal: "Pump the bag up to the mark.",
    rules: "A stiffer spring shuts the ball faster, so less air leaks back, but your thumb has to push harder to open it.",
    number: "open",
    action: "Pump",
    meters,
    judge,
    play,
    start: { open: 120, pressure: 0 },
    poses: [
      { id: "bag", label: "Bag pressure", min: 0, max: THUMB, step: 1, initial: 0, unit: " kPa" },
      { id: "held", label: "Ball answers to", min: 0, max: THUMB, step: 1, initial: 0, unit: " kPa" },
    ],
    scene,
  },
};

/** Exposed for tests: the layout the parts are placed by. */
export const rig = { VX, SEAT_R, SEAT_Y, BALL_REST, SHOULDER, NECK, NECK_TOP, MARK_Y, bagTop, bagCentre, LEFT, RIGHT, STROKE, PUSH_MS, seatAt, DOT_LO, DOT_HI };
