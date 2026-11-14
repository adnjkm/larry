// How any kit comes apart, as the bottle does: by assemblies (each part not fixed to its parent, with
// everything fixed to it), each on its own spring. Each leaves along the way it comes off (its shared
// axis for round parts, the pin's axis for a part turning on a round pin, else away from its parent),
// pointing away from the main part. Assemblies leaving the same way stack: the outermost leaves first
// and goes furthest, and each clears whatever it sat against, so nothing passes through anything.
// Threaded assemblies unscrew as they lift.
import type { Kit, Part } from "../../../shared/kit.ts";
import { AXIS, type ExplodePlan, familyOf, type Leave, rootOf, type Vec } from "../model.ts";
import { centreOf, extents, type Extents } from "../pose.ts";
import { latheAxis, scale } from "../templates/pair.ts";
import { twisted } from "./closure.ts";
import { sizeOf, wayOff } from "./piece.ts";

const UNSCREW_TURNS = 1.5;
/** A threaded assembly keeps turning for this share of its rise, so the spin is slow enough to follow. */
const UNSCREW_SHARE = 0.85;

const dot = (a: Vec, b: Vec) => a.x * b.x + a.y * b.y + a.z * b.z;
const span = (b: Extents, dir: Vec) => {
  const ends = [dot(b.min, dir), dot(b.max, dir)];
  return { lo: Math.min(...ends), hi: Math.max(...ends) };
};
/** Whether two boxes overlap when seen along `dir` (a world axis). */
const across = (a: Extents, b: Extents, dir: Vec) =>
  (["x", "y", "z"] as const).every((k) => Math.abs(dir[k]) > 0.5 || (a.min[k] < b.max[k] - 0.5 && b.min[k] < a.max[k] - 0.5));

function wayOfLeaver(kit: Kit, part: Part) {
  const parent = kit.parts.find((p) => p.id === part.parentId);
  const own = wayOff(kit, part);
  const pinned = parent && parent.parentId !== null && parent.shape.kind === "lathe" && (part.joint === "hinge" || part.joint === "rivet");
  if (!pinned) return own;
  const a = latheAxis(parent);
  const axis = (["x", "y", "z"] as const).reduce((best, k) => (Math.abs(a[k]) > Math.abs(a[best]) ? k : best), "y" as "x" | "y" | "z");
  const root = centreOf(extents(kit.parts.filter((p) => p.parentId === null)));
  const d = centreOf(extents([part]))[axis] - root[axis];
  return { axis, out: scale(AXIS[axis], Math.abs(d) > 0.2 ? Math.sign(d) : 1) };
}

export function explodePlanOf(kit: Kit): ExplodePlan | undefined {
  const leavers = kit.parts.filter((p) => p.parentId !== null && rootOf(kit, p.id) === p.id);
  if (leavers.length === 0) return undefined;
  const size = sizeOf(kit);
  const gap = Math.max(6, 0.06 * size);
  const least = 0.15 * size;
  const depth = (p: Part): number => {
    const up = kit.parts.find((q) => q.id === p.parentId);
    return up ? 1 + depth(up) : 0;
  };
  const all = leavers.map((p) => {
    const family = familyOf(kit, p.id);
    const box = extents(kit.parts.filter((q) => family.includes(q.id)));
    const { out } = wayOfLeaver(kit, p);
    return { part: p, family, box, out, group: `${out.x},${out.y},${out.z}`, far: span(box, out).hi, d: 0, rank: 0 };
  });
  for (const group of new Set(all.map((a) => a.group))) {
    const members = all.filter((a) => a.group === group).sort((a, b) => a.far - b.far);
    const moving = new Set(members.flatMap((m) => m.family));
    const still = kit.parts.filter((p) => !moving.has(p.id)).map((p) => ({ box: extents([p]), d: 0 }));
    const placed: { box: Extents; d: number }[] = [];
    members.forEach((m, i) => {
      const own = span(m.box, m.out);
      const clears = [...still, ...placed].filter((o) => across(o.box, m.box, m.out)).map((o) => span(o.box, m.out).hi + o.d - own.lo + gap);
      m.d = Math.max(least, ...clears);
      m.rank = members.length - 1 - i;
      placed.push({ box: m.box, d: m.d });
    });
  }
  const order = [...all].sort((a, b) => a.rank - b.rank || depth(b.part) - depth(a.part) || kit.parts.indexOf(a.part) - kit.parts.indexOf(b.part));
  return {
    order: order.map((a): Leave => {
      const pivot = centreOf(a.box);
      const turns = twisted(a.part);
      return {
        id: a.part.id,
        at: (s) => ({ offset: scale(a.out, a.d * s), turns: turns ? [{ axis: a.out, pivot, deg: -360 * UNSCREW_TURNS * Math.min(1, s / UNSCREW_SHARE) }] : [] }),
      };
    }),
  };
}
