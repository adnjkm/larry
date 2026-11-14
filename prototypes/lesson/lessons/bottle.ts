// The water bottle: close with a twist (thread pitch), stay dry upside down (seal squeeze).
// Rules and choreography for Flip, Shake and Open live here, as pure functions of the tuned values.
import type { Kit, Part, Shape } from "../../../shared/kit.ts";
import { clamp01, easeOut, smooth } from "../ease.ts";
import { AXIS, type Ctx, defineLesson, EMPTY_SCENE, type Scene, type Mark, type Overlay, type PartMove, type Rigid, STILL, type Test, type Values, vec, type Window } from "../model.ts";
import { extents, rigidPoint } from "../pose.ts";

const CAP = "cap";
const RING = "seal-ring";
const BODY = "body";
const DEG = Math.PI / 180;

/** Above 4 mm a shake walks the cap off; below 3 mm it takes more than MAX_TURNS to open. Game numbers. */
const PITCH_WINDOW: Window = [3, 4];
/** Squeeze that fills the gaps without crushing the rubber. The 15 to 30 percent band is the typical range for static seals. */
const SQUEEZE_WINDOW: Window = [0.15, 0.3];
const SHAKES = 5;
/** Millimetres of thread the cap rides on. Game number. */
const ENGAGE = 12;
const LIFT_PER_PITCH_OVER = 4;
const MAX_DROPS = 12;
const HAND_TORQUE = 2.5;
/** A cap that is still on after this many turns counts as too slow to open. Game number. */
const MAX_TURNS = 4;
/** Millimetres per second squared. Looks right on a bottle that is 214 mm tall; not real gravity. */
const G = 900;
const NECK_RADIUS = 27;
const DROP_RADIUS = 6;
/** Direction the turn mark starts at, so it faces the default camera. */
const MARK_ANGLE = -60;
const MARK_RADIUS = 27.8;

const pitchOf = (v: Values) => v.pitch ?? 4;
const squeezeOf = (v: Values) => v.squeeze ?? 0.2;
const pct = (squeeze: number) => Math.round(squeeze * 100);

function find(kit: Kit, id: string): Part {
  const p = kit.parts.find((q) => q.id === id);
  if (!p) throw new Error(`kit has no part ${id}`);
  return p;
}

/** Measurements the timelines need, read from the kit so nothing is typed in twice. */
function rigOf({ kit, present }: Ctx) {
  const cap = find(kit, CAP);
  const capBox = extents([cap]);
  const seatDrop = present.includes(RING) ? 0 : capBox.min.y - extents([find(kit, BODY)]).max.y;
  return {
    capPivot: cap.position,
    /** Height of the gap between cap and neck, where leaks start. */
    jointY: capBox.min.y - seatDrop,
    capY: cap.position.y - seatDrop,
    capHalf: (capBox.max.y - capBox.min.y) / 2,
    seatDrop,
  };
}

type CapPose = { dx?: number; dy?: number; turn?: number; tilt?: number };
const capMove = (pivot: Part["position"], c: CapPose): PartMove => ({
  offset: vec(c.dx ?? 0, c.dy ?? 0, 0),
  turns: [{ axis: AXIS.z, pivot, deg: c.tilt ?? 0 }, { axis: AXIS.y, pivot, deg: c.turn ?? 0 }],
});
const overlay = (rigid: Rigid, live: string, moves: Overlay["moves"] = {}, marks: Mark[] = []): Overlay => ({ rigid, live, moves, marks });

const sphere = (r: number): Shape => ({
  kind: "lathe",
  profile: [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const a = (i / 6) * Math.PI - Math.PI / 2;
    return { r: i === 0 || i === 6 ? 0 : r * Math.cos(a), y: r * Math.sin(a) };
  }),
});
const DROP_SHAPE = sphere(DROP_RADIUS);
const SPLASH_SHAPE: Shape = { kind: "lathe", profile: [{ r: 0, y: 0 }, { r: 8, y: 0 }, { r: 8, y: 2 }, { r: 0, y: 2 }] };

