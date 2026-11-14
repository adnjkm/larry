// The 8 elements: one piece, one job, one number, and it can't be made from the others.
// Every figure is a small physical rig. The pink part is the element itself; the rest of the rig
// only exists so the element has something to do. Forces are drawn as arrows at a fixed scale per figure.
import type { Joint, Part } from "../../shared/kit.ts";
import { DEG, RAD, bar, box, coil, cylinder, fmt, lathe, look, part, pivoted, polygon, ring, rotateAbout, v3, type Look, type Pt, type Vec } from "./parts.ts";
import type { Primitive } from "./types.ts";

/** Outline of a force arrow pointing along +x with its tail at the origin. Proportions shrink for very short arrows. */
function arrowOutline(length: number): Pt[] {
  const head = Math.min(9, length * 0.6);
  const shaft = Math.min(1.8, length * 0.15);
  const wing = Math.min(5, length * 0.4);
  return [[0, -shaft], [length - head, -shaft], [length - head, -wing], [length, 0], [length - head, wing], [length - head, shaft], [0, shaft]];
}

/** A force arrow: tail at `tail`, pointing along `angleDeg` (0 = +x, 90 = up, -90 = down), `length` mm long. */
function arrow(id: string, name: string, role: string, parentId: string, tail: Vec, angleDeg: number, length: number): Part {
  const a = pivoted(arrowOutline(Math.max(length, 0.5)), 4, [0, 0], tail, angleDeg);
  return part(id, name, role, a.shape, a.position, look.accent, { parentId, joint: "glue" }, a.rotation);
}

