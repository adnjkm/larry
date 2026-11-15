// Shared building blocks for primitives: the Synthwave palette and helpers that turn simple
// geometry into kit parts. Units are millimetres, y up, resting on y = 0.
import type { Finish, Joint, Part, Shape } from "../kit.ts";
import { DEG_TO_RAD, RAD_TO_DEG } from "../angles.ts";
// Pure TypeScript: no three, no React. Runs in Node tests and on the server.

/** The Synthwave preset from iamnoman.com/funky-shadow, darkest to brightest. */
export const SYNTHWAVE = ["#000023", "#23005f", "#8700af", "#ff0087", "#ff5f37", "#ffd700"] as const;

/**
 * Part colours. Components are neutral greys; only the piece a primitive is about gets the pink
 * accent (`focus`), the way a diagram highlights one thing. Synthwave itself is for the shadow
 * (see createShadowMaterial). `accent` is a quieter purple for annotations such as force arrows.
 */
export const COLOR = {
  focus: "#ff0087",
  accent: "#8700af",
  steel: "#a9adb3",
  stone: "#d3d1cc",
  slate: "#7d8188",
  structure: "#2e2e30",
  light: "#ecebe7",
} as const;

export type Look = { color: string; finish: Finish };
export const look = {
  focus: { color: COLOR.focus, finish: "matte" },
  focusMetal: { color: COLOR.focus, finish: "metal" },
  focusRubber: { color: COLOR.focus, finish: "rubber" },
  accent: { color: COLOR.accent, finish: "matte" },
  steel: { color: COLOR.steel, finish: "metal" },
  stone: { color: COLOR.stone, finish: "matte" },
  slate: { color: COLOR.slate, finish: "matte" },
  structure: { color: COLOR.structure, finish: "matte" },
  light: { color: COLOR.light, finish: "matte" },
} satisfies Record<string, Look>;


export type Vec = { x: number; y: number; z: number };
export const v3 = (x: number, y: number, z = 0): Vec => ({ x, y, z });
const ZERO = v3(0, 0, 0);
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
 * A lathe shape from [r, y] points (bottom to top, revolved about y), plus `midY`, the middle of the
 * profile's height: place the part at v3(0, midY) to keep the profile's own heights.
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

/** A coil along y, `length` tall including the wire. */
export const coil = (radius: number, tube: number, length: number, turns: number): Shape => ({ kind: "helix", radius, tube, length, turns });

/**
 * An extrusion that turns about a pivot. A part rotates about its own centre, so the position
 * carries the pivot-to-centre offset, rotated. Spread the result into part().
 */
export function pivoted(outline: Pt[], depth: number, pivotLocal: Pt, pivotWorld: Vec, angleDeg: number) {
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2 - pivotLocal[0];
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2 - pivotLocal[1];
  const a = angleDeg * DEG_TO_RAD;
  return {
    shape: { kind: "extrusion", outline: outline.map(([x, y]) => ({ x, y })), depth } satisfies Shape,
    position: v3(pivotWorld.x + cx * Math.cos(a) - cy * Math.sin(a), pivotWorld.y + cx * Math.sin(a) + cy * Math.cos(a), pivotWorld.z),
    rotation: v3(0, 0, angleDeg),
  };
}

/** Where a point given in a frame rotated by `angleDeg` about z (origin at `pivotWorld`) lands in the world. */
export function rotateAbout(local: Pt, angleDeg: number, pivotWorld: Vec): Vec {
  const a = angleDeg * DEG_TO_RAD;
  return v3(pivotWorld.x + local[0] * Math.cos(a) - local[1] * Math.sin(a), pivotWorld.y + local[0] * Math.sin(a) + local[1] * Math.cos(a), pivotWorld.z);
}

/** A straight bar (box) from point a to point b in the x-y plane, `thick` wide and `depth` deep. */
export function bar(a: Pt, b: Pt, thick: number, depth: number, z = 0): { shape: Shape; position: Vec; rotation: Vec } {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  return {
    shape: box(len, thick, depth, Math.min(thick, depth) / 2 - 0.01),
    position: v3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z),
    rotation: v3(0, 0, Math.atan2(b[1] - a[1], b[0] - a[0]) * RAD_TO_DEG),
  };
}

