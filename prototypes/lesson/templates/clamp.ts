// A pin that holds two parts together and lets them turn (a scissors' rivet) is a grip: it presses the
// parts face to face, and friction resists turning up to μ times that squeeze. Too loose and whatever
// the parts work on pushes them apart (paper folds between scissors blades instead of being cut); too
// tight and the friction about the pin is more turning resistance than a finger gives.
//
// Read from the kit only: the turning parts are the pin's children in the kit tree, the finger pushes
// on the one of them farthest from the pin, and friction acts at the pin's own radius.
import type { Part } from "../../../shared/kit.ts";
import { clamp01, easeOut, smooth } from "../../../shared/primitives/motion/ease.ts";
import type { PartMove, Run, TestCtx, Values, Vec } from "../model.ts";
import { centreOf, extents } from "../pose.ts";
import { add, arrowMark, carry, dot, latheAxis, overlay, type Pair, rotate, scale, shudder, sub, targetOf, type Template, tenth, unit } from "./pair.ts";

/** Game numbers, with μ as in Learn. */
const MU = 0.4;
const APART_N = 8;
const FINGER_N = 1;
const STEP = 1;
const LOWEST = 1;
const ROOM = 2;

/** What the pin holds: the parts that turn on it, where the finger pushes, and the pin's own axis and radius. */
type Pin = { turners: readonly string[]; finger: Part; arm: number; axis: Vec; radius: number; centre: Vec; apart: Vec };

function pinOf(pair: Pair): Pin | null {
  const { kit, child: pin } = pair;
  const turners = pair.subtree.filter((id) => id !== pin.id);
  if (turners.length === 0) return null;
  const axis = pin.shape.kind === "lathe" ? unit(latheAxis(pin)) : scale(unit(pair.out), 1);
  const centre = pair.centre;
  const radius = pin.shape.kind === "lathe" ? Math.max(...pin.shape.profile.map((p) => p.r)) : Math.min(pair.half.x, pair.half.y, pair.half.z);
  const across = (p: Part) => {
    const d = sub(centreOf(extents([p])), centre);
    const off = sub(d, scale(axis, dot(d, axis)));
    return Math.hypot(off.x, off.y, off.z);
  };
  const parts = kit.parts.filter((p) => turners.includes(p.id));
  const finger = parts.reduce((a, b) => (across(b) > across(a) ? b : a));
  const away = dot(sub(centreOf(extents(parts)), pair.parentCentre), axis);
  return { turners, finger, arm: across(finger), axis, radius, centre, apart: scale(axis, away < 0 ? -1 : 1) };
}

const squeezeOf = (v: Values) => v.clamp ?? 10;
/** Friction torque about the pin, in N·mm: two faces, each pressed with the squeeze, at the pin's radius. */
const frictionNmm = (pin: Pin, n: number) => MU * 2 * n * pin.radius;
const together = (n: number) => n >= APART_N;
const opens = (pin: Pin, n: number) => frictionNmm(pin, n) <= FINGER_N * pin.arm + 1e-9;

function windowOf(pin: Pin): [number, number] | null {
  const hi = Math.floor((FINGER_N * pin.arm) / (MU * 2 * pin.radius) / STEP + 1e-9) * STEP;
  const lo = APART_N;
  return hi > lo && lo - LOWEST >= ROOM * STEP ? [lo, hi] : null;
}

const PUSH_MS = 600;
const HOLD_MS = 700;
const BACK_MS = 500;
/** Drawn wider than a real gap (under a millimetre) so it shows. */
const GAP_MM = 8;
const OPEN_DEG = 20;
const STUCK_DEG = 2;

