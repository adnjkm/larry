// Types for the primitives library, and the helpers that read its sliders. Two levels:
// - Element: one piece, one job, one number, and it can't be made from the others.
// - Mechanism: two or three elements combined to do one new job none of them does alone.
//
// A primitive is a pose function (`build`) plus a premade game. Nothing is simulated: the game knows what will
// happen for any setting, so motion is a closed-form script of slider values over time (`Run`).
import type { Part } from "../kit.ts";
import { clamp } from "./motion/ease.ts";

export type Slider = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  /** Shown after the value. */
  unit?: string;
  /** Multiplies the value for display, e.g. 100 to show a fraction as a percentage. */
  displayScale?: number;
};

export type Values = Record<string, number>;

/** Every value on a slider's step grid, min to max. */
export function steps(s: Slider): number[] {
  const n = Math.round((s.max - s.min) / s.step);
  return Array.from({ length: n + 1 }, (_, i) => Number((s.min + i * s.step).toFixed(10)));
}

/** `x` held inside the slider's range and snapped to its step grid. */
export const snap = (s: Slider, x: number): number => clamp(Number((s.min + Math.round((x - s.min) / s.step) * s.step).toFixed(10)), s.min, s.max);

/** A model's reading of its own slider: `v[s.id]` (the slider's initial when absent or not a number), clamped and snapped to the slider itself. */
export const valueOf = (s: Slider, v: Values): number => snap(s, Number.isFinite(v[s.id]) ? v[s.id]! : s.initial);
export type Readout = { label: string; value: string };

export type Level = "Element" | "Mechanism";

/** A point in the figure's own space: millimetres, y up, the base plate's top at y = 6. */
export type Point = { x: number; y: number; z: number };

/** The one place a finger grabs the figure. Dragging it drives one slider, so the reader moves the part itself. */
export type Handle = {
  /** The slider the drag drives. Usually the motion slider, never the game's `number`. */
  slider: string;
  /** One verb for the touch target: "Press", "Pull", "Turn". */
  label: string;
  /** Where the handle is at these values. The touch target follows it. */
  at: (v: Values) => Point;
  /**
   * The slider value that brings the handle nearest to `point`, which lies in the plane z = at(v).z.
   * Unclamped: the stage clamps to the slider's range and snaps to its step.
   */
  solve: (point: { x: number; y: number }, v: Values) => number;
  /**
   * The part of the slider's range the machine can really be moved through at these values, lowest first.
   * A lever whose load outweighs the finger's push only gives a millimetre or two; a cord cannot be pushed.
   * The stage stops the drag there, so a finger can never put the machine in a pose its forces could not hold.
   * Unset means the whole slider range.
   */
  reach?: (v: Values) => [number, number];
};

type CueKind = "click" | "snap" | "thud" | "pop" | "slip" | "drip" | "ring";
/** Something that happens at one moment of a run, for a haptic tick, a sound or a flash. */
export type Cue = { ms: number; kind: CueKind };

/** What the figure shows at one moment of a run. */
export type Frame = {
  /** Every value stays inside its slider's or control's range. */
  values: Values;
  /** A short caption that counts in step with the motion: "Pad down 13 of 24 mm", "Turn 2.1 of 3.4". */
  live: string;
  /** Props that exist only while they matter (a hand arrow, a puck, a staple), drawn with the figure's own parts. Their ids never clash with `build`'s. */
  marks?: Part[];
};

/** A scripted motion: the outcome is decided first, then `at` plays the choreography that outcome implies. Closed form, no simulation. */
export type Run = {
  verdict: Verdict;
  /** Keep a game's run under 4500. */
  durationMs: number;
  /** The frame at `ms`, for ms in [0, durationMs]. at(durationMs) is where the figure comes to rest. */
  at: (ms: number) => Frame;
  cues?: Cue[];
};

export type Meter = {
  /** 12 characters or fewer. */
  label: string;
  value: number;
  target: number;
  /** The value at the right-hand end of the bar. */
  max: number;
  unit: string;
  /** "atLeast": the value has to reach the target. "atMost": it has to stay at or under it. */
  need: "atLeast" | "atMost";
  /** Decimal places shown. Default 0. */
  digits?: number;
};

