// Lessons generated from any kit, for objects without a hand-written lesson. Each mechanism has a
// template (templates/<family>.ts) that turns one child part and its parent into a Workshop module;
// evidence.ts says which template a part gets. An object that stands gets a whole-object module too
// (stand.ts), which earns its root part. The lesson picks at most MAX_MODULES of them and plays them
// in kit-tree order.
import type { Kit, Part } from "../../../shared/kit.ts";
import { defineLesson, type ModuleSpec, type Workshop } from "../model.ts";
import { extents, facingView } from "../pose.ts";
import { readPart } from "./evidence.ts";
import { pairOf, type Template } from "./pair.ts";
import { standModule, standOf } from "./stand.ts";

export type { Pair, Template } from "./pair.ts";
export { EVIDENCE, JOINT_TEMPLATES, readPart } from "./evidence.ts";
export { standOf } from "./stand.ts";

/**
 * One module per primitive the kit's own words and joints support. Four covers a jar's stand, thread,
 * lid and seal; the cap keeps a lesson to one sitting when a kit has more.
 */
const MAX_MODULES = 4;

const volume = (p: Part) => {
  const { min, max } = extents([p]);
  return (max.x - min.x) * (max.y - min.y) * (max.z - min.z);
};

/** A module the kit could have: the part it is about, and how to build it once the parts it earns are known. */
type Candidate = { part: Part; last: boolean; build: (earns: readonly string[]) => ModuleSpec };

/**
 * The generated lesson for a kit, or null when nothing in it moves, seals or stands. One module per
 * joint template, for its largest part, and one for standing; the MAX_MODULES largest are kept. A
 * module earns its part and the parts below it that no other module earns. Modules run parents first,
 * and templates marked `last` (a seal, a pin's clamp) after the rest: they are tested by working the
 * parts they hold or close over, so those are built first.
 */
export function generatedLesson(kit: Kit, id = "generated"): Workshop | null {
  const byTemplate = new Map<Template, Candidate>();
  for (const part of kit.parts) {
    const reading = readPart(kit, part);
    if (!reading) continue;
    const { template, pin } = reading;
    if (template.applies && !template.applies(pairOf(kit, part, [part.id], pin))) continue;
    const best = byTemplate.get(template);
    if (!best || volume(part) > volume(best.part))
      byTemplate.set(template, { part, last: template.last === true, build: (earns) => template.module(pairOf(kit, part, earns, pin)) });
  }
  const stand = standOf(kit);
  const candidates = [...byTemplate.values(), ...(stand ? [{ part: stand.root, last: false, build: (earns: readonly string[]) => standModule(stand, earns) }] : [])];
  if (candidates.length === 0) return null;
  const parentOf = (p: Part) => kit.parts.find((q) => q.id === p.parentId);
  const depth = (p: Part): number => {
    const up = parentOf(p);
    return up ? 1 + depth(up) : 0;
  };
  const chosen = candidates.sort((a, b) => volume(b.part) - volume(a.part)).slice(0, MAX_MODULES)
    .sort((a, b) => Number(a.last) - Number(b.last) || depth(a.part) - depth(b.part) || kit.parts.indexOf(a.part) - kit.parts.indexOf(b.part));
  const claimed = new Set(chosen.map((c) => c.part.id));
  const earns = (p: Part): string[] => [p.id, ...kit.parts.filter((q) => q.parentId === p.id && !claimed.has(q.id)).flatMap(earns)];
  const modules = chosen.map((c) => c.build(earns(c.part)));
  const tests = modules.flatMap((m) => m.tests);
  return defineLesson({
    id,
    objectName: kit.name,
    match: /(?!)/,
    modules,
    view: facingView(kit, modules.flatMap((m) => m.produces)),
    final: {
      need: `It must pass all ${tests.length} tests at once.`,
      success: `You built the ${kit.name.toLowerCase()}.`,
      detail: modules.length > 1 ? `Every part passes its tests together.` : `It passes every test.`,
      tests,
    },
  });
}
