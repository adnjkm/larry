// Turns any kit plus a Scene (per-part moves and marks), a rigid move of the whole object and an
// explode amount into the Part list the viewer draws. Everything here is a pure function of its inputs.
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Kit, Part, Shape } from "../../shared/kit.ts";
import { COLOR } from "../../src/primitives/parts.ts";
import { DEFAULT_VIEW, type ExplodePlan, familyOf, type Leave, type PartMove, type Rigid, type Scene, type Shares, STILL, type Vec, vec, type View } from "./model.ts";

const DEG = Math.PI / 180;
export const EXPLODE_STEP = 24;

const T = (v: Vec) => new Matrix4().makeTranslation(v.x, v.y, v.z);
const unit = new Vector3(1, 1, 1);
const add = (a: Vec, b: Vec): Vec => vec(a.x + b.x, a.y + b.y, a.z + b.z);
const scale = (a: Vec, k: number): Vec => vec(a.x * k, a.y * k, a.z * k);
const neg = (a: Vec): Vec => scale(a, -1);

function matrixOf(p: { position: Vec; rotation: Vec }): Matrix4 {
  const q = new Quaternion().setFromEuler(new Euler(p.rotation.x * DEG, p.rotation.y * DEG, p.rotation.z * DEG, "XYZ"));
  return new Matrix4().compose(new Vector3(p.position.x, p.position.y, p.position.z), q, unit);
}

function withMatrix(p: Part, m: Matrix4): Part {
  const pos = new Vector3();
  const q = new Quaternion();
  m.decompose(pos, q, new Vector3());
  const e = new Euler().setFromQuaternion(q, "XYZ");
  return { ...p, position: vec(pos.x, pos.y, pos.z), rotation: vec(e.x / DEG, e.y / DEG, e.z / DEG) };
}

