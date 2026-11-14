// The primitives library: the machine ideas everyday objects are built from, each as a small
// parametric kit. A primitive's parts use the same shapes as a scanned kit (lathe, box, torus,
// extrusion), so they render through KitViewer and the dither shader with nothing extra.
// Units are millimetres, y up, resting on y = 0. Orange marks the part the primitive is about.
import type { Finish, Joint, Part, Shape } from "../../shared/kit.ts";

export type Slider = {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  /** Shown after the value. */
  unit?: string;
  /** Multiplies the value for display, e.g. 100 to show a fraction as a percentage. */
  displayScale?: number;
};

export type Values = Record<string, number>;
export type Readout = { label: string; value: string };

export type PrimitiveKind = "Simple machine" | "Mechanism" | "Joint" | "Shape";

export type Primitive = {
  id: string;
  name: string;
  kind: PrimitiveKind;
  /** One sentence: the idea in plain words. */
  idea: string;
  /** A short paragraph of how it works, for curious adults. Physics claims here are checked by hand. */
  howItWorks: string;
  /** Other primitives this one is made from. */
  buildsOn: string[];
  foundIn: string[];
  sliders: Slider[];
  view: { elevation: number; azimuth: number };
  build: (v: Values) => Part[];
  readouts: (v: Values) => Readout[];
};

// ---------------------------------------------------------------------------------------------
// Building blocks

const COLOR = {
  focus: "#ff5a1f",
  steel: "#aeb3b9",
  plastic: "#e4e1da",
  dark: "#2b2b2b",
  graphite: "#6b6b6b",
} as const;

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

type Look = { color: string; finish: Finish };
const look = {
  focus: { color: COLOR.focus, finish: "matte" },
  focusRubber: { color: COLOR.focus, finish: "rubber" },
  steel: { color: COLOR.steel, finish: "metal" },
  plastic: { color: COLOR.plastic, finish: "matte" },
  dark: { color: COLOR.dark, finish: "matte" },
} satisfies Record<string, Look>;

type Vec = { x: number; y: number; z: number };
const v3 = (x: number, y: number, z = 0): Vec => ({ x, y, z });
const ZERO = v3(0, 0, 0);

function part(
  id: string,
  name: string,
  role: string,
  shape: Shape,
  position: Vec,
  appearance: Look,
  attach: { parentId: string; joint: Joint } | null = null,
  rotation: Vec = ZERO,
): Part {
  return {
    id,
    name,
    role,
    parentId: attach?.parentId ?? null,
    joint: attach?.joint ?? null,
    shape,
    position,
    rotation,
    ...appearance,
  };
}

