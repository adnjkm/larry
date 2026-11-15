// The click pen, told with no numbers: without a ball the ink blots, without a spring the tip hangs out, and
// without a cam it pops straight back in. The pen has one state, a Pose (how far the tip is out, how far the
// button is down, how far a loose ball sags), and one function turns a Pose into a Scene. Every rest pose,
// control pose and test frame goes through it; the tests then play the outcome decided from the zone of each
// control and the parts present.
import type { Shape } from "../../../shared/kit.ts";
import { clamp01, lerp, smooth } from "../../../shared/primitives/motion/ease.ts";
import {
  DEFAULT_VIEW,
  type Control,
  type Ctx,
  defineStory,
  type ExplodePlan,
  familyOf,
  type Mark,
  type Overlay,
  type PartMove,
  type Rigid,
  type Scene,
  STILL,
  type Test,
  type Values,
  vec,
  type Zone,
  zoneAt,
} from "../model.ts";
import { type Drop, dropsAt } from "../stories/drops.ts";
import { PEN, PEN_KIT } from "./pen-kit.ts";

const BARREL = "barrel";
const NOSE = "nose";
const REFILL = "refill";
const BALL = "ball";
const SPRING = "spring";
const CAM = "cam";
const PLUNGER = "plunger";
const LUGS = [1, 2, 3, 4].map((k) => `cam-lug-${k}`);

const T = PEN.TRAVEL;
/** How far a loose ball sits lower in its socket, in mm. */
const SAG = 1.2;

type Pose = { out: number; press: number; sag: number };

const SQUEEZE_ZONES: readonly Zone[] = [
  { id: "loose", word: "Loose", until: 0.35, gain: 1 },
  { id: "snug", word: "Snug", until: 0.75, gain: 0.45 },
  { id: "tight", word: "Too tight", until: 1, gain: 0.22 },
];
const STIFFNESS_ZONES: readonly Zone[] = [
  { id: "soft", word: "Soft", until: 0.35, gain: 1 },
  { id: "firm", word: "Firm", until: 0.75, gain: 0.45 },
  { id: "stiff", word: "Too stiff", until: 1, gain: 0.22 },
];
const PRESS_ZONES: readonly Zone[] = [
  { id: "up", word: "Up", until: 0.45, gain: 1 },
  { id: "half", word: "Half way", until: 0.82, gain: 0.7 },
  { id: "clicked", word: "Clicked", until: 1, gain: 0.5 },
];

const SQUEEZE = "squeeze";
const STIFFNESS = "stiffness";
const PRESS = "press";
const zoneIn = (zones: readonly Zone[], v: Values, key: string) => zoneAt(zones, v[key] ?? 0).id;

const squeezePose = (v: Values): Pose => ({ out: T, press: 0, sag: SAG * (1 - clamp01((v[SQUEEZE] ?? 0) / SQUEEZE_ZONES[0]!.until)) });
/** A spring lets the tip hang out only while it is too soft to push it in; with none, the tip hangs out fully. */
const stiffPose = (v: Values, ctx: Ctx): Pose => ({
  out: ctx.present.includes(SPRING) ? T * (1 - clamp01((v[STIFFNESS] ?? 0) / STIFFNESS_ZONES[0]!.until)) : T,
  press: 0,
  sag: 0,
});
const pressPose = (v: Values): Pose => {
  const p = T * clamp01(v[PRESS] ?? 0);
  return { out: p, press: p, sag: 0 };
};
const restPose = (ctx: Ctx): Pose => ({ out: ctx.present.includes(SPRING) ? 0 : T, press: 0, sag: 0 });
const mixPose = (a: Pose, b: Pose, k: number): Pose => ({ out: lerp(a.out, b.out, k), press: lerp(a.press, b.press, k), sag: lerp(a.sag, b.sag, k) });

/**
 * The pen at a pose. The refill family, the ball and the cam slide down by `out`, the ball sags by `sag`, the
 * plunger goes down by `press`, and then every part rises by however far the ball (or the bare tip with no ball)
 * would sink below the table, so a pen with its tip out stands on its tip.
 */
