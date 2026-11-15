// The water bottle, told with no numbers: without a thread the cap falls off, without a seal it
// leaks. The player twists the cap on by hand; how far it is twisted decides Shake, Flip and Open.
// Rules and choreography live here as pure functions of the twist and the parts present.
import type { Kit, Part } from "../../../shared/kit.ts";
import { clamp01, easeOut, smooth } from "../../../shared/primitives/motion/ease.ts";
import {
  AXIS,
  type Control,
  type Ctx,
  defineStory,
  EMPTY_SCENE,
  type ExplodePlan,
  familyOf,
  type Mark,
  type Overlay,
  type PartMove,
  type Rigid,
  type Scene,
  type Test,
  type Values,
  vec,
  type Zone,
  zoneAt,
} from "../model.ts";
import { extents, rigidPoint } from "../pose.ts";
import { BOTTLE_KIT } from "./bottle-kit.ts";
import { type Drop, dropsAt } from "../stories/drops.ts";
import { DEG_TO_RAD } from "../../../shared/angles.ts";

const CAP = "cap";
const RING = "seal-ring";
const BODY = "body";
const TWIST = "twist";

/** Twist at which the cap first sits down on the neck (or on the seal). */
const SEATED = 0.6;
/** With no seal, metal meets metal just past seating and the cap stops. */
const STOP_BARE = 0.72;
/** Past this the cap crushes the seal and grips too hard to open. */
const CRUSHED = 0.82;
/** How far above its seat a loose cap rests, in mm. */
const LIFT = 9;
/** Turns the cap makes from resting loose to seated. */
const TURNS_TO_SEAT = 2.5;
/** How far a snug cap presses into the seal, in mm, and how far a crushing one does at the end of its travel: enough to see the pink band nearly vanish. */
const SNUG_SINK = 1.5;
const CRUSH_SINK = 6;
/** How crooked a loose cap sits, in degrees: it rests on the thread without gripping it, and straightens as it twists down. */
const CROOKED = 9;

const LOOSE: Omit<Zone, "until"> = { id: "loose", word: "Loose", gain: 1 };
const SNUG: Omit<Zone, "until"> = { id: "snug", word: "Snug", gain: 0.45 };
const TIGHT: Omit<Zone, "until"> = { id: "tight", word: "Too tight", gain: 0.22 };
/** With the seal there is something to squeeze, so the cap can go too far; without it, it stops at snug. */
const zonesOf = ({ present }: Ctx): Zone[] =>
  present.includes(RING)
    ? [
        { ...LOOSE, until: SEATED },
        { ...SNUG, until: CRUSHED },
        { ...TIGHT, until: 1 },
      ]
    : [
        { ...LOOSE, until: SEATED },
        { ...SNUG, gain: 0.35, until: STOP_BARE },
      ];

const twistOf = (v: Values) => v[TWIST] ?? 0;
const zoneOf = (v: Values, ctx: Ctx) => zoneAt(zonesOf(ctx), twistOf(v)).id;

/** Drips gather at the cap's rim, just inside its knurled grip. */
const NECK_RADIUS = 29;
/** The turn mark sits on one ridge of the knurled grip, so the twist shows. */
const MARK_ANGLE = -53.75;
const MARK_RADIUS = 31.4;
const MARK_Y = 188;

/**
 * Coming apart, the cap unscrews as it lifts (turning the way it came on, which is what a thread
 * does), then the seal slides up off the neck. Far enough that the neck's thread shows bare between them.
 */
const CAP_RISE = 50;
const SEAL_RISE = 32;
const UNSCREW_TURNS = 1.5;
/** The cap keeps turning for this share of its rise, so the spin is slow enough to follow. */
const UNSCREW_SHARE = 0.85;
const explode: ExplodePlan = {
  order: [
    {
      id: CAP,
      at: (s) => ({ offset: vec(0, CAP_RISE * s, 0), turns: [{ axis: AXIS.y, pivot: vec(), deg: -360 * UNSCREW_TURNS * Math.min(1, s / UNSCREW_SHARE) }] }),
    },
    { id: RING, at: (s) => ({ offset: vec(0, SEAL_RISE * s, 0) }) },
  ],
};

function find(kit: Kit, id: string): Part {
  const p = kit.parts.find((q) => q.id === id);
  if (!p) throw new Error(`kit has no part ${id}`);
  return p;
}

