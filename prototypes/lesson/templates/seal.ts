// A part the kit itself calls a seal (see evidence.ts) is a seal, whatever joint holds it: squeezed
// too little it leaves gaps and the joint leaks upside down; squeezed too hard it grips what closes
// over it, and that part no longer opens by hand.
import type { Kit, Part, Shape } from "../../../shared/kit.ts";
import { clamp01, easeOut, smooth } from "../../../shared/primitives/motion/ease.ts";
import { AXIS, type Mark, type PartMove, type Rigid, STILL, type Test, type TestCtx, type Values, type Vec, vec, type Window } from "../model.ts";
import { extents, rigidPoint } from "../pose.ts";
import { add, carry, clearance, latheAxis, overlay, type Pair, pairOf, scale, shudder, targetOf, type Template, tenth } from "./pair.ts";

/** The 15 to 30 percent band is the typical squeeze for static seals. */
const WINDOW: Window = [0.15, 0.3];
const MAX_DROPS = 12;
/** Game numbers: what it takes to open what closes over the seal, by twist or by pull, and what a hand gives. */
const TWIST = { base: 0.4, per: 7, hand: 2.5, unit: "N·m" } as const;
const PULL = { base: 4, per: 70, hand: 25, unit: "N" } as const;

const squeezeOf = (v: Values) => v["seal-squeeze"] ?? 0.2;
const pct = (s: number) => Math.round(s * 100);
const dropsAt = (s: number) => {
  const gap = pct(WINDOW[0]) - pct(s);
  return gap > 0 ? Math.max(1, Math.ceil((MAX_DROPS * gap) / pct(WINDOW[0]))) : 0;
};
const opens = (s: number) => pct(s) <= pct(WINDOW[1]);

const threaded = (p: Part) => p.joint === "thread" || p.joint === "screw";

/**
 * What you open to get past the seal: the nearest threaded part beside it or above it in the kit tree
 * (a jar's screw ring, a flashlight's head), else the part the seal sits on, else the seal itself.
 */
export function closerOf(kit: Kit, seal: Part): Part {
  const parentOf = (p: Part) => kit.parts.find((q) => q.id === p.parentId);
  for (let at: Part | undefined = seal; at && at.parentId !== null; at = parentOf(at)) {
    if (at !== seal && threaded(at)) return at;
    const sibling = kit.parts.find((p) => p.parentId === at!.parentId && p.id !== at!.id && threaded(p));
    if (sibling) return sibling;
  }
  const parent = parentOf(seal);
  return parent && parent.parentId !== null ? parent : seal;
}

/** Points round the seal's ring, in the kit's frame. */
export function ringOf(seal: Part, pair: Pair): Vec[] {
  const axis = seal.shape.kind === "torus" || seal.shape.kind === "lathe" ? latheAxis(seal) : AXIS[pair.axis];
  const radius = seal.shape.kind === "torus" ? seal.shape.radius : Math.max(...(["x", "y", "z"] as const).filter((a) => Math.abs(axis[a]) < 0.9).map((a) => pair.half[a]));
  const helper = Math.abs(axis.y) < 0.9 ? vec(0, 1, 0) : vec(1, 0, 0);
  const cross = (a: Vec, b: Vec) => vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  const u = cross(axis, helper);
  const n = Math.hypot(u.x, u.y, u.z);
  const uu = scale(u, 1 / n);
  const vv = cross(axis, uu);
  return Array.from({ length: 10 }, (_, i) => {
    const a = (i / 10) * 2 * Math.PI;
    return add(pair.centre, add(scale(uu, radius * Math.cos(a)), scale(vv, radius * Math.sin(a))));
  });
}

const sphere = (r: number): Shape => ({
  kind: "lathe",
  profile: [0, 1, 2, 3, 4, 5, 6].map((i) => {
    const a = (i / 6) * Math.PI - Math.PI / 2;
    return { r: i === 0 || i === 6 ? 0 : r * Math.cos(a), y: r * Math.sin(a) };
  }),
});
const splash = (r: number): Shape => ({ kind: "lathe", profile: [{ r: 0, y: 0 }, { r: 1.4 * r, y: 0 }, { r: 1.4 * r, y: 0.35 * r }, { r: 0, y: 0.35 * r }] });

