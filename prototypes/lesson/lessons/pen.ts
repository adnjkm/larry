// The click pen: ink only on paper (the ball seated in its socket) and click out, stay out (a catch).
// Rules and choreography for Write, Tip down, Click and Write hard live here, as pure functions of the tuned values.
import type { Kit, Part, Shape } from "../../../shared/kit.ts";
import { clamp01, lerp, smooth } from "../../../shared/primitives/motion/ease.ts";
import { type Ctx, defineLesson, EMPTY_SCENE, type Mark, type Overlay, type Rigid, type Scene, STILL, type Test, type TestCtx, type Values, vec, type Vec, type Window } from "../model.ts";
import { extents, rigidPoint } from "../pose.ts";

const REFILL = "refill";
const PLUNGER = "plunger";

/** How snugly the ball sits in its socket. Below this ink slips past; above the top the ball drags. Game numbers. */
const SEAT_WINDOW: Window = [0.15, 0.3];
/** Release force of the catch in newtons: above the writing push, up to what a finger gives. Game numbers. */
const CATCH_WINDOW: Window = [4, 10];
const WRITE_PUSH = 3;
const FINGER_LIMIT = 10;
/** Millimetres the ink tube slides between in and out. */
const TRAVEL = 12;
/** Millimetres per second squared. Looks right on a pen that is 142 mm long; not real gravity. */
const G = 600;

const squeezeOf = (v: Values) => v.squeeze ?? 0.2;
const forceOf = (v: Values) => v.force ?? 8;
const pct = (n: number) => Math.round(n * 100);

function find(kit: Kit, id: string): Part {
  const p = kit.parts.find((q) => q.id === id);
  if (!p) throw new Error(`kit has no part ${id}`);
  return p;
}

/** The ink point when the tube is out, in the kit's frame. */
function tipOf(kit: Kit): Vec {
  const refill = find(kit, REFILL);
  return vec(extents([refill]).min.x - TRAVEL, refill.position.y, refill.position.z);
}

/** Tube and button slide together along the pen: `e` is 0 retracted, 1 out. Without the button the tube already rests out. */
const extension = (ctx: Ctx, e: number, dip = 0): Overlay["moves"] =>
  ctx.present.includes(PLUNGER)
    ? { [REFILL]: { offset: vec(-TRAVEL * e, 0, 0) }, [PLUNGER]: { offset: vec(-TRAVEL * e - dip, 0, 0) } }
    : {};

/** The tube clicks out over the first half second of a test that starts with the pen clicked in. */
const clickOut = (ms: number) => smooth(clamp01(ms / 500));

const overlay = (rigid: Rigid, live: string, moves: Overlay["moves"] = {}, marks: Mark[] = []): Overlay => ({ rigid, live, moves, marks });

const blend = (a: Rigid, b: Rigid, s: number): Rigid => ({ dx: lerp(a.dx, b.dx, s), dy: lerp(a.dy, b.dy, s), angle: lerp(a.angle, b.angle, s) });
const tipAt = (centre: Vec, tip: Vec, angle: number, x: number, h: number): Rigid => {
  const base = rigidPoint(centre, { dx: 0, dy: 0, angle }, tip);
  return { dx: x - base.x, dy: h - base.y, angle };
};
/** Keeps the ink point from going through the page while the pen is tipped. */
const onPage = (centre: Vec, tip: Vec, r: Rigid): Rigid => {
  const y = rigidPoint(centre, r, tip).y;
  return y < 0 ? { ...r, dy: r.dy - y } : r;
};

const WRITE_ANGLE = 52;
const STROKE_LEN = 48;
const DASH_PITCH = 6.5;
const DASHES = Math.floor(STROKE_LEN / DASH_PITCH);
const APPROACH = 800;
const STROKE = 2600;
const LIFTOFF = 700;
const WRITE_MS = APPROACH + STROKE + LIFTOFF;
/** The ball is 1.3 mm out from the tip's axis; it rides this high on the page. */
const BALL_H = 1.3;