/** A straight strand from a to b anywhere in 3D: a square-section rounded box, a little longer than the gap so bends close up. */
function strand(a: Vec, b: Vec, thick: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dz = b.z - a.z;
  const len = Math.hypot(dx, dy, dz) || 1e-6;
  return {
    shape: box(len + thick * 0.8, thick, thick, thick / 2 - 0.01),
    position: v3((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2),
    // Euler XYZ with x = 0 is yaw (about y) applied after pitch (about z): lines the box's x axis up with the strand.
    rotation: v3(0, Math.atan2(-dz, dx) * DEG, Math.asin(Math.max(-1, Math.min(1, dy / len))) * DEG),
  };
}

function chain(prefix: string, name: string, role: string, points: Vec[], thick: number, appearance: Look, parentId: string, joint: Joint): Part[] {
  return points.slice(1).map((p, i) => {
    const s = strand(points[i] as Vec, p, thick);
    return part(`${prefix}-${i + 1}`, name, role, s.shape, s.position, appearance, { parentId, joint }, s.rotation);
  });
}

const BASE_T = 6;

const LEVER_SPAN = 150; // effort point to load point, mm
const LEVER_LOAD = 100; // N
const LEVER_ARROW = 0.45; // mm per N
const FULCRUM_H = 30;
const BAR_T = 8;
const BLOCK = 24;

function leverArms(ratio: number) {
  const aLoad = LEVER_SPAN / (1 + ratio);
  return { aLoad, aEff: LEVER_SPAN - aLoad };
}

const lever: Primitive = {
  id: "lever",
  name: "Lever",
  level: "Element",
  job: "Trade force for distance about a pivot",
  howItWorks:
    "A lever balances when force times distance from the pivot is equal on both sides. Put the load close to the pivot and your push far from it, and a small push holds a big load, but your end travels the same ratio further than the load does. Nothing is gained in work. Figures assume a weightless, rigid bar and a frictionless pivot.",
  madeOf: [],
  seenIn: ["Scissors", "Stapler", "Nail clipper"],
  sliders: [
    { id: "ratio", label: "Arm ratio", min: 1, max: 5, step: 0.1, initial: 3, unit: "×" },
    { id: "push", label: "Effort end down", min: -15, max: 15, step: 1, initial: 8, unit: " mm" },
  ],
  view: { elevation: 12, azimuth: 18 },
  build: ({ ratio = 3, push = 8 }) => {
    const { aLoad, aEff } = leverArms(ratio);
    // Tilt so the effort end sits `push` mm below level; the load end then sits push / ratio above it.
    const phi = Math.asin(push / aEff) * DEG;
    const px = -LEVER_SPAN / 2 + aEff;
    const pivot = v3(px, BASE_T + FULCRUM_H);
    const load = rotateAbout([aLoad, BAR_T + BLOCK / 2], phi, pivot);
    const effortTop = rotateAbout([-aEff, BAR_T], phi, pivot);
    const loadArrow = LEVER_LOAD * LEVER_ARROW;
    const effortArrow = (LEVER_LOAD / ratio) * LEVER_ARROW;
    return [
      part("base", "Base", "Holds the pivot.", box(190, BASE_T, 44, 1.5), v3(0, BASE_T / 2), look.structure),
      part("pivot", "Pivot", "A knife edge the bar rocks on.", { kind: "extrusion", outline: [{ x: -16, y: 0 }, { x: 16, y: 0 }, { x: 0, y: FULCRUM_H }], depth: 34 }, v3(px, BASE_T + FULCRUM_H / 2), look.structure, { parentId: "base", joint: "slide" }),
      part("bar", "Bar", "Carries your push on one side of the pivot and the load on the other.", box(aEff + aLoad + 24, BAR_T, 30, 1.5), rotateAbout([(aLoad - aEff) / 2, BAR_T / 2], phi, pivot), look.focus, { parentId: "pivot", joint: "hinge" }, v3(0, 0, phi)),
      part("load", "Load", "The weight being held up.", box(BLOCK, BLOCK - 2, BLOCK, 1.5), load, look.stone, { parentId: "bar", joint: "glue" }, v3(0, 0, phi)),
      arrow("load-arrow", "Load arrow", "The load's weight, pulling down.", "load", v3(load.x, load.y + BLOCK / 2 + 4 + loadArrow), -90, loadArrow),
      arrow("effort-arrow", "Effort arrow", "Your push, drawn to the same scale.", "bar", v3(effortTop.x, effortTop.y + 4 + effortArrow), -90, effortArrow),
    ];
  },
  readouts: ({ ratio = 3, push = 8 }) => {
    const { aLoad, aEff } = leverArms(ratio);
    const effort = (LEVER_LOAD * aLoad) / aEff;
    return [
      { label: "Push needed", value: `${LEVER_LOAD} N × ${fmt(aLoad)} ÷ ${fmt(aEff)} = ${fmt(effort)} N` },
      { label: "Arms", value: `yours ${fmt(aEff)} mm, load's ${fmt(aLoad)} mm` },
      { label: "Travel", value: `your end ${push >= 0 ? "down" : "up"} ${fmt(Math.abs(push))} mm, load ${push >= 0 ? "up" : "down"} ${fmt(Math.abs(push) / ratio, 1)} mm` },
    ];
  },
};

const WHEEL_AXLE_R = 8;
const WHEEL_Y = 88;
const WHEEL_Z = 34;
const WHEEL_DRUM_Z = -10;
const WHEEL_LOAD = 50; // N
const WHEEL_BLOCK = 22;
const CORD_THICK = 2.4;

const wheel: Primitive = {
  id: "wheel",
  name: "Wheel",
  level: "Element",
  job: "Trade force for distance in continuous rotation",
  howItWorks:
    "A wheel and axle is a lever that can turn without end. A force at the rim of the big wheel turns the small axle, and the cord wound on the axle pulls with a force bigger by the ratio of the radii, R ÷ r. The price is distance: the rim travels R ÷ r times further than the load rises. Friction in the bearings and the stiffness of the cord are left out.",
  madeOf: [],
  seenIn: ["Doorknob", "Screwdriver handle", "Tap"],
  sliders: [
    { id: "radius", label: "Wheel radius", min: 20, max: 44, step: 1, initial: 36, unit: " mm" },
    { id: "turn", label: "Turn", min: 0, max: 0.8, step: 0.01, initial: 0.3, unit: " turns" },
  ],
  view: { elevation: 12, azimuth: 36 },
  build: ({ radius = 36, turn = 0.3 }) => {
    const r = WHEEL_AXLE_R;
    const theta = turn * 360;
    const centre = v3(0, WHEEL_Y, WHEEL_Z);
    const rise = 2 * Math.PI * r * turn;
    const blockTop = BASE_T + WHEEL_BLOCK + rise;
    const cordX = r + CORD_THICK / 2;
    const post = (id: string, z: number) => part(id, "Bearing post", "Holds the axle and lets it turn.", box(16, WHEEL_Y + 10 - BASE_T, 8, 1.5), v3(0, BASE_T + (WHEEL_Y + 10 - BASE_T) / 2, z), look.structure, { parentId: "base", joint: "screw" });
    const spokes = Array.from({ length: 6 }, (_, k) => {
      const a = (theta + 60 * k) * RAD;
      const s = bar([6 * Math.cos(a), WHEEL_Y + 6 * Math.sin(a)], [radius * Math.cos(a), WHEEL_Y + radius * Math.sin(a)], 5, 5, WHEEL_Z);
      return part(`spoke-${k + 1}`, "Spoke", "Joins the rim to the hub.", s.shape, s.position, look.focus, { parentId: "hub", joint: "weld" }, s.rotation);
    });
    const a0 = theta * RAD;
    const handle = lathe([[0, 0], [3, 0], [3, 14], [5.5, 14], [5.5, 20], [0, 20]]);
    return [
      part("base", "Base", "Holds the posts and the load's resting place.", box(70, BASE_T, 56, 1.5), v3(0, BASE_T / 2, -10), look.structure),
      post("post-back", -30),
      post("post-front", 10),
      part("axle", "Axle", "The small wheel the cord winds onto.", cylinder(r, 71).shape, v3(0, WHEEL_Y, -1.5), look.steel, { parentId: "post-front", joint: "hinge" }, v3(90, 0, 0)),
      part("hub", "Hub", "Locks the wheel to the axle.", cylinder(7, 12).shape, v3(0, WHEEL_Y, WHEEL_Z), look.focus, { parentId: "axle", joint: "press-fit" }, v3(90, 0, 0)),
      part("rim", "Rim", "The big wheel's edge, where you push.", ring(radius, 3), centre, look.focus, { parentId: "hub", joint: "weld" }, v3(90, 0, 0)),
      ...spokes,
      part("handle", "Handle", "Where your hand turns the wheel.", handle.shape, v3(radius * Math.cos(a0), WHEEL_Y + radius * Math.sin(a0), WHEEL_Z + 8 + handle.midY), look.stone, { parentId: "rim", joint: "press-fit" }, v3(90, 0, 0)),
      part("coil", "Wound cord", "Cord wrapped on the axle.", ring(r + CORD_THICK / 2, CORD_THICK / 2), v3(0, WHEEL_Y, WHEEL_DRUM_Z), look.structure, { parentId: "axle", joint: "glue" }, v3(90, 0, 0)),
      part("cord", "Cord", "Hangs from the axle and lifts the load.", box(CORD_THICK, WHEEL_Y - blockTop, CORD_THICK, 1), v3(cordX, (WHEEL_Y + blockTop) / 2, WHEEL_DRUM_Z), look.structure, { parentId: "coil", joint: "glue" }),
      part("load", "Load", "The weight being lifted.", box(WHEEL_BLOCK, WHEEL_BLOCK, WHEEL_BLOCK, 1.5), v3(cordX, blockTop - WHEEL_BLOCK / 2, WHEEL_DRUM_Z), look.slate, { parentId: "cord", joint: "glue" }),
    ];
  },
  readouts: ({ radius = 36, turn = 0.3 }) => {
    const adv = radius / WHEEL_AXLE_R;
    const rim = 2 * Math.PI * radius * turn;
    const lift = 2 * Math.PI * WHEEL_AXLE_R * turn;
    return [
      { label: "Advantage", value: `R ÷ r = ${fmt(radius)} ÷ ${WHEEL_AXLE_R} = ${fmt(adv, 1)}×` },
      { label: "Pull at rim", value: `${WHEEL_LOAD} N ÷ ${fmt(adv, 1)} = ${fmt(WHEEL_LOAD / adv, 1)} N` },
      { label: "Travel", value: `rim ${fmt(rim)} mm, load up ${fmt(lift)} mm` },
    ];
  },
};

const WEDGE_FORCE = 100; // N
const WEDGE_H = 52;
const WEDGE_BLOCK_W = 40;
const WEDGE_BLOCK_H = 52;
const WEDGE_ARROW = 0.14; // mm per N

const wedge: Primitive = {
  id: "wedge",
  name: "Wedge",
  level: "Element",
  job: "Turn a push into a bigger sideways push",
  howItWorks:
    "A wedge turns a push along its length into pushes at right angles to its faces. With no friction and half-angle α, each side is pushed out with F ÷ (2·tan α), so a thinner wedge gives a bigger sideways push. The catch is distance: each side moves out only tan α times as far as the wedge goes in. In real life friction is what stops a doorstop popping back out, and it is left out here.",
  madeOf: [],
  seenIn: ["Knife", "Doorstop", "Zipper slider"],
  sliders: [
    { id: "slope", label: "Slope (half-angle)", min: 8, max: 35, step: 1, initial: 20, unit: "°" },
    { id: "push", label: "Push in", min: 0, max: 40, step: 1, initial: 24, unit: " mm" },
  ],
  view: { elevation: 14, azimuth: 18 },
  build: ({ slope = 20, push = 24 }) => {
    const t = Math.tan(slope * RAD);
    const half = push * t; // each block's inner face is this far from the centre line
    const edgeY = BASE_T + WEDGE_BLOCK_H; // height of the blocks' top inner edges, where the wedge touches
    const tipY = edgeY - push;
    const side = WEDGE_FORCE / (2 * t);
    const blockX = half + WEDGE_BLOCK_W / 2;
    const down = WEDGE_FORCE * WEDGE_ARROW;
    const out = side * WEDGE_ARROW;
    const block = (id: string, sign: number) =>
      part(id, "Block", "A slab that gets pushed aside.", box(WEDGE_BLOCK_W, WEDGE_BLOCK_H, 40, 1), v3(sign * blockX, BASE_T + WEDGE_BLOCK_H / 2), look.slate, { parentId: "base", joint: "slide" });
    return [
      part("base", "Base", "The table the blocks slide on.", box(200, BASE_T, 50, 1.5), v3(0, BASE_T / 2), look.structure),
      block("block-left", -1),
      block("block-right", 1),
      part("wedge", "Wedge", "Slides down between the blocks and pushes them apart.", { kind: "extrusion", outline: [{ x: 0, y: 0 }, { x: WEDGE_H * t, y: WEDGE_H }, { x: -WEDGE_H * t, y: WEDGE_H }], depth: 36 }, v3(0, tipY + WEDGE_H / 2), look.focus, { parentId: "base", joint: "slide" }),
      arrow("push-arrow", "Push arrow", "Your push on the wedge.", "wedge", v3(0, tipY + WEDGE_H + 4 + down), -90, down),
      arrow("out-arrow-right", "Sideways arrow", "The sideways push on the right block, same scale.", "block-right", v3(half + WEDGE_BLOCK_W + 3, BASE_T + WEDGE_BLOCK_H / 2), 0, out),
      arrow("out-arrow-left", "Sideways arrow", "The sideways push on the left block, same scale.", "block-left", v3(-(half + WEDGE_BLOCK_W + 3), BASE_T + WEDGE_BLOCK_H / 2), 180, out),
    ];
  },
  readouts: ({ slope = 20, push = 24 }) => {
    const t = Math.tan(slope * RAD);
    return [
      { label: "Each side", value: `${WEDGE_FORCE} ÷ (2 × tan ${fmt(slope)}°) = ${fmt(WEDGE_FORCE / (2 * t))} N` },
      { label: "Travel", value: `wedge in ${fmt(push)} mm, each block out ${fmt(push * t, 1)} mm` },
    ];
  },
};

const CORD_PEG_Y = 100;
const PEG_R = 6;
const CORD_D = 3.2;
const CORD_Z = -16;
const CORD_RC = PEG_R + CORD_D / 2; // radius the cord's centre line follows round the peg
const CORD_TOP = CORD_PEG_Y + CORD_RC;
const CORD_START = 55; // handle to peg when the hand has pulled 0
const CORD_ARROW = 0.5; // mm per N

const cordWeight = (tension: number) => 20 * Math.cbrt(tension / 10);

/** Points along a horizontal run from x0 to x1 at height y. With slack > 0 the extra cord hangs as a circular arc. */
function slackRun(x0: number, x1: number, y: number, slack: number, n: number): Pt[] {
  if (slack <= 0) return Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y]);
  const chord = x1 - x0;
  const target = chord / (chord + slack);
  let lo = 1e-6;
  let hi = Math.PI - 1e-6;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    if (Math.sin(mid) / mid > target) lo = mid;
    else hi = mid;
  }
  const th = (lo + hi) / 2;
  const R = (chord + slack) / (2 * th);
  return Array.from({ length: n + 1 }, (_, i) => {
    const a = -th + (2 * th * i) / n;
    return [(x0 + x1) / 2 + R * Math.sin(a), y + R * Math.cos(th) - R * Math.cos(a)];
  });
}

