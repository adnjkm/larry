// The nine mechanisms: two or three elements combined to do one new job none of them does alone.
// Every figure is solved for every slider value (gears stay meshed, the follower rides the cam, the
// pawl rides the teeth, the linkage closes), so any pose the sliders can reach is a real pose.
// Pink (look.focus) marks the piece the mechanism is about.
import type { Joint, Part } from "../../../shared/kit.ts";
import { bar, box, coil, cylinder, DEG, fmt, gearOutline, lathe, look, part, pivoted, polygon, RAD, ring, rotateAbout, v3 } from "./parts.ts";
import type { Look, Pt, Vec } from "./parts.ts";
import type { Primitive } from "./types.ts";

type Attach = { parentId: string; joint: Joint };
const on = (parentId: string, joint: Joint): Attach => ({ parentId, joint });

/** A pin or axle lying along z, centred at `at`. */
function pin(id: string, name: string, role: string, r: number, len: number, at: Vec, appearance: Look, attach: Attach | null): Part {
  return part(id, name, role, cylinder(r, len).shape, at, appearance, attach, v3(90, 0, 0));
}

function column(
  id: string,
  name: string,
  role: string,
  r: number,
  y0: number,
  y1: number,
  x: number,
  z: number,
  appearance: Look,
  attach: Attach | null,
): Part {
  const c = cylinder(r, y1 - y0);
  return part(id, name, role, c.shape, v3(x, y0 + c.midY, z), appearance, attach);
}

function shaped(
  id: string,
  name: string,
  role: string,
  s: { shape: Part["shape"]; position: Vec; rotation: Vec },
  appearance: Look,
  attach: Attach | null,
): Part {
  return part(id, name, role, s.shape, s.position, appearance, attach, s.rotation);
}

/** A straight link from a to b, extended past each end by `ext` so a pin sits inside a rounded end. */
function link(a: Pt, b: Pt, thick: number, depth: number, z: number, ext: number) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / len;
  const uy = (b[1] - a[1]) / len;
  return bar([a[0] - ux * ext, a[1] - uy * ext], [b[0] + ux * ext, b[1] + uy * ext], thick, depth, z);
}

/** A coil spring whose axis runs from a to b, in the plane z. */
function coilSpring(
  id: string,
  name: string,
  role: string,
  a: Pt,
  b: Pt,
  z: number,
  radius: number,
  tube: number,
  turns: number,
  appearance: Look,
  attach: Attach,
): Part {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const lean = Math.atan2(-(b[0] - a[0]), b[1] - a[1]) * DEG;
  return part(id, name, role, coil(radius, tube, len, turns), v3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, z), appearance, attach, v3(0, 0, lean));
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const GEAR_MODULE = 3;
const DRIVER_TEETH = 12;
const GEAR_AXIS_Y = 52;
const drivenTeeth = (ratio: number) => clamp(Math.round(DRIVER_TEETH * ratio), 8, 24);

const gear: Primitive = {
  id: "gear",
  name: "Gear",
  level: "Mechanism",
  job: "Change the speed or force of turning",
  howItWorks:
    "A gear is a wheel with teeth cut into its rim, so two of them cannot slip against each other. The same number of teeth pass the contact point on both, so a gear with twice the teeth turns half as fast and, because the work in equals the work out, with twice the turning force. Each mesh also reverses the direction of turn. This is the ideal case with friction ignored, drawn with straight-sided teeth; real teeth are curved so the ratio stays exact all the way through each tooth.",
  madeOf: ["wheel", "wheel"],
  seenIn: ["Watch", "Bike", "Hand drill"],
  sliders: [
    { id: "ratio", label: "Tooth ratio", min: 8 / 12, max: 2, step: 1 / 12, initial: 1.5, unit: "×" },
    { id: "turn", label: "Turn", min: 0, max: 1, step: 0.005, initial: 0.1, unit: "°", displayScale: 360 },
  ],
  view: { elevation: 10, azimuth: 18 },
  build: ({ ratio = 1.5, turn = 0.1 }) => {
    const z1 = DRIVER_TEETH;
    const z2 = drivenTeeth(ratio);
    const r1 = (GEAR_MODULE * z1) / 2;
    const r2 = (GEAR_MODULE * z2) / 2;
    const x1 = -(r1 + r2) / 2;
    const x2 = (r1 + r2) / 2;
    const theta = turn * 360;
    // Gear 2 sits half a tooth off, and turns opposite at z1/z2 of the speed, so the teeth interleave at every angle.
    const theta2 = 180 + 180 / z2 - (theta * z1) / z2;
    const g1 = pivoted(gearOutline(z1, GEAR_MODULE), 8, [0, 0], v3(x1, GEAR_AXIS_Y, -4), theta);
    const g2 = pivoted(gearOutline(z2, GEAR_MODULE), 8, [0, 0], v3(x2, GEAR_AXIS_Y, -4), theta2);
    const spoke = (x: number, r: number, angle: number) =>
      bar([x, GEAR_AXIS_Y], [x + (r - 2) * Math.cos(angle * RAD), GEAR_AXIS_Y + (r - 2) * Math.sin(angle * RAD)], 2.6, 2, 1);
    const baseW = 2 * (r1 + r2) + 28;
    return [
      part("base", "Frame", "Holds both axles the right distance apart.", box(baseW, 8, 40, 2), v3((r2 - r1) / 2, 4, -6), look.structure),
      part(
        "post-1",
        "Left post",
        "Carries the driving gear's axle.",
        box(8, GEAR_AXIS_Y - 8, 6, 1),
        v3(x1, 8 + (GEAR_AXIS_Y - 8) / 2, -11),
        look.structure,
        on("base", "weld"),
      ),
      part(
        "post-2",
        "Right post",
        "Carries the driven gear's axle.",
        box(8, GEAR_AXIS_Y - 8, 6, 1),
        v3(x2, 8 + (GEAR_AXIS_Y - 8) / 2, -11),
        look.structure,
        on("base", "weld"),
      ),
      pin("pin-1", "Axle", "The driving gear turns on it.", 3, 18, v3(x1, GEAR_AXIS_Y, -5), look.structure, on("post-1", "press-fit")),
      pin("pin-2", "Axle", "The driven gear turns on it.", 3, 18, v3(x2, GEAR_AXIS_Y, -5), look.structure, on("post-2", "press-fit")),
      part("gear-driver", "Driving gear", "The gear you turn.", g1.shape, g1.position, look.focus, on("pin-1", "hinge"), g1.rotation),
      part("gear-driven", "Driven gear", "Turned by the driving gear's teeth.", g2.shape, g2.position, look.steel, on("pin-2", "hinge"), g2.rotation),
      shaped("mark-1", "Spoke mark", "Shows how far the driving gear has turned.", spoke(x1, r1, theta), look.stone, on("gear-driver", "glue")),
      shaped("mark-2", "Spoke mark", "Shows how far the driven gear has turned.", spoke(x2, r2, theta2), look.stone, on("gear-driven", "glue")),
    ];
  },
  readouts: ({ ratio = 1.5 }) => {
    const z2 = drivenTeeth(ratio);
    return [
      { label: "Teeth", value: `${DRIVER_TEETH} driving, ${z2} driven` },
      { label: "Speed", value: `driven turns ${fmt(DRIVER_TEETH / z2, 2)}× as fast` },
      { label: "Force", value: `${fmt(z2 / DRIVER_TEETH, 2)}× the torque, ideal` },
    ];
  },
};

