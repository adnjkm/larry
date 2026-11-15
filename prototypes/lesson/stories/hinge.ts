// A part that turns on a hinge or a pin (templates/hinge.ts reads the lever off the kit). Without the
// pin the part falls away when pressed. The player moves where the hand pushes along it: near the
// pivot the push is too weak to close it, far out the same hand travel barely swings it.
import { clamp01, easeOut, smooth } from "../../../shared/primitives/motion/ease.ts";
import { type Control, type Ctx, type Mark, type StoryModuleSpec, type Test, type Values, vec, zoneAt } from "../model.ts";
import { extents } from "../pose.ts";
import { leverOf } from "../templates/hinge.ts";
import { add, arrowMark, overlay, scale, sub } from "../templates/pair.ts";
import { targetFor } from "./closure.ts";
import { capital, carryAll, fit, floorOf, okValue, type Piece, threeZones, wordsOf } from "./piece.ts";

const ZONES = threeZones(["Near pivot", "Middle", "Far end"], [0.35, 0.7]);
/** Where the hand sits, as a share of the way from the pivot to the end the hand works. */
const reachOf = (v: number) => 0.2 + 0.8 * v;
const OPEN_DEG = 15;
const SWING_DEG = 30;
const OPEN_MS = 600;
const PUSH_MS = 700;
const HOLD_MS = 700;
const BACK_MS = 600;
const FALL_MS = 800;

