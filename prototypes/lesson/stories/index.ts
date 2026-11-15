// Story lessons generated from any kit, told like the water bottle: each part's failure first, Learn in
// words, drag the piece on, then make it work with a wordless grip. templates/evidence.ts says which
// mechanism a part is, as for the Workshop; each mechanism with a story template becomes a module:
// a thread or a tight fit (closure.ts), a seal (seal.ts), a spring (spring.ts), a hinge or pin
// (hinge.ts), and, when none of those applies, standing up (stand.ts). Snap-fits and pins that clamp
// have no story template; their parts are built with the module above them. A template that cannot
// read a part is left out, so an odd kit still gets the modules it can.
import type { Kit, Part } from "../../../shared/kit.ts";
import { defineStory, listOf, type Scene, type Story, type StoryModuleSpec, type Test } from "../model.ts";
import { extents, facingView } from "../pose.ts";
import { readPart } from "../templates/evidence.ts";
import { closerOf } from "../templates/seal.ts";
import { standOf } from "../templates/stand.ts";
import { type Closure, closerModule, closureOf, turnMarkOf } from "./closure.ts";
import { explodePlanOf } from "./explode.ts";
import { hingeModule } from "./hinge.ts";
import { capital, fit, pieceOf, WORDS, wordsOf } from "./piece.ts";
import { sealModule } from "./seal.ts";
import { springModule, springPartsOf } from "./spring.ts";
import { storyStand } from "./stand.ts";

/** Four covers a jar's stand, thread, lid and seal; more would not fit one sitting. */
const MAX_MODULES = 4;

type Kind = "twist" | "press" | "seal" | "spring" | "hinge" | "stand";
type Spec = StoryModuleSpec & { payoff: { part: string; job: string } };
/** A module the kit could have: the part it is about, the parts it is built around, and how to make it. */
type Candidate = {
  kind: Kind;
  part: Part;
  anchors: readonly string[];
  last: boolean;
  build: (earns: (ids: readonly string[]) => string[], closures: (p: Part) => Closure) => Spec;
};

const volume = (p: Part) => {
  const { min, max } = extents([p]);
  return (max.x - min.x) * (max.y - min.y) * (max.z - min.z);
};

/** A tight fit is only a fair lesson when the part can come off: nothing of its parent sits beyond it the way it leaves. */
function comesOff(kit: Kit, part: Part): boolean {
  const piece = pieceOf(kit, part);
  const far = (b: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } }) =>
    Math.max(b.min[piece.axis] * piece.out[piece.axis], b.max[piece.axis] * piece.out[piece.axis]);
  const own = extents([part]);
  const parent = extents([piece.parent]);
  const across = (["x", "y", "z"] as const).filter((a) => a !== piece.axis).every((a) => own.min[a] < parent.max[a] && parent.min[a] < own.max[a]);
  return !(across && far(parent) > far(own) + 0.5);
}

function candidatesOf(kit: Kit): Candidate[] {
  const out: Candidate[] = [];
  for (const part of kit.parts) {
    const reading = readPart(kit, part);
    if (!reading) continue;
    const primitive = reading.template.primitive;
    if (primitive === "thread" || (primitive === "grip" && reading.evidence === null && comesOff(kit, part))) {
      const kind = primitive === "thread" ? "twist" : "press";
      out.push({
        kind,
        part,
        anchors: [part.id],
        last: false,
        build: (earns, closures) => {
          const produces = earns([part.id]);
          return closerModule(closures(part), produces, produces);
        },
      });
    } else if (primitive === "seal") {
      out.push({
        kind: "seal",
        part,
        anchors: [part.id],
        last: true,
        build: (earns, closures) => sealModule(pieceOf(kit, part), closures(closerOf(kit, part)), earns([part.id])),
      });
    } else if (primitive === "spring") {
      const springs = springPartsOf(kit, part);
      out.push({
        kind: "spring",
        part,
        anchors: [part.id, ...springs],
        last: false,
        build: (earns) => {
          const adds = earns([part.id]);
          return springModule(pieceOf(kit, part), springs, [...adds, ...earns(springs)], adds);
        },
      });
    } else if (primitive === "lever") {
      const pin = reading.pin && reading.pin.parentId !== null ? reading.pin : null;
      out.push({
        kind: "hinge",
        part,
        anchors: pin ? [pin.id, part.id] : [part.id],
        last: false,
        build: (earns) => {
          const adds = earns([part.id]);
          return hingeModule(pieceOf(kit, part, [], reading.pin), pin ? [...new Set([...earns([pin.id]), ...adds])] : adds, adds);
        },
      });
    }
  }
  // Standing is taught only when nothing else is: its module builds the main part, so with any other
  // module the first Build would drag the whole object onto its own outline.
  const stand = out.length === 0 ? standOf(kit) : null;
  if (stand)
    out.push({
      kind: "stand",
      part: stand.root,
      anchors: [stand.root.id],
      last: false,
      build: (earns) => {
        const produces = earns([stand.root.id]);
        return storyStand(stand, produces, produces);
      },
    });
  return out;
}