const ROPE_R = 7.8;
const FIXED_Y = 150;
const SHEAVE = lathe([
  [0, -3],
  [9.5, -3],
  [9.5, -1.8],
  [6.6, -1.8],
  [6.6, 1.8],
  [9.5, 1.8],
  [9.5, 3],
  [0, 3],
]);

const pulley: Primitive = {
  id: "pulley",
  name: "Pulley",
  level: "Mechanism",
  job: "Redirect a pull, or multiply it",
  howItWorks:
    "A pulley is a cord running in the groove of a wheel. One fixed wheel only turns your downward pull into an upward lift. Hang a second wheel from the load and the cord carries it in several strands at once: each strand holds an equal share, so you pull with that fraction of the weight. The price is cord: to raise the load by 1 cm, every supporting strand must shorten by 1 cm, so you pull as many centimetres as there are strands. Friction and the weight of the blocks and cord are ignored.",
  madeOf: ["cord", "wheel"],
  seenIn: ["Blinds", "Flagpole", "Crane"],
  sliders: [
    { id: "strands", label: "Strands", min: 1, max: 4, step: 1, initial: 2 },
    { id: "pull", label: "Pull", min: 0, max: 50, step: 1, initial: 20, unit: " mm" },
  ],
  view: { elevation: 10, azimuth: 16 },
  build: ({ strands = 2, pull = 20 }) => {
    const n = clamp(Math.round(strands), 1, 4);
    const yM = 62 + pull / n;
    const xs = Array.from({ length: n }, (_, i) => (2 * i - (n - 1)) * ROPE_R);
    const fixed = (i: number) => (n - 1 - i) % 2 === 0;
    const yOf = (i: number) => (fixed(i) ? FIXED_Y : yM);
    const xFirst = xs[0]! - ROPE_R;
    const xHand = xs[n - 1]! + ROPE_R;
    const handleTop = 110 - pull;
    const post = n * ROPE_R + 24;
    const odd = n % 2 === 1;

    const movingX = xs.filter((_, i) => !fixed(i));
    const fixedX = xs.filter((_, i) => fixed(i));
    const extent = (centres: number[], extra: number | null) => {
      const all = [...centres.map((c) => [c - 12, c + 12]), ...(extra === null ? [] : [[extra - 6, extra + 6]])].flat();
      return { lo: Math.min(...all), hi: Math.max(...all) };
    };
    const mv = extent(movingX, odd ? xFirst : null);
    const fx = extent(fixedX, odd ? null : xFirst);

    const parts: Part[] = [
      part("ground", "Ground plate", "Stands the frame on the floor.", box(2 * post + 30, 6, 40, 2), v3(0, 3, -6), look.structure),
      part("post-l", "Left post", "Holds up the beam.", box(8, 165, 12, 1), v3(-post, 6 + 82.5, -6), look.structure, on("ground", "weld")),
      part("post-r", "Right post", "Holds up the beam.", box(8, 165, 12, 1), v3(post, 6 + 82.5, -6), look.structure, on("ground", "weld")),
      part("beam", "Beam", "The fixed support the top block hangs from.", box(2 * post + 8, 8, 12, 1), v3(0, 167, -6), look.structure, on("post-l", "weld")),
      part(
        "block-top",
        "Fixed block",
        "Holds the fixed wheels in place.",
        box(fx.hi - fx.lo, 26, 5, 1.5),
        v3((fx.lo + fx.hi) / 2, FIXED_Y, -6),
        look.structure,
        on("beam", "weld"),
      ),
      part(
        "block-load",
        "Moving block",
        "Hangs from the cord and carries the load.",
        box(mv.hi - mv.lo, 26, 5, 1.5),
        v3((mv.lo + mv.hi) / 2, yM, -6),
        look.steel,
        on("block-top", "slide"),
      ),
      column("hook", "Hook", "Joins the load to the moving block.", 2.2, yM - 21, yM - 13, (mv.lo + mv.hi) / 2, -6, look.structure, on("block-load", "weld")),
      part("load", "Load", "The weight being lifted.", box(30, 26, 24, 2), v3((mv.lo + mv.hi) / 2, yM - 34, -6), look.stone, on("block-load", "glue")),
    ];

    // The eye where the cord's fixed end is tied: on the beam block for even n, on the moving block for odd n.
    const anchorOn = odd ? "block-load" : "block-top";
    const anchorY = odd ? yM : FIXED_Y;
    parts.push(pin("eye", "Cord anchor", "Where one end of the cord is tied off.", 2.4, 8, v3(xFirst, anchorY, -1), look.structure, on(anchorOn, "press-fit")));

    xs.forEach((x, i) => {
      const isFixed = fixed(i);
      const owner = isFixed ? "block-top" : "block-load";
      const y = yOf(i);
      parts.push(pin(`axle-${i + 1}`, "Axle", "The wheel turns on it.", 2.4, 14, v3(x, y, -1.5), look.structure, on(owner, "press-fit")));
      parts.push(
        part(
          `wheel-${i + 1}`,
          isFixed ? "Fixed wheel" : "Moving wheel",
          "A grooved wheel the cord runs round.",
          SHEAVE.shape,
          v3(x, y, 0),
          look.focus,
          on(`axle-${i + 1}`, "hinge"),
          v3(90, 0, 0),
        ),
      );
    });

    // The cord: a straight run, a half-turn round a wheel, a straight run, and so on.
    let last = "eye";
    const cordBar = (id: string, a: Pt, b: Pt) => {
      parts.push(shaped(id, "Cord", "One straight run of the cord.", bar(a, b, 2.4, 2.4, 0), look.slate, on(last, "molded")));
      last = id;
    };
    cordBar("cord-0", [xFirst, anchorY], [xFirst, odd ? FIXED_Y : yM]);
    xs.forEach((x, i) => {
      const up = fixed(i);
      parts.push(
        part(
          `turn-${i + 1}`,
          "Cord",
          "The cord bending round a wheel.",
          ring(ROPE_R, 1.2, 180),
          v3(x, yOf(i), 0),
          look.slate,
          on(last, "molded"),
          v3(90, up ? 90 : -90, 0),
        ),
      );
      last = `turn-${i + 1}`;
      cordBar(`cord-${i + 1}`, [x + ROPE_R, yOf(i)], i < n - 1 ? [x + ROPE_R, yOf(i + 1)] : [x + ROPE_R, handleTop]);
    });
    parts.push(part("handle", "Handle", "Where you pull.", box(18, 6, 7, 2), v3(xHand, handleTop - 3, 0), look.slate, on(last, "glue")));
    return parts;
  },
  readouts: ({ strands = 2, pull = 20 }) => {
    const n = clamp(Math.round(strands), 1, 4);
    return [
      { label: "Strands", value: `${n} hold the load` },
      { label: "Pull needed", value: n === 1 ? "= the load, only the direction changes" : `1/${n} of the load, ideal` },
      { label: "Cord / lift", value: `${fmt(pull)} mm pulled, ${fmt(pull / n, 1)} mm risen` },
    ];
  },
};