const rigs = new WeakMap<Kit, Map<string, ReturnType<typeof measure>>>();
/** Measurements the timelines need, read from the kit so nothing is typed in twice. The twist asks every frame, so each is measured once. */
function rigOf({ kit, present }: Ctx) {
  const known = rigs.get(kit) ?? new Map<string, ReturnType<typeof measure>>();
  rigs.set(kit, known);
  const sealed = present.includes(RING) ? "sealed" : "bare";
  const rig = known.get(sealed) ?? measure({ kit, present });
  known.set(sealed, rig);
  return rig;
}

function measure({ kit, present }: Ctx) {
  const cap = find(kit, CAP);
  const capBox = extents([cap]);
  const whole = extents(kit.parts.filter((p) => familyOf(kit, CAP).includes(p.id)));
  const neckY = extents([find(kit, BODY)]).max.y;
  const seatDrop = present.includes(RING) ? 0 : capBox.min.y - neckY;
  return {
    capPivot: cap.position,
    /** Height of the gap between a seated cap and the neck, where leaks start. */
    jointY: capBox.min.y - seatDrop,
    capY: cap.position.y - seatDrop,
    /** How high a cap lying on its side holds its middle: the reach of its grip. */
    capReach: Math.max(whole.max.x - cap.position.x, cap.position.x - whole.min.x, whole.max.z - cap.position.z, cap.position.z - whole.min.z),
    neckY,
    seatDrop,
  };
}

type CapPose = { dx?: number; dy?: number; turn?: number; tilt?: number };
/** Spun about its own axis first, then tipped, so a falling cap tumbles rather than wobbles. */
const capMove = (pivot: Part["position"], c: CapPose): PartMove => ({
  offset: vec(c.dx ?? 0, c.dy ?? 0, 0),
  turns: [
    { axis: AXIS.y, pivot, deg: c.turn ?? 0 },
    { axis: AXIS.z, pivot, deg: c.tilt ?? 0 },
  ],
});

/** The cap at a twist: it turns as it rides down the thread, sits, then presses into the seal if there is one. Turning positive moves its front to the right, with the finger on the grip. */
function capAt(t: number, ctx: Ctx): Required<Pick<CapPose, "dy" | "turn" | "tilt">> {
  const seat = Math.min(t / SEATED, 1);
  const press = ctx.present.includes(RING) ? Math.max(0, t - SEATED) / (1 - SEATED) : Math.max(0, t - SEATED) / (STOP_BARE - SEATED);
  const snug = Math.min(1, Math.max(0, t - SEATED) / (CRUSHED - SEATED));
  const crush = Math.max(0, t - CRUSHED) / (1 - CRUSHED);
  const sink = ctx.present.includes(RING) ? SNUG_SINK * snug + (CRUSH_SINK - SNUG_SINK) * crush : 0;
  return { dy: LIFT * (1 - seat) - sink, turn: TURNS_TO_SEAT * 360 * seat + 70 * press, tilt: CROOKED * (1 - smooth(seat)) };
}

const overlay = (rigid: Rigid, live: string, moves: Overlay["moves"] = {}, marks: Mark[] = []): Overlay => ({ rigid, live, moves, marks });
/** The same move for the cap and everything fixed to it. */
const wholeCap = (ctx: Ctx, move: PartMove) => Object.fromEntries(familyOf(ctx.kit, CAP).map((id) => [id, move]));
const capOnly = (ctx: Ctx, c: CapPose) => wholeCap(ctx, capMove(rigOf(ctx).capPivot, c));

const { g: G, marks: dropMarks } = dropsAt(1);

const FLIP_UP = 1000;
const FLIP_BACK = 900;
const FLIP_LIFT = 90;
const DROP_GAP = 160;
const LEAK_DROPS = 7;