const cord: Primitive = {
  id: "cord",
  name: "Cord",
  level: "Element",
  job: "Carry a pull around corners (it can't push)",
  howItWorks:
    "A cord can only pull along its length: push on it and it goes slack. Because it bends, it can carry a pull round a corner, and with a smooth peg and no weight of its own the tension is the same everywhere along it. Here the tension equals the weight hanging from it. Friction on the peg would add to the pull you need; it is left out.",
  madeOf: [],
  seenIn: ["Shoelace", "Brake cable", "Tape measure"],
  sliders: [
    { id: "tension", label: "Tension", min: 10, max: 40, step: 1, initial: 25, unit: " N" },
    { id: "pull", label: "Hand pulls out", min: -20, max: 30, step: 1, initial: 12, unit: " mm" },
  ],
  view: { elevation: 10, azimuth: 24 },
  build: ({ tension = 25, pull = 12 }) => {
    const taut = pull >= 0;
    const slack = Math.max(0, -pull);
    const xh = -(CORD_START + pull);
    const e = cordWeight(tension);
    const weightTop = BASE_T + e + Math.max(0, pull);
    const run = slackRun(xh, -10, CORD_TOP, slack, 10);
    const wrap: Pt[] = Array.from({ length: 7 }, (_, i) => {
      const psi = (i / 6) * 90 * RAD;
      return [CORD_RC * Math.sin(psi), CORD_PEG_Y + CORD_RC * Math.cos(psi)];
    });
    const path = [...run, ...wrap, [CORD_RC, weightTop] as Pt].map(([x, y]) => v3(x, y, CORD_Z));
    const arrowLen = taut ? tension * CORD_ARROW : 0.5;
    return [
      part("floor", "Floor", "Where the weight rests.", box(70, BASE_T, 60, 1.5), v3(4, BASE_T / 2, -14), look.structure),
      part("post", "Post", "Holds the peg.", box(24, CORD_PEG_Y + 12 - BASE_T, 8, 1.5), v3(0, BASE_T + (CORD_PEG_Y + 12 - BASE_T) / 2, -32), look.structure, { parentId: "floor", joint: "screw" }),
      part("peg", "Peg", "The corner the cord bends round.", cylinder(PEG_R, 30).shape, v3(0, CORD_PEG_Y, -13), look.slate, { parentId: "post", joint: "press-fit" }, v3(90, 0, 0)),
      ...chain("cord", "Cord", "Carries the pull from the hand, round the peg, to the weight.", path, CORD_D, look.focus, "peg", "slide"),
      part("handle", "Handle", "Where the hand pulls.", ring(6, 1.6), v3(xh - 6, CORD_TOP, CORD_Z), look.steel, { parentId: "cord-1", joint: "glue" }, v3(90, 0, 0)),
      part("weight", "Weight", "The load the cord lifts.", box(e, e, Math.min(e, 20), 1.5), v3(CORD_RC, BASE_T + e / 2 + Math.max(0, pull), CORD_Z), look.stone, { parentId: "cord-18", joint: "glue" }),
      arrow("pull-arrow", "Pull arrow", "The pull on the hand's end.", "handle", v3(xh - 15, CORD_TOP, CORD_Z), 180, arrowLen),
      arrow("lift-arrow", "Lift arrow", "The cord's pull on the weight: the same size.", "weight", v3(CORD_RC + 7, weightTop, CORD_Z), 90, arrowLen),
    ];
  },
  readouts: ({ tension = 25, pull = 12 }) =>
    pull >= 0
      ? [
          { label: "Tension", value: `${fmt(tension)} N, the same at both ends` },
          { label: "Corner", value: "the pull changes direction, not size" },
          { label: "Travel", value: `hand out ${fmt(pull)} mm, weight up ${fmt(pull)} mm` },
        ]
      : [
          { label: "Tension", value: "0 N: the cord has gone slack" },
          { label: "Slack", value: `${fmt(-pull)} mm of spare cord` },
          { label: "Weight", value: "stays put: a cord can't push" },
        ],
};