function sceneOf({ kit, present }: Ctx, pose: Pose): Scene {
  const lowest = (present.includes(BALL) ? PEN.ballBottom - pose.sag : PEN.tipBottom) - pose.out;
  const lift = Math.max(0, -lowest);
  const sliding = new Set([...familyOf(kit, REFILL), ...familyOf(kit, BALL), ...familyOf(kit, CAM)]);
  const sagging = new Set(familyOf(kit, BALL));
  const pushed = new Set(familyOf(kit, PLUNGER));
  const moves: Record<string, PartMove> = {};
  for (const id of present) {
    const dy = lift - (sliding.has(id) ? pose.out : 0) - (sagging.has(id) ? pose.sag : 0) - (pushed.has(id) ? pose.press : 0);
    if (dy !== 0) moves[id] = { offset: vec(0, dy, 0) };
  }
  return { moves, marks: [] };
}

const rest = (ctx: Ctx): Scene => sceneOf(ctx, restPose(ctx));
const dyOf = (scene: Scene, id: string) => scene.moves[id]?.offset?.y ?? 0;

/** A pose on top of the lesson's rest: what a control's pose and a test frame add to it. */
function relative(ctx: Ctx, pose: Pose): Scene {
  const a = sceneOf(ctx, pose);
  const b = rest(ctx);
  const moves: Record<string, PartMove> = {};
  for (const id of new Set([...Object.keys(a.moves), ...Object.keys(b.moves)])) {
    const dy = dyOf(a, id) - dyOf(b, id);
    if (Math.abs(dy) > 1e-9) moves[id] = { offset: vec(0, dy, 0) };
  }
  return { moves, marks: [] };
}

const frame = (ctx: Ctx, pose: Pose, live: string, rigid: Rigid = STILL, marks: readonly Mark[] = []): Overlay => ({
  ...relative(ctx, pose),
  rigid,
  live,
  marks: [...marks],
});
const seg = (ms: number, from: number, to: number) => smooth(clamp01((ms - from) / Math.max(1, to - from)));
const has = (ctx: Ctx, id: string) => ctx.present.includes(id);

/** The cam holds the tip out only after a full click. */
const latchedAt = (v: Values, ctx: Ctx) => has(ctx, CAM) && zoneIn(PRESS_ZONES, v, PRESS) === "clicked";

const shapes = new Map<string, Shape>();
const cached = (key: string, make: () => Shape): Shape => {
  const known = shapes.get(key);
  if (known) return known;
  const made = make();
  shapes.set(key, made);
  return made;
};
const stroke = (len: number, depth: number) => cached(`stroke ${len} ${depth}`, () => ({ kind: "box", width: len, height: 1.6, depth, cornerRadius: 0.5 }));
const disc = (r: number) =>
  cached(`disc ${r}`, () => ({
    kind: "lathe",
    profile: [
      { r: 0, y: 0 },
      { r, y: 0 },
      { r: r - 0.3, y: 0.7 },
      { r: Math.max(0, r - 1.4), y: 1.3 },
      { r: 0, y: 1.4 },
    ],
  }));
const bead = (r: number) =>
  cached(`bead ${r}`, () => ({
    kind: "lathe",
    profile: Array.from({ length: 9 }, (_, i) => {
      const a = -Math.PI / 2 + (i / 8) * Math.PI;
      return { r: Math.max(0, r * Math.cos(a)), y: r * Math.sin(a) };
    }),
  }));

const { g: G, radius: DROP_R, marks: dropMarks } = dropsAt(0.5);

const REACH = 28;
type Outcome = "inside" | "blot" | "good" | "stuck";

