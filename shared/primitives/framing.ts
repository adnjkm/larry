import type { Part } from "../kit.ts";
import baked from "./framing.json" with { type: "json" };
import { type KitBounds, measurePoses } from "../bounds.ts";
import { type Primitive, type Slider, type Values, numberSlider, playBuild, playHandle, playMotion, playTuning, playValues, sliderSamples, startValues } from "./types.ts";

const FRAME_SAMPLES = 5;
/** mm. A turning part's reach peaks between samples. framing.test.ts checks a finer grid; 5 samples pass it with half this pad. */
const FRAME_PAD = 4;

/**
 * Every combination of `perSlider` evenly spread values of each slider, and one step in from each end. A figure can
 * change most just off an end: a push arrow that appears the moment the push leaves zero.
 */
export function poses(p: Primitive, perSlider: number): Values[] {
  return grid(p.sliders, perSlider);
}

/** Every combination of `perSlider` values of each of `sliders`, over `base`. */
function grid(sliders: readonly Slider[], perSlider: number, base: Values = {}): Values[] {
  return sliders.reduce<Values[]>((acc, s) => acc.flatMap((v) => samples(s, perSlider).map((x) => ({ ...v, [s.id]: x }))), [base]);
}

/** Free play's poses: its rest, with every slider it shows (and the one its handle drives) at `perSlider` values. */
function playPoses(p: Primitive, perSlider: number): Values[] {
  return grid([...playTuning(p), playMotion(p)], perSlider, playValues(p));
}

function samples(s: Slider, count: number): number[] {
  const inside = [s.min + s.step, s.max - s.step].filter((x) => x > s.min && x < s.max).map((x) => Number(x.toFixed(10)));
  return [...new Set([...sliderSamples(s, count), ...inside])].sort((a, b) => a - b);
}

const RUN_NUMBERS = 5;
const RUN_FRAMES = 24;

/**
 * What the figure shows during its game, sampled: the game's number at RUN_NUMBERS settings (the rest at the game's
 * start), each run at RUN_FRAMES moments, with the game's scene and the frame's marks. Empty without a game.
 */
export function runPoses(p: Primitive): Part[][] {
  const game = p.game;
  const start = startValues(p);
  const number = numberSlider(p);
  return sliderSamples(number, RUN_NUMBERS).flatMap((n) => {
    const run = game.play({ ...start, [number.id]: n });
    return Array.from({ length: RUN_FRAMES + 1 }, (_, i) => {
      const f = run.at((i / RUN_FRAMES) * run.durationMs);
      return [...p.build(f.values), ...(game.scene?.(f.values) ?? []), ...(f.marks ?? [])];
    });
  });
}

/** Moments of the ambient loop sampled for the framing. */
const AMBIENT_SAMPLES = 12;
const AMBIENT_SPAN_MS = 4000;

/**
 * What free play draws at `v`: the bare figure, with the hand's arrow (held) and the ambient loop's frames (any time).
 * Each is one pose for the framing.
 */
export function playFrames(p: Primitive, v: Values): Part[][] {
  const bare = playBuild(p)(v);
  const out = [bare];
  if (p.play?.hand) out.push([...bare, ...p.play.hand(v)]);
  const ambient = p.play?.ambient;
  if (ambient) for (let i = 0; i < AMBIENT_SAMPLES; i++) out.push([...bare, ...ambient(v, (i / AMBIENT_SAMPLES) * AMBIENT_SPAN_MS)]);
  return out;
}

const RELEASE_FROM = 5;
const RELEASE_FRAMES = 24;

/**
 * What the figure shows in free play beyond the sliders' own poses: each release, let go from RELEASE_FROM points
 * across the handle's reach at every grid setting of the other sliders, at RELEASE_FRAMES moments. Empty without one.
 */
export function releasePoses(p: Primitive): Part[][] {
  const release = p.play?.release;
  if (!release) return [];
  const motion = playMotion(p);
  const settings = grid(playTuning(p), FRAME_SAMPLES, playValues(p));
  return settings.flatMap((v) => {
    const [lo, hi] = p.play?.reach?.(v) ?? playHandle(p).reach?.(v) ?? [motion.min, motion.max];
    return Array.from({ length: RELEASE_FROM }, (_, i) => {
      const run = release({ ...v, [motion.id]: lo + ((hi - lo) * i) / (RELEASE_FROM - 1) });
      return Array.from({ length: RELEASE_FRAMES + 1 }, (_, k) => {
        const f = run.at((k / RELEASE_FRAMES) * run.durationMs);
        return [...playBuild(p)(f.values), ...(f.marks ?? [])];
      });
    }).flat();
  });
}

/** The bounds of every sampled pose together, grown by FRAME_PAD. The radius is an upper bound. */
function unionBounds(all: KitBounds[]): KitBounds {
  const minX = Math.min(...all.map((b) => b.centerX - b.halfX)) - FRAME_PAD;
  const maxX = Math.max(...all.map((b) => b.centerX + b.halfX)) + FRAME_PAD;
  const minZ = Math.min(...all.map((b) => b.centerZ - b.halfZ)) - FRAME_PAD;
  const maxZ = Math.max(...all.map((b) => b.centerZ + b.halfZ)) + FRAME_PAD;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  return {
    centerX,
    centerZ,
    minY: Math.min(...all.map((b) => b.minY)) - FRAME_PAD,
    maxY: Math.max(...all.map((b) => b.maxY)) + FRAME_PAD,
    radius: Math.max(...all.map((b) => b.radius + Math.hypot(b.centerX - centerX, b.centerZ - centerZ))) + FRAME_PAD,
    halfX: (maxX - minX) / 2,
    halfZ: (maxZ - minZ) / 2,
  };
}

/** What a figure shows: the primitive alone, worked by hand in free play, or with its game scene and runs. */
export type FigureMode = "still" | "play" | "game";

/**
 * Bounds that hold every pose the figure can show, so the camera holds still while a slider moves the parts or a run
 * plays. "still" (library pages and lessons): every pose the sliders reach. "game": those with the game's scene, and
 * every frame of its runs with their marks. "play": every slider pose, the rest pose, and every frame of the
 * releases. This is the sampling itself; `framePrimitive` reads its result from
 * framing.json, which scripts/generate-framing.ts writes.
 */
export function computeFraming(p: Primitive, mode: FigureMode): KitBounds {
  const settings = poses(p, FRAME_SAMPLES);
  if (mode === "play") return unionBounds(measurePoses([...playPoses(p, FRAME_SAMPLES).flatMap((v) => playFrames(p, v)), ...releasePoses(p)]));
  const still = settings.map(p.build);
  const scene = p.game?.scene;
  const game = mode === "game" ? [...(scene ? settings.map((v) => [...p.build(v), ...scene(v)]) : []), ...runPoses(p)] : [];
  return unionBounds(measurePoses([...still, ...game]));
}

/** The framing for a primitive and mode, from framing.json. Run `node scripts/generate-framing.ts` after adding or changing a primitive. */
export function framePrimitive(p: Primitive, mode: FigureMode = "still"): KitBounds {
  const known = (baked as Record<string, Record<FigureMode, KitBounds> | undefined>)[p.id]?.[mode];
  if (!known) throw new Error(`No ${mode} framing for "${p.id}" in framing.json; run \`node scripts/generate-framing.ts\``);
  return known;
}
