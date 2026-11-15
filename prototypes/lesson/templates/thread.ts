// A threaded or screwed joint is a thread: pitch decides whether a shake walks the child off and
// how many turns it takes to undo.
import { clamp01, easeOut, smooth } from "../../../shared/primitives/motion/ease.ts";
import { AXIS, type PartMove, type Rigid, type Test, type Values, type Window } from "../model.ts";
import { carry, clearance, overlay, type Pair, scale, targetOf, type Template, turnMark } from "./pair.ts";

/** Above 4 mm a shake walks the child off; below 3 mm undoing takes more than MAX_TURNS. Game numbers. */
const WINDOW: Window = [3, 4];
/** Millimetres of thread the child rides on. */
const ENGAGE = 12;
const LIFT_PER_MM_OVER = 4;
const SHAKES = 5;
const MAX_TURNS = 4;

const pitchOf = (v: Values) => v.pitch ?? 3.5;
const liftPerShake = (pitch: number) => Math.max(0, pitch - WINDOW[1]) * LIFT_PER_MM_OVER;

/** The child turned `turns` times about its axis and moved `d` mm along it. */
const screwed = (pair: Pair, d: number, turns: number): PartMove => ({
  offset: scale(pair.out, d),
  turns: [{ axis: AXIS[pair.axis], pivot: pair.centre, deg: 360 * turns }],
});

const SHAKE_EACH = 520;
const SHAKE_SWING = SHAKES * SHAKE_EACH;
const HOLD = 700;
const RESET = 650;

function shake(pair: Pair): Test {
  return {
    id: "thread-shake",
    label: `Shake · ${pair.noun}`,
    run: (values, ctx) => {
      const pitch = pitchOf(values);
      const each = liftPerShake(pitch);
      const falls = each * SHAKES >= ENGAGE;
      const offOn = Math.ceil(ENGAGE / Math.max(each, 1e-9));
      const verdict =
        each === 0
          ? { pass: true, line: `The ${pair.childName} stayed on the ${pair.parentName} through every shake.` }
          : falls
            ? { pass: false, line: `The ${pair.childName} walked off the ${pair.parentName} on shake ${offOn}.` }
            : { pass: false, line: `The ${pair.childName} crept ${each * SHAKES} mm along the thread and would be off in a few more shakes.` };
      const lift = (s: number) => Math.min(ENGAGE, each * (Math.floor(s) + smooth(s - Math.floor(s))));
      const freeAt = falls ? (offOn - 1) * SHAKE_EACH + SHAKE_EACH * 0.6 : Infinity;
      const off = clearance(pair);
      const along = (ms: number) => {
        const l = lift(Math.min(ms, SHAKE_SWING) / SHAKE_EACH);
        return ms < freeAt ? l : l + Math.max(10, off - ENGAGE) * easeOut(clamp01((ms - freeAt) / 500));
      };
      const at = (ms: number) => screwed(pair, along(ms), along(ms) / pitch);
      const moved = each > 0;
      return {
        verdict,
        durationMs: SHAKE_SWING + (moved ? HOLD + RESET : 300),
        at: (ms) => {
          const s = Math.min(ms, SHAKE_SWING) / SHAKE_EACH;
          const rigid: Rigid = { dx: 10 * Math.sin(2 * Math.PI * s), dy: 0, angle: 4 * Math.sin(2 * Math.PI * s) };
          const live = ms >= freeAt ? `${pair.child.name} off` : `Shake ${Math.min(SHAKES, Math.floor(s) + 1)} of ${SHAKES} · up ${along(ms).toFixed(0)} mm`;
          if (ms < SHAKE_SWING + HOLD || !moved)
            return overlay(ms < SHAKE_SWING ? live : moved ? live : "Still on", carry(pair, ctx.present, at(ms)), [turnMark(pair)], rigid);
          const p = smooth(clamp01((ms - SHAKE_SWING - HOLD) / RESET));
          const end = along(SHAKE_SWING + HOLD);
          return overlay("Back on", carry(pair, ctx.present, screwed(pair, end * (1 - p), (end / pitch) * (1 - p))), [turnMark(pair)], rigid);
        },
      };
    },
  };
}

const TURN_MS = 260;
const LIFTOFF = 450;
const BACK = 700;

