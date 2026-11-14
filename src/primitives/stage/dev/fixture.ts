// A stand-in spring with a handle, a reach and a game, for developing and testing the stage before the real models
// carry theirs. Not part of the library. A finger pushes at most FINGER N, so the plate only goes down F / k mm.
import type { Part } from "../../../../shared/kit.ts";
import { COLOR, coil, cylinder, look, part, v3 } from "../../parts.ts";
import type { Primitive, Run, Values, Verdict } from "../../types.ts";

const BASE_T = 6;
const FREE = 80;
const R = 16;
const TURNS = 7;
const FINGER = 30;
const LINE = 25;
const LID = 20;
const PLATE_R = 26;

const smooth = (t: number) => t * t * (3 - 2 * t);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t);
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

const plateTop = (press: number) => BASE_T + FREE - press + BASE_T;

function build({ stiffness = 1.5, press = 0 }: Values, extra: Part[] = []): Part[] {
  const len = FREE - press;
  const disc = cylinder(PLATE_R, BASE_T);
  return [
    part("base", "Base", "The spring rests on it.", disc.shape, v3(0, disc.midY), look.structure),
    part("coil", "Coil", "The spring.", coil(R, 1.5 * Math.pow(stiffness, 0.25), len, TURNS), v3(0, BASE_T + len / 2), look.focusMetal, { parentId: "base", joint: "spring" }),
    part("plate", "Plate", "What the finger presses.", disc.shape, v3(0, BASE_T + len + disc.midY), look.slate, { parentId: "coil", joint: "weld" }),
    ...extra,
  ];
}

const handArrow = (press: number, alpha: number): Part[] =>
  alpha <= 0
    ? []
    : [
        part(
          "hand-arrow",
          "Finger",
          "The push.",
          { kind: "extrusion", outline: [{ x: -2, y: 0 }, { x: 2, y: 0 }, { x: 2, y: 14 * alpha }, { x: -2, y: 14 * alpha }], depth: 4 },
          v3(0, plateTop(press) + 2 + 7 * alpha, 0),
          { color: COLOR.accent, finish: "matte" },
          { parentId: "plate", joint: "glue" },
        ),
      ];

type Result = { kind: "stiff" | "weak" | "pass"; reach: number; k: number };
const result = ({ stiffness = 1.5 }: Values): Result => {
  const reach = Math.min(40, FINGER / stiffness);
  return { kind: reach < LINE ? "stiff" : stiffness * LINE < LID ? "weak" : "pass", reach, k: stiffness };
};

function verdict(r: Result): Verdict {
  if (r.kind === "stiff") return { pass: false, outcome: "too-stiff", headline: "Too stiff to press", detail: `${FINGER} N ÷ ${r.k.toFixed(1)} N/mm = ${r.reach.toFixed(1)} mm, short of ${LINE} mm.` };
  if (r.kind === "weak") return { pass: false, outcome: "too-weak", headline: "Too weak to lift", detail: `${r.k.toFixed(1)} N/mm × ${LINE} mm = ${(r.k * LINE).toFixed(0)} N, under the ${LID} N lid.` };
  return { pass: true, outcome: "pass", headline: "Pressed to the line", detail: `${r.k.toFixed(1)} N/mm × ${LINE} mm = ${(r.k * LINE).toFixed(0)} N, within one finger's ${FINGER} N.` };
}

const LEAD = 250;
const ACT = 800;
const HOLD = 600;
const RESET = 600;

function play(v: Values): Run {
  const r = result(v);
  const depth = Math.min(r.reach, LINE);
  const durationMs = LEAD + ACT + HOLD + RESET;
  return {
    verdict: verdict(r),
    durationMs,
    cues: [{ ms: LEAD + ACT, kind: r.kind === "stiff" ? "thud" : "click" }],
    at: (ms) => {
      let press = 0;
      let live = "Finger on the plate";
      let arrow = clamp01(ms / LEAD);
      if (ms > LEAD && ms <= LEAD + ACT) {
        press = depth * smooth((ms - LEAD) / ACT);
        live = `Down ${press.toFixed(0)} of ${LINE} mm`;
      } else if (ms > LEAD + ACT && ms <= LEAD + ACT + HOLD) {
        const t = (ms - LEAD - ACT) / HOLD;
        // A press that cannot reach the line trembles at its limit.
        press = depth - (r.kind === "stiff" ? 0.6 * Math.abs(Math.sin(t * 18)) * (1 - t) : 0);
        live = r.kind === "stiff" ? `Stuck at ${depth.toFixed(0)} mm` : "Holding";
      } else if (ms > LEAD + ACT + HOLD) {
        const t = clamp01((ms - LEAD - ACT - HOLD) / RESET);
        press = r.kind === "weak" ? depth * (1 - 0.4 * easeOut(t)) : depth * (1 - easeOut(t));
        arrow = 1 - t;
        live = "Putting it back";
      }
      const values = { ...v, press };
      return { values, live, marks: handArrow(press, arrow) };
    },
  };
}

export const fixtureSpring: Primitive = {
  id: "fixture-spring",
  name: "Test spring",
  level: "Element",
  job: "A stand-in for developing the stage",
  howItWorks: "A coil spring pressed by one finger of at most 30 N.",
  madeOf: [],
  seenIn: [],
  sliders: [
    { id: "stiffness", label: "Stiffness", min: 0.5, max: 3, step: 0.1, initial: 1.5, unit: " N/mm" },
    { id: "press", label: "Press", min: 0, max: 40, step: 1, initial: 0, unit: " mm" },
  ],
  view: { elevation: 12, azimuth: 26 },
  build: (v) => build(v),
  readouts: (v) => [{ label: "Squeeze", value: `${(v.press ?? 0).toFixed(0)} mm` }],
  handle: {
    slider: "press",
    label: "Press",
    at: (v) => v3(0, plateTop(v.press ?? 0), PLATE_R * 0.6),
    solve: (point) => plateTop(0) - point.y,
    reach: (v) => [0, Math.min(40, FINGER / (v.stiffness ?? 1.5))],
  },
  game: {
    name: "One finger",
    goal: "Press the plate to the line with one finger.",
    rules: `A finger pushes at most ${FINGER} N. The spring must still lift a ${LID} N lid from the line.`,
    number: "stiffness",
    action: "Press",
    meters: (v) => {
      const r = result(v);
      return [
        { label: "Reach", value: r.reach, target: LINE, max: 40, unit: "mm", need: "atLeast" },
        { label: "Lift", value: r.k * LINE, target: LID, max: 80, unit: "N", need: "atLeast" },
      ];
    },
    judge: (v) => verdict(result(v)),
    play,
    start: { stiffness: 1.5, press: 0 },
    // The target the player must see before acting: a bar at the depth the plate has to reach.
    scene: () => [
      part("line", "Line", "How far the plate has to go.", { kind: "box", width: 64, height: 1.2, depth: 2, cornerRadius: 0 }, v3(0, plateTop(LINE) - BASE_T / 2, -PLATE_R - 2), { color: COLOR.accent, finish: "matte" }, { parentId: "base", joint: "glue" }),
    ],
  },
};
