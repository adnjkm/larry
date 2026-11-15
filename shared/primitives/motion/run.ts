// Building blocks for a game's `play` run (src/primitives/docs/motion-language.md). Pure TypeScript: no React, no three.
import type { Part } from "../../kit.ts";
import { arrow, on, type Vec } from "../parts.ts";
import { type Frame, type Primitive, type Run, type Values, initialValues, motionSlider } from "../types.ts";
import { clamp, clamp01 } from "./ease.ts";

/** The usual length of a run's phases, ms. A model whose choreography needs another keeps its own constant. */
export const LEAD = 250;
export const HOLD = 700;
export const RESET = 600;
export const REWIND = 450;

/** A run's phases in order. Every query takes the run's own clock, ms from the start. */
type Timeline<K extends string> = {
  /** Sum of every phase. */
  total: number;
  start: (name: K) => number;
  end: (name: K) => number;
  /** Progress through one phase: 0 before it starts, 1 once it has ended, linear inside. A phase of 0 ms jumps at its start. */
  t: (name: K, ms: number) => number;
  /** Whether `ms` falls inside the phase (start inclusive, end exclusive). */
  in: (name: K, ms: number) => boolean;
  /** The phase `ms` falls in (the last phase once the run is over), the ms into it and its progress. Zero-length phases are never current. */
  at: (ms: number) => { phase: K; ms: number; t: number };
};

/**
 * Named phases, played in the order given: `phases({ lead: 250, act: 700, hold: 600, reset: 700 })`.
 * Give a phase 0 ms to skip it for this run (a pass has no "snap" phase, say); `t` still reads 1 once it is past.
 */
export function phases<K extends string>(durations: Record<K, number>): Timeline<K> {
  const names = Object.keys(durations) as K[];
  const starts = {} as Record<K, number>;
  let total = 0;
  for (const name of names) {
    starts[name] = total;
    total += Math.max(0, durations[name]);
  }
  const end = (name: K) => starts[name] + Math.max(0, durations[name]);
  const t = (name: K, ms: number) => {
    const d = Math.max(0, durations[name]);
    return d === 0 ? (ms >= starts[name] ? 1 : 0) : clamp01((ms - starts[name]) / d);
  };
  const live = names.filter((n) => durations[n] > 0);
  const last = (live[live.length - 1] ?? names[names.length - 1]) as K;
  return {
    total,
    start: (name) => starts[name],
    end,
    t,
    in: (name, ms) => ms >= starts[name] && ms < end(name),
    at: (ms) => {
      const phase = live.find((n) => ms < end(n)) ?? last;
      return { phase, ms: ms - starts[phase], t: t(phase, ms) };
    },
  };
}

/** The time within [from, to] at which a rising `f` first reaches `target`, by bisection. For cue times: when does the turn pass the next tooth? */
export function whenReaches(f: (ms: number) => number, target: number, from: number, to: number): number {
  let lo = from;
  let hi = to;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < target) lo = mid;
    else hi = mid;
  }
  return hi;
}

/** Mark ids (`Frame.marks`, props that exist only mid-run) start with this, so they never clash with `build`'s ids. */
export const MARK = "mark-";
/** Scene ids (`Game.scene`, the game's standing props) start with this, so they never clash with `build`'s or the marks'. */
export const SCENE = "game-";

/**
 * The hand's arrow for `frame.marks`: purple, ARROW_GAP clear of the point it acts on (see parts.ts `arrow`), hung
 * off the plate. A hand pushes ("push", the arrow comes in) or pulls ("pull", the arrow leaves).
 */
export function handArrow(at: Vec, angleDeg: number, kind: "push" | "pull", length = 24, id = "hand-arrow"): Part[] {
  return arrow(`${MARK}${id}`, at, angleDeg, length, kind, { name: "Hand", role: "Your hand's push or pull.", on: on("plate", "glue") });
}

/** A frame, with marks only when there are some. */
export const frame = (values: Values, live: string, marks: Part[] = []): Frame => (marks.length > 0 ? { values, live, marks } : { values, live });

/** One number for a caption: whole numbers from 10 up, one decimal below, no trailing ".0". */
export function say(n: number, digits?: number): string {
  const d = digits ?? (Math.abs(n) >= 10 ? 0 : 1);
  return Number(n.toFixed(d)).toString();
}

/** One full low-high-low cycle of the play sweep. */
export const SWEEP_MS = 4000;
const SWEEP_STEP = 16;

/**
 * The play sweep (motion-language.md): the motion slider runs end to end and back on `0.5 - 0.5 cos(2 pi t / 4 s)`,
 * starting from where it is in `start`, heading up, so it never jumps. When the handle has a `reach`, the sweep stays
 * inside it: the ends come from `reach(start)`, and every 16 ms step is held inside `reach` of the step before, so a
 * one-way machine (a ratchet) winds up and then holds rather than running backward through its pawl. `at(ms)` repeats
 * every SWEEP_MS; `moves` is false when the reach is a single value.
 */
export function sweepRun(p: Primitive, start: Values = initialValues(p)): Pick<Run, "durationMs" | "at"> & { moves: boolean } {
  const s = motionSlider(p);
  const reach = p.handle.slider === s.id ? p.handle.reach : undefined;
  const inRange = ([lo, hi]: [number, number]): [number, number] => [clamp(lo, s.min, s.max), clamp(hi, s.min, s.max)];
  const [lo, hi] = inRange(reach ? reach(start) : [s.min, s.max]);
  const fraction = hi > lo ? clamp01(((start[s.id] ?? s.initial) - lo) / (hi - lo)) : 0;
  const phase = (Math.acos(1 - 2 * fraction) / (2 * Math.PI)) * SWEEP_MS;
  const target = (ms: number) => lo + (hi - lo) * (0.5 - 0.5 * Math.cos((2 * Math.PI * (ms + phase)) / SWEEP_MS));
  const steps: number[] = [];
  const valueAt = (k: number): number => {
    while (steps.length <= k) {
      const i = steps.length;
      const want = target(i * SWEEP_STEP);
      if (i === 0 || !reach) steps.push(want);
      else {
        const [a, b] = inRange(reach({ ...start, [s.id]: steps[i - 1] as number }));
        steps.push(clamp(want, a, b));
      }
    }
    return steps[k] as number;
  };
  const unit = (n: number) => `${say(n * (s.displayScale ?? 1))}${s.unit ?? ""}`;
  const last = Math.floor(SWEEP_MS / SWEEP_STEP);
  return {
    durationMs: SWEEP_MS,
    moves: hi > lo,
    at: (ms) => {
      const local = ((ms % SWEEP_MS) + SWEEP_MS) % SWEEP_MS;
      const k = Math.floor(local / SWEEP_STEP);
      const a = valueAt(k);
      const b = valueAt(Math.min(k + 1, last));
      const value = a + (b - a) * ((local - k * SWEEP_STEP) / SWEEP_STEP);
      return { values: { ...start, [s.id]: value }, live: `${s.label} ${unit(value)}` };
    },
  };
}
