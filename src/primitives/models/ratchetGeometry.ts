// The ratchet's contact geometry: the toothed wheel and the pawl as outlines in the wheel's plane, and the pawl's angle
// solved from them. models/ratchet.ts draws exactly these outlines, so the solve and the picture cannot disagree.
//
// Millimetres relative to the wheel's centre, y up. The pawl hangs on the wheel's right with its nose in a notch at world
// angle 0. Winding turns the wheel clockwise (turn > 0 lifts the bucket hanging on the left); the bucket's weight turns
// it back anticlockwise, which pushes the holding tooth's cliff up into the underside of the nose. The pawl's pivot is
// above the nose and outside it, so that push turns the pawl further into the tooth: a backward load locks it.
import type { Pt } from "../parts.ts";

/** Root radius: the bottom of every notch. */
export const ROOT = 20;
/** Teeth are 0.8 of their pitch at the root tall, up to 7 mm: many teeth are small teeth. */
export const toothHeight = (n: number) => Math.min(7, (0.8 * 2 * Math.PI * ROOT) / n);
export const tipRadius = (n: number) => ROOT + toothHeight(n);
/** What is left of a tooth that has sheared off. */
export const STUMP = 1.5;
/** Straight pieces per ramp. */
const M = 6;

/** The pawl's inner face, 2 mm outside the biggest tooth tip, and its outer face. */
const BODY_IN = ROOT + 7 + 2;
const BODY_OUT = BODY_IN + 8;
/** Where the pawl turns: above the nose and outside it, so a backward push on the nose turns it further in. */
export const PIVOT: Pt = [BODY_IN + 4, 30];
/** The nose's upper face rises at this angle: below the steepest ramp (n = 24 rises about 39 degrees from level). */
const NOSE_DEG = 25;

/**
 * The pawl seated, pivot hole at PIVOT: a hook. Its nose's underside lies along y = 0, where the holding tooth's cliff
 * is when the wheel sits at a landing; its nose tip touches the root circle. Clockwise from the nose tip. Turning the
 * pawl inward (negative lift) would push the nose tip inside the root circle, so a lift of 0 is as low as it goes.
 */
export const PAWL: Pt[] = (() => {
  const noseTop = (BODY_IN - ROOT) * Math.tan((NOSE_DEG * Math.PI) / 180);
  const cap = Array.from({ length: 7 }, (_, i): Pt => {
    const a = Math.PI - (i * Math.PI) / 6;
    return [PIVOT[0] + 4 * Math.cos(a), PIVOT[1] + 4 * Math.sin(a)];
  });
  return [[ROOT, 0], [BODY_IN, noseTop], ...cap, [BODY_OUT, 0]];
})();

/** Lifted this far the pawl clears every tooth of every wheel. */
export const LIFT_CLEAR = 24;
/** Penetration up to this, in mm, counts as touching. */
export const TOUCH = 0.01;

const DEG = Math.PI / 180;

/** `p` turned `deg` degrees anticlockwise about `c`. */
export function turnAbout(p: Pt, deg: number, c: Pt = [0, 0]): Pt {
  const a = deg * DEG;
  const dx = p[0] - c[0];
  const dy = p[1] - c[1];
  return [c[0] + dx * Math.cos(a) - dy * Math.sin(a), c[1] + dx * Math.sin(a) + dy * Math.cos(a)];
}

/** The pawl outline at lift `psi` (degrees anticlockwise about the pivot; positive swings the nose out). */
export const pawlAt = (psi: number): Pt[] => PAWL.map((p) => turnAbout(p, psi, PIVOT));

/** The wheel's turn, in degrees anticlockwise, at `turn` whole turns of winding (winding is clockwise). */
export const wheelDeg = (turn: number) => -360 * turn;

/**
 * Cliffs stripped off a wheel, by cliff index j (cliff j stands at j x 360 / n degrees in the wheel's own frame). A run
 * that shears the teeth strips every cliff whose landing it is dragged back through.
 */