/** How far up an object is held while it turns over: clear of the ground, with room for drops to fall. */
export function flipFrame(ctx: TestCtx) {
  const parts = ctx.kit.parts.filter((p) => ctx.present.includes(p.id));
  const box = extents(parts);
  const height = box.max.y - box.min.y;
  const size = Math.max(height, box.max.x - box.min.x, box.max.z - box.min.z);
  const reach = Math.max(...parts.flatMap((p) => { const b = extents([p]); return [b.min, b.max]; }).map((c) => Math.hypot(c.x - ctx.centre.x, c.y - ctx.centre.y)));
  return { box, size, lift: Math.max(0, reach - (ctx.centre.y - box.min.y)) + 0.3 * height + 10 };
}

const FLIP_UP = 800;
const FLIP_BACK = 900;
const DROP_GAP = 130;

function flip(pair: Pair, between: string): Test {
  return {
    id: "seal-flip",
    label: `Flip · ${pair.noun}`,
    run: (values, ctx) => {
      const drops = dropsAt(squeezeOf(values));
      const { box, size, lift } = flipFrame(ctx);
      const r = Math.min(6, Math.max(1.5, 0.03 * size));
      const g = 4.2 * size;
      const held: Rigid = { dx: 0, dy: lift, angle: 180 };
      const ring = ringOf(pair.child, pair).map((p) => rigidPoint(ctx.centre, held, p)).sort((a, b) => a.y - b.y);
      const spawns = Array.from({ length: drops }, (_, i) => FLIP_UP + 50 + i * DROP_GAP);
      const origins = spawns.map((_, i) => ring[(i * 3) % Math.min(5, ring.length)]!);
      const ground = box.min.y;
      const hold = Math.max(1000, 500 + drops * DROP_GAP + 700);
      return {
        verdict: drops === 0
          ? { pass: true, line: `Dry. Nothing got through the joint between ${between}.` }
          : { pass: false, line: `${drops} drops got through the joint between ${between}.` },
        durationMs: FLIP_UP + hold + FLIP_BACK,
        at: (ms) => {
          const back = smooth(clamp01((ms - FLIP_UP - hold) / FLIP_BACK));
          const rigid: Rigid =
            ms < FLIP_UP ? { dx: 0, dy: lift * smooth(ms / FLIP_UP), angle: 180 * smooth(ms / FLIP_UP) }
            : ms < FLIP_UP + hold ? held
            : { dx: 0, dy: lift * (1 - back), angle: 180 + 180 * back };
          const marks = spawns.flatMap((spawn, i): Mark[] => {
            const tau = (ms - spawn) / 1000;
            if (tau < 0) return [];
            const o = origins[i]!;
            const y = o.y - 0.5 * g * tau * tau;
            return [y > ground + r
              ? { id: `drop-${i}`, shape: sphere(r), at: vec(o.x, y, o.z), ride: null }
              : { id: `splash-${i}`, shape: splash(r), at: vec(o.x, ground + 0.2, o.z), ride: null }];
          });
          const falling = marks.length;
          return overlay(falling > 0 ? `Drops: ${falling}` : "Upside down", {}, marks, rigid);
        },
      };
    },
  };
}

const TWIST_MS = 1100;
const LIFT_MS = 450;
const HOLD = 600;
const BACK = 700;
const REFUSE_MS = 1700;

function open(closer: Pair): Test {
  const turns = threaded(closer.child);
  const law = turns ? TWIST : PULL;
  const need = (s: number) => tenth(law.base + law.per * s);
  const move = (d: number, deg: number): PartMove => ({
    offset: scale(closer.out, d),
    turns: turns ? [{ axis: AXIS[closer.axis], pivot: closer.centre, deg }] : [],
  });
  return {
    id: "seal-open",
    label: `Open · ${closer.noun}`,
    run: (values, ctx) => {
      const s = squeezeOf(values);
      const at = (d: number, deg: number) => carry(closer, ctx.present, move(d, deg));
      if (!opens(s)) {
        return {
          verdict: { pass: false, line: `It would not open. It needs ${need(s)} ${law.unit} and a hand gives about ${law.hand} ${law.unit}.`, nudge: `The squeezed seal grips the ${closer.childName} far too hard.` },
          durationMs: REFUSE_MS,
          at: (ms) => {
            const w = shudder(clamp01(ms / REFUSE_MS));
            return overlay(`Needs ${need(s)} ${law.unit}`, turns ? at(0, 12 * w) : at(1.2 * w, 0), [], { ...STILL, dx: 0.8 * w });
          },
        };
      }
      const free = clearance(closer);
      return {
        verdict: { pass: true, line: `Opened by hand with ${need(s)} ${law.unit}, under the ${law.hand} ${law.unit} a hand gives.` },
        durationMs: TWIST_MS + LIFT_MS + HOLD + BACK,
        at: (ms) => {
          if (ms < TWIST_MS) {
            const p = smooth(ms / TWIST_MS);
            return overlay(turns ? "Twisting it open" : "Pulling it open", at(4 * p, 540 * p));
          }
          const q = easeOut(clamp01((ms - TWIST_MS) / LIFT_MS));
          if (ms < TWIST_MS + LIFT_MS + HOLD) return overlay("Open", at(4 + free * q, 540));
          const p = smooth(clamp01((ms - TWIST_MS - LIFT_MS - HOLD) / BACK));
          return overlay("Closing it again", at((4 + free) * (1 - p), 540 * (1 - p)));
        },
      };
    },
  };
}