const BOLT_LEN = 76;
const BOLT_CORE = 6.2;
const BOLT_CREST = 8;
const HEAD_H = 8;
const NUT_H = 9;
const NUT_R = 12.5;
const NUT_BASE = 14;

const thread: Primitive = {
  id: "thread",
  name: "Thread",
  level: "Mechanism",
  job: "Turn twisting into pushing, and stay put",
  howItWorks:
    "Unroll a thread and it is a long, shallow wedge; wrap that wedge round a rod and it becomes a screw. Turning the nut makes it climb the wedge, so one turn moves it along the bolt by exactly the pitch. A small distance per turn means a big gain in force: ideally the turning force is multiplied by the circumference you turn through divided by the pitch. Real threads lose most of that to friction, which is also why a thread holds still when you let go.",
  madeOf: ["wedge", "wheel"],
  seenIn: ["Bottle cap", "Bolt", "Lipstick"],
  sliders: [
    { id: "pitch", label: "Pitch", min: 2, max: 6, step: 0.5, initial: 4, unit: " mm" },
    { id: "turns", label: "Turns", min: 0, max: 6, step: 0.05, initial: 2.5, unit: " turns" },
  ],
  view: { elevation: 16, azimuth: 28 },
  build: ({ pitch = 4, turns = 2.5 }) => {
    const rise = turns * pitch;
    const nutY = NUT_BASE + rise + NUT_H / 2;
    const ccw = turns * 360;
    const rod = cylinder(BOLT_CORE, BOLT_LEN);
    const wire = clamp(pitch * 0.3, 0.9, 1.4);
    const ridgeLen = BOLT_LEN - 2;
    const hexShape = (r: number, h: number) => pivoted(polygon(6, r), h, [0, 0], v3(0, 0, 0), 0).shape;
    const tabAngle = ccw * RAD;
    return [
      part("base", "Base plate", "Holds the bolt upright.", box(64, 6, 52, 2), v3(0, 3, 0), look.structure),
      part(
        "head",
        "Bolt head",
        "Stops the bolt and gives a wrench something to grip.",
        hexShape(15, HEAD_H),
        v3(0, 6 + HEAD_H / 2, 0),
        look.structure,
        on("base", "weld"),
        v3(-90, 0, 0),
      ),
      part("rod", "Bolt shank", "The rod the ridge is wound on.", rod.shape, v3(0, 6 + HEAD_H + rod.midY, 0), look.steel, on("head", "weld")),
      part(
        "ridge",
        "Thread ridge",
        "A wedge-shaped ridge wound along the bolt.",
        coil(BOLT_CREST - wire, wire, ridgeLen, (ridgeLen - 2 * wire) / pitch),
        v3(0, 6 + HEAD_H + ridgeLen / 2, 0),
        look.steel,
        on("rod", "weld"),
      ),
      part(
        "nut",
        "Nut",
        "Its matching thread makes it climb as it turns.",
        hexShape(NUT_R, NUT_H),
        v3(0, 6 + HEAD_H + nutY, 0),
        look.focus,
        on("rod", "thread"),
        v3(-90, 0, -ccw),
      ),
      part(
        "tab",
        "Turn mark",
        "Shows how far the nut has turned.",
        box(5, NUT_H, 5, 1),
        v3((NUT_R + 1.5) * Math.cos(tabAngle), 6 + HEAD_H + nutY, -(NUT_R + 1.5) * Math.sin(tabAngle)),
        look.stone,
        on("nut", "glue"),
        v3(0, ccw, 0),
      ),
    ];
  },
  readouts: ({ pitch = 4, turns = 2.5 }) => [
    { label: "Moved", value: `${fmt(turns * pitch, 1)} mm = ${fmt(turns, 2)} turns × ${fmt(pitch, 1)} mm` },
    { label: "Gain", value: `${fmt((2 * Math.PI * NUT_R) / pitch)}× at ${NUT_R} mm radius, ideal` },
    { label: "Friction", value: "ignored; real threads lose most, so they hold" },
  ],
};

const CAM_R0 = 15;
const CAM_AXIS_Y = 40;
const CAM_ROD = 56;
const camRadius = (a: number, lift: number) => CAM_R0 + lift * ((1 + Math.cos(a)) / 2) ** 3;
const CAM_STEPS = 96;

