// Piston: turn a push into pressure and back (src/primitives/docs/design-language.md, motion-language.md).
//
// The rig is a cutaway tube, open at the front so the inside shows, with a pink seal-head sliding in it on a rod and a
// thumb disc on top. The tube is closed at the bottom, so the air under the head is trapped, and the trapped air is what
// pushes back: it is drawn as a block of six dots that crowd together as it shrinks. The plunger sits where the air's
// push back equals the push: F = p × A, with p from Boyle's law, P0 × L = (P0 + p) × (L - x). Area is the tube's
// width (its depth is fixed), so a wider tube is plainly a wider tube. Pushing 80 N on a wide tube gives less pressure,
// so the plunger stops higher; let go and the air springs it back up.
//
// The air acts as the spring, so this mechanism is a seal and a spring: the pink head is the seal.
//
// The game, "Stop on the line": push with 80 N and let the air stop the plunger. A line on the tube marks where the head
// should end up. A wide tube spreads the push thin, so the plunger stops short of the line; a narrow tube makes more
// pressure, so it goes past. One number, the area, sets one thing: where the push and the air balance.
import type { Part } from "../../../shared/kit.ts";
import { easeOut, smooth } from "../motion/ease.ts";
import { frame, phases, say, SCENE } from "../motion/run.ts";
import { arrow, arrowLength, box, cylinder, fmt, lathe, look, on, part, plate, PLATE_TOP, pushDisc, tick, v3, type Pt } from "../parts.ts";
import { type Meter, type Primitive, type Run, type Values, type Verdict, VIEW } from "../types.ts";

/** Outside air pressure, kPa. */
const P0 = 101.3;
// Geometry, millimetres.
/** The tube's depth, front to back: fixed, so the area is set by its width. */
const Z = 20;
const WALL = 4;
const FLOOR = 4;
/** Length of the trapped air at rest: the head's underside to the floor. */
export const AIR = 44;
const HEAD_T = 8;
const ROD_LEN = 24;
const ROD_R = 4;
const TOP_GAP = 6;
const TUBE_H = FLOOR + AIR + HEAD_T + TOP_GAP;
const FLOOR_TOP = PLATE_TOP + FLOOR;
const DOT_R = 2;
const FORCE_MAX = 100;
const ARROW_LONG = 40;

// The game, in game numbers. Boyle's law and p = F ÷ A are real; the line's place is set so the window sits mid-range.
/** What the hand pushes with, N. */
export const HAND = 80;
/** The line is this far below the head's resting height, mm. */
export const MARK = 22;
/** The plunger must stop within this much of the line. */
export const TOLERANCE = 3;
const START_AREA = 11.5;

const areaOf = (v: Values) => v.area ?? 8;

/** Everything a pose needs. `build`, `readouts`, the handle and the game all read this. */
export function settle(v: Values) {
  const area = areaOf(v);
  const force = v.force ?? 50;
  const mm2 = area * 100;
  /** Pressure above outside air: N per mm² is MPa, so × 1000 for kPa. */
  const gauge = (force / mm2) * 1000;
  /** The plunger's fall from rest: the air squeezed until its push back is the push. */
  const down = (AIR * gauge) / (P0 + gauge);
  const wi = mm2 / Z;
  return { area, force, mm2, gauge, down, air: AIR - down, ratio: P0 / (P0 + gauge), wi, headBottom: FLOOR_TOP + AIR - down };
}

/** Where the plunger sits for a push of `force` N on `area` cm². */
export const downFor = (force: number, area: number) => settle({ area, force }).down;
/** The push that holds the plunger `down` mm below rest on `area` cm²: the inverse of downFor. */
const forceFor = (down: number, area: number) => (down >= AIR ? Infinity : ((P0 * down) / (AIR - down)) * ((area * 100) / 1000));

const handleAt = (v: Values) => {
  const s = settle(v);
  return v3(0, s.headBottom + HEAD_T + ROD_LEN + 2, 0);
};

/** The tube, one part: a U cut away at the front, with its floor and two walls. */
function tube(wi: number): Part {
  const wo = wi + 2 * WALL;
  const cy = TUBE_H / 2;
  const pts: Pt[] = [[-wo / 2, 0], [wo / 2, 0], [wo / 2, TUBE_H], [wi / 2, TUBE_H], [wi / 2, FLOOR], [-wi / 2, FLOOR], [-wi / 2, TUBE_H], [-wo / 2, TUBE_H]];
  const outline = pts.map(([x, y]) => ({ x, y: y - cy }));
  return part("tube", "Tube", "Holds the trapped air. Cut away at the front so you can see inside.", { kind: "extrusion", outline, depth: Z }, v3(0, PLATE_TOP + cy, 0), look.structure, on("plate", "weld"));
}