/** The pen comes down, drags its point along the page, and lifts. */
function strokeOf(ctx: TestCtx) {
  const tip = tipOf(ctx.kit);
  const c = ctx.centre;
  const x0 = c.x - STROKE_LEN / 2;
  const start = tipAt(c, tip, WRITE_ANGLE, x0, BALL_H);
  const end = tipAt(c, tip, WRITE_ANGLE, x0 + STROKE_LEN, BALL_H);
  const pose = (ms: number): Rigid => {
    if (ms < APPROACH) return onPage(c, tip, blend(STILL, start, smooth(ms / APPROACH)));
    if (ms < APPROACH + STROKE) {
      const u = (ms - APPROACH) / STROKE;
      return tipAt(c, tip, WRITE_ANGLE + 1.8 * Math.sin(4 * Math.PI * u), x0 + STROKE_LEN * u, BALL_H);
    }
    return onPage(c, tip, blend(end, STILL, smooth((ms - APPROACH - STROKE) / LIFTOFF)));
  };
  const written = (ms: number) => clamp01((ms - APPROACH) / STROKE);
  return { x0, pose, written };
}

const DASH_H = 3;
const DASH: Shape = { kind: "box", width: 5, height: DASH_H, depth: 3.6, cornerRadius: 0.8 };
const blotShape = (gap: number): Shape => ({ kind: "box", width: 6.5, height: 3, depth: 5 + gap * 0.3, cornerRadius: 1 });

/** Ink dashes laid behind the point. A tight ball skips some; a loose one blots the line. `until` stops the line where the tip is pushed in. */
function inkLine(x0: number, written: number, until: number, gap: number, drag: number): Mark[] {
  const skipShare = Math.min(0.8, 0.2 + drag / 10);
  const marks: Mark[] = [];
  for (let i = 0; i < DASHES; i++) {
    const doneAt = ((i + 1) * DASH_PITCH) / STROKE_LEN;
    if (doneAt > written || doneAt > until) break;
    const at = vec(x0 + i * DASH_PITCH + DASH_PITCH / 2, DASH_H / 2, 0);
    if (drag > 0 && (i * 0.618034) % 1 < skipShare) continue;
    marks.push({ id: `ink-${i}`, shape: DASH, at, ride: null });
    if (gap > 0 && i % 2 === 0) marks.push({ id: `blot-${i}`, shape: blotShape(gap), at: vec(at.x, 1.5, 0), ride: null });
  }
  return marks;
}

const writeLive = (ms: number) => (ms < APPROACH ? "Pen to paper" : ms < APPROACH + STROKE ? "Writing" : "Pen lifted");

const write: Test = {
  id: "write",
  label: "Write",
  run: (values, ctx) => {
    const squeeze = pct(squeezeOf(values));
    const gap = pct(SEAT_WINDOW[0]) - squeeze;
    const drag = squeeze - pct(SEAT_WINDOW[1]);
    const verdict =
      gap > 0 ? { pass: false, line: "The line is blotchy. Ink is slipping past the ball and pooling on the paper." }
      : drag > 0 ? { pass: false, line: "The line skips. The ball is too tight to roll, so it drags without laying ink." }
      : { pass: true, line: "A clean, unbroken line with no blots." };
    const { x0, pose, written } = strokeOf(ctx);
    return {
      verdict,
      durationMs: WRITE_MS,
      at: (ms) => overlay(pose(ms), writeLive(ms), extension(ctx, clickOut(ms)), inkLine(x0, written(ms), 1, gap, drag)),
    };
  },
};

const TURN = 1000;
const TURN_BACK = 900;
/** Millimetres the point hangs above the paper while the pen stands tip down. */
const HOLD_H = 24;
const DROP_R = 3;
const DROP_GAP = 140;
const MAX_DROPS = 8;
const dropShape: Shape = {
  kind: "lathe",
  profile: [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const a = (i / 6) * Math.PI - Math.PI / 2;
    return { r: i === 0 || i === 6 ? 0 : DROP_R * Math.cos(a), y: DROP_R * Math.sin(a) };
  }),
};
const splashShape: Shape = { kind: "lathe", profile: [{ r: 0, y: 0 }, { r: 6, y: 0 }, { r: 6, y: 1.4 }, { r: 0, y: 1.2 }] };

