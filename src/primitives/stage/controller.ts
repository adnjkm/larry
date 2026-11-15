// The figure's values over time: set, play a Run, sweep. Pure: the stage calls tick(now) from its frame loop and
// receives every pose through `apply`, so this runs under node --test with a fake clock.
import type { Part } from "../../../shared/kit.ts";
import type { Cue, Run, Slider, Values } from "../types.ts";

/** What a page drives a figure with. See FigureStage.tsx for the whole API. */
export type StageController = {
  /** The values the figure shows now. Do not mutate. */
  get(): Values;
  /** Merges `values` in (clamped to their sliders' ranges) and shows them. Stops a run or sweep if anything changes. */
  set(values: Values): void;
  /**
   * Stops a run or sweep, clears a finished run's props (and run-only poses), merges `values` in if given, and redraws,
   * even when no value changes. For the game's reset after a run.
   */
  reset(values?: Values): void;
  /** Plays a run from at(0) to at(durationMs). Resolves true when it finishes, false if a set, drag, stop or another play interrupts it. */
  play(run: Run): Promise<boolean>;
  /** Sweeps the motion slider low to high and back on a 4 s cosine until stopped. Does nothing under reduced motion. */
  sweep(): void;
  /** Stops a run (which resolves false) or a sweep, leaving the figure where it is. */
  stop(): void;
  /** Called with the values after every change (every frame of a run or sweep). Returns the unsubscribe. */
  subscribe(fn: (values: Values) => void): () => void;
  /** What is moving the figure now. */
  state(): "idle" | "playing" | "sweeping";
};

export type MotionHost = {
  /** Show these values (and props). Called at most once per tick. */
  apply(values: Values, marks: readonly Part[] | undefined): void;
  /** Ask for tick(now) on the next animation frame. */
  wake(): void;
  reducedMotion(): boolean;
  /** Every slider and game control, for clamping. */
  sliders(): readonly Slider[];
  /** The game's run-only values (Game.poses): each goes back to its initial when a run hands its last frame back. */
  poses(): readonly Slider[];
  /** The slider the play sweep moves and the range it covers at these values. */
  sweepRange(values: Values): { id: string; lo: number; hi: number } | undefined;
  onLive?(text: string): void;
  onCue?(cue: Cue): void;
};

/** One full low-high-low cycle of the play sweep. */
export const SWEEP_MS = 4000;

type Playing = { run: Run; cues: Cue[]; next: number; start: number | undefined; done: (finished: boolean) => void };
type Sweeping = { id: string; lo: number; hi: number; phase: number; start: number | undefined };

export class Motion implements StageController {
  private values: Values;
  private playing: Playing | undefined;
  private sweeping: Sweeping | undefined;
  private lastLive: string | undefined;
  private readonly listeners = new Set<(values: Values) => void>();
  private readonly host: MotionHost;

  constructor(host: MotionHost, initial: Values) {
    this.host = host;
    this.values = { ...initial };
  }

  get = (): Values => this.values;

  state = () => (this.playing ? "playing" : this.sweeping ? "sweeping" : "idle") as ReturnType<StageController["state"]>;

  set = (values: Values): void => {
    let changed = false;
    for (const id in values) if (this.clamp(id, values[id]!) !== this.values[id]) changed = true;
    // Nothing changed: a run's resting pose (and its props) stays, and a run or sweep carries on.
    if (!changed) return;
    this.interrupt();
    const next = { ...this.values };
    for (const id in values) next[id] = this.clamp(id, values[id]!);
    this.show(next, undefined);
  };

  reset = (values?: Values): void => {
    this.interrupt();
    const next = this.handBack({ ...this.values });
    if (values) for (const id in values) next[id] = this.clamp(id, values[id]!);
    this.show(next, undefined);
  };

  play = (run: Run): Promise<boolean> => {
    this.interrupt();
    this.lastLive = undefined;
    const cues = [...(run.cues ?? [])].sort((a, b) => a.ms - b.ms);
    if (this.host.reducedMotion()) {
      // No motion: the figure jumps to where the run comes to rest, and the run's outcome is still reported.
      const end = run.at(run.durationMs);
      this.show(this.handBack(end.values), end.marks);
      this.live(end.live);
      const last = cues.at(-1);
      if (last) this.host.onCue?.(last);
      return Promise.resolve(true);
    }
    return new Promise<boolean>((resolve) => {
      this.playing = { run, cues, next: 0, start: undefined, done: resolve };
      const first = run.at(0);
      this.show(first.values, first.marks);
      this.live(first.live);
      this.host.wake();
    });
  };

  sweep = (): void => {
    if (this.host.reducedMotion() || this.sweeping) return;
    const range = this.host.sweepRange(this.values);
    if (!range || range.hi <= range.lo) return;
    this.interrupt();
    // Start the cosine where the slider already is, heading up, so the sweep never jumps.
    const f = Math.min(1, Math.max(0, ((this.values[range.id] ?? range.lo) - range.lo) / (range.hi - range.lo)));
    this.sweeping = { ...range, phase: (Math.acos(1 - 2 * f) / (2 * Math.PI)) * SWEEP_MS, start: undefined };
    this.host.wake();
  };

  stop = (): void => {
    this.interrupt();
  };

  subscribe = (fn: (values: Values) => void): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  /** True while something is still moving and wants the next frame. */
  get moving(): boolean {
    return this.playing !== undefined || this.sweeping !== undefined;
  }

  tick(now: number): boolean {
    const p = this.playing;
    if (p) {
      p.start ??= now;
      const ms = Math.min(now - p.start, p.run.durationMs);
      while (p.next < p.cues.length && p.cues[p.next]!.ms <= ms) this.host.onCue?.(p.cues[p.next++]!);
      const frame = p.run.at(ms);
      const end = ms >= p.run.durationMs;
      this.show(end ? this.handBack(frame.values) : frame.values, frame.marks);
      this.live(frame.live);
      if (end) {
        this.playing = undefined;
        p.done(true);
      }
    }
    const s = this.sweeping;
    if (s) {
      s.start ??= now - s.phase;
      const f = 0.5 - 0.5 * Math.cos((2 * Math.PI * (now - s.start)) / SWEEP_MS);
      this.values = { ...this.values, [s.id]: s.lo + (s.hi - s.lo) * f };
      this.show(this.values, undefined);
    }
    return this.moving;
  }

  private interrupt(): void {
    const p = this.playing;
    this.playing = undefined;
    this.sweeping = undefined;
    if (!p) return;
    // The run's values become the sliders' again, without its run-only poses.
    const values = this.handBack(this.values);
    if (values !== this.values) this.show(values, undefined);
    p.done(false);
  }

  /** `values` with every run-only pose back at its initial; the same object when none was off it. */
  private handBack(values: Values): Values {
    let out = values;
    for (const s of this.host.poses()) {
      if (values[s.id] === undefined || values[s.id] === s.initial) continue;
      if (out === values) out = { ...values };
      out[s.id] = s.initial;
    }
    return out;
  }

  private show(values: Values, marks: readonly Part[] | undefined): void {
    this.values = values;
    this.host.apply(values, marks);
    for (const fn of this.listeners) fn(values);
  }

  private live(text: string): void {
    if (text === this.lastLive) return;
    this.lastLive = text;
    this.host.onLive?.(text);
  }

  private clamp(id: string, value: number): number {
    const s = this.host.sliders().find((x) => x.id === id);
    return s ? Math.min(s.max, Math.max(s.min, value)) : value;
  }
}
