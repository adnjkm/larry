// Lessons generated from any kit, for objects without a hand-written lesson. Each mechanism has a
// template (templates/<family>.ts) that turns one child part and its parent into a Workshop module;
// evidence.ts says which template a part gets. The lesson picks at most MAX_MODULES of them and plays
// them in kit-tree order.
import type { Kit, Part } from "../../../shared/kit.ts";
import { DEFAULT_VIEW, defineLesson, type View, type Workshop } from "../model.ts";
import { centreOf, extents } from "../pose.ts";
import { type Reading, readPart } from "./evidence.ts";
import { pairOf, type Template } from "./pair.ts";
import { sealTemplate } from "./seal.ts";

export type { Pair, Template } from "./pair.ts";
export { EVIDENCE, JOINT_TEMPLATES, readPart } from "./evidence.ts";

const MAX_MODULES = 3;

/** An object this flat (height over its widest footprint) lies on the table, and is seen from higher up. */
const FLAT = 0.2;
const FLAT_ELEVATION = 45;
const AZIMUTHS = [DEFAULT_VIEW.azimuth, -DEFAULT_VIEW.azimuth, 180 - DEFAULT_VIEW.azimuth, DEFAULT_VIEW.azimuth - 180];

/**
 * The default view, mirrored left to right or front to back. Of the mirrors that turn the earned parts
 * toward the camera (a flashlight's head, its tested end, should not be drawn behind its body), the one
 * that shows the object widest, since the viewer leaves room to turn it and a narrow side wastes the
 * card. Seen from higher up when the object lies flat (scissors seen edge on are two lines).
 */
function facing(kit: Kit, earned: readonly string[]): View {
  const all = extents(kit.parts);
  const size = Math.max(all.max.x - all.min.x, all.max.z - all.min.z);
  const elevation = all.max.y - all.min.y < FLAT * size ? FLAT_ELEVATION : DEFAULT_VIEW.elevation;
  const c = centreOf(all);
  const e = centreOf(extents(kit.parts.filter((p) => earned.includes(p.id))));
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

const volume = (p: Part) => {
  const { min, max } = extents([p]);
  return (max.x - min.x) * (max.y - min.y) * (max.z - min.z);
};

/**
 * The generated lesson for a kit, or null when nothing in it moves or seals (molded, glued, welded,
 * fixed-rivet or sliding parts only). One module per template, for its largest part, keeping the
 * MAX_MODULES largest; a module earns its part and the parts below it that no other module earns.
 * Modules run parents first, and seals last: a seal is tested by opening what closes over it, so
 * that part is built first.
 */
export function generatedLesson(kit: Kit, id = "generated"): Workshop | null {
  const byTemplate = new Map<Template, { part: Part; reading: Reading }>();
  for (const part of kit.parts) {
    const reading = readPart(kit, part);
    if (!reading) continue;
    const best = byTemplate.get(reading.template);
    if (!best || volume(part) > volume(best.part)) byTemplate.set(reading.template, { part, reading });
  }
  if (byTemplate.size === 0) return null;
  const parentOf = (p: Part) => kit.parts.find((q) => q.id === p.parentId);
  const depth = (p: Part): number => {
    const up = parentOf(p);
    return up ? 1 + depth(up) : 0;
  };
  const last = (t: Template) => (t === sealTemplate ? 1 : 0);
  const chosen = [...byTemplate.values()].sort((a, b) => volume(b.part) - volume(a.part)).slice(0, MAX_MODULES)
    .sort((a, b) => last(a.reading.template) - last(b.reading.template) || depth(a.part) - depth(b.part) || kit.parts.indexOf(a.part) - kit.parts.indexOf(b.part));
  const claimed = new Set(chosen.map((c) => c.part.id));
  const earns = (p: Part): string[] => [p.id, ...kit.parts.filter((q) => q.parentId === p.id && !claimed.has(q.id)).flatMap(earns)];
  const modules = chosen.map(({ part, reading }) => reading.template.module(pairOf(kit, part, earns(part), reading.pin)));
  const tests = modules.flatMap((m) => m.tests);
  return defineLesson({
    id,
    objectName: kit.name,
    match: /(?!)/,
    modules,
    view: facing(kit, modules.flatMap((m) => m.produces)),
    final: {
      need: `It must pass all ${tests.length} tests at once.`,
      success: `You built the ${kit.name.toLowerCase()}.`,
      detail: `Every joint passes its tests together.`,
      tests,
    },
  });
}