function unscrew(pair: Pair): Test {
  return {
    id: "thread-unscrew",
    label: `Unscrew · ${pair.noun}`,
    run: (values, ctx) => {
      const pitch = pitchOf(values);
      const turns = ENGAGE / pitch;
      const stuck = turns > MAX_TURNS + 1e-9;
      const given = stuck ? MAX_TURNS : turns;
      const twist = 500 + given * TURN_MS;
      const rise = given * pitch;
      const free = stuck ? 0 : Math.max(10, clearance(pair) - ENGAGE);
      const move = (d: number, n: number) => carry(pair, ctx.present, screwed(pair, d, n));
      const marks = [turnMark(pair)];
      return {
        verdict: stuck
          ? { pass: false, line: `Still on after ${MAX_TURNS} turns. At ${pitch} mm a turn, freeing ${ENGAGE} mm of thread takes ${turns.toFixed(1)} turns.` }
          : { pass: true, line: `Off by hand in ${turns.toFixed(1)} turns.` },
        durationMs: twist + LIFTOFF + HOLD + BACK,
        at: (ms) => {
          if (ms < twist) {
            const p = smooth(ms / twist);
            return overlay(`Turn ${(given * p).toFixed(1)} of ${turns.toFixed(1)}`, move(rise * p, given * p), marks);
          }
          const q = easeOut(clamp01((ms - twist) / LIFTOFF));
          if (ms < twist + LIFTOFF + HOLD)
            return overlay(stuck ? `Still on after ${MAX_TURNS} turns` : `Off in ${turns.toFixed(1)} turns`, move(rise + free * q, given), marks);
          const p = smooth(clamp01((ms - twist - LIFTOFF - HOLD) / BACK));
          return overlay("Screwing it back on", move((rise + free) * (1 - p), given * (1 - p)), marks);
        },
      };
    },
  };
}

export const threadTemplate: Template = {
  joints: ["thread", "screw"],
  primitive: "thread",
  module: (pair) => {
    const { childName: child, parentName: parent } = pair;
    const tests = [shake(pair), unscrew(pair)] as const;
    const [shakeTest, unscrewTest] = tests.map((t) => t.label);
    return {
      id: "thread",
      title: `Screw on the ${child}`,
      need: `The ${child} must screw onto the ${parent}, stay on when shaken, and come off by hand.`,
      primitive: "thread",
      produces: pair.produces,
      assemble: {
        piece: "Thread nut",
        title: `Wind the thread onto the ${parent}: it becomes the ${child}.`,
        built: `The thread's nut is now the ${child}, wound onto the ${parent}.`,
      },
      target: targetOf(pair),
      enter: scale(pair.out, 50),
      fault: { primitive: "thread", slider: "pitch", start: 6 },
      fix: { window: WINDOW },
      tests,
      hints: {
        observe: `Run ${shakeTest} and watch the ${child}. It turns and climbs along the thread a little with every shake.`,
        principle: `Pitch is how far the ${child} moves along the thread in one turn. On a steep thread a jolt can turn the ${child} and push it up the ramp.`,
        direction: `Make the pitch smaller, but not too small. Each turn then moves the ${child} less, so undoing it takes more turns. Check ${shakeTest} and ${unscrewTest} together.`,
        low: `Undoing it takes more than ${MAX_TURNS} turns, and the ${child} is still on.`,
        high: `A shake walks the ${child} up the thread and off.`,
      },
      suspect: pair.child.id,
      misses: { [pair.parent.id]: `The ${parent} holds still. Watch the part that turns during ${shakeTest}.` },
      missDefault: `That part does not move during ${shakeTest}. Watch which one climbs.`,
      uses: { thread: `The spiral where the ${child} meets the ${parent}. Twisting walks the ${child} along it.` },
      task: "Find a pitch that stays on and unscrews.",
      why: `Pitch is how far the ${child} moves in one turn. A shallow thread moves the ${child} only a little per turn, and friction on the shallow ramp holds it against jolts. The price is more turns to put it on and take it off.`,
      gameNote: `Game numbers: the ${child} rides on ${ENGAGE} mm of thread, each shake lifts it ${LIFT_PER_MM_OVER} mm for every mm of pitch over ${WINDOW[1]}, and still being on after ${MAX_TURNS} turns counts as too slow. None of this is measured from the ${pair.objectName}; it is set so both failures are easy to see. Turns to undo = thread length ÷ pitch is real.`,
      readoutWith: (pitch) => ({ turns: ENGAGE / pitch }),
      numbers: (v) => {
        const pitch = pitchOf(v);
        const each = liftPerShake(pitch);
        return [
          { label: "To undo", value: `${ENGAGE} mm ÷ ${pitch} mm = ${(ENGAGE / pitch).toFixed(1)} turns (limit ${MAX_TURNS})` },
          { label: "Each shake", value: each > 0 ? `climbs ${each} mm (off after ${ENGAGE} mm)` : "stays put" },
        ];
      },
    };
  },
};
