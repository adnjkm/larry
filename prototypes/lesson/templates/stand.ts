// A whole-object template: an object that stands on a table must not tip over when knocked, and must
// stay light enough to lift. The tuned number is its mass (the weight primitive). A knock gives it a
// fixed energy; to fall over, its centre of mass has to rise over the edge of its base, and that takes
// its weight times the rise. A heavier object takes more energy to tip, but it is harder to lift: by
// its handle the weight pulls on your wrist at the handle's distance, without one it is the weight.
//
// A static tilt cannot fail for most real objects (a mug only tips past about 40 degrees), and the
// width of a base cannot be tuned without drawing a different base, so mass is the honest knob: it is
// inside the object either way.
//
// When an object stands is read from the kit alone: a part whose own words say it is a base or a foot
// (or that it stands or sits), or the root part, at the bottom of the object with a flat face down
// (an upright lathe with a wide foot ring, or a box lying square) and at least half as wide as the
// object. Its handle is a part named handle, or whose role says you lift or carry by it.
import type { Kit, Part } from "../../../shared/kit.ts";
import { clamp01, easeOut, smooth } from "../../../shared/primitives/motion/ease.ts";
import type { Slider } from "../primitives/library.ts";
import { type Mark, type ModuleSpec, type PartMove, type Run, type TestCtx, type Values, type Vec, vec, type Window } from "../model.ts";
import { centreOf, extents } from "../pose.ts";
import { add, arrowMark, cross, dot, latheAxis, overlay, rotate, scale, sub, tenth } from "./pair.ts";
import { DEG_TO_RAD } from "../../../shared/angles.ts";

const G = 9.8;
/** Game numbers: the knock's energy, the wrist torque held steady by a handle, and a comfortable one-hand lift. */
const KNOCK_J = 0.05;
const WRIST_NM = 0.8;
const ONE_HAND_KG = 1.5;
/** The mass slider, in kg. */
const STEP = 0.1;
const LIGHTEST = 0.1;
const HEAVIEST_SCAN = 20;
/** A foot narrower than this share of the object is a point or a stem, not a base. */
const WIDE = 0.5;
const ROOM = 2;

const BASE_WORDS = /\b(base|foot|feet|stands?|standing|sits?|upright)\b/i;
const HANDLE_NAME = /\bhandles?\b/i;
const HANDLE_ROLE = /\b(lift|lifts|lifting|carry|carries|carrying)\b/i;

const UP = vec(0, 1, 0);

/** The face an object stands on: its centre on the table, and its half-widths along x and z. */
type Footing = { part: Part; centre: Vec; half: { x: number; z: number } };

/** Where the object is gripped to lift it, and how far that is from the middle of its base. */
type Handle = { part: Part; grip: Vec; reach: number };

export type Stand = {
  kit: Kit;
  /** The part this module earns: the root, which everything else sits on in the kit. */
  root: Part;
  footing: Footing;
  /** The object's height and the height of its centre of mass, both above the table, in mm. */
  height: number;
  com: number;
  /** Half the base along the way it tips, and that unit direction (horizontal). */
  halfBase: number;
  tip: Vec;
  /** How far the centre of mass rises, in mm, from standing to balanced on the base edge, and the angle it balances at. */
  rise: number;
  balanceDeg: number;
  handle: Handle | null;
  slider: Pick<Slider, "label" | "min" | "max" | "step" | "initial">;
  window: Window;
  start: number;
};

const square = (deg: number) => Math.abs(deg / 90 - Math.round(deg / 90)) < 0.01;

