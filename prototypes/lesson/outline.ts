// A part drawn as thin edge lines only: rings round a round part's outer rims with a few lines down
// its sides, or the twelve edges of any other part's box. Used as the ghost a piece snaps onto, so it
// marks the place without looking like a second solid piece.
import { Euler, Matrix4, Quaternion, Vector3 } from "three";
import type { Part, Shape } from "../../shared/kit.ts";
import { vec } from "./model.ts";
import { extents } from "./pose.ts";

const DEG = Math.PI / 180;
/** Line thickness in mm. */
const LINE = 1.2;
/** Lines down the side of a round part. */
const SIDES = 6;

const T = (x: number, y: number, z: number) => new Matrix4().makeTranslation(x, y, z);
const ring = (radius: number): Shape => ({ kind: "torus", radius, tube: LINE / 2, arcDegrees: 360 });
const bar = (length: number): Shape => ({ kind: "box", width: LINE, height: length, depth: LINE, cornerRadius: 0 });

type Edge = { shape: Shape; at: Matrix4 };

/** The profile's outside: at each of its heights, the furthest it reaches from the axis. A hollow part's inside never shows in an outline. */
function outerSide(profile: readonly { r: number; y: number }[]): { r: number; y: number }[] {
  const ys = [...new Set(profile.map((p) => p.y))].sort((a, b) => a - b);
  return ys.map((y) => {
    let r = 0;
    profile.forEach((a, i) => {
      const b = profile[i + 1];
      if (a.y === y) r = Math.max(r, a.r);
      if (!b || y < Math.min(a.y, b.y) || y > Math.max(a.y, b.y)) return;
      r = Math.max(r, a.y === b.y ? Math.max(a.r, b.r) : a.r + ((b.r - a.r) * (y - a.y)) / (b.y - a.y));
    });
    return { r, y };
  });
}

/** Rings at the rims of the profile's outside, and lines along its steep runs, so flat faces get no spokes. */
function latheEdges(profile: readonly { r: number; y: number }[]): Edge[] {
  const outside = outerSide(profile);
  const ys = outside.map((p) => p.y);
  const mid = (Math.max(...ys) + Math.min(...ys)) / 2;
  const pts = outside.map((p) => ({ r: p.r, y: p.y - mid }));
  // A bevel's two rims (a cap's top edge) read as one line, so a ring this close to a kept one is
  // dropped; the top and bottom rims always stay.
  const [first, last] = [pts[0]!, pts[pts.length - 1]!];
  const kept = [first, last].filter((p) => p.r > LINE);
  for (const p of pts.slice(1, -1)) if (p.r > LINE && kept.every((k) => Math.hypot(k.r - p.r, k.y - p.y) > 4 * LINE)) kept.push(p);
  const rings = kept.map((p) => ({ shape: ring(p.r), at: T(0, p.y, 0) }));
  const sides = pts.slice(1).flatMap((b, i) => {
    const a = pts[i]!;
    const length = Math.hypot(b.r - a.r, b.y - a.y);
    if (length < 4 * LINE || Math.abs(b.y - a.y) < 0.5 * length) return [];
    const tilt = Math.atan2(b.r - a.r, b.y - a.y);
    return Array.from({ length: SIDES }, (_, k) => ({
      shape: bar(length),
      at: new Matrix4().makeRotationY((k / SIDES) * 2 * Math.PI).multiply(T((a.r + b.r) / 2, (a.y + b.y) / 2, 0)).multiply(new Matrix4().makeRotationZ(-tilt)),
    }));
  });
  return [...rings, ...sides];
}

function boxEdges(part: Part): Edge[] {
  const { min, max } = extents([{ ...part, position: vec(), rotation: vec() }]);
  const size = vec(max.x - min.x, max.y - min.y, max.z - min.z);
  const c = vec((min.x + max.x) / 2, (min.y + max.y) / 2, (min.z + max.z) / 2);
  const half = vec(size.x / 2, size.y / 2, size.z / 2);
  const corners = [-1, 1].flatMap((s) => [-1, 1].map((t) => [s, t] as const));
  return [
    ...corners.map(([s, t]) => ({ shape: bar(size.y), at: T(c.x + s * half.x, c.y, c.z + t * half.z) })),
    ...corners.map(([s, t]) => ({ shape: bar(size.x), at: T(c.x, c.y + s * half.y, c.z + t * half.z).multiply(new Matrix4().makeRotationZ(Math.PI / 2)) })),
    ...corners.map(([s, t]) => ({ shape: bar(size.z), at: T(c.x + s * half.x, c.y + t * half.y, c.z).multiply(new Matrix4().makeRotationX(Math.PI / 2)) })),
  ];
}

/** Each part as edge lines in `color`, placed and turned as the part is. */
export function outline(parts: readonly Part[], color: string): Part[] {
  return parts.flatMap((part) => {
    const q = new Quaternion().setFromEuler(new Euler(part.rotation.x * DEG, part.rotation.y * DEG, part.rotation.z * DEG, "XYZ"));
    const placed = new Matrix4().compose(new Vector3(part.position.x, part.position.y, part.position.z), q, new Vector3(1, 1, 1));
    const edges = part.shape.kind === "lathe" ? latheEdges(part.shape.profile) : boxEdges(part);
    return edges.map((edge, i): Part => {
      const pos = new Vector3();
      const turn = new Quaternion();
      placed.clone().multiply(edge.at).decompose(pos, turn, new Vector3());
      const e = new Euler().setFromQuaternion(turn, "XYZ");
      return {
        id: `ghost-${part.id}-${i}`, name: "ghost", role: "", parentId: null, joint: null, shape: edge.shape,
        position: vec(pos.x, pos.y, pos.z), rotation: vec(e.x / DEG, e.y / DEG, e.z / DEG), color, finish: "matte",
      };
    });
  });
}