const flip: Test = {
  id: "flip",
  label: "Flip",
  run: (values, ctx) => {
    const sealed = ctx.present.includes(RING);
    const leaks = !sealed || zoneOf(values, ctx) === "loose";
    const verdict = !sealed
      ? { pass: false, line: "Drips at the joint. Water got past the cap." }
      : leaks
        ? { pass: false, line: "Drips. The cap isn't pressing the seal." }
        : { pass: true, line: "Dry. Not a drop." };

    const rig = rigOf(ctx);
    const cap = capAt(twistOf(values), ctx);
    const drops = leaks ? LEAK_DROPS : 0;
    const hold = Math.max(1000, 500 + drops * DROP_GAP + 700);
    const held: Rigid = { dx: 0, dy: FLIP_LIFT, angle: 180 };
    const falling: Drop[] = Array.from({ length: drops }, (_, i) => {
      const a = (-60 + (((i * 3) % 5) - 2) * 28) * DEG_TO_RAD;
      return {
        spawn: FLIP_UP + 150 + i * DROP_GAP,
        origin: rigidPoint(ctx.centre, held, vec(NECK_RADIUS * Math.cos(a), rig.jointY + cap.dy, -NECK_RADIUS * Math.sin(a))),
        vx: 0,
        vy: 0,
        vz: 0,
      };
    });
    return {
      verdict,
      durationMs: FLIP_UP + hold + FLIP_BACK,
      at: (ms) => {
        const back = smooth(clamp01((ms - FLIP_UP - hold) / FLIP_BACK));
        const rigid: Rigid =
          ms < FLIP_UP
            ? { dx: 0, dy: FLIP_LIFT * smooth(ms / FLIP_UP), angle: 180 * smooth(ms / FLIP_UP) }
            : ms < FLIP_UP + hold
              ? held
              : { dx: 0, dy: FLIP_LIFT * (1 - back), angle: 180 + 180 * back };
        const marks = dropMarks(falling, ms);
        const live = ms < FLIP_UP ? "Flipping…" : leaks ? (marks.length > 0 ? "Dripping…" : "Upside down") : "Dry";
        return overlay(rigid, live, capOnly(ctx, cap), marks);
      },
    };
  },
};

const SHAKES = 4;
const SHAKE_EACH = 480;
const SHAKE_SWING = SHAKES * SHAKE_EACH;
/** A loose cap pops off at the top of the second swing. */
const OFF_AT = 1.25 * SHAKE_EACH;
const SETTLE = 400;
const SHAKE_HOLD = 800;
const SHAKE_RESET = 650;
const SPILL_DROPS = 8;
const SPILL_GAP = 70;

const shake: Test = {
  id: "shake",
  label: "Shake",
  run: (values, ctx) => {
    const holds = zoneOf(values, ctx) !== "loose";
    const verdict = holds ? { pass: true, line: "The cap stayed on." } : { pass: false, line: "The cap rattled off. Drink everywhere." };
    const rig = rigOf(ctx);
    const cap = capAt(twistOf(values), ctx);
    const neck = vec(0, rig.neckY, 0);
    // A loose cap comes off, so the shaking dies away while the drink pours out; a held one rides it out.
    const swing = (ms: number) => (holds ? 1 : 1 - smooth(clamp01((ms - OFF_AT) / SETTLE)));
    const rigidAt = (ms: number): Rigid => {
      const s = Math.min(ms, SHAKE_SWING) / SHAKE_EACH;
      const k = swing(ms);
      return { dx: 14 * k * Math.sin(2 * Math.PI * s), dy: 0, angle: 5 * k * Math.sin(2 * Math.PI * s) };
    };
    if (holds)
      return {
        verdict,
        durationMs: SHAKE_SWING + 400,
        at: (ms) => overlay(rigidAt(ms), ms < SHAKE_SWING ? "Shaking…" : "Still on", capOnly(ctx, cap)),
      };

    const landDy = rig.capReach - rig.capY;
    const pop = { vx: 170, vy: 260 };
    const startDy = cap.dy + 4;
    const flight = (pop.vy + Math.sqrt(pop.vy * pop.vy + 2 * G * (startDy - landDy))) / G;
    const spill: Drop[] = Array.from({ length: SPILL_DROPS }, (_, i) => {
      const spawn = OFF_AT + 60 + i * SPILL_GAP;
      return {
        spawn,
        origin: rigidPoint(ctx.centre, rigidAt(spawn), neck),
        vx: 120 + 25 * ((i * 7) % 4),
        vy: 150 + 30 * ((i * 5) % 3),
        vz: -20 + 14 * ((i * 3) % 4),
      };
    });
    const capAtMs = (ms: number): CapPose => {
      if (ms < OFF_AT) {
        // Rattling: it hops on the thread it never gripped.
        const hop = 4 * Math.abs(Math.sin((2 * Math.PI * ms) / SHAKE_EACH));
        return {
          dy: cap.dy + hop,
          turn: cap.turn + 10 * Math.sin((4 * Math.PI * ms) / SHAKE_EACH),
          tilt: cap.tilt + 6 * Math.sin((2 * Math.PI * ms) / SHAKE_EACH),
        };
      }
      const tau = Math.min((ms - OFF_AT) / 1000, flight);
      return { dx: pop.vx * tau, dy: startDy + pop.vy * tau - 0.5 * G * tau * tau, turn: cap.turn + 400 * tau, tilt: cap.tilt - 90 * (tau / flight) };
    };
    const end = capAtMs(OFF_AT + flight * 1000);
    const offEnd = Math.max(SHAKE_SWING, OFF_AT + flight * 1000, spill[spill.length - 1]!.spawn + 900);
    return {
      verdict,
      durationMs: offEnd + SHAKE_HOLD + SHAKE_RESET,
      at: (ms) => {
        if (ms < offEnd + SHAKE_HOLD) {
          const live = ms < OFF_AT ? "Shaking…" : ms < offEnd ? "Cap off! Spilling…" : "Cap off";
          return overlay(rigidAt(ms), live, capOnly(ctx, capAtMs(ms)), dropMarks(spill, ms));
        }
        const p = smooth(clamp01((ms - offEnd - SHAKE_HOLD) / SHAKE_RESET));
        const mix = (a: number | undefined, b: number) => (a ?? 0) * (1 - p) + b * p;
        return overlay(
          rigidAt(ms),
          "Cap back on",
          capOnly(ctx, {
            dx: mix(end.dx, 0),
            dy: mix(end.dy, cap.dy) + 45 * Math.sin(Math.PI * p),
            turn: mix(end.turn, cap.turn),
            tilt: mix(end.tilt, cap.tilt),
          }),
          dropMarks(spill, ms),
        );
      },
    };
  },
};

