// The primitives library: 8 elements and 9 mechanisms, each a small parametric kit drawn with the
// same shapes and dither shader as a scanned kit. See types.ts for what each level means.
import type { Part } from "../../shared/kit.ts";
import { ELEMENTS } from "./elements.ts";
import { MECHANISMS } from "./mechanisms.ts";
import type { Primitive, Slider, Values } from "./types.ts";

export type { Primitive, Readout, Slider, Values } from "./types.ts";

export const PRIMITIVES: Primitive[] = [...ELEMENTS, ...MECHANISMS];

export const initialValues = (p: Primitive): Values => Object.fromEntries(p.sliders.map((s) => [s.id, s.initial]));

/** Parts at every combination of slider extremes. The camera fits these once, so it holds still while a slider moves the parts. */
export function framingParts(p: Primitive): Part[] {
  const combos = p.sliders.reduce<Values[]>((acc, s) => acc.flatMap((v) => [{ ...v, [s.id]: s.min }, { ...v, [s.id]: s.max }]), [{}]);
  return combos.flatMap((v, i) => p.build(v).map((part) => ({ ...part, id: `${part.id}~${i}` })));
}

export const formatSlider = (s: Slider, value: number) => {
  const shown = value * (s.displayScale ?? 1);
  return `${shown.toFixed(s.step * (s.displayScale ?? 1) < 1 ? 1 : 0)}${s.unit ?? ""}`;
};
