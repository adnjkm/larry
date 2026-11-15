// Resizing a kit: every length in every part, by one factor, then a shift. Angles, turns and colours stay.
import type { Kit, Part, Shape } from "../../../shared/kit.ts";

export type Vec = { x: number; y: number; z: number };

export function scaleShape(shape: Shape, s: number): Shape {
  switch (shape.kind) {
    case "lathe":
      return { kind: "lathe", profile: shape.profile.map((p) => ({ r: p.r * s, y: p.y * s })) };
    case "box":
      return { kind: "box", width: shape.width * s, height: shape.height * s, depth: shape.depth * s, cornerRadius: shape.cornerRadius * s };
    case "torus":
      return { kind: "torus", radius: shape.radius * s, tube: shape.tube * s, arcDegrees: shape.arcDegrees };
    case "helix":
      return { kind: "helix", radius: shape.radius * s, tube: shape.tube * s, length: shape.length * s, turns: shape.turns };
    case "extrusion":
      return { kind: "extrusion", outline: shape.outline.map((p) => ({ x: p.x * s, y: p.y * s })), depth: shape.depth * s };
  }
}

/** Part `p` scaled by `s` about the origin, then moved by `shift`. */
export function scalePart(p: Part, s: number, shift: Vec = { x: 0, y: 0, z: 0 }): Part {
  return { ...p, shape: scaleShape(p.shape, s), position: { x: p.position.x * s + shift.x, y: p.position.y * s + shift.y, z: p.position.z * s + shift.z } };
}

export const scaleKit = (kit: Kit, s: number, shift?: Vec): Kit => ({ ...kit, parts: kit.parts.map((p) => scalePart(p, s, shift)) });

/** Every number in a value rounded to `places`, so a kit written to a file reads cleanly. */
export function rounded<T>(value: T, places = 3): T {
  const k = 10 ** places;
  return JSON.parse(JSON.stringify(value, (_, v: unknown) => (typeof v === "number" ? Math.round(v * k) / k : v))) as T;
}
