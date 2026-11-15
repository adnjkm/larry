// Helpers the first-pass models still use, kept so their figures did not change when they moved to one file each.
// A model rewritten to the design language uses parts.ts instead (`arrow`, `pin`, `plate`, ...). Delete this file when
// nothing imports it.
import type { Part } from "../../shared/kit.ts";
import { cylinder, look, part, pivoted, v3, type Attach, type Look, type Pt, type Vec } from "./parts.ts";

/** The first-pass base thickness. */
export const BASE_T = 6;

/** Outline of a force arrow pointing along +x with its tail at the origin. Proportions shrink for very short arrows. */
function arrowOutline(length: number): Pt[] {
  const head = Math.min(9, length * 0.6);
  const shaft = Math.min(1.8, length * 0.15);
  const wing = Math.min(5, length * 0.4);
  return [[0, -shaft], [length - head, -shaft], [length - head, -wing], [length, 0], [length - head, wing], [length - head, shaft], [0, shaft]];
}

/** The first-pass force arrow: tail at `tail`, pointing along `angleDeg` (0 = +x, 90 = up, -90 = down), `length` mm long. Replaced by parts.ts `arrow`. */
export function legacyArrow(id: string, name: string, role: string, parentId: string, tail: Vec, angleDeg: number, length: number): Part {
  const a = pivoted(arrowOutline(Math.max(length, 0.5)), 4, [0, 0], tail, angleDeg);
  return part(id, name, role, a.shape, a.position, look.accent, { parentId, joint: "glue" }, a.rotation);
}

/** The first-pass pin or axle lying along z, centred at `at`, any radius. Replaced by parts.ts `pin`. */
export function legacyPin(id: string, name: string, role: string, r: number, len: number, at: Vec, appearance: Look, attach: Attach | null): Part {
  return part(id, name, role, cylinder(r, len).shape, at, appearance, attach, v3(90, 0, 0));
}
