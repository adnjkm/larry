// The explode as springs, one per assembly (anatomy's exploded views). The slider and every automatic
// explode only set a target; each assembly follows it on its own spring, started in turn so the
// outside part leaves first and comes home last. The stepping is pure, so verify.ts replays exactly
// the frames the screen shows.
import type { ExplodePlan, Shares } from "./model.ts";

/** Just under critical damping, so parts settle with a hint of weight; each assembly starts `staggerMs` after the one before. */
export const SPRING = { stiffness: 64, damping: 14.2, substeps: 4, staggerMs: 50 } as const;
/** A spring this close to its target, this slow, has arrived. */
const AT_REST = 1e-3;
/** An object counts as shut once every assembly is this close to home: under a millimetre on a bottle. */
const SHUT = 0.01;
/** The one spring an object without a plan comes apart on. */
export const WHOLE = "whole";

type Axle = { x: number; v: number; target: number; pending: { value: number; at: number } | null };
/** Every assembly's spring, in the plan's leaving order, and the springs' own clock in ms. */
export type Springs = { ms: number; ids: readonly string[]; axles: readonly Axle[] };

export const springsAt = (ids: readonly string[], value: number): Springs => ({ ms: 0, ids, axles: ids.map(() => ({ x: value, v: 0, target: value, pending: null })) });
export const idsOf = (plan: ExplodePlan | undefined): string[] => (plan ? plan.order.map((l) => l.id) : [WHOLE]);

/**
 * Sends every assembly toward `value`. Opening goes in leaving order and closing in reverse. Only the
 * assemblies whose target changes take a place in the stagger, so on a reversal the last one out is the
 * first one back, at once; one already scheduled the same way keeps its start. `jump` puts them there.
 */
export function aim(s: Springs, value: number, jump = false): Springs {
  if (jump) return { ...s, axles: s.axles.map(() => ({ x: value, v: 0, target: value, pending: null })) };
  const axles = s.axles.map((a) => ({ ...a }));
  const opening = value > (s.axles[0]!.pending?.value ?? s.axles[0]!.target);
  const order = opening ? axles : [...axles].reverse();
  let t = s.ms;
  for (const a of order) {
    if (a.target === value) {
      a.pending = null;
      continue;
    }
    const sameWay = a.pending !== null && Math.sign(a.pending.value - a.target) === Math.sign(value - a.target);
    a.pending = { value, at: sameWay ? Math.min(a.pending!.at, t) : t };
    t = a.pending.at + SPRING.staggerMs;
  }
  return { ...s, axles };
}

/** Moves the springs on by `dt` ms. */
export function step(s: Springs, dt: number): Springs {
  const ms = s.ms + dt;
  const h = dt / 1000 / SPRING.substeps;
  const axles = s.axles.map((a0) => {
    const a = { ...a0 };
    if (a.pending && a.pending.at <= ms) {
      a.target = a.pending.value;
      a.pending = null;
    }
    for (let i = 0; i < SPRING.substeps; i++) {
      a.v += (SPRING.stiffness * (a.target - a.x) - SPRING.damping * a.v) * h;
      a.x += a.v * h;
    }
    if (Math.abs(a.target - a.x) < AT_REST && Math.abs(a.v) < AT_REST) [a.x, a.v] = [a.target, 0];
    return a;
  });
  return { ms, ids: s.ids, axles };
}

export const resting = (s: Springs) => s.axles.every((a) => a.pending === null && a.x === a.target && a.v === 0);
/** How far out each assembly is. A spring's overshoot past home is dropped, so nothing sinks into what it sits on. */
export const sharesOf = (s: Springs): Shares => Object.fromEntries(s.ids.map((id, i) => [id, Math.max(0, s.axles[i]!.x)]));
const shut = (s: Springs) => s.axles.every((a) => a.pending === null && a.target === 0 && Math.abs(a.x) < SHUT);

/** Milliseconds until the springs, left alone, are shut. */
export function msUntilShut(s: Springs): number {
  let at = s;
  while (!shut(at) && at.ms - s.ms < 5000) at = step(at, 1000 / 120);
  return at.ms - s.ms;
}