function halfSize(shape: Shape): Vec {
  switch (shape.kind) {
    case "lathe": {
      const ys = shape.profile.map((p) => p.y);
      const r = Math.max(...shape.profile.map((p) => p.r));
      return vec(r, (Math.max(...ys) - Math.min(...ys)) / 2, r);
    }
    case "box":
      return vec(shape.width / 2, shape.height / 2, shape.depth / 2);
    case "torus":
      return vec(shape.radius + shape.tube, shape.tube, shape.radius + shape.tube);
    case "helix":
      return vec(shape.radius + shape.tube, shape.length / 2, shape.radius + shape.tube);
    case "extrusion": {
      const xs = shape.outline.map((p) => p.x);
      const ys = shape.outline.map((p) => p.y);
      return vec((Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2, shape.depth / 2);
    }
  }
}

export type Extents = { min: Vec; max: Vec };

const RING = Array.from({ length: 16 }, (_, i) => (i / 16) * 2 * Math.PI);

/** A part's own points, centred as the viewer centres its geometry: rings for round parts, the outline for a cut-out, box corners for a box. */
function localPoints(shape: Shape): Vec[] {
  const h = halfSize(shape);
  if (shape.kind === "extrusion") {
    const xs = shape.outline.map((p) => p.x);
    const ys = shape.outline.map((p) => p.y);
    const [cx, cy] = [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2];
    return [-1, 1].flatMap((sz) => shape.outline.map((p) => vec(p.x - cx, p.y - cy, sz * h.z)));
  }
  const round = shape.kind === "lathe" || shape.kind === "torus";
  const ring: [number, number][] = round ? RING.map((a) => [Math.cos(a) * h.x, Math.sin(a) * h.z]) : [[-h.x, -h.z], [-h.x, h.z], [h.x, -h.z], [h.x, h.z]];
  return [-1, 1].flatMap((sy) => ring.map(([x, z]) => vec(x, sy * h.y, z)));
}

/** Points that hug each part, turned and placed as the part is. */
export function corners(parts: readonly Part[]): Vec[] {
  const out: Vec[] = [];
  const corner = new Vector3();
  for (const p of parts) {
    const m = matrixOf(p);
    for (const l of localPoints(p.shape)) {
      corner.set(l.x, l.y, l.z).applyMatrix4(m);
      out.push(vec(corner.x, corner.y, corner.z));
    }
  }
  return out;
}

export function extents(parts: readonly Part[]): Extents {
  const min = vec(Infinity, Infinity, Infinity);
  const max = vec(-Infinity, -Infinity, -Infinity);
  for (const c of corners(parts)) {
    min.x = Math.min(min.x, c.x);
    min.y = Math.min(min.y, c.y);
    min.z = Math.min(min.z, c.z);
    max.x = Math.max(max.x, c.x);
    max.y = Math.max(max.y, c.y);
    max.z = Math.max(max.z, c.z);
  }
  return { min, max };
}

/** Whether most of a part sits inside the box of a part other than itself and `beside`, so it cannot be seen until the object comes apart. */
export function enclosed(id: string, parts: readonly Part[], beside: readonly string[] = []): boolean {
  const part = parts.find((p) => p.id === id);
  if (!part) return false;
  const a = extents([part]);
  const volume = (e: Extents) => Math.max(0, e.max.x - e.min.x) * Math.max(0, e.max.y - e.min.y) * Math.max(0, e.max.z - e.min.z);
  const own = volume(a);
  return parts.some((q) => {
    if (q.id === id || beside.includes(q.id)) return false;
    const b = extents([q]);
    const overlap = { min: vec(Math.max(a.min.x, b.min.x), Math.max(a.min.y, b.min.y), Math.max(a.min.z, b.min.z)), max: vec(Math.min(a.max.x, b.max.x), Math.min(a.max.y, b.max.y), Math.min(a.max.z, b.max.z)) };
    return own > 0 && volume(overlap) / own > 0.6;
  });
}

/** Share of the viewer's width or height the subject fills at the default view. */
export const FILL = 0.85;
// The camera fit in src/kit3d/KitViewer.tsx, which this module cannot change: a margin, a ground shadow
// sized and offset from the frame's footprint, and a cylinder around the frame so it can be turned.
const VIEWER_MARGIN = 1.12;
const viewerZoom = (half: { x: number; z: number }, radius: number, height: number, el: number, width: number, tall: number) => {
  const footprint = Math.max(half.x, half.z);
  const shadowReach = footprint * 0.3 + Math.max(half.x, half.z) * 1.05 + 3;
  const halfWide = Math.max(radius, shadowReach * 0.85);
  const halfTall = (height / 2) * Math.cos(el) + radius * Math.sin(el);
  return Math.min(width / (2 * halfWide * VIEWER_MARGIN), tall / (2 * halfTall * VIEWER_MARGIN));
};

/**
 * An invisible measuring box for the viewer's `frame` that makes `subject` fill FILL of a `width` by
 * `tall` viewer at this view, centred, without leaving the viewer when it is dragged round. The
 * viewer fits a turnable cylinder, so a long object framed by its own bounds fills well under FILL;
 * this box is sized so the viewer's own fit lands on the zoom the subject needs.
 */
export function fitFrame(subject: readonly Part[], view: { elevation: number; azimuth: number }, width: number, tall: number): Part[] {
  const el = view.elevation * DEG;
  const az = view.azimuth * DEG;
  const right = vec(Math.cos(az), 0, -Math.sin(az));
  const up = vec(-Math.sin(el) * Math.sin(az), Math.cos(el), -Math.sin(el) * Math.cos(az));
  const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
  const pts = corners(subject);
  const box = extents(subject);
  const range = (axis: Vec) => {
    const d = pts.map((p) => dot(p, axis));
    return { lo: Math.min(...d), hi: Math.max(...d) };
  };
  const across = range(right);
  const upward = range(up);
  // Shift the turning centre along the screen's horizontal so the subject sits in the middle.
  const c = centreOf(box);
  const shift = (across.lo + across.hi) / 2 - dot(vec(c.x, 0, c.z), right);
  const cx = c.x + shift * right.x;
  const cz = c.z + shift * right.z;
  const reach = Math.max(...pts.map((p) => Math.hypot(p.x - cx, p.z - cz)));
  const height = box.max.y - box.min.y;
  const zoom = Math.min(
    (FILL * width) / (across.hi - across.lo),
    (FILL * tall) / (upward.hi - upward.lo),
    width / (2 * reach * 1.02),
    tall / (2 * ((height / 2) * Math.cos(el) + reach * Math.sin(el)) * 1.02),
  );
  // The viewer looks at the frame's mid height: pick it so the subject's screen middle lands there.
  const targetY = ((upward.lo + upward.hi) / 2 + Math.sin(el) * (Math.sin(az) * cx + Math.cos(az) * cz)) / Math.cos(el);
  const floor = targetY - Math.min(0, box.min.y);
  const half0 = { x: (box.max.x - box.min.x) / 2, z: (box.max.z - box.min.z) / 2 };
  const shaped = (s: number) => {
    const half = { x: Math.max(1, s * half0.x), z: Math.max(1, s * half0.z) };
    const radius = Math.hypot(half.x, half.z);
    const want = (2 * (tall / (2 * zoom * VIEWER_MARGIN) - radius * Math.sin(el))) / Math.cos(el);
    const h = Math.min(Math.max(0.01, want), Math.max(0.01, 2 * floor));
    return { half, h, zoom: viewerZoom(half, radius, h, el, width, tall) };
  };
  let [lo, hi] = [0.02, 50];
  for (let i = 0; i < 40; i++) {
    const mid = Math.sqrt(lo * hi);
    if (shaped(mid).zoom > zoom) lo = mid;
    else hi = mid;
  }
  const { half, h } = shaped(hi);
  return [{
    id: "frame", name: "frame", role: "", parentId: null, joint: null,
    shape: { kind: "box", width: 2 * half.x, height: h, depth: 2 * half.z, cornerRadius: 0 },
    position: vec(cx, targetY, cz), rotation: vec(), color: "#ffffff", finish: "matte",
  }];
}

export const centreOf = ({ min, max }: Extents): Vec => scale(add(min, max), 0.5);

/** Rescales parts about `centre` by `k` and puts that centre at `at`. */
export function placeParts(parts: readonly Part[], centre: Vec, k: number, at: Vec): Part[] {
  return parts.map((p) => ({ ...p, shape: scaleShape(p.shape, k), position: add(at, scale(add(p.position, neg(centre)), k)) }));
}

function scaleShape(shape: Shape, s: number): Shape {
  switch (shape.kind) {
    case "lathe":
      return { kind: "lathe", profile: shape.profile.map((p) => ({ r: p.r * s, y: p.y * s })) };
    case "box":
      return { ...shape, width: shape.width * s, height: shape.height * s, depth: shape.depth * s, cornerRadius: shape.cornerRadius * s };
    case "torus":
      return { ...shape, radius: shape.radius * s, tube: shape.tube * s };
    case "helix":
      return { ...shape, radius: shape.radius * s, tube: shape.tube * s, length: shape.length * s };
    case "extrusion":
      return { ...shape, outline: shape.outline.map((p) => ({ x: p.x * s, y: p.y * s })), depth: shape.depth * s };
  }
}

/** Layers `b` over `a`: offsets add, `a`'s turns happen first, marks join. */
export function compose(a: Scene, b: Scene): Scene {
  const moves: Record<string, PartMove> = { ...a.moves };
  for (const [id, m] of Object.entries(b.moves)) {
    const under = moves[id];
    moves[id] = under
      ? { offset: add(under.offset ?? vec(), m.offset ?? vec()), turns: [...(under.turns ?? []), ...(m.turns ?? [])] }
      : m;
  }
  return { moves, marks: [...a.marks, ...b.marks] };
}

const rigidMatrix = (centre: Vec, rigid: Rigid) =>
  T(vec(rigid.dx, rigid.dy, 0)).multiply(T(centre)).multiply(new Matrix4().makeRotationZ(rigid.angle * DEG)).multiply(T(neg(centre)));

/** Where a point fixed to the object ends up after a rigid move. */
export function rigidPoint(centre: Vec, rigid: Rigid, p: Vec): Vec {
  const v = new Vector3(p.x, p.y, p.z).applyMatrix4(rigidMatrix(centre, rigid));
  return vec(v.x, v.y, v.z);
}

function moveMatrix(move: PartMove | undefined): Matrix4 {
  const m = T(move?.offset ?? vec());
  for (const t of [...(move?.turns ?? [])].reverse()) {
    const axis = new Vector3(t.axis.x, t.axis.y, t.axis.z).normalize();
    m.multiply(T(t.pivot)).multiply(new Matrix4().makeRotationAxis(axis, t.deg * DEG)).multiply(T(neg(t.pivot)));
  }
  return m;
}

// The piece being taught is always the same bright pink: rubber's finish turns it to mud, metal's
// darkens it, and clear lets the grey behind show through, so a highlighted part is drawn matte.
const pinkOf = (p: Part): Part => ({ ...p, color: COLOR.focus, finish: "matte" });

/** A scanned part's photo colour as the grey of the same lightness, so only the taught piece carries colour. */
function greyOf(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const y = Math.round(0.2126 * r! + 0.7152 * g! + 0.0722 * b!);
  const h = y.toString(16).padStart(2, "0");
  return `#${h}${h}${h}`;
}

export type Draw = {
  kit: Kit;
  present: readonly string[];
  scene: Scene;
  /** How far apart: one amount for the whole object, or with a `plan`, each assembly's own share. */
  explode: number | Shares;
  plan?: ExplodePlan;
  pink: ReadonlySet<string>;
  /** The object's resting centre, which a rigid move tips about. */
  centre: Vec;
  rigid?: Rigid;
  apart?: Readonly<Record<string, Vec>>;
};

export function drawObject({ kit, present, scene, explode, plan, pink, centre, rigid = STILL, apart = {} }: Draw): Part[] {
  const shown = kit.parts.filter((p) => present.includes(p.id));
  const whole = rigidMatrix(centre, rigid);
  const lift = plan ? plannedLift(kit, plan, explode) : spreadLift(kit, shown, typeof explode === "number" ? explode : 0, apart);
  const parts = shown.map((p) => {
    const out = withMatrix(p, whole.clone().multiply(lift(p.id)).multiply(moveMatrix(scene.moves[p.id])).multiply(matrixOf(p)));
    return pink.has(p.id) ? pinkOf(out) : { ...out, color: greyOf(out.color) };
  });
  const marks = scene.marks.flatMap((k): Part[] => {
    if (k.ride !== null && !present.includes(k.ride)) return [];
    const base: Part = { id: k.id, name: "mark", role: "", parentId: null, joint: null, shape: k.shape, position: k.at, rotation: k.rotation ?? vec(), color: COLOR.accent, finish: "matte" };
    if (k.ride === null) return [base];
    return [withMatrix(base, whole.clone().multiply(lift(k.ride)).multiply(moveMatrix(scene.moves[k.ride])).multiply(matrixOf(base)))];
  });
  return [...parts, ...marks];
}

/** Each assembly where its share puts it; a part fixed to an assembly rides it, and parts in none stay. */
function plannedLift(kit: Kit, plan: ExplodePlan, explode: number | Shares): (id: string) => Matrix4 {
  const leaving = new Map<string, Leave>(plan.order.flatMap((l) => familyOf(kit, l.id).map((id): [string, Leave] => [id, l])));
  const share = (l: Leave) => Math.max(0, typeof explode === "number" ? explode : (explode[l.id] ?? 0));
  return (id) => {
    const l = leaving.get(id);
    return l ? moveMatrix(l.at(share(l))) : new Matrix4();
  };
}

/** Without a plan: each part straight out from the main part (or along `apart`), the further the later it comes. */
function spreadLift(kit: Kit, shown: readonly Part[], explode: number, apart: Readonly<Record<string, Vec>>): (id: string) => Matrix4 {
  const rootCentre = centreOf(extents(kit.parts.filter((p) => p.parentId === null)));
  // Parts centred on the main part (a cap on a bottle, a refill in a barrel) have no outward direction, so they go up.
  const outward = shown.map((part) => {
    const away = add(centreOf(extents([part])), neg(rootCentre));
    const length = Math.hypot(away.x, away.y, away.z);
    return { part, length, dir: length < 4 ? vec(0, 1, 0) : scale(away, 1 / length) };
  });
  // Parts leaving the same way go out in order, the nearest least, so a seal inside a joint does not
  // land on a lens that started further out.
  const steps = (i: number) => {
    const me = outward[i]!;
    if (me.part.parentId === null) return 0;
    const behind = outward.filter((o, j) => o.part.parentId !== null && o.dir.x * me.dir.x + o.dir.y * me.dir.y + o.dir.z * me.dir.z > 0.9 && (o.length < me.length || (o.length === me.length && j < i)));
    return behind.length + 1;
  };
  return (id) => {
    const set = apart[id];
    if (set) return T(scale(set, explode));
    const i = shown.findIndex((q) => q.id === id);
    return T(scale(outward[i]!.dir, EXPLODE_STEP * steps(i) * explode));
  };
}

/** The resting centre of the present parts in a scene, for rigid moves and framing. */
export function restCentre(kit: Kit, present: readonly string[], scene: Scene): Vec {
  return centreOf(extents(drawObject({ kit, present, scene, explode: 0, pink: new Set(), centre: vec() }).filter((p) => present.includes(p.id))));
}

/** Returns last frame's Part objects where nothing changed, so the viewer keeps their geometry instead of rebuilding it. */
export function reuseParts(previous: Map<string, Part>, parts: Part[]): Part[] {
  const same = (a: Part, b: Part) =>
    a.color === b.color && a.finish === b.finish &&
    a.position.x === b.position.x && a.position.y === b.position.y && a.position.z === b.position.z &&
    a.rotation.x === b.rotation.x && a.rotation.y === b.rotation.y && a.rotation.z === b.rotation.z &&
    (a.shape === b.shape || JSON.stringify(a.shape) === JSON.stringify(b.shape));
  const out = parts.map((p) => {
    const old = previous.get(p.id);
    return old && same(old, p) ? old : p;
  });
  previous.clear();
  for (const p of out) previous.set(p.id, p);
  return out;
}

/** An object this flat (height over its widest footprint) lies on the table, and is seen from higher up. */
const FLAT = 0.2;
const FLAT_ELEVATION = 45;
const AZIMUTHS = [DEFAULT_VIEW.azimuth, -DEFAULT_VIEW.azimuth, 180 - DEFAULT_VIEW.azimuth, DEFAULT_VIEW.azimuth - 180];

/**
 * The default view, mirrored left to right or front to back. Of the mirrors that turn the earned parts
 * (if any are given) toward the camera (a flashlight's head, its tested end, should not be drawn behind its body), the one
 * that shows the object widest, since the viewer leaves room to turn it and a narrow side wastes the
 * card. Seen from higher up when the object lies flat (scissors seen edge on are two lines).
 */
export function facingView(kit: Kit, earned: readonly string[]): View {
  const all = extents(kit.parts);
  const size = Math.max(all.max.x - all.min.x, all.max.z - all.min.z);
  const elevation = all.max.y - all.min.y < FLAT * size ? FLAT_ELEVATION : DEFAULT_VIEW.elevation;
  const c = centreOf(all);
  const shown = kit.parts.filter((p) => earned.includes(p.id));
  const e = shown.length > 0 ? centreOf(extents(shown)) : c;
  const rad = (az: number) => (az * Math.PI) / 180;
  const toward = (az: number) => Math.sin(rad(az)) * (e.x - c.x) + Math.cos(rad(az)) * (e.z - c.z);
  const feet = kit.parts.flatMap((p) => {
    const b = extents([p]);
    return [b.min.x, b.max.x].flatMap((x) => [b.min.z, b.max.z].map((z) => ({ x, z })));
  });
  const reach = Math.max(...feet.map((f) => Math.hypot(f.x - c.x, f.z - c.z)));
  const wide = (az: number) => {
    const across = feet.map((f) => Math.cos(rad(az)) * f.x - Math.sin(rad(az)) * f.z);
    return (Math.max(...across) - Math.min(...across)) / (2 * reach);
  };
  const best = Math.max(...AZIMUTHS.map(toward));
  const facingEnough = AZIMUTHS.filter((az) => toward(az) >= best - 0.1 * size);
  const azimuth = facingEnough.reduce((a, b) => (wide(b) > wide(a) + 0.02 ? b : a));
  return { elevation, azimuth };
}
