// Wedge: turn a push into a bigger sideways push. An element, rewritten to src/primitives/docs/design-language.md.
//
// The rig is the textbook picture: a pink wedge point-down between two halves of a log, a tap pad on its top, and on each
// outer side a springy pad the log half leans on, then a post. The log half's top inner corner rides on the wedge's
// face, so the number (the half-angle) is the wedge's own shape: a fat wedge is wide, a thin one is sharp. Going in
// `d` mm opens each half out by d x tan(half-angle), and no more: the geometry is the only motion.
//
// The forces are drawn where they act, at one scale, and only three: the hammer's push on the wedge, and F / (2 tan a)
// pushing each log half out, drawn on that half's front face. The log pushes back with a grip of 100 N plus 5 N for
// every mm it has given, through the pad. The wedge goes in only as far as its push can overcome the grip, so a fat
// wedge stalls, or does not go in at all, and the game's reach (`handle.reach`) stops a drag there. Its other limit is
// the plate: the tip lands on it at 32 mm, right through the log. Free play has a hand, not the blows, so there it goes
// in until the tip lands or a pad is squeezed solid.
//
// The game, "Split the log": up to five blows of 120 N. Each blow drives the wedge a further 6.4 mm if the sideways push
// beats the log's grip. The log splits when each half has opened 9 mm, and the blows stop there. A fat wedge's sideways
// push gives out before then, and with nothing holding it the log pushes it back out; a thin one goes all the way in
// and has still not opened the log far enough.
import type { Part } from "../../kit.ts";
import { clamp, easeOut } from "../motion/ease.ts";
import { frame, handArrow, HOLD, LEAD, phases, RESET, SCENE, whenReaches } from "../motion/run.ts";
import { arrow, arrowLength, box, fmt, look, on, part, PLATE_TOP, plate, post, pushDisc, tick, v3 } from "../parts.ts";
import { type Cue, type Meter, type Plot, type Primitive, type Run, type Values, type Verdict, VIEW, type Slider, valueOf } from "../types.ts";
import { DEG_TO_RAD } from "../../angles.ts";

// Geometry, millimetres. The log is small beside the wedge, so the pink piece is what the eye lands on.
const BLOCK_W = 22;
const BLOCK_H = 32;
const DEPTH = 26;
const TOP_Y = PLATE_TOP + BLOCK_H;
/** How far the wedge can go in: its tip lands on the plate. */
export const LENGTH = BLOCK_H;
/** The wedge is a little longer than the log is tall, so its top stays above the log. */
const WEDGE_L = LENGTH + 10;
/** The pad between a log half and its post, at rest. */
const PAD_L = 20;
const PAD_H = 14;
/** A pad squeezed this thin is solid: a hand can drive the wedge no further. */
const PAD_SOLID = 6;
const POST_X = BLOCK_W + PAD_L + 5;
const POST_H = 24;
const DISC_T = 4;
/** The target tick is this long. */
const TICK_LEN = 10;
/** Arrows: the biggest sideways push the sliders can make (slope 8°) is 34 long, so it ends short of the post. */
const BLOW_FOR_SCALE = 120;
const SIDE_MAX = BLOW_FOR_SCALE / (2 * Math.tan(8 * DEG_TO_RAD));
const ARROW_LONG = 34;
/** A side arrow lies on the log half's front face, this far in from its inner edge, and stands this far off it. */
const ARROW_IN = 1;
const ARROW_OUT = 2;

// The game, in game numbers. The push and the sums are real; the log's grip is set so the window sits mid-range.
/** Each blow pushes the wedge with this much. */
export const BLOW = BLOW_FOR_SCALE;
/** What the log pushes back with before it has given anything. */
export const GRIP = 100;
/** And what it adds for every mm each half gives. */
const STIFF = 5;
/** Each half must open this far for the log to split. */
export const OPEN = 9;
export const BLOWS = 5;
/** A wedge the log will not take still sinks this far, crushing the wood, and springs back. */
export const ELASTIC = 1.5;
/** A blow drives the wedge this much further. Five of them go right through. */
const STEP = LENGTH / BLOWS;

const tanOf = (slope: number) => Math.tan(slope * DEG_TO_RAD);
/** What the log pushes back with when each half has given `open` mm. */
export const gripAt = (open: number) => GRIP + STIFF * open;