const FLIP_UP = 1000;
const FLIP_BACK = 900;
const FLIP_LIFT = 90;
const DROP_GAP = 130;

const flip: Test = {
  id: "flip",
  label: "Flip",
  run: (values, ctx) => {
    const squeeze = squeezeOf(values);
    const gap = pct(SQUEEZE_WINDOW[0]) - pct(squeeze);
    const drops = gap > 0 ? Math.max(1, Math.ceil((MAX_DROPS * gap) / pct(SQUEEZE_WINDOW[0]))) : 0;
    const verdict = drops === 0
      ? { pass: true, line: "Dry. Nothing got past the joint." }
      : { pass: false, line: `${drops} drops got past the joint between the cap and the neck.` };

    const rig = rigOf(ctx);
    const hold = Math.max(1000, 500 + drops * DROP_GAP + 700);
    const held: Rigid = { dx: 0, dy: FLIP_LIFT, angle: 180 };
    const spawns = Array.from({ length: drops }, (_, i) => FLIP_UP + 150 + i * DROP_GAP);
    const origins = spawns.map((_, i) => {
      const a = (-60 + (((i * 3) % 5) - 2) * 28) * DEG;
      return rigidPoint(ctx.centre, held, vec(NECK_RADIUS * Math.cos(a), rig.jointY, -NECK_RADIUS * Math.sin(a)));
    });
    return {
      verdict,
      durationMs: FLIP_UP + hold + FLIP_BACK,
      at: (ms) => {
        const back = smooth(clamp01((ms - FLIP_UP - hold) / FLIP_BACK));
        const rigid: Rigid =
          ms < FLIP_UP ? { dx: 0, dy: FLIP_LIFT * smooth(ms / FLIP_UP), angle: 180 * smooth(ms / FLIP_UP) }
          : ms < FLIP_UP + hold ? held
          : { dx: 0, dy: FLIP_LIFT * (1 - back), angle: 180 + 180 * back };
        const falling = spawns.flatMap((spawn, i) => {
          const tau = (ms - spawn) / 1000;
          const origin = origins[i]!;
          return tau >= 0 ? [{ origin, y: origin.y - 0.5 * G * tau * tau }] : [];
        });
        const marks = falling.map((d, i): Mark =>
          d.y > DROP_RADIUS
            ? { id: `drop-${i}`, shape: DROP_SHAPE, at: vec(d.origin.x, d.y, d.origin.z), ride: null }
            : { id: `splash-${i}`, shape: SPLASH_SHAPE, at: vec(d.origin.x, 1.2, d.origin.z), ride: null });
        return overlay(rigid, falling.length > 0 ? `Drops: ${falling.length}` : "Upside down", {}, marks);
      },
    };
  },
};

const SHAKE_EACH = 480;
const SHAKE_SWING = SHAKES * SHAKE_EACH;
const SHAKE_HOLD = 700;
const SHAKE_RESET = 650;
const CAP_FLY_SPEED = 110;

