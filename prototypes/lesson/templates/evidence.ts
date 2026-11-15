// Which template a part gets. Usually its joint decides, but Claude's kit gives every part one joint
// label, and sometimes the label hides the mechanism the kit's own words describe: a rubber seal
// labelled press-fit or glue, or a pivot labelled rivet (scissors' blades on their pivot rivet). The
// rules below believe the kit's own words over its joint label, and nothing else: no guess from
// shape, and nothing about what such objects usually have.
//
// The root fix belongs in the kit prompt (server/generateKit.ts, which this prototype does not edit):
// ask for `hinge` whenever a part turns on a pin, and say which joint a seal or gasket should get.
import type { Joint, Kit, Part } from "../../../shared/kit.ts";
import { clampTemplate } from "./clamp.ts";
import { hingeTemplate } from "./hinge.ts";
import type { Template } from "./pair.ts";
import { pressFitTemplate } from "./press-fit.ts";
import { sealTemplate } from "./seal.ts";
import { snapFitTemplate } from "./snap-fit.ts";
import { springTemplate } from "./spring.ts";
import { threadTemplate } from "./thread.ts";

/** Templates a joint label alone picks. */
export const JOINT_TEMPLATES: readonly Template[] = [threadTemplate, pressFitTemplate, snapFitTemplate, springTemplate, hingeTemplate];

export type Evidence = {
  id: "seal" | "pivot" | "clamp";
  template: Template;
  /** The joint labels this rule reads past: "any" for every attached part. */
  joints: readonly Joint[] | "any";
  /** Words that say what a part is, in its own name and in its role. */
  name: RegExp;
  role: RegExp;
  /**
   * Whose words count. "self": the part's own. "pin": those of the part it is joined to (its parent,
   * the pin it turns on), or a clause of the kit summary that names that pin.
   */
  whose: "self" | "pin";
};

const PIVOT = /\b(pivot|pivots|pivoting|hinge|hinged|turn|turns|swing|swings)\b/i;

export const EVIDENCE: readonly Evidence[] = [
  // Role words are verbs and adjectives, so "a tab on the seal ring" does not make the tab a seal.
  {
    id: "seal",
    template: sealTemplate,
    joints: "any",
    name: /\b(seal|o-?ring|gasket)\b/i,
    role: /\b(seals|sealing|airtight|watertight|leak-?proof)\b|\bkeeps? (water|air|liquid) (out|in)\b/i,
    whose: "self",
  },
  // A rivet that the kit says turns is a pivot: the part riveted to it turns, as a lever. Fixed rivets stay fixed.
  { id: "pivot", template: hingeTemplate, joints: ["rivet"], name: PIVOT, role: PIVOT, whose: "pin" },
  // A rivet or screw whose own words say it holds parts together and lets them turn is a grip that
  // clamps them: a scissors' pivot rivet. Its name alone counts when it is called a pivot.
  {
    id: "clamp",
    template: clampTemplate,
    joints: ["rivet", "screw"],
    name: /\bpivot\b/i,
    role: /^(?=.*\b(together|tight)\b)(?=.*\b(turn|turns|pivot|pivots|swing|swings)\b)/i,
    whose: "self",
  },
];

export type Reading = { template: Template; pin: Part | null; evidence: Evidence["id"] | null };

const says = (rule: Evidence, p: Part) => rule.name.test(p.name) || rule.role.test(p.role);

/** A summary clause that names the part (by its last word) and also says it pivots. */
const summarySays = (rule: Evidence, kit: Kit, p: Part) => {
  const noun = p.name.toLowerCase().split(/\s+/).pop()!;
  return kit.summary.split(/[.;,:]/).some((clause) => clause.toLowerCase().includes(noun) && rule.role.test(clause));
};

/** The template for an attached part, read from the kit's own words first and its joint label second. */
export function readPart(kit: Kit, part: Part): Reading | null {
  if (part.joint === null) return null;
  const parent = kit.parts.find((p) => p.id === part.parentId);
  if (!parent) return null;
  for (const rule of EVIDENCE) {
    if (rule.joints !== "any" && !rule.joints.includes(part.joint)) continue;
    if (rule.whose === "self" && says(rule, part)) return { template: rule.template, pin: null, evidence: rule.id };
    if (rule.whose === "pin" && (says(rule, parent) || summarySays(rule, kit, parent))) return { template: rule.template, pin: parent, evidence: rule.id };
  }
  const template = JOINT_TEMPLATES.find((t) => t.joints.includes(part.joint!));
  return template ? { template, pin: null, evidence: null } : null;
}
