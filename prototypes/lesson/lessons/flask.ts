// The water bottle for its mechanism lesson (bottle-course.ts): one mechanism, the screw cap, which a thread holds
// down and a seal keeps dry. The bottle has one moving piece, the cap, with one state, a CapPose (how far it is lifted
// or thrown, how far it is turned, how far it is tipped), and every test frame goes through it. Each test decides its
// outcome from the parts present: with no thread the cap only rests on the neck, and with no seal water gets past it.
import { DEG_TO_RAD } from "../../../shared/angles.ts";
import { clamp01, lerp, smooth } from "../../../shared/primitives/motion/ease.ts";
import {
  AXIS,
  type Control,
  type Ctx,
  DEFAULT_VIEW,
  defineStory,
  familyOf,
  type Frame,
  type Mark,
  type Overlay,
  type PartMove,
  type Rigid,
  type Scene,
  STILL,
  type Test,
  type TestCtx,
  vec,
  type Vec,
} from "../model.ts";
import { rigidPoint } from "../pose.ts";
import { type Drop, dropsAt } from "../stories/drops.ts";
import { FLASK, FLASK_KIT } from "./flask-kit.ts";

const BODY = "body";
const CAP = "cap";
const THREAD = "thread";
const SEAL = "seal";

const has = (ctx: Ctx, id: string) => ctx.present.includes(id);
const seg = (ms: number, from: number, to: number) => smooth(clamp01((ms - from) / Math.max(1, to - from)));

/** How far the cap climbs in one turn: the thread's own pitch, so the cap is always seen riding the ridge. */
const PITCH = FLASK.threadPitch;
/** Turns from resting on top of the thread to seated. */
const TURNS = 1.5;
const LIFT = PITCH * TURNS;
/** Off the bottle, the cap waits this far above its seat. */
const AWAY = 34;

/** The cap away from its seat: shifted, turned about the bottle's axis (a positive turn unscrews it), then tipped. */
type CapPose = { dx: number; dy: number; turn: number; tilt: number };
const SEATED: CapPose = { dx: 0, dy: 0, turn: 0, tilt: 0 };
/** Resting on top of the thread, as many turns back as it takes to come down. */
const PERCHED: CapPose = { dx: 0, dy: LIFT, turn: 360 * TURNS, tilt: 0 };
const OFF: CapPose = { dx: 0, dy: AWAY, turn: 360 * TURNS, tilt: 0 };
const mix = (a: CapPose, b: CapPose, k: number): CapPose => ({
  dx: lerp(a.dx, b.dx, k),
  dy: lerp(a.dy, b.dy, k),
  turn: lerp(a.turn, b.turn, k),
  tilt: lerp(a.tilt, b.tilt, k),
});

const AXLE = vec(0, FLASK.capTop - 14, 0);
const capMove = (c: CapPose): PartMove => ({
  offset: vec(c.dx, c.dy, 0),
  turns: [
    { axis: AXIS.y, pivot: AXLE, deg: c.turn },
    { axis: AXIS.z, pivot: AXLE, deg: c.tilt },
  ],
});
const capAt = (ctx: Ctx, c: CapPose): Record<string, PartMove> =>
  has(ctx, CAP) ? Object.fromEntries(familyOf(ctx.kit, CAP).map((id) => [id, capMove(c)])) : {};

/** With no seal to land on, the cap comes down onto the bare lip. */
const rest = (ctx: Ctx): Scene => ({
  moves: has(ctx, SEAL) || !has(ctx, CAP) ? {} : Object.fromEntries(familyOf(ctx.kit, CAP).map((id) => [id, { offset: vec(0, -FLASK.seatDrop, 0) }])),
  marks: [],
});
const seatY = (ctx: Ctx) => (has(ctx, SEAL) ? 0 : -FLASK.seatDrop);

const frame = (ctx: Ctx, cap: CapPose, rigid: Rigid = STILL, marks: readonly Mark[] = []): Overlay => ({
  moves: capAt(ctx, cap),
  marks: [...marks],
  rigid,
  live: "",
});

const { g: G, marks: dropMarks } = dropsAt(0.8);

// ---- Shake: does the cap stay on? ----------------------------------------------------------------------------------

const SWING_MS = 440;
const SWINGS = 4;
const [SHAKE_DX, SHAKE_DEG] = [7, 2.5];
/** A cap that only rests on the neck comes off at the top of the second swing. */
const OFF_AT = 1.25 * SWING_MS;
const POP = { vx: 150, vy: 250, spin: 420 };
const SPILL = 9;

