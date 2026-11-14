// Turns the bottle kit plus a Pose (explode amount, per-part moves, a rigid move of the whole object,
// falling drops) into the Part list the viewer draws. Everything here is a pure function of its inputs.
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Kit, Part, Shape } from "../../shared/kit.ts";
import { COLOR } from "../../src/primitives/parts.ts";

export type Vec = { x: number; y: number; z: number };
export const vec = (x = 0, y = 0, z = 0): Vec => ({ x, y, z });

export const CAP = "cap";
export const RING = "seal-ring";
export const BODY = "body";
const MARK = "turn-mark";
const DEG = Math.PI / 180;

export const EXPLODE_STEP = 24;
/** Direction the turn mark starts at, so it faces the default camera. */
const MARK_ANGLE = -60;
const MARK_RADIUS = 27.8;
export const DROP_RADIUS = 6;

export type Move = { dx: number; dy: number; dz: number; turn: number; tilt: number };
export type Rigid = { dx: number; dy: number; angle: number };
export type Pose = {
  /** 0 assembled, 1 pulled apart along y in kit order. */
  explode: number;
  moves: Readonly<Record<string, Partial<Move>>>;
  /** Moves the whole object: tips it by `angle` degrees about the z axis through its centre, then shifts it. */
  rigid: Rigid;
  drops: Vec[];
  /** Drops that have landed, lying flat on the floor. */
  splashes: Vec[];
  /** A line shown on the viewer while a test runs. */
  live: string;
};
export const REST_RIGID: Rigid = { dx: 0, dy: 0, angle: 0 };
export const REST: Pose = { explode: 0, moves: {}, rigid: REST_RIGID, drops: [], splashes: [], live: "" };

const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
const unit = new Vector3(1, 1, 1);

function matrixOf(p: Part): Matrix4 {
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

export type Extents = { minX: number; maxX: number; minY: number; maxY: number };

export function extents(parts: Part[]): Extents {
  const out: Extents = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
  const corner = new Vector3();
  for (const p of parts) {
    const h = halfSize(p.shape);
    const m = matrixOf(p);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      corner.set(sx * h.x, sy * h.y, sz * h.z).applyMatrix4(m);
      out.minX = Math.min(out.minX, corner.x);
      out.maxX = Math.max(out.maxX, corner.x);
      out.minY = Math.min(out.minY, corner.y);
      out.maxY = Math.max(out.maxY, corner.y);
    }
  }
  return out;
}

/** An invisible-to-the-eye measuring box: handed to the viewer's `frame` so the camera holds still. */
export function frameBox(minX: number, maxX: number, minY: number, maxY: number, halfDepth: number): Part[] {
  return [{
    id: "frame", name: "frame", role: "", parentId: null, joint: null,
    shape: { kind: "box", width: maxX - minX, height: maxY - minY, depth: halfDepth * 2, cornerRadius: 0 },
    position: vec((minX + maxX) / 2, (minY + maxY) / 2, 0), rotation: vec(), color: "#ffffff", finish: "matte",
  }];
}

/** Rescales parts about `centre` by `scale` and puts that centre at `at`. */
export function placeParts(parts: Part[], centre: Vec, scale: number, at: Vec): Part[] {
  return parts.map((p) => ({
    ...p,
    shape: scaleShape(p.shape, scale),
    position: vec(at.x + (p.position.x - centre.x) * scale, at.y + (p.position.y - centre.y) * scale, at.z + (p.position.z - centre.z) * scale),
  }));
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

/** Measurements of the bottle that the timelines need, read from the kit so nothing is typed in twice. */
export type Rig = {
  present: readonly string[];
  centreY: number;
  /** Height of the gap between cap and neck, where leaks start. */
  jointY: number;
  neckRadius: number;
  capY: number;
  capHalf: number;
  /** How far the cap sits lower when there is no seal ring under it. */
  seatDrop: number;
};

function find(kit: Kit, id: string): Part {
  const p = kit.parts.find((q) => q.id === id);
  if (!p) throw new Error(`kit has no part ${id}`);
  return p;
}

export function rigOf(kit: Kit, present: readonly string[]): Rig {
  const cap = find(kit, CAP);
  const body = find(kit, BODY);
  const capBox = extents([cap]);
  const bodyBox = extents([body]);
  const seatDrop = present.includes(RING) ? 0 : capBox.minY - bodyBox.maxY;
  const shown = kit.parts.filter((p) => present.includes(p.id)).map((p) => (p.id === CAP ? { ...p, position: { ...p.position, y: p.position.y - seatDrop } } : p));
  const all = extents(shown);
  return {
    present,
    centreY: (all.minY + all.maxY) / 2,
    jointY: capBox.minY - seatDrop,
    neckRadius: 27,
    capY: cap.position.y - seatDrop,
    capHalf: (capBox.maxY - capBox.minY) / 2,
    seatDrop,
  };
}

const rigidMatrix = (centreY: number, rigid: Rigid) =>
  T(rigid.dx, rigid.dy, 0).multiply(T(0, centreY, 0)).multiply(new Matrix4().makeRotationZ(rigid.angle * DEG)).multiply(T(0, -centreY, 0));

export function rigidPoint(rig: Rig, rigid: Rigid, p: Vec): Vec {
  const v = new Vector3(p.x, p.y, p.z).applyMatrix4(rigidMatrix(rig.centreY, rigid));
  return vec(v.x, v.y, v.z);
}

const sphere = (r: number): Shape => ({
  kind: "lathe",
  profile: [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const a = (i / 6) * Math.PI - Math.PI / 2;
    return { r: i === 0 || i === 6 ? 0 : r * Math.cos(a), y: r * Math.sin(a) };
  }),
});
const DROP_SHAPE = sphere(DROP_RADIUS);
const SPLASH_SHAPE: Shape = { kind: "lathe", profile: [{ r: 0, y: 0 }, { r: 8, y: 0 }, { r: 8, y: 2 }, { r: 0, y: 2 }] };