const write: Test = {
  id: "write",
  label: "Write",
  run: (values, ctx) => {
    const spring = has(ctx, SPRING);
    const start = spring ? pressPose(values) : squeezePose(values);
    const tipOut = spring ? latchedAt(values, ctx) : true;
    const end: Pose = { out: spring ? (tipOut ? T : 0) : T, press: 0, sag: start.sag };
    const zone = zoneIn(SQUEEZE_ZONES, values, SQUEEZE);
    const outcome: Outcome = !tipOut ? "inside" : !has(ctx, BALL) || zone === "loose" ? "blot" : zone === "snug" ? "good" : "stuck";
    const verdict = {
      inside: { pass: false, line: "The tip is inside. Nothing to write with." },
      blot: { pass: false, line: has(ctx, BALL) ? "Blotchy. The loose ball floods ink." : "No ball. The ink blots and smears." },
      stuck: { pass: false, line: "No ink. The ball is stuck." },
      good: { pass: true, line: "A thin, even line." },
    }[outcome];

    const release = Math.abs(start.out - end.out) + start.press > 0 ? 650 : 0;
    const wet = outcome === "blot" ? 500 : 150;
    const go = release + wet;
    const [forward, hold, back, tail] = [1100, 220, 850, 250];
    return {
      verdict,
      durationMs: go + forward + hold + back + tail,
      at: (ms) => {
        const along = seg(ms, go, go + forward);
        const dx = REACH * along * (1 - seg(ms, go + forward + hold, go + forward + hold + back));
        const laid = Math.round(REACH * along);
        const marks: Mark[] = [];
        if (outcome === "good" && laid > 0) marks.push({ id: "line", shape: stroke(laid, 3.4), at: vec(laid / 2, 0.8, 0), ride: null });
        if (outcome === "blot") {
          const r = Math.round(1 + 5.5 * seg(ms, release, release + wet));
          marks.push({ id: "blot", shape: disc(r), at: vec(0, 0.7, 0), ride: null });
          if (laid > 0) marks.push({ id: "smear", shape: stroke(laid, 7.5), at: vec(laid / 2, 0.8, 0), ride: null });
        }
        const live =
          outcome === "inside"
            ? "Tip is inside"
            : ms < release
              ? "Letting go…"
              : ms < go + forward
                ? outcome === "blot"
                  ? ms < go
                    ? "Ink pooling…"
                    : "Smearing…"
                  : outcome === "stuck"
                    ? "No ink…"
                    : "Writing…"
                : outcome === "blot"
                  ? "Blotted"
                  : outcome === "stuck"
                    ? "Dry"
                    : "Thin, even ink";
        return frame(ctx, mixPose(start, end, seg(ms, 0, release)), live, { dx, dy: 0, angle: 0 }, marks);
      },
    };
  },
};

const WAIT_RISE = 500;
const WAIT_LIFT = 16;
const DRIP_GROW = 700;
const DRIP_AT = [1300, 2200];
const wait: Test = {
  id: "wait",
  label: "Wait",
  run: (values, ctx) => {
    const start = squeezePose(values);
    const leaks = has(ctx, BALL) && zoneIn(SQUEEZE_ZONES, values, SQUEEZE) === "loose";
    const verdict = leaks ? { pass: false, line: "A drop of ink fell. The ball is loose." } : { pass: true, line: "Dry. Not a drop." };
    const drops: Drop[] = leaks ? DRIP_AT.map((spawn) => ({ spawn, origin: vec(0, WAIT_LIFT - DROP_R, 0), vx: 0, vy: 0, vz: 0 })) : [];
    const fall = Math.sqrt((2 * (WAIT_LIFT - 2 * DROP_R)) / G);
    const settle = leaks ? DRIP_AT[DRIP_AT.length - 1]! + 1000 * fall + 600 : WAIT_RISE + 1100;
    const down = 600;
    return {
      verdict,
      durationMs: settle + down,
      at: (ms) => {
        const lifted = seg(ms, 0, WAIT_RISE) * (1 - seg(ms, settle, settle + down));
        const growing = DRIP_AT.findIndex((spawn) => ms > spawn - DRIP_GROW && ms <= spawn);
        const marks: Mark[] = leaks ? dropMarks(drops, ms) : [];
        if (leaks && growing >= 0) {
          const r = Math.round((0.6 + 1.9 * clamp01((ms - (DRIP_AT[growing]! - DRIP_GROW)) / DRIP_GROW)) * 5) / 5;
          marks.push({ id: "bead", shape: bead(r), at: vec(0, WAIT_LIFT * lifted - r, 0), ride: null });
        }
        const live = !leaks ? (ms < settle ? "Holding still" : "Dry") : ms < DRIP_AT[0]! - DRIP_GROW ? "Holding still" : "Dripping…";
        return frame(ctx, start, live, { dx: 0, dy: WAIT_LIFT * lifted, angle: 0 }, marks);
      },
    };
  },
};

