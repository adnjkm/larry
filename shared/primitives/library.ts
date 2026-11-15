import { ELEMENTS } from "./elements.ts";
import { MECHANISMS } from "./mechanisms.ts";
import type { Primitive, Slider, Values } from "./types.ts";

export type { Primitive, Readout, Slider, Values } from "./types.ts";

export const PRIMITIVES: Primitive[] = [...ELEMENTS, ...MECHANISMS];

export const initialValues = (p: Primitive): Values => Object.fromEntries(p.sliders.map((s) => [s.id, s.initial]));

export const formatSlider = (s: Slider, value: number) => {
  const shown = value * (s.displayScale ?? 1);
  return `${shown.toFixed(s.step * (s.displayScale ?? 1) < 1 ? 1 : 0)}${s.unit ?? ""}`;
};
