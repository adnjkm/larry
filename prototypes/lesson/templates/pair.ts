// What every joint template is generated from: one kit part (the child), the part it is joined to
// (the parent), and geometry read off their kit poses. A template turns a Pair into a module spec.
import type { Joint, Kit, Part, Shape } from "../../../shared/kit.ts";
import { type Axis, AXIS, type Mark, type ModuleSpec, type Overlay, type PartMove, type Rigid, STILL, type Vec, vec } from "../model.ts";
import { centreOf, extents } from "../pose.ts";

export type Pair = {
  kit: Kit;
  child: Part;
  parent: Part;
  /** Lower-case names for the middle of a sentence. */
  childName: string;
  parentName: string;
  objectName: string;
  /** Kit part ids this module earns: the child and the parts below it that no other module earns. */
  produces: readonly string[];
  /** The child and every part below it in the kit tree. They move as one. */
  subtree: readonly string[];
  centre: Vec;
  parentCentre: Vec;
  half: Vec;
  /** The world axis the child comes off along. */
  axis: Axis;
  /** Unit vector along `axis`, pointing away from the parent. */
  out: Vec;
};

export type Template = {
  /** Kit joint types this template generates a module for. */
  joints: readonly Joint[];
  /** The library primitive those joints are instances of; the same one the Inspect lesson teaches. */
  primitive: string;
  module: (pair: Pair) => ModuleSpec;
};

const AXES: readonly Axis[] = ["x", "y", "z"];
const DEG = Math.PI / 180;

export const add = (a: Vec, b: Vec): Vec => vec(a.x + b.x, a.y + b.y, a.z + b.z);
export const scale = (a: Vec, k: number): Vec => vec(a.x * k, a.y * k, a.z * k);
const sub = (a: Vec, b: Vec): Vec => add(a, scale(b, -1));
const dominant = (v: Vec): Axis => AXES.reduce((best, a) => (Math.abs(v[a]) > Math.abs(v[best]) ? a : best), "y");

/** A round part's own axis: its local y, turned as the part is. */
function latheAxis(p: Part): Vec {
  const [x, y, z] = [p.rotation.x * DEG, p.rotation.y * DEG, p.rotation.z * DEG];
  // Euler XYZ applied to (0, 1, 0).
  let v = vec(-Math.sin(z), Math.cos(z), 0);
  v = vec(v.x * Math.cos(y) + v.z * Math.sin(y), v.y, -v.x * Math.sin(y) + v.z * Math.cos(y));
  return vec(v.x, v.y * Math.cos(x) - v.z * Math.sin(x), v.y * Math.sin(x) + v.z * Math.cos(x));
}

export function pairOf(kit: Kit, child: Part, produces: readonly string[]): Pair {
  const parent = kit.parts.find((p) => p.id === child.parentId);
  if (!parent) throw new Error(`${child.id} has no parent part`);
  const box = extents([child]);
  const centre = centreOf(box);
  const parentCentre = centreOf(extents([parent]));
  const away = sub(centre, parentCentre);
  const axis = child.shape.kind === "lathe" ? dominant(latheAxis(child)) : Math.hypot(away.x, away.y, away.z) < 4 ? "y" : dominant(away);
  const sign = Math.abs(away[axis]) < 1e-6 ? 1 : Math.sign(away[axis]);
  const below = (id: string): string[] => [id, ...kit.parts.filter((p) => p.parentId === id).flatMap((p) => below(p.id))];
  return {
    kit, child, parent,
    childName: child.name.toLowerCase(),
    parentName: parent.name.toLowerCase(),
    objectName: kit.name.toLowerCase(),
    produces,
    subtree: below(child.id),
    centre,
    parentCentre,
    half: scale(sub(box.max, box.min), 0.5),
    axis,
    out: scale(AXIS[axis], sign),
  };
}

/** The same move for the child and everything riding on it that is present. */
export const carry = (pair: Pair, present: readonly string[], move: PartMove): Record<string, PartMove> =>
  Object.fromEntries(pair.subtree.filter((id) => present.includes(id)).map((id) => [id, move]));

/** The child shifted `d` mm along its way off the parent. */
export const outBy = (pair: Pair, d: number): PartMove => ({ offset: scale(pair.out, d) });

/** How far the child must travel to be clear of where it sits. */
export const clearance = (pair: Pair) => 2 * pair.half[pair.axis] + 12;

export const overlay = (live: string, moves: Overlay["moves"] = {}, marks: Mark[] = [], rigid: Rigid = STILL): Overlay => ({ rigid, live, moves, marks });

/** A target ring round the child, square to the axis it comes off along. */
export const targetOf = (pair: Pair) => {
  const across = AXES.filter((a) => a !== pair.axis).map((a) => pair.half[a]);
  return { label: pair.child.name, at: pair.centre, ring: { radius: Math.min(45, Math.max(6, 1.15 * Math.max(...across))), axis: pair.axis } };
};

const arrowShape = (length: number): Shape => {
  const h = length / 2;
  const pts = [[-2.5, -h], [2.5, -h], [2.5, h - 8], [6, h - 8], [0, h], [-6, h - 8], [-2.5, h - 8]];
  return { kind: "extrusion", outline: pts.map(([x, y]) => ({ x: x!, y: y! })), depth: 3 };
};
const ARROW = arrowShape(18);

/** Euler turn that points an arrow drawn along +y along `dir`, a signed world axis. */
function pointing(dir: Vec): Vec {
  const a = dominant(dir);
  const s = Math.sign(dir[a]);
  if (a === "y") return s > 0 ? vec() : vec(0, 0, 180);
  if (a === "x") return vec(0, 0, -90 * s);
  return vec(90 * s, 0, 0);
}

/** A purple force arrow whose tip touches `at`, pointing along `dir`, riding part `ride`. */
export function arrowMark(id: string, at: Vec, dir: Vec, ride: string | null): Mark {
  return { id, shape: ARROW, at: sub(at, scale(dir, 9)), rotation: pointing(dir), ride };
}

/** The point on the child's surface facing away from the parent, where a pull is drawn. */
export const farFace = (pair: Pair): Vec => add(pair.centre, scale(pair.out, pair.half[pair.axis] + 2));

/** A dying side-to-side tremor for a push that does not go. */
export const shudder = (t: number) => Math.sin(2 * Math.PI * 3 * t) * (1 - t);

export const tenth = (n: number) => Math.round(n * 10) / 10;