/** The bottle swung side to side from `from` for `swings`; `k` damps it. */
const swing = (ms: number, from: number, swings: number, k = 1): Rigid => {
  const s = clamp01((ms - from) / (swings * SWING_MS)) * swings;
  return { dx: SHAKE_DX * k * Math.sin(2 * Math.PI * s), dy: 0, angle: SHAKE_DEG * k * Math.sin(2 * Math.PI * s) };
};

/**
 * Shake it. A thread carries the cap down as it is twisted and holds it there, so with one the run opens with the twist
 * and the cap rides the shaking out. With none the cap only rests on the neck: it rattles, comes off, and the drink
 * goes with it. The run ends with the cap gone, so the screen cuts back; nothing puts it on again.
 */
const shake: Test = {
  id: "shake",
  label: "Shake",
  run: (_, ctx) => {
    if (has(ctx, THREAD)) {
      const [twist, settle, tail] = [900, 220, 500];
      const from = twist + settle;
      return {
        verdict: { pass: true, line: "The cap stayed on." },
        durationMs: from + SWINGS * SWING_MS + tail,
        at: (ms) => frame(ctx, mix(PERCHED, SEATED, seg(ms, 0, twist)), swing(ms, from, SWINGS)),
      };
    }
    const mouth = vec(0, FLASK.rim, 0);
    const rigidAt = (ms: number) => swing(ms, 0, SWINGS, 1 - seg(ms, OFF_AT, OFF_AT + 500));
    const spill: Drop[] = Array.from({ length: SPILL }, (_, i) => {
      const spawn = OFF_AT + 40 + i * 60;
      return {
        spawn,
        origin: rigidPoint(ctx.centre, rigidAt(spawn), mouth),
        vx: 70 + 22 * ((i * 7) % 4),
        vy: 190 + 26 * ((i * 5) % 3),
        vz: -16 + 12 * ((i * 3) % 4),
      };
    });
    const capAtMs = (ms: number): CapPose => {
      if (ms < OFF_AT) {
        // Rattling: it hops on a neck it never gripped.
        const hop = 3 * Math.abs(Math.sin((2 * Math.PI * ms) / SWING_MS));
        return { dx: 0, dy: hop, turn: 8 * Math.sin((4 * Math.PI * ms) / SWING_MS), tilt: 5 * Math.sin((2 * Math.PI * ms) / SWING_MS) };
      }
      const t = (ms - OFF_AT) / 1000;
      return { dx: POP.vx * t, dy: 3 + POP.vy * t - 0.5 * G * t * t, turn: 0, tilt: -POP.spin * t };
    };
    return {
      verdict: { pass: false, line: "The cap came off." },
      durationMs: OFF_AT + 1700,
      at: (ms) => frame(ctx, capAtMs(ms), rigidAt(ms), dropMarks(spill, ms)),
    };
  },
};

// ---- Flip: does it stay dry? ---------------------------------------------------------------------------------------

/** The bottle turns over about its shoulder, so the cap end stays in a view framed on it. */
const PIVOT = vec(0, 215, 0);
/** A turn of the whole bottle by `angle` degrees that leaves `PIVOT` where it is. */
function about(centre: Vec, angle: number): Rigid {
  const [dx, dy, a] = [PIVOT.x - centre.x, PIVOT.y - centre.y, angle * DEG_TO_RAD];
  return { dx: dx - (dx * Math.cos(a) - dy * Math.sin(a)), dy: dy - (dx * Math.sin(a) + dy * Math.cos(a)), angle };
}
const OVER = -180;
const [FLIP_MS, BACK_MS] = [850, 750];
const LEAKS = 8;
const LEAK_GAP = 170;

/** Upside down, water that got past the cap gathers at the skirt's edge and falls from it, one drop after another. */
function leak(ctx: TestCtx, from: number): Drop[] {
  const held = about(ctx.centre, OVER);
  return Array.from({ length: LEAKS }, (_, i) => {
    const a = (-70 + (((i * 3) % 5) - 2) * 34) * DEG_TO_RAD;
    return {
      spawn: from + i * LEAK_GAP,
      origin: rigidPoint(ctx.centre, held, vec((FLASK.capR - 1) * Math.cos(a), FLASK.skirt + seatY(ctx), -(FLASK.capR - 1) * Math.sin(a))),
      vx: 0,
      vy: 0,
      vz: 0,
    };
  });
}

