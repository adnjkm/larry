// Turns any kit plus a Scene (per-part moves and marks), a rigid move of the whole object and an
// explode amount into the Part list the viewer draws. Everything here is a pure function of its inputs.
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Kit, Part, Shape } from "../../shared/kit.ts";
import { COLOR } from "../../src/primitives/parts.ts";
import { type PartMove, type Rigid, type Scene, STILL, type Vec, vec } from "./model.ts";

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
    case "extrusion": {
      const xs = shape.outline.map((p) => p.x);
      const ys = shape.outline.map((p) => p.y);
      return vec((Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2, shape.depth / 2);
    }
  }
}

export type Extents = { min: Vec; max: Vec };

export function extents(parts: readonly Part[]): Extents {
  const min = vec(Infinity, Infinity, Infinity);
  const max = vec(-Infinity, -Infinity, -Infinity);
  const corner = new Vector3();
  for (const p of parts) {
    const h = halfSize(p.shape);
    const m = matrixOf(p);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      corner.set(sx * h.x, sy * h.y, sz * h.z).applyMatrix4(m);
      min.x = Math.min(min.x, corner.x);
      min.y = Math.min(min.y, corner.y);
      min.z = Math.min(min.z, corner.z);
      max.x = Math.max(max.x, corner.x);
      max.y = Math.max(max.y, corner.y);
      max.z = Math.max(max.z, corner.z);
    }
  }
  return { min, max };
}

export const centreOf = ({ min, max }: Extents): Vec => scale(add(min, max), 0.5);

/** An invisible measuring box handed to the viewer's `frame` so the camera holds still while parts move. */
export function frameAround(parts: readonly Part[], pad = 6): Part[] {
  const { min, max } = extents(parts);
  const halfDepth = Math.max(Math.abs(min.z), Math.abs(max.z)) + pad;
  return [{
    id: "frame", name: "frame", role: "", parentId: null, joint: null,
    shape: { kind: "box", width: max.x - min.x + 2 * pad, height: max.y - Math.min(0, min.y) + pad, depth: halfDepth * 2, cornerRadius: 0 },
    position: vec((min.x + max.x) / 2, (Math.min(0, min.y) + max.y + pad) / 2, 0), rotation: vec(), color: "#ffffff", finish: "matte",
  }];
}

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

function moveMatrix(move: PartMove | undefined, lift: Vec): Matrix4 {
  const m = T(add(move?.offset ?? vec(), lift));
  for (const t of [...(move?.turns ?? [])].reverse()) {
    const axis = new Vector3(t.axis.x, t.axis.y, t.axis.z).normalize();
    m.multiply(T(t.pivot)).multiply(new Matrix4().makeRotationAxis(axis, t.deg * DEG)).multiply(T(neg(t.pivot)));
  }
  return m;
}

// Rubber's low-contrast finish turns the pink to mud, so highlighted rubber is drawn matte.
const pinkOf = (p: Part): Part => ({ ...p, color: COLOR.focus, finish: p.finish === "rubber" ? "matte" : p.finish });

export type Draw = {
  kit: Kit;
  present: readonly string[];
  scene: Scene;
  explode: number;
  pink: ReadonlySet<string>;
  /** The object's resting centre, which a rigid move tips about. */
  centre: Vec;
  rigid?: Rigid;
  apart?: Readonly<Record<string, Vec>>;
};

export function drawObject({ kit, present, scene, explode, pink, centre, rigid = STILL, apart = {} }: Draw): Part[] {
  const shown = kit.parts.filter((p) => present.includes(p.id));
  const whole = rigidMatrix(centre, rigid);
  const rootCentre = centreOf(extents(kit.parts.filter((p) => p.parentId === null)));
  const liftOf = (id: string) => {
    const set = apart[id];
    if (set) return scale(set, explode);
    const part = shown.find((q) => q.id === id)!;
    const away = add(centreOf(extents([part])), neg(rootCentre));
    const length = Math.hypot(away.x, away.y, away.z);
    // Parts centred on the main part (a cap on a bottle, a refill in a barrel) have no outward direction, so they go up.
    const dir = length < 4 ? vec(0, 1, 0) : scale(away, 1 / length);
    return scale(dir, EXPLODE_STEP * shown.indexOf(part) * explode);
  };
  const parts = shown.map((p) => {
    const out = withMatrix(p, whole.clone().multiply(moveMatrix(scene.moves[p.id], liftOf(p.id))).multiply(matrixOf(p)));
    return pink.has(p.id) ? pinkOf(out) : out;
  });
  const marks = scene.marks.flatMap((k): Part[] => {
    if (k.ride !== null && !present.includes(k.ride)) return [];
    const base: Part = { id: k.id, name: "mark", role: "", parentId: null, joint: null, shape: k.shape, position: k.at, rotation: k.rotation ?? vec(), color: COLOR.accent, finish: "matte" };
    if (k.ride === null) return [base];
    return [withMatrix(base, whole.clone().multiply(moveMatrix(scene.moves[k.ride], liftOf(k.ride))).multiply(matrixOf(base)))];
  });
  return [...parts, ...marks];
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