const shake: Test = {
  id: "shake",
  label: "Shake",
  run: (values, ctx) => {
    const pitch = pitchOf(values);
    const liftPerShake = Math.max(0, pitch - PITCH_WINDOW[1]) * LIFT_PER_PITCH_OVER;
    const falls = liftPerShake * SHAKES >= ENGAGE;
    const verdict =
      liftPerShake === 0 ? { pass: true, line: "The cap stayed seated through every shake." }
      : falls ? { pass: false, line: `The cap walked off the neck on shake ${Math.ceil(ENGAGE / liftPerShake)}.` }
      : { pass: false, line: `The cap crept up ${liftPerShake * SHAKES} mm and would be off in a few more shakes.` };

    const rig = rigOf(ctx);
    const lift = (s: number) => liftPerShake * (Math.floor(s) + smooth(s - Math.floor(s)));
    let freeAt: number | null = null;
    if (falls) for (let ms = 0; ms <= SHAKE_SWING; ms += 4) if (lift(ms / SHAKE_EACH) >= ENGAGE) { freeAt = ms; break; }
    const landDy = rig.capHalf - rig.capY;
    const flight = Math.sqrt((2 * (ENGAGE - landDy)) / G);
    const turnPerMm = 360 / pitch;
    const capAt = (ms: number): CapPose => {
      if (freeAt !== null && ms >= freeAt) {
        const tau = Math.min((ms - freeAt) / 1000, flight);
        return { dy: ENGAGE - 0.5 * G * tau * tau, dx: CAP_FLY_SPEED * tau, tilt: 35 * Math.sin((Math.PI * tau) / flight), turn: ENGAGE * turnPerMm + 540 * tau };
      }
      const l = lift(Math.min(ms, SHAKE_SWING) / SHAKE_EACH);
      return { dy: l, turn: l * turnPerMm };
    };
    const cap = (c: CapPose) => ({ [CAP]: capMove(rig.capPivot, c) });
    const moved = liftPerShake > 0;
    const end = capAt(SHAKE_SWING);
    const live = (at: number) => (freeAt !== null && at >= freeAt ? "Cap off" : `Cap up ${(capAt(at).dy ?? 0).toFixed(0)} mm`);
    return {
      verdict,
      durationMs: SHAKE_SWING + (moved ? SHAKE_HOLD + SHAKE_RESET : 300),
      at: (ms) => {
        const s = Math.min(ms, SHAKE_SWING) / SHAKE_EACH;
        const rigid: Rigid = { dx: 14 * Math.sin(2 * Math.PI * s), dy: 0, angle: 5 * Math.sin(2 * Math.PI * s) };
        if (ms < SHAKE_SWING) return overlay(rigid, `Shake ${Math.floor(s) + 1} of ${SHAKES} · ${live(ms)}`, cap(capAt(ms)));
        if (!moved || ms < SHAKE_SWING + SHAKE_HOLD) return overlay(rigid, moved ? live(SHAKE_SWING) : "Cap seated", cap(end));
        const p = smooth(clamp01((ms - SHAKE_SWING - SHAKE_HOLD) / SHAKE_RESET));
        const back = (n: number | undefined) => (n ?? 0) * (1 - p);
        return overlay(rigid, "Cap back on", cap({ dx: back(end.dx), dy: back(end.dy) + 45 * Math.sin(Math.PI * p), turn: back(end.turn), tilt: back(end.tilt) }));
      },
    };
  },
};

const OPEN_LIFTOFF = 450;
const OPEN_HOLD = 550;
const OPEN_BACK = 700;
const REFUSE_MS = 1700;