const SPRING_FREE = 80;
const SPRING_R = 16;
const SPRING_TURNS = 7;
const SPRING_ARROW = 0.6; // mm per N

/** Wire diameter: for a fixed coil, stiffness goes with the fourth power of the wire diameter. */
const springWire = (k: number) => 3 * Math.pow(k, 0.25);

const spring: Primitive = {
  id: "spring",
  name: "Spring",
  level: "Element",
  job: "Store work and give it back",
  howItWorks:
    "Squeezing a coil spring twists its wire, and the wire pushes back. Within its working range the push grows in step with the squeeze: F = k·x (Hooke's law), so the energy stored is ½·F·x, and all of it comes back when you let go. A stiffer spring (bigger k) has thicker wire, a narrower coil or fewer turns. The spring's own mass is ignored, and the force is assumed to stay in its working range.",
  madeOf: [],
  seenIn: ["Pen", "Stapler", "Clothes peg"],
  sliders: [
    { id: "stiffness", label: "Stiffness", min: 1, max: 4, step: 0.1, initial: 2, unit: " N/mm" },
    { id: "force", label: "Push", min: 0, max: 50, step: 1, initial: 30, unit: " N" },
  ],
  view: { elevation: 12, azimuth: 26 },
  build: ({ stiffness = 2, force = 30 }) => {
    const d = springWire(stiffness);
    const len = SPRING_FREE - force / stiffness;
    const disc = cylinder(26, BASE_T);
    const plateTop = BASE_T + len + BASE_T;
    const pushArrow = force * SPRING_ARROW;
    return [
      part("base", "Base", "The spring rests on it.", disc.shape, v3(0, disc.midY), look.structure),
      part("coil", "Coil", "The spring's wire, wound into a helix.", coil(SPRING_R, d / 2, len, SPRING_TURNS), v3(0, BASE_T + len / 2), look.focusMetal, { parentId: "base", joint: "spring" }),
      part("plate", "Plate", "What the push acts on.", disc.shape, v3(0, BASE_T + len + disc.midY), look.slate, { parentId: "coil", joint: "weld" }),
      arrow("push-arrow", "Push arrow", "The push on the plate.", "plate", v3(0, plateTop + 4 + pushArrow, 0), -90, pushArrow),
    ];
  },
  readouts: ({ stiffness = 2, force = 30 }) => {
    const x = force / stiffness;
    return [
      { label: "Squeeze", value: `x = F ÷ k = ${fmt(force)} ÷ ${fmt(stiffness, 1)} = ${fmt(x, 1)} mm` },
      { label: "Length", value: `${fmt(SPRING_FREE - x, 1)} of ${SPRING_FREE} mm` },
      { label: "Energy stored", value: `½ × F × x = ${fmt(0.5 * force * (x / 1000), 3)} J` },
    ];
  },
};

