// The figure's values over time: set, play a Run, sweep. Pure: the stage calls tick(now) from its frame loop and
// receives every pose through `apply`, so this runs under node --test with a fake clock.
import type { Part } from "../../../shared/kit.ts";
import { clamp } from "../../../shared/primitives/motion/ease.ts";
import { sweepRun } from "../../../shared/primitives/motion/run.ts";
import { type Cue, type Primitive, type Run, type Slider, type Values, allSliders } from "../../../shared/primitives/types.ts";

/**
 * What a page drives a figure with: FigureStage's `controllerRef`, a new one whenever the primitive, mode or palette
 * changes. Setting values never renders React; the figure is posed from here.
 */
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
  /**
   * Plays a run from at(0) to at(durationMs). Resolves true when it finishes, false if a set, drag, stop or another play
   * interrupts it. The figure stays on the run's last frame (props included) until the next set or play. Under reduced
   * motion it jumps to at(durationMs), reports that frame's live text and the last cue, and resolves true.
   */
  play(run: Run): Promise<boolean>;
  /** The play sweep (sweepRun): the handle's slider across its reach and back, starting from where it is, until stopped. Does nothing under reduced motion. */
  sweep(): void;
  /** Stops a run or sweep, leaving the figure where it is. */
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
  onLive?(text: string): void;
  onCue?(cue: Cue): void;
};

type Playing = { run: Run; cues: Cue[]; next: number; start: number | undefined; done: (finished: boolean) => void };
type Sweeping = { at: (ms: number) => Values; start: number | undefined };

export class Motion implements StageController {
  private values: Values;
  private playing: Playing | undefined;
  private sweeping: Sweeping | undefined;
  private lastLive: string | undefined;
  private readonly listeners = new Set<(values: Values) => void>();
  private readonly host: MotionHost;
  private readonly primitive: Primitive;
  private readonly sliders: ReadonlyMap<string, Slider>;

  constructor(host: MotionHost, primitive: Primitive, initial: Values) {
    this.host = host;
    this.primitive = primitive;
    this.sliders = new Map(allSliders(primitive).map((s) => [s.id, s]));
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
    const run = sweepRun(this.primitive, this.values);
    if (!run.moves) return;
    this.interrupt();
    this.sweeping = { at: (ms) => run.at(ms).values, start: undefined };
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
      s.start ??= now;
      this.show(s.at(now - s.start), undefined);
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
    for (const s of this.primitive.game.poses ?? []) {
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
    const s = this.sliders.get(id);
    return s ? clamp(value, s.min, s.max) : value;
  }
}
