// A part on a spring joint: pressed, it gives; let go, the spring pushes it back. Without the spring
// (the parts the kit itself calls a spring, else the joint) it stays wherever the hand leaves it.
// The player sets the spring's stiffness: too soft loses to friction, too stiff beats a hand.
import type { Kit, Part, Shape } from "../../../shared/kit.ts";
import { clamp01, easeOut, smooth } from "../../../shared/primitives/motion/ease.ts";
import { type Control, type Ctx, type Mark, type Run, type StoryModuleSpec, type Test, type TestCtx, type Values, type Vec, vec, zoneAt } from "../model.ts";
import { centreOf, extents } from "../pose.ts";
import { arrowMark, latheAxis, overlay } from "../templates/pair.ts";
import { motionOf, SPRING_WORDS, TRAVEL } from "../templates/spring.ts";
import { targetFor } from "./closure.ts";
import { below, capital, carryAll, fit, okValue, type Piece, rootPart, threeZones, wordsOf } from "./piece.ts";

const ZONES = threeZones(["Soft", "Firm", "Stiff"], [0.4, 0.75]);
/** How far a hand gets a stiff spring pressed, as a share of the full press. */
const STIFF_DEPTH = 0.45;
const PRESS = 700;
const HOLD = 500;
const POP = 500;
const TAIL = 600;

/** The kit's own spring parts beside this child, with everything below them: the parts this module builds with it. */
export function springPartsOf(kit: Kit, child: Part): string[] {
  const above = new Set<string>();
  for (let at: Part | undefined = child; at; at = kit.parts.find((p) => p.id === at!.parentId)) above.add(at.id);
  const said = kit.parts.filter((p) => !above.has(p.id) && p.id !== rootPart(kit).id && (SPRING_WORDS.test(p.name) || SPRING_WORDS.test(p.role)));
  const tops = said.filter((p) => !said.some((q) => q.id === p.parentId));
  return [...new Set(tops.flatMap((p) => below(kit, p.id)))].filter((id) => !below(kit, child.id).includes(id));
}

const WIRE = 4;
/** The axis a spring part winds round, as the Euler turn that stands a helix (drawn along y) on it. */
function standOn(p: Part | undefined): Vec {
  if (!p || (p.shape.kind !== "lathe" && p.shape.kind !== "torus" && p.shape.kind !== "helix")) return vec();
  const a = latheAxis(p);
  return Math.abs(a.x) > 0.7 ? vec(0, 0, 90) : Math.abs(a.z) > 0.7 ? vec(90, 0, 0) : vec();
}