const PICK_UP = 36;
const lift: Test = {
  id: "lift",
  label: "Pick up",
  run: (values, ctx) => {
    const start = stiffPose(values, ctx);
    const hidden = start.out === 0;
    const verdict = hidden ? { pass: true, line: "The tip stayed hidden." } : { pass: false, line: "The tip hangs out. Nothing pulls it in." };
    const [rise, hold, back] = [800, 900, 700];
    // A spring too soft to push the tip in lets the weight of the refill pull it all the way out.
    const sagged: Pose = { ...start, out: hidden ? 0 : T };
    return {
      verdict,
      durationMs: rise + hold + back,
      at: (ms) => {
        const up = seg(ms, 0, rise) * (1 - seg(ms, rise + hold, rise + hold + back));
        const pose = mixPose(start, sagged, seg(ms, rise, rise + 450));
        const live = ms < rise ? "Lifting…" : hidden ? "Tip hidden" : "Tip hanging out";
        return frame(ctx, pose, live, { dx: 0, dy: PICK_UP * up, angle: 0 });
      },
    };
  },
};

const press: Test = {
  id: "press",
  label: "Press",
  run: (values, ctx) => {
    const start = stiffPose(values, ctx);
    const zone = zoneIn(STIFFNESS_ZONES, values, STIFFNESS);
    const verdict =
      zone === "stiff"
        ? { pass: false, line: "Too stiff. Your thumb can't click it." }
        : zone === "soft"
          ? { pass: false, line: "The tip stays out. The spring is too weak." }
          : { pass: true, line: "It clicks out and springs back." };
    const [down, hold, up, tail] = [650, 350, 650, 350];
    const pushed: Pose = zone === "stiff" ? { out: start.out, press: 1.2, sag: 0 } : { out: T, press: T, sag: 0 };
    const released: Pose = { out: zone === "soft" ? T : 0, press: 0, sag: 0 };
    return {
      verdict,
      durationMs: down + hold + up + tail,
      at: (ms) => {
        if (ms < down + hold) return frame(ctx, mixPose(start, pushed, seg(ms, 0, down)), zone === "stiff" ? "Won't budge" : "Pressing…");
        const k = seg(ms, down + hold, down + hold + up);
        const live = k < 1 ? "Letting go…" : zone === "soft" ? "Tip stays out" : zone === "stiff" ? "Still stuck" : "Tip back inside";
        return frame(ctx, mixPose(pushed, released, k), live);
      },
    };
  },
};

const letgo: Test = {
  id: "letgo",
  label: "Let go",
  run: (values, ctx) => {
    const start = pressPose(values);
    const latched = latchedAt(values, ctx);
    const verdict = latched
      ? { pass: true, line: "The tip stays out. The cam caught it." }
      : start.press === 0
        ? { pass: false, line: "Nothing is clicked. The tip is inside." }
        : { pass: false, line: "It popped back in. Nothing holds it." };
    const end: Pose = { out: latched ? T : 0, press: 0, sag: 0 };
    const [held, up, tail] = [500, 700, 700];
    return {
      verdict,
      durationMs: held + up + tail,
      at: (ms) => {
        const k = seg(ms, held, held + up);
        const live = start.press === 0 ? "Nothing pressed" : ms < held ? "Pressed" : k < 1 ? "Letting go…" : latched ? "Tip stays out" : "Tip popped in";
        return frame(ctx, mixPose(start, end, k), live);
      },
    };
  },
};

