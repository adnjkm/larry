// A part that closes onto another and is held there: by a thread (twisted on) or by a tight fit
// (pressed in). Its grip is the control the player drags, and the same grip decides Shake (does it
// stay on), Open or Pull (does a hand get it off) and, when a seal sits under it, Flip. The bottle's
// cap choreography, read off any kit part: it rides down turning and crooked, sits, then presses in.
import type { Kit, Part } from "../../../shared/kit.ts";
import { clamp01, easeOut, smooth } from "../../../shared/primitives/motion/ease.ts";
import {
  AXIS,
  type Control,
  type Ctx,
  EMPTY_SCENE,
  type PartMove,
  type Rigid,
  STILL,
  type StoryModuleSpec,
  type Test,
  type Values,
  type Vec,
  vec,
  type Zone,
  zoneAt,
} from "../model.ts";
import { add, overlay, scale, shudder, targetOf, turnMark } from "../templates/pair.ts";
import { carryAll, dropBelow, fit, floorOf, type Piece, pieceOf, threeZones } from "./piece.ts";

/** Threads are twisted on; anything else is pressed in. */
export const twisted = (p: Part) => p.joint === "thread" || p.joint === "screw";

/** How the closer sits: `d` mm out along its way off, spun `spin` degrees about it, tipped `tilt`, and shifted. */
type Pose = { d: number; spin: number; tilt: number; shift?: Vec };

export type Closure = {
  kind: "twist" | "press";
  piece: Piece;
  control: Control;
  /** Where the grip's value sits: too loose, right, too far. */
  zone: (values: Values, ctx: Ctx) => Zone;
  /** The closer posed at the control's value, for every part riding on it. */
  moves: (value: number, ctx: Ctx) => Record<string, PartMove>;
  shake: Test;
  /** Twist it open, or pull it off. */
  open: Test;
};

/** The grip's zones: where it first sits down, and where it starts to crush or stick. */
const TWIST = { words: ["Loose", "Snug", "Too tight"], until: [0.6, 0.82] } as const;
const PRESS = { words: ["Loose", "Firm", "Stuck"], until: [0.45, 0.8] } as const;
const TURNS_TO_SEAT = 2.5;
/** How crooked a loose closer sits, in degrees: it rests without gripping, and straightens as it goes on. */
const CROOKED = 9;

const SHAKES = 4;
const SHAKE_EACH = 480;
const SHAKE_SWING = SHAKES * SHAKE_EACH;
/** A loose closer pops off at the top of the second swing. */
const OFF_AT = 1.25 * SHAKE_EACH;
const SETTLE = 400;
const SHAKE_HOLD = 800;
const SHAKE_RESET = 650;

const OPEN_TWIST = 1300;
const OPEN_PULL = 700;
const OPEN_LIFTOFF = 450;
const OPEN_HOLD = 550;
const OPEN_BACK = 800;
const REFUSE_MS = 1700;

/** The way it tips while loose: square to its way off. */
const tiltAxisOf = (p: Piece): Vec => (p.axis === "z" ? AXIS.x : AXIS.z);