/**
 * Everything a pose needs, from the two sliders. `build`, `readouts`, the handle and the game all read this. The pose is
 * geometry only: the wedge goes wherever the push puts it, up to `stop`, where the tip lands on the plate or a pad is
 * squeezed solid. How far the game's 120 N blows can drive it against the log's grip, `limit`, is the game's, and only
 * the game's reach and runs hold to it.
 */
export function settle(v: Values) {
  const slope = valueOf(SLOPE, v);
  const t = tanOf(slope);
  /** The push on each half, F ÷ (2 tan a). */
  const side = BLOW / (2 * t);
  /** How far each half could be opened by that push: where the grip has grown to match it. */
  const reachOpen = Math.max(0, (side - GRIP) / STIFF);
  const stop = Math.min(LENGTH, (PAD_L - PAD_SOLID) / t);
  const limit = Math.min(stop, Math.max(reachOpen / t, ELASTIC));
  const push = clamp(v.push ?? 24, 0, stop);
  const open = push * t;
  return {
    slope,
    t,
    side,
    reachOpen,
    stop,
    limit,
    push,
    open,
    grip: gripAt(open),
    stalled: Math.abs(push - limit) < 1e-9 && limit < LENGTH - 1e-9 && reachOpen > 0,
    /** In further than a blow could drive it: only a hand puts it there. */
    beyond: push > limit + 1e-9,
    through: push >= LENGTH - 1e-9,
    tipY: TOP_Y - push,
  };
}

const topOf = (tipY: number) => tipY + WEDGE_L;

/** The wedge as the game and the library show it: the forces drawn on it, to scale. */
const build = (v: Values): Part[] => draw(settle(v), true);
/** The wedge alone, as free play's hand meets it: the log it splits and the pads it squeezes, no arrows. */
const bare = (v: Values): Part[] => draw(settle(v), false);

/** The forces drawn on the wedge: the push in, the push out on each half, and the scale, `largest` N drawn `longest` mm. */
type Forces = { push: number; side: number; largest: number; longest: number };
/** The game's: a 120 N blow, and what it makes on each half, F ÷ (2 tan a). */
const blow = (s: ReturnType<typeof settle>): Forces => ({ push: BLOW, side: s.side, largest: SIDE_MAX, longest: ARROW_LONG });

/** The pose, and the forces on it unless bare. */
function draw(s: ReturnType<typeof settle>, forces: boolean, f: Forces = blow(s)): Part[] {
  const half = (sign: 1 | -1): Part[] => {
    const side = sign === 1 ? "right" : "left";
    return [
      part(
        `block-${side}`,
        "Log half",
        "Half of the log, pushed out by the wedge.",
        box(BLOCK_W, BLOCK_H, DEPTH, 1),
        v3(sign * (s.open + BLOCK_W / 2), PLATE_TOP + BLOCK_H / 2, 0),
        look.stone,
        on("plate", "slide"),
      ),
      part(
        `pad-${side}`,
        "Pad",
        "The log's grip: it squeezes as the half is pushed out and pushes back.",
        box(PAD_L - s.open, PAD_H, PAD_H, 1.5),
        v3(sign * (BLOCK_W + (PAD_L + s.open) / 2), PLATE_TOP + PAD_H / 2, 0),
        look.slate,
        on(`post-${side}`, "glue"),
      ),
      post(`post-${side}`, sign * POST_X, 0, PLATE_TOP + POST_H, { name: "Post", role: "Holds the pad: the half has something to push against." }),
    ];
  };
  const t = s.t;
  const top = topOf(s.tipY);
  const parts: Part[] = [
    plate(2 * POST_X + 10, DEPTH + 6),
    ...half(-1),
    ...half(1),
    part(
      "wedge",
      "Wedge",
      "Slides point-down between the log halves and pushes them apart.",
      {
        kind: "extrusion",
        outline: [
          { x: 0, y: 0 },
          { x: WEDGE_L * t, y: WEDGE_L },
          { x: -WEDGE_L * t, y: WEDGE_L },
        ],
        depth: DEPTH,
      },
      v3(0, s.tipY + WEDGE_L / 2, 0),
      look.focus,
      on("plate", "slide"),
    ),
    pushDisc("disc", v3(0, top + DISC_T / 2, 0), "y", { name: "Tap pad", role: "Where the hammer's blow lands.", on: on("wedge", "glue") }),
  ];
  // Forces appear once the wedge is in: the push on it, and what it makes on each half, drawn on that half's face.
  if (forces && s.push > 1e-9) {
    parts.push(
      ...arrow("push-arrow", v3(0, top + DISC_T, 0), -90, arrowLength(f.push, f.largest, f.longest), "push", {
        name: "Arrow",
        role: "The push on the wedge, to scale.",
        on: on("disc", "glue"),
      }),
    );
    for (const sign of [-1, 1] as const) {
      const side = sign === 1 ? "right" : "left";
      // The tail is ARROW_IN inside the half's inner edge; a pull arrow stands ARROW_GAP (4) clear of the point it is given.
      parts.push(
        ...arrow(
          `out-arrow-${side}`,
          v3(sign * (s.open + ARROW_IN - 4), PLATE_TOP + BLOCK_H / 2, DEPTH / 2 + ARROW_OUT),
          sign === 1 ? 0 : 180,
          arrowLength(f.side, f.largest, f.longest),
          "pull",
          { name: "Arrow", role: "What the wedge pushes the half out with, drawn on the half.", on: on(`block-${side}`, "glue") },
        ),
      );
    }
  }
  return parts;
}