const again: Test = {
  id: "again",
  label: "Click again",
  run: (values, ctx) => {
    const held = latchedAt(values, ctx);
    const verdict = held ? { pass: true, line: "One more click hides the tip." } : { pass: false, line: "It was never clicked out." };
    const start: Pose = { out: held ? T : 0, press: 0, sag: 0 };
    const pushed: Pose = { out: T, press: T, sag: 0 };
    const end: Pose = { out: 0, press: 0, sag: 0 };
    const [down, hold, up, tail] = [650, 300, 650, 350];
    return {
      verdict,
      durationMs: down + hold + up + tail,
      at: (ms) => {
        if (ms < down + hold) return frame(ctx, mixPose(start, pushed, seg(ms, 0, down)), "Pressing…");
        const k = seg(ms, down + hold, down + hold + up);
        return frame(ctx, mixPose(pushed, end, k), k < 1 ? "Letting go…" : held ? "Tip hidden" : "Tip back inside");
      },
    };
  },
};

const squeeze: Control = {
  key: SQUEEZE,
  verb: "Squeeze",
  start: 0,
  zones: () => SQUEEZE_ZONES,
  pose: (v, ctx) => relative(ctx, squeezePose({ [SQUEEZE]: v })),
};
const stiffness: Control = {
  key: STIFFNESS,
  verb: "Spring",
  start: 0,
  zones: () => STIFFNESS_ZONES,
  pose: (v, ctx) => relative(ctx, stiffPose({ [STIFFNESS]: v }, ctx)),
};
const pressing: Control = { key: PRESS, verb: "Press", start: 0, zones: () => PRESS_ZONES, pose: (v, ctx) => relative(ctx, pressPose({ [PRESS]: v })) };

/**
 * Coming apart, telescoping up the axis, outside first: the button, the cam, the barrel, then the refill (with the
 * ball) rising out of the nose and the spring under its collar. The refill clears the nose even with its tip out, and
 * stays inside the raised barrel. The spring leaves after the refill because its collar sits above it.
 */
const GAP = 5.3;
const REFILL_LIFT = PEN.noseTop + GAP - PEN.ballBottom + T;
const SPRING_LIFT = REFILL_LIFT - 1;
const BARREL_LIFT = Math.max(REFILL_LIFT + (PEN.refillTop - PEN.barrelTop) + 1, PEN.springTop + SPRING_LIFT + GAP - PEN.barrelBottom);
const CAM_LIFT = BARREL_LIFT + (PEN.barrelTop - PEN.camBottom) + GAP;
const PLUNGER_LIFT = CAM_LIFT + (PEN.camTop - PEN.stemBottom) + GAP;
const up =
  (by: number) =>
  (s: number): PartMove => ({ offset: vec(0, by * s, 0) });
const explode: ExplodePlan = {
  order: [
    { id: PLUNGER, at: up(PLUNGER_LIFT) },
    { id: CAM, at: up(CAM_LIFT) },
    { id: BARREL, at: up(BARREL_LIFT) },
    { id: REFILL, at: up(REFILL_LIFT), sleeved: true },
    { id: SPRING, at: up(SPRING_LIFT) },
    { id: BALL, at: up(REFILL_LIFT), sleeved: true },
  ],
};

/** The parts present, as Find the spot shows the object for module `index`: without what comes later and the piece in hand, with what this module adds. */
const PRODUCED = [[BALL, NOSE], [SPRING], [CAM]] as const;
function spotCtx(index: number, adds: readonly string[], piece: readonly string[]): Ctx {
  const later = new Set(
    PRODUCED.slice(index)
      .flat()
      .flatMap((id) => familyOf(PEN_KIT, id)),
  );
  const added = new Set(adds.flatMap((id) => familyOf(PEN_KIT, id)));
  const present = PEN_KIT.parts.map((p) => p.id).filter((id) => (!later.has(id) || added.has(id)) && !piece.includes(id));
  return { kit: PEN_KIT, present };
}
const ballCtx = spotCtx(0, [NOSE], [BALL]);
const springCtx = spotCtx(1, [], [SPRING]);
const camCtx = spotCtx(2, [], [CAM, ...LUGS]);
/** Where a point at kit height `y` on part `id` is drawn once the pen stands as Find the spot shows it. */
const drawnY = (ctx: Ctx, id: string, y: number) => y + dyOf(rest(ctx), id);
const clipAngle = (PEN.clipAngle * Math.PI) / 180;
const SPRING_MID = (PEN.springBottom + PEN.springTop) / 2;
const CAM_MID = (PEN.camBottom + PEN.camTop) / 2;