export function closureOf(kit: Kit, part: Part, seals: readonly string[]): Closure {
  const piece = pieceOf(kit, part);
  const kind = twisted(part) ? "twist" : "press";
  const grip = kind === "twist" ? TWIST : PRESS;
  const zones = threeZones(grip.words, grip.until);
  const key = `${kind}-${part.id}`;
  const length = 2 * piece.half[piece.axis];
  const lift = Math.min(12 * piece.k, Math.max(3 * piece.k, 0.3 * length));
  const sealed = (ctx: Ctx) => seals.some((id) => ctx.present.includes(id));
  const sealThick = Math.min(
    ...seals
      .map((id) => kit.parts.find((p) => p.id === id))
      .filter((p): p is Part => p !== undefined)
      .map((p) => 2 * pieceOf(kit, p).half[piece.axis]),
    length,
  );
  const crushSink = Math.min(0.12 * length, 0.6 * sealThick);
  const [seat, crush] = grip.until;
  const valueOf = (v: Values) => v[key] ?? 0;
  const zone = (v: Values, ctx: Ctx) => zoneAt(zones, valueOf(v));

  const poseAt = (t: number, ctx: Ctx): Pose => {
    const seated = Math.min(t / seat, 1);
    const pressed = Math.max(0, t - seat) / (1 - seat);
    const snug = Math.min(1, Math.max(0, t - seat) / (crush - seat));
    const crushed = Math.max(0, t - crush) / (1 - crush);
    const sink = sealed(ctx) || kind === "press" ? 0.2 * crushSink * snug + 0.8 * crushSink * crushed : 0;
    return { d: lift * (1 - seated) - sink, spin: kind === "twist" ? TURNS_TO_SEAT * 360 * seated + 70 * pressed : 0, tilt: CROOKED * (1 - smooth(seated)) };
  };
  const moveOf = (q: Pose): PartMove => ({
    offset: add(scale(piece.out, q.d), q.shift ?? vec()),
    turns: [
      { axis: piece.out, pivot: piece.centre, deg: q.spin },
      { axis: tiltAxisOf(piece), pivot: piece.centre, deg: q.tilt },
    ],
  });
  const carry = (ctx: Ctx, q: Pose) => carryAll(piece.subtree, ctx.present, moveOf(q));

  const control: Control = {
    key,
    verb: kind === "twist" ? "Twist" : "Press",
    start: 0,
    zones: () => zones,
    pose: (t, ctx) => (ctx.present.includes(part.id) ? { moves: carry(ctx, poseAt(t, ctx)), marks: [] } : EMPTY_SCENE),
  };

  const shake: Test = {
    id: `shake-${part.id}`,
    label: "Shake",
    run: (values, ctx) => {
      const holds = zone(values, ctx).id !== "low";
      const k = piece.k;
      const rest = poseAt(valueOf(values), ctx);
      // A loose closer comes off, so the shaking dies away; a held one rides it out.
      const rigidAt = (ms: number): Rigid => {
        const s = Math.min(ms, SHAKE_SWING) / SHAKE_EACH;
        const amp = holds ? 1 : 1 - smooth(clamp01((ms - OFF_AT) / SETTLE));
        return { dx: 14 * k * amp * Math.sin(2 * Math.PI * s), dy: 0, angle: 5 * amp * Math.sin(2 * Math.PI * s) };
      };
      if (holds) {
        return {
          verdict: { pass: true, line: `The ${piece.name} stayed on.` },
          durationMs: SHAKE_SWING + 400,
          at: (ms) => overlay(ms < SHAKE_SWING ? "Shaking…" : "Still on", carry(ctx, rest), [], rigidAt(ms)),
        };
      }
      // Thrown off along its way off with a kick up (or sideways, for one that comes off upward), then it falls, tumbling, to the table.
      const g = 900 * k;
      const upward = Math.abs(piece.out.y) > 0.9;
      const v0 = add(scale(piece.out, (upward ? 260 : 170) * k), upward ? vec(170 * k, 0, 0) : vec(0, 260 * k, 0));
      const startD = rest.d + 0.02 * piece.size;
      const reach = dropBelow(
        kit,
        piece.subtree.filter((id) => ctx.present.includes(id)),
        moveOf({ d: 0, spin: 0, tilt: -90 }),
      );
      const y0 = piece.out.y * startD;
      const target = floorOf(ctx) + reach - piece.centre.y;
      const flight = (v0.y + Math.sqrt(Math.max(0, v0.y * v0.y + 2 * g * (y0 - target)))) / g;
      const poseOff = (ms: number): Pose => {
        if (ms < OFF_AT) {
          // Rattling: it hops on what it never gripped.
          const hop = 0.02 * piece.size * Math.abs(Math.sin((2 * Math.PI * ms) / SHAKE_EACH));
          return {
            d: rest.d + hop,
            spin: rest.spin + 10 * Math.sin((4 * Math.PI * ms) / SHAKE_EACH),
            tilt: rest.tilt + 6 * Math.sin((2 * Math.PI * ms) / SHAKE_EACH),
          };
        }
        const tau = Math.min((ms - OFF_AT) / 1000, flight);
        return {
          d: startD,
          spin: rest.spin + 400 * tau,
          tilt: rest.tilt - 90 * (tau / flight),
          shift: vec(v0.x * tau, v0.y * tau - 0.5 * g * tau * tau, v0.z * tau),
        };
      };
      const offEnd = Math.max(SHAKE_SWING, OFF_AT + flight * 1000);
      const end = poseOff(offEnd);
      return {
        verdict: { pass: false, line: `The ${piece.name} rattled off.` },
        durationMs: offEnd + SHAKE_HOLD + SHAKE_RESET,
        at: (ms) => {
          if (ms < offEnd + SHAKE_HOLD) return overlay(ms < OFF_AT ? "Shaking…" : `${piece.Name} off!`, carry(ctx, poseOff(ms)), [], rigidAt(ms));
          const p = smooth(clamp01((ms - offEnd - SHAKE_HOLD) / SHAKE_RESET));
          const mix = (a: number, b: number) => a * (1 - p) + b * p;
          const shift = end.shift ?? vec();
          const back: Pose = {
            d: mix(end.d, rest.d),
            spin: mix(end.spin, rest.spin),
            tilt: mix(end.tilt, rest.tilt),
            shift: vec(shift.x * (1 - p), shift.y * (1 - p) + 0.2 * piece.size * Math.sin(Math.PI * p), shift.z * (1 - p)),
          };
          return overlay("Putting it back", carry(ctx, back), [], rigidAt(ms));
        },
      };
    },
  };

  const open: Test = {
    id: `${kind === "twist" ? "open" : "pull"}-${part.id}`,
    label: kind === "twist" ? "Open" : "Pull",
    run: (values, ctx) => {
      const rest = poseAt(valueOf(values), ctx);
      if (zone(values, ctx).id === "high") {
        return {
          verdict:
            kind === "twist"
              ? { pass: false, line: "Stuck. It's too tight to open by hand.", nudge: `The ${piece.name} is on too tight.` }
              : { pass: false, line: "Stuck. A hand can't pull it off.", nudge: `The ${piece.name} is pressed in too far.` },
          durationMs: REFUSE_MS,
          at: (ms) => {
            const w = shudder(clamp01(ms / REFUSE_MS));
            const strain: Pose = kind === "twist" ? { ...rest, spin: rest.spin - 6 * Math.abs(w) } : { ...rest, d: rest.d + 0.01 * piece.size * Math.abs(w) };
            return overlay("Straining…", carry(ctx, strain), [], { ...STILL, dx: 1.2 * piece.k * w });
          },
        };
      }
      const free = lift + 2 * piece.half[piece.axis] + 12 * piece.k;
      const undo = kind === "twist" ? OPEN_TWIST : OPEN_PULL;
      const loose: Pose = { d: lift, spin: kind === "twist" ? -120 : 0, tilt: 0 };
      return {
        verdict: { pass: true, line: kind === "twist" ? "It opens by hand." : "It pulls off by hand." },
        durationMs: undo + OPEN_LIFTOFF + OPEN_HOLD + OPEN_BACK,
        at: (ms) => {
          if (ms < undo) {
            const p = smooth(ms / undo);
            return overlay(
              kind === "twist" ? "Opening…" : "Pulling…",
              carry(ctx, { d: rest.d + (loose.d - rest.d) * p, spin: rest.spin + (loose.spin - rest.spin) * p, tilt: rest.tilt * (1 - p) }),
            );
          }
          if (ms < undo + OPEN_LIFTOFF + OPEN_HOLD) {
            const q = easeOut(clamp01((ms - undo) / OPEN_LIFTOFF));
            return overlay(kind === "twist" ? "Open" : "Off", carry(ctx, { ...loose, d: lift + (free - lift) * q }));
          }
          const p = smooth(clamp01((ms - undo - OPEN_LIFTOFF - OPEN_HOLD) / OPEN_BACK));
          return overlay(
            "Putting it back",
            carry(ctx, { d: free + (rest.d - free) * p, spin: loose.spin + (rest.spin - loose.spin) * p, tilt: rest.tilt * p }),
          );
        },
      };
    },
  };

  return { kind, piece, control, zone, moves: (t, ctx) => carry(ctx, poseAt(t, ctx)), shake, open };
}