/**
 * The generated story for a kit, or null when no story template applies. It reads only the kit and the
 * primitive library, so it runs at once on a kit still streaming in: given the parts so far (a part
 * whose parent has not arrived is skipped), it returns the modules those parts support. One module per mechanism,
 * for its largest part; the MAX_MODULES largest are kept and play parents first, seals last (they
 * are squeezed by the parts they sit under, so those are built first). A module earns the parts it is
 * built around and the parts below them that no other module earns. `strict` rethrows a template that
 * fails on this kit instead of leaving its module out.
 */
export function generatedStory(kit: Kit, id = "story", strict = false): Story | null {
  const best = new Map<Kind, Candidate>();
  for (const c of candidatesOf(kit)) {
    const seen = best.get(c.kind);
    if (!seen || volume(c.part) > volume(seen.part)) best.set(c.kind, c);
  }
  const depth = (p: Part): number => {
    const up = kit.parts.find((q) => q.id === p.parentId);
    return up ? 1 + depth(up) : 0;
  };
  // Two modules cannot be built around the same part: the larger keeps it.
  const kept: Candidate[] = [];
  for (const c of [...best.values()].sort((a, b) => volume(b.part) - volume(a.part)))
    if (kept.length < MAX_MODULES && !kept.some((k) => k.anchors.some((a) => c.anchors.includes(a)))) kept.push(c);
  const chosen = kept.sort((a, b) => Number(a.last) - Number(b.last) || depth(a.part) - depth(b.part) || kit.parts.indexOf(a.part) - kit.parts.indexOf(b.part));
  if (chosen.length === 0) return null;

  const seals = chosen.filter((c) => c.kind === "seal").map((c) => c.part);
  const closures = new Map<string, Closure>();
  const closureFor = (p: Part) => {
    const known =
      closures.get(p.id) ??
      closureOf(
        kit,
        p,
        seals.filter((s) => closerOf(kit, s).id === p.id).map((s) => s.id),
      );
    closures.set(p.id, known);
    return known;
  };
  const modules: Spec[] = [];
  for (const c of chosen) {
    const others = new Set(chosen.filter((o) => o !== c).flatMap((o) => o.anchors));
    const earn = (id: string): string[] => [id, ...kit.parts.filter((q) => q.parentId === id && !others.has(q.id)).flatMap((q) => earn(q.id))];
    const earns = (ids: readonly string[]) => [...new Set(ids.flatMap(earn))];
    try {
      modules.push(c.build(earns, closureFor));
    } catch (error) {
      if (strict) throw error;
      console.warn(`story ${id}: left out the ${c.kind} module for ${c.part.id}:`, error);
    }
  }
  if (modules.length === 0) return null;
  // A part earned twice (a seal's closer below it) stays with the first module that earns it.
  const owned = new Set<string>();
  for (const m of modules) {
    m.produces = m.produces.filter((p) => !owned.has(p));
    m.produces.forEach((p) => owned.add(p));
  }

  const object = wordsOf(kit.name);
  const noun = object.split(" ").pop()!;
  const tests = [...new Map(modules.flatMap((m) => m.play.tests).map((t): [string, Test] => [t.id, t])).values()];
  const labels = [...new Set(tests.map((t) => t.label.toLowerCase()))];
  const say = `${capital(listOf(labels))} it.`;
  const DONE: Record<string, string> = { seal: "sealed!", thread: "closed!", spring: "snaps!", weight: "stands!" };
  const twisted = [...closures.values()].filter((c) => c.kind === "twist");
  try {
    return defineStory({
      id,
      objectName: capital(object),
      match: /(?!)/,
      build: "drag",
      explode: explodePlanOf(kit),
      view: facingView(
        kit,
        modules.flatMap((m) => m.produces),
      ),
      rest: (ctx): Scene => ({
        moves: {},
        marks: twisted.filter((c) => ctx.present.includes(c.piece.child.id)).map((c) => ({ ...turnMarkOf(c), id: `turn-${c.piece.child.id}` })),
      }),
      modules: modules.map(({ payoff: _, ...m }) => m),
      final: {
        title: "Put it together",
        say: say.split(/\s+/).length <= WORDS ? say : "Try every test.",
        success: fit((n) => `You built the ${n}.`, object),
        cheer: `${capital(noun)} ${DONE[modules[modules.length - 1]!.primitive] ?? "built!"}`,
        control: modules[0]!.play.control,
        tests,
        why: ["Each part has one job, and it needs them all.", "Take one away and it stops working."],
        payoff: [...new Map(modules.map((m) => [m.payoff.part, m.payoff])).values()],
      },
    });
  } catch (error) {
    if (strict) throw error;
    console.warn(`story ${id}: generated copy broke a story rule:`, error);
    return null;
  }
}
