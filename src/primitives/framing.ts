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
 * Bounds that hold every pose the sliders can reach, so the camera holds still while a slider moves the parts.
 * Built once per primitive from a grid of poses, because measuring a pose builds all of its geometry.
 */
export function framePrimitive(p: Primitive): KitBounds {
  let bounds = cache.get(p.id);
  if (!bounds) {
    bounds = unionBounds(measurePoses(poses(p, FRAME_SAMPLES).map(p.build)));
    cache.set(p.id, bounds);
  }
  return bounds;
}