const open: Test = {
  id: "open",
  label: "Open",
  run: (values, ctx) => {
    const pitch = pitchOf(values);
    const squeeze = squeezeOf(values);
    const turns = ENGAGE / pitch;
    const torque = 0.4 + 7 * squeeze;
    const rig = rigOf(ctx);
    const cap = (c: CapPose) => ({ [CAP]: capMove(rig.capPivot, c) });
    if (pct(squeeze) > pct(SQUEEZE_WINDOW[1])) {
      return {
        verdict: { pass: false, line: `It refused. It needs ${torque.toFixed(1)} N·m and a hand gives about ${HAND_TORQUE}.`, nudge: "The rubber is gripping the cap far too hard." },
        durationMs: REFUSE_MS,
        at: (ms) => {
          const t = clamp01(ms / REFUSE_MS);
          const shudder = Math.sin(2 * Math.PI * 3.2 * t) * (1 - t);
          return overlay({ dx: 1.2 * shudder, dy: 0, angle: 0 }, `Needs ${torque.toFixed(1)} N·m`, cap({ turn: 12 * shudder }));
        },
      };
    }
    if (turns > MAX_TURNS + 1e-9) {
      const gave = MAX_TURNS * 360;
      const rise = MAX_TURNS * pitch;
      const twistMs = 500 + MAX_TURNS * 260;
      return {
        verdict: { pass: false, line: `Still on after ${MAX_TURNS} turns. At ${pitch} mm a turn, freeing ${ENGAGE} mm of thread takes ${turns.toFixed(1)} turns.` },
        durationMs: twistMs + OPEN_HOLD + OPEN_BACK,
        at: (ms) => {
          if (ms < twistMs) {
            const p = smooth(ms / twistMs);
            return overlay(STILL, `Turn ${(MAX_TURNS * p).toFixed(1)} of ${turns.toFixed(1)}`, cap({ dy: rise * p, turn: gave * p }));
          }
          if (ms < twistMs + OPEN_HOLD) return overlay(STILL, `Still on after ${MAX_TURNS} turns`, cap({ dy: rise, turn: gave }));
          const p = smooth(clamp01((ms - twistMs - OPEN_HOLD) / OPEN_BACK));
          return overlay(STILL, "Giving up", cap({ dy: rise * (1 - p), turn: gave * (1 - p) }));
        },
      };
    }
    const twist = 500 + turns * 260;
    const total = turns * 360;
    return {
      verdict: { pass: true, line: `Opened by hand in ${turns.toFixed(1)} turns.` },
      durationMs: twist + OPEN_LIFTOFF + OPEN_HOLD + OPEN_BACK,
      at: (ms) => {
        if (ms < twist) {
          const p = smooth(ms / twist);
          return overlay(STILL, `Turn ${(turns * p).toFixed(1)} of ${turns.toFixed(1)}`, cap({ dy: ENGAGE * p, turn: total * p }));
        }
        if (ms < twist + OPEN_LIFTOFF + OPEN_HOLD) {
          const q = easeOut(clamp01((ms - twist) / OPEN_LIFTOFF));
          return overlay(STILL, `Open in ${turns.toFixed(1)} turns`, cap({ dy: ENGAGE + 50 * q, turn: total + 90 * q }));
        }
        const p = smooth(clamp01((ms - twist - OPEN_LIFTOFF - OPEN_HOLD) / OPEN_BACK));
        return overlay(STILL, "Closing again", cap({ dy: (ENGAGE + 50) * (1 - p), turn: (total + 90) * (1 - p) }));
      },
    };
  },
};

