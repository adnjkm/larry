// Falling drops, their splash and the puddle they make, from the bottle's flip and spill. Scaled by
// `k`, the object's size over a hand-tall bottle's, so a small object drips small drops on the same timing.
import type { Shape } from "../../../shared/kit.ts";
import { clamp01 } from "../ease.ts";
import { type Mark, vec, type Vec } from "../model.ts";

const DEG = Math.PI / 180;

/** A drop's outline, round at the front and drawn out into a tail behind it, longer the faster it falls. */
const teardrop = (r: number, tail: number): Shape => ({
  kind: "lathe",
  profile: [[0, -1], [0.5, -0.87], [0.87, -0.5], [1, 0], [0.93, 0.4], [0.72, 0.8], [0.45, 0.8 + 0.5 * tail], [0.2, 0.8 + 0.85 * tail], [0, 0.8 + tail]].map(([x, y]) => ({ r: r * x!, y: r * y! })),
});
/** The puddle grows in whole steps, so its few sizes are each built once. */
const puddle = (radius: number): Shape => ({
  kind: "lathe",
  profile: [{ r: 0, y: 0 }, { r: radius, y: 0 }, { r: radius - 0.3, y: 0.8 }, { r: radius - 1.6, y: 1.4 }, { r: 0, y: 1.5 }],
});
const PUDDLE_GROW_MS = 260;
/** A drop hitting the ground throws up a ring that widens and thins, then soaks into the puddle. */
const CROWN_MS = 240;

export type Drop = { spawn: number; origin: Vec; vx: number; vy: number; vz: number };

export type Drops = {
  /** Millimetres per second squared: looks right on the object, not real gravity. */
  g: number;
  radius: number;
  /** Drops thrown from their origins and falling under `g`, each splashing where it lands into one puddle that spreads as they arrive. */
  marks: (drops: readonly Drop[], ms: number) => Mark[];
};

const made = new Map<number, Drops>();

export function dropsAt(k: number): Drops {
  const known = made.get(k);
  if (known) return known;
  const g = 900 * k;
  const radius = 5 * k;
  const drop = teardrop(radius, 0.9);
  const streak = teardrop(radius * 0.85, 1.9);
  /** Above this speed a drop is drawn stretched. */
  const streakSpeed = 380 * k;
  const crowns: Shape[] = [0, 1, 2, 3].map((i) => ({ kind: "torus", radius: (3.5 + 2.2 * i) * k, tube: (1.5 - 0.3 * i) * k, arcDegrees: 360 }));
  const flightOf = (d: Drop) => (d.vy + Math.sqrt(d.vy * d.vy + 2 * g * Math.max(0, d.origin.y - radius))) / g;
  const landOf = (d: Drop) => {
    const t = flightOf(d);
    return { ms: d.spawn + 1000 * t, x: d.origin.x + d.vx * t, z: d.origin.z + d.vz * t };
  };
  const puddles = new Map<number, Shape>();
  const marks = (drops: readonly Drop[], ms: number): Mark[] => {
    if (drops.length === 0) return [];
    const lands = drops.map(landOf);
    const middle = { x: lands.reduce((a, l) => a + l.x, 0) / lands.length, z: lands.reduce((a, l) => a + l.z, 0) / lands.length };
    const reach = Math.max(...lands.map((l) => Math.hypot(l.x - middle.x, l.z - middle.z)));
    const full = Math.min(40 * k, Math.max(9 * k, reach + 6 * k));
    const fallen = lands.reduce((a, l) => a + clamp01((ms - l.ms) / PUDDLE_GROW_MS), 0);
    const size = Math.round(full * Math.sqrt(fallen / lands.length));
    const shape = puddles.get(size) ?? puddle(size);
    puddles.set(size, shape);
    const pool: Mark[] = size >= 3 * k ? [{ id: "puddle", shape, at: vec(middle.x, 0.75, middle.z), ride: null }] : [];
    return [...pool, ...drops.flatMap((d, i): Mark[] => {
      const tau = (ms - d.spawn) / 1000;
      const land = lands[i]!;
      if (tau < 0) return [];
      if (ms < land.ms) {
        const vy = d.vy - g * tau;
        const fast = Math.hypot(d.vx, vy, d.vz) > streakSpeed;
        // The tail trails the way it came from.
        const lean = Math.atan2(d.vx, -vy) / DEG;
        const at = vec(d.origin.x + d.vx * tau, d.origin.y + d.vy * tau - 0.5 * g * tau * tau, d.origin.z + d.vz * tau);
        return [{ id: `drop-${i}`, shape: fast ? streak : drop, at, rotation: vec(0, 0, lean), ride: null }];
      }
      const c = Math.floor((ms - land.ms) / (CROWN_MS / crowns.length));
      const crown = crowns[c];
      return crown ? [{ id: `crown-${i}`, shape: crown, at: vec(land.x, 1.5 * k + (crown.kind === "torus" ? crown.tube : 0), land.z), ride: null }] : [];
    })];
  };
  const out = { g, radius, marks };
  made.set(k, out);
  return out;
}