export function hingeModule(piece: Piece, produces: readonly string[], adds: readonly string[]): StoryModuleSpec & { payoff: { part: string; job: string } } {
  const { kit, child, pin } = piece;
  const h = leverOf(piece);
  const key = `hand-${child.id}`;
  const missing = `${key}-missing`;
  const valueOf = (v: Values) => v[key] ?? 0;
  const pinned = (v: Values, ctx: Ctx) => v[missing] !== 1 && (!pin || ctx.present.includes(pin.id));
  const pinWord = pin ? wordsOf(pin.name) : "hinge";
  const c = piece.name;
  const swung = (ctx: Ctx, deg: number) => carryAll(piece.subtree, ctx.present, { turns: [{ axis: h.turn, pivot: h.pivot, deg: h.open * deg }] });
  // The purple arrow is the hand: it slides along the part, from by the pivot out to the end.
  const hand = (v: number): Mark => arrowMark("hand", add(h.push.at, scale(sub(h.pivot, h.hand), 1 - reachOf(v))), h.push.dir, h.handPart.id);
  const control: Control = {
    key,
    verb: "Hand",
    start: 0,
    zones: () => ZONES,
    pose: (v, ctx) => (ctx.present.includes(child.id) ? { moves: {}, marks: [hand(v)] } : { moves: {}, marks: [] }),
  };

  const press: Test = {
    id: `press-${child.id}`,
    label: "Press",
    run: (values, ctx) => {
      const v = valueOf(values);
      if (!pinned(values, ctx)) {
        // Nothing holds it: pushed, it slides off along the push and drops to the table.
        const ids = piece.subtree.filter((id) => ctx.present.includes(id));
        const drop = floorOf(ctx) - extents(kit.parts.filter((p) => ids.includes(p.id))).min.y;
        const fall = (p: number) =>
          carryAll(ids, ctx.present, {
            offset: add(scale(h.push.dir, 0.3 * h.arm * p), vec(0, drop * p * p, 0)),
            turns: [{ axis: h.turn, pivot: h.pivot, deg: 25 * h.open * p }],
          });
        return {
          verdict: { pass: false, line: fit((n) => `The ${n} falls away. Nothing holds it.`, c) },
          durationMs: PUSH_MS + FALL_MS + HOLD_MS + BACK_MS,
          at: (ms) => {
            if (ms < PUSH_MS) return overlay("Pressing…", fall(0.15 * smooth(ms / PUSH_MS)), [hand(v)]);
            if (ms < PUSH_MS + FALL_MS) return overlay("It falls away", fall(0.15 + 0.85 * easeOut((ms - PUSH_MS) / FALL_MS)));
            if (ms < PUSH_MS + FALL_MS + HOLD_MS) return overlay("Fallen off", fall(1));
            return overlay("Putting it back", fall(1 - smooth(clamp01((ms - PUSH_MS - FALL_MS - HOLD_MS) / BACK_MS))));
          },
        };
      }
      const strong = zoneAt(ZONES, v).id !== "low";
      const closed = strong ? 1 : 0.5;
      const start = OPEN_MS + 200;
      return {
        verdict: strong
          ? { pass: true, line: "It closes all the way." }
          : { pass: false, line: "Too weak. It stops partway.", nudge: "Your hand is too close to the pivot." },
        durationMs: start + PUSH_MS + HOLD_MS + BACK_MS,
        at: (ms) => {
          if (ms < start) return overlay("Opening it", swung(ctx, OPEN_DEG * smooth(clamp01(ms / OPEN_MS))), [hand(v)]);
          const q = easeOut(clamp01((ms - start) / PUSH_MS));
          const deg = OPEN_DEG * (1 - closed * q);
          if (ms < start + PUSH_MS + HOLD_MS)
            return overlay(ms < start + PUSH_MS ? "Pressing…" : strong ? "Closed" : "Stuck partway", swung(ctx, deg), [hand(v)]);
          const p = smooth(clamp01((ms - start - PUSH_MS - HOLD_MS) / BACK_MS));
          return overlay("Back to rest", swung(ctx, deg * (1 - p)), [hand(v)]);
        },
      };
    },
  };

  const swing: Test = {
    id: `swing-${child.id}`,
    label: "Swing",
    run: (values, ctx) => {
      const v = valueOf(values);
      const wide = zoneAt(ZONES, v).id !== "high";
      // The same hand travel turns it less the further out the hand is.
      const deg = SWING_DEG * Math.min(1, (0.45 / reachOf(v)) ** 2);
      return {
        verdict: wide ? { pass: true, line: "It swings wide open." } : { pass: false, line: "It barely moves. Your hand is too far out." },
        durationMs: PUSH_MS + HOLD_MS + BACK_MS,
        at: (ms) => {
          const q = smooth(clamp01(ms / PUSH_MS));
          if (ms < PUSH_MS + HOLD_MS) return overlay(ms < PUSH_MS ? "Swinging…" : wide ? "Wide open" : "Barely open", swung(ctx, deg * q), [hand(v)]);
          const p = smooth(clamp01((ms - PUSH_MS - HOLD_MS) / BACK_MS));
          return overlay("Back to rest", swung(ctx, deg * (1 - p)), [hand(v)]);
        },
      };
    },
  };

  return {
    id: `hinge-${child.id}`,
    title: `Pivot the ${piece.noun}`,
    primitive: "lever",
    produces,
    without: {
      say: fit((n) => `Press the ${n}. Watch it.`, c),
      line: fit((n) => `With no ${pinWord}, the ${n} falls away.`, c),
      test: press,
      adds,
      values: { [missing]: 1, [key]: okValue(control) },
    },
    learn: {
      say: "Push it. The bar turns on its pivot.",
      rigs: {
        lever: {
          controls: { push: "Push" },
          why: ["A lever is a bar that turns on a pivot.", "Push far from the pivot and your push grows.", "But that end has to move further for it."],
        },
      },
    },
    uses: { lever: `The ${c} turns on the ${pinWord}, and your push turns it.` },
    assemble: { piece: piece.Name, title: `The ${c} turns on the ${pinWord}.`, built: `The ${c} now turns on the ${pinWord}.` },
    target: targetFor(piece, pin ? wordsOf(kit.parts.find((p) => p.id === pin.parentId)?.name ?? pin.name) : piece.parentWords),
    enter: scale(piece.out, 50 * piece.k),
    play: { say: "Move your hand. Then press and swing.", control, tests: [press, swing] },
    hints: [`Watch how far the ${c} closes.`, "Near the pivot your push is weak. Move out.", "Too far out and it barely swings. Stop at Middle."],
    why: [`The ${c} turns on the ${pinWord}.`, "Far from the pivot your push grows, but it moves less.", `Without the ${pinWord}, the ${c} just falls away.`],
    job: fit((n) => `The ${n} holds it as it turns.`, pinWord),
    cheer: "Swings true!",
    payoff: { part: capital(pinWord), job: `lets the ${c} turn.` },
  };
}