export type Stripped = (cliff: number) => boolean;
export const NONE: Stripped = () => false;

/** The wheel's outline in its own frame, anticlockwise: for each tooth j = 1..n a ramp from the root at cliff j - 1 up to cliff j. */
export function wheelOutline(n: number, stripped: Stripped = NONE): Pt[] {
  const step = (2 * Math.PI) / n;
  const h = toothHeight(n);
  const pts: Pt[] = [];
  for (let j = 1; j <= n; j++) {
    const from = (j - 1) * step;
    const cut = stripped(j % n);
    for (let s = 0; s <= M; s++) {
      const f = s / M;
      const r = ROOT + (cut ? Math.min(h * f, STUMP) : h * f);
      // The last point stops a hair short of the cliff, so the cliff is a clean radial edge down to the next root.
      const a = from + (s === M ? step - 1e-7 : f * step);
      pts.push([r * Math.cos(a), r * Math.sin(a)]);
    }
  }
  return pts;
}

// ---- Distances and containment ----

function distToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy || 1)));
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Ray casting: whether `p` is inside the closed polygon. */
export function inside(p: Pt, poly: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!;
    const [xj, yj] = poly[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** How far `p` is inside `poly` (0 when outside): the distance to its nearest edge. */
export function depthIn(p: Pt, poly: Pt[]): number {
  if (!inside(p, poly)) return 0;
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSegment(p, poly[j]!, poly[i]!));
  return d;
}

/** Points along a closed outline no more than `spacing` apart, corners included. */
export function densify(poly: Pt[], spacing: number): Pt[] {
  return poly.flatMap((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / spacing));
    return Array.from({ length: k }, (_, s): Pt => [a[0] + ((b[0] - a[0]) * s) / k, a[1] + ((b[1] - a[1]) * s) / k]);
  });
}

/** A wheel outline with a fast "how deep is this point inside" that only looks at the edges near the point's angle. */
export class Wheel {
  readonly n: number;
  readonly outline: Pt[];
  readonly tip: number;
  constructor(n: number, stripped: Stripped = NONE) {
    this.n = n;
    this.outline = wheelOutline(n, stripped);
    this.tip = tipRadius(n);
  }

  /** Depth of `p` (wheel frame) inside the wheel, 0 when outside. */
  depth(p: Pt): number {
    const r = Math.hypot(p[0], p[1]);
    if (r >= this.tip + 1e-9) return 0;
    const step = (2 * Math.PI) / this.n;
    const a = (Math.atan2(p[1], p[0]) + 2 * Math.PI) % (2 * Math.PI);
    const i = Math.floor(a / step) * (M + 1) + Math.min(M - 1, Math.floor(((a % step) / step) * M));
    const len = this.outline.length;
    // The edge the ray from the centre crosses decides inside or out; it and its neighbours (the cliffs) give the depth.
    const at = (k: number) => this.outline[((k % len) + len) % len]!;
    let crossR = Infinity;
    let d = Infinity;
    for (let k = i - M - 2; k <= i + M + 2; k++) {
      const a0 = at(k);
      const b0 = at(k + 1);
      d = Math.min(d, distToSegment(p, a0, b0));
      // Where the ray at angle a meets this edge, if it does.
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const ex = b0[0] - a0[0];
      const ey = b0[1] - a0[1];
      const den = ux * ey - uy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (a0[0] * ey - a0[1] * ex) / den;
      const s = (a0[0] * uy - a0[1] * ux) / den;
      if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) crossR = Math.min(crossR, t);
    }
    return r < crossR ? d : 0;
  }
}

/** Pawl outline points 0.3 mm apart, seated frame, made once. */
const PAWL_POINTS = densify(PAWL, 0.3);