const tipDown: Test = {
  id: "tipdown",
  label: "Tip down",
  run: (values, ctx) => {
    const gap = pct(SEAT_WINDOW[0]) - pct(squeezeOf(values));
    const drops = gap > 0 ? Math.max(1, Math.ceil((MAX_DROPS * gap) / pct(SEAT_WINDOW[0]))) : 0;
    const verdict = drops === 0
      ? { pass: true, line: "Dry. Nothing left the point overnight." }
      : { pass: false, line: `${drops} drops of ink fell from the point.` };
    const c = ctx.centre;
    const tip = tipOf(ctx.kit);
    const held = tipAt(c, tip, 90, c.x, HOLD_H);
    const hold = Math.max(1000, 400 + drops * DROP_GAP + 600);
    const origin = rigidPoint(c, held, tip);
    const spawns = Array.from({ length: drops }, (_, i) => TURN + 200 + i * DROP_GAP);
    const jitter = (i: number) => vec((((i * 3) % 5) - 2) * 0.7, 0, (((i * 2) % 5) - 2) * 0.7);
    return {
      verdict,
      durationMs: TURN + hold + TURN_BACK,
      at: (ms) => {
        const back = smooth(clamp01((ms - TURN - hold) / TURN_BACK));
        const rigid =
          ms < TURN ? onPage(c, tip, blend(STILL, held, smooth(ms / TURN)))
          : ms < TURN + hold ? held
          : onPage(c, tip, blend(held, STILL, back));
        const falling = spawns.flatMap((spawn, i) => {
          const tau = (ms - spawn) / 1000;
          return tau >= 0 ? [{ i, y: origin.y - 0.5 * G * tau * tau }] : [];
        });
        const marks = falling.map(({ i, y }): Mark => {
          const j = jitter(i);
          return y > DROP_R
            ? { id: `drop-${i}`, shape: dropShape, at: vec(origin.x + j.x, y, j.z), ride: null }
            : { id: `splash-${i}`, shape: splashShape, at: vec(origin.x + j.x * 3, 0.7, j.z * 3), ride: null };
        });
        return overlay(rigid, falling.length > 0 ? `Drops: ${falling.length}` : "Standing tip down", extension(ctx, clickOut(ms)), marks);
      },
    };
  },
};

const CLICKS = 4;
const LEAD = 300;
const PRESS = 300;
const SETTLE = 450;
const PRESS_DIP = 3;
const REFUSE_MS = 1700;

const click: Test = {
  id: "click",
  label: "Click ×4",
  run: (values, ctx) => {
    const force = forceOf(values);
    if (force > FINGER_LIMIT) {
      return {
        verdict: { pass: false, line: `The button would not go. It needs ${force} N and a finger comfortably gives about ${FINGER_LIMIT}.`, nudge: "The catch is gripping far too hard for a thumb." },
        durationMs: REFUSE_MS,
        at: (ms) => {
          const t = clamp01(ms / REFUSE_MS);
          const shudder = Math.abs(Math.sin(2 * Math.PI * 3 * t)) * (1 - t);
          return overlay({ dx: 0.6 * shudder, dy: 0, angle: 0 }, `Needs ${force} N`, extension(ctx, 0, 1.5 * shudder));
        },
      };
    }
    return {
      verdict: { pass: true, line: `Out, in, out, in. Each click took about ${force} N, under the ${FINGER_LIMIT} N a finger gives.` },
      durationMs: LEAD + CLICKS * (PRESS + SETTLE),
      at: (ms) => {
        const t = ms - LEAD;
        const i = t < 0 ? 0 : Math.min(CLICKS - 1, Math.floor(t / (PRESS + SETTLE)));
        const q = t < 0 ? 0 : clamp01((t - i * (PRESS + SETTLE)) / PRESS);
        const e = lerp(i % 2, (i + 1) % 2, smooth(q));
        const done = q >= 0.5 ? i + 1 : i;
        const live = t < 0 ? "Tip in" : `Click ${done} · tip ${done % 2 === 1 ? "out" : "in"}`;
        return overlay(STILL, live, extension(ctx, e, PRESS_DIP * Math.sin(Math.PI * q)));
      },
    };
  },
};