const G = 9.8;
const PENDULUM_STRING = 95;
const PENDULUM_Y = 160; // underside of the arm, where the pivot is
const PIN_R = 4;
const WEIGHT_ARROW = 0.6; // mm per N
const REAL_STRING = 0.5; // m, for the swing-time readout

const bobRadius = (mass: number) => 10 * Math.cbrt(mass);

const weight: Primitive = {
  id: "weight",
  name: "Weight",
  level: "Element",
  job: "Be pulled by gravity and resist changes in motion",
  howItWorks:
    "Gravity pulls every mass with a weight W = m·g, where g is about 9.8 m/s² near the ground. The same mass also resists changes in motion, which is why a heavy hammer head keeps going once swung. On a pendulum the two cancel exactly: a heavier bob is pulled harder but is harder to speed up, so the swing time depends on the string length and not on the mass. Air drag, the string's mass and big swings (which run slightly slower) are left out.",
  madeOf: [],
  seenIn: ["Hammer", "Pendulum", "Flywheel"],
  sliders: [
    { id: "mass", label: "Mass", min: 1, max: 5, step: 0.1, initial: 2, unit: " kg" },
    { id: "swing", label: "Swing angle", min: -40, max: 40, step: 1, initial: -28, unit: "°" },
  ],
  view: { elevation: 8, azimuth: 22 },
  build: ({ mass = 2, swing = -28 }) => {
    const rb = bobRadius(mass);
    const a = swing * RAD;
    const pin = v3(0, PENDULUM_Y - PIN_R);
    const centre = v3(pin.x + PENDULUM_STRING * Math.sin(a), pin.y - PENDULUM_STRING * Math.cos(a));
    const sphere = lathe(Array.from({ length: 13 }, (_, i): Pt => {
      const t = ((i / 12) * 180 - 90) * RAD;
      return [rb * Math.cos(t), rb * Math.sin(t)];
    }));
    const s = bar([pin.x, pin.y], [centre.x, centre.y], 2.4, 2.4, 0);
    const arrowLen = mass * G * WEIGHT_ARROW;
    return [
      part("base", "Base", "Keeps the stand upright.", box(130, BASE_T, 90, 1.5), v3(0, BASE_T / 2, -24), look.structure),
      part("post", "Post", "Holds the arm up.", box(10, PENDULUM_Y + 8 - BASE_T, 10, 1), v3(0, BASE_T + (PENDULUM_Y + 8 - BASE_T) / 2, -48), look.structure, { parentId: "base", joint: "screw" }),
      part("arm", "Arm", "Reaches out so the bob can swing clear of the post.", box(10, 8, 62, 1), v3(0, PENDULUM_Y + 4, -22), look.structure, { parentId: "post", joint: "weld" }),
      part("pin", "Pivot pin", "What the string swings from.", cylinder(PIN_R, 12).shape, v3(0, pin.y, 0), look.slate, { parentId: "arm", joint: "rivet" }, v3(90, 0, 0)),
      part("string", "String", "Lets the bob swing and carries its pull to the pivot.", s.shape, s.position, look.structure, { parentId: "pin", joint: "hinge" }, s.rotation),
      part("bob", "Bob", "The mass: pulled down by gravity, slow to change speed.", sphere.shape, v3(centre.x, centre.y + sphere.midY), look.focus, { parentId: "string", joint: "glue" }),
      arrow("weight-arrow", "Weight arrow", "Gravity's pull, straight down.", "bob", v3(centre.x, centre.y - rb - 3, 0), -90, arrowLen),
    ];
  },
  readouts: ({ mass = 2, swing = -28 }) => {
    const w = mass * G;
    const period = 2 * Math.PI * Math.sqrt(REAL_STRING / G);
    return [
      { label: "Weight", value: `m × g = ${fmt(mass, 1)} kg × 9.8 = ${fmt(w, 1)} N` },
      { label: "Along the swing", value: `W × sin ${fmt(Math.abs(swing))}° = ${fmt(w * Math.sin(Math.abs(swing) * RAD), 1)} N` },
      { label: "Swing time", value: `${fmt(period, 2)} s on a ${REAL_STRING} m string, any mass` },
    ];
  },
};