function footingOf(p: Part): Footing | null {
  const box = extents([p]);
  const c = centreOf(box);
  const centre = vec(c.x, box.min.y, c.z);
  if (p.shape.kind === "box") {
    if (![p.rotation.x, p.rotation.y, p.rotation.z].every(square)) return null;
    return { part: p, centre, half: { x: (box.max.x - box.min.x) / 2, z: (box.max.z - box.min.z) / 2 } };
  }
  if (p.shape.kind === "lathe") {
    const axis = latheAxis(p);
    if (Math.abs(axis.y) < 0.99) return null;
    const ys = p.shape.profile.map((q) => q.y);
    const end = axis.y > 0 ? Math.min(...ys) : Math.max(...ys);
    const r = Math.max(...p.shape.profile.filter((q) => Math.abs(q.y - end) < 0.5).map((q) => q.r));
    return r > 0 ? { part: p, centre, half: { x: r, z: r } } : null;
  }
  return null;
}

const corners = (p: Part): Vec[] => {
  const b = extents([p]);
  return [b.min.x, b.max.x].flatMap((x) => [b.min.y, b.max.y].flatMap((y) => [b.min.z, b.max.z].map((z) => vec(x, y, z))));
};

/**
 * Fingers in a handle sit midway between the body's side and the handle's far side, out from the
 * middle of the base toward the handle. Null when the handle does not reach past the body.
 */
function handleOf(part: Part, root: Part, footing: Footing): Handle | null {
  const c = centreOf(extents([part]));
  const flat = vec(c.x - footing.centre.x, 0, c.z - footing.centre.z);
  const length = Math.hypot(flat.x, flat.z);
  if (length < 1) return null;
  const dir = scale(flat, 1 / length);
  const out = (p: Part) => Math.max(...corners(p).map((q) => dot(sub(q, footing.centre), dir)));
  const [wall, far] = [out(root), out(part)];
  if (far <= wall) return null;
  const reach = (wall + far) / 2;
  return { part, grip: add(vec(footing.centre.x, c.y, footing.centre.z), scale(dir, reach)), reach };
}

const grams = (kg: number) => Math.round(kg * 1000);

/** Whether the object, standing, works at mass `kg`: the knock does not tip it, and it can be lifted. */
const survives = (s: Pick<Stand, "rise">, kg: number) => grams(kg) * G * s.rise >= KNOCK_J * 1e6;
const liftable = (s: Pick<Stand, "handle">, kg: number) => (s.handle ? grams(kg) * G * s.handle.reach <= WRIST_NM * 1e6 : grams(kg) <= ONE_HAND_KG * 1000);

const steps = (from: number, to: number) => Array.from({ length: Math.round((to - from) / STEP) + 1 }, (_, i) => Number((from + i * STEP).toFixed(6)));

/** The standing object the kit describes, or null when it does not stand, or when no mass both survives the knock and lifts. */
export function standOf(kit: Kit): Stand | null {
  const all = extents(kit.parts);
  const floor = all.min.y;
  const root = kit.parts.find((p) => p.parentId === null);
  if (!root) return null;
  const lowest = (p: Part) => Math.abs(extents([p]).min.y - floor) < 1;
  const said = kit.parts.filter((p) => (BASE_WORDS.test(p.name) || BASE_WORDS.test(p.role)) && lowest(p));
  const object = { x: (all.max.x - all.min.x) / 2, z: (all.max.z - all.min.z) / 2 };
  const footing = [...said, ...(lowest(root) ? [root] : [])]
    .map(footingOf)
    .find((f): f is Footing => f !== null && f.half.x >= WIDE * object.x && f.half.z >= WIDE * object.z);
  if (!footing) return null;

  // It tips the narrow way, toward the side the object reaches out least (away from a handle).
  const along = footing.half.z < footing.half.x - 0.5 ? "z" : "x";
  const reach = (sign: number) => sign * ((sign > 0 ? all.max : all.min)[along] - footing.centre[along]);
  const sign = reach(1) > reach(-1) + 0.5 ? -1 : 1;
  const tip = along === "x" ? vec(sign, 0, 0) : vec(0, 0, sign);
  const halfBase = footing.half[along];
  const height = all.max.y - floor;
  const com = height / 2;
  const rise = Math.hypot(halfBase, com) - com;

  const handlePart = kit.parts.find((p) => p.id !== root.id && p.id !== footing.part.id && (HANDLE_NAME.test(p.name) || HANDLE_ROLE.test(p.role)));
  const handle = handlePart ? handleOf(handlePart, root, footing) : null;

  const stand = { rise, handle };
  const passing = steps(LIGHTEST, HEAVIEST_SCAN).filter((kg) => survives(stand, kg) && liftable(stand, kg));
  const lo = passing[0];
  const hi = passing[passing.length - 1];
  if (lo === undefined || hi === undefined || lo >= hi || lo < LIGHTEST + ROOM * STEP - 1e-9) return null;
  const max = Number((hi + 5 * STEP).toFixed(6));
  return {
    kit,
    root,
    footing,
    height,
    com,
    halfBase,
    tip,
    rise,
    handle,
    balanceDeg: Math.atan(halfBase / com) / DEG_TO_RAD,
    slider: { label: "Mass", min: LIGHTEST, max, step: STEP, initial: Math.min(max, 2) },
    window: [lo, hi],
    start: Math.max(LIGHTEST, Number((Math.floor(lo / 2 / STEP) * STEP).toFixed(6))),
  };
}

