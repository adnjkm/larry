// The deterministic check on a generated course: can the rig measure this outside and fit the works inside it,
// and is the lesson text all there. An empty list means the course is ready for the player.
import { type Part, type Shape, kitProblems } from "../kit.ts";
import { KNOWN } from "../mechanisms/library.ts";
import { GenCourse, type GenMechanism, RIG_ROLES, type Role } from "./gen.ts";

/** The pieces a learner assembles for each entry: every one needs a Tip card. */
export const TIP_PIECES: Record<string, readonly string[]> = {
  "click-latch": ["spring", "cam"],
  "ball-tip": ["ball"],
};

/** What the checks hold a click pen to. Lengths in mm, ratios of the case's own radii. */
const LIMITS = {
  wall: { min: 0.04, max: 0.25 },
  /** Height over width, for the whole object standing up. */
  slender: 6,
  /** How far the lowest point may sit from y = 0. */
  rest: 1,
  /** How far a nose may reach up into the case, as a share of its own height. */
  noseOverlap: 0.4,
  /** The widest a tip hole may be, and the narrowest the nose's top opening may be, against the case's inner radius. */
  tipHole: 0.5,
  /** The narrowest tip hole the works' tip still passes through, in mm. */
  tipHoleMin: 1.2,
  noseMouth: 0.5,
  nameChars: 24,
  /** One line in the bubble under the name. */
  doesChars: 48,
  tipChars: 110,
} as const;

const PHRASE = /^the [a-z][a-z'-]*( [a-z][a-z'-]*)?$/;
const mm = (n: number) => Number(n.toFixed(2));

type Lathe = Extract<Shape, { kind: "lathe" }>;
type Turned = { part: Part; points: { r: number; y: number }[]; bottom: number; top: number };

/** A lathe part's profile in object heights. A kit part is placed by the middle of its own height. */
function turned(part: Part): Turned {
  const { profile } = part.shape as Lathe;
  const ys = profile.map((p) => p.y);
  const mid = (Math.min(...ys) + Math.max(...ys)) / 2;
  const points = profile.map((p) => ({ r: p.r, y: p.y - mid + part.position.y }));
  return { part, points, bottom: Math.min(...ys) - mid + part.position.y, top: Math.max(...ys) - mid + part.position.y };
}

/** Every radius at which the profile crosses height y: the smallest is the bore there, the largest the outside. */
export function radiiAt(points: { r: number; y: number }[], y: number): number[] {
  const radii: number[] = [];
  for (let i = 0; i + 1 < points.length; i++) {
    const [a, b] = [points[i]!, points[i + 1]!];
    if (a.y === b.y) continue;
    const t = (y - a.y) / (b.y - a.y);
    if (t >= 0 && t <= 1) radii.push(a.r + t * (b.r - a.r));
  }
  return radii;
}

const DEG = Math.PI / 180;

/** A point turned by a part's rotation: degrees about x, then y, then z, the order three.js applies to a mesh. */
function rotate([x, y, z]: [number, number, number], r: Part["rotation"]): [number, number, number] {
  const [cx, sx, cy, sy, cz, sz] = [Math.cos(r.x * DEG), Math.sin(r.x * DEG), Math.cos(r.y * DEG), Math.sin(r.y * DEG), Math.cos(r.z * DEG), Math.sin(r.z * DEG)];
  [x, y] = [x * cz - y * sz, x * sz + y * cz];
  [x, z] = [x * cy + z * sy, -x * sy + z * cy];
  [y, z] = [y * cx - z * sx, y * sx + z * cx];
  return [x, y, z];
}

/** Half the size of a shape's own bounding box. */
function halfSize(shape: Shape): [number, number, number] {
  switch (shape.kind) {
    case "lathe": {
      const r = Math.max(...shape.profile.map((p) => p.r));
      const ys = shape.profile.map((p) => p.y);
      return [r, (Math.max(...ys) - Math.min(...ys)) / 2, r];
    }
    case "box":
      return [shape.width / 2, shape.height / 2, shape.depth / 2];
    case "torus":
      return [shape.radius + shape.tube, shape.tube, shape.radius + shape.tube];
    case "helix":
      return [shape.radius + shape.tube, shape.length / 2, shape.radius + shape.tube];
    case "extrusion": {
      const xs = shape.outline.map((p) => p.x);
      const ys = shape.outline.map((p) => p.y);
      return [(Math.max(...xs) - Math.min(...xs)) / 2, (Math.max(...ys) - Math.min(...ys)) / 2, shape.depth / 2];
    }
  }
}