const MU = 0.4; // assumed friction coefficient
const GRIP_ARROW = 0.6; // mm per N
const GRIP_ROD_R = 7;
const GRIP_ROD_BOTTOM = 60;
const GRIP_SLIP = 18;
const GRIP_PAD_Y = 118;

const gripBlock = (load: number) => 8 * Math.cbrt(load);

const grip: Primitive = {
  id: "grip",
  name: "Grip",
  level: "Element",
  job: "Hold by friction up to a limit, then slip",
  howItWorks:
    "Two surfaces pressed together resist sliding with a friction force up to μ times the force pressing them together. Below that limit the grip holds exactly as hard as the load needs; above it, the rod slips. Here two pads press with the same force each, so the limit is μ × 2N, with μ = 0.4 assumed (it depends on the surfaces). Squeezing harder raises the limit. Sliding friction is usually a little lower than this limit and is not modelled; the slipping pose is a snapshot partway down.",
  madeOf: [],
  seenIn: ["Brake pad", "Press-fit lid", "Knot"],
  sliders: [
    { id: "squeeze", label: "Squeeze (each pad)", min: 10, max: 60, step: 1, initial: 40, unit: " N" },
    { id: "load", label: "Load", min: 5, max: 60, step: 1, initial: 20, unit: " N" },
  ],
  view: { elevation: 10, azimuth: 24 },
  build: ({ squeeze = 40, load = 20 }) => {
    const slip = load > MU * 2 * squeeze ? GRIP_SLIP : 0;
    const bottom = GRIP_ROD_BOTTOM - slip;
    const rod = cylinder(GRIP_ROD_R, 86);
    const e = gripBlock(load);
    const sq = squeeze * GRIP_ARROW;
    const pad = (id: string, sign: number, parentId: string) =>
      part(id, "Pad", "Rubber that presses on the rod.", box(6, 36, 26, 1), v3(sign * (GRIP_ROD_R + 3), GRIP_PAD_Y), look.focusRubber, { parentId, joint: "glue" });
    const leg = (id: string, sign: number) => part(id, "Jaw", "Carries the squeeze to the pad.", box(8, 52, 30, 1), v3(sign * 17, 124), look.structure, { parentId: "header", joint: "weld" });
    return [
      part("base", "Base", "Keeps the stand upright.", box(76, BASE_T, 60, 1.5), v3(0, BASE_T / 2, -12), look.structure),
      part("post", "Post", "Holds the clamp up.", box(10, 154, 10, 1), v3(0, BASE_T + 77, -30), look.structure, { parentId: "base", joint: "screw" }),
      part("header", "Clamp frame", "Joins the two jaws.", box(70, 10, 54, 1), v3(0, 155, -9), look.structure, { parentId: "post", joint: "weld" }),
      leg("jaw-left", -1),
      leg("jaw-right", 1),
      pad("pad-left", -1, "jaw-left"),
      pad("pad-right", 1, "jaw-right"),
      part("rod", "Rod", "The part being held.", rod.shape, v3(0, bottom + rod.midY), look.stone, { parentId: "pad-left", joint: "press-fit" }),
      part("load", "Load", "Hangs from the rod and pulls it down.", box(e, e, Math.min(e, 24), 1.5), v3(0, bottom - e / 2), look.slate, { parentId: "rod", joint: "glue" }),
      arrow("squeeze-left", "Squeeze arrow", "The squeeze on the left pad.", "jaw-left", v3(-22.5 - sq, GRIP_PAD_Y), 0, sq),
      arrow("squeeze-right", "Squeeze arrow", "The squeeze on the right pad.", "jaw-right", v3(22.5 + sq, GRIP_PAD_Y), 180, sq),
    ];
  },
  readouts: ({ squeeze = 40, load = 20 }) => {
    const limit = MU * 2 * squeeze;
    return [
      { label: "Squeeze", value: `2 pads × ${fmt(squeeze)} N = ${fmt(2 * squeeze)} N` },
      { label: "Friction limit", value: `μ × ${fmt(2 * squeeze)} = ${fmt(limit)} N (μ = ${MU}, assumed)` },
      { label: "Load", value: load > limit ? `${fmt(load)} N is over the limit: it slips` : `${fmt(load)} N is under the limit: it holds` },
    ];
  },
};

