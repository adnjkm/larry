// A part the kit calls a seal (see templates/evidence.ts): without it the object drips at the joint
// when flipped. It works by being squeezed, so the player drags the grip of whatever closes over it
// (its closer, see templates/seal.ts): too loose leaves gaps, too far and it won't open.
import { clamp01, smooth } from "../../../shared/primitives/motion/ease.ts";
import type { Rigid, StoryModuleSpec, Test } from "../model.ts";
import { rigidPoint } from "../pose.ts";
import { flipFrame, ringOf } from "../templates/seal.ts";
import { overlay } from "../templates/pair.ts";
import { type Closure, closerWords, targetFor } from "./closure.ts";
import { type Drop, dropsAt } from "./drops.ts";
import { fit, okValue, type Piece } from "./piece.ts";

const FLIP_UP = 1000;
const FLIP_BACK = 900;
const DROP_GAP = 160;
const LEAK_DROPS = 7;

export function flipTest(seal: Piece, closer: Closure): Test {
  const drops = dropsAt(seal.k);
  const c = closer.piece;
  return {
    id: `flip-${seal.child.id}`,
    label: "Flip",
    run: (values, ctx) => {
      const sealed = ctx.present.includes(seal.child.id);
      const leaks = !sealed || closer.zone(values, ctx).id === "low";
      const value = values[closer.control.key] ?? 0;
      const verdict = !sealed
        ? { pass: false, line: fit((n) => `Drips at the joint. It got past the ${n}.`, c.name) }
        : leaks
          ? { pass: false, line: fit((n) => `Drips. The ${n} isn't pressing the seal.`, c.name) }
          : { pass: true, line: "Dry. Not a drop." };
      const { lift } = flipFrame(ctx);
      const held: Rigid = { dx: 0, dy: lift, angle: 180 };
      const count = leaks ? LEAK_DROPS : 0;
      const hold = Math.max(1000, 500 + count * DROP_GAP + 700);
      // Drops gather on the ring of the joint, lowest side first once it is upside down.
      const ring = ringOf(seal.child, seal).map((p) => rigidPoint(ctx.centre, held, p)).sort((a, b) => a.y - b.y);
      const falling: Drop[] = Array.from({ length: count }, (_, i) => ({ spawn: FLIP_UP + 150 + i * DROP_GAP, origin: ring[(i * 3) % Math.min(5, ring.length)]!, vx: 0, vy: 0, vz: 0 }));
      const moves = closer.moves(value, ctx);
      return {
        verdict,
        durationMs: FLIP_UP + hold + FLIP_BACK,
        at: (ms) => {
          const back = smooth(clamp01((ms - FLIP_UP - hold) / FLIP_BACK));
          const rigid: Rigid =
            ms < FLIP_UP ? { dx: 0, dy: lift * smooth(ms / FLIP_UP), angle: 180 * smooth(ms / FLIP_UP) }
            : ms < FLIP_UP + hold ? held
            : { dx: 0, dy: lift * (1 - back), angle: 180 + 180 * back };
          const marks = drops.marks(falling, ms);
          const live = ms < FLIP_UP ? "Flipping…" : leaks ? (marks.length > 0 ? "Dripping…" : "Upside down") : "Dry";
          return overlay(live, moves, marks, rigid);
        },
      };
    },
  };
}

/** The seal module: built after its closer, so the closer's grip can squeeze it. */
export function sealModule(seal: Piece, closer: Closure, produces: readonly string[]): StoryModuleSpec & { payoff: { part: string; job: string } } {
  const c = closer.piece;
  const flip = flipTest(seal, closer);
  const ok = closerWords.ok(closer);
  const twist = closer.kind === "twist";
  return {
    id: `seal-${seal.child.id}`,
    title: "Keep it sealed",
    primitive: "seal",
    produces,
    without: {
      say: "Flip it. Any drips?",
      line: "Hard faces leave tiny gaps. It leaks.",
      test: flip,
      adds: [],
      values: { [closer.control.key]: okValue(closer.control) },
    },
    learn: {
      say: "Squeeze it. The rubber fills the gaps.",
      rigs: { seal: { controls: { squeeze: "Squeeze" }, why: ["A seal is soft, so it changes shape when you squeeze it.", "Pressed between two hard faces, it spreads into every tiny gap.", "That closes the path a leak would take."] } },
    },
    uses: { seal: `Squeezed, the ${seal.name} fills the tiny gaps so nothing leaks.` },
    assemble: {
      piece: seal.Name,
      title: `The ${seal.name} sits in the joint, under the ${c.name}.`,
      built: `The ${seal.name} now sits where the ${c.name} closes.`,
    },
    target: targetFor(seal),
    enter: { x: 60 * seal.k, y: 0, z: 0 },
    play: { say: twist ? fit((n) => `Twist the ${n} snug. Then flip it.`, c.name) : fit((n) => `Press the ${n} in. Then flip it.`, c.name), control: closer.control, tests: [flip, closer.open] },
    hints: [
      "Watch where the drops come from: the joint.",
      `The ${c.name} has to press the ${seal.name}. ${twist ? "Twist" : "Press"} it further.`,
      `Too far and it won't open. Stop at ${ok}.`,
    ],
    why: [
      "Two hard faces never fit perfectly. There are tiny gaps.",
      `The ${seal.name} is soft, so the ${c.name} squeezes it into those gaps.`,
      `Without the ${seal.name}, it drips even when it is closed.`,
    ],
    job: fit((n) => `The ${n} keeps it dry.`, seal.name),
    cheer: "Sealed tight!",
    payoff: { part: seal.Name, job: "keeps it dry." },
  };
}