/** Whether wheel-frame angle `a` lies in the half turn anticlockwise from `from` (radians). */
const ahead = (a: number, from: number) => (((a - from) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI) < Math.PI;

/**
 * How far the pawl at lift `psi` and the wheel at `turn` cut into each other, in mm: the deepest pawl point inside the
 * wheel, or wheel corner inside the pawl. 0 means apart or just touching. With `from` (a wheel-frame angle, radians),
 * only the wheel within the half turn anticlockwise of it counts: the material on the ramp side of a cliff.
 */
export function penetration(wheel: Wheel, turn: number, psi: number, from?: number): number {
  const counts = (q: Pt) => from === undefined || ahead(Math.atan2(q[1], q[0]), from);
  // Pawl frame to wheel frame: turn by psi about the pivot, then undo the wheel's turn about the centre.
  const [c1, s1] = [Math.cos(psi * DEG), Math.sin(psi * DEG)];
  const [c2, s2] = [Math.cos(-wheelDeg(turn) * DEG), Math.sin(-wheelDeg(turn) * DEG)];
  const reach2 = wheel.tip * wheel.tip;
  let worst = 0;
  for (const [qx, qy] of PAWL_POINTS) {
    const dx = qx - PIVOT[0];
    const dy = qy - PIVOT[1];
    const wx = PIVOT[0] + dx * c1 - dy * s1;
    const wy = PIVOT[1] + dx * s1 + dy * c1;
    if (wx * wx + wy * wy >= reach2) continue;
    const p: Pt = [wx * c2 - wy * s2, wx * s2 + wy * c2];
    if (counts(p)) worst = Math.max(worst, wheel.depth(p));
  }
  // A sharp tooth tip can poke into the pawl between its sample points: test the wheel's corners against the pawl too.
  const pawl = pawlAt(psi);
  for (const c of wheel.outline) {
    // Wheel frame to world: the inverse of the turn above.
    const w: Pt = [c[0] * c2 + c[1] * s2, -c[0] * s2 + c[1] * c2];
    if (w[0] < ROOT - 1 || w[1] < -12 || w[1] > 40 || !counts(c)) continue;
    worst = Math.max(worst, depthIn(w, pawl));
  }
  return worst;
}

/** The smallest lift in [lo, hi] at which `cutting` stops, given it cuts at lo and not at hi. */
function firstClear(cutting: (psi: number) => boolean, lo: number, hi: number): number {
  while (hi - lo > 1e-5) {
    const mid = (lo + hi) / 2;
    if (cutting(mid)) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * The pawl's resting lift: the spring turns it in until it meets the wheel.
 * - 0 is as low as it goes (nose tip on the root circle): at a landing it sits there, held between root and cliff.
 * - Past a landing, the ramp that starts at that cliff pushes the nose out: the lift that just clears that ramp, if the
 *   tooth below lets it sit there. Solving the ramp on its own finds the narrow gap the nose drops into right after a
 *   click, which a coarse scan would step over.
 * - Otherwise the nose is on a tooth's tip: scan up to the first lift clear of everything and refine by bisection.
 */
export function restingLift(wheel: Wheel, turn: number): number {
  const cuts = (psi: number, from?: number) => penetration(wheel, turn, psi, from) > TOUCH;
  if (!cuts(0)) return 0;
  const step = (2 * Math.PI) / wheel.n;
  const cliff = Math.floor(turn * wheel.n + 1e-9) * step;
  if (cuts(0, cliff)) {
    let hi = 1;
    while (cuts(hi, cliff)) hi += 1;
    const onRamp = firstClear((psi) => cuts(psi, cliff), hi - 1, hi);
    if (!cuts(onRamp)) return onRamp;
  }
  const SCAN = 0.5;
  let lo = 0;
  let hi = SCAN;
  while (cuts(hi)) {
    lo = hi;
    hi += SCAN;
    if (hi > LIFT_CLEAR + 10) throw new Error(`the pawl never clears the wheel at turn ${turn}`);
  }
  return firstClear(cuts, lo, hi);
}