// Rubber's low-contrast finish turns the pink to mud, so highlighted rubber is drawn matte.
const recolor = (p: Part): Part => ({ ...p, color: COLOR.focus, finish: p.finish === "rubber" ? "matte" : p.finish });

export function bottleParts(kit: Kit, present: readonly string[], pose: Pose, pink: ReadonlySet<string>): Part[] {
  const rig = rigOf(kit, present);
  const shown = kit.parts.filter((p) => present.includes(p.id));
  const seated: Part[] = shown.map((p) => (p.id === CAP ? { ...p, position: { ...p.position, y: p.position.y - rig.seatDrop } } : p));
  const cap = seated.find((p) => p.id === CAP);
  const mark: Part[] = cap
    ? [{
        id: MARK, name: "turn mark", role: "Shows how far the cap has turned.", parentId: CAP, joint: "glue",
        shape: { kind: "box", width: 3, height: 20, depth: 5, cornerRadius: 1 },
        position: vec(cap.position.x + MARK_RADIUS * Math.cos(MARK_ANGLE * DEG), cap.position.y, cap.position.z - MARK_RADIUS * Math.sin(MARK_ANGLE * DEG)),
        rotation: vec(0, MARK_ANGLE, 0), color: COLOR.accent, finish: "matte",
      }]
    : [];

  const rigid = rigidMatrix(rig.centreY, pose.rigid);

  const draw = (p: Part, kitIndex: number, moveOf: string): Part => {
    const move = pose.moves[moveOf] ?? {};
    const pivot = cap?.position ?? vec();
    const spin = moveOf === CAP
      ? T(pivot.x, pivot.y, pivot.z).multiply(new Matrix4().makeRotationY((move.turn ?? 0) * DEG)).multiply(new Matrix4().makeRotationZ((move.tilt ?? 0) * DEG)).multiply(T(-pivot.x, -pivot.y, -pivot.z))
      : new Matrix4();
    const lift = T(move.dx ?? 0, (move.dy ?? 0) + pose.explode * EXPLODE_STEP * kitIndex, move.dz ?? 0);
    const out = withMatrix(p, rigid.clone().multiply(lift).multiply(spin).multiply(matrixOf(p)));
    return pink.has(p.id) ? recolor(out) : out;
  };

  const drawn = seated.map((p) => draw(p, shown.findIndex((q) => q.id === p.id), p.id));
  const capIndex = shown.findIndex((q) => q.id === CAP);
  const marks = mark.map((p) => draw(p, capIndex, CAP));
  const drops = pose.drops.map<Part>((d, i) => ({
    id: `drop-${i}`, name: "water drop", role: "", parentId: null, joint: null, shape: DROP_SHAPE,
    position: d, rotation: vec(), color: COLOR.accent, finish: "matte",
  }));
  const splashes = pose.splashes.map<Part>((d, i) => ({
    id: `splash-${i}`, name: "water", role: "", parentId: null, joint: null, shape: SPLASH_SHAPE,
    position: d, rotation: vec(), color: COLOR.accent, finish: "matte",
  }));
  return [...drawn, ...marks, ...drops, ...splashes];
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
