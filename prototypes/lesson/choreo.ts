// What each test looks like, as a pose for every moment: pure functions of elapsed milliseconds.
import { clamp01, easeOut, smooth } from "./ease.ts";
import { ENGAGE, type Outcome, SHAKES } from "./sim.ts";
import { DROP_RADIUS, type Move, type Pose, REST, type Rig, rigidPoint, vec } from "./pose.ts";

export type Timeline = { duration: number; at: (ms: number) => Pose };

const DEG = Math.PI / 180;
/** Millimetres per second squared. Looks right on a bottle that is 214 mm tall; not real gravity. */
const G = 900;
const pose = (rigid: Pose["rigid"], moves: Pose["moves"], live: string, drops: Pose["drops"] = [], splashes: Pose["splashes"] = []): Pose => ({ ...REST, rigid, moves, live, drops, splashes });

const FLIP_UP = 1000;
const FLIP_BACK = 900;
const FLIP_LIFT = 90;
const DROP_GAP = 130;

function flip(o: Extract<Outcome, { test: "flip" }>, rig: Rig): Timeline {
  const hold = Math.max(1000, 500 + o.drops * DROP_GAP + 700);
  const held = { dx: 0, dy: FLIP_LIFT, angle: 180 };
  const spawns = Array.from({ length: o.drops }, (_, i) => FLIP_UP + 150 + i * DROP_GAP);
  const origins = spawns.map((_, i) => {
    const a = (-60 + (((i * 3) % 5) - 2) * 28) * DEG;
    return rigidPoint(rig, held, vec(rig.neckRadius * Math.cos(a), rig.jointY, -rig.neckRadius * Math.sin(a)));
  });
  const duration = FLIP_UP + hold + FLIP_BACK;
  return {
    duration,
    at: (ms) => {
      const rigid =
        ms < FLIP_UP ? { dx: 0, dy: FLIP_LIFT * smooth(ms / FLIP_UP), angle: 180 * smooth(ms / FLIP_UP) }
        : ms < FLIP_UP + hold ? held
        : { dx: 0, dy: FLIP_LIFT * (1 - smooth(clamp01((ms - FLIP_UP - hold) / FLIP_BACK))), angle: 180 + 180 * smooth(clamp01((ms - FLIP_UP - hold) / FLIP_BACK)) };
      const falling = spawns.flatMap((spawn, i) => {
        const tau = (ms - spawn) / 1000;
        const origin = origins[i]!;
        return tau >= 0 ? [{ origin, y: origin.y - 0.5 * G * tau * tau }] : [];
      });
      const drops = falling.filter((d) => d.y > DROP_RADIUS).map((d) => vec(d.origin.x, d.y, d.origin.z));
      const splashes = falling.filter((d) => d.y <= DROP_RADIUS).map((d) => vec(d.origin.x, 1.2, d.origin.z));
      return pose(rigid, {}, falling.length > 0 ? `Drops: ${falling.length}` : "Upside down", drops, splashes);
    },
  };
}

const SHAKE_EACH = 480;
const SHAKE_SWING = SHAKES * SHAKE_EACH;
const SHAKE_HOLD = 700;
const SHAKE_RESET = 650;
const CAP_FLY_SPEED = 110;