const DOT_ROWS = 3;
const DOT_COLS = 2;
const dot = lathe(Array.from({ length: 9 }, (_, i): Pt => {
  const t = ((i / 8) * 180 - 90) * (Math.PI / 180);
  return [DOT_R * Math.cos(t), DOT_R * Math.sin(t)];
}));

/** The trapped air: the same six dots at every pose, spread through the column under the head. */
function air(s: ReturnType<typeof settle>): Part[] {
  const out: Part[] = [];
  for (let j = 0; j < DOT_ROWS; j++) {
    for (let i = 0; i < DOT_COLS; i++) {
      const x = ((i + 0.5) / DOT_COLS - 0.5) * s.wi * 0.7;
      const y = FLOOR_TOP + (s.air * (j + 0.5)) / DOT_ROWS;
      out.push(part(`air-${j * DOT_COLS + i + 1}`, "Air", "The trapped air: the same dots, crowded closer as the plunger squeezes them.", dot.shape, v3(x, y, 0), look.slate, on("tube", "glue")));
    }
  }
  return out;
}

function build(v: Values): Part[] {
  const s = settle(v);
  const h = handleAt(v);
  const widest = (12 * 100) / Z;
  return [
    plate(widest + 2 * WALL, 30),
    tube(s.wi),
    ...air(s),
    part("head", "Seal head", "The seal: it slides in the tube and wipes its walls so no air gets past.", box(s.wi, HEAD_T, Z, 1), v3(0, s.headBottom + HEAD_T / 2, 0), look.focus, on("tube", "slide")),
    part("rod", "Plunger rod", "Carries your push down to the head.", cylinder(ROD_R, ROD_LEN).shape, v3(0, s.headBottom + HEAD_T + ROD_LEN / 2, 0), look.steel, on("head", "weld")),
    pushDisc("handle", h, "y", { name: "Thumb disc", role: "Where your thumb pushes.", on: on("rod", "weld") }),
    ...arrow("push-arrow", v3(0, h.y + 2, 0), -90, arrowLength(s.force, FORCE_MAX, ARROW_LONG), "push", { name: "Push arrow", role: "Your push on the plunger.", on: on("handle", "glue") }),
  ];
}