export type Verdict = {
  pass: boolean;
  /** Names the outcome in kebab-case, e.g. "too-heavy". Used by tests. */
  outcome: string;
  /** 2 to 5 words, shown bold. */
  headline: string;
  /** One sentence carrying the number that explains the outcome. */
  detail: string;
};

/** The primitive's premade game: set one number, act once, watch what that setting does. */
export type Game = {
  /** e.g. "One finger". */
  name: string;
  /** One sentence, e.g. "Lift the block with one finger." */
  goal: string;
  /** The limits the player works within, 30 words or fewer, numbers included. */
  rules: string;
  /** The slider the player sets before acting: the primitive's one number. */
  number: string;
  /** Extra game-only settings, read by `build` like any other value. A control with min 0, max 1, step 1 is shown as a toggle. */
  controls?: Slider[];
  /** The action button's label: "Hold to press", "Let go", "Hammer". */
  action: string;
  /** The two quantities that decide the game, live for the current values. */
  meters: (v: Values) => [Meter, Meter];
  /** What happens if the player acts now. Pure, and consistent with `meters` and `play`. */
  judge: (v: Values) => Verdict;
  /** The motion the player sees when they act with these values. `play(v).verdict` equals `judge(v)`. */
  play: (v: Values) => Run;
  /** Where the game starts. Defaults to every slider's initial value. `judge(start)` must fail, so there is something to solve. */
  start?: Values;
  /**
   * Values only a run sets, read by `build` like any other: a spring ringing past its free length, a pawl lifted by
   * hand, teeth stripped off a wheel. No control shows them; outside a run each sits at its `initial`, and a stage drops
   * them when it hands the run's last frame back to the sliders. Frames keep them inside these ranges.
   */
  poses?: Slider[];
  /**
   * What the game adds to the figure for as long as the game is on screen: its target (a bell, a shelf, a crate, a mark)
   * and anything else the player must see BEFORE acting. Drawn in game mode at rest and during runs, and counted in the
   * framing. Not drawn in library stills or lessons. Ids never clash with `build`'s or with a frame's marks.
   */
  scene?: (v: Values) => Part[];
};

/** "bench" looks slightly down at a rig laid out left to right. "coaxial" looks further down at a rig built up one vertical axis. */
type ViewPreset = "bench" | "coaxial";
export const VIEW: Record<ViewPreset, { elevation: number; azimuth: number }> = {
  bench: { elevation: 14, azimuth: 24 },
  coaxial: { elevation: 22, azimuth: 24 },
};

export type Primitive = {
  id: string;
  name: string;
  level: Level;
  /** The job, one line, from the library table. */
  job: string;
  /** A short paragraph for curious adults. Physics claims here are checked by hand; say what is left out (friction, mass). */
  howItWorks: string;
  /** Element ids this is made of. Empty for elements. */
  madeOf: string[];
  seenIn: string[];
  /**
   * The first slider is the primitive's one number from the library table; a second, if any, drives the motion.
   * Slider ids, ranges and initial values are a contract with stored lessons: change them only for a stated reason.
   */
  sliders: Slider[];
  /** Use VIEW.bench or VIEW.coaxial. Any other angle needs a comment saying what it shows that the presets hide. */
  view: { elevation: number; azimuth: number };
  /** Required when `view` is not a preset: what this angle shows that the presets hide. Checked by tests. */
  viewReason?: string;
  build: (v: Values) => Part[];
  readouts: (v: Values) => Readout[];
  handle: Handle;
  game: Game;
};

/** Every slider the figure's values can hold: the primitive's, its game's controls and its run-only poses. */
export const allSliders = (p: Primitive): Slider[] => [...p.sliders, ...(p.game.controls ?? []), ...(p.game.poses ?? [])];

/** The slider the handle and the play sweep move: the handle's, else the last slider (the first is the number). */
export const motionSlider = (p: Primitive): Slider => allSliders(p).find((s) => s.id === p.handle.slider) ?? p.sliders.at(-1)!;

/** Each slider's initial value. */
export const initialValues = (p: Primitive): Values => Object.fromEntries(p.sliders.map((s) => [s.id, s.initial]));

/** Every value the figure can hold at rest: each slider, control and run-only pose at its initial, then, for the game, `game.start`. */
export const startValues = (p: Primitive, game = true): Values => ({
  ...Object.fromEntries(allSliders(p).map((s) => [s.id, s.initial])),
  ...(game ? p.game.start : undefined),
});