export default defineLesson({
  id: "bottle",
  objectName: "Water bottle",
  match: /\b(bottle|flask|thermos)\b/i,
  // Without the seal ring under it the cap sits lower, and a turn mark rides the cap so its spin shows.
  rest: (ctx): Scene => {
    if (!ctx.present.includes(CAP)) return EMPTY_SCENE;
    const rig = rigOf(ctx);
    const c = rig.capPivot;
    const mark: Mark = {
      id: "turn-mark", ride: CAP,
      shape: { kind: "box", width: 3, height: 20, depth: 5, cornerRadius: 1 },
      at: vec(c.x + MARK_RADIUS * Math.cos(MARK_ANGLE * DEG), c.y, c.z - MARK_RADIUS * Math.sin(MARK_ANGLE * DEG)),
      rotation: vec(0, MARK_ANGLE, 0),
    };
    return { moves: { [CAP]: { offset: vec(0, -rig.seatDrop, 0) } }, marks: [mark] };
  },
  modules: [
    {
      id: "twist",
      title: "Close with a twist",
      need: "It must close with a twist and stay shut when shaken.",
      primitive: "thread",
      produces: [CAP],
      assemble: {
        piece: "Thread nut",
        title: "Wind the thread onto the neck: it becomes the cap.",
        built: "The thread's nut is now the steel cap, and its ramp winds round the neck.",
      },
      target: { label: "Neck", at: vec(0, 190, 0), ring: { radius: 33, axis: "y" } },
      enter: vec(0, 50, 0),
      fault: { primitive: "thread", slider: "pitch", start: 6 },
      fix: { window: PITCH_WINDOW },
      tests: [shake, open],
      hints: {
        observe: "Run Shake and watch the cap. It climbs the neck a little with every shake.",
        principle: "A thread is a wedge wound around the neck, and pitch is how far the cap rises in one turn. On a steep thread a jolt can turn the cap and push it up the ramp.",
        direction: "Make the pitch smaller, but not too small. Every turn then lifts the cap less, so opening takes more turns.",
        low: "Opening takes more than 4 turns and the cap is still on.",
        high: "A shake walks the cap up the thread and off.",
      },
      suspect: CAP,
      misses: { [BODY]: "The body is what everything else rides on. Look for the part that moves relative to it." },
      missDefault: "That part stays where it is during Shake. Watch which one moves.",
      why: "A thread is a wedge wrapped round a rod. A shallow one makes the cap climb slowly, and real threads mostly stay put by friction, which grows as the thread gets shallower. Finer pitch costs more turns to close.",
      gameNote: "Game numbers: 12 mm of thread is engaged, each shake lifts the cap 4 mm for every mm of pitch over 4, and a cap still on after 4 turns counts as too slow. Real bottle threads are finer and open in one or two turns, so both failures are exaggerated to make them visible.",
      readoutWith: (pitch) => ({ turns: ENGAGE / pitch }),
      numbers: (v) => {
        const pitch = pitchOf(v);
        const lift = Math.max(0, pitch - PITCH_WINDOW[1]) * LIFT_PER_PITCH_OVER;
        return [
          { label: "To open", value: `${ENGAGE} mm ÷ ${pitch} mm = ${(ENGAGE / pitch).toFixed(1)} turns (limit ${MAX_TURNS})` },
          { label: "Each shake", value: lift > 0 ? `cap climbs ${lift} mm (off after ${ENGAGE} mm)` : "cap stays put" },
        ];
      },
    },
    {
      id: "dry",
      title: "Stay dry upside down",
      need: "It must stay dry upside down and still open by hand.",
      primitive: "seal",
      produces: [RING, "ring-tab"],
      assemble: {
        piece: "Seal",
        title: "Press the seal into the neck: it becomes the seal ring.",
        built: "The rubber ring now sits between the cap and the neck, ready to be squeezed into the gap.",
      },
      target: { label: "Neck joint", at: vec(0, 180, 0), ring: { radius: 33, axis: "y" } },
      enter: vec(60, 0, 0),
      fault: { primitive: "seal", slider: "squeeze", start: 0.03 },
      fix: { window: SQUEEZE_WINDOW },
      tests: [flip, open],
      hints: {
        observe: "Run Flip and watch where the drops start. They come out at the joint between the cap and the neck.",
        principle: "A seal works by being squeezed. Two hard surfaces never fit perfectly, and squeezed rubber is pressed into the gaps between them. Squeeze it too little and the gaps stay open.",
        direction: "Squeeze more, but not too far. Check Flip and Open together.",
        low: "The gaps stay open and Flip leaks.",
        high: "Crushed rubber grips the cap so hard that Open needs more torque than a hand gives.",
      },
      suspect: RING,
      misses: {
        [BODY]: "That holds the water, but it isn't where it leaks. Run Flip and watch where the drops start.",
        [CAP]: "The cap stays on tight. The drops start lower, in the gap between the cap and the neck.",
        "ring-tab": "The tab is only a handle for your fingers. It never touches the water.",
      },
      missDefault: "That isn't where the water gets out. Run Flip and watch where the drops start.",
      why: "A rubber ring squeezed about 15 to 30 percent is pressed into the tiny gaps in the joint and closes them. Less leaks. More is crushed, and the cap becomes too hard to twist. Static seals are typically squeezed in that range.",
      numbers: (v) => {
        const squeeze = squeezeOf(v);
        return [{ label: "Torque to open", value: `0.4 + 7 × ${squeeze.toFixed(2)} = ${(0.4 + 7 * squeeze).toFixed(1)} N·m (a hand gives ${HAND_TORQUE})` }];
      },
      gameNote: "Game numbers: a hand gives about 2.5 N·m, and the torque to open is taken as 0.4 + 7 × squeeze in N·m. The 15 to 30 percent band is the typical range for static seals, not a measured limit for this bottle.",
    },
  ],
  final: {
    need: "It must stay shut when shaken, stay dry upside down, and open by hand.",
    success: "You built a water bottle.",
    detail: "It stays shut when shaken, stays dry upside down, and opens by hand.",
    tests: [flip, shake, open],
  },
});

