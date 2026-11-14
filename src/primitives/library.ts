import type { Part } from "../../shared/kit.ts";
import { type KitBounds, measurePoses } from "../kit3d/buildKit.ts";
import { ELEMENTS } from "./elements.ts";
import { MECHANISMS } from "./mechanisms.ts";
import { box, look, part, v3 } from "./parts.ts";
import type { Primitive, Slider, Values } from "./types.ts";

export type { Primitive, Readout, Slider, Values } from "./types.ts";

export const PRIMITIVES: Primitive[] = [...ELEMENTS, ...MECHANISMS];

export const initialValues = (p: Primitive): Values => Object.fromEntries(p.sliders.map((s) => [s.id, s.initial]));

const FRAME_SAMPLES = 11;
/** mm. A turning part's reach peaks between samples; at 11 samples that is under 2 mm on the largest wheel or gear. */
const FRAME_PAD = 2;

/** `count` values spread from a slider's min to its max, each on the slider's own step grid. */
function sliderSamples(s: Slider, count: number): number[] {
  const steps = Math.round((s.max - s.min) / s.step);
  return [...new Set(Array.from({ length: count }, (_, i) => Math.round((i * steps) / (count - 1))))].map((k) => s.min + k * s.step);
}

/** Every combination of `perSlider` evenly spread values of each slider. */
export function poses(p: Primitive, perSlider: number): Values[] {
  return p.sliders.reduce<Values[]>((acc, s) => acc.flatMap((v) => sliderSamples(s, perSlider).map((x) => ({ ...v, [s.id]: x }))), [{}]);
}

/** A speck at `at`: it takes part in measuring but is too small to see. */
const speck = (i: number, at: [number, number, number]) => part(`frame-${i}`, "Frame mark", "Marks the edge of the camera's framing.", box(0.01, 0.01, 0.01), v3(...at), look.structure);

/** Five specks whose bounds, including the radius round the footprint's centre, are exactly `b`. */
function specksFor(b: KitBounds): Part[] {
  const { centerX: cx, centerZ: cz, minY, maxY, halfX, halfZ } = b;
  const radius = Math.min(b.radius, Math.hypot(halfX, halfZ));
  return [
    speck(0, [cx - halfX, minY, cz]),
    speck(1, [cx + halfX, maxY, cz]),
    speck(2, [cx, minY, cz - halfZ]),
    speck(3, [cx, maxY, cz + halfZ]),
    speck(4, [cx + halfX, minY, cz + Math.sqrt(Math.max(0, radius * radius - halfX * halfX))]),
  ];
}

/** The bounds of every sampled pose together, grown by FRAME_PAD. The radius is an upper bound. */
function unionBounds(all: KitBounds[]): KitBounds {
  const minX = Math.min(...all.map((b) => b.centerX - b.halfX)) - FRAME_PAD;
  const maxX = Math.max(...all.map((b) => b.centerX + b.halfX)) + FRAME_PAD;
  const minZ = Math.min(...all.map((b) => b.centerZ - b.halfZ)) - FRAME_PAD;
  const maxZ = Math.max(...all.map((b) => b.centerZ + b.halfZ)) + FRAME_PAD;
  const centerX = (minX + maxX) / 2;
  const centerZ = (minZ + maxZ) / 2;
  const radius = Math.max(...all.map((b) => b.radius + Math.hypot(b.centerX - centerX, b.centerZ - centerZ))) + FRAME_PAD;
  return {
    centerX,
    centerZ,
    minY: Math.min(...all.map((b) => b.minY)) - FRAME_PAD,
    maxY: Math.max(...all.map((b) => b.maxY)) + FRAME_PAD,
    radius,
    halfX: (maxX - minX) / 2,
    halfZ: (maxZ - minZ) / 2,
  };
}

const framing = new Map<string, Part[]>();

/**
 * Parts that measure the same as every pose the sliders can reach, so the camera holds still while a slider moves the parts.
 * Built once per primitive from a grid of poses, because measuring a pose builds all of its geometry.
 */
export function framingParts(p: Primitive): Part[] {
  let parts = framing.get(p.id);
  if (!parts) {
    parts = specksFor(unionBounds(measurePoses(poses(p, FRAME_SAMPLES).map(p.build))));
    framing.set(p.id, parts);
  }
  return parts;
}

export const formatSlider = (s: Slider, value: number) => {
  const shown = value * (s.displayScale ?? 1);
  return `${shown.toFixed(s.step * (s.displayScale ?? 1) < 1 ? 1 : 0)}${s.unit ?? ""}`;
};
