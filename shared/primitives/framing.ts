import type { Part } from "../kit.ts";
import baked from "./framing.json" with { type: "json" };
import { type KitBounds, measurePoses } from "../bounds.ts";
import { type Primitive, type Values, numberSlider, sliderSamples, startValues } from "./types.ts";

const FRAME_SAMPLES = 5;
/** mm. A turning part's reach peaks between samples. framing.test.ts checks a finer grid; 5 samples pass it with half this pad. */
const FRAME_PAD = 4;

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

/** What a figure shows: the primitive alone, or with its game scene and runs. */
export type FigureMode = "still" | "game";

/**
 * Bounds that hold every pose the figure can show, so the camera holds still while a slider moves the parts or a run
 * plays. "still" (library pages and lessons): every pose the sliders reach. "game": those with the game's scene, and
 * every frame of its runs with their marks. This is the sampling itself; `framePrimitive` reads its result from
 * framing.json, which scripts/generate-framing.ts writes.
 */
export function computeFraming(p: Primitive, mode: FigureMode): KitBounds {
  const grid = poses(p, FRAME_SAMPLES);
  const still = grid.map(p.build);
  const scene = p.game?.scene;
  const game = mode === "game" ? [...(scene ? grid.map((v) => [...p.build(v), ...scene(v)]) : []), ...runPoses(p)] : [];
  return unionBounds(measurePoses([...still, ...game]));
}

/** The framing for a primitive and mode, from framing.json. Run `node scripts/generate-framing.ts` after adding or changing a primitive. */
export function framePrimitive(p: Primitive, mode: FigureMode = "still"): KitBounds {
  const known = (baked as Record<string, Record<FigureMode, KitBounds> | undefined>)[p.id]?.[mode];
  if (!known) throw new Error(`No ${mode} framing for "${p.id}" in framing.json; run \`node scripts/generate-framing.ts\``);
  return known;
}