export const clampTemplate: Template = {
  joints: ["rivet", "screw"],
  primitive: "grip",
  last: true,
  applies: (pair) => {
    const pin = pinOf(pair);
    return pin !== null && windowOf(pin) !== null;
  },
  module: (pair: Pair) => {
    const pin = pinOf(pair)!;
    const [lo, hi] = windowOf(pin)!;
    const { kit } = pair;
    const name = pair.childName;
    const turning = kit.parts.filter((p) => pin.turners.includes(p.id));
    const main = turning.find((p) => p.parentId === pair.child.id) ?? turning[0]!;
    const mainName = main.name.toLowerCase();
    const parent = pair.parentName;
    const fingerName = pin.finger.name.toLowerCase();
    const cut = `Work · ${pair.parent.name.toLowerCase().split(/\s+/).pop()}`;
    const open = `Open · ${mainName.split(/\s+/).pop()}`;
    const torqueOf = (n: number) => tenth(frictionNmm(pin, n));
    const fingerNmm = tenth(FINGER_N * pin.arm);
    // Positive turns open when they carry the turning part away from the part it closes on.
    const mainCentre = centreOf(extents([main]));
    const from = pair.parentCentre;
    const dist = (p: Vec) => Math.hypot(p.x - from.x, p.y - from.y, p.z - from.z);
    const opening = dist(rotate(mainCentre, pin.centre, pin.axis, 5)) > dist(mainCentre) ? 1 : -1;
    const turned = (present: readonly string[], deg: number): Record<string, PartMove> =>
      Object.fromEntries(pin.turners.filter((id) => present.includes(id)).map((id) => [id, { turns: [{ axis: pin.axis, pivot: pin.centre, deg: opening * deg }] }]));
    const parted = (present: readonly string[], mm: number): Record<string, PartMove> =>
      Object.fromEntries(pin.turners.filter((id) => present.includes(id)).map((id) => [id, { offset: scale(pin.apart, mm) }]));
    const fingerAt = centreOf(extents([pin.finger]));
    const fingerDir = unit(sub(rotate(fingerAt, pin.centre, pin.axis, opening * 5), fingerAt));
    const push = arrowMark("finger", fingerAt, fingerDir, pin.finger.id);
    const spread = arrowMark("apart", add(mainCentre, scale(pin.apart, 2)), pin.apart, main.id);
    return {
      id: "clamp",
      title: `Set the ${name}`,
      need: `The ${name} must hold the ${mainName} tight against the ${parent} while it works, and still let a finger open it.`,
      primitive: "grip",
      produces: pair.produces,
      assemble: {
        piece: "Grip pads",
        title: `Press the grip into the ${name}: it squeezes the ${mainName} against the ${parent}.`,
        built: `The grip is now the squeeze of the ${name}, pressing the ${mainName} and the ${parent} face to face.`,
      },
      target: targetOf(pair),
      enter: scale(pin.axis, 40),
      fault: { primitive: "grip", slider: "squeeze", key: "clamp", start: Math.max(LOWEST, Math.floor(lo / 3)), range: { label: "Squeeze", min: LOWEST, max: hi + 10, step: STEP, initial: Math.min(hi + 10, 40) } },
      fix: { window: [lo, hi] },
      tests: [
        {
          id: "clamp-work",
          label: cut,
          run: (values: Values, ctx: TestCtx): Run => {
            const n = squeezeOf(values);
            const ok = together(n);
            const gap = (q: number) => (ok ? 0.3 * Math.sin(Math.PI * q) : GAP_MM * q);
            return {
              verdict: ok
                ? { pass: true, line: `It held. The ${name} squeezes with ${n} N, more than the ${APART_N} N the work pushes them apart.` }
                : { pass: false, line: `The ${mainName} lifted off the ${parent}. The ${name} squeezes with ${n} N, and the work pushes them apart with ${APART_N} N.` },
              durationMs: PUSH_MS + HOLD_MS + BACK_MS,
              at: (ms) => {
                if (ms < PUSH_MS) return overlay(`Pushed apart with ${APART_N} N`, parted(ctx.present, gap(easeOut(ms / PUSH_MS))), [spread]);
                if (ms < PUSH_MS + HOLD_MS) return overlay(ok ? "Held together" : "Pushed apart", parted(ctx.present, gap(1)), ok ? [] : [spread]);
                return overlay("Back as it was", parted(ctx.present, gap(1) * (1 - smooth(clamp01((ms - PUSH_MS - HOLD_MS) / BACK_MS)))));
              },
            };
          },
        },
        {
          id: "clamp-open",
          label: open,
          run: (values: Values, ctx: TestCtx): Run => {
            const n = squeezeOf(values);
            const ok = opens(pin, n);
            return {
              verdict: ok
                ? { pass: true, line: `It opened. Friction at the ${name} holds ${torqueOf(n)} N·mm, within the ${fingerNmm} N·mm your ${FINGER_N} N finger gives on the ${fingerName}.` }
                : { pass: false, line: `It would not open. Friction at the ${name} holds ${torqueOf(n)} N·mm, more than the ${fingerNmm} N·mm your ${FINGER_N} N finger gives on the ${fingerName}.`, nudge: `The ${name} is far too tight for a finger.` },
              durationMs: PUSH_MS + HOLD_MS + BACK_MS,
              at: (ms) => {
                if (ms < PUSH_MS + HOLD_MS) {
                  const q = easeOut(clamp01(ms / PUSH_MS));
                  const deg = ok ? OPEN_DEG * q : STUCK_DEG * q + (ms > PUSH_MS ? 0.8 * shudder(clamp01((ms - PUSH_MS) / HOLD_MS)) : 0);
                  return overlay(ok ? `Opened ${Math.round(deg)}°` : `Friction ${torqueOf(n)} of ${fingerNmm} N·mm`, turned(ctx.present, deg), [push]);
                }
                const end = ok ? OPEN_DEG : STUCK_DEG;
                return overlay("Back as it was", turned(ctx.present, end * (1 - smooth(clamp01((ms - PUSH_MS - HOLD_MS) / BACK_MS)))));
              },
            };
          },
        },
      ],
      hints: {
        observe: `Run ${cut} and watch the ${mainName}. The work pushes it off the ${parent}.`,
        principle: `The ${name} is a grip: it presses the ${mainName} and the ${parent} together, and that squeeze is what keeps them touching. Friction resists turning up to μ × 2 × squeeze, acting at the ${name}'s ${tenth(pin.radius)} mm radius.`,
        direction: `Squeeze harder than the ${APART_N} N that pushes them apart, but keep the friction under what your ${FINGER_N} N finger gives on the ${fingerName}, ${Math.round(pin.arm)} mm from the ${name}. Check ${cut} and ${open} together.`,
        low: `The squeeze loses to the work, and the ${mainName} lifts off.`,
        high: `Friction about the ${name} is more than a finger can turn.`,
      },
      suspect: pair.child.id,
      misses: Object.fromEntries([
        [pair.parent.id, `The ${parent} holds still. Watch what the ${name} lets go of during ${cut}.`],
        ...pin.turners.map((id) => [id, `The ${kit.parts.find((p) => p.id === id)!.name.toLowerCase()} turns on the ${name}; it does not set how tight it is.`]),
      ]),
      missDefault: `That part does not hold the ${mainName} to the ${parent}. Watch what lifts during ${cut}.`,
      uses: { grip: `The squeeze in the ${name}. It presses the ${mainName} against the ${parent} so they stay together.` },
      task: "Squeeze until it holds but still turns.",
      why: `A pin that holds parts together and lets them turn is a grip. Its squeeze keeps the parts touching while they work, and friction resists turning up to μ times that squeeze, so it must be tight enough to hold them together and loose enough to turn by hand.`,
      gameNote: `Game numbers: the work pushes the parts apart with ${APART_N} N and a finger opens it with ${FINGER_N} N, with μ = ${MU} as in Learn. From the kit: the ${name} is ${tenth(2 * pin.radius)} mm across and your finger is on the ${fingerName}, ${Math.round(pin.arm)} mm from it. Assumed: friction acts on two faces at the ${name}'s radius. The gap is drawn wider than it would be. The friction law is real.`,
      readoutWith: () => ({ load: APART_N }),
      numbers: (v) => {
        const n = squeezeOf(v);
        return [
          { label: "Holds together", value: `${n} N squeeze (pushed apart with ${APART_N} N)` },
          { label: "Friction", value: `${MU} × 2 × ${n} N × ${tenth(pin.radius)} mm = ${torqueOf(n)} N·mm` },
          { label: "Your finger", value: `${FINGER_N} N × ${Math.round(pin.arm)} mm = ${fingerNmm} N·mm` },
        ];
      },
    };
  },
};
