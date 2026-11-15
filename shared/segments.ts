// The segment counts and rounding src/kit3d/geometry.ts builds with. bounds.ts samples at the same vertices and
// src/primitives/stage/shapes.ts decides from the same counts whether a mesh can be stretched.
import type { Shape } from "./kit.ts";
import { DEG_TO_RAD } from "./angles.ts";

export const LATHE_SEGMENTS = 40;

/** The arc a torus covers, in radians. */
export const torusArc = (arcDegrees: number) => Math.min(arcDegrees, 360) * DEG_TO_RAD;

/** Segments along a torus's arc. */
export const torusSegments = (arcDegrees: number) => Math.max(8, Math.ceil((48 * torusArc(arcDegrees)) / (2 * Math.PI)));

/** Segments along a coil's wire. */
export const helixSegments = (turns: number) => Math.max(8, Math.ceil(turns * 20));

/** A box's corner radius after it is held to half its thinnest side. */
export const boxRadius = (s: Extract<Shape, { kind: "box" }>) => Math.max(0, Math.min(s.cornerRadius, Math.min(s.width, s.height, s.depth) / 2));