/** A regular polygon outline, e.g. 6 for a hex nut seen from above. */
export const polygon = (sides: number, r: number, startDeg = 0): Pt[] =>
  Array.from({ length: sides }, (_, i) => {
    const a = (startDeg + (i * 360) / sides) * DEG_TO_RAD;
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

// ---------------------------------------------------------------------------------------------------------------
// The figure design language (src/primitives/docs/design-language.md) as helpers. Every figure stands on `plate()`, holds itself
// up with `post()` / `beam()` / `pin()`, is grabbed at one `knob()` / `pushDisc()` / `pullRing()`, carries loads as
// `loadBlock()`, shows forces with `arrow()` and travel with `tick()` / `travelArc()`.
// ---------------------------------------------------------------------------------------------------------------

export type Attach = { parentId: string; joint: Joint };
export const on = (parentId: string, joint: Joint): Attach => ({ parentId, joint });

/** A part's words, and what it hangs off. Each helper has defaults, so only what differs needs saying. */
type PartOpts = { name?: string; role?: string; on?: Attach | null };

/** Every figure's base plate is this thick, so its top face is at y = PLATE_TOP. */
export const PLATE_T = 6;
export const PLATE_TOP = 6;
/** The plate reaches this far past the rig on every side. */
export const PLATE_MARGIN = 12;

/** The base plate: the one root part, id "plate", centred on x = 0, z = 0, `PLATE_MARGIN` past a rig `width` x `depth`. */
export function plate(width: number, depth: number, opts: PartOpts = {}): Part {
  return part(
    "plate",
    opts.name ?? "Base plate",
    opts.role ?? "Holds the rig.",
    box(width + 2 * PLATE_MARGIN, PLATE_T, depth + 2 * PLATE_MARGIN, 2),
    v3(0, PLATE_T / 2, 0),
    look.structure,
    null,
  );
}

const ground = (opts: PartOpts): Attach | null => (opts.on === undefined ? on("plate", "weld") : opts.on);

/** A post standing on the plate: 10 wide (x) by 8 deep (z), from `bottom` up to `top`. */
export function post(id: string, x: number, z: number, top: number, opts: PartOpts & { bottom?: number } = {}): Part {
  const bottom = opts.bottom ?? PLATE_TOP;
  return part(id, opts.name ?? "Post", opts.role ?? "Holds the rig up.", box(10, top - bottom, 8, 1), v3(x, (top + bottom) / 2, z), look.structure, ground(opts));
}

/**
 * A straight square bar from `a` to `b` anywhere in 3D: `thick` by `thick` in section, a little longer than the gap so
 * a chain of them closes up at the bends. Spread the result into part().
 */
export function strand(a: Vec, b: Vec, thick: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  return {
    shape: box(len + thick * 0.8, thick, thick, thick / 2 - 0.01),
    position: v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2),
    // Euler XYZ with x = 0 is yaw (about y) applied after pitch (about z): lines the box's x axis up with the strand.
    rotation: v3(0, Math.atan2(-dz, dx) * RAD_TO_DEG, Math.asin(Math.max(-1, Math.min(1, dy / len))) * RAD_TO_DEG),
  };
}

/** A beam: an 8 x 8 bar of structure from `a` to `b` (centre lines), ends flush with the points. */
export function beam(id: string, a: Vec, b: Vec, opts: PartOpts = {}): Part {
  const s = strand(a, b, 8);
  const len = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
  return part(id, opts.name ?? "Beam", opts.role ?? "Carries the part above it.", box(len, 8, 8, 1), s.position, look.structure, ground(opts), s.rotation);
}

/** A pin or axle lying along z, centred on `at`: radius 3, or 4 when it carries the load. */
export function pin(id: string, at: Vec, length: number, opts: PartOpts & { load?: boolean; look?: Look } = {}): Part {
  const r = opts.load ? 4 : 3;
  return part(id, opts.name ?? "Pin", opts.role ?? "The part turns on it.", cylinder(r, length).shape, at, opts.look ?? look.structure, ground(opts), v3(90, 0, 0));
}

/** Euler rotation that lays a lathe (built along y) along `axis`. */
const along = (axis: "x" | "y" | "z"): Vec => (axis === "x" ? v3(0, 0, 90) : axis === "z" ? v3(90, 0, 0) : v3(0, 0, 0));

/** The turning handle: a light knob, radius 5.5 and 20 long, centred on `centre` (the point `handle.at` returns), its axis along `axis`. */
export function knob(id: string, centre: Vec, axis: "x" | "y" | "z" = "z", opts: PartOpts = {}): Part {
  const k = lathe([[0, 0], [4.7, 0], [5.5, 0.8], [5.5, 19.2], [4.7, 20], [0, 20]]);
  return part(id, opts.name ?? "Knob", opts.role ?? "Where your hand turns it.", k.shape, centre, look.light, ground(opts), along(axis));
}

/** The pushing handle: a light disc, radius 15 and 4 thick, centred on `centre`, its face square to `axis`. */
export function pushDisc(id: string, centre: Vec, axis: "x" | "y" | "z" = "y", opts: PartOpts = {}): Part {
  return part(id, opts.name ?? "Push plate", opts.role ?? "Where your hand pushes.", cylinder(15, 4).shape, centre, look.light, ground(opts), along(axis));
}

/** The pulling handle: a light ring, radius 6 with a tube of 2, centred on `centre`, standing in the x-y plane facing the camera. */
export function pullRing(id: string, centre: Vec, opts: PartOpts = {}): Part {
  return part(id, opts.name ?? "Pull ring", opts.role ?? "Where your hand pulls.", ring(6, 2), centre, look.light, ground(opts), v3(90, 0, 0));
}

/** Every arrow is at least this long, and its tip or tail stands this far off the part it acts on. */
export const ARROW_MIN = 12;
export const ARROW_GAP = 4;
/** About the longest arrow a figure draws over its slider range. */
const ARROW_LONGEST = 40;

/**
 * Length of a force's arrow when the figure's largest force over its slider range is `largest`:
 * 0 for no force (not drawn), otherwise in proportion and never under ARROW_MIN.
 */
export const arrowLength = (force: number, largest: number, longest = ARROW_LONGEST) => (force <= 1e-9 ? 0 : Math.max(ARROW_MIN, (longest * force) / largest));

/** Arrow outline along +x, tail at the origin: shaft 4 wide, head 10 long and 10 wide. */
function arrowOutline(length: number): Pt[] {
  const head = 10;
  return [[0, -2], [length - head, -2], [length - head, -5], [length, 0], [length - head, 5], [length - head, 2], [0, 2]];
}

/**
 * The one force arrow, purple, 4 deep, in the x-y plane. `at` is the point on the part the force acts on; the arrow
 * points along `angleDeg` (0 = +x, 90 = up, -90 = down) and stands ARROW_GAP clear of it:
 * - "push": the arrow comes in and its tip stops short of `at`;
 * - "pull": the arrow leaves `at`, tail first.
 * Returns [] for length 0 (no force, no arrow). Any other length is raised to ARROW_MIN.
 * Ids of arrows contain "arrow"; nothing else in a figure is purple.
 */
export function arrow(id: string, at: Vec, angleDeg: number, length: number, kind: "push" | "pull", opts: PartOpts = {}): Part[] {
  if (!(length > 1e-9)) return [];
  const len = Math.max(ARROW_MIN, length);
  const a = angleDeg * DEG_TO_RAD;
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const back = kind === "push" ? -(ARROW_GAP + len) : ARROW_GAP;
  const tail = v3(at.x + ux * back, at.y + uy * back, at.z);
  const p = pivoted(arrowOutline(len), 4, [0, 0], tail, angleDeg);
  return [part(id, opts.name ?? "Arrow", opts.role ?? "A force, drawn to the figure's scale.", p.shape, p.position, look.accent, ground(opts), p.rotation)];
}

/** Edge of a load's cube from its weight: the cube root, so a load 8 times heavier looks twice as big, between 16 and 30 mm. */
export const loadEdge = (weightN: number) => Math.min(30, Math.max(16, 5 * Math.cbrt(weightN)));

/**
 * A load: a stone cube standing on `bottom` (the centre of its underside) with its weight arrow, `weight * mmPerN` long,
 * pointing down. The arrow stands above the cube, or beside it on the open side ("left" / "right") when a cord or a
 * part above is in the way; a side arrow's tip is level with a point ARROW_GAP above the cube's underside.
 */
export function loadBlock(
  id: string,
  bottom: Vec,
  weight: number,
  mmPerN: number,
  opts: PartOpts & { arrowSide?: "above" | "left" | "right" } = {},
): { parts: Part[]; edge: number; top: number } {
  const edge = loadEdge(weight);
  const cube = part(id, opts.name ?? "Load", opts.role ?? "The weight being moved.", box(edge, edge, edge, 1.5), v3(bottom.x, bottom.y + edge / 2, bottom.z), look.stone, ground(opts));
  const len = Math.max(ARROW_MIN, weight * mmPerN);
  const side = opts.arrowSide ?? "above";
  const arrows =
    side === "above"
      ? arrow(`${id}-arrow`, v3(bottom.x, bottom.y + edge, bottom.z), -90, len, "push", { name: "Weight arrow", role: "The load's weight, pulling down.", on: on(id, "glue") })
      : arrow(
          `${id}-arrow`,
          // A push arrow stops ARROW_GAP short of `at`, so aiming at the underside's height puts the tip ARROW_GAP above it.
          v3(bottom.x + (side === "right" ? 1 : -1) * (edge / 2 + ARROW_GAP + 5), bottom.y, bottom.z),
          -90,
          len,
          "push",
          { name: "Weight arrow", role: "The load's weight, pulling down.", on: on(id, "glue") },
        );
  return { parts: [cube, ...arrows], edge, top: bottom.y + edge };
}

/** A radial bar, 3 x 3, from a turning part's centre out to 0.8 of its radius, at `angleDeg`, so its turning shows in a still. */
export function turnMark(id: string, centre: Vec, radius: number, angleDeg: number, opts: PartOpts = {}): Part {
  const a = angleDeg * DEG_TO_RAD;
  const s = bar([centre.x, centre.y], [centre.x + 0.8 * radius * Math.cos(a), centre.y + 0.8 * radius * Math.sin(a)], 3, 3, centre.z);
  return part(id, opts.name ?? "Turn mark", opts.role ?? "Shows how far it has turned.", s.shape, s.position, look.structure, ground(opts), s.rotation);
}

/** A travel tick: a short structure bar, 3 x 3 in section, centred on `centre` and `length` long along x (or z), marking where something starts or stops. */
export function tick(id: string, centre: Vec, length: number, axis: "x" | "z" = "x", opts: PartOpts = {}): Part {
  const shape = axis === "x" ? box(length, 3, 3, 1) : box(3, 3, length, 1);
  return part(id, opts.name ?? "Travel mark", opts.role ?? "Marks where the travel is measured from.", shape, centre, look.structure, ground(opts));
}

/** A travel arc: a 3 mm structure arc of `radius` about `centre` in the x-y plane, from `fromDeg` to `toDeg` (either order). Null when it would be under 1 degree. */
export function travelArc(id: string, centre: Vec, radius: number, fromDeg: number, toDeg: number, opts: PartOpts = {}): Part | null {
  const span = Math.abs(toDeg - fromDeg);
  if (span < 1) return null;
  // A flat torus arc is centred on +x; turning it by (90, mid, 0) stands it up in x-y centred on `mid` degrees.
  const mid = (fromDeg + toDeg) / 2;
  return part(id, opts.name ?? "Travel arc", opts.role ?? "Shows how far it can turn.", ring(radius, 1.5, span), centre, look.structure, ground(opts), v3(90, mid, 0));
}

/** A chain of strands through `points`, one part per segment, ids `${prefix}-1`, `${prefix}-2`, ... */
export function chain(prefix: string, name: string, role: string, points: Vec[], thick: number, appearance: Look, parentId: string, joint: Joint): Part[] {
  return points.slice(1).map((p, i) => {
    const s = strand(points[i] as Vec, p, thick);
    return part(`${prefix}-${i + 1}`, name, role, s.shape, s.position, appearance, { parentId, joint }, s.rotation);
  });
}

/** part() for a shape that comes with its own position and rotation, such as bar(), pivoted() or strand(). */
export function shaped(id: string, name: string, role: string, s: { shape: Shape; position: Vec; rotation: Vec }, appearance: Look, attach: Attach | null): Part {
  return part(id, name, role, s.shape, s.position, appearance, attach, s.rotation);
}

/** A coil spring whose axis runs from a to b in the plane z, `radius` to the wire's centre, wire `tube` in radius. */
export function coilSpring(id: string, name: string, role: string, a: Pt, b: Pt, z: number, radius: number, tube: number, turns: number, appearance: Look, attach: Attach): Part {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const lean = Math.atan2(-(b[0] - a[0]), b[1] - a[1]) * RAD_TO_DEG;
  return part(id, name, role, coil(radius, tube, len, turns), v3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z), appearance, attach, v3(0, 0, lean));
}