/** Turn it over and wait. With a seal squeezed under the cap nothing comes out; without one it drips from under the cap. */
const flip: Test = {
  id: "flip",
  label: "Flip",
  run: (_, ctx) => {
    const dry = has(ctx, SEAL) && has(ctx, THREAD);
    const drops = dry ? [] : leak(ctx, FLIP_MS + 120);
    const hold = dry ? 1300 : 120 + LEAKS * LEAK_GAP + 700;
    return {
      verdict: dry ? { pass: true, line: "Dry. Not a drop." } : { pass: false, line: "It drips from under the cap." },
      durationMs: FLIP_MS + hold + BACK_MS,
      at: (ms) =>
        frame(ctx, SEATED, about(ctx.centre, OVER * seg(ms, 0, FLIP_MS) * (1 - seg(ms, FLIP_MS + hold, FLIP_MS + hold + BACK_MS))), dropMarks(drops, ms)),
    };
  },
};

// ---- The preview: the cap doing both jobs ---------------------------------------------------------------------------

/** The screw cap, working: it comes down, twists on, rides out a shake, stays dry upside down, and twists off again. */
const closing: Test = {
  id: "closing",
  label: "Close",
  run: (_, ctx) => {
    const steps: [number, (k: number) => { cap: CapPose; rigid?: Rigid }][] = [
      [350, () => ({ cap: OFF })],
      [520, (k) => ({ cap: mix(OFF, PERCHED, smooth(k)) })],
      [950, (k) => ({ cap: mix(PERCHED, SEATED, smooth(k)) })],
      [260, () => ({ cap: SEATED })],
      [2 * SWING_MS, (k) => ({ cap: SEATED, rigid: swing(k * 2 * SWING_MS, 0, 2) })],
      [200, () => ({ cap: SEATED })],
      [FLIP_MS, (k) => ({ cap: SEATED, rigid: about(ctx.centre, OVER * smooth(k)) })],
      [1100, () => ({ cap: SEATED, rigid: about(ctx.centre, OVER) })],
      [BACK_MS, (k) => ({ cap: SEATED, rigid: about(ctx.centre, OVER * (1 - smooth(k))) })],
      [300, () => ({ cap: SEATED })],
      [950, (k) => ({ cap: mix(SEATED, PERCHED, smooth(k)) })],
      [520, (k) => ({ cap: mix(PERCHED, OFF, smooth(k)) })],
    ];
    return {
      verdict: { pass: true, line: "" },
      durationMs: steps.reduce((sum, [ms]) => sum + ms, 0),
      at: (ms) => {
        let from = 0;
        for (const [length, pose] of steps) {
          if (ms <= from + length) {
            const { cap, rigid } = pose(clamp01((ms - from) / length));
            return frame(ctx, cap, rigid);
          }
          from += length;
        }
        return frame(ctx, OFF);
      },
    };
  },
};

// ---- The story the mechanism lesson is bound to ---------------------------------------------------------------------

/** The cap, twisted by hand: only the story's own screens use it; the mechanism lesson hands over no control. */
const twist: Control = {
  key: "twist",
  verb: "Twist",
  start: 0,
  zones: () => [
    { id: "loose", word: "Loose", until: 0.6, gain: 1 },
    { id: "snug", word: "Snug", until: 1, gain: 0.45 },
  ],
  pose: (t, ctx): Scene => ({ moves: capAt(ctx, mix(PERCHED, SEATED, clamp01(t / 0.6))), marks: [] }),
};

/**
 * The bottle is too tall to read whole, so every lesson screen frames the cap end. A shake needs room for the carry loop
 * on one side only; a flip swings the loop over to the other side and sends drops down, so its frame is wider and lower.
 */
const frameOf = (x0: number, x1: number, y0: number, y1: number): Frame => ({ min: vec(x0, y0, -40), max: vec(x1, y1, 40) });
const FRAMES = { shake: frameOf(-82, 52, 124, 312), flip: frameOf(-76, 76, 108, 308) } as const;
/** The piece waits over the carry loop, in the corner the bottle leaves empty. */
const TRAY = vec(-46, 291, 0);