function readouts(v: Values) {
  const s = settle(v);
  return [
    { label: "Pressure", value: `p = F ÷ A = ${fmt(s.force)} N ÷ ${fmt(s.mm2)} mm² = ${fmt(s.gauge)} kPa above outside air` },
    { label: "Travel", value: `plunger down ${fmt(s.down, 1)} of ${AIR} mm: the air squeezed to ${fmt(s.ratio * 100)}% of its length` },
    { label: "State", value: s.force === 0 ? "at rest: the air is at outside pressure" : `balanced: the air pushes back p × A = ${fmt(s.force)} N, so the plunger stops here` },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "short" | "past";

/** The outcome, decided once from the area; meters, judge and play all read it. */
export function stop(v: Values) {
  const area = areaOf(v);
  const s = settle({ area, force: HAND });
  const miss = s.down - MARK;
  const kind: Kind = Math.abs(miss) <= TOLERANCE + 1e-9 ? "pass" : miss < 0 ? "short" : "past";
  return { kind, area, gauge: s.gauge, down: s.down, miss };
}

function judge(v: Values): Verdict {
  const r = stop(v);
  const push = `${HAND} N ÷ ${fmt(r.area * 100)} mm² = ${fmt(r.gauge)} kPa`;
  switch (r.kind) {
    case "short":
      return { pass: false, outcome: "stopped-short", headline: "Stopped short", detail: `${push} only squeezes the air ${fmt(r.down, 1)} mm; the line is ${MARK} mm, ${TOLERANCE} either way.` };
    case "past":
      return { pass: false, outcome: "went-past", headline: "Went past the line", detail: `${push} squeezes the air ${fmt(r.down, 1)} mm; the line is ${MARK} mm, ${TOLERANCE} either way.` };
    case "pass":
      return { pass: true, outcome: "on-the-line", headline: "Stopped on the line", detail: `${push} squeezes the air ${fmt(r.down, 1)} mm: within ${TOLERANCE} mm of the ${MARK} mm line.` };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = stop(v);
  return [
    { label: "Reaches", value: r.down, target: MARK - TOLERANCE, max: AIR, unit: "mm", need: "atLeast", digits: 1 },
    { label: "Not past", value: r.down, target: MARK + TOLERANCE, max: AIR, unit: "mm", need: "atMost", digits: 1 },
  ];
}

// Choreography, ms.
const LEAD = 300;
const PUSH = 900;
const HOLD = 650;
const RELEASE = 700;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = stop(v);
  const area = r.area;
  const f0 = v.force ?? 0;
  const tl = phases({ lead: LEAD, push: PUSH, hold: HOLD, release: RELEASE });
  const values = (force: number): Values => ({ ...v, area, force });
  const word = r.kind === "pass" ? "On the line" : r.kind === "short" ? `Short by ${say(-r.miss)} mm` : `Past the line by ${say(r.miss)} mm`;
  return {
    verdict,
    durationMs: tl.total,
    at: (ms) => {
      const { phase } = tl.at(ms);
      if (phase === "lead") return frame(values(f0), "Push down");
      if (phase === "push") {
        const force = f0 + (HAND - f0) * smooth(tl.t("push", ms));
        return frame(values(force), `Push ${say(force)} N, down ${say(downFor(force, area))} mm`);
      }
      if (phase === "hold") return frame(values(HAND), word);
      // Let go: the compressed air pushes the plunger back up, fast first and settling.
      return frame(values(HAND * (1 - easeOut(tl.t("release", ms)))), "Let go: it springs back");
    },
  };
}

/** The line: a mark on the tube's left side, level with where the head's underside should stop. */
function scene(v: Values): Part[] {
  const s = settle(v);
  const y = FLOOR_TOP + AIR - MARK;
  return [tick(`${SCENE}line`, v3(-(s.wi / 2 + WALL + 6), y, 0), 12, "x", { name: "Line", role: "Where the plunger should stop.", on: on("tube", "glue") })];
}

export const piston: Primitive = {
  id: "piston",
  name: "Piston",
  level: "Mechanism",
  job: "Turn a push into pressure and back",
  howItWorks:
    "A piston is a seal sliding in a tube. Push on the plunger and the trapped air pushes back over the same area, so the pressure is the force divided by the area: the same push on half the area gives twice the pressure. The outlet is plugged, so the air is squeezed into less space (Boyle's law, with the temperature held steady), and the plunger stops where the air pushes back as hard as you push. The air acts as a spring: let go and it pushes the plunger back up. The tube is drawn cut away at the front so the air shows. Real seals leak and rub, and the air warms as it is compressed; both are ignored.",
  madeOf: ["seal", "spring"],
  seenIn: ["Syringe", "Soap pump", "Bike pump"],
  sliders: [
    { id: "area", label: "Area", min: 4, max: 12, step: 0.5, initial: 8, unit: " cm²" },
    { id: "force", label: "Push", min: 0, max: FORCE_MAX, step: 1, initial: 50, unit: " N" },
  ],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "force",
    label: "Push",
    at: handleAt,
    // The plunger is where the push balances the air, so a handle dragged `down` mm below its rest asks for the push that holds it there.
    solve: (point, v) => forceFor(handleAt({ area: areaOf(v), force: 0 }).y - point.y, areaOf(v)),
    // Your hand pushes HAND at most, so the plunger goes no further than where HAND balances the air.
    reach: () => [0, Math.min(FORCE_MAX, HAND)],
  },
  game: {
    name: "Stop on the line",
    goal: "Push once and stop the plunger on the line.",
    rules: `You push with ${HAND} N. The air stops the plunger where it pushes back ${HAND} N. Stop the head within ${TOLERANCE} mm of the line, ${MARK} mm down.`,
    number: "area",
    action: "Hold to push",
    meters,
    judge,
    play,
    start: { area: START_AREA, force: 0 },
    scene,
  },
};

/** Exposed for tests: the layout the parts are placed by. */
export const geometry = { Z, WALL, FLOOR, HEAD_T, ROD_LEN, ROD_R, TUBE_H, FLOOR_TOP, DOT_R, DOT_ROWS, DOT_COLS, P0 };