function readouts(v: Values) {
  const s = settle(v);
  const state = s.beyond
    ? `pressed in past what a ${BLOW} N blow can: ${fmt(s.side)} N a side against ${fmt(s.grip)} N grip`
    : s.side < GRIP
      ? `${fmt(s.side)} N a side < ${GRIP} N grip: the wedge won't go in`
      : s.push < 1e-9
        ? "resting on the seam: nothing pushed apart yet"
        : s.stalled
          ? `stalled: ${fmt(s.side)} N a side = ${fmt(s.grip)} N grip`
          : s.through
            ? `tip on the plate, right through: ${fmt(s.side)} N a side against ${fmt(s.grip)} N`
            : `driving: ${fmt(s.side)} N a side against ${fmt(s.grip)} N grip`;
  return [
    { label: "Each side", value: `F ÷ (2 tan ${s.slope}°) = ${BLOW} ÷ (2 × ${fmt(s.t, 2)}) = ${fmt(s.side)} N` },
    { label: "Travel", value: `wedge in ${fmt(s.push, 1)} mm, each half out ${fmt(s.push, 1)} × ${fmt(s.t, 2)} = ${fmt(s.open, 1)} mm` },
    { label: "State", value: state },
  ];
}

// ---- The game ----------------------------------------------------------------------------------------------------

type Kind = "pass" | "fat" | "thin";

/** The outcome, decided once from the slope; meters, judge and play all read it. */
export function split(v: Values) {
  const s = settle({ slope: v.slope ?? 20, push: 0 });
  const need = gripAt(OPEN);
  /** How far each half could be opened by blows that go on as long as they can. */
  const canOpen = s.limit * s.t;
  const kind: Kind = canOpen >= OPEN - 1e-9 ? "pass" : s.limit < LENGTH - 1e-9 ? "fat" : "thin";
  /** How far in the wedge ends up: a split log stops the blows at OPEN, otherwise they go in as far as they can. */
  const depth = kind === "pass" ? OPEN / s.t : s.limit;
  return { kind, slope: s.slope, t: s.t, side: s.side, need, canOpen, depth, open: depth * s.t, limit: s.limit };
}

function judge(v: Values): Verdict {
  const r = split(v);
  switch (r.kind) {
    case "fat":
      return {
        pass: false,
        outcome: "too-fat",
        headline: "Wedge too fat",
        detail: "Too blunt: the wedge pushes the wood apart too weakly, so it stalls and springs back.",
      };
    case "thin":
      return {
        pass: false,
        outcome: "too-thin",
        headline: "Wedge too thin",
        detail: "Too sharp: even fully in, the wedge never opens the log wide enough. It needs a blunter angle.",
      };
    case "pass":
      return {
        pass: true,
        outcome: "log-split",
        headline: "Log split",
        detail: "The wedge turns each blow into a strong sideways push, and goes in far enough to split.",
      };
  }
}

function meters(v: Values): [Meter, Meter] {
  const r = split(v);
  return [
    { label: "Side push", value: r.side, target: r.need, max: 450, unit: "N", need: "atLeast" },
    { label: "Gap opened", value: r.canOpen, target: OPEN, max: 16, unit: "mm", need: "atLeast", digits: 1 },
  ];
}

// Choreography, ms.
/** One blow: the wedge goes in over the first part, then the log answers. */
const BLOW_MS = 480;
const DRIVE_MS = 150;
/** A wedge too fat to stay in is pushed back out by the log's grip once the blows stop. */
const POP_MS = 200;