/** How far a part reaches: its lowest and highest y, and its furthest point from the y axis. */
export function reach(part: Part): { bottom: number; top: number; radius: number } {
  const [hx, hy, hz] = halfSize(part.shape);
  let [bottom, top, radius] = [Infinity, -Infinity, 0];
  for (const sx of [-1, 1])
    for (const sy of [-1, 1])
      for (const sz of [-1, 1]) {
        const [x, y, z] = rotate([sx * hx, sy * hy, sz * hz], part.rotation);
        bottom = Math.min(bottom, part.position.y + y);
        top = Math.max(top, part.position.y + y);
        radius = Math.max(radius, Math.hypot(part.position.x + x, part.position.z + z));
      }
  // A lathe standing on the axis is round, so its corners overstate it.
  if (part.shape.kind === "lathe" && onAxis(part)) radius = hx;
  return { bottom, top, radius };
}

const onAxis = (part: Part) =>
  Math.abs(part.position.x) < 0.01 && Math.abs(part.position.z) < 0.01 && Math.abs(part.rotation.x) < 0.01 && Math.abs(part.rotation.z) < 0.01;

/** Everything wrong with a generated course, in words the model can act on. Empty when it is ready. */
export function courseProblems(raw: unknown): string[] {
  const parsed = GenCourse.safeParse(raw);
  if (!parsed.success) return parsed.error.issues.map((i) => `schema: ${i.path.join(".")} ${i.message}`);
  const gen = parsed.data;
  const problems = kitProblems(gen.kit);
  const byId = new Map(gen.kit.parts.map((p) => [p.id, p]));

  for (const part of gen.kit.parts) if (part.finish === "clear") problems.push(`${part.id} has a clear finish: every part is solid-looking`);

  // Roles: each one the rigs need is a lathe standing on the axis.
  const needed = new Set<Role>();
  for (const m of gen.mechanisms) {
    const roles = RIG_ROLES[m.entry];
    if (!KNOWN.has(m.entry)) problems.push(`mechanism ${m.entry} is not in the library`);
    else if (!roles) problems.push(`mechanism ${m.entry} has no rig`);
    for (const role of roles ?? []) needed.add(role);
  }
  const role: Partial<Record<Role, Turned>> = {};
  for (const name of needed) {
    const id = gen.roles[name];
    const part = id === undefined ? undefined : byId.get(id);
    if (!part) problems.push(`role ${name} names no part of the kit`);
    else if (part.shape.kind !== "lathe") problems.push(`${name} (${part.id}) must be a lathe`);
    else if (!onAxis(part)) problems.push(`${name} (${part.id}) must stand on the y axis: x = z = 0 and no rotation`);
    else role[name] = turned(part);
  }

  const rolePartIds = new Set(Object.values(gen.roles));
  for (const part of gen.kit.parts) {
    if (rolePartIds.has(part.id) || part.parentId === null) continue;
    if (!rolePartIds.has(part.parentId)) problems.push(`${part.id} must be fixed to a role part (${[...rolePartIds].join(", ")}), not to ${part.parentId}`);
  }

  const { case: body, nose, button } = role;
  let inner: number | undefined;
  let outer: number | undefined;
  if (body) {
    if (body.part.parentId !== null) problems.push(`the case (${body.part.id}) must be the root part: parentId null`);
    const mid = radiiAt(body.points, (body.bottom + body.top) / 2);
    if (mid.length < 2) problems.push(`the case (${body.part.id}) has no wall at mid height: run its profile up the outside and back down the inside`);
    else {
      inner = Math.min(...mid);
      outer = Math.max(...mid);
      const wall = (outer - inner) / outer;
      if (inner <= 0) problems.push(`the case (${body.part.id}) is solid: its inner radius must be above 0`);
      else if (wall < LIMITS.wall.min || wall > LIMITS.wall.max)
        problems.push(`the case wall is ${mm(outer - inner)} mm on an outer radius of ${mm(outer)} mm: keep it between ${LIMITS.wall.min * 100}% and ${LIMITS.wall.max * 100}%`);
      const narrowest = Math.min(...body.points.map((p) => p.r));
      if (inner > 0 && narrowest < inner * 0.6)
        problems.push(`the case (${body.part.id}) narrows to r = ${mm(narrowest)}: it must stay open at both ends (a cap that narrows the top is a separate part)`);
    }
  }

  if (nose) {
    const hole = Math.min(...radiiAt(nose.points, nose.bottom));
    const height = nose.top - nose.bottom;
    const mouth = Math.min(...radiiAt(nose.points, nose.top - height * 0.02));
    if (Math.min(...nose.points.map((p) => p.r)) <= 0) problems.push(`the nose (${nose.part.id}) touches r = 0: it is hollow, with a tip hole at the bottom and an open top`);
    else if (inner !== undefined && hole > inner * LIMITS.tipHole) problems.push(`the nose's tip hole (r = ${mm(hole)}) is too wide: under half the case's inner radius`);
    if (hole > 0 && hole < LIMITS.tipHoleMin) problems.push(`the nose's tip hole (r = ${mm(hole)}) is too narrow for the tip: at least ${LIMITS.tipHoleMin} mm`);
    if (radiiAt(nose.points, (nose.bottom + nose.top) / 2).length < 2) problems.push(`the nose (${nose.part.id}) has no wall: run its profile up the outside and back down the inside`);
    if (inner !== undefined && mouth < inner * LIMITS.noseMouth) problems.push(`the nose's top opening (r = ${mm(mouth)}) is too narrow for the works: at least half the case's inner radius`);
    if (Math.abs(nose.bottom) > LIMITS.rest) problems.push(`the nose's tip is at y = ${mm(nose.bottom)}: it rests at y = 0`);
    if (body) {
      if (nose.top < body.bottom - 0.2) problems.push(`the nose stops at y = ${mm(nose.top)}, short of the case's bottom at y = ${mm(body.bottom)}`);
      if (nose.top > body.bottom + height * LIMITS.noseOverlap) problems.push(`the nose reaches y = ${mm(nose.top)}, too far into the case that starts at y = ${mm(body.bottom)}`);
      if (nose.bottom >= body.bottom) problems.push("the nose must hang below the case");
    }
  }

  if (button && body) {
    const stem = Math.max(...radiiAt(button.points, button.bottom + (button.top - button.bottom) * 0.02));
    if (button.top <= body.top + 1) problems.push(`the button's top (y = ${mm(button.top)}) must stand above the case's top (y = ${mm(body.top)})`);
    if (button.bottom > body.top + 0.2) problems.push(`the button's stem (bottom y = ${mm(button.bottom)}) must enter the case's top (y = ${mm(body.top)})`);
    if (button.bottom < body.top - (body.top - body.bottom) * 0.25) problems.push("the button's stem reaches too far down the case");
    if (inner !== undefined && stem >= inner) problems.push(`the button's stem (r = ${mm(stem)}) must be narrower than the case's inner radius (${mm(inner)})`);
  }

  // The whole object: upright, resting on the ground, nothing flung far from it.
  const reaches = gen.kit.parts.map((part) => ({ part, ...reach(part) }));
  if (reaches.length > 0) {
    const bottom = Math.min(...reaches.map((r) => r.bottom));
    const top = Math.max(...reaches.map((r) => r.top));
    const width = 2 * Math.max(...reaches.map((r) => r.radius));
    if (Math.abs(bottom) > LIMITS.rest) problems.push(`the object's lowest point is y = ${mm(bottom)}: it rests on y = 0`);
    if (top - bottom < LIMITS.slender * width) problems.push(`the object is ${mm(top - bottom)} mm tall and ${mm(width)} mm wide: it must stand upright, at least ${LIMITS.slender} times as tall as wide`);
    if (outer !== undefined) {
      for (const r of reaches) {
        if (r.radius > outer * 2.5) problems.push(`${r.part.id} reaches ${mm(r.radius)} mm from the axis, far outside the case (r = ${mm(outer)})`);
        if (r.bottom < bottom - 0.01 || r.top > (button?.top ?? top) + 1) problems.push(`${r.part.id} sits outside the object's height`);
      }
    }
  }

  if (gen.object.trim().length === 0 || gen.object.length > LIMITS.nameChars) problems.push(`object name must be 1 to ${LIMITS.nameChars} characters`);
  return [...problems, ...textProblems(gen.mechanisms)];
}

