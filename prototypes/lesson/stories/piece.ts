// What every story template is generated from: a kit part, the way it comes off, and its words.
// Words are the kit's own part names, lower-case and with any token holding a digit dropped, since a
// story shows no numbers. A part comes off along its own axis (round parts) or away from its parent,
// pointing away from the main part, so a lid under a screw ring still lifts up and out.
import type { Kit, Part } from "../../../shared/kit.ts";
import { type Axis, AXIS, type Control, type Ctx, type PartMove, type Vec, vec, type Zone } from "../model.ts";
import { centreOf, drawObject, extents } from "../pose.ts";
import { latheAxis, type Pair, pairOf, scale } from "../templates/pair.ts";

const AXES: readonly Axis[] = ["x", "y", "z"];
const dominant = (v: Vec): Axis => AXES.reduce((best, a) => (Math.abs(v[a]) > Math.abs(v[best]) ? a : best), "y");

/** A kit name as words for a sentence: lower-case, letters only, no token with a digit. */
export function wordsOf(name: string): string {
  const kept = name.toLowerCase().split(/\s+/).filter((w) => !/\d/.test(w)).map((w) => w.replace(/[^a-z'-]/g, "")).filter((w) => w.length > 0);
  return kept.length > 0 ? kept.join(" ") : "part";
}
export const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lastWord = (s: string) => s.split(" ").pop()!;

export const WORDS = 8;
const count = (s: string) => s.trim().split(/\s+/).length;
/** The line with the part's full name, or with its last word when the full name makes it too long. */
export const fit = (make: (name: string) => string, name: string) => (count(make(name)) <= WORDS ? make(name) : make(lastWord(name)));

/** A part's subtree: it and every part below it in the kit tree. */
export const below = (kit: Kit, id: string): string[] => [id, ...kit.parts.filter((p) => p.parentId === id).flatMap((p) => below(kit, p.id))];

export const rootPart = (kit: Kit) => kit.parts.find((p) => p.parentId === null)!;

/** The world axis a part comes off along, and which way: away from the main part, else from its parent. */
export function wayOff(kit: Kit, part: Part): { axis: Axis; out: Vec } {
  const parent = kit.parts.find((p) => p.id === part.parentId);
  const centre = centreOf(extents([part]));
  const from = parent ? centreOf(extents([parent])) : centre;
  const away = vec(centre.x - from.x, centre.y - from.y, centre.z - from.z);
  const round = part.shape.kind === "lathe" || part.shape.kind === "torus";
  const axis = round ? dominant(latheAxis(part)) : Math.hypot(away.x, away.y, away.z) < 4 ? "y" : dominant(away);
  const root = centreOf(extents([rootPart(kit)]));
  const sign = [centre[axis] - root[axis], away[axis]].find((d) => Math.abs(d) > 0.5) ?? 1;
  return { axis, out: scale(AXIS[axis], Math.sign(sign)) };
}

/** A Pair (see templates/pair.ts) with the story's words and way off. */
export type Piece = Pair & { name: string; Name: string; parentWords: string; object: string; noun: string; k: number; size: number };

/** The object's size over a hand-tall bottle's, so motions and drops scale with it. */
export function sizeOf(kit: Kit): number {
  const { min, max } = extents(kit.parts);
  return Math.max(max.x - min.x, max.y - min.y, max.z - min.z);
}

export function pieceOf(kit: Kit, part: Part, produces: readonly string[] = [], pin: Part | null = null): Piece {
  const pair = pairOf(kit, part, produces, pin);
  const name = wordsOf(part.name);
  const size = sizeOf(kit);
  return {
    ...pair,
    ...wayOff(kit, part),
    name,
    Name: capital(name),
    parentWords: wordsOf(pair.parent.name),
    object: wordsOf(kit.name),
    noun: lastWord(name),
    size,
    k: Math.min(1.5, Math.max(0.3, size / 200)),
  };
}

/** The same move for every present part of the piece. */
export const carryAll = (ids: readonly string[], present: readonly string[], move: PartMove): Record<string, PartMove> =>
  Object.fromEntries(ids.filter((id) => present.includes(id)).map((id) => [id, move]));

/** The table: the lowest point of the present parts at rest. */
export const floorOf = ({ kit, present }: Ctx) => extents(kit.parts.filter((p) => present.includes(p.id))).min.y;

/** How far below its centre a group of parts reaches once turned by `move` (offset ignored). */
export function dropBelow(kit: Kit, ids: readonly string[], move: PartMove): number {
  const parts = drawObject({ kit, present: ids, scene: { moves: Object.fromEntries(ids.map((id) => [id, { turns: move.turns }])), marks: [] }, explode: 0, pink: new Set(), centre: vec() });
  const before = extents(kit.parts.filter((p) => ids.includes(p.id)));
  return centreOf(before).y - extents(parts).min.y;
}

/** Zones for a grip that can be too little, right, or too much. */
export const threeZones = (words: readonly [string, string, string], until: readonly [number, number]): Zone[] => [
  { id: "low", word: words[0], until: until[0], gain: 1 },
  { id: "ok", word: words[1], until: until[1], gain: 0.45 },
  { id: "high", word: words[2], until: 1, gain: 0.22 },
];

/** The middle of a control's right zone, the second of its three. */
export function okValue(c: Control): number {
  const [low, ok] = c.zones({ kit: { name: "", summary: "", parts: [] }, present: [] });
  return (low!.until + ok!.until) / 2;
}