const OPEN_TWIST = 1300;
const OPEN_LIFTOFF = 450;
const OPEN_HOLD = 550;
const OPEN_BACK = 800;
const REFUSE_MS = 1700;

const open: Test = {
  id: "open",
  label: "Open",
  run: (values, ctx) => {
    const cap = capAt(twistOf(values), ctx);
    if (zoneOf(values, ctx) === "tight") {
      return {
        verdict: { pass: false, line: "Stuck. It's too tight to open by hand.", nudge: "The cap is crushing the seal." },
        durationMs: REFUSE_MS,
        at: (ms) => {
          const t = clamp01(ms / REFUSE_MS);
          const shudder = Math.sin(2 * Math.PI * 3.2 * t) * (1 - t);
          return overlay(
            { dx: 1.2 * shudder, dy: 0, angle: 0 },
            "Straining…",
            capOnly(ctx, { dy: cap.dy, turn: cap.turn - 6 * Math.abs(shudder), tilt: cap.tilt }),
          );
        },
      };
    }
    const top = LIFT + 50;
    const free = -120;
    return {
      verdict: { pass: true, line: "It opens by hand." },
      durationMs: OPEN_TWIST + OPEN_LIFTOFF + OPEN_HOLD + OPEN_BACK,
      at: (ms) => {
        if (ms < OPEN_TWIST) {
          const p = smooth(ms / OPEN_TWIST);
          return overlay(
            { dx: 0, dy: 0, angle: 0 },
            "Opening…",
            capOnly(ctx, { dy: cap.dy + (LIFT - cap.dy) * p, turn: cap.turn + (free - cap.turn) * p, tilt: cap.tilt * (1 - p) }),
          );
        }
        if (ms < OPEN_TWIST + OPEN_LIFTOFF + OPEN_HOLD) {
          const q = easeOut(clamp01((ms - OPEN_TWIST) / OPEN_LIFTOFF));
          return overlay({ dx: 0, dy: 0, angle: 0 }, "Open", capOnly(ctx, { dy: LIFT + (top - LIFT) * q, turn: free }));
        }
        const p = smooth(clamp01((ms - OPEN_TWIST - OPEN_LIFTOFF - OPEN_HOLD) / OPEN_BACK));
        return overlay(
          { dx: 0, dy: 0, angle: 0 },
          "Closing again",
          capOnly(ctx, { dy: top + (cap.dy - top) * p, turn: free + (cap.turn - free) * p, tilt: cap.tilt * p }),
        );
      },
    };
  },
};