const SHOVE_MS = 260;

const writeHard: Test = {
  id: "writehard",
  label: "Write hard",
  run: (values, ctx) => {
    const force = forceOf(values);
    const holds = force > WRITE_PUSH;
    const cut = holds ? 1 : Math.min(0.6, 0.15 + (0.15 * force) / WRITE_PUSH);
    const verdict = holds
      ? { pass: true, line: `The tip stayed out under ${WRITE_PUSH} N of writing push.` }
      : { pass: false, line: `The tip was pushed back in after ${Math.round(cut * STROKE_LEN)} mm of line. Writing pushes with ${WRITE_PUSH} N and the catch lets go at ${force} N.` };
    const { x0, pose, written } = strokeOf(ctx);
    const shoveAt = holds ? Infinity : APPROACH + cut * STROKE;
    return {
      verdict,
      durationMs: WRITE_MS,
      at: (ms) => {
        const e = ms < shoveAt ? clickOut(ms) : 1 - smooth(clamp01((ms - shoveAt) / SHOVE_MS));
        const live = ms >= shoveAt && !holds ? "Tip pushed in" : writeLive(ms);
        return overlay(pose(ms), live, extension(ctx, e), inkLine(x0, written(ms), cut, 0, 0));
      },
    };
  },
};

export default defineLesson({
  id: "pen",
  objectName: "Click pen",
  match: /\b(pen|ballpoint|rollerball)\b/i,
  // Without the button nothing holds the ink tube in, so it rests out and writes. With it, the pen rests clicked in.
  rest: (ctx): Scene => (ctx.present.includes(PLUNGER) ? EMPTY_SCENE : { moves: { [REFILL]: { offset: vec(-TRAVEL, 0, 0) } }, marks: [] }),
  apart: {
    "nose-cone": vec(-18, 0, 0),
    plunger: vec(18, 0, 0),
    clip: vec(0, 24, 0),
    refill: vec(-4, 0, 30),
  },
  modules: [
    {
      id: "ink",
      title: "Ink only on paper",
      need: "It must give ink only on paper, and never leak.",
      primitive: "wheel",
      teach: ["wheel", "seal"],
      produces: [REFILL],
      assemble: {
        piece: "Wheel and seal",
        title: "Seat the rolling ball and its seal in the ink tube.",
        built: "The wheel is now the rolling ball at the tip of the ink tube, and the seal is the snug socket it turns in.",
      },
      target: { label: "Nose tip", at: vec(-70, 5, 0), ring: { radius: 7, axis: "x" } },
      enter: vec(-70, 0, 0),
      fault: { primitive: "seal", slider: "squeeze", start: 0.04 },
      fix: { window: SEAT_WINDOW },
      tests: [write, tipDown],
      hints: {
        observe: "Run Write and Tip down and watch the point. The line blots, and ink drips while nobody is writing. Ink is getting past the ball.",
        principle: "The ball is a wheel: it rolls and carries ink onto the paper. Its socket is a seal: squeezed snugly around the ball, it closes the gap so ink moves only when the ball turns.",
        direction: "Seat the ball more tightly. Squeeze is how tightly the socket holds it. Check Write and Tip down together.",
        low: "Ink slips past the ball, so the line blots and the point drips.",
        high: "The ball drags instead of rolling, so the line skips.",
      },
      suspect: REFILL,
      misses: {
        barrel: "The barrel is only the tube you hold. Ink gets out at the point, not through the barrel.",
        "nose-cone": "The metal tip guides the point but holds no ink. Look at the part that carries the ball.",
        clip: "The clip holds the pen in a pocket. It never touches the ink.",
      },
      missDefault: "That part is not where the ink gets out. Watch the point during Write and Tip down.",
      uses: {
        wheel: "The ball at the tip. It rolls on the paper and carries ink out.",
        seal: "The socket round the ball. It hugs the ball, so ink leaves only when it rolls.",
      },
      task: "Seat the ball to roll without leaking.",
      why: "The ball in a ballpoint is a tiny wheel: it rolls against the paper and carries a thin film of ink out of the tube. Its socket works as a seal. Seated snugly, the socket blocks the gap, so ink moves only when the ball turns. Too loose and ink slips past. Too tight and the ball cannot roll, and the line skips.",
      numbers: (v) => {
        const seat = pct(squeezeOf(v));
        return [{ label: "Ball seat", value: `${seat}% (ink slips past below ${pct(SEAT_WINDOW[0])}%, the ball drags above ${pct(SEAT_WINDOW[1])}%)` }];
      },
      gameNote: "Game numbers: here Squeeze stands for how tightly the ball sits in its socket. Below 15 percent ink slips past and leaks. Above 30 percent the ball drags and the line skips. A real ball sits in its socket with a clearance of a few thousandths of a millimetre and nothing is squeezed like rubber, so read the percentages as a game scale.",
    },
    {
      id: "click",
      title: "Click out, stay out",
      need: "It must click out, stay out while you write, and click back in.",
      primitive: "catch",
      teach: ["spring", "catch"],
      produces: [PLUNGER],
      assemble: {
        piece: "Catch",
        title: "Fit the catch at the button end, so the ink tube stays out.",
        built: "The kit has no separate catch, so the click button stands for it. It holds the ink tube out against the push of writing.",
      },
      target: { label: "Button end", at: vec(60, 5, 0), ring: { radius: 7, axis: "x" } },
      enter: vec(70, 0, 0),
      fault: { primitive: "catch", slider: "force", start: 2 },
      fix: { window: CATCH_WINDOW },
      tests: [click, writeHard],
      hints: {
        observe: "Run Write hard and watch the point. It clicks out, then the push of writing shoves it back in.",
        principle: "A catch is a wedge held out by a spring. It holds until something pushes harder than its release force. Writing pushes back on the tip with about 3 N, so a catch that lets go below that cannot hold the tip out.",
        direction: "Raise the release force above the writing push, but keep it under what a thumb presses. Check Click and Write hard together.",
        low: "Writing pushes the tip back in.",
        high: "The button needs more than the 10 N a thumb comfortably gives, so Click fails.",
      },
      suspect: PLUNGER,
      misses: {
        barrel: "The barrel holds still while the tip moves. Look at the part you press.",
        "nose-cone": "The metal tip stays put. It only lets the ink point through.",
        clip: "The clip is for a pocket. It does nothing while you write.",
        refill: "The ink tube slides because something pushes it. What keeps it from sliding back is a different part.",
      },
      missDefault: "That part is not what holds the tip out. Watch what moves when the tip is pushed in.",
      uses: {
        spring: "The spring in the barrel. It pushes the ink tube back in.",
        catch: "The latch at the click button. It holds the ink tube out while you write.",
      },
      task: "Set a catch that holds but still clicks.",
      why: "A catch is a wedge pushed out by a spring. The sloped face lets a push in and the steep face holds against a pull, so letting go takes a firm push. In the pen it holds the ink tube out against the return spring. Strong enough to hold under writing pressure, weak enough for a thumb. The kit has no separate part for it, so the click button stands for the catch. A real click pen alternates hold and release with a rotating cam, which is the next idea. The catch here is only the holding half.",
      numbers: (v) => {
        const force = forceOf(v);
        return [
          { label: "Writing push", value: `${WRITE_PUSH} N against a ${force} N catch: ${force > WRITE_PUSH ? "it holds" : "it lets go"}` },
          { label: "Click", value: `${force} N against a thumb's ${FINGER_LIMIT} N: ${force > FINGER_LIMIT ? "too hard" : "it goes"}` },
        ];
      },
      gameNote: "Game numbers: writing pushes back on the tip with about 3 N, and a thumb comfortably presses up to about 10 N. Real writing force is usually well under 3 N, and a real pen holds its tip with a cam, so the numbers are chosen to make the failure easy to see.",
    },
  ],
  final: {
    need: "It must write cleanly, never leak, and click in and out.",
    success: "You built a click pen.",
    detail: "It writes a clean line, stays dry tip down, and clicks out and back in.",
    tests: [write, tipDown, click],
  },
});
