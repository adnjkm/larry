// Shared building blocks for primitives: the Synthwave palette and helpers that turn simple
// geometry into kit parts (lathe, box, torus, extrusion), positioned the way KitViewer expects.
// Units are millimetres, y up, resting on y = 0.
import type { Finish, Joint, Part, Shape } from "../../shared/kit.ts";

/** The Synthwave preset from iamnoman.com/funky-shadow, darkest to brightest. */
export const SYNTHWAVE = ["#000023", "#23005f", "#8700af", "#ff0087", "#ff5f37", "#ffd700"] as const;

/**
 * Part colours, all from Synthwave. Every primitive has exactly one `focus` part: the piece the
 * primitive is about. `structure` is for frames, bases and housings; `second` and `third` tell
 * other moving pieces apart; `light` is a pale tint for large passive surfaces.
 */
export const COLOR = {
  focus: "#ff0087",
  second: "#ff5f37",
  third: "#ffd700",
  purple: "#8700af",
  structure: "#23005f",
  light: "#f3e9ff",
} as const;

export type Look = { color: string; finish: Finish };
export const look = {
  focus: { color: COLOR.focus, finish: "matte" },
  focusMetal: { color: COLOR.focus, finish: "metal" },
  focusRubber: { color: COLOR.focus, finish: "rubber" },
  second: { color: COLOR.second, finish: "matte" },
  third: { color: COLOR.third, finish: "matte" },
  purple: { color: COLOR.purple, finish: "matte" },
  purpleMetal: { color: COLOR.purple, finish: "metal" },
  structure: { color: COLOR.structure, finish: "matte" },
  light: { color: COLOR.light, finish: "matte" },
} satisfies Record<string, Look>;

export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;

export type Vec = { x: number; y: number; z: number };
export const v3 = (x: number, y: number, z = 0): Vec => ({ x, y, z });
export const ZERO = v3(0, 0, 0);
export type Pt = [number, number];

export function part(
  id: string,
  name: string,
  role: string,
  shape: Shape,
  position: Vec,
  appearance: Look,
  attach: { parentId: string; joint: Joint } | null = null,
  rotation: Vec = ZERO,
): Part {
  return { id, name, role, parentId: attach?.parentId ?? null, joint: attach?.joint ?? null, shape, position, rotation, ...appearance };
}

/**
 * A lathe shape from [r, y] points (bottom to top, revolved about y), plus `midY`: the viewer
 * recentres a lathe on its bounding box, so place it at v3(0, midY) to keep the profile's own heights.
 * Close a hollow profile by returning to its first point.
 */
export function lathe(points: Pt[]): { shape: Shape; midY: number } {
  const ys = points.map(([, y]) => y);
  return { shape: { kind: "lathe", profile: points.map(([r, y]) => ({ r, y })) }, midY: (Math.min(...ys) + Math.max(...ys)) / 2 };
}

/** A solid cylinder from y = 0 to h; place it at midY + base. Rotate x = 90 to lay it along z, z = 90 along x. */
export const cylinder = (r: number, h: number) => lathe([[0, 0], [r, 0], [r, h], [0, h]]);

export const box = (width: number, height: number, depth: number, cornerRadius = 0): Shape => ({ kind: "box", width, height, depth, cornerRadius });

/** A torus lying flat in x-z, centred on its position. Rotation x = 90 stands it up facing the camera. */
export const ring = (radius: number, tube: number, arcDegrees = 360): Shape => ({ kind: "torus", radius, tube, arcDegrees });

/**
 * An extrusion (outline drawn in x-y, pushed back along z by `depth`) that turns about a pivot.
 * The viewer recentres extrusions on their bounding box and rotates about that centre, so the
 * position has to carry the pivot-to-centre offset, rotated. Spread the result into part().
 */
export function pivoted(outline: Pt[], depth: number, pivotLocal: Pt, pivotWorld: Vec, angleDeg: number) {
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2 - pivotLocal[0];
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2 - pivotLocal[1];
  const a = angleDeg * RAD;
  return {
    shape: { kind: "extrusion", outline: outline.map(([x, y]) => ({ x, y })), depth } satisfies Shape,
    position: v3(pivotWorld.x + cx * Math.cos(a) - cy * Math.sin(a), pivotWorld.y + cx * Math.sin(a) + cy * Math.cos(a), pivotWorld.z),
    rotation: v3(0, 0, angleDeg),
  };
}

/** Where a point given in a frame rotated by `angleDeg` about z (origin at `pivotWorld`) lands in the world. */
export function rotateAbout(local: Pt, angleDeg: number, pivotWorld: Vec): Vec {
  const a = angleDeg * RAD;
  return v3(pivotWorld.x + local[0] * Math.cos(a) - local[1] * Math.sin(a), pivotWorld.y + local[0] * Math.sin(a) + local[1] * Math.cos(a), pivotWorld.z);
}

/** A straight bar (box) from point a to point b in the x-y plane, `thick` wide and `depth` deep. */
export function bar(a: Pt, b: Pt, thick: number, depth: number, z = 0): { shape: Shape; position: Vec; rotation: Vec } {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return {
    shape: box(len, thick, depth, Math.min(thick, depth) / 2 - 0.01),
    position: v3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z),
    rotation: v3(0, 0, Math.atan2(b[1] - a[1], b[0] - a[0]) * DEG),
  };
}

/** A regular polygon outline, e.g. 6 for a hex nut seen from above. */
export const polygon = (sides: number, r: number, startDeg = 0): Pt[] =>
  Array.from({ length: sides }, (_, i) => {
    const a = (startDeg + (i * 360) / sides) * RAD;
    return [r * Math.cos(a), r * Math.sin(a)];
  });

/** Spur gear outline, centred on 0,0, first tooth on +x. */
export function gearOutline(teeth: number, module: number): Pt[] {
  const pitchR = (module * teeth) / 2;
  const tipR = pitchR + module;
  const rootR = pitchR - 1.25 * module;
  const step = (2 * Math.PI) / teeth;
  const pts: Pt[] = [];
  for (let k = 0; k < teeth; k++) {
    const a = k * step;
    const at = (r: number, f: number): Pt => [r * Math.cos(a + f * step), r * Math.sin(a + f * step)];
    pts.push(at(rootR, -0.5), at(rootR, -0.24), at(tipR, -0.12), at(tipR, 0.12), at(rootR, 0.24));
  }
  return pts;
}

export const fmt = (n: number, digits = 0) => n.toFixed(digits);