/** The cap, twisted by dragging the grip. Both modules and the final twist the same cap, so they share one control. */
const twist: Control = {
  key: TWIST,
  verb: "Twist",
  start: 0,
  zones: zonesOf,
  pose: (t, ctx): Scene => (ctx.present.includes(CAP) ? { moves: capOnly(ctx, capAt(t, ctx)), marks: [] } : EMPTY_SCENE),
};

export default defineStory({
  id: "bottle",
  objectName: "Water bottle",
  match: /\b(bottle|flask|thermos)\b/i,
  build: "drag",
  kit: BOTTLE_KIT,
  explode,
  // Without the seal ring under it the cap sits lower, and a turn mark rides the cap so its spin shows.
  rest: (ctx): Scene => {
    if (!ctx.present.includes(CAP)) return EMPTY_SCENE;
    const rig = rigOf(ctx);
    const c = rig.capPivot;
    const mark: Mark = {
      id: "turn-mark",
      ride: CAP,
      shape: { kind: "box", width: 2, height: 12, depth: 2.6, cornerRadius: 0.6 },
      at: vec(c.x + MARK_RADIUS * Math.cos(MARK_ANGLE * DEG_TO_RAD), MARK_Y, c.z - MARK_RADIUS * Math.sin(MARK_ANGLE * DEG_TO_RAD)),
      rotation: vec(0, MARK_ANGLE, 0),
    };
    return { moves: wholeCap(ctx, { offset: vec(0, -rig.seatDrop, 0) }), marks: [mark] };
  },
  modules: [
    {
      id: "closed",
      title: "Keep it closed",
      primitive: "thread",
      produces: [CAP],
      without: { say: "Shake it. Watch the cap.", line: "A cap that just sits there falls off.", test: shake, adds: [CAP], values: { [TWIST]: 0 } },
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
      assemble: {
        piece: "Cap",
        title: "The cap's thread grips the thread on the neck.",
        built: "The thread now runs inside the cap and round the neck.",
      },
      target: { label: "Neck", at: vec(0, 190, 0), ring: { radius: 33, axis: "y" } },
      enter: vec(0, 50, 0),
      play: { say: "Twist the cap on. Then shake.", control: twist, tests: [shake] },
      hints: [
        "Watch the cap while it shakes. Does it stay down?",
        "A loose cap only rests on the thread. Twist it further.",
        "Drag the grip until it says Snug, then shake again.",
      ],
      why: [
        "The cap closes the bottle, but on its own it just sits there.",
        "The thread pulls the cap down and holds it tight.",
        "Without the thread, the first bump knocks the cap off and your drink spills.",
      ],
      job: "The thread holds the cap on.",
      cheer: "Locked on!",
    },
    {
      id: "dry",
      title: "Keep it dry",
      primitive: "seal",
      produces: [RING, "ring-tab"],
      without: { say: "Flip it. Any drips?", line: "Metal on metal leaves tiny gaps. Water finds them.", test: flip, adds: [], values: { [TWIST]: STOP_BARE } },
      learn: {
        say: "Squeeze it. The rubber fills the gaps.",
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
      assemble: {
        piece: "Seal",
        title: "The seal sits in the neck, under the cap.",
        built: "The rubber ring now sits where the cap meets the neck.",
      },
      target: { label: "Neck", at: vec(0, 180, 0), ring: { radius: 33, axis: "y" } },
      enter: vec(60, 0, 0),
      play: { say: "Twist it snug. Then flip it.", control: twist, tests: [flip, open] },
      hints: [
        "Watch where the drops come from: the gap under the cap.",
        "The cap has to press the seal to close the gaps. Twist it further.",
        "Too tight and you can't open it again. Stop at Snug.",
      ],
      why: [
        "A cap and a neck never fit perfectly. There are tiny gaps.",
        "The seal is soft rubber that the cap squeezes into those gaps.",
        "Without the seal, a closed bottle still drips when it tips over in your bag.",
      ],
      job: "The seal keeps it dry.",
      cheer: "Sealed tight!",
    },
  ],
  final: {
    title: "Put it together",
    say: "Shake it, flip it, open it.",
    success: "You built a water bottle.",
    cheer: "Cheers! Bottle built.",
    control: twist,
    tests: [shake, flip, open],
    why: ["Each part has one job, and the bottle needs all three.", "Take one away and it stops working: the cap falls off, or it leaks."],
    payoff: [
      { part: "Cap", job: "closes the bottle." },
      { part: "Thread", job: "holds the cap on." },
      { part: "Seal", job: "keeps it dry." },
    ],
  },
});
