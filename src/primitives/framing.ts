import type { Part } from "../../shared/kit.ts";
import { type KitBounds, measurePoses } from "../kit3d/buildKit.ts";
import type { Primitive, Slider, Values } from "./types.ts";

const FRAME_SAMPLES = 5;
/** mm. A turning part's reach peaks between samples. The framing test checks a finer grid; 5 samples pass it with half this pad. */
const FRAME_PAD = 4;

/** `count` values spread from a slider's min to its max, each on the slider's own step grid. */
function sliderSamples(s: Slider, count: number): number[] {
  const steps = Math.round((s.max - s.min) / s.step);
  return [...new Set(Array.from({ length: count }, (_, i) => Math.round((i * steps) / (count - 1))))].map((k) => s.min + k * s.step);
}

/** Every combination of `perSlider` evenly spread values of each slider. */
export function poses(p: Primitive, perSlider: number): Values[] {
  return p.sliders.reduce<Values[]>((acc, s) => acc.flatMap((v) => sliderSamples(s, perSlider).map((x) => ({ ...v, [s.id]: x }))), [{}]);
}

const RUN_NUMBERS = 5;
const RUN_FRAMES = 24;

/**
 * What the figure shows during its game, sampled: the game's number at RUN_NUMBERS settings (the rest at the game's
 * start), each run at RUN_FRAMES moments, with the game's scene and the frame's marks. Empty without a game.
 */
export function runPoses(p: Primitive): Part[][] {
  const game = p.game;
  if (!game) return [];
  const start: Values = { ...Object.fromEntries(p.sliders.map((s) => [s.id, s.initial])), ...game.start };
  const number = [...p.sliders, ...(game.controls ?? [])].find((s) => s.id === game.number);
  if (!number) return [];
  return sliderSamples(number, RUN_NUMBERS).flatMap((n) => {
    const run = game.play({ ...start, [number.id]: n });
    return Array.from({ length: RUN_FRAMES + 1 }, (_, i) => {
      const f = run.at((i / RUN_FRAMES) * run.durationMs);
      return [...p.build(f.values), ...(game.scene?.(f.values) ?? []), ...(f.marks ?? [])];
    });
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

const cache = new Map<string, KitBounds>();

/**
 * Bounds that hold every pose the figure can show, so the camera holds still while a slider moves the parts or a run
 * plays. "still" (library pages and lessons): every pose the sliders reach. "game": those with the game's scene, and
 * every frame of its runs with their marks. Built once per primitive and mode from a grid of poses, because measuring a
 * pose builds all of its geometry.
 */
export function framePrimitive(p: Primitive, mode: "still" | "game" = "still"): KitBounds {
  const key = `${p.id}:${mode}`;
  let bounds = cache.get(key);
  if (!bounds) {
    const grid = poses(p, FRAME_SAMPLES);
    const still = grid.map(p.build);
    const scene = p.game?.scene;
    const game = mode === "game" ? [...(scene ? grid.map((v) => [...p.build(v), ...scene(v)]) : []), ...runPoses(p)] : [];
    bounds = unionBounds(measurePoses([...still, ...game]));
    cache.set(key, bounds);
  }
  return bounds;
}