/** A lathe shape from [r, y] points, plus the centre y its geometry is drawn around (the bounding-box middle). */
function lathe(points: [number, number][]): { shape: Shape; midY: number } {
  const ys = points.map(([, y]) => y);
  return {
    shape: { kind: "lathe", profile: points.map(([r, y]) => ({ r, y })) },
    midY: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

/** A solid cylinder standing on y = 0. */
const cylinder = (r: number, h: number) => lathe([[0, 0], [r, 0], [r, h], [0, h]]);

type Pt = [number, number];

/**
 * Places an extrusion that turns about a pivot. The viewer recentres an extrusion on its bounding box
 * and rotates it about that centre, so the position has to carry the pivot-to-centre offset, rotated.
 */
function pivoted(outline: Pt[], depth: number, pivotLocal: Pt, pivotWorld: Vec, angleDeg: number) {
  const xs = outline.map(([x]) => x);
  const ys = outline.map(([, y]) => y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2 - pivotLocal[0];
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2 - pivotLocal[1];
  const a = angleDeg * RAD;
  return {
    shape: { kind: "extrusion", outline: outline.map(([x, y]) => ({ x, y })), depth } satisfies Shape,
    position: v3(pivotWorld.x + cx * Math.cos(a) - cy * Math.sin(a), pivotWorld.y + cx * Math.sin(a) + cy * Math.cos(a), pivotWorld.z),
    rotation: v3(0, 0, angleDeg),
  };
}

/** A box rotated about z by `angleDeg`, positioned by a point in its own frame (relative to `pivotWorld`). */
function rotatedBox(local: Pt, angleDeg: number, pivotWorld: Vec): Vec {
  const a = angleDeg * RAD;
  return v3(pivotWorld.x + local[0] * Math.cos(a) - local[1] * Math.sin(a), pivotWorld.y + local[0] * Math.sin(a) + local[1] * Math.cos(a), pivotWorld.z);
}

const box = (width: number, height: number, depth: number, cornerRadius = 0): Shape => ({ kind: "box", width, height, depth, cornerRadius });

const fmt = (n: number, digits = 0) => n.toFixed(digits);

// ---------------------------------------------------------------------------------------------
// Gear and wheel outlines

function gearOutline(teeth: number, module: number): Pt[] {
  const pitchR = (module * teeth) / 2;
  const tipR = pitchR + module;
  const rootR = pitchR - 1.25 * module;
  const step = (2 * Math.PI) / teeth;
  const pts: Pt[] = [];
  for (let k = 0; k < teeth; k++) {
    const a = k * step;
    const at = (r: number, f: number): Pt => [r * Math.cos(a + f * step), r * Math.sin(a + f * step)];
    pts.push(at(rootR, -0.5), at(rootR, -0.24), at(tipR, -0.12), at(tipR, 0.12), at(rootR, 0.24));
  }
  return pts;
}

/** A sawtooth wheel: each tooth ramps up from the root to the tip, then drops straight back. */
function ratchetOutline(teeth: number, rootR: number, tipR: number): Pt[] {
  const step = (2 * Math.PI) / teeth;
  const pts: Pt[] = [];
  for (let k = 0; k < teeth; k++) {
    const a = k * step;
    for (let s = 0; s <= 4; s++) {
      const f = s / 4;
      const r = rootR + (tipR - rootR) * f;
      pts.push([r * Math.cos(a + f * step * 0.96), r * Math.sin(a + f * step * 0.96)]);
    }
  }
  return pts;
}

/** Radius of the ratchet wheel's surface at angle `a` (radians, in the wheel's own frame). */
function ratchetRadius(a: number, teeth: number, rootR: number, tipR: number): number {
  const step = (2 * Math.PI) / teeth;
  const f = (((a % step) + step) % step) / step;
  return rootR + (tipR - rootR) * Math.min(1, f / 0.96);
}

const camRadius = (a: number) => 20 + 14 * Math.max(0, Math.cos(a)) ** 2;

// ---------------------------------------------------------------------------------------------
// The library, in the order it is best learnt: simple machines, then what they become.

const ramp: Primitive = {
  id: "ramp",
  name: "Ramp",
  kind: "Simple machine",
  idea: "A slope trades distance for force: push further, push less.",
  howItWorks:
    "Lifting a block straight up takes its full weight. Sliding it up a slope only has to fight the part of its weight that points down the slope, which is the weight times the sine of the angle. The catch is distance: the shallower the slope, the longer the path to the same height. Friction adds to this in real life; the numbers here leave it out.",
  buildsOn: [],
  foundIn: ["Wheelchair ramps", "Axe and knife blades", "Screw threads", "Zipper sliders"],
  sliders: [
    { id: "angle", label: "Steepness", min: 10, max: 45, step: 1, initial: 22, unit: "°" },
    { id: "slide", label: "Push up", min: 0, max: 1, step: 0.01, initial: 0.35, unit: "%", displayScale: 100 },
  ],
  view: { elevation: 14, azimuth: 28 },
  build: ({ angle = 22, slide = 0.35 }) => {
    const L = 120;
    const t = angle * RAD;
    const h = L * Math.tan(t);
    const slopeLen = Math.hypot(L, h);
    const s = 16 + slide * (slopeLen - 32);
    const base: Vec = v3(-L / 2 + s * Math.cos(t), s * Math.sin(t));
    const block = rotatedBox([0, 13], angle, base);
    return [
      part("ramp", "Ramp", "A slope the block is pushed up.", { kind: "extrusion", outline: [{ x: -L / 2, y: 0 }, { x: L / 2, y: 0 }, { x: L / 2, y: h }], depth: 50 }, v3(0, h / 2), look.plastic),
      part("block", "Block", "The load being raised.", box(26, 26, 30, 1.5), block, look.focus, { parentId: "ramp", joint: "slide" }, v3(0, 0, angle)),
    ];
  },
  readouts: ({ angle = 22 }) => [
    { label: "Push needed", value: `${fmt(Math.sin(angle * RAD) * 100)}% of the weight` },
    { label: "Distance", value: `${fmt(1 / Math.sin(angle * RAD), 1)}× the height gained` },
  ],
};

const lever: Primitive = {
  id: "lever",
  name: "Lever",
  kind: "Simple machine",
  idea: "A bar on a pivot: the longer your side, the less you push.",
  howItWorks:
    "A lever balances when the force on each side times its distance from the pivot is equal. Move the pivot toward the load and your side gets longer, so a smaller push lifts the same weight, but your end has to travel further. Scissors, pliers and bottle openers all choose where to put the pivot.",
  buildsOn: [],
  foundIn: ["Scissors", "Pliers", "Bottle openers", "Stapler arms", "Seesaws"],
  sliders: [
    { id: "pivot", label: "Pivot", min: 0.15, max: 0.8, step: 0.01, initial: 0.3, unit: "%", displayScale: 100 },
    { id: "push", label: "Push", min: -1, max: 1, step: 0.01, initial: 0.4, unit: "", displayScale: 1 },
  ],
  view: { elevation: 12, azimuth: 24 },
  build: ({ pivot = 0.3, push = 0.4 }) => {
    const half = 80;
    const fx = -half + pivot * 2 * half;
    const pivotWorld = v3(fx, 30);
    const tilt = -push * 11;
    return [
      part("fulcrum", "Pivot", "The point the bar turns on.", { kind: "extrusion", outline: [{ x: -16, y: 0 }, { x: 16, y: 0 }, { x: 0, y: 30 }], depth: 34 }, v3(fx, 15), look.dark),
      part("bar", "Bar", "Carries the load on one end and your push on the other.", box(2 * half, 6, 30, 1), rotatedBox([-fx, 3], tilt, pivotWorld), look.focus, { parentId: "fulcrum", joint: "hinge" }, v3(0, 0, tilt)),
      part("load", "Load", "The weight being lifted.", box(26, 26, 26, 2), rotatedBox([-half + 13 - fx, 19], tilt, pivotWorld), look.steel, { parentId: "bar", joint: "glue" }, v3(0, 0, tilt)),
    ];
  },
  readouts: ({ pivot = 0.3 }) => {
    const fx = -80 + pivot * 160;
    const loadArm = fx - -67;
    const effortArm = 80 - fx;
    return [
      { label: "Arms", value: `load ${fmt(loadArm)} mm · yours ${fmt(effortArm)} mm` },
      { label: "Push needed", value: `${fmt((loadArm / effortArm) * 100)}% of the load` },
    ];
  },
};

const THREAD_TRAVEL = 22;
const CAP_RADIUS = 18;

const thread: Primitive = {
  id: "thread",
  name: "Screw thread",
  kind: "Mechanism",
  idea: "A ramp wrapped around a tube: each turn slides the lid down the slope.",
  howItWorks:
    "Unroll a thread and it is a long, shallow ramp. Turning the cap pushes it along that ramp, so a turn of the hand becomes a small, strong move along the axis. The pitch is how far the cap moves in one turn: a fine pitch takes more turns but squeezes harder for the same twist. Ignoring friction, the advantage is the circumference you turn divided by the pitch; in reality friction eats a large share of it, which is also what stops the cap undoing itself.",
  buildsOn: ["ramp"],
  foundIn: ["Bottle caps", "Jar lids", "Bolts and nuts", "Light bulbs", "Pen barrels"],
  sliders: [
    { id: "pitch", label: "Pitch", min: 2, max: 8, step: 0.5, initial: 4, unit: " mm" },
    { id: "screw", label: "Screw on", min: 0, max: 1, step: 0.01, initial: 0.12, unit: "%", displayScale: 100 },
  ],
  view: { elevation: 18, azimuth: 30 },
  build: ({ pitch = 4, screw = 0.12 }) => {
    const pts: [number, number][] = [[11, 0], [14, 0], [14, 4]];
    for (let y = 4, out = true; y + pitch / 2 <= 28; y += pitch / 2, out = !out) pts.push([out ? 15.8 : 14, y + pitch / 2]);
    pts.push([14, 30], [11, 30], [11, 0]);
    const neck = lathe(pts);
    const cap = lathe([[16, 0], [CAP_RADIUS, 0], [CAP_RADIUS, 26], [0, 26], [0, 23], [16, 23], [16, 0]]);
    const travel = screw * THREAD_TRAVEL;
    const capBase = 7 + (THREAD_TRAVEL - travel);
    const turn = -(travel / pitch) * 360;
    const a = turn * RAD;
    return [
      part("neck", "Threaded neck", "The outside thread the cap screws onto.", neck.shape, v3(0, neck.midY), look.focus),
      part("cap", "Cap", "Has the matching inside thread, so turning it pulls it down.", cap.shape, v3(0, capBase + cap.midY), look.plastic, { parentId: "neck", joint: "thread" }, v3(0, turn, 0)),
      part("grip", "Grip mark", "A ridge on the cap, so you can see it turn.", box(4, 18, 6, 1), v3((CAP_RADIUS + 1) * Math.cos(a), capBase + 13, -(CAP_RADIUS + 1) * Math.sin(a)), look.dark, { parentId: "cap", joint: "molded" }, v3(0, turn, 0)),
    ];
  },
  readouts: ({ pitch = 4, screw = 0.12 }) => [
    { label: "Turns", value: `${fmt((screw * THREAD_TRAVEL) / pitch, 1)} of ${fmt(THREAD_TRAVEL / pitch, 1)} to close` },
    { label: "Advantage", value: `about ${fmt((2 * Math.PI * CAP_RADIUS) / pitch)}× before friction` },
  ],
};

const GEAR_MODULE = 3;
const BIG_TEETH = 24;

const gears: Primitive = {
  id: "gears",
  name: "Gears",
  kind: "Mechanism",
  idea: "Two wheels with teeth: trade speed for turning force, or the other way round.",
  howItWorks:
    "Meshed teeth can't slip, so both gears move the same number of teeth past the contact point. A gear with twice the teeth therefore turns half as fast, and, because energy is conserved, with about twice the turning force. Gears also reverse the direction of turn, which is why gear trains often use three.",
  buildsOn: ["lever"],
  foundIn: ["Clocks and watches", "Hand drills", "Kitchen mixers", "Car window motors", "Fishing reels"],
  sliders: [
    { id: "teeth", label: "Small gear", min: 8, max: 20, step: 1, initial: 12, unit: " teeth" },
    { id: "turn", label: "Turn", min: 0, max: 1, step: 0.005, initial: 0.1, unit: " turns", displayScale: 1 },
  ],
  view: { elevation: 10, azimuth: 18 },
  build: ({ teeth = 12, turn = 0.1 }) => {
    const z1 = Math.round(teeth);
    const r1 = (GEAR_MODULE * z1) / 2;
    const r2 = (GEAR_MODULE * BIG_TEETH) / 2;
    const tipBig = r2 + GEAR_MODULE;
    const axisY = tipBig + 10;
    const x1 = -(r1 + r2) / 2;
    const x2 = (r1 + r2) / 2;
    const theta = turn * 360;
    const rot1 = theta;
    const rot2 = 180 + 180 / BIG_TEETH - theta * (z1 / BIG_TEETH);
    const g1 = pivoted(gearOutline(z1, GEAR_MODULE), 8, [0, 0], v3(x1, axisY, -4), rot1);
    const g2 = pivoted(gearOutline(BIG_TEETH, GEAR_MODULE), 8, [0, 0], v3(x2, axisY, -4), rot2);
    const axle = cylinder(3, 34);
    const width = x2 - x1 + r2 + r1 + 24;
    return [
      part("base", "Frame", "Holds both axles at the right distance.", box(width, 8, 44, 2), v3((x1 + x2) / 2, 4, -6), look.dark),
      part("post-1", "Small axle", "The small gear turns on it.", box(8, axisY - 8, 6, 1), v3(x1, 8 + (axisY - 8) / 2, -11), look.dark, { parentId: "base", joint: "molded" }),
      part("post-2", "Big axle", "The big gear turns on it.", box(8, axisY - 8, 6, 1), v3(x2, 8 + (axisY - 8) / 2, -11), look.dark, { parentId: "base", joint: "molded" }),
      part("gear-small", "Driving gear", "You turn this one.", g1.shape, g1.position, look.focus, { parentId: "post-1", joint: "slide" }, g1.rotation),
      part("gear-big", "Driven gear", "Turned by the small gear's teeth.", g2.shape, g2.position, look.steel, { parentId: "post-2", joint: "slide" }, g2.rotation),
      part("hub-1", "Hub", "Shows the small gear's turn.", axle.shape, v3(x1, axisY, -4), look.dark, { parentId: "gear-small", joint: "press-fit" }, v3(90, 0, 0)),
      part("hub-2", "Hub", "Shows the big gear's turn.", axle.shape, v3(x2, axisY, -4), look.dark, { parentId: "gear-big", joint: "press-fit" }, v3(90, 0, 0)),
    ];
  },
  readouts: ({ teeth = 12 }) => {
    const z1 = Math.round(teeth);
    return [
      { label: "Ratio", value: `${z1} : ${BIG_TEETH}` },
      { label: "Big gear", value: `${fmt(z1 / BIG_TEETH, 2)}× the speed, ${fmt(BIG_TEETH / z1, 1)}× the force` },
    ];
  },
};

const CAM_AXIS_Y = 46;

const cam: Primitive = {
  id: "cam",
  name: "Cam",
  kind: "Mechanism",
  idea: "An off-round wheel that turns spinning into up-and-down.",
  howItWorks:
    "A cam is a wheel whose edge is further from its axle in some places than others. A rod resting on it, the follower, rises and falls as the bumps come round. The cam's shape is the motion: a gentle slope gives a smooth lift, a steep one a sudden kick. Engines use cams to open valves; a click pen uses a rotating cam to hold the tip out or let it back in.",
  buildsOn: ["ramp"],
  foundIn: ["Car engines (camshaft)", "Click pens", "Sewing machines", "Wind-up toys"],
  sliders: [{ id: "turn", label: "Turn", min: 0, max: 1, step: 0.005, initial: 0.12, unit: " turns", displayScale: 1 }],
  view: { elevation: 10, azimuth: 22 },
  build: ({ turn = 0.12 }) => {
    const outline: Pt[] = Array.from({ length: 72 }, (_, i) => {
      const a = (i / 72) * 2 * Math.PI;
      const r = camRadius(a);
      return [r * Math.cos(a), r * Math.sin(a)];
    });
    const theta = turn * 360;
    const c = pivoted(outline, 10, [0, 0], v3(0, CAM_AXIS_Y, -5), theta);
    const lift = camRadius((90 - theta) * RAD);
    const rod = cylinder(4, 56);
    const rodBottom = CAM_AXIS_Y + lift;
    return [
      part("frame", "Frame", "Holds the cam's axle and guides the rod.", box(90, 8, 40, 2), v3(0, 4, -8), look.dark),
      part("post", "Post", "The axle support.", box(10, CAM_AXIS_Y - 8, 6, 1), v3(0, 8 + (CAM_AXIS_Y - 8) / 2, -12), look.dark, { parentId: "frame", joint: "molded" }),
      part("cam", "Cam", "Its uneven edge pushes the rod up and lets it drop.", c.shape, c.position, look.focus, { parentId: "post", joint: "slide" }, c.rotation),
      part("hub", "Axle", "The cam turns on it.", cylinder(4, 30).shape, v3(0, CAM_AXIS_Y, -5), look.dark, { parentId: "cam", joint: "press-fit" }, v3(90, 0, 0)),
      part("follower", "Follower", "Rides on the cam and copies its shape as motion.", rod.shape, v3(0, rodBottom + 28, 0), look.steel, { parentId: "frame", joint: "slide" }),
      part("guide", "Guide", "Keeps the follower moving straight up and down.", box(22, 8, 18, 2), v3(0, CAM_AXIS_Y + 52, 0), look.dark, { parentId: "frame", joint: "molded" }),
    ];
  },
  readouts: ({ turn = 0.12 }) => [{ label: "Lift", value: `${fmt(camRadius((90 - turn * 360) * RAD) - 20, 1)} of 14 mm` }],
};

const RATCHET_TEETH = 12;
const RATCHET_ROOT = 22;
const RATCHET_TIP = 30;
const RATCHET_AXIS_Y = 42;

const ratchet: Primitive = {
  id: "ratchet",
  name: "Ratchet",
  kind: "Mechanism",
  idea: "Teeth that let a wheel turn one way and lock it the other.",
  howItWorks:
    "Each tooth is a ramp on one side and a cliff on the other. Turning forward, the pawl rides up a ramp and drops off the cliff: that drop is the click. Turning back, the pawl's tip jams against a cliff and the wheel stops. A spring usually keeps the pawl pressed down; here gravity does it.",
  buildsOn: ["ramp", "lever"],
  foundIn: ["Socket wrenches", "Zip ties", "Ratchet straps", "Click pens", "Bike freewheels"],
  sliders: [{ id: "turn", label: "Turn", min: 0, max: 1, step: 0.002, initial: 0.06, unit: " turns", displayScale: 1 }],
  view: { elevation: 10, azimuth: 20 },
  build: ({ turn = 0.06 }) => {
    const theta = -turn * 360;
    const wheel = pivoted(ratchetOutline(RATCHET_TEETH, RATCHET_ROOT, RATCHET_TIP), 10, [0, 0], v3(0, RATCHET_AXIS_Y, -5), theta);
    const rUnder = ratchetRadius((90 - theta) * RAD, RATCHET_TEETH, RATCHET_ROOT, RATCHET_TIP);
    const pivot = v3(34, RATCHET_AXIS_Y + 34, -2);
    const tip = v3(0, RATCHET_AXIS_Y + rUnder, -2);
    const angle = Math.atan2(tip.y - pivot.y, tip.x - pivot.x) * DEG;
    const len = Math.hypot(tip.x - pivot.x, tip.y - pivot.y);
    const pawl = pivoted([[0, -4], [len * 0.55, -3], [len, 0], [len * 0.55, 3], [0, 4]], 6, [0, 0], pivot, angle);
    return [
      part("frame", "Frame", "Holds the wheel's axle and the pawl's pin.", box(100, 8, 40, 2), v3(10, 4, -8), look.dark),
      part("post", "Post", "Carries the wheel's axle.", box(10, RATCHET_AXIS_Y - 8, 6, 1), v3(0, 8 + (RATCHET_AXIS_Y - 8) / 2, -12), look.dark, { parentId: "frame", joint: "molded" }),
      part("wheel", "Ratchet wheel", "Sawtooth teeth: ramps one way, cliffs the other.", wheel.shape, wheel.position, look.steel, { parentId: "post", joint: "slide" }, wheel.rotation),
      part("pawl-post", "Pawl pin", "The pawl swings on it.", box(8, pivot.y - 8, 6, 1), v3(pivot.x, 8 + (pivot.y - 8) / 2, -8), look.dark, { parentId: "frame", joint: "molded" }),
      part("pawl", "Pawl", "Rides up each ramp and catches on each cliff.", pawl.shape, pawl.position, look.focus, { parentId: "pawl-post", joint: "hinge" }, pawl.rotation),
    ];
  },
  readouts: ({ turn = 0.06 }) => [
    { label: "Clicks", value: `${Math.floor(turn * RATCHET_TEETH + 1e-6)}` },
    { label: "Backwards", value: "locked at the next cliff" },
  ],
};

const SPRING_FREE = 90;
const SPRING_COILS = 8;
const SPRING_R = 16;

const spring: Primitive = {
  id: "spring",
  name: "Coil spring",
  kind: "Mechanism",
  idea: "A coil of wire that stores the push you give it and gives it back.",
  howItWorks:
    "Squeezing a coil spring twists the wire along its length, and the wire resists. Within its working range the push back grows in step with how far it's squeezed: twice the squeeze, twice the force (Hooke's law, F = k·x). The stiffness k comes from the wire's thickness, the coil's width and the number of turns. Squeeze it past its range and it bends for good.",
  buildsOn: [],
  foundIn: ["Click pens", "Staplers", "Door latches", "Mattresses", "Keyboard keys"],
  sliders: [{ id: "squeeze", label: "Squeeze", min: 0, max: 0.55, step: 0.01, initial: 0.2, unit: "%", displayScale: 100 }],
  view: { elevation: 12, azimuth: 30 },
  build: ({ squeeze = 0.2 }) => {
    const len = SPRING_FREE * (1 - squeeze);
    const tube = 2.2;
    const base = cylinder(24, 6);
    const pitch = (len - 2 * tube) / (SPRING_COILS - 1);
    const tilt = Math.atan(pitch / (2 * SPRING_R)) * DEG * 0.8;
    const coils = Array.from({ length: SPRING_COILS }, (_, k) =>
      part(`coil-${k + 1}`, `Coil ${k + 1}`, "One turn of the wire.", { kind: "torus", radius: SPRING_R, tube, arcDegrees: 360 }, v3(0, 6 + tube + k * pitch, 0), look.focus, { parentId: "base", joint: "spring" }, v3(tilt, 0, 0)),
    );
    return [
      part("base", "Base", "The spring rests on it.", base.shape, v3(0, base.midY), look.steel),
      ...coils,
      part("plate", "Plate", "What you press down with.", base.shape, v3(0, 6 + len + 3, 0), look.steel, { parentId: "base", joint: "slide" }),
    ];
  },
  readouts: ({ squeeze = 0.2 }) => [
    { label: "Squeezed", value: `${fmt(SPRING_FREE * squeeze)} mm` },
    { label: "Pushes back", value: `k × ${fmt(SPRING_FREE * squeeze)} mm` },
  ],
};

const hinge: Primitive = {
  id: "hinge",
  name: "Hinge",
  kind: "Joint",
  idea: "Two leaves sharing one pin: they can only swing around it.",
  howItWorks:
    "Each leaf has rolled tubes, the knuckles, that interleave with the other leaf's. One pin runs through all of them, so the only motion left is rotation about the pin. Everything else, sliding, twisting, pulling apart, is blocked by the pin and the knuckles bearing on each other.",
  buildsOn: [],
  foundIn: ["Doors", "Laptops", "Glasses", "Toilet seats", "Lunchbox lids"],
  sliders: [{ id: "open", label: "Open", min: 10, max: 180, step: 1, initial: 110, unit: "°" }],
  view: { elevation: 22, azimuth: 35 },
  build: ({ open = 110 }) => {
    const leafW = 44;
    const leafH = 70;
    const knuckle = cylinder(5, 13);
    const psi = 180 - open;
    const p = psi * RAD;
    const cB = v3((leafW / 2 + 4) * Math.cos(p), leafH / 2, -(leafW / 2 + 4) * Math.sin(p));
    const knuckles = Array.from({ length: 5 }, (_, k) => {
      const onA = k % 2 === 0;
      return part(`knuckle-${k + 1}`, "Knuckle", onA ? "Rolled edge of the fixed leaf." : "Rolled edge of the moving leaf.", knuckle.shape, v3(0, k * 14 + knuckle.midY, 0), look.focus, { parentId: onA ? "leaf-a" : "leaf-b", joint: "molded" });
    });
    return [
      part("leaf-a", "Fixed leaf", "Screwed to the frame.", box(leafW, leafH, 3, 1), v3(-(leafW / 2 + 4), leafH / 2, 0), look.steel),
      part("leaf-b", "Moving leaf", "Screwed to the door or lid.", box(leafW, leafH, 3, 1), cB, look.steel, { parentId: "leaf-a", joint: "hinge" }, v3(0, psi, 0)),
      ...knuckles,
      part("pin", "Pin", "Runs through every knuckle: the only thing holding the two leaves together.", cylinder(2, 74).shape, v3(0, 37, 0), look.focus, { parentId: "leaf-a", joint: "press-fit" }),
    ];
  },
  readouts: ({ open = 110 }) => [
    { label: "Open", value: `${fmt(open)}°` },
    { label: "Free to move", value: "1 way: around the pin" },
  ],
};

const SNAP_LIP: [number, number] = [26, 32];

/** Where the clip's barb is and how far the arm must bend to get past the lip. */
function snapState(push: number) {
  const plateBottom = 44 + (1 - push) * 40;
  const barbTipY = plateBottom - 29;
  const overlap = 3;
  const inBand = barbTipY > SNAP_LIP[0] - 6 && barbTipY < SNAP_LIP[1] + 4;
  const ease = inBand ? Math.min(1, (SNAP_LIP[1] + 4 - barbTipY) / 4, (barbTipY - (SNAP_LIP[0] - 6)) / 4) : 0;
  return { plateBottom, barbTipY, bend: overlap * Math.max(0, ease), locked: barbTipY < SNAP_LIP[0] - 6 };
}

const snapFit: Primitive = {
  id: "snap-fit",
  name: "Snap fit",
  kind: "Joint",
  idea: "A springy hook that bends past a lip and clicks back behind it.",
  howItWorks:
    "The hook's arm is a small spring made of the part itself. Its barb has a slope on the way in, so pushing bends the arm aside, and a flat face on the way out, so once it's past the lip it springs back and pulling can't bend it again. No screws, no glue: the plastic's own springiness does the holding.",
  buildsOn: ["spring", "ramp"],
  foundIn: ["Battery covers", "TV remotes", "Bag buckles", "Food container lids", "Phone cases"],
  sliders: [{ id: "push", label: "Push in", min: 0, max: 1, step: 0.01, initial: 0.55, unit: "%", displayScale: 100 }],
  view: { elevation: 10, azimuth: 16 },
  build: ({ push = 0.55 }) => {
    const s = snapState(push);
    const armLen = 32;
    const bendDeg = -Math.asin(s.bend / armLen) * DEG;
    const arm = pivoted([[0, 0], [4, 0], [4, -24], [9, -29], [4, -32], [0, -32]], 20, [2, 0], v3(6, s.plateBottom, 0), bendDeg);
    return [
      part("base", "Socket", "The part being clipped onto.", box(52, 6, 20, 1), v3(0, 3, 0), look.plastic),
      part("wall-left", "Wall", "Side of the socket.", box(10, 38, 20, 1), v3(-21, 25, 0), look.plastic, { parentId: "base", joint: "molded" }),
      part("wall-right", "Wall", "Side of the socket.", box(10, 38, 20, 1), v3(21, 25, 0), look.plastic, { parentId: "base", joint: "molded" }),
      part("lip", "Lip", "The ledge the barb hooks behind.", box(6, SNAP_LIP[1] - SNAP_LIP[0], 20, 0.5), v3(13, (SNAP_LIP[0] + SNAP_LIP[1]) / 2, 0), look.plastic, { parentId: "wall-right", joint: "molded" }),
      part("plate", "Lid", "The part doing the clipping.", box(52, 6, 20, 1), v3(0, s.plateBottom + 3, 0), look.focus, { parentId: "base", joint: "snap-fit" }),
      part("hook", "Hook", "A springy arm with a sloped barb.", arm.shape, arm.position, look.focus, { parentId: "plate", joint: "molded" }, arm.rotation),
    ];
  },
  readouts: ({ push = 0.55 }) => {
    const s = snapState(push);
    return [{ label: "State", value: s.locked ? "clicked in: the barb is behind the lip" : s.bend > 0.05 ? `arm bent ${fmt(s.bend, 1)} mm` : "not in yet" }];
  },
};

const RIM_TOP = 18;
const RING_D = 9;

const seal: Primitive = {
  id: "seal",
  name: "Seal",
  kind: "Joint",
  idea: "A soft ring squeezed between two hard surfaces fills the gaps they can't.",
  howItWorks:
    "Two hard surfaces never touch everywhere: up close they are hills and valleys, and water finds the valleys. A rubber ring squashed between them flows into those valleys and pushes back against both sides, closing the path. Too little squeeze and gaps stay open; too much and the ring can crack or stay flattened. Static seals are typically squeezed by roughly 15 to 30 percent of their thickness.",
  buildsOn: ["thread"],
  foundIn: ["Bottle caps", "Food container lids", "Garden hose fittings", "Pressure cookers", "Car engines"],
  sliders: [{ id: "squeeze", label: "Squeeze", min: 0, max: 0.45, step: 0.01, initial: 0.2, unit: "%", displayScale: 100 }],
  view: { elevation: 6, azimuth: 30 },
  build: ({ squeeze = 0.2 }) => {
    const h = RING_D * (1 - squeeze);
    const w = (RING_D * RING_D) / h;
    const R = 18;
    const yc = RIM_TOP + h / 2;
    const ring = lathe(Array.from({ length: 25 }, (_, i): [number, number] => {
      const a = (i / 24) * 2 * Math.PI;
      return [R + (w / 2) * Math.cos(a), yc + (h / 2) * Math.sin(a)];
    }));
    const rim = lathe([[15, 0], [21, 0], [21, RIM_TOP], [15, RIM_TOP], [15, 0]]);
    const lid = lathe([[0, 0], [27, 0], [27, 7], [0, 7]]);
    const lidBase = RIM_TOP + h;
    return [
      part("rim", "Rim", "The hard top edge of the opening.", rim.shape, v3(0, rim.midY), look.steel),
      part("ring", "Seal ring", "Soft rubber that flows into the gaps.", ring.shape, v3(0, ring.midY), look.focusRubber, { parentId: "rim", joint: "press-fit" }),
      part("lid", "Lid", "Pressed down by the thread, it squeezes the ring.", lid.shape, v3(0, lidBase + lid.midY), look.plastic, { parentId: "rim", joint: "thread" }),
    ];
  },
  readouts: ({ squeeze = 0.2 }) => [
    { label: "Squeeze", value: `${fmt(squeeze * 100)}%` },
    { label: "Result", value: squeeze < 0.1 ? "too loose: gaps stay open" : squeeze <= 0.32 ? "sealed" : "over-squeezed: the ring can crack" },
  ],
};

const neck: Primitive = {
  id: "neck",
  name: "Narrow neck",
  kind: "Shape",
  idea: "A small opening spills less and is far easier to seal.",
  howItWorks:
    "The opening's area grows with the square of its width: half the width, a quarter of the opening. A small opening lets less out when the container tips, and its seal is a shorter ring with less edge to close and less force needed to clamp it. The price is that it is slower to fill and harder to clean.",
  buildsOn: [],
  foundIn: ["Bottles", "Vases", "Watering cans", "Lab flasks"],
  sliders: [{ id: "width", label: "Neck width", min: 0.25, max: 1, step: 0.01, initial: 0.45, unit: "%", displayScale: 100 }],
  view: { elevation: 20, azimuth: 30 },
  build: ({ width = 0.45 }) => {
    const R = 30;
    const rn = Math.max(6, R * width);
    const wall = 2;
    const body = lathe([
      [0, 0], [R, 0], [R, 66], [rn, 82], [rn, 98],
      [rn - wall, 98], [rn - wall, 82], [R - wall, 66], [R - wall, wall], [0, wall],
    ]);
    return [
      part("body", "Body", "Holds the liquid.", body.shape, v3(0, body.midY), look.plastic),
      part("opening", "Opening", "The neck's rim: everything going in or out passes here.", { kind: "torus", radius: rn - wall / 2, tube: 1.6, arcDegrees: 360 }, v3(0, 98, 0), look.focus, { parentId: "body", joint: "molded" }),
    ];
  },
  readouts: ({ width = 0.45 }) => [
    { label: "Opening", value: `${fmt(Math.max(6 / 30, width) ** 2 * 100)}% of the body's cross-section` },
  ],
};

export const PRIMITIVES: Primitive[] = [ramp, lever, thread, gears, cam, ratchet, spring, hinge, snapFit, seal, neck];

export const initialValues = (p: Primitive): Values => Object.fromEntries(p.sliders.map((s) => [s.id, s.initial]));

/**
 * Parts at the slider extremes, for framing: the camera fits these once so it holds still while a
 * slider moves the parts around.
 */
export function framingParts(p: Primitive): Part[] {
  const combos = p.sliders.reduce<Values[]>(
    (acc, s) => acc.flatMap((v) => [{ ...v, [s.id]: s.min }, { ...v, [s.id]: s.max }]),
    [{}],
  );
  return combos.flatMap((v, i) => p.build(v).map((part) => ({ ...part, id: `${part.id}~${i}` })));
}

export const formatSlider = (s: Slider, value: number) => `${fmt(value * (s.displayScale ?? 1), s.step * (s.displayScale ?? 1) < 1 ? 1 : 0)}${s.unit ?? ""}`;