export function springModule(
  piece: Piece,
  springs: readonly string[],
  produces: readonly string[],
  adds: readonly string[],
): StoryModuleSpec & { payoff: { part: string; job: string } } {
  const { kit, child } = piece;
  const motion = motionOf(piece);
  const jaw = motion.kind === "jaw";
  const key = `spring-${child.id}`;
  const missing = `${key}-missing`;
  const valueOf = (v: Values) => v[key] ?? 0;
  const sprung = (v: Values, ctx: Ctx) => v[missing] !== 1 && springs.every((id) => ctx.present.includes(id));
  const springName = springs.length > 0 ? wordsOf(kit.parts.find((p) => p.id === springs[0])!.name) : "spring";
  const c = piece.name;

  // A purple coil of wire where the spring sits, thicker the stiffer it is.
  const springBox = springs.length > 0 ? extents(kit.parts.filter((p) => springs.includes(p.id))) : null;
  const at = springBox
    ? centreOf(springBox)
    : vec(
        piece.centre.x - piece.out.x * piece.half[piece.axis],
        piece.centre.y - piece.out.y * piece.half[piece.axis],
        piece.centre.z - piece.out.z * piece.half[piece.axis],
      );
  const span = springBox
    ? Math.max(springBox.max.x - springBox.min.x, springBox.max.y - springBox.min.y, springBox.max.z - springBox.min.z) / 2
    : 0.3 * Math.min(piece.half.x, piece.half.y, piece.half.z);
  const radius = Math.max(1.5, 0.5 * span);
  const wire = (v: number): Mark => {
    const shape: Shape = { kind: "helix", radius, tube: radius * (0.08 + 0.2 * v), length: Math.max(3 * radius, 1.2 * span), turns: WIRE };
    return { id: "spring-wire", shape, at, rotation: standOn(kit.parts.find((p) => p.id === springs[0])), ride: springs[0] ?? child.id };
  };

  const control: Control = { key, verb: "Spring", start: 0, zones: () => ZONES, pose: (v) => ({ moves: {}, marks: [wire(v)] }) };

  /** The hand presses as far as it can, holds, and lets go. */
  const pressRelease = (values: Values, ctx: TestCtx, verdict: Run["verdict"]): Run => {
    const zone = zoneAt(ZONES, valueOf(values)).id;
    const depth = TRAVEL * (zone === "high" ? STIFF_DEPTH : 1);
    const back = sprung(values, ctx) && zone !== "low";
    const hand = arrowMark("hand", motion.hand.at, motion.hand.dir, child.id);
    const pose = (mm: number) => carryAll(piece.subtree, ctx.present, motion.move(mm));
    const marks = (extra: Mark[]) => (sprung(values, ctx) ? [wire(valueOf(values)), ...extra] : extra);
    const letGo = PRESS + HOLD;
    return {
      verdict,
      durationMs: letGo + POP + TAIL,
      at: (ms) => {
        if (ms < PRESS) return overlay("Pressing…", pose(depth * smooth(ms / PRESS)), marks([hand]));
        if (ms < letGo) return overlay(depth < TRAVEL ? "Stuck partway" : "Pressed", pose(depth), marks([hand]));
        const p = easeOut(clamp01((ms - letGo) / POP));
        if (back) return overlay(jaw ? "Let go. It snaps shut" : "Let go. It springs back", pose(depth * (1 - p)), marks([]));
        return overlay(jaw ? "Let go. It stays open" : "Let go. It stays in", pose(depth - Math.min(1, depth) * p), marks([]));
      },
    };
  };

  const release: Test = {
    id: `release-${child.id}`,
    label: "Release",
    run: (values, ctx) => {
      const zone = zoneAt(ZONES, valueOf(values)).id;
      const ok = sprung(values, ctx) && zone !== "low";
      const line = ok
        ? jaw
          ? "It snapped shut."
          : "It sprang back."
        : !sprung(values, ctx)
          ? `Nothing pushes it back. It stays ${jaw ? "open" : "in"}.`
          : `The spring is too weak. It stays ${jaw ? "open" : "in"}.`;
      return pressRelease(values, ctx, { pass: ok, line });
    },
  };
  const press: Test = {
    id: `press-${child.id}`,
    label: "Press",
    run: (values, ctx) => {
      const ok = zoneAt(ZONES, valueOf(values)).id !== "high";
      return pressRelease(
        values,
        ctx,
        ok
          ? { pass: true, line: "A hand presses it all the way." }
          : { pass: false, line: `Too stiff. It only ${jaw ? "opens" : "goes"} partway.`, nudge: "The spring is too stiff for a hand." },
      );
    },
  };

  return {
    id: `spring-${child.id}`,
    title: jaw ? `Spring the ${piece.noun} shut` : `Spring the ${piece.noun} back`,
    primitive: "spring",
    produces,
    without: {
      say: "Press it, then let go.",
      line: `Nothing pushes it back. It stays ${jaw ? "open" : "in"}.`,
      test: release,
      adds,
      values: { [missing]: 1, [key]: okValue(control) },
    },
    learn: {
      say: "Press it. The spring pushes back.",
      rigs: {
        spring: {
          controls: { force: "Press" },
          why: [
            "A spring stores the push you give it.",
            "Let go and it gives that push back.",
            `On the ${piece.object}, that push ${jaw ? "closes" : "brings back"} the ${c}.`,
          ],
        },
      },
    },
    uses: { spring: `The ${springName} stores your press and pushes the ${c} back.` },
    assemble: {
      piece: piece.Name,
      title: `The ${springName} sits between the ${c} and the ${piece.parentWords}.`,
      built: `The ${springName} now pushes the ${c} back.`,
    },
    target: targetFor(piece),
    enter: { x: 0, y: 50 * piece.k, z: 0 },
    play: { say: "Set the spring. Then press and release.", control, tests: [release, press] },
    hints: [`Watch the ${c} after you let go.`, "A soft spring loses to friction. Make it stiffer.", "Too stiff and a hand can't press it. Stop at Firm."],
    why: [
      `Pressing the ${c} squeezes the ${springName}.`,
      `Let go and the ${springName} pushes it back.`,
      `Without the ${springName}, the ${c} stays ${jaw ? "open" : "in"}.`,
    ],
    job: fit((n) => `The ${n} snaps it back.`, springName),
    cheer: jaw ? "Snaps shut!" : "Springs back!",
    payoff: { part: capital(springName), job: jaw ? `snaps the ${c} shut.` : `pushes the ${c} back.` },
  };
}