/** Height of a flat-faced follower's foot above the axle: the highest point of the cam edge at turn `theta`. */
function camSupport(lift: number, theta: number): number {
  let top = -Infinity;
  for (let i = 0; i < CAM_STEPS; i++) {
    const a = (i / CAM_STEPS) * 2 * Math.PI;
    top = Math.max(top, camRadius(a, lift) * Math.sin(a + theta * RAD));
  }
  return top;
}
const lowestSupport = (lift: number) => Math.min(...Array.from({ length: 90 }, (_, k) => camSupport(lift, k * 4)));

const cam: Primitive = {
  id: "cam",
  name: "Cam",
  level: "Mechanism",
  job: "Turn steady motion into a timed push",
  howItWorks:
    "A cam is a wheel whose edge bulges out like a wedge. Spin it steadily and a flat-footed rod resting on the edge is pushed up as the bulge passes underneath, then drops back. The shape of the bulge is the timing: a gentle slope gives a smooth lift, a steep one a sudden kick. The rod here rests on the cam by its own weight; real cams often use a spring to keep it in contact. The lift is the bulge height, measured from the lowest the rod gets.",
  madeOf: ["wheel", "wedge"],
  seenIn: ["Click pen", "Music box", "Sewing machine"],
  sliders: [
    { id: "lift", label: "Lift", min: 4, max: 14, step: 1, initial: 12, unit: " mm" },
    { id: "turn", label: "Turn", min: 0, max: 1, step: 0.005, initial: 0.1, unit: "°", displayScale: 360 },
  ],
  view: { elevation: 10, azimuth: 20 },
  build: ({ lift = 12, turn = 0.1 }) => {
    const theta = turn * 360;
    const outline: Pt[] = Array.from({ length: CAM_STEPS }, (_, i) => {
      const a = (i / CAM_STEPS) * 2 * Math.PI;
      const r = camRadius(a, lift);
      return [r * Math.cos(a), r * Math.sin(a)];
    });
    const c = pivoted(outline, 10, [0, 0], v3(0, CAM_AXIS_Y, -5), theta);
    const foot = CAM_AXIS_Y + camSupport(lift, theta);
    const rod = cylinder(4, CAM_ROD - 4);
    return [
      part("base", "Base", "Stands the whole thing on the floor.", box(92, 8, 40, 2), v3(0, 4, -6), look.structure),
      part("board", "Back board", "Carries the axle and the rod's guide.", box(70, 104, 6, 1), v3(0, 8 + 52, -14), look.stone, on("base", "weld")),
      pin("axle", "Axle", "The cam turns on it.", 3.5, 18, v3(0, CAM_AXIS_Y, -8), look.structure, on("board", "press-fit")),
      part("cam", "Cam", "Its bulging edge pushes the rod up and lets it drop.", c.shape, c.position, look.focus, on("axle", "hinge"), c.rotation),
      part(
        "foot",
        "Follower foot",
        "A flat shoe that rides on the cam's edge.",
        box(36, 4, 14, 1),
        v3(0, foot + 2, -5),
        look.steel,
        on("rod-guide-l", "slide"),
      ),
      part(
        "rod",
        "Follower rod",
        "Copies the cam's shape as an up-and-down motion.",
        rod.shape,
        v3(0, foot + 4 + rod.midY, -5),
        look.steel,
        on("foot", "weld"),
      ),
      part("rod-guide-l", "Guide", "Keeps the rod moving straight up and down.", box(6, 18, 6, 1), v3(-7, 95, -8), look.structure, on("board", "weld")),
      part("rod-guide-r", "Guide", "Keeps the rod moving straight up and down.", box(6, 18, 6, 1), v3(7, 95, -8), look.structure, on("board", "weld")),
    ];
  },
  readouts: ({ lift = 12, turn = 0.1 }) => {
    const rise = camSupport(lift, turn * 360) - lowestSupport(lift);
    return [
      { label: "Rod height", value: `${fmt(Math.max(0, rise), 1)} mm of ${fmt(lift)} mm` },
      { label: "Cycle", value: "one push per turn of the cam" },
    ];
  },
};

const LINK_A: Pt = [-40, 34];
const LINK_D: Pt = [40, 34];
const CRANK = 24;
const COUPLER = 70;

/** Crank tip B and coupler/rocker joint C, found by intersecting the circles round B and D. */
function fourBar(rocker: number, crankDeg: number) {
  const a = crankDeg * RAD;
  const B: Pt = [LINK_A[0] + CRANK * Math.cos(a), LINK_A[1] + CRANK * Math.sin(a)];
  const dx = LINK_D[0] - B[0];
  const dy = LINK_D[1] - B[1];
  const d = Math.hypot(dx, dy);
  const along = (COUPLER * COUPLER - rocker * rocker + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, COUPLER * COUPLER - along * along));
  const ux = dx / d;
  const uy = dy / d;
  const C: Pt = [B[0] + along * ux - h * uy, B[1] + along * uy + h * ux];
  const rockerDeg = Math.atan2(C[1] - LINK_D[1], C[0] - LINK_D[0]) * DEG;
  return { B, C, rockerDeg };
}

function rockerSwing(rocker: number) {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 0; k < 360; k += 2) {
    const r = fourBar(rocker, k).rockerDeg;
    lo = Math.min(lo, r);
    hi = Math.max(hi, r);
  }
  return { lo, hi, swing: hi - lo };
}