export const sealTemplate: Template = {
  joints: [],
  primitive: "seal",
  last: true,
  module: (pair) => {
    const child = pair.childName;
    const closerPart = closerOf(pair.kit, pair.child);
    const closer = pairOf(pair.kit, closerPart, []);
    const base = closer.parentName;
    const between = `the ${closer.childName} and the ${base}`;
    const flipTest = flip(pair, between);
    const openTest = open(closer);
    const law = threaded(closerPart) ? TWIST : PULL;
    const doing = threaded(closerPart) ? "twist" : "pull";
    return {
      id: "seal",
      title: `Squeeze the ${child}`,
      need: `The ${child} must keep the joint between ${between} sealed upside down, and the ${closer.childName} must still open by hand.`,
      primitive: "seal",
      produces: pair.produces,
      assemble: {
        piece: "Gasket",
        title: `Fit the gasket into the joint: it becomes the ${child}.`,
        built: `The gasket is now the ${child}, sitting in the joint between ${between}, ready to be squeezed.`,
      },
      target: targetOf(pair),
      enter: scale(pair.out, 50),
      fault: { primitive: "seal", slider: "squeeze", start: 0.03, key: "seal-squeeze" },
      fix: { window: WINDOW },
      tests: [flipTest, openTest],
      hints: {
        observe: `Run ${flipTest.label} and watch where the drops start. They come out at the joint between ${between}.`,
        principle: "A seal works by being squeezed. Two hard faces never fit perfectly, and a squeezed gasket is pressed into the gaps between them. Squeeze it too little and the gaps stay open.",
        direction: `Squeeze more, but not too far: a crushed seal grips the ${closer.childName}. Check ${flipTest.label} and ${openTest.label} together.`,
        low: `The gaps stay open, and ${flipTest.label} leaks.`,
        high: `The crushed seal grips the ${closer.childName} so hard that it takes more than a hand to ${doing} it open.`,
      },
      suspect: pair.child.id,
      misses: {
        ...(closerPart.id !== pair.child.id ? { [closerPart.id]: `The ${closer.childName} closes the joint, but the drops get past something inside it. Watch where they start.` } : {}),
        [closer.parent.id]: `The ${base} holds still. The drops start at the joint between ${between}.`,
      },
      missDefault: `That is not where it leaks. Run ${flipTest.label} and watch where the drops start.`,
      uses: { seal: `The ${child} in the joint between ${between}. Squeezed, it fills the gaps water would leak through.` },
      task: "Squeeze until it is dry but still opens.",
      why: `A seal is squeezed into the tiny gaps between two hard faces and closes them. Static seals are typically squeezed about 15 to 30 percent. Less leaks; more crushes it, and it grips the ${closer.childName} too hard to open by hand.`,
      gameNote: `Game numbers: up to ${MAX_DROPS} drops, a hand giving about ${law.hand} ${law.unit}, and opening taken to need ${law.base} + ${law.per} × squeeze in ${law.unit}. None of them is measured from the ${pair.objectName}. The 15 to 30 percent band is the typical range for static seals, not a measured limit for this ${pair.objectName}.`,
      readoutWith: () => ({}),
      numbers: (v) => {
        const s = squeezeOf(v);
        const drops = dropsAt(s);
        return [
          { label: "Upside down", value: drops > 0 ? `${drops} drops get through (dry from ${pct(WINDOW[0])}%)` : "dry" },
          { label: "To open", value: `${law.base} + ${law.per} × ${s.toFixed(2)} = ${tenth(law.base + law.per * s)} ${law.unit} (a hand gives ${law.hand} ${law.unit})` },
        ];
      },
    };
  },
};