export default defineStory({
  id: "pen",
  view: { ...DEFAULT_VIEW, shadow: false },
  objectName: "Click pen",
  match: /\bpen\b/i,
  build: "drag",
  kit: PEN_KIT,
  explode,
  rest,
  modules: [
    {
      id: "write",
      title: "Make it write",
      need: "Ink must come out thin and even.",
      primitive: "valve",
      place: {
        say: "Where does the ball go? Drag it on.",
        piece: [BALL],
        ride: BARREL,
        spots: [
          {
            id: "tip",
            at: vec(0, drawnY(ballCtx, REFILL, PEN.ballY), 0),
            radius: PEN.ballR,
            right: true,
            line: "Right there. It rolls where pen meets paper.",
          },
          { id: "button", at: vec(0, drawnY(ballCtx, PLUNGER, PEN.top) + 0.8 * PEN.ballR, 0), radius: PEN.ballR, line: "That end is for your thumb." },
          {
            id: "clip",
            at: vec(PEN.clipR * Math.cos(clipAngle), drawnY(ballCtx, BARREL, PEN.clipBottom), PEN.clipR * Math.sin(clipAngle)),
            radius: PEN.ballR,
            line: "The clip only holds your pocket.",
          },
        ],
      },
      produces: [BALL, NOSE],
      without: { say: "Write with it. Watch the ink.", line: "No ball. The ink blots and smears.", test: write, adds: [NOSE], values: { [SQUEEZE]: 0 } },
      learn: {
        say: "Press it. The ball lets ink past.",
        rigs: {
          valve: {
            controls: { pressure: "Press" },
            why: ["A valve is a gate for liquid.", "A ball sits in the opening and plugs it.", "Push on it and the liquid slips past. Let go and it shuts."],
          },
        },
      },
      uses: { valve: "The ball lets ink out only while it rolls on paper." },
      assemble: { piece: "Nose cone", title: "The nose cone guides the tip.", built: "The nose cone now covers the tip." },
      target: { label: "Tip", at: vec(0, 10, 0), ring: { radius: 14, axis: "y" } },
      play: { say: "Squeeze the socket. Then write.", control: squeeze, tests: [write, wait] },
      hints: [
        "Watch the ink where the tip touches down.",
        "A loose ball lets ink flood past. Squeeze the socket.",
        "Too tight and the ball can't roll. Stop at Snug.",
      ],
      why: [
        "Ink is thick and sticky. It needs something to spread it thin.",
        "The ball rolls, picking up ink inside and laying it on the page.",
        "Without the ball, ink either blots out or dries up in the tip.",
      ],
      job: "The ball rolls ink onto the page.",
      cheer: "Smooth ink!",
    },
    {
      id: "hide",
      title: "Hide the tip",
      need: "The tip must tuck away.",
      primitive: "spring",
      place: {
        say: "Where does the spring go? Drag it on.",
        piece: [SPRING],
        ride: REFILL,
        builds: true,
        hide: [BARREL, NOSE, PLUNGER],
        spots: [
          {
            id: "tip-end",
            at: vec(0, drawnY(springCtx, REFILL, SPRING_MID), 0),
            radius: PEN.springR,
            right: true,
            line: "Right there. It pushes the tip back up.",
          },
          { id: "middle", at: vec(0, drawnY(springCtx, REFILL, 62), 0), radius: PEN.springR, line: "Nothing to push against there." },
          { id: "top", at: vec(0, drawnY(springCtx, REFILL, 100), 0), radius: PEN.springR, line: "Up there it would push the tip out." },
        ],
      },
      produces: [SPRING],
      without: { say: "Pick it up. Watch the tip.", line: "Nothing pushes the tip back in.", test: lift, adds: [], values: { [STIFFNESS]: 0 } },
      learn: {
        say: "Press it. The spring pushes back.",
        rigs: {
          spring: {
            controls: { force: "Press" },
            why: ["A spring stores the push you give it.", "Let go and it gives that push back.", "In the pen, that push carries the tip back inside."],
          },
        },
      },
      uses: { spring: "The spring pushes the tip back inside the pen." },
      assemble: { piece: "Spring", title: "The spring sits round the tip end.", built: "The spring now sits between tip and nose." },
      target: { label: "Tip end", at: vec(0, SPRING_MID, 0), ring: { radius: 12, axis: "y" } },
      play: { say: "Stiffen the spring. Then pick it up.", control: stiffness, tests: [lift, press] },
      hints: ["Pick it up and watch the tip.", "A soft spring can't push the tip back. Stiffen it.", "Too stiff and your thumb can't click it. Stop at Firm."],
      why: [
        "A tip left out marks your pocket and dries up.",
        "The spring sits round the tip end and pushes it back inside.",
        "Without the spring, the tip just hangs out.",
      ],
      job: "The spring tucks the tip away.",
      cheer: "Tucked in!",
    },
    {
      id: "stay",
      title: "Keep it out",
      need: "The tip must stay out to write.",
      primitive: "cam",
      place: {
        say: "Where does the cam go? Drag it on.",
        piece: [CAM, ...LUGS],
        ride: REFILL,
        builds: true,
        hide: [BARREL, PLUNGER],
        spots: [
          {
            id: "top",
            at: vec(0, drawnY(camCtx, REFILL, CAM_MID), 0),
            radius: PEN.camR,
            right: true,
            line: "Right there. The button pushes it each click.",
          },
          { id: "middle", at: vec(0, drawnY(camCtx, REFILL, 62), 0), radius: PEN.camR, line: "It can't reach the button there." },
          { id: "tip", at: vec(0, drawnY(camCtx, REFILL, 14), 0), radius: PEN.camR, line: "Ink comes out there. No room." },
        ],
      },
      produces: [CAM],
      without: { say: "Click it. Then let go.", line: "It pops straight back in.", test: letgo, adds: [], values: { [PRESS]: 1 } },
      learn: {
        say: "Turn it. The bump pushes the rod.",
        rigs: {
          cam: {
            controls: { turn: "Turn" },
            why: [
              "A cam is a wheel with a bump.",
              "Each turn, the bump pushes whatever rests on it.",
              "In the pen, each click turns the cam a notch. One notch holds the tip out. The next lets it back.",
            ],
          },
        },
      },
      uses: { cam: "Each click turns the cam, holding the tip out or in." },
      assemble: { piece: "Cam", title: "The cam sits on top of the refill.", built: "The cam now sits under the button." },
      target: { label: "Refill top", at: vec(0, CAM_MID, 0), ring: { radius: 14, axis: "y" } },
      play: { say: "Press the button all the way.", control: pressing, tests: [letgo, write] },
      hints: ["Let go and watch the tip.", "A half press never turns the cam. Press further.", "Push until it says Clicked, then let go."],
      why: [
        "You can't write with your thumb stuck on the button.",
        "The cam turns a notch each click and catches on a ledge.",
        "Without the cam, the spring shoves the tip back the moment you let go.",
      ],
      job: "The cam holds the tip out.",
      cheer: "Stays put!",
    },
  ],
  final: {
    title: "Click and write",
    say: "Click it. Then write.",
    success: "It clicks, writes and hides away.",
    cheer: "Click! Pen built.",
    control: pressing,
    tests: [letgo, write, again],
    why: ["A click pen is a few simple parts, each with one job.", "Take any one away and the pen stops working."],
    payoff: [
      { part: "Ball", job: "rolls ink onto the page." },
      { part: "Spring", job: "tucks the tip away." },
      { part: "Cam", job: "holds the tip out." },
      { part: "Nose cone", job: "guides the tip." },
    ],
  },
});