const linkage: Primitive = {
  id: "linkage",
  name: "Linkage",
  level: "Mechanism",
  job: "Reshape a motion, fold, or snap between two positions",
  howItWorks:
    "A linkage is levers joined end to end by pins. Here a short crank (the small bar on the left) turns all the way round, and a middle bar, the coupler, passes that motion to a long lever on the right, which can only rock to and fro. Because the bar lengths are fixed, the third joint can only sit where two circles meet, so every crank angle has exactly one pose. Change the long lever's length and the rock changes size. Friction and the bars' own weight are ignored.",
  madeOf: ["lever", "lever"],
  seenIn: ["Umbrella", "Locking pliers", "Desk lamp"],
  sliders: [
    { id: "rocker", label: "Rocker bar", min: 50, max: 90, step: 1, initial: 66, unit: " mm" },
    { id: "crank", label: "Crank", min: 0, max: 360, step: 1, initial: 50, unit: "°" },
  ],
  view: { elevation: 8, azimuth: 14 },
  build: ({ rocker = 66, crank = 50 }) => {
    const { B, C } = fourBar(rocker, crank);
    const [ax, ay] = LINK_A;
    const [dx, dy] = LINK_D;
    return [
      part("base", "Base plate", "Holds both fixed pivots the same distance apart.", box(150, 6, 36, 2), v3(0, 3, -6), look.structure),
      part("post-a", "Left post", "Carries the crank's pivot.", box(10, ay - 6, 6, 1), v3(ax, 6 + (ay - 6) / 2, -10), look.structure, on("base", "weld")),
      part("post-d", "Right post", "Carries the rocker's pivot.", box(10, dy - 6, 6, 1), v3(dx, 6 + (dy - 6) / 2, -10), look.structure, on("base", "weld")),
      pin("pin-a", "Pivot", "The crank turns on it.", 2.8, 16, v3(ax, ay, -3), look.structure, on("post-a", "press-fit")),
      pin("pin-d", "Pivot", "The rocker turns on it.", 2.8, 16, v3(dx, dy, -3), look.structure, on("post-d", "press-fit")),
      shaped("crank", "Crank", "The short bar that turns all the way round.", link([ax, ay], B, 9, 6, 3, 5), look.steel, on("pin-a", "hinge")),
      pin("pin-b", "Joint", "Joins the crank to the coupler.", 2.8, 12, v3(B[0], B[1], 0), look.structure, on("crank", "press-fit")),
      shaped("coupler", "Coupler", "The middle bar that carries the motion across.", link(B, C, 9, 6, -3, 5), look.stone, on("pin-b", "hinge")),
      pin("pin-c", "Joint", "Joins the coupler to the rocker.", 2.8, 12, v3(C[0], C[1], 0), look.structure, on("coupler", "press-fit")),
      shaped("rocker", "Rocker", "The long lever that rocks to and fro.", link([dx, dy], C, 9, 6, 3, 5), look.focus, on("pin-d", "hinge")),
    ];
  },
  readouts: ({ rocker = 66, crank = 50 }) => {
    const { rockerDeg } = fourBar(rocker, crank);
    const s = rockerSwing(rocker);
    return [
      { label: "Bars", value: `crank ${CRANK}, coupler ${COUPLER}, rocker ${fmt(rocker)}, frame 80 mm` },
      { label: "Rocker swing", value: `${fmt(s.swing)}° per crank turn (now ${fmt(rockerDeg - s.lo)}° in)` },
      { label: "Rule", value: "shortest + longest < the other two, so the crank can spin fully" },
    ];
  },
};

const RATCHET_ROOT = 20;
const RATCHET_TIP = 29;
const RATCHET_AXIS_Y = 38;
const RATCHET_PIVOT: Pt = [36, RATCHET_AXIS_Y + 38];
const RAMP = 0.94;