function play(v: Values): Run {
  const verdict = judge(v);
  const r = split(v);
  const home = clamp(v.push ?? 0, 0, LENGTH);
  /** Depth before and after blow k (1-based): STEP further, until the grip, the split or the plate stops it. */
  const after = (k: number) => Math.min(Math.max(home, k * STEP), Math.max(home, r.depth));
  const before = (k: number) => (k === 1 ? home : after(k - 1));
  // A split log ends the blows: the first blow that takes it to the depth is the last. Otherwise all of them are struck.
  const blows =
    r.kind === "pass"
      ? Math.min(BLOWS, Math.max(1, Array.from({ length: BLOWS }, (_, i) => i + 1).find((k) => after(k) >= Math.max(home, r.depth) - 1e-9) ?? BLOWS))
      : BLOWS;
  const fat = r.kind === "fat";
  const tl = phases({ lead: LEAD, blows: blows * BLOW_MS, pop: fat ? POP_MS : 0, hold: HOLD, reset: RESET });
  const blowStart = (k: number) => tl.start("blows") + (k - 1) * BLOW_MS;
  const cues: Cue[] = [];
  for (let k = 1; k <= blows; k++) cues.push({ ms: blowStart(k) + 40, kind: "thud" });
  if (r.kind === "pass") {
    // The last blow is the one in which each half passes OPEN mm: the log splits as it lands.
    const at = whenReaches((x) => before(blows) + (after(blows) - before(blows)) * easeOut(x), OPEN / r.t, 0, 1);
    cues.push({ ms: blowStart(blows) + at * DRIVE_MS, kind: "snap" });
  }
  if (fat) cues.push({ ms: tl.start("pop"), kind: "pop" });

  const values = (push: number): Values => ({ ...v, slope: r.slope, push });
  const end = after(blows);
  /** Where the wedge rests when the blows are over: a fat one has been pushed back out to where it started. */
  const rest = fat ? Math.min(home, end) : end;
  return {
    verdict,
    durationMs: tl.total,
    cues: cues.sort((a, b) => a.ms - b.ms),
    at: (ms) => {
      const { phase } = tl.at(ms);
      if (phase === "lead") {
        const s = settle(values(home));
        const hand = handArrow(v3(0, topOf(s.tipY) + DISC_T, 0), -90, "push", arrowLength(BLOW, SIDE_MAX, ARROW_LONG));
        return frame(values(home), "Hammer the wedge", home < 1e-9 ? hand : []);
      }
      if (phase === "blows") {
        const k = Math.min(blows, Math.floor((ms - tl.start("blows")) / BLOW_MS) + 1);
        const a = before(k);
        const b = after(k);
        const push = a + (b - a) * easeOut(clamp((ms - blowStart(k)) / DRIVE_MS, 0, 1));
        return frame(values(push), "Hammering");
      }
      if (phase === "pop") return frame(values(end + (rest - end) * easeOut(tl.t("pop", ms))), "Sprang back out");
      if (phase === "hold") {
        return frame(values(rest), r.kind === "pass" ? "Split!" : fat ? "Sprang back out" : "Stuck, not split");
      }
      return frame(values(rest + (home - rest) * easeOut(tl.t("reset", ms))), "Putting it back");
    },
  };
}

/**
 * The line the right half's outer face has to reach: a low post in front of it whose inner face is that line, and on the
 * post one tick pointing back along the face's plane, in front of the half, so the half's edge is read against it.
 */
const MARK_Z = DEPTH / 2 + 5;
const MARK_POST_H = 10;
const MARK_TICK_Y = PLATE_TOP + 5;
function scene(): Part[] {
  const line = BLOCK_W + OPEN;
  return [
    post(`${SCENE}mark-post`, line + 5, MARK_Z, PLATE_TOP + MARK_POST_H, { name: "Mark post", role: "Its inner face is the line each half has to reach." }),
    tick(`${SCENE}mark`, v3(line - TICK_LEN / 2, MARK_TICK_Y, MARK_Z), TICK_LEN, "x", {
      name: "Mark",
      role: "How far each half has to open for the log to split.",
      on: on(`${SCENE}mark-post`, "weld"),
    }),
  ];
}

const SLOPE: Slider = { id: "slope", label: "Slope (half-angle)", min: 8, max: 35, step: 1, initial: 20, unit: "°", ends: ["Sharp", "Blunt"] };