const massOf = (v: Values) => v.mass ?? 1;
const fixed = (n: number, d: number) => n.toFixed(d);
const newtons = (kg: number) => tenth(kg * G);

const KNOCK_MS = 350;
const RISE_MS = 450;
const SETTLE_MS = 350;
const ROCK_MS = 500;
const TOPPLE_MS = 450;
const LIE_MS = 800;
const UPRIGHT_MS = 700;
const LIFT_MS = 600;
const HOLD_MS = 600;
const DOWN_MS = 500;
const LIFT_MM = 30;
const DROOP_DEG = 22;

const box = (size: number) => ({ kind: "box" as const, width: size, height: size, depth: size, cornerRadius: 1 });

export function standModule(s: Stand, produces: readonly string[]): ModuleSpec {
  const { kit, root, footing, handle, tip } = s;
  const object = kit.name.toLowerCase();
  const noun = object.split(/\s+/).pop()!;
  const rootName = root.name.toLowerCase();
  const handleName = handle?.part.name.toLowerCase();
  const bump = `Bump · ${noun}`;
  const lift = handle ? `Lift · ${handle.part.name.toLowerCase().split(/\s+/).pop()}` : `Lift · ${noun}`;
  const edge = add(footing.centre, scale(tip, s.halfBase));
  const turnAxis = cross(UP, tip);
  const riseM = s.rise / 1000;
  const reachM = handle ? handle.reach / 1000 : 0;
  const balance = Math.round(s.balanceDeg);
  const byHand = handle ? `by its ${handleName}` : "with one hand";

  const everything = (present: readonly string[], move: PartMove) => Object.fromEntries(present.map((id) => [id, move]));
  const tipped = (present: readonly string[], deg: number) => everything(present, { turns: [{ axis: turnAxis, pivot: edge, deg }] });
  const edgeMark: Mark = { id: "base-edge", shape: box(5), at: add(add(edge, scale(tip, 5)), vec(0, 2.5, 0)), ride: null };

  /** The angle it lies at once fallen: the first turn at which a corner beyond the edge reaches the table. */
  const lyingDeg = (present: readonly string[]) => {
    const stops = kit.parts
      .filter((p) => present.includes(p.id))
      .flatMap(corners)
      .map((c) => ({ u: dot(sub(c, edge), tip), y: c.y - edge.y }))
      .filter((c) => c.u > 0.5 && c.y > 0)
      .map((c) => Math.atan2(c.y, c.u) / DEG_TO_RAD);
    return Math.min(88, ...stops);
  };

  const knockArrow = (present: readonly string[], t: number): Mark => {
    const body = extents(kit.parts.filter((p) => present.includes(p.id) && p.id !== handle?.part.id));
    const back = Math.max(
      ...[body.min, body.max].flatMap((a) => [body.min, body.max].map((b) => -dot(sub(vec(a.x, 0, b.z), vec(footing.centre.x, 0, footing.centre.z)), tip))),
    );
    const rim = add(vec(footing.centre.x, body.max.y - 4, footing.centre.z), scale(tip, -back));
    return arrowMark("knock", add(rim, scale(tip, -24 * (1 - t))), tip, null);
  };

  const bumpTest = {
    id: "stand-bump",
    label: bump,
    run: (values: Values, ctx: TestCtx): Run => {
      const kg = massOf(values);
      const w = newtons(kg);
      const energy = kg * G * riseM;
      const ok = survives(s, kg);
      const said = `${w} N × ${fixed(riseM, 4)} m = ${fixed(energy, 3)} J`;
      // How far the knock tips it: its centre of mass rises by the knock's energy over its weight.
      const lifts = (KNOCK_J / (kg * G)) * 1000;
      const r = Math.hypot(s.halfBase, s.com);
      const reached = ok ? s.balanceDeg - Math.acos(Math.min(1, (s.com + lifts) / r)) / DEG_TO_RAD : s.balanceDeg;
      const lie = lyingDeg(ctx.present);
      const start = KNOCK_MS;
      return {
        verdict: ok
          ? { pass: true, line: `It rocked back. Tipping it over takes ${said}, more than the knock's ${KNOCK_J} J.` }
          : { pass: false, line: `It fell over. Tipping it over takes only ${said}, less than the knock's ${KNOCK_J} J.` },
        durationMs: ok ? start + RISE_MS + SETTLE_MS + ROCK_MS : start + RISE_MS + TOPPLE_MS + LIE_MS + UPRIGHT_MS,
        at: (ms) => {
          const marks = (extra: Mark[]) => [edgeMark, ...extra];
          if (ms < start) return overlay("Knock", {}, marks([knockArrow(ctx.present, easeOut(ms / start))]));
          const t = ms - start;
          if (ok) {
            if (t < RISE_MS)
              return overlay(
                `Tipped ${Math.round(reached * easeOut(t / RISE_MS))}° · falls past ${balance}°`,
                tipped(ctx.present, reached * easeOut(t / RISE_MS)),
                marks(t < 150 ? [knockArrow(ctx.present, 1)] : []),
              );
            if (t < RISE_MS + SETTLE_MS) {
              const q = (t - RISE_MS) / SETTLE_MS;
              return overlay(`Tipped ${Math.round(reached)}° · falls past ${balance}°`, tipped(ctx.present, reached * (1 - q * q)), marks([]));
            }
            const q = clamp01((t - RISE_MS - SETTLE_MS) / ROCK_MS);
            return overlay("Rocked back", tipped(ctx.present, 0.25 * reached * Math.abs(Math.sin(2 * Math.PI * q)) * (1 - q)), marks([]));
          }
          if (t < RISE_MS)
            return overlay(
              `Tipped ${Math.round(reached * smooth(t / RISE_MS))}° · falls past ${balance}°`,
              tipped(ctx.present, reached * smooth(t / RISE_MS)),
              marks(t < 150 ? [knockArrow(ctx.present, 1)] : []),
            );
          if (t < RISE_MS + TOPPLE_MS) {
            const q = (t - RISE_MS) / TOPPLE_MS;
            return overlay("Past the edge", tipped(ctx.present, reached + (lie - reached) * q * q), marks([]));
          }
          if (t < RISE_MS + TOPPLE_MS + LIE_MS) return overlay("Fell over", tipped(ctx.present, lie), marks([]));
          const q = smooth(clamp01((t - RISE_MS - TOPPLE_MS - LIE_MS) / UPRIGHT_MS));
          return overlay("Standing it back up", tipped(ctx.present, lie * (1 - q)), marks([]));
        },
      };
    },
  };

  const liftTest = {
    id: "stand-lift",
    label: lift,
    run: (values: Values, ctx: TestCtx): Run => {
      const kg = massOf(values);
      const w = newtons(kg);
      const ok = liftable(s, kg);
      const top = extents(kit.parts.filter((p) => ctx.present.includes(p.id))).max.y;
      const hand =
        handle && ctx.present.includes(handle.part.id)
          ? arrowMark("lift", handle.grip, UP, handle.part.id)
          : arrowMark("lift", add(vec(footing.centre.x, top, footing.centre.z), vec(0, 20, 0)), UP, root.id);
      const torque = kg * G * reachM;
      const verdict = handle
        ? ok
          ? {
              pass: true,
              line: `It stayed level. Its ${w} N pulls ${fixed(reachM, 3)} m out from your fingers: ${fixed(torque, 2)} N·m on your wrist, within the ${WRIST_NM} N·m it holds steady.`,
            }
          : {
              pass: false,
              line: `It twisted down. Its ${w} N pulls ${fixed(reachM, 3)} m out from your fingers: ${fixed(torque, 2)} N·m on your wrist, more than the ${WRIST_NM} N·m it holds steady.`,
            }
        : ok
          ? { pass: true, line: `It came up. ${kg} kg is ${w} N, within the ${ONE_HAND_KG} kg one hand lifts comfortably.` }
          : { pass: false, line: `It barely moved. ${kg} kg is ${w} N, more than the ${ONE_HAND_KG} kg one hand lifts comfortably.` };
      // A handle that is too heavy to hold level lets the object turn down about your fingers.
      const droop = handle ? (rotate(footing.centre, handle.grip, turnAxis, 5).y < footing.centre.y ? 1 : -1) * DROOP_DEG : 0;
      const raised = (mm: number, deg: number): Record<string, PartMove> =>
        everything(ctx.present, { offset: vec(0, mm, 0), turns: deg && handle ? [{ axis: turnAxis, pivot: handle.grip, deg }] : [] });
      const live = handle ? `Wrist ${fixed(torque, 2)} of ${WRIST_NM} N·m` : `${kg} of ${ONE_HAND_KG} kg`;
      return {
        verdict,
        durationMs: LIFT_MS + HOLD_MS + DOWN_MS,
        at: (ms) => {
          const up = ms < LIFT_MS ? smooth(ms / LIFT_MS) : ms < LIFT_MS + HOLD_MS ? 1 : 1 - smooth(clamp01((ms - LIFT_MS - HOLD_MS) / DOWN_MS));
          if (ok) return overlay(ms < LIFT_MS + HOLD_MS ? `${live} · lifted` : "Set down", raised(LIFT_MM * up, 0), ms < LIFT_MS + HOLD_MS ? [hand] : []);
          if (handle)
            return overlay(
              ms < LIFT_MS + HOLD_MS ? `${live} · twists down` : "Set down",
              raised(LIFT_MM * up, droop * up),
              ms < LIFT_MS + HOLD_MS ? [hand] : [],
            );
          const strain = ms < LIFT_MS + HOLD_MS ? 2 + 1.2 * Math.sin(2 * Math.PI * 4 * (ms / 1000)) * (ms < LIFT_MS ? ms / LIFT_MS : 1) : 2 * (1 - up);
          return overlay(ms < LIFT_MS + HOLD_MS ? `${live} · too heavy` : "Let go", raised(Math.max(0, strain * up), 0), ms < LIFT_MS + HOLD_MS ? [hand] : []);
        },
      };
    },
  };

  const misses = Object.fromEntries(
    kit.parts
      .filter((p) => p.id !== root.id)
      .map((p) => [
        p.id,
        p.id === handle?.part.id
          ? `The ${handleName} sets where your fingers pull, not how heavy the ${object} is. Watch what tips during ${bump}.`
          : `The ${p.name.toLowerCase()} is a small share of the ${object}'s weight. Watch what tips during ${bump}.`,
      ]),
  );
  return {
    id: "stand",
    title: `Stand the ${object}`,
    need: `The ${object} must not fall over when knocked, and must stay light enough to lift ${byHand}.`,
    primitive: "weight",
    produces,
    assemble: {
      piece: "Weight",
      title: `Set the weight on its base: it becomes the ${rootName}.`,
      built: `The ${rootName} now carries the ${object}'s weight down onto its base, ${Math.round(2 * s.halfBase)} mm across.`,
    },
    target: {
      label: root.name,
      at: add(footing.centre, vec(0, Math.min(s.com, 40), 0)),
      ring: { radius: Math.min(45, Math.max(6, 1.15 * s.halfBase)), axis: "y" },
    },
    fault: { primitive: "weight", slider: "mass", start: s.start, range: s.slider },
    fix: { window: s.window },
    tests: [bumpTest, liftTest],
    hints: {
      observe: `Run ${bump} and watch the ${object} tip about the edge of its base, the purple mark. It goes over.`,
      principle: `To fall over, its centre of mass has to rise over the edge of its base: ${fixed(s.rise, 1)} mm here. That takes its weight times the rise, and its weight is m × 9.8. A heavier ${object} takes more energy to knock over, but it is harder to lift.`,
      direction: `Raise the mass until tipping it takes more than the knock's ${KNOCK_J} J, and stop before it is too heavy to lift ${byHand}. Check ${bump} and ${lift} together.`,
      low: `Too light: the knock tips it over.`,
      high: handle ? `Too heavy: your wrist cannot hold it level by the ${handleName}.` : `Too heavy: one hand cannot lift it comfortably.`,
    },
    suspect: root.id,
    misses,
    missDefault: `That part is a small share of the ${object}'s weight. Watch what tips during ${bump}.`,
    uses: { weight: `The ${rootName}'s weight, low on its base. It keeps the ${object} up when knocked.` },
    task: "Find a weight that stands but still lifts.",
    why: `An object stays up as long as its centre of mass is above its base. Knocked, its centre of mass has to rise over the base edge before it falls, so a heavier object takes more energy to knock over. The same weight is what your hand has to lift${handle ? `, and by a ${handleName} it also twists your wrist, weight times the ${handleName}'s distance` : ""}.`,
    gameNote: `Game numbers: the knock gives ${KNOCK_J} J (a 50 g weight dropped 10 cm), ${handle ? `a wrist holds ${WRIST_NM} N·m steady` : `one hand lifts ${ONE_HAND_KG} kg comfortably`}. From the kit: the ${object} stands ${Math.round(s.height)} mm tall on a base ${Math.round(2 * s.halfBase)} mm across${handle ? `, and your fingers hold the ${handleName} ${Math.round(handle.reach)} mm from its middle` : ""}. Assumed: its weight acts at half its height over the middle of its base, as if it were evenly heavy, and the knock's energy all goes into tipping it. Energy = weight × rise is real.`,
    numbers: (v) => {
      const kg = massOf(v);
      const w = newtons(kg);
      return [
        { label: "Weight", value: `${kg} kg × 9.8 = ${w} N` },
        { label: "To tip it over", value: `${w} N × ${fixed(riseM, 4)} m = ${fixed(kg * G * riseM, 3)} J (the knock gives ${KNOCK_J} J)` },
        handle
          ? { label: "Wrist", value: `${w} N × ${fixed(reachM, 3)} m = ${fixed(kg * G * reachM, 2)} N·m (holds ${WRIST_NM} N·m)` }
          : { label: "Lift", value: `${kg} kg (one hand lifts ${ONE_HAND_KG} kg)` },
      ];
    },
  };
}