export default defineStory({
  id: "flask",
  view: DEFAULT_VIEW,
  freePlay: true,
  objectName: "Water bottle",
  match: /\b(bottle|flask|thermos)\b/i,
  build: "drag",
  kit: FLASK_KIT,
  rest,
  modules: [
    {
      id: "closed",
      title: "Keep it closed",
      need: "The cap must stay on.",
      primitive: "thread",
      place: {
        say: "Where does the thread go? Drag it on.",
        piece: [THREAD],
        ride: BODY,
        builds: true,
        hide: [],
        spots: [
          { id: "neck", at: vec(0, FLASK.threadY, 0), radius: FLASK.threadR, right: true, line: "Right there. The cap's skirt rides it down." },
          // The two wrong spots are each on one of the two parts, where the other never reaches.
          { id: "shoulder", at: vec(0, 192, 0), radius: FLASK.bodyR + 1.1, line: "Below the cap. The cap never reaches it." },
          { id: "spout", at: vec(0, 256.5, 0), radius: 18.4, ride: CAP, line: "Up on the cap. The neck never reaches it." },
        ],
        frame: FRAMES.shake,
        tray: TRAY,
      },
      produces: [THREAD],
      without: { say: "Shake it. Watch the cap.", line: "A cap that just sits there comes off.", test: shake, adds: [], values: {} },
      learn: {
        say: "Twist it. The nut rides the spiral.",
        rigs: {
          thread: {
            controls: { turns: "Twist" },
            why: [
              "A thread is a ramp wrapped round a post.",
              "Twist the nut and the ramp carries it along.",
              "On the bottle, that ramp pulls the cap down and holds it there.",
            ],
          },
        },
      },
      uses: { thread: "A thread turns your twist into a grip that holds the cap down." },
      assemble: { piece: "Thread", title: "The thread winds round the neck.", built: "The thread now runs round the neck, under the cap." },
      target: { label: "Neck", at: vec(0, FLASK.threadY, 0), ring: { radius: 34, axis: "y" } },
      play: { say: "Twist the cap on. Then shake.", control: twist, tests: [shake] },
      hints: ["Watch the cap while it shakes.", "A cap that only rests on the neck comes off."],
      why: ["The cap closes the bottle, but on its own it just sits there.", "The thread pulls the cap down and holds it tight."],
      job: "The thread holds the cap on.",
      cheer: "Locked on!",
    },
    {
      id: "dry",
      title: "Keep it dry",
      need: "Water must not leak.",
      primitive: "seal",
      place: {
        say: "Where does the seal go? Drag it on.",
        piece: [SEAL],
        ride: BODY,
        builds: true,
        hide: [],
        spots: [
          { id: "rim", at: vec(0, FLASK.sealY, 0), radius: FLASK.sealR, right: true, line: "Right there. The cap comes down on it." },
          { id: "shoulder", at: vec(0, 195, 0), radius: FLASK.bodyR + 1.4, line: "Below the cap. Nothing squeezes it." },
          // Well clear of the rim, so a tap meant for one never lands on the other.
          { id: "spout", at: vec(0, 257, 0), radius: 18.4, ride: CAP, line: "Up on the cap. The water never gets there." },
        ],
        frame: FRAMES.flip,
        tray: TRAY,
      },
      produces: [SEAL],
      without: { say: "Flip it. Any drips?", line: "Hard on hard leaves tiny gaps. Water finds them.", test: flip, adds: [], values: {} },
      learn: {
        say: "Squeeze it until it stops leaking.",
        rigs: {
          seal: {
            controls: { squeeze: "Squeeze" },
            why: [
              "Rubber is soft, so it changes shape when you squeeze it.",
              "Pressed between two hard faces, it spreads into every tiny gap.",
              "That closes the path water would take.",
            ],
          },
        },
      },
      uses: { seal: "Squeezed rubber fills the tiny gaps, so water can't get out." },
      assemble: { piece: "Seal", title: "The seal sits on the mouth, under the cap.", built: "The soft ring now sits where the cap meets the mouth." },
      target: { label: "Mouth", at: vec(0, FLASK.sealY, 0), ring: { radius: 33, axis: "y" } },
      play: { say: "Twist it snug. Then flip it.", control: twist, tests: [flip] },
      hints: ["Watch where the drops come from.", "The cap has to press the seal to close the gaps."],
      why: ["A cap and a neck never fit perfectly. There are tiny gaps.", "The seal is soft rubber that the cap squeezes into those gaps."],
      job: "The seal keeps it dry.",
      cheer: "Sealed tight!",
    },
  ],
  final: {
    title: "Put it together",
    say: "Shake it, then flip it.",
    success: "You built a water bottle.",
    cheer: "Cheers! Bottle built.",
    control: twist,
    tests: [shake, flip],
    why: ["Each part has one job, and the cap needs both.", "Take one away and it stops working: the cap comes off, or it leaks."],
    payoff: [
      { part: "Thread", job: "holds the cap on." },
      { part: "Seal", job: "keeps it dry." },
    ],
  },
});

/** The bottle's tests by name, for the mechanism lesson (bottle-course.ts), which asks its own questions of the same model. */
export const FLASK_RIG = {
  tests: { shake, flip },
  /** The mechanism working, to watch before building it. */
  demos: { closing },
  frames: FRAMES,
} as const;