/** Sawtooth outline: each tooth ramps up from the root to the tip, then drops straight back. */
function ratchetOutline(teeth: number): Pt[] {
  const step = (2 * Math.PI) / teeth;
  const pts: Pt[] = [];
  for (let k = 0; k < teeth; k++) {
    for (let s = 0; s <= 4; s++) {
      const f = s / 4;
      const a = k * step + f * step * RAMP;
      const r = RATCHET_ROOT + (RATCHET_TIP - RATCHET_ROOT) * f;
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
  }
  return pts;
}

/** Radius of the sawtooth surface at angle `a` (radians, in the wheel's own frame). */
function ratchetRadius(a: number, teeth: number): number {
  const step = (2 * Math.PI) / teeth;
  const f = (((a % step) + step) % step) / step;
  return RATCHET_ROOT + (RATCHET_TIP - RATCHET_ROOT) * Math.min(1, f / RAMP);
}

const ratchet: Primitive = {
  id: "ratchet",
  name: "Ratchet",
  level: "Mechanism",
  job: "Allow motion one way only",
  howItWorks:
    "A ratchet wheel's teeth are wedges: a gentle ramp on one side and a straight cliff on the other. A spring presses a catch, the pawl, onto the wheel. Turning forward, the pawl rides up each ramp and snaps down behind it, which is the click. Turning backward, the pawl's tip jams against a cliff and the wheel cannot move. Fewer, bigger teeth give a sturdier hold but a coarser step. The figure only turns forward; the spring force and friction are not modelled.",
  madeOf: ["wheel", "wedge", "spring"],
  seenIn: ["Socket wrench", "Bike freewheel", "The watch's click"],
  sliders: [
    { id: "teeth", label: "Teeth", min: 8, max: 24, step: 1, initial: 12 },
    { id: "turn", label: "Turn", min: 0, max: 1, step: 0.002, initial: 0.06, unit: "°", displayScale: 360 },
  ],
  view: { elevation: 10, azimuth: 18 },
  build: ({ teeth = 12, turn = 0.06 }) => {
    const n = clamp(Math.round(teeth), 8, 24);
    const theta = -turn * 360;
    const wheel = pivoted(ratchetOutline(n), 10, [0, 0], v3(0, RATCHET_AXIS_Y, -5), theta);
    const under = ratchetRadius((90 - theta) * RAD, n);
    const tip: Pt = [0, RATCHET_AXIS_Y + under];
    const [px, py] = RATCHET_PIVOT;
    const len = Math.hypot(tip[0] - px, tip[1] - py);
    const angle = Math.atan2(tip[1] - py, tip[0] - px) * DEG;
    const pawl = pivoted(
      [
        [0, -4],
        [len * 0.55, -3],
        [len, 0],
        [len * 0.55, 3],
        [0, 4],
      ],
      6,
      [0, 0],
      v3(px, py, -2),
      angle,
    );
    const q = rotateAbout([len * 0.5, 3], angle, v3(px, py));
    const top: Pt = [q.x, py + 22];
    return [
      part("base", "Base", "Stands the whole thing on the floor.", box(110, 8, 36, 2), v3(14, 4, -8), look.structure),
      part(
        "post",
        "Wheel post",
        "Carries the wheel's axle.",
        box(10, RATCHET_AXIS_Y - 8, 6, 1),
        v3(0, 8 + (RATCHET_AXIS_Y - 8) / 2, -12),
        look.structure,
        on("base", "weld"),
      ),
      pin("axle", "Axle", "The wheel turns on it.", 3.2, 12, v3(0, RATCHET_AXIS_Y, -6), look.structure, on("post", "press-fit")),
      part(
        "wheel",
        "Ratchet wheel",
        "A wheel of sawtooth wedges: ramps one way, cliffs the other.",
        wheel.shape,
        wheel.position,
        look.steel,
        on("axle", "hinge"),
        wheel.rotation,
      ),
      part("pawl-post", "Pawl post", "Carries the pawl's pivot.", box(8, py - 8, 6, 1), v3(px, 8 + (py - 8) / 2, -8), look.structure, on("base", "weld")),
      pin("pawl-pin", "Pawl pivot", "The pawl swings on it.", 2.6, 10, v3(px, py, -3), look.structure, on("pawl-post", "press-fit")),
      part("pawl", "Pawl", "Rides up each ramp and drops behind each cliff.", pawl.shape, pawl.position, look.focus, on("pawl-pin", "hinge"), pawl.rotation),
      part(
        "bracket-post",
        "Spring post",
        "Holds up the spring's top end.",
        box(8, top[1] + 2 - 8, 6, 1),
        v3(px + 12, 8 + (top[1] + 2 - 8) / 2, -8),
        look.structure,
        on("base", "weld"),
      ),
      part(
        "bracket",
        "Spring seat",
        "The spring pushes against it.",
        box(px + 12 - top[0] + 8, 4, 6, 1),
        v3((top[0] + px + 12) / 2, top[1] + 2, -2),
        look.structure,
        on("bracket-post", "weld"),
      ),
      coilSpring("spring", "Spring coil", "Pushes the pawl down onto the wheel.", [q.x, q.y], top, -2, 4.2, 0.9, 7, look.slate, on("pawl", "spring")),
    ];
  },
  readouts: ({ teeth = 12, turn = 0.06 }) => {
    const n = clamp(Math.round(teeth), 8, 24);
    return [
      { label: "Clicks", value: `${Math.floor(turn * n + 1e-6)} so far, ${n} per turn` },
      { label: "Step", value: `one tooth = ${fmt(360 / n, 1)}° per click` },
      { label: "Backwards", value: `locked, at most ${fmt(360 / n, 1)}° of slack` },
    ];
  },
};

const BOLT_W = 16;
const LEAD_DEG = 30;
const TRAIL_DEG = 45;
/** Head height so that a 30 degree lead face and a 45 degree trailing face span the bolt's width. */
const HEAD_RISE = BOLT_W / (1 / Math.tan(LEAD_DEG * RAD) + 1 / Math.tan(TRAIL_DEG * RAD));
const HEAD_APEX = -BOLT_W / 2 + HEAD_RISE / Math.tan(TRAIL_DEG * RAD);
const BOLT_TRAVEL = 7;
const BOLT_BASE_Y = 36;
const STRIKE_Y = BOLT_BASE_Y + BOLT_TRAVEL;
const SPRING_RATE = 1;
const STRIKE_HALF = 28;

/** Height of the bevelled head above its base at horizontal offset u from the bolt's centre. */
function headHeight(u: number): number {
  if (u <= -BOLT_W / 2 || u >= BOLT_W / 2) return 0;
  return u <= HEAD_APEX ? ((u + BOLT_W / 2) / (HEAD_APEX + BOLT_W / 2)) * HEAD_RISE : ((BOLT_W / 2 - u) / (BOLT_W / 2 - HEAD_APEX)) * HEAD_RISE;
}

/** How far the spring pushes the bolt out when the door is `d` mm from closed: the head rises until it meets the strike. */
function boltExtension(d: number): number {
  let e = BOLT_TRAVEL;
  for (let u = -BOLT_W / 2; u <= BOLT_W / 2 + 1e-9; u += 0.25) {
    const w = d + u;
    if (w < -STRIKE_HALF) continue;
    e = Math.min(e, BOLT_TRAVEL + headHeight(w) - headHeight(u));
  }
  return clamp(e, 0, BOLT_TRAVEL);
}

const catchLatch: Primitive = {
  id: "catch",
  name: "Catch",
  level: "Mechanism",
  job: "Hold until pushed hard enough",
  howItWorks:
    "A latch bolt is a wedge pressed out by a spring. The bolt's gentle face meets the strike plate first, so closing takes a light push; once past, the spring snaps it into the notch. The bolt's steep face now faces the way you would pull, so pulling must squeeze the bolt back against the spring. On a slope at angle a from the direction of travel, that takes a force equal to the spring force times tan a. A stiffer spring therefore holds harder. Friction is ignored and the spring rate is assumed.",
  madeOf: ["wedge", "spring"],
  seenIn: ["Door latch", "Snap-fit", "Buckle"],
  sliders: [
    { id: "force", label: "Release force", min: 2, max: 20, step: 1, initial: 8, unit: " N" },
    { id: "door", label: "Door", min: -42, max: 0, step: 0.5, initial: -9, unit: " mm" },
  ],
  view: { elevation: 22, azimuth: 22 },
  build: ({ force = 8, door = -9 }) => {
    const e = boltExtension(door);
    const baseY = BOLT_BASE_Y - BOLT_TRAVEL + e;
    const bolt = pivoted(
      [
        [-BOLT_W / 2, -14],
        [BOLT_W / 2, -14],
        [BOLT_W / 2, 0],
        [HEAD_APEX, HEAD_RISE],
        [-BOLT_W / 2, 0],
      ],
      12,
      [0, 0],
      v3(door, baseY, -3),
      0,
    );
    const strike = pivoted(
      [
        [-STRIKE_HALF, 0],
        [-BOLT_W / 2, 0],
        [HEAD_APEX, HEAD_RISE],
        [BOLT_W / 2, 0],
        [STRIKE_HALF, 0],
        [STRIKE_HALF, 10],
        [-STRIKE_HALF, 10],
      ],
      12,
      [0, 0],
      v3(0, STRIKE_Y, -3),
      0,
    );
    return [
      part("track", "Track", "Carries the door and the strike wall.", box(130, 6, 46, 2), v3(-26, 3, -4), look.structure),
      part(
        "wall",
        "Strike wall",
        "Holds the strike plate up.",
        box(72, STRIKE_Y + 10 - 6, 6, 1),
        v3(0, 6 + (STRIKE_Y + 10 - 6) / 2, -12),
        look.light,
        on("track", "weld"),
      ),
      part(
        "strike",
        "Strike plate",
        "Has a notch cut to the bolt's shape for the bolt to spring into.",
        strike.shape,
        strike.position,
        look.steel,
        on("wall", "weld"),
      ),
      part("door", "Door", "Slides along the track and carries the latch.", box(52, 6, 18, 1), v3(door - 12, 9, -1), look.stone, on("track", "slide")),
      part("back", "Latch back", "Holds the latch's two sides together.", box(28, 24, 4, 1), v3(door, 24, -7), look.structure, on("door", "screw")),
      part("side-l", "Latch side", "Guides the bolt.", box(4, 24, 12, 1), v3(door - 10, 24, -3), look.structure, on("back", "weld")),
      part("side-r", "Latch side", "Guides the bolt.", box(4, 24, 12, 1), v3(door + 10, 24, -3), look.structure, on("back", "weld")),
      part("bolt", "Latch bolt", "A wedge: gentle face to close, steep face to hold.", bolt.shape, bolt.position, look.focus, on("back", "slide")),
      coilSpring(
        "spring",
        "Spring coil",
        "Pushes the bolt out.",
        [door, 12],
        [door, baseY - 14],
        -3,
        4.5,
        0.55 + force * 0.03,
        5,
        look.slate,
        on("bolt", "spring"),
      ),
    ];
  },
  readouts: ({ force = 8, door = -9 }) => {
    const e = boltExtension(door);
    const pushed = BOLT_TRAVEL - e;
    const peakOpen = (force + SPRING_RATE * HEAD_RISE) * Math.tan(TRAIL_DEG * RAD);
    const peakClose = (force + SPRING_RATE * HEAD_RISE) * Math.tan(LEAD_DEG * RAD);
    return [
      { label: "Release", value: `pull ${fmt(force * Math.tan(TRAIL_DEG * RAD))} N to start, ${fmt(peakOpen)} N at peak` },
      { label: "Closing", value: `${fmt(force * Math.tan(LEAD_DEG * RAD), 1)} to ${fmt(peakClose, 1)} N (gentler face)` },
      { label: "Now", value: e >= BOLT_TRAVEL - 0.01 ? "bolt out: latched or free" : `bolt pushed in ${fmt(pushed, 1)} mm` },
    ];
  },
};

const SEAT_R = 6.5;
const BALL_R = 9;
const SEAT_AREA = Math.PI * SEAT_R * SEAT_R;
const VALVE_RATE = 2;
const VALVE_STOP = 10;
const SEAT_TOP = 24;
const BALL_REST = SEAT_TOP + Math.sqrt(BALL_R * BALL_R - SEAT_R * SEAT_R);
const SPRING_FREE = 30;

/** Spring preload in N from the opening pressure in kPa: pressure x seat area (1 kPa on 1 mm^2 = 0.001 N). */
const preload = (kPa: number) => (kPa * SEAT_AREA) / 1000;
const valveLift = (openKPa: number, kPa: number) => clamp(((kPa - openKPa) * SEAT_AREA) / 1000 / VALVE_RATE, 0, VALVE_STOP);

const valve: Primitive = {
  id: "valve",
  name: "Valve",
  level: "Mechanism",
  job: "Let fluid through one way, or only when opened",
  howItWorks:
    "A check valve is a ball held on a hole by a spring. Pressure from below pushes on the ball over the area of the hole, a force of pressure times area. While that is less than the spring's preload the ball stays seated and nothing passes; above it, the ball lifts and fluid flows. Pressure from above only presses the ball harder onto its seat, so flow is allowed one way only. Pressure under the ball is taken as acting on the whole seat area, and friction is ignored.",
  madeOf: ["seal", "spring"],
  seenIn: ["Bike tyre", "Spray bottle", "Tap"],
  sliders: [
    { id: "open", label: "Opening pressure", min: 20, max: 160, step: 5, initial: 80, unit: " kPa" },
    { id: "pressure", label: "Pressure", min: 0, max: 250, step: 5, initial: 130, unit: " kPa" },
  ],
  view: { elevation: 12, azimuth: 22 },
  build: ({ open = 80, pressure = 130 }) => {
    const lift = valveLift(open, pressure);
    const ballY = BALL_REST + lift;
    const springLen = SPRING_FREE - preload(open) / VALVE_RATE;
    const springBottom = BALL_REST + BALL_R + 2 + lift;
    const topY = BALL_REST + BALL_R + 2 + springLen;
    const pipe = lathe([
      [SEAT_R, 0],
      [9.5, 0],
      [9.5, 20],
      [SEAT_R, 20],
      [SEAT_R, 0],
    ]);
    const seat = lathe([
      [SEAT_R, 0],
      [20, 0],
      [20, 4],
      [SEAT_R, 4],
      [SEAT_R, 0],
    ]);
    const ball = lathe(
      Array.from({ length: 19 }, (_, i): [number, number] => {
        const t = (i / 18) * Math.PI;
        return [BALL_R * Math.sin(t), -BALL_R * Math.cos(t)];
      }),
    );
    const seatCap = cylinder(5, 2.4);
    const rodAt = [
      [-15, -15],
      [15, -15],
      [-15, 15],
      [15, 15],
    ] as const;
    return [
      part("pipe", "Inlet pipe", "Brings the pressure up to the seat.", pipe.shape, v3(0, pipe.midY), look.structure),
      part(
        "seat",
        "Seat plate",
        "A plate with a round hole: the ball seals against its edge.",
        seat.shape,
        v3(0, 20 + seat.midY),
        look.stone,
        on("pipe", "weld"),
      ),
      part("ball", "Sealing ball", "Sits on the hole and blocks it until pressure lifts it.", ball.shape, v3(0, ballY), look.focus, on("seat", "slide")),
      part(
        "cap",
        "Spring seat",
        "Spreads the spring's push over the ball.",
        seatCap.shape,
        v3(0, springBottom - 2.4 + seatCap.midY),
        look.steel,
        on("ball", "glue"),
      ),
      ...rodAt.map(([x, z], i) => {
        const rod = cylinder(1.8, topY - SEAT_TOP);
        return part(
          `rod-${i + 1}`,
          "Guide rod",
          "Keeps the spring's top plate above the seat.",
          rod.shape,
          v3(x, SEAT_TOP + rod.midY, z),
          look.structure,
          on("seat", "weld"),
        );
      }),
      part("top", "Top plate", "The spring pushes up against it.", box(40, 4, 40, 1.5), v3(0, topY + 2, 0), look.structure, on("rod-1", "weld")),
      coilSpring("spring", "Spring coil", "Presses the ball down onto its seat.", [0, springBottom], [0, topY], 0, 6.5, 1, 6, look.slate, on("cap", "spring")),
    ];
  },
  readouts: ({ open = 80, pressure = 130 }) => {
    const f0 = preload(open);
    const f = (pressure * SEAT_AREA) / 1000;
    return [
      { label: "Spring", value: `${fmt(f0, 1)} N preload = ${fmt(open)} kPa × ${fmt(SEAT_AREA)} mm²` },
      { label: "Push on ball", value: `${fmt(f, 1)} N = ${fmt(pressure)} kPa × ${fmt(SEAT_AREA)} mm²` },
      {
        label: "State",
        value:
          pressure > open
            ? `open, ball lifted ${fmt(valveLift(open, pressure), 1)} mm (k ${VALVE_RATE} N/mm assumed)`
            : "closed: pressure below the opening pressure",
      },
    ];
  },
};

const AIR_KPA = 101.3;
const AIR_LEN = 60;
const PLATE_T = 6;
const HEAD_T = 8;

/** Plunger travel in mm: a push of `force` N on `areaMm2` adds force/area to the air, which Boyle's law squeezes. */
const plungerTravel = (force: number, areaMm2: number) => AIR_LEN * (1 - AIR_KPA / (AIR_KPA + (force / areaMm2) * 1000));

const piston: Primitive = {
  id: "piston",
  name: "Piston",
  level: "Mechanism",
  job: "Turn a push into pressure and back",
  howItWorks:
    "A piston is a seal sliding in a tube. Push on the plunger and the trapped fluid pushes back over the same area, so the pressure is the force divided by the area: the same push on half the area gives twice the pressure. Here the outlet is plugged, so the air is squeezed into less space; let go and it pushes the plunger back out. Real seals leak and rub, and the air warms as it is compressed; both are ignored, and the tube is drawn as an open cage so the seal stays visible.",
  madeOf: ["seal"],
  seenIn: ["Syringe", "Soap pump", "Bike pump"],
  sliders: [
    { id: "area", label: "Area", min: 4, max: 12, step: 0.5, initial: 8, unit: " cm²" },
    { id: "force", label: "Push", min: 0, max: 100, step: 1, initial: 50, unit: " N" },
  ],
  view: { elevation: 12, azimuth: 24 },
  build: ({ area = 8, force = 50 }) => {
    const A = area * 100;
    const R = Math.sqrt(A / Math.PI);
    const travel = plungerTravel(force, A);
    const headBottom = PLATE_T + AIR_LEN - travel;
    const headMid = headBottom + HEAD_T / 2;
    const topCollar = PLATE_T + AIR_LEN + HEAD_T + 6;
    const plate = cylinder(R + 6, PLATE_T);
    const head = cylinder(R - 3, HEAD_T);
    const collar = lathe([
      [4.2, 0],
      [R + 5, 0],
      [R + 5, 4],
      [4.2, 4],
      [4.2, 0],
    ]);
    const rodLen = 62;
    const rod = cylinder(4, rodLen);
    const bars = Array.from({ length: 6 }, (_, k) => {
      const a = (k * 60 + 30) * RAD;
      const b = cylinder(1.6, topCollar - PLATE_T);
      return part(
        `bar-${k + 1}`,
        "Cage bar",
        "One bar of the open tube, so the inside shows.",
        b.shape,
        v3((R + 1.6) * Math.cos(a), PLATE_T + b.midY, (R + 1.6) * Math.sin(a)),
        look.structure,
        on("plate", "weld"),
      );
    });
    const stub = cylinder(3.5, 7);
    return [
      part("plate", "Base plate", "Closes the bottom of the tube.", plate.shape, v3(0, plate.midY), look.structure),
      part("stub", "Plugged outlet", "Where the air would leave, shut here.", stub.shape, v3(0, PLATE_T + stub.midY), look.structure, on("plate", "weld")),
      ...bars,
      part(
        "collar",
        "Top collar",
        "Holds the cage's top and guides the plunger rod.",
        collar.shape,
        v3(0, topCollar + collar.midY),
        look.structure,
        on("bar-1", "weld"),
      ),
      part("head", "Plunger head", "Carries the seal and pushes on the air.", head.shape, v3(0, headBottom + head.midY), look.stone, on("rod", "weld")),
      part(
        "seal",
        "Seal ring",
        "Rubber ring that wipes the tube wall so nothing leaks past.",
        ring(R - 2, 2, 360),
        v3(0, headMid),
        look.focusRubber,
        on("head", "press-fit"),
      ),
      part("rod", "Plunger rod", "Carries your push down to the head.", rod.shape, v3(0, headBottom + HEAD_T + rod.midY), look.steel, on("collar", "slide")),
      part("handle", "Handle", "Where you push.", cylinder(15, 4).shape, v3(0, headBottom + HEAD_T + rodLen + 2), look.stone, on("rod", "weld")),
    ];
  },
  readouts: ({ area = 8, force = 50 }) => {
    const A = area * 100;
    const kPa = (force / A) * 1000;
    const travel = plungerTravel(force, A);
    return [
      { label: "Pressure", value: `${fmt(force)} N ÷ ${fmt(A)} mm² = ${fmt(kPa)} kPa above outside air` },
      { label: "Air squeezed", value: `to ${fmt((AIR_KPA / (AIR_KPA + kPa)) * 100)}% of its volume, plunger down ${fmt(travel, 1)} mm` },
      { label: "Model", value: "trapped air at constant temperature (Boyle); no friction" },
    ];
  },
};

export const MECHANISMS: Primitive[] = [gear, pulley, thread, cam, linkage, ratchet, catchLatch, valve, piston];