/** The turn mark that rides a twisted closer, so its spin shows. */
export const turnMarkOf = (c: Closure) => turnMark(c.piece);

const ok = (c: Closure) => (c.kind === "twist" ? "Snug" : "Firm");
const over = (c: Closure) => (c.kind === "twist" ? "Too tight" : "Stuck");

/** Where a piece is built: onto its parent, or onto its outline when it has none. */
export const targetFor = (p: Piece, label = p.parentWords) => ({ ...targetOf(p), label });

/** A thread (twisted on) or a tight fit (pressed in): without it the part shakes off; the grip sets it. */
export function closerModule(c: Closure, produces: readonly string[], adds: readonly string[]): StoryModuleSpec & { payoff: { part: string; job: string } } {
  const { piece: p } = c;
  const twist = c.kind === "twist";
  return {
    id: `${twist ? "thread" : "press"}-${p.child.id}`,
    title: twist ? `Screw on the ${p.noun}` : `Press in the ${p.noun}`,
    primitive: twist ? "thread" : "grip",
    produces,
    without: {
      say: fit((n) => `Shake it. Watch the ${n}.`, p.name),
      line: twist ? fit((n) => `A ${n} that just sits there falls off.`, p.name) : fit((n) => `With no grip, the ${n} falls off.`, p.name),
      test: c.shake,
      adds,
      values: { [c.control.key]: 0 },
    },
    learn: twist
      ? {
          say: "Twist it. The nut rides the spiral.",
          rigs: {
            thread: {
              controls: { turns: "Twist" },
              why: [
                "A thread is a ramp wrapped round a post.",
                "Twist the nut and the ramp carries it along.",
                `On the ${p.object}, that ramp pulls the ${p.name} on and holds it there.`,
              ],
            },
          },
        }
      : {
          say: "Squeeze it. Friction holds it there.",
          rigs: {
            grip: {
              controls: { squeeze: "Squeeze" },
              why: [
                "Squeezed surfaces push hard on each other.",
                "Friction between them stops them sliding.",
                `On the ${p.object}, a tight fit squeezes the ${p.name} so it stays.`,
              ],
            },
          },
        },
    uses: twist
      ? { thread: `A thread turns your twist into a grip that holds the ${p.name} on.` }
      : { grip: `A tight fit squeezes the ${p.name}, and friction holds it on.` },
    assemble: {
      piece: p.Name,
      title: twist ? `The thread inside the ${p.name} grips the ${p.parentWords}.` : `The ${p.name} presses tight onto the ${p.parentWords}.`,
      built: twist ? `The thread now runs round the ${p.parentWords} and inside the ${p.name}.` : `The ${p.name} now sits tight on the ${p.parentWords}.`,
    },
    target: targetFor(p),
    enter: scale(p.out, 50 * p.k),
    play: {
      say: twist ? fit((n) => `Twist the ${n} on. Then shake.`, p.name) : fit((n) => `Press the ${n} in. Then shake.`, p.name),
      control: c.control,
      tests: [c.shake, c.open],
    },
    hints: [
      `Watch the ${p.name} while it shakes. Does it stay put?`,
      twist ? `A loose ${p.name} only rests on the thread. Twist it further.` : `A loose ${p.name} has no grip. Press it further.`,
      `Too far and a hand can't get it off. Stop at ${ok(c)}.`,
    ],
    why: twist
      ? [
          `On its own the ${p.name} just rests on the ${p.parentWords}.`,
          "The thread pulls it on and holds it tight.",
          `Without the thread, the first bump knocks the ${p.name} off.`,
        ]
      : [
          `The ${p.name} only stays because it is squeezed tight.`,
          "Squeezed surfaces grip each other. That grip is friction.",
          `Without a tight fit, the ${p.name} falls off at the first bump.`,
        ],
    job: twist ? fit((n) => `The thread holds the ${n} on.`, p.name) : fit((n) => `A tight fit holds the ${n} on.`, p.name),
    cheer: twist ? "Locked on!" : "Pressed in!",
    payoff: twist ? { part: "Thread", job: `holds the ${p.name} on.` } : { part: "Tight fit", job: `holds the ${p.name} in.` },
  };
}

export const closerWords = { ok, over };