/** Everything wrong with the lesson's lines alone: names, the line under each, slot words and tips. */
export function textProblems(mechanisms: GenMechanism[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const m of mechanisms) {
    if (seen.has(m.entry)) problems.push(`mechanism ${m.entry} is listed twice`);
    seen.add(m.entry);
    if (m.name.trim().length === 0 || m.name.length > LIMITS.nameChars || m.name.trim().split(/\s+/).length > 3) problems.push(`${m.entry} name "${m.name}" must be one to three words`);
    if (m.does.trim().length < 12 || m.does.length > LIMITS.doesChars) problems.push(`${m.entry} does "${m.does}" must be one line of 12 to ${LIMITS.doesChars} characters`);
    const slots = new Set(KNOWN.get(m.entry)?.slots.map((s) => s.id));
    for (const [slot, phrase] of Object.entries(m.words)) {
      if (!slots.has(slot)) problems.push(`${m.entry} has no slot "${slot}"`);
      else if (!PHRASE.test(phrase) || phrase.length > 28) problems.push(`${m.entry} word for ${slot}, "${phrase}", must be "the" and one or two lowercase words`);
    }
    for (const piece of TIP_PIECES[m.entry] ?? []) {
      const tips = m.tips[piece];
      if (!tips || tips.length < 2) problems.push(`${m.entry} needs two to four tip lines for the ${piece}`);
      for (const line of tips ?? []) {
        if (line.trim().length < 12 || line.length > LIMITS.tipChars) problems.push(`${m.entry} ${piece} tip "${line}" must be 12 to ${LIMITS.tipChars} characters`);
        if (line.includes("!")) problems.push(`${m.entry} ${piece} tip "${line}" has an exclamation mark`);
      }
    }
  }
  return problems;
}
