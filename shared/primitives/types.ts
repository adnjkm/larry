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
  /** A word for each end, low then high, shown where numbers are not: ["Soft", "Stiff"]. */
  ends?: readonly [string, string];
};

export type Values = Record<string, number>;

/** A slider's value as the reader sees it: scaled, rounded to its step, with its unit. */
export const formatSlider = (s: Slider, value: number) => {
  const shown = value * (s.displayScale ?? 1);
  return `${shown.toFixed(s.step * (s.displayScale ?? 1) < 1 ? 1 : 0)}${s.unit ?? ""}`;
};

/** Every value on a slider's step grid, min to max. */
export function steps(s: Slider): number[] {
  const n = Math.round((s.max - s.min) / s.step);
  return Array.from({ length: n + 1 }, (_, i) => Number((s.min + i * s.step).toFixed(10)));
}

/** `count` values spread from a slider's min to its max, each on the slider's own step grid. */
export function sliderSamples(s: Slider, count: number): number[] {
  const n = Math.round((s.max - s.min) / s.step);
  return [...new Set(Array.from({ length: count }, (_, i) => Math.round((i * n) / (count - 1))))].map((k) => s.min + k * s.step);
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

/**
 * One line drawn under the free-play figure: the primitive's law, reshaped live by its sliders. Both axes run 0 to 1,
 * y up. Ultra plain: the line, a faint zero, and the dot where the machine is now.
 */
export type Plot = {
  line: readonly (readonly [number, number])[];
  /** Where the machine is now on the line, if it is on it. */
  dot?: readonly [number, number];
  /** Height of a faint zero line, 0 to 1. */
  zero?: number;
  /**
   * A window the line must pass through, as a short upright bracket at `x` from `low` to `high`: what a choice of the
   * number has to meet. `met` when the line passes through it; `labels` name its bottom and top in a word each.
   */
  gate?: { x: number; low: number; high: number; met: boolean; labels?: readonly [string, string] };
  /** Two or three words under the line, when the line needs them: "pull at the rim". */
  caption?: string;
};

/**
 * One goal in free play, after the first touch: something the primitive must do, set by its slider alone. A line to
 * sink below, a mark to reach. The figure shows it (`scene`); the screen says it (`goal`) and fills a Continue pill
 * while it is `met`.
 */
export type Task = {
  /** One sentence: "Make it soft enough to sink the weight below the line." */
  goal: string;
  /** Values set when the task begins: a weight put on, the slider moved somewhere that fails. */
  start?: Values;
  /**
   * The hand keeps working the machine during this task: the goal is something to do by hand with the sliders set
   * right (lift the plank to the green). Left out, the hand is put away and only the sliders can meet the goal.
   */
  hand?: boolean;
  /**
   * The sliders shown while the task is on, by id: any of the play's, the hand's own included, since the hand is put
   * away during a task. Left out, the play's tuning sliders (all but the hand's).
   */
  sliders?: readonly string[];
  /** What the task adds to the figure: the weight. Ids never clash with the figure's. */
  scene: (v: Values) => Part[];
  /** Whether the goal is met at these values. */
  met: (v: Values) => boolean;
  /**
   * What to say in the goal's place while the machine is in a state worth a word ("Too steep, so it jams."), or nothing.
   * Read live, so it goes again the moment the state is fixed.
   */
  hint?: (v: Values) => string | undefined;
  /** What happens as the task begins, from `start`: the weight dropping on. Not framed: it may come in from outside. */
  arrive?: (v: Values) => Motion;
  /**
   * A motor that runs the machine while the task is on: the values it has after `dtMs` more of running from `v`, `ms`
   * into the task. It reads the sliders afresh every frame, so the machine answers them as it runs: a cam turned
   * steadily, jamming the moment its lift is too tall. `way` is the way the hand was moving the handle's slider when it
   * let go (1 or -1), so a motor can carry on the same way.
   */
  drive?: (v: Values, ms: number, dtMs: number, way?: 1 | -1) => Values;
  /**
   * A button beside Continue that does one thing to the machine when pressed: "Pull" sets `tug`, and the task's motor
   * pulls the door from then. For a test the user runs by hand while the world (a gust) runs on its own.
   */
  action?: { label: string; set: Values };
};

/** A scripted motion with no outcome to report: what a machine does on its own, such as when the hand lets go of it. */
export type Motion = {
  durationMs: number;
  /** The frame at `ms`, for ms in [0, durationMs]. at(durationMs) is where the figure comes to rest. */
  at: (ms: number) => Frame;
  cues?: Cue[];
};

/**
 * Free play: the machine on its own, worked by its handle the way the real thing works, before any game. It starts at
 * rest, the handle moves it as far as the real thing goes, and when the hand lets go it does what the real thing does.
 */
export type Play = {
  /**
   * Free play's own sliders, when the bare primitive is a different rig from the game's (the grip is a block on a ramp
   * here, two pads in the game). With them, `handle` and `build` must read them. Defaults to the primitive's sliders.
   */
  sliders?: Slider[];
  /** Values free play holds that no control shows (a weight resting on the spring, how far it has still to fall). */
  poses?: Slider[];
  /** Goals that follow the first touch, one after another. */
  tasks?: Task[];
  /** Free play's handle, when its rig is its own. Defaults to the primitive's. */
  handle?: Handle;
  /** What the hand is doing, drawn only while the finger holds the handle: a force arrow, sized by the push. */
  hand?: (v: Values) => Part[];
  /** The primitive's law under the figure, reshaped live by the sliders. */
  plot?: (v: Values) => Plot;
  /**
   * What keeps happening while the machine sits there, drawn over the figure at `ms` since free play opened: drops
   * leaking past a seal. Loops on its own; stays inside the figure's framing.
   */
  ambient?: (v: Values, ms: number) => Part[];
  /**
   * The primitive alone, as a finger meets it: the spring and the plate it stands on, a bolt and its nut. None of the
   * game's apparatus (targets, marks, measuring posts, ticks, hand arrows), and no load unless the primitive means
   * nothing without one. Same values and geometry as `build`, so the handle sits on it the same way. Defaults to `build`.
   */
  build?: (v: Values) => Part[];
  /**
   * The machine left alone, over the sliders' initials: where it starts and what it comes back to. A spring at its free
   * length, a weight hanging straight down, a lever with its load sitting on the plate.
   */
  rest: Values;
  /**
   * The words under the header: the primitive's pronunciation, as a dictionary gives it ("/spriNG/"), its definition,
   * and a note on what its slider changes, as a bullet under them. The note names what changes, not which way: the user
   * finds the spectrum by moving it.
   */
  facts?: { say: string; is: string; note: string };
  /** The handle's verb in free play, when the game's does not fit a bare hand on the part: "Press" for a spring the game pulls down. */
  label?: string;
  /** How far the handle moves it, when that is less than its slider's range. Real stops only: coils touching, a thread's end. */
  reach?: (v: Values) => [number, number];
  /**
   * What the machine does when the hand lets go at `v`, ending at rest: a spring springs back, a weight swings and
   * settles, a lifted load drops. Leave it out for a machine that stays where it is left: a screw, a ratchet, a wheel.
   */
  release?: (v: Values) => Motion;
  /**
   * The let-go always plays out whole: a grab while it plays skips to its end instead of stopping it half way. For a
   * let-go that puts things back (the grip's block carried home), which the hand must not catch mid-air.
   */
  whole?: boolean;
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
  /** Free play, before the game. */
  play?: Play;
  game: Game;
};

/** Every slider the figure's values can hold: the primitive's, its free play's own, its game's controls and its run-only poses. */
export const allSliders = (p: Primitive): Slider[] => [
  ...p.sliders,
  ...(p.play?.sliders ?? []),
  ...(p.play?.poses ?? []),
  ...(p.game.controls ?? []),
  ...(p.game.poses ?? []),
];

/** The slider the handle and the play sweep move: the handle's, else the last slider (the first is the number). */
export const motionSlider = (p: Primitive): Slider => allSliders(p).find((s) => s.id === p.handle.slider) ?? p.sliders.at(-1)!;

/** The slider the player sets before acting: the game's `number`, among the sliders and the game's controls. */
export const numberSlider = (p: Primitive): Slider => [...p.sliders, ...(p.game.controls ?? [])].find((s) => s.id === p.game.number)!;

/** Each slider's initial value. */
export const initialValues = (p: Primitive): Values => Object.fromEntries(p.sliders.map((s) => [s.id, s.initial]));

/** Free play's handle: its own, else the primitive's. */
export const playHandle = (p: Primitive): Handle => p.play?.handle ?? p.handle;

/** The slider free play's handle drives. */
export const playMotion = (p: Primitive): Slider => allSliders(p).find((s) => s.id === playHandle(p).slider) ?? motionSlider(p);

/** The sliders free play shows once the machine has been moved: its own, else the primitive's, less the one the handle drives. */
export const playTuning = (p: Primitive): Slider[] => (p.play?.sliders ?? p.sliders).filter((s) => s.id !== playMotion(p).id);

/** The figure free play draws: the play's bare figure, else the primitive's own. */
export const playBuild = (p: Primitive): ((v: Values) => Part[]) => p.play?.build ?? p.build;

/** Where free play starts: every slider, control and run-only pose at its initial, then the play's rest. */
export const playValues = (p: Primitive): Values => ({ ...startValues(p, false), ...p.play?.rest });

/** Every value the figure can hold at rest: each slider, control and run-only pose at its initial, then, for the game, `game.start`. */
export const startValues = (p: Primitive, game = true): Values => ({
  ...Object.fromEntries(allSliders(p).map((s) => [s.id, s.initial])),
  ...(game ? p.game.start : undefined),
});
