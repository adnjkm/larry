// Lessons generated from any kit's joints, for objects without a hand-written lesson. Each joint
// family has a template (templates/<family>.ts) that turns one child part and its parent into a
// Workshop module; the lesson picks at most MAX_MODULES of them and plays them in kit-tree order.
import type { Joint, Kit, Part } from "../../../shared/kit.ts";
import { defineLesson, type Workshop } from "../model.ts";
import { extents } from "../pose.ts";
import { hingeTemplate } from "./hinge.ts";
import { pairOf, type Template } from "./pair.ts";
import { pressFitTemplate } from "./press-fit.ts";
import { snapFitTemplate } from "./snap-fit.ts";
import { springTemplate } from "./spring.ts";
import { threadTemplate } from "./thread.ts";

export type { Pair, Template } from "./pair.ts";

export const TEMPLATES: readonly Template[] = [threadTemplate, pressFitTemplate, snapFitTemplate, springTemplate, hingeTemplate];

const MAX_MODULES = 3;

const templateFor = (joint: Joint | null) => (joint ? TEMPLATES.find((t) => t.joints.includes(joint)) : undefined);

const volume = (p: Part) => {
  const { min, max } = extents([p]);
  return (max.x - min.x) * (max.y - min.y) * (max.z - min.z);
};

/**
 * The generated lesson for a kit, or null when none of its joints moves (molded, glued, welded,
 * riveted or sliding parts only). One module per joint family, for that family's largest child,
 * keeping the MAX_MODULES largest; a module earns its child and the parts below it that no other
 * module earns, and modules run parents first.
 */
export function generatedLesson(kit: Kit, id = "generated"): Workshop | null {
  const byTemplate = new Map<Template, Part>();
  for (const part of kit.parts) {
    const template = templateFor(part.joint);
    if (!template || !kit.parts.some((p) => p.id === part.parentId)) continue;
    const best = byTemplate.get(template);
    if (!best || volume(part) > volume(best)) byTemplate.set(template, part);
  }
  if (byTemplate.size === 0) return null;
  const parentOf = (p: Part) => kit.parts.find((q) => q.id === p.parentId);
  const depth = (p: Part): number => {
    const up = parentOf(p);
    return up ? 1 + depth(up) : 0;
  };
  const chosen = [...byTemplate].sort(([, a], [, b]) => volume(b) - volume(a)).slice(0, MAX_MODULES)
    .sort(([, a], [, b]) => depth(a) - depth(b) || kit.parts.indexOf(a) - kit.parts.indexOf(b));
  const claimed = new Set(chosen.map(([, p]) => p.id));
  const earns = (p: Part): string[] => [p.id, ...kit.parts.filter((q) => q.parentId === p.id && !claimed.has(q.id)).flatMap(earns)];
  const modules = chosen.map(([template, child]) => template.module(pairOf(kit, child, earns(child))));
  const tests = modules.flatMap((m) => m.tests);
  return defineLesson({
    id,
    objectName: kit.name,
    match: /(?!)/,
    modules,
    final: {
      need: `It must pass all ${tests.length} tests at once.`,
      success: `You built the ${kit.name.toLowerCase()}.`,
      detail: `Every joint passes its tests together.`,
      tests,
    },
  });
}