/** The widest a half can open: its pad squeezed solid. */
const OPEN_MAX = PAD_L - PAD_SOLID;
/** The hardest push a hand gives in free play: the bluntest wedge, its pads squeezed solid. 48 mm long. */
const HAND_MAX = 2 * tanOf(SLOPE.max) * gripAt(OPEN_MAX);

/**
 * While a hand is on the pad: the push that holds the wedge where it is against the log's grip, 2 tan a times the grip,
 * and the grip itself, which is what the wedge pushes each half out with, to one scale. A sharp wedge holds the log open
 * with a push much smaller than its push out; a blunt one needs a push bigger than it. The game's fixed 120 N blow would
 * leave every arrow at the blunt end the shortest one an arrow can be.
 */
function hand(v: Values): Part[] {
  const s = settle(v);
  const bareIds = new Set(draw(s, false).map((p) => p.id));
  return draw(s, true, { push: 2 * s.t * s.grip, side: s.grip, largest: HAND_MAX, longest: 48 }).filter((p) => !bareIds.has(p.id));
}

/**
 * The other half of the trade: how far each half opens (up) for how far the wedge goes in (across). One straight line
 * of slope tan a, from the seam to where the tip lands or a pad goes solid; a sharper wedge lays it flatter.
 */
function opening(v: Values): Plot {
  const s = settle(v);
  return {
    line: [
      [0, 0],
      [s.stop / LENGTH, (s.stop * s.t) / OPEN_MAX],
    ],
    dot: [s.push / LENGTH, s.open / OPEN_MAX],
    caption: "log opening for depth in",
  };
}

export const wedge: Primitive = {
  id: "wedge",
  name: "Wedge",
  level: "Element",
  job: "Turn a push into a bigger sideways push",
  howItWorks:
    "A wedge turns a push along its length into pushes at right angles to its faces. With no friction and half-angle α, each side is pushed out with F ÷ (2·tan α), so a thinner wedge gives a bigger sideways push. The catch is distance: each side moves out only tan α times as far as the wedge goes in. Here each log half leans on a springy pad that pushes back with 100 N plus 5 N for every mm it gives, so the wedge goes in only as far as its sideways push can match that. A wedge that is too fat gets pushed back out. In real life friction is what holds a wedge in, and it is left out.",
  madeOf: [],
  seenIn: ["Knife", "Doorstop", "Zipper slider"],
  sliders: [
    SLOPE,
    // Was 0..40. The log is now 32 tall, so the wedge goes in at most 32: the slider ends where the plate does.
    { id: "push", label: "Push in", min: 0, max: LENGTH, step: 1, initial: 24, unit: " mm" },
  ],
  view: VIEW.bench,
  build,
  readouts,
  handle: {
    slider: "push",
    label: "Tap",
    at: (v) => v3(0, topOf(settle(v).tipY) + DISC_T / 2, 0),
    // The pad goes down as the wedge goes in, one for one.
    solve: (point) => topOf(TOP_Y) + DISC_T / 2 - point.y,
    // Only as far as the push can overcome the log's grip, and the plate.
    reach: (v) => [0, settle(v).limit],
  },
  play: {
    // The game hammers it in with taps; a bare hand pushes it.
    label: "Push",
    // The log and its pads stay: a wedge means nothing without something to push apart. No arrows, no line to reach.
    build: bare,
    hand,
    plot: opening,
    // Resting point-down on the seam, nothing pushed apart, and a wedge shaped like a splitting wedge (30° across the
    // point) rather than the slider's fatter 40°.
    rest: { slope: 15, push: 0 },
    // A hand, not the game's blows: the wedge goes in until its tip is on the plate or a pad is squeezed solid.
    reach: (v) => [0, settle(v).stop],
    // No release: a real wedge is held where it was driven by friction on its faces, as a doorstop is.
  },
  game: {
    name: "Split the log",
    goal: "Split the log in five blows.",
    rules: "A blunter wedge pushes the wood apart harder, but must go in deeper. A sharper one goes in easily, but pushes weakly.",
    number: "slope",
    action: "Hammer",
    meters,
    judge,
    play,
    start: { slope: 28, push: 0 },
    scene,
  },
};

/** Exposed for tests: the rig's layout. */
export const rig = { TOP_Y, BLOCK_W, BLOCK_H, DEPTH, PAD_L, POST_X, WEDGE_L, DISC_T, STEP, TICK_LEN, MARK_Z, MARK_POST_H };