function shake(o: Extract<Outcome, { test: "shake" }>, rig: Rig): Timeline {
  const lift = (s: number) => o.liftPerShake * (Math.floor(s) + smooth(s - Math.floor(s)));
  let freeAt: number | null = null;
  if (o.falls) for (let ms = 0; ms <= SHAKE_SWING; ms += 4) if (lift(ms / SHAKE_EACH) >= ENGAGE) { freeAt = ms; break; }
  const landDy = rig.capHalf - rig.capY;
  const flight = Math.sqrt((2 * (ENGAGE - landDy)) / G);
  const turnPerMm = o.pitch > 0 ? 360 / o.pitch : 0;

  const capAt = (ms: number): Partial<Move> => {
    if (freeAt !== null && ms >= freeAt) {
      const tau = Math.min((ms - freeAt) / 1000, flight);
      return { dy: ENGAGE - 0.5 * G * tau * tau, dx: CAP_FLY_SPEED * tau, tilt: 35 * Math.sin((Math.PI * tau) / flight), turn: ENGAGE * turnPerMm + 540 * tau };
    }
    const l = lift(Math.min(ms, SHAKE_SWING) / SHAKE_EACH);
    return { dy: l, turn: l * turnPerMm };
  };

  const moved = o.liftPerShake > 0;
  const duration = SHAKE_SWING + (moved ? SHAKE_HOLD + SHAKE_RESET : 300);
  return {
    duration,
    at: (ms) => {
      const s = Math.min(ms, SHAKE_SWING) / SHAKE_EACH;
      const rigid = { dx: 14 * Math.sin(2 * Math.PI * s), dy: 0, angle: 5 * Math.sin(2 * Math.PI * s) };
      const end = capAt(SHAKE_SWING);
      const live = (at: number) => (freeAt !== null && at >= freeAt ? "Cap off" : `Cap up ${(capAt(at).dy ?? 0).toFixed(0)} mm`);
      if (ms < SHAKE_SWING) return pose(rigid, { cap: capAt(ms) }, `Shake ${Math.floor(s) + 1} of ${SHAKES} · ${live(ms)}`);
      if (!moved || ms < SHAKE_SWING + SHAKE_HOLD) return pose(rigid, { cap: end }, moved ? live(SHAKE_SWING) : "Cap seated");
      const p = smooth(clamp01((ms - SHAKE_SWING - SHAKE_HOLD) / SHAKE_RESET));
      const back = (n: number | undefined) => (n ?? 0) * (1 - p);
      return pose(rigid, { cap: { dx: back(end.dx), dy: back(end.dy) + 45 * Math.sin(Math.PI * p), turn: back(end.turn), tilt: back(end.tilt) } }, "Cap back on");
    },
  };
}

const OPEN_LIFTOFF = 450;
const OPEN_HOLD = 550;
const OPEN_BACK = 700;

function open(o: Extract<Outcome, { test: "open" }>): Timeline {
  if (o.refuses) {
    const duration = 1700;
    return {
      duration,
      at: (ms) => {
        const t = clamp01(ms / duration);
        const shudder = Math.sin(2 * Math.PI * 3.2 * t) * (1 - t);
        return pose({ dx: 1.2 * shudder, dy: 0, angle: 0 }, { cap: { turn: 12 * shudder } }, `Needs ${o.torque.toFixed(1)} N·m`);
      },
    };
  }
  const twist = 500 + o.turns * 260;
  const total = o.turns * 360;
  const duration = twist + OPEN_LIFTOFF + OPEN_HOLD + OPEN_BACK;
  return {
    duration,
    at: (ms) => {
      const rest = { dx: 0, dy: 0, angle: 0 };
      if (ms < twist) {
        const p = smooth(ms / twist);
        return pose(rest, { cap: { dy: ENGAGE * p, turn: total * p } }, `Turn ${(o.turns * p).toFixed(1)} of ${o.turns.toFixed(1)}`);
      }
      const lifted: Partial<Move> = { dy: ENGAGE + 50, turn: total + 90 };
      if (ms < twist + OPEN_LIFTOFF) {
        const q = easeOut((ms - twist) / OPEN_LIFTOFF);
        return pose(rest, { cap: { dy: ENGAGE + 50 * q, turn: total + 90 * q } }, `Open in ${o.turns.toFixed(1)} turns`);
      }
      if (ms < twist + OPEN_LIFTOFF + OPEN_HOLD) return pose(rest, { cap: lifted }, `Open in ${o.turns.toFixed(1)} turns`);
      const p = smooth(clamp01((ms - twist - OPEN_LIFTOFF - OPEN_HOLD) / OPEN_BACK));
      return pose(rest, { cap: { dy: (ENGAGE + 50) * (1 - p), turn: (total + 90) * (1 - p) } }, "Closing again");
    },
  };
}

export function timelineFor(o: Outcome, rig: Rig): Timeline {
  switch (o.test) {
    case "flip":
      return flip(o, rig);
    case "shake":
      return shake(o, rig);
    case "open":
      return open(o);
  }
}