const SEAL_T0 = 12; // gasket thickness before squeezing
const SEAL_PIPE = 30;
const SEAL_FLANGE = 12;
const SEAL_BORE = 18;
const SEAL_PIPE_R = 26;
const SEAL_OUTER = 52;

const seal: Primitive = {
  id: "seal",
  name: "Seal",
  level: "Element",
  job: "Block a gap so nothing leaks",
  howItWorks:
    "Two hard surfaces never touch everywhere: up close they are hills and valleys, and a liquid finds the valleys. A rubber gasket clamped between them is squeezed into those gaps and pushes back on both faces, closing the path. The squeeze is the thickness lost divided by the thickness it started with. Too little and gaps stay open; too much and the rubber is crushed or forced out of the joint. Static seals are typically squeezed roughly 15 to 30 percent.",
  madeOf: [],
  seenIn: ["Bottle cap", "Jar lid", "Tap washer"],
  sliders: [{ id: "squeeze", label: "Squeeze", min: 0, max: 0.4, step: 0.01, initial: 0.2, unit: "%", displayScale: 100 }],
  view: { elevation: 14, azimuth: 26 },
  build: ({ squeeze = 0.2 }) => {
    const t = SEAL_T0 * (1 - squeeze);
    const faceY = SEAL_PIPE + SEAL_FLANGE;
    const lower = lathe([[SEAL_BORE, 0], [SEAL_PIPE_R, 0], [SEAL_PIPE_R, SEAL_PIPE], [SEAL_OUTER, SEAL_PIPE], [SEAL_OUTER, faceY], [SEAL_BORE, faceY], [SEAL_BORE, 0]]);
    const upper = lathe([[SEAL_BORE, 0], [SEAL_OUTER, 0], [SEAL_OUTER, SEAL_FLANGE], [SEAL_PIPE_R, SEAL_FLANGE], [SEAL_PIPE_R, faceY], [SEAL_BORE, faceY], [SEAL_BORE, 0]]);
    // The squeezed rubber has nowhere to go but sideways, so its free edge bulges.
    const bulge = 7 * squeeze;
    const edge = 50.5;
    const gasket = lathe([
      [SEAL_BORE, 0],
      [edge, 0],
      ...[0.25, 0.5, 0.75].map((u): Pt => [edge + bulge * Math.sin(Math.PI * u), t * u]),
      [edge, t],
      [SEAL_BORE, t],
      [SEAL_BORE, 0],
    ]);
    const studs = [45, 135, 225, 315].map((deg) => v3(40 * Math.cos(deg * RAD), 0, 40 * Math.sin(deg * RAD)));
    const topFace = faceY + t + SEAL_FLANGE;
    const stud = cylinder(2.8, 34);
    const parts: Part[] = [
      part("flange-lower", "Lower flange", "Pipe end with a flat face.", lower.shape, v3(0, lower.midY), look.structure),
      part("gasket", "Gasket", "Soft rubber ring that fills the gaps between the faces.", gasket.shape, v3(0, faceY + gasket.midY), look.focus, { parentId: "flange-lower", joint: "press-fit" }),
      part("flange-upper", "Upper flange", "The other pipe end, pulled down to squeeze the gasket.", upper.shape, v3(0, faceY + t + upper.midY), look.slate, { parentId: "flange-lower", joint: "screw" }),
    ];
    studs.forEach((p, i) => {
      parts.push(part(`stud-${i + 1}`, "Stud", "A bolt that pulls the flanges together.", stud.shape, v3(p.x, faceY + stud.midY, p.z), look.structure, { parentId: "flange-lower", joint: "thread" }));
      parts.push(part(`nut-${i + 1}`, "Nut", "Tightening it lowers the upper flange.", { kind: "extrusion", outline: polygon(6, 5.2).map(([x, y]) => ({ x, y })), depth: 5 }, v3(p.x, topFace + 2.5, p.z), look.steel, { parentId: "flange-upper", joint: "thread" }, v3(90, 0, 0)));
    });
    return parts;
  },
  readouts: ({ squeeze = 0.2 }) => [
    { label: "Squeeze", value: `${fmt(squeeze * 100)}% (typical: 15–30%)` },
    { label: "Gasket", value: `${fmt(SEAL_T0, 1)} mm squeezed to ${fmt(SEAL_T0 * (1 - squeeze), 1)} mm` },
    { label: "Result", value: squeeze < 0.15 ? "gaps may stay open" : squeeze <= 0.3 ? "fills the gaps" : "too much: the rubber is crushed" },
  ],
};

export const ELEMENTS: Primitive[] = [lever, wheel, wedge, cord, spring, weight, grip, seal];
